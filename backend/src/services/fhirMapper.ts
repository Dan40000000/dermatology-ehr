/**
 * FHIR R4 Mapping Service
 * Maps database models to FHIR R4 resources
 * Supports: Patient, Practitioner, Encounter, Observation, Condition, Procedure, Appointment, Organization
 */

import { pool } from "../db/pool";

// FHIR R4 Resource Interfaces
export interface FHIRIdentifier {
  system: string;
  value: string;
}

export interface FHIRCoding {
  system?: string;
  code: string;
  display?: string;
}

export interface FHIRCodeableConcept {
  coding?: FHIRCoding[];
  text?: string;
}

export interface FHIRReference {
  reference: string;
  display?: string;
}

export interface FHIRHumanName {
  use?: string;
  family?: string;
  given?: string[];
  text?: string;
}

export interface FHIRContactPoint {
  system: "phone" | "email" | "fax" | "pager" | "url" | "sms" | "other";
  value: string;
  use?: "home" | "work" | "temp" | "old" | "mobile";
}

export interface FHIRAddress {
  use?: "home" | "work" | "temp" | "old" | "billing";
  type?: "postal" | "physical" | "both";
  line?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface FHIRQuantity {
  value: number;
  unit: string;
  system?: string;
  code?: string;
}

export interface FHIRPeriod {
  start?: string;
  end?: string;
}

// Helper Functions
function mapGender(sex?: string): "male" | "female" | "other" | "unknown" {
  if (!sex) return "unknown";
  const s = sex.toUpperCase();
  if (s === "M") return "male";
  if (s === "F") return "female";
  if (s === "O") return "other";
  return "unknown";
}

function formatFHIRDate(date: any): string | undefined {
  if (!date) return undefined;
  if (typeof date === "string") return date.split("T")[0];
  if (date instanceof Date) return date.toISOString().split("T")[0];
  return undefined;
}

function formatFHIRDateTime(date: any): string | undefined {
  if (!date) return undefined;
  if (typeof date === "string") return date;
  if (date instanceof Date) return date.toISOString();
  return undefined;
}

function mapEncounterStatus(status?: string): "planned" | "arrived" | "triaged" | "in-progress" | "onleave" | "finished" | "cancelled" | "entered-in-error" | "unknown" {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (s === "draft" || s === "in_progress") return "in-progress";
  if (s === "completed") return "finished";
  if (s === "cancelled") return "cancelled";
  return "unknown";
}

function mapAppointmentStatus(status?: string): "proposed" | "pending" | "booked" | "arrived" | "fulfilled" | "cancelled" | "noshow" | "entered-in-error" | "checked-in" | "waitlist" {
  if (!status) return "pending";
  const s = status.toLowerCase();
  if (s === "scheduled") return "booked";
  if (s === "arrived" || s === "checked_in") return "arrived";
  if (s === "completed") return "fulfilled";
  if (s === "cancelled") return "cancelled";
  if (s === "no_show") return "noshow";
  return "pending";
}

function mapAllergyClinicalStatus(status?: string): FHIRCodeableConcept {
  const normalized = (status || "active").toLowerCase();
  let code = "active";
  if (normalized === "inactive") code = "inactive";
  if (normalized === "resolved") code = "resolved";
  return {
    coding: [
      {
        system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
        code,
      },
    ],
  };
}

function mapAllergyVerificationStatus(verifiedAt?: string | null): FHIRCodeableConcept {
  const code = verifiedAt ? "confirmed" : "unconfirmed";
  return {
    coding: [
      {
        system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
        code,
      },
    ],
  };
}

function mapAllergyCategory(allergenType?: string): string[] | undefined {
  if (!allergenType) return undefined;
  const normalized = allergenType.toLowerCase();
  if (normalized === "medication") return ["medication"];
  if (normalized === "food") return ["food"];
  if (normalized === "environmental") return ["environment"];
  return undefined;
}

function mapAllergyCriticality(severity?: string): "low" | "high" | "unable-to-assess" {
  if (!severity) return "unable-to-assess";
  const normalized = severity.toLowerCase();
  if (normalized === "severe") return "high";
  if (normalized === "moderate" || normalized === "mild") return "low";
  return "unable-to-assess";
}

/**
 * Map Patient from database to FHIR R4 Patient resource
 */
export function mapPatientToFHIR(dbPatient: any): any {
  const name: FHIRHumanName[] = [];
  if (dbPatient.last_name || dbPatient.first_name) {
    name.push({
      use: "official",
      family: dbPatient.last_name,
      given: dbPatient.first_name ? [dbPatient.first_name] : undefined,
    });
  }

  const telecom: FHIRContactPoint[] = [];
  if (dbPatient.phone) {
    telecom.push({ system: "phone", value: dbPatient.phone, use: "home" });
  }
  if (dbPatient.email) {
    telecom.push({ system: "email", value: dbPatient.email });
  }

  const address: FHIRAddress[] = [];
  if (dbPatient.address || dbPatient.city || dbPatient.state || dbPatient.zip) {
    address.push({
      use: "home",
      type: "physical",
      line: dbPatient.address ? [dbPatient.address] : undefined,
      city: dbPatient.city,
      state: dbPatient.state,
      postalCode: dbPatient.zip,
      country: "US",
    });
  }

  return {
    resourceType: "Patient",
    id: dbPatient.id,
    meta: {
      lastUpdated: formatFHIRDateTime(dbPatient.updated_at || dbPatient.created_at),
    },
    identifier: [
      {
        system: "urn:derm-app:patient",
        value: dbPatient.id,
      },
    ],
    active: true,
    name: name.length > 0 ? name : undefined,
    telecom: telecom.length > 0 ? telecom : undefined,
    gender: mapGender(dbPatient.sex),
    birthDate: formatFHIRDate(dbPatient.dob),
    address: address.length > 0 ? address : undefined,
  };
}

/**
 * Map Practitioner from database to FHIR R4 Practitioner resource
 */
export function mapPractitionerToFHIR(dbProvider: any): any {
  const name: FHIRHumanName[] = [];
  if (dbProvider.full_name) {
    name.push({
      use: "official",
      text: dbProvider.full_name,
    });
  }

  return {
    resourceType: "Practitioner",
    id: dbProvider.id,
    meta: {
      lastUpdated: formatFHIRDateTime(dbProvider.updated_at || dbProvider.created_at),
    },
    identifier: [
      {
        system: "urn:derm-app:practitioner",
        value: dbProvider.id,
      },
    ],
    active: true,
    name: name.length > 0 ? name : undefined,
    qualification: dbProvider.specialty ? [
      {
        code: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "394582007",
              display: dbProvider.specialty,
            },
          ],
          text: dbProvider.specialty,
        },
      },
    ] : undefined,
  };
}

/**
 * Map Encounter from database to FHIR R4 Encounter resource
 */
export function mapEncounterToFHIR(dbEncounter: any): any {
  const participant = [];
  if (dbEncounter.provider_id) {
    participant.push({
      type: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
              code: "PPRF",
              display: "primary performer",
            },
          ],
        },
      ],
      individual: {
        reference: `Practitioner/${dbEncounter.provider_id}`,
      },
    });
  }

  const reasonCode: FHIRCodeableConcept[] = [];
  if (dbEncounter.chief_complaint) {
    reasonCode.push({
      text: dbEncounter.chief_complaint,
    });
  }

  return {
    resourceType: "Encounter",
    id: dbEncounter.id,
    meta: {
      lastUpdated: formatFHIRDateTime(dbEncounter.updated_at || dbEncounter.created_at),
    },
    identifier: [
      {
        system: "urn:derm-app:encounter",
        value: dbEncounter.id,
      },
    ],
    status: mapEncounterStatus(dbEncounter.status),
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: "AMB",
      display: "ambulatory",
    },
    subject: dbEncounter.patient_id ? {
      reference: `Patient/${dbEncounter.patient_id}`,
    } : undefined,
    participant: participant.length > 0 ? participant : undefined,
    period: {
      start: formatFHIRDateTime(dbEncounter.created_at),
      end: dbEncounter.status === "completed" ? formatFHIRDateTime(dbEncounter.updated_at) : undefined,
    },
    reasonCode: reasonCode.length > 0 ? reasonCode : undefined,
  };
}

/**
 * Map Vitals to FHIR R4 Observation resources
 * Returns an array of Observations (one per vital sign)
 */
export function mapVitalsToFHIRObservations(dbVital: any): any[] {
  const observations: any[] = [];
  const baseObservation = {
    meta: {
      lastUpdated: formatFHIRDateTime(dbVital.updated_at || dbVital.created_at),
    },
    identifier: [
      {
        system: "urn:derm-app:vital",
        value: dbVital.id,
      },
    ],
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "vital-signs",
            display: "Vital Signs",
          },
        ],
      },
    ],
    subject: dbVital.patient_id ? {
      reference: `Patient/${dbVital.patient_id}`,
    } : undefined,
    encounter: dbVital.encounter_id ? {
      reference: `Encounter/${dbVital.encounter_id}`,
    } : undefined,
    effectiveDateTime: formatFHIRDateTime(dbVital.created_at),
  };

  // Blood Pressure
  if (dbVital.bp_systolic && dbVital.bp_diastolic) {
    observations.push({
      resourceType: "Observation",
      id: `${dbVital.id}-bp`,
      ...baseObservation,
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "85354-9",
            display: "Blood pressure panel",
          },
        ],
        text: "Blood Pressure",
      },
      component: [
        {
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "8480-6",
                display: "Systolic blood pressure",
              },
            ],
          },
          valueQuantity: {
            value: dbVital.bp_systolic,
            unit: "mmHg",
            system: "http://unitsofmeasure.org",
            code: "mm[Hg]",
          },
        },
        {
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: "8462-4",
                display: "Diastolic blood pressure",
              },
            ],
          },
          valueQuantity: {
            value: dbVital.bp_diastolic,
            unit: "mmHg",
            system: "http://unitsofmeasure.org",
            code: "mm[Hg]",
          },
        },
      ],
    });
  }

  // Heart Rate
  if (dbVital.pulse) {
    observations.push({
      resourceType: "Observation",
      id: `${dbVital.id}-pulse`,
      ...baseObservation,
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "8867-4",
            display: "Heart rate",
          },
        ],
        text: "Pulse",
      },
      valueQuantity: {
        value: dbVital.pulse,
        unit: "beats/minute",
        system: "http://unitsofmeasure.org",
        code: "/min",
      },
    });
  }

  // Temperature
  if (dbVital.temp_c) {
    observations.push({
      resourceType: "Observation",
      id: `${dbVital.id}-temp`,
      ...baseObservation,
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "8310-5",
            display: "Body temperature",
          },
        ],
        text: "Temperature",
      },
      valueQuantity: {
        value: dbVital.temp_c,
        unit: "C",
        system: "http://unitsofmeasure.org",
        code: "Cel",
      },
    });
  }

  // Height
  if (dbVital.height_cm) {
    observations.push({
      resourceType: "Observation",
      id: `${dbVital.id}-height`,
      ...baseObservation,
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "8302-2",
            display: "Body height",
          },
        ],
        text: "Height",
      },
      valueQuantity: {
        value: dbVital.height_cm,
        unit: "cm",
        system: "http://unitsofmeasure.org",
        code: "cm",
      },
    });
  }

  // Weight
  if (dbVital.weight_kg) {
    observations.push({
      resourceType: "Observation",
      id: `${dbVital.id}-weight`,
      ...baseObservation,
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "29463-7",
            display: "Body weight",
          },
        ],
        text: "Weight",
      },
      valueQuantity: {
        value: dbVital.weight_kg,
        unit: "kg",
        system: "http://unitsofmeasure.org",
        code: "kg",
      },
    });
  }

  return observations;
}

/**
 * Map Encounter Diagnosis to FHIR R4 Condition resource
 */
export function mapDiagnosisToFHIRCondition(dbDiagnosis: any): any {
  return {
    resourceType: "Condition",
    id: dbDiagnosis.id,
    meta: {
      lastUpdated: formatFHIRDateTime(dbDiagnosis.updated_at || dbDiagnosis.created_at),
    },
    identifier: [
      {
        system: "urn:derm-app:diagnosis",
        value: dbDiagnosis.id,
      },
    ],
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: "active",
          display: "Active",
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
          code: "confirmed",
          display: "Confirmed",
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-category",
            code: "encounter-diagnosis",
            display: "Encounter Diagnosis",
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: "http://hl7.org/fhir/sid/icd-10",
          code: dbDiagnosis.icd10_code,
          display: dbDiagnosis.description,
        },
      ],
      text: dbDiagnosis.description,
    },
    subject: dbDiagnosis.patient_id ? {
      reference: `Patient/${dbDiagnosis.patient_id}`,
    } : undefined,
    encounter: dbDiagnosis.encounter_id ? {
      reference: `Encounter/${dbDiagnosis.encounter_id}`,
    } : undefined,
    recordedDate: formatFHIRDateTime(dbDiagnosis.created_at),
  };
}

/**
 * Map Charge (CPT code) to FHIR R4 Procedure resource
 */
export function mapChargeToProcedure(dbCharge: any): any {
  return {
    resourceType: "Procedure",
    id: dbCharge.id,
    meta: {
      lastUpdated: formatFHIRDateTime(dbCharge.updated_at || dbCharge.created_at),
    },
    identifier: [
      {
        system: "urn:derm-app:charge",
        value: dbCharge.id,
      },
    ],
    status: dbCharge.status === "paid" ? "completed" : "preparation",
    code: {
      coding: [
        {
          system: "http://www.ama-assn.org/go/cpt",
          code: dbCharge.cpt_code,
          display: dbCharge.description || dbCharge.cpt_code,
        },
      ],
      text: dbCharge.description || dbCharge.cpt_code,
    },
    subject: dbCharge.patient_id ? {
      reference: `Patient/${dbCharge.patient_id}`,
    } : undefined,
    encounter: dbCharge.encounter_id ? {
      reference: `Encounter/${dbCharge.encounter_id}`,
    } : undefined,
    performedDateTime: formatFHIRDateTime(dbCharge.created_at),
  };
}

/**
 * Map Appointment to FHIR R4 Appointment resource
 */
export function mapAppointmentToFHIR(dbAppointment: any): any {
  const participant = [];

  if (dbAppointment.patient_id) {
    participant.push({
      actor: {
        reference: `Patient/${dbAppointment.patient_id}`,
      },
      status: "accepted",
    });
  }

  if (dbAppointment.provider_id) {
    participant.push({
      actor: {
        reference: `Practitioner/${dbAppointment.provider_id}`,
      },
      status: "accepted",
    });
  }

  if (dbAppointment.location_id) {
    participant.push({
      actor: {
        reference: `Location/${dbAppointment.location_id}`,
      },
      status: "accepted",
    });
  }

  return {
    resourceType: "Appointment",
    id: dbAppointment.id,
    meta: {
      lastUpdated: formatFHIRDateTime(dbAppointment.updated_at || dbAppointment.created_at),
    },
    identifier: [
      {
        system: "urn:derm-app:appointment",
        value: dbAppointment.id,
      },
    ],
    status: mapAppointmentStatus(dbAppointment.status),
    serviceType: dbAppointment.appointment_type_name ? [
      {
        coding: [
          {
            system: "urn:derm-app:appointment-type",
            code: dbAppointment.appointment_type_id,
            display: dbAppointment.appointment_type_name,
          },
        ],
        text: dbAppointment.appointment_type_name,
      },
    ] : undefined,
    appointmentType: dbAppointment.appointment_type_name ? {
      coding: [
        {
          system: "urn:derm-app:appointment-type",
          code: dbAppointment.appointment_type_id,
          display: dbAppointment.appointment_type_name,
        },
      ],
    } : undefined,
    description: dbAppointment.notes,
    start: formatFHIRDateTime(dbAppointment.scheduled_start),
    end: formatFHIRDateTime(dbAppointment.scheduled_end),
    created: formatFHIRDateTime(dbAppointment.created_at),
    comment: dbAppointment.notes,
    participant: participant.length > 0 ? participant : undefined,
  };
}

/**
 * Map Tenant/Location to FHIR R4 Organization resource
 */
export function mapOrganizationToFHIR(dbOrg: any): any {
  const telecom: FHIRContactPoint[] = [];
  if (dbOrg.phone) {
    telecom.push({ system: "phone", value: dbOrg.phone });
  }
  if (dbOrg.email) {
    telecom.push({ system: "email", value: dbOrg.email });
  }

  const address: FHIRAddress[] = [];
  if (dbOrg.address) {
    address.push({
      use: "work",
      type: "physical",
      line: [dbOrg.address],
      city: dbOrg.city,
      state: dbOrg.state,
      postalCode: dbOrg.zip,
      country: "US",
    });
  }

  return {
    resourceType: "Organization",
    id: dbOrg.id,
    meta: {
      lastUpdated: formatFHIRDateTime(dbOrg.updated_at || dbOrg.created_at),
    },
    identifier: [
      {
        system: "urn:derm-app:organization",
        value: dbOrg.id,
      },
    ],
    active: true,
    type: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/organization-type",
            code: "prov",
            display: "Healthcare Provider",
          },
        ],
      },
    ],
    name: dbOrg.name,
    telecom: telecom.length > 0 ? telecom : undefined,
    address: address.length > 0 ? address : undefined,
  };
}

/**
 * Map patient allergy to FHIR R4 AllergyIntolerance resource
 */
export function mapAllergyToFHIR(dbAllergy: any): any {
  const category = mapAllergyCategory(dbAllergy.allergen_type);
  const reaction = dbAllergy.reaction
    ? [
        {
          manifestation: [{ text: dbAllergy.reaction }],
          severity: dbAllergy.severity ? dbAllergy.severity.toLowerCase() : undefined,
        },
      ]
    : undefined;

  return {
    resourceType: "AllergyIntolerance",
    id: dbAllergy.id,
    meta: {
      lastUpdated: formatFHIRDateTime(dbAllergy.updated_at || dbAllergy.created_at),
    },
    clinicalStatus: mapAllergyClinicalStatus(dbAllergy.status),
    verificationStatus: mapAllergyVerificationStatus(dbAllergy.verified_at),
    type: "allergy",
    category,
    criticality: mapAllergyCriticality(dbAllergy.severity),
    code: {
      text: dbAllergy.allergen,
    },
    patient: {
      reference: `Patient/${dbAllergy.patient_id}`,
    },
    onsetDateTime: formatFHIRDateTime(dbAllergy.onset_date),
    recordedDate: formatFHIRDateTime(dbAllergy.created_at),
    reaction,
    note: dbAllergy.notes ? [{ text: dbAllergy.notes }] : undefined,
  };
}

/**
 * Create FHIR Bundle for search results
 */
export function createFHIRBundle(entries: any[], type: "searchset" | "collection" = "searchset", total?: number): any {
  return {
    resourceType: "Bundle",
    type,
    total: total !== undefined ? total : entries.length,
    entry: entries.map((resource) => ({
      fullUrl: `${resource.resourceType}/${resource.id}`,
      resource,
    })),
  };
}

/**
 * Create FHIR OperationOutcome for errors
 */
export function createOperationOutcome(severity: "fatal" | "error" | "warning" | "information", code: string, details: string): any {
  return {
    resourceType: "OperationOutcome",
    issue: [
      {
        severity,
        code,
        diagnostics: details,
      },
    ],
  };
}

/**
 * Fetch patient data with encounter context for complete FHIR mapping
 */
export async function fetchPatientWithContext(patientId: string, tenantId: string): Promise<any> {
  const result = await pool.query(
    `SELECT * FROM patients WHERE id = $1 AND tenant_id = $2`,
    [patientId, tenantId]
  );
  return result.rows[0];
}

/**
 * Fetch diagnosis with patient context for Condition mapping
 */
export async function fetchDiagnosisWithContext(diagnosisId: string, tenantId: string): Promise<any> {
  const result = await pool.query(
    `SELECT ed.*, e.patient_id
     FROM encounter_diagnoses ed
     LEFT JOIN encounters e ON e.id = ed.encounter_id
     WHERE ed.id = $1 AND ed.tenant_id = $2`,
    [diagnosisId, tenantId]
  );
  return result.rows[0];
}

/**
 * Fetch charge with patient context for Procedure mapping
 */
export async function fetchChargeWithContext(chargeId: string, tenantId: string): Promise<any> {
  const result = await pool.query(
    `SELECT c.*, e.patient_id
     FROM charges c
     LEFT JOIN encounters e ON e.id = c.encounter_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [chargeId, tenantId]
  );
  return result.rows[0];
}

/**
 * Fetch vital with patient context for Observation mapping
 */
export async function fetchVitalWithContext(vitalId: string, tenantId: string): Promise<any> {
  const result = await pool.query(
    `SELECT v.*, e.patient_id
     FROM vitals v
     LEFT JOIN encounters e ON e.id = v.encounter_id
     WHERE v.id = $1 AND v.tenant_id = $2`,
    [vitalId, tenantId]
  );
  return result.rows[0];
}

/**
 * Fetch allergy with patient context for AllergyIntolerance mapping
 */
export async function fetchAllergyWithContext(allergyId: string, tenantId: string): Promise<any> {
  const result = await pool.query(
    `SELECT * FROM patient_allergies WHERE id = $1 AND tenant_id = $2`,
    [allergyId, tenantId]
  );
  return result.rows[0];
}
