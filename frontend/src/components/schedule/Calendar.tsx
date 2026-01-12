import { useMemo, useState } from 'react';
import type { Appointment, Provider, Availability } from '../../types';

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
  viewMode: 'day' | 'week';
  appointments: Appointment[];
  providers: Provider[];
  availability: Availability[];
  timeBlocks: TimeBlock[];
  selectedAppointment: Appointment | null;
  onAppointmentClick: (appointment: Appointment) => void;
  onSlotClick: (providerId: string, date: Date, hour: number, minute: number) => void;
  onTimeBlockClick?: (timeBlockId: string) => void;
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

  // Time slots from 7am to 7pm in 5-minute increments
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

  // Helper: Check if provider is available at this time
  const isProviderAvailable = (providerId: string, date: Date, hour: number, minute: number) => {
    if (!Array.isArray(availability)) {
      return false;
    }
    const dayOfWeek = date.getDay();
    const providerAvail = availability.find(
      (a) => a.providerId === providerId && a.dayOfWeek === dayOfWeek
    );

    if (!providerAvail) return false;

    const timeInMinutes = hour * 60 + minute;
    const [startHour, startMinute] = (providerAvail.startTime || '00:00').split(':').map(Number);
    const [endHour, endMinute] = (providerAvail.endTime || '00:00').split(':').map(Number);
    const startInMinutes = startHour * 60 + startMinute;
    const endInMinutes = endHour * 60 + endMinute;

    return timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes;
  };

  // Helper: Get appointments for a specific slot
  const getAppointmentsForSlot = (providerId: string, date: Date, hour: number, minute: number) => {
    if (!Array.isArray(appointments)) {
      return [];
    }
    return appointments.filter((appt) => {
      if (appt.providerId !== providerId) return false;

      const apptStart = new Date(appt.scheduledStart);
      const apptEnd = new Date(appt.scheduledEnd);

      // Check if same day
      if (
        apptStart.getDate() !== date.getDate() ||
        apptStart.getMonth() !== date.getMonth() ||
        apptStart.getFullYear() !== date.getFullYear()
      ) {
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
    if (!Array.isArray(timeBlocks)) {
      return [];
    }
    return timeBlocks.filter((block) => {
      if (block.providerId !== providerId || block.status !== 'active') return false;

      const blockStart = new Date(block.startTime);
      const blockEnd = new Date(block.endTime);

      // Check if same day
      if (
        blockStart.getDate() !== date.getDate() ||
        blockStart.getMonth() !== date.getMonth() ||
        blockStart.getFullYear() !== date.getFullYear()
      ) {
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
      <div className="calendar-grid">
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
