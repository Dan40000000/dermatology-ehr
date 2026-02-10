import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { referralTrackingService } from '../services/referralTrackingService';

const router = Router();

// =====================================================
// Validation Schemas
// =====================================================

const sourceTypeEnum = z.enum(['physician', 'patient', 'marketing', 'web', 'insurance', 'other']);
const campaignTypeEnum = z.enum(['print', 'digital', 'social', 'email', 'tv', 'radio', 'referral_program', 'event', 'other']);

const recordReferralSchema = z.object({
  sourceType: sourceTypeEnum,
  sourceName: z.string().optional(),
  howHeard: z.string().optional(),
  referringProviderName: z.string().optional(),
  referringProviderNpi: z.string().optional(),
  referringPracticeName: z.string().optional(),
  campaignCode: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  notes: z.string().optional(),
});

const createCampaignSchema = z.object({
  campaignName: z.string().min(1).max(255),
  campaignType: campaignTypeEnum,
  startDate: z.string(),
  endDate: z.string().optional(),
  budgetCents: z.number().int().min(0).optional(),
  trackingCode: z.string().optional(),
  landingPageUrl: z.string().url().optional(),
  description: z.string().optional(),
  targetAudience: z.string().optional(),
  channels: z.array(z.string()).optional(),
});

const updateCampaignSchema = z.object({
  campaignName: z.string().min(1).max(255).optional(),
  campaignType: campaignTypeEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  budgetCents: z.number().int().min(0).optional(),
  spentCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const createReferralSourceSchema = z.object({
  sourceType: sourceTypeEnum,
  sourceName: z.string().min(1).max(255),
  sourceDetails: z.record(z.string(), z.unknown()).optional(),
});

const createPhysicianSchema = z.object({
  npi: z.string().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  credentials: z.string().optional(),
  specialty: z.string().optional(),
  practiceName: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email().optional(),
});

const dateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

const attributeRevenueSchema = z.object({
  amountCents: z.number().int().min(0),
});

// =====================================================
// Referral Source Routes
// =====================================================

// GET /api/referral-sources - List all referral sources
router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const sources = await referralTrackingService.getReferralSources(tenantId);
    res.json({ sources });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch referral sources';
    res.status(500).json({ error: message });
  }
});

// GET /api/referral-sources/options - Get intake dropdown options
router.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const options = await referralTrackingService.getReferralSourceOptions(tenantId);
    res.json({ options });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch referral source options';
    res.status(500).json({ error: message });
  }
});

// POST /api/referral-sources - Create a new referral source
router.post('/', requireAuth, requireRoles(['admin', 'provider']), async (req: AuthedRequest, res) => {
  const parsed = createReferralSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const source = await referralTrackingService.createReferralSource(tenantId, parsed.data, userId);
    res.status(201).json({ source });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create referral source';
    res.status(500).json({ error: message });
  }
});

// POST /api/referral-sources/patient/:patientId - Record referral source for a patient
router.post('/patient/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = recordReferralSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { patientId } = req.params;
    const referral = await referralTrackingService.recordReferralSource(
      tenantId ?? '',
      patientId ?? '',
      parsed.data,
      userId
    );
    res.status(201).json({ referral });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record referral source';
    res.status(500).json({ error: message });
  }
});

// GET /api/referral-sources/patient/:patientId - Get patient's referral info
router.get('/patient/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { patientId } = req.params;
    const referral = await referralTrackingService.getPatientReferral(tenantId ?? '', patientId ?? '');
    res.json({ referral });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch patient referral';
    res.status(500).json({ error: message });
  }
});

// POST /api/referral-sources/patient/:patientId/attribute-revenue - Attribute revenue to patient's source
router.post(
  '/patient/:patientId/attribute-revenue',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    const parsed = attributeRevenueSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const { patientId } = req.params;
      await referralTrackingService.attributeRevenue(tenantId ?? '', patientId ?? '', parsed.data.amountCents);
      res.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to attribute revenue';
      res.status(500).json({ error: message });
    }
  }
);

// POST /api/referral-sources/patient/:patientId/convert - Mark patient as converted
router.post('/patient/:patientId/convert', requireAuth, async (req: AuthedRequest, res) => {
  const { appointmentId } = req.body;
  if (!appointmentId) {
    return res.status(400).json({ error: 'appointmentId is required' });
  }

  try {
    const tenantId = req.user!.tenantId;
    const { patientId } = req.params;
    await referralTrackingService.markPatientConverted(tenantId ?? '', patientId ?? '', appointmentId);
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to mark patient as converted';
    res.status(500).json({ error: message });
  }
});

// =====================================================
// Analytics Routes
// =====================================================

// GET /api/referral-sources/analytics - Get referral analytics
router.get('/analytics', requireAuth, async (req: AuthedRequest, res) => {
  const { startDate, endDate } = req.query;

  // Default to last 30 days if not specified
  const now = new Date();
  const defaultStart = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0] as string;
  const defaultEnd = new Date().toISOString().split('T')[0] as string;

  const dateRange = {
    startDate: (typeof startDate === 'string' ? startDate : defaultStart) as string,
    endDate: (typeof endDate === 'string' ? endDate : defaultEnd) as string
  };

  try {
    const tenantId = req.user!.tenantId;
    const analytics = await referralTrackingService.getReferralAnalytics(tenantId ?? '', dateRange);
    res.json({ analytics });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics';
    res.status(500).json({ error: message });
  }
});

// GET /api/referral-sources/top - Get top referral sources
router.get('/top', requireAuth, async (req: AuthedRequest, res) => {
  const limit = parseInt(req.query.limit as string) || 10;

  try {
    const tenantId = req.user!.tenantId;
    const sources = await referralTrackingService.getTopReferralSources(tenantId, limit);
    res.json({ sources });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch top sources';
    res.status(500).json({ error: message });
  }
});

// GET /api/referral-sources/trends - Get referral trends over time
router.get('/trends', requireAuth, async (req: AuthedRequest, res) => {
  const months = parseInt(req.query.months as string) || 12;

  try {
    const tenantId = req.user!.tenantId;
    const trends = await referralTrackingService.getReferralTrends(tenantId, months);
    res.json({ trends });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch trends';
    res.status(500).json({ error: message });
  }
});

// =====================================================
// Physician Referral Routes
// =====================================================

// GET /api/referral-sources/physicians - Get all referring physicians
router.get('/physicians', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const physicians = await referralTrackingService.getReferringPhysicians(tenantId);
    res.json({ physicians });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch physicians';
    res.status(500).json({ error: message });
  }
});

// GET /api/referral-sources/physicians/search - Search referring physicians
router.get('/physicians/search', requireAuth, async (req: AuthedRequest, res) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const tenantId = req.user!.tenantId;
    const physicians = await referralTrackingService.searchReferringPhysicians(tenantId, q);
    res.json({ physicians });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to search physicians';
    res.status(500).json({ error: message });
  }
});

// GET /api/referral-sources/physicians/:id/stats - Get physician referral stats
router.get('/physicians/:id/stats', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const stats = await referralTrackingService.getPhysicianReferrals(tenantId, id);
    res.json({ stats: stats[0] || null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch physician stats';
    res.status(500).json({ error: message });
  }
});

// POST /api/referral-sources/physicians - Create a new referring physician
router.post('/physicians', requireAuth, requireRoles(['admin', 'provider', 'front_desk']), async (req: AuthedRequest, res) => {
  const parsed = createPhysicianSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const physician = await referralTrackingService.createReferringPhysician(tenantId, parsed.data, userId);
    res.status(201).json({ physician });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create physician';
    res.status(500).json({ error: message });
  }
});

// =====================================================
// Campaign Routes
// =====================================================

// GET /api/referral-sources/campaigns - List all campaigns
router.get('/campaigns', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const campaigns = await referralTrackingService.getCampaigns(tenantId);
    res.json({ campaigns });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaigns';
    res.status(500).json({ error: message });
  }
});

// POST /api/referral-sources/campaigns - Create a new campaign
router.post('/campaigns', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const campaign = await referralTrackingService.createCampaign(tenantId, parsed.data, userId);
    res.status(201).json({ campaign });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create campaign';
    res.status(500).json({ error: message });
  }
});

// PUT /api/referral-sources/campaigns/:id - Update a campaign
router.put('/campaigns/:id', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const updates = {
      ...parsed.data,
      endDate: parsed.data.endDate === null ? undefined : parsed.data.endDate,
    };
    const campaign = await referralTrackingService.updateCampaign(tenantId ?? '', id ?? '', updates);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ campaign });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update campaign';
    res.status(500).json({ error: message });
  }
});

// GET /api/referral-sources/campaigns/:id/roi - Get campaign ROI
router.get('/campaigns/:id/roi', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const roi = await referralTrackingService.getCampaignROI(tenantId ?? '', id ?? '');
    if (!roi) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ roi });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign ROI';
    res.status(500).json({ error: message });
  }
});

export const referralTrackingRouter = router;
