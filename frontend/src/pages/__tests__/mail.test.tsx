import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authMocks = vi.hoisted(() => ({
  session: null as null | {
    tenantId: string;
    accessToken: string;
    user: { id: string };
  },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchMessageThreads: vi.fn(),
  fetchMessageThread: vi.fn(),
  createMessageThread: vi.fn(),
  sendThreadMessage: vi.fn(),
  markThreadAsRead: vi.fn(),
  archiveThread: vi.fn(),
  fetchPatients: vi.fn(),
  fetchProviders: vi.fn(),
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
  Modal: ({
    isOpen,
    title,
    children,
    onClose,
  }: {
    isOpen: boolean;
    title?: string;
    children: React.ReactNode;
    onClose?: () => void;
  }) => {
    if (!isOpen) return null;
    const key = String(title || 'modal')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return (
      <div data-testid={`modal-${key}`}>
        <div>{title}</div>
        <button type="button" onClick={onClose}>
          Close Modal
        </button>
        {children}
      </div>
    );
  },
}));

import { MailPage } from '../MailPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1' },
};

const buildFixtures = () => ({
  threads: [
    {
      id: 'thread-1',
      subject: 'Lab results',
      lastMessage: { body: 'Results ready' },
      participants: [
        { id: 'user-1', firstName: 'Ana', lastName: 'Derm' },
        { id: 'user-2', firstName: 'Ben', lastName: 'Skin' },
      ],
      createdBy: 'user-2',
      unreadCount: 2,
      isArchived: false,
      patientId: 'patient-1',
    },
  ],
  threadDetail: {
    id: 'thread-1',
    subject: 'Lab results',
    participants: [
      { id: 'user-1', firstName: 'Ana', lastName: 'Derm' },
      { id: 'user-2', firstName: 'Ben', lastName: 'Skin' },
    ],
    createdBy: 'user-2',
    unreadCount: 2,
    isArchived: false,
    patientId: 'patient-1',
  },
  messages: [
    {
      id: 'msg-1',
      threadId: 'thread-1',
      sender: 'user-2',
      senderFirstName: 'Ben',
      senderLastName: 'Skin',
      body: 'Results ready',
      createdAt: '2024-02-01T10:00:00.000Z',
    },
  ],
  patients: [{ id: 'patient-1', firstName: 'Ana', lastName: 'Derm' }],
  providers: [{ id: 'user-2', fullName: 'Ben Skin' }],
});

describe('MailPage', () => {
  beforeEach(() => {
    authMocks.session = baseSession;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();

    const fixtures = buildFixtures();
    apiMocks.fetchMessageThreads.mockResolvedValue({ threads: fixtures.threads });
    apiMocks.fetchMessageThread.mockResolvedValue({
      thread: fixtures.threadDetail,
      messages: fixtures.messages,
    });
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    apiMocks.fetchProviders.mockResolvedValue({ providers: fixtures.providers });
    apiMocks.createMessageThread.mockResolvedValue({ id: 'thread-2' });
    apiMocks.sendThreadMessage.mockResolvedValue({ id: 'msg-2' });
    apiMocks.markThreadAsRead.mockResolvedValue({ ok: true });
    apiMocks.archiveThread.mockResolvedValue({ ok: true });
  });

  it('opens a thread, replies, and archives', async () => {
    render(
      <MemoryRouter>
        <MailPage />
      </MemoryRouter>
    );

    await screen.findByText('Inbox');
    fireEvent.click(screen.getByText('Lab results'));

    await screen.findByText('Results ready');
    await waitFor(() =>
      expect(apiMocks.markThreadAsRead).toHaveBeenCalledWith('tenant-1', 'token-1', 'thread-1'),
    );

    fireEvent.change(screen.getByPlaceholderText('Type your reply... (Press \'r\' to focus)'), {
      target: { value: 'Thanks' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reply' }));
    await waitFor(() =>
      expect(apiMocks.sendThreadMessage).toHaveBeenCalledWith('tenant-1', 'token-1', 'thread-1', 'Thanks'),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Reply sent');

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(apiMocks.archiveThread).toHaveBeenCalledWith('tenant-1', 'token-1', 'thread-1', true),
    );
  });

  it('composes a new message', async () => {
    render(
      <MemoryRouter>
        <MailPage />
      </MemoryRouter>
    );

    await screen.findByText('Inbox');
    fireEvent.click(screen.getByRole('button', { name: '+ New Message' }));
    const modal = await screen.findByTestId('modal-new-message');

    const user = userEvent.setup();
    const recipientSelect = within(modal).getByRole('listbox');
    await user.selectOptions(recipientSelect, ['user-2']);

    fireEvent.change(within(modal).getByPlaceholderText('Message subject...'), {
      target: { value: 'Follow up' },
    });
    fireEvent.change(within(modal).getByPlaceholderText('Type your message...'), {
      target: { value: 'Please schedule a follow-up.' },
    });
    fireEvent.click(within(modal).getByRole('button', { name: 'Send Message' }));

    await waitFor(() =>
      expect(apiMocks.createMessageThread).toHaveBeenCalledWith('tenant-1', 'token-1', {
        subject: 'Follow up',
        patientId: '',
        participantIds: ['user-2'],
        message: 'Please schedule a follow-up.',
      }),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Message sent');
  });
});
