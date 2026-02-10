import { useState } from "react";

export interface ChangeLogEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  severity: string;
  status: string;
  changedAt: string;
}

interface ChangeLogTableProps {
  logs: ChangeLogEntry[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onViewDetails?: (log: ChangeLogEntry) => void;
}

export function ChangeLogTable({
  logs,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onViewDetails
}: ChangeLogTableProps) {
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
    switch (action.toLowerCase()) {
      case "create": return "#10b981";
      case "update": return "#f59e0b";
      case "delete": return "#ef4444";
      case "patch": return "#8b5cf6";
      default: return "#6b7280";
    }
  };

  const getActionIcon = (action: string): string => {
    switch (action.toLowerCase()) {
      case "create": return "+";
      case "update": return "~";
      case "delete": return "-";
      case "patch": return "*";
      default: return "?";
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const renderChangeDiff = (changes: ChangeLogEntry["changes"]) => {
    if (!changes) return null;

    const { before, after } = changes;
    const allKeys = new Set([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {})
    ]);

    if (allKeys.size === 0) return null;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <div style={labelStyle}>BEFORE</div>
          <pre style={diffStyle("#fee2e2", "#991b1b")}>
            {before ? JSON.stringify(before, null, 2) : "N/A"}
          </pre>
        </div>
        <div>
          <div style={labelStyle}>AFTER</div>
          <pre style={diffStyle("#d1fae5", "#065f46")}>
            {after ? JSON.stringify(after, null, 2) : "N/A"}
          </pre>
        </div>
      </div>
    );
  };

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
              <th style={headerStyle}>Status</th>
              <th style={headerStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                  Loading change logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                  No change logs found for the selected criteria
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      background: log.action === "delete" ? "#fef2f2" : "white",
                      cursor: "pointer"
                    }}
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                  >
                    <td style={cellStyle}>{formatDate(log.changedAt)}</td>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 500, color: "#1f2937" }}>{log.userName}</div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{log.userEmail}</div>
                    </td>
                    <td style={cellStyle}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        padding: "0.25rem 0.75rem",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "white",
                        background: getActionColor(log.action)
                      }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
                          {getActionIcon(log.action)}
                        </span>
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
                    <td style={cellStyle}>
                      <span style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        background: log.status === "success" ? "#d1fae5" : "#fee2e2",
                        color: log.status === "success" ? "#065f46" : "#991b1b"
                      }}>
                        {log.status}
                      </span>
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
                        View Diff
                      </button>
                    </td>
                  </tr>
                  {expandedRow === log.id && (
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      <td colSpan={6} style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
                            <div>
                              <div style={labelStyle}>FULL RESOURCE ID</div>
                              <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#374151" }}>
                                {log.resourceId || "-"}
                              </div>
                            </div>
                            <div>
                              <div style={labelStyle}>IP ADDRESS</div>
                              <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#374151" }}>
                                {log.ipAddress || "-"}
                              </div>
                            </div>
                            <div>
                              <div style={labelStyle}>SEVERITY</div>
                              <div style={{ fontSize: "0.875rem", color: "#374151" }}>{log.severity}</div>
                            </div>
                            <div>
                              <div style={labelStyle}>USER ROLE</div>
                              <div style={{ fontSize: "0.875rem", color: "#374151" }}>{log.userRole}</div>
                            </div>
                          </div>
                          {log.changes && renderChangeDiff(log.changes)}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div>
                              <div style={labelStyle}>METADATA</div>
                              <pre style={{
                                background: "#1f2937",
                                color: "#f59e0b",
                                padding: "0.75rem",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                overflow: "auto",
                                maxHeight: "150px",
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

const paginationButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  background: "white",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "0.875rem"
};

const diffStyle = (bg: string, color: string): React.CSSProperties => ({
  background: bg,
  color: color,
  padding: "0.75rem",
  borderRadius: "6px",
  fontSize: "0.75rem",
  overflow: "auto",
  maxHeight: "200px",
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
});
