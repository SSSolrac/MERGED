import { type ButtonHTMLAttributes } from 'react';

export const Button = ({ className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className={`rounded-xl border border-[#F23895] bg-[#F23895] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#D92D82] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8FA3] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    type={type}
    {...props}
  />
);
