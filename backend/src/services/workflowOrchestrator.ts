/**
 * Workflow Orchestrator Service
 * Central nervous system that connects all medical practice workflows
 *
 * Flow: Appointment → Check-in → Encounter → Billing → Claims → Payments → Follow-up → Analytics
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';
import { encounterService } from './encounterService';
import { billingService } from './billingService';
import { scrubClaim, applyAutoFixes } from './claimScrubber';
import { notificationService } from './integrations/notificationService';
import { smsWorkflowService } from './smsWorkflowService';
import { patientEngagementService } from './patientEngagementService';
import {
  emitClaimCreated,
  emitClaimStatusChanged,
  emitEncounterCompleted,
  emitEncounterSigned,
  emitAppointmentUpdated,
} from '../websocket/emitter';

// ============================================
// WORKFLOW EVENT TYPES
// ============================================

export type WorkflowEventType =
  | 'appointment_scheduled'
  | 'appointment_confirmed'
  | 'appointment_checkin'
  | 'appointment_roomed'
  | 'appointment_checkout'
  | 'appointment_completed'
  | 'encounter_created'
  | 'encounter_updated'
  | 'encounter_signed'
  | 'encounter_locked'
  | 'charge_captured'
  | 'claim_created'
  | 'claim_scrubbed'
  | 'claim_submitted'
  | 'claim_accepted'
  | 'claim_denied'
  | 'claim_paid'
  | 'payment_received'
  | 'era_imported'
  | 'lab_ordered'
  | 'lab_result_received'
  | 'prescription_written'
  | 'prescription_sent'
  | 'prior_auth_needed'
  | 'prior_auth_approved'
  | 'prior_auth_denied'
  | 'followup_scheduled'
  | 'reminder_sent'
  | 'recall_scheduled'
  | 'treatment_plan_created'
  | 'patient_birthday'
  | 'patient_anniversary';

export interface WorkflowEvent {
  type: WorkflowEventType;
  tenantId: string;
  userId?: string;
  entityType: string;
  entityId: string;
  data: Record<string, any>;
  timestamp: Date;
}

export interface WorkflowContext {
  tenantId: string;
  userId: string;
  patientId?: string;
  appointmentId?: string;
  encounterId?: string;
  claimId?: string;
}

// ============================================
// WORKFLOW ORCHESTRATOR CLASS
// ============================================

export class WorkflowOrchestrator {

  // ============================================
  // CORE EVENT HANDLER
  // ============================================

  /**
   * Process a workflow event and trigger downstream actions
   */
  async processEvent(event: WorkflowEvent): Promise<void> {
    logger.info('Processing workflow event', {
      type: event.type,
      entityType: event.entityType,
      entityId: event.entityId,
    });

    try {
      // Log the event for analytics
      await this.logWorkflowEvent(event);

      // Route to appropriate handler
      switch (event.type) {
        // Appointment Flow
        case 'appointment_scheduled':
          await this.onAppointmentScheduled(event);
          break;
        case 'appointment_confirmed':
          await this.onAppointmentConfirmed(event);
          break;
        case 'appointment_checkin':
          await this.onAppointmentCheckin(event);
          break;
        case 'appointment_roomed':
          await this.onAppointmentRoomed(event);
          break;
        case 'appointment_checkout':
          await this.onAppointmentCheckout(event);
          break;

        // Encounter Flow
        case 'encounter_created':
          await this.onEncounterCreated(event);
          break;
        case 'encounter_updated':
          await this.onEncounterUpdated(event);
          break;
        case 'encounter_signed':
        case 'encounter_locked':
          await this.onEncounterSigned(event);
          break;

        // Billing Flow
        case 'charge_captured':
          await this.onChargeCaptured(event);
          break;
        case 'claim_created':
          await this.onClaimCreated(event);
          break;
        case 'claim_scrubbed':
          await this.onClaimScrubbed(event);
          break;
        case 'claim_submitted':
          await this.onClaimSubmitted(event);
          break;
        case 'claim_accepted':
          await this.onClaimAccepted(event);
          break;
        case 'claim_denied':
          await this.onClaimDenied(event);
          break;
        case 'claim_paid':
          await this.onClaimPaid(event);
          break;

        // Payment Flow
        case 'payment_received':
          await this.onPaymentReceived(event);
          break;
        case 'era_imported':
          await this.onERAImported(event);
          break;

        // Clinical Flow
        case 'lab_ordered':
          await this.onLabOrdered(event);
          break;
        case 'lab_result_received':
          await this.onLabResultReceived(event);
          break;
        case 'prescription_written':
          await this.onPrescriptionWritten(event);
          break;
        case 'prescription_sent':
          await this.onPrescriptionSent(event);
          break;

        // Prior Authorization Flow
        case 'prior_auth_needed':
          await this.onPriorAuthNeeded(event);
          break;
        case 'prior_auth_approved':
          await this.onPriorAuthApproved(event);
          break;
        case 'prior_auth_denied':
          await this.onPriorAuthDenied(event);
          break;

        // Follow-up Flow
        case 'followup_scheduled':
          await this.onFollowupScheduled(event);
          break;
        case 'reminder_sent':
          await this.onReminderSent(event);
          break;
        case 'recall_scheduled':
          await this.onRecallScheduled(event);
          break;

        // Patient Engagement Flow
        case 'appointment_completed':
          await this.onAppointmentCompleted(event);
          break;
        case 'treatment_plan_created':
          await this.onTreatmentPlanCreated(event);
          break;
        case 'patient_birthday':
          await this.onPatientBirthday(event);
          break;
        case 'patient_anniversary':
          await this.onPatientAnniversary(event);
          break;

        default:
          logger.warn('Unknown workflow event type', { type: event.type });
      }
    } catch (error: any) {
      logger.error('Error processing workflow event', {
        type: event.type,
        error: error.message,
      });
      // Log error but don't throw - workflow should be resilient
      await this.logWorkflowError(event, error);
    }
  }

  // ============================================
  // APPOINTMENT HANDLERS
  // ============================================

  /**
   * When appointment is scheduled:
   * - Schedule reminder SMS
   * - Check insurance eligibility
   * - Check for required prior authorizations
   */
  private async onAppointmentScheduled(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: appointmentId, data } = event;

    // Get appointment details
    const apptResult = await pool.query(
      `SELECT a.*, p.id as patient_id, p.first_name, p.last_name,
              p.insurance_payer_id, p.insurance_plan_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (!apptResult.rowCount) return;
    const appt = apptResult.rows[0];

    // 1. Schedule appointment reminders (24h and 2h before)
    await this.scheduleAppointmentReminders(tenantId, appointmentId, appt.start_time);

    // 2. Queue insurance eligibility check
    await this.queueEligibilityCheck(tenantId, appt.patient_id, appointmentId);

    // 3. Check if appointment type requires prior auth
    await this.checkPriorAuthRequirements(tenantId, appointmentId, data.appointmentType);

    // 4. Send confirmation notification (Slack/Teams)
    await notificationService.sendNotification({
      tenantId,
      notificationType: 'appointment_booked',
      data: {
        appointmentId,
        patientName: `${appt.first_name} ${appt.last_name}`,
        appointmentDate: appt.start_time,
        appointmentType: data.appointmentType,
      },
    });

    // 5. Send SMS confirmation to patient
    try {
      const smsResult = await smsWorkflowService.sendAppointmentConfirmation(tenantId, appointmentId);
      if (smsResult.success) {
        logger.info('Appointment confirmation SMS sent', { appointmentId, messageId: smsResult.messageId });
      }
    } catch (smsError: any) {
      logger.error('Failed to send appointment confirmation SMS', { appointmentId, error: smsError.message });
    }

    // 6. Update analytics
    await this.updateDailyAnalytics(tenantId, 'appointments_scheduled', 1);
  }

  private async onAppointmentConfirmed(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: appointmentId } = event;

    // Update confirmation status for analytics
    await this.updateDailyAnalytics(tenantId, 'appointments_confirmed', 1);
  }

  /**
   * When patient checks in:
   * - Auto-create encounter if not exists
   * - Update appointment status
   * - Notify provider
   */
  private async onAppointmentCheckin(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: appointmentId, data, userId } = event;

    // Get appointment
    const apptResult = await pool.query(
      `SELECT a.*, p.first_name, p.last_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (!apptResult.rowCount) return;
    const appt = apptResult.rows[0];

    // 1. Auto-create encounter
    try {
      const encounter = await encounterService.createEncounterFromAppointment(
        tenantId,
        appointmentId,
        appt.patient_id,
        appt.provider_id,
        data.chiefComplaint
      );

      logger.info('Auto-created encounter from check-in', {
        encounterId: encounter.id,
        appointmentId,
      });

      // Emit encounter created event
      await this.processEvent({
        type: 'encounter_created',
        tenantId,
        userId,
        entityType: 'encounter',
        entityId: encounter.id,
        data: { appointmentId },
        timestamp: new Date(),
      });
    } catch (error: any) {
      // Encounter might already exist, that's OK
      if (!error.message.includes('already exists')) {
        logger.error('Failed to auto-create encounter', { error: error.message });
      }
    }

    // 2. Collect copay if applicable
    await this.processCopayCollection(tenantId, appointmentId, appt.patient_id);

    // 3. Update wait time tracking
    await pool.query(
      `INSERT INTO appointment_metrics (tenant_id, appointment_id, checkin_time)
       VALUES ($1, $2, NOW())
       ON CONFLICT (appointment_id) DO UPDATE SET checkin_time = NOW()`,
      [tenantId, appointmentId]
    );

    // 4. Update analytics
    await this.updateDailyAnalytics(tenantId, 'patients_checked_in', 1);
  }

  private async onAppointmentRoomed(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: appointmentId } = event;

    // Track rooming time for analytics
    await pool.query(
      `UPDATE appointment_metrics
       SET roomed_time = NOW()
       WHERE appointment_id = $1 AND tenant_id = $2`,
      [appointmentId, tenantId]
    );
  }

  /**
   * When patient checks out:
   * - Finalize encounter if open
   * - Generate charges
   * - Schedule follow-up if needed
   * - Send patient satisfaction survey
   */
  private async onAppointmentCheckout(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: appointmentId, data, userId } = event;

    // 1. Get encounter for this appointment
    const encounterResult = await pool.query(
      `SELECT id, status FROM encounters
       WHERE appointment_id = $1 AND tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (encounterResult.rowCount && encounterResult.rows[0].status === 'draft') {
      // Prompt to finalize encounter
      logger.warn('Encounter still in draft at checkout', {
        encounterId: encounterResult.rows[0].id,
        appointmentId,
      });
    }

    // 2. Schedule follow-up if specified
    if (data.followUpDays) {
      await this.scheduleFollowUp(tenantId, appointmentId, data.followUpDays, data.followUpType);
    }

    // 3. Track checkout time
    await pool.query(
      `UPDATE appointment_metrics
       SET checkout_time = NOW()
       WHERE appointment_id = $1 AND tenant_id = $2`,
      [appointmentId, tenantId]
    );

    // 4. Queue patient satisfaction survey (24h delay)
    await this.queuePatientSurvey(tenantId, appointmentId);

    // 5. Update analytics
    await this.updateDailyAnalytics(tenantId, 'patients_checked_out', 1);
  }

  // ============================================
  // ENCOUNTER HANDLERS
  // ============================================

  private async onEncounterCreated(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: encounterId, data } = event;

    // Track encounter creation for provider productivity
    await this.updateDailyAnalytics(tenantId, 'encounters_created', 1);
  }

  private async onEncounterUpdated(event: WorkflowEvent): Promise<void> {
    // Track for auto-save analytics
  }

  /**
   * CRITICAL: When encounter is signed/locked:
   * - Generate charges with fee schedule pricing
   * - Auto-create claim
   * - Run claim scrubber
   * - If clean, mark ready for submission
   * - Notify billing team
   */
  private async onEncounterSigned(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: encounterId, userId } = event;

    logger.info('Processing encounter sign - starting auto-billing workflow', { encounterId });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Get encounter details
      const encounterResult = await client.query(
        `SELECT e.*, p.first_name, p.last_name, p.insurance_payer_id,
                p.insurance_plan_name, pr.full_name as provider_name
         FROM encounters e
         JOIN patients p ON p.id = e.patient_id
         JOIN providers pr ON pr.id = e.provider_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (!encounterResult.rowCount) {
        throw new Error('Encounter not found');
      }

      const encounter = encounterResult.rows[0];

      // 2. Generate charges from procedures
      await encounterService.generateChargesFromEncounter(tenantId, encounterId);
      logger.info('Charges generated for encounter', { encounterId });

      // 3. Check if there are charges to bill
      const chargesResult = await client.query(
        `SELECT COUNT(*) as count FROM charges
         WHERE encounter_id = $1 AND tenant_id = $2 AND status IN ('pending', 'ready')`,
        [encounterId, tenantId]
      );

      const chargeCount = parseInt(chargesResult.rows[0].count);

      if (chargeCount > 0) {
        // 4. Auto-create claim
        const claim = await billingService.createClaimFromCharges(
          tenantId,
          encounterId,
          userId || 'system'
        );
        logger.info('Auto-created claim from signed encounter', {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          totalCents: claim.totalCents,
        });

        // 5. Run claim scrubber
        const claimResult = await client.query(
          `SELECT id, tenant_id, patient_id, service_date, line_items,
                  payer_id, payer_name, is_cosmetic
           FROM claims WHERE id = $1`,
          [claim.id]
        );

        if (claimResult.rowCount) {
          const claimData = claimResult.rows[0];
          const scrubResult = await scrubClaim({
            id: claimData.id,
            tenantId: claimData.tenant_id,
            patientId: claimData.patient_id,
            serviceDate: claimData.service_date,
            lineItems: claimData.line_items || [],
            payerId: claimData.payer_id,
            payerName: claimData.payer_name,
            isCosmetic: claimData.is_cosmetic,
          });

          // Update claim with scrub results
          await client.query(
            `UPDATE claims
             SET scrub_status = $1, scrub_errors = $2, scrub_warnings = $3,
                 scrub_info = $4, last_scrubbed_at = NOW(),
                 status = CASE
                   WHEN $1 = 'clean' THEN 'ready'
                   WHEN $1 = 'warnings' THEN 'ready'
                   ELSE status
                 END
             WHERE id = $5`,
            [
              scrubResult.status,
              JSON.stringify(scrubResult.errors),
              JSON.stringify(scrubResult.warnings),
              JSON.stringify(scrubResult.info),
              claim.id,
            ]
          );

          logger.info('Claim scrubbed', {
            claimId: claim.id,
            scrubStatus: scrubResult.status,
            errors: scrubResult.errors.length,
            warnings: scrubResult.warnings.length,
          });

          // Emit claim created event
          emitClaimCreated(tenantId, {
            id: claim.id,
            claimNumber: claim.claimNumber || `CLM-${claim.id.substring(0, 8)}`,
            patientId: encounter.patient_id,
            patientName: `${encounter.first_name} ${encounter.last_name}`,
            totalCharges: claim.totalCents / 100,
            status: scrubResult.status === 'clean' ? 'ready' : 'draft',
            scrubStatus: scrubResult.status,
          });
        }

        // 6. Emit workflow event for claim
        await this.processEvent({
          type: 'claim_created',
          tenantId,
          userId,
          entityType: 'claim',
          entityId: claim.id,
          data: {
            encounterId,
            claimNumber: claim.claimNumber,
            totalCents: claim.totalCents,
          },
          timestamp: new Date(),
        });
      }

      // 7. Check for follow-up scheduling
      await this.checkFollowUpNeeded(tenantId, encounterId, encounter);

      // 8. Check for required labs/tests
      await this.processOrderedTests(tenantId, encounterId);

      // 9. Process prescriptions
      await this.processPrescriptions(tenantId, encounterId);

      await client.query('COMMIT');

      // 10. Emit encounter signed event
      emitEncounterSigned(tenantId, encounterId, encounter.provider_id);

      // 11. Update analytics
      await this.updateDailyAnalytics(tenantId, 'encounters_signed', 1);

      logger.info('Encounter sign workflow completed', { encounterId });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Error in encounter sign workflow', {
        encounterId,
        error: error.message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // BILLING/CLAIM HANDLERS
  // ============================================

  private async onChargeCaptured(event: WorkflowEvent): Promise<void> {
    const { tenantId, data } = event;
    await this.updateDailyAnalytics(tenantId, 'charges_captured', data.amountCents / 100);
  }

  private async onClaimCreated(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: claimId, data } = event;

    // Notify billing team of new claim
    await notificationService.sendNotification({
      tenantId,
      notificationType: 'claim_created',
      data: {
        claimId,
        claimNumber: data.claimNumber,
        totalAmount: (data.totalCents / 100).toFixed(2),
      },
    });

    await this.updateDailyAnalytics(tenantId, 'claims_created', 1);
  }

  private async onClaimScrubbed(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: claimId, data } = event;

    if (data.scrubStatus === 'errors') {
      // Alert billing team to scrub errors
      await notificationService.sendNotification({
        tenantId,
        notificationType: 'claim_scrub_error',
        data: {
          claimId,
          errors: data.errors,
        },
      });
    }
  }

  private async onClaimSubmitted(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: claimId, data } = event;

    await this.updateDailyAnalytics(tenantId, 'claims_submitted', 1);
    await this.updateDailyAnalytics(tenantId, 'charges_submitted', data.totalCents / 100);
  }

  private async onClaimAccepted(event: WorkflowEvent): Promise<void> {
    const { tenantId } = event;
    await this.updateDailyAnalytics(tenantId, 'claims_accepted', 1);
  }

  private async onClaimDenied(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: claimId, data } = event;

    // Alert billing team immediately
    await notificationService.sendNotification({
      tenantId,
      notificationType: 'claim_denied',
      data: {
        claimId,
        claimNumber: data.claimNumber,
        denialReason: data.denialReason,
        denialCode: data.denialCode,
        amount: data.amount,
      },
    });

    // Queue for appeal review if appealable
    if (data.appealable) {
      await this.queueAppealReview(tenantId, claimId, data.denialCode);
    }

    await this.updateDailyAnalytics(tenantId, 'claims_denied', 1);
  }

  private async onClaimPaid(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: claimId, data } = event;

    // Check for patient responsibility
    if (data.patientResponsibility > 0) {
      await this.generatePatientStatement(tenantId, claimId, data.patientResponsibility);
    }

    await this.updateDailyAnalytics(tenantId, 'claims_paid', 1);
    await this.updateDailyAnalytics(tenantId, 'payments_received', data.paidAmount / 100);
  }

  // ============================================
  // PAYMENT HANDLERS
  // ============================================

  private async onPaymentReceived(event: WorkflowEvent): Promise<void> {
    const { tenantId, data } = event;

    // Check if claim is fully paid
    const claimResult = await pool.query(
      `SELECT c.id, c.total_charges, c.status,
              COALESCE(SUM(cp.amount_cents), 0) as total_paid
       FROM claims c
       LEFT JOIN claim_payments cp ON cp.claim_id = c.id
       WHERE c.id = $1 AND c.tenant_id = $2
       GROUP BY c.id`,
      [data.claimId, tenantId]
    );

    if (claimResult.rowCount) {
      const claim = claimResult.rows[0];
      const totalChargesCents = Math.round(claim.total_charges * 100);

      if (claim.total_paid >= totalChargesCents && claim.status !== 'paid') {
        // Mark claim as paid
        await pool.query(
          `UPDATE claims SET status = 'paid', paid_amount = total_charges WHERE id = $1`,
          [data.claimId]
        );

        await this.processEvent({
          type: 'claim_paid',
          tenantId,
          entityType: 'claim',
          entityId: data.claimId,
          data: {
            paidAmount: claim.total_paid,
            patientResponsibility: 0,
          },
          timestamp: new Date(),
        });
      }
    }

    await this.updateDailyAnalytics(tenantId, 'payment_amount', data.amountCents / 100);
  }

  /**
   * Process ERA/EOB file import - auto-post payments
   */
  private async onERAImported(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: eraId, data, userId } = event;

    logger.info('Processing ERA import', { eraId, claimCount: data.claims?.length });

    for (const claimPayment of data.claims || []) {
      try {
        // Find matching claim by claim number or patient/DOS
        const claimResult = await pool.query(
          `SELECT id, total_charges FROM claims
           WHERE tenant_id = $1 AND (claim_number = $2 OR id = $3)`,
          [tenantId, claimPayment.claimNumber, claimPayment.claimId]
        );

        if (!claimResult.rowCount) {
          logger.warn('ERA claim not found', { claimNumber: claimPayment.claimNumber });
          continue;
        }

        const claim = claimResult.rows[0];

        // Post payment
        const paymentId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO claim_payments
           (id, tenant_id, claim_id, amount_cents, payment_date, payment_method,
            payer, check_number, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            paymentId,
            tenantId,
            claim.id,
            claimPayment.paidAmountCents,
            claimPayment.paymentDate || new Date().toISOString().split('T')[0],
            'ERA',
            claimPayment.payerName,
            claimPayment.checkNumber,
            `Auto-posted from ERA ${eraId}`,
            userId || 'system',
          ]
        );

        // Process adjustments
        if (claimPayment.adjustments?.length > 0) {
          for (const adj of claimPayment.adjustments) {
            await pool.query(
              `INSERT INTO claim_adjustments
               (id, tenant_id, claim_id, adjustment_code, adjustment_reason,
                amount_cents, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
              [
                crypto.randomUUID(),
                tenantId,
                claim.id,
                adj.code,
                adj.reason,
                adj.amountCents,
              ]
            );
          }
        }

        // Check for patient responsibility
        const patientResp = claimPayment.patientResponsibilityCents || 0;
        if (patientResp > 0) {
          await this.generatePatientStatement(tenantId, claim.id, patientResp);
        }

        // Update claim status
        const totalPaidResult = await pool.query(
          `SELECT COALESCE(SUM(amount_cents), 0) as total
           FROM claim_payments WHERE claim_id = $1`,
          [claim.id]
        );

        const totalPaid = totalPaidResult.rows[0].total;
        const totalChargesCents = Math.round(claim.total_charges * 100);

        if (totalPaid >= totalChargesCents) {
          await pool.query(
            `UPDATE claims SET status = 'paid', paid_amount = $1 WHERE id = $2`,
            [claim.total_charges, claim.id]
          );
        } else if (claimPayment.denialCode) {
          await pool.query(
            `UPDATE claims
             SET status = 'denied', denial_code = $1, denial_reason = $2, denial_date = NOW()
             WHERE id = $3`,
            [claimPayment.denialCode, claimPayment.denialReason, claim.id]
          );
        }

        logger.info('ERA payment posted', {
          claimId: claim.id,
          amount: claimPayment.paidAmountCents,
        });
      } catch (error: any) {
        logger.error('Error processing ERA claim', {
          claimNumber: claimPayment.claimNumber,
          error: error.message,
        });
      }
    }

    await this.updateDailyAnalytics(tenantId, 'era_payments_posted', data.claims?.length || 0);
  }

  // ============================================
  // CLINICAL FLOW HANDLERS
  // ============================================

  private async onLabOrdered(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: orderId, data } = event;

    // Check if prior auth is needed for this lab
    await this.checkLabPriorAuth(tenantId, orderId, data.labCode);

    // Send to lab interface queue
    await pool.query(
      `INSERT INTO lab_order_queue (id, tenant_id, order_id, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())
       ON CONFLICT (order_id) DO NOTHING`,
      [crypto.randomUUID(), tenantId, orderId]
    );

    await this.updateDailyAnalytics(tenantId, 'lab_orders', 1);
  }

  private async onLabResultReceived(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: resultId, data } = event;

    // Notify provider of critical values
    if (data.isCritical) {
      await notificationService.sendNotification({
        tenantId,
        notificationType: 'critical_lab_result',
        data: {
          patientName: data.patientName,
          testName: data.testName,
          result: data.result,
          criticalFlag: data.criticalFlag,
        },
      });
    }

    // Notify patient that results are ready via SMS
    try {
      const smsResult = await smsWorkflowService.sendLabResultsReady(tenantId, data.patientId, resultId);
      if (smsResult.success) {
        logger.info('Lab results SMS sent to patient', { patientId: data.patientId, resultId });
      }
    } catch (smsError: any) {
      logger.error('Failed to send lab results SMS', { patientId: data.patientId, error: smsError.message });
    }

    // Also notify via portal/internal system
    await this.notifyPatientLabResults(tenantId, data.patientId, resultId);

    await this.updateDailyAnalytics(tenantId, 'lab_results_received', 1);
  }

  private async onPrescriptionWritten(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: rxId, data } = event;

    // Check for drug interactions
    await this.checkDrugInteractions(tenantId, data.patientId, data.medicationId);

    // Check if prior auth needed
    if (data.requiresPriorAuth) {
      await this.processEvent({
        type: 'prior_auth_needed',
        tenantId,
        entityType: 'prescription',
        entityId: rxId,
        data: {
          patientId: data.patientId,
          medicationName: data.medicationName,
          payerId: data.payerId,
        },
        timestamp: new Date(),
      });
    }

    await this.updateDailyAnalytics(tenantId, 'prescriptions_written', 1);
  }

  private async onPrescriptionSent(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: rxId, data } = event;

    // Notify patient via SMS
    try {
      const smsResult = await smsWorkflowService.sendPrescriptionSent(
        tenantId,
        data.patientId,
        rxId,
        data.pharmacyName || 'your pharmacy'
      );
      if (smsResult.success) {
        logger.info('Prescription sent SMS delivered', { patientId: data.patientId, rxId });
      }
    } catch (smsError: any) {
      logger.error('Failed to send prescription SMS', { patientId: data.patientId, error: smsError.message });
    }

    // Also notify via portal/internal system
    await this.notifyPatientPrescription(tenantId, data.patientId, rxId, data.pharmacyName);

    await this.updateDailyAnalytics(tenantId, 'prescriptions_sent', 1);
  }

  // ============================================
  // PRIOR AUTHORIZATION HANDLERS
  // ============================================

  private async onPriorAuthNeeded(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId, data } = event;

    // Auto-generate prior auth request
    const priorAuthId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO prior_authorizations
       (id, tenant_id, patient_id, entity_type, entity_id, payer_id, status,
        medication_name, diagnosis_codes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, NOW())`,
      [
        priorAuthId,
        tenantId,
        data.patientId,
        event.entityType,
        entityId,
        data.payerId,
        data.medicationName || data.procedureName,
        data.diagnosisCodes || [],
      ]
    );

    // Notify staff
    await notificationService.sendNotification({
      tenantId,
      notificationType: 'prior_auth_needed',
      data: {
        patientName: data.patientName,
        itemName: data.medicationName || data.procedureName,
        payerName: data.payerName,
      },
    });

    await this.updateDailyAnalytics(tenantId, 'prior_auths_initiated', 1);
  }

  private async onPriorAuthApproved(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: priorAuthId, data } = event;

    // Update the related entity (prescription, lab order, etc.)
    await pool.query(
      `UPDATE prior_authorizations
       SET status = 'approved', approval_number = $1, approved_at = NOW()
       WHERE id = $2`,
      [data.approvalNumber, priorAuthId]
    );

    // Notify patient via SMS
    try {
      const smsResult = await smsWorkflowService.sendPriorAuthApproved(
        tenantId,
        data.patientId,
        priorAuthId,
        data.itemName
      );
      if (smsResult.success) {
        logger.info('Prior auth approved SMS sent', { patientId: data.patientId, priorAuthId });
      }
    } catch (smsError: any) {
      logger.error('Failed to send prior auth approved SMS', { error: smsError.message });
    }

    // Also notify via portal/internal system
    await this.notifyPatientPriorAuth(tenantId, data.patientId, 'approved', data.itemName);

    await this.updateDailyAnalytics(tenantId, 'prior_auths_approved', 1);
  }

  private async onPriorAuthDenied(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: priorAuthId, data } = event;

    // Update status
    await pool.query(
      `UPDATE prior_authorizations
       SET status = 'denied', denial_reason = $1, denied_at = NOW()
       WHERE id = $2`,
      [data.denialReason, priorAuthId]
    );

    // Notify provider to discuss alternatives
    await notificationService.sendNotification({
      tenantId,
      notificationType: 'prior_auth_denied',
      data: {
        patientName: data.patientName,
        itemName: data.itemName,
        denialReason: data.denialReason,
      },
    });

    // Notify patient via SMS
    try {
      const smsResult = await smsWorkflowService.sendPriorAuthDenied(
        tenantId,
        data.patientId,
        priorAuthId,
        data.itemName
      );
      if (smsResult.success) {
        logger.info('Prior auth denied SMS sent', { patientId: data.patientId, priorAuthId });
      }
    } catch (smsError: any) {
      logger.error('Failed to send prior auth denied SMS', { error: smsError.message });
    }

    await this.updateDailyAnalytics(tenantId, 'prior_auths_denied', 1);
  }

  // ============================================
  // FOLLOW-UP/RECALL HANDLERS
  // ============================================

  private async onFollowupScheduled(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: appointmentId, data } = event;

    // Schedule reminder SMS
    await this.scheduleAppointmentReminders(tenantId, appointmentId, data.appointmentDate);

    await this.updateDailyAnalytics(tenantId, 'followups_scheduled', 1);
  }

  private async onReminderSent(event: WorkflowEvent): Promise<void> {
    const { tenantId } = event;
    await this.updateDailyAnalytics(tenantId, 'reminders_sent', 1);
  }

  private async onRecallScheduled(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: recallId, data } = event;

    // Queue recall reminders
    await pool.query(
      `INSERT INTO recall_queue
       (id, tenant_id, patient_id, recall_type, due_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
      [recallId, tenantId, data.patientId, data.recallType, data.dueDate]
    );

    await this.updateDailyAnalytics(tenantId, 'recalls_scheduled', 1);
  }

  // ============================================
  // PATIENT ENGAGEMENT HANDLERS
  // ============================================

  /**
   * When appointment is completed (status changed to completed):
   * - Send post-visit survey (2-4 hours later)
   * - Award loyalty points
   * - Generate product recommendations based on diagnoses
   * - Trigger educational content delivery
   */
  private async onAppointmentCompleted(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: appointmentId, data } = event;

    try {
      // Get appointment details with patient and encounter info
      const apptResult = await pool.query(
        `SELECT a.*, p.id as patient_id, p.first_name, p.last_name,
                e.id as encounter_id
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         LEFT JOIN encounters e ON e.appointment_id = a.id
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, tenantId]
      );

      if (!apptResult.rowCount) return;
      const appt = apptResult.rows[0];

      // 1. Schedule post-appointment survey (3 hours after)
      try {
        await patientEngagementService.schedulePostAppointmentSurvey(tenantId, appointmentId, 3);
        logger.info('Post-appointment survey scheduled', { appointmentId });
      } catch (surveyError: any) {
        logger.error('Failed to schedule survey', { appointmentId, error: surveyError.message });
      }

      // 2. Award loyalty points for completed visit
      try {
        const pointsResult = await patientEngagementService.awardAppointmentPoints(
          tenantId,
          appt.patient_id,
          appointmentId
        );
        logger.info('Loyalty points awarded for visit', {
          patientId: appt.patient_id,
          points: pointsResult.pointsAwarded,
        });
      } catch (pointsError: any) {
        logger.error('Failed to award loyalty points', { error: pointsError.message });
      }

      // 3. Generate product recommendations based on encounter diagnoses
      if (appt.encounter_id) {
        try {
          const diagnosesResult = await pool.query(
            `SELECT icd10_code FROM encounter_diagnoses
             WHERE encounter_id = $1 AND tenant_id = $2
             LIMIT 3`,
            [appt.encounter_id, tenantId]
          );

          for (const diag of diagnosesResult.rows) {
            await patientEngagementService.generateProductRecommendations(
              tenantId,
              appt.patient_id,
              diag.icd10_code,
              appt.encounter_id
            );
          }
        } catch (recError: any) {
          logger.error('Failed to generate product recommendations', { error: recError.message });
        }

        // 4. Send educational content based on diagnoses
        try {
          const diagResult = await pool.query(
            `SELECT icd10_code FROM encounter_diagnoses
             WHERE encounter_id = $1 AND tenant_id = $2
             ORDER BY is_primary DESC LIMIT 1`,
            [appt.encounter_id, tenantId]
          );

          if (diagResult.rowCount) {
            await patientEngagementService.sendEducationalContent(
              tenantId,
              appt.patient_id,
              diagResult.rows[0].icd10_code,
              appt.encounter_id
            );
          }
        } catch (eduError: any) {
          logger.error('Failed to send educational content', { error: eduError.message });
        }
      }

      await this.updateDailyAnalytics(tenantId, 'appointments_completed', 1);
    } catch (error: any) {
      logger.error('Error in onAppointmentCompleted', { appointmentId, error: error.message });
    }
  }

  /**
   * When a treatment plan is created:
   * - Schedule adherence reminders
   * - Send educational content
   */
  private async onTreatmentPlanCreated(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: treatmentPlanId, data } = event;

    try {
      const patientId = data.patientId;

      // 1. Schedule adherence reminders based on treatment plan type
      if (data.treatmentType === 'medication' || data.prescriptionId) {
        await patientEngagementService.scheduleAdherenceReminders(
          tenantId,
          patientId,
          'medication',
          'daily',
          '09:00', // Default morning reminder
          data.endDate ? new Date(data.endDate) : undefined,
          treatmentPlanId,
          data.prescriptionId
        );
        logger.info('Medication adherence reminder scheduled', { treatmentPlanId, patientId });
      }

      if (data.treatmentType === 'skincare_routine') {
        // Schedule twice daily for skincare routines
        await patientEngagementService.scheduleAdherenceReminders(
          tenantId,
          patientId,
          'skincare_routine',
          'daily',
          '08:00',
          data.endDate ? new Date(data.endDate) : undefined,
          treatmentPlanId
        );
        logger.info('Skincare routine reminder scheduled', { treatmentPlanId, patientId });
      }

      // 2. Send educational content if diagnosis code is provided
      if (data.diagnosisCode) {
        await patientEngagementService.sendEducationalContent(
          tenantId,
          patientId,
          data.diagnosisCode,
          data.encounterId
        );
      }

      await this.updateDailyAnalytics(tenantId, 'treatment_plans_created', 1);
    } catch (error: any) {
      logger.error('Error in onTreatmentPlanCreated', { treatmentPlanId, error: error.message });
    }
  }

  /**
   * When it's a patient's birthday:
   * - Send birthday message with special offer
   * - Award bonus loyalty points
   */
  private async onPatientBirthday(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: patientId, data } = event;

    try {
      const result = await patientEngagementService.sendBirthdayMessage(
        tenantId,
        patientId,
        data.offer || '10% off your next treatment'
      );

      if (result.success) {
        logger.info('Birthday message sent', { patientId, campaignId: result.campaignId });
        await this.updateDailyAnalytics(tenantId, 'birthday_messages_sent', 1);
      }
    } catch (error: any) {
      logger.error('Error in onPatientBirthday', { patientId, error: error.message });
    }
  }

  /**
   * When it's a patient's anniversary with the practice:
   * - Send anniversary message with special offer
   * - Award bonus loyalty points
   */
  private async onPatientAnniversary(event: WorkflowEvent): Promise<void> {
    const { tenantId, entityId: patientId, data } = event;

    try {
      const years = data.years || 1;
      const offer = data.offer || `${years * 5}% off your next visit`;

      const result = await patientEngagementService.sendAnniversaryMessage(
        tenantId,
        patientId,
        years,
        offer
      );

      if (result.success) {
        logger.info('Anniversary message sent', { patientId, years, campaignId: result.campaignId });
        await this.updateDailyAnalytics(tenantId, 'anniversary_messages_sent', 1);
      }
    } catch (error: any) {
      logger.error('Error in onPatientAnniversary', { patientId, error: error.message });
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async scheduleAppointmentReminders(
    tenantId: string,
    appointmentId: string,
    appointmentTime: Date
  ): Promise<void> {
    // Schedule 24h and 2h reminders
    const reminders = [
      { hoursBeforereminder: 24, type: '24h' },
      { hoursBeforereminder: 2, type: '2h' },
    ];

    for (const reminder of reminders) {
      const sendTime = new Date(appointmentTime);
      sendTime.setHours(sendTime.getHours() - reminder.hoursBeforereminder);

      if (sendTime > new Date()) {
        await pool.query(
          `INSERT INTO scheduled_reminders
           (id, tenant_id, appointment_id, reminder_type, scheduled_time, status)
           VALUES ($1, $2, $3, $4, $5, 'scheduled')
           ON CONFLICT (appointment_id, reminder_type) DO NOTHING`,
          [crypto.randomUUID(), tenantId, appointmentId, reminder.type, sendTime]
        );
      }
    }
  }

  private async queueEligibilityCheck(
    tenantId: string,
    patientId: string,
    appointmentId: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO eligibility_check_queue
       (id, tenant_id, patient_id, appointment_id, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenantId, patientId, appointmentId]
    );
  }

  private async checkPriorAuthRequirements(
    tenantId: string,
    appointmentId: string,
    appointmentType: string
  ): Promise<void> {
    // Check if appointment type typically requires prior auth
    const rulesResult = await pool.query(
      `SELECT * FROM prior_auth_rules
       WHERE tenant_id = $1 AND appointment_type = $2 AND is_active = true`,
      [tenantId, appointmentType]
    );

    if (rulesResult.rowCount) {
      await pool.query(
        `UPDATE appointments SET prior_auth_required = true WHERE id = $1`,
        [appointmentId]
      );
    }
  }

  private async processCopayCollection(
    tenantId: string,
    appointmentId: string,
    patientId: string
  ): Promise<void> {
    // Get expected copay from eligibility
    const eligResult = await pool.query(
      `SELECT copay_amount FROM insurance_verifications
       WHERE patient_id = $1 AND tenant_id = $2
       ORDER BY verified_at DESC LIMIT 1`,
      [patientId, tenantId]
    );

    if (eligResult.rowCount && eligResult.rows[0].copay_amount > 0) {
      await pool.query(
        `INSERT INTO copay_collection_queue
         (id, tenant_id, appointment_id, patient_id, expected_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), tenantId, appointmentId, patientId, eligResult.rows[0].copay_amount]
      );
    }
  }

  private async checkFollowUpNeeded(
    tenantId: string,
    encounterId: string,
    encounter: any
  ): Promise<void> {
    // Check diagnoses that typically need follow-up
    const diagResult = await pool.query(
      `SELECT ed.*, fr.follow_up_days, fr.follow_up_type
       FROM encounter_diagnoses ed
       LEFT JOIN follow_up_rules fr ON fr.icd10_code = ed.icd10_code
         AND fr.tenant_id = ed.tenant_id AND fr.is_active = true
       WHERE ed.encounter_id = $1 AND ed.tenant_id = $2
         AND fr.follow_up_days IS NOT NULL`,
      [encounterId, tenantId]
    );

    for (const diag of diagResult.rows) {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + diag.follow_up_days);

      await this.scheduleFollowUp(
        tenantId,
        encounter.appointment_id,
        diag.follow_up_days,
        diag.follow_up_type || 'follow_up'
      );
    }
  }

  private async scheduleFollowUp(
    tenantId: string,
    sourceAppointmentId: string,
    daysOut: number,
    followUpType: string
  ): Promise<void> {
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + daysOut);

    await pool.query(
      `INSERT INTO follow_up_queue
       (id, tenant_id, source_appointment_id, follow_up_type, target_date, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenantId, sourceAppointmentId, followUpType, followUpDate]
    );
  }

  private async processOrderedTests(tenantId: string, encounterId: string): Promise<void> {
    // Check for lab orders from this encounter
    const ordersResult = await pool.query(
      `SELECT * FROM lab_orders WHERE encounter_id = $1 AND tenant_id = $2 AND status = 'pending'`,
      [encounterId, tenantId]
    );

    for (const order of ordersResult.rows) {
      await this.processEvent({
        type: 'lab_ordered',
        tenantId,
        entityType: 'lab_order',
        entityId: order.id,
        data: {
          labCode: order.lab_code,
          patientId: order.patient_id,
        },
        timestamp: new Date(),
      });
    }
  }

  private async processPrescriptions(tenantId: string, encounterId: string): Promise<void> {
    // Check for prescriptions from this encounter
    const rxResult = await pool.query(
      `SELECT * FROM prescriptions WHERE encounter_id = $1 AND tenant_id = $2 AND status = 'draft'`,
      [encounterId, tenantId]
    );

    for (const rx of rxResult.rows) {
      await this.processEvent({
        type: 'prescription_written',
        tenantId,
        entityType: 'prescription',
        entityId: rx.id,
        data: {
          patientId: rx.patient_id,
          medicationName: rx.medication_name,
          medicationId: rx.medication_id,
          requiresPriorAuth: rx.requires_prior_auth,
          payerId: rx.payer_id,
        },
        timestamp: new Date(),
      });
    }
  }

  private async generatePatientStatement(
    tenantId: string,
    claimId: string,
    amountCents: number
  ): Promise<void> {
    // Get claim details
    const claimResult = await pool.query(
      `SELECT c.*, p.first_name, p.last_name, p.address, p.city, p.state, p.zip
       FROM claims c
       JOIN patients p ON p.id = c.patient_id
       WHERE c.id = $1`,
      [claimId]
    );

    if (!claimResult.rowCount) return;
    const claim = claimResult.rows[0];

    // Create patient statement
    const statementId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO patient_statements
       (id, tenant_id, patient_id, claim_id, amount_due_cents, statement_date, status)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'pending')`,
      [statementId, tenantId, claim.patient_id, claimId, amountCents]
    );

    logger.info('Patient statement generated', { claimId, amount: amountCents / 100 });

    // Send SMS notification about balance due
    try {
      const smsResult = await smsWorkflowService.sendBalanceDue(
        tenantId,
        claim.patient_id,
        amountCents / 100,
        statementId
      );
      if (smsResult.success) {
        logger.info('Balance due SMS sent', { patientId: claim.patient_id, amount: amountCents / 100 });
      }
    } catch (smsError: any) {
      logger.error('Failed to send balance due SMS', { error: smsError.message });
    }
  }

  private async queuePatientSurvey(tenantId: string, appointmentId: string): Promise<void> {
    const sendTime = new Date();
    sendTime.setHours(sendTime.getHours() + 24);

    await pool.query(
      `INSERT INTO survey_queue
       (id, tenant_id, appointment_id, survey_type, scheduled_time, status)
       VALUES ($1, $2, $3, 'satisfaction', $4, 'scheduled')
       ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenantId, appointmentId, sendTime]
    );
  }

  private async queueAppealReview(
    tenantId: string,
    claimId: string,
    denialCode: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO appeal_review_queue
       (id, tenant_id, claim_id, denial_code, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())
       ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), tenantId, claimId, denialCode]
    );
  }

  private async checkLabPriorAuth(
    tenantId: string,
    orderId: string,
    labCode: string
  ): Promise<void> {
    const ruleResult = await pool.query(
      `SELECT * FROM prior_auth_rules
       WHERE tenant_id = $1 AND lab_code = $2 AND is_active = true`,
      [tenantId, labCode]
    );

    if (ruleResult.rowCount) {
      await pool.query(
        `UPDATE lab_orders SET requires_prior_auth = true WHERE id = $1`,
        [orderId]
      );
    }
  }

  private async notifyPatientLabResults(
    tenantId: string,
    patientId: string,
    resultId: string
  ): Promise<void> {
    // Check patient notification preferences
    const prefResult = await pool.query(
      `SELECT notify_lab_results FROM patient_notification_preferences
       WHERE patient_id = $1 AND tenant_id = $2`,
      [patientId, tenantId]
    );

    if (!prefResult.rowCount || prefResult.rows[0].notify_lab_results) {
      await pool.query(
        `INSERT INTO patient_notification_queue
         (id, tenant_id, patient_id, notification_type, entity_id, status)
         VALUES ($1, $2, $3, 'lab_results', $4, 'pending')`,
        [crypto.randomUUID(), tenantId, patientId, resultId]
      );
    }
  }

  private async notifyPatientPrescription(
    tenantId: string,
    patientId: string,
    rxId: string,
    pharmacyName: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO patient_notification_queue
       (id, tenant_id, patient_id, notification_type, entity_id, metadata, status)
       VALUES ($1, $2, $3, 'prescription_sent', $4, $5, 'pending')`,
      [crypto.randomUUID(), tenantId, patientId, rxId, JSON.stringify({ pharmacyName })]
    );
  }

  private async notifyPatientPriorAuth(
    tenantId: string,
    patientId: string,
    status: string,
    itemName: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO patient_notification_queue
       (id, tenant_id, patient_id, notification_type, metadata, status)
       VALUES ($1, $2, $3, 'prior_auth_update', $4, 'pending')`,
      [crypto.randomUUID(), tenantId, patientId, JSON.stringify({ status, itemName })]
    );
  }

  private async checkDrugInteractions(
    tenantId: string,
    patientId: string,
    medicationId: string
  ): Promise<void> {
    // Get patient's current medications
    const medsResult = await pool.query(
      `SELECT medication_id FROM prescriptions
       WHERE patient_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [patientId, tenantId]
    );

    // In production, check against drug interaction database
    // For now, log for review
    logger.debug('Drug interaction check queued', {
      patientId,
      newMedication: medicationId,
      currentMedications: medsResult.rows.length,
    });
  }

  // ============================================
  // ANALYTICS TRACKING
  // ============================================

  private async logWorkflowEvent(event: WorkflowEvent): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO workflow_events
         (id, tenant_id, event_type, entity_type, entity_id, user_id, data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          event.tenantId,
          event.type,
          event.entityType,
          event.entityId,
          event.userId || null,
          JSON.stringify(event.data),
          event.timestamp,
        ]
      );
    } catch (error: any) {
      logger.error('Failed to log workflow event', { error: error.message });
    }
  }

  private async logWorkflowError(event: WorkflowEvent, error: Error): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO workflow_errors
         (id, tenant_id, event_type, entity_type, entity_id, error_message, stack_trace, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          crypto.randomUUID(),
          event.tenantId,
          event.type,
          event.entityType,
          event.entityId,
          error.message,
          error.stack,
        ]
      );
    } catch (logError: any) {
      logger.error('Failed to log workflow error', { error: logError.message });
    }
  }

  private async updateDailyAnalytics(
    tenantId: string,
    metric: string,
    value: number
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    try {
      await pool.query(
        `INSERT INTO daily_analytics (tenant_id, date, metric, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, date, metric)
         DO UPDATE SET value = daily_analytics.value + $4`,
        [tenantId, today, metric, value]
      );
    } catch (error: any) {
      logger.error('Failed to update analytics', { error: error.message, metric });
    }
  }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
