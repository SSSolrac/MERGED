import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./App.css";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AuthModal from "./components/AuthModal";
import Home from "./pages/Home";
import pattern from "./assets/pattern.png";
import { useAuth } from "./context/AuthContext";
import RequireRole from "./auth/RequireRole";
import { getSafeRouteForRole } from "./auth/roleRoutes";
import { isAuthActionLink, readAuthRedirectState } from "./lib/authRedirects";

const Menu = lazy(() => import("./pages/Menu"));
const About = lazy(() => import("./pages/About"));
const Order = lazy(() => import("./pages/Order"));
const OrderCategory = lazy(() => import("./pages/OrderCategory"));
const Profile = lazy(() => import("./pages/Profile"));
const OrderHistory = lazy(() => import("./pages/OrderHistory"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const TrackOrder = lazy(() => import("./pages/TrackOrder"));
const Notifications = lazy(() => import("./pages/Notifications"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const EmailChangePage = lazy(() => import("./pages/auth/EmailChangePage"));
const StaffDashboardLayout = lazy(() =>
  import("@/components/dashboard/DashboardLayout").then((module) => ({ default: module.DashboardLayout }))
);
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const ActivityLogPage = lazy(() =>
  import("@/pages/admin/ActivityLogPage").then((module) => ({ default: module.ActivityLogPage }))
);
const DeliveryCoveragePage = lazy(() =>
  import("@/pages/admin/DeliveryCoveragePage").then((module) => ({ default: module.DeliveryCoveragePage }))
);
const StaffOrdersPage = lazy(() =>
  import("@/pages/orders/OrdersPage").then((module) => ({ default: module.OrdersPage }))
);
const DailyMenuPage = lazy(() => import("@/pages/menu/DailyMenuPage").then((module) => ({ default: module.DailyMenuPage })));
const MenuManagementPage = lazy(() =>
  import("@/pages/menu/MenuManagementPage").then((module) => ({ default: module.MenuManagementPage }))
);
const InventoryManagementPage = lazy(() =>
  import("@/pages/menu/InventoryManagementPage").then((module) => ({ default: module.InventoryManagementPage }))
);
const CustomersLoyaltyPage = lazy(() =>
  import("@/pages/customers/CustomersLoyaltyPage").then((module) => ({ default: module.CustomersLoyaltyPage }))
);
const ImportsReportsPage = lazy(() =>
  import("@/pages/imports/ImportsReportsPage").then((module) => ({ default: module.ImportsReportsPage }))
);
const StaffProfilePage = lazy(() => import("@/pages/ProfilePage").then((module) => ({ default: module.ProfilePage })));

function RouteLoader() {
  return <div style={{ padding: 24 }}>Loading page...</div>;
}

function CustomerRoute({ children }) {
  return <RequireRole roles={["customer"]}>{children}</RequireRole>;
}

function StaffRoute({ children }) {
  return <RequireRole roles={["staff", "owner"]}>{children}</RequireRole>;
}

function OwnerRoute({ children }) {
  return <RequireRole roles={["owner"]}>{children}</RequireRole>;
}

function staffOwnerChildRoutes(basePath, { ownerWorkspace = false } = {}) {
  return (
    <>
      <Route index element={<Navigate to={`${basePath}/${ownerWorkspace ? "dashboard" : "orders"}`} replace />} />
      <Route path="dashboard" element={<OwnerRoute><DashboardPage /></OwnerRoute>} />
      <Route path="orders" element={<StaffOrdersPage />} />
      <Route path="daily-menu" element={<DailyMenuPage />} />
      <Route path="menu" element={<MenuManagementPage />} />
      <Route path="inventory" element={<InventoryManagementPage />} />
      <Route path="customers" element={<CustomersLoyaltyPage />} />
      <Route path="profile" element={<StaffProfilePage />} />
      <Route path="imports" element={<OwnerRoute><ImportsReportsPage /></OwnerRoute>} />
      <Route path="settings" element={<OwnerRoute><SettingsPage /></OwnerRoute>} />
      <Route path="admin/delivery-coverage" element={<OwnerRoute><DeliveryCoveragePage /></OwnerRoute>} />
      <Route path="admin/activity-log" element={<OwnerRoute><ActivityLogPage /></OwnerRoute>} />
      <Route path="admin/login-history" element={<Navigate to={`${basePath}/admin/activity-log`} replace />} />
    </>
  );
}

function App() {
  const { isAuthenticated, role, signIn, signOut, signUp, sendPasswordReset } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const isStaffWorkspace = location.pathname.startsWith("/staff") || location.pathname.startsWith("/owner");
  const isRouteAuthRequest = Boolean(location.state?.openAuth);
  const isAuthModalOpen = showAuthModal || isRouteAuthRequest;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    const authState = readAuthRedirectState();
    if (!isAuthActionLink(authState)) return;

    const targetPath =
      authState.type === "recovery"
        ? "/auth/reset-password"
        : authState.type === "email_change"
          ? "/auth/email-change"
          : "";

    if (!targetPath || location.pathname === targetPath) return;

    navigate(`${targetPath}${location.search}${location.hash}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

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
      await signUp({ name: credentials.name, phone: credentials.phone, email: credentials.email, password: credentials.password });
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
    await sendPasswordReset({ email });
  };

  const handleOrderClick = () => {
    navigate("/order");
  };

  const handleCloseAuthModal = () => {
    setShowAuthModal(false);
    if (isRouteAuthRequest) {
      navigate(location.pathname, { replace: true, state: null });
    }
  };

  return (
    <div className="app-shell">
      {!isStaffWorkspace ? <Navbar onSignOut={handleSignOut} onOpenModal={() => setShowAuthModal(true)} /> : null}

      <main className="app-main">
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/" element={<Home onOrderClick={handleOrderClick} />} />
            <Route path="/menu" element={<Menu />} />
            <Route path="/about" element={<About />} />
            <Route path="/order" element={<Order />} />
            <Route path="/order/:category" element={<OrderCategory />} />
            <Route path="/order-success" element={<OrderSuccess />} />
            <Route path="/track-order" element={<TrackOrder />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/email-change" element={<EmailChangePage />} />
            <Route path="/cart" element={<Navigate to="/order" replace />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/profile" element={<Navigate to="/profile/info" replace />} />
            <Route path="/profile/info" element={<CustomerRoute><Profile view="info" /></CustomerRoute>} />
            <Route path="/profile/loyalty" element={<Profile view="loyalty" />} />
            <Route path="/order-history" element={<CustomerRoute><OrderHistory /></CustomerRoute>} />
            <Route path="/staff" element={<StaffRoute><StaffDashboardLayout /></StaffRoute>}>
              {staffOwnerChildRoutes("/staff")}
            </Route>
            <Route path="/owner" element={<OwnerRoute><StaffDashboardLayout /></OwnerRoute>}>
              {staffOwnerChildRoutes("/owner", { ownerWorkspace: true })}
            </Route>
          </Routes>
        </Suspense>
      </main>

      {!isStaffWorkspace ? <Footer /> : null}

      {isAuthModalOpen ? (
        <AuthModal
          isOpen
          onClose={handleCloseAuthModal}
          onLogin={handleLogin}
          onRequestPasswordReset={handlePasswordResetRequest}
        />
      ) : null}
    </div>
  );
}

export default App;
