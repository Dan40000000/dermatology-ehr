import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  fetchExternalIntegrationStatus,
} from "../api";
import type { ExternalIntegrationStatus } from "../api";

type ClearinghouseTab = "submit" | "era" | "eft" | "reconcile" | "reports";

type ClaimRow = {
  id: string;
  claimNumber?: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientName?: string;
  payer?: string;
  status?: string;
  totalCents?: number;
  totalCharges?: number;
  totalBilledCents?: number;
  controlNumber?: string;
};

type ERARecord = {
  id: string;
  eraNumber?: string;
  payer?: string;
  paymentAmountCents?: number;
  claimsPaid?: number;
  status?: string;
  checkNumber?: string;
  checkDate?: string;
};

type EFTRecord = {
  id: string;
  eftTraceNumber?: string;
  payer?: string;
  paymentAmountCents?: number;
  depositDate?: string;
  transactionType?: string;
  reconciled?: boolean;
  varianceCents?: number;
};

type ClosingReport = {
  reportType?: string;
  startDate?: string;
  endDate?: string;
  totalChargesCents?: number;
  totalPaymentsCents?: number;
  totalAdjustmentsCents?: number;
  outstandingBalanceCents?: number;
  claimsSubmitted?: number;
  claimsPaid?: number;
  claimsDenied?: number;
  erasReceived?: number;
  eftsReceived?: number;
  reconciliationVarianceCents?: number;
};

interface ClearinghouseSummary {
  readyCount: number;
  readyAmountCents: number;
  codingReviewCount: number;
  awaitingPayerCount: number;
  paidCount: number;
  eraCount: number;
  eraAmountCents: number;
  eftCount: number;
  eftAmountCents: number;
}

const tabParamMap: Record<string, ClearinghouseTab> = {
  submit: "submit",
  submissions: "submit",
  responses: "era",
  era: "era",
  eft: "eft",
  reconcile: "reconcile",
  reconciliation: "reconcile",
  reports: "reports",
};

const tabs: Array<{ key: ClearinghouseTab; label: string }> = [
  { key: "submit", label: "Submit Claims" },
  { key: "era", label: "ERA" },
  { key: "eft", label: "EFT" },
  { key: "reconcile", label: "Reconciliation" },
  { key: "reports", label: "Reports" },
];

const emptySummary: ClearinghouseSummary = {
  readyCount: 0,
  readyAmountCents: 0,
  codingReviewCount: 0,
  awaitingPayerCount: 0,
  paidCount: 0,
  eraCount: 0,
  eraAmountCents: 0,
  eftCount: 0,
  eftAmountCents: 0,
};

function formatCurrency(cents = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatIntegrationStatus(integration?: ExternalIntegrationStatus | null): string {
  if (!integration) return "Unavailable";
  const provider = integration.provider ? integration.provider.replace(/_/g, " ") : "Not configured";
  const status = integration.connectionStatus === "connected"
    ? "connected"
    : integration.isActive
      ? integration.connectionStatus
      : "inactive";
  return `${provider} ${status}`;
}

function claimAmountCents(claim: ClaimRow): number {
  return Number(claim.totalCents || claim.totalBilledCents || claim.totalCharges || 0);
}

function claimPatientName(claim: ClaimRow): string {
  if (claim.patientName) return claim.patientName;
  const fullName = `${claim.patientFirstName || ""} ${claim.patientLastName || ""}`.trim();
  return fullName || "Unknown patient";
}

function statusTone(status?: string): string {
  const normalized = String(status || "").toLowerCase();
  if (["accepted", "posted", "reconciled", "paid", "ready"].includes(normalized)) return "green";
  if (["rejected", "denied", "failed", "error"].includes(normalized)) return "red";
  if (["pending", "submitted"].includes(normalized)) return "yellow";
  return "gray";
}

function titleize(value?: string): string {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reportTitle(reportType?: string): string {
  return `${titleize(reportType || "daily")} Closing Report`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function sumClaims(claims: ClaimRow[]): number {
  return claims.reduce((sum, claim) => sum + claimAmountCents(claim), 0);
}

function sumERAs(eras: ERARecord[]): number {
  return eras.reduce((sum, era) => sum + Number(era.paymentAmountCents || 0), 0);
}

function sumEFTs(efts: EFTRecord[]): number {
  return efts.reduce((sum, eft) => sum + Number(eft.paymentAmountCents || 0), 0);
}

export function ClearinghousePage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ClearinghouseTab>("submit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [eligibilityIntegration, setEligibilityIntegration] = useState<ExternalIntegrationStatus | null>(null);
  const [clearinghouseIntegration, setClearinghouseIntegration] = useState<ExternalIntegrationStatus | null>(null);
  const [summary, setSummary] = useState<ClearinghouseSummary>(emptySummary);

  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [claimStatusMap, setClaimStatusMap] = useState<Map<string, any>>(new Map());

  const [eras, setEras] = useState<ERARecord[]>([]);
  const [selectedERA, setSelectedERA] = useState<ERARecord | null>(null);
  const [eraDetails, setEraDetails] = useState<any | null>(null);
  const [eraFilters, setEraFilters] = useState({ status: "", payer: "" });

  const [efts, setEfts] = useState<EFTRecord[]>([]);
  const [eftFilters, setEftFilters] = useState({ reconciled: "", payer: "" });

  const [selectedERAForReconcile, setSelectedERAForReconcile] = useState("");
  const [selectedEFT, setSelectedEFT] = useState("");
  const [reconcileNotes, setReconcileNotes] = useState("");

  const [reportData, setReportData] = useState<ClosingReport | null>(null);
  const [reportDates, setReportDates] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    reportType: "daily",
  });

  const selectedReadyTotal = useMemo(
    () => claims.filter((claim) => selectedClaims.has(claim.id)).reduce((sum, claim) => sum + claimAmountCents(claim), 0),
    [claims, selectedClaims]
  );

  const loadSummary = async () => {
    if (!session) return;

    const [
      readyResult,
      codingReviewResult,
      submittedResult,
      acceptedResult,
      paidResult,
      eraResult,
      eftResult,
    ] = await Promise.allSettled([
      fetchClaims(session.tenantId, session.accessToken, { status: "ready" }),
      fetchClaims(session.tenantId, session.accessToken, { status: "coding_review" }),
      fetchClaims(session.tenantId, session.accessToken, { status: "submitted" }),
      fetchClaims(session.tenantId, session.accessToken, { status: "accepted" }),
      fetchClaims(session.tenantId, session.accessToken, { status: "paid" }),
      fetchRemittanceAdvice(session.tenantId, session.accessToken, {}),
      fetchEFTTransactions(session.tenantId, session.accessToken, {}),
    ]);

    const readyClaims = readyResult.status === "fulfilled" ? (readyResult.value.claims || []) as ClaimRow[] : [];
    const codingReviewClaims = codingReviewResult.status === "fulfilled" ? (codingReviewResult.value.claims || []) as ClaimRow[] : [];
    const submittedClaims = submittedResult.status === "fulfilled" ? (submittedResult.value.claims || []) as ClaimRow[] : [];
    const acceptedClaims = acceptedResult.status === "fulfilled" ? (acceptedResult.value.claims || []) as ClaimRow[] : [];
    const paidClaims = paidResult.status === "fulfilled" ? (paidResult.value.claims || []) as ClaimRow[] : [];
    const eraRows = eraResult.status === "fulfilled" ? (eraResult.value.eras || []) as ERARecord[] : [];
    const eftRows = eftResult.status === "fulfilled" ? (eftResult.value.efts || []) as EFTRecord[] : [];

    setSummary({
      readyCount: readyClaims.length,
      readyAmountCents: sumClaims(readyClaims),
      codingReviewCount: codingReviewClaims.length,
      awaitingPayerCount: submittedClaims.length + acceptedClaims.length,
      paidCount: paidClaims.length,
      eraCount: eraRows.length,
      eraAmountCents: sumERAs(eraRows),
      eftCount: eftRows.length,
      eftAmountCents: sumEFTs(eftRows),
    });
  };

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
          payer: eftFilters.payer || undefined,
        });
        setEfts(result.efts || []);
      } else if (activeTab === "reconcile") {
        const [eraResult, eftResult] = await Promise.all([
          fetchRemittanceAdvice(session.tenantId, session.accessToken, { status: "posted" }),
          fetchEFTTransactions(session.tenantId, session.accessToken, { reconciled: false }),
        ]);
        setEras(eraResult.eras || []);
        setEfts(eftResult.efts || []);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to load clearinghouse data"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab && tabParamMap[requestedTab] && tabParamMap[requestedTab] !== activeTab) {
      setActiveTab(tabParamMap[requestedTab]);
    }
  }, [activeTab, searchParams]);

  useEffect(() => {
    void loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, session]);

  useEffect(() => {
    if (!session) return;

    void Promise.all([
      fetchExternalIntegrationStatus(session.tenantId, session.accessToken, "eligibility").catch(() => null),
      fetchExternalIntegrationStatus(session.tenantId, session.accessToken, "clearinghouse").catch(() => null),
      loadSummary().catch(() => null),
    ]).then(([eligibilityStatus, clearinghouseStatus]) => {
      setEligibilityIntegration(eligibilityStatus?.integration ?? null);
      setClearinghouseIntegration(clearinghouseStatus?.integration ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const selectTab = (tab: ClearinghouseTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    setSearchParams(params);
  };

  const handleSubmitClaims = async () => {
    if (!session) return;
    if (selectedClaims.size === 0) {
      setError("Please select at least one claim to submit");
      return;
    }

    setLoading(true);
    setError(null);
    const results = new Map<string, any>();

    for (const claimId of Array.from(selectedClaims)) {
      try {
        const result = await submitClaimToClearinghouse(session.tenantId, session.accessToken, claimId);
        results.set(claimId, result);
      } catch (err: unknown) {
        results.set(claimId, { error: errorMessage(err, "Submission failed"), status: "error" });
      }
    }

    setClaimStatusMap(results);
    setSuccess(`Submitted ${selectedClaims.size} claim(s) to clearinghouse`);
    setSelectedClaims(new Set());
    setLoading(false);
    await loadInitialData();
    await loadSummary();
  };

  const handleCheckClaimStatus = async (claimId: string) => {
    if (!session) return;
    try {
      const status = await fetchClaimStatus(session.tenantId, session.accessToken, claimId);
      setClaimStatusMap((prev) => new Map(prev).set(claimId, status));
      setSuccess("Status updated");
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to fetch claim status"));
    }
  };

  const handleViewERADetails = async (eraId: string) => {
    if (!session) return;
    setLoading(true);
    try {
      const details = await fetchERADetails(session.tenantId, session.accessToken, eraId);
      setEraDetails(details);
      setSelectedERA(eras.find((era) => era.id === eraId) || null);
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to fetch ERA details"));
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
      setEraDetails(null);
      setSelectedERA(null);
      await loadInitialData();
      await loadSummary();
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to post ERA"));
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
          : `Payment reconciled with variance: ${formatCurrency(Math.abs(result.varianceCents || 0))}`
      );

      setSelectedERAForReconcile("");
      setSelectedEFT("");
      setReconcileNotes("");
      await loadInitialData();
      await loadSummary();
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to reconcile payments"));
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
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to fetch closing report"));
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
    <div className="clearinghouse-page">
      <div className="clearinghouse-header">
        <div>
          <div className="clearinghouse-eyebrow">Insurance Money Pipeline</div>
          <h1>Clearinghouse & Payment Management</h1>
          <p>
            Submit clean claims, review payer responses, post remittance advice, and match deposits back to claims.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => {
          void loadInitialData();
          void loadSummary();
        }}>
          Refresh
        </button>
      </div>

      <div className="clearinghouse-summary-grid" aria-label="Clearinghouse summary">
        <div className="clearinghouse-summary-card">
          <span>Ready to send</span>
          <strong>{summary.readyCount}</strong>
          <small>{formatCurrency(summary.readyAmountCents)}</small>
        </div>
        <div className="clearinghouse-summary-card warning">
          <span>Coding review</span>
          <strong>{summary.codingReviewCount}</strong>
          <small>Release these before submission</small>
        </div>
        <div className="clearinghouse-summary-card">
          <span>Awaiting payer</span>
          <strong>{summary.awaitingPayerCount}</strong>
          <small>Submitted or accepted claims</small>
        </div>
        <div className="clearinghouse-summary-card">
          <span>ERA received</span>
          <strong>{summary.eraCount}</strong>
          <small>{formatCurrency(summary.eraAmountCents)}</small>
        </div>
        <div className="clearinghouse-summary-card">
          <span>EFT deposits</span>
          <strong>{summary.eftCount}</strong>
          <small>{formatCurrency(summary.eftAmountCents)}</small>
        </div>
      </div>

      <div className="clearinghouse-status-grid" aria-label="Insurance connection status">
        <div className="clearinghouse-status-card">
          <span>Eligibility connection</span>
          <strong>{formatIntegrationStatus(eligibilityIntegration)}</strong>
          <small>Coverage checks feed claim context before release.</small>
        </div>
        <div className="clearinghouse-status-card">
          <span>Claims clearinghouse</span>
          <strong>{formatIntegrationStatus(clearinghouseIntegration)}</strong>
          <small>Submission and ERA/EFT workflows are internal test-mode until payer enrollment is enabled.</small>
        </div>
      </div>

      <div className="clearinghouse-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`clearinghouse-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => selectTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="clearinghouse-alert error">
          {error}
          <button type="button" onClick={() => setError(null)}>x</button>
        </div>
      )}

      {success && (
        <div className="clearinghouse-alert success">
          {success}
          <button type="button" onClick={() => setSuccess(null)}>x</button>
        </div>
      )}

      {activeTab === "submit" && (
        <section className="clearinghouse-panel">
          <div className="clearinghouse-panel-header">
            <div>
              <h2>Ready to Submit ({claims.length})</h2>
              <p>Claims land here only after coding review releases them and the scrubber is clean enough to send.</p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmitClaims}
              disabled={selectedClaims.size === 0 || loading}
            >
              Submit {selectedClaims.size > 0 ? `(${selectedClaims.size})` : ""} to Clearinghouse
            </button>
          </div>

          {claims.length === 0 ? (
            <div className="clearinghouse-empty-state">
              <h3>No claims are ready to submit.</h3>
              <p>
                This is empty because there are no claims in the ready bucket right now. Claims usually start in coding review, get fixed, then release into this clearinghouse queue.
              </p>
              <div className="clearinghouse-empty-actions">
                <Link className="btn-primary" to="/claims?queue=coding_review">Open Coding Review</Link>
                <Link className="btn-secondary" to="/claims?queue=ready">View Ready Claims</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="clearinghouse-selection-bar">
                <span>{selectedClaims.size} selected</span>
                <strong>{formatCurrency(selectedReadyTotal)}</strong>
              </div>
              <div className="clearinghouse-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          aria-label="Select all ready claims"
                          type="checkbox"
                          onChange={(event) => {
                            setSelectedClaims(event.target.checked ? new Set(claims.map((claim) => claim.id)) : new Set());
                          }}
                          checked={selectedClaims.size === claims.length && claims.length > 0}
                        />
                      </th>
                      <th>Claim #</th>
                      <th>Patient</th>
                      <th>Payer</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim) => {
                      const status = claimStatusMap.get(claim.id);
                      return (
                        <tr key={claim.id}>
                          <td>
                            <input
                              aria-label={`Select ${claim.claimNumber || claim.id}`}
                              type="checkbox"
                              checked={selectedClaims.has(claim.id)}
                              onChange={(event) => {
                                const next = new Set(selectedClaims);
                                if (event.target.checked) {
                                  next.add(claim.id);
                                } else {
                                  next.delete(claim.id);
                                }
                                setSelectedClaims(next);
                              }}
                            />
                          </td>
                          <td className="clearinghouse-claim-id">{claim.claimNumber || claim.id}</td>
                          <td>{claimPatientName(claim)}</td>
                          <td>{claim.payer || "Unknown payer"}</td>
                          <td className="clearinghouse-number">{formatCurrency(claimAmountCents(claim))}</td>
                          <td>
                            <span className={`clearinghouse-pill ${statusTone(status?.status || claim.status)}`}>
                              {status?.status || claim.status || "ready"}
                            </span>
                          </td>
                          <td>
                            <button type="button" className="btn-sm btn-secondary" onClick={() => void handleCheckClaimStatus(claim.id)}>
                              Check Status
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {claimStatusMap.size > 0 && (
            <div className="clearinghouse-timeline">
              <h3>Submission Timeline</h3>
              {Array.from(claimStatusMap.entries()).map(([claimId, status]) => (
                <div key={claimId} className="clearinghouse-timeline-item">
                  <span className={`clearinghouse-dot ${statusTone(status.status)}`} />
                  <div>
                    <strong>{claims.find((claim) => claim.id === claimId)?.claimNumber || claimId}</strong>
                    <p>{status.message || status.error || status.status} {status.controlNumber && `| Control: ${status.controlNumber}`}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "era" && (
        <section className="clearinghouse-panel">
          <div className="clearinghouse-panel-header">
            <div>
              <h2>Electronic Remittance Advice</h2>
              <p>Payer explanation of what was paid, adjusted, denied, or moved to patient responsibility.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => exportToCSV(eras, "eras")}>Export CSV</button>
          </div>

          <div className="clearinghouse-filter-row">
            <select value={eraFilters.status} onChange={(event) => setEraFilters({ ...eraFilters, status: event.target.value })}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="posted">Posted</option>
              <option value="reconciled">Reconciled</option>
            </select>
            <input
              type="text"
              placeholder="Filter by payer..."
              value={eraFilters.payer}
              onChange={(event) => setEraFilters({ ...eraFilters, payer: event.target.value })}
            />
            <button type="button" className="btn-primary" onClick={() => void loadInitialData()}>Apply Filters</button>
          </div>

          <div className={`clearinghouse-split ${eraDetails ? "with-detail" : ""}`}>
            <div className="clearinghouse-table">
              <table>
                <thead>
                  <tr>
                    <th>ERA #</th>
                    <th>Payer</th>
                    <th>Amount</th>
                    <th>Claims</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {eras.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="clearinghouse-empty-cell">No remittance advice found.</td>
                    </tr>
                  ) : (
                    eras.map((era) => (
                      <tr key={era.id}>
                        <td className="clearinghouse-claim-id">{era.eraNumber || era.id}</td>
                        <td>{era.payer || "Unknown payer"}</td>
                        <td className="clearinghouse-number">{formatCurrency(era.paymentAmountCents || 0)}</td>
                        <td>{era.claimsPaid || 0}</td>
                        <td><span className={`clearinghouse-pill ${statusTone(era.status)}`}>{era.status || "pending"}</span></td>
                        <td>
                          <div className="clearinghouse-actions">
                            <button type="button" className="btn-sm btn-secondary" onClick={() => void handleViewERADetails(era.id)}>View</button>
                            {era.status === "pending" && (
                              <button type="button" className="btn-sm btn-primary" onClick={() => void handlePostERA(era.id)}>Post</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {eraDetails && selectedERA && (
              <aside className="clearinghouse-detail-panel">
                <div className="clearinghouse-detail-header">
                  <h3>ERA Details</h3>
                  <button type="button" onClick={() => {
                    setEraDetails(null);
                    setSelectedERA(null);
                  }}>x</button>
                </div>
                <div className="clearinghouse-detail-grid">
                  <div><span>ERA Number</span><strong>{selectedERA.eraNumber || selectedERA.id}</strong></div>
                  <div><span>Payer</span><strong>{selectedERA.payer || "Unknown"}</strong></div>
                  <div><span>Payment</span><strong>{formatCurrency(selectedERA.paymentAmountCents || 0)}</strong></div>
                  <div><span>Check</span><strong>{selectedERA.checkNumber || "Not listed"}</strong></div>
                  <div><span>Check Date</span><strong>{selectedERA.checkDate || "Not listed"}</strong></div>
                  <div><span>Claims Paid</span><strong>{selectedERA.claimsPaid || 0}</strong></div>
                </div>
                <h4>Claim Details</h4>
                <div className="clearinghouse-era-claims">
                  {eraDetails.claims?.length > 0 ? (
                    eraDetails.claims.map((claim: any) => (
                      <div key={claim.id || claim.claimNumber} className="clearinghouse-era-claim">
                        <strong>{claim.claimNumber}</strong>
                        <span>Charge {formatCurrency(claim.chargeAmountCents || 0)}</span>
                        <span>Paid {formatCurrency(claim.paidAmountCents || 0)}</span>
                        <span>Adjustment {formatCurrency(claim.adjustmentAmountCents || 0)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="muted">No claim details available.</p>
                  )}
                </div>
              </aside>
            )}
          </div>
        </section>
      )}

      {activeTab === "eft" && (
        <section className="clearinghouse-panel">
          <div className="clearinghouse-panel-header">
            <div>
              <h2>EFT Deposits</h2>
              <p>Actual bank deposits that should match posted ERA payments.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => exportToCSV(efts, "efts")}>Export CSV</button>
          </div>
          <div className="clearinghouse-filter-row">
            <select value={eftFilters.reconciled} onChange={(event) => setEftFilters({ ...eftFilters, reconciled: event.target.value })}>
              <option value="">All</option>
              <option value="true">Reconciled</option>
              <option value="false">Unreconciled</option>
            </select>
            <input
              type="text"
              placeholder="Filter by payer..."
              value={eftFilters.payer}
              onChange={(event) => setEftFilters({ ...eftFilters, payer: event.target.value })}
            />
            <button type="button" className="btn-primary" onClick={() => void loadInitialData()}>Apply Filters</button>
          </div>
          <div className="clearinghouse-table">
            <table>
              <thead>
                <tr>
                  <th>Trace #</th>
                  <th>Payer</th>
                  <th>Amount</th>
                  <th>Deposit Date</th>
                  <th>Type</th>
                  <th>Reconciled</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {efts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="clearinghouse-empty-cell">No EFT deposits found.</td>
                  </tr>
                ) : (
                  efts.map((eft) => (
                    <tr key={eft.id}>
                      <td className="clearinghouse-claim-id">{eft.eftTraceNumber || eft.id}</td>
                      <td>{eft.payer || "Unknown payer"}</td>
                      <td className="clearinghouse-number">{formatCurrency(eft.paymentAmountCents || 0)}</td>
                      <td>{eft.depositDate || "Not listed"}</td>
                      <td>{eft.transactionType || "ACH"}</td>
                      <td><span className={`clearinghouse-pill ${eft.reconciled ? "green" : "yellow"}`}>{eft.reconciled ? "Yes" : "No"}</span></td>
                      <td className={eft.varianceCents ? "clearinghouse-negative" : "clearinghouse-number"}>{formatCurrency(eft.varianceCents || 0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "reconcile" && (
        <section className="clearinghouse-panel narrow">
          <div className="clearinghouse-panel-header">
            <div>
              <h2>Reconcile ERA with EFT</h2>
              <p>Match the payer explanation to the money that hit the bank.</p>
            </div>
          </div>
          <div className="clearinghouse-form-grid">
            <label>
              ERA
              <select value={selectedERAForReconcile} onChange={(event) => setSelectedERAForReconcile(event.target.value)}>
                <option value="">-- Select ERA --</option>
                {eras.map((era) => (
                  <option key={era.id} value={era.id}>{era.eraNumber || era.id} - {formatCurrency(era.paymentAmountCents || 0)}</option>
                ))}
              </select>
            </label>
            <label>
              EFT
              <select value={selectedEFT} onChange={(event) => setSelectedEFT(event.target.value)}>
                <option value="">-- Select EFT (optional) --</option>
                {efts.map((eft) => (
                  <option key={eft.id} value={eft.id}>{eft.eftTraceNumber || eft.id} - {formatCurrency(eft.paymentAmountCents || 0)}</option>
                ))}
              </select>
            </label>
            <label className="clearinghouse-form-wide">
              Notes
              <textarea value={reconcileNotes} onChange={(event) => setReconcileNotes(event.target.value)} placeholder="Variance notes, payer comments, or deposit exceptions..." />
            </label>
          </div>
          <div className="clearinghouse-panel-actions">
            <button type="button" className="btn-primary" onClick={handleReconcile} disabled={loading}>Reconcile Payment</button>
          </div>
        </section>
      )}

      {activeTab === "reports" && (
        <section className="clearinghouse-panel">
          <div className="clearinghouse-panel-header">
            <div>
              <h2>Generate Closing Report</h2>
              <p>Daily or date-range view of charges, payments, adjustments, payer files, and reconciliation variance.</p>
            </div>
          </div>
          <div className="clearinghouse-report-controls">
            <label>
              Start Date
              <input type="date" value={reportDates.startDate} onChange={(event) => setReportDates({ ...reportDates, startDate: event.target.value })} />
            </label>
            <label>
              End Date
              <input type="date" value={reportDates.endDate} onChange={(event) => setReportDates({ ...reportDates, endDate: event.target.value })} />
            </label>
            <label>
              Type
              <select value={reportDates.reportType} onChange={(event) => setReportDates({ ...reportDates, reportType: event.target.value })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <button type="button" className="btn-primary" onClick={handleGenerateReport} disabled={loading}>Generate Report</button>
          </div>

          {reportData && (
            <div className="clearinghouse-report">
              <div className="clearinghouse-panel-header">
                <div>
                  <h3>{reportTitle(reportData.reportType)}</h3>
                  <p>{reportData.startDate} to {reportData.endDate}</p>
                </div>
                <button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>
              </div>
              <div className="clearinghouse-report-grid">
                <div><span>Total Charges</span><strong>{formatCurrency(reportData.totalChargesCents || 0)}</strong></div>
                <div><span>Total Payments</span><strong>{formatCurrency(reportData.totalPaymentsCents || 0)}</strong></div>
                <div><span>Adjustments</span><strong>{formatCurrency(reportData.totalAdjustmentsCents || 0)}</strong></div>
                <div><span>Outstanding</span><strong>{formatCurrency(reportData.outstandingBalanceCents || 0)}</strong></div>
                <div><span>Claims Submitted</span><strong>{reportData.claimsSubmitted || 0}</strong></div>
                <div><span>Claims Paid</span><strong>{reportData.claimsPaid || 0}</strong></div>
                <div><span>Claims Denied</span><strong>{reportData.claimsDenied || 0}</strong></div>
                <div><span>ERAs Received</span><strong>{reportData.erasReceived || 0}</strong></div>
                <div><span>EFTs Received</span><strong>{reportData.eftsReceived || 0}</strong></div>
                <div><span>Variance</span><strong>{formatCurrency(reportData.reconciliationVarianceCents || 0)}</strong></div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
