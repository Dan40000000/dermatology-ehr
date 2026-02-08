import dotenv from 'dotenv';
dotenv.config();

import { transcribeAudio, generateClinicalNote, type TranscriptionSegment } from '../services/ambientAI';

const args = process.argv.slice(2);

const getArgValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
};

const audioPath = getArgValue('--audio');
const durationArg = getArgValue('--duration');
const durationSeconds = durationArg ? Number(durationArg) : 90;

const sampleTranscript =
  'Doctor: Good morning, how can I help today?\n' +
  'Patient: I have an itchy rash on my forearms for two weeks.\n' +
  'Doctor: Any new soaps or outdoor exposure?\n' +
  'Patient: I started a new detergent last month.\n' +
  'Doctor: Exam shows erythematous papules and mild excoriations.\n' +
  'Doctor: We will start triamcinolone 0.1% cream twice daily and moisturizers.';

const sampleSegments: TranscriptionSegment[] = [
  { speaker: 'doctor', text: 'Good morning, how can I help today?', start: 0, end: 6, confidence: 0.92 },
  { speaker: 'patient', text: 'I have an itchy rash on my forearms for two weeks.', start: 6, end: 12, confidence: 0.9 },
  { speaker: 'doctor', text: 'Any new soaps or outdoor exposure?', start: 12, end: 16, confidence: 0.91 },
  { speaker: 'patient', text: 'I started a new detergent last month.', start: 16, end: 20, confidence: 0.88 },
  { speaker: 'doctor', text: 'Exam shows erythematous papules and mild excoriations.', start: 20, end: 28, confidence: 0.9 },
  { speaker: 'doctor', text: 'We will start triamcinolone 0.1% cream twice daily and moisturizers.', start: 28, end: 36, confidence: 0.9 },
];

const run = async () => {
  try {
    let transcriptText = sampleTranscript;
    let segments = sampleSegments;

    if (audioPath) {
      if (!durationSeconds || Number.isNaN(durationSeconds)) {
        throw new Error('Provide a valid --duration in seconds when using --audio.');
      }
      const transcription = await transcribeAudio(audioPath, durationSeconds);
      transcriptText = transcription.text;
      segments = transcription.segments;
    }

    const note = await generateClinicalNote(transcriptText, segments, null, {
      patientName: 'Sample Patient',
      patientAge: 45,
      chiefComplaint: 'itchy rash',
      relevantHistory: 'eczema, takes cetirizine, NKDA',
    });

    console.log('AI Scribe Smoke Test Result');
    console.log('---');
    console.log('Chief Complaint:', note.chiefComplaint);
    console.log('Assessment:', note.assessment);
    console.log('Plan:', note.plan);
    console.log('Differential Diagnoses:', note.differentialDiagnoses?.length || 0);
    console.log('Recommended Tests:', note.recommendedTests?.length || 0);
    console.log('Patient Summary:', note.patientSummary?.whatWeDiscussed || 'n/a');
    console.log('---');
    console.log('Success: AI note generation completed');
  } catch (error) {
    console.error('AI Scribe Smoke Test failed:', error);
    process.exit(1);
  }
};

void run();
