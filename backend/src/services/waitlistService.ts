import { pool } from '../db/pool';
import { randomUUID } from 'crypto';
import { createAuditLog } from './audit';
import { logger } from '../lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface WaitlistPreferences {
  providerId?: string;
  appointmentTypeId?: string;
  locationId?: string;
  preferredDates?: Array<{ date: string; weight?: number }>;
  preferredTimes?: {
    morning?: boolean;
    afternoon?: boolean;
    evening?: boolean;
  };
  preferredDaysOfWeek?: string[];
  flexibilityDays?: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  reason?: string;
  notes?: string;
}

export interface WaitlistEntry {
  id: string;
  tenantId: string;
  patientId: string;
  providerId: string | null;
  appointmentTypeId: string | null;
  locationId: string | null;
  preferredDates: Array<{ date: string; weight?: number }>;
  preferredTimes: { morning: boolean; afternoon: boolean; evening: boolean };
  preferredDaysOfWeek: string[];
  flexibilityDays: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'active' | 'matched' | 'notified' | 'scheduled' | 'cancelled' | 'expired';
  reason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  notifiedAt: string | null;
  scheduledAt: string | null;
  scheduledAppointmentId: string | null;
}

export interface AvailableSlot {
  providerId: string;
  locationId: string;
  appointmentTypeId: string;
  scheduledStart: string;
  scheduledEnd: string;
  providerName?: string;
  locationName?: string;
}

export interface WaitlistMatch {
  entryId: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  score: number;
  matchDetails: {
    providerMatch: boolean;
    appointmentTypeMatch: boolean;
    locationMatch: boolean;
    timeOfDayMatch: boolean;
    dayOfWeekMatch: boolean;
    priorityMultiplier: number;
    waitingDays: number;
  };
}

export interface WaitlistNotification {
  id: string;
  entryId: string;
  slotOffered: AvailableSlot;
  offeredAt: string;
  expiresAt: string;
  response: 'pending' | 'accepted' | 'declined' | 'expired' | 'no_response';
  respondedAt: string | null;
  notificationChannel: string;
}

export interface WaitlistFilters {
  status?: string;
  priority?: string;
  providerId?: string;
  patientId?: string;
  appointmentTypeId?: string;
  limit?: number;
  offset?: number;
}

export interface WaitlistStats {
  totalActive: number;
  totalMatched: number;
  totalNotified: number;
  totalScheduled: number;
  urgentCount: number;
  highPriorityCount: number;
  averageWaitDays: number;
  filledThisWeek: number;
  filledThisMonth: number;
  conversionRate: number;
}

// ============================================================================
// WAITLIST SERVICE
// ============================================================================

/**
 * Add a patient to the waitlist
 */
export async function addToWaitlist(
  tenantId: string,
  patientId: string,
  preferences: WaitlistPreferences,
  createdBy?: string
): Promise<WaitlistEntry> {
  const id = randomUUID();

  const result = await pool.query<WaitlistEntry>(
    `INSERT INTO waitlist_entries (
      id, tenant_id, patient_id, provider_id, appointment_type_id, location_id,
      preferred_dates, preferred_times, preferred_days_of_week,
      flexibility_days, priority, reason, notes, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING
      id,
      tenant_id as "tenantId",
      patient_id as "patientId",
      provider_id as "providerId",
      appointment_type_id as "appointmentTypeId",
      location_id as "locationId",
      preferred_dates as "preferredDates",
      preferred_times as "preferredTimes",
      preferred_days_of_week as "preferredDaysOfWeek",
      flexibility_days as "flexibilityDays",
      priority,
      status,
      reason,
      notes,
      created_at as "createdAt",
      updated_at as "updatedAt",
      notified_at as "notifiedAt",
      scheduled_at as "scheduledAt",
      scheduled_appointment_id as "scheduledAppointmentId"`,
    [
      id,
      tenantId,
      patientId,
      preferences.providerId || null,
      preferences.appointmentTypeId || null,
      preferences.locationId || null,
      JSON.stringify(preferences.preferredDates || []),
      JSON.stringify(preferences.preferredTimes || { morning: true, afternoon: true, evening: false }),
      JSON.stringify(preferences.preferredDaysOfWeek || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']),
      preferences.flexibilityDays || 7,
      preferences.priority || 'normal',
      preferences.reason || null,
      preferences.notes || null,
      createdBy || null,
    ]
  );

  const entry = result.rows[0]!;

  await createAuditLog({
    tenantId,
    userId: createdBy || 'system',
    action: 'waitlist_entry_created',
    resourceType: 'waitlist_entry',
    resourceId: id,
    metadata: {
      patientId,
      priority: preferences.priority || 'normal',
    },
    severity: 'info',
    status: 'success',
  });

  logger.info('Patient added to waitlist', {
    tenantId,
    entryId: id,
    patientId,
    priority: preferences.priority || 'normal',
  });

  return entry;
}

/**
 * Remove an entry from the waitlist
 */
export async function removeFromWaitlist(
  tenantId: string,
  entryId: string,
  userId?: string,
  reason?: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE waitlist_entries
     SET status = 'cancelled',
         notes = COALESCE(notes || E'\\n', '') || $3
     WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('cancelled', 'scheduled')
     RETURNING id`,
    [entryId, tenantId, reason ? `Cancelled: ${reason}` : 'Cancelled by user']
  );

  if (result.rows.length === 0) {
    return false;
  }

  await createAuditLog({
    tenantId,
    userId: userId || 'system',
    action: 'waitlist_entry_removed',
    resourceType: 'waitlist_entry',
    resourceId: entryId,
    metadata: { reason },
    severity: 'info',
    status: 'success',
  });

  logger.info('Waitlist entry removed', { tenantId, entryId, reason });

  return true;
}

/**
 * Get waitlist entries with filters
 */
export async function getWaitlist(
  tenantId: string,
  filters: WaitlistFilters = {}
): Promise<{ entries: WaitlistEntry[]; total: number }> {
  const conditions: string[] = ['we.tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.status) {
    paramCount++;
    conditions.push(`we.status = $${paramCount}`);
    params.push(filters.status);
  } else {
    conditions.push(`we.status = 'active'`);
  }

  if (filters.priority) {
    paramCount++;
    conditions.push(`we.priority = $${paramCount}`);
    params.push(filters.priority);
  }

  if (filters.providerId) {
    paramCount++;
    conditions.push(`we.provider_id = $${paramCount}`);
    params.push(filters.providerId);
  }

  if (filters.patientId) {
    paramCount++;
    conditions.push(`we.patient_id = $${paramCount}`);
    params.push(filters.patientId);
  }

  if (filters.appointmentTypeId) {
    paramCount++;
    conditions.push(`we.appointment_type_id = $${paramCount}`);
    params.push(filters.appointmentTypeId);
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM waitlist_entries we WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  // Get entries with pagination
  let query = `
    SELECT
      we.id,
      we.tenant_id as "tenantId",
      we.patient_id as "patientId",
      we.provider_id as "providerId",
      we.appointment_type_id as "appointmentTypeId",
      we.location_id as "locationId",
      we.preferred_dates as "preferredDates",
      we.preferred_times as "preferredTimes",
      we.preferred_days_of_week as "preferredDaysOfWeek",
      we.flexibility_days as "flexibilityDays",
      we.priority,
      we.status,
      we.reason,
      we.notes,
      we.created_at as "createdAt",
      we.updated_at as "updatedAt",
      we.notified_at as "notifiedAt",
      we.scheduled_at as "scheduledAt",
      we.scheduled_appointment_id as "scheduledAppointmentId",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      p.phone as "patientPhone",
      p.email as "patientEmail",
      pr.full_name as "providerName",
      at.name as "appointmentTypeName",
      l.name as "locationName"
    FROM waitlist_entries we
    JOIN patients p ON we.patient_id = p.id
    LEFT JOIN providers pr ON we.provider_id = pr.id
    LEFT JOIN appointment_types at ON we.appointment_type_id = at.id
    LEFT JOIN locations l ON we.location_id = l.id
    WHERE ${whereClause}
    ORDER BY
      CASE we.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
      END,
      we.created_at ASC
  `;

  if (filters.limit) {
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(filters.limit);
  }

  if (filters.offset) {
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(filters.offset);
  }

  const result = await pool.query(query, params);

  return {
    entries: result.rows,
    total,
  };
}

/**
 * Get a single waitlist entry by ID
 */
export async function getWaitlistEntry(
  tenantId: string,
  entryId: string
): Promise<WaitlistEntry | null> {
  const result = await pool.query<WaitlistEntry>(
    `SELECT
      we.id,
      we.tenant_id as "tenantId",
      we.patient_id as "patientId",
      we.provider_id as "providerId",
      we.appointment_type_id as "appointmentTypeId",
      we.location_id as "locationId",
      we.preferred_dates as "preferredDates",
      we.preferred_times as "preferredTimes",
      we.preferred_days_of_week as "preferredDaysOfWeek",
      we.flexibility_days as "flexibilityDays",
      we.priority,
      we.status,
      we.reason,
      we.notes,
      we.created_at as "createdAt",
      we.updated_at as "updatedAt",
      we.notified_at as "notifiedAt",
      we.scheduled_at as "scheduledAt",
      we.scheduled_appointment_id as "scheduledAppointmentId",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      p.phone as "patientPhone",
      p.email as "patientEmail",
      pr.full_name as "providerName",
      at.name as "appointmentTypeName",
      l.name as "locationName"
    FROM waitlist_entries we
    JOIN patients p ON we.patient_id = p.id
    LEFT JOIN providers pr ON we.provider_id = pr.id
    LEFT JOIN appointment_types at ON we.appointment_type_id = at.id
    LEFT JOIN locations l ON we.location_id = l.id
    WHERE we.id = $1 AND we.tenant_id = $2`,
    [entryId, tenantId]
  );

  return result.rows[0] || null;
}

/**
 * Find matching waitlist patients for an available slot
 */
export async function matchWaitlistToSlot(
  tenantId: string,
  slot: AvailableSlot,
  maxMatches: number = 10
): Promise<WaitlistMatch[]> {
  const slotStart = new Date(slot.scheduledStart);
  const slotHour = slotStart.getHours();
  const slotDayOfWeek = slotStart.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  // Determine time of day
  let slotTimeOfDay: 'morning' | 'afternoon' | 'evening' = 'afternoon';
  if (slotHour >= 6 && slotHour < 12) {
    slotTimeOfDay = 'morning';
  } else if (slotHour >= 12 && slotHour < 17) {
    slotTimeOfDay = 'afternoon';
  } else {
    slotTimeOfDay = 'evening';
  }

  // Query active waitlist entries that could match
  const result = await pool.query(
    `SELECT
      we.id as "entryId",
      we.patient_id as "patientId",
      we.provider_id as "providerId",
      we.appointment_type_id as "appointmentTypeId",
      we.location_id as "locationId",
      we.preferred_times as "preferredTimes",
      we.preferred_days_of_week as "preferredDaysOfWeek",
      we.priority,
      we.created_at as "createdAt",
      p.first_name as "patientFirstName",
      p.last_name as "patientLastName",
      p.phone as "patientPhone",
      p.email as "patientEmail"
    FROM waitlist_entries we
    JOIN patients p ON we.patient_id = p.id
    WHERE we.tenant_id = $1
      AND we.status = 'active'
      -- Provider match: either no preference or exact match
      AND (we.provider_id IS NULL OR we.provider_id = $2)
      -- Appointment type match: either no preference or exact match
      AND (we.appointment_type_id IS NULL OR we.appointment_type_id = $3)
      -- Exclude patients with active notifications
      AND NOT EXISTS (
        SELECT 1 FROM waitlist_notifications wn
        WHERE wn.entry_id = we.id
          AND wn.response = 'pending'
          AND wn.expires_at > NOW()
      )
    ORDER BY we.created_at ASC`,
    [tenantId, slot.providerId, slot.appointmentTypeId]
  );

  // Score each entry
  const matches: WaitlistMatch[] = [];

  for (const row of result.rows) {
    let score = 10; // Base score
    const matchDetails = {
      providerMatch: false,
      appointmentTypeMatch: false,
      locationMatch: false,
      timeOfDayMatch: false,
      dayOfWeekMatch: false,
      priorityMultiplier: 1,
      waitingDays: 0,
    };

    // Provider match scoring
    if (row.providerId === null) {
      score += 20; // Flexible on provider
      matchDetails.providerMatch = true;
    } else if (row.providerId === slot.providerId) {
      score += 40; // Exact provider match
      matchDetails.providerMatch = true;
    }

    // Appointment type scoring
    if (row.appointmentTypeId === null) {
      score += 15;
      matchDetails.appointmentTypeMatch = true;
    } else if (row.appointmentTypeId === slot.appointmentTypeId) {
      score += 25;
      matchDetails.appointmentTypeMatch = true;
    }

    // Location scoring
    if (row.locationId === null) {
      score += 10;
      matchDetails.locationMatch = true;
    } else if (row.locationId === slot.locationId) {
      score += 15;
      matchDetails.locationMatch = true;
    } else {
      score -= 5;
    }

    // Time of day preference
    const preferredTimes = row.preferredTimes || {};
    if (preferredTimes[slotTimeOfDay]) {
      score += 10;
      matchDetails.timeOfDayMatch = true;
    }

    // Day of week preference
    const preferredDays: string[] = row.preferredDaysOfWeek || [];
    if (preferredDays.length === 0 || preferredDays.includes(slotDayOfWeek)) {
      score += 5;
      matchDetails.dayOfWeekMatch = true;
    }

    // Priority multiplier
    const priorityMultipliers: Record<string, number> = {
      urgent: 2.0,
      high: 1.5,
      normal: 1.0,
      low: 0.75,
    };
    matchDetails.priorityMultiplier = priorityMultipliers[row.priority] || 1;
    score *= matchDetails.priorityMultiplier;

    // Waiting time bonus
    const waitingDays = (Date.now() - new Date(row.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    matchDetails.waitingDays = Math.round(waitingDays);
    score += Math.min(waitingDays * 0.5, 10);

    if (score > 0) {
      matches.push({
        entryId: row.entryId,
        patientId: row.patientId,
        patientName: `${row.patientFirstName} ${row.patientLastName}`,
        patientPhone: row.patientPhone,
        patientEmail: row.patientEmail,
        score: Math.round(score * 100) / 100,
        matchDetails,
      });
    }
  }

  // Sort by score and limit
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, maxMatches);
}

/**
 * Notify a waitlist patient about an available slot
 */
export async function notifyWaitlistPatient(
  tenantId: string,
  entryId: string,
  slot: AvailableSlot,
  expirationHours: number = 24,
  channel: 'sms' | 'email' | 'phone' | 'portal' | 'auto' = 'sms'
): Promise<WaitlistNotification> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if entry is still active
    const entryCheck = await client.query(
      `SELECT id, patient_id, status FROM waitlist_entries
       WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [entryId, tenantId]
    );

    if (entryCheck.rows.length === 0) {
      throw new Error('Waitlist entry not found');
    }

    if (entryCheck.rows[0].status !== 'active') {
      throw new Error('Waitlist entry is not active');
    }

    // Create notification
    const notificationId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);

    await client.query(
      `INSERT INTO waitlist_notifications (
        id, tenant_id, entry_id, slot_offered, expires_at,
        response, notification_channel
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
      [
        notificationId,
        tenantId,
        entryId,
        JSON.stringify(slot),
        expiresAt.toISOString(),
        channel,
      ]
    );

    // Update entry status
    await client.query(
      `UPDATE waitlist_entries
       SET status = 'notified', notified_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [entryId, tenantId]
    );

    await client.query('COMMIT');

    logger.info('Waitlist patient notified', {
      tenantId,
      entryId,
      notificationId,
      channel,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      id: notificationId,
      entryId,
      slotOffered: slot,
      offeredAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      response: 'pending',
      respondedAt: null,
      notificationChannel: channel,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error notifying waitlist patient', {
      error: error.message,
      tenantId,
      entryId,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process a patient's response to a waitlist notification
 */
export async function processWaitlistResponse(
  tenantId: string,
  notificationId: string,
  accepted: boolean,
  responseNotes?: string
): Promise<{ success: boolean; appointmentId?: string; message: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get notification details
    const notificationResult = await client.query(
      `SELECT wn.*, we.patient_id
       FROM waitlist_notifications wn
       JOIN waitlist_entries we ON wn.entry_id = we.id
       WHERE wn.id = $1 AND wn.tenant_id = $2 FOR UPDATE`,
      [notificationId, tenantId]
    );

    if (notificationResult.rows.length === 0) {
      throw new Error('Notification not found');
    }

    const notification = notificationResult.rows[0];

    if (notification.response !== 'pending') {
      throw new Error('Notification already processed');
    }

    if (new Date(notification.expires_at) < new Date()) {
      // Mark as expired
      await client.query(
        `UPDATE waitlist_notifications
         SET response = 'expired', responded_at = NOW()
         WHERE id = $1`,
        [notificationId]
      );
      await client.query('COMMIT');
      return { success: false, message: 'Notification has expired' };
    }

    if (accepted) {
      // Create appointment
      const slot = notification.slot_offered;
      const appointmentId = randomUUID();

      await client.query(
        `INSERT INTO appointments (
          id, tenant_id, patient_id, provider_id, location_id,
          appointment_type_id, scheduled_start, scheduled_end, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')`,
        [
          appointmentId,
          tenantId,
          notification.patient_id,
          slot.providerId,
          slot.locationId,
          slot.appointmentTypeId,
          slot.scheduledStart,
          slot.scheduledEnd,
        ]
      );

      // Update notification
      await client.query(
        `UPDATE waitlist_notifications
         SET response = 'accepted', responded_at = NOW(), response_notes = $3
         WHERE id = $1 AND tenant_id = $2`,
        [notificationId, tenantId, responseNotes]
      );

      // Update waitlist entry
      await client.query(
        `UPDATE waitlist_entries
         SET status = 'scheduled',
             scheduled_at = NOW(),
             scheduled_appointment_id = $3
         WHERE id = $1 AND tenant_id = $2`,
        [notification.entry_id, tenantId, appointmentId]
      );

      await client.query('COMMIT');

      logger.info('Waitlist slot accepted', {
        tenantId,
        notificationId,
        appointmentId,
        patientId: notification.patient_id,
      });

      return {
        success: true,
        appointmentId,
        message: 'Appointment scheduled successfully',
      };
    } else {
      // Declined
      await client.query(
        `UPDATE waitlist_notifications
         SET response = 'declined', responded_at = NOW(), response_notes = $3
         WHERE id = $1 AND tenant_id = $2`,
        [notificationId, tenantId, responseNotes]
      );

      // Return entry to active status
      await client.query(
        `UPDATE waitlist_entries
         SET status = 'active', notified_at = NULL
         WHERE id = $1 AND tenant_id = $2`,
        [notification.entry_id, tenantId]
      );

      await client.query('COMMIT');

      logger.info('Waitlist slot declined', {
        tenantId,
        notificationId,
        patientId: notification.patient_id,
      });

      return {
        success: true,
        message: 'Slot offer declined, patient returned to waitlist',
      };
    }
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error processing waitlist response', {
      error: error.message,
      tenantId,
      notificationId,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Auto-fill a cancelled appointment slot from the waitlist
 */
export async function autoFillCancelledSlot(
  tenantId: string,
  appointmentId: string,
  maxNotifications: number = 3
): Promise<{
  matchesFound: number;
  notificationsSent: number;
  notifications: WaitlistNotification[];
}> {
  // Get appointment details
  const apptResult = await pool.query(
    `SELECT
      a.id,
      a.provider_id as "providerId",
      a.location_id as "locationId",
      a.appointment_type_id as "appointmentTypeId",
      a.scheduled_start as "scheduledStart",
      a.scheduled_end as "scheduledEnd",
      p.full_name as "providerName",
      l.name as "locationName"
    FROM appointments a
    LEFT JOIN providers p ON a.provider_id = p.id
    LEFT JOIN locations l ON a.location_id = l.id
    WHERE a.id = $1 AND a.tenant_id = $2`,
    [appointmentId, tenantId]
  );

  if (apptResult.rows.length === 0) {
    throw new Error('Appointment not found');
  }

  const appointment = apptResult.rows[0];
  const slot: AvailableSlot = {
    providerId: appointment.providerId,
    locationId: appointment.locationId,
    appointmentTypeId: appointment.appointmentTypeId,
    scheduledStart: appointment.scheduledStart,
    scheduledEnd: appointment.scheduledEnd,
    providerName: appointment.providerName,
    locationName: appointment.locationName,
  };

  // Find matching patients
  const matches = await matchWaitlistToSlot(tenantId, slot, maxNotifications);

  if (matches.length === 0) {
    logger.info('No waitlist matches for cancelled appointment', {
      tenantId,
      appointmentId,
    });
    return {
      matchesFound: 0,
      notificationsSent: 0,
      notifications: [],
    };
  }

  // Send notifications to top matches
  const notifications: WaitlistNotification[] = [];
  for (const match of matches) {
    try {
      const notification = await notifyWaitlistPatient(
        tenantId,
        match.entryId,
        slot,
        24, // 24 hour expiration
        'auto'
      );
      notifications.push(notification);
    } catch (error: any) {
      logger.error('Failed to notify waitlist patient', {
        error: error.message,
        tenantId,
        entryId: match.entryId,
      });
    }
  }

  // Audit log
  await createAuditLog({
    tenantId,
    userId: 'system',
    action: 'waitlist_auto_fill_triggered',
    resourceType: 'appointment',
    resourceId: appointmentId,
    metadata: {
      matchesFound: matches.length,
      notificationsSent: notifications.length,
    },
    severity: 'info',
    status: 'success',
  });

  logger.info('Waitlist auto-fill completed', {
    tenantId,
    appointmentId,
    matchesFound: matches.length,
    notificationsSent: notifications.length,
  });

  return {
    matchesFound: matches.length,
    notificationsSent: notifications.length,
    notifications,
  };
}

/**
 * Get waitlist statistics
 */
export async function getWaitlistStats(tenantId: string): Promise<WaitlistStats> {
  const result = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'active') as "totalActive",
      COUNT(*) FILTER (WHERE status = 'matched') as "totalMatched",
      COUNT(*) FILTER (WHERE status = 'notified') as "totalNotified",
      COUNT(*) FILTER (WHERE status = 'scheduled') as "totalScheduled",
      COUNT(*) FILTER (WHERE priority = 'urgent') as "urgentCount",
      COUNT(*) FILTER (WHERE priority = 'high') as "highPriorityCount",
      COALESCE(AVG(
        CASE WHEN status = 'active'
        THEN EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400
        END
      ), 0)::NUMERIC(10,1) as "averageWaitDays",
      COUNT(*) FILTER (
        WHERE status = 'scheduled'
        AND scheduled_at >= NOW() - INTERVAL '7 days'
      ) as "filledThisWeek",
      COUNT(*) FILTER (
        WHERE status = 'scheduled'
        AND scheduled_at >= NOW() - INTERVAL '30 days'
      ) as "filledThisMonth",
      CASE
        WHEN COUNT(*) > 0
        THEN (COUNT(*) FILTER (WHERE status = 'scheduled')::NUMERIC / COUNT(*) * 100)::NUMERIC(5,1)
        ELSE 0
      END as "conversionRate"
    FROM waitlist_entries
    WHERE tenant_id = $1
      AND created_at >= NOW() - INTERVAL '90 days'`,
    [tenantId]
  );

  const stats = result.rows[0];
  return {
    totalActive: parseInt(stats.totalActive || '0', 10),
    totalMatched: parseInt(stats.totalMatched || '0', 10),
    totalNotified: parseInt(stats.totalNotified || '0', 10),
    totalScheduled: parseInt(stats.totalScheduled || '0', 10),
    urgentCount: parseInt(stats.urgentCount || '0', 10),
    highPriorityCount: parseInt(stats.highPriorityCount || '0', 10),
    averageWaitDays: parseFloat(stats.averageWaitDays || '0'),
    filledThisWeek: parseInt(stats.filledThisWeek || '0', 10),
    filledThisMonth: parseInt(stats.filledThisMonth || '0', 10),
    conversionRate: parseFloat(stats.conversionRate || '0'),
  };
}

/**
 * Expire old notifications
 */
export async function expireOldNotifications(tenantId?: string): Promise<number> {
  const query = tenantId
    ? `UPDATE waitlist_notifications
       SET response = 'expired'
       WHERE response = 'pending'
         AND expires_at < NOW()
         AND tenant_id = $1
       RETURNING id`
    : `UPDATE waitlist_notifications
       SET response = 'expired'
       WHERE response = 'pending'
         AND expires_at < NOW()
       RETURNING id`;

  const result = await pool.query(query, tenantId ? [tenantId] : []);

  // Reset associated waitlist entries to active
  if (result.rows.length > 0) {
    const expiredIds = result.rows.map((r: any) => r.id);
    await pool.query(
      `UPDATE waitlist_entries we
       SET status = 'active', notified_at = NULL
       FROM waitlist_notifications wn
       WHERE wn.entry_id = we.id
         AND wn.id = ANY($1::uuid[])
         AND we.status = 'notified'`,
      [expiredIds]
    );
  }

  if (result.rows.length > 0) {
    logger.info('Expired waitlist notifications', {
      tenantId,
      count: result.rows.length,
    });
  }

  return result.rows.length;
}
