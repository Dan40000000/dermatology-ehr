import { pool } from '../db/pool';
import { randomUUID } from 'crypto';
import { createAuditLog } from './audit';
import { logger } from '../lib/logger';

interface WaitlistEntry {
  id: string;
  tenant_id: string;
  patient_id: string;
  provider_id: string | null;
  appointment_type_id: string | null;
  location_id: string | null;
  preferred_start_date: string | null;
  preferred_end_date: string | null;
  preferred_time_of_day: string;
  preferred_days_of_week: string[] | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: string;
  created_at: string;
}

interface AvailableSlot {
  appointment_id?: string;
  provider_id: string;
  location_id: string;
  appointment_type_id: string;
  scheduled_start: string;
  scheduled_end: string;
  provider_name?: string;
  location_name?: string;
}

interface MatchScore {
  waitlistEntry: WaitlistEntry;
  score: number;
  matchDetails: {
    providerMatch: boolean;
    locationMatch: boolean;
    appointmentTypeMatch: boolean;
    timeOfDayMatch: boolean;
    dayOfWeekMatch: boolean;
    dateRangeMatch: boolean;
  };
}

export class WaitlistAutoFillService {
  private static HOLD_DURATION_HOURS = 24;

  // Scoring weights (higher = more important)
  private static WEIGHTS = {
    PROVIDER: 40,          // Provider match is most important
    APPOINTMENT_TYPE: 25,  // Type of appointment
    LOCATION: 20,          // Location preference
    TIME_OF_DAY: 10,       // Time of day preference
    DAY_OF_WEEK: 5,        // Day of week preference
  };

  // Priority multipliers
  private static PRIORITY_MULTIPLIERS = {
    urgent: 2.0,
    high: 1.5,
    normal: 1.0,
    low: 0.75,
  };

  /**
   * Find matching waitlist entries for an available slot
   */
  async findMatchingWaitlistEntries(
    tenantId: string,
    slot: AvailableSlot
  ): Promise<MatchScore[]> {
    try {
      const slotStart = new Date(slot.scheduled_start);
      const slotDate = slotStart.toISOString().split('T')[0];
      const slotDay = slotStart.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const slotHour = slotStart.getHours();

      // Determine time of day
      let slotTimeOfDay = 'any';
      if (slotHour >= 6 && slotHour < 12) {
        slotTimeOfDay = 'morning';
      } else if (slotHour >= 12 && slotHour < 17) {
        slotTimeOfDay = 'afternoon';
      } else if (slotHour >= 17 && slotHour < 20) {
        slotTimeOfDay = 'evening';
      }

      // Query active waitlist entries
      const query = `
        SELECT
          w.id,
          w.tenant_id,
          w.patient_id,
          w.provider_id,
          w.appointment_type_id,
          w.location_id,
          w.preferred_start_date,
          w.preferred_end_date,
          w.preferred_time_of_day,
          w.preferred_days_of_week,
          w.priority,
          w.status,
          w.created_at
        FROM waitlist w
        WHERE w.tenant_id = $1
          AND w.status = 'active'
          AND (w.preferred_start_date IS NULL OR w.preferred_start_date <= $2)
          AND (w.preferred_end_date IS NULL OR w.preferred_end_date >= $2)
          -- Exclude patients who already have active holds
          AND NOT EXISTS (
            SELECT 1 FROM waitlist_holds wh
            WHERE wh.waitlist_id = w.id
              AND wh.status = 'active'
              AND wh.hold_until > NOW()
          )
        ORDER BY w.created_at ASC
      `;

      const result = await pool.query(query, [tenantId, slotDate]);
      const waitlistEntries: WaitlistEntry[] = result.rows;

      // Score each waitlist entry
      const matchScores: MatchScore[] = waitlistEntries
        .map(entry => this.scoreWaitlistEntry(entry, slot, slotTimeOfDay, slotDay))
        .filter(match => match.score > 0) // Only include entries with some match
        .sort((a, b) => b.score - a.score); // Sort by score (highest first)

      return matchScores;
    } catch (error: any) {
      logger.error('Error finding matching waitlist entries', {
        error: error.message,
        tenantId,
        slot,
      });
      throw error;
    }
  }

  /**
   * Score a waitlist entry against an available slot
   */
  private scoreWaitlistEntry(
    entry: WaitlistEntry,
    slot: AvailableSlot,
    slotTimeOfDay: string,
    slotDay: string
  ): MatchScore {
    const matchDetails = {
      providerMatch: false,
      locationMatch: false,
      appointmentTypeMatch: false,
      timeOfDayMatch: false,
      dayOfWeekMatch: false,
      dateRangeMatch: true, // Already filtered in query
    };

    let score = 0;

    // Provider match (highest weight)
    if (entry.provider_id) {
      if (entry.provider_id === slot.provider_id) {
        matchDetails.providerMatch = true;
        score += WaitlistAutoFillService.WEIGHTS.PROVIDER;
      } else {
        // If specific provider requested but doesn't match, score is 0
        return { waitlistEntry: entry, score: 0, matchDetails };
      }
    } else {
      // No provider preference - give partial credit
      matchDetails.providerMatch = true;
      score += WaitlistAutoFillService.WEIGHTS.PROVIDER * 0.5;
    }

    // Appointment type match
    if (entry.appointment_type_id) {
      if (entry.appointment_type_id === slot.appointment_type_id) {
        matchDetails.appointmentTypeMatch = true;
        score += WaitlistAutoFillService.WEIGHTS.APPOINTMENT_TYPE;
      } else {
        // Type mismatch is a dealbreaker
        return { waitlistEntry: entry, score: 0, matchDetails };
      }
    } else {
      // No type preference - give partial credit
      matchDetails.appointmentTypeMatch = true;
      score += WaitlistAutoFillService.WEIGHTS.APPOINTMENT_TYPE * 0.5;
    }

    // Location match
    if (entry.location_id) {
      if (entry.location_id === slot.location_id) {
        matchDetails.locationMatch = true;
        score += WaitlistAutoFillService.WEIGHTS.LOCATION;
      } else {
        // Location preference not met - reduce score but don't eliminate
        score -= WaitlistAutoFillService.WEIGHTS.LOCATION * 0.5;
      }
    } else {
      // No location preference - give partial credit
      matchDetails.locationMatch = true;
      score += WaitlistAutoFillService.WEIGHTS.LOCATION * 0.5;
    }

    // Time of day match
    if (entry.preferred_time_of_day && entry.preferred_time_of_day !== 'any') {
      if (entry.preferred_time_of_day === slotTimeOfDay) {
        matchDetails.timeOfDayMatch = true;
        score += WaitlistAutoFillService.WEIGHTS.TIME_OF_DAY;
      }
    } else {
      // No time preference or 'any' - give partial credit
      matchDetails.timeOfDayMatch = true;
      score += WaitlistAutoFillService.WEIGHTS.TIME_OF_DAY * 0.5;
    }

    // Day of week match
    if (entry.preferred_days_of_week && entry.preferred_days_of_week.length > 0) {
      const preferredDaysLower = entry.preferred_days_of_week.map(d => d.toLowerCase());
      if (preferredDaysLower.includes(slotDay)) {
        matchDetails.dayOfWeekMatch = true;
        score += WaitlistAutoFillService.WEIGHTS.DAY_OF_WEEK;
      }
    } else {
      // No day preference - give partial credit
      matchDetails.dayOfWeekMatch = true;
      score += WaitlistAutoFillService.WEIGHTS.DAY_OF_WEEK * 0.5;
    }

    // Apply priority multiplier
    const priorityMultiplier = WaitlistAutoFillService.PRIORITY_MULTIPLIERS[entry.priority];
    score *= priorityMultiplier;

    // Bonus for earlier created date (FIFO within same score)
    const daysWaiting = (Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.min(daysWaiting * 0.1, 5); // Max 5 points bonus for waiting

    return {
      waitlistEntry: entry,
      score: Math.round(score * 100) / 100, // Round to 2 decimals
      matchDetails,
    };
  }

  /**
   * Create a hold for a waitlist entry
   */
  async createWaitlistHold(
    tenantId: string,
    waitlistId: string,
    slot: AvailableSlot,
    notificationMethod?: string
  ): Promise<string> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if waitlist entry is still active
      const waitlistCheck = await client.query(
        `SELECT id, status, patient_id FROM waitlist
         WHERE id = $1 AND tenant_id = $2 AND status = 'active' FOR UPDATE`,
        [waitlistId, tenantId]
      );

      if (waitlistCheck.rows.length === 0) {
        throw new Error('Waitlist entry not found or no longer active');
      }

      const patientId = waitlistCheck.rows[0].patient_id;

      // Check for existing active holds
      const existingHold = await client.query(
        `SELECT id FROM waitlist_holds
         WHERE waitlist_id = $1 AND status = 'active' AND hold_until > NOW()`,
        [waitlistId]
      );

      if (existingHold.rows.length > 0) {
        throw new Error('Waitlist entry already has an active hold');
      }

      // Create the hold
      const holdId = randomUUID();
      const holdUntil = new Date();
      holdUntil.setHours(holdUntil.getHours() + WaitlistAutoFillService.HOLD_DURATION_HOURS);

      await client.query(
        `INSERT INTO waitlist_holds (
          id, tenant_id, waitlist_id, appointment_slot_start, appointment_slot_end,
          provider_id, location_id, hold_until, status, notification_sent_at, notification_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          holdId,
          tenantId,
          waitlistId,
          slot.scheduled_start,
          slot.scheduled_end,
          slot.provider_id,
          slot.location_id,
          holdUntil.toISOString(),
          'active',
          notificationMethod ? new Date().toISOString() : null,
          notificationMethod || null,
        ]
      );

      // Update waitlist entry status to 'matched'
      await client.query(
        `UPDATE waitlist
         SET status = 'matched',
             updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [waitlistId, tenantId]
      );

      // Audit log without PHI
      await createAuditLog({
        tenantId,
        userId: 'system',
        action: 'waitlist_hold_created',
        resourceType: 'waitlist_hold',
        resourceId: holdId,
        metadata: {
          waitlistId,
          slotStart: slot.scheduled_start,
          slotEnd: slot.scheduled_end,
          holdUntil: holdUntil.toISOString(),
          providerId: slot.provider_id,
          locationId: slot.location_id,
        },
        severity: 'info',
        status: 'success',
      });

      await client.query('COMMIT');

      logger.info('Waitlist hold created', {
        tenantId,
        holdId,
        waitlistId,
        patientId,
        slotStart: slot.scheduled_start,
        holdUntil: holdUntil.toISOString(),
      });

      return holdId;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Error creating waitlist hold', {
        error: error.message,
        tenantId,
        waitlistId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process appointment cancellation and find matches
   */
  async processAppointmentCancellation(
    tenantId: string,
    appointmentId: string,
    maxMatches: number = 5
  ): Promise<{ holdId: string; waitlistId: string; patientId: string; score: number }[]> {
    try {
      // Get appointment details
      const apptResult = await pool.query(
        `SELECT
          a.id,
          a.provider_id,
          a.location_id,
          a.appointment_type_id,
          a.scheduled_start,
          a.scheduled_end,
          p.full_name as provider_name,
          l.name as location_name
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
        appointment_id: appointmentId,
        provider_id: appointment.provider_id,
        location_id: appointment.location_id,
        appointment_type_id: appointment.appointment_type_id,
        scheduled_start: appointment.scheduled_start,
        scheduled_end: appointment.scheduled_end,
        provider_name: appointment.provider_name,
        location_name: appointment.location_name,
      };

      // Find matching waitlist entries
      const matches = await this.findMatchingWaitlistEntries(tenantId, slot);

      if (matches.length === 0) {
        logger.info('No waitlist matches found for cancelled appointment', {
          tenantId,
          appointmentId,
        });
        return [];
      }

      // Create holds for top matches (up to maxMatches)
      const createdHolds: { holdId: string; waitlistId: string; patientId: string; score: number }[] = [];
      const topMatches = matches.slice(0, maxMatches);

      for (const match of topMatches) {
        try {
          // Get patient_id for the response
          const waitlistResult = await pool.query(
            'SELECT patient_id FROM waitlist WHERE id = $1',
            [match.waitlistEntry.id]
          );

          if (waitlistResult.rows.length === 0) {
            continue;
          }

          const patientId = waitlistResult.rows[0].patient_id;

          const holdId = await this.createWaitlistHold(
            tenantId,
            match.waitlistEntry.id,
            slot,
            'auto' // Indicate this was auto-created
          );

          createdHolds.push({
            holdId,
            waitlistId: match.waitlistEntry.id,
            patientId,
            score: match.score,
          });

          logger.info('Waitlist match created', {
            tenantId,
            appointmentId,
            waitlistId: match.waitlistEntry.id,
            patientId,
            score: match.score,
            matchDetails: match.matchDetails,
          });
        } catch (error: any) {
          logger.error('Failed to create hold for waitlist match', {
            error: error.message,
            tenantId,
            waitlistId: match.waitlistEntry.id,
          });
          // Continue with next match
        }
      }

      // Audit log for the overall matching process
      await createAuditLog({
        tenantId,
        userId: 'system',
        action: 'waitlist_auto_fill_processed',
        resourceType: 'appointment',
        resourceId: appointmentId,
        metadata: {
          totalMatches: matches.length,
          holdsCreated: createdHolds.length,
          topScores: matches.slice(0, 5).map(m => m.score),
        },
        severity: 'info',
        status: 'success',
      });

      return createdHolds;
    } catch (error: any) {
      logger.error('Error processing appointment cancellation for waitlist', {
        error: error.message,
        tenantId,
        appointmentId,
      });
      throw error;
    }
  }

  /**
   * Expire holds that have passed their hold_until time
   */
  async expireOldHolds(tenantId?: string): Promise<number> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Find expired holds
      const expiredHoldsQuery = tenantId
        ? `SELECT id, waitlist_id, tenant_id FROM waitlist_holds
           WHERE status = 'active' AND hold_until <= NOW() AND tenant_id = $1`
        : `SELECT id, waitlist_id, tenant_id FROM waitlist_holds
           WHERE status = 'active' AND hold_until <= NOW()`;

      const params = tenantId ? [tenantId] : [];
      const expiredHolds = await client.query(expiredHoldsQuery, params);

      if (expiredHolds.rows.length === 0) {
        await client.query('COMMIT');
        return 0;
      }

      // Expire the holds
      const holdIds = expiredHolds.rows.map((h: any) => h.id);
      await client.query(
        `UPDATE waitlist_holds
         SET status = 'expired'
         WHERE id = ANY($1::text[])`,
        [holdIds]
      );

      // Return waitlist entries to 'active' status if no other active holds
      for (const hold of expiredHolds.rows) {
        const otherActiveHolds = await client.query(
          `SELECT id FROM waitlist_holds
           WHERE waitlist_id = $1 AND status = 'active' AND hold_until > NOW()`,
          [hold.waitlist_id]
        );

        if (otherActiveHolds.rows.length === 0) {
          await client.query(
            `UPDATE waitlist
             SET status = 'active', updated_at = NOW()
             WHERE id = $1 AND status = 'matched'`,
            [hold.waitlist_id]
          );
        }
      }

      // Audit log for batch expiration
      await createAuditLog({
        tenantId: tenantId || 'system',
        userId: 'system',
        action: 'waitlist_holds_expired',
        resourceType: 'waitlist_hold',
        metadata: {
          expiredCount: expiredHolds.rows.length,
          holdIds,
        },
        severity: 'info',
        status: 'success',
      });

      await client.query('COMMIT');

      logger.info('Expired old waitlist holds', {
        tenantId,
        count: expiredHolds.rows.length,
      });

      return expiredHolds.rows.length;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Error expiring old holds', {
        error: error.message,
        tenantId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Background worker that runs periodically to expire holds
   */
  async startExpirationWorker(intervalMinutes: number = 15): Promise<NodeJS.Timeout> {
    logger.info('Starting waitlist hold expiration worker', {
      intervalMinutes,
    });

    const intervalMs = intervalMinutes * 60 * 1000;

    // Run immediately on startup
    this.expireOldHolds().catch(error => {
      logger.error('Error in initial hold expiration', { error: error.message });
    });

    // Then run periodically
    const interval = setInterval(async () => {
      try {
        const expiredCount = await this.expireOldHolds();
        if (expiredCount > 0) {
          logger.info('Periodic hold expiration completed', { expiredCount });
        }
      } catch (error: any) {
        logger.error('Error in periodic hold expiration', { error: error.message });
      }
    }, intervalMs);

    return interval;
  }

  /**
   * Get statistics about waitlist auto-fill performance
   */
  async getStats(tenantId: string, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const params: any[] = [tenantId];
      let dateFilter = '';

      if (startDate) {
        params.push(startDate.toISOString());
        dateFilter += ` AND wh.created_at >= $${params.length}`;
      }

      if (endDate) {
        params.push(endDate.toISOString());
        dateFilter += ` AND wh.created_at <= $${params.length}`;
      }

      const query = `
        SELECT
          COUNT(*) FILTER (WHERE wh.status = 'active') as active_holds,
          COUNT(*) FILTER (WHERE wh.status = 'accepted') as accepted_holds,
          COUNT(*) FILTER (WHERE wh.status = 'expired') as expired_holds,
          COUNT(*) FILTER (WHERE wh.status = 'cancelled') as cancelled_holds,
          COUNT(*) as total_holds,
          ROUND(AVG(CASE
            WHEN wh.status = 'accepted'
            THEN EXTRACT(EPOCH FROM (wh.updated_at - wh.created_at)) / 3600
          END), 2) as avg_accept_time_hours
        FROM waitlist_holds wh
        WHERE wh.tenant_id = $1 ${dateFilter}
      `;

      const result = await pool.query(query, params);
      return result.rows[0];
    } catch (error: any) {
      logger.error('Error getting waitlist auto-fill stats', {
        error: error.message,
        tenantId,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const waitlistAutoFillService = new WaitlistAutoFillService();
