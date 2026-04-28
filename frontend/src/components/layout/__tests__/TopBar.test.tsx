import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from '../TopBar';
import { AuthContext } from '../../../contexts/AuthContext';

const mockNavigate = vi.fn();
const fetchMock = vi.fn();
const mockLogout = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({
    toBlob: (callback: (blob: Blob | null) => void) => {
      callback(new Blob(['capture'], { type: 'image/png' }));
    },
  })),
}));

vi.mock('../../feedback/FeedbackScreenshotEditor', () => ({
  FeedbackScreenshotEditor: ({ onConfirm, onUseOriginal, onCancel }: any) => (
    <div>
      <p>Mock screenshot editor</p>
      <button
        type="button"
        onClick={() => onConfirm(new File([new Blob(['annotated'], { type: 'image/png' })], 'annotated-capture.png', { type: 'image/png' }))}
      >
        OK
      </button>
      <button type="button" onClick={onUseOriginal}>Skip Markup</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

describe('TopBar feedback flow', () => {
  const mockUser = {
    id: '1',
    fullName: 'Admin User',
    email: 'admin@example.com',
    role: 'admin' as const,
  };

  const mockSession = {
    accessToken: 'test-access-token',
    tenantId: 'tenant-1',
  };

  const mockPatients = [
    { id: '1', firstName: 'John', lastName: 'Doe', mrn: 'MRN001' } as any,
    { id: '2', firstName: 'Jane', lastName: 'Smith', mrn: 'MRN002' } as any,
  ];

  const renderWithContext = (props = {}) => {
    return render(
      <MemoryRouter>
        <AuthContext.Provider value={{ user: mockUser, session: mockSession, logout: mockLogout } as any}>
          <TopBar patients={mockPatients} {...props} />
        </AuthContext.Provider>
      </MemoryRouter>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: vi.fn(() => 'blob:feedback-preview'),
      });
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:feedback-preview');
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: vi.fn(),
      });
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
  });

  it('renders the current office branding and feedback entry point', () => {
    renderWithContext();
    expect(screen.getByText(/Dermatology DEMO/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Report issue or suggestion/i })).toBeInTheDocument();
  });

  it('opens screenshot markup before the normal feedback form', async () => {
    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Report issue or suggestion/i }));

    expect(await screen.findByText('Mock screenshot editor')).toBeInTheDocument();
    expect(screen.queryByText('Report Issue / Suggestion')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText('Report Issue / Suggestion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send to Dan/i })).toBeInTheDocument();
    expect(screen.getByText(/Attached marked-up page screenshot/i)).toBeInTheDocument();
  });

  it('submits the annotated screenshot and feedback to the professional feedback route', async () => {
    const user = userEvent.setup();
    renderWithContext();

    await user.click(screen.getByRole('button', { name: /Report issue or suggestion/i }));
    await user.click(await screen.findByRole('button', { name: 'OK' }));

    await user.type(
      screen.getByLabelText(/What happened or what should improve\?/i),
      'The Add Procedure button is missing Botox.',
    );
    await user.click(screen.getByRole('button', { name: /Send to Dan/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/professional-feedback');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer test-access-token',
      'x-tenant-id': 'tenant-1',
    });

    const formData = options.body as FormData;
    expect(formData.get('type')).toBe('issue');
    expect(formData.get('message')).toBe('The Add Procedure button is missing Botox.');
    const attachments = formData.getAll('attachments') as File[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe('annotated-capture.png');

    expect(window.alert).toHaveBeenCalledWith('Issue/suggestion sent to Dan.');
  });
});
