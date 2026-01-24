/**
 * Migration Verification Script
 *
 * This script verifies the health of the migration system:
 * - Checks for duplicate migration numbers
 * - Checks for orphaned migrations
 * - Verifies all migrations can parse correctly
 * - Reports any issues found
 *
 * Usage:
 *   cd /path/to/project/backend
 *   npx ts-node-dev --transpile-only ../scripts/verify-migrations.ts
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - Errors found
 *   2 - Warnings only
 */

import * as fs from 'fs';
import * as path from 'path';

// Paths
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'backend', 'migrations');
const MIGRATE_TS_PATH = path.join(PROJECT_ROOT, 'backend', 'src', 'db', 'migrate.ts');

interface Issue {
  type: 'error' | 'warning';
  category: string;
  message: string;
  details?: string[];
}

interface VerificationResult {
  passed: boolean;
  issues: Issue[];
  stats: {
    sqlFileCount: number;
    embeddedCount: number;
    duplicateCount: number;
    orphanedCount: number;
    parseErrors: number;
  };
}

/**
 * Parse migration files from the migrations directory
 */
function getSqlFiles(): Map<string, string[]> {
  const byNumber = new Map<string, string[]>();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return byNumber;
  }

  const entries = fs.readdirSync(MIGRATIONS_DIR);

  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue;

    const match = entry.match(/^(\d+)_(.+)\.sql$/);
    if (match) {
      const num = match[1];
      const existing = byNumber.get(num) || [];
      existing.push(entry);
      byNumber.set(num, existing);
    }
  }

  return byNumber;
}

/**
 * Parse embedded migrations from migrate.ts
 */
function getEmbeddedMigrations(): Set<string> {
  const migrations = new Set<string>();

  if (!fs.existsSync(MIGRATE_TS_PATH)) {
    return migrations;
  }

  const content = fs.readFileSync(MIGRATE_TS_PATH, 'utf-8');
  const namePattern = /name:\s*["'](\d+_[^"']+)["']/g;

  let match;
  while ((match = namePattern.exec(content)) !== null) {
    migrations.add(match[1]);
  }

  return migrations;
}

/**
 * Check for SQL syntax issues in migration files
 */
function checkSqlParsing(filePath: string): string[] {
  const errors: string[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Basic SQL validation checks
    const lines = content.split('\n');
    let inString = false;
    let stringChar = '';
    let parenDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments
      if (line.trim().startsWith('--')) continue;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];

        if (inString) {
          if (char === stringChar && line[j - 1] !== '\\') {
            inString = false;
          }
        } else {
          if (char === "'" || char === '"') {
            inString = true;
            stringChar = char;
          } else if (char === '(') {
            parenDepth++;
          } else if (char === ')') {
            parenDepth--;
            if (parenDepth < 0) {
              errors.push(`Line ${i + 1}: Unmatched closing parenthesis`);
              parenDepth = 0;
            }
          }
        }
      }
    }

    if (inString) {
      errors.push('Unclosed string literal');
    }

    if (parenDepth > 0) {
      errors.push(`${parenDepth} unclosed parenthesis(es)`);
    }

    // Check for common issues
    if (content.includes(';;')) {
      errors.push('Double semicolon detected (potential syntax issue)');
    }

  } catch (err) {
    errors.push(`Failed to read file: ${err}`);
  }

  return errors;
}

/**
 * Run all verification checks
 */
function runVerification(): VerificationResult {
  const issues: Issue[] = [];
  const stats = {
    sqlFileCount: 0,
    embeddedCount: 0,
    duplicateCount: 0,
    orphanedCount: 0,
    parseErrors: 0,
  };

  console.log('Running migration verification checks...\n');

  // Check 1: File and directory existence
  console.log('Check 1: Verifying file/directory existence...');
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    issues.push({
      type: 'error',
      category: 'filesystem',
      message: 'Migrations directory not found',
      details: [MIGRATIONS_DIR],
    });
  }

  if (!fs.existsSync(MIGRATE_TS_PATH)) {
    issues.push({
      type: 'error',
      category: 'filesystem',
      message: 'migrate.ts not found',
      details: [MIGRATE_TS_PATH],
    });
  }

  // Check 2: Duplicate migration numbers
  console.log('Check 2: Checking for duplicate migration numbers...');
  const sqlFilesByNumber = getSqlFiles();

  for (const [num, files] of sqlFilesByNumber) {
    stats.sqlFileCount += files.length;
    if (files.length > 1) {
      stats.duplicateCount++;
      issues.push({
        type: 'error',
        category: 'duplicates',
        message: `Duplicate migration number: ${num}`,
        details: files,
      });
    }
  }

  // Check 3: Orphaned migrations
  console.log('Check 3: Checking for orphaned migrations...');
  const embeddedMigrations = getEmbeddedMigrations();
  stats.embeddedCount = embeddedMigrations.size;

  for (const files of sqlFilesByNumber.values()) {
    for (const file of files) {
      const name = file.replace('.sql', '');
      if (!embeddedMigrations.has(name)) {
        stats.orphanedCount++;
        issues.push({
          type: 'warning',
          category: 'orphaned',
          message: `Orphaned migration file (not in migrate.ts)`,
          details: [file],
        });
      }
    }
  }

  // Check 4: SQL parsing
  console.log('Check 4: Verifying SQL file syntax...');
  if (fs.existsSync(MIGRATIONS_DIR)) {
    const entries = fs.readdirSync(MIGRATIONS_DIR);
    for (const entry of entries) {
      if (!entry.endsWith('.sql')) continue;

      const filePath = path.join(MIGRATIONS_DIR, entry);
      const parseErrors = checkSqlParsing(filePath);

      if (parseErrors.length > 0) {
        stats.parseErrors++;
        issues.push({
          type: 'warning',
          category: 'parsing',
          message: `Potential SQL issues in ${entry}`,
          details: parseErrors,
        });
      }
    }
  }

  // Check 5: Embedded migration numbering
  console.log('Check 5: Checking embedded migration order...');
  const embeddedNumbers: number[] = [];
  for (const name of embeddedMigrations) {
    const num = parseInt(name.split('_')[0]);
    if (!isNaN(num)) {
      embeddedNumbers.push(num);
    }
  }

  // Check for duplicate numbers in embedded migrations
  const embeddedByNumber = new Map<number, number>();
  for (const num of embeddedNumbers) {
    embeddedByNumber.set(num, (embeddedByNumber.get(num) || 0) + 1);
  }

  for (const [num, count] of embeddedByNumber) {
    if (count > 1) {
      issues.push({
        type: 'error',
        category: 'embedded-duplicates',
        message: `Duplicate embedded migration number: ${num.toString().padStart(3, '0')} (${count} occurrences)`,
      });
    }
  }

  // Determine if verification passed
  const hasErrors = issues.some(i => i.type === 'error');
  const passed = !hasErrors;

  return { passed, issues, stats };
}

/**
 * Print verification results
 */
function printResults(result: VerificationResult): void {
  console.log('\n' + '='.repeat(80));
  console.log('MIGRATION VERIFICATION RESULTS');
  console.log('='.repeat(80));

  // Stats
  console.log('\nStatistics:');
  console.log(`  SQL files:            ${result.stats.sqlFileCount}`);
  console.log(`  Embedded migrations:  ${result.stats.embeddedCount}`);
  console.log(`  Duplicate numbers:    ${result.stats.duplicateCount}`);
  console.log(`  Orphaned migrations:  ${result.stats.orphanedCount}`);
  console.log(`  Parse warnings:       ${result.stats.parseErrors}`);

  // Issues by category
  const errors = result.issues.filter(i => i.type === 'error');
  const warnings = result.issues.filter(i => i.type === 'warning');

  if (errors.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('ERRORS (' + errors.length + ')');
    console.log('-'.repeat(80));
    for (const issue of errors) {
      console.log(`\n  [${issue.category.toUpperCase()}] ${issue.message}`);
      if (issue.details) {
        for (const detail of issue.details) {
          console.log(`    - ${detail}`);
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('WARNINGS (' + warnings.length + ')');
    console.log('-'.repeat(80));
    for (const issue of warnings) {
      console.log(`\n  [${issue.category.toUpperCase()}] ${issue.message}`);
      if (issue.details) {
        for (const detail of issue.details) {
          console.log(`    - ${detail}`);
        }
      }
    }
  }

  // Final status
  console.log('\n' + '='.repeat(80));
  if (result.passed) {
    if (warnings.length > 0) {
      console.log('STATUS: PASSED with warnings');
    } else {
      console.log('STATUS: PASSED');
    }
  } else {
    console.log('STATUS: FAILED');
    console.log(`\n${errors.length} error(s) must be fixed before migrations are healthy.`);
  }
  console.log('='.repeat(80));
}

/**
 * Main function
 */
function main(): void {
  const result = runVerification();
  printResults(result);

  // Exit with appropriate code
  if (!result.passed) {
    process.exit(1);
  } else if (result.issues.some(i => i.type === 'warning')) {
    process.exit(2);
  } else {
    process.exit(0);
  }
}

// Run
main();
