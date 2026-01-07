import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'success' | 'warning' | 'action';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  fullWidth = false,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary: '',
    ghost: 'ghost',
    danger: 'danger',
    success: 'success',
    warning: 'warning',
    action: 'action',
  };

  const sizeClasses = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
  };

  const widthClass = fullWidth ? 'btn-full-width' : '';

  return (
    <button
      className={`btn ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${loading ? 'loading' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <span className="spinner" aria-label="Loading" />}
      {children}
    </button>
  );
}
