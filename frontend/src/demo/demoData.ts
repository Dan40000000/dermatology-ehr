// ─── Demo Data ────────────────────────────────────────────────────────────────
// All mock data for beta testing. Referenced by the fetch interceptor.
// Four linked portal patients also appear in the provider-side patient list.
// ─────────────────────────────────────────────────────────────────────────────

import { createSyntheticPracticeData } from './generatedPracticeData';

export const DEMO_PROVIDER = {
  id: 'demo-provider-1',
  name: 'Dr. David Skin, MD, FAAD',
  specialty: 'Dermatology',
};

// ── Patients ─────────────────────────────────────────────────────────────────

export const PATIENT_ALEX = {
  id: 'demo-patient-1',
  tenantId: 'tenant-demo',
  mrn: 'MRN-20010',
  firstName: 'Alex',
  lastName: 'Johnson',
  preferredName: 'Alex',
  dateOfBirth: '1985-03-15',
  sex: 'M',
  phone: '(720) 555-0142',
  email: 'patient@demo.portal',
  address: '4821 Pinecrest Drive',
  city: 'Denver',
  state: 'CO',
  zip: '80202',
  lastVisit: '2026-03-08T10:00:00Z',
  createdAt: '2023-06-15T08:00:00Z',
  allergies: ['Penicillin (Hives)', 'Sulfonamides (Rash)'],
  medications: ['Methotrexate 15mg weekly', 'Tretinoin 0.025% cream'],
  insuranceDetails: {
    primary: {
      payer: 'Blue Cross Blue Shield of Colorado',
      planName: 'PPO Gold Plan',
      policyNumber: 'BCB987654321',
      groupNumber: 'GRP-45890',
      policyType: 'PPO',
      eligibilityStatus: 'Active',
      copayAmount: 30,
      coinsurancePercent: 20,
      deductible: 1500,
      remainingDeductible: 892.50,
      outOfPocket: 5000,
      remainingOutOfPocket: 3247.00,
      policyEffectiveDate: '2026-01-01',
      policyEndDate: '2026-12-31',
    },
    payerContacts: [
      { contactType: 'Customer Service', phone: '1-800-676-2583' },
      { contactType: 'Claims', phone: '1-800-676-2583', fax: '1-303-831-3099' },
    ],
  },
};

export const PATIENT_JANE = {
  id: 'demo-patient-2',
  tenantId: 'tenant-demo',
  mrn: 'MRN-20024',
  firstName: 'Jane',
  lastName: 'Doe',
  preferredName: 'Jane',
  dateOfBirth: '1992-07-22',
  sex: 'F',
  phone: '(303) 555-0287',
  email: 'jane@demo.portal',
  address: '1103 Maple Street',
  city: 'Boulder',
  state: 'CO',
  zip: '80301',
  lastVisit: '2026-02-20T14:30:00Z',
  createdAt: '2024-01-10T09:00:00Z',
  allergies: ['Latex (Anaphylaxis)', 'Nickel (Contact Dermatitis)'],
  medications: ['Dupilumab 300mg SC q2w', 'Hydrocortisone 2.5% cream', 'Cetirizine 10mg daily'],
  insuranceDetails: {
    primary: {
      payer: 'Aetna',
      planName: 'HMO Silver Plan',
      policyNumber: 'AET123456789',
      groupNumber: 'GRP-22341',
      policyType: 'HMO',
      eligibilityStatus: 'Active',
      copayAmount: 45,
      coinsurancePercent: 30,
      deductible: 2500,
      remainingDeductible: 1847.00,
      outOfPocket: 7500,
      remainingOutOfPocket: 5892.00,
      policyEffectiveDate: '2026-01-01',
      policyEndDate: '2026-12-31',
    },
    payerContacts: [
      { contactType: 'Customer Service', phone: '1-800-872-3862' },
      { contactType: 'Claims', phone: '1-800-872-3862', fax: '1-860-273-0123' },
    ],
  },
};

export const PATIENT_MARCUS = {
  id: 'demo-patient-3',
  tenantId: 'tenant-demo',
  mrn: 'MRN-20031',
  firstName: 'Marcus',
  lastName: 'Williams',
  preferredName: 'Marcus',
  dateOfBirth: '2002-07-22',
  sex: 'M',
  phone: '(720) 555-0319',
  email: 'marcus@demo.portal',
  address: '88 Larimer Street',
  city: 'Denver',
  state: 'CO',
  zip: '80202',
  lastVisit: '2026-03-21T15:00:00Z',
  createdAt: '2024-03-20T08:00:00Z',
  allergies: ['Sulfonamide Antibiotics (Rash)', 'Doxycycline (Severe GI upset)'],
  medications: ['Isotretinoin 40mg daily', 'Benzoyl Peroxide 5% wash', 'Clindamycin 1% lotion'],
  insuranceDetails: {
    primary: {
      payer: 'United Healthcare',
      planName: 'Choice Plus PPO',
      policyNumber: 'UHC402883145',
      groupNumber: 'GRP-78112',
      policyType: 'PPO',
      eligibilityStatus: 'Active',
      copayAmount: 35,
      coinsurancePercent: 20,
      deductible: 1200,
      remainingDeductible: 420.00,
      outOfPocket: 4500,
      remainingOutOfPocket: 1898.00,
      policyEffectiveDate: '2026-01-01',
      policyEndDate: '2026-12-31',
    },
    payerContacts: [
      { contactType: 'Customer Service', phone: '1-866-633-2446' },
      { contactType: 'Pharmacy Benefits', phone: '1-800-711-4555' },
    ],
  },
};

export const PATIENT_SOFIA = {
  id: 'demo-patient-4',
  tenantId: 'tenant-demo',
  mrn: 'MRN-20039',
  firstName: 'Sofia',
  lastName: 'Chen',
  preferredName: 'Sofia',
  dateOfBirth: '1995-12-01',
  sex: 'F',
  phone: '(303) 555-0441',
  email: 'sofia@demo.portal',
  address: '302 Pearl Street',
  city: 'Boulder',
  state: 'CO',
  zip: '80302',
  lastVisit: '2026-02-11T11:00:00Z',
  createdAt: '2024-08-05T08:00:00Z',
  allergies: [],
  medications: ['Spironolactone 50mg daily', 'Tretinoin 0.05% cream', 'Azelaic Acid 15% gel'],
  insuranceDetails: {
    primary: {
      payer: 'Cigna',
      planName: 'Open Access Plus',
      policyNumber: 'CIG554001892',
      groupNumber: 'GRP-66418',
      policyType: 'PPO',
      eligibilityStatus: 'Active',
      copayAmount: 40,
      coinsurancePercent: 10,
      deductible: 1800,
      remainingDeductible: 980.00,
      outOfPocket: 5500,
      remainingOutOfPocket: 4312.00,
      policyEffectiveDate: '2026-01-01',
      policyEndDate: '2026-12-31',
    },
    payerContacts: [
      { contactType: 'Customer Service', phone: '1-800-244-6224' },
      { contactType: 'Behavioral/Clinical Support', phone: '1-800-926-2273' },
    ],
  },
};

// Seed patients used as anchors for the larger generated practice roster.
const EXTRA_PATIENTS = [
  {
    id: 'demo-extra-1', tenantId: 'tenant-demo', mrn: 'MRN-20052',
    firstName: 'Robert', lastName: 'Martinez', dateOfBirth: '1978-09-04',
    sex: 'M', phone: '(720) 555-0319', email: 'rmartinez@email.com',
    address: '88 Larimer St', city: 'Denver', state: 'CO', zip: '80202',
    lastVisit: '2026-04-01T09:00:00Z', createdAt: '2024-03-20T08:00:00Z',
  },
  {
    id: 'demo-extra-2', tenantId: 'tenant-demo', mrn: 'MRN-20054',
    firstName: 'Sarah', lastName: 'Kim', dateOfBirth: '1995-12-01',
    sex: 'F', phone: '(303) 555-0441', email: 'skim@email.com',
    address: '302 Pearl St', city: 'Boulder', state: 'CO', zip: '80302',
    lastVisit: '2026-03-25T13:00:00Z', createdAt: '2024-08-05T08:00:00Z',
  },
  {
    id: 'demo-extra-3', tenantId: 'tenant-demo', mrn: 'MRN-20047',
    firstName: 'Michael', lastName: 'Chen', dateOfBirth: '1969-04-18',
    sex: 'M', phone: '(720) 555-0578', email: 'mchen@email.com',
    address: '770 Grant St', city: 'Denver', state: 'CO', zip: '80203',
    lastVisit: '2026-04-10T11:00:00Z', createdAt: '2025-01-12T08:00:00Z',
  },
  {
    id: 'demo-extra-4', tenantId: 'tenant-demo', mrn: 'MRN-20055',
    firstName: 'Emily', lastName: 'Torres', dateOfBirth: '2001-06-30',
    sex: 'F', phone: '(303) 555-0612', email: 'etorres@email.com',
    address: '1542 Canyon Blvd', city: 'Boulder', state: 'CO', zip: '80301',
    lastVisit: '2026-04-14T10:30:00Z', createdAt: '2025-06-18T08:00:00Z',
  },
];

const GENERATED_PRACTICE_DATA = createSyntheticPracticeData(EXTRA_PATIENTS, 796);

export const ALL_PATIENTS = [
  PATIENT_ALEX,
  PATIENT_JANE,
  PATIENT_MARCUS,
  PATIENT_SOFIA,
  ...GENERATED_PRACTICE_DATA.patients,
];

// ── Appointments ──────────────────────────────────────────────────────────────

export const APPOINTMENTS_ALEX = [
  {
    id: 'appt-a1', tenantId: 'tenant-demo', patientId: 'demo-patient-1',
    patientName: 'Alex Johnson', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-new', appointmentTypeName: 'New Patient Consultation',
    scheduledStart: '2025-11-12T10:00:00Z', scheduledEnd: '2025-11-12T11:00:00Z',
    status: 'completed', chiefComplaint: 'Itchy, scaly patches on elbows and knees',
    createdAt: '2025-10-28T08:00:00Z',
  },
  {
    id: 'appt-a2', tenantId: 'tenant-demo', patientId: 'demo-patient-1',
    patientName: 'Alex Johnson', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: 'Follow-Up + Procedure',
    scheduledStart: '2026-01-15T09:00:00Z', scheduledEnd: '2026-01-15T09:45:00Z',
    status: 'completed', chiefComplaint: 'Psoriasis management, cryotherapy for seborrheic keratoses',
    createdAt: '2025-12-20T08:00:00Z',
  },
  {
    id: 'appt-a3', tenantId: 'tenant-demo', patientId: 'demo-patient-1',
    patientName: 'Alex Johnson', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: 'Follow-Up + Biopsy',
    scheduledStart: '2026-03-08T10:00:00Z', scheduledEnd: '2026-03-08T10:45:00Z',
    status: 'completed', chiefComplaint: 'Psoriasis follow-up, suspicious lesion on right forearm',
    createdAt: '2026-02-14T08:00:00Z',
  },
  {
    id: 'appt-a4', tenantId: 'tenant-demo', patientId: 'demo-patient-1',
    patientName: 'Alex Johnson', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: '3-Month Follow-Up',
    scheduledStart: '2026-04-29T10:00:00Z', scheduledEnd: '2026-04-29T10:30:00Z',
    status: 'scheduled', chiefComplaint: 'Psoriasis and Methotrexate monitoring',
    createdAt: '2026-03-10T08:00:00Z',
  },
];

export const APPOINTMENTS_JANE = [
  {
    id: 'appt-j1', tenantId: 'tenant-demo', patientId: 'demo-patient-2',
    patientName: 'Jane Doe', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-new', appointmentTypeName: 'New Patient Consultation',
    scheduledStart: '2025-12-03T14:00:00Z', scheduledEnd: '2025-12-03T15:00:00Z',
    status: 'completed', chiefComplaint: 'Chronic eczema flares and suspicious lesion on right cheek',
    createdAt: '2025-11-18T08:00:00Z',
  },
  {
    id: 'appt-j2', tenantId: 'tenant-demo', patientId: 'demo-patient-2',
    patientName: 'Jane Doe', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-mohs', appointmentTypeName: 'Mohs Micrographic Surgery',
    scheduledStart: '2026-02-20T08:00:00Z', scheduledEnd: '2026-02-20T12:00:00Z',
    status: 'completed', chiefComplaint: 'Basal cell carcinoma excision, right cheek',
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'appt-j3', tenantId: 'tenant-demo', patientId: 'demo-patient-2',
    patientName: 'Jane Doe', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-patch', appointmentTypeName: 'Patch Testing + Eczema Follow-Up',
    scheduledStart: '2026-05-14T09:00:00Z', scheduledEnd: '2026-05-14T10:00:00Z',
    status: 'scheduled', chiefComplaint: 'Extended patch test panel, eczema management review',
    createdAt: '2026-03-01T08:00:00Z',
  },
];

export const APPOINTMENTS_MARCUS = [
  {
    id: 'appt-m1', tenantId: 'tenant-demo', patientId: 'demo-patient-3',
    patientName: 'Marcus Williams', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-new', appointmentTypeName: 'Acne Consultation',
    scheduledStart: '2026-01-09T14:00:00Z', scheduledEnd: '2026-01-09T14:45:00Z',
    status: 'completed', chiefComplaint: 'Moderate inflammatory acne with scarring on cheeks and jawline',
    createdAt: '2025-12-18T08:00:00Z',
  },
  {
    id: 'appt-m2', tenantId: 'tenant-demo', patientId: 'demo-patient-3',
    patientName: 'Marcus Williams', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: 'Isotretinoin Follow-Up',
    scheduledStart: '2026-03-21T15:00:00Z', scheduledEnd: '2026-03-21T15:30:00Z',
    status: 'completed', chiefComplaint: 'Month-two isotretinoin follow-up and lab review',
    createdAt: '2026-02-20T08:00:00Z',
  },
  {
    id: 'appt-m3', tenantId: 'tenant-demo', patientId: 'demo-patient-3',
    patientName: 'Marcus Williams', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: 'Acne Follow-Up',
    scheduledStart: '2026-05-07T13:30:00Z', scheduledEnd: '2026-05-07T14:00:00Z',
    status: 'scheduled', chiefComplaint: 'Acne follow-up, isotretinoin tolerance and scarring review',
    createdAt: '2026-03-21T15:40:00Z',
  },
];

export const APPOINTMENTS_SOFIA = [
  {
    id: 'appt-s1', tenantId: 'tenant-demo', patientId: 'demo-patient-4',
    patientName: 'Sofia Chen', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-new', appointmentTypeName: 'New Patient Consultation',
    scheduledStart: '2025-10-02T16:00:00Z', scheduledEnd: '2025-10-02T16:45:00Z',
    status: 'completed', chiefComplaint: 'Hormonal acne, post-inflammatory hyperpigmentation, melasma concerns',
    createdAt: '2025-09-18T08:00:00Z',
  },
  {
    id: 'appt-s2', tenantId: 'tenant-demo', patientId: 'demo-patient-4',
    patientName: 'Sofia Chen', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: 'Acne + Pigment Follow-Up',
    scheduledStart: '2026-02-11T11:00:00Z', scheduledEnd: '2026-02-11T11:30:00Z',
    status: 'completed', chiefComplaint: 'Response to spironolactone and tretinoin; melasma check',
    createdAt: '2026-01-05T08:00:00Z',
  },
  {
    id: 'appt-s3', tenantId: 'tenant-demo', patientId: 'demo-patient-4',
    patientName: 'Sofia Chen', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: 'Skin Check + Acne Follow-Up',
    scheduledStart: '2026-05-20T10:30:00Z', scheduledEnd: '2026-05-20T11:00:00Z',
    status: 'scheduled', chiefComplaint: 'Maintenance acne follow-up and annual skin check',
    createdAt: '2026-02-11T11:35:00Z',
  },
];

export const APPOINTMENTS_TELEHEALTH = [
  {
    id: 'appt-tv-marcus', tenantId: 'tenant-demo', patientId: 'demo-patient-3',
    patientName: 'Marcus Williams', providerId: 'demo-provider-5',
    providerName: 'Dr. Phil Jackson - PA', locationId: 'loc-virtual',
    locationName: 'Mountain Pine Dermatology - Virtual Care',
    appointmentTypeId: 'type-video-acne', appointmentTypeName: 'Video Acne Follow-Up',
    scheduledStart: '2026-04-27T16:00:00Z', scheduledEnd: '2026-04-27T16:20:00Z',
    status: 'scheduled', chiefComplaint: 'Virtual isotretinoin tolerance check and refill planning',
    createdAt: '2026-04-21T08:00:00Z',
  },
];

export const ALL_APPOINTMENTS = [
  ...APPOINTMENTS_ALEX,
  ...APPOINTMENTS_JANE,
  ...APPOINTMENTS_MARCUS,
  ...APPOINTMENTS_SOFIA,
  ...APPOINTMENTS_TELEHEALTH,
  {
    id: 'appt-r1', tenantId: 'tenant-demo', patientId: 'demo-extra-1',
    patientName: 'Robert Martinez', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: 'Acne Follow-Up',
    scheduledStart: '2026-04-22T11:00:00Z', scheduledEnd: '2026-04-22T11:30:00Z',
    status: 'scheduled', createdAt: '2026-04-01T08:00:00Z',
  },
  {
    id: 'appt-e1', tenantId: 'tenant-demo', patientId: 'demo-extra-4',
    patientName: 'Emily Torres', providerId: 'demo-provider-1',
    providerName: 'Dr. David Skin, MD, FAAD', locationId: 'loc-1',
    locationName: 'Mountain Pine Dermatology - Main Office',
    appointmentTypeId: 'type-fu', appointmentTypeName: 'Skin Check',
    scheduledStart: '2026-04-23T14:00:00Z', scheduledEnd: '2026-04-23T14:30:00Z',
    status: 'scheduled', createdAt: '2026-04-10T08:00:00Z',
  },
  ...GENERATED_PRACTICE_DATA.appointments,
];

// ── Encounters ────────────────────────────────────────────────────────────────

export const ENCOUNTERS_ALEX = [
  {
    id: 'enc-a1', tenantId: 'tenant-demo', appointmentId: 'appt-a1',
    patientId: 'demo-patient-1', patientName: 'Alex Johnson',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Itchy, scaly patches on elbows and knees for 6+ months',
    hpi: 'Alex Johnson is a 40-year-old male presenting with a 6-month history of pruritic, erythematous, well-demarcated plaques on bilateral elbows and knees. Reports significant itching, especially at night. No prior dermatologic treatment. Family history positive for psoriasis (mother). Denies fever, joint pain, or nail changes.',
    ros: 'Integumentary: Positive for pruritus, scaling plaques. Musculoskeletal: Denies joint pain or swelling. All other systems reviewed and negative.',
    exam: 'Well-appearing male in no acute distress. Skin: Multiple erythematous, sharply demarcated plaques with overlying silvery scale on bilateral elbows (approx. 3x4cm each) and knees (approx. 4x5cm each). Auspitz sign positive. No nail pitting. No plaques on scalp or trunk.',
    assessmentPlan: 'Assessment: Plaque Psoriasis (L40.0)\n\nPlan:\n1. Initiate topical clobetasol propionate 0.05% ointment BID x 2 weeks, then taper\n2. Referral for phototherapy evaluation if inadequate response\n3. Consider systemic therapy (Methotrexate) at follow-up if widespread\n4. Patient education: triggers (stress, infections), moisturization\n5. Lab: CBC, CMP, LFTs baseline prior to systemic therapy\n6. Return in 8 weeks for reassessment',
    createdAt: '2025-11-12T11:30:00Z', updatedAt: '2025-11-12T12:00:00Z',
  },
  {
    id: 'enc-a2', tenantId: 'tenant-demo', appointmentId: 'appt-a2',
    patientId: 'demo-patient-1', patientName: 'Alex Johnson',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Psoriasis management and treatment upgrade; seborrheic keratoses',
    hpi: 'Alex returns for psoriasis follow-up. Topical clobetasol provided partial improvement (~40%) but plaques persist on elbows and knees. Also noting 3 rough, warty growths on upper back, consistent with seborrheic keratoses. Ready to initiate systemic therapy. Labs reviewed: CBC, CMP, LFTs within normal limits.',
    ros: 'Integumentary: Ongoing psoriatic plaques, improved but not resolved. GI: Denies nausea, abdominal pain. All other systems reviewed and negative.',
    exam: 'Skin: Residual erythematous plaques with less scaling on bilateral elbows (approx. 2x3cm) and knees (approx. 3x4cm). Three 0.5-1cm raised, stuck-on appearing lesions on upper back consistent with seborrheic keratoses.',
    assessmentPlan: 'Assessment:\n1. Plaque Psoriasis (L40.0) — partially treated\n2. Seborrheic Keratoses (L82.1) x3\n\nPlan:\n1. Initiate Methotrexate 15mg PO weekly with folic acid 1mg daily\n2. Continue Tretinoin 0.025% cream for skin texture\n3. Cryotherapy applied to 3 seborrheic keratoses on upper back — tolerated well\n4. Labs: CBC, LFTs q8 weeks while on Methotrexate\n5. Return in 8 weeks',
    createdAt: '2026-01-15T10:00:00Z', updatedAt: '2026-01-15T10:45:00Z',
  },
  {
    id: 'enc-a3', tenantId: 'tenant-demo', appointmentId: 'appt-a3',
    patientId: 'demo-patient-1', patientName: 'Alex Johnson',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Psoriasis follow-up on Methotrexate; suspicious lesion right forearm',
    hpi: 'Alex presents for 8-week follow-up on Methotrexate 15mg weekly. Reports significant improvement in psoriatic plaques — estimates 75% clearance. Tolerating medication well, mild nausea first day of weekly dose. Notes a 1cm irregularly pigmented lesion on right forearm, present for ~4 months, slowly growing.',
    ros: 'Integumentary: Significant improvement in psoriatic plaques; new lesion right forearm. GI: Mild nausea day of Methotrexate dose only. All other systems reviewed and negative.',
    exam: 'Skin: Psoriatic plaques markedly improved — minimal residual erythema without significant scaling on elbows and knees. Right forearm: 1.1 x 0.9cm pink-tan papule with irregular border and slight central depression. No satellite lesions. Dermoscopic evaluation performed.',
    assessmentPlan: 'Assessment:\n1. Plaque Psoriasis (L40.0) — excellent response to Methotrexate\n2. Suspicious pigmented lesion, right forearm — rule out dermatofibroma vs. BCC vs. melanoma\n\nPlan:\n1. Continue Methotrexate 15mg weekly with folic acid\n2. Punch biopsy of right forearm lesion performed (4mm) — sent to pathology\n3. Labs: CBC, LFTs — results reviewed at follow-up\n4. Return in 6-8 weeks; sooner if biopsy results require discussion\n5. Pathology result: Benign Intradermal Nevus — no further intervention required',
    createdAt: '2026-03-08T11:00:00Z', updatedAt: '2026-03-08T11:30:00Z',
  },
];

export const ENCOUNTERS_JANE = [
  {
    id: 'enc-j1', tenantId: 'tenant-demo', appointmentId: 'appt-j1',
    patientId: 'demo-patient-2', patientName: 'Jane Doe',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Chronic eczema flares and suspicious pearly papule on right cheek',
    hpi: 'Jane Doe is a 33-year-old female presenting with a lifelong history of atopic dermatitis, recently worsening with new job stress. Severe pruritus, sleep disruption. Also reports a slow-growing, shiny, pearly papule on right cheek present for approximately 8 months. Reports bleeding occasionally when touched. No significant sun protection history. No prior skin cancer.',
    ros: 'Integumentary: Positive for pruritus, xerosis, eczematous patches. Ophthalmologic: Denies ocular symptoms. All other systems reviewed and negative.',
    exam: 'Skin: Diffuse xerosis with lichenified, erythematous patches in antecubital and popliteal fossae bilaterally. Excoriations noted. Right cheek: 8mm pearly, translucent papule with rolled edges and central telangiectasia — highly suspicious for basal cell carcinoma. Dermoscopy confirms arborizing vessels.',
    assessmentPlan: 'Assessment:\n1. Atopic Dermatitis, moderate-severe (L20.9)\n2. Suspected Basal Cell Carcinoma, right cheek — biopsy required\n\nPlan:\n1. Punch biopsy of right cheek lesion performed (6mm) — sent to pathology STAT\n2. Dupilumab 300mg SC q2w initiated for moderate-severe atopic dermatitis\n3. Hydrocortisone 2.5% cream PRN for flares\n4. Cetirizine 10mg daily for pruritus\n5. Moisturize BID with fragrance-free emollient\n6. Latex and nickel allergy — documented\n7. Patch test panel scheduled at future visit\n8. Urgent follow-up upon biopsy results; plan for Mohs surgery if confirmed BCC',
    createdAt: '2025-12-03T15:30:00Z', updatedAt: '2025-12-03T16:00:00Z',
  },
  {
    id: 'enc-j2', tenantId: 'tenant-demo', appointmentId: 'appt-j2',
    patientId: 'demo-patient-2', patientName: 'Jane Doe',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Mohs micrographic surgery — basal cell carcinoma, right cheek',
    hpi: 'Jane presents for Mohs micrographic surgery for biopsy-confirmed nodular basal cell carcinoma of the right cheek. Pathology from December 3 biopsy: Nodular BCC, margins not assessed on punch biopsy. Patient consented for Mohs procedure. Pre-operative vitals obtained. IV access established. Proceeding with Mohs.',
    ros: 'Reviewed and negative for all systems. Pre-surgical clearance obtained.',
    exam: 'Right cheek: Biopsy site with central crust. Surrounding area infiltrated with 1% lidocaine with epinephrine. Tissue excised in layers with immediate histopathologic analysis.',
    assessmentPlan: 'Assessment:\nNodular Basal Cell Carcinoma, right cheek (C44.311)\n\nProcedure: Mohs Micrographic Surgery\n- Stage 1: 1.5 x 1.5cm excision — positive margins (inferior)\n- Stage 2: Additional 0.5cm inferior margin — clear margins achieved\n- Defect size: 2.2 x 2.0cm\n- Reconstruction: Primary layered closure with deep dermal sutures and running cutaneous suture\n- Estimated excellent cosmetic outcome\n- Pathology: Clear margins achieved, complete excision of BCC confirmed\n\nPost-op Instructions:\n- Wound care BID with bacitracin and non-stick dressing\n- Suture removal in 7 days\n- Sun protection at surgical site indefinitely\n- Annual full-body skin exam — increased risk for future skin cancers\n- Return in 1 week for suture removal, 3 months for healing check',
    createdAt: '2026-02-20T12:30:00Z', updatedAt: '2026-02-20T13:00:00Z',
  },
];

export const ENCOUNTERS_MARCUS = [
  {
    id: 'enc-m1', tenantId: 'tenant-demo', appointmentId: 'appt-m1',
    patientId: 'demo-patient-3', patientName: 'Marcus Williams',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Moderate inflammatory acne with early cheek scarring',
    hpi: 'Marcus Williams is a 23-year-old male with persistent inflammatory acne on the cheeks, jawline, and upper back. Over-the-counter adapalene and benzoyl peroxide improved comedones only minimally. He is bothered by new scarring and post-inflammatory erythema.',
    ros: 'Integumentary: Positive for inflammatory papules, pustules, and mild scarring. GI: Negative. Mood: Negative. All other systems reviewed and negative.',
    exam: 'Skin: Numerous inflammatory papules and pustules on bilateral cheeks and jawline with scattered closed comedones and shallow rolling scars. Few inflammatory lesions on upper back. No cystic nodules.',
    assessmentPlan: 'Assessment:\n1. Acne Vulgaris, moderate inflammatory (L70.0)\n2. Early acne scarring\n\nPlan:\n1. Start isotretinoin counseling and baseline lab workup\n2. Continue benzoyl peroxide 5% wash each morning\n3. Start clindamycin 1% lotion daily until isotretinoin begins\n4. Register patient in iPLEDGE and review adverse effects\n5. Return in 6-8 weeks for treatment start and lab review',
    createdAt: '2026-01-09T15:00:00Z', updatedAt: '2026-01-09T15:20:00Z',
  },
  {
    id: 'enc-m2', tenantId: 'tenant-demo', appointmentId: 'appt-m2',
    patientId: 'demo-patient-3', patientName: 'Marcus Williams',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Month-two isotretinoin follow-up',
    hpi: 'Marcus returns after starting isotretinoin 40mg daily. Reports dryness of lips and mild facial xerosis but no headaches, vision changes, mood changes, or severe myalgias. Acne flares are decreasing. Baseline and interval CBC, CMP, and lipid panel reviewed.',
    ros: 'Integumentary: Improving inflammatory acne, expected dryness. Neurologic: Denies headaches. Psychiatric: Denies mood change. All other systems reviewed and negative.',
    exam: 'Skin: Fewer inflammatory papules on cheeks and chin compared with prior. Mild cheilitis. Upper back with resolving papules. No severe nodulocystic lesions.',
    assessmentPlan: 'Assessment:\n1. Acne Vulgaris (L70.0) — improving on isotretinoin\n2. Isotretinoin-associated xerosis/cheilitis, mild\n\nPlan:\n1. Continue isotretinoin 40mg daily\n2. Continue bland emollients and lip balm PRN\n3. Repeat CBC, CMP, fasting lipid panel in 4 weeks\n4. Continue benzoyl peroxide wash to back only as tolerated\n5. Return in 6 weeks',
    createdAt: '2026-03-21T15:30:00Z', updatedAt: '2026-03-21T15:55:00Z',
  },
];

export const ENCOUNTERS_SOFIA = [
  {
    id: 'enc-s1', tenantId: 'tenant-demo', appointmentId: 'appt-s1',
    patientId: 'demo-patient-4', patientName: 'Sofia Chen',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Hormonal acne, hyperpigmentation, and melasma',
    hpi: 'Sofia Chen is a 30-year-old female presenting with lower-face acne flares around menses, post-inflammatory hyperpigmentation, and worsening melasma on the cheeks after summer sun exposure. No prior prescription acne regimen.',
    ros: 'Integumentary: Positive for jawline papules, hyperpigmentation, and facial dyspigmentation. Endocrine: Denies hirsutism. All other systems reviewed and negative.',
    exam: 'Skin: Inflammatory papules along jawline and chin, few closed comedones on forehead, faint symmetric tan-brown patches on bilateral malar cheeks consistent with melasma. No nodulocystic lesions.',
    assessmentPlan: 'Assessment:\n1. Acne Vulgaris, hormonal pattern (L70.0)\n2. Melasma (L81.1)\n3. Post-inflammatory hyperpigmentation\n\nPlan:\n1. Start spironolactone 50mg daily\n2. Start tretinoin 0.05% cream nightly as tolerated\n3. Start azelaic acid 15% gel each morning\n4. Reinforce tinted mineral SPF 50+ daily\n5. Follow up in 3-4 months',
    createdAt: '2025-10-02T16:50:00Z', updatedAt: '2025-10-02T17:10:00Z',
  },
  {
    id: 'enc-s2', tenantId: 'tenant-demo', appointmentId: 'appt-s2',
    patientId: 'demo-patient-4', patientName: 'Sofia Chen',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    status: 'locked',
    chiefComplaint: 'Acne and pigment follow-up',
    hpi: 'Sofia returns for follow-up after starting spironolactone, azelaic acid, and tretinoin. She reports fewer jawline breakouts, less oiliness, and mild dryness during week two that improved with moisturizer. Melasma remains stable with sunscreen use.',
    ros: 'Integumentary: Improvement in acne frequency. GU: Denies dizziness or breast tenderness from spironolactone. All other systems reviewed and negative.',
    exam: 'Skin: Markedly fewer inflammatory papules on chin and jawline, residual post-inflammatory hyperpigmented macules, stable faint melasma patches on cheeks.',
    assessmentPlan: 'Assessment:\n1. Hormonal Acne — improving\n2. Melasma — stable\n\nPlan:\n1. Continue spironolactone 50mg daily\n2. Continue tretinoin 0.05% cream 3-5 nights weekly\n3. Continue azelaic acid 15% gel daily\n4. Consider hydroquinone cycle if melasma worsens\n5. Return in 3 months or sooner if flare occurs',
    createdAt: '2026-02-11T11:35:00Z', updatedAt: '2026-02-11T11:50:00Z',
  },
];

export const ALL_ENCOUNTERS = [
  ...ENCOUNTERS_ALEX,
  ...ENCOUNTERS_JANE,
  ...ENCOUNTERS_MARCUS,
  ...ENCOUNTERS_SOFIA,
  ...GENERATED_PRACTICE_DATA.encounters,
];

// ── Vitals ────────────────────────────────────────────────────────────────────

export const VITALS_ALEX = [
  {
    id: 'vit-a1', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a1',
    heightCm: 178, weightKg: 82.0, bpSystolic: 122, bpDiastolic: 78, pulse: 68,
    tempC: 37.0, o2Saturation: 98, respiratoryRate: 16, recordedAt: '2025-11-12T10:10:00Z',
    createdAt: '2025-11-12T10:10:00Z',
  },
  {
    id: 'vit-a2', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a2',
    heightCm: 178, weightKg: 81.5, bpSystolic: 118, bpDiastolic: 74, pulse: 72,
    tempC: 36.8, o2Saturation: 99, respiratoryRate: 15, recordedAt: '2026-01-15T09:10:00Z',
    createdAt: '2026-01-15T09:10:00Z',
  },
  {
    id: 'vit-a3', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a3',
    heightCm: 178, weightKg: 82.0, bpSystolic: 120, bpDiastolic: 76, pulse: 70,
    tempC: 36.9, o2Saturation: 98, respiratoryRate: 16, recordedAt: '2026-03-08T10:10:00Z',
    createdAt: '2026-03-08T10:10:00Z',
  },
];

export const VITALS_JANE = [
  {
    id: 'vit-j1', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j1',
    heightCm: 165, weightKg: 62.0, bpSystolic: 108, bpDiastolic: 68, pulse: 76,
    tempC: 36.9, o2Saturation: 99, respiratoryRate: 14, recordedAt: '2025-12-03T14:10:00Z',
    createdAt: '2025-12-03T14:10:00Z',
  },
  {
    id: 'vit-j2', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j2',
    heightCm: 165, weightKg: 62.0, bpSystolic: 112, bpDiastolic: 70, pulse: 80,
    tempC: 36.8, o2Saturation: 99, respiratoryRate: 15, recordedAt: '2026-02-20T08:10:00Z',
    createdAt: '2026-02-20T08:10:00Z',
  },
];

export const VITALS_MARCUS = [
  {
    id: 'vit-m1', tenantId: 'tenant-demo', patientId: 'demo-patient-3', encounterId: 'enc-m1',
    heightCm: 183, weightKg: 78.0, bpSystolic: 116, bpDiastolic: 72, pulse: 66,
    tempC: 36.7, o2Saturation: 99, respiratoryRate: 15, recordedAt: '2026-01-09T14:05:00Z',
    createdAt: '2026-01-09T14:05:00Z',
  },
  {
    id: 'vit-m2', tenantId: 'tenant-demo', patientId: 'demo-patient-3', encounterId: 'enc-m2',
    heightCm: 183, weightKg: 77.1, bpSystolic: 118, bpDiastolic: 74, pulse: 70,
    tempC: 36.8, o2Saturation: 99, respiratoryRate: 16, recordedAt: '2026-03-21T15:05:00Z',
    createdAt: '2026-03-21T15:05:00Z',
  },
];

export const VITALS_SOFIA = [
  {
    id: 'vit-s1', tenantId: 'tenant-demo', patientId: 'demo-patient-4', encounterId: 'enc-s1',
    heightCm: 168, weightKg: 58.0, bpSystolic: 110, bpDiastolic: 68, pulse: 72,
    tempC: 36.9, o2Saturation: 99, respiratoryRate: 14, recordedAt: '2025-10-02T16:05:00Z',
    createdAt: '2025-10-02T16:05:00Z',
  },
  {
    id: 'vit-s2', tenantId: 'tenant-demo', patientId: 'demo-patient-4', encounterId: 'enc-s2',
    heightCm: 168, weightKg: 57.6, bpSystolic: 108, bpDiastolic: 66, pulse: 70,
    tempC: 36.8, o2Saturation: 99, respiratoryRate: 14, recordedAt: '2026-02-11T11:05:00Z',
    createdAt: '2026-02-11T11:05:00Z',
  },
];

export const ALL_VITALS = [
  ...VITALS_ALEX,
  ...VITALS_JANE,
  ...VITALS_MARCUS,
  ...VITALS_SOFIA,
  ...GENERATED_PRACTICE_DATA.vitals,
];

// ── Prescriptions ─────────────────────────────────────────────────────────────

export const PRESCRIPTIONS_ALEX = [
  {
    id: 'rx-a1', tenantId: 'tenant-demo', patientId: 'demo-patient-1',
    patientFirstName: 'Alex', patientLastName: 'Johnson', encounterId: 'enc-a2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Methotrexate', genericName: 'Methotrexate',
    strength: '2.5mg', dosageForm: 'Tablet', sig: 'Take 6 tablets (15mg) by mouth once weekly on the same day each week. Take folic acid 1mg daily on all other days.',
    quantity: 24, quantityUnit: 'tablets', refills: 5, daysSupply: 28,
    pharmacyName: 'Walgreens - Denver', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2026-01-15', createdAt: '2026-01-15T10:30:00Z',
  },
  {
    id: 'rx-a2', tenantId: 'tenant-demo', patientId: 'demo-patient-1',
    patientFirstName: 'Alex', patientLastName: 'Johnson', encounterId: 'enc-a2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Tretinoin', genericName: 'Tretinoin',
    strength: '0.025%', dosageForm: 'Cream', sig: 'Apply a pea-sized amount to affected areas once nightly. Avoid eyes, lips, and nostrils. Use sunscreen daily.',
    quantity: 1, quantityUnit: 'tube (45g)', refills: 3, daysSupply: 90,
    pharmacyName: 'Walgreens - Denver', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2026-01-15', createdAt: '2026-01-15T10:35:00Z',
  },
  {
    id: 'rx-a3', tenantId: 'tenant-demo', patientId: 'demo-patient-1',
    patientFirstName: 'Alex', patientLastName: 'Johnson', encounterId: 'enc-a1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Clobetasol Propionate', genericName: 'Clobetasol Propionate',
    strength: '0.05%', dosageForm: 'Ointment', sig: 'Apply thin layer to affected areas twice daily for 2 weeks, then taper to once daily for 1 week.',
    quantity: 1, quantityUnit: 'tube (60g)', refills: 0, daysSupply: 21,
    pharmacyName: 'Walgreens - Denver', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2025-11-12', createdAt: '2025-11-12T12:00:00Z',
  },
];

export const PRESCRIPTIONS_JANE = [
  {
    id: 'rx-j1', tenantId: 'tenant-demo', patientId: 'demo-patient-2',
    patientFirstName: 'Jane', patientLastName: 'Doe', encounterId: 'enc-j1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Dupilumab (Dupixent)', genericName: 'Dupilumab',
    strength: '300mg/2mL', dosageForm: 'Injection', sig: 'Inject 300mg subcutaneously every 2 weeks. Administer in thigh, abdomen, or upper arm. Rotate injection sites.',
    quantity: 2, quantityUnit: 'pre-filled syringes', refills: 5, daysSupply: 28,
    pharmacyName: 'CVS Specialty - Boulder', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2025-12-03', createdAt: '2025-12-03T16:00:00Z',
  },
  {
    id: 'rx-j2', tenantId: 'tenant-demo', patientId: 'demo-patient-2',
    patientFirstName: 'Jane', patientLastName: 'Doe', encounterId: 'enc-j1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Hydrocortisone', genericName: 'Hydrocortisone',
    strength: '2.5%', dosageForm: 'Cream', sig: 'Apply to affected areas twice daily as needed for flares. Do not use on face or groin for more than 1 week without physician guidance.',
    quantity: 1, quantityUnit: 'tube (60g)', refills: 2, daysSupply: 60,
    pharmacyName: 'CVS - Boulder', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2025-12-03', createdAt: '2025-12-03T16:05:00Z',
  },
  {
    id: 'rx-j3', tenantId: 'tenant-demo', patientId: 'demo-patient-2',
    patientFirstName: 'Jane', patientLastName: 'Doe', encounterId: 'enc-j1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Cetirizine (Zyrtec)', genericName: 'Cetirizine HCl',
    strength: '10mg', dosageForm: 'Tablet', sig: 'Take 1 tablet by mouth once daily at bedtime for itching.',
    quantity: 90, quantityUnit: 'tablets', refills: 3, daysSupply: 90,
    pharmacyName: 'CVS - Boulder', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2025-12-03', createdAt: '2025-12-03T16:08:00Z',
  },
];

export const PRESCRIPTIONS_MARCUS = [
  {
    id: 'rx-m1', tenantId: 'tenant-demo', patientId: 'demo-patient-3',
    patientFirstName: 'Marcus', patientLastName: 'Williams', encounterId: 'enc-m2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Isotretinoin', genericName: 'Isotretinoin',
    strength: '40mg', dosageForm: 'Capsule', sig: 'Take 1 capsule by mouth once daily with food.',
    quantity: 30, quantityUnit: 'capsules', refills: 0, daysSupply: 30,
    pharmacyName: 'King Soopers Pharmacy - Denver', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2026-03-21', createdAt: '2026-03-21T15:58:00Z',
  },
  {
    id: 'rx-m2', tenantId: 'tenant-demo', patientId: 'demo-patient-3',
    patientFirstName: 'Marcus', patientLastName: 'Williams', encounterId: 'enc-m1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Clindamycin', genericName: 'Clindamycin Phosphate',
    strength: '1%', dosageForm: 'Lotion', sig: 'Apply a thin layer to acne-prone areas once daily.',
    quantity: 1, quantityUnit: 'bottle (60mL)', refills: 2, daysSupply: 60,
    pharmacyName: 'King Soopers Pharmacy - Denver', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2026-01-09', createdAt: '2026-01-09T15:10:00Z',
  },
  {
    id: 'rx-m3', tenantId: 'tenant-demo', patientId: 'demo-patient-3',
    patientFirstName: 'Marcus', patientLastName: 'Williams', encounterId: 'enc-m1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Benzoyl Peroxide Wash', genericName: 'Benzoyl Peroxide',
    strength: '5%', dosageForm: 'Wash', sig: 'Wash face and upper back once daily. Rinse thoroughly.',
    quantity: 1, quantityUnit: 'bottle', refills: 3, daysSupply: 90,
    pharmacyName: 'King Soopers Pharmacy - Denver', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2026-01-09', createdAt: '2026-01-09T15:12:00Z',
  },
];

export const PRESCRIPTIONS_SOFIA = [
  {
    id: 'rx-s1', tenantId: 'tenant-demo', patientId: 'demo-patient-4',
    patientFirstName: 'Sofia', patientLastName: 'Chen', encounterId: 'enc-s1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Spironolactone', genericName: 'Spironolactone',
    strength: '50mg', dosageForm: 'Tablet', sig: 'Take 1 tablet by mouth once daily.',
    quantity: 30, quantityUnit: 'tablets', refills: 5, daysSupply: 30,
    pharmacyName: 'CVS Pharmacy - Boulder', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2025-10-02', createdAt: '2025-10-02T17:05:00Z',
  },
  {
    id: 'rx-s2', tenantId: 'tenant-demo', patientId: 'demo-patient-4',
    patientFirstName: 'Sofia', patientLastName: 'Chen', encounterId: 'enc-s1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Tretinoin', genericName: 'Tretinoin',
    strength: '0.05%', dosageForm: 'Cream', sig: 'Apply a pea-sized amount to the full face at bedtime 3 nights weekly, then increase as tolerated.',
    quantity: 1, quantityUnit: 'tube (45g)', refills: 3, daysSupply: 90,
    pharmacyName: 'CVS Pharmacy - Boulder', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2025-10-02', createdAt: '2025-10-02T17:06:00Z',
  },
  {
    id: 'rx-s3', tenantId: 'tenant-demo', patientId: 'demo-patient-4',
    patientFirstName: 'Sofia', patientLastName: 'Chen', encounterId: 'enc-s2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    medicationName: 'Azelaic Acid', genericName: 'Azelaic Acid',
    strength: '15%', dosageForm: 'Gel', sig: 'Apply a thin layer to the full face each morning.',
    quantity: 1, quantityUnit: 'tube (50g)', refills: 2, daysSupply: 60,
    pharmacyName: 'CVS Pharmacy - Boulder', status: 'transmitted', erxStatus: 'success',
    writtenDate: '2026-02-11', createdAt: '2026-02-11T11:45:00Z',
  },
];

export const ALL_PRESCRIPTIONS = [
  ...PRESCRIPTIONS_ALEX,
  ...PRESCRIPTIONS_JANE,
  ...PRESCRIPTIONS_MARCUS,
  ...PRESCRIPTIONS_SOFIA,
  ...GENERATED_PRACTICE_DATA.prescriptions,
];

// ── Orders ────────────────────────────────────────────────────────────────────

export const ORDERS_ALEX = [
  {
    id: 'ord-a1', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a3',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'biopsy', status: 'closed', priority: 'routine',
    details: 'Punch biopsy (4mm) — right forearm. Suspicious pigmented papule, 1.1cm. R/O melanoma vs. BCC vs. dermatofibroma.',
    notes: 'Specimen sent to Mountain Pine Pathology Lab. Patient tolerated procedure well.',
    resultFlag: 'benign',
    resultFlagUpdatedAt: '2026-03-12T08:00:00Z',
    resultFlagUpdatedBy: 'Dr. David Skin, MD, FAAD',
    createdAt: '2026-03-08T10:45:00Z',
  },
  {
    id: 'ord-a2', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'procedure', status: 'closed', priority: 'routine',
    details: 'Cryotherapy with liquid nitrogen — 3 seborrheic keratoses on upper back (0.5cm, 0.7cm, 0.6cm). 10-second freeze cycles x2 each.',
    notes: 'Procedure completed without complications. Patient tolerated well. Counseled on expected blistering and healing.',
    resultFlag: 'none',
    createdAt: '2026-01-15T09:30:00Z',
  },
  {
    id: 'ord-a3', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'lab', status: 'closed', priority: 'routine',
    details: 'CBC with differential, CMP (BMP + LFTs), Hepatitis B surface Ag — baseline Methotrexate labs.',
    notes: 'Results reviewed 2026-01-18: All within normal limits. ALT 22, AST 19, Cr 0.9. Cleared for Methotrexate initiation.',
    resultFlag: 'normal',
    resultFlagUpdatedAt: '2026-01-18T09:00:00Z',
    resultFlagUpdatedBy: 'Dr. David Skin, MD, FAAD',
    createdAt: '2026-01-15T09:45:00Z',
  },
];

export const ORDERS_JANE = [
  {
    id: 'ord-j1', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'procedure', status: 'closed', priority: 'stat',
    details: 'Mohs micrographic surgery — nodular basal cell carcinoma, right cheek. Two stages to clear margins. Primary layered closure.',
    notes: 'Stage 1: positive inferior margin. Stage 2: clear margins. Defect 2.2x2.0cm, primary closure. Excellent cosmetic outcome expected.',
    resultFlag: 'none',
    resultFlagUpdatedAt: '2026-02-20T12:00:00Z',
    resultFlagUpdatedBy: 'Dr. David Skin, MD, FAAD',
    createdAt: '2026-02-20T08:00:00Z',
  },
  {
    id: 'ord-j2', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'biopsy', status: 'closed', priority: 'stat',
    details: 'Punch biopsy (6mm) — right cheek. Pearly papule with arborizing vessels on dermoscopy. High suspicion for BCC.',
    notes: 'STAT pathology requested. Result: Nodular Basal Cell Carcinoma. Scheduled for Mohs surgery.',
    resultFlag: 'cancerous',
    resultFlagUpdatedAt: '2025-12-06T10:00:00Z',
    resultFlagUpdatedBy: 'Dr. David Skin, MD, FAAD',
    createdAt: '2025-12-03T15:00:00Z',
  },
  {
    id: 'ord-j3', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'procedure', status: 'pending', priority: 'routine',
    details: 'Extended patch test panel (27 allergens) — evaluate for contact allergens contributing to eczema flares. Known nickel allergy.',
    notes: 'Scheduled at 5/14/2026 follow-up. Patient to avoid antihistamines and topical steroids 7 days prior.',
    resultFlag: 'none',
    createdAt: '2025-12-03T15:15:00Z',
  },
];

export const ORDERS_MARCUS = [
  {
    id: 'ord-m1', tenantId: 'tenant-demo', patientId: 'demo-patient-3', encounterId: 'enc-m1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'lab', status: 'closed', priority: 'routine',
    details: 'Baseline isotretinoin labs: CBC, CMP, fasting lipid panel.',
    notes: 'Results acceptable for isotretinoin start. Mild triglyceride elevation reviewed.',
    resultFlag: 'normal',
    resultFlagUpdatedAt: '2026-01-12T09:00:00Z',
    resultFlagUpdatedBy: 'Dr. David Skin, MD, FAAD',
    createdAt: '2026-01-09T15:15:00Z',
  },
  {
    id: 'ord-m2', tenantId: 'tenant-demo', patientId: 'demo-patient-3', encounterId: 'enc-m2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'lab', status: 'closed', priority: 'routine',
    details: 'Interval isotretinoin monitoring labs: CBC, CMP, fasting lipid panel.',
    notes: 'ALT/AST remain normal. Triglycerides mildly elevated but stable.',
    resultFlag: 'abnormal',
    resultFlagUpdatedAt: '2026-03-24T09:00:00Z',
    resultFlagUpdatedBy: 'Dr. David Skin, MD, FAAD',
    createdAt: '2026-03-21T15:32:00Z',
  },
];

export const ORDERS_SOFIA = [
  {
    id: 'ord-s1', tenantId: 'tenant-demo', patientId: 'demo-patient-4', encounterId: 'enc-s1',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'lab', status: 'closed', priority: 'routine',
    details: 'Baseline potassium and creatinine before/after spironolactone initiation.',
    notes: 'Baseline renal function and potassium within normal limits.',
    resultFlag: 'normal',
    resultFlagUpdatedAt: '2025-10-05T09:00:00Z',
    resultFlagUpdatedBy: 'Dr. David Skin, MD, FAAD',
    createdAt: '2025-10-02T17:00:00Z',
  },
  {
    id: 'ord-s2', tenantId: 'tenant-demo', patientId: 'demo-patient-4', encounterId: 'enc-s2',
    providerId: 'demo-provider-1', providerName: 'Dr. David Skin, MD, FAAD',
    type: 'procedure', status: 'pending', priority: 'routine',
    details: 'Serial facial photography for acne and melasma response tracking.',
    notes: 'Repeat clinical photos planned at next follow-up.',
    resultFlag: 'none',
    createdAt: '2026-02-11T11:48:00Z',
  },
];

export const ALL_ORDERS = [
  ...ORDERS_ALEX,
  ...ORDERS_JANE,
  ...ORDERS_MARCUS,
  ...ORDERS_SOFIA,
  ...GENERATED_PRACTICE_DATA.orders,
];

// ── Documents ─────────────────────────────────────────────────────────────────

export const DOCUMENTS_ALEX = [
  {
    id: 'doc-a1', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a3',
    title: 'Pathology Report — Right Forearm Biopsy',
    type: 'pathology_report', category: 'Lab / Pathology',
    description: 'Punch biopsy right forearm: Benign intradermal nevus. No evidence of malignancy.',
    filename: 'path_report_johnson_030826.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-03-12T08:00:00Z',
  },
  {
    id: 'doc-a2', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a2',
    title: 'Lab Results — CBC / CMP / LFTs (Jan 2026)',
    type: 'lab_result', category: 'Lab / Pathology',
    description: 'Baseline labs prior to Methotrexate initiation. All results within normal limits.',
    filename: 'labs_johnson_011526.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-01-18T09:00:00Z',
  },
  {
    id: 'doc-a3', tenantId: 'tenant-demo', patientId: 'demo-patient-1', encounterId: 'enc-a3',
    title: 'Visit Summary — March 8, 2026',
    type: 'visit_summary', category: 'Visit Notes',
    description: 'Follow-up for psoriasis on Methotrexate. Skin biopsy performed. Excellent treatment response.',
    filename: 'visit_johnson_030826.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-03-08T12:00:00Z',
  },
  {
    id: 'doc-a4', tenantId: 'tenant-demo', patientId: 'demo-patient-1',
    title: 'Insurance EOB — BCBS (January 2026)',
    type: 'eob', category: 'Insurance',
    description: 'Explanation of Benefits for 01/15/2026 visit. Cryotherapy and office visit charges processed.',
    filename: 'eob_johnson_jan2026.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-02-05T00:00:00Z',
  },
];

export const DOCUMENTS_JANE = [
  {
    id: 'doc-j1', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j1',
    title: 'Pathology Report — Basal Cell Carcinoma, Right Cheek',
    type: 'pathology_report', category: 'Lab / Pathology',
    description: 'Punch biopsy right cheek: Nodular basal cell carcinoma confirmed. Mohs surgery recommended.',
    filename: 'path_report_doe_120325.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2025-12-06T10:00:00Z',
  },
  {
    id: 'doc-j2', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j2',
    title: 'Mohs Surgery Operative Note — Feb 20, 2026',
    type: 'operative_note', category: 'Procedure Notes',
    description: 'Mohs micrographic surgery for BCC right cheek. 2 stages, clear margins achieved. Primary closure.',
    filename: 'mohs_op_note_doe_022026.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-02-20T13:30:00Z',
  },
  {
    id: 'doc-j3', tenantId: 'tenant-demo', patientId: 'demo-patient-2',
    title: 'Insurance EOB — Aetna (Mohs Surgery, Feb 2026)',
    type: 'eob', category: 'Insurance',
    description: 'EOB for Mohs surgery 02/20/2026. Total charges $4,850.00. Insurance paid $3,958.00. Patient responsibility: $892.00.',
    filename: 'eob_doe_mohs_feb2026.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-03-15T00:00:00Z',
  },
  {
    id: 'doc-j4', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j1',
    title: 'Visit Summary — December 3, 2025',
    type: 'visit_summary', category: 'Visit Notes',
    description: 'New patient consultation. Eczema treatment plan initiated. BCC biopsy performed.',
    filename: 'visit_doe_120325.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2025-12-03T16:30:00Z',
  },
  {
    id: 'doc-j5', tenantId: 'tenant-demo', patientId: 'demo-patient-2', encounterId: 'enc-j2',
    title: 'Dupixent Prior Authorization — Approved',
    type: 'prior_auth', category: 'Insurance',
    description: 'Prior authorization for Dupilumab (Dupixent) 300mg q2w. Approved by Aetna. Auth #: AET-PA-2025-88741.',
    filename: 'prior_auth_dupixent_doe.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2025-12-10T09:00:00Z',
  },
];

export const DOCUMENTS_MARCUS = [
  {
    id: 'doc-m1', tenantId: 'tenant-demo', patientId: 'demo-patient-3', encounterId: 'enc-m1',
    title: 'Isotretinoin Consent & Counseling',
    type: 'consent', category: 'Consents',
    description: 'Signed isotretinoin counseling acknowledgement and iPLEDGE documentation.',
    filename: 'isotretinoin_consent_williams.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-01-09T15:20:00Z',
  },
  {
    id: 'doc-m2', tenantId: 'tenant-demo', patientId: 'demo-patient-3', encounterId: 'enc-m2',
    title: 'Lab Results — Isotretinoin Monitoring (March 2026)',
    type: 'lab_result', category: 'Lab / Pathology',
    description: 'CBC, CMP, and lipid panel during isotretinoin therapy.',
    filename: 'labs_williams_032126.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-03-24T09:00:00Z',
  },
  {
    id: 'doc-m3', tenantId: 'tenant-demo', patientId: 'demo-patient-3', encounterId: 'enc-m2',
    title: 'Visit Summary — March 21, 2026',
    type: 'visit_summary', category: 'Visit Notes',
    description: 'Isotretinoin month-two follow-up with improving acne and mild dryness.',
    filename: 'visit_williams_032126.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-03-21T16:00:00Z',
  },
];

export const DOCUMENTS_SOFIA = [
  {
    id: 'doc-s1', tenantId: 'tenant-demo', patientId: 'demo-patient-4', encounterId: 'enc-s1',
    title: 'Treatment Plan — Acne & Melasma',
    type: 'care_plan', category: 'Visit Notes',
    description: 'Initial treatment plan including spironolactone, tretinoin, azelaic acid, and sun protection.',
    filename: 'care_plan_chen_100225.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2025-10-02T17:15:00Z',
  },
  {
    id: 'doc-s2', tenantId: 'tenant-demo', patientId: 'demo-patient-4', encounterId: 'enc-s2',
    title: 'Visit Summary — February 11, 2026',
    type: 'visit_summary', category: 'Visit Notes',
    description: 'Acne improving on spironolactone and tretinoin; melasma stable.',
    filename: 'visit_chen_021126.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-02-11T12:00:00Z',
  },
  {
    id: 'doc-s3', tenantId: 'tenant-demo', patientId: 'demo-patient-4',
    title: 'Insurance EOB — Cigna (February 2026)',
    type: 'eob', category: 'Insurance',
    description: 'Explanation of benefits for acne follow-up visit on 02/11/2026.',
    filename: 'eob_chen_feb2026.pdf', mimeType: 'application/pdf',
    url: '#', storage: 'local', createdAt: '2026-03-02T00:00:00Z',
  },
];

export const ALL_DOCUMENTS = [
  ...DOCUMENTS_ALEX,
  ...DOCUMENTS_JANE,
  ...DOCUMENTS_MARCUS,
  ...DOCUMENTS_SOFIA,
  ...GENERATED_PRACTICE_DATA.documents,
];

// ── Eligibility History ────────────────────────────────────────────────────────

export const ELIGIBILITY_ALEX = [
  {
    id: 'elig-a1', patientId: 'demo-patient-1', appointmentId: 'appt-a2',
    payer: 'Blue Cross Blue Shield of Colorado', planName: 'PPO Gold Plan',
    memberId: 'BCB987654321', groupNumber: 'GRP-45890',
    eligibilityStatus: 'Active', verifiedAt: '2026-01-14T08:00:00Z',
    verifiedBy: 'Admin User',
    copay: 30, deductible: 1500, remainingDeductible: 1122.50,
    outOfPocket: 5000, remainingOutOfPocket: 3519.50,
  },
  {
    id: 'elig-a2', patientId: 'demo-patient-1', appointmentId: 'appt-a3',
    payer: 'Blue Cross Blue Shield of Colorado', planName: 'PPO Gold Plan',
    memberId: 'BCB987654321', groupNumber: 'GRP-45890',
    eligibilityStatus: 'Active', verifiedAt: '2026-03-07T08:00:00Z',
    verifiedBy: 'Admin User',
    copay: 30, deductible: 1500, remainingDeductible: 892.50,
    outOfPocket: 5000, remainingOutOfPocket: 3247.00,
  },
];

export const ELIGIBILITY_JANE = [
  {
    id: 'elig-j1', patientId: 'demo-patient-2', appointmentId: 'appt-j2',
    payer: 'Aetna', planName: 'HMO Silver Plan',
    memberId: 'AET123456789', groupNumber: 'GRP-22341',
    eligibilityStatus: 'Active', verifiedAt: '2026-02-19T08:00:00Z',
    verifiedBy: 'Admin User',
    copay: 45, deductible: 2500, remainingDeductible: 2455.00,
    outOfPocket: 7500, remainingOutOfPocket: 6608.00,
  },
];

export const ELIGIBILITY_MARCUS = [
  {
    id: 'elig-m1', patientId: 'demo-patient-3', appointmentId: 'appt-m2',
    payer: 'United Healthcare', planName: 'Choice Plus PPO',
    memberId: 'UHC402883145', groupNumber: 'GRP-78112',
    eligibilityStatus: 'Active', verifiedAt: '2026-03-20T08:00:00Z',
    verifiedBy: 'Admin User',
    copay: 35, deductible: 1200, remainingDeductible: 420.00,
    outOfPocket: 4500, remainingOutOfPocket: 1898.00,
  },
];

export const ELIGIBILITY_SOFIA = [
  {
    id: 'elig-s1', patientId: 'demo-patient-4', appointmentId: 'appt-s2',
    payer: 'Cigna', planName: 'Open Access Plus',
    memberId: 'CIG554001892', groupNumber: 'GRP-66418',
    eligibilityStatus: 'Active', verifiedAt: '2026-02-10T08:00:00Z',
    verifiedBy: 'Admin User',
    copay: 40, deductible: 1800, remainingDeductible: 980.00,
    outOfPocket: 5500, remainingOutOfPocket: 4312.00,
  },
];

// ── Portal Billing Data ────────────────────────────────────────────────────────

export const PORTAL_BILLING_ALEX = {
  balance: {
    totalCharges: 1847.50,
    totalPayments: 1600.00,
    totalAdjustments: 0,
    currentBalance: 247.50,
    lastPaymentDate: '2026-01-20',
    lastPaymentAmount: 60.00,
  },
  charges: [
    {
      id: 'chg-a1', serviceDate: '2025-11-12', description: 'New Patient Consultation (99204)',
      amount: 380.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'Psoriasis evaluation', createdAt: '2025-11-12T12:00:00Z',
    },
    {
      id: 'chg-a2', serviceDate: '2025-11-12', description: 'Insurance Payment — BCBS',
      amount: -320.00, transactionType: 'insurance_payment', createdAt: '2025-12-01T00:00:00Z',
    },
    {
      id: 'chg-a3', serviceDate: '2025-11-12', description: 'Patient Copay',
      amount: -30.00, transactionType: 'patient_payment', createdAt: '2025-11-12T12:00:00Z',
    },
    {
      id: 'chg-a4', serviceDate: '2026-01-15', description: 'Follow-Up Visit + Procedure (99213 + 17000)',
      amount: 680.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'Psoriasis follow-up, cryotherapy', createdAt: '2026-01-15T11:00:00Z',
    },
    {
      id: 'chg-a5', serviceDate: '2026-01-15', description: 'Insurance Payment — BCBS',
      amount: -530.00, transactionType: 'insurance_payment', createdAt: '2026-02-10T00:00:00Z',
    },
    {
      id: 'chg-a6', serviceDate: '2026-01-15', description: 'Patient Copay',
      amount: -30.00, transactionType: 'patient_payment', createdAt: '2026-01-20T00:00:00Z',
    },
    {
      id: 'chg-a7', serviceDate: '2026-03-08', description: 'Follow-Up Visit + Biopsy (99213 + 11100)',
      amount: 787.50, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'Psoriasis follow-up, skin biopsy', createdAt: '2026-03-08T11:00:00Z',
    },
    {
      id: 'chg-a8', serviceDate: '2026-03-08', description: 'Insurance Payment — BCBS (Pending)',
      amount: -510.00, transactionType: 'insurance_payment', createdAt: '2026-04-01T00:00:00Z',
    },
    // Balance: 787.50 - 510.00 = 277.50 → with copay paid = 247.50
    {
      id: 'chg-a9', serviceDate: '2026-03-08', description: 'Patient Copay — Pending',
      amount: -30.00, transactionType: 'pending', createdAt: '2026-03-08T11:00:00Z',
    },
  ],
  statements: [
    {
      id: 'stmt-a1', statementDate: '2026-04-01', dueDate: '2026-05-01',
      amount: 247.50, status: 'outstanding',
      description: 'Statement for services rendered March 2026',
    },
  ],
  paymentHistory: [
    {
      id: 'pay-a1', amount: 30.00, currency: 'USD', status: 'completed',
      paymentMethodType: 'credit_card', description: 'Copay — Jan 15, 2026 visit',
      receiptNumber: 'RCT-20260115', refundAmount: 0,
      createdAt: '2026-01-20T09:00:00Z', completedAt: '2026-01-20T09:00:00Z',
    },
    {
      id: 'pay-a2', amount: 30.00, currency: 'USD', status: 'completed',
      paymentMethodType: 'credit_card', description: 'Copay — Nov 12, 2025 visit',
      receiptNumber: 'RCT-20251112', refundAmount: 0,
      createdAt: '2025-11-12T12:00:00Z', completedAt: '2025-11-12T12:00:00Z',
    },
  ],
  paymentMethods: [
    {
      id: 'pm-a1', paymentType: 'credit_card', lastFour: '4242',
      cardBrand: 'Visa', cardholderName: 'Alex Johnson',
      expiryMonth: 9, expiryYear: 2028, isDefault: true,
      createdAt: '2023-06-15T08:00:00Z',
    },
  ],
};

export const PORTAL_BILLING_JANE = {
  balance: {
    totalCharges: 5300.00,
    totalPayments: 4408.00,
    totalAdjustments: 0,
    currentBalance: 892.00,
    lastPaymentDate: '2025-12-04',
    lastPaymentAmount: 45.00,
  },
  charges: [
    {
      id: 'chg-j1', serviceDate: '2025-12-03', description: 'New Patient Consultation (99205)',
      amount: 430.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'Eczema + skin lesion evaluation', createdAt: '2025-12-03T16:00:00Z',
    },
    {
      id: 'chg-j2', serviceDate: '2025-12-03', description: 'Punch Biopsy (11100)',
      amount: 420.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      createdAt: '2025-12-03T16:00:00Z',
    },
    {
      id: 'chg-j3', serviceDate: '2025-12-03', description: 'Insurance Payment — Aetna',
      amount: -760.00, transactionType: 'insurance_payment', createdAt: '2026-01-08T00:00:00Z',
    },
    {
      id: 'chg-j4', serviceDate: '2025-12-03', description: 'Patient Copay',
      amount: -45.00, transactionType: 'patient_payment', createdAt: '2025-12-04T00:00:00Z',
    },
    {
      id: 'chg-j5', serviceDate: '2026-02-20', description: 'Mohs Micrographic Surgery (17311 + 17312)',
      amount: 4450.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'BCC excision + reconstruction, right cheek', createdAt: '2026-02-20T13:00:00Z',
    },
    {
      id: 'chg-j6', serviceDate: '2026-02-20', description: 'Insurance Payment — Aetna',
      amount: -3558.00, transactionType: 'insurance_payment', createdAt: '2026-03-20T00:00:00Z',
    },
  ],
  statements: [
    {
      id: 'stmt-j1', statementDate: '2026-04-01', dueDate: '2026-05-01',
      amount: 892.00, status: 'outstanding',
      description: 'Statement for Mohs surgery services — February 2026',
    },
  ],
  paymentHistory: [
    {
      id: 'pay-j1', amount: 45.00, currency: 'USD', status: 'completed',
      paymentMethodType: 'credit_card', description: 'Copay — Dec 3, 2025 visit',
      receiptNumber: 'RCT-20251203', refundAmount: 0,
      createdAt: '2025-12-04T09:00:00Z', completedAt: '2025-12-04T09:00:00Z',
    },
  ],
  paymentMethods: [
    {
      id: 'pm-j1', paymentType: 'credit_card', lastFour: '8891',
      cardBrand: 'Mastercard', cardholderName: 'Jane Doe',
      expiryMonth: 3, expiryYear: 2027, isDefault: true,
      createdAt: '2024-01-10T09:00:00Z',
    },
  ],
};

export const PORTAL_BILLING_MARCUS = {
  balance: {
    totalCharges: 1095.00,
    totalPayments: 1013.00,
    totalAdjustments: 0,
    currentBalance: 82.00,
    lastPaymentDate: '2026-03-24',
    lastPaymentAmount: 35.00,
  },
  charges: [
    {
      id: 'chg-m1', serviceDate: '2026-01-09', description: 'Acne Consultation (99203)',
      amount: 295.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'Acne evaluation', createdAt: '2026-01-09T15:00:00Z',
    },
    {
      id: 'chg-m2', serviceDate: '2026-01-09', description: 'Insurance Payment — United Healthcare',
      amount: -225.00, transactionType: 'insurance_payment', createdAt: '2026-01-28T00:00:00Z',
    },
    {
      id: 'chg-m3', serviceDate: '2026-01-09', description: 'Patient Copay',
      amount: -35.00, transactionType: 'patient_payment', createdAt: '2026-01-09T15:05:00Z',
    },
    {
      id: 'chg-m4', serviceDate: '2026-03-21', description: 'Isotretinoin Follow-Up + Labs Review (99213)',
      amount: 240.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'Acne follow-up', createdAt: '2026-03-21T15:55:00Z',
    },
    {
      id: 'chg-m5', serviceDate: '2026-03-21', description: 'Insurance Payment — United Healthcare',
      amount: -158.00, transactionType: 'insurance_payment', createdAt: '2026-04-05T00:00:00Z',
    },
    {
      id: 'chg-m6', serviceDate: '2026-03-21', description: 'Patient Copay',
      amount: -35.00, transactionType: 'patient_payment', createdAt: '2026-03-24T00:00:00Z',
    },
  ],
  statements: [
    {
      id: 'stmt-m1', statementDate: '2026-04-10', dueDate: '2026-05-10',
      amount: 82.00, status: 'outstanding',
      description: 'Statement for March 2026 isotretinoin follow-up',
    },
  ],
  paymentHistory: [
    {
      id: 'pay-m1', amount: 35.00, currency: 'USD', status: 'completed',
      paymentMethodType: 'credit_card', description: 'Copay — Mar 21, 2026 visit',
      receiptNumber: 'RCT-20260321', refundAmount: 0,
      createdAt: '2026-03-24T09:00:00Z', completedAt: '2026-03-24T09:00:00Z',
    },
  ],
  paymentMethods: [
    {
      id: 'pm-m1', paymentType: 'credit_card', lastFour: '1337',
      cardBrand: 'Visa', cardholderName: 'Marcus Williams',
      expiryMonth: 11, expiryYear: 2027, isDefault: true,
      createdAt: '2024-03-20T08:00:00Z',
    },
  ],
};

export const PORTAL_BILLING_SOFIA = {
  balance: {
    totalCharges: 615.00,
    totalPayments: 615.00,
    totalAdjustments: 0,
    currentBalance: 0,
    lastPaymentDate: '2026-02-14',
    lastPaymentAmount: 40.00,
  },
  charges: [
    {
      id: 'chg-s1', serviceDate: '2025-10-02', description: 'New Patient Consultation (99203)',
      amount: 295.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'Hormonal acne and melasma evaluation', createdAt: '2025-10-02T17:00:00Z',
    },
    {
      id: 'chg-s2', serviceDate: '2025-10-02', description: 'Insurance Payment — Cigna',
      amount: -255.00, transactionType: 'insurance_payment', createdAt: '2025-10-28T00:00:00Z',
    },
    {
      id: 'chg-s3', serviceDate: '2025-10-02', description: 'Patient Copay',
      amount: -40.00, transactionType: 'patient_payment', createdAt: '2025-10-02T17:05:00Z',
    },
    {
      id: 'chg-s4', serviceDate: '2026-02-11', description: 'Follow-Up Visit (99213)',
      amount: 200.00, transactionType: 'charge', providerName: 'Dr. David Skin, MD, FAAD',
      chiefComplaint: 'Acne and pigment follow-up', createdAt: '2026-02-11T11:50:00Z',
    },
    {
      id: 'chg-s5', serviceDate: '2026-02-11', description: 'Insurance Payment — Cigna',
      amount: -160.00, transactionType: 'insurance_payment', createdAt: '2026-02-28T00:00:00Z',
    },
    {
      id: 'chg-s6', serviceDate: '2026-02-11', description: 'Patient Copay',
      amount: -40.00, transactionType: 'patient_payment', createdAt: '2026-02-14T00:00:00Z',
    },
  ],
  statements: [],
  paymentHistory: [
    {
      id: 'pay-s1', amount: 40.00, currency: 'USD', status: 'completed',
      paymentMethodType: 'credit_card', description: 'Copay — Feb 11, 2026 visit',
      receiptNumber: 'RCT-20260211', refundAmount: 0,
      createdAt: '2026-02-14T09:00:00Z', completedAt: '2026-02-14T09:00:00Z',
    },
  ],
  paymentMethods: [
    {
      id: 'pm-s1', paymentType: 'credit_card', lastFour: '2819',
      cardBrand: 'Visa', cardholderName: 'Sofia Chen',
      expiryMonth: 6, expiryYear: 2028, isDefault: true,
      createdAt: '2024-08-05T08:00:00Z',
    },
  ],
};

// ── Portal Visit Summaries ─────────────────────────────────────────────────────

export const VISIT_SUMMARIES_ALEX = [
  {
    id: 'vs-a1', encounterId: 'enc-a3', patientId: 'demo-patient-1',
    visitDate: '2026-03-08', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Psoriasis follow-up; suspicious lesion right forearm',
    diagnoses: ['Plaque Psoriasis (L40.0)', 'Skin biopsy — benign intradermal nevus'],
    followUpDate: '2026-04-29', followUpInstructions: 'Return in 7 weeks for psoriasis monitoring and Methotrexate labs.',
    createdAt: '2026-03-08T12:00:00Z',
  },
  {
    id: 'vs-a2', encounterId: 'enc-a2', patientId: 'demo-patient-1',
    visitDate: '2026-01-15', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Psoriasis management upgrade; seborrheic keratoses',
    diagnoses: ['Plaque Psoriasis (L40.0) — initiating Methotrexate', 'Seborrheic Keratoses x3 (L82.1) — cryotherapy performed'],
    followUpDate: '2026-03-08', followUpInstructions: 'Labs in 6 weeks. Return in 8 weeks.',
    createdAt: '2026-01-15T11:00:00Z',
  },
  {
    id: 'vs-a3', encounterId: 'enc-a1', patientId: 'demo-patient-1',
    visitDate: '2025-11-12', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Itchy scaly patches on elbows and knees',
    diagnoses: ['Plaque Psoriasis (L40.0) — new diagnosis'],
    followUpDate: '2026-01-15', followUpInstructions: 'Start clobetasol ointment. Return in 8 weeks.',
    createdAt: '2025-11-12T12:00:00Z',
  },
];

export const VISIT_SUMMARIES_JANE = [
  {
    id: 'vs-j1', encounterId: 'enc-j2', patientId: 'demo-patient-2',
    visitDate: '2026-02-20', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Mohs surgery for BCC right cheek',
    diagnoses: ['Nodular Basal Cell Carcinoma (C44.311) — excised, clear margins'],
    followUpDate: '2026-05-14', followUpInstructions: 'Wound care as instructed. Suture removal completed. Annual full-body skin check required.',
    createdAt: '2026-02-20T13:30:00Z',
  },
  {
    id: 'vs-j2', encounterId: 'enc-j1', patientId: 'demo-patient-2',
    visitDate: '2025-12-03', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Chronic eczema; suspicious cheek lesion',
    diagnoses: ['Atopic Dermatitis, moderate-severe (L20.9)', 'Suspicious BCC, right cheek — biopsy sent'],
    followUpDate: '2026-02-20', followUpInstructions: 'Begin Dupixent. Mohs surgery scheduled 2/20. Moisturize BID.',
    createdAt: '2025-12-03T16:30:00Z',
  },
];

export const VISIT_SUMMARIES_MARCUS = [
  {
    id: 'vs-m1', encounterId: 'enc-m2', patientId: 'demo-patient-3',
    visitDate: '2026-03-21', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Isotretinoin follow-up',
    diagnoses: ['Acne Vulgaris (L70.0) — improving on isotretinoin', 'Cheilitis/xerosis, mild'],
    followUpDate: '2026-05-07', followUpInstructions: 'Continue isotretinoin. Repeat labs before next visit.',
    createdAt: '2026-03-21T16:00:00Z',
  },
  {
    id: 'vs-m2', encounterId: 'enc-m1', patientId: 'demo-patient-3',
    visitDate: '2026-01-09', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Moderate inflammatory acne',
    diagnoses: ['Acne Vulgaris (L70.0)', 'Acne scarring'],
    followUpDate: '2026-03-21', followUpInstructions: 'Complete baseline labs and isotretinoin enrollment steps.',
    createdAt: '2026-01-09T15:25:00Z',
  },
];

export const VISIT_SUMMARIES_SOFIA = [
  {
    id: 'vs-s1', encounterId: 'enc-s2', patientId: 'demo-patient-4',
    visitDate: '2026-02-11', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Acne and pigment follow-up',
    diagnoses: ['Hormonal Acne — improving', 'Melasma — stable'],
    followUpDate: '2026-05-20', followUpInstructions: 'Continue current regimen and daily tinted sunscreen.',
    createdAt: '2026-02-11T12:00:00Z',
  },
  {
    id: 'vs-s2', encounterId: 'enc-s1', patientId: 'demo-patient-4',
    visitDate: '2025-10-02', providerName: 'Dr. David Skin, MD, FAAD',
    chiefComplaint: 'Hormonal acne and melasma',
    diagnoses: ['Acne Vulgaris (L70.0)', 'Melasma (L81.1)', 'Post-inflammatory hyperpigmentation'],
    followUpDate: '2026-02-11', followUpInstructions: 'Begin spironolactone, tretinoin, azelaic acid, and strict sun protection.',
    createdAt: '2025-10-02T17:20:00Z',
  },
];

// ── Portal Health Record Data ──────────────────────────────────────────────────

export const HEALTH_RECORD_ALEX = {
  allergies: [
    { id: 'al-a1', allergen: 'Penicillin', reaction: 'Hives', severity: 'Moderate', onsetDate: '1998' },
    { id: 'al-a2', allergen: 'Sulfonamides', reaction: 'Rash', severity: 'Mild', onsetDate: '2005' },
  ],
  medications: PRESCRIPTIONS_ALEX.map(rx => ({
    id: rx.id, medicationName: rx.medicationName, strength: rx.strength,
    sig: rx.sig, prescribedBy: rx.providerName, startDate: rx.writtenDate,
    status: rx.status === 'transmitted' ? 'active' : 'discontinued',
  })),
  vitals: VITALS_ALEX,
  labResults: [
    {
      id: 'lab-a1', testName: 'CBC with Differential', resultDate: '2026-01-18',
      status: 'final', summary: 'All values within normal limits',
      values: [
        { name: 'WBC', value: '6.8', unit: 'K/uL', referenceRange: '4.5–11.0', flag: 'normal' },
        { name: 'RBC', value: '4.9', unit: 'M/uL', referenceRange: '4.5–5.9', flag: 'normal' },
        { name: 'Hemoglobin', value: '14.8', unit: 'g/dL', referenceRange: '13.5–17.5', flag: 'normal' },
        { name: 'Platelets', value: '242', unit: 'K/uL', referenceRange: '150–400', flag: 'normal' },
      ],
    },
    {
      id: 'lab-a2', testName: 'Comprehensive Metabolic Panel', resultDate: '2026-01-18',
      status: 'final', summary: 'All values within normal limits. Liver function normal.',
      values: [
        { name: 'ALT', value: '22', unit: 'U/L', referenceRange: '7–56', flag: 'normal' },
        { name: 'AST', value: '19', unit: 'U/L', referenceRange: '10–40', flag: 'normal' },
        { name: 'Creatinine', value: '0.9', unit: 'mg/dL', referenceRange: '0.7–1.3', flag: 'normal' },
        { name: 'Glucose', value: '92', unit: 'mg/dL', referenceRange: '70–99', flag: 'normal' },
      ],
    },
  ],
};

export const HEALTH_RECORD_JANE = {
  allergies: [
    { id: 'al-j1', allergen: 'Latex', reaction: 'Anaphylaxis', severity: 'Severe', onsetDate: '2010' },
    { id: 'al-j2', allergen: 'Nickel', reaction: 'Contact Dermatitis', severity: 'Moderate', onsetDate: '2015' },
  ],
  medications: PRESCRIPTIONS_JANE.map(rx => ({
    id: rx.id, medicationName: rx.medicationName, strength: rx.strength,
    sig: rx.sig, prescribedBy: rx.providerName, startDate: rx.writtenDate,
    status: rx.status === 'transmitted' ? 'active' : 'discontinued',
  })),
  vitals: VITALS_JANE,
  labResults: [],
};

export const HEALTH_RECORD_MARCUS = {
  allergies: [
    { id: 'al-m1', allergen: 'Sulfonamide Antibiotics', reaction: 'Rash', severity: 'Moderate', onsetDate: '2019' },
    { id: 'al-m2', allergen: 'Doxycycline', reaction: 'Severe GI upset', severity: 'Mild', onsetDate: '2021' },
  ],
  medications: PRESCRIPTIONS_MARCUS.map(rx => ({
    id: rx.id, medicationName: rx.medicationName, strength: rx.strength,
    sig: rx.sig, prescribedBy: rx.providerName, startDate: rx.writtenDate,
    status: rx.status === 'transmitted' ? 'active' : 'discontinued',
  })),
  vitals: VITALS_MARCUS,
  labResults: [
    {
      id: 'lab-m1', testName: 'CBC / CMP / Lipid Panel', resultDate: '2026-03-24',
      status: 'final', summary: 'CBC and CMP normal. Mild triglyceride elevation.',
      values: [
        { name: 'ALT', value: '26', unit: 'U/L', referenceRange: '7–56', flag: 'normal' },
        { name: 'AST', value: '22', unit: 'U/L', referenceRange: '10–40', flag: 'normal' },
        { name: 'Triglycerides', value: '182', unit: 'mg/dL', referenceRange: '<150', flag: 'high' },
        { name: 'Creatinine', value: '0.9', unit: 'mg/dL', referenceRange: '0.7–1.3', flag: 'normal' },
      ],
    },
  ],
};

export const HEALTH_RECORD_SOFIA = {
  allergies: [],
  medications: PRESCRIPTIONS_SOFIA.map(rx => ({
    id: rx.id, medicationName: rx.medicationName, strength: rx.strength,
    sig: rx.sig, prescribedBy: rx.providerName, startDate: rx.writtenDate,
    status: rx.status === 'transmitted' ? 'active' : 'discontinued',
  })),
  vitals: VITALS_SOFIA,
  labResults: [
    {
      id: 'lab-s1', testName: 'Potassium / Creatinine', resultDate: '2026-02-13',
      status: 'final', summary: 'Electrolytes and renal function within normal limits.',
      values: [
        { name: 'Potassium', value: '4.2', unit: 'mmol/L', referenceRange: '3.5–5.1', flag: 'normal' },
        { name: 'Creatinine', value: '0.8', unit: 'mg/dL', referenceRange: '0.6–1.1', flag: 'normal' },
      ],
    },
  ],
};

// ── Portal Profile Data ────────────────────────────────────────────────────────

export const PORTAL_PROFILE_ALEX = {
  id: 'demo-patient-1',
  firstName: 'Alex', lastName: 'Johnson', preferredName: 'Alex',
  dateOfBirth: '1985-03-15', sex: 'M',
  email: 'patient@demo.portal', phone: '(720) 555-0142',
  address: '4821 Pinecrest Drive', city: 'Denver', state: 'CO', zip: '80202',
  emergencyContact: { name: 'Lisa Johnson', relationship: 'Spouse', phone: '(720) 555-0143' },
  pharmacy: { name: 'Walgreens', address: '1560 Blake St, Denver, CO 80202', phone: '(720) 555-9200' },
  practiceName: 'Mountain Pine Dermatology',
  practicePhone: '(720) 555-1000',
};

export const PORTAL_PROFILE_JANE = {
  id: 'demo-patient-2',
  firstName: 'Jane', lastName: 'Doe', preferredName: 'Jane',
  dateOfBirth: '1992-07-22', sex: 'F',
  email: 'jane@demo.portal', phone: '(303) 555-0287',
  address: '1103 Maple Street', city: 'Boulder', state: 'CO', zip: '80301',
  emergencyContact: { name: 'Mark Doe', relationship: 'Spouse', phone: '(303) 555-0288' },
  pharmacy: { name: 'CVS Pharmacy', address: '1600 28th St, Boulder, CO 80301', phone: '(303) 555-8800' },
  practiceName: 'Mountain Pine Dermatology',
  practicePhone: '(720) 555-1000',
};

export const PORTAL_PROFILE_MARCUS = {
  id: 'demo-patient-3',
  firstName: 'Marcus', lastName: 'Williams', preferredName: 'Marcus',
  dateOfBirth: '2002-07-22', sex: 'M',
  email: 'marcus@demo.portal', phone: '(720) 555-0319',
  address: '88 Larimer Street', city: 'Denver', state: 'CO', zip: '80202',
  emergencyContact: { name: 'Alicia Williams', relationship: 'Mother', phone: '(720) 555-0320' },
  pharmacy: { name: 'King Soopers Pharmacy', address: '1950 Chestnut Pl, Denver, CO 80202', phone: '(720) 555-7711' },
  practiceName: 'Mountain Pine Dermatology',
  practicePhone: '(720) 555-1000',
};

export const PORTAL_PROFILE_SOFIA = {
  id: 'demo-patient-4',
  firstName: 'Sofia', lastName: 'Chen', preferredName: 'Sofia',
  dateOfBirth: '1995-12-01', sex: 'F',
  email: 'sofia@demo.portal', phone: '(303) 555-0441',
  address: '302 Pearl Street', city: 'Boulder', state: 'CO', zip: '80302',
  emergencyContact: { name: 'Daniel Chen', relationship: 'Brother', phone: '(303) 555-0442' },
  pharmacy: { name: 'CVS Pharmacy', address: '1600 28th St, Boulder, CO 80301', phone: '(303) 555-8800' },
  practiceName: 'Mountain Pine Dermatology',
  practicePhone: '(720) 555-1000',
};

// Helper: get demo data by portal patient email
export function getDemoPatientByEmail(email: string) {
  const normalizedEmail = email.toLowerCase();
  if (normalizedEmail === 'patient@demo.portal') return PATIENT_ALEX;
  if (normalizedEmail === 'jane@demo.portal') return PATIENT_JANE;
  if (normalizedEmail === 'marcus@demo.portal') return PATIENT_MARCUS;
  if (normalizedEmail === 'sofia@demo.portal') return PATIENT_SOFIA;
  return null;
}

export function getDemoDataForPortalUser(email: string) {
  const normalizedEmail = email.toLowerCase();
  if (normalizedEmail === 'patient@demo.portal') {
    return {
      patient: PATIENT_ALEX,
      appointments: APPOINTMENTS_ALEX,
      encounters: ENCOUNTERS_ALEX,
      vitals: VITALS_ALEX,
      prescriptions: PRESCRIPTIONS_ALEX,
      orders: ORDERS_ALEX,
      documents: DOCUMENTS_ALEX,
      visitSummaries: VISIT_SUMMARIES_ALEX,
      billing: PORTAL_BILLING_ALEX,
      healthRecord: HEALTH_RECORD_ALEX,
      profile: PORTAL_PROFILE_ALEX,
      eligibility: ELIGIBILITY_ALEX,
    };
  }
  if (normalizedEmail === 'jane@demo.portal') {
    return {
      patient: PATIENT_JANE,
      appointments: APPOINTMENTS_JANE,
      encounters: ENCOUNTERS_JANE,
      vitals: VITALS_JANE,
      prescriptions: PRESCRIPTIONS_JANE,
      orders: ORDERS_JANE,
      documents: DOCUMENTS_JANE,
      visitSummaries: VISIT_SUMMARIES_JANE,
      billing: PORTAL_BILLING_JANE,
      healthRecord: HEALTH_RECORD_JANE,
      profile: PORTAL_PROFILE_JANE,
      eligibility: ELIGIBILITY_JANE,
    };
  }
  if (normalizedEmail === 'marcus@demo.portal') {
    return {
      patient: PATIENT_MARCUS,
      appointments: APPOINTMENTS_MARCUS,
      encounters: ENCOUNTERS_MARCUS,
      vitals: VITALS_MARCUS,
      prescriptions: PRESCRIPTIONS_MARCUS,
      orders: ORDERS_MARCUS,
      documents: DOCUMENTS_MARCUS,
      visitSummaries: VISIT_SUMMARIES_MARCUS,
      billing: PORTAL_BILLING_MARCUS,
      healthRecord: HEALTH_RECORD_MARCUS,
      profile: PORTAL_PROFILE_MARCUS,
      eligibility: ELIGIBILITY_MARCUS,
    };
  }
  if (normalizedEmail === 'sofia@demo.portal') {
    return {
      patient: PATIENT_SOFIA,
      appointments: APPOINTMENTS_SOFIA,
      encounters: ENCOUNTERS_SOFIA,
      vitals: VITALS_SOFIA,
      prescriptions: PRESCRIPTIONS_SOFIA,
      orders: ORDERS_SOFIA,
      documents: DOCUMENTS_SOFIA,
      visitSummaries: VISIT_SUMMARIES_SOFIA,
      billing: PORTAL_BILLING_SOFIA,
      healthRecord: HEALTH_RECORD_SOFIA,
      profile: PORTAL_PROFILE_SOFIA,
      eligibility: ELIGIBILITY_SOFIA,
    };
  }
  return null;
}
