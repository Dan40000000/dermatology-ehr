import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string },
}));

const apiMocks = vi.hoisted(() => ({
  fetchEncounters: vi.fn(),
  fetchProviders: vi.fn(),
  fetchPatients: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../api', () => apiMocks);

import { NotesPage } from '../NotesPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <NotesPage />
    </MemoryRouter>
  );

const buildFixtures = () => ({
  encounters: [
    {
      id: 'enc-1',
      patientId: 'patient-1',
      patientName: 'Derm, Ana',
      providerId: 'provider-1',
      providerName: 'Dr Demo',
      chiefComplaint: 'Rash',
      status: 'preliminary',
      createdAt: '2024-04-01T10:00:00.000Z',
    },
    {
      id: 'enc-2',
      patientId: 'patient-2',
      patientName: 'Skin, Ben',
      providerId: 'provider-2',
      providerName: 'Dr Two',
      chiefComplaint: 'Follow up',
      status: 'signed',
      createdAt: '2024-04-02T10:00:00.000Z',
    },
    {
      id: 'enc-3',
      patientId: 'patient-3',
      patientName: 'Test, Cara',
      providerId: 'provider-1',
      providerName: 'Dr Demo',
      chiefComplaint: 'Check',
      status: 'draft',
      createdAt: '2024-04-03T10:00:00.000Z',
    },
  ],
  providers: [
    { id: 'provider-1', fullName: 'Dr Demo' },
    { id: 'provider-2', fullName: 'Dr Two' },
  ],
  patients: [
    { id: 'patient-1', firstName: 'Ana', lastName: 'Derm' },
    { id: 'patient-2', firstName: 'Ben', lastName: 'Skin' },
    { id: 'patient-3', firstName: 'Cara', lastName: 'Test' },
  ],
});

describe('NotesPage', () => {
  beforeEach(() => {
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };

    const fixtures = buildFixtures();
    apiMocks.fetchEncounters.mockResolvedValue({ encounters: fixtures.encounters });
    apiMocks.fetchProviders.mockResolvedValue({ providers: fixtures.providers });
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads encounters and navigates on row click', async () => {
    renderPage();

    await screen.findByText('Notes & Encounters');

    expect(apiMocks.fetchEncounters).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchProviders).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchPatients).toHaveBeenCalledWith('tenant-1', 'token-1');

    expect(screen.getByText('Showing 3 of 3 encounters')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Derm, Ana')).toBeInTheDocument();

    const row = screen.getByRole('row', { name: /Derm, Ana/ });
    fireEvent.click(row);

    expect(navigateMock).toHaveBeenCalledWith('/patients/patient-1/encounter/enc-1');
  });

  it('filters encounters and clears filters', async () => {
    renderPage();
    await screen.findByText('Showing 3 of 3 encounters');

    const selects = screen.getAllByRole('combobox');
    const statusSelect = selects[0];
    const providerSelect = selects[1];
    const patientSelect = selects[2];

    fireEvent.change(statusSelect, { target: { value: 'signed' } });
    expect(screen.getByText('Showing 1 of 3 encounters')).toBeInTheDocument();

    const table = screen.getByRole('table');
    let rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText('Skin, Ben')).toBeInTheDocument();

    fireEvent.change(providerSelect, { target: { value: 'provider-2' } });
    fireEvent.change(patientSelect, { target: { value: 'patient-2' } });

    const searchInput = screen.getByPlaceholderText('Search by patient name, chief complaint, or provider...');
    fireEvent.change(searchInput, { target: { value: 'Follow up' } });

    rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText('Skin, Ben')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(screen.getByText('Showing 3 of 3 encounters')).toBeInTheDocument();
    expect(searchInput).toHaveValue('');
  });

  it('refreshes data and surfaces load errors', async () => {
    renderPage();
    await screen.findByText('Notes & Encounters');

    apiMocks.fetchEncounters.mockRejectedValueOnce(new Error('load failed'));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('load failed');

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(screen.queryByText('load failed')).not.toBeInTheDocument();
  });

  it('skips loading without a session', async () => {
    authMocks.session = null;

    renderPage();

    await screen.findByText('Notes & Encounters');
    expect(apiMocks.fetchEncounters).not.toHaveBeenCalled();
    expect(apiMocks.fetchProviders).not.toHaveBeenCalled();
    expect(apiMocks.fetchPatients).not.toHaveBeenCalled();
  });

  it('shows empty state when no encounters exist', async () => {
    apiMocks.fetchEncounters.mockResolvedValueOnce({ encounters: [] });
    apiMocks.fetchProviders.mockResolvedValueOnce({ providers: [] });
    apiMocks.fetchPatients.mockResolvedValueOnce({ patients: [] });

    renderPage();

    await screen.findByText('Notes & Encounters');
    expect(screen.getByText('No encounters found')).toBeInTheDocument();
  });
});
