export type SuperbillStatus = 'draft' | 'pending_review' | 'approved' | 'finalized' | 'submitted' | 'void';

export interface Superbill {
  id: string;
  tenantId: string;
  encounterId: string;
  patientId: string;
  providerId: string;
  serviceDate: string;
  placeOfService: string;
  status: SuperbillStatus;
  totalCharges: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  finalizedBy?: string;
  notes?: string;
}

export interface SuperbillLineItem {
  id: string;
  tenantId: string;
  superbillId: string;
  cptCode: string;
  description?: string;
  icd10Codes: string[];
  units: number;
  fee: number;
  modifier?: string;
  modifier2?: string;
  modifier3?: string;
  modifier4?: string;
  lineTotal: number;
  lineSequence: number;
  createdAt: string;
  updatedAt: string;
}

export interface SuperbillDetails {
  superbill: Superbill;
  lineItems: SuperbillLineItem[];
  patient: {
    id: string;
    firstName: string;
    lastName: string;
  };
  provider: {
    id: string;
    fullName: string;
  };
}

export interface CommonDermCode {
  id: string;
  tenantId?: string;
  codeType: 'CPT' | 'ICD10';
  code: string;
  description: string;
  category?: string;
  subcategory?: string;
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt?: string;
  displayOrder: number;
}

export interface FeeScheduleEntry {
  id: string;
  tenantId: string;
  name: string;
  effectiveDate: string;
  expirationDate?: string;
  isDefault: boolean;
  cptCode: string;
  description?: string;
  defaultFee: number;
  payerSpecificFees: Record<string, { fee: number; notes?: string }>;
}
