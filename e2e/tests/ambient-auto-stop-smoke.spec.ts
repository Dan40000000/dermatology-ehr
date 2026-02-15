import { test, expect } from '../fixtures/auth.fixture';

test.describe('Ambient Auto-Stop Smoke', () => {
  test('recording auto-stops when encounter closes and formal summary flow stays connected', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/home');
    await expect(authenticatedPage).toHaveURL(/\/home/i);

    const flow = await authenticatedPage.evaluate(async () => {
      const safeJson = async <T extends Record<string, unknown>>(
        response: Response | null
      ): Promise<T | null> => {
        if (!response) return null;
        const text = await response.text();
        if (!text) return {} as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return {} as T;
        }
      };

      const startResponse = await fetch('/api/ambient/recordings/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encounterId: 'encounter-smoke-1',
          patientId: 'patient-smoke-1',
          providerId: 'provider-smoke-1',
          consentObtained: true,
          consentMethod: 'verbal',
        }),
      });
      const startPayload = ((await safeJson<{ recordingId?: string }>(startResponse)) || {}) as {
        recordingId?: string;
      };
      const recordingId = startPayload.recordingId || '';

      const listBeforeResponse = await fetch('/api/ambient/recordings?encounterId=encounter-smoke-1&status=recording');
      const listBeforePayload = ((await safeJson<{ recordings?: Array<{ id: string }> }>(listBeforeResponse)) || {}) as {
        recordings?: Array<{ id: string }>;
      };

      const closeResponse = recordingId
        ? await fetch('/api/encounters/encounter-smoke-1/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'signed' }),
          })
        : null;

      const stoppedDetailResponse = recordingId
        ? await fetch(`/api/ambient/recordings/${recordingId}`)
        : null;
      const stoppedDetail = stoppedDetailResponse
        ? ((await safeJson<{ recording?: { status?: string } }>(stoppedDetailResponse)) || {}) as {
            recording?: { status?: string };
          }
        : null;

      const uploadResult = (() => {
        if (!recordingId) return Promise.resolve({ status: 0 });
        const formData = new FormData();
        const blob = new Blob(['mock-audio-chunk'], { type: 'audio/webm' });
        formData.append('audio', blob, 'ambient-smoke.webm');
        formData.append('durationSeconds', '320');
        return fetch(`/api/ambient/recordings/${recordingId}/upload`, {
          method: 'POST',
          body: formData,
        });
      })();
      const uploadResponse = await uploadResult;

      const transcribeResponse = recordingId
        ? await fetch(`/api/ambient/recordings/${recordingId}/transcribe`, { method: 'POST' })
        : null;
      const transcribePayload = transcribeResponse
        ? ((await safeJson<{ transcriptId?: string }>(transcribeResponse)) || {}) as { transcriptId?: string }
        : null;
      const transcriptId = transcribePayload?.transcriptId || '';

      const generateResponse = transcriptId
        ? await fetch(`/api/ambient/transcripts/${transcriptId}/generate-note`, { method: 'POST' })
        : null;
      const generatePayload = generateResponse
        ? ((await safeJson<{ noteId?: string }>(generateResponse)) || {}) as { noteId?: string }
        : null;
      const noteId = generatePayload?.noteId || '';

      const noteResponse = noteId ? await fetch(`/api/ambient/notes/${noteId}`) : null;
      const notePayload = noteResponse
        ? ((await safeJson<{
            note?: {
              noteContent?: {
                formalAppointmentSummary?: {
                  probableDiagnoses?: Array<{ probabilityPercent?: number }>;
                  suggestedTests?: Array<{ testName?: string }>;
                };
              };
            };
          }>(noteResponse)) || {}) as {
            note?: {
              noteContent?: {
                formalAppointmentSummary?: {
                  probableDiagnoses?: Array<{ probabilityPercent?: number }>;
                  suggestedTests?: Array<{ testName?: string }>;
                };
              };
            };
          }
        : null;

      const encounterNotesResponse = await fetch('/api/ambient/encounters/encounter-smoke-1/notes');
      const encounterNotesPayload = ((await safeJson<{ notes?: Array<{ id: string }> }>(encounterNotesResponse)) || {}) as {
        notes?: Array<{ id: string }>;
      };

      return {
        startCode: startResponse.status,
        recordingId,
        listRecordingCount: (listBeforePayload.recordings || []).length,
        closeCode: closeResponse?.status ?? 0,
        recordingStatusAfterClose: stoppedDetail?.recording?.status || '',
        uploadCode: uploadResponse.status,
        transcribeCode: transcribeResponse?.status ?? 0,
        transcriptId,
        generateCode: generateResponse?.status ?? 0,
        noteId,
        hasFormalSummary: Boolean(notePayload?.note?.noteContent?.formalAppointmentSummary),
        probableDiagnosisPercent:
          notePayload?.note?.noteContent?.formalAppointmentSummary?.probableDiagnoses?.[0]?.probabilityPercent ?? 0,
        suggestedTestName:
          notePayload?.note?.noteContent?.formalAppointmentSummary?.suggestedTests?.[0]?.testName || '',
        encounterNoteCount: (encounterNotesPayload.notes || []).length,
      };
    });

    expect(flow.startCode).toBe(201);
    expect(flow.recordingId).not.toBe('');
    expect(flow.listRecordingCount).toBeGreaterThan(0);
    expect(flow.closeCode).toBe(200);
    expect(flow.recordingStatusAfterClose).toBe('stopped');
    expect(flow.uploadCode).toBe(200);
    expect(flow.transcribeCode).toBe(200);
    expect(flow.transcriptId).not.toBe('');
    expect(flow.generateCode).toBe(200);
    expect(flow.noteId).not.toBe('');
    expect(flow.hasFormalSummary).toBe(true);
    expect(flow.probableDiagnosisPercent).toBeGreaterThan(0);
    expect(flow.suggestedTestName).not.toBe('');
    expect(flow.encounterNoteCount).toBeGreaterThan(0);
  });
});
