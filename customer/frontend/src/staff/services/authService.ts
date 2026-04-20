import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

export const authService = {
  async updatePassword(newPassword: string): Promise<void> {
    const nextPassword = newPassword.trim();
    if (nextPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const supabase = requireSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw normalizeError(authError, { fallbackMessage: 'Unable to verify your account permissions.' });
    if (!authData.user?.id) throw new Error('You must be signed in to update your password.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) throw normalizeError(profileError, { fallbackMessage: 'Unable to verify your account permissions.' });
    if (String(profile?.role || '').trim().toLowerCase() !== 'owner') {
      throw new Error('Only owners can change staff-side passwords.');
    }

    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to update password.' });
  },
};
