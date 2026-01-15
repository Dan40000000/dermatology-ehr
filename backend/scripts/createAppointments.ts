import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://derm_user:derm_pass@localhost:5432/derm_db'
});

async function createAppointments() {
  const tenantId = 'tenant-demo';
  const providers = [
    { id: 'prov-demo', name: 'Dr. Skin' },
    { id: 'prov-demo-2', name: 'PA Riley' }
  ];
  const locationId = 'loc-demo';
  const apptTypes = [
    { id: 'appttype-demo', duration: 30, name: 'New Patient' },
    { id: 'appttype-fu', duration: 20, name: 'Follow Up' },
    { id: 'appttype-proc', duration: 45, name: 'Procedure' }
  ];

  // Find Daniel Perry
  const danielResult = await pool.query(
    `SELECT id FROM patients WHERE tenant_id = $1 AND (first_name ILIKE 'Daniel' OR first_name ILIKE 'Dan') AND last_name ILIKE 'Perry' LIMIT 1`,
    [tenantId]
  );

  let danielId = danielResult.rows[0]?.id;

  if (!danielId) {
    console.log('Creating Daniel Perry patient...');
    danielId = randomUUID();
    await pool.query(
      `INSERT INTO patients (id, tenant_id, first_name, last_name, dob, phone, email, address, city, state, zip, insurance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [danielId, tenantId, 'Daniel', 'Perry', '1985-03-15', '555-123-4567', 'daniel.perry@email.com', '123 Main St', 'Phoenix', 'AZ', '85001', 'Blue Cross Blue Shield']
    );
  }
  console.log('Daniel Perry ID:', danielId);

  // Create or find Sarah Johnson (2nd patient)
  const sarahResult = await pool.query(
    `SELECT id FROM patients WHERE tenant_id = $1 AND first_name = 'Sarah' AND last_name = 'Johnson' LIMIT 1`,
    [tenantId]
  );

  let sarahId = sarahResult.rows[0]?.id;

  if (!sarahId) {
    console.log('Creating Sarah Johnson patient...');
    sarahId = randomUUID();
    await pool.query(
      `INSERT INTO patients (id, tenant_id, first_name, last_name, dob, phone, email, address, city, state, zip, insurance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [sarahId, tenantId, 'Sarah', 'Johnson', '1990-07-22', '555-987-6543', 'sarah.johnson@email.com', '456 Oak Ave', 'Scottsdale', 'AZ', '85251', 'United Healthcare']
    );
  }
  console.log('Sarah Johnson ID:', sarahId);

  // Create appointments from today through June 30, 2026
  const startDate = new Date();
  const endDate = new Date('2026-06-30');

  let apptCount = 0;
  let currentDate = new Date(startDate);

  const chiefComplaints = [
    'Skin check',
    'Follow up',
    'Rash evaluation',
    'Mole concern',
    'Acne follow-up',
    'Eczema evaluation',
    'Psoriasis check',
    'Suspicious lesion',
    'Annual skin exam',
    'Post-procedure follow-up'
  ];

  while (currentDate <= endDate) {
    // Skip weekends
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Create appointments for each provider
    for (const provider of providers) {
      // Morning appointment - Daniel Perry
      const morningStart = new Date(currentDate);
      morningStart.setHours(9, Math.random() < 0.5 ? 0 : 30, 0, 0);
      const morningApptType = apptTypes[Math.floor(Math.random() * apptTypes.length)]!;
      const morningEnd = new Date(morningStart.getTime() + morningApptType.duration * 60 * 1000);

      // Afternoon appointment - Sarah Johnson
      const afternoonStart = new Date(currentDate);
      afternoonStart.setHours(14, Math.random() < 0.5 ? 0 : 30, 0, 0);
      const afternoonApptType = apptTypes[Math.floor(Math.random() * apptTypes.length)]!;
      const afternoonEnd = new Date(afternoonStart.getTime() + afternoonApptType.duration * 60 * 1000);

      // Determine status based on date
      let status = 'scheduled';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const apptDay = new Date(currentDate);
      apptDay.setHours(0, 0, 0, 0);

      if (apptDay < today) {
        status = 'completed';
      }

      // Daniel Perry - Morning appointment
      try {
        await pool.query(
          `INSERT INTO appointments (id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            randomUUID(),
            tenantId,
            danielId,
            provider.id,
            locationId,
            morningApptType.id,
            morningStart.toISOString(),
            morningEnd.toISOString(),
            status
          ]
        );
        apptCount++;
      } catch (err: any) {
        console.error('Error:', err.message);
      }

      // Sarah Johnson - Afternoon appointment
      try {
        await pool.query(
          `INSERT INTO appointments (id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            randomUUID(),
            tenantId,
            sarahId,
            provider.id,
            locationId,
            afternoonApptType.id,
            afternoonStart.toISOString(),
            afternoonEnd.toISOString(),
            status
          ]
        );
        apptCount++;
      } catch (err: any) {
        console.error('Error:', err.message);
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log('\n✅ Created ' + apptCount + ' appointments through June 30, 2026');
  console.log('');
  console.log('📅 Daily Schedule:');
  console.log('  Dr. Skin:');
  console.log('    - 9:00/9:30 AM: Daniel Perry');
  console.log('    - 2:00/2:30 PM: Sarah Johnson');
  console.log('  PA Riley:');
  console.log('    - 9:00/9:30 AM: Daniel Perry');
  console.log('    - 2:00/2:30 PM: Sarah Johnson');
  console.log('');
  console.log('Total: 4 appointments per weekday');

  await pool.end();
}

createAppointments().catch(console.error);
