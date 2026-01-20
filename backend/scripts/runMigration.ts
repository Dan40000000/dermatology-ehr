import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://derm_user:derm_pass@localhost:5432/derm_db'
});

async function runMigration() {
  const migrationFile = process.argv[2];

  if (!migrationFile) {
    console.error('Usage: ts-node runMigration.ts <migration-file>');
    process.exit(1);
  }

  const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);

  console.log(`Running migration: ${migrationFile}`);
  console.log(`Path: ${migrationPath}\n`);

  try {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    await pool.query(sql);
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration().catch(console.error);
