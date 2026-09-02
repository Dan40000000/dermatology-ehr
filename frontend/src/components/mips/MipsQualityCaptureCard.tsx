import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { saveChronicTherapyEntry } from '../../api';
import { recordMipsItchAssessment } from '../../api/mipsReadiness';
import './MipsQualityCaptureCard.css';

interface MipsQualityCaptureCardProps {
  patientId: string;
  encounterId: string;
  readOnly?: boolean;
}

function newClientEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `mips-itch-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function MipsQualityCaptureCard({ patientId, encounterId, readOnly = false }: MipsQualityCaptureCardProps) {
  const { session, headers } = useAuth();
  const messageRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingItch, setSavingItch] = useState(false);
  const [savingTherapy, setSavingTherapy] = useState(false);
  const [itchEventId, setItchEventId] = useState(newClientEventId);
  const [itch, setItch] = useState({
    conditionCode: 'atopic_dermatitis' as 'atopic_dermatitis' | 'psoriasis',
    phase: 'baseline' as 'baseline' | 'follow_up',
    instrumentCode: 'practice_numeric_itch_scale',
    instrumentVersion: 'practice-v1',
    score: '',
    assessmentDate: '',
  });
  const [therapy, setTherapy] = useState({
    primaryDiagnosis: '', medicationName: '', medicationClass: '', startDate: '',
    lastTbScreening: '', currentDose: '', firstCourseConfirmed: false,
  });

  const announce = (nextMessage: string, nextError = '') => {
    setMessage(nextMessage);
    setError(nextError);
    window.requestAnimationFrame(() => messageRef.current?.focus());
  };

  const submitItch = async (event: FormEvent) => {
    event.preventDefault();
    const score = Number(itch.score);
    if (!itch.assessmentDate || !itch.score || !Number.isFinite(score) || score < 0 || score > 10) {
      announce('Review the itch assessment fields.', 'Enter a 2026 assessment date and a score from 0 through 10.');
      return;
    }
    if (!session) return;
    setSavingItch(true);
    setError('');
    try {
      await recordMipsItchAssessment({ headers }, {
        patientId,
        encounterId,
        conditionCode: itch.conditionCode,
        instrumentCode: itch.instrumentCode.trim(),
        instrumentVersion: itch.instrumentVersion.trim(),
        score,
        scaleMin: 0,
        scaleMax: 10,
        assessmentDate: itch.assessmentDate,
        phase: itch.phase,
        clientEventId: itchEventId,
        sourceRevision: 1,
      });
      setItch((current) => ({ ...current, score: '', assessmentDate: '' }));
      setItchEventId(newClientEventId());
      announce('Itch assessment saved and a reviewable MIPS candidate was refreshed. No reporting credit was awarded automatically.');
    } catch (caught) {
      announce('The itch assessment was not saved.', caught instanceof Error ? caught.message : 'Unable to save the structured itch assessment.');
    } finally {
      setSavingItch(false);
    }
  };

  const submitTherapy = async (event: FormEvent) => {
    event.preventDefault();
    if (!therapy.primaryDiagnosis.trim() || !therapy.medicationName.trim() || !therapy.medicationClass.trim()
      || !therapy.startDate || !therapy.firstCourseConfirmed) {
      announce('Review the therapy fields.', 'Diagnosis, medication, medication class, start date, and explicit first-course confirmation are required.');
      return;
    }
    if (!session) return;
    setSavingTherapy(true);
    setError('');
    try {
      await saveChronicTherapyEntry(session.tenantId, session.accessToken, {
        patientId,
        primaryDiagnosis: therapy.primaryDiagnosis.trim(),
        medicationName: therapy.medicationName.trim(),
        medicationClass: therapy.medicationClass.trim(),
        startDate: therapy.startDate,
        currentDose: therapy.currentDose.trim() || undefined,
        lastTbScreening: therapy.lastTbScreening || undefined,
        mipsTherapyClassification: 'biologic_or_immune_response_modifier',
        mipsFirstCourse: true,
      });
      setTherapy({ primaryDiagnosis: '', medicationName: '', medicationClass: '', startDate: '', lastTbScreening: '', currentDose: '', firstCourseConfirmed: false });
      announce('Chronic therapy entry saved and a reviewable measure 176 candidate was created. No medication-name inference or automatic credit was used.');
    } catch (caught) {
      announce('The chronic therapy entry was not saved.', caught instanceof Error ? caught.message : 'Unable to save the chronic therapy entry.');
    } finally {
      setSavingTherapy(false);
    }
  };

  return (
    <section className="mips-capture-card" aria-labelledby="mips-capture-heading">
      <div className="mips-capture-card__heading">
        <div><span>2026 workflow capture</span><h3 id="mips-capture-heading">MIPS supporting data</h3></div>
        <strong>Candidate only</strong>
      </div>
      <p>Record structured facts during care. These fields create review items; they do not calculate an official numerator or submit anything.</p>
      <div ref={messageRef} className={error ? 'mips-capture-message mips-capture-message--error' : 'mips-capture-message'} role={error ? 'alert' : 'status'} tabIndex={-1}>
        {error || message}
      </div>

      <details>
        <summary>Record named itch assessment (485/486)</summary>
        <form onSubmit={submitItch}>
          <fieldset disabled={readOnly || savingItch}>
            <legend>Same-instrument itch score</legend>
            <div className="mips-capture-grid">
              <label>Condition<select value={itch.conditionCode} onChange={(event) => setItch({ ...itch, conditionCode: event.target.value as typeof itch.conditionCode })}><option value="atopic_dermatitis">Atopic dermatitis (486)</option><option value="psoriasis">Psoriasis (485)</option></select></label>
              <label>Assessment phase<select value={itch.phase} onChange={(event) => setItch({ ...itch, phase: event.target.value as typeof itch.phase })}><option value="baseline">Baseline</option><option value="follow_up">Follow-up</option></select></label>
              <label>Instrument code<input required maxLength={80} aria-describedby="mips-itch-help" value={itch.instrumentCode} onChange={(event) => setItch({ ...itch, instrumentCode: event.target.value })} /></label>
              <label>Instrument version<input required maxLength={40} aria-describedby="mips-itch-help" value={itch.instrumentVersion} onChange={(event) => setItch({ ...itch, instrumentVersion: event.target.value })} /></label>
              <label>Score (0–10)<input required type="number" min={0} max={10} step="any" aria-describedby="mips-itch-help" value={itch.score} onChange={(event) => setItch({ ...itch, score: event.target.value })} /></label>
              <label>Assessment date<input required type="date" min="2026-01-01" max="2026-12-31" aria-describedby="mips-itch-help" value={itch.assessmentDate} onChange={(event) => setItch({ ...itch, assessmentDate: event.target.value })} /></label>
            </div>
            <p className="mips-capture-help" id="mips-itch-help">Use the identical code and version at baseline and follow-up. The assessment date must be in 2026. This practice-defined scale is not asserted to be a licensed measure instrument.</p>
            <button type="submit" disabled={readOnly || savingItch}>{savingItch ? 'Saving assessment…' : 'Save itch assessment'}</button>
          </fieldset>
        </form>
      </details>

      <details>
        <summary>Record first-course therapy and TB date (176)</summary>
        <form onSubmit={submitTherapy}>
          <fieldset disabled={readOnly || savingTherapy}>
            <legend>Explicit therapy classification</legend>
            <div className="mips-capture-grid">
              <label>Primary diagnosis<input required value={therapy.primaryDiagnosis} onChange={(event) => setTherapy({ ...therapy, primaryDiagnosis: event.target.value })} /></label>
              <label>Medication name<input required value={therapy.medicationName} onChange={(event) => setTherapy({ ...therapy, medicationName: event.target.value })} /></label>
              <label>Medication class<input required value={therapy.medicationClass} onChange={(event) => setTherapy({ ...therapy, medicationClass: event.target.value })} /></label>
              <label>Current dose <span>(optional)</span><input value={therapy.currentDose} onChange={(event) => setTherapy({ ...therapy, currentDose: event.target.value })} /></label>
              <label>Therapy start date<input required type="date" min="2026-01-01" max="2026-12-31" aria-describedby="mips-therapy-help" value={therapy.startDate} onChange={(event) => setTherapy({ ...therapy, startDate: event.target.value })} /></label>
              <label>Last TB screening <span>(optional)</span><input type="date" max="2026-12-31" aria-describedby="mips-therapy-help" value={therapy.lastTbScreening} onChange={(event) => setTherapy({ ...therapy, lastTbScreening: event.target.value })} /></label>
            </div>
            <label className="mips-capture-confirm"><input required type="checkbox" aria-describedby="mips-therapy-help" checked={therapy.firstCourseConfirmed} onChange={(event) => setTherapy({ ...therapy, firstCourseConfirmed: event.target.checked })} /> I confirm this is the patient’s first course of a biologic or immune-response modifier for this workflow.</label>
            <p className="mips-capture-help" id="mips-therapy-help">The therapy start date must be in 2026. The EMR does not infer this classification from the medication name. Missing TB data produces an unknown candidate for review.</p>
            <button type="submit" disabled={readOnly || savingTherapy}>{savingTherapy ? 'Saving therapy…' : 'Save therapy entry'}</button>
          </fieldset>
        </form>
      </details>
    </section>
  );
}

export default MipsQualityCaptureCard;
