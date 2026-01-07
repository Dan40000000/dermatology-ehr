import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchPortalBalance: vi.fn(),
  fetchPortalCharges: vi.fn(),
  fetchPortalPaymentMethods: vi.fn(),
  addPortalPaymentMethod: vi.fn(),
  deletePortalPaymentMethod: vi.fn(),
  makePortalPayment: vi.fn(),
  fetchPortalPaymentHistory: vi.fn(),
  fetchPortalAutoPay: vi.fn(),
  cancelPortalAutoPay: vi.fn(),
}));

vi.mock('../../portalApi', () => apiMocks);

import BillPayPage from '../Portal/BillPayPage';

const buildFixtures = () => ({
  balance: {
    totalCharges: 200,
    totalPayments: 50,
    totalAdjustments: 0,
    currentBalance: 150.5,
    lastPaymentDate: '2024-03-01T00:00:00Z',
    lastPaymentAmount: 50,
  },
  charges: {
    charges: [
      {
        id: 'charge-1',
        serviceDate: '2024-03-10T00:00:00Z',
        description: 'Office Visit',
        amount: 100,
        transactionType: 'charge',
        createdAt: '2024-03-10T00:00:00Z',
      },
    ],
  },
  paymentMethods: {
    paymentMethods: [
      {
        id: 'pm-1',
        paymentType: 'credit_card',
        lastFour: '4242',
        cardBrand: 'visa',
        cardholderName: 'Ana Derm',
        expiryMonth: 12,
        expiryYear: 2030,
        isDefault: true,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ],
  },
  paymentHistory: {
    payments: [
      {
        id: 'pay-1',
        amount: 50,
        currency: 'USD',
        status: 'completed',
        paymentMethodType: 'credit_card',
        receiptNumber: 'R-100',
        receiptUrl: 'http://receipt.test',
        refundAmount: 0,
        createdAt: '2024-02-02T00:00:00Z',
      },
    ],
  },
  autoPay: {
    enrolled: true,
    chargeDay: 15,
    paymentType: 'credit_card',
    cardBrand: 'visa',
    lastFour: '4242',
  },
});

describe('BillPayPage', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    const fixtures = buildFixtures();

    apiMocks.fetchPortalBalance.mockResolvedValue(fixtures.balance);
    apiMocks.fetchPortalCharges.mockResolvedValue(fixtures.charges);
    apiMocks.fetchPortalPaymentMethods.mockResolvedValue(fixtures.paymentMethods);
    apiMocks.fetchPortalPaymentHistory.mockResolvedValue(fixtures.paymentHistory);
    apiMocks.fetchPortalAutoPay.mockResolvedValue(fixtures.autoPay);
    apiMocks.addPortalPaymentMethod.mockResolvedValue({});
    apiMocks.deletePortalPaymentMethod.mockResolvedValue({});
    apiMocks.makePortalPayment.mockResolvedValue({});
    apiMocks.cancelPortalAutoPay.mockResolvedValue({});

    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy?.mockRestore();
    vi.clearAllMocks();
  });

  it('renders billing data, manages payment methods, and cancels autopay', async () => {
    render(<BillPayPage tenantId="tenant-1" portalToken="token-1" />);

    await screen.findByText('Billing & Payments');
    expect(apiMocks.fetchPortalBalance).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchPortalCharges).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchPortalPaymentMethods).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchPortalPaymentHistory).toHaveBeenCalledWith('tenant-1', 'token-1');
    expect(apiMocks.fetchPortalAutoPay).toHaveBeenCalledWith('tenant-1', 'token-1');

    expect(screen.getByText('$150.50')).toBeInTheDocument();
    expect(screen.getByText(/Last payment: \$50.00 on/)).toBeInTheDocument();
    expect(screen.getByText('Office Visit')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Payment Methods/i }));
    await screen.findByText(/ending in 4242/i);

    fireEvent.click(screen.getByRole('button', { name: 'Add Payment Method' }));
    fireEvent.change(screen.getByLabelText('Card Number'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByLabelText('Cardholder Name'), { target: { value: 'Ana Derm' } });
    fireEvent.change(screen.getByLabelText('Exp Month'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Exp Year'), { target: { value: '2030' } });
    fireEvent.change(screen.getByLabelText('CVV'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('Street Address'), { target: { value: '123 Main St' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Austin' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'TX' } });
    fireEvent.change(screen.getByLabelText('ZIP'), { target: { value: '78701' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));
    await waitFor(() =>
      expect(apiMocks.addPortalPaymentMethod).toHaveBeenCalledWith(
        'tenant-1',
        'token-1',
        expect.objectContaining({
          paymentType: 'credit_card',
          cardNumber: '4111111111111111',
          expiryMonth: 12,
          expiryYear: 2030,
          cardholderName: 'Ana Derm',
          billingAddress: expect.objectContaining({
            city: 'Austin',
            state: 'TX',
            zip: '78701',
          }),
        })
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add Payment Method' })).not.toBeInTheDocument()
    );

    const methodRow = screen.getByText(/ending in 4242/i).closest('li') as HTMLElement;
    const deleteButton = within(methodRow).getByTestId('DeleteIcon').closest('button') as HTMLElement;
    fireEvent.click(deleteButton);
    await waitFor(() =>
      expect(apiMocks.deletePortalPaymentMethod).toHaveBeenCalledWith('tenant-1', 'token-1', 'pm-1')
    );

    fireEvent.click(screen.getByRole('tab', { name: /Payment History/i }));
    const receiptLink = await screen.findByRole('link', { name: /Receipt/i });
    expect(receiptLink).toHaveAttribute('href', 'http://receipt.test');

    fireEvent.click(screen.getByRole('tab', { name: /Auto-Pay/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Auto-Pay' }));
    await waitFor(() => expect(apiMocks.cancelPortalAutoPay).toHaveBeenCalledWith('tenant-1', 'token-1'));
  });

  it('validates and handles payment dialog errors', async () => {
    apiMocks.makePortalPayment.mockRejectedValueOnce(new Error('fail'));

    render(<BillPayPage tenantId="tenant-1" portalToken="token-1" />);

    await screen.findByText('Billing & Payments');
    fireEvent.click(screen.getByRole('button', { name: 'Make a Payment' }));

    fireEvent.click(screen.getByRole('button', { name: 'Pay Now' }));
    expect(await screen.findByText('Please select a payment method and enter an amount')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Payment Amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByLabelText(/ending in 4242/i));
    fireEvent.click(screen.getByRole('button', { name: 'Pay Now' }));

    await waitFor(() =>
      expect(apiMocks.makePortalPayment).toHaveBeenCalledWith('tenant-1', 'token-1', {
        amount: 25,
        paymentMethodId: 'pm-1',
        description: 'Patient portal payment',
      })
    );
    expect(await screen.findByText('Payment failed. Please try again.')).toBeInTheDocument();
  });
});
