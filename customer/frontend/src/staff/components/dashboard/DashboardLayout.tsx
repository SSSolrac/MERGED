import { useMemo, useState } from 'react';
import {
  Bell,
  Boxes,
  CalendarDays,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Settings,
  Upload,
  User,
  Users,
  Utensils,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { CommandBar } from '@/components/navigation/CommandBar';
import { MobileNav } from '@/components/navigation/MobileNav';
import { useNotifications } from '@/hooks/useNotifications';
import happyTailsLogo from '@/assets/branding/logo.png';

export const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const { unreadNotifications, readNotifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const isOwner = user?.role === 'owner';
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const workspaceBasePath = location.pathname.startsWith('/owner') ? '/owner' : '/staff';
  const userInitials = useMemo(() => {
    const source = String(user?.name || user?.email || 'SO').trim();
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'SO').slice(0, 2);
  }, [user?.email, user?.name]);
  const userTitle = String(user?.jobTitle || '').trim() || (user?.role === 'owner' ? 'Owner' : 'Staff');

  const navItems = useMemo(() => {
    const base = [
      { section: 'Operations', label: 'Dashboard Overview', path: `${workspaceBasePath}/dashboard`, icon: LayoutDashboard, ownerOnly: true },
      { section: 'Operations', label: 'View Orders', path: `${workspaceBasePath}/orders`, icon: ClipboardList },
      { section: 'Catalog', label: 'Edit Daily Menu', path: `${workspaceBasePath}/daily-menu`, icon: CalendarDays },
      { section: 'Catalog', label: 'Manage Menu Items', path: `${workspaceBasePath}/menu`, icon: Utensils },
      { section: 'Catalog', label: 'Inventory', path: `${workspaceBasePath}/inventory`, icon: Boxes },
      { section: 'Customers', label: 'Customer Loyalty', path: `${workspaceBasePath}/customers`, icon: Users },
      { section: 'Account', label: 'Profile', path: `${workspaceBasePath}/profile`, icon: User },
      { section: 'Administration', label: 'Import Sales Data', path: `${workspaceBasePath}/imports`, icon: Upload, ownerOnly: true },
      { section: 'Administration', label: 'Settings', path: `${workspaceBasePath}/settings`, icon: Settings, ownerOnly: true },
      { section: 'Administration', label: 'Delivery Coverage', path: `${workspaceBasePath}/admin/delivery-coverage`, icon: MapPinned, ownerOnly: true },
      { section: 'Administration', label: 'Activity Log', path: `${workspaceBasePath}/admin/activity-log`, icon: History, ownerOnly: true },
    ] as const;

    return base.filter((item) => !item.ownerOnly || isOwner);
  }, [isOwner, workspaceBasePath]);

  const navSections = useMemo(() => {
    const grouped = new Map<string, typeof navItems>();
    navItems.forEach((item) => {
      if (!grouped.has(item.section)) grouped.set(item.section, []);
      grouped.get(item.section)?.push(item);
    });
    return Array.from(grouped.entries());
  }, [navItems]);

  const pageTitle = useMemo(() => {
    const match = navItems.find((item) => item.path === location.pathname);
    if (match) return match.label;
    if (location.pathname.startsWith('/admin/')) return 'Admin';
    return 'Staff / Owner';
  }, [location.pathname, navItems]);

  const onSignOut = async () => {
    try {
      localStorage.clear();
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}
      await logout();
      toast.success('Signed out successfully');
      navigate('/', { replace: true });
  };

  return (
    <div className="staff-app staff-workspace min-h-screen bg-[#FFF7F9] text-[#1F2937]">
      <div className="staff-workspace__shell">
        <aside className="staff-workspace__sidebar">
          <div className="mx-2 flex items-center gap-3 rounded-xl bg-[#FFF3F5] p-3">
            {user?.avatar ? (
              <img src={user.avatar} alt={user?.name || 'Staff profile'} className="h-11 w-11 rounded-full border border-[#F6D2DA] object-cover" />
            ) : (
              <div className="staff-workspace__avatar h-11 w-11 rounded-full bg-[#FF8FA3] text-white flex items-center justify-center font-semibold text-sm">
                {userInitials}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#1F2937]">{user?.name || 'Staff / Owner'}</p>
              <p className="truncate text-xs text-slate-500">{userTitle}</p>
            </div>
          </div>
          <nav className="staff-workspace__nav mt-4 flex-1 w-full space-y-3 overflow-y-auto">
            {navSections.map(([section, sectionItems]) => (
              <div key={section} className="staff-workspace__nav-section space-y-1">
                <p className="staff-workspace__nav-heading px-2 text-[11px] uppercase tracking-wide text-slate-400">{section}</p>
                {sectionItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={item.label}
                    className={({ isActive }) =>
                      `staff-workspace__nav-link w-full flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                        isActive ? 'bg-[#FFE4E8] text-[#FF8FA3]' : 'text-slate-600 hover:bg-[#FFF3F5]'
                      }`
                    }
                  >
                    <item.icon className="staff-workspace__nav-icon h-5 w-5 shrink-0" />
                    <span className="staff-workspace__nav-label text-sm">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <button
            onClick={onSignOut}
            title="Sign out"
            className="staff-workspace__signout mt-auto mb-1 w-full flex items-center gap-3 rounded-lg px-3 py-2 text-slate-600 hover:bg-[#FFF3F5] transition-colors"
          >
            <LogOut className="staff-workspace__nav-icon h-5 w-5" />
            <span className="staff-workspace__nav-label text-sm">Sign Out</span>
          </button>
        </aside>
        <section className="staff-workspace__content">
          <header className="staff-workspace__topbar h-16 bg-[#FF8FA3] text-white px-4 md:px-5 flex items-center justify-between">
            <div className="staff-workspace__topbar-left flex items-center gap-2 min-w-0">
              <button
                type="button"
                aria-label="Open menu"
                className="staff-workspace__menu-button md:hidden rounded-lg p-2 hover:bg-white/20 transition-colors"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="staff-workspace__brand flex items-center gap-3 min-w-0">
                <div className="staff-workspace__brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/35 shadow-sm overflow-hidden">
                  <img src={happyTailsLogo} alt="Happy Tails Pet Cafe" className="staff-workspace__brand-logo h-8 w-8 object-contain" />
                </div>
                <h1 className="staff-workspace__title text-sm font-semibold tracking-wide truncate">{pageTitle}</h1>
              </div>
            </div>
            <div className="staff-workspace__topbar-actions flex items-center gap-2">
              <div className="hidden sm:block">
                <CommandBar />
              </div>
              <div className="relative group">
                <button aria-label="open-alerts" className="rounded-lg p-2 hover:bg-white/20 transition-colors relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 ? <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-rose-500 text-white text-[10px] px-1">{unreadCount}</span> : null}
                </button>
                <div className="hidden group-focus-within:block group-hover:block absolute right-0 mt-1 w-80 rounded-xl border bg-white text-[#1F2937] shadow-lg z-20 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-sm font-medium">Notifications</p>
                      <p className="text-[11px] text-[#6B7280]">{unreadCount ? `${unreadCount} unread` : 'All caught up'}</p>
                    </div>
                    {unreadCount > 0 ? (
                      <button type="button" className="text-xs underline" onClick={markAllRead}>Mark all as read</button>
                    ) : null}
                  </div>
                  <div className="max-h-80 overflow-auto space-y-1">
                    {unreadNotifications.length === 0 ? <p className="text-xs text-[#6B7280] p-2">No unread notifications.</p> : unreadNotifications.slice(0, 10).map((row) => (
                      <button key={row.id} type="button" className="w-full text-left rounded p-2 border bg-[#FFF3F5]" onClick={() => markRead(row.id)}>
                        <p className="text-xs font-medium">{row.title}</p>
                        <p className="text-xs text-[#6B7280]">{row.message}</p>
                      </button>
                    ))}
                    {readNotifications.length ? (
                      <details className="mt-2 border-t pt-2">
                        <summary className="cursor-pointer px-2 text-xs font-medium text-[#8B5E6A]">View read notifications</summary>
                        <div className="mt-2 space-y-1">
                          {readNotifications.slice(0, 10).map((row) => (
                            <div key={row.id} className="rounded border bg-white p-2 text-left">
                              <p className="text-xs font-medium">{row.title}</p>
                              <p className="text-xs text-[#6B7280]">{row.message}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </header>
          <main className="staff-workspace__main p-4 pb-20 md:pb-4 max-w-7xl mx-auto">
            <Outlet />
          </main>
        </section>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="staff-workspace__mobile-panel absolute inset-y-0 left-0 w-72 bg-white shadow-xl p-4 flex flex-col">
            <div className="staff-workspace__mobile-header flex items-center justify-between">
              <div className="staff-workspace__brand flex items-center gap-3 min-w-0">
                <div className="staff-workspace__mobile-brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF3F5] ring-1 ring-[#F6D2DA] shadow-sm overflow-hidden">
                  <img src={happyTailsLogo} alt="Happy Tails Pet Cafe" className="h-9 w-9 object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold leading-tight text-[#1F2937]">Happy Tails</p>
                  <p className="text-xs text-slate-500">Staff / Owner</p>
                </div>
              </div>
              <button className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100" onClick={() => setMobileMenuOpen(false)}>
                Close
              </button>
            </div>
            <nav className="staff-workspace__mobile-nav mt-4 space-y-3">
              {navSections.map(([section, sectionItems]) => (
                <div key={section} className="staff-workspace__nav-section space-y-1">
                  <p className="staff-workspace__nav-heading px-2 text-[11px] uppercase tracking-wide text-slate-400">{section}</p>
                  {sectionItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `staff-workspace__nav-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive ? 'bg-[#FFF3F5] text-[#FF8FA3]' : 'text-slate-700 hover:bg-[#FFF3F5]'
                        }`
                      }
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className="mt-auto pt-3 border-t">
              <button onClick={onSignOut} className="w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-700 flex items-center gap-2 hover:bg-[#FFF3F5] transition-colors">
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <MobileNav />
    </div>
  );
};
