import { scanAiPhi } from './aiPhiGuard';

export type SmsPrivacyRisk = {
  type: string;
  label: string;
  match: string;
};

type SmsPrivacyPattern = {
  type: string;
  label: string;
  regex: RegExp;
};

export class SmsPrivacyBlockError extends Error {
  readonly code = 'SMS_PHI_BLOCKED';
  readonly blockedTypes: string[];

  constructor(risks: SmsPrivacyRisk[]) {
    super(
      'Text messages should only include minimum necessary appointment or administrative information. Remove diagnoses, medications, DOBs, MRNs, insurance IDs, addresses, full patient names, or distinctive identifying details before sending.'
    );
    this.name = 'SmsPrivacyBlockError';
    this.blockedTypes = Array.from(new Set(risks.map((risk) => risk.type))).sort();
  }
}

const SMS_BLOCK_PATTERNS: SmsPrivacyPattern[] = [
  {
    type: 'unsafe_template_variable',
    label: 'Unsafe SMS template variable',
    regex: /\{(?:patientName|lastName|fullName|dob|dateOfBirth|mrn|diagnosis|diagnosisCode|icd10|cpt|procedure|medication|prescription|insurance|memberId|subscriberId|address)\}/gi,
  },
  {
    type: 'clinical_detail',
    label: 'Clinical detail',
    regex: /\b(?:diagnosis|dx|icd-?10|cpt|procedure|biopsy|pathology|path\s+result|lab\s+result|lesion|rash|melanoma|basal\s+cell|squamous\s+cell|carcinoma|nevus|acne|eczema|psoriasis|dermatitis|tretinoin|isotretinoin|accutane|humira|dupixent|methotrexate|prescription|medication|medication refill|rx)\b/gi,
  },
  {
    type: 'dob',
    label: 'Date of birth',
    regex: /\b(?:dob|date\s+of\s+birth|birthdate)\s*(?:is|:|-)?\s*(?:(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}|(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01]))\b/gi,
  },
  {
    type: 'mrn',
    label: 'Medical record number',
    regex: /\b(?:MRN|MR#?|medical\s+record\s*#?|patient\s+ID|chart\s*(?:number|#)|pt\.?\s*ID)\s*[:#-]?\s*[A-Z0-9]{4,20}\b/gi,
  },
  {
    type: 'insurance_id',
    label: 'Insurance/member ID',
    regex: /\b(?:policy|insurance|member|subscriber|group)\s*(?:number|#|no\.?|id)?\s*[:#-]?\s*[A-Z0-9]{6,24}\b/gi,
  },
  {
    type: 'unique_physical_identifier',
    label: 'Distinctive physical identifier',
    regex: /\b(?:(?:unique|distinctive|identifying|recognizable)\s+(?:tattoo|scar|birthmark|piercing|facial\s+feature|physical\s+feature)|(?:face|facial|neck|forehead|hand)\s+(?:tattoo|piercing|birthmark|scar)|(?:tattoo\s+of|scar\s+shaped\s+like|birthmark\s+shaped\s+like))[^.!?\n]{0,100}/gi,
  },
];

function isTrueEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function isSmsPhiContentAllowed(): boolean {
  return isTrueEnv(process.env.SMS_ALLOW_PHI_CONTENT);
}

export function scanSmsPrivacyRisks(message: string): SmsPrivacyRisk[] {
  const source = typeof message === 'string' ? message : '';
  if (!source.trim()) return [];

  const risks: SmsPrivacyRisk[] = [];

  for (const pattern of SMS_BLOCK_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(source)) !== null) {
      risks.push({
        type: pattern.type,
        label: pattern.label,
        match: match[0],
      });
    }
  }

  const allowedAdministrativeIdentifiers = new Set(['phone', 'email', 'address', 'honorific_name']);
  for (const entity of scanAiPhi(source).filter((item) => item.risk === 'block' && !allowedAdministrativeIdentifiers.has(item.type))) {
    risks.push({
      type: entity.type,
      label: entity.label,
      match: source.slice(entity.start, entity.end),
    });
  }

  return risks;
}

export function assertSmsContentSafe(message: string): void {
  if (isSmsPhiContentAllowed()) return;

  const risks = scanSmsPrivacyRisks(message);
  if (risks.length > 0) {
    throw new SmsPrivacyBlockError(risks);
  }
}

export function normalizeSmsTemplateForMinimumNecessary(template: string): string {
  return String(template || '')
    .replace(/\{(?:patientName|fullName|lastName)\}/gi, '{firstName}')
    .replace(/\{providerName\}/gi, 'your provider');
}
