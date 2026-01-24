import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import type { Patient, Provider, Location, AppointmentType, Appointment } from '../../types';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AppointmentFormData) => Promise<void>;
  appointment?: Appointment | null;
  patients: Patient[];
  providers: Provider[];
  locations: Location[];
  appointmentTypes: AppointmentType[];
  initialData?: {
    patientId?: string;
    providerId?: string;
    locationId?: string;
    date?: string;
    time?: string;
  };
}

export interface AppointmentFormData {
  patientId: string;
  providerId: string;
  appointmentTypeId: string;
  locationId: string;
  date: string;
  time: string;
  duration: number;
  notes: string;
}

export function AppointmentModal({
  isOpen,
  onClose,
  onSave,
  appointment,
  patients,
  providers,
  locations,
  appointmentTypes,
  initialData,
}: AppointmentModalProps) {
  const [formData, setFormData] = useState<AppointmentFormData>({
    patientId: '',
    providerId: '',
    appointmentTypeId: '',
    locationId: '',
    date: '',
    time: '09:00',
    duration: 30,
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (appointment) {
        // Edit mode
        const startDate = new Date(appointment.scheduledStart);
        const endDate = new Date(appointment.scheduledEnd);
        const duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

        setFormData({
          patientId: appointment.patientId,
          providerId: appointment.providerId,
          appointmentTypeId: appointment.appointmentTypeId,
          locationId: appointment.locationId,
          date: startDate.toISOString().split('T')[0],
          time: `${startDate.getHours().toString().padStart(2, '0')}:${startDate
            .getMinutes()
            .toString()
            .padStart(2, '0')}`,
          duration,
          notes: '',
        });
      } else if (initialData) {
        // Create mode with initial data
        setFormData((prev) => ({
          ...prev,
          patientId: initialData.patientId || prev.patientId,
          providerId: initialData.providerId || prev.providerId,
          date: initialData.date || prev.date,
          time: initialData.time || prev.time,
          locationId: initialData.locationId || locations[0]?.id || prev.locationId,
        }));
      } else {
        // Create mode from scratch
        setFormData({
          patientId: '',
          providerId: providers[0]?.id || '',
          appointmentTypeId: appointmentTypes[0]?.id || '',
          locationId: locations[0]?.id || '',
          date: new Date().toISOString().split('T')[0],
          time: '09:00',
          duration: 30,
          notes: '',
        });
      }
      setErrors({});
    }
  }, [isOpen, appointment, initialData, providers, locations, appointmentTypes]);

  // Update duration when appointment type changes
  useEffect(() => {
    if (formData.appointmentTypeId) {
      const selectedType = appointmentTypes.find((t) => t.id === formData.appointmentTypeId);
      if (selectedType) {
        setFormData((prev) => ({ ...prev, duration: selectedType.durationMinutes }));
      }
    }
  }, [formData.appointmentTypeId, appointmentTypes]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.patientId) newErrors.patientId = 'Patient is required';
    if (!formData.providerId) newErrors.providerId = 'Provider is required';
    if (!formData.appointmentTypeId) newErrors.appointmentTypeId = 'Appointment type is required';
    if (!formData.locationId) newErrors.locationId = 'Location is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.time) newErrors.time = 'Time is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Failed to save appointment:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof AppointmentFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Generate time options (5-minute intervals from 7am to 7pm)
  const timeOptions = [];
  for (let hour = 7; hour < 19; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const displayStr = `${hour % 12 || 12}:${minute.toString().padStart(2, '0')} ${
        hour < 12 ? 'AM' : 'PM'
      }`;
      timeOptions.push({ value: timeStr, label: displayStr });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={appointment ? 'Edit Appointment' : 'New Appointment'} size="lg">
      <div className="modal-form">
        {/* Patient Selection */}
        <div className="form-field">
          <label htmlFor="patient">
            Patient <span className="required">*</span>
          </label>
          <select
            id="patient"
            value={formData.patientId}
            onChange={(e) => handleChange('patientId', e.target.value)}
            disabled={!!appointment}
            className={errors.patientId ? 'error' : ''}
          >
            <option value="">Select patient...</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.lastName}, {p.firstName} - DOB: {p.dob || p.dateOfBirth || 'N/A'}
              </option>
            ))}
          </select>
          {errors.patientId && <span className="field-error">{errors.patientId}</span>}
        </div>

        <div className="form-row">
          {/* Provider Selection */}
          <div className="form-field">
            <label htmlFor="provider">
              Provider <span className="required">*</span>
            </label>
            <select
              id="provider"
              value={formData.providerId}
              onChange={(e) => handleChange('providerId', e.target.value)}
              className={errors.providerId ? 'error' : ''}
            >
              <option value="">Select provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} {p.specialty ? `- ${p.specialty}` : ''}
                </option>
              ))}
            </select>
            {errors.providerId && <span className="field-error">{errors.providerId}</span>}
          </div>

          {/* Appointment Type Selection */}
          <div className="form-field">
            <label htmlFor="appointmentType">
              Appointment Type <span className="required">*</span>
            </label>
            <select
              id="appointmentType"
              value={formData.appointmentTypeId}
              onChange={(e) => handleChange('appointmentTypeId', e.target.value)}
              className={errors.appointmentTypeId ? 'error' : ''}
            >
              <option value="">Select type...</option>
              {appointmentTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.durationMinutes} min)
                </option>
              ))}
            </select>
            {errors.appointmentTypeId && <span className="field-error">{errors.appointmentTypeId}</span>}
          </div>
        </div>

        <div className="form-row">
          {/* Date Selection */}
          <div className="form-field">
            <label htmlFor="date">
              Date <span className="required">*</span>
            </label>
            <input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className={errors.date ? 'error' : ''}
            />
            {errors.date && <span className="field-error">{errors.date}</span>}
          </div>

          {/* Time Selection */}
          <div className="form-field">
            <label htmlFor="time">
              Time <span className="required">*</span>
            </label>
            <select
              id="time"
              value={formData.time}
              onChange={(e) => handleChange('time', e.target.value)}
              className={errors.time ? 'error' : ''}
            >
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.time && <span className="field-error">{errors.time}</span>}
          </div>

          {/* Duration */}
          <div className="form-field">
            <label htmlFor="duration">Duration</label>
            <select
              id="duration"
              value={formData.duration}
              onChange={(e) => handleChange('duration', Number(e.target.value))}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
        </div>

        {/* Location Selection */}
        <div className="form-field">
          <label htmlFor="location">
            Location <span className="required">*</span>
          </label>
          <select
            id="location"
            value={formData.locationId}
            onChange={(e) => handleChange('locationId', e.target.value)}
            className={errors.locationId ? 'error' : ''}
          >
            <option value="">Select location...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} {l.address ? `- ${l.address}` : ''}
              </option>
            ))}
          </select>
          {errors.locationId && <span className="field-error">{errors.locationId}</span>}
        </div>

        {/* Notes */}
        <div className="form-field">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Additional notes or instructions..."
            rows={3}
          />
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : appointment ? 'Update Appointment' : 'Create Appointment'}
        </button>
      </div>
    </Modal>
  );
}
