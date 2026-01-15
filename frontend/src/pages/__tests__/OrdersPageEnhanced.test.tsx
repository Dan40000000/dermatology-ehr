import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrdersPageEnhanced } from '../OrdersPageEnhanced';
import { AuthContext } from '../../contexts/AuthContext';
import { ToastContext } from '../../contexts/ToastContext';
import * as api from '../../api';

// Mock API functions
vi.mock('../../api', () => ({
  fetchOrders: vi.fn(),
  fetchPatients: vi.fn(),
  updateOrderStatus: vi.fn(),
  createOrder: vi.fn(),
}));

const mockSession = {
  tenantId: 'test-tenant',
  accessToken: 'test-token',
  refreshToken: 'test-refresh',
  user: {
    id: 'test-user',
    email: 'test@example.com',
    fullName: 'Test User',
    role: 'provider' as const,
  },
};

const mockOrders = [
  {
    id: 'order-1',
    tenantId: 'test-tenant',
    patientId: 'patient-1',
    providerId: 'provider-1',
    providerName: 'Dr. Smith',
    type: 'lab',
    status: 'open',
    priority: 'normal',
    details: 'CBC with differential',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'order-2',
    tenantId: 'test-tenant',
    patientId: 'patient-2',
    providerId: 'provider-1',
    providerName: 'Dr. Smith',
    type: 'pathology',
    status: 'in-progress',
    priority: 'stat',
    details: 'Skin biopsy',
    createdAt: '2024-01-15T11:00:00Z',
  },
  {
    id: 'order-3',
    tenantId: 'test-tenant',
    patientId: 'patient-1',
    providerId: 'provider-1',
    providerName: 'Dr. Smith',
    type: 'radiology',
    status: 'closed',
    priority: 'high',
    details: 'Chest X-ray',
    createdAt: '2024-01-15T09:00:00Z',
  },
];

const mockPatients = [
  {
    id: 'patient-1',
    tenantId: 'test-tenant',
    firstName: 'John',
    lastName: 'Doe',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'patient-2',
    tenantId: 'test-tenant',
    firstName: 'Jane',
    lastName: 'Smith',
    createdAt: '2024-01-01T00:00:00Z',
  },
];

const mockAuthContext = {
  session: mockSession,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
};

const mockToastContext = {
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
};

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <ToastContext.Provider value={mockToastContext}>{component}</ToastContext.Provider>
    </AuthContext.Provider>
  );
};

describe('OrdersPageEnhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (api.fetchOrders as any).mockResolvedValue({ orders: mockOrders });
    (api.fetchPatients as any).mockResolvedValue({ patients: mockPatients });
  });

  it('renders the page with orders', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Orders Log')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
      expect(screen.getByText('Skin biopsy')).toBeInTheDocument();
    });
  });

  it('displays order statistics correctly', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
      expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
      expect(screen.getByText('STAT Orders')).toBeInTheDocument();
    });
  });

  it('filters orders by type', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
    });

    // Select only Lab orders
    const labCheckbox = screen.getByLabelText('Labs');
    fireEvent.click(labCheckbox);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
      expect(screen.queryByText('Skin biopsy')).not.toBeInTheDocument();
    });
  });

  it('filters orders by status', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
    });

    // Select only In Progress orders
    const inProgressCheckbox = screen.getByLabelText('In Progress');
    fireEvent.click(inProgressCheckbox);

    await waitFor(() => {
      expect(screen.queryByText('CBC with differential')).not.toBeInTheDocument();
      expect(screen.getByText('Skin biopsy')).toBeInTheDocument();
    });
  });

  it('filters orders by priority', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Skin biopsy')).toBeInTheDocument();
    });

    // Select only STAT orders
    const statCheckbox = screen.getByLabelText('STAT');
    fireEvent.click(statCheckbox);

    await waitFor(() => {
      expect(screen.queryByText('CBC with differential')).not.toBeInTheDocument();
      expect(screen.getByText('Skin biopsy')).toBeInTheDocument();
    });
  });

  it('searches orders by details', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search orders...');
    fireEvent.change(searchInput, { target: { value: 'biopsy' } });

    await waitFor(() => {
      expect(screen.queryByText('CBC with differential')).not.toBeInTheDocument();
      expect(screen.getByText('Skin biopsy')).toBeInTheDocument();
    });
  });

  it('groups orders by patient', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
    });

    // Select Patient grouping
    const patientRadio = screen.getByLabelText('Patient');
    fireEvent.click(patientRadio);

    await waitFor(() => {
      expect(screen.getAllByText('Doe, John').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Smith, Jane').length).toBeGreaterThan(0);
    });
  });

  it('clears all filters', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
    });

    // Apply some filters
    const labCheckbox = screen.getByLabelText('Labs');
    fireEvent.click(labCheckbox);

    // Clear filters
    const clearButton = screen.getByText('Clear All Filters');
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
      expect(screen.getByText('Skin biopsy')).toBeInTheDocument();
    });
  });

  it('saves and loads quick filters', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Orders Log')).toBeInTheDocument();
    });

    // Apply filters
    const labCheckbox = screen.getByLabelText('Labs');
    fireEvent.click(labCheckbox);

    // Open save dialog
    const saveButton = screen.getByText('+ Save Current Filter');
    fireEvent.click(saveButton);

    // Enter filter name
    const input = screen.getByPlaceholderText('Filter name...');
    fireEvent.change(input, { target: { value: 'Lab Orders' } });

    // Save
    const confirmButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Lab Orders')).toBeInTheDocument();
    });

    // Clear current filters
    const clearButton = screen.getByText('Clear All Filters');
    fireEvent.click(clearButton);

    // Load saved filter
    const savedFilterButton = screen.getByText('Lab Orders');
    fireEvent.click(savedFilterButton);

    await waitFor(() => {
      const labCheckboxAfter = screen.getByLabelText('Labs');
      expect(labCheckboxAfter).toBeChecked();
    });
  });

  it('refreshes data when Refresh View button is clicked', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(api.fetchOrders).toHaveBeenCalledTimes(1);
    });

    const refreshButton = screen.getByText('Refresh View');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(api.fetchOrders).toHaveBeenCalledTimes(2);
    });
  });

  it('opens new order modal', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Orders Log')).toBeInTheDocument();
    });

    const newOrderButton = screen.getByText('New Order');
    fireEvent.click(newOrderButton);

    await waitFor(() => {
      expect(screen.getByText('Create New Order')).toBeInTheDocument();
    });
  });

  it('creates a new order', async () => {
    (api.createOrder as any).mockResolvedValue({ id: 'new-order' });

    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('Orders Log')).toBeInTheDocument();
    });

    // Open modal
    const newOrderButton = screen.getByText('New Order');
    fireEvent.click(newOrderButton);

    // Fill form
    const patientSelect = screen.getByLabelText('Patient *');
    fireEvent.change(patientSelect, { target: { value: 'patient-1' } });

    const detailsInput = screen.getByPlaceholderText('Enter order details...');
    fireEvent.change(detailsInput, { target: { value: 'New lab order' } });

    // Submit
    const createButton = screen.getByText('Create Order');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(api.createOrder).toHaveBeenCalled();
      expect(mockToastContext.showSuccess).toHaveBeenCalledWith('Order created');
    });
  });

  it('shows empty state when no orders match filters', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
    });

    // Apply filter that matches no orders
    const searchInput = screen.getByPlaceholderText('Search orders...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('No Orders Found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
    });
  });

  it('displays priority indicators correctly', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getAllByText('STAT').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Normal').length).toBeGreaterThan(0);
    });
  });

  it('handles order selection', async () => {
    renderWithProviders(<OrdersPageEnhanced />);

    await waitFor(() => {
      expect(screen.getByText('CBC with differential')).toBeInTheDocument();
    });

    // Verify orders are displayed
    expect(screen.getByText('Skin biopsy')).toBeInTheDocument();
    expect(screen.getByText('Chest X-ray')).toBeInTheDocument();

    // Check that action buttons are present
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
