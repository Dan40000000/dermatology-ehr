import { useEffect, useState } from 'react';
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

interface PatientScribeSnapshotProps {
  patientId: string;
  patientName: string;
  onViewArchive?: () => void;
}

export function PatientScribeSnapshot({
  patientId,
  patientName,
  onViewArchive
}: PatientScribeSnapshotProps) {
  const { session } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [note, setNote] = useState<AmbientGeneratedNote | null>(null);

  const getConfidenceTone = (confidence: number) => {
    if (confidence >= 0.9) return 'high';
    if (confidence >= 0.75) return 'medium';
    return 'low';
  };

  const loadSnapshot = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const data = await fetchPatientSummaries(session.tenantId, session.accessToken, patientId);
      const latest = data.summaries?.[0] || null;
      setSummary(latest);

      if (latest?.ambientNoteId) {
        const noteData = await fetchAmbientNote(session.tenantId, session.accessToken, latest.ambientNoteId);
        setNote(noteData.note);
      } else {
        setNote(null);
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load AI scribe snapshot');
      setSummary(null);
      setNote(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshot();
  }, [session, patientId]);

  if (loading) {
    return <Skeleton variant="card" height={220} />;
  }

  if (!summary) {
    return (
      <div
        style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '12px',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#6b7280'
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>AI Scribe Snapshot</div>
        <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
          No AI scribe summaries yet. Approve a note to publish a clean summary here.
        </div>
        <button
          type="button"
          className="scribe-summary-button"
          onClick={() => {
            if (onViewArchive) {
              onViewArchive();
            } else {
              navigate(`/patients/${patientId}?scribe=1`);
            }
          }}
        >
          Open AI Scribe
        </button>
      </div>
    );
  }

  const symptoms = buildSymptoms(note, summary);
  const concerns = buildConcerns(note);
  const potentialDiagnoses = buildDiagnoses(note, summary);
  const suggestedTests = buildTests(note, summary);
  const summaryText = buildSummaryText(note, summary);

  const hasCptCodes = note?.suggestedCptCodes && note.suggestedCptCodes.length > 0;
  const hasFollowUpTasks = note?.followUpTasks && note.followUpTasks.length > 0;

  const actions = (
    <>
      {note?.id && (
        <button
          type="button"
          className="scribe-summary-button"
          onClick={() => navigate(`/ambient-scribe?noteId=${note.id}`)}
        >
          View Note
        </button>
      )}
      <button
        type="button"
        className="scribe-summary-button scribe-summary-button--primary"
        onClick={() => {
          if (onViewArchive) {
            onViewArchive();
          } else {
            navigate(`/patients/${patientId}?scribe=1`);
          }
        }}
      >
        AI Scribe Archive
      </button>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <ScribeSummaryCard
        title="AI Scribe Snapshot"
        visitDate={summary.visitDate}
        providerName={summary.providerName}
        statusLabel={summary.sharedAt ? 'Shared' : 'Saved to chart'}
        actions={actions}
        symptoms={symptoms}
        concerns={concerns}
        potentialDiagnoses={potentialDiagnoses}
        suggestedTests={suggestedTests}
        summaryText={summaryText}
        summaryLabel="Summary of Appointment"
        showDetails
        compact
        footerNote={`Stored in ${patientName}'s chart`}
      />

      {(hasCptCodes || hasFollowUpTasks) && (
        <div className="scribe-insight-grid">
          {hasCptCodes && (
            <div className="scribe-insight-card">
              <div className="scribe-insight-card__header">
                <div className="scribe-insight-card__title">Suggested CPT Codes</div>
              </div>
              <div className="scribe-insight-card__body">
                {note?.suggestedCptCodes?.map((code, idx) => {
                  const tone = getConfidenceTone(code.confidence);
                  return (
                    <div key={`${code.code}-${idx}`} className="scribe-insight-item">
                      <div className="scribe-insight-item__header">
                        <span className="scribe-insight-item__title">{code.code}</span>
                        <span className={`scribe-insight-pill scribe-insight-pill--${tone}`}>
                          {(code.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="scribe-insight-item__meta">{code.description}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasFollowUpTasks && (
            <div className="scribe-insight-card">
              <div className="scribe-insight-card__header">
                <div className="scribe-insight-card__title">Follow-up Tasks</div>
              </div>
              <div className="scribe-insight-card__body">
                {note?.followUpTasks?.map((task, idx) => (
                  <div key={`${task.task}-${idx}`} className="scribe-insight-item">
                    <div className="scribe-insight-item__header">
                      <span className="scribe-insight-item__title">{task.task}</span>
                      <span className={`scribe-insight-pill scribe-insight-pill--${task.priority}`}>
                        {task.priority}
                      </span>
                    </div>
                    {task.dueDate && (
                      <div className="scribe-insight-item__meta">Due: {task.dueDate}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
