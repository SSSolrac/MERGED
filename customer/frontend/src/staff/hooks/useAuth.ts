import { useAuth as useUnifiedAuth } from '../../context/AuthContext';
import { getSupabaseConfigStatus } from '@/lib/supabase';

export const useAuth = () => {
  const auth = useUnifiedAuth();

  return {
    user: auth.user,
    profile: auth.profile,
    bootstrapping: auth.isLoading,
    bootstrapError: auth.error || '',
    backend: getSupabaseConfigStatus(),
    refreshProfile: auth.refreshProfile,
    login: async (email: string, password: string) => {
      await auth.signIn({ email, password });
    },
    logout: auth.signOut,
  };
};
