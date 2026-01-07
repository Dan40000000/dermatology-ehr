import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  user: null as null | { id: string; fullName: string },
  accessToken: '',
  tenantId: '',
}));

const apiMocks = vi.hoisted(() => ({
  fetchNotes: vi.fn(),
  fetchProviders: vi.fn(),
  fetchPatients: vi.fn(),
  bulkFinalizeNotes: vi.fn(),
  bulkAssignNotes: vi.fn(),
  signNote: vi.fn(),
  addNoteAddendum: vi.fn(),
  fetchNoteAddendums: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../api', () => apiMocks);

import { NotesPage } from '../NotesPage';

const buildFixtures = () => ({
  notes: [
    {
      id: 'note-1',
      patientId: 'patient-1',
      patientFirstName: 'Ana',
      patientLastName: 'Derm',
      providerId: 'provider-1',
      providerName: 'Dr Demo',
      chiefComplaint: 'Rash',
      visitCode: '99213',
      status: 'preliminary',
      createdAt: '2024-04-01T10:00:00.000Z',
    },
    {
      id: 'note-2',
      patientId: 'patient-2',
      patientFirstName: 'Ben',
      patientLastName: 'Skin',
      providerId: 'provider-1',
      providerName: 'Dr Demo',
      chiefComplaint: 'Follow up',
      visitCode: '99214',
      status: 'signed',
      createdAt: '2024-04-02T10:00:00.000Z',
    },
  ],
  providers: [
    { id: 'provider-1', fullName: 'Dr Demo' },
    { id: 'provider-2', fullName: 'Dr Two' },
  ],
  patients: [
    { id: 'patient-1', firstName: 'Ana', lastName: 'Derm' },
    { id: 'patient-2', firstName: 'Ben', lastName: 'Skin' },
  ],
  addendums: [
    {
      id: 'add-1',
      addedBy: 'user-1',
      addedByName: 'Dr Demo',
      addendumText: 'Additional info',
      createdAt: '2024-04-03T10:00:00.000Z',
    },
  ],
});

describe('NotesPage', () => {
  beforeEach(() => {
    authMocks.user = { id: 'user-1', fullName: 'Dr Demo' };
    authMocks.accessToken = 'token-1';
    authMocks.tenantId = 'tenant-1';

    const fixtures = buildFixtures();
    apiMocks.fetchNotes.mockResolvedValue({ notes: fixtures.notes });
    apiMocks.fetchProviders.mockResolvedValue({ providers: fixtures.providers });
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    apiMocks.bulkFinalizeNotes.mockResolvedValue({ message: 'Notes finalized' });
    apiMocks.bulkAssignNotes.mockResolvedValue({ message: 'Notes assigned' });
    apiMocks.signNote.mockResolvedValue({ message: 'Note signed' });
    apiMocks.addNoteAddendum.mockResolvedValue({ message: 'Addendum added' });
    apiMocks.fetchNoteAddendums.mockResolvedValue({ addendums: fixtures.addendums });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads notes, supports bulk actions, signing, addendums, and viewing', async () => {
    render(<NotesPage />);

    await screen.findByText('Note Management');

    expect(apiMocks.fetchNotes).toHaveBeenCalledWith('tenant-1', 'token-1', {});

    const noteRow = screen.getByRole('row', { name: /Derm, Ana/ });
    const noteCheckbox = within(noteRow).getByRole('checkbox');
    fireEvent.click(noteCheckbox);

    fireEvent.click(screen.getByRole('button', { name: 'Finalize Selected' }));
    await waitFor(() => expect(apiMocks.bulkFinalizeNotes).toHaveBeenCalledWith('tenant-1', 'token-1', ['note-1']));
    expect(screen.getByText('Notes finalized')).toBeInTheDocument();

    fireEvent.click(noteCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Assign Selected' }));
    const assignModal = screen.getByText('Assign Notes to Provider').closest('div');
    expect(assignModal).toBeTruthy();
    const assignSelect = within(assignModal as HTMLElement).getByRole('combobox');
    fireEvent.change(assignSelect, { target: { value: 'provider-2' } });
    fireEvent.click(within(assignModal as HTMLElement).getByRole('button', { name: 'Assign Notes' }));
    await waitFor(() =>
      expect(apiMocks.bulkAssignNotes).toHaveBeenCalledWith('tenant-1', 'token-1', ['note-1'], 'provider-2'),
    );
    expect(screen.getByText('Notes assigned')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    expect(screen.getByRole('heading', { name: 'Sign Note' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign Note' }));
    await waitFor(() => expect(apiMocks.signNote).toHaveBeenCalledWith('tenant-1', 'token-1', 'note-1'));
    expect(screen.getByText('Note signed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Addendum' }));
    expect(screen.getByRole('heading', { name: 'Add Addendum' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Enter addendum text...'), { target: { value: 'Addendum text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Addendum' }));
    await waitFor(() =>
      expect(apiMocks.addNoteAddendum).toHaveBeenCalledWith('tenant-1', 'token-1', 'note-2', 'Addendum text'),
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[1]);
    await waitFor(() =>
      expect(apiMocks.fetchNoteAddendums).toHaveBeenCalledWith('tenant-1', 'token-1', 'note-2'),
    );
    expect(screen.getByText('Addendums')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('supports filtering and surfaces load errors', async () => {
    render(<NotesPage />);
    await screen.findByText('Note Management');

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'signed' } });
    await waitFor(() =>
      expect(apiMocks.fetchNotes).toHaveBeenCalledWith('tenant-1', 'token-1', { status: 'signed' }),
    );

    apiMocks.fetchNotes.mockRejectedValueOnce(new Error('load failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    await waitFor(() => expect(screen.getByText('load failed')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(screen.queryByText('load failed')).not.toBeInTheDocument();
  });

  it('covers filter resets, select-all, and empty list states', async () => {
    render(<NotesPage />);
    await screen.findByText('Note Management');

    const filterSelects = screen.getAllByRole('combobox');
    fireEvent.change(filterSelects[0], { target: { value: 'draft' } });
    fireEvent.change(filterSelects[1], { target: { value: 'provider-2' } });
    fireEvent.change(filterSelects[2], { target: { value: 'patient-1' } });

    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2024-04-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2024-04-30' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    await waitFor(() =>
      expect(apiMocks.fetchNotes).toHaveBeenCalledWith('tenant-1', 'token-1', {
        status: 'draft',
        providerId: 'provider-2',
        patientId: 'patient-1',
        startDate: '2024-04-01',
        endDate: '2024-04-30',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));

    const selectAll = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAll);
    expect(screen.getByText('2 notes selected')).toBeInTheDocument();

    const noteRow = screen.getByRole('row', { name: /Derm, Ana/ });
    const noteCheckbox = within(noteRow).getByRole('checkbox');
    fireEvent.click(noteCheckbox);
    fireEvent.click(noteCheckbox);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
    expect(screen.queryByText('2 notes selected')).not.toBeInTheDocument();

    apiMocks.fetchNotes.mockResolvedValueOnce({ notes: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    await screen.findByText('No notes found');
  }, 15000);

  it('handles modal closes and error paths', async () => {
    apiMocks.bulkFinalizeNotes.mockRejectedValueOnce(new Error('finalize failed'));
    apiMocks.bulkAssignNotes.mockRejectedValueOnce(new Error('assign failed'));
    apiMocks.signNote.mockRejectedValueOnce(new Error('sign failed'));
    apiMocks.addNoteAddendum.mockRejectedValueOnce(new Error('addendum failed'));
    apiMocks.fetchNoteAddendums.mockRejectedValueOnce(new Error('addendums failed'));

    render(<NotesPage />);
    await screen.findByText('Note Management');

    const noteRow = screen.getByRole('row', { name: /Derm, Ana/ });
    fireEvent.click(within(noteRow).getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Finalize Selected' }));
    await screen.findByText('finalize failed');
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    fireEvent.click(screen.getByRole('button', { name: 'Assign Selected' }));
    const assignHeading = screen.getByText('Assign Notes to Provider');
    const assignOverlay = assignHeading.closest('div')?.parentElement;
    fireEvent.click(assignOverlay as HTMLElement);

    fireEvent.click(screen.getByRole('button', { name: 'Assign Selected' }));
    const assignModal = screen.getByText('Assign Notes to Provider').closest('div') as HTMLElement;
    fireEvent.change(within(assignModal).getByRole('combobox'), { target: { value: 'provider-2' } });
    fireEvent.click(within(assignModal).getByRole('button', { name: 'Assign Notes' }));
    await screen.findByText('assign failed');
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    fireEvent.click(screen.getByRole('button', { name: 'Assign Selected' }));
    const assignModalAgain = screen.getByText('Assign Notes to Provider').closest('div') as HTMLElement;
    fireEvent.click(within(assignModalAgain).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    const signModal = screen.getByRole('heading', { name: 'Sign Note' }).closest('div') as HTMLElement;
    const signOverlay = signModal.parentElement;
    fireEvent.click(signOverlay as HTMLElement);

    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    const signModalAgain = screen.getByRole('heading', { name: 'Sign Note' }).closest('div') as HTMLElement;
    fireEvent.click(within(signModalAgain).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    const signModalFinal = screen.getByRole('heading', { name: 'Sign Note' }).closest('div') as HTMLElement;
    fireEvent.click(within(signModalFinal).getByRole('button', { name: 'Sign Note' }));
    await screen.findByText('sign failed');
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Addendum' })[0]);
    fireEvent.change(screen.getByPlaceholderText('Enter addendum text...'), { target: { value: 'Extra note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Addendum' }));
    await screen.findByText('addendum failed');
    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    const addendumHeading = screen.getByRole('heading', { name: 'Add Addendum' });
    const addendumOverlay = addendumHeading.closest('div')?.parentElement;
    fireEvent.click(addendumOverlay as HTMLElement);
    fireEvent.click(screen.getAllByRole('button', { name: 'Addendum' })[0]);
    const addendumModal = screen.getByRole('heading', { name: 'Add Addendum' }).closest('div') as HTMLElement;
    fireEvent.click(within(addendumModal).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[1]);
    await waitFor(() => expect(apiMocks.fetchNoteAddendums).toHaveBeenCalled());
    const viewHeading = screen.getByText('Clinical Note');
    const viewOverlay = viewHeading.closest('div')?.parentElement;
    fireEvent.click(viewOverlay as HTMLElement);
  }, 15000);

  it('skips loading when auth is missing', async () => {
    authMocks.accessToken = '';
    authMocks.tenantId = '';

    render(<NotesPage />);

    await screen.findByText('Note Management');
    expect(apiMocks.fetchNotes).not.toHaveBeenCalled();
    expect(apiMocks.fetchProviders).not.toHaveBeenCalled();
    expect(apiMocks.fetchPatients).not.toHaveBeenCalled();
  });

  it('renders status badge variants and placeholder fields', async () => {
    apiMocks.fetchNotes.mockResolvedValueOnce({
      notes: [
        {
          id: 'note-draft',
          patientId: 'patient-1',
          patientFirstName: 'Ana',
          patientLastName: 'Derm',
          providerId: 'provider-1',
          providerName: 'Dr Demo',
          chiefComplaint: '',
          visitCode: '',
          status: 'draft',
          createdAt: '2024-04-01T10:00:00.000Z',
        },
        {
          id: 'note-final',
          patientId: 'patient-2',
          patientFirstName: 'Ben',
          patientLastName: 'Skin',
          providerId: 'provider-1',
          providerName: 'Dr Demo',
          chiefComplaint: 'Follow up',
          visitCode: '99214',
          status: 'final',
          createdAt: '2024-04-02T10:00:00.000Z',
        },
        {
          id: 'note-signed',
          patientId: 'patient-3',
          patientFirstName: 'Sara',
          patientLastName: 'Signed',
          providerId: 'provider-2',
          providerName: 'Dr Two',
          chiefComplaint: 'Check',
          visitCode: '99213',
          status: 'signed',
          createdAt: '2024-04-03T10:00:00.000Z',
        },
        {
          id: 'note-mystery',
          patientId: 'patient-4',
          patientFirstName: 'Nora',
          patientLastName: 'Unknown',
          providerId: 'provider-2',
          providerName: 'Dr Two',
          chiefComplaint: 'Mystery',
          visitCode: '99212',
          status: 'mystery',
          createdAt: '2024-04-04T10:00:00.000Z',
        },
      ],
    });

    render(<NotesPage />);

    await screen.findByText('Note Management');

    expect(screen.getAllByText('draft').length).toBeGreaterThan(0);
    expect(screen.getAllByText('final').length).toBeGreaterThan(0);
    expect(screen.getAllByText('signed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('mystery').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    const draftRow = screen.getByRole('row', { name: /Derm, Ana/ });
    fireEvent.click(within(draftRow).getByRole('button', { name: 'View' }));
    expect(apiMocks.fetchNoteAddendums).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    const signedRow = screen.getByRole('row', { name: /Signed, Sara/ });
    expect(within(signedRow).queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument();
    expect(within(signedRow).getByRole('button', { name: 'Addendum' })).toBeInTheDocument();
  });

  it('handles empty API payloads', async () => {
    apiMocks.fetchNotes.mockResolvedValueOnce({});
    apiMocks.fetchProviders.mockResolvedValueOnce({});
    apiMocks.fetchPatients.mockResolvedValueOnce({});

    render(<NotesPage />);

    await screen.findByText('Note Management');
    expect(screen.getByText('No notes found')).toBeInTheDocument();
  });
});
