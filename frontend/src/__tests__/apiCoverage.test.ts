import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import * as api from '../api';

const tenantId = 'tenant-1';
const token = 'token-1';
const file = new File(['file'], 'test.txt', { type: 'text/plain' });
const audioFile = new File(['audio'], 'audio.wav', { type: 'audio/wav' });

const okResponse = {
  ok: true,
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  blob: vi.fn().mockResolvedValue(new Blob(['data'])),
} as Response;

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

describe('api coverage expansion', () => {
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse);
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('covers recalls, prior auth, and refill endpoints', async () => {
    await api.fetchRecallCampaigns(tenantId, token);
    await api.createRecallCampaign(tenantId, token, { name: 'Skin', recallType: 'annual', intervalMonths: 12 });
    await api.updateRecallCampaign(tenantId, token, 'camp-1', { isActive: false });
    await api.deleteRecallCampaign(tenantId, token, 'camp-1');
    await api.generateRecalls(tenantId, token, 'camp-1');
    await api.generateAllRecalls(tenantId, token);
    await api.fetchDueRecalls(tenantId, token, { startDate: '2024-01-01', endDate: '2024-02-01', campaignId: 'camp-1', status: 'pending' });
    await api.createPatientRecall(tenantId, token, { patientId: 'pat-1', dueDate: '2024-02-02', notes: 'note' });
    await api.updateRecallStatus(tenantId, token, 'recall-1', { status: 'contacted', notes: 'left voicemail' });
    await api.recordRecallContact(tenantId, token, 'recall-1', { contactMethod: 'phone', notes: 'call' });
    await api.fetchRecallHistory(tenantId, token, { patientId: 'pat-1', campaignId: 'camp-1', startDate: '2024-01-01', endDate: '2024-02-01', limit: 10 });
    await api.fetchRecallStats(tenantId, token, { campaignId: 'camp-1', startDate: '2024-01-01', endDate: '2024-02-01' });
    await api.exportRecalls(tenantId, token, { campaignId: 'camp-1', status: 'pending' });

    await api.submitPriorAuth(tenantId, token, 'pa-1');
    await api.uploadPriorAuthDocument(tenantId, token, 'pa-1', file, 'support', 'notes');
    await api.checkPriorAuthStatus(tenantId, token, 'pa-1');
    await api.fetchPriorAuths(tenantId, token, { status: 'pending', patientId: 'pat-1' });
    await api.fetchPriorAuth(tenantId, token, 'pa-1');
    await api.createPriorAuth(tenantId, token, { patientId: 'pat-1', medicationName: 'Rx' });
    await api.updatePriorAuth(tenantId, token, 'pa-1', { status: 'approved' });
    await api.createPARequest(tenantId, token, { patientId: 'pat-1', payer: 'payer', memberId: 'member' });
    await api.fetchPARequests(tenantId, token);
    await api.fetchPARequest(tenantId, token, 'req-1');

    await api.fetchRefillRequests(tenantId, token, { status: 'open', patientId: 'pat-1' });
    await api.denyRefill(tenantId, token, 'rx-1', 'duplicate');
    await api.requestMedicationChange(tenantId, token, 'rx-1', { changeType: 'dose', details: 'adjust' });
    await api.confirmAudit(tenantId, token, 'rx-1');
  });

  it('covers notes, claims, and quality reporting endpoints', async () => {
    await api.fetchNotes(tenantId, token, { status: 'draft', providerId: 'prov-1', startDate: '2024-01-01', endDate: '2024-02-01', patientId: 'pat-1' });
    await api.bulkFinalizeNotes(tenantId, token, ['note-1']);
    await api.bulkAssignNotes(tenantId, token, ['note-1'], 'prov-2');
    await api.signNote(tenantId, token, 'note-1');
    await api.addNoteAddendum(tenantId, token, 'note-1', 'addendum');
    await api.fetchNoteAddendums(tenantId, token, 'note-1');
    await api.generateAiNoteDraft(tenantId, token, { patientId: 'pat-1', briefNotes: 'AI note' });

    await api.submitClaimToClearinghouse(tenantId, token, 'claim-1');
    await api.fetchClaimStatus(tenantId, token, 'claim-1');
    await api.fetchRemittanceAdvice(tenantId, token, { payer: 'payer', startDate: '2024-01-01', endDate: '2024-02-01' });
    await api.postERA(tenantId, token, 'era-1');
    await api.fetchEFTTransactions(tenantId, token, { payer: 'payer', startDate: '2024-01-01', endDate: '2024-02-01' });
    await api.reconcilePayments(tenantId, token, { eraId: 'era-1', eftId: 'eft-1', notes: 'reconciled' });
    await api.fetchClosingReport(tenantId, token, { startDate: '2024-02-01', endDate: '2024-02-02' });
    await api.fetchERADetails(tenantId, token, 'era-1');

    await api.fetchQualityMeasures(tenantId, token, { category: 'mips', specialty: 'derm', active: true });
    await api.fetchMeasurePerformance(tenantId, token, { providerId: 'prov-1', measureId: 'measure-1', startDate: '2024-01-01', endDate: '2024-02-01', year: 2024, quarter: 1 });
    await api.submitMIPSData(tenantId, token, { year: 2024, quarter: 1, measures: [] });
    await api.fetchMIPSReport(tenantId, token, 2024, 1, 'prov-1');
    await api.fetchPQRSReport(tenantId, token, 2024, 'prov-1');
    await api.fetchGapClosureList(tenantId, token, { measureId: 'measure-1', providerId: 'prov-1', status: 'open', priority: 'high' });
    await api.closeQualityGap(tenantId, token, 'gap-1', 'closed');
    await api.recalculateQualityMeasures(tenantId, token, { providerId: 'prov-1', measureId: 'measure-1', startDate: '2024-01-01', endDate: '2024-02-01' });
  });

  it('covers messaging, telehealth, and ambient workflows', async () => {
    await api.fetchSMSTemplates(tenantId, token, { category: 'reminder', activeOnly: true });
    await api.createSMSTemplate(tenantId, token, { name: 'Template', messageBody: 'Hello' });
    await api.updateSMSTemplate(tenantId, token, 'tmpl-1', { name: 'Update', messageBody: 'Body' });
    await api.deleteSMSTemplate(tenantId, token, 'tmpl-1');
    await api.sendBulkSMS(tenantId, token, { patientIds: ['pat-1'], messageBody: 'Hello' });
    await api.fetchScheduledMessages(tenantId, token, 'scheduled');
    await api.createScheduledMessage(tenantId, token, { patientId: 'pat-1', messageBody: 'Reminder', scheduledSendTime: '2024-02-02T10:00:00Z' });
    await api.cancelScheduledMessage(tenantId, token, 'sched-1');
    await api.fetchSMSConversations(tenantId, token);
    await api.fetchSMSConversation(tenantId, token, 'conv-1');
    await api.sendSMSConversationMessage(tenantId, token, 'conv-1', 'Hello');
    await api.markSMSConversationRead(tenantId, token, 'conv-1');

    await api.createTelehealthSession(tenantId, token, { patientId: 1, providerId: 1, patientState: 'TX' });
    await api.fetchTelehealthSession(tenantId, token, 1);
    await api.fetchTelehealthSessions(tenantId, token, { status: 'active', providerId: '1' });
    await api.updateSessionStatus(tenantId, token, 1, 'active');
    await api.joinWaitingRoom(tenantId, token, { sessionId: 1, patientId: 1 });
    await api.updateEquipmentCheck(tenantId, token, 1, { camera: true, microphone: true, speaker: true, bandwidth: true, browser: true });
    await api.sendWaitingRoomChat(tenantId, token, 1, { sender: 'staff', message: 'Hi' });
    await api.fetchWaitingRoom(tenantId, token);
    await api.callPatientFromWaitingRoom(tenantId, token, 1);
    await api.saveSessionNotes(tenantId, token, 1, { chiefComplaint: 'Note' });
    await api.fetchSessionNotes(tenantId, token, 1);
    await api.finalizeSessionNotes(tenantId, token, 1);
    await api.reportQualityMetrics(tenantId, token, 1, { participantType: 'patient', audioQuality: 'good' });
    await api.fetchSessionMetrics(tenantId, token, 1);
    await api.startSessionRecording(tenantId, token, 1);
    await api.stopSessionRecording(tenantId, token, 1);
    await api.fetchSessionRecordings(tenantId, token, 1);
    await api.captureSessionPhoto(tenantId, token, 1, { filePath: 's3://photo', bodySite: 'arm' });
    await api.fetchSessionPhotos(tenantId, token, 1);
    await api.fetchSessionEvents(tenantId, token, 1);
    await api.logSessionEvent(tenantId, token, 1, { eventType: 'join', eventData: { details: 'joined' } });

    await api.startAmbientRecording(tenantId, token, { patientId: 'pat-1', providerId: 'prov-1', consentObtained: true });
    await api.uploadAmbientRecording(tenantId, token, 'rec-1', audioFile, 120);
    await api.fetchAmbientRecordings(tenantId, token, { patientId: 'pat-1', status: 'uploaded', limit: 5 });
    await api.fetchAmbientRecording(tenantId, token, 'rec-1');
    await api.transcribeAmbientRecording(tenantId, token, 'rec-1');
    await api.fetchAmbientTranscript(tenantId, token, 'trans-1');
    await api.fetchRecordingTranscript(tenantId, token, 'rec-1');
    await api.generateAmbientNote(tenantId, token, 'trans-1');
    await api.fetchAmbientNote(tenantId, token, 'note-1');
    await api.fetchEncounterAmbientNotes(tenantId, token, 'enc-1');
    await api.updateAmbientNote(tenantId, token, 'note-1', { chiefComplaint: 'rash', editReason: 'fix' });
    await api.reviewAmbientNote(tenantId, token, 'note-1', 'approve', 'ok');
    await api.applyAmbientNoteToEncounter(tenantId, token, 'note-1');
    await api.fetchAmbientNoteEdits(tenantId, token, 'note-1');
    await api.deleteAmbientRecording(tenantId, token, 'rec-1');
  });

  it('covers AI configs, inventory, registry, and referrals', async () => {
    await api.fetchAIAgentConfigs(tenantId, token);
    await api.fetchAIAgentConfig(tenantId, token, 'cfg-1');
    await api.fetchDefaultAIAgentConfig(tenantId, token);
    await api.fetchAIAgentConfigForAppointmentType(tenantId, token, 'type-1');
    await api.createAIAgentConfig(tenantId, token, { name: 'Config', aiModel: 'gpt', temperature: 0.2, systemPrompt: 'sys', promptTemplate: 'tpl', noteSections: ['HPI', 'Assessment'] });
    await api.updateAIAgentConfig(tenantId, token, 'cfg-1', { name: 'Update' });
    await api.deleteAIAgentConfig(tenantId, token, 'cfg-1');
    await api.cloneAIAgentConfig(tenantId, token, 'cfg-1');
    await api.fetchAIAgentConfigVersions(tenantId, token, 'cfg-1');
    await api.fetchAIAgentConfigAnalytics(tenantId, token, { configId: 'cfg-1', providerId: 'prov-1', startDate: '2024-01-01', endDate: '2024-01-31' });
    await api.testAIAgentConfig(tenantId, token, 'cfg-1', 'Test transcript');

    await api.fetchInventoryItems(tenantId, token);
    await api.fetchInventoryItem(tenantId, token, 'item-1');
    await api.createInventoryItem(tenantId, token, { name: 'Item', sku: 'SKU', unit: 'ea', quantity: 1, reorderThreshold: 1 });
    await api.updateInventoryItem(tenantId, token, 'item-1', { quantity: 2 });
    await api.deleteInventoryItem(tenantId, token, 'item-1');
    await api.adjustInventory(tenantId, token, { itemId: 'item-1', adjustmentQuantity: 1, reason: 'adjustment' });
    await api.fetchInventoryAdjustments(tenantId, token, 'item-1');
    await api.fetchInventoryUsage(tenantId, token, 'item-1');
    await api.fetchInventoryStats(tenantId, token);
    await api.recordInventoryUsage(tenantId, token, { itemId: 'item-1', patientId: 'pat-1', providerId: 'prov-1', quantityUsed: 1 });
    await api.fetchAllInventoryUsage(tenantId, token, { patientId: 'pat-1', appointmentId: 'appt-1', limit: 10 });
    await api.deleteInventoryUsage(tenantId, token, 'usage-1');

    await api.fetchRegistryCohorts(tenantId, token);
    await api.createRegistryCohort(tenantId, token, { name: 'Cohort', status: 'active', criteria: {} });
    await api.updateRegistryCohort(tenantId, token, 'cohort-1', { status: 'inactive' });
    await api.deleteRegistryCohort(tenantId, token, 'cohort-1');
    await api.fetchRegistryMembers(tenantId, token, 'cohort-1');
    await api.addRegistryMember(tenantId, token, 'cohort-1', 'pat-1');
    await api.removeRegistryMember(tenantId, token, 'cohort-1', 'pat-1');

    await api.fetchReferrals(tenantId, token, { direction: 'incoming', status: 'new' });
    await api.createReferral(tenantId, token, { patientId: 'pat-1', direction: 'outgoing', priority: 'routine' });
    await api.updateReferral(tenantId, token, 'ref-1', { status: 'scheduled' });
  });
});
