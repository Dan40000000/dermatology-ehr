import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Modal, Skeleton } from '../components/ui';
import { API_BASE_URL } from '../utils/apiBase';
import { fetchAppointments, fetchOrders, fetchPatients, recordPrintedDocument } from '../api';
import { PatientLookupSelect } from '../components/patients/PatientLookupSelect';

type InstructionType =
  | 'all'
  | 'general'
  | 'aftercare'
  | 'lab_results'
  | 'prescription_instructions'
  | 'rash_care'
  | 'cleansing';

type HandoutTab = 'library' | 'custom' | 'assigned';

interface Handout {
  id: string;
  title: string;
  category: string;
  condition: string;
  content: string;
  instruction_type: Exclude<InstructionType, 'all'>;
  template_key?: string | null;
  print_disclaimer?: string | null;
  is_system_template: boolean;
  is_active: boolean;
  created_at: string;
}

interface HandoutFormState {
  title: string;
  category: string;
  condition: string;
  content: string;
  instructionType: Exclude<InstructionType, 'all'>;
  printDisclaimer: string;
  isActive: boolean;
}

interface PersonalizationState {
  patientName: string;
  patientDob: string;
  providerName: string;
  medicationName: string;
  dosageInstructions: string;
  labSummary: string;
  followUpDate: string;
}

interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  mrn?: string;
  phone?: string;
}

interface PatientsResponseLike {
  patients?: Array<Record<string, unknown>>;
  data?: Array<Record<string, unknown>>;
}

interface AssignedHandoutDocument {
  id: string;
  patientId?: string;
  encounterId?: string | null;
  title: string;
  type?: string;
  category?: string;
  description?: string | null;
  url?: string;
  objectKey?: string | null;
  storage?: string | null;
  mimeType?: string | null;
  createdAt?: string;
  patientName?: string | null;
  uploadedByEmail?: string | null;
}

const CATEGORIES = [
  'Skin Conditions',
  'Procedures',
  'Medications',
  'Post-Procedure Care',
  'Lab Results',
  'Pathology Reports',
  'Prevention',
  'General Information',
];

const HANDOUT_TAB_LABELS: Record<HandoutTab, string> = {
  library: 'Browse Library',
  custom: 'Custom Templates',
  assigned: 'Assigned to Patients',
};

const PRINTED_HANDOUT_CATEGORIES = ['After Visit Instructions', 'Printed Documents'];

const INSTRUCTION_TYPE_LABELS: Record<InstructionType, string> = {
  all: 'All Templates',
  general: 'General',
  aftercare: 'Aftercare',
  lab_results: 'Lab Results',
  prescription_instructions: 'Prescription Instructions',
  rash_care: 'Rash Care',
  cleansing: 'Cleansing',
};

const PLACEHOLDER_DEFINITIONS = [
  {
    canonical: '{{patient_name}}',
    label: 'Patient name',
    description: 'Selected patient full name',
    aliases: ['patient_name', 'patient name', 'patient-name', 'patientName'],
  },
  {
    canonical: '{{patient_dob}}',
    label: 'Patient DOB',
    description: 'Selected patient date of birth',
    aliases: ['patient_dob', 'patient dob', 'patient-date-of-birth', 'patientDateOfBirth', 'dob'],
  },
  {
    canonical: '{{provider_name}}',
    label: 'Provider name',
    description: 'Current provider or staff name',
    aliases: ['provider_name', 'provider name', 'provider-name', 'providerName'],
  },
  {
    canonical: '{{today_date}}',
    label: 'Today',
    description: 'Date the handout is generated',
    aliases: ['today_date', 'today date', 'today-date', 'todayDate', 'date'],
  },
  {
    canonical: '{{medication_name}}',
    label: 'Medication',
    description: 'Medication entered before printing',
    aliases: ['medication_name', 'medication name', 'medication-name', 'medicationName', 'medication'],
  },
  {
    canonical: '{{dosage_instructions}}',
    label: 'Dose / plan',
    description: 'Dose, care plan, or custom instructions',
    aliases: ['dosage_instructions', 'dosage instructions', 'dosage-instructions', 'dosageInstructions', 'dose instructions'],
  },
  {
    canonical: '{{lab_summary}}',
    label: 'Lab summary',
    description: 'Lab/pathology summary or extra notes',
    aliases: ['lab_summary', 'lab summary', 'lab-summary', 'labSummary', 'result summary'],
  },
  {
    canonical: '{{follow_up_date}}',
    label: 'Follow-up',
    description: 'Next scheduled follow-up date',
    aliases: ['follow_up_date', 'follow up date', 'follow-up-date', 'followUpDate', 'follow up'],
  },
];

const HANDOUT_PATIENT_LOOKUP_LIMIT = 1000;

function isLabOrPathologyTemplate(handout: Handout | null): boolean {
  if (!handout) return false;
  const category = handout.category.toLowerCase();
  return (
    handout.instruction_type === 'lab_results' ||
    category.includes('lab') ||
    category.includes('pathology')
  );
}

function getRelevantOrderTypesForHandout(handout: Handout | null): string[] {
  if (!handout) return [];
  const category = handout.category.toLowerCase();
  if (category.includes('pathology')) {
    return ['pathology', 'biopsy'];
  }
  if (handout.instruction_type === 'lab_results' || category.includes('lab')) {
    return ['lab', 'pathology', 'biopsy'];
  }
  return [];
}

function formatOrderResultFlag(flag?: string): string {
  if (!flag || flag === 'none') return '';
  return flag
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildRelevantOrderSummary(
  handout: Handout | null,
  orders: Array<{ type?: string; details?: string; notes?: string; resultFlag?: string; createdAt?: string }>
): string {
  if (!isLabOrPathologyTemplate(handout) || orders.length === 0) {
    return '';
  }

  const orderTypes = new Set(getRelevantOrderTypesForHandout(handout));
  const relevant = orders
    .filter((order) => order.type && orderTypes.has(order.type))
    .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

  const latest = relevant[0];
  if (!latest) return '';

  const segments = [
    formatOrderResultFlag(latest.resultFlag),
    latest.details?.trim() || '',
    latest.notes?.trim() || '',
  ].filter(Boolean);

  return segments.join(' - ');
}

const defaultFormState: HandoutFormState = {
  title: '',
  category: 'Skin Conditions',
  condition: '',
  content: '',
  instructionType: 'general',
  printDisclaimer:
    'For educational use only. Follow your provider instructions and call with concerns.',
  isActive: true,
};

function normalizeHandoutTab(value: string | null): HandoutTab {
  if (value === 'custom' || value === 'assigned') return value;
  return 'library';
}

function formatInstructionType(value: Exclude<InstructionType, 'all'>): string {
  return INSTRUCTION_TYPE_LABELS[value] || 'General';
}

function getTodayDateLabel(): string {
  return new Date().toLocaleDateString();
}

function formatDateLabel(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPlaceholderValue(canonical: string, values: PersonalizationState): string {
  const replacements: Record<string, string> = {
    '{{patient_name}}': values.patientName || '________________',
    '{{patient_dob}}': values.patientDob || '________________',
    '{{provider_name}}': values.providerName || '________________',
    '{{today_date}}': getTodayDateLabel(),
    '{{medication_name}}': values.medicationName || '________________',
    '{{dosage_instructions}}': values.dosageInstructions || '________________',
    '{{lab_summary}}': values.labSummary || '________________',
    '{{follow_up_date}}': values.followUpDate || '________________',
  };
  return replacements[canonical] || '________________';
}

function replacePlaceholderAliases(template: string, replacer: (canonical: string) => string): string {
  return PLACEHOLDER_DEFINITIONS.reduce((acc, definition) => {
    return definition.aliases.reduce((next, alias) => {
      const escapedAlias = escapeRegExp(alias);
      const pattern = new RegExp(
        `\\{\\{\\s*${escapedAlias}\\s*\\}\\}|\\{\\s*${escapedAlias}\\s*\\}|\\[\\s*${escapedAlias}\\s*\\]`,
        'gi',
      );
      return next.replace(pattern, replacer(definition.canonical));
    }, acc);
  }, template);
}

export function normalizeTemplatePlaceholders(template: string): string {
  return replacePlaceholderAliases(template, (canonical) => canonical);
}

export function renderTemplateContent(template: string, values: PersonalizationState): string {
  return replacePlaceholderAliases(template, (canonical) => getPlaceholderValue(canonical, values));
}

function appendTemplateToken(content: string, token: string): string {
  const needsSeparator = content.trim().length > 0 && !content.endsWith(' ') && !content.endsWith('\n');
  return `${content}${needsSeparator ? ' ' : ''}${token}`;
}

function getHandoutDisplayCategory(handout: Handout): string {
  const explicitCategory = handout.category || 'General Information';
  const haystack = `${handout.title} ${handout.condition} ${handout.content}`.toLowerCase();

  if (/biopsy|wound|bandage|dressing|suture|excision|procedure|post[-\s]?op|healing/.test(haystack)) {
    return 'Post-Procedure Care';
  }
  if (/tretinoin|isotretinoin|doxycycline|medication|prescription|dose|cream|ointment|topical/.test(haystack)) {
    return 'Medications';
  }
  if (/lab|cbc|blood|result/.test(haystack)) {
    return 'Lab Results';
  }
  if (/pathology|biopsy result|histology|specimen/.test(haystack)) {
    return 'Pathology Reports';
  }
  if (/sunscreen|sun protection|spf|prevention|skin check/.test(haystack)) {
    return 'Prevention';
  }
  if (/cleanser|cleansing|sensitive skin|moisturizer|skincare|skin care/.test(haystack)) {
    return 'General Information';
  }
  if (/rash|dermatitis|eczema|psoriasis|acne|rosacea|wart|mole|lesion/.test(haystack)) {
    return 'Skin Conditions';
  }

  return explicitCategory;
}

function compareCategories(a: string, b: string): number {
  const aIndex = CATEGORIES.indexOf(a);
  const bIndex = CATEGORIES.indexOf(b);
  if (aIndex !== -1 || bIndex !== -1) {
    return (aIndex === -1 ? CATEGORIES.length : aIndex) - (bIndex === -1 ? CATEGORIES.length : bIndex);
  }
  return a.localeCompare(b);
}

function isPrintedHandoutDocument(document: AssignedHandoutDocument): boolean {
  const category = document.category || '';
  if (document.type === 'printed_document') return true;
  if (PRINTED_HANDOUT_CATEGORIES.includes(category)) return true;
  return /handout|aftercare|patient instruction|printed document/i.test(
    `${document.title} ${document.description || ''} ${category}`,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultilineContentToHtml(value: string): string {
  const sections = value
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return '<p>No instructions provided.</p>';
  }

  return sections
    .map((section) => {
      const lines = section
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const isBulletList =
        lines.length > 1 && lines.every((line) => /^[-*•]\s+/.test(line));

      if (isBulletList) {
        const items = lines
          .map((line) => `<li>${escapeHtml(line.replace(/^[-*•]\s+/, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }

      return `<p>${escapeHtml(section).replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

function printableField(value?: string): string {
  const clean = (value || '').trim();
  return clean ? escapeHtml(clean) : '&mdash;';
}

function toPrintableHtml(
  title: string,
  condition: string,
  body: string,
  options: {
    disclaimer?: string | null;
    instructionType: Exclude<InstructionType, 'all'>;
    category: string;
    patientName?: string;
    patientDob?: string;
    providerName?: string;
    followUpDate?: string;
    generatedOn?: string;
  },
): string {
  const contentHtml = formatMultilineContentToHtml(body);
  const generatedOn = escapeHtml(options.generatedOn || getTodayDateLabel());
  const disclaimerHtml = options.disclaimer
    ? `<div class="disclaimer">${escapeHtml(options.disclaimer)}</div>`
    : '';
  const patientName = printableField(options.patientName);
  const patientDob = printableField(options.patientDob);
  const providerName = printableField(options.providerName);
  const followUpDate = printableField(options.followUpDate);
  const categoryLabel = escapeHtml(options.category);
  const typeLabel = escapeHtml(formatInstructionType(options.instructionType));
  const titleLabel = escapeHtml(title);
  const conditionLabel = escapeHtml(condition);

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${titleLabel}</title>
    <style>
      @page {
        margin: 0.55in;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: #f5f7fb;
        font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        color: #111827;
      }
      .sheet {
        background: #ffffff;
        border: 1px solid #d6deea;
        border-radius: 14px;
        padding: 28px 30px;
        max-width: 8.1in;
        margin: 0 auto;
        box-shadow: 0 6px 18px rgba(17, 24, 39, 0.08);
      }
      .header {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 14px;
        border-bottom: 2px solid #d8e3f5;
        padding-bottom: 14px;
        margin-bottom: 16px;
      }
      .clinic-name {
        font-size: 22px;
        font-weight: 800;
        color: #0b4f84;
        letter-spacing: 0.2px;
      }
      .clinic-subtitle {
        margin-top: 4px;
        font-size: 12px;
        color: #4b5563;
      }
      .document-badge {
        align-self: start;
        background: #e8f2ff;
        color: #12406b;
        border: 1px solid #bfd8f8;
        font-size: 11px;
        font-weight: 700;
        padding: 7px 12px;
        border-radius: 999px;
        letter-spacing: 0.3px;
      }
      .title {
        margin: 4px 0 6px 0;
        font-size: 25px;
        font-weight: 800;
        color: #0f172a;
      }
      .subtitle {
        font-size: 13px;
        color: #475569;
        margin-bottom: 14px;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 12px;
        background: #f8fbff;
        border: 1px solid #d9e6f7;
        border-radius: 10px;
        padding: 12px 14px;
        margin-bottom: 16px;
      }
      .meta-row {
        font-size: 12.5px;
        line-height: 1.35;
        color: #0f172a;
      }
      .meta-label {
        font-weight: 700;
        color: #334155;
        margin-right: 6px;
      }
      .content {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 14px 16px;
        font-size: 13.5px;
        line-height: 1.55;
        color: #111827;
      }
      .content p {
        margin: 0 0 10px 0;
      }
      .content p:last-child {
        margin-bottom: 0;
      }
      .content ul {
        margin: 0 0 12px 18px;
        padding: 0;
      }
      .content li {
        margin-bottom: 6px;
      }
      .disclaimer {
        margin-top: 16px;
        padding: 10px 12px;
        background: #fff7ed;
        border: 1px solid #fed7aa;
        border-radius: 8px;
        color: #7c2d12;
        font-size: 12px;
        line-height: 1.4;
      }
      .footer {
        margin-top: 20px;
        padding-top: 10px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 11px;
        color: #64748b;
      }
      @media print {
        body {
          background: #ffffff;
        }
        .sheet {
          box-shadow: none;
          border: none;
          border-radius: 0;
          max-width: none;
          margin: 0;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <header class="header">
        <div>
          <div class="clinic-name">Dermatology DEMO Office</div>
          <div class="clinic-subtitle">Clinical handout and patient instruction document</div>
        </div>
        <div class="document-badge">${typeLabel}</div>
      </header>

      <h1 class="title">${titleLabel}</h1>
      <div class="subtitle">${conditionLabel}</div>

      <section class="meta-grid">
        <div class="meta-row"><span class="meta-label">Patient:</span> ${patientName}</div>
        <div class="meta-row"><span class="meta-label">DOB:</span> ${patientDob}</div>
        <div class="meta-row"><span class="meta-label">Provider:</span> ${providerName}</div>
        <div class="meta-row"><span class="meta-label">Follow-Up:</span> ${followUpDate}</div>
        <div class="meta-row"><span class="meta-label">Category:</span> ${categoryLabel}</div>
        <div class="meta-row"><span class="meta-label">Generated:</span> ${generatedOn}</div>
      </section>

      <section class="content">${contentHtml}</section>
      ${disclaimerHtml}

      <footer class="footer">
        <div>Please contact the clinic for urgent concerns or worsening symptoms.</div>
        <div>Printed ${generatedOn}</div>
      </footer>
    </main>
  </body>
</html>
`;
}

function PlaceholderGuidePanel({
  onInsert,
  compact = false,
}: {
  onInsert?: (token: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        padding: compact ? '0.65rem 0.75rem' : '0.75rem 1rem',
        fontSize: '0.85rem',
        color: '#1e3a8a',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Template placeholders</div>
      <div style={{ marginBottom: '0.6rem' }}>
        Use the double-brace tokens below. The page also accepts common friendly versions like{' '}
        <code>{'{patient name}'}</code>, but it saves them as <code>{'{{patient_name}}'}</code> so they print correctly.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {PLACEHOLDER_DEFINITIONS.map((definition) =>
          onInsert ? (
            <button
              key={definition.canonical}
              type="button"
              className="btn-secondary btn-sm"
              title={definition.description}
              onClick={() => onInsert(definition.canonical)}
            >
              {definition.canonical}
            </button>
          ) : (
            <span
              key={definition.canonical}
              title={definition.description}
              style={{
                background: '#ffffff',
                border: '1px solid #bfdbfe',
                borderRadius: '999px',
                padding: '0.2rem 0.45rem',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
              }}
            >
              {definition.canonical}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function HandoutsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryInstructionType = searchParams.get('instructionType') as InstructionType | null;
  const queryTab = normalizeHandoutTab(searchParams.get('tab'));
  const preferredPatientId = searchParams.get('patientId') || '';

  const [loading, setLoading] = useState(true);
  const [handouts, setHandouts] = useState<Handout[]>([]);
  const [assignedHandoutDocuments, setAssignedHandoutDocuments] = useState<AssignedHandoutDocument[]>([]);
  const [handoutTab, setHandoutTab] = useState<HandoutTab>(queryTab);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [instructionTypeFilter, setInstructionTypeFilter] = useState<InstructionType>(
    queryInstructionType && INSTRUCTION_TYPE_LABELS[queryInstructionType]
      ? queryInstructionType
      : 'all',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHandout, setSelectedHandout] = useState<Handout | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [createForm, setCreateForm] = useState<HandoutFormState>(defaultFormState);
  const [editForm, setEditForm] = useState<HandoutFormState>(defaultFormState);
  const [personalization, setPersonalization] = useState<PersonalizationState>({
    patientName: '',
    patientDob: '',
    providerName: '',
    medicationName: '',
    dosageInstructions: '',
    labSummary: '',
    followUpDate: '',
  });
  const [patientOptions, setPatientOptions] = useState<PatientOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState(false);

  useEffect(() => {
    if (queryInstructionType && INSTRUCTION_TYPE_LABELS[queryInstructionType]) {
      setInstructionTypeFilter(queryInstructionType);
    }
  }, [queryInstructionType]);

  useEffect(() => {
    setHandoutTab(queryTab);
  }, [queryTab]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (instructionTypeFilter !== 'all') params.append('instructionType', instructionTypeFilter);
      params.append('isActive', 'true');

      const handoutsRequest = fetch(`${API_BASE_URL}/api/handouts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });

      const response = await handoutsRequest;
      if (!response.ok) throw new Error('Failed to load handout templates');
      const data = await response.json();
      setHandouts(Array.isArray(data) ? data : []);

      if (handoutTab === 'assigned') {
        try {
          const documentResponses = await Promise.all(
            PRINTED_HANDOUT_CATEGORIES.map((category) => {
              const documentParams = new URLSearchParams({
                category,
                limit: '100',
              });
              return fetch(`${API_BASE_URL}/api/documents?${documentParams.toString()}`, {
                headers: {
                  Authorization: `Bearer ${session.accessToken}`,
                  'x-tenant-id': session.tenantId,
                },
              });
            }),
          );

          const documentPayloads = await Promise.all(
            documentResponses.map(async (documentResponse) => {
              if (!documentResponse.ok) throw new Error('Failed to load assigned handouts');
              return documentResponse.json();
            }),
          );
          const deduped = new Map<string, AssignedHandoutDocument>();
          documentPayloads.forEach((payload) => {
            const rows = Array.isArray(payload) ? payload : payload.documents || payload.data || [];
            rows.forEach((document: AssignedHandoutDocument) => {
              if (document?.id && isPrintedHandoutDocument(document)) {
                deduped.set(document.id, document);
              }
            });
          });
          setAssignedHandoutDocuments(
            Array.from(deduped.values()).sort((a, b) => {
              const aTime = new Date(a.createdAt || '').getTime();
              const bTime = new Date(b.createdAt || '').getTime();
              return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
            }),
          );
        } catch {
          setAssignedHandoutDocuments([]);
          showError('Assigned handouts could not be loaded. Templates are still available.');
        }
      } else {
        setAssignedHandoutDocuments([]);
      }
    } catch (err: unknown) {
      showError(getErrorMessage(err, 'Failed to load handout templates'));
    } finally {
      setLoading(false);
    }
  }, [session, searchTerm, instructionTypeFilter, handoutTab, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetCreateForm = () => {
    setCreateForm(defaultFormState);
  };

  const openPreview = (handout: Handout) => {
    setSelectedHandout(handout);
    setSelectedPatientId(preferredPatientId);
    setPersonalization({
      patientName: '',
      patientDob: '',
      providerName: session?.user?.fullName || '',
      medicationName: '',
      dosageInstructions: '',
      labSummary: '',
      followUpDate: '',
    });
    setShowPreviewModal(true);
  };

  const loadPatientOptions = useCallback(async () => {
    if (!session) return;
    setPatientsLoading(true);
    try {
      const response = (await fetchPatients(session.tenantId, session.accessToken, {
        limit: HANDOUT_PATIENT_LOOKUP_LIMIT,
        fields: 'id,firstName,lastName,dateOfBirth,mrn,phone',
      })) as PatientsResponseLike;
      const rows = response.patients || response.data || [];
      const normalized = rows.map((row) => ({
        id: String(row.id),
        firstName: String(row.firstName || ''),
        lastName: String(row.lastName || ''),
        dateOfBirth: row.dateOfBirth || '',
        mrn: row.mrn ? String(row.mrn) : '',
        phone: row.phone ? String(row.phone) : '',
      }));
      setPatientOptions(normalized);
    } catch {
      showError('Failed to load patients for handout personalization');
    } finally {
      setPatientsLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    if (!showPreviewModal || !session) return;
    if (patientOptions.length > 0) return;
    void loadPatientOptions();
  }, [showPreviewModal, session, patientOptions.length, loadPatientOptions]);

  const handleSelectPatient = useCallback(
    async (patientId: string) => {
      setSelectedPatientId(patientId);
      if (!patientId || !session) {
        setPersonalization((prev) => ({
          ...prev,
          patientName: '',
          patientDob: '',
          labSummary: '',
          followUpDate: '',
        }));
        return;
      }

      const selected = patientOptions.find((p) => p.id === patientId);
      if (!selected) return;

      setPersonalization((prev) => ({
        ...prev,
        patientName: `${selected.firstName} ${selected.lastName}`.trim(),
        patientDob: formatDateLabel(selected.dateOfBirth),
        labSummary: '',
        followUpDate: '',
      }));

      setFollowUpLoading(true);
      try {
        const relevantOrderTypes = getRelevantOrderTypesForHandout(selectedHandout);
        const [appointmentsPayload, ordersPayload] = await Promise.all([
          fetchAppointments(session.tenantId, session.accessToken, {
            patientId,
          }),
          relevantOrderTypes.length > 0
            ? fetchOrders(session.tenantId, session.accessToken, {
                patientId,
                orderTypes: relevantOrderTypes,
                limit: 10,
              })
            : Promise.resolve({ orders: [] }),
        ]);
        const appointments = (appointmentsPayload?.appointments || []) as Array<{
          appointmentTypeName?: string;
          scheduledStart?: string;
          status?: string;
        }>;
        const orders = (ordersPayload?.orders || []) as Array<{
          type?: string;
          details?: string;
          notes?: string;
          resultFlag?: string;
          createdAt?: string;
        }>;

        const now = Date.now();
        const upcoming = appointments
          .filter((appointment) => {
            if (!appointment?.scheduledStart) return false;
            const scheduledMs = new Date(appointment.scheduledStart).getTime();
            if (Number.isNaN(scheduledMs) || scheduledMs < now) return false;
            return ['scheduled', 'checked_in', 'in_room', 'with_provider'].includes(
              (appointment.status || '').toLowerCase()
            );
          })
          .sort((a, b) => {
            const aMs = new Date(a.scheduledStart || '').getTime();
            const bMs = new Date(b.scheduledStart || '').getTime();
            return aMs - bMs;
          });

        const followUpCandidate =
          upcoming.find((appointment) => /follow[\s-]?up/i.test(appointment.appointmentTypeName || '')) ||
          upcoming[0];

        if (followUpCandidate?.scheduledStart) {
          setPersonalization((prev) => ({
            ...prev,
            followUpDate: formatDateLabel(followUpCandidate.scheduledStart),
          }));
        }

        const autoLabSummary = buildRelevantOrderSummary(selectedHandout, orders);
        if (autoLabSummary) {
          setPersonalization((prev) => ({
            ...prev,
            labSummary: autoLabSummary,
          }));
        }
      } catch {
        // Leave follow-up date manual when appointment lookup fails.
      } finally {
        setFollowUpLoading(false);
      }
    },
    [patientOptions, selectedHandout, session]
  );

  useEffect(() => {
    if (!showPreviewModal || !preferredPatientId || patientOptions.length === 0) return;
    if (selectedPatientId === preferredPatientId) return;
    void handleSelectPatient(preferredPatientId);
  }, [showPreviewModal, preferredPatientId, patientOptions, selectedPatientId, handleSelectPatient]);

  const handleCreate = async () => {
    if (!session) return;
    if (!createForm.title || !createForm.condition || !createForm.content) {
      showError('Title, condition, and content are required');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/handouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify({
          ...createForm,
          content: normalizeTemplatePlaceholders(createForm.content),
        }),
      });

      if (!response.ok) throw new Error('Failed to create handout template');

      showSuccess('Template created');
      setShowCreateModal(false);
      resetCreateForm();
      loadData();
    } catch (err: unknown) {
      showError(getErrorMessage(err, 'Failed to create handout template'));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (handout: Handout) => {
    setSelectedHandout(handout);
    setEditForm({
      title: handout.title,
      category: handout.category,
      condition: handout.condition,
      content: handout.content,
      instructionType: handout.instruction_type,
      printDisclaimer:
        handout.print_disclaimer ||
        'For educational use only. Follow your provider instructions and call with concerns.',
      isActive: handout.is_active,
    });
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!session || !selectedHandout) return;
    if (!editForm.title || !editForm.condition || !editForm.content) {
      showError('Title, condition, and content are required');
      return;
    }

    setUpdating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/handouts/${selectedHandout.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify({
          ...editForm,
          content: normalizeTemplatePlaceholders(editForm.content),
        }),
      });

      if (!response.ok) throw new Error('Failed to update handout template');

      showSuccess('Template updated');
      setShowEditModal(false);
      setSelectedHandout(null);
      loadData();
    } catch (err: unknown) {
      showError(getErrorMessage(err, 'Failed to update handout template'));
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!session) return;
    if (!window.confirm('Delete this template? This cannot be undone.')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/handouts/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });

      if (!response.ok) throw new Error('Failed to delete template');

      showSuccess('Template deleted');
      loadData();
    } catch (err: unknown) {
      showError(getErrorMessage(err, 'Failed to delete template'));
    }
  };

  const renderedContent = useMemo(() => {
    if (!selectedHandout) return '';
    return renderTemplateContent(selectedHandout.content, personalization);
  }, [selectedHandout, personalization]);

  const handlePrint = () => {
    if (!selectedHandout) return;

    const html = toPrintableHtml(
      selectedHandout.title,
      selectedHandout.condition,
      renderedContent,
      {
        disclaimer: selectedHandout.print_disclaimer,
        instructionType: selectedHandout.instruction_type,
        category: getHandoutDisplayCategory(selectedHandout),
        patientName: personalization.patientName,
        patientDob: personalization.patientDob,
        providerName: personalization.providerName,
        followUpDate: personalization.followUpDate,
        generatedOn: getTodayDateLabel(),
      },
    );

    if (session && selectedPatientId) {
      void recordPrintedDocument(session.tenantId, session.accessToken, {
        patientId: selectedPatientId,
        title: selectedHandout.title,
        category: selectedHandout.instruction_type === 'aftercare' ? 'After Visit Instructions' : 'Printed Documents',
        description: `${formatInstructionType(selectedHandout.instruction_type)} handout for ${selectedHandout.condition}`,
        html,
        shareToPortal: true,
        notes: 'Automatically saved from Clinical Print Templates.',
      }).then(() => {
        showSuccess('Printed document saved to chart and patient portal');
      }).catch((error: unknown) => {
        showError(getErrorMessage(error, 'Printed document could not be saved to chart'));
      });
    }

    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) {
      showError('Unable to open print preview');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          showError('Unable to open print dialog. Check popup/print permissions in your browser.');
        }
      }, 150);
    };
    printWindow.onafterprint = () => {
      printWindow.close();
    };
  };

  const filteredHandouts = handouts.filter((h) => {
    if (handoutTab === 'custom' && h.is_system_template) return false;
    if (handoutTab === 'assigned') return false;
    if (categoryFilter !== 'all' && getHandoutDisplayCategory(h) !== categoryFilter) return false;
    if (instructionTypeFilter !== 'all' && h.instruction_type !== instructionTypeFilter) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        h.title.toLowerCase().includes(term) ||
        h.condition.toLowerCase().includes(term) ||
        h.content.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const filteredAssignedHandouts = assignedHandoutDocuments.filter((document) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      document.title.toLowerCase().includes(term) ||
      (document.description || '').toLowerCase().includes(term) ||
      (document.patientName || '').toLowerCase().includes(term) ||
      (document.category || '').toLowerCase().includes(term)
    );
  });

  const groupedByType = filteredHandouts.reduce(
    (acc, handout) => {
      const key = handout.instruction_type || 'general';
      const category = getHandoutDisplayCategory(handout);
      if (!acc[key]) acc[key] = {};
      if (!acc[key][category]) acc[key][category] = [];
      acc[key][category].push(handout);
      return acc;
    },
    {} as Record<string, Record<string, Handout[]>>,
  );

  const setHandoutTabFilter = (next: HandoutTab) => {
    setHandoutTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'library') {
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    setSearchParams(params);
  };

  const setInstructionFilter = (next: InstructionType) => {
    setInstructionTypeFilter(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') {
      params.delete('instructionType');
    } else {
      params.set('instructionType', next);
    }
    setSearchParams(params);
  };

  return (
    <div className="handouts-page">
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => setShowCreateModal(true)}>
          <span className="icon">+</span>
          New Template
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData}>
          <span className="icon"></span>
          Refresh
        </button>
      </div>

      <div className="ema-section-header">Clinical Print Templates</div>

      <div style={{ padding: '0 1rem 1rem 1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(Object.keys(HANDOUT_TAB_LABELS) as HandoutTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={handoutTab === tab ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => setHandoutTabFilter(tab)}
            >
              {HANDOUT_TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#64748b' }}>
          {handoutTab === 'assigned'
            ? 'Assigned handouts are the printed patient instructions saved to the chart and shared to the portal.'
            : handoutTab === 'custom'
              ? 'Custom templates are office-created templates. These can be edited and deleted by authorized staff.'
              : 'Browse all active clinical print templates, grouped by clinical category.'}
        </div>
      </div>

      <div className="ema-filter-panel">
        <div className="ema-filter-row">
          {handoutTab !== 'assigned' && (
            <>
              <div className="ema-filter-group">
                <label className="ema-filter-label">Template Type</label>
                <select
                  className="ema-filter-select"
                  value={instructionTypeFilter}
                  onChange={(e) => setInstructionFilter(e.target.value as InstructionType)}
                >
                  {(Object.keys(INSTRUCTION_TYPE_LABELS) as InstructionType[]).map((type) => (
                    <option key={type} value={type}>
                      {INSTRUCTION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ema-filter-group">
                <label className="ema-filter-label">Category</label>
                <select
                  className="ema-filter-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="ema-filter-group" style={{ flex: 1 }}>
            <label className="ema-filter-label">Search</label>
            <input
              type="text"
              className="ema-filter-select"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {handoutTab !== 'assigned' && (
        <div style={{ margin: '0 1rem 1rem 1rem' }}>
          <PlaceholderGuidePanel compact />
        </div>
      )}

      {loading ? (
        <Skeleton variant="card" height={400} />
      ) : (
        <div style={{ padding: '1rem' }}>
          {handoutTab === 'assigned' ? (
            filteredAssignedHandouts.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem',
                  color: '#6b7280',
                  background: '#f9fafb',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontSize: '1.125rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                  No assigned handouts found
                </div>
                <div style={{ fontSize: '0.875rem' }}>
                  Print a template for a selected patient to save it to the chart and portal.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '1rem',
                }}
              >
                {filteredAssignedHandouts.map((document) => (
                  <div
                    key={document.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                        {document.title}
                      </div>
                      <span
                        style={{
                          background: '#ecfdf5',
                          color: '#047857',
                          fontSize: '0.7rem',
                          borderRadius: '999px',
                          padding: '0.15rem 0.5rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Assigned
                      </span>
                    </div>
                    <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.35rem', fontSize: '0.82rem', color: '#475569' }}>
                      <div>
                        <strong>Patient:</strong> {document.patientName || 'Patient on chart'}
                      </div>
                      <div>
                        <strong>Category:</strong> {document.category || 'Printed Documents'}
                      </div>
                      <div>
                        <strong>Generated:</strong> {formatDateLabel(document.createdAt) || 'Date unavailable'}
                      </div>
                      {document.description && <div>{document.description}</div>}
                    </div>
                    {(document.url || document.objectKey) && (
                      <div style={{ marginTop: '0.85rem' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            const url =
                              document.storage === 's3' && document.objectKey
                                ? `${API_BASE_URL}/api/documents/view/${document.objectKey}`
                                : document.url || `${API_BASE_URL}/api/documents/${document.id}/file`;
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          Open Saved Copy
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : Object.keys(groupedByType).length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                color: '#6b7280',
                background: '#f9fafb',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '1.125rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                No templates found
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                Try adjusting filters or create a new template.
              </div>
            </div>
          ) : (
            Object.entries(groupedByType).map(([type, categories]) => {
              const templatesCount = Object.values(categories).reduce((sum, templates) => sum + templates.length, 0);
              return (
              <div key={type} style={{ marginBottom: '2rem' }}>
                <h3
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: '#1f2937',
                    marginBottom: '1rem',
                    borderBottom: '2px solid #e5e7eb',
                    paddingBottom: '0.5rem',
                  }}
                >
                  {formatInstructionType(type as Exclude<InstructionType, 'all'>)} ({templatesCount})
                </h3>

                {Object.entries(categories)
                  .sort(([a], [b]) => compareCategories(a, b))
                  .map(([category, templates]) => (
                    <div key={`${type}-${category}`} style={{ marginBottom: '1.25rem' }}>
                      <div
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          color: '#334155',
                          marginBottom: '0.65rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '999px',
                            background: '#14b8a6',
                            display: 'inline-block',
                          }}
                        />
                        {category} ({templates.length})
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                          gap: '1rem',
                        }}
                      >
                        {templates.map((handout) => (
                          <div
                            key={handout.id}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              padding: '1rem',
                              transition: 'all 0.2s',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: '0.5rem',
                                marginBottom: '0.5rem',
                              }}
                            >
                              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                                {handout.title}
                              </div>
                              <span
                                style={{
                                  background: handout.is_system_template ? '#ecfccb' : '#e0f2fe',
                                  color: handout.is_system_template ? '#3f6212' : '#075985',
                                  fontSize: '0.7rem',
                                  borderRadius: '999px',
                                  padding: '0.15rem 0.5rem',
                                  fontWeight: 600,
                                }}
                              >
                                {handout.is_system_template ? 'System' : 'Custom'}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.5rem' }}>
                              {handout.condition}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                              Category: {getHandoutDisplayCategory(handout)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                              {handout.content.slice(0, 110)}
                              {handout.content.length > 110 ? '...' : ''}
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button type="button" className="btn-primary btn-sm" onClick={() => openPreview(handout)}>
                                Preview / Print
                              </button>
                              <button type="button" className="btn-secondary btn-sm" onClick={() => openEdit(handout)}>
                                Edit
                              </button>
                              {!handout.is_system_template && (
                                <button
                                  type="button"
                                  className="btn-sm btn-danger"
                                  onClick={() => handleDelete(handout.id)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )})
          )}
        </div>
      )}

      <Modal
        isOpen={showPreviewModal}
        title={selectedHandout?.title || 'Template Preview'}
        onClose={() => setShowPreviewModal(false)}
        size="large"
      >
        {selectedHandout && (
          <>
            <div style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '0.75rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{selectedHandout.condition}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  {formatInstructionType(selectedHandout.instruction_type)} • {getHandoutDisplayCategory(selectedHandout)}
                </div>
              </div>

              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  background: '#ffffff',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Personalize before printing</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <PatientLookupSelect
                    patients={patientOptions}
                    value={selectedPatientId}
                    onChange={(patientId) => void handleSelectPatient(patientId)}
                    label="Patient"
                    loading={patientsLoading}
                    placeholder="Select patient to auto-fill demographics"
                    helperText={`Selecting a patient auto-fills DOB and next follow-up date (if an upcoming visit exists).${
                      isLabOrPathologyTemplate(selectedHandout)
                        ? ' Recent lab/pathology details also auto-fill when available.'
                        : ''
                    }${followUpLoading ? ' Looking up follow-up date...' : ''}`}
                  />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '0.5rem',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Patient name"
                    value={personalization.patientName}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, patientName: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="DOB"
                    value={personalization.patientDob}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, patientDob: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Provider name"
                    value={personalization.providerName}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, providerName: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Follow-up date"
                    value={personalization.followUpDate}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, followUpDate: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Medication name"
                    value={personalization.medicationName}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, medicationName: e.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Dose instructions"
                    value={personalization.dosageInstructions}
                    onChange={(e) =>
                      setPersonalization((prev) => ({ ...prev, dosageInstructions: e.target.value }))
                    }
                  />
                </div>
                <textarea
                  style={{ marginTop: '0.5rem', width: '100%' }}
                  rows={3}
                  placeholder="Lab summary / extra instructions"
                  value={personalization.labSummary}
                  onChange={(e) =>
                    setPersonalization((prev) => ({ ...prev, labSummary: e.target.value }))
                  }
                />
              </div>

              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  background: '#fff',
                  padding: '1rem',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  fontSize: '0.95rem',
                }}
              >
                {renderedContent}
              </div>

              {selectedHandout.print_disclaimer && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem' }}>
                  {selectedHandout.print_disclaimer}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <div style={{ fontSize: '0.78rem', color: '#6b7280', marginRight: 'auto' }}>
                Printing uses your browser + system printer dialog. Choose printer after clicking Print.
              </div>
              <button type="button" className="btn-secondary" onClick={() => setShowPreviewModal(false)}>
                Close
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowPreviewModal(false);
                  openEdit(selectedHandout);
                }}
              >
                Edit Template
              </button>
              <button type="button" className="btn-primary" onClick={handlePrint}>
                Print
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        isOpen={showCreateModal}
        title="Create Template"
        onClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
        size="large"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Title *</label>
            <input
              type="text"
              value={createForm.title}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Template title"
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Template Type *</label>
              <select
                value={createForm.instructionType}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    instructionType: e.target.value as Exclude<InstructionType, 'all'>,
                  }))
                }
              >
                {(Object.keys(INSTRUCTION_TYPE_LABELS) as InstructionType[])
                  .filter((type) => type !== 'all')
                  .map((type) => (
                    <option key={type} value={type}>
                      {INSTRUCTION_TYPE_LABELS[type]}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-field">
              <label>Category *</label>
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Condition *</label>
            <input
              type="text"
              value={createForm.condition}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, condition: e.target.value }))}
              placeholder="e.g., Rash flare, lab review, post biopsy care"
            />
          </div>

          <div className="form-field">
            <label>Content *</label>
            <PlaceholderGuidePanel
              compact
              onInsert={(token) =>
                setCreateForm((prev) => ({
                  ...prev,
                  content: appendTemplateToken(prev.content, token),
                }))
              }
            />
            <textarea
              value={createForm.content}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Use tokens like {{patient_name}}. Friendly versions like {patient name} are also accepted."
              rows={14}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '0.65rem' }}
            />
          </div>

          <div className="form-field">
            <label>Print Disclaimer</label>
            <textarea
              value={createForm.printDisclaimer}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, printDisclaimer: e.target.value }))
              }
              rows={2}
              placeholder="Optional footer disclaimer"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Template'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        title={`Edit Template${selectedHandout ? `: ${selectedHandout.title}` : ''}`}
        onClose={() => setShowEditModal(false)}
        size="large"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Title *</label>
            <input
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Template Type *</label>
              <select
                value={editForm.instructionType}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    instructionType: e.target.value as Exclude<InstructionType, 'all'>,
                  }))
                }
              >
                {(Object.keys(INSTRUCTION_TYPE_LABELS) as InstructionType[])
                  .filter((type) => type !== 'all')
                  .map((type) => (
                    <option key={type} value={type}>
                      {INSTRUCTION_TYPE_LABELS[type]}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-field">
              <label>Category *</label>
              <select
                value={editForm.category}
                onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Condition *</label>
            <input
              type="text"
              value={editForm.condition}
              onChange={(e) => setEditForm((prev) => ({ ...prev, condition: e.target.value }))}
            />
          </div>

          <div className="form-field">
            <label>Content *</label>
            <PlaceholderGuidePanel
              compact
              onInsert={(token) =>
                setEditForm((prev) => ({
                  ...prev,
                  content: appendTemplateToken(prev.content, token),
                }))
              }
            />
            <textarea
              value={editForm.content}
              onChange={(e) => setEditForm((prev) => ({ ...prev, content: e.target.value }))}
              rows={14}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '0.65rem' }}
            />
          </div>

          <div className="form-field">
            <label>Print Disclaimer</label>
            <textarea
              value={editForm.printDisclaimer}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, printDisclaimer: e.target.value }))
              }
              rows={2}
            />
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleUpdate} disabled={updating}>
            {updating ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
