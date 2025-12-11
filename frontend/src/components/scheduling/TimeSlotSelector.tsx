import { useMemo, useState } from 'react';

interface TimeSlot {
  startTime: string; // ISO datetime string
  endTime: string;
  isAvailable: boolean;
  providerId: string;
  providerName?: string;
}

interface TimeSlotSelectorProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  onSlotSelect: (slot: TimeSlot) => void;
  loading?: boolean;
  date: Date | null;
}

type TimeFilter = 'all' | 'morning' | 'afternoon' | 'evening';

export function TimeSlotSelector({
  slots,
  selectedSlot,
  onSlotSelect,
  loading = false,
  date,
}: TimeSlotSelectorProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  // Filter slots by time of day
  const filteredSlots = useMemo(() => {
    if (timeFilter === 'all') return slots;

    return slots.filter((slot) => {
      const hour = new Date(slot.startTime).getHours();

      switch (timeFilter) {
        case 'morning':
          return hour >= 6 && hour < 12;
        case 'afternoon':
          return hour >= 12 && hour < 17;
        case 'evening':
          return hour >= 17 && hour < 21;
        default:
          return true;
      }
    });
  }, [slots, timeFilter]);

  // Group slots by hour for better display
  const groupedSlots = useMemo(() => {
    const groups: { [hour: string]: TimeSlot[] } = {};

    filteredSlots.forEach((slot) => {
      const date = new Date(slot.startTime);
      const hour = date.getHours();
      const hourKey = `${hour}:00`;

      if (!groups[hourKey]) {
        groups[hourKey] = [];
      }

      groups[hourKey].push(slot);
    });

    return groups;
  }, [filteredSlots]);

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatHour = (hourStr: string): string => {
    const [hour] = hourStr.split(':');
    const hourNum = parseInt(hour);
    const period = hourNum >= 12 ? 'PM' : 'AM';
    const displayHour = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
    return `${displayHour}:00 ${period}`;
  };

  const isSlotSelected = (slot: TimeSlot): boolean => {
    return selectedSlot?.startTime === slot.startTime;
  };

  // Count available slots
  const availableCount = slots.filter((s) => s.isAvailable).length;
  const filteredAvailableCount = filteredSlots.filter((s) => s.isAvailable).length;

  if (loading) {
    return (
      <div className="time-slot-selector">
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Loading available times...</p>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  if (!date) {
    return (
      <div className="time-slot-selector">
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <polyline points="12 6 12 12 16 14" strokeWidth="2" />
          </svg>
          <p>Please select a date to view available times</p>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="time-slot-selector">
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <line x1="15" y1="9" x2="9" y2="15" strokeWidth="2" />
            <line x1="9" y1="9" x2="15" y2="15" strokeWidth="2" />
          </svg>
          <p>No available times for this date</p>
          <small>Please try another date</small>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="time-slot-selector">
      {/* Header with date and filter */}
      <div className="selector-header">
        <div className="selected-date">
          <h3>
            {date.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </h3>
          <p className="available-count">
            {availableCount} {availableCount === 1 ? 'slot' : 'slots'} available
          </p>
        </div>

        {/* Time filter */}
        <div className="time-filter">
          <button
            type="button"
            onClick={() => setTimeFilter('all')}
            className={`filter-button ${timeFilter === 'all' ? 'active' : ''}`}
          >
            All Day
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('morning')}
            className={`filter-button ${timeFilter === 'morning' ? 'active' : ''}`}
          >
            Morning
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('afternoon')}
            className={`filter-button ${timeFilter === 'afternoon' ? 'active' : ''}`}
          >
            Afternoon
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('evening')}
            className={`filter-button ${timeFilter === 'evening' ? 'active' : ''}`}
          >
            Evening
          </button>
        </div>
      </div>

      {/* Time slots grouped by hour */}
      <div className="slots-container">
        {filteredSlots.length === 0 ? (
          <div className="empty-state small">
            <p>No {timeFilter} slots available</p>
            <small>Try a different time of day</small>
          </div>
        ) : (
          Object.entries(groupedSlots).map(([hour, hourSlots]) => (
            <div key={hour} className="hour-group">
              <div className="hour-label">{formatHour(hour)}</div>
              <div className="slots-grid">
                {hourSlots.map((slot) => (
                  <button
                    key={slot.startTime}
                    type="button"
                    onClick={() => onSlotSelect(slot)}
                    disabled={!slot.isAvailable}
                    className={`time-slot ${slot.isAvailable ? 'available' : 'booked'} ${
                      isSlotSelected(slot) ? 'selected' : ''
                    }`}
                    aria-label={`${formatTime(slot.startTime)} ${
                      slot.isAvailable ? 'available' : 'booked'
                    }`}
                    aria-pressed={isSlotSelected(slot)}
                  >
                    <span className="slot-time">{formatTime(slot.startTime)}</span>
                    {isSlotSelected(slot) && (
                      <svg
                        className="checkmark"
                        width="16"
                        height="16"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info message */}
      <div className="info-message">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <span>Select a time slot to continue booking</span>
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .time-slot-selector {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .selector-header {
    margin-bottom: 1.5rem;
  }

  .selected-date h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
    margin: 0 0 0.25rem 0;
  }

  .available-count {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  .time-filter {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .filter-button {
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-button:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .filter-button.active {
    background: #6B46C1;
    border-color: #6B46C1;
    color: white;
  }

  .slots-container {
    max-height: 400px;
    overflow-y: auto;
    margin-bottom: 1rem;
    padding-right: 0.5rem;
  }

  .slots-container::-webkit-scrollbar {
    width: 6px;
  }

  .slots-container::-webkit-scrollbar-track {
    background: #f3f4f6;
    border-radius: 3px;
  }

  .slots-container::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }

  .slots-container::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }

  .hour-group {
    margin-bottom: 1.5rem;
  }

  .hour-group:last-child {
    margin-bottom: 0;
  }

  .hour-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 0.75rem;
    padding-left: 0.25rem;
  }

  .slots-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.75rem;
  }

  .time-slot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s;
    min-height: 44px;
  }

  .time-slot:hover:not(:disabled) {
    border-color: #6B46C1;
    background: #faf5ff;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(107, 70, 193, 0.1);
  }

  .time-slot.available {
    border-color: #10b981;
    background: #ecfdf5;
    color: #065f46;
  }

  .time-slot.available:hover {
    border-color: #059669;
    background: #d1fae5;
  }

  .time-slot.selected {
    background: #6B46C1;
    border-color: #6B46C1;
    color: white;
    box-shadow: 0 4px 6px rgba(107, 70, 193, 0.3);
  }

  .time-slot.selected:hover {
    background: #7c3aed;
    border-color: #7c3aed;
  }

  .time-slot.booked {
    background: #f9fafb;
    border-color: #e5e7eb;
    color: #9ca3af;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .slot-time {
    display: block;
  }

  .checkmark {
    position: absolute;
    top: 4px;
    right: 4px;
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    text-align: center;
    color: #6b7280;
  }

  .empty-state.small {
    padding: 2rem 1rem;
  }

  .loading-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #f3f4f6;
    border-top-color: #6B46C1;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .empty-state svg {
    color: #d1d5db;
    margin-bottom: 1rem;
  }

  .empty-state p {
    font-size: 1rem;
    font-weight: 500;
    color: #374151;
    margin: 0 0 0.5rem 0;
  }

  .empty-state small {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .info-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #eff6ff;
    border: 1px solid #dbeafe;
    border-radius: 6px;
    font-size: 0.875rem;
    color: #1e40af;
  }

  .info-message svg {
    flex-shrink: 0;
    color: #3b82f6;
  }

  @media (max-width: 640px) {
    .time-slot-selector {
      padding: 1rem;
    }

    .slots-grid {
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 0.5rem;
    }

    .time-slot {
      padding: 0.625rem 0.75rem;
      font-size: 0.8125rem;
    }

    .slots-container {
      max-height: 300px;
    }

    .filter-button {
      flex: 1;
      min-width: 70px;
    }
  }
`;
