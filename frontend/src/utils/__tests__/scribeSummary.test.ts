import type { AmbientGeneratedNote } from '../../api';
import {
  buildSymptoms,
  buildDiagnoses,
  buildTests,
  buildSummaryText
} from '../scribeSummary';

const baseNote: AmbientGeneratedNote = {
  id: 'note-1',
  transcriptId: 'tx-1',
  chiefComplaint: 'Itchy rash on forearms',
  hpi: 'Itchy, red, scaly rash',
  ros: 'Skin positive for rash',
  physicalExam: 'Erythematous plaques',
  assessment: 'Dermatitis',
  plan: 'Topical steroid',
  suggestedIcd10Codes: [],
  suggestedCptCodes: [],
  mentionedMedications: [],
  mentionedAllergies: [],
  followUpTasks: [],
  differentialDiagnoses: [],
  recommendedTests: [],
  overallConfidence: 0.9,
  sectionConfidence: {},
  reviewStatus: 'pending',
  generationStatus: 'completed',
  createdAt: '2026-02-14T00:00:00.000Z'
};

describe('scribeSummary helpers', () => {
  it('prefers structured formal summary symptoms', () => {
    const symptoms = buildSymptoms({
      ...baseNote,
      noteContent: {
        formalAppointmentSummary: {
          symptoms: ['Rash', 'Itching', 'Redness']
        }
      }
    });

    expect(symptoms).toEqual(['Rash', 'Itching', 'Redness']);
  });

  it('renders structured diagnosis percentages', () => {
    const diagnoses = buildDiagnoses({
      ...baseNote,
      noteContent: {
        formalAppointmentSummary: {
          probableDiagnoses: [
            {
              condition: 'Allergic contact dermatitis',
              probabilityPercent: 72,
              reasoning: 'Detergent trigger',
              icd10Code: 'L23.9'
            }
          ]
        }
      }
    });

    expect(diagnoses[0]).toEqual({
      label: 'Allergic contact dermatitis',
      meta: '72%'
    });
  });

  it('uses structured suggested tests before legacy arrays', () => {
    const tests = buildTests({
      ...baseNote,
      recommendedTests: [
        { testName: 'Legacy test', rationale: 'Legacy', urgency: 'routine' }
      ],
      noteContent: {
        formalAppointmentSummary: {
          suggestedTests: [
            {
              testName: 'Patch testing',
              urgency: 'soon',
              rationale: 'Find trigger'
            }
          ]
        }
      }
    });

    expect(tests).toEqual([{ label: 'Patch testing', meta: 'SOON' }]);
  });

  it('uses patient summary text from structured note content', () => {
    const summaryText = buildSummaryText({
      ...baseNote,
      noteContent: {
        patientSummary: {
          whatWeDiscussed: 'We reviewed your rash symptoms and treatment options.'
        }
      }
    });

    expect(summaryText).toBe('We reviewed your rash symptoms and treatment options.');
  });
});
