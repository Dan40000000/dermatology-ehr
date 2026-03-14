import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import type {
  Patient,
  Provider,
  Location,
  AppointmentType,
  Appointment,
  Availability,
} from '../../types';
import type { TimeBlock } from '../../api';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AppointmentFormData) => Promise<void>;
  appointment?: Appointment | null;
  patients: Patient[];
  providers: Provider[];
  locations: Location[];
  appointmentTypes: AppointmentType[];
  availability?: Availability[];
  appointments?: Appointment[];
  timeBlocks?: TimeBlock[];
  initialData?: {
    patientId?: string;
    providerId?: string;
    locationId?: string;
    date?: string;
    time?: string;
  };
}

const SLOT_INTERVAL_MINUTES = 5;
const DEFAULT_START_MINUTES = 8 * 60; // 08:00
const DEFAULT_END_MINUTES = 17 * 60; // 17:00

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseTimeToMinutes(value?: string): number | null {
  if (!value) return null;
  const [hourStr, minuteStr] = value.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function minutesToTimeValue(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function minutesToDisplay(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const meridiem = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${meridiem}`;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
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
  availability = [],
  appointments = [],
  timeBlocks = [],
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

  const availabilityWindows = useMemo(() => {
    if (!formData.providerId || !formData.date) return [];
    const selectedDate = new Date(`${formData.date}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return [];
    const dayOfWeek = selectedDate.getDay();
    const providerAvailabilities = availability.filter(
      (entry) => entry.providerId === formData.providerId && entry.dayOfWeek === dayOfWeek
    );

    if (availability.length === 0 || providerAvailabilities.length === 0) {
      // Fallback if no configured availability: weekdays only, 8am-5pm.
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return [{ start: DEFAULT_START_MINUTES, end: DEFAULT_END_MINUTES }];
      }
      return [];
    }

    return providerAvailabilities
      .map((entry) => {
        const start = parseTimeToMinutes(entry.startTime);
        const end = parseTimeToMinutes(entry.endTime);
        if (start === null || end === null || end <= start) return null;
        return { start, end };
      })
      .filter((window): window is { start: number; end: number } => Boolean(window));
  }, [availability, formData.providerId, formData.date]);

  const blockedRanges = useMemo(() => {
    if (!formData.providerId || !formData.date) return [];
    const selectedDate = formData.date;

    const appointmentRanges = appointments
      .filter((appt) => {
        if (appt.id === appointment?.id) return false;
        if (appt.providerId !== formData.providerId) return false;
        if (appt.status === 'cancelled' || appt.status === 'no_show') return false;
        const apptDate = toLocalDateKey(new Date(appt.scheduledStart));
        return apptDate === selectedDate;
      })
      .map((appt) => {
        const startDate = new Date(appt.scheduledStart);
        const endDate = new Date(appt.scheduledEnd);
        return {
          start: startDate.getHours() * 60 + startDate.getMinutes(),
          end: endDate.getHours() * 60 + endDate.getMinutes(),
        };
      })
      .filter((range) => range.end > range.start);

    const timeBlockRanges = timeBlocks
      .filter((block) => {
        if (block.providerId !== formData.providerId) return false;
        if (block.status && block.status !== 'active') return false;
        const blockDate = toLocalDateKey(new Date(block.startTime));
        return blockDate === selectedDate;
      })
      .map((block) => {
        const startDate = new Date(block.startTime);
        const endDate = new Date(block.endTime);
        return {
          start: startDate.getHours() * 60 + startDate.getMinutes(),
          end: endDate.getHours() * 60 + endDate.getMinutes(),
        };
      })
      .filter((range) => range.end > range.start);

    return [...appointmentRanges, ...timeBlockRanges];
  }, [appointments, appointment?.id, formData.providerId, formData.date, timeBlocks]);

  const availableTimeOptions = useMemo(() => {
    if (!formData.providerId || !formData.date || !formData.duration) return [];

    const selectedDate = new Date(`${formData.date}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return [];

    const now = new Date();
    const isToday = toLocalDateKey(now) === formData.date;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const options: Array<{ value: string; label: string }> = [];

    for (const window of availabilityWindows) {
      const latestStart = window.end - formData.duration;
      for (
        let slotStart = window.start;
        slotStart <= latestStart;
        slotStart += SLOT_INTERVAL_MINUTES
      ) {
        if (isToday && slotStart < nowMinutes) continue;
        const slotEnd = slotStart + formData.duration;
        const isBlocked = blockedRanges.some((range) =>
          rangesOverlap(slotStart, slotEnd, range.start, range.end)
        );
        if (isBlocked) continue;
        options.push({
          value: minutesToTimeValue(slotStart),
          label: minutesToDisplay(slotStart),
        });
      }
    }

    return options;
  }, [
    formData.providerId,
    formData.date,
    formData.duration,
    availabilityWindows,
    blockedRanges,
  ]);

  const hasResolvedTimeOptions =
    Boolean(formData.providerId)
    && Boolean(formData.date)
    && availableTimeOptions.length > 0;
  const timeSelectValue = hasResolvedTimeOptions ? formData.time : '';

  // Keep selected time in sync with currently available slots
  useEffect(() => {
    if (!isOpen) return;
    if (!formData.providerId || !formData.date) return;
    if (availableTimeOptions.length === 0) return;
    if (availableTimeOptions.some((option) => option.value === formData.time)) return;
    setFormData((prev) => ({ ...prev, time: availableTimeOptions[0].value }));
  }, [isOpen, formData.providerId, formData.date, formData.time, availableTimeOptions]);

  useEffect(() => {
    if (!isOpen) return;
    if (!formData.providerId || !formData.date) return;
    if (availableTimeOptions.length > 0) return;
    if (!formData.time) return;
    setFormData((prev) => ({ ...prev, time: '' }));
  }, [isOpen, formData.providerId, formData.date, formData.time, availableTimeOptions]);

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
              value={timeSelectValue}
              onChange={(e) => handleChange('time', e.target.value)}
              disabled={!formData.providerId || !formData.date || availableTimeOptions.length === 0}
              className={errors.time ? 'error' : ''}
            >
              {!formData.providerId || !formData.date ? (
                <option value="">Select provider and date first...</option>
              ) : availableTimeOptions.length === 0 ? (
                <option value="">No available times for this provider/date</option>
              ) : (
                availableTimeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              )}
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
