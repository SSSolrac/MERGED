import { buildPublicAppUrl } from '../../lib/appUrl';
import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

const requireOwnerAccount = async (deniedMessage: string) => {
  const supabase = requireSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw normalizeError(authError, { fallbackMessage: 'Unable to verify your account permissions.' });
  if (!authData.user?.id) throw new Error('You must be signed in to update your account.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) throw normalizeError(profileError, { fallbackMessage: 'Unable to verify your account permissions.' });
  if (String(profile?.role || '').trim().toLowerCase() !== 'owner') {
    throw new Error(deniedMessage);
  }

  return {
    supabase,
    user: authData.user,
  };
};

export const authService = {
  async updatePassword(newPassword: string): Promise<void> {
    const nextPassword = newPassword.trim();
    if (nextPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const { supabase } = await requireOwnerAccount('Only owners can change staff-side passwords.');

    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to update password.' });
  },

  async updateEmail(newEmail: string) {
    const nextEmail = newEmail.trim().toLowerCase();
    if (!nextEmail) {
      throw new Error('Enter the new email address you want to use.');
    }

    const { supabase, user } = await requireOwnerAccount('Only owners can change staff-side email addresses.');
    if (String(user.email || '').trim().toLowerCase() === nextEmail) {
      throw new Error('That email is already active on this owner account.');
    }

    const { data, error } = await supabase.auth.updateUser(
      { email: nextEmail },
      {
        emailRedirectTo: buildPublicAppUrl('/auth/email-change'),
      }
    );
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to update your email.' });
    return data.user ?? null;
  },
};
