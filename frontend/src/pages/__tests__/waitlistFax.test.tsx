import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | {
    tenantId: string;
    accessToken: string;
    user: { id: string; email: string; role: string; fullName: string };
  },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchPatients: vi.fn(),
  fetchProviders: vi.fn(),
  notifyWaitlistPatient: vi.fn(),
  getWaitlistNotifications: vi.fn(),
  fillWaitlistEntry: vi.fn(),
  fetchFaxInbox: vi.fn(),
  fetchFaxOutbox: vi.fn(),
  fetchFaxStats: vi.fn(),
  sendFax: vi.fn(),
  updateFax: vi.fn(),
  deleteFax: vi.fn(),
  fetchFaxPdf: vi.fn(),
  simulateIncomingFax: vi.fn(),
  fetchDocuments: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div data-testid="panel">{children}</div>,
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" data-height={height ?? 0} />,
  Modal: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title?: string;
    children: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    const key = String(title || 'modal')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return (
      <div data-testid={`modal-${key}`}>
        <div>{title}</div>
        {children}
      </div>
    );
  },
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { WaitlistPage } from '../WaitlistPage';
import { FaxPage } from '../FaxPage';

const adminSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fullName: 'Admin User' },
};

const confirmSpy = vi.spyOn(window, 'confirm');

afterAll(() => {
  confirmSpy.mockRestore();
});

describe('WaitlistPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let waitlistState: Array<Record<string, any>>;

  beforeEach(() => {
    authMocks.session = adminSession;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    confirmSpy.mockReturnValue(true);

    apiMocks.fetchPatients.mockResolvedValue({
      patients: [{ id: 'patient-1', firstName: 'Ana', lastName: 'Derm' }],
    });
    apiMocks.fetchProviders.mockResolvedValue({
      providers: [{ id: 'provider-1', fullName: 'Dr Smith' }],
    });
    apiMocks.notifyWaitlistPatient.mockResolvedValue({ ok: true });
    apiMocks.getWaitlistNotifications.mockResolvedValue([
      {
        id: 'notif-1',
        notification_method: 'sms',
        appointment_date: '2024-02-02',
        appointment_time: '10:00',
        provider_name: 'Dr Smith',
        status: 'sent',
        created_at: '2024-02-01',
      },
    ]);
    apiMocks.fillWaitlistEntry.mockResolvedValue({ ok: true });

    waitlistState = [
      {
        id: 'wait-1',
        patientId: 'patient-1',
        providerId: 'provider-1',
        reason: 'Earlier appointment',
        preferredTimeOfDay: 'morning',
        priority: 'high',
        status: 'active',
        createdAt: '2024-01-01',
        first_name: 'Ana',
        last_name: 'Derm',
        phone: '555-1000',
        email: 'ana@example.com',
        provider_name: 'Dr Smith',
      },
    ];

    fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const method = init?.method || 'GET';
      if (method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }
      if (method === 'PATCH') {
        const body = init?.body ? JSON.parse(init.body.toString()) : {};
        waitlistState = waitlistState.map((entry) =>
          entry.id === 'wait-1'
            ? {
                ...entry,
                status: body.status || entry.status,
                patientNotifiedAt: body.patientNotifiedAt || entry.patientNotifiedAt,
                notificationMethod: body.notificationMethod || entry.notificationMethod,
              }
            : entry,
        );
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }
      if (method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => waitlistState,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('creates, updates, notifies, views history, and fills waitlist entries', async () => {
    render(<WaitlistPage />);

    await screen.findByText('Derm, Ana');

    fireEvent.click(screen.getByRole('button', { name: /Add to Waitlist/i }));
    const createModal = await screen.findByTestId('modal-add-patient-to-waitlist');
    const createScope = within(createModal);
    const createSelects = createScope.getAllByRole('combobox');
    fireEvent.change(createSelects[0], { target: { value: 'patient-1' } });
    fireEvent.change(createSelects[1], { target: { value: 'urgent' } });
    fireEvent.change(createScope.getByPlaceholderText('e.g., Earlier appointment, specific time slot'), {
      target: { value: 'Urgent visit' },
    });
    fireEvent.click(createScope.getByRole('button', { name: 'Add to Waitlist' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => (call[1]?.method || 'GET') === 'POST');
      expect(postCall).toBeTruthy();
    });

    const waitlistRow = screen.getByText('Derm, Ana').closest('tr');
    expect(waitlistRow).toBeTruthy();

    fireEvent.click(within(waitlistRow as HTMLElement).getByRole('button', { name: 'Notify' }));
    const notifyModal = await screen.findByTestId('modal-notify-patient-of-available-appointment');
    const notifyScope = within(notifyModal);
    const dateInput = notifyScope.getByText('Appointment Date').parentElement?.querySelector('input');
    const timeInput = notifyScope.getByText('Appointment Time').parentElement?.querySelector('input');
    if (!dateInput || !timeInput) {
      throw new Error('Appointment date/time inputs not found');
    }
    fireEvent.change(dateInput, { target: { value: '2024-02-10' } });
    fireEvent.change(timeInput, { target: { value: '09:30' } });
    fireEvent.change(notifyScope.getByPlaceholderText('Dr. Smith'), { target: { value: 'Dr Smith' } });
    fireEvent.click(notifyScope.getByRole('button', { name: 'Send Notification' }));

    await waitFor(() =>
      expect(apiMocks.notifyWaitlistPatient).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'wait-1',
        {
          method: 'sms',
          appointmentDate: '2024-02-10',
          appointmentTime: '09:30',
          providerName: 'Dr Smith',
        },
      ),
    );

    fireEvent.click(within(waitlistRow as HTMLElement).getByRole('button', { name: 'Update' }));
    const updateModal = await screen.findByTestId('modal-update-waitlist-entry');
    const updateScope = within(updateModal);
    fireEvent.change(updateScope.getAllByRole('combobox')[0], { target: { value: 'matched' } });
    fireEvent.change(updateScope.getByPlaceholderText('Add notes about contact attempt...'), {
      target: { value: 'Left voicemail' },
    });
    fireEvent.click(updateScope.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((call) => (call[1]?.method || 'GET') === 'PATCH');
      expect(patchCall).toBeTruthy();
    });

    const updatedRow = screen.getByText('Derm, Ana').closest('tr');
    expect(updatedRow).toBeTruthy();

    await screen.findByRole('button', { name: 'History' });
    fireEvent.click(within(updatedRow as HTMLElement).getByRole('button', { name: 'History' }));
    await screen.findByText('Notification History');
    expect(apiMocks.getWaitlistNotifications).toHaveBeenCalledWith('tenant-1', 'token-1', 'wait-1');

    await screen.findByRole('button', { name: 'Fill' });
    fireEvent.click(within(updatedRow as HTMLElement).getByRole('button', { name: 'Fill' }));
    const fillModal = await screen.findByTestId('modal-fill-waitlist-entry');
    const fillScope = within(fillModal);
    fireEvent.change(fillScope.getByPlaceholderText('Enter appointment ID to link'), {
      target: { value: 'apt-123' },
    });
    fireEvent.click(fillScope.getByRole('button', { name: 'Fill & Schedule' }));

    await waitFor(() =>
      expect(apiMocks.fillWaitlistEntry).toHaveBeenCalledWith('tenant-1', 'token-1', 'wait-1', 'apt-123'),
    );
  });
});

describe('FaxPage', () => {
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    authMocks.session = adminSession;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    confirmSpy.mockReturnValue(true);
    HTMLAnchorElement.prototype.click = vi.fn();

    apiMocks.fetchFaxInbox.mockResolvedValue({
      faxes: [
        {
          id: 'fax-1',
          direction: 'inbound',
          fromNumber: '15551234567',
          toNumber: '15557654321',
          subject: 'Referral',
          pages: 2,
          status: 'received',
          receivedAt: '2024-02-01',
          createdAt: '2024-02-01',
          patientName: 'Derm, Ana',
          read: false,
          pdfUrl: 'https://example.com/fax.pdf',
        },
      ],
    });
    apiMocks.fetchFaxOutbox.mockResolvedValue({ faxes: [] });
    apiMocks.fetchFaxStats.mockResolvedValue({
      inboundTotal: 1,
      unreadTotal: 1,
      outboundTotal: 0,
      sendingTotal: 0,
      sentTotal: 0,
      failedTotal: 0,
    });
    apiMocks.fetchPatients.mockResolvedValue({
      patients: [{ id: 'patient-1', firstName: 'Ana', lastName: 'Derm' }],
    });
    apiMocks.fetchDocuments.mockResolvedValue({
      documents: [{ id: 'doc-1', name: 'Visit Note' }],
    });
    apiMocks.sendFax.mockResolvedValue({ ok: true });
    apiMocks.updateFax.mockResolvedValue({ ok: true });
    apiMocks.fetchFaxPdf.mockResolvedValue({ pdfUrl: 'https://example.com/fax.pdf' });
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    vi.clearAllMocks();
  });

  it('sends, previews, marks read, assigns, and downloads faxes', async () => {
    render(<FaxPage />);

    await screen.findByText('Referral');
    fireEvent.click(screen.getByRole('button', { name: 'Send Fax' }));

    const sendModal = await screen.findByTestId('modal-send-fax');
    const sendScope = within(sendModal);
    fireEvent.change(sendScope.getByPlaceholderText('+1 (555) 555-5555'), { target: { value: '+15551230000' } });
    fireEvent.change(sendScope.getByPlaceholderText('Patient Referral - Smith, John'), {
      target: { value: 'New Referral' },
    });
    fireEvent.change(sendScope.getByRole('combobox'), { target: { value: 'patient-1' } });
    const pagesInput = sendScope.getByText('Number of Pages').parentElement?.querySelector('input');
    if (!pagesInput) {
      throw new Error('Pages input not found');
    }
    fireEvent.change(pagesInput, { target: { value: '3' } });
    fireEvent.change(sendScope.getByPlaceholderText('Please find attached patient referral...'), {
      target: { value: 'Cover message' },
    });
    fireEvent.click(sendScope.getByRole('button', { name: 'Send Fax' }));

    await waitFor(() =>
      expect(apiMocks.sendFax).toHaveBeenCalledWith('tenant-1', 'token-1', {
        recipientNumber: '+15551230000',
        recipientName: '',
        subject: 'New Referral',
        coverPageMessage: 'Cover message',
        patientId: 'patient-1',
        encounterId: '',
        documentIds: [],
        pages: 3,
      }),
    );

    fireEvent.click(screen.getByText('Referral'));
    await waitFor(() =>
      expect(apiMocks.updateFax).toHaveBeenCalledWith('tenant-1', 'token-1', 'fax-1', { read: true }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    const assignModal = await screen.findByTestId('modal-assign-fax-to-patient');
    const assignScope = within(assignModal);
    fireEvent.change(assignScope.getByDisplayValue('Select patient'), { target: { value: 'patient-1' } });
    fireEvent.change(assignScope.getByPlaceholderText('Add any notes about this fax...'), {
      target: { value: 'Attach to chart' },
    });
    fireEvent.click(assignScope.getByRole('button', { name: 'Assign' }));
    await waitFor(() =>
      expect(apiMocks.updateFax).toHaveBeenCalledWith('tenant-1', 'token-1', 'fax-1', {
        patientId: 'patient-1',
        notes: 'Attach to chart',
      }),
    );

    const downloadButton = screen.getByRole('button', { name: 'Download' });
    fireEvent.click(downloadButton);
    await waitFor(() =>
      expect(apiMocks.fetchFaxPdf).toHaveBeenCalledWith('tenant-1', 'token-1', 'fax-1'),
    );
  });
});
