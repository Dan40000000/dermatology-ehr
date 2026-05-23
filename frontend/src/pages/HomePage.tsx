import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeAlert,
  BarChart3,
  Bell,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  ClipboardX,
  Clock,
  CreditCard,
  DoorOpen,
  DollarSign,
  FileCheck2,
  FileText,
  Hourglass,
  Inbox,
  Mail,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  Store,
  TimerReset,
  UserCheck,
  UserPlus,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAccessControl } from '../contexts/AccessControlContext';
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
  fetchCommandCenterSummary,
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
  type CommandCenterSummaryResponse,
  type TimeBlock,
} from '../api';
import {
  fetchARAging,
  fetchClaims,
  fetchCollectionsTrend,
  fetchFinancialWorkQueue,
  fetchPaymentsSummary,
} from '../api/financials';
import { getModuleForPath, type CommandCenterSectionKey, type ModuleKey } from '../config/moduleAccess';
import { getEffectiveRoles } from '../utils/roles';
import {
  getClinicBusinessDate,
  getDateKeyInPracticeTimeZone,
  ISO_DATE_PATTERN,
  setClinicBusinessDate,
} from '../utils/practiceDateTime';
import { isOpenLabPathOrder } from '../utils/labPathOrders';
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
  activeAppointmentsCount: number;
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
  notesWrittenToday: number;
  unsignedNotesToday: number;
  unreadMessageThreads: number;
  myNotesNeedingWork: number;
  teamNotesNeedingWork: number;
  needsInsuranceVerification: number;
  balanceDueAppointments: number;
  copayDueCents: number;
  staleScheduledCount: number;
  noShowCount: number;
  cancelledCount: number;
  revenueTodayCents: number;
  netCollectionsCents: number;
  patientCollectionsCents: number;
  payerCollectionsCents: number;
  storeCollectionsCents: number;
  collectionRateToday: number;
  claimsInQueue: number;
  claimsDeniedRejected: number;
  financialWorkQueueCount: number;
  claimWorkQueueCount: number;
  billingWorkQueueCount: number;
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
  scheduledEnd?: string;
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

interface HomeActionQueueItem {
  id: string;
  label: string;
  value: string | number;
  detail: string;
  route: string;
  access?: ModuleKey | ModuleKey[];
  commandSection?: CommandCenterSectionKey;
  icon: LucideIcon;
  tone: 'red' | 'amber' | 'emerald' | 'blue' | 'violet' | 'slate';
}

interface HomeProviderThroughput {
  providerId: string;
  providerName: string;
  total: number;
  active: number;
  waiting: number;
  inRooms: number;
  completed: number;
  stale: number;
  longestDelayMinutes: number;
  route: string;
}

interface HomeCommandQueues {
  riskItems: HomeActionQueueItem[];
  frontDeskItems: HomeActionQueueItem[];
  readinessItems: HomeActionQueueItem[];
  providerThroughput: HomeProviderThroughput[];
}

interface HomeDataHealth {
  failedSources: string[];
  lastUpdatedAt: string;
  businessDate: string;
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
const WAITING_ROOM_RISK_MINUTES = 30;
const ROOM_DWELL_RISK_MINUTES = 45;

const toLocalIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCommandBusinessDate = (): string => getClinicBusinessDate();

const dateFromIsoDate = (dateKey: string): Date => new Date(`${dateKey}T12:00:00`);

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

const STALE_SCHEDULED_GRACE_MS = 15 * 60 * 1000;

const isStaleScheduledAppointment = (appointment: any, nowMs: number): boolean => {
  if (normalizeStatus(appointment.status) !== 'scheduled') return false;
  const reference = appointment.scheduledEnd || appointment.scheduledStart;
  if (!reference) return false;
  const scheduledMs = new Date(reference).getTime();
  if (Number.isNaN(scheduledMs)) return false;
  return scheduledMs + STALE_SCHEDULED_GRACE_MS < nowMs;
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

  return {
    viewMode,
    dayOffset: 0,
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

const getElapsedMinutes = (value: string | undefined, nowMs: number): number => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor((nowMs - parsed) / 60000));
};

const getAppointmentDelayMinutes = (appointment: any, nowMs: number): number => {
  const explicitWait = numberOrZero(appointment.waitTimeMinutes);
  if (explicitWait > 0) return explicitWait;

  const status = normalizeStatus(appointment.status);
  if (status === 'checked_in') {
    return getElapsedMinutes(appointment.checkedInAt || appointment.checked_in_at || appointment.scheduledStart, nowMs);
  }
  if (status === 'in_room' || status === 'with_provider') {
    return getElapsedMinutes(
      appointment.roomedAt || appointment.roomed_at || appointment.inRoomAt || appointment.in_room_at || appointment.scheduledStart,
      nowMs,
    );
  }
  if (status === 'scheduled' && isStaleScheduledAppointment(appointment, nowMs)) {
    return getElapsedMinutes(appointment.scheduledStart, nowMs);
  }
  return 0;
};

const isIntakeIncomplete = (appointment: any): boolean => {
  const statusValue = String(
    appointment.intakeStatus ||
      appointment.formsStatus ||
      appointment.patientFormsStatus ||
      appointment.portalIntakeStatus ||
      '',
  ).toLowerCase();

  return (
    appointment.intakeComplete === false ||
    appointment.formsComplete === false ||
    appointment.requiredFormsComplete === false ||
    statusValue === 'incomplete' ||
    statusValue === 'missing' ||
    statusValue === 'pending'
  );
};

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
  scheduledEnd: appointment.scheduledEnd,
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
  ['draft', 'coding_review', 'ready', 'submitted', 'accepted', 'partially_paid'].includes(normalizeStatus(claim.status));

const getClaimBalanceCents = (claim: any): number =>
  numberOrZero(claim.balanceCents ?? claim.balance_cents);

const getClaimAgeDays = (claim: any): number => {
  const reference = claim.serviceDate || claim.service_date || claim.createdAt || claim.created_at;
  if (!reference) return 0;
  const parsed = new Date(reference).getTime();
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86400000));
};

const isClaimAtRisk = (claim: any): boolean =>
  ['denied', 'rejected', 'appealed'].includes(normalizeStatus(claim.status)) ||
  normalizeStatus(claim.scrubStatus) === 'failed' ||
  (getClaimBalanceCents(claim) > 0 && getClaimAgeDays(claim) > 300);

const getCommandCenterFinancials = (collectionsTrend: any, paymentsSummary: any) => {
  const trendSummary = collectionsTrend?.summary || null;
  const paymentPatientCollections =
    numberOrZero(paymentsSummary?.calculated?.postedPatientPaymentsCents) ||
    extractArray(paymentsSummary, ['patientPaymentsByMethod']).reduce(
      (sum, row) => sum + numberOrZero(row.totalCents),
      0,
    );
  const paymentPayerCollections =
    numberOrZero(paymentsSummary?.calculated?.payerAppliedCents) ||
    numberOrZero(paymentsSummary?.payerPaymentsSummary?.appliedCents);

  const patientCollectionsCents = paymentsSummary
    ? paymentPatientCollections
    : numberOrZero(trendSummary?.totalPatientPaymentsCents);
  const payerCollectionsCents = paymentsSummary
    ? paymentPayerCollections
    : numberOrZero(trendSummary?.totalPayerPaymentsCents);
  const netCollectionsCents = patientCollectionsCents + payerCollectionsCents;
  const revenueTodayCents =
    numberOrZero(trendSummary?.totalRevenueEarnedCents) ||
    numberOrZero(paymentsSummary?.calculated?.chargesInPeriodCents);
  const storeCollectionsCents = numberOrZero(trendSummary?.totalStorePaymentsCents);
  const totalCollectionsCents = netCollectionsCents + storeCollectionsCents;
  const collectionRateToday =
    numberOrZero(trendSummary?.collectionRate) ||
    (revenueTodayCents > 0 ? Math.round((totalCollectionsCents / revenueTodayCents) * 100) : 0);

  return {
    revenueTodayCents,
    netCollectionsCents,
    patientCollectionsCents,
    payerCollectionsCents,
    storeCollectionsCents,
    collectionRateToday,
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

const summaryNumber = (fallback: number, value: unknown): number =>
  value === null || value === undefined ? fallback : numberOrZero(value);

const getCommandSummaryFailedSourceLabels = (summary: CommandCenterSummaryResponse | null): string[] => {
  if (!summary?.dataHealth?.failedSources) return [];
  return summary.dataHealth.failedSources
    .map((source) => {
      if (typeof source === 'string') return source;
      return source.source ? `command center ${source.source}` : null;
    })
    .filter((source): source is string => Boolean(source));
};

const INITIAL_STATS: HomeStats = {
  appointmentsCount: 0,
  activeAppointmentsCount: 0,
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
  notesWrittenToday: 0,
  unsignedNotesToday: 0,
  unreadMessageThreads: 0,
  myNotesNeedingWork: 0,
  teamNotesNeedingWork: 0,
  needsInsuranceVerification: 0,
  balanceDueAppointments: 0,
  copayDueCents: 0,
  staleScheduledCount: 0,
  noShowCount: 0,
  cancelledCount: 0,
  revenueTodayCents: 0,
  netCollectionsCents: 0,
  patientCollectionsCents: 0,
  payerCollectionsCents: 0,
  storeCollectionsCents: 0,
  collectionRateToday: 0,
  claimsInQueue: 0,
  claimsDeniedRejected: 0,
  financialWorkQueueCount: 0,
  claimWorkQueueCount: 0,
  billingWorkQueueCount: 0,
  arTotalCents: 0,
  arOver90Cents: 0,
};

const INITIAL_COMMAND_QUEUES: HomeCommandQueues = {
  riskItems: [],
  frontDeskItems: [],
  readinessItems: [],
  providerThroughput: [],
};

export function HomePage() {
  const { session, user } = useAuth();
  const accessControl = useAccessControl();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [businessDate, setBusinessDate] = useState(() => getCommandBusinessDate());
  const [overviewLocationFilter, setOverviewLocationFilter] = useState('all');
  const [overviewLocationOptions, setOverviewLocationOptions] = useState<LocationScopeOption[]>([]);
  const [stats, setStats] = useState<HomeStats>(INITIAL_STATS);
  const [biopsySafety, setBiopsySafety] = useState<HomeBiopsySafety | null>(null);
  const [commandQueues, setCommandQueues] = useState<HomeCommandQueues>(INITIAL_COMMAND_QUEUES);
  const [dataHealth, setDataHealth] = useState<HomeDataHealth>({
    failedSources: [],
    lastUpdatedAt: '',
    businessDate: '',
  });
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
  const canViewCommandSection = useCallback(
    (sectionKey: CommandCenterSectionKey): boolean => accessControl.canAccessCommandCenterSection(sectionKey, effectiveRoles),
    [accessControl, effectiveRoles],
  );
  const canAccessAnyModule = useCallback(
    (module: ModuleKey | ModuleKey[] | undefined): boolean => {
      if (!module) return true;
      const modules = Array.isArray(module) ? module : [module];
      return modules.some((moduleKey) => accessControl.canAccessModule(moduleKey, effectiveRoles));
    },
    [accessControl, effectiveRoles]
  );
  const canOpenAction = useCallback(
    (action: { access?: ModuleKey | ModuleKey[]; route?: string; commandSection?: CommandCenterSectionKey }): boolean => {
      if (action.commandSection && !canViewCommandSection(action.commandSection)) return false;
      if (action.access) return canAccessAnyModule(action.access);
      if (!action.route) return true;
      const pathname = action.route.split(/[?#]/)[0] || '/home';
      const moduleKey = getModuleForPath(pathname);
      return moduleKey ? canAccessAnyModule(moduleKey) : true;
    },
    [canAccessAnyModule, canViewCommandSection]
  );
  const canUseAppointmentFinder = useMemo(
    () => canAccessAnyModule('schedule') && canViewCommandSection('quick_actions'),
    [canAccessAnyModule, canViewCommandSection]
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
      const failedSources: string[] = [];
      const safeLoad = async <T,>(label: string, request: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await request;
        } catch {
          failedSources.push(label);
          return fallback;
        }
      };
      const todayStr = businessDate;
      const scheduleContext = loadStoredScheduleContext();
      const todayDate = startOfDay(dateFromIsoDate(todayStr));
      const todayRange = getScheduleViewRange(todayDate, 'day');
      const scheduleDate = startOfDay(dateFromIsoDate(todayStr));
      scheduleDate.setDate(scheduleDate.getDate() + scheduleContext.dayOffset);
      const scheduleRange = getScheduleViewRange(scheduleDate, scheduleContext.viewMode, scheduleContext.showWeekends);

      const queryStart = new Date(Math.min(todayDate.getTime(), scheduleRange.start.getTime()));
      queryStart.setDate(queryStart.getDate() - 1);
      const queryEnd = new Date(Math.max(endOfDay(todayDate).getTime(), scheduleRange.end.getTime()));
      queryEnd.setDate(queryEnd.getDate() + 1);
      const canLoadAppointments = canAccessAnyModule('schedule');
      const canLoadFrontDeskTiming =
        canLoadAppointments &&
        effectiveRoles.some((role) => ['admin', 'front_desk', 'ma', 'provider'].includes(role));
      const canLoadEncounters = canAccessAnyModule('notes');
      const canLoadOrders = canAccessAnyModule('orders');
      const canLoadUnreadMessages = canAccessAnyModule('mail');
      const canLoadBiopsySafety = canAccessAnyModule('labs') && canViewCommandSection('banner_pathology');
      const canLoadFinancials =
        canAccessAnyModule('financials') &&
        (
          canViewCommandSection('metric_revenue') ||
          canViewCommandSection('metric_collections') ||
          canViewCommandSection('metric_revenue_cycle') ||
          canViewCommandSection('priority_billing') ||
          canViewCommandSection('panel_revenue_pulse') ||
          canViewCommandSection('panel_revenue_cycle')
        );
      const canLoadClaims =
        (canAccessAnyModule('claims') || canAccessAnyModule('clearinghouse') || canLoadFinancials) &&
        (
          canViewCommandSection('metric_revenue_cycle') ||
          canViewCommandSection('priority_claims') ||
          canViewCommandSection('panel_risk_queue') ||
          canViewCommandSection('panel_end_of_day')
        );
      const canLoadCommandSummary = canLoadAppointments || canLoadClaims || canLoadFinancials;

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
        collectionsTrendRes,
        paymentsSummaryRes,
        arAgingRes,
        commandSummaryRes,
      ] = await Promise.all([
        canLoadAppointments
          ? safeLoad('schedule', fetchAppointments(session.tenantId, session.accessToken, {
              startDate: toLocalIsoDate(queryStart),
              endDate: toLocalIsoDate(queryEnd),
            }), { appointments: [] })
          : Promise.resolve({ appointments: [] }),
        canLoadFrontDeskTiming
          ? safeLoad('front desk timing', fetchFrontDeskSchedule(session.tenantId, session.accessToken, { date: todayStr }), null)
          : Promise.resolve(null),
        canLoadEncounters
          ? safeLoad('clinical notes', fetchEncounters(session.tenantId, session.accessToken), { encounters: [] })
          : Promise.resolve({ encounters: [] }),
        safeLoad('tasks', fetchTasks(session.tenantId, session.accessToken), { tasks: [] }),
        canLoadOrders
          ? safeLoad('orders', fetchOrders(session.tenantId, session.accessToken), { orders: [] })
          : Promise.resolve({ orders: [] }),
        canLoadUnreadMessages
          ? safeLoad('clinical inbox', fetchUnreadCount(session.tenantId, session.accessToken), { count: 0 })
          : Promise.resolve({ count: 0 }),
        canLoadBiopsySafety
          ? safeLoad('biopsy safety', fetchBiopsyCommandCenter(session.tenantId, session.accessToken), null)
          : Promise.resolve(null),
        canLoadClaims
          ? safeLoad('claims', fetchClaims({ tenantId: session.tenantId, accessToken: session.accessToken }), { claims: [] })
          : Promise.resolve({ claims: [] }),
        canLoadFinancials
          ? safeLoad('financial work queue', fetchFinancialWorkQueue({ tenantId: session.tenantId, accessToken: session.accessToken }), { items: [] })
          : Promise.resolve({ items: [] }),
        canLoadFinancials
          ? safeLoad('collections trend', fetchCollectionsTrend(
              { tenantId: session.tenantId, accessToken: session.accessToken },
              { startDate: todayStr, endDate: todayStr, granularity: 'day' },
            ), null)
          : Promise.resolve(null),
        canLoadFinancials
          ? safeLoad('payments summary', fetchPaymentsSummary(
              { tenantId: session.tenantId, accessToken: session.accessToken },
              { startDate: todayStr, endDate: todayStr },
            ), null)
          : Promise.resolve(null),
        canLoadFinancials
          ? safeLoad('A/R aging', fetchARAging({ tenantId: session.tenantId, accessToken: session.accessToken }, { asOfDate: todayStr }), null)
          : Promise.resolve(null),
        canLoadCommandSummary
          ? safeLoad('command center summary', fetchCommandCenterSummary(session.tenantId, session.accessToken, { date: todayStr }), null)
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
      const openFinancialWorkQueueItems = financialWorkQueueItems.filter((item: any) => isTaskPending(item.status));
      const claimWorkQueueCount = openFinancialWorkQueueItems.filter((item: any) =>
        (item.claimId || item.claim_id) && !(item.billId || item.bill_id)
      ).length;
      const billingWorkQueueCount = openFinancialWorkQueueItems.filter((item: any) =>
        item.billId || item.bill_id || !(item.claimId || item.claim_id)
      ).length;
      const {
        revenueTodayCents,
        patientCollectionsCents,
        payerCollectionsCents,
        netCollectionsCents,
        storeCollectionsCents,
        collectionRateToday,
      } = getCommandCenterFinancials(collectionsTrendRes, paymentsSummaryRes);
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
      const nowMs = Date.now();
      const dashboardAppointments = todayScheduleAllAppointments.filter((appointment: any) =>
        isAppointmentIncludedInOverview(appointment.status) && !isStaleScheduledAppointment(appointment, nowMs)
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
      const staleScheduledCount = scopedAllAppointments.filter((appointment: any) =>
        isStaleScheduledAppointment(appointment, nowMs)
      ).length;
      const totalScheduleCount = scopedAllAppointments.filter((appointment: any) =>
        isAppointmentIncludedInOverview(appointment.status)
      ).length;

      const overviewAppointments = scopedAppointments.filter((appointment: any) =>
        isWithinCalendarWindow(appointment.scheduledStart)
      );

      const waitingCount = overviewAppointments.filter((a: any) => isCheckedIn(a.status)).length;
      const inRoomsCount = overviewAppointments.filter((a: any) => isInRooms(a.status)).length;
      const completedCount = scopedAppointments.filter((a: any) => isCompletedVisit(a.status)).length;
      const checkoutCount = scopedAppointments.filter((a: any) => normalizeStatus(a.status) === 'checkout').length;
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

      const pendingLabOrders = orders.filter(isOpenLabPathOrder).length;

      const unsignedNotesToday = encountersData.filter((encounter: Encounter) => {
        return isOnLocalDay(encounter.updatedAt || encounter.createdAt, todayStr) && isEncounterOpen(encounter.status);
      }).length;
      const notesWrittenToday = encountersData.filter((encounter: Encounter) => {
        return isOnLocalDay(encounter.updatedAt || encounter.createdAt, todayStr);
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

      const waitingOverLimitCount = overviewAppointments.filter((appointment: any) =>
        isCheckedIn(appointment.status) && getAppointmentDelayMinutes(appointment, nowMs) >= WAITING_ROOM_RISK_MINUTES
      ).length;
      const roomDwellOverLimitCount = overviewAppointments.filter((appointment: any) =>
        isInRooms(appointment.status) && getAppointmentDelayMinutes(appointment, nowMs) >= ROOM_DWELL_RISK_MINUTES
      ).length;
      const upcomingThirtyMinuteCount = scopedAllAppointments.filter((appointment: any) => {
        if (normalizeStatus(appointment.status) !== 'scheduled') return false;
        const startMs = new Date(appointment.scheduledStart).getTime();
        return Number.isFinite(startMs) && startMs >= nowMs && startMs <= nowMs + 30 * 60 * 1000;
      }).length;
      const intakeIncompleteCount = scopedAppointments.filter(isIntakeIncomplete).length;
      const activeVisitNotClosedCount = scopedAppointments.filter((appointment: any) =>
        ['checked_in', 'in_room', 'with_provider', 'checkout'].includes(normalizeStatus(appointment.status))
      ).length;
      const claimsCreatedToday = claims.filter((claim: any) =>
        isOnLocalDay(claim.createdAt || claim.created_at || claim.submittedAt || claim.submitted_at || claim.serviceDate || claim.service_date, todayStr)
      ).length;
      const summarySchedule = commandSummaryRes?.schedule || null;
      const summaryClaims = commandSummaryRes?.claims || null;
      const summaryFinancials = commandSummaryRes?.financials || null;
      const officialScheduleStats = {
        appointmentsCount: summaryNumber(totalScheduleCount, summarySchedule?.appointmentsCount),
        activeAppointmentsCount: summaryNumber(scopedAppointments.length, summarySchedule?.activeAppointmentsCount),
        checkedInCount: summaryNumber(waitingCount, summarySchedule?.checkedInCount),
        completedCount: summaryNumber(completedCount, summarySchedule?.completedCount),
        waitingCount: summaryNumber(waitingCount, summarySchedule?.waitingCount),
        inRoomsCount: summaryNumber(inRoomsCount, summarySchedule?.inRoomsCount),
        checkoutCount: summaryNumber(checkoutCount, summarySchedule?.checkoutCount),
        staleScheduledCount: summaryNumber(staleScheduledCount, summarySchedule?.staleScheduledCount),
        noShowCount: summaryNumber(noShowCount, summarySchedule?.noShowCount),
        cancelledCount: summaryNumber(cancelledCount, summarySchedule?.cancelledCount),
        needsInsuranceVerification: summaryNumber(needsInsuranceVerification, summarySchedule?.needsInsuranceVerification),
        balanceDueAppointments: summaryNumber(balanceDueAppointments, summarySchedule?.balanceDueAppointments),
        copayDueCents: summaryNumber(copayDueCents, summarySchedule?.copayDueCents),
      };
      const officialFinancialStats = {
        revenueTodayCents: summaryNumber(revenueTodayCents, summaryFinancials?.revenueTodayCents),
        netCollectionsCents: summaryNumber(netCollectionsCents, summaryFinancials?.netCollectionsCents),
        patientCollectionsCents: summaryNumber(patientCollectionsCents, summaryFinancials?.patientCollectionsCents),
        payerCollectionsCents: summaryNumber(payerCollectionsCents, summaryFinancials?.payerCollectionsCents),
        storeCollectionsCents: summaryNumber(storeCollectionsCents, summaryFinancials?.storeCollectionsCents),
        collectionRateToday: summaryNumber(collectionRateToday, summaryFinancials?.collectionRateToday),
        financialWorkQueueCount: summaryNumber(openFinancialWorkQueueItems.length, summaryFinancials?.financialWorkQueueCount),
        claimWorkQueueCount: summaryNumber(claimWorkQueueCount, summaryFinancials?.claimWorkQueueCount),
        billingWorkQueueCount: summaryNumber(billingWorkQueueCount, summaryFinancials?.billingWorkQueueCount),
        arTotalCents: summaryNumber(arTotalCents, summaryFinancials?.arTotalCents),
        arOver90Cents: summaryNumber(arOver90Cents, summaryFinancials?.arOver90Cents),
      };
      const officialClaimsStats = {
        claimsInQueue: summaryNumber(claims.filter(isClaimInQueue).length, summaryClaims?.claimsInQueue),
        claimsDeniedRejected: summaryNumber(claims.filter(isClaimAtRisk).length, summaryClaims?.claimsDeniedRejected),
      };
      const visitsNeedingClaimReview = Math.max(0, officialScheduleStats.completedCount - claimsCreatedToday);
      const revenueCollectionGapCents = Math.max(0, officialFinancialStats.revenueTodayCents - officialFinancialStats.netCollectionsCents);
      const loadedCriticalPathologyCount = biopsyRes?.queues?.critical?.length || 0;

      const providerMap = new Map<string, HomeProviderThroughput>();
      scopedAllAppointments
        .filter((appointment: any) => isAppointmentIncludedInOverview(appointment.status))
        .forEach((appointment: any) => {
          const providerId = String(appointment.providerId || appointment.providerName || 'unassigned');
          const existing = providerMap.get(providerId) || {
            providerId,
            providerName: String(appointment.providerName || 'Unassigned Provider'),
            total: 0,
            active: 0,
            waiting: 0,
            inRooms: 0,
            completed: 0,
            stale: 0,
            longestDelayMinutes: 0,
            route: '/schedule',
          };
          const status = normalizeStatus(appointment.status);
          existing.total += 1;
          if (!['completed', 'cancelled', 'no_show'].includes(status)) existing.active += 1;
          if (isCheckedIn(status)) existing.waiting += 1;
          if (isInRooms(status)) existing.inRooms += 1;
          if (isCompletedVisit(status)) existing.completed += 1;
          if (isStaleScheduledAppointment(appointment, nowMs)) existing.stale += 1;
          existing.longestDelayMinutes = Math.max(existing.longestDelayMinutes, getAppointmentDelayMinutes(appointment, nowMs));
          providerMap.set(providerId, existing);
        });

      const providerThroughput = Array.from(providerMap.values())
        .sort((left, right) => {
          const leftRisk = left.stale * 4 + left.waiting * 2 + left.inRooms;
          const rightRisk = right.stale * 4 + right.waiting * 2 + right.inRooms;
          if (rightRisk !== leftRisk) return rightRisk - leftRisk;
          return right.total - left.total;
        })
        .slice(0, 5);

      setCommandQueues({
        riskItems: [
          {
            id: 'overdue-checkins',
            label: 'Overdue check-ins',
            value: officialScheduleStats.staleScheduledCount,
            detail: 'Still scheduled past the check-in grace window',
            route: '/schedule',
            access: 'schedule',
            commandSection: 'panel_risk_queue',
            icon: TimerReset,
            tone: officialScheduleStats.staleScheduledCount > 0 ? 'red' : 'emerald',
          },
          {
            id: 'long-wait',
            label: `Waiting ${WAITING_ROOM_RISK_MINUTES}+ min`,
            value: waitingOverLimitCount,
            detail: 'Checked-in patients waiting longer than target',
            route: `/office-flow?date=${todayStr}&status=checked_in`,
            access: 'office_flow',
            commandSection: 'panel_risk_queue',
            icon: Hourglass,
            tone: waitingOverLimitCount > 0 ? 'amber' : 'emerald',
          },
          {
            id: 'room-dwell',
            label: `Rooms ${ROOM_DWELL_RISK_MINUTES}+ min`,
            value: roomDwellOverLimitCount,
            detail: 'Patients roomed longer than target',
            route: `/office-flow?date=${todayStr}&status=in_room`,
            access: 'office_flow',
            commandSection: 'panel_risk_queue',
            icon: DoorOpen,
            tone: roomDwellOverLimitCount > 0 ? 'amber' : 'emerald',
          },
          {
            id: 'claim-exceptions',
            label: 'Claim exceptions',
            value: officialClaimsStats.claimsDeniedRejected,
            detail: 'Denied, rejected, appealed, or aging claims',
            route: `/claims?queue=denials&status=denied&startDate=${todayStr}&endDate=${todayStr}`,
            access: 'claims',
            commandSection: 'priority_claims',
            icon: BadgeAlert,
            tone: officialClaimsStats.claimsDeniedRejected > 0 ? 'red' : 'emerald',
          },
        ],
        frontDeskItems: [
          {
            id: 'arriving-soon',
            label: 'Arriving next 30',
            value: upcomingThirtyMinuteCount,
            detail: 'Scheduled arrivals that need readiness checks now',
            route: '/schedule',
            access: 'schedule',
            commandSection: 'panel_front_desk',
            icon: UserCheck,
            tone: upcomingThirtyMinuteCount > 0 ? 'blue' : 'slate',
          },
          {
            id: 'insurance',
            label: 'Insurance not verified',
            value: officialScheduleStats.needsInsuranceVerification,
            detail: 'Eligibility or coverage checks blocking a clean visit',
            route: '/front-desk',
            access: 'office_flow',
            commandSection: 'panel_front_desk',
            icon: ClipboardCheck,
            tone: officialScheduleStats.needsInsuranceVerification > 0 ? 'amber' : 'emerald',
          },
          {
            id: 'balances',
            label: 'Balances / copays',
            value: officialScheduleStats.balanceDueAppointments,
            detail: `${currencyFromCents(officialScheduleStats.copayDueCents)} in expected copays`,
            route: '/front-desk',
            access: 'office_flow',
            commandSection: 'panel_front_desk',
            icon: CircleDollarSign,
            tone: officialScheduleStats.balanceDueAppointments > 0 ? 'amber' : 'emerald',
          },
          {
            id: 'forms',
            label: 'Forms incomplete',
            value: intakeIncompleteCount,
            detail: 'Intake, consent, or portal paperwork still incomplete',
            route: '/documents?section=forms',
            access: 'documents',
            commandSection: 'panel_front_desk',
            icon: ClipboardList,
            tone: intakeIncompleteCount > 0 ? 'amber' : 'emerald',
          },
        ],
        readinessItems: [
          {
            id: 'status-cleanup',
            label: 'Schedule cleanup',
            value: officialScheduleStats.staleScheduledCount,
            detail: 'Appointments still scheduled after their visit window',
            route: '/schedule',
            access: 'schedule',
            commandSection: 'panel_end_of_day',
            icon: ClipboardX,
            tone: officialScheduleStats.staleScheduledCount > 0 ? 'red' : 'emerald',
          },
          {
            id: 'visit-closeout',
            label: 'Visits not checked out',
            value: activeVisitNotClosedCount,
            detail: 'Waiting, roomed, provider, or checkout statuses still open',
            route: '/office-flow',
            access: 'office_flow',
            commandSection: 'panel_end_of_day',
            icon: UsersRound,
            tone: activeVisitNotClosedCount > 0 ? 'amber' : 'emerald',
          },
          {
            id: 'unsigned-notes',
            label: 'Unsigned notes',
            value: unsignedNotesToday,
            detail: `Notes from ${todayStr} that still need completion or signature`,
            route: '/notes?tab=unsigned',
            access: 'notes',
            commandSection: 'panel_end_of_day',
            icon: FileCheck2,
            tone: unsignedNotesToday > 0 ? 'amber' : 'emerald',
          },
          {
            id: 'claims-review',
            label: 'Claims to create/review',
            value: visitsNeedingClaimReview,
            detail: `${claimsCreatedToday} claims created for ${todayStr} from completed visits`,
            route: `/claims?startDate=${todayStr}&endDate=${todayStr}`,
            access: 'claims',
            commandSection: 'priority_claims',
            icon: ReceiptText,
            tone: visitsNeedingClaimReview > 0 ? 'amber' : 'emerald',
          },
          {
            id: 'payments-gap',
            label: 'Collection gap',
            value: currencyFromCents(revenueCollectionGapCents),
            detail: 'Posted revenue not yet matched by collections today',
            route: `/financials?tab=revenue&startDate=${todayStr}&endDate=${todayStr}`,
            access: 'financials',
            commandSection: 'panel_revenue_cycle',
            icon: WalletCards,
            tone: revenueCollectionGapCents > 0 ? 'amber' : 'emerald',
          },
          {
            id: 'safety-closeout',
            label: 'Safety closeout',
            value: loadedCriticalPathologyCount,
            detail: 'Critical pathology follow-up before end of day',
            route: '/biopsies',
            access: 'labs',
            commandSection: 'banner_pathology',
            icon: ShieldCheck,
            tone: loadedCriticalPathologyCount > 0 ? 'red' : 'emerald',
          },
        ],
        providerThroughput,
      });

      setStats({
        appointmentsCount: officialScheduleStats.appointmentsCount,
        activeAppointmentsCount: officialScheduleStats.activeAppointmentsCount,
        checkedInCount: officialScheduleStats.checkedInCount,
        completedCount: officialScheduleStats.completedCount,
        pendingTasks: tasks.filter((t: any) => isTaskPending(t.status)).length,
        openEncounters: teamNotesNeedingWork,
        waitingCount: officialScheduleStats.waitingCount,
        inRoomsCount: officialScheduleStats.inRoomsCount,
        checkoutCount: officialScheduleStats.checkoutCount,
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
        notesWrittenToday,
        unsignedNotesToday,
        unreadMessageThreads,
        myNotesNeedingWork,
        teamNotesNeedingWork,
        needsInsuranceVerification: officialScheduleStats.needsInsuranceVerification,
        balanceDueAppointments: officialScheduleStats.balanceDueAppointments,
        copayDueCents: officialScheduleStats.copayDueCents,
        staleScheduledCount: officialScheduleStats.staleScheduledCount,
        noShowCount: officialScheduleStats.noShowCount,
        cancelledCount: officialScheduleStats.cancelledCount,
        revenueTodayCents: officialFinancialStats.revenueTodayCents,
        netCollectionsCents: officialFinancialStats.netCollectionsCents,
        patientCollectionsCents: officialFinancialStats.patientCollectionsCents,
        payerCollectionsCents: officialFinancialStats.payerCollectionsCents,
        storeCollectionsCents: officialFinancialStats.storeCollectionsCents,
        collectionRateToday: officialFinancialStats.collectionRateToday,
        claimsInQueue: officialClaimsStats.claimsInQueue,
        claimsDeniedRejected: officialClaimsStats.claimsDeniedRejected,
        financialWorkQueueCount: officialFinancialStats.financialWorkQueueCount,
        claimWorkQueueCount: officialFinancialStats.claimWorkQueueCount,
        billingWorkQueueCount: officialFinancialStats.billingWorkQueueCount,
        arTotalCents: officialFinancialStats.arTotalCents,
        arOver90Cents: officialFinancialStats.arOver90Cents,
      });
      setDataHealth({
        failedSources: Array.from(new Set([...failedSources, ...getCommandSummaryFailedSourceLabels(commandSummaryRes)])),
        lastUpdatedAt: new Date().toISOString(),
        businessDate: todayStr,
      });
    } catch (err: any) {
      setDataHealth((current) => ({
        ...current,
        failedSources: Array.from(new Set([...current.failedSources, 'command center'])),
        lastUpdatedAt: new Date().toISOString(),
      }));
      showError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [businessDate, canAccessAnyModule, canViewCommandSection, overviewLocationFilter, session, showError]);

  const handleBusinessDateChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextDate = event.target.value;
    if (!ISO_DATE_PATTERN.test(nextDate)) return;

    setClinicBusinessDate(nextDate);
    setBusinessDate(nextDate);
  }, []);

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
      localStorage.setItem('sched:viewMode', 'day');
      localStorage.setItem('sched:provider', appointment.providerId || 'all');
      localStorage.setItem('sched:type', appointment.appointmentTypeId || 'all');
      localStorage.setItem('sched:location', appointment.locationId || 'all');

      setShowAppointmentFinder(false);
      navigate(`/schedule?view=day&date=${toLocalIsoDate(appointmentDay)}&appointmentId=${encodeURIComponent(appointment.id)}`);
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
  const showHeaderBillingBacklog = canViewCommandSection('header_billing_backlog');
  const commandUrgentCount =
    (canViewCommandSection('priority_pathology') ? criticalPathologyCount : 0) +
    (canViewCommandSection('priority_claims') ? stats.claimsDeniedRejected : 0) +
    stats.needsInsuranceVerification +
    stats.balanceDueAppointments +
    stats.staleScheduledCount;
  const commandBacklogCount = showHeaderBillingBacklog ? stats.billingWorkQueueCount : 0;
  const operationalCompletionRate =
    stats.appointmentsCount > 0 ? Math.round((stats.completedCount / stats.appointmentsCount) * 100) : 0;
  const isCurrentBusinessDate = businessDate === getDateKeyInPracticeTimeZone(new Date());
  const dayScopeLabel = isCurrentBusinessDate ? "Today's" : 'Selected day';
  const dayScopeLower = isCurrentBusinessDate ? 'today' : 'selected day';
  const withBusinessDateRoute = (route: string): string => {
    const [pathAndQuery, hash] = route.split('#');
    const [pathname, query = ''] = pathAndQuery.split('?');
    const params = new URLSearchParams(query);

    if (pathname === '/schedule' || pathname === '/office-flow') {
      params.set('date', businessDate);
    }
    if (pathname === '/financials' || pathname === '/claims') {
      params.set('startDate', businessDate);
      params.set('endDate', businessDate);
    }

    const queryString = params.toString();
    return `${pathname}${queryString ? `?${queryString}` : ''}${hash ? `#${hash}` : ''}`;
  };

  const commandMetrics: Array<{
    label: string;
    value: string | number;
    detail: string;
    route: string;
    access?: ModuleKey | ModuleKey[];
    commandSection?: CommandCenterSectionKey;
    icon: LucideIcon;
    tone: 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'slate';
  }> = [
    {
      label: `${dayScopeLabel} schedule`,
      value: stats.appointmentsCount,
      detail: `${stats.waitingCount} waiting, ${stats.inRoomsCount} in rooms, ${stats.completedCount} completed${
        stats.staleScheduledCount > 0 ? `, ${stats.staleScheduledCount} need status` : ''
      }`,
      route: withBusinessDateRoute('/schedule'),
      access: 'schedule',
      commandSection: 'metric_schedule',
      icon: CalendarDays,
      tone: 'blue',
    },
    {
      label: `Revenue ${dayScopeLower}`,
      value: currencyFromCents(stats.revenueTodayCents),
      detail: `${currencyFromCents(stats.netCollectionsCents)} clinical collections${
        stats.storeCollectionsCents > 0 ? `, ${currencyFromCents(stats.storeCollectionsCents)} store` : ''
      }`,
      route: withBusinessDateRoute('/financials?tab=revenue'),
      access: 'financials',
      commandSection: 'metric_revenue',
      icon: DollarSign,
      tone: 'emerald',
    },
    {
      label: `Collections ${dayScopeLower}`,
      value: currencyFromCents(stats.netCollectionsCents),
      detail: `${currencyFromCents(stats.patientCollectionsCents)} patient, ${currencyFromCents(stats.payerCollectionsCents)} payer`,
      route: withBusinessDateRoute('/financials?tab=payments'),
      access: 'financials',
      commandSection: 'metric_collections',
      icon: CreditCard,
      tone: 'emerald',
    },
    {
      label: `Notes ${dayScopeLower}`,
      value: stats.notesWrittenToday,
      detail: `${stats.unsignedNotesToday} unsigned, ${stats.teamNotesNeedingWork} open team encounters`,
      route: '/notes',
      access: 'notes',
      commandSection: 'metric_clinical_work',
      icon: Stethoscope,
      tone: 'violet',
    },
    {
      label: 'Open lab/path orders',
      value: stats.pendingLabOrders,
      detail: `${totalPathologyOpenLoops} biopsy safety loops, ${criticalPathologyCount} critical/high`,
      route: '/labs?tab=all-open',
      access: 'labs',
      commandSection: 'metric_clinical_work',
      icon: ClipboardCheck,
      tone: stats.pendingLabOrders > 0 ? 'amber' : 'slate',
    },
    {
      label: 'Patient access',
      value: stats.needsInsuranceVerification + stats.balanceDueAppointments,
      detail: `${stats.needsInsuranceVerification} insurance checks, ${stats.balanceDueAppointments} balances`,
      route: '/front-desk',
      access: 'office_flow',
      commandSection: 'metric_patient_access',
      icon: ClipboardCheck,
      tone: 'amber',
    },
    {
      label: 'Revenue cycle',
      value: stats.claimsInQueue + stats.claimsDeniedRejected + stats.billingWorkQueueCount,
      detail: `${stats.claimsInQueue} active, ${stats.claimsDeniedRejected} urgent, ${stats.billingWorkQueueCount} backlog`,
      route: canAccessAnyModule('financials') ? withBusinessDateRoute('/financials') : withBusinessDateRoute('/claims'),
      access: ['financials', 'claims'],
      commandSection: 'metric_revenue_cycle',
      icon: DollarSign,
      tone: stats.claimsDeniedRejected > 0 ? 'red' : stats.billingWorkQueueCount > 0 ? 'amber' : 'emerald',
    },
    {
      label: 'Clinical Inbox',
      value: stats.unreadMessageThreads,
      detail: `${stats.pendingTasks} open tasks, ${stats.unreadMessageThreads} unread threads`,
      route: '/clinical-inbox',
      access: 'clinical_inbox',
      commandSection: 'metric_clinical_inbox',
      icon: Inbox,
      tone: stats.unreadMessageThreads > 0 ? 'amber' : 'slate',
    },
  ].filter(canOpenAction);

  const priorityItems = [
    {
      label: 'Critical pathology follow-up',
      value: criticalPathologyCount,
      detail: `${totalPathologyOpenLoops} open biopsy loops`,
      route: '/biopsies',
      access: 'labs',
      commandSection: 'priority_pathology' as CommandCenterSectionKey,
      icon: ShieldCheck,
      severity: criticalPathologyCount > 0 ? 'critical' : 'steady',
    },
    {
      label: 'Claim exceptions',
      value: stats.claimsDeniedRejected,
      detail: `${stats.claimsDeniedRejected} denied, rejected, appealed, or at-risk claims`,
      route: withBusinessDateRoute('/claims?queue=denials&status=denied'),
      access: 'claims',
      commandSection: 'priority_claims' as CommandCenterSectionKey,
      icon: AlertTriangle,
      severity: stats.claimsDeniedRejected > 0 ? 'critical' : 'steady',
    },
    {
      label: 'Billing backlog',
      value: stats.billingWorkQueueCount,
      detail: `${currencyFromCents(stats.arTotalCents)} open A/R; ${currencyFromCents(stats.arOver90Cents)} older than 90 days`,
      route: withBusinessDateRoute('/financials?tab=bills'),
      access: 'financials',
      commandSection: 'priority_billing' as CommandCenterSectionKey,
      icon: CreditCard,
      severity: stats.billingWorkQueueCount > 0 ? 'warning' : 'steady',
    },
    {
      label: 'Patient-ready blockers',
      value: stats.needsInsuranceVerification + stats.balanceDueAppointments,
      detail: `${stats.needsInsuranceVerification} insurance, ${currencyFromCents(stats.copayDueCents)} copays due`,
      route: '/front-desk',
      access: 'office_flow',
      commandSection: 'priority_patient_ready' as CommandCenterSectionKey,
      icon: ClipboardCheck,
      severity: stats.needsInsuranceVerification + stats.balanceDueAppointments > 0 ? 'warning' : 'steady',
    },
    {
      label: 'Provider desk',
      value: stats.myNotesNeedingWork + stats.pendingLabOrders,
      detail: `${stats.myNotesNeedingWork} my notes, ${stats.pendingLabOrders} open lab/path orders`,
      route: '/notes',
      access: ['notes', 'labs'],
      commandSection: 'priority_provider_desk' as CommandCenterSectionKey,
      icon: FileText,
      severity: stats.myNotesNeedingWork + stats.pendingLabOrders > 0 ? 'warning' : 'steady',
    },
  ].filter(canOpenAction);

  const quickActions = [
    { label: 'New Patient', route: '/patients/new', access: 'patients' as ModuleKey, commandSection: 'quick_actions' as CommandCenterSectionKey, icon: UserPlus },
    { label: 'Schedule', route: withBusinessDateRoute('/schedule'), access: 'schedule' as ModuleKey, commandSection: 'quick_actions' as CommandCenterSectionKey, icon: CalendarDays },
    { label: 'Tasks', route: '/tasks', access: 'tasks' as ModuleKey, commandSection: 'quick_actions' as CommandCenterSectionKey, icon: ClipboardCheck },
    { label: 'Financials', route: withBusinessDateRoute('/financials'), access: 'financials' as ModuleKey, commandSection: 'quick_actions' as CommandCenterSectionKey, icon: DollarSign },
    { label: 'Analytics', route: '/analytics', access: 'analytics' as ModuleKey, commandSection: 'quick_actions' as CommandCenterSectionKey, icon: BarChart3 },
    { label: 'Clinical Inbox', route: '/clinical-inbox', access: 'clinical_inbox' as ModuleKey, commandSection: 'quick_actions' as CommandCenterSectionKey, icon: Inbox },
    { label: 'Mail', route: '/mail', access: 'mail' as ModuleKey, commandSection: 'quick_actions' as CommandCenterSectionKey, icon: Mail },
  ].filter(canOpenAction);

  const revenuePulseItems: HomeActionQueueItem[] = [
    {
      id: 'expected-revenue',
      label: 'Expected clinical revenue',
      value: currencyFromCents(stats.revenueTodayCents),
      detail: 'Posted clinical revenue in the selected day',
      route: withBusinessDateRoute('/financials?tab=revenue'),
      access: 'financials',
      commandSection: 'panel_revenue_pulse',
      icon: DollarSign,
      tone: stats.revenueTodayCents > 0 ? 'emerald' : 'slate',
    },
    {
      id: 'collected-revenue',
      label: 'Collected so far',
      value: currencyFromCents(stats.netCollectionsCents),
      detail: `${currencyFromCents(stats.patientCollectionsCents)} patient · ${currencyFromCents(stats.payerCollectionsCents)} payer`,
      route: withBusinessDateRoute('/financials?tab=payments'),
      access: 'financials',
      commandSection: 'panel_revenue_pulse',
      icon: WalletCards,
      tone: stats.netCollectionsCents > 0 ? 'emerald' : 'slate',
    },
    {
      id: 'collection-gap',
      label: 'Collection opportunity',
      value: currencyFromCents(Math.max(0, stats.revenueTodayCents - stats.netCollectionsCents)),
      detail: `${stats.collectionRateToday}% collection rate ${dayScopeLower}`,
      route: withBusinessDateRoute('/financials?tab=revenue'),
      access: 'financials',
      commandSection: 'panel_revenue_pulse',
      icon: CircleDollarSign,
      tone: stats.revenueTodayCents > stats.netCollectionsCents ? 'amber' : 'emerald',
    },
    {
      id: 'store-revenue',
      label: 'Store revenue',
      value: currencyFromCents(stats.storeCollectionsCents),
      detail: 'Retail payments tied to the office store',
      route: '/store-ops?tab=payments',
      access: 'store',
      commandSection: 'panel_revenue_pulse',
      icon: Store,
      tone: stats.storeCollectionsCents > 0 ? 'emerald' : 'slate',
    },
  ].filter(canOpenAction);

  const visibleCommandQueues: HomeCommandQueues = {
    riskItems: commandQueues.riskItems.filter(canOpenAction),
    frontDeskItems: commandQueues.frontDeskItems.filter(canOpenAction),
    readinessItems: commandQueues.readinessItems.filter(canOpenAction),
    providerThroughput: canAccessAnyModule('schedule') && canViewCommandSection('panel_provider_throughput')
      ? commandQueues.providerThroughput
      : [],
  };
  const showRiskQueuePanel = canViewCommandSection('panel_risk_queue');
  const showRevenuePulsePanel = canViewCommandSection('panel_revenue_pulse') && revenuePulseItems.length > 0;
  const showFrontDeskPanel =
    canViewCommandSection('panel_front_desk') &&
    (canAccessAnyModule('office_flow') || visibleCommandQueues.frontDeskItems.length > 0);
  const showProviderThroughputPanel = canAccessAnyModule('schedule') && canViewCommandSection('panel_provider_throughput');
  const showEndOfDayPanel = canViewCommandSection('panel_end_of_day');
  const showPatientFlowSection = canAccessAnyModule(['schedule', 'office_flow']) && canViewCommandSection('panel_patient_flow');
  const showClinicalWorkSection = canAccessAnyModule(['notes', 'orders', 'labs']) && canViewCommandSection('panel_clinical_work');
  const showRevenueCycleSection = canAccessAnyModule('financials') && canViewCommandSection('panel_revenue_cycle');

  const renderQueueItems = (items: HomeActionQueueItem[], emptyLabel: string) => (
    items.length === 0 ? (
      <div className="command-empty-state">{emptyLabel}</div>
    ) : (
      items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.id}
            className={`command-insight-row command-insight-row--${item.tone}`}
            onClick={() => navigate(item.route)}
          >
            <span className="command-insight-row__icon">
              <Icon size={17} aria-hidden="true" />
            </span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
            <b>{loading ? '-' : item.value}</b>
          </button>
        );
      })
    )
  );

  return (
    <div className="home-page command-center-page">
      <header className="command-center-hero">
        <div className="command-center-hero__copy">
          <div className="command-center-kicker">{dayScopeLabel} Overview</div>
          <h1>Practice Command Center</h1>
          <div className="command-center-hero__meta">
            <span>{stats.scheduleDateLabel || new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span>{operationalCompletionRate}% complete</span>
            <span>{commandUrgentCount} urgent today</span>
            {showHeaderBillingBacklog && <span>{commandBacklogCount} billing backlog</span>}
          </div>
        </div>
        <div className="command-center-toolbar">
          <label htmlFor="home-business-date">Business date</label>
          <input
            id="home-business-date"
            type="date"
            value={businessDate}
            onChange={handleBusinessDateChange}
          />
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

      {dataHealth.failedSources.length > 0 && (
        <section className="command-data-health" role="status" aria-live="polite">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>
            Data unavailable for {dataHealth.failedSources.join(', ')}. Counts from those areas are hidden or incomplete until the next refresh.
          </span>
        </section>
      )}

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

      <section className="command-insight-grid" aria-label="Command center action queues">
        {showRiskQueuePanel && (
        <div className="command-insight-panel">
          <div className="command-insight-panel__header">
            <span className="command-insight-panel__icon command-insight-panel__icon--red">
              <Activity size={17} aria-hidden="true" />
            </span>
            <div>
              <p>{dayScopeLabel} Risk Queue</p>
              <h2>Problems to pull forward</h2>
            </div>
          </div>
          <div className="command-insight-stack">
            {renderQueueItems(visibleCommandQueues.riskItems, 'No urgent operational risks in this view.')}
          </div>
        </div>
        )}

        {showRevenuePulsePanel && (
          <div className="command-insight-panel">
            <div className="command-insight-panel__header">
              <span className="command-insight-panel__icon command-insight-panel__icon--emerald">
                <CircleDollarSign size={17} aria-hidden="true" />
              </span>
              <div>
                <p>Revenue Pulse</p>
                <h2>Money moving {dayScopeLower}</h2>
              </div>
            </div>
            <div className="command-insight-stack">
              {renderQueueItems(revenuePulseItems, 'No revenue activity posted yet.')}
            </div>
          </div>
        )}

        {showFrontDeskPanel && (
          <div className="command-insight-panel">
            <div className="command-insight-panel__header">
              <span className="command-insight-panel__icon command-insight-panel__icon--blue">
                <UserCheck size={17} aria-hidden="true" />
              </span>
              <div>
                <p>Front Desk Command</p>
                <h2>Ready before arrival</h2>
              </div>
            </div>
            <div className="command-insight-stack">
              {renderQueueItems(visibleCommandQueues.frontDeskItems, 'No front desk blockers right now.')}
            </div>
          </div>
        )}

        {showProviderThroughputPanel && (
          <div className="command-insight-panel">
            <div className="command-insight-panel__header">
              <span className="command-insight-panel__icon command-insight-panel__icon--violet">
                <UsersRound size={17} aria-hidden="true" />
              </span>
              <div>
                <p>Provider Throughput</p>
                <h2>Who is running hot</h2>
              </div>
            </div>
            <div className="command-provider-list">
              {visibleCommandQueues.providerThroughput.length === 0 ? (
                <div className="command-empty-state">No provider schedule volume in this view.</div>
              ) : (
                visibleCommandQueues.providerThroughput.map((provider) => {
                  const providerStatus = provider.stale > 0
                    ? 'Needs cleanup'
                    : provider.longestDelayMinutes >= WAITING_ROOM_RISK_MINUTES
                      ? 'Running behind'
                      : provider.active > 0
                        ? 'In motion'
                        : 'Clear';
                  const providerTone = provider.stale > 0 || provider.longestDelayMinutes >= ROOM_DWELL_RISK_MINUTES
                    ? 'red'
                    : provider.longestDelayMinutes >= WAITING_ROOM_RISK_MINUTES
                      ? 'amber'
                      : 'emerald';
                  return (
                    <button
                      type="button"
                      key={provider.providerId}
                      className={`command-provider-row command-provider-row--${providerTone}`}
                      onClick={() => {
                        if (provider.providerId !== 'unassigned') {
                          localStorage.setItem('sched:provider', provider.providerId);
                          localStorage.setItem('sched:viewMode', 'day');
                        }
                        navigate(withBusinessDateRoute('/schedule?view=day'));
                      }}
                    >
                      <span>
                        <strong>{provider.providerName}</strong>
                        <small>
                          {provider.total} scheduled · {provider.completed} seen · {provider.waiting} waiting · {provider.inRooms} roomed
                        </small>
                      </span>
                      <em>{providerStatus}</em>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {showEndOfDayPanel && (
        <div className="command-insight-panel command-insight-panel--wide">
          <div className="command-insight-panel__header">
            <span className="command-insight-panel__icon command-insight-panel__icon--amber">
              <FileCheck2 size={17} aria-hidden="true" />
            </span>
            <div>
              <p>End-of-Day Readiness</p>
              <h2>Close before everyone leaves</h2>
            </div>
          </div>
          <div className="command-readiness-grid">
            {renderQueueItems(visibleCommandQueues.readinessItems, 'Nothing is blocking end-of-day closeout.')}
          </div>
        </div>
        )}
      </section>

      <section className="command-center-grid" aria-label="Daily operations command center">
        {showPatientFlowSection && (
        <div className="command-panel command-panel--wide">
          <div className="command-panel__header">
            <div>
              <p>Patient Flow</p>
              <h2>{dayScopeLabel} Patients</h2>
            </div>
            <button type="button" className="command-link-btn" onClick={() => navigate('/front-desk')}>
              Front Desk <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="command-flow-row">
            {[
      { label: isCurrentBusinessDate ? 'Today' : 'Selected', value: stats.appointmentsCount, tone: 'blue' },
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
              Current schedule filters: <strong>{stats.scheduleViewCount}</strong> appointments in {stats.scheduleViewMode} view
              {stats.scheduleHasFilters ? ', filtered' : ', unfiltered'}; {stats.activeAppointmentsCount} active.
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
        )}

        {showClinicalWorkSection && (
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
            <button type="button" className="command-work-row" onClick={() => navigate('/labs?tab=all-open')}>
              <ClipboardCheck size={17} aria-hidden="true" />
              <span>
                <strong>Open Lab/Path Orders</strong>
                <small>Open order queue across all dates</small>
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
        )}

        {showRevenueCycleSection && (
        <div className="command-panel">
          <div className="command-panel__header">
            <div>
              <p>Revenue Cycle</p>
              <h2>Money Watch</h2>
            </div>
            <button type="button" className="command-link-btn" onClick={() => navigate('/financials?tab=revenue')}>
              Financials <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="command-money-grid">
            <div>
              <span>{currencyFromCents(stats.revenueTodayCents)}</span>
              <p>Revenue {dayScopeLower}</p>
            </div>
            <div>
              <span>{currencyFromCents(stats.netCollectionsCents)}</span>
              <p>Clinical collections</p>
            </div>
            <div>
              <span>{stats.collectionRateToday}%</span>
              <p>Collection rate</p>
            </div>
            <div>
              <span>{stats.claimsInQueue}</span>
              <p>Claims active</p>
            </div>
            <div>
              <span>{stats.claimsDeniedRejected}</span>
              <p>At-risk claims</p>
            </div>
            <div>
              <span>{currencyFromCents(stats.arOver90Cents)}</span>
              <p>A/R over 90</p>
            </div>
          </div>
          <button type="button" className="command-work-row command-work-row--tight" onClick={() => navigate('/financials?tab=bills')}>
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              <strong>Financial work queue</strong>
              <small>
                {currencyFromCents(stats.arTotalCents)} open A/R · {stats.claimWorkQueueCount} claim denials, {stats.billingWorkQueueCount} billing
              </small>
            </span>
            <b>{loading ? '-' : stats.financialWorkQueueCount}</b>
          </button>
        </div>
        )}
      </section>

      {canAccessAnyModule('labs') && canViewCommandSection('banner_pathology') && biopsySafety && totalPathologyOpenLoops > 0 && (
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

      {canViewCommandSection('quick_actions') && (
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
      )}

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
