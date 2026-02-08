import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateVitals,
  updateEncounterFields,
  rescheduleAppointment,
  updateEncounter,
  createVitals,
  createTask,
  fetchTaskComments,
  addTaskComment,
  createMessage,
  createCharge,
  createDocument,
  createPhoto,
  deleteFeeSchedule,
  deleteFeeScheduleItem,
  fetchDiagnosesByEncounter,
  createDiagnosis,
  updateDiagnosis,
  deleteDiagnosis,
  searchICD10Codes,
  fetchChargesByEncounter,
  updateCharge,
  deleteCharge,
  searchCPTCodes,
  fetchCptCodes,
  fetchCptCode,
  fetchIcd10Codes,
  fetchIcd10Code,
  fetchClaims,
  fetchClaimDetail,
  createClaim,
  updateClaimStatus,
  postClaimPayment,
  getSuperbillUrl,
  fetchSuggestedDiagnoses,
  fetchSuggestedProcedures,
  fetchProceduresForDiagnosis,
  fetchProviderStats,
  fetchNoteTemplates,
  fetchNoteTemplate,
  createNoteTemplate,
  updateNoteTemplate,
  deleteNoteTemplate,
  applyNoteTemplate,
  toggleNoteTemplateFavorite,
  submitPARequest,
  checkPARequestStatus,
  updatePARequest,
  triggerWaitlistAutoFill,
  notifyWaitlistPatient,
  getWaitlistNotifications,
  fillWaitlistEntry,
  fetchFaxInbox,
  fetchFaxOutbox,
  sendFax,
  updateFax,
  deleteFax,
  fetchFaxPdf,
  fetchFaxStats,
  simulateIncomingFax,
  fetchTimeBlocks,
  createTimeBlock,
  updateTimeBlock,
  deleteTimeBlock,
  fetchInteropCapability,
  fetchAppointmentsTrend,
  fetchRevenueTrend,
  fetchTopDiagnoses,
  fetchTopProcedures,
} from '../api';
import { API_BASE_URL } from '../utils/apiBase';

const tenantId = 'tenant-1';
const token = 'token-1';

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

const okResponse = (data: unknown = {}) =>
  ({ ok: true, json: vi.fn().mockResolvedValue(data) }) as Response;

describe('api.ts additional endpoints', () => {
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse({}));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates tasks and task comments', async () => {
    await createTask(tenantId, token, { title: 'Check labs' });
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/tasks`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ title: 'Check labs' }));

    await fetchTaskComments(tenantId, token, 'task-1');
    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/tasks/task-1/comments`);
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    });

    await addTaskComment(tenantId, token, 'task-1', 'Follow up');
    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/tasks/task-1/comments`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ comment: 'Follow up' }));
  });

  it.each([
    { label: 'message', fn: createMessage, path: '/api/messages' },
    { label: 'charge', fn: createCharge, path: '/api/charges' },
    { label: 'document', fn: createDocument, path: '/api/documents' },
    { label: 'photo', fn: createPhoto, path: '/api/photos' },
  ])('creates %s records', async ({ fn, path }) => {
    await fn(tenantId, token, { id: '1' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}${path}`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ id: '1' }));
  });

  it('updates vitals, encounters, and reschedules appointments', async () => {
    await updateVitals(tenantId, token, { tempC: 36.6 });
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/vitals/write`);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({ tempC: 36.6 }));

    await updateEncounterFields(tenantId, token, 'enc-1', { chiefComplaint: 'Rash' });
    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/encounters/enc-1`);
    expect(options?.body).toBe(JSON.stringify({ chiefComplaint: 'Rash' }));

    await rescheduleAppointment(tenantId, token, 'appt-1', '2024-01-01T10:00', '2024-01-01T10:30', 'prov-1');
    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/appointments/appt-1/reschedule`);
    expect(options?.body).toBe(JSON.stringify({
      scheduledStart: '2024-01-01T10:00',
      scheduledEnd: '2024-01-01T10:30',
      providerId: 'prov-1',
    }));

    await updateEncounter(tenantId, token, 'enc-2', { assessment: 'Stable' });
    [url, options] = fetchMock.mock.calls[3];
    expect(url).toBe(`${API_BASE_URL}/api/encounters/enc-2`);
    expect(options?.body).toBe(JSON.stringify({ assessment: 'Stable' }));

    await createVitals(tenantId, token, { bpSystolic: 120 });
    [url, options] = fetchMock.mock.calls[4];
    expect(url).toBe(`${API_BASE_URL}/api/vitals/write`);
    expect(options?.body).toBe(JSON.stringify({ bpSystolic: 120 }));
  });

  it.each([
    { label: 'interop capability', fn: fetchInteropCapability, path: '/api/interop/capability' },
    { label: 'appointments trend', fn: fetchAppointmentsTrend, path: '/api/analytics/appointments/trend?startDate=2024-01-01' },
    { label: 'revenue trend', fn: fetchRevenueTrend, path: '/api/analytics/revenue/trend?endDate=2024-02-01' },
    { label: 'top diagnoses', fn: fetchTopDiagnoses, path: '/api/analytics/top-diagnoses?providerId=prov-1' },
    { label: 'top procedures', fn: fetchTopProcedures, path: '/api/analytics/top-procedures?providerId=prov-1' },
  ])('fetches %s analytics data', async ({ fn, path }) => {
    const filter = path.includes('startDate')
      ? { startDate: '2024-01-01' }
      : path.includes('endDate')
        ? { endDate: '2024-02-01' }
        : path.includes('providerId')
          ? { providerId: 'prov-1' }
          : undefined;
    await fn(tenantId, token, filter as any);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}${path}`);
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    });
  });

  it('deletes fee schedule entries and surfaces errors', async () => {
    await deleteFeeSchedule(tenantId, token, 'schedule-1');
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/fee-schedules/schedule-1`);
    expect(options?.method).toBe('DELETE');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'nope' }),
    } as Response);
    await expect(deleteFeeScheduleItem(tenantId, token, 'schedule-1', '99213')).rejects.toThrow('nope');
  });

  it('handles diagnosis endpoints', async () => {
    await fetchDiagnosesByEncounter(tenantId, token, 'enc-1');
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/diagnoses/encounter/enc-1`);
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    });

    await createDiagnosis(tenantId, token, { code: 'L20' });
    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/diagnoses`);
    expect(options?.method).toBe('POST');

    await updateDiagnosis(tenantId, token, 'diag-1', { description: 'Atopic dermatitis' });
    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/diagnoses/diag-1`);
    expect(options?.method).toBe('PUT');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'bad' }),
    } as Response);
    await expect(deleteDiagnosis(tenantId, token, 'diag-1')).rejects.toThrow('bad');
  });

  it('searches ICD-10 codes', async () => {
    await searchICD10Codes(tenantId, token, 'eczema');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/diagnoses/search/icd10?q=eczema`);
  });

  it('handles charge endpoints', async () => {
    await fetchChargesByEncounter(tenantId, token, 'enc-1');
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/charges/encounter/enc-1`);
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    });

    await updateCharge(tenantId, token, 'charge-1', { units: 2 });
    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/charges/charge-1`);
    expect(options?.method).toBe('PUT');

    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'fail' }),
    } as Response);
    await expect(deleteCharge(tenantId, token, 'charge-1')).rejects.toThrow('fail');
  });

  it('searches CPT codes', async () => {
    await searchCPTCodes(tenantId, token, '11100');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/charges/search/cpt?q=11100`);
  });

  it('queries CPT and ICD libraries', async () => {
    await fetchCptCodes(tenantId, token, { search: 'skin', category: 'surgery', common_only: true });
    let [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/cpt-codes?search=skin&category=surgery&common_only=true`);

    await fetchCptCode(tenantId, token, '11100');
    [url] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/cpt-codes/11100`);

    await fetchIcd10Codes(tenantId, token, { search: 'eczema', category: 'L', common_only: true });
    [url] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/icd10-codes?search=eczema&category=L&common_only=true`);

    await fetchIcd10Code(tenantId, token, 'L20.0');
    [url] = fetchMock.mock.calls[3];
    expect(url).toBe(`${API_BASE_URL}/api/icd10-codes/L20.0`);
  });

  it('handles claims and superbill helpers', async () => {
    await fetchClaims(tenantId, token, { status: 'pending', patientId: 'patient-1' });
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/claims?status=pending&patientId=patient-1`);
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    });

    await fetchClaimDetail(tenantId, token, 'claim-1');
    [url] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/claims/claim-1`);

    await createClaim(tenantId, token, { encounterId: 'enc-1' });
    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/claims`);
    expect(options?.method).toBe('POST');

    await updateClaimStatus(tenantId, token, 'claim-1', { status: 'submitted' });
    [url, options] = fetchMock.mock.calls[3];
    expect(url).toBe(`${API_BASE_URL}/api/claims/claim-1/status`);
    expect(options?.method).toBe('PUT');
    expect(options?.body).toBe(JSON.stringify({ status: 'submitted' }));

    await postClaimPayment(tenantId, token, 'claim-1', { amount: 100 });
    [url, options] = fetchMock.mock.calls[4];
    expect(url).toBe(`${API_BASE_URL}/api/claims/claim-1/payments`);
    expect(options?.method).toBe('POST');

    expect(getSuperbillUrl(tenantId, token, 'enc-1')).toBe(
      `${API_BASE_URL}/api/encounters/enc-1/superbill?token=${token}&tenant=${tenantId}`
    );
  });

  it('fetches adaptive learning data', async () => {
    await fetchSuggestedDiagnoses(tenantId, token, 'prov-1', 5);
    let [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/adaptive/diagnoses/suggested?providerId=prov-1&limit=5`);

    await fetchSuggestedProcedures(tenantId, token, 'prov-1', 7);
    [url] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/adaptive/procedures/suggested?providerId=prov-1&limit=7`);

    await fetchProceduresForDiagnosis(tenantId, token, 'prov-1', 'L20', 3);
    [url] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/adaptive/procedures/for-diagnosis/L20?providerId=prov-1&limit=3`);

    await fetchProviderStats(tenantId, token, 'prov-1');
    [url] = fetchMock.mock.calls[3];
    expect(url).toBe(`${API_BASE_URL}/api/adaptive/stats/prov-1`);
  });

  it('manages note templates', async () => {
    await fetchNoteTemplates(tenantId, token, { category: 'clinical', providerId: 'prov-1' });
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/note-templates?category=clinical&providerId=prov-1`);
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
    });

    await fetchNoteTemplate(tenantId, token, 'tmpl-1');
    [url] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/note-templates/tmpl-1`);

    await createNoteTemplate(tenantId, token, {
      name: 'Default',
      category: 'general',
      templateContent: { chiefComplaint: 'Itchy skin' },
    });
    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/note-templates`);
    expect(options?.method).toBe('POST');

    await updateNoteTemplate(tenantId, token, 'tmpl-1', { name: 'Updated' });
    [url, options] = fetchMock.mock.calls[3];
    expect(url).toBe(`${API_BASE_URL}/api/note-templates/tmpl-1`);
    expect(options?.method).toBe('PUT');

    await deleteNoteTemplate(tenantId, token, 'tmpl-1');
    [url, options] = fetchMock.mock.calls[4];
    expect(url).toBe(`${API_BASE_URL}/api/note-templates/tmpl-1`);
    expect(options?.method).toBe('DELETE');

    await applyNoteTemplate(tenantId, token, 'tmpl-1');
    [url, options] = fetchMock.mock.calls[5];
    expect(url).toBe(`${API_BASE_URL}/api/note-templates/tmpl-1/apply`);
    expect(options?.method).toBe('POST');

    await toggleNoteTemplateFavorite(tenantId, token, 'tmpl-1');
    [url, options] = fetchMock.mock.calls[6];
    expect(url).toBe(`${API_BASE_URL}/api/note-templates/tmpl-1/favorite`);
    expect(options?.method).toBe('POST');
  });

  it('handles prior auth request flows', async () => {
    await submitPARequest(tenantId, token, 'pa-1');
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/prior-auth-requests/pa-1/submit`);
    expect(options?.method).toBe('POST');

    await checkPARequestStatus(tenantId, token, 'pa-1');
    [url] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/prior-auth-requests/pa-1/status`);

    await updatePARequest(tenantId, token, 'pa-1', { status: 'approved' });
    [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/prior-auth-requests/pa-1`);
    expect(options?.method).toBe('PATCH');
    expect(options?.body).toBe(JSON.stringify({ status: 'approved' }));
  });

  it('handles waitlist endpoints', async () => {
    await triggerWaitlistAutoFill(tenantId, token, {
      appointmentId: 'appt-1',
      providerId: 'prov-1',
      appointmentDate: '2024-01-01',
      appointmentTime: '09:00',
    });
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/waitlist/auto-fill`);
    expect(options?.method).toBe('POST');

    await notifyWaitlistPatient(tenantId, token, 'wait-1', {
      method: 'sms',
      appointmentDate: '2024-01-01',
      appointmentTime: '09:00',
      providerName: 'Dr. Test',
    });
    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/waitlist/wait-1/notify`);
    expect(options?.method).toBe('POST');

    await getWaitlistNotifications(tenantId, token, 'wait-1');
    [url] = fetchMock.mock.calls[2];
    expect(url).toBe(`${API_BASE_URL}/api/waitlist/wait-1/notifications`);

    await fillWaitlistEntry(tenantId, token, 'wait-1', 'appt-1');
    [url, options] = fetchMock.mock.calls[3];
    expect(url).toBe(`${API_BASE_URL}/api/waitlist/wait-1/fill`);
    expect(options?.body).toBe(JSON.stringify({ appointmentId: 'appt-1' }));
  });

  it('handles fax workflows', async () => {
    await fetchFaxInbox(tenantId, token, { status: 'unread', limit: 5 });
    let [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/fax/inbox?status=unread&limit=5`);

    await fetchFaxOutbox(tenantId, token, { status: 'sent', offset: 10 });
    [url] = fetchMock.mock.calls[1];
    expect(url).toBe(`${API_BASE_URL}/api/fax/outbox?status=sent&offset=10`);

    await sendFax(tenantId, token, { recipientNumber: '+15555551234', subject: 'Labs' });
    let [, options] = fetchMock.mock.calls[2];
    expect(options?.method).toBe('POST');

    await updateFax(tenantId, token, 'fax-1', { read: true });
    [, options] = fetchMock.mock.calls[3];
    expect(options?.method).toBe('PATCH');

    await deleteFax(tenantId, token, 'fax-1');
    [, options] = fetchMock.mock.calls[4];
    expect(options?.method).toBe('DELETE');

    await fetchFaxPdf(tenantId, token, 'fax-1');
    [url] = fetchMock.mock.calls[5];
    expect(url).toBe(`${API_BASE_URL}/api/fax/fax-1/pdf`);

    await fetchFaxStats(tenantId, token);
    [url] = fetchMock.mock.calls[6];
    expect(url).toBe(`${API_BASE_URL}/api/fax/meta/stats`);

    await simulateIncomingFax(tenantId, token);
    [, options] = fetchMock.mock.calls[7];
    expect(options?.method).toBe('POST');
  });

  it('manages time blocks', async () => {
    await fetchTimeBlocks(tenantId, token, { providerId: 'prov-1', startDate: '2024-01-01' });
    let [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/time-blocks?providerId=prov-1&startDate=2024-01-01`);

    await createTimeBlock(tenantId, token, {
      providerId: 'prov-1',
      title: 'Lunch',
      blockType: 'lunch',
      startTime: '2024-01-01T12:00',
      endTime: '2024-01-01T12:30',
    });
    let [, options] = fetchMock.mock.calls[1];
    expect(options?.method).toBe('POST');

    await updateTimeBlock(tenantId, token, 'block-1', { title: 'Team lunch' });
    [, options] = fetchMock.mock.calls[2];
    expect(options?.method).toBe('PATCH');

    await deleteTimeBlock(tenantId, token, 'block-1');
    [, options] = fetchMock.mock.calls[3];
    expect(options?.method).toBe('DELETE');
  });
});
