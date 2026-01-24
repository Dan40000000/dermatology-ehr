import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewPatientPage } from '../NewPatientPage';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

const mockNavigate = vi.fn();

const mockSession = vi.hoisted(() => ({
  tenantId: 'tenant-1',
  accessToken: 'token-123',
  refreshToken: 'refresh-123',
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    role: 'provider' as const,
  },
}));

const authMocks = vi.hoisted(() => ({
  session: mockSession,
  user: mockSession.user,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
  toasts: [],
  showToast: vi.fn(),
  dismissToast: vi.fn(),
  dismissAll: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  createPatient: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

describe('NewPatientPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.session = mockSession;
    apiMocks.createPatient.mockResolvedValue({ id: 'new-patient-1' });
  });

  it('should render new patient form', () => {
    render(
      <BrowserRouter>
        <NewPatientPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/New Patient/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
  });

  it('should have all required form fields', () => {
    render(
      <BrowserRouter>
        <NewPatientPage />
      </BrowserRouter>
    );

    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Date of Birth/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next: Contact Info/i }));

    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Home Phone/i)).toBeInTheDocument();
  });

  it('should submit form with valid data', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <NewPatientPage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Date of Birth/i), '1990-01-01');

    await user.click(screen.getByRole('button', { name: /Next: Contact Info/i }));
    await user.type(screen.getByLabelText(/Email/i), 'john@example.com');
    await user.type(screen.getByLabelText(/Home Phone/i), '555-0100');

    const submitButton = screen.getByRole('button', { name: /Save Patient/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiMocks.createPatient).toHaveBeenCalled();
    });

    expect(toastMocks.showSuccess).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('should show error on submission failure', async () => {
    apiMocks.createPatient.mockRejectedValue(new Error('Failed to create patient'));

    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <NewPatientPage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/First Name/i), 'John');
    await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
    await user.type(screen.getByLabelText(/Date of Birth/i), '1990-01-01');

    const submitButton = screen.getByRole('button', { name: /Save Patient/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(toastMocks.showError).toHaveBeenCalled();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should have cancel button that navigates back', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <NewPatientPage />
      </BrowserRouter>
    );

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith('/patients');
  });

  it('should validate required fields', async () => {
    render(
      <BrowserRouter>
        <NewPatientPage />
      </BrowserRouter>
    );

    const firstNameInput = screen.getByLabelText(/First Name/i);
    const lastNameInput = screen.getByLabelText(/Last Name/i);

    expect(firstNameInput).toBeRequired();
    expect(lastNameInput).toBeRequired();
  });
});
