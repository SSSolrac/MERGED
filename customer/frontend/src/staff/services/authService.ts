import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

export const authService = {
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
