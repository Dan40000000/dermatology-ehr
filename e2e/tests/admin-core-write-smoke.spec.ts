import { test, expect } from '../fixtures/auth.fixture';

test.describe('Admin Core Write Smoke', () => {
  test('provider and user mutations persist in admin settings UI', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin');
    await expect(authenticatedPage).toHaveURL(/\/admin/i);
    await expect(authenticatedPage.getByRole('heading', { name: /admin settings/i })).toBeVisible();

    const mutationResult = await authenticatedPage.evaluate(async () => {
      const providerCreateResponse = await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Dr. Workflow Smoke',
          specialty: 'Dermatology',
          npi: '9998887777',
        }),
      });
      const providerCreatePayload = (await providerCreateResponse.json()) as { id?: string };
      const providerId = providerCreatePayload.id || '';

      const providerUpdateResponse = providerId
        ? await fetch(`/api/admin/providers/${providerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              specialty: 'Medical Dermatology',
              isActive: false,
            }),
          })
        : null;

      const userCreateResponse = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'workflow.user@example.com',
          fullName: 'Workflow User',
          password: 'C0mpl3x!Health',
        }),
      });
      const userCreatePayload = (await userCreateResponse.json()) as { id?: string };
      const userId = userCreatePayload.id || '';

      const userUpdateResponse = userId
        ? await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'ma',
            }),
          })
        : null;

      const providersResponse = await fetch('/api/admin/providers');
      const providersPayload = (await providersResponse.json()) as {
        providers?: Array<{ id?: string; specialty?: string; isActive?: boolean }>;
      };
      const usersResponse = await fetch('/api/admin/users');
      const usersPayload = (await usersResponse.json()) as {
        users?: Array<{ id?: string; role?: string }>;
      };

      const updatedProvider = (providersPayload.providers || []).find((provider) => provider.id === providerId);
      const updatedUser = (usersPayload.users || []).find((user) => user.id === userId);

      return {
        providerCreateCode: providerCreateResponse.status,
        providerUpdateCode: providerUpdateResponse?.status ?? 0,
        providerId,
        providerSpecialty: updatedProvider?.specialty || '',
        providerActive: updatedProvider?.isActive ?? null,
        userCreateCode: userCreateResponse.status,
        userUpdateCode: userUpdateResponse?.status ?? 0,
        userId,
        userRole: updatedUser?.role || '',
      };
    });

    expect(mutationResult.providerCreateCode).toBe(201);
    expect(mutationResult.providerUpdateCode).toBe(200);
    expect(mutationResult.providerId).not.toBe('');
    expect(mutationResult.providerSpecialty).toBe('Medical Dermatology');
    expect(mutationResult.providerActive).toBe(false);

    expect(mutationResult.userCreateCode).toBe(201);
    expect(mutationResult.userUpdateCode).toBe(200);
    expect(mutationResult.userId).not.toBe('');
    expect(mutationResult.userRole).toBe('ma');

    await authenticatedPage.goto('/admin');
    await authenticatedPage.getByRole('button', { name: 'Providers' }).click();
    const providerRow = authenticatedPage.locator('tr', { hasText: 'Dr. Workflow Smoke' }).first();
    await expect(providerRow).toBeVisible();
    await expect(providerRow).toContainText('Inactive');

    await authenticatedPage.getByRole('button', { name: 'Users' }).click();
    const userRow = authenticatedPage.locator('tr', { hasText: 'Workflow User' }).first();
    await expect(userRow).toBeVisible();
    await expect(userRow).toContainText('Medical Assistant');
  });
});
