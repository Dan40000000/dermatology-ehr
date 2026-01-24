import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState, FieldError, ErrorBanner } from '../ErrorState';
import { ApiException } from '../../../utils/errorHandling';

describe('ErrorState Component', () => {
  it('renders error message', () => {
    render(<ErrorState error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders with Error object', () => {
    const error = new Error('Test error');
    render(<ErrorState error={error} />);
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('renders default error message', () => {
    render(<ErrorState />);
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<ErrorState error="Error details" title="Custom Error Title" />);
    expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
  });

  it('renders network error state', () => {
    const error = new TypeError('network connection failed');
    render(<ErrorState error={error} />);
    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(
      screen.getByText('Unable to connect to the server. Please check your internet connection.')
    ).toBeInTheDocument();
  });

  it('renders auth error state', () => {
    const error = new ApiException({ message: 'auth failed', status: 401 });
    render(<ErrorState error={error} />);
    expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    expect(screen.getByText('Your session has expired. Please log in again.')).toBeInTheDocument();
  });

  it('renders permission error state', () => {
    const error = new ApiException({ message: 'permission denied', status: 403 });
    render(<ErrorState error={error} />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText('You do not have permission to access this resource.')
    ).toBeInTheDocument();
  });

  it('renders retry button', () => {
    render(<ErrorState error="Error" onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls onRetry when retry button clicked', async () => {
    const handleRetry = vi.fn();
    const user = userEvent.setup();

    render(<ErrorState error="Error" onRetry={handleRetry} />);
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('hides retry button when showRetry is false', () => {
    render(<ErrorState error="Error" onRetry={vi.fn()} showRetry={false} />);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('does not show retry for auth errors', () => {
    const error = new ApiException({ message: 'auth failed', status: 401 });
    render(<ErrorState error={error} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('does not show retry for permission errors', () => {
    const error = new ApiException({ message: 'permission denied', status: 403 });
    render(<ErrorState error={error} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('renders go home button', () => {
    render(<ErrorState error="Error" onGoHome={vi.fn()} />);
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument();
  });

  it('calls onGoHome when button clicked', async () => {
    const handleGoHome = vi.fn();
    const user = userEvent.setup();

    render(<ErrorState error="Error" onGoHome={handleGoHome} />);
    await user.click(screen.getByRole('button', { name: /go to home/i }));

    expect(handleGoHome).toHaveBeenCalledTimes(1);
  });

  it('renders compact variant', () => {
    const { container } = render(<ErrorState error="Error" compact />);
    expect(container.querySelector('.error-state-compact')).toBeInTheDocument();
  });

  it('renders compact with retry button', () => {
    render(<ErrorState error="Error" onRetry={vi.fn()} compact />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<ErrorState error="Error" className="custom-error" />);
    expect(container.querySelector('.custom-error')).toBeInTheDocument();
  });
});

describe('FieldError Component', () => {
  it('renders field error', () => {
    render(<FieldError error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('returns null when no error', () => {
    const { container } = render(<FieldError />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when error is empty string', () => {
    const { container } = render(<FieldError error="" />);
    expect(container.firstChild).toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(<FieldError error="Error" className="custom-field-error" />);
    expect(container.querySelector('.custom-field-error')).toBeInTheDocument();
  });

  it('renders error icon', () => {
    const { container } = render(<FieldError error="Error" />);
    expect(container.querySelector('.icon-small')).toBeInTheDocument();
  });
});

describe('ErrorBanner Component', () => {
  it('renders error banner', () => {
    render(<ErrorBanner error="System error occurred" />);
    expect(screen.getByText('System error occurred')).toBeInTheDocument();
  });

  it('renders with Error object', () => {
    const error = new Error('Banner error');
    render(<ErrorBanner error={error} />);
    expect(screen.getByText('Banner error')).toBeInTheDocument();
  });

  it('returns null when no error', () => {
    const { container } = render(<ErrorBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dismiss button', () => {
    render(<ErrorBanner error="Error" onDismiss={vi.fn()} />);
    expect(screen.getByRole('button', { name: /dismiss error/i })).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button clicked', async () => {
    const handleDismiss = vi.fn();
    const user = userEvent.setup();

    render(<ErrorBanner error="Error" onDismiss={handleDismiss} />);
    await user.click(screen.getByRole('button', { name: /dismiss error/i }));

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not render dismiss button when onDismiss not provided', () => {
    render(<ErrorBanner error="Error" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<ErrorBanner error="Error" className="custom-banner" />);
    expect(container.querySelector('.custom-banner')).toBeInTheDocument();
  });

  it('renders error icon', () => {
    const { container } = render(<ErrorBanner error="Error" />);
    expect(container.querySelector('.icon')).toBeInTheDocument();
  });
});
