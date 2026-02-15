import { test, expect } from '../fixtures/auth.fixture';

test.describe('Schedule Write Smoke', () => {
  test('appointment status update and reschedule are reflected in schedule UI', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/schedule');
    await expect(authenticatedPage).toHaveURL(/\/schedule/i);

    const appointmentRow = authenticatedPage.locator('tr', { hasText: 'Smoke Patient' });
    await expect(appointmentRow).toBeVisible();
    await expect(appointmentRow).toContainText(/scheduled/i);

    const updatedResult = await authenticatedPage.evaluate(async () => {
      const nextStartIso = '2026-02-14T17:45:00.000Z';
      const nextEndIso = '2026-02-14T18:15:00.000Z';

      const statusResponse = await fetch('/api/appointments/appointment-smoke-1/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'checked_in' }),
      });

      const rescheduleResponse = await fetch('/api/appointments/appointment-smoke-1/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledStart: nextStartIso,
          scheduledEnd: nextEndIso,
          providerId: 'provider-smoke-1',
        }),
      });

      const listResponse = await fetch('/api/appointments');
      const listPayload = await listResponse.json() as { appointments?: Array<{ scheduledStart?: string; status?: string }> };
      const updatedAppointment = listPayload.appointments?.find((item) => item.status === 'checked_in');
      const formattedLabel = updatedAppointment?.scheduledStart
        ? new Date(updatedAppointment.scheduledStart).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

      return {
        statusCode: statusResponse.status,
        rescheduleCode: rescheduleResponse.status,
        status: updatedAppointment?.status || '',
        formattedLabel,
      };
    });

    expect(updatedResult.statusCode).toBe(200);
    expect(updatedResult.rescheduleCode).toBe(200);
    expect(updatedResult.status).toBe('checked_in');
    expect(updatedResult.formattedLabel).not.toBe('');

    await authenticatedPage.goto('/schedule');
    const updatedRow = authenticatedPage.locator('tr', { hasText: 'Smoke Patient' });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow).toContainText(/checked_in/i);
    await expect(updatedRow).toContainText(updatedResult.formattedLabel);
  });
});
