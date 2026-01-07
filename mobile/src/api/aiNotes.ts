import client from './client';
import { Recording, Transcript, ClinicalNote, NoteEdit } from '../types';

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
  ): Promise<void> {
    const formData = new FormData();
    
    const audioFile: any = {
      uri: audioUri,
      type: 'audio/m4a',
      name: `recording-${recordingId}.m4a`,
    };
    
    formData.append('audio', audioFile);
    formData.append('durationSeconds', durationSeconds.toString());

    await client.post(`/api/ambient/recordings/${recordingId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Transcribe uploaded recording
  async transcribeRecording(recordingId: string): Promise<Transcript> {
    const response = await client.post(`/api/ambient/recordings/${recordingId}/transcribe`);
    return response.data;
  },

  // Get transcript by ID
  async getTranscript(transcriptId: string): Promise<Transcript> {
    const response = await client.get(`/api/ambient/transcripts/${transcriptId}`);
    return response.data;
  },

  // Generate clinical note from transcript
  async generateNote(transcriptId: string): Promise<ClinicalNote> {
    const response = await client.post(`/api/ambient/transcripts/${transcriptId}/generate-note`);
    return response.data;
  },

  // Get clinical note by ID
  async getNote(noteId: string): Promise<ClinicalNote> {
    const response = await client.get(`/api/ambient/notes/${noteId}`);
    return response.data;
  },

  // Update/edit a note section
  async updateNote(
    noteId: string,
    updates: Partial<ClinicalNote>,
    edits: NoteEdit[]
  ): Promise<ClinicalNote> {
    const response = await client.patch(`/api/ambient/notes/${noteId}`, {
      updates,
      edits,
    });
    return response.data;
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
