import { useMemo } from 'react';
import type { Patient } from '../../types';

interface PatientBannerProps {
  patient: Patient;
  onViewDetails?: () => void;
  onStartEncounter?: () => void;
  compact?: boolean;
  className?: string;
}

export function PatientBanner({
  patient,
  onViewDetails,
  onStartEncounter,
  compact = false,
  className = '',
}: PatientBannerProps) {
  const age = useMemo(() => {
    if (!patient.dateOfBirth) return null;
    const dob = new Date(patient.dateOfBirth);
    const today = new Date();
    let years = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      years--;
    }
    return years;
  }, [patient.dateOfBirth]);

  const initials = useMemo(() => {
    const first = patient.firstName?.[0] || '';
    const last = patient.lastName?.[0] || '';
    return (first + last).toUpperCase();
  }, [patient.firstName, patient.lastName]);

  const fullName = `${patient.lastName}, ${patient.firstName}`;

  // Handle allergies - backend may return string instead of array
  const allergiesArray = useMemo(() => {
    if (Array.isArray(patient.allergies)) {
      return patient.allergies;
    }
    if (typeof patient.allergies === 'string' && patient.allergies.trim() !== '') {
      return patient.allergies.split(',').map(a => a.trim());
    }
    return [];
  }, [patient.allergies]);
  const hasAllergies = allergiesArray.length > 0;

  // Handle alerts - backend may return string instead of array, or undefined
  const alertsArray = useMemo(() => {
    if (Array.isArray(patient.alerts)) {
      return patient.alerts;
    }
    if (typeof patient.alerts === 'string' && patient.alerts.trim() !== '') {
      return patient.alerts.split(',').map(a => a.trim());
    }
    return [];
  }, [patient.alerts]);
  const hasAlerts = alertsArray.length > 0;

  if (compact) {
    return (
      <div className={`patient-banner compact ${className}`} data-testid="patient-banner">
        <div className="patient-avatar">{initials}</div>
        <div className="patient-info-compact">
          <span className="patient-name">{fullName}</span>
          <span className="patient-meta">
            {age && `${age}yo`} {patient.sex && `• ${patient.sex}`}
          </span>
        </div>
        {hasAllergies && (
          <span className="allergy-badge" title={allergiesArray.join(', ')}>
            Allergies
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`patient-banner ${className}`} data-testid="patient-banner">
      <div className="patient-banner-main">
        <div className="patient-avatar large">{initials}</div>

        <div className="patient-details">
          <h2 className="patient-name">{fullName}</h2>

          <div className="patient-meta-row">
            {patient.dateOfBirth && (
              <span className="meta-item">
                <span className="meta-label">DOB:</span>
                <span className="meta-value">
                  {new Date(patient.dateOfBirth).toLocaleDateString()} {age && `(${age}yo)`}
                </span>
              </span>
            )}
            {patient.sex && (
              <span className="meta-item">
                <span className="meta-label">Sex:</span>
                <span className="meta-value">{patient.sex}</span>
              </span>
            )}
            {patient.mrn && (
              <span className="meta-item">
                <span className="meta-label">MRN:</span>
                <span className="meta-value">{patient.mrn}</span>
              </span>
            )}
          </div>

          <div className="patient-contact-row">
            {patient.phone && <span className="contact-item">{patient.phone}</span>}
            {patient.email && <span className="contact-item">{patient.email}</span>}
          </div>
        </div>

        <div className="patient-actions">
          {onViewDetails && (
            <button type="button" className="btn-secondary" onClick={onViewDetails}>
              View Chart
            </button>
          )}
          {onStartEncounter && (
            <button type="button" className="btn-primary" onClick={onStartEncounter}>
              Start Encounter
            </button>
          )}
        </div>
      </div>

      {/* Alerts and Allergies Strip */}
      {(hasAllergies || hasAlerts) && (
        <div className="patient-alerts-strip">
          {hasAllergies && (
            <div className="alert-section allergy">
              <span className="alert-icon"></span>
              <span className="alert-label">Allergies:</span>
              <span className="alert-content">{allergiesArray.join(', ')}</span>
            </div>
          )}
          {hasAlerts && (
            <div className="alert-section warning">
              <span className="alert-icon"></span>
              <span className="alert-label">Alerts:</span>
              <span className="alert-content">{alertsArray.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Insurance/Coverage Info */}
      {patient.insurance && (
        <div className="patient-insurance-strip">
          <span className="insurance-label">Insurance:</span>
          <span className="insurance-value">
            {typeof patient.insurance === 'object' && patient.insurance.planName
              ? `${patient.insurance.planName} (${patient.insurance.memberId})`
              : typeof patient.insurance === 'string'
                ? patient.insurance
                : 'On file'}
          </span>
          {typeof patient.insurance === 'object' && patient.insurance.copay && (
            <span className="insurance-copay">Copay: ${patient.insurance.copay}</span>
          )}
        </div>
      )}
    </div>
  );
}
