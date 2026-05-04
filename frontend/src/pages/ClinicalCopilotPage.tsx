import { useSearchParams } from 'react-router-dom';
import { ClinicalCopilotPanel } from '../components/ClinicalCopilotPanel';

export function ClinicalCopilotPage() {
  const [searchParams] = useSearchParams();

  const patientId = searchParams.get('patientId') || undefined;
  const encounterId = searchParams.get('encounterId') || undefined;
  const noteId = searchParams.get('noteId') || undefined;
  const recordingId = searchParams.get('recordingId') || undefined;

  const contextBadges = [
    patientId ? `Patient: ${patientId}` : null,
    encounterId ? `Encounter: ${encounterId}` : null,
    noteId ? `AI Note: ${noteId}` : null,
    recordingId ? `Recording: ${recordingId}` : null,
  ].filter(Boolean) as string[];

  return (
    <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
      <div>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>AI Assistant</h1>
        <p style={{ color: '#64748b', marginTop: '0.4rem', maxWidth: 920, lineHeight: 1.6 }}>
          Chart-aware dermatology AI assistant for visit summaries, documentation cleanup, office-visit coding support, and patient instructions.
        </p>
        {contextBadges.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {contextBadges.map((badge) => (
              <span
                key={badge}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 999,
                  padding: '0.45rem 0.75rem',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '0.75rem 0.9rem', maxWidth: 920 }}>
            Open this page from a patient or encounter for chart-grounded answers. Without context, the AI assistant can only answer generic workflow questions.
          </div>
        )}
      </div>

      <ClinicalCopilotPanel
        patientId={patientId}
        encounterId={encounterId}
        noteId={noteId}
        recordingId={recordingId}
        title="Dermatology AI Assistant"
      />
    </div>
  );
}

export default ClinicalCopilotPage;
