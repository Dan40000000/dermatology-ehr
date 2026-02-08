import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../utils/apiBase";
import "../App.css";

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  changes: any;
  metadata: any;
  severity: string;
  status: string;
  createdAt: string;
}

interface AuditSummary {
  totalEvents: number;
  uniqueUsers: number;
  failedLogins: number;
  resourceAccesses: number;
  actionBreakdown: { action: string; count: string }[];
  resourceBreakdown: { resourceType: string; count: string }[];
}

interface User {
  id: string;
  fullName: string;
  email: string;
}

const TENANT_HEADER_NAME = "x-tenant-id";

export function AuditLogPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [userActivityModal, setUserActivityModal] = useState<{
    userId: string;
    userName: string;
    logs: any[];
  } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    userId: "",
    action: "",
    resourceType: "",
    resourceId: "",
    startDate: "",
    endDate: "",
    ipAddress: "",
    severity: "",
    status: "",
    search: "",
  });

  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchUsers = async () => {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  const fetchLogs = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });

      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value);
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/audit?${params}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }

      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/audit/summary`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch audit summary");
      }

      const data = await response.json();
      setSummary(data);
    } catch (err: any) {
      console.error("Error fetching summary:", err);
    }
  };

  const fetchUserActivity = async (userId: string, userName: string) => {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/audit/user/${userId}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user activity");
      }

      const data = await response.json();
      setUserActivityModal({ userId, userName, logs: data.logs || [] });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const exportAuditLog = async () => {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/audit/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify({ filters }),
      });

      if (!response.ok) {
        throw new Error("Failed to export audit log");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = `Audit_Log_${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const clearFilters = () => {
    setFilters({
      userId: "",
      action: "",
      resourceType: "",
      resourceId: "",
      startDate: "",
      endDate: "",
      ipAddress: "",
      severity: "",
      status: "",
      search: "",
    });
    setPage(0);
  };

  useEffect(() => {
    if (session) {
      fetchUsers();
      fetchLogs();
      fetchSummary();
    }
  }, [page, session]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchLogs();
        fetchSummary();
      }, 30000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, page, filters]);

  const getActionBadgeColor = (action: string): string => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes("login") && !actionLower.includes("failed")) return "#3b82f6";
    if (actionLower.includes("logout")) return "#3b82f6";
    if (actionLower.includes("create")) return "#10b981";
    if (actionLower.includes("update")) return "#f59e0b";
    if (actionLower.includes("delete")) return "#ef4444";
    if (actionLower.includes("view") || actionLower.includes("download")) return "#6b7280";
    if (actionLower.includes("export")) return "#f97316";
    if (actionLower.includes("failed")) return "#dc2626";
    return "#8b5cf6";
  };

  const getSeverityBadgeColor = (severity: string): string => {
    switch (severity) {
      case "critical":
        return "#dc2626";
      case "error":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(date);
  };

  const isSuspicious = (log: AuditLog): boolean => {
    if (log.action === "failed_login") return true;
    if (log.severity === "critical" || log.severity === "error") return true;
    return false;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!session) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.875rem", fontWeight: 700, color: "#1f2937", marginBottom: "0.5rem" }}>
          Audit Log Viewer
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          HIPAA-compliant audit trail and security monitoring
        </p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
          <div style={{
            background: "white",
            padding: "1.5rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "#3b82f6" }}>{summary.totalEvents}</div>
            <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>Total Events (Today)</div>
          </div>
          <div style={{
            background: "white",
            padding: "1.5rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "#10b981" }}>{summary.uniqueUsers}</div>
            <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>Unique Users (Today)</div>
          </div>
          <div style={{
            background: "white",
            padding: "1.5rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: summary.failedLogins > 0 ? "#ef4444" : "#6b7280" }}>
              {summary.failedLogins}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>Failed Logins (Today)</div>
          </div>
          <div style={{
            background: "white",
            padding: "1.5rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "#8b5cf6" }}>{summary.resourceAccesses}</div>
            <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>Resource Accesses (Today)</div>
          </div>
        </div>
      )}

      {/* Filter Panel */}
      <div style={{
        background: "white",
        padding: "1.5rem",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
        marginBottom: "1.5rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#1f2937" }}>Filters</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={clearFilters}
              style={{
                padding: "0.5rem 1rem",
                background: "white",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Clear Filters
            </button>
            <button
              onClick={fetchLogs}
              style={{
                padding: "0.5rem 1rem",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Apply Filters
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.25rem" }}>
              User
            </label>
            <select
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            >
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.25rem" }}>
              Action
            </label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            >
              <option value="">All Actions</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="failed_login">Failed Login</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="view">View</option>
              <option value="download">Download</option>
              <option value="export">Export</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.25rem" }}>
              Resource Type
            </label>
            <select
              value={filters.resourceType}
              onChange={(e) => setFilters({ ...filters, resourceType: e.target.value })}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            >
              <option value="">All Types</option>
              <option value="patient">Patient</option>
              <option value="encounter">Encounter</option>
              <option value="document">Document</option>
              <option value="user">User</option>
              <option value="appointment">Appointment</option>
              <option value="audit_log">Audit Log</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.25rem" }}>
              Resource ID
            </label>
            <input
              type="text"
              value={filters.resourceId}
              onChange={(e) => setFilters({ ...filters, resourceId: e.target.value })}
              placeholder="Resource ID"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.25rem" }}>
              Start Date
            </label>
            <input
              type="datetime-local"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.25rem" }}>
              End Date
            </label>
            <input
              type="datetime-local"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.25rem" }}>
              IP Address
            </label>
            <input
              type="text"
              value={filters.ipAddress}
              onChange={(e) => setFilters({ ...filters, ipAddress: e.target.value })}
              placeholder="192.168.1.1"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.25rem" }}>
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search all fields..."
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            />
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={fetchLogs}
            style={{
              padding: "0.5rem 1rem",
              background: "white",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Refresh Now
          </button>
        </div>

        {session.user.role === "admin" && (
          <button
            onClick={exportAuditLog}
            style={{
              padding: "0.5rem 1rem",
              background: "#f97316",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Export to CSV
          </button>
        )}
      </div>

      {/* Audit Log Table */}
      {error && (
        <div style={{
          background: "#fee2e2",
          color: "#dc2626",
          padding: "1rem",
          borderRadius: "6px",
          marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: "white",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
        overflow: "hidden",
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <tr>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                  Timestamp
                </th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                  User
                </th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                  Action
                </th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                  Resource
                </th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                  IP Address
                </th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                  Status
                </th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                    Loading audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: "1px solid #e5e7eb",
                        background: isSuspicious(log) ? "#fef2f2" : "white",
                        cursor: "pointer",
                      }}
                      onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    >
                      <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#374151" }}>
                        {formatDate(log.createdAt)}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                        <div style={{ fontWeight: 500, color: "#1f2937" }}>{log.userName || "System"}</div>
                        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{log.userEmail}</div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span style={{
                          padding: "0.25rem 0.75rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "white",
                          background: getActionBadgeColor(log.action),
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                        <div style={{ fontWeight: 500, color: "#1f2937" }}>{log.resourceType}</div>
                        {log.resourceId && (
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{log.resourceId}</div>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#374151" }}>
                        {log.ipAddress || "-"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span style={{
                          padding: "0.25rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          background: log.status === "success" ? "#d1fae5" : "#fee2e2",
                          color: log.status === "success" ? "#065f46" : "#991b1b",
                        }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchUserActivity(log.userId, log.userName);
                          }}
                          style={{
                            padding: "0.25rem 0.75rem",
                            background: "#ede9fe",
                            color: "#5b21b6",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          View Activity
                        </button>
                      </td>
                    </tr>
                    {expandedRow === log.id && (
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        <td colSpan={7} style={{ padding: "1rem" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
                            <div>
                              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.5rem" }}>
                                USER AGENT
                              </div>
                              <div style={{ fontSize: "0.875rem", color: "#374151", wordBreak: "break-word" }}>
                                {log.userAgent || "Not recorded"}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.5rem" }}>
                                SEVERITY
                              </div>
                              <span style={{
                                padding: "0.25rem 0.75rem",
                                borderRadius: "9999px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                color: "white",
                                background: getSeverityBadgeColor(log.severity),
                              }}>
                                {log.severity}
                              </span>
                            </div>
                            {log.changes && (
                              <div style={{ gridColumn: "1 / -1" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.5rem" }}>
                                  CHANGES
                                </div>
                                <pre style={{
                                  background: "#1f2937",
                                  color: "#10b981",
                                  padding: "1rem",
                                  borderRadius: "6px",
                                  fontSize: "0.75rem",
                                  overflow: "auto",
                                  maxHeight: "300px",
                                }}>
                                  {JSON.stringify(log.changes, null, 2)}
                                </pre>
                                <button
                                  onClick={() => copyToClipboard(JSON.stringify(log.changes, null, 2))}
                                  style={{
                                    marginTop: "0.5rem",
                                    padding: "0.5rem 1rem",
                                    background: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem",
                                    cursor: "pointer",
                                  }}
                                >
                                  Copy to Clipboard
                                </button>
                              </div>
                            )}
                            {log.metadata && (
                              <div style={{ gridColumn: "1 / -1" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: "0.5rem" }}>
                                  METADATA
                                </div>
                                <pre style={{
                                  background: "#1f2937",
                                  color: "#f59e0b",
                                  padding: "1rem",
                                  borderRadius: "6px",
                                  fontSize: "0.75rem",
                                  overflow: "auto",
                                  maxHeight: "300px",
                                }}>
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem",
          borderTop: "1px solid #e5e7eb",
          background: "#f9fafb",
        }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
            Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              style={{
                padding: "0.5rem 1rem",
                background: page === 0 ? "#f3f4f6" : "white",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: page === 0 ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={(page + 1) * limit >= total}
              style={{
                padding: "0.5rem 1rem",
                background: (page + 1) * limit >= total ? "#f3f4f6" : "white",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "0.875rem",
                cursor: (page + 1) * limit >= total ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* User Activity Modal */}
      {userActivityModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "white",
            borderRadius: "8px",
            maxWidth: "900px",
            width: "90%",
            maxHeight: "80vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}>
            <div style={{
              padding: "1.5rem",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#1f2937" }}>
                  User Activity Timeline
                </h2>
                <p style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                  {userActivityModal.userName}
                </p>
              </div>
              <button
                onClick={() => setUserActivityModal(null)}
                style={{
                  padding: "0.5rem 1rem",
                  background: "white",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "1.5rem" }}>
              <div style={{ position: "relative" }}>
                {userActivityModal.logs.map((activityLog, idx) => (
                  <div key={activityLog.id} style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        background: getActionBadgeColor(activityLog.action),
                      }} />
                      {idx < userActivityModal.logs.length - 1 && (
                        <div style={{ width: "2px", flex: 1, background: "#e5e7eb", minHeight: "40px" }} />
                      )}
                    </div>
                    <div style={{ flex: 1, paddingBottom: "1rem" }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1f2937" }}>
                        {activityLog.action} - {activityLog.resourceType}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
                        {formatDate(activityLog.createdAt)}
                      </div>
                      {activityLog.resourceId && (
                        <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
                          Resource: {activityLog.resourceId}
                        </div>
                      )}
                      {activityLog.ipAddress && (
                        <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
                          IP: {activityLog.ipAddress}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {userActivityModal.logs.length === 0 && (
                  <div style={{ textAlign: "center", color: "#6b7280", padding: "2rem" }}>
                    No activity found for this user
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
