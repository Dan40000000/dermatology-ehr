import React, { useState } from 'react';
import { format } from 'date-fns';

export interface AppointmentWithDetails {
  id: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string;
  providerId: string;
  providerName: string;
  locationName: string;
  appointmentTypeName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  arrivedAt?: string;
  waitTimeMinutes?: number;
  insuranceVerified?: boolean;
  insurancePlanName?: string;
  copayAmount?: number;
  outstandingBalance?: number;
}

interface TodaySchedulePanelProps {
  appointments: AppointmentWithDetails[];
  onCheckIn: (appointmentId: string) => void;
  onCheckOut: (appointmentId: string) => void;
  onStatusChange: (appointmentId: string, status: string) => void;
  onSelectAppointment: (appointment: AppointmentWithDetails) => void;
  isLoading?: boolean;
}

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    scheduled: 'bg-gray-100 text-gray-800',
    checked_in: 'bg-blue-100 text-blue-800',
    in_room: 'bg-purple-100 text-purple-800',
    with_provider: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    no_show: 'bg-orange-100 text-orange-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    checked_in: 'Arrived',
    in_room: 'In Room',
    with_provider: 'With Provider',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
  };
  return labels[status] || status;
};

export const TodaySchedulePanel: React.FC<TodaySchedulePanelProps> = ({
  appointments,
  onCheckIn,
  onCheckOut,
  onStatusChange,
  onSelectAppointment,
  isLoading,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProvider, setFilterProvider] = useState<string>('all');

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
        </div>
        <div className="p-6 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  // Get unique providers for filter
  const providers = Array.from(
    new Set(appointments.map((apt) => apt.providerName))
  ).sort();

  // Apply filters
  let filteredAppointments = appointments;
  if (filterStatus !== 'all') {
    filteredAppointments = filteredAppointments.filter(
      (apt) => apt.status === filterStatus
    );
  }
  if (filterProvider !== 'all') {
    filteredAppointments = filteredAppointments.filter(
      (apt) => apt.providerName === filterProvider
    );
  }

  const handleRowClick = (appointment: AppointmentWithDetails) => {
    setExpandedId(expandedId === appointment.id ? null : appointment.id);
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Today's Schedule</h2>
          <div className="text-sm text-gray-600">
            {filteredAppointments.length} appointment(s)
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="checked_in">Arrived</option>
              <option value="in_room">In Room</option>
              <option value="with_provider">With Provider</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provider
            </label>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Providers</option>
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Appointment List */}
      <div className="divide-y divide-gray-200">
        {filteredAppointments.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No appointments found
          </div>
        ) : (
          filteredAppointments.map((appointment) => (
            <div
              key={appointment.id}
              className="hover:bg-gray-50 transition-colors cursor-pointer"
            >
              {/* Main Row */}
              <div
                className="px-6 py-4"
                onClick={() => handleRowClick(appointment)}
              >
                <div className="flex items-center justify-between">
                  {/* Time & Patient Info */}
                  <div className="flex items-center gap-6 flex-1">
                    <div className="text-lg font-semibold text-gray-900 w-24">
                      {format(new Date(appointment.scheduledStart), 'h:mm a')}
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        {appointment.patientFirstName} {appointment.patientLastName}
                      </div>
                      <div className="text-sm text-gray-600">
                        {appointment.appointmentTypeName} • {appointment.providerName}
                      </div>
                    </div>
                  </div>

                  {/* Status & Indicators */}
                  <div className="flex items-center gap-3">
                    {/* Wait Time Alert */}
                    {appointment.waitTimeMinutes && appointment.waitTimeMinutes > 15 && (
                      <div className="flex items-center gap-1 text-orange-600 bg-orange-50 px-3 py-1 rounded-full text-sm font-medium">
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {appointment.waitTimeMinutes} min
                      </div>
                    )}

                    {/* Insurance Status */}
                    {appointment.insuranceVerified ? (
                      <div
                        className="text-green-600 text-xl"
                        title="Insurance Verified"
                      >
                        ✓
                      </div>
                    ) : (
                      <div
                        className="text-yellow-600 text-xl"
                        title="Insurance Pending"
                      >
                        ⚠
                      </div>
                    )}

                    {/* Balance Alert */}
                    {appointment.outstandingBalance &&
                      appointment.outstandingBalance > 100 && (
                        <div
                          className="text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm font-medium"
                          title={`Outstanding balance: $${appointment.outstandingBalance.toFixed(2)}`}
                        >
                          ${appointment.outstandingBalance.toFixed(0)}
                        </div>
                      )}

                    {/* Status Badge */}
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                        appointment.status
                      )}`}
                    >
                      {getStatusLabel(appointment.status)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === appointment.id && (
                <div className="px-6 pb-4 bg-gray-50 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-4 mb-4 pt-4">
                    <div>
                      <div className="text-sm font-medium text-gray-700">
                        Contact
                      </div>
                      <div className="text-sm text-gray-900">
                        {appointment.patientPhone || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">
                        Insurance
                      </div>
                      <div className="text-sm text-gray-900">
                        {appointment.insurancePlanName || 'Not on file'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">
                        Copay
                      </div>
                      <div className="text-sm text-gray-900">
                        ${(appointment.copayAmount || 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">
                        Outstanding Balance
                      </div>
                      <div className="text-sm text-gray-900">
                        ${(appointment.outstandingBalance || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2">
                    {appointment.status === 'scheduled' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCheckIn(appointment.id);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
                      >
                        Check In
                      </button>
                    )}
                    {appointment.status === 'checked_in' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStatusChange(appointment.id, 'in_room');
                        }}
                        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium text-sm"
                      >
                        Move to Room
                      </button>
                    )}
                    {(appointment.status === 'with_provider' ||
                      appointment.status === 'in_room') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCheckOut(appointment.id);
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-sm"
                      >
                        Check Out
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAppointment(appointment);
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium text-sm"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
