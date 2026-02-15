import { test, expect } from '../fixtures/auth.fixture';

test.describe('Documents Write Smoke', () => {
  test('document upload/create mutations are reflected in documents UI', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/documents');
    await expect(authenticatedPage).toHaveURL(/\/documents/i);
    await expect(authenticatedPage.getByRole('heading', { name: /document management/i })).toBeVisible();
    await expect(authenticatedPage.getByText('Smoke Intake Consent')).toBeVisible();

    const mutationResult = await authenticatedPage.evaluate(async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['smoke-pdf'], { type: 'application/pdf' }), 'smoke-upload.pdf');

      const uploadResponse = await fetch('/api/upload/document', {
        method: 'POST',
        body: formData,
      });
      const uploadPayload = (await uploadResponse.json()) as {
        url?: string;
        objectKey?: string;
        storage?: 'local' | 's3';
      };

      const createResponse = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: 'patient-smoke-1',
          title: 'Smoke Upload Result',
          category: 'Lab Results',
          description: 'Uploaded by documents write smoke',
          url: uploadPayload.url,
          objectKey: uploadPayload.objectKey,
          storage: uploadPayload.storage,
          filename: 'smoke-upload.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
        }),
      });
      const createPayload = (await createResponse.json()) as { id?: string; document?: { id?: string } };

      const listResponse = await fetch('/api/documents?category=Lab%20Results');
      const listPayload = (await listResponse.json()) as {
        documents?: Array<{ id?: string; title?: string; category?: string }>;
      };
      const createdId = createPayload.id || createPayload.document?.id || '';
      const createdDocument = listPayload.documents?.find((item) => item.id === createdId);

      return {
        uploadCode: uploadResponse.status,
        createCode: createResponse.status,
        createdId,
        createdTitle: createdDocument?.title || '',
        createdCategory: createdDocument?.category || '',
      };
    });

    expect(mutationResult.uploadCode).toBe(200);
    expect(mutationResult.createCode).toBe(201);
    expect(mutationResult.createdId).not.toBe('');
    expect(mutationResult.createdTitle).toBe('Smoke Upload Result');
    expect(mutationResult.createdCategory).toBe('Lab Results');

    await authenticatedPage.goto('/documents');
    await expect(authenticatedPage.getByText('Smoke Upload Result')).toBeVisible();
    await expect(authenticatedPage.getByText(/lab results/i).first()).toBeVisible();
  });
});
