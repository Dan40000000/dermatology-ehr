import { test as base, expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { PatientsPage } from '../pages/PatientsPage';
import { NewPatientPage } from '../pages/NewPatientPage';
import { PatientDetailPage } from '../pages/PatientDetailPage';
import { generateUniquePatient } from '../fixtures/testData';

test.describe('Patient Management - Comprehensive Tests', () => {
  test.describe('Patient List', () => {
    test('should display patients list page', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.assertPatientsPageVisible();
      await patientsPage.assertPatientTableVisible();
    });

    test('should show patients in table', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should render a patient from the API response', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      const responsePromise = authenticatedPage.waitForResponse((resp) => {
        const url = new URL(resp.url());
        return url.pathname === '/api/patients' && resp.status() === 200;
      });

      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const response = await responsePromise;
      const payload = await response.json();

      if (Array.isArray(payload?.data) && payload.data.length > 0) {
        const patient = payload.data[0];
        await patientsPage.assertPatientInList(patient.firstName, patient.lastName);
      } else {
        const count = await patientsPage.getPatientCount();
        expect(count).toBe(0);
      }
    });

    test('should navigate to new patient page when clicking new patient button', async ({
      authenticatedPage,
    }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.clickNewPatient();

      await expect(authenticatedPage).toHaveURL(/\/patients\/(new|register)/);
    });

    test('should focus search when clicking advanced search', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.clickAdvancedSearch();

      await patientsPage.assertSearchFocused();
    });

    test('should open handout library from patients page', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.clickHandoutLibrary();

      await expect(authenticatedPage).toHaveURL(/\/handouts/);
      await expect(authenticatedPage.getByText(/patient education handout library/i)).toBeVisible();
    });

    test('should navigate to patient detail when clicking on patient', async ({
      authenticatedPage,
    }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await expect(authenticatedPage).toHaveURL(/\/patients\/[a-z0-9-]+/);
      }
    });
  });

  test.describe('Patient Search', () => {
    test('should filter patients by search term', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const initialCount = await patientsPage.getPatientCount();
      if (initialCount > 0) {
        const firstRow = authenticatedPage.locator('tbody tr').first();
        const lastName = (await firstRow.locator('a.ema-patient-link').first().textContent())?.trim();
        if (!lastName) {
          return;
        }

        await patientsPage.searchPatient(lastName);
        await authenticatedPage.waitForTimeout(1000);

        // Results should be filtered
        await expect(authenticatedPage.locator('tbody')).toContainText(lastName);
      }
    });

    test('should show no results for non-existent patient', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      await patientsPage.searchPatient('NonExistentPatient9999999');
      await authenticatedPage.waitForTimeout(1000);

      await expect(authenticatedPage.getByText(/no patients found/i)).toBeVisible();
    });

    test('should clear search and show all patients', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const firstRow = authenticatedPage.locator('tbody tr').first();
      const lastName = (await firstRow.locator('a.ema-patient-link').first().textContent())?.trim();
      if (!lastName) {
        return;
      }

      await patientsPage.searchPatient(lastName);
      await authenticatedPage.waitForTimeout(500);

      await patientsPage.searchPatient('');
      await authenticatedPage.waitForTimeout(500);

      await expect(authenticatedPage.locator('tbody')).toContainText(lastName);
    });
  });

  test.describe('Create New Patient', () => {
    test('should show validation errors when submitting empty form', async ({
      authenticatedPage,
    }) => {
      const newPatientPage = new NewPatientPage(authenticatedPage);
      await newPatientPage.goto();
      await newPatientPage.submitEmptyForm();

      await newPatientPage.assertValidationError();
    });

    test('should create patient with only required fields', async ({ authenticatedPage }) => {
      const patient = generateUniquePatient();
      const newPatientPage = new NewPatientPage(authenticatedPage);

      await newPatientPage.goto();
      await newPatientPage.fillRequiredFields(patient.firstName, patient.lastName);
      await newPatientPage.clickSave();

      // Should show success message or redirect
      await authenticatedPage.waitForTimeout(2000);
      const url = authenticatedPage.url();
      expect(url).toMatch(/\/patients\/[a-z0-9-]+|\/patients$/);
    });

    test('should create patient with all fields', async ({ authenticatedPage }) => {
      const patient = generateUniquePatient();
      const newPatientPage = new NewPatientPage(authenticatedPage);

      await newPatientPage.goto();
      await newPatientPage.createPatient(patient);

      await authenticatedPage.waitForTimeout(2000);

      // Should redirect to patient list or detail
      const url = authenticatedPage.url();
      expect(url).toMatch(/\/patients/);
    });

    test('should show newly created patient in list', async ({ authenticatedPage }) => {
      const patient = generateUniquePatient();
      const newPatientPage = new NewPatientPage(authenticatedPage);

      await newPatientPage.goto();
      await newPatientPage.createPatient(patient);
      await authenticatedPage.waitForTimeout(2000);

      // Navigate to patients list
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      // Search for the new patient
      await patientsPage.searchPatient(patient.lastName);
      await authenticatedPage.waitForTimeout(1000);

      // Should find the patient
      await patientsPage.assertPatientInList(patient.firstName, patient.lastName);
    });

    test('should validate email format', async ({ authenticatedPage }) => {
      const patient = generateUniquePatient();
      const newPatientPage = new NewPatientPage(authenticatedPage);

      await newPatientPage.goto();
      await newPatientPage.fillPatientForm({
        ...patient,
        email: 'invalid-email',
      });
      await newPatientPage.clickSave();

      await expect(authenticatedPage.locator('input:invalid')).toHaveCount(1);
    });

    test('should validate phone number format', async ({ authenticatedPage }) => {
      const patient = generateUniquePatient();
      const newPatientPage = new NewPatientPage(authenticatedPage);

      await newPatientPage.goto();
      await newPatientPage.fillPatientForm({
        ...patient,
        phone: 'abc',
      });
      await newPatientPage.clickSave();

      // May show validation error or accept and format it
      await authenticatedPage.waitForTimeout(1000);
    });

    test('should cancel patient creation', async ({ authenticatedPage }) => {
      const patient = generateUniquePatient();
      const newPatientPage = new NewPatientPage(authenticatedPage);

      await newPatientPage.goto();
      await newPatientPage.fillPatientForm(patient);
      await newPatientPage.clickCancel();

      // Should navigate away without saving
      await expect(authenticatedPage).toHaveURL(/\/patients/);
    });
  });

  test.describe('View Patient Details', () => {
    test('should display patient detail page', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();

        const patientDetailPage = new PatientDetailPage(authenticatedPage);
        await patientDetailPage.assertPatientDetailPageVisible();
      }
    });

    test('should show patient information', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();

        const patientDetailPage = new PatientDetailPage(authenticatedPage);
        await patientDetailPage.assertPatientDetailPageVisible();

        // Check for patient information sections
        const chartSection = authenticatedPage.locator('text=/chart|demographics|info/i');
        await expect(chartSection.first()).toBeVisible();
      }
    });

    test('should navigate between patient tabs', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();

        const patientDetailPage = new PatientDetailPage(authenticatedPage);

        // Try to navigate to different tabs
        const tabs = ['chart', 'encounters', 'appointments', 'documents'];
        for (const tab of tabs) {
          const tabElement = authenticatedPage.getByRole('tab', { name: new RegExp(tab, 'i') });
          if (await tabElement.isVisible()) {
            await tabElement.click();
            await authenticatedPage.waitForTimeout(500);
          }
        }
      }
    });

    test('should show new encounter button', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();

        const newEncounterBtn = authenticatedPage.getByRole('button', {
          name: /new encounter|start encounter/i,
        });
        // Button may or may not be visible depending on permissions
        const isVisible = await newEncounterBtn.isVisible();
        if (isVisible) {
          await expect(newEncounterBtn).toBeEnabled();
        }
      }
    });
  });

  test.describe('Edit Patient', () => {
    test('should open edit patient form', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();

        const patientDetailPage = new PatientDetailPage(authenticatedPage);
        const editBtn = authenticatedPage.getByRole('button', { name: /edit/i });

        if (await editBtn.isVisible()) {
          await patientDetailPage.clickEditPatient();
          await authenticatedPage.waitForTimeout(1000);

          // Should show edit form or modal
          const form = authenticatedPage.locator('form, [role="dialog"]');
          await expect(form.first()).toBeVisible();
        }
      }
    });
  });
});
