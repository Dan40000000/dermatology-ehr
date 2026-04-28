import React from 'react';

export interface AmbientLiveSymptomInsight {
  label: string;
  confidence: number;
  evidence?: string;
}

export interface AmbientLiveDiagnosisInsight {
  condition: string;
  confidence: number;
  reasoning: string;
  icd10Code?: string;
}

export interface AmbientLiveSuggestedTestInsight {
  testName: string;
  urgency: 'routine' | 'soon' | 'urgent';
  rationale: string;
  cptCode?: string;
}

export interface AmbientLiveVisitSummary {
  oneLiner: string;
  patientReported: string[];
  providerObserved: string[];
  planDraft: string[];
  documentationGaps: string[];
}

export interface AmbientLiveMedicationInsight {
  name: string;
  confidence: number;
  context: 'current' | 'recommended' | 'discussed';
  evidence?: string;
}

export interface AmbientLiveClinicalActionInsight {
  label: string;
  type: 'medication' | 'procedure' | 'lab' | 'follow_up' | 'education' | 'documentation';
  urgency: 'routine' | 'soon' | 'urgent';
  status: 'mentioned' | 'consider' | 'planned';
  rationale: string;
  evidence?: string;
}

export interface AmbientLiveSafetyFlagInsight {
  label: string;
  severity: 'watch' | 'soon' | 'urgent';
  rationale: string;
  evidence?: string;
}

export interface AmbientLiveInsightsPayload {
  recordingId: string;
  source: 'heuristic';
  updatedAt: string;
  visitSummary: AmbientLiveVisitSummary;
  symptoms: AmbientLiveSymptomInsight[];
  workingDiagnoses: AmbientLiveDiagnosisInsight[];
  suggestedTests: AmbientLiveSuggestedTestInsight[];
  medications: AmbientLiveMedicationInsight[];
  clinicalActions: AmbientLiveClinicalActionInsight[];
  safetyFlags: AmbientLiveSafetyFlagInsight[];
}

interface LiveScribeInsightsPanelProps {
  insights: AmbientLiveInsightsPayload | null;
  compact?: boolean;
}

const shellStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #f8fbff 0%, #eef8f4 100%)',
  border: '1px solid #c7ddf0',
  borderRadius: 18,
  padding: 14,
  boxShadow: '0 14px 40px rgba(14, 39, 75, 0.08)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  marginBottom: 12,
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.92)',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  borderRadius: 14,
  padding: '14px 16px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#526070',
  marginBottom: 10,
};

const metaBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  borderRadius: 999,
  background: '#e8f2ff',
  color: '#164e87',
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const reviewBadgeStyle: React.CSSProperties = {
  ...metaBadgeStyle,
  background: '#fff7ed',
  color: '#9a3412',
  border: '1px solid #fed7aa',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#8290a3',
  lineHeight: 1.5,
};

function toPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatUpdatedAt(value?: string): string {
  if (!value) return 'Listening';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Listening';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function urgencyColor(value: 'routine' | 'soon' | 'urgent' | 'watch'): React.CSSProperties {
  if (value === 'urgent') {
    return { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' };
  }
  if (value === 'soon') {
    return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
  }
  if (value === 'watch') {
    return { background: '#e0f2fe', color: '#075985', border: '1px solid #bae6fd' };
  }
  return { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
}

function ListBlock({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[] | undefined;
  empty: string;
}) {
  return (
    <section style={cardStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {items?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {items.map((item) => (
            <li key={item} style={{ fontSize: 13, color: '#223047', lineHeight: 1.45 }}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <div style={emptyStyle}>{empty}</div>
      )}
    </section>
  );
}

export function LiveScribeInsightsPanel({
  insights,
  compact = false,
}: LiveScribeInsightsPanelProps) {
  const summary = insights?.visitSummary;
  const topDiagnoses = insights?.workingDiagnoses || [];
  const symptoms = insights?.symptoms || [];
  const tests = insights?.suggestedTests || [];
  const medications = insights?.medications || [];
  const actions = insights?.clinicalActions || [];
  const safetyFlags = insights?.safetyFlags || [];

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 12,
  };

  return (
    <div style={shellStyle} aria-label="Live AI scribe clinical insights">
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f3f5f', letterSpacing: '0.02em' }}>
            Live Clinical Snapshot
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            Symptoms, working differential, tests, meds, and note gaps update while the visit is being recorded.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={reviewBadgeStyle}>Clinician review required</span>
          <span style={metaBadgeStyle}>{formatUpdatedAt(insights?.updatedAt)}</span>
        </div>
      </div>

      <section style={{ ...cardStyle, marginBottom: 12, borderColor: '#b8d9d2' }}>
        <div style={sectionTitleStyle}>Running One-Line Summary</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#102235', lineHeight: 1.45 }}>
          {summary?.oneLiner || 'Listening for enough clinical detail to build a live visit summary.'}
        </div>
      </section>

      {safetyFlags.length > 0 && (
        <section style={{ ...cardStyle, marginBottom: 12, borderColor: '#fecaca', background: '#fff7f7' }}>
          <div style={sectionTitleStyle}>Clinical Attention</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {safetyFlags.map((flag) => (
              <div key={flag.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#7f1d1d' }}>{flag.label}</div>
                  <span style={{ ...metaBadgeStyle, ...urgencyColor(flag.severity) }}>
                    {flag.severity.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.45 }}>{flag.rationale}</div>
                {flag.evidence && (
                  <div style={{ fontSize: 12, color: '#991b1b', fontStyle: 'italic' }}>{flag.evidence}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ ...gridStyle, marginBottom: 12 }}>
        <ListBlock
          title="Patient Reported"
          items={summary?.patientReported}
          empty="Patient symptom details will appear here as the conversation develops."
        />
        <ListBlock
          title="Exam / Provider Observed"
          items={summary?.providerObserved}
          empty="Objective skin findings have not been captured yet."
        />
        <ListBlock
          title="Draft Plan"
          items={summary?.planDraft}
          empty="Treatment, education, follow-up, and procedure plans will appear here."
        />
      </div>

      <div style={{ ...gridStyle, marginBottom: 12 }}>
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>Live Symptoms</div>
          {symptoms.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {symptoms.map((symptom) => (
                <div key={symptom.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{symptom.label}</div>
                    <span style={metaBadgeStyle}>{toPercent(symptom.confidence)}</span>
                  </div>
                  {symptom.evidence && (
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                      {symptom.evidence}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>Listening for symptom language.</div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={sectionTitleStyle}>Working Differential</div>
          {topDiagnoses.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topDiagnoses.map((diagnosis) => (
                <div key={`${diagnosis.condition}-${diagnosis.icd10Code || 'none'}`} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                      {diagnosis.condition}
                    </div>
                    <span style={metaBadgeStyle}>{toPercent(diagnosis.confidence)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>
                    {diagnosis.reasoning}
                  </div>
                  {diagnosis.icd10Code && (
                    <div style={{ fontSize: 11, color: '#64748b' }}>ICD-10: {diagnosis.icd10Code}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>No working differential yet. More history and exam detail will refine this.</div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={sectionTitleStyle}>Suggested Tests / Orders</div>
          {tests.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tests.map((test) => (
                <div key={`${test.testName}-${test.urgency}`} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{test.testName}</div>
                    <span style={{ ...metaBadgeStyle, ...urgencyColor(test.urgency) }}>{test.urgency.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>
                    {test.rationale}
                  </div>
                  {test.cptCode && (
                    <div style={{ fontSize: 11, color: '#64748b' }}>CPT: {test.cptCode}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>No suggested tests yet. They will appear only when the transcript supports them.</div>
          )}
        </section>
      </div>

      <div style={gridStyle}>
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>Meds Mentioned</div>
          {medications.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {medications.map((medication) => (
                <div key={medication.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{medication.name}</div>
                    <span style={metaBadgeStyle}>{medication.context}</span>
                  </div>
                  {medication.evidence && (
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>{medication.evidence}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>No medications captured yet.</div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={sectionTitleStyle}>Action Queue</div>
          {actions.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {actions.map((action) => (
                <div key={`${action.type}-${action.label}`} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{action.label}</div>
                    <span style={{ ...metaBadgeStyle, ...urgencyColor(action.urgency) }}>{action.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>{action.rationale}</div>
                  {action.evidence && (
                    <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{action.evidence}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>No action items captured yet.</div>
          )}
        </section>

        <ListBlock
          title="Documentation Gaps"
          items={summary?.documentationGaps}
          empty="Core documentation elements look covered so far."
        />
      </div>
    </div>
  );
}
