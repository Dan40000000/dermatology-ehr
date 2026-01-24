import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  login,
  fetchMe,
  fetchPatients,
  fetchPatient,
  fetchAppointments,
  fetchEncounters,
  fetchTasks,
  fetchMessages,
  fetchOrders,
  fetchMessageThreads,
  fetchMessageThread,
  createMessageThread,
  sendThreadMessage,
  markThreadAsRead,
  archiveThread,
  fetchUnreadCount,
  fetchProviders,
  fetchLocations,
  fetchAppointmentTypes,
  fetchAvailability,
  fetchCharges,
  fetchDocuments,
  fetchPhotos,
  fetchPhotoTimeline,
  createComparisonGroup,
  fetchComparisonGroup,
  fetchVitals,
  fetchAudit,
  fetchAppointmentsByProvider,
  fetchRevenueByDay,
  fetchStatusCounts,
  fetchDashboardKPIs,
  fetchProviderProductivity,
  fetchPatientDemographics,
  fetchAppointmentTypesAnalytics,
  updatePhotoAnnotations,
  updatePhotoBodyLocation,
  uploadDocumentFile,
  uploadPhotoFile,
  createPatient,
  updatePatient,
  createAppointment,
  updateAppointmentStatus,
  createEncounter,
  updateEncounterStatus,
  generateAiNoteDraft,
  createOrder,
  updateOrderStatus,
  sendErx,
  fetchReportAppointmentsCsv,
  fetchFhirExamples,
  presignS3,
  completePresign,
  getPresignedAccess,
  updateTask,
  updateTaskStatus,
  deleteTask,
  fetchFeeSchedules,
  fetchFeeSchedule,
  fetchFeeScheduleItems,
  fetchDefaultFeeSchedule,
  fetchFeeForCPT,
  createFeeSchedule,
  updateFeeSchedule,
  updateFeeScheduleItem,
  importFeeScheduleItems,
  exportFeeSchedule,
  fetchAppointmentsByDay,
} from '../api';

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const tenantId = 'tenant-1';
const token = 'token-1';

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

const okResponse = (data: unknown = {}) =>
  ({ ok: true, json: vi.fn().mockResolvedValue(data) }) as Response;

describe('api.ts', () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('logs in with tenant header', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    await login(tenantId, 'user@example.com', 'secret');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/auth/login`);
    expect(options?.method).toBe('POST');
    expect(options?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
    });
    expect(options?.body).toBe(JSON.stringify({ email: 'user@example.com', password: 'secret' }));
  });

  it('surfaces login errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'nope' }),
    } as Response);

    await expect(login(tenantId, 'user@example.com', 'secret')).rejects.toThrow('nope');
  });

  it('fetches current user and fails with message', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchMe(tenantId, token);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/auth/me`);
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'bad' }),
    } as Response);
    await expect(fetchMe(tenantId, token)).rejects.toThrow('bad');
  });

  it('handles patient fetch errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    await expect(fetchPatients(tenantId, token)).rejects.toThrow('Failed to load patients');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(fetchPatient(tenantId, token, 'patient-1')).rejects.toThrow('Patient not found');
  });

  it('normalizes patient payloads to include patients array', async () => {
    const payload = { data: [{ id: 'patient-1' }], meta: { total: 1 } };
    fetchMock.mockResolvedValueOnce(okResponse(payload));

    const res = await fetchPatients(tenantId, token);
    expect(res.data).toEqual(payload.data);
    expect(res.patients).toEqual(payload.data);
  });

  it('builds task filters into query params', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    await fetchTasks(tenantId, token, {
      status: 'open',
      priority: 'high',
      search: 'rash',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/tasks?status=open&priority=high&search=rash`);
  });

  it.each([
    {
      label: 'appointments',
      call: () => fetchAppointments(tenantId, token),
      path: '/api/appointments',
    },
    {
      label: 'encounters',
      call: () => fetchEncounters(tenantId, token),
      path: '/api/encounters',
    },
    {
      label: 'messages',
      call: () => fetchMessages(tenantId, token),
      path: '/api/messages',
    },
    {
      label: 'message thread',
      call: () => fetchMessageThread(tenantId, token, 'thread-1'),
      path: '/api/messaging/threads/thread-1',
    },
    {
      label: 'unread count',
      call: () => fetchUnreadCount(tenantId, token),
      path: '/api/messaging/unread-count',
    },
    {
      label: 'providers',
      call: () => fetchProviders(tenantId, token),
      path: '/api/providers',
    },
    {
      label: 'locations',
      call: () => fetchLocations(tenantId, token),
      path: '/api/locations',
    },
    {
      label: 'appointment types',
      call: () => fetchAppointmentTypes(tenantId, token),
      path: '/api/appointment-types',
    },
    {
      label: 'availability',
      call: () => fetchAvailability(tenantId, token),
      path: '/api/availability',
    },
    {
      label: 'charges',
      call: () => fetchCharges(tenantId, token),
      path: '/api/charges',
    },
    {
      label: 'documents',
      call: () => fetchDocuments(tenantId, token),
      path: '/api/documents',
    },
    {
      label: 'orders',
      call: () => fetchOrders(tenantId, token),
      path: '/api/orders',
    },
    {
      label: 'fee schedules',
      call: () => fetchFeeSchedules(tenantId, token),
      path: '/api/fee-schedules',
    },
    {
      label: 'fee schedule',
      call: () => fetchFeeSchedule(tenantId, token, 'schedule-1'),
      path: '/api/fee-schedules/schedule-1',
    },
    {
      label: 'fee schedule items',
      call: () => fetchFeeScheduleItems(tenantId, token, 'schedule-1'),
      path: '/api/fee-schedules/schedule-1/items',
    },
    {
      label: 'default fee schedule',
      call: () => fetchDefaultFeeSchedule(tenantId, token),
      path: '/api/fee-schedules/default/schedule',
    },
    {
      label: 'fee for CPT',
      call: () => fetchFeeForCPT(tenantId, token, '99213'),
      path: '/api/fee-schedules/default/fee/99213',
    },
    {
      label: 'photo timeline',
      call: () => fetchPhotoTimeline(tenantId, token, 'patient-1'),
      path: '/api/photos/patient/patient-1/timeline',
    },
    {
      label: 'vitals',
      call: () => fetchVitals(tenantId, token),
      path: '/api/vitals',
    },
    {
      label: 'audit',
      call: () => fetchAudit(tenantId, token),
      path: '/api/audit/log',
    },
    {
      label: 'provider productivity',
      call: () => fetchProviderProductivity(tenantId, token),
      path: '/api/analytics/provider-productivity',
    },
    {
      label: 'patient demographics',
      call: () => fetchPatientDemographics(tenantId, token),
      path: '/api/analytics/patient-demographics',
    },
    {
      label: 'appointment type analytics',
      call: () => fetchAppointmentTypesAnalytics(tenantId, token),
      path: '/api/analytics/appointment-types',
    },
  ])('fetches %s with auth headers', async ({ call, path }) => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await call();

    const [url, options] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(url).toBe(`${baseUrl}${path}`);
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    });
  });

  it('fetches message threads with filters', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchMessageThreads(tenantId, token, 'unread');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/messaging/threads?filter=unread`);
  });

  it('marks thread as read via PUT', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await markThreadAsRead(tenantId, token, 'thread-1');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/messaging/threads/thread-1/read`);
    expect(options?.method).toBe('PUT');
  });

  it('creates threads and surfaces errors', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await createMessageThread(tenantId, token, { subject: 'test' });

    const [, options] = fetchMock.mock.calls[0];
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ subject: 'test' }));

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'failed' }),
    } as Response);
    await expect(createMessageThread(tenantId, token, { subject: 'test' })).rejects.toThrow('failed');
  });

  it('sends thread messages and handles failures', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await sendThreadMessage(tenantId, token, 'thread-1', 'hello');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/messaging/threads/thread-1/messages`);
    expect(options?.method).toBe('POST');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'bad' }),
    } as Response);
    await expect(sendThreadMessage(tenantId, token, 'thread-1', 'hello')).rejects.toThrow('bad');
  });

  it('builds photo filters into query params', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchPhotos(tenantId, token, {
      patientId: 'patient-1',
      photoType: 'clinical',
      bodyLocation: 'arm',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `${baseUrl}/api/photos?patientId=patient-1&photoType=clinical&bodyLocation=arm`
    );
  });

  it('creates and fetches comparison groups', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await createComparisonGroup(tenantId, token, {
      patientId: 'patient-1',
      name: 'progress',
    });

    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/photos/comparison-group`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ patientId: 'patient-1', name: 'progress' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchComparisonGroup(tenantId, token, 'group-1');

    [url] = fetchMock.mock.calls[1];
    expect(url).toBe(`${baseUrl}/api/photos/comparison-group/group-1`);
  });

  it('archives threads with payload', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await archiveThread(tenantId, token, 'thread-1', true);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/messaging/threads/thread-1/archive`);
    expect(options?.method).toBe('PUT');
    expect(options?.body).toBe(JSON.stringify({ archive: true }));
  });

  it('posts and puts with auth helpers', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await createPatient(tenantId, token, { name: 'Jane' });

    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/patients`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ name: 'Jane' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updatePatient(tenantId, token, 'patient-1', { name: 'Jane Doe' });

    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${baseUrl}/api/patients/patient-1`);
    expect(options?.method).toBe('PUT');
    expect(options?.body).toBe(JSON.stringify({ name: 'Jane Doe' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await createAppointment(tenantId, token, { patientId: 'patient-1' });

    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${baseUrl}/api/appointments`);
    expect(options?.method).toBe('POST');

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updateAppointmentStatus(tenantId, token, 'appt-1', 'checked-in');

    [url, options] = fetchMock.mock.calls[3];
    expect(url).toBe(`${baseUrl}/api/appointments/appt-1/status`);
    expect(options?.body).toBe(JSON.stringify({ status: 'checked-in' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await createEncounter(tenantId, token, { patientId: 'patient-1' });

    [url, options] = fetchMock.mock.calls[4];
    expect(url).toBe(`${baseUrl}/api/encounters`);
    expect(options?.method).toBe('POST');

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updateEncounterStatus(tenantId, token, 'enc-1', 'closed');

    [url, options] = fetchMock.mock.calls[5];
    expect(url).toBe(`${baseUrl}/api/encounters/enc-1/status`);
    expect(options?.body).toBe(JSON.stringify({ status: 'closed' }));

    fetchMock.mockResolvedValueOnce(okResponse({ draft: {} }));
    await generateAiNoteDraft(tenantId, token, { patientId: 'patient-1', briefNotes: 'AI note' });

    [url, options] = fetchMock.mock.calls[6];
    expect(url).toBe(`${baseUrl}/api/ai-notes/draft`);
    expect(options?.method).toBe('POST');
  });

  it('updates photo metadata', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updatePhotoAnnotations(tenantId, token, 'photo-1', { notes: 'note' });

    let [, options] = fetchMock.mock.calls[0];
    expect(options?.method).toBe('PUT');
    expect(options?.body).toBe(JSON.stringify({ notes: 'note' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updatePhotoBodyLocation(tenantId, token, 'photo-1', 'arm');

    [, options] = fetchMock.mock.calls[1];
    expect(options?.body).toBe(JSON.stringify({ bodyLocation: 'arm' }));
  });

  it('updates tasks and deletes tasks', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updateTask(tenantId, token, 'task-1', { status: 'done' });

    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/tasks/task-1`);
    expect(options?.method).toBe('PUT');
    expect(options?.body).toBe(JSON.stringify({ status: 'done' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updateTaskStatus(tenantId, token, 'task-1', 'done');

    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${baseUrl}/api/tasks/task-1/status`);
    expect(options?.body).toBe(JSON.stringify({ status: 'done' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await deleteTask(tenantId, token, 'task-1');

    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${baseUrl}/api/tasks/task-1`);
    expect(options?.method).toBe('DELETE');
  });

  it('handles fee schedule writes and exports', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await createFeeSchedule(tenantId, token, { name: 'Standard' });

    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/fee-schedules`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ name: 'Standard' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updateFeeSchedule(tenantId, token, 'schedule-1', { name: 'Updated' });

    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${baseUrl}/api/fee-schedules/schedule-1`);
    expect(options?.method).toBe('PUT');
    expect(options?.body).toBe(JSON.stringify({ name: 'Updated' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updateFeeScheduleItem(tenantId, token, 'schedule-1', '99213', { price: 120 });

    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${baseUrl}/api/fee-schedules/schedule-1/items/99213`);
    expect(options?.method).toBe('PUT');
    expect(options?.body).toBe(JSON.stringify({ price: 120 }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await importFeeScheduleItems(tenantId, token, 'schedule-1', [{ code: '99213' }]);

    [url, options] = fetchMock.mock.calls[3];
    expect(url).toBe(`${baseUrl}/api/fee-schedules/schedule-1/items/import`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ items: [{ code: '99213' }] }));

    const blob = new Blob(['data'], { type: 'text/plain' });
    fetchMock.mockResolvedValueOnce({ ok: true, blob: vi.fn().mockResolvedValue(blob) } as Response);
    await expect(exportFeeSchedule(tenantId, token, 'schedule-1')).resolves.toBe(blob);

    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    await expect(exportFeeSchedule(tenantId, token, 'schedule-1')).rejects.toThrow('Failed to export fee schedule');
  });

  it('handles order actions and report exports', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await createOrder(tenantId, token, { type: 'lab' });

    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/orders`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ type: 'lab' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await updateOrderStatus(tenantId, token, 'order-1', 'sent');

    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${baseUrl}/api/orders/order-1/status`);
    expect(options?.body).toBe(JSON.stringify({ status: 'sent' }));

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await sendErx(tenantId, token, { orderId: 'order-1' });

    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${baseUrl}/api/orders/erx/send`);
    expect(options?.body).toBe(JSON.stringify({ orderId: 'order-1' }));

    fetchMock.mockResolvedValueOnce({ ok: true, text: vi.fn().mockResolvedValue('csv-data') } as Response);
    await expect(fetchReportAppointmentsCsv(tenantId, token)).resolves.toBe('csv-data');

    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    await expect(fetchReportAppointmentsCsv(tenantId, token)).rejects.toThrow('Failed to export report');
  });

  it('handles presigned uploads', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ url: 'signed', key: 'key-1' }));
    await presignS3(tenantId, token, 'file.txt', 'text/plain');

    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/presign/s3`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ filename: 'file.txt', contentType: 'text/plain' }));

    fetchMock.mockResolvedValueOnce(okResponse({ url: 'download' }));
    await completePresign(tenantId, token, 'key-1');

    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${baseUrl}/api/presign/s3/complete`);
    expect(options?.body).toBe(JSON.stringify({ key: 'key-1' }));

    fetchMock.mockResolvedValueOnce(okResponse({ url: 'https://download' }));
    await getPresignedAccess(tenantId, token, 'folder/file 1.png');

    [url] = fetchMock.mock.calls[2];
    expect(url).toBe(`${baseUrl}/api/presign/s3/access/folder%2Ffile%201.png`);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'nope' }),
    } as Response);
    await expect(presignS3(tenantId, token, 'file.txt', 'text/plain')).rejects.toThrow('nope');
  });

  it('fetches FHIR example payloads', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: 'appointment' }));
    fetchMock.mockResolvedValueOnce(okResponse({ id: 'observation' }));

    await expect(fetchFhirExamples(tenantId, token)).resolves.toEqual({
      appointment: { id: 'appointment' },
      observation: { id: 'observation' },
    });

    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    await expect(fetchFhirExamples(tenantId, token)).rejects.toThrow('Failed to load FHIR example');

    fetchMock.mockResolvedValueOnce(okResponse({}));
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    await expect(fetchFhirExamples(tenantId, token)).rejects.toThrow('Failed to load FHIR observation example');
  });

  it('uploads document and photo files', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    const file = new File(['data'], 'doc.txt', { type: 'text/plain' });
    await uploadDocumentFile(tenantId, token, file);

    let [, options] = fetchMock.mock.calls[0];
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(FormData);

    fetchMock.mockResolvedValueOnce(okResponse({}));
    const photo = new File(['data'], 'photo.png', { type: 'image/png' });
    await uploadPhotoFile(tenantId, token, photo);

    [, options] = fetchMock.mock.calls[1];
    expect(options?.body).toBeInstanceOf(FormData);
  });

  it('builds analytics query without provider=all', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchAppointmentsByDay(tenantId, token, { startDate: '2024-01-01', providerId: 'all' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/analytics/appointments-by-day?startDate=2024-01-01`);
  });

  it('builds analytics queries with filters', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchAppointmentsByProvider(tenantId, token, {
      startDate: '2024-01-01',
      endDate: '2024-01-02',
      providerId: 'provider-1',
    });

    let [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `${baseUrl}/api/analytics/appointments-by-provider?startDate=2024-01-01&endDate=2024-01-02&providerId=provider-1`
    );

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchRevenueByDay(tenantId, token, { endDate: '2024-01-02' });

    [url] = fetchMock.mock.calls[1];
    expect(url).toBe(`${baseUrl}/api/analytics/revenue-by-day?endDate=2024-01-02`);

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchStatusCounts(tenantId, token, { providerId: 'provider-1' });

    [url] = fetchMock.mock.calls[2];
    expect(url).toBe(`${baseUrl}/api/analytics/status-counts?providerId=provider-1`);

    fetchMock.mockResolvedValueOnce(okResponse({}));
    await fetchDashboardKPIs(tenantId, token, { startDate: '2024-01-01' });

    [url] = fetchMock.mock.calls[3];
    expect(url).toBe(`${baseUrl}/api/analytics/dashboard?startDate=2024-01-01`);
  });

  it('surfaces auth helper errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'nope' }),
    } as Response);
    await expect(createPatient(tenantId, token, { name: 'Jane' })).rejects.toThrow('nope');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'bad' }),
    } as Response);
    await expect(updatePatient(tenantId, token, 'patient-1', { name: 'Jane' })).rejects.toThrow('bad');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    } as Response);
    await expect(fetchFeeSchedules(tenantId, token)).rejects.toThrow('Request failed: /api/fee-schedules');
  });
});
