import { pool } from "./pool";
import { randomUUID } from "crypto";

/**
 * Seed sample disease registry data for demonstration
 * Links to existing demo patients
 */
export async function seedRegistryData() {
  console.log("Seeding registry data...");

  try {
    // Get the demo tenant
    const tenantResult = await pool.query("SELECT id FROM tenants LIMIT 1");
    if (tenantResult.rows.length === 0) {
      console.log("No tenant found, skipping registry seed");
      return;
    }
    const tenantId = tenantResult.rows[0].id;

    // Get some demo patients
    const patientsResult = await pool.query(
      "SELECT id, first_name, last_name, dob, sex FROM patients WHERE tenant_id = $1 LIMIT 20",
      [tenantId]
    );

    if (patientsResult.rows.length === 0) {
      console.log("No patients found, skipping registry seed");
      return;
    }

    const patients = patientsResult.rows;
    console.log(`Found ${patients.length} patients for registry seeding`);

    // Get the first user (for created_by)
    const userResult = await pool.query(
      "SELECT id FROM users WHERE tenant_id = $1 LIMIT 1",
      [tenantId]
    );
    const userId = userResult.rows[0]?.id || null;
    if (!userId) {
      console.log("No user found, skipping registry seed");
      return;
    }

    // Seed Melanoma Registry (3-4 patients)
    console.log("Seeding melanoma registry...");
    const melanomaPatients = patients.slice(0, 4);
    for (let i = 0; i < melanomaPatients.length; i++) {
      const patient = melanomaPatients[i];
      if (!patient) continue;
      const stages = ["IA", "IB", "IIA", "IIIA"];
      const breslowDepths = [0.5, 1.2, 2.8, 3.5];
      const schedules = ["every_3_months", "every_6_months", "every_6_months", "every_3_months"];

      await pool.query(
        `INSERT INTO melanoma_registry (
          id, tenant_id, patient_id, diagnosis_date, primary_site,
          breslow_depth_mm, ajcc_stage, sentinel_node_biopsy_performed,
          sentinel_node_status, surveillance_schedule, next_scheduled_exam,
          recurrence_status, initial_staging_documented, surveillance_adherent,
          created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), now())
        ON CONFLICT (tenant_id, patient_id) DO NOTHING`,
        [
          randomUUID(),
          tenantId,
          patient.id,
          new Date(Date.now() - Math.random() * 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // Random date within last 2 years
          i === 0 ? "Back" : i === 1 ? "Right arm" : i === 2 ? "Left leg" : "Chest",
          breslowDepths[i],
          stages[i],
          true,
          i < 3 ? "negative" : "positive",
          schedules[i],
          new Date(Date.now() + (30 + i * 15) * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // Next exam in 30-75 days
          "no_recurrence",
          true,
          true,
          userId,
        ]
      );
    }

    // Seed Psoriasis Registry (5-6 patients)
    console.log("Seeding psoriasis registry...");
    const psoriasisPatients = patients.slice(4, 10);
    for (let i = 0; i < psoriasisPatients.length; i++) {
      const patient = psoriasisPatients[i];
      if (!patient) continue;
      const pasiScores = [8.5, 12.3, 18.7, 24.2, 6.1, 15.8];
      const bsaPercents = [12.0, 18.5, 25.0, 35.0, 8.0, 20.0];
      const dlqiScores = [6, 12, 18, 22, 4, 14];
      const biologics: (string | null)[] = [
        "Humira",
        "Enbrel",
        "Stelara",
        "Cosentyx",
        null,
        "Taltz",
      ];

      const pasiScore = pasiScores[i] ?? 10;
      const bsaPercent = bsaPercents[i] ?? 15;
      const dlqiScore = dlqiScores[i] ?? 10;
      const biologic = biologics[i];

      await pool.query(
        `INSERT INTO psoriasis_registry (
          id, tenant_id, patient_id, diagnosis_date, psoriasis_type,
          current_pasi_score, current_bsa_percent, current_pga_score,
          current_dlqi_score, current_itch_severity,
          current_treatment_type, biologic_name, biologic_start_date,
          next_lab_due, baseline_pasi_documented, labs_up_to_date,
          created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())
        ON CONFLICT (tenant_id, patient_id) DO NOTHING`,
        [
          randomUUID(),
          tenantId,
          patient.id,
          new Date(Date.now() - Math.random() * 365 * 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          "plaque",
          pasiScore,
          bsaPercent,
          Math.ceil(pasiScore / 6), // PGA approximation
          dlqiScore,
          Math.ceil(pasiScore / 3), // Itch approximation
          biologic ? "biologic" : "topical",
          biologic,
          biologic
            ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : null,
          biologics[i]
            ? new Date(Date.now() + (60 + i * 30) * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : null,
          true,
          true,
          userId,
        ]
      );

      // Add PASI history for each patient (3-5 historical scores)
      const numHistoryPoints = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < numHistoryPoints; j++) {
        const monthsAgo = (j + 1) * 3; // Every 3 months
        const historicalPasi = pasiScore + (Math.random() - 0.5) * 10;
        const historicalBsa = bsaPercent + (Math.random() - 0.5) * 15;

        await pool.query(
          `INSERT INTO pasi_score_history (
            id, tenant_id, patient_id, assessment_date,
            pasi_score, bsa_percent, pga_score, dlqi_score, itch_severity,
            assessed_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
          ON CONFLICT (tenant_id, patient_id, assessment_date) DO NOTHING`,
          [
            randomUUID(),
            tenantId,
            patient.id,
            new Date(Date.now() - monthsAgo * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            Math.max(0, historicalPasi),
            Math.max(0, historicalBsa),
            Math.ceil(Math.max(0, historicalPasi) / 6),
            dlqiScore + Math.floor((Math.random() - 0.5) * 6),
            Math.ceil(Math.max(0, historicalPasi) / 3),
            userId,
          ]
        );
      }
    }

    // Seed Acne/Isotretinoin Registry (2-3 patients, females for iPLEDGE tracking)
    console.log("Seeding acne/isotretinoin registry...");
    const acnePatients = patients.filter((p) => p.sex === "F").slice(0, 3);
    for (let i = 0; i < acnePatients.length; i++) {
      const patient = acnePatients[i];
      if (!patient) continue;

      await pool.query(
        `INSERT INTO acne_registry (
          id, tenant_id, patient_id, diagnosis_date, acne_type, severity,
          on_isotretinoin, isotretinoin_start_date, ipledge_enrolled, ipledge_id,
          pregnancy_category, two_forms_contraception,
          last_pregnancy_test_date, next_pregnancy_test_due,
          last_ipledge_quiz_date, next_ipledge_quiz_due,
          last_lab_date, next_lab_due,
          baseline_lipids_done, baseline_lft_done,
          cumulative_dose_mg, target_cumulative_dose_mg,
          treatment_response, monthly_monitoring_adherent,
          created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, now(), now())
        ON CONFLICT (tenant_id, patient_id) DO NOTHING`,
        [
          randomUUID(),
          tenantId,
          patient.id,
          new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          "nodulocystic",
          "severe",
          true,
          new Date(Date.now() - (60 + i * 30) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          true,
          `IPLEDGE${10000 + i * 1111}`,
          "can_get_pregnant",
          true,
          new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() + (15 + i * 5) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() + (10 + i * 5) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() + (5 + i * 10) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          true,
          true,
          3600 + i * 800,
          8000 + i * 1000,
          i === 0 ? "excellent" : i === 1 ? "good" : "fair",
          true,
          userId,
        ]
      );
    }

    // Seed Chronic Therapy Registry (4-5 patients on biologics/methotrexate)
    console.log("Seeding chronic therapy registry...");
    const chronicTherapyPatients = patients.slice(10, 15).filter(p => p !== undefined);
    const medications = [
      { name: "Methotrexate", class: "methotrexate", diagnosis: "psoriasis", dose: "15mg weekly", frequency: "monthly" },
      { name: "Humira", class: "biologic", diagnosis: "psoriasis", dose: "40mg every 2 weeks", frequency: "every_3_months" },
      { name: "Dupixent", class: "biologic", diagnosis: "atopic_dermatitis", dose: "300mg every 2 weeks", frequency: "every_3_months" },
      { name: "Cyclosporine", class: "cyclosporine", diagnosis: "psoriasis", dose: "3mg/kg/day", frequency: "monthly" },
      { name: "Stelara", class: "biologic", diagnosis: "psoriasis", dose: "45mg every 12 weeks", frequency: "every_6_months" },
    ];

    for (let i = 0; i < Math.min(chronicTherapyPatients.length, medications.length); i++) {
      const patient = chronicTherapyPatients[i];
      const med = medications[i];
      if (!patient || !med) continue;

      const labFrequencyDays = med.frequency === "monthly" ? 30 : med.frequency === "every_3_months" ? 90 : 180;

      await pool.query(
        `INSERT INTO chronic_therapy_registry (
          id, tenant_id, patient_id, primary_diagnosis,
          medication_name, medication_class, start_date,
          current_dose, dosing_frequency,
          monitoring_protocol, lab_frequency,
          last_lab_date, next_lab_due,
          last_cbc_date, last_lft_date, last_creatinine_date,
          last_tb_screening, hepatitis_b_status, hepatitis_c_status,
          labs_up_to_date, screening_up_to_date,
          created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, now(), now())
        ON CONFLICT (tenant_id, patient_id, medication_name, start_date) DO NOTHING`,
        [
          randomUUID(),
          tenantId,
          patient.id,
          med.diagnosis,
          med.name,
          med.class,
          new Date(Date.now() - Math.random() * 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          med.dose,
          med.frequency,
          `${med.class}_protocol`,
          med.frequency,
          new Date(Date.now() - (labFrequencyDays - 15 + i * 5) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() + (15 - i * 3) * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // Some overdue
          new Date(Date.now() - (labFrequencyDays - 15 + i * 5) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() - (labFrequencyDays - 15 + i * 5) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() - (labFrequencyDays - 15 + i * 5) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          "negative",
          "negative",
          i < 3, // First 3 are up to date
          true,
          userId,
        ]
      );
    }

    // Add registry members to cohorts
    console.log("Adding patients to registry cohorts...");

    const melanomaCohort = await pool.query(
      "SELECT id FROM registry_cohorts WHERE tenant_id = $1 AND registry_type = 'melanoma' LIMIT 1",
      [tenantId]
    );

    const psoriasisCohort = await pool.query(
      "SELECT id FROM registry_cohorts WHERE tenant_id = $1 AND registry_type = 'psoriasis' LIMIT 1",
      [tenantId]
    );

    const acneCohort = await pool.query(
      "SELECT id FROM registry_cohorts WHERE tenant_id = $1 AND registry_type = 'acne' LIMIT 1",
      [tenantId]
    );

    const chronicTherapyCohort = await pool.query(
      "SELECT id FROM registry_cohorts WHERE tenant_id = $1 AND registry_type = 'chronic_therapy' LIMIT 1",
      [tenantId]
    );

    // Add melanoma patients to cohort
    if (melanomaCohort.rows.length > 0) {
      for (const patient of melanomaPatients) {
        await pool.query(
          `INSERT INTO registry_members (
            id, tenant_id, registry_id, patient_id, status,
            enrollment_date, disease_severity, added_by, added_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
          ON CONFLICT (tenant_id, registry_id, patient_id) DO NOTHING`,
          [
            randomUUID(),
            tenantId,
            melanomaCohort.rows[0].id,
            patient.id,
            "active",
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            "moderate",
            userId,
          ]
        );
      }
    }

    // Add psoriasis patients to cohort
    if (psoriasisCohort.rows.length > 0) {
      for (const patient of psoriasisPatients) {
        await pool.query(
          `INSERT INTO registry_members (
            id, tenant_id, registry_id, patient_id, status,
            enrollment_date, disease_severity, added_by, added_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
          ON CONFLICT (tenant_id, registry_id, patient_id) DO NOTHING`,
          [
            randomUUID(),
            tenantId,
            psoriasisCohort.rows[0].id,
            patient.id,
            "active",
            new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            "moderate",
            userId,
          ]
        );
      }
    }

    // Add acne patients to cohort
    if (acneCohort.rows.length > 0) {
      for (const patient of acnePatients) {
        await pool.query(
          `INSERT INTO registry_members (
            id, tenant_id, registry_id, patient_id, status,
            enrollment_date, disease_severity, added_by, added_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
          ON CONFLICT (tenant_id, registry_id, patient_id) DO NOTHING`,
          [
            randomUUID(),
            tenantId,
            acneCohort.rows[0].id,
            patient.id,
            "active",
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            "severe",
            userId,
          ]
        );
      }
    }

    // Add chronic therapy patients to cohort
    if (chronicTherapyCohort.rows.length > 0) {
      for (const patient of chronicTherapyPatients) {
        await pool.query(
          `INSERT INTO registry_members (
            id, tenant_id, registry_id, patient_id, status,
            enrollment_date, treatment_status, added_by, added_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
          ON CONFLICT (tenant_id, registry_id, patient_id) DO NOTHING`,
          [
            randomUUID(),
            tenantId,
            chronicTherapyCohort.rows[0].id,
            patient.id,
            "active",
            new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
            "ongoing",
            userId,
          ]
        );
      }
    }

    console.log("Registry data seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding registry data:", error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedRegistryData()
    .then(() => {
      console.log("Seed completed");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed", err);
      process.exit(1);
    });
}
