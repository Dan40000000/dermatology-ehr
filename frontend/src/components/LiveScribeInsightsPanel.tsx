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

export interface AmbientLiveInsightsPayload {
  recordingId: string;
  source: 'heuristic';
  updatedAt: string;
  symptoms: AmbientLiveSymptomInsight[];
  workingDiagnoses: AmbientLiveDiagnosisInsight[];
  suggestedTests: AmbientLiveSuggestedTestInsight[];
}

interface LiveScribeInsightsPanelProps {
  insights: AmbientLiveInsightsPayload | null;
  compact?: boolean;
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #dbeafe',
  borderRadius: 14,
  padding: '14px 16px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#64748b',
  marginBottom: 10,
};

const metaBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  borderRadius: 999,
  background: '#eef2ff',
  color: '#4338ca',
  fontSize: 11,
  fontWeight: 700,
};

function toPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function LiveScribeInsightsPanel({
  insights,
  compact = false,
}: LiveScribeInsightsPanelProps) {
  const wrapperStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  };

  const emptyText = 'Listening for enough clinical detail to suggest symptoms, differential, and tests.';

  return (
    <div style={wrapperStyle}>
      <section style={cardStyle}>
        <div style={sectionTitleStyle}>Live Symptoms</div>
        {insights?.symptoms?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.symptoms.map((symptom) => (
              <div key={symptom.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{symptom.label}</div>
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
          <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{emptyText}</div>
        )}
      </section>

      <section style={cardStyle}>
        <div style={sectionTitleStyle}>Working Differential</div>
        {insights?.workingDiagnoses?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {insights.workingDiagnoses.map((diagnosis) => (
              <div key={`${diagnosis.condition}-${diagnosis.icd10Code || 'none'}`} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
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
          <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            No working differential yet. More history usually improves this quickly.
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <div style={sectionTitleStyle}>Suggested Tests</div>
        {insights?.suggestedTests?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {insights.suggestedTests.map((test) => (
              <div key={`${test.testName}-${test.urgency}`} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{test.testName}</div>
                  <span style={metaBadgeStyle}>{test.urgency.toUpperCase()}</span>
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
          <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            No suggested tests yet. They will appear as the history points toward a clearer workup.
          </div>
        )}
      </section>
    </div>
  );
}
