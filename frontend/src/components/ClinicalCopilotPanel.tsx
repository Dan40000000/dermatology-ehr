import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  askClinicalCopilot,
  saveClinicalCopilotVisitSummary,
  type ClinicalCopilotMessage,
  type ClinicalCopilotResponse
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface CopilotConversationTurn extends ClinicalCopilotMessage {
  response?: ClinicalCopilotResponse;
}

interface ClinicalCopilotPanelProps {
  patientId?: string;
  encounterId?: string;
  noteId?: string;
  recordingId?: string;
  title?: string;
  compact?: boolean;
  showOpenFullButton?: boolean;
  onVisitSummarySaved?: (summaryId: string) => void;
}

const shellStyle: React.CSSProperties = {
  border: '1px solid #d7e3f4',
  borderRadius: 18,
  background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
  boxShadow: '0 18px 50px rgba(15, 23, 42, 0.06)',
  overflow: 'hidden',
};

const promptButtonStyle: React.CSSProperties = {
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  color: '#1d4ed8',
  borderRadius: 999,
  padding: '0.5rem 0.85rem',
  fontSize: '0.82rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const userBubbleStyle: React.CSSProperties = {
  alignSelf: 'flex-end',
  maxWidth: '85%',
  background: '#0f766e',
  color: 'white',
  borderRadius: '16px 16px 4px 16px',
  padding: '0.75rem 0.95rem',
  lineHeight: 1.5,
  fontSize: '0.94rem',
};

const assistantBubbleStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  maxWidth: '92%',
  background: '#ffffff',
  color: '#1f2937',
  border: '1px solid #dbeafe',
  borderRadius: '16px 16px 16px 4px',
  padding: '0.95rem 1rem',
  lineHeight: 1.55,
  fontSize: '0.94rem',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
};

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function ClinicalCopilotPanel({
  patientId,
  encounterId,
  noteId,
  recordingId,
  title = 'AI Assistant',
  compact = false,
  showOpenFullButton = false,
  onVisitSummarySaved,
}: ClinicalCopilotPanelProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const [savedSummaryId, setSavedSummaryId] = useState<string | null>(null);
  const [savedSummaryMessage, setSavedSummaryMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotConversationTurn[]>([]);

  const quickPrompts = useMemo(
    () => [
      'Summarize today\'s visit in one clean paragraph for the chart.',
      'What office visit code fits this encounter best and why?',
      'What documentation gaps should I fix before signing this visit?',
      'Draft patient-friendly instructions from this appointment.',
    ],
    []
  );

  const contextSummary = useMemo(() => {
    const parts = [
      patientId ? 'Patient linked' : null,
      encounterId ? 'Encounter linked' : null,
      noteId ? 'AI note linked' : null,
      recordingId ? 'Recording linked' : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : 'No live chart context linked';
  }, [patientId, encounterId, noteId, recordingId]);

  const canSaveVisitSummary = Boolean(patientId && (encounterId || noteId || recordingId));
  const patientHistoryPath = patientId ? `/patients/${patientId}?tab=scribe` : '';

  const submitPrompt = async (nextPrompt?: string) => {
    const text = (nextPrompt ?? prompt).trim();
    if (!text || !session) {
      return;
    }

    const history = messages.slice(-8).map((item) => ({ role: item.role, content: item.content }));
    const userTurn: CopilotConversationTurn = { role: 'user', content: text };
    setMessages((prev) => [...prev, userTurn]);
    setPrompt('');
    setLoading(true);

    try {
      const response = await askClinicalCopilot(session.tenantId, session.accessToken, {
        prompt: text,
        patientId,
        encounterId,
        noteId,
        recordingId,
        history,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.answer,
          response,
        },
      ]);
    } catch (error: any) {
      showError(error.message || 'Failed to get clinical copilot response');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVisitSummary = async () => {
    if (!session || !canSaveVisitSummary) {
      return;
    }

    const summaryPrompt = 'Summarize this visit and save it to the patient history.';
    const history = messages.slice(-8).map((item) => ({ role: item.role, content: item.content }));
    setSavingSummary(true);

    try {
      const result = await saveClinicalCopilotVisitSummary(session.tenantId, session.accessToken, {
        patientId,
        encounterId,
        noteId,
        recordingId,
        history,
      });

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: summaryPrompt },
        {
          role: 'assistant',
          content: result.response.answer,
          response: result.response,
        },
      ]);
      setSavedSummaryId(result.summaryId);
      setSavedSummaryMessage(result.message || 'Visit summary saved to patient history');
      onVisitSummarySaved?.(result.summaryId);
      showSuccess(result.message || 'Visit summary saved to patient history', patientHistoryPath ? {
        duration: 8000,
        action: {
          label: 'View History',
          onClick: () => navigate(patientHistoryPath),
        },
      } : undefined);
    } catch (error: any) {
      showError(error.message || 'Failed to save visit summary to patient history');
    } finally {
      setSavingSummary(false);
    }
  };

  return (
    <section style={shellStyle} aria-label="AI Assistant">
      <div style={{ padding: compact ? '1rem 1rem 0.85rem' : '1.1rem 1.15rem 0.9rem', borderBottom: '1px solid #e5eefb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: compact ? '1rem' : '1.1rem', fontWeight: 800, color: '#0f172a' }}>{title}</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
              Ask chart-grounded questions about summaries, E/M coding, follow-up tasks, and patient instructions.
            </div>
            <div style={{ fontSize: '0.78rem', color: '#1d4ed8', marginTop: 8, fontWeight: 700 }}>{contextSummary}</div>
          </div>
          {showOpenFullButton && (
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                if (patientId) params.set('patientId', patientId);
                if (encounterId) params.set('encounterId', encounterId);
                if (noteId) params.set('noteId', noteId);
                if (recordingId) params.set('recordingId', recordingId);
                navigate(`/ai-assistant${params.toString() ? `?${params.toString()}` : ''}`);
              }}
              style={{ ...promptButtonStyle, background: '#ffffff' }}
            >
              Open Full AI Assistant
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {canSaveVisitSummary && (
            <button
              type="button"
              onClick={() => void handleSaveVisitSummary()}
              style={{
                ...promptButtonStyle,
                background: savingSummary ? '#cbd5e1' : '#0f766e',
                borderColor: savingSummary ? '#cbd5e1' : '#0f766e',
                color: 'white',
              }}
              disabled={loading || savingSummary}
              title="Generate a visit summary and save it to the patient's AI scribe history"
            >
              {savingSummary ? 'Saving Summary...' : 'Summarize & Save to History'}
            </button>
          )}
          {quickPrompts.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void submitPrompt(item)}
              style={promptButtonStyle}
              disabled={loading}
            >
              {item}
            </button>
          ))}
        </div>
        {savedSummaryId && savedSummaryMessage && (
          <div
            style={{
              marginTop: 10,
              padding: '0.65rem 0.8rem',
              borderRadius: 12,
              background: '#ecfdf5',
              border: '1px solid #bbf7d0',
              color: '#166534',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
              fontSize: '0.84rem',
              fontWeight: 700,
            }}
          >
            <span>{savedSummaryMessage}</span>
            {patientHistoryPath && (
              <button
                type="button"
                onClick={() => navigate(patientHistoryPath)}
                style={{
                  ...promptButtonStyle,
                  background: '#ffffff',
                  borderColor: '#86efac',
                  color: '#166534',
                  padding: '0.35rem 0.7rem',
                }}
              >
                View Patient History
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: compact ? '0.9rem 1rem' : '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: 12, minHeight: compact ? 260 : 340, maxHeight: compact ? 560 : 760, overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.92rem', lineHeight: 1.6 }}>
            Start with a coding or summary question. This assistant stays grounded to the linked chart context instead of behaving like a generic chatbot.
          </div>
        ) : (
          messages.map((message, index) => {
            if (message.role === 'user') {
              return (
                <div key={`${message.role}-${index}`} style={userBubbleStyle}>
                  {message.content}
                </div>
              );
            }

            const response = message.response;
            const hasMissingData = Boolean(response?.missingData?.length);
            const hasChartEvidence = Boolean(response?.chartEvidence?.length);
            return (
              <div key={`${message.role}-${index}`} style={assistantBubbleStyle}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Answer</div>
                <div>{message.content}</div>

                {response?.visitSummary && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>
                      Visit Summary
                    </div>
                    <div style={{ color: '#334155' }}>{response.visitSummary}</div>
                  </div>
                )}

                {response?.suggestedCodes?.length ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: 8 }}>
                      Suggested Codes
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {response.suggestedCodes.map((code) => (
                        <div key={`${code.type}-${code.code}`} style={{ border: '1px solid #dbeafe', borderRadius: 12, padding: '0.75rem 0.85rem', background: '#f8fbff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>
                              {code.code} <span style={{ color: '#475569', fontWeight: 600 }}>• {code.description}</span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 800 }}>{formatConfidence(code.confidence)}</div>
                          </div>
                          <div style={{ fontSize: '0.9rem', color: '#475569' }}>{code.rationale}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                      Follow-Up Tasks
                    </div>
                    {response?.followUpTasks?.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                        {response.followUpTasks.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <div style={{ color: '#94a3b8' }}>No clear follow-up tasks were found.</div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                      Patient Instructions
                    </div>
                    {response?.patientInstructions?.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                        {response.patientInstructions.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <div style={{ color: '#94a3b8' }}>No patient-friendly instructions were generated.</div>
                    )}
                  </div>
                </div>

                {(hasMissingData || hasChartEvidence) && (
                  <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                        Missing Data
                      </div>
                      {response?.missingData?.length ? (
                        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                          {response.missingData.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      ) : (
                        <div style={{ color: '#94a3b8' }}>No major gaps identified.</div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                        Chart Evidence
                      </div>
                      {response?.chartEvidence?.length ? (
                        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                          {response.chartEvidence.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      ) : (
                        <div style={{ color: '#94a3b8' }}>No evidence lines returned.</div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 12, fontSize: '0.78rem', color: '#64748b' }}>
                  Provider: <strong>{response?.provider || 'unknown'}</strong> • Model: <strong>{response?.model || 'unknown'}</strong> • Clinician review required
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div style={{ ...assistantBubbleStyle, color: '#475569' }}>
            Reviewing chart context and generating a grounded response...
          </div>
        )}
      </div>

      <div style={{ padding: compact ? '0.85rem 1rem 1rem' : '0.95rem 1.15rem 1.15rem', borderTop: '1px solid #e5eefb' }}>
        <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', gap: 10 }}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={compact ? 3 : 4}
            placeholder="Ask about visit summary, E/M coding, missing documentation, patient instructions, or next steps..."
            style={{
              flex: 1,
              width: '100%',
              minHeight: compact ? 88 : 108,
              borderRadius: 14,
              border: '1px solid #cbd5e1',
              padding: '0.85rem 0.95rem',
              fontSize: '0.94rem',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={() => void submitPrompt()}
            disabled={loading || !prompt.trim()}
            style={{
              alignSelf: compact ? 'stretch' : 'flex-end',
              minWidth: compact ? '100%' : 160,
              padding: '0.85rem 1.1rem',
              borderRadius: 14,
              border: 'none',
              background: loading || !prompt.trim() ? '#cbd5e1' : '#0f766e',
              color: 'white',
              fontWeight: 800,
              cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Thinking...' : 'Ask AI Assistant'}
          </button>
        </div>
      </div>
    </section>
  );
}
