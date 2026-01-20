import { pool } from "./pool";

async function queryAppointments() {
  try {
    const tenantId = "tenant-demo";

    console.log("\n========== APPOINTMENT SUMMARY ==========\n");

    // Total count
    const totalRes = await pool.query(
      `SELECT COUNT(*) as count FROM appointments WHERE tenant_id = $1`,
      [tenantId]
    );
    console.log(`Total appointments: ${totalRes.rows[0].count}`);

    // Count by provider
    const providerRes = await pool.query(
      `SELECT p.full_name, COUNT(a.id) as count
       FROM appointments a
       JOIN providers p ON a.provider_id = p.id
       WHERE a.tenant_id = $1
       GROUP BY p.full_name
       ORDER BY count DESC`,
      [tenantId]
    );
    console.log(`\nAppointments by provider:`);
    providerRes.rows.forEach(row => {
      console.log(`  ${row.full_name}: ${row.count}`);
    });

    // Count by status
    const statusRes = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM appointments
       WHERE tenant_id = $1
       GROUP BY status
       ORDER BY count DESC`,
      [tenantId]
    );
    console.log(`\nAppointments by status:`);
    statusRes.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count}`);
    });

    // Appointments for next 2 weeks
    const nextTwoWeeksRes = await pool.query(
      `SELECT
         DATE(scheduled_start) as date,
         COUNT(*) as count
       FROM appointments
       WHERE tenant_id = $1
         AND scheduled_start >= NOW()
         AND scheduled_start < NOW() + INTERVAL '14 days'
       GROUP BY DATE(scheduled_start)
       ORDER BY date`,
      [tenantId]
    );
    console.log(`\nAppointments by date (next 2 weeks):`);
    nextTwoWeeksRes.rows.forEach(row => {
      const date = new Date(row.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      console.log(`  ${dayName} ${row.date}: ${row.count} appointments`);
    });

    // Sample appointments for today/tomorrow
    const sampleRes = await pool.query(
      `SELECT
         a.scheduled_start,
         a.status,
         p.full_name as provider,
         pat.first_name || ' ' || pat.last_name as patient,
         at.name as type,
         at.duration_minutes
       FROM appointments a
       JOIN providers p ON a.provider_id = p.id
       JOIN patients pat ON a.patient_id = pat.id
       JOIN appointment_types at ON a.appointment_type_id = at.id
       WHERE a.tenant_id = $1
         AND a.scheduled_start >= NOW()
         AND a.scheduled_start < NOW() + INTERVAL '2 days'
       ORDER BY a.scheduled_start
       LIMIT 20`,
      [tenantId]
    );
    console.log(`\nSample appointments (next 2 days):`);
    sampleRes.rows.forEach(row => {
      const time = new Date(row.scheduled_start).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      console.log(`  ${time} | ${row.provider} | ${row.patient} | ${row.type} (${row.duration_minutes}m) | ${row.status}`);
    });

    console.log("\n========================================\n");

  } catch (err) {
    console.error("Query failed:", err);
    throw err;
  } finally {
    await pool.end();
  }
}

// Run query
queryAppointments()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
