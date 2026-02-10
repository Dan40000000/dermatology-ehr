/**
 * Allergy Warning Component
 *
 * Displays allergy cross-reactivity warnings with detailed information
 * about the allergen, reaction, and alternative medications.
 */

import { AlertOctagon, AlertTriangle, Info, ChevronRight, X } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface AllergyData {
  allergen: string;
  severity: 'severe' | 'moderate' | 'mild';
  reaction: string;
  allergyClass?: string;
  crossReactivityNotes?: string;
  crossReactivityRate?: number;
  alternatives?: string[];
  dateRecorded?: string;
  verifiedBy?: string;
}

interface AllergyWarningProps {
  allergy: AllergyData;
  drugName: string;
  onDismiss?: () => void;
  onSelectAlternative?: (drug: string) => void;
  compact?: boolean;
}

// =============================================================================
// Severity Configuration
// =============================================================================

const SEVERITY_CONFIG = {
  severe: {
    icon: AlertOctagon,
    bgColor: '#fef2f2',
    borderColor: '#dc2626',
    textColor: '#991b1b',
    badgeColor: '#dc2626',
    label: 'SEVERE',
    message: 'Do NOT prescribe this medication.',
  },
  moderate: {
    icon: AlertTriangle,
    bgColor: '#fff7ed',
    borderColor: '#ea580c',
    textColor: '#9a3412',
    badgeColor: '#ea580c',
    label: 'MODERATE',
    message: 'Use extreme caution if prescribing.',
  },
  mild: {
    icon: Info,
    bgColor: '#fefce8',
    borderColor: '#ca8a04',
    textColor: '#854d0e',
    badgeColor: '#ca8a04',
    label: 'MILD',
    message: 'Monitor patient closely if prescribing.',
  },
};

// =============================================================================
// Component
// =============================================================================

export function AllergyWarning({
  allergy,
  drugName,
  onDismiss,
  onSelectAlternative,
  compact = false,
}: AllergyWarningProps) {
  const config = SEVERITY_CONFIG[allergy.severity];
  const Icon = config.icon;

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: config.bgColor,
          border: `1px solid ${config.borderColor}`,
          borderRadius: '6px',
        }}
      >
        <Icon size={16} style={{ color: config.borderColor, flexShrink: 0 }} />
        <span style={{ fontSize: '13px', color: config.textColor, fontWeight: 500 }}>
          Allergy: {allergy.allergen}
        </span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            backgroundColor: config.badgeColor,
            color: 'white',
            borderRadius: '4px',
          }}
        >
          {config.label}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              marginLeft: 'auto',
              padding: '2px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <X size={14} style={{ color: '#6b7280' }} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: config.bgColor,
        border: `2px solid ${config.borderColor}`,
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: config.borderColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon size={24} style={{ color: 'white' }} />
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white', margin: 0 }}>
              Allergy Warning
            </h3>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', margin: '2px 0 0' }}>
              {config.message}
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              padding: '6px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '6px',
            }}
          >
            <X size={18} style={{ color: 'white' }} />
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '20px' }}>
        {/* Allergen Info */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
            Documented Allergy
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
            {allergy.allergen}
          </div>
        </div>

        {/* Drug Being Prescribed */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
            Drug Being Prescribed
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>{drugName}</div>
        </div>

        {/* Reaction */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
            Documented Reaction
          </div>
          <div
            style={{
              padding: '12px',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '15px',
              color: '#374151',
            }}
          >
            {allergy.reaction}
          </div>
        </div>

        {/* Allergy Class & Cross-Reactivity */}
        {(allergy.allergyClass || allergy.crossReactivityNotes) && (
          <div style={{ marginBottom: '16px' }}>
            {allergy.allergyClass && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Drug Class:</span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    color: '#374151',
                  }}
                >
                  {allergy.allergyClass}
                </span>
                {allergy.crossReactivityRate !== undefined && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '4px 8px',
                      backgroundColor: config.bgColor,
                      border: `1px solid ${config.borderColor}`,
                      borderRadius: '6px',
                      color: config.textColor,
                    }}
                  >
                    {allergy.crossReactivityRate}% cross-reactivity
                  </span>
                )}
              </div>
            )}

            {allergy.crossReactivityNotes && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'white',
                  borderLeft: `4px solid ${config.borderColor}`,
                  fontSize: '14px',
                  color: '#374151',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: config.textColor }}>Cross-Reactivity Notes:</strong>{' '}
                {allergy.crossReactivityNotes}
              </div>
            )}
          </div>
        )}

        {/* Alternative Medications */}
        {allergy.alternatives && allergy.alternatives.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#059669',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ChevronRight size={16} />
              Suggested Alternatives
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {allergy.alternatives.map((alt, index) => (
                <button
                  key={index}
                  onClick={() => onSelectAlternative?.(alt)}
                  disabled={!onSelectAlternative}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#166534',
                    cursor: onSelectAlternative ? 'pointer' : 'default',
                    transition: 'all 0.15s',
                  }}
                >
                  {alt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {(allergy.dateRecorded || allergy.verifiedBy) && (
          <div
            style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '20px',
              fontSize: '12px',
              color: '#6b7280',
            }}
          >
            {allergy.dateRecorded && (
              <span>
                <strong>Recorded:</strong> {allergy.dateRecorded}
              </span>
            )}
            {allergy.verifiedBy && (
              <span>
                <strong>Verified by:</strong> {allergy.verifiedBy}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div
        style={{
          padding: '12px 20px',
          backgroundColor: 'rgba(0,0,0,0.03)',
          borderTop: '1px solid rgba(0,0,0,0.05)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 600,
            color: config.textColor,
          }}
        >
          <AlertOctagon size={16} />
          {allergy.severity === 'severe'
            ? 'Prescribing this medication is strongly discouraged.'
            : allergy.severity === 'moderate'
              ? 'Consider alternative medications if available.'
              : 'Monitor patient for allergic reactions.'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Allergy Warning Banner (for inline use)
// =============================================================================

interface AllergyWarningBannerProps {
  allergies: AllergyData[];
  drugName: string;
  onViewDetails?: () => void;
}

export function AllergyWarningBanner({
  allergies,
  drugName,
  onViewDetails,
}: AllergyWarningBannerProps) {
  if (allergies.length === 0) return null;

  const hasSevere = allergies.some(a => a.severity === 'severe');
  const hasModerate = allergies.some(a => a.severity === 'moderate');

  const bgColor = hasSevere ? '#fef2f2' : hasModerate ? '#fff7ed' : '#fefce8';
  const borderColor = hasSevere ? '#dc2626' : hasModerate ? '#ea580c' : '#ca8a04';
  const textColor = hasSevere ? '#991b1b' : hasModerate ? '#9a3412' : '#854d0e';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <AlertOctagon size={22} style={{ color: borderColor }} />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: textColor }}>
            {allergies.length === 1
              ? `Patient is allergic to ${allergies[0].allergen}`
              : `${allergies.length} allergy warnings detected`}
          </div>
          <div style={{ fontSize: '13px', color: textColor, opacity: 0.8 }}>
            Prescribing: {drugName}
          </div>
        </div>
      </div>

      {onViewDetails && (
        <button
          onClick={onViewDetails}
          style={{
            padding: '8px 16px',
            backgroundColor: borderColor,
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          View Details
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

export default AllergyWarning;
