import React, { useState, useEffect } from 'react';

interface ReminderSchedule {
  id: string;
  tenantId: string;
  appointmentTypeId: string | null;
  appointmentTypeName: string | null;
  reminderType: 'sms' | 'email' | 'both';
  hoursBefore: number;
  templateId: string | null;
  templateName: string | null;
  isActive: boolean;
  includeConfirmationRequest: boolean;
  priority: number;
}

interface ReminderTemplate {
  id: string;
  name: string;
  templateType: string;
  channel: 'sms' | 'email';
  subject?: string;
  body: string;
  isActive: boolean;
  isDefault: boolean;
}

interface AppointmentType {
  id: string;
  name: string;
}

interface ReminderSettingsProps {
  tenantId: string;
  accessToken: string;
}

export function ReminderSettings({ tenantId, accessToken }: ReminderSettingsProps) {
  const [schedules, setSchedules] = useState<ReminderSchedule[]>([]);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ReminderSchedule | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<'schedules' | 'templates'>('schedules');

  // Form state for new schedule
  const [newSchedule, setNewSchedule] = useState({
    appointmentTypeId: '',
    reminderType: 'both' as 'sms' | 'email' | 'both',
    hoursBefore: 24,
    includeConfirmationRequest: true,
  });

  // Form state for new template
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    templateType: '24_hour' as string,
    channel: 'sms' as 'sms' | 'email',
    subject: '',
    body: '',
    isDefault: false,
  });

  useEffect(() => {
    fetchData();
  }, [tenantId, accessToken]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schedulesRes, templatesRes, typesRes] = await Promise.all([
        fetch('/api/reminders/schedules', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'x-tenant-id': tenantId,
          },
        }),
        fetch('/api/reminders/templates', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'x-tenant-id': tenantId,
          },
        }),
        fetch('/api/appointment-types', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'x-tenant-id': tenantId,
          },
        }),
      ]);

      if (schedulesRes.ok) {
        const data = await schedulesRes.json();
        setSchedules(data.schedules || []);
      }

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }

      if (typesRes.ok) {
        const data = await typesRes.json();
        setAppointmentTypes(data.appointmentTypes || data || []);
      }

      setError(null);
    } catch (err) {
      setError('Failed to load reminder settings');
    } finally {
      setLoading(false);
    }
  };

  const createSchedule = async () => {
    try {
      const res = await fetch('/api/reminders/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({
          ...newSchedule,
          appointmentTypeId: newSchedule.appointmentTypeId || null,
        }),
      });

      if (res.ok) {
        setShowAddSchedule(false);
        setNewSchedule({
          appointmentTypeId: '',
          reminderType: 'both',
          hoursBefore: 24,
          includeConfirmationRequest: true,
        });
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create schedule');
      }
    } catch (err) {
      setError('Failed to create schedule');
    }
  };

  const updateSchedule = async (id: string, updates: Partial<ReminderSchedule>) => {
    try {
      const res = await fetch(`/api/reminders/schedules/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        setEditingSchedule(null);
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update schedule');
      }
    } catch (err) {
      setError('Failed to update schedule');
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      const res = await fetch(`/api/reminders/schedules/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete schedule');
      }
    } catch (err) {
      setError('Failed to delete schedule');
    }
  };

  const createTemplate = async () => {
    try {
      const res = await fetch('/api/reminders/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify(newTemplate),
      });

      if (res.ok) {
        setShowAddTemplate(false);
        setNewTemplate({
          name: '',
          templateType: '24_hour',
          channel: 'sms',
          subject: '',
          body: '',
          isDefault: false,
        });
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create template');
      }
    } catch (err) {
      setError('Failed to create template');
    }
  };

  const formatHours = (hours: number): string => {
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return remainingHours > 0
        ? `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`
        : `${days} day${days > 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="border-b border-gray-200">
        <div className="flex justify-between items-center px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900">Reminder Settings</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('schedules')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                activeTab === 'schedules'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Schedules
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                activeTab === 'templates'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Templates
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-sm text-red-500 underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'schedules' && (
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Reminder Schedules</h3>
            <button
              onClick={() => setShowAddSchedule(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Schedule
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Appointment Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Timing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Channel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Confirmation
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
                {schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {schedule.appointmentTypeName || 'All Types'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatHours(schedule.hoursBefore)} before
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="capitalize">{schedule.reminderType}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {schedule.includeConfirmationRequest ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          schedule.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {schedule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => updateSchedule(schedule.id, { isActive: !schedule.isActive })}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        {schedule.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {schedules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No reminder schedules configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {showAddSchedule && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-semibold mb-4">Add Reminder Schedule</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Appointment Type
                    </label>
                    <select
                      value={newSchedule.appointmentTypeId}
                      onChange={(e) =>
                        setNewSchedule({ ...newSchedule, appointmentTypeId: e.target.value })
                      }
                      className="w-full border rounded-md px-3 py-2"
                    >
                      <option value="">All Types</option>
                      {appointmentTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hours Before
                    </label>
                    <select
                      value={newSchedule.hoursBefore}
                      onChange={(e) =>
                        setNewSchedule({ ...newSchedule, hoursBefore: parseInt(e.target.value) })
                      }
                      className="w-full border rounded-md px-3 py-2"
                    >
                      <option value={2}>2 hours</option>
                      <option value={24}>24 hours (1 day)</option>
                      <option value={48}>48 hours (2 days)</option>
                      <option value={72}>72 hours (3 days)</option>
                      <option value={168}>1 week</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reminder Type
                    </label>
                    <select
                      value={newSchedule.reminderType}
                      onChange={(e) =>
                        setNewSchedule({
                          ...newSchedule,
                          reminderType: e.target.value as 'sms' | 'email' | 'both',
                        })
                      }
                      className="w-full border rounded-md px-3 py-2"
                    >
                      <option value="both">SMS + Email</option>
                      <option value="sms">SMS Only</option>
                      <option value="email">Email Only</option>
                    </select>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="includeConfirmation"
                      checked={newSchedule.includeConfirmationRequest}
                      onChange={(e) =>
                        setNewSchedule({
                          ...newSchedule,
                          includeConfirmationRequest: e.target.checked,
                        })
                      }
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label
                      htmlFor="includeConfirmation"
                      className="ml-2 text-sm text-gray-700"
                    >
                      Include confirmation request ("Reply Y to confirm")
                    </label>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowAddSchedule(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createSchedule}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Create Schedule
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Message Templates</h3>
            <button
              onClick={() => setShowAddTemplate(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Template
            </button>
          </div>

          <div className="mb-4 p-4 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Available Variables:</strong>{' '}
              {'{patient_name}'}, {'{appointment_date}'}, {'{appointment_time}'},{' '}
              {'{provider_name}'}, {'{location}'}, {'{clinic_name}'}, {'{clinic_phone}'}
            </p>
          </div>

          <div className="space-y-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="border rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-medium text-gray-900">{template.name}</h4>
                      {template.isDefault && (
                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                          Default
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          template.channel === 'sms'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {template.channel.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Type: {template.templateType.replace('_', ' ')}
                    </p>
                    <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">
                      {template.body.length > 200
                        ? template.body.substring(0, 200) + '...'
                        : template.body}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setEditingTemplate(template)}
                      className="text-blue-600 hover:text-blue-900 text-sm"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No templates configured. Default templates will be used.
              </div>
            )}
          </div>

          {showAddTemplate && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
                <h3 className="text-lg font-semibold mb-4">Add Message Template</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Template Name
                    </label>
                    <input
                      type="text"
                      value={newTemplate.name}
                      onChange={(e) =>
                        setNewTemplate({ ...newTemplate, name: e.target.value })
                      }
                      className="w-full border rounded-md px-3 py-2"
                      placeholder="e.g., Custom 24-Hour Reminder"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Template Type
                      </label>
                      <select
                        value={newTemplate.templateType}
                        onChange={(e) =>
                          setNewTemplate({ ...newTemplate, templateType: e.target.value })
                        }
                        className="w-full border rounded-md px-3 py-2"
                      >
                        <option value="48_hour">48-Hour Reminder</option>
                        <option value="24_hour">24-Hour Reminder</option>
                        <option value="2_hour">2-Hour Reminder</option>
                        <option value="confirmation">Confirmation Request</option>
                        <option value="no_show_followup">No-Show Follow-up</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Channel
                      </label>
                      <select
                        value={newTemplate.channel}
                        onChange={(e) =>
                          setNewTemplate({
                            ...newTemplate,
                            channel: e.target.value as 'sms' | 'email',
                          })
                        }
                        className="w-full border rounded-md px-3 py-2"
                      >
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                  </div>
                  {newTemplate.channel === 'email' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={newTemplate.subject}
                        onChange={(e) =>
                          setNewTemplate({ ...newTemplate, subject: e.target.value })
                        }
                        className="w-full border rounded-md px-3 py-2"
                        placeholder="Appointment Reminder - {appointment_date}"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message Body
                    </label>
                    <textarea
                      value={newTemplate.body}
                      onChange={(e) =>
                        setNewTemplate({ ...newTemplate, body: e.target.value })
                      }
                      className="w-full border rounded-md px-3 py-2 h-32"
                      placeholder={
                        newTemplate.channel === 'sms'
                          ? 'Reminder: Your appointment is on {appointment_date} at {appointment_time}. Reply Y to confirm.'
                          : 'Dear {patient_name},\n\nThis is a reminder about your upcoming appointment...'
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {newTemplate.channel === 'sms' && `${newTemplate.body.length}/160 characters`}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isDefault"
                      checked={newTemplate.isDefault}
                      onChange={(e) =>
                        setNewTemplate({ ...newTemplate, isDefault: e.target.checked })
                      }
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                    <label htmlFor="isDefault" className="ml-2 text-sm text-gray-700">
                      Set as default template for this type/channel
                    </label>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowAddTemplate(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createTemplate}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    disabled={!newTemplate.name || !newTemplate.body}
                  >
                    Create Template
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
