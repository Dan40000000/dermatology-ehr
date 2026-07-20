import { expect, Page, test } from '@playwright/test';

type ClinicRecord = Record<string, any>;

function getClinicIsoDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const DAY = getClinicIsoDate();
const TENANT_ID = 'tenant-demo';
const DAY_START = `${DAY}T08:00:00.000Z`;

const providers = [
  { id: 'provider-day-medical', fullName: 'Dr. Maya Patel, MD', specialty: 'Medical Dermatology', npi: '1111111111' },
  { id: 'provider-day-pa', fullName: 'Riley Johnson, PA-C', specialty: 'General Dermatology', npi: '2222222222' },
  { id: 'provider-day-mohs', fullName: 'Dr. Owen Sinclair, MD', specialty: 'Mohs Surgery', npi: '3333333333' },
  { id: 'provider-day-cosmetic', fullName: 'Sarah Mitchell, PA-C', specialty: 'Cosmetic Dermatology', npi: '4444444444' },
];

const locations = [
  { id: 'loc-main', name: 'Main Clinic' },
  { id: 'loc-mohs', name: 'Mohs Suite' },
  { id: 'loc-cosmetic', name: 'Cosmetic Studio' },
  { id: 'loc-virtual', name: 'Telehealth' },
];

const appointmentTypes = [
  { id: 'type-new', name: 'New Patient Consult', durationMinutes: 40 },
  { id: 'type-skin-check', name: 'Skin Check', durationMinutes: 30 },
  { id: 'type-biopsy', name: 'Lesion Biopsy', durationMinutes: 30 },
  { id: 'type-mohs', name: 'Mohs Surgery', durationMinutes: 90 },
  { id: 'type-cosmetic', name: 'Cosmetic Injectable', durationMinutes: 45 },
  { id: 'type-telehealth', name: 'Telehealth Follow-Up', durationMinutes: 20 },
];

const baselinePatients = [
  { id: 'patient-acne', firstName: 'Avery', lastName: 'Nguyen', dateOfBirth: '2004-02-12', phone: '5551001001', email: 'avery.nguyen@example.test', mrn: 'DAY-001' },
  { id: 'patient-psoriasis', firstName: 'Marcus', lastName: 'Hill', dateOfBirth: '1975-07-22', phone: '5551001002', email: 'marcus.hill@example.test', mrn: 'DAY-002' },
  { id: 'patient-biopsy', firstName: 'Helen', lastName: 'Brooks', dateOfBirth: '1968-04-18', phone: '5551001003', email: 'helen.brooks@example.test', mrn: 'DAY-003' },
  { id: 'patient-mohs', firstName: 'Robert', lastName: 'Castillo', dateOfBirth: '1955-09-02', phone: '5551001004', email: 'robert.castillo@example.test', mrn: 'DAY-004' },
  { id: 'patient-cosmetic', firstName: 'Sofia', lastName: 'Chen', dateOfBirth: '1991-11-12', phone: '5551001005', email: 'sofia.chen@example.test', mrn: 'DAY-005' },
  { id: 'patient-eczema', firstName: 'Noah', lastName: 'Foster', dateOfBirth: '2014-03-09', phone: '5551001006', email: 'noah.foster@example.test', mrn: 'DAY-006' },
  { id: 'patient-rosacea', firstName: 'Dana', lastName: 'Walsh', dateOfBirth: '1983-06-21', phone: '5551001007', email: 'dana.walsh@example.test', mrn: 'DAY-007' },
  { id: 'patient-cancelled', firstName: 'Iris', lastName: 'Stone', dateOfBirth: '1998-01-28', phone: '5551001008', email: 'iris.stone@example.test', mrn: 'DAY-008' },
];

const diagnosisCatalog = [
  { code: 'L70.0', description: 'Acne vulgaris' },
  { code: 'L40.0', description: 'Psoriasis vulgaris' },
  { code: 'D48.5', description: 'Neoplasm of uncertain behavior of skin' },
  { code: 'C44.319', description: 'Basal cell carcinoma of skin of other parts of face' },
  { code: 'Z41.1', description: 'Encounter for cosmetic surgery' },
  { code: 'L20.9', description: 'Atopic dermatitis, unspecified' },
  { code: 'L71.9', description: 'Rosacea, unspecified' },
  { code: 'L23.9', description: 'Allergic contact dermatitis, unspecified' },
  { code: 'L57.0', description: 'Actinic keratosis' },
];

function toCents(dollars: number) {
  return Math.round(dollars * 100);
}

function makeAppointment(
  id: string,
  patientId: string,
  providerId: string,
  appointmentTypeId: string,
  hour: number,
  minute: number,
  status: string,
  locationId = 'loc-main',
): ClinicRecord {
  const start = new Date(`${DAY}T00:00:00.000Z`);
  start.setUTCHours(hour, minute, 0, 0);
  const type = appointmentTypes.find((item) => item.id === appointmentTypeId) || appointmentTypes[0];
  const end = new Date(start.getTime() + Number(type?.durationMinutes || 30) * 60_000);
  const patient = baselinePatients.find((item) => item.id === patientId);
  const provider = providers.find((item) => item.id === providerId);
  const location = locations.find((item) => item.id === locationId);
  return {
    id,
    tenantId: TENANT_ID,
    patientId,
    providerId,
    appointmentTypeId,
    locationId,
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    status,
    notes: `Full-day test ${type?.name || 'visit'}`,
    patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient',
    providerName: provider?.fullName || 'Unknown Provider',
    appointmentTypeName: type?.name || 'Visit',
    locationName: location?.name || 'Main Clinic',
    createdAt: DAY_START,
    updatedAt: DAY_START,
  };
}

function buildClinicDayState() {
  const patients = [...baselinePatients];
  const appointments = [
    makeAppointment('appt-day-001', 'patient-acne', 'provider-day-medical', 'type-new', 8, 0, 'completed'),
    makeAppointment('appt-day-002', 'patient-psoriasis', 'provider-day-pa', 'type-telehealth', 8, 30, 'completed', 'loc-virtual'),
    makeAppointment('appt-day-003', 'patient-biopsy', 'provider-day-medical', 'type-biopsy', 9, 15, 'completed'),
    makeAppointment('appt-day-004', 'patient-mohs', 'provider-day-mohs', 'type-mohs', 10, 0, 'completed', 'loc-mohs'),
    makeAppointment('appt-day-005', 'patient-cosmetic', 'provider-day-cosmetic', 'type-cosmetic', 11, 30, 'completed', 'loc-cosmetic'),
    makeAppointment('appt-day-006', 'patient-eczema', 'provider-day-pa', 'type-skin-check', 13, 0, 'checked_in'),
    makeAppointment('appt-day-007', 'patient-rosacea', 'provider-day-medical', 'type-skin-check', 14, 15, 'no_show'),
    makeAppointment('appt-day-008', 'patient-cancelled', 'provider-day-cosmetic', 'type-cosmetic', 15, 15, 'cancelled', 'loc-cosmetic'),
  ];

  const encounters = appointments
    .filter((appointment) => ['completed', 'checked_in'].includes(appointment.status))
    .map((appointment, index) => ({
      id: `enc-day-${String(index + 1).padStart(3, '0')}`,
      tenantId: TENANT_ID,
      patientId: appointment.patientId,
      providerId: appointment.providerId,
      appointmentId: appointment.id,
      status: appointment.status === 'completed' ? 'completed' : 'draft',
      chiefComplaint: appointment.appointmentTypeName,
      hpi: 'Full-day simulated dermatology visit.',
      ros: 'Focused dermatology review performed.',
      exam: 'Skin exam documented with morphology and location.',
      assessmentPlan: 'Assessment and plan captured for revenue-cycle validation.',
      createdAt: appointment.scheduledStart,
      updatedAt: appointment.scheduledEnd,
      patientName: appointment.patientName,
      providerName: appointment.providerName,
    }));

  const diagnoses = [
    { id: 'dx-day-001', encounterId: 'enc-day-001', patientId: 'patient-acne', icd10Code: 'L70.0', description: 'Acne vulgaris', isPrimary: true },
    { id: 'dx-day-002', encounterId: 'enc-day-002', patientId: 'patient-psoriasis', icd10Code: 'L40.0', description: 'Psoriasis vulgaris', isPrimary: true },
    { id: 'dx-day-003', encounterId: 'enc-day-003', patientId: 'patient-biopsy', icd10Code: 'D48.5', description: 'Neoplasm of uncertain behavior of skin', isPrimary: true },
    { id: 'dx-day-004', encounterId: 'enc-day-004', patientId: 'patient-mohs', icd10Code: 'C44.319', description: 'Basal cell carcinoma of skin of other parts of face', isPrimary: true },
    { id: 'dx-day-005', encounterId: 'enc-day-005', patientId: 'patient-cosmetic', icd10Code: 'Z41.1', description: 'Encounter for cosmetic surgery', isPrimary: true },
    { id: 'dx-day-006', encounterId: 'enc-day-006', patientId: 'patient-eczema', icd10Code: 'L20.9', description: 'Atopic dermatitis, unspecified', isPrimary: true },
  ];

  const prescriptions = [
    { id: 'rx-day-001', tenantId: TENANT_ID, patientId: 'patient-acne', providerId: 'provider-day-medical', providerName: 'Dr. Maya Patel, MD', medicationName: 'Tretinoin 0.025% cream', strength: '0.025%', sig: 'Apply pea-sized amount nightly', quantity: 45, quantityUnit: 'g', refills: 2, status: 'ordered', deliveryMethod: 'electronic', deliveryStatus: 'sent', pharmacyName: 'Demo Pharmacy', indication: 'Acne vulgaris', writtenDate: DAY_START },
    { id: 'rx-day-002', tenantId: TENANT_ID, patientId: 'patient-acne', providerId: 'provider-day-medical', providerName: 'Dr. Maya Patel, MD', medicationName: 'Doxycycline 100mg capsule', strength: '100mg', sig: 'Take one capsule daily with food', quantity: 30, quantityUnit: 'capsules', refills: 1, status: 'ordered', deliveryMethod: 'electronic', deliveryStatus: 'sent', pharmacyName: 'Demo Pharmacy', indication: 'Inflammatory acne', writtenDate: DAY_START },
    { id: 'rx-day-003', tenantId: TENANT_ID, patientId: 'patient-psoriasis', providerId: 'provider-day-pa', providerName: 'Riley Johnson, PA-C', medicationName: 'Clobetasol 0.05% ointment', strength: '0.05%', sig: 'Apply BID to plaques for two weeks', quantity: 60, quantityUnit: 'g', refills: 1, status: 'ordered', deliveryMethod: 'print', deliveryStatus: 'printed', indication: 'Psoriasis vulgaris', writtenDate: DAY_START },
    { id: 'rx-day-004', tenantId: TENANT_ID, patientId: 'patient-eczema', providerId: 'provider-day-pa', providerName: 'Riley Johnson, PA-C', medicationName: 'Triamcinolone 0.1% cream', strength: '0.1%', sig: 'Apply BID for flares', quantity: 80, quantityUnit: 'g', refills: 3, status: 'pending', deliveryMethod: 'manual', deliveryStatus: 'documented', indication: 'Atopic dermatitis', writtenDate: DAY_START },
  ];

  const charges = [
    { id: 'chg-day-001', encounterId: 'enc-day-001', patientId: 'patient-acne', cptCode: '99203', description: 'New patient office visit', quantity: 1, feeCents: toCents(285), billingRoute: 'insurance' },
    { id: 'chg-day-002', encounterId: 'enc-day-002', patientId: 'patient-psoriasis', cptCode: '99442', description: 'Telehealth follow-up', quantity: 1, feeCents: toCents(125), billingRoute: 'insurance' },
    { id: 'chg-day-003', encounterId: 'enc-day-003', patientId: 'patient-biopsy', cptCode: '11102', description: 'Tangential biopsy', quantity: 1, feeCents: toCents(175), billingRoute: 'insurance' },
    { id: 'chg-day-004', encounterId: 'enc-day-004', patientId: 'patient-mohs', cptCode: '17311', description: 'Mohs first stage', quantity: 1, feeCents: toCents(850), billingRoute: 'insurance' },
    { id: 'chg-day-005', encounterId: 'enc-day-005', patientId: 'patient-cosmetic', cptCode: 'J0585', description: 'Cosmetic neurotoxin', quantity: 35, feeCents: toCents(480), billingRoute: 'patient' },
  ];

  const claims = [
    { id: 'claim-day-001', tenantId: TENANT_ID, patientId: 'patient-acne', claimNumber: 'CLM-DAY-001', status: 'submitted', payer: 'Aetna', providerName: 'Dr. Maya Patel, MD', patientFirstName: 'Avery', patientLastName: 'Nguyen', patientName: 'Avery Nguyen', serviceDate: DAY, totalCents: toCents(285), paidAmountCents: 0, payerPaidCents: 0, patientPaidCents: 0, patientResponsibilityCents: toCents(45), balanceCents: toCents(285), createdAt: DAY_START, updatedAt: DAY_START },
    { id: 'claim-day-002', tenantId: TENANT_ID, patientId: 'patient-psoriasis', claimNumber: 'CLM-DAY-002', status: 'accepted', payer: 'Blue Cross', providerName: 'Riley Johnson, PA-C', patientFirstName: 'Marcus', patientLastName: 'Hill', patientName: 'Marcus Hill', serviceDate: DAY, totalCents: toCents(125), paidAmountCents: 0, payerPaidCents: 0, patientPaidCents: 0, patientResponsibilityCents: toCents(25), balanceCents: toCents(125), createdAt: DAY_START, updatedAt: DAY_START },
    { id: 'claim-day-003', tenantId: TENANT_ID, patientId: 'patient-biopsy', claimNumber: 'CLM-DAY-003', status: 'denied', payer: 'United Healthcare', providerName: 'Dr. Maya Patel, MD', patientFirstName: 'Helen', patientLastName: 'Brooks', patientName: 'Helen Brooks', serviceDate: DAY, totalCents: toCents(175), paidAmountCents: 0, payerPaidCents: 0, patientPaidCents: 0, patientResponsibilityCents: toCents(35), balanceCents: toCents(175), denialReason: 'Required modifier missing from procedure line', denialCode: 'M76', createdAt: DAY_START, updatedAt: DAY_START },
    { id: 'claim-day-004', tenantId: TENANT_ID, patientId: 'patient-mohs', claimNumber: 'CLM-DAY-004', status: 'paid', payer: 'Medicare', providerName: 'Dr. Owen Sinclair, MD', patientFirstName: 'Robert', patientLastName: 'Castillo', patientName: 'Robert Castillo', serviceDate: DAY, totalCents: toCents(850), paidAmountCents: toCents(610), payerPaidCents: toCents(610), patientPaidCents: 0, patientResponsibilityCents: toCents(110), balanceCents: 0, createdAt: DAY_START, updatedAt: DAY_START },
    { id: 'claim-day-005', tenantId: TENANT_ID, patientId: 'patient-cosmetic', claimNumber: 'CLM-DAY-005', status: 'ready', payer: 'Self-Pay', providerName: 'Sarah Mitchell, PA-C', patientFirstName: 'Sofia', patientLastName: 'Chen', patientName: 'Sofia Chen', serviceDate: DAY, totalCents: toCents(480), paidAmountCents: toCents(480), payerPaidCents: 0, patientPaidCents: toCents(480), patientResponsibilityCents: toCents(480), balanceCents: 0, createdAt: DAY_START, updatedAt: DAY_START },
  ];

  const bills = [
    { id: 'bill-day-001', tenantId: TENANT_ID, patientId: 'patient-acne', patientName: 'Avery Nguyen', claimId: 'claim-day-001', status: 'open', totalChargesCents: toCents(285), outstandingBalanceCents: toCents(45), dueDate: '2026-06-15', createdAt: DAY_START, updatedAt: DAY_START },
    { id: 'bill-day-002', tenantId: TENANT_ID, patientId: 'patient-biopsy', patientName: 'Helen Brooks', claimId: 'claim-day-003', status: 'overdue', totalChargesCents: toCents(175), outstandingBalanceCents: toCents(175), dueDate: '2026-04-15', createdAt: DAY_START, updatedAt: DAY_START },
  ];

  const workQueue = [
    { id: 'fwq-day-denial', patientId: 'patient-biopsy', claimId: 'claim-day-003', issueType: 'claim_denial', severity: 'critical', status: 'open', message: 'Correct missing modifier and resubmit biopsy claim.', errorDetail: 'M76', patientFirstName: 'Helen', patientLastName: 'Brooks', claimNumber: 'CLM-DAY-003', createdAt: DAY_START, updatedAt: DAY_START },
    { id: 'fwq-day-balance', patientId: 'patient-biopsy', billId: 'bill-day-002', issueType: 'overdue_patient_balance', severity: 'warning', status: 'open', message: 'Patient balance needs statement or payment plan review.', errorDetail: '31 days past due', patientFirstName: 'Helen', patientLastName: 'Brooks', billNumber: 'bill-day-002', createdAt: DAY_START, updatedAt: DAY_START },
  ];

  const eras = [
    { id: 'era-day-001', eraNumber: 'ERA-DAY-001', payer: 'Medicare', amountCents: toCents(610), paymentAmountCents: toCents(610), claimCount: 1, claimsPaid: 1, status: 'posted', checkDate: DAY },
    { id: 'era-day-002', eraNumber: 'ERA-DAY-002', payer: 'Aetna', amountCents: toCents(220), paymentAmountCents: toCents(220), claimCount: 1, claimsPaid: 1, status: 'pending', checkDate: DAY },
  ];
  const efts = [
    { id: 'eft-day-001', traceNumber: 'EFT-DAY-001', eftTraceNumber: 'EFT-DAY-001', payer: 'Medicare', amountCents: toCents(610), paymentAmountCents: toCents(610), depositDate: DAY, transactionType: 'CCD+', reconciled: false, varianceCents: 0 },
  ];

  const portalThreads = [
    {
      id: 'portal-day-001',
      patientId: 'patient-biopsy',
      patientName: 'Helen Brooks',
      patientMrn: 'DAY-003',
      subject: 'Portal rash photo review',
      category: 'medical',
      priority: 'urgent',
      status: 'open',
      lastMessagePreview: 'The biopsy site is red and itchy after my visit.',
      lastMessageAt: `${DAY}T17:10:00.000Z`,
      isReadByStaff: false,
    },
  ];
  const portalMessagesByThread: Record<string, ClinicRecord[]> = {
    'portal-day-001': [
      {
        id: 'portal-msg-day-001',
        senderType: 'patient',
        senderName: 'Helen Brooks',
        messageText: 'The biopsy site is red and itchy after my visit.',
        sentAt: `${DAY}T17:10:00.000Z`,
      },
    ],
  };
  const clinicalSmsConversations = [
    {
      patientId: 'patient-eczema',
      patientName: 'Noah Foster',
      patientMrn: 'DAY-006',
      category: 'prescription',
      threadStatus: 'open',
      lastMessagePreview: 'Can we send the triamcinolone to Demo Pharmacy?',
      lastMessageAt: `${DAY}T17:25:00.000Z`,
      unreadCount: 1,
    },
  ];
  const clinicalMailThreads = [
    {
      id: 'mail-day-001',
      subject: 'Pathology callback before close',
      patientId: 'patient-mohs',
      patientFirstName: 'Robert',
      patientLastName: 'Castillo',
      lastMessage: { body: 'Please call patient with Mohs wound-care instructions.' },
      updatedAt: `${DAY}T18:05:00.000Z`,
      unreadCount: 1,
    },
  ];
  const clinicalMailMessagesByThread: Record<string, ClinicRecord[]> = {
    'mail-day-001': [
      {
        id: 'mail-msg-day-001',
        senderFirstName: 'Owen',
        senderLastName: 'Sinclair',
        body: 'Please call patient with Mohs wound-care instructions.',
        createdAt: `${DAY}T18:05:00.000Z`,
      },
    ],
  };
  const tasks = [
    {
      id: 'task-day-001',
      title: 'Call psoriasis patient about labs',
      description: 'Confirm baseline lab timing before biologic start.',
      status: 'todo',
      priority: 'high',
      patientId: 'patient-psoriasis',
      patientFirstName: 'Marcus',
      patientLastName: 'Hill',
      dueDate: DAY,
      createdAt: `${DAY}T13:00:00.000Z`,
    },
  ];
  const refillRequests = [
    {
      id: 'refill-day-001',
      patientId: 'patient-eczema',
      patientFirstName: 'Noah',
      patientLastName: 'Foster',
      medicationName: 'Triamcinolone 0.1% cream',
      pharmacyName: 'Demo Pharmacy',
      status: 'pending',
      requestedDate: `${DAY}T17:30:00.000Z`,
    },
  ];
  const priorAuthRequests = [
    {
      id: 'epa-day-001',
      patientId: 'patient-psoriasis',
      patientName: 'Marcus Hill',
      medicationName: 'Adalimumab',
      payer: 'Blue Cross',
      status: 'needs_info',
      statusReason: 'Upload BSA, failed topical history, and PASI score.',
      priority: 'normal',
      updatedAt: `${DAY}T16:45:00.000Z`,
    },
  ];
  const orders = [
    {
      id: 'order-day-001',
      patientId: 'patient-acne',
      type: 'lab',
      status: 'pending',
      priority: 'stat',
      details: 'Pregnancy test before isotretinoin counseling.',
      providerName: 'Dr. Maya Patel, MD',
      createdAt: `${DAY}T15:40:00.000Z`,
    },
  ];
  const faxes = [
    {
      id: 'fax-day-001',
      subject: 'Outside pathology report',
      fromNumber: '+15551008888',
      pages: 4,
      status: 'received',
      read: false,
      receivedAt: `${DAY}T18:20:00.000Z`,
    },
  ];
  const biopsyCommandCenter = {
    generated_at: `${DAY}T18:30:00.000Z`,
    summary: {
      total_open_loops: 1,
      overdue_results: 0,
      pending_review: 1,
      needs_patient_notification: 0,
      needs_treatment_scheduling: 0,
      open_malignancies: 1,
      open_melanomas: 0,
      closed_loop_complete: 0,
      critical_items: 1,
      avg_turnaround_days: 3,
    },
    queues: {
      critical: [
        {
          id: 'biopsy-day-001',
          specimen_id: 'SP-DAY-003',
          patient_id: 'patient-biopsy',
          patient_name: 'Helen Brooks',
          mrn: 'DAY-003',
          loop_status: 'Needs provider review',
          next_action: 'Review pathology result and notify patient.',
          pathology_diagnosis: 'Superficial basal cell carcinoma',
          body_location: 'Left shoulder',
          highest_severity: 'critical',
          ordered_at: `${DAY}T09:45:00.000Z`,
          resulted_at: `${DAY}T18:00:00.000Z`,
          ordering_provider_name: 'Dr. Maya Patel, MD',
        },
      ],
    },
    biopsies: [],
  };

  return {
    patients,
    appointments,
    encounters,
    diagnoses,
    prescriptions,
    charges,
    claims,
    bills,
    workQueue,
    eras,
    efts,
    portalThreads,
    portalMessagesByThread,
    clinicalSmsConversations,
    clinicalMailThreads,
    clinicalMailMessagesByThread,
    tasks,
    refillRequests,
    priorAuthRequests,
    orders,
    faxes,
    biopsyCommandCenter,
  };
}

function summarizeRevenue(state: ReturnType<typeof buildClinicDayState>) {
  const totalRevenueCents = state.claims.reduce((sum, claim) => sum + Number(claim.totalCents || 0), 0);
  const totalPaymentsCents = state.claims.reduce((sum, claim) => sum + Number(claim.paidAmountCents || claim.payerPaidCents || 0) + Number(claim.patientPaidCents || 0), 0);
  const outstandingBalanceCents = state.claims.reduce((sum, claim) => sum + Number(claim.balanceCents || 0), 0);
  return { totalRevenueCents, totalPaymentsCents, outstandingBalanceCents };
}

function filterByDate(items: ClinicRecord[], key: string, startDate?: string | null, endDate?: string | null) {
  return items.filter((item) => {
    const date = String(item[key] || '').slice(0, 10);
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  });
}

async function fulfillJson(route: any, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installFullDayRoutes(page: Page, state: ReturnType<typeof buildClinicDayState>) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
      await route.continue();
      return;
    }

    const readBody = <T extends ClinicRecord>() => {
      try {
        return request.postDataJSON() as T;
      } catch {
        return {} as T;
      }
    };

    if (path === '/api/auth/me') {
      await fulfillJson(route, {
        user: {
          id: 'user-day-admin',
          email: 'admin@demo.practice',
          fullName: 'Demo Admin',
          role: 'admin',
          roles: ['admin'],
          tenantId: TENANT_ID,
        },
      });
      return;
    }

    if (path === '/api/patient-messages/threads' && method === 'GET') {
      await fulfillJson(route, {
        threads: state.portalThreads.filter((thread) => thread.status !== 'closed' || thread.isReadByStaff === false),
        pagination: { total: state.portalThreads.length, limit: 100, offset: 0, hasMore: false },
      });
      return;
    }

    const portalThreadMatch = path.match(/^\/api\/patient-messages\/threads\/([^/]+)$/);
    if (portalThreadMatch && method === 'GET') {
      const threadId = decodeURIComponent(portalThreadMatch[1]);
      const thread = state.portalThreads.find((item) => item.id === threadId);
      await fulfillJson(route, thread ? {
        thread,
        messages: state.portalMessagesByThread[threadId] || [],
      } : { error: 'Thread not found' }, thread ? 200 : 404);
      return;
    }

    if (portalThreadMatch && method === 'PUT') {
      const threadId = decodeURIComponent(portalThreadMatch[1]);
      const thread = state.portalThreads.find((item) => item.id === threadId);
      if (thread) Object.assign(thread, readBody(), { updatedAt: new Date().toISOString() });
      await fulfillJson(route, { success: Boolean(thread), thread }, thread ? 200 : 404);
      return;
    }

    const portalThreadReadMatch = path.match(/^\/api\/patient-messages\/threads\/([^/]+)\/mark-read$/);
    if (portalThreadReadMatch && method === 'POST') {
      const threadId = decodeURIComponent(portalThreadReadMatch[1]);
      const thread = state.portalThreads.find((item) => item.id === threadId);
      if (thread) thread.isReadByStaff = true;
      await fulfillJson(route, { success: Boolean(thread) }, thread ? 200 : 404);
      return;
    }

    const portalThreadMessageMatch = path.match(/^\/api\/patient-messages\/threads\/([^/]+)\/messages$/);
    if (portalThreadMessageMatch && method === 'POST') {
      const threadId = decodeURIComponent(portalThreadMessageMatch[1]);
      const payload = readBody();
      const message = {
        id: `portal-msg-day-${(state.portalMessagesByThread[threadId] || []).length + 1}`,
        senderType: payload.isInternalNote ? 'staff' : 'staff',
        senderName: payload.isInternalNote ? 'Internal note' : 'Demo Admin',
        messageText: payload.messageText,
        isInternalNote: Boolean(payload.isInternalNote),
        sentAt: new Date().toISOString(),
      };
      state.portalMessagesByThread[threadId] = [...(state.portalMessagesByThread[threadId] || []), message];
      const thread = state.portalThreads.find((item) => item.id === threadId);
      if (thread) {
        thread.lastMessagePreview = payload.messageText;
        thread.lastMessageAt = message.sentAt;
        thread.isReadByStaff = true;
      }
      await fulfillJson(route, { messageId: message.id });
      return;
    }

    if (path === '/api/sms/conversations' && method === 'GET') {
      await fulfillJson(route, { conversations: state.clinicalSmsConversations });
      return;
    }

    const smsReadMatch = path.match(/^\/api\/sms\/conversations\/([^/]+)\/mark-read$/);
    if (smsReadMatch && method === 'PUT') {
      const patientId = decodeURIComponent(smsReadMatch[1]);
      const conversation = state.clinicalSmsConversations.find((item) => item.patientId === patientId);
      if (conversation) conversation.unreadCount = 0;
      await fulfillJson(route, { success: Boolean(conversation) }, conversation ? 200 : 404);
      return;
    }

    if (path === '/api/messaging/threads' && method === 'GET') {
      await fulfillJson(route, { threads: state.clinicalMailThreads.filter((thread) => Number(thread.unreadCount || 0) > 0) });
      return;
    }

    const mailThreadMatch = path.match(/^\/api\/messaging\/threads\/([^/]+)$/);
    if (mailThreadMatch && method === 'GET') {
      const threadId = decodeURIComponent(mailThreadMatch[1]);
      const thread = state.clinicalMailThreads.find((item) => item.id === threadId);
      await fulfillJson(route, thread ? {
        thread,
        messages: state.clinicalMailMessagesByThread[threadId] || [],
      } : { error: 'Thread not found' }, thread ? 200 : 404);
      return;
    }

    const mailMessageMatch = path.match(/^\/api\/messaging\/threads\/([^/]+)\/messages$/);
    if (mailMessageMatch && method === 'POST') {
      const threadId = decodeURIComponent(mailMessageMatch[1]);
      const payload = readBody();
      const message = {
        id: `mail-msg-day-${(state.clinicalMailMessagesByThread[threadId] || []).length + 1}`,
        senderFirstName: 'Demo',
        senderLastName: 'Admin',
        body: payload.body,
        createdAt: new Date().toISOString(),
      };
      state.clinicalMailMessagesByThread[threadId] = [...(state.clinicalMailMessagesByThread[threadId] || []), message];
      await fulfillJson(route, { id: message.id });
      return;
    }

    const mailReadMatch = path.match(/^\/api\/messaging\/threads\/([^/]+)\/read$/);
    if (mailReadMatch && method === 'PUT') {
      const thread = state.clinicalMailThreads.find((item) => item.id === decodeURIComponent(mailReadMatch[1]));
      if (thread) thread.unreadCount = 0;
      await fulfillJson(route, { success: Boolean(thread) }, thread ? 200 : 404);
      return;
    }

    if (path === '/api/tasks' && method === 'GET') {
      await fulfillJson(route, { tasks: state.tasks.filter((task) => !['completed', 'done', 'closed'].includes(String(task.status).toLowerCase())) });
      return;
    }

    if (path === '/api/tasks' && method === 'POST') {
      const payload = readBody();
      const patient = state.patients.find((item) => item.id === payload.patientId);
      const task = {
        id: `task-day-${state.tasks.length + 1}`,
        ...payload,
        patientFirstName: patient?.firstName,
        patientLastName: patient?.lastName,
        createdAt: new Date().toISOString(),
      };
      state.tasks.push(task);
      await fulfillJson(route, { task, id: task.id }, 201);
      return;
    }

    const taskStatusMatch = path.match(/^\/api\/tasks\/([^/]+)\/status$/);
    if (taskStatusMatch && method === 'PUT') {
      const task = state.tasks.find((item) => item.id === decodeURIComponent(taskStatusMatch[1]));
      if (task) task.status = readBody().status || task.status;
      await fulfillJson(route, { success: Boolean(task), task }, task ? 200 : 404);
      return;
    }

    if (path === '/api/biopsies/command-center' && method === 'GET') {
      await fulfillJson(route, state.biopsyCommandCenter);
      return;
    }

    if (path === '/api/fax/inbox' && method === 'GET') {
      await fulfillJson(route, { faxes: state.faxes.filter((fax) => fax.read === false || !fax.patientId) });
      return;
    }

    const faxUpdateMatch = path.match(/^\/api\/fax\/([^/]+)$/);
    if (faxUpdateMatch && method === 'PATCH') {
      const fax = state.faxes.find((item) => item.id === decodeURIComponent(faxUpdateMatch[1]));
      if (fax) Object.assign(fax, readBody());
      await fulfillJson(route, { success: Boolean(fax), fax }, fax ? 200 : 404);
      return;
    }

    if (path === '/api/patients' && method === 'GET') {
      const search = (url.searchParams.get('search') || url.searchParams.get('q') || '').toLowerCase();
      const patients = search
        ? state.patients.filter((patient) => `${patient.firstName} ${patient.lastName} ${patient.email} ${patient.mrn}`.toLowerCase().includes(search))
        : state.patients;
      await fulfillJson(route, {
        patients,
        data: patients,
        meta: { page: 1, limit: 100, total: patients.length, totalPages: 1, hasNext: false, hasPrev: false },
      });
      return;
    }

    if (path === '/api/patients' && method === 'POST') {
      const payload = readBody();
      const patient = {
        id: `patient-day-new-${state.patients.length + 1}`,
        tenantId: TENANT_ID,
        firstName: payload.firstName || 'Jordan',
        lastName: payload.lastName || 'Taylor',
        dateOfBirth: payload.dateOfBirth || '1994-05-12',
        phone: payload.phone || '5551001999',
        email: payload.email || `jordan.taylor.${Date.now()}@example.test`,
        mrn: `DAY-${String(state.patients.length + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString(),
      };
      state.patients.push(patient);
      await fulfillJson(route, { patient, id: patient.id }, 201);
      return;
    }

    const patientMatch = path.match(/^\/api\/patients\/([^/]+)$/);
    if (patientMatch && method === 'GET') {
      const patient = state.patients.find((item) => item.id === patientMatch[1]);
      await fulfillJson(route, patient ? {
        patient,
        diagnoses: state.diagnoses.filter((item) => item.patientId === patient.id),
        prescriptions: state.prescriptions.filter((item) => item.patientId === patient.id),
        appointments: state.appointments.filter((item) => item.patientId === patient.id),
      } : { error: 'Patient not found' }, patient ? 200 : 404);
      return;
    }

    if (path === '/api/providers') {
      await fulfillJson(route, { providers });
      return;
    }
    if (path === '/api/locations') {
      await fulfillJson(route, { locations });
      return;
    }
    if (path === '/api/appointment-types') {
      await fulfillJson(route, { appointmentTypes });
      return;
    }
    if (path === '/api/availability' || path === '/api/time-blocks') {
      await fulfillJson(route, path === '/api/time-blocks' ? [] : { availability: [] });
      return;
    }
    if (path === '/api/front-desk/today') {
      await fulfillJson(route, { appointments: state.appointments.map((appointment) => ({ ...appointment, copayAmount: 25, outstandingBalance: appointment.patientId === 'patient-biopsy' ? 175 : 0 })) });
      return;
    }
    if (path === '/api/prior-auth-requests' && method === 'GET') {
      await fulfillJson(route, { data: state.priorAuthRequests, priorAuths: state.priorAuthRequests });
      return;
    }

    if (path === '/api/appointments' && method === 'GET') {
      const appointments = filterByDate(state.appointments, 'scheduledStart', url.searchParams.get('startDate') || url.searchParams.get('date'), url.searchParams.get('endDate') || url.searchParams.get('date'));
      await fulfillJson(route, { appointments, data: appointments });
      return;
    }

    if (path === '/api/appointments' && method === 'POST') {
      const payload = readBody();
      const patient = state.patients.find((item) => item.id === payload.patientId) || state.patients[0];
      const provider = providers.find((item) => item.id === payload.providerId) || providers[0];
      const type = appointmentTypes.find((item) => item.id === payload.appointmentTypeId) || appointmentTypes[0];
      const start = payload.scheduledStart || `${DAY}T16:00:00.000Z`;
      const end = payload.scheduledEnd || new Date(new Date(start).getTime() + Number(type?.durationMinutes || 30) * 60_000).toISOString();
      const appointment = {
        id: `appt-day-new-${state.appointments.length + 1}`,
        tenantId: TENANT_ID,
        patientId: patient?.id,
        providerId: provider?.id,
        appointmentTypeId: type?.id,
        locationId: payload.locationId || 'loc-main',
        scheduledStart: start,
        scheduledEnd: end,
        status: 'scheduled',
        patientName: `${patient?.firstName} ${patient?.lastName}`,
        providerName: provider?.fullName,
        appointmentTypeName: type?.name,
        locationName: locations.find((item) => item.id === (payload.locationId || 'loc-main'))?.name || 'Main Clinic',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.appointments.push(appointment);
      await fulfillJson(route, { appointment, id: appointment.id }, 201);
      return;
    }

    if (path === '/api/encounters' && method === 'GET') {
      await fulfillJson(route, { encounters: state.encounters });
      return;
    }

    if (path === '/api/encounters' && method === 'POST') {
      const payload = readBody();
      const patient = state.patients.find((item) => item.id === payload.patientId) || state.patients[0];
      const provider = providers.find((item) => item.id === payload.providerId) || providers[0];
      const encounter = {
        id: `enc-day-new-${state.encounters.length + 1}`,
        tenantId: TENANT_ID,
        patientId: patient?.id,
        providerId: provider?.id,
        appointmentId: payload.appointmentId,
        status: 'draft',
        chiefComplaint: payload.chiefComplaint || 'New patient rash evaluation',
        hpi: '',
        ros: '',
        exam: '',
        assessmentPlan: '',
        patientName: `${patient?.firstName} ${patient?.lastName}`,
        providerName: provider?.fullName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.encounters.push(encounter);
      await fulfillJson(route, { encounter, id: encounter.id }, 201);
      return;
    }

    const encounterMatch = path.match(/^\/api\/encounters\/([^/]+)$/);
    if (encounterMatch && method === 'POST') {
      const payload = readBody();
      const encounter = state.encounters.find((item) => item.id === encounterMatch[1]);
      if (encounter) Object.assign(encounter, payload, { updatedAt: new Date().toISOString() });
      await fulfillJson(route, { ok: true, encounter });
      return;
    }

    const encounterCompleteMatch = path.match(/^\/api\/encounters\/([^/]+)\/complete$/);
    if (encounterCompleteMatch && method === 'POST') {
      const encounter = state.encounters.find((item) => item.id === encounterCompleteMatch[1]);
      if (encounter) {
        encounter.status = 'completed';
        encounter.updatedAt = new Date().toISOString();
        const claim = {
          id: `claim-day-new-${state.claims.length + 1}`,
          tenantId: TENANT_ID,
          patientId: encounter.patientId,
          claimNumber: `CLM-DAY-${String(state.claims.length + 1).padStart(3, '0')}`,
          status: 'ready',
          payer: 'Aetna',
          providerName: encounter.providerName,
          patientName: encounter.patientName,
          patientFirstName: String(encounter.patientName || '').split(' ')[0],
          patientLastName: String(encounter.patientName || '').split(' ').slice(1).join(' '),
          serviceDate: DAY,
          totalCents: toCents(285),
          paidAmountCents: 0,
          payerPaidCents: 0,
          patientPaidCents: 0,
          patientResponsibilityCents: toCents(45),
          balanceCents: toCents(285),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.claims.push(claim);
      }
      await fulfillJson(route, { encounterId: encounterCompleteMatch[1], message: 'Encounter completed and charges generated' });
      return;
    }

    if (path === '/api/diagnoses' && method === 'POST') {
      const payload = readBody();
      const diagnosis = {
        id: `dx-day-new-${state.diagnoses.length + 1}`,
        tenantId: TENANT_ID,
        encounterId: payload.encounterId,
        patientId: payload.patientId,
        icd10Code: payload.icd10Code || 'L23.9',
        description: payload.description || 'Allergic contact dermatitis, unspecified',
        isPrimary: payload.isPrimary !== false,
      };
      state.diagnoses.push(diagnosis);
      await fulfillJson(route, { diagnosis, id: diagnosis.id }, 201);
      return;
    }

    const encounterDiagnosesMatch = path.match(/^\/api\/diagnoses\/encounter\/([^/]+)$/);
    if (encounterDiagnosesMatch && method === 'GET') {
      await fulfillJson(route, { diagnoses: state.diagnoses.filter((item) => item.encounterId === encounterDiagnosesMatch[1]) });
      return;
    }

    if (path === '/api/diagnoses/search/icd10') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      await fulfillJson(route, { results: diagnosisCatalog.filter((item) => `${item.code} ${item.description}`.toLowerCase().includes(q)).slice(0, 10) });
      return;
    }

    if (path === '/api/charges' && method === 'POST') {
      const payload = readBody();
      const charge = {
        id: `chg-day-new-${state.charges.length + 1}`,
        tenantId: TENANT_ID,
        encounterId: payload.encounterId,
        patientId: payload.patientId,
        cptCode: payload.cptCode || '99203',
        description: payload.description || 'New patient office visit',
        quantity: payload.quantity || 1,
        feeCents: Number(payload.feeCents || toCents(285)),
        billingRoute: payload.billingRoute || 'insurance',
      };
      state.charges.push(charge);
      await fulfillJson(route, { charge, id: charge.id }, 201);
      return;
    }

    const encounterChargesMatch = path.match(/^\/api\/charges\/encounter\/([^/]+)$/);
    if (encounterChargesMatch && method === 'GET') {
      await fulfillJson(route, { charges: state.charges.filter((item) => item.encounterId === encounterChargesMatch[1]) });
      return;
    }

    if (path === '/api/charges/search/cpt') {
      await fulfillJson(route, { results: [
        { code: '99203', description: 'New patient office visit', feeCents: toCents(285) },
        { code: '99213', description: 'Established patient office visit', feeCents: toCents(150) },
        { code: '11102', description: 'Tangential biopsy', feeCents: toCents(175) },
      ] });
      return;
    }

    if (path === '/api/prescriptions' && method === 'GET') {
      const patientId = url.searchParams.get('patientId');
      const prescriptions = patientId ? state.prescriptions.filter((rx) => rx.patientId === patientId) : state.prescriptions;
      await fulfillJson(route, { prescriptions, data: prescriptions });
      return;
    }

    if (path === '/api/prescriptions' && method === 'POST') {
      const payload = readBody();
      const provider = providers.find((item) => item.id === payload.providerId) || providers[0];
      const prescription = {
        id: `rx-day-new-${state.prescriptions.length + 1}`,
        tenantId: TENANT_ID,
        providerId: provider?.id,
        providerName: provider?.fullName,
        status: 'ordered',
        deliveryMethod: payload.deliveryMethod || 'electronic',
        deliveryStatus: payload.deliveryMethod === 'print' ? 'printed' : payload.deliveryMethod === 'manual' ? 'documented' : 'sent',
        writtenDate: new Date().toISOString(),
        ...payload,
      };
      state.prescriptions.unshift(prescription);
      await fulfillJson(route, { prescription, id: prescription.id }, 201);
      return;
    }

    const refillApproveMatch = path.match(/^\/api\/refill-requests\/([^/]+)\/approve$/);
    if (refillApproveMatch && method === 'POST') {
      const requestId = decodeURIComponent(refillApproveMatch[1]);
      const refill = state.refillRequests.find((item) => item.id === requestId);
      if (refill) {
        refill.status = 'approved';
        state.prescriptions.unshift({
          id: `rx-day-refill-${state.prescriptions.length + 1}`,
          tenantId: TENANT_ID,
          patientId: refill.patientId,
          providerId: 'provider-day-pa',
          providerName: 'Riley Johnson, PA-C',
          medicationName: refill.medicationName,
          status: 'ordered',
          deliveryMethod: 'electronic',
          deliveryStatus: 'sent',
          pharmacyName: refill.pharmacyName,
          writtenDate: new Date().toISOString(),
        });
      }
      await fulfillJson(route, { success: Boolean(refill), message: 'Approved', newPrescriptionId: refill ? state.prescriptions[0].id : undefined }, refill ? 200 : 404);
      return;
    }

    if (path === '/api/prescriptions/refill-requests' || path === '/api/refill-requests') {
      await fulfillJson(route, { refillRequests: state.refillRequests.filter((item) => item.status === 'pending') });
      return;
    }

    const orderStatusMatch = path.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (orderStatusMatch && method === 'POST') {
      const order = state.orders.find((item) => item.id === decodeURIComponent(orderStatusMatch[1]));
      if (order) order.status = readBody().status || order.status;
      await fulfillJson(route, { success: Boolean(order), order }, order ? 200 : 404);
      return;
    }

    if (path === '/api/orders') {
      await fulfillJson(route, { orders: state.orders.filter((order) => !['completed', 'closed', 'cancelled'].includes(String(order.status).toLowerCase())), data: state.orders });
      return;
    }

    if (path === '/api/claims/metrics') {
      const denied = state.claims.filter((claim) => ['denied', 'rejected'].includes(claim.status)).length;
      await fulfillJson(route, {
        totalClaims: state.claims.length,
        totalBilledCents: state.claims.reduce((sum, claim) => sum + claim.totalCents, 0),
        totalOutstandingCents: state.claims.reduce((sum, claim) => sum + claim.balanceCents, 0),
        pendingCount: state.claims.filter((claim) => ['submitted', 'accepted', 'ready'].includes(claim.status)).length,
        denialCount: denied,
        firstPassPaidRate: 80,
        denialRate: Number(((denied / Math.max(1, state.claims.length)) * 100).toFixed(1)),
      });
      return;
    }

    if (path === '/api/claims' && method === 'GET') {
      const status = url.searchParams.get('status');
      const claims = status ? state.claims.filter((claim) => claim.status === status) : state.claims;
      await fulfillJson(route, { claims });
      return;
    }

    const claimPaymentMatch = path.match(/^\/api\/claims\/([^/]+)\/payments$/);
    if (claimPaymentMatch && method === 'POST') {
      const payload = readBody();
      const claim = state.claims.find((item) => item.id === claimPaymentMatch[1]);
      if (claim) {
        const amount = Number(payload.amountCents || 0);
        claim.paidAmountCents += amount;
        claim.balanceCents = Math.max(0, claim.balanceCents - amount);
        if (claim.balanceCents === 0) claim.status = 'paid';
      }
      await fulfillJson(route, { success: true, claim });
      return;
    }

    const claimDetailMatch = path.match(/^\/api\/claims\/([^/]+)$/);
    if (claimDetailMatch && method === 'GET') {
      const claim = state.claims.find((item) => item.id === claimDetailMatch[1]);
      await fulfillJson(route, claim ? {
        claim,
        diagnoses: state.diagnoses.filter((item) => item.patientId === claim.patientId),
        charges: state.charges.filter((item) => item.patientId === claim.patientId),
        payments: [],
        statusHistory: [{ id: `hist-${claim.id}`, status: claim.status, changedAt: claim.updatedAt }],
      } : { error: 'Claim not found' }, claim ? 200 : 404);
      return;
    }

    if (path === '/api/financial-metrics/dashboard') {
      const revenue = summarizeRevenue(state);
      await fulfillJson(route, {
        snapshots: {
          daily: { key: 'daily', label: 'Daily Snapshot', rangeLabel: DAY, completedAppointments: state.appointments.filter((a) => a.status === 'completed').length, totalRevenueCents: revenue.totalRevenueCents, collectionsCents: revenue.totalPaymentsCents, avgRevenuePerVisitCents: Math.round(revenue.totalRevenueCents / 5), collectionRate: 57.8, benchmarkVisitsCount: 0, revenueCategories: [{ key: 'em', label: 'E/M', revenueCents: toCents(410), itemCount: 2 }, { key: 'procedure', label: 'Procedure', revenueCents: toCents(1025), itemCount: 2 }, { key: 'cosmetic', label: 'Cosmetic', revenueCents: toCents(480), itemCount: 1 }] },
          weekly: { key: 'weekly', label: 'Weekly Snapshot', rangeLabel: 'This week', completedAppointments: 5, totalRevenueCents: revenue.totalRevenueCents, collectionsCents: revenue.totalPaymentsCents, avgRevenuePerVisitCents: Math.round(revenue.totalRevenueCents / 5), collectionRate: 57.8, benchmarkVisitsCount: 0, revenueCategories: [] },
          monthly: { key: 'monthly', label: 'Monthly Snapshot', rangeLabel: 'Month to date', completedAppointments: 5, totalRevenueCents: revenue.totalRevenueCents, collectionsCents: revenue.totalPaymentsCents, avgRevenuePerVisitCents: Math.round(revenue.totalRevenueCents / 5), collectionRate: 57.8, benchmarkVisitsCount: 0, revenueCategories: [] },
          sourceNote: 'Full-day e2e simulated data from schedule, encounters, prescriptions, claims, bills, ERA, and EFT state.',
        },
      });
      return;
    }

    if (path === '/api/financial-metrics/collections-trend') {
      const revenue = summarizeRevenue(state);
      await fulfillJson(route, {
        data: [{ bucketStartDate: DAY, revenueEarnedCents: revenue.totalRevenueCents, paymentsCollectedCents: revenue.totalPaymentsCents, patientPaymentsCents: toCents(480), payerPaymentsCents: toCents(610), billCount: state.bills.length, paymentCount: 2 }],
        summary: { totalPaymentsCollectedCents: revenue.totalPaymentsCents, totalRevenueEarnedCents: revenue.totalRevenueCents, totalPatientPaymentsCents: toCents(480), totalPayerPaymentsCents: toCents(610), totalPaymentCount: 2, totalBillCount: state.bills.length, dayCount: 1, avgDailyPaymentsCollectedCents: revenue.totalPaymentsCents, avgDailyRevenueEarnedCents: revenue.totalRevenueCents, collectionRate: 57.8, revenueCategories: [] },
      });
      return;
    }

    if (path === '/api/financial-metrics/payments-summary') {
      const revenue = summarizeRevenue(state);
      await fulfillJson(route, {
        calculated: { netCollectionRate: 57.8 },
        receivables: { outstandingBalanceCents: revenue.outstandingBalanceCents, overdueBalanceCents: toCents(175), overdueCount: 1 },
        payerPaymentsSummary: { appliedCents: toCents(610), unappliedCents: 0 },
        patientPaymentsByMethod: [{ paymentMethod: 'card', count: 1, totalCents: toCents(480) }],
      });
      return;
    }

    if (path === '/api/financial-metrics/ar-aging') {
      await fulfillJson(route, { buckets: [{ key: '0-30', label: '0-30 days', billCount: 1, totalBalanceCents: toCents(45) }, { key: '31-60', label: '31-60 days', billCount: 1, totalBalanceCents: toCents(175) }] });
      return;
    }

    if (path === '/api/financial-metrics/bills-summary') {
      await fulfillJson(route, { billsByStatus: [{ status: 'open', count: 1, totalChargesCents: toCents(285) }, { status: 'overdue', count: 1, totalChargesCents: toCents(175) }] });
      return;
    }

    if (path === '/api/bills/work-queue' && method === 'GET') {
      await fulfillJson(route, { items: state.workQueue.filter((item) => item.status !== 'resolved') });
      return;
    }

    const resolveWorkQueueMatch = path.match(/^\/api\/bills\/work-queue\/([^/]+)\/resolve$/);
    if (resolveWorkQueueMatch && method === 'POST') {
      const item = state.workQueue.find((candidate) => candidate.id === decodeURIComponent(resolveWorkQueueMatch[1]));
      if (item) item.status = 'resolved';
      await fulfillJson(route, { success: true, item: item ? { ...item, resolvedAt: new Date().toISOString() } : null }, item ? 200 : 404);
      return;
    }

    if (path === '/api/bills') {
      await fulfillJson(route, { bills: state.bills, data: state.bills, meta: { total: state.bills.length } });
      return;
    }
    if (path === '/api/payer-payments') {
      await fulfillJson(route, { payments: [{ id: 'pay-day-payer-001', payerName: 'Medicare', amountCents: toCents(610), paymentDate: DAY, status: 'applied' }], data: [] });
      return;
    }
    if (path === '/api/patient-payments') {
      await fulfillJson(route, { payments: [{ id: 'pay-day-patient-001', patientId: 'patient-cosmetic', amountCents: toCents(480), paymentDate: DAY, status: 'posted' }], data: [] });
      return;
    }
    if (path === '/api/statements') {
      await fulfillJson(route, { statements: [], data: [] });
      return;
    }
    if (path === '/api/batches') {
      await fulfillJson(route, { batches: [] });
      return;
    }

    if (path === '/api/clearinghouse/era') {
      const status = url.searchParams.get('status');
      const eras = status ? state.eras.filter((era) => era.status === status) : state.eras;
      await fulfillJson(route, { eras });
      return;
    }
    if (path === '/api/clearinghouse/eft') {
      const reconciled = url.searchParams.get('reconciled');
      const efts = reconciled === null ? state.efts : state.efts.filter((eft) => String(eft.reconciled) === reconciled);
      await fulfillJson(route, { efts });
      return;
    }
    const eraPostMatch = path.match(/^\/api\/clearinghouse\/era\/([^/]+)\/post$/);
    if (eraPostMatch && method === 'POST') {
      const era = state.eras.find((item) => item.id === eraPostMatch[1]);
      if (era) era.status = 'posted';
      await fulfillJson(route, { success: true, claimsPosted: era ? era.claimCount : 0 }, era ? 200 : 404);
      return;
    }
    if (path === '/api/clearinghouse/reconcile' && method === 'POST') {
      const payload = readBody();
      const eft = state.efts.find((item) => item.id === payload.eftId);
      if (eft) eft.reconciled = true;
      await fulfillJson(route, { status: 'balanced', varianceCents: 0, notes: payload.notes });
      return;
    }
    if (path === '/api/clearinghouse/reports/closing') {
      const revenue = summarizeRevenue(state);
      await fulfillJson(route, { reportType: url.searchParams.get('reportType') || 'daily', startDate: url.searchParams.get('startDate'), endDate: url.searchParams.get('endDate'), totalChargesCents: revenue.totalRevenueCents, totalPaymentsCents: revenue.totalPaymentsCents, totalAdjustmentsCents: 0, outstandingBalanceCents: revenue.outstandingBalanceCents, claimsSubmitted: state.claims.filter((claim) => claim.status === 'submitted').length, claimsPaid: state.claims.filter((claim) => claim.status === 'paid').length, claimsDenied: state.claims.filter((claim) => claim.status === 'denied').length, erasReceived: state.eras.length, eftsReceived: state.efts.length, reconciliationVarianceCents: 0 });
      return;
    }
    if (path === '/api/clearinghouse/submit-claim' && method === 'POST') {
      const payload = readBody();
      const claim = state.claims.find((item) => item.id === payload.claimId);
      if (claim) claim.status = 'submitted';
      await fulfillJson(route, { success: true, claimId: payload.claimId, status: 'submitted' }, claim ? 200 : 404);
      return;
    }
    if (path.startsWith('/api/clearinghouse/claim-status/')) {
      await fulfillJson(route, { status: 'accepted', updatedAt: new Date().toISOString() });
      return;
    }

    if (path.startsWith('/api/analytics/')) {
      const revenue = summarizeRevenue(state);
      const completed = state.appointments.filter((appointment) => appointment.status === 'completed').length;
      const noShows = state.appointments.filter((appointment) => appointment.status === 'no_show').length;
      const cancelled = state.appointments.filter((appointment) => appointment.status === 'cancelled').length;
      if (path === '/api/analytics/dashboard') {
        await fulfillJson(route, { totalPatients: state.patients.length, todayAppointments: state.appointments.length, monthRevenue: revenue.totalRevenueCents, activeEncounters: state.encounters.filter((encounter) => encounter.status === 'draft').length });
        return;
      }
      if (path === '/api/analytics/overview') {
        await fulfillJson(route, { newPatients: { current: 1, previous: 0, trend: 100 }, appointments: { current: state.appointments.length, previous: 6, trend: 33.3, byStatus: [{ status: 'completed', count: completed }, { status: 'no_show', count: noShows }, { status: 'cancelled', count: cancelled }] }, revenue: { current: revenue.totalRevenueCents, previous: toCents(1200), trend: 59.6 }, collectionRate: 57.8 });
        return;
      }
      if (path === '/api/analytics/appointments') {
        await fulfillJson(route, { byStatus: [{ status: 'completed', count: completed }, { status: 'no_show', count: noShows }, { status: 'cancelled', count: cancelled }], byType: appointmentTypes.map((type) => ({ type_name: type.name, count: state.appointments.filter((appointment) => appointment.appointmentTypeId === type.id).length })), byProvider: providers.map((provider) => ({ provider_name: provider.fullName, count: state.appointments.filter((appointment) => appointment.providerId === provider.id).length })), avgWaitTimeMinutes: 7.5 });
        return;
      }
      if (path === '/api/analytics/providers' || path === '/api/analytics/provider-productivity') {
        await fulfillJson(route, { data: providers.map((provider) => ({ id: provider.id, provider_name: provider.fullName, completed_appointments: state.appointments.filter((appointment) => appointment.providerId === provider.id && appointment.status === 'completed').length, cancelled_appointments: state.appointments.filter((appointment) => appointment.providerId === provider.id && appointment.status === 'cancelled').length, no_shows: state.appointments.filter((appointment) => appointment.providerId === provider.id && appointment.status === 'no_show').length, total_encounters: state.encounters.filter((encounter) => encounter.providerId === provider.id).length, unique_patients: new Set(state.appointments.filter((appointment) => appointment.providerId === provider.id).map((appointment) => appointment.patientId)).size, revenue_cents: state.claims.filter((claim) => claim.providerName === provider.fullName).reduce((sum, claim) => sum + claim.totalCents, 0), avg_visit_duration_minutes: 28 })) });
        return;
      }
      if (path === '/api/analytics/revenue/trend') {
        await fulfillJson(route, { data: [{ date: DAY, revenue: revenue.totalRevenueCents }] });
        return;
      }
      if (path === '/api/analytics/appointments/trend') {
        await fulfillJson(route, { data: [{ date: DAY, count: state.appointments.length }] });
        return;
      }
      if (path === '/api/analytics/top-diagnoses') {
        await fulfillJson(route, { data: diagnosisCatalog.slice(0, 6).map((dx, index) => ({ name: dx.description, count: 8 - index })) });
        return;
      }
      if (path === '/api/analytics/top-procedures') {
        await fulfillJson(route, { data: [{ name: 'Office visit', count: 2 }, { name: 'Mohs surgery', count: 1 }, { name: 'Biopsy', count: 1 }, { name: 'Cosmetic injectable', count: 1 }] });
        return;
      }
      if (path === '/api/analytics/patient-demographics') {
        await fulfillJson(route, { ageGroups: [{ age_group: '18-34', count: 2 }, { age_group: '35-54', count: 3 }, { age_group: '55-74', count: 3 }], gender: [{ gender: 'Female', count: 4 }, { gender: 'Male', count: 4 }] });
        return;
      }
      if (path === '/api/analytics/appointment-types') {
        await fulfillJson(route, { data: appointmentTypes.map((type) => ({ type_name: type.name, count: state.appointments.filter((appointment) => appointment.appointmentTypeId === type.id).length })) });
        return;
      }
      if (path === '/api/analytics/dermatology-metrics') {
        await fulfillJson(route, { biopsyStats: { total: 1, byType: { shave: 1 }, resultsBreakdown: [{ result: 'pending', count: 1 }] }, procedureSplit: { cosmetic: { count: 1, revenue: toCents(480), percentage: 20 }, medical: { count: 3, revenue: toCents(585), percentage: 45 }, surgical: { count: 1, revenue: toCents(850), percentage: 35 } }, topConditions: diagnosisCatalog.slice(0, 4).map((dx) => ({ icdCode: dx.code, conditionName: dx.description, treatmentCount: 1, uniquePatients: 1 })), lesionTracking: { totalTracked: 2, byStatus: { new: 1, biopsied: 1 }, byRiskLevel: { high: 1, medium: 1 }, patientsWithLesions: 2 } });
        return;
      }
      if (path === '/api/analytics/yoy-comparison') {
        await fulfillJson(route, { metrics: { newPatients: { current: 1, lastYear: 0, percentChange: 100, trend: 'up' }, totalAppointments: { current: state.appointments.length, lastYear: 6, percentChange: 33.3, trend: 'up' }, revenue: { current: revenue.totalRevenueCents, lastYear: toCents(1200), percentChange: 59.6, trend: 'up' } } });
        return;
      }
      if (path === '/api/analytics/no-show-risk' || path.startsWith('/api/analytics/no-show-risk/patient/')) {
        await fulfillJson(route, { overallNoShowRate: 12.5, totalAppointments: state.appointments.length, totalNoShows: noShows, recommendations: ['Confirm high-risk afternoon appointments.'] });
        return;
      }
    }

    await fulfillJson(route, { data: [], items: [], patients: [], appointments: [], providers: [], claims: [], bills: [], prescriptions: [] });
  });
}

async function seedAuthenticatedSession(page: Page) {
  const session = {
    tenantId: TENANT_ID,
    accessToken: '__http_only_cookie__',
    refreshToken: '__http_only_cookie__',
    user: {
      id: 'user-day-admin',
      email: 'admin@demo.practice',
      fullName: 'Demo Admin',
      role: 'admin',
      roles: ['admin'],
      secondaryRoles: [],
    },
  };

  await page.addInitScript((value) => {
    localStorage.setItem('derm_session', JSON.stringify({
      ...value,
      lastActivityAt: Date.now(),
      sessionStartedAt: Date.now(),
    }));
  }, session);
}

test.describe('Full clinic day simulation', () => {
  test.setTimeout(120_000);

  test('simulates a complete dermatology office day from intake through revenue cycle analytics', async ({ page }) => {
    const state = buildClinicDayState();
    await installFullDayRoutes(page, state);
    await seedAuthenticatedSession(page);

    await page.goto('/schedule');
    await expect(page.getByText(/Schedule - /i).first()).toBeVisible();
    await expect(page.getByRole('row', { name: /Avery Nguyen.*Dr\. Maya Patel, MD.*New Patient Consult/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Robert Castillo.*Dr\. Owen Sinclair, MD.*Mohs Surgery/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Marcus Hill.*Riley Johnson, PA-C.*Telehealth Follow-Up/ })).toBeVisible();

    const flowResult = await page.evaluate(async ({ day, tenantId }) => {
      const session = JSON.parse(localStorage.getItem('derm_session') || '{}');
      const headers = {
        Authorization: `Bearer ${session.accessToken}`,
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json',
      };
      const json = async (response: Response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      };

      const patient = await json(await fetch('/api/patients', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          firstName: 'Jordan',
          lastName: 'Taylor',
          dateOfBirth: '1994-05-12',
          phone: '5551001999',
          email: 'jordan.taylor.full.day@example.test',
        }),
      }));

      const appointment = await json(await fetch('/api/appointments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientId: patient.patient.id,
          providerId: 'provider-day-medical',
          appointmentTypeId: 'type-new',
          locationId: 'loc-main',
          scheduledStart: `${day}T16:00:00.000Z`,
        }),
      }));

      const encounter = await json(await fetch('/api/encounters', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientId: patient.patient.id,
          providerId: 'provider-day-medical',
          appointmentId: appointment.appointment.id,
          chiefComplaint: 'New patient allergic rash evaluation',
        }),
      }));

      await json(await fetch('/api/encounters/' + encodeURIComponent(encounter.encounter.id), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          hpi: 'New patient with itchy rash after occupational glove exposure.',
          ros: 'Skin positive for pruritic dermatitis. No fever.',
          exam: 'Erythematous eczematous plaques on dorsal hands.',
          assessmentPlan: 'Allergic contact dermatitis. Patch testing if persistent.',
        }),
      }));

      await json(await fetch('/api/diagnoses', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientId: patient.patient.id,
          encounterId: encounter.encounter.id,
          icd10Code: 'L23.9',
          description: 'Allergic contact dermatitis, unspecified',
          isPrimary: true,
        }),
      }));

      await json(await fetch('/api/charges', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientId: patient.patient.id,
          encounterId: encounter.encounter.id,
          cptCode: '99203',
          description: 'New patient office visit',
          quantity: 1,
          feeCents: 28500,
          billingRoute: 'insurance',
        }),
      }));

      await json(await fetch('/api/prescriptions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientId: patient.patient.id,
          providerId: 'provider-day-medical',
          medicationName: 'Triamcinolone 0.1% cream',
          strength: '0.1%',
          sig: 'Apply twice daily to rash for 14 days',
          quantity: 80,
          quantityUnit: 'g',
          refills: 1,
          deliveryMethod: 'electronic',
          indication: 'Allergic contact dermatitis',
        }),
      }));

      await json(await fetch('/api/encounters/' + encodeURIComponent(encounter.encounter.id) + '/complete', {
        method: 'POST',
        headers,
      }));

      const analytics = await json(await fetch('/api/analytics/overview', { headers }));
      const claims = await json(await fetch('/api/claims', { headers }));
      const prescriptions = await json(await fetch('/api/prescriptions', { headers }));
      const workQueue = await json(await fetch('/api/bills/work-queue', { headers }));
      const closing = await json(await fetch(`/api/clearinghouse/reports/closing?startDate=${day}&endDate=${day}&reportType=daily`, { headers }));

      return {
        patientName: `${patient.patient.firstName} ${patient.patient.lastName}`,
        appointmentId: appointment.appointment.id,
        encounterId: encounter.encounter.id,
        newPatients: analytics.newPatients.current,
        claimCount: claims.claims.length,
        prescriptionCount: prescriptions.prescriptions.length,
        workQueueCount: workQueue.items.length,
        closingTotalChargesCents: closing.totalChargesCents,
      };
    }, { day: DAY, tenantId: TENANT_ID });

    expect(flowResult.patientName).toBe('Jordan Taylor');
    expect(flowResult.appointmentId).toMatch(/^appt-day-new-/);
    expect(flowResult.encounterId).toMatch(/^enc-day-new-/);
    expect(flowResult.newPatients).toBeGreaterThanOrEqual(1);
    expect(flowResult.claimCount).toBeGreaterThanOrEqual(6);
    expect(flowResult.prescriptionCount).toBeGreaterThanOrEqual(5);
    expect(flowResult.workQueueCount).toBeGreaterThanOrEqual(2);
    expect(flowResult.closingTotalChargesCents).toBeGreaterThan(toCents(1900));

    await page.goto('/clinical-inbox');
    await expect(page.getByRole('heading', { name: 'Clinical Inbox' })).toBeVisible();
    await expect(page.getByText('Portal rash photo review').first()).toBeVisible();
    await expect(page.getByText('Refill request: Triamcinolone 0.1% cream').first()).toBeVisible();
    await expect(page.getByText('Biopsy follow-up: SP-DAY-003').first()).toBeVisible();

    const inboxTabs = page.locator('.clinical-inbox-tabs');
    const inboxDetail = page.locator('.clinical-inbox-detail-panel');

    await page.getByRole('button', { name: /Portal rash photo review/ }).click();
    await inboxDetail.getByPlaceholder('Write the reply or internal note...').fill('Reviewed photo. Keep the site covered and we will call today.');
    const sendReplyButton = inboxDetail.getByRole('button', { name: 'Send' });
    await expect(sendReplyButton).toBeEnabled();
    await sendReplyButton.click();
    await expect.poll(() => state.portalMessagesByThread['portal-day-001'].length).toBe(2);

    await inboxTabs.getByRole('button', { name: /Messages/ }).click();
    await page.getByRole('button', { name: /Text from Noah Foster/ }).click();
    await inboxDetail.getByRole('button', { name: 'Mark read' }).click();
    await expect.poll(() => state.clinicalSmsConversations[0].unreadCount).toBe(0);

    await inboxTabs.getByRole('button', { name: /Rx \/ ePA/ }).click();
    await expect(page.getByText('ePA: Adalimumab').first()).toBeVisible();
    await page.getByRole('button', { name: /Refill request: Triamcinolone 0\.1% cream/ }).click();
    await inboxDetail.getByRole('button', { name: 'Approve refill' }).click();
    await expect.poll(() => state.refillRequests[0].status).toBe('approved');

    await inboxTabs.getByRole('button', { name: /Results/ }).click();
    await page.getByRole('button', { name: /LAB order/ }).click();
    await inboxDetail.getByRole('button', { name: 'Complete order' }).click();
    await expect.poll(() => state.orders[0].status).toBe('completed');

    await page.getByRole('button', { name: /Biopsy follow-up: SP-DAY-003/ }).click();
    await inboxDetail.getByRole('button', { name: 'Create follow-up' }).click();
    await expect.poll(() => state.tasks.some((task) => String(task.title || '').includes('Biopsy follow-up: SP-DAY-003'))).toBe(true);

    await inboxTabs.getByRole('button', { name: /Clinical/ }).click();
    await page.getByRole('button', { name: /Call psoriasis patient about labs/ }).click();
    await inboxDetail.getByRole('button', { name: 'Complete task' }).click();
    await expect.poll(() => state.tasks.find((task) => task.id === 'task-day-001')?.status).toBe('completed');

    await inboxTabs.getByRole('button', { name: /Admin/ }).click();
    await page.getByRole('button', { name: /Outside pathology report/ }).click();
    await inboxDetail.getByRole('button', { name: 'Mark read' }).click();
    await expect.poll(() => state.faxes[0].read).toBe(true);

    await page.goto('/patients');
    await expect(page.getByRole('row', { name: /Taylor Jordan.*jordan\.taylor\.full\.day@example\.test/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Nguyen Avery.*avery\.nguyen@example\.test/ })).toBeVisible();

    await page.goto('/rx');
    await expect(page.getByText(/Prescriptions \(eRx\)/i).first()).toBeVisible();
    await expect(page.getByText('Triamcinolone 0.1% cream').first()).toBeVisible();
    await expect(page.getByText('Tretinoin 0.025% cream').first()).toBeVisible();

    await page.goto('/claims');
    await expect(page.getByText(/Claims Management/i).first()).toBeVisible();
    await expect(page.getByText('CLM-DAY-003').first()).toBeVisible();
    await expect(page.getByText(/denials\/rejections/i).first()).toBeVisible();

    await page.goto('/financials?tab=bills');
    await expect(page.getByText(/Patient Bills/i).first()).toBeVisible();
    await expect(page.getByText('Billing Review Queue')).toBeVisible();
    await expect(page.getByText(/Correct missing modifier/i)).toBeVisible();

    await page.goto('/financials?tab=insurance');
    await expect(page.getByText(/Insurance Analytics/i).first()).toBeVisible();
    await expect(page.getByText('Payer Performance Scorecard')).toBeVisible();
    await expect(page.getByText('Payer Time & Money')).toBeVisible();
    await expect(page.getByText('Aetna').first()).toBeVisible();
    await expect(page.getByText('United Healthcare').first()).toBeVisible();
    await expect(page.getByText('CLM-DAY-003').first()).toBeVisible();

    await page.goto('/clearinghouse');
    await expect(page.getByText(/Clearinghouse/i).first()).toBeVisible();
    await page.getByRole('button', { name: /^ERA$/ }).click();
    await expect(page.getByText('ERA-DAY-002')).toBeVisible();
    await page.getByRole('button', { name: /^EFT$/ }).click();
    await expect(page.getByText('EFT-DAY-001')).toBeVisible();
    await page.getByRole('button', { name: /^Reports$/ }).click();
    await page.getByRole('button', { name: /^Generate Report$/ }).click();
    await expect(page.getByText('Report generated')).toBeVisible();

    await page.goto('/analytics');
    await expect(page.getByText(/Analytics & Reports/i).first()).toBeVisible();
    await expect(page.getByText('Financial Reports')).toBeVisible();
    await expect(page.getByText('Claim Pipeline')).toBeVisible();
    await expect(page.getByText('Billing Work Queue')).toBeVisible();
  });
});
