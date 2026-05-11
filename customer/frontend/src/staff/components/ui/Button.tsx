import { type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const baseClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8FA3] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'border-[#F23895] bg-[#F23895] text-white hover:bg-[#D92D82]',
  secondary: 'border-[#FF8FA3] bg-[#FFE4E8] text-[#7A123F] hover:bg-[#FFD1DA]',
  outline: 'border-[#F3B7C7] bg-white text-[#1F2937] hover:border-[#FF8FA3] hover:bg-[#FFF3F5]',
  danger: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
  ghost: 'border-transparent bg-transparent text-[#4B5563] shadow-none hover:bg-[#FFF3F5]',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export const buttonClassName = ({
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) => `${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`.trim();

export const Button = ({ className = '', variant = 'primary', size = 'md', type = 'button', ...props }: ButtonProps) => (
  <button className={buttonClassName({ variant, size, className })} type={type} {...props} />
);
