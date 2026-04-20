/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { getSupabaseClient, requireSupabaseClient } from "../lib/supabase";

const AuthContext = createContext(null);

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

  const isMountedRef = useRef(true);
  const sessionRef = useRef(null);
  const profileRef = useRef(null);
  const syncPromiseRef = useRef(null);
  const lastSyncOutcomeRef = useRef("loading");

  const assignSession = useCallback((nextSession) => {
    sessionRef.current = nextSession || null;
    setSession(nextSession || null);
  }, []);

  const assignProfile = useCallback((nextProfile) => {
    profileRef.current = nextProfile || null;
    setProfile(nextProfile || null);
  }, []);

  const applyAuthenticatedState = useCallback(
    (nextSession, nextProfile) => {
      assignSession(nextSession);
      assignProfile(nextProfile);
      setAuthError("");
      setSessionStatus("authenticated");
      lastSyncOutcomeRef.current = "authenticated";
    },
    [assignProfile, assignSession]
  );

  const clearResolvedState = useCallback(
    ({ status = "no_session", error = "" } = {}) => {
      assignSession(null);
      assignProfile(null);
      setSessionStatus(status);
      setAuthError(error);
      lastSyncOutcomeRef.current = status;
    },
    [assignProfile, assignSession]
  );

  const refreshProfile = useCallback(
    async (sessionOverride = sessionRef.current) => {
      if (!sessionOverride?.user) {
        assignProfile(null);
        return null;
      }

      const nextProfile = await getProfileForSession(sessionOverride);
      if (!isMountedRef.current) return nextProfile;

      applyAuthenticatedState(sessionOverride, nextProfile);
      return nextProfile;
    },
    [applyAuthenticatedState, assignProfile]
  );

  const syncSessionState = useCallback(
    async ({ showLoading = false } = {}) => {
      if (syncPromiseRef.current) return syncPromiseRef.current;
      if (showLoading) setIsLoading(true);

      const task = (async () => {
        try {
          const nextSession = await getSession();
          if (!isMountedRef.current) return nextSession;

          if (!nextSession?.user) {
            clearResolvedState({ status: "no_session", error: "" });
            return null;
          }

          const nextProfile = await getProfileForSession(nextSession);
          if (!isMountedRef.current) return nextSession;

          applyAuthenticatedState(nextSession, nextProfile);
          return nextSession;
        } catch (error) {
          if (!isMountedRef.current) return null;

          if (error?.kind === "backend_unavailable") {
            setSessionStatus("backend_unavailable");
            setAuthError(error?.message || "Supabase is unavailable. We'll retry automatically.");
            lastSyncOutcomeRef.current = "backend_unavailable";
            return sessionRef.current;
          }

          clearResolvedState({
            status: "backend_unavailable",
            error: error?.message || "Unable to validate your session right now.",
          });
          return null;
        } finally {
          syncPromiseRef.current = null;
          if (isMountedRef.current && showLoading) setIsLoading(false);
        }
      })();

      syncPromiseRef.current = task;
      return task;
    },
    [applyAuthenticatedState, clearResolvedState]
  );

  useEffect(() => {
    let cancelled = false;
    isMountedRef.current = true;

    const restore = async () => {
      setIsLoading(true);
      setAuthError("");
      setSessionStatus("loading");

      try {
        const supabase = requireSupabaseClient();
        const local = await supabase.auth.getSession();
        const hadLocalSession = Boolean(local?.data?.session);
        const restored = await syncSessionState();

        if (cancelled) return;

        if (restored?.user) {
          setSessionStatus("authenticated");
          setAuthError("");
        } else if (hadLocalSession) {
          clearResolvedState({
            status: "invalid_session",
            error: "Your session expired. Please sign in again.",
          });
        } else if (lastSyncOutcomeRef.current !== "backend_unavailable" && sessionRef.current?.user == null) {
          clearResolvedState({ status: "no_session", error: "" });
        }
      } catch (error) {
        if (cancelled) return;

        if (error?.kind === "backend_unavailable") {
          setSessionStatus("backend_unavailable");
          setAuthError(error?.message || "Supabase is unavailable. We'll keep your session for now.");
          lastSyncOutcomeRef.current = "backend_unavailable";
        } else {
          clearResolvedState({
            status: "backend_unavailable",
            error: error?.message || "Unable to reach Supabase to validate your session.",
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void restore();

    const subscription = onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      if (event === "INITIAL_SESSION") {
        return;
      }

      if (event === "SIGNED_OUT" || !nextSession?.user) {
        clearResolvedState({ status: "no_session", error: "" });
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        assignSession(nextSession);
        setSessionStatus("authenticated");
        setAuthError("");

        if (!profileRef.current || profileRef.current.id !== nextSession.user.id) {
          void refreshProfile(nextSession).catch(() => {
            // Keep the current role until the next background refresh succeeds.
          });
        }
        return;
      }

      if (
        event !== "USER_UPDATED" &&
        sessionRef.current?.access_token &&
        sessionRef.current.access_token === nextSession.access_token &&
        profileRef.current?.id === nextSession.user.id
      ) {
        assignSession(nextSession);
        setSessionStatus("authenticated");
        setAuthError("");
        return;
      }

      void syncSessionState();
    });

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      subscription?.unsubscribe?.();
    };
  }, [assignSession, clearResolvedState, refreshProfile, syncSessionState]);

  useEffect(() => {
    if (!session?.user?.id) return undefined;

    const refreshInBackground = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshProfile().catch(() => {
        // Keep the last confirmed role/profile visible if a background refresh fails.
      });
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      refreshInBackground();
    };

    window.addEventListener("focus", refreshInBackground);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshInBackground);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshProfile, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return undefined;

    const { client } = getSupabaseClient();
    if (!client) return undefined;

    const channel = client
      .channel(`profiles:self:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${session.user.id}`,
        },
        () => {
          void refreshProfile().catch(() => {
            // Realtime is best-effort; fall back to focus/refresh checks if this fails.
          });
        }
      );

    channel.subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [refreshProfile, session?.user?.id]);

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
      pendingEmail: authUser.new_email || "",
      emailChangeSentAt: authUser.email_change_sent_at || "",
      name,
      role: profile ? normalizeAppRole(profile.role, null) : null,
      customerCode: profile?.customerCode ?? null,
      jobTitle: profile?.jobTitle || "",
      avatar: profile?.avatarUrl || "",
    };
  }, [profile, session?.user]);

  const signIn = useCallback(
    async ({ email, password }) => {
      setAuthError("");
      const result = await login({ email, password });
      if (result?.session && result?.profile) applyAuthenticatedState(result.session, result.profile);
      return result;
    },
    [applyAuthenticatedState]
  );

  const signUp = useCallback(async ({ name, phone, email, password }) => {
    setAuthError("");
    await signup({ name, phone, email, password });
  }, []);

  const sendPasswordReset = useCallback(async ({ email, redirectTo }) => {
    setAuthError("");
    await requestPasswordReset({ email, redirectTo });
  }, []);

  const confirmPasswordReset = useCallback(
    async ({ password }) => {
      setAuthError("");
      const updatedUser = await updatePassword({ password });
      await syncSessionState();
      return updatedUser;
    },
    [syncSessionState]
  );

  const refreshSession = useCallback(async () => {
    const nextSession = await syncSessionState();
    return nextSession?.user || null;
  }, [syncSessionState]);

  const signOut = useCallback(async () => {
    setAuthError("");
    try {
      await recordStaffOwnerLogout(profileRef.current);
      await logout();
    } finally {
      clearAllSessionData();
      clearResolvedState({ status: "no_session", error: "" });
    }
  }, [clearResolvedState]);

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
      login: signIn,
      logout: signOut,
      signup: signUp,
      signIn,
      signUp,
      sendPasswordReset,
      confirmPasswordReset,
      signOut,
      refreshProfile,
      refreshSession,
    }),
    [
      authError,
      confirmPasswordReset,
      isAuthenticated,
      isLoading,
      profile,
      refreshProfile,
      refreshSession,
      role,
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
