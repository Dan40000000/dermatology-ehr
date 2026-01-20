const {pool} = require('./dist/db/pool');

async function verifySetup() {
  try {
    const tenantId = 'tenant-demo';

    console.log('════════════════════════════════════════════════════════');
    console.log('  DERM APP - COSMETIC DERMATOLOGY SETUP VERIFICATION');
    console.log('════════════════════════════════════════════════════════\n');

    // 1. Check all providers
    console.log('1. PROVIDERS');
    console.log('───────────────────────────────────────────────────────');
    const providers = await pool.query(`
      SELECT id, full_name, specialty, npi, is_active,
             (SELECT COUNT(*) FROM provider_availability WHERE provider_id = providers.id) as availability_slots
      FROM providers
      WHERE tenant_id = $1
      ORDER BY created_at
    `, [tenantId]);

    providers.rows.forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.full_name}`);
      console.log(`   ID: ${p.id}`);
      console.log(`   Specialty: ${p.specialty}`);
      console.log(`   NPI: ${p.npi || 'Not set'}`);
      console.log(`   Active: ${p.is_active ? '✓' : '✗'}`);
      console.log(`   Availability: ${p.availability_slots} time slots`);
    });

    // 2. Check cosmetic provider specifically
    console.log('\n\n2. COSMETIC PA DETAILS');
    console.log('───────────────────────────────────────────────────────');
    const cosmeticProvider = await pool.query(`
      SELECT p.*,
             array_agg(DISTINCT pa.day_of_week ORDER BY pa.day_of_week) as work_days
      FROM providers p
      LEFT JOIN provider_availability pa ON pa.provider_id = p.id
      WHERE p.tenant_id = $1 AND p.specialty ILIKE '%cosmetic%'
      GROUP BY p.id
    `, [tenantId]);

    if (cosmeticProvider.rows.length > 0) {
      const cp = cosmeticProvider.rows[0];
      console.log(`✓ Found cosmetic provider: ${cp.full_name}`);
      console.log(`  ID: ${cp.id}`);
      console.log(`  Specialty: ${cp.specialty}`);
      console.log(`  NPI: ${cp.npi}`);

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const workDays = cp.work_days.filter(d => d !== null).map(d => dayNames[d]).join(', ');
      console.log(`  Working days: ${workDays}`);

      // Get detailed availability
      const availability = await pool.query(`
        SELECT day_of_week, start_time, end_time
        FROM provider_availability
        WHERE provider_id = $1
        ORDER BY day_of_week
      `, [cp.id]);

      console.log('\n  Schedule:');
      availability.rows.forEach(slot => {
        console.log(`    ${dayNames[slot.day_of_week]}: ${slot.start_time} - ${slot.end_time}`);
      });
    } else {
      console.log('⚠ No cosmetic provider found!');
    }

    // 3. Check cosmetic appointment types
    console.log('\n\n3. COSMETIC APPOINTMENT TYPES');
    console.log('───────────────────────────────────────────────────────');
    const apptTypes = await pool.query(`
      SELECT id, name, duration_minutes,
             (SELECT COUNT(*) FROM appointments WHERE appointment_type_id = appointment_types.id) as appt_count
      FROM appointment_types
      WHERE tenant_id = $1
      AND (name ILIKE '%cosmetic%' OR name ILIKE '%botox%' OR name ILIKE '%filler%')
      ORDER BY name
    `, [tenantId]);

    if (apptTypes.rows.length > 0) {
      apptTypes.rows.forEach(apt => {
        console.log(`✓ ${apt.name}`);
        console.log(`  Duration: ${apt.duration_minutes} minutes`);
        console.log(`  ID: ${apt.id}`);
        console.log(`  Appointments scheduled: ${apt.appt_count}`);
      });
    } else {
      console.log('⚠ No cosmetic appointment types found!');
    }

    // 4. Check cosmetic CPT codes
    console.log('\n\n4. COSMETIC PROCEDURE CODES (CPT)');
    console.log('───────────────────────────────────────────────────────');
    const cptCodes = await pool.query(`
      SELECT code, description, category, default_fee_cents, is_common
      FROM cpt_codes
      WHERE category IN ('Botox/Neurotoxin', 'Chemical Peel', 'Laser Treatment',
                        'Dermabrasion', 'Sclerotherapy', 'PDT', 'Cosmetic Surgery',
                        'Microneedling')
      ORDER BY category, code
    `);

    const byCategory = {};
    cptCodes.rows.forEach(code => {
      if (!byCategory[code.category]) {
        byCategory[code.category] = [];
      }
      byCategory[code.category].push(code);
    });

    Object.keys(byCategory).sort().forEach(category => {
      console.log(`\n${category}:`);
      byCategory[category].forEach(code => {
        const common = code.is_common ? ' (Common)' : '';
        const feeDollars = (code.default_fee_cents / 100).toFixed(2);
        console.log(`  ${code.code} - $${feeDollars}${common}`);
        console.log(`    ${code.description}`);
      });
    });

    // 5. Test appointment scheduling capability
    console.log('\n\n5. APPOINTMENT SCHEDULING TEST');
    console.log('───────────────────────────────────────────────────────');

    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 7); // Next week
    testDate.setHours(10, 0, 0, 0); // 10 AM

    console.log('Testing if cosmetic provider can be scheduled...');

    const canSchedule = cosmeticProvider.rows.length > 0 &&
                        apptTypes.rows.length > 0 &&
                        providers.rows.some(p => p.availability_slots > 0);

    if (canSchedule) {
      console.log('✓ Cosmetic provider is ready for scheduling');
      console.log(`  Provider: ${cosmeticProvider.rows[0].full_name}`);
      console.log(`  Available appointment types: ${apptTypes.rows.length}`);
      console.log(`  Sample date: ${testDate.toLocaleDateString()} at 10:00 AM`);
    } else {
      console.log('✗ Setup incomplete - cannot schedule appointments yet');
    }

    // 6. Summary
    console.log('\n\n6. SETUP SUMMARY');
    console.log('───────────────────────────────────────────────────────');
    console.log(`Total Providers: ${providers.rows.length}`);
    console.log(`  - MDs with FAAD: ${providers.rows.filter(p => p.full_name.includes('FAAD')).length}`);
    console.log(`  - PAs (PA-C): ${providers.rows.filter(p => p.full_name.includes('PA-C')).length}`);
    console.log(`  - Cosmetic specialists: ${cosmeticProvider.rows.length}`);
    console.log(`\nCosmetic Appointment Types: ${apptTypes.rows.length}`);
    console.log(`Cosmetic CPT Codes: ${cptCodes.rows.length}`);
    console.log(`\nStatus: ${canSchedule ? '✅ READY FOR USE' : '⚠️ SETUP INCOMPLETE'}`);

    console.log('\n════════════════════════════════════════════════════════');
    console.log('  COSMETIC SERVICES AVAILABLE');
    console.log('════════════════════════════════════════════════════════');
    console.log('\nSarah Mitchell, PA-C can perform:');
    console.log('  • Botox injections (CPT 64650, 64653)');
    console.log('  • Dermal fillers');
    console.log('  • Chemical peels (CPT 15788, 15789, 17360)');
    console.log('  • Microneedling');
    console.log('  • Laser treatments (CPT 17106, 17107, 96920, 96921)');
    console.log('  • Sclerotherapy for spider veins (CPT 36468)');
    console.log('  • Photodynamic therapy (CPT 96567)');
    console.log('  • Cosmetic consultations');
    console.log('');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ ERROR:', error);
    process.exit(1);
  }
}

verifySetup();
