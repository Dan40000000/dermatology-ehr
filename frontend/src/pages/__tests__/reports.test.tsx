import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string },
}));

const exportMocks = vi.hoisted(() => ({
  exportToCSV: vi.fn(),
  exportToPDF: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../utils/exportUtils', () => ({
  exportToCSV: exportMocks.exportToCSV,
  exportToPDF: exportMocks.exportToPDF,
  formatCurrency: (cents: number) => `$${(cents / 100).toFixed(2)}`,
  formatDate: (value: string) => value,
}));

import ReportsPage from '../ReportsPage';

const baseFiltersResponses = [
  { ok: true, json: async () => ({ providers: [{ id: 'prov-1', name: 'Dr. Smith' }] }) },
  { ok: true, json: async () => ({ locations: [{ id: 'loc-1', name: 'Main' }] }) },
  { ok: true, json: async () => ({ appointmentTypes: [{ id: 'type-1', name: 'Consult' }] }) },
];

beforeEach(() => {
  authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1' };
  localStorage.setItem('accessToken', 'token-1');
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  localStorage.removeItem('accessToken');
  vi.restoreAllMocks();
  exportMocks.exportToCSV.mockReset();
  exportMocks.exportToPDF.mockReset();
});

describe('ReportsPage', () => {
  it('generates appointment reports and exports', async () => {
    const fetchMock = vi.spyOn(global, 'fetch');

    baseFiltersResponses.forEach((response) => fetchMock.mockResolvedValueOnce(response as Response));
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              date: '2024-01-01',
              time: '09:00',
              patientName: 'Jane Doe',
              providerName: 'Dr. Smith',
              locationName: 'Main',
              appointmentType: 'Consult',
              status: 'scheduled',
              duration: 30,
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['csv']),
      } as Response);

    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ReportsPage />);

    await screen.findByText('Appointments Report');

    fireEvent.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Jane Doe');

    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(exportMocks.exportToPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Appointments Report',
        filename: expect.stringContaining('appointments_report'),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/reports/appointments'),
        expect.objectContaining({ method: 'POST' })
      )
    );

    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('renders financial summaries and exports PDF', async () => {
    const fetchMock = vi.spyOn(global, 'fetch');

    baseFiltersResponses.forEach((response) => fetchMock.mockResolvedValueOnce(response as Response));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            date: '2024-01-02',
            patientName: 'John Smith',
            services: 'Biopsy',
            chargesCents: 15000,
            paymentsCents: 5000,
            balanceCents: 10000,
            claimNumber: 'CLM-1',
          },
        ],
        summary: {
          totalCharges: 15000,
          totalPayments: 5000,
          totalOutstanding: 10000,
        },
      }),
    } as Response);

    render(<ReportsPage />);

    await screen.findByText('Appointments Report');
    fireEvent.click(screen.getByRole('button', { name: 'Financial' }));

    fireEvent.click(screen.getByRole('button', { name: 'Generate Report' }));

    await screen.findByText('$150.00');
    await screen.findByText('John Smith');

    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(exportMocks.exportToPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Financial Report',
        filename: expect.stringContaining('financial_report'),
      })
    );
  });
});
