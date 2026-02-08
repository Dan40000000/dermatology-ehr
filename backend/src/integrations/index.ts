/**
 * External Integrations Module
 *
 * Exports all integration adapters and utilities for external system connectivity.
 */

// Base adapter and utilities
export {
  BaseAdapter,
  encryptCredentials,
  decryptCredentials,
  saveIntegrationConfig,
  getIntegrationConfig,
  deactivateIntegration,
  getAllIntegrations,
  type IntegrationConfig,
  type IntegrationLogEntry,
  type RetryOptions,
  type AdapterOptions,
} from './baseAdapter';

// Clearinghouse adapter
export {
  ClearinghouseAdapter,
  createClearinghouseAdapter,
  type ClaimSubmission,
  type ClaimSubmissionResult,
  type BatchSubmissionResult,
  type ClaimStatusResult,
  type ERAFile,
  type ERAPayment,
  type ProcessedERA,
} from './clearinghouseAdapter';

// Eligibility adapter
export {
  EligibilityAdapter,
  createEligibilityAdapter,
  type EligibilityRequest,
  type EligibilityResponse,
  type CoverageDetails,
  type BatchEligibilityResult,
} from './eligibilityAdapter';

// E-Prescribe adapter
export {
  EPrescribeAdapter,
  createEPrescribeAdapter,
  type Prescription,
  type PrescriptionResult,
  type CancelResult,
  type RenewalRequest,
  type RenewalResult,
  type PDMPResult,
  type Pharmacy,
  type MedicationHistoryResult,
} from './ePrescribeAdapter';

// Lab adapter
export {
  LabAdapter,
  createLabAdapter,
  type LabOrder,
  type LabOrderResult,
  type LabOrderStatus,
  type LabResult,
  type LabResultsBundle,
  type PendingLabResults,
} from './labAdapter';

// Payment adapter
export {
  PaymentAdapter,
  createPaymentAdapter,
  type PaymentIntent,
  type PaymentResult,
  type RefundResult,
  type StripeCustomer,
  type PaymentMethod,
  type RecurringPayment,
} from './paymentAdapter';

// Fax adapter
export {
  FaxAdapter,
  createFaxAdapter,
  type FaxSendRequest,
  type FaxSendResult,
  type FaxStatus,
  type IncomingFax,
  type FaxListResult,
} from './faxAdapter';
