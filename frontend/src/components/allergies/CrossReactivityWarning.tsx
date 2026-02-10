/**
 * CrossReactivityWarning Component
 *
 * Displays cross-reactivity warnings between drug classes.
 * Shows related drugs that may cause reactions.
 */

import { AlertTriangle, ArrowRight, Info, ExternalLink } from 'lucide-react';
import { AllergyBadge, type AlertSeverity } from './AllergyBadge';

interface CrossReactivityInfo {
  primaryAllergen: string;
  primaryDrugClass?: string;
  crossReactiveAllergens: string[];
  crossReactivityType: string;
  crossReactivityRate?: number;
  clinicalSignificance?: 'high' | 'moderate' | 'low' | 'theoretical';
  recommendations?: string;
  evidenceLevel?: string;
}

interface CrossReactivityWarningProps {
  allergy: {
    allergenName: string;
    severity: string;
  };
  drugBeingPrescribed: string;
  crossReactivityInfo: CrossReactivityInfo;
  onDismiss?: () => void;
  onSelectAlternative?: () => void;
  compact?: boolean;
}

const significanceColors: Record<string, { bg: string; border: string; text: string }> = {
  high: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b' },
  moderate: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
  low: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  theoretical: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
};

export function CrossReactivityWarning({
  allergy,
  drugBeingPrescribed,
  crossReactivityInfo,
  onDismiss,
  onSelectAlternative,
  compact = false,
}: CrossReactivityWarningProps) {
  const significance = crossReactivityInfo.clinicalSignificance || 'moderate';
  const colors = significanceColors[significance] || significanceColors.moderate;

  const alertSeverity: AlertSeverity =
    significance === 'high' ? 'critical' : significance === 'moderate' ? 'warning' : 'info';

  return (
    <div
      style={{
        padding: compact ? '12px' : '16px',
        backgroundColor: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: '8px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: compact ? '10px' : '14px',
        }}
      >
        <AlertTriangle size={compact ? 20 : 24} style={{ color: colors.border, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <h3
            style={{
              margin: 0,
              fontSize: compact ? '14px' : '16px',
              fontWeight: 700,
              color: colors.text,
            }}
          >
            Cross-Reactivity Warning
          </h3>
          <AllergyBadge severity={alertSeverity} size="sm" />
        </div>
      </div>

      {/* Drug relationship */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: compact ? '10px' : '12px',
          backgroundColor: 'white',
          borderRadius: '6px',
          marginBottom: compact ? '10px' : '14px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '11px', color: '#991b1b', marginBottom: '2px' }}>
            Documented Allergy
          </div>
          <div style={{ fontWeight: 600, color: '#111827' }}>{allergy.allergenName}</div>
        </div>

        <ArrowRight size={20} style={{ color: '#6b7280' }} />

        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: '6px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '2px' }}>
            Being Prescribed
          </div>
          <div style={{ fontWeight: 600, color: '#111827' }}>{drugBeingPrescribed}</div>
        </div>
      </div>

      {/* Cross-reactivity details */}
      <div style={{ marginBottom: compact ? '10px' : '14px' }}>
        {/* Rate */}
        {crossReactivityInfo.crossReactivityRate !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              padding: '8px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              borderRadius: '6px',
            }}
          >
            <Info size={16} style={{ color: colors.border }} />
            <span style={{ fontSize: '14px' }}>
              <strong>Cross-reactivity rate:</strong> Approximately{' '}
              <span style={{ fontWeight: 700, color: colors.text }}>
                {crossReactivityInfo.crossReactivityRate}%
              </span>{' '}
              of patients allergic to{' '}
              <span style={{ fontWeight: 600 }}>{allergy.allergenName}</span> may also react to{' '}
              <span style={{ fontWeight: 600 }}>{drugBeingPrescribed}</span>
            </span>
          </div>
        )}

        {/* Drug class info */}
        {crossReactivityInfo.primaryDrugClass && (
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
            <strong>Drug Class:</strong> {crossReactivityInfo.primaryDrugClass.replace('_', ' ')}
          </div>
        )}

        {/* Cross-reactivity type */}
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
          <strong>Reactivity Type:</strong>{' '}
          {crossReactivityInfo.crossReactivityType.replace('_', ' ')}
        </div>

        {/* Evidence level */}
        {crossReactivityInfo.evidenceLevel && (
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            <strong>Evidence Level:</strong> {crossReactivityInfo.evidenceLevel}
          </div>
        )}
      </div>

      {/* Related drugs */}
      {crossReactivityInfo.crossReactiveAllergens.length > 0 && !compact && (
        <div style={{ marginBottom: '14px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: colors.text,
              marginBottom: '8px',
            }}
          >
            Other drugs in this class that may cross-react:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {crossReactivityInfo.crossReactiveAllergens.slice(0, 8).map((drug, index) => (
              <span
                key={index}
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#374151',
                }}
              >
                {drug}
              </span>
            ))}
            {crossReactivityInfo.crossReactiveAllergens.length > 8 && (
              <span style={{ fontSize: '12px', color: '#6b7280', padding: '4px' }}>
                +{crossReactivityInfo.crossReactiveAllergens.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {crossReactivityInfo.recommendations && (
        <div
          style={{
            padding: '12px',
            backgroundColor: 'white',
            border: `1px solid ${colors.border}`,
            borderLeft: `4px solid ${colors.border}`,
            borderRadius: '6px',
            marginBottom: compact ? '10px' : '14px',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: colors.text,
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ExternalLink size={14} />
            Clinical Recommendation
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>
            {crossReactivityInfo.recommendations}
          </p>
        </div>
      )}

      {/* Actions */}
      {(onDismiss || onSelectAlternative) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {onSelectAlternative && (
            <button
              onClick={onSelectAlternative}
              style={{
                padding: '8px 16px',
                backgroundColor: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Select Alternative
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Acknowledge
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Simple inline warning for prescription lists
export function CrossReactivityBadge({
  allergenName,
  significance = 'moderate',
}: {
  allergenName: string;
  significance?: 'high' | 'moderate' | 'low' | 'theoretical';
}) {
  const colors = significanceColors[significance] || significanceColors.moderate;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 500,
      }}
    >
      <AlertTriangle size={12} />
      Cross-reactive with {allergenName}
    </span>
  );
}
