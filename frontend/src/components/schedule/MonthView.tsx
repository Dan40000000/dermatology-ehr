import { useMemo, useState } from 'react';
import type { Appointment, Provider } from '../../types';

interface MonthViewProps {
  currentDate: Date;
  appointments: Appointment[];
  providers: Provider[];
  selectedAppointment: Appointment | null;
  onAppointmentClick: (appointment: Appointment) => void;
  onDayClick: (date: Date) => void;
}

export function MonthView({
  currentDate,
  appointments,
  providers,
  selectedAppointment,
  onAppointmentClick,
  onDayClick,
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
      const dateKey = `${apptDate.getFullYear()}-${apptDate.getMonth()}-${apptDate.getDate()}`;

      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(appt);
    });

    return map;
  }, [appointments]);

  // Get appointments for a specific date
  const getAppointmentsForDate = (date: Date) => {
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return appointmentsByDate.get(dateKey) || [];
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
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
      default:
        return '#6b7280';
    }
  };

  // Format date key for hover state
  const getDateKey = (date: Date) => {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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
          const dateKey = getDateKey(date);
          const today = isToday(date);

          return (
            <div
              key={index}
              className={`month-view-day ${!isCurrentMonth ? 'other-month' : ''} ${
                today ? 'today' : ''
              } ${hoveredDate === dateKey ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredDate(dateKey)}
              onMouseLeave={() => setHoveredDate(null)}
              onClick={() => onDayClick(date)}
            >
              {/* Day number */}
              <div className="month-view-day-number">
                {date.getDate()}
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
                    style={{
                      backgroundColor: getStatusColor(appt.status),
                      borderLeft: `3px solid ${getStatusColor(appt.status)}`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(appt);
                    }}
                    title={`${new Date(appt.scheduledStart).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })} - ${appt.patientName}`}
                  >
                    <span className="appointment-time">
                      {new Date(appt.scheduledStart).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="appointment-patient">
                      {appt.patientName}
                    </span>
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <div className="month-view-more">
                    +{dayAppointments.length - 3} more
                  </div>
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
