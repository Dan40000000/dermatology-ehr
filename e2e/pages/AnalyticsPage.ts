import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Analytics Page
 * Handles dashboard controls, tabs, and KPI cards.
 */
export class AnalyticsPage extends BasePage {
  private readonly heading = () => this.page.getByRole('heading', { name: /analytics & reports/i });
  private readonly refreshButton = () => this.page.getByRole('button', { name: /^refresh$/i });
  private readonly exportButton = () => this.page.getByRole('button', { name: /export dashboard/i });
  private readonly tabButton = (name: string | RegExp) => this.page.getByRole('button', { name });
  private readonly quickRangeButton = (name: string | RegExp) =>
    this.page.locator('.range-btn', { hasText: name });
  private readonly customRange = () => this.page.locator('.custom-range');
  private readonly customStartInput = () =>
    this.customRange().locator('input[type="date"]').first();
  private readonly customEndInput = () =>
    this.customRange().locator('input[type="date"]').nth(1);
  private readonly customApplyButton = () =>
    this.customRange().getByRole('button', { name: /^apply$/i });
  private readonly customClearButton = () =>
    this.customRange().getByRole('button', { name: /^clear$/i });
  private readonly externalLinkButton = () => this.page.locator('.external-link-btn');
  private readonly learnMoreButton = () => this.page.locator('.analytics-learn-more').first();

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/analytics');
    await this.waitForPageLoad();
  }

  async assertAnalyticsPageVisible(): Promise<void> {
    await expect(this.heading()).toBeVisible();
  }

  kpiValueLocator(label: string | RegExp): Locator {
    return this.page
      .locator('.kpi-card', {
        has: this.page.locator('.kpi-label', { hasText: label }),
      })
      .locator('.kpi-value');
  }

  async clickRefresh(): Promise<void> {
    await this.refreshButton().click();
  }

  async clickExport(): Promise<void> {
    await this.exportButton().click();
  }

  async selectTab(name: string | RegExp): Promise<void> {
    await this.tabButton(name).click();
  }

  async selectQuickRange(name: string | RegExp): Promise<void> {
    await this.quickRangeButton(name).click();
  }

  async setCustomRange(startDate: string, endDate: string): Promise<void> {
    await this.customStartInput().fill(startDate);
    await this.customEndInput().fill(endDate);
  }

  async applyCustomRange(): Promise<void> {
    await this.customApplyButton().click();
  }

  async clearCustomRange(): Promise<void> {
    await this.customClearButton().click();
  }

  async clickExternalLink(): Promise<void> {
    await this.externalLinkButton().click();
  }

  async clickLearnMore(): Promise<void> {
    await this.learnMoreButton().click();
  }
}
