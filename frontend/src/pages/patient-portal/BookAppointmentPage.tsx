import { useState, useEffect } from 'react';
import { AppointmentCalendar } from '../../components/scheduling/AppointmentCalendar';
import { TimeSlotSelector } from '../../components/scheduling/TimeSlotSelector';
import { AppointmentConfirmation } from '../../components/scheduling/AppointmentConfirmation';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface Provider {
  id: string;
  fullName: string;
  specialty?: string;
  profileImageUrl?: string;
  bio?: string;
}

interface AppointmentType {
  id: string;
  name: string;
  durationMinutes: number;
  description?: string;
  color?: string;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  providerId: string;
  providerName?: string;
}

interface BookingSettings {
  isEnabled: boolean;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  customMessage?: string;
  requireReason?: boolean;
}

type BookingStep = 'type' | 'provider' | 'date' | 'time' | 'confirm' | 'success';

export default function BookAppointmentPage() {
  const [currentStep, setCurrentStep] = useState<BookingStep>('type');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);

  // Selections
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Load initial data
  useEffect(() => {
    loadSettings();
    loadProviders();
    loadAppointmentTypes();
  }, []);

  // Load available dates when provider and type are selected
  useEffect(() => {
    if (selectedProvider && selectedType && selectedDate) {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth() + 1;
      loadAvailableDates(selectedProvider.id, selectedType.id, year, month);
    }
  }, [selectedProvider, selectedType, selectedDate]);

  // Load time slots when date is selected
  useEffect(() => {
    if (selectedDate && selectedProvider && selectedType) {
      loadTimeSlots(selectedDate, selectedProvider.id, selectedType.id);
    }
  }, [selectedDate, selectedProvider, selectedType]);

  const getAuthToken = () => {
    return localStorage.getItem('patientPortalToken');
  };

  const getHeaders = () => {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
      'x-tenant-id': 'tenant-demo',
    };
  };

  const loadSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/patient-portal/scheduling/settings`, {
        headers: getHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load settings');

      const data = await response.json();
      setSettings(data);
    } catch (err) {
      console.error('Error loading settings:', err);
      setError('Failed to load booking settings');
    }
  };

  const loadProviders = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/patient-portal/scheduling/providers`, {
        headers: getHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load providers');

      const data = await response.json();
      setProviders(Array.isArray(data.providers) ? data.providers : []);
    } catch (err) {
      console.error('Error loading providers:', err);
      setError('Failed to load providers');
    }
  };

  const loadAppointmentTypes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/patient-portal/scheduling/appointment-types`, {
        headers: getHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load appointment types');

      const data = await response.json();
      setAppointmentTypes(Array.isArray(data.appointmentTypes) ? data.appointmentTypes : []);
    } catch (err) {
      console.error('Error loading appointment types:', err);
      setError('Failed to load appointment types');
    }
  };

  const loadAvailableDates = async (
    providerId: string,
    appointmentTypeId: string,
    year: number,
    month: number
  ) => {
    try {
      const response = await fetch(
        `${API_BASE}/api/patient-portal/scheduling/available-dates?providerId=${providerId}&appointmentTypeId=${appointmentTypeId}&year=${year}&month=${month}`,
        {
          headers: getHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to load available dates');

      const data = await response.json();
      setAvailableDates(Array.isArray(data.dates) ? data.dates : []);
    } catch (err) {
      console.error('Error loading available dates:', err);
      setAvailableDates([]);
    }
  };

  const loadTimeSlots = async (date: Date, providerId: string, appointmentTypeId: string) => {
    setLoading(true);
    try {
      const dateStr = date.toISOString().split('T')[0];
      const response = await fetch(
        `${API_BASE}/api/patient-portal/scheduling/availability?date=${dateStr}&providerId=${providerId}&appointmentTypeId=${appointmentTypeId}`,
        {
          headers: getHeaders(),
        }
      );

      if (!response.ok) throw new Error('Failed to load time slots');

      const data = await response.json();
      setTimeSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch (err) {
      console.error('Error loading time slots:', err);
      setError('Failed to load available times');
      setTimeSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedProvider || !selectedType || !selectedSlot) {
      setError('Please complete all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/patient-portal/scheduling/book`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          providerId: selectedProvider.id,
          appointmentTypeId: selectedType.id,
          scheduledStart: selectedSlot.startTime,
          scheduledEnd: selectedSlot.endTime,
          reason: reason || undefined,
          notes: notes || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to book appointment');
      }

      setCurrentStep('success');
    } catch (err: any) {
      console.error('Error booking appointment:', err);
      setError(err.message || 'Failed to book appointment');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectType = (type: AppointmentType) => {
    setSelectedType(type);
    setCurrentStep('provider');
  };

  const handleSelectProvider = (provider: Provider) => {
    setSelectedProvider(provider);
    setCurrentStep('date');
  };

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setCurrentStep('time');
  };

  const handleSelectSlot = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setCurrentStep('confirm');
  };

  const handleBack = () => {
    const steps: BookingStep[] = ['type', 'provider', 'date', 'time', 'confirm'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleStartOver = () => {
    setSelectedType(null);
    setSelectedProvider(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setReason('');
    setNotes('');
    setCurrentStep('type');
  };

  if (!settings?.isEnabled) {
    return (
      <div className="booking-page">
        <div className="disabled-message">
          <h2>Online Booking Unavailable</h2>
          <p>Online appointment booking is currently unavailable. Please call our office to schedule an appointment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <div className="booking-container">
        {/* Progress indicator */}
        <div className="progress-bar">
          <div className={`progress-step ${currentStep === 'type' || (selectedType && true) ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-label">Type</div>
          </div>
          <div className="progress-line" />
          <div className={`progress-step ${currentStep === 'provider' || (selectedProvider && true) ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-label">Provider</div>
          </div>
          <div className="progress-line" />
          <div className={`progress-step ${currentStep === 'date' || (selectedDate && true) ? 'active' : ''}`}>
            <div className="step-number">3</div>
            <div className="step-label">Date</div>
          </div>
          <div className="progress-line" />
          <div className={`progress-step ${currentStep === 'time' || (selectedSlot && true) ? 'active' : ''}`}>
            <div className="step-number">4</div>
            <div className="step-label">Time</div>
          </div>
          <div className="progress-line" />
          <div className={`progress-step ${currentStep === 'confirm' || currentStep === 'success' ? 'active' : ''}`}>
            <div className="step-number">5</div>
            <div className="step-label">Confirm</div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="error-message">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="dismiss-error">×</button>
          </div>
        )}

        {/* Custom message */}
        {settings?.customMessage && currentStep === 'type' && (
          <div className="welcome-message">
            {settings.customMessage}
          </div>
        )}

        {/* Step content */}
        <div className="step-content">
          {currentStep === 'type' && (
            <div className="selection-step">
              <h2>Select Appointment Type</h2>
              <div className="cards-grid">
                {appointmentTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleSelectType(type)}
                    className="selection-card"
                  >
                    <div className="card-header">
                      <h3>{type.name}</h3>
                      <span className="duration">{type.durationMinutes} min</span>
                    </div>
                    {type.description && <p className="card-description">{type.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'provider' && (
            <div className="selection-step">
              <h2>Select Provider</h2>
              <button onClick={handleBack} className="back-button">← Back</button>
              <div className="cards-grid">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleSelectProvider(provider)}
                    className="selection-card provider-card"
                  >
                    {provider.profileImageUrl && (
                      <img src={provider.profileImageUrl} alt={provider.fullName} className="provider-image-small" />
                    )}
                    <div>
                      <h3>{provider.fullName}</h3>
                      {provider.specialty && <p className="specialty">{provider.specialty}</p>}
                      {provider.bio && <p className="bio-preview">{provider.bio.substring(0, 100)}...</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'date' && selectedProvider && selectedType && (
            <div className="selection-step">
              <h2>Select Date</h2>
              <button onClick={handleBack} className="back-button">← Back</button>
              <div className="calendar-wrapper">
                <AppointmentCalendar
                  selectedDate={selectedDate}
                  onDateSelect={handleSelectDate}
                  availableDates={availableDates}
                  minDate={new Date()}
                  maxDate={new Date(Date.now() + (settings?.maxAdvanceDays || 90) * 24 * 60 * 60 * 1000)}
                />
              </div>
            </div>
          )}

          {currentStep === 'time' && selectedDate && selectedProvider && selectedType && (
            <div className="selection-step">
              <h2>Select Time</h2>
              <button onClick={handleBack} className="back-button">← Back</button>
              <TimeSlotSelector
                slots={timeSlots}
                selectedSlot={selectedSlot}
                onSlotSelect={handleSelectSlot}
                loading={loading}
                date={selectedDate}
              />
            </div>
          )}

          {currentStep === 'confirm' && selectedProvider && selectedType && selectedSlot && (
            <div className="selection-step">
              <button onClick={handleBack} className="back-button">← Back</button>

              {/* Optional reason/notes fields */}
              {settings?.requireReason && (
                <div className="form-group">
                  <label htmlFor="reason">Reason for Visit *</label>
                  <textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Please describe the reason for your visit"
                    rows={3}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="notes">Additional Notes (Optional)</label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information you'd like to share"
                  rows={3}
                />
              </div>

              <AppointmentConfirmation
                provider={selectedProvider}
                appointmentType={selectedType}
                selectedSlot={selectedSlot}
                reason={reason}
                notes={notes}
                onConfirm={handleBookAppointment}
                onBack={handleBack}
                loading={loading}
              />
            </div>
          )}

          {currentStep === 'success' && (
            <div className="success-step">
              <div className="success-icon">
                <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h2>Appointment Booked!</h2>
              <p>Your appointment has been successfully scheduled. You will receive a confirmation email shortly.</p>

              {selectedSlot && selectedProvider && (
                <div className="success-details">
                  <p><strong>Date:</strong> {new Date(selectedSlot.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  <p><strong>Time:</strong> {new Date(selectedSlot.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                  <p><strong>Provider:</strong> {selectedProvider.fullName}</p>
                </div>
              )}

              <div className="success-actions">
                <button onClick={handleStartOver} className="btn btn-primary">
                  Book Another Appointment
                </button>
                <a href="/patient-portal" className="btn btn-secondary">
                  Return to Dashboard
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .booking-page {
          min-height: 100vh;
          background: #f9fafb;
          padding: 2rem 1rem;
        }

        .booking-container {
          max-width: 1000px;
          margin: 0 auto;
        }

        .progress-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 3rem;
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .progress-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          flex: 1;
        }

        .step-number {
          width: 2.5rem;
          height: 2.5rem;
          border-radius: 50%;
          background: #e5e7eb;
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          transition: all 0.3s;
        }

        .progress-step.active .step-number {
          background: #6B46C1;
          color: white;
        }

        .step-label {
          font-size: 0.875rem;
          color: #6b7280;
          font-weight: 500;
        }

        .progress-step.active .step-label {
          color: #111827;
          font-weight: 600;
        }

        .progress-line {
          flex: 1;
          height: 2px;
          background: #e5e7eb;
          margin: 0 0.5rem;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          background: #fee2e2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #991b1b;
          margin-bottom: 1.5rem;
        }

        .dismiss-error {
          margin-left: auto;
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #991b1b;
          cursor: pointer;
          padding: 0;
          width: 1.5rem;
          height: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .welcome-message {
          padding: 1.5rem;
          background: #eff6ff;
          border: 1px solid #dbeafe;
          border-radius: 6px;
          color: #1e40af;
          margin-bottom: 1.5rem;
          text-align: center;
        }

        .step-content {
          background: white;
          border-radius: 8px;
          padding: 2rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          min-height: 400px;
        }

        .selection-step h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 1.5rem 0;
        }

        .back-button {
          background: none;
          border: none;
          color: #6B46C1;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 1rem;
          padding: 0.5rem 0;
        }

        .back-button:hover {
          color: #7c3aed;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-top: 1.5rem;
        }

        .selection-card {
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }

        .selection-card:hover {
          border-color: #6B46C1;
          box-shadow: 0 4px 6px rgba(107, 70, 193, 0.1);
          transform: translateY(-2px);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 0.5rem;
        }

        .card-header h3 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .duration {
          font-size: 0.875rem;
          color: #6B46C1;
          font-weight: 500;
        }

        .card-description {
          font-size: 0.875rem;
          color: #6b7280;
          line-height: 1.5;
          margin: 0;
        }

        .provider-card {
          display: flex;
          gap: 1rem;
          align-items: start;
        }

        .provider-image-small {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
        }

        .specialty {
          font-size: 0.875rem;
          color: #6B46C1;
          font-weight: 500;
          margin: 0.25rem 0;
        }

        .bio-preview {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0.5rem 0 0 0;
        }

        .calendar-wrapper {
          max-width: 600px;
          margin: 1.5rem auto 0;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.9375rem;
          font-family: inherit;
          resize: vertical;
        }

        .form-group textarea:focus {
          outline: none;
          border-color: #6B46C1;
          box-shadow: 0 0 0 3px rgba(107, 70, 193, 0.1);
        }

        .success-step {
          text-align: center;
          padding: 3rem 1rem;
        }

        .success-icon {
          color: #10b981;
          margin-bottom: 1.5rem;
        }

        .success-step h2 {
          font-size: 1.875rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 1rem 0;
        }

        .success-step > p {
          font-size: 1rem;
          color: #6b7280;
          margin: 0 0 2rem 0;
        }

        .success-details {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 1.5rem;
          margin-bottom: 2rem;
          text-align: left;
          max-width: 400px;
          margin-left: auto;
          margin-right: auto;
        }

        .success-details p {
          margin: 0.75rem 0;
          color: #374151;
        }

        .success-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
        }

        .btn-primary {
          background: #6B46C1;
          color: white;
        }

        .btn-primary:hover {
          background: #7c3aed;
        }

        .btn-secondary {
          background: white;
          border: 2px solid #d1d5db;
          color: #374151;
        }

        .btn-secondary:hover {
          background: #f9fafb;
        }

        .disabled-message {
          text-align: center;
          padding: 3rem 1rem;
          background: white;
          border-radius: 8px;
          max-width: 600px;
          margin: 0 auto;
        }

        .disabled-message h2 {
          color: #111827;
          margin-bottom: 1rem;
        }

        .disabled-message p {
          color: #6b7280;
        }

        @media (max-width: 640px) {
          .booking-page {
            padding: 1rem;
          }

          .progress-bar {
            padding: 1rem;
          }

          .step-number {
            width: 2rem;
            height: 2rem;
            font-size: 0.875rem;
          }

          .step-label {
            font-size: 0.75rem;
          }

          .step-content {
            padding: 1.5rem;
          }

          .cards-grid {
            grid-template-columns: 1fr;
          }

          .success-actions {
            flex-direction: column;
          }

          .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
