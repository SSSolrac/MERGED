import { useAuth as useUnifiedAuth } from '../../context/AuthContext';
import { getSupabaseConfigStatus } from '@/lib/supabase';

export const useAuth = () => {
  const auth = useUnifiedAuth();

  return {
    user: auth.user,
    bootstrapping: auth.isLoading,
    bootstrapError: auth.error || '',
    backend: getSupabaseConfigStatus(),
    login: async (email: string, password: string) => {
      await auth.signIn({ email, password });
    },
    logout: auth.signOut,
  };
};
