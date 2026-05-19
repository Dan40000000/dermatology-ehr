import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { StoreOperationsPage } from '../StoreOperationsPage';
import { PortalStorePage } from '../patient-portal/PortalStorePage';
import type { Product, StoreOrder } from '../../types';

const apiMocks = vi.hoisted(() => ({
  adjustProductInventory: vi.fn(),
  createProduct: vi.fn(),
  fetchInventoryStatus: vi.fn(),
  fetchLowStockProducts: vi.fn(),
  fetchProductSales: vi.fn(),
  fetchProducts: vi.fn(),
  fetchSalesReport: vi.fn(),
  updateProduct: vi.fn(),
  updateStoreOrderFulfillment: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  session: {
    tenantId: 'tenant-demo',
    accessToken: 'staff-token',
  },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const portalAuthMocks = vi.hoisted(() => ({
  patient: {
    id: 'patient-1',
    firstName: 'Jamie',
    lastName: 'Lee',
    email: 'jamie@example.com',
  },
}));

const patientPortalFetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../api', () => apiMocks);

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../contexts/PatientPortalAuthContext', () => ({
  usePatientPortalAuth: () => portalAuthMocks,
  patientPortalFetch: patientPortalFetchMock,
}));

vi.mock('../../components/patient-portal/PatientPortalLayout', () => ({
  PatientPortalLayout: ({ children }: { children: ReactElement }) => <div>{children}</div>,
}));

const demoProduct: Product = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-demo',
  sku: 'BARRIER-CRM',
  name: 'Barrier Repair Cream',
  description: 'Fragrance-free moisturizer',
  category: 'skincare',
  brand: 'ClearDerm',
  price: 3600,
  cost: 1400,
  inventoryCount: 12,
  reorderPoint: 4,
  isActive: true,
  createdAt: '2026-05-01T12:00:00Z',
  updatedAt: '2026-05-01T12:00:00Z',
};

const demoOrder: StoreOrder = {
  id: '22222222-2222-4222-8222-222222222222',
  tenantId: 'tenant-demo',
  patientId: 'patient-1',
  patientFirstName: 'Jamie',
  patientLastName: 'Lee',
  soldBy: 'portal:account-1',
  saleDate: '2026-05-17T16:00:00Z',
  subtotal: 7200,
  tax: 594,
  discount: 0,
  total: 8389,
  paymentMethod: 'credit',
  paymentReference: 'pi_demo',
  status: 'completed',
  channel: 'patient_portal',
  fulfillmentStatus: 'paid',
  shippingMethod: 'standard',
  shippingFee: 595,
  notificationEmail: 'jamie@example.com',
  notificationStatus: 'queued',
  stripePaymentIntentId: 'pi_demo',
  stripePaymentStatus: 'paid',
  items: [
    {
      id: 'item-1',
      saleId: '22222222-2222-4222-8222-222222222222',
      productId: demoProduct.id,
      quantity: 2,
      unitPrice: 3600,
      discountAmount: 0,
      lineTotal: 7200,
      productName: demoProduct.name,
      productSku: demoProduct.sku,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.session = {
    tenantId: 'tenant-demo',
    accessToken: 'staff-token',
  };

  apiMocks.fetchProducts.mockResolvedValue({ products: [demoProduct] });
  apiMocks.fetchProductSales.mockResolvedValue({ orders: [demoOrder] });
  apiMocks.fetchInventoryStatus.mockResolvedValue({
    status: {
      totalProducts: 1,
      totalValue: 16800,
      lowStockCount: 0,
      outOfStockCount: 0,
      byCategory: [{ category: 'skincare', count: 1, value: 16800 }],
    },
  });
  apiMocks.fetchLowStockProducts.mockResolvedValue({ products: [] });
  apiMocks.fetchSalesReport.mockResolvedValue({
    report: {
      totalSales: 1,
      totalRevenue: 8389,
      totalDiscounts: 0,
      totalTax: 594,
      uniqueCustomers: 1,
      topProducts: [{ productId: demoProduct.id, productName: demoProduct.name, quantitySold: 2, revenue: 7200 }],
      salesByCategory: [{ category: 'skincare', count: 1, revenue: 7200 }],
      dailySales: [{ date: '2026-05-17', count: 1, revenue: 8389 }],
    },
  });
  apiMocks.updateStoreOrderFulfillment.mockResolvedValue({
    order: {
      ...demoOrder,
      fulfillmentStatus: 'shipped',
      trackingNumber: '1Z999',
    },
  });
});

describe('Store flows', () => {
  it('lets staff update store fulfillment from the provider operations page', async () => {
    render(
      <MemoryRouter>
        <StoreOperationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Order Queue')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fulfillment status for Jamie Lee'), {
      target: { value: 'shipped' },
    });
    fireEvent.change(screen.getByLabelText('Tracking number for Jamie Lee'), {
      target: { value: '1Z999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save order update for Jamie Lee' }));

    await waitFor(() =>
      expect(apiMocks.updateStoreOrderFulfillment).toHaveBeenCalledWith(
        'tenant-demo',
        'staff-token',
        demoOrder.id,
        expect.objectContaining({
          fulfillmentStatus: 'shipped',
          trackingNumber: '1Z999',
          stripePaymentStatus: 'paid',
        })
      )
    );
  });

  it('lets a portal patient add a product and place a shipped store order', async () => {
    patientPortalFetchMock.mockImplementation((endpoint: string, options?: RequestInit) => {
      if (endpoint === '/api/patient-portal-data/store/products') {
        return Promise.resolve({ products: [demoProduct] });
      }
      if (endpoint === '/api/patient-portal-data/store/checkout-session' && options?.method === 'POST') {
        return Promise.resolve({
          checkout: {
            id: 'cs_mock_store',
            paymentStatus: 'paid',
            mode: 'mock',
          },
          order: {
            id: demoOrder.id,
            total: 7794,
            fulfillmentStatus: 'paid',
          },
        });
      }
      return Promise.resolve({});
    });

    render(
      <MemoryRouter>
        <PortalStorePage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Barrier Repair Cream')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Add Barrier Repair Cream to cart'));
    fireEvent.change(screen.getByLabelText('Street'), { target: { value: '101 Main St' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Denver' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'CO' } });
    fireEvent.change(screen.getByLabelText('ZIP'), { target: { value: '80202' } });
    fireEvent.click(screen.getByRole('button', { name: /Place Order/i }));

    await waitFor(() =>
      expect(patientPortalFetchMock).toHaveBeenCalledWith(
        '/api/patient-portal-data/store/checkout-session',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      )
    );
    const [, orderOptions] = patientPortalFetchMock.mock.calls.find(([endpoint]) => endpoint === '/api/patient-portal-data/store/checkout-session')!;
    expect(JSON.parse(String(orderOptions.body))).toEqual(expect.objectContaining({
      shippingMethod: 'standard',
      items: [{ productId: demoProduct.id, quantity: 1 }],
    }));
    expect(await screen.findByText('Order placed')).toBeInTheDocument();
  });
});
