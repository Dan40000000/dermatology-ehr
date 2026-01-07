const { pool } = require('./src/db/pool');
const { cacheService } = require('./src/services/cacheService');
const { logger, auditLogger } = require('./src/lib/logger');

module.exports = async () => {
  try {
    if (cacheService && typeof cacheService.stopCleanup === 'function') {
      cacheService.stopCleanup();
    }
  } catch (error) {
    // Best-effort cleanup for tests.
  }

  try {
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  } catch (error) {
    // Best-effort cleanup for tests.
  }

  try {
    if (logger && typeof logger.close === 'function') {
      logger.close();
    }
    if (auditLogger && typeof auditLogger.close === 'function') {
      auditLogger.close();
    }
  } catch (error) {
    // Best-effort cleanup for tests.
  }
};
