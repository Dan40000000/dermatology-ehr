import { Router } from "express";
import { pool } from "../db/pool";
import os from "os";
import { logger } from "../lib/logger";
import { register } from "../lib/metrics";

export const healthRouter = Router();

// Basic health check
healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

// Detailed health check with dependencies
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
