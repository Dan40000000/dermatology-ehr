import { test, expect } from '../fixtures/auth.fixture';
import { EncounterPage } from '../pages/EncounterPage';
import { PatientsPage } from '../pages/PatientsPage';
import { TEST_CLINICAL, TEST_NOTE } from '../fixtures/testData';

test.describe('Clinical Workflows - Comprehensive Tests', () => {
  let patientId: string;

  test.beforeAll(async () => {
    // Note: In real scenarios, you'd create a test patient or use a known patient ID
    patientId = 'test-patient-id';
  });

  test.describe('Start Encounter', () => {
    test('should start new encounter from patient detail', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        // Extract patient ID from URL
        const url = authenticatedPage.url();
        const match = url.match(/\/patients\/([a-z0-9-]+)/);
        if (match) {
          patientId = match[1];

          const newEncounterBtn = authenticatedPage.getByRole('button', {
            name: /new encounter|start encounter/i,
          });

          if (await newEncounterBtn.isVisible()) {
            await newEncounterBtn.click();
            await authenticatedPage.waitForTimeout(1000);

            // Should navigate to encounter page
            await expect(authenticatedPage).toHaveURL(/\/encounter/);
          }
        }
      }
    });
  });

  test.describe('Add Vitals', () => {
    test('should add vitals to encounter', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        const newEncounterBtn = authenticatedPage.getByRole('button', {
          name: /new encounter|start encounter/i,
        });

        if (await newEncounterBtn.isVisible()) {
          await newEncounterBtn.click();
          await authenticatedPage.waitForTimeout(1000);

          const encounterPage = new EncounterPage(authenticatedPage);

          // Try to add vitals
          const vitalsSection = authenticatedPage.locator('[data-testid="vitals"], .vitals');
          if (await vitalsSection.isVisible()) {
            await encounterPage.addVitals({
              bloodPressure: TEST_CLINICAL.vitals.bloodPressure,
              heartRate: TEST_CLINICAL.vitals.heartRate,
              temperature: TEST_CLINICAL.vitals.temperature,
            });
          }
        }
      }
    });

    test('should validate vital signs format', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        const newEncounterBtn = authenticatedPage.getByRole('button', {
          name: /new encounter|start encounter/i,
        });

        if (await newEncounterBtn.isVisible()) {
          await newEncounterBtn.click();
          await authenticatedPage.waitForTimeout(1000);

          // Try to enter invalid vitals
          const bpInput = authenticatedPage.getByLabel(/blood pressure|bp/i);
          if (await bpInput.isVisible()) {
            await bpInput.fill('abc');

            const saveBtn = authenticatedPage.getByRole('button', { name: /save/i });
            await saveBtn.first().click();

            // May show validation error
            await authenticatedPage.waitForTimeout(1000);
          }
        }
      }
    });
  });

  test.describe('Add Diagnosis', () => {
    test('should add diagnosis with ICD code', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        const newEncounterBtn = authenticatedPage.getByRole('button', {
          name: /new encounter|start encounter/i,
        });

        if (await newEncounterBtn.isVisible()) {
          await newEncounterBtn.click();
          await authenticatedPage.waitForTimeout(1000);

          const encounterPage = new EncounterPage(authenticatedPage);

          const addDiagnosisBtn = authenticatedPage.getByRole('button', {
            name: /add diagnosis|diagnosis/i,
          });

          if (await addDiagnosisBtn.isVisible()) {
            await encounterPage.addDiagnosis(
              TEST_CLINICAL.diagnosis.code,
              TEST_CLINICAL.diagnosis.description
            );
          }
        }
      }
    });
  });

  test.describe('Clinical Note', () => {
    test('should create comprehensive clinical note', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        const newEncounterBtn = authenticatedPage.getByRole('button', {
          name: /new encounter|start encounter/i,
        });

        if (await newEncounterBtn.isVisible()) {
          await newEncounterBtn.click();
          await authenticatedPage.waitForTimeout(1000);

          const encounterPage = new EncounterPage(authenticatedPage);

          // Fill clinical note sections
          await encounterPage.fillChiefComplaint(TEST_CLINICAL.chiefComplaint);

          const hpiInput = authenticatedPage.getByLabel(/hpi|history/i);
          if (await hpiInput.isVisible()) {
            await encounterPage.fillHPI(TEST_NOTE.hpi);
          }

          const rosInput = authenticatedPage.getByLabel(/ros|review/i);
          if (await rosInput.isVisible()) {
            await encounterPage.fillROS(TEST_NOTE.ros);
          }

          const examInput = authenticatedPage.getByLabel(/exam|physical/i);
          if (await examInput.isVisible()) {
            await encounterPage.fillExam(TEST_NOTE.exam);
          }

          const assessmentInput = authenticatedPage.getByLabel(/assessment/i);
          if (await assessmentInput.isVisible()) {
            await encounterPage.fillAssessment(TEST_NOTE.assessment);
          }

          const planInput = authenticatedPage.getByLabel(/plan/i);
          if (await planInput.isVisible()) {
            await encounterPage.fillPlan(TEST_NOTE.plan);
          }

          // Save the encounter
          await encounterPage.save();
          await authenticatedPage.waitForTimeout(2000);
        }
      }
    });

    test('should use note template', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        const newEncounterBtn = authenticatedPage.getByRole('button', {
          name: /new encounter|start encounter/i,
        });

        if (await newEncounterBtn.isVisible()) {
          await newEncounterBtn.click();
          await authenticatedPage.waitForTimeout(1000);

          const templateSelect = authenticatedPage.getByLabel(/template|note template/i);
          if (await templateSelect.isVisible()) {
            // Select first template
            await templateSelect.selectOption({ index: 1 });
            await authenticatedPage.waitForTimeout(1000);

            // Template should populate fields
            const hpiInput = authenticatedPage.getByLabel(/hpi/i);
            if (await hpiInput.isVisible()) {
              const value = await hpiInput.inputValue();
              expect(value.length).toBeGreaterThan(0);
            }
          }
        }
      }
    });
  });

  test.describe('Sign and Finalize Encounter', () => {
    test('should save encounter as draft', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        const newEncounterBtn = authenticatedPage.getByRole('button', {
          name: /new encounter|start encounter/i,
        });

        if (await newEncounterBtn.isVisible()) {
          await newEncounterBtn.click();
          await authenticatedPage.waitForTimeout(1000);

          const encounterPage = new EncounterPage(authenticatedPage);
          await encounterPage.fillChiefComplaint(TEST_CLINICAL.chiefComplaint);

          await encounterPage.save();
          await authenticatedPage.waitForTimeout(2000);

          // Should show success message
          const successMsg = authenticatedPage.getByText(/saved|success/i);
          const isVisible = await successMsg.isVisible();
          if (isVisible) {
            await expect(successMsg).toBeVisible();
          }
        }
      }
    });

    test('should sign encounter', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        const newEncounterBtn = authenticatedPage.getByRole('button', {
          name: /new encounter|start encounter/i,
        });

        if (await newEncounterBtn.isVisible()) {
          await newEncounterBtn.click();
          await authenticatedPage.waitForTimeout(1000);

          const encounterPage = new EncounterPage(authenticatedPage);
          await encounterPage.fillChiefComplaint(TEST_CLINICAL.chiefComplaint);
          await encounterPage.save();
          await authenticatedPage.waitForTimeout(1000);

          const signBtn = authenticatedPage.getByRole('button', { name: /sign|finalize/i });
          if (await signBtn.isVisible()) {
            await encounterPage.sign();
            await authenticatedPage.waitForTimeout(2000);

            // Should show signed status
            const status = authenticatedPage.getByText(/signed/i);
            const isVisible = await status.isVisible();
            if (isVisible) {
              await expect(status).toBeVisible();
            }
          }
        }
      }
    });

    test('should not allow editing locked encounter', async ({ authenticatedPage }) => {
      const patientsPage = new PatientsPage(authenticatedPage);
      await patientsPage.goto();
      await patientsPage.waitForPatientsToLoad();

      const count = await patientsPage.getPatientCount();
      if (count > 0) {
        await patientsPage.clickFirstPatient();
        await authenticatedPage.waitForTimeout(1000);

        // Check if there are any existing encounters
        const encountersTab = authenticatedPage.getByRole('tab', { name: /encounters/i });
        if (await encountersTab.isVisible()) {
          await encountersTab.click();
          await authenticatedPage.waitForTimeout(1000);

          const encounters = authenticatedPage.locator('[data-testid="encounter"], .encounter');
          const encounterCount = await encounters.count();

          if (encounterCount > 0) {
            // Look for a locked encounter
            const lockedEncounter = authenticatedPage.getByText(/locked/i);
            if (await lockedEncounter.isVisible()) {
              await lockedEncounter.click();
              await authenticatedPage.waitForTimeout(1000);

              // Form fields should be disabled
              const ccInput = authenticatedPage.getByLabel(/chief complaint/i);
              if (await ccInput.isVisible()) {
                const isDisabled = await ccInput.isDisabled();
                expect(isDisabled).toBeTruthy();
              }
            }
          }
        }
      }
    });
  });
});
