import { useState } from "react";
import "./AuthModal.css";

function AuthModal({
  isOpen,
  onClose,
  onLogin,
  onRequestPasswordReset,
  onUpdatePassword,
  isRecoveryMode = false,
}) {
  const [mode, setMode] = useState(() => (isRecoveryMode ? "reset" : "login"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isSignup = mode === "signup";
  const isForgotPassword = mode === "forgot";
  const isResetPassword = mode === "reset";
  const modalTitle = isResetPassword ? "Reset Password" : isForgotPassword ? "Forgot Password" : isSignup ? "Create Account" : "Login";
  const submitLabel = isResetPassword ? "Update Password" : isForgotPassword ? "Send Reset Link" : isSignup ? "Create Account" : "Login";

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      if (isForgotPassword) {
        await onRequestPasswordReset?.({ email });
        setMessage("Reset link sent. Check your email for the secure password reset link.");
        return;
      }

      if (isResetPassword) {
        if (password.length < 8) {
          setError("Use at least 8 characters for your new password.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }

        await onUpdatePassword?.({ password });
        setMessage("Password updated. You can continue with your account.");
        onClose();
        return;
      }

      await onLogin({ name, email, password, isSignup });
    } catch (submitError) {
      setError(submitError?.message || "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <button className="close-btn" onClick={onClose} aria-label="Close authentication modal">
          x
        </button>

        <h2>{modalTitle}</h2>
        {isResetPassword ? <p className="auth-helper">Choose a new password for your Supabase account.</p> : null}
        {isForgotPassword ? <p className="auth-helper">Enter the email linked to your account and we'll send a reset link.</p> : null}

        <form onSubmit={handleSubmit}>
          {isSignup ? <input type="text" placeholder="Full Name" value={name} onChange={(event) => setName(event.target.value)} required /> : null}
          {!isResetPassword ? (
            <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          ) : null}
          {!isForgotPassword ? (
            <input
              type="password"
              placeholder={isResetPassword ? "New Password" : "Password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          ) : null}
          {isResetPassword ? (
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          ) : null}

          <button type="submit" className="login-btn" disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : submitLabel}
          </button>
        </form>

        {error ? <p className="auth-feedback auth-feedback--error">{error}</p> : null}
        {message ? <p className="auth-feedback auth-feedback--success">{message}</p> : null}

        {!isResetPassword ? (
          <div className="auth-links">
            <p className="signup-text">
              {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <button type="button" className="auth-link" onClick={() => switchMode(isSignup ? "login" : "signup")}>
                {isSignup ? "Login" : "Sign Up"}
              </button>
            </p>

            {mode === "login" ? (
              <button type="button" className="auth-secondary-link" onClick={() => switchMode("forgot")}>
                Forgot your password?
              </button>
            ) : null}

            {mode === "forgot" ? (
              <button type="button" className="auth-secondary-link" onClick={() => switchMode("login")}>
                Back to login
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AuthModal;
