/**
 * LoadingButton Component
 * Button with loading state to prevent double-submission
 */

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from './Button';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'danger';
  size?: 'small' | 'medium' | 'large';
  icon?: ReactNode;
}

export function LoadingButton({
  loading = false,
  loadingText = 'Loading...',
  children,
  disabled,
  variant = 'primary',
  size = 'medium',
  icon,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      {...props}
      variant={variant}
      size={size}
      disabled={disabled || loading}
      className={`loading-button ${loading ? 'is-loading' : ''} ${props.className || ''}`}
    >
      {loading ? (
        <>
          <Loader2 className="icon animate-spin" />
          {loadingText}
        </>
      ) : (
        <>
          {icon && <span className="button-icon">{icon}</span>}
          {children}
        </>
      )}
    </Button>
  );
}

/**
 * IconButton with loading state
 */
interface LoadingIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  icon: ReactNode;
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'danger';
  size?: 'small' | 'medium' | 'large';
}

export function LoadingIconButton({
  loading = false,
  icon,
  label,
  disabled,
  variant = 'text',
  size = 'medium',
  ...props
}: LoadingIconButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`icon-button ${variant} ${size} ${loading ? 'is-loading' : ''} ${props.className || ''}`}
      aria-label={label}
      title={label}
    >
      {loading ? <Loader2 className="icon animate-spin" /> : icon}
    </button>
  );
}
