import { Router } from "express";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import {
  fetchStoredDowntimePacket,
  generateAndStoreDowntimePacket,
} from "../services/downtimePacketService";

export const downtimePacketsRouter = Router();

const DOWNTIME_PACKET_ROLES = ["admin", "front_desk", "ma", "scheduler", "manager", "provider"] as const;

function normalizePacketDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date().toISOString().slice(0, 10);
  }
  return value;
}

downtimePacketsRouter.post(
  "/generate",
  requireAuth,
  requireRoles([...DOWNTIME_PACKET_ROLES]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const locationId = typeof req.body?.locationId === "string" ? req.body.locationId : "";
    const date = normalizePacketDate(req.body?.date);

    if (!locationId) {
      return res.status(400).json({ error: "locationId is required" });
    }

    try {
      const { packet, changed } = await generateAndStoreDowntimePacket(
        tenantId,
        locationId,
        date,
        req.body?.automatic ? "automatic" : "manual",
      );
      return res.json({
        packet,
        changed,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Location not found") {
        return res.status(404).json({ error: "Location not found" });
      }
      throw error;
    }
  },
);

downtimePacketsRouter.get(
  "/ready",
  requireAuth,
  requireRoles([...DOWNTIME_PACKET_ROLES]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const locationId = typeof req.query?.locationId === "string" ? req.query.locationId : "";
    const date = normalizePacketDate(req.query?.date);

    if (!locationId) {
      return res.status(400).json({ error: "locationId is required" });
    }

    const packet = await fetchStoredDowntimePacket(tenantId, locationId, date);
    if (!packet) {
      return res.status(404).json({ error: "Downtime packet not ready" });
    }

    return res.json({ packet });
  },
);

downtimePacketsRouter.post(
  "/device-status",
  requireAuth,
  requireRoles([...DOWNTIME_PACKET_ROLES]),
  async (req: AuthedRequest, res) => {
    const tenantId = req.user!.tenantId;
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    const reports = Array.isArray(req.body?.reports) ? req.body.reports : [];

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId is required" });
    }

    const updatedLocationIds: string[] = [];

    if (reports.length === 0) {
      const result = await pool.query(
        `UPDATE locations
         SET downtime_primary_device_last_seen_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1
           AND downtime_primary_device_id = $2
         RETURNING id`,
        [tenantId, deviceId],
      );
      result.rows.forEach((row) => {
        if (typeof row.id === "string") {
          updatedLocationIds.push(row.id);
        }
      });
      return res.json({ updatedLocationIds });
    }

    for (const rawReport of reports) {
      if (!rawReport || typeof rawReport !== "object") continue;
      const report = rawReport as Record<string, unknown>;
      const locationId = typeof report.locationId === "string" ? report.locationId.trim() : "";
      const lastPacketSavedAt =
        typeof report.lastPacketSavedAt === "string" && report.lastPacketSavedAt.trim()
          ? report.lastPacketSavedAt.trim()
          : null;
      const lastPacketDate =
        typeof report.lastPacketDate === "string" && report.lastPacketDate.trim()
          ? report.lastPacketDate.trim()
          : null;

      if (!locationId) continue;

      const result = await pool.query(
        `UPDATE locations
         SET downtime_primary_device_last_seen_at = CURRENT_TIMESTAMP,
             downtime_primary_device_last_packet_saved_at = COALESCE($1::timestamptz, downtime_primary_device_last_packet_saved_at),
             downtime_primary_device_last_packet_date = COALESCE($2::date, downtime_primary_device_last_packet_date)
         WHERE tenant_id = $3
           AND id = $4
           AND downtime_primary_device_id = $5
         RETURNING id`,
        [lastPacketSavedAt, lastPacketDate, tenantId, locationId, deviceId],
      );

      if (result.rowCount && typeof result.rows[0]?.id === "string") {
        updatedLocationIds.push(result.rows[0].id);
      }
    }

    return res.json({ updatedLocationIds });
  },
);
