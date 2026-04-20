/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getSession,
  login,
  logout,
  onAuthStateChange,
  requestPasswordReset,
  signup,
  updatePassword,
} from "../services/authService";
import { getProfileForUser, normalizeAppRole } from "../services/auth/getCurrentUserRole";
import { recordStaffOwnerLogout } from "../services/auth/loginAuditService";
import { clearAllSessionData } from "../services/sessionService";
import { requireSupabaseClient } from "../lib/supabase";

const AuthContext = createContext(null);

function hasPasswordRecoveryParams() {
  if (typeof window === "undefined") return false;

  const search = String(window.location.search || "");
  const hash = String(window.location.hash || "");
  return search.includes("type=recovery") || hash.includes("type=recovery");
}

async function getProfileForSession(session) {
  if (!session?.user) return null;
  return getProfileForUser(session.user);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState("loading"); // loading | no_session | authenticated | invalid_session | backend_unavailable
  const [authError, setAuthError] = useState("");
  const [isRecoveryMode, setIsRecoveryMode] = useState(() => hasPasswordRecoveryParams());

  useEffect(() => {
    let cancelled = false;
    let localSession = null;

    const restore = async () => {
      setIsLoading(true);
      setAuthError("");
      setSessionStatus("loading");
      try {
        const supabase = requireSupabaseClient();
        const local = await supabase.auth.getSession();
        localSession = local?.data?.session || null;
        const hadLocalSession = Boolean(localSession);

        const restored = await getSession();
        if (cancelled) return;

        const restoredProfile = restored?.user ? await getProfileForSession(restored) : null;
        if (cancelled) return;

        setSession(restored);
        setProfile(restoredProfile);
        setIsRecoveryMode(hasPasswordRecoveryParams());
        if (restored?.user) {
          setSessionStatus("authenticated");
        } else if (hadLocalSession) {
          setSessionStatus("invalid_session");
          setAuthError("Your session expired. Please sign in again.");
        } else {
          setSessionStatus("no_session");
        }
      } catch (error) {
        if (cancelled) return;
        if (error?.kind === "backend_unavailable") {
          setSession((prev) => prev || localSession || null);
          setSessionStatus("backend_unavailable");
          setAuthError(error?.message || "Supabase is unavailable. We'll keep your session for now.");
        } else {
          setSession(null);
          setProfile(null);
          setSessionStatus("backend_unavailable");
          setAuthError(error?.message || "Unable to reach Supabase to validate your session.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    restore();

    const subscription = onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
      }

      if (event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
        setAuthError("");
        setSessionStatus("no_session");
        setIsRecoveryMode(false);
        return;
      }

      if (!nextSession?.user) {
        setSession(null);
        setProfile(null);
        setSessionStatus("no_session");
        return;
      }

      // Treat auth state changes as untrusted until validated with the backend.
      void (async () => {
        try {
          const validated = await getSession();
          if (cancelled) return;
          const nextProfile = validated?.user ? await getProfileForSession(validated) : null;
          if (cancelled) return;

          setSession(validated);
          setProfile(nextProfile);
          if (validated?.user) {
            setAuthError("");
            setSessionStatus("authenticated");
          } else {
            setProfile(null);
            setSessionStatus("invalid_session");
            setAuthError("Your session expired. Please sign in again.");
          }
        } catch (err) {
          if (cancelled) return;
          if (err?.kind === "backend_unavailable") {
            setSession((prev) => prev || null);
            setSessionStatus("backend_unavailable");
            setAuthError(err?.message || "Supabase is unavailable. We'll retry automatically.");
          } else {
            setSession(null);
            setProfile(null);
            setSessionStatus("backend_unavailable");
            setAuthError(err?.message || "Unable to validate your session right now.");
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe?.();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null);
      return null;
    }

    const next = await getProfileForSession(session);
    setProfile(next);
    return next;
  }, [session]);

  const isAuthenticated = Boolean(session?.user);
  const role = profile ? normalizeAppRole(profile.role, null) : null;

  const user = useMemo(() => {
    if (!session?.user) return null;

    const authUser = session.user;
    const fallbackName = authUser.user_metadata?.name || authUser.user_metadata?.full_name || "";
    const name = profile?.name || fallbackName || "";

    return {
      id: authUser.id,
      email: authUser.email || "",
      name,
      role: profile ? normalizeAppRole(profile.role, null) : null,
      customerCode: profile?.customerCode ?? null,
      jobTitle: profile?.jobTitle || "",
      avatar: profile?.avatarUrl || "",
    };
  }, [profile, session?.user]);

  const signIn = useCallback(async ({ email, password }) => {
    setAuthError("");
    setIsRecoveryMode(false);
    const result = await login({ email, password });
    if (result?.session) setSession(result.session);
    if (result?.profile) setProfile(result.profile);
    return result;
  }, []);

  const signUp = useCallback(async ({ name, phone, email, password }) => {
    setAuthError("");
    setIsRecoveryMode(false);
    await signup({ name, phone, email, password });
  }, []);

  const sendPasswordReset = useCallback(async ({ email, redirectTo }) => {
    setAuthError("");
    await requestPasswordReset({ email, redirectTo });
  }, []);

  const confirmPasswordReset = useCallback(async ({ password }) => {
    setAuthError("");
    const user = await updatePassword({ password });
    setIsRecoveryMode(false);
    return user;
  }, []);

  const signOut = useCallback(async () => {
    setAuthError("");
    try {
      await recordStaffOwnerLogout(profile);
      await logout();
    } finally {
      clearAllSessionData();
      setProfile(null);
      setSession(null);
      setIsRecoveryMode(false);
    }
  }, [profile]);

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      role,
      isAuthenticated,
      canAccessAccount: isAuthenticated,
      isLoading,
      loading: isLoading,
      sessionStatus,
      error: authError,
      isRecoveryMode,
      login: signIn,
      logout: signOut,
      signup: signUp,
      signIn,
      signUp,
      sendPasswordReset,
      confirmPasswordReset,
      signOut,
      refreshProfile,
    }),
    [
      authError,
      confirmPasswordReset,
      isAuthenticated,
      isLoading,
      isRecoveryMode,
      profile,
      role,
      refreshProfile,
      sendPasswordReset,
      session,
      sessionStatus,
      signIn,
      signOut,
      signUp,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
