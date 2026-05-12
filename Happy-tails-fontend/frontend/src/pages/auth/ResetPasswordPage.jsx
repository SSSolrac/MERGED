import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { clearAuthRedirectState, buildAuthActionErrorMessage, isAuthActionLink, readAuthRedirectState } from "../../lib/authRedirects";
import { completeAuthActionFromRedirect } from "../../services/authService";
import "./AuthActionPage.css";

export default function ResetPasswordPage() {
  const { confirmPasswordReset, refreshSession } = useAuth();
  const [redirectState] = useState(() => readAuthRedirectState());
  const [status, setStatus] = useState(() => (isAuthActionLink(redirectState) ? "verifying" : "request_new"));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolveResetLink = async () => {
      if (!isAuthActionLink(redirectState)) {
        setStatus("request_new");
        return;
      }

      if (redirectState.type && redirectState.type !== "recovery") {
        clearAuthRedirectState();
        setStatus("invalid");
        setError("This link is for a different account action. Request a fresh password reset email instead.");
        return;
      }

      try {
        setStatus("verifying");
        setError("");
        const result = await completeAuthActionFromRedirect({
          expectedType: "recovery",
          redirectState,
        });

        if (cancelled) return;

        if (result?.user) {
          setStatus("ready");
          await refreshSession?.().catch(() => null);
        } else {
          setStatus("invalid");
          setError(buildAuthActionErrorMessage(redirectState, "recovery"));
        }
      } catch (authError) {
        if (cancelled) return;
        setStatus("invalid");
        setError(buildAuthActionErrorMessage(authError, "recovery"));
      } finally {
        clearAuthRedirectState();
      }
    };

    void resolveResetLink();

    return () => {
      cancelled = true;
    };
  }, [redirectState, refreshSession]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      setMessage("");
      await confirmPasswordReset({ password });
      await refreshSession?.().catch(() => null);
      setStatus("success");
      setMessage("Password updated. You can now sign in with your new password.");
      setPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(submitError?.message || "Unable to update your password right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-action-page">
      <section className="auth-action-card">
        <h1>Reset Password</h1>
        <p>
          {status === "ready"
            ? "Choose a new password for your Happy Tails account."
            : status === "success"
              ? "Your account password has been updated successfully."
              : status === "request_new"
                ? "Open the reset link from your email to continue here."
                : "We're validating your secure password reset link."}
        </p>

        {status === "ready" ? (
          <form className="auth-action-stack" onSubmit={handleSubmit}>
            <div className="auth-action-field">
              <label htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                minLength={8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="auth-action-field">
              <label htmlFor="reset-password-confirm">Confirm new password</label>
              <input
                id="reset-password-confirm"
                minLength={8}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <button className="auth-action-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </form>
        ) : null}

        {error ? <p className="auth-action-feedback auth-action-feedback--error">{error}</p> : null}
        {message ? <p className="auth-action-feedback auth-action-feedback--success">{message}</p> : null}

        <div className="auth-action-actions">
          {status === "request_new" || status === "invalid" ? (
            <Link className="auth-action-primary" to="/" state={{ openAuth: true }}>
              Request another reset link
            </Link>
          ) : null}
          {status === "success" ? (
            <Link className="auth-action-primary" to="/" state={{ openAuth: true }}>
              Back to sign in
            </Link>
          ) : null}
          <Link className="auth-action-secondary" to="/">
            Return home
          </Link>
        </div>

        <p className="auth-action-note">
          Reset links are single-use and can expire. If this page says the link is invalid, request a fresh email and open the newest link.
        </p>
      </section>
    </div>
  );
}
