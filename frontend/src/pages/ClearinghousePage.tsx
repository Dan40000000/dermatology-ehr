import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchClaims,
  submitClaimToClearinghouse,
  fetchClaimStatus,
  fetchRemittanceAdvice,
  fetchERADetails,
  postERA,
  fetchEFTTransactions,
  reconcilePayments,
  fetchClosingReport,
} from "../api";

export function ClearinghousePage() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<"submit" | "era" | "eft" | "reconcile" | "reports">("submit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Submit Claims Tab
  const [claims, setClaims] = useState<any[]>([]);
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [claimStatusMap, setClaimStatusMap] = useState<Map<string, any>>(new Map());

  // ERA Tab
  const [eras, setEras] = useState<any[]>([]);
  const [selectedERA, setSelectedERA] = useState<any | null>(null);
  const [eraDetails, setEraDetails] = useState<any | null>(null);
  const [eraFilters, setEraFilters] = useState({ status: "", payer: "" });

  // EFT Tab
  const [efts, setEfts] = useState<any[]>([]);
  const [eftFilters, setEftFilters] = useState({ reconciled: "", payer: "" });

  // Reconciliation Tab
  const [selectedERAForReconcile, setSelectedERAForReconcile] = useState("");
  const [selectedEFT, setSelectedEFT] = useState("");
  const [reconcileNotes, setReconcileNotes] = useState("");

  // Reports Tab
  const [reportData, setReportData] = useState<any | null>(null);
  const [reportDates, setReportDates] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    reportType: "daily",
  });

  useEffect(() => {
    loadInitialData();
  }, [activeTab]);

  const loadInitialData = async () => {
    if (!session) return;

    setLoading(true);
    setError(null);
    try {
      if (activeTab === "submit") {
        const result = await fetchClaims(session.tenantId, session.accessToken, { status: "ready" });
        setClaims(result.claims || []);
      } else if (activeTab === "era") {
        const result = await fetchRemittanceAdvice(session.tenantId, session.accessToken, eraFilters);
        setEras(result.eras || []);
      } else if (activeTab === "eft") {
        const result = await fetchEFTTransactions(session.tenantId, session.accessToken, {
          reconciled: eftFilters.reconciled === "" ? undefined : eftFilters.reconciled === "true",
        });
        setEfts(result.efts || []);
      } else if (activeTab === "reconcile") {
        // Load both ERAs and EFTs for reconciliation
        const eraResult = await fetchRemittanceAdvice(session.tenantId, session.accessToken, { status: "posted" });
        setEras(eraResult.eras || []);
        const eftResult = await fetchEFTTransactions(session.tenantId, session.accessToken, { reconciled: false });
        setEfts(eftResult.efts || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitClaims = async () => {
    if (!session) return;
    if (selectedClaims.size === 0) {
      setError("Please select at least one claim to submit");
      return;
    }

    setLoading(true);
    setError(null);
    const results = new Map();

    for (const claimId of Array.from(selectedClaims)) {
      try {
        const result = await submitClaimToClearinghouse(session.tenantId, session.accessToken, claimId);
        results.set(claimId, result);
      } catch (err: any) {
        results.set(claimId, { error: err.message });
      }
    }

    setClaimStatusMap(results);
    setSuccess(`Submitted ${selectedClaims.size} claim(s) to clearinghouse`);
    setSelectedClaims(new Set());
    setLoading(false);
    loadInitialData();
  };

  const handleCheckClaimStatus = async (claimId: string) => {
    if (!session) return;
    try {
      const status = await fetchClaimStatus(session.tenantId, session.accessToken, claimId);
      setClaimStatusMap(new Map(claimStatusMap.set(claimId, status)));
      setSuccess("Status updated");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleViewERADetails = async (eraId: string) => {
    if (!session) return;
    setLoading(true);
    try {
      const details = await fetchERADetails(session.tenantId, session.accessToken, eraId);
      setEraDetails(details);
      setSelectedERA(eras.find((e) => e.id === eraId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePostERA = async (eraId: string) => {
    if (!session) return;
    if (!confirm("Post this ERA to claims? This will create payments.")) return;

    setLoading(true);
    try {
      const result = await postERA(session.tenantId, session.accessToken, eraId);
      setSuccess(`Posted ERA successfully. ${result.claimsPosted} claims updated.`);
      loadInitialData();
      setEraDetails(null);
      setSelectedERA(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!session) return;
    if (!selectedERAForReconcile) {
      setError("Please select an ERA to reconcile");
      return;
    }

    setLoading(true);
    try {
      const result = await reconcilePayments(session.tenantId, session.accessToken, {
        eraId: selectedERAForReconcile,
        eftId: selectedEFT || undefined,
        notes: reconcileNotes || undefined,
      });

      setSuccess(
        result.status === "balanced"
          ? "Payment reconciled successfully (balanced)"
          : `Payment reconciled with variance: $${(Math.abs(result.varianceCents) / 100).toFixed(2)}`
      );

      setSelectedERAForReconcile("");
      setSelectedEFT("");
      setReconcileNotes("");
      loadInitialData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const report = await fetchClosingReport(session.tenantId, session.accessToken, reportDates);
      setReportData(report);
      setSuccess("Report generated");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((header) => {
          const value = row[header];
          return typeof value === "string" && value.includes(",") ? `"${value}"` : value;
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem", fontSize: "2rem", fontWeight: 700 }}>Clearinghouse & Payment Management</h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem" }}>
        Submit claims, process remittance advice, track payments, and reconcile transactions
      </p>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "2px solid #e5e7eb", marginBottom: "2rem" }}>
        {[
          { key: "submit", label: "Submit Claims" },
          { key: "era", label: "ERA" },
          { key: "eft", label: "EFT" },
          { key: "reconcile", label: "Reconciliation" },
          { key: "reports", label: "Reports" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: "0.75rem 1.5rem",
              border: "none",
              background: "transparent",
              borderBottom: activeTab === tab.key ? "3px solid #3b82f6" : "3px solid transparent",
              color: activeTab === tab.key ? "#3b82f6" : "#6b7280",
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: "pointer",
              fontSize: "0.9375rem",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div
          style={{
            padding: "1rem",
            background: "#fee2e2",
            color: "#dc2626",
            borderRadius: "8px",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              float: "right",
              background: "transparent",
              border: "none",
              color: "#dc2626",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div
          style={{
            padding: "1rem",
            background: "#d1fae5",
            color: "#065f46",
            borderRadius: "8px",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {success}
          <button
            onClick={() => setSuccess(null)}
            style={{
              float: "right",
              background: "transparent",
              border: "none",
              color: "#065f46",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Submit Claims Tab */}
      {activeTab === "submit" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Ready to Submit ({claims.length})</h2>
            <button
              onClick={handleSubmitClaims}
              disabled={selectedClaims.size === 0 || loading}
              style={{
                padding: "0.75rem 1.5rem",
                background: selectedClaims.size > 0 ? "#3b82f6" : "#e5e7eb",
                color: selectedClaims.size > 0 ? "white" : "#9ca3af",
                border: "none",
                borderRadius: "8px",
                cursor: selectedClaims.size > 0 ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              Submit {selectedClaims.size > 0 ? `(${selectedClaims.size})` : ""} to Clearinghouse
            </button>
          </div>

          <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <tr>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedClaims(new Set(claims.map((c) => c.id)));
                        } else {
                          setSelectedClaims(new Set());
                        }
                      }}
                      checked={selectedClaims.size === claims.length && claims.length > 0}
                    />
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    CLAIM #
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    PATIENT
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    PAYER
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    AMOUNT
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    STATUS
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {claims.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#9ca3af" }}>
                      No claims ready to submit
                    </td>
                  </tr>
                )}
                {claims.map((claim) => {
                  const status = claimStatusMap.get(claim.id);
                  return (
                    <tr key={claim.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.75rem" }}>
                        <input
                          type="checkbox"
                          checked={selectedClaims.has(claim.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedClaims);
                            if (e.target.checked) {
                              newSet.add(claim.id);
                            } else {
                              newSet.delete(claim.id);
                            }
                            setSelectedClaims(newSet);
                          }}
                        />
                      </td>
                      <td style={{ padding: "0.75rem", fontWeight: 500 }}>{claim.claimNumber}</td>
                      <td style={{ padding: "0.75rem" }}>
                        {claim.patientFirstName} {claim.patientLastName}
                      </td>
                      <td style={{ padding: "0.75rem" }}>{claim.payer || "—"}</td>
                      <td style={{ padding: "0.75rem" }}>${((claim.totalCents || 0) / 100).toFixed(2)}</td>
                      <td style={{ padding: "0.75rem" }}>
                        {status ? (
                          <span
                            style={{
                              padding: "0.25rem 0.75rem",
                              borderRadius: "12px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              background: status.status === "accepted" ? "#d1fae5" : status.status === "rejected" ? "#fee2e2" : "#fef3c7",
                              color: status.status === "accepted" ? "#065f46" : status.status === "rejected" ? "#dc2626" : "#92400e",
                            }}
                          >
                            {status.status}
                          </span>
                        ) : (
                          <span style={{ color: "#6b7280" }}>{claim.status}</span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <button
                          onClick={() => handleCheckClaimStatus(claim.id)}
                          style={{
                            padding: "0.5rem 1rem",
                            background: "transparent",
                            border: "1px solid #e5e7eb",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                          }}
                        >
                          Check Status
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Submission Timeline */}
          {claimStatusMap.size > 0 && (
            <div style={{ marginTop: "2rem", background: "white", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Submission Timeline</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {Array.from(claimStatusMap.entries()).map(([claimId, status]) => (
                  <div key={claimId} style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <div
                      style={{
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        background: status.status === "accepted" ? "#10b981" : status.status === "rejected" ? "#ef4444" : "#f59e0b",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>
                        {claims.find((c) => c.id === claimId)?.claimNumber || claimId}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                        {status.message || status.status} {status.controlNumber && `• Control: ${status.controlNumber}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ERA Tab */}
      {activeTab === "era" && (
        <div>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <select
              value={eraFilters.status}
              onChange={(e) => setEraFilters({ ...eraFilters, status: e.target.value })}
              style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid #e5e7eb" }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="posted">Posted</option>
              <option value="reconciled">Reconciled</option>
            </select>
            <input
              type="text"
              placeholder="Filter by payer..."
              value={eraFilters.payer}
              onChange={(e) => setEraFilters({ ...eraFilters, payer: e.target.value })}
              style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #e5e7eb", flex: 1, minWidth: "200px" }}
            />
            <button
              onClick={loadInitialData}
              style={{
                padding: "0.5rem 1.5rem",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Apply Filters
            </button>
            <button
              onClick={() => exportToCSV(eras, "eras")}
              style={{
                padding: "0.5rem 1.5rem",
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: eraDetails ? "1fr 1fr" : "1fr", gap: "1rem" }}>
            <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <tr>
                    <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                      ERA #
                    </th>
                    <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                      PAYER
                    </th>
                    <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                      AMOUNT
                    </th>
                    <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                      CLAIMS
                    </th>
                    <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                      STATUS
                    </th>
                    <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eras.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#9ca3af" }}>
                        No remittance advice found
                      </td>
                    </tr>
                  )}
                  {eras.map((era) => (
                    <tr key={era.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.75rem", fontWeight: 500 }}>{era.eraNumber}</td>
                      <td style={{ padding: "0.75rem" }}>{era.payer}</td>
                      <td style={{ padding: "0.75rem" }}>${((era.paymentAmountCents || 0) / 100).toFixed(2)}</td>
                      <td style={{ padding: "0.75rem" }}>{era.claimsPaid || 0}</td>
                      <td style={{ padding: "0.75rem" }}>
                        <span
                          style={{
                            padding: "0.25rem 0.75rem",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: era.status === "posted" ? "#d1fae5" : era.status === "reconciled" ? "#dbeafe" : "#fef3c7",
                            color: era.status === "posted" ? "#065f46" : era.status === "reconciled" ? "#1e40af" : "#92400e",
                          }}
                        >
                          {era.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <button
                          onClick={() => handleViewERADetails(era.id)}
                          style={{
                            padding: "0.5rem 1rem",
                            background: "transparent",
                            border: "1px solid #e5e7eb",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            marginRight: "0.5rem",
                          }}
                        >
                          View
                        </button>
                        {era.status === "pending" && (
                          <button
                            onClick={() => handlePostERA(era.id)}
                            style={{
                              padding: "0.5rem 1rem",
                              background: "#3b82f6",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "0.875rem",
                            }}
                          >
                            Post
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ERA Details Panel */}
            {eraDetails && selectedERA && (
              <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 600 }}>ERA Details</h3>
                  <button
                    onClick={() => {
                      setEraDetails(null);
                      setSelectedERA(null);
                    }}
                    style={{ background: "transparent", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#6b7280" }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ marginBottom: "1.5rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.875rem" }}>
                    <div>
                      <div style={{ color: "#6b7280", marginBottom: "0.25rem" }}>ERA Number</div>
                      <div style={{ fontWeight: 600 }}>{selectedERA.eraNumber}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", marginBottom: "0.25rem" }}>Payer</div>
                      <div style={{ fontWeight: 600 }}>{selectedERA.payer}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", marginBottom: "0.25rem" }}>Payment Amount</div>
                      <div style={{ fontWeight: 600 }}>${((selectedERA.paymentAmountCents || 0) / 100).toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", marginBottom: "0.25rem" }}>Check Number</div>
                      <div style={{ fontWeight: 600 }}>{selectedERA.checkNumber || "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", marginBottom: "0.25rem" }}>Check Date</div>
                      <div style={{ fontWeight: 600 }}>{selectedERA.checkDate || "—"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", marginBottom: "0.25rem" }}>Claims Paid</div>
                      <div style={{ fontWeight: 600 }}>{selectedERA.claimsPaid || 0}</div>
                    </div>
                  </div>
                </div>

                <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem" }}>Claim Details</h4>
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {eraDetails.claims && eraDetails.claims.length > 0 ? (
                    eraDetails.claims.map((claim: any) => (
                      <div
                        key={claim.id}
                        style={{
                          padding: "0.75rem",
                          border: "1px solid #f3f4f6",
                          borderRadius: "8px",
                          marginBottom: "0.5rem",
                          fontSize: "0.875rem",
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{claim.claimNumber}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", color: "#6b7280" }}>
                          <div>Charge: ${((claim.chargeAmountCents || 0) / 100).toFixed(2)}</div>
                          <div>Paid: ${((claim.paidAmountCents || 0) / 100).toFixed(2)}</div>
                          <div>Adjustment: ${((claim.adjustmentAmountCents || 0) / 100).toFixed(2)}</div>
                          <div>
                            Status: <span style={{ fontWeight: 600 }}>{claim.status}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#9ca3af", textAlign: "center", padding: "1rem" }}>No claim details available</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EFT Tab */}
      {activeTab === "eft" && (
        <div>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <select
              value={eftFilters.reconciled}
              onChange={(e) => setEftFilters({ ...eftFilters, reconciled: e.target.value })}
              style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid #e5e7eb" }}
            >
              <option value="">All</option>
              <option value="true">Reconciled</option>
              <option value="false">Unreconciled</option>
            </select>
            <input
              type="text"
              placeholder="Filter by payer..."
              value={eftFilters.payer}
              onChange={(e) => setEftFilters({ ...eftFilters, payer: e.target.value })}
              style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid #e5e7eb", flex: 1, minWidth: "200px" }}
            />
            <button
              onClick={loadInitialData}
              style={{
                padding: "0.5rem 1.5rem",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Apply Filters
            </button>
            <button
              onClick={() => exportToCSV(efts, "efts")}
              style={{
                padding: "0.5rem 1.5rem",
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
          </div>

          <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <tr>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    TRACE #
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    PAYER
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    AMOUNT
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    DEPOSIT DATE
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    TYPE
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    RECONCILED
                  </th>
                  <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280" }}>
                    VARIANCE
                  </th>
                </tr>
              </thead>
              <tbody>
                {efts.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#9ca3af" }}>
                      No EFT transactions found
                    </td>
                  </tr>
                )}
                {efts.map((eft) => (
                  <tr key={eft.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>{eft.eftTraceNumber}</td>
                    <td style={{ padding: "0.75rem" }}>{eft.payer}</td>
                    <td style={{ padding: "0.75rem" }}>${((eft.paymentAmountCents || 0) / 100).toFixed(2)}</td>
                    <td style={{ padding: "0.75rem" }}>{eft.depositDate}</td>
                    <td style={{ padding: "0.75rem" }}>{eft.transactionType || "—"}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <span
                        style={{
                          padding: "0.25rem 0.75rem",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background: eft.reconciled ? "#d1fae5" : "#fee2e2",
                          color: eft.reconciled ? "#065f46" : "#dc2626",
                        }}
                      >
                        {eft.reconciled ? "Yes" : "No"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {eft.varianceCents !== 0 && eft.varianceCents ? (
                        <span style={{ color: "#dc2626", fontWeight: 600 }}>
                          ${Math.abs(eft.varianceCents / 100).toFixed(2)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reconciliation Tab */}
      {activeTab === "reconcile" && (
        <div>
          <div
            style={{ background: "white", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "2rem", marginBottom: "2rem" }}
          >
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1.5rem" }}>Reconcile ERA with EFT</h3>

            <div style={{ display: "grid", gap: "1.5rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                  Select ERA to Reconcile *
                </label>
                <select
                  value={selectedERAForReconcile}
                  onChange={(e) => setSelectedERAForReconcile(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "0.9375rem",
                  }}
                >
                  <option value="">-- Select ERA --</option>
                  {eras.map((era) => (
                    <option key={era.id} value={era.id}>
                      {era.eraNumber} - {era.payer} - ${((era.paymentAmountCents || 0) / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                  Match with EFT (Optional)
                </label>
                <select
                  value={selectedEFT}
                  onChange={(e) => setSelectedEFT(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "0.9375rem",
                  }}
                >
                  <option value="">-- Select EFT (optional) --</option>
                  {efts
                    .filter((eft) => !eft.reconciled)
                    .map((eft) => (
                      <option key={eft.id} value={eft.id}>
                        {eft.eftTraceNumber} - {eft.payer} - ${((eft.paymentAmountCents || 0) / 100).toFixed(2)} ({eft.depositDate})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                  Reconciliation Notes
                </label>
                <textarea
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="Enter any notes about this reconciliation..."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "0.9375rem",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              <button
                onClick={handleReconcile}
                disabled={!selectedERAForReconcile || loading}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: selectedERAForReconcile ? "#3b82f6" : "#e5e7eb",
                  color: selectedERAForReconcile ? "white" : "#9ca3af",
                  border: "none",
                  borderRadius: "8px",
                  cursor: selectedERAForReconcile ? "pointer" : "not-allowed",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                }}
              >
                Reconcile Payment
              </button>
            </div>
          </div>

          {/* Variance Alerts */}
          <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Payment Variance Alerts</h3>
            <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
              {efts.filter((eft) => eft.varianceCents !== 0 && eft.varianceCents).length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>No variances detected</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {efts
                    .filter((eft) => eft.varianceCents !== 0 && eft.varianceCents)
                    .map((eft) => (
                      <div
                        key={eft.id}
                        style={{
                          padding: "1rem",
                          background: "#fef3c7",
                          borderLeft: "4px solid #f59e0b",
                          borderRadius: "6px",
                        }}
                      >
                        <div style={{ fontWeight: 600, color: "#92400e" }}>
                          {eft.eftTraceNumber} - {eft.payer}
                        </div>
                        <div style={{ color: "#78350f", marginTop: "0.25rem" }}>
                          Variance: ${Math.abs(eft.varianceCents / 100).toFixed(2)} ({eft.varianceCents > 0 ? "Overpayment" : "Underpayment"})
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === "reports" && (
        <div>
          <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "2rem", marginBottom: "2rem" }}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1.5rem" }}>Generate Closing Report</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={reportDates.startDate}
                  onChange={(e) => setReportDates({ ...reportDates, startDate: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "8px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={reportDates.endDate}
                  onChange={(e) => setReportDates({ ...reportDates, endDate: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "8px" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                  Report Type
                </label>
                <select
                  value={reportDates.reportType}
                  onChange={(e) => setReportDates({ ...reportDates, reportType: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "8px" }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateReport}
              disabled={loading}
              style={{
                padding: "0.75rem 1.5rem",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Generate Report
            </button>
          </div>

          {reportData && (
            <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                  {reportData.reportType.charAt(0).toUpperCase() + reportData.reportType.slice(1)} Closing Report
                </h3>
                <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                  {reportData.startDate} to {reportData.endDate}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
                {[
                  { label: "Total Charges", value: `$${(reportData.totalChargesCents / 100).toFixed(2)}`, color: "#3b82f6" },
                  { label: "Total Payments", value: `$${(reportData.totalPaymentsCents / 100).toFixed(2)}`, color: "#10b981" },
                  { label: "Total Adjustments", value: `$${(reportData.totalAdjustmentsCents / 100).toFixed(2)}`, color: "#f59e0b" },
                  { label: "Outstanding Balance", value: `$${(reportData.outstandingBalanceCents / 100).toFixed(2)}`, color: "#ef4444" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      padding: "1.5rem",
                      background: "#f9fafb",
                      borderRadius: "12px",
                      border: `2px solid ${item.color}20`,
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.5rem" }}>{item.label}</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                <div>
                  <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Claims Activity</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {[
                      { label: "Claims Submitted", value: reportData.claimsSubmitted },
                      { label: "Claims Paid", value: reportData.claimsPaid },
                      { label: "Claims Denied", value: reportData.claimsDenied },
                    ].map((item) => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                        <span style={{ color: "#6b7280" }}>{item.label}</span>
                        <span style={{ fontWeight: 600 }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "1rem" }}>Payment Processing</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {[
                      { label: "ERAs Received", value: reportData.erasReceived },
                      { label: "EFTs Received", value: reportData.eftsReceived },
                      {
                        label: "Reconciliation Variance",
                        value: `$${(reportData.reconciliationVarianceCents / 100).toFixed(2)}`,
                        alert: reportData.reconciliationVarianceCents > 0,
                      },
                    ].map((item) => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                        <span style={{ color: "#6b7280" }}>{item.label}</span>
                        <span style={{ fontWeight: 600, color: item.alert ? "#dc2626" : "inherit" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
                <button
                  onClick={() => exportToCSV([reportData], `closing_report_${reportData.reportType}`)}
                  style={{
                    padding: "0.75rem 1.5rem",
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Export CSV
                </button>
                <button
                  onClick={() => window.print()}
                  style={{
                    padding: "0.75rem 1.5rem",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Print PDF
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
