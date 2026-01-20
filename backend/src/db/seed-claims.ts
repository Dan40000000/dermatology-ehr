import { randomUUID } from "crypto";
import { pool } from "./pool";

/**
 * Seed realistic claims data for dermatology practice
 * Links claims to existing patients, appointments, and fee schedules
 */
async function seedClaims() {
  await pool.query("begin");
  try {
    const tenantId = "tenant-demo";

    // Get existing patients
    const patientsResult = await pool.query(
      `select id, first_name, last_name, insurance from patients where tenant_id = $1 limit 10`,
      [tenantId]
    );
    const patients = patientsResult.rows;

    if (patients.length === 0) {
      console.log("No patients found. Run seed.ts first.");
      await pool.query("rollback");
      return;
    }

    // Get or create fee schedule
    let feeScheduleId: string;
    const feeScheduleResult = await pool.query(
      `select id from fee_schedules where tenant_id = $1 and is_default = true limit 1`,
      [tenantId]
    );

    if (feeScheduleResult.rows.length > 0) {
      feeScheduleId = feeScheduleResult.rows[0].id;
    } else {
      feeScheduleId = randomUUID();
      await pool.query(
        `insert into fee_schedules (id, tenant_id, name, is_default)
         values ($1, $2, 'Default Medical Derm', true)`,
        [feeScheduleId, tenantId]
      );

      // Add common CPT codes to fee schedule
      const feeItems = [
        { cpt: '99213', desc: 'Office visit, established patient, moderate complexity', fee: 13500, category: 'E/M' },
        { cpt: '99214', desc: 'Office visit, established patient, high complexity', fee: 18500, category: 'E/M' },
        { cpt: '99203', desc: 'Office visit, new patient, moderate complexity', fee: 15500, category: 'E/M' },
        { cpt: '99204', desc: 'Office visit, new patient, high complexity', fee: 23000, category: 'E/M' },
        { cpt: '11100', desc: 'Biopsy of skin, single lesion', fee: 14000, category: 'Biopsy' },
        { cpt: '11101', desc: 'Biopsy of skin, each additional lesion', fee: 7500, category: 'Biopsy' },
        { cpt: '17000', desc: 'Destruction, premalignant lesion, first', fee: 12500, category: 'Destruction' },
        { cpt: '17003', desc: 'Destruction, premalignant lesion, 2-14', fee: 3500, category: 'Destruction' },
        { cpt: '17110', desc: 'Destruction of benign lesions, up to 14', fee: 15000, category: 'Destruction' },
        { cpt: '11400', desc: 'Excision, benign lesion, trunk/arms/legs, 0.5cm or less', fee: 18500, category: 'Excision' },
        { cpt: '11401', desc: 'Excision, benign lesion, trunk/arms/legs, 0.6-1.0cm', fee: 22000, category: 'Excision' },
        { cpt: '11600', desc: 'Excision, malignant lesion, trunk/arms/legs, 0.5cm or less', fee: 24000, category: 'Excision' },
        { cpt: '11601', desc: 'Excision, malignant lesion, trunk/arms/legs, 0.6-1.0cm', fee: 28500, category: 'Excision' },
        { cpt: '12001', desc: 'Simple repair, face/ears/eyelids/nose/lips/mucous membranes, 2.5cm or less', fee: 16500, category: 'Repair' },
        { cpt: '12032', desc: 'Intermediate repair, scalp/axillae/trunk/extremities, 2.6-7.5cm', fee: 27500, category: 'Repair' },
        { cpt: '96372', desc: 'Therapeutic injection, subcutaneous or intramuscular', fee: 4500, category: 'Injection' },
        { cpt: 'J3301', desc: 'Kenalog injection, per 10mg', fee: 2500, category: 'Drug' },
      ];

      for (const item of feeItems) {
        await pool.query(
          `insert into fee_schedule_items (id, fee_schedule_id, cpt_code, cpt_description, category, fee_cents)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (fee_schedule_id, cpt_code) do nothing`,
          [randomUUID(), feeScheduleId, item.cpt, item.desc, item.category, item.fee]
        );
      }
    }

    // Define realistic claim scenarios for dermatology
    const claimScenarios = [
      {
        patient: patients[0],
        serviceDate: '2026-01-10',
        status: 'paid',
        payer: 'United Healthcare',
        payerId: 'UHC001',
        scrubStatus: 'clean',
        diagnoses: [
          { code: 'L40.0', desc: 'Psoriasis vulgaris', isPrimary: true },
        ],
        charges: [
          { cpt: '99214', desc: 'Office visit, high complexity', qty: 1, fee: 18500, modifiers: [], dx: ['L40.0'] },
          { cpt: 'J3301', desc: 'Kenalog injection, 40mg', qty: 4, fee: 2500, modifiers: [], dx: ['L40.0'] },
          { cpt: '96372', desc: 'Therapeutic injection', qty: 1, fee: 4500, modifiers: [], dx: ['L40.0'] },
        ],
        payments: [
          { amount: 28500, date: '2026-01-25', method: 'EFT', payer: 'United Healthcare', checkNumber: 'EFT987654' },
        ],
      },
      {
        patient: patients[1],
        serviceDate: '2026-01-12',
        status: 'submitted',
        payer: 'Kaiser Permanente',
        payerId: 'KAISER001',
        scrubStatus: 'clean',
        diagnoses: [
          { code: 'C44.91', desc: 'Basal cell carcinoma of skin, unspecified', isPrimary: true },
        ],
        charges: [
          { cpt: '99213', desc: 'Office visit, moderate complexity', qty: 1, fee: 13500, modifiers: ['25'], dx: ['C44.91'] },
          { cpt: '11100', desc: 'Biopsy of skin, single lesion', qty: 1, fee: 14000, modifiers: [], dx: ['C44.91'] },
        ],
        payments: [],
      },
      {
        patient: patients[2],
        serviceDate: '2026-01-14',
        status: 'paid',
        payer: 'Cigna',
        payerId: 'CIGNA001',
        scrubStatus: 'clean',
        diagnoses: [
          { code: 'L20.9', desc: 'Atopic dermatitis, unspecified', isPrimary: true },
        ],
        charges: [
          { cpt: '99213', desc: 'Office visit, moderate complexity', qty: 1, fee: 13500, modifiers: [], dx: ['L20.9'] },
        ],
        payments: [
          { amount: 13500, date: '2026-01-28', method: 'EFT', payer: 'Cigna', checkNumber: 'EFT456789' },
        ],
      },
      {
        patient: patients[3],
        serviceDate: '2026-01-08',
        status: 'denied',
        payer: 'Medicare',
        payerId: 'MEDICARE',
        scrubStatus: 'clean',
        denialReason: 'Service deemed cosmetic/not medically necessary',
        denialCode: 'COSMETIC',
        denialDate: '2026-01-22',
        denialCategory: 'cosmetic_vs_medical',
        diagnoses: [
          { code: 'L82.1', desc: 'Other seborrheic keratosis', isPrimary: true },
        ],
        charges: [
          { cpt: '99213', desc: 'Office visit, moderate complexity', qty: 1, fee: 13500, modifiers: ['25'], dx: ['L82.1'] },
          { cpt: '17110', desc: 'Destruction of benign lesions, 7 lesions', qty: 1, fee: 15000, modifiers: [], dx: ['L82.1'] },
        ],
        payments: [],
      },
      {
        patient: patients[4],
        serviceDate: '2026-01-15',
        status: 'paid',
        payer: 'Anthem Blue Cross',
        payerId: 'ANTHEM001',
        scrubStatus: 'clean',
        diagnoses: [
          { code: 'L70.0', desc: 'Acne vulgaris', isPrimary: true },
        ],
        charges: [
          { cpt: '99214', desc: 'Office visit, high complexity', qty: 1, fee: 18500, modifiers: [], dx: ['L70.0'] },
        ],
        payments: [
          { amount: 16500, date: '2026-01-30', method: 'EFT', payer: 'Anthem Blue Cross', checkNumber: 'EFT123456' },
        ],
      },
      {
        patient: patients[5],
        serviceDate: '2026-01-16',
        status: 'pending',
        payer: 'UnitedHealthcare',
        payerId: 'UHC001',
        scrubStatus: 'warnings',
        diagnoses: [
          { code: 'L70.0', desc: 'Acne vulgaris', isPrimary: true },
        ],
        charges: [
          { cpt: '99203', desc: 'Office visit, new patient, moderate', qty: 1, fee: 15500, modifiers: [], dx: ['L70.0'] },
        ],
        payments: [],
      },
      {
        patient: patients[6],
        serviceDate: '2026-01-09',
        status: 'paid',
        payer: 'UnitedHealthcare',
        payerId: 'UHC001',
        scrubStatus: 'clean',
        diagnoses: [
          { code: 'L57.0', desc: 'Actinic keratosis', isPrimary: true },
          { code: 'D22.9', desc: 'Melanocytic nevi, unspecified', isPrimary: false },
        ],
        charges: [
          { cpt: '99213', desc: 'Office visit, moderate complexity', qty: 1, fee: 13500, modifiers: ['25'], dx: ['L57.0', 'D22.9'] },
          { cpt: '17000', desc: 'Destruction, premalignant lesion, first', qty: 1, fee: 12500, modifiers: [], dx: ['L57.0'] },
          { cpt: '17003', desc: 'Destruction, premalignant lesion, 2-14', qty: 5, fee: 3500, modifiers: [], dx: ['L57.0'] },
          { cpt: '11100', desc: 'Biopsy of skin, single lesion', qty: 1, fee: 14000, modifiers: [], dx: ['D22.9'] },
          { cpt: '11101', desc: 'Biopsy of skin, additional lesion', qty: 1, fee: 7500, modifiers: ['59'], dx: ['D22.9'] },
        ],
        payments: [
          { amount: 51000, date: '2026-01-24', method: 'EFT', payer: 'UnitedHealthcare', checkNumber: 'EFT789012' },
        ],
      },
      {
        patient: patients[7],
        serviceDate: '2026-01-11',
        status: 'submitted',
        payer: 'Medicare',
        payerId: 'MEDICARE',
        scrubStatus: 'clean',
        diagnoses: [
          { code: 'C44.91', desc: 'Basal cell carcinoma of skin, unspecified', isPrimary: true },
        ],
        charges: [
          { cpt: '99214', desc: 'Office visit, high complexity', qty: 1, fee: 18500, modifiers: ['25'], dx: ['C44.91'] },
          { cpt: '11600', desc: 'Excision, malignant lesion, 0.5cm or less', qty: 1, fee: 24000, modifiers: [], dx: ['C44.91'] },
          { cpt: '12001', desc: 'Simple repair, 2.5cm or less', qty: 1, fee: 16500, modifiers: [], dx: ['C44.91'] },
        ],
        payments: [],
      },
      {
        patient: patients[8],
        serviceDate: '2026-01-13',
        status: 'draft',
        payer: 'Medicare',
        payerId: 'MEDICARE',
        scrubStatus: null,
        diagnoses: [
          { code: 'B02.9', desc: 'Zoster without complications', isPrimary: true },
        ],
        charges: [
          { cpt: '99213', desc: 'Office visit, moderate complexity', qty: 1, fee: 13500, modifiers: [], dx: ['B02.9'] },
        ],
        payments: [],
      },
      {
        patient: patients[0],
        serviceDate: '2025-12-15',
        status: 'paid',
        payer: 'United Healthcare',
        payerId: 'UHC001',
        scrubStatus: 'clean',
        diagnoses: [
          { code: 'B35.3', desc: 'Tinea pedis', isPrimary: true },
        ],
        charges: [
          { cpt: '99213', desc: 'Office visit, moderate complexity', qty: 1, fee: 13500, modifiers: [], dx: ['B35.3'] },
        ],
        payments: [
          { amount: 13500, date: '2025-12-29', method: 'EFT', payer: 'United Healthcare', checkNumber: 'EFT654321' },
        ],
      },
    ];

    console.log(`Creating ${claimScenarios.length} claims...`);

    for (let i = 0; i < claimScenarios.length; i++) {
      const scenario = claimScenarios[i];
      const claimId = randomUUID();
      const claimNumber = `CLM-${new Date(scenario.serviceDate).getTime()}-${claimId.substring(0, 8).toUpperCase()}`;

      const totalCharges = scenario.charges.reduce((sum, c) => sum + (c.fee * c.qty), 0) / 100;

      // Create claim
      await pool.query(
        `insert into claims (
          id, tenant_id, patient_id, claim_number, status,
          service_date, total_charges, payer, payer_id, payer_name,
          scrub_status, denial_reason, denial_code, denial_date, denial_category,
          created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          claimId,
          tenantId,
          scenario.patient.id,
          claimNumber,
          scenario.status,
          scenario.serviceDate,
          totalCharges,
          scenario.payer,
          scenario.payerId,
          scenario.payer,
          scenario.scrubStatus,
          scenario.denialReason || null,
          scenario.denialCode || null,
          scenario.denialDate || null,
          scenario.denialCategory || null,
          new Date(scenario.serviceDate),
        ]
      );

      // Create initial status history
      await pool.query(
        `insert into claim_status_history (id, tenant_id, claim_id, status, changed_at)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), tenantId, claimId, 'draft', new Date(scenario.serviceDate)]
      );

      if (scenario.status !== 'draft') {
        await pool.query(
          `insert into claim_status_history (id, tenant_id, claim_id, status, changed_at)
           values ($1, $2, $3, $4, $5)`,
          [randomUUID(), tenantId, claimId, scenario.status, new Date(scenario.serviceDate + 'T10:00:00')]
        );
      }

      // Create diagnoses
      for (let j = 0; j < scenario.diagnoses.length; j++) {
        const dx = scenario.diagnoses[j];
        await pool.query(
          `insert into claim_diagnoses (
            id, tenant_id, claim_id, icd10_code, description, is_primary, sequence_number
          ) values ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), tenantId, claimId, dx.code, dx.desc, dx.isPrimary, j + 1]
        );
      }

      // Create charges
      for (let j = 0; j < scenario.charges.length; j++) {
        const charge = scenario.charges[j];
        await pool.query(
          `insert into claim_charges (
            id, tenant_id, claim_id, cpt_code, description, modifiers, quantity,
            fee_cents, fee_schedule_id, sequence_number
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            randomUUID(),
            tenantId,
            claimId,
            charge.cpt,
            charge.desc,
            charge.modifiers,
            charge.qty,
            charge.fee,
            feeScheduleId,
            j + 1,
          ]
        );
      }

      // Create payments
      for (const payment of scenario.payments) {
        await pool.query(
          `insert into claim_payments (
            id, tenant_id, claim_id, amount_cents, payment_date,
            payment_method, payer, check_number
          ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            tenantId,
            claimId,
            payment.amount,
            payment.date,
            payment.method,
            payment.payer,
            payment.checkNumber,
          ]
        );
      }

      console.log(`  ✓ Created claim ${i + 1}/${claimScenarios.length}: ${claimNumber} for ${scenario.patient.first_name} ${scenario.patient.last_name}`);
    }

    await pool.query("commit");
    console.log(`\n✅ Successfully seeded ${claimScenarios.length} claims with diagnoses, charges, and payments`);
  } catch (err) {
    await pool.query("rollback");
    console.error("❌ Error seeding claims:", err);
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  seedClaims()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default seedClaims;
