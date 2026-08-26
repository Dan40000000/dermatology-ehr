import { expect, test } from '../fixtures/auth.fixture';

test.describe('Clinical Inbox Responsive Smoke', () => {
  test('keeps a production-sized mobile work queue bounded and scrollable', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    await authenticatedPage.route('**/api/tasks**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      const tasks = Array.from({ length: 200 }, (_, index) => ({
        id: `task-mobile-${index + 1}`,
        title: `Synthetic mobile queue item ${index + 1}`,
        description: 'Responsive queue regression fixture. No PHI.',
        category: 'patient-followup',
        priority: index < 12 ? 'urgent' : 'normal',
        status: 'todo',
        assignedToName: index % 4 === 0 ? 'Admin User' : 'Unassigned',
        dueDate: '2026-08-26',
        createdAt: '2026-08-26T12:00:00.000Z',
        updatedAt: '2026-08-26T12:00:00.000Z',
      }));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks }),
      });
    });

    await authenticatedPage.goto('/clinical-inbox');
    await expect(authenticatedPage.getByRole('heading', { name: 'Clinical Inbox' })).toBeVisible();
    const workList = authenticatedPage.locator('.clinical-inbox-items');
    await expect(workList.getByText('Synthetic mobile queue item 1', { exact: true })).toBeVisible();

    const layout = await workList.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        maxHeight: style.maxHeight,
        documentHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });

    expect(layout.maxHeight).not.toBe('none');
    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
    expect(layout.clientHeight).toBeLessThanOrEqual(Math.ceil(844 * 0.58) + 2);
    expect(layout.documentHeight).toBeLessThan(4000);
    expect(layout.documentWidth).toBe(layout.viewportWidth);
  });
});
