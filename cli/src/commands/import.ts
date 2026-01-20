import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as csvParser from 'csv-parser';
import {
  getConfig,
  createPool,
  closePool,
  getPool,
  logger,
  withSpinner,
  confirmAction,
  promptForInput,
} from '../utils';

interface PatientRow {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  medical_record_number?: string;
  insurance_provider?: string;
  insurance_policy_number?: string;
}

export function registerImportCommands(program: Command) {
  const importCmd = program.command('import').description('Import data from CSV files');

  importCmd
    .command('patients')
    .description('Import patients from CSV')
    .argument('<file>', 'CSV file path')
    .option('-t, --tenant <id>', 'Tenant ID (required)')
    .option('--dry-run', 'Validate file without importing')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (file, options) => {
      try {
        if (!options.tenant) {
          logger.error('Tenant ID is required. Use -t or --tenant option');
          process.exit(1);
        }

        const config = await getConfig();
        logger.heading('Import Patients');
        logger.blank();

        // Check if file exists
        if (!(await fs.pathExists(file))) {
          logger.error(`File not found: ${file}`);
          process.exit(1);
        }

        // Read and parse CSV
        const patients: PatientRow[] = [];
        await withSpinner('Reading CSV file', async () => {
          return new Promise<void>((resolve, reject) => {
            fs.createReadStream(file)
              .pipe(csvParser.default ? csvParser.default() : (csvParser as any)())
              .on('data', (row: any) => {
                patients.push(row);
              })
              .on('end', () => resolve())
              .on('error', (error: any) => reject(error));
          });
        });

        logger.info(`Found ${patients.length} records`);
        logger.blank();

        // Validate required fields
        let validationErrors = 0;
        patients.forEach((patient, index) => {
          if (!patient.first_name || !patient.last_name || !patient.date_of_birth) {
            logger.error(
              `Row ${index + 2}: Missing required fields (first_name, last_name, date_of_birth)`
            );
            validationErrors++;
          }
        });

        if (validationErrors > 0) {
          logger.error(`Found ${validationErrors} validation errors`);
          process.exit(1);
        }

        logger.success('Validation passed');

        if (options.dryRun) {
          logger.info('Dry run complete. No data was imported.');
          return;
        }

        logger.blank();

        if (!options.force) {
          const confirmed = await confirmAction(
            `Import ${patients.length} patients into tenant ${options.tenant}?`,
            false
          );
          if (!confirmed) {
            logger.warning('Import cancelled');
            return;
          }
        }

        createPool(config);

        // Verify tenant exists
        const tenantResult = await getPool().query(
          'SELECT id, name FROM tenants WHERE id = $1',
          [options.tenant]
        );

        if (tenantResult.rows.length === 0) {
          logger.error(`Tenant not found: ${options.tenant}`);
          await closePool();
          process.exit(1);
        }

        logger.info(`Importing to tenant: ${tenantResult.rows[0].name}`);
        logger.blank();

        // Import patients
        let imported = 0;
        let skipped = 0;
        let errors = 0;

        for (const patient of patients) {
          try {
            // Check if patient already exists by email or MRN
            let existingPatient = null;
            if (patient.email) {
              const result = await getPool().query(
                'SELECT id FROM patients WHERE email = $1 AND tenant_id = $2',
                [patient.email, options.tenant]
              );
              existingPatient = result.rows[0];
            }

            if (!existingPatient && patient.medical_record_number) {
              const result = await getPool().query(
                'SELECT id FROM patients WHERE medical_record_number = $1 AND tenant_id = $2',
                [patient.medical_record_number, options.tenant]
              );
              existingPatient = result.rows[0];
            }

            if (existingPatient) {
              skipped++;
              continue;
            }

            // Insert patient
            await getPool().query(
              `INSERT INTO patients (
                first_name, last_name, date_of_birth, gender, email, phone,
                address, city, state, zip_code, medical_record_number,
                insurance_provider, insurance_policy_number, tenant_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                patient.first_name,
                patient.last_name,
                patient.date_of_birth,
                patient.gender || null,
                patient.email || null,
                patient.phone || null,
                patient.address || null,
                patient.city || null,
                patient.state || null,
                patient.zip_code || null,
                patient.medical_record_number || null,
                patient.insurance_provider || null,
                patient.insurance_policy_number || null,
                options.tenant,
              ]
            );

            imported++;
          } catch (error) {
            errors++;
            logger.error(
              `Failed to import patient: ${patient.first_name} ${patient.last_name}`,
              error
            );
          }
        }

        await closePool();

        logger.blank();
        logger.success('Import completed');
        logger.info(`Imported: ${imported}`);
        logger.info(`Skipped (duplicates): ${skipped}`);
        if (errors > 0) {
          logger.warning(`Errors: ${errors}`);
        }
      } catch (error) {
        await closePool();
        logger.error('Failed to import patients', error);
        process.exit(1);
      }
    });

  return importCmd;
}
