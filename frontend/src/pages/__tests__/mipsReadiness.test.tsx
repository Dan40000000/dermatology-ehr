import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  headers: { 'x-tenant-id': 'tenant-1', Authorization: 'Bearer test-token' },
  isAuthenticated: true,
}));

const apiMocks = vi.hoisted(() => ({
  fetchMipsReadiness: vi.fn(),
  fetchMipsEvidence: vi.fn(),
  fetchMipsAutomation: vi.fn(),
  syncMipsAutomation: vi.fn(),
  reviewMipsEvidence: vi.fn(),
  saveMipsReadinessProfile: vi.fn(),
  createMipsEvidence: vi.fn(),
  previewMipsRegistryManifest: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ ...authMocks, headers: { ...authMocks.headers } }),
}));

vi.mock('../../api/mipsReadiness', async () => {
  const actual = await vi.importActual<typeof import('../../api/mipsReadiness')>('../../api/mipsReadiness');
  return { ...actual, ...apiMocks };
});

import MIPSReadinessPage from '../MIPSReadinessPage';
import type { MipsEvidence } from '../../api/mipsReadiness';

const qualityMeasures = [
  { id: '176', category: 'quality' as const, workflowLabel: 'TB screening before biologic' },
  { id: '410', category: 'quality' as const, workflowLabel: 'Psoriasis medication response' },
  { id: '440', category: 'quality' as const, workflowLabel: 'Pathology report turnaround' },
  { id: 'AAD6', category: 'quality' as const, workflowLabel: 'Patient notification of biopsy results' },
];

const iaActivities = [
  { id: 'IA_BE_4', category: 'ia' as const, workflowLabel: 'Care coordination workflow' },
];

function makeOverview(overrides: Record<string, unknown> = {}) {
  return {
    year: 2026,
    catalog: {
      performanceYear: 2026,
      paymentYear: 2028,
      program: { threshold: 75 },
      qualityMeasures,
      populationQualityMeasures: [{ id: '479', category: 'quality' as const, workflowLabel: 'CMS-calculated population measure', selectionPolicy: 'cms_calculated' as const }],
      costMeasures: [{ id: 'COST_MR_1', category: 'cost' as const, workflowLabel: 'CMS claims-calculated cost measure', selectionPolicy: 'cms_calculated' as const }],
      improvementActivities: iaActivities,
    },
    program: { threshold: 75 },
    profile: {
      performanceYear: 2026,
      selectedQualityMeasureIds: [],
      selectedCostMeasureIds: [],
      selectedImprovementActivityIds: [],
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
    evidenceSummary: { count: 0 },
    exportState: 'not_ready',
    submissionState: 'not_submitted',
    ...overrides,
  };
}

function makePreview() {
  return {
    draft: true as const,
    nonSubmission: true as const,
    year: 2026,
    submissionState: 'not_submitted',
    exportState: 'not_ready',
    transportState: 'not_configured',
    manifest: {
      performanceYear: 2026,
      paymentYear: 2028,
      selectedQualityMeasureIds: ['176'],
      selectedCostMeasureIds: [],
      selectedImprovementActivityIds: ['IA_BE_4'],
      eligibilityStatus: 'unknown',
      categoryStatus: { quality: 'action_needed' },
      readinessStatus: 'action_needed',
      workQueue: [],
    },
  };
}

const automationStatus = {
  year: 2026,
  candidateCounts: [],
  lastRun: null,
  coverage: [
    { id: '176', sourceType: 'chronic_therapy_registry', label: 'Explicit first-course therapy and TB date', limitation: 'Human verification required.' },
    { id: '440', sourceType: 'biopsy', label: 'Lab receipt to recorded pathology result', limitation: 'Delivery proxy.' },
    { id: 'AAD6', sourceType: 'biopsy', label: 'Result to notification', limitation: 'Licensed specification review required.' },
    { id: '485/486', sourceType: 'itch_assessment', label: 'Same-instrument itch scores', limitation: 'Licensed specification review required.' },
  ],
  safety: { automaticCredit: false as const, externalSubmission: false as const, message: 'Automation creates candidate evidence only.' },
};

function renderPage(overview = makeOverview(), evidence: MipsEvidence[] = []) {
  apiMocks.fetchMipsReadiness.mockResolvedValue(overview);
  apiMocks.fetchMipsEvidence.mockResolvedValue({ year: 2026, evidence });
  apiMocks.fetchMipsAutomation.mockResolvedValue(automationStatus);
  return render(<MemoryRouter initialEntries={['/mips-readiness']}><MIPSReadinessPage /></MemoryRouter>);
}

describe('MIPSReadinessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.isAuthenticated = true;
    apiMocks.saveMipsReadinessProfile.mockResolvedValue({ year: 2026, profile: makeOverview().profile });
    apiMocks.createMipsEvidence.mockResolvedValue({ year: 2026, evidence: { id: 'ev-1', category: 'quality', status: 'candidate', evidenceType: 'data_completeness', sourceType: 'qpp_manual', sourceId: 'ref-1', metadata: {} } });
    apiMocks.previewMipsRegistryManifest.mockResolvedValue(makePreview());
    apiMocks.syncMipsAutomation.mockResolvedValue({ runId: 'run-1', status: 'completed', performanceYear: 2026, created: 1, updated: 0, unchanged: 0, stale: 0, connectors: [] });
    apiMocks.reviewMipsEvidence.mockResolvedValue({ year: 2026, evidence: {} });
  });

  it('sets the title, exposes one page heading, and renders the empty/default state', async () => {
    renderPage(makeOverview({ catalog: { ...makeOverview().catalog, qualityMeasures: [], improvementActivities: [] } }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'MIPS Readiness Center', level: 1 })).toBeInTheDocument());
    expect(document.title).toBe('MIPS Readiness Center - DermEHR');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Performance year' })).toHaveValue('2026');
    expect(screen.getByRole('heading', { name: 'Practice profile', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Readiness summary', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/No readiness profile exists yet/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/loaded/i);
  });

  it('does not refetch in a loop when AuthContext returns fresh header objects', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    await waitFor(() => expect(apiMocks.fetchMipsReadiness).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(apiMocks.fetchMipsReadiness).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchMipsEvidence).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchMipsAutomation).toHaveBeenCalledTimes(1);
  });

  it('separates automatic candidates, exposes provenance, and requires an explicit review action', async () => {
    renderPage(makeOverview(), [{
      id: 'auto-440', category: 'quality', measureId: '440', evidenceType: 'pathology_turnaround',
      sourceType: 'biopsy', sourceId: 'synthetic-biopsy-1', observedAt: '2026-01-08T00:00:00Z',
      status: 'candidate', origin: 'automation', automationRuleId: 'mips-440-biopsy-v2026.1',
      sourceRevision: 2,
      metadata: { computedStatus: 'met', limitationCode: 'VERIFY_REPORT_SENT_TO_BIOPSYING_CLINICIAN' },
    }]);
    await screen.findByRole('heading', { name: 'Automation coverage', level: 2 });
    expect(screen.getByText('Automatic candidate')).toBeInTheDocument();
    expect(screen.getByText('mips-440-biopsy-v2026.1')).toBeInTheDocument();
    expect(screen.getByText(/delivery proxy/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open biopsy workflow' })).toHaveAttribute('href', '/biopsies');
    fireEvent.click(screen.getByRole('button', { name: /^Verify candidate/ }));
    await waitFor(() => expect(apiMocks.reviewMipsEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ headers: authMocks.headers }), 'auto-440', 'verified', 2, 2026,
    ));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/marked verified/i));
  });

  it('lets a reviewer explicitly verify manual evidence and restores focus to the reviewed row', async () => {
    renderPage(makeOverview(), [{
      id: 'manual-completeness', category: 'quality', evidenceType: 'data_completeness',
      sourceType: 'qpp_manual', sourceId: 'opaque-reference', observedAt: '2026-01-08T00:00:00Z',
      status: 'candidate', origin: 'manual',
      metadata: { completeCount: 80, eligibleCount: 100 },
    }]);

    await screen.findByRole('heading', { name: 'Manual evidence', level: 2 });
    const reviewButton = screen.getByRole('button', { name: /^Verify manual evidence/ });
    const evidenceRow = reviewButton.closest('li');
    fireEvent.click(reviewButton);

    await waitFor(() => expect(apiMocks.reviewMipsEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ headers: authMocks.headers }), 'manual-completeness', 'verified', null, 2026,
    ));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/marked verified/i));
    await waitFor(() => expect(document.activeElement).toBe(evidenceRow));
  });

  it('gives each evidence review control a unique contextual name and locks every row while a review is pending', async () => {
    const reviewResponse = { year: 2026, evidence: {} };
    let resolveReview: (value: typeof reviewResponse) => void = () => undefined;
    apiMocks.reviewMipsEvidence.mockReturnValueOnce(new Promise<typeof reviewResponse>((resolve) => {
      resolveReview = resolve;
    }));
    renderPage(makeOverview(), [
      {
        id: 'auto-440', category: 'quality', measureId: '440', evidenceType: 'pathology_turnaround',
        sourceType: 'biopsy', sourceId: 'synthetic-biopsy-1', observedAt: '2026-01-08T00:00:00Z',
        status: 'candidate', origin: 'automation', automationRuleId: 'mips-440-biopsy-v2026.1', metadata: {},
      },
      {
        id: 'manual-410', category: 'quality', measureId: '410', evidenceType: 'manual_attestation',
        sourceType: 'qpp_manual', sourceId: 'opaque-reference-2', observedAt: '2026-01-09T00:00:00Z',
        status: 'candidate', origin: 'manual', metadata: {},
      },
    ]);

    await screen.findByRole('heading', { name: 'Manual evidence', level: 2 });
    const verifyButtons = screen.getAllByRole('button', { name: /^Verify/ });
    const rejectButtons = screen.getAllByRole('button', { name: /^Reject/ });
    expect(verifyButtons).toHaveLength(2);
    expect(rejectButtons).toHaveLength(2);
    expect(new Set(verifyButtons.map((button) => button.getAttribute('aria-label'))).size).toBe(2);
    expect(new Set(rejectButtons.map((button) => button.getAttribute('aria-label'))).size).toBe(2);
    expect(verifyButtons[0]).toHaveAccessibleName(/Verify candidate.*Quality measure 440.*Specimen receipt to pathology report.*synthetic-biopsy-1.*auto-440/);
    expect(verifyButtons[1]).toHaveAccessibleName(/Verify manual evidence.*Quality measure 410.*Structured manual attestation.*opaque-reference-2.*manual-410/);

    fireEvent.click(verifyButtons[0]);
    await waitFor(() => expect(apiMocks.reviewMipsEvidence).toHaveBeenCalledTimes(1));
    expect([...screen.getAllByRole('button', { name: /^Verify/ }), ...screen.getAllByRole('button', { name: /^Reject/ })].every((button) => button.hasAttribute('disabled'))).toBe(true);

    fireEvent.click(screen.getAllByRole('button', { name: /^Verify manual evidence/ })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /^Reject candidate/ })[0]);
    expect(apiMocks.reviewMipsEvidence).toHaveBeenCalledTimes(1);

    resolveReview(reviewResponse);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Verify/ }).every((button) => !button.hasAttribute('disabled'))).toBe(true));
  });

  it('reconciles connected workflows and announces the idempotent result', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Automation coverage', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile workflow candidates' }));
    await waitFor(() => expect(apiMocks.syncMipsAutomation).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/1 created, 0 updated, 0 unchanged/i));
  });

  it('renders Ready when the backend reports a ready status', async () => {
    renderPage(makeOverview({
      readiness: { status: 'ready', exportState: 'ready_for_registry_validation', submissionState: 'not_submitted' },
      categories: {
        ...makeOverview().categories,
        quality: { category: 'quality', status: 'ready', metCount: 4, unknownCount: 0, evaluations: [] },
      },
    }));
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
  });

  it('uses labelled controls, fieldset legends, and focuses the validation summary with ARIA references', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });

    expect(screen.getByLabelText('Allowed Part B charges ($)')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('Medicare beneficiaries')).toHaveAttribute('min', '0');
    expect(screen.getByRole('group', { name: /Quality measures/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Improvement Activities/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Quality period start')).toBeRequired();
    expect(screen.getByLabelText('PI period start (180 days)')).toBeRequired();
    expect(screen.getByLabelText('IA period start (90 days)')).toBeRequired();
    expect(screen.getByText(/Required for readiness/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save practice profile' }));
    await waitFor(() => expect(screen.getByRole('alert', { name: '' })).toHaveTextContent(/Review these profile fields/i));
    const summary = screen.getByRole('alert', { name: '' });
    expect(summary).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText('Quality period start')).toHaveAttribute('aria-describedby', 'qualitystartdate-error');
    expect(screen.getByLabelText('Quality period start')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(within(summary).getByRole('link', { name: /Select at least 4 quality measures/i }));
    expect(document.activeElement).toBe(document.getElementById('quality-176'));
  });

  it('sorts the real table with caption, scopes, aria-sort, and a live announcement', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    const table = screen.getByRole('table', { name: /2026 measure and activity catalog/i });
    expect(within(table).getByText(/2026 measure and activity catalog/i)).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(within(table).getAllByRole('rowheader').length).toBeGreaterThan(0);
    expect(within(table).getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Workflow' }));
    expect(within(table).getByRole('columnheader', { name: /Workflow/i })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('status')).toHaveTextContent(/sorted by workflow/i);
  });

  it('keeps evidence structured with candidate default and a server-generated opaque reference', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    expect(screen.getByRole('combobox', { name: 'Lifecycle status' })).toHaveValue('candidate');
    expect(screen.getByText(/opaque reference is generated by the server/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Source ID \/ internal reference/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/note|narrative|MRN|patient name/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Complete records'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Eligible records'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));
    await waitFor(() => expect(apiMocks.createMipsEvidence).toHaveBeenCalled());
    expect(apiMocks.createMipsEvidence.mock.calls[0][1].status).toBe('candidate');
  });

  it('validates evidence values, auto-selects measure IDs, and serializes only relevant metadata', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.change(screen.getByLabelText('Evidence type'), { target: { value: 'tb_before_biologic' } });
    expect(screen.getByLabelText(/Measure or activity ID/i)).toHaveValue('176');
    fireEvent.change(screen.getByLabelText('Screening date'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('First biologic / immune-modifier date'), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));
    await waitFor(() => expect(apiMocks.createMipsEvidence).toHaveBeenCalled());
    expect(apiMocks.createMipsEvidence.mock.calls[0][1]).toMatchObject({ measureId: '176', evidenceType: 'tb_before_biologic' });
    expect(apiMocks.createMipsEvidence.mock.calls[0][1].metadata).toEqual({ screeningDate: '2026-01-01', firstBiologicDate: '2026-02-01' });
    expect(apiMocks.createMipsEvidence.mock.calls[0][1].metadata).not.toHaveProperty('completeCount');
    expect(apiMocks.fetchMipsReadiness).toHaveBeenCalledTimes(2);
    expect(apiMocks.fetchMipsEvidence).toHaveBeenCalledTimes(2);
  });

  it('blocks invalid completeness and cost evidence while focusing the visible error summary', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.change(screen.getByLabelText('Complete records'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Eligible records'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/cannot exceed/i));
    expect(apiMocks.createMipsEvidence).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    const completeCount = screen.getByLabelText('Complete records');
    expect(completeCount).toHaveAttribute('aria-invalid', 'true');
    expect(completeCount).toHaveAttribute('aria-describedby', 'completecount-error');

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'cost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/CMS claims-calculated/i));
    expect(apiMocks.createMipsEvidence).not.toHaveBeenCalled();
  });

  it('keeps a selected Improvement Activity on a manual attestation', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'ia' } });
    fireEvent.change(screen.getByLabelText(/Measure or activity ID/i), { target: { value: 'IA_BE_4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));

    await waitFor(() => expect(apiMocks.createMipsEvidence).toHaveBeenCalled());
    expect(apiMocks.createMipsEvidence.mock.calls[0][1]).toMatchObject({
      category: 'ia',
      measureId: 'IA_BE_4',
      evidenceType: 'manual_attestation',
      status: 'candidate',
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/human verification is still required/i));
  });

  it('rejects PI evidence periods outside 2026 or shorter than 180 days', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'pi' } });
    fireEvent.change(screen.getByLabelText('Evidence type'), { target: { value: 'continuous_period' } });
    fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2025-12-31' } });
    fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2026-06-29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/within the 2026 performance year/i));
    expect(apiMocks.createMipsEvidence).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2026-06-28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/at least 180 continuous days/i));
    expect(apiMocks.createMipsEvidence).not.toHaveBeenCalled();
  });

  it('focuses the related profile control from the work queue', async () => {
    renderPage(makeOverview({ workQueue: [{ id: 'work-176', category: 'quality', ruleId: 'quality:measure:176', measureId: '176', title: 'TB screening workflow', status: 'unknown', priority: 'medium', action: 'Collect evidence.' }] }));
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.click(await screen.findByRole('button', { name: 'Review item: TB screening workflow' }));
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /TB screening before biologic/i }));
  });

  it('maps PI and CHPL work items to their actual profile controls', async () => {
    renderPage(makeOverview({ workQueue: [{ id: 'work-chpl', category: 'pi', ruleId: 'pi:chpl-id', title: 'CHPL identifier', status: 'unknown', priority: 'medium', action: 'Add CHPL identifier.' }] }));
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.click(await screen.findByRole('button', { name: 'Review item: CHPL identifier' }));
    expect(document.activeElement).toBe(screen.getByLabelText('CHPL identifier'));
  });

  it('only previews a draft, shows the exact disclaimer, and focuses the preview heading', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    const previewButton = screen.getByRole('button', { name: 'Preview draft registry export' });
    expect(previewButton).toHaveAttribute('type', 'button');
    expect(screen.getByText('Draft preview only—nothing will be submitted or sent.')).toBeInTheDocument();
    fireEvent.click(previewButton);
    await waitFor(() => expect(apiMocks.previewMipsRegistryManifest).toHaveBeenCalledWith(expect.objectContaining({ headers: authMocks.headers }), 2026));
    expect(apiMocks.saveMipsReadinessProfile).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Draft registry preview', level: 2 })));
    expect(screen.getByText('not_submitted')).toBeInTheDocument();
    expect(screen.getByText('not_configured')).toBeInTheDocument();
  });

  it('shows preview failures in the preview section', async () => {
    apiMocks.previewMipsRegistryManifest.mockRejectedValueOnce(new Error('Preview unavailable'));
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Preview draft registry export' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Preview unavailable'));
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(screen.getByText('Draft preview only—nothing will be submitted or sent.')).toBeInTheDocument();
  });

  it('saves a valid profile and refreshes the readiness overview', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    await user.clear(screen.getByLabelText('Quality period start'));
    await user.type(screen.getByLabelText('Quality period start'), '2026-01-01');
    await user.clear(screen.getByLabelText('Quality period end'));
    await user.type(screen.getByLabelText('Quality period end'), '2026-12-31');
    await user.clear(screen.getByLabelText('PI period start (180 days)'));
    await user.type(screen.getByLabelText('PI period start (180 days)'), '2026-01-01');
    await user.clear(screen.getByLabelText('PI period end'));
    await user.type(screen.getByLabelText('PI period end'), '2026-06-29');
    await user.clear(screen.getByLabelText('IA period start (90 days)'));
    await user.type(screen.getByLabelText('IA period start (90 days)'), '2026-01-01');
    await user.clear(screen.getByLabelText('IA period end'));
    await user.type(screen.getByLabelText('IA period end'), '2026-03-31');
    for (const id of ['176', '410', '440', 'AAD6']) await user.click(screen.getByRole('checkbox', { name: new RegExp(id) }));
    await user.click(screen.getByRole('checkbox', { name: /IA_BE_4/ }));
    await user.click(screen.getByRole('button', { name: 'Save practice profile' }));
    await waitFor(() => expect(apiMocks.saveMipsReadinessProfile).toHaveBeenCalled());
    expect(apiMocks.saveMipsReadinessProfile.mock.calls[0][1].selectedQualityMeasureIds).toEqual(['176', '410', '440', 'AAD6']);
    expect(apiMocks.fetchMipsReadiness).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/refreshed/i));
  });

  it('clears failed initial loads, disables mutations, and recovers through the retry action', async () => {
    apiMocks.fetchMipsReadiness.mockRejectedValueOnce(new Error('Initial MIPS load unavailable')).mockResolvedValueOnce(makeOverview());
    apiMocks.fetchMipsEvidence.mockResolvedValue({ year: 2026, evidence: [] });
    apiMocks.fetchMipsAutomation.mockResolvedValue(automationStatus);
    const { container } = render(<MemoryRouter initialEntries={['/mips-readiness']}><MIPSReadinessPage /></MemoryRouter>);

    const loadError = await screen.findByRole('alert');
    expect(loadError).toHaveAttribute('id', 'mips-load-error-summary');
    expect(loadError).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(loadError);
    expect(screen.getByRole('button', { name: 'Retry loading MIPS data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save practice profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reconcile workflow candidates' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add structured evidence' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview draft registry export' })).toBeDisabled();
    expect(container.querySelector('.mips-year-chip')).not.toHaveAttribute('aria-label');
    expect(screen.queryByText('Skip to MIPS readiness content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading MIPS data' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'MIPS Readiness Center', level: 1 })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Save practice profile' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reconcile workflow candidates' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add structured evidence' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Preview draft registry export' })).toBeEnabled();
  });

  it('clears stale data after a refresh failure and reports a confirmed evidence create separately', async () => {
    const configuredOverview = makeOverview({
      profile: {
        ...makeOverview().profile,
        selectedQualityMeasureIds: ['176', '410', '440', 'AAD6'],
        categoryConfiguration: { qualityStartDate: '2026-01-01', qualityEndDate: '2026-12-31' },
      },
    });
    const automaticCandidate: MipsEvidence = {
      id: 'auto-176', category: 'quality', measureId: '176', evidenceType: 'tb_before_biologic',
      sourceType: 'chronic_therapy_registry', sourceId: 'synthetic-therapy-1', status: 'candidate', origin: 'automation', metadata: {},
    };
    apiMocks.fetchMipsReadiness.mockResolvedValueOnce(configuredOverview).mockRejectedValueOnce(new Error('Refresh MIPS load unavailable'));
    apiMocks.fetchMipsEvidence.mockResolvedValue({ year: 2026, evidence: [automaticCandidate] });
    apiMocks.fetchMipsAutomation.mockResolvedValue(automationStatus);
    const { container } = render(<MemoryRouter initialEntries={['/mips-readiness']}><MIPSReadinessPage /></MemoryRouter>);
    await screen.findByText('Automatic candidate');
    fireEvent.click(screen.getByRole('button', { name: 'Preview draft registry export' }));
    await screen.findByText('Preview manifest');

    fireEvent.change(screen.getByLabelText('Complete records'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Eligible records'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));

    await waitFor(() => expect(apiMocks.createMipsEvidence).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('alert', { name: '' })).toHaveAttribute('id', 'mips-load-error-summary'));
    expect(screen.getByRole('status')).toHaveTextContent(/structured evidence was created.*refresh failed/i);
    expect(screen.queryByText('Automatic candidate')).not.toBeInTheDocument();
    expect(screen.queryByText('Preview manifest')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Quality period start')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save practice profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reconcile workflow candidates' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add structured evidence' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview draft registry export' })).toBeDisabled();
    expect(container.querySelector('.mips-coverage-grid')?.textContent).toBe('');
    expect(screen.getByLabelText('Complete records')).toHaveValue(null);
  });

  it('focuses the profile save error summary when a valid save fails', async () => {
    apiMocks.saveMipsReadinessProfile.mockRejectedValueOnce(new Error('Profile service unavailable'));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    for (const [label, value] of [
      ['Quality period start', '2026-01-01'], ['Quality period end', '2026-12-31'],
      ['PI period start (180 days)', '2026-01-01'], ['PI period end', '2026-06-29'],
      ['IA period start (90 days)', '2026-01-01'], ['IA period end', '2026-03-31'],
    ]) {
      await user.clear(screen.getByLabelText(label));
      await user.type(screen.getByLabelText(label), value);
    }
    for (const id of ['176', '410', '440', 'AAD6']) await user.click(screen.getByRole('checkbox', { name: new RegExp(id) }));
    await user.click(screen.getByRole('checkbox', { name: /IA_BE_4/ }));
    await user.click(screen.getByRole('button', { name: 'Save practice profile' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveAttribute('id', 'profile-error-summary'));
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toHaveTextContent(/Profile service unavailable/);
  });

  it('focuses the top load error summary after a review conflict', async () => {
    apiMocks.reviewMipsEvidence.mockRejectedValueOnce(new Error('Evidence revision conflict'));
    const manualEvidence: MipsEvidence = {
      id: 'manual-conflict', category: 'quality', measureId: '410', evidenceType: 'manual_attestation',
      sourceType: 'qpp_manual', sourceId: 'synthetic-reference-1', status: 'candidate', origin: 'manual', metadata: {},
    };
    renderPage(makeOverview(), [manualEvidence]);
    await screen.findByRole('button', { name: /^Verify manual evidence/ });
    fireEvent.click(screen.getByRole('button', { name: /^Verify manual evidence/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveAttribute('id', 'mips-load-error-summary'));
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(screen.getByRole('button', { name: 'Save practice profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Verify manual evidence/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Reject manual evidence/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading MIPS data' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Verify manual evidence/ })).toBeEnabled());
    expect(screen.getByRole('button', { name: /^Reject manual evidence/ })).toBeEnabled();
  });

  it('marks only the invalid conditional evidence controls and exposes field-specific descriptions', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.change(screen.getByLabelText('Evidence type'), { target: { value: 'pathology_turnaround' } });
    const specimen = screen.getByLabelText('Specimen receipt date');
    const report = screen.getByLabelText('Report sent date');
    expect(specimen).toBeRequired();
    expect(report).toBeRequired();
    expect(specimen).toHaveAttribute('aria-invalid', 'false');
    expect(report).toHaveAttribute('aria-invalid', 'false');
    expect(specimen).toHaveAttribute('aria-describedby', 'specimenreceiptdate-error');
    expect(report).toHaveAttribute('aria-describedby', 'reportsentdate-error');

    fireEvent.change(report, { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/first of the specimen receipt/i));
    expect(specimen).toHaveAttribute('aria-invalid', 'true');
    expect(report).toHaveAttribute('aria-invalid', 'false');
    expect(document.getElementById('specimenreceiptdate-error')).toHaveTextContent(/Enter the first of the specimen receipt/i);

    fireEvent.change(screen.getByLabelText('Evidence type'), { target: { value: 'itch' } });
    for (const label of ['Baseline instrument', 'Baseline score', 'Follow-up instrument', 'Follow-up score']) {
      expect(screen.getByLabelText(label)).toBeRequired();
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-describedby', `${label.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()}-error`);
    }
    fireEvent.change(screen.getByLabelText('Baseline instrument'), { target: { value: 'POEM' } });
    fireEvent.change(screen.getByLabelText('Follow-up instrument'), { target: { value: 'DLQI' } });
    fireEvent.change(screen.getByLabelText('Baseline score'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Follow-up score'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/same itch instrument/i));
    expect(screen.getByLabelText('Baseline instrument')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Follow-up instrument')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Baseline score')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Follow-up score')).toHaveAttribute('aria-invalid', 'false');
  });

  it('accepts a TB negative outcome when screening occurred after the first biologic date', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'MIPS Readiness Center', level: 1 });
    fireEvent.change(screen.getByLabelText('Evidence type'), { target: { value: 'tb_before_biologic' } });
    fireEvent.change(screen.getByLabelText('Screening date'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('First biologic / immune-modifier date'), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add structured evidence' }));

    await waitFor(() => expect(apiMocks.createMipsEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ headers: authMocks.headers }),
      expect.objectContaining({ measureId: '176', evidenceType: 'tb_before_biologic' }),
    ));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/structured evidence created/i));
  });
});
