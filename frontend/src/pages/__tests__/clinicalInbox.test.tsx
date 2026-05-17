import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authMocks = vi.hoisted(() => ({
  session: null as null | {
    tenantId: string;
    accessToken: string;
    user: { id: string; role: string; roles?: string[] };
  },
  user: null as null | { id: string; role: string; roles?: string[] },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  approveRefillRequest: vi.fn(),
  createTask: vi.fn(),
  fetchBiopsyCommandCenter: vi.fn(),
  fetchFaxInbox: vi.fn(),
  fetchMessageThread: vi.fn(),
  fetchMessageThreads: vi.fn(),
  fetchOrders: vi.fn(),
  fetchPARequests: vi.fn(),
  fetchRefillRequestsNew: vi.fn(),
  fetchSMSConversations: vi.fn(),
  fetchStaffPatientMessageThread: vi.fn(),
  fetchStaffPatientMessageThreads: vi.fn(),
  fetchTasks: vi.fn(),
  markSMSConversationRead: vi.fn(),
  markStaffPatientMessageThreadRead: vi.fn(),
  markThreadAsRead: vi.fn(),
  sendStaffPatientMessageThreadMessage: vi.fn(),
  sendThreadMessage: vi.fn(),
  updateFax: vi.fn(),
  updateOrderStatus: vi.fn(),
  updateStaffPatientMessageThread: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui', () => ({
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" data-height={height ?? 0} />,
}));

import { ClinicalInboxPage } from '../ClinicalInboxPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', role: 'admin', roles: ['admin'] },
};

const setupApiMocks = () => {
  apiMocks.fetchStaffPatientMessageThreads.mockResolvedValue({
    threads: [
      {
        id: 'portal-1',
        patientId: 'patient-1',
        patientName: 'Ana Derm',
        patientMrn: 'MRN-1',
        subject: 'Portal rash question',
        category: 'medical',
        priority: 'urgent',
        status: 'open',
        lastMessagePreview: 'The rash is spreading',
        lastMessageAt: '2026-05-16T15:00:00.000Z',
        isReadByStaff: false,
      },
    ],
  });
  apiMocks.fetchStaffPatientMessageThread.mockResolvedValue({
    thread: {
      id: 'portal-1',
      patientId: 'patient-1',
      patientName: 'Ana Derm',
      patientMrn: 'MRN-1',
      subject: 'Portal rash question',
      category: 'medical',
      priority: 'urgent',
      status: 'open',
    },
    messages: [
      {
        id: 'pm-1',
        senderType: 'patient',
        senderName: 'Ana Derm',
        messageText: 'The rash is spreading',
        sentAt: '2026-05-16T15:00:00.000Z',
      },
    ],
  });
  apiMocks.fetchSMSConversations.mockResolvedValue({
    conversations: [
      {
        patientId: 'patient-2',
        patientName: 'Ben Skin',
        patientMrn: 'MRN-2',
        category: 'prescription',
        threadStatus: 'open',
        lastMessagePreview: 'Need refill status',
        lastMessageAt: '2026-05-16T14:00:00.000Z',
        unreadCount: 1,
      },
    ],
  });
  apiMocks.fetchMessageThreads.mockResolvedValue({
    threads: [
      {
        id: 'mail-1',
        subject: 'Pathology callback',
        patientId: 'patient-3',
        patientFirstName: 'Cara',
        patientLastName: 'Mole',
        lastMessage: { body: 'Please review this today' },
        updatedAt: '2026-05-16T13:00:00.000Z',
        unreadCount: 1,
      },
    ],
  });
  apiMocks.fetchMessageThread.mockResolvedValue({
    thread: { id: 'mail-1', subject: 'Pathology callback' },
    messages: [
      {
        id: 'mail-msg-1',
        senderFirstName: 'Cara',
        senderLastName: 'Mole',
        body: 'Please review this today',
        createdAt: '2026-05-16T13:00:00.000Z',
      },
    ],
  });
  apiMocks.fetchTasks.mockResolvedValue({
    tasks: [
      {
        id: 'task-1',
        title: 'Call patient',
        description: 'Discuss wound care',
        status: 'todo',
        priority: 'high',
        patientId: 'patient-4',
        patientFirstName: 'Dee',
        patientLastName: 'Care',
        dueDate: '2026-05-16',
        createdAt: '2026-05-15T10:00:00.000Z',
      },
    ],
  });
  apiMocks.fetchRefillRequestsNew.mockResolvedValue({
    refillRequests: [
      {
        id: 'refill-1',
        patientId: 'patient-5',
        patientFirstName: 'Eli',
        patientLastName: 'Rx',
        medicationName: 'Tretinoin 0.025% cream',
        pharmacyName: 'Demo Pharmacy',
        status: 'pending',
        requestedDate: '2026-05-16T12:00:00.000Z',
      },
    ],
  });
  apiMocks.fetchPARequests.mockResolvedValue([]);
  apiMocks.fetchOrders.mockResolvedValue({
    orders: [
      {
        id: 'order-1',
        patientId: 'patient-6',
        type: 'lab',
        status: 'pending',
        priority: 'stat',
        details: 'CBC for isotretinoin monitoring',
        createdAt: '2026-05-16T11:00:00.000Z',
      },
    ],
  });
  apiMocks.fetchBiopsyCommandCenter.mockResolvedValue({
    queues: {
      critical: [
        {
          id: 'biopsy-1',
          specimen_id: 'SP-100',
          patient_id: 'patient-7',
          patient_name: 'Fran Path',
          mrn: 'MRN-7',
          loop_status: 'Pending treatment scheduling',
          next_action: 'Schedule excision',
          highest_severity: 'critical',
          ordered_at: '2026-05-10T11:00:00.000Z',
        },
      ],
    },
  });
  apiMocks.fetchFaxInbox.mockResolvedValue({
    faxes: [
      {
        id: 'fax-1',
        subject: 'Outside records',
        fromNumber: '+15551234567',
        pages: 3,
        status: 'received',
        read: false,
        receivedAt: '2026-05-16T10:00:00.000Z',
      },
    ],
  });

  apiMocks.markStaffPatientMessageThreadRead.mockResolvedValue({ success: true });
  apiMocks.markThreadAsRead.mockResolvedValue({ success: true });
  apiMocks.sendStaffPatientMessageThreadMessage.mockResolvedValue({ messageId: 'reply-1' });
  apiMocks.sendThreadMessage.mockResolvedValue({ id: 'reply-2' });
  apiMocks.createTask.mockResolvedValue({ id: 'task-new' });
  apiMocks.updateStaffPatientMessageThread.mockResolvedValue({ success: true });
  apiMocks.updateTaskStatus.mockResolvedValue({ success: true });
  apiMocks.updateOrderStatus.mockResolvedValue({ success: true });
  apiMocks.approveRefillRequest.mockResolvedValue({ success: true, message: 'Approved' });
  apiMocks.updateFax.mockResolvedValue({ success: true });
  apiMocks.markSMSConversationRead.mockResolvedValue({ success: true });
};

describe('ClinicalInboxPage', () => {
  beforeEach(() => {
    authMocks.session = baseSession;
    authMocks.user = baseSession.user;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    setupApiMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates clinical work sources and replies to a portal message', async () => {
    render(
      <MemoryRouter initialEntries={['/clinical-inbox']}>
        <ClinicalInboxPage />
      </MemoryRouter>,
    );

    await screen.findByText('Clinical Inbox');
    expect(await screen.findByText('Portal rash question')).toBeInTheDocument();
    expect(screen.getByText('Refill request: Tretinoin 0.025% cream')).toBeInTheDocument();
    expect(screen.getAllByText('Biopsy follow-up: SP-100').length).toBeGreaterThan(0);
    expect(screen.getByText('Outside records')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Portal rash question'));

    await waitFor(() =>
      expect(apiMocks.fetchStaffPatientMessageThread).toHaveBeenCalledWith('tenant-1', 'token-1', 'portal-1'),
    );
    expect(apiMocks.markStaffPatientMessageThreadRead).toHaveBeenCalledWith('tenant-1', 'token-1', 'portal-1');
    await waitFor(() => expect(screen.getAllByText('The rash is spreading').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByPlaceholderText('Write the reply or internal note...'), {
      target: { value: 'Please upload a photo and we will review today.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(apiMocks.sendStaffPatientMessageThreadMessage).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'portal-1',
        'Please upload a photo and we will review today.',
        false,
      ),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Reply sent');
  });

  it('filters to Rx work and approves a refill against the refill API', async () => {
    render(
      <MemoryRouter initialEntries={['/clinical-inbox']}>
        <ClinicalInboxPage />
      </MemoryRouter>,
    );

    await screen.findByText('Refill request: Tretinoin 0.025% cream');
    fireEvent.click(screen.getByRole('button', { name: /Rx \/ ePA/ }));

    const workList = screen.getByLabelText('Clinical inbox work list');
    expect(within(workList).getByText('Refill request: Tretinoin 0.025% cream')).toBeInTheDocument();
    expect(within(workList).queryByText('Portal rash question')).not.toBeInTheDocument();

    fireEvent.click(within(workList).getByRole('button', { name: /Refill request: Tretinoin 0\.025% cream/ }));
    const detailPanel = screen.getByLabelText('Clinical inbox selected item');
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Approve refill' }));

    await waitFor(() =>
      expect(apiMocks.approveRefillRequest).toHaveBeenCalledWith('tenant-1', 'token-1', 'refill-1'),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Refill approved');
  });

  it('keeps the detail panel aligned with queue and priority filters', async () => {
    render(
      <MemoryRouter initialEntries={['/clinical-inbox']}>
        <ClinicalInboxPage />
      </MemoryRouter>,
    );

    await screen.findByText('Portal rash question');
    fireEvent.click(screen.getByRole('button', { name: /Rx \/ ePA/ }));

    const detailPanel = screen.getByLabelText('Clinical inbox selected item');
    expect(within(detailPanel).getByText('Refill request: Tretinoin 0.025% cream')).toBeInTheDocument();
    expect(within(detailPanel).queryByText('Portal rash question')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by priority'), { target: { value: 'critical' } });

    expect(screen.getByText('No open work here')).toBeInTheDocument();
    expect(within(detailPanel).getByText('No item selected')).toBeInTheDocument();
  });

  it('executes source-specific actions for messages, tasks, results, orders, texts, and faxes', async () => {
    render(
      <MemoryRouter initialEntries={['/clinical-inbox']}>
        <ClinicalInboxPage />
      </MemoryRouter>,
    );

    await screen.findByText('Portal rash question');
    const workList = screen.getByLabelText('Clinical inbox work list');
    const detailPanel = screen.getByLabelText('Clinical inbox selected item');

    fireEvent.click(within(workList).getByRole('button', { name: /Portal rash question/ }));
    await waitFor(() => expect(apiMocks.fetchStaffPatientMessageThread).toHaveBeenCalledWith('tenant-1', 'token-1', 'portal-1'));
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Move in progress' }));
    await waitFor(() =>
      expect(apiMocks.updateStaffPatientMessageThread).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'portal-1',
        { status: 'in-progress' },
      ),
    );

    fireEvent.click(within(workList).getByRole('button', { name: /Pathology callback/ }));
    await waitFor(() => expect(apiMocks.fetchMessageThread).toHaveBeenCalledWith('tenant-1', 'token-1', 'mail-1'));
    expect(apiMocks.markThreadAsRead).toHaveBeenCalledWith('tenant-1', 'token-1', 'mail-1');
    fireEvent.change(screen.getByPlaceholderText('Write the reply or internal note...'), {
      target: { value: 'Provider reviewed. Please call the patient today.' },
    });
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(apiMocks.sendThreadMessage).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'mail-1',
        'Provider reviewed. Please call the patient today.',
      ),
    );

    fireEvent.click(within(workList).getByRole('button', { name: /Text from Ben Skin/ }));
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Mark read' }));
    await waitFor(() =>
      expect(apiMocks.markSMSConversationRead).toHaveBeenCalledWith('tenant-1', 'token-1', 'patient-2'),
    );

    fireEvent.click(within(workList).getByRole('button', { name: /Call patient/ }));
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Complete task' }));
    await waitFor(() =>
      expect(apiMocks.updateTaskStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'task-1', 'completed'),
    );

    fireEvent.click(within(workList).getByRole('button', { name: /LAB order/ }));
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Complete order' }));
    await waitFor(() =>
      expect(apiMocks.updateOrderStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'order-1', 'completed'),
    );

    fireEvent.click(within(workList).getByRole('button', { name: /Outside records/ }));
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Mark read' }));
    await waitFor(() =>
      expect(apiMocks.updateFax).toHaveBeenCalledWith('tenant-1', 'token-1', 'fax-1', { read: true }),
    );

    fireEvent.click(within(workList).getByRole('button', { name: /Biopsy follow-up: SP-100/ }));
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Create follow-up' }));
    await waitFor(() =>
      expect(apiMocks.createTask).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        expect.objectContaining({
          title: 'Follow up: Biopsy follow-up: SP-100',
          category: 'lab-path-followup',
          priority: 'urgent',
          patientId: 'patient-7',
        }),
      ),
    );
  });

  it('supports portal triage changes and internal notes', async () => {
    render(
      <MemoryRouter initialEntries={['/clinical-inbox']}>
        <ClinicalInboxPage />
      </MemoryRouter>,
    );

    await screen.findByText('Portal rash question');
    fireEvent.click(within(screen.getByLabelText('Clinical inbox work list')).getByRole('button', { name: /Portal rash question/ }));
    await waitFor(() => expect(apiMocks.fetchStaffPatientMessageThread).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Internal note' }));
    expect(screen.getByRole('checkbox', { name: 'Internal note' })).toBeChecked();
    fireEvent.change(screen.getByPlaceholderText('Write the reply or internal note...'), {
      target: { value: 'Photo reviewed with Dr Demo before sending instructions.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(apiMocks.sendStaffPatientMessageThreadMessage).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'portal-1',
        'Photo reviewed with Dr Demo before sending instructions.',
        true,
      ),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Internal note added');

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'waiting-provider' } });
    await waitFor(() =>
      expect(apiMocks.updateStaffPatientMessageThread).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'portal-1',
        { status: 'waiting-provider' },
      ),
    );

    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
    await waitFor(() =>
      expect(apiMocks.updateStaffPatientMessageThread).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'portal-1',
        { priority: 'high' },
      ),
    );
  });
});
