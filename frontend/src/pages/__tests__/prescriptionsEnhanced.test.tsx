import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PrescriptionsPageEnhanced } from '../PrescriptionsPageEnhanced';
import * as api from '../../api';

// Mock the API
vi.mock('../../api');

// Mock the contexts
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: {
      tenantId: 'test-tenant',
      accessToken: 'test-token',
      user: { id: 'user-1', email: 'test@test.com', fullName: 'Test User', role: 'provider' },
    },
  }),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

// Mock the prescription components
vi.mock('../../components/prescriptions', () => ({
  PARequestModal: () => <div>PA Request Modal</div>,
  PAStatusBadge: () => <div>PA Status Badge</div>,
  PADetailModal: () => <div>PA Detail Modal</div>,
  DrugInteractionChecker: () => <div>Drug Interaction Checker</div>,
}));

describe('PrescriptionsPageEnhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default API mocks
    vi.mocked(api.fetchPrescriptionsEnhanced).mockResolvedValue({
      prescriptions: [
        {
          id: 'rx-1',
          tenantId: 'test-tenant',
          patientId: 'patient-1',
          providerId: 'provider-1',
          type: 'rx',
          status: 'pending',
          details: 'Tretinoin 0.05% cream\nQty: 30g\nSig: Once daily\nRefills: 2',
          createdAt: '2026-01-15T10:00:00Z',
        },
      ],
    });

    vi.mocked(api.fetchPatients).mockResolvedValue({
      patients: [
        {
          id: 'patient-1',
          tenantId: 'test-tenant',
          firstName: 'John',
          lastName: 'Doe',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    vi.mocked(api.fetchPARequests).mockResolvedValue([]);
    vi.mocked(api.fetchEligibilityHistoryBatch).mockResolvedValue({ history: {} });

    vi.mocked(api.fetchRefillRequestsNew).mockResolvedValue({
      refillRequests: [],
    });

    vi.mocked(api.fetchRxChangeRequests).mockResolvedValue({
      rxChangeRequests: [],
    });
  });

  it('renders the prescriptions page with tabs', async () => {
    render(<PrescriptionsPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Prescriptions (eRx)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Rx$/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Refill Req\.$/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Rx Change Requests/ })).toBeInTheDocument();
    });
  });

  it('displays prescription data in the table', async () => {
    render(<PrescriptionsPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Doe, John')).toBeInTheDocument();
      expect(screen.getByText('Tretinoin 0.05% cream')).toBeInTheDocument();
    });
  });

  it('switches to refill requests tab', async () => {
    render(<PrescriptionsPageEnhanced />);

    const refillTab = await screen.findByRole('button', { name: /^Refill Req\.$/ });
    fireEvent.click(refillTab);

    await waitFor(() => {
      expect(api.fetchRefillRequestsNew).toHaveBeenCalledWith(
        'test-tenant',
        'test-token'
      );
    });
  });

  it('switches to change requests tab', async () => {
    render(<PrescriptionsPageEnhanced />);

    const changeTab = await screen.findByText(/Rx Change Requests/);
    fireEvent.click(changeTab);

    await waitFor(() => {
      expect(api.fetchRxChangeRequests).toHaveBeenCalledWith(
        'test-tenant',
        'test-token'
      );
    });
  });

  it('handles bulk eRx send', async () => {
    vi.mocked(api.bulkSendErx).mockResolvedValue({
      success: true,
      batchId: 'batch-1',
      successCount: 1,
      failureCount: 0,
      totalCount: 1,
      results: { success: ['rx-1'], failed: [] },
    });

    render(<PrescriptionsPageEnhanced />);

    // Wait for prescriptions to load
    await waitFor(() => {
      expect(screen.getByText('Tretinoin 0.05% cream')).toBeInTheDocument();
    });

    // Select a prescription
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // First checkbox is "select all"

    // Click bulk send button
    const bulkSendButton = screen.getByText(/ePrescribe Selected/);
    fireEvent.click(bulkSendButton);

    await waitFor(() => {
      expect(api.bulkSendErx).toHaveBeenCalledWith(
        'test-tenant',
        'test-token',
        ['rx-1']
      );
    });
  });

  it('applies enhanced filters', async () => {
    render(<PrescriptionsPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Tretinoin 0.05% cream')).toBeInTheDocument();
    });

    // Apply eRx status filter
    const erxStatusSelect = screen.getByLabelText('eRx') as HTMLSelectElement;
    fireEvent.change(erxStatusSelect, { target: { value: 'success' } });

    await waitFor(() => {
      expect(api.fetchPrescriptionsEnhanced).toHaveBeenCalledWith(
        'test-tenant',
        'test-token',
        expect.objectContaining({
          erxStatus: 'success',
        })
      );
    });
  });

  it('filters by controlled substances', async () => {
    render(<PrescriptionsPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Tretinoin 0.05% cream')).toBeInTheDocument();
    });

    // Click controlled substances checkbox
    const controlledCheckbox = screen.getByLabelText('Controlled Substance');
    fireEvent.click(controlledCheckbox);

    await waitFor(() => {
      expect(api.fetchPrescriptionsEnhanced).toHaveBeenCalledWith(
        'test-tenant',
        'test-token',
        expect.objectContaining({
          isControlled: true,
        })
      );
    });
  });

  it('clears all filters', async () => {
    render(<PrescriptionsPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Tretinoin 0.05% cream')).toBeInTheDocument();
    });

    // Apply some filters
    const erxStatusSelect = screen.getByLabelText('eRx') as HTMLSelectElement;
    fireEvent.change(erxStatusSelect, { target: { value: 'success' } });

    // Clear filters
    const clearButton = screen.getByText('Clear Filters');
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(erxStatusSelect.value).toBe('any');
    });
  });

  it('handles refill approval', async () => {
    vi.mocked(api.fetchRefillRequestsNew).mockResolvedValue({
      refillRequests: [
        {
          id: 'refill-1',
          tenantId: 'test-tenant',
          patientId: 'patient-1',
          patientFirstName: 'John',
          patientLastName: 'Doe',
          medication_name: 'Tretinoin 0.05% cream',
          requested_date: '2026-01-15T10:00:00Z',
          status: 'pending',
        },
      ],
    });

    vi.mocked(api.approveRefillRequest).mockResolvedValue({
      success: true,
      message: 'Refill approved',
    });

    render(<PrescriptionsPageEnhanced />);

    // Switch to refills tab
    const refillTab = await screen.findByRole('button', { name: /^Refill Req\.$/ });
    fireEvent.click(refillTab);

    await waitFor(() => {
      expect(screen.getByText('Tretinoin 0.05% cream')).toBeInTheDocument();
    });

    // Click approve button
    const approveButton = screen.getByText('Approve');
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.approveRefillRequest).toHaveBeenCalledWith(
        'test-tenant',
        'test-token',
        'refill-1'
      );
    });
  });

  it('handles change request approval', async () => {
    vi.mocked(api.fetchRxChangeRequests).mockResolvedValue({
      rxChangeRequests: [
        {
          id: 'change-1',
          tenantId: 'test-tenant',
          patientId: 'patient-1',
          patientFirstName: 'John',
          patientLastName: 'Doe',
          original_drug: 'Tretinoin 0.05% cream',
          change_type: 'Generic Substitution',
          pharmacy_name: 'CVS Pharmacy',
          request_date: '2026-01-15T10:00:00Z',
          status: 'pending_review',
        },
      ],
    });

    vi.mocked(api.approveRxChangeRequest).mockResolvedValue({
      success: true,
      message: 'Change request approved',
    });

    render(<PrescriptionsPageEnhanced />);

    // Switch to change requests tab
    const changeTab = await screen.findByText(/Rx Change Requests/);
    fireEvent.click(changeTab);

    await waitFor(() => {
      expect(screen.getByText('Generic Substitution')).toBeInTheDocument();
    });

    // Click approve button
    const approveButton = screen.getByText('Approve');
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.approveRxChangeRequest).toHaveBeenCalledWith(
        'test-tenant',
        'test-token',
        'change-1',
        {}
      );
    });
  });

  it('shows empty state when no prescriptions', async () => {
    vi.mocked(api.fetchPrescriptionsEnhanced).mockResolvedValue({
      prescriptions: [],
    });

    render(<PrescriptionsPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('No Prescriptions Found')).toBeInTheDocument();
    });
  });

  it('displays statistics cards', async () => {
    render(<PrescriptionsPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Total Rx')).toBeInTheDocument();
      expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Filled').length).toBeGreaterThan(0);
    });
  });
});
