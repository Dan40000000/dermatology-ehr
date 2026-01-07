export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  mrn?: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  providerId: string;
  status: string;
  chiefComplaint?: string;
  hpi?: string;
  ros?: string;
  exam?: string;
  assessmentPlan?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  speaker: 'doctor' | 'patient';
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface ClinicalNote {
  id: string;
  encounterId?: string;
  transcriptId: string;
  chiefComplaint: string;
  hpi: string;
  ros: string;
  physicalExam: string;
  assessment: string;
  plan: string;
  overallConfidence: number;
  sectionConfidence: {
    chiefComplaint: number;
    hpi: number;
    ros: number;
    physicalExam: number;
    assessment: number;
    plan: number;
  };
  suggestedIcd10Codes: Array<{
    code: string;
    description: string;
    confidence: number;
  }>;
  suggestedCptCodes: Array<{
    code: string;
    description: string;
    confidence: number;
  }>;
  mentionedMedications: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
  }>;
  mentionedAllergies: string[];
  followUpTasks: string[];
  reviewStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface Recording {
  id: string;
  patientId: string;
  providerId: string;
  encounterId?: string;
  status: 'recording' | 'uploaded' | 'transcribing' | 'transcribed' | 'error';
  durationSeconds: number;
  filePath?: string;
  consentObtained: boolean;
  consentMethod: 'verbal' | 'written' | 'electronic';
  createdAt: string;
}

export interface Transcript {
  id: string;
  recordingId: string;
  transcriptText: string;
  segments: TranscriptionSegment[];
  speakers: string[];
  speakerCount: number;
  confidenceScore: number;
  status: 'processing' | 'completed' | 'error';
  createdAt: string;
}

export interface NoteEdit {
  section: string;
  previousValue: string;
  newValue: string;
  editReason?: string;
}
