import { expect, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object for Admin Page
 * Handles user management and system settings
 */
export class AdminPage extends BasePage {
  // Navigation tabs
  private readonly usersTab = () => this.page.getByRole('tab', { name: /users|user management/i });
  private readonly settingsTab = () => this.page.getByRole('tab', { name: /settings/i });
  private readonly auditLogTab = () => this.page.getByRole('tab', { name: /audit|log/i });
  private readonly providersTab = () => this.page.getByRole('tab', { name: /providers/i });
  private readonly locationsTab = () => this.page.getByRole('tab', { name: /locations/i });

  // User management
  private readonly addUserButton = () => this.page.getByRole('button', { name: /add user|new user|create user/i });
  private readonly usersList = () => this.page.locator('[data-testid="users-list"], .users-list, tbody');

  // Settings
  private readonly settingInput = (settingName: string) =>
    this.page.getByLabel(new RegExp(settingName, 'i'));
  private readonly saveSettingsButton = () => this.page.getByRole('button', { name: /save settings|save/i });

  // Audit log
  private readonly auditLogTable = () => this.page.getByRole('table');
  private readonly auditLogRows = () => this.page.getByRole('row');

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to admin page
   */
  async goto(): Promise<void> {
    await this.page.goto('/admin');
    await this.waitForPageLoad();
  }

  /**
   * Assert admin page is visible
   */
  async assertAdminPageVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/admin/);
  }

  /**
   * Go to users tab
   */
  async goToUsersTab(): Promise<void> {
    await this.usersTab().click();
  }

  /**
   * Go to settings tab
   */
  async goToSettingsTab(): Promise<void> {
    await this.settingsTab().click();
  }

  /**
   * Go to audit log tab
   */
  async goToAuditLogTab(): Promise<void> {
    await this.auditLogTab().click();
  }

  /**
   * Click add user button
   */
  async clickAddUser(): Promise<void> {
    await this.addUserButton().click();
  }

  /**
   * Assert users list is visible
   */
  async assertUsersListVisible(): Promise<void> {
    await expect(this.usersList()).toBeVisible();
  }

  /**
   * Update a setting
   */
  async updateSetting(settingName: string, value: string): Promise<void> {
    await this.settingInput(settingName).fill(value);
    await this.saveSettingsButton().click();
  }

  /**
   * Assert audit log is visible
   */
  async assertAuditLogVisible(): Promise<void> {
    await expect(this.auditLogTable()).toBeVisible();
  }

  /**
   * Get number of audit log entries
   */
  async getAuditLogCount(): Promise<number> {
    const rows = await this.auditLogRows().count();
    return Math.max(0, rows - 1); // Subtract header row
  }

  /**
   * Assert specific user exists in list
   */
  async assertUserExists(email: string): Promise<void> {
    const userRow = this.page.getByRole('row', { name: new RegExp(email, 'i') });
    await expect(userRow).toBeVisible();
  }
}
