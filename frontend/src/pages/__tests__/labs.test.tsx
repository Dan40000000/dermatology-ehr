import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  fetchOrders: vi.fn(),
  fetchPatients: vi.fn(),
  createOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
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
}));

import { LabsPage } from '../LabsPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'staff@example.com', role: 'staff', fullName: 'Staff User' },
};

const now = new Date().toISOString();

beforeEach(() => {
  authMocks.session = baseSession;
  toastMocks.showSuccess.mockClear();
  toastMocks.showError.mockClear();

  apiMocks.fetchOrders.mockResolvedValue({
    orders: [
      {
        id: 'order-1',
        tenantId: 'tenant-1',
        patientId: 'pat-1',
        providerId: 'prov-1',
        type: 'lab',
        status: 'pending',
        priority: 'routine',
        details: 'CBC with Differential\nCRP',
        createdAt: now,
      },
      {
        id: 'order-2',
        tenantId: 'tenant-1',
        patientId: 'pat-2',
        providerId: 'prov-1',
        type: 'lab',
        status: 'in-progress',
        priority: 'stat',
        details: 'TSH\nANA (Antinuclear Antibody)\nVitamin D, 25-Hydroxy',
        createdAt: now,
      },
      {
        id: 'order-3',
        tenantId: 'tenant-1',
        patientId: 'pat-1',
        providerId: 'prov-1',
        type: 'lab',
        status: 'completed',
        priority: 'urgent',
        details: 'Zinc Level',
        createdAt: now,
      },
      {
        id: 'order-4',
        tenantId: 'tenant-1',
        patientId: 'pat-1',
        providerId: 'prov-1',
        type: 'imaging',
        status: 'pending',
        details: 'X-Ray',
        createdAt: now,
      },
    ],
  });

  apiMocks.fetchPatients.mockResolvedValue({
    patients: [
      { id: 'pat-1', tenantId: 'tenant-1', firstName: 'Jane', lastName: 'Doe', createdAt: now },
      { id: 'pat-2', tenantId: 'tenant-1', firstName: 'John', lastName: 'Smith', createdAt: now },
    ],
  });

  apiMocks.createOrder.mockResolvedValue({ id: 'order-new' });
  apiMocks.updateOrderStatus.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LabsPage', () => {
  it('loads lab orders, supports selection, and updates status', async () => {
    render(<LabsPage />);

    await screen.findAllByText('Doe, Jane');

    const printButton = screen.getByRole('button', { name: 'Print Requisition' });
    expect(printButton).toBeDisabled();

    const [selectAll] = screen.getAllByRole('checkbox');
    fireEvent.click(selectAll);
    expect(printButton).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Collected' }));
    await waitFor(() =>
      expect(apiMocks.updateOrderStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'order-1', 'in-progress')
    );

    fireEvent.click(screen.getByText('Pending', { selector: 'div' }));
    expect(screen.queryByRole('button', { name: 'Results' })).not.toBeInTheDocument();
  });

  it('creates lab orders and completes results', async () => {
    render(<LabsPage />);

    await screen.findByText(/New Lab Order/i);

    fireEvent.click(screen.getByRole('button', { name: /New Lab Order/i }));
    const modal = await screen.findByTestId('modal-new-lab-order');
    const selects = within(modal).getAllByRole('combobox');

    fireEvent.change(selects[0], { target: { value: 'pat-1' } });
    fireEvent.change(selects[1], { target: { value: 'stat' } });

    fireEvent.click(within(modal).getByLabelText('CBC with Differential'));
    fireEvent.click(within(modal).getByLabelText('Fasting Required'));
    fireEvent.change(within(modal).getByPlaceholderText('Additional instructions...'), {
      target: { value: 'Call patient' },
    });

    fireEvent.click(within(modal).getByRole('button', { name: 'Create Lab Order' }));

    await waitFor(() =>
      expect(apiMocks.createOrder).toHaveBeenCalledWith('tenant-1', 'token-1', {
        patientId: 'pat-1',
        type: 'lab',
        details: 'CBC with Differential\n\n** FASTING REQUIRED **',
        priority: 'stat',
        notes: 'Call patient',
        status: 'pending',
      })
    );

    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Lab order created');

    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    const resultsModal = await screen.findByTestId('modal-lab-results');
    fireEvent.click(within(resultsModal).getByRole('button', { name: 'Mark Complete' }));

    await waitFor(() =>
      expect(apiMocks.updateOrderStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'order-2', 'completed')
    );
  });
});
