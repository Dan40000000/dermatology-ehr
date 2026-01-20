import React, { useState } from 'react';

interface FinancialEvent {
  date: string;
  type: string;
  description: string;
  amountCents?: number;
  status: string;
}

interface FinancialCalendarProps {
  events: FinancialEvent[];
}

export function FinancialCalendar({ events }: FinancialCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'payment_plan':
        return '💰';
      case 'prior_auth_expiring':
        return '⏰';
      case 'statement_run':
        return '📄';
      case 'expected_payment':
        return '💳';
      default:
        return '📅';
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'payment_plan':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'prior_auth_expiring':
        return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'statement_run':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'expected_payment':
        return 'bg-purple-100 border-purple-300 text-purple-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    const date = event.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(event);
    return acc;
  }, {} as Record<string, FinancialEvent[]>);

  // Get calendar days
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);

  const previousMonth = () => {
    setCurrentMonth(new Date(year, month - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1));
  };

  const today = new Date();
  const isToday = (day: number) => {
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Financial Calendar</h3>
          <p className="text-sm text-gray-600 mt-1">Upcoming payments and important dates</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={previousMonth}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-lg font-semibold text-gray-900 min-w-[140px] text-center">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
            {day}
          </div>
        ))}
        {Array.from({ length: startingDayOfWeek }).map((_, index) => (
          <div key={`empty-${index}`} className="aspect-square"></div>
        ))}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = eventsByDate[dateStr] || [];
          const hasEvents = dayEvents.length > 0;

          return (
            <div
              key={day}
              className={`aspect-square p-2 border rounded-lg transition-all ${
                isToday(day)
                  ? 'bg-purple-50 border-purple-300 font-bold'
                  : hasEvents
                  ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-sm font-medium text-gray-900 mb-1">{day}</div>
              {hasEvents && (
                <div className="space-y-1">
                  {dayEvents.slice(0, 2).map((event, idx) => (
                    <div
                      key={idx}
                      className="text-xs truncate"
                      title={event.description}
                    >
                      {getEventIcon(event.type)}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-xs text-gray-600">+{dayEvents.length - 2}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Upcoming Events List */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Upcoming Events</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {events.slice(0, 10).map((event, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-3 rounded-lg border ${getEventColor(event.type)}`}
            >
              <div className="flex items-center space-x-3 flex-1">
                <span className="text-2xl">{getEventIcon(event.type)}</span>
                <div className="flex-1">
                  <div className="font-medium">{event.description}</div>
                  <div className="text-xs opacity-75">
                    {new Date(event.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              </div>
              {event.amountCents && (
                <div className="font-semibold">{formatCurrency(event.amountCents)}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-lg">💰</span>
            <span className="text-gray-700">Payment Due</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-lg">⏰</span>
            <span className="text-gray-700">Prior Auth Expiring</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-lg">📄</span>
            <span className="text-gray-700">Statement Run</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-lg">💳</span>
            <span className="text-gray-700">Expected Payment</span>
          </div>
        </div>
      </div>
    </div>
  );
}
