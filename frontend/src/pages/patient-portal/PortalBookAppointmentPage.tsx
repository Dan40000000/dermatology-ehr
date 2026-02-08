import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { AppointmentCalendar } from '../../components/scheduling/AppointmentCalendar';
import { TimeSlotSelector } from '../../components/scheduling/TimeSlotSelector';
import { AppointmentConfirmation } from '../../components/scheduling/AppointmentConfirmation';
import { usePatientPortalAuth, patientPortalFetch } from '../../contexts/PatientPortalAuthContext';

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

export function PortalBookAppointmentPage() {
  const { patient } = usePatientPortalAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<BookingStep>('type');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
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
    loadInitialData();
  }, []);

  // Load available dates when provider and type are selected
  useEffect(() => {
    if (selectedProvider && selectedType) {
      const now = new Date();
      loadAvailableDates(selectedProvider.id, selectedType.id, now.getFullYear(), now.getMonth() + 1);
    }
  }, [selectedProvider, selectedType]);

  // Load time slots when date is selected
  useEffect(() => {
    if (selectedDate && selectedProvider && selectedType) {
      loadTimeSlots(selectedDate, selectedProvider.id, selectedType.id);
    }
  }, [selectedDate, selectedProvider, selectedType]);

  const loadInitialData = async () => {
    setInitialLoading(true);
    try {
      const [settingsData, providersData, typesData] = await Promise.all([
        patientPortalFetch('/api/patient-portal/scheduling/settings'),
        patientPortalFetch('/api/patient-portal/scheduling/providers'),
        patientPortalFetch('/api/patient-portal/scheduling/appointment-types'),
      ]);

      setSettings(settingsData);
      setProviders(Array.isArray(providersData.providers) ? providersData.providers : []);
      setAppointmentTypes(Array.isArray(typesData.appointmentTypes) ? typesData.appointmentTypes : []);
    } catch (err) {
      console.error('Error loading initial data:', err);
      setError('Failed to load booking settings. Please try again later.');
    } finally {
      setInitialLoading(false);
    }
  };

  const loadAvailableDates = async (
    providerId: string,
    appointmentTypeId: string,
    year: number,
    month: number
  ) => {
    try {
      const data = await patientPortalFetch(
        `/api/patient-portal/scheduling/available-dates?providerId=${providerId}&appointmentTypeId=${appointmentTypeId}&year=${year}&month=${month}`
      );
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
      const data = await patientPortalFetch(
        `/api/patient-portal/scheduling/availability?date=${dateStr}&providerId=${providerId}&appointmentTypeId=${appointmentTypeId}`
      );
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
      await patientPortalFetch('/api/patient-portal/scheduling/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProvider.id,
          appointmentTypeId: selectedType.id,
          scheduledStart: selectedSlot.startTime,
          scheduledEnd: selectedSlot.endTime,
          reason: reason || undefined,
          notes: notes || undefined,
        }),
      });

      setCurrentStep('success');
    } catch (err: unknown) {
      console.error('Error booking appointment:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to book appointment';
      setError(errorMessage);
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

  const getStepNumber = (step: BookingStep): number => {
    const steps = ['type', 'provider', 'date', 'time', 'confirm', 'success'];
    return steps.indexOf(step) + 1;
  };

  const isStepComplete = (step: BookingStep): boolean => {
    switch (step) {
      case 'type':
        return !!selectedType;
      case 'provider':
        return !!selectedProvider;
      case 'date':
        return !!selectedDate;
      case 'time':
        return !!selectedSlot;
      case 'confirm':
        return currentStep === 'success';
      default:
        return false;
    }
  };

  const getIcon = (iconName: string) => {
    const icons: Record<string, JSX.Element> = {
      calendar: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
      user: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      ),
      clock: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
      ),
      check: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
      ),
      arrowLeft: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12,19 5,12 12,5"/>
        </svg>
      ),
      clipboard: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
      ),
    };
    return icons[iconName] || null;
  };

  if (initialLoading) {
    return (
      <PatientPortalLayout>
        <div className="booking-page">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading booking options...</p>
          </div>
        </div>
        <style>{styles}</style>
      </PatientPortalLayout>
    );
  }

  if (!settings?.isEnabled) {
    return (
      <PatientPortalLayout>
        <div className="booking-page">
          <div className="disabled-message">
            <div className="disabled-icon">{getIcon('calendar')}</div>
            <h2>Online Booking Unavailable</h2>
            <p>Online appointment booking is currently unavailable. Please call our office to schedule an appointment.</p>
            <Link to="/portal/appointments" className="back-link">
              {getIcon('arrowLeft')}
              <span>Back to Appointments</span>
            </Link>
          </div>
        </div>
        <style>{styles}</style>
      </PatientPortalLayout>
    );
  }

  return (
    <PatientPortalLayout>
      <div className="booking-page">
        {/* Page Header */}
        <header className="booking-header">
          <div className="header-content">
            <h1>Book an Appointment</h1>
            <p>Schedule your visit in a few easy steps</p>
          </div>
          <Link to="/portal/appointments" className="header-back-link">
            {getIcon('arrowLeft')}
            <span>Back to Appointments</span>
          </Link>
        </header>

        {/* Progress Steps */}
        <div className="progress-container">
          <div className="progress-steps">
            {['type', 'provider', 'date', 'time', 'confirm'].map((step, index) => {
              const stepLabels: Record<string, string> = {
                type: 'Visit Type',
                provider: 'Provider',
                date: 'Date',
                time: 'Time',
                confirm: 'Confirm',
              };
              const isActive = currentStep === step || isStepComplete(step as BookingStep);
              const isCurrent = currentStep === step;

              return (
                <div key={step} className={`progress-step ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}>
                  <div className="step-indicator">
                    {isStepComplete(step as BookingStep) && currentStep !== step ? (
                      <span className="step-check">{getIcon('check')}</span>
                    ) : (
                      <span className="step-number">{index + 1}</span>
                    )}
                  </div>
                  <span className="step-label">{stepLabels[step]}</span>
                  {index < 4 && <div className="step-connector" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="error-banner">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="dismiss-error">Dismiss</button>
          </div>
        )}

        {/* Custom message */}
        {settings?.customMessage && currentStep === 'type' && (
          <div className="welcome-banner">
            {settings.customMessage}
          </div>
        )}

        {/* Step Content */}
        <div className="step-content">
          {currentStep === 'type' && (
            <div className="selection-step">
              <h2>What type of appointment do you need?</h2>
              <p className="step-description">Select the type of visit you'd like to schedule</p>

              {appointmentTypes.length === 0 ? (
                <div className="empty-state">
                  <p>No appointment types are currently available for online booking.</p>
                </div>
              ) : (
                <div className="options-grid">
                  {appointmentTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleSelectType(type)}
                      className="option-card"
                    >
                      <div className="option-icon">{getIcon('clipboard')}</div>
                      <div className="option-content">
                        <h3>{type.name}</h3>
                        <span className="option-duration">{type.durationMinutes} minutes</span>
                        {type.description && <p className="option-description">{type.description}</p>}
                      </div>
                      <span className="option-arrow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9,18 15,12 9,6"/>
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 'provider' && (
            <div className="selection-step">
              <button onClick={handleBack} className="back-button">
                {getIcon('arrowLeft')}
                <span>Back</span>
              </button>
              <h2>Choose a provider</h2>
              <p className="step-description">Select the provider you'd like to see</p>

              {providers.length === 0 ? (
                <div className="empty-state">
                  <p>No providers are currently available for online booking.</p>
                </div>
              ) : (
                <div className="options-grid">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => handleSelectProvider(provider)}
                      className="option-card provider-card"
                    >
                      <div className="provider-avatar">
                        {provider.profileImageUrl ? (
                          <img src={provider.profileImageUrl} alt={provider.fullName} />
                        ) : (
                          <span>{provider.fullName.split(' ').map(n => n[0]).join('')}</span>
                        )}
                      </div>
                      <div className="option-content">
                        <h3>{provider.fullName}</h3>
                        {provider.specialty && <span className="provider-specialty">{provider.specialty}</span>}
                        {provider.bio && <p className="option-description">{provider.bio.substring(0, 80)}...</p>}
                      </div>
                      <span className="option-arrow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9,18 15,12 9,6"/>
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 'date' && selectedProvider && selectedType && (
            <div className="selection-step">
              <button onClick={handleBack} className="back-button">
                {getIcon('arrowLeft')}
                <span>Back</span>
              </button>
              <h2>Select a date</h2>
              <p className="step-description">
                Choose a date for your {selectedType.name} with {selectedProvider.fullName}
              </p>
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
              <button onClick={handleBack} className="back-button">
                {getIcon('arrowLeft')}
                <span>Back</span>
              </button>
              <h2>Select a time</h2>
              <p className="step-description">
                Available times for {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
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
              <button onClick={handleBack} className="back-button">
                {getIcon('arrowLeft')}
                <span>Back</span>
              </button>

              {/* Reason/Notes fields */}
              <div className="confirm-fields">
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
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="8,12 11,15 16,9"/>
                </svg>
              </div>
              <h2>Appointment Booked!</h2>
              <p>Your appointment has been successfully scheduled. You will receive a confirmation email shortly.</p>

              {selectedSlot && selectedProvider && selectedType && (
                <div className="success-details">
                  <div className="detail-item">
                    <span className="detail-label">Date</span>
                    <span className="detail-value">
                      {new Date(selectedSlot.startTime).toLocaleDateString('en-US', {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Time</span>
                    <span className="detail-value">
                      {new Date(selectedSlot.startTime).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', hour12: true
                      })}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Provider</span>
                    <span className="detail-value">{selectedProvider.fullName}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Type</span>
                    <span className="detail-value">{selectedType.name}</span>
                  </div>
                </div>
              )}

              <div className="success-actions">
                <button onClick={handleStartOver} className="btn btn-secondary">
                  Book Another Appointment
                </button>
                <Link to="/portal/appointments" className="btn btn-primary">
                  View My Appointments
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{styles}</style>
    </PatientPortalLayout>
  );
}

const styles = `
  .booking-page {
    max-width: 900px;
  }

  .booking-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-content h1 {
    font-size: 1.75rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 0.25rem 0;
  }

  .header-content p {
    color: #64748b;
    margin: 0;
  }

  .header-back-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #6366f1;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .header-back-link:hover {
    background: #f1f5f9;
  }

  .header-back-link svg {
    width: 18px;
    height: 18px;
  }

  /* Progress Steps */
  .progress-container {
    background: white;
    border-radius: 16px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border: 1px solid #e2e8f0;
  }

  .progress-steps {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .progress-step {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .progress-step:last-child {
    flex: 0;
  }

  .step-indicator {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #f1f5f9;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.875rem;
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .progress-step.active .step-indicator {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
  }

  .progress-step.current .step-indicator {
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
  }

  .step-check svg {
    width: 18px;
    height: 18px;
  }

  .step-label {
    margin-left: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #94a3b8;
    white-space: nowrap;
  }

  .progress-step.active .step-label {
    color: #1e293b;
  }

  .step-connector {
    flex: 1;
    height: 2px;
    background: #e2e8f0;
    margin: 0 1rem;
  }

  .progress-step.active + .progress-step .step-connector,
  .progress-step.active .step-connector {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  }

  /* Error & Welcome Banners */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    color: #991b1b;
    margin-bottom: 1.5rem;
  }

  .error-banner svg {
    flex-shrink: 0;
  }

  .dismiss-error {
    margin-left: auto;
    background: none;
    border: none;
    color: #991b1b;
    font-weight: 600;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .dismiss-error:hover {
    background: rgba(153, 27, 27, 0.1);
  }

  .welcome-banner {
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%);
    border: 1px solid #dbeafe;
    border-radius: 12px;
    color: #1e40af;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  /* Step Content */
  .step-content {
    background: white;
    border-radius: 20px;
    padding: 2rem;
    border: 1px solid #e2e8f0;
    min-height: 400px;
  }

  .selection-step h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 0.5rem 0;
  }

  .step-description {
    color: #64748b;
    margin: 0 0 1.5rem 0;
  }

  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    color: #6366f1;
    font-weight: 600;
    cursor: pointer;
    padding: 0.5rem 0;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .back-button svg {
    width: 18px;
    height: 18px;
  }

  .back-button:hover {
    color: #4f46e5;
  }

  /* Options Grid */
  .options-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .option-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: white;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
  }

  .option-card:hover {
    border-color: #6366f1;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);
    transform: translateY(-2px);
  }

  .option-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%);
    color: #6366f1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .option-icon svg {
    width: 24px;
    height: 24px;
  }

  .option-content {
    flex: 1;
  }

  .option-content h3 {
    font-size: 1.1rem;
    font-weight: 600;
    color: #1e293b;
    margin: 0 0 0.25rem 0;
  }

  .option-duration {
    font-size: 0.875rem;
    color: #6366f1;
    font-weight: 500;
  }

  .option-description {
    font-size: 0.875rem;
    color: #64748b;
    margin: 0.5rem 0 0 0;
    line-height: 1.5;
  }

  .option-arrow {
    color: #cbd5e1;
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .option-arrow svg {
    width: 20px;
    height: 20px;
  }

  .option-card:hover .option-arrow {
    color: #6366f1;
    transform: translateX(4px);
  }

  /* Provider Card */
  .provider-card .provider-avatar {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 1.1rem;
    flex-shrink: 0;
    overflow: hidden;
  }

  .provider-card .provider-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .provider-specialty {
    font-size: 0.875rem;
    color: #6366f1;
    font-weight: 500;
  }

  /* Calendar Wrapper */
  .calendar-wrapper {
    max-width: 600px;
    margin: 0 auto;
  }

  /* Confirm Fields */
  .confirm-fields {
    margin-bottom: 1.5rem;
  }

  .form-group {
    margin-bottom: 1.25rem;
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
    padding: 0.75rem 1rem;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    font-size: 0.9375rem;
    font-family: inherit;
    resize: vertical;
    transition: border-color 0.2s;
  }

  .form-group textarea:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  /* Success Step */
  .success-step {
    text-align: center;
    padding: 2rem 1rem;
  }

  .success-icon {
    color: #10b981;
    margin-bottom: 1.5rem;
  }

  .success-icon svg {
    width: 80px;
    height: 80px;
  }

  .success-step h2 {
    font-size: 1.75rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 0.75rem 0;
  }

  .success-step > p {
    font-size: 1rem;
    color: #64748b;
    margin: 0 0 2rem 0;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
  }

  .success-details {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .detail-item:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-weight: 600;
    color: #64748b;
  }

  .detail-value {
    color: #1e293b;
    text-align: right;
  }

  .success-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.875rem 1.5rem;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-primary {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }

  .btn-primary:hover {
    box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: white;
    border: 2px solid #e2e8f0;
    color: #475569;
  }

  .btn-secondary:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  /* Loading & Empty States */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    gap: 1rem;
  }

  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e2e8f0;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-state p {
    color: #64748b;
  }

  .disabled-message {
    text-align: center;
    padding: 4rem 2rem;
  }

  .disabled-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 1.5rem;
    color: #cbd5e1;
  }

  .disabled-icon svg {
    width: 100%;
    height: 100%;
  }

  .disabled-message h2 {
    color: #1e293b;
    margin: 0 0 0.75rem 0;
  }

  .disabled-message p {
    color: #64748b;
    margin: 0 0 2rem 0;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: #6366f1;
    text-decoration: none;
    font-weight: 600;
  }

  .back-link svg {
    width: 18px;
    height: 18px;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: #64748b;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .booking-header {
      flex-direction: column;
    }

    .progress-steps {
      flex-wrap: wrap;
      gap: 1rem;
    }

    .step-connector {
      display: none;
    }

    .progress-step {
      flex: 0 0 auto;
    }

    .step-label {
      display: none;
    }

    .step-content {
      padding: 1.5rem;
    }

    .success-actions {
      flex-direction: column;
    }

    .btn {
      width: 100%;
    }
  }
`;
