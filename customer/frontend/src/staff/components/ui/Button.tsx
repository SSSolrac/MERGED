import { type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const baseClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'border-[#FF8FA3] bg-[#FF8FA3] text-white hover:bg-[#E9778E]',
  secondary: 'border-[#2B7A87] bg-[#2B7A87] text-white hover:bg-[#216570]',
  outline: 'border-[#F3D6DB] bg-white text-[#1F2937] hover:bg-[#FFF3F5]',
  danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  ghost: 'border-transparent bg-transparent text-[#4B5563] hover:bg-[#FFF3F5]',
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
