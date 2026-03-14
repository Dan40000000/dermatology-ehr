import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal, ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate, formatPhone } from '../utils/export';
import { Calendar } from '../components/schedule/Calendar';
import { AppointmentModal, type AppointmentFormData } from '../components/schedule/AppointmentModal';
import { TimeBlockModal, type TimeBlockFormData } from '../components/schedule/TimeBlockModal';
import { RescheduleModal, type RescheduleFormData } from '../components/schedule/RescheduleModal';
import {
  fetchAppointments,
  fetchFrontDeskSchedule,
  fetchPriorAuths,
  fetchProviders,
  fetchLocations,
  fetchAppointmentTypes,
  fetchAvailability,
  fetchPatients,
  updateAppointmentStatus,
  checkInFrontDeskAppointment,
  updatePatientFlowStatus,
  createAppointment,
  createEncounter,
  fetchPatientEncounters,
  rescheduleAppointment,
  fetchTimeBlocks,
  createTimeBlock,
  updateTimeBlock,
  deleteTimeBlock,
  type TimeBlock,
  type FrontDeskCheckInOptions,
  type FrontDeskCheckInResponse,
} from '../api';
import type { Appointment, Provider, Location, AppointmentType, Availability, Patient, ConflictInfo } from '../types';
import { setActiveEncounter } from '../utils/activeEncounter';
import { ensureKioskContext } from '../utils/kioskContext';

type ScheduleViewMode = 'day' | 'week' | 'month';

function isLaserAppointmentType(appointmentTypeName?: string): boolean {
  return /laser/i.test(appointmentTypeName || '');
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function getViewRange(
  currentDate: Date,
  viewMode: ScheduleViewMode,
  showWeekends: boolean
): { start: Date; end: Date } {
  if (viewMode === 'day') {
    return {
      start: startOfDay(currentDate),
      end: endOfDay(currentDate),
    };
  }

  if (viewMode === 'week') {
    const monday = startOfDay(currentDate);
    const dayOfWeek = monday.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(monday.getDate() + diffToMonday);
    const weekEnd = endOfDay(monday);
    weekEnd.setDate(monday.getDate() + (showWeekends ? 6 : 4));
    return {
      start: monday,
      end: weekEnd,
    };
  }

  const monthStart = startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  monthStart.setDate(monthStart.getDate() - 7);
  const monthEnd = endOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
  monthEnd.setDate(monthEnd.getDate() + 14);
  return {
    start: monthStart,
    end: monthEnd,
  };
}

function buildCheckInMessage(
  result: {
    copayAmount?: number;
    copayDisposition?: 'none' | 'collected' | 'deferred';
    copayCollectedAmountCents?: number;
    outstandingBalanceCollectedAmountCents?: number;
    totalCollectedAmountCents?: number;
    paymentReceiptNumber?: string;
    paymentConfirmationEmailSent?: boolean;
    paymentConfirmationEmailAddress?: string;
  },
  patientName?: string
): string {
  const base = patientName ? `${patientName} checked in` : 'Patient checked in';
  const copayAmount =
    typeof result.copayAmount === 'number' && Number.isFinite(result.copayAmount)
      ? result.copayAmount
      : 0;
  const collectedAmount =
    typeof result.copayCollectedAmountCents === 'number' && Number.isFinite(result.copayCollectedAmountCents)
      ? result.copayCollectedAmountCents / 100
      : 0;
  const outstandingCollectedAmount =
    typeof result.outstandingBalanceCollectedAmountCents === 'number' &&
    Number.isFinite(result.outstandingBalanceCollectedAmountCents)
      ? result.outstandingBalanceCollectedAmountCents / 100
      : 0;
  const totalCollectedAmount =
    typeof result.totalCollectedAmountCents === 'number' && Number.isFinite(result.totalCollectedAmountCents)
      ? result.totalCollectedAmountCents / 100
      : collectedAmount + outstandingCollectedAmount;

  if (result.copayDisposition === 'collected') {
    const statusParts = [`${base}. Payment collected: $${totalCollectedAmount.toFixed(2)}.`];
    if (collectedAmount > 0 && outstandingCollectedAmount > 0) {
      statusParts.push(
        `Included copay $${collectedAmount.toFixed(2)} and past balance $${outstandingCollectedAmount.toFixed(2)}.`
      );
    } else if (collectedAmount > 0) {
      statusParts.push(`Copay collected: $${collectedAmount.toFixed(2)}.`);
    } else if (outstandingCollectedAmount > 0) {
      statusParts.push(`Applied to past balance: $${outstandingCollectedAmount.toFixed(2)}.`);
    }
    if (result.paymentReceiptNumber) {
      statusParts.push(`Receipt: ${result.paymentReceiptNumber}.`);
    }
    if (result.paymentConfirmationEmailSent && result.paymentConfirmationEmailAddress) {
      statusParts.push(`Confirmation emailed to ${result.paymentConfirmationEmailAddress}.`);
    } else if (result.paymentConfirmationEmailSent) {
      statusParts.push('Confirmation email sent.');
    } else if (result.paymentConfirmationEmailAddress) {
      statusParts.push(`Confirmation email failed to send to ${result.paymentConfirmationEmailAddress}.`);
    } else {
      statusParts.push('No patient email on file for confirmation.');
    }
    return statusParts.join(' ');
  }

  if (result.copayDisposition === 'deferred' && copayAmount > 0) {
    return `${base}. Copay deferred to checkout: $${copayAmount.toFixed(2)}.`;
  }

  if (copayAmount > 0) {
    return `${base}. Copay due now: $${copayAmount.toFixed(2)}`;
  }

  return `${base}. No copay due now.`;
}

type CopayBypassReason =
  | 'pay_at_checkout'
  | 'no_wallet'
  | 'financial_hardship'
  | 'insurance_issue'
  | 'other';

const COPAY_BYPASS_REASON_LABELS: Record<CopayBypassReason, string> = {
  pay_at_checkout: 'Will pay at checkout',
  no_wallet: "Didn't bring wallet",
  financial_hardship: 'Financial hardship',
  insurance_issue: 'Insurance verification issue',
  other: 'Other',
};

const NO_SHOW_CHECK_IN_GRACE_MINUTES = 15;

type PriorAuthUiStatus =
  | 'not_required'
  | 'missing'
  | 'approved'
  | 'pending'
  | 'submitted'
  | 'appealed'
  | 'more_info_needed'
  | 'denied'
  | 'draft'
  | 'expired'
  | 'cancelled'
  | 'unknown';

interface PriorAuthListItem {
  id: string;
  patient_id: string;
  status?: string;
  auth_number?: string | null;
  insurance_auth_number?: string | null;
  updated_at?: string;
  created_at?: string;
}

interface PriorAuthSnapshot {
  required: boolean;
  status: PriorAuthUiStatus;
  onFile: boolean;
  actionNeeded: boolean;
  authId?: string;
  authNumber?: string;
}

const PRIOR_AUTH_REQUIRED_APPOINTMENT_PATTERN =
  /(laser|mohs|surgery|biopsy|excision|graft|procedure|resurfacing|tattoo|hair\s*removal|hydrafacial)/i;

function normalizePriorAuthPayload(payload: unknown): PriorAuthListItem[] {
  if (Array.isArray(payload)) return payload as PriorAuthListItem[];
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data as PriorAuthListItem[];
  if (Array.isArray(record.priorAuths)) return record.priorAuths as PriorAuthListItem[];
  if (Array.isArray(record.items)) return record.items as PriorAuthListItem[];
  return [];
}

function inferPriorAuthRequired(appointmentTypeName?: string): boolean {
  return PRIOR_AUTH_REQUIRED_APPOINTMENT_PATTERN.test(appointmentTypeName || '');
}

function normalizePriorAuthStatus(rawStatus?: string): PriorAuthUiStatus {
  const normalized = (rawStatus || '').trim().toLowerCase();
  if (!normalized) return 'unknown';

  switch (normalized) {
    case 'approved':
    case 'pending':
    case 'submitted':
    case 'appealed':
    case 'denied':
    case 'draft':
    case 'expired':
    case 'cancelled':
      return normalized;
    case 'additional_info_needed':
      return 'more_info_needed';
    case 'more_info_needed':
      return 'more_info_needed';
    default:
      return 'unknown';
  }
}

function getPriorAuthStatusPriority(status: PriorAuthUiStatus): number {
  switch (status) {
    case 'approved':
      return 0;
    case 'pending':
      return 1;
    case 'submitted':
      return 2;
    case 'appealed':
      return 3;
    case 'more_info_needed':
      return 4;
    case 'draft':
      return 5;
    case 'denied':
      return 6;
    case 'expired':
      return 7;
    case 'cancelled':
      return 8;
    case 'missing':
      return 9;
    case 'unknown':
      return 10;
    case 'not_required':
      return 11;
    default:
      return 12;
  }
}

function buildPriorAuthByPatientMap(items: PriorAuthListItem[]): Record<string, PriorAuthSnapshot> {
  const map: Record<string, PriorAuthSnapshot> = {};

  for (const item of items) {
    const patientId = item?.patient_id;
    if (!patientId) continue;

    const status = normalizePriorAuthStatus(item.status);
    const snapshot: PriorAuthSnapshot = {
      required: true,
      status,
      onFile: status === 'approved',
      actionNeeded: status !== 'approved',
      authId: item.id,
      authNumber: item.insurance_auth_number || item.auth_number || undefined,
    };

    const current = map[patientId];
    if (!current) {
      map[patientId] = snapshot;
      continue;
    }

    const currentPriority = getPriorAuthStatusPriority(current.status);
    const nextPriority = getPriorAuthStatusPriority(snapshot.status);
    if (nextPriority < currentPriority) {
      map[patientId] = snapshot;
      continue;
    }
  }

  return map;
}

export function SchedulePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const patientIdParam = searchParams.get('patientId');
  const appointmentIdParam = searchParams.get('appointmentId');
  const viewParam = searchParams.get('view');
  const handledQueryRef = useRef<{ patientId: string | null; appointmentId: string | null }>({
    patientId: null,
    appointmentId: null,
  });

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [copayByAppointmentId, setCopayByAppointmentId] = useState<Record<string, number>>({});
  const [outstandingBalanceByAppointmentId, setOutstandingBalanceByAppointmentId] = useState<Record<string, number>>({});
  const [priorAuthByPatientId, setPriorAuthByPatientId] = useState<Record<string, PriorAuthSnapshot>>({});

  // Schedule state - Initialize from URL parameter or localStorage
  const [dayOffset, setDayOffset] = useState(() => {
    const stored = Number(localStorage.getItem('sched:dayOffset') || 0);
    return Number.isNaN(stored) ? 0 : stored;
  });

  // Initialize view mode from URL query parameter, fallback to localStorage, then 'day'
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'day' || urlView === 'week' || urlView === 'month') {
      return urlView;
    }
    const stored = localStorage.getItem('sched:viewMode');
    if (stored === 'day' || stored === 'week' || stored === 'month') {
      return stored as 'day' | 'week' | 'month';
    }
    return 'day';
  });
  const [providerFilter, setProviderFilter] = useState(() => localStorage.getItem('sched:provider') || 'all');
  const [typeFilter, setTypeFilter] = useState(() => localStorage.getItem('sched:type') || 'all');
  const [locationFilter, setLocationFilter] = useState(() => localStorage.getItem('sched:location') || 'all');
  const [showWeekends, setShowWeekends] = useState(() => localStorage.getItem('sched:showWeekends') === 'true');

  const [overlaps, setOverlaps] = useState<ConflictInfo[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);

  // Modal states
  const [showNewApptModal, setShowNewApptModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showTimeBlockModal, setShowTimeBlockModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [selectedTimeBlock, setSelectedTimeBlock] = useState<TimeBlock | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowAction, setRowAction] = useState<{ id: string; action: 'encounter' } | null>(null);
  const [checkInActionId, setCheckInActionId] = useState<string | null>(null);
  const [showCopayCheckInModal, setShowCopayCheckInModal] = useState(false);
  const [copayCheckInAppointment, setCopayCheckInAppointment] = useState<Appointment | null>(null);
  const [copayDecisionPaymentMethod, setCopayDecisionPaymentMethod] = useState<'cash' | 'credit' | 'debit' | 'check'>('cash');
  const [copayDecisionAmount, setCopayDecisionAmount] = useState('0.00');
  const [copayDecisionNotes, setCopayDecisionNotes] = useState('');
  const [copayBypassReason, setCopayBypassReason] = useState<CopayBypassReason>('pay_at_checkout');
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [noShowAppointment, setNoShowAppointment] = useState<Appointment | null>(null);
  const [noShowReason, setNoShowReason] = useState('');
  const [noShowActionId, setNoShowActionId] = useState<string | null>(null);

  // New appointment form
  const [newAppt, setNewAppt] = useState({
    patientId: '',
    providerId: '',
    appointmentTypeId: '',
    locationId: '',
    date: '',
    time: '09:00',
    duration: 30,
    notes: '',
  });

  // Appointment Finder states
  const [showAppointmentFinder, setShowAppointmentFinder] = useState(false);
  const [showExpandedFinder, setShowExpandedFinder] = useState(false);
  const [finderData, setFinderData] = useState({
    patientId: '',
    locations: '',
    providers: '',
    appointmentType: '',
    duration: '5',
    timePreference: 'Anytime',
    weekdayPreference: 'Any Day',
    schedulingPreference: 'First available',
    displayBy: 'By Provider',
  });

  // Reschedule form (legacy - keeping for compatibility)
  const [rescheduleData, setRescheduleData] = useState({
    date: '',
    time: '09:00',
  });

  // Time block initial data for when clicking a slot
  const [timeBlockInitialData, setTimeBlockInitialData] = useState<{
    providerId?: string;
    date?: string;
    startTime?: string;
  } | undefined>(undefined);

  // Sync view mode from URL query parameter changes when a valid view is present.
  // Do not force day when `view` is absent; that can race with localStorage-derived view.
  useEffect(() => {
    const isValidViewParam = viewParam === 'day' || viewParam === 'week' || viewParam === 'month';
    if (!isValidViewParam) return;
    setViewMode((prev) => (prev === viewParam ? prev : viewParam));
  }, [viewParam]);

  useEffect(() => {
    if (!appointmentIdParam || handledQueryRef.current.appointmentId === appointmentIdParam) return;
    if (appointments.length === 0) return;

    handledQueryRef.current.appointmentId = appointmentIdParam;
    const appointment = appointments.find((appt) => appt.id === appointmentIdParam);

    if (appointment) {
      setSelectedAppt(appointment);
      setShowRescheduleModal(true);
    } else {
      showError('Appointment not found');
    }

    setSearchParams((prev) => {
      if (!prev.has('appointmentId')) return prev;
      const nextParams = new URLSearchParams(prev);
      nextParams.delete('appointmentId');
      return nextParams;
    }, { replace: true });
  }, [appointmentIdParam, appointments, setSearchParams, showError]);

  useEffect(() => {
    if (!patientIdParam || appointmentIdParam) return;
    if (handledQueryRef.current.patientId === patientIdParam) return;

    handledQueryRef.current.patientId = patientIdParam;
    setNewAppt((prev) => ({ ...prev, patientId: patientIdParam }));
    setShowNewApptModal(true);

    setSearchParams((prev) => {
      if (!prev.has('patientId')) return prev;
      const nextParams = new URLSearchParams(prev);
      nextParams.delete('patientId');
      return nextParams;
    }, { replace: true });
  }, [patientIdParam, appointmentIdParam, setSearchParams]);

  // Save filter state
  useEffect(() => {
    localStorage.setItem('sched:provider', providerFilter);
    localStorage.setItem('sched:type', typeFilter);
    localStorage.setItem('sched:location', locationFilter);
    localStorage.setItem('sched:dayOffset', String(dayOffset));
    localStorage.setItem('sched:viewMode', viewMode);
    localStorage.setItem('sched:showWeekends', String(showWeekends));
  }, [providerFilter, typeFilter, locationFilter, dayOffset, viewMode, showWeekends]);

  const updateViewMode = useCallback((nextView: ScheduleViewMode) => {
    setViewMode(nextView);
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      if (nextView === 'day') {
        nextParams.delete('view');
      } else {
        nextParams.set('view', nextView);
      }
      return nextParams;
    }, { replace: true });
  }, [setSearchParams]);

  const currentDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [dayOffset]);

  const activeViewRange = useMemo(
    () => getViewRange(currentDate, viewMode, showWeekends),
    [currentDate, viewMode, showWeekends]
  );

  const filteredAppointments = useMemo(() => {
    const startMs = activeViewRange.start.getTime();
    const endMs = activeViewRange.end.getTime();

    return appointments
      .filter((appointment) => {
        const providerOk = providerFilter === 'all' || appointment.providerId === providerFilter;
        const typeOk = typeFilter === 'all' || appointment.appointmentTypeId === typeFilter;
        const locationOk = locationFilter === 'all' || appointment.locationId === locationFilter;
        if (!providerOk || !typeOk || !locationOk) return false;

        const appointmentStart = new Date(appointment.scheduledStart).getTime();
        if (Number.isNaN(appointmentStart)) return false;
        return appointmentStart >= startMs && appointmentStart <= endMs;
      })
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
  }, [appointments, providerFilter, typeFilter, locationFilter, activeViewRange]);

  const calendarAppointments = useMemo(
    () => filteredAppointments.filter((appointment) => appointment.status !== 'cancelled'),
    [filteredAppointments]
  );

  const locationScopedProviderIds = useMemo(() => {
    if (locationFilter === 'all') return null;
    const startMs = activeViewRange.start.getTime();
    const endMs = activeViewRange.end.getTime();
    const ids = new Set<string>();

    appointments.forEach((appointment) => {
      if (appointment.locationId !== locationFilter || !appointment.providerId) return;
      const appointmentStart = new Date(appointment.scheduledStart).getTime();
      if (Number.isNaN(appointmentStart)) return;
      if (appointmentStart < startMs || appointmentStart > endMs) return;
      ids.add(appointment.providerId);
    });

    return ids;
  }, [appointments, locationFilter, activeViewRange]);

  const calendarProviders = useMemo(() => {
    if (providerFilter !== 'all') {
      return providers.filter((provider) => provider.id === providerFilter);
    }
    if (!locationScopedProviderIds) {
      return providers;
    }
    return providers.filter((provider) => locationScopedProviderIds.has(provider.id));
  }, [providers, providerFilter, locationScopedProviderIds]);

  const calendarProviderIdSet = useMemo(
    () => new Set(calendarProviders.map((provider) => provider.id)),
    [calendarProviders]
  );

  const calendarTimeBlocks = useMemo(() => {
    const startMs = activeViewRange.start.getTime();
    const endMs = activeViewRange.end.getTime();

    return timeBlocks.filter((block) => {
      const providerMatches =
        providerFilter === 'all'
          ? calendarProviderIdSet.has(block.providerId)
          : block.providerId === providerFilter;
      if (!providerMatches) return false;

      const blockStart = new Date(block.startTime).getTime();
      if (Number.isNaN(blockStart)) return false;
      return blockStart >= startMs && blockStart <= endMs;
    });
  }, [timeBlocks, providerFilter, calendarProviderIdSet, activeViewRange]);

  // Auto-select first visible provider when switching to month view if "all" is selected
  useEffect(() => {
    if (viewMode === 'month' && providerFilter === 'all' && calendarProviders.length > 0) {
      setProviderFilter(calendarProviders[0].id);
    }
  }, [viewMode, providerFilter, calendarProviders]);

  useEffect(() => {
    if (!selectedAppt) return;
    const selectedStillVisible = filteredAppointments.some((appointment) => appointment.id === selectedAppt.id);
    if (!selectedStillVisible) {
      setSelectedAppt(null);
    }
  }, [filteredAppointments, selectedAppt]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      // Calculate date range based on view mode
      const selectedDate = new Date();
      selectedDate.setDate(selectedDate.getDate() + dayOffset);
      selectedDate.setHours(0, 0, 0, 0);

      // Determine start and end dates based on view mode
      let startDate: Date;
      let endDate: Date;

      if (viewMode === 'month') {
        // For month view, get the first day of the selected month and extend to cover full month grid
        startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        // Go back to include previous month days that appear in calendar grid
        startDate.setDate(startDate.getDate() - 7);
        // End date is last day of month + some buffer for next month days in grid
        endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
        endDate.setDate(endDate.getDate() + 14);
      } else {
        // For day/week view, query around selected date so past navigation still loads records
        startDate = new Date(selectedDate);
        startDate.setDate(startDate.getDate() - 60);
        endDate = new Date(selectedDate);
        endDate.setDate(endDate.getDate() + 60);
      }

      const formatDate = (d: Date) => d.toISOString().split('T')[0];

      const [apptRes, provRes, locRes, typeRes, availRes, patRes, timeBlocksRes, frontDeskRes, priorAuthRes] = await Promise.all([
        fetchAppointments(session.tenantId, session.accessToken, {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
        }),
        fetchProviders(session.tenantId, session.accessToken),
        fetchLocations(session.tenantId, session.accessToken),
        fetchAppointmentTypes(session.tenantId, session.accessToken),
        fetchAvailability(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchTimeBlocks(session.tenantId, session.accessToken).catch(() => []),
        fetchFrontDeskSchedule(session.tenantId, session.accessToken).catch(() => ({ appointments: [] })),
        fetchPriorAuths(session.tenantId, session.accessToken).catch(() => []),
      ]);
      const frontDeskCopayMap: Record<string, number> = {};
      const frontDeskOutstandingBalanceMap: Record<string, number> = {};
      for (const appointment of frontDeskRes?.appointments || []) {
        if (appointment?.id && typeof appointment.copayAmount === 'number' && Number.isFinite(appointment.copayAmount)) {
          frontDeskCopayMap[appointment.id] = appointment.copayAmount;
        }
        if (
          appointment?.id &&
          typeof appointment.outstandingBalance === 'number' &&
          Number.isFinite(appointment.outstandingBalance)
        ) {
          frontDeskOutstandingBalanceMap[appointment.id] = appointment.outstandingBalance;
        }
      }
      const priorAuthItems = normalizePriorAuthPayload(priorAuthRes);
      const priorAuthMap = buildPriorAuthByPatientMap(priorAuthItems);
      setAppointments(apptRes.appointments || []);
      setProviders(provRes.providers || []);
      setLocations(locRes.locations || []);
      setAppointmentTypes(typeRes.appointmentTypes || []);
      setAvailability(availRes.availability || []);
      setPatients(patRes.data || patRes.patients || []);
      setTimeBlocks(Array.isArray(timeBlocksRes) ? timeBlocksRes : []);
      setCopayByAppointmentId(frontDeskCopayMap);
      setOutstandingBalanceByAppointmentId(frontDeskOutstandingBalanceMap);
      setPriorAuthByPatientId(priorAuthMap);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session, showError, dayOffset, viewMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Conflict detection
  useEffect(() => {
    if (!Array.isArray(filteredAppointments) || filteredAppointments.length === 0) {
      setOverlaps([]);
      return;
    }

    // Filter out cancelled appointments
    const activeAppointments = filteredAppointments.filter(
      (appt) => appt && appt.status !== 'cancelled'
    );

    const grouped = new Map<string, any[]>();
    activeAppointments.forEach((appt) => {
      if (!appt || !appt.providerId) return;
      const list = grouped.get(appt.providerId) || [];
      list.push(appt);
      grouped.set(appt.providerId, list);
    });

    const conflictMap = new Map<string, { provider: string; time: string; count: number; patients: Set<string> }>();
    grouped.forEach((list) => {
      if (!Array.isArray(list) || list.length === 0) return;

      const sorted = list.sort((a, b) => {
        if (!a?.scheduledStart || !b?.scheduledStart) return 0;
        return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
      });

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        if (!current?.scheduledStart || !current?.scheduledEnd || !next?.scheduledStart || !next?.scheduledEnd) continue;

        const currentStart = new Date(current.scheduledStart).getTime();
        const currentEnd = new Date(current.scheduledEnd).getTime();
        const nextStart = new Date(next.scheduledStart).getTime();
        const nextEnd = new Date(next.scheduledEnd).getTime();

        if (isNaN(currentStart) || isNaN(currentEnd) || isNaN(nextStart) || isNaN(nextEnd)) continue;

        // Check for proper overlap: appointments overlap if one starts before the other ends AND vice versa
        if (currentStart < nextEnd && currentEnd > nextStart) {
          const providerName = current.providerName || 'Provider';
          const startLabel = new Date(current.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const key = `${providerName}-${startLabel}`;
          const existing = conflictMap.get(key) || { provider: providerName, time: startLabel, count: 0, patients: new Set<string>() };
          existing.count++;
          if (current.patientName) existing.patients.add(current.patientName);
          if (next.patientName) existing.patients.add(next.patientName);
          conflictMap.set(key, existing);
        }
      }
    });

    setOverlaps(Array.from(conflictMap.values()).map((c) => ({
      provider: c.provider,
      time: c.time,
      count: c.count,
      patients: Array.from(c.patients),
    })));
  }, [filteredAppointments]);

  const isAppointmentOverdueCheckIn = useCallback((appt: Appointment): boolean => {
    if (appt.status !== 'scheduled') return false;
    const scheduledStartMs = new Date(appt.scheduledStart).getTime();
    if (Number.isNaN(scheduledStartMs)) return false;
    const deadlineMs = scheduledStartMs + NO_SHOW_CHECK_IN_GRACE_MINUTES * 60 * 1000;
    return Date.now() > deadlineMs;
  }, []);

  const overdueCheckInAppointments = useMemo(
    () => filteredAppointments.filter((appt) => isAppointmentOverdueCheckIn(appt)),
    [filteredAppointments, isAppointmentOverdueCheckIn]
  );
  const getAppointmentCopayAmount = useCallback((appt: Appointment | null): number => {
    if (!appt) return 0;
    const mappedCopay = copayByAppointmentId[appt.id];
    if (typeof mappedCopay === 'number' && Number.isFinite(mappedCopay) && mappedCopay > 0) {
      return mappedCopay;
    }
    const inlineCopay = (appt as Appointment & { copayAmount?: number }).copayAmount;
    if (typeof inlineCopay === 'number' && Number.isFinite(inlineCopay) && inlineCopay > 0) {
      return inlineCopay;
    }
    return 0;
  }, [copayByAppointmentId]);

  const getAppointmentOutstandingBalance = useCallback((appt: Appointment | null): number => {
    if (!appt) return 0;
    const mappedBalance = outstandingBalanceByAppointmentId[appt.id];
    if (typeof mappedBalance === 'number' && Number.isFinite(mappedBalance) && mappedBalance > 0) {
      return mappedBalance;
    }
    const inlineBalance = (appt as Appointment & { outstandingBalance?: number }).outstandingBalance;
    if (typeof inlineBalance === 'number' && Number.isFinite(inlineBalance) && inlineBalance > 0) {
      return inlineBalance;
    }
    return 0;
  }, [outstandingBalanceByAppointmentId]);

  const getAppointmentPriorAuthSnapshot = useCallback((appt: Appointment | null): PriorAuthSnapshot => {
    if (!appt) {
      return {
        required: false,
        status: 'not_required',
        onFile: false,
        actionNeeded: false,
      };
    }

    const required = inferPriorAuthRequired(appt.appointmentTypeName);
    const patientSnapshot = priorAuthByPatientId[appt.patientId];

    if (!required) {
      return {
        required: false,
        status: 'not_required',
        onFile: false,
        actionNeeded: false,
      };
    }

    if (!patientSnapshot) {
      return {
        required: true,
        status: 'missing',
        onFile: false,
        actionNeeded: true,
      };
    }

    return {
      ...patientSnapshot,
      required: true,
      onFile: patientSnapshot.status === 'approved',
      actionNeeded: patientSnapshot.status !== 'approved',
    };
  }, [priorAuthByPatientId]);

  const priorAuthStatusLabel = useCallback((status: PriorAuthUiStatus): string => {
    switch (status) {
      case 'not_required':
        return 'Not Required';
      case 'missing':
        return 'Missing';
      case 'approved':
        return 'Approved';
      case 'pending':
        return 'Pending';
      case 'submitted':
        return 'Submitted';
      case 'appealed':
        return 'Appealed';
      case 'more_info_needed':
        return 'More Info Needed';
      case 'denied':
        return 'Denied';
      case 'draft':
        return 'Draft';
      case 'expired':
        return 'Expired';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  }, []);

  const priorAuthStatusColors = useCallback((status: PriorAuthUiStatus): { bg: string; text: string; border: string } => {
    switch (status) {
      case 'approved':
        return { bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' };
      case 'pending':
      case 'submitted':
      case 'appealed':
      case 'more_info_needed':
      case 'draft':
        return { bg: '#fffbeb', text: '#92400e', border: '#fcd34d' };
      case 'missing':
      case 'denied':
      case 'expired':
      case 'cancelled':
        return { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' };
      default:
        return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
    }
  }, []);

  const buildPortalCheckInLink = useCallback((appt: Appointment | null): string => {
    if (!appt || typeof window === 'undefined') return '';
    return window.location.origin + '/portal/check-in?appointmentId=' + encodeURIComponent(appt.id);
  }, []);

  const closeCopayDecisionModal = useCallback(() => {
    setShowCopayCheckInModal(false);
    setCopayCheckInAppointment(null);
    setCopayDecisionPaymentMethod('cash');
    setCopayDecisionAmount('0.00');
    setCopayDecisionNotes('');
    setCopayBypassReason('pay_at_checkout');
  }, []);

  const handleCopyCheckInLink = useCallback(async () => {
    if (!copayCheckInAppointment) {
      showError('Select an appointment first.');
      return;
    }

    const link = buildPortalCheckInLink(copayCheckInAppointment);
    if (!link) {
      showError('Could not build check-in link.');
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      showSuccess('Patient check-in link copied. Send this to the patient to complete intake before check-in.');
    } catch {
      showError('Clipboard permission was blocked. Copy this link manually: ' + link);
    }
  }, [buildPortalCheckInLink, copayCheckInAppointment, showError, showSuccess]);

  const handleOpenKioskFromCheckIn = useCallback(async () => {
    if (!copayCheckInAppointment || !session) {
      showError('Select an appointment first.');
      return;
    }

    const kioskContext = await ensureKioskContext({
      accessToken: session.accessToken,
      tenantId: session.tenantId,
      locationId: copayCheckInAppointment.locationId,
    });

    if (!kioskContext?.kioskCode) {
      showError('Kiosk device configuration is missing for this location.');
      return;
    }

    const params = new URLSearchParams({
      appointmentId: copayCheckInAppointment.id,
      kioskCode: kioskContext.kioskCode,
      patientId: copayCheckInAppointment.patientId,
      patientName: copayCheckInAppointment.patientName || '',
      tenantId: kioskContext.tenantId,
    });
    window.open('/kiosk/appointment?' + params.toString(), '_blank', 'noopener,noreferrer');
    showSuccess('Opened kiosk check-in flow in a new tab for iPad use.');
  }, [copayCheckInAppointment, session, showError, showSuccess]);

  const handleOpenPriorAuthQueue = useCallback(() => {
    if (!copayCheckInAppointment) {
      navigate('/prior-auth');
      return;
    }
    navigate('/prior-auth?status=pending&patientId=' + encodeURIComponent(copayCheckInAppointment.patientId));
  }, [copayCheckInAppointment, navigate]);

  const executeCheckIn = useCallback(async (appt: Appointment, options?: FrontDeskCheckInOptions) => {
    if (!session) return;
    setCheckInActionId(appt.id);
    try {
      const checkInResult: FrontDeskCheckInResponse = await checkInFrontDeskAppointment(
        session.tenantId,
        session.accessToken,
        appt.id,
        options
      );
      try {
        await updatePatientFlowStatus(session.tenantId, session.accessToken, appt.id, 'checked_in');
      } catch {
        // Do not fail check-in if flow sync is unavailable
      }
      const priorAuth = getAppointmentPriorAuthSnapshot(appt);
      const priorAuthMessage = priorAuth.required
        ? priorAuth.onFile
          ? ' Prior auth verified.'
          : ' Prior auth still needs front desk follow-up.'
        : '';
      showSuccess(buildCheckInMessage(checkInResult, appt.patientName) + priorAuthMessage);
      await loadData();
    } finally {
      setCheckInActionId(null);
    }
  }, [getAppointmentPriorAuthSnapshot, loadData, session, showSuccess]);

  const beginCheckInFlow = useCallback(async (appt: Appointment) => {
    if (appt.status !== 'scheduled') {
      showError(`Cannot check in appointment with status "${appt.status}".`);
      return;
    }
    const copayAmount = getAppointmentCopayAmount(appt);
    setCopayCheckInAppointment(appt);
    setCopayDecisionPaymentMethod('cash');
    setCopayDecisionAmount(copayAmount.toFixed(2));
    setCopayDecisionNotes('');
    setCopayBypassReason('pay_at_checkout');
    setShowCopayCheckInModal(true);
  }, [executeCheckIn, getAppointmentCopayAmount]);

  const handleStatusChange = async (id: string, status: string) => {
    if (!session) return;
    const apptForMessage = appointments.find((appt) => appt.id === id);
    try {
      if (status === 'checked_in') {
        if (!apptForMessage) {
          showError('Select an appointment before checking in.');
          return;
        }
        await beginCheckInFlow(apptForMessage);
      } else if (status === 'no_show') {
        if (!apptForMessage) {
          showError('Select an appointment before marking no-show.');
          return;
        }
        openNoShowModal(apptForMessage);
      } else {
        await updateAppointmentStatus(session.tenantId, session.accessToken, id, status);
        showSuccess('Status updated');
        await loadData();
      }
    } catch (err: any) {
      showError(err.message);
    }
  };

  const ensureEncounterForAppointment = useCallback(async (appt: Appointment) => {
    if (!session) {
      throw new Error('Session missing');
    }
    const encountersRes = await fetchPatientEncounters(
      session.tenantId,
      session.accessToken,
      appt.patientId
    );
    const existing = (encountersRes.encounters || []).find((e: any) => e.appointmentId === appt.id);
    if (existing?.id) {
      return existing.id as string;
    }
    const created = await createEncounter(session.tenantId, session.accessToken, {
      patientId: appt.patientId,
      providerId: appt.providerId,
      appointmentId: appt.id,
    });
    return created.id as string;
  }, [session]);

  const handleStartEncounterFromSchedule = async (appt: Appointment) => {
    if (!session) return;
    try {
      setRowAction({ id: appt.id, action: 'encounter' });
      const encounterId = await ensureEncounterForAppointment(appt);
      if (appt.status !== 'completed' && appt.status !== 'cancelled' && appt.status !== 'with_provider') {
        try {
          await updateAppointmentStatus(session.tenantId, session.accessToken, appt.id, 'with_provider');
        } catch {
          // Don't block the workflow if status update fails
        }
      }
      const scheduleQuery = searchParams.toString();
      const returnPath = scheduleQuery ? `/schedule?${scheduleQuery}` : '/schedule';
      try {
        sessionStorage.setItem(
          `encounter:appointmentType:${appt.id}`,
          appt.appointmentTypeName || ''
        );
      } catch {
        // Ignore storage failures in private/locked contexts.
      }
      setActiveEncounter({
        encounterId,
        patientId: appt.patientId,
        patientName: appt.patientName,
        appointmentTypeName: appt.appointmentTypeName,
        startedAt: new Date().toISOString(),
        startedEncounterFrom: 'schedule',
        undoAppointmentStatus: appt.status,
        returnPath,
      });
      navigate(`/patients/${appt.patientId}/encounter/${encounterId}`, {
        state: {
          startedEncounterFrom: 'schedule',
          undoAppointmentStatus: appt.status,
          appointmentTypeName: appt.appointmentTypeName,
          returnPath,
        },
      });
    } catch (err: any) {
      showError(err.message || 'Failed to start encounter');
    } finally {
      setRowAction(null);
    }
  };

  const handleCreateAppointment = async (formData: AppointmentFormData) => {
    if (!session) return;

    const startDate = new Date(`${formData.date}T${formData.time}:00`);
    const endDate = new Date(startDate.getTime() + formData.duration * 60000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      showError('Invalid date or time');
      return;
    }

    await createAppointment(session.tenantId, session.accessToken, {
      patientId: formData.patientId,
      providerId: formData.providerId,
      appointmentTypeId: formData.appointmentTypeId,
      locationId: formData.locationId || locations[0]?.id,
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      notes: formData.notes,
    });

    showSuccess('Appointment created successfully');
    loadData();
  };

  const handleReschedule = async (formData: RescheduleFormData) => {
    if (!session || !selectedAppt) return;

    if (!selectedAppt.scheduledEnd || !selectedAppt.scheduledStart) {
      showError('Invalid appointment data');
      return;
    }

    const originalDuration = new Date(selectedAppt.scheduledEnd).getTime() - new Date(selectedAppt.scheduledStart).getTime();
    const newStart = new Date(`${formData.date}T${formData.time}:00`);
    const newEnd = new Date(newStart.getTime() + originalDuration);

    if (isNaN(originalDuration) || isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
      showError('Invalid date or time');
      return;
    }

    // Pass providerId if it changed
    const newProviderId = formData.providerId !== selectedAppt.providerId ? formData.providerId : undefined;

    await rescheduleAppointment(
      session.tenantId,
      session.accessToken,
      selectedAppt.id,
      newStart.toISOString(),
      newEnd.toISOString(),
      newProviderId
    );

    showSuccess('Appointment rescheduled');
    setShowRescheduleModal(false);
    setSelectedAppt(null);
    loadData();
  };

  const handleCheckIn = async (appt: Appointment) => {
    if (!session) return;
    try {
      await beginCheckInFlow(appt);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const openNoShowModal = (appt: Appointment) => {
    if (appt.status !== 'scheduled') {
      showError('Only scheduled appointments can be marked as no-show.');
      return;
    }
    if (!isAppointmentOverdueCheckIn(appt)) {
      showError('No-show can be confirmed after ' + NO_SHOW_CHECK_IN_GRACE_MINUTES + ' minutes without check-in.');
      return;
    }
    setNoShowAppointment(appt);
    setNoShowReason('No-show confirmed by front desk after ' + NO_SHOW_CHECK_IN_GRACE_MINUTES + ' minutes without check-in.');
    setShowNoShowModal(true);
  };

  const closeNoShowModal = () => {
    setShowNoShowModal(false);
    setNoShowAppointment(null);
    setNoShowReason('');
  };

  const handleConfirmNoShow = async () => {
    if (!session || !noShowAppointment) return;
    const trimmedReason = noShowReason.trim();
    if (trimmedReason.length < 3) {
      showError('Please enter a no-show reason (3+ characters).');
      return;
    }

    try {
      setNoShowActionId(noShowAppointment.id);
      const result = await updateAppointmentStatus(
        session.tenantId,
        session.accessToken,
        noShowAppointment.id,
        'no_show',
        { reason: trimmedReason }
      );
      const billId = result?.noShowFeeBillId as string | undefined;
      if (billId) {
        showSuccess('Marked as no-show. No-show fee posted (bill ' + billId.slice(0, 8) + '...).');
      } else {
        showSuccess('Marked as no-show.');
      }
      closeNoShowModal();
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to mark appointment as no-show');
    } finally {
      setNoShowActionId(null);
    }
  };

const handleUndoNoShow = async (appt: Appointment) => {
  if (!session) return;
  if (appt.status !== 'no_show') {
    showError('Only no-show appointments can be restored.');
    return;
  }

  try {
    setNoShowActionId(appt.id);
    await updateAppointmentStatus(
      session.tenantId,
      session.accessToken,
      appt.id,
      'scheduled',
      { reason: 'No-show reversed: patient arrived late.' }
    );
    showSuccess('No-show removed. You can check in the patient now.');
    await loadData();
  } catch (err: any) {
    showError(err.message || 'Failed to undo no-show');
  } finally {
    setNoShowActionId(null);
  }
};

  const handleCopayCollectAndCheckIn = async () => {
    if (!copayCheckInAppointment) return;
    const parsedAmount = Number.parseFloat(copayDecisionAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      showError('Enter a valid copay amount');
      return;
    }
    const outstandingBalanceAmount = getAppointmentOutstandingBalance(copayCheckInAppointment);
    const totalDue = getAppointmentCopayAmount(copayCheckInAppointment) + outstandingBalanceAmount;
    if (parsedAmount <= 0) {
      showError('Enter a payment amount greater than $0.00');
      return;
    }
    if (totalDue > 0 && parsedAmount - totalDue > 0.009) {
      showError('Amount cannot exceed the total due today.');
      return;
    }
    const copayAmountCents = Math.min(
      Math.round(parsedAmount * 100),
      Math.round(getAppointmentCopayAmount(copayCheckInAppointment) * 100)
    );
    const outstandingBalanceAmountCents = Math.min(
      Math.max(0, Math.round(parsedAmount * 100) - copayAmountCents),
      Math.round(outstandingBalanceAmount * 100)
    );
    try {
      await executeCheckIn(copayCheckInAppointment, {
        collectCopay: copayAmountCents > 0,
        collectOutstandingBalance: outstandingBalanceAmountCents > 0,
        copayAmountCents,
        outstandingBalanceAmountCents,
        paymentMethod: copayDecisionPaymentMethod,
        notes: copayDecisionNotes.trim() || undefined,
      });
      closeCopayDecisionModal();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleCopayDeferAndCheckIn = async () => {
    if (!copayCheckInAppointment) return;
    const bypassReasonLabel = COPAY_BYPASS_REASON_LABELS[copayBypassReason];
    const mergedNotes = [`Bypass reason: ${bypassReasonLabel}`, copayDecisionNotes.trim()]
      .filter(Boolean)
      .join(' | ');
    try {
      await executeCheckIn(copayCheckInAppointment, {
        deferCopay: true,
        notes: mergedNotes || undefined,
      });
      closeCopayDecisionModal();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleCheckInWithoutCopay = async () => {
    if (!copayCheckInAppointment) return;
    try {
      await executeCheckIn(copayCheckInAppointment);
      closeCopayDecisionModal();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleCancelAppt = async (appt: Appointment) => {
    if (window.confirm(`Cancel appointment for ${appt.patientName}?`)) {
      await handleStatusChange(appt.id, 'cancelled');
    }
  };

  const openRescheduleModal = (appt: Appointment) => {
    setSelectedAppt(appt);
    setShowRescheduleModal(true);
  };

  const handleSlotClick = (providerId: string, date: Date, hour: number, minute: number) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const slotDate = new Date(date);
    slotDate.setHours(hour, minute, 0, 0);

    setNewAppt({
      ...newAppt,
      providerId: providerId,
      date: slotDate.toISOString().split('T')[0],
      time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
    });
    setShowNewApptModal(true);
  };

  const handleSaveTimeBlock = async (formData: TimeBlockFormData) => {
    if (!session) return;

    const startDateTime = new Date(`${formData.date}T${formData.startTime}:00`);
    const endDateTime = new Date(`${formData.date}T${formData.endTime}:00`);
    const recurrencePattern = formData.isRecurring && formData.recurrencePattern
      ? {
          pattern: formData.recurrencePattern,
          days: formData.recurrencePattern === 'weekly' || formData.recurrencePattern === 'biweekly'
            ? [startDateTime.getDay()]
            : undefined,
          dayOfMonth: formData.recurrencePattern === 'monthly' ? startDateTime.getDate() : undefined,
          until: formData.recurrenceEndDate || undefined,
        }
      : undefined;

    const timeBlockPayload = {
      providerId: formData.providerId,
      title: formData.title,
      blockType: formData.blockType,
      description: formData.description || undefined,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      isRecurring: formData.isRecurring,
      recurrencePattern,
    };

    if (selectedTimeBlock) {
      // Update existing time block
      await updateTimeBlock(session.tenantId, session.accessToken, selectedTimeBlock.id, timeBlockPayload);
      showSuccess('Time block updated successfully');
    } else {
      // Create new time block
      await createTimeBlock(session.tenantId, session.accessToken, timeBlockPayload);
      showSuccess('Time block created successfully');
    }

    setShowTimeBlockModal(false);
    setSelectedTimeBlock(null);
    setTimeBlockInitialData(undefined);
    loadData();
  };

  const handleDeleteTimeBlock = async (timeBlockId: string) => {
    if (!session) return;

    await deleteTimeBlock(session.tenantId, session.accessToken, timeBlockId);
    showSuccess('Time block deleted successfully');
    setShowTimeBlockModal(false);
    setSelectedTimeBlock(null);
    loadData();
  };

  const handleTimeBlockClick = async (timeBlockId: string) => {
    const timeBlock = timeBlocks.find(tb => tb.id === timeBlockId);
    if (timeBlock) {
      setSelectedTimeBlock(timeBlock);
      setShowTimeBlockModal(true);
    }
  };

  const openNewTimeBlockModal = () => {
    setSelectedTimeBlock(null);
    setTimeBlockInitialData(undefined);
    setShowTimeBlockModal(true);
  };

  const dateLabel = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const modalCopayAmount = getAppointmentCopayAmount(copayCheckInAppointment);
  const modalOutstandingBalance = getAppointmentOutstandingBalance(copayCheckInAppointment);
  const modalTotalDue = modalCopayAmount + modalOutstandingBalance;
  const modalHasCopay = modalCopayAmount > 0;
  const modalHasOutstandingBalance = modalOutstandingBalance > 0;
  const modalPriorAuth = getAppointmentPriorAuthSnapshot(copayCheckInAppointment);
  const modalPriorAuthColors = priorAuthStatusColors(modalPriorAuth.status);
  const modalPriorAuthNeedsAction = modalPriorAuth.required && modalPriorAuth.actionNeeded;
  const selectedIsLaserVisit = isLaserAppointmentType(selectedAppt?.appointmentTypeName);
  const selectedIsNoShow = selectedAppt?.status === 'no_show';
  const selectedCanMarkNoShow = Boolean(selectedAppt && isAppointmentOverdueCheckIn(selectedAppt));

  return (
    <div className="schedule-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Action Buttons Row */}
      <div className="ema-action-bar" style={{ background: 'linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)', borderBottom: '2px solid #e5e7eb', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => {
            setShowNewApptModal(true);
          }}
          style={{
            background: 'linear-gradient(to bottom, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>+</span>
          New Appointment
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt}
          onClick={() => selectedAppt && openRescheduleModal(selectedAppt)}
          style={{
            background: selectedAppt ? 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)' : '#e5e7eb',
            color: selectedAppt ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedAppt ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedAppt ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>📅</span>
          Reschedule
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt}
          onClick={() => selectedAppt && handleCancelAppt(selectedAppt)}
          style={{
            background: selectedAppt ? 'linear-gradient(to bottom, #ef4444 0%, #dc2626 100%)' : '#e5e7eb',
            color: selectedAppt ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedAppt ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedAppt ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>✕</span>
          Cancel Appointment
        </button>
<button
  type="button"
  className="ema-action-btn"
  disabled={!selectedAppt || selectedAppt.status !== 'scheduled' || checkInActionId === selectedAppt?.id}
  onClick={() => {
    if (!selectedAppt) {
      showError('Select an appointment first.');
      return;
    }
    handleCheckIn(selectedAppt);
  }}
  style={{
    background: selectedAppt?.status === 'scheduled' ? 'linear-gradient(to bottom, #8b5cf6 0%, #7c3aed 100%)' : '#e5e7eb',
    color: selectedAppt?.status === 'scheduled' ? '#ffffff' : '#9ca3af',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    cursor: selectedAppt?.status === 'scheduled' ? 'pointer' : 'default',
    fontWeight: 500,
    boxShadow: selectedAppt?.status === 'scheduled' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
    opacity: checkInActionId === selectedAppt?.id ? 0.7 : 1,
  }}
>
  <span style={{ marginRight: '0.5rem' }}>✓</span>
  {checkInActionId === selectedAppt?.id ? 'Checking In...' : 'Check In'}
</button>
<button
  type="button"
  className="ema-action-btn"
  data-testid={selectedIsNoShow ? 'action-undo-no-show' : 'action-mark-no-show'}
  disabled={
    noShowActionId === selectedAppt?.id ||
    (!selectedIsNoShow && !selectedCanMarkNoShow)
  }
  onClick={() => {
    if (!selectedAppt) return;
    if (selectedIsNoShow) {
      handleUndoNoShow(selectedAppt);
      return;
    }
    openNoShowModal(selectedAppt);
  }}
  style={{
    background: selectedIsNoShow
      ? 'linear-gradient(to bottom, #2563eb 0%, #1d4ed8 100%)'
      : selectedCanMarkNoShow
        ? 'linear-gradient(to bottom, #f97316 0%, #ea580c 100%)'
        : '#e5e7eb',
    color: selectedIsNoShow || selectedCanMarkNoShow ? '#ffffff' : '#9ca3af',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    cursor: (selectedIsNoShow || selectedCanMarkNoShow) ? 'pointer' : 'not-allowed',
    fontWeight: 500,
    boxShadow: (selectedIsNoShow || selectedCanMarkNoShow) ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
    opacity: noShowActionId === selectedAppt?.id ? 0.7 : 1,
  }}
>
  <span style={{ marginRight: '0.5rem' }}>{selectedIsNoShow ? '↺' : '⚠'}</span>
  {noShowActionId === selectedAppt?.id
    ? (selectedIsNoShow ? 'Undoing...' : 'Marking...')
    : (selectedIsNoShow ? 'Undo No-Show' : 'Mark No-Show')}
</button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt || rowAction?.id === selectedAppt?.id}
          onClick={() => selectedAppt && handleStartEncounterFromSchedule(selectedAppt)}
          style={{
            background: selectedAppt ? 'linear-gradient(to bottom, #10b981 0%, #059669 100%)' : '#e5e7eb',
            color: selectedAppt ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedAppt ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedAppt ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
            opacity: rowAction?.id === selectedAppt?.id ? 0.7 : 1
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>🩺</span>
          {rowAction?.id === selectedAppt?.id && rowAction?.action === 'encounter'
            ? 'Starting…'
            : selectedIsLaserVisit
              ? 'Start Laser Visit'
              : 'Start Encounter'}
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={openNewTimeBlockModal}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>⏱</span>
          Time Block
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => navigate('/face-sheets')}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>📄</span>
          Face Sheets
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={loadData}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>↻</span>
          Refresh
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => setShowAppointmentFinder(!showAppointmentFinder)}
          style={{
            background: showAppointmentFinder ? 'linear-gradient(to bottom, #06b6d4 0%, #0891b2 100%)' : 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: showAppointmentFinder ? 'none' : '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: showAppointmentFinder ? '#ffffff' : '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>🔍</span>
          Appointment Finder
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <ExportButtons
            data={filteredAppointments}
            filename="Appointments"
            columns={[
              { key: 'scheduledStart', label: 'Date', format: (date) => formatExportDate(date, 'short') },
              { key: 'scheduledStart', label: 'Time', format: (date) => formatExportDate(date, 'time') },
              { key: 'patientName', label: 'Patient' },
              { key: 'providerName', label: 'Provider' },
              { key: 'appointmentTypeName', label: 'Type' },
              { key: 'locationName', label: 'Location' },
              { key: 'status', label: 'Status' },
            ] as ExportColumn[]}
            variant="dropdown"
            pdfOptions={{ title: 'Appointments Schedule', orientation: 'landscape' }}
            onExport={(type) => showSuccess(`Exported ${filteredAppointments.length} appointments as ${type.toUpperCase()}`)}
          />
        </div>
      </div>

      {/* Schedule Section Header */}
      <div className="ema-section-header">
        Schedule - {dateLabel}
      </div>

      {/* Filter Panel */}
      <div className="ema-filter-panel">
        <div className="ema-filter-row">
          <div className="ema-filter-group">
            <label className="ema-filter-label">
              Provider
              {viewMode === 'month' && (
                <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                  (Month view: single provider)
                </span>
              )}
            </label>
            <select
              className="ema-filter-select"
              name="providerFilter"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              aria-label="Provider"
            >
              {viewMode !== 'month' && <option value="all">All Providers</option>}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}</option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Appointment Type</label>
            <select
              className="ema-filter-select"
              name="appointmentTypeFilter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Appointment Type"
            >
              <option value="all">All Types</option>
              {appointmentTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Location</label>
            <select
              className="ema-filter-select"
              name="locationFilter"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              aria-label="Location"
            >
              <option value="all">All Locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Date Navigation</label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                type="button"
                className="ema-filter-btn secondary"
                onClick={() => {
                  if (viewMode === 'month') {
                    // Move back one month
                    const current = new Date();
                    current.setDate(current.getDate() + dayOffset);
                    current.setMonth(current.getMonth() - 1);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    current.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((current.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    setDayOffset(diffDays);
                  } else if (viewMode === 'week') {
                    // Move back one week
                    setDayOffset((d) => d - 7);
                  } else {
                    // Move back one day
                    setDayOffset((d) => d - 1);
                  }
                }}
              >
                ◀ Prev
              </button>
              <button
                type="button"
                className="ema-filter-btn"
                onClick={() => setDayOffset(0)}
              >
                Today
              </button>
              <button
                type="button"
                className="ema-filter-btn secondary"
                onClick={() => {
                  if (viewMode === 'month') {
                    // Move forward one month
                    const current = new Date();
                    current.setDate(current.getDate() + dayOffset);
                    current.setMonth(current.getMonth() + 1);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    current.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((current.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    setDayOffset(diffDays);
                  } else if (viewMode === 'week') {
                    // Move forward one week
                    setDayOffset((d) => d + 7);
                  } else {
                    // Move forward one day
                    setDayOffset((d) => d + 1);
                  }
                }}
              >
                Next ▶
              </button>
            </div>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">View</label>
            <div className="view-mode-toggle">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'day' ? 'active' : ''}`}
                onClick={() => updateViewMode('day')}
              >
                Day
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'week' ? 'active' : ''}`}
                onClick={() => updateViewMode('week')}
              >
                Week
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'month' ? 'active' : ''}`}
                onClick={() => updateViewMode('month')}
              >
                Month
              </button>
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="schedule-show-weekends"
                name="scheduleShowWeekends"
                type="checkbox"
                checked={showWeekends}
                onChange={(event) => setShowWeekends(event.target.checked)}
                disabled={viewMode !== 'week'}
              />
              <label htmlFor="schedule-show-weekends" style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                Show weekends
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Conflict Warning Strip */}
      {overlaps.length > 0 && (
        <div style={{
          background: '#fef3c7',
          borderLeft: '4px solid #f59e0b',
          padding: '0.75rem 1rem',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: 600, color: '#92400e' }}>Scheduling Conflicts:</span>
          {overlaps.slice(0, 4).map((c, idx) => (
            <span
              key={idx}
              style={{
                background: '#ffffff',
                border: '1px solid #f59e0b',
                borderRadius: '4px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                color: '#92400e'
              }}
            >
              {c.provider} @ {c.time}
            </span>
          ))}
        </div>
      )}

      {!loading && overdueCheckInAppointments.length > 0 && (
        <div style={{
          background: '#fff7ed',
          borderLeft: '4px solid #f97316',
          padding: '0.75rem 1rem',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: 600, color: '#9a3412' }}>
            {overdueCheckInAppointments.length} overdue check-in appointments need review
          </span>
          {overdueCheckInAppointments.slice(0, 3).map((appt) => (
            <button
              key={appt.id}
              type="button"
              onClick={() => openNoShowModal(appt)}
              style={{
                background: '#ffffff',
                border: '1px solid #fed7aa',
                borderRadius: '6px',
                padding: '0.3rem 0.55rem',
                fontSize: '0.75rem',
                color: '#9a3412',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Mark {appt.patientName} no-show
            </button>
          ))}
        </div>
      )}

      {!loading && providerFilter === 'all' && locationFilter !== 'all' && calendarProviders.length === 0 && (
        <div
          style={{
            margin: '0.75rem 1rem',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            border: '1px solid #bfdbfe',
            background: '#eff6ff',
            color: '#1e3a8a',
            fontSize: '0.875rem',
          }}
        >
          No providers have appointments for this location in the selected date range.
        </div>
      )}

      {/* Main Content with Sidebar */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Calendar Grid */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: '2rem' }}>
              <Skeleton variant="card" height={600} />
            </div>
          ) : (
            <>
<Calendar
  currentDate={currentDate}
  viewMode={viewMode}
  showWeekends={showWeekends}
  appointments={calendarAppointments}
  providers={calendarProviders}
  availability={availability}
  timeBlocks={calendarTimeBlocks}
  selectedAppointment={selectedAppt}
  onAppointmentClick={setSelectedAppt}
  onSlotClick={handleSlotClick}
  onTimeBlockClick={handleTimeBlockClick}
  checkInActionId={checkInActionId}
  noShowActionId={noShowActionId}
  canMarkNoShowAppointment={isAppointmentOverdueCheckIn}
  onAppointmentCheckIn={handleCheckIn}
  onAppointmentNoShow={openNoShowModal}
  onAppointmentUndoNoShow={handleUndoNoShow}
  onAppointmentCancel={handleCancelAppt}
  onAppointmentReschedule={openRescheduleModal}
/>
              {selectedAppt && (
                <div
                  data-testid="calendar-selected-actions"
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 20,
                    background: '#ffffff',
                    borderTop: '1px solid #d1d5db',
                    boxShadow: '0 -4px 10px rgba(0,0,0,0.08)',
                    padding: '0.75rem 1rem',
                    marginTop: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ color: '#1f2937', fontSize: '0.875rem' }}>
                      <strong>Selected:</strong> {selectedAppt.patientName} · {new Date(selectedAppt.scheduledStart).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })} · {selectedAppt.providerName}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        data-testid="calendar-action-check-in"
                        className="ema-action-btn"
                        disabled={selectedAppt.status !== 'scheduled' || checkInActionId === selectedAppt.id}
                        onClick={() => handleCheckIn(selectedAppt)}
                        style={{
                          background: selectedAppt.status === 'scheduled' ? '#ede9fe' : '#f3f4f6',
                          color: selectedAppt.status === 'scheduled' ? '#5b21b6' : '#9ca3af',
                        }}
                      >
                        {checkInActionId === selectedAppt.id ? 'Checking In...' : 'Check In'}
                      </button>
<button
  type="button"
  data-testid={selectedAppt.status === 'no_show' ? 'calendar-action-undo-no-show' : 'calendar-action-no-show'}
  className="ema-action-btn"
  disabled={
    noShowActionId === selectedAppt.id ||
    (selectedAppt.status !== 'no_show' && !isAppointmentOverdueCheckIn(selectedAppt))
  }
  onClick={() => {
    if (selectedAppt.status === 'no_show') {
      handleUndoNoShow(selectedAppt);
    } else {
      openNoShowModal(selectedAppt);
    }
  }}
  style={{
    background: selectedAppt.status === 'no_show'
      ? '#eff6ff'
      : isAppointmentOverdueCheckIn(selectedAppt)
        ? '#ffedd5'
        : '#f3f4f6',
    color: selectedAppt.status === 'no_show'
      ? '#1d4ed8'
      : isAppointmentOverdueCheckIn(selectedAppt)
        ? '#9a3412'
        : '#9ca3af',
  }}
>
  {noShowActionId === selectedAppt.id
    ? (selectedAppt.status === 'no_show' ? 'Undoing...' : 'Marking...')
    : (selectedAppt.status === 'no_show' ? 'Undo No-Show' : 'Mark No-Show')}
</button>
                      <button
                        type="button"
                        data-testid="calendar-action-start-encounter"
                        className="ema-action-btn"
                        disabled={selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled' || rowAction?.id === selectedAppt.id}
                        onClick={() => handleStartEncounterFromSchedule(selectedAppt)}
                        style={{
                          background: (selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled')
                            ? '#f3f4f6'
                            : '#ecfdf5',
                          color: (selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled')
                            ? '#9ca3af'
                            : '#065f46',
                          opacity: rowAction?.id === selectedAppt.id ? 0.7 : 1,
                        }}
                      >
                        {rowAction?.id === selectedAppt.id && rowAction?.action === 'encounter'
                          ? 'Starting...'
                          : isLaserAppointmentType(selectedAppt.appointmentTypeName)
                            ? 'Start Laser Visit'
                            : 'Start Encounter'}
                      </button>
                      <button
                        type="button"
                        data-testid="calendar-action-reschedule"
                        className="ema-action-btn"
                        disabled={selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled'}
                        onClick={() => openRescheduleModal(selectedAppt)}
                        style={{
                          background: (selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled')
                            ? '#f3f4f6'
                            : '#e0f2fe',
                          color: (selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled')
                            ? '#9ca3af'
                            : '#075985',
                        }}
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        data-testid="calendar-action-cancel"
                        className="ema-action-btn"
                        disabled={selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled'}
                        onClick={() => handleCancelAppt(selectedAppt)}
                        style={{
                          background: (selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled')
                            ? '#f3f4f6'
                            : '#fef2f2',
                          color: (selectedAppt.status === 'completed' || selectedAppt.status === 'cancelled')
                            ? '#9ca3af'
                            : '#991b1b',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Appointment Finder Sidebar */}
        {showAppointmentFinder && (
          <div style={{
            width: '320px',
            background: 'linear-gradient(to bottom, #f0f9ff 0%, #e0f2fe 100%)',
            borderLeft: '2px solid #0284c7',
            padding: '1.5rem',
            overflowY: 'auto',
            boxShadow: '-4px 0 12px rgba(0,0,0,0.08)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#075985' }}>
                Appointment Finder
              </h3>
              <button
                onClick={() => setShowExpandedFinder(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: '#0284c7',
                  fontWeight: 500,
                  textDecoration: 'underline',
                }}
              >
                Quick Filters
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Patient <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderPatient"
                value={finderData.patientId}
                onChange={(e) => setFinderData({ ...finderData, patientId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="">Select patient...</option>
                {patients
                  .slice()
                  .sort((a, b) => `${a.lastName ?? ''}, ${a.firstName ?? ''}`.localeCompare(`${b.lastName ?? ''}, ${b.firstName ?? ''}`))
                  .map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.lastName}, {patient.firstName}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Locations</label>
              <select
                name="finderLocations"
                value={finderData.locations}
                onChange={(e) => setFinderData({ ...finderData, locations: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="">Any Location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Providers</label>
              <select
                name="finderProviders"
                value={finderData.providers}
                onChange={(e) => setFinderData({ ...finderData, providers: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="">Any Provider</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Appointment Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderAppointmentType"
                value={finderData.appointmentType}
                onChange={(e) => setFinderData({ ...finderData, appointmentType: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="">Click to select...</option>
                {appointmentTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Duration <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderDuration"
                value={finderData.duration}
                onChange={(e) => setFinderData({ ...finderData, duration: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Time Preference <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderTimePreference"
                value={finderData.timePreference}
                onChange={(e) => setFinderData({ ...finderData, timePreference: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="Anytime">Anytime</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Evening">Evening</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Weekday Preference</label>
              <select
                name="finderWeekdayPreference"
                value={finderData.weekdayPreference}
                onChange={(e) => setFinderData({ ...finderData, weekdayPreference: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="Any Day">Any Day</option>
                <option value="Weekdays">Weekdays Only</option>
                <option value="Weekends">Weekends Only</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Scheduling Preference <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderSchedulingPreference"
                value={finderData.schedulingPreference}
                onChange={(e) => setFinderData({ ...finderData, schedulingPreference: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="First available">First available</option>
                <option value="Specific date">Specific date</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Display Options</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                  <input
                    type="radio"
                    name="displayBy"
                    value="By Provider"
                    checked={finderData.displayBy === 'By Provider'}
                    onChange={(e) => setFinderData({ ...finderData, displayBy: e.target.value })}
                  />
                  By Provider
                </label>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                  <input
                    type="radio"
                    name="displayBy"
                    value="By Time Availability"
                    checked={finderData.displayBy === 'By Time Availability'}
                    onChange={(e) => setFinderData({ ...finderData, displayBy: e.target.value })}
                  />
                  By Time Availability
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setFinderData({
                    patientId: '',
                    locations: '',
                    providers: '',
                    appointmentType: '',
                    duration: '5',
                    timePreference: 'Anytime',
                    weekdayPreference: 'Any Day',
                    schedulingPreference: 'First available',
                    displayBy: 'By Provider',
                  });
                }}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  background: '#ffffff',
                  border: '1px solid #0284c7',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#0284c7',
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (!finderData.appointmentType) {
                    showError('Please select an appointment type');
                    return;
                  }
                  if (!finderData.patientId) {
                    showError('Please select a patient');
                    return;
                  }

                  setNewAppt((prev) => ({
                    ...prev,
                    patientId: finderData.patientId,
                    providerId: finderData.providers || prev.providerId,
                    appointmentTypeId: finderData.appointmentType,
                    locationId: finderData.locations || prev.locationId,
                    duration: Number(finderData.duration) || prev.duration,
                    date: prev.date || new Date().toISOString().split('T')[0],
                  }));
                  setShowNewApptModal(true);
                  showSuccess('Loaded patient into New Appointment. Pick an available time.');
                }}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                Search
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Appointments Table */}
      <div className="ema-section-header">Appointments List</div>

      <table className="ema-table">
        <thead>
          <tr>
            <th style={{ width: '40px' }}></th>
            <th>Time</th>
            <th>Patient</th>
            <th>Provider</th>
            <th>Type</th>
            <th>Location</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                Loading...
              </td>
            </tr>
          ) : filteredAppointments.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                No appointments scheduled
              </td>
            </tr>
          ) : (
            filteredAppointments.map((a) => {
              const isCompletedOrCancelled = a.status === 'completed' || a.status === 'cancelled';
              const isNoShow = a.status === 'no_show';
              const canCheckIn = a.status === 'scheduled';
              const isOverdueCheckIn = isAppointmentOverdueCheckIn(a);
              const canMarkNoShow = canCheckIn && isOverdueCheckIn;
              const isEncounterActionPending = rowAction?.id === a.id && rowAction?.action === 'encounter';
              const isEncounterDisabled = isCompletedOrCancelled || isEncounterActionPending;
              return (
                <tr
                  key={a.id}
                  style={{
                    background: selectedAppt?.id === a.id ? '#e0f2fe' : undefined,
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedAppt(a)}
                >
                  <td>
                    <input
                      type="radio"
                      name="selectedAppt"
                      checked={selectedAppt?.id === a.id}
                      onChange={() => setSelectedAppt(a)}
                      aria-label={`Select appointment for ${a.patientName}`}
                    />
                  </td>
                  <td>
                    {new Date(a.scheduledStart).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ema-patient-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/patients/${a.patientId}`);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#2563eb',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        font: 'inherit',
                      }}
                    >
                      {a.patientName}
                    </button>
                  </td>
                  <td>{a.providerName}</td>
                  <td>{a.appointmentTypeName}</td>
                  <td>{a.locationName}</td>
                  <td>
                    <span className={`ema-status ${a.status === 'completed' ? 'established' : a.status === 'cancelled' ? 'inactive' : 'pending'}`}>
                      {a.status}
                    </span>
                    {(() => {
                      const priorAuth = getAppointmentPriorAuthSnapshot(a);
                      if (!priorAuth.required) return null;
                      const colors = priorAuthStatusColors(priorAuth.status);
                      return (
                        <div
                          style={{
                            marginTop: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: colors.text,
                            background: colors.bg,
                            border: '1px solid ' + colors.border,
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.1rem 0.45rem',
                          }}
                        >
                          PA: {priorAuthStatusLabel(priorAuth.status)}
                        </div>
                      );
                    })()}
                    {isOverdueCheckIn && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', fontWeight: 600, color: '#9a3412' }}>
                        Overdue check-in
                      </div>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/patients/${a.patientId}`)}
                          title="Open patient chart"
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5f5',
                            background: '#eef2ff',
                            color: '#1e3a8a',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Chart
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCheckIn(a)}
                          disabled={!canCheckIn || checkInActionId === a.id}
                          aria-label={`Check in ${a.patientName}`}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: canCheckIn ? '1px solid #ddd6fe' : '1px solid #e5e7eb',
                            background: canCheckIn ? '#ede9fe' : '#f3f4f6',
                            color: canCheckIn ? '#5b21b6' : '#9ca3af',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: canCheckIn ? 'pointer' : 'not-allowed'
                          }}
                        >
                          {checkInActionId === a.id ? 'Checking...' : 'Check In'}
                        </button>
<button
  type="button"
  onClick={() => {
    if (isNoShow) {
      handleUndoNoShow(a);
    } else {
      openNoShowModal(a);
    }
  }}
  disabled={(isNoShow ? false : !canMarkNoShow) || noShowActionId === a.id}
  aria-label={isNoShow ? `Undo no-show for ${a.patientName}` : `Mark no-show for ${a.patientName}`}
  style={{
    padding: '4px 8px',
    borderRadius: '6px',
    border: isNoShow
      ? '1px solid #93c5fd'
      : canMarkNoShow
        ? '1px solid #fdba74'
        : '1px solid #e5e7eb',
    background: isNoShow
      ? '#eff6ff'
      : canMarkNoShow
        ? '#fff7ed'
        : '#f3f4f6',
    color: isNoShow
      ? '#1d4ed8'
      : canMarkNoShow
        ? '#9a3412'
        : '#9ca3af',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: (isNoShow || canMarkNoShow) ? 'pointer' : 'not-allowed'
  }}
>
  {noShowActionId === a.id
    ? (isNoShow ? 'Undoing...' : 'Marking...')
    : (isNoShow ? 'Undo No-Show' : 'No-Show')}
</button>
                        <button
                          type="button"
                          onClick={() => openRescheduleModal(a)}
                          disabled={isCompletedOrCancelled}
                          aria-label={`Reschedule ${a.patientName}`}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: isCompletedOrCancelled ? '1px solid #e5e7eb' : '1px solid #bae6fd',
                            background: isCompletedOrCancelled ? '#f3f4f6' : '#e0f2fe',
                            color: isCompletedOrCancelled ? '#9ca3af' : '#075985',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: isCompletedOrCancelled ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Reschedule
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelAppt(a)}
                          disabled={isCompletedOrCancelled}
                          aria-label={`Cancel appointment for ${a.patientName}`}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: isCompletedOrCancelled ? '1px solid #e5e7eb' : '1px solid #fecaca',
                            background: isCompletedOrCancelled ? '#f3f4f6' : '#fef2f2',
                            color: isCompletedOrCancelled ? '#9ca3af' : '#991b1b',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: isCompletedOrCancelled ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEncounterFromSchedule(a)}
                          disabled={isEncounterDisabled}
                          title="Start or resume encounter"
                          aria-label={`Start encounter for ${a.patientName}`}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid #d1fae5',
                            background: '#ecfdf5',
                            color: '#065f46',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: isEncounterDisabled ? 'not-allowed' : 'pointer',
                            opacity: isEncounterDisabled ? 0.6 : 1
                          }}
                        >
                          {isEncounterActionPending
                            ? 'Starting…'
                            : isLaserAppointmentType(a.appointmentTypeName)
                              ? 'Start Laser Visit'
                              : 'Start Encounter'}
                        </button>
                      </div>
                      <select
                        name={`appointmentStatus-${a.id}`}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          borderRadius: '4px',
                          border: '1px solid #d1d5db'
                        }}
                        onChange={(e) => handleStatusChange(a.id, e.target.value)}
                        defaultValue=""
                        aria-label={`Change status for ${a.patientName}`}
                      >
                        <option value="">Change Status</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="checked_in">Checked In</option>
                        <option value="in_room">In Room</option>
                        <option value="with_provider">With Provider</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="no_show">No Show</option>
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <Modal
        isOpen={showCopayCheckInModal}
        title="Check-In Review"
        onClose={closeCopayDecisionModal}
      >
        <div style={{ padding: '1rem', minWidth: '420px' }}>
          <div style={{ marginBottom: '0.75rem', color: '#1f2937' }}>
            <strong>Patient:</strong> {copayCheckInAppointment?.patientName || 'Selected patient'}
          </div>
          <div style={{ marginBottom: '1rem', color: '#1f2937' }}>
            <strong>Expected copay:</strong> ${modalCopayAmount.toFixed(2)}
          </div>
          <div style={{ marginBottom: '1rem', color: '#1f2937' }}>
            <strong>Past balance due:</strong> ${modalOutstandingBalance.toFixed(2)}
          </div>
          {modalTotalDue > 0 ? (
            <div
              style={{
                marginBottom: '1rem',
                border: '1px solid #dbeafe',
                background: '#eff6ff',
                color: '#1e3a8a',
                borderRadius: '6px',
                padding: '0.75rem',
                fontSize: '0.875rem',
              }}
            >
              <strong>Total due today:</strong> ${modalTotalDue.toFixed(2)}
            </div>
          ) : null}

          <div
            style={{
              marginBottom: '1rem',
              border: '1px solid ' + modalPriorAuthColors.border,
              background: modalPriorAuthColors.bg,
              color: modalPriorAuthColors.text,
              borderRadius: '6px',
              padding: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div>
                <strong>Prior authorization:</strong>{' '}
                {modalPriorAuth.required ? priorAuthStatusLabel(modalPriorAuth.status) : 'Not required for this visit type'}
              </div>
              {modalPriorAuth.authNumber ? (
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Auth #: {modalPriorAuth.authNumber}
                </span>
              ) : null}
            </div>

            {modalPriorAuthNeedsAction ? (
              <>
                <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', lineHeight: 1.4 }}>
                  This appointment appears to need prior authorization and it is not approved yet. Front desk can assist the patient before finalizing check-in.
                </div>
                <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleCopyCheckInLink}
                    style={{
                      padding: '0.4rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #93c5fd',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                    }}
                  >
                    Copy Patient Check-In Link
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenKioskFromCheckIn}
                    style={{
                      padding: '0.4rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #bae6fd',
                      background: '#ecfeff',
                      color: '#0e7490',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                    }}
                  >
                    Open iPad Kiosk
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenPriorAuthQueue}
                    style={{
                      padding: '0.4rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid #fed7aa',
                      background: '#fff7ed',
                      color: '#c2410c',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                    }}
                  >
                    Open Prior Auth Queue
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {modalHasCopay ? (
            <>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                  Amount to collect now
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={copayDecisionAmount}
                  onChange={(e) => setCopayDecisionAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.625rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setCopayDecisionAmount(modalCopayAmount.toFixed(2))}
                    style={{
                      padding: '0.35rem 0.6rem',
                      borderRadius: '999px',
                      border: '1px solid #bfdbfe',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    Copay ${modalCopayAmount.toFixed(2)}
                  </button>
                  {modalHasOutstandingBalance ? (
                    <button
                      type="button"
                      onClick={() => setCopayDecisionAmount(modalOutstandingBalance.toFixed(2))}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '999px',
                        border: '1px solid #fcd34d',
                        background: '#fffbeb',
                        color: '#92400e',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      Past Balance ${modalOutstandingBalance.toFixed(2)}
                    </button>
                  ) : null}
                  {modalTotalDue > modalCopayAmount ? (
                    <button
                      type="button"
                      onClick={() => setCopayDecisionAmount(modalTotalDue.toFixed(2))}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '999px',
                        border: '1px solid #86efac',
                        background: '#f0fdf4',
                        color: '#166534',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      Total Due ${modalTotalDue.toFixed(2)}
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                  Payment method
                </label>
                <select
                  value={copayDecisionPaymentMethod}
                  onChange={(e) => setCopayDecisionPaymentMethod(e.target.value as 'cash' | 'credit' | 'debit' | 'check')}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.625rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="cash">Cash</option>
                  <option value="credit">Credit Card</option>
                  <option value="debit">Debit Card</option>
                  <option value="check">Check</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                  Bypass reason (if not collecting now)
                </label>
                <select
                  value={copayBypassReason}
                  onChange={(e) => setCopayBypassReason(e.target.value as CopayBypassReason)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.625rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                    marginBottom: '0.75rem',
                  }}
                >
                  {Object.entries(COPAY_BYPASS_REASON_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                  Check-in notes (optional)
                </label>
                <textarea
                  value={copayDecisionNotes}
                  onChange={(e) => setCopayDecisionNotes(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.625rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  marginBottom: '0.75rem',
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  color: '#166534',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  fontSize: '0.875rem',
                }}
              >
                No copay is due based on current insurance data. Proceed with check-in.
              </div>
              {modalHasOutstandingBalance ? (
                <div
                  style={{
                    marginBottom: '1rem',
                    border: '1px solid #fde68a',
                    background: '#fffbeb',
                    color: '#92400e',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    fontSize: '0.8125rem',
                  }}
                >
                  Patient has a past balance due. Front desk can collect this now or at checkout.
                </div>
              ) : null}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={closeCopayDecisionModal}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#374151',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            {modalHasCopay ? (
              <>
                <button
                  type="button"
                  onClick={handleCopayDeferAndCheckIn}
                  style={{
                    padding: '0.5rem 0.875rem',
                    borderRadius: '6px',
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontWeight: 600,
                  }}
                >
                  Bypass Payment + Check In
                </button>
                <button
                  type="button"
                  onClick={handleCopayCollectAndCheckIn}
                  style={{
                    padding: '0.5rem 0.875rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'linear-gradient(to bottom, #16a34a 0%, #15803d 100%)',
                    color: '#ffffff',
                    fontWeight: 600,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                  }}
                >
                  Collect + Check In
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleCheckInWithoutCopay}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(to bottom, #16a34a 0%, #15803d 100%)',
                  color: '#ffffff',
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                }}
              >
                Check In Now
              </button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showNoShowModal}
        title="Confirm No-Show"
        onClose={closeNoShowModal}
      >
        <div style={{ padding: '1rem', minWidth: '420px' }}>
          <div style={{ marginBottom: '0.75rem', color: '#1f2937' }}>
            <strong>Patient:</strong> {noShowAppointment?.patientName || 'Selected patient'}
          </div>
          <div style={{ marginBottom: '0.75rem', color: '#1f2937' }}>
            <strong>Scheduled time:</strong>{' '}
            {noShowAppointment
              ? new Date(noShowAppointment.scheduledStart).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : 'N/A'}
          </div>
          <div style={{ marginBottom: '0.75rem', color: '#9a3412', fontSize: '0.875rem', fontWeight: 600 }}>
            A no-show fee will be posted automatically when confirmed.
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
              Confirmation note
            </label>
            <textarea
              value={noShowReason}
              onChange={(e) => setNoShowReason(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem 0.625rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={closeNoShowModal}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#374151',
                fontWeight: 500,
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirmNoShow}
              disabled={!noShowAppointment || noShowActionId === noShowAppointment?.id}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '6px',
                border: 'none',
                background: 'linear-gradient(to bottom, #f97316 0%, #ea580c 100%)',
                color: '#ffffff',
                fontWeight: 600,
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                opacity: !noShowAppointment || noShowActionId === noShowAppointment?.id ? 0.7 : 1,
              }}
            >
              {noShowActionId === noShowAppointment?.id ? 'Marking...' : 'Confirm No-Show'}
            </button>
          </div>
        </div>
      </Modal>

      {/* New Appointment Modal */}
      <AppointmentModal
        isOpen={showNewApptModal}
        onClose={() => setShowNewApptModal(false)}
        onSave={handleCreateAppointment}
        patients={patients}
        providers={providers}
        locations={locations}
        appointmentTypes={appointmentTypes}
        availability={availability}
        appointments={appointments}
        timeBlocks={timeBlocks}
        initialData={{
          patientId: newAppt.patientId,
          providerId: newAppt.providerId,
          locationId: newAppt.locationId,
          date: newAppt.date,
          time: newAppt.time,
        }}
      />

      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        onSave={handleReschedule}
        appointment={selectedAppt}
        providers={providers}
        availability={availability}
        appointments={appointments}
      />

      {/* Time Block Modal */}
      <TimeBlockModal
        isOpen={showTimeBlockModal}
        onClose={() => {
          setShowTimeBlockModal(false);
          setSelectedTimeBlock(null);
          setTimeBlockInitialData(undefined);
        }}
        onSave={handleSaveTimeBlock}
        onDelete={handleDeleteTimeBlock}
        providers={providers}
        timeBlock={selectedTimeBlock}
        initialData={timeBlockInitialData}
      />

      {/* Expanded Appointment Finder Modal */}
      <Modal
        isOpen={showExpandedFinder}
        title="Expanded Appointment Finder"
        onClose={() => setShowExpandedFinder(false)}
      >
        <div style={{ padding: '1rem', minWidth: '600px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {/* 1st Appointment Column */}
            <div>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: '#075985', borderBottom: '2px solid #0284c7', paddingBottom: '0.5rem' }}>
                1st Appointment
              </h4>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Appointment Type <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="firstAppointmentType"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Click to select...</option>
                  {appointmentTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Locations</label>
                <select
                  name="firstLocations"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Any Location</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Providers</label>
                <select
                  name="firstProviders"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Any Provider</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.fullName}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Duration <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="firstDuration"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Time Preference <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="firstTimePreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="Anytime">Anytime</option>
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Evening">Evening</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Weekday Preference</label>
                <select
                  name="firstWeekdayPreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="Any Day">Any Day</option>
                  <option value="Weekdays">Weekdays Only</option>
                  <option value="Weekends">Weekends Only</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Scheduling Preference <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="firstSchedulingPreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="First available">First available</option>
                  <option value="Specific date">Specific date</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Display Options</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <input type="radio" name="display1" value="By Provider" defaultChecked />
                    By Provider
                  </label>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <input type="radio" name="display1" value="By Time Availability" />
                    By Time Availability
                  </label>
                </div>
              </div>

              <button
                onClick={() => showSuccess('Searching for 1st appointment...')}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                Search 1st Appt
              </button>
            </div>

            {/* 2nd Appointment Column */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #0284c7', paddingBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#075985' }}>
                  2nd Appointment
                </h4>
                <button
                  onClick={() => navigate('/appointment-finder')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    color: '#0284c7',
                    fontWeight: 500,
                    textDecoration: 'underline',
                  }}
                >
                  Quick Filters
                </button>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input type="checkbox" name="secondAfterFirstAppointment" />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  After 1st Appointment <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>ℹ️</span>
                </span>
              </label>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Appointment Type <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="secondAppointmentType"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Click to select...</option>
                  {appointmentTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Locations</label>
                <select
                  name="secondLocations"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Any Location</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Providers</label>
                <select
                  name="secondProviders"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Any Provider</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.fullName}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Duration <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="secondDuration"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Time Preference <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="secondTimePreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="Anytime">Anytime</option>
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Evening">Evening</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Weekday Preference</label>
                <select
                  name="secondWeekdayPreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="Any Day">Any Day</option>
                  <option value="Weekdays">Weekdays Only</option>
                  <option value="Weekends">Weekends Only</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Scheduling Preference <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="secondSchedulingPreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="First available">First available</option>
                  <option value="Specific date">Specific date</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Display Options</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <input type="radio" name="display2" value="By Provider" defaultChecked />
                    By Provider
                  </label>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <input type="radio" name="display2" value="By Time Availability" />
                    By Time Availability
                  </label>
                </div>
              </div>

              <button
                onClick={() => showSuccess('Searching for 2nd appointment...')}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                Search 2nd Appt
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowExpandedFinder(false)}
              style={{
                padding: '0.625rem 1.5rem',
                background: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
              }}
            >
              Close
            </button>
            <button
              onClick={() => {
                showSuccess('Searching all appointments...');
                setShowExpandedFinder(false);
              }}
              style={{
                padding: '0.625rem 1.5rem',
                background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#ffffff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              Search All
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
