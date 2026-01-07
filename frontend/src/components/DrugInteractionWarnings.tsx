/**
 * Drug Interaction Warnings Component
 *
 * Displays drug-drug interaction warnings and allergy alerts
 * with severity indicators and clinical management recommendations.
 */

import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react';

// Local type definitions (mirrored from api-erx.ts to avoid Vite ESM issues)
export interface DrugInteraction {
  severity: 'severe' | 'moderate' | 'mild';
  description: string;
  medication1: string;
  medication2: string;
  clinicalEffects?: string;
  management?: string;
}

export interface AllergyWarning {
  allergen: string;
  severity: string;
  reaction: string;
}

interface DrugInteractionWarningsProps {
  interactions: DrugInteraction[];
  allergies: AllergyWarning[];
  onDismiss?: () => void;
  showDismiss?: boolean;
}

export function DrugInteractionWarnings({
  interactions,
  allergies,
  onDismiss,
  showDismiss = false,
}: DrugInteractionWarningsProps) {
  const hasCritical =
    interactions.some(i => i.severity === 'severe') || allergies.length > 0;

  if (interactions.length === 0 && allergies.length === 0) {
    return null;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'severe':
        return { bg: '#fef2f2', border: '#dc2626', text: '#991b1b' };
      case 'moderate':
        return { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' };
      case 'mild':
        return { bg: '#eff6ff', border: '#3b82f6', text: '#1e3a8a' };
      default:
        return { bg: '#f9fafb', border: '#6b7280', text: '#374151' };
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'severe':
        return <AlertCircle size={20} style={{ color: '#dc2626' }} />;
      case 'moderate':
        return <AlertTriangle size={20} style={{ color: '#f59e0b' }} />;
      default:
        return <Info size={20} style={{ color: '#3b82f6' }} />;
    }
  };

  return (
    <div
      style={{
        border: `2px solid ${hasCritical ? '#dc2626' : '#f59e0b'}`,
        borderRadius: '8px',
        backgroundColor: hasCritical ? '#fef2f2' : '#fffbeb',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: allergies.length > 0 || interactions.length > 0 ? '12px' : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={24} style={{ color: hasCritical ? '#dc2626' : '#f59e0b' }} />
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: hasCritical ? '#991b1b' : '#92400e',
            }}
          >
            {hasCritical ? 'Critical Safety Alerts' : 'Safety Warnings'}
          </h3>
        </div>

        {showDismiss && onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <X size={18} style={{ color: '#6b7280' }} />
          </button>
        )}
      </div>

      {/* Allergy Warnings */}
      {allergies.length > 0 && (
        <div style={{ marginBottom: interactions.length > 0 ? '16px' : 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#dc2626',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertCircle size={16} />
            Documented Allergy Warning
          </div>

          {allergies.map((allergy, index) => (
            <div
              key={index}
              style={{
                padding: '12px',
                backgroundColor: 'white',
                border: '1px solid #dc2626',
                borderRadius: '6px',
                marginBottom: index < allergies.length - 1 ? '8px' : 0,
              }}
            >
              <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                Patient is allergic to: {allergy.allergen}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
                <strong>Reaction:</strong> {allergy.reaction}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                <strong>Severity:</strong>{' '}
                <span
                  style={{
                    padding: '2px 6px',
                    backgroundColor: '#fef2f2',
                    color: '#991b1b',
                    borderRadius: '4px',
                    fontWeight: 500,
                  }}
                >
                  {allergy.severity}
                </span>
              </div>
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px',
                  backgroundColor: '#fef2f2',
                  borderLeft: '3px solid #dc2626',
                  fontSize: '13px',
                  color: '#991b1b',
                  fontWeight: 500,
                }}
              >
                Do NOT prescribe this medication. Select an alternative.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drug Interactions */}
      {interactions.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertTriangle size={16} />
            Drug Interactions ({interactions.length})
          </div>

          {interactions.map((interaction, index) => {
            const colors = getSeverityColor(interaction.severity);

            return (
              <div
                key={index}
                style={{
                  padding: '12px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  marginBottom: index < interactions.length - 1 ? '8px' : 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  {getSeverityIcon(interaction.severity)}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#111827',
                        marginBottom: '4px',
                      }}
                    >
                      {interaction.medication1} + {interaction.medication2}
                    </div>
                    <span
                      style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        backgroundColor: colors.bg,
                        color: colors.text,
                        borderRadius: '4px',
                        fontWeight: 600,
                        border: `1px solid ${colors.border}`,
                      }}
                    >
                      {interaction.severity.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: '#374151', marginBottom: '8px' }}>
                  {interaction.description}
                </div>

                {interaction.clinicalEffects && (
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#6b7280',
                      marginBottom: '8px',
                      paddingLeft: '12px',
                    }}
                  >
                    <strong>Clinical Effects:</strong> {interaction.clinicalEffects}
                  </div>
                )}

                {interaction.management && (
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'white',
                      borderLeft: `3px solid ${colors.border}`,
                      fontSize: '13px',
                      color: colors.text,
                    }}
                  >
                    <strong>Management:</strong> {interaction.management}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Overall recommendation */}
      {hasCritical && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#fff1f2',
            border: '2px solid #dc2626',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#991b1b',
            fontWeight: 600,
          }}
        >
          Review clinical decision support alerts before prescribing. Consider alternative
          medications or consult with a specialist.
        </div>
      )}
    </div>
  );
}
