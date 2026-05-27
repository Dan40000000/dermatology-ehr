import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  applyClinicalCopilotResponse,
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

type AppliedResponseStatus = {
  summaryId: string;
  message: string;
};

type PhiWarningState = {
  message: string;
  blockedTypes: string[];
};

const blockedTypeLabels: Record<string, string> = {
  explicit_name: 'typed patient name',
  known_patient_name: 'known patient name',
  dob: 'date of birth',
  date_of_birth: 'date of birth',
  phone: 'phone number',
  email: 'email address',
  address: 'street address',
  mrn: 'medical record number',
  insurance_id: 'insurance or member ID',
  ssn: 'Social Security number',
  unique_feature: 'unique identifying feature',
};

function getBlockedTypeLabel(type: string): string {
  return blockedTypeLabels[type] || type.replace(/_/g, ' ');
}

function isPhiBlockedError(error: unknown): error is Error & { code: string; blockedTypes?: string[] } {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'AI_PHI_BLOCKED');
}

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
  const [applyingResponseIndex, setApplyingResponseIndex] = useState<number | null>(null);
  const [appliedResponses, setAppliedResponses] = useState<Record<number, AppliedResponseStatus>>({});
  const [savedSummaryId, setSavedSummaryId] = useState<string | null>(null);
  const [savedSummaryMessage, setSavedSummaryMessage] = useState<string | null>(null);
  const [phiWarning, setPhiWarning] = useState<PhiWarningState | null>(null);
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
  const canApplyCopilotResponse = useMemo(() => {
    const roles = [session?.user.role, ...(session?.user.roles || [])]
      .filter((role): role is string => typeof role === 'string')
      .map((role) => role.toLowerCase());
    return roles.includes('provider') || roles.includes('admin');
  }, [session]);
  const patientHistoryPath = patientId ? `/patients/${patientId}?tab=scribe` : '';

  const showPhiWarning = (error: Error & { blockedTypes?: string[] }) => {
    setPhiWarning({
      message: error.message || 'Potential protected health information was detected before the AI request could be sent.',
      blockedTypes: Array.isArray(error.blockedTypes) ? error.blockedTypes : [],
    });
  };

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
      setMessages((prev) => prev.slice(0, -1));
      if (isPhiBlockedError(error)) {
        setPrompt(text);
        showPhiWarning(error);
        return;
      }
      showError(error.message || 'Failed to get clinical copilot response');
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
      if (isPhiBlockedError(error)) {
        showPhiWarning(error);
        return;
      }
      showError(error.message || 'Failed to save visit summary to patient history');
    } finally {
      setSavingSummary(false);
    }
  };

  const handleApplyResponse = async (response: ClinicalCopilotResponse, messageIndex: number) => {
    if (!session || appliedResponses[messageIndex]) {
      return;
    }

    const resolvedPatientId = patientId || response.context?.patientId;
    const resolvedEncounterId = encounterId || response.context?.encounterId;
    const resolvedNoteId = noteId || response.context?.noteId;
    const resolvedRecordingId = recordingId || response.context?.recordingId;
    if (!resolvedPatientId) {
      showError('This AI response is not linked to a patient chart.');
      return;
    }

    setApplyingResponseIndex(messageIndex);
    try {
      const result = await applyClinicalCopilotResponse(session.tenantId, session.accessToken, {
        patientId: resolvedPatientId,
        encounterId: resolvedEncounterId,
        noteId: resolvedNoteId,
        recordingId: resolvedRecordingId,
        response,
      });

      const message = result.message || 'AI assistant response added to the chart';
      setAppliedResponses((prev) => ({
        ...prev,
        [messageIndex]: { summaryId: result.summaryId, message },
      }));
      setSavedSummaryId(result.summaryId);
      setSavedSummaryMessage(message);
      onVisitSummarySaved?.(result.summaryId);
      showSuccess(message, patientHistoryPath ? {
        duration: 8000,
        action: {
          label: 'View History',
          onClick: () => navigate(patientHistoryPath),
        },
      } : undefined);
    } catch (error: any) {
      if (isPhiBlockedError(error)) {
        showPhiWarning(error);
        return;
      }
      showError(error.message || 'Failed to apply AI assistant response');
    } finally {
      setApplyingResponseIndex(null);
    }
  };

  return (
    <>
      {phiWarning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clinical-copilot-phi-warning-title"
          aria-describedby="clinical-copilot-phi-warning-description"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(127, 29, 29, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              width: 'min(920px, 100%)',
              maxHeight: 'min(92vh, 860px)',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: 18,
              border: '5px solid #dc2626',
              boxShadow: '0 30px 90px rgba(15, 23, 42, 0.42)',
              padding: compact ? '1.35rem' : '1.7rem',
            }}
          >
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  background: '#dc2626',
                  color: '#ffffff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '2rem',
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                !
              </div>
              <div>
                <div
                  style={{
                    color: '#991b1b',
                    fontSize: '0.82rem',
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  AI Request Stopped
                </div>
                <h2
                  id="clinical-copilot-phi-warning-title"
                  style={{
                    margin: 0,
                    color: '#7f1d1d',
                    fontSize: compact ? '1.7rem' : '2.15rem',
                    lineHeight: 1.05,
                    fontWeight: 900,
                  }}
                >
                  Possible HIPAA Violation Blocked
                </h2>
              </div>
            </div>

            <div
              id="clinical-copilot-phi-warning-description"
              style={{
                marginTop: 18,
                padding: '1rem 1.1rem',
                borderRadius: 14,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#7f1d1d',
                fontSize: '1rem',
                lineHeight: 1.55,
                fontWeight: 700,
              }}
            >
              {phiWarning.message} Your message was not sent to the AI model. Close this warning, remove the identifying information, and submit again.
            </div>

            {phiWarning.blockedTypes.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {phiWarning.blockedTypes.map((type) => (
                  <span
                    key={type}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: 999,
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fca5a5',
                      padding: '0.38rem 0.7rem',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                    }}
                  >
                    Detected: {getBlockedTypeLabel(type)}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 14, marginTop: 18 }}>
              <div style={{ border: '1px solid #fecaca', borderRadius: 14, padding: '1rem', background: '#fff7f7' }}>
                <div style={{ color: '#991b1b', fontWeight: 900, marginBottom: 8 }}>Do not type</div>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#334155', lineHeight: 1.55 }}>
                  <li>Patient names, initials, DOBs, MRNs, phone numbers, emails, addresses, insurance IDs, or account numbers.</li>
                  <li>Photos, employer details, family details, tattoos, scars, or other unique features that could identify a person.</li>
                  <li>Rare combinations of facts that point to one specific patient.</li>
                </ul>
              </div>
              <div style={{ border: '1px solid #bbf7d0', borderRadius: 14, padding: '1rem', background: '#f0fdf4' }}>
                <div style={{ color: '#166534', fontWeight: 900, marginBottom: 8 }}>Use instead</div>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#334155', lineHeight: 1.55 }}>
                  <li>Say "the patient," "this encounter," or "adult patient" instead of a name.</li>
                  <li>Ask clinical or billing questions without identifiers, such as "What CPT code fits this rash visit?"</li>
                  <li>Use the linked chart context instead of typing private details into the chat box.</li>
                </ul>
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPhiWarning(null)}
                autoFocus
                style={{
                  border: 'none',
                  borderRadius: 12,
                  background: '#dc2626',
                  color: '#ffffff',
                  padding: '0.85rem 1.15rem',
                  fontWeight: 900,
                  fontSize: '0.98rem',
                  cursor: 'pointer',
                }}
              >
                I Understand - Edit Message
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div
          style={{
            marginTop: 10,
            padding: '0.65rem 0.8rem',
            borderRadius: 12,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            fontSize: '0.8rem',
            lineHeight: 1.45,
            fontWeight: 700,
          }}
        >
          Privacy guard active: do not type names, DOBs, phone numbers, addresses, insurance IDs, MRNs, or distinctive identifying features. If blocked, remove the identifier and submit again.
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
            const applyStatus = appliedResponses[index];
            const canApplyResponse = Boolean(response && canApplyCopilotResponse && (patientId || response.context?.patientId));
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

                {response && canApplyResponse && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid #e5eefb',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: '0.82rem', color: applyStatus ? '#166534' : '#64748b', fontWeight: 700 }}>
                      {applyStatus ? applyStatus.message : 'Add this summary and these suggested codes to the chart workflow.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleApplyResponse(response, index)}
                      disabled={applyingResponseIndex !== null || Boolean(applyStatus)}
                      style={{
                        ...promptButtonStyle,
                        background: applyStatus ? '#dcfce7' : applyingResponseIndex === index ? '#cbd5e1' : '#0f766e',
                        borderColor: applyStatus ? '#86efac' : applyingResponseIndex === index ? '#cbd5e1' : '#0f766e',
                        color: applyStatus ? '#166534' : 'white',
                        cursor: applyingResponseIndex !== null || applyStatus ? 'not-allowed' : 'pointer',
                      }}
                      title="Save this AI response to patient history, append it to the encounter, and send code suggestions to billing review"
                    >
                      {applyStatus ? 'Submitted to Chart' : applyingResponseIndex === index ? 'Submitting...' : 'Submit to Chart & Billing'}
                    </button>
                  </div>
                )}
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
    </>
  );
}
