import type { ReactNode } from 'react';

interface PillProps {
  variant?: 'default' | 'subtle' | 'warn' | 'success' | 'error';
  size?: 'tiny' | 'small' | 'default';
  children: ReactNode;
  className?: string;
}

export function Pill({
  variant = 'default',
  size = 'default',
  children,
  className = '',
}: PillProps) {
  const variantClasses = {
    default: '',
    subtle: 'subtle',
    warn: 'warn',
    success: 'success',
    error: 'error',
  };

  const sizeClasses = {
    tiny: 'tiny',
    small: 'small',
    default: '',
  };

  return (
    <span className={`pill ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {children}
    </span>
  );
}
