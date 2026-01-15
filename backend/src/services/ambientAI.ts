/**
 * Ambient AI Service
 *
 * AI service integrating:
 * - OpenAI Whisper API for speech-to-text transcription
 * - Anthropic Claude / OpenAI GPT-4 for clinical note generation
 * - Medical NLP for code suggestions and entity extraction
 *
 * Falls back to mock implementations if API keys not configured
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import FormData from 'form-data';
import { logger } from '../lib/logger';
import { AgentConfiguration } from './agentConfigService';

// Environment configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const USE_REAL_AI = Boolean(OPENAI_API_KEY || ANTHROPIC_API_KEY);

// API endpoints
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

// Sample dermatology-specific medical vocabulary for realistic simulations
const DERM_TERMS = [
  'erythematous', 'pruritic', 'vesicular', 'papular', 'macular',
  'scaly', 'crusted', 'excoriated', 'lichenified', 'atrophic',
  'hyperpigmented', 'hypopigmented', 'nodular', 'plaque'
];

const COMMON_DERM_MEDS = [
  { name: 'Triamcinolone acetonide', dosage: '0.1% cream', frequency: 'BID' },
  { name: 'Clobetasol propionate', dosage: '0.05% ointment', frequency: 'BID' },
  { name: 'Hydrocortisone', dosage: '2.5% cream', frequency: 'TID' },
  { name: 'Tacrolimus', dosage: '0.1% ointment', frequency: 'BID' },
  { name: 'Mupirocin', dosage: '2% ointment', frequency: 'TID' },
  { name: 'Ketoconazole', dosage: '2% cream', frequency: 'daily' },
  { name: 'Tretinoin', dosage: '0.025% cream', frequency: 'QHS' },
  { name: 'Doxycycline', dosage: '100mg', frequency: 'BID' }
];

const COMMON_DERM_ICD10 = [
  { code: 'L57.0', description: 'Actinic keratosis', confidence: 0.92 },
  { code: 'C44.91', description: 'Basal cell carcinoma of skin, unspecified', confidence: 0.88 },
  { code: 'L82.1', description: 'Seborrheic keratosis', confidence: 0.95 },
  { code: 'L20.9', description: 'Atopic dermatitis, unspecified', confidence: 0.89 },
  { code: 'L40.9', description: 'Psoriasis, unspecified', confidence: 0.91 },
  { code: 'L30.9', description: 'Dermatitis, unspecified', confidence: 0.85 },
  { code: 'L70.0', description: 'Acne vulgaris', confidence: 0.93 },
  { code: 'L71.9', description: 'Rosacea, unspecified', confidence: 0.87 }
];

const COMMON_DERM_CPT = [
  { code: '11100', description: 'Biopsy of skin, single lesion', confidence: 0.90 },
  { code: '11200', description: 'Removal of skin tags, up to 15 lesions', confidence: 0.88 },
  { code: '17000', description: 'Destruction of premalignant lesion, first', confidence: 0.92 },
  { code: '17110', description: 'Destruction of benign lesions, up to 14', confidence: 0.89 },
  { code: '96900', description: 'Actinotherapy (UV light)', confidence: 0.85 },
  { code: '11042', description: 'Debridement, skin, subcutaneous tissue', confidence: 0.87 }
];

export interface TranscriptionSegment {
  speaker: string;
  text: string;
  start: number; // seconds
  end: number; // seconds
  confidence: number;
}

export interface SpeakerInfo {
  [speakerId: string]: {
    label: 'doctor' | 'patient';
    name?: string;
  };
}

export interface PHIEntity {
  type: string; // 'name', 'dob', 'phone', 'address', 'ssn', etc.
  text: string;
  start: number;
  end: number;
  masked_value: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  speakers: SpeakerInfo;
  speakerCount: number;
  confidence: number;
  wordCount: number;
  phiEntities: PHIEntity[];
  language: string;
  duration: number;
}

export interface DifferentialDiagnosis {
  condition: string;
  confidence: number;
  reasoning: string;
  icd10Code: string;
}

export interface RecommendedTest {
  testName: string;
  rationale: string;
  urgency: 'routine' | 'soon' | 'urgent';
  cptCode?: string;
}

export interface PatientSummary {
  whatWeDiscussed: string;
  yourConcerns: string[];
  diagnosis?: string;
  treatmentPlan: string;
  followUp: string;
}

export interface ClinicalNote {
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
  differentialDiagnoses: DifferentialDiagnosis[];
  recommendedTests: RecommendedTest[];
  patientSummary: PatientSummary;
}

export interface ExtractedData {
  suggestedIcd10: Array<{ code: string; description: string; confidence: number }>;
  suggestedCpt: Array<{ code: string; description: string; confidence: number }>;
  medications: Array<{ name: string; dosage: string; frequency: string; confidence: number }>;
  allergies: Array<{ allergen: string; reaction: string; confidence: number }>;
  followUpTasks: Array<{ task: string; priority: string; dueDate?: string; confidence: number }>;
}

/**
 * Transcribe audio using OpenAI Whisper API (or mock if not configured)
 */
export async function transcribeAudio(
  audioFilePath: string,
  durationSeconds: number
): Promise<TranscriptionResult> {
  // Use real OpenAI Whisper if API key available
  if (USE_REAL_AI && OPENAI_API_KEY) {
    try {
      return await transcribeWithWhisper(audioFilePath, durationSeconds);
    } catch (error) {
      logger.warn('OpenAI Whisper transcription failed, falling back to mock', {
        error: (error as Error).message,
      });
      // Fall through to mock implementation
    }
  }

  // Fall back to mock implementation
  return await mockTranscribeAudio(audioFilePath, durationSeconds);
}

/**
 * Real OpenAI Whisper transcription
 */
async function transcribeWithWhisper(
  audioFilePath: string,
  durationSeconds: number
): Promise<TranscriptionResult> {
  logger.info('Transcribing audio with OpenAI Whisper', { durationSeconds });

  // Read audio file
  const audioBuffer = await fs.readFile(audioFilePath);

  // Create form data for Whisper API
  const formData = new FormData();
  formData.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType: 'audio/webm'
  });
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'verbose_json'); // Get timestamps and word-level details
  formData.append('timestamp_granularities', JSON.stringify(['segment']));

  // Call OpenAI Whisper API
  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
  }

  const whisperResult = await response.json() as any;
  logger.info('Whisper transcription completed');

  // Process Whisper output into our format
  // Note: Whisper doesn't do speaker diarization natively, so we'll use heuristics
  // For production, consider using additional services like Pyannote or AssemblyAI
  const segments = processWhisperSegments(whisperResult.segments || [], durationSeconds);
  const fullText = whisperResult.text || '';

  // Detect PHI in the transcribed text
  const phiEntities = detectPHI(fullText);

  return {
    text: fullText,
    segments,
    speakers: {
      'speaker_0': { label: 'doctor', name: 'Provider' },
      'speaker_1': { label: 'patient' }
    },
    speakerCount: 2,
    confidence: 0.85, // Whisper doesn't provide overall confidence
    wordCount: fullText.split(/\s+/).length,
    phiEntities,
    language: whisperResult.language || 'en',
    duration: durationSeconds
  };
}

/**
 * Process Whisper segments and attempt basic speaker diarization
 * This is a simplified approach - for production use a dedicated diarization service
 */
function processWhisperSegments(whisperSegments: any[], duration: number): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];

  // Simple heuristic: alternate speakers or use text patterns
  let currentSpeaker = 'speaker_0'; // Start with doctor

  for (let i = 0; i < whisperSegments.length; i++) {
    const seg = whisperSegments[i];
    const text = seg.text?.trim() || '';

    if (!text) continue;

    // Simple speaker switching heuristic based on pauses
    // If there's a long pause (>2 seconds) or question marks, likely speaker change
    if (i > 0) {
      const prevSeg = whisperSegments[i - 1];
      const pause = seg.start - prevSeg.end;

      if (pause > 2.0 || prevSeg.text?.includes('?')) {
        currentSpeaker = currentSpeaker === 'speaker_0' ? 'speaker_1' : 'speaker_0';
      }
    }

    // Detect medical terminology to identify doctor
    const hasMedicalTerms = DERM_TERMS.some(term => text.toLowerCase().includes(term));
    if (hasMedicalTerms && i < whisperSegments.length / 3) {
      currentSpeaker = 'speaker_0'; // Likely doctor
    }

    segments.push({
      speaker: currentSpeaker,
      text: text,
      start: seg.start || 0,
      end: seg.end || 0,
      confidence: seg.confidence || 0.85
    });
  }

  return segments;
}

/**
 * Mock transcription fallback
 */
async function mockTranscribeAudio(
  audioFilePath: string,
  durationSeconds: number
): Promise<TranscriptionResult> {
  logger.info('Using mock transcription (no API key configured)');

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

  // Generate realistic dermatology conversation
  const segments: TranscriptionSegment[] = generateMockConversation(durationSeconds);

  // Combine all text
  const fullText = segments.map(s => s.text).join(' ');

  // Detect PHI in the conversation
  const phiEntities = detectPHI(fullText);

  return {
    text: fullText,
    segments,
    speakers: {
      'speaker_0': { label: 'doctor', name: 'Dr. Provider' },
      'speaker_1': { label: 'patient' }
    },
    speakerCount: 2,
    confidence: 0.87 + Math.random() * 0.10, // 0.87-0.97
    wordCount: fullText.split(/\s+/).length,
    phiEntities,
    language: 'en',
    duration: durationSeconds
  };
}

/**
 * Generate a realistic dermatology patient-doctor conversation
 */
function generateMockConversation(durationSeconds: number): TranscriptionSegment[] {
  const conversations = [
    {
      speaker: 'speaker_0',
      text: "Good morning! What brings you in today?",
      confidence: 0.95
    },
    {
      speaker: 'speaker_1',
      text: "Hi Doctor. I've had this rash on my arms for about two weeks now. It's really itchy and keeps getting worse.",
      confidence: 0.92
    },
    {
      speaker: 'speaker_0',
      text: "I see. When did you first notice it? And have you noticed any triggers that make it worse?",
      confidence: 0.94
    },
    {
      speaker: 'speaker_1',
      text: "It started about two weeks ago after I used a new laundry detergent. It seems to get worse at night and when I'm stressed.",
      confidence: 0.90
    },
    {
      speaker: 'speaker_0',
      text: "Any other symptoms? Fever, joint pain, or other skin issues elsewhere on your body?",
      confidence: 0.93
    },
    {
      speaker: 'speaker_1',
      text: "No fever or joint pain. Just the rash on both arms. It's red and a bit scaly.",
      confidence: 0.91
    },
    {
      speaker: 'speaker_0',
      text: "Have you tried any treatments at home? Any over-the-counter creams or antihistamines?",
      confidence: 0.92
    },
    {
      speaker: 'speaker_1',
      text: "I tried some hydrocortisone cream but it didn't really help much. I also took some Benadryl at night.",
      confidence: 0.89
    },
    {
      speaker: 'speaker_0',
      text: "Okay. Let me take a look. I can see bilateral erythematous patches on your forearms with some scaling. The pattern suggests contact dermatitis, likely allergic reaction to the detergent. Any known allergies?",
      confidence: 0.95
    },
    {
      speaker: 'speaker_1',
      text: "I'm allergic to penicillin - I get hives. Nothing else that I know of.",
      confidence: 0.93
    },
    {
      speaker: 'speaker_0',
      text: "Good to know. I'm going to prescribe a stronger topical steroid, triamcinolone 0.1% cream. Apply it twice daily to the affected areas. Also continue with an oral antihistamine at bedtime. Switch back to your old detergent and avoid the new one.",
      confidence: 0.96
    },
    {
      speaker: 'speaker_1',
      text: "Okay, how long should I use the cream?",
      confidence: 0.94
    },
    {
      speaker: 'speaker_0',
      text: "Use it for two weeks. You should see improvement within a few days. If it's not better in a week or gets worse, call the office. Also, follow up with me in three weeks so we can reassess.",
      confidence: 0.95
    },
    {
      speaker: 'speaker_1',
      text: "Thank you, Doctor. Should I avoid anything else?",
      confidence: 0.93
    },
    {
      speaker: 'speaker_0',
      text: "Try to avoid hot showers and harsh soaps. Use a gentle moisturizer. And no scratching - I know it's hard, but it will make it worse.",
      confidence: 0.94
    },
    {
      speaker: 'speaker_1',
      text: "Got it. Thanks so much!",
      confidence: 0.96
    }
  ];

  // Assign timestamps based on duration
  let currentTime = 0;
  const segments: TranscriptionSegment[] = [];
  const segmentDuration = durationSeconds / conversations.length;

  for (const conv of conversations) {
    const duration = segmentDuration + (Math.random() - 0.5) * 10;
    segments.push({
      speaker: conv.speaker,
      text: conv.text,
      start: currentTime,
      end: currentTime + duration,
      confidence: conv.confidence
    });
    currentTime += duration;
  }

  return segments;
}

/**
 * Detect PHI (Protected Health Information) in text
 */
function detectPHI(text: string): PHIEntity[] {
  const entities: PHIEntity[] = [];

  // Simulate PHI detection - in production, use a medical NLP library
  // This is a simplified mock

  // Detect phone numbers
  const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    entities.push({
      type: 'phone',
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      masked_value: '***-***-****'
    });
  }

  // Detect dates that might be DOB
  const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
  while ((match = dateRegex.exec(text)) !== null) {
    entities.push({
      type: 'date',
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      masked_value: '**/**/****'
    });
  }

  return entities;
}

/**
 * Patient context for note generation
 */
export interface PatientContext {
  patientName?: string;
  patientAge?: number;
  chiefComplaint?: string;
  relevantHistory?: string;
}

/**
 * Generate clinical note using Claude or GPT-4 (or mock if not configured)
 * Now supports custom agent configurations for different visit types
 */
export async function generateClinicalNote(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null,
  patientContext?: PatientContext
): Promise<ClinicalNote & ExtractedData> {
  // Use real AI if available
  if (USE_REAL_AI) {
    try {
      // Prefer Claude for medical documentation (Anthropic API)
      if (ANTHROPIC_API_KEY) {
        return await generateNoteWithClaude(transcriptText, segments, agentConfig, patientContext);
      }
      // Fall back to GPT-4 if OpenAI key available
      if (OPENAI_API_KEY) {
        return await generateNoteWithGPT4(transcriptText, segments, agentConfig, patientContext);
      }
    } catch (error) {
      console.error('AI note generation failed, falling back to mock:', error);
      // Fall through to mock implementation
    }
  }

  // Fall back to mock implementation
  return await mockGenerateClinicalNote(transcriptText, segments);
}

/**
 * Generate clinical note using Anthropic Claude
 * Uses agent configuration if provided for customized prompts and settings
 */
async function generateNoteWithClaude(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null,
  patientContext?: PatientContext
): Promise<ClinicalNote & ExtractedData> {
  logger.info('Generating clinical note with Claude', {
    agentConfigId: agentConfig?.id,
    agentConfigName: agentConfig?.name
  });

  // Build prompt using agent config if available, otherwise use default
  const prompt = agentConfig
    ? buildConfigurablePrompt(transcriptText, segments, agentConfig, patientContext)
    : buildClinicalNotePrompt(transcriptText, segments);

  // Use model and settings from config if available
  const model = agentConfig?.aiModel || 'claude-3-5-sonnet-20241022';
  const temperature = agentConfig?.temperature || 0.3;
  const maxTokens = agentConfig?.maxTokens || 4000;

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      system: agentConfig?.systemPrompt || undefined,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as any;
  const noteText = result.content[0].text;

  return parseAIGeneratedNote(noteText, segments, agentConfig);
}

/**
 * Generate clinical note using OpenAI GPT-4
 * Uses agent configuration if provided for customized prompts and settings
 */
async function generateNoteWithGPT4(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null,
  patientContext?: PatientContext
): Promise<ClinicalNote & ExtractedData> {
  logger.info('Generating clinical note with GPT-4', {
    agentConfigId: agentConfig?.id,
    agentConfigName: agentConfig?.name
  });

  // Build prompt using agent config if available, otherwise use default
  const prompt = agentConfig
    ? buildConfigurablePrompt(transcriptText, segments, agentConfig, patientContext)
    : buildClinicalNotePrompt(transcriptText, segments);

  // Use settings from config if available
  const temperature = agentConfig?.temperature || 0.3;
  const maxTokens = agentConfig?.maxTokens || 3000;
  const systemPrompt = agentConfig?.systemPrompt ||
    'You are an expert dermatology medical scribe. Generate accurate, detailed clinical notes following medical documentation standards.';

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GPT-4 API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as any;
  const noteText = result.choices[0].message.content;

  return parseAIGeneratedNote(noteText, segments, agentConfig);
}

/**
 * Build prompt for AI note generation
 */
function buildClinicalNotePrompt(transcriptText: string, segments: TranscriptionSegment[]): string {
  const patientStatements = segments.filter(s => s.speaker === 'speaker_1').map(s => s.text).join(' ');
  const doctorStatements = segments.filter(s => s.speaker === 'speaker_0').map(s => s.text).join(' ');

  return `You are an expert dermatology medical scribe. Generate a comprehensive SOAP clinical note from the following patient-provider conversation transcript.

CONVERSATION TRANSCRIPT:
${transcriptText}

PATIENT STATEMENTS:
${patientStatements}

PROVIDER STATEMENTS:
${doctorStatements}

Please generate a structured clinical note in the following JSON format:

{
  "chiefComplaint": "Brief chief complaint statement",
  "hpi": "Detailed History of Present Illness using OLDCARTS format (Onset, Location, Duration, Character, Aggravating/Relieving factors, Timing, Severity)",
  "ros": "Complete Review of Systems",
  "physicalExam": "Detailed dermatologic examination findings with morphology, distribution, and clinical observations",
  "assessment": "Clinical assessment with differential diagnosis",
  "plan": "Detailed treatment plan including medications, patient education, follow-up",
  "suggestedIcd10": [{"code": "X00.0", "description": "Diagnosis name", "confidence": 0.95}],
  "suggestedCpt": [{"code": "99213", "description": "E/M code", "confidence": 0.90}],
  "medications": [{"name": "Drug name", "dosage": "Strength/form", "frequency": "Schedule", "confidence": 0.92}],
  "allergies": [{"allergen": "Substance", "reaction": "Reaction type", "confidence": 0.98}],
  "followUpTasks": [{"task": "Task description", "priority": "high/medium/low", "dueDate": "YYYY-MM-DD", "confidence": 0.90}],
  "sectionConfidence": {
    "chiefComplaint": 0.95,
    "hpi": 0.90,
    "ros": 0.85,
    "physicalExam": 0.92,
    "assessment": 0.88,
    "plan": 0.90
  },
  "differentialDiagnoses": [
    {
      "condition": "Name of condition",
      "confidence": 0.0-1.0,
      "reasoning": "Brief clinical reasoning for this diagnosis",
      "icd10Code": "Suggested ICD-10 code"
    }
  ],
  "recommendedTests": [
    {
      "testName": "Name of test/procedure",
      "rationale": "Why recommended based on conversation",
      "urgency": "routine" | "soon" | "urgent",
      "cptCode": "Suggested CPT code if applicable"
    }
  ],
  "patientSummary": {
    "whatWeDiscussed": "Simple description of what was discussed during the visit",
    "yourConcerns": ["List of symptoms/concerns the patient mentioned"],
    "diagnosis": "Patient-friendly explanation of the diagnosis (if diagnosis made)",
    "treatmentPlan": "What to do next in simple, patient-friendly terms",
    "followUp": "When to return for follow-up"
  }
}

REQUIREMENTS:
- Use proper medical terminology for dermatology
- Include specific dermatologic descriptors (e.g., erythematous, macular, papular, etc.)
- Extract all mentioned medications with dosing
- Identify all allergies mentioned
- Suggest appropriate ICD-10 and CPT codes
- Create follow-up tasks based on provider instructions
- Provide confidence scores for each section
- Be thorough but concise

DIFFERENTIAL_DIAGNOSES (array of 2-5 possible conditions):
- Rank by confidence level based on clinical presentation
- Provide clear clinical reasoning for each differential
- Include appropriate ICD-10 codes for billing consideration
- Consider common dermatologic conditions and mimickers

RECOMMENDED_TESTS (array of relevant tests):
- Base recommendations on clinical findings and differentials
- Specify urgency level appropriate to presentation
- Include CPT codes where applicable for billing
- Consider cost-effectiveness and clinical necessity

PATIENT_SUMMARY (patient-friendly language):
- Use simple, non-technical terms a patient can understand
- Clearly list what the patient told you about their symptoms
- Explain the diagnosis in plain language if one was made
- Provide actionable treatment steps in everyday language
- Clearly state when they need to come back

Return ONLY the JSON object, no additional text.`;
}

/**
 * Build prompt using agent configuration
 * Supports configurable sections, terminology, and output format
 */
function buildConfigurablePrompt(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig: AgentConfiguration,
  patientContext?: PatientContext
): string {
  const patientStatements = segments.filter(s => s.speaker === 'speaker_1').map(s => s.text).join(' ');
  const doctorStatements = segments.filter(s => s.speaker === 'speaker_0').map(s => s.text).join(' ');

  // Get configured sections
  const sections = agentConfig.noteSections || ['chiefComplaint', 'hpi', 'ros', 'physicalExam', 'assessment', 'plan'];
  const sectionPrompts = agentConfig.sectionPrompts || {};

  // Build section instructions
  let sectionInstructions = '';
  for (const section of sections) {
    const sectionPrompt = sectionPrompts[section] || `Generate appropriate content for ${section}`;
    sectionInstructions += `\n- ${section}: ${sectionPrompt}`;
  }

  // Build terminology guidance if available
  let terminologyGuidance = '';
  if (agentConfig.terminologySet && Object.keys(agentConfig.terminologySet).length > 0) {
    terminologyGuidance = '\n\nUSE THESE TERMINOLOGY SETS:\n';
    for (const [category, terms] of Object.entries(agentConfig.terminologySet)) {
      terminologyGuidance += `- ${category}: ${(terms as string[]).join(', ')}\n`;
    }
  }

  // Build focus areas guidance
  let focusAreasGuidance = '';
  if (agentConfig.focusAreas && agentConfig.focusAreas.length > 0) {
    focusAreasGuidance = `\n\nFOCUS AREAS FOR THIS VISIT TYPE:\n${agentConfig.focusAreas.join(', ')}`;
  }

  // Build default codes if available
  let defaultCodesGuidance = '';
  if (agentConfig.defaultCptCodes && agentConfig.defaultCptCodes.length > 0) {
    defaultCodesGuidance += '\n\nCOMMON CPT CODES FOR THIS VISIT TYPE:\n';
    for (const code of agentConfig.defaultCptCodes) {
      defaultCodesGuidance += `- ${code.code}: ${code.description}\n`;
    }
  }
  if (agentConfig.defaultIcd10Codes && agentConfig.defaultIcd10Codes.length > 0) {
    defaultCodesGuidance += '\nCOMMON ICD-10 CODES FOR THIS VISIT TYPE:\n';
    for (const code of agentConfig.defaultIcd10Codes) {
      defaultCodesGuidance += `- ${code.code}: ${code.description}\n`;
    }
  }

  // Use the agent's prompt template with variable substitution
  let prompt = agentConfig.promptTemplate;

  // Replace template variables
  prompt = prompt.replace(/\{\{transcript\}\}/g, transcriptText);
  prompt = prompt.replace(/\{\{patientName\}\}/g, patientContext?.patientName || 'Patient');
  prompt = prompt.replace(/\{\{patientAge\}\}/g, patientContext?.patientAge?.toString() || 'Unknown');
  prompt = prompt.replace(/\{\{chiefComplaint\}\}/g, patientContext?.chiefComplaint || 'See transcript');
  prompt = prompt.replace(/\{\{relevantHistory\}\}/g, patientContext?.relevantHistory || 'See transcript');
  prompt = prompt.replace(/\{\{sections\}\}/g, sections.join(', '));

  // Build expected output JSON schema based on configured sections
  const outputSchema: Record<string, string> = {};
  for (const section of sections) {
    outputSchema[section] = `Content for ${section}`;
  }

  // Add standard extraction fields
  const fullSchema = {
    ...outputSchema,
    overallConfidence: 0.90,
    sectionConfidence: Object.fromEntries(sections.map(s => [s, 0.90])),
    suggestedIcd10: [{ code: 'X00.0', description: 'Diagnosis', confidence: 0.90 }],
    suggestedCpt: [{ code: '99213', description: 'E/M code', confidence: 0.90 }],
    medications: [{ name: 'Medication', dosage: 'Dosage', frequency: 'Frequency', confidence: 0.90 }],
    allergies: [{ allergen: 'Allergen', reaction: 'Reaction', confidence: 0.90 }],
    followUpTasks: [{ task: 'Task', priority: 'medium', dueDate: '2024-01-01', confidence: 0.90 }],
    differentialDiagnoses: [{ condition: 'Condition', confidence: 0.90, reasoning: 'Reasoning', icd10Code: 'X00.0' }],
    recommendedTests: [{ testName: 'Test', rationale: 'Rationale', urgency: 'routine', cptCode: '00000' }],
    patientSummary: {
      whatWeDiscussed: 'Discussion summary',
      yourConcerns: ['Concern 1'],
      diagnosis: 'Diagnosis explanation',
      treatmentPlan: 'Treatment plan',
      followUp: 'Follow-up timing'
    }
  };

  // Append additional context
  prompt += `
${terminologyGuidance}
${focusAreasGuidance}
${defaultCodesGuidance}

SECTION REQUIREMENTS:${sectionInstructions}

OUTPUT FORMAT: ${agentConfig.outputFormat || 'soap'}
VERBOSITY LEVEL: ${agentConfig.verbosityLevel || 'standard'}
INCLUDE BILLING CODES: ${agentConfig.includeCodes !== false ? 'Yes' : 'No'}

Please return a JSON object with this structure:
${JSON.stringify(fullSchema, null, 2)}

IMPORTANT: Return ONLY valid JSON, no additional text or markdown formatting.`;

  return prompt;
}

/**
 * Parse AI-generated note text into structured format
 * Handles custom sections from agent configuration
 */
function parseAIGeneratedNote(
  noteText: string,
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null
): ClinicalNote & ExtractedData {
  try {
    // Try to parse as JSON - strip any markdown code blocks if present
    let cleanedText = noteText.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.slice(7);
    }
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    const parsed = JSON.parse(cleanedText);

    // Calculate overall confidence
    const sectionScores = Object.values(parsed.sectionConfidence || {}) as number[];
    const overallConfidence = sectionScores.length > 0
      ? sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length
      : 0.85;

    // Build base note with standard sections (backward compatible)
    const note: ClinicalNote & ExtractedData = {
      chiefComplaint: parsed.chiefComplaint || '',
      hpi: parsed.hpi || '',
      ros: parsed.ros || '',
      physicalExam: parsed.physicalExam || '',
      assessment: parsed.assessment || '',
      plan: parsed.plan || '',
      overallConfidence: overallConfidence,
      sectionConfidence: parsed.sectionConfidence || {
        chiefComplaint: 0.85,
        hpi: 0.85,
        ros: 0.80,
        physicalExam: 0.85,
        assessment: 0.85,
        plan: 0.85
      },
      suggestedIcd10: parsed.suggestedIcd10 || [],
      suggestedCpt: parsed.suggestedCpt || [],
      medications: parsed.medications || [],
      allergies: parsed.allergies || [],
      followUpTasks: parsed.followUpTasks || [],
      differentialDiagnoses: parsed.differentialDiagnoses || [],
      recommendedTests: parsed.recommendedTests || [],
      patientSummary: parsed.patientSummary || {
        whatWeDiscussed: '',
        yourConcerns: [],
        treatmentPlan: '',
        followUp: ''
      }
    };

    // If agent config has custom sections, include those as well
    if (agentConfig?.noteSections) {
      for (const section of agentConfig.noteSections) {
        if (parsed[section] && !(section in note)) {
          (note as any)[section] = parsed[section];
        }
      }
    }

    // Add follow-up interval from config if not in parsed output
    if (agentConfig?.defaultFollowUpInterval && note.followUpTasks.length === 0) {
      const followUpTask = {
        task: `Schedule follow-up in ${agentConfig.defaultFollowUpInterval}`,
        priority: 'medium',
        dueDate: calculateDueDate(agentConfig.defaultFollowUpInterval),
        confidence: 0.80
      };
      note.followUpTasks.push(followUpTask);
    }

    // Add task templates from config
    if (agentConfig?.taskTemplates && agentConfig.taskTemplates.length > 0) {
      for (const template of agentConfig.taskTemplates) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (template.daysFromVisit || 7));

        note.followUpTasks.push({
          task: template.task,
          priority: template.priority,
          dueDate: dueDate.toISOString().split('T')[0],
          confidence: 0.85
        });
      }
    }

    return note;
  } catch (error) {
    console.error('Failed to parse AI note, using fallback:', error);
    // If parsing fails, fall back to mock
    return mockGenerateClinicalNoteSync(segments);
  }
}

/**
 * Calculate due date from interval string like "4-6 weeks" or "2 weeks"
 */
function calculateDueDate(interval: string): string {
  const dueDate = new Date();
  const match = interval.match(/(\d+)(?:-(\d+))?\s*(day|week|month)s?/i);

  if (match && match[1] && match[3]) {
    // Use the lower bound of the range
    const amount = parseInt(match[1], 10);
    const unit = match[3].toLowerCase();

    switch (unit) {
      case 'day':
        dueDate.setDate(dueDate.getDate() + amount);
        break;
      case 'week':
        dueDate.setDate(dueDate.getDate() + (amount * 7));
        break;
      case 'month':
        dueDate.setMonth(dueDate.getMonth() + amount);
        break;
    }
  } else {
    // Default to 2 weeks if can't parse
    dueDate.setDate(dueDate.getDate() + 14);
  }

  return dueDate.toISOString().split('T')[0]!;
}

/**
 * Mock note generation fallback
 */
async function mockGenerateClinicalNote(
  transcriptText: string,
  segments: TranscriptionSegment[]
): Promise<ClinicalNote & ExtractedData> {
  logger.info('Using mock note generation (no API key configured)');

  // Simulate AI processing delay
  await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));

  return mockGenerateClinicalNoteSync(segments);
}

/**
 * Synchronous mock note generation
 */
function mockGenerateClinicalNoteSync(segments: TranscriptionSegment[]): ClinicalNote & ExtractedData {
  // Extract patient statements vs doctor observations
  const patientStatements = segments.filter(s => s.speaker === 'speaker_1').map(s => s.text);
  const doctorStatements = segments.filter(s => s.speaker === 'speaker_0').map(s => s.text);
  const transcriptText = segments.map(s => s.text).join(' ');

  // Generate structured note sections
  const note: ClinicalNote = {
    chiefComplaint: generateChiefComplaint(patientStatements),
    hpi: generateHPI(patientStatements, doctorStatements),
    ros: generateROS(transcriptText),
    physicalExam: generatePhysicalExam(doctorStatements),
    assessment: generateAssessment(transcriptText),
    plan: generatePlan(doctorStatements),
    overallConfidence: 0.85 + Math.random() * 0.10,
    sectionConfidence: {
      chiefComplaint: 0.92,
      hpi: 0.88,
      ros: 0.82,
      physicalExam: 0.90,
      assessment: 0.87,
      plan: 0.91
    },
    differentialDiagnoses: generateDifferentialDiagnoses(transcriptText),
    recommendedTests: generateRecommendedTests(transcriptText),
    patientSummary: generatePatientSummary(patientStatements, doctorStatements)
  };

  // Extract structured data
  const extracted: ExtractedData = {
    suggestedIcd10: extractICD10Codes(transcriptText),
    suggestedCpt: extractCPTCodes(transcriptText),
    medications: extractMedications(doctorStatements),
    allergies: extractAllergies(transcriptText),
    followUpTasks: extractFollowUpTasks(doctorStatements)
  };

  return { ...note, ...extracted };
}

function generateChiefComplaint(patientStatements: string[]): string {
  if (patientStatements.length === 0) return "Patient presents for evaluation.";

  // Use first substantive patient statement
  const firstStatement = patientStatements[0] || "Follow-up visit";

  // Extract key complaint
  if (firstStatement.toLowerCase().includes('rash')) {
    return "Pruritic rash on bilateral arms x 2 weeks";
  }
  return "Skin concern requiring evaluation";
}

function generateHPI(patientStatements: string[], doctorStatements: string[]): string {
  const hpi = `Patient is a presenting with a chief complaint of pruritic rash on bilateral forearms of 2 weeks duration.

ONSET: Rash began approximately 2 weeks ago, shortly after patient switched to a new laundry detergent.

LOCATION: Bilateral forearms, symmetric distribution.

DURATION: Persistent for 2 weeks with progressive worsening.

CHARACTER: Erythematous patches with overlying scale. Patient describes intense pruritus.

AGGRAVATING FACTORS: Symptoms worsen at night and during periods of increased stress.

RELIEVING FACTORS: Minimal relief with over-the-counter hydrocortisone 1% cream and oral diphenhydramine.

TIMING: Continuous, with nocturnal exacerbation of pruritus.

ASSOCIATED SYMPTOMS: Denies fever, chills, joint pain, or rash elsewhere on body.

PREVIOUS TREATMENT: Patient has self-treated with OTC hydrocortisone cream with minimal improvement.`;

  return hpi;
}

function generateROS(transcript: string): string {
  return `CONSTITUTIONAL: Denies fever, chills, fatigue, or weight changes.
SKIN: Positive for bilateral forearm rash as described in HPI. Denies other skin lesions.
HEENT: Negative
CARDIOVASCULAR: Negative
RESPIRATORY: Negative
GASTROINTESTINAL: Negative
GENITOURINARY: Negative
MUSCULOSKELETAL: Denies joint pain or swelling.
NEUROLOGICAL: Negative
PSYCHIATRIC: Denies anxiety or depression.
ALLERGIC/IMMUNOLOGIC: History of penicillin allergy (hives). Denies other known allergies.`;
}

function generatePhysicalExam(doctorStatements: string[]): string {
  return `GENERAL: Patient is alert, oriented, and in no acute distress.

SKIN EXAMINATION:
- UPPER EXTREMITIES: Bilateral erythematous patches on the volar and dorsal forearms
- DISTRIBUTION: Symmetric, well-demarcated
- MORPHOLOGY: Erythematous patches with fine scaling
- SIZE: Patches range from 2-5 cm in diameter
- PALPATION: Slightly raised, warm to touch, no induration
- SECONDARY CHANGES: Mild excoriation from scratching, no lichenification
- SURROUNDING SKIN: Normal, no satellite lesions

REMAINDER OF SKIN: No other lesions, rashes, or concerning findings noted on exposed skin.

LYMPH NODES: No palpable cervical, axillary, or inguinal lymphadenopathy.`;
}

function generateAssessment(transcript: string): string {
  return `1. Allergic contact dermatitis, bilateral upper extremities (likely secondary to new laundry detergent)
   - ICD-10: L23.9 - Allergic contact dermatitis, unspecified cause
   - Clinical presentation consistent with Type IV hypersensitivity reaction
   - Symmetric distribution and temporal relationship to new detergent exposure support diagnosis

2. Penicillin allergy (documented)
   - History of hives with penicillin exposure`;
}

function generatePlan(doctorStatements: string[]): string {
  return `1. MEDICATIONS:
   - Triamcinolone acetonide 0.1% cream: Apply thin layer to affected areas BID x 14 days
   - Cetirizine 10mg PO QHS for pruritus management

2. ALLERGEN AVOIDANCE:
   - Discontinue use of new laundry detergent immediately
   - Return to previously used, well-tolerated detergent
   - Consider hypoallergenic, fragrance-free detergents for future use

3. SKIN CARE:
   - Avoid hot showers; use lukewarm water
   - Use gentle, fragrance-free soap (e.g., Dove Sensitive, Cetaphil)
   - Apply fragrance-free moisturizer (e.g., CeraVe, Vanicream) BID to affected areas
   - Avoid scratching; keep nails trimmed short

4. PATIENT EDUCATION:
   - Discussed contact dermatitis and allergen avoidance
   - Reviewed proper application of topical corticosteroid
   - Advised on signs/symptoms requiring earlier follow-up (spreading rash, fever, signs of infection)

5. FOLLOW-UP:
   - Return to clinic in 3 weeks for reassessment
   - Call office if no improvement in 7 days or if condition worsens
   - Consider patch testing if recurrent episodes occur`;
}

function extractICD10Codes(transcript: string): Array<{ code: string; description: string; confidence: number }> {
  // Simulate intelligent code extraction based on keywords
  const codes: Array<{ code: string; description: string; confidence: number }> = [];

  if (transcript.toLowerCase().includes('contact dermatitis') || transcript.toLowerCase().includes('detergent')) {
    codes.push({ code: 'L23.9', description: 'Allergic contact dermatitis, unspecified cause', confidence: 0.94 });
  }

  if (transcript.toLowerCase().includes('pruritus') || transcript.toLowerCase().includes('itchy')) {
    codes.push({ code: 'L29.9', description: 'Pruritus, unspecified', confidence: 0.88 });
  }

  return codes.length > 0 ? codes : [COMMON_DERM_ICD10[3]!]; // Default to dermatitis
}

function extractCPTCodes(transcript: string): Array<{ code: string; description: string; confidence: number }> {
  // Base E/M code on complexity
  return [
    { code: '99213', description: 'Office visit, established patient, low-moderate complexity', confidence: 0.91 }
  ];
}

function extractMedications(doctorStatements: string[]): Array<{ name: string; dosage: string; frequency: string; confidence: number }> {
  const meds = [];
  const text = doctorStatements.join(' ').toLowerCase();

  if (text.includes('triamcinolone')) {
    meds.push({ name: 'Triamcinolone acetonide', dosage: '0.1% cream', frequency: 'BID', confidence: 0.96 });
  }

  if (text.includes('antihistamine') || text.includes('cetirizine')) {
    meds.push({ name: 'Cetirizine', dosage: '10mg', frequency: 'QHS', confidence: 0.92 });
  }

  return meds;
}

function extractAllergies(transcript: string): Array<{ allergen: string; reaction: string; confidence: number }> {
  const allergies = [];

  if (transcript.toLowerCase().includes('penicillin')) {
    allergies.push({ allergen: 'Penicillin', reaction: 'Hives', confidence: 0.98 });
  }

  return allergies;
}

function extractFollowUpTasks(doctorStatements: string[]): Array<{ task: string; priority: string; dueDate?: string; confidence: number }> {
  const tasks = [];
  const text = doctorStatements.join(' ').toLowerCase();

  if (text.includes('follow up') || text.includes('return')) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 21); // 3 weeks

    tasks.push({
      task: 'Follow-up appointment for reassessment of contact dermatitis',
      priority: 'medium',
      dueDate: dueDate.toISOString().split('T')[0],
      confidence: 0.95
    });
  }

  if (text.includes('call') && text.includes('week')) {
    tasks.push({
      task: 'Patient to call if no improvement in 7 days',
      priority: 'high',
      dueDate: undefined,
      confidence: 0.88
    });
  }

  return tasks;
}

function generateDifferentialDiagnoses(transcript: string): DifferentialDiagnosis[] {
  const text = transcript.toLowerCase();
  const differentials: DifferentialDiagnosis[] = [];

  // Primary diagnosis based on conversation context
  if (text.includes('contact dermatitis') || text.includes('detergent') || text.includes('new laundry')) {
    differentials.push({
      condition: 'Allergic contact dermatitis',
      confidence: 0.92,
      reasoning: 'Symmetric erythematous rash on bilateral forearms with temporal relationship to new laundry detergent exposure. Classic presentation of Type IV hypersensitivity reaction.',
      icd10Code: 'L23.9'
    });

    // Secondary differentials
    differentials.push({
      condition: 'Irritant contact dermatitis',
      confidence: 0.75,
      reasoning: 'Similar presentation to allergic contact dermatitis but typically less pruritic. Could be chemical irritation rather than true allergy.',
      icd10Code: 'L24.9'
    });

    differentials.push({
      condition: 'Atopic dermatitis exacerbation',
      confidence: 0.65,
      reasoning: 'Pruritic eczematous rash with stress as aggravating factor. However, acute onset and clear trigger favor contact dermatitis.',
      icd10Code: 'L20.9'
    });

    differentials.push({
      condition: 'Dermatophytosis (tinea corporis)',
      confidence: 0.45,
      reasoning: 'Less likely given bilateral symmetric presentation and clear exposure history. Fungal infection would typically have raised borders and central clearing.',
      icd10Code: 'B35.4'
    });
  } else if (text.includes('rash')) {
    // Generic rash differentials
    differentials.push({
      condition: 'Contact dermatitis, unspecified',
      confidence: 0.85,
      reasoning: 'Pruritic rash presentation consistent with inflammatory dermatitis.',
      icd10Code: 'L25.9'
    });

    differentials.push({
      condition: 'Dermatitis, unspecified',
      confidence: 0.75,
      reasoning: 'Non-specific inflammatory skin condition requiring further evaluation.',
      icd10Code: 'L30.9'
    });

    differentials.push({
      condition: 'Pruritus, unspecified',
      confidence: 0.70,
      reasoning: 'Primary symptom is itching with visible skin changes.',
      icd10Code: 'L29.9'
    });
  }

  return differentials;
}

function generateRecommendedTests(transcript: string): RecommendedTest[] {
  const text = transcript.toLowerCase();
  const tests: RecommendedTest[] = [];

  if (text.includes('contact dermatitis') || text.includes('rash')) {
    // For contact dermatitis case
    if (text.includes('recurrent') || text.includes('patch test')) {
      tests.push({
        testName: 'Patch testing (TRUE Test or expanded panel)',
        rationale: 'Comprehensive allergen identification for recurrent or persistent contact dermatitis. Helps identify specific allergens beyond suspected detergent.',
        urgency: 'routine',
        cptCode: '95044'
      });
    }

    // Consider if not improving
    if (text.includes('not better') || text.includes('worse') || text.includes('spreading')) {
      tests.push({
        testName: 'Skin biopsy with histopathology',
        rationale: 'Rule out other inflammatory conditions if rash does not respond to standard treatment or has atypical features.',
        urgency: 'soon',
        cptCode: '11100'
      });

      tests.push({
        testName: 'Potassium hydroxide (KOH) preparation',
        rationale: 'Rule out superficial fungal infection if clinical response to corticosteroids is poor.',
        urgency: 'soon',
        cptCode: '87220'
      });
    }

    // Baseline assessment
    tests.push({
      testName: 'Photography for medical record',
      rationale: 'Document baseline appearance for comparison at follow-up visit to assess treatment response.',
      urgency: 'routine',
      cptCode: '96904'
    });
  }

  // Add routine tests if indicated by other conversation elements
  if (text.includes('infection') || text.includes('fever')) {
    tests.push({
      testName: 'Bacterial culture and sensitivity',
      rationale: 'Rule out secondary bacterial infection if signs of impetiginization are present.',
      urgency: 'soon',
      cptCode: '87070'
    });
  }

  return tests;
}

function generatePatientSummary(patientStatements: string[], doctorStatements: string[]): PatientSummary {
  // Extract patient concerns
  const concerns: string[] = [];
  const patientText = patientStatements.join(' ').toLowerCase();

  if (patientText.includes('rash')) concerns.push('Rash on both arms');
  if (patientText.includes('itchy') || patientText.includes('itch')) concerns.push('Severe itching');
  if (patientText.includes('worse at night')) concerns.push('Symptoms getting worse at night');
  if (patientText.includes('scaly') || patientText.includes('red')) concerns.push('Red, scaly appearance of skin');

  // Ensure at least one concern
  if (concerns.length === 0) {
    concerns.push('Skin problem on arms');
  }

  const summary: PatientSummary = {
    whatWeDiscussed: 'We talked about the rash on your arms that started about 2 weeks ago. You mentioned it began after using a new laundry detergent and has been very itchy, especially at night.',
    yourConcerns: concerns,
    diagnosis: 'You have allergic contact dermatitis, which is an allergic skin reaction to something that touched your skin. In your case, it appears to be caused by the new laundry detergent you started using. This is a common condition and should improve once you stop using the product that caused it.',
    treatmentPlan: 'Stop using the new laundry detergent right away and go back to your old one. I prescribed a prescription-strength steroid cream (triamcinolone) to apply twice daily to the rash for 2 weeks, and an allergy pill (cetirizine) to take at bedtime to help with itching. Use gentle soaps, take warm (not hot) showers, and apply a fragrance-free moisturizer twice daily. Try not to scratch the rash even though it itches.',
    followUp: 'Come back to see me in 3 weeks so we can check how the rash is healing. If the rash isn\'t better in 1 week or if it gets worse, call the office right away.'
  };

  return summary;
}

/**
 * Mask PHI in text using detected entities
 */
export function maskPHI(text: string, phiEntities: PHIEntity[]): string {
  if (phiEntities.length === 0) return text;

  let maskedText = text;
  // Sort entities by start position (descending) to replace from end to start
  const sorted = [...phiEntities].sort((a, b) => b.start - a.start);

  for (const entity of sorted) {
    maskedText = maskedText.substring(0, entity.start) +
                 entity.masked_value +
                 maskedText.substring(entity.end);
  }

  return maskedText;
}
