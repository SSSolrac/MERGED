import { ButtonHTMLAttributes } from 'react';

export const Button = ({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className={`rounded-xl px-4 py-2 text-sm font-medium bg-[#FFB6C1] text-[#1F2937] hover:bg-[#FF8FA3] transition-colors disabled:opacity-60 ${className}`}
    {...props}
  />
);
