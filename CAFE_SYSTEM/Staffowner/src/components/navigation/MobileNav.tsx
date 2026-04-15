import { NavLink } from 'react-router';

export const MobileNav = () => (
  <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-[#F3D6DB] bg-white p-2 flex justify-around text-xs">
    <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to="/dashboard">Overview</NavLink>
    <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to="/orders">Orders</NavLink>
    <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to="/menu">Menu</NavLink>
    <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to="/inventory">Inventory</NavLink>
    <NavLink className={({ isActive }) => `px-2 py-1 rounded-lg ${isActive ? 'bg-[#FFB6C1] text-[#1F2937]' : 'hover:bg-[#FFF3F5]'}`} to="/customers">Loyalty</NavLink>
  </nav>
);
