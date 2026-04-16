import { useState } from "react";
import "./AuthModal.css";

function AuthModal({ isOpen, onClose, onLogin }) {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onLogin({ name, email, password, isSignup });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Login failed.");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <button className="close-btn" onClick={onClose}>×</button>

        <h2>{isSignup ? "Create Account" : "Login"}</h2>

        <form onSubmit={handleSubmit}>
          {isSignup ? <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required /> : null}
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />

          <button type="submit" className="login-btn">{isSignup ? "Create Account" : "Login"}</button>
        </form>

        {error ? <p style={{ color: "#a11", marginTop: 8 }}>{error}</p> : null}

        <p className="signup-text">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <span style={{ color: "#ff6fa5", fontWeight: "bold", cursor: "pointer" }} onClick={() => setIsSignup(!isSignup)}>
            {isSignup ? "Login" : "Sign Up"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default AuthModal;
