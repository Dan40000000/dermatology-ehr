import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AIAgentConfigsPage } from '../AIAgentConfigsPage';
import { AdminPage } from '../AdminPage';

const authMocks = vi.hoisted(() => ({
  session: { tenantId: 'tenant-1', accessToken: 'token-1' },
  user: { id: 'user-1', role: 'admin' },
}));

const apiMocks = vi.hoisted(() => ({
  fetchAIAgentConfigs: vi.fn(),
  fetchAIAgentConfig: vi.fn(),
  createAIAgentConfig: vi.fn(),
  updateAIAgentConfig: vi.fn(),
  deleteAIAgentConfig: vi.fn(),
  cloneAIAgentConfig: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div>Redirect to {to}</div>,
  };
});

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Admin pages', () => {
  beforeEach(() => {
    authMocks.user = { id: 'user-1', role: 'admin' };
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };
    apiMocks.fetchAIAgentConfigs.mockResolvedValue({
      configurations: [
        {
          id: 'cfg-1',
          name: 'General',
          description: 'Default',
          specialtyFocus: 'general',
          outputFormat: 'soap',
          noteSections: ['chiefComplaint'],
          isActive: true,
          isDefault: false,
          aiModel: 'claude',
          temperature: 0.3,
          maxTokens: 4000,
          systemPrompt: 'sys',
          promptTemplate: 'tmpl',
          verbosityLevel: 'standard',
          includeCodes: true,
        },
      ],
    });
    apiMocks.fetchAIAgentConfig.mockResolvedValue({
      configuration: {
        id: 'cfg-1',
        name: 'General',
        description: 'Default',
        specialtyFocus: 'general',
        outputFormat: 'soap',
        noteSections: ['chiefComplaint'],
        isActive: true,
        isDefault: false,
        aiModel: 'claude',
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'sys',
        promptTemplate: 'tmpl',
        verbosityLevel: 'standard',
        includeCodes: true,
      },
    });
    apiMocks.createAIAgentConfig.mockResolvedValue({ ok: true });
    apiMocks.updateAIAgentConfig.mockResolvedValue({ ok: true });
    apiMocks.deleteAIAgentConfig.mockResolvedValue({ ok: true });
    apiMocks.cloneAIAgentConfig.mockResolvedValue({ ok: true });
  });

  it('redirects non-admin users', () => {
    authMocks.user = { id: 'user-2', role: 'staff' };
    renderWithRouter(<AIAgentConfigsPage />);
    expect(screen.getByText('Redirect to /home')).toBeInTheDocument();
  });

  it('manages AI agent configurations', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithRouter(<AIAgentConfigsPage />);

    const generalLabels = await screen.findAllByText('General');
    expect(generalLabels.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(apiMocks.updateAIAgentConfig).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      'cfg-1',
      expect.objectContaining({ isActive: false })
    );
    await waitFor(() => expect(apiMocks.fetchAIAgentConfigs).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Clone' }));
    fireEvent.change(screen.getByPlaceholderText('My Custom Configuration'), { target: { value: 'Copy' } });
    const cloneModal = await screen.findByText('Clone Configuration');
    const cloneContainer = cloneModal.closest('div');
    expect(cloneContainer).toBeTruthy();
    fireEvent.click(within(cloneContainer as HTMLElement).getByRole('button', { name: 'Clone' }));
    expect(apiMocks.cloneAIAgentConfig).toHaveBeenCalledWith('tenant-1', 'token-1', 'cfg-1', 'Copy');
    await waitFor(() => expect(apiMocks.fetchAIAgentConfigs).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByText('Edit Configuration')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g., Medical Dermatology Standard'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(apiMocks.updateAIAgentConfig).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.fetchAIAgentConfigs).toHaveBeenCalledTimes(4));

    fireEvent.click(screen.getByRole('button', { name: '+ Add Configuration' }));
    fireEvent.change(screen.getByPlaceholderText('e.g., Medical Dermatology Standard'), { target: { value: 'New Config' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Configuration' }));
    await waitFor(() => expect(apiMocks.createAIAgentConfig).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.fetchAIAgentConfigs).toHaveBeenCalledTimes(5));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(apiMocks.deleteAIAgentConfig).toHaveBeenCalledWith('tenant-1', 'token-1', 'cfg-1');
    await waitFor(() => expect(apiMocks.fetchAIAgentConfigs).toHaveBeenCalledTimes(6));
    confirmSpy.mockRestore();
  });

  it('renders admin settings tabs and supports CRUD actions', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/admin/facilities') && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ facilities: [{ id: 'fac-1', name: 'Main Clinic', address: '1 Main', isActive: true }] }),
        } as Response);
      }
      if (url.includes('/api/admin/rooms') && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ rooms: [{ id: 'room-1', name: 'Exam Room 1', facilityId: 'fac-1', facilityName: 'Main Clinic', roomType: 'exam', isActive: true }] }),
        } as Response);
      }
      if (url.includes('/api/admin/providers') && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ providers: [{ id: 'prov-1', fullName: 'Dr Demo', isActive: true }] }),
        } as Response);
      }
      if (url.includes('/api/admin/users') && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ users: [{ id: 'user-1', fullName: 'Admin User', email: 'admin@example.com', role: 'admin' }] }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    renderWithRouter(<AdminPage />);

    expect(await screen.findByText('Admin Settings')).toBeInTheDocument();
    expect(await screen.findByText('Main Clinic')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Add Facility' }));
    fireEvent.change(screen.getByPlaceholderText('Main Clinic'), { target: { value: 'New Facility' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Rooms' }));
    expect(await screen.findByText('Exam Room 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Providers' }));
    expect(await screen.findByText('Dr Demo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Users' }));
    expect(await screen.findByText('Admin User')).toBeInTheDocument();

    fetchSpy.mockRestore();
    confirmSpy.mockRestore();
  });
});
