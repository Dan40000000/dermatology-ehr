import crypto from "crypto";
import { pool } from "../db/pool";

/**
 * Clinical Decision Support (CDS) Engine
 *
 * Provides intelligent clinical alerts and recommendations:
 * - Drug interaction checking
 * - Follow-up reminders
 * - Preventive care gaps
 * - High-risk condition monitoring
 * - Evidence-based treatment suggestions
 * - Dermatology-specific alerts
 */

interface CDSCheck {
  patientId: string;
  encounterId?: string;
  tenantId: string;
}

interface CDSAlert {
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  actionRequired: boolean;
  evidence?: string;
  recommendations?: string[];
}

export class ClinicalDecisionSupportService {
  /**
   * Run comprehensive CDS checks for a patient
   */
  async runCDSChecks(check: CDSCheck): Promise<CDSAlert[]> {
    const alerts: CDSAlert[] = [];

    // Get patient data
    const patient = await this.getPatientData(check.patientId, check.tenantId);
    if (!patient) {
      throw new Error("Patient not found");
    }

    // Run various CDS checks
    const checkPromises = [
      this.checkFollowUpNeeded(patient, check.tenantId),
      this.checkPreventiveCare(patient, check.tenantId),
      this.checkHighRiskLesions(patient, check.tenantId),
      this.checkMedicationInteractions(patient, check.tenantId),
      this.checkLabResults(patient, check.tenantId),
      this.checkBiopsyFollowUp(patient, check.tenantId),
      this.checkSunProtection(patient, check.tenantId),
    ];

    const checkResults = await Promise.all(checkPromises);

    // Flatten and filter alerts
    checkResults.forEach((result) => {
      if (result) {
        if (Array.isArray(result)) {
          alerts.push(...result);
        } else {
          alerts.push(result);
        }
      }
    });

    // Store alerts in database
    for (const alert of alerts) {
      await this.storeAlert(alert, check);
    }

    return alerts;
  }

  /**
   * Get patient data for CDS checks
   */
  private async getPatientData(patientId: string, tenantId: string) {
    const result = await pool.query(
      `select
        p.*,
        extract(year from age(p.dob)) as age
       from patients p
       where p.id = $1 and p.tenant_id = $2`,
      [patientId, tenantId]
    );

    return result.rows[0];
  }

  /**
   * Check if follow-up appointments are needed
   */
  private async checkFollowUpNeeded(patient: any, tenantId: string): Promise<CDSAlert | null> {
    // Check last encounter date
    const lastEncounter = await pool.query(
      `select encounter_date, follow_up_recommended, follow_up_date
       from encounters
       where patient_id = $1 and tenant_id = $2
       order by encounter_date desc
       limit 1`,
      [patient.id, tenantId]
    );

    if (lastEncounter.rows.length === 0) return null;

    const encounter = lastEncounter.rows[0];
    if (!encounter.follow_up_recommended) return null;

    const followUpDate = new Date(encounter.follow_up_date);
    const today = new Date();
    const daysDiff = Math.floor((followUpDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      return {
        type: "overdue_followup",
        severity: "warning",
        title: "Overdue Follow-up Appointment",
        description: `Patient has an overdue follow-up appointment (was due ${Math.abs(daysDiff)} days ago)`,
        actionRequired: true,
        recommendations: ["Schedule follow-up appointment", "Contact patient to reschedule"],
      };
    } else if (daysDiff <= 7) {
      return {
        type: "upcoming_followup",
        severity: "info",
        title: "Upcoming Follow-up Appointment Due",
        description: `Follow-up appointment recommended in ${daysDiff} days`,
        actionRequired: false,
        recommendations: ["Ensure appointment is scheduled"],
      };
    }

    return null;
  }

  /**
   * Check for preventive care gaps
   */
  private async checkPreventiveCare(patient: any, tenantId: string): Promise<CDSAlert[]> {
    const alerts: CDSAlert[] = [];
    const age = patient.age;

    // Check last full body skin exam
    const lastSkinExam = await pool.query(
      `select encounter_date
       from encounters
       where patient_id = $1 and tenant_id = $2
       and chief_complaint ilike '%skin exam%'
       order by encounter_date desc
       limit 1`,
      [patient.id, tenantId]
    );

    if (lastSkinExam.rows.length > 0) {
      const lastExamDate = new Date(lastSkinExam.rows[0].encounter_date);
      const monthsSince = this.monthsBetween(lastExamDate, new Date());

      // Recommend annual skin exam for high-risk patients
      if (age > 40 && monthsSince > 12) {
        alerts.push({
          type: "preventive_skin_exam",
          severity: "info",
          title: "Annual Skin Exam Recommended",
          description: `Last full body skin exam was ${monthsSince} months ago. Annual screening recommended for patients over 40.`,
          actionRequired: false,
          evidence: "USPSTF guidelines for skin cancer screening",
          recommendations: ["Schedule full body skin exam", "Patient education on self-skin exams"],
        });
      }
    }

    // Check for history of skin cancer - need more frequent monitoring
    if (patient.medical_history && patient.medical_history.toLowerCase().includes("melanoma")) {
      const lastExam = lastSkinExam.rows.length > 0
        ? new Date(lastSkinExam.rows[0].encounter_date)
        : null;

      if (!lastExam || this.monthsBetween(lastExam, new Date()) > 6) {
        alerts.push({
          type: "high_risk_monitoring",
          severity: "warning",
          title: "High-Risk Patient Monitoring Due",
          description: "Patient with history of melanoma requires surveillance exam every 6 months",
          actionRequired: true,
          evidence: "National Comprehensive Cancer Network (NCCN) guidelines",
          recommendations: [
            "Schedule surveillance skin exam",
            "Consider baseline photography",
            "Review self-skin exam technique",
          ],
        });
      }
    }

    return alerts;
  }

  /**
   * Check for high-risk lesions requiring attention
   */
  private async checkHighRiskLesions(patient: any, tenantId: string): Promise<CDSAlert[]> {
    const alerts: CDSAlert[] = [];

    // Check for high/critical concern lesions
    const highRiskLesions = await pool.query(
      `select id, lesion_code, body_location, concern_level, clinical_impression
       from lesions
       where patient_id = $1 and tenant_id = $2
       and concern_level in ('high', 'critical')
       and status = 'active'`,
      [patient.id, tenantId]
    );

    for (const lesion of highRiskLesions.rows) {
      // Check if biopsy has been performed
      const biopsyCheck = await pool.query(
        `select biopsy_performed, biopsy_date
         from lesions
         where id = $1`,
        [lesion.id]
      );

      if (biopsyCheck.rows.length > 0 && !biopsyCheck.rows[0].biopsy_performed) {
        alerts.push({
          type: "biopsy_needed",
          severity: lesion.concern_level === "critical" ? "critical" : "warning",
          title: `High-Risk Lesion Requires Biopsy`,
          description: `Lesion ${lesion.lesion_code} at ${lesion.body_location} flagged as ${lesion.concern_level} concern without biopsy performed`,
          actionRequired: true,
          recommendations: [
            "Perform diagnostic biopsy",
            "Document informed consent",
            "Schedule pathology review",
          ],
        });
      }
    }

    // Check for AI-flagged high risk photos
    const aiHighRisk = await pool.query(
      `select p.id, p.body_location, a.primary_finding, a.risk_level
       from photos p
       join photo_ai_analysis a on a.photo_id = p.id
       where p.patient_id = $1 and p.tenant_id = $2
       and a.risk_level in ('high', 'critical')
       and p.ai_risk_flagged = true
       order by a.analyzed_at desc
       limit 5`,
      [patient.id, tenantId]
    );

    if (aiHighRisk.rows.length > 0) {
      alerts.push({
        type: "ai_risk_flag",
        severity: "warning",
        title: `AI Identified ${aiHighRisk.rows.length} High-Risk Image(s)`,
        description: `AI analysis flagged ${aiHighRisk.rows.length} image(s) as high or critical risk requiring clinical review`,
        actionRequired: true,
        recommendations: [
          "Review AI-flagged images",
          "Perform dermoscopic examination",
          "Consider biopsy if clinically concerning",
        ],
      });
    }

    return alerts;
  }

  /**
   * Check for medication interactions
   */
  private async checkMedicationInteractions(patient: any, tenantId: string): Promise<CDSAlert | null> {
    if (!patient.current_medications) return null;

    const medications = patient.current_medications.toLowerCase();

    // Check for photosensitizing medications
    const photosensitizers = [
      "doxycycline",
      "tetracycline",
      "hydrochlorothiazide",
      "furosemide",
      "nsaid",
      "ibuprofen",
      "naproxen",
    ];

    const hasPhotosensitizer = photosensitizers.some((med) => medications.includes(med));

    if (hasPhotosensitizer) {
      return {
        type: "photosensitivity_risk",
        severity: "info",
        title: "Photosensitizing Medication Alert",
        description: "Patient is taking medications that may increase sun sensitivity",
        actionRequired: false,
        evidence: "Common photosensitizing medications in dermatology",
        recommendations: [
          "Counsel on sun protection measures",
          "Recommend broad-spectrum SPF 30+ sunscreen",
          "Advise avoiding peak sun hours",
          "Monitor for phototoxic reactions",
        ],
      };
    }

    return null;
  }

  /**
   * Check lab results for abnormalities
   */
  private async checkLabResults(patient: any, tenantId: string): Promise<CDSAlert | null> {
    // Check for recent lab orders that need follow-up
    const pendingLabs = await pool.query(
      `select id, order_type, status, ordered_date
       from orders
       where patient_id = $1 and tenant_id = $2
       and order_type = 'Lab'
       and status in ('pending', 'in_progress')
       and ordered_date < now() - interval '14 days'
       order by ordered_date desc
       limit 5`,
      [patient.id, tenantId]
    );

    if (pendingLabs.rows.length > 0) {
      return {
        type: "pending_labs",
        severity: "info",
        title: "Pending Lab Results",
        description: `${pendingLabs.rows.length} lab order(s) pending for more than 14 days`,
        actionRequired: true,
        recommendations: ["Follow up on pending lab results", "Contact lab if delayed"],
      };
    }

    return null;
  }

  /**
   * Check for biopsy results that need follow-up
   */
  private async checkBiopsyFollowUp(patient: any, tenantId: string): Promise<CDSAlert | null> {
    const pendingBiopsies = await pool.query(
      `select l.id, l.lesion_code, l.body_location, l.biopsy_date
       from lesions l
       where l.patient_id = $1 and l.tenant_id = $2
       and l.biopsy_performed = true
       and l.biopsy_result is null
       and l.biopsy_date < now() - interval '14 days'`,
      [patient.id, tenantId]
    );

    if (pendingBiopsies.rows.length > 0) {
      return {
        type: "pending_biopsy_results",
        severity: "warning",
        title: "Pending Biopsy Results",
        description: `${pendingBiopsies.rows.length} biopsy result(s) pending for more than 14 days`,
        actionRequired: true,
        recommendations: [
          "Follow up with pathology",
          "Review results when available",
          "Contact patient with results",
          "Schedule follow-up if treatment needed",
        ],
      };
    }

    return null;
  }

  /**
   * Check sun protection counseling for high-risk patients
   */
  private async checkSunProtection(patient: any, tenantId: string): Promise<CDSAlert | null> {
    const age = patient.age;

    // Patients over 50 or with history of skin cancer should receive counseling
    const needsCounseling =
      age > 50 ||
      (patient.medical_history &&
        (patient.medical_history.toLowerCase().includes("skin cancer") ||
          patient.medical_history.toLowerCase().includes("melanoma")));

    if (needsCounseling) {
      // Check if counseling documented in recent visits
      const recentCounseling = await pool.query(
        `select id
         from encounters
         where patient_id = $1 and tenant_id = $2
         and encounter_date > now() - interval '12 months'
         and (soap_note ilike '%sun protection%' or soap_note ilike '%sunscreen%')
         limit 1`,
        [patient.id, tenantId]
      );

      if (recentCounseling.rows.length === 0) {
        return {
          type: "sun_protection_counseling",
          severity: "info",
          title: "Sun Protection Counseling Recommended",
          description: "High-risk patient should receive sun protection education",
          actionRequired: false,
          evidence: "American Academy of Dermatology recommendations",
          recommendations: [
            "Provide sun protection counseling",
            "Recommend daily broad-spectrum SPF 30+",
            "Advise protective clothing and seeking shade",
            "Educate on UV index and peak sun hours",
          ],
        };
      }
    }

    return null;
  }

  /**
   * Store alert in database
   */
  private async storeAlert(alert: CDSAlert, check: CDSCheck) {
    const alertId = crypto.randomUUID();

    await pool.query(
      `insert into cds_alerts (
        id, tenant_id, patient_id, encounter_id, alert_type,
        severity, title, description, action_required
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict do nothing`,
      [
        alertId,
        check.tenantId,
        check.patientId,
        check.encounterId || null,
        alert.type,
        alert.severity,
        alert.title,
        alert.description,
        alert.actionRequired,
      ]
    );
  }

  /**
   * Helper: Calculate months between two dates
   */
  private monthsBetween(date1: Date, date2: Date): number {
    const months =
      (date2.getFullYear() - date1.getFullYear()) * 12 +
      (date2.getMonth() - date1.getMonth());
    return months;
  }

  /**
   * Get active alerts for a patient
   */
  async getPatientAlerts(patientId: string, tenantId: string) {
    const result = await pool.query(
      `select
        id,
        alert_type as "alertType",
        severity,
        title,
        description,
        action_required as "actionRequired",
        dismissed,
        created_at as "createdAt"
       from cds_alerts
       where patient_id = $1 and tenant_id = $2
       and dismissed = false
       order by severity desc, created_at desc`,
      [patientId, tenantId]
    );

    return result.rows;
  }

  /**
   * Dismiss an alert
   */
  async dismissAlert(alertId: string, userId: string, tenantId: string) {
    await pool.query(
      `update cds_alerts
       set dismissed = true, dismissed_by = $1, dismissed_at = now()
       where id = $2 and tenant_id = $3`,
      [userId, alertId, tenantId]
    );
  }
}

export const clinicalDecisionSupportService = new ClinicalDecisionSupportService();
