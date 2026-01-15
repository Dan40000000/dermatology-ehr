import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://derm_user:derm_pass@localhost:5432/derm_db'
});

async function setupPatientPortal() {
  const tenantId = 'tenant-demo';

  // Find Daniel Perry
  const danielResult = await pool.query(
    `SELECT id, first_name, last_name, email, dob FROM patients
     WHERE tenant_id = $1 AND first_name = 'Daniel' AND last_name = 'Perry'
     LIMIT 1`,
    [tenantId]
  );

  if (danielResult.rows.length === 0) {
    console.error('Daniel Perry patient not found!');
    await pool.end();
    return;
  }

  const daniel = danielResult.rows[0];
  console.log('Found patient:', daniel.first_name, daniel.last_name, '- ID:', daniel.id);
  console.log('Patient DOB:', daniel.dob);

  // Check if portal account already exists
  const existingAccount = await pool.query(
    `SELECT id, email FROM patient_portal_accounts
     WHERE tenant_id = $1 AND patient_id = $2`,
    [tenantId, daniel.id]
  );

  if (existingAccount.rows.length > 0) {
    console.log('Portal account already exists:', existingAccount.rows[0].email);
    console.log('\n🔑 Login credentials:');
    console.log('   Email: daniel.perry@email.com');
    console.log('   Password: Patient123!');
    console.log('   Portal URL: http://localhost:5173/portal/login');
    await pool.end();
    return;
  }

  // Create portal account with a known password
  const password = 'Patient123!';
  const passwordHash = await bcrypt.hash(password, 10);
  const accountId = randomUUID();

  await pool.query(
    `INSERT INTO patient_portal_accounts (
      id, tenant_id, patient_id, email, password_hash, is_active, email_verified
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      accountId,
      tenantId,
      daniel.id,
      'daniel.perry@email.com',
      passwordHash,
      true,
      true // Pre-verified so we can log in immediately
    ]
  );

  console.log('\n✅ Patient portal account created for Daniel Perry!');
  console.log('\n🔑 Login credentials:');
  console.log('   Email: daniel.perry@email.com');
  console.log('   Password: Patient123!');
  console.log('   Portal URL: http://localhost:5173/portal/login');
  console.log('   Practice ID: tenant-demo');
  console.log('\n📱 Patient Portal Features:');
  console.log('   - View upcoming appointments');
  console.log('   - View visit summaries (after provider releases them)');
  console.log('   - Send messages to the practice');
  console.log('   - Update profile information');
  console.log('   - View shared documents/lab results');

  await pool.end();
}

setupPatientPortal().catch(console.error);
