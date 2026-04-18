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
import RequireRole from "./auth/RequireRole";
import { getSafeRouteForRole } from "./auth/roleRoutes";

import { DashboardLayout as StaffDashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ActivityLogPage } from "@/pages/admin/ActivityLogPage";
import { DeliveryCoveragePage } from "@/pages/admin/DeliveryCoveragePage";
import { OrdersPage as StaffOrdersPage } from "@/pages/orders/OrdersPage";
import { DailyMenuPage } from "@/pages/menu/DailyMenuPage";
import { MenuManagementPage } from "@/pages/menu/MenuManagementPage";
import { InventoryManagementPage } from "@/pages/menu/InventoryManagementPage";
import { CustomersLoyaltyPage } from "@/pages/customers/CustomersLoyaltyPage";
import { ImportsReportsPage } from "@/pages/imports/ImportsReportsPage";

function CustomerRoute({ children }) {
  return <RequireRole roles={["customer"]}>{children}</RequireRole>;
}

function StaffRoute({ children }) {
  return <RequireRole roles={["staff", "owner"]}>{children}</RequireRole>;
}

function OwnerRoute({ children }) {
  return <RequireRole roles={["owner"]}>{children}</RequireRole>;
}

function staffOwnerChildRoutes(basePath) {
  return (
    <>
      <Route index element={<Navigate to={`${basePath}/dashboard`} replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="orders" element={<StaffOrdersPage />} />
      <Route path="daily-menu" element={<DailyMenuPage />} />
      <Route path="menu" element={<MenuManagementPage />} />
      <Route path="inventory" element={<InventoryManagementPage />} />
      <Route path="customers" element={<CustomersLoyaltyPage />} />
      <Route path="imports" element={<OwnerRoute><ImportsReportsPage /></OwnerRoute>} />
      <Route path="settings" element={<OwnerRoute><SettingsPage /></OwnerRoute>} />
      <Route path="admin/delivery-coverage" element={<OwnerRoute><DeliveryCoveragePage /></OwnerRoute>} />
      <Route path="admin/activity-log" element={<OwnerRoute><ActivityLogPage /></OwnerRoute>} />
      <Route path="admin/login-history" element={<Navigate to={`${basePath}/admin/activity-log`} replace />} />
    </>
  );
}

function App() {
  const { isAuthenticated, isRecoveryMode, role, signIn, signOut, signUp, sendPasswordReset, confirmPasswordReset } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRecoveryDismissed, setIsRecoveryDismissed] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const isStaffWorkspace = location.pathname.startsWith("/staff") || location.pathname.startsWith("/owner");
  const isRouteAuthRequest = Boolean(location.state?.openAuth);
  const isAuthModalOpen = showAuthModal || isRouteAuthRequest || (isRecoveryMode && !isRecoveryDismissed);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    const isLanding = location.pathname === "/";

    if (isStaffWorkspace) {
      document.body.style.backgroundColor = "#FFF7F9";
      document.body.style.backgroundImage = "none";
    } else if (!isLanding) {
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
  }, [isStaffWorkspace, location.pathname]);

  const handleLogin = async (credentials) => {
    if (credentials.isSignup) {
      await signUp({ name: credentials.name, email: credentials.email, password: credentials.password });
      setShowAuthModal(false);
      navigate("/", { replace: true });
      return;
    }

    const result = await signIn({ email: credentials.email, password: credentials.password });
    setShowAuthModal(false);
    navigate(getSafeRouteForRole(result?.role || role), { replace: true });
  };

  const handleSignOut = async () => {
    if (isAuthenticated) await signOut();
    navigate("/");
  };

  const handlePasswordResetRequest = async ({ email }) => {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    await sendPasswordReset({ email, redirectTo });
  };

  const handlePasswordResetConfirm = async ({ password }) => {
    await confirmPasswordReset({ password });
    setShowAuthModal(false);
    setIsRecoveryDismissed(false);
  };

  const handleOrderClick = () => {
    navigate("/order");
  };

  const handleCloseAuthModal = () => {
    setShowAuthModal(false);
    if (isRecoveryMode) setIsRecoveryDismissed(true);
    if (isRouteAuthRequest) {
      navigate(location.pathname, { replace: true, state: null });
    }
  };

  return (
    <div className="app-shell">
      {!isStaffWorkspace ? <Navbar onSignOut={handleSignOut} onOpenModal={() => setShowAuthModal(true)} /> : null}

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
          <Route path="/profile/info" element={<CustomerRoute><Profile view="info" /></CustomerRoute>} />
          <Route path="/profile/loyalty" element={<CustomerRoute><Profile view="loyalty" /></CustomerRoute>} />
          <Route path="/order-history" element={<CustomerRoute><OrderHistory /></CustomerRoute>} />
          <Route path="/staff" element={<StaffRoute><StaffDashboardLayout /></StaffRoute>}>
            {staffOwnerChildRoutes("/staff")}
          </Route>
          <Route path="/owner" element={<OwnerRoute><StaffDashboardLayout /></OwnerRoute>}>
            {staffOwnerChildRoutes("/owner")}
          </Route>
        </Routes>
      </main>

      {!isStaffWorkspace ? <Footer /> : null}

      {isAuthModalOpen ? (
        <AuthModal
          isOpen
          onClose={handleCloseAuthModal}
          onLogin={handleLogin}
          onRequestPasswordReset={handlePasswordResetRequest}
          onUpdatePassword={handlePasswordResetConfirm}
          isRecoveryMode={isRecoveryMode}
        />
      ) : null}
    </div>
  );
}

export default App;
