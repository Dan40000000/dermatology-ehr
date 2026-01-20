import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Patients List Page
 * Handles patient listing, searching, and navigation
 */
export class PatientsPage extends BasePage {
  // Locators
  private readonly pageHeading = () => this.page.getByRole('heading', { name: /patients/i });
  private readonly newPatientButton = () => this.page.getByRole('button', { name: /new patient|add patient|register patient/i });
  private readonly searchInput = () => this.page.getByPlaceholder(/search|filter/i);
  private readonly patientTable = () => this.page.getByRole('table');
  private readonly patientRows = () => this.page.getByRole('row');
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
    const rows = await this.patientRows().count();
    // Subtract 1 for header row
    return Math.max(0, rows - 1);
  }

  /**
   * Click on a patient by name
   */
  async clickPatientByName(firstName: string, lastName: string): Promise<void> {
    const patientRow = this.page.getByRole('row', { name: new RegExp(`${firstName}.*${lastName}|${lastName}.*${firstName}`, 'i') });
    await patientRow.click();
  }

  /**
   * Assert patient appears in list
   */
  async assertPatientInList(firstName: string, lastName: string): Promise<void> {
    const patientRow = this.page.getByRole('row', { name: new RegExp(`${firstName}.*${lastName}|${lastName}.*${firstName}`, 'i') });
    await expect(patientRow).toBeVisible();
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
    const firstRow = this.patientRows().nth(1); // Skip header
    await firstRow.click();
  }

  /**
   * Assert search results contain term
   */
  async assertSearchResults(searchTerm: string): Promise<void> {
    const resultsText = await this.page.locator('tbody, .patient-list').textContent();
    expect(resultsText).toContain(searchTerm);
  }
}
