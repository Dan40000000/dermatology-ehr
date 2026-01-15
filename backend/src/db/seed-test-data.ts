import { pool } from "./pool";

/**
 * Comprehensive test data seeder
 * Creates appointments, orders, pathology, prescriptions, tasks, and more
 */

async function seedTestData() {
  const tenantId = "tenant-demo";

  console.log("🌱 Starting comprehensive test data seed...\n");

  try {
    // Get existing patients
    const patientsResult = await pool.query(
      `SELECT id, first_name, last_name FROM patients WHERE tenant_id = $1 LIMIT 10`,
      [tenantId]
    );
    const patients = patientsResult.rows;
    console.log(`Found ${patients.length} patients to work with`);

    if (patients.length === 0) {
      console.log("No patients found - please run the basic seed first");
      return;
    }

    // Get providers from providers table
    const providersResult = await pool.query(
      `SELECT id FROM providers WHERE tenant_id = $1 LIMIT 5`,
      [tenantId]
    );
    const providers = providersResult.rows;
    console.log(`Found ${providers.length} providers`);

    // Also get user ID for tasks/messages (assigned_to references users)
    const usersResult = await pool.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND role IN ('provider', 'admin') LIMIT 1`,
      [tenantId]
    );
    const userId = usersResult.rows[0]?.id || "u-admin";

    const providerId = providers[0]?.id;

    // Get location
    const locationResult = await pool.query(
      `SELECT id FROM locations WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    const locationId = locationResult.rows[0]?.id;

    // Get appointment type
    const apptTypeResult = await pool.query(
      `SELECT id FROM appointment_types WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    const appointmentTypeId = apptTypeResult.rows[0]?.id;

    // ============================================
    // 1. CREATE APPOINTMENTS (past, today, future)
    // ============================================
    console.log("\n📅 Creating appointments...");

    const appointmentStatuses = ["scheduled", "checked_in", "in_progress", "completed", "cancelled", "no_show"];

    if (locationId && appointmentTypeId && providerId) {
      for (let dayOffset = -14; dayOffset <= 14; dayOffset++) {
        const date = new Date();
        date.setDate(date.getDate() + dayOffset);

        const apptCount = Math.floor(Math.random() * 5) + 4;

        for (let i = 0; i < apptCount; i++) {
          const patient = patients[Math.floor(Math.random() * patients.length)]!;
          const hour = 8 + Math.floor(i * 1.5);
          const scheduledStart = new Date(date);
          scheduledStart.setHours(hour, Math.random() > 0.5 ? 0 : 30, 0, 0);
          const scheduledEnd = new Date(scheduledStart);
          scheduledEnd.setMinutes(scheduledEnd.getMinutes() + 30);

          let status = "scheduled";
          if (dayOffset < 0) {
            status = Math.random() > 0.1 ? "completed" : (Math.random() > 0.5 ? "cancelled" : "no_show");
          } else if (dayOffset === 0 && hour < new Date().getHours()) {
            status = Math.random() > 0.3 ? "completed" : "in_progress";
          }

          await pool.query(
            `INSERT INTO appointments (id, tenant_id, patient_id, provider_id, location_id, appointment_type_id,
             scheduled_start, scheduled_end, status, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT DO NOTHING`,
            [tenantId, patient.id, providerId, locationId, appointmentTypeId,
             scheduledStart.toISOString(), scheduledEnd.toISOString(), status]
          );
        }
      }
      console.log("✅ Created appointments for 29 days");
    } else {
      console.log("⚠️ Skipping appointments - missing location, appointment type, or provider");
    }

    // ============================================
    // 2. CREATE ORDERS (general orders table)
    // ============================================
    console.log("\n🧪 Creating orders...");

    const orderTypes = ["Lab", "Imaging", "Referral", "Procedure"];
    const orderStatuses = ["pending", "in_progress", "completed", "cancelled"];

    try {
      for (const patient of patients) {
        const orderCount = Math.floor(Math.random() * 4) + 2;

        for (let i = 0; i < orderCount; i++) {
          const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)]!;
          const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)]!;
          const daysAgo = Math.floor(Math.random() * 30);
          const orderDate = new Date();
          orderDate.setDate(orderDate.getDate() - daysAgo);

          await pool.query(
            `INSERT INTO orders (id, tenant_id, patient_id, provider_id, order_type,
             status, priority, notes, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT DO NOTHING`,
            [tenantId, patient.id, userId, orderType, status,
             Math.random() > 0.8 ? "stat" : "routine",
             `${orderType} order for ${patient.first_name}`]
          );
        }
      }
      console.log("✅ Created orders");
    } catch (err: any) {
      console.log(`⚠️ Skipping orders: ${err.message}`);
    }

    // ============================================
    // 3. CREATE PATHOLOGY ORDERS
    // ============================================
    console.log("\n🔬 Creating pathology orders...");

    try {
      const pathologyTypes = [
        { name: "Shave Biopsy", site: "Left Forearm" },
        { name: "Punch Biopsy", site: "Right Shoulder" },
        { name: "Excisional Biopsy", site: "Back" },
        { name: "Shave Biopsy", site: "Face - Left Cheek" },
        { name: "Punch Biopsy", site: "Scalp" },
        { name: "Shave Biopsy", site: "Chest" },
      ];

      const pathDiagnoses = [
        "Benign intradermal nevus",
        "Seborrheic keratosis",
        "Actinic keratosis",
        "Basal cell carcinoma",
        "Squamous cell carcinoma in situ",
        "Melanoma in situ",
        "Dermatofibroma",
        "Compound nevus",
      ];

      for (const patient of patients) {
        const orderCount = Math.floor(Math.random() * 3) + 1;

        for (let i = 0; i < orderCount; i++) {
          const pathType = pathologyTypes[Math.floor(Math.random() * pathologyTypes.length)]!;
          const status = Math.random() > 0.3 ? "completed" : "pending";
          const daysAgo = Math.floor(Math.random() * 60);
          const orderDate = new Date();
          orderDate.setDate(orderDate.getDate() - daysAgo);

          const orderId = `path-${patient.id.slice(0, 8)}-${i}-${Date.now()}`;
          const diagnosis = status === "completed" ? pathDiagnoses[Math.floor(Math.random() * pathDiagnoses.length)]! : null;

          await pool.query(
            `INSERT INTO pathology_orders (id, tenant_id, patient_id, ordering_provider_id, specimen_type,
             specimen_site, clinical_history, status, diagnosis, order_date, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             ON CONFLICT (id) DO NOTHING`,
            [orderId, tenantId, patient.id, userId, pathType.name, pathType.site,
             "R/O malignancy", status, diagnosis, orderDate.toISOString().split('T')[0]]
          );
        }
      }
      console.log("✅ Created pathology orders");
    } catch (err: any) {
      console.log(`⚠️ Skipping pathology orders: ${err.message}`);
    }

    // ============================================
    // 4. CREATE PRESCRIPTIONS
    // ============================================
    console.log("\n💊 Creating prescriptions...");

    try {
      const medications = [
        { name: "Tretinoin 0.025% Cream", sig: "Apply thin layer to face at bedtime", qty: 45, unit: "grams" },
        { name: "Clobetasol 0.05% Ointment", sig: "Apply to affected areas twice daily", qty: 60, unit: "grams" },
        { name: "Doxycycline 100mg", sig: "Take 1 tablet by mouth twice daily", qty: 60, unit: "tablets" },
        { name: "Methotrexate 2.5mg", sig: "Take as directed weekly", qty: 12, unit: "tablets" },
        { name: "Ketoconazole 2% Shampoo", sig: "Use twice weekly, leave on 5 minutes", qty: 120, unit: "ml" },
        { name: "Mupirocin 2% Ointment", sig: "Apply to affected areas 3 times daily", qty: 22, unit: "grams" },
        { name: "Prednisone 10mg", sig: "Take as directed per taper", qty: 21, unit: "tablets" },
      ];

      const rxStatuses = ["pending", "sent", "transmitted", "cancelled"];

      for (const patient of patients) {
        const rxCount = Math.floor(Math.random() * 3) + 2;

        for (let i = 0; i < rxCount; i++) {
          const med = medications[Math.floor(Math.random() * medications.length)]!;
          const status = rxStatuses[Math.floor(Math.random() * rxStatuses.length)]!;

          await pool.query(
            `INSERT INTO prescriptions (id, tenant_id, patient_id, provider_id, medication_name,
             sig, quantity, quantity_unit, refills, status, created_by, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             ON CONFLICT DO NOTHING`,
            [tenantId, patient.id, providerId, med.name, med.sig, med.qty, med.unit,
             Math.floor(Math.random() * 4), status, userId]
          );
        }
      }
      console.log("✅ Created prescriptions");
    } catch (err: any) {
      console.log(`⚠️ Skipping prescriptions: ${err.message}`);
    }

    // ============================================
    // 5. CREATE TASKS
    // ============================================
    console.log("\n✅ Creating tasks...");

    try {
      const taskTitles = [
        "Call patient with results",
        "Prior auth needed",
        "Refill request",
        "Schedule follow-up",
        "Review pathology report",
        "Patient message - respond",
        "Insurance verification",
        "Referral to send",
      ];

      const taskStatuses = ["open", "open", "in_progress", "completed"];

      for (let i = 0; i < 30; i++) {
        const patient = patients[Math.floor(Math.random() * patients.length)]!;
        const taskTitle = taskTitles[Math.floor(Math.random() * taskTitles.length)]!;
        const status = taskStatuses[Math.floor(Math.random() * taskStatuses.length)]!;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) - 7);

        await pool.query(
          `INSERT INTO tasks (id, tenant_id, patient_id, assigned_to, title, status, due_at, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT DO NOTHING`,
          [tenantId, patient.id, userId, taskTitle, status, dueDate.toISOString()]
        );
      }
      console.log("✅ Created 30 tasks");
    } catch (err: any) {
      console.log(`⚠️ Skipping tasks: ${err.message}`);
    }

    // ============================================
    // 6. CREATE ENCOUNTERS/NOTES
    // ============================================
    console.log("\n📝 Creating encounters and notes...");

    try {
      const chiefComplaints = [
        "Skin rash x 2 weeks",
        "Suspicious mole on back",
        "Acne not improving",
        "Annual skin exam",
        "Eczema flare",
        "Psoriasis follow-up",
        "Hair loss concern",
        "Nail changes",
      ];

      const hpiOptions = [
        "Patient presents with a rash on the arm that started 2 weeks ago",
        "Patient noticed a changing mole on their back over the past month",
        "Acne has not improved with current treatment over 3 months",
        "Returning for annual skin check",
        "Eczema has flared up despite moisturizing routine",
        "Follow-up for psoriasis management",
        "Concerned about increased hair shedding over past 6 months",
        "Noticed nail discoloration and thickening",
      ];

      const examOptions = [
        "Erythematous patch on left forearm, no scale",
        "5mm pigmented lesion on upper back, asymmetric borders",
        "Comedones and papules on face, mild inflammation",
        "Full body skin exam performed, no concerning lesions",
        "Dry, scaly patches on bilateral antecubital fossae",
        "Well-demarcated erythematous plaques with silvery scale on elbows and knees",
        "Diffuse hair thinning, positive hair pull test",
        "Yellow discoloration and subungual debris of toenails",
      ];

      const encounterStatuses = ["draft", "signed", "signed", "signed"];

      for (const patient of patients) {
        const encounterCount = Math.floor(Math.random() * 4) + 2;

        for (let i = 0; i < encounterCount; i++) {
          const chiefComplaint = chiefComplaints[Math.floor(Math.random() * chiefComplaints.length)]!;
          const hpi = hpiOptions[Math.floor(Math.random() * hpiOptions.length)]!;
          const exam = examOptions[Math.floor(Math.random() * examOptions.length)]!;
          const status = encounterStatuses[Math.floor(Math.random() * encounterStatuses.length)]!;

          await pool.query(
            `INSERT INTO encounters (id, tenant_id, patient_id, provider_id, chief_complaint,
             hpi, exam, status, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT DO NOTHING`,
            [tenantId, patient.id, providerId || userId, chiefComplaint, hpi, exam, status]
          );
        }
      }
      console.log("✅ Created encounters");
    } catch (err: any) {
      console.log(`⚠️ Skipping encounters: ${err.message}`);
    }

    // ============================================
    // 7. CREATE DOCUMENTS
    // ============================================
    console.log("\n📄 Creating documents...");

    try {
      const documentTitles = [
        "Lab Results - CBC",
        "Pathology Report - Skin Biopsy",
        "Referral to Mohs Surgery",
        "Insurance Authorization",
        "Consent Form - Procedure",
        "Prior Authorization - Biologics",
        "Aftercare Instructions",
      ];

      const documentTypes = ["pdf", "pdf", "pdf", "image", "pdf", "pdf", "pdf"];

      for (const patient of patients) {
        const docCount = Math.floor(Math.random() * 4) + 3;

        for (let i = 0; i < docCount; i++) {
          const docIdx = Math.floor(Math.random() * documentTitles.length);
          const title = documentTitles[docIdx]!;
          const type = documentTypes[docIdx]!;

          await pool.query(
            `INSERT INTO documents (id, tenant_id, patient_id, title, type, url, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
             ON CONFLICT DO NOTHING`,
            [tenantId, patient.id, title, type, `https://example.com/docs/${patient.id}/${title.toLowerCase().replace(/ /g, '_')}.pdf`]
          );
        }
      }
      console.log("✅ Created documents");
    } catch (err: any) {
      console.log(`⚠️ Skipping documents: ${err.message}`);
    }

    // ============================================
    // 8. CREATE MESSAGES
    // ============================================
    console.log("\n💬 Creating messages...");

    try {
      const messageSubjects = [
        "Question about medication",
        "Appointment request",
        "Lab results question",
        "Refill needed",
        "Side effect concern",
        "Follow-up question",
      ];

      const senders = ["patient", "provider"];

      for (let i = 0; i < 20; i++) {
        const patient = patients[Math.floor(Math.random() * patients.length)]!;
        const subject = messageSubjects[Math.floor(Math.random() * messageSubjects.length)]!;
        const sender = senders[Math.floor(Math.random() * senders.length)]!;

        await pool.query(
          `INSERT INTO messages (id, tenant_id, patient_id, subject, body, sender, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
           ON CONFLICT DO NOTHING`,
          [tenantId, patient.id, subject,
           `Message regarding ${subject.toLowerCase()} for ${patient.first_name} ${patient.last_name}`,
           sender]
        );
      }
      console.log("✅ Created 20 messages");
    } catch (err: any) {
      console.log(`⚠️ Skipping messages: ${err.message}`);
    }

    // ============================================
    // SUMMARY
    // ============================================
    console.log("\n" + "=".repeat(50));
    console.log("🎉 TEST DATA SEEDING COMPLETE!");
    console.log("=".repeat(50));

    console.log(`\n📊 Data Summary:`);

    // Helper to safely count table rows
    async function safeCount(table: string): Promise<string> {
      try {
        const result = await pool.query(`SELECT COUNT(*) FROM ${table} WHERE tenant_id = $1`, [tenantId]);
        return result.rows[0].count;
      } catch {
        return "N/A";
      }
    }

    console.log(`   Appointments: ${await safeCount("appointments")}`);
    console.log(`   Orders: ${await safeCount("orders")}`);
    console.log(`   Pathology Orders: ${await safeCount("pathology_orders")}`);
    console.log(`   Prescriptions: ${await safeCount("prescriptions")}`);
    console.log(`   Tasks: ${await safeCount("tasks")}`);
    console.log(`   Encounters: ${await safeCount("encounters")}`);
    console.log(`   Documents: ${await safeCount("documents")}`);
    console.log(`   Messages: ${await safeCount("messages")}`);

  } catch (error) {
    console.error("❌ Error seeding data:", error);
    throw error;
  }
}

seedTestData()
  .then(() => {
    console.log("\n✅ Seeding completed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to seed:", err);
    process.exit(1);
  });
