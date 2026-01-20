import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs-extra';
import { createObjectCsvWriter } from 'csv-writer';
import {
  getConfig,
  createPool,
  closePool,
  getPool,
  logger,
  withSpinner,
  formatBytes,
} from '../utils';

export function registerExportCommands(program: Command) {
  const exportCmd = program.command('export').description('Export data to CSV files');

  exportCmd
    .command('patients')
    .description('Export patients to CSV')
    .option('-o, --output <path>', 'Output file path')
    .option('-t, --tenant <id>', 'Filter by tenant ID')
    .action(async (options) => {
      try {
        const config = await getConfig();
        createPool(config);

        logger.heading('Export Patients');
        logger.blank();

        // Build query
        let query = `
          SELECT p.id, p.first_name, p.last_name, p.date_of_birth, p.gender,
                 p.email, p.phone, p.address, p.city, p.state, p.zip_code,
                 p.medical_record_number, p.insurance_provider, p.insurance_policy_number,
                 p.created_at, t.name as tenant_name
          FROM patients p
          LEFT JOIN tenants t ON p.tenant_id = t.id
          WHERE 1=1
        `;
        const params: any[] = [];

        if (options.tenant) {
          query += ` AND p.tenant_id = $1`;
          params.push(options.tenant);
        }

        query += ` ORDER BY p.created_at DESC`;

        const result = await withSpinner('Fetching patient data', async () => {
          return await getPool().query(query, params);
        });

        await closePool();

        if (result.rows.length === 0) {
          logger.warning('No patients found');
          return;
        }

        logger.info(`Found ${result.rows.length} patients`);

        // Generate output path
        const timestamp = new Date().toISOString().split('T')[0];
        const defaultFilename = `patients-export-${timestamp}.csv`;
        const outputPath = options.output || path.join(process.cwd(), defaultFilename);

        // Create CSV writer
        const csvWriter = createObjectCsvWriter({
          path: outputPath,
          header: [
            { id: 'id', title: 'ID' },
            { id: 'first_name', title: 'First Name' },
            { id: 'last_name', title: 'Last Name' },
            { id: 'date_of_birth', title: 'Date of Birth' },
            { id: 'gender', title: 'Gender' },
            { id: 'email', title: 'Email' },
            { id: 'phone', title: 'Phone' },
            { id: 'address', title: 'Address' },
            { id: 'city', title: 'City' },
            { id: 'state', title: 'State' },
            { id: 'zip_code', title: 'Zip Code' },
            { id: 'medical_record_number', title: 'MRN' },
            { id: 'insurance_provider', title: 'Insurance Provider' },
            { id: 'insurance_policy_number', title: 'Policy Number' },
            { id: 'tenant_name', title: 'Tenant' },
            { id: 'created_at', title: 'Created At' },
          ],
        });

        await withSpinner('Writing CSV file', async () => {
          await csvWriter.writeRecords(result.rows);
        });

        const stats = await fs.stat(outputPath);
        logger.success('Export completed successfully');
        logger.info(`File: ${outputPath}`);
        logger.info(`Size: ${formatBytes(stats.size)}`);
        logger.info(`Records: ${result.rows.length}`);
      } catch (error) {
        await closePool();
        logger.error('Failed to export patients', error);
        process.exit(1);
      }
    });

  exportCmd
    .command('appointments')
    .description('Export appointments to CSV')
    .option('-o, --output <path>', 'Output file path')
    .option('-t, --tenant <id>', 'Filter by tenant ID')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .action(async (options) => {
      try {
        const config = await getConfig();
        createPool(config);

        logger.heading('Export Appointments');
        logger.blank();

        // Build query
        let query = `
          SELECT a.id, a.scheduled_time, a.duration_minutes, a.status,
                 a.appointment_type, a.reason, a.notes,
                 p.first_name as patient_first_name, p.last_name as patient_last_name,
                 p.medical_record_number,
                 u.first_name as provider_first_name, u.last_name as provider_last_name,
                 t.name as tenant_name, a.created_at
          FROM appointments a
          LEFT JOIN patients p ON a.patient_id = p.id
          LEFT JOIN users u ON a.provider_id = u.id
          LEFT JOIN tenants t ON a.tenant_id = t.id
          WHERE 1=1
        `;
        const params: any[] = [];
        let paramCount = 1;

        if (options.tenant) {
          query += ` AND a.tenant_id = $${paramCount}`;
          params.push(options.tenant);
          paramCount++;
        }

        if (options.from) {
          query += ` AND a.scheduled_time >= $${paramCount}`;
          params.push(options.from);
          paramCount++;
        }

        if (options.to) {
          query += ` AND a.scheduled_time <= $${paramCount}`;
          params.push(options.to + ' 23:59:59');
          paramCount++;
        }

        query += ` ORDER BY a.scheduled_time DESC`;

        const result = await withSpinner('Fetching appointment data', async () => {
          return await getPool().query(query, params);
        });

        await closePool();

        if (result.rows.length === 0) {
          logger.warning('No appointments found');
          return;
        }

        logger.info(`Found ${result.rows.length} appointments`);

        // Generate output path
        const timestamp = new Date().toISOString().split('T')[0];
        const defaultFilename = `appointments-export-${timestamp}.csv`;
        const outputPath = options.output || path.join(process.cwd(), defaultFilename);

        // Create CSV writer
        const csvWriter = createObjectCsvWriter({
          path: outputPath,
          header: [
            { id: 'id', title: 'ID' },
            { id: 'scheduled_time', title: 'Scheduled Time' },
            { id: 'duration_minutes', title: 'Duration (min)' },
            { id: 'status', title: 'Status' },
            { id: 'appointment_type', title: 'Type' },
            { id: 'patient_first_name', title: 'Patient First Name' },
            { id: 'patient_last_name', title: 'Patient Last Name' },
            { id: 'medical_record_number', title: 'MRN' },
            { id: 'provider_first_name', title: 'Provider First Name' },
            { id: 'provider_last_name', title: 'Provider Last Name' },
            { id: 'reason', title: 'Reason' },
            { id: 'notes', title: 'Notes' },
            { id: 'tenant_name', title: 'Tenant' },
            { id: 'created_at', title: 'Created At' },
          ],
        });

        await withSpinner('Writing CSV file', async () => {
          await csvWriter.writeRecords(result.rows);
        });

        const stats = await fs.stat(outputPath);
        logger.success('Export completed successfully');
        logger.info(`File: ${outputPath}`);
        logger.info(`Size: ${formatBytes(stats.size)}`);
        logger.info(`Records: ${result.rows.length}`);
      } catch (error) {
        await closePool();
        logger.error('Failed to export appointments', error);
        process.exit(1);
      }
    });

  return exportCmd;
}
