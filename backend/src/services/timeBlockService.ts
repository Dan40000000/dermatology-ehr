import { pool } from "../db/pool";

/**
 * Recurrence Pattern Interface
 * Example: { pattern: 'weekly', days: [1, 3, 5], until: '2026-06-01' }
 * Pattern types: daily, weekly, biweekly, monthly
 * Days: 0=Sunday, 1=Monday, ..., 6=Saturday (for weekly/biweekly)
 */
export interface RecurrencePattern {
  pattern: "daily" | "weekly" | "biweekly" | "monthly";
  days?: number[]; // For weekly/biweekly: days of week (0-6)
  dayOfMonth?: number; // For monthly: day of month (1-31)
  until?: string; // End date in ISO format
}

export interface TimeBlockInstance {
  startTime: Date;
  endTime: Date;
}

/**
 * Expands a recurring time block into individual instances
 * @param startTime - Initial start time
 * @param endTime - Initial end time
 * @param pattern - Recurrence pattern object
 * @param maxInstances - Maximum number of instances to generate (default 100)
 * @returns Array of time block instances
 */
export function expandRecurrence(
  startTime: Date,
  endTime: Date,
  pattern: RecurrencePattern,
  maxInstances: number = 100
): TimeBlockInstance[] {
  const instances: TimeBlockInstance[] = [];
  const duration = endTime.getTime() - startTime.getTime();

  let currentDate = new Date(startTime);
  const endDate = pattern.until ? new Date(pattern.until) : new Date(startTime.getTime() + 365 * 24 * 60 * 60 * 1000); // Default 1 year

  let count = 0;

  while (currentDate <= endDate && count < maxInstances) {
    let shouldInclude = false;

    switch (pattern.pattern) {
      case "daily":
        shouldInclude = true;
        break;

      case "weekly":
        if (pattern.days && pattern.days.includes(currentDate.getDay())) {
          shouldInclude = true;
        }
        break;

      case "biweekly":
        const weeksDiff = Math.floor((currentDate.getTime() - startTime.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weeksDiff % 2 === 0 && pattern.days && pattern.days.includes(currentDate.getDay())) {
          shouldInclude = true;
        }
        break;

      case "monthly":
        if (pattern.dayOfMonth && currentDate.getDate() === pattern.dayOfMonth) {
          shouldInclude = true;
        } else if (!pattern.dayOfMonth && currentDate.getDate() === startTime.getDate()) {
          shouldInclude = true;
        }
        break;
    }

    if (shouldInclude) {
      instances.push({
        startTime: new Date(currentDate),
        endTime: new Date(currentDate.getTime() + duration),
      });
      count++;
    }

    // Increment date based on pattern
    switch (pattern.pattern) {
      case "daily":
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case "weekly":
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case "biweekly":
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case "monthly":
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
    }
  }

  return instances;
}

/**
 * Checks for conflicts with existing time blocks
 */
export async function hasTimeBlockConflict(
  tenantId: string,
  providerId: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM time_blocks
     WHERE tenant_id = $1
       AND provider_id = $2
       AND status = 'active'
       AND id != $3
       AND tstzrange(start_time, end_time, '[)') && tstzrange($4::timestamptz, $5::timestamptz, '[)')
     LIMIT 1`,
    [tenantId, providerId, excludeId || "00000000-0000-0000-0000-000000000000", startTime, endTime]
  );
  return (result.rowCount || 0) > 0;
}

/**
 * Checks for conflicts with existing appointments
 */
export async function hasAppointmentConflict(
  tenantId: string,
  providerId: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM appointments
     WHERE tenant_id = $1
       AND provider_id = $2
       AND status NOT IN ('cancelled', 'no_show')
       AND tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
     LIMIT 1`,
    [tenantId, providerId, startTime, endTime]
  );
  return (result.rowCount || 0) > 0;
}

/**
 * Checks for any scheduling conflicts (both time blocks and appointments)
 */
export async function hasSchedulingConflict(
  tenantId: string,
  providerId: string,
  startTime: string,
  endTime: string,
  excludeTimeBlockId?: string
): Promise<{ hasConflict: boolean; conflictType?: "time_block" | "appointment" }> {
  // Check time block conflicts first
  const blockConflict = await hasTimeBlockConflict(tenantId, providerId, startTime, endTime, excludeTimeBlockId);
  if (blockConflict) {
    return { hasConflict: true, conflictType: "time_block" };
  }

  // Check appointment conflicts
  const apptConflict = await hasAppointmentConflict(tenantId, providerId, startTime, endTime);
  if (apptConflict) {
    return { hasConflict: true, conflictType: "appointment" };
  }

  return { hasConflict: false };
}

/**
 * Parse recurrence pattern from JSON string or object
 */
export function parseRecurrencePattern(pattern: string | null): RecurrencePattern | null {
  if (!pattern) return null;

  try {
    if (typeof pattern === "string") {
      return JSON.parse(pattern) as RecurrencePattern;
    }
    return pattern as RecurrencePattern;
  } catch (err) {
    return null;
  }
}

/**
 * Get expanded time block instances for a date range
 * Useful for calendar views to show all occurrences of recurring blocks
 */
export async function getExpandedTimeBlocks(
  tenantId: string,
  providerId: string | null,
  locationId: string | null,
  startDate: Date,
  endDate: Date
): Promise<TimeBlockInstance[]> {
  let query = `
    SELECT id, start_time, end_time, is_recurring, recurrence_pattern, recurrence_end_date
    FROM time_blocks
    WHERE tenant_id = $1
      AND status = 'active'
      AND (
        (NOT is_recurring AND start_time >= $2 AND end_time <= $3)
        OR (is_recurring AND (recurrence_end_date IS NULL OR recurrence_end_date >= $2))
      )
  `;

  const values: any[] = [tenantId, startDate, endDate];
  let paramCount = 3;

  if (providerId) {
    paramCount++;
    query += ` AND provider_id = $${paramCount}`;
    values.push(providerId);
  }

  if (locationId) {
    paramCount++;
    query += ` AND location_id = $${paramCount}`;
    values.push(locationId);
  }

  const result = await pool.query(query, values);

  const instances: TimeBlockInstance[] = [];

  for (const row of result.rows) {
    if (row.is_recurring && row.recurrence_pattern) {
      const pattern = parseRecurrencePattern(row.recurrence_pattern);
      if (pattern) {
        const expanded = expandRecurrence(
          new Date(row.start_time),
          new Date(row.end_time),
          pattern,
          365 // Max 1 year of instances
        );

        // Filter to requested date range
        const filtered = expanded.filter(
          (inst) => inst.startTime >= startDate && inst.endTime <= endDate
        );
        instances.push(...filtered);
      }
    } else {
      instances.push({
        startTime: new Date(row.start_time),
        endTime: new Date(row.end_time),
      });
    }
  }

  return instances;
}
