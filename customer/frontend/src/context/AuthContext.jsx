/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSession, login, logout, onAuthStateChange, signup } from "../services/authService";
import { getCustomerProfile } from "../services/profileService";
import { clearAllSessionData } from "../services/sessionService";
import { requireSupabaseClient } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState("loading"); // loading | no_session | authenticated | invalid_session | backend_unavailable
  const [authError, setAuthError] = useState("");

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

        setSession(restored);
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

      if (event === "SIGNED_OUT") {
        setSession(null);
        setProfile(null);
        setAuthError("");
        setSessionStatus("no_session");
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
          setSession(validated);
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

    const next = await getCustomerProfile();
    setProfile(next);
    return next;
  }, [session?.user]);

  useEffect(() => {
    let cancelled = false;
    const userId = session?.user?.id || "";

    const loadProfile = async () => {
      if (!userId) {
        setProfile(null);
        return;
      }

      try {
        const next = await getCustomerProfile();
        if (!cancelled) setProfile(next);
      } catch {
        if (!cancelled) setProfile(null);
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const isAuthenticated = Boolean(session?.user);

  const user = useMemo(() => {
    if (!session?.user) return null;

    const authUser = session.user;
    const fallbackName = authUser.user_metadata?.name || authUser.user_metadata?.full_name || "";
    const name = profile?.name || fallbackName || "";

    return {
      id: authUser.id,
      email: authUser.email || "",
      name,
      role: "customer",
      customerCode: profile?.customerCode ?? null,
    };
  }, [profile, session?.user]);

  const signIn = useCallback(async ({ email, password }) => {
    setAuthError("");
    await login({ email, password });
  }, []);

  const signUp = useCallback(async ({ name, email, password }) => {
    setAuthError("");
    await signup({ name, email, password });
  }, []);

  const signOut = useCallback(async () => {
    setAuthError("");
    try {
      await logout();
    } finally {
      clearAllSessionData();
      setProfile(null);
      setSession(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      isAuthenticated,
      canAccessAccount: isAuthenticated,
      isLoading,
      sessionStatus,
      error: authError,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [authError, isAuthenticated, isLoading, profile, refreshProfile, session, sessionStatus, signIn, signOut, signUp, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
