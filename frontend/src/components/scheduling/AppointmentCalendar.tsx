import { useState, useMemo } from 'react';

interface AppointmentCalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  availableDates: string[]; // Array of YYYY-MM-DD strings
  minDate?: Date;
  maxDate?: Date;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function AppointmentCalendar({
  selectedDate,
  onDateSelect,
  availableDates,
  minDate,
  maxDate,
}: AppointmentCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const { year, month } = currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days in month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, [currentMonth]);

  // Check if a date is available
  const isDateAvailable = (date: Date): boolean => {
    const dateStr = date.toISOString().split('T')[0];
    return availableDates.includes(dateStr);
  };

  // Check if a date is selectable
  const isDateSelectable = (date: Date): boolean => {
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    return isDateAvailable(date);
  };

  // Check if a date is selected
  const isDateSelected = (date: Date): boolean => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  // Check if a date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const goToPreviousMonth = () => {
    setCurrentMonth((prev) => {
      const newMonth = prev.month - 1;
      if (newMonth < 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: newMonth };
    });
  };

  const goToNextMonth = () => {
    setCurrentMonth((prev) => {
      const newMonth = prev.month + 1;
      if (newMonth > 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: newMonth };
    });
  };

  const handleDateClick = (date: Date) => {
    if (isDateSelectable(date)) {
      onDateSelect(date);
    }
  };

  return (
    <div className="appointment-calendar">
      {/* Month navigation */}
      <div className="calendar-header">
        <button
          type="button"
          onClick={goToPreviousMonth}
          className="calendar-nav-button"
          aria-label="Previous month"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <h3 className="calendar-month-year">
          {MONTHS[currentMonth.month]} {currentMonth.year}
        </h3>

        <button
          type="button"
          onClick={goToNextMonth}
          className="calendar-nav-button"
          aria-label="Next month"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Days of week header */}
      <div className="calendar-weekdays">
        {DAYS_OF_WEEK.map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="calendar-grid">
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="calendar-day empty" />;
          }

          const available = isDateAvailable(date);
          const selectable = isDateSelectable(date);
          const selected = isDateSelected(date);
          const today = isToday(date);

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => handleDateClick(date)}
              disabled={!selectable}
              className={`calendar-day ${available ? 'available' : 'unavailable'} ${
                selected ? 'selected' : ''
              } ${today ? 'today' : ''} ${!selectable ? 'disabled' : ''}`}
              aria-label={`${date.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}`}
              aria-pressed={selected}
            >
              <span className="calendar-day-number">{date.getDate()}</span>
              {available && <span className="calendar-day-indicator" />}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="calendar-legend">
        <div className="legend-item">
          <span className="legend-indicator available" />
          <span className="legend-label">Available</span>
        </div>
        <div className="legend-item">
          <span className="legend-indicator unavailable" />
          <span className="legend-label">No availability</span>
        </div>
        {selectedDate && (
          <div className="legend-item">
            <span className="legend-indicator selected" />
            <span className="legend-label">Selected</span>
          </div>
        )}
      </div>

      <style>{`
        .appointment-calendar {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }

        .calendar-month-year {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .calendar-nav-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
        }

        .calendar-nav-button:hover {
          background: #f3f4f6;
          color: #111827;
        }

        .calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 0.25rem;
          margin-bottom: 0.5rem;
        }

        .calendar-weekday {
          text-align: center;
          font-size: 0.875rem;
          font-weight: 600;
          color: #6b7280;
          padding: 0.5rem;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 0.25rem;
        }

        .calendar-day {
          position: relative;
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0.5rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #111827;
          cursor: pointer;
          transition: all 0.2s;
        }

        .calendar-day.empty {
          border: none;
          background: transparent;
          cursor: default;
        }

        .calendar-day:not(.empty):not(.disabled):hover {
          background: #f9fafb;
          border-color: #d1d5db;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .calendar-day.available {
          border-color: #10b981;
          background: #ecfdf5;
          color: #065f46;
        }

        .calendar-day.available:not(.disabled):hover {
          background: #d1fae5;
          border-color: #059669;
        }

        .calendar-day.unavailable {
          background: #f9fafb;
          color: #9ca3af;
          cursor: not-allowed;
        }

        .calendar-day.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .calendar-day.selected {
          background: #6B46C1 !important;
          border-color: #6B46C1 !important;
          color: white !important;
          box-shadow: 0 4px 6px rgba(107, 70, 193, 0.3);
        }

        .calendar-day.today .calendar-day-number {
          font-weight: 700;
        }

        .calendar-day.today:not(.selected) {
          border-width: 2px;
          border-color: #6B46C1;
        }

        .calendar-day-number {
          display: block;
          line-height: 1;
        }

        .calendar-day-indicator {
          display: block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #10b981;
          margin-top: 2px;
        }

        .calendar-day.selected .calendar-day-indicator {
          background: white;
        }

        .calendar-legend {
          display: flex;
          gap: 1.5rem;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .legend-indicator {
          display: block;
          width: 1rem;
          height: 1rem;
          border-radius: 4px;
          border: 1px solid #e5e7eb;
        }

        .legend-indicator.available {
          background: #ecfdf5;
          border-color: #10b981;
        }

        .legend-indicator.unavailable {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        .legend-indicator.selected {
          background: #6B46C1;
          border-color: #6B46C1;
        }

        .legend-label {
          font-size: 0.875rem;
          color: #6b7280;
        }

        @media (max-width: 640px) {
          .appointment-calendar {
            padding: 1rem;
          }

          .calendar-weekday {
            font-size: 0.75rem;
            padding: 0.25rem;
          }

          .calendar-day {
            font-size: 0.75rem;
            padding: 0.25rem;
          }

          .calendar-legend {
            flex-direction: column;
            gap: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
