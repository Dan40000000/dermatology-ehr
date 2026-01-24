import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Admin Analytics Dashboard
 * Handles dashboard controls, KPIs, and exports.
 */
export class AdminAnalyticsDashboardPage extends BasePage {
  private readonly heading = () => this.page.getByRole('heading', { name: /analytics dashboard/i });
  private readonly headerActions = () => this.page.locator('.analytics-dashboard .header-actions');
  private readonly refreshButton = () =>
    this.headerActions().getByRole('button', { name: /^refresh$/i });
  private readonly exportPdfButton = () =>
    this.headerActions().getByRole('button', { name: /export pdf/i });
  private readonly exportExcelButton = () =>
    this.headerActions().getByRole('button', { name: /export excel/i });
  private readonly autoRefreshToggle = () =>
    this.headerActions().getByLabel(/auto-refresh/i);
  private readonly rangeButton = (name: string | RegExp) => this.page.getByRole('button', { name });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/analytics');
    await this.waitForPageLoad();
  }

  async assertDashboardVisible(): Promise<void> {
    await expect(this.heading()).toBeVisible();
  }

  kpiValueLocator(label: string | RegExp): Locator {
    const card = this.page.locator('.kpi-card').filter({
      has: this.page.locator('.kpi-label', { hasText: label }),
    });
    return card.locator('.kpi-value');
  }

  async selectQuickRange(name: string | RegExp): Promise<void> {
    await this.rangeButton(name).click();
  }

  async clickRefresh(): Promise<void> {
    await this.refreshButton().click();
  }

  async clickExportPdf(): Promise<void> {
    await this.exportPdfButton().click();
  }

  async clickExportExcel(): Promise<void> {
    await this.exportExcelButton().click();
  }

  async toggleAutoRefresh(): Promise<void> {
    await this.autoRefreshToggle().click();
  }
}
