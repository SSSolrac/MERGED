import { createContext, useEffect, useMemo, useState } from 'react';
import { authService } from '@/services/authService';
import { loginHistoryService } from '@/services/loginHistoryService';
import { getSupabaseConfigStatus, type SupabaseConfigStatus } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/errors';
import { getBrowserLocalStorage, loadSessionUser, persistSessionUser } from '@/auth/sessionPersistence';
import type { SessionUser } from '@/types/user';

interface AuthContextType {
  user: SessionUser | null;
  bootstrapping: boolean;
  bootstrapError: string;
  backend: SupabaseConfigStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const backend = useMemo(() => getSupabaseConfigStatus(), []);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState('');

  const [user, setUser] = useState<SessionUser | null>(() => loadSessionUser(getBrowserLocalStorage()));

  const persistUser = (next: SessionUser | null) => {
    persistSessionUser(getBrowserLocalStorage(), next);
  };

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setBootstrapping(true);
      setBootstrapError('');

      try {
        const current = await authService.getCurrentUser();
        if (cancelled) return;
        setUser(current);
        persistUser(current);
      } catch (error) {
        // Never keep stale local auth if backend/session validation fails.
        if (cancelled) return;
        setUser(null);
        persistUser(null);
        setBootstrapError(getErrorMessage(error, 'Unable to validate session.'));
      } finally {
        if (cancelled) return;
        setBootstrapping(false);
      }
    };

    void bootstrap();
    return () => { cancelled = true; };
  }, []);

  const login = async (email: string, password: string) => {
    setBootstrapError('');
    const session = await authService.login(email, password);
    setUser(session);
    persistUser(session);
  };

  const logout = async () => {
    setBootstrapError('');
    try {
      if (user?.id) {
        await loginHistoryService.recordLogout({ userId: user.id });
      }
      await authService.logout();
    } catch (error) {
      // Treat logout failures as non-fatal: local auth must still be cleared.
      console.warn('Logout failed', error);
    } finally {
      setUser(null);
      persistUser(null);
    }
  };

  const value = useMemo(() => ({ user, bootstrapping, bootstrapError, backend, login, logout }), [user, bootstrapping, bootstrapError, backend]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
