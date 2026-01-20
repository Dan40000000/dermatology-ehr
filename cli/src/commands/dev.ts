import { Command } from 'commander';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { logger, withSpinner } from '../utils';

const execAsync = promisify(exec);

export function registerDevCommands(program: Command) {
  const dev = program.command('dev').description('Development utility commands');

  dev
    .command('start')
    .description('Start all development services')
    .option('--backend-only', 'Start backend only')
    .option('--frontend-only', 'Start frontend only')
    .action(async (options) => {
      try {
        logger.heading('Starting Development Services');
        logger.blank();

        const rootDir = path.resolve(__dirname, '../../../');

        if (options.backendOnly) {
          logger.info('Starting backend...');
          const backend = spawn('npm', ['run', 'dev'], {
            cwd: path.join(rootDir, 'backend'),
            stdio: 'inherit',
            shell: true,
          });

          backend.on('close', (code) => {
            logger.info(`Backend exited with code ${code}`);
          });
        } else if (options.frontendOnly) {
          logger.info('Starting frontend...');
          const frontend = spawn('npm', ['run', 'dev'], {
            cwd: path.join(rootDir, 'frontend'),
            stdio: 'inherit',
            shell: true,
          });

          frontend.on('close', (code) => {
            logger.info(`Frontend exited with code ${code}`);
          });
        } else {
          logger.info('Starting all services...');
          const all = spawn('npm', ['run', 'dev'], {
            cwd: rootDir,
            stdio: 'inherit',
            shell: true,
          });

          all.on('close', (code) => {
            logger.info(`Services exited with code ${code}`);
          });
        }
      } catch (error) {
        logger.error('Failed to start services', error);
        process.exit(1);
      }
    });

  dev
    .command('logs')
    .description('Tail application logs')
    .option('-f, --follow', 'Follow log output', true)
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .action(async (options) => {
      try {
        logger.heading('Application Logs');
        logger.blank();

        const rootDir = path.resolve(__dirname, '../../../');
        const logFile = path.join(rootDir, 'backend', 'logs', 'app.log');

        const command = options.follow
          ? `tail -f -n ${options.lines} "${logFile}"`
          : `tail -n ${options.lines} "${logFile}"`;

        logger.info(`Showing logs from: ${logFile}`);
        logger.blank();

        const tail = spawn('sh', ['-c', command], {
          stdio: 'inherit',
        });

        tail.on('error', (error) => {
          logger.error('Failed to read logs', error);
          logger.info('Log file may not exist yet. Start the application first.');
        });
      } catch (error) {
        logger.error('Failed to tail logs', error);
        process.exit(1);
      }
    });

  dev
    .command('test')
    .description('Run tests')
    .option('--backend', 'Run backend tests only')
    .option('--frontend', 'Run frontend tests only')
    .option('--e2e', 'Run end-to-end tests')
    .option('--coverage', 'Generate coverage report')
    .option('--watch', 'Watch mode')
    .action(async (options) => {
      try {
        logger.heading('Running Tests');
        logger.blank();

        const rootDir = path.resolve(__dirname, '../../../');

        if (options.e2e) {
          logger.info('Running end-to-end tests...');
          await execAsync('npm run test:e2e', {
            cwd: rootDir,
          });
        } else if (options.backend) {
          logger.info('Running backend tests...');
          const command = options.coverage
            ? 'npm run test:coverage'
            : options.watch
            ? 'npm run test:watch'
            : 'npm test';

          await execAsync(command, {
            cwd: path.join(rootDir, 'backend'),
          });
        } else if (options.frontend) {
          logger.info('Running frontend tests...');
          const command = options.coverage
            ? 'npm run test:coverage'
            : options.watch
            ? 'npm run test:watch'
            : 'npm test';

          await execAsync(command, {
            cwd: path.join(rootDir, 'frontend'),
          });
        } else {
          logger.info('Running all tests...');
          const command = options.coverage ? 'npm run test:coverage' : 'npm test';

          await execAsync(command, {
            cwd: rootDir,
          });
        }

        logger.success('Tests completed');
      } catch (error: any) {
        if (error.code === 1) {
          logger.error('Tests failed');
        } else {
          logger.error('Failed to run tests', error);
        }
        process.exit(1);
      }
    });

  dev
    .command('build')
    .description('Build all packages')
    .option('--backend', 'Build backend only')
    .option('--frontend', 'Build frontend only')
    .action(async (options) => {
      try {
        logger.heading('Building Packages');
        logger.blank();

        const rootDir = path.resolve(__dirname, '../../../');

        if (options.backend) {
          await withSpinner('Building backend', async () => {
            await execAsync('npm run build', {
              cwd: path.join(rootDir, 'backend'),
            });
          });
        } else if (options.frontend) {
          await withSpinner('Building frontend', async () => {
            await execAsync('npm run build', {
              cwd: path.join(rootDir, 'frontend'),
            });
          });
        } else {
          await withSpinner('Building all packages', async () => {
            await execAsync('npm run build', {
              cwd: rootDir,
            });
          });
        }

        logger.success('Build completed successfully');
      } catch (error) {
        logger.error('Build failed', error);
        process.exit(1);
      }
    });

  return dev;
}
