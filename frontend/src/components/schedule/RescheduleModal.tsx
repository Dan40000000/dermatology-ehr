import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import type { Appointment, Provider, Availability } from '../../types';

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RescheduleFormData) => Promise<void>;
  appointment: Appointment | null;
  providers: Provider[];
  availability: Availability[];
  appointments: Appointment[];
}

export interface RescheduleFormData {
  providerId: string;
  date: string;
  time: string;
}

interface TimeSlot {
  time: string;
  label: string;
  available: boolean;
}

export function RescheduleModal({
  isOpen,
  onClose,
  onSave,
  appointment,
  providers,
  availability,
  appointments,
}: RescheduleModalProps) {
  const [formData, setFormData] = useState<RescheduleFormData>({
    providerId: '',
    date: '',
    time: '',
  });

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen && appointment) {
      const startDate = new Date(appointment.scheduledStart);
      setFormData({
        providerId: appointment.providerId,
        date: startDate.toISOString().split('T')[0],
        time: `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`,
      });
      setErrors({});
    }
  }, [isOpen, appointment]);

  // Get the appointment duration in minutes
  const appointmentDuration = useMemo(() => {
    if (!appointment) return 30;
    const start = new Date(appointment.scheduledStart);
    const end = new Date(appointment.scheduledEnd);
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }, [appointment]);

  // Get provider availability for a specific day of week
  const getProviderAvailabilityForDay = (providerId: string, dayOfWeek: number) => {
    return availability.filter(a => a.providerId === providerId && a.dayOfWeek === dayOfWeek);
  };

  // Check if a provider is available on a given date
  const isProviderAvailableOnDate = (providerId: string, date: Date): boolean => {
    const dayOfWeek = date.getDay();
    const providerAvail = getProviderAvailabilityForDay(providerId, dayOfWeek);
    return providerAvail.length > 0;
  };

  // Get next 30 days for date selection
  const availableDates = useMemo(() => {
    const dates: { date: string; label: string; dayOfWeek: number; available: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();
      const available = isProviderAvailableOnDate(formData.providerId, date);

      dates.push({
        date: dateStr,
        label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        dayOfWeek,
        available,
      });
    }

    return dates;
  }, [formData.providerId, availability]);

  // Get available time slots for selected provider and date
  const availableTimeSlots = useMemo((): TimeSlot[] => {
    if (!formData.providerId || !formData.date) return [];

    const selectedDate = new Date(formData.date + 'T00:00:00');
    const dayOfWeek = selectedDate.getDay();
    const providerAvail = getProviderAvailabilityForDay(formData.providerId, dayOfWeek);

    if (providerAvail.length === 0) return [];

    // Get all appointments for this provider on this date (excluding current appointment)
    const dayStart = new Date(formData.date + 'T00:00:00');
    const dayEnd = new Date(formData.date + 'T23:59:59');

    const existingAppointments = appointments.filter(a => {
      if (appointment && a.id === appointment.id) return false; // Exclude current appointment
      if (a.providerId !== formData.providerId) return false;
      if (a.status === 'cancelled') return false;
      const apptStart = new Date(a.scheduledStart);
      return apptStart >= dayStart && apptStart <= dayEnd;
    });

    const slotsMap = new Map<string, TimeSlot>();

    // Generate 15-minute slots within provider availability windows
    for (const avail of providerAvail) {
      const [startHour, startMin] = avail.startTime.split(':').map(Number);
      const [endHour, endMin] = avail.endTime.split(':').map(Number);

      let currentHour = startHour;
      let currentMin = startMin;

      while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
        const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;

        // Skip if we already have this time slot
        if (slotsMap.has(timeStr)) {
          currentMin += 15;
          if (currentMin >= 60) {
            currentMin = 0;
            currentHour += 1;
          }
          continue;
        }

        const displayLabel = `${currentHour % 12 || 12}:${currentMin.toString().padStart(2, '0')} ${currentHour < 12 ? 'AM' : 'PM'}`;

        // Check if this slot conflicts with existing appointments
        const slotStart = new Date(`${formData.date}T${timeStr}:00`);
        const slotEnd = new Date(slotStart.getTime() + appointmentDuration * 60000);

        const hasConflict = existingAppointments.some(a => {
          const apptStart = new Date(a.scheduledStart);
          const apptEnd = new Date(a.scheduledEnd);
          // Overlap if: slotStart < apptEnd AND slotEnd > apptStart
          return slotStart < apptEnd && slotEnd > apptStart;
        });

        // Check if slot ends after provider availability ends
        const availEndTime = new Date(`${formData.date}T${avail.endTime}:00`);
        const slotExceedsAvailability = slotEnd > availEndTime;

        slotsMap.set(timeStr, {
          time: timeStr,
          label: displayLabel,
          available: !hasConflict && !slotExceedsAvailability,
        });

        // Move to next 15-minute slot
        currentMin += 15;
        if (currentMin >= 60) {
          currentMin = 0;
          currentHour += 1;
        }
      }
    }

    // Convert Map to array and sort by time
    return Array.from(slotsMap.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [formData.providerId, formData.date, appointments, appointment, appointmentDuration, availability]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.providerId) newErrors.providerId = 'Provider is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.time) newErrors.time = 'Time is required';

    // Check if selected time is available
    const selectedSlot = availableTimeSlots.find(s => s.time === formData.time);
    if (selectedSlot && !selectedSlot.available) {
      newErrors.time = 'This time slot is not available';
    }

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
      console.error('Failed to reschedule appointment:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof RescheduleFormData, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      // Reset time when provider or date changes
      if (field === 'providerId' || field === 'date') {
        updated.time = '';
      }
      return updated;
    });
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  if (!appointment) return null;

  const selectedProvider = providers.find(p => p.id === formData.providerId);
  const providerChanged = formData.providerId !== appointment.providerId;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reschedule Appointment" size="lg">
      <div className="modal-form">
        {/* Current Appointment Info */}
        <div style={{
          background: '#f9fafb',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>Current Appointment</div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            <div style={{ marginBottom: '0.25rem' }}><strong>Patient:</strong> {appointment.patientName}</div>
            <div style={{ marginBottom: '0.25rem' }}><strong>Type:</strong> {appointment.appointmentTypeName}</div>
            <div style={{ marginBottom: '0.25rem' }}><strong>Provider:</strong> {appointment.providerName}</div>
            <div><strong>Current Time:</strong> {new Date(appointment.scheduledStart).toLocaleString()}</div>
          </div>
        </div>

        {/* Provider Selection */}
        <div className="form-field">
          <label htmlFor="provider" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Provider {providerChanged && <span style={{ color: '#059669', fontSize: '0.75rem' }}>(changed)</span>}
          </label>
          <select
            id="provider"
            value={formData.providerId}
            onChange={(e) => handleChange('providerId', e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem',
              border: errors.providerId ? '1px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
            }}
          >
            <option value="">Select provider...</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} {p.specialty ? `- ${p.specialty}` : ''} {p.id === appointment.providerId ? '(current)' : ''}
              </option>
            ))}
          </select>
          {errors.providerId && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{errors.providerId}</span>}
        </div>

        {/* Date Selection */}
        <div className="form-field" style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Select Date <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>(only showing days when {selectedProvider?.fullName || 'provider'} is available)</span>
          </label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '0.5rem',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '0.5rem',
            border: errors.date ? '1px solid #ef4444' : '1px solid #e5e7eb',
            borderRadius: '8px',
            background: '#fafafa',
          }}>
            {availableDates.map(({ date, label, available }) => (
              <button
                key={date}
                type="button"
                onClick={() => available && handleChange('date', date)}
                disabled={!available}
                style={{
                  padding: '0.5rem 0.25rem',
                  fontSize: '0.75rem',
                  border: formData.date === date ? '2px solid #0284c7' : '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: formData.date === date
                    ? 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)'
                    : available
                      ? '#ffffff'
                      : '#f3f4f6',
                  color: formData.date === date ? '#ffffff' : available ? '#374151' : '#9ca3af',
                  cursor: available ? 'pointer' : 'not-allowed',
                  fontWeight: formData.date === date ? 600 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {errors.date && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{errors.date}</span>}
        </div>

        {/* Time Slot Selection */}
        <div className="form-field" style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Select Time
            {formData.date && (
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {' '}({availableTimeSlots.filter(s => s.available).length} slots available)
              </span>
            )}
          </label>
          {!formData.date ? (
            <div style={{
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#6b7280',
              fontSize: '0.875rem',
            }}>
              Please select a date first
            </div>
          ) : availableTimeSlots.length === 0 ? (
            <div style={{
              padding: '1rem',
              background: '#fef2f2',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#991b1b',
              fontSize: '0.875rem',
            }}>
              No availability on this date. Provider may not be scheduled to work.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.5rem',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '0.5rem',
              border: errors.time ? '1px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '8px',
              background: '#fafafa',
            }}>
              {availableTimeSlots.map(({ time, label, available }) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => available && handleChange('time', time)}
                  disabled={!available}
                  style={{
                    padding: '0.5rem',
                    fontSize: '0.8125rem',
                    border: formData.time === time ? '2px solid #059669' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: formData.time === time
                      ? 'linear-gradient(to bottom, #10b981 0%, #059669 100%)'
                      : available
                        ? '#ffffff'
                        : '#fee2e2',
                    color: formData.time === time ? '#ffffff' : available ? '#374151' : '#991b1b',
                    cursor: available ? 'pointer' : 'not-allowed',
                    fontWeight: formData.time === time ? 600 : 400,
                    textDecoration: !available ? 'line-through' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {errors.time && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{errors.time}</span>}
        </div>

        {/* Legend */}
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: '#f0f9ff',
          borderRadius: '6px',
          display: 'flex',
          gap: '1.5rem',
          fontSize: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '3px',
            }} />
            <span>Available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '3px',
            }} />
            <span>Booked</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '3px',
            }} />
            <span>Provider Not Working</span>
          </div>
        </div>
      </div>

      <div className="modal-footer" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          disabled={saving}
          style={{
            padding: '0.625rem 1.25rem',
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSubmit}
          disabled={saving || !formData.time}
          style={{
            padding: '0.625rem 1.25rem',
            background: saving || !formData.time
              ? '#e5e7eb'
              : 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
            color: saving || !formData.time ? '#9ca3af' : '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: saving || !formData.time ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            boxShadow: saving || !formData.time ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          {saving ? 'Rescheduling...' : 'Reschedule Appointment'}
        </button>
      </div>
    </Modal>
  );
}
