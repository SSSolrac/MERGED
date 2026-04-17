import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth({ children }) {
  const location = useLocation();
  const { isAuthenticated, isLoading, error, sessionStatus } = useAuth();

  if (isLoading) return <div style={{ padding: 24 }}>Loading session...</div>;

  if (!isAuthenticated) {
    if (sessionStatus === "backend_unavailable") {
      return <div style={{ padding: 24, color: "#a11" }}>{error || "Supabase is unavailable. Please try again later."}</div>;
    }
    if (sessionStatus === "invalid_session") {
      return <div style={{ padding: 24, color: "#a11" }}>{error || "Your session expired. Please sign in again."}</div>;
    }
    return <Navigate to="/" replace state={{ openAuth: true, from: location.pathname }} />;
  }

  return children;
}
