import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Login Page
 * Handles all interactions with the login/authentication page
 */
export class LoginPage extends BasePage {
  // Locators
  private readonly emailInput = () => this.page.getByLabel(/email/i);
  private readonly passwordInput = () => this.page.getByLabel(/password/i);
  private readonly signInButton = () => this.page.getByRole('button', { name: /sign in/i });
  private readonly heading = () => this.page.getByRole('heading', { name: /sign in/i });
  private readonly errorMessage = () => this.page.getByText(/invalid credentials|error/i);

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to login page
   */
  async goto(): Promise<void> {
    await this.page.goto('/login');
    await this.waitForPageLoad();
  }

  /**
   * Perform login with email and password
   */
  async login(email: string, password: string): Promise<void> {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.signInButton().click();
  }

  /**
   * Assert that login page is displayed
   */
  async assertLoginPageVisible(): Promise<void> {
    await expect(this.heading()).toBeVisible();
    await expect(this.page).toHaveTitle(/Dermatology|EHR|DermApp/i);
  }

  /**
   * Assert error message is displayed
   */
  async assertErrorVisible(): Promise<void> {
    await expect(this.errorMessage()).toBeVisible();
  }

  /**
   * Assert validation error for email
   */
  async assertEmailValidationError(): Promise<void> {
    const error = this.page.getByText(/email is required|invalid email/i);
    await expect(error).toBeVisible();
  }

  /**
   * Click sign in without filling credentials
   */
  async submitEmptyForm(): Promise<void> {
    await this.signInButton().click();
  }

  /**
   * Check if redirected to dashboard after login
   */
  async assertRedirectedToDashboard(): Promise<void> {
    await this.page.waitForURL(/\/(home|dashboard)/i, { timeout: 10000 });
  }

  /**
   * Wait for login to complete
   */
  async waitForLoginSuccess(): Promise<void> {
    await this.assertRedirectedToDashboard();
  }
}
