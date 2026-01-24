import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

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
  fetchOrders: vi.fn(),
  fetchPatients: vi.fn(),
  createOrder: vi.fn(),
  sendErx: vi.fn(),
  getLastPDMPCheck: vi.fn(),
  checkFormulary: vi.fn(),
  checkPDMP: vi.fn(),
  fetchPatientMedicationHistory: vi.fn(),
  fetchRefillRequests: vi.fn(),
  denyRefill: vi.fn(),
  requestMedicationChange: vi.fn(),
  confirmAudit: vi.fn(),
  fetchPARequests: vi.fn(),
  fetchEligibilityHistoryBatch: vi.fn(),
  fetchRecallCampaigns: vi.fn(),
  createRecallCampaign: vi.fn(),
  updateRecallCampaign: vi.fn(),
  deleteRecallCampaign: vi.fn(),
  generateRecalls: vi.fn(),
  generateAllRecalls: vi.fn(),
  fetchDueRecalls: vi.fn(),
  fetchRecallHistory: vi.fn(),
  fetchRecallStats: vi.fn(),
  updateRecallStatus: vi.fn(),
  recordRecallContact: vi.fn(),
  exportRecalls: vi.fn(),
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
}));

vi.mock('../../components/prescriptions', () => ({
  DrugInteractionChecker: () => <div data-testid="drug-interaction-checker" />,
  PARequestModal: ({
    isOpen,
    prescription,
  }: {
    isOpen: boolean;
    prescription?: { id?: string };
  }) => (isOpen ? <div data-testid="pa-request-modal">PA {prescription?.id}</div> : null),
  PADetailModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="pa-detail-modal" /> : null),
  PAStatusBadge: ({ status }: { status: string }) => <span data-testid="pa-status-badge">{status}</span>,
}));

import { PrescriptionsPage } from '../PrescriptionsPage';
import { RemindersPage } from '../RemindersPage';

const adminSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fullName: 'Admin User' },
};

const confirmSpy = vi.spyOn(window, 'confirm');

afterAll(() => {
  confirmSpy.mockRestore();
});

describe('PrescriptionsPage', () => {
  beforeEach(() => {
    authMocks.session = adminSession;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();

    apiMocks.fetchOrders.mockResolvedValue({
      orders: [
        {
          id: 'rx-1',
          patientId: 'patient-1',
          type: 'rx',
          status: 'pending',
          details: 'Tretinoin 0.025% cream\nQty: 30g\nSig: Twice daily\nRefills: 0',
          createdAt: '2024-01-01',
        },
      ],
    });
    apiMocks.fetchPatients.mockResolvedValue({
      patients: [{ id: 'patient-1', firstName: 'Ana', lastName: 'Derm' }],
    });
    apiMocks.fetchEligibilityHistoryBatch.mockResolvedValue({ history: {} });
    apiMocks.fetchPARequests.mockResolvedValue([]);
    apiMocks.getLastPDMPCheck.mockResolvedValue({ lastCheckAt: null });
    apiMocks.checkFormulary.mockResolvedValue({ status: 'Preferred' });
    apiMocks.checkPDMP.mockResolvedValue({ riskScore: 'Low', totalControlledRxLast6Months: 0, flags: [] });
    apiMocks.fetchPatientMedicationHistory.mockResolvedValue([]);
    apiMocks.createOrder.mockResolvedValue({ id: 'rx-2' });
    apiMocks.sendErx.mockResolvedValue({ ok: true });
    apiMocks.fetchRefillRequests.mockResolvedValue({
      refillRequests: [
        {
          id: 'refill-1',
          patientFirstName: 'Ana',
          patientLastName: 'Derm',
          medication_name: 'Doxycycline',
          strength: '100mg',
          sent_at: '2024-02-01',
          refill_status: 'pending',
          denial_reason: null,
          change_request_details: null,
        },
      ],
    });
    apiMocks.denyRefill.mockResolvedValue({ ok: true });
    apiMocks.requestMedicationChange.mockResolvedValue({ ok: true });
    apiMocks.confirmAudit.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a prescription, sends eRx, and opens PA request', async () => {
    render(
      <MemoryRouter>
        <PrescriptionsPage />
      </MemoryRouter>
    );

    await screen.findByText('All Prescriptions');
    fireEvent.click(screen.getByRole('button', { name: /New Prescription/i }));

    const modalScope = within(await screen.findByTestId('modal-new-prescription'));
    const selects = modalScope.getAllByRole('combobox');

    fireEvent.change(selects[0], { target: { value: 'patient-1' } });
    fireEvent.change(modalScope.getByPlaceholderText('Search or type medication name...'), {
      target: { value: 'Tretinoin 0.025% cream' },
    });
    fireEvent.click(modalScope.getByText('Tretinoin 0.025% cream'));
    await screen.findByText('Selected: Tretinoin 0.025% cream');
    fireEvent.change(modalScope.getByPlaceholderText('Apply to affected area...'), {
      target: { value: 'Apply nightly' },
    });
    fireEvent.change(modalScope.getByPlaceholderText('CVS, Walgreens, etc.'), {
      target: { value: 'CVS' },
    });
    fireEvent.click(modalScope.getByRole('button', { name: 'Create Prescription' }));

    await waitFor(() => expect(apiMocks.createOrder).toHaveBeenCalled());
    const createCall = apiMocks.createOrder.mock.calls[0][2];
    expect(createCall.patientId).toBe('patient-1');
    expect(createCall.notes).toBe('Pharmacy: CVS');
    expect(createCall.details).toContain('Tretinoin 0.025% cream');
    expect(createCall.details).toContain('Instructions: Apply nightly');

    const rxRow = screen.getByText('Derm, Ana').closest('tr');
    expect(rxRow).toBeTruthy();
    fireEvent.click(within(rxRow as HTMLElement).getByRole('button', { name: 'Send eRx' }));
    await waitFor(() =>
      expect(apiMocks.sendErx).toHaveBeenCalledWith('tenant-1', 'token-1', {
        orderId: 'rx-1',
        patientId: 'patient-1',
      }),
    );

    fireEvent.click(within(rxRow as HTMLElement).getByRole('button', { name: 'Request PA' }));
    expect(screen.getByTestId('pa-request-modal')).toBeInTheDocument();
  });

  it('handles refill requests with deny, change, and audit confirmation', async () => {
    render(
      <MemoryRouter>
        <PrescriptionsPage />
      </MemoryRouter>
    );
    await screen.findByText('All Prescriptions');

    fireEvent.click(screen.getByRole('button', { name: /Refill Requests/i }));
    await screen.findByText('Refill Status');

    fireEvent.click(screen.getByRole('button', { name: 'Audit Confirm' }));
    await waitFor(() =>
      expect(apiMocks.confirmAudit).toHaveBeenCalledWith('tenant-1', 'token-1', 'refill-1'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deny Refill' }));
    const denyModal = await screen.findByTestId('modal-deny-refill-request');
    const denyScope = within(denyModal);
    fireEvent.change(denyScope.getByRole('combobox'), { target: { value: 'Patient Needs Evaluation' } });
    fireEvent.change(denyScope.getByPlaceholderText('Provide additional details...'), {
      target: { value: 'Needs follow up' },
    });
    fireEvent.click(denyScope.getByRole('button', { name: 'Deny Refill' }));
    await waitFor(() =>
      expect(apiMocks.denyRefill).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'refill-1',
        'Patient Needs Evaluation: Needs follow up',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Request Change' }));
    const changeModal = await screen.findByTestId('modal-request-medication-change');
    const changeScope = within(changeModal);
    fireEvent.change(changeScope.getByRole('combobox'), { target: { value: 'Dosage Change' } });
    fireEvent.change(changeScope.getByPlaceholderText('Describe the requested change...'), {
      target: { value: 'Reduce dose' },
    });
    fireEvent.click(changeScope.getByRole('button', { name: 'Submit Request' }));
    await waitFor(() =>
      expect(apiMocks.requestMedicationChange).toHaveBeenCalledWith('tenant-1', 'token-1', 'refill-1', {
        changeType: 'Dosage Change',
        details: 'Reduce dose',
      }),
    );
  });
});

describe('RemindersPage', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    authMocks.session = adminSession;
    confirmSpy.mockReturnValue(true);
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();

    apiMocks.fetchRecallCampaigns.mockResolvedValue({
      campaigns: [
        {
          id: 'camp-1',
          name: 'Annual Skin Check',
          description: 'Annual screening',
          recallType: 'Annual Skin Check',
          intervalMonths: 12,
          isActive: true,
        },
      ],
    });
    apiMocks.fetchDueRecalls.mockResolvedValue({
      recalls: [
        {
          id: 'recall-1',
          firstName: 'Ana',
          lastName: 'Derm',
          phone: '555-1000',
          campaignName: 'Annual Skin Check',
          recallType: 'Annual Skin Check',
          dueDate: '2024-02-10',
          status: 'pending',
          contactAttempts: 0,
        },
      ],
    });
    apiMocks.fetchRecallStats.mockResolvedValue({
      overall: {
        total_recalls: 5,
        total_pending: 3,
        total_contacted: 1,
        total_scheduled: 1,
        total_completed: 0,
        contactRate: 33.3,
        conversionRate: 25.0,
      },
      byCampaign: [
        { id: 'camp-1', total_recalls: 5, pending: 2, contacted: 1, scheduled: 1, completed: 1, dismissed: 0 },
      ],
    });
    apiMocks.fetchRecallHistory.mockResolvedValue({
      history: [
        {
          id: 'hist-1',
          campaignName: 'Annual Skin Check',
          firstName: 'Ana',
          lastName: 'Derm',
          reminderType: 'sms',
          deliveryStatus: 'delivered',
          messageContent: 'Left message',
          sentAt: '2024-02-01T10:00:00Z',
        },
      ],
    });
    apiMocks.fetchPatients.mockResolvedValue({ patients: [] });
    apiMocks.generateAllRecalls.mockResolvedValue({ created: 2 });
    apiMocks.generateRecalls.mockResolvedValue({ created: 1 });
    apiMocks.createRecallCampaign.mockResolvedValue({ id: 'camp-2' });
    apiMocks.updateRecallCampaign.mockResolvedValue({ ok: true });
    apiMocks.deleteRecallCampaign.mockResolvedValue({ ok: true });
    apiMocks.recordRecallContact.mockResolvedValue({ ok: true });
    apiMocks.updateRecallStatus.mockResolvedValue({ ok: true });
    apiMocks.exportRecalls.mockResolvedValue(new Blob(['recalls']));
  });

  afterEach(() => {
    confirmSpy.mockReset();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    vi.clearAllMocks();
  });

  it('manages campaigns with generate, edit, toggle, and delete actions', async () => {
    render(
      <MemoryRouter>
        <RemindersPage />
      </MemoryRouter>
    );

    await screen.findByText('Reminders & Recalls');
    fireEvent.click(screen.getByRole('button', { name: 'Generate All Recalls' }));
    await waitFor(() =>
      expect(apiMocks.generateAllRecalls).toHaveBeenCalledWith('tenant-1', 'token-1'),
    );

    const campaignCard = screen.getByRole('heading', { name: 'Annual Skin Check' }).closest('.campaign-card');
    expect(campaignCard).toBeTruthy();
    fireEvent.click(within(campaignCard as HTMLElement).getByRole('button', { name: 'Generate Recalls' }));
    await waitFor(() =>
      expect(apiMocks.generateRecalls).toHaveBeenCalledWith('tenant-1', 'token-1', 'camp-1'),
    );

    fireEvent.click(within(campaignCard as HTMLElement).getByRole('button', { name: 'Edit' }));
    const editModal = await screen.findByTestId('modal-edit-campaign');
    const editScope = within(editModal);
    fireEvent.change(editScope.getByPlaceholderText('e.g., Annual Skin Check 2024'), {
      target: { value: 'Updated Campaign' },
    });
    fireEvent.click(editScope.getByRole('button', { name: 'Update Campaign' }));
    await waitFor(() =>
      expect(apiMocks.updateRecallCampaign).toHaveBeenCalledWith('tenant-1', 'token-1', 'camp-1', {
        name: 'Updated Campaign',
        description: 'Annual screening',
        recallType: 'Annual Skin Check',
        intervalMonths: 12,
        isActive: true,
      }),
    );

    fireEvent.click(within(campaignCard as HTMLElement).getByRole('checkbox'));
    await waitFor(() =>
      expect(apiMocks.updateRecallCampaign).toHaveBeenCalledWith('tenant-1', 'token-1', 'camp-1', { isActive: false }),
    );

    fireEvent.click(within(campaignCard as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(apiMocks.deleteRecallCampaign).toHaveBeenCalledWith('tenant-1', 'token-1', 'camp-1'),
    );
  });

  it('records contacts, updates status, exports, and loads history', async () => {
    render(
      <MemoryRouter>
        <RemindersPage />
      </MemoryRouter>
    );
    await screen.findByText('Reminders & Recalls');

    fireEvent.click(screen.getByRole('button', { name: /Due for Recall/i }));
    await screen.findByText('Derm, Ana');

    const recallRow = screen.getByText('Derm, Ana').closest('tr');
    expect(recallRow).toBeTruthy();
    fireEvent.click(within(recallRow as HTMLElement).getByRole('button', { name: 'Contact' }));
    const contactModal = await screen.findByTestId('modal-record-contact');
    const contactScope = within(contactModal);
    fireEvent.change(contactScope.getByRole('combobox'), { target: { value: 'sms' } });
    fireEvent.change(contactScope.getByPlaceholderText('Call notes, patient response, etc...'), {
      target: { value: 'Sent SMS' },
    });
    fireEvent.change(contactScope.getByPlaceholderText('Content of email/SMS/voicemail sent...'), {
      target: { value: 'Please call to schedule.' },
    });
    fireEvent.click(contactScope.getByRole('button', { name: 'Record Contact' }));
    await waitFor(() =>
      expect(apiMocks.recordRecallContact).toHaveBeenCalledWith('tenant-1', 'token-1', 'recall-1', {
        contactMethod: 'sms',
        notes: 'Sent SMS',
        messageContent: 'Please call to schedule.',
      }),
    );

    fireEvent.change(within(recallRow as HTMLElement).getByRole('combobox'), { target: { value: 'contacted' } });
    await waitFor(() =>
      expect(apiMocks.updateRecallStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'recall-1', {
        status: 'contacted',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export to CSV' }));
    await waitFor(() =>
      expect(apiMocks.exportRecalls).toHaveBeenCalledWith('tenant-1', 'token-1', expect.any(Object)),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Contact History' }));
    await screen.findByText('Derm, Ana');
    expect(apiMocks.fetchRecallHistory).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    await screen.findByText('Total Recalls');
  });
});
