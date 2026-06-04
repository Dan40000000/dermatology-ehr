import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminPage } from '../AdminPage';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

const mockNavigate = vi.fn();

const mockSession = vi.hoisted(() => ({
  tenantId: 'tenant-1',
  accessToken: 'token-123',
  refreshToken: 'refresh-123',
  user: {
    id: 'user-1',
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: 'admin' as const,
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

const mockFacilities = [
  { id: 'fac-1', name: 'Main Clinic', address: '123 Main St', phone: '555-0100', isActive: true },
  { id: 'fac-2', name: 'North Clinic', address: '456 North Ave', phone: '555-0200', isActive: true },
];

const mockRooms = [
  { id: 'room-1', facilityId: 'fac-1', facilityName: 'Main Clinic', name: 'Exam Room 1', roomType: 'exam', isActive: true },
  { id: 'room-2', facilityId: 'fac-1', facilityName: 'Main Clinic', name: 'Procedure Room', roomType: 'procedure', isActive: true },
];

const mockProviders = [
  { id: 'prov-1', fullName: 'Dr. John Smith', specialty: 'Dermatology', npi: '1234567890', isActive: true },
  { id: 'prov-2', fullName: 'Dr. Jane Doe', specialty: 'Dermatology', npi: '0987654321', isActive: true },
];

const mockUsers = [
  { id: 'user-1', email: 'admin@example.com', phone: '+1555010101', fullName: 'Admin User', role: 'admin', passwordResetRequired: false },
  { id: 'user-2', email: 'provider@example.com', phone: '+1555010102', fullName: 'Provider User', role: 'provider', passwordResetRequired: true },
  {
    id: 'user-3',
    email: 'frontdesk@example.com',
    phone: '+1555010103',
    fullName: 'Front Desk User',
    role: 'front_desk',
    passwordResetRequired: false,
    failedLoginAttempts: 5,
    loginLockedAt: '2026-06-03T12:00:00.000Z',
    loginLockedReason: 'failed_login_attempts',
  },
];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    authMocks.session = mockSession;
    authMocks.user = mockSession.user;

    global.fetch = vi.fn((url: string) => {
      const urlString = url.toString();

      if (urlString.includes('/facilities')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ facilities: mockFacilities }),
        });
      }

      if (urlString.includes('/rooms')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rooms: mockRooms }),
        });
      }

      if (urlString.includes('/providers')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ providers: mockProviders }),
        });
      }

      if (urlString.includes('/users')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ users: mockUsers }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as any;

    global.confirm = vi.fn(() => true);
  });

  it('should redirect non-admin users', () => {
    authMocks.user = { ...mockSession.user, role: 'provider' as const };

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    expect(screen.getByTestId('navigate')).toHaveTextContent('/home');
  });

  it('should render admin page for admin users', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Admin Settings')).toBeInTheDocument();
    expect(screen.getByText(/Manage facilities, rooms, providers, and user accounts/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stripe Payments/i })).toHaveAttribute('href', '/admin/integrations#stripe-payments');

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  it('should show all tabs', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    expect(screen.getByRole('button', { name: 'Facilities' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rooms' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Providers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Users' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  it('should render settings tab from URL without crashing', async () => {
    window.history.replaceState({}, '', '/admin?tab=settings');

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Administrative Workflow')).toBeInTheDocument();
    expect(screen.getByText('Admin Quick Links')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Admin Settings' })).toBeInTheDocument();
  });

  it('should load and display facilities by default', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    expect(screen.getByText('North Clinic')).toBeInTheDocument();
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText('555-0100')).toBeInTheDocument();
  });

  it('should switch to rooms tab and load rooms', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    const roomsTab = screen.getByRole('button', { name: 'Rooms' });
    fireEvent.click(roomsTab);

    await waitFor(() => {
      expect(screen.getByText('Exam Room 1')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Procedure Room').length).toBeGreaterThan(0);
  });

  it('should switch to providers tab and load providers', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    const providersTab = screen.getByRole('button', { name: 'Providers' });
    fireEvent.click(providersTab);

    await waitFor(() => {
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
    });

    expect(screen.getByText('Dr. Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
  });

  it('should switch to users tab and load users', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    const usersTab = screen.getByRole('button', { name: 'Users' });
    fireEvent.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('Provider User')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('Front Desk User')).toBeInTheDocument();
    expect(screen.getByText('Locked after failed logins')).toBeInTheDocument();
  });

  it('should show loading state while fetching data', async () => {
    let resolveData: (value: any) => void;
    const dataPromise = new Promise((resolve) => {
      resolveData = resolve;
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => dataPromise,
      })
    ) as any;

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    resolveData!({ facilities: mockFacilities });

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  it('should open add facility modal', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /Add facilit/i });
    fireEvent.click(addButton);

    const heading = screen.getByText('Add New Facility');
    const overlay = heading.parentElement?.parentElement as HTMLElement;
    expect(heading).toBeInTheDocument();
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.style.zIndex).toBe('2147483647');
    expect(screen.getByLabelText(/Facility Name/i)).toBeInTheDocument();
  });

  it('should open edit facility modal', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);

    expect(screen.getByText('Edit Facility')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Main Clinic')).toBeInTheDocument();
  });

  it('should delete facility with confirmation', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[0]);

    expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete this item?');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/facilities/fac-1'),
      expect.objectContaining({
        method: 'DELETE',
      })
    );

    await waitFor(() => {
      expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('should not delete when confirmation is cancelled', async () => {
    (global.confirm as any).mockReturnValue(false);

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    const initialCallCount = (global.fetch as any).mock.calls.length;

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[0]);

    // Should not make additional DELETE call
    expect((global.fetch as any).mock.calls.length).toBe(initialCallCount);
  });

  it('should submit add facility form', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /Add facilit/i });
    await user.click(addButton);

    const nameInput = screen.getByLabelText(/Facility Name/i);
    const addressInput = screen.getByLabelText(/Address/i);
    const phoneInput = document.querySelector('#facility-phone') as HTMLInputElement;

    await user.clear(nameInput);
    await user.type(nameInput, 'New Clinic');
    await user.type(addressInput, '789 New St');
    await user.type(phoneInput, '555-0300');

    const createButton = screen.getByRole('button', { name: 'Create' });
    await user.click(createButton);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/facilities'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('New Clinic'),
      })
    );
  });

  it('should close modal on cancel', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /Add facilit/i });
    await user.click(addButton);

    expect(screen.getByText('Add New Facility')).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Add New Facility')).not.toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    global.fetch = vi.fn(() =>
      Promise.reject(new Error('Network error'))
    ) as any;

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error loading data:', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });

  it('should display empty state for facilities', async () => {
    global.fetch = vi.fn((url: string) => {
      const urlString = url.toString();

      if (urlString.includes('/facilities')) {
        return Promise.resolve({
          json: () => Promise.resolve({ facilities: [] }),
        });
      }

      return Promise.resolve({
        json: () => Promise.resolve({}),
      });
    }) as any;

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No facilities found. Add your first facility.')).toBeInTheDocument();
    });
  });

  it('should display status badges correctly', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Main Clinic')).toBeInTheDocument();
    });

    const activeBadges = screen.getAllByText('Active');
    expect(activeBadges.length).toBeGreaterThan(0);
  });

  it('should show room type in rooms table', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    const roomsTab = screen.getByRole('button', { name: 'Rooms' });
    fireEvent.click(roomsTab);

    await waitFor(() => {
      expect(screen.getByText('Exam Room 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Exam Room')).toBeInTheDocument();
    expect(screen.getAllByText('Procedure Room').length).toBeGreaterThan(0);
  });

  it('should show provider specialty and NPI', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    const providersTab = screen.getByRole('button', { name: 'Providers' });
    fireEvent.click(providersTab);

    await waitFor(() => {
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Dermatology').length).toBeGreaterThan(0);
    expect(screen.getByText('1234567890')).toBeInTheDocument();
  });

  it('should allow creating a linked login from the provider modal', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Providers' }));

    await waitFor(() => {
      expect(screen.getByText('Dr. John Smith')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add provider/i }));
    await user.type(screen.getByLabelText(/Full Name/i), 'Dr. Linked Login');
    await user.click(screen.getByLabelText(/Create provider login too/i));
    await user.type(screen.getByLabelText(/Login email/i), 'linked.provider@example.com');
    await user.type(screen.getByLabelText(/Mobile phone/i), '(555) 222-1212');
    await user.click(screen.getByLabelText(/Text this temporary login to the provider/i));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/providers'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"createLinkedUser":true'),
        }),
      );
    });

    const createCall = (global.fetch as any).mock.calls.find(([url, options]: [string, any]) =>
      url.includes('/api/admin/providers') && options?.method === 'POST'
    );
    expect(createCall?.[1]?.body).toContain('"email":"linked.provider@example.com"');
    expect(createCall?.[1]?.body).toContain('"sendTemporaryLoginSms":true');
  });

  it('should show user roles in users table', async () => {
    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    const usersTab = screen.getByRole('button', { name: 'Users' });
    fireEvent.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Provider')).toBeInTheDocument();
  });

  it('should show temporary password controls for new and existing users', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    const usersTab = screen.getByRole('button', { name: 'Users' });
    await user.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /Add user/i });
    await user.click(addButton);

    expect(screen.getByLabelText(/Temporary password/i)).toBeRequired();
    expect(screen.getByLabelText(/Mobile phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Text this temporary login/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    // Open edit modal
    const editButtons = screen.getAllByRole('button', { name: 'Edit / Reset' });
    await user.click(editButtons[0]);

    const resetPasswordField = screen.getByLabelText(/New temporary password/i);
    expect(resetPasswordField).toBeInTheDocument();
    expect(resetPasswordField).not.toBeRequired();
    expect(screen.getByText(/Leave blank to keep the current password/i)).toBeInTheDocument();
  });

  it('should send an entered temporary password when resetting an existing user', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Users' }));

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: 'Edit / Reset' })[0]);
    await user.type(screen.getByLabelText(/New temporary password/i), 'TempStaff2026!');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/users/user-1'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"password":"TempStaff2026!"'),
        }),
      );
    });
  });

  it('should send staff mobile phone and text-login flag when creating a user', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Users' }));

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add user/i }));
    await user.type(screen.getByLabelText(/Full Name/i), 'Reset Staff');
    await user.type(screen.getByLabelText(/Email/i), 'resetstaff@example.com');
    await user.type(screen.getByLabelText(/Mobile phone/i), '(555) 321-7654');
    await user.click(screen.getByLabelText(/Text this temporary login/i));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/users'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"phone":"(555) 321-7654"'),
        }),
      );
    });

    const createCall = (global.fetch as any).mock.calls.find(([url, options]: [string, any]) =>
      url.includes('/api/admin/users') && options?.method === 'POST'
    );
    expect(createCall?.[1]?.body).toContain('"sendTemporaryLoginSms":true');
  });

  it('should include facility select in room modal', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AdminPage />
      </BrowserRouter>
    );

    const roomsTab = screen.getByRole('button', { name: 'Rooms' });
    await user.click(roomsTab);

    await waitFor(() => {
      expect(screen.getByText('Exam Room 1')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /Add room/i });
    await user.click(addButton);

    const facilitySelect = screen.getByLabelText(/Facility/i);
    expect(facilitySelect).toBeInTheDocument();

    // Close modal
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);
  });
});
