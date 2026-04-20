import { useState } from "react";
import "./AuthModal.css";

function AuthModal({
  isOpen,
  onClose,
  onLogin,
  onRequestPasswordReset,
}) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isSignup = mode === "signup";
  const isForgotPassword = mode === "forgot";
  const modalTitle = isForgotPassword ? "Forgot Password" : isSignup ? "Create Account" : "Login";
  const submitLabel = isForgotPassword ? "Send Reset Link" : isSignup ? "Create Account" : "Login";

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

      // Parent still owns auth redirects: await onLogin({ name, email, password, isSignup });
      await onLogin({ name, phone, email, password, isSignup });
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
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <button className="close-btn" onClick={onClose} aria-label="Close authentication modal">
          x
        </button>

        <h2>{modalTitle}</h2>
        {isForgotPassword ? <p className="auth-helper">Enter the email linked to your account and we'll send a reset link.</p> : null}

        <form onSubmit={handleSubmit}>
          {isSignup ? <input type="text" placeholder="Full Name" value={name} onChange={(event) => setName(event.target.value)} required /> : null}
          {isSignup ? (
            <input
              type="tel"
              placeholder="Phone Number"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          ) : null}
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          {!isForgotPassword ? (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          ) : null}

          <button type="submit" className="login-btn" disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : submitLabel}
          </button>
        </form>

        {error ? <p className="auth-feedback auth-feedback--error">{error}</p> : null}
        {message ? <p className="auth-feedback auth-feedback--success">{message}</p> : null}

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
      </div>
    </div>
  );
}

export default AuthModal;
