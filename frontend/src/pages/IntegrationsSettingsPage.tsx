import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../utils/apiBase";

const API_URL = API_BASE_URL;

interface Integration {
  id: string;
  type: "slack" | "teams";
  webhook_url: string;
  channel_name?: string;
  enabled: boolean;
  notification_types: string[];
  created_at: string;
  updated_at: string;
  stats?: {
    total_notifications: string;
    successful_notifications: string;
    failed_notifications: string;
  };
}

interface NotificationLog {
  id: string;
  integration_id: string;
  integration_type: string;
  channel_name?: string;
  notification_type: string;
  success: boolean;
  error_message?: string;
  sent_at: string;
}

const notificationTypeLabels: Record<string, string> = {
  appointment_booked: "Appointment Booked",
  appointment_cancelled: "Appointment Cancelled",
  patient_checked_in: "Patient Checked In",
  prior_auth_approved: "Prior Auth Approved",
  prior_auth_denied: "Prior Auth Denied",
  lab_results_ready: "Lab Results Ready",
  urgent_message: "Urgent Message Received",
  daily_schedule_summary: "Daily Schedule Summary",
  end_of_day_report: "End of Day Report",
};

const allNotificationTypes = Object.keys(notificationTypeLabels);

export default function IntegrationsSettingsPage() {
  const { headers } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"setup" | "logs">("setup");

  // Slack setup
  const [showSlackSetup, setShowSlackSetup] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [slackChannel, setSlackChannel] = useState("");
  const [slackNotifications, setSlackNotifications] = useState<string[]>([]);

  // Teams setup
  const [showTeamsSetup, setShowTeamsSetup] = useState(false);
  const [teamsWebhook, setTeamsWebhook] = useState("");
  const [teamsChannel, setTeamsChannel] = useState("");
  const [teamsNotifications, setTeamsNotifications] = useState<string[]>([]);

  // UI state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchIntegrations();
    fetchLogs();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/integrations`, { headers });
      setIntegrations(response.data.integrations);
    } catch (err: any) {
      setError("Failed to load integrations");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/integrations/logs?limit=20`, { headers });
      setLogs(response.data.logs);
    } catch (err: any) {
      console.error("Failed to load logs:", err);
    }
  };

  const createSlackIntegration = async () => {
    if (!slackWebhook.startsWith("https://hooks.slack.com/")) {
      setError("Invalid Slack webhook URL");
      return;
    }

    if (slackNotifications.length === 0) {
      setError("Please select at least one notification type");
      return;
    }

    try {
      setError(null);
      await axios.post(
        `${API_URL}/api/integrations/slack`,
        {
          webhookUrl: slackWebhook,
          channelName: slackChannel,
          notificationTypes: slackNotifications,
        },
        { headers }
      );
      setSuccess("Slack integration created successfully!");
      setShowSlackSetup(false);
      setSlackWebhook("");
      setSlackChannel("");
      setSlackNotifications([]);
      fetchIntegrations();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create Slack integration");
    }
  };

  const createTeamsIntegration = async () => {
    if (!teamsWebhook.includes("webhook.office.com")) {
      setError("Invalid Microsoft Teams webhook URL");
      return;
    }

    if (teamsNotifications.length === 0) {
      setError("Please select at least one notification type");
      return;
    }

    try {
      setError(null);
      await axios.post(
        `${API_URL}/api/integrations/teams`,
        {
          webhookUrl: teamsWebhook,
          channelName: teamsChannel,
          notificationTypes: teamsNotifications,
        },
        { headers }
      );
      setSuccess("Teams integration created successfully!");
      setShowTeamsSetup(false);
      setTeamsWebhook("");
      setTeamsChannel("");
      setTeamsNotifications([]);
      fetchIntegrations();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create Teams integration");
    }
  };

  const testIntegration = async (integrationId: string) => {
    setTestingId(integrationId);
    setError(null);
    try {
      await axios.post(`${API_URL}/api/integrations/${integrationId}/test`, {}, { headers });
      setSuccess("Test notification sent successfully!");
      setTimeout(() => fetchLogs(), 1000);
    } catch (err: any) {
      setError("Test failed: " + (err.response?.data?.error || "Unknown error"));
    } finally {
      setTestingId(null);
    }
  };

  const toggleIntegration = async (integrationId: string, enabled: boolean) => {
    try {
      await axios.patch(
        `${API_URL}/api/integrations/${integrationId}`,
        { enabled: !enabled },
        { headers }
      );
      fetchIntegrations();
    } catch (err: any) {
      setError("Failed to toggle integration");
    }
  };

  const deleteIntegration = async (integrationId: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/api/integrations/${integrationId}`, { headers });
      setSuccess("Integration deleted successfully");
      fetchIntegrations();
    } catch (err: any) {
      setError("Failed to delete integration");
    }
  };

  const updateNotificationTypes = async (integrationId: string, types: string[]) => {
    try {
      await axios.patch(
        `${API_URL}/api/integrations/${integrationId}`,
        { notificationTypes: types },
        { headers }
      );
      fetchIntegrations();
      setSuccess("Notification types updated");
    } catch (err: any) {
      setError("Failed to update notification types");
    }
  };

  const slackIntegration = integrations.find((i) => i.type === "slack");
  const teamsIntegration = integrations.find((i) => i.type === "teams");

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-600 mt-2">
          Connect Slack and Microsoft Teams to receive real-time notifications
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">
            &times;
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
          <button onClick={() => setSuccess(null)} className="float-right font-bold">
            &times;
          </button>
        </div>
      )}

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("setup")}
            className={`${
              activeTab === "setup"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium`}
          >
            Setup
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`${
              activeTab === "logs"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium`}
          >
            Activity Logs
          </button>
        </nav>
      </div>

      {activeTab === "setup" && (
        <div className="space-y-6">
          {/* Slack Integration */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xl font-bold">#</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Slack</h3>
                    <p className="text-sm text-gray-600">
                      {slackIntegration ? "Connected" : "Not connected"}
                    </p>
                  </div>
                </div>
                {slackIntegration ? (
                  <button
                    onClick={() => toggleIntegration(slackIntegration.id, slackIntegration.enabled)}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      slackIntegration.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {slackIntegration.enabled ? "Enabled" : "Disabled"}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSlackSetup(!showSlackSetup)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Connect Slack
                  </button>
                )}
              </div>

              {slackIntegration && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Channel:</strong> {slackIntegration.channel_name || "Default"}
                    </p>
                    {slackIntegration.stats && (
                      <div className="mt-2 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Total</p>
                          <p className="text-lg font-semibold">
                            {slackIntegration.stats.total_notifications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Successful</p>
                          <p className="text-lg font-semibold text-green-600">
                            {slackIntegration.stats.successful_notifications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Failed</p>
                          <p className="text-lg font-semibold text-red-600">
                            {slackIntegration.stats.failed_notifications}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Notification Types</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {allNotificationTypes.map((type) => (
                        <label key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={slackIntegration.notification_types.includes(type)}
                            onChange={(e) => {
                              const newTypes = e.target.checked
                                ? [...slackIntegration.notification_types, type]
                                : slackIntegration.notification_types.filter((t) => t !== type);
                              updateNotificationTypes(slackIntegration.id, newTypes);
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">
                            {notificationTypeLabels[type]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => testIntegration(slackIntegration.id)}
                      disabled={testingId === slackIntegration.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {testingId === slackIntegration.id ? "Testing..." : "Test Connection"}
                    </button>
                    <button
                      onClick={() => deleteIntegration(slackIntegration.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {showSlackSetup && !slackIntegration && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Webhook URL
                    </label>
                    <input
                      type="url"
                      value={slackWebhook}
                      onChange={(e) => setSlackWebhook(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Create an incoming webhook in your Slack workspace
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Channel Name (optional)
                    </label>
                    <input
                      type="text"
                      value={slackChannel}
                      onChange={(e) => setSlackChannel(e.target.value)}
                      placeholder="#general"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notification Types
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {allNotificationTypes.map((type) => (
                        <label key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={slackNotifications.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSlackNotifications([...slackNotifications, type]);
                              } else {
                                setSlackNotifications(slackNotifications.filter((t) => t !== type));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">
                            {notificationTypeLabels[type]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={createSlackIntegration}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Integration
                    </button>
                    <button
                      onClick={() => setShowSlackSetup(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Microsoft Teams Integration */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">T</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Microsoft Teams</h3>
                    <p className="text-sm text-gray-600">
                      {teamsIntegration ? "Connected" : "Not connected"}
                    </p>
                  </div>
                </div>
                {teamsIntegration ? (
                  <button
                    onClick={() => toggleIntegration(teamsIntegration.id, teamsIntegration.enabled)}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      teamsIntegration.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {teamsIntegration.enabled ? "Enabled" : "Disabled"}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowTeamsSetup(!showTeamsSetup)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Connect Teams
                  </button>
                )}
              </div>

              {teamsIntegration && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">
                      <strong>Channel:</strong> {teamsIntegration.channel_name || "Default"}
                    </p>
                    {teamsIntegration.stats && (
                      <div className="mt-2 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Total</p>
                          <p className="text-lg font-semibold">
                            {teamsIntegration.stats.total_notifications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Successful</p>
                          <p className="text-lg font-semibold text-green-600">
                            {teamsIntegration.stats.successful_notifications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Failed</p>
                          <p className="text-lg font-semibold text-red-600">
                            {teamsIntegration.stats.failed_notifications}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Notification Types</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {allNotificationTypes.map((type) => (
                        <label key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={teamsIntegration.notification_types.includes(type)}
                            onChange={(e) => {
                              const newTypes = e.target.checked
                                ? [...teamsIntegration.notification_types, type]
                                : teamsIntegration.notification_types.filter((t) => t !== type);
                              updateNotificationTypes(teamsIntegration.id, newTypes);
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">
                            {notificationTypeLabels[type]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => testIntegration(teamsIntegration.id)}
                      disabled={testingId === teamsIntegration.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {testingId === teamsIntegration.id ? "Testing..." : "Test Connection"}
                    </button>
                    <button
                      onClick={() => deleteIntegration(teamsIntegration.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {showTeamsSetup && !teamsIntegration && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Webhook URL
                    </label>
                    <input
                      type="url"
                      value={teamsWebhook}
                      onChange={(e) => setTeamsWebhook(e.target.value)}
                      placeholder="https://...webhook.office.com/..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Create an incoming webhook in your Teams channel
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Channel Name (optional)
                    </label>
                    <input
                      type="text"
                      value={teamsChannel}
                      onChange={(e) => setTeamsChannel(e.target.value)}
                      placeholder="General"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notification Types
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {allNotificationTypes.map((type) => (
                        <label key={type} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={teamsNotifications.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTeamsNotifications([...teamsNotifications, type]);
                              } else {
                                setTeamsNotifications(teamsNotifications.filter((t) => t !== type));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">
                            {notificationTypeLabels[type]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={createTeamsIntegration}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Save Integration
                    </button>
                    <button
                      onClick={() => setShowTeamsSetup(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Notifications</h3>
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No notifications sent yet</p>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg border ${
                      log.success
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">
                            {log.integration_type === "slack" ? "Slack" : "Microsoft Teams"}
                          </span>
                          {log.channel_name && (
                            <span className="text-sm text-gray-600">#{log.channel_name}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {notificationTypeLabels[log.notification_type] || log.notification_type}
                        </p>
                        {!log.success && log.error_message && (
                          <p className="text-xs text-red-600 mt-1">{log.error_message}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            log.success
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {log.success ? "Sent" : "Failed"}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(log.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
