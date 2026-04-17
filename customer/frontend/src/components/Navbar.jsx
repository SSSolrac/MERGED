import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { BagFill, BellFill } from "react-bootstrap-icons";
import logo from "../assets/logo.png";
import profileIcon from "../assets/profile.png";
import "./Navbar.css";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { getUnreadNotificationCount, syncCustomerNotifications } from "../services/notificationService";
import MiniCartPanel from "./MiniCartPanel";
import MiniNotificationsPanel from "./MiniNotificationsPanel";

function Navbar({ onSignOut, onOpenModal }) {
  const location = useLocation();
  const cartMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const profileMenuRef = useRef(null);
  const { cartCount, isMiniCartOpen, toggleMiniCart, closeMiniCart } = useCart();
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const refreshUnreadCount = () => {
    setUnreadCount(getUnreadNotificationCount());
  };

  useEffect(() => {
    if (!isAuthenticated) {
      const timeoutId = window.setTimeout(() => {
        setUnreadCount(0);
        setIsNotificationsOpen(false);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const loadNotifications = async () => {
      try {
        await syncCustomerNotifications();
      } catch {
        // silent fallback to cached count
      }
      refreshUnreadCount();
    };

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(intervalId);
  }, [isAuthenticated]);

  useEffect(() => {
    closeMiniCart();
    const timeoutId = window.setTimeout(() => {
      setIsNotificationsOpen(false);
      setIsProfileMenuOpen(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [closeMiniCart, location.pathname, location.search]);

  useEffect(() => {
    if (!isMiniCartOpen && !isNotificationsOpen && !isProfileMenuOpen) return;

    const handlePointerDown = (event) => {
      const clickedCart = cartMenuRef.current?.contains(event.target);
      const clickedNotifications = notificationMenuRef.current?.contains(event.target);
      const clickedProfile = profileMenuRef.current?.contains(event.target);
      if (!clickedCart && !clickedNotifications && !clickedProfile) {
        closeMiniCart();
        setIsNotificationsOpen(false);
        setIsProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeMiniCart();
        setIsNotificationsOpen(false);
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMiniCart, isMiniCartOpen, isNotificationsOpen, isProfileMenuOpen]);

  const handleToggleNotifications = () => {
    closeMiniCart();
    setIsProfileMenuOpen(false);
    setIsNotificationsOpen((prev) => !prev);
  };

  const handleToggleMiniCart = () => {
    setIsNotificationsOpen(false);
    setIsProfileMenuOpen(false);
    toggleMiniCart();
  };

  const handleToggleProfileMenu = () => {
    closeMiniCart();
    setIsNotificationsOpen(false);
    setIsProfileMenuOpen((prev) => !prev);
  };

  const visibleUnreadCount = isAuthenticated ? unreadCount : 0;

  return (
    <nav className="navbar" style={{ backgroundColor: "#ffffff" }}>
      <div className="nav-left">
        <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src={logo} alt="Logo" className="nav-logo" />
          <span className="logo-text" style={{ marginLeft: "10px", fontSize: "1.5rem", fontWeight: "700", textShadow: "1px 1px 2px rgba(0,0,0,0.1)" }}>
            <span style={{ color: "#ff4d94" }}>Happy</span>
            <span style={{ color: "#36d7e8" }}>Tails</span>
          </span>
        </Link>
      </div>

      <ul className="nav-center" style={{ marginLeft: "auto", marginRight: "40px" }}>
        <li><Link to="/" style={{ color: "#000000" }}>Home</Link></li>
        <li><Link to="/menu" style={{ color: "#000000" }}>Cafe Menu</Link></li>
        <li><Link to="/about" style={{ color: "#000000" }}>About Us</Link></li>
      </ul>

      <div className="nav-right">
        {isAuthenticated ? (
          <div className="cart-menu" ref={notificationMenuRef}>
            <button
              type="button"
              className="cart-link cart-trigger"
              aria-label="Notifications"
              aria-expanded={isNotificationsOpen}
              onClick={handleToggleNotifications}
            >
              <span className="basket-icon"><BellFill /></span>
              {visibleUnreadCount > 0 && <span className="cart-badge">{visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}</span>}
            </button>
            {isNotificationsOpen ? (
              <MiniNotificationsPanel
                onClose={() => setIsNotificationsOpen(false)}
                onUnreadCountChange={setUnreadCount}
              />
            ) : null}
          </div>
        ) : null}

        <div className="cart-menu" ref={cartMenuRef}>
          <button
            type="button"
            className="cart-link cart-trigger"
            aria-label="Basket"
            aria-expanded={isMiniCartOpen}
            onClick={handleToggleMiniCart}
          >
            <span className="basket-icon"><BagFill /></span>
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
          {isMiniCartOpen ? <MiniCartPanel onClose={closeMiniCart} onOpenAuth={onOpenModal} /> : null}
        </div>

        {isAuthenticated ? (
          <>
            <div className="profile-menu" ref={profileMenuRef}>
              <button
                type="button"
                className="profile-link profile-trigger"
                aria-label="Account menu"
                aria-expanded={isProfileMenuOpen}
                onClick={handleToggleProfileMenu}
              >
                <img src={profileIcon} alt="" className="profile-icon" style={{ filter: "brightness(0)" }} />
              </button>
              {isProfileMenuOpen ? (
                <div className="profile-dropdown" role="menu" aria-label="Account">
                  <p className="profile-dropdown-title">Account</p>
                  <Link to="/profile/info" role="menuitem">Profile Info</Link>
                  <Link to="/profile/loyalty" role="menuitem">Loyalty and Perks</Link>
                  <Link to="/order-history" role="menuitem">Order History</Link>
                </div>
              ) : null}
            </div>
            <button className="auth-btn" onClick={onSignOut} style={{ color: "#000000" }}>Sign Out</button>
          </>
        ) : (
          <button className="auth-btn" onClick={onOpenModal} style={{ color: "#000000" }}>Sign Up / Login</button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
