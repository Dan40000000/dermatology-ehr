import { useMemo, useState, useEffect } from 'react';
import type { Appointment, Provider, Availability } from '../../types';
import { MonthView } from './MonthView';

interface TimeBlock {
  id: string;
  providerId: string;
  title: string;
  blockType: string;
  description?: string;
  startTime: string;
  endTime: string;
  status: string;
  isRecurring?: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceEndDate?: string;
}

interface CalendarProps {
  currentDate: Date;
  viewMode: 'day' | 'week' | 'month';
  showWeekends?: boolean;
  appointments: Appointment[];
  providers: Provider[];
  availability: Availability[];
  timeBlocks: TimeBlock[];
  selectedAppointment: Appointment | null;
  onAppointmentClick: (appointment: Appointment) => void;
  onSlotClick: (providerId: string, date: Date, hour: number, minute: number) => void;
  onTimeBlockClick?: (timeBlockId: string) => void;
  checkInActionId?: string | null;
  noShowActionId?: string | null;
  canMarkNoShowAppointment?: (appointment: Appointment) => boolean;
  onAppointmentCheckIn?: (appointment: Appointment) => void;
  onAppointmentNoShow?: (appointment: Appointment) => void;
  onAppointmentUndoNoShow?: (appointment: Appointment) => void;
  onAppointmentCancel?: (appointment: Appointment) => void;
  onAppointmentReschedule?: (appointment: Appointment) => void;
}

interface AppointmentLayout {
  columnIndex: number;
  columnCount: number;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isTelehealthAppointment(appointment: Appointment | null | undefined): boolean {
  if (!appointment) return false;
  const combined = `${appointment.appointmentTypeName || ''} ${appointment.locationName || ''}`.toLowerCase();
  return /telehealth|virtual|video/.test(combined);
}

function buildAppointmentLayoutIndex(bucketMap: Map<string, Appointment[]>): Map<string, AppointmentLayout> {
  const layoutIndex = new Map<string, AppointmentLayout>();

  for (const appointments of bucketMap.values()) {
    const sortedAppointments = [...appointments]
      .filter((appointment) => {
        if (!appointment?.scheduledStart || !appointment?.scheduledEnd) return false;
        const startMs = new Date(appointment.scheduledStart).getTime();
        const endMs = new Date(appointment.scheduledEnd).getTime();
        return !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs;
      })
      .sort((left, right) => {
        const startDiff =
          new Date(left.scheduledStart).getTime() - new Date(right.scheduledStart).getTime();
        if (startDiff !== 0) return startDiff;
        return new Date(left.scheduledEnd).getTime() - new Date(right.scheduledEnd).getTime();
      });

    let active: Array<{ id: string; endMs: number; columnIndex: number }> = [];
    let currentGroupIds: string[] = [];
    let currentGroupColumnCount = 0;

    const flushGroup = () => {
      if (currentGroupIds.length === 0) return;
      currentGroupIds.forEach((appointmentId) => {
        const existing = layoutIndex.get(appointmentId);
        if (!existing) return;
        existing.columnCount = Math.max(existing.columnCount, currentGroupColumnCount);
      });
      currentGroupIds = [];
      currentGroupColumnCount = 0;
    };

    sortedAppointments.forEach((appointment) => {
      const startMs = new Date(appointment.scheduledStart).getTime();
      const endMs = new Date(appointment.scheduledEnd).getTime();

      active = active.filter((item) => item.endMs > startMs);
      if (active.length === 0) {
        flushGroup();
      }

      const usedColumns = new Set(active.map((item) => item.columnIndex));
      let columnIndex = 0;
      while (usedColumns.has(columnIndex)) {
        columnIndex += 1;
      }

      layoutIndex.set(appointment.id, { columnIndex, columnCount: 1 });
      currentGroupIds.push(appointment.id);
      active.push({ id: appointment.id, endMs, columnIndex });
      currentGroupColumnCount = Math.max(currentGroupColumnCount, active.length, columnIndex + 1);
    });

    flushGroup();
  }

  return layoutIndex;
}

function VideoCameraIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="14" height="10" rx="2" ry="2" />
      <path d="M16 10l6-3v10l-6-3z" />
    </svg>
  );
}

export function Calendar({
  currentDate,
  viewMode,
  showWeekends = false,
  appointments,
  providers,
  availability,
  timeBlocks,
  selectedAppointment,
  onAppointmentClick,
  onSlotClick,
  onTimeBlockClick,
  checkInActionId = null,
  noShowActionId = null,
  canMarkNoShowAppointment,
  onAppointmentCheckIn,
  onAppointmentNoShow,
  onAppointmentUndoNoShow,
  onAppointmentCancel,
  onAppointmentReschedule,
}: CalendarProps) {
  const [hoveredTimeBlock, setHoveredTimeBlock] = useState<TimeBlock | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Business hours: 8am to 5pm (8:00 - 17:00)
  const BUSINESS_START_HOUR = 8;
  const BUSINESS_END_HOUR = 17; // 5pm
  const CALENDAR_START_HOUR = 8;
  const CALENDAR_END_HOUR = 18;

  // Time slots from 8am to 6pm in 5-minute increments.
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = CALENDAR_START_HOUR; hour < CALENDAR_END_HOUR; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        slots.push({ hour, minute });
      }
    }
    return slots;
  }, [CALENDAR_END_HOUR, CALENDAR_START_HOUR]);

  // Generate days to display based on view mode
  const days = useMemo(() => {
    if (viewMode === 'day') {
      return [new Date(currentDate)];
    } else {
      // Week view: default Monday-Friday, optionally include weekends
      const totalWeekDays = showWeekends ? 7 : 5;
      const days = [];
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust to Monday
      startOfWeek.setDate(diff);

      for (let i = 0; i < totalWeekDays; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date);
      }
      return days;
    }
  }, [currentDate, viewMode, showWeekends]);

  const availabilityByProviderDay = useMemo(() => {
    const index = new Map<string, Availability[]>();
    if (!Array.isArray(availability)) {
      return index;
    }
    for (const entry of availability) {
      const key = `${entry.providerId}|${entry.dayOfWeek}`;
      const existing = index.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        index.set(key, [entry]);
      }
    }
    return index;
  }, [availability]);

  const appointmentsByProviderDay = useMemo(() => {
    const index = new Map<string, Appointment[]>();
    if (!Array.isArray(appointments)) {
      return index;
    }
    for (const appt of appointments) {
      if (!appt || appt.status === 'cancelled' || !appt.providerId) {
        continue;
      }
      const apptStart = new Date(appt.scheduledStart);
      if (Number.isNaN(apptStart.getTime())) {
        continue;
      }
      const key = `${appt.providerId}|${toDateKey(apptStart)}`;
      const existing = index.get(key);
      if (existing) {
        existing.push(appt);
      } else {
        index.set(key, [appt]);
      }
    }
    return index;
  }, [appointments]);

  const appointmentsByDay = useMemo(() => {
    const index = new Map<string, Appointment[]>();
    if (!Array.isArray(appointments)) {
      return index;
    }
    for (const appt of appointments) {
      if (!appt || appt.status === 'cancelled') {
        continue;
      }
      const apptStart = new Date(appt.scheduledStart);
      if (Number.isNaN(apptStart.getTime())) {
        continue;
      }
      const key = toDateKey(apptStart);
      const existing = index.get(key);
      if (existing) {
        existing.push(appt);
      } else {
        index.set(key, [appt]);
      }
    }
    return index;
  }, [appointments]);

  const dayViewAppointmentLayouts = useMemo(
    () => buildAppointmentLayoutIndex(appointmentsByProviderDay),
    [appointmentsByProviderDay]
  );

  const weekViewAppointmentLayouts = useMemo(
    () => buildAppointmentLayoutIndex(appointmentsByDay),
    [appointmentsByDay]
  );

  const timeBlocksByProviderDay = useMemo(() => {
    const index = new Map<string, TimeBlock[]>();
    if (!Array.isArray(timeBlocks)) {
      return index;
    }
    for (const block of timeBlocks) {
      if (!block || block.status !== 'active' || !block.providerId) {
        continue;
      }
      const blockStart = new Date(block.startTime);
      if (Number.isNaN(blockStart.getTime())) {
        continue;
      }
      const key = `${block.providerId}|${toDateKey(blockStart)}`;
      const existing = index.get(key);
      if (existing) {
        existing.push(block);
      } else {
        index.set(key, [block]);
      }
    }
    return index;
  }, [timeBlocks]);

  // Helper: Check if provider is available at this time
  const isProviderAvailable = (providerId: string, date: Date, hour: number, minute: number) => {
    const dayOfWeek = date.getDay();
    const timeInMinutes = hour * 60 + minute;

    // Default business hours: 8am-5pm (if no availability data is set up)
    const defaultStartMinutes = BUSINESS_START_HOUR * 60; // 8am = 480 minutes
    const defaultEndMinutes = BUSINESS_END_HOUR * 60; // 5pm = 1020 minutes

    if (availabilityByProviderDay.size === 0) {
      // No availability configured - default to business hours for weekdays (Mon-Fri)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return timeInMinutes >= defaultStartMinutes && timeInMinutes < defaultEndMinutes;
      }
      return false; // Weekends unavailable by default
    }

    const providerAvailabilities = availabilityByProviderDay.get(`${providerId}|${dayOfWeek}`) || [];

    // If no specific availability for this provider/day, use default business hours on weekdays
    if (providerAvailabilities.length === 0) {
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return timeInMinutes >= defaultStartMinutes && timeInMinutes < defaultEndMinutes;
      }
      return false;
    }

    return providerAvailabilities.some((providerAvail) => {
      const [startHour, startMinute] = (providerAvail.startTime || '08:00').split(':').map(Number);
      const [endHour, endMinute] = (providerAvail.endTime || '17:00').split(':').map(Number);
      const startInMinutes = startHour * 60 + startMinute;
      const endInMinutes = endHour * 60 + endMinute;
      return timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes;
    });
  };

  // Helper: Get appointments for a specific slot (excludes cancelled appointments)
  const getAppointmentsForSlot = (providerId: string, date: Date, hour: number, minute: number) => {
    const dayAppointments = appointmentsByProviderDay.get(`${providerId}|${toDateKey(date)}`);
    if (!dayAppointments || dayAppointments.length === 0) {
      return [];
    }
    return dayAppointments.filter((appt) => {
      if (!appt?.scheduledStart || !appt?.scheduledEnd) return false;

      const apptStart = new Date(appt.scheduledStart);
      const apptEnd = new Date(appt.scheduledEnd);
      if (Number.isNaN(apptStart.getTime()) || Number.isNaN(apptEnd.getTime())) {
        return false;
      }

      const slotTimeInMinutes = hour * 60 + minute;
      const nextSlotTimeInMinutes = slotTimeInMinutes + 5;
      const apptStartInMinutes = apptStart.getHours() * 60 + apptStart.getMinutes();
      const apptEndInMinutes = apptEnd.getHours() * 60 + apptEnd.getMinutes();

      // Check if this slot overlaps with the appointment
      // Slot covers [slotTime, slotTime+5), appointment covers [apptStart, apptEnd)
      // They overlap if: slotTime < apptEnd AND nextSlotTime > apptStart
      return slotTimeInMinutes < apptEndInMinutes && nextSlotTimeInMinutes > apptStartInMinutes;
    });
  };

  // Helper: Get time blocks for a specific slot
  const getTimeBlocksForSlot = (providerId: string, date: Date, hour: number, minute: number) => {
    const dayBlocks = timeBlocksByProviderDay.get(`${providerId}|${toDateKey(date)}`);
    if (!dayBlocks || dayBlocks.length === 0) {
      return [];
    }
    return dayBlocks.filter((block) => {
      if (!block?.startTime || !block?.endTime) return false;

      const blockStart = new Date(block.startTime);
      const blockEnd = new Date(block.endTime);
      if (Number.isNaN(blockStart.getTime()) || Number.isNaN(blockEnd.getTime())) {
        return false;
      }

      const slotTimeInMinutes = hour * 60 + minute;
      const blockStartInMinutes = blockStart.getHours() * 60 + blockStart.getMinutes();
      const blockEndInMinutes = blockEnd.getHours() * 60 + blockEnd.getMinutes();

      // Check if this slot is within the time block range
      return slotTimeInMinutes >= blockStartInMinutes && slotTimeInMinutes < blockEndInMinutes;
    });
  };

  // Helper: Check if this is the first slot of a time block
  const isFirstTimeBlockSlot = (timeBlock: TimeBlock, hour: number, minute: number) => {
    const blockStart = new Date(timeBlock.startTime);
    return blockStart.getHours() === hour && blockStart.getMinutes() === minute;
  };

  // Helper: Get time block duration in slots
  const getTimeBlockSlots = (timeBlock: TimeBlock) => {
    const start = new Date(timeBlock.startTime);
    const end = new Date(timeBlock.endTime);
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
    return Math.ceil(durationMinutes / 5);
  };

  // Helper: Get time block color based on type
  const getTimeBlockColor = (blockType: string) => {
    switch (blockType) {
      case 'lunch':
        return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }; // amber
      case 'meeting':
        return { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }; // blue
      case 'admin':
        return { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' }; // purple
      case 'continuing_education':
        return { bg: '#d1fae5', border: '#10b981', text: '#065f46' }; // green
      case 'out_of_office':
        return { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }; // red
      case 'blocked':
      default:
        return { bg: '#f3f4f6', border: '#6b7280', text: '#374151' }; // gray
    }
  };

  // Helper: Format recurrence pattern for display
  const formatRecurrencePattern = (pattern?: string) => {
    switch (pattern) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'biweekly':
        return 'Biweekly';
      case 'monthly':
        return 'Monthly';
      default:
        return '';
    }
  };

  // Helper: Format block type for display
  const formatBlockType = (blockType: string) => {
    switch (blockType) {
      case 'lunch':
        return 'Lunch Break';
      case 'meeting':
        return 'Meeting';
      case 'admin':
        return 'Admin Time';
      case 'continuing_education':
        return 'Continuing Education';
      case 'out_of_office':
        return 'Out of Office';
      case 'blocked':
      default:
        return 'Blocked';
    }
  };

  // Helper: Handle time block mouse enter
  const handleTimeBlockMouseEnter = (timeBlock: TimeBlock, event: React.MouseEvent) => {
    setHoveredTimeBlock(timeBlock);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
  };

  // Helper: Handle time block mouse leave
  const handleTimeBlockMouseLeave = () => {
    setHoveredTimeBlock(null);
    setTooltipPosition(null);
  };

  // Helper: Check if this is the first slot of an appointment
  // Appointments may start at any minute, but slots are on 5-minute boundaries
  // So we need to check if this slot is the one that contains the appointment start
  const isFirstSlot = (appointment: Appointment, hour: number, minute: number) => {
    const apptStart = new Date(appointment.scheduledStart);
    const apptHour = apptStart.getHours();
    const apptMinute = apptStart.getMinutes();
    // Round appointment start minute down to nearest 5-minute slot
    const slotMinute = Math.floor(apptMinute / 5) * 5;
    return apptHour === hour && slotMinute === minute;
  };

  // Helper: Get appointment duration in slots
  const getAppointmentSlots = (appointment: Appointment) => {
    const start = new Date(appointment.scheduledStart);
    const end = new Date(appointment.scheduledEnd);
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
    return Math.ceil(durationMinutes / 5);
  };

  // Helper: Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return '#3b82f6'; // blue
      case 'checked_in':
        return '#10b981'; // green
      case 'completed':
        return '#6b7280'; // gray
      case 'cancelled':
        return '#ef4444'; // red
      case 'in_room':
        return '#8b5cf6'; // purple
      case 'with_provider':
        return '#f59e0b'; // amber
      case 'checkout':
        return '#f97316'; // orange
      default:
        return '#6b7280';
    }
  };

  const handleInlineButtonClick = (event: React.MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.stopPropagation();
    action();
  };

  const renderInlineActions = (appointment: Appointment, alignLeft: boolean) => {
    if (selectedAppointment?.id !== appointment.id) return null;

    const isNoShow = appointment.status === 'no_show';
    const canCheckIn = appointment.status === 'scheduled';
    const canReschedule = appointment.status !== 'completed' && appointment.status !== 'cancelled';
    const canCancel = appointment.status !== 'completed' && appointment.status !== 'cancelled';
    const canMarkNoShow = canMarkNoShowAppointment
      ? canMarkNoShowAppointment(appointment)
      : appointment.status === 'scheduled';
    const noShowBusy = noShowActionId === appointment.id;
    const checkInBusy = checkInActionId === appointment.id;

    return (
      <div
        data-testid={`calendar-inline-actions-${appointment.id}`}
        style={{
          position: 'absolute',
          top: 0,
          ...(alignLeft
            ? { right: 'calc(100% + 6px)' }
            : { left: 'calc(100% + 6px)' }),
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          minWidth: '120px',
          padding: '6px',
          borderRadius: '8px',
          border: '1px solid #d1d5db',
          background: '#ffffff',
          boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
        }}
      >
        <button
          type="button"
          disabled={!canCheckIn || checkInBusy || !onAppointmentCheckIn}
          onClick={(event) => handleInlineButtonClick(event, () => onAppointmentCheckIn?.(appointment))}
          style={{
            border: '1px solid #ddd6fe',
            background: canCheckIn ? '#ede9fe' : '#f3f4f6',
            color: canCheckIn ? '#5b21b6' : '#9ca3af',
            borderRadius: '6px',
            fontSize: '0.72rem',
            fontWeight: 600,
            padding: '4px 6px',
            cursor: canCheckIn ? 'pointer' : 'not-allowed',
          }}
        >
          {checkInBusy ? 'Checking...' : 'Check In'}
        </button>
        <button
          type="button"
          disabled={!canReschedule || !onAppointmentReschedule}
          onClick={(event) => handleInlineButtonClick(event, () => onAppointmentReschedule?.(appointment))}
          style={{
            border: canReschedule ? '1px solid #bae6fd' : '1px solid #e5e7eb',
            background: canReschedule ? '#ecfeff' : '#f3f4f6',
            color: canReschedule ? '#0e7490' : '#9ca3af',
            borderRadius: '6px',
            fontSize: '0.72rem',
            fontWeight: 600,
            padding: '4px 6px',
            cursor: canReschedule ? 'pointer' : 'not-allowed',
          }}
        >
          Reschedule
        </button>
        <button
          type="button"
          disabled={noShowBusy || (!isNoShow && !canMarkNoShow) || (isNoShow ? !onAppointmentUndoNoShow : !onAppointmentNoShow)}
          onClick={(event) =>
            handleInlineButtonClick(event, () => {
              if (isNoShow) {
                onAppointmentUndoNoShow?.(appointment);
              } else {
                onAppointmentNoShow?.(appointment);
              }
            })
          }
          style={{
            border: isNoShow ? '1px solid #93c5fd' : '1px solid #fdba74',
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
            borderRadius: '6px',
            fontSize: '0.72rem',
            fontWeight: 600,
            padding: '4px 6px',
            cursor: noShowBusy || (!isNoShow && !canMarkNoShow) ? 'not-allowed' : 'pointer',
          }}
        >
          {noShowBusy ? (isNoShow ? 'Undoing...' : 'Marking...') : (isNoShow ? 'Undo No-Show' : 'Mark No-Show')}
        </button>
        <button
          type="button"
          disabled={!canCancel || !onAppointmentCancel}
          onClick={(event) => handleInlineButtonClick(event, () => onAppointmentCancel?.(appointment))}
          style={{
            border: canCancel ? '1px solid #fecaca' : '1px solid #e5e7eb',
            background: canCancel ? '#fef2f2' : '#f3f4f6',
            color: canCancel ? '#991b1b' : '#9ca3af',
            borderRadius: '6px',
            fontSize: '0.72rem',
            fontWeight: 600,
            padding: '4px 6px',
            cursor: canCancel ? 'pointer' : 'not-allowed',
          }}
        >
          Cancel
        </button>
      </div>
    );
  };

  const formatTime = (hour: number, minute: number) => {
    const h = hour % 12 || 12;
    const m = minute.toString().padStart(2, '0');
    const period = hour < 12 ? 'AM' : 'PM';
    return `${h}:${m} ${period}`;
  };

  // Helper: Check if today is visible in the current view
  const isTodayVisible = useMemo(() => {
    const today = new Date();
    return days.some(day =>
      day.getDate() === today.getDate() &&
      day.getMonth() === today.getMonth() &&
      day.getFullYear() === today.getFullYear()
    );
  }, [days]);

  const todayStartMs = useMemo(() => {
    const today = new Date(currentTime);
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }, [currentTime]);

  const isHistoricalScheduledAppointment = (appointment: Appointment) => {
    if (appointment.status !== 'scheduled') return false;
    const appointmentDate = new Date(appointment.scheduledStart);
    if (Number.isNaN(appointmentDate.getTime())) return false;
    appointmentDate.setHours(0, 0, 0, 0);
    return appointmentDate.getTime() < todayStartMs;
  };

  const getAppointmentDisplayColor = (appointment: Appointment) => (
    isHistoricalScheduledAppointment(appointment)
      ? '#94a3b8'
      : getStatusColor(appointment.status)
  );

  // Helper: Calculate current time line position as percentage
  const getCurrentTimePosition = () => {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const totalMinutesFromStart = (hour - CALENDAR_START_HOUR) * 60 + minute;
    const totalCalendarMinutes = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60;

    if (hour < CALENDAR_START_HOUR || hour >= CALENDAR_END_HOUR) return null;

    return (totalMinutesFromStart / totalCalendarMinutes) * 100;
  };

  // Helper: Get index of today in the days array (for week view)
  const getTodayColumnIndex = () => {
    const today = new Date();
    return days.findIndex(day =>
      day.getDate() === today.getDate() &&
      day.getMonth() === today.getMonth() &&
      day.getFullYear() === today.getFullYear()
    );
  };

  // Handle day click in month view - switch to day view for that date
  const handleDayClick = (date: Date) => {
    // This will be handled by parent component (SchedulePage)
    // For now, just select the first available provider and open new appointment
    if (providers.length > 0) {
      onSlotClick(providers[0].id, date, 9, 0); // Default to 9:00 AM
    }
  };

  // If month view, render MonthView component
  if (viewMode === 'month') {
    return (
      <MonthView
        currentDate={currentDate}
        appointments={appointments}
        providers={providers}
        selectedAppointment={selectedAppointment}
        onAppointmentClick={onAppointmentClick}
        onDayClick={handleDayClick}
      />
    );
  }

  return (
    <>
      <div className="calendar-container">
        {/* Header with provider names */}
        <div className="calendar-header">
        <div className="calendar-time-column-header">Time</div>
        {viewMode === 'day' ? (
          // Day view: show providers as columns
          Array.isArray(providers) && providers.map((provider) => (
            <div key={provider.id} className="calendar-provider-header-cell">
              <div className="calendar-provider-name">{provider.fullName}</div>
              <div className="calendar-provider-specialty">{provider.specialty || ''}</div>
            </div>
          ))
        ) : (
          // Week view: show days as columns
          days.map((day) => (
            <div key={day.toISOString()} className="calendar-day-header">
              <div className="calendar-day-name">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className="calendar-day-date">
                {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Grid with time column on left and provider/day columns */}
      <div className="calendar-grid" style={{ position: 'relative' }}>
        {/* Current time indicator line */}
        {isTodayVisible && getCurrentTimePosition() !== null && (
          <div
            className="current-time-indicator"
            style={{
              position: 'absolute',
              left: viewMode === 'day' ? '60px' : `calc(60px + ${getTodayColumnIndex()} * ${100 / days.length}%)`,
              right: viewMode === 'day' ? '0' : `calc(${100 - (getTodayColumnIndex() + 1) * (100 / days.length)}%)`,
              top: `${getCurrentTimePosition()}%`,
              height: '2px',
              backgroundColor: '#ef4444',
              zIndex: 100,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '-6px',
                top: '-4px',
                width: '10px',
                height: '10px',
                backgroundColor: '#ef4444',
                borderRadius: '50%',
              }}
            />
          </div>
        )}
        {/* Time column */}
        <div className="calendar-time-column">
          {timeSlots.map(({ hour, minute }) => (
            <div
              key={`${hour}-${minute}`}
              className={`calendar-time-slot ${minute === 0 ? 'hour-mark' : ''}`}
            >
              <span className="time-label">{formatTime(hour, minute)}</span>
            </div>
          ))}
        </div>

        {/* Provider/Day columns */}
        {viewMode === 'day' ? (
          // Day view: one column per provider
          Array.isArray(providers) && providers.map((provider, providerIndex) => (
            <div key={provider.id} className="calendar-provider-column">
              {timeSlots.map(({ hour, minute }) => {
                const day = days[0]; // Single day in day view
                const slotAppointments = getAppointmentsForSlot(provider.id, day, hour, minute);
                const startingAppointments = slotAppointments.filter((appt) => isFirstSlot(appt, hour, minute));
                const slotTimeBlocks = getTimeBlocksForSlot(provider.id, day, hour, minute);
                const isAvailable = isProviderAvailable(provider.id, day, hour, minute);
                const timeBlock = slotTimeBlocks[0];
                const isFirstBlock = timeBlock && isFirstTimeBlockSlot(timeBlock, hour, minute);
                const blockSlots = timeBlock ? getTimeBlockSlots(timeBlock) : 0;

                return (
                  <div
                    key={`${hour}-${minute}`}
                    className={`calendar-slot ${isAvailable ? 'available' : 'unavailable'} ${
                      slotAppointments.length > 0 || timeBlock ? 'has-appointment' : ''
                    } ${minute === 0 ? 'hour-mark' : ''}`}
                    onClick={() => {
                      if (slotAppointments.length > 0) {
                        onAppointmentClick(slotAppointments[0]!);
                      } else if (timeBlock) {
                        if (onTimeBlockClick) {
                          onTimeBlockClick(timeBlock.id);
                        }
                      } else if (isAvailable) {
                        onSlotClick(provider.id, day, hour, minute);
                      }
                    }}
                    style={{
                      cursor: slotAppointments.length > 0 || timeBlock || isAvailable ? 'pointer' : 'default',
                    }}
                  >
                    {isFirstBlock && timeBlock && slotAppointments.length === 0 && (
                      <div
                        className="calendar-time-block"
                        onMouseEnter={(e) => handleTimeBlockMouseEnter(timeBlock, e)}
                        onMouseLeave={handleTimeBlockMouseLeave}
                        style={{
                          backgroundColor: getTimeBlockColor(timeBlock.blockType).bg,
                          height: `${blockSlots * 100}%`,
                          borderLeft: `4px solid ${getTimeBlockColor(timeBlock.blockType).border}`,
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          padding: '0.25rem',
                          fontSize: '0.75rem',
                          color: getTimeBlockColor(timeBlock.blockType).text,
                          overflow: 'hidden',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.7rem' }}>{timeBlock.title}</div>
                        <div style={{ fontSize: '0.65rem', opacity: 0.85, marginTop: '2px' }}>
                          {new Date(timeBlock.startTime).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                        {timeBlock.isRecurring && (
                          <div style={{
                            fontSize: '0.6rem',
                            opacity: 0.75,
                            marginTop: '2px',
                            fontStyle: 'italic'
                          }}>
                            {formatRecurrencePattern(timeBlock.recurrencePattern)}
                          </div>
                        )}
                      </div>
                    )}
                    {startingAppointments.map((appointment) => {
                      const slots = getAppointmentSlots(appointment);
                      const layout = dayViewAppointmentLayouts.get(appointment.id) || { columnIndex: 0, columnCount: 1 };
                      const widthPercent = 100 / layout.columnCount;
                      const leftPercent = layout.columnIndex * widthPercent;

                      return (
                        <div
                          key={appointment.id}
                          className={`calendar-appointment ${
                            selectedAppointment?.id === appointment.id ? 'selected' : ''
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onAppointmentClick(appointment);
                          }}
                          style={{
                            backgroundColor: getAppointmentDisplayColor(appointment),
                            height: `${slots * 100}%`,
                            borderLeft: `4px solid ${getAppointmentDisplayColor(appointment)}`,
                            filter:
                              selectedAppointment?.id === appointment.id
                                ? 'brightness(0.9)'
                                : 'none',
                            left: `calc(${leftPercent}% + 1px)`,
                            width: `calc(${widthPercent}% - 2px)`,
                            right: 'auto',
                            zIndex: selectedAppointment?.id === appointment.id ? 140 : 10 + layout.columnIndex,
                            opacity: isHistoricalScheduledAppointment(appointment) ? 0.85 : 1,
                          }}
                        >
                          {isTelehealthAppointment(appointment) && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              marginBottom: '0.2rem',
                              padding: '0.1rem 0.35rem',
                              borderRadius: '999px',
                              background: 'rgba(255,255,255,0.72)',
                              color: '#1d4ed8',
                              fontSize: '0.58rem',
                              fontWeight: 700,
                              width: 'fit-content',
                            }}>
                              <VideoCameraIcon color="#1d4ed8" />
                              Video
                            </div>
                          )}
                          <div className="appointment-time">
                            {new Date(appointment.scheduledStart).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="appointment-patient">{appointment.patientName}</div>
                          <div className="appointment-type" style={isTelehealthAppointment(appointment) ? { color: '#1e3a8a', fontWeight: 600 } : undefined}>
                            {appointment.appointmentTypeName}
                          </div>
                          {isHistoricalScheduledAppointment(appointment) && (
                            <div className="appointment-conflict" style={{ background: 'rgba(255,255,255,0.78)', color: '#475569' }}>
                              Past day
                            </div>
                          )}
                          {layout.columnCount > 1 && (
                            <div className="appointment-conflict">Overlap</div>
                          )}
                          {renderInlineActions(appointment, providerIndex === providers.length - 1)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          // Week view: one column per day (all providers combined)
          days.map((day, dayIndex) => (
            <div key={day.toISOString()} className="calendar-day-column">
              {timeSlots.map(({ hour, minute }) => {
                // In week view, check all providers for this time slot
                const allSlotAppointments = Array.isArray(providers) ? providers.flatMap((provider) =>
                  getAppointmentsForSlot(provider.id, day, hour, minute)
                ) : [];
                const startingAppointments = allSlotAppointments.filter((appointment) =>
                  isFirstSlot(appointment, hour, minute)
                );

                // Check if any provider is available
                const anyProviderAvailable = Array.isArray(providers) && providers.some((provider) =>
                  isProviderAvailable(provider.id, day, hour, minute)
                );

                return (
                  <div
                    key={`${hour}-${minute}`}
                    className={`calendar-slot ${anyProviderAvailable ? 'available' : 'unavailable'} ${
                      allSlotAppointments.length > 0 ? 'has-appointment' : ''
                    } ${minute === 0 ? 'hour-mark' : ''}`}
                    onClick={() => {
                      if (allSlotAppointments.length > 0) {
                        onAppointmentClick(allSlotAppointments[0]!);
                      } else if (anyProviderAvailable && Array.isArray(providers)) {
                        // Default to first available provider
                        const availableProvider = providers.find((p) =>
                          isProviderAvailable(p.id, day, hour, minute)
                        );
                        if (availableProvider) {
                          onSlotClick(availableProvider.id, day, hour, minute);
                        }
                      }
                    }}
                    style={{
                      cursor: appointment || anyProviderAvailable ? 'pointer' : 'default',
                    }}
                  >
                    {startingAppointments.map((appointment) => {
                      const slots = getAppointmentSlots(appointment);
                      const layout = weekViewAppointmentLayouts.get(appointment.id) || { columnIndex: 0, columnCount: 1 };
                      const widthPercent = 100 / layout.columnCount;
                      const leftPercent = layout.columnIndex * widthPercent;

                      return (
                        <div
                          key={appointment.id}
                          className={`calendar-appointment ${
                            selectedAppointment?.id === appointment.id ? 'selected' : ''
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onAppointmentClick(appointment);
                          }}
                          style={{
                            backgroundColor: getAppointmentDisplayColor(appointment),
                            height: `${slots * 100}%`,
                            borderLeft: `4px solid ${getAppointmentDisplayColor(appointment)}`,
                            filter:
                              selectedAppointment?.id === appointment.id
                                ? 'brightness(0.9)'
                                : 'none',
                            left: `calc(${leftPercent}% + 1px)`,
                            width: `calc(${widthPercent}% - 2px)`,
                            right: 'auto',
                            zIndex: selectedAppointment?.id === appointment.id ? 140 : 10 + layout.columnIndex,
                            opacity: isHistoricalScheduledAppointment(appointment) ? 0.85 : 1,
                          }}
                        >
                          {isTelehealthAppointment(appointment) && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              marginBottom: '0.2rem',
                              padding: '0.1rem 0.35rem',
                              borderRadius: '999px',
                              background: 'rgba(255,255,255,0.72)',
                              color: '#1d4ed8',
                              fontSize: '0.58rem',
                              fontWeight: 700,
                              width: 'fit-content',
                            }}>
                              <VideoCameraIcon color="#1d4ed8" />
                              Video
                            </div>
                          )}
                          <div className="appointment-time">
                            {new Date(appointment.scheduledStart).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="appointment-patient">{appointment.patientName}</div>
                          <div className="appointment-type" style={isTelehealthAppointment(appointment) ? { color: '#1e3a8a', fontWeight: 600 } : undefined}>
                            {appointment.appointmentTypeName}
                          </div>
                          {isHistoricalScheduledAppointment(appointment) && (
                            <div className="appointment-conflict" style={{ background: 'rgba(255,255,255,0.78)', color: '#475569' }}>
                              Past day
                            </div>
                          )}
                          {layout.columnCount > 1 && (
                            <div className="appointment-conflict">Overlap</div>
                          )}
                          {renderInlineActions(appointment, dayIndex === days.length - 1)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>

    {/* Time Block Tooltip */}
    {hoveredTimeBlock && tooltipPosition && (
      <div
        className="time-block-tooltip"
        style={{
          position: 'fixed',
          left: `${tooltipPosition.x}px`,
          top: `${tooltipPosition.y}px`,
          transform: 'translate(-50%, -100%)',
          zIndex: 1000,
        }}
      >
        <div className="tooltip-content">
          <div className="tooltip-header">
            <strong>{hoveredTimeBlock.title}</strong>
          </div>
          <div className="tooltip-body">
            <div className="tooltip-row">
              <span className="tooltip-label">Type:</span>
              <span className="tooltip-value">{formatBlockType(hoveredTimeBlock.blockType)}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Time:</span>
              <span className="tooltip-value">
                {new Date(hoveredTimeBlock.startTime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {' - '}
                {new Date(hoveredTimeBlock.endTime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {hoveredTimeBlock.description && (
              <div className="tooltip-row">
                <span className="tooltip-label">Description:</span>
                <span className="tooltip-value">{hoveredTimeBlock.description}</span>
              </div>
            )}
            {hoveredTimeBlock.isRecurring && (
              <>
                <div className="tooltip-row">
                  <span className="tooltip-label">Recurrence:</span>
                  <span className="tooltip-value">{formatRecurrencePattern(hoveredTimeBlock.recurrencePattern)}</span>
                </div>
                {hoveredTimeBlock.recurrenceEndDate && (
                  <div className="tooltip-row">
                    <span className="tooltip-label">Until:</span>
                    <span className="tooltip-value">
                      {new Date(hoveredTimeBlock.recurrenceEndDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="tooltip-footer">Click to edit or delete</div>
        </div>
      </div>
    )}
    </>
  );
}
