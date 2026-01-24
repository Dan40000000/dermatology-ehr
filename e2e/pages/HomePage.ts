import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Home/Dashboard Page
 * The main landing page after login
 */
export class HomePage extends BasePage {
  // Navigation links
  private readonly scheduleLink = () => this.page.getByRole('link', { name: /schedule/i });
  private readonly patientsLink = () => this.page.getByRole('link', { name: /patients/i });
  private readonly appointmentsLink = () => this.page.getByRole('link', { name: /appointment/i });
  private readonly tasksLink = () => this.page.getByRole('link', { name: /tasks/i });
  private readonly ordersLink = () => this.page.getByRole('link', { name: /orders/i });
  private readonly analyticsLink = () => this.page.getByRole('link', { name: /analytics/i });
  private readonly adminLink = () => this.page.getByRole('link', { name: /admin/i });

  // User menu
  private readonly userMenu = () => this.page.locator('[data-testid="user-menu"], .user-menu');
  private readonly logoutButton = () => this.page.getByRole('button', { name: /logout|sign out/i });

  // Page elements
  private readonly welcomeText = () => this.page.getByText(/today's overview|office flow summary|pending tasks/i);
  private readonly searchInput = () => this.page.getByPlaceholder(/search|patient/i);

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to home page
   */
  async goto(): Promise<void> {
    await this.page.goto('/home');
    await this.waitForPageLoad();
  }

  /**
   * Assert that home page is visible
   */
  async assertHomePageVisible(): Promise<void> {
    await expect(this.welcomeText().first()).toBeVisible();
  }

  /**
   * Navigate to Patients page
   */
  async goToPatients(): Promise<void> {
    await this.patientsLink().click();
    await this.waitForNavigation();
  }

  /**
   * Navigate to Schedule page
   */
  async goToSchedule(): Promise<void> {
    await this.scheduleLink().click();
    await this.waitForNavigation();
  }

  /**
   * Navigate to Tasks page
   */
  async goToTasks(): Promise<void> {
    await this.tasksLink().click();
    await this.waitForNavigation();
  }

  /**
   * Navigate to Orders page
   */
  async goToOrders(): Promise<void> {
    await this.ordersLink().click();
    await this.waitForNavigation();
  }

  /**
   * Navigate to Analytics page
   */
  async goToAnalytics(): Promise<void> {
    await this.analyticsLink().click();
    await this.waitForNavigation();
  }

  /**
   * Navigate to Admin page
   */
  async goToAdmin(): Promise<void> {
    await this.adminLink().click();
    await this.waitForNavigation();
  }

  /**
   * Perform logout
   */
  async logout(): Promise<void> {
    // Try to find and click logout button in various locations
    const logoutBtn = this.logoutButton();

    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    } else {
      // Try to open user menu first
      const userMenuBtn = this.userMenu();
      if (await userMenuBtn.isVisible()) {
        await userMenuBtn.click();
        await logoutBtn.click();
      }
    }

    await this.page.waitForURL(/\/login|\/$/, { timeout: 5000 });
  }

  /**
   * Search for a patient
   */
  async searchPatient(searchTerm: string): Promise<void> {
    await this.searchInput().fill(searchTerm);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Assert user is logged in by checking for user-specific elements
   */
  async assertUserLoggedIn(): Promise<void> {
    await expect(this.welcomeText().first()).toBeVisible();
  }
}
