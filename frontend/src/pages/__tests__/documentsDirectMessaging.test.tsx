import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

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
  fetchDocuments: vi.fn(),
  fetchPatients: vi.fn(),
  createDocument: vi.fn(),
  uploadDocumentFile: vi.fn(),
  fetchPracticeConsentForms: vi.fn(),
  createPracticeConsentForm: vi.fn(),
  updatePracticeConsentForm: vi.fn(),
  deactivatePracticeConsentForm: vi.fn(),
  API_BASE_URL: 'http://localhost:4000',
}));

const directApiMocks = vi.hoisted(() => ({
  fetchDirectMessages: vi.fn(),
  sendDirectMessage: vi.fn(),
  fetchDirectContacts: vi.fn(),
  createDirectContact: vi.fn(),
  markDirectMessageRead: vi.fn(),
  fetchDirectStats: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../api-direct', () => directApiMocks);

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

import { DocumentsPage } from '../DocumentsPage';
import { DirectMessagingPage } from '../DirectMessagingPage';

const adminSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fullName: 'Admin User' },
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

describe('DocumentsPage', () => {
  beforeEach(() => {
    authMocks.session = adminSession;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();

    apiMocks.fetchDocuments.mockResolvedValue({
      documents: [
        {
          id: 'doc-1',
          patientId: 'patient-1',
          category: 'lab-result',
          title: 'Lab Result Report',
          description: 'CBC panel',
          createdAt: '2024-01-01',
          url: 'https://example.com/lab.pdf',
          storage: 's3',
          objectKey: 'lab-report.pdf',
          filename: 'lab-report.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
        },
        {
          id: 'doc-2',
          patientId: 'patient-2',
          category: 'other',
          title: 'Consent Form',
          description: 'Consent',
          createdAt: '2024-01-02',
          url: 'https://example.com/consent.pdf',
          storage: 'url',
          filename: 'consent.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
        },
      ],
    });
    apiMocks.fetchPatients.mockResolvedValue({
      patients: [
        { id: 'patient-1', firstName: 'Ana', lastName: 'Derm' },
        { id: 'patient-2', firstName: 'Ben', lastName: 'Skin' },
      ],
    });
    apiMocks.uploadDocumentFile.mockResolvedValue({
      url: 'https://example.com/uploaded.pdf',
      objectKey: 'uploaded.pdf',
      storage: 's3',
    });
    apiMocks.createDocument.mockResolvedValue({ id: 'doc-3' });
    apiMocks.fetchPracticeConsentForms.mockResolvedValue({
      forms: [
        {
          id: 'consent-1',
          formName: 'General Consent for Treatment',
          formType: 'general-consent',
          formContent: '<div><h2>General Consent</h2><p>Medical consent.</p></div>',
          isActive: true,
          requiresSignature: true,
          version: '2.0',
          effectiveDate: '2026-03-06',
        },
        {
          id: 'consent-2',
          formName: 'HIPAA Notice of Privacy Practices Acknowledgment',
          formType: 'hipaa',
          formContent: '<div><h2>HIPAA</h2><p>Privacy notice.</p></div>',
          isActive: true,
          requiresSignature: true,
          version: '2.0',
          effectiveDate: '2026-03-06',
        },
      ],
    });
    apiMocks.createPracticeConsentForm.mockResolvedValue({ id: 'consent-3' });
    apiMocks.updatePracticeConsentForm.mockResolvedValue({ success: true, id: 'consent-1' });
    apiMocks.deactivatePracticeConsentForm.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('filters documents and uploads a new document', async () => {
    render(
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    );

    await screen.findByText('Document Management');
    fireEvent.change(screen.getByPlaceholderText('Search documents...'), { target: { value: 'Lab' } });
    expect(screen.getByText('Lab Result Report')).toBeInTheDocument();
    expect(screen.queryByText('Consent Form')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Upload Document/i }));
    const uploadModal = await screen.findByTestId('modal-upload-document');
    const uploadScope = within(uploadModal);
    const selects = uploadScope.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'patient-1' } });
    fireEvent.change(selects[1], { target: { value: 'lab-result' } });
    fireEvent.change(uploadScope.getByPlaceholderText('Document title'), { target: { value: 'New Lab' } });
    fireEvent.change(uploadScope.getByPlaceholderText('Optional description...'), { target: { value: 'Uploaded' } });

    const fileInput = uploadModal.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!fileInput) {
      throw new Error('Upload file input not found');
    }
    const file = new File(['pdf'], 'new-lab.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(uploadScope.getByRole('button', { name: 'Upload Document' }));

    await waitFor(() =>
      expect(apiMocks.uploadDocumentFile).toHaveBeenCalledWith('tenant-1', 'token-1', file),
    );
    await waitFor(() =>
      expect(apiMocks.createDocument).toHaveBeenCalledWith('tenant-1', 'token-1', expect.objectContaining({
        patientId: 'patient-1',
        category: 'Lab Results',
        title: 'New Lab',
        description: 'Uploaded',
        filename: 'new-lab.pdf',
      })),
    );
  });

  it('edits live kiosk consent forms from the forms workspace', async () => {
    render(
      <MemoryRouter initialEntries={['/documents?section=forms']}>
        <DocumentsPage />
      </MemoryRouter>
    );

    await screen.findByText('Kiosk Consent Workspace');
    await screen.findByDisplayValue('General Consent for Treatment');
    expect(apiMocks.fetchPracticeConsentForms).toHaveBeenCalledWith('tenant-1', 'token-1');

    const nameInput = screen.getByLabelText('Form Name');
    fireEvent.change(nameInput, { target: { value: 'Updated Treatment Consent' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(apiMocks.updatePracticeConsentForm).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'consent-1',
        expect.objectContaining({
          formName: 'Updated Treatment Consent',
          formType: 'general-consent',
        }),
      ),
    );
  });

  it('passes the selected patient into the handout library route', async () => {
    render(
      <MemoryRouter initialEntries={['/documents']}>
        <LocationProbe />
        <DocumentsPage />
      </MemoryRouter>
    );

    await screen.findByText('Document Management');
    fireEvent.change(screen.getByDisplayValue('All Patients'), { target: { value: 'patient-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lab Result Templates' }));

    await waitFor(() =>
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/handouts?instructionType=lab_results&patientId=patient-1',
      ),
    );
  });
});

describe('DirectMessagingPage', () => {
  beforeEach(() => {
    authMocks.session = adminSession;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();

    directApiMocks.fetchDirectMessages.mockResolvedValue({
      messages: [
        {
          id: 'msg-1',
          subject: 'Lab Results',
          fromAddress: 'referral@clinic.direct',
          toAddress: 'clinic@practice.direct',
          body: 'See attached.',
          receivedAt: '2024-02-01',
          readAt: null,
        },
      ],
    });
    directApiMocks.fetchDirectContacts.mockResolvedValue({
      contacts: [
        {
          id: 'contact-1',
          providerName: 'Dr Helper',
          directAddress: 'helper@direct.com',
          specialty: 'Dermatology',
          isFavorite: true,
        },
      ],
    });
    directApiMocks.fetchDirectStats.mockResolvedValue({ inbox: { total: 1, unread: 1 }, sent: { total: 0 } });
    directApiMocks.sendDirectMessage.mockResolvedValue({ status: 'delivered', transmissionId: 'TX-1' });
    directApiMocks.createDirectContact.mockResolvedValue({ id: 'contact-2' });
    directApiMocks.markDirectMessageRead.mockResolvedValue({ ok: true });

    apiMocks.fetchPatients.mockResolvedValue({ patients: [] });
    apiMocks.fetchDocuments.mockResolvedValue({ documents: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('composes and sends a direct message', async () => {
    render(
      <MemoryRouter>
        <DirectMessagingPage />
      </MemoryRouter>
    );

    await screen.findByText('Direct Secure Messaging');
    fireEvent.click(screen.getByRole('button', { name: '+ Compose Message' }));

    const composeModal = await screen.findByTestId('modal-compose-direct-message');
    const composeScope = within(composeModal);
    fireEvent.change(composeScope.getByPlaceholderText('provider@practice.direct'), {
      target: { value: 'specialist@direct.com' },
    });
    fireEvent.change(composeScope.getByPlaceholderText('Message subject...'), { target: { value: 'Referral' } });
    fireEvent.change(composeScope.getByPlaceholderText('Type your secure message...'), {
      target: { value: 'Please review.' },
    });
    fireEvent.click(composeScope.getByRole('button', { name: 'Send Secure Message' }));

    await waitFor(() =>
      expect(directApiMocks.sendDirectMessage).toHaveBeenCalledWith('tenant-1', 'token-1', {
        toAddress: 'specialist@direct.com',
        subject: 'Referral',
        body: 'Please review.',
        attachments: undefined,
      }),
    );
  });

  it('marks messages read and adds contacts', async () => {
    render(
      <MemoryRouter>
        <DirectMessagingPage />
      </MemoryRouter>
    );
    await screen.findByText('Direct Secure Messaging');

    fireEvent.click(screen.getByText('Lab Results'));
    await waitFor(() =>
      expect(directApiMocks.markDirectMessageRead).toHaveBeenCalledWith('tenant-1', 'token-1', 'msg-1', true),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Provider Directory' }));
    const contactsModal = await screen.findByTestId('modal-provider-directory');
    const contactsScope = within(contactsModal);
    fireEvent.click(contactsScope.getByRole('button', { name: '+ Add Contact' }));

    const addContactModal = await screen.findByTestId('modal-add-provider-contact');
    const addScope = within(addContactModal);
    fireEvent.change(addScope.getByPlaceholderText('Dr. Jane Smith'), { target: { value: 'Dr New' } });
    fireEvent.change(addScope.getByPlaceholderText('provider@practice.direct'), {
      target: { value: 'new@direct.com' },
    });
    fireEvent.click(addScope.getByRole('button', { name: 'Add Contact' }));

    await waitFor(() =>
      expect(directApiMocks.createDirectContact).toHaveBeenCalledWith('tenant-1', 'token-1', expect.objectContaining({
        providerName: 'Dr New',
        directAddress: 'new@direct.com',
        isFavorite: false,
      })),
    );
  });
});
