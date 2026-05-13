import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { encounterService } from './encounterService';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { sendPatientPaymentReceiptEmail } from './paymentConfirmationService';
import { getDateKeyInTimeZone, getUtcRangeForPracticeDate } from '../lib/practiceTimeZone';
import { getAppointmentCheckoutBalanceCents } from './checkoutBalanceService';

export interface AppointmentWithDetails {
  id: string;
  tenantId: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPhone?: string;
  patientEmail?: string;
  providerId: string;
  providerName: string;
  locationId: string;
  locationName: string;
  appointmentTypeId: string;
  appointmentTypeName: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  arrivedAt?: string;
  roomedAt?: string;
  completedAt?: string;
  // Insurance info
  insuranceVerified?: boolean;
  insurancePlanName?: string;
  copayAmount?: number;
  // Balance info
  outstandingBalance?: number;
  paymentDueCents?: number;
  balanceAge?: number;
  // Wait time
  waitTimeMinutes?: number;
  // Metadata
  createdAt: string;
}

export interface DailyStats {
  totalScheduled: number;
  patientsArrived: number;
  patientsCompleted: number;
  noShows: number;
  collectionsToday: number;
  openSlotsRemaining: number;
  averageWaitTime?: number;
}

export interface WaitingRoomPatient {
  appointmentId: string;
  patientId: string;
  patientName: string;
  providerId: string;
  providerName: string;
  scheduledTime: string;
  arrivedAt: string;
  waitTimeMinutes: number;
  isDelayed: boolean;
}

export interface CheckInCopayOptions {
  collectCopay?: boolean;
  deferCopay?: boolean;
  copayAmountCents?: number;
  collectOutstandingBalance?: boolean;
  outstandingBalanceAmountCents?: number;
  paymentMethod?: 'cash' | 'credit' | 'debit' | 'check';
  notes?: string;
  priorAuthOverrideReason?: string;
  checkedInBy?: string;
}

export interface CheckOutResult {
  status: 'checkout';
  requiresPayment: boolean;
  paymentDueCents: number;
}

export interface CheckInPatientResult {
  encounterId: string;
  copayAmount: number;
  copayAmountCents: number;
  copaySource: 'insurance_profile' | 'none';
  copayDisposition: 'none' | 'collected' | 'deferred';
  copayCollectedAmountCents: number;
  outstandingBalanceCollectedAmountCents?: number;
  totalCollectedAmountCents?: number;
  priorAuthOverrideUsed?: boolean;
  priorAuthStatus?: string;
  eligibilityStatus?: string;
  eligibilityVerifiedAt?: string;
  paymentId?: string;
  paymentReceiptNumber?: string;
  paymentConfirmationEmailSent?: boolean;
  paymentConfirmationEmailAddress?: string;
}

interface OutstandingBillBalance {
  id: string;
  balanceCents: number;
  paidAmountCents: number;
}

export class FrontDeskService {
  private getPracticeDayWindow(date: Date = new Date()): { dateKey: string; startIso: string; endIso: string } {
    const dateKey = getDateKeyInTimeZone(date);
    const { start, end } = getUtcRangeForPracticeDate(dateKey);
    return {
      dateKey,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    };
  }

  private mapAppointmentStatusToFlowStatus(status: string): string | null {
    const mapping: Record<string, string> = {
      checked_in: 'checked_in',
      in_room: 'rooming',
      with_provider: 'with_provider',
      checkout: 'checkout',
      completed: 'completed',
    };
    return mapping[status] || null;
  }

  private getFlowTimestampColumn(flowStatus: string): string | null {
    const mapping: Record<string, string> = {
      checked_in: 'checked_in_at',
      rooming: 'rooming_at',
      with_provider: 'with_provider_at',
      checkout: 'checkout_at',
      completed: 'completed_at',
    };
    return mapping[flowStatus] || null;
  }

  private async upsertPatientFlowStatus(
    client: Pick<PoolClient, 'query'>,
    tenantId: string,
    appointmentId: string,
    appointmentStatus: string
  ): Promise<void> {
    const flowStatus = this.mapAppointmentStatusToFlowStatus(appointmentStatus);
    const timestampColumn = flowStatus ? this.getFlowTimestampColumn(flowStatus) : null;
    if (!flowStatus || !timestampColumn) {
      return;
    }

    await client.query(
      `
      INSERT INTO patient_flow (
        id, tenant_id, appointment_id, patient_id,
        status, status_changed_at, ${timestampColumn},
        assigned_provider_id, created_at, updated_at
      )
      SELECT
        $3, a.tenant_id, a.id, a.patient_id,
        $4, NOW(), NOW(),
        a.provider_id, NOW(), NOW()
      FROM appointments a
      WHERE a.tenant_id = $1
        AND a.id = $2
      ON CONFLICT (tenant_id, appointment_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        status_changed_at = NOW(),
        ${timestampColumn} = COALESCE(patient_flow.${timestampColumn}, NOW()),
        assigned_provider_id = COALESCE(patient_flow.assigned_provider_id, EXCLUDED.assigned_provider_id),
        updated_at = NOW()
      `,
      [tenantId, appointmentId, randomUUID(), flowStatus]
    );
  }

  private async getOutstandingBills(
    client: PoolClient,
    tenantId: string,
    patientId: string
  ): Promise<OutstandingBillBalance[]> {
    const result = await client.query(
      `SELECT
         id,
         COALESCE(balance_cents, 0) AS balance_cents,
         COALESCE(paid_amount_cents, 0) AS paid_amount_cents
       FROM bills
       WHERE tenant_id = $1
         AND patient_id = $2
         AND COALESCE(balance_cents, 0) > 0
         AND status NOT IN ('paid', 'cancelled')
       ORDER BY COALESCE(service_date_start, bill_date, created_at) ASC, created_at ASC`,
      [tenantId, patientId]
    );

    const rows = Array.isArray(result.rows) ? result.rows : [];

    return rows.map((row: { id: string; balance_cents: number | string; paid_amount_cents: number | string }) => ({
      id: row.id,
      balanceCents: Number.parseInt(String(row.balance_cents ?? 0), 10) || 0,
      paidAmountCents: Number.parseInt(String(row.paid_amount_cents ?? 0), 10) || 0,
    }));
  }

  private async applyOutstandingBalancePayment(
    client: PoolClient,
    tenantId: string,
    bills: OutstandingBillBalance[],
    amountCents: number
  ): Promise<number> {
    let remaining = Math.max(0, amountCents);
    let applied = 0;

    for (const bill of bills) {
      if (remaining <= 0) {
        break;
      }

      const appliedToBill = Math.min(remaining, bill.balanceCents);
      if (appliedToBill <= 0) {
        continue;
      }

      const newPaidAmountCents = bill.paidAmountCents + appliedToBill;
      const newBalanceCents = Math.max(0, bill.balanceCents - appliedToBill);
      const newStatus = newBalanceCents === 0 ? 'paid' : 'partial';

      await client.query(
        `UPDATE bills
         SET paid_amount_cents = $1,
             balance_cents = $2,
             status = $3,
             updated_at = NOW()
         WHERE tenant_id = $4 AND id = $5`,
        [newPaidAmountCents, newBalanceCents, newStatus, tenantId, bill.id]
      );

      remaining -= appliedToBill;
      applied += appliedToBill;
    }

    return applied;
  }

  /**
   * Get today's schedule with all relevant details
   */
  async getTodaySchedule(tenantId: string, providerId?: string, statusFilter?: string): Promise<AppointmentWithDetails[]> {
    try {
      const dayWindow = this.getPracticeDayWindow();

      let query = `
        SELECT
          a.id,
          a.tenant_id,
          a.patient_id,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.phone as patient_phone,
          p.email as patient_email,
          a.provider_id,
          prov.full_name as provider_name,
          a.location_id,
          l.name as location_name,
          a.appointment_type_id,
          at.name as appointment_type_name,
          a.scheduled_start,
          a.scheduled_end,
          a.status,
          a.arrived_at,
          a.roomed_at,
          a.completed_at,
          a.created_at,
          -- Insurance info
          CASE
            WHEN (
              to_jsonb(p)->'insurance_details' IS NOT NULL
              AND (to_jsonb(p)->'insurance_details'->>'primary' IS NOT NULL)
              AND (to_jsonb(p)->'insurance_details'->'primary'->>'eligibilityStatus' = 'Active')
            )
              OR COALESCE(
                NULLIF(to_jsonb(p)->>'insurance_plan_name', ''),
                NULLIF(to_jsonb(p)->>'insurance', '')
              ) IS NOT NULL
            THEN true
            ELSE false
          END as insurance_verified,
          COALESCE(
            NULLIF(to_jsonb(p)->'insurance_details'->'primary'->>'planName', ''),
            NULLIF(to_jsonb(p)->>'insurance_plan_name', ''),
            NULLIF(to_jsonb(p)->>'insurance', '')
          ) as insurance_plan_name,
          CASE
            WHEN NULLIF(to_jsonb(p)->'insurance_details'->'primary'->>'copayAmount', '') IS NOT NULL
            THEN (to_jsonb(p)->'insurance_details'->'primary'->>'copayAmount')::numeric
            ELSE 0
          END as copay_amount,
          -- Outstanding balance (placeholder - would come from billing system)
          COALESCE(
            (SELECT SUM(
                COALESCE(
                  NULLIF(to_jsonb(b)->>'balance_cents', '')::numeric,
                  NULLIF(to_jsonb(b)->>'amount_cents', '')::numeric,
                  0
                )
              ) / 100.0
             FROM bills b
             WHERE b.patient_id = p.id
               AND b.tenant_id = a.tenant_id
               AND b.status NOT IN ('paid', 'written_off', 'cancelled')
            ), 0
          ) as outstanding_balance,
          COALESCE(
            (
              SELECT SUM(c.amount_cents)
              FROM encounters e
              INNER JOIN charges c ON c.encounter_id = e.id AND c.tenant_id = e.tenant_id
              WHERE e.tenant_id = a.tenant_id
                AND e.appointment_id = a.id
                AND c.status = 'self_pay'
            ),
            0
          ) as payment_due_cents
        FROM appointments a
        INNER JOIN patients p ON a.patient_id = p.id
        INNER JOIN providers prov ON a.provider_id = prov.id
        INNER JOIN locations l ON a.location_id = l.id
        INNER JOIN appointment_types at ON a.appointment_type_id = at.id
        WHERE a.tenant_id = $1
          AND a.scheduled_start >= $2::timestamptz
          AND a.scheduled_start < $3::timestamptz
      `;

      const params: any[] = [tenantId, dayWindow.startIso, dayWindow.endIso];
      let paramCount = 3;

      if (providerId) {
        paramCount++;
        query += ` AND a.provider_id = $${paramCount}`;
        params.push(providerId);
      }

      if (statusFilter) {
        paramCount++;
        query += ` AND a.status = $${paramCount}`;
        params.push(statusFilter);
      }

      query += ` ORDER BY a.scheduled_start ASC`;

      const result = await pool.query(query, params);

      // Calculate wait times for patients who have arrived
      const appointments = result.rows.map((row: any) => {
        const apt: AppointmentWithDetails = {
          id: row.id,
          tenantId: row.tenant_id,
          patientId: row.patient_id,
          patientFirstName: row.patient_first_name,
          patientLastName: row.patient_last_name,
          patientPhone: row.patient_phone,
          patientEmail: row.patient_email,
          providerId: row.provider_id,
          providerName: row.provider_name,
          locationId: row.location_id,
          locationName: row.location_name,
          appointmentTypeId: row.appointment_type_id,
          appointmentTypeName: row.appointment_type_name,
          scheduledStart: row.scheduled_start,
          scheduledEnd: row.scheduled_end,
          status: row.status,
          arrivedAt: row.arrived_at,
          roomedAt: row.roomed_at,
          completedAt: row.completed_at,
          insuranceVerified: row.insurance_verified,
          insurancePlanName: row.insurance_plan_name,
          copayAmount: row.copay_amount ? parseFloat(row.copay_amount) : undefined,
          outstandingBalance: row.outstanding_balance ? parseFloat(row.outstanding_balance) : 0,
          paymentDueCents: row.payment_due_cents ? Number(row.payment_due_cents) : 0,
          createdAt: row.created_at,
        };

        // Calculate wait time if patient has arrived
        if (row.arrived_at && row.status === 'checked_in') {
          const arrivedTime = new Date(row.arrived_at);
          const now = new Date();
          apt.waitTimeMinutes = Math.floor((now.getTime() - arrivedTime.getTime()) / (1000 * 60));
        }

        return apt;
      });

      return appointments;
    } catch (error) {
      logger.error('Error getting today schedule:', error);
      throw error;
    }
  }

  /**
   * Get daily statistics
   */
  async getDailyStats(tenantId: string): Promise<DailyStats> {
    try {
      const dayWindow = this.getPracticeDayWindow();

      // Get appointment counts
      const appointmentStats = await pool.query(
        `
        SELECT
          COUNT(*) as total_scheduled,
          COUNT(*) FILTER (WHERE status IN ('checked_in', 'in_room', 'with_provider')) as patients_arrived,
          COUNT(*) FILTER (WHERE status = 'completed') as patients_completed,
          COUNT(*) FILTER (WHERE status = 'no_show') as no_shows
        FROM appointments
        WHERE tenant_id = $1
          AND scheduled_start >= $2::timestamptz
          AND scheduled_start < $3::timestamptz
        `,
        [tenantId, dayWindow.startIso, dayWindow.endIso]
      );

      // Get today's collections (from payments or charges marked as paid)
      const collectionsResult = await pool.query(
        `
        SELECT COALESCE(SUM(amount_cents) / 100.0, 0) as collections_today
        FROM payments
        WHERE tenant_id = $1
          AND created_at >= $2::timestamptz
          AND created_at < $3::timestamptz
        `,
        [tenantId, dayWindow.startIso, dayWindow.endIso]
      );

      // Calculate open slots (simplified - assumes 15-min slots, 8am-5pm)
      const totalSlots = 36 * (await this.getProviderCount(tenantId)); // 36 slots per provider per day
      const bookedSlots = parseInt(appointmentStats.rows[0].total_scheduled);
      const openSlotsRemaining = Math.max(0, totalSlots - bookedSlots);

      // Calculate average wait time for patients who arrived and were roomed
      const waitTimeResult = await pool.query(
        `
        SELECT AVG(EXTRACT(EPOCH FROM (roomed_at - arrived_at)) / 60) as avg_wait_minutes
        FROM appointments
        WHERE tenant_id = $1
          AND scheduled_start >= $2::timestamptz
          AND scheduled_start < $3::timestamptz
          AND arrived_at IS NOT NULL
          AND roomed_at IS NOT NULL
        `,
        [tenantId, dayWindow.startIso, dayWindow.endIso]
      );

      const stats: DailyStats = {
        totalScheduled: parseInt(appointmentStats.rows[0].total_scheduled),
        patientsArrived: parseInt(appointmentStats.rows[0].patients_arrived),
        patientsCompleted: parseInt(appointmentStats.rows[0].patients_completed),
        noShows: parseInt(appointmentStats.rows[0].no_shows),
        collectionsToday: parseFloat(collectionsResult.rows[0].collections_today),
        openSlotsRemaining,
        averageWaitTime: waitTimeResult.rows[0].avg_wait_minutes
          ? Math.round(parseFloat(waitTimeResult.rows[0].avg_wait_minutes))
          : undefined,
      };

      return stats;
    } catch (error) {
      logger.error('Error getting daily stats:', error);
      throw error;
    }
  }

  /**
   * Get patients currently in the waiting room
   */
  async getWaitingRoomPatients(tenantId: string): Promise<WaitingRoomPatient[]> {
    try {
      const dayWindow = this.getPracticeDayWindow();
      const result = await pool.query(
        `
        WITH waiting AS (
          SELECT
            a.*,
            COALESCE(a.arrived_at, a.checked_in_at, a.updated_at, a.scheduled_start) as waiting_arrived_at
          FROM appointments a
          WHERE a.tenant_id = $1
            AND a.status = 'checked_in'
            AND a.scheduled_start >= $2::timestamptz
            AND a.scheduled_start < $3::timestamptz
        )
        SELECT
          w.id as appointment_id,
          w.patient_id,
          p.first_name || ' ' || p.last_name as patient_name,
          w.provider_id,
          prov.full_name as provider_name,
          w.scheduled_start as scheduled_time,
          w.waiting_arrived_at as arrived_at,
          EXTRACT(EPOCH FROM (NOW() - w.waiting_arrived_at)) / 60 as wait_time_minutes
        FROM waiting w
        INNER JOIN patients p ON w.patient_id = p.id
        INNER JOIN providers prov ON w.provider_id = prov.id
        ORDER BY w.waiting_arrived_at ASC
        `,
        [tenantId, dayWindow.startIso, dayWindow.endIso]
      );

      return result.rows.map((row: any) => ({
        appointmentId: row.appointment_id,
        patientId: row.patient_id,
        patientName: row.patient_name,
        providerId: row.provider_id,
        providerName: row.provider_name,
        scheduledTime: row.scheduled_time,
        arrivedAt: row.arrived_at,
        waitTimeMinutes: Math.floor(parseFloat(row.wait_time_minutes)),
        isDelayed: parseFloat(row.wait_time_minutes) > 15,
      }));
    } catch (error) {
      logger.error('Error getting waiting room patients:', error);
      throw error;
    }
  }

  /**
   * Check in a patient and automatically create an encounter
   */
  async checkInPatient(
    tenantId: string,
    appointmentId: string,
    copayOptions?: CheckInCopayOptions
  ): Promise<CheckInPatientResult> {
    const client = await pool.connect();
    let inTransaction = false;
    let appointment:
      | {
          patient_id: string;
          patient_first_name: string | null;
          patient_last_name: string | null;
          patient_email: string | null;
          provider_id: string;
          appointment_type_id: string;
          appointment_type_name: string | null;
          prior_auth_required: boolean;
          latest_prior_auth_status: string | null;
          insurance_copay_amount: string | null;
          insurance_eligibility_status: string | null;
          insurance_verified_at: string | null;
        }
      | null = null;
    let collectedPayment:
      | {
          paymentId: string;
          receiptNumber: string;
          amountCents: number;
          paymentMethod: string;
        }
      | null = null;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      // Get appointment details
      const appointmentResult = await client.query(
        `SELECT
           a.patient_id,
           p.first_name as patient_first_name,
           p.last_name as patient_last_name,
           p.email as patient_email,
           a.provider_id,
           a.appointment_type_id,
           at.name as appointment_type_name,
           COALESCE(at.prior_auth_required, false) as prior_auth_required,
           latest_pa.status as latest_prior_auth_status,
           NULLIF(to_jsonb(p)->'insurance_details'->'primary'->>'copayAmount', '') as insurance_copay_amount,
           NULLIF(to_jsonb(p)->'insurance_details'->'primary'->>'eligibilityStatus', '') as insurance_eligibility_status,
           COALESCE(
             NULLIF(to_jsonb(p)->'insurance_details'->'primary'->>'verifiedAt', ''),
             NULLIF(to_jsonb(p)->'insurance_details'->'primary'->>'eligibilityCheckedAt', ''),
             NULLIF(to_jsonb(p)->>'eligibility_checked_at', '')
           ) as insurance_verified_at
         FROM appointments a
         INNER JOIN patients p ON p.id = a.patient_id
         INNER JOIN appointment_types at ON at.id = a.appointment_type_id
         LEFT JOIN LATERAL (
           SELECT pa.status
           FROM prior_authorizations pa
           WHERE pa.tenant_id = a.tenant_id
             AND pa.patient_id = a.patient_id
           ORDER BY
             CASE pa.status
               WHEN 'approved' THEN 0
               WHEN 'pending' THEN 1
               WHEN 'submitted' THEN 2
               WHEN 'appealed' THEN 3
               WHEN 'more_info_needed' THEN 4
               WHEN 'denied' THEN 5
               WHEN 'expired' THEN 6
               WHEN 'cancelled' THEN 7
               ELSE 8
             END,
             COALESCE(pa.updated_at, pa.created_at) DESC
           LIMIT 1
         ) latest_pa ON true
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, tenantId]
      );

      if (!appointmentResult.rowCount) {
        throw new Error('Appointment not found');
      }

      appointment = appointmentResult.rows[0];
      const appointmentRecord = appointment;
      if (!appointmentRecord) {
        throw new Error('Appointment details missing after lookup');
      }

      const priorAuthRequired = appointmentRecord.prior_auth_required === true;
      const priorAuthStatus = (appointmentRecord.latest_prior_auth_status || '').toLowerCase();
      const hasApprovedPriorAuth = priorAuthStatus === 'approved';
      const priorAuthOverrideReason = copayOptions?.priorAuthOverrideReason?.trim();
      const usedPriorAuthOverride = priorAuthRequired && !hasApprovedPriorAuth && Boolean(priorAuthOverrideReason);

      if (priorAuthRequired && !hasApprovedPriorAuth && !priorAuthOverrideReason) {
        const error = new Error(
          'Prior authorization required before check-in. Complete prior auth or enter an override reason.'
        );
        (error as Error & { code?: string }).code = 'PRIOR_AUTH_REQUIRED';
        throw error;
      }

      // Update appointment status
      await client.query(
        `UPDATE appointments
         SET status = 'checked_in',
             arrived_at = COALESCE(arrived_at, NOW()),
             checked_in_at = COALESCE(checked_in_at, NOW()),
             updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, appointmentId]
      );
      await this.upsertPatientFlowStatus(client, tenantId, appointmentId, 'checked_in');

      const parsedCopay = Number.parseFloat(appointmentRecord.insurance_copay_amount ?? '');
      const normalizedCopay = Number.isFinite(parsedCopay) && parsedCopay > 0 ? parsedCopay : 0;
      const defaultCopayAmountCents = Math.round(normalizedCopay * 100);
      const outstandingBills = await this.getOutstandingBills(client, tenantId, appointmentRecord.patient_id);
      const outstandingBalanceAmountCents = outstandingBills.reduce((sum, bill) => sum + bill.balanceCents, 0);
      const requestedCopayAmountCents =
        typeof copayOptions?.copayAmountCents === 'number' && Number.isFinite(copayOptions.copayAmountCents)
          ? Math.max(0, Math.round(copayOptions.copayAmountCents))
          : defaultCopayAmountCents;
      const collectedCopayAmountCents =
        Boolean(copayOptions?.collectCopay) && requestedCopayAmountCents > 0
          ? Math.min(requestedCopayAmountCents, defaultCopayAmountCents)
          : 0;
      const requestedOutstandingBalanceAmountCents =
        typeof copayOptions?.outstandingBalanceAmountCents === 'number' &&
        Number.isFinite(copayOptions.outstandingBalanceAmountCents)
          ? Math.max(0, Math.round(copayOptions.outstandingBalanceAmountCents))
          : 0;
      const shouldCollectOutstandingBalance =
        Boolean(copayOptions?.collectOutstandingBalance) && requestedOutstandingBalanceAmountCents > 0;
      const collectedOutstandingBalanceAmountCents = shouldCollectOutstandingBalance
        ? Math.min(requestedOutstandingBalanceAmountCents, outstandingBalanceAmountCents)
        : 0;
      const totalCollectedAmountCents = collectedCopayAmountCents + collectedOutstandingBalanceAmountCents;
      const shouldCollectCopay = totalCollectedAmountCents > 0;
      const shouldDeferCopay = !shouldCollectCopay && Boolean(copayOptions?.deferCopay);
      const copayNotes = [
        usedPriorAuthOverride && priorAuthOverrideReason
          ? `Prior auth override: ${priorAuthOverrideReason}`
          : null,
        copayOptions?.notes || null,
      ]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 500);

      if (shouldCollectCopay) {
        const paymentId = randomUUID();
        const receiptResult = await client.query(
          `SELECT COUNT(*) as count FROM patient_payments WHERE tenant_id = $1`,
          [tenantId]
        );
        const receiptCountRow =
          Array.isArray(receiptResult.rows) && receiptResult.rows.length > 0 ? receiptResult.rows[0] : null;
        const receiptNumber = `RCP-${new Date().getFullYear()}-${String(
          parseInt(receiptCountRow?.count ?? '0', 10) + 1
        ).padStart(6, '0')}`;
        await client.query(
          `INSERT INTO patient_payments (
             id, tenant_id, patient_id, payment_date, amount_cents,
             payment_method, receipt_number, status, notes, processed_by, reference_number
           ) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, 'posted', $7, $8, $9)`,
          [
            paymentId,
            tenantId,
            appointmentRecord.patient_id,
            totalCollectedAmountCents,
            copayOptions?.paymentMethod || 'cash',
            receiptNumber,
            [
              collectedCopayAmountCents > 0 ? `Check-in copay: $${(collectedCopayAmountCents / 100).toFixed(2)}` : null,
              collectedOutstandingBalanceAmountCents > 0
                ? `Past balance: $${(collectedOutstandingBalanceAmountCents / 100).toFixed(2)}`
                : null,
              copayNotes || null,
            ]
              .filter(Boolean)
              .join(' | '),
            copayOptions?.checkedInBy || null,
            appointmentId,
          ]
        );

        if (collectedOutstandingBalanceAmountCents > 0) {
          await this.applyOutstandingBalancePayment(
            client,
            tenantId,
            outstandingBills,
            collectedOutstandingBalanceAmountCents
          );
        }

        collectedPayment = {
          paymentId,
          receiptNumber,
          amountCents: totalCollectedAmountCents,
          paymentMethod: copayOptions?.paymentMethod || 'cash',
        };
      }

      (appointment as any).__copay_disposition = shouldCollectCopay
        ? 'collected'
        : shouldDeferCopay
          ? 'deferred'
          : 'none';
      (appointment as any).__copay_collected_amount_cents = shouldCollectCopay
        ? collectedCopayAmountCents
        : 0;
      (appointment as any).__outstanding_balance_collected_amount_cents = shouldCollectCopay
        ? collectedOutstandingBalanceAmountCents
        : 0;
      (appointment as any).__total_collected_amount_cents = shouldCollectCopay ? totalCollectedAmountCents : 0;
      (appointment as any).__prior_auth_override_used = usedPriorAuthOverride;
      (appointment as any).__prior_auth_status = priorAuthStatus || null;

      await client.query('COMMIT');
      inTransaction = false;
    } catch (error) {
      if (inTransaction) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Failed to rollback check-in transaction:', rollbackError);
        }
      }
      logger.error('Error checking in patient:', error);
      throw error;
    } finally {
      client.release();
    }

    if (!appointment) {
      throw new Error('Appointment details missing after check-in');
    }

    const parsedCopay = Number.parseFloat(appointment.insurance_copay_amount ?? '');
    const normalizedCopay = Number.isFinite(parsedCopay) && parsedCopay > 0 ? parsedCopay : 0;
    const copayAmountCents = Math.round(normalizedCopay * 100);
    const copaySource: 'insurance_profile' | 'none' = normalizedCopay > 0 ? 'insurance_profile' : 'none';
    const copayDisposition =
      ((appointment as any)?.__copay_disposition as 'none' | 'collected' | 'deferred' | undefined) || 'none';
    const copayCollectedAmountCents = Number(
      (appointment as any)?.__copay_collected_amount_cents || 0
    );
    const outstandingBalanceCollectedAmountCents = Number(
      (appointment as any)?.__outstanding_balance_collected_amount_cents || 0
    );
    const totalCollectedAmountCents = Number((appointment as any)?.__total_collected_amount_cents || 0);
    const paymentEmailResult = collectedPayment
      ? await sendPatientPaymentReceiptEmail({
          tenantId,
          patientEmail: appointment?.patient_email,
          patientFirstName: appointment?.patient_first_name,
          patientLastName: appointment?.patient_last_name,
          amountCents: collectedPayment.amountCents,
          paymentMethod: collectedPayment.paymentMethod,
          paymentDate: new Date(),
          receiptNumber: collectedPayment.receiptNumber,
          paymentTypeLabel: outstandingBalanceCollectedAmountCents > 0 ? 'Check-in Payment' : 'Check-in Copay',
        })
      : undefined;
    const checkInResultBase: Omit<CheckInPatientResult, 'encounterId'> = {
      copayAmount: normalizedCopay,
      copayAmountCents,
      copaySource,
      copayDisposition,
      copayCollectedAmountCents,
      outstandingBalanceCollectedAmountCents,
      totalCollectedAmountCents,
      priorAuthOverrideUsed: Boolean((appointment as any)?.__prior_auth_override_used),
      priorAuthStatus: ((appointment as any)?.__prior_auth_status as string | null) || undefined,
      eligibilityStatus: appointment?.insurance_eligibility_status ?? undefined,
      eligibilityVerifiedAt: appointment?.insurance_verified_at ?? undefined,
      ...(collectedPayment
        ? {
            paymentId: collectedPayment.paymentId,
            paymentReceiptNumber: collectedPayment.receiptNumber,
            paymentConfirmationEmailSent: paymentEmailResult?.sent ?? false,
            paymentConfirmationEmailAddress: paymentEmailResult?.emailAddress,
          }
        : {}),
    };

    try {
      const encounter = await encounterService.createEncounterFromAppointment(
        tenantId,
        appointmentId,
        appointment!.patient_id,
        appointment!.provider_id
      );

      logger.info(`Checked in patient and created encounter ${encounter.id} for appointment ${appointmentId}`);
      return {
        encounterId: encounter.id,
        ...checkInResultBase,
      };
    } catch (error) {
      logger.error('Encounter creation failed after check-in; continuing with checked-in status:', error);

      // Best-effort fallback for race conditions where encounter may already exist.
      const existingEncounter = await pool.query(
        `SELECT id FROM encounters WHERE tenant_id = $1 AND appointment_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [tenantId, appointmentId]
      );

      if (existingEncounter.rowCount) {
        return {
          encounterId: existingEncounter.rows[0].id,
          ...checkInResultBase,
        };
      }

      return {
        encounterId: '',
        ...checkInResultBase,
      };
    }
  }

  /**
   * Check out a patient
   */
  async checkOutPatient(tenantId: string, appointmentId: string): Promise<CheckOutResult> {
    try {
      const paymentDueCents = await getAppointmentCheckoutBalanceCents(tenantId, appointmentId);
      await pool.query(
        `
        UPDATE appointments
        SET status = 'checkout',
            completed_at = NULL
        WHERE tenant_id = $1
          AND id = $2
        `,
        [tenantId, appointmentId]
      );

      await pool.query(
        `
        UPDATE patient_flow
        SET status = 'checkout',
            checkout_at = COALESCE(checkout_at, NOW()),
            status_changed_at = NOW(),
            updated_at = NOW()
        WHERE tenant_id = $1
          AND appointment_id = $2
          AND status <> 'completed'
        `,
        [tenantId, appointmentId]
      );

      return {
        status: 'checkout',
        requiresPayment: paymentDueCents > 0,
        paymentDueCents,
      };
    } catch (error) {
      logger.error('Error checking out patient:', error);
      throw error;
    }
  }

  /**
   * Update appointment status
   */
  async updateAppointmentStatus(
    tenantId: string,
    appointmentId: string,
    status: string
  ): Promise<void> {
    try {
      // Update specific timestamp fields based on status
      const updates: string[] = ['status = $3'];

      if (status === 'checked_in' && updates) {
        updates.push('arrived_at = COALESCE(arrived_at, NOW())');
        updates.push('checked_in_at = COALESCE(checked_in_at, NOW())');
      } else if (status === 'in_room') {
        updates.push('roomed_at = COALESCE(roomed_at, NOW())');
      } else if (status === 'completed') {
        updates.push('completed_at = COALESCE(completed_at, NOW())');
      } else if (status === 'checkout') {
        updates.push('completed_at = NULL');
      }

      const query = `
        UPDATE appointments
        SET ${updates.join(', ')}
        WHERE tenant_id = $1 AND id = $2
      `;

      await pool.query(query, [tenantId, appointmentId, status]);

      if (['checked_in', 'in_room', 'with_provider', 'checkout', 'completed'].includes(status)) {
        await this.upsertPatientFlowStatus(pool, tenantId, appointmentId, status);
      } else if (['scheduled', 'cancelled', 'no_show'].includes(status)) {
        await pool.query(
          `
          UPDATE patient_flow
          SET status = 'completed',
              completed_at = COALESCE(completed_at, NOW()),
              status_changed_at = NOW(),
              updated_at = NOW()
          WHERE tenant_id = $1
            AND appointment_id = $2
            AND status <> 'completed'
          `,
          [tenantId, appointmentId]
        );
      }

      if (status === 'checkout' || status === 'completed') {
        const timestampColumn = status === 'checkout' ? 'checkout_at' : 'completed_at';
        await pool.query(
          `
          UPDATE patient_flow
          SET status = $3,
              ${timestampColumn} = COALESCE(${timestampColumn}, NOW()),
              status_changed_at = NOW(),
              updated_at = NOW()
          WHERE tenant_id = $1
            AND appointment_id = $2
          `,
          [tenantId, appointmentId, status]
        );
      }
    } catch (error) {
      logger.error('Error updating appointment status:', error);
      throw error;
    }
  }

  /**
   * Helper: Get count of active providers
   */
  private async getProviderCount(tenantId: string): Promise<number> {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM providers WHERE tenant_id = $1',
      [tenantId]
    );
    return parseInt(result.rows[0].count) || 1;
  }

  /**
   * Get upcoming patients (next 3-5 arriving)
   */
  async getUpcomingPatients(tenantId: string, limit: number = 5): Promise<AppointmentWithDetails[]> {
    try {
      const now = new Date().toISOString();

      const result = await pool.query(
        `
        SELECT
          a.id,
          a.tenant_id,
          a.patient_id,
          p.first_name as patient_first_name,
          p.last_name as patient_last_name,
          p.phone as patient_phone,
          p.email as patient_email,
          a.provider_id,
          prov.full_name as provider_name,
          a.location_id,
          l.name as location_name,
          a.appointment_type_id,
          at.name as appointment_type_name,
          a.scheduled_start,
          a.scheduled_end,
          a.status,
          a.created_at,
          -- Insurance info
          CASE
            WHEN (
              to_jsonb(p)->'insurance_details' IS NOT NULL
              AND (to_jsonb(p)->'insurance_details'->>'primary' IS NOT NULL)
              AND (to_jsonb(p)->'insurance_details'->'primary'->>'eligibilityStatus' = 'Active')
            )
              OR COALESCE(
                NULLIF(to_jsonb(p)->>'insurance_plan_name', ''),
                NULLIF(to_jsonb(p)->>'insurance', '')
              ) IS NOT NULL
            THEN true
            ELSE false
          END as insurance_verified,
          COALESCE(
            NULLIF(to_jsonb(p)->'insurance_details'->'primary'->>'planName', ''),
            NULLIF(to_jsonb(p)->>'insurance_plan_name', ''),
            NULLIF(to_jsonb(p)->>'insurance', '')
          ) as insurance_plan_name,
          CASE
            WHEN NULLIF(to_jsonb(p)->'insurance_details'->'primary'->>'copayAmount', '') IS NOT NULL
            THEN (to_jsonb(p)->'insurance_details'->'primary'->>'copayAmount')::numeric
            ELSE 0
          END as copay_amount,
          -- Outstanding balance
          COALESCE(
            (SELECT SUM(
                COALESCE(
                  NULLIF(to_jsonb(b)->>'balance_cents', '')::numeric,
                  NULLIF(to_jsonb(b)->>'amount_cents', '')::numeric,
                  0
                )
              ) / 100.0
             FROM bills b
             WHERE b.patient_id = p.id
               AND b.tenant_id = a.tenant_id
               AND b.status NOT IN ('paid', 'written_off', 'cancelled')
            ), 0
          ) as outstanding_balance
        FROM appointments a
        INNER JOIN patients p ON a.patient_id = p.id
        INNER JOIN providers prov ON a.provider_id = prov.id
        INNER JOIN locations l ON a.location_id = l.id
        INNER JOIN appointment_types at ON a.appointment_type_id = at.id
        WHERE a.tenant_id = $1
          AND a.scheduled_start > $2
          AND a.status = 'scheduled'
        ORDER BY a.scheduled_start ASC
        LIMIT $3
        `,
        [tenantId, now, limit]
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        patientId: row.patient_id,
        patientFirstName: row.patient_first_name,
        patientLastName: row.patient_last_name,
        patientPhone: row.patient_phone,
        patientEmail: row.patient_email,
        providerId: row.provider_id,
        providerName: row.provider_name,
        locationId: row.location_id,
        locationName: row.location_name,
        appointmentTypeId: row.appointment_type_id,
        appointmentTypeName: row.appointment_type_name,
        scheduledStart: row.scheduled_start,
        scheduledEnd: row.scheduled_end,
        status: row.status,
        insuranceVerified: row.insurance_verified,
        insurancePlanName: row.insurance_plan_name,
        copayAmount: row.copay_amount ? parseFloat(row.copay_amount) : undefined,
        outstandingBalance: row.outstanding_balance ? parseFloat(row.outstanding_balance) : 0,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Error getting upcoming patients:', error);
      throw error;
    }
  }
}

export const frontDeskService = new FrontDeskService();
