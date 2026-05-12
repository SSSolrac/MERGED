import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import RequireAuth from "./RequireAuth";
import { useAuth } from "../context/AuthContext";
import { getSafeRouteForRole, roleCanAccess } from "./roleRoutes";

export default function RequireRole({ roles, children }) {
  const { role, isAuthenticated, isLoading, sessionStatus, error, refreshProfile } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (!location.pathname.startsWith("/staff") && !location.pathname.startsWith("/owner")) return;

    void refreshProfile?.().catch(() => {
      // Route guards already handle stale or missing role state gracefully.
    });
  }, [isAuthenticated, isLoading, location.pathname, refreshProfile]);

  return (
    <RequireAuth>
      {isLoading ? (
        <div style={{ padding: 24 }}>Loading session...</div>
      ) : isAuthenticated && !role ? (
        <div style={{ padding: 24, color: "#a11" }}>
          {sessionStatus === "backend_unavailable"
            ? error || "Unable to confirm your account role right now. Please try again."
            : "Unable to confirm your account role. Please sign out and sign in again."}
        </div>
      ) : roleCanAccess(role, roles) ? (
        children
      ) : (
        <Navigate to={getSafeRouteForRole(role)} replace />
      )}
    </RequireAuth>
  );
}
