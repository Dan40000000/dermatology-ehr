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
  fetchAppointments: vi.fn(),
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
  Panel: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div data-testid={title ? `panel-${title.toLowerCase().replace(/\s+/g, '-')}` : 'panel'}>
      {title && <div>{title}</div>}
      {children}
    </div>
  ),
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

vi.mock('../../components/inventory/InventoryUsageList', () => ({
  InventoryUsageList: ({ onOpenUsageModal }: { onOpenUsageModal: () => void }) => (
    <div data-testid="inventory-usage-list">
      <button type="button" onClick={onOpenUsageModal}>Open Usage</button>
    </div>
  ),
}));

vi.mock('../../components/inventory/InventoryUsageModal', () => ({
  InventoryUsageModal: ({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="inventory-usage-modal">
        <button type="button" onClick={onSuccess}>Success</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    );
  },
}));

import { AppointmentFlowPage } from '../AppointmentFlowPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'staff@example.com', role: 'staff', fullName: 'Staff User' },
};

const makeAppointment = (index: number, start: Date) => {
  const startTime = new Date(start.getTime() + index * 15 * 60000);
  const endTime = new Date(start.getTime() + (index * 15 + 15) * 60000);
  return {
    id: `appt-${index + 1}`,
    tenantId: 'tenant-1',
    patientId: `pat-${index + 1}`,
    patientName: `Patient ${index + 1}`,
    providerId: 'prov-1',
    locationId: 'loc-1',
    appointmentTypeId: 'type-1',
    appointmentTypeName: 'Consult',
    scheduledStart: startTime.toISOString(),
    scheduledEnd: endTime.toISOString(),
    status: 'scheduled' as const,
    createdAt: new Date().toISOString(),
  };
};

beforeEach(() => {
  authMocks.session = baseSession;
  toastMocks.showSuccess.mockClear();
  toastMocks.showError.mockClear();

  const selectedDate = new Date().toISOString().split('T')[0];
  const selectedDateStr = new Date(selectedDate).toDateString();
  const baseTime = new Date(`${selectedDateStr} 09:00:00`);

  const appointments = Array.from({ length: 8 }, (_, i) => makeAppointment(i, baseTime));

  apiMocks.fetchAppointments.mockResolvedValue({ appointments });
  apiMocks.fetchPatients.mockResolvedValue({
    patients: appointments.map((appt) => ({
      id: appt.patientId,
      tenantId: 'tenant-1',
      firstName: appt.patientName.split(' ')[0],
      lastName: appt.patientName.split(' ')[1] || 'Patient',
      createdAt: new Date().toISOString(),
    })),
  });
  apiMocks.fetchProviders.mockResolvedValue({
    providers: [
      { id: 'prov-1', tenantId: 'tenant-1', fullName: 'Dr. Curie', name: 'Dr. Curie', createdAt: new Date().toISOString() },
    ],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AppointmentFlowPage', () => {
  it('advances appointments, marks no-show, and opens inventory actions', async () => {
    render(<AppointmentFlowPage />);

    await screen.findByText('Appointment Flow');
    await screen.findByText('Patient 4');

    const noShowButtons = screen.getAllByRole('button', { name: 'No-Show' });
    fireEvent.click(noShowButtons[0]);
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Marked as no-show');

    fireEvent.click(screen.getByText('Patient 4'));
    const detailModal = await screen.findByTestId('modal-appointment-details');

    expect(within(detailModal).getByTestId('inventory-usage-list')).toBeInTheDocument();
    fireEvent.click(within(detailModal).getByRole('button', { name: 'Record Inventory' }));

    const usageModal = await screen.findByTestId('inventory-usage-modal');
    fireEvent.click(within(usageModal).getByRole('button', { name: 'Success' }));
    fireEvent.click(within(usageModal).getByRole('button', { name: 'Close' }));

    fireEvent.click(within(detailModal).getByRole('button', { name: 'Advance to Next Step' }));

    await waitFor(() =>
      expect(toastMocks.showSuccess).toHaveBeenCalledWith('Appointment advanced to checkout')
    );
  });
});
