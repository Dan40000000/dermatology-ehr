import { test, expect, type Page, type Route } from '@playwright/test';

const demoSession = {
  tenantId: 'tenant-demo',
  accessToken: 'eyJhbGciOiJub25lIn0.eyJleHAiOjk5OTk5OTk5OTksInN1YiI6InBsYXl3cmlnaHQtYWRtaW4iLCJyb2xlIjoiYWRtaW4ifQ.signature',
  refreshToken: 'playwright-refresh',
  user: {
    id: 'user-1',
    email: 'admin@demo.practice',
    fullName: 'Demo Admin',
    role: 'admin',
  },
};

const patients = [
  {
    id: 'demo-patient-1',
    firstName: 'Alex',
    lastName: 'Johnson',
    dateOfBirth: '1982-04-14',
    dob: '1982-04-14',
    mrn: 'MRN-20010',
  },
  {
    id: 'demo-patient-2',
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1975-09-22',
    dob: '1975-09-22',
    mrn: 'MRN-20024',
  },
  {
    id: 'demo-patient-3',
    firstName: 'Marcus',
    lastName: 'Williams',
    dateOfBirth: '1968-02-03',
    dob: '1968-02-03',
    mrn: 'MRN-20031',
  },
  {
    id: 'demo-patient-4',
    firstName: 'Sofia',
    lastName: 'Chen',
    dateOfBirth: '1995-11-30',
    dob: '1995-11-30',
    mrn: 'MRN-20039',
  },
];

const providers = [
  { id: 'demo-provider-1', fullName: 'Dr. David Skin, MD, FAAD' },
  { id: 'demo-provider-2', fullName: 'Riley Johnson, PA-C' },
];

const locations = [{ id: 'demo-location-1', name: 'Main Dermatology Clinic' }];
const appointmentTypes = [{ id: 'type-fu', name: 'Follow-Up Visit', durationMinutes: 30 }];

function makeBiopsies() {
  return [
    {
      id: 'bx-sofia',
      specimen_id: 'BX-20260513-001',
      patient_id: 'demo-patient-4',
      patientId: 'demo-patient-4',
      patient_name: 'Sofia Chen',
      mrn: 'MRN-20039',
      date_of_birth: '1995-11-30',
      patient_phone: '(303) 555-2004',
      patient_email: 'sofia@example.test',
      body_location: 'Left posterior calf',
      location_details: '6 mm irregular pigmented macule',
      specimen_type: 'excisional',
      status: 'resulted',
      clinical_description: 'Rule out melanoma.',
      differential_diagnoses: ['melanoma', 'atypical nevus'],
      ordered_at: '2026-05-13T14:05:00Z',
      sent_at: '2026-05-13T16:00:00Z',
      resulted_at: '2026-05-16T10:20:00Z',
      pathology_diagnosis: 'Melanoma, superficial spreading type, Breslow depth 0.6 mm.',
      pathology_report: 'Melanoma, superficial spreading type, Breslow depth 0.6 mm.',
      pathology_gross_description: 'Skin ellipse.',
      pathology_microscopic_description: 'Atypical melanocytic proliferation.',
      pathology_comment: 'Urgent treatment coordination recommended.',
      malignancy_type: 'melanoma',
      malignancy_subtype: 'superficial spreading',
      margins: 'clear',
      margin_distance_mm: 1,
      breslow_depth_mm: 0.6,
      clark_level: 'III',
      mitotic_rate: 1,
      ulceration: false,
      diagnosis_code: null,
      diagnosis_description: null,
      path_lab: 'DermPath Diagnostics',
      path_lab_case_number: 'DP-2026-001',
      photo_ids: [],
      lesion_id: null,
      ordering_provider_name: 'Dr. David Skin, MD, FAAD',
      follow_up_action: null,
      follow_up_interval: null,
      follow_up_notes: null,
      reexcision_required: false,
      patient_notification_notes: null,
      patient_notified: false,
      turnaround_time_days: 3,
    },
    {
      id: 'bx-marcus',
      specimen_id: 'BX-20260503-001',
      patient_id: 'demo-patient-3',
      patientId: 'demo-patient-3',
      patient_name: 'Marcus Williams',
      mrn: 'MRN-20031',
      date_of_birth: '1968-02-03',
      patient_phone: '(303) 555-2003',
      patient_email: 'marcus@example.test',
      body_location: 'Left upper back',
      location_details: 'Pearl papule',
      specimen_type: 'shave',
      status: 'sent',
      clinical_description: 'Rule out BCC.',
      differential_diagnoses: ['BCC'],
      ordered_at: '2026-05-03T11:10:00Z',
      sent_at: '2026-05-03T15:10:00Z',
      resulted_at: null,
      pathology_diagnosis: null,
      pathology_report: '',
      pathology_gross_description: '',
      pathology_microscopic_description: '',
      pathology_comment: '',
      malignancy_type: null,
      malignancy_subtype: null,
      margins: null,
      margin_distance_mm: null,
      breslow_depth_mm: null,
      clark_level: null,
      mitotic_rate: null,
      ulceration: null,
      diagnosis_code: null,
      diagnosis_description: null,
      path_lab: 'Mountain Pine Pathology Lab',
      path_lab_case_number: '',
      photo_ids: [],
      lesion_id: null,
      ordering_provider_name: 'Dr. David Skin, MD, FAAD',
      follow_up_action: null,
      follow_up_interval: null,
      follow_up_notes: null,
      reexcision_required: false,
      patient_notification_notes: null,
      patient_notified: false,
      turnaround_time_days: null,
    },
    {
      id: 'bx-jane',
      specimen_id: 'BX-20260514-001',
      patient_id: 'demo-patient-2',
      patientId: 'demo-patient-2',
      patient_name: 'Jane Doe',
      mrn: 'MRN-20024',
      date_of_birth: '1975-09-22',
      patient_phone: '(303) 555-2002',
      patient_email: 'jane@example.test',
      body_location: 'Left dorsal hand',
      location_details: 'Scaly papule',
      specimen_type: 'shave',
      status: 'reviewed',
      clinical_description: 'Rule out SCC.',
      differential_diagnoses: ['SCC'],
      ordered_at: '2026-05-14T09:35:00Z',
      sent_at: '2026-05-14T13:30:00Z',
      resulted_at: '2026-05-16T09:30:00Z',
      reviewed_at: '2026-05-16T11:00:00Z',
      pathology_diagnosis: 'Squamous cell carcinoma in situ, transected at base.',
      pathology_report: 'Squamous cell carcinoma in situ, transected at base.',
      pathology_gross_description: '',
      pathology_microscopic_description: '',
      pathology_comment: '',
      malignancy_type: 'SCC',
      malignancy_subtype: 'in situ',
      margins: 'involved',
      margin_distance_mm: null,
      breslow_depth_mm: null,
      clark_level: null,
      mitotic_rate: null,
      ulceration: null,
      diagnosis_code: 'C44.629',
      diagnosis_description: 'Squamous cell carcinoma of skin of left upper limb',
      path_lab: 'Mountain Pine Pathology Lab',
      path_lab_case_number: 'MP-2026-088',
      photo_ids: [],
      lesion_id: null,
      ordering_provider_name: 'Riley Johnson, PA-C',
      follow_up_action: 'none',
      follow_up_interval: null,
      follow_up_notes: null,
      reexcision_required: false,
      patient_notification_notes: 'Notify patient of SCCIS result.',
      patient_notified: false,
      turnaround_time_days: 2,
    },
    {
      id: 'bx-alex',
      specimen_id: 'BX-20260510-001',
      patient_id: 'demo-patient-1',
      patientId: 'demo-patient-1',
      patient_name: 'Alex Johnson',
      mrn: 'MRN-20010',
      date_of_birth: '1982-04-14',
      patient_phone: '(303) 555-2001',
      patient_email: 'alex@example.test',
      body_location: 'Nasal ala',
      location_details: 'Translucent papule',
      specimen_type: 'shave',
      status: 'reviewed',
      clinical_description: 'Rule out BCC.',
      differential_diagnoses: ['BCC'],
      ordered_at: '2026-05-10T13:20:00Z',
      sent_at: '2026-05-10T15:00:00Z',
      resulted_at: '2026-05-13T08:00:00Z',
      reviewed_at: '2026-05-13T10:00:00Z',
      pathology_diagnosis: 'Basal cell carcinoma, nodular type, transected.',
      pathology_report: 'Basal cell carcinoma, nodular type, transected.',
      pathology_gross_description: '',
      pathology_microscopic_description: '',
      pathology_comment: '',
      malignancy_type: 'BCC',
      malignancy_subtype: 'nodular',
      margins: 'involved',
      margin_distance_mm: null,
      breslow_depth_mm: null,
      clark_level: null,
      mitotic_rate: null,
      ulceration: null,
      diagnosis_code: 'C44.311',
      diagnosis_description: 'Basal cell carcinoma of skin of nose',
      path_lab: 'DermPath Diagnostics',
      path_lab_case_number: 'DP-2026-091',
      photo_ids: [],
      lesion_id: null,
      ordering_provider_name: 'Dr. David Skin, MD, FAAD',
      follow_up_action: 'mohs',
      follow_up_interval: null,
      follow_up_notes: 'Schedule Mohs consult.',
      reexcision_required: false,
      reexcision_scheduled_date: null,
      patient_notification_notes: 'Patient notified; schedule Mohs.',
      patient_notified: true,
      turnaround_time_days: 3,
    },
    {
      id: 'bx-closed',
      specimen_id: 'BX-20260308-001',
      patient_id: 'demo-patient-1',
      patientId: 'demo-patient-1',
      patient_name: 'Alex Johnson',
      mrn: 'MRN-20010',
      date_of_birth: '1982-04-14',
      patient_phone: '(303) 555-2001',
      patient_email: 'alex@example.test',
      body_location: 'Right forearm',
      location_details: '',
      specimen_type: 'punch',
      status: 'closed',
      clinical_description: 'Nevus.',
      differential_diagnoses: ['nevus'],
      ordered_at: '2026-03-08T10:45:00Z',
      sent_at: '2026-03-08T12:00:00Z',
      resulted_at: '2026-03-12T09:00:00Z',
      reviewed_at: '2026-03-12T12:00:00Z',
      pathology_diagnosis: 'Benign intradermal nevus.',
      pathology_report: 'Benign intradermal nevus.',
      pathology_gross_description: '',
      pathology_microscopic_description: '',
      pathology_comment: '',
      malignancy_type: null,
      malignancy_subtype: null,
      margins: 'clear',
      margin_distance_mm: null,
      breslow_depth_mm: null,
      clark_level: null,
      mitotic_rate: null,
      ulceration: null,
      diagnosis_code: 'D22.9',
      diagnosis_description: 'Melanocytic nevi, unspecified',
      path_lab: 'Mountain Pine Pathology Lab',
      path_lab_case_number: 'MP-2026-040',
      photo_ids: [],
      lesion_id: null,
      ordering_provider_name: 'Dr. David Skin, MD, FAAD',
      follow_up_action: 'none',
      follow_up_interval: null,
      follow_up_notes: null,
      reexcision_required: false,
      patient_notification_notes: null,
      patient_notified: true,
      turnaround_time_days: 4,
    },
  ];
}

function patientIdFor(biopsy: any) {
  return biopsy.patient_id || biopsy.patientId || '';
}

function isTreatmentAction(action: unknown) {
  return ['reexcision', 'mohs', 'oncology_referral', 'dermatology_followup'].includes(String(action || ''));
}

function decorateBiopsy(biopsy: any) {
  let safety_stage = 'closed';
  let loop_status = 'Closed loop complete';
  let next_action = 'No action needed';
  let highest_severity: string | null = null;
  const safety_flags: any[] = [];

  if (!biopsy.resulted_at && ['sent', 'processing', 'received_by_lab'].includes(biopsy.status)) {
    safety_stage = 'pending_result';
    loop_status = 'Pathology result overdue';
    next_action = 'Call pathology lab and document ETA';
    highest_severity = 'critical';
    safety_flags.push({ id: `${biopsy.id}-overdue`, type: 'result_overdue', severity: 'critical', title: 'Result overdue', message: 'Pathology result is overdue.', action: next_action });
  } else if (biopsy.status === 'resulted' && !biopsy.reviewed_at) {
    safety_stage = 'pending_review';
    loop_status = 'Provider review needed';
    next_action = 'Provider must sign result and treatment plan';
    highest_severity = biopsy.malignancy_type === 'melanoma' ? 'critical' : 'high';
    safety_flags.push({ id: `${biopsy.id}-review`, type: 'pending_review', severity: highest_severity, title: 'Review needed', message: 'Pathology result needs provider review.', action: next_action });
  } else if (biopsy.status === 'reviewed' && !biopsy.patient_notified) {
    safety_stage = 'pending_notification';
    loop_status = 'Patient notification missing';
    next_action = 'Notify patient and document communication';
    highest_severity = biopsy.malignancy_type === 'melanoma' ? 'critical' : 'high';
    safety_flags.push({ id: `${biopsy.id}-notify`, type: 'patient_notification_missing', severity: highest_severity, title: 'Notify patient', message: 'Patient notification is not documented.', action: next_action });
  } else if (
    biopsy.status === 'reviewed' &&
    biopsy.patient_notified &&
    isTreatmentAction(biopsy.follow_up_action) &&
    !biopsy.reexcision_scheduled_date
  ) {
    safety_stage = 'treatment_follow_up';
    loop_status = 'Treatment follow-up not scheduled';
    next_action = 'Schedule treatment or referral follow-up';
    highest_severity = biopsy.malignancy_type === 'melanoma' ? 'critical' : 'high';
    safety_flags.push({ id: `${biopsy.id}-treatment`, type: 'treatment_not_scheduled', severity: highest_severity, title: 'Treatment needed', message: 'Treatment follow-up is not scheduled.', action: next_action });
  }

  return {
    ...biopsy,
    safety_stage,
    loop_status,
    next_action,
    highest_severity,
    safety_flags,
    days_since_sent: biopsy.sent_at && !biopsy.resulted_at ? 13 : null,
    days_since_result: biopsy.resulted_at && !biopsy.reviewed_at ? 1 : null,
  };
}

function buildCommandCenter(biopsies: any[]) {
  const decorated = biopsies.map(decorateBiopsy);
  const queues = {
    critical: decorated.filter((biopsy) => ['critical', 'high'].includes(String(biopsy.highest_severity || ''))),
    pendingResults: decorated.filter((biopsy) => biopsy.safety_stage === 'pending_result'),
    pendingReview: decorated.filter((biopsy) => biopsy.safety_stage === 'pending_review'),
    pendingNotification: decorated.filter((biopsy) => biopsy.safety_stage === 'pending_notification'),
    treatmentFollowUp: decorated.filter((biopsy) => biopsy.safety_stage === 'treatment_follow_up'),
    closed: decorated.filter((biopsy) => biopsy.safety_stage === 'closed'),
  };
  const openLoops = decorated.filter((biopsy) => biopsy.safety_stage !== 'closed');

  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_open_loops: openLoops.length,
      overdue_results: queues.pendingResults.length,
      pending_review: queues.pendingReview.length,
      needs_patient_notification: queues.pendingNotification.length,
      needs_treatment_scheduling: queues.treatmentFollowUp.length,
      open_malignancies: openLoops.filter((biopsy) => biopsy.malignancy_type).length,
      open_melanomas: openLoops.filter((biopsy) => biopsy.malignancy_type === 'melanoma').length,
      closed_loop_complete: queues.closed.length,
      critical_items: queues.critical.filter((biopsy) => biopsy.highest_severity === 'critical').length,
      avg_turnaround_days: 3,
    },
    queues,
    biopsies: decorated,
  };
}

function readRequestJson(route: Route) {
  try {
    return route.request().postDataJSON();
  } catch {
    return {};
  }
}

async function installBiopsyRoutes(page: Page) {
  const biopsyState = makeBiopsies();
  const taskState: any[] = [];
  const appointmentState: any[] = [];

  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
      await route.fallback();
      return;
    }

    if (method === 'POST' && path === '/api/auth/refresh') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tokens: { accessToken: demoSession.accessToken, refreshToken: demoSession.refreshToken }, user: demoSession.user }) });
      return;
    }

    if (method === 'GET' && path === '/api/biopsies/command-center') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildCommandCenter(biopsyState)) });
      return;
    }

    if (method === 'GET' && path === '/api/biopsies/quality-metrics') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_biopsies: biopsyState.length, avg_turnaround_days: 3, within_7_days_percentage: 100 }) });
      return;
    }

    if (method === 'GET' && path === '/api/biopsies/export/log') {
      const rows = ['Specimen ID,Patient Name,Status', ...biopsyState.map((biopsy) => `${biopsy.specimen_id},${biopsy.patient_name},${biopsy.status}`)];
      await route.fulfill({ status: 200, contentType: 'text/csv', body: rows.join('\n') });
      return;
    }

    const biopsyMatch = path.match(/^\/api\/biopsies\/([^/]+)$/);
    if (biopsyMatch && method === 'GET') {
      const biopsy = biopsyState.find((item) => item.id === biopsyMatch[1]);
      await route.fulfill({ status: biopsy ? 200 : 404, contentType: 'application/json', body: JSON.stringify(biopsy || { error: 'Not found' }) });
      return;
    }

    if (biopsyMatch && method === 'PUT') {
      const biopsy = biopsyState.find((item) => item.id === biopsyMatch[1]);
      const body = readRequestJson(route);
      Object.assign(biopsy, body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(biopsy) });
      return;
    }

    const reviewMatch = path.match(/^\/api\/biopsies\/([^/]+)\/review$/);
    if (reviewMatch && method === 'POST') {
      const biopsy = biopsyState.find((item) => item.id === reviewMatch[1]);
      const body = readRequestJson(route);
      Object.assign(biopsy, body, { status: 'reviewed', reviewed_at: new Date().toISOString() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(biopsy) });
      return;
    }

    const notifyMatch = path.match(/^\/api\/biopsies\/([^/]+)\/notify-patient$/);
    if (notifyMatch && method === 'POST') {
      const biopsy = biopsyState.find((item) => item.id === notifyMatch[1]);
      Object.assign(biopsy, { patient_notified: true, patient_notified_at: new Date().toISOString() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(biopsy) });
      return;
    }

    if (method === 'GET' && path === '/api/tasks') {
      const category = url.searchParams.get('category');
      const tasks = category ? taskState.filter((task) => task.category === category) : taskState;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks, data: tasks }) });
      return;
    }

    if (method === 'POST' && path === '/api/tasks') {
      const body = readRequestJson(route);
      const task = {
        id: `task-${taskState.length + 1}`,
        tenantId: 'tenant-demo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'user-1',
        ...body,
      };
      taskState.unshift(task);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: task.id, task }) });
      return;
    }

    if (method === 'GET' && path === '/api/patients') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ patients, data: patients }) });
      return;
    }

    const patientMatch = path.match(/^\/api\/patients\/([^/]+)$/);
    if (patientMatch && method === 'GET') {
      const patient = patients.find((item) => item.id === patientMatch[1]);
      await route.fulfill({ status: patient ? 200 : 404, contentType: 'application/json', body: JSON.stringify({ patient }) });
      return;
    }

    if (method === 'GET' && path === '/api/providers') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers }) });
      return;
    }

    if (method === 'GET' && path === '/api/locations') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ locations }) });
      return;
    }

    if (method === 'GET' && path === '/api/appointment-types') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointmentTypes }) });
      return;
    }

    if (method === 'GET' && path === '/api/appointments') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ appointments: appointmentState }) });
      return;
    }

    if (method === 'POST' && path === '/api/appointments') {
      const body = readRequestJson(route);
      appointmentState.push({ id: `appt-${appointmentState.length + 1}`, ...body });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: `appt-${appointmentState.length}` }) });
      return;
    }

    if (method === 'GET' && path === '/api/availability') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ availability: [] }) });
      return;
    }

    if (method === 'GET' && path === '/api/time-blocks') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }

    if (method === 'GET' && path === '/api/encounters') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ encounters: [] }) });
      return;
    }

    if (method === 'GET' && path === '/api/orders') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders: [] }) });
      return;
    }

    if (method === 'GET' && path === '/api/messaging/unread-count') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.addInitScript((session) => {
    localStorage.setItem('derm_session', JSON.stringify(session));
  }, demoSession);
}

test.describe('Biopsy safety command center', () => {
  test.beforeEach(async ({ page }) => {
    await installBiopsyRoutes(page);
  });

  test('reviews, notifies, tasks, schedules, and exports biopsy safety work', async ({ page }) => {
    await page.goto('/biopsies');

    await expect(page.getByRole('heading', { name: 'Biopsy Safety Command Center' })).toBeVisible();
    await expect(page.locator('.MuiCard-root').filter({ hasText: 'Open Loops' })).toContainText('4');
    await expect(page.locator('table').getByRole('row').filter({ hasText: 'Marcus Williams' })).toHaveCount(1);

    await page.getByPlaceholder('Specimen, patient, MRN, diagnosis, lab...').fill('Marcus');
    await expect(page.locator('table').getByRole('row').filter({ hasText: 'Marcus Williams' })).toHaveCount(1);
    await expect(page.locator('table').getByRole('row').filter({ hasText: 'Sofia Chen' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear Filters' }).click();

    await page.getByRole('tab', { name: /Review/ }).click();
    await expect(page.locator('table').getByRole('row').filter({ hasText: 'Sofia Chen' })).toHaveCount(1);
    await page.locator('table').getByRole('row').filter({ hasText: 'Sofia Chen' }).locator('button').nth(1).click();

    await expect(page.getByRole('heading', { name: 'Biopsy Result Review' })).toBeVisible();
    await page.getByLabel('ICD-10 Diagnosis Code').fill('C43.9');
    await page.getByLabel('Diagnosis Description').fill('Malignant melanoma of skin, unspecified');
    await page.getByLabel('Follow-up Notes').fill('Urgent excision coordination.');
    await page.getByLabel('Patient Notification Template').fill('Reviewed melanoma pathology and next steps.');
    await page.getByRole('button', { name: 'Sign & Close Review' }).click();

    await expect(page.getByRole('heading', { name: 'Notify Patient of Results' })).toBeVisible();
    await page.getByLabel('Notification Notes').fill('Called patient and confirmed treatment follow-up plan.');
    await page.getByRole('button', { name: 'Mark Patient Notified' }).click();

    await expect(page.getByRole('tab', { name: /Review \(0\)/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Treatment \(2\)/ })).toBeVisible();

    await page.getByRole('tab', { name: /Treatment/ }).click();
    await expect(page.locator('table').getByRole('row').filter({ hasText: 'Sofia Chen' })).toHaveCount(1);
    await page.locator('table').getByRole('row').filter({ hasText: 'Sofia Chen' }).locator('button').nth(2).click();

    await page.locator('table').getByRole('row').filter({ hasText: 'Sofia Chen' }).locator('button').nth(3).click();
    await page.waitForURL(/\/schedule/);
    await expect(page.getByRole('heading', { name: 'New Appointment' })).toBeVisible();
    await expect(page.locator('#patient')).toHaveValue('demo-patient-4');
    await expect(page.locator('#notes')).toHaveValue('Biopsy follow-up BX-20260513-001');

    await page.goto('/biopsies');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;
    expect(await download.suggestedFilename()).toMatch(/biopsy-log-/);
  });

  test('home and tasks dashboards surface biopsy safety alerts', async ({ page }) => {
    await page.goto('/home');

    await expect(page.getByText('Pathology Safety Alerts')).toBeVisible();
    await expect(page.getByText('4 open biopsy loops need active follow-up')).toBeVisible();
    await expect(page.getByText('Sofia Chen').first()).toBeVisible();
    await page.getByRole('button', { name: 'Open Biopsy Safety' }).click();
    await expect(page).toHaveURL(/\/biopsies/);

    await page.goto('/tasks');
    await expect(page.getByText('Biopsy Safety Work Queue')).toBeVisible();
    await expect(page.getByText('4 critical/high pathology loops, 4 total open loops')).toBeVisible();

    const safetyQueue = page.getByLabel('Biopsy safety work queue');
    await safetyQueue.getByRole('button', { name: 'Create Task' }).first().click();
    await expect(safetyQueue.getByRole('button', { name: 'Task Exists' }).first()).toBeVisible();

    await safetyQueue.getByRole('button', { name: 'Show Lab/Path Tasks' }).click();
    await expect(page.getByLabel('Category')).toHaveValue('lab-path-followup');
  });
});
