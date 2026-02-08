// Patient Portal API Functions
// Separate file for portal-specific API calls to keep api.ts manageable

import { API_BASE_URL } from "./utils/apiBase";

const API_BASE = API_BASE_URL;
const TENANT_HEADER = "x-tenant-id";

// ============================================================================
// PORTAL BILLING & PAYMENTS
// ============================================================================

export interface PatientBalance {
  totalCharges: number;
  totalPayments: number;
  totalAdjustments: number;
  currentBalance: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
}

export interface Charge {
  id: string;
  serviceDate: string;
  description: string;
  amount: number;
  transactionType: string;
  createdAt: string;
  chiefComplaint?: string;
  providerName?: string;
}

export interface PaymentMethod {
  id: string;
  paymentType: 'credit_card' | 'debit_card' | 'ach' | 'bank_account';
  lastFour: string;
  cardBrand?: string;
  accountType?: string;
  bankName?: string;
  cardholderName: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethodType: string;
  description?: string;
  receiptNumber: string;
  receiptUrl?: string;
  refundAmount: number;
  createdAt: string;
  completedAt?: string;
}

export interface PaymentPlan {
  id: string;
  totalAmount: number;
  amountPaid: number;
  installmentAmount: number;
  installmentFrequency: string;
  numberOfInstallments: number;
  startDate: string;
  nextPaymentDate: string;
  status: string;
  autoPay: boolean;
  description?: string;
  createdAt: string;
}

export interface PaymentPlanInstallment {
  id: string;
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: string;
  paidAmount: number;
  paidAt?: string;
  transactionId?: string;
}

export interface AutoPayEnrollment {
  enrolled: boolean;
  id?: string;
  paymentMethodId?: string;
  isActive?: boolean;
  chargeDay?: number;
  chargeAllBalances?: boolean;
  minimumAmount?: number;
  notifyBeforeCharge?: boolean;
  notificationDays?: number;
  enrolledAt?: string;
  lastChargeDate?: string;
  lastChargeAmount?: number;
  paymentType?: string;
  lastFour?: string;
  cardBrand?: string;
}

export interface PortalStatement {
  id: string;
  statementNumber: string;
  statementDate: string;
  balanceCents: number;
  status: string;
  lastSentDate?: string | null;
  sentVia?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  lineItemCount?: number;
}

export interface PortalStatementLineItem {
  id: string;
  claimId?: string | null;
  serviceDate: string;
  description: string;
  amountCents: number;
  insurancePaidCents?: number;
  patientResponsibilityCents: number;
}

// ============================================================================
// PORTAL PROFILE
// ============================================================================

export interface PortalPatientProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
}

export async function fetchPortalProfile(
  tenantId: string,
  portalToken: string
): Promise<{ patient: PortalPatientProfile }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/me`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch patient profile');
  return res.json();
}

export async function updatePortalProfile(
  tenantId: string,
  portalToken: string,
  data: {
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    emergencyContactName?: string;
    emergencyContactRelationship?: string;
    emergencyContactPhone?: string;
  }
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/me`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update patient profile');
  return res.json();
}

// Get patient balance
export async function fetchPortalBalance(
  tenantId: string,
  portalToken: string
): Promise<PatientBalance> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/balance`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch balance');
  return res.json();
}

// Get patient charges
export async function fetchPortalCharges(
  tenantId: string,
  portalToken: string
): Promise<{ charges: Charge[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/charges`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch charges');
  return res.json();
}

// Get patient statements
export async function fetchPortalStatements(
  tenantId: string,
  portalToken: string
): Promise<{ statements: PortalStatement[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/statements`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch statements');
  return res.json();
}

// Get statement details
export async function fetchPortalStatementDetails(
  tenantId: string,
  portalToken: string,
  statementId: string
): Promise<{ statement: PortalStatement; lineItems: PortalStatementLineItem[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/statements/${statementId}`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch statement');
  return res.json();
}

// Get payment methods
export async function fetchPortalPaymentMethods(
  tenantId: string,
  portalToken: string
): Promise<{ paymentMethods: PaymentMethod[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/payment-methods`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch payment methods');
  return res.json();
}

// Add payment method
export async function addPortalPaymentMethod(
  tenantId: string,
  portalToken: string,
  data: {
    paymentType: 'credit_card' | 'debit_card' | 'ach' | 'bank_account';
    cardNumber?: string;
    cardBrand?: string;
    expiryMonth?: number;
    expiryYear?: number;
    cardholderName: string;
    accountType?: string;
    bankName?: string;
    routingNumber?: string;
    accountNumber?: string;
    billingAddress: {
      street: string;
      city: string;
      state: string;
      zip: string;
      country?: string;
    };
    setAsDefault?: boolean;
  }
): Promise<PaymentMethod> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/payment-methods`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add payment method');
  return res.json();
}

// Delete payment method
export async function deletePortalPaymentMethod(
  tenantId: string,
  portalToken: string,
  paymentMethodId: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/payment-methods/${paymentMethodId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete payment method');
  return res.json();
}

// Make a payment
export async function makePortalPayment(
  tenantId: string,
  portalToken: string,
  data: {
    amount: number;
    paymentMethodId?: string;
    chargeIds?: string[];
    description?: string;
    savePaymentMethod?: boolean;
    newPaymentMethod?: {
      paymentType: 'credit_card' | 'debit_card';
      cardNumber: string;
      cardBrand: string;
      expiryMonth: number;
      expiryYear: number;
      cardholderName: string;
      cvv: string;
      billingAddress: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country?: string;
      };
    };
  }
): Promise<{
  success: boolean;
  transactionId: string;
  receiptNumber: string;
  receiptUrl: string;
  amount: number;
}> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to process payment');
  return res.json();
}

// Get payment history
export async function fetchPortalPaymentHistory(
  tenantId: string,
  portalToken: string
): Promise<{ payments: PaymentTransaction[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/payment-history`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch payment history');
  return res.json();
}

// Get payment plans
export async function fetchPortalPaymentPlans(
  tenantId: string,
  portalToken: string
): Promise<{ paymentPlans: PaymentPlan[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/payment-plans`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch payment plans');
  return res.json();
}

// Get payment plan installments
export async function fetchPortalPaymentPlanInstallments(
  tenantId: string,
  portalToken: string,
  planId: string
): Promise<{ installments: PaymentPlanInstallment[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/payment-plans/${planId}/installments`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch installments');
  return res.json();
}

// Get autopay enrollment
export async function fetchPortalAutoPay(
  tenantId: string,
  portalToken: string
): Promise<AutoPayEnrollment> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/autopay`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch autopay enrollment');
  return res.json();
}

// Enroll in autopay
export async function enrollPortalAutoPay(
  tenantId: string,
  portalToken: string,
  data: {
    paymentMethodId: string;
    chargeDay: number;
    chargeAllBalances?: boolean;
    minimumAmount?: number;
    notifyBeforeCharge?: boolean;
    notificationDays?: number;
    termsAccepted: boolean;
  }
): Promise<{ id: string; enrolledAt: string }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/autopay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to enroll in autopay');
  return res.json();
}

// Cancel autopay
export async function cancelPortalAutoPay(
  tenantId: string,
  portalToken: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/billing/autopay`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to cancel autopay');
  return res.json();
}

// ============================================================================
// PORTAL INTAKE FORMS & CONSENT
// ============================================================================

export interface IntakeFormAssignment {
  assignment_id: string;
  status: string;
  dueDate?: string;
  completedAt?: string;
  template_id: string;
  name: string;
  description?: string;
  formType: string;
  formSchema: any;
  response_id?: string;
  responseData?: any;
  response_status?: string;
}

export interface IntakeFormResponse {
  id: string;
  assignmentId: string;
  responseData: any;
  status: string;
  submittedAt?: string;
}

export interface ConsentForm {
  id: string;
  title: string;
  consentType: string;
  content: string;
  version: string;
  requiresSignature: boolean;
  requiresWitness: boolean;
  isRequired: boolean;
}

export interface ConsentSignature {
  id: string;
  consentTitle: string;
  consentType: string;
  signerName: string;
  signerRelationship: string;
  version: string;
  signedAt: string;
  isValid: boolean;
}

export interface CheckinSession {
  id: string;
  appointmentId: string;
  status: string;
  demographicsConfirmed: boolean;
  insuranceVerified: boolean;
  formsCompleted: boolean;
  copayCollected: boolean;
  copayAmount?: number;
  insuranceCardFrontUrl?: string;
  insuranceCardBackUrl?: string;
  insuranceVerificationStatus?: string;
  staffNotified: boolean;
  startedAt: string;
  completedAt?: string;
}

// Get assigned intake forms
export async function fetchPortalIntakeForms(
  tenantId: string,
  portalToken: string
): Promise<{ forms: IntakeFormAssignment[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/forms`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch intake forms');
  return res.json();
}

// Get specific intake form
export async function fetchPortalIntakeForm(
  tenantId: string,
  portalToken: string,
  assignmentId: string
): Promise<IntakeFormAssignment> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/forms/${assignmentId}`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch intake form');
  return res.json();
}

// Start form response
export async function startPortalIntakeForm(
  tenantId: string,
  portalToken: string,
  assignmentId: string
): Promise<{ responseId: string }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/forms/${assignmentId}/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to start form');
  return res.json();
}

// Save form response
export async function savePortalIntakeResponse(
  tenantId: string,
  portalToken: string,
  responseId: string,
  data: {
    responseData: Record<string, any>;
    submit?: boolean;
    signatureData?: string;
  }
): Promise<IntakeFormResponse> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/responses/${responseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save response');
  return res.json();
}

// Get intake history
export async function fetchPortalIntakeHistory(
  tenantId: string,
  portalToken: string
): Promise<{ history: any[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/history`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch intake history');
  return res.json();
}

// Get available consent forms
export async function fetchPortalConsents(
  tenantId: string,
  portalToken: string
): Promise<{ consents: ConsentForm[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/consents`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch consents');
  return res.json();
}

// Get required consents
export async function fetchPortalRequiredConsents(
  tenantId: string,
  portalToken: string
): Promise<{ requiredConsents: ConsentForm[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/consents/required`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch required consents');
  return res.json();
}

// Sign consent form
export async function signPortalConsent(
  tenantId: string,
  portalToken: string,
  consentId: string,
  data: {
    signatureData: string;
    signerName: string;
    signerRelationship?: string;
    witnessSignatureData?: string;
    witnessName?: string;
  }
): Promise<{ id: string; signedAt: string }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/consents/${consentId}/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to sign consent');
  return res.json();
}

// Get signed consents
export async function fetchPortalSignedConsents(
  tenantId: string,
  portalToken: string
): Promise<{ signedConsents: ConsentSignature[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/consents/signed`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch signed consents');
  return res.json();
}

// Start check-in session
export async function startPortalCheckin(
  tenantId: string,
  portalToken: string,
  data: {
    appointmentId: string;
    sessionType?: 'mobile' | 'kiosk' | 'tablet';
    deviceType?: string;
  }
): Promise<{ sessionId: string; status: string; startedAt?: string }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/checkin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to start check-in');
  return res.json();
}

// Get check-in session
export async function fetchPortalCheckinSession(
  tenantId: string,
  portalToken: string,
  sessionId: string
): Promise<CheckinSession> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/checkin/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch check-in session');
  return res.json();
}

// Update check-in session
export async function updatePortalCheckinSession(
  tenantId: string,
  portalToken: string,
  sessionId: string,
  data: {
    demographicsConfirmed?: boolean;
    insuranceVerified?: boolean;
    formsCompleted?: boolean;
    copayCollected?: boolean;
    insuranceCardFrontUrl?: string;
    insuranceCardBackUrl?: string;
    complete?: boolean;
  }
): Promise<{ id: string; status: string; completedAt?: string }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/checkin/${sessionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update check-in session');
  return res.json();
}

// Upload insurance card
export async function uploadPortalInsuranceCard(
  tenantId: string,
  portalToken: string,
  sessionId: string,
  data: {
    frontImageUrl: string;
    backImageUrl: string;
  }
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/intake/checkin/${sessionId}/upload-insurance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to upload insurance card');
  return res.json();
}

// ============================================================================
// PORTAL VISIT SUMMARIES
// ============================================================================

export interface VisitSummary {
  id: string;
  visitDate: string;
  providerName: string;
  summaryText: string;
  symptomsDiscussed: string[];
  diagnosisShared?: string;
  treatmentPlan?: string;
  nextSteps?: string;
  followUpDate?: string;
  createdAt: string;
}

// Get visit summaries for the patient
export async function fetchPortalVisitSummaries(
  tenantId: string,
  portalToken: string
): Promise<{ summaries: VisitSummary[] }> {
  const res = await fetch(`${API_BASE}/api/patient-portal/visit-summaries`, {
    headers: {
      Authorization: `Bearer ${portalToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch visit summaries');
  return res.json();
}
