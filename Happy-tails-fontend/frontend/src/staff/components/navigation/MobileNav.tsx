import { NavLink, useLocation } from 'react-router';

export const MobileNav = () => {
  const location = useLocation();
  const workspaceBasePath = location.pathname.startsWith('/owner') ? '/owner' : '/staff';

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-[#F3D6DB] bg-white p-2 flex justify-around text-xs">
      <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to={`${workspaceBasePath}/dashboard`}>Overview</NavLink>
      <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to={`${workspaceBasePath}/orders`}>Orders</NavLink>
      <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to={`${workspaceBasePath}/menu`}>Menu</NavLink>
      <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to={`${workspaceBasePath}/inventory`}>Inventory</NavLink>
      <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to={`${workspaceBasePath}/customers`}>Loyalty</NavLink>
    </nav>
  );
};
