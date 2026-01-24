import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { AdminAnalyticsDashboardPage } from '../pages/AdminAnalyticsDashboardPage';

const toCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);

const toPercent = (value: number) => `${value.toFixed(1)}%`;

test.describe('Analytics Dashboards', () => {
  test('analytics page binds KPI data from the API', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    const responsePromise = authenticatedPage.waitForResponse((resp) => {
      const url = new URL(resp.url());
      return url.pathname === '/api/analytics/dashboard' && resp.status() === 200;
    });

    await analyticsPage.goto();
    const response = await responsePromise;
    const data = await response.json();

    await analyticsPage.assertAnalyticsPageVisible();
    await expect(analyticsPage.kpiValueLocator(/total patients/i)).toHaveText(
      data.totalPatients.toLocaleString('en-US')
    );
    await expect(analyticsPage.kpiValueLocator(/today's appointments/i)).toHaveText(
      data.todayAppointments.toString()
    );
    await expect(analyticsPage.kpiValueLocator(/this month's revenue/i)).toHaveText(
      toCurrency(Number(data.monthRevenue || 0))
    );
    await expect(analyticsPage.kpiValueLocator(/active encounters/i)).toHaveText(
      data.activeEncounters.toString()
    );
  });

  test('analytics page buttons, tabs, and date filters respond', async ({ authenticatedPage }) => {
    const analyticsPage = new AnalyticsPage(authenticatedPage);
    await analyticsPage.goto();

    await analyticsPage.clickRefresh();
    await expect(authenticatedPage.getByText(/dashboard refreshed/i)).toBeVisible();

    await analyticsPage.clickExport();
    await expect(authenticatedPage.getByText(/export functionality coming soon/i)).toBeVisible();

    await analyticsPage.selectTab(/clinical and operational/i);
    await expect(authenticatedPage.getByRole('heading', { name: /data explorer/i })).toBeVisible();
    await analyticsPage.clickLearnMore();

    await analyticsPage.selectTab(/compliance/i);
    await expect(authenticatedPage.getByRole('heading', { name: /compliance reports/i })).toBeVisible();

    await analyticsPage.selectTab(/inventory/i);
    await expect(authenticatedPage.getByRole('heading', { name: /^inventory$/i })).toBeVisible();

    await analyticsPage.selectTab(/financials/i);
    await expect(
      authenticatedPage.getByRole('heading', { name: /financial reports/i, level: 2 })
    ).toBeVisible();
    await analyticsPage.clickExternalLink();

    await analyticsPage.selectQuickRange(/this week/i);
    await expect(authenticatedPage.locator('.range-btn', { hasText: 'This Week' })).toHaveClass(/active/);

    await analyticsPage.setCustomRange('2024-01-01', '2024-01-31');
    await analyticsPage.applyCustomRange();
    await expect(authenticatedPage.getByRole('button', { name: /^clear$/i })).toBeVisible();
    await analyticsPage.clearCustomRange();
    await expect(authenticatedPage.getByRole('button', { name: /^clear$/i })).toHaveCount(0);
  });

  test('admin analytics dashboard binds overview data', async ({ authenticatedPage }) => {
    const dashboardPage = new AdminAnalyticsDashboardPage(authenticatedPage);
    const responsePromise = authenticatedPage.waitForResponse((resp) => {
      const url = new URL(resp.url());
      return url.pathname === '/api/analytics/overview' && resp.status() === 200;
    });

    await dashboardPage.goto();
    const response = await responsePromise;
    const overview = await response.json();

    await dashboardPage.assertDashboardVisible();
    await expect(dashboardPage.kpiValueLocator(/new patients/i)).toHaveText(
      overview.newPatients.current.toLocaleString('en-US')
    );
    await expect(dashboardPage.kpiValueLocator(/total appointments/i)).toHaveText(
      overview.appointments.current.toLocaleString('en-US')
    );
    await expect(dashboardPage.kpiValueLocator(/revenue/i)).toHaveText(
      toCurrency(Number(overview.revenue.current || 0))
    );
    await expect(dashboardPage.kpiValueLocator(/collection rate/i)).toHaveText(
      toPercent(Number(overview.collectionRate || 0))
    );
  });

  test('admin analytics dashboard controls respond', async ({ authenticatedPage }) => {
    const dashboardPage = new AdminAnalyticsDashboardPage(authenticatedPage);
    await dashboardPage.goto();

    await authenticatedPage.waitForResponse((resp) => {
      const url = new URL(resp.url());
      return url.pathname === '/api/analytics/overview' && resp.status() === 200;
    });

    const refreshResponsePromise = authenticatedPage.waitForResponse((resp) => {
      const url = new URL(resp.url());
      return url.pathname === '/api/analytics/overview' && resp.status() === 200;
    });

    await dashboardPage.clickRefresh();
    await refreshResponsePromise;

    await dashboardPage.selectQuickRange(/last 7 days/i);
    const activeButton = authenticatedPage.locator('.range-btn', { hasText: 'Last 7 Days' });
    await expect(activeButton).toHaveClass(/active/);

    await dashboardPage.selectQuickRange(/custom range/i);
    const customRange = authenticatedPage.locator('.custom-range');
    const dateInputs = customRange.locator('input[type="date"]');
    await dateInputs.nth(0).fill('2024-01-01');
    await dateInputs.nth(1).fill('2024-01-31');
    const applyButton = customRange.getByRole('button', { name: /^apply$/i });
    await expect(applyButton).toBeEnabled();

    const customResponsePromise = authenticatedPage.waitForResponse((resp) => {
      const url = new URL(resp.url());
      return url.pathname === '/api/analytics/overview' && resp.status() === 200;
    });
    await applyButton.click();
    await customResponsePromise;
  });
});
