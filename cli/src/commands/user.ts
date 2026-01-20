import { Command } from 'commander';
import * as bcrypt from 'bcryptjs';
import {
  getConfig,
  createPool,
  closePool,
  getPool,
  logger,
  withSpinner,
  createTable,
  formatDate,
  formatBoolean,
  promptForUserDetails,
  promptForInput,
  promptForPassword,
  confirmAction,
} from '../utils';
import { User } from '../types';

export function registerUserCommands(program: Command) {
  const user = program.command('user').description('User management commands');

  user
    .command('create')
    .description('Create a new user (interactive)')
    .action(async () => {
      try {
        const config = await getConfig();
        logger.heading('Create New User');
        logger.blank();

        // Get user details interactively
        const details = await promptForUserDetails();

        createPool(config);

        // First, get all tenants to select from
        const tenantsResult = await getPool().query(
          'SELECT id, name FROM tenants WHERE is_active = true ORDER BY name'
        );

        if (tenantsResult.rows.length === 0) {
          logger.error('No active tenants found. Please create a tenant first.');
          await closePool();
          process.exit(1);
        }

        // Show tenants and let user select
        logger.blank();
        logger.info('Available tenants:');
        tenantsResult.rows.forEach((t: any, i: number) => {
          logger.info(`  ${i + 1}. ${t.name} (${t.id})`);
        });
        logger.blank();

        const tenantIndex = await promptForInput(
          'Select tenant number:',
          '1'
        );
        const selectedTenant = tenantsResult.rows[parseInt(tenantIndex) - 1];

        if (!selectedTenant) {
          logger.error('Invalid tenant selection');
          await closePool();
          process.exit(1);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(details.password, 10);

        // Create user
        await withSpinner('Creating user', async () => {
          await getPool().query(
            `INSERT INTO users (email, password_hash, first_name, last_name, role, tenant_id, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, true)`,
            [
              details.email,
              hashedPassword,
              details.firstName,
              details.lastName,
              details.role,
              selectedTenant.id,
            ]
          );
        });

        await closePool();

        logger.success('User created successfully');
        logger.info(`Email: ${details.email}`);
        logger.info(`Name: ${details.firstName} ${details.lastName}`);
        logger.info(`Role: ${details.role}`);
        logger.info(`Tenant: ${selectedTenant.name}`);
      } catch (error: any) {
        await closePool();
        if (error.code === '23505') {
          logger.error('A user with this email already exists');
        } else {
          logger.error('Failed to create user', error);
        }
        process.exit(1);
      }
    });

  user
    .command('list')
    .description('List all users')
    .option('-t, --tenant <id>', 'Filter by tenant ID')
    .option('-r, --role <role>', 'Filter by role')
    .option('--inactive', 'Include inactive users')
    .action(async (options) => {
      try {
        const config = await getConfig();
        createPool(config);

        let query = `
          SELECT u.id, u.email, u.first_name, u.last_name, u.role,
                 u.is_active, u.created_at, t.name as tenant_name
          FROM users u
          LEFT JOIN tenants t ON u.tenant_id = t.id
          WHERE 1=1
        `;
        const params: any[] = [];
        let paramCount = 1;

        if (options.tenant) {
          query += ` AND u.tenant_id = $${paramCount}`;
          params.push(options.tenant);
          paramCount++;
        }

        if (options.role) {
          query += ` AND u.role = $${paramCount}`;
          params.push(options.role);
          paramCount++;
        }

        if (!options.inactive) {
          query += ` AND u.is_active = true`;
        }

        query += ` ORDER BY u.created_at DESC`;

        const result = await getPool().query(query, params);
        await closePool();

        logger.heading('Users');
        logger.info(`Total: ${result.rows.length}`);
        logger.blank();

        if (result.rows.length === 0) {
          logger.info('No users found');
          return;
        }

        const table = createTable([
          'Email',
          'Name',
          'Role',
          'Tenant',
          'Active',
          'Created',
        ]);

        result.rows.forEach((user: any) => {
          table.push([
            user.email,
            `${user.first_name} ${user.last_name}`,
            user.role,
            user.tenant_name || 'N/A',
            formatBoolean(user.is_active),
            formatDate(user.created_at),
          ]);
        });

        console.log(table.toString());
      } catch (error) {
        await closePool();
        logger.error('Failed to list users', error);
        process.exit(1);
      }
    });

  user
    .command('reset-password')
    .description('Reset user password')
    .argument('<email>', 'User email address')
    .action(async (email) => {
      try {
        const config = await getConfig();
        createPool(config);

        // Check if user exists
        const userResult = await getPool().query(
          'SELECT id, email, first_name, last_name FROM users WHERE email = $1',
          [email]
        );

        if (userResult.rows.length === 0) {
          logger.error(`User not found: ${email}`);
          await closePool();
          process.exit(1);
        }

        const user = userResult.rows[0];
        logger.heading('Reset Password');
        logger.info(`User: ${user.first_name} ${user.last_name} (${user.email})`);
        logger.blank();

        const newPassword = await promptForPassword('New password:');
        const confirmPassword = await promptForPassword('Confirm password:');

        if (newPassword !== confirmPassword) {
          logger.error('Passwords do not match');
          await closePool();
          process.exit(1);
        }

        if (newPassword.length < 8) {
          logger.error('Password must be at least 8 characters');
          await closePool();
          process.exit(1);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await withSpinner('Updating password', async () => {
          await getPool().query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [hashedPassword, user.id]
          );
        });

        await closePool();
        logger.success('Password reset successfully');
      } catch (error) {
        await closePool();
        logger.error('Failed to reset password', error);
        process.exit(1);
      }
    });

  user
    .command('deactivate')
    .description('Deactivate a user')
    .argument('<email>', 'User email address')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (email, options) => {
      try {
        const config = await getConfig();
        createPool(config);

        // Check if user exists
        const userResult = await getPool().query(
          'SELECT id, email, first_name, last_name, is_active FROM users WHERE email = $1',
          [email]
        );

        if (userResult.rows.length === 0) {
          logger.error(`User not found: ${email}`);
          await closePool();
          process.exit(1);
        }

        const user = userResult.rows[0];

        if (!user.is_active) {
          logger.warning('User is already inactive');
          await closePool();
          return;
        }

        logger.heading('Deactivate User');
        logger.info(`User: ${user.first_name} ${user.last_name} (${user.email})`);
        logger.blank();

        if (!options.force) {
          const confirmed = await confirmAction(
            'Are you sure you want to deactivate this user?',
            false
          );
          if (!confirmed) {
            logger.warning('Deactivation cancelled');
            await closePool();
            return;
          }
        }

        await withSpinner('Deactivating user', async () => {
          await getPool().query(
            'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
            [user.id]
          );
        });

        await closePool();
        logger.success('User deactivated successfully');
      } catch (error) {
        await closePool();
        logger.error('Failed to deactivate user', error);
        process.exit(1);
      }
    });

  user
    .command('activate')
    .description('Activate a user')
    .argument('<email>', 'User email address')
    .action(async (email) => {
      try {
        const config = await getConfig();
        createPool(config);

        const userResult = await getPool().query(
          'SELECT id, email, first_name, last_name, is_active FROM users WHERE email = $1',
          [email]
        );

        if (userResult.rows.length === 0) {
          logger.error(`User not found: ${email}`);
          await closePool();
          process.exit(1);
        }

        const user = userResult.rows[0];

        if (user.is_active) {
          logger.warning('User is already active');
          await closePool();
          return;
        }

        await withSpinner('Activating user', async () => {
          await getPool().query(
            'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1',
            [user.id]
          );
        });

        await closePool();
        logger.success('User activated successfully');
      } catch (error) {
        await closePool();
        logger.error('Failed to activate user', error);
        process.exit(1);
      }
    });

  return user;
}
