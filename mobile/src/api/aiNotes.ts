import client from './client';
import { Recording, Transcript, ClinicalNote, NoteEdit } from '../types';

const POLL_INTERVAL_MS = 1000;
const POLL_ATTEMPTS = 60;

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const aiNotesApi = {
  // Start a new recording session
  async startRecording(data: {
    patientId: string;
    providerId: string;
    encounterId?: string;
    consentObtained: boolean;
    consentMethod: 'verbal' | 'written' | 'electronic';
  }): Promise<Recording> {
    const response = await client.post('/api/ambient/recordings/start', data);
    return response.data;
  },

  // Upload audio recording
  async uploadRecording(
    recordingId: string,
    audioUri: string,
    durationSeconds: number
  ): Promise<{ transcriptId: string | null; transcriptionStatus: string }> {
    const formData = new FormData();
    
    const audioFile: any = {
      uri: audioUri,
      type: 'audio/m4a',
      name: `recording-${recordingId}.m4a`,
    };
    
    formData.append('audio', audioFile);
    formData.append('durationSeconds', durationSeconds.toString());

    const response = await client.post(`/api/ambient/recordings/${recordingId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return {
      transcriptId: response.data.transcriptId || null,
      transcriptionStatus: response.data.transcriptionStatus || 'failed',
    };
  },

  // Transcribe uploaded recording
  async transcribeRecording(recordingId: string): Promise<Pick<Transcript, 'id'>> {
    const response = await client.post(`/api/ambient/recordings/${recordingId}/transcribe`);
    return { id: response.data.transcriptId || response.data.id };
  },

  // Get transcript by ID
  async getTranscript(transcriptId: string): Promise<Transcript> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      const response = await client.get(`/api/ambient/transcripts/${transcriptId}`);
      const transcript = response.data.transcript;
      const status = transcript.transcriptionStatus || transcript.status;

      if (status === 'completed') {
        return {
          ...transcript,
          segments: transcript.transcriptSegments || transcript.segments || [],
          status,
        };
      }
      if (status === 'failed' || status === 'error') {
        throw new Error('Transcription failed');
      }
      await wait(POLL_INTERVAL_MS);
    }
    throw new Error('Transcription timed out');
  },

  // Generate clinical note from transcript
  async generateNote(transcriptId: string): Promise<ClinicalNote> {
    const response = await client.post(`/api/ambient/transcripts/${transcriptId}/generate-note`);
    const noteId = response.data.noteId;
    if (!noteId) {
      throw new Error('Note generation did not return a note ID');
    }

    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      const note = await aiNotesApi.getNote(noteId);
      const status = (note as ClinicalNote & { generationStatus?: string }).generationStatus;
      if (status === 'completed') {
        return note;
      }
      if (status === 'failed' || status === 'error') {
        throw new Error('Note generation failed');
      }
      await wait(POLL_INTERVAL_MS);
    }
    throw new Error('Note generation timed out');
  },

  // Get clinical note by ID
  async getNote(noteId: string): Promise<ClinicalNote> {
    const response = await client.get(`/api/ambient/notes/${noteId}`);
    return response.data.note;
  },

  // Update/edit a note section
  async updateNote(
    noteId: string,
    updates: Partial<ClinicalNote>,
    edits: NoteEdit[]
  ): Promise<void> {
    await client.patch(`/api/ambient/notes/${noteId}`, {
      updates,
      edits,
    });
  },

  // Approve or reject a note
  async reviewNote(
    noteId: string,
    action: 'approve' | 'reject',
    comments?: string
  ): Promise<void> {
    await client.post(`/api/ambient/notes/${noteId}/review`, {
      action,
      comments,
    });
  },

  // Apply note to encounter/chart
  async applyToEncounter(noteId: string, encounterId: string): Promise<void> {
    await client.post(`/api/ambient/notes/${noteId}/apply-to-encounter`, {
      encounterId,
    });
  },

  // Get all recordings
  async getRecordings(params?: {
    patientId?: string;
    status?: string;
    limit?: number;
  }): Promise<Recording[]> {
    const response = await client.get('/api/ambient/recordings', { params });
    return response.data.recordings || response.data;
  },

  // Delete recording
  async deleteRecording(recordingId: string): Promise<void> {
    await client.delete(`/api/ambient/recordings/${recordingId}`);
  },
};

export default aiNotesApi;
