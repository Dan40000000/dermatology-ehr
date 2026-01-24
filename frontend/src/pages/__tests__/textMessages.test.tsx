import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchPatients: vi.fn(),
  fetchSMSTemplates: vi.fn(),
  createSMSTemplate: vi.fn(),
  updateSMSTemplate: vi.fn(),
  deleteSMSTemplate: vi.fn(),
  sendBulkSMS: vi.fn(),
  fetchScheduledMessages: vi.fn(),
  createScheduledMessage: vi.fn(),
  cancelScheduledMessage: vi.fn(),
  fetchSMSConversations: vi.fn(),
  fetchSMSConversation: vi.fn(),
  sendSMSConversationMessage: vi.fn(),
  markSMSConversationRead: vi.fn(),
  getSMSConsent: vi.fn(),
  recordSMSConsent: vi.fn(),
  revokeSMSConsent: vi.fn(),
  fetchSMSAuditLog: vi.fn(),
  exportSMSAuditLog: vi.fn(),
  fetchSMSAuditSummary: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui', () => ({
  Panel: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="panel">
      {title ? <div>{title}</div> : null}
      {children}
    </div>
  ),
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" data-height={height ?? 0} />,
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title?: string; children: React.ReactNode }) => {
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

import TextMessagesPage from '../TextMessagesPage';

const buildFixtures = () => ({
  conversations: [
    {
      patientId: 'patient-1',
      firstName: 'Ana',
      lastName: 'Derm',
      phone: '5551112222',
      lastMessage: 'See you soon',
      lastMessageTime: '2024-04-10T10:00:00.000Z',
      unreadCount: 2,
      smsOptIn: true,
    },
    {
      patientId: 'patient-2',
      firstName: 'Ben',
      lastName: 'Skin',
      phone: '5553334444',
      lastMessage: 'Stop',
      lastMessageTime: '2024-04-09T10:00:00.000Z',
      unreadCount: 0,
      smsOptIn: false,
    },
  ],
  templates: [
    {
      id: 'tpl-1',
      name: 'Appointment Reminder',
      body: 'Hi {patientName}, your appointment is on {date} at {time}.',
      category: 'appointment_reminders',
      isActive: true,
      createdAt: '2024-04-01',
    },
    {
      id: 'tpl-2',
      name: 'Lab Results',
      body: 'Hi {patientName}, your lab results are ready.',
      category: 'follow_up_care',
      isActive: true,
      createdAt: '2024-04-02',
    },
  ],
  conversation: {
    patientId: 'patient-1',
    patientName: 'Ana Derm',
    patientPhone: '5551112222',
    messages: [
      {
        id: 'msg-1',
        direction: 'inbound',
        messageBody: 'Hello from patient',
        status: 'received',
        createdAt: '2024-04-10T09:00:00.000Z',
      },
    ],
  },
  scheduled: [
    {
      id: 'sch-1',
      patientId: 'patient-1',
      recipientName: 'Ana Derm',
      recipientPhone: '5551112222',
      messageBody: 'Reminder message',
      scheduledFor: '2024-04-20T09:00:00.000Z',
      status: 'scheduled',
      createdAt: '2024-04-01T09:00:00.000Z',
    },
  ],
});

describe('TextMessagesPage', () => {
  beforeEach(() => {
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };
    const fixtures = buildFixtures();
    apiMocks.fetchSMSConversations.mockResolvedValue({ conversations: fixtures.conversations });
    apiMocks.fetchSMSTemplates.mockResolvedValue({ templates: fixtures.templates });
    apiMocks.fetchSMSConversation.mockResolvedValue(fixtures.conversation);
    apiMocks.markSMSConversationRead.mockResolvedValue({ ok: true });
    apiMocks.sendSMSConversationMessage.mockResolvedValue({ ok: true });
    apiMocks.createScheduledMessage.mockResolvedValue({ ok: true });
    apiMocks.createSMSTemplate.mockResolvedValue({ ok: true });
    apiMocks.updateSMSTemplate.mockResolvedValue({ ok: true });
    apiMocks.deleteSMSTemplate.mockResolvedValue({ ok: true });
    apiMocks.sendBulkSMS.mockResolvedValue({ ok: true });
    apiMocks.fetchScheduledMessages.mockResolvedValue({ scheduled: fixtures.scheduled });
    apiMocks.cancelScheduledMessage.mockResolvedValue({ ok: true });
    apiMocks.getSMSConsent.mockResolvedValue({ hasConsent: true, daysUntilExpiration: 30 });
    apiMocks.recordSMSConsent.mockResolvedValue({ ok: true });
    apiMocks.revokeSMSConsent.mockResolvedValue({ ok: true });
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  }, 15000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('loads conversations, inserts templates, sends messages, and schedules', async () => {
    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });

    expect(apiMocks.fetchSMSConversations).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(screen.getByText('Ana Derm')).toBeInTheDocument();
    expect(screen.getByText('Ben Skin')).toBeInTheDocument();
    expect(screen.getByText('Opted Out')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ben Skin'));
    expect(apiMocks.fetchSMSConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Ana Derm'));
    await waitFor(() => expect(apiMocks.fetchSMSConversation).toHaveBeenCalledWith('tenant-1', 'token-1', 'patient-1'));
    expect(screen.getByText('Hello from patient')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'T' }));
    expect(screen.getByText('Insert Template')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Appointment Reminder'));

    const messageBox = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
    expect(messageBox.value).toContain('Ana');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(apiMocks.sendSMSConversationMessage).toHaveBeenCalled());
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Message sent');

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    const scheduleModal = await screen.findByTestId('modal-schedule-message');
    const scheduleScope = within(scheduleModal);
    const scheduleSelects = scheduleModal.querySelectorAll('select');
    const dateInput = scheduleModal.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = scheduleModal.querySelector('input[type="time"]') as HTMLInputElement;
    const scheduleDate = new Date();
    scheduleDate.setDate(scheduleDate.getDate() + 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    const scheduledDateValue = `${scheduleDate.getFullYear()}-${pad(scheduleDate.getMonth() + 1)}-${pad(
      scheduleDate.getDate(),
    )}`;
    fireEvent.change(scheduleSelects[0], { target: { value: 'patient-1' } });
    fireEvent.change(scheduleScope.getByPlaceholderText('Enter message...'), { target: { value: 'See you soon' } });
    fireEvent.change(dateInput, { target: { value: scheduledDateValue } });
    fireEvent.change(timeInput, { target: { value: '09:30' } });
    const scheduleButton = scheduleScope.getByRole('button', { name: 'Schedule Message' });
    expect(scheduleButton).toBeEnabled();
    fireEvent.click(scheduleButton);

    const scheduledFor = new Date(`${scheduledDateValue}T09:30`).toISOString();
    await waitFor(() =>
      expect(apiMocks.createScheduledMessage).toHaveBeenCalledWith('tenant-1', 'token-1', {
        patientId: 'patient-1',
        messageBody: 'See you soon',
        scheduledFor,
      }),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Message scheduled');
  });

  it('manages templates, bulk send, scheduled cancel, and opt-in settings', async () => {
    const fixtures = buildFixtures();
    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));

    const templateModal = await screen.findByTestId('modal-new-template');
    const templateScope = within(templateModal);
    fireEvent.change(templateScope.getByPlaceholderText('e.g., Appointment Reminder'), { target: { value: 'New Template' } });
    fireEvent.change(templateScope.getByRole('combobox'), { target: { value: 'general_communication' } });
    fireEvent.change(templateScope.getByPlaceholderText('Enter your template message...'), { target: { value: 'Hello there' } });
    fireEvent.click(templateScope.getByRole('button', { name: 'Create Template' }));

    await waitFor(() =>
      expect(apiMocks.createSMSTemplate).toHaveBeenCalledWith('tenant-1', 'token-1', {
        name: 'New Template',
        body: 'Hello there',
        category: 'general_communication',
      }),
    );

    const templateRow = screen.getByText('Appointment Reminder').closest('tr');
    expect(templateRow).toBeTruthy();
    fireEvent.click(within(templateRow as HTMLElement).getByRole('button', { name: 'Edit' }));
    const editModal = await screen.findByTestId('modal-edit-template');
    const editScope = within(editModal);
    const editNameInput = editScope.getByPlaceholderText('e.g., Appointment Reminder');
    fireEvent.change(editNameInput, { target: { value: 'Updated Template' } });
    fireEvent.click(editScope.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(apiMocks.updateSMSTemplate).toHaveBeenCalledWith('tenant-1', 'token-1', fixtures.templates[0].id, {
        name: 'Updated Template',
        body: fixtures.templates[0].body,
        category: fixtures.templates[0].category,
      }),
    );

    fireEvent.click(within(templateRow as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(apiMocks.deleteSMSTemplate).toHaveBeenCalledWith('tenant-1', 'token-1', fixtures.templates[0].id),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bulk Send' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select All Opted-In' }));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: fixtures.templates[1].id } });
    const bulkMessageBox = screen.getByPlaceholderText('Enter your message...');
    expect(bulkMessageBox).toHaveValue(fixtures.templates[1].body);

    fireEvent.click(screen.getByRole('button', { name: /Send to 1 Patient/ }));
    await waitFor(() =>
      expect(apiMocks.sendBulkSMS).toHaveBeenCalledWith('tenant-1', 'token-1', {
        patientIds: ['patient-1'],
        message: fixtures.templates[1].body,
        templateId: fixtures.templates[1].id,
      }),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Messages sent to 1 patients');

    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
    await waitFor(() => expect(apiMocks.fetchScheduledMessages).toHaveBeenCalledWith('tenant-1', 'token-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(apiMocks.cancelScheduledMessage).toHaveBeenCalledWith('tenant-1', 'token-1', fixtures.scheduled[0].id),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Scheduled message cancelled');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opt Out' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Patient opted out of SMS');
  });

  it('shows empty states, search filtering, and time/phone formatting', async () => {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const conversations = [
      {
        patientId: 'patient-1',
        firstName: 'Ana',
        lastName: 'Derm',
        phone: '5551112222',
        lastMessage: 'Today update',
        lastMessageTime: now.toISOString(),
        unreadCount: 0,
        smsOptIn: true,
      },
      {
        patientId: 'patient-2',
        firstName: 'Ben',
        lastName: 'Skin',
        phone: '5553334444',
        lastMessage: 'Yesterday update',
        lastMessageTime: new Date(now.getTime() - dayMs).toISOString(),
        unreadCount: 1,
        smsOptIn: true,
      },
      {
        patientId: 'patient-3',
        firstName: 'Cara',
        lastName: 'Clinic',
        phone: '5557778888',
        lastMessage: 'Week update',
        lastMessageTime: new Date(now.getTime() - 3 * dayMs).toISOString(),
        unreadCount: 0,
        smsOptIn: true,
      },
      {
        patientId: 'patient-4',
        firstName: 'Dee',
        lastName: 'Short',
        phone: '555-111',
        lastMessage: '',
        lastMessageTime: new Date(now.getTime() - 10 * dayMs).toISOString(),
        unreadCount: 0,
        smsOptIn: true,
      },
    ];

    apiMocks.fetchSMSConversations.mockResolvedValueOnce({ conversations });
    apiMocks.fetchSMSTemplates.mockResolvedValueOnce({ templates: [] });
    apiMocks.fetchSMSConversation.mockResolvedValueOnce({
      patientId: 'patient-1',
      patientName: 'Ana Derm',
      patientPhone: '5551112222',
      messages: [],
    });

    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });

    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();

    const weekday = new Date(now.getTime() - 3 * dayMs).toLocaleDateString([], { weekday: 'short' });
    expect(screen.getByText(weekday)).toBeInTheDocument();

    const monthDay = new Date(now.getTime() - 10 * dayMs).toLocaleDateString([], { month: 'short', day: 'numeric' });
    expect(screen.getByText(monthDay)).toBeInTheDocument();
    expect(screen.getByText('555-111')).toBeInTheDocument();

    const searchInput = screen.getAllByPlaceholderText('Search patients...')[0];
    fireEvent.change(searchInput, { target: { value: 'no match' } });
    expect(screen.getByText('No patients with phone numbers')).toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: '' } });

    fireEvent.click(screen.getByText('Ana Derm'));
    await screen.findByText('No messages yet');

    fireEvent.click(screen.getByRole('button', { name: 'T' }));
    expect(screen.getByText('No templates available')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(screen.getByText('No templates yet')).toBeInTheDocument();
  });

  it('handles fallbacks, scheduling, and settings toggles', async () => {
    apiMocks.fetchSMSTemplates.mockRejectedValueOnce(new Error('template load failed'));
    apiMocks.fetchScheduledMessages.mockRejectedValueOnce(new Error('scheduled load failed'));
    apiMocks.sendSMSConversationMessage.mockRejectedValueOnce(new Error('send failed'));
    apiMocks.createSMSTemplate.mockRejectedValueOnce(new Error('create failed'));
    apiMocks.updateSMSTemplate.mockRejectedValueOnce(new Error('update failed'));
    apiMocks.deleteSMSTemplate.mockRejectedValueOnce(new Error('delete failed'));
    apiMocks.sendBulkSMS.mockRejectedValueOnce(new Error('bulk failed'));
    apiMocks.createScheduledMessage.mockRejectedValueOnce(new Error('schedule failed'));
    apiMocks.cancelScheduledMessage.mockRejectedValueOnce(new Error('cancel failed'));

    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });

    fireEvent.click(screen.getByText('Ana Derm'));
    await screen.findByText('Hello from patient');

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Test send' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('send failed'));

    // Since templates failed to load initially, the template dropdown will be empty
    // Skip the template insertion test in this scenario
    fireEvent.click(screen.getByRole('button', { name: 'T' }));
    await waitFor(() => expect(screen.getByText('Insert Template')).toBeInTheDocument());
    expect(screen.getByText('No templates available')).toBeInTheDocument();
    // Close template selector
    fireEvent.click(screen.getByRole('button', { name: 'T' }));

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    await waitFor(() => expect(screen.getByText('No templates yet')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
    const templateModal = await screen.findByTestId('modal-new-template');
    const templateForm = templateModal.querySelector('form');
    expect(templateForm).toBeTruthy();
    fireEvent.submit(templateForm as HTMLFormElement);
    expect(apiMocks.createSMSTemplate).not.toHaveBeenCalled();

    const templateScope = within(templateModal);
    fireEvent.change(templateScope.getByPlaceholderText('e.g., Appointment Reminder'), { target: { value: 'Recovery' } });
    fireEvent.change(templateScope.getByRole('combobox'), { target: { value: 'general_communication' } });
    fireEvent.change(templateScope.getByPlaceholderText('Enter your template message...'), { target: { value: 'Recover soon' } });
    fireEvent.click(templateScope.getByRole('button', { name: 'Create Template' }));

    // First attempt fails, error should be shown, modal stays open
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('create failed'));

    // Try again from the same modal - should succeed this time
    fireEvent.click(templateScope.getByRole('button', { name: 'Create Template' }));

    await waitFor(() => expect(toastMocks.showSuccess).toHaveBeenCalledWith('Template created'));

    // After successful creation, templates are reloaded from the backend
    // The mock returns the fixture templates, so we should see those
    await waitFor(() => expect(screen.getByText('Appointment Reminder')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Lab Results')).toBeInTheDocument());

    // Now test editing one of the loaded templates
    const appointmentRow = screen.getByText('Appointment Reminder').closest('tr');
    expect(appointmentRow).toBeTruthy();
    fireEvent.click(within(appointmentRow as HTMLElement).getByRole('button', { name: 'Edit' }));
    const editModal = await screen.findByTestId('modal-edit-template');
    const editScope = within(editModal);
    fireEvent.change(editScope.getByPlaceholderText('e.g., Appointment Reminder'), { target: { value: 'Updated Reminder' } });
    fireEvent.click(editScope.getByRole('button', { name: 'Save Changes' }));

    // First update attempt fails
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('update failed'));

    // Try again - should succeed
    fireEvent.click(editScope.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(toastMocks.showSuccess).toHaveBeenCalledWith('Template updated'));

    // After update, templates are reloaded and we should see the fixture templates again
    await waitFor(() => expect(screen.getByText('Appointment Reminder')).toBeInTheDocument());

    // Test deleting a template
    const labResultsRow = screen.getByText('Lab Results').closest('tr');
    expect(labResultsRow).toBeTruthy();
    fireEvent.click(within(labResultsRow as HTMLElement).getByRole('button', { name: 'Delete' }));

    // First delete attempt fails
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('delete failed'));

    // Try again - should succeed (need to find the row again as it might have re-rendered)
    const labResultsRow2 = screen.getByText('Lab Results').closest('tr');
    fireEvent.click(within(labResultsRow2 as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toastMocks.showSuccess).toHaveBeenCalledWith('Template deleted'));
    // After delete, the template should be removed from the state
    await waitFor(() => expect(screen.queryByText('Lab Results')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Bulk Send' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select All Opted-In' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tpl-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Send to 1 Patient/ }));

    // First bulk send attempt fails
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('bulk failed'));

    // Try again - should succeed
    fireEvent.click(screen.getByRole('button', { name: /Send to 1 Patient/ }));
    await waitFor(() => expect(toastMocks.showSuccess).toHaveBeenCalledWith('Messages sent to 1 patients'));

    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));

    // First scheduled messages load fails (mockRejectedValueOnce on line 380)
    // So we should see empty state initially
    await waitFor(() => expect(screen.getByText('No scheduled messages')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '+ Schedule Message' }));
    const scheduleModal = await screen.findByTestId('modal-schedule-message');
    const scheduleForm = scheduleModal.querySelector('form');
    expect(scheduleForm).toBeTruthy();
    fireEvent.submit(scheduleForm as HTMLFormElement);

    const scheduleScope = within(scheduleModal);
    const scheduleSelects = scheduleModal.querySelectorAll('select');
    const dateInput = scheduleModal.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = scheduleModal.querySelector('input[type="time"]') as HTMLInputElement;
    const scheduleDate = new Date();
    scheduleDate.setDate(scheduleDate.getDate() + 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    const scheduledDateValue = `${scheduleDate.getFullYear()}-${pad(scheduleDate.getMonth() + 1)}-${pad(
      scheduleDate.getDate(),
    )}`;

    fireEvent.change(scheduleSelects[0], { target: { value: 'patient-1' } });
    fireEvent.change(scheduleSelects[1], { target: { value: 'tpl-1' } });
    const scheduleMessage = scheduleScope.getByPlaceholderText('Enter message...') as HTMLTextAreaElement;
    expect(scheduleMessage.value).toContain('Ana');
    fireEvent.change(dateInput, { target: { value: scheduledDateValue } });
    fireEvent.change(timeInput, { target: { value: '09:30' } });
    fireEvent.click(scheduleScope.getByRole('button', { name: 'Schedule Message' }));

    // First schedule attempt fails
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('schedule failed'));

    // Try again - should succeed
    fireEvent.click(scheduleScope.getByRole('button', { name: 'Schedule Message' }));
    await waitFor(() => expect(toastMocks.showSuccess).toHaveBeenCalledWith('Message scheduled'));

    // After successful scheduling, scheduled messages are reloaded from backend
    // The fixture has one scheduled message with text "Reminder message"
    await waitFor(() => expect(screen.getByText('Reminder message')).toBeInTheDocument());

    // Find the cancel button for the scheduled message
    // There should be a table row with the message, find its cancel button
    const messageRow = screen.getByText('Reminder message').closest('tr');
    expect(messageRow).toBeTruthy();
    const cancelButton = within(messageRow as HTMLElement).getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    // First cancel attempt fails
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('cancel failed'));

    // Try again - should succeed
    fireEvent.click(cancelButton);
    await waitFor(() => expect(toastMocks.showSuccess).toHaveBeenCalledWith('Scheduled message cancelled'));
    // After cancellation, the status should be updated to 'cancelled'
    await waitFor(() => expect(screen.getByText('cancelled')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opt In' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Patient opted in to SMS');
  });

  it('surfaces conversation load errors', async () => {
    apiMocks.fetchSMSConversations.mockRejectedValueOnce(new Error('load failed'));

    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });
    expect(toastMocks.showError).toHaveBeenCalledWith('load failed');
  });

  it('handles empty payloads for conversations, templates, and scheduled', async () => {
    apiMocks.fetchSMSConversations.mockResolvedValueOnce({});
    apiMocks.fetchSMSTemplates.mockResolvedValueOnce({});
    apiMocks.fetchScheduledMessages.mockResolvedValueOnce({});

    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });
    expect(screen.getByText('No patients with phone numbers')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
    await screen.findByText('No scheduled messages');
  });

  it('handles conversation load failures without a message', async () => {
    apiMocks.fetchSMSConversation.mockRejectedValueOnce({});

    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });
    fireEvent.click(screen.getByText('Ana Derm'));

    await waitFor(() =>
      expect(toastMocks.showError).toHaveBeenCalledWith('Failed to load conversation'),
    );
  });

  it('falls back when send errors lack a message', async () => {
    apiMocks.sendSMSConversationMessage.mockRejectedValueOnce({});

    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });
    fireEvent.click(screen.getByText('Ana Derm'));
    await screen.findByText('Hello from patient');

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Ping' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(toastMocks.showError).toHaveBeenCalledWith('Failed to send message'),
    );
  });

  it('covers status branches, bulk toggles, and scheduled fallbacks', async () => {
    const now = '2024-04-10T10:00:00.000Z';
    apiMocks.fetchSMSConversations.mockResolvedValueOnce({
      conversations: [
        {
          patientId: 'patient-1',
          firstName: 'Ana',
          lastName: '',
          phone: undefined,
          lastMessage: '',
          lastMessageTime: undefined,
          unreadCount: 0,
          smsOptIn: true,
        },
        {
          patientId: 'patient-2',
          firstName: '',
          lastName: 'Null',
          phone: '5552223333',
          lastMessage: 'Ping',
          lastMessageTime: now,
          unreadCount: 1,
          smsOptIn: false,
          optedOutAt: now,
        },
      ],
    });
    apiMocks.fetchSMSTemplates.mockResolvedValueOnce([
      {
        id: 'tpl-x',
        name: 'General',
        body: 'Hello {patientName}',
        category: 'general_communication',
        isActive: true,
        createdAt: now,
      },
    ]);
    apiMocks.fetchSMSConversation.mockResolvedValueOnce({
      patientId: 'patient-1',
      patientName: 'Ana',
      patientPhone: '',
      messages: [
        {
          id: 'msg-1',
          direction: 'outbound',
          messageBody: 'Delivered',
          status: 'delivered',
          sentAt: now,
          createdAt: now,
        },
        {
          id: 'msg-2',
          direction: 'outbound',
          messageBody: 'Queued',
          status: 'queued',
          sentAt: now,
          createdAt: now,
        },
        {
          id: 'msg-3',
          direction: 'outbound',
          messageBody: 'Failed',
          status: 'failed',
          createdAt: now,
        },
        {
          id: 'msg-4',
          direction: 'inbound',
          messageBody: 'Inbound',
          status: 'received',
          createdAt: now,
        },
      ],
    });
    apiMocks.fetchScheduledMessages.mockResolvedValueOnce({
      scheduled: [
        {
          id: 'sch-x',
          patientId: 'patient-1',
          recipientName: '',
          recipientPhone: '5550009999',
          messageBody: 'Later',
          scheduledFor: now,
          status: 'cancelled',
          createdAt: now,
        },
      ],
    });

    render(<TextMessagesPage />);

    await screen.findByRole('heading', { name: 'Text Messages' });
    expect(screen.getAllByText('A?').length).toBeGreaterThan(0);
    expect(screen.getAllByText('?N').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Ana'));
    await screen.findByText('Delivered');
    expect(screen.getByText('(Delivered)')).toBeInTheDocument();
    expect(screen.getByText('(Sent)')).toBeInTheDocument();
    expect(screen.getByText('(Failed)')).toBeInTheDocument();

    const messageBox = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
    fireEvent.change(messageBox, { target: { value: 'a'.repeat(200) } });
    expect(screen.getByText(/2 segments/)).toBeInTheDocument();

    const sendCalls = apiMocks.sendSMSConversationMessage.mock.calls.length;
    fireEvent.keyDown(messageBox, { key: 'Enter', shiftKey: true });
    expect(apiMocks.sendSMSConversationMessage.mock.calls.length).toBe(sendCalls);

    fireEvent.keyDown(messageBox, { key: 'Enter' });
    await waitFor(() =>
      expect(apiMocks.sendSMSConversationMessage.mock.calls.length).toBeGreaterThan(sendCalls),
    );
    fireEvent.keyDown(messageBox, { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: 'Bulk Send' }));
    const bulkCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(bulkCheckbox);
    fireEvent.click(bulkCheckbox);

    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
    await waitFor(() => expect(apiMocks.fetchScheduledMessages).toHaveBeenCalled(), { timeout: 5000 });

    // Wait for the scheduled messages table to appear
    await waitFor(() => {
      const phoneElement = screen.queryByText('5550009999');
      return phoneElement !== null;
    }, { timeout: 5000 });

    expect(screen.getByText('5550009999')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByText('(555) 222-3333')).toBeInTheDocument();
    const optedOutRow = screen.getByText('Null').closest('tr') as HTMLElement;
    expect(within(optedOutRow).getByText('-')).toBeInTheDocument();
    expect(within(optedOutRow).getByRole('button', { name: 'Opt In' })).toBeInTheDocument();
  }, 15000);

  it('renders with no session and skips API calls', async () => {
    authMocks.session = null;

    render(<TextMessagesPage />);

    await screen.findByText('Communicate with patients via SMS');
    expect(apiMocks.fetchSMSConversations).not.toHaveBeenCalled();
    expect(apiMocks.fetchSMSTemplates).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Scheduled' }));
    expect(screen.getByText('No scheduled messages')).toBeInTheDocument();
  });
});
