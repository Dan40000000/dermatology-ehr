import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import extract from 'extract-zip';
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

const execAsync = promisify(exec);

export function registerDbCommands(program: Command) {
  const db = program.command('db').description('Database management commands');

  db.command('migrate')
    .description('Run database migrations')
    .action(async () => {
      try {
        const config = await getConfig();
        logger.heading('Running Database Migrations');
        logger.info(`Environment: ${config.environment}`);
        logger.info(`Database: ${config.database.database}`);
        logger.blank();

        // Change to backend directory and run migration
        const backendDir = path.resolve(__dirname, '../../../backend');

        await withSpinner('Running migrations', async () => {
          const { stdout, stderr } = await execAsync('npm run db:migrate', {
            cwd: backendDir,
            env: {
              ...process.env,
              DB_HOST: config.database.host,
              DB_PORT: config.database.port.toString(),
              DB_NAME: config.database.database,
              DB_USER: config.database.user,
              DB_PASSWORD: config.database.password,
            },
          });
          if (stdout) logger.debug(stdout);
          if (stderr) logger.debug(stderr);
        });

        logger.success('Migrations completed successfully');
      } catch (error) {
        logger.error('Failed to run migrations', error);
        process.exit(1);
      }
    });

  db.command('seed')
    .description('Seed database with sample data')
    .option('-t, --test', 'Seed with test data')
    .action(async (options) => {
      try {
        const config = await getConfig();
        logger.heading('Seeding Database');
        logger.info(`Environment: ${config.environment}`);
        logger.info(`Database: ${config.database.database}`);
        logger.blank();

        if (config.environment === 'production') {
          const confirmed = await confirmAction(
            'You are about to seed a production database. Are you sure?',
            false
          );
          if (!confirmed) {
            logger.warning('Seeding cancelled');
            return;
          }
        }

        const backendDir = path.resolve(__dirname, '../../../backend');
        const command = options.test ? 'npm run db:seed' : 'npm run db:seed';

        await withSpinner('Seeding database', async () => {
          const { stdout, stderr } = await execAsync(command, {
            cwd: backendDir,
            env: {
              ...process.env,
              DB_HOST: config.database.host,
              DB_PORT: config.database.port.toString(),
              DB_NAME: config.database.database,
              DB_USER: config.database.user,
              DB_PASSWORD: config.database.password,
            },
          });
          if (stdout) logger.debug(stdout);
          if (stderr) logger.debug(stderr);
        });

        logger.success('Database seeded successfully');
      } catch (error) {
        logger.error('Failed to seed database', error);
        process.exit(1);
      }
    });

  db.command('reset')
    .description('Reset database (drop all tables and re-run migrations)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (options) => {
      try {
        const config = await getConfig();
        logger.heading('Resetting Database');
        logger.warning('This will DROP all tables and data!');
        logger.info(`Environment: ${config.environment}`);
        logger.info(`Database: ${config.database.database}`);
        logger.blank();

        if (!options.force) {
          const confirmed = await confirmAction(
            'Are you ABSOLUTELY sure you want to reset the database?',
            false
          );
          if (!confirmed) {
            logger.warning('Reset cancelled');
            return;
          }
        }

        createPool(config);

        await withSpinner('Dropping all tables', async () => {
          await getPool().query(`
            DO $$ DECLARE
              r RECORD;
            BEGIN
              FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
              END LOOP;
            END $$;
          `);
        });

        await closePool();

        // Run migrations
        const backendDir = path.resolve(__dirname, '../../../backend');
        await withSpinner('Running migrations', async () => {
          const { stdout, stderr } = await execAsync('npm run db:migrate', {
            cwd: backendDir,
            env: {
              ...process.env,
              DB_HOST: config.database.host,
              DB_PORT: config.database.port.toString(),
              DB_NAME: config.database.database,
              DB_USER: config.database.user,
              DB_PASSWORD: config.database.password,
            },
          });
          if (stdout) logger.debug(stdout);
          if (stderr) logger.debug(stderr);
        });

        logger.success('Database reset successfully');
      } catch (error) {
        logger.error('Failed to reset database', error);
        await closePool();
        process.exit(1);
      }
    });

  db.command('backup')
    .description('Backup database to file')
    .option('-o, --output <path>', 'Output file path')
    .action(async (options) => {
      try {
        const config = await getConfig();
        logger.heading('Backing Up Database');
        logger.info(`Database: ${config.database.database}`);
        logger.blank();

        // Ensure backup directory exists
        const backupDir = config.backupDir || path.join(process.cwd(), 'database-backups');
        await fs.ensureDir(backupDir);

        // Generate backup filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const defaultFilename = `derm-db-backup-${timestamp}.sql`;
        const outputPath = options.output || path.join(backupDir, defaultFilename);

        await withSpinner('Creating database backup', async () => {
          const pgDumpCommand = `PGPASSWORD="${config.database.password}" pg_dump -h ${config.database.host} -p ${config.database.port} -U ${config.database.user} -d ${config.database.database} -F p -f "${outputPath}"`;

          await execAsync(pgDumpCommand);
        });

        const stats = await fs.stat(outputPath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

        logger.success(`Database backed up successfully`);
        logger.info(`File: ${outputPath}`);
        logger.info(`Size: ${sizeInMB} MB`);
      } catch (error) {
        logger.error('Failed to backup database', error);
        process.exit(1);
      }
    });

  db.command('restore')
    .description('Restore database from backup file')
    .argument('<file>', 'Backup file path')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (file, options) => {
      try {
        const config = await getConfig();
        logger.heading('Restoring Database');
        logger.warning('This will REPLACE all existing data!');
        logger.info(`Database: ${config.database.database}`);
        logger.info(`Backup file: ${file}`);
        logger.blank();

        // Check if file exists
        if (!(await fs.pathExists(file))) {
          logger.error(`Backup file not found: ${file}`);
          process.exit(1);
        }

        if (!options.force) {
          const confirmed = await confirmAction(
            'Are you sure you want to restore from this backup?',
            false
          );
          if (!confirmed) {
            logger.warning('Restore cancelled');
            return;
          }
        }

        await withSpinner('Restoring database', async () => {
          const psqlCommand = `PGPASSWORD="${config.database.password}" psql -h ${config.database.host} -p ${config.database.port} -U ${config.database.user} -d ${config.database.database} -f "${file}"`;

          await execAsync(psqlCommand);
        });

        logger.success('Database restored successfully');
      } catch (error) {
        logger.error('Failed to restore database', error);
        process.exit(1);
      }
    });

  return db;
}
