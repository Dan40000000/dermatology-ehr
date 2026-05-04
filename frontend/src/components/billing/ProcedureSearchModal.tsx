import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchCosmeticProcedureCatalog,
  fetchDefaultFeeSchedule,
  fetchFeeForCPT,
  fetchProceduresForDiagnosis,
  fetchSelfPayProcedureCatalog,
  fetchSuggestedProcedures,
  type AdaptiveProcedureSuggestion,
} from '../../api';
import type { CPTCode, EncounterDiagnosis } from '../../types';
import { isCosmeticProcedure } from '../../utils/procedureCatalog';

interface ProcedureSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (procedure: {
    code: string;
    codeType?: 'CPT' | 'HCPCS' | 'INTERNAL';
    billingRoute?: 'insurance' | 'self_pay' | 'non_billable';
    description: string;
    quantity: number;
    feeCents: number;
    linkedDiagnosisIds: string[];
  }) => void;
  diagnoses: EncounterDiagnosis[];
  providerId?: string;
}

interface CatalogProcedure extends CPTCode {
  source: 'medical' | 'cosmetic';
  groupLabel: string;
  feeScheduleId?: string;
  scheduleName?: string;
  subcategory?: string;
  notes?: string;
  packageSessions?: number;
  typicalUnits?: number;
  isCosmetic?: boolean;
  codeType?: 'CPT' | 'HCPCS' | 'INTERNAL';
  billingRoute?: 'insurance' | 'self_pay' | 'non_billable';
  requiresDiagnosis?: boolean;
}

interface ProcedureGroup {
  key: string;
  label: string;
  source: 'medical' | 'cosmetic';
  items: CatalogProcedure[];
}

const MEDICAL_GROUP_ORDER = [
  'Evaluation & Management',
  'Biopsies',
  'Destruction',
  'Shave Removals',
  'Excisions - Benign',
  'Excisions - Malignant',
  'Repairs',
  'Mohs Surgery',
  'Flaps & Grafts',
  'Injections',
  'Phototherapy',
  'Special Procedures',
  'Self-Pay Office Visits',
  'Self-Pay Medical Procedures',
  'Self-Pay Biopsies',
  'Self-Pay Shave Removals',
  'Self-Pay Benign Excisions',
  'Self-Pay Malignant Excisions',
  'Self-Pay Mohs Surgery',
  'Self-Pay Destruction',
  'Self-Pay Injections & Medications',
  'Other Medical Procedures',
] as const;

const COSMETIC_GROUP_ORDER = [
  'Consultations',
  'Neurotoxins',
  'Dermal Fillers',
  'Laser Hair Removal',
  'Laser Skin Treatments',
  'Chemical Peels',
  'Microneedling & RF',
  'Body Contouring',
  'Packages',
  'Other Cosmetic Services',
] as const;

function dedupeProceduresByCode(procedures: CatalogProcedure[]): CatalogProcedure[] {
  const deduped = new Map<string, CatalogProcedure>();

  for (const procedure of procedures) {
    if (!procedure.code) continue;
    if (!deduped.has(procedure.code)) {
      deduped.set(procedure.code, procedure);
    }
  }

  return Array.from(deduped.values());
}

function procedureMatchesQuery(procedure: CatalogProcedure, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  return [
    procedure.code,
    procedure.description,
    procedure.category,
    procedure.groupLabel,
    procedure.subcategory,
    procedure.notes,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function getProcedureGroupLabel(
  procedure: { category?: string; groupLabel?: string },
  source: 'medical' | 'cosmetic',
): string {
  if (procedure.groupLabel?.trim()) {
    return procedure.groupLabel.trim();
  }

  if (procedure.category?.trim()) {
    return procedure.category.trim();
  }

  return source === 'cosmetic' ? 'Other Cosmetic Services' : 'Other Medical Procedures';
}

function getGroupOrderIndex(source: 'medical' | 'cosmetic', label: string): number {
  const order = source === 'medical' ? MEDICAL_GROUP_ORDER : COSMETIC_GROUP_ORDER;
  const exactIndex = order.findIndex((item) => item.toLowerCase() === label.toLowerCase());
  if (exactIndex >= 0) return exactIndex;
  return order.length + 1;
}

function sortProcedures(a: CatalogProcedure, b: CatalogProcedure): number {
  const categoryCompare = (a.subcategory || '').localeCompare(b.subcategory || '');
  if (categoryCompare !== 0) return categoryCompare;
  return a.description.localeCompare(b.description) || a.code.localeCompare(b.code);
}

function buildProcedureGroups(
  procedures: CatalogProcedure[],
  source: 'medical' | 'cosmetic',
  normalizedQuery: string,
): ProcedureGroup[] {
  const filtered = procedures.filter((procedure) => procedureMatchesQuery(procedure, normalizedQuery));
  const groups = new Map<string, CatalogProcedure[]>();

  for (const procedure of filtered) {
    const label = getProcedureGroupLabel(procedure, source);

    const existing = groups.get(label) ?? [];
    existing.push(procedure);
    groups.set(label, existing);
  }

  return Array.from(groups.entries())
    .map(([label, items]) => ({
      key: `${source}:${label}`,
      label,
      source,
      items: items.sort(sortProcedures),
    }))
    .sort((left, right) => {
      const orderDelta = getGroupOrderIndex(source, left.label) - getGroupOrderIndex(source, right.label);
      if (orderDelta !== 0) return orderDelta;
      return left.label.localeCompare(right.label);
    });
}

export function ProcedureSearchModal({ isOpen, onClose, onSelect, diagnoses, providerId }: ProcedureSearchModalProps) {
  const { session } = useAuth();
  const { showError } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<CatalogProcedure | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [feeCents, setFeeCents] = useState<number>(0);
  const [linkedDiagnosisIds, setLinkedDiagnosisIds] = useState<string[]>([]);
  const [frequentlyUsed, setFrequentlyUsed] = useState<AdaptiveProcedureSuggestion[]>([]);
  const [pairedProcedures, setPairedProcedures] = useState<AdaptiveProcedureSuggestion[]>([]);
  const [loadingFrequent, setLoadingFrequent] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [medicalCatalog, setMedicalCatalog] = useState<CatalogProcedure[]>([]);
  const [selfPayCatalog, setSelfPayCatalog] = useState<CatalogProcedure[]>([]);
  const [cosmeticCatalog, setCosmeticCatalog] = useState<CatalogProcedure[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen && session && providerId) {
      setLoadingFrequent(true);
      fetchSuggestedProcedures(session.tenantId, session.accessToken, providerId, 10)
        .then((res) => setFrequentlyUsed(Array.isArray(res.suggestions) ? res.suggestions : []))
        .catch((err) => {
          console.error('Failed to load frequent procedures:', err);
          setFrequentlyUsed([]);
        })
        .finally(() => setLoadingFrequent(false));
    }
  }, [isOpen, session, providerId]);

  useEffect(() => {
    if (isOpen && session && providerId && Array.isArray(diagnoses)) {
      const primaryDx = diagnoses.find((diagnosis) => diagnosis.isPrimary);
      if (primaryDx?.icd10Code) {
        fetchProceduresForDiagnosis(session.tenantId, session.accessToken, providerId, primaryDx.icd10Code, 10)
          .then((res) => setPairedProcedures(Array.isArray(res.suggestions) ? res.suggestions : []))
          .catch((err) => {
            console.error('Failed to load paired procedures:', err);
            setPairedProcedures([]);
          });
      } else {
        setPairedProcedures([]);
      }
    }
  }, [isOpen, session, providerId, diagnoses]);

  useEffect(() => {
    if (!isOpen || !session) return;

    let cancelled = false;
    setCatalogLoading(true);

    Promise.allSettled([
      fetchDefaultFeeSchedule(session.tenantId, session.accessToken),
      fetchSelfPayProcedureCatalog(session.tenantId, session.accessToken),
      fetchCosmeticProcedureCatalog(session.tenantId, session.accessToken),
    ])
      .then(([medicalResult, selfPayResult, cosmeticResult]) => {
        if (cancelled) return;

        if (medicalResult.status === 'fulfilled') {
          const items = Array.isArray(medicalResult.value?.items) ? medicalResult.value.items : [];
          const normalizedMedical = dedupeProceduresByCode(
            items
              .map((item: any): CatalogProcedure => ({
                code: item.cptCode || item.cpt_code || '',
                description: item.cptDescription || item.cpt_description || item.description || '',
                category: item.category || 'Other Medical Procedures',
                defaultFeeCents: Number(item.feeCents ?? item.fee_cents ?? 0),
                isCommon: false,
                codeType: item.codeType || item.code_type || 'CPT',
                billingRoute: item.billingRoute || item.billing_route || 'insurance',
                requiresDiagnosis: item.requiresDiagnosis ?? item.requires_diagnosis ?? true,
                source: 'medical',
                groupLabel: getProcedureGroupLabel(item, 'medical'),
                feeScheduleId: item.feeScheduleId || item.fee_schedule_id || '',
                scheduleName: item.scheduleName || item.schedule_name || '',
                subcategory: item.subcategory || '',
                notes: item.notes || '',
                isCosmetic: Boolean(item.isCosmetic ?? item.is_cosmetic ?? false),
              }))
              .filter((item) => item.code && !item.isCosmetic)
          );
          setMedicalCatalog(normalizedMedical);
        } else {
          console.error('Failed to load default fee schedule catalog:', medicalResult.reason);
          setMedicalCatalog([]);
        }

        if (selfPayResult.status === 'fulfilled') {
          const normalizedSelfPay = dedupeProceduresByCode(
            selfPayResult.value
              .map((item): CatalogProcedure => ({
                code: item.cptCode,
                description: item.cptDescription,
                category: item.category || 'Self-Pay Medical Procedures',
                defaultFeeCents: item.feeCents,
                isCommon: false,
                codeType: item.codeType || 'INTERNAL',
                billingRoute: item.billingRoute || 'self_pay',
                requiresDiagnosis: item.requiresDiagnosis ?? false,
                source: 'medical',
                groupLabel: getProcedureGroupLabel(item, 'medical'),
                feeScheduleId: item.feeScheduleId || '',
                scheduleName: item.scheduleName || '',
                subcategory: item.subcategory || '',
                notes: item.notes || '',
                packageSessions: item.packageSessions,
                typicalUnits: item.typicalUnits,
                isCosmetic: false,
              }))
              .filter((item) => item.code)
          );
          setSelfPayCatalog(normalizedSelfPay);
        } else {
          console.error('Failed to load self-pay catalog:', selfPayResult.reason);
          setSelfPayCatalog([]);
        }

        if (cosmeticResult.status === 'fulfilled') {
          const normalizedCosmetic = dedupeProceduresByCode(
            cosmeticResult.value
              .map((item): CatalogProcedure => ({
                code: item.cptCode,
                description: item.cptDescription,
                category: item.category || 'Other Cosmetic Services',
                defaultFeeCents: item.feeCents,
                isCommon: false,
                codeType: item.codeType || 'INTERNAL',
                billingRoute: item.billingRoute || 'self_pay',
                requiresDiagnosis: item.requiresDiagnosis ?? false,
                source: 'cosmetic',
                groupLabel: getProcedureGroupLabel(item, 'cosmetic'),
                feeScheduleId: item.feeScheduleId || '',
                scheduleName: item.scheduleName || '',
                subcategory: item.subcategory || '',
                notes: item.notes || '',
                packageSessions: item.packageSessions,
                typicalUnits: item.typicalUnits,
                isCosmetic: true,
              }))
              .filter((item) => item.code)
          );
          setCosmeticCatalog(normalizedCosmetic);
        } else {
          console.error('Failed to load cosmetic catalog:', cosmeticResult.reason);
          setCosmeticCatalog([]);
        }

        if (medicalResult.status === 'rejected' && selfPayResult.status === 'rejected' && cosmeticResult.status === 'rejected') {
          showError('Failed to load procedure catalog');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, session, showError]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const showSmartSuggestions = normalizedQuery.length === 0;

  const medicalGroups = useMemo(
    () => buildProcedureGroups([...medicalCatalog, ...selfPayCatalog], 'medical', normalizedQuery),
    [medicalCatalog, selfPayCatalog, normalizedQuery]
  );

  const cosmeticGroups = useMemo(
    () => buildProcedureGroups(cosmeticCatalog, 'cosmetic', normalizedQuery),
    [cosmeticCatalog, normalizedQuery]
  );

  const catalogByCode = useMemo(() => {
    const procedures = new Map<string, CatalogProcedure>();
    for (const procedure of [...medicalCatalog, ...selfPayCatalog, ...cosmeticCatalog]) {
      if (!procedures.has(procedure.code)) {
        procedures.set(procedure.code, procedure);
      }
    }
    return procedures;
  }, [medicalCatalog, selfPayCatalog, cosmeticCatalog]);

  const visibleProcedureCount = useMemo(
    () => [...medicalGroups, ...cosmeticGroups].reduce((total, group) => total + group.items.length, 0),
    [medicalGroups, cosmeticGroups]
  );

  const selectedProcedureIsCosmetic = isCosmeticProcedure(selectedCode);
  const selectedBillingRoute = selectedCode?.billingRoute || (selectedProcedureIsCosmetic ? 'self_pay' : 'insurance');
  const selectedRequiresDiagnosis = selectedCode?.requiresDiagnosis ?? selectedBillingRoute === 'insurance';
  const canAddProcedure = Boolean(selectedCode) && (!selectedRequiresDiagnosis || linkedDiagnosisIds.length > 0);

  const handleCodeSelect = async (code: CatalogProcedure | CPTCode) => {
    const cosmetic = isCosmeticProcedure(code);
    const feeScheduleId = 'feeScheduleId' in code ? code.feeScheduleId : undefined;
    const normalizedCode: CatalogProcedure = {
      code: code.code,
      description: code.description,
      category: code.category,
      defaultFeeCents: code.defaultFeeCents || 0,
      isCommon: code.isCommon,
      codeType: code.codeType || (cosmetic ? 'INTERNAL' : 'CPT'),
      billingRoute: code.billingRoute || (cosmetic ? 'self_pay' : 'insurance'),
      requiresDiagnosis: code.requiresDiagnosis ?? !cosmetic,
      source: cosmetic ? 'cosmetic' : 'medical',
      groupLabel: getProcedureGroupLabel(code, cosmetic ? 'cosmetic' : 'medical'),
      feeScheduleId,
      scheduleName: 'scheduleName' in code ? code.scheduleName : undefined,
      subcategory: '',
      notes: '',
      isCosmetic: cosmetic,
    };

    setSelectedCode(normalizedCode);
    setFeeCents(code.defaultFeeCents || 0);

    if (session && code.code && !feeScheduleId) {
      try {
        const res = await fetchFeeForCPT(session.tenantId, session.accessToken, code.code);
        if (res.fee) {
          setFeeCents(res.fee);
        }
      } catch {
        // Fall back to the catalog/default fee when no schedule-specific price is available.
      }
    }

    if ((normalizedCode.billingRoute || (cosmetic ? 'self_pay' : 'insurance')) !== 'insurance') {
      setLinkedDiagnosisIds([]);
      return;
    }

    if (Array.isArray(diagnoses)) {
      const primaryDx = diagnoses.find((diagnosis) => diagnosis.isPrimary);
      if (primaryDx) {
        setLinkedDiagnosisIds([primaryDx.id]);
        return;
      }
    }

    setLinkedDiagnosisIds([]);
  };

  const handleAdd = () => {
    if (!selectedCode) return;

    onSelect({
      code: selectedCode.code,
      codeType: selectedCode.codeType,
      billingRoute: selectedCode.billingRoute,
      description: selectedCode.description,
      quantity,
      feeCents,
      linkedDiagnosisIds,
    });
    handleClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedCode(null);
    setQuantity(1);
    setFeeCents(0);
    setLinkedDiagnosisIds([]);
    setFrequentlyUsed([]);
    setPairedProcedures([]);
    setMedicalCatalog([]);
    setSelfPayCatalog([]);
    setCosmeticCatalog([]);
    setExpandedGroups({});
    onClose();
  };

  const getRecencyBadge = (lastUsed: string) => {
    const now = new Date();
    const lastUsedDate = new Date(lastUsed);
    const daysSince = Math.floor((now.getTime() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince < 7) return { color: '#10b981', label: 'Recent' };
    if (daysSince < 30) return { color: '#0ea5e9', label: 'This month' };
    return null;
  };

  const handleSelectAdaptive = async (suggestion: AdaptiveProcedureSuggestion) => {
    const scheduleBoundMatch = catalogByCode.get(suggestion.cptCode);
    if (scheduleBoundMatch) {
      await handleCodeSelect(scheduleBoundMatch);
      return;
    }

    const cosmetic = isCosmeticProcedure({
      code: suggestion.cptCode,
      description: suggestion.description,
      category: suggestion.category,
    });

    const code: CatalogProcedure = {
      code: suggestion.cptCode,
      description: suggestion.description,
      category: suggestion.category,
      defaultFeeCents: suggestion.defaultFeeCents,
      isCommon: false,
      codeType: cosmetic ? 'INTERNAL' : 'CPT',
      billingRoute: cosmetic ? 'self_pay' : 'insurance',
      requiresDiagnosis: !cosmetic,
      source: cosmetic ? 'cosmetic' : 'medical',
      groupLabel: getProcedureGroupLabel({ category: suggestion.category }, cosmetic ? 'cosmetic' : 'medical'),
      subcategory: '',
      notes: '',
      isCosmetic: cosmetic,
    };

    await handleCodeSelect(code);
  };

  const toggleDiagnosis = (diagnosisId: string) => {
    setLinkedDiagnosisIds((prev) => {
      if (!Array.isArray(prev)) {
        return [diagnosisId];
      }
      return prev.includes(diagnosisId)
        ? prev.filter((id) => id !== diagnosisId)
        : [...prev, diagnosisId];
    });
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? false),
    }));
  };

  const renderAdaptiveSuggestionList = (
    title: string,
    accent: string,
    borderColor: string,
    rows: AdaptiveProcedureSuggestion[],
    countLabel: (procedure: AdaptiveProcedureSuggestion) => string,
  ) => (
    <div>
      <h4 style={{
        fontSize: '0.875rem',
        fontWeight: 600,
        color: accent,
        marginBottom: '0.75rem'
      }}>
        {title}
      </h4>
      <div style={{
        maxHeight: '220px',
        overflowY: 'auto',
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        background: '#ffffff'
      }}>
        {rows.map((procedure) => {
          const recencyBadge = getRecencyBadge(procedure.lastUsed);
          return (
            <button
              key={procedure.cptCode}
              type="button"
              onClick={() => handleSelectAdaptive(procedure)}
              style={{
                width: '100%',
                padding: '0.85rem 1rem',
                background: selectedCode?.code === procedure.cptCode ? '#eff6ff' : '#ffffff',
                border: 'none',
                borderBottom: `1px solid ${borderColor}`,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: accent }}>{procedure.cptCode}</span>
                    {procedure.category && (
                      <span style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '999px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                      }}>
                        {procedure.category}
                      </span>
                    )}
                    {recencyBadge && (
                      <span style={{ color: recencyBadge.color, fontSize: '0.7rem', fontWeight: 600 }}>
                        {recencyBadge.label}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#374151', marginTop: '0.35rem' }}>
                    {procedure.description}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {procedure.defaultFeeCents ? (
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#047857' }}>
                      ${(procedure.defaultFeeCents / 100).toFixed(2)}
                    </div>
                  ) : null}
                  <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: '#6b7280', fontWeight: 600 }}>
                    {countLabel(procedure)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderCatalogSection = (
    title: string,
    subtitle: string,
    source: 'medical' | 'cosmetic',
    groups: ProcedureGroup[],
    accent: string,
    background: string,
    borderColor: string,
  ) => {
    const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);

    return (
      <section style={{
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        background,
        padding: '1rem',
      }}>
        <div style={{ marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: accent }}>{title}</h4>
            <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {totalItems} billable procedures
            </span>
          </div>
          <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#475569' }}>{subtitle}</div>
        </div>

        {groups.length === 0 ? (
          <div style={{
            padding: '1rem',
            borderRadius: '10px',
            background: '#ffffff',
            border: `1px dashed ${borderColor}`,
            color: '#64748b',
            fontSize: '0.85rem'
          }}>
            {normalizedQuery ? 'No matching procedures in this catalog.' : 'No procedures loaded in this catalog.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {groups.map((group) => {
              const expanded = normalizedQuery.length > 0
                ? true
                : (expandedGroups[group.key] ?? false);

              return (
                <div key={group.key} style={{ border: '1px solid rgba(148, 163, 184, 0.28)', borderRadius: '10px', overflow: 'hidden', background: '#ffffff' }}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      width: '100%',
                      padding: '0.85rem 1rem',
                      border: 'none',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{group.label}</div>
                      <div style={{ marginTop: '0.18rem', fontSize: '0.74rem', color: '#64748b' }}>
                        {group.items.length} procedure{group.items.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span style={{ fontSize: '1rem', color: accent, fontWeight: 700 }}>
                      {expanded ? '−' : '+'}
                    </span>
                  </button>

                  {expanded && (
                    <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
                      {group.items.map((procedure) => {
                        const selected = selectedCode?.code === procedure.code;
                        return (
                          <button
                            key={procedure.code}
                            type="button"
                            onClick={() => handleCodeSelect(procedure)}
                            style={{
                              width: '100%',
                              padding: '0.9rem 1rem',
                              border: 'none',
                              borderBottom: '1px solid rgba(226, 232, 240, 0.9)',
                              textAlign: 'left',
                              cursor: 'pointer',
                              background: selected ? '#e0f2fe' : '#ffffff',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.78rem', color: accent }}>{procedure.code}</span>
                                  {procedure.subcategory ? (
                                    <span style={{
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '999px',
                                      background: '#f8fafc',
                                      border: '1px solid #cbd5e1',
                                      color: '#475569',
                                      fontSize: '0.65rem',
                                      fontWeight: 600,
                                    }}>
                                      {procedure.subcategory}
                                    </span>
                                  ) : null}
                                  {procedure.packageSessions ? (
                                    <span style={{ fontSize: '0.68rem', color: '#7c2d12', fontWeight: 700 }}>
                                      {procedure.packageSessions} sessions
                                    </span>
                                  ) : null}
                                  {procedure.typicalUnits ? (
                                    <span style={{ fontSize: '0.68rem', color: '#1d4ed8', fontWeight: 700 }}>
                                      Typical units: {procedure.typicalUnits}
                                    </span>
                                  ) : null}
                                </div>
                                <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: '#334155' }}>
                                  {procedure.description}
                                </div>
                                {procedure.notes ? (
                                  <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: '#64748b' }}>
                                    {procedure.notes}
                                  </div>
                                ) : null}
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#047857' }}>
                                  ${((procedure.defaultFeeCents || 0) / 100).toFixed(2)}
                                </div>
                                <div style={{ marginTop: '0.28rem', fontSize: '0.68rem', color: '#64748b' }}>
                                  {procedure.billingRoute === 'self_pay' ? 'Self-pay' : procedure.billingRoute === 'non_billable' ? 'No bill' : 'Insurance billing'}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Procedure / Charge" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{
          padding: '1rem',
          borderRadius: '12px',
          background: '#f8fafc',
          border: '1px solid #dbeafe'
        }}>
          <label style={{
            display: 'block',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: '0.55rem'
          }}>
            Search Billable Procedures
          </label>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Type Botox, laser hair, biopsy, 99213, peel..."
              style={{
                flex: 1,
                padding: '0.85rem 0.95rem',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '0.9rem'
              }}
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSearchQuery('')}
                style={{ whiteSpace: 'nowrap' }}
              >
                Clear
              </button>
            ) : null}
          </div>
          <div style={{ marginTop: '0.55rem', fontSize: '0.76rem', color: '#475569' }}>
            Browse organized medical and cosmetic billing catalogs below. {normalizedQuery ? `${visibleProcedureCount} matches shown.` : 'Open a group to find the exact code and price.'}
          </div>
        </div>

        {showSmartSuggestions && pairedProcedures.length > 0 && renderAdaptiveSuggestionList(
          `Often Paired with ${Array.isArray(diagnoses) ? diagnoses.find((diagnosis) => diagnosis.isPrimary)?.icd10Code ?? 'Primary Diagnosis' : 'Primary Diagnosis'}`,
          '#0369a1',
          '#bfdbfe',
          pairedProcedures,
          (procedure) => `${procedure.pairCount}x paired`
        )}

        {showSmartSuggestions && frequentlyUsed.length > 0 && renderAdaptiveSuggestionList(
          loadingFrequent ? 'Frequently Used by You (Loading...)' : 'Frequently Used by You',
          '#7c3aed',
          '#e9d5ff',
          frequentlyUsed,
          (procedure) => `${procedure.frequencyCount}x used`
        )}

        {catalogLoading && medicalCatalog.length === 0 && selfPayCatalog.length === 0 && cosmeticCatalog.length === 0 ? (
          <div style={{
            padding: '1rem',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            fontSize: '0.85rem',
            color: '#475569'
          }}>
            Loading procedure catalog...
          </div>
        ) : (
          <>
            {renderCatalogSection(
              'Medical / Self-Pay Medical Catalog',
              'Standard insurance procedures plus workbook-backed self-pay medical services. Diagnosis link is required only for insurance/CMS billing.',
              'medical',
              medicalGroups,
              '#0369a1',
              '#f8fafc',
              '#bfdbfe',
            )}

            {renderCatalogSection(
              'Cosmetic / Self-Pay Catalog',
              'Grouped by fee schedule category from your cosmetic fee schedules. Diagnosis link is optional for cosmetic services.',
              'cosmetic',
              cosmeticGroups,
              '#7c3aed',
              '#faf5ff',
              '#e9d5ff',
            )}
          </>
        )}

        {selectedCode && (
          <div style={{
            padding: '1rem',
            background: selectedProcedureIsCosmetic ? '#faf5ff' : '#f0fdf4',
            border: `1px solid ${selectedProcedureIsCosmetic ? '#d8b4fe' : '#86efac'}`,
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '0.76rem', color: selectedProcedureIsCosmetic ? '#7e22ce' : '#065f46', marginBottom: '0.35rem', fontWeight: 700 }}>
              Selected Procedure
            </div>
            <div style={{ fontWeight: 700, color: selectedProcedureIsCosmetic ? '#6b21a8' : '#047857', marginBottom: '1rem' }}>
              {selectedCode.code} - {selectedCode.description}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <span style={{ padding: '0.18rem 0.5rem', borderRadius: '999px', background: '#eef2ff', color: '#3730a3', fontSize: '0.68rem', fontWeight: 800 }}>
                {selectedCode.codeType || 'CPT'}
              </span>
              <span style={{ padding: '0.18rem 0.5rem', borderRadius: '999px', background: selectedBillingRoute === 'self_pay' ? '#ede9fe' : '#dbeafe', color: selectedBillingRoute === 'self_pay' ? '#5b21b6' : '#1e40af', fontSize: '0.68rem', fontWeight: 800 }}>
                {selectedBillingRoute === 'self_pay' ? 'Patient responsible' : selectedBillingRoute === 'non_billable' ? 'No bill' : 'Insurance claim'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, parseInt(event.target.value, 10) || 1))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Fee (USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={(feeCents / 100).toFixed(2)}
                  onChange={(event) => setFeeCents(Math.round(parseFloat(event.target.value) * 100) || 0)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '0.5rem'
              }}>
                {selectedRequiresDiagnosis
                  ? 'Link to Diagnoses (Required for insurance / CMS billing)'
                  : 'Diagnosis Links (Optional for self-pay / non-claim services)'}
              </label>

              {!Array.isArray(diagnoses) || diagnoses.length === 0 ? (
                <div style={{
                  padding: '0.85rem',
                  background: selectedProcedureIsCosmetic ? '#f5f3ff' : '#fef3c7',
                  border: `1px solid ${selectedProcedureIsCosmetic ? '#d8b4fe' : '#fbbf24'}`,
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  color: selectedProcedureIsCosmetic ? '#6b21a8' : '#92400e'
                }}>
                  {selectedRequiresDiagnosis
                    ? 'No diagnoses added yet. Add a diagnosis first so this medical charge is linked correctly.'
                    : 'No diagnosis is required for self-pay procedures. You can add one later if you want a clinical reference.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {diagnoses.map((diagnosis) => (
                    <label
                      key={diagnosis.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.65rem 0.75rem',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={linkedDiagnosisIds.includes(diagnosis.id)}
                        onChange={() => toggleDiagnosis(diagnosis.id)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.76rem' }}>{diagnosis.icd10Code}</span>
                        {' - '}
                        <span style={{ fontSize: '0.76rem' }}>{diagnosis.description}</span>
                        {diagnosis.isPrimary ? (
                          <span style={{
                            marginLeft: '0.5rem',
                            padding: '0.12rem 0.38rem',
                            background: '#0369a1',
                            color: '#ffffff',
                            borderRadius: '999px',
                            fontSize: '0.62rem',
                            fontWeight: 700
                          }}>
                            PRIMARY
                          </span>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
        <button type="button" className="btn-secondary" onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleAdd}
          disabled={!canAddProcedure}
          style={{
            opacity: canAddProcedure ? 1 : 0.5,
            cursor: canAddProcedure ? 'pointer' : 'not-allowed'
          }}
        >
          Add Procedure
        </button>
      </div>
    </Modal>
  );
}
