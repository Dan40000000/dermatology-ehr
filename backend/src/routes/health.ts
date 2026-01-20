import { Router } from "express";
import { pool } from "../db/pool";
import os from "os";
import { logger } from "../lib/logger";
import { register } from "../lib/metrics";
import { runSeed } from "../db/seed";
import { runMigrations } from "../db/migrate";

export const healthRouter = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     description: Returns a simple health status of the API.
 *     tags:
 *       - Health
 *     security: []
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check
 *     description: Returns comprehensive health information including database, memory, CPU, and disk status.
 *     tags:
 *       - Health
 *     security: []
 *     responses:
 *       200:
 *         description: Detailed health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                     memory:
 *                       type: object
 *                     diskSpace:
 *                       type: object
 *                     cpu:
 *                       type: object
 *                 responseTime:
 *                   type: number
 *       503:
 *         description: System is unhealthy
 */
healthRouter.get("/detailed", async (_req, res) => {
  const startTime = Date.now();
  const health: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {},
  };

  // Database check
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    health.checks.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart,
    };
  } catch (error: any) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'unhealthy',
      error: error.message,
    };
    logger.error('Health check: Database unhealthy', { error: error.message });
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  health.checks.memory = {
    status: freeMem > totalMem * 0.1 ? 'healthy' : 'warning',
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    systemFree: `${Math.round(freeMem / 1024 / 1024)}MB`,
    systemTotal: `${Math.round(totalMem / 1024 / 1024)}MB`,
  };

  // Disk space check (simplified)
  health.checks.diskSpace = {
    status: 'healthy',
    note: 'Manual monitoring required for production',
  };

  // CPU check
  const cpuUsage = os.loadavg();
  const cpus = os.cpus();
  health.checks.cpu = {
    status: (cpuUsage[0] || 0) < cpus.length ? 'healthy' : 'warning',
    loadAverage1m: cpuUsage[0]?.toFixed(2),
    loadAverage5m: cpuUsage[1]?.toFixed(2),
    loadAverage15m: cpuUsage[2]?.toFixed(2),
    cores: cpus.length,
  };

  health.responseTime = Date.now() - startTime;

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Liveness probe (for k8s/docker)
healthRouter.get("/live", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

// Readiness probe (for k8s/docker)
healthRouter.get("/ready", async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: "ready" });
  } catch (error) {
    res.status(503).json({ status: "not ready" });
  }
});

// Prometheus metrics endpoint
healthRouter.get("/metrics", async (_req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error("Failed to generate metrics", error as Error);
    res.status(500).end(error);
  }
});

// Initialize database (run migrations and seed) - for Railway deployment
healthRouter.post("/init-db", async (req, res) => {
  const secret = req.headers["x-init-secret"];
  const defaultSecret = "derm-init-2026-secure";

  // Simple protection - require a secret in production
  if (process.env.NODE_ENV === "production") {
    const expectedSecret = process.env.INIT_SECRET || defaultSecret;
    if (secret !== expectedSecret) {
      logger.warn("Unauthorized database initialization attempt", { ip: req.ip });
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  try {
    logger.info("Running database migrations...");
    await runMigrations();
    logger.info("Migrations complete");

    logger.info("Running database seed...");
    await runSeed();
    logger.info("Seed complete");

    res.json({ status: "ok", message: "Database initialized successfully" });
  } catch (error: any) {
    logger.error("Database initialization failed", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Sync data from local to production - imports patients and appointments
healthRouter.post("/sync-data", async (req, res) => {
  const secret = req.headers["x-init-secret"];
  const defaultSecret = "derm-init-2026-secure";

  // Require proper authentication in production
  if (process.env.NODE_ENV === "production") {
    const expectedSecret = process.env.INIT_SECRET || defaultSecret;
    if (secret !== expectedSecret) {
      logger.warn("Unauthorized data sync attempt", { ip: req.ip });
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  try {
    const { patients, appointments } = req.body;
    const tenantId = "tenant-demo";

    if (!patients || !appointments) {
      return res.status(400).json({ error: "Missing patients or appointments data" });
    }

    logger.info(`Syncing ${patients.length} patients and ${appointments.length} appointments...`);

    // Clear existing data (in correct order due to foreign keys)
    // Disable FK checks temporarily for clean sync
    await pool.query(`SET session_replication_role = replica`);
    await pool.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM patients WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`SET session_replication_role = DEFAULT`);

    // Insert patients
    for (const p of patients) {
      await pool.query(`
        INSERT INTO patients(id, tenant_id, first_name, last_name, dob, phone, email, address, city, state, zip, insurance, allergies, medications, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          dob = EXCLUDED.dob,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip = EXCLUDED.zip,
          insurance = EXCLUDED.insurance,
          allergies = EXCLUDED.allergies,
          medications = EXCLUDED.medications,
          updated_at = EXCLUDED.updated_at
      `, [
        p.id, tenantId, p.first_name, p.last_name, p.dob, p.phone, p.email,
        p.address, p.city, p.state, p.zip, p.insurance, p.allergies, p.medications,
        p.created_at || new Date().toISOString(), p.updated_at || new Date().toISOString()
      ]);
    }

    // Insert appointments (only core columns)
    for (const a of appointments) {
      await pool.query(`
        INSERT INTO appointments(id, tenant_id, patient_id, provider_id, location_id, appointment_type_id, scheduled_start, scheduled_end, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          patient_id = EXCLUDED.patient_id,
          provider_id = EXCLUDED.provider_id,
          location_id = EXCLUDED.location_id,
          appointment_type_id = EXCLUDED.appointment_type_id,
          scheduled_start = EXCLUDED.scheduled_start,
          scheduled_end = EXCLUDED.scheduled_end,
          status = EXCLUDED.status
      `, [
        a.id, tenantId, a.patient_id, a.provider_id, a.location_id, a.appointment_type_id,
        a.scheduled_start, a.scheduled_end, a.status
      ]);
    }

    logger.info("Sync complete");
    res.json({ status: "ok", message: `Synced ${patients.length} patients and ${appointments.length} appointments` });
  } catch (error: any) {
    logger.error("Sync failed", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});
