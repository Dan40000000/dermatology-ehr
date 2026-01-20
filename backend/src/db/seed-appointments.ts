import { randomUUID } from "crypto";
import { pool } from "./pool";

/**
 * Seed Realistic Dermatology Appointments for Next 2 Weeks
 * Creates diverse appointments for MD/Dermatologist and Cosmetic PA
 */

async function seedAppointments() {
  await pool.query("BEGIN");
  try {
    const tenantId = "tenant-demo";

    console.log("Fetching existing data...");

    // Get providers
    const providersRes = await pool.query(
      `SELECT id, full_name, specialty FROM providers WHERE tenant_id = $1`,
      [tenantId]
    );
    const providers = providersRes.rows;
    console.log(`Found ${providers.length} providers:`, providers.map(p => p.full_name));

    // Get patients
    const patientsRes = await pool.query(
      `SELECT id, first_name, last_name FROM patients WHERE tenant_id = $1`,
      [tenantId]
    );
    const patients = patientsRes.rows;
    console.log(`Found ${patients.length} patients`);

    // Get appointment types
    const apptTypesRes = await pool.query(
      `SELECT id, name, duration_minutes FROM appointment_types WHERE tenant_id = $1`,
      [tenantId]
    );
    const apptTypes = apptTypesRes.rows;
    console.log(`Found ${apptTypes.length} appointment types:`, apptTypes.map(t => t.name));

    // Get locations
    const locationsRes = await pool.query(
      `SELECT id, name FROM locations WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    const location = locationsRes.rows[0];
    console.log(`Using location: ${location.name}`);

    if (providers.length === 0 || patients.length === 0 || apptTypes.length === 0) {
      throw new Error("Missing required data. Please run seed script first.");
    }

    // Identify providers (look for MD/Dermatologist and PA)
    const mdProvider = providers.find(p =>
      p.full_name.toLowerCase().includes('dr.') ||
      p.full_name.toLowerCase().includes('skin') ||
      p.id === 'prov-demo'
    ) || providers[0];

    const paProvider = providers.find(p =>
      p.full_name.toLowerCase().includes('pa') ||
      p.full_name.toLowerCase().includes('riley') ||
      p.id === 'prov-demo-2'
    ) || providers[1] || providers[0];

    console.log(`MD Provider: ${mdProvider.full_name}`);
    console.log(`PA Provider: ${paProvider.full_name}`);

    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ========================================================================
    // APPOINTMENT TEMPLATES FOR MD/DERMATOLOGIST
    // ========================================================================
    const mdAppointmentTemplates = [
      { type: "Skin Cancer Screening", duration: 30, chief_complaint: "Annual full body skin check" },
      { type: "Skin Cancer Screening", duration: 30, chief_complaint: "Skin cancer screening - family history" },
      { type: "Melanoma Follow-up", duration: 20, chief_complaint: "Melanoma surveillance - quarterly check" },
      { type: "Melanoma Follow-up", duration: 20, chief_complaint: "Post-excision melanoma follow-up" },
      { type: "Atypical Mole Evaluation", duration: 30, chief_complaint: "Suspicious mole on back" },
      { type: "Atypical Mole Evaluation", duration: 30, chief_complaint: "Changing nevus - dermoscopy needed" },
      { type: "Biopsy", duration: 30, chief_complaint: "Shave biopsy - scalp lesion" },
      { type: "Biopsy", duration: 30, chief_complaint: "Punch biopsy - atypical mole" },
      { type: "Biopsy", duration: 45, chief_complaint: "Multiple biopsies - AKs and suspicious lesions" },
      { type: "Mohs Consultation", duration: 45, chief_complaint: "Mohs surgery consult - BCC right nose" },
      { type: "Mohs Consultation", duration: 45, chief_complaint: "Post-Mohs follow-up and suture removal" },
      { type: "Psoriasis Management", duration: 30, chief_complaint: "Psoriasis flare - biologic check" },
      { type: "Psoriasis Management", duration: 20, chief_complaint: "Psoriatic arthritis - joint and skin eval" },
      { type: "Eczema/Dermatitis", duration: 30, chief_complaint: "Severe eczema flare" },
      { type: "Eczema/Dermatitis", duration: 20, chief_complaint: "Contact dermatitis - patch test results" },
      { type: "Acne Management", duration: 30, chief_complaint: "Severe cystic acne - Accutane consult" },
      { type: "Acne Management", duration: 20, chief_complaint: "Acne follow-up - isotretinoin monitoring" },
      { type: "General Dermatology", duration: 30, chief_complaint: "Rash evaluation" },
      { type: "General Dermatology", duration: 20, chief_complaint: "Wart treatment - cryotherapy" },
      { type: "Procedure", duration: 45, chief_complaint: "Cryotherapy for multiple AKs" },
      { type: "Procedure", duration: 30, chief_complaint: "Excision - sebaceous cyst" },
    ];

    // ========================================================================
    // APPOINTMENT TEMPLATES FOR COSMETIC PA
    // ========================================================================
    const paAppointmentTemplates = [
      { type: "Botox Treatment", duration: 30, chief_complaint: "Botox - forehead and glabella" },
      { type: "Botox Treatment", duration: 30, chief_complaint: "Botox - crow's feet and frown lines" },
      { type: "Botox Consultation", duration: 30, chief_complaint: "New patient Botox consultation" },
      { type: "Botox Follow-up", duration: 20, chief_complaint: "Botox touch-up - 2 weeks post-injection" },
      { type: "Filler Treatment", duration: 45, chief_complaint: "Juvederm - nasolabial folds" },
      { type: "Filler Treatment", duration: 45, chief_complaint: "Restylane - lip augmentation" },
      { type: "Filler Treatment", duration: 45, chief_complaint: "Radiesse - cheek volume restoration" },
      { type: "Filler Consultation", duration: 30, chief_complaint: "Filler consult - under eye hollows" },
      { type: "Chemical Peel", duration: 45, chief_complaint: "TCA peel - acne scarring" },
      { type: "Chemical Peel", duration: 30, chief_complaint: "Glycolic peel - photoaging" },
      { type: "Chemical Peel", duration: 30, chief_complaint: "Salicylic peel - acne treatment" },
      { type: "Microneedling", duration: 60, chief_complaint: "Microneedling with PRP - scars" },
      { type: "Microneedling", duration: 45, chief_complaint: "Microneedling - facial rejuvenation" },
      { type: "Laser Treatment", duration: 45, chief_complaint: "IPL - sun damage and redness" },
      { type: "Laser Treatment", duration: 60, chief_complaint: "Fraxel laser - acne scars" },
      { type: "Laser Treatment", duration: 30, chief_complaint: "VBeam laser - rosacea treatment" },
      { type: "Laser Treatment", duration: 30, chief_complaint: "Laser hair removal - face" },
      { type: "Cosmetic Consultation", duration: 30, chief_complaint: "Comprehensive anti-aging consult" },
      { type: "Cosmetic Consultation", duration: 30, chief_complaint: "Melasma treatment planning" },
      { type: "Cosmetic Follow-up", duration: 20, chief_complaint: "Post-procedure check" },
    ];

    // ========================================================================
    // GENERATE APPOINTMENTS FOR NEXT 2 WEEKS
    // ========================================================================

    const appointments = [];
    let appointmentCounter = 1;

    // For each business day in the next 2 weeks (14 days)
    for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
      const apptDate = new Date(today);
      apptDate.setDate(apptDate.getDate() + dayOffset);

      const dayOfWeek = apptDate.getDay();
      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      // ===== MD SCHEDULE (8am-5pm, ~6-8 appointments per day) =====
      let mdApptsThisDay = 6 + Math.floor(Math.random() * 3); // 6-8 appointments
      let mdCurrentHour = 8;
      let mdCurrentMinute = 0;

      for (let i = 0; i < mdApptsThisDay; i++) {
        if (mdCurrentHour >= 17) break; // Stop at 5pm

        // Randomly select appointment template
        const template = mdAppointmentTemplates[Math.floor(Math.random() * mdAppointmentTemplates.length)]!;

        // Random duration variation (±5 minutes)
        const duration = template.duration + (Math.random() > 0.5 ? 5 : -5);

        const startTime = new Date(apptDate);
        startTime.setHours(mdCurrentHour, mdCurrentMinute, 0, 0);

        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + duration);

        // Select random patient
        const patient = patients[Math.floor(Math.random() * patients.length)];

        // Determine status based on date
        let status = "scheduled";
        if (dayOffset === 1) {
          // Today - some checked in
          const rand = Math.random();
          if (rand < 0.3) status = "checked_in";
          else if (rand < 0.5) status = "in_room";
          else if (rand < 0.6) status = "with_provider";
        } else if (dayOffset <= 3) {
          // Next 2 days - some confirmed
          if (Math.random() < 0.4) status = "confirmed";
        }

        // Random appointment type from existing types
        const apptType = apptTypes[Math.floor(Math.random() * apptTypes.length)];

        appointments.push({
          id: `appt-md-seed-${appointmentCounter++}`,
          tenant_id: tenantId,
          patient_id: patient.id,
          provider_id: mdProvider.id,
          location_id: location.id,
          appointment_type_id: apptType.id,
          scheduled_start: startTime.toISOString(),
          scheduled_end: endTime.toISOString(),
          status: status,
        });

        // Move to next time slot (add duration + 10-20 min buffer)
        mdCurrentMinute += duration + 10 + Math.floor(Math.random() * 10);
        while (mdCurrentMinute >= 60) {
          mdCurrentMinute -= 60;
          mdCurrentHour++;
        }
      }

      // ===== PA SCHEDULE (9am-5pm, ~7-10 appointments per day - busier) =====
      let paApptsThisDay = 7 + Math.floor(Math.random() * 4); // 7-10 appointments
      let paCurrentHour = 9;
      let paCurrentMinute = 0;

      for (let i = 0; i < paApptsThisDay; i++) {
        if (paCurrentHour >= 17) break; // Stop at 5pm

        // Randomly select appointment template
        const template = paAppointmentTemplates[Math.floor(Math.random() * paAppointmentTemplates.length)]!;

        // Use template duration
        const duration = template.duration;

        const startTime = new Date(apptDate);
        startTime.setHours(paCurrentHour, paCurrentMinute, 0, 0);

        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + duration);

        // Select random patient (cosmetic patients often different)
        const patient = patients[Math.floor(Math.random() * patients.length)];

        // Determine status
        let status = "scheduled";
        if (dayOffset === 1) {
          // Today - some checked in
          const rand = Math.random();
          if (rand < 0.3) status = "checked_in";
          else if (rand < 0.5) status = "in_room";
          else if (rand < 0.6) status = "with_provider";
        } else if (dayOffset <= 3) {
          // Next 2 days - some confirmed
          if (Math.random() < 0.4) status = "confirmed";
        }

        // Random appointment type from existing types
        const apptType = apptTypes[Math.floor(Math.random() * apptTypes.length)];

        appointments.push({
          id: `appt-pa-seed-${appointmentCounter++}`,
          tenant_id: tenantId,
          patient_id: patient.id,
          provider_id: paProvider.id,
          location_id: location.id,
          appointment_type_id: apptType.id,
          scheduled_start: startTime.toISOString(),
          scheduled_end: endTime.toISOString(),
          status: status,
        });

        // Move to next time slot (add duration + 5-15 min buffer)
        paCurrentMinute += duration + 5 + Math.floor(Math.random() * 10);
        while (paCurrentMinute >= 60) {
          paCurrentMinute -= 60;
          paCurrentHour++;
        }
      }
    }

    // ========================================================================
    // INSERT APPOINTMENTS
    // ========================================================================
    console.log(`\nInserting ${appointments.length} appointments...`);

    for (const appt of appointments) {
      await pool.query(
        `INSERT INTO appointments(
          id, tenant_id, patient_id, provider_id, location_id,
          appointment_type_id, scheduled_start, scheduled_end,
          status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING`,
        [
          appt.id,
          appt.tenant_id,
          appt.patient_id,
          appt.provider_id,
          appt.location_id,
          appt.appointment_type_id,
          appt.scheduled_start,
          appt.scheduled_end,
          appt.status,
        ]
      );
    }

    await pool.query("COMMIT");

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log("\n✓ Appointment seeding complete!");
    console.log(`✓ Created ${appointments.length} appointments for the next 2 weeks`);

    const mdCount = appointments.filter(a => a.provider_id === mdProvider.id).length;
    const paCount = appointments.filter(a => a.provider_id === paProvider.id).length;

    console.log(`\nBreakdown:`);
    console.log(`  - MD/Dermatologist (${mdProvider.full_name}): ${mdCount} appointments`);
    console.log(`  - Cosmetic PA (${paProvider.full_name}): ${paCount} appointments`);

    const statusCounts = appointments.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`\nStatus Distribution:`);
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  - ${status}: ${count}`);
    });

    console.log(`\nMD Appointment Types:`);
    const mdTypes = mdAppointmentTemplates.map(t => t.type);
    const uniqueMdTypes = [...new Set(mdTypes)];
    uniqueMdTypes.forEach(type => {
      const count = mdAppointmentTemplates.filter(t => t.type === type).length;
      console.log(`  - ${type} (${count} templates)`);
    });

    console.log(`\nPA Appointment Types:`);
    const paTypes = paAppointmentTemplates.map(t => t.type);
    const uniquePaTypes = [...new Set(paTypes)];
    uniquePaTypes.forEach(type => {
      const count = paAppointmentTemplates.filter(t => t.type === type).length;
      console.log(`  - ${type} (${count} templates)`);
    });

  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

// Export function for programmatic use
export { seedAppointments };

// Run if executed directly
if (require.main === module) {
  seedAppointments()
    .then(() => {
      console.log("\n✓ Done!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n✗ Appointment seeding failed:", err);
      process.exit(1);
    });
}
