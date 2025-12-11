import { useMemo } from 'react';
import type { Appointment, Provider, Availability } from '../../types';

interface CalendarProps {
  currentDate: Date;
  viewMode: 'day' | 'week';
  appointments: Appointment[];
  providers: Provider[];
  availability: Availability[];
  selectedAppointment: Appointment | null;
  onAppointmentClick: (appointment: Appointment) => void;
  onSlotClick: (providerId: string, date: Date, hour: number, minute: number) => void;
}

export function Calendar({
  currentDate,
  viewMode,
  appointments,
  providers,
  availability,
  selectedAppointment,
  onAppointmentClick,
  onSlotClick,
}: CalendarProps) {
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
      const apptStartInMinutes = apptStart.getHours() * 60 + apptStart.getMinutes();
      const apptEndInMinutes = apptEnd.getHours() * 60 + apptEnd.getMinutes();

      // Check if this slot is within the appointment time range
      return slotTimeInMinutes >= apptStartInMinutes && slotTimeInMinutes < apptEndInMinutes;
    });
  };

  // Helper: Check if this is the first slot of an appointment
  const isFirstSlot = (appointment: Appointment, hour: number, minute: number) => {
    const apptStart = new Date(appointment.scheduledStart);
    return apptStart.getHours() === hour && apptStart.getMinutes() === minute;
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
    <div className="calendar-container">
      {/* Header with provider names */}
      <div className="calendar-header">
        <div className="calendar-time-column-header">Time</div>
        {viewMode === 'day' ? (
          // Day view: show providers as columns
          providers.map((provider) => (
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
          providers.map((provider) => (
            <div key={provider.id} className="calendar-provider-column">
              {timeSlots.map(({ hour, minute }) => {
                const day = days[0]; // Single day in day view
                const slotAppointments = getAppointmentsForSlot(provider.id, day, hour, minute);
                const isAvailable = isProviderAvailable(provider.id, day, hour, minute);
                const appointment = slotAppointments[0];
                const isFirst = appointment && isFirstSlot(appointment, hour, minute);
                const slots = appointment ? getAppointmentSlots(appointment) : 0;

                return (
                  <div
                    key={`${hour}-${minute}`}
                    className={`calendar-slot ${isAvailable ? 'available' : 'unavailable'} ${
                      appointment ? 'has-appointment' : ''
                    } ${minute === 0 ? 'hour-mark' : ''}`}
                    onClick={() => {
                      if (appointment) {
                        onAppointmentClick(appointment);
                      } else if (isAvailable) {
                        onSlotClick(provider.id, day, hour, minute);
                      }
                    }}
                    style={{
                      cursor: appointment || isAvailable ? 'pointer' : 'default',
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
                const allSlotAppointments = providers.flatMap((provider) =>
                  getAppointmentsForSlot(provider.id, day, hour, minute)
                );
                const appointment = allSlotAppointments[0];
                const isFirst = appointment && isFirstSlot(appointment, hour, minute);
                const slots = appointment ? getAppointmentSlots(appointment) : 0;

                // Check if any provider is available
                const anyProviderAvailable = providers.some((provider) =>
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
                      } else if (anyProviderAvailable) {
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
  );
}
