import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for New Patient/Patient Registration Page
 * Handles creating new patients
 */
export class NewPatientPage extends BasePage {
  // Form fields
  private readonly firstNameInput = () => this.page.getByLabel(/first name/i);
  private readonly lastNameInput = () => this.page.getByLabel(/last name/i);
  private readonly dateOfBirthInput = () => this.page.getByLabel(/date of birth|dob/i);
  private readonly phoneInput = () => this.page.getByLabel(/phone/i);
  private readonly emailInput = () => this.page.getByLabel(/email/i);
  private readonly addressInput = () => this.page.getByLabel(/^address$|street address/i);
  private readonly cityInput = () => this.page.getByLabel(/city/i);
  private readonly stateInput = () => this.page.getByLabel(/state/i);
  private readonly zipCodeInput = () => this.page.getByLabel(/zip|postal code/i);

  // Gender/Sex field
  private readonly genderSelect = () => this.page.getByLabel(/gender|sex/i);

  // Buttons
  private readonly saveButton = () => this.page.getByRole('button', { name: /save|create|submit|register/i });
  private readonly cancelButton = () => this.page.getByRole('button', { name: /cancel/i });

  // Validation
  private readonly validationError = () => this.page.getByText(/required|invalid/i);
  private readonly successMessage = () => this.page.getByText(/patient created|success|saved/i);

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to new patient page
   */
  async goto(): Promise<void> {
    await this.page.goto('/patients/new');
    await this.waitForPageLoad();
  }

  /**
   * Fill patient registration form
   */
  async fillPatientForm(patient: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    gender?: string;
  }): Promise<void> {
    await this.firstNameInput().fill(patient.firstName);
    await this.lastNameInput().fill(patient.lastName);

    if (patient.dateOfBirth) {
      await this.dateOfBirthInput().fill(patient.dateOfBirth);
    }

    if (patient.phone) {
      await this.phoneInput().fill(patient.phone);
    }

    if (patient.email) {
      await this.emailInput().fill(patient.email);
    }

    if (patient.address) {
      await this.addressInput().fill(patient.address);
    }

    if (patient.city) {
      await this.cityInput().fill(patient.city);
    }

    if (patient.state) {
      await this.stateInput().fill(patient.state);
    }

    if (patient.zipCode) {
      await this.zipCodeInput().fill(patient.zipCode);
    }

    if (patient.gender) {
      await this.genderSelect().selectOption(patient.gender);
    }
  }

  /**
   * Click save button
   */
  async clickSave(): Promise<void> {
    await this.saveButton().click();
  }

  /**
   * Click cancel button
   */
  async clickCancel(): Promise<void> {
    await this.cancelButton().click();
  }

  /**
   * Submit the form (fill and save)
   */
  async createPatient(patient: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }): Promise<void> {
    await this.fillPatientForm(patient);
    await this.clickSave();
  }

  /**
   * Assert validation error is visible
   */
  async assertValidationError(): Promise<void> {
    await expect(this.validationError().first()).toBeVisible();
  }

  /**
   * Assert success message is visible
   */
  async assertSuccessMessage(): Promise<void> {
    await expect(this.successMessage()).toBeVisible({ timeout: 10000 });
  }

  /**
   * Assert redirected to patient detail page
   */
  async assertRedirectedToPatientDetail(): Promise<void> {
    await this.page.waitForURL(/\/patients\/[a-z0-9-]+/, { timeout: 10000 });
  }

  /**
   * Try to submit empty form
   */
  async submitEmptyForm(): Promise<void> {
    await this.clickSave();
  }

  /**
   * Fill only required fields
   */
  async fillRequiredFields(firstName: string, lastName: string): Promise<void> {
    await this.firstNameInput().fill(firstName);
    await this.lastNameInput().fill(lastName);
  }
}
