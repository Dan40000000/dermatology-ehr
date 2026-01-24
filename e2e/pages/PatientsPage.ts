import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Patients List Page
 * Handles patient listing, searching, and navigation
 */
export class PatientsPage extends BasePage {
  // Locators
  private readonly pageHeading = () =>
    this.page.locator('.ema-section-header', { hasText: /patient search\s*$/i });
  private readonly newPatientButton = () => this.page.getByRole('button', { name: /new patient|add patient|register patient/i });
  private readonly advancedSearchButton = () => this.page.getByRole('button', { name: /advanced search/i });
  private readonly handoutLibraryButton = () => this.page.getByRole('button', { name: /handout library/i });
  private readonly searchInput = () => this.page.getByPlaceholder(/enter search term|search term/i);
  private readonly patientTable = () => this.page.getByRole('table');
  private readonly patientRows = () => this.page.locator('tbody tr');
  private readonly loadingSpinner = () => this.page.locator('[data-testid="loading-spinner"], .loading, .spinner');

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to patients page
   */
  async goto(): Promise<void> {
    await this.page.goto('/patients');
    await this.waitForPageLoad();
  }

  /**
   * Assert that patients page is visible
   */
  async assertPatientsPageVisible(): Promise<void> {
    await expect(this.pageHeading()).toBeVisible();
    await expect(this.page).toHaveURL(/\/patients/);
  }

  /**
   * Click new patient button
   */
  async clickNewPatient(): Promise<void> {
    await this.newPatientButton().click();
  }

  /**
   * Click advanced search button
   */
  async clickAdvancedSearch(): Promise<void> {
    await this.advancedSearchButton().click();
  }

  /**
   * Click handout library button
   */
  async clickHandoutLibrary(): Promise<void> {
    await this.handoutLibraryButton().click();
  }

  /**
   * Assert search input is focused
   */
  async assertSearchFocused(): Promise<void> {
    await expect(this.searchInput()).toBeFocused();
  }

  /**
   * Search for a patient
   */
  async searchPatient(searchTerm: string): Promise<void> {
    await this.searchInput().fill(searchTerm);
    // Wait a moment for search results to update
    await this.page.waitForTimeout(500);
  }

  /**
   * Assert patient table is visible
   */
  async assertPatientTableVisible(): Promise<void> {
    await expect(this.patientTable()).toBeVisible();
  }

  /**
   * Get number of patient rows
   */
  async getPatientCount(): Promise<number> {
    const rows = this.patientRows();
    const emptyState = rows.filter({ hasText: /no patients found|loading patients/i });
    if (await emptyState.count()) {
      return 0;
    }
    return await rows.count();
  }

  /**
   * Click on a patient by name
   */
  async clickPatientByName(firstName: string, lastName: string): Promise<void> {
    const patientRow = this.patientRows()
      .filter({ hasText: new RegExp(firstName, 'i') })
      .filter({ hasText: new RegExp(lastName, 'i') });
    await patientRow.locator('a.ema-patient-link').first().click();
  }

  /**
   * Assert patient appears in list
   */
  async assertPatientInList(firstName: string, lastName: string): Promise<void> {
    const patientRow = this.patientRows()
      .filter({ hasText: new RegExp(firstName, 'i') })
      .filter({ hasText: new RegExp(lastName, 'i') });
    await expect(patientRow.first()).toBeVisible();
  }

  /**
   * Wait for patients to load
   */
  async waitForPatientsToLoad(): Promise<void> {
    // Wait for loading spinner to disappear
    const spinner = this.loadingSpinner();
    if (await spinner.isVisible()) {
      await spinner.waitFor({ state: 'hidden', timeout: 10000 });
    }
    await this.waitForPageLoad();
  }

  /**
   * Click on first patient in list
   */
  async clickFirstPatient(): Promise<void> {
    const firstRow = this.patientRows().first();
    await firstRow.locator('a.ema-patient-link').first().click();
  }

  /**
   * Assert search results contain term
   */
  async assertSearchResults(searchTerm: string): Promise<void> {
    const resultsText = await this.page.locator('tbody').textContent();
    expect(resultsText?.toLowerCase() ?? '').toContain(searchTerm.toLowerCase());
  }
}
