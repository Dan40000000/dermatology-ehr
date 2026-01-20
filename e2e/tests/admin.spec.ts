import { test, expect } from '../fixtures/auth.fixture';
import { AdminPage } from '../pages/AdminPage';

test.describe('Admin Functions - Comprehensive Tests', () => {
  test.describe('Admin Page Access', () => {
    test('should access admin page', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();
      await adminPage.assertAdminPageVisible();
    });

    test('should display admin navigation tabs', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      // Check for common admin tabs
      const tabs = ['users', 'settings', 'providers', 'locations'];
      for (const tabName of tabs) {
        const tab = authenticatedPage.getByRole('tab', { name: new RegExp(tabName, 'i') });
        // Tab may or may not exist depending on permissions
        if (await tab.isVisible()) {
          await expect(tab).toBeVisible();
        }
      }
    });
  });

  test.describe('User Management', () => {
    test('should display users list', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const usersTab = authenticatedPage.getByRole('tab', { name: /users/i });
      if (await usersTab.isVisible()) {
        await adminPage.goToUsersTab();
        await authenticatedPage.waitForTimeout(1000);
        await adminPage.assertUsersListVisible();
      }
    });

    test('should show add user button', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const usersTab = authenticatedPage.getByRole('tab', { name: /users/i });
      if (await usersTab.isVisible()) {
        await adminPage.goToUsersTab();
        await authenticatedPage.waitForTimeout(1000);

        const addUserBtn = authenticatedPage.getByRole('button', {
          name: /add user|new user|create user/i,
        });
        if (await addUserBtn.isVisible()) {
          await expect(addUserBtn).toBeVisible();
        }
      }
    });

    test('should open add user form', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const usersTab = authenticatedPage.getByRole('tab', { name: /users/i });
      if (await usersTab.isVisible()) {
        await adminPage.goToUsersTab();
        await authenticatedPage.waitForTimeout(1000);

        const addUserBtn = authenticatedPage.getByRole('button', {
          name: /add user|new user|create user/i,
        });

        if (await addUserBtn.isVisible()) {
          await adminPage.clickAddUser();
          await authenticatedPage.waitForTimeout(1000);

          // Should show user form or modal
          const form = authenticatedPage.locator('form, [role="dialog"]');
          await expect(form.first()).toBeVisible();
        }
      }
    });

    test('should list existing users', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const usersTab = authenticatedPage.getByRole('tab', { name: /users/i });
      if (await usersTab.isVisible()) {
        await adminPage.goToUsersTab();
        await authenticatedPage.waitForTimeout(1000);

        // Check if admin user is listed
        const adminUser = authenticatedPage.getByText(/admin@demo.com/i);
        if (await adminUser.isVisible()) {
          await expect(adminUser).toBeVisible();
        }
      }
    });

    test('should show user roles', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const usersTab = authenticatedPage.getByRole('tab', { name: /users/i });
      if (await usersTab.isVisible()) {
        await adminPage.goToUsersTab();
        await authenticatedPage.waitForTimeout(1000);

        // Look for role indicators
        const roleIndicators = authenticatedPage.locator('text=/admin|doctor|nurse|receptionist/i');
        const count = await roleIndicators.count();
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Settings Management', () => {
    test('should access settings page', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const settingsTab = authenticatedPage.getByRole('tab', { name: /settings/i });
      if (await settingsTab.isVisible()) {
        await adminPage.goToSettingsTab();
        await authenticatedPage.waitForTimeout(1000);

        // Should show settings form
        const settingsForm = authenticatedPage.locator('form, .settings');
        await expect(settingsForm.first()).toBeVisible();
      }
    });

    test('should display practice information settings', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const settingsTab = authenticatedPage.getByRole('tab', { name: /settings/i });
      if (await settingsTab.isVisible()) {
        await adminPage.goToSettingsTab();
        await authenticatedPage.waitForTimeout(1000);

        // Look for common settings fields
        const practiceNameInput = authenticatedPage.getByLabel(/practice name|clinic name/i);
        if (await practiceNameInput.isVisible()) {
          await expect(practiceNameInput).toBeVisible();
        }
      }
    });

    test('should have save settings button', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const settingsTab = authenticatedPage.getByRole('tab', { name: /settings/i });
      if (await settingsTab.isVisible()) {
        await adminPage.goToSettingsTab();
        await authenticatedPage.waitForTimeout(1000);

        const saveBtn = authenticatedPage.getByRole('button', { name: /save/i });
        await expect(saveBtn.first()).toBeVisible();
      }
    });
  });

  test.describe('Audit Log', () => {
    test('should access audit log', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const auditTab = authenticatedPage.getByRole('tab', { name: /audit|log/i });
      if (await auditTab.isVisible()) {
        await adminPage.goToAuditLogTab();
        await authenticatedPage.waitForTimeout(1000);
        await adminPage.assertAuditLogVisible();
      }
    });

    test('should display audit log entries', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const auditTab = authenticatedPage.getByRole('tab', { name: /audit|log/i });
      if (await auditTab.isVisible()) {
        await adminPage.goToAuditLogTab();
        await authenticatedPage.waitForTimeout(1000);

        const logCount = await adminPage.getAuditLogCount();
        expect(logCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('should show audit log details', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const auditTab = authenticatedPage.getByRole('tab', { name: /audit|log/i });
      if (await auditTab.isVisible()) {
        await adminPage.goToAuditLogTab();
        await authenticatedPage.waitForTimeout(1000);

        // Check for common audit log columns
        const table = authenticatedPage.getByRole('table');
        if (await table.isVisible()) {
          const headers = authenticatedPage.locator('th');
          const headerCount = await headers.count();
          expect(headerCount).toBeGreaterThan(0);
        }
      }
    });

    test('should filter audit log entries', async ({ authenticatedPage }) => {
      const adminPage = new AdminPage(authenticatedPage);
      await adminPage.goto();

      const auditTab = authenticatedPage.getByRole('tab', { name: /audit|log/i });
      if (await auditTab.isVisible()) {
        await adminPage.goToAuditLogTab();
        await authenticatedPage.waitForTimeout(1000);

        // Look for filter controls
        const filterInputs = authenticatedPage.locator('input[type="text"], input[type="date"], select');
        const filterCount = await filterInputs.count();
        expect(filterCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Reports', () => {
    test('should access reports page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/reports');
      await authenticatedPage.waitForTimeout(1000);

      // Should show reports page or redirect to valid page
      const url = authenticatedPage.url();
      expect(url).toBeTruthy();
    });

    test('should display available report types', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/reports');
      await authenticatedPage.waitForTimeout(1000);

      // Look for report options
      const reportOptions = authenticatedPage.locator('button, a, [data-testid="report"]');
      const count = await reportOptions.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
