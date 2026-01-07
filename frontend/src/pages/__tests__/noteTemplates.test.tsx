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
  fetchNoteTemplates: vi.fn(),
  createNoteTemplate: vi.fn(),
  updateNoteTemplate: vi.fn(),
  deleteNoteTemplate: vi.fn(),
  toggleNoteTemplateFavorite: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui', () => ({
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

import { NoteTemplatesPage } from '../NoteTemplatesPage';

const buildTemplates = () => [
  {
    id: 'tmpl-1',
    tenantId: 'tenant-1',
    providerId: 'provider-1',
    name: 'Skin Check',
    category: 'Initial Visit',
    description: 'Annual check',
    isShared: true,
    templateContent: {
      chiefComplaint: 'Itch',
      hpi: 'History text',
      ros: 'ROS text',
      exam: 'Exam notes',
      assessmentPlan: 'Plan text',
    },
    usageCount: 5,
    isFavorite: true,
    createdAt: '2024-04-01T00:00:00Z',
    updatedAt: '2024-04-02T00:00:00Z',
  },
  {
    id: 'tmpl-2',
    tenantId: 'tenant-1',
    providerId: 'provider-1',
    name: 'Follow Up',
    category: 'Follow-up Visit',
    description: '',
    isShared: false,
    templateContent: {
      chiefComplaint: '',
      hpi: '',
      ros: '',
      exam: '',
      assessmentPlan: '',
    },
    usageCount: 0,
    isFavorite: false,
    createdAt: '2024-04-03T00:00:00Z',
    updatedAt: '2024-04-04T00:00:00Z',
  },
];

describe('NoteTemplatesPage', () => {
  beforeEach(() => {
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };

    apiMocks.fetchNoteTemplates.mockResolvedValue({ templates: buildTemplates() });
    apiMocks.createNoteTemplate.mockResolvedValue({ id: 'new-1', template: buildTemplates()[0] });
    apiMocks.updateNoteTemplate.mockResolvedValue({ template: buildTemplates()[0] });
    apiMocks.deleteNoteTemplate.mockResolvedValue({ message: 'deleted' });
    apiMocks.toggleNoteTemplateFavorite.mockResolvedValue({ isFavorite: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('filters templates, previews content, clones, and toggles favorites', async () => {
    render(<NoteTemplatesPage />);

    await screen.findByText('Note Templates');
    await screen.findByText('Skin Check');
    await screen.findByText('Follow Up');
    await screen.findByText('Follow Up');

    const searchInput = screen.getByPlaceholderText('Search templates by name, description, or category...');
    fireEvent.change(searchInput, { target: { value: 'Skin' } });
    expect(screen.getByText('Skin Check')).toBeInTheDocument();
    expect(screen.queryByText('Follow Up')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '' } });
    const categorySelect = screen.getByRole('combobox');
    fireEvent.change(categorySelect, { target: { value: 'Follow-up Visit' } });
    expect(screen.getByText('Follow Up')).toBeInTheDocument();
    expect(screen.queryByText('Skin Check')).not.toBeInTheDocument();

    fireEvent.change(categorySelect, { target: { value: '' } });
    const favoritesButton = screen.getByRole('button', { name: /Favorites Only/i });
    fireEvent.click(favoritesButton);
    expect(screen.getByText('Skin Check')).toBeInTheDocument();
    expect(screen.queryByText('Follow Up')).not.toBeInTheDocument();

    fireEvent.click(favoritesButton);
    const followCard = screen.getByText('Follow Up').closest('div') as HTMLElement;
    fireEvent.click(within(followCard).getAllByRole('button')[0]);
    await waitFor(() =>
      expect(apiMocks.toggleNoteTemplateFavorite).toHaveBeenCalledWith('tenant-1', 'token-1', 'tmpl-2')
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Added to favorites');

    const skinCard = screen.getByText('Skin Check').closest('div') as HTMLElement;
    fireEvent.click(skinCard);
    expect(screen.getByText('Usage Count:')).toBeInTheDocument();
    expect(screen.getByText('Chief Complaint')).toBeInTheDocument();
    expect(screen.getByText('Itch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Usage Count:')).not.toBeInTheDocument();

    fireEvent.click(within(skinCard).getByRole('button', { name: 'Clone' }));
    const cloneModal = screen.getByTestId('modal-create-note-template');
    const cloneScope = within(cloneModal);
    expect(cloneScope.getByDisplayValue('Skin Check (Copy)')).toBeInTheDocument();
    expect(cloneScope.getByDisplayValue('Annual check')).toBeInTheDocument();
    fireEvent.click(cloneScope.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('modal-create-note-template')).not.toBeInTheDocument();
  });

  it('creates, edits, and deletes templates', async () => {
    render(<NoteTemplatesPage />);

    await screen.findByText('Note Templates');
    await screen.findByText('Skin Check');

    fireEvent.click(screen.getByRole('button', { name: /Create Template/i }));
    const createModal = screen.getByTestId('modal-create-note-template');
    const createScope = within(createModal);
    fireEvent.change(createScope.getByPlaceholderText('e.g., Skin Cancer Screening Visit'), {
      target: { value: 'Procedure Template' },
    });
    fireEvent.change(createScope.getByRole('combobox'), { target: { value: 'Procedure Note' } });
    fireEvent.click(createScope.getByRole('checkbox'));
    fireEvent.change(createScope.getByPlaceholderText('Brief description of when to use this template...'), {
      target: { value: 'Post-procedure template' },
    });
    fireEvent.change(createScope.getByPlaceholderText('e.g., Patient presents for annual skin check'), {
      target: { value: 'Post-op check' },
    });

    fireEvent.click(createScope.getByRole('button', { name: 'Create Template' }));
    await waitFor(() => expect(apiMocks.createNoteTemplate).toHaveBeenCalled());
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Template created successfully');

    const skinCard = screen.getByText('Skin Check').closest('div') as HTMLElement;
    fireEvent.click(within(skinCard).getByRole('button', { name: 'Edit' }));
    const editModal = screen.getByTestId('modal-edit-note-template');
    const editScope = within(editModal);
    fireEvent.change(editScope.getByDisplayValue('Skin Check'), { target: { value: 'Skin Check Updated' } });
    fireEvent.click(editScope.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(apiMocks.updateNoteTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'tmpl-1',
        expect.objectContaining({ name: 'Skin Check Updated' })
      )
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Template updated successfully');

    fireEvent.click(within(skinCard).getByRole('button', { name: 'Delete' }));
    const deleteModal = screen.getByTestId('modal-delete-template');
    expect(within(deleteModal).getByText(/This template has been used 5 time\(s\)/)).toBeInTheDocument();
    fireEvent.click(within(deleteModal).getByRole('button', { name: 'Delete Template' }));
    await waitFor(() =>
      expect(apiMocks.deleteNoteTemplate).toHaveBeenCalledWith('tenant-1', 'token-1', 'tmpl-1')
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Template deleted successfully');
  });

  it('surfaces mutation errors and favorite failures', async () => {
    render(<NoteTemplatesPage />);

    await screen.findByText('Note Templates');
    await screen.findByText('Skin Check');

    apiMocks.createNoteTemplate.mockRejectedValueOnce(new Error('create failed'));
    fireEvent.click(screen.getByRole('button', { name: /Create Template/i }));
    const createModal = screen.getByTestId('modal-create-note-template');
    const createScope = within(createModal);
    fireEvent.change(createScope.getByPlaceholderText('e.g., Skin Cancer Screening Visit'), {
      target: { value: 'Broken Template' },
    });
    fireEvent.click(createScope.getByRole('button', { name: 'Create Template' }));
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('create failed'));
    fireEvent.click(createScope.getByRole('button', { name: 'Cancel' }));

    apiMocks.updateNoteTemplate.mockRejectedValueOnce(new Error('update failed'));
    const skinCard = screen.getByText('Skin Check').closest('div') as HTMLElement;
    fireEvent.click(within(skinCard).getByRole('button', { name: 'Edit' }));
    const editModal = screen.getByTestId('modal-edit-note-template');
    const editScope = within(editModal);
    fireEvent.click(editScope.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('update failed'));
    fireEvent.click(editScope.getByRole('button', { name: 'Cancel' }));

    apiMocks.deleteNoteTemplate.mockRejectedValueOnce(new Error('delete failed'));
    fireEvent.click(within(skinCard).getByRole('button', { name: 'Delete' }));
    const deleteModal = screen.getByTestId('modal-delete-template');
    fireEvent.click(within(deleteModal).getByRole('button', { name: 'Delete Template' }));
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('delete failed'));
    fireEvent.click(within(deleteModal).getByRole('button', { name: 'Cancel' }));

    apiMocks.toggleNoteTemplateFavorite.mockRejectedValueOnce(new Error('favorite failed'));
    const followCard = screen.getByText('Follow Up').closest('div') as HTMLElement;
    fireEvent.click(within(followCard).getAllByRole('button')[0]);
    await waitFor(() => expect(toastMocks.showError).toHaveBeenCalledWith('favorite failed'));
  });

  it('shows load errors and empty states', async () => {
    apiMocks.fetchNoteTemplates.mockRejectedValueOnce(new Error('load failed'));

    render(<NoteTemplatesPage />);

    await screen.findByText('Note Templates');

    expect(toastMocks.showError).toHaveBeenCalledWith('load failed');
    expect(screen.getByText('No templates yet')).toBeInTheDocument();
  });
});
