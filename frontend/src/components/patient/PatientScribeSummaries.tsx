import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Skeleton } from '../ui';
import {
  fetchAmbientNote,
  fetchPatientSummaries,
  type AmbientGeneratedNote,
  type PatientSummary
} from '../../api';
import { ScribeSummaryCard } from '../ScribeSummaryCard';
import {
  buildConcerns,
  buildDiagnoses,
  buildSummaryText,
  buildSymptoms,
  buildTests
} from '../../utils/scribeSummary';

interface PatientScribeSummariesProps {
  patientId: string;
  patientName: string;
}

export function PatientScribeSummaries({ patientId, patientName }: PatientScribeSummariesProps) {
  const { session } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<PatientSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<string, AmbientGeneratedNote>>({});
  const [noteLoading, setNoteLoading] = useState<Record<string, boolean>>({});

  const loadSummaries = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const data = await fetchPatientSummaries(session.tenantId, session.accessToken, patientId);
      setSummaries(data.summaries || []);
      if (data.summaries?.length) {
        setExpandedId((prev) => prev ?? data.summaries[0].id);
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load patient summaries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummaries();
  }, [session, patientId]);

  useEffect(() => {
    if (!session || !expandedId) return;
    const summary = summaries.find((item) => item.id === expandedId);
    const noteId = summary?.ambientNoteId || undefined;
    if (!noteId || noteMap[noteId] || noteLoading[noteId]) return;

    setNoteLoading((prev) => ({ ...prev, [noteId]: true }));
    fetchAmbientNote(session.tenantId, session.accessToken, noteId)
      .then((data) => {
        setNoteMap((prev) => ({ ...prev, [noteId]: data.note }));
      })
      .catch(() => {})
      .finally(() => {
        setNoteLoading((prev) => ({ ...prev, [noteId]: false }));
      });
  }, [expandedId, summaries, session, noteMap, noteLoading]);

  const summaryCards = useMemo(() => {
    return summaries.map((summary) => {
      const note = summary.ambientNoteId ? noteMap[summary.ambientNoteId] : undefined;
      const isExpanded = expandedId === summary.id;
      const statusLabel = summary.sharedAt ? 'Shared with patient' : 'Saved to chart';
      const symptoms = buildSymptoms(note, summary);
      const concerns = buildConcerns(note);
      const potentialDiagnoses = buildDiagnoses(note, summary);
      const suggestedTests = buildTests(note, summary);
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
          <button
            type="button"
            className="scribe-summary-button scribe-summary-button--primary"
            onClick={() => setExpandedId(isExpanded ? null : summary.id)}
          >
            {isExpanded ? 'Collapse' : 'Details'}
          </button>
        </>
      );

      const footerNote = noteLoading[summary.ambientNoteId || '']
        ? 'Loading AI note details...'
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
          concerns={concerns}
          potentialDiagnoses={potentialDiagnoses}
          suggestedTests={suggestedTests}
          summaryText={summaryText}
          showDetails={isExpanded}
          compact={!isExpanded}
          footerNote={footerNote}
        />
      );
    });
  }, [summaries, noteMap, expandedId, navigate, patientId, patientName, noteLoading]);

  return (
    <div className="scribe-summary-panel">
      <div className="scribe-summary-panel__header">
        <div>
          <div className="scribe-summary-panel__title">AI Scribe Archive</div>
          <div className="scribe-summary-panel__subtitle">
            Patient-friendly visit summaries stored in {patientName}'s profile.
          </div>
        </div>
        <div className="scribe-summary-panel__actions">
          <button type="button" className="scribe-summary-button" onClick={loadSummaries}>
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
