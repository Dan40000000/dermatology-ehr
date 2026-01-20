import { Command } from 'commander';
import {
  getConfig,
  saveConfig,
  getConfigPath,
  logger,
  promptForInput,
  promptForSelect,
} from '../utils';
import { DermConfig } from '../types';

export function registerConfigCommands(program: Command) {
  const config = program.command('config').description('Manage CLI configuration');

  config
    .command('init')
    .description('Initialize CLI configuration')
    .action(async () => {
      try {
        logger.heading('Initialize CLI Configuration');
        logger.blank();

        const dbHost = await promptForInput('Database host:', 'localhost');
        const dbPort = await promptForInput('Database port:', '5432');
        const dbName = await promptForInput('Database name:', 'dermatology_db');
        const dbUser = await promptForInput('Database user:', 'postgres');
        const dbPassword = await promptForInput('Database password:');

        const environment = await promptForSelect<'development' | 'staging' | 'production'>(
          'Environment:',
          [
            { name: 'Development', value: 'development' },
            { name: 'Staging', value: 'staging' },
            { name: 'Production', value: 'production' },
          ]
        );

        const apiUrl = await promptForInput('API URL (optional):');
        const backupDir = await promptForInput('Backup directory (optional):');

        const newConfig: DermConfig = {
          database: {
            host: dbHost,
            port: parseInt(dbPort),
            database: dbName,
            user: dbUser,
            password: dbPassword,
          },
          environment,
          apiUrl: apiUrl || undefined,
          backupDir: backupDir || undefined,
        };

        await saveConfig(newConfig);

        logger.success('Configuration saved successfully');
        logger.info(`Config file: ${getConfigPath()}`);
      } catch (error) {
        logger.error('Failed to initialize configuration', error);
        process.exit(1);
      }
    });

  config
    .command('show')
    .description('Show current configuration')
    .option('--show-password', 'Show database password')
    .action(async (options) => {
      try {
        const cfg = await getConfig();

        logger.heading('Current Configuration');
        logger.blank();

        logger.subheading('Database');
        logger.info(`Host: ${cfg.database.host}`);
        logger.info(`Port: ${cfg.database.port}`);
        logger.info(`Database: ${cfg.database.database}`);
        logger.info(`User: ${cfg.database.user}`);
        logger.info(
          `Password: ${options.showPassword ? cfg.database.password : '********'}`
        );
        logger.blank();

        logger.subheading('Environment');
        logger.info(`Environment: ${cfg.environment}`);
        if (cfg.apiUrl) {
          logger.info(`API URL: ${cfg.apiUrl}`);
        }
        if (cfg.backupDir) {
          logger.info(`Backup Directory: ${cfg.backupDir}`);
        }
        logger.blank();

        logger.info(`Config file: ${getConfigPath()}`);
      } catch (error) {
        logger.error('Failed to show configuration', error);
        process.exit(1);
      }
    });

  config
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key (e.g., database.host, environment)')
    .argument('<value>', 'Configuration value')
    .action(async (key, value) => {
      try {
        const cfg = await getConfig();

        // Parse nested keys
        const keys = key.split('.');
        let target: any = cfg;

        for (let i = 0; i < keys.length - 1; i++) {
          if (!target[keys[i]]) {
            target[keys[i]] = {};
          }
          target = target[keys[i]];
        }

        const lastKey = keys[keys.length - 1];

        // Convert value to appropriate type
        let parsedValue: any = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (!isNaN(Number(value))) parsedValue = Number(value);

        target[lastKey] = parsedValue;

        await saveConfig(cfg);

        logger.success(`Configuration updated: ${key} = ${value}`);
      } catch (error) {
        logger.error('Failed to set configuration', error);
        process.exit(1);
      }
    });

  config
    .command('get')
    .description('Get a configuration value')
    .argument('<key>', 'Configuration key (e.g., database.host, environment)')
    .action(async (key) => {
      try {
        const cfg = await getConfig();

        // Parse nested keys
        const keys = key.split('.');
        let value: any = cfg;

        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = value[k];
          } else {
            logger.error(`Configuration key not found: ${key}`);
            process.exit(1);
          }
        }

        if (typeof value === 'object') {
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(value);
        }
      } catch (error) {
        logger.error('Failed to get configuration', error);
        process.exit(1);
      }
    });

  return config;
}
