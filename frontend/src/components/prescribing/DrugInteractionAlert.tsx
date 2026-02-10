/**
 * Drug Interaction Alert Modal
 *
 * Displays drug interactions, allergy warnings, and other safety alerts
 * with severity indicators and clinical management recommendations.
 * Requires provider acknowledgment before proceeding with prescribing.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Shield,
  Pill,
  FileWarning,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export type AlertSeverity = 'contraindicated' | 'major' | 'moderate' | 'minor' | 'info';

export interface DrugInteraction {
  id?: string;
  severity: AlertSeverity;
  description: string;
  medication1: string;
  medication2: string;
  clinicalEffects?: string;
  management?: string;
  mechanism?: string;
  source?: string;
}

export interface AllergyWarning {
  allergen: string;
  severity: string;
  reaction: string;
  allergyClass?: string;
  crossReactivityNotes?: string;
  crossReactivityRate?: number;
  alternatives?: string[];
}

export interface DuplicateTherapyAlert {
  existingDrug: string;
  newDrug: string;
  therapeuticClass: string;
  recommendation: string;
}

export interface DrugWarning {
  type: 'black_box' | 'precaution' | 'contraindication';
  title: string;
  description: string;
  source?: string;
}

export interface SafetyCheckResult {
  interactions: DrugInteraction[];
  allergies: AllergyWarning[];
  duplicateTherapy: DuplicateTherapyAlert[];
  warnings: DrugWarning[];
  hasCriticalAlerts: boolean;
  hasContraindicated: boolean;
  summary: {
    totalAlerts: number;
    contraindicatedCount: number;
    majorCount: number;
    moderateCount: number;
    minorCount: number;
  };
}

interface DrugInteractionAlertProps {
  isOpen: boolean;
  onClose: () => void;
  onAcknowledge: (override: boolean, overrideReason?: string) => void;
  drugName: string;
  safetyCheck: SafetyCheckResult;
  isLoading?: boolean;
}

// =============================================================================
// Severity Configuration
// =============================================================================

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    icon: typeof AlertCircle;
    bgColor: string;
    borderColor: string;
    textColor: string;
    badgeColor: string;
    label: string;
    indicator: string;
  }
> = {
  contraindicated: {
    icon: AlertOctagon,
    bgColor: '#fef2f2',
    borderColor: '#dc2626',
    textColor: '#991b1b',
    badgeColor: '#dc2626',
    label: 'CONTRAINDICATED',
    indicator: 'bg-red-500',
  },
  major: {
    icon: AlertCircle,
    bgColor: '#fff7ed',
    borderColor: '#ea580c',
    textColor: '#9a3412',
    badgeColor: '#ea580c',
    label: 'MAJOR',
    indicator: 'bg-orange-500',
  },
  moderate: {
    icon: AlertTriangle,
    bgColor: '#fefce8',
    borderColor: '#ca8a04',
    textColor: '#854d0e',
    badgeColor: '#ca8a04',
    label: 'MODERATE',
    indicator: 'bg-yellow-500',
  },
  minor: {
    icon: Info,
    bgColor: '#eff6ff',
    borderColor: '#3b82f6',
    textColor: '#1e40af',
    badgeColor: '#3b82f6',
    label: 'MINOR',
    indicator: 'bg-blue-500',
  },
  info: {
    icon: Info,
    bgColor: '#f9fafb',
    borderColor: '#6b7280',
    textColor: '#374151',
    badgeColor: '#6b7280',
    label: 'INFO',
    indicator: 'bg-gray-500',
  },
};

// =============================================================================
// Component
// =============================================================================

export function DrugInteractionAlert({
  isOpen,
  onClose,
  onAcknowledge,
  drugName,
  safetyCheck,
  isLoading = false,
}: DrugInteractionAlertProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['interactions', 'allergies'])
  );
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  if (!isOpen) return null;

  const {
    interactions,
    allergies,
    duplicateTherapy,
    warnings,
    hasCriticalAlerts,
    hasContraindicated,
    summary,
  } = safetyCheck;

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleAcknowledge = () => {
    if (hasContraindicated || hasCriticalAlerts) {
      setShowOverrideForm(true);
    } else {
      onAcknowledge(false);
    }
  };

  const handleOverride = () => {
    if (!overrideReason.trim()) {
      return;
    }
    onAcknowledge(true, overrideReason);
  };

  const getSeverityIndicator = (severity: AlertSeverity) => {
    const config = SEVERITY_CONFIG[severity];
    switch (severity) {
      case 'contraindicated':
        return <span className="text-lg" title="Contraindicated">&#128308;</span>; // Red circle
      case 'major':
        return <span className="text-lg" title="Major">&#128992;</span>; // Orange circle
      case 'moderate':
        return <span className="text-lg" title="Moderate">&#128993;</span>; // Yellow circle
      case 'minor':
        return <span className="text-lg" title="Minor">&#128994;</span>; // Green circle
      default:
        return <span className="text-lg" title="Info">&#128309;</span>; // Blue circle
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `3px solid ${hasContraindicated ? '#dc2626' : hasCriticalAlerts ? '#ea580c' : '#ca8a04'}`,
            backgroundColor: hasContraindicated ? '#fef2f2' : hasCriticalAlerts ? '#fff7ed' : '#fefce8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield
              size={28}
              style={{
                color: hasContraindicated ? '#dc2626' : hasCriticalAlerts ? '#ea580c' : '#ca8a04',
              }}
            />
            <div>
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: hasContraindicated ? '#991b1b' : hasCriticalAlerts ? '#9a3412' : '#854d0e',
                  margin: 0,
                }}
              >
                {hasContraindicated
                  ? 'Critical Drug Safety Alert'
                  : hasCriticalAlerts
                    ? 'Drug Safety Warnings'
                    : 'Drug Interaction Check'}
              </h2>
              <p
                style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  margin: '4px 0 0',
                }}
              >
                Prescribing: <strong>{drugName}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '8px',
            }}
          >
            <X size={20} style={{ color: '#6b7280' }} />
          </button>
        </div>

        {/* Summary Bar */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          {summary.contraindicatedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {getSeverityIndicator('contraindicated')}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#991b1b' }}>
                {summary.contraindicatedCount} Contraindicated
              </span>
            </div>
          )}
          {summary.majorCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {getSeverityIndicator('major')}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#9a3412' }}>
                {summary.majorCount} Major
              </span>
            </div>
          )}
          {summary.moderateCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {getSeverityIndicator('moderate')}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#854d0e' }}>
                {summary.moderateCount} Moderate
              </span>
            </div>
          )}
          {summary.minorCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {getSeverityIndicator('minor')}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af' }}>
                {summary.minorCount} Minor
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
          }}
        >
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid #e5e7eb',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 16px',
                }}
              />
              <p style={{ color: '#6b7280' }}>Checking drug interactions...</p>
            </div>
          ) : (
            <>
              {/* Allergy Warnings Section */}
              {allergies.length > 0 && (
                <AlertSection
                  title="Allergy Warnings"
                  icon={AlertOctagon}
                  iconColor="#dc2626"
                  count={allergies.length}
                  expanded={expandedSections.has('allergies')}
                  onToggle={() => toggleSection('allergies')}
                  severity="contraindicated"
                >
                  {allergies.map((allergy, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        marginBottom: index < allergies.length - 1 ? '12px' : 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <AlertOctagon size={20} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '4px' }}>
                            Patient is allergic to: {allergy.allergen}
                          </div>
                          <div style={{ fontSize: '14px', color: '#7f1d1d' }}>
                            <strong>Reaction:</strong> {allergy.reaction}
                          </div>
                          {allergy.allergyClass && (
                            <div style={{ fontSize: '14px', color: '#7f1d1d', marginTop: '4px' }}>
                              <strong>Class:</strong> {allergy.allergyClass}
                              {allergy.crossReactivityRate && (
                                <span> ({allergy.crossReactivityRate}% cross-reactivity)</span>
                              )}
                            </div>
                          )}
                          {allergy.crossReactivityNotes && (
                            <div
                              style={{
                                marginTop: '8px',
                                padding: '8px 12px',
                                backgroundColor: 'white',
                                borderLeft: '3px solid #dc2626',
                                fontSize: '13px',
                                color: '#374151',
                              }}
                            >
                              {allergy.crossReactivityNotes}
                            </div>
                          )}
                          {allergy.alternatives && allergy.alternatives.length > 0 && (
                            <div style={{ marginTop: '8px', fontSize: '13px' }}>
                              <strong style={{ color: '#059669' }}>Alternatives:</strong>{' '}
                              {allergy.alternatives.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </AlertSection>
              )}

              {/* Drug Interactions Section */}
              {interactions.length > 0 && (
                <AlertSection
                  title="Drug Interactions"
                  icon={Pill}
                  iconColor="#ea580c"
                  count={interactions.length}
                  expanded={expandedSections.has('interactions')}
                  onToggle={() => toggleSection('interactions')}
                  severity="major"
                >
                  {interactions.map((interaction, index) => {
                    const config = SEVERITY_CONFIG[interaction.severity];
                    const Icon = config.icon;

                    return (
                      <div
                        key={interaction.id || index}
                        style={{
                          padding: '16px',
                          backgroundColor: config.bgColor,
                          border: `1px solid ${config.borderColor}`,
                          borderRadius: '8px',
                          marginBottom: index < interactions.length - 1 ? '12px' : 0,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ flexShrink: 0, marginTop: '2px' }}>
                            {getSeverityIndicator(interaction.severity)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '6px',
                              }}
                            >
                              <span style={{ fontWeight: 600, color: '#111827' }}>
                                {interaction.medication1} + {interaction.medication2}
                              </span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  backgroundColor: config.badgeColor,
                                  color: 'white',
                                  borderRadius: '4px',
                                }}
                              >
                                {config.label}
                              </span>
                            </div>
                            <div style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>
                              {interaction.description}
                            </div>
                            {interaction.clinicalEffects && (
                              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
                                <strong>Clinical Effects:</strong> {interaction.clinicalEffects}
                              </div>
                            )}
                            {interaction.management && (
                              <div
                                style={{
                                  marginTop: '8px',
                                  padding: '8px 12px',
                                  backgroundColor: 'white',
                                  borderLeft: `3px solid ${config.borderColor}`,
                                  fontSize: '13px',
                                  color: config.textColor,
                                  fontWeight: 500,
                                }}
                              >
                                <strong>Management:</strong> {interaction.management}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </AlertSection>
              )}

              {/* Duplicate Therapy Section */}
              {duplicateTherapy.length > 0 && (
                <AlertSection
                  title="Duplicate Therapy"
                  icon={AlertTriangle}
                  iconColor="#ca8a04"
                  count={duplicateTherapy.length}
                  expanded={expandedSections.has('duplicate')}
                  onToggle={() => toggleSection('duplicate')}
                  severity="moderate"
                >
                  {duplicateTherapy.map((dup, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        backgroundColor: '#fefce8',
                        border: '1px solid #fde047',
                        borderRadius: '8px',
                        marginBottom: index < duplicateTherapy.length - 1 ? '12px' : 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        {getSeverityIndicator('moderate')}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: '#854d0e', marginBottom: '4px' }}>
                            {dup.therapeuticClass}
                          </div>
                          <div style={{ fontSize: '14px', color: '#713f12' }}>
                            Patient is already taking <strong>{dup.existingDrug}</strong>
                          </div>
                          <div
                            style={{
                              marginTop: '8px',
                              padding: '8px 12px',
                              backgroundColor: 'white',
                              borderLeft: '3px solid #ca8a04',
                              fontSize: '13px',
                              color: '#854d0e',
                            }}
                          >
                            {dup.recommendation}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </AlertSection>
              )}

              {/* Drug Warnings Section */}
              {warnings.length > 0 && (
                <AlertSection
                  title="Drug Warnings"
                  icon={FileWarning}
                  iconColor="#7c3aed"
                  count={warnings.length}
                  expanded={expandedSections.has('warnings')}
                  onToggle={() => toggleSection('warnings')}
                  severity="major"
                >
                  {warnings.map((warning, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        backgroundColor: warning.type === 'black_box' ? '#fef2f2' : '#f5f3ff',
                        border: `1px solid ${warning.type === 'black_box' ? '#fecaca' : '#c4b5fd'}`,
                        borderRadius: '8px',
                        marginBottom: index < warnings.length - 1 ? '12px' : 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <FileWarning
                          size={20}
                          style={{
                            color: warning.type === 'black_box' ? '#dc2626' : '#7c3aed',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '6px',
                            }}
                          >
                            <span style={{ fontWeight: 600, color: '#111827' }}>{warning.title}</span>
                            {warning.type === 'black_box' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  backgroundColor: '#000',
                                  color: 'white',
                                  borderRadius: '4px',
                                }}
                              >
                                BLACK BOX
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', color: '#374151' }}>
                            {warning.description}
                          </div>
                          {warning.source && (
                            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                              Source: {warning.source}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </AlertSection>
              )}

              {/* No Alerts */}
              {summary.totalAlerts === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '8px',
                    border: '1px solid #86efac',
                  }}
                >
                  <Check size={48} style={{ color: '#22c55e', margin: '0 auto 16px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#166534', margin: '0 0 8px' }}>
                    No Drug Interactions Found
                  </h3>
                  <p style={{ fontSize: '14px', color: '#15803d', margin: 0 }}>
                    No significant interactions or warnings detected for this medication.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
          }}
        >
          {showOverrideForm ? (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#374151',
                  marginBottom: '8px',
                }}
              >
                Override Reason (Required)
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Please document clinical justification for proceeding despite warnings..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  minHeight: '80px',
                  marginBottom: '12px',
                }}
              />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowOverrideForm(false);
                    setOverrideReason('');
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleOverride}
                  disabled={!overrideReason.trim()}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: overrideReason.trim() ? '#dc2626' : '#e5e7eb',
                    color: overrideReason.trim() ? 'white' : '#9ca3af',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: overrideReason.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Override and Continue
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 24px',
                  backgroundColor: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel Prescription
              </button>
              {summary.totalAlerts === 0 ? (
                <button
                  onClick={() => onAcknowledge(false)}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#22c55e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Check size={18} />
                  Continue with Prescription
                </button>
              ) : (
                <button
                  onClick={handleAcknowledge}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: hasContraindicated ? '#dc2626' : hasCriticalAlerts ? '#ea580c' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {hasContraindicated
                    ? 'Override Contraindication'
                    : hasCriticalAlerts
                      ? 'Acknowledge and Continue'
                      : 'Acknowledge Warnings'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// Alert Section Component
// =============================================================================

interface AlertSectionProps {
  title: string;
  icon: typeof AlertCircle;
  iconColor: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  severity: AlertSeverity;
  children: React.ReactNode;
}

function AlertSection({
  title,
  icon: Icon,
  iconColor,
  count,
  expanded,
  onToggle,
  children,
}: AlertSectionProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '12px 16px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: expanded ? '8px 8px 0 0' : '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon size={20} style={{ color: iconColor }} />
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#374151' }}>{title}</span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              padding: '2px 8px',
              backgroundColor: iconColor,
              color: 'white',
              borderRadius: '10px',
            }}
          >
            {count}
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={20} style={{ color: '#6b7280' }} />
        ) : (
          <ChevronDown size={20} style={{ color: '#6b7280' }} />
        )}
      </button>
      {expanded && (
        <div
          style={{
            padding: '16px',
            border: '1px solid #e5e7eb',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default DrugInteractionAlert;
