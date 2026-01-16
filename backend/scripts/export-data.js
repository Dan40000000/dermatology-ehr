require('dotenv/config');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function exportData() {
  const patients = await pool.query(`
    SELECT * FROM patients WHERE tenant_id = 'tenant-demo'
  `);

  const appointments = await pool.query(`
    SELECT * FROM appointments WHERE tenant_id = 'tenant-demo'
  `);

  console.log(JSON.stringify({
    patients: patients.rows,
    appointments: appointments.rows
  }));

  await pool.end();
}

exportData().catch(e => { console.error(e); process.exit(1); });
