import { useState } from 'react';
import type { FC } from 'react';
import { Modal } from '../ui';

interface PrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: string;
  onSave?: (data: any) => Promise<void>;
}

export const PrescriptionModal: FC<PrescriptionModalProps> = ({
  isOpen,
  onClose,
  patientId,
  onSave,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSave?.({});
      onClose();
    } catch (error) {
      console.error('Failed to save prescription:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Prescription" size="lg">
      <div style={{ padding: '1rem' }}>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Prescription functionality is under development.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '0.375rem',
              background: '#6B46C1',
              color: 'white',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
