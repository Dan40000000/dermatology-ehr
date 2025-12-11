import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { pool } from "../db/pool";
import crypto from "crypto";

export interface PatientPortalUser {
  accountId: string;
  patientId: string;
  tenantId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface PatientPortalRequest extends Request {
  patient?: PatientPortalUser;
}

/**
 * Patient portal authentication middleware
 * Validates session token, checks account status, enforces inactivity timeout
 * Logs all access for HIPAA audit compliance
 */
export async function requirePatientAuth(
  req: PatientPortalRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  const token = header.replace("Bearer ", "").trim();
  const tenantId = req.header(env.tenantHeader);

  if (!tenantId) {
    return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, env.jwtSecret) as {
      accountId: string;
      patientId: string;
      tenantId: string;
      email: string;
    };

    // Validate tenant match
    if (decoded.tenantId !== tenantId) {
      return res.status(403).json({ error: "Invalid tenant" });
    }

    // Check session in database
    const sessionResult = await pool.query(
      `SELECT s.id, s.account_id, s.expires_at, s.last_activity,
              a.is_active, a.locked_until, a.patient_id, a.email,
              p.first_name, p.last_name
       FROM patient_portal_sessions s
       JOIN patient_portal_accounts a ON s.account_id = a.id
       JOIN patients p ON a.patient_id = p.id
       WHERE s.session_token = $1 AND a.tenant_id = $2`,
      [token, tenantId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    const session = sessionResult.rows[0];

    // Check if account is active
    if (!session.is_active) {
      return res.status(403).json({ error: "Account is inactive" });
    }

    // Check if account is locked
    if (session.locked_until && new Date(session.locked_until) > new Date()) {
      return res.status(403).json({
        error: "Account is temporarily locked due to failed login attempts",
        lockedUntil: session.locked_until
      });
    }

    // Check session expiration
    if (new Date(session.expires_at) < new Date()) {
      // Delete expired session
      await pool.query(
        `DELETE FROM patient_portal_sessions WHERE id = $1`,
        [session.id]
      );
      return res.status(401).json({ error: "Session expired" });
    }

    // Check inactivity timeout (30 minutes)
    const lastActivity = new Date(session.last_activity);
    const inactivityTimeout = 30 * 60 * 1000; // 30 minutes in milliseconds
    if (new Date().getTime() - lastActivity.getTime() > inactivityTimeout) {
      // Delete inactive session
      await pool.query(
        `DELETE FROM patient_portal_sessions WHERE id = $1`,
        [session.id]
      );
      return res.status(401).json({ error: "Session expired due to inactivity" });
    }

    // Update last activity timestamp
    await pool.query(
      `UPDATE patient_portal_sessions
       SET last_activity = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [session.id]
    );

    // Set patient user info on request
    req.patient = {
      accountId: session.account_id,
      patientId: session.patient_id,
      tenantId: tenantId,
      email: session.email,
      firstName: session.first_name,
      lastName: session.last_name
    };

    // Log access for HIPAA audit
    await logPatientAccess(
      tenantId,
      session.patient_id,
      session.account_id,
      req.method,
      req.path,
      req.ip,
      req.get('user-agent')
    );

    return next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Invalid authentication token" });
    }
    console.error("Patient auth error:", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Log patient portal access for HIPAA audit trail
 */
async function logPatientAccess(
  tenantId: string,
  patientId: string,
  accountId: string,
  method: string,
  path: string,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    const auditId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO audit_log (
        id, tenant_id, user_id, action, resource_type, resource_id,
        ip_address, user_agent, metadata, severity, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        auditId,
        tenantId,
        accountId, // Use account ID as user_id for patient portal
        `patient_portal_${method.toLowerCase()}`,
        'patient_portal_access',
        patientId,
        ipAddress || null,
        userAgent || null,
        JSON.stringify({ path, timestamp: new Date().toISOString() }),
        'info',
        'success'
      ]
    );
  } catch (err) {
    // Don't fail request if audit logging fails, but log the error
    console.error("Failed to log patient portal access:", err);
  }
}

/**
 * Clean up expired sessions (can be run periodically)
 */
export async function cleanupExpiredSessions() {
  try {
    const result = await pool.query(
      `DELETE FROM patient_portal_sessions
       WHERE expires_at < CURRENT_TIMESTAMP
       OR (CURRENT_TIMESTAMP - last_activity) > INTERVAL '30 minutes'
       RETURNING id`
    );
    console.log(`Cleaned up ${result.rowCount} expired patient portal sessions`);
  } catch (err) {
    console.error("Failed to cleanup expired sessions:", err);
  }
}
