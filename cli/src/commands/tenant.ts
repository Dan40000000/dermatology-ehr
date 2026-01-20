import { Command } from 'commander';
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
  promptForTenantDetails,
} from '../utils';

export function registerTenantCommands(program: Command) {
  const tenant = program.command('tenant').description('Tenant management commands');

  tenant
    .command('create')
    .description('Create a new tenant')
    .action(async () => {
      try {
        const config = await getConfig();
        logger.heading('Create New Tenant');
        logger.blank();

        // Get tenant details interactively
        const details = await promptForTenantDetails();

        createPool(config);

        // Check if slug already exists
        const existingResult = await getPool().query(
          'SELECT id FROM tenants WHERE slug = $1',
          [details.slug]
        );

        if (existingResult.rows.length > 0) {
          logger.error(`A tenant with slug "${details.slug}" already exists`);
          await closePool();
          process.exit(1);
        }

        // Create tenant
        let tenantId: string = '';
        await withSpinner('Creating tenant', async () => {
          const result = await getPool().query(
            `INSERT INTO tenants (name, slug, plan, is_active, settings)
             VALUES ($1, $2, $3, true, '{}')
             RETURNING id`,
            [details.name, details.slug, details.plan]
          );
          tenantId = result.rows[0].id;
        });

        await closePool();

        logger.success('Tenant created successfully');
        logger.info(`ID: ${tenantId}`);
        logger.info(`Name: ${details.name}`);
        logger.info(`Slug: ${details.slug}`);
        logger.info(`Plan: ${details.plan}`);
      } catch (error: any) {
        await closePool();
        if (error.code === '23505') {
          logger.error('A tenant with this name or slug already exists');
        } else {
          logger.error('Failed to create tenant', error);
        }
        process.exit(1);
      }
    });

  tenant
    .command('list')
    .description('List all tenants')
    .option('--inactive', 'Include inactive tenants')
    .action(async (options) => {
      try {
        const config = await getConfig();
        createPool(config);

        let query = `
          SELECT t.id, t.name, t.slug, t.plan, t.is_active, t.created_at,
                 COUNT(DISTINCT u.id) as user_count,
                 COUNT(DISTINCT p.id) as patient_count
          FROM tenants t
          LEFT JOIN users u ON t.id = u.tenant_id AND u.is_active = true
          LEFT JOIN patients p ON t.id = p.tenant_id
          WHERE 1=1
        `;

        if (!options.inactive) {
          query += ` AND t.is_active = true`;
        }

        query += ` GROUP BY t.id, t.name, t.slug, t.plan, t.is_active, t.created_at
                   ORDER BY t.created_at DESC`;

        const result = await getPool().query(query);
        await closePool();

        logger.heading('Tenants');
        logger.info(`Total: ${result.rows.length}`);
        logger.blank();

        if (result.rows.length === 0) {
          logger.info('No tenants found');
          return;
        }

        const table = createTable([
          'ID',
          'Name',
          'Slug',
          'Plan',
          'Users',
          'Patients',
          'Active',
          'Created',
        ]);

        result.rows.forEach((tenant: any) => {
          table.push([
            tenant.id.substring(0, 8) + '...',
            tenant.name,
            tenant.slug,
            tenant.plan,
            tenant.user_count,
            tenant.patient_count,
            formatBoolean(tenant.is_active),
            formatDate(tenant.created_at),
          ]);
        });

        console.log(table.toString());
      } catch (error) {
        await closePool();
        logger.error('Failed to list tenants', error);
        process.exit(1);
      }
    });

  tenant
    .command('info')
    .description('Show detailed tenant information')
    .argument('<id>', 'Tenant ID or slug')
    .action(async (identifier) => {
      try {
        const config = await getConfig();
        createPool(config);

        // Try to find tenant by ID or slug
        const tenantResult = await getPool().query(
          'SELECT * FROM tenants WHERE id = $1 OR slug = $1',
          [identifier]
        );

        if (tenantResult.rows.length === 0) {
          logger.error(`Tenant not found: ${identifier}`);
          await closePool();
          process.exit(1);
        }

        const tenant = tenantResult.rows[0];

        // Get user count
        const userResult = await getPool().query(
          'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND is_active = true',
          [tenant.id]
        );

        // Get patient count
        const patientResult = await getPool().query(
          'SELECT COUNT(*) as count FROM patients WHERE tenant_id = $1',
          [tenant.id]
        );

        // Get appointment count
        const appointmentResult = await getPool().query(
          'SELECT COUNT(*) as count FROM appointments WHERE tenant_id = $1',
          [tenant.id]
        );

        // Get users by role
        const roleResult = await getPool().query(
          `SELECT role, COUNT(*) as count
           FROM users
           WHERE tenant_id = $1 AND is_active = true
           GROUP BY role
           ORDER BY role`,
          [tenant.id]
        );

        await closePool();

        logger.heading('Tenant Information');
        logger.blank();

        logger.subheading('Basic Information');
        logger.info(`ID: ${tenant.id}`);
        logger.info(`Name: ${tenant.name}`);
        logger.info(`Slug: ${tenant.slug}`);
        logger.info(`Plan: ${tenant.plan}`);
        logger.info(`Status: ${tenant.is_active ? 'Active' : 'Inactive'}`);
        logger.info(`Created: ${formatDate(tenant.created_at)}`);
        logger.blank();

        logger.subheading('Statistics');
        logger.info(`Total Users: ${userResult.rows[0].count}`);
        logger.info(`Total Patients: ${patientResult.rows[0].count}`);
        logger.info(`Total Appointments: ${appointmentResult.rows[0].count}`);
        logger.blank();

        if (roleResult.rows.length > 0) {
          logger.subheading('Users by Role');
          roleResult.rows.forEach((row: any) => {
            logger.info(`  ${row.role}: ${row.count}`);
          });
          logger.blank();
        }

        if (tenant.settings && Object.keys(tenant.settings).length > 0) {
          logger.subheading('Settings');
          logger.info(JSON.stringify(tenant.settings, null, 2));
        }
      } catch (error) {
        await closePool();
        logger.error('Failed to get tenant info', error);
        process.exit(1);
      }
    });

  tenant
    .command('deactivate')
    .description('Deactivate a tenant')
    .argument('<id>', 'Tenant ID or slug')
    .action(async (identifier) => {
      try {
        const config = await getConfig();
        createPool(config);

        const result = await getPool().query(
          'UPDATE tenants SET is_active = false, updated_at = NOW() WHERE id = $1 OR slug = $1 RETURNING name',
          [identifier]
        );

        await closePool();

        if (result.rows.length === 0) {
          logger.error(`Tenant not found: ${identifier}`);
          process.exit(1);
        }

        logger.success(`Tenant "${result.rows[0].name}" deactivated successfully`);
      } catch (error) {
        await closePool();
        logger.error('Failed to deactivate tenant', error);
        process.exit(1);
      }
    });

  tenant
    .command('activate')
    .description('Activate a tenant')
    .argument('<id>', 'Tenant ID or slug')
    .action(async (identifier) => {
      try {
        const config = await getConfig();
        createPool(config);

        const result = await getPool().query(
          'UPDATE tenants SET is_active = true, updated_at = NOW() WHERE id = $1 OR slug = $1 RETURNING name',
          [identifier]
        );

        await closePool();

        if (result.rows.length === 0) {
          logger.error(`Tenant not found: ${identifier}`);
          process.exit(1);
        }

        logger.success(`Tenant "${result.rows[0].name}" activated successfully`);
      } catch (error) {
        await closePool();
        logger.error('Failed to activate tenant', error);
        process.exit(1);
      }
    });

  return tenant;
}
