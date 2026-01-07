import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | {
    tenantId: string;
    accessToken: string;
    user: { id: string; email: string };
  },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchPhotos: vi.fn(),
  fetchPatients: vi.fn(),
  createPhoto: vi.fn(),
  uploadPhotoFile: vi.fn(),
  updatePhotoAnnotations: vi.fn(),
  createComparisonGroup: vi.fn(),
  fetchComparisonGroup: vi.fn(),
  API_BASE_URL: 'http://api.test',
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

vi.mock('../../components/clinical/PhotoAnnotator', () => ({
  PhotoAnnotator: ({
    onSave,
    onCancel,
  }: {
    onSave: (annotations: { shapes: { id: string }[] }) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="photo-annotator">
      <button type="button" onClick={() => onSave({ shapes: [{ id: 'shape-1' }] })}>
        Save Annotations
      </button>
      <button type="button" onClick={onCancel}>
        Cancel Annotations
      </button>
    </div>
  ),
}));

vi.mock('../../components/clinical/PhotoComparison', () => ({
  PhotoComparison: ({ photos }: { photos: { id: string }[] }) => (
    <div data-testid="photo-comparison">Comparing {photos.length}</div>
  ),
}));

vi.mock('../../components/clinical/PhotoTimeline', () => ({
  PhotoTimeline: ({ photos, onPhotoClick }: { photos: { id: string }[]; onPhotoClick: (photo: { id: string }) => void }) => (
    <div data-testid="photo-timeline">
      <button type="button" onClick={() => onPhotoClick(photos[0])}>
        Open Timeline Photo
      </button>
    </div>
  ),
}));

import { PhotosPage } from '../PhotosPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'demo@example.com' },
};

const buildFixtures = () => ({
  patients: [
    { id: 'patient-1', firstName: 'Ana', lastName: 'Derm' },
    { id: 'patient-2', firstName: 'Ben', lastName: 'Skin' },
  ],
  photos: [
    {
      id: 'photo-1',
      patientId: 'patient-1',
      category: 'clinical',
      photoType: 'clinical',
      bodyRegion: 'Face',
      description: 'Baseline',
      url: 'http://image.test/1',
      storage: 's3',
      objectKey: 'photo-1',
      annotations: { shapes: [] },
      createdAt: '2024-02-01T10:00:00.000Z',
    },
    {
      id: 'photo-2',
      patientId: 'patient-2',
      category: 'clinical',
      photoType: 'clinical',
      bodyRegion: 'Arm',
      description: 'Follow-up',
      url: 'http://image.test/2',
      storage: 's3',
      objectKey: 'photo-2',
      annotations: { shapes: [] },
      createdAt: '2024-02-10T10:00:00.000Z',
    },
  ],
});

describe('PhotosPage', () => {
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    authMocks.session = baseSession;
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
    URL.createObjectURL = vi.fn(() => 'blob:preview');

    const fixtures = buildFixtures();
    apiMocks.fetchPhotos.mockResolvedValue({ photos: fixtures.photos });
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    apiMocks.uploadPhotoFile.mockResolvedValue({
      url: 'http://upload.test/photo',
      objectKey: 'photo-key',
      storage: 's3',
    });
    apiMocks.createPhoto.mockResolvedValue({ id: 'photo-3' });
    apiMocks.updatePhotoAnnotations.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    vi.clearAllMocks();
  });

  it('uploads a photo and saves annotations', async () => {
    render(<PhotosPage />);

    await screen.findByText('Clinical Photos');

    fireEvent.click(screen.getByRole('button', { name: '+ Upload Photo' }));
    const uploadModal = await screen.findByTestId('modal-upload-clinical-photo');
    const selects = within(uploadModal).getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'patient-1' } });
    fireEvent.change(selects[1], { target: { value: 'clinical' } });
    fireEvent.change(selects[2], { target: { value: 'Face' } });
    fireEvent.change(within(uploadModal).getByPlaceholderText('Clinical notes about this photo...'), {
      target: { value: 'New lesion' },
    });

    const fileInput = uploadModal.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    const file = new File(['image-data'], 'lesion.png', { type: 'image/png' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    fireEvent.click(within(uploadModal).getByRole('button', { name: 'Upload Photo' }));

    await waitFor(() =>
      expect(apiMocks.uploadPhotoFile).toHaveBeenCalledWith('tenant-1', 'token-1', file),
    );
    await waitFor(() =>
      expect(apiMocks.createPhoto).toHaveBeenCalledWith('tenant-1', 'token-1', {
        patientId: 'patient-1',
        url: 'http://upload.test/photo',
        objectKey: 'photo-key',
        storage: 's3',
        category: 'clinical',
        photoType: 'clinical',
        bodyRegion: 'Face',
        bodyLocation: 'Face',
        description: 'New lesion',
        filename: 'lesion.png',
        mimeType: 'image/png',
        fileSize: file.size,
      }),
    );

    fireEvent.click(screen.getByAltText('Baseline'));
    const viewModal = await screen.findByTestId('modal-photo-details');
    fireEvent.click(within(viewModal).getByRole('button', { name: 'Annotate' }));
    const annotateModal = await screen.findByTestId('modal-annotate-photo');
    fireEvent.click(within(annotateModal).getByRole('button', { name: 'Save Annotations' }));

    await waitFor(() =>
      expect(apiMocks.updatePhotoAnnotations).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        'photo-1',
        { shapes: [{ id: 'shape-1' }] },
      ),
    );
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Annotations saved successfully');
  });

  it('selects photos for comparison', async () => {
    render(<PhotosPage />);

    await screen.findByText('Clinical Photos');
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    const compareButton = screen.getByRole('button', { name: /Compare \(2\)/ });
    expect(compareButton).not.toBeDisabled();
  });
});
