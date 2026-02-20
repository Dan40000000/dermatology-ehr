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
  appointments: Appointment[];
  providers: Provider[];
  availability: Availability[];
  timeBlocks: TimeBlock[];
  selectedAppointment: Appointment | null;
  onAppointmentClick: (appointment: Appointment) => void;
  onSlotClick: (providerId: string, date: Date, hour: number, minute: number) => void;
  onTimeBlockClick?: (timeBlockId: string) => void;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function Calendar({
  currentDate,
  viewMode,
  appointments,
  providers,
  availability,
  timeBlocks,
  selectedAppointment,
  onAppointmentClick,
  onSlotClick,
  onTimeBlockClick,
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

  // Time slots from 7am to 7pm in 5-minute increments (show full day, grey out non-business hours)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 7; hour < 19; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        slots.push({ hour, minute });
      }
    }
    return slots;
  }, []);

  // Generate days to display based on view mode
  const days = useMemo(() => {
    if (viewMode === 'day') {
      return [new Date(currentDate)];
    } else {
      // Week view: show 5 days (Monday-Friday)
      const days = [];
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust to Monday
      startOfWeek.setDate(diff);

      for (let i = 0; i < 5; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date);
      }
      return days;
    }
  }, [currentDate, viewMode]);

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
      default:
        return '#6b7280';
    }
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

  // Helper: Calculate current time line position as percentage
  const getCurrentTimePosition = () => {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const totalMinutesFromStart = (hour - 7) * 60 + minute; // 7am is start
    const totalCalendarMinutes = 12 * 60; // 7am to 7pm = 12 hours

    // Only show if within calendar range (7am - 7pm)
    if (hour < 7 || hour >= 19) return null;

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
          Array.isArray(providers) && providers.map((provider) => (
            <div key={provider.id} className="calendar-provider-column">
              {timeSlots.map(({ hour, minute }) => {
                const day = days[0]; // Single day in day view
                const slotAppointments = getAppointmentsForSlot(provider.id, day, hour, minute);
                const slotTimeBlocks = getTimeBlocksForSlot(provider.id, day, hour, minute);
                const isAvailable = isProviderAvailable(provider.id, day, hour, minute);
                const appointment = slotAppointments[0];
                const timeBlock = slotTimeBlocks[0];
                const isFirst = appointment && isFirstSlot(appointment, hour, minute);
                const isFirstBlock = timeBlock && isFirstTimeBlockSlot(timeBlock, hour, minute);
                const slots = appointment ? getAppointmentSlots(appointment) : 0;
                const blockSlots = timeBlock ? getTimeBlockSlots(timeBlock) : 0;

                return (
                  <div
                    key={`${hour}-${minute}`}
                    className={`calendar-slot ${isAvailable ? 'available' : 'unavailable'} ${
                      appointment || timeBlock ? 'has-appointment' : ''
                    } ${minute === 0 ? 'hour-mark' : ''}`}
                    onClick={() => {
                      if (appointment) {
                        onAppointmentClick(appointment);
                      } else if (timeBlock) {
                        if (onTimeBlockClick) {
                          onTimeBlockClick(timeBlock.id);
                        }
                      } else if (isAvailable) {
                        onSlotClick(provider.id, day, hour, minute);
                      }
                    }}
                    style={{
                      cursor: appointment || timeBlock || isAvailable ? 'pointer' : 'default',
                    }}
                  >
                    {isFirstBlock && timeBlock && !appointment && (
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
                    {isFirst && appointment && (
                      <div
                        className={`calendar-appointment ${
                          selectedAppointment?.id === appointment.id ? 'selected' : ''
                        }`}
                        style={{
                          backgroundColor: getStatusColor(appointment.status),
                          height: `${slots * 100}%`,
                          borderLeft: `4px solid ${getStatusColor(appointment.status)}`,
                          filter:
                            selectedAppointment?.id === appointment.id
                              ? 'brightness(0.9)'
                              : 'none',
                        }}
                      >
                        <div className="appointment-time">
                          {new Date(appointment.scheduledStart).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="appointment-patient">{appointment.patientName}</div>
                        <div className="appointment-type">{appointment.appointmentTypeName}</div>
                        {slotAppointments.length > 1 && (
                          <div className="appointment-conflict">+{slotAppointments.length - 1} conflict</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          // Week view: one column per day (all providers combined)
          days.map((day) => (
            <div key={day.toISOString()} className="calendar-day-column">
              {timeSlots.map(({ hour, minute }) => {
                // In week view, check all providers for this time slot
                const allSlotAppointments = Array.isArray(providers) ? providers.flatMap((provider) =>
                  getAppointmentsForSlot(provider.id, day, hour, minute)
                ) : [];
                const appointment = allSlotAppointments[0];
                const isFirst = appointment && isFirstSlot(appointment, hour, minute);
                const slots = appointment ? getAppointmentSlots(appointment) : 0;

                // Check if any provider is available
                const anyProviderAvailable = Array.isArray(providers) && providers.some((provider) =>
                  isProviderAvailable(provider.id, day, hour, minute)
                );

                return (
                  <div
                    key={`${hour}-${minute}`}
                    className={`calendar-slot ${anyProviderAvailable ? 'available' : 'unavailable'} ${
                      appointment ? 'has-appointment' : ''
                    } ${minute === 0 ? 'hour-mark' : ''}`}
                    onClick={() => {
                      if (appointment) {
                        onAppointmentClick(appointment);
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
                    {isFirst && appointment && (
                      <div
                        className={`calendar-appointment ${
                          selectedAppointment?.id === appointment.id ? 'selected' : ''
                        }`}
                        style={{
                          backgroundColor: getStatusColor(appointment.status),
                          height: `${slots * 100}%`,
                          borderLeft: `4px solid ${getStatusColor(appointment.status)}`,
                          filter:
                            selectedAppointment?.id === appointment.id
                              ? 'brightness(0.9)'
                              : 'none',
                        }}
                      >
                        <div className="appointment-time">
                          {new Date(appointment.scheduledStart).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="appointment-patient">{appointment.patientName}</div>
                        <div className="appointment-type">{appointment.appointmentTypeName}</div>
                        {allSlotAppointments.length > 1 && (
                          <div className="appointment-conflict">+{allSlotAppointments.length - 1} conflict</div>
                        )}
                      </div>
                    )}
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
