import { useMemo, useState } from 'react';
import type { Appointment, Provider } from '../../types';
import {
  formatTimeInPracticeTimeZone,
  getDateKeyInPracticeTimeZone,
} from '../../utils/practiceDateTime';

interface MonthViewProps {
  currentDate: Date;
  appointments: Appointment[];
  providers: Provider[];
  selectedAppointment: Appointment | null;
  onAppointmentClick: (appointment: Appointment) => void;
  onDayClick: (date: Date) => void;
  practiceTimeZone?: string | null;
}

function toCivilDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function MonthView({
  currentDate,
  appointments,
  selectedAppointment,
  onAppointmentClick,
  onDayClick,
  practiceTimeZone,
}: MonthViewProps) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Generate calendar grid for the month
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of the month
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Previous month's days to fill the first week
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const prevMonthDays = Array.from(
      { length: startingDayOfWeek },
      (_, i) => ({
        date: new Date(year, month - 1, prevMonthLastDay - startingDayOfWeek + i + 1),
        isCurrentMonth: false,
      })
    );

    // Current month's days
    const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => ({
      date: new Date(year, month, i + 1),
      isCurrentMonth: true,
    }));

    // Next month's days to fill the last week
    const totalCells = prevMonthDays.length + currentMonthDays.length;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const nextMonthDays = Array.from({ length: remainingCells }, (_, i) => ({
      date: new Date(year, month + 1, i + 1),
      isCurrentMonth: false,
    }));

    return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
  }, [currentDate]);

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();

    appointments.forEach((appt) => {
      const apptDate = new Date(appt.scheduledStart);
      if (Number.isNaN(apptDate.getTime())) {
        return;
      }
      const dateKey = getDateKeyInPracticeTimeZone(apptDate, practiceTimeZone);

      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(appt);
    });

    return map;
  }, [appointments, practiceTimeZone]);

  // Get appointments for a specific date
  const getAppointmentsForDate = (date: Date) => {
    const dateKey = toCivilDateKey(date);
    return appointmentsByDate.get(dateKey) || [];
  };

  // Check if date is today
  const isToday = (date: Date) => {
    return toCivilDateKey(date) === getDateKeyInPracticeTimeZone(new Date(), practiceTimeZone);
  };

  // Get status color
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

  const isTelehealthAppointment = (appointment: Appointment | null | undefined) => {
    if (!appointment) return false;
    const combined = `${appointment.appointmentTypeName || ''} ${appointment.locationName || ''}`.toLowerCase();
    return /telehealth|virtual|video/.test(combined);
  };

  const isHistoricalScheduledAppointment = (appointment: Appointment) => {
    if (appointment.status !== 'scheduled') return false;
    const appointmentDate = new Date(appointment.scheduledStart);
    if (Number.isNaN(appointmentDate.getTime())) return false;
    return getDateKeyInPracticeTimeZone(appointmentDate, practiceTimeZone)
      < getDateKeyInPracticeTimeZone(new Date(), practiceTimeZone);
  };

  return (
    <div className="month-view-container">
      {/* Month header */}
      <div className="month-view-header">
        <h2 className="month-view-title">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
      </div>

      {/* Weekday headers */}
      <div className="month-view-weekdays">
        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
          <div key={day} className="month-view-weekday">
            {day.slice(0, 3)}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="month-view-grid">
        {calendarDays.map(({ date, isCurrentMonth }, index) => {
          const dayAppointments = getAppointmentsForDate(date);
          const dateKey = toCivilDateKey(date);
          const today = isToday(date);

          return (
            <div
              key={index}
              className={`month-view-day ${!isCurrentMonth ? 'other-month' : ''} ${
                today ? 'today' : ''
              } ${hoveredDate === dateKey ? 'hovered' : ''}`}
              role="group"
              aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${dayAppointments.length} appointment${dayAppointments.length === 1 ? '' : 's'}`}
              onMouseEnter={() => setHoveredDate(dateKey)}
              onMouseLeave={() => setHoveredDate(null)}
              onClick={() => onDayClick(date)}
            >
              <button
                type="button"
                className="month-view-day-open"
                aria-current={today ? 'date' : undefined}
                aria-label={`Open ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDayClick(date);
                }}
              >
                {date.getDate()}
              </button>
              {/* Day number */}
              <div className="month-view-day-number">
                {dayAppointments.length > 0 && (
                  <span className="month-view-day-count">
                    {dayAppointments.length}
                  </span>
                )}
              </div>

              {/* Appointments for this day */}
              <div className="month-view-appointments">
                {dayAppointments.slice(0, 3).map((appt) => (
                  <div
                    key={appt.id}
                    className={`month-view-appointment ${
                      selectedAppointment?.id === appt.id ? 'selected' : ''
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedAppointment?.id === appt.id}
                    aria-label={`${appt.patientName}, ${appt.appointmentTypeName}, ${formatTimeInPracticeTimeZone(appt.scheduledStart, practiceTimeZone)}, ${appt.status.replace(/_/g, ' ')}`}
                    style={{
                      backgroundColor: isHistoricalScheduledAppointment(appt) ? '#cbd5e1' : getStatusColor(appt.status),
                      borderLeft: `3px solid ${isHistoricalScheduledAppointment(appt) ? '#94a3b8' : getStatusColor(appt.status)}`,
                      opacity: isHistoricalScheduledAppointment(appt) ? 0.85 : 1,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(appt);
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.stopPropagation();
                      onAppointmentClick(appt);
                    }}
                    title={`${formatTimeInPracticeTimeZone(appt.scheduledStart, practiceTimeZone)} - ${isTelehealthAppointment(appt) ? 'Video • ' : ''}${appt.patientName}`}
                  >
                    <span className="appointment-time">
                      {formatTimeInPracticeTimeZone(appt.scheduledStart, practiceTimeZone)}
                    </span>
                    <span className="appointment-patient">
                      {isTelehealthAppointment(appt) ? 'Video ' : ''}
                      {appt.patientName}
                    </span>
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <button
                    type="button"
                    className="month-view-more"
                    aria-label={`Open ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} to view ${dayAppointments.length - 3} more appointments`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDayClick(date);
                    }}
                  >
                    +{dayAppointments.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="month-view-legend">
        <div className="legend-title">Status Legend:</div>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#3b82f6' }}></span>
            Scheduled
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#10b981' }}></span>
            Checked In
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#6b7280' }}></span>
            Completed
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#ef4444' }}></span>
            Cancelled
          </div>
        </div>
      </div>
    </div>
  );
}
