import { normalizeError, AppError } from '@/lib/errors';
import { mapUserRole } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';
import { loginHistoryService } from '@/services/loginHistoryService';
import type { SessionUser } from '@/types/user';

const buildSessionUser = (params: { userId: string; email: string; name: string; role: SessionUser['role'] }): SessionUser => ({
  id: params.userId,
  name: params.name,
  email: params.email,
  role: params.role,
});

const fetchProfileForUserId = async (userId: string) => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load your profile.' });
  if (!data) {
    throw new AppError({
      category: 'schema',
      message: 'Profile row missing for this user. Ensure the profiles table is populated for authenticated users.',
    });
  }
  return data;
};

export const authService = {
  async login(email: string, password: string): Promise<SessionUser> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) throw normalizeError(error, { fallbackMessage: 'Invalid email or password.' });
    const user = data.user;
    if (!user) throw new Error('Unable to sign in.');

    const profile = await fetchProfileForUserId(user.id);
    const role = mapUserRole(profile.role);

    if (role !== 'owner' && role !== 'staff') {
      try {
        await supabase.auth.signOut();
      } catch {}
      throw new Error('This account is not allowed to access Staffowner.');
    }

    // Best-effort login audit log (canonical schema: public.login_history).
    try {
      await loginHistoryService.recordLogin({
        userId: user.id,
        email: String(profile.email ?? user.email ?? ''),
        role,
      });
    } catch {}

    return buildSessionUser({
      userId: user.id,
      email: String(profile.email ?? user.email ?? ''),
      name: String(profile.name ?? user.user_metadata?.name ?? user.email ?? ''),
      role,
    });
  },

  async logout(): Promise<void> {
    const supabase = requireSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to sign out.' });
  },

  async getCurrentUser(): Promise<SessionUser | null> {
    const supabase = requireSupabaseClient();
    // Important: use getUser() (server-validated) rather than getSession() (local cache),
    // so stale local sessions don't survive backend/session validation failures.
    const { data, error } = await supabase.auth.getUser();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to restore session.' });
    const user = data.user;
    if (!user) return null;

    const profile = await fetchProfileForUserId(user.id);
    const role = mapUserRole(profile.role);
    if (role !== 'owner' && role !== 'staff') {
      try {
        await supabase.auth.signOut();
      } catch {}
      return null;
    }

    return buildSessionUser({
      userId: user.id,
      email: String(profile.email ?? user.email ?? ''),
      name: String(profile.name ?? user.user_metadata?.name ?? user.email ?? ''),
      role,
    });
  },

  async updatePassword(newPassword: string): Promise<void> {
    const nextPassword = newPassword.trim();
    if (nextPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const supabase = requireSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to update password.' });
  },
};
