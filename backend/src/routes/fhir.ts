/**
 * FHIR R4 API Routes
 * Comprehensive implementation of FHIR resources with search capabilities
 * Supports: Patient, Practitioner, Encounter, Observation, Condition, Procedure, Appointment, Organization
 */

import { Router } from "express";
import { pool } from "../db/pool";
import { requireFHIRAuth, requireFHIRScope, logFHIRAccess, FHIRAuthenticatedRequest } from "../middleware/fhirAuth";
import {
  mapPatientToFHIR,
  mapPractitionerToFHIR,
  mapEncounterToFHIR,
  mapVitalsToFHIRObservations,
  mapDiagnosisToFHIRCondition,
  mapChargeToProcedure,
  mapAppointmentToFHIR,
  mapOrganizationToFHIR,
  createFHIRBundle,
  createOperationOutcome,
  fetchDiagnosisWithContext,
  fetchChargeWithContext,
  fetchVitalWithContext,
} from "../services/fhirMapper";

export const fhirRouter = Router();

// ==================== PATIENT ENDPOINTS ====================

/**
 * GET /fhir/Patient/:id - Get single patient by ID
 */
fhirRouter.get("/Patient/:id", requireFHIRAuth, requireFHIRScope("Patient", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.fhirAuth!.tenantId;

    const result = await pool.query(
      `SELECT * FROM patients WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Patient with id ${id} not found`)
      );
    }

    await logFHIRAccess(req, "Patient", id, "read");
    return res.json(mapPatientToFHIR(result.rows[0]));
  } catch (error) {
    console.error("Error fetching patient:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

/**
 * GET /fhir/Patient - Search patients with FHIR search parameters
 * Supported params: name, identifier, birthdate, gender, _count, _offset
 */
fhirRouter.get("/Patient", requireFHIRAuth, requireFHIRScope("Patient", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const { name, identifier, birthdate, gender, _count = "50", _offset = "0" } = req.query;

    let query = `SELECT * FROM patients WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    // Apply search filters
    if (name) {
      query += ` AND (LOWER(first_name) LIKE LOWER($${paramIndex}) OR LOWER(last_name) LIKE LOWER($${paramIndex}))`;
      params.push(`%${name}%`);
      paramIndex++;
    }

    if (identifier) {
      query += ` AND id = $${paramIndex}`;
      params.push(identifier);
      paramIndex++;
    }

    if (birthdate) {
      query += ` AND dob = $${paramIndex}`;
      params.push(birthdate);
      paramIndex++;
    }

    if (gender) {
      const genderMap: any = { male: "M", female: "F", other: "O", unknown: null };
      query += ` AND sex = $${paramIndex}`;
      params.push(genderMap[gender as string]);
      paramIndex++;
    }

    // Count total matching records
    const countResult = await pool.query(query.replace("SELECT *", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(_count as string), parseInt(_offset as string));

    const result = await pool.query(query, params);
    const resources = result.rows.map(mapPatientToFHIR);

    await logFHIRAccess(req, "Patient", undefined, "search");
    return res.json(createFHIRBundle(resources, "searchset", total));
  } catch (error) {
    console.error("Error searching patients:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

// ==================== PRACTITIONER ENDPOINTS ====================

/**
 * GET /fhir/Practitioner/:id - Get single practitioner by ID
 */
fhirRouter.get("/Practitioner/:id", requireFHIRAuth, requireFHIRScope("Practitioner", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.fhirAuth!.tenantId;

    const result = await pool.query(
      `SELECT * FROM providers WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Practitioner with id ${id} not found`)
      );
    }

    await logFHIRAccess(req, "Practitioner", id, "read");
    return res.json(mapPractitionerToFHIR(result.rows[0]));
  } catch (error) {
    console.error("Error fetching practitioner:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

/**
 * GET /fhir/Practitioner - Search practitioners
 * Supported params: name, identifier, _count, _offset
 */
fhirRouter.get("/Practitioner", requireFHIRAuth, requireFHIRScope("Practitioner", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const { name, identifier, _count = "50", _offset = "0" } = req.query;

    let query = `SELECT * FROM providers WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (name) {
      query += ` AND LOWER(full_name) LIKE LOWER($${paramIndex})`;
      params.push(`%${name}%`);
      paramIndex++;
    }

    if (identifier) {
      query += ` AND id = $${paramIndex}`;
      params.push(identifier);
      paramIndex++;
    }

    const countResult = await pool.query(query.replace("SELECT *", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(_count as string), parseInt(_offset as string));

    const result = await pool.query(query, params);
    const resources = result.rows.map(mapPractitionerToFHIR);

    await logFHIRAccess(req, "Practitioner", undefined, "search");
    return res.json(createFHIRBundle(resources, "searchset", total));
  } catch (error) {
    console.error("Error searching practitioners:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

// ==================== ENCOUNTER ENDPOINTS ====================

/**
 * GET /fhir/Encounter/:id - Get single encounter by ID
 */
fhirRouter.get("/Encounter/:id", requireFHIRAuth, requireFHIRScope("Encounter", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.fhirAuth!.tenantId;

    const result = await pool.query(
      `SELECT * FROM encounters WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Encounter with id ${id} not found`)
      );
    }

    await logFHIRAccess(req, "Encounter", id, "read");
    return res.json(mapEncounterToFHIR(result.rows[0]));
  } catch (error) {
    console.error("Error fetching encounter:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

/**
 * GET /fhir/Encounter - Search encounters
 * Supported params: patient, date, status, _count, _offset
 */
fhirRouter.get("/Encounter", requireFHIRAuth, requireFHIRScope("Encounter", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const { patient, date, status, _count = "50", _offset = "0" } = req.query;

    let query = `SELECT * FROM encounters WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient) {
      query += ` AND patient_id = $${paramIndex}`;
      params.push(patient);
      paramIndex++;
    }

    if (date) {
      query += ` AND DATE(created_at) = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const countResult = await pool.query(query.replace("SELECT *", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(_count as string), parseInt(_offset as string));

    const result = await pool.query(query, params);
    const resources = result.rows.map(mapEncounterToFHIR);

    await logFHIRAccess(req, "Encounter", undefined, "search");
    return res.json(createFHIRBundle(resources, "searchset", total));
  } catch (error) {
    console.error("Error searching encounters:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

// ==================== OBSERVATION ENDPOINTS ====================

/**
 * GET /fhir/Observation/:id - Get single observation by ID
 * Note: ID format is {vitalId}-{type} (e.g., vital-123-bp)
 */
fhirRouter.get("/Observation/:id", requireFHIRAuth, requireFHIRScope("Observation", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.fhirAuth!.tenantId;

    // Parse ID to extract vital ID
    const vitalId = id.split("-").slice(0, -1).join("-");

    const dbVital = await fetchVitalWithContext(vitalId, tenantId);

    if (!dbVital) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Observation with id ${id} not found`)
      );
    }

    const observations = mapVitalsToFHIRObservations(dbVital);
    const observation = observations.find(obs => obs.id === id);

    if (!observation) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Observation with id ${id} not found`)
      );
    }

    await logFHIRAccess(req, "Observation", id, "read");
    return res.json(observation);
  } catch (error) {
    console.error("Error fetching observation:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

/**
 * GET /fhir/Observation - Search observations
 * Supported params: patient, date, code, encounter, _count, _offset
 */
fhirRouter.get("/Observation", requireFHIRAuth, requireFHIRScope("Observation", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const { patient, date, encounter, _count = "50", _offset = "0" } = req.query;

    let query = `
      SELECT v.*, e.patient_id
      FROM vitals v
      LEFT JOIN encounters e ON e.id = v.encounter_id
      WHERE v.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient) {
      query += ` AND e.patient_id = $${paramIndex}`;
      params.push(patient);
      paramIndex++;
    }

    if (date) {
      query += ` AND DATE(v.created_at) = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    if (encounter) {
      query += ` AND v.encounter_id = $${paramIndex}`;
      params.push(encounter);
      paramIndex++;
    }

    const countResult = await pool.query(query.replace("SELECT v.*, e.patient_id", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY v.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(_count as string), parseInt(_offset as string));

    const result = await pool.query(query, params);

    // Flatten all observations from vitals
    const allObservations = result.rows.flatMap(mapVitalsToFHIRObservations);

    await logFHIRAccess(req, "Observation", undefined, "search");
    return res.json(createFHIRBundle(allObservations, "searchset", total * 5)); // Approximate total
  } catch (error) {
    console.error("Error searching observations:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

// ==================== CONDITION ENDPOINTS ====================

/**
 * GET /fhir/Condition/:id - Get single condition by ID
 */
fhirRouter.get("/Condition/:id", requireFHIRAuth, requireFHIRScope("Condition", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.fhirAuth!.tenantId;

    const dbDiagnosis = await fetchDiagnosisWithContext(id, tenantId);

    if (!dbDiagnosis) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Condition with id ${id} not found`)
      );
    }

    await logFHIRAccess(req, "Condition", id, "read");
    return res.json(mapDiagnosisToFHIRCondition(dbDiagnosis));
  } catch (error) {
    console.error("Error fetching condition:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

/**
 * GET /fhir/Condition - Search conditions
 * Supported params: patient, code, encounter, _count, _offset
 */
fhirRouter.get("/Condition", requireFHIRAuth, requireFHIRScope("Condition", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const { patient, code, encounter, _count = "50", _offset = "0" } = req.query;

    let query = `
      SELECT ed.*, e.patient_id
      FROM encounter_diagnoses ed
      LEFT JOIN encounters e ON e.id = ed.encounter_id
      WHERE ed.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient) {
      query += ` AND e.patient_id = $${paramIndex}`;
      params.push(patient);
      paramIndex++;
    }

    if (code) {
      query += ` AND ed.icd10_code = $${paramIndex}`;
      params.push(code);
      paramIndex++;
    }

    if (encounter) {
      query += ` AND ed.encounter_id = $${paramIndex}`;
      params.push(encounter);
      paramIndex++;
    }

    const countResult = await pool.query(query.replace("SELECT ed.*, e.patient_id", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY ed.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(_count as string), parseInt(_offset as string));

    const result = await pool.query(query, params);
    const resources = result.rows.map(mapDiagnosisToFHIRCondition);

    await logFHIRAccess(req, "Condition", undefined, "search");
    return res.json(createFHIRBundle(resources, "searchset", total));
  } catch (error) {
    console.error("Error searching conditions:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

// ==================== PROCEDURE ENDPOINTS ====================

/**
 * GET /fhir/Procedure/:id - Get single procedure by ID
 */
fhirRouter.get("/Procedure/:id", requireFHIRAuth, requireFHIRScope("Procedure", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.fhirAuth!.tenantId;

    const dbCharge = await fetchChargeWithContext(id, tenantId);

    if (!dbCharge) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Procedure with id ${id} not found`)
      );
    }

    await logFHIRAccess(req, "Procedure", id, "read");
    return res.json(mapChargeToProcedure(dbCharge));
  } catch (error) {
    console.error("Error fetching procedure:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

/**
 * GET /fhir/Procedure - Search procedures
 * Supported params: patient, date, code, encounter, _count, _offset
 */
fhirRouter.get("/Procedure", requireFHIRAuth, requireFHIRScope("Procedure", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const { patient, date, code, encounter, _count = "50", _offset = "0" } = req.query;

    let query = `
      SELECT c.*, e.patient_id
      FROM charges c
      LEFT JOIN encounters e ON e.id = c.encounter_id
      WHERE c.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient) {
      query += ` AND e.patient_id = $${paramIndex}`;
      params.push(patient);
      paramIndex++;
    }

    if (date) {
      query += ` AND DATE(c.created_at) = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    if (code) {
      query += ` AND c.cpt_code = $${paramIndex}`;
      params.push(code);
      paramIndex++;
    }

    if (encounter) {
      query += ` AND c.encounter_id = $${paramIndex}`;
      params.push(encounter);
      paramIndex++;
    }

    const countResult = await pool.query(query.replace("SELECT c.*, e.patient_id", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(_count as string), parseInt(_offset as string));

    const result = await pool.query(query, params);
    const resources = result.rows.map(mapChargeToProcedure);

    await logFHIRAccess(req, "Procedure", undefined, "search");
    return res.json(createFHIRBundle(resources, "searchset", total));
  } catch (error) {
    console.error("Error searching procedures:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

// ==================== APPOINTMENT ENDPOINTS ====================

/**
 * GET /fhir/Appointment/:id - Get single appointment by ID
 */
fhirRouter.get("/Appointment/:id", requireFHIRAuth, requireFHIRScope("Appointment", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.fhirAuth!.tenantId;

    const result = await pool.query(
      `SELECT a.*, at.name as appointment_type_name
       FROM appointments a
       LEFT JOIN appointment_types at ON at.id = a.appointment_type_id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Appointment with id ${id} not found`)
      );
    }

    await logFHIRAccess(req, "Appointment", id, "read");
    return res.json(mapAppointmentToFHIR(result.rows[0]));
  } catch (error) {
    console.error("Error fetching appointment:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

/**
 * GET /fhir/Appointment - Search appointments
 * Supported params: patient, date, status, practitioner, _count, _offset
 */
fhirRouter.get("/Appointment", requireFHIRAuth, requireFHIRScope("Appointment", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const { patient, date, status, practitioner, _count = "50", _offset = "0" } = req.query;

    let query = `
      SELECT a.*, at.name as appointment_type_name
      FROM appointments a
      LEFT JOIN appointment_types at ON at.id = a.appointment_type_id
      WHERE a.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (patient) {
      query += ` AND a.patient_id = $${paramIndex}`;
      params.push(patient);
      paramIndex++;
    }

    if (date) {
      query += ` AND DATE(a.scheduled_start) = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    if (status) {
      query += ` AND a.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (practitioner) {
      query += ` AND a.provider_id = $${paramIndex}`;
      params.push(practitioner);
      paramIndex++;
    }

    const countResult = await pool.query(query.replace("SELECT a.*, at.name as appointment_type_name", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY a.scheduled_start DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(_count as string), parseInt(_offset as string));

    const result = await pool.query(query, params);
    const resources = result.rows.map(mapAppointmentToFHIR);

    await logFHIRAccess(req, "Appointment", undefined, "search");
    return res.json(createFHIRBundle(resources, "searchset", total));
  } catch (error) {
    console.error("Error searching appointments:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

// ==================== ORGANIZATION ENDPOINTS ====================

/**
 * GET /fhir/Organization/:id - Get single organization by ID
 */
fhirRouter.get("/Organization/:id", requireFHIRAuth, requireFHIRScope("Organization", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.fhirAuth!.tenantId;

    // Try locations first, then tenants
    let result = await pool.query(
      `SELECT * FROM locations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      result = await pool.query(
        `SELECT * FROM tenants WHERE id = $1`,
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json(
        createOperationOutcome("error", "not-found", `Organization with id ${id} not found`)
      );
    }

    await logFHIRAccess(req, "Organization", id, "read");
    return res.json(mapOrganizationToFHIR(result.rows[0]));
  } catch (error) {
    console.error("Error fetching organization:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

/**
 * GET /fhir/Organization - Search organizations
 */
fhirRouter.get("/Organization", requireFHIRAuth, requireFHIRScope("Organization", "read"), async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const { name, _count = "50", _offset = "0" } = req.query;

    let query = `SELECT * FROM locations WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (name) {
      query += ` AND LOWER(name) LIKE LOWER($${paramIndex})`;
      params.push(`%${name}%`);
      paramIndex++;
    }

    const countResult = await pool.query(query.replace("SELECT *", "SELECT COUNT(*)"), params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(_count as string), parseInt(_offset as string));

    const result = await pool.query(query, params);
    const resources = result.rows.map(mapOrganizationToFHIR);

    await logFHIRAccess(req, "Organization", undefined, "search");
    return res.json(createFHIRBundle(resources, "searchset", total));
  } catch (error) {
    console.error("Error searching organizations:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});

// ==================== METADATA / CAPABILITY STATEMENT ====================

/**
 * GET /fhir/metadata - FHIR Capability Statement
 */
fhirRouter.get("/metadata", async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}/api/fhir`;

  const capabilityStatement = {
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    kind: "instance",
    software: {
      name: "Dermatology EHR FHIR Server",
      version: "1.0.0",
    },
    implementation: {
      description: "FHIR R4 API for Dermatology EHR System",
      url: baseUrl,
    },
    fhirVersion: "4.0.1",
    format: ["json"],
    rest: [
      {
        mode: "server",
        security: {
          cors: true,
          service: [
            {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/restful-security-service",
                  code: "OAuth",
                  display: "OAuth2 using SMART-on-FHIR profile",
                },
              ],
            },
          ],
          description: "OAuth 2.0 Bearer token authentication with SMART on FHIR scopes",
        },
        resource: [
          {
            type: "Patient",
            interaction: [
              { code: "read" },
              { code: "search-type" },
            ],
            searchParam: [
              { name: "name", type: "string" },
              { name: "identifier", type: "token" },
              { name: "birthdate", type: "date" },
              { name: "gender", type: "token" },
            ],
          },
          {
            type: "Practitioner",
            interaction: [
              { code: "read" },
              { code: "search-type" },
            ],
            searchParam: [
              { name: "name", type: "string" },
              { name: "identifier", type: "token" },
            ],
          },
          {
            type: "Encounter",
            interaction: [
              { code: "read" },
              { code: "search-type" },
            ],
            searchParam: [
              { name: "patient", type: "reference" },
              { name: "date", type: "date" },
              { name: "status", type: "token" },
            ],
          },
          {
            type: "Observation",
            interaction: [
              { code: "read" },
              { code: "search-type" },
            ],
            searchParam: [
              { name: "patient", type: "reference" },
              { name: "date", type: "date" },
              { name: "code", type: "token" },
              { name: "encounter", type: "reference" },
            ],
          },
          {
            type: "Condition",
            interaction: [
              { code: "read" },
              { code: "search-type" },
            ],
            searchParam: [
              { name: "patient", type: "reference" },
              { name: "code", type: "token" },
              { name: "encounter", type: "reference" },
            ],
          },
          {
            type: "Procedure",
            interaction: [
              { code: "read" },
              { code: "search-type" },
            ],
            searchParam: [
              { name: "patient", type: "reference" },
              { name: "date", type: "date" },
              { name: "code", type: "token" },
            ],
          },
          {
            type: "Appointment",
            interaction: [
              { code: "read" },
              { code: "search-type" },
            ],
            searchParam: [
              { name: "patient", type: "reference" },
              { name: "date", type: "date" },
              { name: "status", type: "token" },
              { name: "practitioner", type: "reference" },
            ],
          },
          {
            type: "Organization",
            interaction: [
              { code: "read" },
              { code: "search-type" },
            ],
            searchParam: [
              { name: "name", type: "string" },
            ],
          },
        ],
      },
    ],
  };

  return res.json(capabilityStatement);
});

// ==================== LEGACY ENDPOINTS (for backward compatibility) ====================

// Keep existing simple bundle endpoint for demos
fhirRouter.get("/Bundle/summary", requireFHIRAuth, async (req: FHIRAuthenticatedRequest, res) => {
  try {
    const tenantId = req.fhirAuth!.tenantId;
    const [patientRes, providerRes, encounterRes, appointmentRes, vitalsRes] = await Promise.all([
      pool.query(`select * from patients where tenant_id = $1 limit 1`, [tenantId]),
      pool.query(`select * from providers where tenant_id = $1 limit 1`, [tenantId]),
      pool.query(`select * from encounters where tenant_id = $1 limit 1`, [tenantId]),
      pool.query(`select a.*, at.name as appointment_type_name from appointments a left join appointment_types at on at.id = a.appointment_type_id where a.tenant_id = $1 limit 1`, [tenantId]),
      pool.query(`select v.*, e.patient_id from vitals v left join encounters e on e.id = v.encounter_id where v.tenant_id = $1 limit 1`, [tenantId]),
    ]);

    const resources: any[] = [];

    if (patientRes.rows[0]) resources.push(mapPatientToFHIR(patientRes.rows[0]));
    if (providerRes.rows[0]) resources.push(mapPractitionerToFHIR(providerRes.rows[0]));
    if (encounterRes.rows[0]) resources.push(mapEncounterToFHIR(encounterRes.rows[0]));
    if (appointmentRes.rows[0]) resources.push(mapAppointmentToFHIR(appointmentRes.rows[0]));
    if (vitalsRes.rows[0]) resources.push(...mapVitalsToFHIRObservations(vitalsRes.rows[0]));

    await logFHIRAccess(req, "Bundle", "summary", "read");
    return res.json(createFHIRBundle(resources, "collection"));
  } catch (error) {
    console.error("Error fetching bundle summary:", error);
    return res.status(500).json(
      createOperationOutcome("error", "exception", "Internal server error")
    );
  }
});
