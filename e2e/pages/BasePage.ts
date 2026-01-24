import { Page, Locator } from '@playwright/test';

/**
 * Base Page Object class that all page objects extend from.
 * Provides common functionality and utilities for all pages.
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a specific URL
   */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  /**
   * Wait for page to be fully loaded
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Fill a form field by label
   */
  async fillByLabel(label: string | RegExp, value: string): Promise<void> {
    await this.page.getByLabel(label).fill(value);
  }

  /**
   * Click a button by role and name
   */
  async clickButton(name: string | RegExp): Promise<void> {
    await this.page.getByRole('button', { name }).click();
  }

  /**
   * Click a link by role and name
   */
  async clickLink(name: string | RegExp): Promise<void> {
    await this.page.getByRole('link', { name }).click();
  }

  /**
   * Wait for a specific text to be visible
   */
  async waitForText(text: string | RegExp): Promise<void> {
    await this.page.getByText(text).waitFor({ state: 'visible' });
  }

  /**
   * Check if element is visible
   */
  async isVisible(selector: string): Promise<boolean> {
    return await this.page.locator(selector).isVisible();
  }

  /**
   * Get text content of an element
   */
  async getTextContent(selector: string): Promise<string | null> {
    return await this.page.locator(selector).textContent();
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png`, fullPage: true });
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Get current URL
   */
  getUrl(): string {
    return this.page.url();
  }

  /**
   * Wait for specific URL pattern
   */
  async waitForUrl(urlPattern: string | RegExp): Promise<void> {
    await this.page.waitForURL(urlPattern);
  }

  /**
   * Select option from dropdown by label
   */
  async selectByLabel(label: string | RegExp, value: string): Promise<void> {
    await this.page.getByLabel(label).selectOption(value);
  }

  /**
   * Check a checkbox by label
   */
  async checkByLabel(label: string | RegExp): Promise<void> {
    await this.page.getByLabel(label).check();
  }

  /**
   * Uncheck a checkbox by label
   */
  async uncheckByLabel(label: string | RegExp): Promise<void> {
    await this.page.getByLabel(label).uncheck();
  }

  /**
   * Wait for an element to be visible
   */
  async waitForSelector(selector: string): Promise<Locator> {
    return await this.page.waitForSelector(selector);
  }

  /**
   * Reload the current page
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForPageLoad();
  }
}
