import { ALL_APPOINTMENTS, ALL_PATIENTS } from './demoData';

type DemoItem = Record<string, any>;

const STORAGE_KEY = 'demoRevenueCycleState.v1';
const TENANT_ID = 'tenant-demo';
const DAY_MS = 24 * 60 * 60 * 1000;

type ClaimLifecycleStatus = 'draft' | 'ready' | 'submitted' | 'accepted' | 'rejected' | 'denied' | 'appealed' | 'partially_paid' | 'paid';

interface DemoClaimState {
  id: string;
  tenantId: string;
  appointmentId?: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientName: string;
  dob?: string;
  providerName: string;
  payer: string;
  payerId: string;
  insurancePlanName?: string;
  serviceDate: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  status: ClaimLifecycleStatus;
  scrubStatus: 'pending' | 'passed' | 'failed';
  totalCents: number;
  patientResponsibilityCents: number;
  patientPaidCents: number;
  payerExpectedCents: number;
  payerPaidCents: number;
  adjustmentCents: number;
  charges: Array<{ id: string; cptCode: string; description: string; category: string; quantity: number; feeCents: number }>;
  diagnoses: Array<{ id: string; icd10Code: string; description: string; isPrimary: boolean }>;
  denialReason?: string;
  denialCode?: string;
  appealStatus?: string;
  eraPosted: boolean;
  reconciled: boolean;
}

interface DemoRevenueCycleState {
  feeSchedules: DemoItem[];
  feeScheduleItems: Record<string, DemoItem[]>;
  claims: DemoClaimState[];
  autoVerifyEnabled: boolean;
  lastAutoVerifyRun: string | null;
}

const DEFAULT_TIMESTAMP = '2026-01-01T08:00:00Z';

const FEE_SCHEDULES = [
  {
    id: 'demo-fee-medical',
    tenantId: TENANT_ID,
    name: 'Medical Dermatology Fee Schedule',
    isDefault: true,
    description: 'Default medical dermatology allowables used by demo claims and revenue dashboards.',
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'demo-fee-cosmetic',
    tenantId: TENANT_ID,
    name: 'Cosmetic Procedures Fee Schedule',
    isDefault: false,
    description: 'Cosmetic self-pay pricing used for injectables and aesthetic services.',
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
];

const MEDICAL_FEE_ITEMS = [
  { id: 'demo-fee-99213', feeScheduleId: 'demo-fee-medical', cptCode: '99213', cptDescription: 'Established patient outpatient visit', category: 'E/M', feeCents: 15000, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-99214', feeScheduleId: 'demo-fee-medical', cptCode: '99214', cptDescription: 'Established patient outpatient visit, moderate complexity', category: 'E/M', feeCents: 20000, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-99204', feeScheduleId: 'demo-fee-medical', cptCode: '99204', cptDescription: 'New patient office consultation', category: 'E/M', feeCents: 28500, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-99442', feeScheduleId: 'demo-fee-medical', cptCode: '99442', cptDescription: 'Telehealth follow-up, 11-20 minutes', category: 'Telehealth', feeCents: 12500, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-11102', feeScheduleId: 'demo-fee-medical', cptCode: '11102', cptDescription: 'Tangential biopsy of skin, single lesion', category: 'Procedure', feeCents: 17500, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-17000', feeScheduleId: 'demo-fee-medical', cptCode: '17000', cptDescription: 'Destruction premalignant lesion, first lesion', category: 'Procedure', feeCents: 8500, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-17311', feeScheduleId: 'demo-fee-medical', cptCode: '17311', cptDescription: 'Mohs micrographic surgery, first stage', category: 'Mohs', feeCents: 85000, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-17312', feeScheduleId: 'demo-fee-medical', cptCode: '17312', cptDescription: 'Mohs micrographic surgery, each additional stage', category: 'Mohs', feeCents: 42000, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-95044', feeScheduleId: 'demo-fee-medical', cptCode: '95044', cptDescription: 'Patch or application test', category: 'Testing', feeCents: 3200, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-fee-96910', feeScheduleId: 'demo-fee-medical', cptCode: '96910', cptDescription: 'Photochemotherapy', category: 'Procedure', feeCents: 6500, createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
];

const COSMETIC_FEE_ITEMS = [
  { id: 'demo-cos-botox', feeScheduleId: 'demo-fee-cosmetic', cptCode: 'J0585', cptDescription: 'Botox treatment session', category: 'neurotoxins', feeCents: 48000, minPriceCents: 42000, maxPriceCents: 65000, typicalUnits: 35, packageSessions: 1, notes: 'Typical cosmetic neurotoxin visit', createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-cos-filler', feeScheduleId: 'demo-fee-cosmetic', cptCode: 'A4580', cptDescription: 'Dermal filler treatment', category: 'dermal_fillers', feeCents: 72000, minPriceCents: 65000, maxPriceCents: 98000, typicalUnits: 2, packageSessions: 1, notes: 'Per-treatment cosmetic filler pricing', createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-cos-peel', feeScheduleId: 'demo-fee-cosmetic', cptCode: '15788', cptDescription: 'Chemical peel', category: 'chemical_peels', feeCents: 19500, minPriceCents: 17500, maxPriceCents: 25000, typicalUnits: 1, packageSessions: 1, notes: 'Superficial to medium-depth peel', createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-cos-micro', feeScheduleId: 'demo-fee-cosmetic', cptCode: '96999', cptDescription: 'Microneedling', category: 'microneedling', feeCents: 32500, minPriceCents: 29000, maxPriceCents: 42000, typicalUnits: 1, packageSessions: 1, notes: 'Microneedling cosmetic service', createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
  { id: 'demo-cos-hydra', feeScheduleId: 'demo-fee-cosmetic', cptCode: 'A9999', cptDescription: 'Hydrafacial', category: 'other_cosmetic', feeCents: 24000, minPriceCents: 21000, maxPriceCents: 32000, typicalUnits: 1, packageSessions: 1, notes: 'Hydrafacial maintenance visit', createdAt: DEFAULT_TIMESTAMP, updatedAt: DEFAULT_TIMESTAMP },
];

const PAYER_FACTORS: Record<string, { payerId: string; allowedFactor: number }> = {
  'Blue Cross Blue Shield of Colorado': { payerId: 'BCBS-CO', allowedFactor: 0.78 },
  Aetna: { payerId: 'AETNA', allowedFactor: 0.75 },
  Cigna: { payerId: 'CIGNA', allowedFactor: 0.74 },
  'United Healthcare': { payerId: 'UHC', allowedFactor: 0.76 },
  'UnitedHealthcare': { payerId: 'UHC', allowedFactor: 0.76 },
  'Kaiser Permanente': { payerId: 'KAISER', allowedFactor: 0.68 },
  Anthem: { payerId: 'ANTHEM', allowedFactor: 0.73 },
  Medicare: { payerId: 'MEDICARE', allowedFactor: 0.7 },
  'Self-Pay': { payerId: 'SELFPAY', allowedFactor: 1 },
};

const DENIAL_REASONS = [
  { code: 'CO-16', reason: 'Missing or invalid member ID' },
  { code: 'CO-197', reason: 'Prior authorization not on file' },
  { code: 'CO-50', reason: 'Medical necessity documentation insufficient' },
  { code: 'M76', reason: 'Required modifier missing from procedure line' },
];

const PRIOR_AUTH_RULES = [
  {
    cptCode: '96910',
    description: 'Photochemotherapy',
    requiresAuth: true,
    payerSpecific: [
      { payerName: 'Aetna', required: true, notes: 'Required after initial consult note and failure of topical therapy.' },
      { payerName: 'Blue Cross Blue Shield of Colorado', required: false, notes: 'Usually not required for standard psoriasis phototherapy.' },
      { payerName: 'United Healthcare', required: true, notes: 'Required for repeated treatment series.' },
    ],
  },
  {
    cptCode: '17311',
    description: 'Mohs micrographic surgery',
    requiresAuth: false,
    payerSpecific: [
      { payerName: 'Aetna', required: false, notes: 'Generally no prior auth when pathology and location criteria are met.' },
      { payerName: 'Blue Cross Blue Shield of Colorado', required: false, notes: 'Document lesion site, size, and pathology.' },
      { payerName: 'United Healthcare', required: false, notes: 'Clinical documentation still required.' },
    ],
  },
  {
    cptCode: 'J0585',
    description: 'Botox treatment session',
    requiresAuth: true,
    payerSpecific: [
      { payerName: 'Aetna', required: true, notes: 'Cosmetic use excluded; medical use requires diagnosis and frequency history.' },
      { payerName: 'Blue Cross Blue Shield of Colorado', required: true, notes: 'Covered only for qualifying medical indications.' },
      { payerName: 'United Healthcare', required: true, notes: 'Cosmetic services are self-pay and not billable to plan.' },
    ],
  },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDay(value?: string | Date): Date {
  const date = value ? new Date(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(dateLike: string | Date, days: number): string {
  const date = startOfDay(dateLike);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = startOfDay(`${fromDate}T00:00:00Z`).getTime();
  const to = startOfDay(`${toDate}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

function isTelehealthAppointment(appointment: DemoItem): boolean {
  const combined = `${appointment.appointmentTypeName || ''} ${appointment.locationName || ''}`.toLowerCase();
  return /telehealth|virtual|video/.test(combined);
}

function getFeeItem(cptCode: string, feeScheduleId = 'demo-fee-medical'): DemoItem {
  const items = feeScheduleId === 'demo-fee-cosmetic' ? COSMETIC_FEE_ITEMS : MEDICAL_FEE_ITEMS;
  return items.find((item) => item.cptCode === cptCode) || items[0];
}

function buildChargesForAppointment(appointment: DemoItem, index: number) {
  const typeName = String(appointment.appointmentTypeName || '').toLowerCase();
  const complaint = String(appointment.chiefComplaint || '').toLowerCase();
  const telehealth = isTelehealthAppointment(appointment);

  const lines: Array<{ cptCode: string; description: string; category: string; quantity: number }> = [];

  if (telehealth) {
    lines.push({ cptCode: '99442', description: 'Telehealth follow-up, 11-20 minutes', category: 'Telehealth', quantity: 1 });
  } else if (/mohs/.test(typeName)) {
    lines.push({ cptCode: '17311', description: 'Mohs micrographic surgery, first stage', category: 'Mohs', quantity: 1 });
    lines.push({ cptCode: '17312', description: 'Mohs surgery, additional stage', category: 'Mohs', quantity: 1 });
  } else if (/biopsy/.test(typeName) || /lesion/.test(typeName)) {
    lines.push({ cptCode: '99213', description: 'Established patient outpatient visit', category: 'E/M', quantity: 1 });
    lines.push({ cptCode: '11102', description: 'Tangential biopsy of skin, single lesion', category: 'Procedure', quantity: 1 });
  } else if (/new patient|consult/.test(typeName)) {
    lines.push({ cptCode: '99204', description: 'New patient office consultation', category: 'E/M', quantity: 1 });
  } else if (/patch/.test(typeName)) {
    lines.push({ cptCode: '99214', description: 'Established patient outpatient visit, moderate complexity', category: 'E/M', quantity: 1 });
    lines.push({ cptCode: '95044', description: 'Patch or application test', category: 'Testing', quantity: 8 });
  } else if (/skin check/.test(typeName)) {
    lines.push({ cptCode: '99214', description: 'Established patient outpatient visit, moderate complexity', category: 'E/M', quantity: 1 });
    if ((hashString(appointment.id) + index) % 3 === 0) {
      lines.push({ cptCode: '17000', description: 'Destruction premalignant lesion, first lesion', category: 'Procedure', quantity: 1 });
    }
  } else if (/psoriasis/.test(typeName) && /photo/.test(complaint)) {
    lines.push({ cptCode: '99214', description: 'Established patient outpatient visit, moderate complexity', category: 'E/M', quantity: 1 });
    lines.push({ cptCode: '96910', description: 'Photochemotherapy', category: 'Procedure', quantity: 1 });
  } else if (/psoriasis|eczema|acne|rosacea|follow-up|follow up|medication/.test(typeName)) {
    lines.push({ cptCode: '99213', description: 'Established patient outpatient visit', category: 'E/M', quantity: 1 });
  } else {
    lines.push({ cptCode: '99213', description: 'Established patient outpatient visit', category: 'E/M', quantity: 1 });
  }

  return lines.map((line, lineIndex) => {
    const feeItem = getFeeItem(line.cptCode);
    return {
      id: `${appointment.id}-charge-${lineIndex + 1}`,
      cptCode: line.cptCode,
      description: line.description,
      category: line.category,
      quantity: line.quantity,
      feeCents: feeItem.feeCents * line.quantity,
    };
  });
}

function buildDiagnosesForAppointment(appointment: DemoItem) {
  const typeName = String(appointment.appointmentTypeName || '').toLowerCase();
  const complaint = String(appointment.chiefComplaint || '').toLowerCase();

  if (/psoriasis/.test(typeName) || /psoriasis/.test(complaint)) {
    return [
      { id: `${appointment.id}-dx-1`, icd10Code: 'L40.0', description: 'Plaque psoriasis', isPrimary: true },
      { id: `${appointment.id}-dx-2`, icd10Code: 'Z79.899', description: 'Other long term drug therapy', isPrimary: false },
    ];
  }
  if (/eczema|dermatitis/.test(typeName) || /eczema|dermatitis/.test(complaint)) {
    return [
      { id: `${appointment.id}-dx-1`, icd10Code: 'L20.9', description: 'Atopic dermatitis, unspecified', isPrimary: true },
    ];
  }
  if (/acne/.test(typeName) || /acne/.test(complaint)) {
    return [
      { id: `${appointment.id}-dx-1`, icd10Code: 'L70.0', description: 'Acne vulgaris', isPrimary: true },
    ];
  }
  if (/rosacea/.test(typeName) || /rosacea/.test(complaint)) {
    return [
      { id: `${appointment.id}-dx-1`, icd10Code: 'L71.9', description: 'Rosacea, unspecified', isPrimary: true },
    ];
  }
  if (/mohs|basal|carcinoma/.test(typeName) || /carcinoma/.test(complaint)) {
    return [
      { id: `${appointment.id}-dx-1`, icd10Code: 'C44.311', description: 'Basal cell carcinoma of skin of other parts of face', isPrimary: true },
    ];
  }
  if (/skin check|lesion|biopsy/.test(typeName) || /lesion/.test(complaint)) {
    return [
      { id: `${appointment.id}-dx-1`, icd10Code: 'D48.5', description: 'Neoplasm of uncertain behavior of skin', isPrimary: true },
    ];
  }
  return [
    { id: `${appointment.id}-dx-1`, icd10Code: 'L98.9', description: 'Disorder of the skin and subcutaneous tissue, unspecified', isPrimary: true },
  ];
}

function chooseClaimStatus(ageDays: number, seed: number): ClaimLifecycleStatus {
  const mod = seed % 100;
  if (ageDays <= 4) {
    return mod < 45 ? 'ready' : mod < 70 ? 'draft' : 'submitted';
  }
  if (ageDays <= 14) {
    return mod < 35 ? 'submitted' : mod < 72 ? 'accepted' : mod < 82 ? 'rejected' : 'ready';
  }
  if (ageDays <= 45) {
    return mod < 28 ? 'accepted' : mod < 60 ? 'paid' : mod < 76 ? 'partially_paid' : mod < 88 ? 'denied' : 'appealed';
  }
  if (ageDays <= 120) {
    return mod < 52 ? 'paid' : mod < 72 ? 'partially_paid' : mod < 86 ? 'denied' : 'appealed';
  }
  return mod < 62 ? 'paid' : mod < 82 ? 'partially_paid' : mod < 92 ? 'denied' : 'appealed';
}

function buildBaseState(): DemoRevenueCycleState {
  const patientMap = new Map(ALL_PATIENTS.map((patient) => [patient.id, patient]));
  const completedAppointments = ALL_APPOINTMENTS
    .filter((appointment) => appointment.status === 'completed')
    .sort((left, right) => new Date(right.scheduledStart).getTime() - new Date(left.scheduledStart).getTime())
    .slice(0, 180);

  const claims: DemoClaimState[] = completedAppointments.map((appointment, index) => {
    const patient = patientMap.get(appointment.patientId) || {};
    const primaryInsurance = (patient.insuranceDetails as DemoItem | undefined)?.primary || {};
    const payerName = String(primaryInsurance.payer || 'Self-Pay');
    const payerConfig = PAYER_FACTORS[payerName] || PAYER_FACTORS['Self-Pay'];
    const charges = buildChargesForAppointment(appointment, index);
    const diagnoses = buildDiagnosesForAppointment(appointment);
    const totalCents = charges.reduce((sum, charge) => sum + charge.feeCents, 0);
    const serviceDateBase = String(appointment.scheduledStart || DEFAULT_TIMESTAMP).slice(0, 10);
    const serviceDate = index % 47 === 0 ? addDays(serviceDateBase, -(120 + (index % 11))) : serviceDateBase;
    const ageDays = daysBetween(serviceDate, toIsoDate(new Date()));
    const seed = hashString(`${appointment.id}|${payerName}|${index}`);
    const status = chooseClaimStatus(ageDays, seed);
    const coinsurance = Math.max(0, Number(primaryInsurance.coinsurancePercent || 20));
    const copayCents = Math.max(0, Math.round(Number(primaryInsurance.copayAmount || 35) * 100));
    const patientResponsibilityCents = payerName === 'Self-Pay'
      ? totalCents
      : Math.min(totalCents, Math.round(totalCents * (coinsurance / 100) * 0.45) + copayCents);
    const allowedCents = payerName === 'Self-Pay' ? totalCents : Math.round(totalCents * payerConfig.allowedFactor);
    const expectedPayerCents = Math.max(0, Math.min(totalCents - patientResponsibilityCents, allowedCents - Math.min(copayCents, patientResponsibilityCents)));

    let patientPaidCents = 0;
    let payerPaidCents = 0;
    let adjustmentCents = payerName === 'Self-Pay' ? 0 : Math.max(0, totalCents - allowedCents);
    let scrubStatus: DemoClaimState['scrubStatus'] = 'pending';
    let eraPosted = false;
    let reconciled = false;
    let submittedAt: string | undefined;
    let denialReason: string | undefined;
    let denialCode: string | undefined;
    let appealStatus: string | undefined;

    if (status !== 'draft' && status !== 'ready') {
      submittedAt = addDays(serviceDate, 1);
      scrubStatus = status === 'rejected' ? 'failed' : 'passed';
    }

    if (status === 'accepted') {
      scrubStatus = 'passed';
    }

    if (status === 'paid') {
      patientPaidCents = Math.min(patientResponsibilityCents, seed % 2 === 0 ? patientResponsibilityCents : copayCents);
      payerPaidCents = Math.max(0, totalCents - adjustmentCents - patientPaidCents);
      eraPosted = true;
      reconciled = seed % 3 !== 0;
      scrubStatus = 'passed';
    }

    if (status === 'partially_paid') {
      patientPaidCents = Math.min(patientResponsibilityCents, seed % 3 === 0 ? 0 : Math.round(patientResponsibilityCents * 0.5));
      payerPaidCents = Math.max(0, Math.round(expectedPayerCents * 0.78));
      eraPosted = payerPaidCents > 0;
      reconciled = eraPosted && seed % 4 === 0;
      scrubStatus = 'passed';
    }

    if (status === 'rejected' || status === 'denied' || status === 'appealed') {
      const denial = DENIAL_REASONS[seed % DENIAL_REASONS.length]!;
      denialReason = denial.reason;
      denialCode = denial.code;
      scrubStatus = status === 'rejected' ? 'failed' : 'passed';
      if (status === 'appealed') {
        appealStatus = 'submitted';
      }
    }

    const resolvedCents = Math.min(totalCents, patientPaidCents + payerPaidCents + adjustmentCents);
    const updatedAt = status === 'draft' || status === 'ready'
      ? `${serviceDate}T18:00:00Z`
      : `${addDays(serviceDate, Math.min(28, Math.max(1, Math.floor(ageDays * 0.3) || 1)))}T16:00:00Z`;

    return {
      id: `demo-claim-${String(index + 1).padStart(4, '0')}`,
      tenantId: TENANT_ID,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      patientFirstName: String(patient.firstName || appointment.patientName?.split(' ')[0] || 'Patient'),
      patientLastName: String(patient.lastName || appointment.patientName?.split(' ').slice(1).join(' ') || 'Demo'),
      patientName: String(appointment.patientName || `${patient.firstName || ''} ${patient.lastName || ''}`.trim()),
      dob: String(patient.dateOfBirth || ''),
      providerName: String(appointment.providerName || 'Provider'),
      payer: payerName,
      payerId: payerConfig.payerId,
      insurancePlanName: String(primaryInsurance.planName || payerName),
      serviceDate,
      createdAt: `${serviceDate}T12:00:00Z`,
      updatedAt,
      submittedAt,
      status,
      scrubStatus,
      totalCents,
      patientResponsibilityCents,
      patientPaidCents,
      payerExpectedCents: expectedPayerCents,
      payerPaidCents,
      adjustmentCents: Math.max(0, Math.min(totalCents, adjustmentCents)),
      charges,
      diagnoses,
      denialReason,
      denialCode,
      appealStatus,
      eraPosted,
      reconciled,
    };
  });

  return {
    feeSchedules: FEE_SCHEDULES.map((item) => ({ ...item })),
    feeScheduleItems: {
      'demo-fee-medical': MEDICAL_FEE_ITEMS.map((item) => ({ ...item })),
      'demo-fee-cosmetic': COSMETIC_FEE_ITEMS.map((item) => ({ ...item })),
    },
    claims,
    autoVerifyEnabled: true,
    lastAutoVerifyRun: `${toIsoDate(new Date())}T06:00:00Z`,
  };
}

function readState(): DemoRevenueCycleState {
  if (typeof window === 'undefined') {
    return buildBaseState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = buildBaseState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.claims)) {
      const initial = buildBaseState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return parsed as DemoRevenueCycleState;
  } catch {
    return buildBaseState();
  }
}

function writeState(state: DemoRevenueCycleState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function withState<T>(updater: (state: DemoRevenueCycleState) => T): T {
  const state = readState();
  const result = updater(state);
  writeState(state);
  return result;
}

function claimResolvedCents(claim: DemoClaimState): number {
  return Math.min(claim.totalCents, claim.patientPaidCents + claim.payerPaidCents + claim.adjustmentCents);
}

function claimBalanceCents(claim: DemoClaimState): number {
  return Math.max(0, claim.totalCents - claimResolvedCents(claim));
}

function toClaimApiRow(claim: DemoClaimState): DemoItem {
  return {
    id: claim.id,
    tenantId: claim.tenantId,
    patientId: claim.patientId,
    patientFirstName: claim.patientFirstName,
    patientLastName: claim.patientLastName,
    claimNumber: `CLM-DEMO-${claim.id.slice(-4)}`,
    status: claim.status,
    payer: claim.payer,
    payerName: claim.payer,
    payerId: claim.payerId,
    providerName: claim.providerName,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    submittedAt: claim.submittedAt,
    serviceDate: claim.serviceDate,
    totalCents: claim.totalCents,
    totalCharges: claim.totalCents / 100,
    paidAmountCents: claim.totalCents - claimBalanceCents(claim),
    balanceCents: claimBalanceCents(claim),
    denialReason: claim.denialReason,
    denialCode: claim.denialCode,
    appealStatus: claim.appealStatus,
    scrubStatus: claim.scrubStatus,
    insurancePlanName: claim.insurancePlanName,
    dob: claim.dob,
  };
}

function buildClaimPayments(claim: DemoClaimState): DemoItem[] {
  const payments: DemoItem[] = [];
  if (claim.payerPaidCents > 0) {
    payments.push({
      id: `${claim.id}-payer-payment`,
      tenantId: claim.tenantId,
      claimId: claim.id,
      amountCents: claim.payerPaidCents,
      paymentDate: claim.updatedAt.slice(0, 10),
      paymentMethod: 'eft',
      payer: claim.payer,
      checkNumber: '',
      notes: claim.eraPosted ? 'ERA posted from clearinghouse' : 'Payer payment applied',
      createdAt: claim.updatedAt,
    });
  }
  if (claim.patientPaidCents > 0) {
    payments.push({
      id: `${claim.id}-patient-payment`,
      tenantId: claim.tenantId,
      claimId: claim.id,
      amountCents: claim.patientPaidCents,
      paymentDate: claim.updatedAt.slice(0, 10),
      paymentMethod: (hashString(claim.id) % 3 === 0 ? 'ach' : hashString(claim.id) % 2 === 0 ? 'credit_card' : 'check'),
      payer: 'Patient',
      checkNumber: hashString(claim.id) % 2 === 0 ? '' : `CHK-${claim.id.slice(-4)}`,
      notes: 'Patient payment applied',
      createdAt: claim.updatedAt,
    });
  }
  return payments;
}

function buildClaimDetail(claim: DemoClaimState): DemoItem {
  return {
    claim: {
      ...toClaimApiRow(claim),
    },
    diagnoses: claim.diagnoses,
    charges: claim.charges.map((charge) => ({
      id: charge.id,
      cptCode: charge.cptCode,
      description: charge.description,
      quantity: charge.quantity,
      feeCents: charge.feeCents,
      linkedDiagnosisIds: claim.diagnoses.filter((dx) => dx.isPrimary).map((dx) => dx.id),
    })),
    payments: buildClaimPayments(claim),
    statusHistory: [
      {
        id: `${claim.id}-history-current`,
        tenantId: claim.tenantId,
        claimId: claim.id,
        status: claim.status === 'denied' || claim.status === 'appealed' ? 'rejected' : claim.status === 'partially_paid' ? 'accepted' : claim.status,
        notes: claim.denialReason || 'Demo claim lifecycle state',
        changedAt: claim.updatedAt,
      },
    ],
  };
}

function buildBills(state: DemoRevenueCycleState): DemoItem[] {
  return state.claims
    .filter((claim) => claim.patientResponsibilityCents > 0)
    .map((claim, index) => {
      const patientBalanceCents = Math.max(0, claim.patientResponsibilityCents - claim.patientPaidCents);
      const dueDate = addDays(claim.serviceDate, 30);
      const status = patientBalanceCents === 0
        ? 'paid'
        : claim.patientPaidCents > 0
          ? 'partial'
          : daysBetween(dueDate, toIsoDate(new Date())) > 0
            ? 'outstanding'
            : 'pending';
      return {
        id: `demo-bill-${index + 1}`,
        tenantId: claim.tenantId,
        claimId: claim.id,
        patientId: claim.patientId,
        patientName: claim.patientName,
        payer: claim.payer,
        status,
        totalChargesCents: claim.patientResponsibilityCents,
        outstandingBalanceCents: patientBalanceCents,
        dueDate,
        createdAt: claim.createdAt,
        updatedAt: claim.updatedAt,
      };
    });
}

function buildPatientPayments(state: DemoRevenueCycleState): DemoItem[] {
  return state.claims
    .filter((claim) => claim.patientPaidCents > 0)
    .map((claim, index) => ({
      id: `demo-ptpay-${index + 1}`,
      tenantId: claim.tenantId,
      claimId: claim.id,
      patientId: claim.patientId,
      patientName: claim.patientName,
      amountCents: claim.patientPaidCents,
      status: 'applied',
      source: 'patient',
      paymentMethod: hashString(claim.id) % 3 === 0 ? 'ach' : hashString(claim.id) % 2 === 0 ? 'credit_card' : 'check',
      batchId: `pt-batch-${claim.serviceDate.slice(0, 7)}`,
      paymentDate: claim.updatedAt.slice(0, 10),
      createdAt: claim.updatedAt,
    }));
}

function buildPayerPayments(state: DemoRevenueCycleState): DemoItem[] {
  return state.claims
    .filter((claim) => claim.payerPaidCents > 0)
    .map((claim, index) => ({
      id: `demo-payerpay-${index + 1}`,
      tenantId: claim.tenantId,
      claimId: claim.id,
      payerName: claim.payer,
      source: 'payer',
      amountCents: claim.payerPaidCents,
      status: 'applied',
      batchId: `payer-batch-${claim.serviceDate.slice(0, 7)}`,
      paymentDate: claim.updatedAt.slice(0, 10),
      createdAt: claim.updatedAt,
    }));
}

function buildStatements(state: DemoRevenueCycleState): DemoItem[] {
  return buildBills(state)
    .filter((bill) => bill.outstandingBalanceCents > 0)
    .map((bill, index) => ({
      id: `demo-statement-${index + 1}`,
      tenantId: bill.tenantId,
      patientId: bill.patientId,
      billId: bill.id,
      patientName: bill.patientName,
      status: 'sent',
      balanceCents: bill.outstandingBalanceCents,
      statementDate: addDays(bill.dueDate, -12),
      dueDate: bill.dueDate,
      createdAt: bill.createdAt,
    }));
}

function getEraIdForClaim(claim: DemoClaimState) {
  return `demo-era-${claim.id}`;
}

function getEftIdForClaim(claim: DemoClaimState) {
  return `demo-eft-${claim.id}`;
}

function buildEras(state: DemoRevenueCycleState): DemoItem[] {
  return state.claims
    .filter((claim) => claim.status === 'accepted' || claim.payerPaidCents > 0)
    .map((claim) => {
      const status = claim.status === 'accepted'
        ? 'pending'
        : claim.reconciled
          ? 'reconciled'
          : 'posted';
      const paymentAmountCents = claim.payerPaidCents > 0 ? claim.payerPaidCents : claim.payerExpectedCents;
      return {
        id: getEraIdForClaim(claim),
        tenantId: claim.tenantId,
        claimId: claim.id,
        eraNumber: `ERA-${claim.id.slice(-4)}`,
        payer: claim.payer,
        paymentAmountCents,
        checkNumber: `CHK-${claim.id.slice(-4)}`,
        checkDate: claim.updatedAt.slice(0, 10),
        claimsPaid: 1,
        status,
      };
    });
}

function buildEraDetails(state: DemoRevenueCycleState, eraId: string) {
  const claim = state.claims.find((entry) => getEraIdForClaim(entry) === eraId);
  if (!claim) return null;
  return {
    eraId,
    claims: [
      {
        id: claim.id,
        claimNumber: `CLM-DEMO-${claim.id.slice(-4)}`,
        chargeAmountCents: claim.totalCents,
        paidAmountCents: claim.payerPaidCents,
        adjustmentAmountCents: claim.adjustmentCents,
        status: claim.status,
      },
    ],
  };
}

function buildEfts(state: DemoRevenueCycleState): DemoItem[] {
  return state.claims
    .filter((claim) => claim.payerPaidCents > 0)
    .map((claim) => ({
      id: getEftIdForClaim(claim),
      tenantId: claim.tenantId,
      claimId: claim.id,
      eftTraceNumber: `EFT-${claim.id.slice(-4)}`,
      payer: claim.payer,
      paymentAmountCents: claim.payerPaidCents,
      depositDate: claim.updatedAt.slice(0, 10),
      transactionType: 'CCD+',
      reconciled: claim.reconciled,
      varianceCents: claim.reconciled ? 0 : hashString(claim.id) % 5 === 0 ? -2500 : 0,
    }));
}

function buildBatches(state: DemoRevenueCycleState): DemoItem[] {
  const claimCount = state.claims.filter((claim) => claim.status === 'submitted' || claim.status === 'accepted').length;
  return [
    {
      id: 'demo-batch-claims-open',
      tenantId: TENANT_ID,
      batchType: 'claims',
      status: 'open',
      itemCount: claimCount,
      createdAt: `${toIsoDate(new Date())}T08:00:00Z`,
    },
    {
      id: 'demo-batch-payments-today',
      tenantId: TENANT_ID,
      batchType: 'payments',
      status: 'posted',
      itemCount: buildPayerPayments(state).length + buildPatientPayments(state).length,
      createdAt: `${toIsoDate(new Date())}T12:00:00Z`,
    },
  ];
}

function inRange(dateValue: string, startDate?: string | null, endDate?: string | null) {
  if (startDate && dateValue < startDate) return false;
  if (endDate && dateValue > endDate) return false;
  return true;
}

function bucketClaimsByDate(state: DemoRevenueCycleState, startDate?: string | null, endDate?: string | null, granularity: 'day' | 'week' | 'month' = 'day') {
  const revenueByBucket = new Map<string, DemoItem>();
  const bills = buildBills(state);
  const payerPayments = buildPayerPayments(state);
  const patientPayments = buildPatientPayments(state);
  const currentEnd = endDate || toIsoDate(new Date());

  const toBucket = (dateString: string) => {
    if (granularity === 'month') return `${dateString.slice(0, 7)}-01`;
    if (granularity === 'week') {
      const date = startOfDay(`${dateString}T00:00:00Z`);
      const day = date.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      date.setDate(date.getDate() + diffToMonday);
      return toIsoDate(date);
    }
    return dateString;
  };

  for (const claim of state.claims) {
    if (!inRange(claim.serviceDate, startDate, endDate)) continue;
    const bucket = toBucket(claim.serviceDate);
    const existing = revenueByBucket.get(bucket) || {
      bucketStartDate: bucket,
      revenueEarnedCents: 0,
      paymentsCollectedCents: 0,
      patientPaymentsCents: 0,
      payerPaymentsCents: 0,
      billCount: 0,
      paymentCount: 0,
      revenueCategories: [] as DemoItem[],
    };
    existing.revenueEarnedCents += claim.totalCents;
    const categories = new Map<string, DemoItem>(existing.revenueCategories.map((item: DemoItem) => [item.key, item]));
    for (const charge of claim.charges) {
      const key = String(charge.category || 'other').toLowerCase().replace(/\s+/g, '_');
      const current = categories.get(key) || { key, label: charge.category || 'Other', revenueCents: 0, itemCount: 0 };
      current.revenueCents += charge.feeCents;
      current.itemCount += 1;
      categories.set(key, current);
    }
    existing.revenueCategories = [...categories.values()];
    revenueByBucket.set(bucket, existing);
  }

  for (const payment of [...payerPayments, ...patientPayments]) {
    const paymentDate = String(payment.paymentDate || '').slice(0, 10);
    if (!inRange(paymentDate, startDate, endDate)) continue;
    const bucket = toBucket(paymentDate);
    const existing = revenueByBucket.get(bucket) || {
      bucketStartDate: bucket,
      revenueEarnedCents: 0,
      paymentsCollectedCents: 0,
      patientPaymentsCents: 0,
      payerPaymentsCents: 0,
      billCount: 0,
      paymentCount: 0,
      revenueCategories: [] as DemoItem[],
    };
    existing.paymentsCollectedCents += payment.amountCents;
    existing.paymentCount += 1;
    if (payment.source === 'payer') {
      existing.payerPaymentsCents += payment.amountCents;
    } else {
      existing.patientPaymentsCents += payment.amountCents;
    }
    revenueByBucket.set(bucket, existing);
  }

  for (const bill of bills) {
    const billDate = String(bill.createdAt || '').slice(0, 10);
    if (!inRange(billDate, startDate, endDate)) continue;
    const bucket = toBucket(billDate);
    const existing = revenueByBucket.get(bucket) || {
      bucketStartDate: bucket,
      revenueEarnedCents: 0,
      paymentsCollectedCents: 0,
      patientPaymentsCents: 0,
      payerPaymentsCents: 0,
      billCount: 0,
      paymentCount: 0,
      revenueCategories: [] as DemoItem[],
    };
    existing.billCount += 1;
    revenueByBucket.set(bucket, existing);
  }

  const data = [...revenueByBucket.values()].sort((left, right) => String(left.bucketStartDate).localeCompare(String(right.bucketStartDate)));
  const summary = {
    totalPaymentsCollectedCents: data.reduce((sum, row) => sum + row.paymentsCollectedCents, 0),
    totalRevenueEarnedCents: data.reduce((sum, row) => sum + row.revenueEarnedCents, 0),
    totalPatientPaymentsCents: data.reduce((sum, row) => sum + row.patientPaymentsCents, 0),
    totalPayerPaymentsCents: data.reduce((sum, row) => sum + row.payerPaymentsCents, 0),
    totalPaymentCount: data.reduce((sum, row) => sum + row.paymentCount, 0),
    totalBillCount: data.reduce((sum, row) => sum + row.billCount, 0),
    dayCount: Math.max(1, data.length),
    avgDailyPaymentsCollectedCents: 0,
    avgDailyRevenueEarnedCents: 0,
    collectionRate: 0,
    revenueCategories: [] as DemoItem[],
  };
  summary.avgDailyPaymentsCollectedCents = Math.round(summary.totalPaymentsCollectedCents / summary.dayCount);
  summary.avgDailyRevenueEarnedCents = Math.round(summary.totalRevenueEarnedCents / summary.dayCount);
  summary.collectionRate = summary.totalRevenueEarnedCents > 0
    ? Number(((summary.totalPaymentsCollectedCents / summary.totalRevenueEarnedCents) * 100).toFixed(1))
    : 0;

  const categoryMap = new Map<string, DemoItem>();
  for (const row of data) {
    for (const category of row.revenueCategories || []) {
      const current = categoryMap.get(category.key) || { ...category, revenueCents: 0, itemCount: 0 };
      current.revenueCents += category.revenueCents;
      current.itemCount += category.itemCount;
      categoryMap.set(category.key, current);
    }
  }
  summary.revenueCategories = [...categoryMap.values()];

  if (data.length === 0 && currentEnd) {
    data.push({
      bucketStartDate: currentEnd,
      revenueEarnedCents: 0,
      paymentsCollectedCents: 0,
      patientPaymentsCents: 0,
      payerPaymentsCents: 0,
      billCount: 0,
      paymentCount: 0,
      revenueCategories: [],
    });
  }

  return { data, summary };
}

function buildDashboardSnapshot(state: DemoRevenueCycleState, startDate: string, endDate: string, key: 'daily' | 'weekly' | 'monthly', label: string, rangeLabel: string) {
  const claims = state.claims.filter((claim) => inRange(claim.serviceDate, startDate, endDate));
  const completedAppointments = claims.length;
  const totalRevenueCents = claims.reduce((sum, claim) => sum + claim.totalCents, 0);
  const payerPayments = claims.reduce((sum, claim) => sum + claim.payerPaidCents, 0);
  const patientPayments = claims.reduce((sum, claim) => sum + claim.patientPaidCents, 0);
  const collectionsCents = payerPayments + patientPayments;
  const categoryMap = new Map<string, DemoItem>();
  for (const claim of claims) {
    for (const charge of claim.charges) {
      const item = categoryMap.get(charge.category) || { key: String(charge.category).toLowerCase().replace(/\s+/g, '_'), label: charge.category, revenueCents: 0, itemCount: 0 };
      item.revenueCents += charge.feeCents;
      item.itemCount += 1;
      categoryMap.set(charge.category, item);
    }
  }

  return {
    key,
    label,
    rangeLabel,
    completedAppointments,
    totalRevenueCents,
    collectionsCents,
    avgRevenuePerVisitCents: completedAppointments ? Math.round(totalRevenueCents / completedAppointments) : 0,
    collectionRate: totalRevenueCents ? Number(((collectionsCents / totalRevenueCents) * 100).toFixed(1)) : 0,
    benchmarkVisitsCount: completedAppointments + Math.max(1, Math.round(completedAppointments * 0.08)),
    standaloneRevenueCents: claims.filter((claim) => claim.charges.length === 1).reduce((sum, claim) => sum + claim.totalCents, 0),
    revenueCategories: [...categoryMap.values()],
  };
}

export function getDemoFinancialDashboard(date?: string) {
  const state = readState();
  const mostRecentServiceDate = state.claims
    .map((claim) => claim.serviceDate)
    .sort((left, right) => right.localeCompare(left))[0];
  const today = date || mostRecentServiceDate || toIsoDate(new Date());
  return {
    snapshots: {
      daily: buildDashboardSnapshot(state, today, today, 'daily', 'Daily Snapshot', new Date(`${today}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })),
      weekly: buildDashboardSnapshot(state, addDays(today, -6), today, 'weekly', 'Weekly Snapshot', 'Last 7 days'),
      monthly: buildDashboardSnapshot(state, `${today.slice(0, 7)}-01`, today, 'monthly', 'Monthly Snapshot', 'Month to date'),
      sourceNote: 'Demo financials are derived from the same fee schedules, claims, patient balances, ERAs, and EFTs.',
    },
  };
}

export function getDemoCollectionsTrend(startDate?: string | null, endDate?: string | null, granularity: 'day' | 'week' | 'month' = 'day') {
  const state = readState();
  return bucketClaimsByDate(state, startDate, endDate, granularity);
}

export function getDemoPaymentsSummary(startDate?: string | null, endDate?: string | null) {
  const state = readState();
  const payerPayments = buildPayerPayments(state).filter((payment) => inRange(payment.paymentDate, startDate, endDate));
  const patientPayments = buildPatientPayments(state).filter((payment) => inRange(payment.paymentDate, startDate, endDate));
  const bills = buildBills(state).filter((bill) => inRange(String(bill.createdAt || '').slice(0, 10), startDate, endDate));
  const outstandingBills = bills.filter((bill) => bill.outstandingBalanceCents > 0);
  const outstandingBalanceCents = outstandingBills.reduce((sum, bill) => sum + bill.outstandingBalanceCents, 0);
  const overdueBills = outstandingBills.filter((bill) => daysBetween(bill.dueDate, toIsoDate(new Date())) > 0);

  const patientPaymentsByMethodMap = new Map<string, { paymentMethod: string; count: number; totalCents: number }>();
  for (const payment of patientPayments) {
    const method = String(payment.paymentMethod || 'other');
    const current = patientPaymentsByMethodMap.get(method) || { paymentMethod: method, count: 0, totalCents: 0 };
    current.count += 1;
    current.totalCents += payment.amountCents;
    patientPaymentsByMethodMap.set(method, current);
  }

  const totalRevenue = state.claims.filter((claim) => inRange(claim.serviceDate, startDate, endDate)).reduce((sum, claim) => sum + claim.totalCents, 0);
  const totalPayments = payerPayments.reduce((sum, payment) => sum + payment.amountCents, 0) + patientPayments.reduce((sum, payment) => sum + payment.amountCents, 0);

  return {
    calculated: {
      netCollectionRate: totalRevenue > 0 ? Number(((totalPayments / totalRevenue) * 100).toFixed(1)) : 0,
    },
    receivables: {
      outstandingBalanceCents,
      overdueBalanceCents: overdueBills.reduce((sum, bill) => sum + bill.outstandingBalanceCents, 0),
      overdueCount: overdueBills.length,
    },
    payerPaymentsSummary: {
      appliedCents: payerPayments.reduce((sum, payment) => sum + payment.amountCents, 0),
      unappliedCents: buildEfts(state).filter((eft) => !eft.reconciled).reduce((sum, eft) => sum + Math.max(0, eft.varianceCents || 0), 0),
    },
    patientPaymentsByMethod: [...patientPaymentsByMethodMap.values()],
  };
}

export function getDemoARAging(asOfDate?: string | null) {
  const state = readState();
  const referenceDate = asOfDate || toIsoDate(new Date());
  const bills = buildBills(state);
  const buckets = [
    { key: '0-30', label: '0-30 days', billCount: 0, totalBalanceCents: 0 },
    { key: '31-60', label: '31-60 days', billCount: 0, totalBalanceCents: 0 },
    { key: '61-90', label: '61-90 days', billCount: 0, totalBalanceCents: 0 },
    { key: '91-120', label: '91-120 days', billCount: 0, totalBalanceCents: 0 },
    { key: '120+', label: '120+ days', billCount: 0, totalBalanceCents: 0 },
  ];

  for (const bill of bills.filter((entry) => entry.outstandingBalanceCents > 0)) {
    const age = daysBetween(String(bill.createdAt || '').slice(0, 10), referenceDate);
    const bucket = age <= 30
      ? buckets[0]
      : age <= 60
        ? buckets[1]
        : age <= 90
          ? buckets[2]
          : age <= 120
            ? buckets[3]
            : buckets[4];
    bucket.billCount += 1;
    bucket.totalBalanceCents += bill.outstandingBalanceCents;
  }

  return { buckets };
}

export function getDemoBillsSummary(startDate?: string | null, endDate?: string | null) {
  const bills = buildBills(readState()).filter((bill) => inRange(String(bill.createdAt || '').slice(0, 10), startDate, endDate));
  const statusMap = new Map<string, { status: string; count: number; totalChargesCents: number }>();
  for (const bill of bills) {
    const current = statusMap.get(bill.status) || { status: bill.status, count: 0, totalChargesCents: 0 };
    current.count += 1;
    current.totalChargesCents += bill.totalChargesCents;
    statusMap.set(bill.status, current);
  }
  return { billsByStatus: [...statusMap.values()] };
}

export function queryDemoClaims(params: URLSearchParams) {
  const state = readState();
  const status = params.get('status');
  const patientId = params.get('patientId');
  const startDate = params.get('startDate');
  const endDate = params.get('endDate');
  let claims = state.claims;
  if (status) claims = claims.filter((claim) => claim.status === status);
  if (patientId) claims = claims.filter((claim) => claim.patientId === patientId);
  if (startDate) claims = claims.filter((claim) => claim.serviceDate >= startDate);
  if (endDate) claims = claims.filter((claim) => claim.serviceDate <= endDate);
  const rows = claims.map(toClaimApiRow);
  return { claims: rows, data: rows };
}

export function getDemoClaimDetail(claimId: string) {
  const claim = readState().claims.find((entry) => entry.id === claimId);
  return claim ? buildClaimDetail(claim) : null;
}

export function getDemoClaimMetrics() {
  const claims = readState().claims;
  const totalClaims = claims.length;
  const totalBilledCents = claims.reduce((sum, claim) => sum + claim.totalCents, 0);
  const totalOutstandingCents = claims.reduce((sum, claim) => sum + claimBalanceCents(claim), 0);
  const totalPaidCents = claims.reduce((sum, claim) => sum + (claim.totalCents - claimBalanceCents(claim)), 0);
  const pendingCount = claims.filter((claim) => claim.status === 'submitted' || claim.status === 'accepted').length;
  const denialCount = claims.filter((claim) => claim.status === 'rejected' || claim.status === 'denied').length;
  const paidCount = claims.filter((claim) => claim.status === 'paid').length;
  const adjudicated = claims.filter((claim) => !['draft', 'ready'].includes(claim.status)).length || 1;
  return {
    totalClaims,
    totalBilledCents,
    totalOutstandingCents,
    totalPaidCents,
    pendingCount,
    denialCount,
    paidCount,
    firstPassPaidRate: Number(((paidCount / adjudicated) * 100).toFixed(1)),
    denialRate: Number(((denialCount / adjudicated) * 100).toFixed(1)),
  };
}

export function submitDemoClaim(claimId: string) {
  return withState((state) => {
    const claim = state.claims.find((entry) => entry.id === claimId);
    if (!claim) throw new Error('Claim not found');
    claim.status = 'submitted';
    claim.submittedAt = `${toIsoDate(new Date())}T12:00:00Z`;
    claim.updatedAt = `${toIsoDate(new Date())}T12:00:00Z`;
    claim.scrubStatus = 'passed';
    return {
      status: 'submitted',
      message: 'Claim submitted to demo clearinghouse',
      controlNumber: `CTRL-${claim.id.slice(-6).toUpperCase()}`,
    };
  });
}

export function getDemoClaimStatus(claimId: string) {
  return withState((state) => {
    const claim = state.claims.find((entry) => entry.id === claimId);
    if (!claim) throw new Error('Claim not found');
    if (claim.status === 'submitted' && hashString(claim.id) % 4 !== 0) {
      claim.status = 'accepted';
      claim.updatedAt = `${toIsoDate(new Date())}T13:15:00Z`;
    } else if (claim.status === 'submitted') {
      claim.status = 'rejected';
      const denial = DENIAL_REASONS[hashString(claim.id) % DENIAL_REASONS.length]!;
      claim.denialCode = denial.code;
      claim.denialReason = denial.reason;
      claim.scrubStatus = 'failed';
      claim.updatedAt = `${toIsoDate(new Date())}T13:15:00Z`;
    }
    return {
      status: claim.status,
      message: claim.status === 'accepted'
        ? 'Accepted by clearinghouse and queued for payer acknowledgement'
        : claim.status === 'rejected'
          ? claim.denialReason || 'Rejected'
          : 'Awaiting clearinghouse acknowledgement',
      controlNumber: `CTRL-${claim.id.slice(-6).toUpperCase()}`,
    };
  });
}

export function getDemoERAs(params: URLSearchParams) {
  let eras = buildEras(readState());
  const status = params.get('status');
  const payer = (params.get('payer') || '').toLowerCase();
  if (status) eras = eras.filter((era) => era.status === status);
  if (payer) eras = eras.filter((era) => String(era.payer || '').toLowerCase().includes(payer));
  return { eras };
}

export function getDemoEraDetails(eraId: string) {
  const details = buildEraDetails(readState(), eraId);
  if (!details) throw new Error('ERA not found');
  return details;
}

export function postDemoEra(eraId: string) {
  return withState((state) => {
    const claim = state.claims.find((entry) => getEraIdForClaim(entry) === eraId);
    if (!claim) throw new Error('ERA not found');
    if (claim.status === 'accepted') {
      claim.payerPaidCents = Math.max(claim.payerPaidCents, claim.payerExpectedCents);
      claim.eraPosted = true;
      claim.updatedAt = `${toIsoDate(new Date())}T14:00:00Z`;
      claim.status = claimBalanceCents(claim) === 0 ? 'paid' : 'partially_paid';
    } else {
      claim.eraPosted = true;
      claim.updatedAt = `${toIsoDate(new Date())}T14:00:00Z`;
    }
    return { success: true, claimsPosted: 1 };
  });
}

export function getDemoEfts(params: URLSearchParams) {
  let efts = buildEfts(readState());
  const reconciled = params.get('reconciled');
  const payer = (params.get('payer') || '').toLowerCase();
  if (reconciled === 'true') efts = efts.filter((eft) => eft.reconciled);
  if (reconciled === 'false') efts = efts.filter((eft) => !eft.reconciled);
  if (payer) efts = efts.filter((eft) => String(eft.payer || '').toLowerCase().includes(payer));
  return { efts };
}

export function reconcileDemoPayments(eraId: string, eftId?: string, notes?: string) {
  return withState((state) => {
    const claim = state.claims.find((entry) => getEraIdForClaim(entry) === eraId || (eftId && getEftIdForClaim(entry) === eftId));
    if (!claim) throw new Error('Matching payment not found');
    claim.reconciled = true;
    claim.eraPosted = true;
    claim.updatedAt = `${toIsoDate(new Date())}T15:30:00Z`;
    return {
      status: 'balanced',
      varianceCents: 0,
      notes,
    };
  });
}

export function getDemoClosingReport(startDate: string, endDate: string, reportType = 'daily') {
  const state = readState();
  const claims = state.claims.filter((claim) => inRange(claim.serviceDate, startDate, endDate));
  const payerPayments = buildPayerPayments(state).filter((payment) => inRange(payment.paymentDate, startDate, endDate));
  const patientPayments = buildPatientPayments(state).filter((payment) => inRange(payment.paymentDate, startDate, endDate));
  const eras = buildEras(state).filter((era) => inRange(era.checkDate, startDate, endDate));
  const efts = buildEfts(state).filter((eft) => inRange(eft.depositDate, startDate, endDate));
  const totalChargesCents = claims.reduce((sum, claim) => sum + claim.totalCents, 0);
  const totalPaymentsCents = payerPayments.reduce((sum, item) => sum + item.amountCents, 0) + patientPayments.reduce((sum, item) => sum + item.amountCents, 0);
  const totalAdjustmentsCents = claims.reduce((sum, claim) => sum + claim.adjustmentCents, 0);
  const outstandingBalanceCents = claims.reduce((sum, claim) => sum + claimBalanceCents(claim), 0);
  return {
    reportType,
    startDate,
    endDate,
    totalChargesCents,
    totalPaymentsCents,
    totalAdjustmentsCents,
    outstandingBalanceCents,
    claimsSubmitted: claims.filter((claim) => claim.status === 'submitted').length,
    claimsPaid: claims.filter((claim) => claim.status === 'paid').length,
    claimsDenied: claims.filter((claim) => claim.status === 'denied' || claim.status === 'rejected').length,
    erasReceived: eras.length,
    eftsReceived: efts.length,
    reconciliationVarianceCents: efts.reduce((sum, eft) => sum + (eft.varianceCents || 0), 0),
  };
}

export function queryDemoBills(params: URLSearchParams) {
  let bills = buildBills(readState());
  const patientId = params.get('patientId');
  const status = params.get('status');
  const startDate = params.get('startDate');
  const endDate = params.get('endDate');
  if (patientId) bills = bills.filter((bill) => bill.patientId === patientId);
  if (status) bills = bills.filter((bill) => bill.status === status);
  if (startDate) bills = bills.filter((bill) => String(bill.createdAt || '').slice(0, 10) >= startDate);
  if (endDate) bills = bills.filter((bill) => String(bill.createdAt || '').slice(0, 10) <= endDate);
  return { data: bills, bills, meta: { total: bills.length } };
}

export function queryDemoPayerPayments(params: URLSearchParams) {
  let payments = buildPayerPayments(readState());
  const payerName = (params.get('payerName') || '').toLowerCase();
  const status = params.get('status');
  if (payerName) payments = payments.filter((payment) => String(payment.payerName || '').toLowerCase().includes(payerName));
  if (status) payments = payments.filter((payment) => payment.status === status);
  return { data: payments, payments, meta: { total: payments.length } };
}

export function queryDemoPatientPayments(params: URLSearchParams) {
  let payments = buildPatientPayments(readState());
  const patientId = params.get('patientId');
  const method = params.get('paymentMethod');
  const status = params.get('status');
  if (patientId) payments = payments.filter((payment) => payment.patientId === patientId);
  if (method) payments = payments.filter((payment) => payment.paymentMethod === method);
  if (status) payments = payments.filter((payment) => payment.status === status);
  return { data: payments, payments, meta: { total: payments.length } };
}

export function queryDemoStatements(params: URLSearchParams) {
  let statements = buildStatements(readState());
  const patientId = params.get('patientId');
  const status = params.get('status');
  if (patientId) statements = statements.filter((statement) => statement.patientId === patientId);
  if (status) statements = statements.filter((statement) => statement.status === status);
  return { data: statements, statements, meta: { total: statements.length } };
}

export function queryDemoBatches() {
  const data = buildBatches(readState());
  return { data, batches: data, meta: { total: data.length } };
}

export function getDemoFeeSchedules() {
  return readState().feeSchedules.map((schedule) => ({ ...schedule }));
}

export function getDemoFeeSchedule(scheduleId: string) {
  const state = readState();
  const schedule = state.feeSchedules.find((item) => item.id === scheduleId);
  if (!schedule) return null;
  return { ...schedule, items: (state.feeScheduleItems[scheduleId] || []).map((item) => ({ ...item })) };
}

export function createDemoFeeSchedule(data: DemoItem) {
  return withState((state) => {
    const id = `demo-fee-${Date.now()}`;
    const schedule = {
      id,
      tenantId: TENANT_ID,
      name: String(data.name || 'New Fee Schedule'),
      isDefault: Boolean(data.isDefault),
      description: String(data.description || ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (schedule.isDefault) {
      state.feeSchedules = state.feeSchedules.map((item) => ({ ...item, isDefault: false }));
    }
    state.feeSchedules.push(schedule);
    state.feeScheduleItems[id] = data.cloneFromId && state.feeScheduleItems[data.cloneFromId]
      ? state.feeScheduleItems[data.cloneFromId].map((item: DemoItem) => ({
          ...item,
          id: `${item.id}-${id}`,
          feeScheduleId: id,
          createdAt: schedule.createdAt,
          updatedAt: schedule.updatedAt,
        }))
      : [];
    return schedule;
  });
}

export function updateDemoFeeSchedule(scheduleId: string, data: DemoItem) {
  return withState((state) => {
    const index = state.feeSchedules.findIndex((item) => item.id === scheduleId);
    if (index === -1) throw new Error('Fee schedule not found');
    if (data.isDefault) {
      state.feeSchedules = state.feeSchedules.map((item) => ({ ...item, isDefault: item.id === scheduleId }));
    }
    const schedule = state.feeSchedules[index]!;
    const next = {
      ...schedule,
      name: data.name ?? schedule.name,
      isDefault: data.isDefault ?? schedule.isDefault,
      description: data.description ?? schedule.description,
      updatedAt: new Date().toISOString(),
    };
    state.feeSchedules[index] = next;
    return next;
  });
}

export function deleteDemoFeeSchedule(scheduleId: string) {
  return withState((state) => {
    state.feeSchedules = state.feeSchedules.filter((item) => item.id !== scheduleId);
    delete state.feeScheduleItems[scheduleId];
    if (!state.feeSchedules.some((item) => item.isDefault) && state.feeSchedules[0]) {
      state.feeSchedules[0].isDefault = true;
    }
    return { success: true };
  });
}

export function getDemoFeeScheduleItems(scheduleId: string) {
  return (readState().feeScheduleItems[scheduleId] || []).map((item) => ({ ...item }));
}

export function updateDemoFeeScheduleItem(scheduleId: string, cptCode: string, data: DemoItem) {
  return withState((state) => {
    const items = state.feeScheduleItems[scheduleId] || [];
    const existing = items.find((item) => item.cptCode === cptCode);
    if (existing) {
      Object.assign(existing, {
        cptCode: data.cptCode ?? existing.cptCode,
        cptDescription: data.cptDescription ?? existing.cptDescription,
        category: data.category ?? existing.category,
        feeCents: Number(data.feeCents ?? existing.feeCents) || 0,
        updatedAt: new Date().toISOString(),
      });
      return existing;
    }
    const next = {
      id: `demo-item-${scheduleId}-${cptCode}`,
      feeScheduleId: scheduleId,
      cptCode,
      cptDescription: String(data.cptDescription || ''),
      category: String(data.category || 'Other'),
      feeCents: Number(data.feeCents || 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.feeScheduleItems[scheduleId] = [...items, next];
    return next;
  });
}

export function deleteDemoFeeScheduleItem(scheduleId: string, cptCode: string) {
  return withState((state) => {
    state.feeScheduleItems[scheduleId] = (state.feeScheduleItems[scheduleId] || []).filter((item: DemoItem) => item.cptCode !== cptCode);
    return { success: true };
  });
}

export function importDemoFeeScheduleItems(scheduleId: string, items: DemoItem[]) {
  return withState((state) => {
    const existing = state.feeScheduleItems[scheduleId] || [];
    const normalized = items.map((item, index) => ({
      id: item.id || `demo-import-${scheduleId}-${Date.now()}-${index}`,
      feeScheduleId: scheduleId,
      cptCode: String(item.cptCode || item.cpt_code || ''),
      cptDescription: String(item.cptDescription || item.cpt_description || ''),
      category: String(item.category || 'Other'),
      feeCents: Number(item.feeCents || item.fee_cents || 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })).filter((item) => item.cptCode);
    state.feeScheduleItems[scheduleId] = [...existing, ...normalized];
    return { imported: normalized.length };
  });
}

export function exportDemoFeeScheduleCsv(scheduleId: string) {
  const items = getDemoFeeScheduleItems(scheduleId);
  const lines = [
    'cptCode,cptDescription,category,feeCents',
    ...items.map((item) => [item.cptCode, item.cptDescription || '', item.category || '', item.feeCents].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ];
  return lines.join('\n');
}

export function getDemoDefaultFeeSchedule() {
  const schedules = getDemoFeeSchedules();
  return schedules.find((schedule) => schedule.isDefault) || schedules[0] || null;
}

export function getDemoFeeForCpt(cptCode: string) {
  const state = readState();
  const defaultSchedule = state.feeSchedules.find((item) => item.isDefault) || state.feeSchedules[0];
  const fee = (state.feeScheduleItems[defaultSchedule?.id || ''] || []).find((item: DemoItem) => item.cptCode === cptCode);
  return fee || null;
}

export function getDemoCosmeticCategories() {
  return {
    categories: [
      { id: 'neurotoxins', categoryName: 'neurotoxins', displayName: 'Neurotoxins', description: 'Botox and similar injectable neuromodulators', sortOrder: 1 },
      { id: 'dermal_fillers', categoryName: 'dermal_fillers', displayName: 'Dermal Fillers', description: 'Filler procedures and volume restoration', sortOrder: 2 },
      { id: 'chemical_peels', categoryName: 'chemical_peels', displayName: 'Chemical Peels', description: 'Peels and resurfacing', sortOrder: 3 },
      { id: 'microneedling', categoryName: 'microneedling', displayName: 'Microneedling', description: 'Collagen induction procedures', sortOrder: 4 },
      { id: 'other_cosmetic', categoryName: 'other_cosmetic', displayName: 'Other Cosmetic', description: 'Additional self-pay cosmetic services', sortOrder: 5 },
    ],
  };
}

export function getDemoCosmeticPricing(params: URLSearchParams) {
  const category = params.get('category');
  const search = (params.get('search') || '').toLowerCase();
  let procedures = COSMETIC_FEE_ITEMS.map((item) => ({
    ...item,
    id: item.id,
    description: item.cptDescription,
    baseFee_cents: item.feeCents,
    subcategory: '',
    units: String(item.typicalUnits || 1),
  }));
  if (category) procedures = procedures.filter((item) => item.category === category);
  if (search) procedures = procedures.filter((item) => String(item.description || '').toLowerCase().includes(search) || String(item.cptCode || '').toLowerCase().includes(search));
  return { procedures };
}

function getUpcomingAppointmentsByPatient() {
  const grouped = new Map<string, string | null>();
  for (const appointment of ALL_APPOINTMENTS) {
    if (!['scheduled', 'checked_in'].includes(String(appointment.status || ''))) continue;
    const date = String(appointment.scheduledStart || '').slice(0, 10);
    const existing = grouped.get(appointment.patientId);
    if (!existing || date < existing) {
      grouped.set(appointment.patientId, date);
    }
  }
  return grouped;
}

function lastVerifiedAtForPatient(patientId: string) {
  const daysAgo = 9 + (hashString(patientId) % 46);
  return addDays(toIsoDate(new Date()), -daysAgo);
}

export function getDemoEligibilityIssues() {
  const upcoming = getUpcomingAppointmentsByPatient();
  const patients = ALL_PATIENTS
    .filter((patient) => upcoming.has(patient.id))
    .filter((patient) => hashString(patient.id) % 7 === 0)
    .slice(0, 18)
    .map((patient) => {
      const primary = (patient.insuranceDetails as DemoItem | undefined)?.primary || {};
      const issues = [
        { issueType: 'Authorization Needed', issueNotes: 'Payer requires authorization before next high-cost treatment.' },
        { issueType: 'Plan Expiring', issueNotes: 'Coverage needs re-verification before visit date.' },
        { issueType: 'Referral Missing', issueNotes: 'Specialist referral not yet attached for this HMO patient.' },
      ];
      const issue = issues[hashString(patient.id) % issues.length]!;
      return {
        patientId: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        payerName: primary.payer || 'Self-Pay',
        verificationStatus: 'issue',
        verifiedAt: `${lastVerifiedAtForPatient(patient.id)}T08:00:00Z`,
        issueType: issue.issueType,
        issueNotes: issue.issueNotes,
        nextAppointment: upcoming.get(patient.id) || null,
      };
    });
  return { success: true, count: patients.length, patients };
}

export function getDemoEligibilityPending(daysThreshold = 30) {
  const upcoming = getUpcomingAppointmentsByPatient();
  const patients = ALL_PATIENTS
    .filter((patient) => upcoming.has(patient.id))
    .map((patient) => {
      const lastVerifiedAt = lastVerifiedAtForPatient(patient.id);
      const daysSinceVerification = daysBetween(lastVerifiedAt, toIsoDate(new Date()));
      return {
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        lastVerifiedAt: `${lastVerifiedAt}T08:00:00Z`,
        daysSinceVerification,
        upcomingAppointmentDate: upcoming.get(patient.id) || null,
        upcoming_appointment_date: upcoming.get(patient.id) || null,
      };
    })
    .filter((patient) => (patient.daysSinceVerification || 0) >= daysThreshold)
    .sort((left, right) => (right.daysSinceVerification || 0) - (left.daysSinceVerification || 0))
    .slice(0, 28);
  return { success: true, count: patients.length, patients };
}

export function getDemoAutoVerifyStats() {
  const pending = getDemoEligibilityPending(30).patients;
  const today = toIsoDate(new Date());
  return {
    success: true,
    stats: {
      enabled: readState().autoVerifyEnabled,
      lastRun: readState().lastAutoVerifyRun,
      todayCount: pending.filter((patient: DemoItem) => patient.upcomingAppointmentDate === today).length,
      tomorrowScheduled: pending.filter((patient: DemoItem) => patient.upcomingAppointmentDate === addDays(today, 1)).length,
    },
  };
}

export function toggleDemoAutoVerify(enabled: boolean) {
  return withState((state) => {
    state.autoVerifyEnabled = enabled;
    state.lastAutoVerifyRun = new Date().toISOString();
    return {
      success: true,
      stats: {
        enabled: state.autoVerifyEnabled,
        lastRun: state.lastAutoVerifyRun,
        todayCount: getDemoEligibilityPending(30).patients.filter((patient: DemoItem) => patient.upcomingAppointmentDate === toIsoDate(new Date())).length,
        tomorrowScheduled: getDemoEligibilityPending(30).patients.filter((patient: DemoItem) => patient.upcomingAppointmentDate === addDays(toIsoDate(new Date()), 1)).length,
      },
    };
  });
}

export function getDemoBenefits(patientId: string) {
  const patient = ALL_PATIENTS.find((entry) => entry.id === patientId);
  if (!patient) return null;
  const primary = (patient.insuranceDetails as DemoItem | undefined)?.primary || {};
  const deductibleTotal = Number(primary.deductible || 0);
  const deductibleRemaining = Number(primary.remainingDeductible || 0);
  const oopMax = Number(primary.outOfPocket || 0);
  const oopRemaining = Number(primary.remainingOutOfPocket || 0);
  return {
    success: true,
    benefits: {
      patientId,
      payerName: primary.payer || 'Self-Pay',
      planName: primary.planName || 'Cash Pay',
      officeCopay: Number(primary.copayAmount || 0),
      specialistCopay: Number(primary.copayAmount || 0),
      deductibleTotal,
      deductibleMet: Math.max(0, deductibleTotal - deductibleRemaining),
      deductibleRemaining,
      oopMax,
      oopMet: Math.max(0, oopMax - oopRemaining),
      oopRemaining,
      coinsurancePercent: Number(primary.coinsurancePercent || 0),
      effectiveDate: primary.policyEffectiveDate || '2026-01-01',
      terminationDate: primary.policyEndDate || null,
      verificationStatus: primary.eligibilityStatus || 'Active',
    },
  };
}

export function getDemoPriorAuthRequirement(cptCode: string) {
  const normalized = cptCode.toUpperCase();
  const matched = PRIOR_AUTH_RULES.find((rule) => rule.cptCode === normalized);
  return {
    success: true,
    requirement: matched || {
      cptCode: normalized,
      description: getFeeItem(normalized)?.cptDescription || 'Procedure',
      requiresAuth: false,
      payerSpecific: [
        { payerName: 'Aetna', required: false, notes: 'No routine prior auth requirement in demo dataset.' },
        { payerName: 'Blue Cross Blue Shield of Colorado', required: false, notes: 'No routine prior auth requirement in demo dataset.' },
        { payerName: 'United Healthcare', required: false, notes: 'No routine prior auth requirement in demo dataset.' },
      ],
    },
  };
}
