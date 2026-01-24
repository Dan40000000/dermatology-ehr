/**
 * Migration Consolidation Script
 *
 * This script analyzes the migration system to identify:
 * - All SQL migration files in /backend/migrations/
 * - All embedded migrations in /backend/src/db/migrate.ts
 * - Duplicate migration numbers
 * - Orphaned migrations (files that are never run)
 * - Missing migrations (embedded but no file)
 *
 * Usage:
 *   cd /path/to/project/backend
 *   npx ts-node-dev --transpile-only ../scripts/consolidate-migrations.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Paths
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'backend', 'migrations');
const MIGRATE_TS_PATH = path.join(PROJECT_ROOT, 'backend', 'src', 'db', 'migrate.ts');

interface MigrationFile {
  filename: string;
  number: string;
  name: string;
  fullPath: string;
}

interface EmbeddedMigration {
  name: string;
  number: string;
  lineNumber: number;
}

interface DuplicateGroup {
  number: string;
  files: MigrationFile[];
}

interface AnalysisResult {
  sqlFiles: MigrationFile[];
  embeddedMigrations: EmbeddedMigration[];
  duplicateNumbers: DuplicateGroup[];
  orphanedMigrations: MigrationFile[];
  missingFiles: EmbeddedMigration[];
  numberGaps: string[];
  consolidationPlan: ConsolidationPlan;
}

interface ConsolidationPlan {
  renameOperations: { from: string; to: string; reason: string }[];
  filesToEmbed: MigrationFile[];
  suggestedOrder: string[];
}

/**
 * Parse migration files from the migrations directory
 */
function parseMigrationFiles(): MigrationFile[] {
  const files: MigrationFile[] = [];

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migration directory not found: ${MIGRATIONS_DIR}`);
    return files;
  }

  const entries = fs.readdirSync(MIGRATIONS_DIR);

  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue;

    // Parse migration number from filename (e.g., "019_fhir_oauth_tokens.sql")
    const match = entry.match(/^(\d+)_(.+)\.sql$/);
    if (match) {
      files.push({
        filename: entry,
        number: match[1],
        name: match[2],
        fullPath: path.join(MIGRATIONS_DIR, entry),
      });
    }
  }

  return files.sort((a, b) => parseInt(a.number) - parseInt(b.number));
}

/**
 * Parse embedded migrations from migrate.ts
 */
function parseEmbeddedMigrations(): EmbeddedMigration[] {
  const migrations: EmbeddedMigration[] = [];

  if (!fs.existsSync(MIGRATE_TS_PATH)) {
    console.error(`migrate.ts not found: ${MIGRATE_TS_PATH}`);
    return migrations;
  }

  const content = fs.readFileSync(MIGRATE_TS_PATH, 'utf-8');
  const lines = content.split('\n');

  // Match patterns like: name: "001_init",
  const namePattern = /name:\s*["'](\d+)_([^"']+)["']/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(namePattern);
    if (match) {
      migrations.push({
        name: `${match[1]}_${match[2]}`,
        number: match[1],
        lineNumber: i + 1,
      });
    }
  }

  return migrations;
}

/**
 * Find duplicate migration numbers
 */
function findDuplicates(files: MigrationFile[]): DuplicateGroup[] {
  const byNumber = new Map<string, MigrationFile[]>();

  for (const file of files) {
    const existing = byNumber.get(file.number) || [];
    existing.push(file);
    byNumber.set(file.number, existing);
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [number, fileList] of byNumber) {
    if (fileList.length > 1) {
      duplicates.push({ number, files: fileList });
    }
  }

  return duplicates.sort((a, b) => parseInt(a.number) - parseInt(b.number));
}

/**
 * Find orphaned migrations (SQL files not in migrate.ts)
 */
function findOrphanedMigrations(
  sqlFiles: MigrationFile[],
  embeddedMigrations: EmbeddedMigration[]
): MigrationFile[] {
  const embeddedNames = new Set(embeddedMigrations.map(m => m.name));

  return sqlFiles.filter(file => {
    const fullName = `${file.number}_${file.name}`;
    return !embeddedNames.has(fullName);
  });
}

/**
 * Find embedded migrations that don't have corresponding SQL files
 */
function findMissingFiles(
  sqlFiles: MigrationFile[],
  embeddedMigrations: EmbeddedMigration[]
): EmbeddedMigration[] {
  const fileNames = new Set(sqlFiles.map(f => `${f.number}_${f.name}`));

  // Note: embedded migrations have SQL inline, so "missing file" just means
  // there's no corresponding .sql file. This is expected for embedded migrations.
  return embeddedMigrations.filter(m => !fileNames.has(m.name));
}

/**
 * Find gaps in migration numbering
 */
function findNumberGaps(files: MigrationFile[]): string[] {
  const gaps: string[] = [];
  const numbers = [...new Set(files.map(f => parseInt(f.number)))].sort((a, b) => a - b);

  for (let i = 1; i < numbers.length; i++) {
    const expected = numbers[i - 1] + 1;
    const actual = numbers[i];

    if (actual > expected) {
      for (let gap = expected; gap < actual; gap++) {
        gaps.push(gap.toString().padStart(3, '0'));
      }
    }
  }

  return gaps;
}

/**
 * Generate a consolidation plan
 */
function generateConsolidationPlan(
  sqlFiles: MigrationFile[],
  embeddedMigrations: EmbeddedMigration[],
  duplicates: DuplicateGroup[],
  orphaned: MigrationFile[]
): ConsolidationPlan {
  const renameOperations: { from: string; to: string; reason: string }[] = [];
  const suggestedOrder: string[] = [];

  // Get the highest migration number used
  const allNumbers = [
    ...sqlFiles.map(f => parseInt(f.number)),
    ...embeddedMigrations.map(m => parseInt(m.number)),
  ];
  let nextNumber = Math.max(...allNumbers) + 1;

  // For each duplicate group, suggest renumbering all but the first
  for (const dup of duplicates) {
    const sorted = dup.files.sort((a, b) => a.name.localeCompare(b.name));

    // Keep the first one, renumber the rest
    for (let i = 1; i < sorted.length; i++) {
      const newNumber = nextNumber.toString().padStart(3, '0');
      renameOperations.push({
        from: sorted[i].filename,
        to: `${newNumber}_${sorted[i].name}.sql`,
        reason: `Duplicate number ${dup.number} - renumbered to ${newNumber}`,
      });
      nextNumber++;
    }
  }

  // Build suggested order (embedded migrations first, then orphaned files by number)
  for (const emb of embeddedMigrations) {
    suggestedOrder.push(emb.name);
  }

  // Add orphaned migrations at appropriate positions based on their number
  for (const orphan of orphaned) {
    const orphanName = `${orphan.number}_${orphan.name}`;
    suggestedOrder.push(orphanName);
  }

  // Sort by number
  suggestedOrder.sort((a, b) => {
    const numA = parseInt(a.split('_')[0]);
    const numB = parseInt(b.split('_')[0]);
    return numA - numB;
  });

  return {
    renameOperations,
    filesToEmbed: orphaned,
    suggestedOrder,
  };
}

/**
 * Print a formatted report
 */
function printReport(result: AnalysisResult): void {
  console.log('\n' + '='.repeat(80));
  console.log('MIGRATION CONSOLIDATION ANALYSIS REPORT');
  console.log('='.repeat(80));
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');

  // Summary
  console.log('-'.repeat(80));
  console.log('SUMMARY');
  console.log('-'.repeat(80));
  console.log(`SQL files in /backend/migrations/:     ${result.sqlFiles.length}`);
  console.log(`Embedded migrations in migrate.ts:    ${result.embeddedMigrations.length}`);
  console.log(`Duplicate migration numbers:          ${result.duplicateNumbers.length}`);
  console.log(`Orphaned migrations (never run):      ${result.orphanedMigrations.length}`);
  console.log(`Number gaps:                          ${result.numberGaps.length}`);
  console.log('');

  // Duplicate Numbers
  if (result.duplicateNumbers.length > 0) {
    console.log('-'.repeat(80));
    console.log('DUPLICATE MIGRATION NUMBERS (Critical Issue)');
    console.log('-'.repeat(80));
    for (const dup of result.duplicateNumbers) {
      console.log(`\n  Number ${dup.number}:`);
      for (const file of dup.files) {
        console.log(`    - ${file.filename}`);
      }
    }
    console.log('');
  }

  // Orphaned Migrations
  if (result.orphanedMigrations.length > 0) {
    console.log('-'.repeat(80));
    console.log('ORPHANED MIGRATIONS (SQL files not embedded in migrate.ts)');
    console.log('-'.repeat(80));
    for (const orphan of result.orphanedMigrations) {
      console.log(`  ${orphan.filename}`);
    }
    console.log('');
  }

  // Embedded migrations (for reference)
  console.log('-'.repeat(80));
  console.log('EMBEDDED MIGRATIONS (in migrate.ts)');
  console.log('-'.repeat(80));
  for (const emb of result.embeddedMigrations) {
    console.log(`  Line ${emb.lineNumber.toString().padStart(4)}: ${emb.name}`);
  }
  console.log('');

  // Number Gaps
  if (result.numberGaps.length > 0) {
    console.log('-'.repeat(80));
    console.log('MIGRATION NUMBER GAPS');
    console.log('-'.repeat(80));
    console.log(`  Missing numbers: ${result.numberGaps.join(', ')}`);
    console.log('');
  }

  // Consolidation Plan
  console.log('-'.repeat(80));
  console.log('CONSOLIDATION PLAN');
  console.log('-'.repeat(80));

  if (result.consolidationPlan.renameOperations.length > 0) {
    console.log('\n  STEP 1: Rename duplicate-numbered files');
    for (const op of result.consolidationPlan.renameOperations) {
      console.log(`    ${op.from}`);
      console.log(`      -> ${op.to}`);
      console.log(`      (${op.reason})`);
    }
  }

  if (result.consolidationPlan.filesToEmbed.length > 0) {
    console.log('\n  STEP 2: Embed orphaned migrations in migrate.ts');
    console.log('    The following SQL files need to be added to the migrations array:');
    for (const file of result.consolidationPlan.filesToEmbed) {
      console.log(`    - ${file.filename}`);
    }
  }

  console.log('\n  STEP 3: Verify migration order');
  console.log('    Suggested final migration order:');
  let count = 0;
  for (const name of result.consolidationPlan.suggestedOrder) {
    count++;
    console.log(`      ${count.toString().padStart(3)}. ${name}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('END OF REPORT');
  console.log('='.repeat(80));
}

/**
 * Generate a consolidated migration array code
 */
function generateConsolidatedMigrationCode(
  embeddedMigrations: EmbeddedMigration[],
  orphanedFiles: MigrationFile[]
): string {
  const lines: string[] = [];

  lines.push('// Consolidated migration list with suggested numbering');
  lines.push('// Generated by consolidate-migrations.ts');
  lines.push('');
  lines.push('const consolidatedMigrations = [');

  // Get all unique migrations with their numbers
  const allMigrations: { number: number; name: string; source: 'embedded' | 'file' }[] = [];

  for (const emb of embeddedMigrations) {
    allMigrations.push({
      number: parseInt(emb.number),
      name: emb.name,
      source: 'embedded',
    });
  }

  for (const file of orphanedFiles) {
    allMigrations.push({
      number: parseInt(file.number),
      name: `${file.number}_${file.name}`,
      source: 'file',
    });
  }

  // Sort and deduplicate
  allMigrations.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));

  for (const mig of allMigrations) {
    const sourceNote = mig.source === 'file' ? ' // FROM SQL FILE - needs embedding' : '';
    lines.push(`  "${mig.name}",${sourceNote}`);
  }

  lines.push('];');

  return lines.join('\n');
}

/**
 * Main function
 */
function main(): void {
  console.log('Analyzing migration system...');
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Migrations dir: ${MIGRATIONS_DIR}`);
  console.log(`migrate.ts: ${MIGRATE_TS_PATH}`);

  // Parse files
  const sqlFiles = parseMigrationFiles();
  const embeddedMigrations = parseEmbeddedMigrations();

  // Analyze
  const duplicateNumbers = findDuplicates(sqlFiles);
  const orphanedMigrations = findOrphanedMigrations(sqlFiles, embeddedMigrations);
  const missingFiles = findMissingFiles(sqlFiles, embeddedMigrations);
  const numberGaps = findNumberGaps(sqlFiles);
  const consolidationPlan = generateConsolidationPlan(
    sqlFiles,
    embeddedMigrations,
    duplicateNumbers,
    orphanedMigrations
  );

  const result: AnalysisResult = {
    sqlFiles,
    embeddedMigrations,
    duplicateNumbers,
    orphanedMigrations,
    missingFiles,
    numberGaps,
    consolidationPlan,
  };

  // Print report
  printReport(result);

  // Generate consolidated code
  console.log('\n');
  console.log('-'.repeat(80));
  console.log('CONSOLIDATED MIGRATION LIST (for reference)');
  console.log('-'.repeat(80));
  console.log(generateConsolidatedMigrationCode(embeddedMigrations, orphanedMigrations));
}

// Run
main();
