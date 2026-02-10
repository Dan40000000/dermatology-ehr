/**
 * AllergyAlertModal Component
 *
 * Modal popup for displaying allergy alerts during prescribing or procedures.
 * Requires acknowledgment before proceeding.
 */

import { useState } from 'react';
import { AlertTriangle, AlertCircle, X, Skull, ShieldAlert, CheckCircle } from 'lucide-react';
import { AllergyBadge, type AlertSeverity } from './AllergyBadge';

export type AlertType =
  | 'drug_allergy'
  | 'cross_reactivity'
  | 'latex'
  | 'adhesive'
  | 'contact'
  | 'food';
export type AlertAction = 'override' | 'cancelled' | 'changed' | 'acknowledged';

export interface AllergyAlert {
  id?: string;
  alertType: AlertType;
  alertSeverity: AlertSeverity;
  allergyId?: string;
  allergenName: string;
  triggerDrug?: string;
  triggerRxcui?: string;
  message: string;
  crossReactiveWith?: string;
  crossReactivityRate?: number;
  recommendations?: string;
  reactions?: string[];
}

interface AllergyAlertModalProps {
  isOpen: boolean;
  alerts: AllergyAlert[];
  triggerContext: 'prescribing' | 'procedure' | 'orders';
  patientName?: string;
  onAction: (action: AlertAction, reason?: string) => void;
  onClose: () => void;
  allowOverride?: boolean;
}

const alertTypeLabels: Record<AlertType, string> = {
  drug_allergy: 'Drug Allergy',
  cross_reactivity: 'Cross-Reactivity Warning',
  latex: 'Latex Allergy',
  adhesive: 'Adhesive Allergy',
  contact: 'Contact Allergy',
  food: 'Food Allergy',
};

export function AllergyAlertModal({
  isOpen,
  alerts,
  triggerContext,
  patientName,
  onAction,
  onClose,
  allowOverride = true,
}: AllergyAlertModalProps) {
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [selectedAction, setSelectedAction] = useState<AlertAction | null>(null);

  if (!isOpen || alerts.length === 0) return null;

  const hasCriticalAlert = alerts.some(
    (a) => a.alertSeverity === 'critical' || a.alertSeverity === 'contraindicated'
  );

  const hasContraindicatedAlert = alerts.some((a) => a.alertSeverity === 'contraindicated');

  const handleAction = (action: AlertAction) => {
    if (action === 'override' && !overrideReason.trim()) {
      setShowOverrideForm(true);
      setSelectedAction(action);
      return;
    }
    onAction(action, action === 'override' ? overrideReason : undefined);
    setShowOverrideForm(false);
    setOverrideReason('');
  };

  const submitOverride = () => {
    if (overrideReason.trim()) {
      onAction('override', overrideReason);
      setShowOverrideForm(false);
      setOverrideReason('');
    }
  };

  const getAlertIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'contraindicated':
        return <Skull size={24} style={{ color: '#ffffff' }} />;
      case 'critical':
        return <AlertCircle size={24} style={{ color: '#dc2626' }} />;
      case 'warning':
        return <AlertTriangle size={24} style={{ color: '#f59e0b' }} />;
      default:
        return <ShieldAlert size={24} style={{ color: '#3b82f6' }} />;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: hasCriticalAlert ? '#dc2626' : '#f59e0b',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {hasCriticalAlert ? <Skull size={28} /> : <AlertTriangle size={28} />}
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                {hasContraindicatedAlert
                  ? 'ALLERGY CONTRAINDICATION'
                  : hasCriticalAlert
                  ? 'CRITICAL ALLERGY ALERT'
                  : 'ALLERGY WARNING'}
              </h2>
              {patientName && (
                <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.9 }}>
                  Patient: {patientName}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '20px',
            maxHeight: 'calc(90vh - 200px)',
            overflowY: 'auto',
          }}
        >
          {/* Alert Items */}
          {alerts.map((alert, index) => (
            <div
              key={index}
              style={{
                padding: '16px',
                marginBottom: index < alerts.length - 1 ? '12px' : 0,
                backgroundColor:
                  alert.alertSeverity === 'contraindicated'
                    ? '#450a0a'
                    : alert.alertSeverity === 'critical'
                    ? '#fef2f2'
                    : alert.alertSeverity === 'warning'
                    ? '#fffbeb'
                    : '#eff6ff',
                border: '1px solid',
                borderColor:
                  alert.alertSeverity === 'contraindicated' || alert.alertSeverity === 'critical'
                    ? '#dc2626'
                    : alert.alertSeverity === 'warning'
                    ? '#f59e0b'
                    : '#3b82f6',
                borderRadius: '8px',
                color: alert.alertSeverity === 'contraindicated' ? 'white' : 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {getAlertIcon(alert.alertSeverity)}
                <div style={{ flex: 1 }}>
                  {/* Alert type and severity */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '15px',
                        color: alert.alertSeverity === 'contraindicated' ? 'white' : '#111827',
                      }}
                    >
                      {alertTypeLabels[alert.alertType]}
                    </span>
                    <AllergyBadge severity={alert.alertSeverity} size="sm" />
                  </div>

                  {/* Allergen info */}
                  <div style={{ marginBottom: '8px' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: alert.alertSeverity === 'contraindicated' ? '#fecaca' : '#374151',
                      }}
                    >
                      Documented Allergy:
                    </span>{' '}
                    <span
                      style={{
                        color: alert.alertSeverity === 'contraindicated' ? 'white' : '#111827',
                      }}
                    >
                      {alert.allergenName}
                    </span>
                  </div>

                  {/* Trigger drug */}
                  {alert.triggerDrug && (
                    <div style={{ marginBottom: '8px' }}>
                      <span
                        style={{
                          fontWeight: 600,
                          color: alert.alertSeverity === 'contraindicated' ? '#fecaca' : '#374151',
                        }}
                      >
                        Triggered by:
                      </span>{' '}
                      <span
                        style={{
                          color: alert.alertSeverity === 'contraindicated' ? 'white' : '#111827',
                        }}
                      >
                        {alert.triggerDrug}
                      </span>
                    </div>
                  )}

                  {/* Message */}
                  <p
                    style={{
                      margin: '8px 0',
                      fontSize: '14px',
                      color: alert.alertSeverity === 'contraindicated' ? '#fef2f2' : '#374151',
                      lineHeight: 1.5,
                    }}
                  >
                    {alert.message}
                  </p>

                  {/* Cross-reactivity rate */}
                  {alert.crossReactivityRate && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor:
                          alert.alertSeverity === 'contraindicated'
                            ? 'rgba(255,255,255,0.1)'
                            : '#f3f4f6',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        fontSize: '13px',
                      }}
                    >
                      <strong>Cross-reactivity rate:</strong> ~{alert.crossReactivityRate}% of
                      patients with {alert.crossReactiveWith} allergy may react
                    </div>
                  )}

                  {/* Recommendations */}
                  {alert.recommendations && (
                    <div
                      style={{
                        padding: '10px 12px',
                        backgroundColor:
                          alert.alertSeverity === 'contraindicated'
                            ? 'rgba(255,255,255,0.15)'
                            : 'white',
                        border: '1px solid',
                        borderColor:
                          alert.alertSeverity === 'contraindicated' ? '#7f1d1d' : '#e5e7eb',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                    >
                      <strong
                        style={{
                          color:
                            alert.alertSeverity === 'contraindicated' ? '#fecaca' : '#16a34a',
                        }}
                      >
                        Recommendation:
                      </strong>
                      <p
                        style={{
                          margin: '4px 0 0',
                          color: alert.alertSeverity === 'contraindicated' ? 'white' : '#374151',
                        }}
                      >
                        {alert.recommendations}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Override Form */}
          {showOverrideForm && (
            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
              }}
            >
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 600,
                  color: '#991b1b',
                }}
              >
                Override Reason (Required):
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Please provide clinical justification for overriding this allergy alert..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  fontSize: '14px',
                  resize: 'vertical',
                }}
              />
              <div
                style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}
              >
                <button
                  onClick={() => setShowOverrideForm(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={submitOverride}
                  disabled={!overrideReason.trim()}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: overrideReason.trim() ? '#dc2626' : '#fca5a5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: overrideReason.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  Confirm Override
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!showOverrideForm && (
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: '#f9fafb',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            {/* Cancel/Change Medication */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleAction('cancelled')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CheckCircle size={18} />
                Cancel {triggerContext === 'prescribing' ? 'Prescription' : 'Order'}
              </button>
              <button
                onClick={() => handleAction('changed')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Select Alternative
              </button>
            </div>

            {/* Override (if allowed and not contraindicated) */}
            {allowOverride && !hasContraindicatedAlert && (
              <button
                onClick={() => handleAction('override')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: '#dc2626',
                  border: '2px solid #dc2626',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Override Alert
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
