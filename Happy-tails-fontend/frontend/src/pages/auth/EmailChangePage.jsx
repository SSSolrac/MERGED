import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getSafeRouteForRole } from "../../auth/roleRoutes";
import { buildAuthActionErrorMessage, clearAuthRedirectState, isAuthActionLink, readAuthRedirectState } from "../../lib/authRedirects";
import { completeAuthActionFromRedirect } from "../../services/authService";
import "./AuthActionPage.css";

export default function EmailChangePage() {
  const { role, refreshProfile, refreshSession } = useAuth();
  const [redirectState] = useState(() => readAuthRedirectState());
  const [status, setStatus] = useState(() => (isAuthActionLink(redirectState) ? "verifying" : "idle"));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const returnPath = useMemo(() => (role === "owner" ? "/owner/profile" : getSafeRouteForRole(role)), [role]);

  useEffect(() => {
    let cancelled = false;

    const resolveEmailChange = async () => {
      if (!isAuthActionLink(redirectState)) {
        setStatus("idle");
        return;
      }

      if (redirectState.type && redirectState.type !== "email_change") {
        clearAuthRedirectState();
        setStatus("invalid");
        setError("This link is for a different account action. Return to your profile and request a new email change confirmation.");
        return;
      }

      try {
        setStatus("verifying");
        setError("");
        const result = await completeAuthActionFromRedirect({
          expectedType: "email_change",
          redirectState,
        });

        if (cancelled) return;

        const syncedUser = (await refreshSession?.().catch(() => null)) || result?.user || null;
        await refreshProfile?.().catch(() => null);

        if (syncedUser?.pendingEmail) {
          setMessage(
            `Confirmation received. If secure email change is enabled in Supabase, finish the remaining confirmation step for ${syncedUser.pendingEmail}.`
          );
        } else if (syncedUser?.email) {
          setMessage(`Email updated successfully. Your account now uses ${syncedUser.email}.`);
        } else {
          setMessage("Email change confirmed successfully.");
        }
        setStatus("success");
      } catch (authError) {
        if (cancelled) return;
        setStatus("invalid");
        setError(buildAuthActionErrorMessage(authError, "email_change"));
      } finally {
        clearAuthRedirectState();
      }
    };

    void resolveEmailChange();

    return () => {
      cancelled = true;
    };
  }, [redirectState, refreshProfile, refreshSession]);

  return (
    <div className="auth-action-page">
      <section className="auth-action-card">
        <h1>Confirm Email Change</h1>
        <p>
          {status === "success"
            ? "Your account email confirmation has been processed."
            : status === "idle"
              ? "Open the confirmation link sent to your new email address to finish the change here."
              : "We're verifying your secure email change link."}
        </p>

        {error ? <p className="auth-action-feedback auth-action-feedback--error">{error}</p> : null}
        {message ? <p className="auth-action-feedback auth-action-feedback--success">{message}</p> : null}

        <div className="auth-action-actions">
          <Link className="auth-action-primary" to={returnPath}>
            Return to profile
          </Link>
          <Link className="auth-action-secondary" to="/">
            Go to homepage
          </Link>
        </div>

        <p className="auth-action-note">
          If the link expires or you change your mind, go back to your owner profile and request a new confirmation email.
        </p>
      </section>
    </div>
  );
}
