/**
 * Master Event Orchestrator
 *
 * Central integration point that connects ALL systems in the dermatology CRM.
 * This service:
 * 1. Registers all event handlers with the EventBus
 * 2. Bridges the legacy workflowOrchestrator with the new event system
 * 3. Provides unified event emission points for all services
 * 4. Manages cross-service event flows
 *
 * Connected Systems:
 * - Patient Engagement (patientEngagementService)
 * - Referral Management (referralService)
 * - Patient Intake (patientIntakeService)
 * - Revenue Cycle (revenueCycleService)
 * - Inventory (inventoryService)
 * - Quality Measures (qualityMeasuresService)
 * - Staff Scheduling (staffSchedulingService)
 * - SMS Workflow (smsWorkflowService)
 * - Existing workflowOrchestrator
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { eventBus, Event, EventPayload, onEvent, EventEmitters } from './eventBusService';
import { workflowOrchestrator, WorkflowEvent } from './workflowOrchestrator';
import { smsWorkflowService } from './smsWorkflowService';
import { patientEngagementService } from './patientEngagementService';
import { referralService } from './referralService';
import { patientIntakeService } from './patientIntakeService';
import { revenueCycleService } from './revenueCycleService';
import { inventoryService, LotStatus } from './inventoryService';
import { QualityMeasuresService } from './qualityMeasuresService';
import crypto from 'crypto';

// ============================================================================
// MASTER ORCHESTRATOR CLASS
// ============================================================================

export class MasterEventOrchestrator {
  private qualityMeasuresService: QualityMeasuresService;
  private isInitialized: boolean = false;

  constructor() {
    this.qualityMeasuresService = new QualityMeasuresService();
  }

  /**
   * Initialize the orchestrator - register all handlers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('MasterEventOrchestrator already initialized');
      return;
    }

    logger.info('Initializing Master Event Orchestrator...');

    // Register all event handlers
    await this.registerAppointmentHandlers();
    await this.registerReferralHandlers();
    await this.registerBillingHandlers();
    await this.registerClinicalHandlers();
    await this.registerInventoryHandlers();
    await this.registerPatientHandlers();
    await this.registerQualityHandlers();
    await this.registerStaffHandlers();

    // Start the background event processor
    eventBus.startProcessor(1000);

    this.isInitialized = true;
    logger.info('Master Event Orchestrator initialized successfully');
  }

  /**
   * Shutdown the orchestrator
   */
  shutdown(): void {
    eventBus.stopProcessor();
    this.isInitialized = false;
    logger.info('Master Event Orchestrator shutdown');
  }

  // ============================================================================
  // APPOINTMENT EVENT HANDLERS
  // ============================================================================

  private async registerAppointmentHandlers(): Promise<void> {
    // appointment.scheduled handlers
    onEvent('appointment.scheduled', 'send_confirmation_sms', async (tenantId, payload, event) => {
      const { appointmentId } = payload;
      return smsWorkflowService.sendAppointmentConfirmation(tenantId, appointmentId);
    });

    onEvent('appointment.scheduled', 'check_insurance_eligibility', async (tenantId, payload, event) => {
      const { appointmentId, patientId } = payload;
      await pool.query(
        `INSERT INTO eligibility_check_queue (id, tenant_id, patient_id, appointment_id, status, created_at)
         VALUES ($1, $2, $3, $4, 'pending', NOW())
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), tenantId, patientId, appointmentId]
      );
      return { queued: true };
    });

    onEvent('appointment.scheduled', 'trigger_intake_if_new', async (tenantId, payload, event) => {
      const { appointmentId, patientId, isNewPatient } = payload;
      if (isNewPatient) {
        await patientIntakeService.createIntakeSession(tenantId, patientId, {
          appointmentId,
          sendLink: true,
        });
        return { intakeTriggered: true };
      }
      return { intakeTriggered: false };
    });

    onEvent('appointment.scheduled', 'schedule_reminders', async (tenantId, payload, event) => {
      const { appointmentId, startTime } = payload;
      const appointmentDate = new Date(startTime);
      const reminders = [
        { hoursBeforeReminder: 24, type: '24h' },
        { hoursBeforeReminder: 2, type: '2h' },
      ];

      for (const reminder of reminders) {
        const sendTime = new Date(appointmentDate);
        sendTime.setHours(sendTime.getHours() - reminder.hoursBeforeReminder);

        if (sendTime > new Date()) {
          await pool.query(
            `INSERT INTO scheduled_reminders (id, tenant_id, appointment_id, reminder_type, scheduled_time, status)
             VALUES ($1, $2, $3, $4, $5, 'scheduled')
             ON CONFLICT (appointment_id, reminder_type) DO NOTHING`,
            [crypto.randomUUID(), tenantId, appointmentId, reminder.type, sendTime]
          );
        }
      }
      return { remindersScheduled: reminders.length };
    });

    // appointment.completed handlers
    onEvent('appointment.completed', 'schedule_survey', async (tenantId, payload, event) => {
      const { appointmentId } = payload;
      await patientEngagementService.schedulePostAppointmentSurvey(tenantId, appointmentId, 3);
      return { surveyScheduled: true };
    });

    onEvent('appointment.completed', 'award_loyalty_points', async (tenantId, payload, event) => {
      const { appointmentId, patientId } = payload;
      const result = await patientEngagementService.awardAppointmentPoints(tenantId, patientId, appointmentId);
      return { pointsAwarded: result.pointsAwarded };
    });

    onEvent('appointment.completed', 'evaluate_quality_measures', async (tenantId, payload, event) => {
      const { encounterId, patientId, providerId } = payload;
      if (encounterId) {
        // Evaluate common dermatology quality measures
        const measures = ['DERM001', 'DERM002', 'MIPS226', 'MIPS137'];
        for (const measureId of measures) {
          try {
            await this.qualityMeasuresService.evaluatePatientForMeasure(
              tenantId,
              patientId,
              measureId,
              encounterId,
              providerId
            );
          } catch (err) {
            logger.debug('Measure evaluation skipped', { measureId, error: (err as Error).message });
          }
        }
      }
      return { measuresEvaluated: true };
    });

    onEvent('appointment.completed', 'generate_recommendations', async (tenantId, payload, event) => {
      const { encounterId, patientId } = payload;
      if (encounterId) {
        const diagResult = await pool.query(
          `SELECT icd10_code FROM encounter_diagnoses WHERE encounter_id = $1 AND tenant_id = $2 LIMIT 3`,
          [encounterId, tenantId]
        );
        for (const diag of diagResult.rows) {
          await patientEngagementService.generateProductRecommendations(
            tenantId,
            patientId,
            diag.icd10_code,
            encounterId
          );
        }
      }
      return { recommendationsGenerated: true };
    });

    onEvent('appointment.completed', 'send_educational_content', async (tenantId, payload, event) => {
      const { encounterId, patientId } = payload;
      if (encounterId) {
        const diagResult = await pool.query(
          `SELECT icd10_code FROM encounter_diagnoses
           WHERE encounter_id = $1 AND tenant_id = $2 ORDER BY is_primary DESC LIMIT 1`,
          [encounterId, tenantId]
        );
        if (diagResult.rowCount) {
          await patientEngagementService.sendEducationalContent(
            tenantId,
            patientId,
            diagResult.rows[0].icd10_code,
            encounterId
          );
        }
      }
      return { educationalContentSent: true };
    });

    onEvent('appointment.completed', 'deduct_procedure_inventory', async (tenantId, payload, event) => {
      const { encounterId, procedureCodes, patientId, providerId } = payload;
      if (encounterId && procedureCodes && Array.isArray(procedureCodes)) {
        for (const cptCode of procedureCodes) {
          try {
            await inventoryService.deductProcedureSupplies(
              tenantId,
              cptCode,
              patientId,
              providerId,
              encounterId,
              event.sourceUserId || 'system'
            );
          } catch (err) {
            logger.warn('Failed to deduct inventory for procedure', { cptCode, error: (err as Error).message });
          }
        }
      }
      return { inventoryDeducted: true };
    });

    // appointment.cancelled handlers
    onEvent('appointment.cancelled', 'notify_waitlist', async (tenantId, payload, event) => {
      const { appointmentId, providerId, startTime, locationId } = payload;
      // Find patients on waitlist that could fill this slot
      const waitlistResult = await pool.query(
        `SELECT id, patient_id FROM waitlist_entries
         WHERE tenant_id = $1 AND status = 'waiting'
           AND (provider_id IS NULL OR provider_id = $2)
           AND (location_id IS NULL OR location_id = $3)
         ORDER BY priority DESC, created_at ASC LIMIT 5`,
        [tenantId, providerId, locationId]
      );

      for (const entry of waitlistResult.rows) {
        await pool.query(
          `INSERT INTO waitlist_notifications (id, tenant_id, waitlist_entry_id, appointment_id, status, created_at)
           VALUES ($1, $2, $3, $4, 'pending', NOW())`,
          [crypto.randomUUID(), tenantId, entry.id, appointmentId]
        );
      }
      return { waitlistNotified: waitlistResult.rowCount };
    });

    onEvent('appointment.cancelled', 'update_room_schedule', async (tenantId, payload, event) => {
      const { appointmentId } = payload;
      await pool.query(
        `UPDATE room_schedules SET status = 'cancelled' WHERE appointment_id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId]
      );
      return { roomReleased: true };
    });

    onEvent('appointment.cancelled', 'send_cancellation_sms', async (tenantId, payload, event) => {
      const { appointmentId, patientId, startTime, providerName } = payload;
      return smsWorkflowService.sendAppointmentCancelled(
        tenantId,
        appointmentId,
        new Date(startTime),
        providerName || 'your provider',
        patientId
      );
    });

    // appointment.no_show handlers
    onEvent('appointment.no_show', 'log_no_show', async (tenantId, payload, event) => {
      const { appointmentId, patientId } = payload;
      await pool.query(
        `INSERT INTO patient_no_shows (id, tenant_id, patient_id, appointment_id, recorded_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [crypto.randomUUID(), tenantId, patientId, appointmentId]
      );
      return { noShowLogged: true };
    });

    onEvent('appointment.no_show', 'update_engagement_score', async (tenantId, payload, event) => {
      const { patientId } = payload;
      // Decrease engagement score for no-shows
      await pool.query(
        `UPDATE patient_engagement_scores
         SET score = GREATEST(0, score - 10),
             last_calculated_at = NOW()
         WHERE patient_id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );
      return { scoreUpdated: true };
    });

    onEvent('appointment.no_show', 'trigger_followup', async (tenantId, payload, event) => {
      const { patientId, appointmentId } = payload;
      await pool.query(
        `INSERT INTO follow_up_queue (id, tenant_id, patient_id, source_appointment_id, follow_up_type, target_date, status, created_at)
         VALUES ($1, $2, $3, $4, 'no_show_followup', NOW() + INTERVAL '1 day', 'pending', NOW())`,
        [crypto.randomUUID(), tenantId, patientId, appointmentId]
      );
      return { followupScheduled: true };
    });

    logger.debug('Registered appointment event handlers');
  }

  // ============================================================================
  // REFERRAL EVENT HANDLERS
  // ============================================================================

  private async registerReferralHandlers(): Promise<void> {
    // referral.received handlers
    onEvent('referral.received', 'create_patient_if_new', async (tenantId, payload, event) => {
      const { referralId, patientData } = payload;
      if (patientData && !patientData.existingPatientId) {
        // Create new patient from referral data
        const patientId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO patients (id, tenant_id, first_name, last_name, date_of_birth, phone, email, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT DO NOTHING`,
          [
            patientId,
            tenantId,
            patientData.firstName,
            patientData.lastName,
            patientData.dateOfBirth,
            patientData.phone,
            patientData.email,
          ]
        );

        // Update referral with patient ID
        await pool.query(
          `UPDATE referrals SET patient_id = $1 WHERE id = $2`,
          [patientId, referralId]
        );

        // Emit patient.created event
        await EventEmitters.patientCreated(tenantId, patientId, {
          firstName: patientData.firstName,
          lastName: patientData.lastName,
          isFromReferral: true,
          referralId,
        });

        return { patientCreated: true, patientId };
      }
      return { patientCreated: false };
    });

    onEvent('referral.received', 'send_intake_link', async (tenantId, payload, event) => {
      const { patientId, referralId } = payload;
      if (patientId) {
        await patientIntakeService.createIntakeSession(tenantId, patientId, {
          referralId,
          sendLink: true,
        });
      }
      return { intakeLinkSent: true };
    });

    onEvent('referral.received', 'verify_insurance', async (tenantId, payload, event) => {
      const { patientId, insuranceInfo } = payload;
      if (patientId && insuranceInfo) {
        await pool.query(
          `INSERT INTO eligibility_check_queue (id, tenant_id, patient_id, status, created_at)
           VALUES ($1, $2, $3, 'pending', NOW())`,
          [crypto.randomUUID(), tenantId, patientId]
        );
      }
      return { verificationQueued: true };
    });

    onEvent('referral.received', 'notify_staff', async (tenantId, payload, event) => {
      const { referralId, urgency, referringProviderName } = payload;
      await pool.query(
        `INSERT INTO staff_notifications (id, tenant_id, notification_type, title, message, priority, created_at)
         VALUES ($1, $2, 'new_referral', $3, $4, $5, NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          'New Referral Received',
          `Referral from ${referringProviderName || 'external provider'}`,
          urgency === 'urgent' ? 'high' : 'normal',
        ]
      );
      return { staffNotified: true };
    });

    // referral.scheduled handlers
    onEvent('referral.scheduled', 'update_referral_status', async (tenantId, payload, event) => {
      const { referralId, appointmentId, scheduledDate } = payload;
      await referralService.updateReferralStatus(tenantId, referralId, {
        status: 'scheduled',
        changedBy: event.sourceUserId || 'system',
        notes: `Appointment ${appointmentId} scheduled for ${scheduledDate}`,
      });
      return { statusUpdated: true };
    });

    onEvent('referral.scheduled', 'notify_referring_provider', async (tenantId, payload, event) => {
      const { referralId, scheduledDate } = payload;
      await referralService.notifyReferringProvider(tenantId, referralId, 'scheduled', {
        scheduledDate,
        message: 'Patient has been scheduled for consultation',
      });
      return { referringProviderNotified: true };
    });

    // referral.completed handlers
    onEvent('referral.completed', 'generate_consultation_report', async (tenantId, payload, event) => {
      const { referralId, encounterId } = payload;
      const report = await referralService.generateConsultationReport(tenantId, referralId, encounterId);
      return { reportGenerated: true, reportId: report?.id };
    });

    onEvent('referral.completed', 'send_to_referring_provider', async (tenantId, payload, event) => {
      const { referralId, reportId } = payload;
      await referralService.sendReportToReferringProvider(tenantId, referralId, reportId);
      return { reportSent: true };
    });

    onEvent('referral.completed', 'close_referral_loop', async (tenantId, payload, event) => {
      const { referralId } = payload;
      await referralService.closeReferralLoop(tenantId, referralId);
      return { loopClosed: true };
    });

    logger.debug('Registered referral event handlers');
  }

  // ============================================================================
  // BILLING EVENT HANDLERS
  // ============================================================================

  private async registerBillingHandlers(): Promise<void> {
    // claim.submitted handlers
    onEvent('claim.submitted', 'log_submission', async (tenantId, payload, event) => {
      const { claimId, claimNumber, payerId, totalCents } = payload;
      await pool.query(
        `INSERT INTO claim_submission_log (id, tenant_id, claim_id, submitted_at, payer_id, amount_cents)
         VALUES ($1, $2, $3, NOW(), $4, $5)`,
        [crypto.randomUUID(), tenantId, claimId, payerId, totalCents]
      );
      return { submissionLogged: true };
    });

    onEvent('claim.submitted', 'start_tracking', async (tenantId, payload, event) => {
      const { claimId, payerId } = payload;
      // Set expected payment date based on payer (typically 30-45 days)
      const expectedPaymentDate = new Date();
      expectedPaymentDate.setDate(expectedPaymentDate.getDate() + 30);

      await pool.query(
        `UPDATE claims SET expected_payment_date = $1 WHERE id = $2`,
        [expectedPaymentDate, claimId]
      );
      return { trackingStarted: true };
    });

    // claim.paid handlers
    onEvent('claim.paid', 'check_underpayment', async (tenantId, payload, event) => {
      const { claimId, paidAmountCents, lineItems } = payload;
      if (lineItems && Array.isArray(lineItems)) {
        for (const item of lineItems) {
          await revenueCycleService.identifyUnderpayment(tenantId, {
            claimId,
            payerId: payload.payerId,
            cptCode: item.cptCode,
            paidAmountCents: item.paidAmountCents,
            units: item.units,
          });
        }
      }
      return { underpaymentChecked: true };
    });

    onEvent('claim.paid', 'update_ar', async (tenantId, payload, event) => {
      const { claimId, paidAmountCents } = payload;
      await pool.query(
        `UPDATE claims SET paid_amount = paid_amount + $1, status =
         CASE WHEN paid_amount + $1 >= total_charges THEN 'paid' ELSE 'partial' END
         WHERE id = $2`,
        [paidAmountCents / 100, claimId]
      );
      return { arUpdated: true };
    });

    // claim.denied handlers
    onEvent('claim.denied', 'categorize_denial', async (tenantId, payload, event) => {
      const { claimId, denialCode, denialReason, amountCents } = payload;
      await revenueCycleService.processDenial(tenantId, {
        claimId,
        denialCode,
        denialReason,
        amountCents,
        payerId: payload.payerId,
      });
      return { denialCategorized: true };
    });

    onEvent('claim.denied', 'create_appeal_task', async (tenantId, payload, event) => {
      const { claimId, denialCode, denialReason } = payload;
      await pool.query(
        `INSERT INTO tasks (id, tenant_id, task_type, title, description, status, priority, due_date, created_at)
         VALUES ($1, $2, 'appeal_review', $3, $4, 'pending', 'high', NOW() + INTERVAL '7 days', NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          `Review denial for claim: ${claimId.substring(0, 8)}`,
          `Denial Code: ${denialCode}\nReason: ${denialReason}`,
        ]
      );
      return { taskCreated: true };
    });

    onEvent('claim.denied', 'notify_billing_staff', async (tenantId, payload, event) => {
      const { claimId, claimNumber, denialReason, amountCents } = payload;
      await pool.query(
        `INSERT INTO staff_notifications (id, tenant_id, notification_type, title, message, priority, created_at)
         VALUES ($1, $2, 'claim_denied', $3, $4, 'high', NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          `Claim ${claimNumber || claimId.substring(0, 8)} Denied`,
          `Amount: $${(amountCents / 100).toFixed(2)} - ${denialReason}`,
        ]
      );
      return { billingNotified: true };
    });

    // payment.received handlers
    onEvent('payment.received', 'apply_to_balance', async (tenantId, payload, event) => {
      const { paymentId, patientId, amountCents, claimId } = payload;
      // Apply payment to patient balance or specific claim
      if (claimId) {
        await pool.query(
          `INSERT INTO claim_payments (id, tenant_id, claim_id, amount_cents, payment_date, created_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [paymentId, tenantId, claimId, amountCents]
        );
      }
      return { paymentApplied: true };
    });

    onEvent('payment.received', 'check_payment_plan', async (tenantId, payload, event) => {
      const { patientId, amountCents } = payload;
      // Check if patient has active payment plan
      const planResult = await pool.query(
        `SELECT id FROM payment_plans WHERE patient_id = $1 AND tenant_id = $2 AND status = 'active'`,
        [patientId, tenantId]
      );

      if (planResult.rowCount) {
        await revenueCycleService.processPaymentPlanPayment(tenantId, planResult.rows[0].id, {
          amountCents,
          paymentMethod: 'payment',
        });
        return { paymentPlanUpdated: true };
      }
      return { paymentPlanUpdated: false };
    });

    onEvent('payment.received', 'send_receipt', async (tenantId, payload, event) => {
      const { patientId, amountCents } = payload;
      // Queue receipt SMS
      await pool.query(
        `INSERT INTO sms_queue (id, tenant_id, patient_id, message_type, scheduled_at, status, created_at)
         VALUES ($1, $2, $3, 'payment_receipt', NOW(), 'pending', NOW())`,
        [crypto.randomUUID(), tenantId, patientId]
      );
      return { receiptQueued: true };
    });

    logger.debug('Registered billing event handlers');
  }

  // ============================================================================
  // CLINICAL EVENT HANDLERS
  // ============================================================================

  private async registerClinicalHandlers(): Promise<void> {
    // lab_result.received handlers
    onEvent('lab_result.received', 'notify_provider', async (tenantId, payload, event) => {
      const { resultId, providerId, patientName, testName, isCritical } = payload;
      await pool.query(
        `INSERT INTO provider_notifications (id, tenant_id, provider_id, notification_type, title, message, priority, created_at)
         VALUES ($1, $2, $3, 'lab_result', $4, $5, $6, NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          providerId,
          isCritical ? 'CRITICAL: Lab Result' : 'Lab Result Ready',
          `${testName} results for ${patientName}`,
          isCritical ? 'critical' : 'normal',
        ]
      );
      return { providerNotified: true };
    });

    onEvent('lab_result.received', 'notify_patient', async (tenantId, payload, event) => {
      const { resultId, patientId } = payload;
      return smsWorkflowService.sendLabResultsReady(tenantId, patientId, resultId);
    });

    onEvent('lab_result.received', 'check_quality_measures', async (tenantId, payload, event) => {
      const { patientId, testType } = payload;
      // Check if this lab satisfies any quality measure requirements
      // e.g., A1C for diabetes, TB test for biologics
      return { qualityChecked: true };
    });

    // prescription.sent handlers
    onEvent('prescription.sent', 'track_for_pi', async (tenantId, payload, event) => {
      const { prescriptionId, providerId } = payload;
      // Track for PI e-prescribing measure
      await pool.query(
        `INSERT INTO pi_measure_tracking (id, tenant_id, measure_name, provider_id, entity_id, tracked_at)
         VALUES ($1, $2, 'e-Prescribing', $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), tenantId, providerId, prescriptionId]
      );
      return { piTracked: true };
    });

    onEvent('prescription.sent', 'notify_patient', async (tenantId, payload, event) => {
      const { prescriptionId, patientId, pharmacyName } = payload;
      return smsWorkflowService.sendPrescriptionSent(tenantId, patientId, prescriptionId, pharmacyName || 'your pharmacy');
    });

    // treatment_plan.created handlers
    onEvent('treatment_plan.created', 'schedule_adherence_reminders', async (tenantId, payload, event) => {
      const { treatmentPlanId, patientId, treatmentType, endDate } = payload;
      await patientEngagementService.scheduleAdherenceReminders(
        tenantId,
        patientId,
        treatmentType || 'general',
        'daily',
        '09:00',
        endDate ? new Date(endDate) : undefined,
        treatmentPlanId
      );
      return { remindersScheduled: true };
    });

    onEvent('treatment_plan.created', 'send_educational_content', async (tenantId, payload, event) => {
      const { patientId, diagnosisCode, encounterId } = payload;
      if (diagnosisCode) {
        await patientEngagementService.sendEducationalContent(tenantId, patientId, diagnosisCode, encounterId);
      }
      return { educationalContentSent: true };
    });

    logger.debug('Registered clinical event handlers');
  }

  // ============================================================================
  // INVENTORY EVENT HANDLERS
  // ============================================================================

  private async registerInventoryHandlers(): Promise<void> {
    // inventory.low_stock handlers
    onEvent('inventory.low_stock', 'create_purchase_order', async (tenantId, payload, event) => {
      const { itemId, itemName, currentQuantity, reorderQuantity, preferredVendorId, unitCostCents } = payload;
      const po = await inventoryService.createPurchaseOrder(
        tenantId,
        preferredVendorId,
        [{ itemId, quantity: reorderQuantity || currentQuantity * 2, unitCostCents: unitCostCents || 0 }],
        event.sourceUserId || 'system',
        { notes: 'Auto-generated from low stock alert' }
      );
      return { purchaseOrderCreated: true, poId: po.id };
    });

    onEvent('inventory.low_stock', 'notify_manager', async (tenantId, payload, event) => {
      const { itemName, currentQuantity, reorderPoint } = payload;
      await pool.query(
        `INSERT INTO staff_notifications (id, tenant_id, notification_type, title, message, priority, created_at)
         VALUES ($1, $2, 'low_stock', $3, $4, 'normal', NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          `Low Stock Alert: ${itemName}`,
          `Current: ${currentQuantity}, Reorder Point: ${reorderPoint}`,
        ]
      );
      return { managerNotified: true };
    });

    // inventory.expired handlers
    onEvent('inventory.expired', 'remove_from_available', async (tenantId, payload, event) => {
      const { lotId, itemId, quantity } = payload;
      await inventoryService.updateLotStatus(tenantId, lotId, LotStatus.EXPIRED);
      return { removedFromInventory: true };
    });

    onEvent('inventory.expired', 'log_waste', async (tenantId, payload, event) => {
      const { lotId, itemId, itemName, quantity, valueCents } = payload;
      await pool.query(
        `INSERT INTO inventory_waste_log (id, tenant_id, item_id, lot_id, quantity, value_cents, waste_reason, logged_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'expired', NOW())`,
        [crypto.randomUUID(), tenantId, itemId, lotId, quantity, valueCents || 0]
      );
      return { wasteLogged: true };
    });

    onEvent('inventory.expired', 'alert_staff', async (tenantId, payload, event) => {
      const { itemName, quantity, expirationDate } = payload;
      await pool.query(
        `INSERT INTO staff_notifications (id, tenant_id, notification_type, title, message, priority, created_at)
         VALUES ($1, $2, 'expired_inventory', $3, $4, 'high', NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          `Expired Inventory: ${itemName}`,
          `${quantity} units expired on ${expirationDate}. Please dispose properly.`,
        ]
      );
      return { staffAlerted: true };
    });

    // equipment.maintenance_due handlers
    onEvent('equipment.maintenance_due', 'schedule_maintenance', async (tenantId, payload, event) => {
      const { equipmentId, equipmentName, maintenanceType, dueDate } = payload;
      await pool.query(
        `INSERT INTO equipment_maintenance_schedule (id, tenant_id, equipment_id, maintenance_type, scheduled_date, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'scheduled', NOW())`,
        [crypto.randomUUID(), tenantId, equipmentId, maintenanceType || 'routine', dueDate]
      );
      return { maintenanceScheduled: true };
    });

    onEvent('equipment.maintenance_due', 'notify_staff', async (tenantId, payload, event) => {
      const { equipmentName, dueDate } = payload;
      await pool.query(
        `INSERT INTO staff_notifications (id, tenant_id, notification_type, title, message, priority, created_at)
         VALUES ($1, $2, 'equipment_maintenance', $3, $4, 'normal', NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          `Maintenance Due: ${equipmentName}`,
          `Scheduled maintenance due on ${dueDate}`,
        ]
      );
      return { staffNotified: true };
    });

    logger.debug('Registered inventory event handlers');
  }

  // ============================================================================
  // PATIENT EVENT HANDLERS
  // ============================================================================

  private async registerPatientHandlers(): Promise<void> {
    // patient.birthday handlers
    onEvent('patient.birthday', 'send_birthday_message', async (tenantId, payload, event) => {
      const { patientId, offer } = payload;
      return patientEngagementService.sendBirthdayMessage(tenantId, patientId, offer || '10% off your next visit');
    });

    onEvent('patient.birthday', 'award_bonus_points', async (tenantId, payload, event) => {
      const { patientId } = payload;
      await patientEngagementService.awardPoints(tenantId, patientId, 50, 'birthday', 'Birthday bonus points');
      return { pointsAwarded: 50 };
    });

    // patient.created handlers
    onEvent('patient.created', 'send_welcome', async (tenantId, payload, event) => {
      const { patientId, firstName } = payload;
      await patientEngagementService.sendWelcomeMessage(tenantId, patientId);
      return { welcomeSent: true };
    });

    onEvent('patient.created', 'activate_portal', async (tenantId, payload, event) => {
      const { patientId, email } = payload;
      if (email) {
        await pool.query(
          `INSERT INTO portal_invitations (id, tenant_id, patient_id, email, status, created_at)
           VALUES ($1, $2, $3, $4, 'pending', NOW())
           ON CONFLICT DO NOTHING`,
          [crypto.randomUUID(), tenantId, patientId, email]
        );
      }
      return { portalInvitationCreated: true };
    });

    onEvent('patient.created', 'enroll_in_loyalty', async (tenantId, payload, event) => {
      const { patientId } = payload;
      await patientEngagementService.enrollInLoyaltyProgram(tenantId, patientId);
      return { enrolledInLoyalty: true };
    });

    // patient.inactive handlers
    onEvent('patient.inactive', 'trigger_recall_campaign', async (tenantId, payload, event) => {
      const { patientId, lastVisitDate, daysSinceVisit } = payload;
      await pool.query(
        `INSERT INTO recall_queue (id, tenant_id, patient_id, recall_type, due_date, status, created_at)
         VALUES ($1, $2, $3, 'inactive_patient', NOW(), 'pending', NOW())
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), tenantId, patientId]
      );
      return { recallTriggered: true };
    });

    logger.debug('Registered patient event handlers');
  }

  // ============================================================================
  // QUALITY MEASURE HANDLERS
  // ============================================================================

  private async registerQualityHandlers(): Promise<void> {
    // quality_measure.gap_identified handlers
    onEvent('quality_measure.gap_identified', 'create_care_gap_task', async (tenantId, payload, event) => {
      const { patientId, measureId, measureName, recommendedAction } = payload;
      await pool.query(
        `INSERT INTO care_gap_tasks (id, tenant_id, patient_id, measure_id, recommended_action, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
        [crypto.randomUUID(), tenantId, patientId, measureId, recommendedAction]
      );
      return { careGapTaskCreated: true };
    });

    // quality_measure.met handlers
    onEvent('quality_measure.met', 'log_measure_achievement', async (tenantId, payload, event) => {
      const { patientId, measureId, encounterId, providerId } = payload;
      await pool.query(
        `INSERT INTO quality_measure_results (id, tenant_id, patient_id, measure_id, encounter_id, provider_id, numerator_met, evaluated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
         ON CONFLICT (tenant_id, patient_id, measure_id, encounter_id) DO UPDATE SET numerator_met = true`,
        [crypto.randomUUID(), tenantId, patientId, measureId, encounterId, providerId]
      );
      return { measureLogged: true };
    });

    logger.debug('Registered quality measure event handlers');
  }

  // ============================================================================
  // STAFF EVENT HANDLERS
  // ============================================================================

  private async registerStaffHandlers(): Promise<void> {
    // staff.overtime_alert handlers
    onEvent('staff.overtime_alert', 'notify_manager', async (tenantId, payload, event) => {
      const { staffId, staffName, hoursWorked, threshold } = payload;
      await pool.query(
        `INSERT INTO staff_notifications (id, tenant_id, notification_type, title, message, priority, created_at)
         VALUES ($1, $2, 'overtime_alert', $3, $4, 'high', NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          `Overtime Alert: ${staffName || staffId}`,
          `${hoursWorked} hours worked (threshold: ${threshold})`,
        ]
      );
      return { managerNotified: true };
    });

    onEvent('staff.overtime_alert', 'create_overtime_record', async (tenantId, payload, event) => {
      const { staffId, hoursWorked, weekStart } = payload;
      await pool.query(
        `INSERT INTO overtime_alerts (id, tenant_id, staff_id, hours_worked, week_start, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [crypto.randomUUID(), tenantId, staffId, hoursWorked, weekStart]
      );
      return { recordCreated: true };
    });

    // staff.credential_expiring handlers
    onEvent('staff.credential_expiring', 'notify_staff', async (tenantId, payload, event) => {
      const { staffId, credentialType, expirationDate, daysUntilExpiration } = payload;
      await pool.query(
        `INSERT INTO staff_notifications (id, tenant_id, notification_type, title, message, priority, staff_id, created_at)
         VALUES ($1, $2, 'credential_expiring', $3, $4, $5, $6, NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          `Credential Expiring: ${credentialType}`,
          `Expires on ${expirationDate} (${daysUntilExpiration} days)`,
          daysUntilExpiration <= 30 ? 'high' : 'normal',
          staffId,
        ]
      );
      return { staffNotified: true };
    });

    onEvent('staff.credential_expiring', 'create_renewal_task', async (tenantId, payload, event) => {
      const { staffId, credentialType, expirationDate } = payload;
      await pool.query(
        `INSERT INTO tasks (id, tenant_id, task_type, title, description, status, priority, due_date, assignee_id, created_at)
         VALUES ($1, $2, 'credential_renewal', $3, $4, 'pending', 'high', $5, $6, NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          `Renew ${credentialType}`,
          `Credential expires on ${expirationDate}`,
          expirationDate,
          staffId,
        ]
      );
      return { taskCreated: true };
    });

    logger.debug('Registered staff event handlers');
  }

  // ============================================================================
  // BRIDGE TO LEGACY WORKFLOW ORCHESTRATOR
  // ============================================================================

  /**
   * Bridge new events to legacy workflowOrchestrator
   */
  async bridgeToLegacyOrchestrator(event: Event): Promise<void> {
    // Map new event names to legacy event types
    const eventMapping: Record<string, string> = {
      'appointment.scheduled': 'appointment_scheduled',
      'appointment.completed': 'appointment_completed',
      'appointment.cancelled': 'appointment_cancelled',
      'encounter.signed': 'encounter_signed',
      'claim.submitted': 'claim_submitted',
      'claim.denied': 'claim_denied',
      'claim.paid': 'claim_paid',
      'lab_result.received': 'lab_result_received',
      'prescription.sent': 'prescription_sent',
      'treatment_plan.created': 'treatment_plan_created',
      'patient.birthday': 'patient_birthday',
    };

    const legacyEventType = eventMapping[event.eventName];

    if (legacyEventType) {
      const legacyEvent: WorkflowEvent = {
        type: legacyEventType as any,
        tenantId: event.tenantId,
        userId: event.sourceUserId,
        entityType: event.entityType || 'unknown',
        entityId: event.entityId || '',
        data: event.payload,
        timestamp: new Date(),
      };

      await workflowOrchestrator.processEvent(legacyEvent);
    }
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Emit appointment scheduled event with full data gathering
   */
  async emitAppointmentScheduled(
    tenantId: string,
    appointmentId: string,
    additionalData?: Record<string, any>
  ): Promise<void> {
    // Get full appointment details
    const apptResult = await pool.query(
      `SELECT a.*, p.id as patient_id, p.first_name, p.last_name,
              pr.full_name as provider_name,
              at.name as appointment_type,
              (SELECT COUNT(*) = 0 FROM appointments WHERE patient_id = a.patient_id AND id != a.id) as is_new_patient
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN providers pr ON pr.id = a.provider_id
       LEFT JOIN appointment_types at ON at.id = a.appointment_type_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (apptResult.rowCount) {
      const appt = apptResult.rows[0];
      await EventEmitters.appointmentScheduled(tenantId, appointmentId, {
        patientId: appt.patient_id,
        patientName: `${appt.first_name} ${appt.last_name}`,
        providerId: appt.provider_id,
        providerName: appt.provider_name,
        startTime: appt.start_time,
        appointmentType: appt.appointment_type,
        isNewPatient: appt.is_new_patient,
        locationId: appt.location_id,
        ...additionalData,
      });
    }
  }

  /**
   * Emit appointment completed event with encounter data
   */
  async emitAppointmentCompleted(
    tenantId: string,
    appointmentId: string,
    additionalData?: Record<string, any>
  ): Promise<void> {
    // Get appointment with encounter
    const result = await pool.query(
      `SELECT a.*, e.id as encounter_id,
              p.id as patient_id, p.first_name, p.last_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN encounters e ON e.appointment_id = a.id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [appointmentId, tenantId]
    );

    if (result.rowCount) {
      const appt = result.rows[0];

      // Get procedure codes if encounter exists
      let procedureCodes: string[] = [];
      if (appt.encounter_id) {
        const procResult = await pool.query(
          `SELECT DISTINCT cpt_code FROM encounter_procedures WHERE encounter_id = $1`,
          [appt.encounter_id]
        );
        procedureCodes = procResult.rows.map(r => r.cpt_code);
      }

      await EventEmitters.appointmentCompleted(tenantId, appointmentId, {
        patientId: appt.patient_id,
        patientName: `${appt.first_name} ${appt.last_name}`,
        providerId: appt.provider_id,
        encounterId: appt.encounter_id,
        completedAt: new Date().toISOString(),
        procedureCodes,
        ...additionalData,
      });
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const masterEventOrchestrator = new MasterEventOrchestrator();

// ============================================================================
// INITIALIZATION FUNCTION (Call from app startup)
// ============================================================================

export async function initializeEventOrchestrator(): Promise<void> {
  await masterEventOrchestrator.initialize();
}

export function shutdownEventOrchestrator(): void {
  masterEventOrchestrator.shutdown();
}
