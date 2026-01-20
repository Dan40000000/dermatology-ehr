#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';
import { logger } from './utils';
import { registerDbCommands } from './commands/db';
import { registerUserCommands } from './commands/user';
import { registerTenantCommands } from './commands/tenant';
import { registerExportCommands } from './commands/export';
import { registerImportCommands } from './commands/import';
import { registerSyncCommand } from './commands/sync';
import { registerDevCommands } from './commands/dev';
import { registerStatusCommands } from './commands/status';
import { registerConfigCommands } from './commands/config';

// Load environment variables from project root
const rootDir = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(rootDir, '.env') });

// Create program
const program = new Command();

program
  .name('derm')
  .description('CLI tool for managing the Dermatology App')
  .version('1.0.0')
  .option('-d, --debug', 'Enable debug mode')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.debug) {
      process.env.DEBUG = 'true';
      logger.debug('Debug mode enabled');
    }
  });

// Display banner for main command
program.addHelpText('beforeAll', () => {
  return `
${chalk.cyan.bold('╔═══════════════════════════════════════╗')}
${chalk.cyan.bold('║')}  ${chalk.white.bold('Dermatology App CLI')}              ${chalk.cyan.bold('║')}
${chalk.cyan.bold('║')}  ${chalk.gray('Professional healthcare management')}  ${chalk.cyan.bold('║')}
${chalk.cyan.bold('╚═══════════════════════════════════════╝')}
`;
});

// Register all commands
registerConfigCommands(program);
registerDbCommands(program);
registerUserCommands(program);
registerTenantCommands(program);
registerExportCommands(program);
registerImportCommands(program);
registerSyncCommand(program);
registerDevCommands(program);
registerStatusCommands(program);

// Add some helpful examples
program.addHelpText('after', () => {
  return `
${chalk.bold('Examples:')}
  ${chalk.gray('# Initialize configuration')}
  $ derm config init

  ${chalk.gray('# Check system status')}
  $ derm status

  ${chalk.gray('# Run database migrations')}
  $ derm db:migrate

  ${chalk.gray('# Create a new user')}
  $ derm user:create

  ${chalk.gray('# List all tenants')}
  $ derm tenant:list

  ${chalk.gray('# Export patients to CSV')}
  $ derm export:patients

  ${chalk.gray('# Start development services')}
  $ derm dev:start

${chalk.bold('Configuration:')}
  Config file: ${chalk.cyan('~/.dermrc')}
  Run ${chalk.cyan('derm config init')} to create configuration file

${chalk.bold('Documentation:')}
  For more information, visit: ${chalk.cyan('https://github.com/your-repo/derm-app')}
`;
});

// Handle unknown commands
program.on('command:*', () => {
  logger.error(`Invalid command: ${program.args.join(' ')}`);
  logger.info('Run "derm --help" for available commands');
  process.exit(1);
});

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
