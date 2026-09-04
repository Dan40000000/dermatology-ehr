import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  saveChronicTherapyEntry: vi.fn(),
  recordMipsItchAssessment: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { tenantId: 'tenant-1', accessToken: 'test-token' },
    headers: { 'x-tenant-id': 'tenant-1', Authorization: 'Bearer test-token' },
  }),
}));

vi.mock('../../../api', () => ({ saveChronicTherapyEntry: apiMocks.saveChronicTherapyEntry }));
vi.mock('../../../api/mipsReadiness', () => ({ recordMipsItchAssessment: apiMocks.recordMipsItchAssessment }));

import { MipsQualityCaptureCard } from '../MipsQualityCaptureCard';

describe('MipsQualityCaptureCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.saveChronicTherapyEntry.mockResolvedValue({ created: true, candidateCapture: { action: 'created' } });
    apiMocks.recordMipsItchAssessment.mockResolvedValue({ assessment: { id: 'assessment-1' }, candidateCapture: { action: 'created' } });
  });

  it('records a named, same-instrument itch event as a candidate', async () => {
    render(<MipsQualityCaptureCard patientId="11111111-1111-4111-8111-111111111111" encounterId="22222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByText('Record named itch assessment (485/486)'));
    fireEvent.change(screen.getByLabelText('Assessment phase'), { target: { value: 'follow_up' } });
    fireEvent.change(screen.getByLabelText('Score (0–10)'), { target: { value: '3' } });
    const assessmentDate = screen.getByLabelText('Assessment date');
    fireEvent.change(assessmentDate, { target: { value: '2026-09-02' } });
    assessmentDate.focus();
    fireEvent.submit(assessmentDate.closest('form') as HTMLFormElement);
    await waitFor(() => expect(apiMocks.recordMipsItchAssessment).toHaveBeenCalled());
    expect(apiMocks.recordMipsItchAssessment.mock.calls[0][1]).toMatchObject({
      conditionCode: 'atopic_dermatitis', phase: 'follow_up', instrumentCode: 'practice_numeric_itch_scale',
      instrumentVersion: 'practice-v1', score: 3, scaleMin: 0, scaleMax: 10,
      assessmentDate: '2026-09-02', sourceRevision: 1,
    });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/No reporting credit was awarded automatically/i);
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).not.toHaveAttribute('tabindex');
    expect(document.activeElement).toBe(assessmentDate);
  });

  it('announces a capture error without moving focus to the status message', async () => {
    apiMocks.recordMipsItchAssessment.mockRejectedValueOnce(new Error('Synthetic capture failure'));
    render(<MipsQualityCaptureCard patientId="11111111-1111-4111-8111-111111111111" encounterId="22222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByText('Record named itch assessment (485/486)'));
    fireEvent.change(screen.getByLabelText('Score (0–10)'), { target: { value: '3' } });
    const assessmentDate = screen.getByLabelText('Assessment date');
    fireEvent.change(assessmentDate, { target: { value: '2026-09-02' } });
    assessmentDate.focus();

    fireEvent.submit(assessmentDate.closest('form') as HTMLFormElement);

    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Synthetic capture failure'));
    expect(document.activeElement).toBe(assessmentDate);
  });

  it('requires explicit first-course confirmation and never derives classification from the drug name', async () => {
    render(<MipsQualityCaptureCard patientId="11111111-1111-4111-8111-111111111111" encounterId="22222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByText('Record first-course therapy and TB date (176)'));
    fireEvent.change(screen.getByLabelText('Primary diagnosis'), { target: { value: 'Synthetic diagnosis' } });
    fireEvent.change(screen.getByLabelText('Medication name'), { target: { value: 'Synthetic therapy' } });
    fireEvent.change(screen.getByLabelText('Medication class'), { target: { value: 'Synthetic class' } });
    fireEvent.change(screen.getByLabelText('Therapy start date'), { target: { value: '2026-09-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save therapy entry' }));
    expect(apiMocks.saveChronicTherapyEntry).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /I confirm this is the patient’s first course/i })).toBeInvalid();

    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this is the patient’s first course/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save therapy entry' }));
    await waitFor(() => expect(apiMocks.saveChronicTherapyEntry).toHaveBeenCalled());
    expect(apiMocks.saveChronicTherapyEntry.mock.calls[0][2]).toMatchObject({
      medicationName: 'Synthetic therapy',
      mipsTherapyClassification: 'biologic_or_immune_response_modifier',
      mipsFirstCourse: true,
    });
    expect(screen.getByRole('status')).toHaveTextContent(/No medication-name inference or automatic credit/i);
  });

  it('uses native field validation to block out-of-year clinical dates', () => {
    render(<MipsQualityCaptureCard patientId="11111111-1111-4111-8111-111111111111" encounterId="22222222-2222-4222-8222-222222222222" />);
    fireEvent.click(screen.getByText('Record named itch assessment (485/486)'));
    fireEvent.change(screen.getByLabelText('Score (0–10)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Assessment date'), { target: { value: '2027-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save itch assessment' }));

    expect(screen.getByLabelText('Assessment date')).toBeInvalid();
    expect(apiMocks.recordMipsItchAssessment).not.toHaveBeenCalled();
  });

  it('disables clinical capture controls when the encounter is read-only', () => {
    render(<MipsQualityCaptureCard patientId="11111111-1111-4111-8111-111111111111" encounterId="22222222-2222-4222-8222-222222222222" readOnly />);
    fireEvent.click(screen.getByText('Record named itch assessment (485/486)'));
    expect(screen.getByRole('group', { name: 'Same-instrument itch score' })).toBeDisabled();
  });
});
