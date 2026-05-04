import { createHash, randomUUID } from 'crypto';
import { loadEnv } from '../config/validate';

export type EligibilityProvider = 'stedi' | 'surescripts' | 'mock';
export type PrescribingProvider = 'dosespot' | 'surescripts' | 'mock';
export type PriorAuthProvider = 'covermymeds' | 'surescripts' | 'mock';
export type WorkflowMode = 'mock' | 'live';

export interface EligibilityCheckRequest {
  tenantId: string;
  patientId: string;
  payerId: string;
  payerName?: string;
  memberId?: string;
  patientFirstName?: string;
  patientLastName?: string;
  dateOfBirth?: string;
  serviceDate?: string;
  serviceType?: string;
  bypassCache?: boolean;
}

export interface EligibilityCheckResult {
  success: boolean;
  provider: EligibilityProvider;
  mode: WorkflowMode;
  requestId: string;
  responseId: string;
  checkedAt: string;
  cached: boolean;
  coverageActive: boolean;
  eligibilityStatus: 'active' | 'inactive' | 'error';
  copayAmount: number;
  deductibleRemaining: number;
  coinsurancePct: number;
  outOfPocketRemaining: number;
  priorAuthRequired: boolean;
  referralRequired: boolean;
  payer: {
    payerId: string;
    payerName: string;
  };
  coverageDetails: {
    planName: string;
    planType: string;
    effectiveDate: string;
    terminationDate: string | null;
    network: string;
    serviceType: string;
    message: string;
  };
  adapterMessage?: string;
}

export interface EligibilityService {
  checkEligibility(request: EligibilityCheckRequest): Promise<EligibilityCheckResult>;
}

export interface PrescriptionSendRequest {
  tenantId: string;
  prescriptionId?: string;
  orderId?: string;
  patientId?: string;
  patientName?: string;
  medicationName?: string;
  strength?: string;
  sig?: string;
  quantity?: string | number;
  refills?: string | number;
  pharmacyNcpdp?: string;
  pharmacyName?: string;
  providerName?: string;
  providerNpi?: string;
}

export interface PrescriptionSendResult {
  success: boolean;
  provider: PrescribingProvider;
  mode: WorkflowMode;
  messageId: string;
  transmissionStatus: 'sent' | 'queued' | 'error';
  prescriptionId?: string;
  orderId?: string;
  pharmacyName: string;
  pharmacyNcpdp: string;
  sentAt: string;
  message: string;
  adapterMessage?: string;
}

export interface PrescribingService {
  sendPrescription(request: PrescriptionSendRequest): Promise<PrescriptionSendResult>;
}

export interface PriorAuthSubmitRequest {
  tenantId: string;
  priorAuthId?: string;
  patientId?: string;
  patientName?: string;
  medicationName?: string;
  procedureCode?: string;
  diagnosisCode?: string;
  diagnosisCodes?: string[];
  payerName?: string;
  payerId?: string;
  memberId?: string;
  providerNpi?: string;
  clinicalJustification?: string;
  urgency?: 'routine' | 'urgent' | 'stat' | string;
}

export interface PriorAuthStatusRequest {
  tenantId: string;
  priorAuthId: string;
  externalReferenceId?: string;
  currentStatus?: string;
  payerName?: string;
  submittedAt?: string | null;
}

export interface PriorAuthTimelineItem {
  date: string;
  event: string;
  status: 'completed' | 'in_progress' | 'action_required';
}

export interface PriorAuthSubmitResult {
  success: boolean;
  provider: PriorAuthProvider;
  mode: WorkflowMode;
  priorAuthId: string;
  externalReferenceId: string;
  status: 'submitted' | 'approved' | 'denied' | 'needs_info' | 'error';
  payerStatus: string;
  submittedAt: string;
  estimatedDecisionDate: string | null;
  requiredNextSteps: string[];
  timeline: PriorAuthTimelineItem[];
  adapterMessage?: string;
}

export interface PriorAuthStatusResult {
  success: boolean;
  provider: PriorAuthProvider;
  mode: WorkflowMode;
  priorAuthId: string;
  externalReferenceId: string;
  status: 'pending' | 'submitted' | 'approved' | 'denied' | 'needs_info' | 'error';
  payerStatus: string;
  lastUpdated: string;
  estimatedDecisionDate: string | null;
  requiredNextSteps: string[];
  timeline: PriorAuthTimelineItem[];
  adapterMessage?: string;
}

export interface PriorAuthService {
  submitPriorAuth(request: PriorAuthSubmitRequest): Promise<PriorAuthSubmitResult>;
  checkPAStatus(request: PriorAuthStatusRequest): Promise<PriorAuthStatusResult>;
}

const hashNumber = (parts: Array<string | undefined | null>): number => {
  const input = parts.filter(Boolean).join('|') || randomUUID();
  const digest = createHash('sha256').update(input).digest('hex').slice(0, 8);
  return parseInt(digest, 16);
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const formatProviderMessage = (provider: string, workflow: string) =>
  provider === 'mock'
    ? undefined
    : `${provider} ${workflow} adapter is not configured yet; returned mock data through the vendor-neutral interface.`;

class MockEligibilityService implements EligibilityService {
  constructor(private readonly provider: EligibilityProvider) {}

  async checkEligibility(request: EligibilityCheckRequest): Promise<EligibilityCheckResult> {
    const hash = hashNumber([request.tenantId, request.patientId, request.payerId, request.memberId]);
    const inactiveByMember = (request.memberId || '').toUpperCase().includes('INACTIVE');
    const coverageActive = !inactiveByMember && hash % 11 !== 0;
    const copays = [25, 35, 45, 50, 75];
    const deductibles = [0, 150, 425, 850, 1250, 1800];
    const coinsurance = [0, 10, 15, 20];
    const oop = [500, 950, 1750, 2400, 3300];
    const serviceType = request.serviceType || '30';
    const responseId = `ELIG-${hash.toString(36).toUpperCase()}`;

    return {
      success: true,
      provider: this.provider,
      mode: 'mock',
      requestId: `REQ-${randomUUID()}`,
      responseId,
      checkedAt: new Date().toISOString(),
      cached: false,
      coverageActive,
      eligibilityStatus: coverageActive ? 'active' : 'inactive',
      copayAmount: coverageActive ? copays[hash % copays.length]! : 0,
      deductibleRemaining: coverageActive ? deductibles[hash % deductibles.length]! : 0,
      coinsurancePct: coverageActive ? coinsurance[hash % coinsurance.length]! : 0,
      outOfPocketRemaining: coverageActive ? oop[hash % oop.length]! : 0,
      priorAuthRequired: coverageActive && hash % 5 === 0,
      referralRequired: coverageActive && hash % 7 === 0,
      payer: {
        payerId: request.payerId,
        payerName: request.payerName || mockPayerName(request.payerId),
      },
      coverageDetails: {
        planName: `${mockPayerName(request.payerId)} Dermatology PPO`,
        planType: hash % 3 === 0 ? 'PPO' : hash % 3 === 1 ? 'HMO' : 'EPO',
        effectiveDate: request.serviceDate || todayIsoDate(),
        terminationDate: coverageActive ? null : todayIsoDate(),
        network: coverageActive ? 'In Network' : 'Coverage inactive',
        serviceType,
        message: coverageActive
          ? 'Eligibility active for dermatology professional services.'
          : 'Coverage inactive or member not found. Verify payer/member details.',
      },
      adapterMessage: formatProviderMessage(this.provider, 'eligibility'),
    };
  }
}

class MockPrescribingService implements PrescribingService {
  constructor(private readonly provider: PrescribingProvider) {}

  async sendPrescription(request: PrescriptionSendRequest): Promise<PrescriptionSendResult> {
    const hash = hashNumber([
      request.tenantId,
      request.prescriptionId,
      request.orderId,
      request.patientId,
      request.medicationName,
    ]);
    const pharmacyNcpdp = request.pharmacyNcpdp || `MOCK${String(hash % 1000000).padStart(6, '0')}`;

    return {
      success: true,
      provider: this.provider,
      mode: 'mock',
      messageId: `RX-${hash.toString(36).toUpperCase()}-${Date.now()}`,
      transmissionStatus: 'sent',
      prescriptionId: request.prescriptionId,
      orderId: request.orderId,
      pharmacyName: request.pharmacyName || 'Demo Pharmacy',
      pharmacyNcpdp,
      sentAt: new Date().toISOString(),
      message: `${request.medicationName || 'Prescription'} queued to ${request.pharmacyName || 'Demo Pharmacy'}.`,
      adapterMessage: formatProviderMessage(this.provider, 'prescribing'),
    };
  }
}

class MockPriorAuthService implements PriorAuthService {
  constructor(private readonly provider: PriorAuthProvider) {}

  async submitPriorAuth(request: PriorAuthSubmitRequest): Promise<PriorAuthSubmitResult> {
    const priorAuthId = request.priorAuthId || `PA-${randomUUID()}`;
    const hash = hashNumber([
      request.tenantId,
      priorAuthId,
      request.patientId,
      request.medicationName,
      request.procedureCode,
      request.payerName,
    ]);
    const externalReferenceId = `EPA-${hash.toString(36).toUpperCase()}-${Date.now()}`;
    const submittedAt = new Date().toISOString();

    return {
      success: true,
      provider: this.provider,
      mode: 'mock',
      priorAuthId,
      externalReferenceId,
      status: 'submitted',
      payerStatus: 'Submitted to payer',
      submittedAt,
      estimatedDecisionDate: new Date(Date.now() + decisionWindowMs(request.urgency)).toISOString(),
      requiredNextSteps: ['Monitor payer response', 'Attach clinical notes if requested'],
      timeline: [
        { date: submittedAt, event: 'Submitted to payer', status: 'completed' },
        {
          date: new Date().toISOString(),
          event: 'Payer review started',
          status: 'in_progress',
        },
      ],
      adapterMessage: formatProviderMessage(this.provider, 'prior authorization'),
    };
  }

  async checkPAStatus(request: PriorAuthStatusRequest): Promise<PriorAuthStatusResult> {
    const status = normalizePriorAuthStatus(request.currentStatus, request.priorAuthId);
    const lastUpdated = new Date().toISOString();
    const externalReferenceId =
      request.externalReferenceId || `EPA-${hashNumber([request.tenantId, request.priorAuthId]).toString(36).toUpperCase()}`;

    return {
      success: true,
      provider: this.provider,
      mode: 'mock',
      priorAuthId: request.priorAuthId,
      externalReferenceId,
      status,
      payerStatus: payerStatusLabel(status),
      lastUpdated,
      estimatedDecisionDate:
        status === 'submitted' || status === 'pending'
          ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
          : null,
      requiredNextSteps: nextStepsForStatus(status),
      timeline: buildPriorAuthTimeline(status, request.submittedAt),
      adapterMessage: formatProviderMessage(this.provider, 'prior authorization'),
    };
  }
}

function mockPayerName(payerId: string): string {
  const known: Record<string, string> = {
    BCBS001: 'Blue Cross Blue Shield',
    AETNA01: 'Aetna',
    UHC0001: 'United Healthcare',
    CIGNA01: 'Cigna',
    MEDICARE: 'Medicare',
  };
  return known[payerId.toUpperCase()] || payerId || 'Demo Payer';
}

function decisionWindowMs(urgency?: string): number {
  if (urgency === 'stat') return 8 * 60 * 60 * 1000;
  if (urgency === 'urgent') return 24 * 60 * 60 * 1000;
  return 72 * 60 * 60 * 1000;
}

function normalizePriorAuthStatus(
  currentStatus: string | undefined,
  priorAuthId: string
): PriorAuthStatusResult['status'] {
  if (currentStatus === 'more_info_needed' || currentStatus === 'additional_info_needed') return 'needs_info';
  if (currentStatus === 'draft') return 'pending';
  if (['pending', 'submitted', 'approved', 'denied', 'needs_info', 'error'].includes(currentStatus || '')) {
    return currentStatus as PriorAuthStatusResult['status'];
  }

  const statuses: PriorAuthStatusResult['status'][] = ['submitted', 'approved', 'needs_info', 'denied'];
  return statuses[hashNumber([priorAuthId]) % statuses.length]!;
}

function payerStatusLabel(status: PriorAuthStatusResult['status']): string {
  const labels: Record<PriorAuthStatusResult['status'], string> = {
    pending: 'Ready for submission',
    submitted: 'Under review by payer',
    approved: 'Approved',
    denied: 'Denied',
    needs_info: 'Additional information requested',
    error: 'Payer status unavailable',
  };
  return labels[status];
}

function nextStepsForStatus(status: PriorAuthStatusResult['status']): string[] {
  if (status === 'approved') return ['Notify patient', 'Release medication or schedule service'];
  if (status === 'denied') return ['Review denial reason', 'Consider appeal or alternative therapy'];
  if (status === 'needs_info') return ['Upload requested documentation', 'Resubmit to payer'];
  if (status === 'error') return ['Retry status check', 'Contact payer if issue persists'];
  return ['Continue monitoring payer response'];
}

function buildPriorAuthTimeline(
  status: PriorAuthStatusResult['status'],
  submittedAt?: string | null
): PriorAuthTimelineItem[] {
  const created = submittedAt || new Date().toISOString();
  const timeline: PriorAuthTimelineItem[] = [
    { date: created, event: 'Request created', status: 'completed' },
  ];

  if (submittedAt || status !== 'pending') {
    timeline.push({ date: submittedAt || created, event: 'Submitted to payer', status: 'completed' });
  }

  if (status === 'submitted') {
    timeline.push({ date: new Date().toISOString(), event: 'Under review', status: 'in_progress' });
  }

  if (status === 'approved') {
    timeline.push({ date: new Date().toISOString(), event: 'Approved', status: 'completed' });
  } else if (status === 'denied') {
    timeline.push({ date: new Date().toISOString(), event: 'Denied', status: 'completed' });
  } else if (status === 'needs_info') {
    timeline.push({ date: new Date().toISOString(), event: 'Additional information requested', status: 'action_required' });
  }

  return timeline;
}

export function getEligibilityService(provider = loadEnv().ELIGIBILITY_PROVIDER): EligibilityService {
  return new MockEligibilityService(resolveEligibilityProvider(provider));
}

export function getPrescribingService(provider = loadEnv().PRESCRIBING_PROVIDER): PrescribingService {
  return new MockPrescribingService(resolvePrescribingProvider(provider));
}

export function getPriorAuthService(provider = loadEnv().PRIOR_AUTH_PROVIDER): PriorAuthService {
  return new MockPriorAuthService(resolvePriorAuthProvider(provider));
}

export function resolveEligibilityProvider(provider: string | undefined): EligibilityProvider {
  if (provider === 'stedi' || provider === 'surescripts' || provider === 'mock') return provider;
  return 'mock';
}

export function resolvePrescribingProvider(provider: string | undefined): PrescribingProvider {
  if (provider === 'dosespot' || provider === 'surescripts' || provider === 'mock') return provider;
  return 'mock';
}

export function resolvePriorAuthProvider(provider: string | undefined): PriorAuthProvider {
  if (provider === 'covermymeds' || provider === 'surescripts' || provider === 'mock') return provider;
  return 'mock';
}
