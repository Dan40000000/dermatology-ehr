import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { TEST_USERS } from './testData';

type AuthFixtures = {
  authenticatedPage: Page;
  loginPage: LoginPage;
};

const SEEDED_PROVIDER = {
  id: 'provider-smoke-1',
  fullName: 'Dr. Smoke Test',
};

const SEEDED_LOCATION = {
  id: 'location-smoke-1',
  name: 'Main Clinic',
};

const SEEDED_APPOINTMENT_TYPE = {
  id: 'appt-type-smoke-1',
  name: 'Follow-up',
  durationMinutes: 30,
};

const SEEDED_PATIENT = {
  id: 'patient-smoke-1',
  firstName: 'Smoke',
  lastName: 'Patient',
  dateOfBirth: '1985-01-01',
  phone: '5550101000',
  email: 'smoke.patient@example.com',
  mrn: 'SMK001',
};

async function installMockDataRoutes(page: Page) {
  const seededAppointmentId = 'appointment-smoke-1';
  const seededAppointmentStart = new Date();
  seededAppointmentStart.setHours(9, 0, 0, 0);
  const seededAppointmentEnd = new Date(
    seededAppointmentStart.getTime() + SEEDED_APPOINTMENT_TYPE.durationMinutes * 60 * 1000
  );

  const appointmentState = {
    appointments: [
      {
        id: seededAppointmentId,
        tenantId: 'tenant-demo',
        patientId: SEEDED_PATIENT.id,
        providerId: SEEDED_PROVIDER.id,
        appointmentTypeId: SEEDED_APPOINTMENT_TYPE.id,
        locationId: SEEDED_LOCATION.id,
        scheduledStart: seededAppointmentStart.toISOString(),
        scheduledEnd: seededAppointmentEnd.toISOString(),
        status: 'scheduled',
        notes: 'Seeded smoke appointment',
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        providerName: SEEDED_PROVIDER.fullName,
        appointmentTypeName: SEEDED_APPOINTMENT_TYPE.name,
        locationName: SEEDED_LOCATION.name,
        createdAt: seededAppointmentStart.toISOString(),
        updatedAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      tenantId: string;
      patientId: string;
      providerId: string;
      appointmentTypeId: string;
      locationId: string;
      scheduledStart: string;
      scheduledEnd: string;
      status: string;
      notes?: string;
      patientName: string;
      providerName: string;
      appointmentTypeName: string;
      locationName: string;
      createdAt: string;
      updatedAt: string;
    }>,
  };

  const referralState = {
    referrals: [
      {
        id: 'referral-smoke-1',
        patientId: SEEDED_PATIENT.id,
        patientFirstName: SEEDED_PATIENT.firstName,
        patientLastName: SEEDED_PATIENT.lastName,
        direction: 'outgoing',
        status: 'new',
        priority: 'routine',
        referringProvider: SEEDED_PROVIDER.fullName,
        referringOrganization: 'Main Clinic',
        referredToProvider: 'Dr. Specialist',
        referredToOrganization: 'Specialty Group',
        appointmentId: seededAppointmentId,
        reason: 'Baseline dermatology referral',
        notes: 'Seeded referral for smoke tests',
        createdAt: seededAppointmentStart.toISOString(),
        updatedAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      patientId: string;
      patientFirstName?: string;
      patientLastName?: string;
      direction: 'incoming' | 'outgoing';
      status: 'new' | 'scheduled' | 'in_progress' | 'completed' | 'declined' | 'cancelled';
      priority: 'routine' | 'urgent' | 'stat';
      referringProvider?: string;
      referringOrganization?: string;
      referredToProvider?: string;
      referredToOrganization?: string;
      appointmentId?: string;
      reason?: string;
      notes?: string;
      createdAt?: string;
      updatedAt?: string;
    }>,
  };

  const claimState = {
    claim: {
      id: 'claim-smoke-1',
      tenantId: 'tenant-demo',
      patientId: SEEDED_PATIENT.id,
      claimNumber: 'CLM-SMOKE-001',
      totalCents: 20000,
      status: 'submitted',
      payer: 'Demo Payer',
      providerName: SEEDED_PROVIDER.fullName,
      insurancePlanName: 'Demo Plan PPO',
      dob: SEEDED_PATIENT.dateOfBirth,
      createdAt: '2026-02-14T00:00:00.000Z',
      updatedAt: '2026-02-14T00:00:00.000Z',
    },
    diagnoses: [
      {
        id: 'diag-smoke-1',
        icd10Code: 'L30.9',
        description: 'Dermatitis, unspecified',
        isPrimary: true,
      },
    ],
    charges: [
      {
        id: 'charge-smoke-1',
        cptCode: '99213',
        description: 'Office/outpatient visit, established',
        quantity: 1,
        feeCents: 20000,
      },
    ],
    payments: [] as Array<{
      id: string;
      tenantId: string;
      claimId: string;
      amountCents: number;
      paymentDate: string;
      paymentMethod?: string;
      payer?: string;
      checkNumber?: string;
      notes?: string;
      createdAt: string;
    }>,
    statusHistory: [
      {
        id: 'claim-history-smoke-1',
        tenantId: 'tenant-demo',
        claimId: 'claim-smoke-1',
        status: 'submitted',
        changedAt: '2026-02-14T00:00:00.000Z',
        notes: 'Initial claim state',
      },
    ] as Array<{
      id: string;
      tenantId: string;
      claimId: string;
      status: string;
      changedAt: string;
      notes?: string;
    }>,
  };

  const encounterState = {
    encounters: [
      {
        id: 'encounter-smoke-1',
        patientId: SEEDED_PATIENT.id,
        providerId: SEEDED_PROVIDER.id,
        appointmentId: seededAppointmentId,
        status: 'draft',
        chiefComplaint: '',
        hpi: '',
        ros: '',
        exam: '',
        assessmentPlan: '',
        createdAt: seededAppointmentStart.toISOString(),
        updatedAt: seededAppointmentStart.toISOString(),
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        providerName: SEEDED_PROVIDER.fullName,
      },
    ] as Array<{
      id: string;
      patientId: string;
      providerId: string;
      appointmentId?: string;
      status: string;
      chiefComplaint?: string;
      hpi?: string;
      ros?: string;
      exam?: string;
      assessmentPlan?: string;
      createdAt: string;
      updatedAt: string;
      patientName: string;
      providerName: string;
    }>,
  };

  const ambientState = {
    recordings: [] as Array<{
      id: string;
      encounterId?: string;
      patientId: string;
      providerId: string;
      status: 'recording' | 'stopped' | 'completed' | 'failed';
      durationSeconds: number;
      consentObtained: boolean;
      consentMethod?: 'verbal' | 'written' | 'electronic';
      startedAt: string;
      completedAt?: string;
      createdAt: string;
      patientName: string;
      providerName: string;
    }>,
    transcripts: [] as Array<{
      id: string;
      recordingId: string;
      encounterId?: string;
      transcriptText: string;
      transcriptSegments: Array<{
        speaker: string;
        text: string;
        start: number;
        end: number;
        confidence: number;
      }>;
      language: string;
      speakers: Record<string, unknown>;
      speakerCount: number;
      confidenceScore: number;
      wordCount: number;
      phiMasked: boolean;
      transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
      createdAt: string;
      completedAt?: string;
    }>,
    notes: [] as Array<{
      id: string;
      transcriptId: string;
      encounterId?: string;
      patientId: string;
      providerId: string;
      chiefComplaint: string;
      hpi: string;
      ros: string;
      physicalExam: string;
      assessment: string;
      plan: string;
      suggestedIcd10Codes: Array<{ code: string; description: string; confidence: number }>;
      suggestedCptCodes: Array<{ code: string; description: string; confidence: number }>;
      mentionedMedications: Array<{ name: string; dosage: string; frequency: string; confidence: number }>;
      mentionedAllergies: Array<{ allergen: string; reaction: string; confidence: number }>;
      followUpTasks: Array<{ task: string; priority: string; dueDate?: string; confidence: number }>;
      differentialDiagnoses: Array<{ condition: string; confidence: number; reasoning: string; icd10Code: string }>;
      recommendedTests: Array<{ testName: string; rationale: string; urgency: 'routine' | 'soon' | 'urgent'; cptCode?: string }>;
      noteContent: {
        formalAppointmentSummary: {
          symptoms: string[];
          probableDiagnoses: Array<{
            condition: string;
            probabilityPercent: number;
            reasoning: string;
            icd10Code: string;
          }>;
          suggestedTests: Array<{
            testName: string;
            urgency: 'routine' | 'soon' | 'urgent';
            rationale: string;
            cptCode?: string;
          }>;
        };
        patientSummary: {
          whatWeDiscussed: string;
          yourConcerns: string[];
          diagnosis: string;
          treatmentPlan: string;
          followUp: string;
        };
      };
      overallConfidence: number;
      sectionConfidence: Record<string, number>;
      reviewStatus: 'pending' | 'approved' | 'rejected';
      generationStatus: 'pending' | 'processing' | 'completed' | 'failed';
      createdAt: string;
      completedAt?: string;
    }>,
  };

  const encounterClosureStatuses = new Set(['closed', 'completed', 'signed', 'locked', 'finalized']);

  const autoStopAmbientRecordings = (encounterId: string) => {
    const completedAt = new Date().toISOString();
    ambientState.recordings.forEach((recording) => {
      if (recording.encounterId === encounterId && recording.status === 'recording') {
        recording.status = 'stopped';
        recording.completedAt = recording.completedAt || completedAt;
        recording.durationSeconds = Math.max(recording.durationSeconds || 0, 1);
      }
    });
  };

  const ensureAmbientTranscript = (recordingId: string) => {
    const existing = ambientState.transcripts.find((item) => item.recordingId === recordingId);
    if (existing) return existing;

    const recording = ambientState.recordings.find((item) => item.id === recordingId);
    if (!recording) return null;

    const now = new Date().toISOString();
    const transcript = {
      id: `ambient-transcript-smoke-${ambientTranscriptCounter++}`,
      recordingId: recording.id,
      encounterId: recording.encounterId,
      transcriptText: 'Patient reports itchy rash on forearms that worsened after new detergent exposure.',
      transcriptSegments: [
        { speaker: 'speaker_0', text: 'What brings you in today?', start: 0, end: 4, confidence: 0.94 },
        { speaker: 'speaker_1', text: 'I have an itchy rash on both forearms.', start: 4, end: 10, confidence: 0.92 },
      ],
      language: 'en',
      speakers: {
        speaker_0: { label: 'doctor', name: SEEDED_PROVIDER.fullName },
        speaker_1: { label: 'patient' },
      },
      speakerCount: 2,
      confidenceScore: 0.91,
      wordCount: 14,
      phiMasked: false,
      transcriptionStatus: 'completed' as const,
      createdAt: now,
      completedAt: now,
    };

    ambientState.transcripts.unshift(transcript);
    return transcript;
  };

  const ensureAmbientNote = (transcriptId: string) => {
    const existing = ambientState.notes.find((item) => item.transcriptId === transcriptId);
    if (existing) return existing;

    const transcript = ambientState.transcripts.find((item) => item.id === transcriptId);
    if (!transcript) return null;
    const recording = ambientState.recordings.find((item) => item.id === transcript.recordingId);
    if (!recording) return null;

    const now = new Date().toISOString();
    const note = {
      id: `ambient-note-smoke-${ambientNoteCounter++}`,
      transcriptId: transcript.id,
      encounterId: transcript.encounterId,
      patientId: recording.patientId,
      providerId: recording.providerId,
      chiefComplaint: 'Itchy bilateral forearm rash',
      hpi: 'Rash with pruritus, erythema, and scaling over two weeks after new detergent use.',
      ros: 'Skin positive for rash and itching. Constitutional negative for fever/chills.',
      physicalExam: 'Bilateral erythematous, scaly plaques on forearms with mild excoriation.',
      assessment: 'Allergic contact dermatitis is most likely; irritant dermatitis also considered.',
      plan: 'Stop trigger detergent, start topical steroid BID, consider patch testing if recurrence.',
      suggestedIcd10Codes: [{ code: 'L23.9', description: 'Allergic contact dermatitis, unspecified', confidence: 0.93 }],
      suggestedCptCodes: [{ code: '99213', description: 'Established patient office visit', confidence: 0.89 }],
      mentionedMedications: [{ name: 'Triamcinolone acetonide', dosage: '0.1% cream', frequency: 'BID', confidence: 0.95 }],
      mentionedAllergies: [],
      followUpTasks: [{ task: 'Follow-up dermatology visit', priority: 'medium', dueDate: '2026-03-01', confidence: 0.9 }],
      differentialDiagnoses: [
        {
          condition: 'Allergic contact dermatitis',
          confidence: 0.72,
          reasoning: 'Clear temporal trigger with detergent exposure and eczematous morphology.',
          icd10Code: 'L23.9',
        },
        {
          condition: 'Irritant contact dermatitis',
          confidence: 0.18,
          reasoning: 'Could represent direct irritant exposure from chemical products.',
          icd10Code: 'L24.9',
        },
        {
          condition: 'Atopic dermatitis flare',
          confidence: 0.10,
          reasoning: 'Pruritic dermatitis pattern but trigger history favors contact etiology.',
          icd10Code: 'L20.9',
        },
      ],
      recommendedTests: [
        {
          testName: 'Patch testing',
          rationale: 'Identify specific allergen if dermatitis persists or recurs.',
          urgency: 'soon' as const,
          cptCode: '95044',
        },
      ],
      noteContent: {
        formalAppointmentSummary: {
          symptoms: ['Rash', 'Itching', 'Redness', 'Scaling'],
          probableDiagnoses: [
            {
              condition: 'Allergic contact dermatitis',
              probabilityPercent: 72,
              reasoning: 'Most consistent with trigger and morphology.',
              icd10Code: 'L23.9',
            },
            {
              condition: 'Irritant contact dermatitis',
              probabilityPercent: 18,
              reasoning: 'Possible irritant reaction pattern.',
              icd10Code: 'L24.9',
            },
            {
              condition: 'Atopic dermatitis flare',
              probabilityPercent: 10,
              reasoning: 'Lower-likelihood alternate eczema phenotype.',
              icd10Code: 'L20.9',
            },
          ],
          suggestedTests: [
            {
              testName: 'Patch testing',
              urgency: 'soon' as const,
              rationale: 'Needed to isolate likely contact allergen.',
              cptCode: '95044',
            },
          ],
        },
        patientSummary: {
          whatWeDiscussed: 'We reviewed your rash symptoms and likely contact trigger.',
          yourConcerns: ['Rash', 'Itching', 'Redness'],
          diagnosis: 'Allergic contact dermatitis (72% likelihood)',
          treatmentPlan: 'Avoid trigger and use topical steroid as prescribed.',
          followUp: 'Follow up within 2-3 weeks or sooner if worsening.',
        },
      },
      overallConfidence: 0.89,
      sectionConfidence: {
        chiefComplaint: 0.92,
        hpi: 0.9,
        ros: 0.86,
        physicalExam: 0.9,
        assessment: 0.88,
        plan: 0.9,
      },
      reviewStatus: 'pending' as const,
      generationStatus: 'completed' as const,
      createdAt: now,
      completedAt: now,
    };

    ambientState.notes.unshift(note);
    return note;
  };

  const aiAgentConfigState = {
    configurations: [
      {
        id: 'ai-config-smoke-1',
        tenantId: 'tenant-demo',
        name: 'Default Dermatology',
        description: 'Seeded default AI agent configuration',
        isDefault: true,
        appointmentTypeId: null,
        specialtyFocus: 'general' as const,
        aiModel: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'You are a dermatology clinical documentation specialist for outpatient care.',
        promptTemplate: 'Generate a structured SOAP note from the following transcript: {{transcript}}',
        noteSections: ['chiefComplaint', 'hpi', 'assessment', 'plan'],
        outputFormat: 'soap' as const,
        verbosityLevel: 'standard' as const,
        includeCodes: true,
        isActive: true,
        createdAt: seededAppointmentStart.toISOString(),
        updatedAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      tenantId: string;
      name: string;
      description?: string;
      isDefault: boolean;
      appointmentTypeId?: string | null;
      specialtyFocus?: 'medical_derm' | 'cosmetic' | 'mohs' | 'pediatric_derm' | 'general';
      aiModel: string;
      temperature: number;
      maxTokens: number;
      systemPrompt: string;
      promptTemplate: string;
      noteSections: string[];
      outputFormat: 'soap' | 'narrative' | 'procedure_note';
      verbosityLevel: 'concise' | 'standard' | 'detailed';
      includeCodes: boolean;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
    }>,
  };

  const adminState = {
    facilities: [
      {
        id: 'facility-smoke-1',
        name: SEEDED_LOCATION.name,
        address: '100 Main Street',
        phone: '555-0100',
        isActive: true,
        createdAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      name: string;
      address?: string;
      phone?: string;
      isActive: boolean;
      createdAt: string;
    }>,
    rooms: [
      {
        id: 'room-smoke-1',
        facilityId: 'facility-smoke-1',
        name: 'Exam Room 1',
        roomType: 'exam',
        isActive: true,
        createdAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      facilityId: string;
      name: string;
      roomType: string;
      isActive: boolean;
      createdAt: string;
    }>,
    providers: [
      {
        id: SEEDED_PROVIDER.id,
        fullName: SEEDED_PROVIDER.fullName,
        specialty: 'Dermatology',
        npi: '1234567890',
        isActive: true,
        createdAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      fullName: string;
      specialty?: string;
      npi?: string;
      taxId?: string;
      isActive: boolean;
      createdAt: string;
    }>,
    users: [
      {
        id: 'user-1',
        email: 'admin@demo.practice',
        fullName: 'Demo Admin',
        role: 'admin',
        createdAt: seededAppointmentStart.toISOString(),
      },
      {
        id: 'user-smoke-2',
        email: 'frontdesk@demo.practice',
        fullName: 'Smoke Front Desk',
        role: 'front_desk',
        createdAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      email: string;
      fullName: string;
      role: 'admin' | 'provider' | 'ma' | 'front_desk';
      createdAt: string;
    }>,
  };

  const documentState = {
    documents: [
      {
        id: 'document-smoke-1',
        tenantId: 'tenant-demo',
        patientId: SEEDED_PATIENT.id,
        title: 'Smoke Intake Consent',
        category: 'Consent Forms',
        description: 'Seeded document for smoke flow',
        url: '/uploads/smoke-intake-consent.pdf',
        storage: 's3' as const,
        objectKey: 'documents/smoke-intake-consent.pdf',
        filename: 'smoke-intake-consent.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        createdAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      tenantId: string;
      patientId: string;
      title: string;
      category?: string;
      description?: string;
      url: string;
      storage?: 'local' | 's3';
      objectKey?: string;
      filename?: string;
      mimeType?: string;
      fileSize?: number;
      createdAt: string;
    }>,
  };

  const smsState = {
    templates: [
      {
        id: 'sms-template-smoke-1',
        name: 'Appointment Reminder',
        description: 'Seeded reminder template',
        messageBody: 'Hi {patientName}, reminder for {date} at {time}.',
        category: 'appointment_reminders',
        isSystemTemplate: false,
        isActive: true,
        usageCount: 0,
        createdAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      name: string;
      description?: string;
      messageBody: string;
      category?: string;
      isSystemTemplate: boolean;
      isActive: boolean;
      usageCount: number;
      createdAt: string;
      lastUsedAt?: string;
    }>,
    conversations: [
      {
        patientId: SEEDED_PATIENT.id,
        firstName: SEEDED_PATIENT.firstName,
        lastName: SEEDED_PATIENT.lastName,
        phone: SEEDED_PATIENT.phone,
        smsOptIn: true,
        unreadCount: 1,
        lastMessage: 'Seeded inbound smoke message',
        lastMessageTime: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      patientId: string;
      firstName: string;
      lastName: string;
      phone: string;
      smsOptIn: boolean;
      unreadCount: number;
      lastMessage?: string;
      lastMessageTime?: string;
      optedOutAt?: string;
    }>,
    messagesByPatient: {
      [SEEDED_PATIENT.id]: [
        {
          id: 'sms-message-smoke-1',
          direction: 'inbound' as const,
          messageBody: 'Seeded inbound smoke message',
          status: 'received',
          sentAt: seededAppointmentStart.toISOString(),
          createdAt: seededAppointmentStart.toISOString(),
        },
      ],
    } as Record<
      string,
      Array<{
        id: string;
        direction: 'inbound' | 'outbound';
        messageBody: string;
        status: string;
        sentAt?: string;
        deliveredAt?: string;
        createdAt: string;
      }>
    >,
    scheduled: [
      {
        id: 'sms-scheduled-smoke-1',
        patientId: SEEDED_PATIENT.id,
        patientIds: [SEEDED_PATIENT.id],
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        messageBody: 'Seeded scheduled smoke reminder',
        scheduledSendTime: new Date(seededAppointmentStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'scheduled',
        isRecurring: false,
        totalRecipients: 1,
        sentCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        createdAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      patientId?: string;
      patientIds?: string[];
      patientName?: string;
      messageBody: string;
      templateId?: string;
      templateName?: string;
      scheduledSendTime: string;
      isRecurring: boolean;
      recurrencePattern?: string;
      status: string;
      totalRecipients: number;
      sentCount: number;
      deliveredCount: number;
      failedCount: number;
      createdAt: string;
      sentAt?: string;
    }>,
    consentByPatient: {
      [SEEDED_PATIENT.id]: {
        hasConsent: true,
        daysUntilExpiration: 180,
      },
    } as Record<
      string,
      {
        hasConsent: boolean;
        daysUntilExpiration?: number | null;
        consent?: {
          id: string;
          patientId: string;
          consentGiven: boolean;
          consentDate: string;
          consentMethod: 'verbal' | 'written' | 'electronic';
          obtainedByUserId: string;
          obtainedByName: string;
          expirationDate?: string;
          consentRevoked: boolean;
          revokedDate?: string;
          revokedReason?: string;
          createdAt: string;
          updatedAt: string;
        };
      }
    >,
    auditLogs: [
      {
        id: 'sms-audit-smoke-1',
        eventType: 'message_received',
        patientId: SEEDED_PATIENT.id,
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        userId: 'user-1',
        userName: 'Demo Admin',
        messagePreview: 'Seeded inbound smoke message',
        direction: 'inbound',
        status: 'received',
        createdAt: seededAppointmentStart.toISOString(),
      },
    ] as Array<{
      id: string;
      eventType: 'message_sent' | 'message_received' | 'consent_obtained' | 'consent_revoked' | 'opt_out';
      patientId: string;
      patientName: string;
      userId?: string;
      userName?: string;
      messageId?: string;
      messagePreview?: string;
      direction?: 'inbound' | 'outbound';
      status?: string;
      metadata?: Record<string, unknown>;
      createdAt: string;
    }>,
  };

  let paymentCounter = 1;
  let claimHistoryCounter = 2;
  let referralCounter = 2;
  let documentCounter = 2;
  let smsTemplateCounter = 2;
  let smsMessageCounter = 2;
  let smsScheduledCounter = 2;
  let smsAuditCounter = 2;
  let aiAgentConfigCounter = 2;
  let adminFacilityCounter = 2;
  let adminRoomCounter = 2;
  let adminProviderCounter = 2;
  let adminUserCounter = 3;
  let encounterCounter = 2;
  let ambientRecordingCounter = 1;
  let ambientTranscriptCounter = 1;
  let ambientNoteCounter = 1;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.startsWith('/api/auth/')) {
      await route.fallback();
      return;
    }

    if (method === 'GET' && path === '/api/patients') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [SEEDED_PATIENT],
          patients: [SEEDED_PATIENT],
          meta: {
            page: 1,
            limit: 100,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/referrals') {
      const statusFilter = url.searchParams.get('status');
      const directionFilter = url.searchParams.get('direction');
      const patientFilter = url.searchParams.get('patientId');
      const priorityFilter = url.searchParams.get('priority');

      const referrals = referralState.referrals.filter((referral) => {
        if (statusFilter && referral.status !== statusFilter) return false;
        if (directionFilter && referral.direction !== directionFilter) return false;
        if (patientFilter && referral.patientId !== patientFilter) return false;
        if (priorityFilter && referral.priority !== priorityFilter) return false;
        return true;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ referrals }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/referrals') {
      let payload: {
        patientId?: string;
        direction?: 'incoming' | 'outgoing';
        status?: 'new' | 'scheduled' | 'in_progress' | 'completed' | 'declined' | 'cancelled';
        priority?: 'routine' | 'urgent' | 'stat';
        referringProvider?: string;
        referringOrganization?: string;
        referredToProvider?: string;
        referredToOrganization?: string;
        appointmentId?: string;
        reason?: string;
        notes?: string;
      } = {};
      try {
        payload = request.postDataJSON() as {
          patientId?: string;
          direction?: 'incoming' | 'outgoing';
          status?: 'new' | 'scheduled' | 'in_progress' | 'completed' | 'declined' | 'cancelled';
          priority?: 'routine' | 'urgent' | 'stat';
          referringProvider?: string;
          referringOrganization?: string;
          referredToProvider?: string;
          referredToOrganization?: string;
          appointmentId?: string;
          reason?: string;
          notes?: string;
        };
      } catch {
        payload = {};
      }

      const now = new Date().toISOString();
      const createdReferral = {
        id: `referral-smoke-${referralCounter++}`,
        patientId: payload.patientId || SEEDED_PATIENT.id,
        patientFirstName: SEEDED_PATIENT.firstName,
        patientLastName: SEEDED_PATIENT.lastName,
        direction: payload.direction || 'outgoing',
        status: payload.status || 'new',
        priority: payload.priority || 'routine',
        referringProvider: payload.referringProvider,
        referringOrganization: payload.referringOrganization,
        referredToProvider: payload.referredToProvider,
        referredToOrganization: payload.referredToOrganization,
        appointmentId: payload.appointmentId,
        reason: payload.reason,
        notes: payload.notes,
        createdAt: now,
        updatedAt: now,
      };

      referralState.referrals.unshift(createdReferral);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          referral: createdReferral,
        }),
      });
      return;
    }

    if (method === 'PUT' && path.startsWith('/api/referrals/')) {
      const referralId = path.split('/').pop();
      const referral = referralState.referrals.find((item) => item.id === referralId);

      if (!referral) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Referral not found' }),
        });
        return;
      }

      let payload: {
        status?: 'new' | 'scheduled' | 'in_progress' | 'completed' | 'declined' | 'cancelled';
        priority?: 'routine' | 'urgent' | 'stat';
        notes?: string;
      } = {};
      try {
        payload = request.postDataJSON() as {
          status?: 'new' | 'scheduled' | 'in_progress' | 'completed' | 'declined' | 'cancelled';
          priority?: 'routine' | 'urgent' | 'stat';
          notes?: string;
        };
      } catch {
        payload = {};
      }

      if (payload.status) {
        referral.status = payload.status;
      }
      if (payload.priority) {
        referral.priority = payload.priority;
      }
      if (typeof payload.notes === 'string') {
        referral.notes = payload.notes;
      }
      referral.updatedAt = new Date().toISOString();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          referral,
        }),
      });
      return;
    }

    if (method === 'GET' && path === `/api/patients/${SEEDED_PATIENT.id}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patient: SEEDED_PATIENT }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/appointments') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointments: appointmentState.appointments }),
      });
      return;
    }

    if (method === 'POST' && path === `/api/appointments/${seededAppointmentId}/status`) {
      let statusPayload: { status?: string } = {};
      try {
        statusPayload = request.postDataJSON() as { status?: string };
      } catch {
        statusPayload = {};
      }

      const nextStatus = typeof statusPayload.status === 'string'
        ? statusPayload.status
        : 'scheduled';
      const appointment = appointmentState.appointments.find((item) => item.id === seededAppointmentId);

      if (!appointment) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Appointment not found' }),
        });
        return;
      }

      appointment.status = nextStatus;
      appointment.updatedAt = new Date().toISOString();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          appointment,
        }),
      });
      return;
    }

    if (method === 'POST' && path === `/api/appointments/${seededAppointmentId}/reschedule`) {
      let reschedulePayload: {
        scheduledStart?: string;
        scheduledEnd?: string;
        providerId?: string;
      } = {};
      try {
        reschedulePayload = request.postDataJSON() as {
          scheduledStart?: string;
          scheduledEnd?: string;
          providerId?: string;
        };
      } catch {
        reschedulePayload = {};
      }

      const appointment = appointmentState.appointments.find((item) => item.id === seededAppointmentId);
      if (!appointment) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Appointment not found' }),
        });
        return;
      }

      if (reschedulePayload.scheduledStart) {
        appointment.scheduledStart = reschedulePayload.scheduledStart;
      }
      if (reschedulePayload.scheduledEnd) {
        appointment.scheduledEnd = reschedulePayload.scheduledEnd;
      }
      if (reschedulePayload.providerId) {
        appointment.providerId = reschedulePayload.providerId;
        if (reschedulePayload.providerId === SEEDED_PROVIDER.id) {
          appointment.providerName = SEEDED_PROVIDER.fullName;
        }
      }

      appointment.updatedAt = new Date().toISOString();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          appointment,
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/encounters') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ encounters: encounterState.encounters }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/encounters') {
      const payload = request.postDataJSON() as { patientId?: string; providerId?: string } | null;
      const now = new Date().toISOString();
      const encounterId = `encounter-smoke-${encounterCounter++}`;
      const encounter = {
        id: encounterId,
        patientId: payload?.patientId || SEEDED_PATIENT.id,
        providerId: payload?.providerId || SEEDED_PROVIDER.id,
        appointmentId: seededAppointmentId,
        status: 'draft',
        chiefComplaint: '',
        hpi: '',
        ros: '',
        exam: '',
        assessmentPlan: '',
        createdAt: now,
        updatedAt: now,
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        providerName: SEEDED_PROVIDER.fullName,
      };
      encounterState.encounters.unshift(encounter);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: encounterId,
          encounter,
        }),
      });
      return;
    }

    const encounterUpdateMatch = path.match(/^\/api\/encounters\/([^/]+)$/);
    if (method === 'POST' && encounterUpdateMatch) {
      const encounterId = encounterUpdateMatch[1];
      const encounter = encounterState.encounters.find((item) => item.id === encounterId);
      if (!encounter) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not found' }),
        });
        return;
      }

      let payload: {
        chiefComplaint?: string;
        hpi?: string;
        ros?: string;
        exam?: string;
        assessmentPlan?: string;
      } = {};
      try {
        payload = request.postDataJSON() as {
          chiefComplaint?: string;
          hpi?: string;
          ros?: string;
          exam?: string;
          assessmentPlan?: string;
        };
      } catch {
        payload = {};
      }

      if (typeof payload.chiefComplaint === 'string') encounter.chiefComplaint = payload.chiefComplaint;
      if (typeof payload.hpi === 'string') encounter.hpi = payload.hpi;
      if (typeof payload.ros === 'string') encounter.ros = payload.ros;
      if (typeof payload.exam === 'string') encounter.exam = payload.exam;
      if (typeof payload.assessmentPlan === 'string') encounter.assessmentPlan = payload.assessmentPlan;
      encounter.updatedAt = new Date().toISOString();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    const encounterStatusMatch = path.match(/^\/api\/encounters\/([^/]+)\/status$/);
    if (method === 'POST' && encounterStatusMatch) {
      const encounterId = encounterStatusMatch[1];
      const encounter = encounterState.encounters.find((item) => item.id === encounterId);
      if (!encounter) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Encounter not found' }),
        });
        return;
      }

      let payload: { status?: string } = {};
      try {
        payload = request.postDataJSON() as { status?: string };
      } catch {
        payload = {};
      }

      const nextStatus = typeof payload.status === 'string' ? payload.status : encounter.status;
      encounter.status = nextStatus;
      encounter.updatedAt = new Date().toISOString();

      if (encounterClosureStatuses.has(nextStatus.toLowerCase())) {
        autoStopAmbientRecordings(encounterId);
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, encounter }),
      });
      return;
    }

    const encounterCompleteMatch = path.match(/^\/api\/encounters\/([^/]+)\/complete$/);
    if (method === 'POST' && encounterCompleteMatch) {
      const encounterId = encounterCompleteMatch[1];
      const encounter = encounterState.encounters.find((item) => item.id === encounterId);
      if (!encounter) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Encounter not found' }),
        });
        return;
      }

      encounter.status = 'completed';
      encounter.updatedAt = new Date().toISOString();
      autoStopAmbientRecordings(encounterId);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          encounterId,
          message: 'Encounter completed and charges generated',
        }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/ambient/recordings/start') {
      let payload: {
        encounterId?: string;
        patientId?: string;
        providerId?: string;
        consentObtained?: boolean;
        consentMethod?: 'verbal' | 'written' | 'electronic';
      } = {};
      try {
        payload = request.postDataJSON() as {
          encounterId?: string;
          patientId?: string;
          providerId?: string;
          consentObtained?: boolean;
          consentMethod?: 'verbal' | 'written' | 'electronic';
        };
      } catch {
        payload = {};
      }

      if (!payload.patientId || !payload.providerId || !payload.consentObtained) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Patient consent required before recording' }),
        });
        return;
      }

      if (payload.encounterId) {
        const encounter = encounterState.encounters.find((item) => item.id === payload.encounterId);
        if (!encounter) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Encounter not found' }),
          });
          return;
        }
        if (encounter.patientId !== payload.patientId) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Encounter does not match patient' }),
          });
          return;
        }
      }

      const now = new Date().toISOString();
      const recordingId = `ambient-recording-smoke-${ambientRecordingCounter++}`;
      ambientState.recordings.unshift({
        id: recordingId,
        encounterId: payload.encounterId,
        patientId: payload.patientId,
        providerId: payload.providerId,
        status: 'recording',
        durationSeconds: 0,
        consentObtained: true,
        consentMethod: payload.consentMethod || 'verbal',
        startedAt: now,
        createdAt: now,
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        providerName: SEEDED_PROVIDER.fullName,
      });

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          recordingId,
          status: 'recording',
          startedAt: now,
        }),
      });
      return;
    }

    const ambientStopMatch = path.match(/^\/api\/ambient\/recordings\/([^/]+)\/stop$/);
    if (method === 'POST' && ambientStopMatch) {
      const recordingId = ambientStopMatch[1];
      const recording = ambientState.recordings.find((item) => item.id === recordingId);
      if (!recording) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Recording not found' }),
        });
        return;
      }

      if (recording.status === 'completed') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Recording already completed' }),
        });
        return;
      }

      let payload: { durationSeconds?: number } = {};
      try {
        payload = request.postDataJSON() as { durationSeconds?: number };
      } catch {
        payload = {};
      }
      const normalizedDuration = Math.max(1, Number(payload.durationSeconds) || recording.durationSeconds || 1);
      const completedAt = new Date().toISOString();
      recording.status = 'stopped';
      recording.durationSeconds = normalizedDuration;
      recording.completedAt = completedAt;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recordingId: recording.id,
          status: recording.status,
          duration: recording.durationSeconds,
          completedAt: recording.completedAt,
        }),
      });
      return;
    }

    const ambientUploadMatch = path.match(/^\/api\/ambient\/recordings\/([^/]+)\/upload$/);
    if (method === 'POST' && ambientUploadMatch) {
      const recordingId = ambientUploadMatch[1];
      const recording = ambientState.recordings.find((item) => item.id === recordingId);
      if (!recording) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Recording not found' }),
        });
        return;
      }

      if (recording.status === 'completed') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Recording already uploaded' }),
        });
        return;
      }

      recording.status = 'completed';
      recording.durationSeconds = Math.max(recording.durationSeconds || 0, 1);
      recording.completedAt = recording.completedAt || new Date().toISOString();
      ensureAmbientTranscript(recording.id);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recordingId: recording.id,
          status: 'completed',
          fileSize: 1024,
          duration: recording.durationSeconds,
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/ambient/recordings') {
      const encounterId = url.searchParams.get('encounterId');
      const patientId = url.searchParams.get('patientId');
      const status = url.searchParams.get('status');
      const recordings = ambientState.recordings.filter((recording) => {
        if (encounterId && recording.encounterId !== encounterId) return false;
        if (patientId && recording.patientId !== patientId) return false;
        if (status && recording.status !== status) return false;
        return true;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recordings }),
      });
      return;
    }

    const ambientRecordingDetailMatch = path.match(/^\/api\/ambient\/recordings\/([^/]+)$/);
    if (method === 'GET' && ambientRecordingDetailMatch) {
      const recordingId = ambientRecordingDetailMatch[1];
      const recording = ambientState.recordings.find((item) => item.id === recordingId);
      if (!recording) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Recording not found' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recording }),
      });
      return;
    }

    const ambientTranscribeMatch = path.match(/^\/api\/ambient\/recordings\/([^/]+)\/transcribe$/);
    if (method === 'POST' && ambientTranscribeMatch) {
      const recordingId = ambientTranscribeMatch[1];
      const recording = ambientState.recordings.find((item) => item.id === recordingId);
      if (!recording) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Recording not found' }),
        });
        return;
      }

      if (recording.status === 'recording') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'No audio file uploaded yet' }),
        });
        return;
      }

      const transcript = ensureAmbientTranscript(recording.id);
      if (!transcript) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failed to create transcript' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          transcriptId: transcript.id,
          status: 'processing',
          message: 'Transcription started',
        }),
      });
      return;
    }

    const ambientRecordingTranscriptMatch = path.match(/^\/api\/ambient\/recordings\/([^/]+)\/transcript$/);
    if (method === 'GET' && ambientRecordingTranscriptMatch) {
      const recordingId = ambientRecordingTranscriptMatch[1];
      const transcript = ambientState.transcripts.find((item) => item.recordingId === recordingId);
      if (!transcript) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Transcript not found' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ transcript }),
      });
      return;
    }

    const ambientTranscriptDetailMatch = path.match(/^\/api\/ambient\/transcripts\/([^/]+)$/);
    if (method === 'GET' && ambientTranscriptDetailMatch) {
      const transcriptId = ambientTranscriptDetailMatch[1];
      const transcript = ambientState.transcripts.find((item) => item.id === transcriptId);
      if (!transcript) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Transcript not found' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ transcript }),
      });
      return;
    }

    const ambientGenerateNoteMatch = path.match(/^\/api\/ambient\/transcripts\/([^/]+)\/generate-note$/);
    if (method === 'POST' && ambientGenerateNoteMatch) {
      const transcriptId = ambientGenerateNoteMatch[1];
      const transcript = ambientState.transcripts.find((item) => item.id === transcriptId);
      if (!transcript) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Transcript not found' }),
        });
        return;
      }

      const note = ensureAmbientNote(transcriptId);
      if (!note) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failed to generate note' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          noteId: note.id,
          status: 'processing',
          message: 'Note generation started',
        }),
      });
      return;
    }

    const ambientNoteDetailMatch = path.match(/^\/api\/ambient\/notes\/([^/]+)$/);
    if (method === 'GET' && ambientNoteDetailMatch) {
      const noteId = ambientNoteDetailMatch[1];
      const note = ambientState.notes.find((item) => item.id === noteId);
      if (!note) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Generated note not found' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ note }),
      });
      return;
    }

    const ambientEncounterNotesMatch = path.match(/^\/api\/ambient\/encounters\/([^/]+)\/notes$/);
    if (method === 'GET' && ambientEncounterNotesMatch) {
      const encounterId = ambientEncounterNotesMatch[1];
      const notes = ambientState.notes.filter((item) => item.encounterId === encounterId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notes }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/providers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers: [SEEDED_PROVIDER] }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/locations') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ locations: [SEEDED_LOCATION] }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/appointment-types') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ appointmentTypes: [SEEDED_APPOINTMENT_TYPE] }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/availability') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ availability: [] }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/time-blocks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (method === 'GET' && path === '/api/documents') {
      const patientFilter = url.searchParams.get('patientId');
      const categoryFilter = url.searchParams.get('category');
      const documents = documentState.documents.filter((document) => {
        if (patientFilter && document.patientId !== patientFilter) return false;
        if (categoryFilter && document.category !== categoryFilter) return false;
        return true;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/upload/document') {
      const createdAt = new Date().toISOString();
      const objectKey = `documents/upload-smoke-${Date.now()}.pdf`;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `/uploads/${objectKey.split('/').pop()}`,
          objectKey,
          storage: 's3',
          createdAt,
        }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/documents') {
      let payload: {
        patientId?: string;
        title?: string;
        category?: string;
        description?: string;
        url?: string;
        storage?: 'local' | 's3';
        objectKey?: string;
        filename?: string;
        mimeType?: string;
        fileSize?: number;
      } = {};
      try {
        payload = request.postDataJSON() as {
          patientId?: string;
          title?: string;
          category?: string;
          description?: string;
          url?: string;
          storage?: 'local' | 's3';
          objectKey?: string;
          filename?: string;
          mimeType?: string;
          fileSize?: number;
        };
      } catch {
        payload = {};
      }

      if (!payload.patientId || !payload.title || !payload.url) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Missing required document fields' }),
        });
        return;
      }

      const createdDocument = {
        id: `document-smoke-${documentCounter++}`,
        tenantId: 'tenant-demo',
        patientId: payload.patientId,
        title: payload.title,
        category: payload.category || 'Other',
        description: payload.description,
        url: payload.url,
        storage: payload.storage || 's3',
        objectKey: payload.objectKey,
        filename: payload.filename,
        mimeType: payload.mimeType,
        fileSize: payload.fileSize,
        createdAt: new Date().toISOString(),
      };

      documentState.documents.unshift(createdDocument);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: createdDocument.id,
          document: createdDocument,
          suggestedCategory: createdDocument.category,
        }),
      });
      return;
    }

    if (method === 'GET' && path.startsWith('/api/documents/view/')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'mock-document-content',
      });
      return;
    }

    if (method === 'GET' && path === '/api/photos') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ photos: [] }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/tasks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tasks: [] }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/orders') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: [] }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/prescriptions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prescriptions: [] }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/claims') {
      const statusFilter = url.searchParams.get('status');
      const claims = statusFilter
        ? (claimState.claim.status === statusFilter ? [claimState.claim] : [])
        : [claimState.claim];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ claims }),
      });
      return;
    }

    if (method === 'GET' && path === `/api/claims/${claimState.claim.id}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          claim: claimState.claim,
          diagnoses: claimState.diagnoses,
          charges: claimState.charges,
          payments: claimState.payments,
          statusHistory: claimState.statusHistory,
        }),
      });
      return;
    }

    if (method === 'PUT' && path === `/api/claims/${claimState.claim.id}/status`) {
      let statusPayload: { status?: string; notes?: string } = {};
      try {
        statusPayload = request.postDataJSON() as { status?: string; notes?: string };
      } catch {
        statusPayload = {};
      }

      const nextStatus = typeof statusPayload.status === 'string'
        ? statusPayload.status
        : claimState.claim.status;
      const changedAt = new Date().toISOString();

      claimState.claim.status = nextStatus;
      claimState.claim.updatedAt = changedAt;
      claimState.statusHistory.unshift({
        id: `claim-history-smoke-${claimHistoryCounter++}`,
        tenantId: claimState.claim.tenantId,
        claimId: claimState.claim.id,
        status: nextStatus,
        changedAt,
        notes: statusPayload.notes,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          claim: claimState.claim,
        }),
      });
      return;
    }

    if (method === 'POST' && path === `/api/claims/${claimState.claim.id}/payments`) {
      let paymentPayload: {
        amountCents?: number;
        paymentDate?: string;
        paymentMethod?: string;
        payer?: string;
        checkNumber?: string;
        notes?: string;
      } = {};
      try {
        paymentPayload = request.postDataJSON() as {
          amountCents?: number;
          paymentDate?: string;
          paymentMethod?: string;
          payer?: string;
          checkNumber?: string;
          notes?: string;
        };
      } catch {
        paymentPayload = {};
      }

      const createdAt = new Date().toISOString();
      const payment = {
        id: `claim-payment-smoke-${paymentCounter++}`,
        tenantId: claimState.claim.tenantId,
        claimId: claimState.claim.id,
        amountCents: Number(paymentPayload.amountCents) || 0,
        paymentDate: paymentPayload.paymentDate || createdAt.slice(0, 10),
        paymentMethod: paymentPayload.paymentMethod,
        payer: paymentPayload.payer,
        checkNumber: paymentPayload.checkNumber,
        notes: paymentPayload.notes,
        createdAt,
      };

      claimState.payments.push(payment);
      claimState.claim.updatedAt = createdAt;

      const totalPaidCents = claimState.payments.reduce((sum, item) => sum + item.amountCents, 0);
      if (totalPaidCents >= claimState.claim.totalCents && claimState.claim.status !== 'paid') {
        claimState.claim.status = 'paid';
        claimState.statusHistory.unshift({
          id: `claim-history-smoke-${claimHistoryCounter++}`,
          tenantId: claimState.claim.tenantId,
          claimId: claimState.claim.id,
          status: 'paid',
          changedAt: createdAt,
          notes: 'Auto-marked paid after full payment',
        });
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          payment,
          claim: claimState.claim,
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/admin/facilities') {
      const facilities = [...adminState.facilities].sort((a, b) => a.name.localeCompare(b.name));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ facilities }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/admin/facilities') {
      let payload: { name?: string; address?: string; phone?: string } = {};
      try {
        payload = request.postDataJSON() as { name?: string; address?: string; phone?: string };
      } catch {
        payload = {};
      }

      if (!payload.name?.trim()) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Facility name is required' }),
        });
        return;
      }

      const facility = {
        id: `facility-smoke-${adminFacilityCounter++}`,
        name: payload.name.trim(),
        address: payload.address || undefined,
        phone: payload.phone || undefined,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      adminState.facilities.push(facility);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(facility),
      });
      return;
    }

    const adminFacilityMatch = path.match(/^\/api\/admin\/facilities\/([^/]+)$/);
    if (adminFacilityMatch && method === 'PUT') {
      const facilityId = adminFacilityMatch[1];
      const facility = adminState.facilities.find((item) => item.id === facilityId);
      let payload: { name?: string; address?: string; phone?: string; isActive?: boolean } = {};
      try {
        payload = request.postDataJSON() as { name?: string; address?: string; phone?: string; isActive?: boolean };
      } catch {
        payload = {};
      }

      if (facility) {
        if (typeof payload.name === 'string' && payload.name.trim()) facility.name = payload.name.trim();
        if (typeof payload.address === 'string') facility.address = payload.address;
        if (typeof payload.phone === 'string') facility.phone = payload.phone;
        if (typeof payload.isActive === 'boolean') facility.isActive = payload.isActive;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (adminFacilityMatch && method === 'DELETE') {
      const facilityId = adminFacilityMatch[1];
      const hasRooms = adminState.rooms.some((room) => room.facilityId === facilityId);
      if (hasRooms) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Cannot delete facility with rooms. Delete rooms first.' }),
        });
        return;
      }

      adminState.facilities = adminState.facilities.filter((item) => item.id !== facilityId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/admin/rooms') {
      const rooms = [...adminState.rooms]
        .map((room) => ({
          ...room,
          facilityName: adminState.facilities.find((facility) => facility.id === room.facilityId)?.name,
        }))
        .sort((a, b) => {
          const facilityCompare = (a.facilityName || '').localeCompare(b.facilityName || '');
          if (facilityCompare !== 0) return facilityCompare;
          return a.name.localeCompare(b.name);
        });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rooms }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/admin/rooms') {
      let payload: { name?: string; facilityId?: string; roomType?: string } = {};
      try {
        payload = request.postDataJSON() as { name?: string; facilityId?: string; roomType?: string };
      } catch {
        payload = {};
      }

      if (!payload.name?.trim() || !payload.facilityId) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Room name and facility are required' }),
        });
        return;
      }

      const room = {
        id: `room-smoke-${adminRoomCounter++}`,
        facilityId: payload.facilityId,
        name: payload.name.trim(),
        roomType: payload.roomType || 'exam',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      adminState.rooms.push(room);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: room.id,
          name: room.name,
          facilityId: room.facilityId,
          roomType: room.roomType,
          isActive: room.isActive,
        }),
      });
      return;
    }

    const adminRoomMatch = path.match(/^\/api\/admin\/rooms\/([^/]+)$/);
    if (adminRoomMatch && method === 'PUT') {
      const roomId = adminRoomMatch[1];
      const room = adminState.rooms.find((item) => item.id === roomId);
      let payload: {
        name?: string;
        facilityId?: string;
        roomType?: string;
        isActive?: boolean;
      } = {};
      try {
        payload = request.postDataJSON() as {
          name?: string;
          facilityId?: string;
          roomType?: string;
          isActive?: boolean;
        };
      } catch {
        payload = {};
      }

      if (room) {
        if (typeof payload.name === 'string' && payload.name.trim()) room.name = payload.name.trim();
        if (typeof payload.facilityId === 'string') room.facilityId = payload.facilityId;
        if (typeof payload.roomType === 'string') room.roomType = payload.roomType;
        if (typeof payload.isActive === 'boolean') room.isActive = payload.isActive;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (adminRoomMatch && method === 'DELETE') {
      const roomId = adminRoomMatch[1];
      adminState.rooms = adminState.rooms.filter((item) => item.id !== roomId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/admin/providers') {
      const providers = [...adminState.providers].sort((a, b) => a.fullName.localeCompare(b.fullName));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/admin/providers') {
      let payload: { fullName?: string; specialty?: string; npi?: string } = {};
      try {
        payload = request.postDataJSON() as { fullName?: string; specialty?: string; npi?: string };
      } catch {
        payload = {};
      }

      if (!payload.fullName?.trim()) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Provider name is required' }),
        });
        return;
      }

      const provider = {
        id: `provider-smoke-${adminProviderCounter++}`,
        fullName: payload.fullName.trim(),
        specialty: payload.specialty || 'Dermatology',
        npi: payload.npi || undefined,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      adminState.providers.push(provider);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(provider),
      });
      return;
    }

    const adminProviderMatch = path.match(/^\/api\/admin\/providers\/([^/]+)$/);
    if (adminProviderMatch && method === 'PUT') {
      const providerId = adminProviderMatch[1];
      const provider = adminState.providers.find((item) => item.id === providerId);
      let payload: { fullName?: string; specialty?: string; npi?: string; isActive?: boolean } = {};
      try {
        payload = request.postDataJSON() as { fullName?: string; specialty?: string; npi?: string; isActive?: boolean };
      } catch {
        payload = {};
      }

      if (provider) {
        if (typeof payload.fullName === 'string' && payload.fullName.trim()) provider.fullName = payload.fullName.trim();
        if (typeof payload.specialty === 'string') provider.specialty = payload.specialty;
        if (typeof payload.npi === 'string') provider.npi = payload.npi;
        if (typeof payload.isActive === 'boolean') provider.isActive = payload.isActive;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (adminProviderMatch && method === 'DELETE') {
      const providerId = adminProviderMatch[1];
      adminState.providers = adminState.providers.filter((item) => item.id !== providerId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/admin/users') {
      const users = [...adminState.users].sort((a, b) => a.fullName.localeCompare(b.fullName));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/admin/users') {
      let payload: { email?: string; fullName?: string; role?: 'admin' | 'provider' | 'ma' | 'front_desk'; password?: string } = {};
      try {
        payload = request.postDataJSON() as { email?: string; fullName?: string; role?: 'admin' | 'provider' | 'ma' | 'front_desk'; password?: string };
      } catch {
        payload = {};
      }

      if (!payload.email || !payload.fullName || !payload.password) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Email, name, and password are required' }),
        });
        return;
      }

      const normalizedEmail = payload.email.toLowerCase();
      const hasEmailCollision = adminState.users.some((user) => user.email === normalizedEmail);
      if (hasEmailCollision) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'A user with this email already exists' }),
        });
        return;
      }

      const user = {
        id: `user-smoke-${adminUserCounter++}`,
        email: normalizedEmail,
        fullName: payload.fullName,
        role: payload.role || 'front_desk',
        createdAt: new Date().toISOString(),
      };
      adminState.users.push(user);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        }),
      });
      return;
    }

    const adminUserMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && method === 'PUT') {
      const userId = adminUserMatch[1];
      const user = adminState.users.find((item) => item.id === userId);
      let payload: { email?: string; fullName?: string; role?: 'admin' | 'provider' | 'ma' | 'front_desk'; password?: string } = {};
      try {
        payload = request.postDataJSON() as { email?: string; fullName?: string; role?: 'admin' | 'provider' | 'ma' | 'front_desk'; password?: string };
      } catch {
        payload = {};
      }

      const hasAnyUpdates =
        typeof payload.email === 'string' ||
        typeof payload.fullName === 'string' ||
        typeof payload.role === 'string' ||
        typeof payload.password === 'string';
      if (!hasAnyUpdates) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'No fields to update' }),
        });
        return;
      }

      if (user) {
        if (typeof payload.email === 'string') user.email = payload.email.toLowerCase();
        if (typeof payload.fullName === 'string') user.fullName = payload.fullName;
        if (typeof payload.role === 'string') user.role = payload.role;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (adminUserMatch && method === 'DELETE') {
      const userId = adminUserMatch[1];
      if (userId === 'user-1') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Cannot delete your own account' }),
        });
        return;
      }

      adminState.users = adminState.users.filter((item) => item.id !== userId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/ai-agent-configs') {
      const activeOnly = url.searchParams.get('activeOnly');
      const specialtyFocus = url.searchParams.get('specialtyFocus');
      const appointmentTypeId = url.searchParams.get('appointmentTypeId');

      const configurations = aiAgentConfigState.configurations.filter((config) => {
        if (activeOnly !== 'false' && !config.isActive) return false;
        if (specialtyFocus && config.specialtyFocus !== specialtyFocus) return false;
        if (appointmentTypeId && config.appointmentTypeId !== appointmentTypeId) return false;
        return true;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configurations }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/ai-agent-configs/default') {
      const config = aiAgentConfigState.configurations.find((item) => item.isDefault && item.isActive);
      if (!config) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'No default configuration found' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configuration: config }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/ai-agent-configs') {
      let payload: {
        name?: string;
        description?: string;
        isDefault?: boolean;
        appointmentTypeId?: string;
        specialtyFocus?: 'medical_derm' | 'cosmetic' | 'mohs' | 'pediatric_derm' | 'general';
        aiModel?: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        promptTemplate?: string;
        noteSections?: string[];
        outputFormat?: 'soap' | 'narrative' | 'procedure_note';
        verbosityLevel?: 'concise' | 'standard' | 'detailed';
        includeCodes?: boolean;
      } = {};
      try {
        payload = request.postDataJSON() as {
          name?: string;
          description?: string;
          isDefault?: boolean;
          appointmentTypeId?: string;
          specialtyFocus?: 'medical_derm' | 'cosmetic' | 'mohs' | 'pediatric_derm' | 'general';
          aiModel?: string;
          temperature?: number;
          maxTokens?: number;
          systemPrompt?: string;
          promptTemplate?: string;
          noteSections?: string[];
          outputFormat?: 'soap' | 'narrative' | 'procedure_note';
          verbosityLevel?: 'concise' | 'standard' | 'detailed';
          includeCodes?: boolean;
        };
      } catch {
        payload = {};
      }

      if (
        !payload.name ||
        !payload.systemPrompt ||
        !payload.promptTemplate ||
        !Array.isArray(payload.noteSections) ||
        payload.noteSections.length === 0
      ) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'name, systemPrompt, promptTemplate, and noteSections are required' }),
        });
        return;
      }

      const hasNameCollision = aiAgentConfigState.configurations.some(
        (config) => config.name.toLowerCase() === payload.name!.toLowerCase()
      );
      if (hasNameCollision) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'A configuration with this name already exists' }),
        });
        return;
      }

      if (payload.isDefault) {
        aiAgentConfigState.configurations.forEach((config) => {
          config.isDefault = false;
        });
      }

      const now = new Date().toISOString();
      const configuration = {
        id: `ai-config-smoke-${aiAgentConfigCounter++}`,
        tenantId: 'tenant-demo',
        name: payload.name,
        description: payload.description,
        isDefault: Boolean(payload.isDefault),
        appointmentTypeId: payload.appointmentTypeId || null,
        specialtyFocus: payload.specialtyFocus || 'general',
        aiModel: payload.aiModel || 'claude-3-5-sonnet-20241022',
        temperature: payload.temperature ?? 0.3,
        maxTokens: payload.maxTokens ?? 4000,
        systemPrompt: payload.systemPrompt,
        promptTemplate: payload.promptTemplate,
        noteSections: payload.noteSections,
        outputFormat: payload.outputFormat || 'soap',
        verbosityLevel: payload.verbosityLevel || 'standard',
        includeCodes: payload.includeCodes ?? true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      aiAgentConfigState.configurations.unshift(configuration);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ configuration }),
      });
      return;
    }

    const aiConfigCloneMatch = path.match(/^\/api\/ai-agent-configs\/([^/]+)\/clone$/);
    if (method === 'POST' && aiConfigCloneMatch) {
      const sourceId = aiConfigCloneMatch[1];
      const source = aiAgentConfigState.configurations.find((item) => item.id === sourceId);
      if (!source) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Configuration not found' }),
        });
        return;
      }

      let payload: { name?: string } = {};
      try {
        payload = request.postDataJSON() as { name?: string };
      } catch {
        payload = {};
      }

      if (!payload.name?.trim()) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Name is required' }),
        });
        return;
      }

      const hasNameCollision = aiAgentConfigState.configurations.some(
        (config) => config.name.toLowerCase() === payload.name!.toLowerCase()
      );
      if (hasNameCollision) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'A configuration with this name already exists' }),
        });
        return;
      }

      const now = new Date().toISOString();
      const configuration = {
        ...source,
        id: `ai-config-smoke-${aiAgentConfigCounter++}`,
        name: payload.name.trim(),
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      aiAgentConfigState.configurations.unshift(configuration);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ configuration }),
      });
      return;
    }

    const aiConfigDetailMatch = path.match(/^\/api\/ai-agent-configs\/([^/]+)$/);
    if (aiConfigDetailMatch && method === 'GET') {
      const configId = aiConfigDetailMatch[1];
      const configuration = aiAgentConfigState.configurations.find((item) => item.id === configId);
      if (!configuration) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Configuration not found' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configuration }),
      });
      return;
    }

    if (aiConfigDetailMatch && method === 'PUT') {
      const configId = aiConfigDetailMatch[1];
      const configuration = aiAgentConfigState.configurations.find((item) => item.id === configId);
      if (!configuration) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Configuration not found' }),
        });
        return;
      }

      let payload: {
        name?: string;
        description?: string;
        isDefault?: boolean;
        appointmentTypeId?: string;
        specialtyFocus?: 'medical_derm' | 'cosmetic' | 'mohs' | 'pediatric_derm' | 'general';
        aiModel?: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        promptTemplate?: string;
        noteSections?: string[];
        outputFormat?: 'soap' | 'narrative' | 'procedure_note';
        verbosityLevel?: 'concise' | 'standard' | 'detailed';
        includeCodes?: boolean;
        isActive?: boolean;
      } = {};
      try {
        payload = request.postDataJSON() as {
          name?: string;
          description?: string;
          isDefault?: boolean;
          appointmentTypeId?: string;
          specialtyFocus?: 'medical_derm' | 'cosmetic' | 'mohs' | 'pediatric_derm' | 'general';
          aiModel?: string;
          temperature?: number;
          maxTokens?: number;
          systemPrompt?: string;
          promptTemplate?: string;
          noteSections?: string[];
          outputFormat?: 'soap' | 'narrative' | 'procedure_note';
          verbosityLevel?: 'concise' | 'standard' | 'detailed';
          includeCodes?: boolean;
          isActive?: boolean;
        };
      } catch {
        payload = {};
      }

      if (payload.isDefault) {
        aiAgentConfigState.configurations.forEach((config) => {
          config.isDefault = false;
        });
      }

      if (typeof payload.name === 'string' && payload.name.trim()) {
        configuration.name = payload.name.trim();
      }
      if (typeof payload.description === 'string') {
        configuration.description = payload.description;
      }
      if (typeof payload.isDefault === 'boolean') {
        configuration.isDefault = payload.isDefault;
      }
      if (typeof payload.appointmentTypeId === 'string') {
        configuration.appointmentTypeId = payload.appointmentTypeId;
      }
      if (typeof payload.specialtyFocus === 'string') {
        configuration.specialtyFocus = payload.specialtyFocus;
      }
      if (typeof payload.aiModel === 'string') {
        configuration.aiModel = payload.aiModel;
      }
      if (typeof payload.temperature === 'number') {
        configuration.temperature = payload.temperature;
      }
      if (typeof payload.maxTokens === 'number') {
        configuration.maxTokens = payload.maxTokens;
      }
      if (typeof payload.systemPrompt === 'string') {
        configuration.systemPrompt = payload.systemPrompt;
      }
      if (typeof payload.promptTemplate === 'string') {
        configuration.promptTemplate = payload.promptTemplate;
      }
      if (Array.isArray(payload.noteSections) && payload.noteSections.length > 0) {
        configuration.noteSections = payload.noteSections;
      }
      if (typeof payload.outputFormat === 'string') {
        configuration.outputFormat = payload.outputFormat;
      }
      if (typeof payload.verbosityLevel === 'string') {
        configuration.verbosityLevel = payload.verbosityLevel;
      }
      if (typeof payload.includeCodes === 'boolean') {
        configuration.includeCodes = payload.includeCodes;
      }
      if (typeof payload.isActive === 'boolean') {
        configuration.isActive = payload.isActive;
      }
      configuration.updatedAt = new Date().toISOString();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configuration }),
      });
      return;
    }

    if (aiConfigDetailMatch && method === 'DELETE') {
      const configId = aiConfigDetailMatch[1];
      const config = aiAgentConfigState.configurations.find((item) => item.id === configId);
      if (!config) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Configuration not found' }),
        });
        return;
      }

      if (config.isDefault) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Cannot delete default configuration' }),
        });
        return;
      }

      aiAgentConfigState.configurations = aiAgentConfigState.configurations.filter((item) => item.id !== configId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/sms/conversations') {
      const conversations = smsState.conversations.map((conversation) => {
        const messages = smsState.messagesByPatient[conversation.patientId] || [];
        const latestMessage = messages[messages.length - 1];
        const consent = smsState.consentByPatient[conversation.patientId];
        const hasConsent = consent?.hasConsent ?? conversation.smsOptIn;
        return {
          ...conversation,
          smsOptIn: hasConsent,
          optedOutAt: hasConsent ? undefined : conversation.optedOutAt || new Date().toISOString(),
          lastMessage: latestMessage?.messageBody || conversation.lastMessage,
          lastMessageTime: latestMessage?.createdAt || conversation.lastMessageTime,
        };
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations }),
      });
      return;
    }

    const conversationSendMatch = path.match(/^\/api\/sms\/conversations\/([^/]+)\/send$/);
    if (method === 'POST' && conversationSendMatch) {
      const patientId = conversationSendMatch[1];
      const conversation = smsState.conversations.find((item) => item.patientId === patientId);
      if (!conversation) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Patient not found' }),
        });
        return;
      }

      let payload: { message?: string } = {};
      try {
        payload = request.postDataJSON() as { message?: string };
      } catch {
        payload = {};
      }

      if (!payload.message || !payload.message.trim()) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Message is required' }),
        });
        return;
      }

      const createdAt = new Date().toISOString();
      const messageId = `sms-message-smoke-${smsMessageCounter++}`;
      const messageBody = payload.message;
      const outboundMessage = {
        id: messageId,
        direction: 'outbound' as const,
        messageBody,
        status: 'sent',
        sentAt: createdAt,
        createdAt,
      };

      smsState.messagesByPatient[patientId] = [
        ...(smsState.messagesByPatient[patientId] || []),
        outboundMessage,
      ];
      conversation.lastMessage = messageBody;
      conversation.lastMessageTime = createdAt;
      conversation.unreadCount = 0;

      smsState.auditLogs.unshift({
        id: `sms-audit-smoke-${smsAuditCounter++}`,
        eventType: 'message_sent',
        patientId,
        patientName: `${conversation.firstName} ${conversation.lastName}`.trim(),
        userId: 'user-1',
        userName: 'Demo Admin',
        messageId,
        messagePreview: messageBody.slice(0, 160),
        direction: 'outbound',
        status: 'sent',
        createdAt,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          messageId,
          twilioSid: `SM${messageId}`,
          status: 'sent',
        }),
      });
      return;
    }

    const conversationReadMatch = path.match(/^\/api\/sms\/conversations\/([^/]+)\/mark-read$/);
    if (method === 'PUT' && conversationReadMatch) {
      const patientId = conversationReadMatch[1];
      const conversation = smsState.conversations.find((item) => item.patientId === patientId);
      if (conversation) {
        conversation.unreadCount = 0;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    const conversationDetailMatch = path.match(/^\/api\/sms\/conversations\/([^/]+)$/);
    if (method === 'GET' && conversationDetailMatch) {
      const patientId = conversationDetailMatch[1];
      const conversation = smsState.conversations.find((item) => item.patientId === patientId);
      if (!conversation) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Patient not found' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          patientId,
          patientName: `${conversation.firstName} ${conversation.lastName}`.trim(),
          patientPhone: conversation.phone,
          messages: smsState.messagesByPatient[patientId] || [],
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/sms/templates') {
      const categoryFilter = url.searchParams.get('category');
      const activeOnly = url.searchParams.get('activeOnly') === 'true';
      const templates = smsState.templates.filter((template) => {
        if (categoryFilter && template.category !== categoryFilter) return false;
        if (activeOnly && !template.isActive) return false;
        return true;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/sms/templates') {
      let payload: {
        name?: string;
        description?: string;
        messageBody?: string;
        category?: string;
      } = {};
      try {
        payload = request.postDataJSON() as {
          name?: string;
          description?: string;
          messageBody?: string;
          category?: string;
        };
      } catch {
        payload = {};
      }

      if (!payload.name || !payload.messageBody) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template name and messageBody are required' }),
        });
        return;
      }

      const createdAt = new Date().toISOString();
      const templateId = `sms-template-smoke-${smsTemplateCounter++}`;
      const template = {
        id: templateId,
        name: payload.name,
        description: payload.description,
        messageBody: payload.messageBody,
        category: payload.category || 'general_communication',
        isSystemTemplate: false,
        isActive: true,
        usageCount: 0,
        createdAt,
      };

      smsState.templates.unshift(template);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, templateId }),
      });
      return;
    }

    const templateRouteMatch = path.match(/^\/api\/sms\/templates\/([^/]+)$/);
    if (templateRouteMatch && method === 'PATCH') {
      const templateId = templateRouteMatch[1];
      const template = smsState.templates.find((item) => item.id === templateId);
      if (!template) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template not found' }),
        });
        return;
      }

      let payload: {
        name?: string;
        description?: string;
        messageBody?: string;
        category?: string;
        isActive?: boolean;
      } = {};
      try {
        payload = request.postDataJSON() as {
          name?: string;
          description?: string;
          messageBody?: string;
          category?: string;
          isActive?: boolean;
        };
      } catch {
        payload = {};
      }

      if (typeof payload.name === 'string') {
        template.name = payload.name;
      }
      if (typeof payload.description === 'string') {
        template.description = payload.description;
      }
      if (typeof payload.messageBody === 'string') {
        template.messageBody = payload.messageBody;
      }
      if (typeof payload.category === 'string') {
        template.category = payload.category;
      }
      if (typeof payload.isActive === 'boolean') {
        template.isActive = payload.isActive;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (templateRouteMatch && method === 'DELETE') {
      const templateId = templateRouteMatch[1];
      smsState.templates = smsState.templates.filter((item) => item.id !== templateId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/sms/send-bulk') {
      let payload: {
        patientIds?: string[];
        messageBody?: string;
        templateId?: string;
        scheduleTime?: string;
      } = {};
      try {
        payload = request.postDataJSON() as {
          patientIds?: string[];
          messageBody?: string;
          templateId?: string;
          scheduleTime?: string;
        };
      } catch {
        payload = {};
      }

      const patientIds = payload.patientIds || [];
      const messageBody = payload.messageBody || '';
      if (!patientIds.length || !messageBody.trim()) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'patientIds and messageBody are required' }),
        });
        return;
      }
      const createdAt = new Date().toISOString();

      if (payload.scheduleTime) {
        const scheduledId = `sms-scheduled-smoke-${smsScheduledCounter++}`;
        smsState.scheduled.unshift({
          id: scheduledId,
          patientId: patientIds[0],
          patientIds,
          patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
          messageBody,
          templateId: payload.templateId,
          templateName: smsState.templates.find((item) => item.id === payload.templateId)?.name,
          scheduledSendTime: payload.scheduleTime,
          isRecurring: false,
          status: 'scheduled',
          totalRecipients: patientIds.length,
          sentCount: 0,
          deliveredCount: 0,
          failedCount: 0,
          createdAt,
        });

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, scheduled: true, scheduledId }),
        });
        return;
      }

      const messageIds = patientIds.map((patientId) => {
        const messageId = `sms-message-smoke-${smsMessageCounter++}`;
        const outboundMessage = {
          id: messageId,
          direction: 'outbound' as const,
          messageBody,
          status: 'sent',
          sentAt: createdAt,
          createdAt,
        };
        smsState.messagesByPatient[patientId] = [
          ...(smsState.messagesByPatient[patientId] || []),
          outboundMessage,
        ];
        const conversation = smsState.conversations.find((item) => item.patientId === patientId);
        if (conversation) {
          conversation.lastMessage = messageBody;
          conversation.lastMessageTime = createdAt;
          conversation.unreadCount = 0;
        }
        return messageId;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          results: {
            total: patientIds.length,
            sent: messageIds.length,
            failed: 0,
            messageIds,
          },
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/sms/scheduled') {
      const statusFilter = url.searchParams.get('status');
      const scheduled = smsState.scheduled.filter((item) => {
        if (statusFilter && item.status !== statusFilter) return false;
        return true;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scheduled }),
      });
      return;
    }

    if (method === 'POST' && path === '/api/sms/scheduled') {
      let payload: {
        patientId?: string;
        patientIds?: string[];
        messageBody?: string;
        templateId?: string;
        scheduledSendTime?: string;
        isRecurring?: boolean;
        recurrencePattern?: string;
      } = {};
      try {
        payload = request.postDataJSON() as {
          patientId?: string;
          patientIds?: string[];
          messageBody?: string;
          templateId?: string;
          scheduledSendTime?: string;
          isRecurring?: boolean;
          recurrencePattern?: string;
        };
      } catch {
        payload = {};
      }

      const patientIds = payload.patientIds || (payload.patientId ? [payload.patientId] : []);
      if (!patientIds.length || !payload.messageBody || !payload.scheduledSendTime) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'patientId/patientIds, messageBody and scheduledSendTime are required' }),
        });
        return;
      }

      const scheduledId = `sms-scheduled-smoke-${smsScheduledCounter++}`;
      const scheduledEntry = {
        id: scheduledId,
        patientId: payload.patientId || patientIds[0],
        patientIds,
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        messageBody: payload.messageBody || '',
        templateId: payload.templateId,
        templateName: smsState.templates.find((item) => item.id === payload.templateId)?.name,
        scheduledSendTime: payload.scheduledSendTime || new Date().toISOString(),
        isRecurring: Boolean(payload.isRecurring),
        recurrencePattern: payload.recurrencePattern,
        status: 'scheduled',
        totalRecipients: patientIds.length || 1,
        sentCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        createdAt: new Date().toISOString(),
      };

      smsState.scheduled.unshift(scheduledEntry);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, scheduledId }),
      });
      return;
    }

    const scheduledDeleteMatch = path.match(/^\/api\/sms\/scheduled\/([^/]+)$/);
    if (method === 'DELETE' && scheduledDeleteMatch) {
      const scheduledId = scheduledDeleteMatch[1];
      const scheduledEntry = smsState.scheduled.find((item) => item.id === scheduledId);
      if (scheduledEntry) {
        scheduledEntry.status = 'cancelled';
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    const consentRevokeMatch = path.match(/^\/api\/sms-consent\/([^/]+)\/revoke$/);
    if (method === 'POST' && consentRevokeMatch) {
      const patientId = consentRevokeMatch[1];
      const createdAt = new Date().toISOString();
      smsState.consentByPatient[patientId] = {
        hasConsent: false,
        consent: {
          id: `sms-consent-${patientId}`,
          patientId,
          consentGiven: true,
          consentDate: createdAt,
          consentMethod: 'verbal',
          obtainedByUserId: 'user-1',
          obtainedByName: 'Demo Admin',
          consentRevoked: true,
          revokedDate: createdAt,
          revokedReason: 'Revoked in smoke test',
          createdAt,
          updatedAt: createdAt,
        },
      };
      smsState.auditLogs.unshift({
        id: `sms-audit-smoke-${smsAuditCounter++}`,
        eventType: 'consent_revoked',
        patientId,
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        userId: 'user-1',
        userName: 'Demo Admin',
        createdAt,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    const consentPatientMatch = path.match(/^\/api\/sms-consent\/([^/]+)$/);
    if (method === 'GET' && consentPatientMatch) {
      const patientId = consentPatientMatch[1];
      const consent = smsState.consentByPatient[patientId];
      if (!consent || !consent.hasConsent) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ hasConsent: false }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hasConsent: true,
          consent: consent.consent,
          daysUntilExpiration: consent.daysUntilExpiration ?? null,
        }),
      });
      return;
    }

    if (method === 'POST' && consentPatientMatch) {
      const patientId = consentPatientMatch[1];
      let payload: {
        consentMethod?: 'verbal' | 'written' | 'electronic';
        obtainedByName?: string;
        expirationDate?: string;
        notes?: string;
      } = {};
      try {
        payload = request.postDataJSON() as {
          consentMethod?: 'verbal' | 'written' | 'electronic';
          obtainedByName?: string;
          expirationDate?: string;
          notes?: string;
        };
      } catch {
        payload = {};
      }

      const createdAt = new Date().toISOString();
      smsState.consentByPatient[patientId] = {
        hasConsent: true,
        daysUntilExpiration: payload.expirationDate ? 30 : null,
        consent: {
          id: `sms-consent-${patientId}`,
          patientId,
          consentGiven: true,
          consentDate: createdAt,
          consentMethod: payload.consentMethod || 'verbal',
          obtainedByUserId: 'user-1',
          obtainedByName: payload.obtainedByName || 'Demo Admin',
          expirationDate: payload.expirationDate,
          consentRevoked: false,
          createdAt,
          updatedAt: createdAt,
        },
      };

      smsState.auditLogs.unshift({
        id: `sms-audit-smoke-${smsAuditCounter++}`,
        eventType: 'consent_obtained',
        patientId,
        patientName: `${SEEDED_PATIENT.firstName} ${SEEDED_PATIENT.lastName}`,
        userId: 'user-1',
        userName: 'Demo Admin',
        createdAt,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          consentId: `sms-consent-${patientId}`,
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/sms-audit/summary') {
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const filteredAuditLogs = smsState.auditLogs.filter((log) => {
        const ts = new Date(log.createdAt).getTime();
        if (startDate && ts < new Date(startDate).getTime()) return false;
        if (endDate && ts > new Date(endDate).getTime()) return false;
        return true;
      });

      const uniquePatients = new Set(filteredAuditLogs.map((log) => log.patientId));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messagesSent: filteredAuditLogs.filter((log) => log.eventType === 'message_sent').length,
          messagesReceived: filteredAuditLogs.filter((log) => log.eventType === 'message_received').length,
          consentsObtained: filteredAuditLogs.filter((log) => log.eventType === 'consent_obtained').length,
          consentsRevoked: filteredAuditLogs.filter((log) => log.eventType === 'consent_revoked').length,
          optOuts: filteredAuditLogs.filter((log) => log.eventType === 'opt_out').length,
          uniquePatients: uniquePatients.size,
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/sms-audit/export') {
      const csvLines = [
        'Event Type,Patient Name,Staff Member,Message Preview,Direction,Status,Timestamp',
        ...smsState.auditLogs.map((log) =>
          [
            log.eventType,
            log.patientName,
            log.userName || '',
            (log.messagePreview || '').replace(/"/g, '""'),
            log.direction || '',
            log.status || '',
            log.createdAt,
          ]
            .map((value) => `"${String(value)}"`)
            .join(',')
        ),
      ];
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: csvLines.join('\n'),
      });
      return;
    }

    if (method === 'GET' && path === '/api/sms-audit') {
      const patientId = url.searchParams.get('patientId');
      const eventType = url.searchParams.get('eventType');
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const limit = Number(url.searchParams.get('limit') || 100);
      const offset = Number(url.searchParams.get('offset') || 0);

      const filteredAuditLogs = smsState.auditLogs.filter((log) => {
        const ts = new Date(log.createdAt).getTime();
        if (patientId && log.patientId !== patientId) return false;
        if (eventType && log.eventType !== eventType) return false;
        if (startDate && ts < new Date(startDate).getTime()) return false;
        if (endDate && ts > new Date(endDate).getTime()) return false;
        return true;
      });

      const pagedLogs = filteredAuditLogs.slice(offset, offset + limit);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          auditLogs: pagedLogs,
          pagination: {
            total: filteredAuditLogs.length,
            limit,
            offset,
            hasMore: offset + limit < filteredAuditLogs.length,
          },
        }),
      });
      return;
    }

    if (method === 'GET' && path === '/api/messaging/threads') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ threads: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * Custom fixture that provides an authenticated page session
 * This helps avoid logging in for every test
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    if (process.env.PLAYWRIGHT_MOCK_AUTH) {
      const mockAccessToken = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6InBsYXl3cmlnaHQtdXNlciJ9.signature';

      await page.route('**/api/auth/refresh', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tokens: {
              accessToken: mockAccessToken,
              refreshToken: 'playwright-refresh',
              expiresIn: 3600,
            },
            user: {
              id: 'user-1',
              email: 'admin@demo.practice',
              fullName: 'Demo Admin',
              role: 'admin',
              tenantId: 'tenant-demo',
            },
          }),
        });
      });

      await page.addInitScript((token: string) => {
        localStorage.setItem(
          'derm_session',
          JSON.stringify({
            tenantId: 'tenant-demo',
            accessToken: token,
            refreshToken: 'playwright-refresh',
            user: {
              id: 'user-1',
              email: 'admin@demo.practice',
              fullName: 'Demo Admin',
              role: 'admin',
            },
          })
        );
      }, mockAccessToken);

      if (process.env.PLAYWRIGHT_MOCK_DATA) {
        await installMockDataRoutes(page);
      }

      await page.goto('/home');
      await page.waitForURL(/\/home/i, { timeout: 45000 });
      await use(page);
      return;
    }

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
    await page.waitForURL(/\/(home|dashboard)/i);
    await use(page);
  },

  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
});

export { expect } from '@playwright/test';
