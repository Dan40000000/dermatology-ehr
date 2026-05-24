import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../LoginPage';
import { BrowserRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
const mockLogin = vi.hoisted(() => vi.fn());
const mockLogout = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => vi.fn(() => ({ state: {} })));

const authMocks = vi.hoisted(() => ({
  isAuthenticated: false,
  user: null as null | { fullName?: string; email?: string },
  login: mockLogin,
  logout: mockLogout,
  isLoading: false,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
    useNavigate: () => mockNavigate,
    useLocation: locationMock,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.isAuthenticated = false;
    authMocks.user = null;
    authMocks.isLoading = false;
    mockLogin.mockResolvedValue(undefined);
    locationMock.mockReturnValue({ state: {}, search: '' });
    sessionStorage.clear();
  });

  it('should render login form', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Provider Login')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('tenant-demo')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@demo.practice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auth:login.signInButton/i })).toBeInTheDocument();
  });

  it('should display demo credentials', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Beta test credentials/i)).toBeInTheDocument();
    expect(screen.getByText(/admin@demo.practice/)).toBeInTheDocument();
    expect(screen.getAllByText(/Password123!/).length).toBeGreaterThan(0);
  });

  it('should have pre-filled default values', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const tenantInput = screen.getByPlaceholderText('tenant-demo') as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText('admin@demo.practice') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText(/•/) as HTMLInputElement;

    expect(tenantInput.value).toBe('tenant-demo');
    expect(emailInput.value).toBe('admin@demo.practice');
    expect(passwordInput.value).toBe('Password123!');
  });

  it('should update input values on change', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const tenantInput = screen.getByPlaceholderText('tenant-demo') as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText('admin@demo.practice') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText(/•/) as HTMLInputElement;

    fireEvent.change(tenantInput, { target: { value: 'tenant-custom' } });
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'newpassword' } });

    expect(tenantInput.value).toBe('tenant-custom');
    expect(emailInput.value).toBe('user@example.com');
    expect(passwordInput.value).toBe('newpassword');
  });

  it('should call login on form submission', async () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const submitButton = screen.getByRole('button', { name: /auth:login.signInButton/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('tenant-demo', 'admin@demo.practice', 'Password123!');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('should fill and submit the physician demo credentials', async () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByText('provider@demo.practice').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: /auth:login.signInButton/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('tenant-demo', 'provider@demo.practice', 'Password123!');
    });
  });

  it('should display error message on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const submitButton = screen.getByRole('button', { name: /auth:login.signInButton/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('should display generic error message when error has no message', async () => {
    mockLogin.mockRejectedValue(new Error());

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const submitButton = screen.getByRole('button', { name: /auth:login.signInButton/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('auth:errors.invalidCredentials')).toBeInTheDocument();
    });
  });

  it('should clear error on new submission', async () => {
    mockLogin.mockRejectedValueOnce(new Error('First error'));

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const submitButton = screen.getByRole('button', { name: /auth:login.signInButton/i });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('First error')).toBeInTheDocument();
    });

    mockLogin.mockResolvedValue(undefined);

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText('First error')).not.toBeInTheDocument();
    });
  });

  it('should show loading state during login', async () => {
    authMocks.isLoading = true;

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const submitButton = screen.getByRole('button', { name: /common:messages.loading/i });
    expect(submitButton).toBeDisabled();
  });

  it('should show an active session warning instead of auto-entering the app', () => {
    authMocks.isAuthenticated = true;
    authMocks.user = { fullName: 'Dr. Existing User', email: 'provider@demo.practice' };

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Active session detected')).toBeInTheDocument();
    expect(screen.getByText(/Dr. Existing User/)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should continue to previous location from the active session warning', () => {
    authMocks.isAuthenticated = true;
    authMocks.user = { fullName: 'Dr. Existing User', email: 'provider@demo.practice' };

    locationMock.mockReturnValue({ state: { from: { pathname: '/patients' } } });

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Continue to app/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/patients', { replace: true });
  });

  it('should preserve query params when continuing to the previous location', () => {
    authMocks.isAuthenticated = true;
    authMocks.user = { fullName: 'Dr. Existing User', email: 'provider@demo.practice' };

    locationMock.mockReturnValue({
      state: {
        from: {
          pathname: '/financials',
          search: '?tab=revenue&revenueCategory=procedure',
          hash: '#detail',
        },
      },
      search: '',
    });

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Continue to app/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/financials?tab=revenue&revenueCategory=procedure#detail', { replace: true });
  });

  it('should allow signing out from the active session warning', () => {
    authMocks.isAuthenticated = true;
    authMocks.user = { fullName: 'Dr. Existing User', email: 'provider@demo.practice' };

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Sign out first/i }));

    expect(mockLogout).toHaveBeenCalled();
  });

  it('should force sign out when opened as a fresh provider login from the landing page', async () => {
    authMocks.isAuthenticated = true;
    authMocks.user = { fullName: 'Dr. Existing User', email: 'provider@demo.practice' };
    locationMock.mockReturnValue({ state: {}, search: '?fresh=1' });

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.queryByText('Active session detected')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('should have proper input types', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const emailInput = screen.getByPlaceholderText('admin@demo.practice');
    const passwordInput = screen.getByPlaceholderText(/•/);

    expect(emailInput).toHaveAttribute('type', 'email');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('should allow staff to show and hide the password', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const passwordInput = screen.getByPlaceholderText(/•/);
    fireEvent.click(screen.getByRole('button', { name: /Show password/i }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: /Hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('should have autocomplete attributes', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const emailInput = screen.getByPlaceholderText('admin@demo.practice');
    const passwordInput = screen.getByPlaceholderText(/•/);

    expect(emailInput).toHaveAttribute('autocomplete', 'username');
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });

  it('should require all fields', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const tenantInput = screen.getByPlaceholderText('tenant-demo');
    const emailInput = screen.getByPlaceholderText('admin@demo.practice');
    const passwordInput = screen.getByPlaceholderText(/•/);

    expect(tenantInput).toBeRequired();
    expect(emailInput).toBeRequired();
    expect(passwordInput).toBeRequired();
  });

  it('should show version footer', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/© 2025 DermEHR/i)).toBeInTheDocument();
    expect(screen.getByText(/Version 1.0.0/i)).toBeInTheDocument();
  });

  it('should have proper form labels', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByText('auth:login.practiceId')).toBeInTheDocument();
    expect(screen.getByText('auth:login.emailAddress')).toBeInTheDocument();
    expect(screen.getByText('auth:login.password')).toBeInTheDocument();
  });

  it('should handle form submission with Enter key', async () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const form = screen.getByRole('button', { name: /auth:login.signInButton/i }).closest('form');

    fireEvent.submit(form!);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });
  });

  it('should maintain input values after failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Login failed'));

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const emailInput = screen.getByPlaceholderText('admin@demo.practice') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'custom@example.com' } });

    const submitButton = screen.getByRole('button', { name: /auth:login.signInButton/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });

    expect(emailInput.value).toBe('custom@example.com');
  });
});
