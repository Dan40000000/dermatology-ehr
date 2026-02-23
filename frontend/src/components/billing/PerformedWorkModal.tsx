import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui';
import type { EncounterDiagnosis } from '../../types';

export type WorkBillingRoute = 'insurance' | 'self_pay';

interface AreaPricing {
  id: string;
  label: string;
  feeCents: number;
}

interface ProcedureTemplate {
  id: string;
  name: string;
  cptCode: string;
  description: string;
  defaultFeeCents: number;
  defaultBillingRoute: WorkBillingRoute;
  isCosmetic: boolean;
  areaPricing?: AreaPricing[];
}

export interface PerformedWorkLineItem {
  cptCode: string;
  description: string;
  quantity: number;
  feeCents: number;
}

export interface PerformedWorkSubmission {
  templateId: string;
  templateName: string;
  billingRoute: WorkBillingRoute;
  linkedDiagnosisIds: string[];
  lineItems: PerformedWorkLineItem[];
}

interface PerformedWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnoses: EncounterDiagnosis[];
  onRecord: (submission: PerformedWorkSubmission) => Promise<void>;
}

const LASER_AREAS: AreaPricing[] = [
  { id: 'upper_lip', label: 'Upper Lip', feeCents: 8500 },
  { id: 'chin', label: 'Chin', feeCents: 8500 },
  { id: 'underarms', label: 'Underarms', feeCents: 12500 },
  { id: 'full_face', label: 'Full Face', feeCents: 22000 },
  { id: 'bikini', label: 'Bikini', feeCents: 18000 },
  { id: 'brazilian', label: 'Brazilian', feeCents: 26000 },
  { id: 'forearms', label: 'Forearms', feeCents: 22000 },
  { id: 'half_legs', label: 'Half Legs', feeCents: 30000 },
  { id: 'full_legs', label: 'Full Legs', feeCents: 55000 },
  { id: 'back', label: 'Back', feeCents: 45000 },
  { id: 'chest', label: 'Chest', feeCents: 32000 },
];

const PROCEDURE_TEMPLATES: ProcedureTemplate[] = [
  {
    id: 'hydrafacial',
    name: 'HydraFacial',
    cptCode: 'COSHFD',
    description: 'HydraFacial treatment',
    defaultFeeCents: 25000,
    defaultBillingRoute: 'self_pay',
    isCosmetic: true,
  },
  {
    id: 'laser_hair_removal',
    name: 'Laser Hair Removal',
    cptCode: 'COSLHR',
    description: 'Laser hair removal',
    defaultFeeCents: 15000,
    defaultBillingRoute: 'self_pay',
    isCosmetic: true,
    areaPricing: LASER_AREAS,
  },
  {
    id: 'botox_cosmetic',
    name: 'Botox Cosmetic',
    cptCode: 'COSBTX',
    description: 'Botox cosmetic injection',
    defaultFeeCents: 35000,
    defaultBillingRoute: 'self_pay',
    isCosmetic: true,
  },
  {
    id: 'dermal_filler',
    name: 'Dermal Filler',
    cptCode: 'COSFIL',
    description: 'Dermal filler injection',
    defaultFeeCents: 65000,
    defaultBillingRoute: 'self_pay',
    isCosmetic: true,
  },
  {
    id: 'chemical_peel',
    name: 'Chemical Peel',
    cptCode: 'COSCHP',
    description: 'Chemical peel treatment',
    defaultFeeCents: 18000,
    defaultBillingRoute: 'self_pay',
    isCosmetic: true,
  },
  {
    id: 'microneedling',
    name: 'Microneedling',
    cptCode: 'COSMIC',
    description: 'Microneedling treatment',
    defaultFeeCents: 30000,
    defaultBillingRoute: 'self_pay',
    isCosmetic: true,
  },
  {
    id: 'ipl_photofacial',
    name: 'IPL Photofacial',
    cptCode: 'COSIPL',
    description: 'IPL photofacial treatment',
    defaultFeeCents: 32000,
    defaultBillingRoute: 'self_pay',
    isCosmetic: true,
  },
  {
    id: 'shave_biopsy',
    name: 'Shave Biopsy',
    cptCode: '11102',
    description: 'Shave biopsy, single lesion',
    defaultFeeCents: 16500,
    defaultBillingRoute: 'insurance',
    isCosmetic: false,
  },
  {
    id: 'punch_biopsy',
    name: 'Punch Biopsy',
    cptCode: '11104',
    description: 'Punch biopsy, single lesion',
    defaultFeeCents: 19000,
    defaultBillingRoute: 'insurance',
    isCosmetic: false,
  },
  {
    id: 'cryotherapy',
    name: 'Cryotherapy',
    cptCode: '17000',
    description: 'Cryotherapy, first lesion',
    defaultFeeCents: 11000,
    defaultBillingRoute: 'insurance',
    isCosmetic: false,
  },
  {
    id: 'lesion_excision',
    name: 'Lesion Excision',
    cptCode: '11401',
    description: 'Benign lesion excision',
    defaultFeeCents: 22000,
    defaultBillingRoute: 'insurance',
    isCosmetic: false,
  },
];

export function PerformedWorkModal({
  isOpen,
  onClose,
  diagnoses,
  onRecord,
}: PerformedWorkModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(PROCEDURE_TEMPLATES[0]?.id ?? '');
  const [billingRoute, setBillingRoute] = useState<WorkBillingRoute>('self_pay');
  const [quantity, setQuantity] = useState(1);
  const [feeCents, setFeeCents] = useState(PROCEDURE_TEMPLATES[0]?.defaultFeeCents ?? 0);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [linkedDiagnosisIds, setLinkedDiagnosisIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = useMemo(
    () => PROCEDURE_TEMPLATES.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId],
  );

  const selectedAreas = useMemo(
    () =>
      (selectedTemplate?.areaPricing || []).filter((area) => selectedAreaIds.includes(area.id)),
    [selectedAreaIds, selectedTemplate],
  );

  const totalCents = useMemo(() => {
    if (!selectedTemplate) return 0;
    if (selectedTemplate.areaPricing) {
      return selectedAreas.reduce((sum, area) => sum + area.feeCents, 0);
    }
    return Math.max(1, quantity) * Math.max(0, feeCents);
  }, [feeCents, quantity, selectedAreas, selectedTemplate]);

  useEffect(() => {
    if (!isOpen) return;

    const firstTemplate = PROCEDURE_TEMPLATES[0];
    if (!firstTemplate) return;

    setSelectedTemplateId(firstTemplate.id);
    setBillingRoute(firstTemplate.defaultBillingRoute);
    setQuantity(1);
    setFeeCents(firstTemplate.defaultFeeCents);
    setSelectedAreaIds([]);

    const primaryDiagnosis = diagnoses.find((dx) => dx.isPrimary);
    setLinkedDiagnosisIds(primaryDiagnosis ? [primaryDiagnosis.id] : []);
  }, [diagnoses, isOpen]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setBillingRoute(selectedTemplate.defaultBillingRoute);
    setQuantity(1);
    setFeeCents(selectedTemplate.defaultFeeCents);
    setSelectedAreaIds([]);

    const primaryDiagnosis = diagnoses.find((dx) => dx.isPrimary);
    setLinkedDiagnosisIds(primaryDiagnosis ? [primaryDiagnosis.id] : []);
  }, [diagnoses, selectedTemplateId, selectedTemplate]);

  const toggleArea = (areaId: string) => {
    setSelectedAreaIds((prev) =>
      prev.includes(areaId) ? prev.filter((id) => id !== areaId) : [...prev, areaId],
    );
  };

  const toggleDiagnosis = (diagnosisId: string) => {
    setLinkedDiagnosisIds((prev) =>
      prev.includes(diagnosisId) ? prev.filter((id) => id !== diagnosisId) : [...prev, diagnosisId],
    );
  };

  const canRecord =
    !!selectedTemplate &&
    (!selectedTemplate.areaPricing || selectedAreaIds.length > 0) &&
    (selectedTemplate.areaPricing || feeCents > 0) &&
    (billingRoute === 'self_pay' || linkedDiagnosisIds.length > 0);

  const handleRecord = async () => {
    if (!selectedTemplate || !canRecord) return;

    const lineItems: PerformedWorkLineItem[] = selectedTemplate.areaPricing
      ? selectedAreas.map((area) => ({
          cptCode: selectedTemplate.cptCode,
          description: `${selectedTemplate.description} - ${area.label}`,
          quantity: 1,
          feeCents: area.feeCents,
        }))
      : [
          {
            cptCode: selectedTemplate.cptCode,
            description: selectedTemplate.description,
            quantity: Math.max(1, quantity),
            feeCents: Math.max(0, feeCents),
          },
        ];

    setSubmitting(true);
    try {
      await onRecord({
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        billingRoute,
        linkedDiagnosisIds: billingRoute === 'insurance' ? linkedDiagnosisIds : [],
        lineItems,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Performed Work" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
            Procedure
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
            {PROCEDURE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
                style={{
                  border: selectedTemplateId === template.id ? '2px solid #0ea5e9' : '1px solid #d1d5db',
                  background: selectedTemplateId === template.id ? '#ecfeff' : '#ffffff',
                  borderRadius: '8px',
                  padding: '0.6rem 0.75rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>{template.name}</div>
                <div style={{ color: '#475569', fontSize: '0.75rem' }}>
                  {template.cptCode} · ${(template.defaultFeeCents / 100).toFixed(2)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {selectedTemplate?.areaPricing && (
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
              Laser Treatment Areas
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '0.4rem',
                padding: '0.75rem',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: '#f8fafc',
              }}
            >
              {selectedTemplate.areaPricing.map((area) => (
                <label key={area.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedAreaIds.includes(area.id)}
                    onChange={() => toggleArea(area.id)}
                  />
                  <span style={{ flex: 1 }}>{area.label}</span>
                  <span style={{ color: '#0f766e', fontWeight: 600 }}>${(area.feeCents / 100).toFixed(2)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {!selectedTemplate?.areaPricing && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#475569', marginBottom: '0.25rem' }}>
                Quantity
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#475569', marginBottom: '0.25rem' }}>
                Fee (USD)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={(feeCents / 100).toFixed(2)}
                onChange={(event) => {
                  const parsed = Number.parseFloat(event.target.value);
                  setFeeCents(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0);
                }}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
            Billing Route
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setBillingRoute('insurance')}
              style={{
                flex: 1,
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: billingRoute === 'insurance' ? '2px solid #0ea5e9' : '1px solid #d1d5db',
                background: billingRoute === 'insurance' ? '#ecfeff' : '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Insurance Claim
            </button>
            <button
              type="button"
              onClick={() => setBillingRoute('self_pay')}
              style={{
                flex: 1,
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: billingRoute === 'self_pay' ? '2px solid #7c3aed' : '1px solid #d1d5db',
                background: billingRoute === 'self_pay' ? '#f5f3ff' : '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Patient Self-Pay
            </button>
          </div>
          {selectedTemplate?.isCosmetic && billingRoute === 'insurance' && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#92400e' }}>
              Cosmetic procedures are commonly self-pay. Insurance claims may be denied unless medically necessary.
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
            Diagnosis Link {billingRoute === 'insurance' ? '(required)' : '(optional)'}
          </div>
          {diagnoses.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', padding: '0.55rem' }}>
              No diagnoses added in this encounter.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {diagnoses.map((dx) => (
                <label key={dx.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    checked={linkedDiagnosisIds.includes(dx.id)}
                    onChange={() => toggleDiagnosis(dx.id)}
                  />
                  <span style={{ fontWeight: 600 }}>{dx.icd10Code}</span>
                  <span style={{ color: '#475569' }}>{dx.description}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '0.75rem',
          }}
        >
          <div style={{ fontSize: '0.875rem', color: '#334155' }}>
            Total:{' '}
            <span style={{ fontWeight: 700, color: '#0f766e' }}>
              ${(totalCents / 100).toFixed(2)}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Insurance-routed work will flow into claims when the encounter is signed.
          </div>
        </div>
      </div>

      <div className="modal-footer" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleRecord}
          disabled={!canRecord || submitting}
          style={{
            opacity: !canRecord || submitting ? 0.6 : 1,
            cursor: !canRecord || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Recording...' : 'Record Performed Work'}
        </button>
      </div>
    </Modal>
  );
}
