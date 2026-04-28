import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppointmentCalendar } from '../../components/scheduling/AppointmentCalendar';
import { TimeSlotSelector } from '../../components/scheduling/TimeSlotSelector';
import { API_BASE_URL } from '../../utils/apiBase';
import { buildPortalUrl, DEFAULT_PATIENT_PORTAL_TENANT_ID } from '../../utils/patientPortalLinks';
import {
  formatDateTimeInPracticeTimeZone,
  formatLocalDateKey,
} from '../../utils/practiceDateTime';

interface Provider {
  id: string;
  fullName: string;
  specialty?: string;
}

interface AppointmentType {
  id: string;
  name: string;
  durationMinutes: number;
  description?: string;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  providerId: string;
  providerName?: string;
}

interface PublicBookingSettings {
  isEnabled: boolean;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  timeZone?: string | null;
  customMessage?: string | null;
  requireReason?: boolean;
  allowGuestBooking?: boolean;
  requireCardOnFileForGuestBooking?: boolean;
  guestCancellationFeeCents?: number;
}

type GuestBookingStep = 'type' | 'provider' | 'date' | 'time' | 'details' | 'confirm' | 'success';

const GUEST_BOOKING_TEST_CARD = '4242 4242 4242 4242';

// ── Preview / mock data (used when ?preview=1, no backend needed) ──
const PREVIEW_SETTINGS: PublicBookingSettings = {
  isEnabled: true,
  minAdvanceHours: 24,
  maxAdvanceDays: 90,
  timeZone: 'America/Denver',
  customMessage: null,
  requireReason: true,
  allowGuestBooking: true,
  requireCardOnFileForGuestBooking: true,
  guestCancellationFeeCents: 5000,
};

const PREVIEW_PROVIDERS: Provider[] = [
  { id: 'p1', fullName: 'Dr. Sarah Chen, MD', specialty: 'Medical Dermatology' },
  { id: 'p2', fullName: 'Dr. James Patel, MD', specialty: 'Cosmetic Dermatology' },
];

const PREVIEW_TYPES: AppointmentType[] = [
  { id: 'at1', name: 'New Patient Visit', durationMinutes: 45, description: 'Comprehensive skin evaluation for first-time patients.' },
  { id: 'at2', name: 'Follow-up Visit', durationMinutes: 20, description: 'Return visit for an existing condition or treatment.' },
  { id: 'at3', name: 'Cosmetic Consultation', durationMinutes: 30, description: 'Personalized consultation for aesthetic procedures.' },
];

function makePreviewSlots(providerId: string): TimeSlot[] {
  const base = new Date();
  base.setDate(base.getDate() + 7);
  base.setHours(0, 0, 0, 0);
  return [9, 10, 11, 14, 15, 16].map((hour) => ({
    startTime: new Date(base.getTime() + hour * 3600_000).toISOString(),
    endTime: new Date(base.getTime() + hour * 3600_000 + 45 * 60_000).toISOString(),
    isAvailable: true,
    providerId,
  }));
}

function makePreviewDates(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return formatLocalDateKey(d);
  });
}

function formatMoney(cents?: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
}

function formatDateTime(isoString: string, timeZone?: string | null) {
  return formatDateTimeInPracticeTimeZone(isoString, timeZone);
}

const IconArrow = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" fill="currentColor" opacity="0.15"/>
    <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconCard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 5v3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
  </svg>
);

function BookingBrand({ badge }: { badge: string }) {
  return (
    <div className="gbp-brand-lockup">
      <span className="gbp-brand-mark" aria-hidden="true">
        <span />
      </span>
      <span className="gbp-brand-copy">
        <span className="gbp-wordmark">Dermatology Practice</span>
        <span className="gbp-badge"><span className="gbp-badge-dot" />{badge}</span>
      </span>
    </div>
  );
}

export function PublicGuestBookAppointmentPage() {
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenantId') || DEFAULT_PATIENT_PORTAL_TENANT_ID;
  const isPreview = searchParams.get('preview') === '1';

  const [step, setStep] = useState<GuestBookingStep>('type');
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<PublicBookingSettings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);

  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestDob, setGuestDob] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [policyAcknowledged, setPolicyAcknowledged] = useState(false);
  const [bookedAppointmentId, setBookedAppointmentId] = useState<string | null>(null);
  const [bookedCardLast4, setBookedCardLast4] = useState<string | null>(null);

  const cancellationFeeText = useMemo(
    () => formatMoney(settings?.guestCancellationFeeCents || 5000),
    [settings?.guestCancellationFeeCents]
  );

  async function publicSchedulingFetch(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(payload.error || 'Request failed');
    }

    return response.json();
  }

  useEffect(() => {
    const load = async () => {
      setInitialLoading(true);
      if (isPreview) {
        setSettings(PREVIEW_SETTINGS);
        setProviders(PREVIEW_PROVIDERS);
        setAppointmentTypes(PREVIEW_TYPES);
        setInitialLoading(false);
        return;
      }
      try {
        const [settingsData, providersData, typesData] = await Promise.all([
          publicSchedulingFetch('/api/patient-portal/scheduling/public/settings'),
          publicSchedulingFetch('/api/patient-portal/scheduling/public/providers'),
          publicSchedulingFetch('/api/patient-portal/scheduling/public/appointment-types'),
        ]);
        setSettings(settingsData);
        setProviders(Array.isArray(providersData.providers) ? providersData.providers : []);
        setAppointmentTypes(Array.isArray(typesData.appointmentTypes) ? typesData.appointmentTypes : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load online booking options');
      } finally {
        setInitialLoading(false);
      }
    };
    void load();
  }, [tenantId, isPreview]);

  useEffect(() => {
    const loadDates = async () => {
      if (!selectedProvider || !selectedType) return;
      if (isPreview) { setAvailableDates(makePreviewDates()); return; }
      try {
        const now = new Date();
        const data = await publicSchedulingFetch(
          `/api/patient-portal/scheduling/public/available-dates?providerId=${encodeURIComponent(selectedProvider.id)}&appointmentTypeId=${encodeURIComponent(selectedType.id)}&year=${now.getFullYear()}&month=${now.getMonth() + 1}`
        );
        setAvailableDates(Array.isArray(data.dates) ? data.dates : []);
      } catch (err) {
        setAvailableDates([]);
        setError(err instanceof Error ? err.message : 'Failed to load available dates');
      }
    };
    void loadDates();
  }, [selectedProvider, selectedType, isPreview]);

  useEffect(() => {
    const loadSlots = async () => {
      if (!selectedDate || !selectedProvider || !selectedType) return;
      if (isPreview) { setTimeSlots(makePreviewSlots(selectedProvider.id)); return; }
      setLoading(true);
      try {
        const selectedDateKey = formatLocalDateKey(selectedDate);
        const data = await publicSchedulingFetch(
          `/api/patient-portal/scheduling/public/availability?date=${selectedDateKey}&providerId=${encodeURIComponent(selectedProvider.id)}&appointmentTypeId=${encodeURIComponent(selectedType.id)}`
        );
        setTimeSlots(Array.isArray(data.slots) ? data.slots : []);
      } catch (err) {
        setTimeSlots([]);
        setError(err instanceof Error ? err.message : 'Failed to load available times');
      } finally {
        setLoading(false);
      }
    };
    void loadSlots();
  }, [selectedDate, selectedProvider, selectedType, isPreview]);

  const guestDetailsComplete =
    guestFirstName.trim() &&
    guestLastName.trim() &&
    guestDob &&
    guestPhone.trim() &&
    guestEmail.trim() &&
    reason.trim() &&
    cardholderName.trim() &&
    cardNumber.replace(/\D/g, '').length >= 12 &&
    expiryMonth &&
    expiryYear &&
    billingZip.trim() &&
    policyAcknowledged;

  const handleGuestBooking = async () => {
    if (!selectedProvider || !selectedType || !selectedSlot || !settings) return;

    setLoading(true);
    setError(null);
    try {
      if (isPreview) {
        setBookedAppointmentId(`preview-${Date.now()}`);
        setBookedCardLast4(cardNumber.replace(/\D/g, '').slice(-4));
        setStep('success');
        return;
      }

      const data = await publicSchedulingFetch('/api/patient-portal/scheduling/public/book-guest', {
        method: 'POST',
        body: JSON.stringify({
          providerId: selectedProvider.id,
          appointmentTypeId: selectedType.id,
          scheduledStart: selectedSlot.startTime,
          scheduledEnd: selectedSlot.endTime,
          reason,
          notes: notes || undefined,
          guest: {
            firstName: guestFirstName,
            lastName: guestLastName,
            dob: guestDob,
            phone: guestPhone,
            email: guestEmail,
          },
          paymentMethod: {
            cardNumber,
            cardholderName,
            expiryMonth: Number(expiryMonth),
            expiryYear: Number(expiryYear),
            billingZip,
          },
          policy: {
            acknowledged: true,
            cancellationFeeCents: settings.guestCancellationFeeCents || 5000,
          },
        }),
      });

      setBookedAppointmentId(data.appointmentId || null);
      setBookedCardLast4(data.guestBooking?.cardLast4 || cardNumber.replace(/\D/g, '').slice(-4));
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book appointment');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    setStep('type');
    setSelectedType(null);
    setSelectedProvider(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setAvailableDates([]);
    setTimeSlots([]);
    setReason('');
    setNotes('');
    setGuestFirstName('');
    setGuestLastName('');
    setGuestDob('');
    setGuestPhone('');
    setGuestEmail('');
    setCardholderName('');
    setCardNumber('');
    setExpiryMonth('');
    setExpiryYear('');
    setBillingZip('');
    setPolicyAcknowledged(false);
    setBookedAppointmentId(null);
    setBookedCardLast4(null);
    setError(null);
  };

  const useTestCard = () => {
    setCardNumber(GUEST_BOOKING_TEST_CARD);
    if (!cardholderName.trim()) {
      setCardholderName([guestFirstName, guestLastName].filter(Boolean).join(' ') || 'Test Guest');
    }
    setExpiryMonth('12');
    setExpiryYear(String(new Date().getFullYear() + 1));
    if (!billingZip.trim()) {
      setBillingZip('80202');
    }
  };

  const stepOrder: GuestBookingStep[] = ['type', 'provider', 'date', 'time', 'details', 'confirm'];

  const goBack = () => {
    const index = stepOrder.indexOf(step);
    if (index > 0) setStep(stepOrder[index - 1]);
  };

  const stepLabels: Record<string, string> = {
    type: 'Visit',
    provider: 'Provider',
    date: 'Date',
    time: 'Time',
    details: 'Your Info',
    confirm: 'Review',
  };

  // ── Loading ──────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="gbp gbp-shell">
        <div className="gbp-card">
          <div className="gbp-loading">
            <div className="gbp-spinner" />
            <span>Preparing your booking…</span>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // ── API failed to load ───────────────────────────────────────────────
  if (!settings && error) {
    return (
      <div className="gbp gbp-shell">
        <div className="gbp-card">
          <div className="gbp-header">
            <div className="gbp-header-left">
              <BookingBrand badge="Online Scheduling" />
            </div>
          </div>
          <div className="gbp-body">
            <div className="gbp-state-card">
              <h1>Unable to load booking</h1>
              <p>{error}</p>
              <Link className="gbp-btn-secondary" to={buildPortalUrl('/book-appointment', { tenantId })}>
                ← Back to scheduling options
              </Link>
            </div>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // ── Scheduling disabled ──────────────────────────────────────────────
  if (settings && !settings.isEnabled) {
    return (
      <div className="gbp gbp-shell">
        <div className="gbp-card">
          <div className="gbp-header">
            <div className="gbp-header-left">
              <BookingBrand badge="Online Scheduling" />
            </div>
          </div>
          <div className="gbp-body">
            <div className="gbp-state-card">
              <h1>Scheduling unavailable</h1>
              <p>Online scheduling is temporarily unavailable. Please call the office to book your visit.</p>
              <Link className="gbp-btn-secondary" to={buildPortalUrl('/book-appointment', { tenantId })}>
                ← Back to scheduling options
              </Link>
            </div>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // ── Guest booking disabled ───────────────────────────────────────────
  if (settings && !settings.allowGuestBooking) {
    return (
      <div className="gbp gbp-shell">
        <div className="gbp-card">
          <div className="gbp-header">
            <div className="gbp-header-left">
              <BookingBrand badge="Online Scheduling" />
            </div>
          </div>
          <div className="gbp-body">
            <div className="gbp-state-card">
              <h1>Portal account required</h1>
              <p>Guest booking is not available at this time. Please sign in or create a portal account to schedule online.</p>
              <div className="gbp-state-actions">
                <Link className="gbp-btn-primary" to={buildPortalUrl('/portal/login', { tenantId, redirect: '/portal/book-appointment' })}>Sign in to portal</Link>
                <Link className="gbp-btn-secondary" to={buildPortalUrl('/portal/register', { tenantId, redirect: '/portal/book-appointment' })}>Create account</Link>
              </div>
            </div>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // ── Main flow ────────────────────────────────────────────────────────
  return (
    <div className="gbp gbp-shell">
      <div className="gbp-card">

        {/* ── Header band ── */}
        <div className="gbp-header">
          <div className="gbp-header-left">
            <BookingBrand badge="Guest Scheduling" />
          </div>
          <div className="gbp-header-links">
            <Link className="gbp-nav-link" to={buildPortalUrl('/book-appointment', { tenantId })}>← Back to options</Link>
            <Link className="gbp-nav-link" to={buildPortalUrl('/portal/login', { tenantId, redirect: '/portal/book-appointment' })}>Sign in instead</Link>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="gbp-body">

          {/* Hero — shown only on first step */}
          {step === 'type' && (
            <div className="gbp-hero">
              <h1 className="gbp-hero-title">Book as a Guest</h1>
              <p className="gbp-lead">
                No portal account needed. We'll collect your contact details and a card on file for our {cancellationFeeText} late-cancellation policy.
              </p>
            </div>
          )}

          {settings.customMessage && step === 'type' && (
            <div className="gbp-info-strip">{settings.customMessage}</div>
          )}

          {error && (
            <div className="gbp-error-strip">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          {/* ── Stepper ── */}
          {step !== 'success' && (
            <div className="gbp-stepper" aria-label="Booking progress">
              {stepOrder.map((stepName, index) => {
                const currentIndex = stepOrder.indexOf(step);
                const isDone = currentIndex > index;
                const isCurrent = step === stepName;
                return (
                  <div
                    key={stepName}
                    className={`gbp-step-item${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}
                  >
                    <div className="gbp-step-circle">
                      {isDone ? <IconCheck /> : index + 1}
                    </div>
                    <span className="gbp-step-label">{stepLabels[stepName]}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step: Visit type ── */}
          {step === 'type' && (
            <div className="gbp-step-pane">
              <h2 className="gbp-step-heading">What brings you in?</h2>
              <p className="gbp-step-sub">Select the type of visit you'd like to schedule.</p>
              <div className="gbp-option-grid">
                {appointmentTypes.map((type) => (
                  <button
                    key={type.id}
                    className="gbp-option-card"
                    onClick={() => { setSelectedType(type); setStep('provider'); }}
                  >
                    <span className="gbp-option-name">{type.name}</span>
                    <span className="gbp-option-meta">{type.durationMinutes} min visit</span>
                    {type.description && <span className="gbp-option-desc">{type.description}</span>}
                    <span className="gbp-option-arrow"><IconArrow /></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step: Provider ── */}
          {step === 'provider' && (
            <div className="gbp-step-pane">
              <button className="gbp-back" onClick={goBack}><IconChevronLeft /> Back</button>
              <h2 className="gbp-step-heading">Choose your provider</h2>
              <p className="gbp-step-sub">{selectedType?.name} · {selectedType?.durationMinutes} min</p>
              <div className="gbp-option-grid">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    className="gbp-option-card"
                    onClick={() => { setSelectedProvider(provider); setStep('date'); }}
                  >
                    <span className="gbp-option-name">{provider.fullName}</span>
                    {provider.specialty && <span className="gbp-option-meta">{provider.specialty}</span>}
                    <span className="gbp-option-arrow"><IconArrow /></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step: Date ── */}
          {step === 'date' && selectedProvider && selectedType && (
            <div className="gbp-step-pane">
              <button className="gbp-back" onClick={goBack}><IconChevronLeft /> Back</button>
              <h2 className="gbp-step-heading">Choose a date</h2>
              <p className="gbp-step-sub">{selectedType.name} with {selectedProvider.fullName}</p>
              <AppointmentCalendar
                selectedDate={selectedDate}
                onDateSelect={(date) => { setSelectedDate(date); setStep('time'); }}
                availableDates={availableDates}
                minDate={new Date()}
                maxDate={new Date(Date.now() + (settings.maxAdvanceDays || 90) * 24 * 60 * 60 * 1000)}
              />
            </div>
          )}

          {/* ── Step: Time ── */}
          {step === 'time' && selectedDate && (
            <div className="gbp-step-pane">
              <button className="gbp-back" onClick={goBack}><IconChevronLeft /> Back</button>
              <h2 className="gbp-step-heading">Choose a time</h2>
              <p className="gbp-step-sub">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {selectedProvider ? ` · ${selectedProvider.fullName}` : ''}
              </p>
              <TimeSlotSelector
                slots={timeSlots}
                selectedSlot={selectedSlot}
                onSlotSelect={(slot) => { setSelectedSlot(slot); setStep('details'); }}
                loading={loading}
                date={selectedDate}
                timeZone={settings?.timeZone}
              />
            </div>
          )}

          {/* ── Step: Details ── */}
          {step === 'details' && (
            <div className="gbp-step-pane">
              <button className="gbp-back" onClick={goBack}><IconChevronLeft /> Back</button>
              <h2 className="gbp-step-heading">Your information</h2>
              <p className="gbp-step-sub">We need a few details to confirm your appointment.</p>

              {/* Contact info */}
              <div className="gbp-form-section">
                <div className="gbp-section-title">Contact information</div>
                <div className="gbp-form-grid">
                  <div className="gbp-form-field">
                    <label className="gbp-label" htmlFor="gfn">First name</label>
                    <input id="gfn" className="gbp-input" value={guestFirstName} onChange={(e) => setGuestFirstName(e.target.value)} />
                  </div>
                  <div className="gbp-form-field">
                    <label className="gbp-label" htmlFor="gln">Last name</label>
                    <input id="gln" className="gbp-input" value={guestLastName} onChange={(e) => setGuestLastName(e.target.value)} />
                  </div>
                  <div className="gbp-form-field">
                    <label className="gbp-label" htmlFor="gdob">Date of birth</label>
                    <input id="gdob" className="gbp-input" type="date" value={guestDob} onChange={(e) => setGuestDob(e.target.value)} />
                  </div>
                  <div className="gbp-form-field">
                    <label className="gbp-label" htmlFor="gph">Phone</label>
                    <input id="gph" className="gbp-input" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} inputMode="tel" />
                  </div>
                  <div className="gbp-form-field full">
                    <label className="gbp-label" htmlFor="gem">Email address</label>
                    <input id="gem" className="gbp-input" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Visit details */}
              <div className="gbp-form-section">
                <div className="gbp-section-title">Visit details</div>
                <div className="gbp-form-grid">
                  <div className="gbp-form-field full">
                    <label className="gbp-label" htmlFor="greason">Reason for visit</label>
                    <textarea id="greason" className="gbp-textarea" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
                  </div>
                  <div className="gbp-form-field full">
                    <label className="gbp-label" htmlFor="gnotes">Additional notes <span className="gbp-optional">(optional)</span></label>
                    <textarea id="gnotes" className="gbp-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything else we should know?" />
                  </div>
                </div>
              </div>

              {/* Booking protection policy */}
              <div className="gbp-policy-panel">
                <div className="gbp-policy-icon">
                  <IconShield />
                </div>
                <div className="gbp-policy-content">
                  <p className="gbp-policy-title">Booking Protection Policy</p>
                  <p className="gbp-policy-text">
                    This demo uses a mock card-on-file authorization. Use test card {GUEST_BOOKING_TEST_CARD}. Do not enter a real card. The {cancellationFeeText} fee policy is shown as an example only.
                  </p>
                </div>
              </div>

              {/* Card on file */}
              <div className="gbp-card-panel">
                <div className="gbp-card-panel-header">
                  <div className="gbp-card-panel-icon">
                    <IconCard />
                  </div>
                  <div>
                    <p className="gbp-card-panel-title">Card on file</p>
                    <p className="gbp-card-panel-sub">Demo mode — no live card processor is connected</p>
                  </div>
                </div>
                <div className="gbp-demo-card-note">
                  <span>Use the test card {GUEST_BOOKING_TEST_CARD} with any future expiry.</span>
                  <button type="button" onClick={useTestCard}>Test card</button>
                </div>
                <div className="gbp-form-grid">
                  <div className="gbp-form-field full">
                    <label className="gbp-label" htmlFor="gcn">Cardholder name</label>
                    <input id="gcn" className="gbp-input" value={cardholderName} onChange={(e) => setCardholderName(e.target.value)} />
                  </div>
                  <div className="gbp-form-field full">
                    <label className="gbp-label" htmlFor="gcard">Card number</label>
                    <input id="gcard" className="gbp-input" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} inputMode="numeric" placeholder="•••• •••• •••• ••••" />
                  </div>
                  <div className="gbp-form-field">
                    <label className="gbp-label" htmlFor="gmo">Expiry month</label>
                    <input id="gmo" className="gbp-input" value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} inputMode="numeric" placeholder="MM" />
                  </div>
                  <div className="gbp-form-field">
                    <label className="gbp-label" htmlFor="gyr">Expiry year</label>
                    <input id="gyr" className="gbp-input" value={expiryYear} onChange={(e) => setExpiryYear(e.target.value)} inputMode="numeric" placeholder="YYYY" />
                  </div>
                  <div className="gbp-form-field full">
                    <label className="gbp-label" htmlFor="gzip">Billing ZIP</label>
                    <input id="gzip" className="gbp-input gbp-input-zip" value={billingZip} onChange={(e) => setBillingZip(e.target.value)} inputMode="numeric" />
                  </div>
                </div>
              </div>

              {/* Acknowledgment */}
              <label className="gbp-checkbox-row">
                <input
                  type="checkbox"
                  checked={policyAcknowledged}
                  onChange={(e) => setPolicyAcknowledged(e.target.checked)}
                />
                <span className="gbp-checkbox-label">
                  I understand this demo saves only a mock card-on-file record for the {cancellationFeeText} late-cancellation/no-show example.
                </span>
              </label>

              <div className="gbp-footer">
                <div className="gbp-spacer" />
                <button className="gbp-btn-primary" disabled={!guestDetailsComplete} onClick={() => setStep('confirm')}>
                  Review booking <IconArrow />
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Confirm ── */}
          {step === 'confirm' && selectedProvider && selectedType && selectedSlot && (
            <div className="gbp-step-pane">
              <button className="gbp-back" onClick={goBack}><IconChevronLeft /> Back</button>
              <h2 className="gbp-step-heading">Review your booking</h2>
              <p className="gbp-step-sub">Please confirm all details before submitting.</p>

              <div className="gbp-summary-grid">
                <div className="gbp-summary-card">
                  <span className="gbp-summary-label">Appointment</span>
                  <div className="gbp-summary-value">
                    <strong>{selectedType.name}</strong>
                    <span>{selectedProvider.fullName}</span>
                    <span>{formatDateTime(selectedSlot.startTime, settings?.timeZone)}</span>
                  </div>
                </div>
                <div className="gbp-summary-card">
                  <span className="gbp-summary-label">Patient</span>
                  <div className="gbp-summary-value">
                    <strong>{guestFirstName} {guestLastName}</strong>
                    <span>DOB {guestDob}</span>
                    <span>{guestPhone}</span>
                    <span>{guestEmail}</span>
                  </div>
                </div>
                <div className="gbp-summary-card">
                  <span className="gbp-summary-label">Card on file</span>
                  <div className="gbp-summary-value">
                    <strong>{cardholderName}</strong>
                    <span>Ending in {cardNumber.replace(/\D/g, '').slice(-4)}</span>
                    <span className="gbp-summary-fee">Late-cancel / no-show: {cancellationFeeText}</span>
                  </div>
                </div>
              </div>

              <div className="gbp-reason-panel">
                <span className="gbp-reason-label">Reason for visit</span>
                <p className="gbp-reason-text">{reason}</p>
                {notes && (
                  <>
                    <span className="gbp-reason-label" style={{ marginTop: '10px', display: 'block' }}>Additional notes</span>
                    <p className="gbp-reason-text">{notes}</p>
                  </>
                )}
              </div>

              {error && (
                <div className="gbp-error-strip">
                  <IconAlert />
                  <span>{error}</span>
                </div>
              )}

              <div className="gbp-footer">
                <button className="gbp-btn-secondary" onClick={goBack} disabled={loading}>Edit details</button>
                <div className="gbp-spacer" />
                <button className="gbp-btn-primary" onClick={handleGuestBooking} disabled={loading}>
                  {loading ? 'Booking…' : 'Confirm appointment'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Success ── */}
          {step === 'success' && (
            <div className="gbp-step-pane gbp-success">
              <div className="gbp-success-icon-wrap">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle className="gbp-checkmark-circle" cx="40" cy="40" r="38" />
                  <path className="gbp-checkmark-check" d="M23 40L35 52L57 28" />
                </svg>
              </div>

              <h2 className="gbp-success-title">You're all set</h2>
              <p className="gbp-success-sub">
                Your appointment is confirmed. A card ending in <strong>{bookedCardLast4 || '••••'}</strong> has been placed on file per our {cancellationFeeText} booking protection policy.
              </p>

              {selectedSlot && selectedType && selectedProvider && (
                <div className="gbp-appt-summary">
                  <div className="gbp-appt-row">
                    <span className="gbp-appt-key">Visit</span>
                    <span className="gbp-appt-val">{selectedType.name} with {selectedProvider.fullName}</span>
                  </div>
                  <div className="gbp-appt-row">
                    <span className="gbp-appt-key">Date & Time</span>
                    <span className="gbp-appt-val">{formatDateTime(selectedSlot.startTime, settings?.timeZone)}</span>
                  </div>
                  <div className="gbp-appt-row">
                    <span className="gbp-appt-key">Patient</span>
                    <span className="gbp-appt-val">{guestFirstName} {guestLastName}</span>
                  </div>
                </div>
              )}

              {bookedAppointmentId && (
                <p className="gbp-confirmation-id">Confirmation #{bookedAppointmentId}</p>
              )}

              <div className="gbp-success-actions">
                <button className="gbp-btn-secondary" onClick={resetFlow}>Book another visit</button>
                <Link className="gbp-btn-primary" to={buildPortalUrl('/portal/register', { tenantId, redirect: '/portal/book-appointment' })}>
                  Create portal account
                </Link>
              </div>
            </div>
          )}

        </div>{/* /gbp-body */}
      </div>{/* /gbp-card */}
      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  /* ── Tokens ── */
  .gbp {
    --bg:            #F5F8F7;
    --surface:       #FFFFFF;
    --surface-alt:   #F8FAF9;
    --border:        #DCE7E3;
    --border-strong: #B9CCC6;
    --navy:          #172F2E;
    --navy-hover:    #234743;
    --slate:         #546D68;
    --muted:         #7C938E;
    --accent:        #2F8A7D;
    --accent-dark:   #23685E;
    --accent-light:  #EDF8F5;
    --accent-border: #B9DED8;
    --success:       #23725F;
    --success-light: #EAF6F1;
    --warn-bg:       #FFF9EA;
    --warn-border:   #E8D28B;
    --warn-text:     #725A12;
    --err-bg:        #FEF2F2;
    --err-border:    #F87171;
    --err-text:      #991B1B;
  }

  .gbp * { box-sizing: border-box; }
  .gbp, .gbp button, .gbp input, .gbp textarea, .gbp select {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  /* ── Shell ── */
  .gbp-shell {
    min-height: 100vh;
    background: var(--bg);
    padding: 44px 20px 80px;
  }

  /* ── Card ── */
  .gbp-card {
    max-width: 920px;
    margin: 0 auto;
    background: var(--surface);
    border-radius: 8px;
    border: 1px solid var(--border);
    box-shadow: 0 16px 40px rgba(23,47,46,0.08);
    overflow: hidden;
  }

  /* ── Header band ── */
  .gbp-header {
    background: var(--surface);
    border-top: 4px solid var(--accent);
    border-bottom: 1px solid var(--border);
    padding: 22px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .gbp-header-left {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .gbp-brand-lockup {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .gbp-brand-mark {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--accent-border);
    background: var(--accent-light);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    flex-shrink: 0;
  }

  .gbp-brand-mark::before,
  .gbp-brand-mark::after,
  .gbp-brand-mark span {
    content: '';
    position: absolute;
    background: var(--accent);
    border-radius: 999px;
  }

  .gbp-brand-mark::before {
    width: 14px;
    height: 3px;
  }

  .gbp-brand-mark::after {
    width: 3px;
    height: 14px;
  }

  .gbp-brand-mark span {
    width: 9px;
    height: 9px;
    right: 7px;
    bottom: 7px;
    background: var(--surface);
    border: 2px solid var(--accent);
  }

  .gbp-brand-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .gbp-wordmark {
    font-size: 1.02rem;
    font-weight: 700;
    color: var(--navy);
    letter-spacing: 0;
    line-height: 1;
  }

  .gbp-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-dark);
  }

  .gbp-badge-dot {
    width: 5px; height: 5px;
    border-radius: 999px;
    background: var(--accent);
    flex-shrink: 0;
  }

  .gbp-header-links {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
  }

  .gbp-nav-link {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--slate);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .gbp-nav-link:hover { color: var(--accent-dark); }

  /* ── Body ── */
  .gbp-body { padding: 34px 36px 42px; }

  /* ── Hero ── */
  .gbp-hero {
    margin-bottom: 28px;
    padding: 0 0 24px 18px;
    border-bottom: 1px solid var(--border);
    border-left: 3px solid var(--accent);
  }

  .gbp-hero-title {
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    font-weight: 700;
    color: var(--navy);
    margin: 0 0 8px;
    line-height: 1.15;
    letter-spacing: 0;
  }

  .gbp-lead {
    font-size: 0.97rem;
    color: var(--slate);
    line-height: 1.72;
    max-width: 600px;
    margin: 0;
  }

  /* ── Info / Error strips ── */
  .gbp-info-strip {
    background: var(--accent-light);
    border: 1.5px solid var(--accent-border);
    border-radius: 8px;
    padding: 13px 18px;
    font-size: 0.89rem;
    color: var(--accent-dark);
    line-height: 1.6;
    margin-bottom: 20px;
  }

  .gbp-error-strip {
    background: var(--err-bg);
    border: 1.5px solid var(--err-border);
    border-radius: 8px;
    padding: 13px 18px;
    font-size: 0.89rem;
    color: var(--err-text);
    line-height: 1.6;
    margin-bottom: 20px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  /* ── Stepper ── */
  .gbp-stepper {
    display: flex;
    align-items: flex-start;
    margin: 0 0 36px;
  }

  .gbp-step-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    position: relative;
  }

  /* connecting line */
  .gbp-step-item:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 15px;
    left: calc(50% + 16px);
    right: calc(-50% + 16px);
    height: 1.5px;
    background: var(--border);
    transition: background 0.35s ease;
    z-index: 0;
  }

  .gbp-step-item.done:not(:last-child)::after {
    background: var(--accent);
  }

  .gbp-step-circle {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    font-weight: 700;
    border: 1.5px solid var(--border-strong);
    background: var(--surface);
    color: var(--muted);
    z-index: 1;
    position: relative;
    transition: all 0.25s ease;
    flex-shrink: 0;
  }

  .gbp-step-item.done .gbp-step-circle {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .gbp-step-item.current .gbp-step-circle {
    background: var(--surface);
    border-color: var(--accent);
    color: var(--accent-dark);
    box-shadow: 0 0 0 4px rgba(47,138,125,0.12);
  }

  .gbp-step-item.done .gbp-step-circle {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .gbp-step-label {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--muted);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-top: 7px;
    text-align: center;
    transition: color 0.25s ease;
    white-space: nowrap;
  }

  .gbp-step-item.done .gbp-step-label,
  .gbp-step-item.current .gbp-step-label { color: var(--navy); }

  /* ── Step pane ── */
  .gbp-step-pane {
    animation: gbp-fadein 0.22s ease both;
  }

  @keyframes gbp-fadein {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Step headings ── */
  .gbp-step-heading {
    font-size: 1.42rem;
    font-weight: 700;
    color: var(--navy);
    margin: 0 0 5px;
    line-height: 1.12;
    letter-spacing: -0.01em;
  }

  .gbp-step-sub {
    font-size: 0.92rem;
    color: var(--slate);
    margin: 0 0 22px;
    line-height: 1.5;
  }

  /* ── Back button ── */
  .gbp-back {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--slate);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    margin-bottom: 18px;
    text-decoration: none;
    transition: color 0.15s;
  }
  .gbp-back:hover { color: var(--navy); }

  /* ── Option cards ── */
  .gbp-option-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 14px;
  }

  .gbp-option-card {
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-left: 3px solid transparent;
    border-radius: 8px;
    padding: 22px 20px 20px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
    display: flex;
    flex-direction: column;
    gap: 3px;
    position: relative;
    overflow: hidden;
  }

  .gbp-option-card:hover {
    border-color: var(--accent-border);
    border-left-color: var(--accent);
    box-shadow: 0 8px 24px rgba(23,47,46,0.08);
    transform: translateY(-2px);
  }

  .gbp-option-card:active { transform: translateY(0); }

  .gbp-option-name {
    display: block;
    font-size: 1.02rem;
    font-weight: 600;
    color: var(--navy);
    position: relative;
  }

  .gbp-option-meta {
    display: block;
    font-size: 0.82rem;
    color: var(--muted);
    font-weight: 500;
    position: relative;
  }

  .gbp-option-desc {
    display: block;
    font-size: 0.85rem;
    color: var(--slate);
    line-height: 1.5;
    margin-top: 5px;
    position: relative;
  }

  .gbp-option-arrow {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%) translateX(4px);
    color: var(--accent-border);
    opacity: 0;
    transition: all 0.18s ease;
  }

  .gbp-option-card:hover .gbp-option-arrow {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }

  /* ── Form sections ── */
  .gbp-form-section { margin-bottom: 26px; }

  .gbp-section-title {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }

  .gbp-form-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gbp-form-field { display: flex; flex-direction: column; gap: 6px; }
  .gbp-form-field.full { grid-column: 1 / -1; }

  .gbp-label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--slate);
  }

  .gbp-optional {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    font-size: 0.72rem;
    color: var(--muted);
  }

  .gbp-input, .gbp-textarea {
    font-size: 0.97rem;
    color: var(--navy);
    background: var(--surface);
    border: 1.5px solid var(--border-strong);
    border-radius: 8px;
    padding: 12px 14px;
    transition: border-color 0.15s, box-shadow 0.15s;
    outline: none;
    width: 100%;
  }

  .gbp-input:focus, .gbp-textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(43,122,120,0.13);
  }

  .gbp-input::placeholder, .gbp-textarea::placeholder { color: var(--muted); }
  .gbp-textarea { resize: vertical; }
  .gbp-input-zip { max-width: 180px; }

  /* ── Policy panel ── */
  .gbp-policy-panel {
    background: var(--warn-bg);
    border: 1.5px solid var(--warn-border);
    border-radius: 8px;
    padding: 18px 20px;
    margin: 4px 0 24px;
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .gbp-policy-icon {
    flex-shrink: 0;
    width: 34px; height: 34px;
    background: rgba(232,200,107,0.22);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    color: #A0720A;
    margin-top: 1px;
  }

  .gbp-policy-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--warn-text);
    margin: 0 0 5px;
  }

  .gbp-policy-text {
    font-size: 0.86rem;
    color: var(--warn-text);
    line-height: 1.65;
    margin: 0;
    opacity: 0.88;
  }

  /* ── Card on file panel ── */
  .gbp-card-panel {
    background: var(--surface-alt);
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 22px;
    margin-bottom: 20px;
  }

  .gbp-card-panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }

  .gbp-card-panel-icon {
    width: 34px; height: 34px;
    border-radius: 8px;
    background: var(--accent);
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    flex-shrink: 0;
  }

  .gbp-card-panel-title {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--navy);
    margin: 0 0 2px;
  }

  .gbp-card-panel-sub {
    font-size: 0.78rem;
    color: var(--muted);
    margin: 0;
  }

  .gbp-demo-card-note {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--accent-light);
    border: 1.5px solid var(--accent-border);
    border-radius: 8px;
    padding: 12px 14px;
    margin: 0 0 18px;
    color: var(--accent-dark);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .gbp-demo-card-note button {
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    padding: 8px 10px;
    cursor: pointer;
    white-space: nowrap;
  }

  /* ── Checkbox row ── */
  .gbp-checkbox-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 15px 16px;
    border-radius: 8px;
    background: var(--accent-light);
    border: 1.5px solid var(--accent-border);
    margin-bottom: 4px;
    cursor: pointer;
  }

  .gbp-checkbox-row input[type="checkbox"] {
    width: 17px; height: 17px;
    flex-shrink: 0;
    accent-color: var(--accent);
    cursor: pointer;
    margin-top: 2px;
  }

  .gbp-checkbox-label {
    font-size: 0.87rem;
    color: var(--navy);
    line-height: 1.6;
  }

  /* ── Footer actions ── */
  .gbp-footer {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 24px;
    padding-top: 22px;
    border-top: 1px solid var(--border);
    align-items: center;
  }

  .gbp-spacer { flex: 1; }

  /* ── Buttons ── */
  .gbp-btn-primary {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 8px;
    min-height: 50px;
    padding: 0 26px;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 700;
    color: #fff;
    background: var(--accent);
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
    letter-spacing: 0.01em;
  }

  .gbp-btn-primary:hover:not(:disabled) {
    background: var(--accent-dark);
    box-shadow: 0 8px 22px rgba(47,138,125,0.2);
    transform: translateY(-1px);
  }

  .gbp-btn-primary:active:not(:disabled) { transform: translateY(0); }

  .gbp-btn-primary:disabled {
    opacity: 0.38;
    cursor: not-allowed;
    transform: none;
  }

  .gbp-btn-secondary {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 8px;
    min-height: 50px;
    padding: 0 22px;
    border-radius: 8px;
    font-size: 0.93rem;
    font-weight: 600;
    color: var(--navy);
    background: var(--surface);
    border: 1.5px solid var(--border-strong);
    cursor: pointer;
    text-decoration: none;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .gbp-btn-secondary:hover {
    border-color: var(--navy);
    background: var(--surface-alt);
  }

  /* ── Summary / confirm ── */
  .gbp-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }

  .gbp-summary-card {
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 18px;
    background: var(--surface-alt);
  }

  .gbp-summary-label {
    display: block;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 10px;
  }

  .gbp-summary-value {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.9rem;
    color: var(--slate);
    line-height: 1.45;
  }

  .gbp-summary-value strong {
    font-weight: 700;
    color: var(--navy);
    font-size: 0.95rem;
  }

  .gbp-summary-fee {
    margin-top: 4px;
    font-size: 0.8rem;
    color: var(--warn-text);
    font-weight: 500;
  }

  .gbp-reason-panel {
    background: var(--surface-alt);
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 18px 20px;
    margin-bottom: 18px;
  }

  .gbp-reason-label {
    display: block;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 7px;
  }

  .gbp-reason-text {
    font-size: 0.92rem;
    color: var(--navy);
    line-height: 1.65;
    margin: 0;
  }

  /* ── State cards (disabled/unavailable) ── */
  .gbp-state-card { padding: 12px 0 8px; }

  .gbp-state-card h1 {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--navy);
    margin: 0 0 10px;
  }

  .gbp-state-card p {
    color: var(--slate);
    line-height: 1.65;
    margin: 0 0 24px;
    max-width: 480px;
  }

  .gbp-state-actions { display: flex; gap: 12px; flex-wrap: wrap; }

  /* ── Loading ── */
  .gbp-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 64px 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .gbp-spinner {
    width: 32px; height: 32px;
    border: 2.5px solid var(--border);
    border-top-color: var(--navy);
    border-radius: 999px;
    animation: gbp-spin 0.7s linear infinite;
  }

  @keyframes gbp-spin { to { transform: rotate(360deg); } }

  /* ── Success screen ── */
  .gbp-success {
    text-align: center;
    padding: 12px 0 20px;
  }

  .gbp-success-icon-wrap {
    width: 80px; height: 80px;
    margin: 0 auto 26px;
  }

  .gbp-checkmark-circle {
    stroke: var(--success);
    stroke-width: 2;
    stroke-dasharray: 239;
    stroke-dashoffset: 239;
    stroke-linecap: round;
    fill: none;
    animation: gbp-circle 0.65s cubic-bezier(0.65, 0, 0.45, 1) forwards;
  }

  .gbp-checkmark-check {
    stroke: var(--success);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 60;
    stroke-dashoffset: 60;
    fill: none;
    animation: gbp-check 0.38s cubic-bezier(0.65, 0, 0.45, 1) 0.55s forwards;
  }

  @keyframes gbp-circle { to { stroke-dashoffset: 0; } }
  @keyframes gbp-check  { to { stroke-dashoffset: 0; } }

  .gbp-success-title {
    font-size: 2rem;
    font-weight: 700;
    color: var(--navy);
    margin: 0 0 12px;
    letter-spacing: -0.01em;
  }

  .gbp-success-sub {
    font-size: 0.95rem;
    color: var(--slate);
    line-height: 1.72;
    max-width: 480px;
    margin: 0 auto 28px;
  }

  .gbp-appt-summary {
    display: inline-block;
    text-align: left;
    background: var(--surface-alt);
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 20px 24px;
    margin: 0 auto 18px;
    min-width: 280px;
    max-width: 420px;
    width: 100%;
  }

  .gbp-appt-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 13px;
  }

  .gbp-appt-row:last-child { margin-bottom: 0; }

  .gbp-appt-key {
    font-size: 0.67rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .gbp-appt-val {
    font-size: 0.94rem;
    color: var(--navy);
    font-weight: 500;
    line-height: 1.4;
  }

  .gbp-confirmation-id {
    font-size: 0.78rem;
    color: var(--muted);
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    letter-spacing: 0.04em;
    margin: 0 0 28px;
  }

  .gbp-success-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  /* ── Guest-page overrides for shared scheduling widgets ── */
  .gbp .appointment-calendar,
  .gbp .time-slot-selector {
    border-color: var(--border);
    box-shadow: none;
    background: var(--surface);
  }

  .gbp .calendar-month-year,
  .gbp .selected-date h3 {
    color: var(--navy);
  }

  .gbp .calendar-nav-button:hover,
  .gbp .filter-button:hover {
    background: var(--surface-alt);
    color: var(--navy);
  }

  .gbp .calendar-day.available,
  .gbp .time-slot.available,
  .gbp .legend-indicator.available {
    border-color: var(--accent-border);
    background: var(--accent-light);
    color: var(--accent-dark);
  }

  .gbp .calendar-day.available:not(.disabled):hover,
  .gbp .time-slot.available:hover {
    border-color: var(--accent);
    background: #E2F2EE;
  }

  .gbp .calendar-day.selected,
  .gbp .time-slot.selected,
  .gbp .filter-button.active,
  .gbp .legend-indicator.selected {
    background: var(--accent) !important;
    border-color: var(--accent) !important;
    color: #fff !important;
    box-shadow: 0 6px 16px rgba(47,138,125,0.18);
  }

  .gbp .calendar-day.today:not(.selected) {
    border-color: var(--accent);
  }

  .gbp .calendar-day-indicator {
    background: var(--accent);
  }

  .gbp .time-slot:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-light);
    box-shadow: 0 4px 12px rgba(47,138,125,0.12);
  }

  .gbp .time-slot.selected:hover {
    background: var(--accent-dark) !important;
    border-color: var(--accent-dark) !important;
  }

  .gbp .loading-spinner {
    border-top-color: var(--accent);
  }

  .gbp .info-message {
    background: var(--accent-light);
    border-color: var(--accent-border);
    color: var(--accent-dark);
  }

  .gbp .info-message svg {
    color: var(--accent);
  }

  /* ── Responsive ── */
  @media (max-width: 680px) {
    .gbp-shell { padding: 16px 12px 60px; }
    .gbp-header { padding: 20px 22px; flex-direction: column; align-items: flex-start; gap: 10px; }
    .gbp-header-links { flex-direction: row; }
    .gbp-body { padding: 26px 22px 36px; }
    .gbp-hero-title { font-size: 1.85rem; }
    .gbp-form-grid { grid-template-columns: 1fr; }
    .gbp-form-field.full { grid-column: 1; }
    .gbp-input-zip { max-width: 100%; }
    .gbp-footer { flex-direction: column; }
    .gbp-footer .gbp-spacer { display: none; }
    .gbp-btn-primary, .gbp-btn-secondary { width: 100%; }
    .gbp-success-actions { flex-direction: column; align-items: center; }
    .gbp-summary-grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 480px) {
    .gbp-step-label { display: none; }
    .gbp-stepper { justify-content: space-around; }
  }
`;
