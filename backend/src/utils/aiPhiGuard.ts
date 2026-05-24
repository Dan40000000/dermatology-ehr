import { hashValue, redactValue } from './phiRedaction';

export type AiPhiRisk = 'redact' | 'block';

export interface AiPhiEntity {
  type: string;
  label: string;
  start: number;
  end: number;
  replacement: string;
  risk: AiPhiRisk;
  hash: string;
}

export interface AiPhiDeidentificationResult {
  text: string;
  entities: AiPhiEntity[];
  blockedTypes: string[];
}

type AiPhiPattern = {
  type: string;
  label: string;
  regex: RegExp;
  replacement: string;
  risk: AiPhiRisk;
};

export class AiPhiBlockError extends Error {
  readonly code = 'AI_PHI_BLOCKED';
  readonly blockedTypes: string[];

  constructor(blockedTypes: string[]) {
    super(
      'This message may contain patient-identifying information. Remove names, DOBs, phone numbers, addresses, insurance/member IDs, MRNs, or distinctive identifying features, then submit again.'
    );
    this.name = 'AiPhiBlockError';
    this.blockedTypes = blockedTypes;
  }
}

const AI_PHI_PATTERNS: AiPhiPattern[] = [
  {
    type: 'explicit_name',
    label: 'Patient name',
    regex: /\b(?:patient\s+name|full\s+name|name|patient|pt)\s*(?:is|:|-)\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g,
    replacement: '[PATIENT NAME REDACTED]',
    risk: 'block',
  },
  {
    type: 'honorific_name',
    label: 'Person name',
    regex: /\b(?:Mr|Mrs|Ms|Miss)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g,
    replacement: '[PERSON NAME REDACTED]',
    risk: 'block',
  },
  {
    type: 'email',
    label: 'Email address',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[EMAIL REDACTED]',
    risk: 'block',
  },
  {
    type: 'phone',
    label: 'Phone number',
    regex: /\b(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s]?)[2-9]\d{2}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE REDACTED]',
    risk: 'block',
  },
  {
    type: 'ssn',
    label: 'Social Security number',
    regex: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,
    replacement: '[SSN REDACTED]',
    risk: 'block',
  },
  {
    type: 'dob',
    label: 'Date of birth',
    regex: /\b(?:dob|date\s+of\s+birth|birthdate)\s*(?:is|:|-)?\s*(?:(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}|(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:19|20)\d{2})\b/gi,
    replacement: '[DOB REDACTED]',
    risk: 'block',
  },
  {
    type: 'exact_date',
    label: 'Exact date',
    regex: /\b(?:(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}|(?:19|20)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:19|20)\d{2})\b/gi,
    replacement: '[DATE REDACTED]',
    risk: 'redact',
  },
  {
    type: 'mrn',
    label: 'Medical record number',
    regex: /\b(?:MRN|MR#?|medical\s+record\s*#?|patient\s+ID|chart\s*(?:number|#)|pt\.?\s*ID)\s*[:#-]?\s*[A-Z0-9]{4,20}\b/gi,
    replacement: '[MRN REDACTED]',
    risk: 'block',
  },
  {
    type: 'address',
    label: 'Street address',
    regex: /\b\d{1,5}\s+(?:[A-Z][a-z]+(?:\s+|$)){1,5}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl|Terrace|Ter|Highway|Hwy)\.?\b/g,
    replacement: '[ADDRESS REDACTED]',
    risk: 'block',
  },
  {
    type: 'insurance_id',
    label: 'Insurance/member ID',
    regex: /\b(?:policy|insurance|member|subscriber|group)\s*(?:number|#|no\.?|id)?\s*[:#-]?\s*[A-Z0-9]{6,24}\b/gi,
    replacement: '[INSURANCE ID REDACTED]',
    risk: 'block',
  },
  {
    type: 'unique_physical_identifier',
    label: 'Distinctive physical identifier',
    regex: /\b(?:(?:unique|distinctive|identifying|recognizable)\s+(?:tattoo|scar|birthmark|piercing|facial\s+feature|physical\s+feature)|(?:face|facial|neck|forehead|hand)\s+(?:tattoo|piercing|birthmark|scar)|(?:tattoo\s+of|scar\s+shaped\s+like|birthmark\s+shaped\s+like))[^.!?\n]{0,100}/gi,
    replacement: '[DISTINCTIVE IDENTIFIER REDACTED]',
    risk: 'block',
  },
];

function isTrueEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function isHipaaClinicalAiEnabled(): boolean {
  return (
    isTrueEnv(process.env.HIPAA_AI_ENABLED) ||
    isTrueEnv(process.env.CLINICAL_AI_PHI_ALLOWED) ||
    isTrueEnv(process.env.OPENAI_BAA_ENABLED)
  );
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function scanAiPhi(text: string): AiPhiEntity[] {
  const source = typeof text === 'string' ? text : '';
  if (!source.trim()) {
    return [];
  }

  const entities: AiPhiEntity[] = [];
  for (const pattern of AI_PHI_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(source)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (entities.some((entity) => rangesOverlap(start, end, entity.start, entity.end))) {
        continue;
      }
      entities.push({
        type: pattern.type,
        label: pattern.label,
        start,
        end,
        replacement: pattern.replacement,
        risk: pattern.risk,
        hash: hashValue(match[0]),
      });
    }
  }

  return entities.sort((a, b) => a.start - b.start);
}

export function deidentifyTextForExternalAi(text: string): AiPhiDeidentificationResult {
  const source = typeof text === 'string' ? text : '';
  if (!source.trim()) {
    return { text: source, entities: [], blockedTypes: [] };
  }

  const entities = scanAiPhi(source);
  let redacted = source;
  for (const entity of [...entities].sort((a, b) => b.start - a.start)) {
    redacted = `${redacted.slice(0, entity.start)}${entity.replacement}${redacted.slice(entity.end)}`;
  }
  redacted = String(redactValue(redacted));

  const residualEntities = scanAiPhi(redacted);
  for (const entity of [...residualEntities].sort((a, b) => b.start - a.start)) {
    redacted = `${redacted.slice(0, entity.start)}${entity.replacement}${redacted.slice(entity.end)}`;
  }

  const allEntities = [...entities, ...residualEntities];

  return {
    text: redacted,
    entities: allEntities,
    blockedTypes: Array.from(new Set(allEntities.filter((entity) => entity.risk === 'block').map((entity) => entity.type))).sort(),
  };
}

export function assertNoBlockedPhiForExternalAi(text: string): void {
  if (isHipaaClinicalAiEnabled()) {
    return;
  }

  const blockedTypes = deidentifyTextForExternalAi(text).blockedTypes;
  if (blockedTypes.length > 0) {
    throw new AiPhiBlockError(blockedTypes);
  }
}

export function assertClinicalAiPromptIsSafeForExternalAi(input: {
  prompt?: string;
  history?: Array<{ content?: string }>;
}): void {
  const values = [
    input.prompt,
    ...(Array.isArray(input.history) ? input.history.map((item) => item.content) : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const value of values) {
    assertNoBlockedPhiForExternalAi(value);
  }
}
