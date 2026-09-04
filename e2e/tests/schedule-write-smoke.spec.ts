import { test, expect } from '../fixtures/auth.fixture';

test.describe('Schedule Write Smoke', () => {
  test('appointment status update and reschedule are reflected in schedule UI', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/schedule');
    await expect(authenticatedPage).toHaveURL(/\/schedule/i);

    const appointmentRow = authenticatedPage.locator('.ema-table tbody tr', { hasText: 'Smoke Patient' });
    await expect(appointmentRow).toBeVisible();
    await expect(appointmentRow).toContainText(/scheduled/i);

    const updatedResult = await authenticatedPage.evaluate(async () => {
      const nextStart = new Date();
      nextStart.setHours(11, 45, 0, 0);
      const nextEnd = new Date(nextStart.getTime() + 30 * 60 * 1000);

      const nextStartIso = nextStart.toISOString();
      const nextEndIso = nextEnd.toISOString();

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
      const summaryResponse = await fetch('/api/command-center/summary');
      const summaryPayload = await summaryResponse.json() as { practiceTimeZone?: string };
      const updatedAppointment = listPayload.appointments?.find((item) => item.status === 'checked_in');
      const formattedLabel = updatedAppointment?.scheduledStart
        ? new Intl.DateTimeFormat('en-US', {
            timeZone: summaryPayload.practiceTimeZone || 'America/Denver',
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).format(new Date(updatedAppointment.scheduledStart))
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
    const updatedRow = authenticatedPage.locator('.ema-table tbody tr', { hasText: 'Smoke Patient' });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow).toContainText(/checked in|checked_in/i);
    await expect(updatedRow).toContainText(updatedResult.formattedLabel);
  });
});
