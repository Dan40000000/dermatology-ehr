const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://derm_user:derm_pass@localhost:5432/derm_db',
});

const TENANT_ID = 'tenant-demo';
const KNOWN_PORTAL_PASSWORD = 'Patient123!';
const DANIEL_PERRY_ID = '6fdd36e1-0708-4f26-9f76-0b3461e0d247';
const PERRY_DANIEL_DUPLICATE_ID = 'f25499a1-6bf0-4e2a-8fbd-e6d8ee4b927c';

const CLEANUP_PATIENTS = [
  ['9c8624ce-c6ad-4b77-903b-ea1af9537bb7', 'Mason', 'Anderson', '720-555-2001', 'mason.anderson@email.com'],
  ['dbceb6f6-7c8f-46f1-93a0-4ac7ca2630c4', 'Chloe', 'Bennett', '720-555-2002', 'chloe.bennett@email.com'],
  ['389cc383-bf55-4ec5-bb4e-935cda6cbbeb', 'Noah', 'Brooks', '720-555-2003', 'noah.brooks@email.com'],
  ['ea813ca3-df26-4dd9-81da-6a43fc964a9a', 'Olivia', 'Carter', '720-555-2004', 'olivia.carter@email.com'],
  ['7bc2638c-c38d-4706-8f42-e6e0538096aa', 'Logan', 'Clark', '720-555-2005', 'logan.clark@email.com'],
  ['2acd59f0-40f4-46cf-82c9-2c872784def3', 'Ella', 'Collins', '720-555-2006', 'ella.collins@email.com'],
  ['617e1aa6-76b5-400b-91d8-0ff5e2e29417', 'Isaac', 'Davis', '720-555-2007', 'isaac.davis@email.com'],
  ['a2499f15-b5eb-410a-965a-2f0e70169dad', 'Grace', 'Edwards', '720-555-2008', 'grace.edwards@email.com'],
  ['7fa8d42f-d956-442c-9b73-e3bacd4209f9', 'Henry', 'Foster', '720-555-2009', 'henry.foster@email.com'],
  ['7a3deb87-4a97-48fb-8270-d19a5929191c', 'Zoe', 'Gray', '720-555-2010', 'zoe.gray@email.com'],
  ['ff6192b2-0583-4918-8af0-1cb0865cf06d', 'Caleb', 'Harris', '720-555-2011', 'caleb.harris@email.com'],
  ['3b637a8c-163b-42ea-a48e-6fd197e8970c', 'Evan', 'Torres', '720-555-2012', 'evan.torres@email.com'],
  ['8bc7b14d-5a11-4583-a3f8-5f80c14b6573', 'Marcus', 'Reed', '720-555-2013', 'marcus.reed@email.com'],
  [PERRY_DANIEL_DUPLICATE_ID, 'Oliver', 'Hayes', '720-555-2014', 'oliver.hayes@email.com'],
];

const RETEST_APPOINTMENTS = [
  {
    id: 'appt-retest-emily-followup',
    patientId: 'p-003',
    providerId: 'prov-demo',
    locationId: 'loc-demo',
    appointmentTypeId: 'appttype-fu',
    startUtc: '16:00',
    endUtc: '16:20',
  },
  {
    id: 'appt-retest-jamie-balance',
    patientId: 'p-demo',
    providerId: 'prov-demo',
    locationId: 'loc-demo',
    appointmentTypeId: 'appttype-fu',
    startUtc: '16:30',
    endUtc: '16:50',
  },
  {
    id: 'appt-retest-sarah-cosmetic-consult',
    patientId: 'p-001',
    providerId: 'prov-cosmetic-pa',
    locationId: 'loc-demo',
    appointmentTypeId: 'appttype-cosmetic-consult',
    startUtc: '17:00',
    endUtc: '17:30',
  },
  {
    id: 'appt-retest-daniel-hydrafacial',
    patientId: 'p-021',
    providerId: 'prov-cosmetic-pa',
    locationId: 'loc-demo',
    appointmentTypeId: 'appttype-hydrafacial',
    startUtc: '17:45',
    endUtc: '18:30',
  },
  {
    id: 'appt-retest-karen-biopsy',
    patientId: 'p-006',
    providerId: 'prov-demo-3',
    locationId: 'loc-east',
    appointmentTypeId: 'appttype-lesion-biopsy',
    startUtc: '18:00',
    endUtc: '18:30',
  },
  {
    id: 'appt-retest-emma-melanoma',
    patientId: 'p-016',
    providerId: 'prov-demo-3',
    locationId: 'loc-demo',
    appointmentTypeId: 'appttype-melanoma-check',
    startUtc: '18:40',
    endUtc: '19:10',
  },
  {
    id: 'appt-retest-stephanie-microneedling',
    patientId: 'p-022',
    providerId: 'prov-cosmetic-pa',
    locationId: 'loc-demo',
    appointmentTypeId: 'appttype-microneedling',
    startUtc: '19:15',
    endUtc: '20:15',
  },
];

function isoForToday(timeUtc) {
  const today = new Date().toISOString().slice(0, 10);
  return `${today}T${timeUtc}:00.000Z`;
}

async function ensureDanielPerryPortalAccount(client) {
  const passwordHash = await bcrypt.hash(KNOWN_PORTAL_PASSWORD, 12);

  const existing = await client.query(
    `SELECT id
     FROM patient_portal_accounts
     WHERE tenant_id = $1 AND patient_id = $2
     LIMIT 1`,
    [TENANT_ID, DANIEL_PERRY_ID]
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE patient_portal_accounts
       SET email = $1,
           password_hash = $2,
           is_active = true,
           email_verified = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      ['daniel.perry@email.com', passwordHash, existing.rows[0].id]
    );
    return;
  }

  await client.query(
    `INSERT INTO patient_portal_accounts (
      id, tenant_id, patient_id, email, password_hash, is_active, email_verified
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      'portal-daniel-perry',
      TENANT_ID,
      DANIEL_PERRY_ID,
      'daniel.perry@email.com',
      passwordHash,
      true,
      true,
    ]
  );
}

async function cleanDemoPatients(client) {
  await client.query(
    `UPDATE sms_messages
     SET patient_id = $1
     WHERE patient_id = $2`,
    [DANIEL_PERRY_ID, PERRY_DANIEL_DUPLICATE_ID]
  );

  await client.query(
    `UPDATE sms_conversations
     SET patient_id = $1
     WHERE patient_id = $2`,
    [DANIEL_PERRY_ID, PERRY_DANIEL_DUPLICATE_ID]
  ).catch(() => undefined);

  await client.query(
    `UPDATE sms_message_reads
     SET patient_id = $1
     WHERE patient_id = $2`,
    [DANIEL_PERRY_ID, PERRY_DANIEL_DUPLICATE_ID]
  ).catch(() => undefined);

  for (const [id, firstName, lastName, phone, email] of CLEANUP_PATIENTS) {
    await client.query(
      `UPDATE patients
       SET first_name = $3,
           last_name = $4,
           phone = $5,
           email = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND id = $2`,
      [TENANT_ID, id, firstName, lastName, phone, email]
    );
  }

  await client.query(
    `UPDATE patients
     SET phone = '541-231-8693',
         email = 'daniel.perry@email.com',
         updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1 AND id = $2`,
    [TENANT_ID, DANIEL_PERRY_ID]
  );
}

async function reseedRetestAppointments(client) {
  const scenarioPatientIds = Array.from(new Set(RETEST_APPOINTMENTS.map((appt) => appt.patientId)));
  const scenarioAppointmentIds = RETEST_APPOINTMENTS.map((appt) => appt.id);

  await client.query(
    `DELETE FROM appointments
     WHERE tenant_id = $1
       AND patient_id = ANY($2::text[])
       AND DATE(scheduled_start) = CURRENT_DATE
       AND id <> ALL($3::text[])`,
    [TENANT_ID, scenarioPatientIds, scenarioAppointmentIds]
  );

  for (const appointment of RETEST_APPOINTMENTS) {
    await client.query(
      `INSERT INTO appointments (
        id, tenant_id, patient_id, provider_id, location_id,
        appointment_type_id, scheduled_start, scheduled_end, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
      ON CONFLICT (id) DO UPDATE
      SET patient_id = EXCLUDED.patient_id,
          provider_id = EXCLUDED.provider_id,
          location_id = EXCLUDED.location_id,
          appointment_type_id = EXCLUDED.appointment_type_id,
          scheduled_start = EXCLUDED.scheduled_start,
          scheduled_end = EXCLUDED.scheduled_end,
          status = 'scheduled'`,
      [
        appointment.id,
        TENANT_ID,
        appointment.patientId,
        appointment.providerId,
        appointment.locationId,
        appointment.appointmentTypeId,
        isoForToday(appointment.startUtc),
        isoForToday(appointment.endUtc),
      ]
    );
  }
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensureDanielPerryPortalAccount(client);
    await cleanDemoPatients(client);
    await reseedRetestAppointments(client);
    await client.query('COMMIT');

    console.log('Prepared tenant-demo for retest.');
    console.log('Portal scheduling login: daniel.perry@email.com / Patient123!');
    console.log('Retest appointments seeded:', RETEST_APPOINTMENTS.map((appt) => appt.id).join(', '));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to prepare demo retest data:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Unhandled prepareDemoRetest failure:', error);
  process.exitCode = 1;
});
