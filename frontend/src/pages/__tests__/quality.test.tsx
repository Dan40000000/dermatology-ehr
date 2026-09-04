import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authMocks = vi.hoisted(() => ({
  headers: { 'x-tenant-id': 'tenant-1', Authorization: 'Bearer token-1' },
  isAuthenticated: true,
}));

const readinessMocks = vi.hoisted(() => ({
  fetchMipsReadiness: vi.fn(),
  fetchMipsEvidence: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../api/mipsReadiness', async () => {
  const actual = await vi.importActual<typeof import('../../api/mipsReadiness')>('../../api/mipsReadiness');
  return { ...actual, ...readinessMocks };
});

import QualityPage from '../QualityPage';

const overview = {
  year: 2026,
  catalog: {
    performanceYear: 2026,
    paymentYear: 2028,
    program: {},
    qualityMeasures: [],
    populationQualityMeasures: [],
    costMeasures: [],
    improvementActivities: [],
  },
  program: {},
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
    quality: { category: 'quality', status: 'unknown', evaluations: [] },
    cost: { category: 'cost', status: 'cms_calculated', evaluations: [] },
    pi: { category: 'pi', status: 'unknown', evaluations: [] },
    ia: { category: 'ia', status: 'unknown', evaluations: [] },
  },
  readiness: { status: 'action_needed', exportState: 'not_ready', submissionState: 'not_submitted' },
  workQueue: [],
  evidenceSummary: { count: 0 },
  exportState: 'not_ready',
  submissionState: 'not_submitted',
};

describe('QualityPage compatibility entry point', () => {
  beforeEach(() => {
    readinessMocks.fetchMipsReadiness.mockResolvedValue(overview);
    readinessMocks.fetchMipsEvidence.mockResolvedValue({ year: 2026, evidence: [] });
  });

  it('renders the readiness center without the former submission UI', async () => {
    render(<MemoryRouter><QualityPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'MIPS Readiness Center', level: 1 })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /submit to (mips|cms|qpp)/i })).not.toBeInTheDocument();
    expect(screen.getByText('Draft preview only—nothing will be submitted or sent.')).toBeInTheDocument();
  });
});
