import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveScribeInsightsPanel, type AmbientLiveInsightsPayload } from '../LiveScribeInsightsPanel';

const buildInsights = (): AmbientLiveInsightsPayload => ({
  recordingId: 'rec-1',
  source: 'heuristic',
  updatedAt: '2026-04-22T12:00:00.000Z',
  visitSummary: {
    oneLiner: 'Changing dark mole with suspicious pigmented lesion / melanoma rule-out in the working differential.',
    patientReported: ['I noticed a dark mole on my upper back that has been changing for two months.'],
    providerObserved: ['On exam there is an asymmetric black papule with variegated pigment.'],
    planDraft: ['I recommend dermoscopy, clinical photography, and a shave biopsy for pathology review.'],
    documentationGaps: ['Confirm medication allergies before prescribing.'],
  },
  symptoms: [
    { label: 'Changing mole / pigmented lesion', confidence: 0.91, evidence: 'dark mole on my upper back' },
  ],
  workingDiagnoses: [
    {
      condition: 'Suspicious pigmented lesion / melanoma rule-out',
      confidence: 0.83,
      reasoning: 'Supported by changing mole concern, bleeding, and irregular pigment.',
      icd10Code: 'D48.5',
    },
  ],
  suggestedTests: [
    {
      testName: 'Skin biopsy',
      urgency: 'urgent',
      rationale: 'Needed when a changing or concerning lesion is being described.',
    },
  ],
  medications: [],
  clinicalActions: [
    {
      label: 'Prepare biopsy workflow',
      type: 'procedure',
      urgency: 'urgent',
      status: 'planned',
      rationale: 'Biopsy language was captured in the conversation.',
    },
  ],
  safetyFlags: [
    {
      label: 'Skin cancer warning features',
      severity: 'urgent',
      rationale: 'Changing, bleeding, non-healing, dark, or irregular lesions should be clinically reviewed.',
    },
  ],
});

describe('LiveScribeInsightsPanel', () => {
  it('renders the four-box live summary format with secondary actions', () => {
    render(<LiveScribeInsightsPanel insights={buildInsights()} />);

    expect(screen.getByText('Live Clinical Snapshot')).toBeInTheDocument();
    expect(screen.getByText(/Live draft warming up/i)).toBeInTheDocument();
    expect(screen.getByText(/Clinician review required/i)).toBeInTheDocument();
    expect(screen.getByText('Live Summary')).toBeInTheDocument();
    expect(screen.getByText('Live Symptoms')).toBeInTheDocument();
    expect(screen.getByText('Potential Diagnosis')).toBeInTheDocument();
    expect(screen.getByText('Potential Testing')).toBeInTheDocument();
    expect(screen.getByText(/Changing dark mole/i)).toBeInTheDocument();
    expect(screen.getByText('Skin cancer warning features')).toBeInTheDocument();
    expect(screen.getByText('Suspicious pigmented lesion / melanoma rule-out')).toBeInTheDocument();
    expect(screen.getByText('Skin biopsy')).toBeInTheDocument();
    expect(screen.getByText('Prepare biopsy workflow')).toBeInTheDocument();
    expect(screen.getByText('Confirm medication allergies before prescribing.')).toBeInTheDocument();
  });

  it('shows useful empty states before enough audio is captured', () => {
    render(<LiveScribeInsightsPanel insights={null} compact />);

    expect(screen.getByText(/Live draft warming up/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Listening for enough clinical detail/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Listening for symptom language/i)).toBeInTheDocument();
    expect(screen.getByText(/No suggested tests yet/i)).toBeInTheDocument();
  });
});
