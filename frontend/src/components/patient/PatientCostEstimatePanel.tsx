import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Info,
  Pill,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  checkFormulary,
  createPatientProcedureCostEstimate,
  fetchDefaultFeeSchedule,
  fetchExternalIntegrationStatus,
  getPatientBenefits,
  sharePatientProcedureCostEstimate,
  savePatientPrescriptionCostEstimate,
  sharePatientPrescriptionCostEstimate,
  revokePatientProcedureCostEstimate,
  revisePatientProcedureCostEstimate,
  reconcilePatientProcedureCostEstimate,
  type ExternalIntegrationStatus,
  type PatientProcedureCostEstimate,
} from '../../api';

interface PatientCostEstimatePanelProps {
  patientId: string;
  appointmentId?: string;
  compact?: boolean;
}

type EstimateMode = 'procedure' | 'prescription';

const PREFERRED_CPT_EXAMPLES = [
  { code: '99203', label: 'New visit' },
  { code: '99213', label: 'Follow-up' },
  { code: '11102', label: 'Tangential biopsy' },
  { code: '17000', label: 'AK destruction' },
  { code: '17110', label: 'Benign lesion destruction' },
];

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function statusLabel(status?: ExternalIntegrationStatus | null): string {
  if (!status?.isConfigured) return 'Not connected';
  if (!status.isActive) return 'Configured but inactive';
  return status.connectionStatus === 'connected' ? 'Connected' : 'Configured';
}

function normalizeCptCodes(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function pillStyle(active: boolean): CSSProperties {
  return {
    border: '1px solid',
    borderColor: active ? '#0369a1' : '#cbd5e1',
    background: active ? '#e0f2fe' : '#ffffff',
    color: active ? '#075985' : '#334155',
    borderRadius: 6,
    padding: '0.45rem 0.65rem',
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'green' | 'blue' | 'amber';
}) {
  const colors = {
    neutral: { bg: '#f8fafc', border: '#e2e8f0', label: '#64748b', value: '#0f172a' },
    green: { bg: '#ecfdf5', border: '#bbf7d0', label: '#047857', value: '#065f46' },
    blue: { bg: '#eff6ff', border: '#bfdbfe', label: '#1d4ed8', value: '#1e3a8a' },
    amber: { bg: '#fffbeb', border: '#fde68a', label: '#92400e', value: '#78350f' },
  }[tone];

  return (
    <div style={{
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      padding: '0.85rem',
      minWidth: 0,
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.label, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: colors.value }}>
        {value}
      </div>
    </div>
  );
}

export function PatientCostEstimatePanel({
  patientId,
  appointmentId,
  compact = false,
}: PatientCostEstimatePanelProps) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [mode, setMode] = useState<EstimateMode>('procedure');
  const [eligibilityStatus, setEligibilityStatus] = useState<ExternalIntegrationStatus | null>(null);
  const [rxStatus, setRxStatus] = useState<ExternalIntegrationStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [cptExamples, setCptExamples] = useState(PREFERRED_CPT_EXAMPLES);
  const [availableCptCount, setAvailableCptCount] = useState<number | null>(null);
  const [cptInput, setCptInput] = useState('99203');
  const [serviceType, setServiceType] = useState('medical');
  const [isCosmetic, setIsCosmetic] = useState(false);
  const [procedureEstimate, setProcedureEstimate] = useState<PatientProcedureCostEstimate | null>(null);
  const [isEstimatingProcedure, setIsEstimatingProcedure] = useState(false);
  const [isSharingProcedure, setIsSharingProcedure] = useState(false);
  const [sharedProcedureId, setSharedProcedureId] = useState<string | null>(null);
  const [medicationName, setMedicationName] = useState('');
  const [ndc, setNdc] = useState('');
  const [rxEstimate, setRxEstimate] = useState<any | null>(null);
  const [rxBenefits, setRxBenefits] = useState<any | null>(null);
  const [isEstimatingRx, setIsEstimatingRx] = useState(false);
  const [isSharingRx, setIsSharingRx] = useState(false);
  const [sharedRxReference, setSharedRxReference] = useState<string | null>(null);
  const [isManagingLifecycle, setIsManagingLifecycle] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [reconciliationForm, setReconciliationForm] = useState({ allowed: '', insurance: '', patient: '', notes: '' });

  const cptCodes = useMemo(() => normalizeCptCodes(cptInput), [cptInput]);
  const eligibilityReady = Boolean(eligibilityStatus?.isConfigured && eligibilityStatus?.isActive);
  const rxReady = Boolean(rxStatus?.isConfigured && rxStatus?.isActive);
  const canReconcile = ['admin', 'billing'].includes(String(session?.user?.role || '').toLowerCase());

  const loadIntegrationStatus = async () => {
    if (!session) return;
    setIsLoadingStatus(true);
    try {
      const [eligibility, eprescribe] = await Promise.all([
        fetchExternalIntegrationStatus(session.tenantId, session.accessToken, 'eligibility'),
        fetchExternalIntegrationStatus(session.tenantId, session.accessToken, 'eprescribe'),
      ]);
      setEligibilityStatus(eligibility.integration);
      setRxStatus(eprescribe.integration);
    } catch (error: any) {
      showError(error.message || 'Failed to load insurance integration status');
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadIntegrationStatus();
  }, [session?.tenantId, session?.accessToken, patientId]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    void fetchDefaultFeeSchedule(session.tenantId, session.accessToken)
      .then((schedule) => {
        if (cancelled) return;
        const items = Array.isArray(schedule?.items)
          ? schedule.items.filter((item: any) => String(item?.cptCode || '').trim() && Number(item?.feeCents) > 0)
          : [];
        const byCode = new Map(items.map((item: any) => [String(item.cptCode).toUpperCase(), item]));
        const preferred = PREFERRED_CPT_EXAMPLES.filter(item => byCode.has(item.code));
        const preferredCodes = new Set(preferred.map(item => item.code));
        const supplements = items
          .filter((item: any) => !preferredCodes.has(String(item.cptCode).toUpperCase()))
          .slice(0, Math.max(0, 5 - preferred.length))
          .map((item: any) => ({
            code: String(item.cptCode).toUpperCase(),
            label: String(item.cptDescription || 'Configured procedure'),
          }));

        setCptExamples([...preferred, ...supplements].slice(0, 5));
        setAvailableCptCount(items.length);
      })
      .catch(() => {
        if (!cancelled) setAvailableCptCount(null);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.tenantId, session?.accessToken]);

  const addCommonCode = (code: string) => {
    const current = new Set(cptCodes);
    if (current.has(code)) {
      current.delete(code);
    } else {
      current.add(code);
    }
    setCptInput(Array.from(current).join(', '));
  };

  const handleProcedureEstimate = async () => {
    if (!session) return;
    if (!cptCodes.length) {
      showError('Enter at least one CPT code.');
      return;
    }

    setIsEstimatingProcedure(true);
    try {
      const result = await createPatientProcedureCostEstimate(session.tenantId, session.accessToken, {
        patientId,
        appointmentId,
        serviceType,
        cptCodes,
        isCosmetic,
      });
      setProcedureEstimate(result.estimate);
      setSharedProcedureId(null);
      showSuccess('Procedure estimate created');
    } catch (error: any) {
      showError(error.message || 'Failed to create procedure estimate');
    } finally {
      setIsEstimatingProcedure(false);
    }
  };

  const handleShareProcedureEstimate = async () => {
    if (!session || !procedureEstimate) return;

    setIsSharingProcedure(true);
    try {
      await sharePatientProcedureCostEstimate(
        session.tenantId,
        session.accessToken,
        procedureEstimate.id
      );
      setSharedProcedureId(procedureEstimate.id);
      showSuccess('Estimate shared with the patient portal');
    } catch (error: any) {
      showError(error.message || 'Failed to share estimate with the patient portal');
    } finally {
      setIsSharingProcedure(false);
    }
  };

  const handleRxEstimate = async () => {
    if (!session) return;
    if (!medicationName.trim()) {
      showError('Enter a medication name.');
      return;
    }
    if (!rxReady) {
      showError('Prescription benefit pricing is not connected yet.');
      return;
    }

    setIsEstimatingRx(true);
    setRxEstimate(null);
    setRxBenefits(null);
    try {
      const [benefits, formulary] = await Promise.all([
        getPatientBenefits(session.tenantId, session.accessToken, patientId),
        checkFormulary(session.tenantId, session.accessToken, {
          medicationName: medicationName.trim(),
          ndc: ndc.trim() || undefined,
        }),
      ]);
      setRxBenefits(benefits);
      setRxEstimate(formulary);
      setSharedRxReference(null);
      showSuccess('Prescription benefit estimate created');
    } catch (error: any) {
      showError(error.message || 'Failed to estimate prescription cost');
    } finally {
      setIsEstimatingRx(false);
    }
  };

  const handleShareRxEstimate = async () => {
    if (!session || !rxEstimate) return;
    if (!['production', 'sandbox', 'mock'].includes(rxEstimate.environment) || !rxEstimate.responseReference || !rxEstimate.pricingSource) {
      showError('This result has no verifiable pricing source and cannot be shared.');
      return;
    }
    const patientPrice = Number(rxEstimate.copayAmount);
    if (!Number.isFinite(patientPrice) || patientPrice < 0) {
      showError('This benefit response did not include a patient price.');
      return;
    }
    setIsSharingRx(true);
    try {
      const saved = await savePatientPrescriptionCostEstimate(session.tenantId, session.accessToken, {
        patientId,
        medicationName: medicationName.trim(),
        ndc: ndc.trim() || undefined,
        patientPrice,
        formularyStatus: rxEstimate.formularyStatus,
        priorAuthRequired: Boolean(rxEstimate.requiresPriorAuth),
        pricingSource: rxEstimate.pricingSource,
        environment: rxEstimate.environment,
        responseReference: rxEstimate.responseReference,
      });
      await sharePatientPrescriptionCostEstimate(session.tenantId, session.accessToken, saved.estimate.id);
      setSharedRxReference(rxEstimate.responseReference);
      showSuccess(rxEstimate.environment === 'production'
        ? 'Live prescription estimate shared with the patient portal'
        : `${rxEstimate.environment} prescription estimate shared with an explicit test-data label`);
    } catch (error: any) {
      showError(error.message || 'Failed to share prescription estimate');
    } finally {
      setIsSharingRx(false);
    }
  };

  const handleReviseProcedureEstimate = async () => {
    if (!session || !procedureEstimate || !cptCodes.length) return;
    setIsManagingLifecycle(true);
    try {
      const result = await revisePatientProcedureCostEstimate(
        session.tenantId,
        session.accessToken,
        procedureEstimate.id,
        { serviceType, cptCodes, isCosmetic, appointmentId }
      );
      setProcedureEstimate(result.estimate);
      setSharedProcedureId(null);
      showSuccess(`Revised estimate version ${result.estimate.version} created. Review it before sharing.`);
    } catch (error: any) {
      showError(error.message || 'Failed to revise estimate');
    } finally {
      setIsManagingLifecycle(false);
    }
  };

  const handleRevokeProcedureEstimate = async () => {
    if (!session || !procedureEstimate) return;
    const reason = window.prompt('Why is this estimate being revoked? This reason is retained in the audit trail.');
    if (!reason?.trim()) return;
    setIsManagingLifecycle(true);
    try {
      await revokePatientProcedureCostEstimate(session.tenantId, session.accessToken, procedureEstimate.id, reason.trim());
      setProcedureEstimate(null);
      setSharedProcedureId(null);
      showSuccess('Estimate revoked and removed from the patient portal');
    } catch (error: any) {
      showError(error.message || 'Failed to revoke estimate');
    } finally {
      setIsManagingLifecycle(false);
    }
  };

  const handleReconcileProcedureEstimate = async () => {
    if (!session || !procedureEstimate) return;
    const actualAllowedAmount = Number(reconciliationForm.allowed);
    const actualInsurancePayment = Number(reconciliationForm.insurance);
    const actualPatientResponsibility = Number(reconciliationForm.patient);
    if (![actualAllowedAmount, actualInsurancePayment, actualPatientResponsibility].every(value => Number.isFinite(value) && value >= 0)) {
      showError('Enter all three non-negative final amounts.');
      return;
    }
    setIsManagingLifecycle(true);
    try {
      await reconcilePatientProcedureCostEstimate(session.tenantId, session.accessToken, procedureEstimate.id, {
        actualAllowedAmount,
        actualInsurancePayment,
        actualPatientResponsibility,
        notes: reconciliationForm.notes.trim() || undefined,
      });
      setProcedureEstimate({ ...procedureEstimate, status: 'reconciled' });
      setShowReconciliation(false);
      showSuccess('Estimate reconciled to final payer processing');
    } catch (error: any) {
      showError(error.message || 'Failed to reconcile estimate');
    } finally {
      setIsManagingLifecycle(false);
    }
  };

  return (
    <section style={{
      background: '#ffffff',
      border: '1px solid #dbe3ea',
      borderRadius: 8,
      padding: compact ? '1rem' : '1.25rem',
      display: 'grid',
      gap: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Calculator size={18} color="#0369a1" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              Patient Cost Estimate
            </h3>
          </div>
          <p style={{ margin: 0, color: '#475569', fontSize: '0.84rem', lineHeight: 1.45 }}>
            Estimate expected patient responsibility from verified insurance, fee schedules, and benefit data.
          </p>
        </div>
        <button
          type="button"
          onClick={loadIntegrationStatus}
          disabled={isLoadingStatus}
          style={{
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            borderRadius: 6,
            padding: '0.45rem 0.65rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: isLoadingStatus ? 'not-allowed' : 'pointer',
            color: '#334155',
            fontWeight: 700,
            fontSize: '0.78rem',
          }}
        >
          <RefreshCw size={14} />
          Status
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
        <div style={{
          border: `1px solid ${eligibilityReady ? '#bbf7d0' : '#fed7aa'}`,
          background: eligibilityReady ? '#f0fdf4' : '#fff7ed',
          borderRadius: 8,
          padding: '0.8rem',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}>
          <ShieldCheck size={17} color={eligibilityReady ? '#047857' : '#c2410c'} />
          <div>
            <div style={{ fontWeight: 800, color: eligibilityReady ? '#065f46' : '#9a3412', fontSize: '0.82rem' }}>
              Medical eligibility: {statusLabel(eligibilityStatus)}
            </div>
            <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2 }}>
              {eligibilityStatus?.provider || 'stedi'}
            </div>
          </div>
        </div>

        <div style={{
          border: `1px solid ${rxReady ? '#bbf7d0' : '#fed7aa'}`,
          background: rxReady ? '#f0fdf4' : '#fff7ed',
          borderRadius: 8,
          padding: '0.8rem',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}>
          <Pill size={17} color={rxReady ? '#047857' : '#c2410c'} />
          <div>
            <div style={{ fontWeight: 800, color: rxReady ? '#065f46' : '#9a3412', fontSize: '0.82rem' }}>
              Rx benefits: {statusLabel(rxStatus)}
            </div>
            <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2 }}>
              {rxStatus?.provider || 'surescripts'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setMode('procedure')} style={pillStyle(mode === 'procedure')}>
          <Calculator size={14} />
          Procedures
        </button>
        <button type="button" onClick={() => setMode('prescription')} style={pillStyle(mode === 'prescription')}>
          <Pill size={14} />
          Prescriptions
        </button>
      </div>

      {mode === 'procedure' ? (
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {!eligibilityReady && !isCosmetic && (
            <div style={{
              border: '1px solid #fed7aa',
              background: '#fff7ed',
              color: '#9a3412',
              borderRadius: 8,
              padding: '0.85rem',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              fontSize: '0.84rem',
              lineHeight: 1.45,
            }}>
              <AlertTriangle size={17} />
              <div>
                <strong>Live medical eligibility is not connected.</strong>
                <div>This can still estimate from fee schedules, but payer benefits and patient insurance responsibility are not verified.</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(150px, 1fr)', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
              CPT codes
              <input
                value={cptInput}
                onChange={(event) => setCptInput(event.target.value)}
                placeholder="99203, 11102"
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.9rem',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
              Service type
              <select
                value={serviceType}
                onChange={(event) => setServiceType(event.target.value)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.9rem',
                  background: '#ffffff',
                }}
              >
                <option value="medical">Medical</option>
                <option value="procedure">Procedure</option>
                <option value="office_visit">Office visit</option>
                <option value="cosmetic">Cosmetic</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gap: '0.45rem' }}>
            <div style={{ color: '#475569', fontSize: '0.76rem', lineHeight: 1.4 }}>
              <strong>Common examples — quick-fill shortcuts only.</strong>{' '}
              Enter any CPT configured in the default fee schedule
              {availableCptCount == null ? '.' : ` (${availableCptCount} available).`}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {cptExamples.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => addCommonCode(item.code)}
                  style={pillStyle(cptCodes.includes(item.code))}
                >
                  {item.code}
                  <span style={{ fontWeight: 600, color: '#64748b' }}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#334155',
            fontSize: '0.84rem',
            fontWeight: 700,
          }}>
            <input
              type="checkbox"
              checked={isCosmetic}
              onChange={(event) => setIsCosmetic(event.target.checked)}
            />
            Cosmetic or self-pay service
          </label>

          <button
            type="button"
            onClick={handleProcedureEstimate}
            disabled={isEstimatingProcedure || !cptCodes.length}
            style={{
              border: 'none',
              background: '#0369a1',
              color: '#ffffff',
              borderRadius: 6,
              padding: '0.7rem 1rem',
              fontWeight: 800,
              cursor: isEstimatingProcedure || !cptCodes.length ? 'not-allowed' : 'pointer',
              justifySelf: 'start',
            }}
          >
            {isEstimatingProcedure ? 'Estimating...' : 'Estimate Procedure Cost'}
          </button>

          {procedureEstimate && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
                <Metric label="Total charges" value={formatCurrency(procedureEstimate.totalCharges)} />
                <Metric label="Allowed amount" value={formatCurrency(procedureEstimate.insuranceAllowedAmount)} tone="blue" />
                <Metric label="Insurance pays" value={formatCurrency(procedureEstimate.insurancePays)} tone="green" />
                <Metric label="Patient estimate" value={formatCurrency(procedureEstimate.patientResponsibility)} tone="amber" />
              </div>
              {procedureEstimate.pricingDetails.length > 0 && (
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 0.85rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.84rem' }}>Estimate by CPT code</div>
                    <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2, lineHeight: 1.4 }}>
                      Cost sharing is allocated across codes for planning; the payer may adjudicate individual lines differently.
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table aria-label="Estimate by CPT code" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left' }}>
                          <th style={{ padding: '0.65rem 0.75rem' }}>CPT / procedure</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Charge</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Allowed</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Insurance pays</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Patient estimate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {procedureEstimate.pricingDetails.map((item, index) => (
                          <tr key={`${item.code}-${index}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '0.7rem 0.75rem', color: '#0f172a' }}>
                              <strong>{item.code}</strong>
                              {item.description && <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>{item.description}</div>}
                              <div style={{ color: '#64748b', fontSize: '0.68rem', marginTop: 2 }}>
                                {item.basis === 'contract_rate' ? 'Contract rate' : item.basis === 'self_pay' ? 'Self-pay' : 'Planning fallback'}
                              </div>
                            </td>
                            <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right' }}>{formatCurrency(item.charge)}</td>
                            <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', color: '#1d4ed8', fontWeight: 700 }}>{formatCurrency(item.allowedAmount)}</td>
                            <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', color: '#047857', fontWeight: 700 }}>{formatCurrency(item.insurancePays)}</td>
                            <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', color: '#92400e', fontWeight: 800 }}>{formatCurrency(item.patientResponsibility)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc', fontWeight: 800 }}>
                          <td style={{ padding: '0.7rem 0.75rem' }}>Total</td>
                          <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right' }}>{formatCurrency(procedureEstimate.totalCharges)}</td>
                          <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right' }}>{formatCurrency(procedureEstimate.insuranceAllowedAmount)}</td>
                          <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right' }}>{formatCurrency(procedureEstimate.insurancePays)}</td>
                          <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right' }}>{formatCurrency(procedureEstimate.patientResponsibility)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '0.8rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: '0.75rem',
                fontSize: '0.78rem',
                color: '#334155',
              }}>
                <div><strong>Copay:</strong> {formatCurrency(procedureEstimate.breakdown.copay)}</div>
                <div><strong>Deductible:</strong> {formatCurrency(procedureEstimate.breakdown.deductible)}</div>
                <div><strong>Coinsurance:</strong> {formatCurrency(procedureEstimate.breakdown.coinsurance)}</div>
                <div><strong>Not covered:</strong> {formatCurrency(procedureEstimate.breakdown.notCovered)}</div>
                <div><strong>Contract adjustment:</strong> {formatCurrency(procedureEstimate.breakdown.contractualAdjustment)}</div>
              </div>
              <div style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                color: procedureEstimate.insuranceVerified ? '#047857' : '#92400e',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}>
                {procedureEstimate.insuranceVerified ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                {procedureEstimate.insuranceVerified
                  ? `Insurance benefits verified. Estimate valid until ${procedureEstimate.validUntil}.`
                  : 'Estimate was created without a current live eligibility verification.'}
              </div>
              <div style={{
                border: `1px solid ${procedureEstimate.confidenceLevel === 'high' ? '#86efac' : procedureEstimate.confidenceLevel === 'medium' ? '#bfdbfe' : '#fde68a'}`,
                background: procedureEstimate.confidenceLevel === 'high' ? '#f0fdf4' : procedureEstimate.confidenceLevel === 'medium' ? '#eff6ff' : '#fffbeb',
                borderRadius: 6,
                padding: '0.65rem 0.75rem',
                color: '#334155',
                fontSize: '0.78rem',
                lineHeight: 1.45,
              }}>
                <strong>{procedureEstimate.confidenceLevel === 'planning' ? 'Planning estimate' : `${procedureEstimate.confidenceLevel} confidence`} · {procedureEstimate.confidenceScore}/100.</strong>
                {' '}{(procedureEstimate.confidenceFactors || []).join(' · ')}
              </div>
              {!procedureEstimate.isCosmetic && procedureEstimate.insuranceAllowedAmount > 0 && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: '0.65rem 0.75rem',
                  color: '#475569',
                  fontSize: '0.78rem',
                  lineHeight: 1.45,
                }}>
                  {procedureEstimate.pricingBasis === 'contract_rate'
                    ? 'Allowed-amount basis: configured payer contract rate for every procedure.'
                    : procedureEstimate.pricingBasis === 'mixed'
                      ? 'Allowed-amount basis: payer contract rates where configured, with a disclosed 80%-of-fee planning fallback for missing codes.'
                      : procedureEstimate.pricingBasis === 'self_pay'
                        ? 'Allowed-amount basis: office self-pay fee schedule.'
                        : 'Allowed-amount basis: 80% of the office fee. A payer-specific contracted rate is not configured yet.'}
                </div>
              )}
              <button
                type="button"
                onClick={handleShareProcedureEstimate}
                disabled={isSharingProcedure || sharedProcedureId === procedureEstimate.id}
                style={{
                  border: sharedProcedureId === procedureEstimate.id ? '1px solid #86efac' : 'none',
                  background: sharedProcedureId === procedureEstimate.id ? '#f0fdf4' : '#0f766e',
                  color: sharedProcedureId === procedureEstimate.id ? '#166534' : '#ffffff',
                  borderRadius: 6,
                  padding: '0.65rem 0.9rem',
                  fontWeight: 800,
                  cursor: isSharingProcedure || sharedProcedureId === procedureEstimate.id ? 'not-allowed' : 'pointer',
                  justifySelf: 'start',
                }}
              >
                {sharedProcedureId === procedureEstimate.id
                  ? 'Shared with Patient Portal'
                  : isSharingProcedure
                    ? 'Sharing...'
                    : 'Share with Patient Portal'}
              </button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" onClick={handleReviseProcedureEstimate} disabled={isManagingLifecycle} style={pillStyle(false)}>
                  Create Revised Version
                </button>
                <button type="button" onClick={handleRevokeProcedureEstimate} disabled={isManagingLifecycle} style={{ ...pillStyle(false), color: '#b91c1c', borderColor: '#fecaca' }}>
                  Revoke Estimate
                </button>
                {canReconcile && (
                  <button type="button" onClick={() => setShowReconciliation(value => !value)} disabled={isManagingLifecycle} style={pillStyle(false)}>
                    Reconcile to EOB / ERA
                  </button>
                )}
              </div>
              {showReconciliation && canReconcile && (
                <div style={{ display: 'grid', gap: 8, border: '1px solid #bfdbfe', borderRadius: 8, background: '#eff6ff', padding: '0.85rem' }}>
                  <strong style={{ fontSize: '0.82rem', color: '#1e3a8a' }}>Final payer processing</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    <input type="number" min="0" step="0.01" aria-label="Actual allowed amount" placeholder="Actual allowed" value={reconciliationForm.allowed} onChange={event => setReconciliationForm({ ...reconciliationForm, allowed: event.target.value })} />
                    <input type="number" min="0" step="0.01" aria-label="Actual insurance payment" placeholder="Insurance paid" value={reconciliationForm.insurance} onChange={event => setReconciliationForm({ ...reconciliationForm, insurance: event.target.value })} />
                    <input type="number" min="0" step="0.01" aria-label="Actual patient responsibility" placeholder="Patient responsibility" value={reconciliationForm.patient} onChange={event => setReconciliationForm({ ...reconciliationForm, patient: event.target.value })} />
                  </div>
                  <input aria-label="Reconciliation notes" placeholder="Optional reconciliation notes" value={reconciliationForm.notes} onChange={event => setReconciliationForm({ ...reconciliationForm, notes: event.target.value })} />
                  <button type="button" onClick={handleReconcileProcedureEstimate} disabled={isManagingLifecycle} style={{ ...pillStyle(true), justifySelf: 'start' }}>
                    Save Reconciliation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {!rxReady && (
            <div style={{
              border: '1px solid #fed7aa',
              background: '#fff7ed',
              color: '#9a3412',
              borderRadius: 8,
              padding: '0.85rem',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              fontSize: '0.84rem',
              lineHeight: 1.45,
            }}>
              <AlertTriangle size={17} />
              <div>
                <strong>Prescription cost estimates are not live yet.</strong>
                <div>Connect Surescripts/RTPB or a pharmacy benefit vendor before showing patient drug copays.</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(150px, 1fr)', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
              Medication
              <input
                value={medicationName}
                onChange={(event) => setMedicationName(event.target.value)}
                placeholder="Doxycycline 100 mg"
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.9rem',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
              NDC
              <input
                value={ndc}
                onChange={(event) => setNdc(event.target.value)}
                placeholder="Optional"
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.9rem',
                }}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleRxEstimate}
            disabled={isEstimatingRx || !rxReady || !medicationName.trim()}
            style={{
              border: 'none',
              background: rxReady ? '#0369a1' : '#94a3b8',
              color: '#ffffff',
              borderRadius: 6,
              padding: '0.7rem 1rem',
              fontWeight: 800,
              cursor: isEstimatingRx || !rxReady || !medicationName.trim() ? 'not-allowed' : 'pointer',
              justifySelf: 'start',
            }}
          >
            {isEstimatingRx ? 'Checking...' : 'Estimate Prescription Cost'}
          </button>

          {rxEstimate && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
                <Metric label="Formulary" value={String(rxEstimate.formularyStatus || 'Unknown').replace(/_/g, ' ')} tone="blue" />
                <Metric label="Tier" value={rxEstimate.tier ? `Tier ${rxEstimate.tier}` : '--'} />
                <Metric label="Estimated copay" value={formatCurrency(rxEstimate.copayAmount)} tone="amber" />
                <Metric label="Prior auth" value={rxEstimate.requiresPriorAuth ? 'Required' : 'No'} tone={rxEstimate.requiresPriorAuth ? 'amber' : 'green'} />
              </div>
              {rxBenefits?.coverage && (
                <div style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '0.8rem',
                  fontSize: '0.78rem',
                  color: '#334155',
                }}>
                  <strong>{rxBenefits.coverage.payerName || 'Pharmacy benefits'}</strong>
                  {' '}· {rxBenefits.coverage.planName || 'Plan on file'}
                  {' '}· Rx BIN {rxBenefits.coverage.rxBin || '--'}
                </div>
              )}
              <div style={{
                border: `1px solid ${rxEstimate.environment === 'production' ? '#86efac' : '#fde68a'}`,
                background: rxEstimate.environment === 'production' ? '#f0fdf4' : '#fffbeb',
                borderRadius: 6,
                padding: '0.65rem 0.75rem',
                color: rxEstimate.environment === 'production' ? '#166534' : '#92400e',
                fontSize: '0.78rem',
              }}>
                {rxEstimate.environment === 'production'
                  ? `Live price from ${rxEstimate.pricingSource}. Reference ${rxEstimate.responseReference}.`
                  : `${rxEstimate.environment || 'Unlabeled'} workflow data only. This is not a live patient price.`}
              </div>
              <button
                type="button"
                onClick={handleShareRxEstimate}
                disabled={isSharingRx || sharedRxReference === rxEstimate.responseReference}
                style={{
                  border: sharedRxReference === rxEstimate.responseReference ? '1px solid #86efac' : 'none',
                  background: sharedRxReference === rxEstimate.responseReference ? '#f0fdf4' : '#0f766e',
                  color: sharedRxReference === rxEstimate.responseReference ? '#166534' : '#ffffff',
                  borderRadius: 6,
                  padding: '0.65rem 0.9rem',
                  fontWeight: 800,
                  cursor: isSharingRx || sharedRxReference === rxEstimate.responseReference ? 'not-allowed' : 'pointer',
                  justifySelf: 'start',
                }}
              >
                {sharedRxReference === rxEstimate.responseReference
                  ? 'Shared with Patient Portal'
                  : isSharingRx
                    ? 'Sharing...'
                    : rxEstimate.environment === 'production'
                      ? 'Share Live Price with Portal'
                      : 'Share Clearly Labeled Test Estimate'}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{
        borderTop: '1px solid #e2e8f0',
        paddingTop: '0.85rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        color: '#64748b',
        fontSize: '0.76rem',
        lineHeight: 1.45,
      }}>
        <Info size={15} />
        <span>
          Estimates are planning tools, not a guarantee of payment. Final responsibility depends on payer adjudication,
          contracted rates, diagnosis, modifiers, pharmacy, deductible state, and plan rules on the service date.
        </span>
      </div>
    </section>
  );
}
