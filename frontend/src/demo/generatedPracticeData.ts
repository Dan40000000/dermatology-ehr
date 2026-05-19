type DemoPatient = {
  id: string;
  tenantId: string;
  mrn: string;
  pmsId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  dateOfBirth: string;
  sex: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lastVisit?: string;
  createdAt: string;
  allergies?: string[];
  medications?: string[];
  insuranceDetails?: Record<string, unknown>;
};

type DemoItem = Record<string, any>;

type PracticeData = {
  patients: DemoPatient[];
  appointments: DemoItem[];
  encounters: DemoItem[];
  vitals: DemoItem[];
  prescriptions: DemoItem[];
  orders: DemoItem[];
  documents: DemoItem[];
};

type ConditionProfile = {
  key: string;
  label: string;
  chiefComplaint: string;
  providerIds: string[];
  cadenceRange: [number, number];
  maxFutureAppointments: number;
  allergies: string[];
  medications: string[];
  appointmentTypes: Array<{ id: string; name: string; duration: number }>;
  orderFactory?: (patient: DemoPatient, encounterId: string, providerId: string, providerName: string, createdAt: string) => DemoItem | null;
};

const FIRST_NAMES_MALE = [
  'Liam', 'Noah', 'Oliver', 'Elijah', 'Mateo', 'Lucas', 'Levi', 'Ethan', 'Mason', 'Logan',
  'James', 'Benjamin', 'Jackson', 'Sebastian', 'Aiden', 'Carter', 'Julian', 'Wyatt', 'Grayson', 'Leo',
  'Henry', 'Hudson', 'Ezra', 'Asher', 'Maverick', 'Theo', 'Isaac', 'Elias', 'Caleb', 'Owen',
  'Nathan', 'Christian', 'Adrian', 'Colin', 'Micah', 'Roman', 'Dominic', 'Gavin', 'Jonah', 'Parker',
];

const FIRST_NAMES_FEMALE = [
  'Olivia', 'Emma', 'Charlotte', 'Amelia', 'Sophia', 'Mia', 'Isabella', 'Ava', 'Evelyn', 'Harper',
  'Camila', 'Gianna', 'Abigail', 'Ella', 'Scarlett', 'Grace', 'Chloe', 'Victoria', 'Riley', 'Aria',
  'Nora', 'Hazel', 'Lily', 'Aurora', 'Violet', 'Zoey', 'Hannah', 'Lucy', 'Naomi', 'Maya',
  'Elena', 'Leah', 'Stella', 'Natalie', 'Addison', 'Brooklyn', 'Claire', 'Paisley', 'Samantha', 'Madeline',
];

const LAST_NAMES = [
  'Anderson', 'Baker', 'Brooks', 'Campbell', 'Carter', 'Clark', 'Collins', 'Cook', 'Cooper', 'Cox',
  'Davis', 'Diaz', 'Edwards', 'Evans', 'Flores', 'Foster', 'Garcia', 'Gomez', 'Gonzalez', 'Gray',
  'Green', 'Griffin', 'Hall', 'Harris', 'Henderson', 'Hernandez', 'Hill', 'Howard', 'Hughes', 'Jackson',
  'James', 'Jenkins', 'Kelly', 'King', 'Lee', 'Lewis', 'Lopez', 'Martin', 'Mendoza', 'Miller',
  'Mitchell', 'Moore', 'Morgan', 'Morris', 'Murphy', 'Nelson', 'Nguyen', 'Ortiz', 'Parker', 'Patel',
  'Perez', 'Perry', 'Peterson', 'Phillips', 'Powell', 'Price', 'Ramirez', 'Reed', 'Reyes', 'Richardson',
  'Rivera', 'Roberts', 'Robinson', 'Rogers', 'Ross', 'Russell', 'Sanders', 'Scott', 'Simmons', 'Stewart',
  'Taylor', 'Thomas', 'Thompson', 'Turner', 'Walker', 'Ward', 'Watson', 'White', 'Wood', 'Young',
];

const CITIES = [
  { city: 'Denver', zip: '80202' },
  { city: 'Boulder', zip: '80301' },
  { city: 'Aurora', zip: '80012' },
  { city: 'Lakewood', zip: '80226' },
  { city: 'Littleton', zip: '80120' },
  { city: 'Arvada', zip: '80003' },
  { city: 'Westminster', zip: '80031' },
  { city: 'Centennial', zip: '80112' },
  { city: 'Englewood', zip: '80110' },
  { city: 'Thornton', zip: '80241' },
  { city: 'Broomfield', zip: '80020' },
  { city: 'Parker', zip: '80134' },
];

const STREETS = [
  'Maple', 'Oak', 'Pine', 'Aspen', 'Cedar', 'Willow', 'Cherry', 'Meadow', 'Juniper', 'Highland',
  'Sunset', 'Canyon', 'Grant', 'Pearl', 'Broadway', 'Lincoln', 'Madison', 'Clay', 'Spruce', 'Birch',
];

const INSURANCE_PLANS = [
  { payer: 'Blue Cross Blue Shield of Colorado', planName: 'PPO Gold Plan', copayAmount: 30, policyType: 'PPO' },
  { payer: 'Aetna', planName: 'HMO Silver Plan', copayAmount: 40, policyType: 'HMO' },
  { payer: 'Cigna', planName: 'Open Access Plus', copayAmount: 35, policyType: 'PPO' },
  { payer: 'United Healthcare', planName: 'Choice Plus PPO', copayAmount: 35, policyType: 'PPO' },
  { payer: 'Kaiser Permanente', planName: 'Colorado Bronze', copayAmount: 25, policyType: 'HMO' },
  { payer: 'Anthem', planName: 'Blue Priority PPO', copayAmount: 45, policyType: 'PPO' },
  { payer: 'Medicare', planName: 'Traditional Medicare', copayAmount: 20, policyType: 'Medicare' },
];

const PROVIDERS = [
  { id: 'demo-provider-1', name: 'Dr. David Skin, MD, FAAD', startHour: 8, endHour: 17, minDaily: 7, maxDaily: 11, daySkipChance: 0.1 },
  { id: 'demo-provider-2', name: 'Riley Johnson, PA-C', startHour: 8, endHour: 17, minDaily: 8, maxDaily: 12, daySkipChance: 0.08 },
  { id: 'demo-provider-3', name: 'Dr. Maria Martinez, MD, FAAD', startHour: 8, endHour: 16, minDaily: 6, maxDaily: 10, daySkipChance: 0.12 },
  { id: 'demo-provider-4', name: 'Sarah Mitchell, PA-C', startHour: 9, endHour: 17, minDaily: 4, maxDaily: 7, daySkipChance: 0.15 },
  { id: 'demo-provider-5', name: 'Dr. Phil Jackson - PA', startHour: 8, endHour: 17, minDaily: 5, maxDaily: 8, daySkipChance: 0.14 },
];

const LOCATIONS = [
  { id: 'loc-1', name: 'Mountain Pine Dermatology - Main Office' },
  { id: 'loc-2', name: 'Mountain Pine Dermatology - East Office' },
  { id: 'loc-3', name: 'Mountain Pine Dermatology - South Campus' },
];

const VIRTUAL_LOCATION = { id: 'loc-virtual', name: 'Mountain Pine Dermatology - Virtual Care' };

const CONDITION_PROFILES: ConditionProfile[] = [
  {
    key: 'acne',
    label: 'Acne vulgaris',
    chiefComplaint: 'Acne follow-up and medication management',
    providerIds: ['demo-provider-1', 'demo-provider-2', 'demo-provider-5'],
    cadenceRange: [35, 70],
    maxFutureAppointments: 5,
    allergies: ['Doxycycline (GI upset)', 'Sulfonamide antibiotics (Rash)'],
    medications: ['Tretinoin 0.05% cream', 'Clindamycin 1% lotion', 'Benzoyl peroxide 5% wash'],
    appointmentTypes: [
      { id: 'type-acne', name: 'Acne Follow-Up', duration: 30 },
      { id: 'type-fu', name: 'Medication Follow-Up', duration: 30 },
    ],
  },
  {
    key: 'psoriasis',
    label: 'Plaque psoriasis',
    chiefComplaint: 'Psoriasis follow-up and treatment monitoring',
    providerIds: ['demo-provider-1', 'demo-provider-3', 'demo-provider-5'],
    cadenceRange: [45, 85],
    maxFutureAppointments: 4,
    allergies: ['Penicillin (Hives)', 'Sulfonamides (Rash)'],
    medications: ['Clobetasol 0.05% ointment', 'Methotrexate 15mg weekly'],
    appointmentTypes: [
      { id: 'type-psoriasis', name: 'Psoriasis Follow-Up', duration: 30 },
      { id: 'type-fu', name: 'Follow-Up Visit', duration: 30 },
    ],
    orderFactory: (patient, encounterId, providerId, providerName, createdAt) => ({
      id: `ord-${patient.id}-lab`,
      tenantId: 'tenant-demo',
      patientId: patient.id,
      encounterId,
      providerId,
      providerName,
      type: 'lab',
      status: 'closed',
      priority: 'routine',
      details: 'CBC, CMP, and LFT monitoring for systemic psoriasis therapy.',
      notes: 'Monitoring labs reviewed and filed in chart.',
      resultFlag: 'normal',
      createdAt,
    }),
  },
  {
    key: 'eczema',
    label: 'Atopic dermatitis',
    chiefComplaint: 'Eczema follow-up and flare prevention plan',
    providerIds: ['demo-provider-1', 'demo-provider-2', 'demo-provider-5'],
    cadenceRange: [50, 90],
    maxFutureAppointments: 4,
    allergies: ['Latex (Contact dermatitis)', 'Nickel (Rash)'],
    medications: ['Dupilumab 300mg SC q2w', 'Triamcinolone 0.1% ointment'],
    appointmentTypes: [
      { id: 'type-eczema', name: 'Eczema Follow-Up', duration: 30 },
      { id: 'type-fu', name: 'Dermatology Follow-Up', duration: 30 },
    ],
  },
  {
    key: 'lesion',
    label: 'Lesion surveillance',
    chiefComplaint: 'Suspicious lesion evaluation and skin cancer surveillance',
    providerIds: ['demo-provider-1', 'demo-provider-3', 'demo-provider-5'],
    cadenceRange: [75, 150],
    maxFutureAppointments: 3,
    allergies: ['Adhesive tape (Rash)'],
    medications: [],
    appointmentTypes: [
      { id: 'type-skin-check', name: 'Skin Check', duration: 30 },
      { id: 'type-biopsy', name: 'Lesion Biopsy', duration: 45 },
    ],
    orderFactory: (patient, encounterId, providerId, providerName, createdAt) => ({
      id: `ord-${patient.id}-biopsy`,
      tenantId: 'tenant-demo',
      patientId: patient.id,
      encounterId,
      providerId,
      providerName,
      type: 'biopsy',
      status: 'closed',
      priority: 'routine',
      details: 'Shave biopsy of irregular pigmented lesion; pathology review requested.',
      notes: 'Procedure tolerated well. Pathology returned benign.',
      resultFlag: 'benign',
      createdAt,
    }),
  },
  {
    key: 'rosacea',
    label: 'Rosacea',
    chiefComplaint: 'Rosacea follow-up and skin sensitivity review',
    providerIds: ['demo-provider-2', 'demo-provider-5'],
    cadenceRange: [60, 110],
    maxFutureAppointments: 3,
    allergies: ['Metronidazole gel (Irritation)'],
    medications: ['Metronidazole 0.75% cream', 'Azelaic acid 15% gel'],
    appointmentTypes: [
      { id: 'type-fu', name: 'Follow-Up Visit', duration: 30 },
      { id: 'type-skin-check', name: 'Inflammatory Skin Follow-Up', duration: 30 },
    ],
  },
  {
    key: 'hidradenitis',
    label: 'Hidradenitis suppurativa',
    chiefComplaint: 'Hidradenitis follow-up and flare management',
    providerIds: ['demo-provider-1', 'demo-provider-3', 'demo-provider-5'],
    cadenceRange: [35, 65],
    maxFutureAppointments: 5,
    allergies: ['Clindamycin (Diarrhea)'],
    medications: ['Clindamycin 1% solution', 'Doxycycline 100mg BID'],
    appointmentTypes: [
      { id: 'type-fu', name: 'Follow-Up Visit', duration: 30 },
      { id: 'type-procedure', name: 'Procedure Follow-Up', duration: 45 },
      { id: 'type-skin-tag', name: 'Skin Tag Removal', duration: 15 },
    ],
  },
  {
    key: 'cosmetic',
    label: 'Cosmetic dermatology',
    chiefComplaint: 'Cosmetic follow-up and treatment planning',
    providerIds: ['demo-provider-4'],
    cadenceRange: [70, 120],
    maxFutureAppointments: 3,
    allergies: [],
    medications: ['Hydroquinone 4% cream', 'Tretinoin 0.025% cream'],
    appointmentTypes: [
      { id: 'type-botox-consult', name: 'Botox Consultation', duration: 30 },
      { id: 'type-botox-treatment', name: 'Botox Treatment', duration: 30 },
      { id: 'type-filler-consult', name: 'Dermal Filler Consultation', duration: 30 },
      { id: 'type-filler-treatment', name: 'Dermal Filler Treatment', duration: 45 },
      { id: 'type-chemical-peel', name: 'Chemical Peel', duration: 45 },
      { id: 'type-hydrafacial', name: 'Hydrafacial', duration: 45 },
      { id: 'type-microderm', name: 'Microdermabrasion', duration: 30 },
      { id: 'type-microneedling', name: 'Microneedling', duration: 60 },
      { id: 'type-kybella', name: 'Kybella Treatment', duration: 30 },
      { id: 'type-cosmetic-fu', name: 'Cosmetic Follow-Up', duration: 30 },
    ],
  },
  {
    key: 'skin_check',
    label: 'Routine skin exam',
    chiefComplaint: 'Annual skin examination and preventive screening',
    providerIds: ['demo-provider-1', 'demo-provider-3', 'demo-provider-5'],
    cadenceRange: [120, 210],
    maxFutureAppointments: 2,
    allergies: [],
    medications: [],
    appointmentTypes: [
      { id: 'type-skin-check', name: 'Annual Skin Check', duration: 30 },
      { id: 'type-fu', name: 'Preventive Follow-Up', duration: 30 },
    ],
  },
];

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function setLocalTime(date: Date, hour: number, minute: number) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pick<T>(items: T[], random: () => number) {
  return items[Math.floor(random() * items.length)]!;
}

function overlapsWindow(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
) {
  return leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime();
}

function findOpenLocalVirtualSlot(
  appointments: DemoItem[],
  providerId: string,
  date: Date,
  durationMinutes: number,
  candidates: Array<{ hour: number; minute: number }>,
) {
  const dayKey = localDateKey(date);
  const existing = appointments.filter((appointment) => {
    if (!appointment || appointment.providerId !== providerId || appointment.status === 'cancelled') {
      return false;
    }
    return localDateKey(new Date(appointment.scheduledStart)) === dayKey;
  });

  for (const candidate of candidates) {
    const start = setLocalTime(date, candidate.hour, candidate.minute);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const hasConflict = existing.some((appointment) => {
      const existingStart = new Date(appointment.scheduledStart);
      const existingEnd = new Date(appointment.scheduledEnd);
      if (Number.isNaN(existingStart.getTime()) || Number.isNaN(existingEnd.getTime())) {
        return false;
      }
      return overlapsWindow(start, end, existingStart, existingEnd);
    });
    if (!hasConflict) {
      return { start, end };
    }
  }

  return null;
}

function getTelehealthAppointmentMeta(
  patient: DemoPatient & { condition: ConditionProfile },
  providerId: string,
) {
  if (providerId === 'demo-provider-4') {
    return {
      appointmentTypeId: 'type-telehealth-fu',
      appointmentTypeName: 'Cosmetic Video Follow-Up',
      durationMinutes: 20,
      chiefComplaint: 'Virtual cosmetic recovery check and next-step planning',
    };
  }

  switch (patient.condition.key) {
    case 'acne':
      return {
        appointmentTypeId: 'type-video-acne',
        appointmentTypeName: 'Video Acne Follow-Up',
        durationMinutes: 20,
        chiefComplaint: 'Virtual acne medication check and treatment response review',
      };
    case 'psoriasis':
      return {
        appointmentTypeId: 'type-telehealth-fu',
        appointmentTypeName: 'Telehealth Psoriasis Follow-Up',
        durationMinutes: 20,
        chiefComplaint: 'Virtual psoriasis follow-up and medication monitoring',
      };
    case 'eczema':
      return {
        appointmentTypeId: 'type-telehealth-fu',
        appointmentTypeName: 'Telehealth Eczema Follow-Up',
        durationMinutes: 20,
        chiefComplaint: 'Virtual eczema flare review and maintenance plan check',
      };
    case 'rosacea':
      return {
        appointmentTypeId: 'type-telehealth-fu',
        appointmentTypeName: 'Virtual Rosacea Medication Check',
        durationMinutes: 20,
        chiefComplaint: 'Virtual rosacea medication check and irritation review',
      };
    default:
      return {
        appointmentTypeId: 'type-telehealth-fu',
        appointmentTypeName: 'Telehealth Follow-Up',
        durationMinutes: 20,
        chiefComplaint: 'Virtual dermatology follow-up and treatment review',
      };
  }
}

function buildInsurance(primaryIndex: number) {
  const plan = INSURANCE_PLANS[primaryIndex % INSURANCE_PLANS.length]!;
  return {
    primary: {
      payer: plan.payer,
      planName: plan.planName,
      policyNumber: `${String(primaryIndex + 100000000).slice(-9)}${(primaryIndex % 10)}`,
      groupNumber: `GRP-${41000 + primaryIndex}`,
      policyType: plan.policyType,
      eligibilityStatus: 'Active',
      copayAmount: plan.copayAmount,
      coinsurancePercent: 20,
      deductible: 1500 + ((primaryIndex % 5) * 500),
      remainingDeductible: 200 + ((primaryIndex % 13) * 83),
      outOfPocket: 5000 + ((primaryIndex % 4) * 1500),
      remainingOutOfPocket: 1200 + ((primaryIndex % 19) * 141),
      policyEffectiveDate: '2026-01-01',
      policyEndDate: '2026-12-31',
    },
  };
}

function enrichPatient(patient: Partial<DemoPatient>, syntheticIndex: number): DemoPatient & { condition: ConditionProfile; preferredProviderId: string; cadenceDays: number; maxFutureAppointments: number } {
  const patientSeed = hashString(`${patient.id || syntheticIndex}-${patient.firstName || ''}-${patient.lastName || ''}`);
  const random = createSeededRandom(patientSeed || (syntheticIndex + 1));
  const sex = patient.sex || (random() > 0.5 ? 'F' : 'M');
  const firstNames = sex === 'F' ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE;
  const firstName = patient.firstName || pick(firstNames, random);
  const lastName = patient.lastName || `${pick(LAST_NAMES, random)}${syntheticIndex > LAST_NAMES.length ? ` ${String.fromCharCode(65 + (syntheticIndex % 26))}` : ''}`;
  const cityInfo = pick(CITIES, random);
  const street = pick(STREETS, random);
  const addressNumber = 120 + ((syntheticIndex * 17) % 8800);
  const condition = CONDITION_PROFILES[patientSeed % CONDITION_PROFILES.length]!;
  const preferredProviderId = condition.providerIds[patientSeed % condition.providerIds.length]!;
  const cadenceDays = condition.cadenceRange[0] + Math.floor(random() * (condition.cadenceRange[1] - condition.cadenceRange[0] + 1));
  const dob = patient.dateOfBirth || (() => {
    const birthDate = new Date(Date.UTC(1943 + Math.floor(random() * 58), Math.floor(random() * 12), 1 + Math.floor(random() * 27)));
    return isoDate(birthDate);
  })();
  const createdAt = patient.createdAt || addDays(new Date(Date.UTC(2026, 3, 27)), -(120 + Math.floor(random() * 900))).toISOString();
  const policySeed = syntheticIndex + patientSeed;

  return {
    id: patient.id || `demo-roster-${String(syntheticIndex + 1).padStart(4, '0')}`,
    tenantId: 'tenant-demo',
    mrn: patient.mrn || `MRN-${String(30000 + syntheticIndex).padStart(5, '0')}`,
    pmsId: patient.pmsId || `PMS-${String(50000 + syntheticIndex).padStart(5, '0')}`,
    firstName,
    lastName,
    preferredName: patient.preferredName || firstName,
    dateOfBirth: dob,
    sex,
    phone: patient.phone || `(303) 555-${String(1000 + syntheticIndex).padStart(4, '0')}`,
    email: patient.email || `${firstName}.${lastName}.${syntheticIndex + 1}@example.test`.toLowerCase().replace(/\s+/g, ''),
    address: patient.address || `${addressNumber} ${street} ${random() > 0.55 ? 'Ave' : 'St'}`,
    city: patient.city || cityInfo.city,
    state: patient.state || 'CO',
    zip: patient.zip || cityInfo.zip,
    lastVisit: patient.lastVisit,
    createdAt,
    allergies: Array.isArray(patient.allergies) && patient.allergies.length > 0
      ? patient.allergies
      : (condition.allergies.length > 0 && random() > 0.45 ? [pick(condition.allergies, random)] : []),
    medications: Array.isArray(patient.medications) && patient.medications.length > 0
      ? patient.medications
      : (condition.medications.length > 0 ? condition.medications.slice(0, random() > 0.45 ? 2 : 1) : []),
    insuranceDetails: patient.insuranceDetails || buildInsurance(policySeed),
    condition,
    preferredProviderId,
    cadenceDays,
    maxFutureAppointments: condition.maxFutureAppointments,
  };
}

function chooseCandidate(
  candidates: Array<DemoPatient & { condition: ConditionProfile; preferredProviderId: string; cadenceDays: number; maxFutureAppointments: number }>,
  nextEligibleAt: Map<string, Date>,
  futureCounts: Map<string, number>,
  random: () => number,
) {
  const ranked = [...candidates].sort((left, right) => {
    const leftCount = futureCounts.get(left.id) || 0;
    const rightCount = futureCounts.get(right.id) || 0;
    if (leftCount !== rightCount) return leftCount - rightCount;
    return (nextEligibleAt.get(left.id)?.getTime() || 0) - (nextEligibleAt.get(right.id)?.getTime() || 0);
  });

  const pool = ranked.slice(0, Math.min(10, ranked.length));
  return pool[Math.floor(random() * pool.length)] || ranked[0] || null;
}

export function createSyntheticPracticeData(basePatients: Partial<DemoPatient>[], totalSchedulePatients: number): PracticeData {
  const random = createSeededRandom(20260427);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const normalizedBasePatients = basePatients.map((patient, index) => enrichPatient(patient, index));
  const generatedCount = Math.max(totalSchedulePatients - normalizedBasePatients.length, 0);
  const syntheticPatients = Array.from({ length: generatedCount }, (_, index) =>
    enrichPatient({}, normalizedBasePatients.length + index),
  );

  const schedulePatients = [...normalizedBasePatients, ...syntheticPatients];
  const providerPools = new Map<string, Array<typeof schedulePatients[number]>>();
  for (const provider of PROVIDERS) providerPools.set(provider.id, []);
  for (const patient of schedulePatients) {
    const providerId = patient.preferredProviderId;
    providerPools.get(providerId)?.push(patient);
  }

  const appointments: DemoItem[] = [];
  const encounters: DemoItem[] = [];
  const vitals: DemoItem[] = [];
  const prescriptions: DemoItem[] = [];
  const orders: DemoItem[] = [];
  const documents: DemoItem[] = [];

  const nextEligibleAt = new Map<string, Date>();
  const futureCounts = new Map<string, number>();

  for (const patient of schedulePatients) {
    const provider = PROVIDERS.find((item) => item.id === patient.preferredProviderId) || PROVIDERS[0]!;
    const location = LOCATIONS[hashString(patient.id) % LOCATIONS.length]!;
    const baseType = patient.condition.appointmentTypes[0]!;
    const completedDate = setLocalTime(addLocalDays(today, -(15 + Math.floor(random() * 210))), 8 + Math.floor(random() * 7), random() > 0.5 ? 0 : 30);
    const completedEnd = new Date(completedDate.getTime() + (baseType.duration * 60 * 1000));
    const appointmentId = `appt-${patient.id}-completed`;
    const encounterId = `enc-${patient.id}-completed`;
    const lastVisitIso = completedDate.toISOString();

    patient.lastVisit = lastVisitIso;
    appointments.push({
      id: appointmentId,
      tenantId: 'tenant-demo',
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      providerId: provider.id,
      providerName: provider.name,
      locationId: location.id,
      locationName: location.name,
      appointmentTypeId: baseType.id,
      appointmentTypeName: baseType.name,
      scheduledStart: completedDate.toISOString(),
      scheduledEnd: completedEnd.toISOString(),
      status: 'completed',
      chiefComplaint: patient.condition.chiefComplaint,
      createdAt: addDays(completedDate, -18).toISOString(),
    });

    encounters.push({
      id: encounterId,
      tenantId: 'tenant-demo',
      appointmentId,
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      providerId: provider.id,
      providerName: provider.name,
      status: 'locked',
      chiefComplaint: patient.condition.chiefComplaint,
      hpi: `${patient.firstName} ${patient.lastName} presents for ${patient.condition.label.toLowerCase()} follow-up. Symptoms reviewed, interval response discussed, and medication tolerance documented.`,
      ros: 'Skin: interval improvement with occasional breakthrough symptoms. All other systems reviewed and negative.',
      exam: 'Focused dermatologic exam performed. Findings stable with mild active disease burden and no acute distress.',
      assessmentPlan: `Assessment: ${patient.condition.label}.\n\nPlan:\n1. Continue current regimen.\n2. Reinforce trigger avoidance and skin care routine.\n3. Return for interval follow-up based on treatment response.`,
      createdAt: completedEnd.toISOString(),
      updatedAt: completedEnd.toISOString(),
    });

    vitals.push({
      id: `vit-${patient.id}-completed`,
      tenantId: 'tenant-demo',
      patientId: patient.id,
      encounterId,
      heightCm: 152 + Math.floor(random() * 38),
      weightKg: 52 + Math.round(random() * 48),
      bpSystolic: 104 + Math.floor(random() * 26),
      bpDiastolic: 64 + Math.floor(random() * 18),
      pulse: 60 + Math.floor(random() * 22),
      tempC: 36.4 + Math.round(random() * 7) / 10,
      o2Saturation: 97 + Math.floor(random() * 3),
      respiratoryRate: 12 + Math.floor(random() * 6),
      recordedAt: completedDate.toISOString(),
      createdAt: completedDate.toISOString(),
    });

    const activeMeds = Array.isArray(patient.medications) ? patient.medications : [];
    activeMeds.slice(0, 2).forEach((medication, index) => {
      prescriptions.push({
        id: `rx-${patient.id}-${index + 1}`,
        tenantId: 'tenant-demo',
        patientId: patient.id,
        patientFirstName: patient.firstName,
        patientLastName: patient.lastName,
        encounterId,
        providerId: provider.id,
        providerName: provider.name,
        medicationName: medication,
        genericName: medication.split(' ')[0],
        strength: medication.match(/\d+(\.\d+)?%?mg?/)?.[0] || '',
        dosageForm: medication.toLowerCase().includes('cream') ? 'Cream' : medication.toLowerCase().includes('ointment') ? 'Ointment' : medication.toLowerCase().includes('wash') ? 'Wash' : 'Tablet',
        sig: `Continue ${medication} as previously directed.`,
        quantity: medication.toLowerCase().includes('wash') ? 1 : 30,
        quantityUnit: medication.toLowerCase().includes('wash') ? 'bottle' : 'units',
        refills: 2 + (index % 3),
        daysSupply: 30,
        pharmacyName: `${patient.city} Community Pharmacy`,
        status: 'transmitted',
        erxStatus: 'success',
        writtenDate: isoDate(completedDate),
        createdAt: completedEnd.toISOString(),
      });
    });

    const order = patient.condition.orderFactory?.(patient, encounterId, provider.id, provider.name, completedEnd.toISOString());
    if (order) orders.push(order);

    documents.push({
      id: `doc-${patient.id}-visit-summary`,
      tenantId: 'tenant-demo',
      patientId: patient.id,
      encounterId,
      title: `Visit Summary — ${patient.condition.label}`,
      type: 'visit_summary',
      category: 'Visit Notes',
      description: `Completed follow-up for ${patient.condition.label.toLowerCase()} with updated treatment plan.`,
      filename: `visit_${patient.lastName.toLowerCase()}_${patient.firstName.toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      url: '#',
      storage: 'local',
      createdAt: completedEnd.toISOString(),
    });

    nextEligibleAt.set(patient.id, addLocalDays(completedDate, patient.cadenceDays));
    futureCounts.set(patient.id, 0);
  }

  for (const provider of PROVIDERS) {
    const providerPatients = providerPools.get(provider.id) || [];
    for (let dayOffset = 0; dayOffset <= 180; dayOffset += 1) {
      const scheduleDate = addLocalDays(today, dayOffset);
      const dayOfWeek = scheduleDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      if (random() < provider.daySkipChance) continue;

      const appointmentsPerDay = provider.minDaily + Math.floor(random() * (provider.maxDaily - provider.minDaily + 1));
      let cursor = setLocalTime(scheduleDate, provider.startHour, random() > 0.5 ? 0 : 15);

      for (let slotIndex = 0; slotIndex < appointmentsPerDay; slotIndex += 1) {
        const available = providerPatients.filter((patient) => {
          const nextVisit = nextEligibleAt.get(patient.id) || today;
          return nextVisit.getTime() <= scheduleDate.getTime()
            && (futureCounts.get(patient.id) || 0) < patient.maxFutureAppointments;
        });
        const fallback = available.length > 0
          ? available
          : providerPatients.filter((patient) => (futureCounts.get(patient.id) || 0) < patient.maxFutureAppointments);

        const candidate = chooseCandidate(fallback, nextEligibleAt, futureCounts, random);
        if (!candidate) break;

        const appointmentType = pick(candidate.condition.appointmentTypes, random);
        const start = new Date(cursor);
        const end = new Date(start.getTime() + appointmentType.duration * 60 * 1000);
        if (end.getHours() > provider.endHour || (end.getHours() === provider.endHour && end.getMinutes() > 0)) break;

        const location = LOCATIONS[Math.floor(random() * LOCATIONS.length)]!;
        const status = dayOffset <= 1
          ? (random() < 0.15 ? 'checked_in' : 'scheduled')
          : (random() < 0.06 ? 'cancelled' : 'scheduled');

        appointments.push({
          id: `appt-${provider.id}-${localDateKey(scheduleDate)}-${String(slotIndex + 1).padStart(2, '0')}`,
          tenantId: 'tenant-demo',
          patientId: candidate.id,
          patientName: `${candidate.firstName} ${candidate.lastName}`,
          providerId: provider.id,
          providerName: provider.name,
          locationId: location.id,
          locationName: location.name,
          appointmentTypeId: appointmentType.id,
          appointmentTypeName: appointmentType.name,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
          status,
          chiefComplaint: candidate.condition.chiefComplaint,
          createdAt: addLocalDays(start, -12).toISOString(),
        });

        futureCounts.set(candidate.id, (futureCounts.get(candidate.id) || 0) + 1);
        const jitter = Math.floor(random() * 18) - 6;
        nextEligibleAt.set(candidate.id, addLocalDays(scheduleDate, candidate.cadenceDays + jitter));

        const gapMinutes = 15 + (random() > 0.55 ? 15 : 0) + (random() > 0.85 ? 15 : 0);
        cursor = new Date(end.getTime() + gapMinutes * 60 * 1000);
      }
    }
  }

  const telehealthProviderOrder = [
    'demo-provider-2',
    'demo-provider-1',
    'demo-provider-3',
    'demo-provider-4',
    'demo-provider-5',
  ];
  const telehealthSlotCandidates: Record<string, Array<{ hour: number; minute: number }>> = {
    'demo-provider-1': [{ hour: 9, minute: 50 }, { hour: 11, minute: 20 }, { hour: 13, minute: 10 }, { hour: 15, minute: 20 }],
    'demo-provider-2': [{ hour: 9, minute: 40 }, { hour: 11, minute: 0 }, { hour: 13, minute: 0 }, { hour: 15, minute: 0 }, { hour: 16, minute: 20 }],
    'demo-provider-3': [{ hour: 9, minute: 20 }, { hour: 10, minute: 50 }, { hour: 13, minute: 20 }, { hour: 14, minute: 50 }],
    'demo-provider-4': [{ hour: 10, minute: 15 }, { hour: 12, minute: 15 }, { hour: 14, minute: 15 }, { hour: 16, minute: 15 }],
    'demo-provider-5': [{ hour: 10, minute: 0 }, { hour: 11, minute: 20 }, { hour: 13, minute: 20 }, { hour: 15, minute: 20 }],
  };
  const telehealthUsedPatientIds = new Set<string>();
  const telehealthQueueOffsets = new Map<string, number>();
  let telehealthBusinessDayIndex = 0;
  const telehealthAnchor = new Date();
  telehealthAnchor.setHours(0, 0, 0, 0);

  const nextUniqueTelehealthPatient = (
    providerId: string,
  ): {
    patient: DemoPatient & { condition: ConditionProfile; preferredProviderId: string; cadenceDays: number; maxFutureAppointments: number };
    nextOffset: number;
  } | null => {
    const providerPatients = providerPools.get(providerId) || [];
    if (providerPatients.length === 0) return null;

    const offset = telehealthQueueOffsets.get(providerId) || 0;
    for (let attempt = 0; attempt < providerPatients.length; attempt += 1) {
      const candidate = providerPatients[(offset + attempt) % providerPatients.length]!;
      if (telehealthUsedPatientIds.has(candidate.id)) continue;
      return {
        patient: candidate,
        nextOffset: offset + attempt + 1,
      };
    }

    return null;
  };

  for (let dayOffset = 1; dayOffset <= 60; dayOffset += 1) {
    const telehealthDate = addLocalDays(telehealthAnchor, dayOffset);
    const dayOfWeek = telehealthDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    for (let providerAttempt = 0; providerAttempt < telehealthProviderOrder.length; providerAttempt += 1) {
      const providerId = telehealthProviderOrder[(telehealthBusinessDayIndex + providerAttempt) % telehealthProviderOrder.length]!;
      const provider = PROVIDERS.find((item) => item.id === providerId);
      const candidate = nextUniqueTelehealthPatient(providerId);
      if (!provider || !candidate) continue;
      const patient = candidate.patient;

      const meta = getTelehealthAppointmentMeta(patient, providerId);
      const window = findOpenLocalVirtualSlot(
        appointments,
        providerId,
        telehealthDate,
        meta.durationMinutes,
        telehealthSlotCandidates[providerId] || [{ hour: 10, minute: 0 }],
      );
      if (!window) continue;

      telehealthQueueOffsets.set(providerId, candidate.nextOffset);
      telehealthUsedPatientIds.add(patient.id);
      appointments.push({
        id: `appt-tele-${providerId}-${isoDate(telehealthDate)}`,
        tenantId: 'tenant-demo',
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        providerId,
        providerName: provider.name,
        locationId: VIRTUAL_LOCATION.id,
        locationName: VIRTUAL_LOCATION.name,
        appointmentTypeId: meta.appointmentTypeId,
        appointmentTypeName: meta.appointmentTypeName,
        scheduledStart: window.start.toISOString(),
        scheduledEnd: window.end.toISOString(),
        status: 'scheduled',
        chiefComplaint: meta.chiefComplaint,
        createdAt: addDays(window.start, -7).toISOString(),
      });

      telehealthBusinessDayIndex += 1;
      break;
    }
  }

  appointments.sort((left, right) => new Date(left.scheduledStart).getTime() - new Date(right.scheduledStart).getTime());

  return {
    patients: schedulePatients.map(({ condition, preferredProviderId, cadenceDays, maxFutureAppointments, ...patient }) => patient),
    appointments,
    encounters,
    vitals,
    prescriptions,
    orders,
    documents,
  };
}
