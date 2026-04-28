import { generateClinicalNote, type TranscriptionSegment } from '../services/ambientAI';
import { generateAmbientLiveInsights } from '../services/ambientLiveInsights';

process.env.AMBIENT_AI_MOCK_DELAY_MS = process.env.AMBIENT_AI_MOCK_DELAY_MS || '0';
// This local QA suite should never spend real AI tokens or depend on network access.
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

type Scenario = {
  name: string;
  segments: TranscriptionSegment[];
  expected: {
    diagnosis: RegExp;
    tests: RegExp[];
    safetyFlags?: RegExp[];
    medications?: RegExp[];
    actions?: RegExp[];
  };
};

const scenarios: Scenario[] = [
  {
    name: 'Melanoma rule-out lesion visit',
    segments: [
      { speaker: 'doctor', text: 'What brings you in today?', start: 0, end: 2, confidence: 0.95 },
      { speaker: 'patient', text: 'I noticed a dark mole on my upper back that has been changing for two months.', start: 2, end: 8, confidence: 0.93 },
      { speaker: 'patient', text: 'It started bleeding last week and the border looks irregular.', start: 8, end: 13, confidence: 0.92 },
      { speaker: 'doctor', text: 'On exam there is an asymmetric black papule with variegated pigment.', start: 13, end: 20, confidence: 0.93 },
      { speaker: 'doctor', text: 'I recommend dermoscopy, clinical photography, and a shave biopsy for pathology review.', start: 20, end: 28, confidence: 0.94 },
    ],
    expected: {
      diagnosis: /melanoma|pigmented lesion/i,
      tests: [/biopsy/i, /dermoscopy|photography/i, /pathology/i],
      safetyFlags: [/skin cancer/i],
      actions: [/biopsy workflow/i],
    },
  },
  {
    name: 'Acne isotretinoin counseling visit',
    segments: [
      { speaker: 'doctor', text: 'Tell me what has been happening with your acne.', start: 0, end: 3, confidence: 0.95 },
      { speaker: 'patient', text: 'My acne has deep painful cysts on the jaw and chest with scarring.', start: 3, end: 9, confidence: 0.94 },
      { speaker: 'doctor', text: 'We may discuss isotretinoin after baseline labs.', start: 9, end: 14, confidence: 0.92 },
      { speaker: 'doctor', text: 'We need a lipid panel, hepatic function panel, and pregnancy test if applicable.', start: 14, end: 21, confidence: 0.93 },
    ],
    expected: {
      diagnosis: /acne/i,
      tests: [/lipid/i, /hepatic/i, /pregnancy/i],
      safetyFlags: [/isotretinoin/i],
      medications: [/isotretinoin/i],
    },
  },
  {
    name: 'Psoriasis biologic workup visit',
    segments: [
      { speaker: 'patient', text: 'I have thick scaly plaques on my elbows and scalp and morning joint stiffness.', start: 0, end: 7, confidence: 0.93 },
      { speaker: 'doctor', text: 'This sounds consistent with psoriasis, and the joint stiffness raises concern for psoriatic arthritis.', start: 7, end: 14, confidence: 0.94 },
      { speaker: 'doctor', text: 'If we move to Skyrizi biologic therapy, we need CBC, CMP, TB screening, and a hepatitis panel first.', start: 14, end: 24, confidence: 0.92 },
    ],
    expected: {
      diagnosis: /psoriasis/i,
      tests: [/cbc|cmp/i, /tb/i, /hepatitis/i],
      safetyFlags: [/systemic therapy|psoriatic arthritis/i],
      medications: [/skyrizi/i],
    },
  },
  {
    name: 'Contact dermatitis treatment visit',
    segments: [
      { speaker: 'doctor', text: 'What changed before the rash started?', start: 0, end: 3, confidence: 0.95 },
      { speaker: 'patient', text: 'I have an itchy red rash on my hands after using new detergent and hand sanitizer.', start: 3, end: 10, confidence: 0.94 },
      { speaker: 'doctor', text: 'Exam shows dry cracked erythematous patches on the hands.', start: 10, end: 16, confidence: 0.93 },
      { speaker: 'doctor', text: 'Start triamcinolone twice daily, moisturize, avoid the detergent, and follow up in three weeks.', start: 16, end: 24, confidence: 0.94 },
    ],
    expected: {
      diagnosis: /contact dermatitis/i,
      tests: [/patch testing/i],
      medications: [/triamcinolone/i],
      actions: [/follow-up|education|triamcinolone/i],
    },
  },
];

function joinedTranscript(segments: TranscriptionSegment[]): string {
  return segments.map((segment) => `${segment.speaker}: ${segment.text}`).join('\n');
}

function containsMatch(values: string[], expected: RegExp): boolean {
  return values.some((value) => expected.test(value));
}

async function runScenario(scenario: Scenario) {
  const transcriptText = joinedTranscript(scenario.segments);

  const progressiveSnapshots = scenario.segments.map((_, index) =>
    generateAmbientLiveInsights(
      scenario.segments.slice(0, index + 1).map((segment) => `${segment.speaker}: ${segment.text}`)
    )
  );
  const finalInsights = progressiveSnapshots[progressiveSnapshots.length - 1]!;
  const note = await generateClinicalNote(transcriptText, scenario.segments, null, {
    patientName: 'QA Patient',
    providerName: 'QA Provider',
    appointmentTypeName: scenario.name,
    specialtyFocus: 'medical_derm',
  });

  const failures: string[] = [];
  const diagnosisNames = finalInsights.workingDiagnoses.map((item) => item.condition);
  if (!containsMatch(diagnosisNames, scenario.expected.diagnosis)) {
    failures.push(`missing expected live diagnosis ${scenario.expected.diagnosis}`);
  }

  const testNames = finalInsights.suggestedTests.map((item) => item.testName);
  for (const expected of scenario.expected.tests) {
    if (!containsMatch(testNames, expected)) {
      failures.push(`missing expected test ${expected}`);
    }
  }

  const flagNames = finalInsights.safetyFlags.map((item) => item.label);
  for (const expected of scenario.expected.safetyFlags || []) {
    if (!containsMatch(flagNames, expected)) {
      failures.push(`missing expected safety flag ${expected}`);
    }
  }

  const medicationNames = finalInsights.medications.map((item) => item.name);
  for (const expected of scenario.expected.medications || []) {
    if (!containsMatch(medicationNames, expected)) {
      failures.push(`missing expected medication ${expected}`);
    }
  }

  const actionNames = finalInsights.clinicalActions.map((item) => item.label);
  for (const expected of scenario.expected.actions || []) {
    if (!containsMatch(actionNames, expected)) {
      failures.push(`missing expected action ${expected}`);
    }
  }

  if (!finalInsights.visitSummary.oneLiner || finalInsights.visitSummary.oneLiner.length < 20) {
    failures.push('live one-line summary was too thin');
  }
  if (finalInsights.visitSummary.patientReported.length === 0) {
    failures.push('patient-reported summary was empty');
  }
  if (!note.patientSummary?.whatWeDiscussed || note.differentialDiagnoses.length === 0) {
    failures.push('generated note did not include patient summary and differential diagnoses');
  }

  return {
    scenario: scenario.name,
    passed: failures.length === 0,
    failures,
    liveSummary: finalInsights.visitSummary.oneLiner,
    diagnoses: diagnosisNames,
    tests: testNames,
    safetyFlags: flagNames,
    medications: medicationNames,
    actions: actionNames,
    noteChiefComplaint: note.chiefComplaint,
  };
}

async function main() {
  const results = [];

  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }

  const failed = results.filter((result) => !result.passed);

  console.log('Ambient Scribe Quality Suite');
  console.log('---');
  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.scenario}`);
    console.log(`  Summary: ${result.liveSummary}`);
    console.log(`  Diagnoses: ${result.diagnoses.join(', ') || 'none'}`);
    console.log(`  Tests: ${result.tests.join(', ') || 'none'}`);
    console.log(`  Safety: ${result.safetyFlags.join(', ') || 'none'}`);
    console.log(`  Actions: ${result.actions.join(', ') || 'none'}`);
    if (result.failures.length > 0) {
      console.log(`  Failures: ${result.failures.join('; ')}`);
    }
  }
  console.log('---');
  console.log(`Passed ${results.length - failed.length}/${results.length} simulated dermatology conversations`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
