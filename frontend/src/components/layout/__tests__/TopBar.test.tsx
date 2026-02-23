import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { TopBar } from '../TopBar';
import { AuthContext } from '../../../contexts/AuthContext';
import { ACTIVE_ENCOUNTER_STORAGE_KEY } from '../../../utils/activeEncounter';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('TopBar Component', () => {
  const mockUser = {
    id: '1',
    fullName: 'Dr. Smith',
    email: 'smith@example.com',
    role: 'physician' as const,
  };

  const mockLogout = vi.fn();

  const mockPatients = [
    { id: '1', firstName: 'John', lastName: 'Doe', mrn: 'MRN001' } as any,
    { id: '2', firstName: 'Jane', lastName: 'Smith', mrn: 'MRN002' } as any,
  ];

  const renderWithContext = (props = {}) => {
    return render(
      <BrowserRouter>
        <AuthContext.Provider value={{ user: mockUser, logout: mockLogout } as any}>
          <TopBar patients={mockPatients} {...props} />
        </AuthContext.Provider>
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    localStorage.clear();
  });

  it('renders brand name', () => {
    renderWithContext();
    expect(screen.getByText(/Mountain Pine/i)).toBeInTheDocument();
    expect(screen.getByText(/Dermatology PLLC/i)).toBeInTheDocument();
  });

  it('renders patient search', () => {
    renderWithContext();
    expect(screen.getByLabelText(/Patient search dropdown/i)).toBeInTheDocument();
  });

  it('renders patient options', () => {
    renderWithContext();
    const select = screen.getByLabelText(/Patient search dropdown/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Patient Search/i })).toBeInTheDocument();
  });

  it('renders refresh button when onRefresh provided', () => {
    const onRefresh = vi.fn();
    renderWithContext({ onRefresh });
    expect(screen.getByLabelText(/Refresh patient list/i)).toBeInTheDocument();
  });

  it('calls onRefresh when refresh button clicked', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    renderWithContext({ onRefresh });

    await user.click(screen.getByLabelText(/Refresh patient list/i));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders user name', () => {
    renderWithContext();
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
  });

  it('renders Help button', () => {
    renderWithContext();
    expect(screen.getByRole('button', { name: /Open help dialog/i })).toBeInTheDocument();
  });

  it('opens help modal when Help clicked', async () => {
    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Open help dialog/i }));
    // Modal should be rendered
  });

  it('renders Feedback button', () => {
    renderWithContext();
    expect(screen.getByRole('button', { name: /Open feedback dialog/i })).toBeInTheDocument();
  });

  it('opens feedback modal when Feedback clicked', async () => {
    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Open feedback dialog/i }));
    expect(screen.getByText('Send Feedback')).toBeInTheDocument();
  });

  it('renders Customer Portal link', () => {
    renderWithContext();
    const link = screen.getByRole('link', { name: /Customer Portal/i });
    expect(link).toHaveAttribute('href', 'https://portal.example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders Preferences button', () => {
    renderWithContext();
    expect(screen.getByRole('button', { name: /Open preferences dialog/i })).toBeInTheDocument();
  });

  it('opens preferences modal when Preferences clicked', async () => {
    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Open preferences dialog/i }));
    expect(screen.getByText('User Preferences')).toBeInTheDocument();
  });

  it('renders My Account button', () => {
    renderWithContext();
    expect(screen.getByRole('button', { name: /Open my account menu/i })).toBeInTheDocument();
  });

  it('opens account modal when My Account clicked', async () => {
    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Open my account menu/i }));
    expect(screen.getByRole('heading', { name: 'My Account' })).toBeInTheDocument();
  });

  it('renders Logout button', () => {
    renderWithContext();
    expect(screen.getByRole('button', { name: /Logout from application/i })).toBeInTheDocument();
  });

  it('calls logout when Logout clicked', async () => {
    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Logout from application/i }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('submits feedback', async () => {
    const user = userEvent.setup();
    renderWithContext();

    // Open feedback modal
    await user.click(screen.getByRole('button', { name: /Open feedback dialog/i }));

    // Type feedback
    const textarea = screen.getByLabelText(/Your Feedback/i);
    await user.type(textarea, 'Great system!');

    // Submit
    const submitButton = screen.getByRole('button', { name: /Submit Feedback/i });
    await user.click(submitButton);

    await vi.waitFor(
      () => {
        expect(window.alert).toHaveBeenCalledWith('Thank you for your feedback!');
      },
      { timeout: 2000 },
    );
  });

  it('disables submit when feedback is empty', async () => {
    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Open feedback dialog/i }));

    const submitButton = screen.getByRole('button', { name: /Submit Feedback/i });
    expect(submitButton).toBeDisabled();
  });

  it('shows and navigates via the live encounter shortcut', async () => {
    localStorage.setItem(
      ACTIVE_ENCOUNTER_STORAGE_KEY,
      JSON.stringify({
        encounterId: 'enc-123',
        patientId: 'patient-123',
        patientName: 'Jane Smith',
        appointmentTypeName: 'Consult',
        startedAt: '2026-02-23T09:00:00.000Z',
        startedEncounterFrom: 'office_flow',
        undoAppointmentStatus: 'in_room',
        returnPath: '/office-flow',
      }),
    );

    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Return to live encounter/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/patients/patient-123/encounter/enc-123', {
      state: {
        startedEncounterFrom: 'office_flow',
        undoAppointmentStatus: 'in_room',
        appointmentTypeName: 'Consult',
        returnPath: '/office-flow',
      },
    });
  });
});
