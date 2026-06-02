import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { InventoryPage } from '../InventoryPage';

const apiMocks = vi.hoisted(() => ({
  adjustInventory: vi.fn(),
  createInventoryItem: vi.fn(),
  fetchAllInventoryUsage: vi.fn(),
  fetchInventoryItems: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-clean',
    accessToken: 'staff-token',
  },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

describe('InventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiMocks.fetchInventoryItems.mockResolvedValue({ items: [] });
    apiMocks.fetchAllInventoryUsage.mockResolvedValue({ usage: [] });
  });

  it('does not show demo office cabinets on a clean tenant', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <InventoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiMocks.fetchInventoryItems).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Preferred Cabinets' }));

    expect(screen.getByText('No preferred cabinets selected.')).toBeInTheDocument();
    expect(screen.getByText('No cabinets configured yet.')).toBeInTheDocument();
    expect(screen.queryByText('Main Office')).not.toBeInTheDocument();
    expect(screen.queryByText('Meridian Clinic')).not.toBeInTheDocument();
    expect(screen.queryByText('Meridian Lab Fridge')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All Facilities' })).not.toBeInTheDocument();
  });

  it('keeps add-item draft values when the backdrop is clicked', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <InventoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiMocks.fetchInventoryItems).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: '+ Add Item' }));
    const itemName = screen.getByLabelText('Item Name *');

    fireEvent.change(itemName, { target: { value: 'Glycolic renewal pads' } });
    fireEvent.click(screen.getByRole('presentation'));

    expect(screen.getByText('Add Inventory Item')).toBeInTheDocument();
    expect(screen.getByLabelText('Item Name *')).toHaveValue('Glycolic renewal pads');
  });
});
