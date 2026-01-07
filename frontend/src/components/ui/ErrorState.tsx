/**
 * ErrorState Component
 * Display error states with retry functionality
 */

import { AlertCircle, RefreshCw, Home, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { isNetworkError, isAuthError, isPermissionError } from '../../utils/errorHandling';

interface ErrorStateProps {
  error?: string | Error | unknown;
  onRetry?: () => void;
  onGoHome?: () => void;
  className?: string;
  title?: string;
  showRetry?: boolean;
  compact?: boolean;
}

export function ErrorState({
  error,
  onRetry,
  onGoHome,
  className = '',
  title,
  showRetry = true,
  compact = false,
}: ErrorStateProps) {
  const isNetwork = error ? isNetworkError(error) : false;
  const isAuth = error ? isAuthError(error) : false;
  const isPermission = error ? isPermissionError(error) : false;

  const errorMessage = error instanceof Error ? error.message : String(error || 'An unexpected error occurred');

  const getIcon = () => {
    if (isNetwork) return <WifiOff className="error-icon network" />;
    return <AlertCircle className="error-icon" />;
  };

  const getTitle = () => {
    if (title) return title;
    if (isNetwork) return 'Connection Error';
    if (isAuth) return 'Authentication Required';
    if (isPermission) return 'Access Denied';
    return 'Error';
  };

  const getDefaultMessage = () => {
    if (isNetwork) return 'Unable to connect to the server. Please check your internet connection.';
    if (isAuth) return 'Your session has expired. Please log in again.';
    if (isPermission) return 'You do not have permission to access this resource.';
    return errorMessage;
  };

  if (compact) {
    return (
      <div className={`error-state-compact ${className}`}>
        <div className="error-content">
          <AlertCircle className="icon-small" />
          <span className="error-message">{errorMessage}</span>
        </div>
        {showRetry && onRetry && (
          <Button variant="text" size="small" onClick={onRetry}>
            <RefreshCw className="icon-small" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`error-state ${className}`}>
      <div className="error-content">
        {getIcon()}
        <h3 className="error-title">{getTitle()}</h3>
        <p className="error-message">{getDefaultMessage()}</p>

        <div className="error-actions">
          {showRetry && onRetry && !isAuth && !isPermission && (
            <Button onClick={onRetry} variant="primary">
              <RefreshCw className="icon" />
              Try Again
            </Button>
          )}
          {onGoHome && (
            <Button onClick={onGoHome} variant="outline">
              <Home className="icon" />
              Go to Home
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Field-level error display
 */
interface FieldErrorProps {
  error?: string;
  className?: string;
}

export function FieldError({ error, className = '' }: FieldErrorProps) {
  if (!error) return null;

  return (
    <div className={`field-error ${className}`}>
      <AlertCircle className="icon-small" />
      <span>{error}</span>
    </div>
  );
}

/**
 * Inline error banner
 */
interface ErrorBannerProps {
  error?: string | Error | unknown;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({ error, onDismiss, className = '' }: ErrorBannerProps) {
  if (!error) return null;

  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    <div className={`error-banner ${className}`}>
      <AlertCircle className="icon" />
      <span className="error-message">{errorMessage}</span>
      {onDismiss && (
        <button className="dismiss-button" onClick={onDismiss} aria-label="Dismiss error">
          ×
        </button>
      )}
    </div>
  );
}
