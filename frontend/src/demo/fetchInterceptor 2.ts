// ─── Demo Fetch Interceptor ───────────────────────────────────────────────────
// Patches window.fetch to return demo data when running in demo mode.
// Demo mode is detected by the presence of a demo session token.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ALL_PATIENTS, ALL_APPOINTMENTS, ALL_ENCOUNTERS, ALL_VITALS,
  ALL_PRESCRIPTIONS, ALL_ORDERS, ALL_DOCUMENTS,
  PATIENT_ALEX, PATIENT_JANE,
  APPOINTMENTS_ALEX, APPOINTMENTS_JANE,
  ENCOUNTERS_ALEX, ENCOUNTERS_JANE,
  VITALS_ALEX, VITALS_JANE,
  PRESCRIPTIONS_ALEX, PRESCRIPTIONS_JANE,
  ORDERS_ALEX, ORDERS_JANE,
  DOCUMENTS_ALEX, DOCUMENTS_JANE,
  ELIGIBILITY_ALEX, ELIGIBILITY_JANE,
  PORTAL_BILLING_ALEX, PORTAL_BILLING_JANE,
  VISIT_SUMMARIES_ALEX, VISIT_SUMMARIES_JANE,
  HEALTH_RECORD_ALEX, HEALTH_RECORD_JANE,
  PORTAL_PROFILE_ALEX, PORTAL_PROFILE_JANE,
  getDemoDataForPortalUser,
} from './demoData';

// ── Demo mode detection ───────────────────────────────────────────────────────

function isOfficeDemoMode(headers: Record<string, string>): boolean {
  const auth = headers['Authorization'] || headers['authorization'] || '';
  return auth.includes('.demo');
}

function isPortalDemoMode(): boolean {
  return localStorage.getItem('patientPortalToken') === 'demo-portal-token';
}

function getPortalPatientEmail(): string {
  const stored = localStorage.getItem('patientPortalPatient');
  if (!stored) return '';
  try { return JSON.parse(stored).email || ''; } catch { return ''; }
}

// ── Portal data shape transformers ────────────────────────────────────────────

function transformPortalAppointment(apt: Record<string, unknown>) {
  const start = (apt.scheduledStart as string) || '';
  return {
    ...apt,
    appointmentDate: start.split('T')[0] || '',
    appointmentTime: start.split('T')[1]?.slice(0, 5) || '',
    appointmentType: (apt.appointmentTypeName as string) || '',
  };
}

function transformVital(v: Record<string, unknown>) {
  const heightCm = (v.heightCm as number) || 0;
  const weightKg = (v.weightKg as number) || 0;
  const tempC = v.tempC as number;
  const heightIn = Math.round(heightCm / 2.54);
  const weightLbs = Math.round(weightKg * 2.205 * 10) / 10;
  const heightM = heightCm / 100;
  const bmi = heightM > 0 ? Math.round(weightKg / (heightM * heightM) * 10) / 10 : undefined;
  return {
    ...v,
    date: v.recordedAt,
    provider: 'Dr. Sarah Chen',
    bloodPressure: v.bpSystolic && v.bpDiastolic ? `${v.bpSystolic}/${v.bpDiastolic}` : undefined,
    heartRate: v.pulse as number,
    temperature: tempC != null ? Math.round((tempC * 9 / 5 + 32) * 10) / 10 : undefined,
    weight: weightLbs || undefined,
    height: heightIn || undefined,
    bmi,
    oxygenSaturation: v.o2Saturation as number,
  };
}

function flattenLabResults(labs: Array<Record<string, unknown>>) {
  const flat: Record<string, unknown>[] = [];
  for (const lab of (labs || [])) {
    const values = lab.values as Array<Record<string, unknown>> || [];
    for (const v of values) {
      flat.push({
        id: `${lab.id}-${String(v.name).replace(/\s+/g, '-').toLowerCase()}`,
        observationDate: lab.resultDate,
        testName: v.name,
        value: v.value,
        unit: v.unit,
        referenceRange: v.referenceRange,
        abnormalFlag: v.flag === 'normal' ? '' : (v.flag || ''),
        status: lab.status,
      });
    }
  }
  return flat;
}

function flattenProfile(p: Record<string, unknown>) {
  if (!p) return p;
  const ec = p.emergencyContact as Record<string, string> | undefined;
  const pharmacy = p.pharmacy as Record<string, string> | undefined;
  return {
    ...p,
    emergencyContactName: ec?.name || '',
    emergencyContactRelationship: ec?.relationship || '',
    emergencyContactPhone: ec?.phone || '',
    preferredPharmacy: pharmacy?.name || '',
    dob: p.dateOfBirth,
    gender: p.sex === 'M' ? 'Male' : p.sex === 'F' ? 'Female' : '',
    portalEmail: p.email,
    emailVerified: true,
    lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    passwordUpdatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

// ── Mock response builder ─────────────────────────────────────────────────────

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── URL param helpers ─────────────────────────────────────────────────────────

function getParams(url: string): URLSearchParams {
  try { return new URL(url, window.location.origin).searchParams; } catch { return new URLSearchParams(); }
}

function filterByPatient<T extends { patientId: string }>(items: T[], params: URLSearchParams): T[] {
  const pid = params.get('patientId');
  return pid ? items.filter(i => i.patientId === pid) : items;
}

// ── Provider-side route handlers ──────────────────────────────────────────────

function handleProviderRoute(path: string, params: URLSearchParams, _method: string): Response | null {

  // Patient list
  if (path === '/api/patients') {
    return mockResponse({ data: ALL_PATIENTS, patients: ALL_PATIENTS, meta: { total: ALL_PATIENTS.length, page: 1, limit: 100, totalPages: 1, hasNext: false, hasPrev: false } });
  }

  // Patient detail
  if (path === '/api/patients/demo-patient-1') return mockResponse(PATIENT_ALEX);
  if (path === '/api/patients/demo-patient-2') return mockResponse(PATIENT_JANE);

  // Appointments
  if (path === '/api/appointments') {
    const pid = params.get('patientId');
    let appts = pid === 'demo-patient-1' ? APPOINTMENTS_ALEX
               : pid === 'demo-patient-2' ? APPOINTMENTS_JANE
               : ALL_APPOINTMENTS;
    return mockResponse({ data: appts });
  }

  // Encounters
  if (path === '/api/encounters') {
    const pid = params.get('patientId');
    let encs = pid === 'demo-patient-1' ? ENCOUNTERS_ALEX
              : pid === 'demo-patient-2' ? ENCOUNTERS_JANE
              : ALL_ENCOUNTERS;
    return mockResponse({ data: encs });
  }

  // Vitals
  if (path === '/api/vitals') {
    const pid = params.get('patientId');
    let vits = pid === 'demo-patient-1' ? VITALS_ALEX
              : pid === 'demo-patient-2' ? VITALS_JANE
              : ALL_VITALS;
    return mockResponse({ data: vits });
  }

  // Prescriptions
  if (path === '/api/prescriptions') {
    const pid = params.get('patientId');
    let rxs = pid === 'demo-patient-1' ? PRESCRIPTIONS_ALEX
             : pid === 'demo-patient-2' ? PRESCRIPTIONS_JANE
             : ALL_PRESCRIPTIONS;
    return mockResponse({ prescriptions: rxs, data: rxs });
  }

  // Orders
  if (path === '/api/orders') {
    const pid = params.get('patientId');
    let ords = pid === 'demo-patient-1' ? ORDERS_ALEX
              : pid === 'demo-patient-2' ? ORDERS_JANE
              : ALL_ORDERS;
    return mockResponse({ data: ords });
  }

  // Documents
  if (path === '/api/documents') {
    const pid = params.get('patientId');
    let docs = pid === 'demo-patient-1' ? DOCUMENTS_ALEX
              : pid === 'demo-patient-2' ? DOCUMENTS_JANE
              : ALL_DOCUMENTS;
    return mockResponse({ data: docs });
  }

  // Eligibility history
  if (path === '/api/eligibility/history/demo-patient-1') return mockResponse(ELIGIBILITY_ALEX);
  if (path === '/api/eligibility/history/demo-patient-2') return mockResponse(ELIGIBILITY_JANE);
  if (path.startsWith('/api/eligibility/verify/')) return mockResponse({ status: 'Active', message: 'Demo eligibility verified' });

  // Photos (empty)
  if (path === '/api/photos' || path.includes('/api/photos/')) {
    return mockResponse({ data: [] });
  }

  // Schedule
  if (path === '/api/schedule' || path.startsWith('/api/schedule')) {
    return mockResponse({ data: ALL_APPOINTMENTS });
  }

  // Financial metrics
  if (path === '/api/financial-metrics/dashboard') {
    return mockResponse({
      snapshots: {
        daily: {
          key: 'daily', label: 'Today', rangeLabel: 'Apr 18, 2026',
          completedAppointments: 4, totalRevenueCents: 182000, collectionsCents: 156000,
          avgRevenuePerVisitCents: 39000, collectionRate: 85.7,
          benchmarkVisitsCount: 5, standaloneRevenueCents: 24000,
          revenueCategories: [
            { key: 'office_visit', label: 'Office Visits', revenueCents: 122000, itemCount: 4 },
            { key: 'procedure', label: 'Procedures', revenueCents: 60000, itemCount: 2 },
          ],
        },
        weekly: {
          key: 'weekly', label: 'This Week', rangeLabel: 'Apr 14–18, 2026',
          completedAppointments: 18, totalRevenueCents: 824000, collectionsCents: 712000,
          avgRevenuePerVisitCents: 39600, collectionRate: 86.4,
          benchmarkVisitsCount: 20, standaloneRevenueCents: 112000,
          revenueCategories: [
            { key: 'office_visit', label: 'Office Visits', revenueCents: 534000, itemCount: 18 },
            { key: 'procedure', label: 'Procedures', revenueCents: 290000, itemCount: 8 },
          ],
        },
        monthly: {
          key: 'monthly', label: 'This Month', rangeLabel: 'April 2026',
          completedAppointments: 67, totalRevenueCents: 3180000, collectionsCents: 2720000,
          avgRevenuePerVisitCents: 40600, collectionRate: 85.5,
          benchmarkVisitsCount: 80, standaloneRevenueCents: 460000,
          revenueCategories: [
            { key: 'office_visit', label: 'Office Visits', revenueCents: 1940000, itemCount: 67 },
            { key: 'procedure', label: 'Procedures', revenueCents: 940000, itemCount: 24 },
            { key: 'mohs', label: 'Mohs Surgery', revenueCents: 300000, itemCount: 2 },
          ],
        },
      },
    });
  }

  if (path === '/api/financial-metrics/collections-trend') {
    const data = [
      { bucketStartDate: '2026-01-01', revenueEarnedCents: 2940000, paymentsCollectedCents: 2510000, patientPaymentsCents: 380000, payerPaymentsCents: 2130000, billCount: 72, paymentCount: 68, revenueCategories: [] },
      { bucketStartDate: '2026-02-01', revenueEarnedCents: 3120000, paymentsCollectedCents: 2680000, patientPaymentsCents: 420000, payerPaymentsCents: 2260000, billCount: 78, paymentCount: 74, revenueCategories: [] },
      { bucketStartDate: '2026-03-01', revenueEarnedCents: 3050000, paymentsCollectedCents: 2590000, patientPaymentsCents: 410000, payerPaymentsCents: 2180000, billCount: 75, paymentCount: 70, revenueCategories: [] },
      { bucketStartDate: '2026-04-01', revenueEarnedCents: 3180000, paymentsCollectedCents: 2720000, patientPaymentsCents: 450000, payerPaymentsCents: 2270000, billCount: 67, paymentCount: 60, revenueCategories: [] },
    ];
    return mockResponse({ data, summary: { totalPaymentsCollectedCents: 10500000, totalRevenueEarnedCents: 12290000, totalPatientPaymentsCents: 1660000, totalPayerPaymentsCents: 8840000, collectionRate: 85.4, totalPaymentCount: 272, totalBillCount: 292, dayCount: 108, avgDailyPaymentsCollectedCents: 97222 } });
  }

  if (path === '/api/financial-metrics/payments-summary') {
    return mockResponse({
      calculated: { netCollectionRate: 85.4 },
      receivables: { outstandingBalanceCents: 428500, overdueBalanceCents: 184200, overdueCount: 12 },
      payerPaymentsSummary: { appliedCents: 8840000, unappliedCents: 14200 },
      patientPaymentsByMethod: [
        { paymentMethod: 'credit_card', count: 148, totalCents: 1102000 },
        { paymentMethod: 'ach', count: 44, totalCents: 418000 },
        { paymentMethod: 'check', count: 22, totalCents: 140000 },
      ],
    });
  }

  if (path === '/api/financial-metrics/ar-aging') {
    return mockResponse({
      buckets: [
        { key: '0-30', label: '0–30 days', billCount: 38, totalBalanceCents: 184200 },
        { key: '31-60', label: '31–60 days', billCount: 14, totalBalanceCents: 128400 },
        { key: '61-90', label: '61–90 days', billCount: 6, totalBalanceCents: 72600 },
        { key: '91-120', label: '91–120 days', billCount: 3, totalBalanceCents: 28100 },
        { key: '120+', label: '120+ days', billCount: 2, totalBalanceCents: 15200 },
      ],
    });
  }

  if (path === '/api/financial-metrics/bills-summary') {
    return mockResponse({
      billsByStatus: [
        { status: 'paid', count: 212, totalChargesCents: 9840000 },
        { status: 'partial', count: 28, totalChargesCents: 428500 },
        { status: 'outstanding', count: 38, totalChargesCents: 428500 },
        { status: 'pending', count: 14, totalChargesCents: 310000 },
      ],
    });
  }

  // Bills, claims, tasks
  if (path === '/api/bills' || path.startsWith('/api/bills')) return mockResponse({ data: [], meta: {} });
  if (path === '/api/claims' || path.startsWith('/api/claims')) return mockResponse({ data: [] });
  if (path === '/api/tasks') return mockResponse({ data: [] });
  if (path === '/api/reminders') return mockResponse({ data: [] });

  return null;
}

// ── Portal-side route handlers ────────────────────────────────────────────────

function handlePortalRoute(path: string, params: URLSearchParams, email: string): Response | null {
  const d = getDemoDataForPortalUser(email);
  if (!d) return null;

  // Patient portal data endpoints (via patientPortalFetch)
  if (path.includes('/api/patient-portal-data/dashboard')) {
    const upcoming = d.appointments.filter(a => a.status === 'scheduled');
    const unreadMessages = d.profile.email?.includes('jane') ? 1 : 0;
    const currentBalance = Number(d.billing.balance?.currentBalance || 0);
    const preCheckinAvailable = upcoming.length > 0;
    return mockResponse({
      dashboard: {
        upcomingAppointments: upcoming.length,
        nextAppointment: upcoming[0] ? {
          appointmentId: upcoming[0].id,
          appointmentDate: upcoming[0].scheduledStart.split('T')[0],
          appointmentTime: upcoming[0].scheduledStart.split('T')[1]?.slice(0, 5),
          providerName: upcoming[0].providerName,
          appointmentType: upcoming[0].appointmentTypeName,
        } : null,
        newDocuments: d.documents.length,
        newVisits: d.encounters.filter(e => e.status === 'locked').length,
        activePrescriptions: d.prescriptions.filter(rx => rx.status === 'transmitted').length,
        unreadMessages,
        currentBalance,
        preCheckinAvailable,
        nextCheckinAppointment: upcoming[0] ? {
          appointmentId: upcoming[0].id,
          appointmentDate: upcoming[0].scheduledStart.split('T')[0],
          appointmentTime: upcoming[0].scheduledStart.split('T')[1]?.slice(0, 5),
          providerName: upcoming[0].providerName,
          appointmentType: upcoming[0].appointmentTypeName,
        } : null,
        actionNeededCount: d.documents.length + d.encounters.filter(e => e.status === 'locked').length + unreadMessages + (currentBalance > 0 ? 1 : 0) + (preCheckinAvailable ? 1 : 0),
      },
    });
  }

  if (path.includes('/api/patient-portal-data/appointments')) {
    const status = params.get('status') || 'all';
    let appts = d.appointments;
    if (status === 'upcoming') appts = d.appointments.filter(a => a.status === 'scheduled');
    if (status === 'past') appts = d.appointments.filter(a => a.status === 'completed');
    return mockResponse({ appointments: appts.map(a => transformPortalAppointment(a as Record<string, unknown>)) });
  }

  if (path.includes('/api/patient-portal-data/visit-summaries')) {
    return mockResponse({ summaries: d.visitSummaries });
  }

  if (path.includes('/api/patient-portal-data/documents')) {
    return mockResponse({ documents: d.documents });
  }

  if (path.includes('/api/patient-portal-data/allergies')) {
    return mockResponse({ allergies: d.healthRecord.allergies });
  }

  if (path.includes('/api/patient-portal-data/medications')) {
    return mockResponse({ medications: d.healthRecord.medications });
  }

  if (path.includes('/api/patient-portal-data/vitals')) {
    return mockResponse({ vitals: d.healthRecord.vitals.map(v => transformVital(v as Record<string, unknown>)) });
  }

  if (path.includes('/api/patient-portal-data/lab-results')) {
    return mockResponse({ labResults: flattenLabResults(d.healthRecord.labResults as Array<Record<string, unknown>>) });
  }

  if (path.includes('/api/patient-portal-data/refill-requests')) {
    return mockResponse({ success: true });
  }

  // Portal billing endpoints
  if (path === '/api/patient-portal/billing/balance') return mockResponse(d.billing.balance);
  if (path === '/api/patient-portal/billing/charges') return mockResponse({ charges: d.billing.charges });
  if (path === '/api/patient-portal/billing/statements') return mockResponse({ statements: d.billing.statements });
  if (path.startsWith('/api/patient-portal/billing/statements/')) return mockResponse({ statement: d.billing.statements[0] || {} });
  if (path === '/api/patient-portal/billing/payment-methods') return mockResponse({ paymentMethods: d.billing.paymentMethods });
  if (path === '/api/patient-portal/billing/payment-history') return mockResponse({ payments: d.billing.paymentHistory });
  if (path === '/api/patient-portal/billing/payments') return mockResponse({ success: true, paymentId: 'demo-pay-001' });
  if (path === '/api/patient-portal/billing/payment-plans') return mockResponse({ paymentPlans: [] });
  if (path === '/api/patient-portal/billing/autopay') return mockResponse({ enrolled: false });

  // Profile — portalApi.ts fetchPortalProfile expects { patient: ... } with flat emergency contact fields
  if (path === '/api/patient-portal/me') return mockResponse({ patient: flattenProfile(d.profile as Record<string, unknown>) });
  if (path === '/api/patient-portal/security/change-password') return mockResponse({ message: 'Password changed successfully' });

  // Visit summaries
  if (path === '/api/patient-portal/visit-summaries') return mockResponse({ visitSummaries: d.visitSummaries });

  // Intake/consent (return empty but valid)
  if (path.includes('/api/patient-portal/intake')) return mockResponse({ forms: [], consents: [], history: [], required: [] });
  if (path.includes('/api/patient-portal/checkin')) return mockResponse({ session: null });

  return null;
}

// ── Main interceptor ──────────────────────────────────────────────────────────

export function installDemoFetchInterceptor() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();

    // Only intercept /api/ paths
    if (!url.includes('/api/')) {
      return originalFetch(input, init);
    }

    // Extract clean path (strip query string)
    let path: string;
    try {
      const parsed = new URL(url, window.location.origin);
      path = parsed.pathname;
    } catch {
      path = url.split('?')[0];
    }
    const params = getParams(url);

    // Collect request headers
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => { headers[k] = v; });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    // Check input headers too (for Request objects)
    if (input instanceof Request) {
      input.headers.forEach((v, k) => { headers[k] = v; });
    }

    // Portal demo mode
    if (isPortalDemoMode()) {
      const email = getPortalPatientEmail();
      const res = handlePortalRoute(path, params, email);
      if (res) return res;
    }

    // Office demo mode
    if (isOfficeDemoMode(headers)) {
      const res = handleProviderRoute(path, params, init?.method || 'GET');
      if (res) return res;
    }

    // Pass through to real fetch
    return originalFetch(input, init);
  };
}
