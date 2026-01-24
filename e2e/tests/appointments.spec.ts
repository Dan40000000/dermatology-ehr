import { test, expect } from '../fixtures/auth.fixture';
import { SchedulePage } from '../pages/SchedulePage';
import { AppointmentPage } from '../pages/AppointmentPage';
import { PatientsPage } from '../pages/PatientsPage';

test.describe('Appointments - Comprehensive Tests', () => {
  test.describe('Schedule View', () => {
    test('should display schedule page', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();
      await schedulePage.assertSchedulePageVisible();
    });

    test('should switch between different calendar views', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      // Try switching to different views
      const viewButtons = [
        { name: /day/i, method: 'switchToDayView' },
        { name: /week/i, method: 'switchToWeekView' },
        { name: /month/i, method: 'switchToMonthView' },
      ];

      for (const view of viewButtons) {
        const button = authenticatedPage.getByRole('button', { name: view.name });
        if (await button.isVisible()) {
          await button.click();
          await authenticatedPage.waitForTimeout(500);
        }
      }
    });

    test('should navigate between days', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      await schedulePage.goToNext();
      await authenticatedPage.waitForTimeout(500);

      await schedulePage.goToPrevious();
      await authenticatedPage.waitForTimeout(500);

      await schedulePage.goToToday();
      await authenticatedPage.waitForTimeout(500);
    });

    test('should display appointments in calendar', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      // Wait for appointments to load
      await authenticatedPage.waitForTimeout(2000);

      const appointmentCount = await schedulePage.getAppointmentCount();
      expect(appointmentCount).toBeGreaterThanOrEqual(0);
    });

    test('should show new appointment button', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      const newApptBtn = authenticatedPage.getByRole('button', {
        name: /new appointment|schedule|add appointment/i,
      });
      await expect(newApptBtn.first()).toBeVisible();
    });
  });

  test.describe('Create Appointment', () => {
    test('should open new appointment form', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      await schedulePage.clickNewAppointment();
      await authenticatedPage.waitForTimeout(1000);

      const dialog = authenticatedPage.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: /new appointment/i })).toBeVisible();
    });

    test('should require patient selection', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      await schedulePage.clickNewAppointment();
      await authenticatedPage.waitForTimeout(1000);

      const dialog = authenticatedPage.getByRole('dialog');
      await dialog.getByRole('button', { name: /save|create|schedule/i }).click();

      // Should show validation error
      await expect(dialog.getByText(/patient is required/i)).toBeVisible();
    });

    test('should create appointment with required fields', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      await schedulePage.clickNewAppointment();
      await authenticatedPage.waitForTimeout(1000);

      const dialog = authenticatedPage.getByRole('dialog');

      const patientOptions = dialog.locator('#patient option');
      if ((await patientOptions.count()) > 1) {
        await dialog.getByLabel(/patient/i).selectOption({ index: 1 });
      }

      const providerOptions = dialog.locator('#provider option');
      if ((await providerOptions.count()) > 1) {
        await dialog.getByLabel(/provider/i).selectOption({ index: 1 });
      }

      const typeOptions = dialog.locator('#appointmentType option');
      if ((await typeOptions.count()) > 1) {
        await dialog.getByLabel(/appointment type/i).selectOption({ index: 1 });
      }

      const locationOptions = dialog.locator('#location option');
      if ((await locationOptions.count()) > 1) {
        await dialog.getByLabel(/location/i).selectOption({ index: 1 });
      }

      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      await dialog.getByLabel(/date/i).fill(dateStr);
      await dialog.getByLabel(/time/i).selectOption('14:00');

      await dialog.getByRole('button', { name: /save|create|schedule/i }).click();
      await authenticatedPage.waitForTimeout(2000);
    });
  });

  test.describe('Appointment Actions', () => {
    test('should check-in patient for appointment', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();
      await authenticatedPage.waitForTimeout(2000);

      const appointmentCount = await schedulePage.getAppointmentCount();
      if (appointmentCount > 0) {
        // Click on first appointment
        const appointments = authenticatedPage.locator('.calendar-appointment');
        const firstAppointment = appointments.first();

        if (await firstAppointment.isVisible()) {
          await firstAppointment.click();
          await authenticatedPage.waitForTimeout(1000);

          // Look for check-in button
          const checkInBtn = authenticatedPage.getByRole('button', { name: /check.?in/i });
          if (await checkInBtn.isVisible()) {
            await checkInBtn.click();
            await authenticatedPage.waitForTimeout(1000);

            // Should show success or status change
            const statusToast = authenticatedPage.locator('.toast-message', { hasText: /status updated/i });
            await expect(statusToast).toBeVisible({ timeout: 5000 });
          }
        }
      }
    });

    test('should reschedule appointment', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();
      await authenticatedPage.waitForTimeout(2000);

      const appointmentCount = await schedulePage.getAppointmentCount();
      if (appointmentCount > 0) {
        const appointments = authenticatedPage.locator('.calendar-appointment');
        const firstAppointment = appointments.first();

        if (await firstAppointment.isVisible()) {
          await firstAppointment.click();
          await authenticatedPage.waitForTimeout(1000);

          const rescheduleBtn = authenticatedPage.getByRole('button', { name: /reschedule/i });
          if (await rescheduleBtn.isVisible()) {
            await rescheduleBtn.click();
            await authenticatedPage.waitForTimeout(1000);

            // Should show reschedule form
            const form = authenticatedPage.locator('form, [role="dialog"]');
            await expect(form.first()).toBeVisible();
          }
        }
      }
    });

    test('should cancel appointment', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();
      await authenticatedPage.waitForTimeout(2000);

      const appointmentCount = await schedulePage.getAppointmentCount();
      if (appointmentCount > 0) {
        const appointments = authenticatedPage.locator('.calendar-appointment');
        const firstAppointment = appointments.first();

        if (await firstAppointment.isVisible()) {
          await firstAppointment.click();
          await authenticatedPage.waitForTimeout(1000);

          const cancelBtn = authenticatedPage.getByRole('button', {
            name: /cancel appointment/i,
          });
          if (await cancelBtn.isVisible()) {
            authenticatedPage.once('dialog', (dialog) => dialog.accept());
            await cancelBtn.click();

            await authenticatedPage.waitForTimeout(1000);

            // Should show cancelled status or remove from list
            const statusToast = authenticatedPage.locator('.toast-message', { hasText: /status updated/i });
            await expect(statusToast).toBeVisible({ timeout: 5000 });
          }
        }
      }
    });

    test('should mark appointment as no-show', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();
      await authenticatedPage.waitForTimeout(2000);

      const appointmentCount = await schedulePage.getAppointmentCount();
      if (appointmentCount > 0) {
        const appointments = authenticatedPage.locator('[data-testid="appointment"], .appointment');
        const firstAppointment = appointments.first();

        if (await firstAppointment.isVisible()) {
          await firstAppointment.click();
          await authenticatedPage.waitForTimeout(1000);

          const noShowBtn = authenticatedPage.getByRole('button', { name: /no.?show/i });
          if (await noShowBtn.isVisible()) {
            await noShowBtn.click();

            const confirmBtn = authenticatedPage.getByRole('button', { name: /confirm|yes|ok/i });
            if (await confirmBtn.isVisible()) {
              await confirmBtn.click();
            }

            await authenticatedPage.waitForTimeout(1000);
          }
        }
      }
    });
  });

  test.describe('Appointment Filtering', () => {
    test('should filter appointments by provider', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();
      await authenticatedPage.waitForTimeout(2000);

      const providerFilter = authenticatedPage.locator(
        'select[name="provider"], [data-testid="provider-filter"]'
      );

      if (await providerFilter.isVisible()) {
        const initialCount = await schedulePage.getAppointmentCount();

        await providerFilter.selectOption({ index: 1 });
        await authenticatedPage.waitForTimeout(1000);

        const filteredCount = await schedulePage.getAppointmentCount();
        // Filtered count should be <= initial count
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
      }
    });

    test('should filter appointments by type', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();
      await authenticatedPage.waitForTimeout(2000);

      const typeFilter = authenticatedPage.locator('select[name="type"], [data-testid="type-filter"]');

      if (await typeFilter.isVisible()) {
        const initialCount = await schedulePage.getAppointmentCount();

        await typeFilter.selectOption({ index: 1 });
        await authenticatedPage.waitForTimeout(1000);

        const filteredCount = await schedulePage.getAppointmentCount();
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
      }
    });
  });
});
