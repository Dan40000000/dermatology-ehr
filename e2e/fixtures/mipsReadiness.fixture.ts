import type { Page, Route } from '@playwright/test';

const overview = {
  year: 2026,
  catalog: {
    performanceYear: 2026,
    paymentYear: 2028,
    program: { threshold: 75 },
    qualityMeasures: [
      { id: '176', category: 'quality', workflowLabel: 'TB screening before biologic' },
      { id: '440', category: 'quality', workflowLabel: 'Pathology report turnaround' },
      { id: 'AAD6', category: 'quality', workflowLabel: 'Patient notification of biopsy results' },
    ],
    populationQualityMeasures: [
      { id: '479', category: 'quality', workflowLabel: 'CMS-calculated population measure', selectionPolicy: 'cms_calculated' },
    ],
    costMeasures: [
      { id: 'COST_MR_1', category: 'cost', workflowLabel: 'CMS claims-calculated cost measure', selectionPolicy: 'cms_calculated' },
    ],
    improvementActivities: [
      { id: 'IA_BE_4', category: 'ia', workflowLabel: 'Care coordination workflow' },
    ],
  },
  program: { threshold: 75 },
  profile: {
    performanceYear: 2026,
    selectedQualityMeasureIds: ['176', '440', 'AAD6'],
    selectedCostMeasureIds: [],
    selectedImprovementActivityIds: ['IA_BE_4'],
    categoryConfiguration: {},
    eligibilityInputs: {},
  },
  eligibility: { status: 'unknown' },
  categories: {
    quality: { category: 'quality', status: 'action_needed', evaluations: [] },
    cost: { category: 'cost', status: 'cms_calculated', evaluations: [] },
    pi: { category: 'pi', status: 'unknown', evaluations: [] },
    ia: { category: 'ia', status: 'action_needed', evaluations: [] },
  },
  readiness: { status: 'action_needed', exportState: 'not_ready', submissionState: 'not_submitted' },
  workQueue: [],
  evidenceSummary: { count: 3 },
  exportState: 'not_ready',
  submissionState: 'not_submitted',
};

const evidence = [
  {
    id: 'auto-biopsy-440',
    category: 'quality',
    measureId: '440',
    evidenceType: 'pathology_turnaround',
    sourceType: 'biopsy',
    sourceId: 'synthetic-biopsy-440',
    observedAt: '2026-08-31T12:00:00.000Z',
    status: 'candidate',
    origin: 'automation',
    automationRuleId: 'mips-440-biopsy-v2026.1',
    sourceRevision: 2,
    metadata: { computedStatus: 'met', limitationCode: 'VERIFY_REPORT_SENT_TO_BIOPSYING_CLINICIAN' },
  },
  {
    id: 'auto-biopsy-aad6',
    category: 'quality',
    measureId: 'AAD6',
    evidenceType: 'biopsy_notification',
    sourceType: 'biopsy',
    sourceId: 'synthetic-biopsy-aad6',
    observedAt: '2026-08-31T12:00:00.000Z',
    status: 'candidate',
    origin: 'automation',
    automationRuleId: 'mips-aad6-biopsy-v2026.1',
    sourceRevision: 2,
    metadata: { computedStatus: 'needs_review' },
  },
  {
    id: 'auto-therapy-176',
    category: 'quality',
    measureId: '176',
    evidenceType: 'tb_before_biologic',
    sourceType: 'chronic_therapy_registry',
    sourceId: 'synthetic-therapy-176',
    observedAt: '2026-08-31T12:00:00.000Z',
    status: 'candidate',
    origin: 'automation',
    automationRuleId: 'mips-176-therapy-v2026.1',
    sourceRevision: 1,
    metadata: { computedStatus: 'met' },
  },
];

const automation = {
  year: 2026,
  candidateCounts: [{ status: 'candidate', count: 3 }],
  lastRun: null,
  coverage: [
    { id: '176', sourceType: 'chronic_therapy_registry', label: 'Explicit first-course therapy and TB date', limitation: 'Human verification required.' },
    { id: '440', sourceType: 'biopsy', label: 'Lab receipt to recorded pathology result', limitation: 'Delivery proxy.' },
    { id: 'AAD6', sourceType: 'biopsy', label: 'Result to notification', limitation: 'Licensed specification review required.' },
    { id: '485/486', sourceType: 'itch_assessment', label: 'Same-instrument itch scores', limitation: 'Licensed specification review required.' },
  ],
  safety: {
    automaticCredit: false,
    externalSubmission: false,
    message: 'Automation creates candidate evidence only.',
  },
};

const preview = {
  draft: true,
  nonSubmission: true,
  year: 2026,
  submissionState: 'not_submitted',
  exportState: 'not_ready',
  transportState: 'not_configured',
  manifest: {
    performanceYear: 2026,
    paymentYear: 2028,
    selectedQualityMeasureIds: ['176', '440', 'AAD6'],
    selectedCostMeasureIds: [],
    selectedImprovementActivityIds: ['IA_BE_4'],
    eligibilityStatus: 'unknown',
    categoryStatus: { quality: 'action_needed' },
    readinessStatus: 'action_needed',
    workQueue: [],
  },
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function installMipsReadinessRoutes(page: Page) {
  await page.route('**/api/mips/readiness**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    if (request.method() === 'POST' && pathname === '/api/mips/readiness/preview') {
      await fulfillJson(route, preview);
      return;
    }
    if (request.method() === 'GET' && pathname === '/api/mips/readiness/evidence') {
      await fulfillJson(route, { year: 2026, evidence });
      return;
    }
    if (request.method() === 'GET' && pathname === '/api/mips/readiness/automation') {
      await fulfillJson(route, automation);
      return;
    }
    if (request.method() === 'GET' && pathname === '/api/mips/readiness') {
      await fulfillJson(route, overview);
      return;
    }

    await fulfillJson(route, { error: 'MIPS release fixture does not permit this mutation' }, 405);
  });
}
