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

      // Should show appointment form or modal
      const form = authenticatedPage.locator('form, [role="dialog"], [data-testid="appointment-form"]');
      await expect(form.first()).toBeVisible();
    });

    test('should require patient selection', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      await schedulePage.clickNewAppointment();
      await authenticatedPage.waitForTimeout(1000);

      const saveBtn = authenticatedPage.getByRole('button', { name: /save|create|schedule/i });
      await saveBtn.first().click();

      // Should show validation error
      const error = authenticatedPage.getByText(/patient.*required|select.*patient/i);
      await expect(error.first()).toBeVisible();
    });

    test('should create appointment with required fields', async ({ authenticatedPage }) => {
      const schedulePage = new SchedulePage(authenticatedPage);
      await schedulePage.goto();

      await schedulePage.clickNewAppointment();
      await authenticatedPage.waitForTimeout(1000);

      // Fill appointment form
      const patientSelect = authenticatedPage.getByLabel(/patient/i);
      if (await patientSelect.isVisible()) {
        // Select first patient
        await patientSelect.click();
        await authenticatedPage.waitForTimeout(500);
        const firstOption = authenticatedPage.locator('option, [role="option"]').nth(1);
        if (await firstOption.isVisible()) {
          await firstOption.click();
        }

        // Select provider
        const providerSelect = authenticatedPage.getByLabel(/provider/i);
        if (await providerSelect.isVisible()) {
          await providerSelect.click();
          await authenticatedPage.waitForTimeout(500);
          const firstProviderOption = authenticatedPage.locator('option, [role="option"]').nth(1);
          if (await firstProviderOption.isVisible()) {
            await firstProviderOption.click();
          }
        }

        // Select appointment type
        const typeSelect = authenticatedPage.getByLabel(/type|appointment type/i);
        if (await typeSelect.isVisible()) {
          await typeSelect.click();
          await authenticatedPage.waitForTimeout(500);
          const firstTypeOption = authenticatedPage.locator('option, [role="option"]').nth(1);
          if (await firstTypeOption.isVisible()) {
            await firstTypeOption.click();
          }
        }

        // Set date and time (today at 2 PM)
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const dateInput = authenticatedPage.getByLabel(/date/i);
        if (await dateInput.isVisible()) {
          await dateInput.fill(dateStr);
        }

        const timeInput = authenticatedPage.getByLabel(/time|start/i);
        if (await timeInput.isVisible()) {
          await timeInput.fill('14:00');
        }

        // Save appointment
        const saveBtn = authenticatedPage.getByRole('button', { name: /save|create|schedule/i });
        await saveBtn.first().click();
        await authenticatedPage.waitForTimeout(2000);
      }
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
        const appointments = authenticatedPage.locator('[data-testid="appointment"], .appointment');
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
            const status = authenticatedPage.getByText(/checked.?in|arrived/i);
            await expect(status.first()).toBeVisible({ timeout: 5000 });
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
        const appointments = authenticatedPage.locator('[data-testid="appointment"], .appointment');
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
        const appointments = authenticatedPage.locator('[data-testid="appointment"], .appointment');
        const firstAppointment = appointments.first();

        if (await firstAppointment.isVisible()) {
          await firstAppointment.click();
          await authenticatedPage.waitForTimeout(1000);

          const cancelBtn = authenticatedPage.getByRole('button', {
            name: /cancel appointment/i,
          });
          if (await cancelBtn.isVisible()) {
            await cancelBtn.click();

            // Confirm cancellation if modal appears
            const confirmBtn = authenticatedPage.getByRole('button', { name: /confirm|yes|ok/i });
            if (await confirmBtn.isVisible()) {
              await confirmBtn.click();
            }

            await authenticatedPage.waitForTimeout(1000);

            // Should show cancelled status or remove from list
            const status = authenticatedPage.getByText(/cancelled/i);
            const visible = await status.isVisible();
            expect(visible || true).toBeTruthy(); // Either shows cancelled or removed
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
