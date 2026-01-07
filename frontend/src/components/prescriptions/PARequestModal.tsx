import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui';
import { createPARequest, fetchPatients } from '../../api';
import type { Order, Patient } from '../../types';

interface PARequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prescription?: Order;
}

const COMMON_PAYERS = [
  'UnitedHealthcare',
  'Anthem Blue Cross Blue Shield',
  'Aetna',
  'Cigna',
  'Humana',
  'Medicare',
  'Medicaid',
  'Kaiser Permanente',
  'Other',
];

export function PARequestModal({ isOpen, onClose, onSuccess, prescription }: PARequestModalProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [formData, setFormData] = useState({
    patientId: prescription?.patientId || '',
    prescriptionId: prescription?.id || '',
    medicationName: '',
    medicationStrength: '',
    medicationQuantity: 30,
    sig: '',
    payer: '',
    memberId: '',
    prescriberNpi: '',
    prescriberName: '',
  });

  useEffect(() => {
    if (isOpen && session) {
      loadPatients();
    }
  }, [isOpen, session]);

  useEffect(() => {
    if (prescription) {
      const details = prescription.details || '';
      const lines = details.split('\n');
      const medication = lines[0] || '';
      const sig = lines.find((l) => l.startsWith('Sig:'))?.replace('Sig: ', '') || '';

      setFormData((prev) => ({
        ...prev,
        patientId: prescription.patientId,
        prescriptionId: prescription.id,
        medicationName: medication.split(' ')[0] || '',
        medicationStrength: medication.replace(medication.split(' ')[0], '').trim(),
        sig,
      }));
    }
  }, [prescription]);

  useEffect(() => {
    if (formData.patientId && patients.length > 0) {
      const patient = patients.find((p) => p.id === formData.patientId);
      setSelectedPatient(patient || null);

      if (patient?.insurance) {
        setFormData((prev) => ({
          ...prev,
          payer: patient.insurance?.planName || '',
          memberId: patient.insurance?.memberId || '',
        }));
      }
    }
  }, [formData.patientId, patients]);

  const loadPatients = async () => {
    if (!session) return;

    try {
      const response = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(response.patients || []);
    } catch (error) {
      console.error('Failed to load patients:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session) return;

    if (!formData.patientId || !formData.payer || !formData.memberId) {
      showError('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      await createPARequest(session.tenantId, session.accessToken, {
        patientId: formData.patientId,
        prescriptionId: formData.prescriptionId || undefined,
        medicationName: formData.medicationName,
        medicationStrength: formData.medicationStrength,
        medicationQuantity: formData.medicationQuantity,
        sig: formData.sig,
        payer: formData.payer,
        memberId: formData.memberId,
        prescriberNpi: formData.prescriberNpi || undefined,
        prescriberName: formData.prescriberName || undefined,
      });

      showSuccess('Prior authorization request created successfully');
      onSuccess();
      onClose();
      resetForm();
    } catch (error: any) {
      showError(error.message || 'Failed to create PA request');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      patientId: '',
      prescriptionId: '',
      medicationName: '',
      medicationStrength: '',
      medicationQuantity: 30,
      sig: '',
      payer: '',
      memberId: '',
      prescriberNpi: '',
      prescriberName: '',
    });
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Request Prior Authorization" size="lg">
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="form-section">
          <h3 className="form-section-title">Patient & Insurance Information</h3>

          <div className="form-field">
            <label htmlFor="patientId">
              Patient <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              id="patientId"
              value={formData.patientId}
              onChange={(e) => setFormData((prev) => ({ ...prev, patientId: e.target.value }))}
              required
              disabled={!!prescription}
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName} - DOB: {p.dob || p.dateOfBirth || 'N/A'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="payer">
                Insurance Payer <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                id="payer"
                value={formData.payer}
                onChange={(e) => setFormData((prev) => ({ ...prev, payer: e.target.value }))}
                required
              >
                <option value="">Select payer...</option>
                {COMMON_PAYERS.map((payer) => (
                  <option key={payer} value={payer}>
                    {payer}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="memberId">
                Member ID <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="memberId"
                type="text"
                value={formData.memberId}
                onChange={(e) => setFormData((prev) => ({ ...prev, memberId: e.target.value }))}
                placeholder="Insurance member ID"
                required
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Medication Information</h3>

          <div className="form-field">
            <label htmlFor="medicationName">Medication Name</label>
            <input
              id="medicationName"
              type="text"
              value={formData.medicationName}
              onChange={(e) => setFormData((prev) => ({ ...prev, medicationName: e.target.value }))}
              placeholder="e.g., Dupixent, Humira, Tretinoin"
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="medicationStrength">Strength</label>
              <input
                id="medicationStrength"
                type="text"
                value={formData.medicationStrength}
                onChange={(e) => setFormData((prev) => ({ ...prev, medicationStrength: e.target.value }))}
                placeholder="e.g., 0.05% cream, 300mg"
              />
            </div>

            <div className="form-field">
              <label htmlFor="medicationQuantity">Quantity</label>
              <input
                id="medicationQuantity"
                type="number"
                value={formData.medicationQuantity}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, medicationQuantity: parseInt(e.target.value, 10) }))
                }
                min="1"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="sig">Sig (Directions)</label>
            <input
              id="sig"
              type="text"
              value={formData.sig}
              onChange={(e) => setFormData((prev) => ({ ...prev, sig: e.target.value }))}
              placeholder="e.g., Apply twice daily to affected areas"
            />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Prescriber Information (Optional)</h3>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="prescriberName">Prescriber Name</label>
              <input
                id="prescriberName"
                type="text"
                value={formData.prescriberName}
                onChange={(e) => setFormData((prev) => ({ ...prev, prescriberName: e.target.value }))}
                placeholder="Dr. Jane Smith"
              />
            </div>

            <div className="form-field">
              <label htmlFor="prescriberNpi">NPI Number</label>
              <input
                id="prescriberNpi"
                type="text"
                value={formData.prescriberNpi}
                onChange={(e) => setFormData((prev) => ({ ...prev, prescriberNpi: e.target.value }))}
                placeholder="10-digit NPI"
                maxLength={10}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Request Prior Authorization'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
