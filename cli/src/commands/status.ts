import { Command } from 'commander';
import fetch from 'node-fetch';
import {
  getConfig,
  createPool,
  closePool,
  getPool,
  testConnection,
  logger,
  createTable,
  formatBytes,
  formatDuration,
  formatStatus,
} from '../utils';
import { SystemStats, HealthStatus } from '../types';

export function registerStatusCommands(program: Command) {
  program
    .command('status')
    .description('Check system health status')
    .option('-v, --verbose', 'Show detailed status information')
    .action(async (options) => {
      try {
        const config = await getConfig();
        logger.heading('System Health Status');
        logger.blank();

        const health: HealthStatus = {
          status: 'healthy',
          database: {
            connected: false,
            responseTime: 0,
          },
          checks: [],
        };

        // Test database connection
        logger.info('Checking database connection...');
        const dbStart = Date.now();
        const dbConnected = await testConnection(config);
        const dbTime = Date.now() - dbStart;

        health.database.connected = dbConnected;
        health.database.responseTime = dbTime;

        health.checks.push({
          name: 'Database Connection',
          status: dbConnected ? 'pass' : 'fail',
          message: dbConnected
            ? `Connected in ${dbTime}ms`
            : 'Failed to connect to database',
        });

        // Test API (if URL provided)
        if (config.apiUrl) {
          logger.info('Checking API endpoint...');
          try {
            const apiStart = Date.now();
            const response = await fetch(`${config.apiUrl}/health`, {
              method: 'GET',
              timeout: 5000,
            });
            const apiTime = Date.now() - apiStart;

            health.api = {
              reachable: response.ok,
              responseTime: apiTime,
            };

            health.checks.push({
              name: 'API Health',
              status: response.ok ? 'pass' : 'fail',
              message: response.ok
                ? `API responding in ${apiTime}ms`
                : `API returned ${response.status}`,
            });
          } catch (error) {
            health.api = {
              reachable: false,
              responseTime: 0,
            };
            health.checks.push({
              name: 'API Health',
              status: 'fail',
              message: 'API not reachable',
            });
          }
        }

        // Additional database checks
        if (dbConnected) {
          createPool(config);

          try {
            // Check table counts
            const tableCheck = await getPool().query(`
              SELECT COUNT(*) as count
              FROM information_schema.tables
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            `);

            health.checks.push({
              name: 'Database Tables',
              status: tableCheck.rows[0].count > 0 ? 'pass' : 'fail',
              message: `${tableCheck.rows[0].count} tables found`,
            });

            // Check database size
            const sizeCheck = await getPool().query(`
              SELECT pg_size_pretty(pg_database_size(current_database())) as size
            `);

            health.checks.push({
              name: 'Database Size',
              status: 'pass',
              message: sizeCheck.rows[0].size,
            });

            // Check active connections
            const connCheck = await getPool().query(`
              SELECT count(*) as count
              FROM pg_stat_activity
              WHERE datname = current_database()
            `);

            health.checks.push({
              name: 'Active Connections',
              status: 'pass',
              message: `${connCheck.rows[0].count} active connections`,
            });
          } catch (error) {
            logger.debug('Error performing extended checks: ' + error);
          }

          await closePool();
        }

        // Determine overall status
        const failedChecks = health.checks.filter((c) => c.status === 'fail');
        if (failedChecks.length > 0) {
          health.status = failedChecks.length === health.checks.length ? 'unhealthy' : 'degraded';
        }

        // Display results
        logger.blank();
        logger.subheading(`Overall Status: ${formatStatus(health.status)}`);
        logger.blank();

        const table = createTable(['Check', 'Status', 'Details']);

        health.checks.forEach((check) => {
          table.push([
            check.name,
            formatStatus(check.status),
            check.message || '',
          ]);
        });

        console.log(table.toString());

        logger.blank();
        logger.info(`Environment: ${config.environment}`);
        logger.info(`Database: ${config.database.host}:${config.database.port}/${config.database.database}`);
        if (config.apiUrl) {
          logger.info(`API URL: ${config.apiUrl}`);
        }

        // Exit with error code if unhealthy
        if (health.status === 'unhealthy') {
          process.exit(1);
        }
      } catch (error) {
        logger.error('Failed to check system status', error);
        process.exit(1);
      }
    });

  program
    .command('stats')
    .description('Show system statistics')
    .action(async () => {
      try {
        const config = await getConfig();
        logger.heading('System Statistics');
        logger.blank();

        createPool(config);

        const stats: Partial<SystemStats> = {};

        // User statistics
        const userStats = await getPool().query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE is_active = true) as active,
            COUNT(*) FILTER (WHERE role = 'admin') as admin_count,
            COUNT(*) FILTER (WHERE role = 'doctor') as doctor_count,
            COUNT(*) FILTER (WHERE role = 'nurse') as nurse_count,
            COUNT(*) FILTER (WHERE role = 'receptionist') as receptionist_count
          FROM users
        `);

        stats.users = {
          total: parseInt(userStats.rows[0].total),
          active: parseInt(userStats.rows[0].active),
          by_role: {
            admin: parseInt(userStats.rows[0].admin_count),
            doctor: parseInt(userStats.rows[0].doctor_count),
            nurse: parseInt(userStats.rows[0].nurse_count),
            receptionist: parseInt(userStats.rows[0].receptionist_count),
          },
        };

        // Patient statistics
        const patientStats = await getPool().query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_this_month
          FROM patients
        `);

        stats.patients = {
          total: parseInt(patientStats.rows[0].total),
          new_this_month: parseInt(patientStats.rows[0].new_this_month),
        };

        // Appointment statistics
        const appointmentStats = await getPool().query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE DATE(scheduled_time) = CURRENT_DATE) as today,
            COUNT(*) FILTER (WHERE scheduled_time >= CURRENT_DATE AND scheduled_time < CURRENT_DATE + INTERVAL '7 days') as this_week,
            COUNT(*) FILTER (WHERE scheduled_time > NOW() AND status = 'scheduled') as upcoming
          FROM appointments
        `);

        stats.appointments = {
          total: parseInt(appointmentStats.rows[0].total),
          today: parseInt(appointmentStats.rows[0].today),
          this_week: parseInt(appointmentStats.rows[0].this_week),
          upcoming: parseInt(appointmentStats.rows[0].upcoming),
        };

        // Tenant statistics
        const tenantStats = await getPool().query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE is_active = true) as active
          FROM tenants
        `);

        stats.tenants = {
          total: parseInt(tenantStats.rows[0].total),
          active: parseInt(tenantStats.rows[0].active),
        };

        // Database statistics
        const dbStats = await getPool().query(`
          SELECT
            pg_size_pretty(pg_database_size(current_database())) as size,
            (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as connections
        `);

        stats.database = {
          size: dbStats.rows[0].size,
          connections: parseInt(dbStats.rows[0].connections),
        };

        await closePool();

        // Display statistics
        logger.subheading('Users');
        logger.info(`Total: ${stats.users!.total}`);
        logger.info(`Active: ${stats.users!.active}`);
        logger.info(`  Admins: ${stats.users!.by_role.admin}`);
        logger.info(`  Doctors: ${stats.users!.by_role.doctor}`);
        logger.info(`  Nurses: ${stats.users!.by_role.nurse}`);
        logger.info(`  Receptionists: ${stats.users!.by_role.receptionist}`);
        logger.blank();

        logger.subheading('Patients');
        logger.info(`Total: ${stats.patients!.total}`);
        logger.info(`New This Month: ${stats.patients!.new_this_month}`);
        logger.blank();

        logger.subheading('Appointments');
        logger.info(`Total: ${stats.appointments!.total}`);
        logger.info(`Today: ${stats.appointments!.today}`);
        logger.info(`This Week: ${stats.appointments!.this_week}`);
        logger.info(`Upcoming: ${stats.appointments!.upcoming}`);
        logger.blank();

        logger.subheading('Tenants');
        logger.info(`Total: ${stats.tenants!.total}`);
        logger.info(`Active: ${stats.tenants!.active}`);
        logger.blank();

        logger.subheading('Database');
        logger.info(`Size: ${stats.database!.size}`);
        logger.info(`Active Connections: ${stats.database!.connections}`);
      } catch (error) {
        await closePool();
        logger.error('Failed to fetch statistics', error);
        process.exit(1);
      }
    });
}
