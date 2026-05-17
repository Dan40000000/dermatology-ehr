// Demo Fetch Interceptor
// Patches window.fetch to return demo data when running in demo mode.

import {
  ALL_PATIENTS,
  ALL_APPOINTMENTS,
  ALL_ENCOUNTERS,
  ALL_VITALS,
  ALL_PRESCRIPTIONS,
  ALL_ORDERS,
  ALL_DOCUMENTS,
  DEMO_BIOPSIES,
  getDemoDataForPortalUser,
} from './demoData';
import {
  createDemoFeeSchedule,
  deleteDemoFeeSchedule,
  deleteDemoFeeScheduleItem,
  exportDemoFeeScheduleCsv,
  getDemoARAging,
  getDemoAutoVerifyStats,
  getDemoBenefits,
  getDemoBillsSummary,
  getDemoClaimDetail,
  getDemoClaimMetrics,
  getDemoClaimStatus,
  getDemoClosingReport,
  getDemoCollectionsTrend,
  getDemoCosmeticCategories,
  getDemoCosmeticPricing,
  getDemoDefaultFeeSchedule,
  getDemoERAs,
  getDemoEraDetails,
  getDemoEfts,
  getDemoFeeForCpt,
  getDemoFeeSchedule,
  getDemoFeeScheduleItems,
  getDemoFeeSchedules,
  getDemoFinancialDashboard,
  getDemoPaymentsSummary,
  getDemoPriorAuthRequirement,
  getDemoEligibilityIssues,
  getDemoEligibilityPending,
  importDemoFeeScheduleItems,
  postDemoEra,
  queryDemoBatches,
  queryDemoBills,
  queryDemoClaims,
  queryDemoFinancialWorkQueue,
  queryDemoPatientPayments,
  queryDemoPayerPayments,
  queryDemoStatements,
  reconcileDemoPayments,
  resolveDemoFinancialWorkQueueItem,
  submitDemoClaim,
  toggleDemoAutoVerify,
  updateDemoFeeSchedule,
  updateDemoFeeScheduleItem,
} from './demoRevenueCycle';

const DEMO_BOOKED_APPOINTMENTS_KEY = 'demoBookedAppointments';
const DEMO_TELEHEALTH_SESSIONS_KEY = 'demoTelehealthSessions.v1';
const DEMO_TELEHEALTH_NOTES_KEY = 'demoTelehealthNotes.v1';
const DEMO_TIME_BLOCKS_KEY = 'demoTimeBlocks.v1';
const DEMO_BODY_MARKERS_KEY = 'demoBodyMapMarkers.v1';
const DEMO_APPOINTMENT_OVERRIDES_KEY = 'demoAppointmentOverrides.v1';
const DEMO_RECALL_CAMPAIGNS_KEY = 'demoRecallCampaigns.v1';
const DEMO_RECALLS_KEY = 'demoRecalls.v1';
const DEMO_RECALL_HISTORY_KEY = 'demoRecallHistory.v1';
const DEMO_CREATED_PATIENTS_KEY = 'demoCreatedPatients.v1';
const DEMO_PATIENT_OVERRIDES_KEY = 'demoPatientOverrides.v1';
const DEMO_BIOPSY_OVERRIDES_KEY = 'demoBiopsyOverrides.v1';
const DEMO_TASKS_KEY = 'demoTasks.v1';
const DEMO_STORE_PRODUCTS_KEY = 'demoStoreProducts.v1';
const DEMO_STORE_ORDERS_KEY = 'demoStoreOrders.v1';

function isLocalDemoEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_LOCAL_DEMO === 'true';
}

const DEMO_SCHEDULING_SETTINGS = {
  isEnabled: true,
  minAdvanceHours: 24,
  maxAdvanceDays: 90,
  bookingWindowDays: 60,
  customMessage: 'Demo scheduling is connected to the provider-side schedule.',
  requireReason: false,
};

const DEMO_SCHEDULING_PROVIDERS = [
  {
    id: 'demo-provider-1',
    fullName: 'Dr. David Skin, MD, FAAD',
    specialty: 'Dermatology - General',
    bio: 'General dermatology, rashes, psoriasis, and longitudinal skin care.',
    profileImageUrl: null,
  },
  {
    id: 'demo-provider-2',
    fullName: 'Riley Johnson, PA-C',
    specialty: 'Dermatology - General',
    bio: 'Acne, eczema, rosacea, and routine follow-up care.',
    profileImageUrl: null,
  },
  {
    id: 'demo-provider-3',
    fullName: 'Dr. Maria Martinez, MD, FAAD',
    specialty: 'Dermatology - General & Medical',
    bio: 'Skin checks, lesion surveillance, biopsies, and complex medical dermatology.',
    profileImageUrl: null,
  },
  {
    id: 'demo-provider-4',
    fullName: 'Sarah Mitchell, PA-C',
    specialty: 'Cosmetic Dermatology',
    bio: 'Injectables, peels, microneedling, and other superficial cosmetic treatments.',
    profileImageUrl: null,
  },
  {
    id: 'demo-provider-5',
    fullName: 'Dr. Phil Jackson - PA',
    specialty: 'Dermatology',
    bio: 'Established-patient follow-ups, skin checks, and common office procedures.',
    profileImageUrl: null,
  },
];

const DEMO_SCHEDULING_APPOINTMENT_TYPES = [
  { id: 'type-fu', name: 'Follow-Up Visit', durationMinutes: 30, description: 'Established patient follow-up.' },
  { id: 'type-acne', name: 'Acne Follow-Up', durationMinutes: 30, description: 'Acne treatment management.' },
  { id: 'type-eczema', name: 'Eczema Follow-Up', durationMinutes: 30, description: 'Eczema and dermatitis review.' },
  { id: 'type-psoriasis', name: 'Psoriasis Follow-Up', durationMinutes: 30, description: 'Psoriasis monitoring and treatment review.' },
  { id: 'type-telehealth-fu', name: 'Telehealth Follow-Up', durationMinutes: 20, description: 'Virtual established patient follow-up.' },
  { id: 'type-video-acne', name: 'Video Acne Follow-Up', durationMinutes: 20, description: 'Virtual acne medication check.' },
  { id: 'type-skin-check', name: 'Skin Check', durationMinutes: 30, description: 'Routine skin surveillance visit.' },
  { id: 'type-botox-consult', name: 'Botox Consultation', durationMinutes: 30, description: 'Cosmetic neurotoxin consultation.' },
  { id: 'type-botox-treatment', name: 'Botox Treatment', durationMinutes: 30, description: 'Botox or dysport treatment session.' },
  { id: 'type-filler-consult', name: 'Dermal Filler Consultation', durationMinutes: 30, description: 'Consultation for dermal filler planning.' },
  { id: 'type-filler-treatment', name: 'Dermal Filler Treatment', durationMinutes: 45, description: 'Cosmetic filler treatment appointment.' },
  { id: 'type-chemical-peel', name: 'Chemical Peel', durationMinutes: 45, description: 'Superficial or medium depth peel visit.' },
  { id: 'type-hydrafacial', name: 'Hydrafacial', durationMinutes: 45, description: 'Aesthetic skin refresh treatment.' },
  { id: 'type-microneedling', name: 'Microneedling', durationMinutes: 60, description: 'Collagen induction cosmetic treatment.' },
  { id: 'type-cosmetic-fu', name: 'Cosmetic Follow-Up', durationMinutes: 30, description: 'Post-procedure cosmetic follow-up.' },
];

const PORTAL_EMAILS = [
  'patient@demo.portal',
  'jane@demo.portal',
  'marcus@demo.portal',
  'sofia@demo.portal',
];

type DemoItem = Record<string, any>;

const DEFAULT_DEMO_STORE_PRODUCTS: DemoItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-demo',
    sku: 'SPF-TINT-50',
    name: 'Tinted Mineral SPF 50',
    description: 'Broad-spectrum mineral sunscreen with a sheer tint.',
    category: 'sunscreen',
    brand: 'ClearDerm',
    price: 4200,
    cost: 1850,
    inventoryCount: 32,
    reorderPoint: 8,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    tenantId: 'tenant-demo',
    sku: 'BARRIER-CRM',
    name: 'Barrier Repair Cream',
    description: 'Fragrance-free moisturizer for irritated or dry skin.',
    category: 'skincare',
    brand: 'ClearDerm',
    price: 3600,
    cost: 1425,
    inventoryCount: 18,
    reorderPoint: 6,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    tenantId: 'tenant-demo',
    sku: 'POST-LASER-KIT',
    name: 'Post-Laser Recovery Kit',
    description: 'Cleanser, balm, and SPF for procedure recovery.',
    category: 'post_procedure',
    brand: 'AesthetiCare',
    price: 6800,
    cost: 2900,
    inventoryCount: 9,
    reorderPoint: 10,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    tenantId: 'tenant-demo',
    sku: 'HA-SERUM',
    name: 'Hydrating HA Serum',
    description: 'Lightweight hyaluronic acid serum for daily hydration.',
    category: 'cosmetic',
    brand: 'AesthetiCare',
    price: 5200,
    cost: 2100,
    inventoryCount: 14,
    reorderPoint: 5,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEMO_PHARMACIES: DemoItem[] = [
  {
    id: 'pharm-demo-walgreens-denver-blake',
    ncpdpId: '4938162',
    name: 'Walgreens - Blake Street',
    phone: '(720) 555-9200',
    fax: '(720) 555-9201',
    street: '1560 Blake St',
    city: 'Denver',
    state: 'CO',
    zip: '80202',
    isPreferred: true,
    is24Hour: false,
    acceptsErx: true,
    chain: 'Walgreens',
  },
  {
    id: 'pharm-demo-cvs-boulder-28th',
    ncpdpId: '0629481',
    name: 'CVS Pharmacy - Boulder',
    phone: '(303) 555-8800',
    fax: '(303) 555-8801',
    street: '1600 28th St',
    city: 'Boulder',
    state: 'CO',
    zip: '80301',
    isPreferred: true,
    is24Hour: false,
    acceptsErx: true,
    chain: 'CVS',
  },
  {
    id: 'pharm-demo-king-soopers-denver-chestnut',
    ncpdpId: '7142059',
    name: 'King Soopers Pharmacy - Chestnut',
    phone: '(720) 555-7711',
    fax: '(720) 555-7712',
    street: '1950 Chestnut Pl',
    city: 'Denver',
    state: 'CO',
    zip: '80202',
    isPreferred: true,
    is24Hour: false,
    acceptsErx: true,
    chain: 'King Soopers',
  },
  {
    id: 'pharm-demo-cvs-specialty-boulder',
    ncpdpId: '2176048',
    name: 'CVS Specialty - Boulder',
    phone: '(303) 555-6440',
    fax: '(303) 555-6441',
    street: '1881 9th St',
    city: 'Boulder',
    state: 'CO',
    zip: '80302',
    isPreferred: false,
    is24Hour: false,
    acceptsErx: true,
    chain: 'CVS Specialty',
  },
  {
    id: 'pharm-demo-walgreens-denver-colfax-24hr',
    ncpdpId: '5817340',
    name: 'Walgreens - Colfax 24 Hour',
    phone: '(303) 555-2400',
    fax: '(303) 555-2401',
    street: '2000 E Colfax Ave',
    city: 'Denver',
    state: 'CO',
    zip: '80206',
    isPreferred: false,
    is24Hour: true,
    acceptsErx: true,
    chain: 'Walgreens',
  },
];

function isOfficeDemoMode(headers: Record<string, string>): boolean {
  const auth = headers.Authorization || headers.authorization || '';
  return auth.includes('.demo');
}

function isPortalDemoMode(): boolean {
  return localStorage.getItem('patientPortalToken') === 'demo-portal-token';
}

function getPortalPatientEmail(): string {
  const stored = localStorage.getItem('patientPortalPatient');
  if (!stored) return '';
  try {
    return JSON.parse(stored).email || '';
  } catch {
    return '';
  }
}

function transformPortalAppointment(apt: DemoItem) {
  const start = String(apt.scheduledStart || '');
  return {
    ...apt,
    appointmentDate: start.split('T')[0] || '',
    appointmentTime: start.split('T')[1]?.slice(0, 5) || '',
    appointmentType: String(apt.appointmentTypeName || ''),
  };
}

function transformVital(v: DemoItem) {
  const heightCm = Number(v.heightCm || 0);
  const weightKg = Number(v.weightKg || 0);
  const tempC = v.tempC == null ? null : Number(v.tempC);
  const heightIn = Math.round(heightCm / 2.54);
  const weightLbs = Math.round(weightKg * 2.205 * 10) / 10;
  const heightM = heightCm / 100;
  const bmi = heightM > 0 ? Math.round((weightKg / (heightM * heightM)) * 10) / 10 : undefined;

  return {
    ...v,
    date: v.recordedAt,
    provider: 'Dr. David Skin, MD, FAAD',
    bloodPressure:
      v.bpSystolic && v.bpDiastolic ? `${v.bpSystolic}/${v.bpDiastolic}` : undefined,
    heartRate: v.pulse,
    temperature:
      tempC == null ? undefined : Math.round((tempC * 9 / 5 + 32) * 10) / 10,
    weight: weightLbs || undefined,
    height: heightIn || undefined,
    bmi,
    oxygenSaturation: v.o2Saturation,
  };
}

function flattenLabResults(labs: Array<DemoItem>) {
  const flat: DemoItem[] = [];
  for (const lab of labs || []) {
    const values = Array.isArray(lab.values) ? lab.values : [];
    for (const value of values) {
      flat.push({
        id: `${lab.id}-${String(value.name).replace(/\s+/g, '-').toLowerCase()}`,
        observationDate: lab.resultDate,
        testName: value.name,
        value: value.value,
        unit: value.unit,
        referenceRange: value.referenceRange,
        abnormalFlag: value.flag === 'normal' ? '' : (value.flag || ''),
        status: lab.status,
      });
    }
  }
  return flat;
}

function flattenProfile(profile: DemoItem) {
  if (!profile) return profile;
  const emergencyContact = profile.emergencyContact || {};
  const pharmacy = profile.pharmacy || {};

  return {
    ...profile,
    emergencyContactName: emergencyContact.name || '',
    emergencyContactRelationship: emergencyContact.relationship || '',
    emergencyContactPhone: emergencyContact.phone || '',
    preferredPharmacy: pharmacy.name || '',
    pharmacyName: pharmacy.name || '',
    pharmacyPhone: pharmacy.phone || '',
    pharmacyAddress: pharmacy.address || '',
    dob: profile.dateOfBirth,
    gender: profile.sex === 'M' ? 'Male' : profile.sex === 'F' ? 'Female' : '',
    portalEmail: profile.email,
    emailVerified: true,
    lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    passwordUpdatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getParams(url: string): URLSearchParams {
  try {
    return new URL(url, window.location.origin).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function searchDemoPharmacies(params: URLSearchParams) {
  const query = (params.get('query') || params.get('search') || '').trim().toLowerCase();
  const ncpdpId = (params.get('ncpdpId') || '').trim();
  const city = (params.get('city') || '').trim().toLowerCase();
  const state = (params.get('state') || '').trim().toUpperCase();
  const zip = (params.get('zip') || '').trim();
  const preferredOnly = params.get('preferred') === 'true';

  const pharmacies = DEMO_PHARMACIES.filter((pharmacy) => {
    if (preferredOnly && !pharmacy.isPreferred) return false;
    if (ncpdpId && pharmacy.ncpdpId !== ncpdpId) return false;
    if (city && !String(pharmacy.city || '').toLowerCase().includes(city)) return false;
    if (state && pharmacy.state !== state) return false;
    if (zip && pharmacy.zip !== zip) return false;
    if (!query) return true;
    return [pharmacy.name, pharmacy.chain, pharmacy.city, pharmacy.zip, pharmacy.ncpdpId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  return { pharmacies, total: pharmacies.length };
}

function parseRequestBody(init?: RequestInit): DemoItem | null {
  if (!init?.body || typeof init.body !== 'string') return null;
  try {
    return JSON.parse(init.body);
  } catch {
    return null;
  }
}

function getPortalDataByPatientId(patientId: string) {
  for (const email of PORTAL_EMAILS) {
    const data = getDemoDataForPortalUser(email);
    if (data?.patient?.id === patientId) return data;
  }
  return null;
}

function readBookedAppointments(): DemoItem[] {
  try {
    const raw = localStorage.getItem(DEMO_BOOKED_APPOINTMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBookedAppointments(appointments: DemoItem[]) {
  localStorage.setItem(DEMO_BOOKED_APPOINTMENTS_KEY, JSON.stringify(appointments));
}

function readStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeStorageJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readDemoStoreProducts(): DemoItem[] {
  const stored = readStorageJson<DemoItem[] | null>(DEMO_STORE_PRODUCTS_KEY, null);
  return Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_DEMO_STORE_PRODUCTS;
}

function writeDemoStoreProducts(products: DemoItem[]) {
  writeStorageJson(DEMO_STORE_PRODUCTS_KEY, products);
}

function readDemoStoreOrders(): DemoItem[] {
  return readStorageJson<DemoItem[]>(DEMO_STORE_ORDERS_KEY, []);
}

function writeDemoStoreOrders(orders: DemoItem[]) {
  writeStorageJson(DEMO_STORE_ORDERS_KEY, orders);
}

function readDemoCreatedPatients(): DemoItem[] {
  return readStorageJson<DemoItem[]>(DEMO_CREATED_PATIENTS_KEY, []);
}

function writeDemoCreatedPatients(patients: DemoItem[]) {
  writeStorageJson(DEMO_CREATED_PATIENTS_KEY, patients);
}

function readDemoPatientOverrides(): Record<string, DemoItem> {
  return readStorageJson<Record<string, DemoItem>>(DEMO_PATIENT_OVERRIDES_KEY, {});
}

function writeDemoPatientOverrides(overrides: Record<string, DemoItem>) {
  writeStorageJson(DEMO_PATIENT_OVERRIDES_KEY, overrides);
}

function getAllPatients(): DemoItem[] {
  const overrides = readDemoPatientOverrides();
  const basePatients = [...readDemoCreatedPatients(), ...ALL_PATIENTS];
  return basePatients.map((patient) => ({
    ...patient,
    ...(overrides[String(patient.id)] || {}),
  }));
}

function getPatientById(patientId: string) {
  return getAllPatients().find((patient) => patient.id === patientId) || null;
}

function readDemoBiopsyOverrides(): Record<string, DemoItem> {
  return readStorageJson<Record<string, DemoItem>>(DEMO_BIOPSY_OVERRIDES_KEY, {});
}

function writeDemoBiopsyOverrides(overrides: Record<string, DemoItem>) {
  writeStorageJson(DEMO_BIOPSY_OVERRIDES_KEY, overrides);
}

function getDemoBiopsies(): DemoItem[] {
  const overrides = readDemoBiopsyOverrides();
  return DEMO_BIOPSIES.map((biopsy) => {
    const merged = {
      ...biopsy,
      ...(overrides[String(biopsy.id)] || {}),
    };
    const patient = getPatientById(String(merged.patient_id || merged.patientId || ''));
    return {
      ...merged,
      patient_name: merged.patient_name || (patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : ''),
      mrn: merged.mrn || patient?.mrn || '',
      date_of_birth: merged.date_of_birth || patient?.dateOfBirth || patient?.dob || null,
      patient_phone: merged.patient_phone || patient?.phone || null,
      patient_email: merged.patient_email || patient?.email || null,
    };
  });
}

function updateDemoBiopsyRecord(biopsyId: string, updates: DemoItem): DemoItem | null {
  const current = getDemoBiopsies().find((biopsy) => String(biopsy.id) === String(biopsyId));
  if (!current) return null;

  const next = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  writeDemoBiopsyOverrides({
    ...readDemoBiopsyOverrides(),
    [biopsyId]: next,
  });
  return next;
}

function readDemoTasks(): DemoItem[] {
  return readStorageJson<DemoItem[]>(DEMO_TASKS_KEY, []);
}

function writeDemoTasks(tasks: DemoItem[]) {
  writeStorageJson(DEMO_TASKS_KEY, tasks);
}

const demoSeverityRank: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function parseDemoDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function demoDaysSince(value: unknown, now = new Date()): number | null {
  const date = parseDemoDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function isDemoTreatmentAction(action: unknown): boolean {
  return ['reexcision', 'mohs', 'oncology_referral', 'dermatology_followup'].includes(String(action || ''));
}

function highestDemoSeverity(flags: DemoItem[]): string | null {
  if (flags.length === 0) return null;
  return flags.reduce((highest, flag) => (
    demoSeverityRank[String(flag.severity)] > demoSeverityRank[highest] ? String(flag.severity) : highest
  ), String(flags[0].severity));
}

function decorateDemoBiopsySafety(biopsy: DemoItem, now = new Date()): DemoItem {
  const status = String(biopsy.status || 'ordered');
  const malignancyType = biopsy.malignancy_type ? String(biopsy.malignancy_type) : null;
  const daysSinceOrdered = demoDaysSince(biopsy.ordered_at, now);
  const daysSinceSent = demoDaysSince(biopsy.sent_at, now);
  const daysSinceResult = demoDaysSince(biopsy.resulted_at, now);
  const daysSinceReview = demoDaysSince(biopsy.reviewed_at, now);
  const flags: DemoItem[] = [];

  if (['ordered', 'collected'].includes(status) && daysSinceOrdered != null && daysSinceOrdered >= 2 && !biopsy.sent_at) {
    flags.push({
      id: 'specimen_not_sent',
      type: 'specimen_not_sent',
      severity: daysSinceOrdered >= 4 ? 'high' : 'medium',
      title: 'Specimen not sent',
      message: `Specimen has been in ${status} status for ${daysSinceOrdered} days.`,
      action: 'Confirm collection and send to pathology lab.',
    });
  }

  if (['sent', 'received_by_lab', 'processing'].includes(status) && daysSinceSent != null && daysSinceSent > 7 && !biopsy.resulted_at) {
    flags.push({
      id: 'result_overdue',
      type: 'result_overdue',
      severity: daysSinceSent >= 14 ? 'critical' : 'high',
      title: 'Pathology result overdue',
      message: `Specimen was sent ${daysSinceSent} days ago with no final result.`,
      action: 'Call pathology lab and document follow-up.',
    });
  }

  if (status === 'resulted') {
    flags.push({
      id: 'pending_provider_review',
      type: 'pending_provider_review',
      severity: malignancyType === 'melanoma' ? 'critical' : malignancyType ? 'high' : 'medium',
      title: 'Result needs provider review',
      message: malignancyType
        ? `${malignancyType} result is not signed off.`
        : 'Final pathology result is available but not signed off.',
      action: 'Review result, code diagnosis, and document follow-up plan.',
    });
  }

  if (status === 'reviewed' && biopsy.patient_notified === false) {
    flags.push({
      id: 'patient_not_notified',
      type: 'patient_not_notified',
      severity: malignancyType === 'melanoma' ? 'critical' : malignancyType ? 'high' : 'medium',
      title: 'Patient notification missing',
      message: 'Provider review is complete but patient notification is not documented.',
      action: 'Notify patient and record method, date, and notes.',
    });
  }

  if (status !== 'closed' && malignancyType && biopsy.patient_notified === true && isDemoTreatmentAction(biopsy.follow_up_action) && !biopsy.reexcision_scheduled_date) {
    flags.push({
      id: 'treatment_not_scheduled',
      type: 'treatment_not_scheduled',
      severity: malignancyType === 'melanoma' ? 'critical' : 'high',
      title: 'Treatment follow-up not scheduled',
      message: `${biopsy.follow_up_action} is planned but no treatment date is documented.`,
      action: 'Schedule treatment, Mohs, referral, or surveillance appointment.',
    });
  }

  let safetyStage = 'closed';
  let loopStatus = 'Closed loop complete';
  let nextAction = 'No action needed';

  if (['ordered', 'collected', 'sent', 'received_by_lab', 'processing'].includes(status)) {
    safetyStage = 'pending_result';
    loopStatus = flags.some((flag) => flag.type === 'result_overdue') ? 'Result overdue' : 'Awaiting pathology';
    nextAction = flags[0]?.action || 'Monitor result status.';
  } else if (status === 'resulted') {
    safetyStage = 'pending_review';
    loopStatus = 'Needs provider review';
    nextAction = 'Review and sign pathology result.';
  } else if (status === 'reviewed' && biopsy.patient_notified === false) {
    safetyStage = 'pending_notification';
    loopStatus = 'Needs patient notification';
    nextAction = 'Notify patient and document contact.';
  } else if (status !== 'closed' && malignancyType && isDemoTreatmentAction(biopsy.follow_up_action) && !biopsy.reexcision_scheduled_date) {
    safetyStage = 'treatment_follow_up';
    loopStatus = 'Needs treatment scheduling';
    nextAction = 'Schedule treatment follow-up.';
  }

  return {
    ...biopsy,
    days_since_ordered: daysSinceOrdered,
    days_since_sent: daysSinceSent,
    days_since_result: daysSinceResult,
    days_since_review: daysSinceReview,
    safety_flags: flags,
    highest_severity: highestDemoSeverity(flags),
    safety_stage: safetyStage,
    loop_status: loopStatus,
    next_action: nextAction,
  };
}

function sortDemoBiopsiesBySafety(biopsies: DemoItem[]): DemoItem[] {
  return [...biopsies].sort((a, b) => {
    const severityDiff = (demoSeverityRank[String(b.highest_severity || '')] || 0) - (demoSeverityRank[String(a.highest_severity || '')] || 0);
    if (severityDiff !== 0) return severityDiff;
    return String(a.resulted_at || a.sent_at || a.ordered_at || '').localeCompare(String(b.resulted_at || b.sent_at || b.ordered_at || ''));
  });
}

function buildDemoBiopsyCommandCenter() {
  const biopsies = sortDemoBiopsiesBySafety(getDemoBiopsies().map((biopsy) => decorateDemoBiopsySafety(biopsy)));
  const queues = {
    critical: biopsies.filter((biopsy) => ['critical', 'high'].includes(String(biopsy.highest_severity || ''))),
    pendingResults: biopsies.filter((biopsy) => biopsy.safety_stage === 'pending_result'),
    pendingReview: biopsies.filter((biopsy) => biopsy.safety_stage === 'pending_review'),
    pendingNotification: biopsies.filter((biopsy) => biopsy.safety_stage === 'pending_notification'),
    treatmentFollowUp: biopsies.filter((biopsy) => biopsy.safety_stage === 'treatment_follow_up'),
    closed: biopsies.filter((biopsy) => biopsy.safety_stage === 'closed'),
  };
  const openBiopsies = biopsies.filter((biopsy) => biopsy.safety_stage !== 'closed');
  const turnaround = biopsies
    .map((biopsy) => Number(biopsy.turnaround_time_days))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgTurnaroundDays = turnaround.length
    ? turnaround.reduce((sum, value) => sum + value, 0) / turnaround.length
    : null;

  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_open_loops: openBiopsies.length,
      overdue_results: queues.pendingResults.filter((biopsy) =>
        (biopsy.safety_flags || []).some((flag: DemoItem) => flag.type === 'result_overdue'),
      ).length,
      pending_review: queues.pendingReview.length,
      needs_patient_notification: queues.pendingNotification.length,
      needs_treatment_scheduling: queues.treatmentFollowUp.length,
      open_malignancies: openBiopsies.filter((biopsy) => biopsy.malignancy_type).length,
      open_melanomas: openBiopsies.filter((biopsy) => biopsy.malignancy_type === 'melanoma').length,
      closed_loop_complete: queues.closed.length,
      critical_items: queues.critical.filter((biopsy) => biopsy.highest_severity === 'critical').length,
      avg_turnaround_days: avgTurnaroundDays,
    },
    queues,
    biopsies,
  };
}

function buildDemoBiopsyMetrics() {
  const biopsies = getDemoBiopsies();
  const turnaround = biopsies
    .map((biopsy) => Number(biopsy.turnaround_time_days))
    .filter((value) => Number.isFinite(value) && value > 0);
  const within7 = turnaround.filter((value) => value <= 7).length;
  return {
    total_biopsies: biopsies.length,
    avg_turnaround_days: turnaround.length ? turnaround.reduce((sum, value) => sum + value, 0) / turnaround.length : null,
    max_turnaround_days: turnaround.length ? Math.max(...turnaround) : null,
    min_turnaround_days: turnaround.length ? Math.min(...turnaround) : null,
    within_7_days: within7,
    over_7_days: turnaround.filter((value) => value > 7).length,
    total_overdue: biopsies.filter((biopsy) => decorateDemoBiopsySafety(biopsy).safety_flags.some((flag: DemoItem) => flag.type === 'result_overdue')).length,
    total_malignancies: biopsies.filter((biopsy) => biopsy.malignancy_type).length,
    total_melanoma: biopsies.filter((biopsy) => biopsy.malignancy_type === 'melanoma').length,
    patients_notified: biopsies.filter((biopsy) => biopsy.patient_notified === true).length,
    completed_biopsies: biopsies.filter((biopsy) => biopsy.status === 'closed').length,
    within_7_days_percentage: turnaround.length ? Math.round((within7 / turnaround.length) * 100) : null,
  };
}

function filterDemoBiopsies(params: URLSearchParams): DemoItem[] {
  let biopsies = getDemoBiopsies().map((biopsy) => decorateDemoBiopsySafety(biopsy));
  const patientId = params.get('patient_id');
  const status = params.get('status');
  const providerId = params.get('ordering_provider_id');
  const malignancyType = params.get('malignancy_type');
  const isOverdue = params.get('is_overdue');

  if (patientId) biopsies = biopsies.filter((biopsy) => String(biopsy.patient_id || biopsy.patientId) === patientId);
  if (status) biopsies = biopsies.filter((biopsy) => String(biopsy.status) === status);
  if (providerId) biopsies = biopsies.filter((biopsy) => String(biopsy.ordering_provider_id) === providerId);
  if (malignancyType) biopsies = biopsies.filter((biopsy) => String(biopsy.malignancy_type) === malignancyType);
  if (isOverdue === 'true') {
    biopsies = biopsies.filter((biopsy) => (biopsy.safety_flags || []).some((flag: DemoItem) => flag.type === 'result_overdue'));
  }

  return sortDemoBiopsiesBySafety(biopsies);
}

function buildDemoBiopsyDetail(biopsy: DemoItem): DemoItem {
  const decorated = decorateDemoBiopsySafety(biopsy);
  return {
    ...decorated,
    alerts: (decorated.safety_flags || []).map((flag: DemoItem) => ({
      id: `${decorated.id}-${flag.id}`,
      alert_type: flag.type,
      severity: flag.severity,
      title: flag.title,
      message: flag.message,
      status: 'active',
      created_at: decorated.resulted_at || decorated.sent_at || decorated.ordered_at,
    })),
    specimen_tracking: [
      { id: `${decorated.id}-ordered`, event_type: 'ordered', event_timestamp: decorated.ordered_at, notes: 'Biopsy order created' },
      decorated.collected_at ? { id: `${decorated.id}-collected`, event_type: 'collected', event_timestamp: decorated.collected_at, notes: 'Specimen collected' } : null,
      decorated.sent_at ? { id: `${decorated.id}-sent`, event_type: 'sent', event_timestamp: decorated.sent_at, notes: `Sent to ${decorated.path_lab}` } : null,
      decorated.resulted_at ? { id: `${decorated.id}-resulted`, event_type: 'resulted', event_timestamp: decorated.resulted_at, notes: 'Pathology result received' } : null,
      decorated.reviewed_at ? { id: `${decorated.id}-reviewed`, event_type: 'reviewed', event_timestamp: decorated.reviewed_at, notes: 'Provider reviewed result' } : null,
    ].filter(Boolean),
    status_history: [
      { old_status: null, new_status: 'ordered', changed_at: decorated.ordered_at, notes: 'Biopsy ordered' },
      decorated.sent_at ? { old_status: 'collected', new_status: 'sent', changed_at: decorated.sent_at, notes: `Sent to ${decorated.path_lab}` } : null,
      decorated.resulted_at ? { old_status: 'sent', new_status: 'resulted', changed_at: decorated.resulted_at, notes: 'Result received' } : null,
      decorated.reviewed_at ? { old_status: 'resulted', new_status: 'reviewed', changed_at: decorated.reviewed_at, notes: 'Result reviewed' } : null,
    ].filter(Boolean),
  };
}

function readDemoAppointmentOverrides(): Record<string, DemoItem> {
  return readStorageJson<Record<string, DemoItem>>(DEMO_APPOINTMENT_OVERRIDES_KEY, {});
}

function writeDemoAppointmentOverrides(overrides: Record<string, DemoItem>) {
  writeStorageJson(DEMO_APPOINTMENT_OVERRIDES_KEY, overrides);
}

function readDemoTimeBlocks(): DemoItem[] {
  return readStorageJson<DemoItem[]>(DEMO_TIME_BLOCKS_KEY, []);
}

function writeDemoTimeBlocks(blocks: DemoItem[]) {
  writeStorageJson(DEMO_TIME_BLOCKS_KEY, blocks);
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function offsetDate(days = 0, hour = 9, minute = 0): Date {
  const date = startOfToday();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIso(date: Date): string {
  return date.toISOString();
}

function getSeedRecallPatients(): DemoItem[] {
  const preferredIds = [
    'demo-patient-1',
    'demo-patient-2',
    'demo-patient-3',
    'demo-patient-4',
    'demo-extra-1',
    'demo-extra-2',
    'demo-extra-3',
    'demo-extra-4',
  ];
  const patients = preferredIds
    .map((id) => getPatientById(id))
    .filter((patient): patient is DemoItem => Boolean(patient));

  if (patients.length >= 12) return patients.slice(0, 12);

  const seen = new Set(patients.map((patient) => String(patient.id)));
  for (const patient of ALL_PATIENTS) {
    if (seen.has(String(patient.id))) continue;
    patients.push(patient);
    seen.add(String(patient.id));
    if (patients.length >= 12) break;
  }
  return patients;
}

function seedDemoRecallCampaigns(): DemoItem[] {
  return [
    {
      id: 'rec-camp-annual',
      tenantId: 'tenant-demo',
      name: 'Annual Skin Check',
      description: 'Routine annual total body skin exam recall outreach.',
      recallType: 'Annual Skin Check',
      intervalMonths: 12,
      isActive: true,
      createdAt: '2026-01-05T09:00:00Z',
      updatedAt: '2026-04-01T09:00:00Z',
    },
    {
      id: 'rec-camp-melanoma',
      tenantId: 'tenant-demo',
      name: 'Melanoma Surveillance',
      description: 'Close interval follow-up for melanoma surveillance and skin cancer monitoring.',
      recallType: 'Melanoma Surveillance',
      intervalMonths: 6,
      isActive: true,
      createdAt: '2026-01-12T10:00:00Z',
      updatedAt: '2026-04-08T11:15:00Z',
    },
    {
      id: 'rec-camp-biologic',
      tenantId: 'tenant-demo',
      name: 'Biologic / Lab Follow-Up',
      description: 'Medication monitoring follow-up for biologics, methotrexate, and chronic therapy.',
      recallType: 'Lab Result Follow-up',
      intervalMonths: 3,
      isActive: true,
      createdAt: '2026-02-01T08:30:00Z',
      updatedAt: '2026-04-11T08:30:00Z',
    },
    {
      id: 'rec-camp-acne',
      tenantId: 'tenant-demo',
      name: 'Isotretinoin Monthly Check-In',
      description: 'Monthly isotretinoin follow-up and lab/pregnancy test tracking.',
      recallType: 'Medication Refill',
      intervalMonths: 1,
      isActive: true,
      createdAt: '2026-02-14T12:00:00Z',
      updatedAt: '2026-04-10T12:00:00Z',
    },
    {
      id: 'rec-camp-procedure',
      tenantId: 'tenant-demo',
      name: 'Post-Procedure Follow-Up',
      description: 'Short interval wound check and cosmetic follow-up visits.',
      recallType: 'Post-Procedure Follow-up',
      intervalMonths: 1,
      isActive: false,
      createdAt: '2026-01-22T14:00:00Z',
      updatedAt: '2026-03-15T14:00:00Z',
    },
  ];
}

function normalizeDemoRecall(recall: DemoItem, campaigns: DemoItem[]): DemoItem {
  const patient = getPatientById(String(recall.patientId || ''));
  const campaign = campaigns.find((candidate) => String(candidate.id) === String(recall.campaignId || ''));
  const contactAttempts = Number(recall.contactAttempts ?? recall.notificationCount ?? 0) || 0;
  return {
    tenantId: 'tenant-demo',
    status: 'pending',
    preferredContactMethod: 'sms',
    createdAt: recall.createdAt || new Date().toISOString(),
    updatedAt: recall.updatedAt || recall.createdAt || new Date().toISOString(),
    ...recall,
    campaignName: recall.campaignName || campaign?.name || 'Manual Recall',
    recallType: recall.recallType || campaign?.recallType || 'Follow-Up Recall',
    firstName: recall.firstName || patient?.firstName || '',
    lastName: recall.lastName || patient?.lastName || '',
    email: recall.email || patient?.email || '',
    phone: recall.phone || patient?.phone || '',
    contactAttempts,
    notificationCount: Number(recall.notificationCount ?? contactAttempts) || 0,
    notifiedOn: recall.notifiedOn || recall.lastReminderSentAt || recall.lastContactDate || undefined,
  };
}

function seedDemoRecalls(campaigns: DemoItem[]): DemoItem[] {
  const seedPatients = getSeedRecallPatients();
  const patient = (index: number) => seedPatients[index] || ALL_PATIENTS[index] || ALL_PATIENTS[0];
  const seeded = [
    {
      id: 'recall-demo-1',
      patientId: patient(0)?.id,
      campaignId: 'rec-camp-biologic',
      dueDate: toDateKey(offsetDate(-5)),
      status: 'pending',
      notes: 'CBC/CMP follow-up and psoriasis treatment monitoring.',
      doctorNotes: 'Call if not scheduled within 1 week.',
      preferredContactMethod: 'sms',
      contactAttempts: 1,
      lastReminderType: 'sms',
      lastReminderSentAt: toIso(offsetDate(-7, 11, 30)),
      lastReminderDeliveryStatus: 'delivered',
      textThreadId: 'thread-recall-1',
      textThreadStatus: 'waiting-patient',
      createdAt: toIso(offsetDate(-25, 9, 0)),
      updatedAt: toIso(offsetDate(-7, 11, 30)),
    },
    {
      id: 'recall-demo-2',
      patientId: patient(1)?.id,
      campaignId: 'rec-camp-annual',
      dueDate: toDateKey(offsetDate(0)),
      status: 'contacted',
      notes: 'Annual TBSE due this week.',
      doctorNotes: 'Offer next available with any medical derm provider.',
      preferredContactMethod: 'phone',
      contactAttempts: 2,
      lastContactDate: toIso(offsetDate(-1, 15, 15)),
      lastReminderType: 'phone',
      lastReminderSentAt: toIso(offsetDate(-1, 15, 15)),
      lastReminderDeliveryStatus: 'delivered',
      createdAt: toIso(offsetDate(-40, 10, 0)),
      updatedAt: toIso(offsetDate(-1, 15, 15)),
    },
    {
      id: 'recall-demo-3',
      patientId: patient(2)?.id,
      campaignId: 'rec-camp-acne',
      dueDate: toDateKey(offsetDate(1)),
      status: 'scheduled',
      notes: 'Monthly isotretinoin follow-up needed.',
      doctorNotes: 'Needs monthly iPledge check-in and refill review.',
      preferredContactMethod: 'portal',
      appointmentId: 'appt-portal-marcus-upcoming',
      contactAttempts: 1,
      lastContactDate: toIso(offsetDate(-1, 9, 45)),
      lastReminderType: 'portal',
      lastReminderSentAt: toIso(offsetDate(-1, 9, 45)),
      lastReminderDeliveryStatus: 'sent',
      createdAt: toIso(offsetDate(-18, 8, 0)),
      updatedAt: toIso(offsetDate(-1, 9, 45)),
    },
    {
      id: 'recall-demo-4',
      patientId: patient(3)?.id,
      campaignId: 'rec-camp-procedure',
      dueDate: toDateKey(offsetDate(2)),
      status: 'pending',
      notes: 'Post-procedure cosmetic follow-up.',
      preferredContactMethod: 'email',
      contactAttempts: 0,
      createdAt: toIso(offsetDate(-8, 13, 0)),
      updatedAt: toIso(offsetDate(-8, 13, 0)),
    },
    {
      id: 'recall-demo-5',
      patientId: patient(4)?.id,
      campaignId: 'rec-camp-melanoma',
      dueDate: toDateKey(offsetDate(-14)),
      status: 'pending',
      notes: '6-month melanoma surveillance exam overdue.',
      doctorNotes: 'Do not dismiss without provider review.',
      preferredContactMethod: 'phone',
      contactAttempts: 3,
      lastContactDate: toIso(offsetDate(-3, 16, 5)),
      lastReminderType: 'phone',
      lastReminderSentAt: toIso(offsetDate(-3, 16, 5)),
      lastReminderDeliveryStatus: 'delivered',
      createdAt: toIso(offsetDate(-50, 8, 30)),
      updatedAt: toIso(offsetDate(-3, 16, 5)),
    },
    {
      id: 'recall-demo-6',
      patientId: patient(5)?.id,
      campaignId: 'rec-camp-annual',
      dueDate: toDateKey(offsetDate(3)),
      status: 'scheduled',
      notes: 'Annual skin exam already booked after outreach.',
      preferredContactMethod: 'sms',
      contactAttempts: 1,
      lastContactDate: toIso(offsetDate(-2, 10, 15)),
      lastReminderType: 'sms',
      lastReminderSentAt: toIso(offsetDate(-2, 10, 15)),
      lastReminderDeliveryStatus: 'delivered',
      createdAt: toIso(offsetDate(-32, 9, 0)),
      updatedAt: toIso(offsetDate(-2, 10, 15)),
    },
    {
      id: 'recall-demo-7',
      patientId: patient(6)?.id,
      campaignId: 'rec-camp-biologic',
      dueDate: toDateKey(offsetDate(-1)),
      status: 'completed',
      notes: 'Lab follow-up completed and chart updated.',
      preferredContactMethod: 'portal',
      contactAttempts: 1,
      lastContactDate: toIso(offsetDate(-4, 11, 0)),
      lastReminderType: 'portal',
      lastReminderSentAt: toIso(offsetDate(-4, 11, 0)),
      lastReminderDeliveryStatus: 'delivered',
      createdAt: toIso(offsetDate(-20, 11, 0)),
      updatedAt: toIso(offsetDate(-1, 17, 0)),
    },
    {
      id: 'recall-demo-8',
      patientId: patient(7)?.id,
      campaignId: 'rec-camp-annual',
      dueDate: toDateKey(offsetDate(-9)),
      status: 'dismissed',
      notes: 'Transferred care; no further outreach needed.',
      preferredContactMethod: 'mail',
      contactAttempts: 1,
      lastContactDate: toIso(offsetDate(-10, 14, 0)),
      lastReminderType: 'mail',
      lastReminderSentAt: toIso(offsetDate(-10, 14, 0)),
      lastReminderDeliveryStatus: 'sent',
      createdAt: toIso(offsetDate(-60, 9, 0)),
      updatedAt: toIso(offsetDate(-9, 8, 0)),
    },
    {
      id: 'recall-demo-9',
      patientId: patient(8)?.id,
      campaignId: 'rec-camp-melanoma',
      dueDate: toDateKey(offsetDate(0)),
      status: 'pending',
      notes: 'Melanoma surveillance due today.',
      preferredContactMethod: 'sms',
      contactAttempts: 1,
      lastReminderType: 'sms',
      lastReminderSentAt: toIso(offsetDate(-2, 12, 0)),
      lastReminderDeliveryStatus: 'delivered',
      createdAt: toIso(offsetDate(-45, 13, 0)),
      updatedAt: toIso(offsetDate(-2, 12, 0)),
    },
    {
      id: 'recall-demo-10',
      patientId: patient(9)?.id,
      campaignId: 'rec-camp-biologic',
      dueDate: toDateKey(offsetDate(5)),
      status: 'contacted',
      notes: 'Biologic refill and lab review due next week.',
      preferredContactMethod: 'email',
      contactAttempts: 1,
      lastContactDate: toIso(offsetDate(-1, 8, 20)),
      lastReminderType: 'email',
      lastReminderSentAt: toIso(offsetDate(-1, 8, 20)),
      lastReminderDeliveryStatus: 'sent',
      createdAt: toIso(offsetDate(-12, 8, 0)),
      updatedAt: toIso(offsetDate(-1, 8, 20)),
    },
  ];
  return seeded
    .filter((recall) => recall.patientId)
    .map((recall) => normalizeDemoRecall(recall, campaigns));
}

function seedDemoRecallHistory(campaigns: DemoItem[], recalls: DemoItem[]): DemoItem[] {
  return recalls
    .filter((recall) => recall.lastReminderType && recall.lastReminderSentAt)
    .map((recall, index) => ({
      id: `recall-history-${index + 1}`,
      tenantId: 'tenant-demo',
      patientId: recall.patientId,
      recallId: recall.id,
      reminderType: recall.lastReminderType,
      sentAt: recall.lastReminderSentAt,
      deliveryStatus: recall.lastReminderDeliveryStatus || 'delivered',
      messageContent:
        recall.lastReminderType === 'sms'
          ? 'Dermatology DEMO Office: You are due for follow-up. Reply to schedule.'
          : recall.lastReminderType === 'phone'
            ? 'Front desk outreach call placed regarding follow-up scheduling.'
            : 'Recall reminder sent from demo workflow.',
      firstName: recall.firstName,
      lastName: recall.lastName,
      campaignName: recall.campaignName || campaigns.find((campaign) => campaign.id === recall.campaignId)?.name || 'Manual Recall',
      sentBy: 'staff-demo',
    }));
}

function readDemoRecallCampaigns(): DemoItem[] {
  return readStorageJson<DemoItem[]>(DEMO_RECALL_CAMPAIGNS_KEY, seedDemoRecallCampaigns());
}

function writeDemoRecallCampaigns(campaigns: DemoItem[]) {
  writeStorageJson(DEMO_RECALL_CAMPAIGNS_KEY, campaigns);
}

function readDemoRecalls(): DemoItem[] {
  const campaigns = readDemoRecallCampaigns();
  return readStorageJson<DemoItem[]>(DEMO_RECALLS_KEY, seedDemoRecalls(campaigns))
    .map((recall) => normalizeDemoRecall(recall, campaigns));
}

function writeDemoRecalls(recalls: DemoItem[]) {
  const campaigns = readDemoRecallCampaigns();
  writeStorageJson(DEMO_RECALLS_KEY, recalls.map((recall) => normalizeDemoRecall(recall, campaigns)));
}

function readDemoRecallHistory(): DemoItem[] {
  const campaigns = readDemoRecallCampaigns();
  const recalls = readDemoRecalls();
  return readStorageJson<DemoItem[]>(DEMO_RECALL_HISTORY_KEY, seedDemoRecallHistory(campaigns, recalls));
}

function writeDemoRecallHistory(history: DemoItem[]) {
  writeStorageJson(DEMO_RECALL_HISTORY_KEY, history);
}

function appendDemoRecallHistory(entry: DemoItem) {
  writeDemoRecallHistory([entry, ...readDemoRecallHistory()]);
}

function createDemoRecallHistoryEntry(recall: DemoItem, overrides: DemoItem = {}): DemoItem {
  return {
    id: `recall-history-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
    tenantId: 'tenant-demo',
    patientId: recall.patientId,
    recallId: recall.id,
    reminderType: 'sms',
    sentAt: new Date().toISOString(),
    deliveryStatus: 'delivered',
    messageContent: 'Recall reminder sent from demo workflow.',
    firstName: recall.firstName,
    lastName: recall.lastName,
    campaignName: recall.campaignName,
    sentBy: 'staff-demo',
    ...overrides,
  };
}

function getSeedBodyMarkers(patientId: string): DemoItem[] {
  switch (patientId) {
    case 'demo-patient-1':
      return [
        {
          id: 'seed-marker-a1',
          patient_id: patientId,
          encounter_id: 'enc-a3',
          marker_type: 'condition',
          body_region: 'left-elbow',
          view_type: 'front',
          x_position: 35,
          y_position: 34,
          description: 'Psoriasis plaque - improving on Methotrexate',
          clinical_notes: 'Residual plaque on left elbow.',
          status: 'active',
          severity: 'moderate',
          created_at: '2026-03-08T10:20:00Z',
        },
        {
          id: 'seed-marker-a2',
          patient_id: patientId,
          encounter_id: 'enc-a3',
          marker_type: 'lesion',
          body_region: 'right-forearm',
          view_type: 'front',
          x_position: 70,
          y_position: 42,
          description: 'Biopsied nevus - benign intradermal nevus',
          clinical_notes: 'Shave biopsy healed without complication.',
          status: 'resolved',
          severity: 'mild',
          created_at: '2026-03-08T10:28:00Z',
        },
      ];
    case 'demo-patient-2':
      return [
        {
          id: 'seed-marker-j1',
          patient_id: patientId,
          encounter_id: 'enc-j2',
          marker_type: 'procedure',
          body_region: 'right-cheek',
          view_type: 'front',
          x_position: 63,
          y_position: 22,
          description: 'Mohs surgery site - right cheek',
          clinical_notes: 'Site healed well after Mohs excision.',
          status: 'healed',
          severity: 'mild',
          created_at: '2026-02-20T09:40:00Z',
        },
      ];
    case 'demo-patient-3':
      return [
        {
          id: 'seed-marker-m1',
          patient_id: patientId,
          encounter_id: 'enc-m2',
          marker_type: 'condition',
          body_region: 'face',
          view_type: 'front',
          x_position: 50,
          y_position: 16,
          description: 'Inflammatory acne with improving papules on cheeks/jawline',
          clinical_notes: 'Virtual acne follow-up target area.',
          status: 'active',
          severity: 'moderate',
          created_at: '2026-03-21T15:10:00Z',
        },
      ];
    case 'demo-patient-4':
      return [
        {
          id: 'seed-marker-s1',
          patient_id: patientId,
          encounter_id: 'enc-s2',
          marker_type: 'cosmetic',
          body_region: 'face',
          view_type: 'front',
          x_position: 51,
          y_position: 18,
          description: 'Melasma and post-inflammatory hyperpigmentation',
          clinical_notes: 'Facial pigment follow-up.',
          status: 'active',
          severity: 'mild',
          created_at: '2026-02-11T11:10:00Z',
        },
      ];
    default:
      return [];
  }
}

function readDemoBodyMarkersStore(): Record<string, DemoItem[]> {
  return readStorageJson<Record<string, DemoItem[]>>(DEMO_BODY_MARKERS_KEY, {});
}

function writeDemoBodyMarkersStore(store: Record<string, DemoItem[]>) {
  writeStorageJson(DEMO_BODY_MARKERS_KEY, store);
}

function readDemoBodyMarkers(patientId: string): DemoItem[] {
  const seeded = getSeedBodyMarkers(patientId);
  const stored = readDemoBodyMarkersStore();
  const overrides = Array.isArray(stored[patientId]) ? stored[patientId] : [];
  const merged = new Map<string, DemoItem>();

  for (const marker of seeded) {
    merged.set(String(marker.id), marker);
  }
  for (const marker of overrides) {
    const markerId = String(marker.id || '');
    if (!markerId) continue;
    if (marker._deleted) {
      merged.delete(markerId);
      continue;
    }
    merged.set(markerId, marker);
  }

  return [...merged.values()];
}

function writePatientBodyMarkerOverrides(patientId: string, markers: DemoItem[]) {
  const store = readDemoBodyMarkersStore();
  store[patientId] = markers;
  writeDemoBodyMarkersStore(store);
}

function findDemoBodyMarker(markerId: string): { patientId: string; marker: DemoItem } | null {
  for (const patient of ALL_PATIENTS) {
    const marker = readDemoBodyMarkers(String(patient.id)).find((candidate) => String(candidate.id) === String(markerId));
    if (marker) {
      return { patientId: String(patient.id), marker };
    }
  }
  return null;
}

function buildDemoPatientSummaries(patientId: string) {
  const portalData = getPortalDataByPatientId(patientId);
  if (portalData?.visitSummaries?.length) {
    return [...portalData.visitSummaries]
      .map((summary: DemoItem) => ({
        id: `ps-${summary.id}`,
        encounterId: summary.encounterId || null,
        ambientNoteId: null,
        visitDate: summary.visitDate,
        providerName: summary.providerName || 'Provider',
        summaryText: [
          summary.chiefComplaint ? `Visit reason: ${summary.chiefComplaint}` : '',
          Array.isArray(summary.diagnoses) && summary.diagnoses.length > 0
            ? `Diagnoses: ${summary.diagnoses.join('; ')}`
            : '',
          summary.followUpInstructions ? `Plan: ${summary.followUpInstructions}` : '',
        ].filter(Boolean).join(' '),
        symptomsDiscussed: summary.chiefComplaint ? [summary.chiefComplaint] : [],
        diagnosisShared: Array.isArray(summary.diagnoses) ? summary.diagnoses[0] || null : null,
        treatmentPlan: summary.followUpInstructions || null,
        nextSteps: summary.followUpInstructions || null,
        followUpDate: summary.followUpDate || null,
        sharedAt: summary.createdAt || null,
        createdAt: summary.createdAt || new Date(`${summary.visitDate}T12:00:00Z`).toISOString(),
        generatedByName: summary.providerName || 'Provider',
      }))
      .sort((left, right) => String(right.visitDate).localeCompare(String(left.visitDate)));
  }

  return ALL_ENCOUNTERS
    .filter((encounter) => encounter.patientId === patientId)
    .map((encounter) => ({
      id: `ps-${encounter.id}`,
      encounterId: encounter.id,
      ambientNoteId: null,
      visitDate: String(encounter.createdAt || encounter.updatedAt || '').split('T')[0],
      providerName: encounter.providerName || 'Provider',
      summaryText: [encounter.chiefComplaint, encounter.assessmentPlan || encounter.plan]
        .filter(Boolean)
        .join(' '),
      symptomsDiscussed: encounter.chiefComplaint ? [encounter.chiefComplaint] : [],
      diagnosisShared: encounter.assessmentPlan?.split('\n')[0] || null,
      treatmentPlan: encounter.assessmentPlan || null,
      nextSteps: encounter.assessmentPlan || null,
      followUpDate: null,
      sharedAt: encounter.updatedAt || encounter.createdAt || null,
      createdAt: encounter.createdAt || encounter.updatedAt || new Date().toISOString(),
      generatedByName: encounter.providerName || 'Provider',
    }))
    .sort((left, right) => String(right.visitDate).localeCompare(String(left.visitDate)))
    .slice(0, 6);
}

function buildDemoAmbientNote(noteId: string) {
  const encounterId = noteId.replace(/^note-/, '');
  const encounter = ALL_ENCOUNTERS.find((item) => item.id === encounterId);
  if (!encounter) return null;

  return {
    id: noteId,
    transcriptId: `transcript-${encounterId}`,
    encounterId,
    patientId: encounter.patientId,
    providerId: encounter.providerId,
    chiefComplaint: encounter.chiefComplaint || '',
    hpi: encounter.hpi || '',
    ros: encounter.ros || '',
    physicalExam: encounter.exam || '',
    assessment: encounter.assessmentPlan || '',
    plan: encounter.assessmentPlan || '',
    suggestedIcd10Codes: [],
    suggestedCptCodes: [],
    mentionedMedications: [],
    mentionedAllergies: [],
    followUpTasks: [],
    overallConfidence: 0.92,
    sectionConfidence: {},
    reviewStatus: 'approved',
    generationStatus: 'completed',
    createdAt: encounter.createdAt || new Date().toISOString(),
    completedAt: encounter.updatedAt || encounter.createdAt || new Date().toISOString(),
    transcriptText: '',
  };
}

function getDemoPriorAuthList() {
  const requiredPattern = /(laser|mohs|surgery|biopsy|excision|graft|procedure|resurfacing|tattoo|hair\s*removal|hydrafacial)/i;

  return getAllAppointments()
    .filter((appointment) => requiredPattern.test(String(appointment.appointmentTypeName || '')))
    .map((appointment, index) => ({
      id: `pa-${appointment.id}`,
      patient_id: appointment.patientId,
      appointment_id: appointment.id,
      status: appointment.status === 'scheduled' ? 'pending' : 'approved',
      auth_number: `AUTH-${1000 + index}`,
      insurance_auth_number: `INS-${2000 + index}`,
      created_at: appointment.createdAt || appointment.scheduledStart,
      updated_at: appointment.createdAt || appointment.scheduledStart,
      procedure_name: appointment.appointmentTypeName,
      provider_name: appointment.providerName,
    }));
}

function getAllAppointments(): DemoItem[] {
  const overrides = readDemoAppointmentOverrides();
  return [...ALL_APPOINTMENTS, ...readBookedAppointments()]
    .map((appointment) => ({
      ...appointment,
      ...(overrides[String(appointment.id)] || {}),
    }))
    .sort((a, b) => {
    const left = new Date(a.scheduledStart || 0).getTime();
    const right = new Date(b.scheduledStart || 0).getTime();
    return left - right;
  });
}

function findAppointmentById(appointmentId: string) {
  return getAllAppointments().find((appointment) => String(appointment.id) === String(appointmentId)) || null;
}

function updateDemoAppointmentRecord(appointmentId: string, patch: DemoItem) {
  const bookedAppointments = readBookedAppointments();
  const bookedIndex = bookedAppointments.findIndex((appointment) => String(appointment.id) === String(appointmentId));
  if (bookedIndex >= 0) {
    const updated = {
      ...bookedAppointments[bookedIndex],
      ...patch,
      id: bookedAppointments[bookedIndex].id,
    };
    const nextBooked = [...bookedAppointments];
    nextBooked[bookedIndex] = updated;
    writeBookedAppointments(nextBooked);
    return updated;
  }

  const seeded = ALL_APPOINTMENTS.find((appointment) => String(appointment.id) === String(appointmentId));
  if (!seeded) return null;

  const overrides = readDemoAppointmentOverrides();
  const updated = {
    ...seeded,
    ...(overrides[String(appointmentId)] || {}),
    ...patch,
    id: seeded.id,
  };
  overrides[String(appointmentId)] = updated;
  writeDemoAppointmentOverrides(overrides);
  return updated;
}

function getDemoCopayAmountForAppointment(appointment: DemoItem): number {
  return 25 + (String(appointment.patientId).length % 5) * 5;
}

function getDemoOutstandingBalanceForAppointment(appointment: DemoItem): number {
  return String(appointment.patientId).startsWith('demo-patient-') ? 0 : ((String(appointment.patientId).length % 4) * 20);
}

function getDemoProviders() {
  const fallback = {
    'demo-provider-1': { fullName: 'Dr. David Skin, MD, FAAD', specialty: 'Dermatology - General' },
    'demo-provider-2': { fullName: 'Riley Johnson, PA-C', specialty: 'Dermatology - General' },
    'demo-provider-3': { fullName: 'Dr. Maria Martinez, MD, FAAD', specialty: 'Dermatology - General & Medical' },
    'demo-provider-4': { fullName: 'Sarah Mitchell, PA-C', specialty: 'Cosmetic Dermatology' },
    'demo-provider-5': { fullName: 'Dr. Phil Jackson - PA', specialty: 'Dermatology' },
  } as Record<string, { fullName: string; specialty: string }>;

  const seen = new Map<string, DemoItem>();
  for (const appointment of getAllAppointments()) {
    if (!appointment.providerId) continue;
    const fallbackProvider = fallback[String(appointment.providerId)] || { fullName: appointment.providerName || 'Provider', specialty: 'Dermatology' };
    if (!seen.has(appointment.providerId)) {
      seen.set(appointment.providerId, {
        id: appointment.providerId,
        tenantId: 'tenant-demo',
        fullName: appointment.providerName || fallbackProvider.fullName,
        name: appointment.providerName || fallbackProvider.fullName,
        specialty: fallbackProvider.specialty,
        createdAt: '2025-01-01T08:00:00Z',
      });
    }
  }
  return [...seen.values()].sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
}

function filterDemoRecalls(
  recalls: DemoItem[],
  filters: { startDate?: string; endDate?: string; campaignId?: string; status?: string },
) {
  return recalls.filter((recall) => {
    const dueDate = String(recall.dueDate || recall.recallDate || '').slice(0, 10);
    if (filters.campaignId && String(recall.campaignId) !== String(filters.campaignId)) return false;
    if (filters.status && String(recall.status) !== String(filters.status)) return false;
    if (filters.startDate && dueDate && dueDate < filters.startDate) return false;
    if (filters.endDate && dueDate && dueDate > filters.endDate) return false;
    return true;
  });
}

function buildDemoRecallStats(filters: { campaignId?: string; startDate?: string; endDate?: string } = {}) {
  const campaigns = readDemoRecallCampaigns();
  const recalls = filterDemoRecalls(readDemoRecalls(), filters);
  const statusCount = (status: string) => recalls.filter((recall) => recall.status === status).length;
  const total = recalls.length;
  const contactedLike = recalls.filter((recall) => ['contacted', 'scheduled', 'completed'].includes(String(recall.status))).length;
  const scheduledLike = recalls.filter((recall) => ['scheduled', 'completed'].includes(String(recall.status))).length;

  return {
    overall: {
      total_pending: statusCount('pending'),
      total_contacted: statusCount('contacted'),
      total_scheduled: statusCount('scheduled'),
      total_completed: statusCount('completed'),
      total_dismissed: statusCount('dismissed'),
      total_recalls: total,
      contactRate: total > 0 ? Number(((contactedLike / total) * 100).toFixed(1)) : 0,
      conversionRate: total > 0 ? Number(((scheduledLike / total) * 100).toFixed(1)) : 0,
    },
    byCampaign: campaigns.map((campaign) => {
      const campaignRecalls = recalls.filter((recall) => String(recall.campaignId) === String(campaign.id));
      return {
        id: campaign.id,
        name: campaign.name,
        recallType: campaign.recallType,
        total_recalls: campaignRecalls.length,
        pending: campaignRecalls.filter((recall) => recall.status === 'pending').length,
        contacted: campaignRecalls.filter((recall) => recall.status === 'contacted').length,
        scheduled: campaignRecalls.filter((recall) => recall.status === 'scheduled').length,
        completed: campaignRecalls.filter((recall) => recall.status === 'completed').length,
      };
    }),
  };
}

function createDemoRecallForCampaign(campaign: DemoItem, patient: DemoItem, index = 0): DemoItem {
  const dueDate = toDateKey(offsetDate(7 + index));
  return normalizeDemoRecall({
    id: `recall-${campaign.id}-${patient.id}`,
    tenantId: 'tenant-demo',
    patientId: patient.id,
    campaignId: campaign.id,
    dueDate,
    recallDate: dueDate,
    status: 'pending',
    notes: `${campaign.name} outreach generated in demo mode.`,
    doctorNotes: `Schedule ${campaign.recallType.toLowerCase()} within the next 2-4 weeks.`,
    preferredContactMethod: 'sms',
    contactAttempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, [campaign]);
}

function generateDemoRecallsForCampaign(campaignId: string, count = 3) {
  const campaigns = readDemoRecallCampaigns();
  const campaign = campaigns.find((candidate) => String(candidate.id) === String(campaignId));
  if (!campaign) {
    return { created: 0, skipped: 0, errors: ['Campaign not found'] };
  }

  const existing = readDemoRecalls();
  const usedPatientIds = new Set(
    existing
      .filter((recall) => String(recall.campaignId) === String(campaignId))
      .map((recall) => String(recall.patientId)),
  );

  const newRecalls: DemoItem[] = [];
  for (const patient of ALL_PATIENTS) {
    if (usedPatientIds.has(String(patient.id))) continue;
    newRecalls.push(createDemoRecallForCampaign(campaign, patient, newRecalls.length));
    if (newRecalls.length >= count) break;
  }

  if (newRecalls.length > 0) {
    writeDemoRecalls([...existing, ...newRecalls]);
  }

  return {
    created: newRecalls.length,
    skipped: Math.max(0, count - newRecalls.length),
    errors: [],
  };
}

function getDemoLocations() {
  const fallbackNames = {
    'loc-1': 'Mountain Pine Dermatology - Main Office',
    'loc-2': 'Mountain Pine Dermatology - East Office',
    'loc-3': 'Mountain Pine Dermatology - South Campus',
    'loc-virtual': 'Mountain Pine Dermatology - Virtual Care',
  } as Record<string, string>;

  const seen = new Map<string, DemoItem>();
  for (const appointment of getAllAppointments()) {
    if (!appointment.locationId) continue;
    if (!seen.has(appointment.locationId)) {
      const name = appointment.locationName || fallbackNames[String(appointment.locationId)] || 'Dermatology Clinic';
      seen.set(appointment.locationId, {
        id: appointment.locationId,
        tenantId: 'tenant-demo',
        name,
        address: name.includes('East')
          ? '456 Aurora Ave, Aurora, CO 80010'
          : name.includes('South')
            ? '789 Littleton Blvd, Littleton, CO 80123'
            : name.includes('Virtual')
              ? 'Virtual visit link delivered through patient portal'
            : '123 Skin St, Denver, CO 80202',
        phone: '(303) 555-0100',
        isActive: true,
        downtimeSettings: {
          enabled: true,
          packetTime: '12:00',
          deviceProfile: 'auto',
          includeDob: true,
          includePhone: true,
          includeInsurance: true,
        },
        createdAt: '2025-01-01T08:00:00Z',
      });
    }
  }
  return [...seen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function getDemoAppointmentTypes() {
  const durations = new Map<string, number>();
  const names = new Map<string, string>();
  for (const appointment of getAllAppointments()) {
    if (!appointment.appointmentTypeId) continue;
    const start = new Date(appointment.scheduledStart || '').getTime();
    const end = new Date(appointment.scheduledEnd || '').getTime();
    const durationMinutes = Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round((end - start) / 60000)
      : 30;
    durations.set(appointment.appointmentTypeId, durationMinutes);
    names.set(appointment.appointmentTypeId, appointment.appointmentTypeName || 'Appointment');
  }

  return [...names.entries()]
    .map(([id, name]) => ({
      id,
      tenantId: 'tenant-demo',
      name,
      durationMinutes: durations.get(id) || 30,
      color: '#3b82f6',
      category: /telehealth|virtual|video/i.test(name)
        ? 'telehealth'
        : /cosmetic/i.test(name)
          ? 'cosmetic'
          : /procedure|biopsy|mohs/i.test(name)
            ? 'procedure'
            : 'follow-up',
      description: name,
      isActive: true,
      createdAt: '2025-01-01T08:00:00Z',
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function getDemoAvailability() {
  const hoursByProvider = {
    'demo-provider-1': { startTime: '08:00', endTime: '17:00' },
    'demo-provider-2': { startTime: '08:00', endTime: '17:00' },
    'demo-provider-3': { startTime: '08:00', endTime: '16:00' },
    'demo-provider-4': { startTime: '09:00', endTime: '17:00' },
    'demo-provider-5': { startTime: '08:00', endTime: '17:00' },
  } as Record<string, { startTime: string; endTime: string }>;

  return getDemoProviders().flatMap((provider) =>
    [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      id: `avail-${provider.id}-${dayOfWeek}`,
      tenantId: 'tenant-demo',
      providerId: provider.id,
      dayOfWeek,
      startTime: hoursByProvider[provider.id]?.startTime || '08:00',
      endTime: hoursByProvider[provider.id]?.endTime || '17:00',
      createdAt: '2025-01-01T08:00:00Z',
    })),
  );
}

function getAppointmentsForPatient(patientId: string): DemoItem[] {
  return getAllAppointments().filter((appointment) => appointment.patientId === patientId);
}

function isTelehealthAppointment(appointment: DemoItem) {
  return /telehealth|virtual|video/i.test(
    `${appointment?.appointmentTypeName || ''} ${appointment?.locationName || ''}`,
  );
}

function extractNumericId(value: unknown, fallback: number) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : fallback;
}

function buildBaseTelehealthSessions(): DemoItem[] {
  return getAllAppointments()
    .filter(isTelehealthAppointment)
    .map((appointment, index) => {
      const patient = getPatientById(String(appointment.patientId || ''));
      const patientName = String(
        appointment.patientName
        || [patient?.firstName, patient?.lastName].filter(Boolean).join(' ')
        || 'Patient',
      );
      const [patientFirstName = 'Patient', ...patientLastNameParts] = patientName.split(' ');
      const patientLastName = patientLastNameParts.join(' ') || 'Demo';
      const providerId = extractNumericId(appointment.providerId, index + 1);
      const patientId = extractNumericId(appointment.patientId, index + 1);
      const scheduledStartMs = new Date(String(appointment.scheduledStart || '')).getTime();
      const isToday = !Number.isNaN(scheduledStartMs)
        && new Date(scheduledStartMs).toDateString() === new Date().toDateString();
      const seededStatus = isToday && String(appointment.status || 'scheduled') === 'scheduled'
        ? 'waiting'
        : String(appointment.status || 'scheduled');
      const createdAt = String(appointment.createdAt || appointment.scheduledStart || new Date().toISOString());

      return {
        id: 7000 + index,
        tenant_id: 'tenant-demo',
        appointment_id: 9000 + index,
        patient_id: patientId,
        provider_id: providerId,
        session_token: `demo-session-token-${appointment.id}`,
        room_name: `demo-room-${appointment.id}`,
        status: seededStatus,
        recording_consent: true,
        recording_consent_timestamp: createdAt,
        patient_state: 'CO',
        provider_licensed_states: ['CO', 'UT', 'AZ'],
        state_licensing_verified: true,
        virtual_background_enabled: true,
        beauty_filter_enabled: false,
        screen_sharing_enabled: true,
        connection_quality: 'excellent',
        reconnection_count: 0,
        reason: appointment.appointmentTypeName || appointment.chiefComplaint || 'Telehealth follow-up',
        assigned_to: providerId,
        created_at: createdAt,
        updated_at: createdAt,
        patient_first_name: patient?.firstName || patientFirstName,
        patient_last_name: patient?.lastName || patientLastName,
        provider_name: appointment.providerName || 'Provider',
        assigned_to_name: appointment.providerName || 'Provider',
        physician_name: appointment.providerName || 'Provider',
        scheduled_start: appointment.scheduledStart,
        scheduled_end: appointment.scheduledEnd,
        source_appointment_id: appointment.id,
        source_provider_id: appointment.providerId,
        source_patient_id: appointment.patientId,
      };
    })
    .sort((a, b) => new Date(a.scheduled_start || a.created_at).getTime() - new Date(b.scheduled_start || b.created_at).getTime());
}

function readDemoTelehealthSessions(): DemoItem[] {
  const base = buildBaseTelehealthSessions();
  const stored = readStorageJson<DemoItem[]>(DEMO_TELEHEALTH_SESSIONS_KEY, []);
  const merged = new Map<string, DemoItem>();

  for (const session of base) {
    merged.set(String(session.id), session);
  }
  for (const session of stored) {
    merged.set(String(session.id), session);
  }

  return [...merged.values()].sort(
    (a, b) => new Date(a.scheduled_start || a.created_at || 0).getTime() - new Date(b.scheduled_start || b.created_at || 0).getTime(),
  );
}

function writeDemoTelehealthSessions(sessions: DemoItem[]) {
  writeStorageJson(DEMO_TELEHEALTH_SESSIONS_KEY, sessions);
}

function getDemoTelehealthSession(sessionId: string | number) {
  return readDemoTelehealthSessions().find((session) => String(session.id) === String(sessionId)) || null;
}

function updateDemoTelehealthSession(sessionId: string | number, patch: DemoItem) {
  const sessions = readDemoTelehealthSessions();
  const next = sessions.map((session) =>
    String(session.id) === String(sessionId)
      ? { ...session, ...patch, updated_at: new Date().toISOString() }
      : session,
  );
  writeDemoTelehealthSessions(next);
  return next.find((session) => String(session.id) === String(sessionId)) || null;
}

function filterDemoTelehealthSessions(params: URLSearchParams) {
  let sessions = [...readDemoTelehealthSessions()];
  const status = params.get('status');
  const providerId = params.get('providerId') || params.get('physicianId');
  const patientId = params.get('patientId');
  const assignedTo = params.get('assignedTo');
  const reason = params.get('reason');
  const patientSearch = params.get('patientSearch');
  const startDate = params.get('startDate');
  const endDate = params.get('endDate');
  const myUnreadOnly = params.get('myUnreadOnly');

  if (status) sessions = sessions.filter((session) => String(session.status) === status);
  if (providerId) {
    sessions = sessions.filter((session) =>
      String(session.provider_id) === String(providerId) || String(session.source_provider_id) === String(providerId),
    );
  }
  if (patientId) {
    sessions = sessions.filter((session) =>
      String(session.patient_id) === String(patientId) || String(session.source_patient_id) === String(patientId),
    );
  }
  if (assignedTo) sessions = sessions.filter((session) => String(session.assigned_to) === String(assignedTo));
  if (reason) sessions = sessions.filter((session) => String(session.reason || '').toLowerCase().includes(reason.toLowerCase()));
  if (patientSearch) {
    const needle = patientSearch.toLowerCase();
    sessions = sessions.filter((session) =>
      `${session.patient_first_name || ''} ${session.patient_last_name || ''}`.toLowerCase().includes(needle),
    );
  }
  if (startDate) sessions = sessions.filter((session) => String(session.scheduled_start || session.created_at || '') >= startDate);
  if (endDate) sessions = sessions.filter((session) => String(session.scheduled_start || session.created_at || '') <= `${endDate}T23:59:59`);
  if (myUnreadOnly === 'true') sessions = sessions.filter((session) => Number(session.unread_messages || 0) > 0);

  return sessions;
}

function getTelehealthSessionAnchor(session: DemoItem) {
  const value = session.scheduled_start || session.started_at || session.created_at;
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isSameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function getDemoTelehealthStats(params: URLSearchParams) {
  const sessions = filterDemoTelehealthSessions(params);
  const waitingRoom = getDemoWaitingRoom();
  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const nextWeek = new Date(startOfToday);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const completedDurations = sessions
    .filter((session) => session.status === 'completed' && Number(session.duration_minutes) > 0)
    .map((session) => Number(session.duration_minutes));

  return {
    todayVisits: sessions.filter((session) => {
      const anchor = getTelehealthSessionAnchor(session);
      return anchor && isSameLocalDay(anchor, today) && !['cancelled', 'error', 'no_show'].includes(String(session.status));
    }).length,
    waitingNow: waitingRoom.filter((entry) => entry.status === 'waiting').length,
    liveNow: sessions.filter((session) => session.status === 'in_progress').length,
    upcomingWeek: sessions.filter((session) => {
      const anchor = getTelehealthSessionAnchor(session);
      return anchor
        && anchor >= startOfToday
        && anchor < nextWeek
        && !['completed', 'cancelled', 'error', 'no_show'].includes(String(session.status));
    }).length,
    completedToday: sessions.filter((session) => {
      const anchor = getTelehealthSessionAnchor(session);
      return anchor && session.status === 'completed' && isSameLocalDay(anchor, today);
    }).length,
    cancelledThisWeek: sessions.filter((session) => {
      const anchor = getTelehealthSessionAnchor(session);
      return anchor
        && anchor >= startOfToday
        && anchor < nextWeek
        && ['cancelled', 'error', 'no_show'].includes(String(session.status));
    }).length,
    averageCompletedDurationMinutes: completedDurations.length > 0
      ? Math.round(completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length)
      : 0,
    uniquePatientsInRange: new Set(sessions.map((session) => String(session.patient_id || ''))).size,
    providersWithTelehealth: new Set(sessions.map((session) => String(session.provider_id || ''))).size,
  };
}

function getDemoWaitingRoom() {
  return readDemoTelehealthSessions()
    .filter((session) => ['waiting', 'called'].includes(String(session.status)))
    .map((session, index) => ({
      id: 8000 + index,
      tenant_id: 'tenant-demo',
      session_id: session.id,
      patient_id: session.patient_id,
      joined_at: session.updated_at || session.created_at,
      queue_position: index + 1,
      estimated_wait_minutes: 5 + index * 3,
      camera_working: true,
      microphone_working: true,
      speaker_working: true,
      bandwidth_adequate: true,
      browser_compatible: true,
      equipment_check_completed: true,
      chat_messages: [],
      front_desk_notified: true,
      status: session.status === 'called' ? 'called' : 'waiting',
      called_at: session.status === 'called' ? session.updated_at : undefined,
      created_at: session.created_at,
      updated_at: session.updated_at,
    }));
}

function readDemoTelehealthNotesStore() {
  return readStorageJson<Record<string, DemoItem>>(DEMO_TELEHEALTH_NOTES_KEY, {});
}

function writeDemoTelehealthNotesStore(store: Record<string, DemoItem>) {
  writeStorageJson(DEMO_TELEHEALTH_NOTES_KEY, store);
}

function getDemoTelehealthNotes(sessionId: string | number) {
  const key = String(sessionId);
  const store = readDemoTelehealthNotesStore();
  if (store[key]) return store[key];

  const session = getDemoTelehealthSession(sessionId);
  return {
    id: 9000 + extractNumericId(sessionId, 1),
    tenant_id: 'tenant-demo',
    session_id: Number(sessionId),
    chief_complaint: session?.reason || '',
    hpi: '',
    examination_findings: '',
    assessment: '',
    plan: '',
    photos_captured: [],
    annotations: [],
    suggested_cpt_codes: [],
    suggested_icd10_codes: [],
    complexity_level: '',
    finalized: false,
    created_at: session?.created_at || new Date().toISOString(),
    updated_at: session?.updated_at || new Date().toISOString(),
  };
}

function saveDemoTelehealthNotes(sessionId: string | number, payload: DemoItem, finalized = false) {
  const key = String(sessionId);
  const store = readDemoTelehealthNotesStore();
  const current = getDemoTelehealthNotes(sessionId);
  const next = {
    ...current,
    ...payload,
    finalized: finalized || Boolean(current.finalized),
    updated_at: new Date().toISOString(),
  };
  store[key] = next;
  writeDemoTelehealthNotesStore(store);
  return next;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA).getTime() < new Date(endB).getTime()
    && new Date(endA).getTime() > new Date(startB).getTime();
}

function getProviderSlots(dateString: string, providerId: string, appointmentTypeId: string) {
  const appointmentType = DEMO_SCHEDULING_APPOINTMENT_TYPES.find((type) => type.id === appointmentTypeId);
  const durationMinutes = appointmentType?.durationMinutes || 30;
  const slotStarts = ['09:00', '09:30', '10:30', '11:00', '13:00', '14:00', '15:00', '15:30'];
  const providerAppointments = getAllAppointments().filter((appointment) => {
    if (appointment.providerId !== providerId) return false;
    if (appointment.status === 'cancelled') return false;
    return String(appointment.scheduledStart || '').startsWith(dateString);
  });

  return slotStarts.map((time) => {
    const startTime = new Date(`${dateString}T${time}:00Z`);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    const startIso = startTime.toISOString();
    const endIso = endTime.toISOString();
    const conflict = providerAppointments.some((appointment) =>
      overlaps(startIso, endIso, appointment.scheduledStart, appointment.scheduledEnd),
    );

    return {
      startTime: startIso,
      endTime: endIso,
      isAvailable: !conflict,
      providerId,
      providerName: DEMO_SCHEDULING_PROVIDERS.find((provider) => provider.id === providerId)?.fullName,
    };
  });
}

function getAvailableDates(providerId: string, appointmentTypeId: string) {
  const dates: string[] = [];
  const now = new Date();
  for (let offset = 1; offset <= 35 && dates.length < 14; offset += 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    const dateString = date.toISOString().split('T')[0];
    const hasAvailability = getProviderSlots(dateString, providerId, appointmentTypeId)
      .some((slot) => slot.isAvailable);
    if (hasAvailability) dates.push(dateString);
  }
  return dates;
}

function buildPatientDetail(patient: DemoItem) {
  const allergies = Array.isArray(patient.allergies)
    ? patient.allergies
    : String(patient.allergies || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  const medications = Array.isArray(patient.medications)
    ? patient.medications
    : String(patient.medications || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  const detail = {
    ...patient,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dob: patient.dateOfBirth || patient.dob,
    allergiesList: allergies.map((allergen: string, index: number) => ({
      id: `${patient.id}-allergy-${index + 1}`,
      allergen,
    })),
    medicationsList: medications.map((medication: string, index: number) => ({
      id: `${patient.id}-med-${index + 1}`,
      medication,
    })),
  };

  return { ...detail, patient: detail };
}

function buildBalanceResponse(patientId: string) {
  const portalData = getPortalDataByPatientId(patientId);
  const currentBalance = Number(portalData?.billing?.balance?.currentBalance || 0);
  return {
    summary: {
      totalChargesCents: Math.round(Number(portalData?.billing?.balance?.totalCharges || 0) * 100),
      totalPaymentsCents: Math.round(Number(portalData?.billing?.balance?.totalPayments || 0) * 100),
      outstandingBalanceCents: Math.round(currentBalance * 100),
      overdueBalanceCents: Math.round(currentBalance * 100),
      invoiceCount: currentBalance > 0 ? 1 : 0,
    },
    invoices: portalData?.billing?.statements || [],
  };
}

function filterPatients(params: URLSearchParams) {
  const search = (params.get('search') || '').trim().toLowerCase();
  const allPatients = getAllPatients();
  const limit = Math.max(1, Number(params.get('limit') || allPatients.length) || allPatients.length);
  const page = Math.max(1, Number(params.get('page') || 1) || 1);

  let filtered = [...allPatients];
  if (search) {
    const digits = search.replace(/\D/g, '');
    filtered = filtered.filter((patient) => {
      const fullName = `${patient.firstName || ''} ${patient.lastName || ''}`.toLowerCase();
      const email = String(patient.email || '').toLowerCase();
      const mrn = String(patient.mrn || '').toLowerCase();
      const phone = String(patient.phone || '').replace(/\D/g, '');
      return fullName.includes(search)
        || email.includes(search)
        || mrn.includes(search)
        || (digits.length > 0 && phone.includes(digits));
    });
  }

  filtered.sort((left, right) => {
    const byLast = String(left.lastName || '').localeCompare(String(right.lastName || ''));
    if (byLast !== 0) return byLast;
    return String(left.firstName || '').localeCompare(String(right.firstName || ''));
  });

  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + limit);

  return {
    patients: paged,
    total: filtered.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
  };
}

function filterAppointments(items: DemoItem[], params: URLSearchParams) {
  let filtered = [...items];
  const patientId = params.get('patientId');
  const providerId = params.get('providerId');
  const date = params.get('date');
  const startDate = params.get('startDate');
  const endDate = params.get('endDate');

  if (patientId) filtered = filtered.filter((item) => item.patientId === patientId);
  if (providerId) filtered = filtered.filter((item) => item.providerId === providerId);
  if (date) filtered = filtered.filter((item) => String(item.scheduledStart || '').startsWith(date));
  if (startDate) filtered = filtered.filter((item) => String(item.scheduledStart || '') >= startDate);
  if (endDate) filtered = filtered.filter((item) => String(item.scheduledStart || '') <= `${endDate}T23:59:59`);

  return filtered;
}

function getDemoAppointmentDate(appointment: DemoItem): string {
  return String(appointment.scheduledStart || appointment.scheduled_start || appointment.date || '').slice(0, 10);
}

function getDemoAppointmentStatusBreakdown(appointments: DemoItem[]) {
  const counts = new Map<string, number>();
  for (const appointment of appointments) {
    const status = String(appointment.status || 'scheduled');
    counts.set(status, (counts.get(status) || 0) + 1);
  }

  const total = appointments.length;
  if (!counts.has('no_show') && total > 0) counts.set('no_show', Math.max(1, Math.round(total * 0.06)));
  if (!counts.has('cancelled') && total > 0) counts.set('cancelled', Math.max(1, Math.round(total * 0.05)));

  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

function getDemoAnalyticsResponse(path: string, params: URLSearchParams): DemoItem {
  const appointments = filterAppointments(ALL_APPOINTMENTS, params);
  const statusBreakdown = getDemoAppointmentStatusBreakdown(appointments);
  const completedCount = statusBreakdown
    .filter((row) => row.status === 'completed')
    .reduce((sum, row) => sum + row.count, 0);
  const noShowCount = statusBreakdown
    .filter((row) => row.status === 'no_show')
    .reduce((sum, row) => sum + row.count, 0);
  const cancelledCount = statusBreakdown
    .filter((row) => row.status === 'cancelled')
    .reduce((sum, row) => sum + row.count, 0);
  const totalAppointments = statusBreakdown.reduce((sum, row) => sum + row.count, 0);
  const dashboard = getDemoFinancialDashboard(params.get('endDate') || undefined);
  const monthlySnapshot = dashboard.snapshots.monthly;
  const currentRevenue = monthlySnapshot.totalRevenueCents;
  const newPatients = ALL_PATIENTS.filter((patient) => {
    const createdAt = String(patient.createdAt || '').slice(0, 10);
    const startDate = params.get('startDate');
    const endDate = params.get('endDate');
    return (!startDate || createdAt >= startDate) && (!endDate || createdAt <= endDate);
  }).length || Math.max(1, Math.round(ALL_PATIENTS.length * 0.08));

  if (path === '/api/analytics/dashboard') {
    const today = new Date().toISOString().slice(0, 10);
    return {
      totalPatients: ALL_PATIENTS.length,
      todayAppointments: ALL_APPOINTMENTS.filter((appointment) => getDemoAppointmentDate(appointment) === today).length,
      monthRevenue: currentRevenue,
      activeEncounters: ALL_ENCOUNTERS.filter((encounter) => String(encounter.status || '') === 'draft').length,
    };
  }

  if (path === '/api/analytics/appointments/trend') {
    const grouped = new Map<string, number>();
    for (const appointment of appointments) {
      const date = getDemoAppointmentDate(appointment);
      if (!date) continue;
      grouped.set(date, (grouped.get(date) || 0) + 1);
    }
    return {
      data: [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, count]) => ({ date, count })),
    };
  }

  if (path === '/api/analytics/revenue/trend') {
    const trend = getDemoCollectionsTrend(params.get('startDate'), params.get('endDate'), 'week');
    return {
      data: (trend.data || []).map((row: DemoItem) => ({
        date: row.bucketStartDate,
        revenue: row.revenueEarnedCents,
      })),
    };
  }

  if (path === '/api/analytics/top-diagnoses') {
    return {
      data: [
        { name: 'Psoriasis vulgaris', count: 24 },
        { name: 'Atopic dermatitis', count: 19 },
        { name: 'Acne vulgaris', count: 18 },
        { name: 'Actinic keratosis', count: 15 },
        { name: 'Basal cell carcinoma', count: 8 },
      ],
    };
  }

  if (path === '/api/analytics/top-procedures') {
    return {
      data: [
        { name: 'Established patient visit', count: 42 },
        { name: 'Shave biopsy', count: 16 },
        { name: 'Cryotherapy', count: 15 },
        { name: 'Patch testing', count: 8 },
        { name: 'Excision malignant lesion', count: 6 },
      ],
    };
  }

  if (path === '/api/analytics/provider-productivity') {
    const providers = getDemoProviders();
    return {
      data: providers.slice(0, 4).map((provider, index) => {
        const providerAppointments = appointments.filter((appointment) => appointment.providerId === provider.id);
        const appointmentCount = providerAppointments.length || Math.max(3, Math.round(appointments.length / Math.max(1, providers.length)));
        return {
          id: provider.id,
          provider_name: provider.fullName || provider.name,
          patients_seen: Math.max(1, appointmentCount - 1),
          appointments: appointmentCount,
          revenue_cents: Math.round(currentRevenue * ([0.34, 0.25, 0.22, 0.19][index] || 0.15)),
        };
      }),
    };
  }

  if (path === '/api/analytics/patient-demographics') {
    const ageGroups = new Map<string, number>();
    const gender = new Map<string, number>();
    for (const patient of ALL_PATIENTS) {
      const dobYear = Number(String(patient.dateOfBirth || patient.dob || '').slice(0, 4));
      const age = Number.isFinite(dobYear) && dobYear > 1900 ? new Date().getFullYear() - dobYear : 0;
      const ageGroup = age < 18 ? '0-17' : age < 35 ? '18-34' : age < 55 ? '35-54' : age < 75 ? '55-74' : '75+';
      ageGroups.set(ageGroup, (ageGroups.get(ageGroup) || 0) + 1);
      const sex = String(patient.sex || patient.gender || 'Unknown');
      gender.set(sex, (gender.get(sex) || 0) + 1);
    }
    return {
      ageGroups: [...ageGroups.entries()].map(([age_group, count]) => ({ age_group, count })),
      gender: [...gender.entries()].map(([sex, count]) => ({ gender: sex, count })),
    };
  }

  if (path === '/api/analytics/appointment-types') {
    return {
      data: getDemoAppointmentTypes().slice(0, 6).map((type, index) => ({
        type_name: type.name,
        count: Math.max(2, Math.round((appointments.length || 20) / (index + 2))),
      })),
    };
  }

  if (path === '/api/analytics/overview') {
    return {
      newPatients: { current: newPatients, previous: Math.max(0, newPatients - 2), trend: 18.2 },
      appointments: {
        current: totalAppointments,
        previous: Math.max(0, totalAppointments - 5),
        trend: 9.4,
        byStatus: statusBreakdown,
      },
      revenue: { current: currentRevenue, previous: Math.round(currentRevenue * 0.9), trend: 11.1 },
      collectionRate: monthlySnapshot.collectionRate,
    };
  }

  if (path === '/api/analytics/appointments') {
    return {
      byStatus: statusBreakdown,
      byType: getDemoAppointmentTypes().slice(0, 6).map((type, index) => ({
        type_name: type.name,
        count: Math.max(2, Math.round((appointments.length || 20) / (index + 2))),
      })),
      byProvider: getDemoProviders().slice(0, 4).map((provider, index) => ({
        provider_name: provider.fullName || provider.name,
        count: Math.max(3, Math.round((appointments.length || 20) / (index + 2))),
      })),
      avgWaitTimeMinutes: 8.7,
    };
  }

  if (path === '/api/analytics/providers') {
    const providers = getDemoProviders();
    return {
      data: providers.slice(0, 4).map((provider, index) => ({
        id: provider.id,
        provider_name: provider.fullName || provider.name,
        completed_appointments: Math.max(3, Math.round(completedCount / Math.max(1, index + 1))),
        cancelled_appointments: index === 0 ? cancelledCount : Math.max(0, Math.round(cancelledCount / (index + 2))),
        no_shows: index === 0 ? noShowCount : Math.max(0, Math.round(noShowCount / (index + 2))),
        total_encounters: Math.max(3, Math.round(completedCount / Math.max(1, index + 1))),
        unique_patients: Math.max(3, Math.round((appointments.length || 20) / (index + 2))),
        revenue_cents: Math.round(currentRevenue * ([0.34, 0.25, 0.22, 0.19][index] || 0.15)),
        avg_visit_duration_minutes: [22, 19, 26, 16][index] || 20,
      })),
    };
  }

  if (path === '/api/analytics/dermatology-metrics') {
    return {
      biopsyStats: {
        total: 18,
        byType: { shave: 11, punch: 4, excisional: 2, incisional: 1 },
        resultsBreakdown: [
          { result: 'benign', count: 10 },
          { result: 'dysplastic', count: 4 },
          { result: 'malignant', count: 4 },
        ],
      },
      procedureSplit: {
        cosmetic: { count: 12, revenue: 840000, percentage: 18 },
        medical: { count: 42, revenue: 1940000, percentage: 63 },
        surgical: { count: 13, revenue: 940000, percentage: 19 },
      },
      topConditions: [
        { icdCode: 'L40.0', conditionName: 'Psoriasis vulgaris', treatmentCount: 24, uniquePatients: 18 },
        { icdCode: 'L20.9', conditionName: 'Atopic dermatitis', treatmentCount: 19, uniquePatients: 15 },
        { icdCode: 'L70.0', conditionName: 'Acne vulgaris', treatmentCount: 18, uniquePatients: 14 },
      ],
      lesionTracking: {
        totalTracked: 34,
        byStatus: { new: 8, monitoring: 15, resolved: 7, biopsied: 4 },
        byRiskLevel: { high: 6, medium: 14, low: 14 },
        patientsWithLesions: 22,
      },
    };
  }

  if (path === '/api/analytics/yoy-comparison') {
    const metric = (current: number, lastYear: number) => ({
      current,
      lastYear,
      percentChange: lastYear > 0 ? Number((((current - lastYear) / lastYear) * 100).toFixed(1)) : 0,
      trend: current >= lastYear ? 'up' : 'down',
    });
    return {
      metrics: {
        newPatients: metric(newPatients, Math.max(1, newPatients - 2)),
        totalAppointments: metric(totalAppointments, Math.max(1, totalAppointments - 5)),
        completedAppointments: metric(completedCount, Math.max(1, completedCount - 3)),
        noShows: metric(noShowCount, Math.max(1, noShowCount - 1)),
        revenue: metric(currentRevenue, Math.round(currentRevenue * 0.9)),
        encounters: metric(completedCount, Math.max(1, completedCount - 3)),
        procedures: metric(67, 59),
      },
    };
  }

  if (path === '/api/analytics/no-show-risk') {
    const noShowRate = totalAppointments > 0 ? Number(((noShowCount / totalAppointments) * 100).toFixed(1)) : 0;
    return {
      overallNoShowRate: noShowRate,
      totalAppointments,
      totalNoShows: noShowCount,
      riskFactors: {
        byDayOfWeek: [
          { day: 'Monday', noShowRate: Math.max(noShowRate, 9.5), riskLevel: 'high' },
          { day: 'Friday', noShowRate: Math.max(noShowRate - 1, 7.4), riskLevel: 'medium' },
        ],
        byTimeOfDay: [
          { timeSlot: 'Morning', noShowRate: 5.2, riskLevel: 'low' },
          { timeSlot: 'Late afternoon', noShowRate: 8.8, riskLevel: 'medium' },
        ],
        byAppointmentType: [
          { appointmentType: 'New patient consult', noShowRate: 10.1, riskLevel: 'high' },
          { appointmentType: 'Cosmetic consult', noShowRate: 7.9, riskLevel: 'medium' },
        ],
      },
      recommendations: [
        'Prioritize text confirmation for high-risk appointment types.',
        'Use the waitlist to backfill cancelled slots within 48 hours.',
        'Review fee capture for repeated no-shows and late cancellations.',
      ],
    };
  }

  if (path.startsWith('/api/analytics/no-show-risk/patient/')) {
    return {
      patientId: path.split('/').pop(),
      riskScore: 22,
      riskLevel: 'low',
      history: { totalAppointments: 4, completed: 4, noShows: 0, cancelled: 0, noShowRate: 0 },
      recommendations: ['Standard scheduling practices apply'],
    };
  }

  return {};
}

function handleProviderRoute(
  path: string,
  params: URLSearchParams,
  method: string,
  body: DemoItem | null,
): Response | null {
  const patientMatch = path.match(/^\/api\/patients\/([^/]+)$/);
  const patientAppointmentsMatch = path.match(/^\/api\/patients\/([^/]+)\/appointments$/);
  const patientEncountersMatch = path.match(/^\/api\/patients\/([^/]+)\/encounters$/);
  const patientPrescriptionsMatch = path.match(/^\/api\/patients\/([^/]+)\/prescriptions$/);
  const patientBalanceMatch = path.match(/^\/api\/patients\/([^/]+)\/balance$/);
  const patientClinicalSummaryMatch = path.match(/^\/api\/patients\/([^/]+)\/clinical-summary$/);
  const patientInsuranceMatch = path.match(/^\/api\/patients\/([^/]+)\/insurance$/);
  const patientPriorAuthsMatch = path.match(/^\/api\/patients\/([^/]+)\/prior-auths$/);
  const patientBiopsiesMatch = path.match(/^\/api\/patients\/([^/]+)\/biopsies$/);
  const patientPhotosMatch = path.match(/^\/api\/patients\/([^/]+)\/photos(?:\/.*)?$/);
  const patientBodyMapMatch = path.match(/^\/api\/patients\/([^/]+)\/body-map$/);
  const eligibilityMatch = path.match(/^\/api\/eligibility\/history\/([^/]+)$/);
  const biopsyDetailMatch = path.match(/^\/api\/biopsies\/([^/]+)$/);
  const biopsyReviewMatch = path.match(/^\/api\/biopsies\/([^/]+)\/review$/);
  const biopsyNotifyMatch = path.match(/^\/api\/biopsies\/([^/]+)\/notify-patient$/);
  const biopsyResultMatch = path.match(/^\/api\/biopsies\/([^/]+)\/result$/);
  const biopsyAlertsMatch = path.match(/^\/api\/biopsies\/([^/]+)\/alerts$/);

  if (path === '/api/products/inventory/status' && method.toUpperCase() === 'GET') {
    const products = readDemoStoreProducts().filter((product) => product.isActive !== false);
    const byCategory = new Map<string, { category: string; count: number; value: number }>();
    products.forEach((product) => {
      const current = byCategory.get(String(product.category)) || { category: String(product.category), count: 0, value: 0 };
      current.count += 1;
      current.value += Number(product.inventoryCount || 0) * Number(product.cost || 0);
      byCategory.set(String(product.category), current);
    });
    return mockResponse({
      status: {
        totalProducts: products.length,
        totalValue: products.reduce((sum, product) => sum + Number(product.inventoryCount || 0) * Number(product.cost || 0), 0),
        lowStockCount: products.filter((product) => Number(product.inventoryCount || 0) <= Number(product.reorderPoint || 0) && Number(product.inventoryCount || 0) > 0).length,
        outOfStockCount: products.filter((product) => Number(product.inventoryCount || 0) === 0).length,
        byCategory: Array.from(byCategory.values()),
      },
    });
  }

  if (path === '/api/products/inventory/low-stock' && method.toUpperCase() === 'GET') {
    return mockResponse({
      products: readDemoStoreProducts().filter((product) =>
        product.isActive !== false && Number(product.inventoryCount || 0) <= Number(product.reorderPoint || 0)
      ),
    });
  }

  if (path === '/api/products/sales/report' && method.toUpperCase() === 'GET') {
    const orders = readDemoStoreOrders();
    const topProductMap = new Map<string, DemoItem>();
    orders.forEach((order) => {
      (order.items || []).forEach((item: DemoItem) => {
        const current = topProductMap.get(String(item.productId)) || {
          productId: item.productId,
          productName: item.productName,
          quantitySold: 0,
          revenue: 0,
        };
        current.quantitySold += Number(item.quantity || 0);
        current.revenue += Number(item.lineTotal || 0);
        topProductMap.set(String(item.productId), current);
      });
    });
    return mockResponse({
      report: {
        totalSales: orders.length,
        totalRevenue: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
        totalDiscounts: 0,
        totalTax: orders.reduce((sum, order) => sum + Number(order.tax || 0), 0),
        uniqueCustomers: new Set(orders.map((order) => order.patientId)).size,
        topProducts: Array.from(topProductMap.values()).sort((a, b) => Number(b.quantitySold) - Number(a.quantitySold)),
        salesByCategory: [],
        dailySales: [],
      },
    });
  }

  if (path === '/api/products/sales' && method.toUpperCase() === 'GET') {
    return mockResponse({ orders: readDemoStoreOrders() });
  }

  const storeFulfillmentMatch = path.match(/^\/api\/products\/sales\/([^/]+)\/fulfillment$/);
  if (storeFulfillmentMatch && method.toUpperCase() === 'PUT') {
    const saleId = storeFulfillmentMatch[1];
    const orders = readDemoStoreOrders();
    const updatedOrders = orders.map((order) =>
      String(order.id) === saleId
        ? { ...order, ...body, updatedAt: new Date().toISOString() }
        : order
    );
    writeDemoStoreOrders(updatedOrders);
    const order = updatedOrders.find((item) => String(item.id) === saleId);
    return order ? mockResponse({ order }) : mockResponse({ error: 'Store order not found' }, 404);
  }

  if (path === '/api/products' && method.toUpperCase() === 'GET') {
    let products = readDemoStoreProducts();
    const category = params.get('category');
    const isActive = params.get('isActive');
    const search = params.get('search')?.toLowerCase() || '';
    if (category) products = products.filter((product) => String(product.category) === category);
    if (isActive != null) products = products.filter((product) => String(product.isActive !== false) === isActive);
    if (params.get('lowStockOnly') === 'true') {
      products = products.filter((product) => Number(product.inventoryCount || 0) <= Number(product.reorderPoint || 0));
    }
    if (search) {
      products = products.filter((product) =>
        [product.name, product.sku, product.brand, product.description].filter(Boolean).some((value) => String(value).toLowerCase().includes(search))
      );
    }
    return mockResponse({ products });
  }

  if (path === '/api/products' && method.toUpperCase() === 'POST') {
    const now = new Date().toISOString();
    const product = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `demo-product-${Date.now()}`,
      tenantId: 'tenant-demo',
      sku: String(body?.sku || `SKU-${Date.now()}`),
      name: String(body?.name || 'New Store Product'),
      description: body?.description ? String(body.description) : '',
      category: String(body?.category || 'skincare'),
      brand: body?.brand ? String(body.brand) : '',
      price: Number(body?.price || 0),
      cost: Number(body?.cost || 0),
      inventoryCount: Number(body?.inventoryCount || 0),
      reorderPoint: Number(body?.reorderPoint || 5),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    writeDemoStoreProducts([...readDemoStoreProducts(), product]);
    return mockResponse({ product }, 201);
  }

  const productInventoryMatch = path.match(/^\/api\/products\/([^/]+)\/inventory$/);
  if (productInventoryMatch && method.toUpperCase() === 'PUT') {
    const productId = productInventoryMatch[1];
    let newCount = 0;
    const products = readDemoStoreProducts().map((product) => {
      if (String(product.id) !== productId) return product;
      newCount = Math.max(0, Number(product.inventoryCount || 0) + Number(body?.quantity || 0));
      return { ...product, inventoryCount: newCount, updatedAt: new Date().toISOString() };
    });
    writeDemoStoreProducts(products);
    return mockResponse({ newCount });
  }

  const productMatch = path.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && method.toUpperCase() === 'PUT') {
    const productId = productMatch[1];
    const products = readDemoStoreProducts().map((product) =>
      String(product.id) === productId
        ? { ...product, ...body, updatedAt: new Date().toISOString() }
        : product
    );
    writeDemoStoreProducts(products);
    const product = products.find((item) => String(item.id) === productId);
    return product ? mockResponse({ product }) : mockResponse({ error: 'Product not found' }, 404);
  }

  if (path === '/api/patients' && method.toUpperCase() === 'POST') {
    const now = new Date().toISOString();
    const id = `demo-created-patient-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`;
    const newPatient = {
      id,
      tenantId: 'tenant-demo',
      mrn: `MRN-${String(readDemoCreatedPatients().length + 90001)}`,
      firstName: String(body?.firstName || 'New'),
      lastName: String(body?.lastName || 'Patient'),
      dateOfBirth: body?.dob || body?.dateOfBirth || '',
      dob: body?.dob || body?.dateOfBirth || '',
      sex: body?.sex || '',
      phone: body?.phone || '',
      email: body?.email || '',
      address: body?.address || '',
      city: body?.city || '',
      state: body?.state || '',
      zip: body?.zip || '',
      insurance: body?.insurance || '',
      allergies: body?.allergies || '',
      medications: body?.medications || '',
      accessibilityProfile: body?.accessibilityProfile || {},
      createdAt: now,
      updatedAt: now,
    };
    writeDemoCreatedPatients([newPatient, ...readDemoCreatedPatients()]);
    return mockResponse({ id, patient: newPatient, portalProfileReady: true }, 201);
  }

  if (path === '/api/patients') {
    const result = filterPatients(params);
    return mockResponse({
      data: result.patients,
      patients: result.patients,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1,
      },
    });
  }

  if (path === '/api/providers') {
    return mockResponse({ providers: getDemoProviders() });
  }

  if (path === '/api/locations') {
    return mockResponse({ locations: getDemoLocations() });
  }

  if (path === '/api/appointment-types') {
    return mockResponse({ appointmentTypes: getDemoAppointmentTypes() });
  }

  if (path.startsWith('/api/analytics/')) {
    return mockResponse(getDemoAnalyticsResponse(path, params));
  }

  if (path === '/api/biopsies/command-center' && method.toUpperCase() === 'GET') {
    return mockResponse(buildDemoBiopsyCommandCenter());
  }

  if (path === '/api/biopsies/quality-metrics' && method.toUpperCase() === 'GET') {
    return mockResponse(buildDemoBiopsyMetrics());
  }

  if (path === '/api/biopsies/stats' && method.toUpperCase() === 'GET') {
    const commandCenter = buildDemoBiopsyCommandCenter();
    return mockResponse({
      ordered_count: getDemoBiopsies().filter((biopsy) => biopsy.status === 'ordered').length,
      collected_count: getDemoBiopsies().filter((biopsy) => biopsy.status === 'collected').length,
      sent_count: getDemoBiopsies().filter((biopsy) => biopsy.status === 'sent').length,
      pending_review_count: commandCenter.summary.pending_review,
      overdue_count: commandCenter.summary.overdue_results,
      malignancy_count: getDemoBiopsies().filter((biopsy) => biopsy.malignancy_type).length,
      melanoma_count: getDemoBiopsies().filter((biopsy) => biopsy.malignancy_type === 'melanoma').length,
      needs_patient_notification: commandCenter.summary.needs_patient_notification,
      avg_turnaround_days: commandCenter.summary.avg_turnaround_days,
      total_biopsies_all_time: getDemoBiopsies().length,
      biopsies_last_30_days: getDemoBiopsies().filter((biopsy) => demoDaysSince(biopsy.ordered_at) != null && Number(demoDaysSince(biopsy.ordered_at)) <= 30).length,
    });
  }

  if (path === '/api/biopsies/pending' && method.toUpperCase() === 'GET') {
    return mockResponse({ biopsies: buildDemoBiopsyCommandCenter().queues.pendingReview });
  }

  if (path === '/api/biopsies/overdue' && method.toUpperCase() === 'GET') {
    const overdue = buildDemoBiopsyCommandCenter().queues.pendingResults.filter((biopsy: DemoItem) =>
      (biopsy.safety_flags || []).some((flag: DemoItem) => flag.type === 'result_overdue'),
    );
    return mockResponse({ biopsies: overdue });
  }

  if (path === '/api/labs/pathology/pending' && method.toUpperCase() === 'GET') {
    const pending = buildDemoBiopsyCommandCenter().queues.pendingResults.map((biopsy: DemoItem) => ({
      id: biopsy.id,
      biopsy_id: biopsy.id,
      specimen_id: biopsy.specimen_id,
      patient_id: biopsy.patient_id,
      patient_name: biopsy.patient_name,
      mrn: biopsy.mrn,
      body_location: biopsy.body_location,
      specimen_type: biopsy.specimen_type,
      status: biopsy.safety_flags?.some((flag: DemoItem) => flag.type === 'result_overdue') ? 'overdue' : 'pending',
      ordered_at: biopsy.ordered_at,
      sent_at: biopsy.sent_at,
      days_pending: biopsy.days_since_sent || biopsy.days_since_ordered || 0,
      path_lab: biopsy.path_lab,
      ordering_provider_name: biopsy.ordering_provider_name,
    }));
    return mockResponse({ biopsies: pending });
  }

  if (path === '/api/biopsies/export/log' && method.toUpperCase() === 'GET') {
    const headers = [
      'Specimen ID',
      'Ordered Date',
      'Patient MRN',
      'Patient Name',
      'Location',
      'Specimen Type',
      'Status',
      'Diagnosis',
      'Malignancy',
      'ICD-10',
      'Follow-up',
      'Ordering Provider',
      'Path Lab',
      'Turnaround Days',
      'Patient Notified',
    ];
    const rows = filterDemoBiopsies(params).map((biopsy) => ([
      biopsy.specimen_id,
      biopsy.ordered_at,
      biopsy.mrn,
      `"${String(biopsy.patient_name || '').replace(/"/g, '""')}"`,
      `"${String(biopsy.body_location || '').replace(/"/g, '""')}"`,
      biopsy.specimen_type,
      biopsy.status,
      `"${String(biopsy.pathology_diagnosis || '').replace(/"/g, '""')}"`,
      biopsy.malignancy_type || '',
      biopsy.diagnosis_code || '',
      biopsy.follow_up_action || '',
      `"${String(biopsy.ordering_provider_name || '').replace(/"/g, '""')}"`,
      `"${String(biopsy.path_lab || '').replace(/"/g, '""')}"`,
      biopsy.turnaround_time_days || '',
      biopsy.patient_notified ? 'Yes' : 'No',
    ].join(',')));
    return new Response([headers.join(','), ...rows].join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'text/csv' },
    });
  }

  if (path === '/api/biopsies' && method.toUpperCase() === 'GET') {
    const allBiopsies = filterDemoBiopsies(params);
    const offset = Number(params.get('offset') || 0);
    const limit = Number(params.get('limit') || allBiopsies.length || 100);
    return mockResponse({
      biopsies: allBiopsies.slice(offset, offset + limit),
      total: allBiopsies.length,
      limit,
      offset,
    });
  }

  if (biopsyAlertsMatch && method.toUpperCase() === 'GET') {
    const biopsy = getDemoBiopsies().find((candidate) => String(candidate.id) === String(biopsyAlertsMatch[1]));
    return biopsy ? mockResponse({ alerts: buildDemoBiopsyDetail(biopsy).alerts }) : mockResponse({ error: 'Biopsy not found' }, 404);
  }

  if (biopsyReviewMatch && method.toUpperCase() === 'POST') {
    const biopsyId = biopsyReviewMatch[1] || '';
    const updated = updateDemoBiopsyRecord(biopsyId, {
      ...(body || {}),
      status: 'reviewed',
      reviewed_at: new Date().toISOString(),
      reviewing_provider_id: 'demo-provider-1',
      reviewing_provider_name: 'Dr. David Skin, MD, FAAD',
    });
    return updated ? mockResponse(updated) : mockResponse({ error: 'Biopsy not found or not in resulted status' }, 404);
  }

  if (biopsyNotifyMatch && method.toUpperCase() === 'POST') {
    const biopsyId = biopsyNotifyMatch[1] || '';
    const updated = updateDemoBiopsyRecord(biopsyId, {
      patient_notified: true,
      patient_notified_at: new Date().toISOString(),
      patient_notified_method: body?.method || 'portal',
      patient_notification_notes: body?.notes || null,
    });
    return updated ? mockResponse(updated) : mockResponse({ error: 'Biopsy not found' }, 404);
  }

  if (biopsyResultMatch && method.toUpperCase() === 'POST') {
    const biopsyId = biopsyResultMatch[1] || '';
    const now = new Date().toISOString();
    const updated = updateDemoBiopsyRecord(biopsyId, {
      ...(body || {}),
      status: 'resulted',
      resulted_at: now,
    });
    return updated ? mockResponse(updated) : mockResponse({ error: 'Biopsy not found' }, 404);
  }

  if (biopsyDetailMatch && method.toUpperCase() === 'PUT') {
    const biopsyId = biopsyDetailMatch[1] || '';
    const updated = updateDemoBiopsyRecord(biopsyId, body || {});
    return updated ? mockResponse(updated) : mockResponse({ error: 'Biopsy not found' }, 404);
  }

  if (biopsyDetailMatch && method.toUpperCase() === 'GET') {
    const biopsy = getDemoBiopsies().find((candidate) => String(candidate.id) === String(biopsyDetailMatch[1]));
    return biopsy ? mockResponse(buildDemoBiopsyDetail(biopsy)) : mockResponse({ error: 'Biopsy not found' }, 404);
  }

  if (path === '/api/availability') {
    return mockResponse({ availability: getDemoAvailability() });
  }

  if (patientMatch && method.toUpperCase() === 'PUT') {
    const patientId = patientMatch[1] || '';
    const current = getPatientById(patientId);
    if (!current) return mockResponse({ error: 'Patient not found' }, 404);
    const nextPatient = {
      ...current,
      ...(body || {}),
      updatedAt: new Date().toISOString(),
    };
    const createdPatients = readDemoCreatedPatients();
    if (createdPatients.some((candidate) => String(candidate.id) === patientId)) {
      writeDemoCreatedPatients(
        createdPatients.map((candidate) => String(candidate.id) === patientId ? nextPatient : candidate),
      );
    } else {
      const overrides = readDemoPatientOverrides();
      writeDemoPatientOverrides({
        ...overrides,
        [patientId]: {
          ...(overrides[patientId] || {}),
          ...(body || {}),
          updatedAt: nextPatient.updatedAt,
        },
      });
    }
    return mockResponse({ success: true, id: patientId, patient: nextPatient });
  }

  if (patientMatch) {
    const patient = getPatientById(patientMatch[1] || '');
    return patient ? mockResponse(buildPatientDetail(patient)) : mockResponse({ error: 'Patient not found' }, 404);
  }

  if (patientAppointmentsMatch) {
    const patientId = patientAppointmentsMatch[1] || '';
    return mockResponse({ appointments: getAppointmentsForPatient(patientId) });
  }

  if (patientEncountersMatch) {
    const patientId = patientEncountersMatch[1] || '';
    return mockResponse({ encounters: ALL_ENCOUNTERS.filter((encounter) => encounter.patientId === patientId) });
  }

  if (patientPrescriptionsMatch) {
    const patientId = patientPrescriptionsMatch[1] || '';
    const prescriptions = ALL_PRESCRIPTIONS.filter((prescription) => prescription.patientId === patientId);
    return mockResponse({
      prescriptions,
      summary: {
        total: prescriptions.length,
        active: prescriptions.filter((prescription) => prescription.status === 'transmitted').length,
        inactive: prescriptions.filter((prescription) => prescription.status !== 'transmitted').length,
        controlled: 0,
      },
    });
  }

  if (patientBalanceMatch) {
    return mockResponse(buildBalanceResponse(patientBalanceMatch[1] || ''));
  }

  if (patientClinicalSummaryMatch) {
    const patientId = patientClinicalSummaryMatch[1] || '';
    const portalData = getPortalDataByPatientId(patientId);
    const diagnoses = (portalData?.visitSummaries || []).flatMap((summary: DemoItem) =>
      (summary.diagnoses || []).map((description: string, index: number) => ({
        id: `${summary.id}-dx-${index + 1}`,
        encounterId: summary.encounterId,
        description,
        icd10Code: '',
        encounterDate: summary.visitDate,
        providerName: summary.providerName,
      })),
    );
    const recalls = readDemoRecalls()
      .filter((recall) => String(recall.patientId) === String(patientId))
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    return mockResponse({ diagnoses, recalls });
  }

  if (patientInsuranceMatch) {
    const patient = getPatientById(patientInsuranceMatch[1] || '');
    return mockResponse({ insurance: patient?.insuranceDetails || null });
  }

  if (patientPriorAuthsMatch) return mockResponse({ priorAuths: [] });

  if (patientBiopsiesMatch) {
    const patientId = patientBiopsiesMatch[1] || '';
    return mockResponse({
      biopsies: filterDemoBiopsies(new URLSearchParams({ patient_id: patientId })),
    });
  }

  if (patientPhotosMatch) return mockResponse({ data: [], photos: [] });
  if (patientBodyMapMatch) return mockResponse({ bodyMap: null, lesions: [] });

  if (path === '/api/appointments' && method.toUpperCase() === 'GET') {
    const appointments = filterAppointments(getAllAppointments(), params);
    return mockResponse({ appointments, data: appointments });
  }

  if (path === '/api/appointments' && method.toUpperCase() === 'POST') {
    const provider = getDemoProviders().find((candidate) => String(candidate.id) === String(body?.providerId));
    const location = getDemoLocations().find((candidate) => String(candidate.id) === String(body?.locationId));
    const appointmentType = getDemoAppointmentTypes().find((candidate) => String(candidate.id) === String(body?.appointmentTypeId));
    const patient = getPatientById(String(body?.patientId || ''));
    if (!body?.patientId || !body?.providerId || !body?.appointmentTypeId || !body?.locationId || !body?.scheduledStart || !body?.scheduledEnd) {
      return mockResponse({ error: 'Missing appointment details' }, 400);
    }

    const newAppointment = {
      id: `appt-office-booked-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
      tenantId: 'tenant-demo',
      patientId: String(body.patientId),
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Patient',
      providerId: String(body.providerId),
      providerName: provider?.fullName || provider?.name || 'Provider',
      locationId: String(body.locationId),
      locationName: location?.name || 'Dermatology Clinic',
      appointmentTypeId: String(body.appointmentTypeId),
      appointmentTypeName: appointmentType?.name || 'Appointment',
      scheduledStart: String(body.scheduledStart),
      scheduledEnd: String(body.scheduledEnd),
      status: 'scheduled',
      chiefComplaint: body?.notes ? String(body.notes) : 'Office scheduled visit',
      createdAt: new Date().toISOString(),
    };
    writeBookedAppointments([...readBookedAppointments(), newAppointment]);
    return mockResponse(newAppointment, 201);
  }

  if (path.startsWith('/api/appointments/') && path.endsWith('/status') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const appointmentId = segments[segments.length - 2] || '';
    const appointment = findAppointmentById(appointmentId);
    if (!appointment) return mockResponse({ error: 'Appointment not found' }, 404);

    const nextStatus = String(body?.status || '');
    const updated = updateDemoAppointmentRecord(appointmentId, {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
      statusReason: body?.reason ? String(body.reason) : undefined,
    });
    if (!updated) return mockResponse({ error: 'Appointment not found' }, 404);

    return mockResponse({
      success: true,
      appointment: updated,
      noShowFeeBillId: nextStatus === 'no_show' ? `bill-noshow-${appointmentId}` : undefined,
    });
  }

  if (path.startsWith('/api/appointments/') && path.endsWith('/reschedule') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const appointmentId = segments[segments.length - 2] || '';
    const appointment = findAppointmentById(appointmentId);
    if (!appointment) return mockResponse({ error: 'Appointment not found' }, 404);

    const nextProviderId = body?.providerId ? String(body.providerId) : String(appointment.providerId);
    const provider = getDemoProviders().find((candidate) => String(candidate.id) === nextProviderId);
    const updated = updateDemoAppointmentRecord(appointmentId, {
      scheduledStart: String(body?.scheduledStart || appointment.scheduledStart),
      scheduledEnd: String(body?.scheduledEnd || appointment.scheduledEnd),
      providerId: nextProviderId,
      providerName: provider?.fullName || provider?.name || appointment.providerName,
      updatedAt: new Date().toISOString(),
    });
    return mockResponse({ success: true, appointment: updated });
  }

  if (path === '/api/front-desk/today') {
    const today = new Date();
    const dateKey = today.toISOString().split('T')[0];
    const frontDeskParams = new URLSearchParams({ date: dateKey });
    const providerId = params.get('providerId');
    const status = params.get('status');
    if (providerId) frontDeskParams.set('providerId', providerId);
    const appointments = filterAppointments(getAllAppointments(), frontDeskParams)
      .filter((appointment) => appointment.status !== 'cancelled')
      .filter((appointment) => !status || String(appointment.status) === status)
      .map((appointment) => ({
        ...appointment,
        accessibilityProfile: getPatientById(String(appointment.patientId || ''))?.accessibilityProfile || {},
        copayAmount: getDemoCopayAmountForAppointment(appointment),
        outstandingBalance: getDemoOutstandingBalanceForAppointment(appointment),
      }));
    return mockResponse({ appointments });
  }

  if (path.startsWith('/api/front-desk/check-in/') && method.toUpperCase() === 'POST') {
    const appointmentId = path.split('/').pop() || '';
    const appointment = findAppointmentById(appointmentId);
    if (!appointment) return mockResponse({ error: 'Appointment not found' }, 404);

    const updated = updateDemoAppointmentRecord(appointmentId, {
      status: 'checked_in',
      checkedInAt: new Date().toISOString(),
      checkInNotes: body?.notes ? String(body.notes) : undefined,
    });
    if (!updated) return mockResponse({ error: 'Appointment not found' }, 404);

    const baseCopayAmount = getDemoCopayAmountForAppointment(updated);
    const requestedCopayCents = Math.max(0, Number(body?.copayAmountCents || 0));
    const requestedOutstandingCents = Math.max(0, Number(body?.outstandingBalanceAmountCents || 0));
    const totalCollectedAmountCents = requestedCopayCents + requestedOutstandingCents;
    const paymentCollected = totalCollectedAmountCents > 0;
    const deferCopay = Boolean(body?.deferCopay) && !paymentCollected;

    return mockResponse({
      success: true,
      message: 'Patient checked in',
      copayAmount: baseCopayAmount,
      copayAmountCents: Math.round(baseCopayAmount * 100),
      copayDisposition: paymentCollected ? 'collected' : deferCopay ? 'deferred' : 'none',
      copayCollectedAmountCents: requestedCopayCents,
      outstandingBalanceCollectedAmountCents: requestedOutstandingCents,
      totalCollectedAmountCents,
      priorAuthStatus: 'demo',
      eligibilityStatus: 'active',
      eligibilityVerifiedAt: new Date().toISOString(),
      paymentId: paymentCollected ? `demo-payment-${appointmentId}` : undefined,
      paymentReceiptNumber: paymentCollected ? `RCPT-${appointmentId.slice(-6).toUpperCase()}` : undefined,
      paymentConfirmationEmailSent: paymentCollected,
      paymentConfirmationEmailAddress: paymentCollected ? `${String(updated.patientName || '').replace(/\s+/g, '.').toLowerCase()}@demo.mail` : undefined,
    });
  }

  if (path.startsWith('/api/front-desk/status/') && method.toUpperCase() === 'PUT') {
    const appointmentId = path.split('/').pop() || '';
    const status = String(body?.status || '');
    const appointment = findAppointmentById(appointmentId);
    if (!appointment) return mockResponse({ error: 'Appointment not found' }, 404);
    const updated = updateDemoAppointmentRecord(appointmentId, { status });
    return mockResponse({ success: true, appointment: updated });
  }

  if (path.startsWith('/api/front-desk/check-out/') && method.toUpperCase() === 'POST') {
    const appointmentId = path.split('/').pop() || '';
    const appointment = findAppointmentById(appointmentId);
    if (!appointment) return mockResponse({ error: 'Appointment not found' }, 404);
    const updated = updateDemoAppointmentRecord(appointmentId, {
      status: 'completed',
      checkedOutAt: new Date().toISOString(),
    });
    return mockResponse({ success: true, appointment: updated });
  }

  if (path.startsWith('/api/patient-flow/') && path.endsWith('/status') && method.toUpperCase() === 'PUT') {
    const segments = path.split('/');
    const appointmentId = segments[segments.length - 2] || '';
    const nextStatus = String(body?.status || '');
    const appointment = findAppointmentById(appointmentId);
    if (!appointment) return mockResponse({ error: 'Appointment not found' }, 404);
    const allowedStatuses = new Set(['checked_in', 'in_room', 'with_provider', 'checkout', 'completed']);
    const updated = allowedStatuses.has(nextStatus)
      ? updateDemoAppointmentRecord(appointmentId, { status: nextStatus })
      : appointment;
    return mockResponse({ success: true, appointment: updated, status: nextStatus });
  }

  if (path === '/api/encounters') {
    const patientId = params.get('patientId');
    const encounters = patientId
      ? ALL_ENCOUNTERS.filter((encounter) => encounter.patientId === patientId)
      : ALL_ENCOUNTERS;
    return mockResponse({ data: encounters });
  }

  if (path === '/api/vitals') {
    const patientId = params.get('patientId');
    const vitals = patientId
      ? ALL_VITALS.filter((vital) => vital.patientId === patientId)
      : ALL_VITALS;
    return mockResponse({ data: vitals, vitals });
  }

  if (path === '/api/prescriptions') {
    const patientId = params.get('patientId');
    const prescriptions = patientId
      ? ALL_PRESCRIPTIONS.filter((prescription) => prescription.patientId === patientId)
      : ALL_PRESCRIPTIONS;
    return mockResponse({ prescriptions, data: prescriptions });
  }

  if (path === '/api/orders') {
    const patientId = params.get('patientId');
    const orders = patientId
      ? ALL_ORDERS.filter((order) => order.patientId === patientId)
      : ALL_ORDERS;
    return mockResponse({ data: orders });
  }

  if (path === '/api/documents') {
    const patientId = params.get('patientId');
    const documents = patientId
      ? ALL_DOCUMENTS.filter((document) => document.patientId === patientId)
      : ALL_DOCUMENTS;
    return mockResponse({ data: documents, documents });
  }

  if (path === '/api/telehealth/stats') {
    return mockResponse(getDemoTelehealthStats(params));
  }

  if (path === '/api/telehealth/sessions' && method.toUpperCase() === 'GET') {
    return mockResponse(filterDemoTelehealthSessions(params));
  }

  if (path === '/api/telehealth/sessions' && method.toUpperCase() === 'POST') {
    const sessions = readDemoTelehealthSessions();
    const nextId = Math.max(7000, ...sessions.map((session) => Number(session.id) || 0)) + 1;
    const patientId = body?.patientId == null ? null : Number(body.patientId);
    const providerId = body?.providerId == null ? null : Number(body.providerId);
    if (patientId == null || providerId == null || Number.isNaN(patientId) || Number.isNaN(providerId)) {
      return mockResponse({ error: 'Demo telehealth session creation requires a valid patient and provider.' }, 400);
    }

    const patient = ALL_PATIENTS.find((candidate) => extractNumericId(candidate.id, -1) === patientId);
    const provider = getDemoProviders().find((candidate) => extractNumericId(candidate.id, -1) === providerId);
    const now = new Date().toISOString();
    const newSession = {
      id: nextId,
      tenant_id: 'tenant-demo',
      appointment_id: undefined,
      patient_id: patientId,
      provider_id: providerId,
      session_token: `demo-session-token-${nextId}`,
      room_name: `demo-room-${nextId}`,
      status: 'scheduled',
      recording_consent: Boolean(body?.recordingConsent),
      recording_consent_timestamp: body?.recordingConsent ? now : undefined,
      patient_state: String(body?.patientState || 'CO'),
      provider_licensed_states: ['CO', 'UT', 'AZ'],
      state_licensing_verified: true,
      virtual_background_enabled: true,
      beauty_filter_enabled: false,
      screen_sharing_enabled: true,
      connection_quality: 'excellent',
      reconnection_count: 0,
      reason: String(body?.reason || 'Telehealth follow-up'),
      assigned_to: providerId,
      created_at: now,
      updated_at: now,
      patient_first_name: patient?.firstName || 'Demo',
      patient_last_name: patient?.lastName || 'Patient',
      provider_name: provider?.fullName || provider?.name || 'Provider',
      assigned_to_name: provider?.fullName || provider?.name || 'Provider',
      physician_name: provider?.fullName || provider?.name || 'Provider',
    };

    writeDemoTelehealthSessions([...sessions.filter((session) => Number(session.id) < 7000 || Number(session.id) >= 7000), newSession]);
    return mockResponse(newSession, 201);
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/status') && method.toUpperCase() === 'PATCH') {
    const segments = path.split('/');
    const sessionId = segments[segments.length - 2] || '';
    const updated = updateDemoTelehealthSession(sessionId, { status: body?.status || 'scheduled' });
    return updated ? mockResponse(updated) : mockResponse({ error: 'Telehealth session not found' }, 404);
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/notes/finalize') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const sessionId = segments[segments.length - 3] || '';
    return mockResponse(saveDemoTelehealthNotes(sessionId, {}, true));
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/notes') && method.toUpperCase() === 'GET') {
    const segments = path.split('/');
    const sessionId = segments[segments.length - 2] || '';
    return mockResponse(getDemoTelehealthNotes(sessionId));
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/notes') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const sessionId = segments[segments.length - 2] || '';
    return mockResponse(saveDemoTelehealthNotes(sessionId, {
      chief_complaint: body?.chiefComplaint,
      hpi: body?.hpi,
      examination_findings: body?.examinationFindings,
      assessment: body?.assessment,
      plan: body?.plan,
      suggested_cpt_codes: body?.suggestedCptCodes || [],
      suggested_icd10_codes: body?.suggestedIcd10Codes || [],
      complexity_level: body?.complexityLevel || '',
    }));
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/photos') && method.toUpperCase() === 'GET') {
    return mockResponse([]);
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/metrics') && method.toUpperCase() === 'GET') {
    return mockResponse([]);
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/metrics') && method.toUpperCase() === 'POST') {
    return mockResponse({ id: Date.now(), ...body, created_at: new Date().toISOString() }, 201);
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/events') && method.toUpperCase() === 'GET') {
    return mockResponse([]);
  }

  if (path.startsWith('/api/telehealth/sessions/') && path.endsWith('/events') && method.toUpperCase() === 'POST') {
    return mockResponse({ id: Date.now(), ...body, created_at: new Date().toISOString() }, 201);
  }

  if (path === '/api/telehealth/waiting-room') {
    return mockResponse(getDemoWaitingRoom());
  }

  if (path.startsWith('/api/telehealth/waiting-room/') && path.endsWith('/call') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const waitingRoomId = segments[segments.length - 2] || '';
    const entry = getDemoWaitingRoom().find((candidate) => String(candidate.id) === String(waitingRoomId));
    if (!entry) return mockResponse({ error: 'Waiting room entry not found' }, 404);
    const updatedSession = updateDemoTelehealthSession(entry.session_id, { status: 'in_progress', started_at: new Date().toISOString() });
    return mockResponse({
      ...entry,
      status: 'called',
      called_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_status: updatedSession?.status || 'in_progress',
    });
  }

  if (path.startsWith('/api/telehealth/sessions/') && method.toUpperCase() === 'GET') {
    const sessionId = path.split('/').pop() || '';
    const session = getDemoTelehealthSession(sessionId);
    return session ? mockResponse(session) : mockResponse({ error: 'Telehealth session not found' }, 404);
  }

  if (eligibilityMatch) {
    const portalData = getPortalDataByPatientId(eligibilityMatch[1] || '');
    return mockResponse(portalData?.eligibility || []);
  }

  if (path === '/api/eligibility/issues') {
    return mockResponse(getDemoEligibilityIssues());
  }

  if (path === '/api/eligibility/pending') {
    return mockResponse(getDemoEligibilityPending(Number(params.get('daysThreshold') || 30)));
  }

  if (path === '/api/eligibility/auto-verify/stats') {
    return mockResponse(getDemoAutoVerifyStats());
  }

  if (path === '/api/eligibility/auto-verify/toggle' && method.toUpperCase() === 'POST') {
    return mockResponse(toggleDemoAutoVerify(Boolean(body?.enabled)));
  }

  if (path.startsWith('/api/eligibility/benefits/')) {
    const patientId = path.split('/').pop() || '';
    const result = getDemoBenefits(patientId);
    return result ? mockResponse(result) : mockResponse({ success: false, error: 'Patient not found' }, 404);
  }

  if (path.startsWith('/api/eligibility/prior-auth/')) {
    const cptCode = path.split('/').pop() || '';
    return mockResponse(getDemoPriorAuthRequirement(cptCode));
  }

  if (path.startsWith('/api/eligibility/verify/')) {
    return mockResponse({ status: 'Active', message: 'Demo eligibility verified' });
  }

  if (path === '/api/photos' || path.includes('/api/photos/')) {
    return mockResponse({ data: [] });
  }

  if (path === '/api/schedule' || path.startsWith('/api/schedule')) {
    return mockResponse({ data: filterAppointments(getAllAppointments(), params) });
  }

  if (path === '/api/financial-metrics/dashboard') {
    return mockResponse(getDemoFinancialDashboard(params.get('date') || undefined));
  }

  if (path === '/api/financial-metrics/collections-trend') {
    return mockResponse(getDemoCollectionsTrend(
      params.get('startDate'),
      params.get('endDate'),
      (params.get('granularity') as 'day' | 'week' | 'month' | null) || 'day',
    ));
  }

  if (path === '/api/financial-metrics/payments-summary') {
    return mockResponse(getDemoPaymentsSummary(params.get('startDate'), params.get('endDate')));
  }

  if (path === '/api/financial-metrics/ar-aging') {
    return mockResponse(getDemoARAging(params.get('asOfDate')));
  }

  if (path === '/api/financial-metrics/bills-summary') {
    return mockResponse(getDemoBillsSummary(params.get('startDate'), params.get('endDate')));
  }

  if (path === '/api/bills/work-queue') return mockResponse(queryDemoFinancialWorkQueue(params));
  if (path.startsWith('/api/bills/work-queue/') && path.endsWith('/resolve') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const itemId = decodeURIComponent(segments[segments.length - 2] || '');
    try {
      return mockResponse(resolveDemoFinancialWorkQueueItem(itemId, body?.note ? String(body.note) : undefined));
    } catch (error: any) {
      return mockResponse({ error: error?.message || 'Financial work queue item not found' }, 404);
    }
  }
  if (path === '/api/bills') return mockResponse(queryDemoBills(params));
  if (path === '/api/payer-payments') return mockResponse(queryDemoPayerPayments(params));
  if (path === '/api/patient-payments') return mockResponse(queryDemoPatientPayments(params));
  if (path === '/api/statements') return mockResponse(queryDemoStatements(params));
  if (path === '/api/batches') return mockResponse(queryDemoBatches());

  if (path === '/api/claims/metrics') return mockResponse(getDemoClaimMetrics());

  if (path === '/api/claims' && method.toUpperCase() === 'GET') {
    return mockResponse(queryDemoClaims(params));
  }

  if (path.startsWith('/api/claims/') && path.endsWith('/status') && method.toUpperCase() === 'PUT') {
    const segments = path.split('/');
    const claimId = segments[segments.length - 2] || '';
    return mockResponse({ success: true, claimId, status: body?.status || 'updated' });
  }

  if (path.startsWith('/api/claims/') && path.endsWith('/payments') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const claimId = segments[segments.length - 2] || '';
    return mockResponse({ success: true, claimId, paymentId: `${claimId}-manual-payment` });
  }

  if (path.startsWith('/api/claims/') && method.toUpperCase() === 'GET') {
    const claimId = path.split('/').pop() || '';
    const detail = getDemoClaimDetail(claimId);
    return detail ? mockResponse(detail) : mockResponse({ error: 'Claim not found' }, 404);
  }

  if (path === '/api/clearinghouse/submit-claim' && method.toUpperCase() === 'POST') {
    if (!body?.claimId) return mockResponse({ error: 'Missing claimId' }, 400);
    return mockResponse(submitDemoClaim(String(body.claimId)));
  }

  if (path.startsWith('/api/clearinghouse/claim-status/')) {
    const claimId = path.split('/').pop() || '';
    return mockResponse(getDemoClaimStatus(claimId));
  }

  if (path === '/api/clearinghouse/era') {
    return mockResponse(getDemoERAs(params));
  }

  if (path.startsWith('/api/clearinghouse/era/') && path.endsWith('/post') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const eraId = segments[segments.length - 2] || '';
    return mockResponse(postDemoEra(eraId));
  }

  if (path.startsWith('/api/clearinghouse/era/') && method.toUpperCase() === 'GET') {
    const eraId = path.split('/').pop() || '';
    return mockResponse(getDemoEraDetails(eraId));
  }

  if (path === '/api/clearinghouse/eft') {
    return mockResponse(getDemoEfts(params));
  }

  if (path === '/api/clearinghouse/reconcile' && method.toUpperCase() === 'POST') {
    if (!body?.eraId && !body?.eftId) return mockResponse({ error: 'Missing reconciliation target' }, 400);
    return mockResponse(reconcileDemoPayments(String(body?.eraId || ''), body?.eftId ? String(body.eftId) : undefined, body?.notes ? String(body.notes) : undefined));
  }

  if (path === '/api/clearinghouse/reports/closing') {
    const startDate = params.get('startDate') || new Date().toISOString().slice(0, 10);
    const endDate = params.get('endDate') || startDate;
    return mockResponse(getDemoClosingReport(startDate, endDate, params.get('reportType') || 'daily'));
  }

  if (path === '/api/fee-schedules' && method.toUpperCase() === 'GET') return mockResponse(getDemoFeeSchedules());
  if (path === '/api/fee-schedules' && method.toUpperCase() === 'POST') return mockResponse(createDemoFeeSchedule(body || {}), 201);

  if (path === '/api/fee-schedules/default/schedule') {
    const schedule = getDemoDefaultFeeSchedule();
    return schedule ? mockResponse(schedule) : mockResponse({ error: 'No default schedule' }, 404);
  }

  if (path.startsWith('/api/fee-schedules/default/fee/')) {
    const cptCode = path.split('/').pop() || '';
    const item = getDemoFeeForCpt(cptCode);
    return item ? mockResponse(item) : mockResponse({ error: 'CPT not found' }, 404);
  }

  if (path === '/api/fee-schedules/cosmetic/categories') return mockResponse(getDemoCosmeticCategories());
  if (path === '/api/fee-schedules/cosmetic/pricing' || path === '/api/fee-schedules/cosmetic/procedures') return mockResponse(getDemoCosmeticPricing(params));

  if (path.startsWith('/api/fee-schedules/') && path.endsWith('/items/import') && method.toUpperCase() === 'POST') {
    const segments = path.split('/');
    const scheduleId = segments[segments.length - 3] || '';
    return mockResponse(importDemoFeeScheduleItems(scheduleId, Array.isArray(body?.items) ? body.items : []));
  }

  if (path.startsWith('/api/fee-schedules/') && path.endsWith('/export')) {
    const scheduleId = path.split('/')[3] || '';
    return new Response(exportDemoFeeScheduleCsv(scheduleId), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=\"${scheduleId}.csv\"`,
      },
    });
  }

  if (path.startsWith('/api/fee-schedules/') && path.includes('/items/') && method.toUpperCase() === 'PUT') {
    const segments = path.split('/');
    const scheduleId = segments[3] || '';
    const cptCode = segments[5] || '';
    return mockResponse(updateDemoFeeScheduleItem(scheduleId, cptCode, body || {}));
  }

  if (path.startsWith('/api/fee-schedules/') && path.includes('/items/') && method.toUpperCase() === 'DELETE') {
    const segments = path.split('/');
    const scheduleId = segments[3] || '';
    const cptCode = segments[5] || '';
    return mockResponse(deleteDemoFeeScheduleItem(scheduleId, cptCode));
  }

  if (path.startsWith('/api/fee-schedules/') && path.endsWith('/items') && method.toUpperCase() === 'GET') {
    const scheduleId = path.split('/')[3] || '';
    return mockResponse(getDemoFeeScheduleItems(scheduleId));
  }

  if (path.startsWith('/api/fee-schedules/') && method.toUpperCase() === 'PUT') {
    const scheduleId = path.split('/').pop() || '';
    return mockResponse(updateDemoFeeSchedule(scheduleId, body || {}));
  }

  if (path.startsWith('/api/fee-schedules/') && method.toUpperCase() === 'DELETE') {
    const scheduleId = path.split('/').pop() || '';
    return mockResponse(deleteDemoFeeSchedule(scheduleId));
  }

  if (path.startsWith('/api/fee-schedules/') && method.toUpperCase() === 'GET') {
    const scheduleId = path.split('/').pop() || '';
    const schedule = getDemoFeeSchedule(scheduleId);
    return schedule ? mockResponse(schedule) : mockResponse({ error: 'Fee schedule not found' }, 404);
  }

  if (path === '/api/tasks' && method.toUpperCase() === 'POST') {
    const now = new Date().toISOString();
    const newTask = {
      id: `task-demo-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
      patientId: body?.patientId || body?.patient_id || null,
      encounterId: body?.encounterId || body?.encounter_id || null,
      title: String(body?.title || 'New task'),
      description: body?.description ? String(body.description) : '',
      category: body?.category || 'Clinical',
      priority: body?.priority || 'normal',
      status: body?.status || 'todo',
      dueDate: body?.dueDate || body?.due_date || null,
      assignedTo: body?.assignedTo || null,
      createdBy: 'demo-provider-1',
      createdAt: now,
      updatedAt: now,
    };
    writeDemoTasks([newTask, ...readDemoTasks()]);
    return mockResponse({ id: newTask.id, task: newTask }, 201);
  }

  if (path === '/api/tasks') {
    let tasks = readDemoTasks();
    const search = params.get('search');
    const status = params.get('status');
    const category = params.get('category');
    const priority = params.get('priority');
    const assignedTo = params.get('assignedTo');
    if (search) {
      const needle = search.toLowerCase();
      tasks = tasks.filter((task) =>
        [task.title, task.description, task.patientName].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)),
      );
    }
    if (status) tasks = tasks.filter((task) => String(task.status) === status);
    if (category) tasks = tasks.filter((task) => String(task.category) === category);
    if (priority) tasks = tasks.filter((task) => String(task.priority) === priority);
    if (assignedTo === 'unassigned') tasks = tasks.filter((task) => !task.assignedTo);
    if (assignedTo && !['unassigned', 'me', 'sent', 'overdue'].includes(assignedTo)) {
      tasks = tasks.filter((task) => String(task.assignedTo || '') === assignedTo);
    }
    return mockResponse({ tasks, data: tasks });
  }

  if (path === '/api/recalls/campaigns' && method.toUpperCase() === 'GET') {
    return mockResponse({ campaigns: readDemoRecallCampaigns() });
  }

  if (path === '/api/recalls/campaigns' && method.toUpperCase() === 'POST') {
    const now = new Date().toISOString();
    const newCampaign = {
      id: `rec-camp-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
      tenantId: 'tenant-demo',
      name: String(body?.name || 'New Recall Campaign'),
      description: body?.description ? String(body.description) : '',
      recallType: String(body?.recallType || 'Annual Skin Check'),
      intervalMonths: Math.max(1, Number(body?.intervalMonths || 12)),
      isActive: body?.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    writeDemoRecallCampaigns([newCampaign, ...readDemoRecallCampaigns()]);
    return mockResponse(newCampaign, 201);
  }

  if (path.startsWith('/api/recalls/campaigns/') && path.endsWith('/generate') && method.toUpperCase() === 'POST') {
    const campaignId = path.split('/')[4] || '';
    const result = generateDemoRecallsForCampaign(campaignId, 3);
    return mockResponse(result);
  }

  if (path.startsWith('/api/recalls/campaigns/') && method.toUpperCase() === 'PUT') {
    const campaignId = path.split('/')[4] || '';
    const campaigns = readDemoRecallCampaigns();
    const existing = campaigns.find((campaign) => String(campaign.id) === String(campaignId));
    if (!existing) return mockResponse({ error: 'Campaign not found' }, 404);
    const updated = {
      ...existing,
      ...(body || {}),
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };
    writeDemoRecallCampaigns(campaigns.map((campaign) => (String(campaign.id) === String(campaignId) ? updated : campaign)));
    return mockResponse(updated);
  }

  if (path.startsWith('/api/recalls/campaigns/') && method.toUpperCase() === 'DELETE') {
    const campaignId = path.split('/')[4] || '';
    const campaigns = readDemoRecallCampaigns();
    const exists = campaigns.some((campaign) => String(campaign.id) === String(campaignId));
    if (!exists) return mockResponse({ error: 'Campaign not found' }, 404);
    writeDemoRecallCampaigns(campaigns.filter((campaign) => String(campaign.id) !== String(campaignId)));
    return mockResponse({ success: true });
  }

  if (path === '/api/recalls/generate-all' && method.toUpperCase() === 'POST') {
    const activeCampaigns = readDemoRecallCampaigns().filter((campaign) => campaign.isActive);
    let totalCreated = 0;
    let totalSkipped = 0;
    const errors: string[] = [];
    for (const campaign of activeCampaigns) {
      const result = generateDemoRecallsForCampaign(String(campaign.id), 2);
      totalCreated += result.created;
      totalSkipped += result.skipped;
      errors.push(...result.errors);
    }
    return mockResponse({
      campaigns: activeCampaigns.length,
      totalCreated,
      totalSkipped,
      errors,
    });
  }

  if (path === '/api/recalls/due' && method.toUpperCase() === 'GET') {
    const recalls = filterDemoRecalls(readDemoRecalls(), {
      startDate: params.get('startDate') || undefined,
      endDate: params.get('endDate') || undefined,
      campaignId: params.get('campaignId') || undefined,
      status: params.get('status') || undefined,
    }).sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    return mockResponse({ recalls });
  }

  if (path === '/api/recalls/patient' && method.toUpperCase() === 'POST') {
    if (!body?.patientId || !body?.dueDate) {
      return mockResponse({ error: 'patientId and dueDate are required' }, 400);
    }
    const campaigns = readDemoRecallCampaigns();
    const selectedCampaign = campaigns.find((campaign) => String(campaign.id) === String(body.campaignId || ''));
    const recall = normalizeDemoRecall({
      id: `recall-manual-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
      tenantId: 'tenant-demo',
      patientId: String(body.patientId),
      campaignId: body.campaignId ? String(body.campaignId) : undefined,
      dueDate: String(body.dueDate),
      recallDate: String(body.dueDate),
      status: 'pending',
      notes: body?.notes ? String(body.notes) : '',
      recallType: selectedCampaign?.recallType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, campaigns);
    writeDemoRecalls([recall, ...readDemoRecalls()]);
    return mockResponse(recall, 201);
  }

  if (path.startsWith('/api/recalls/') && path.endsWith('/status') && method.toUpperCase() === 'PUT') {
    const recallId = path.split('/')[3] || '';
    const recalls = readDemoRecalls();
    const existing = recalls.find((recall) => String(recall.id) === String(recallId));
    if (!existing) return mockResponse({ error: 'Recall not found' }, 404);
    const updated = normalizeDemoRecall({
      ...existing,
      status: String(body?.status || existing.status),
      notes: body?.notes !== undefined ? String(body.notes) : existing.notes,
      appointmentId: body?.appointmentId ? String(body.appointmentId) : existing.appointmentId,
      updatedAt: new Date().toISOString(),
      lastContactDate: body?.status === 'contacted' ? new Date().toISOString() : existing.lastContactDate,
    }, readDemoRecallCampaigns());
    writeDemoRecalls(recalls.map((recall) => (String(recall.id) === String(recallId) ? updated : recall)));
    return mockResponse(updated);
  }

  if (path.startsWith('/api/recalls/') && path.endsWith('/contact') && method.toUpperCase() === 'POST') {
    const recallId = path.split('/')[3] || '';
    const recalls = readDemoRecalls();
    const existing = recalls.find((recall) => String(recall.id) === String(recallId));
    if (!existing) return mockResponse({ error: 'Recall not found' }, 404);

    const sentAt = new Date().toISOString();
    const contactMethod = String(body?.contactMethod || 'phone');
    const nextAttempts = Number(existing.contactAttempts || 0) + 1;
    const updated = normalizeDemoRecall({
      ...existing,
      status: existing.status === 'completed' ? 'completed' : 'contacted',
      contactMethod,
      lastContactDate: sentAt,
      notes: body?.notes ? String(body.notes) : existing.notes,
      messageContent: body?.messageContent ? String(body.messageContent) : undefined,
      contactAttempts: nextAttempts,
      notificationCount: nextAttempts,
      lastReminderType: contactMethod,
      lastReminderSentAt: sentAt,
      lastReminderDeliveryStatus: 'delivered',
      notifiedOn: sentAt,
      updatedAt: sentAt,
      textThreadId: contactMethod === 'sms' ? (existing.textThreadId || `thread-${recallId}`) : existing.textThreadId,
      textThreadStatus: contactMethod === 'sms' ? 'waiting-patient' : existing.textThreadStatus,
    }, readDemoRecallCampaigns());
    writeDemoRecalls(recalls.map((recall) => (String(recall.id) === String(recallId) ? updated : recall)));
    appendDemoRecallHistory(createDemoRecallHistoryEntry(updated, {
      reminderType: contactMethod,
      sentAt,
      deliveryStatus: 'delivered',
      messageContent: body?.messageContent ? String(body.messageContent) : 'Recall contact logged from demo workflow.',
    }));
    return mockResponse({ message: 'Recall contact recorded' });
  }

  if (path === '/api/recalls/history' && method.toUpperCase() === 'GET') {
    const history = readDemoRecallHistory().filter((entry) => {
      if (params.get('patientId') && String(entry.patientId) !== String(params.get('patientId'))) return false;
      if (params.get('campaignId')) {
        const recall = readDemoRecalls().find((item) => String(item.id) === String(entry.recallId || ''));
        if (!recall || String(recall.campaignId) !== String(params.get('campaignId'))) return false;
      }
      const sentDate = String(entry.sentAt || '').slice(0, 10);
      if (params.get('startDate') && sentDate < String(params.get('startDate'))) return false;
      if (params.get('endDate') && sentDate > String(params.get('endDate'))) return false;
      return true;
    });
    const limit = Number(params.get('limit') || 0);
    return mockResponse({ history: limit > 0 ? history.slice(0, limit) : history });
  }

  if (path === '/api/recalls/stats' && method.toUpperCase() === 'GET') {
    return mockResponse(buildDemoRecallStats({
      campaignId: params.get('campaignId') || undefined,
      startDate: params.get('startDate') || undefined,
      endDate: params.get('endDate') || undefined,
    }));
  }

  if (path === '/api/recalls/bulk-notify' && method.toUpperCase() === 'POST') {
    const recallIds = Array.isArray(body?.recallIds) ? body?.recallIds.map(String) : [];
    const notificationType = String(body?.notificationType || 'sms');
    const messageTemplate = body?.messageTemplate ? String(body.messageTemplate) : 'Recall reminder sent from demo workflow.';
    const recalls = readDemoRecalls();
    const errors: Array<{ recallId: string; error: string }> = [];
    let successful = 0;

    const updatedRecalls = recalls.map((recall) => {
      if (!recallIds.includes(String(recall.id))) return recall;
      if (notificationType === 'sms' && !recall.phone) {
        errors.push({ recallId: String(recall.id), error: 'No phone number on file' });
        return recall;
      }
      if (notificationType === 'email' && !recall.email) {
        errors.push({ recallId: String(recall.id), error: 'No email on file' });
        return recall;
      }
      successful += 1;
      const sentAt = new Date().toISOString();
      const nextAttempts = Number(recall.contactAttempts || 0) + 1;
      const updated = normalizeDemoRecall({
        ...recall,
        status: recall.status === 'completed' ? 'completed' : 'contacted',
        contactMethod: notificationType,
        lastContactDate: sentAt,
        contactAttempts: nextAttempts,
        notificationCount: nextAttempts,
        lastReminderType: notificationType,
        lastReminderSentAt: sentAt,
        lastReminderDeliveryStatus: 'delivered',
        notifiedOn: sentAt,
        updatedAt: sentAt,
        textThreadId: notificationType === 'sms' ? (recall.textThreadId || `thread-${recall.id}`) : recall.textThreadId,
        textThreadStatus: notificationType === 'sms' ? 'waiting-patient' : recall.textThreadStatus,
      }, readDemoRecallCampaigns());
      appendDemoRecallHistory(createDemoRecallHistoryEntry(updated, {
        reminderType: notificationType,
        sentAt,
        messageContent: messageTemplate,
      }));
      return updated;
    });

    writeDemoRecalls(updatedRecalls);
    return mockResponse({
      total: recallIds.length,
      successful,
      failed: errors.length,
      errors,
    });
  }

  if (path.startsWith('/api/recalls/') && path.endsWith('/notification-history') && method.toUpperCase() === 'GET') {
    const recallId = path.split('/')[3] || '';
    const history = readDemoRecallHistory().filter((entry) => String(entry.recallId) === String(recallId));
    return mockResponse({ history });
  }

  if (path === '/api/recalls/export' && method.toUpperCase() === 'GET') {
    const recalls = filterDemoRecalls(readDemoRecalls(), {
      campaignId: params.get('campaignId') || undefined,
      status: params.get('status') || undefined,
    });
    const csvLines = [
      ['Patient', 'Campaign', 'Recall Type', 'Due Date', 'Status', 'Phone', 'Email', 'Notes'].join(','),
      ...recalls.map((recall) => ([
        `"${String(`${recall.lastName || ''}, ${recall.firstName || ''}`).trim()}"`,
        `"${String(recall.campaignName || '')}"`,
        `"${String(recall.recallType || '')}"`,
        `"${String(recall.dueDate || '')}"`,
        `"${String(recall.status || '')}"`,
        `"${String(recall.phone || '')}"`,
        `"${String(recall.email || '')}"`,
        `"${String(recall.notes || '').replace(/"/g, '""')}"`,
      ].join(','))),
    ];
    return new Response(csvLines.join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'text/csv' },
    });
  }

  if (path === '/api/reminders') {
    return mockResponse({
      data: readDemoRecalls(),
      campaigns: readDemoRecallCampaigns(),
      stats: buildDemoRecallStats(),
    });
  }

  if (path === '/api/messaging/unread-count') return mockResponse({ count: 0 });

  if (path === '/api/time-blocks' && method.toUpperCase() === 'GET') {
    return mockResponse(readDemoTimeBlocks());
  }

  if (path === '/api/time-blocks' && method.toUpperCase() === 'POST') {
    const now = new Date().toISOString();
    const newBlock = {
      id: `tb-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
      tenantId: 'tenant-demo',
      providerId: String(body?.providerId || ''),
      locationId: body?.locationId ? String(body.locationId) : undefined,
      title: String(body?.title || 'Blocked time'),
      blockType: String(body?.blockType || 'break'),
      description: body?.description ? String(body.description) : undefined,
      startTime: String(body?.startTime || now),
      endTime: String(body?.endTime || now),
      isRecurring: Boolean(body?.isRecurring),
      recurrencePattern: body?.recurrencePattern,
      recurrenceEndDate: body?.recurrenceEndDate || body?.recurrencePattern?.until,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    writeDemoTimeBlocks([...readDemoTimeBlocks(), newBlock]);
    return mockResponse({ timeBlock: newBlock }, 201);
  }

  if (path.startsWith('/api/time-blocks/') && method.toUpperCase() === 'PUT') {
    const timeBlockId = path.split('/').pop() || '';
    const updatedBlocks = readDemoTimeBlocks().map((block) =>
      String(block.id) === timeBlockId
        ? {
            ...block,
            ...body,
            recurrenceEndDate: body?.recurrenceEndDate || body?.recurrencePattern?.until || block.recurrenceEndDate,
            updatedAt: new Date().toISOString(),
          }
        : block,
    );
    writeDemoTimeBlocks(updatedBlocks);
    const updated = updatedBlocks.find((block) => String(block.id) === timeBlockId);
    return updated ? mockResponse({ timeBlock: updated }) : mockResponse({ error: 'Time block not found' }, 404);
  }

  if (path.startsWith('/api/time-blocks/') && method.toUpperCase() === 'DELETE') {
    const timeBlockId = path.split('/').pop() || '';
    writeDemoTimeBlocks(readDemoTimeBlocks().filter((block) => String(block.id) !== timeBlockId));
    return mockResponse({ success: true });
  }

  if (path === '/api/prior-auth' && method.toUpperCase() === 'GET') {
    const status = params.get('status');
    const patientId = params.get('patientId');
    let priorAuths = getDemoPriorAuthList();
    if (status) {
      priorAuths = priorAuths.filter((item) => String(item.status) === status);
    }
    if (patientId) {
      priorAuths = priorAuths.filter((item) => String(item.patient_id) === patientId);
    }
    return mockResponse(priorAuths);
  }

  if (path.startsWith('/api/prior-auth/') && method.toUpperCase() === 'GET') {
    const priorAuthId = path.split('/').pop() || '';
    const priorAuth = getDemoPriorAuthList().find((item) => String(item.id) === priorAuthId);
    return priorAuth ? mockResponse(priorAuth) : mockResponse({ error: 'Prior authorization not found' }, 404);
  }

  if (path === '/api/body-map-markers' && method.toUpperCase() === 'GET') {
    const patientId = params.get('patient_id') || '';
    return mockResponse({ markers: patientId ? readDemoBodyMarkers(patientId) : [] });
  }

  if (path === '/api/body-map-markers' && method.toUpperCase() === 'POST') {
    const patientId = String(body?.patient_id || '');
    if (!patientId) return mockResponse({ error: 'patient_id is required' }, 400);
    const newMarker = {
      id: `marker-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
      patient_id: patientId,
      encounter_id: body?.encounter_id ? String(body.encounter_id) : undefined,
      marker_type: String(body?.marker_type || 'lesion'),
      body_region: String(body?.body_region || 'front-custom'),
      view_type: String(body?.view_type || 'front'),
      x_position: Number(body?.x_position ?? 50),
      y_position: Number(body?.y_position ?? 50),
      description: String(body?.description || ''),
      clinical_notes: String(body?.clinical_notes || body?.description || ''),
      status: String(body?.status || 'active'),
      severity: String(body?.severity || 'mild'),
      created_at: new Date().toISOString(),
    };
    const overrides = readDemoBodyMarkersStore();
    const currentOverrides = Array.isArray(overrides[patientId]) ? overrides[patientId].filter((item) => String(item.id) !== newMarker.id) : [];
    writePatientBodyMarkerOverrides(patientId, [...currentOverrides, newMarker]);
    return mockResponse(newMarker, 201);
  }

  if (path.startsWith('/api/body-map-markers/') && method.toUpperCase() === 'PUT') {
    const markerId = path.split('/').pop() || '';
    const located = findDemoBodyMarker(markerId);
    if (!located) return mockResponse({ error: 'Marker not found' }, 404);
    const updatedMarker = {
      ...located.marker,
      ...body,
      id: markerId,
      updated_at: new Date().toISOString(),
    };
    const overrides = readDemoBodyMarkersStore();
    const currentOverrides = Array.isArray(overrides[located.patientId]) ? overrides[located.patientId].filter((item) => String(item.id) !== markerId) : [];
    writePatientBodyMarkerOverrides(located.patientId, [...currentOverrides, updatedMarker]);
    return mockResponse(updatedMarker);
  }

  if (path.startsWith('/api/body-map-markers/') && method.toUpperCase() === 'DELETE') {
    const markerId = path.split('/').pop() || '';
    const located = findDemoBodyMarker(markerId);
    if (!located) return mockResponse({ success: true });
    const overrides = readDemoBodyMarkersStore();
    const currentOverrides = Array.isArray(overrides[located.patientId]) ? overrides[located.patientId].filter((item) => String(item.id) !== markerId) : [];
    writePatientBodyMarkerOverrides(located.patientId, [...currentOverrides, { id: markerId, _deleted: true }]);
    return mockResponse({ success: true });
  }

  if (path.startsWith('/api/ambient/patient-summaries/') && method.toUpperCase() === 'GET') {
    const patientId = path.split('/').pop() || '';
    return mockResponse({ summaries: buildDemoPatientSummaries(patientId) });
  }

  if (path.startsWith('/api/ambient/notes/') && method.toUpperCase() === 'GET') {
    const noteId = path.split('/').pop() || '';
    const note = buildDemoAmbientNote(noteId);
    return note ? mockResponse({ note }) : mockResponse({ error: 'Note not found' }, 404);
  }

  if (path.startsWith('/api/ambient/encounters/') && path.endsWith('/notes') && method.toUpperCase() === 'GET') {
    return mockResponse({ notes: [] });
  }

  return null;
}

function handlePortalRoute(
  path: string,
  params: URLSearchParams,
  email: string,
  method: string,
  body: DemoItem | null,
): Response | null {
  const data = getDemoDataForPortalUser(email);
  if (!data) return null;

  const portalAppointments = getAppointmentsForPatient(data.patient.id);
  const unreadMessages = data.profile.email?.includes('jane') ? 1 : 0;
  const currentBalance = Number(data.billing.balance?.currentBalance || 0);
  const upcomingAppointments = portalAppointments.filter((appointment) => appointment.status === 'scheduled');

  if (path === '/api/patient-portal/scheduling/settings') {
    return mockResponse(DEMO_SCHEDULING_SETTINGS);
  }

  if (path === '/api/patient-portal/scheduling/providers') {
    return mockResponse({ providers: DEMO_SCHEDULING_PROVIDERS });
  }

  if (path === '/api/patient-portal/scheduling/appointment-types') {
    return mockResponse({ appointmentTypes: DEMO_SCHEDULING_APPOINTMENT_TYPES });
  }

  if (path === '/api/patient-portal/scheduling/available-dates') {
    const providerId = params.get('providerId') || DEMO_SCHEDULING_PROVIDERS[0].id;
    const appointmentTypeId = params.get('appointmentTypeId') || DEMO_SCHEDULING_APPOINTMENT_TYPES[0].id;
    return mockResponse({ dates: getAvailableDates(providerId, appointmentTypeId) });
  }

  if (path === '/api/patient-portal/scheduling/availability') {
    const date = params.get('date') || '';
    const providerId = params.get('providerId') || DEMO_SCHEDULING_PROVIDERS[0].id;
    const appointmentTypeId = params.get('appointmentTypeId') || DEMO_SCHEDULING_APPOINTMENT_TYPES[0].id;
    return mockResponse({ slots: getProviderSlots(date, providerId, appointmentTypeId) });
  }

  if (path === '/api/patient-portal/scheduling/book' && method.toUpperCase() === 'POST') {
    if (!body?.providerId || !body?.appointmentTypeId || !body?.scheduledStart || !body?.scheduledEnd) {
      return mockResponse({ error: 'Missing booking details' }, 400);
    }

    const requestedDate = String(body.scheduledStart).split('T')[0];
    const slot = getProviderSlots(requestedDate, body.providerId, body.appointmentTypeId).find(
      (candidate) => candidate.startTime === body.scheduledStart,
    );

    if (!slot || !slot.isAvailable) {
      return mockResponse({ error: 'Time slot is no longer available' }, 409);
    }

    const patient = data.patient;
    const provider = DEMO_SCHEDULING_PROVIDERS.find((item) => item.id === body.providerId);
    const appointmentType = DEMO_SCHEDULING_APPOINTMENT_TYPES.find((item) => item.id === body.appointmentTypeId);
    const newAppointment = {
      id: `appt-demo-booked-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
      tenantId: 'tenant-demo',
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      providerId: body.providerId,
      providerName: provider?.fullName || 'Dr. David Skin, MD, FAAD',
      locationId: 'loc-1',
      locationName: 'Mountain Pine Dermatology - Main Office',
      appointmentTypeId: body.appointmentTypeId,
      appointmentTypeName: appointmentType?.name || 'Follow-Up Visit',
      scheduledStart: body.scheduledStart,
      scheduledEnd: body.scheduledEnd,
      status: 'scheduled',
      chiefComplaint: body.reason || body.notes || 'Online self-scheduled visit',
      createdAt: new Date().toISOString(),
    };

    writeBookedAppointments([...readBookedAppointments(), newAppointment]);
    return mockResponse({
      appointmentId: newAppointment.id,
      message: 'Appointment booked successfully',
    }, 201);
  }

  if (path === '/api/patient-portal-data/dashboard') {
    const nextAppointment = upcomingAppointments[0] || null;
    return mockResponse({
      dashboard: {
        upcomingAppointments: upcomingAppointments.length,
        nextAppointment: nextAppointment ? {
          appointmentId: nextAppointment.id,
          appointmentDate: String(nextAppointment.scheduledStart).split('T')[0],
          appointmentTime: String(nextAppointment.scheduledStart).split('T')[1]?.slice(0, 5),
          providerName: nextAppointment.providerName,
          appointmentType: nextAppointment.appointmentTypeName,
        } : null,
        newDocuments: data.documents.length,
        newVisits: data.visitSummaries.length,
        activePrescriptions: data.prescriptions.filter((prescription) => prescription.status === 'transmitted').length,
        unreadMessages,
        currentBalance,
        preCheckinAvailable: upcomingAppointments.length > 0,
        nextCheckinAppointment: nextAppointment ? {
          appointmentId: nextAppointment.id,
          appointmentDate: String(nextAppointment.scheduledStart).split('T')[0],
          appointmentTime: String(nextAppointment.scheduledStart).split('T')[1]?.slice(0, 5),
          providerName: nextAppointment.providerName,
          appointmentType: nextAppointment.appointmentTypeName,
        } : null,
        actionNeededCount:
          data.documents.length
          + data.visitSummaries.length
          + unreadMessages
          + (currentBalance > 0 ? 1 : 0)
          + (upcomingAppointments.length > 0 ? 1 : 0),
      },
    });
  }

  if (path === '/api/patient-portal-data/store/products' && method.toUpperCase() === 'GET') {
    return mockResponse({
      products: readDemoStoreProducts().filter((product) => product.isActive !== false && product.category !== 'prescription'),
    });
  }

  if (path === '/api/patient-portal-data/store/orders' && method.toUpperCase() === 'POST') {
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) return mockResponse({ error: 'At least one item is required' }, 400);

    const products = readDemoStoreProducts();
    const updatedProducts = [...products];
    const saleItems: DemoItem[] = [];
    let subtotal = 0;

    for (const item of items) {
      const productIndex = updatedProducts.findIndex((product) => String(product.id) === String(item.productId));
      if (productIndex < 0) return mockResponse({ error: 'Product not found' }, 404);
      const product = updatedProducts[productIndex];
      const quantity = Number(item.quantity || 1);
      if (Number(product.inventoryCount || 0) < quantity) {
        return mockResponse({ error: `Insufficient inventory for ${product.name}` }, 400);
      }
      updatedProducts[productIndex] = {
        ...product,
        inventoryCount: Number(product.inventoryCount || 0) - quantity,
        updatedAt: new Date().toISOString(),
      };
      const lineTotal = Number(product.price || 0) * quantity;
      subtotal += lineTotal;
      saleItems.push({
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `demo-sale-item-${Date.now()}`,
        saleId: '',
        productId: product.id,
        quantity,
        unitPrice: Number(product.price || 0),
        discountAmount: 0,
        lineTotal,
        productName: product.name,
        productSku: product.sku,
      });
    }

    const tax = Math.round(subtotal * 0.0825);
    const shippingFee = body?.shippingMethod === 'priority' ? 995 : body?.shippingMethod === 'pickup' ? 0 : 595;
    const total = subtotal + tax + shippingFee;
    const saleId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `demo-store-order-${Date.now()}`;
    const now = new Date().toISOString();
    const order = {
      id: saleId,
      tenantId: 'tenant-demo',
      patientId: data.patient.id,
      patientFirstName: data.patient.firstName,
      patientLastName: data.patient.lastName,
      soldBy: 'portal-demo',
      saleDate: now,
      subtotal,
      tax,
      discount: 0,
      total,
      paymentMethod: 'credit',
      paymentReference: body?.paymentReference || body?.stripePaymentIntentId || `stripe_portal_${Date.now()}`,
      status: 'completed',
      channel: 'patient_portal',
      fulfillmentStatus: 'paid',
      shippingMethod: body?.shippingMethod || 'standard',
      carrier: '',
      trackingNumber: '',
      shippingAddress: body?.shippingAddress || {},
      notificationEmail: body?.notificationEmail || data.profile.email,
      notificationStatus: 'queued',
      stripePaymentIntentId: body?.stripePaymentIntentId || body?.paymentReference || `stripe_portal_${Date.now()}`,
      stripePaymentStatus: 'paid',
      createdAt: now,
      updatedAt: now,
      items: saleItems.map((item) => ({ ...item, saleId })),
    };

    writeDemoStoreProducts(updatedProducts);
    writeDemoStoreOrders([order, ...readDemoStoreOrders()]);
    return mockResponse({ order, sale: order }, 201);
  }

  if (path.startsWith('/api/patient-portal-data/appointments')) {
    const status = params.get('status') || 'all';
    let appointments = portalAppointments;
    if (status === 'upcoming') appointments = portalAppointments.filter((appointment) => appointment.status === 'scheduled');
    if (status === 'past') appointments = portalAppointments.filter((appointment) => appointment.status === 'completed');
    return mockResponse({ appointments: appointments.map(transformPortalAppointment) });
  }

  if (path === '/api/patient-portal-data/visit-summaries') {
    return mockResponse({ summaries: data.visitSummaries });
  }

  if (path === '/api/patient-portal-data/documents') {
    return mockResponse({ documents: data.documents });
  }

  if (path === '/api/patient-portal-data/allergies') {
    return mockResponse({ allergies: data.healthRecord.allergies });
  }

  if (path === '/api/patient-portal-data/medications') {
    return mockResponse({ medications: data.healthRecord.medications });
  }

  if (path === '/api/patient-portal-data/vitals') {
    return mockResponse({ vitals: data.healthRecord.vitals.map(transformVital) });
  }

  if (path === '/api/patient-portal-data/lab-results') {
    return mockResponse({ labResults: flattenLabResults(data.healthRecord.labResults || []) });
  }

  if (path === '/api/patient-portal-data/refill-requests') {
    return mockResponse({ success: true });
  }

  if (path === '/api/patient-portal-data/pharmacies/search') {
    return mockResponse(searchDemoPharmacies(params));
  }

  if (path === '/api/patient-portal/billing/balance') return mockResponse(data.billing.balance);
  if (path === '/api/patient-portal/billing/charges') return mockResponse({ charges: data.billing.charges });
  if (path === '/api/patient-portal/billing/statements') return mockResponse({ statements: data.billing.statements });
  if (path.startsWith('/api/patient-portal/billing/statements/')) return mockResponse({ statement: data.billing.statements[0] || {} });
  if (path === '/api/patient-portal/billing/payment-methods') return mockResponse({ paymentMethods: data.billing.paymentMethods });
  if (path === '/api/patient-portal/billing/payment-history') return mockResponse({ payments: data.billing.paymentHistory });
  if (path === '/api/patient-portal/billing/payments') return mockResponse({ success: true, paymentId: 'demo-pay-001' });
  if (path === '/api/patient-portal/billing/payment-plans') return mockResponse({ paymentPlans: [] });
  if (path === '/api/patient-portal/billing/autopay') return mockResponse({ enrolled: false });

  if (path === '/api/patient-portal/me') {
    return mockResponse({ patient: flattenProfile(data.profile) });
  }

  if (path === '/api/patient-portal/security/change-password') {
    return mockResponse({ message: 'Password changed successfully' });
  }

  if (path === '/api/patient-portal/visit-summaries') {
    return mockResponse({ visitSummaries: data.visitSummaries });
  }

  if (path.includes('/api/patient-portal/intake')) {
    return mockResponse({ forms: [], consents: [], history: [], required: [] });
  }

  if (path.includes('/api/patient-portal/checkin')) {
    return mockResponse({ session: null });
  }

  return null;
}

export function installDemoFetchInterceptor() {
  if (!isLocalDemoEnabled() || typeof window === 'undefined') return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : input.toString();

    if (!url.includes('/api/')) {
      return originalFetch(input, init);
    }

    let path: string;
    try {
      path = new URL(url, window.location.origin).pathname;
    } catch {
      path = url.split('?')[0];
    }

    const params = getParams(url);
    const headers: Record<string, string> = {};

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => { headers[key] = value; });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => { headers[key] = value; });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    if (input instanceof Request) {
      input.headers.forEach((value, key) => { headers[key] = value; });
    }

    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const body = parseRequestBody(init);

    if (isPortalDemoMode()) {
      const email = getPortalPatientEmail();
      const response = handlePortalRoute(path, params, email, method, body);
      if (response) return response;
    }

    if (isOfficeDemoMode(headers)) {
      const response = handleProviderRoute(path, params, method, body);
      if (response) return response;
    }

    return originalFetch(input, init);
  };
}
