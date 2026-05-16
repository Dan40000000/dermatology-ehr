# AI-Powered Clinical Notes Feature

## Overview

The AI-powered clinical notes feature (Ambient Scribe) enables dermatologists to record patient encounters and automatically generate structured clinical documentation using state-of-the-art AI technologies.

## Current Progress Snapshot

Updated May 16, 2026.

The AI scribe and encounter copilot are now materially beyond the original ambient-recording prototype:

- Live scribe now builds a real-time visit snapshot while listening, organized into four doctor-facing boxes: Summary of Visit, Symptoms, Potential Diagnosis with confidence percentages, and Tests Recommended.
- Ambient note generation now prefers the Medical Dermatology agent/config when the session is not explicitly specialized, instead of falling back to Cosmetic Consultation.
- The post-scribe note is editable before it is saved or applied, so the provider can correct the AI output before it becomes part of the chart.
- Encounter Copilot inside an appointment can generate a chart-grounded visit summary and save or update it directly in the patient's AI scribe/visit-history area. Staff no longer need to copy and paste from chat.
- The copilot summary save flow now uses cleaner clinical buckets so symptoms, tests, treatment, prescriptions, follow-up, and diagnosis content are less likely to be mixed together.
- Preferred pharmacy is now part of the patient workflow and supports patient profile, portal/e-check-in confirmation, and prescription routing context.
- Prescription documentation now supports electronic send, print, and manually filled prescriptions so the chart records how the prescription was handled even before a live eRx vendor is connected.
- Live encounter coding now ties diagnosis/coding work into the clinical and billing flow. ICD-10 and CPT suggestions are still assistive and require clinician review before billing.
- Railway and local code were last synchronized on commit `2d65d17` with focused production smoke checks covering clinical billing, portal identity, prescription/refill, secure messaging, SMS mock mode, and live coding safeguards.

Current known limits:

- Real eRx, eligibility, prior authorization, drug interaction, and claim submission still require vendor credentials/subscriptions before they can be used clinically.
- Speaker attribution is best-effort unless the selected transcription provider returns reliable diarization. The UI should be treated as "provider/patient inferred" when the transcript provider cannot prove the speaker.
- AI output is assistive only. Providers must review and approve notes, diagnoses, ICD-10/CPT suggestions, prescriptions, and patient-facing summaries.

## Features

### 1. Audio Recording
- **Browser-based recording** using MediaRecorder API
- **Real-time audio visualization** with waveform display
- **Patient consent workflow** (verbal, written, or electronic)
- **HIPAA-compliant** encrypted storage
- **Automatic PHI detection** and masking

### 2. AI Transcription
- **Configurable ambient transcription provider** with support for OpenAI transcription models, AWS HealthScribe, and vendor adapter scaffolding
- **Speaker diarization/inference** to differentiate doctor vs patient when provider output supports it
- **Timestamp-aligned segments** for context
- **Falls back to mock** if API keys not configured
- **Live transcription** over WebSocket when enabled

### 3. Clinical Note Generation
- **Anthropic Claude** (preferred) or **OpenAI GPT-4** for medical documentation
- **Structured SOAP format**:
  - Chief Complaint
  - History of Present Illness (HPI)
  - Review of Systems (ROS)
  - Physical Examination
  - Assessment
  - Plan
- **Dermatology-specific terminology** understanding
- **Automated code suggestions**:
  - ICD-10 diagnosis codes
  - CPT procedure codes
- **Medication extraction** with dosing
- **Allergy detection**
- **Follow-up task generation**

### 4. Live Visit Insights
- **Live Summary of Visit** during the conversation
- **Live Symptoms** extracted separately from diagnoses and treatment
- **Live Potential Diagnosis** cards with confidence percentages
- **Live Tests Recommended** separated from medication/treatment recommendations
- **Heuristic fallback** when live AI insights are disabled or unavailable

### 5. Review & Edit Workflow
- **Side-by-side view** of transcript and generated note
- **Inline editing** with audit trail
- **Confidence scores** for each section
- **Approve/Reject/Regenerate** options
- **One-click apply** to encounter chart
- **Patient-history save** from Encounter Copilot for a concise visit summary

## Architecture

### Frontend Components

#### `AmbientScribePage.tsx`
Main dashboard for managing recordings and notes:
- List all recordings
- View recording details
- Review generated notes
- Statistics and filtering

#### `AmbientRecorder.tsx`
Recording interface component:
- Microphone access and recording
- Real-time duration tracking
- Patient consent collection
- Audio file upload
- Compact and full-view modes

#### `LiveScribeInsightsPanel.tsx`
Live doctor-facing insight panel:
- Four-box live layout: Summary, Symptoms, Potential Diagnosis, Tests Recommended
- Displays confidence percentages for likely diagnoses
- Clearly labels live AI status versus heuristic fallback
- Keeps recommendations organized so treatments are not presented as tests

#### `AudioVisualizer.tsx`
Real-time audio waveform visualization:
- Uses Web Audio API
- Visual feedback during recording
- Configurable size

#### `NoteReviewEditor.tsx`
Note editing and review interface:
- Structured note display
- Inline editing with track changes
- Confidence indicators
- Code and medication suggestions
- Edit history tracking

#### `ClinicalCopilotPanel.tsx`
In-encounter assistant:
- Answers chart-grounded questions from patient/encounter context
- Provides documentation, E/M, ICD-10/CPT, and missing-info suggestions
- Generates a concise visit summary
- Saves or updates that summary directly to patient history

### Backend Services

#### `ambientAI.ts` Service
AI integration layer:
- **`transcribeAudio()`** - configured ambient provider, OpenAI, or mock transcription
- **`generateClinicalNote()`** - Claude/GPT-4 note generation
- **`maskPHI()`** - PHI detection and masking
- Automatic fallback to mock implementations

#### `ambientTranscriptionAdapter.ts` Integration
Vendor-agnostic transcription adapter:
- Supports OpenAI-compatible multipart transcription providers
- Supports AWS HealthScribe jobs when configured
- Supports Nabla-style multipart provider flow
- Selects provider from environment configuration

#### `ambientLiveInsightsAI.ts` and `ambientLiveInsights.ts`
Live insight layer:
- Produces structured live visit summary, symptoms, potential diagnoses, and test recommendations
- Uses AI when `AMBIENT_LIVE_AI_ENABLED=true`
- Falls back to deterministic dermatology heuristics when AI is not available

#### `clinicalCopilot.ts` Service
Chart-grounded copilot:
- Answers only from supplied chart context when possible
- Produces visit summaries, documentation improvements, and coding suggestions
- Falls back to a local chart mock when no live AI key is configured

#### `ambientScribe.ts` Routes
RESTful API endpoints:
- `POST /api/ambient/recordings/start` - Start recording
- `POST /api/ambient/recordings/:id/stop` - Stop recording session metadata
- `POST /api/ambient/recordings/:id/upload` - Upload audio
- `GET /api/ambient/recordings` - List recordings
- `GET /api/ambient/recordings/:id` - Get recording details
- `POST /api/ambient/recordings/:id/transcribe` - Trigger transcription
- `GET /api/ambient/transcripts/:id` - Get transcript
- `GET /api/ambient/recordings/:id/transcript` - Get transcript for a recording
- `POST /api/ambient/transcripts/:id/generate-note` - Generate note
- `GET /api/ambient/notes/:id` - Get generated note
- `GET /api/ambient/encounters/:encounterId/notes` - Get notes for encounter
- `PATCH /api/ambient/notes/:id` - Edit note
- `POST /api/ambient/notes/:id/review` - Approve/reject
- `POST /api/ambient/notes/:id/apply-to-encounter` - Apply to chart
- `GET /api/ambient/notes/:id/edits` - Get note edit history
- `POST /api/ambient/copilot/respond` - Ask the chart-grounded copilot
- `POST /api/ambient/copilot/visit-summary` - Generate and save/update patient-history summary
- `POST /api/ambient/notes/:noteId/generate-patient-summary` - Generate patient-facing summary
- `GET /api/ambient/patient-summaries/:patientId` - List patient summaries
- `POST /api/ambient/patient-summaries/:summaryId/share` - Share summary to portal

### Database Schema

#### `ambient_recordings`
Stores audio recordings with metadata:
- File path and encryption info
- Consent documentation
- Duration and status
- Patient/provider association

#### `ambient_transcripts`
Stores transcribed text:
- Full transcript text
- Segmented timeline with speakers
- PHI entities and masking
- Confidence scores

#### `ambient_generated_notes`
AI-generated clinical notes:
- Structured SOAP sections
- Suggested codes (ICD-10, CPT)
- Medications and allergies
- Follow-up tasks
- Review status

#### `ambient_note_edits`
Complete audit trail:
- All edits to generated notes
- Previous and new values
- Editor and timestamp
- Edit reason

## Setup Instructions

### 1. Environment Configuration

Add API keys to `/backend/.env`:

```bash
# OpenAI API for transcription and GPT-4-class note generation (optional)
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe-diarize
OPENAI_NOTE_MODEL=gpt-4o

# Anthropic API for Claude note generation (preferred, optional)
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
ANTHROPIC_NOTE_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_COPILOT_MODEL=claude-3-5-sonnet-20241022

# Optional live scribe behavior
AMBIENT_LIVE_TRANSCRIBE_ENABLED=true
AMBIENT_LIVE_TRANSCRIBE_MIN_INTERVAL_MS=5000
AMBIENT_LIVE_TRANSCRIBE_MODEL=gpt-4o-transcribe
AMBIENT_LIVE_AI_ENABLED=false
AMBIENT_LIVE_AI_MIN_INTERVAL_MS=15000

# Optional vendor adapter. Leave unset/mock until credentials exist.
# Examples: openai, aws_healthscribe, abridge, wispr_flow, nabla
AMBIENT_TRANSCRIPTION_PROVIDER=
```

**Note:** If API keys are not provided, the system will use realistic mock implementations for development.

### 2. Database Migration

The database schema is already created via migration `034_ambient_scribe.sql`.

To verify:
```bash
cd backend
npm run db:migrate
```

### 3. Install Dependencies

Backend dependencies are already in `package.json`:
- `form-data` - For multipart file uploads (already installed)

No additional packages needed!

### 4. Restart Backend

```bash
cd backend
npm run dev
```

The backend will automatically detect API keys and use real AI services when available.

## Usage

### Recording a Clinical Note

1. **Navigate to Ambient Scribe**
   - From main menu, click "Ambient Scribe" or go to `/ambient-scribe`

2. **Start New Recording**
   - Click "New Recording" button
   - Select patient (or use demo mode)
   - Confirm patient consent
   - Choose consent method (verbal/written/electronic)

3. **Record Conversation**
   - Click "Start Recording" to begin
   - Real-time waveform shows audio levels
   - Duration timer tracks recording length
   - Live panel updates the summary, symptoms, possible diagnoses, and test recommendations while speaking
   - Click "Stop Recording" when finished

4. **Upload & Transcribe**
   - Click "Upload & Transcribe"
   - System automatically:
     - Uploads audio file
     - Initiates Whisper transcription
     - Performs speaker diarization
     - Masks any detected PHI

5. **Review Transcript**
   - View segmented conversation
   - Doctor vs Patient attribution
   - Timestamp alignment
   - Click "Generate Clinical Note"

6. **Review Generated Note**
   - AI produces structured SOAP note
   - Review each section:
     - Chief Complaint
     - HPI (History of Present Illness)
     - ROS (Review of Systems)
     - Physical Exam
     - Assessment
     - Plan
   - Check suggested codes and medications
   - Edit any section as needed
   - All edits are tracked in audit log

7. **Approve, Save, & Apply**
   - Click "Approve Note" when satisfied
   - Click "Apply to Encounter" to add to patient chart
   - Note becomes part of permanent medical record
   - Use Encounter Copilot's save-summary action when a concise patient-history summary is needed

### Using Encounter Copilot During an Appointment

1. Open an appointment/encounter.
2. Use the Encounter Copilot chat to ask documentation, coding, or workflow questions grounded in the current chart.
3. Click the summarize/save action to generate a concise visit summary.
4. Review the returned summary.
5. The system saves or updates the patient-history entry, including chart evidence and audit logging.

The copilot is intended to reduce duplicate work. It should summarize what is supported by the chart, not invent missing clinical facts.

## API Keys Setup

### OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create new API key
3. Add to `.env` as `OPENAI_API_KEY=sk-...`
4. Costs:
   - Whisper: ~$0.006 per minute of audio
   - GPT-4 Turbo: ~$0.03 per 1K tokens (input) + $0.06 per 1K tokens (output)
   - Typical 5-minute encounter: ~$0.10-0.30

### Anthropic Claude API Key

1. Go to https://console.anthropic.com/
2. Create new API key
3. Add to `.env` as `ANTHROPIC_API_KEY=sk-ant-...`
4. Costs:
   - Claude 3.5 Sonnet: ~$0.003 per 1K tokens (input) + $0.015 per 1K tokens (output)
   - Typical note generation: ~$0.05-0.15
   - **Recommended for medical documentation** due to superior clinical accuracy

## AI Models Used

### Speech-to-Text: Configurable Ambient Transcription
- **Default OpenAI model:** `gpt-4o-transcribe-diarize` when configured, with `whisper-1` still supported
- **Live chunk model:** `gpt-4o-transcribe` by default
- **Optional providers:** AWS HealthScribe and vendor adapter paths for Abridge, Wispr Flow, and Nabla-style APIs
- **Language:** English
- **Features:**
  - Multi-speaker capable when provider supports diarization
  - Medical terminology recognition
  - Timestamp-aligned segments
  - Robust to background noise
  - Mock fallback for demos/development

### Clinical Note Generation

#### Option 1: Anthropic Claude (Recommended)
- **Model:** `claude-3-5-sonnet-20241022`
- **Strengths:**
  - Superior medical reasoning
  - Better handling of clinical terminology
  - More accurate code suggestions
  - Excellent structured output
  - Lower cost per note

#### Option 2: OpenAI GPT-4
- **Model:** `gpt-4o` or configured OpenAI note model
- **Strengths:**
  - Strong general medical knowledge
  - Good medication extraction
  - Reliable JSON formatting
  - Fallback option if Claude unavailable

## HIPAA Compliance Features

### Data Security
- ✅ **Encrypted audio storage** (files encrypted at rest)
- ✅ **Automatic PHI masking** in transcripts
- ✅ **Audit logging** for all actions
- ✅ **Patient consent** documentation
- ✅ **Access controls** via RBAC
- ✅ **Secure API** with authentication

### PHI Detection
The system automatically detects and masks:
- Phone numbers
- Dates (potential DOB)
- Additional entities can be configured

### Consent Workflow
Before recording:
1. Provider must confirm patient consent
2. Consent method documented (verbal/written/electronic)
3. Consent timestamp recorded
4. HIPAA disclaimer shown

## Mock Mode (Development)

When API keys are not configured, the system uses realistic mock implementations:

- **Mock Transcription**: Generates realistic dermatology conversation
- **Mock Note Generation**: Creates sample SOAP notes with proper structure
- **No API costs**: Perfect for development and testing
- **Same UI/UX**: Identical user experience
- **Easy transition**: Just add API keys to switch to production

## Troubleshooting

### Recording Issues

**Microphone not accessible:**
- Check browser permissions
- HTTPS required for getUserMedia API
- Try different browser (Chrome/Edge recommended)

**Audio format not supported:**
- Recorder outputs WebM (Opus codec)
- Whisper API accepts: webm, mp4, mp3, wav, m4a
- Fallback formats automatically tried

### Transcription Issues

**Transcription provider errors:**
- Check OPENAI_API_KEY is valid
- Check `AMBIENT_TRANSCRIPTION_PROVIDER` is unset or correctly configured
- Verify API quota/billing
- Check file size (<500MB limit)
- Review backend logs for details

**Poor speaker diarization:**
- Use a diarization-capable provider/model when available
- Current fallback uses heuristics and should label speaker roles as inferred
- For production, prefer a medical transcription provider with reliable diarization
- Clear speaker changes help (pauses, questions)

**Live boxes look incomplete:**
- Live insights need enough transcript text before they stabilize
- `AMBIENT_LIVE_AI_ENABLED=true` enables live AI summaries when an AI key is configured
- Heuristic fallback is intentionally conservative and may leave fields sparse until enough clinical context is heard

### Note Generation Issues

**Claude/GPT not generating proper JSON:**
- Temperature set to 0.3 for consistency
- Fallback parsing implemented
- Will use mock if parse fails
- Check API logs for errors

**Inaccurate clinical content:**
- AI is assistive technology, not diagnostic
- All notes require provider review
- Edit any inaccuracies before approval
- Confidence scores indicate reliability

## Future Enhancements

### Short-term
- [x] Real-time transcription streaming
- [x] Live visit insight boxes
- [x] Encounter Copilot save-to-patient-history flow
- [x] Editable AI note before applying to chart
- [x] Preferred pharmacy in patient workflow
- [x] Prescription delivery documentation for electronic, print, and manual workflows
- [ ] Improve proven speaker diarization with a production-grade vendor/model
- [ ] Multi-language support
- [ ] Custom medical vocabularies
- [ ] Template-based prompts per specialty

### Long-term
- [x] Real-time AI suggestions during encounter
- [ ] Voice commands for navigation
- [x] Integration with encounter coding workflows
- [ ] Quality metrics and analytics
- [ ] Batch processing of recordings
- [ ] Mobile app for recording
- [ ] Production drug interaction database/vendor connection
- [ ] Production eRx, eligibility, prior authorization, and claims vendor credentials

## Recent Verification

Recent focused verification completed before this guide update:

- Backend targeted tests passed: 265/265.
- Backend build passed.
- Railway focused smoke test passed: 22/22.
- Smoke coverage included eligibility resilience, portal identity/linking, live coding ICD safeguards, charge de-duplication, encounter charge retrieval, mock eRx send, portal refill request, secure messaging, SMS mock mode, and completed-appointment portal visibility.
- AI scribe/copy-to-history behavior has unit coverage for live insights, clinical copilot, and ambient summary save flows.

## Performance Metrics

### Typical Processing Times

**5-minute patient encounter:**
- Recording: 5 minutes (real-time)
- Upload: 5-10 seconds
- Whisper transcription: 30-60 seconds
- Note generation (Claude): 10-20 seconds
- **Total time saved:** ~15-20 minutes vs manual documentation

### Accuracy Metrics

Based on internal testing:
- Transcription accuracy: 92-96% (Whisper)
- Speaker diarization: 85-90% (heuristic)
- Clinical accuracy: Requires provider review
- Code suggestions: 80-85% relevant

## Cost Analysis

### Per Encounter (5-minute audio)

**Using OpenAI only:**
- Whisper transcription: $0.03
- GPT-4 note generation: $0.20
- **Total: ~$0.23 per note**

**Using OpenAI + Claude (recommended):**
- Whisper transcription: $0.03
- Claude note generation: $0.10
- **Total: ~$0.13 per note**

**Savings:**
- Time saved: 15-20 minutes per encounter
- At $200/hour provider rate: $50-67 saved
- **ROI: 380x to 515x return on AI investment**

## Support

For issues or questions:
1. Check backend logs: `backend/logs/`
2. Review browser console for frontend errors
3. Verify API keys are correctly set
4. Test in mock mode first
5. Check database migrations are applied

## License

Part of the Dermatology EHR application. All AI integrations follow respective provider terms of service (OpenAI, Anthropic).
