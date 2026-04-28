import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimeBlock } from '../../api';
import type {
  Appointment,
  AppointmentType,
  Availability,
  Location,
  Patient,
  Provider,
} from '../../types';
import { formatPhone } from '../../utils/export';

type FinderSearchMode = 'next_available' | 'specific_time' | 'time_window';
type FinderWeekdayPreference = 'Any Day' | 'Weekdays' | 'Weekends';
type FinderTimePreference = 'Anytime' | 'Morning' | 'Afternoon' | 'Evening';

interface AppointmentFinderSelection {
  patientId: string;
  providerId: string;
  locationId: string;
  appointmentTypeId: string;
  duration: number;
  date: string;
  time: string;
}

interface QuickCreatePatientDraft {
  firstName: string;
  lastName: string;
}

interface AppointmentFinderWorkspaceProps {
  patients: Patient[];
  providers: Provider[];
  locations: Location[];
  appointmentTypes: AppointmentType[];
  appointments: Appointment[];
  timeBlocks: TimeBlock[];
  availability: Availability[];
  defaultLocationId?: string;
  defaultProviderId?: string;
  onUseSlot: (selection: AppointmentFinderSelection) => void;
  onOpenExistingAppointment?: (appointment: Appointment) => void;
  onCreatePatient?: (draft: QuickCreatePatientDraft) => Promise<Patient | void> | Patient | void;
  onShowSuccess?: (message: string) => void;
  onShowError?: (message: string) => void;
}

interface FinderCriteria {
  quickSearch: string;
  patientId: string;
  providerId: string;
  locationId: string;
  appointmentTypeId: string;
  duration: string;
  searchMode: FinderSearchMode;
  preferredDate: string;
  preferredTime: string;
  windowStart: string;
  windowEnd: string;
  weekdayPreference: FinderWeekdayPreference;
  selectedWeekdays: number[];
  timePreference: FinderTimePreference;
}

interface FinderResult {
  id: string;
  providerId: string;
  providerName: string;
  locationId: string;
  locationName: string;
  appointmentTypeId: string;
  appointmentTypeName: string;
  duration: number;
  date: string;
  time: string;
  displayTime: string;
  matchLabel: string;
  score: number;
}

const SLOT_INTERVAL_MINUTES = 5;
const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 17 * 60;
const SEARCH_HORIZON_DAYS = 21;
const SPECIFIC_TIME_TOLERANCE_MINUTES = 120;
const RESULT_LIMIT = 12;
const SPECIFIC_WEEKDAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

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

function normalizeSearchValue(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function matchesQuery(parts: Array<string | undefined>, query: string): boolean {
  if (!query) return true;
  return parts.some((part) => normalizeSearchValue(part).includes(query));
}

function toSearchDateKey(value?: string | null): string {
  if (!value) return '';
  const date = parsePatientDate(value);
  if (!date) return value;
  return toLocalDateKey(date);
}

function toSearchDateNumeric(value?: string | null): string {
  if (!value) return '';
  const date = parsePatientDate(value);
  if (!date) return value;
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function parsePatientDate(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeLooseSearchValue(value?: string | null): string {
  return normalizeSearchValue(value).replace(/[^a-z0-9]/g, '');
}

function matchesPatientSearch(patient: Patient, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return false;

  const dob = patient.dob || patient.dateOfBirth;
  const parts = [
    patient.firstName,
    patient.lastName,
    patient.preferredName,
    `${patient.firstName || ''} ${patient.lastName || ''}`,
    `${patient.lastName || ''}, ${patient.firstName || ''}`,
    patient.phone,
    patient.mobilePhone,
    patient.homePhone,
    patient.email,
    patient.mrn,
    dob,
    formatPatientDob(dob),
    toSearchDateKey(dob),
    toSearchDateNumeric(dob),
  ];

  const searchableParts = parts.map(normalizeSearchValue).filter(Boolean);
  const looseParts = parts.map(normalizeLooseSearchValue).filter(Boolean);

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => {
      const looseToken = normalizeLooseSearchValue(token);
      return searchableParts.some((part) => part.includes(token)) ||
        (Boolean(looseToken) && looseParts.some((part) => part.includes(looseToken)));
    });
}

function orderSpecificWeekdays(selectedWeekdays: number[]): number[] {
  return SPECIFIC_WEEKDAY_OPTIONS.map((option) => option.value).filter((day) => selectedWeekdays.includes(day));
}

function weekdayMatches(date: Date, preference: FinderWeekdayPreference, selectedWeekdays: number[]): boolean {
  const dayOfWeek = date.getDay();
  if (selectedWeekdays.length > 0) return selectedWeekdays.includes(dayOfWeek);
  if (preference === 'Weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (preference === 'Weekends') return dayOfWeek === 0 || dayOfWeek === 6;
  return true;
}

function timePreferenceMatches(slotStart: number, preference: FinderTimePreference): boolean {
  if (preference === 'Anytime') return true;
  if (preference === 'Morning') return slotStart >= 8 * 60 && slotStart < 12 * 60;
  if (preference === 'Afternoon') return slotStart >= 12 * 60 && slotStart < 16 * 60;
  return slotStart >= 16 * 60;
}

function getDefaultAppointmentType(appointmentTypes: AppointmentType[]): AppointmentType | undefined {
  const activeTypes = appointmentTypes.filter((appointmentType) => appointmentType.isActive !== false);
  const cosmeticPattern = /botox|cosmetic|filler|laser|peel|aesthetic/i;
  const clinicalTypes = activeTypes.filter((appointmentType) => {
    const searchable = `${appointmentType.name || ''} ${appointmentType.category || ''}`;
    return !cosmeticPattern.test(searchable);
  });
  const preferredTypes = clinicalTypes.length > 0 ? clinicalTypes : activeTypes;
  const preferredPatterns = [/derm.*consult/i, /consult/i, /follow/i, /office visit/i, /new patient/i];

  for (const pattern of preferredPatterns) {
    const match = preferredTypes.find((appointmentType) => pattern.test(appointmentType.name || ''));
    if (match) return match;
  }

  return preferredTypes[0] || activeTypes[0];
}

function buildInitialCriteria(
  appointmentTypes: AppointmentType[],
  defaultLocationId?: string,
  defaultProviderId?: string
): FinderCriteria {
  const defaultAppointmentType = getDefaultAppointmentType(appointmentTypes);
  return {
    quickSearch: '',
    patientId: '',
    providerId: defaultProviderId || '',
    locationId: defaultLocationId || '',
    appointmentTypeId: defaultAppointmentType?.id || '',
    duration: defaultAppointmentType ? String(defaultAppointmentType.durationMinutes) : '30',
    searchMode: 'next_available',
    preferredDate: '',
    preferredTime: '10:00',
    windowStart: '09:00',
    windowEnd: '12:00',
    weekdayPreference: 'Any Day',
    selectedWeekdays: [],
    timePreference: 'Anytime',
  };
}

function getAvailabilityWindows(
  providerId: string,
  date: Date,
  availability: Availability[]
): Array<{ start: number; end: number }> {
  const dayOfWeek = date.getDay();
  const providerAvailabilities = availability.filter(
    (entry) => entry.providerId === providerId && entry.dayOfWeek === dayOfWeek
  );

  if (availability.length === 0 || providerAvailabilities.length === 0) {
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
}

function getBlockedRanges(
  providerId: string,
  dateKey: string,
  appointments: Appointment[],
  timeBlocks: TimeBlock[]
): Array<{ start: number; end: number }> {
  const appointmentRanges = appointments
    .filter((appointment) => {
      if (appointment.providerId !== providerId) return false;
      if (appointment.status === 'cancelled' || appointment.status === 'no_show') return false;
      return toLocalDateKey(new Date(appointment.scheduledStart)) === dateKey;
    })
    .map((appointment) => {
      const startDate = new Date(appointment.scheduledStart);
      const endDate = new Date(appointment.scheduledEnd);
      return {
        start: startDate.getHours() * 60 + startDate.getMinutes(),
        end: endDate.getHours() * 60 + endDate.getMinutes(),
      };
    })
    .filter((range) => range.end > range.start);

  const timeBlockRanges = timeBlocks
    .filter((block) => {
      if (block.providerId !== providerId) return false;
      if (block.status && block.status !== 'active') return false;
      return toLocalDateKey(new Date(block.startTime)) === dateKey;
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
}

function formatResultDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatPatientDob(value?: string | null): string {
  if (!value) return 'DOB unavailable';
  const date = parsePatientDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatAppointmentDateTime(startValue: string, endValue?: string): string {
  const startDate = new Date(startValue);
  const endDate = endValue ? new Date(endValue) : null;
  if (Number.isNaN(startDate.getTime())) return 'Date unavailable';

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(startDate);
  const startLabel = minutesToDisplay(startDate.getHours() * 60 + startDate.getMinutes());

  if (!endDate || Number.isNaN(endDate.getTime())) {
    return `${dateLabel} at ${startLabel}`;
  }

  const endLabel = minutesToDisplay(endDate.getHours() * 60 + endDate.getMinutes());
  return `${dateLabel}, ${startLabel} - ${endLabel}`;
}

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function AppointmentFinderWorkspace({
  patients,
  providers,
  locations,
  appointmentTypes,
  appointments,
  timeBlocks,
  availability,
  defaultLocationId,
  defaultProviderId,
  onUseSlot,
  onOpenExistingAppointment,
  onCreatePatient,
  onShowSuccess,
  onShowError,
}: AppointmentFinderWorkspaceProps) {
  const [criteria, setCriteria] = useState<FinderCriteria>(() =>
    buildInitialCriteria(appointmentTypes, defaultLocationId, defaultProviderId)
  );
  const [patientSearch, setPatientSearch] = useState('');
  const [localPatients, setLocalPatients] = useState<Patient[]>([]);
  const [showQuickCreatePatient, setShowQuickCreatePatient] = useState(false);
  const [quickCreatePatient, setQuickCreatePatient] = useState<QuickCreatePatientDraft>({
    firstName: '',
    lastName: '',
  });
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const quickSearch = normalizeSearchValue(criteria.quickSearch);
  const normalizedPatientSearch = normalizeSearchValue(patientSearch);
  const mergedPatients = useMemo(() => {
    const byId = new Map<string, Patient>();
    [...localPatients, ...patients].forEach((patient) => {
      byId.set(patient.id, patient);
    });
    return Array.from(byId.values());
  }, [localPatients, patients]);
  const selectedPatient = mergedPatients.find((patient) => patient.id === criteria.patientId) || null;
  const selectedProvider = providers.find((provider) => provider.id === criteria.providerId) || null;
  const selectedAppointmentType =
    appointmentTypes.find((appointmentType) => appointmentType.id === criteria.appointmentTypeId) || null;

  useEffect(() => {
    const defaultAppointmentType = getDefaultAppointmentType(appointmentTypes);
    if (!defaultAppointmentType) return;

    setCriteria((current) => {
      const selectedTypeStillExists = appointmentTypes.some(
        (appointmentType) => appointmentType.id === current.appointmentTypeId
      );
      if (selectedTypeStillExists) return current;

      return {
        ...current,
        appointmentTypeId: defaultAppointmentType.id,
        duration: String(defaultAppointmentType.durationMinutes),
      };
    });
  }, [appointmentTypes]);

  const locationOptions = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name)),
    [locations]
  );

  const patientOptions = useMemo(() => {
    if (!normalizedPatientSearch) return [];
    const sortedPatients = [...mergedPatients].sort((a, b) => {
      const left = `${a.lastName || ''}, ${a.firstName || ''}`;
      const right = `${b.lastName || ''}, ${b.firstName || ''}`;
      return left.localeCompare(right);
    });
    return sortedPatients
      .filter((patient) => matchesPatientSearch(patient, normalizedPatientSearch))
      .slice(0, 6);
  }, [mergedPatients, normalizedPatientSearch]);

  const providerOptions = useMemo(() => {
    return [...providers]
      .filter((provider) => matchesQuery([provider.fullName, provider.name], quickSearch))
      .sort((a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || ''));
  }, [providers, quickSearch]);

  const appointmentTypeOptions = useMemo(() => {
    return [...appointmentTypes]
      .filter((appointmentType) => matchesQuery([appointmentType.name], quickSearch))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [appointmentTypes, quickSearch]);

  const selectedPatientCurrentAppointments = useMemo(() => {
    if (!selectedPatient) return [];

    const today = startOfDay(new Date());

    return appointments
      .filter((appointment) => {
        if (appointment.patientId !== selectedPatient.id) return false;
        if (appointment.status === 'cancelled') return false;

        const appointmentStart = new Date(appointment.scheduledStart);
        if (Number.isNaN(appointmentStart.getTime())) return false;

        return startOfDay(appointmentStart).getTime() >= today.getTime();
      })
      .sort((left, right) => new Date(left.scheduledStart).getTime() - new Date(right.scheduledStart).getTime());
  }, [appointments, selectedPatient]);

  const searchResults = useMemo(() => {
    if (!selectedAppointmentType) return [];

    const duration = Math.max(5, Number(criteria.duration) || selectedAppointmentType.durationMinutes || 30);
    const providerPool = criteria.providerId
      ? providers.filter((provider) => provider.id === criteria.providerId)
      : providers;
    const locationId = criteria.locationId || defaultLocationId || locations[0]?.id || '';
    const locationName =
      locations.find((location) => location.id === locationId)?.name ||
      (locations.length === 1 ? locations[0].name : 'Selected location');
    const now = new Date();
    const today = startOfDay(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const baseDate = criteria.preferredDate
      ? startOfDay(new Date(`${criteria.preferredDate}T00:00:00`))
      : today;
    const desiredMinutes = parseTimeToMinutes(criteria.preferredTime);
    const windowStart = parseTimeToMinutes(criteria.windowStart);
    const windowEnd = parseTimeToMinutes(criteria.windowEnd);
    const results: FinderResult[] = [];
    const seenSlots = new Set<string>();

    for (let offset = 0; offset < SEARCH_HORIZON_DAYS; offset += 1) {
      const searchDate = new Date(baseDate);
      searchDate.setDate(baseDate.getDate() + offset);
      if (searchDate < today) continue;
      if (!weekdayMatches(searchDate, criteria.weekdayPreference, criteria.selectedWeekdays)) continue;

      const dateKey = toLocalDateKey(searchDate);
      const isToday = dateKey === toLocalDateKey(today);

      for (const provider of providerPool) {
        const windows = getAvailabilityWindows(provider.id, searchDate, availability);
        if (windows.length === 0) continue;
        const blockedRanges = getBlockedRanges(provider.id, dateKey, appointments, timeBlocks);

        for (const window of windows) {
          const latestStart = window.end - duration;
          for (let slotStart = window.start; slotStart <= latestStart; slotStart += SLOT_INTERVAL_MINUTES) {
            if (isToday && slotStart < currentMinutes) continue;
            const slotEnd = slotStart + duration;
            const overlapsBlock = blockedRanges.some((range) =>
              rangesOverlap(slotStart, slotEnd, range.start, range.end)
            );
            if (overlapsBlock) continue;

            let matchLabel = 'Next available';
            let score = offset * 10_000 + slotStart;

            if (criteria.searchMode === 'next_available') {
              if (!timePreferenceMatches(slotStart, criteria.timePreference)) continue;
            }

            if (criteria.searchMode === 'specific_time') {
              if (desiredMinutes === null) continue;
              const distance = Math.abs(slotStart - desiredMinutes);
              if (distance > SPECIFIC_TIME_TOLERANCE_MINUTES) continue;
              matchLabel = distance === 0 ? 'Exact time match' : `${distance} min from requested time`;
              const preferredDatePenalty = criteria.preferredDate && dateKey !== criteria.preferredDate ? 5_000 : 0;
              score = preferredDatePenalty + offset * 2_000 + distance;
            }

            if (criteria.searchMode === 'time_window') {
              if (windowStart === null || windowEnd === null || windowEnd <= windowStart) continue;
              if (slotStart < windowStart || slotEnd > windowEnd) continue;
              matchLabel = `${minutesToDisplay(windowStart)} - ${minutesToDisplay(windowEnd)}`;
              score = offset * 10_000 + slotStart;
            }

            const resultId = [
              provider.id,
              locationId,
              selectedAppointmentType.id,
              dateKey,
              slotStart,
              duration,
            ].join('-');
            if (seenSlots.has(resultId)) continue;
            seenSlots.add(resultId);

            results.push({
              id: resultId,
              providerId: provider.id,
              providerName: provider.fullName || provider.name || 'Provider',
              locationId,
              locationName,
              appointmentTypeId: selectedAppointmentType.id,
              appointmentTypeName: selectedAppointmentType.name,
              duration,
              date: dateKey,
              time: minutesToTimeValue(slotStart),
              displayTime: minutesToDisplay(slotStart),
              matchLabel,
              score,
            });
          }
        }
      }
    }

    return results.sort((left, right) => left.score - right.score).slice(0, RESULT_LIMIT);
  }, [
    appointments,
    availability,
    criteria.duration,
    criteria.locationId,
    criteria.preferredDate,
    criteria.preferredTime,
    criteria.providerId,
    criteria.searchMode,
    criteria.selectedWeekdays,
    criteria.timePreference,
    criteria.weekdayPreference,
    criteria.windowEnd,
    criteria.windowStart,
    defaultLocationId,
    locations,
    providers,
    selectedAppointmentType,
    timeBlocks,
  ]);

  const resultSummary = useMemo(() => {
    if (!searchAttempted) return 'Choose a visit type, tune the timing, and search for real openings.';
    if (searchResults.length === 0) return 'No matching openings found. Widen the time rules or remove provider restrictions.';
    return `${searchResults.length} opening${searchResults.length === 1 ? '' : 's'} ready to book.`;
  }, [searchAttempted, searchResults.length]);

  const handleSearch = () => {
    if (!selectedAppointmentType) {
      onShowError?.(
        appointmentTypes.length === 0
          ? 'Appointment types are still loading. Refresh live data and try again.'
          : 'Select an appointment type first.'
      );
      return;
    }

    setSearchAttempted(true);
    if (searchResults.length === 0) {
      onShowError?.('No matching available times found. Try widening the search criteria.');
    } else {
      onShowSuccess?.(`Found ${searchResults.length} available ${searchResults.length === 1 ? 'slot' : 'slots'}.`);
    }
    window.requestAnimationFrame(() => {
      const resultsNode = resultsRef.current;
      if (resultsNode && typeof resultsNode.scrollIntoView === 'function') {
        resultsNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const handleReset = () => {
    setCriteria(buildInitialCriteria(appointmentTypes, defaultLocationId, defaultProviderId));
    setPatientSearch('');
    setSearchAttempted(false);
  };

  const handleSelectPatient = (patient: Patient) => {
    setCriteria((current) => ({ ...current, patientId: patient.id }));
    setPatientSearch(`${patient.lastName}, ${patient.firstName}`);
    setShowQuickCreatePatient(false);
    setQuickCreatePatient({ firstName: '', lastName: '' });
  };

  const handleWeekdayPreferenceChange = (weekdayPreference: FinderWeekdayPreference) => {
    setCriteria((current) => ({ ...current, weekdayPreference, selectedWeekdays: [] }));
  };

  const handleToggleSpecificWeekday = (weekday: number) => {
    setCriteria((current) => {
      const selectedWeekdays = current.selectedWeekdays.includes(weekday)
        ? current.selectedWeekdays.filter((selectedWeekday) => selectedWeekday !== weekday)
        : orderSpecificWeekdays([...current.selectedWeekdays, weekday]);

      return {
        ...current,
        weekdayPreference: selectedWeekdays.length > 0 ? 'Any Day' : current.weekdayPreference,
        selectedWeekdays,
      };
    });
  };

  const handleQuickCreatePatient = async () => {
    if (!onCreatePatient) return;

    const firstName = quickCreatePatient.firstName.trim();
    const lastName = quickCreatePatient.lastName.trim();

    if (!firstName || !lastName) {
      onShowError?.('Enter first and last name to add the patient.');
      return;
    }

    setCreatingPatient(true);
    try {
      const createdPatient = await onCreatePatient({ firstName, lastName });
      if (createdPatient?.id) {
        setLocalPatients((current) => [createdPatient, ...current.filter((patient) => patient.id !== createdPatient.id)]);
        handleSelectPatient(createdPatient);
      } else {
        setPatientSearch(`${lastName}, ${firstName}`);
      }
      setShowQuickCreatePatient(false);
      setQuickCreatePatient({ firstName: '', lastName: '' });
      onShowSuccess?.(`Added ${firstName} ${lastName}. Continue scheduling.`);
    } catch (error: any) {
      onShowError?.(error?.message || 'Failed to add patient.');
    } finally {
      setCreatingPatient(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem', padding: '0.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: '1.25rem' }}>
        <section
          style={{
            display: 'grid',
            gap: '1rem',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '20px',
            padding: '1.25rem',
            boxShadow: '0 14px 32px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              1. Patient
            </div>
            <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.75rem' }}>
              <div style={{ color: '#334155', fontSize: '0.95rem' }}>
                Search by name, DOB, phone, MRN, or email. If they are not in the system yet, add them here with just first and last name, then finish the rest later.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  value={patientSearch}
                  onChange={(event) => {
                    setPatientSearch(event.target.value);
                    if (criteria.patientId) {
                      setCriteria((current) => ({ ...current, patientId: '' }));
                    }
                  }}
                  placeholder="Search patient name or birthday, e.g. Mason 5/15/1990"
                  aria-label="Search patient by name or date of birth"
                  style={{
                    width: '100%',
                    padding: '0.9rem 1rem',
                    borderRadius: '14px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '0.98rem',
                    color: '#0f172a',
                    boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                />
                {onCreatePatient ? (
                  <button
                    type="button"
                    onClick={() => setShowQuickCreatePatient((current) => !current)}
                    style={{
                      border: 'none',
                      borderRadius: '14px',
                      padding: '0.9rem 1rem',
                      background: '#0f766e',
                      color: '#ffffff',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + New Patient
                  </button>
                ) : null}
              </div>
              {onCreatePatient && showQuickCreatePatient ? (
                <div
                  style={{
                    display: 'grid',
                    gap: '0.75rem',
                    borderRadius: '16px',
                    border: '1px solid #99f6e4',
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #f8fafc 100%)',
                    padding: '1rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, color: '#0f172a' }}>Quick add patient</div>
                    <div style={{ marginTop: '0.2rem', color: '#475569', fontSize: '0.9rem' }}>
                      Save first and last name now, schedule the visit, and fill in DOB, phone, insurance, and the rest later.
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
                    <input
                      value={quickCreatePatient.firstName}
                      onChange={(event) => setQuickCreatePatient((current) => ({ ...current, firstName: event.target.value }))}
                      placeholder="First name"
                      aria-label="Quick add patient first name"
                      style={{
                        width: '100%',
                        padding: '0.85rem 0.95rem',
                        borderRadius: '12px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        fontSize: '0.95rem',
                        color: '#0f172a',
                      }}
                    />
                    <input
                      value={quickCreatePatient.lastName}
                      onChange={(event) => setQuickCreatePatient((current) => ({ ...current, lastName: event.target.value }))}
                      placeholder="Last name"
                      aria-label="Quick add patient last name"
                      style={{
                        width: '100%',
                        padding: '0.85rem 0.95rem',
                        borderRadius: '12px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        fontSize: '0.95rem',
                        color: '#0f172a',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void handleQuickCreatePatient()}
                      disabled={creatingPatient}
                      style={{
                        border: 'none',
                        borderRadius: '12px',
                        padding: '0.8rem 1rem',
                        background: '#0f766e',
                        color: '#ffffff',
                        fontWeight: 800,
                        cursor: creatingPatient ? 'wait' : 'pointer',
                        opacity: creatingPatient ? 0.75 : 1,
                      }}
                    >
                      {creatingPatient ? 'Adding...' : 'Add and Schedule'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickCreatePatient(false);
                        setQuickCreatePatient({ firstName: '', lastName: '' });
                      }}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '0.8rem 1rem',
                        background: '#ffffff',
                        color: '#334155',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedPatient ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    border: '1px solid #99f6e4',
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #f8fafc 100%)',
                    borderRadius: '16px',
                    padding: '0.95rem 1rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>
                      Scheduling for {selectedPatient.firstName} {selectedPatient.lastName}
                    </div>
                    <div style={{ marginTop: '0.2rem', fontSize: '0.88rem', color: '#475569' }}>
                      DOB {formatPatientDob(selectedPatient.dob || selectedPatient.dateOfBirth)}
                      {formatPhone(selectedPatient.mobilePhone || selectedPatient.phone || selectedPatient.homePhone || '')
                        ? ` • ${formatPhone(selectedPatient.mobilePhone || selectedPatient.phone || selectedPatient.homePhone || '')}`
                        : ''}
                      {selectedPatient.mrn ? ` • MRN ${selectedPatient.mrn}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCriteria((current) => ({ ...current, patientId: '' }));
                      setPatientSearch('');
                    }}
                    style={{
                      border: 'none',
                      background: '#ffffff',
                      color: '#0f172a',
                      borderRadius: '999px',
                      padding: '0.55rem 0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              {selectedPatient ? (
                <div
                  style={{
                    display: 'grid',
                    gap: '0.75rem',
                    border: '1px solid #bfdbfe',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
                    borderRadius: '18px',
                    padding: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 900, color: '#0f172a' }}>Current appointments</div>
                      <div style={{ marginTop: '0.2rem', color: '#475569', fontSize: '0.9rem' }}>
                        Shows appointments from today forward, including no-shows from today.
                      </div>
                    </div>
                    <div
                      style={{
                        alignSelf: 'start',
                        borderRadius: '999px',
                        background: '#dbeafe',
                        color: '#1e40af',
                        padding: '0.35rem 0.7rem',
                        fontWeight: 900,
                        fontSize: '0.82rem',
                      }}
                    >
                      {selectedPatientCurrentAppointments.length} found
                    </div>
                  </div>

                  {selectedPatientCurrentAppointments.length === 0 ? (
                    <div style={{ borderRadius: '14px', background: '#f8fafc', color: '#64748b', padding: '0.85rem' }}>
                      No current or future appointments are scheduled for this patient.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                      {selectedPatientCurrentAppointments.slice(0, 5).map((appointment) => {
                        const providerName =
                          appointment.providerName ||
                          providers.find((provider) => provider.id === appointment.providerId)?.fullName ||
                          providers.find((provider) => provider.id === appointment.providerId)?.name ||
                          'Provider not assigned';
                        const locationName =
                          appointment.locationName ||
                          locations.find((location) => location.id === appointment.locationId)?.name ||
                          'Location not assigned';
                        const appointmentTypeName =
                          appointment.appointmentTypeName ||
                          appointmentTypes.find((appointmentType) => appointmentType.id === appointment.appointmentTypeId)?.name ||
                          'Appointment';

                        return (
                          <div
                            key={appointment.id}
                            onClick={() => onOpenExistingAppointment?.(appointment)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onOpenExistingAppointment?.(appointment);
                              }
                            }}
                            role={onOpenExistingAppointment ? 'button' : undefined}
                            tabIndex={onOpenExistingAppointment ? 0 : undefined}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(0, 1fr) auto',
                              gap: '0.75rem',
                              alignItems: 'center',
                              borderRadius: '16px',
                              border: '1px solid #dbeafe',
                              background: '#ffffff',
                              padding: '0.85rem',
                              cursor: onOpenExistingAppointment ? 'pointer' : 'default',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900, color: '#0f172a' }}>
                                {formatAppointmentDateTime(appointment.scheduledStart, appointment.scheduledEnd)}
                              </div>
                              <div style={{ marginTop: '0.25rem', color: '#475569', fontSize: '0.9rem' }}>
                                {appointmentTypeName} • {providerName} • {locationName}
                              </div>
                              <div style={{ marginTop: '0.3rem' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    borderRadius: '999px',
                                    background: appointment.status === 'no_show' ? '#fee2e2' : '#ecfeff',
                                    color: appointment.status === 'no_show' ? '#991b1b' : '#155e75',
                                    padding: '0.25rem 0.55rem',
                                    fontSize: '0.78rem',
                                    fontWeight: 900,
                                  }}
                                >
                                  {formatStatusLabel(appointment.status)}
                                </span>
                              </div>
                            </div>
                            {onOpenExistingAppointment ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenExistingAppointment(appointment);
                                }}
                                style={{
                                  border: '1px solid #93c5fd',
                                  borderRadius: '12px',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  padding: '0.65rem 0.8rem',
                                  cursor: 'pointer',
                                  fontWeight: 900,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Open appointment
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {selectedPatientCurrentAppointments.length > 5 ? (
                        <div style={{ color: '#64748b', fontSize: '0.88rem', fontWeight: 700 }}>
                          Showing first 5. Open Schedule for the full appointment history.
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
              <div
                style={{
                  display: 'grid',
                  gap: '0.6rem',
                  paddingRight: '0.2rem',
                }}
              >
                {!normalizedPatientSearch ? (
                  <div style={{ padding: '0.9rem', borderRadius: '12px', background: '#f8fafc', color: '#64748b' }}>
                    Start typing a patient name or birthday to search. No long patient list shown by default.
                  </div>
                ) : patientOptions.length === 0 ? (
                  <div style={{ padding: '0.9rem', borderRadius: '12px', background: '#f8fafc', color: '#64748b' }}>
                    No patient matches that search. Use New Patient if this person is not registered yet.
                  </div>
                ) : (
                  patientOptions.map((patient) => {
                    const isSelected = patient.id === criteria.patientId;
                    const dob = formatPatientDob(patient.dob || patient.dateOfBirth);
                    const phone = formatPhone(patient.mobilePhone || patient.phone || patient.homePhone || '');
                    return (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => handleSelectPatient(patient)}
                        style={{
                          textAlign: 'left',
                          borderRadius: '16px',
                          border: isSelected ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
                          background: isSelected ? '#f0f9ff' : '#ffffff',
                          padding: '0.9rem 1rem',
                          cursor: 'pointer',
                          boxShadow: isSelected ? '0 10px 24px rgba(14, 165, 233, 0.12)' : 'none',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>
                          {patient.lastName}, {patient.firstName}
                        </div>
                        <div style={{ marginTop: '0.2rem', fontSize: '0.88rem', color: '#475569' }}>
                          {dob}
                          {phone ? ` • ${phone}` : ''}
                          {patient.mrn ? ` • MRN ${patient.mrn}` : ''}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              2. Visit Type
            </div>
            <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {appointmentTypeOptions.map((appointmentType) => {
                const isSelected = appointmentType.id === criteria.appointmentTypeId;
                return (
                  <button
                    key={appointmentType.id}
                    type="button"
                    onClick={() =>
                      setCriteria((current) => ({
                        ...current,
                        appointmentTypeId: appointmentType.id,
                        duration: String(appointmentType.durationMinutes),
                      }))
                    }
                    style={{
                      textAlign: 'left',
                      borderRadius: '16px',
                      border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                      background: isSelected ? 'linear-gradient(135deg, #e0f2fe 0%, #f8fafc 100%)' : '#ffffff',
                      padding: '1rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{appointmentType.name}</div>
                    <div style={{ marginTop: '0.25rem', color: '#475569', fontSize: '0.9rem' }}>
                      {appointmentType.durationMinutes} min default
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '1rem',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '20px',
            padding: '1.25rem',
            boxShadow: '0 14px 32px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              3. Filters and Timing
            </div>
            <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                  Location
                  <select
                    value={criteria.locationId}
                    onChange={(event) => setCriteria((current) => ({ ...current, locationId: event.target.value }))}
                    style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    <option value="">Any location</option>
                    {locationOptions.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                  Duration (minutes)
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={criteria.duration}
                    onChange={(event) => setCriteria((current) => ({ ...current, duration: event.target.value }))}
                    style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ color: '#334155', fontWeight: 600 }}>Provider</label>
                  {selectedProvider ? (
                    <button
                      type="button"
                      onClick={() => setCriteria((current) => ({ ...current, providerId: '' }))}
                      style={{ border: 'none', background: 'transparent', color: '#0284c7', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Any provider
                    </button>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                  <button
                    type="button"
                    onClick={() => setCriteria((current) => ({ ...current, providerId: '' }))}
                    style={{
                      borderRadius: '999px',
                      border: !criteria.providerId ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      background: !criteria.providerId ? '#e0f2fe' : '#ffffff',
                      padding: '0.55rem 0.9rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: '#0f172a',
                    }}
                  >
                    Any provider
                  </button>
                  {providerOptions.map((provider) => {
                    const isSelected = provider.id === criteria.providerId;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => setCriteria((current) => ({ ...current, providerId: provider.id }))}
                        style={{
                          borderRadius: '999px',
                          border: isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: isSelected ? '#e0f2fe' : '#ffffff',
                          padding: '0.55rem 0.9rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                          color: '#0f172a',
                        }}
                      >
                        {provider.fullName || provider.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.55rem' }}>
                <div style={{ color: '#334155', fontWeight: 600 }}>Search mode</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  {[
                    { value: 'next_available' as const, label: 'Next available' },
                    { value: 'specific_time' as const, label: 'Specific time' },
                    { value: 'time_window' as const, label: 'Time window' },
                  ].map((mode) => {
                    const isActive = criteria.searchMode === mode.value;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setCriteria((current) => ({ ...current, searchMode: mode.value }))}
                        style={{
                          borderRadius: '999px',
                          border: isActive ? '2px solid #0ea5e9' : '1px solid #cbd5e1',
                          background: isActive ? '#ecfeff' : '#ffffff',
                          padding: '0.65rem 1rem',
                          cursor: 'pointer',
                          fontWeight: 700,
                          color: '#0f172a',
                        }}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {criteria.searchMode === 'next_available' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                    Time of day
                    <select
                      value={criteria.timePreference}
                      onChange={(event) =>
                        setCriteria((current) => ({ ...current, timePreference: event.target.value as FinderTimePreference }))
                      }
                      style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="Anytime">Anytime</option>
                      <option value="Morning">Morning</option>
                      <option value="Afternoon">Afternoon</option>
                      <option value="Evening">Evening</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                    Days
                    <select
                      value={criteria.weekdayPreference}
                      onChange={(event) =>
                        handleWeekdayPreferenceChange(event.target.value as FinderWeekdayPreference)
                      }
                      style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="Any Day">Any day</option>
                      <option value="Weekdays">Weekdays only</option>
                      <option value="Weekends">Weekends only</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {criteria.searchMode === 'specific_time' ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                      Preferred time
                      <input
                        type="time"
                        value={criteria.preferredTime}
                        onChange={(event) => setCriteria((current) => ({ ...current, preferredTime: event.target.value }))}
                        style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                      Preferred date
                      <input
                        type="date"
                        value={criteria.preferredDate}
                        onChange={(event) => setCriteria((current) => ({ ...current, preferredDate: event.target.value }))}
                        style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                      />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                    Days
                    <select
                      value={criteria.weekdayPreference}
                      onChange={(event) =>
                        handleWeekdayPreferenceChange(event.target.value as FinderWeekdayPreference)
                      }
                      style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      <option value="Any Day">Any day</option>
                      <option value="Weekdays">Weekdays only</option>
                      <option value="Weekends">Weekends only</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {criteria.searchMode === 'time_window' ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                      Window start
                      <input
                        type="time"
                        value={criteria.windowStart}
                        onChange={(event) => setCriteria((current) => ({ ...current, windowStart: event.target.value }))}
                        style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                      Window end
                      <input
                        type="time"
                        value={criteria.windowEnd}
                        onChange={(event) => setCriteria((current) => ({ ...current, windowEnd: event.target.value }))}
                        style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                      Start searching on
                      <input
                        type="date"
                        value={criteria.preferredDate}
                        onChange={(event) => setCriteria((current) => ({ ...current, preferredDate: event.target.value }))}
                        style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontWeight: 600 }}>
                      Days
                      <select
                        value={criteria.weekdayPreference}
                        onChange={(event) =>
                          handleWeekdayPreferenceChange(event.target.value as FinderWeekdayPreference)
                        }
                        style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff' }}
                      >
                        <option value="Any Day">Any day</option>
                        <option value="Weekdays">Weekdays only</option>
                        <option value="Weekends">Weekends only</option>
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  display: 'grid',
                  gap: '0.65rem',
                  border: '1px solid #dbeafe',
                  background: '#f8fafc',
                  borderRadius: '16px',
                  padding: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#334155', fontWeight: 800 }}>Specific days</div>
                    <div style={{ marginTop: '0.2rem', color: '#64748b', fontSize: '0.86rem' }}>
                      Pick one or more days, like only Tuesday. Specific days override the Days dropdown.
                    </div>
                  </div>
                  {criteria.selectedWeekdays.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setCriteria((current) => ({ ...current, selectedWeekdays: [] }))}
                      style={{
                        border: 'none',
                        background: '#ffffff',
                        color: '#0284c7',
                        borderRadius: '999px',
                        padding: '0.45rem 0.75rem',
                        cursor: 'pointer',
                        fontWeight: 700,
                        alignSelf: 'start',
                      }}
                    >
                      Clear days
                    </button>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {SPECIFIC_WEEKDAY_OPTIONS.map((weekday) => {
                    const isSelected = criteria.selectedWeekdays.includes(weekday.value);
                    return (
                      <button
                        key={weekday.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleToggleSpecificWeekday(weekday.value)}
                        style={{
                          borderRadius: '999px',
                          border: isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: isSelected ? '#e0f2fe' : '#ffffff',
                          color: '#0f172a',
                          padding: '0.55rem 0.8rem',
                          cursor: 'pointer',
                          fontWeight: 800,
                          minWidth: '52px',
                        }}
                      >
                        {weekday.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={handleSearch}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderRadius: '14px',
                    padding: '0.95rem 1rem',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0f766e 100%)',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 16px 30px rgba(2, 132, 199, 0.22)',
                  }}
                >
                  Search openings
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '14px',
                    padding: '0.95rem 1rem',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section
        ref={resultsRef}
        style={{
          display: 'grid',
          gap: '1rem',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '20px',
          padding: '1.25rem',
          boxShadow: '0 14px 32px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              4. Available Openings
            </div>
            <h3 style={{ margin: '0.35rem 0 0', color: '#0f172a' }}>Bookable results</h3>
          </div>
          <div style={{ color: '#475569', fontWeight: 600 }}>{resultSummary}</div>
        </div>

        {!searchAttempted ? (
          <div style={{ padding: '1rem', borderRadius: '16px', background: '#f8fafc', color: '#64748b' }}>
            Search when you are ready. Results show exact openings, not just filters.
          </div>
        ) : null}

        {searchAttempted && searchResults.length === 0 ? (
          <div style={{ padding: '1rem', borderRadius: '16px', background: '#fff7ed', color: '#9a3412' }}>
            Nothing matched the current rules. Remove the provider restriction, broaden the time, or switch to next available.
          </div>
        ) : null}

        {searchAttempted && searchResults.length > 0 ? (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {searchResults.map((result) => (
              <div
                key={result.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, 150px) minmax(0, 1fr) auto',
                  gap: '1rem',
                  alignItems: 'center',
                  borderRadius: '18px',
                  border: '1px solid #dbeafe',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
                  padding: '1rem 1.1rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {formatResultDate(result.date)}
                  </div>
                  <div style={{ marginTop: '0.25rem', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    {result.displayTime}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{result.providerName}</div>
                  <div style={{ color: '#475569' }}>
                    {result.locationName} • {result.appointmentTypeName} • {result.duration} min
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#0369a1', fontWeight: 700 }}>{result.matchLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUseSlot({
                      patientId: criteria.patientId,
                      providerId: result.providerId,
                      locationId: result.locationId,
                      appointmentTypeId: result.appointmentTypeId,
                      duration: result.duration,
                      date: result.date,
                      time: result.time,
                    })
                  }
                  style={{
                    border: 'none',
                    borderRadius: '14px',
                    padding: '0.85rem 1rem',
                    background: '#0f766e',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: 'pointer',
                    minWidth: '130px',
                  }}
                >
                  Use this slot
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
