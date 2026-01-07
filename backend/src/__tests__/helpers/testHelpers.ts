/**
 * E2E Test Helpers
 * Utility functions for setting up test data and making authenticated requests
 */

import jwt from 'jsonwebtoken';
import { pool } from '../../db/pool';
import { randomUUID } from 'crypto';

export interface TestTenant {
  id: string;
  name: string;
}

export interface TestUser {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  token: string;
}

export interface TestPatient {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
}

export interface TestProvider {
  id: string;
  tenantId: string;
  fullName: string;
  specialty: string;
}

export interface TestLocation {
  id: string;
  tenantId: string;
  name: string;
}

export interface TestAppointmentType {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
}

/**
 * Create a test tenant
 */
export async function createTestTenant(name?: string): Promise<TestTenant> {
  const tenantId = randomUUID();
  const tenantName = name || `Test Tenant ${tenantId.substring(0, 8)}`;

  await pool.query(
    `INSERT INTO tenants (id, name, created_at)
     VALUES ($1, $2, NOW())`,
    [tenantId, tenantName]
  );

  return { id: tenantId, name: tenantName };
}

/**
 * Create a test user and generate auth token
 */
export async function createTestUser(
  tenantId: string,
  role: string = 'admin'
): Promise<TestUser> {
  const userId = randomUUID();
  const email = `test-${userId.substring(0, 8)}@example.com`;
  const fullName = `Test ${role} ${userId.substring(0, 8)}`;

  await pool.query(
    `INSERT INTO users (id, tenant_id, email, full_name, role, password_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [userId, tenantId, email, fullName, role, 'hashed-password']
  );

  const token = jwt.sign(
    { userId, tenantId, role },
    process.env.JWT_SECRET || 'test-secret'
  );

  return { id: userId, tenantId, email, role, token };
}

/**
 * Create a test patient
 */
export async function createTestPatient(
  tenantId: string,
  overrides?: Partial<TestPatient>
): Promise<TestPatient> {
  const patientId = randomUUID();
  const firstName = overrides?.firstName || 'John';
  const lastName = overrides?.lastName || 'Doe';
  const dob = overrides?.dob || '1990-01-15';
  const email = overrides?.email || `patient-${patientId.substring(0, 8)}@example.com`;

  await pool.query(
    `INSERT INTO patients (
      id, tenant_id, first_name, last_name, dob, sex, email, created_at
    ) VALUES ($1, $2, $3, $4, $5, 'M', $6, NOW())`,
    [patientId, tenantId, firstName, lastName, dob, email]
  );

  return { id: patientId, tenantId, firstName, lastName, dob, email };
}

/**
 * Create a test provider
 */
export async function createTestProvider(
  tenantId: string,
  overrides?: Partial<TestProvider>
): Promise<TestProvider> {
  const providerId = randomUUID();
  const fullName = overrides?.fullName || 'Dr. Jane Dermatologist';
  const specialty = overrides?.specialty || 'Dermatology';

  await pool.query(
    `INSERT INTO providers (id, tenant_id, full_name, specialty, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [providerId, tenantId, fullName, specialty]
  );

  await pool.query(
    `INSERT INTO users (id, tenant_id, email, full_name, role, password_hash, created_at)
     VALUES ($1, $2, $3, $4, 'provider', $5, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [providerId, tenantId, `provider-${providerId.substring(0, 8)}@example.com`, fullName, 'hashed-password']
  );

  return { id: providerId, tenantId, fullName, specialty };
}

/**
 * Create a test location
 */
export async function createTestLocation(
  tenantId: string,
  overrides?: Partial<TestLocation>
): Promise<TestLocation> {
  const locationId = randomUUID();
  const name = overrides?.name || 'Test Clinic';

  await pool.query(
    `INSERT INTO locations (id, tenant_id, name, address, created_at)
     VALUES ($1, $2, $3, '123 Main St', NOW())`,
    [locationId, tenantId, name]
  );

  return { id: locationId, tenantId, name };
}

/**
 * Create a test appointment type
 */
export async function createTestAppointmentType(
  tenantId: string,
  overrides?: Partial<TestAppointmentType>
): Promise<TestAppointmentType> {
  const typeId = randomUUID();
  const name = overrides?.name || 'Consultation';
  const durationMinutes = overrides?.durationMinutes || 30;

  await pool.query(
    `INSERT INTO appointment_types (id, tenant_id, name, duration_minutes, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [typeId, tenantId, name, durationMinutes]
  );

  return { id: typeId, tenantId, name, durationMinutes };
}

/**
 * Create a test appointment
 */
export async function createTestAppointment(
  tenantId: string,
  patientId: string,
  providerId: string,
  locationId: string,
  appointmentTypeId: string,
  scheduledStart: string,
  status: string = 'scheduled'
): Promise<string> {
  const appointmentId = randomUUID();
  const startDate = new Date(scheduledStart);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 minutes

  await pool.query(
    `INSERT INTO appointments (
      id, tenant_id, patient_id, provider_id, location_id, appointment_type_id,
      status, scheduled_start, scheduled_end, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      appointmentId,
      tenantId,
      patientId,
      providerId,
      locationId,
      appointmentTypeId,
      status,
      scheduledStart,
      endDate.toISOString(),
    ]
  );

  return appointmentId;
}

/**
 * Create a test prescription
 */
export async function createTestPrescription(
  tenantId: string,
  patientId: string,
  providerId: string,
  medicationName: string,
  requiresPriorAuth: boolean = false
): Promise<string> {
  const prescriptionId = randomUUID();

  await pool.query(
    `INSERT INTO prescriptions (
      id, tenant_id, patient_id, provider_id, medication_name, created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())`,
    [prescriptionId, tenantId, patientId, providerId, medicationName]
  );

  return prescriptionId;
}

/**
 * Generate auth headers for tests
 */
export function getAuthHeaders(user: TestUser): Record<string, string> {
  return {
    'Authorization': `Bearer ${user.token}`,
    'X-Tenant-Id': user.tenantId,
  };
}

/**
 * Clean up test data for a tenant
 */
export async function cleanupTestTenant(tenantId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete in order to respect foreign key constraints
    const tables: Array<{ name: string; tenantColumn: string }> = [
      { name: 'waitlist_holds', tenantColumn: 'tenant_id' },
      { name: 'waitlist', tenantColumn: 'tenant_id' },
      { name: 'time_blocks', tenantColumn: 'tenant_id' },
      { name: 'prior_auth_requests', tenantColumn: 'tenant_id' },
      { name: 'prescriptions', tenantColumn: 'tenant_id' },
      { name: 'faxes', tenantColumn: 'tenant_id' },
      { name: 'portal_checkin_sessions', tenantColumn: 'tenant_id' },
      { name: 'appointments', tenantColumn: 'tenant_id' },
      { name: 'appointment_types', tenantColumn: 'tenant_id' },
      { name: 'locations', tenantColumn: 'tenant_id' },
      { name: 'providers', tenantColumn: 'tenant_id' },
      { name: 'patients', tenantColumn: 'tenant_id' },
      { name: 'audit_log', tenantColumn: 'tenant_id' },
      { name: 'users', tenantColumn: 'tenant_id' },
      { name: 'tenants', tenantColumn: 'id' },
    ];

    for (const table of tables) {
      await client.query(`DELETE FROM ${table.name} WHERE ${table.tenantColumn} = $1`, [tenantId]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Wait for a condition to be true (polling helper)
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return false;
}

/**
 * Create a future date (for scheduling)
 */
export function getFutureDate(daysAhead: number, hour: number = 9): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/**
 * Create a patient portal token
 */
export function createPatientPortalToken(
  patientId: string,
  tenantId: string
): string {
  return jwt.sign(
    { patientId, tenantId, type: 'patient_portal' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '24h' }
  );
}
