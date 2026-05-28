import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PremiumAnalytics } from '../PremiumAnalytics';

const financialApiMocks = vi.hoisted(() => ({
  fetchCollectionsTrend: vi.fn(),
}));

const authSession = vi.hoisted(() => ({
  tenantId: 'tenant-1',
  accessToken: 'token-1',
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: authSession,
  }),
}));

vi.mock('../../../api/financials', () => financialApiMocks);

describe('PremiumAnalytics', () => {
  beforeEach(() => {
    financialApiMocks.fetchCollectionsTrend.mockReset();
    financialApiMocks.fetchCollectionsTrend.mockResolvedValue({
      data: [],
      summary: {
        totalPaymentsCollectedCents: 12345,
        totalRevenueEarnedCents: 22345,
        totalPatientPaymentsCents: 2000,
        totalPayerPaymentsCents: 8000,
        totalStorePaymentsCents: 2345,
        totalBadDebtCents: 0,
        collectionRate: 55,
        revenueCategories: [
          { key: 'product_sale', label: 'Product Sales', revenueCents: 2345, itemCount: 1 },
          { key: 'late_fee', label: 'Late Fees', revenueCents: 5000, itemCount: 2 },
        ],
      },
    });
  });

  it('keeps custom date inputs visible and applies the selected range', async () => {
    render(<PremiumAnalytics />);

    await waitFor(() => expect(financialApiMocks.fetchCollectionsTrend).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Premium analytics start date'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Premium analytics end date'), {
      target: { value: '2026-01-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: /apply dates/i }));

    await waitFor(() => {
      expect(financialApiMocks.fetchCollectionsTrend).toHaveBeenLastCalledWith(
        { tenantId: 'tenant-1', accessToken: 'token-1' },
        { startDate: '2026-01-01', endDate: '2026-01-31', granularity: 'day' },
      );
    });
  });

  it('surfaces store revenue as a first-class analytics value', async () => {
    render(<PremiumAnalytics />);

    await waitFor(() => expect(financialApiMocks.fetchCollectionsTrend).toHaveBeenCalledTimes(1));

    expect(screen.getByText('Paid store orders and shipping')).toBeInTheDocument();
    expect(screen.getAllByText('Store Revenue').length).toBeGreaterThanOrEqual(2);
  });
});
