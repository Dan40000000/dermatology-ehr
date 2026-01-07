# Ambient AI Medical Scribe System

## Overview

A complete **Ambient AI Medical Scribe** system for automatic clinical documentation from patient-provider conversations. The system records conversations, transcribes them with speaker diarization, and automatically generates structured clinical notes using AI.

## Key Features

### 1. Conversation Recording & Transcription
- **Real-time Audio Recording**: Browser-based recording using MediaRecorder API
- **HIPAA-Compliant**: Encrypted storage with automatic PHI detection and masking
- **Speaker Diarization**: Automatic identification of doctor vs patient speech
- **Consent Workflow**: Built-in patient consent tracking (verbal, written, electronic)
- **Live Transcription**: Simulates OpenAI Whisper API for speech-to-text

### 2. AI Clinical Note Generation
- **Structured SOAP Notes**: Auto-generates Chief Complaint, HPI, ROS, Physical Exam, Assessment, and Plan
- **Medical Code Suggestions**:
  - ICD-10 codes with confidence scores
  - CPT codes based on procedures discussed
- **Entity Extraction**:
  - Mentioned medications with dosage and frequency
  - Allergies and reactions
  - Follow-up tasks with priorities
- **Confidence Scoring**: Section-level and overall confidence metrics

### 3. Review & Edit Workflow
- **Inline Editing**: Edit AI-generated sections with track changes
- **Confidence Indicators**: Color-coded confidence levels (high/medium/low)
- **Approval Workflow**: Review, approve, reject, or request regeneration
- **Version History**: Complete audit trail of all edits
- **Side-by-Side View**: Transcript alongside generated note

### 4. Integration
- **Encounter Integration**: Links to patient encounters
- **Auto-Population**: Can auto-populate mentioned prescriptions and orders
- **One-Click Apply**: Apply approved notes directly to encounters

## Architecture

### Database Schema (Migration: 034_ambient_scribe.sql)

#### Tables Created:
1. **ambient_recordings** - Audio recording metadata
   - Encryption and security tracking
   - Consent documentation
   - File storage paths

2. **ambient_transcripts** - Transcribed conversations
   - Speaker-segmented text
   - PHI detection and masking
   - Confidence scores

3. **ambient_generated_notes** - AI-generated clinical documentation
   - Structured SOAP sections
   - Suggested codes and medications
   - Review status tracking

4. **ambient_note_edits** - Complete audit trail
   - All changes tracked
   - Editor and reason recorded
   - Significant change flagging

5. **ambient_scribe_settings** - Configuration per provider/tenant
   - Feature toggles
   - AI preferences
   - Workflow settings

### Backend Components

#### Services
- **`/backend/src/services/ambientAI.ts`** - Mock AI service
  - Simulates OpenAI Whisper for transcription
  - Simulates GPT-4 Medical for note generation
  - Realistic dermatology-specific outputs
  - PHI detection and masking

#### Routes
- **`/backend/src/routes/ambientScribe.ts`** - Complete API
  - Recording management (start, upload, list, delete)
  - Transcription triggers
  - Note generation and review
  - Edit history tracking

#### API Endpoints

##### Recording Endpoints
- `POST /api/ambient/recordings/start` - Start new recording session
- `POST /api/ambient/recordings/:id/upload` - Upload audio file
- `GET /api/ambient/recordings` - List recordings (filterable)
- `GET /api/ambient/recordings/:id` - Get recording details
- `DELETE /api/ambient/recordings/:id` - Delete recording

##### Transcription Endpoints
- `POST /api/ambient/recordings/:id/transcribe` - Trigger transcription
- `GET /api/ambient/transcripts/:id` - Get transcript details
- `GET /api/ambient/recordings/:id/transcript` - Get transcript for recording

##### Note Endpoints
- `POST /api/ambient/transcripts/:id/generate-note` - Generate clinical note
- `GET /api/ambient/notes/:id` - Get generated note
- `GET /api/ambient/encounters/:encounterId/notes` - Get encounter notes
- `PATCH /api/ambient/notes/:id` - Update note (creates audit trail)
- `POST /api/ambient/notes/:id/review` - Submit review (approve/reject)
- `POST /api/ambient/notes/:id/apply-to-encounter` - Apply to encounter
- `GET /api/ambient/notes/:id/edits` - Get edit history

### Frontend Components

#### Pages
- **`/frontend/src/pages/AmbientScribePage.tsx`** - Management dashboard
  - List all recordings
  - View transcripts
  - Generate and review notes
  - Deep linking support

#### Components
- **`/frontend/src/components/AmbientRecorder.tsx`** - Recording widget
  - Full and compact modes
  - Consent workflow
  - Real-time duration tracking
  - Auto-upload on completion

- **`/frontend/src/components/NoteReviewEditor.tsx`** - Note review interface
  - Side-by-side transcript view
  - Inline section editing
  - Confidence indicators
  - Code and medication suggestions
  - Approve/reject workflow
  - Edit history display

#### API Client Functions (`/frontend/src/api.ts`)
Complete TypeScript API client with:
- All endpoint wrappers
- Type-safe interfaces
- Error handling
- Credential inclusion

## Usage Guide

### Starting a Recording

```typescript
// 1. Obtain patient consent
const consent = {
  encounterId: 'encounter-123',
  patientId: 'patient-456',
  providerId: 'provider-789',
  consentObtained: true,
  consentMethod: 'verbal' | 'written' | 'electronic'
};

// 2. Start recording session
const { recordingId } = await startAmbientRecording(
  tenantId,
  accessToken,
  consent
);

// 3. Record audio using MediaRecorder API
// (handled by AmbientRecorder component)

// 4. Upload when complete
await uploadAmbientRecording(
  tenantId,
  accessToken,
  recordingId,
  audioFile,
  durationSeconds
);
// Transcription starts automatically
```

### Reviewing Generated Notes

```typescript
// 1. Wait for transcription and note generation
const { note } = await fetchAmbientNote(tenantId, accessToken, noteId);

// 2. Review and edit sections
await updateAmbientNote(tenantId, accessToken, noteId, {
  hpi: 'Updated HPI text...',
  editReason: 'Corrected medication name'
});

// 3. Approve or reject
await reviewAmbientNote(
  tenantId,
  accessToken,
  noteId,
  'approve' // or 'reject' or 'request_regeneration'
);

// 4. Apply to encounter
await applyAmbientNoteToEncounter(tenantId, accessToken, noteId);
```

### Embedding in Encounter Page

```tsx
import { AmbientRecorder } from '../components/AmbientRecorder';

// Add to encounter page:
<AmbientRecorder
  encounterId={encounter.id}
  patientId={patient.id}
  providerId={provider.id}
  patientName={patient.fullName}
  onRecordingComplete={(recording) => {
    // Handle completion
    console.log('Recording uploaded:', recording.id);
  }}
  compact={true} // Use compact mode in encounter
/>
```

## Security & Compliance

### HIPAA Compliance
- **Encryption**: All recordings stored encrypted at rest
- **PHI Detection**: Automatic detection of names, dates, phone numbers, etc.
- **PHI Masking**: Configurable masking levels (none, partial, full)
- **Consent Tracking**: Complete audit trail of patient consent
- **Access Control**: Role-based access (providers, admins only)
- **Audit Logging**: All actions logged via central audit system

### Data Flow
1. **Recording**: Audio captured in browser (never sent raw)
2. **Upload**: Encrypted transmission to server
3. **Storage**: Encrypted at rest with key management
4. **Transcription**: PHI detected and masked
5. **Note Generation**: Uses masked transcript
6. **Review**: Provider reviews before finalizing

## Mock AI Implementation

The system includes realistic mock implementations:

### Speech-to-Text (Whisper Simulation)
```typescript
// Generates realistic dermatology conversation
const result = await transcribeAudio(audioFilePath, durationSeconds);
// Returns: {
//   text: "full conversation",
//   segments: [{speaker, text, start, end, confidence}],
//   speakers: {speaker_0: {label: 'doctor'}, speaker_1: {label: 'patient'}},
//   confidence: 0.92,
//   phiEntities: [...]
// }
```

### Clinical Note Generation (GPT-4 Medical Simulation)
```typescript
// Generates structured SOAP note
const note = await generateClinicalNote(transcriptText, segments);
// Returns: {
//   chiefComplaint: "...",
//   hpi: "...",
//   ros: "...",
//   physicalExam: "...",
//   assessment: "...",
//   plan: "...",
//   suggestedIcd10: [{code, description, confidence}],
//   suggestedCpt: [{code, description, confidence}],
//   medications: [{name, dosage, frequency, confidence}],
//   allergies: [{allergen, reaction, confidence}],
//   followUpTasks: [{task, priority, dueDate, confidence}]
// }
```

## Configuration

### Settings (per provider or tenant-wide)

```sql
-- Stored in ambient_scribe_settings table
{
  auto_start_recording: false,        -- Auto-start on encounter open
  auto_generate_notes: true,          -- Generate note after transcription
  require_review: true,               -- Require provider review before apply
  preferred_note_style: 'soap',       -- 'soap', 'narrative', 'problem-oriented'
  verbosity_level: 'standard',        -- 'concise', 'standard', 'detailed'
  min_transcription_confidence: 0.70, -- Threshold for warnings
  min_generation_confidence: 0.75,    -- Threshold for note sections
  auto_mask_phi: true,                -- Automatically mask PHI
  phi_mask_level: 'full',             -- 'none', 'partial', 'full'
  default_consent_method: 'verbal',   -- Default consent type
  recording_quality: 'standard'       -- 'low', 'standard', 'high'
}
```

## Production Considerations

### Replacing Mock AI with Real Services

#### OpenAI Whisper Integration
```typescript
// In ambientAI.ts, replace transcribeAudio():
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(audioFilePath: string) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioFilePath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"]
  });

  // Process and add speaker diarization
  return processWhisperResponse(transcription);
}
```

#### GPT-4 Medical Integration
```typescript
// Replace generateClinicalNote():
export async function generateClinicalNote(transcript: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [
      {
        role: "system",
        content: "You are a medical AI assistant specialized in generating structured clinical notes from patient-provider conversations. Format as SOAP notes."
      },
      {
        role: "user",
        content: `Generate a clinical note from this transcript:\n\n${transcript}`
      }
    ],
    temperature: 0.3 // Lower for consistent medical output
  });

  return parseStructuredNote(completion.choices[0].message.content);
}
```

### Azure AI Integration (Alternative)
```typescript
// For Azure OpenAI Service
import { AzureOpenAI } from '@azure/openai';

const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_KEY,
  apiVersion: "2024-02-15-preview",
  deployment: "gpt-4-turbo"
});
```

### Speaker Diarization
For production speaker diarization, consider:
- **Deepgram**: Real-time with diarization
- **AssemblyAI**: High-accuracy medical transcription
- **AWS Transcribe Medical**: HIPAA-compliant
- **Google Cloud Speech-to-Text**: Medical vocabulary support

```typescript
// Example with Deepgram
import { createClient } from '@deepgram/sdk';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const { result } = await deepgram.listen.prerecorded.transcribeFile(
  audioBuffer,
  {
    model: 'nova-2-medical',
    diarize: true,
    punctuate: true,
    smart_format: true
  }
);
```

## Testing

### Manual Testing Flow
1. Navigate to Ambient Scribe page
2. Click "New Recording"
3. Confirm patient consent
4. Click "Start Recording" and speak for 10+ seconds
5. Click "Stop Recording"
6. Click "Upload & Transcribe"
7. Wait ~3-5 seconds for processing
8. View transcript in recording details
9. Click "Generate Clinical Note"
10. Review generated note with confidence scores
11. Edit sections as needed
12. Approve note
13. Apply to encounter (if linked)

### API Testing with curl

```bash
# Start recording
curl -X POST http://localhost:4000/api/ambient/recordings/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -d '{
    "patientId": "patient-123",
    "providerId": "provider-456",
    "consentObtained": true,
    "consentMethod": "verbal"
  }'

# List recordings
curl http://localhost:4000/api/ambient/recordings \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID"
```

## File Locations

### Backend
- **Migration**: `/backend/migrations/034_ambient_scribe.sql`
- **AI Service**: `/backend/src/services/ambientAI.ts`
- **Routes**: `/backend/src/routes/ambientScribe.ts`
- **Index Registration**: `/backend/src/index.ts` (line ~195)

### Frontend
- **API Client**: `/frontend/src/api.ts` (lines 3940-4379)
- **Page**: `/frontend/src/pages/AmbientScribePage.tsx`
- **Recorder Component**: `/frontend/src/components/AmbientRecorder.tsx`
- **Review Component**: `/frontend/src/components/NoteReviewEditor.tsx`

### Database
- **Tables**: 5 new tables (see migration file)
- **Indexes**: Optimized for tenant, patient, encounter queries
- **Triggers**: Auto-update timestamps

## Performance Considerations

### Audio File Size
- WebM with Opus codec: ~1MB per minute
- Max file size: 500MB (configurable in multer)
- Storage: Local filesystem (can be moved to S3)

### Processing Time (Mock)
- Transcription: 2-3 seconds (simulated)
- Note Generation: 3-5 seconds (simulated)
- Real AI: Expect 10-30 seconds depending on recording length

### Scalability
- Async processing with job queues recommended for production
- Consider Redis for caching transcripts
- Use websockets for real-time status updates

## Future Enhancements

### Planned Features
1. **Real-time Transcription**: Live transcription during recording
2. **Multi-language Support**: Automatic language detection
3. **Voice Commands**: "Add to plan: ..." during recording
4. **Template Library**: Pre-built note templates
5. **Batch Processing**: Transcribe multiple recordings
6. **Analytics Dashboard**: Time saved, accuracy metrics
7. **Mobile App**: Native iOS/Android recording
8. **Integration**: HL7/FHIR export of generated notes

### Advanced AI Features
1. **Differential Diagnosis**: AI-suggested diagnoses
2. **Clinical Decision Support**: Treatment recommendations
3. **Drug Interaction Checking**: From mentioned medications
4. **Quality Metrics**: Note completeness scoring
5. **Learning Feedback**: Improve AI from corrections

## Troubleshooting

### Microphone Access Issues
- Check browser permissions
- HTTPS required for getUserMedia
- Test with different browsers

### Transcription Not Starting
- Check ambient_transcripts table status
- Verify file upload completed
- Check backend logs for errors

### Note Generation Slow
- Mock implementation includes deliberate delays
- Real API calls may be slower initially
- Consider implementing progress indicators

### PHI Not Being Masked
- Check ambient_scribe_settings.auto_mask_phi
- Verify phi_mask_level setting
- PHI detection patterns may need tuning

## Support & Documentation

For questions or issues:
1. Check this README
2. Review migration file comments
3. Inspect API endpoint documentation in routes file
4. Examine mock AI implementation for expected formats

## License & Credits

Built as part of the Dermatology EHR system. Mock AI implementations simulate commercial services for development and demonstration purposes.

---

**Generated with Claude Code**
Date: December 29, 2025
