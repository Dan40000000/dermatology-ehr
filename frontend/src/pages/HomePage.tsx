import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import {
  fetchAppointments,
  fetchEncounters,
  fetchTasks,
  fetchOrders,
  fetchUnreadCount,
} from '../api';

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
  scheduleHasFilters: boolean;
  pendingLabOrders: number;
  unsignedNotesToday: number;
  unreadMessageThreads: number;
  myNotesNeedingWork: number;
  teamNotesNeedingWork: number;
}

const DASHBOARD_REFRESH_INTERVAL_MS = 30000;
const CALENDAR_WINDOW_START_HOUR = 7;
const CALENDAR_WINDOW_END_HOUR = 18;

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

const getScheduleViewRange = (currentDate: Date, viewMode: StoredScheduleViewMode): { start: Date; end: Date } => {
  if (viewMode === 'day') {
    return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
  }

  if (viewMode === 'week') {
    const monday = startOfDay(currentDate);
    const dayOfWeek = monday.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(monday.getDate() + diffToMonday);
    const friday = endOfDay(monday);
    friday.setDate(monday.getDate() + 4);
    return { start: monday, end: friday };
  }

  const monthStart = startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  monthStart.setDate(monthStart.getDate() - 7);
  const monthEnd = endOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
  monthEnd.setDate(monthEnd.getDate() + 14);
  return { start: monthStart, end: monthEnd };
};

const loadStoredScheduleContext = () => {
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
  };
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
  scheduleHasFilters: false,
  pendingLabOrders: 0,
  unsignedNotesToday: 0,
  unreadMessageThreads: 0,
  myNotesNeedingWork: 0,
  teamNotesNeedingWork: 0,
};

export function HomePage() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [overviewLocationFilter, setOverviewLocationFilter] = useState('all');
  const [overviewLocationOptions, setOverviewLocationOptions] = useState<LocationScopeOption[]>([]);
  const [stats, setStats] = useState<HomeStats>(INITIAL_STATS);

  const [showRegulatoryModal, setShowRegulatoryModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);

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

  const loadStats = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const todayStr = toLocalIsoDate(new Date());
      const scheduleContext = loadStoredScheduleContext();
      const scheduleDate = startOfDay(new Date());
      scheduleDate.setDate(scheduleDate.getDate() + scheduleContext.dayOffset);
      const scheduleRange = getScheduleViewRange(scheduleDate, scheduleContext.viewMode);

      const queryStart = new Date(Math.min(startOfDay(new Date()).getTime(), scheduleRange.start.getTime()));
      queryStart.setDate(queryStart.getDate() - 1);
      const queryEnd = new Date(Math.max(endOfDay(new Date()).getTime(), scheduleRange.end.getTime()));
      queryEnd.setDate(queryEnd.getDate() + 1);

      const [appointmentsRes, encountersRes, tasksRes, ordersRes, unreadRes] = await Promise.all([
        fetchAppointments(session.tenantId, session.accessToken, {
          startDate: toLocalIsoDate(queryStart),
          endDate: toLocalIsoDate(queryEnd),
        }),
        fetchEncounters(session.tenantId, session.accessToken),
        fetchTasks(session.tenantId, session.accessToken),
        fetchOrders(session.tenantId, session.accessToken).catch(() => ({ orders: [] })),
        fetchUnreadCount(session.tenantId, session.accessToken).catch(() => ({ count: 0 })),
      ]);

      const appointments = appointmentsRes.appointments || [];
      const encountersData = (encountersRes.encounters || []) as Encounter[];
      const tasks = tasksRes.tasks || [];
      const orders = ordersRes.orders || [];
      const unreadMessageThreads = Number(unreadRes.count || 0);

      const todaysAppointments = appointments.filter((a: any) =>
        isOnLocalDay(a.scheduledStart, todayStr) && isAppointmentIncludedInOverview(a.status)
      );

      const locationMap = new Map<string, string>();
      todaysAppointments.forEach((appointment: any) => {
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

      const scopedAppointments = todaysAppointments.filter((appointment: any) =>
        effectiveOverviewLocation === 'all' ? true : appointment.locationId === effectiveOverviewLocation
      );

      const overviewAppointments = scopedAppointments.filter((appointment: any) =>
        isWithinCalendarWindow(appointment.scheduledStart)
      );

      const waitingCount = overviewAppointments.filter((a: any) => isCheckedIn(a.status)).length;
      const inRoomsCount = overviewAppointments.filter((a: any) => isInRooms(a.status)).length;
      const checkoutCount = overviewAppointments.filter((a: any) => isCompletedVisit(a.status)).length;

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
      const scheduleViewAppointments = appointments.filter((a: any) => {
        if (!isAppointmentIncludedInOverview(a.status)) return false;
        if (scheduleContext.providerFilter !== 'all' && a.providerId !== scheduleContext.providerFilter) return false;
        if (scheduleContext.typeFilter !== 'all' && a.appointmentTypeId !== scheduleContext.typeFilter) return false;
        if (scheduleContext.locationFilter !== 'all' && a.locationId !== scheduleContext.locationFilter) return false;

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
        appointmentsCount: overviewAppointments.length,
        checkedInCount: waitingCount,
        completedCount: checkoutCount,
        pendingTasks: tasks.filter((t: any) => isTaskPending(t.status)).length,
        openEncounters: teamNotesNeedingWork,
        waitingCount,
        inRoomsCount,
        checkoutCount,
        scheduleViewCount: scheduleViewAppointments.length,
        scheduleViewMode: scheduleContext.viewMode,
        scheduleDateLabel: scheduleDate.toLocaleDateString('en-US', {
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
      });
    } catch (err: any) {
      showError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [overviewLocationFilter, session, showError]);

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

  return (
    <div className="home-page">
      <div className="section-title-bar">Today's Overview</div>

      {!loading && (
        <div
          style={{
            marginTop: '0.5rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <label htmlFor="home-overview-location" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
            Location
          </label>
          <select
            id="home-overview-location"
            value={overviewLocationFilter}
            onChange={(e) => setOverviewLocationFilter(e.target.value)}
            style={{
              minWidth: '220px',
              padding: '0.45rem 0.6rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
              background: '#ffffff',
            }}
          >
            <option value="all">All Locations</option>
            {overviewLocationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="stats-grid">
        {loading ? (
          <>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </>
        ) : (
          <>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.appointmentsCount}</div>
              <div className="stat-label">Appointments<br />Today</div>
            </div>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.checkedInCount}</div>
              <div className="stat-label">Checked In<br />Patients</div>
            </div>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.completedCount}</div>
              <div className="stat-label">Completed<br />Visits</div>
            </div>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.inRoomsCount}</div>
              <div className="stat-label">Patients<br />In Rooms</div>
            </div>
          </>
        )}
      </div>

      {!loading && (
        <div
          style={{
            marginTop: '0.5rem',
            marginBottom: '0.5rem',
            color: '#475569',
            fontSize: '0.8rem',
          }}
        >
          Overview counts are based on Home location filter and calendar window (7:00 AM-6:00 PM).
        </div>
      )}

      {!loading && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#334155',
            fontSize: '0.875rem',
          }}
        >
          Current schedule view: <strong>{stats.scheduleViewCount}</strong> appointments ({stats.scheduleViewMode} view, {stats.scheduleDateLabel}
          {stats.scheduleHasFilters ? ', filtered' : ', unfiltered'}).
        </div>
      )}

      <div className="section-title-bar" style={{ marginTop: '1rem', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#ffffff' }}>
        Today's Action Snapshot
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {loading ? (
          <>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </>
        ) : (
          <>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.pendingLabOrders}</div>
              <div className="stat-label">Pending Lab/Path<br />Orders</div>
            </div>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.unsignedNotesToday}</div>
              <div className="stat-label">Unsigned Notes<br />Today</div>
            </div>
            <div className="stat-card-teal">
              <div className="stat-number">{stats.unreadMessageThreads}</div>
              <div className="stat-label">Unread Message<br />Threads</div>
            </div>
          </>
        )}
      </div>

      <div
        className="ema-action-bar"
        style={{
          marginTop: '1rem',
          background: 'linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)',
          borderBottom: '2px solid #e5e7eb',
          gap: '0.5rem',
        }}
      >
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => navigate('/patients/new')}
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
          <span style={{ marginRight: '0.5rem', color: '#16a34a' }}>+</span>
          New Patient
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="ema-action-btn"
            onClick={() => setShowRegulatoryModal((prev) => !prev)}
            style={{
              background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
              border: '1px solid #d1d5db',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              color: '#374151',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1.2em' }}>📊</span>
            Regulatory Reporting
            <span style={{ fontSize: '0.7em' }}>▼</span>
          </button>
          {showRegulatoryModal && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '0.25rem',
                background: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
                minWidth: '200px',
                zIndex: 1000,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  navigate('/reports?type=regulatory');
                  setShowRegulatoryModal(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  borderBottom: '1px solid #e5e7eb',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
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
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                MIPS Value Path Report
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="ema-action-btn"
          onClick={() => setShowReminderModal(true)}
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
          <span style={{ marginRight: '0.5rem', color: '#8b5cf6' }}>🔔</span>
          General Reminder
        </button>

        <button
          type="button"
          className="ema-action-btn"
          onClick={() => navigate('/notes')}
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
          <span style={{ marginRight: '0.5rem', color: '#0ea5e9' }}>📝</span>
          Open Notes Queue
        </button>
      </div>

      <div className="section-title-bar" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#ffffff' }}>
        Office Flow Summary
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {loading ? (
          <>
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </>
        ) : (
          <>
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', color: '#ffffff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div className="stat-number" style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{stats.waitingCount}</div>
              <div className="stat-label" style={{ fontSize: '1rem', fontWeight: 500 }}>Waiting</div>
            </div>
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#ffffff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div className="stat-number" style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{stats.inRoomsCount}</div>
              <div className="stat-label" style={{ fontSize: '1rem', fontWeight: 500 }}>In Rooms</div>
            </div>
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#ffffff', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <div className="stat-number" style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>{stats.checkoutCount}</div>
              <div className="stat-label" style={{ fontSize: '1rem', fontWeight: 500 }}>Completed</div>
            </div>
          </>
        )}
      </div>

      <div className="home-grid">
        <div className="panel">
          <p className="panel-title">Pending Tasks</p>
          <div className="stat-highlight">
            {loading ? <Skeleton width={60} height={40} /> : stats.pendingTasks}
          </div>
          <p className="muted">open or in-progress tasks</p>
        </div>

        <div className="panel">
          <p className="panel-title">Open Encounters</p>
          <div className="stat-highlight">
            {loading ? <Skeleton width={60} height={40} /> : stats.openEncounters}
          </div>
          <p className="muted">non-finalized encounters</p>
        </div>

        <div className="panel">
          <p className="panel-title">Notes Needing Attention</p>
          <div className="stat-highlight">
            {loading ? <Skeleton width={60} height={40} /> : stats.teamNotesNeedingWork}
          </div>
          {!loading && (
            <>
              <p className="muted">My notes needing work: <strong>{stats.myNotesNeedingWork}</strong></p>
              <p className="muted">Unsigned notes updated today: <strong>{stats.unsignedNotesToday}</strong></p>
            </>
          )}
          <button
            type="button"
            className="quick-action"
            onClick={() => navigate('/notes')}
            style={{ marginTop: '0.5rem' }}
          >
            Open Notes Page
          </button>
        </div>

      </div>

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
