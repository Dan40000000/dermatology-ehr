import { pool } from '../db/pool';
import * as fs from 'fs';
import * as path from 'path';

async function applyMigration() {
  try {
    const migrationPath = path.join(__dirname, '../../migrations', '047_telehealth_enhancements.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Applying telehealth enhancements migration...');
    await pool.query(migrationSQL);
    console.log('Migration applied successfully!');

    // Verify the columns were added
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'telehealth_sessions'
      AND column_name IN ('reason', 'assigned_to')
    `);

    console.log('New columns:', result.rows);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
