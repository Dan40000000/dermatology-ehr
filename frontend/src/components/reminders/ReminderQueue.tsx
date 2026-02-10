import React, { useState, useEffect } from 'react';

interface QueuedReminder {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  reminderType: 'sms' | 'email';
  reminderCategory: string;
  scheduledFor: string;
  sentAt: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled' | 'skipped';
  deliveryStatus: string | null;
  messageContent: string | null;
  errorMessage: string | null;
  retryCount: number;
  appointmentTime: string;
}

interface ReminderQueueProps {
  tenantId: string;
  accessToken: string;
}

export function ReminderQueue({ tenantId, accessToken }: ReminderQueueProps) {
  const [reminders, setReminders] = useState<QueuedReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedReminder, setSelectedReminder] = useState<QueuedReminder | null>(null);
  const limit = 25;

  useEffect(() => {
    fetchReminders();
  }, [tenantId, accessToken, statusFilter, typeFilter, page]);

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('reminderType', typeFilter);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const res = await fetch(`/api/reminders/queue?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
        setTotal(data.pagination?.total || 0);
        setError(null);
      } else {
        setError('Failed to load reminder queue');
      }
    } catch (err) {
      setError('Failed to load reminder queue');
    } finally {
      setLoading(false);
    }
  };

  const cancelReminder = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this reminder?')) return;

    try {
      const res = await fetch(`/api/reminders/queue/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });

      if (res.ok) {
        fetchReminders();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to cancel reminder');
      }
    } catch (err) {
      setError('Failed to cancel reminder');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
      skipped: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || 'bg-gray-100'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    return (
      <span
        className={`px-2 py-1 text-xs rounded ${
          type === 'sms' ? 'bg-green-50 text-green-700' : 'bg-purple-50 text-purple-700'
        }`}
      >
        {type.toUpperCase()}
      </span>
    );
  };

  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      '48_hour': '48-Hour',
      '24_hour': '24-Hour',
      '2_hour': '2-Hour',
      confirmation: 'Confirmation',
      no_show_followup: 'No-Show',
      custom: 'Custom',
    };
    return labels[category] || category;
  };

  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Reminder Queue</h2>
          <button
            onClick={fetchReminders}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex space-x-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="border rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(0);
              }}
              className="border rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">All Types</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Scheduled For
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Appointment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reminders.map((reminder) => (
                  <tr key={reminder.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {reminder.patientName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getTypeBadge(reminder.reminderType)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getCategoryLabel(reminder.reminderCategory)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateTime(reminder.scheduledFor)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateTime(reminder.appointmentTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(reminder.status)}
                      {reminder.errorMessage && (
                        <span
                          className="ml-2 text-red-500 cursor-help"
                          title={reminder.errorMessage}
                        >
                          <svg
                            className="inline w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => setSelectedReminder(reminder)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        View
                      </button>
                      {reminder.status === 'pending' && (
                        <button
                          onClick={() => cancelReminder(reminder.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {reminders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No reminders in queue
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {selectedReminder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">Reminder Details</h3>
              <button
                onClick={() => setSelectedReminder(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 uppercase">Patient</label>
                <p className="font-medium">{selectedReminder.patientName}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Type</label>
                  <p>{getTypeBadge(selectedReminder.reminderType)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Status</label>
                  <p>{getStatusBadge(selectedReminder.status)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Scheduled For</label>
                  <p className="text-sm">{formatDateTime(selectedReminder.scheduledFor)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Appointment Time</label>
                  <p className="text-sm">{formatDateTime(selectedReminder.appointmentTime)}</p>
                </div>
              </div>
              {selectedReminder.sentAt && (
                <div>
                  <label className="text-xs text-gray-500 uppercase">Sent At</label>
                  <p className="text-sm">{formatDateTime(selectedReminder.sentAt)}</p>
                </div>
              )}
              {selectedReminder.messageContent && (
                <div>
                  <label className="text-xs text-gray-500 uppercase">Message</label>
                  <p className="text-sm bg-gray-50 p-3 rounded mt-1 whitespace-pre-wrap">
                    {selectedReminder.messageContent}
                  </p>
                </div>
              )}
              {selectedReminder.errorMessage && (
                <div>
                  <label className="text-xs text-gray-500 uppercase">Error</label>
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded mt-1">
                    {selectedReminder.errorMessage}
                  </p>
                </div>
              )}
              {selectedReminder.retryCount > 0 && (
                <div>
                  <label className="text-xs text-gray-500 uppercase">Retry Count</label>
                  <p className="text-sm">{selectedReminder.retryCount}</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedReminder(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
