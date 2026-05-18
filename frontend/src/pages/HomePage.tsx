import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardCheck,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Inbox,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { AppointmentFinderWorkspace } from '../components/schedule/AppointmentFinderWorkspace';
import { AppointmentModal, type AppointmentFormData } from '../components/schedule/AppointmentModal';
import {
  createPatient,
  createAppointment,
  fetchAppointments,
  fetchAppointmentTypes,
  fetchAvailability,
  fetchEncounters,
  fetchFrontDeskSchedule,
  fetchLocations,
  fetchTasks,
  fetchOrders,
  fetchPatients,
  fetchProviders,
  fetchTimeBlocks,
  fetchUnreadCount,
  fetchBiopsyCommandCenter,
  type BiopsyCommandCenterSummary,
  type BiopsySafetyItem,
  type TimeBlock,
} from '../api';
import {
  fetchARAging,
  fetchClaims,
  fetchFinancialWorkQueue,
  fetchPaymentsSummary,
} from '../api/financials';
import { canAccessModule } from '../config/moduleAccess';
import { getEffectiveRoles } from '../utils/roles';
import type { Appointment, AppointmentType, Availability, Location, Patient, Provider } from '../types';

interface Encounter {
  id: string;
  patientId: string;
  providerId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface LocationScopeOption {
  id: string;
  name: string;
}

type StoredScheduleViewMode = 'day' | 'week' | 'month';

interface StoredScheduleContext {
  viewMode: StoredScheduleViewMode;
  dayOffset: number;
  providerFilter: string;
  typeFilter: string;
  locationFilter: string;
  showWeekends: boolean;
}

interface HomeStats {
  appointmentsCount: number;
  checkedInCount: number;
  completedCount: number;
  pendingTasks: number;
  openEncounters: number;
  waitingCount: number;
  inRoomsCount: number;
  checkoutCount: number;
  scheduleViewCount: number;
  scheduleViewMode: StoredScheduleViewMode;
  scheduleDateLabel: string;
  scheduleViewDateLabel: string;
  scheduleHasFilters: boolean;
  pendingLabOrders: number;
  unsignedNotesToday: number;
  unreadMessageThreads: number;
  myNotesNeedingWork: number;
  teamNotesNeedingWork: number;
  needsInsuranceVerification: number;
  balanceDueAppointments: number;
  copayDueCents: number;
  noShowCount: number;
  cancelledCount: number;
  netCollectionsCents: number;
  patientCollectionsCents: number;
  payerCollectionsCents: number;
  claimsInQueue: number;
  claimsDeniedRejected: number;
  financialWorkQueueCount: number;
  arTotalCents: number;
  arOver90Cents: number;
}

interface HomeBiopsySafety {
  summary: BiopsyCommandCenterSummary;
  critical: BiopsySafetyItem[];
}

interface HomeDashboardAppointment {
  id: string;
  patientId?: string;
  patientName: string;
  providerName: string;
  locationName: string;
  appointmentTypeName: string;
  scheduledStart?: string;
  status: string;
  insuranceVerified?: boolean;
  copayCents: number;
  outstandingBalanceCents: number;
  waitTimeMinutes?: number;
  riskFlags: string[];
}

interface HomeSchedulePulse {
  nextAppointments: HomeDashboardAppointment[];
  attentionAppointments: HomeDashboardAppointment[];
}

interface AppointmentFinderSelection {
  patientId: string;
  providerId: string;
  locationId: string;
  appointmentTypeId: string;
  duration: number;
  date: string;
  time: string;
}

const DASHBOARD_REFRESH_INTERVAL_MS = 30000;
const CALENDAR_WINDOW_START_HOUR = 7;
const CALENDAR_WINDOW_END_HOUR = 18;
const HOME_FINDER_LOOKAHEAD_DAYS = 120;

const toLocalIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isTaskPending = (status: string | undefined): boolean => {
  const normalized = String(status || '').toLowerCase();
  return !['completed', 'cancelled', 'closed', 'done', 'resolved'].includes(normalized);
};

const isEncounterOpen = (status: string | undefined): boolean => {
  const normalized = String(status || '').toLowerCase();
  return !['finalized', 'signed', 'locked', 'completed', 'closed', 'cancelled'].includes(normalized);
};

const isAppointmentIncludedInOverview = (status: string | undefined): boolean =>
  String(status || '').toLowerCase() !== 'cancelled';

const isCheckedIn = (status: string | undefined): boolean =>
  String(status || '').toLowerCase() === 'checked_in';

const isInRooms = (status: string | undefined): boolean => {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'in_room' || normalized === 'with_provider';
};

const isCompletedVisit = (status: string | undefined): boolean => {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'completed' || normalized === 'checked_out';
};

const isOnLocalDay = (value: string | undefined, dayKey: string): boolean => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return toLocalIsoDate(date) === dayKey;
};

const isWithinCalendarWindow = (value: string | undefined): boolean => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const hour = date.getHours();
  return hour >= CALENDAR_WINDOW_START_HOUR && hour < CALENDAR_WINDOW_END_HOUR;
};

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const getScheduleViewRange = (currentDate: Date, viewMode: StoredScheduleViewMode, showWeekends = false): { start: Date; end: Date } => {
  if (viewMode === 'day') {
    return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
  }

  if (viewMode === 'week') {
    const monday = startOfDay(currentDate);
    const dayOfWeek = monday.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(monday.getDate() + diffToMonday);
    const weekEnd = endOfDay(monday);
    weekEnd.setDate(monday.getDate() + (showWeekends ? 6 : 4));
    return { start: monday, end: weekEnd };
  }

  const monthStart = startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  monthStart.setDate(monthStart.getDate() - 7);
  const monthEnd = endOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
  monthEnd.setDate(monthEnd.getDate() + 14);
  return { start: monthStart, end: monthEnd };
};

const loadStoredScheduleContext = (): StoredScheduleContext => {
  const rawViewMode = localStorage.getItem('sched:viewMode');
  const viewMode: StoredScheduleViewMode =
    rawViewMode === 'week' || rawViewMode === 'month' ? rawViewMode : 'day';

  const rawDayOffset = Number(localStorage.getItem('sched:dayOffset') || 0);
  const dayOffset = Number.isFinite(rawDayOffset) ? rawDayOffset : 0;

  return {
    viewMode,
    dayOffset,
    providerFilter: localStorage.getItem('sched:provider') || 'all',
    typeFilter: localStorage.getItem('sched:type') || 'all',
    locationFilter: localStorage.getItem('sched:location') || 'all',
    showWeekends: localStorage.getItem('sched:showWeekends') === 'true',
  };
};

const numberOrZero = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const currencyFromCents = (cents: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(numberOrZero(cents) / 100);

const formatAppointmentTime = (value: string | undefined): string => {
  if (!value) return 'Unscheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const normalizeStatus = (value: unknown): string => String(value || '').trim().toLowerCase();

const statusLabel = (value: unknown): string => {
  const normalized = normalizeStatus(value);
  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    checked_in: 'Waiting',
    in_room: 'In Room',
    with_provider: 'With Provider',
    checkout: 'Checkout',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
    ready: 'Ready',
    submitted: 'Submitted',
    accepted: 'Accepted',
    denied: 'Denied',
    rejected: 'Rejected',
    appealed: 'Appealed',
  };
  return labels[normalized] || String(value || 'Open');
};

const centsFromDollars = (value: unknown): number => Math.round(numberOrZero(value) * 100);

const getAppointmentPatientName = (appointment: any): string => {
  const explicit = String(appointment.patientName || '').trim();
  if (explicit) return explicit;

  const first = String(appointment.patientFirstName || appointment.firstName || '').trim();
  const last = String(appointment.patientLastName || appointment.lastName || '').trim();
  const name = `${first} ${last}`.trim();
  return name || String(appointment.patientId || 'Patient');
};

const getAppointmentRiskFlags = (appointment: any): string[] => {
  const flags: string[] = [];
  const status = normalizeStatus(appointment.status);
  const waitTime = numberOrZero(appointment.waitTimeMinutes);
  const outstandingBalance = centsFromDollars(appointment.outstandingBalance);
  const paymentDueCents = numberOrZero(appointment.paymentDueCents);
  const copayCents = centsFromDollars(appointment.copayAmount);

  if (appointment.insuranceVerified === false) flags.push('Insurance');
  if (outstandingBalance > 0 || paymentDueCents > 0) flags.push('Balance');
  if (copayCents > 0 && !['completed', 'cancelled', 'no_show'].includes(status)) flags.push('Copay');
  if (waitTime >= 20) flags.push('Wait');
  if (status === 'no_show') flags.push('No-show');
  return flags;
};

const toDashboardAppointment = (appointment: any): HomeDashboardAppointment => ({
  id: String(appointment.id || ''),
  patientId: appointment.patientId ? String(appointment.patientId) : undefined,
  patientName: getAppointmentPatientName(appointment),
  providerName: String(appointment.providerName || appointment.provider || 'Unassigned'),
  locationName: String(appointment.locationName || 'No location'),
  appointmentTypeName: String(appointment.appointmentTypeName || appointment.typeName || appointment.reason || 'Visit'),
  scheduledStart: appointment.scheduledStart,
  status: String(appointment.status || 'scheduled'),
  insuranceVerified: appointment.insuranceVerified,
  copayCents: centsFromDollars(appointment.copayAmount),
  outstandingBalanceCents: Math.max(centsFromDollars(appointment.outstandingBalance), numberOrZero(appointment.paymentDueCents)),
  waitTimeMinutes: appointment.waitTimeMinutes !== undefined ? numberOrZero(appointment.waitTimeMinutes) : undefined,
  riskFlags: getAppointmentRiskFlags(appointment),
});

const extractArray = (payload: any, keys: string[]): any[] => {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
};

const isWithinDateRange = (value: string | undefined, start: Date, end: Date): boolean => {
  if (!value) return false;
  const dateMs = new Date(value).getTime();
  if (Number.isNaN(dateMs)) return false;
  return dateMs >= start.getTime() && dateMs <= end.getTime();
};

const isTelehealthAppointment = (appointment: any): boolean => {
  const combined = `${appointment.appointmentTypeName || appointment.typeName || ''} ${appointment.locationName || ''}`.toLowerCase();
  return combined.includes('telehealth') || combined.includes('video') || combined.includes('virtual');
};

const matchesStoredScheduleFilters = (appointment: any, scheduleContext: StoredScheduleContext): boolean => {
  if (scheduleContext.providerFilter !== 'all' && appointment.providerId !== scheduleContext.providerFilter) {
    return false;
  }

  if (scheduleContext.typeFilter !== 'all' && appointment.appointmentTypeId !== scheduleContext.typeFilter) {
    return false;
  }

  const telehealthOverride =
    scheduleContext.providerFilter !== 'all' &&
    isTelehealthAppointment(appointment);
  if (
    scheduleContext.locationFilter !== 'all' &&
    appointment.locationId !== scheduleContext.locationFilter &&
    !telehealthOverride
  ) {
    return false;
  }

  return true;
};

const isClaimInQueue = (claim: any): boolean =>
  ['draft', 'ready', 'submitted', 'accepted'].includes(normalizeStatus(claim.status));

const isClaimAtRisk = (claim: any): boolean =>
  ['denied', 'rejected', 'appealed'].includes(normalizeStatus(claim.status)) ||
  normalizeStatus(claim.scrubStatus) === 'failed';

const getCollectionsCents = (paymentsSummary: any) => {
  const patientCollectionsCents =
    numberOrZero(paymentsSummary?.calculated?.postedPatientPaymentsCents) ||
    extractArray(paymentsSummary, ['patientPaymentsByMethod']).reduce(
      (sum, row) => sum + numberOrZero(row.totalCents),
      0,
    );
  const payerCollectionsCents =
    numberOrZero(paymentsSummary?.calculated?.payerAppliedCents) ||
    numberOrZero(paymentsSummary?.payerPaymentsSummary?.appliedCents);
  const netCollectionsCents =
    numberOrZero(paymentsSummary?.calculated?.netCollectionsCents) ||
    patientCollectionsCents + payerCollectionsCents;

  return {
    patientCollectionsCents,
    payerCollectionsCents,
    netCollectionsCents,
  };
};

const getArAgingCents = (aging: any) => {
  const arTotalCents =
    numberOrZero(aging?.totals?.totalBalanceCents) ||
    extractArray(aging, ['buckets']).reduce((sum, bucket) => sum + numberOrZero(bucket.totalBalanceCents), 0);
  const arOver90Cents =
    numberOrZero(aging?.totals?.over90BalanceCents) ||
    extractArray(aging, ['buckets'])
      .filter((bucket) => {
        const key = String(bucket.key || bucket.label || '').toLowerCase();
        return key.includes('91') || key.includes('120');
      })
      .reduce((sum, bucket) => sum + numberOrZero(bucket.totalBalanceCents), 0);

  return { arTotalCents, arOver90Cents };
};

const INITIAL_STATS: HomeStats = {
  appointmentsCount: 0,
  checkedInCount: 0,
  completedCount: 0,
  pendingTasks: 0,
  openEncounters: 0,
  waitingCount: 0,
  inRoomsCount: 0,
  checkoutCount: 0,
  scheduleViewCount: 0,
  scheduleViewMode: 'day',
  scheduleDateLabel: '',
  scheduleViewDateLabel: '',
  scheduleHasFilters: false,
  pendingLabOrders: 0,
  unsignedNotesToday: 0,
  unreadMessageThreads: 0,
  myNotesNeedingWork: 0,
  teamNotesNeedingWork: 0,
  needsInsuranceVerification: 0,
  balanceDueAppointments: 0,
  copayDueCents: 0,
  noShowCount: 0,
  cancelledCount: 0,
  netCollectionsCents: 0,
  patientCollectionsCents: 0,
  payerCollectionsCents: 0,
  claimsInQueue: 0,
  claimsDeniedRejected: 0,
  financialWorkQueueCount: 0,
  arTotalCents: 0,
  arOver90Cents: 0,
};

export function HomePage() {
  const { session, user } = useAuth();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [overviewLocationFilter, setOverviewLocationFilter] = useState('all');
  const [overviewLocationOptions, setOverviewLocationOptions] = useState<LocationScopeOption[]>([]);
  const [stats, setStats] = useState<HomeStats>(INITIAL_STATS);
  const [biopsySafety, setBiopsySafety] = useState<HomeBiopsySafety | null>(null);
  const [schedulePulse, setSchedulePulse] = useState<HomeSchedulePulse>({
    nextAppointments: [],
    attentionAppointments: [],
  });

  const [showRegulatoryModal, setShowRegulatoryModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showAppointmentFinder, setShowAppointmentFinder] = useState(false);
  const [showFinderAppointmentModal, setShowFinderAppointmentModal] = useState(false);
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderLoaded, setFinderLoaded] = useState(false);
  const [finderAppointments, setFinderAppointments] = useState<Appointment[]>([]);
  const [finderPatients, setFinderPatients] = useState<Patient[]>([]);
  const [finderProviders, setFinderProviders] = useState<Provider[]>([]);
  const [finderLocations, setFinderLocations] = useState<Location[]>([]);
  const [finderAppointmentTypes, setFinderAppointmentTypes] = useState<AppointmentType[]>([]);
  const [finderAvailability, setFinderAvailability] = useState<Availability[]>([]);
  const [finderTimeBlocks, setFinderTimeBlocks] = useState<TimeBlock[]>([]);
  const [finderAppointmentInitialData, setFinderAppointmentInitialData] = useState<AppointmentFinderSelection | undefined>(undefined);

  const [reminderData, setReminderData] = useState({
    doctorsNote: '',
    reminderText: '',
    reminderDate: '',
    preferredContact: 'Unspecified',
  });

  const resetReminderData = () => {
    setReminderData({
      doctorsNote: '',
      reminderText: '',
      reminderDate: '',
      preferredContact: 'Unspecified',
    });
  };

  const effectiveRoles = useMemo(() => getEffectiveRoles(user || session?.user), [session?.user, user]);
  const canUseAppointmentFinder = useMemo(
    () => canAccessModule(effectiveRoles, 'schedule'),
    [effectiveRoles]
  );

  const finderSummary = useMemo(() => {
    if (!finderLoaded) {
      return {
        patients: 'Ready',
        providers: 'Live',
        visitTypes: 'Smart',
      };
    }

    return {
      patients: String(finderPatients.length),
      providers: String(finderProviders.length),
      visitTypes: String(finderAppointmentTypes.length),
    };
  }, [finderAppointmentTypes.length, finderLoaded, finderPatients.length, finderProviders.length]);

  const loadStats = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const todayStr = toLocalIsoDate(new Date());
      const scheduleContext = loadStoredScheduleContext();
      const todayDate = startOfDay(new Date());
      const todayRange = getScheduleViewRange(todayDate, 'day');
      const scheduleDate = startOfDay(new Date());
      scheduleDate.setDate(scheduleDate.getDate() + scheduleContext.dayOffset);
      const scheduleRange = getScheduleViewRange(scheduleDate, scheduleContext.viewMode, scheduleContext.showWeekends);

      const queryStart = new Date(Math.min(todayDate.getTime(), scheduleRange.start.getTime()));
      queryStart.setDate(queryStart.getDate() - 1);
      const queryEnd = new Date(Math.max(endOfDay(todayDate).getTime(), scheduleRange.end.getTime()));
      queryEnd.setDate(queryEnd.getDate() + 1);
      const canLoadAppointments = canAccessModule(effectiveRoles, 'schedule');
      const canLoadEncounters = canAccessModule(effectiveRoles, 'notes');
      const canLoadOrders = canAccessModule(effectiveRoles, 'orders');
      const canLoadUnreadMessages = canAccessModule(effectiveRoles, 'mail');
      const canLoadBiopsySafety = canAccessModule(effectiveRoles, 'labs');
      const canLoadFinancials = canAccessModule(effectiveRoles, 'financials');
      const canLoadClaims = canAccessModule(effectiveRoles, 'claims') || canAccessModule(effectiveRoles, 'clearinghouse') || canLoadFinancials;

      const [
        appointmentsRes,
        frontDeskRes,
        encountersRes,
        tasksRes,
        ordersRes,
        unreadRes,
        biopsyRes,
        claimsRes,
        financialWorkQueueRes,
        paymentsSummaryRes,
        arAgingRes,
      ] = await Promise.all([
        canLoadAppointments
          ? fetchAppointments(session.tenantId, session.accessToken, {
              startDate: toLocalIsoDate(queryStart),
              endDate: toLocalIsoDate(queryEnd),
            })
          : Promise.resolve({ appointments: [] }),
        canLoadAppointments
          ? fetchFrontDeskSchedule(session.tenantId, session.accessToken).catch(() => null)
          : Promise.resolve(null),
        canLoadEncounters
          ? fetchEncounters(session.tenantId, session.accessToken).catch(() => ({ encounters: [] }))
          : Promise.resolve({ encounters: [] }),
        fetchTasks(session.tenantId, session.accessToken),
        canLoadOrders
          ? fetchOrders(session.tenantId, session.accessToken).catch(() => ({ orders: [] }))
          : Promise.resolve({ orders: [] }),
        canLoadUnreadMessages
          ? fetchUnreadCount(session.tenantId, session.accessToken).catch(() => ({ count: 0 }))
          : Promise.resolve({ count: 0 }),
        canLoadBiopsySafety
          ? fetchBiopsyCommandCenter(session.tenantId, session.accessToken).catch(() => null)
          : Promise.resolve(null),
        canLoadClaims
          ? fetchClaims({ tenantId: session.tenantId, accessToken: session.accessToken }).catch(() => ({ claims: [] }))
          : Promise.resolve({ claims: [] }),
        canLoadFinancials
          ? fetchFinancialWorkQueue({ tenantId: session.tenantId, accessToken: session.accessToken }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
        canLoadFinancials
          ? fetchPaymentsSummary(
              { tenantId: session.tenantId, accessToken: session.accessToken },
              { startDate: todayStr, endDate: todayStr },
            ).catch(() => null)
          : Promise.resolve(null),
        canLoadFinancials
          ? fetchARAging({ tenantId: session.tenantId, accessToken: session.accessToken }, { asOfDate: todayStr }).catch(() => null)
          : Promise.resolve(null),
      ]);

      const appointments = appointmentsRes.appointments || [];
      const frontDeskAppointments = extractArray(frontDeskRes, ['appointments']);
      const encountersData = (encountersRes.encounters || []) as Encounter[];
      const tasks = tasksRes.tasks || [];
      const orders = ordersRes.orders || [];
      const unreadMessageThreads = Number(unreadRes.count || 0);
      const claims = extractArray(claimsRes, ['claims', 'data']);
      const financialWorkQueueItems = extractArray(financialWorkQueueRes, ['items', 'workQueue', 'data']);
      const { patientCollectionsCents, payerCollectionsCents, netCollectionsCents } = getCollectionsCents(paymentsSummaryRes);
      const { arTotalCents, arOver90Cents } = getArAgingCents(arAgingRes);
      const frontDeskByAppointmentId = new Map<string, any>();
      frontDeskAppointments.forEach((appointment: any) => {
        if (appointment?.id) {
          frontDeskByAppointmentId.set(String(appointment.id), appointment);
        }
      });
      const enrichedAppointments = appointments.map((appointment: any) => {
        const frontDeskAppointment = frontDeskByAppointmentId.get(String(appointment.id || ''));
        return frontDeskAppointment
          ? {
              ...appointment,
              ...frontDeskAppointment,
              id: appointment.id || frontDeskAppointment.id,
              patientId: appointment.patientId || frontDeskAppointment.patientId,
              providerId: appointment.providerId || frontDeskAppointment.providerId,
              appointmentTypeId: appointment.appointmentTypeId || frontDeskAppointment.appointmentTypeId,
              locationId: appointment.locationId || frontDeskAppointment.locationId,
              scheduledStart: appointment.scheduledStart || frontDeskAppointment.scheduledStart,
              scheduledEnd: appointment.scheduledEnd || frontDeskAppointment.scheduledEnd,
            }
          : appointment;
      });
      const scheduleSourceAppointments = enrichedAppointments.length > 0 ? enrichedAppointments : frontDeskAppointments;
      setBiopsySafety(
        biopsyRes
          ? {
              summary: biopsyRes.summary,
              critical: biopsyRes.queues.critical || [],
            }
          : null,
      );

      const todayScheduleAllAppointments = scheduleSourceAppointments
        .filter((appointment: any) => isWithinDateRange(appointment.scheduledStart, todayRange.start, todayRange.end))
        .filter((appointment: any) => matchesStoredScheduleFilters(appointment, scheduleContext));
      const dashboardAppointments = todayScheduleAllAppointments.filter((appointment: any) =>
        isAppointmentIncludedInOverview(appointment.status)
      );

      const locationMap = new Map<string, string>();
      dashboardAppointments.forEach((appointment: any) => {
        if (!appointment.locationId || locationMap.has(appointment.locationId)) return;
        locationMap.set(appointment.locationId, appointment.locationName || 'Unknown Location');
      });
      const locationOptions = Array.from(locationMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setOverviewLocationOptions(locationOptions);

      const effectiveOverviewLocation =
        overviewLocationFilter !== 'all' && locationMap.has(overviewLocationFilter)
          ? overviewLocationFilter
          : 'all';
      if (overviewLocationFilter !== 'all' && effectiveOverviewLocation === 'all') {
        setOverviewLocationFilter('all');
      }

      const scopedAppointments = dashboardAppointments.filter((appointment: any) =>
        effectiveOverviewLocation === 'all' ? true : appointment.locationId === effectiveOverviewLocation
      );
      const scopedAllAppointments = todayScheduleAllAppointments.filter((appointment: any) =>
        effectiveOverviewLocation === 'all' ? true : appointment.locationId === effectiveOverviewLocation
      );

      const overviewAppointments = scopedAppointments.filter((appointment: any) =>
        isWithinCalendarWindow(appointment.scheduledStart)
      );

      const waitingCount = overviewAppointments.filter((a: any) => isCheckedIn(a.status)).length;
      const inRoomsCount = overviewAppointments.filter((a: any) => isInRooms(a.status)).length;
      const checkoutCount = scopedAppointments.filter((a: any) => isCompletedVisit(a.status)).length;
      const noShowCount = scopedAllAppointments.filter((a: any) => normalizeStatus(a.status) === 'no_show').length;
      const cancelledCount = scopedAllAppointments.filter((a: any) => normalizeStatus(a.status) === 'cancelled').length;
      const needsInsuranceVerification = scopedAppointments.filter((a: any) => a.insuranceVerified === false).length;
      const balanceDueAppointments = scopedAppointments.filter((a: any) =>
        centsFromDollars(a.outstandingBalance) > 0 || numberOrZero(a.paymentDueCents) > 0
      ).length;
      const copayDueCents = scopedAppointments.reduce((sum: number, appointment: any) => {
        if (['completed', 'cancelled', 'no_show'].includes(normalizeStatus(appointment.status))) return sum;
        return sum + centsFromDollars(appointment.copayAmount);
      }, 0);

      const nowMs = Date.now();
      const dashboardPulseAppointments = overviewAppointments
        .map(toDashboardAppointment)
        .sort((left, right) => {
          const leftMs = left.scheduledStart ? new Date(left.scheduledStart).getTime() : 0;
          const rightMs = right.scheduledStart ? new Date(right.scheduledStart).getTime() : 0;
          return leftMs - rightMs;
        });
      const nextAppointments = dashboardPulseAppointments
        .filter((appointment) => {
          const appointmentMs = appointment.scheduledStart ? new Date(appointment.scheduledStart).getTime() : 0;
          return appointmentMs >= nowMs || ['checked_in', 'in_room', 'with_provider', 'checkout'].includes(normalizeStatus(appointment.status));
        })
        .slice(0, 5);
      const attentionAppointments = dashboardPulseAppointments
        .filter((appointment) => appointment.riskFlags.length > 0)
        .slice(0, 5);
      setSchedulePulse({ nextAppointments, attentionAppointments });

      const pendingOrderStatuses = new Set(['pending', 'in-progress', 'in_progress']);
      const labOrderTypes = new Set(['lab', 'pathology', 'dermpath', 'biopsy']);
      const pendingLabOrders = orders.filter((order: any) => {
        const orderType = String(order.type || '').toLowerCase();
        const orderStatus = String(order.status || '').toLowerCase();
        return labOrderTypes.has(orderType) && pendingOrderStatuses.has(orderStatus);
      }).length;

      const unsignedNotesToday = encountersData.filter((encounter: Encounter) => {
        return isOnLocalDay(encounter.updatedAt || encounter.createdAt, todayStr) && isEncounterOpen(encounter.status);
      }).length;

      const myNotesNeedingWork = encountersData.filter((encounter: Encounter) => {
        return encounter.providerId === session.user.id && isEncounterOpen(encounter.status);
      }).length;

      const teamNotesNeedingWork = encountersData.filter((encounter: Encounter) => isEncounterOpen(encounter.status)).length;

      const scheduleViewStartMs = scheduleRange.start.getTime();
      const scheduleViewEndMs = scheduleRange.end.getTime();
      const scheduleViewAppointments = scheduleSourceAppointments.filter((a: any) => {
        if (!isAppointmentIncludedInOverview(a.status)) return false;
        if (!matchesStoredScheduleFilters(a, scheduleContext)) return false;

        const appointmentStart = new Date(a.scheduledStart).getTime();
        if (Number.isNaN(appointmentStart)) return false;
        return appointmentStart >= scheduleViewStartMs && appointmentStart <= scheduleViewEndMs;
      });

      const scheduleHasFilters =
        scheduleContext.dayOffset !== 0 ||
        scheduleContext.viewMode !== 'day' ||
        scheduleContext.providerFilter !== 'all' ||
        scheduleContext.typeFilter !== 'all' ||
        scheduleContext.locationFilter !== 'all';

      setStats({
        appointmentsCount: scopedAppointments.length,
        checkedInCount: waitingCount,
        completedCount: checkoutCount,
        pendingTasks: tasks.filter((t: any) => isTaskPending(t.status)).length,
        openEncounters: teamNotesNeedingWork,
        waitingCount,
        inRoomsCount,
        checkoutCount,
        scheduleViewCount: scheduleViewAppointments.length,
        scheduleViewMode: scheduleContext.viewMode,
        scheduleDateLabel: todayDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
        scheduleViewDateLabel: scheduleDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
        scheduleHasFilters,
        pendingLabOrders,
        unsignedNotesToday,
        unreadMessageThreads,
        myNotesNeedingWork,
        teamNotesNeedingWork,
        needsInsuranceVerification,
        balanceDueAppointments,
        copayDueCents,
        noShowCount,
        cancelledCount,
        netCollectionsCents,
        patientCollectionsCents,
        payerCollectionsCents,
        claimsInQueue: claims.filter(isClaimInQueue).length,
        claimsDeniedRejected: claims.filter(isClaimAtRisk).length,
        financialWorkQueueCount: financialWorkQueueItems.filter((item: any) => isTaskPending(item.status)).length,
        arTotalCents,
        arOver90Cents,
      });
    } catch (err: any) {
      showError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [effectiveRoles, overviewLocationFilter, session, showError]);

  const loadAppointmentFinderData = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!session) return;

      if (!canUseAppointmentFinder) {
        showError('This role does not have access to scheduling.');
        return;
      }

      if (finderLoaded && !force) return;

      setFinderLoading(true);
      try {
        const startDate = startOfDay(new Date());
        startDate.setDate(startDate.getDate() - 1);
        const endDate = endOfDay(new Date());
        endDate.setDate(endDate.getDate() + HOME_FINDER_LOOKAHEAD_DAYS);

        const [apptRes, patRes, provRes, locRes, typeRes, availRes, timeBlocksRes] = await Promise.all([
          fetchAppointments(session.tenantId, session.accessToken, {
            startDate: toLocalIsoDate(startDate),
            endDate: toLocalIsoDate(endDate),
          }),
          fetchPatients(session.tenantId, session.accessToken),
          fetchProviders(session.tenantId, session.accessToken),
          fetchLocations(session.tenantId, session.accessToken),
          fetchAppointmentTypes(session.tenantId, session.accessToken),
          fetchAvailability(session.tenantId, session.accessToken),
          fetchTimeBlocks(session.tenantId, session.accessToken, {
            startDate: toLocalIsoDate(startDate),
            endDate: toLocalIsoDate(endDate),
          }).catch(() => []),
        ]);

        setFinderAppointments(apptRes.appointments || []);
        setFinderPatients(patRes.data || patRes.patients || []);
        setFinderProviders(provRes.providers || []);
        setFinderLocations(locRes.locations || []);
        setFinderAppointmentTypes(typeRes.appointmentTypes || []);
        setFinderAvailability(availRes.availability || []);
        setFinderTimeBlocks(Array.isArray(timeBlocksRes) ? timeBlocksRes : []);
        setFinderLoaded(true);
      } catch (err: any) {
        showError(err.message || 'Failed to load appointment finder data');
      } finally {
        setFinderLoading(false);
      }
    },
    [canUseAppointmentFinder, finderLoaded, session, showError]
  );

  const openAppointmentFinder = useCallback(() => {
    if (!canUseAppointmentFinder) {
      showError('This role does not have access to scheduling.');
      return;
    }

    setShowAppointmentFinder(true);
    void loadAppointmentFinderData();
  }, [canUseAppointmentFinder, loadAppointmentFinderData, showError]);

  const handleUseFinderSlot = useCallback(
    (selection: AppointmentFinderSelection) => {
      setFinderAppointmentInitialData(selection);
      setShowAppointmentFinder(false);
      setShowFinderAppointmentModal(true);
      showSuccess(
        selection.patientId
          ? 'Selected opening loaded into New Appointment.'
          : 'Selected opening loaded. Choose a patient to finish booking.'
      );
    },
    [showSuccess]
  );

  const handleQuickCreateFinderPatient = useCallback(async ({
    firstName,
    lastName,
  }: {
    firstName: string;
    lastName: string;
  }) => {
    if (!session) {
      throw new Error('Session expired. Sign in again.');
    }

    const created = await createPatient(session.tenantId, session.accessToken, {
      firstName,
      lastName,
    });

    const patientRecord: Patient = {
      id: created.id,
      tenantId: session.tenantId,
      firstName,
      lastName,
      createdAt: new Date().toISOString(),
    };

    setFinderPatients((current) => [patientRecord, ...current.filter((patient) => patient.id !== created.id)]);
    return patientRecord;
  }, [session]);

  const handleOpenExistingFinderAppointment = useCallback(
    (appointment: Appointment) => {
      const appointmentStart = new Date(appointment.scheduledStart);
      if (Number.isNaN(appointmentStart.getTime())) {
        showError('Appointment date is invalid');
        return;
      }

      const appointmentDay = startOfDay(appointmentStart);
      const today = startOfDay(new Date());
      const dayOffset = Math.round((appointmentDay.getTime() - today.getTime()) / 86400000);

      localStorage.setItem('sched:dayOffset', String(dayOffset));
      localStorage.setItem('sched:viewMode', 'day');
      localStorage.setItem('sched:provider', appointment.providerId || 'all');
      localStorage.setItem('sched:type', appointment.appointmentTypeId || 'all');
      localStorage.setItem('sched:location', appointment.locationId || 'all');

      setShowAppointmentFinder(false);
      navigate(`/schedule?view=day&appointmentId=${encodeURIComponent(appointment.id)}`);
    },
    [navigate, showError]
  );

  const handleCreateFinderAppointment = useCallback(
    async (formData: AppointmentFormData) => {
      if (!session) return;

      const startDate = new Date(`${formData.date}T${formData.time}:00`);
      const endDate = new Date(startDate.getTime() + formData.duration * 60000);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        showError('Invalid date or time');
        throw new Error('Invalid date or time');
      }

      try {
        await createAppointment(session.tenantId, session.accessToken, {
          patientId: formData.patientId,
          providerId: formData.providerId,
          appointmentTypeId: formData.appointmentTypeId,
          locationId: formData.locationId || finderLocations[0]?.id,
          scheduledStart: startDate.toISOString(),
          scheduledEnd: endDate.toISOString(),
          notes: formData.notes,
        });

        showSuccess('Appointment created successfully');
        setShowFinderAppointmentModal(false);
        setFinderAppointmentInitialData(undefined);
        setFinderLoaded(false);
        await loadStats();
      } catch (err: any) {
        showError(err.message || 'Failed to create appointment');
        throw err;
      }
    },
    [finderLocations, loadStats, session, showError, showSuccess]
  );

  useEffect(() => {
    if (!session) return;
    loadStats();
  }, [loadStats, session]);

  useEffect(() => {
    if (!session) return;
    const intervalId = window.setInterval(() => {
      loadStats();
    }, DASHBOARD_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadStats, session]);

  const criticalPathologyCount = biopsySafety?.critical.length || 0;
  const totalPathologyOpenLoops = biopsySafety?.summary.total_open_loops || 0;
  const commandRiskCount =
    criticalPathologyCount +
    stats.claimsDeniedRejected +
    stats.financialWorkQueueCount +
    stats.needsInsuranceVerification +
    stats.balanceDueAppointments;
  const operationalCompletionRate =
    stats.appointmentsCount > 0 ? Math.round((stats.completedCount / stats.appointmentsCount) * 100) : 0;

  const commandMetrics: Array<{
    label: string;
    value: string | number;
    detail: string;
    route: string;
    icon: LucideIcon;
    tone: 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'slate';
  }> = [
    {
      label: "Today's schedule",
      value: stats.appointmentsCount,
      detail: `${stats.waitingCount} waiting, ${stats.inRoomsCount} in rooms, ${stats.completedCount} completed`,
      route: '/schedule',
      icon: CalendarDays,
      tone: 'blue',
    },
    {
      label: 'Clinical work',
      value: stats.unsignedNotesToday + stats.pendingLabOrders,
      detail: `${stats.unsignedNotesToday} notes today, ${stats.pendingLabOrders} lab/path orders`,
      route: '/notes',
      icon: Stethoscope,
      tone: 'violet',
    },
    {
      label: 'Patient access',
      value: stats.needsInsuranceVerification + stats.balanceDueAppointments,
      detail: `${stats.needsInsuranceVerification} insurance checks, ${stats.balanceDueAppointments} balances`,
      route: '/front-desk',
      icon: ClipboardCheck,
      tone: 'amber',
    },
    {
      label: 'Revenue cycle',
      value: stats.claimsInQueue + stats.claimsDeniedRejected + stats.financialWorkQueueCount,
      detail: `${stats.claimsInQueue} claims active, ${stats.claimsDeniedRejected} at risk`,
      route: '/financials',
      icon: DollarSign,
      tone: stats.claimsDeniedRejected + stats.financialWorkQueueCount > 0 ? 'red' : 'emerald',
    },
    {
      label: 'Collections today',
      value: currencyFromCents(stats.netCollectionsCents),
      detail: `${currencyFromCents(stats.patientCollectionsCents)} patient, ${currencyFromCents(stats.payerCollectionsCents)} payer`,
      route: '/financials',
      icon: CreditCard,
      tone: 'emerald',
    },
    {
      label: 'Clinical Inbox',
      value: stats.unreadMessageThreads,
      detail: `${stats.pendingTasks} open tasks, ${stats.unreadMessageThreads} unread threads`,
      route: '/clinical-inbox',
      icon: Inbox,
      tone: stats.unreadMessageThreads > 0 ? 'amber' : 'slate',
    },
  ];

  const priorityItems = [
    {
      label: 'Critical pathology follow-up',
      value: criticalPathologyCount,
      detail: `${totalPathologyOpenLoops} open biopsy loops`,
      route: '/biopsies',
      icon: ShieldCheck,
      severity: criticalPathologyCount > 0 ? 'critical' : 'steady',
    },
    {
      label: 'Claim and billing exceptions',
      value: stats.claimsDeniedRejected + stats.financialWorkQueueCount,
      detail: `${stats.claimsDeniedRejected} claim risks, ${stats.financialWorkQueueCount} work queue items`,
      route: '/financials',
      icon: AlertTriangle,
      severity: stats.claimsDeniedRejected + stats.financialWorkQueueCount > 0 ? 'critical' : 'steady',
    },
    {
      label: 'Patient-ready blockers',
      value: stats.needsInsuranceVerification + stats.balanceDueAppointments,
      detail: `${stats.needsInsuranceVerification} insurance, ${currencyFromCents(stats.copayDueCents)} copays due`,
      route: '/front-desk',
      icon: ClipboardCheck,
      severity: stats.needsInsuranceVerification + stats.balanceDueAppointments > 0 ? 'warning' : 'steady',
    },
    {
      label: 'Provider desk',
      value: stats.myNotesNeedingWork + stats.pendingLabOrders,
      detail: `${stats.myNotesNeedingWork} my notes, ${stats.pendingLabOrders} lab/path orders`,
      route: '/notes',
      icon: FileText,
      severity: stats.myNotesNeedingWork + stats.pendingLabOrders > 0 ? 'warning' : 'steady',
    },
  ];

  const quickActions = [
    { label: 'New Patient', route: '/patients/new', icon: UserPlus },
    { label: 'Schedule', route: '/schedule', icon: CalendarDays },
    { label: 'Tasks', route: '/tasks', icon: ClipboardCheck },
    { label: 'Financials', route: '/financials', icon: DollarSign },
    { label: 'Analytics', route: '/analytics', icon: BarChart3 },
    { label: 'Clinical Inbox', route: '/clinical-inbox', icon: Inbox },
    { label: 'Mail', route: '/mail', icon: Mail },
  ];

  return (
    <div className="home-page command-center-page">
      <header className="command-center-hero">
        <div className="command-center-hero__copy">
          <div className="command-center-kicker">Today's Overview</div>
          <h1>Practice Command Center</h1>
          <div className="command-center-hero__meta">
            <span>{stats.scheduleDateLabel || new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span>{operationalCompletionRate}% complete</span>
            <span>{commandRiskCount} items need attention</span>
          </div>
        </div>
        <div className="command-center-toolbar">
          <label htmlFor="home-overview-location">Location</label>
          <select
            id="home-overview-location"
            value={overviewLocationFilter}
            onChange={(e) => setOverviewLocationFilter(e.target.value)}
          >
            <option value="all">All Locations</option>
            {overviewLocationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <button type="button" className="command-center-icon-btn" onClick={loadStats} disabled={loading} aria-label="Refresh command center">
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="command-metric-grid" aria-label="Command center metrics">
        {loading ? (
          <>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </>
        ) : (
          commandMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <button
                type="button"
                key={metric.label}
                className={`command-metric-card command-metric-card--${metric.tone}`}
                onClick={() => navigate(metric.route)}
              >
                <span className="command-metric-card__icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="command-metric-card__value">{metric.value}</span>
                <span className="command-metric-card__label">{metric.label}</span>
                <span className="command-metric-card__detail">{metric.detail}</span>
              </button>
            );
          })
        )}
      </section>

      <section className="command-priority-strip" aria-label="Priority work queues">
        {priorityItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.label}
              className={`command-priority-item command-priority-item--${item.severity}`}
              onClick={() => navigate(item.route)}
            >
              <span className="command-priority-item__icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span>
                <span className="command-priority-item__label">{item.label}</span>
                <span className="command-priority-item__detail">{item.detail}</span>
              </span>
              <strong>{loading ? '-' : item.value}</strong>
            </button>
          );
        })}
      </section>

      <section className="command-center-grid" aria-label="Daily operations command center">
        <div className="command-panel command-panel--wide">
          <div className="command-panel__header">
            <div>
              <p>Patient Flow</p>
              <h2>Today's Patients</h2>
            </div>
            <button type="button" className="command-link-btn" onClick={() => navigate('/front-desk')}>
              Front Desk <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="command-flow-row">
            {[
              { label: 'Scheduled', value: stats.appointmentsCount, tone: 'blue' },
              { label: 'Waiting', value: stats.waitingCount, tone: 'amber' },
              { label: 'In Rooms', value: stats.inRoomsCount, tone: 'violet' },
              { label: 'Completed', value: stats.completedCount, tone: 'emerald' },
              { label: 'No-shows', value: stats.noShowCount, tone: 'red' },
              { label: 'Cancelled', value: stats.cancelledCount, tone: 'slate' },
            ].map((item) => (
              <div key={item.label} className={`command-flow-tile command-flow-tile--${item.tone}`}>
                <span>{loading ? '-' : item.value}</span>
                <p>{item.label}</p>
              </div>
            ))}
          </div>
          <div className="command-schedule-context">
            <Clock size={16} aria-hidden="true" />
            <span>
              Current schedule view: <strong>{stats.scheduleViewCount}</strong> appointments, {stats.scheduleViewMode} view, {stats.scheduleViewDateLabel || 'today'}
              {stats.scheduleHasFilters ? ', filtered' : ', unfiltered'}.
            </span>
          </div>
          <div className="command-list-grid">
            <div>
              <h3>Next Up</h3>
              <div className="command-list">
                {schedulePulse.nextAppointments.length === 0 ? (
                  <div className="command-empty-state">No upcoming appointments in this view.</div>
                ) : (
                  schedulePulse.nextAppointments.map((appointment) => (
                    <button
                      type="button"
                      key={appointment.id}
                      className="command-list-row"
                      onClick={() => navigate(appointment.patientId ? `/patients/${appointment.patientId}` : '/schedule')}
                    >
                      <span className="command-list-row__time">{formatAppointmentTime(appointment.scheduledStart)}</span>
                      <span>
                        <strong>{appointment.patientName}</strong>
                        <small>{appointment.appointmentTypeName} with {appointment.providerName}</small>
                      </span>
                      <em>{statusLabel(appointment.status)}</em>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div>
              <h3>Patient-Ready Checks</h3>
              <div className="command-list">
                {schedulePulse.attentionAppointments.length === 0 ? (
                  <div className="command-empty-state">No insurance, balance, copay, or wait-time blockers.</div>
                ) : (
                  schedulePulse.attentionAppointments.map((appointment) => (
                    <button
                      type="button"
                      key={appointment.id}
                      className="command-list-row command-list-row--warning"
                      onClick={() => navigate(appointment.patientId ? `/patients/${appointment.patientId}` : '/front-desk')}
                    >
                      <span className="command-list-row__time">{formatAppointmentTime(appointment.scheduledStart)}</span>
                      <span>
                        <strong>{appointment.patientName}</strong>
                        <small>{appointment.riskFlags.join(', ')}</small>
                      </span>
                      <em>{appointment.outstandingBalanceCents > 0 ? currencyFromCents(appointment.outstandingBalanceCents) : statusLabel(appointment.status)}</em>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="command-panel">
          <div className="command-panel__header">
            <div>
              <p>Clinical Work</p>
              <h2>Provider Desk</h2>
            </div>
            <button type="button" className="command-link-btn" onClick={() => navigate('/notes')}>
              Open Notes Queue <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="command-stack">
            <button type="button" className="command-work-row" onClick={() => navigate('/notes')}>
              <FileText size={17} aria-hidden="true" />
              <span>
                <strong>Notes Needing Attention</strong>
                <small>My notes: {stats.myNotesNeedingWork}; team open encounters: {stats.teamNotesNeedingWork}</small>
              </span>
              <b>{loading ? '-' : stats.teamNotesNeedingWork}</b>
            </button>
            <button type="button" className="command-work-row" onClick={() => navigate('/orders')}>
              <ClipboardCheck size={17} aria-hidden="true" />
              <span>
                <strong>Pending Lab/Path Orders</strong>
                <small>Unsigned notes today: {stats.unsignedNotesToday}</small>
              </span>
              <b>{loading ? '-' : stats.pendingLabOrders}</b>
            </button>
            <button type="button" className="command-work-row" onClick={() => navigate('/biopsies')}>
              <ShieldCheck size={17} aria-hidden="true" />
              <span>
                <strong>Pathology Safety</strong>
                <small>{totalPathologyOpenLoops} open loops; {criticalPathologyCount} critical/high</small>
              </span>
              <b>{loading ? '-' : criticalPathologyCount}</b>
            </button>
          </div>
        </div>

        <div className="command-panel">
          <div className="command-panel__header">
            <div>
              <p>Revenue Cycle</p>
              <h2>Money Watch</h2>
            </div>
            <button type="button" className="command-link-btn" onClick={() => navigate('/financials')}>
              Financials <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="command-money-grid">
            <div>
              <span>{currencyFromCents(stats.netCollectionsCents)}</span>
              <p>Collections today</p>
            </div>
            <div>
              <span>{stats.claimsInQueue}</span>
              <p>Claims active</p>
            </div>
            <div>
              <span>{stats.claimsDeniedRejected}</span>
              <p>Denied/rejected</p>
            </div>
            <div>
              <span>{currencyFromCents(stats.arOver90Cents)}</span>
              <p>A/R over 90</p>
            </div>
          </div>
          <button type="button" className="command-work-row command-work-row--tight" onClick={() => navigate('/financials')}>
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              <strong>Financial work queue</strong>
              <small>{currencyFromCents(stats.arTotalCents)} total open A/R</small>
            </span>
            <b>{loading ? '-' : stats.financialWorkQueueCount}</b>
          </button>
        </div>
      </section>

      {biopsySafety && totalPathologyOpenLoops > 0 && (
        <section className="command-pathology-banner" aria-label="Pathology safety alerts">
          <div>
            <p>Pathology Safety Alerts</p>
            <h2>{totalPathologyOpenLoops} open biopsy loops need active follow-up</h2>
          </div>
          <div className="command-pathology-banner__stats">
            <span><strong>{criticalPathologyCount}</strong> critical/high</span>
            <span><strong>{biopsySafety.summary.pending_review}</strong> pending review</span>
            <span><strong>{biopsySafety.summary.needs_patient_notification}</strong> notify patient</span>
            <span><strong>{biopsySafety.summary.needs_treatment_scheduling}</strong> treatment needed</span>
          </div>
          <button type="button" className="command-danger-btn" onClick={() => navigate('/biopsies')}>
            Open Biopsy Safety
          </button>
        </section>
      )}

      <section className="command-actions-bar" aria-label="Command center actions">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button type="button" key={action.label} onClick={() => navigate(action.route)}>
              <Icon size={17} aria-hidden="true" />
              {action.label}
            </button>
          );
        })}
        {canUseAppointmentFinder && (
          <button type="button" onClick={openAppointmentFinder} disabled={finderLoading}>
            <Search size={17} aria-hidden="true" />
            {finderLoading ? 'Loading Finder' : 'Appointment Finder'}
          </button>
        )}
        <button type="button" onClick={() => setShowReminderModal(true)}>
          <Bell size={17} aria-hidden="true" />
          General Reminder
        </button>
        <div className="command-actions-menu">
          <button type="button" onClick={() => setShowRegulatoryModal((prev) => !prev)}>
            <BarChart3 size={17} aria-hidden="true" />
            Regulatory Reporting
          </button>
          {showRegulatoryModal && (
            <div className="command-actions-menu__content">
              <button
                type="button"
                onClick={() => {
                  navigate('/reports?type=regulatory');
                  setShowRegulatoryModal(false);
                }}
              >
                MIPS Report
              </button>
              <button
                type="button"
                onClick={() => {
                  navigate('/reports?type=regulatory');
                  setShowRegulatoryModal(false);
                }}
              >
                MIPS Value Path Report
              </button>
            </div>
          )}
        </div>
      </section>

      <Modal
        isOpen={showAppointmentFinder}
        title="Smart Appointment Finder"
        onClose={() => setShowAppointmentFinder(false)}
        size="full"
      >
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              padding: '0.85rem 1rem',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%)',
              border: '1px solid #bae6fd',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f766e', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Live schedule search
              </div>
              <div style={{ marginTop: '0.2rem', color: '#334155', fontWeight: 600 }}>
                Loaded from patients, providers, appointment types, availability, appointments, and time blocks.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadAppointmentFinderData({ force: true })}
              disabled={finderLoading}
              style={{
                border: '1px solid #67e8f9',
                borderRadius: '999px',
                background: finderLoading ? '#e2e8f0' : '#ffffff',
                color: '#155e75',
                padding: '0.65rem 1rem',
                fontWeight: 800,
                cursor: finderLoading ? 'wait' : 'pointer',
              }}
            >
              {finderLoading ? 'Refreshing...' : 'Refresh live data'}
            </button>
          </div>

          {finderLoading && !finderLoaded ? (
            <div style={{ display: 'grid', gap: '1rem', padding: '1rem' }}>
              <Skeleton variant="card" />
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : (
            <AppointmentFinderWorkspace
              patients={finderPatients}
              providers={finderProviders}
              locations={finderLocations}
              appointmentTypes={finderAppointmentTypes}
              appointments={finderAppointments}
              timeBlocks={finderTimeBlocks}
              availability={finderAvailability}
              defaultLocationId={overviewLocationFilter === 'all' ? undefined : overviewLocationFilter}
              onUseSlot={handleUseFinderSlot}
              onOpenExistingAppointment={handleOpenExistingFinderAppointment}
              onCreatePatient={handleQuickCreateFinderPatient}
              onShowSuccess={showSuccess}
              onShowError={showError}
            />
          )}
        </div>
      </Modal>

      <AppointmentModal
        isOpen={showFinderAppointmentModal}
        onClose={() => {
          setShowFinderAppointmentModal(false);
          setFinderAppointmentInitialData(undefined);
        }}
        onSave={handleCreateFinderAppointment}
        patients={finderPatients}
        providers={finderProviders}
        locations={finderLocations}
        appointmentTypes={finderAppointmentTypes}
        availability={finderAvailability}
        appointments={finderAppointments}
        timeBlocks={finderTimeBlocks}
        initialData={finderAppointmentInitialData}
      />

      <Modal
        isOpen={showReminderModal}
        title="General Reminder"
        onClose={() => setShowReminderModal(false)}
      >
        <div style={{ padding: '1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Doctor's Note
            </label>
            <textarea
              value={reminderData.doctorsNote}
              onChange={(e) => setReminderData({ ...reminderData, doctorsNote: e.target.value })}
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
              placeholder="Optional notes for internal reference..."
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Reminder Text <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              value={reminderData.reminderText}
              onChange={(e) => setReminderData({ ...reminderData, reminderText: e.target.value })}
              rows={4}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
              placeholder="Enter the reminder message to send to the patient..."
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Reminder Date <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="date"
              value={reminderData.reminderDate}
              onChange={(e) => setReminderData({ ...reminderData, reminderDate: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
              Preferred Contact Method <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={reminderData.preferredContact}
              onChange={(e) => setReminderData({ ...reminderData, preferredContact: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                background: '#ffffff',
              }}
            >
              <option value="Unspecified">Unspecified</option>
              <option value="Email">Email</option>
              <option value="Phone">Phone Call</option>
              <option value="SMS">Text Message (SMS)</option>
              <option value="Portal">Patient Portal</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={() => {
                resetReminderData();
                setShowReminderModal(false);
              }}
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
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!reminderData.reminderText || !reminderData.reminderDate) {
                  showError('Please fill in all required fields');
                  return;
                }
                showSuccess('General reminder created successfully');
                resetReminderData();
                setShowReminderModal(false);
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
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
