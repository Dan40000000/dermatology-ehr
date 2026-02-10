import { useState } from "react";

export interface AccessLogEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  severity: string;
  accessedAt: string;
  isPHIAccess: boolean;
  isBreakGlass: boolean;
}

interface AccessLogTableProps {
  logs: AccessLogEntry[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onViewDetails?: (log: AccessLogEntry) => void;
}

export function AccessLogTable({
  logs,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onViewDetails
}: AccessLogTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  };

  const getActionColor = (action: string): string => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes("view")) return "#3b82f6";
    if (actionLower.includes("export")) return "#f97316";
    if (actionLower.includes("download")) return "#8b5cf6";
    if (actionLower.includes("print")) return "#06b6d4";
    return "#6b7280";
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case "admin": return "#dc2626";
      case "provider": return "#3b82f6";
      case "ma": return "#10b981";
      case "front_desk": return "#f59e0b";
      default: return "#6b7280";
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{
      background: "white",
      borderRadius: "8px",
      border: "1px solid #e5e7eb",
      overflow: "hidden"
    }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            <tr>
              <th style={headerStyle}>Timestamp</th>
              <th style={headerStyle}>User</th>
              <th style={headerStyle}>Action</th>
              <th style={headerStyle}>Resource</th>
              <th style={headerStyle}>IP Address</th>
              <th style={headerStyle}>Flags</th>
              <th style={headerStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                  Loading access logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                  No access logs found for the selected criteria
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      background: log.isBreakGlass ? "#fef2f2" : "white",
                      cursor: "pointer"
                    }}
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                  >
                    <td style={cellStyle}>{formatDate(log.accessedAt)}</td>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 500, color: "#1f2937" }}>{log.userName}</div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        <span style={{
                          padding: "0.125rem 0.375rem",
                          borderRadius: "4px",
                          background: getRoleColor(log.userRole) + "20",
                          color: getRoleColor(log.userRole),
                          fontSize: "0.625rem",
                          fontWeight: 600,
                          textTransform: "uppercase"
                        }}>
                          {log.userRole}
                        </span>
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <span style={{
                        padding: "0.25rem 0.75rem",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "white",
                        background: getActionColor(log.action)
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 500, color: "#1f2937" }}>{log.resourceType}</div>
                      {log.resourceId && (
                        <div style={{ fontSize: "0.75rem", color: "#6b7280", fontFamily: "monospace" }}>
                          {log.resourceId.length > 12 ? `${log.resourceId.substring(0, 12)}...` : log.resourceId}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {log.ipAddress || "-"}
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        {log.isPHIAccess && (
                          <span style={{
                            padding: "0.125rem 0.375rem",
                            borderRadius: "4px",
                            background: "#fef3c7",
                            color: "#92400e",
                            fontSize: "0.625rem",
                            fontWeight: 600
                          }}>
                            PHI
                          </span>
                        )}
                        {log.isBreakGlass && (
                          <span style={{
                            padding: "0.125rem 0.375rem",
                            borderRadius: "4px",
                            background: "#fee2e2",
                            color: "#991b1b",
                            fontSize: "0.625rem",
                            fontWeight: 600
                          }}>
                            BREAK GLASS
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={cellStyle}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails?.(log);
                        }}
                        style={{
                          padding: "0.25rem 0.75rem",
                          background: "#ede9fe",
                          color: "#5b21b6",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          cursor: "pointer"
                        }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                  {expandedRow === log.id && (
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <td colSpan={7} style={{ padding: "1rem" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                          <div>
                            <div style={labelStyle}>USER EMAIL</div>
                            <div style={valueStyle}>{log.userEmail}</div>
                          </div>
                          <div>
                            <div style={labelStyle}>SEVERITY</div>
                            <div style={valueStyle}>{log.severity}</div>
                          </div>
                          <div>
                            <div style={labelStyle}>FULL RESOURCE ID</div>
                            <div style={{ ...valueStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
                              {log.resourceId || "-"}
                            </div>
                          </div>
                          {log.userAgent && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <div style={labelStyle}>USER AGENT</div>
                              <div style={{ ...valueStyle, wordBreak: "break-word", fontSize: "0.75rem" }}>
                                {log.userAgent}
                              </div>
                            </div>
                          )}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <div style={labelStyle}>METADATA</div>
                              <pre style={{
                                background: "#1f2937",
                                color: "#10b981",
                                padding: "0.75rem",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                overflow: "auto",
                                maxHeight: "200px",
                                margin: 0
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
        background: "#f9fafb"
      }}>
        <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
            style={{
              ...paginationButtonStyle,
              opacity: page === 0 ? 0.5 : 1,
              cursor: page === 0 ? "not-allowed" : "pointer"
            }}
          >
            Previous
          </button>
          <span style={{ padding: "0.5rem", fontSize: "0.875rem", color: "#374151" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            style={{
              ...paginationButtonStyle,
              opacity: page >= totalPages - 1 ? 0.5 : 1,
              cursor: page >= totalPages - 1 ? "not-allowed" : "pointer"
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase"
};

const cellStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  fontSize: "0.875rem",
  color: "#374151"
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: "0.25rem"
};

const valueStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#374151"
};

const paginationButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  background: "white",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.875rem"
};
