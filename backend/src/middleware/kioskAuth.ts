import { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool";
import { env } from "../config/env";

export interface KioskRequest extends Request {
  kiosk?: {
    id: string;
    tenantId: string;
    locationId: string;
    deviceName: string;
    deviceCode: string;
  };
}

/**
 * Middleware to authenticate kiosk devices using device code
 * Kiosks authenticate via X-Kiosk-Code header instead of JWT
 */
export async function requireKioskAuth(req: KioskRequest, res: Response, next: NextFunction) {
  const deviceCode = req.header("X-Kiosk-Code");
  const tenantId = req.header(env.tenantHeader);

  if (!deviceCode) {
    return res.status(401).json({ error: "Missing kiosk device code" });
  }

  if (!tenantId) {
    return res.status(401).json({ error: "Missing tenant ID" });
  }

  try {
    // Verify device code and get device info
    const result = await pool.query(
      `SELECT id, tenant_id as "tenantId", location_id as "locationId",
              device_name as "deviceName", device_code as "deviceCode", is_active as "isActive"
       FROM kiosk_devices
       WHERE device_code = $1 AND tenant_id = $2`,
      [deviceCode, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid kiosk device code" });
    }

    const device = result.rows[0];

    if (!device.isActive) {
      return res.status(403).json({ error: "Kiosk device is inactive" });
    }

    // Update last heartbeat
    await pool.query(
      `UPDATE kiosk_devices
       SET last_heartbeat = CURRENT_TIMESTAMP,
           ip_address = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.ip, device.id]
    );

    // Attach kiosk info to request
    req.kiosk = {
      id: device.id,
      tenantId: device.tenantId,
      locationId: device.locationId,
      deviceName: device.deviceName,
      deviceCode: device.deviceCode,
    };

    return next();
  } catch (err) {
    console.error("Kiosk auth error:", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Optional middleware for endpoints that support both kiosk and regular auth
 */
export async function optionalKioskAuth(req: KioskRequest, res: Response, next: NextFunction) {
  const deviceCode = req.header("X-Kiosk-Code");

  if (!deviceCode) {
    // No kiosk code provided, skip kiosk auth
    return next();
  }

  // Try to authenticate as kiosk
  return requireKioskAuth(req, res, next);
}
