// Simple startup - run migrations for deploys, then start the server.
import { logger } from './lib/logger';
import { safeErrorCode } from './utils/phiRedaction';

logger.info('Starting server', {
  environment: process.env.NODE_ENV || 'unknown',
  portConfigured: Boolean(process.env.PORT),
  databaseConfigured: Boolean(process.env.DATABASE_URL),
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { errorCode: safeErrorCode(error) });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { errorCode: safeErrorCode(reason) });
  process.exit(1);
});

function shouldRunMigrationsOnStartup(): boolean {
  if (String(process.env.RUN_MIGRATIONS_ON_STARTUP || "").toLowerCase() === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT);
}

async function start() {
  logger.info('Loading application index');
  if (shouldRunMigrationsOnStartup()) {
    logger.info('Running startup database migrations');
    const { runMigrations } = require("./db/migrate");
    await runMigrations();
    logger.info('Startup database migrations complete');
  }
  require("./index");
  logger.info('Application index loaded');
}

start().catch((error) => {
  logger.error('Startup failed', { errorCode: safeErrorCode(error) });
  process.exit(1);
});
