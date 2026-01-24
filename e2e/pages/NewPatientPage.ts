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
  private readonly phoneInput = () => this.page.getByLabel(/home phone/i);
  private readonly emailInput = () => this.page.getByLabel(/email/i);
  private readonly addressInput = () => this.page.getByLabel(/street address/i);
  private readonly cityInput = () => this.page.getByLabel(/city/i);
  private readonly stateInput = () => this.page.getByLabel(/state/i);
  private readonly zipCodeInput = () => this.page.getByLabel(/zip|postal code/i);

  // Gender/Sex field
  private readonly genderSelect = () => this.page.getByLabel(/sex/i);

  // Section tabs
  private readonly demographicsTab = () => this.page.getByRole('button', { name: /^demographics$/i });
  private readonly contactTab = () => this.page.getByRole('button', { name: /^contact info$/i });
  private readonly insuranceTab = () => this.page.getByRole('button', { name: /^insurance$/i });
  private readonly medicalTab = () => this.page.getByRole('button', { name: /^medical info$/i });

  // Buttons
  private readonly saveButton = () => this.page.getByRole('button', { name: /^save patient$/i });
  private readonly cancelButton = () =>
    this.page.locator('.ema-action-bar').getByRole('button', { name: /cancel/i });

  // Validation
  private readonly validationError = () => this.page.getByText(/please fill in required fields|required|invalid/i);
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

  async showSection(section: 'demographics' | 'contact' | 'insurance' | 'medical'): Promise<void> {
    const sectionMap = {
      demographics: this.demographicsTab,
      contact: this.contactTab,
      insurance: this.insuranceTab,
      medical: this.medicalTab,
    };
    await sectionMap[section]().click();
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
    await this.showSection('demographics');
    await this.firstNameInput().fill(patient.firstName);
    await this.lastNameInput().fill(patient.lastName);

    if (patient.dateOfBirth) {
      await this.dateOfBirthInput().fill(patient.dateOfBirth);
    }

    if (patient.gender) {
      await this.genderSelect().selectOption(patient.gender);
    }

    if (
      patient.phone ||
      patient.email ||
      patient.address ||
      patient.city ||
      patient.state ||
      patient.zipCode
    ) {
      await this.showSection('contact');
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
      await this.stateInput().selectOption(patient.state);
    }

    if (patient.zipCode) {
      await this.zipCodeInput().fill(patient.zipCode);
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
    await this.showSection('demographics');
    await this.firstNameInput().fill(firstName);
    await this.lastNameInput().fill(lastName);
    await this.dateOfBirthInput().fill('1990-01-01');
  }
}
