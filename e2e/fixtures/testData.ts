/**
 * Test data and credentials for E2E tests
 */

export const TEST_USERS = {
  admin: {
    email: 'admin@demo.practice',
    password: 'Password123!',
    role: 'admin',
  },
  doctor: {
    email: 'provider@demo.practice',
    password: 'Password123!',
    role: 'provider',
  },
  nurse: {
    email: 'ma@demo.practice',
    password: 'Password123!',
    role: 'ma',
  },
  receptionist: {
    email: 'frontdesk@demo.practice',
    password: 'Password123!',
    role: 'front_desk',
  },
  invalid: {
    email: 'invalid@example.com',
    password: 'wrongpassword',
  },
};

export const TEST_PATIENT = {
  firstName: 'Test',
  lastName: 'Patient',
  dateOfBirth: '1990-01-15',
  phone: '555-123-4567',
  email: 'test.patient@example.com',
  address: '123 Test Street',
  city: 'Test City',
  state: 'CA',
  zipCode: '12345',
};

export const TEST_APPOINTMENT = {
  type: 'Follow-up',
  duration: 30,
  reason: 'Routine follow-up visit',
  notes: 'Patient requested afternoon appointment',
};

export const TEST_CLINICAL = {
  chiefComplaint: 'Skin rash on arms',
  vitals: {
    bloodPressure: '120/80',
    heartRate: '72',
    temperature: '98.6',
    weight: '150',
    height: '68',
  },
  diagnosis: {
    code: 'L30.9',
    description: 'Dermatitis, unspecified',
  },
  prescription: {
    medication: 'Hydrocortisone Cream 1%',
    dosage: 'Apply twice daily',
    quantity: '30g',
    refills: '2',
  },
};

export const TEST_NOTE = {
  hpi: 'Patient presents with a 2-week history of itchy rash on bilateral arms.',
  ros: 'Constitutional: Negative for fever, weight loss. Skin: Positive for rash, itching.',
  exam: 'Skin: Erythematous, scaling patches noted on bilateral forearms.',
  assessment: 'Contact dermatitis',
  plan: 'Started on topical corticosteroid. Follow up in 2 weeks if not improved.',
};

export const generateUniquePatient = () => {
  const timestamp = Date.now();
  return {
    ...TEST_PATIENT,
    firstName: `Test${timestamp}`,
    lastName: `Patient${timestamp}`,
    email: `test${timestamp}@example.com`,
  };
};

export const generateUniqueEmail = () => {
  return `test${Date.now()}@example.com`;
};
