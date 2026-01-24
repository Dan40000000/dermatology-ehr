import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../LoginPage';
import { BrowserRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
const mockLogin = vi.hoisted(() => vi.fn());
const locationMock = vi.hoisted(() => vi.fn(() => ({ state: {} })));

const authMocks = vi.hoisted(() => ({
  isAuthenticated: false,
  login: mockLogin,
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
    authMocks.isLoading = false;
    mockLogin.mockResolvedValue(undefined);
    locationMock.mockReturnValue({ state: {} });
  });

  it('should render login form', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByText('common:appName')).toBeInTheDocument();
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

    expect(screen.getByText('auth:login.demoCredentials')).toBeInTheDocument();
    expect(screen.getByText(/admin@demo.practice/)).toBeInTheDocument();
    expect(screen.getByText(/Password123!/)).toBeInTheDocument();
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

  it('should redirect to home when authenticated', () => {
    authMocks.isAuthenticated = true;

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByTestId('navigate')).toHaveTextContent('/home');
  });

  it('should redirect to previous location when specified', () => {
    authMocks.isAuthenticated = true;

    locationMock.mockReturnValue({ state: { from: { pathname: '/patients' } } });

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByTestId('navigate')).toHaveTextContent('/patients');
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

    expect(screen.getByText(/© 2025 DermEHR • Version 1.0.0/i)).toBeInTheDocument();
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
