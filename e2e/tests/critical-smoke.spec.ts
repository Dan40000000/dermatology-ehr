import { test, expect } from '../fixtures/auth.fixture';
import { SchedulePage } from '../pages/SchedulePage';
import { PatientsPage } from '../pages/PatientsPage';

test.describe('Critical Smoke', () => {
  test('schedule page renders core calendar', async ({ authenticatedPage }) => {
    const schedulePage = new SchedulePage(authenticatedPage);
    await schedulePage.goto();

    await expect(authenticatedPage).toHaveURL(/\/schedule/);
    await schedulePage.assertSchedulePageVisible();
  });

  test('patient detail can transition into encounter workflow', async ({ authenticatedPage }) => {
    const patientsPage = new PatientsPage(authenticatedPage);
    await patientsPage.goto();
    await patientsPage.assertPatientsPageVisible();

    await authenticatedPage.goto('/patients/patient-smoke-1');
    await expect(authenticatedPage).toHaveURL(/\/patients\/patient-smoke-1/i);

    await authenticatedPage.goto('/patients/patient-smoke-1/encounter/new');
    await expect(authenticatedPage).toHaveURL(/\/patients\/patient-smoke-1\/encounter\/(new|encounter-smoke-1)/i);
  });

  test('financial and claims hubs render', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/financials');
    await expect(
      authenticatedPage.getByRole('heading', { name: /financial management/i })
    ).toBeVisible();

    await authenticatedPage.goto('/claims');
    await expect(
      authenticatedPage.getByRole('heading', { name: /claims management/i })
    ).toBeVisible();
  });

  test('mail messaging workspace renders', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/mail');
    await expect(authenticatedPage.getByText('IntraMail')).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: /new message/i })).toBeVisible();
    await expect(authenticatedPage.getByText(/inbox/i).first()).toBeVisible();
  });
});
