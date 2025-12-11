import type { FC } from 'react';

interface Prescription {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  prescribedDate: string;
  status: string;
}

interface PrescriptionHistoryProps {
  patientId: string;
  prescriptions?: Prescription[];
  loading?: boolean;
  onPrescriptionClick?: (prescription: Prescription) => void;
}

export const PrescriptionHistory: FC<PrescriptionHistoryProps> = ({
  patientId,
  prescriptions = [],
  loading = false,
  onPrescriptionClick,
}) => {
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading prescriptions...
      </div>
    );
  }

  if (prescriptions.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        No prescription history found for this patient.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {prescriptions.map((prescription) => (
        <div
          key={prescription.id}
          onClick={() => onPrescriptionClick?.(prescription)}
          style={{
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            cursor: onPrescriptionClick ? 'pointer' : 'default',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (onPrescriptionClick) {
              e.currentTarget.style.borderColor = '#6B46C1';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ fontWeight: 600, color: '#111827', marginBottom: '0.25rem' }}>
            {prescription.medicationName}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {prescription.dosage} - {prescription.frequency}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
            Prescribed: {new Date(prescription.prescribedDate).toLocaleDateString()} •{' '}
            <span
              style={{
                color: prescription.status === 'active' ? '#10b981' : '#6b7280',
                fontWeight: 500,
              }}
            >
              {prescription.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
