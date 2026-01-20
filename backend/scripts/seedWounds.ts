// @ts-nocheck
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://derm_user:derm_pass@localhost:5432/derm_db'
});

async function seedWounds() {
  const tenantId = 'tenant-demo';

  try {
    console.log('Starting wound tracking seed...\n');

    // Get a patient to associate wounds with (using first patient found)
    const patientResult = await pool.query(
      `SELECT id, first_name, last_name FROM patients
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId]
    );

    if (patientResult.rows.length === 0) {
      console.error('No patients found in tenant-demo. Please seed patients first.');
      await pool.end();
      return;
    }

    const patient = patientResult.rows[0];
    console.log(`Found patient: ${patient.first_name} ${patient.last_name} (ID: ${patient.id})\n`);

    // Get a provider user for created_by field
    const providerResult = await pool.query(
      `SELECT id FROM users
       WHERE tenant_id = $1 AND role = 'provider'
       LIMIT 1`,
      [tenantId]
    );

    const providerId = providerResult.rows.length > 0 ? providerResult.rows[0].id : null;

    // ==================================================================
    // WOUND 1: Post-Mohs Surgery Defect (Healing Well)
    // ==================================================================
    const mohs_wound_id = randomUUID();
    const mohs_onset = new Date();
    mohs_onset.setDate(mohs_onset.getDate() - 14); // 2 weeks ago

    await pool.query(
      `INSERT INTO wounds (
        id, tenant_id, patient_id, wound_type, etiology,
        body_region, laterality, length_cm, width_cm, depth_cm, area_cm2,
        wound_bed, wound_bed_percentage, exudate_amount, exudate_type,
        periwound_skin, undermining_present, tunneling_present,
        infection_signs, pain_level, odor_present,
        current_dressing, dressing_change_frequency,
        debridement_needed, status, onset_date,
        notes, treatment_plan, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
      )`,
      [
        mohs_wound_id,
        tenantId,
        patient.id,
        'surgical',
        'Post-Mohs micrographic surgery for basal cell carcinoma',
        'nose', // body_region
        'right', // laterality
        2.5, // length_cm
        1.8, // width_cm
        0.3, // depth_cm
        4.5, // area_cm2
        'granulation', // wound_bed
        JSON.stringify({ granulation: 85, epithelializing: 15 }),
        'scant', // exudate_amount
        'serous', // exudate_type
        'healthy', // periwound_skin
        false, // undermining_present
        false, // tunneling_present
        false, // infection_signs
        2, // pain_level (0-10)
        false, // odor_present
        'Petrolatum gauze with non-adherent dressing', // current_dressing
        'daily', // dressing_change_frequency
        false, // debridement_needed
        'healing', // status
        mohs_onset.toISOString().split('T')[0], // onset_date
        'Post-Mohs defect on right nasal ala. Patient tolerating wound care well. Healing by secondary intention.',
        'Continue daily dressing changes with petrolatum gauze. Patient performing self-care. Follow-up in 1 week.',
        providerId,
      ]
    );

    console.log(`✓ Created post-Mohs surgical wound (ID: ${mohs_wound_id})`);

    // Add 3 assessments for the Mohs wound showing healing progression
    const assessmentDates = [
      new Date(mohs_onset.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week after onset
      new Date(mohs_onset.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days after
      new Date(mohs_onset.getTime() + 14 * 24 * 60 * 60 * 1000), // 2 weeks after
    ];

    const mohsAssessments = [
      {
        length: 2.3, width: 1.7, area: 3.9, granulation: 75, epi: 25, healing: 'improving', healingPercent: 30,
        notes: 'Wound showing good granulation. Edges beginning to epithelialize. No signs of infection.'
      },
      {
        length: 2.0, width: 1.5, area: 3.0, granulation: 65, epi: 35, healing: 'improving', healingPercent: 50,
        notes: 'Continued improvement. Healthy pink granulation tissue. Periwound skin intact.'
      },
      {
        length: 1.7, width: 1.2, area: 2.0, granulation: 50, epi: 50, healing: 'improving', healingPercent: 65,
        notes: 'Excellent healing progression. Wound contracting nicely. Patient continues home dressing changes.'
      },
    ];

    for (let i = 0; i < mohsAssessments.length; i++) {
      const assessment = mohsAssessments[i];
      await pool.query(
        `INSERT INTO wound_assessments (
          id, tenant_id, wound_id, patient_id, assessment_date, assessed_by,
          length_cm, width_cm, area_cm2, wound_bed_percentage, wound_bed,
          exudate_amount, exudate_type, periwound_skin,
          infection_signs, pain_level, odor_present,
          treatment_applied, dressing_applied, cleaning_solution,
          healing_trend, healing_percentage, provider_notes,
          next_assessment_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )`,
        [
          randomUUID(),
          tenantId,
          mohs_wound_id,
          patient.id,
          assessmentDates[i].toISOString(),
          providerId,
          assessment.length,
          assessment.width,
          assessment.area,
          JSON.stringify({ granulation: assessment.granulation, epithelializing: assessment.epi }),
          'mixed',
          'scant',
          'serous',
          'healthy',
          false, // infection_signs
          1 + i, // pain_level decreasing
          false,
          'Dressing change, wound cleaning',
          'Petrolatum gauze with non-adherent dressing',
          'Normal saline',
          assessment.healing,
          assessment.healingPercent,
          assessment.notes,
          new Date(assessmentDates[i].getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days later
        ]
      );
    }

    console.log(`  ✓ Added ${mohsAssessments.length} healing assessments\n`);

    // ==================================================================
    // WOUND 2: Chronic Venous Leg Ulcer (Stalled)
    // ==================================================================
    const venous_wound_id = randomUUID();
    const venous_onset = new Date();
    venous_onset.setDate(venous_onset.getDate() - 90); // 3 months ago (chronic)

    await pool.query(
      `INSERT INTO wounds (
        id, tenant_id, patient_id, wound_type, etiology,
        body_region, laterality, length_cm, width_cm, depth_cm, area_cm2,
        wound_bed, wound_bed_percentage, exudate_amount, exudate_type,
        periwound_skin, undermining_present, tunneling_present,
        infection_signs, infection_notes, pain_level, odor_present,
        current_dressing, dressing_change_frequency,
        debridement_needed, status, onset_date,
        notes, treatment_plan, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
      )`,
      [
        venous_wound_id,
        tenantId,
        patient.id,
        'ulcer',
        'Chronic venous insufficiency',
        'lower leg', // body_region
        'left', // laterality
        5.5, // length_cm
        4.2, // width_cm
        0.8, // depth_cm
        23.1, // area_cm2
        'mixed', // wound_bed
        JSON.stringify({ granulation: 40, slough: 45, epithelializing: 15 }),
        'moderate', // exudate_amount
        'serosanguineous', // exudate_type
        'macerated', // periwound_skin
        false, // undermining_present
        false, // tunneling_present
        false, // infection_signs (currently)
        null,
        5, // pain_level (moderate chronic pain)
        false, // odor_present
        'Foam dressing with compression wrap', // current_dressing
        'every 3 days', // dressing_change_frequency
        true, // debridement_needed
        'chronic', // status
        venous_onset.toISOString().split('T')[0], // onset_date
        'Chronic venous leg ulcer, medial malleolus. Patient has poor venous return. Compression therapy initiated. Some slough present requiring debridement.',
        'Weekly dressing changes with foam dressing. Compression therapy during day. Elevation when resting. Consider referral to vascular surgery if no improvement in 4 weeks.',
        providerId,
      ]
    );

    console.log(`✓ Created chronic venous leg ulcer (ID: ${venous_wound_id})`);

    // Add 4 assessments for venous ulcer showing stalled healing
    const venousAssessmentDates = [
      new Date(venous_onset.getTime() + 30 * 24 * 60 * 60 * 1000), // 1 month after onset
      new Date(venous_onset.getTime() + 60 * 24 * 60 * 60 * 1000), // 2 months
      new Date(venous_onset.getTime() + 75 * 24 * 60 * 60 * 1000), // 2.5 months
      new Date(venous_onset.getTime() + 90 * 24 * 60 * 60 * 1000), // 3 months (current)
    ];

    const venousAssessments = [
      {
        length: 5.8, width: 4.5, area: 26.1, slough: 60, granulation: 30, epi: 10, healing: 'stable', healingPercent: 10,
        periwound: 'macerated', notes: 'Wound not improving significantly. Heavy exudate. Periwound maceration noted. Patient compliance with compression questionable.'
      },
      {
        length: 5.5, width: 4.3, area: 23.7, slough: 50, granulation: 35, epi: 15, healing: 'stable', healingPercent: 15,
        periwound: 'macerated', notes: 'Minimal improvement. Performed sharp debridement of slough. Reinforced importance of compression and elevation.'
      },
      {
        length: 5.6, width: 4.2, area: 23.5, slough: 45, granulation: 40, epi: 15, healing: 'stalled', healingPercent: 20,
        periwound: 'erythematous', notes: 'Healing has stalled. Some erythema around wound edges - monitored for infection. Patient reports improved compliance with compression.'
      },
      {
        length: 5.5, width: 4.2, area: 23.1, slough: 45, granulation: 40, epi: 15, healing: 'stalled', healingPercent: 20,
        periwound: 'macerated', notes: 'No significant change. Venous ulcer remains chronic. Discussed referral to vascular surgery for evaluation. Will continue current regimen and reassess in 2 weeks.'
      },
    ];

    for (let i = 0; i < venousAssessments.length; i++) {
      const assessment = venousAssessments[i];
      await pool.query(
        `INSERT INTO wound_assessments (
          id, tenant_id, wound_id, patient_id, assessment_date, assessed_by,
          length_cm, width_cm, area_cm2, wound_bed_percentage, wound_bed,
          exudate_amount, exudate_type, periwound_skin,
          undermining_present, tunneling_present,
          infection_signs, pain_level, odor_present,
          treatment_applied, dressing_applied, cleaning_solution,
          healing_trend, healing_percentage, provider_notes,
          next_assessment_date, referral_needed, referral_notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
        )`,
        [
          randomUUID(),
          tenantId,
          venous_wound_id,
          patient.id,
          venousAssessmentDates[i].toISOString(),
          providerId,
          assessment.length,
          assessment.width,
          assessment.area,
          JSON.stringify({
            granulation: assessment.granulation,
            slough: assessment.slough,
            epithelializing: assessment.epi
          }),
          'mixed',
          'moderate',
          'serosanguineous',
          assessment.periwound,
          false, // undermining_present
          false, // tunneling_present
          false, // infection_signs
          Math.max(1, 5 - i), // pain_level slightly decreasing (integer)
          false,
          i === 1 ? 'Sharp debridement performed, dressing change' : 'Dressing change, wound cleaning',
          'Foam dressing with compression wrap',
          'Normal saline',
          assessment.healing,
          assessment.healingPercent,
          assessment.notes,
          new Date(venousAssessmentDates[i].getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week later
          i === 3, // referral needed on last assessment
          i === 3 ? 'Refer to vascular surgery for evaluation of venous insufficiency and possible intervention' : null,
        ]
      );
    }

    console.log(`  ✓ Added ${venousAssessments.length} assessments showing stalled healing\n`);

    console.log('✅ Wound tracking seed completed successfully!\n');
    console.log('Summary:');
    console.log(`  - Post-Mohs surgical wound: ${mohs_wound_id}`);
    console.log(`    Status: Healing well (65% healed)`);
    console.log(`    Location: Right nasal ala`);
    console.log(`    Onset: ${mohs_onset.toISOString().split('T')[0]}`);
    console.log('');
    console.log(`  - Chronic venous leg ulcer: ${venous_wound_id}`);
    console.log(`    Status: Chronic/stalled (20% healed)`);
    console.log(`    Location: Left lower leg`);
    console.log(`    Onset: ${venous_onset.toISOString().split('T')[0]} (90 days ago)`);
    console.log('');
    console.log('You can now use the API endpoints:');
    console.log('  GET  /api/wounds - List all wounds');
    console.log('  GET  /api/wounds/:id - Get wound details with assessments');
    console.log('  GET  /api/wounds/:id/healing-metrics - Get healing rate calculations');
    console.log('  POST /api/wounds - Create new wound');
    console.log('  POST /api/wounds/:id/assessments - Add new assessment');

  } catch (error) {
    console.error('Error seeding wounds:', error);
  } finally {
    await pool.end();
  }
}

seedWounds().catch(console.error);
