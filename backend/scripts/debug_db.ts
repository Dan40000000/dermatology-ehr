import { pool } from '../src/db/pool';

async function debug() {
  try {
    // Count patients directly
    const count = await pool.query('SELECT count(*) FROM patients');
    console.log('Total patients in DB:', count.rows[0].count);

    // List all patients with any tenant_id
    const all = await pool.query('SELECT id, tenant_id, first_name, last_name FROM patients LIMIT 10');
    console.log('\nAll patients (any tenant):');
    console.log(all.rows);

    // Check tenant_id values in patients
    const tenants = await pool.query('SELECT DISTINCT tenant_id FROM patients');
    console.log('\nTenant IDs in patients table:', tenants.rows);

    // Check if there's a "tenant-demo" tenant
    const tenantDemo = await pool.query("SELECT id, name FROM tenants WHERE id = 'tenant-demo'");
    console.log('\nTenant-demo exists:', tenantDemo.rows);

    // Check encounters patient_ids
    const encPatients = await pool.query('SELECT DISTINCT patient_id FROM encounters LIMIT 5');
    console.log('\nEncounter patient_ids:', encPatients.rows);

    // Try to find those patient_ids
    if (encPatients.rows.length > 0) {
      const patientId = encPatients.rows[0].patient_id;
      const patient = await pool.query('SELECT * FROM patients WHERE id = $1', [patientId]);
      console.log('\nLooking for patient:', patientId);
      console.log('Found:', patient.rows);
    }

    // Check all tables record count
    const tables = await pool.query(`
      SELECT schemaname, relname, n_live_tup
      FROM pg_stat_user_tables
      WHERE relname IN ('patients', 'encounters', 'appointments', 'tenants', 'users')
      ORDER BY relname
    `);
    console.log('\nTable counts:', tables.rows);

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

debug();
