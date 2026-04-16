import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AuthModal from "./components/AuthModal";

import Home from "./pages/Home";
import Menu from "./pages/Menu";
import About from "./pages/About";
import Order from "./pages/Order";
import OrderCategory from "./pages/OrderCategory";
import Profile from "./pages/Profile";
import OrderHistory from "./pages/OrderHistory";

import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import TrackOrder from "./pages/TrackOrder";
import Notifications from "./pages/Notifications";
import pattern from "./assets/pattern.png";
import { useAuth } from "./context/AuthContext";

function ProtectedRoute({ children }) {
  const { canAccessAccount, isLoading, error, sessionStatus } = useAuth();
  if (isLoading) return <div style={{ padding: 24 }}>Loading session...</div>;
  if (!canAccessAccount) {
    if (sessionStatus === "backend_unavailable") {
      return <div style={{ padding: 24, color: "#a11" }}>{error || "Supabase is unavailable. Please try again later."}</div>;
    }
    if (sessionStatus === "invalid_session") {
      return <div style={{ padding: 24, color: "#a11" }}>{error || "Your session expired. Please sign in again."}</div>;
    }
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  const { isAuthenticated, signIn, signOut, signUp } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    const isLanding = location.pathname === "/";

    if (!isLanding) {
      document.body.style.backgroundColor = "#f2f2f2";
      document.body.style.backgroundImage = `url(${pattern})`;
      document.body.style.backgroundRepeat = "repeat";
      document.body.style.backgroundSize = "520px";
      document.body.style.backgroundAttachment = "fixed";
    } else {
      document.body.style.backgroundColor = "#ffffff";
      document.body.style.backgroundImage = "none";
    }

    return () => {
      document.body.style.backgroundImage = "none";
    };
  }, [location.pathname]);

  const handleLogin = async (credentials) => {
    if (credentials.isSignup) {
      await signUp({ name: credentials.name, email: credentials.email, password: credentials.password });
      return;
    }

    await signIn({ email: credentials.email, password: credentials.password });
    setShowModal(false);
  };

  const handleSignOut = async () => {
    if (isAuthenticated) await signOut();
    navigate("/");
  };

  const handleOrderClick = () => {
    navigate("/order");
  };

  return (
    <div className="app-shell">
      <Navbar onSignOut={handleSignOut} onOpenModal={() => setShowModal(true)} />

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home onOrderClick={handleOrderClick} />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/about" element={<About />} />
          <Route path="/order" element={<Order />} />
          <Route path="/order/:category" element={<OrderCategory />} />
          <Route path="/order-success" element={<OrderSuccess />} />
          <Route path="/track-order" element={<TrackOrder />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/cart" element={<Navigate to="/order" replace />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/profile" element={<Navigate to="/profile/info" replace />} />
          <Route path="/profile/info" element={<ProtectedRoute><Profile view="info" /></ProtectedRoute>} />
          <Route path="/profile/loyalty" element={<ProtectedRoute><Profile view="loyalty" /></ProtectedRoute>} />
          <Route path="/order-history" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
        </Routes>
      </main>

      <Footer />

      <AuthModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onLogin={handleLogin}
      />
    </div>
  );
}

export default App;
