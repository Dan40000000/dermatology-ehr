import React, { useState, useEffect } from 'react';

interface ReminderPreferences {
  id?: string;
  preferredChannel: 'sms' | 'email' | 'both' | 'none';
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  optedOut: boolean;
  preferredLanguage: string;
  advanceNoticeHours: number;
  receiveNoShowFollowup: boolean;
}

interface PatientPreferencesProps {
  tenantId: string;
  accessToken: string;
  patientId: string;
  patientName?: string;
  onClose?: () => void;
  onSave?: () => void;
}

export function PatientPreferences({
  tenantId,
  accessToken,
  patientId,
  patientName,
  onClose,
  onSave,
}: PatientPreferencesProps) {
  const [preferences, setPreferences] = useState<ReminderPreferences>({
    preferredChannel: 'both',
    quietHoursStart: null,
    quietHoursEnd: null,
    optedOut: false,
    preferredLanguage: 'en',
    advanceNoticeHours: 24,
    receiveNoShowFollowup: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, [tenantId, accessToken, patientId]);

  const fetchPreferences = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reminders/patient/${patientId}/preferences`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/reminders/patient/${patientId}/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify(preferences),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        onSave?.();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save preferences');
      }
    } catch (err) {
      setError('Failed to save preferences');
    } finally {
      setSaving(false);
    }
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
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Reminder Preferences</h2>
            {patientName && <p className="text-sm text-gray-500">{patientName}</p>}
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-600">Preferences saved successfully</p>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Opt-out toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h3 className="font-medium text-gray-900">Reminder Opt-Out</h3>
            <p className="text-sm text-gray-500">
              Disable all appointment reminders for this patient
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.optedOut}
              onChange={(e) =>
                setPreferences({ ...preferences, optedOut: e.target.checked })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>

        {!preferences.optedOut && (
          <>
            {/* Preferred Channel */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preferred Reminder Channel
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: 'both', label: 'SMS + Email' },
                  { value: 'sms', label: 'SMS Only' },
                  { value: 'email', label: 'Email Only' },
                  { value: 'none', label: 'None' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      preferences.preferredChannel === option.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preferredChannel"
                      value={option.value}
                      checked={preferences.preferredChannel === option.value}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          preferredChannel: e.target.value as 'sms' | 'email' | 'both' | 'none',
                        })
                      }
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Quiet Hours */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quiet Hours (Do Not Disturb)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                No reminders will be sent during these hours
              </p>
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input
                    type="time"
                    value={preferences.quietHoursStart || ''}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        quietHoursStart: e.target.value || null,
                      })
                    }
                    className="w-full border rounded-md px-3 py-2"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input
                    type="time"
                    value={preferences.quietHoursEnd || ''}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        quietHoursEnd: e.target.value || null,
                      })
                    }
                    className="w-full border rounded-md px-3 py-2"
                  />
                </div>
                <button
                  onClick={() =>
                    setPreferences({
                      ...preferences,
                      quietHoursStart: null,
                      quietHoursEnd: null,
                    })
                  }
                  className="text-sm text-gray-500 hover:text-gray-700 mt-4"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Advance Notice */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preferred Advance Notice
              </label>
              <select
                value={preferences.advanceNoticeHours}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    advanceNoticeHours: parseInt(e.target.value),
                  })
                }
                className="w-full border rounded-md px-3 py-2"
              >
                <option value={2}>2 hours before</option>
                <option value={12}>12 hours before</option>
                <option value={24}>24 hours before (1 day)</option>
                <option value={48}>48 hours before (2 days)</option>
                <option value={72}>72 hours before (3 days)</option>
              </select>
            </div>

            {/* Language Preference */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preferred Language
              </label>
              <select
                value={preferences.preferredLanguage}
                onChange={(e) =>
                  setPreferences({ ...preferences, preferredLanguage: e.target.value })
                }
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="zh">Chinese</option>
                <option value="vi">Vietnamese</option>
                <option value="ko">Korean</option>
              </select>
            </div>

            {/* No-Show Follow-up */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">No-Show Follow-up</h3>
                <p className="text-sm text-gray-500">
                  Receive a message if you miss an appointment
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.receiveNoShowFollowup}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      receiveNoShowFollowup: e.target.checked,
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-gray-200 px-6 py-4 flex justify-end space-x-3">
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        )}
        <button
          onClick={savePreferences}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
