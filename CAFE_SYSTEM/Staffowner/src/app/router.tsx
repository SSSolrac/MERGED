import { Navigate, createBrowserRouter } from 'react-router';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { LoginPage } from '@/auth/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ActivityLogPage } from '@/pages/admin/ActivityLogPage';
import { OrdersPage } from '@/pages/orders/OrdersPage';
import { DailyMenuPage } from '@/pages/menu/DailyMenuPage';
import { MenuManagementPage } from '@/pages/menu/MenuManagementPage';
import { InventoryManagementPage } from '@/pages/menu/InventoryManagementPage';
import { CustomersLoyaltyPage } from '@/pages/customers/CustomersLoyaltyPage';
import { ImportsReportsPage } from '@/pages/imports/ImportsReportsPage';
import { useAuth } from '@/hooks/useAuth';

const ProtectedRoute = ({ ownerOnly = false, children }: { ownerOnly?: boolean; children: React.ReactNode }) => {
  const { user, bootstrapping } = useAuth();
  if (!user && bootstrapping) return <p>Loading session...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (ownerOnly && user.role !== 'owner') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <ProtectedRoute><DashboardLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'daily-menu', element: <DailyMenuPage /> },
      { path: 'menu', element: <MenuManagementPage /> },
      { path: 'inventory', element: <InventoryManagementPage /> },
      { path: 'customers', element: <CustomersLoyaltyPage /> },
      { path: 'imports', element: <ProtectedRoute ownerOnly><ImportsReportsPage /></ProtectedRoute> },
      { path: 'profile', element: <ProtectedRoute ownerOnly><Navigate to="/settings" replace /></ProtectedRoute> },
      { path: 'settings', element: <ProtectedRoute ownerOnly><SettingsPage /></ProtectedRoute> },
      { path: 'admin/activity-log', element: <ProtectedRoute ownerOnly><ActivityLogPage /></ProtectedRoute> },
      { path: 'admin/login-history', element: <ProtectedRoute ownerOnly><Navigate to="/admin/activity-log" replace /></ProtectedRoute> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
