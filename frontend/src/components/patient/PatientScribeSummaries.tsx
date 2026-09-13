import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Skeleton } from '../ui';
import {
  fetchAmbientNote,
  fetchPatientSummaries,
  sharePatientSummary,
  type AmbientGeneratedNote,
  type PatientSummary
} from '../../api';
import { ScribeSummaryCard } from '../ScribeSummaryCard';
import {
  buildDiagnoses,
  buildNextSteps,
  buildSummaryText,
  buildSymptoms,
  buildTreatmentPlan,
  buildTests
} from '../../utils/scribeSummary';

interface PatientScribeSummariesProps {
  patientId: string;
  patientName: string;
  refreshSignal?: number;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function PatientScribeSummaries({ patientId, patientName, refreshSignal = 0 }: PatientScribeSummariesProps) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<PatientSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<string, AmbientGeneratedNote>>({});
  const [noteLoading, setNoteLoading] = useState<Record<string, boolean>>({});
  const [noteErrors, setNoteErrors] = useState<Record<string, boolean>>({});
  const [sharingId, setSharingId] = useState<string | null>(null);

  const canShareSummaries = ['provider', 'admin'].includes(String(session?.user?.role || '').toLowerCase());

  const loadSummaries = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setNoteErrors({});
      const data = await fetchPatientSummaries(session.tenantId, session.accessToken, patientId);
      setSummaries(data.summaries || []);
      if (data.summaries?.length) {
        setExpandedId((prev) => prev ?? data.summaries[0].id);
      }
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to load patient summaries'));
    } finally {
      setLoading(false);
    }
  }, [patientId, session, showError]);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries, refreshSignal]);

  useEffect(() => {
    if (!session || !expandedId) return;
    const summary = summaries.find((item) => item.id === expandedId);
    const noteId = summary?.ambientNoteId || undefined;
    if (!noteId || noteMap[noteId] || noteLoading[noteId] || noteErrors[noteId]) return;

    setNoteLoading((prev) => ({ ...prev, [noteId]: true }));
    fetchAmbientNote(session.tenantId, session.accessToken, noteId)
      .then((data) => {
        setNoteMap((prev) => ({ ...prev, [noteId]: data.note }));
      })
      .catch(() => {
        setNoteErrors((prev) => ({ ...prev, [noteId]: true }));
      })
      .finally(() => {
        setNoteLoading((prev) => ({ ...prev, [noteId]: false }));
      });
  }, [expandedId, summaries, session, noteMap, noteLoading, noteErrors]);

  const handleShareSummary = useCallback(async (summaryId: string) => {
    if (!session || sharingId) return;
    setSharingId(summaryId);
    try {
      const result = await sharePatientSummary(session.tenantId, session.accessToken, summaryId);
      setSummaries((current) => current.map((summary) => summary.id === summaryId
        ? { ...summary, sharedAt: summary.sharedAt || new Date().toISOString() }
        : summary));
      showSuccess(result.message || 'Summary shared to the patient portal');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to share patient summary'));
    } finally {
      setSharingId(null);
    }
  }, [session, sharingId, showError, showSuccess]);

  const summaryCards = useMemo(() => {
    return summaries.map((summary) => {
      const note = summary.ambientNoteId ? noteMap[summary.ambientNoteId] : undefined;
      const isExpanded = expandedId === summary.id;
      const statusLabel = summary.sharedAt ? 'Shared with patient' : 'Saved to chart';
      const symptoms = buildSymptoms(note, summary);
      const potentialDiagnoses = buildDiagnoses(note, summary);
      const suggestedTests = buildTests(note, summary);
      const treatmentPlan = buildTreatmentPlan(note, summary);
      const nextSteps = buildNextSteps(note, summary);
      const summaryText = buildSummaryText(note, summary);

      const actions = (
        <>
          {summary.encounterId && (
            <button
              type="button"
              className="scribe-summary-button"
              onClick={() => navigate(`/patients/${patientId}/encounter/${summary.encounterId}`)}
            >
              View Encounter
            </button>
          )}
          {summary.ambientNoteId && (
            <button
              type="button"
              className="scribe-summary-button"
              onClick={() => navigate(`/ambient-scribe?noteId=${summary.ambientNoteId}`)}
            >
              View Note
            </button>
          )}
          {!summary.sharedAt && canShareSummaries && (!summary.ambientNoteId || note?.reviewStatus === 'approved') && (
            <button
              type="button"
              className="scribe-summary-button"
              onClick={() => void handleShareSummary(summary.id)}
              disabled={sharingId === summary.id}
            >
              {sharingId === summary.id ? 'Sharing…' : 'Share to Portal'}
            </button>
          )}
          <button
            type="button"
            className="scribe-summary-button scribe-summary-button--primary"
            onClick={() => setExpandedId(isExpanded ? null : summary.id)}
          >
            {isExpanded ? 'Collapse' : 'Details'}
          </button>
        </>
      );

      const noteId = summary.ambientNoteId || '';
      const footerNote = noteLoading[noteId]
        ? 'Loading AI note details...'
        : noteErrors[noteId]
          ? 'AI note details unavailable; showing saved summary.'
        : `Stored in ${patientName}'s chart`;

      return (
        <ScribeSummaryCard
          key={summary.id}
          title="AI Scribe Visit Summary"
          visitDate={summary.visitDate}
          providerName={summary.providerName}
          statusLabel={statusLabel}
          actions={actions}
          symptoms={symptoms}
          potentialDiagnoses={potentialDiagnoses}
          suggestedTests={suggestedTests}
          treatmentPlan={treatmentPlan}
          nextSteps={nextSteps}
          summaryText={summaryText}
          showDetails={isExpanded}
          compact={!isExpanded}
          footerNote={footerNote}
        />
      );
    });
  }, [summaries, noteMap, expandedId, navigate, patientId, patientName, noteLoading, noteErrors, sharingId, canShareSummaries, handleShareSummary]);

  return (
    <div className="scribe-summary-panel">
      <div className="scribe-summary-panel__header">
        <div>
          <h2 className="scribe-summary-panel__title">AI Scribe Archive</h2>
          <div className="scribe-summary-panel__subtitle">
            Patient-friendly visit summaries stored in {patientName}'s profile.
          </div>
        </div>
        <div className="scribe-summary-panel__actions">
          <button type="button" className="scribe-summary-button" onClick={() => void loadSummaries()}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="scribe-summary-list">
          <Skeleton variant="card" height={180} />
          <Skeleton variant="card" height={180} />
        </div>
      ) : summaries.length === 0 ? (
        <div className="scribe-summary-empty">
          No AI scribe summaries yet. Approve a note to publish a clean summary here.
        </div>
      ) : (
        <div className="scribe-summary-list">
          {summaryCards}
        </div>
      )}
    </div>
  );
}
