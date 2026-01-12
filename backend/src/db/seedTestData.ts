import { randomUUID } from "crypto";
import { pool } from "./pool";

/**
 * Comprehensive test data seeding script
 * This script creates realistic test data for all major features of the dermatology EHR
 */
async function seedTestData() {
  await pool.query("BEGIN");
  try {
    const tenantId = "tenant-demo";

    console.log("Creating test data for dermatology EHR...\n");

    // Get provider user IDs (they're in the users table, not providers table)
    const providersResult = await pool.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = 'provider' LIMIT 2`,
      [tenantId]
    );
    const userProviders = providersResult.rows.map((r: any) => r.id);

    // Fallback to getting actual provider IDs if no provider users exist
    if (userProviders.length === 0) {
      const provResult = await pool.query(
        `SELECT id FROM providers WHERE tenant_id = $1 LIMIT 2`,
        [tenantId]
      );
      userProviders.push(...provResult.rows.map((r: any) => r.id));
    }

    // 1. APPOINTMENTS - Create appointments for next 2 weeks
    console.log("Creating appointments for next 2 weeks...");
    const now = new Date();
    const providers = ["prov-demo", "prov-demo-2"];
    const providerNames = ["Dr. Skin", "PA Riley"];
    const apptTypes = [
      { id: "appttype-demo", duration: 30 },
      { id: "appttype-fu", duration: 20 },
      { id: "appttype-proc", duration: 45 },
    ];
    const statuses = ["scheduled", "checked_in", "in_progress", "completed", "cancelled"];
    const locationId = "loc-demo";

    // Get patient IDs
    const patientsResult = await pool.query(
      `SELECT id FROM patients WHERE tenant_id = $1 LIMIT 30`,
      [tenantId]
    );
    const patientIds = patientsResult.rows.map((r: any) => r.id);

    const appointments = [];
    for (let day = 0; day < 14; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      // Create 5-8 appointments per day
      const numAppts = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < numAppts; i++) {
        const hour = 9 + Math.floor(Math.random() * 7); // 9am-4pm
        const minute = Math.random() < 0.5 ? 0 : 30;

        const start = new Date(date);
        start.setHours(hour, minute, 0, 0);

        const providerIdx = Math.floor(Math.random() * providers.length);
        const apptType = apptTypes[Math.floor(Math.random() * apptTypes.length)];
        if (!apptType) continue;
        const end = new Date(start.getTime() + apptType.duration * 60 * 1000);

        // Determine status based on date
        let status = statuses[0]; // scheduled
        if (day < 0) {
          status = "completed";
        } else if (day === 0 && hour < now.getHours()) {
          status = Math.random() < 0.7 ? "completed" : "cancelled";
        } else if (day === 0 && hour === now.getHours()) {
          status = Math.random() < 0.5 ? "checked_in" : "in_progress";
        } else if (Math.random() < 0.05) {
          status = "cancelled";
        }

        appointments.push({
          id: randomUUID(),
          tenant_id: tenantId,
          patient_id: patientIds[i % patientIds.length],
          provider_id: providers[providerIdx],
          location_id: locationId,
          appointment_type_id: apptType.id,
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          status,
        });
      }
    }

    for (const appt of appointments) {
      await pool.query(
        `INSERT INTO appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
    console.log(`✅ Created ${appointments.length} appointments\n`);

    // 2. TIME BLOCKS
    console.log("Creating time blocks...");
    const timeBlocks = [];

    // Lunch blocks (12-1pm daily for next 2 weeks)
    for (let day = 0; day < 14; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      for (const providerId of userProviders) {
        const start = new Date(date);
        start.setHours(12, 0, 0, 0);
        const end = new Date(date);
        end.setHours(13, 0, 0, 0);

        timeBlocks.push({
          id: randomUUID(),
          tenant_id: tenantId,
          provider_id: providerId,
          location_id: locationId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          block_type: "lunch",
          title: "Lunch Break",
          description: "Daily lunch break",
        });
      }
    }

    // Meeting blocks (Tuesdays 2-3pm)
    for (let day = 0; day < 14; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      if (date.getDay() === 2) {
        // Tuesday
        for (const providerId of userProviders) {
          const start = new Date(date);
          start.setHours(14, 0, 0, 0);
          const end = new Date(date);
          end.setHours(15, 0, 0, 0);

          timeBlocks.push({
            id: randomUUID(),
            tenant_id: tenantId,
            provider_id: providerId,
            location_id: locationId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            block_type: "meeting",
            title: "Staff Meeting",
            description: "Weekly staff meeting",
          });
        }
      }
    }

    // Admin time (Fridays 8-9am)
    for (let day = 0; day < 14; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      if (date.getDay() === 5) {
        // Friday
        const start = new Date(date);
        start.setHours(8, 0, 0, 0);
        const end = new Date(date);
        end.setHours(9, 0, 0, 0);

        timeBlocks.push({
          id: randomUUID(),
          tenant_id: tenantId,
          provider_id: userProviders[0],
          location_id: locationId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          block_type: "administrative",
          title: "Administrative Time",
          description: "Administrative tasks and paperwork",
        });
      }
    }

    for (const block of timeBlocks) {
      await pool.query(
        `INSERT INTO time_blocks(id, tenant_id, provider_id, location_id, start_time, end_time, block_type, title, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [
          block.id,
          block.tenant_id,
          block.provider_id,
          block.location_id,
          block.start_time,
          block.end_time,
          block.block_type,
          block.title,
          block.description,
        ]
      );
    }
    console.log(`✅ Created ${timeBlocks.length} time blocks\n`);

    // 3. WAITLIST ENTRIES
    console.log("Creating waitlist entries...");
    const priorities = ["low", "normal", "high", "urgent"];
    const timePreferences = ["morning", "afternoon", "anytime"];
    const waitlistEntries = [];

    for (let i = 0; i < 10; i++) {
      const patientId = patientIds[i % patientIds.length];
      const providerId = userProviders[i % userProviders.length];

      const apptTypeForWaitlist = apptTypes[i % apptTypes.length];
      if (!apptTypeForWaitlist) continue;
      waitlistEntries.push({
        id: randomUUID(),
        tenant_id: tenantId,
        patient_id: patientId,
        provider_id: providerId,
        appointment_type_id: apptTypeForWaitlist.id,
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        preferred_time_of_day: timePreferences[Math.floor(Math.random() * timePreferences.length)],
        reason: [
          "Patient requesting earliest available",
          "Follow-up for recent procedure",
          "New lesion needs evaluation",
          "Medication refill needed",
          "Urgent: possible infection",
        ][i % 5],
        notes: "Additional notes for waitlist entry",
        created_at: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    for (const entry of waitlistEntries) {
      await pool.query(
        `INSERT INTO waitlist(id, tenant_id, patient_id, provider_id, appointment_type_id, priority, preferred_time_of_day, reason, notes, created_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING`,
        [
          entry.id,
          entry.tenant_id,
          entry.patient_id,
          entry.provider_id,
          entry.appointment_type_id,
          entry.priority,
          entry.preferred_time_of_day,
          entry.reason,
          entry.notes,
          entry.created_at,
          "active",
        ]
      );
    }
    console.log(`✅ Created ${waitlistEntries.length} waitlist entries\n`);

    // 4. PRIOR AUTH REQUESTS
    console.log("Creating prior authorization requests...");
    const paStatuses = ["pending", "submitted", "approved", "denied", "cancelled"];
    const medications = [
      { name: "Dupixent", ndc: "00024-5910-56" },
      { name: "Humira", ndc: "00074-4339-02" },
      { name: "Enbrel", ndc: "58406-0435-03" },
      { name: "Stelara", ndc: "57894-0060-02" },
      { name: "Otezla", ndc: "59310-0580-30" },
    ];

    const priorAuthRequests = [];
    for (let i = 0; i < 5; i++) {
      const med = medications[i];
      if (!med) continue;
      const status = paStatuses[i % paStatuses.length];
      const createdDate = new Date(now.getTime() - (5 - i) * 24 * 60 * 60 * 1000);

      let submittedDate = null;
      let approvedDate = null;
      let deniedDate = null;

      if (status !== "pending") {
        submittedDate = new Date(createdDate.getTime() + 2 * 60 * 60 * 1000);
      }
      if (status === "approved") {
        approvedDate = new Date(submittedDate!.getTime() + 48 * 60 * 60 * 1000);
      }
      if (status === "denied") {
        deniedDate = new Date(submittedDate!.getTime() + 48 * 60 * 60 * 1000);
      }

      const authNumber = `PA${Date.now()}-${i}`;
      priorAuthRequests.push({
        id: randomUUID(),
        tenant_id: tenantId,
        patient_id: patientIds[i % patientIds.length],
        provider_id: userProviders[i % userProviders.length],
        medication_name: med.name,
        auth_number: authNumber,
        diagnosis_code: ["L40.0", "L20.9", "L70.0"][i % 3],
        insurance_name: ["United Healthcare", "Cigna", "Aetna", "Anthem", "Kaiser"][i % 5],
        provider_npi: "1234567890",
        clinical_justification: `Patient requires ${med.name} for treatment of dermatological condition.`,
        status,
        created_at: createdDate.toISOString(),
        submitted_at: submittedDate?.toISOString(),
        approved_at: approvedDate?.toISOString(),
        denied_at: deniedDate?.toISOString(),
        denial_reason: status === "denied" ? "Medical necessity not established" : null,
        notes: `Prior auth for ${med.name} - ${status}`,
      });
    }

    for (const pa of priorAuthRequests) {
      await pool.query(
        `INSERT INTO prior_authorizations(id, tenant_id, patient_id, provider_id, medication_name, auth_number, diagnosis_code, insurance_name, provider_npi, clinical_justification, status, created_at, submitted_at, approved_at, denied_at, denial_reason, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO NOTHING`,
        [
          pa.id,
          pa.tenant_id,
          pa.patient_id,
          pa.provider_id,
          pa.medication_name,
          pa.auth_number,
          pa.diagnosis_code,
          pa.insurance_name,
          pa.provider_npi,
          pa.clinical_justification,
          pa.status,
          pa.created_at,
          pa.submitted_at,
          pa.approved_at,
          pa.denied_at,
          pa.denial_reason,
          pa.notes,
        ]
      );
    }
    console.log(`✅ Created ${priorAuthRequests.length} prior auth requests\n`);

    // 5. FAXES - Skipping (use API simulate endpoint instead)
    console.log("⚠️  Skipping faxes - use /api/fax/simulate-incoming endpoint\n");

    // 6. DIRECT MESSAGES - Skipping (use API endpoint instead)
    console.log("⚠️  Skipping Direct messages - use API endpoint instead\n");

    // 7. NOTES (ENCOUNTERS)
    console.log("Creating clinical notes...");
    const noteStatuses = ["draft", "preliminary", "final", "signed"];
    const encounters = [];

    for (let i = 0; i < 20; i++) {
      const patientId = patientIds[i % patientIds.length];
      const providerId = providers[i % providers.length];
      const status = noteStatuses[i % noteStatuses.length];
      const createdDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

      encounters.push({
        id: randomUUID(),
        tenant_id: tenantId,
        patient_id: patientId,
        provider_id: providerId,
        status,
        chief_complaint: [
          "Acne vulgaris - follow-up",
          "New rash on arms",
          "Mole evaluation",
          "Psoriasis flare",
          "Eczema management",
          "Skin cancer screening",
          "Wart removal",
          "Rosacea treatment",
        ][i % 8],
        hpi: "Patient presents for evaluation...",
        ros: "Constitutional: Negative. Skin: As noted in chief complaint.",
        exam: "Skin examination performed...",
        assessment_plan: "Continue current treatment plan...",
      });
    }

    for (const enc of encounters) {
      await pool.query(
        `INSERT INTO encounters(id, tenant_id, patient_id, provider_id, status, chief_complaint, hpi, ros, exam, assessment_plan)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          enc.id,
          enc.tenant_id,
          enc.patient_id,
          enc.provider_id,
          enc.status,
          enc.chief_complaint,
          enc.hpi,
          enc.ros,
          enc.exam,
          enc.assessment_plan,
        ]
      );
    }
    console.log(`✅ Created ${encounters.length} clinical notes\n`);

    // 8. PRESCRIPTIONS
    console.log("Creating prescriptions...");
    const prescriptions = [];

    const rxMedications = [
      "Tretinoin 0.025% Cream",
      "Doxycycline 100mg",
      "Clobetasol 0.05% Ointment",
      "Tacrolimus 0.1% Ointment",
      "Metronidazole 0.75% Gel",
      "Hydroxyzine 25mg",
      "Triamcinolone 0.1% Cream",
      "Benzoyl Peroxide 5% Gel",
    ];

    for (let i = 0; i < 15; i++) {
      const medication = rxMedications[i % rxMedications.length];

      prescriptions.push({
        id: randomUUID(),
        tenant_id: tenantId,
        patient_id: patientIds[i % patientIds.length],
        provider_id: userProviders[i % userProviders.length],
        medication_name: medication,
      });
    }

    for (const rx of prescriptions) {
      await pool.query(
        `INSERT INTO prescriptions(id, tenant_id, patient_id, provider_id, medication_name)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO NOTHING`,
        [
          rx.id,
          rx.tenant_id,
          rx.patient_id,
          rx.provider_id,
          rx.medication_name,
        ]
      );
    }
    console.log(`✅ Created ${prescriptions.length} prescriptions\n`);

    // 9. QUALITY MEASURES - Skipping (complex schema requiring measure definitions)
    console.log("⚠️  Skipping quality measures - requires measure definitions first\n");

    await pool.query("COMMIT");
    console.log("\n🎉 All test data created successfully!");
    console.log("\nSummary:");
    console.log(`  ✅ ${appointments.length} appointments`);
    console.log(`  ✅ ${timeBlocks.length} time blocks`);
    console.log(`  ✅ ${waitlistEntries.length} waitlist entries`);
    console.log(`  ✅ ${priorAuthRequests.length} prior auth requests`);
    console.log(`  ⚠️  Faxes - use API: POST /api/fax/simulate-incoming`);
    console.log(`  ⚠️  Direct messages - use API endpoints`);
    console.log(`  ✅ ${encounters.length} clinical notes`);
    console.log(`  ✅ ${prescriptions.length} prescriptions`);
    console.log(`  ⚠️  Quality measures - requires measure definitions first`);
    console.log("\n📝 Additional notes:");
    console.log("  - Patients already exist from main seed (30 patients)");
    console.log("  - For faxes: Use admin account to call POST /api/fax/simulate-incoming");
    console.log("  - For Direct messages: Use the Direct messaging UI to send test messages");

  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

seedTestData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
