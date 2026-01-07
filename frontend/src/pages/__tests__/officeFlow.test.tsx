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
}));

import { OfficeFlowPage } from '../OfficeFlowPage';

const baseSession = {
  tenantId: 'tenant-1',
  accessToken: 'token-1',
  user: { id: 'user-1', email: 'staff@example.com', role: 'staff', fullName: 'Staff User' },
};

const makeAppointment = (index: number, start: Date) => {
  const startTime = new Date(start.getTime() + index * 20 * 60000);
  const endTime = new Date(start.getTime() + (index * 20 + 20) * 60000);
  return {
    id: `appt-${index + 1}`,
    tenantId: 'tenant-1',
    patientId: `pat-${index + 1}`,
    patientName: `Patient ${index + 1}`,
    providerId: 'prov-1',
    locationId: 'loc-1',
    appointmentTypeId: 'type-1',
    appointmentTypeName: 'Visit',
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

  const baseTime = new Date();
  baseTime.setHours(9, 0, 0, 0);
  const appointments = Array.from({ length: 6 }, (_, i) => makeAppointment(i, baseTime));

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
      { id: 'prov-1', tenantId: 'tenant-1', fullName: 'Dr. House', name: 'Dr. House', createdAt: new Date().toISOString() },
    ],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeFlowPage', () => {
  it('rooms patients and updates statuses through checkout', async () => {
    render(<OfficeFlowPage />);

    await screen.findByText('Office Flow');
    await screen.findByText('Waiting Room');

    const roomSelects = screen.getAllByRole('combobox');
    const roomSelect = roomSelects.find((select) =>
      within(select).queryByRole('option', { name: 'Room patient...' })
    ) as HTMLSelectElement;

    fireEvent.change(roomSelect, { target: { value: 'room-2' } });
    await waitFor(() =>
      expect(toastMocks.showSuccess).toHaveBeenCalledWith(expect.stringMatching(/roomed in/i))
    );

    const startButtons = screen.getAllByRole('button', { name: 'Start Visit' });
    fireEvent.click(startButtons[0]);
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Status updated to with-provider');

    const checkoutButtons = screen.getAllByRole('button', { name: 'Ready for Checkout' });
    fireEvent.click(checkoutButtons[0]);
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Status updated to checkout');

    const completeButtons = screen.getAllByRole('button', { name: 'Complete' });
    fireEvent.click(completeButtons[0]);
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Status updated to completed');
  });
});
