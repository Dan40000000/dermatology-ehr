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
  fetchExternalIntegrationStatus,
  getPatientBenefits,
  type ExternalIntegrationStatus,
  type PatientProcedureCostEstimate,
} from '../../api';

interface PatientCostEstimatePanelProps {
  patientId: string;
  appointmentId?: string;
  compact?: boolean;
}

type EstimateMode = 'procedure' | 'prescription';

const COMMON_CPT_CODES = [
  { code: '99203', label: 'New visit' },
  { code: '99213', label: 'Follow-up' },
  { code: '11102', label: 'Tangential biopsy' },
  { code: '17000', label: 'AK destruction' },
  { code: '11311', label: 'Shave lesion' },
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
  const [cptInput, setCptInput] = useState('99203');
  const [serviceType, setServiceType] = useState('medical');
  const [isCosmetic, setIsCosmetic] = useState(false);
  const [procedureEstimate, setProcedureEstimate] = useState<PatientProcedureCostEstimate | null>(null);
  const [isEstimatingProcedure, setIsEstimatingProcedure] = useState(false);
  const [medicationName, setMedicationName] = useState('');
  const [ndc, setNdc] = useState('');
  const [rxEstimate, setRxEstimate] = useState<any | null>(null);
  const [rxBenefits, setRxBenefits] = useState<any | null>(null);
  const [isEstimatingRx, setIsEstimatingRx] = useState(false);

  const cptCodes = useMemo(() => normalizeCptCodes(cptInput), [cptInput]);
  const eligibilityReady = Boolean(eligibilityStatus?.isConfigured && eligibilityStatus?.isActive);
  const rxReady = Boolean(rxStatus?.isConfigured && rxStatus?.isActive);

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
      showSuccess('Procedure estimate created');
    } catch (error: any) {
      showError(error.message || 'Failed to create procedure estimate');
    } finally {
      setIsEstimatingProcedure(false);
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
      showSuccess('Prescription benefit estimate created');
    } catch (error: any) {
      showError(error.message || 'Failed to estimate prescription cost');
    } finally {
      setIsEstimatingRx(false);
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

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {COMMON_CPT_CODES.map((item) => (
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
              <div style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '0.8rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '0.75rem',
                fontSize: '0.78rem',
                color: '#334155',
              }}>
                <div><strong>Copay:</strong> {formatCurrency(procedureEstimate.breakdown.copay)}</div>
                <div><strong>Deductible:</strong> {formatCurrency(procedureEstimate.breakdown.deductible)}</div>
                <div><strong>Coinsurance:</strong> {formatCurrency(procedureEstimate.breakdown.coinsurance)}</div>
                <div><strong>Not covered:</strong> {formatCurrency(procedureEstimate.breakdown.notCovered)}</div>
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
