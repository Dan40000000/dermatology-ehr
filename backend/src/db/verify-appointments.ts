import { pool } from "./pool";

async function verifyAppointments() {
  try {
    const tenantId = "tenant-demo";

    console.log("\n========== DETAILED APPOINTMENT VERIFICATION ==========\n");

    // Get appointment type distribution
    const typeRes = await pool.query(
      `SELECT
         at.name,
         COUNT(*) as count,
         MIN(at.duration_minutes) as duration
       FROM appointments a
       JOIN appointment_types at ON a.appointment_type_id = at.id
       WHERE a.tenant_id = $1
         AND a.scheduled_start >= NOW()
         AND a.scheduled_start < NOW() + INTERVAL '14 days'
       GROUP BY at.name, at.duration_minutes
       ORDER BY count DESC`,
      [tenantId]
    );

    console.log("Appointment Types for Next 2 Weeks:");
    console.log("====================================");
    typeRes.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.count} appointments (${row.duration} min each)`);
    });

    // Get provider schedules for this week
    console.log("\n\nProvider Schedules (Next 7 Days):");
    console.log("===================================");

    const providers = await pool.query(
      `SELECT DISTINCT p.id, p.full_name
       FROM providers p
       JOIN appointments a ON p.id = a.provider_id
       WHERE a.tenant_id = $1
         AND a.scheduled_start >= NOW()
         AND a.scheduled_start < NOW() + INTERVAL '7 days'
       ORDER BY p.full_name`,
      [tenantId]
    );

    for (const provider of providers.rows) {
      const scheduleRes = await pool.query(
        `SELECT
           DATE(scheduled_start) as date,
           COUNT(*) as appt_count,
           MIN(scheduled_start) as first_appt,
           MAX(scheduled_end) as last_appt,
           SUM(EXTRACT(EPOCH FROM (scheduled_end - scheduled_start))/60) as total_minutes
         FROM appointments
         WHERE tenant_id = $1
           AND provider_id = $2
           AND scheduled_start >= NOW()
           AND scheduled_start < NOW() + INTERVAL '7 days'
         GROUP BY DATE(scheduled_start)
         ORDER BY date`,
        [tenantId, provider.id]
      );

      console.log(`\n${provider.full_name}:`);
      scheduleRes.rows.forEach(row => {
        const date = new Date(row.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const firstTime = new Date(row.first_appt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const lastTime = new Date(row.last_appt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        const hours = (row.total_minutes / 60).toFixed(1);
        console.log(`  ${dayName}: ${row.appt_count} appts (${firstTime} - ${lastTime}, ${hours} hrs)`);
      });
    }

    // Status breakdown for upcoming week
    console.log("\n\nStatus Breakdown (Next 7 Days):");
    console.log("==================================");

    const statusRes = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM appointments
       WHERE tenant_id = $1
         AND scheduled_start >= NOW()
         AND scheduled_start < NOW() + INTERVAL '7 days'
       GROUP BY status
       ORDER BY count DESC`,
      [tenantId]
    );

    statusRes.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count}`);
    });

    // Sample appointment details
    console.log("\n\nSample Appointment Details (Tomorrow):");
    console.log("========================================");

    const sampleRes = await pool.query(
      `SELECT
         TO_CHAR(a.scheduled_start, 'HH12:MI AM') as time,
         EXTRACT(EPOCH FROM (a.scheduled_end - a.scheduled_start))/60 as duration,
         p.full_name as provider,
         pat.first_name || ' ' || pat.last_name as patient,
         at.name as type,
         a.status,
         l.name as location
       FROM appointments a
       JOIN providers p ON a.provider_id = p.id
       JOIN patients pat ON a.patient_id = pat.id
       JOIN appointment_types at ON a.appointment_type_id = at.id
       JOIN locations l ON a.location_id = l.id
       WHERE a.tenant_id = $1
         AND a.scheduled_start::date = CURRENT_DATE + 1
       ORDER BY a.scheduled_start
       LIMIT 15`,
      [tenantId]
    );

    sampleRes.rows.forEach(row => {
      console.log(`${row.time} | ${Math.round(row.duration)}m | ${row.provider}`);
      console.log(`  Patient: ${row.patient} | Type: ${row.type} | Status: ${row.status}`);
      console.log(`  Location: ${row.location}`);
      console.log('');
    });

    console.log("========================================\n");

  } catch (err) {
    console.error("Verification failed:", err);
    throw err;
  } finally {
    await pool.end();
  }
}

// Run verification
verifyAppointments()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
