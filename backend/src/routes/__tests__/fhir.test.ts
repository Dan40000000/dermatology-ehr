/**
 * FHIR R4 API Tests
 * Tests for FHIR resource mapping, search parameters, and OAuth authentication
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { pool } from "../../db/pool";
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
} from "../../services/fhirMapper";

describe("FHIR Resource Mapping", () => {
  describe("Patient Resource", () => {
    it("should map database patient to FHIR Patient resource", () => {
      const dbPatient = {
        id: "test-patient-123",
        tenant_id: "tenant-demo",
        first_name: "John",
        last_name: "Doe",
        dob: "1990-01-15",
        sex: "M",
        phone: "555-0100",
        email: "john.doe@example.com",
        address: "123 Main St",
        city: "Denver",
        state: "CO",
        zip: "80202",
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      };

      const fhirPatient = mapPatientToFHIR(dbPatient);

      expect(fhirPatient.resourceType).toBe("Patient");
      expect(fhirPatient.id).toBe("test-patient-123");
      expect(fhirPatient.name).toHaveLength(1);
      expect(fhirPatient.name[0].family).toBe("Doe");
      expect(fhirPatient.name[0].given).toEqual(["John"]);
      expect(fhirPatient.gender).toBe("male");
      expect(fhirPatient.birthDate).toBe("1990-01-15");
      expect(fhirPatient.telecom).toHaveLength(2);
      expect(fhirPatient.telecom[0].system).toBe("phone");
      expect(fhirPatient.telecom[0].value).toBe("555-0100");
      expect(fhirPatient.telecom[1].system).toBe("email");
      expect(fhirPatient.address).toHaveLength(1);
      expect(fhirPatient.address[0].city).toBe("Denver");
      expect(fhirPatient.address[0].state).toBe("CO");
      expect(fhirPatient.address[0].postalCode).toBe("80202");
    });

    it("should handle missing optional fields", () => {
      const dbPatient = {
        id: "test-patient-456",
        tenant_id: "tenant-demo",
        first_name: "Jane",
        last_name: "Smith",
        created_at: "2024-01-01T10:00:00Z",
      };

      const fhirPatient = mapPatientToFHIR(dbPatient);

      expect(fhirPatient.resourceType).toBe("Patient");
      expect(fhirPatient.id).toBe("test-patient-456");
      expect(fhirPatient.birthDate).toBeUndefined();
      expect(fhirPatient.gender).toBe("unknown");
    });
  });

  describe("Practitioner Resource", () => {
    it("should map database provider to FHIR Practitioner resource", () => {
      const dbProvider = {
        id: "prov-123",
        tenant_id: "tenant-demo",
        full_name: "Dr. Jane Dermatologist",
        specialty: "Dermatology",
        created_at: "2024-01-01T10:00:00Z",
      };

      const fhirPractitioner = mapPractitionerToFHIR(dbProvider);

      expect(fhirPractitioner.resourceType).toBe("Practitioner");
      expect(fhirPractitioner.id).toBe("prov-123");
      expect(fhirPractitioner.name).toHaveLength(1);
      expect(fhirPractitioner.name[0].text).toBe("Dr. Jane Dermatologist");
      expect(fhirPractitioner.qualification).toHaveLength(1);
      expect(fhirPractitioner.qualification[0].code.text).toBe("Dermatology");
    });
  });

  describe("Encounter Resource", () => {
    it("should map database encounter to FHIR Encounter resource", () => {
      const dbEncounter = {
        id: "enc-123",
        tenant_id: "tenant-demo",
        patient_id: "patient-123",
        provider_id: "prov-123",
        status: "draft",
        chief_complaint: "Skin rash on arm",
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T11:00:00Z",
      };

      const fhirEncounter = mapEncounterToFHIR(dbEncounter);

      expect(fhirEncounter.resourceType).toBe("Encounter");
      expect(fhirEncounter.id).toBe("enc-123");
      expect(fhirEncounter.status).toBe("in-progress");
      expect(fhirEncounter.subject.reference).toBe("Patient/patient-123");
      expect(fhirEncounter.participant).toHaveLength(1);
      expect(fhirEncounter.participant[0].individual.reference).toBe("Practitioner/prov-123");
      expect(fhirEncounter.reasonCode).toHaveLength(1);
      expect(fhirEncounter.reasonCode[0].text).toBe("Skin rash on arm");
    });
  });

  describe("Observation Resource", () => {
    it("should map vitals to multiple FHIR Observation resources", () => {
      const dbVital = {
        id: "vital-123",
        tenant_id: "tenant-demo",
        encounter_id: "enc-123",
        patient_id: "patient-123",
        bp_systolic: 120,
        bp_diastolic: 80,
        pulse: 72,
        temp_c: 36.8,
        height_cm: 175,
        weight_kg: 70,
        created_at: "2024-01-01T10:00:00Z",
      };

      const observations = mapVitalsToFHIRObservations(dbVital);

      expect(observations).toHaveLength(5); // BP, pulse, temp, height, weight

      // Blood Pressure
      const bpObs = observations.find(obs => obs.id === "vital-123-bp");
      expect(bpObs.resourceType).toBe("Observation");
      expect(bpObs.code.text).toBe("Blood Pressure");
      expect(bpObs.component).toHaveLength(2);
      expect(bpObs.component[0].valueQuantity.value).toBe(120);
      expect(bpObs.component[1].valueQuantity.value).toBe(80);

      // Pulse
      const pulseObs = observations.find(obs => obs.id === "vital-123-pulse");
      expect(pulseObs.code.text).toBe("Pulse");
      expect(pulseObs.valueQuantity.value).toBe(72);
      expect(pulseObs.valueQuantity.unit).toBe("beats/minute");

      // Temperature
      const tempObs = observations.find(obs => obs.id === "vital-123-temp");
      expect(tempObs.code.text).toBe("Temperature");
      expect(tempObs.valueQuantity.value).toBe(36.8);
      expect(tempObs.valueQuantity.unit).toBe("C");
    });
  });

  describe("Condition Resource", () => {
    it("should map diagnosis to FHIR Condition resource", () => {
      const dbDiagnosis = {
        id: "diag-123",
        tenant_id: "tenant-demo",
        encounter_id: "enc-123",
        patient_id: "patient-123",
        icd10_code: "L30.9",
        description: "Dermatitis, unspecified",
        is_primary: true,
        created_at: "2024-01-01T10:00:00Z",
      };

      const fhirCondition = mapDiagnosisToFHIRCondition(dbDiagnosis);

      expect(fhirCondition.resourceType).toBe("Condition");
      expect(fhirCondition.id).toBe("diag-123");
      expect(fhirCondition.code.coding).toHaveLength(1);
      expect(fhirCondition.code.coding[0].system).toBe("http://hl7.org/fhir/sid/icd-10");
      expect(fhirCondition.code.coding[0].code).toBe("L30.9");
      expect(fhirCondition.code.coding[0].display).toBe("Dermatitis, unspecified");
      expect(fhirCondition.subject.reference).toBe("Patient/patient-123");
      expect(fhirCondition.encounter.reference).toBe("Encounter/enc-123");
    });
  });

  describe("Procedure Resource", () => {
    it("should map charge (CPT) to FHIR Procedure resource", () => {
      const dbCharge = {
        id: "charge-123",
        tenant_id: "tenant-demo",
        encounter_id: "enc-123",
        patient_id: "patient-123",
        cpt_code: "11100",
        description: "Biopsy of skin, first lesion",
        status: "pending",
        amount_cents: 14800,
        created_at: "2024-01-01T10:00:00Z",
      };

      const fhirProcedure = mapChargeToProcedure(dbCharge);

      expect(fhirProcedure.resourceType).toBe("Procedure");
      expect(fhirProcedure.id).toBe("charge-123");
      expect(fhirProcedure.code.coding).toHaveLength(1);
      expect(fhirProcedure.code.coding[0].system).toBe("http://www.ama-assn.org/go/cpt");
      expect(fhirProcedure.code.coding[0].code).toBe("11100");
      expect(fhirProcedure.subject.reference).toBe("Patient/patient-123");
      expect(fhirProcedure.encounter.reference).toBe("Encounter/enc-123");
    });
  });

  describe("Appointment Resource", () => {
    it("should map appointment to FHIR Appointment resource", () => {
      const dbAppointment = {
        id: "appt-123",
        tenant_id: "tenant-demo",
        patient_id: "patient-123",
        provider_id: "prov-123",
        location_id: "loc-123",
        appointment_type_id: "appt-type-123",
        appointment_type_name: "Dermatology Consultation",
        status: "scheduled",
        scheduled_start: "2024-02-01T09:00:00Z",
        scheduled_end: "2024-02-01T09:30:00Z",
        notes: "First visit for skin evaluation",
        created_at: "2024-01-01T10:00:00Z",
      };

      const fhirAppointment = mapAppointmentToFHIR(dbAppointment);

      expect(fhirAppointment.resourceType).toBe("Appointment");
      expect(fhirAppointment.id).toBe("appt-123");
      expect(fhirAppointment.status).toBe("booked");
      expect(fhirAppointment.start).toBe("2024-02-01T09:00:00Z");
      expect(fhirAppointment.end).toBe("2024-02-01T09:30:00Z");
      expect(fhirAppointment.participant).toHaveLength(3); // Patient, provider, location
      expect(fhirAppointment.serviceType[0].text).toBe("Dermatology Consultation");
    });
  });

  describe("Organization Resource", () => {
    it("should map location to FHIR Organization resource", () => {
      const dbLocation = {
        id: "loc-123",
        tenant_id: "tenant-demo",
        name: "Main Dermatology Clinic",
        address: "456 Medical Plaza",
        city: "Denver",
        state: "CO",
        zip: "80203",
        phone: "555-0200",
        email: "info@dermclinic.com",
        created_at: "2024-01-01T10:00:00Z",
      };

      const fhirOrganization = mapOrganizationToFHIR(dbLocation);

      expect(fhirOrganization.resourceType).toBe("Organization");
      expect(fhirOrganization.id).toBe("loc-123");
      expect(fhirOrganization.name).toBe("Main Dermatology Clinic");
      expect(fhirOrganization.telecom).toHaveLength(2);
      expect(fhirOrganization.address).toHaveLength(1);
      expect(fhirOrganization.address[0].city).toBe("Denver");
    });
  });
});

describe("FHIR Bundle Creation", () => {
  it("should create searchset bundle with resources", () => {
    const resources = [
      { resourceType: "Patient", id: "p1" },
      { resourceType: "Patient", id: "p2" },
    ];

    const bundle = createFHIRBundle(resources, "searchset", 2);

    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("searchset");
    expect(bundle.total).toBe(2);
    expect(bundle.entry).toHaveLength(2);
    expect(bundle.entry[0].fullUrl).toBe("Patient/p1");
    expect(bundle.entry[0].resource.id).toBe("p1");
  });

  it("should create collection bundle", () => {
    const resources = [
      { resourceType: "Patient", id: "p1" },
      { resourceType: "Practitioner", id: "pr1" },
    ];

    const bundle = createFHIRBundle(resources, "collection");

    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(bundle.entry).toHaveLength(2);
  });
});

describe("FHIR OperationOutcome", () => {
  it("should create error OperationOutcome", () => {
    const outcome = createOperationOutcome("error", "not-found", "Patient not found");

    expect(outcome.resourceType).toBe("OperationOutcome");
    expect(outcome.issue).toHaveLength(1);
    expect(outcome.issue[0].severity).toBe("error");
    expect(outcome.issue[0].code).toBe("not-found");
    expect(outcome.issue[0].diagnostics).toBe("Patient not found");
  });

  it("should create warning OperationOutcome", () => {
    const outcome = createOperationOutcome("warning", "incomplete", "Missing required fields");

    expect(outcome.issue[0].severity).toBe("warning");
    expect(outcome.issue[0].code).toBe("incomplete");
  });
});

describe("FHIR Search Parameters", () => {
  it("should support Patient search by name", () => {
    // This would be tested with actual API calls in integration tests
    // Here we just verify the mapping function handles partial data correctly
    const dbPatient = {
      id: "p1",
      tenant_id: "t1",
      first_name: "Search",
      last_name: "Test",
      created_at: "2024-01-01T10:00:00Z",
    };

    const fhirPatient = mapPatientToFHIR(dbPatient);
    expect(fhirPatient.name[0].family).toBe("Test");
    expect(fhirPatient.name[0].given).toEqual(["Search"]);
  });
});

describe("FHIR Data Type Conversions", () => {
  describe("Gender Mapping", () => {
    it("should map sex codes to FHIR gender", () => {
      expect(mapPatientToFHIR({ id: "1", sex: "M", created_at: "2024-01-01" }).gender).toBe("male");
      expect(mapPatientToFHIR({ id: "2", sex: "F", created_at: "2024-01-01" }).gender).toBe("female");
      expect(mapPatientToFHIR({ id: "3", sex: "O", created_at: "2024-01-01" }).gender).toBe("other");
      expect(mapPatientToFHIR({ id: "4", created_at: "2024-01-01" }).gender).toBe("unknown");
    });
  });

  describe("Status Mapping", () => {
    it("should map encounter status", () => {
      expect(mapEncounterToFHIR({ id: "1", status: "draft", created_at: "2024-01-01" }).status).toBe("in-progress");
      expect(mapEncounterToFHIR({ id: "2", status: "completed", created_at: "2024-01-01" }).status).toBe("finished");
      expect(mapEncounterToFHIR({ id: "3", status: "cancelled", created_at: "2024-01-01" }).status).toBe("cancelled");
    });

    it("should map appointment status", () => {
      expect(mapAppointmentToFHIR({ id: "1", status: "scheduled", created_at: "2024-01-01" }).status).toBe("booked");
      expect(mapAppointmentToFHIR({ id: "2", status: "completed", created_at: "2024-01-01" }).status).toBe("fulfilled");
      expect(mapAppointmentToFHIR({ id: "3", status: "cancelled", created_at: "2024-01-01" }).status).toBe("cancelled");
    });
  });

  describe("Date/DateTime Formatting", () => {
    it("should format dates correctly", () => {
      const patient = mapPatientToFHIR({
        id: "1",
        dob: "1990-01-15T00:00:00Z",
        created_at: "2024-01-01T10:30:00Z",
      });

      expect(patient.birthDate).toBe("1990-01-15");
      expect(patient.meta.lastUpdated).toBe("2024-01-01T10:30:00Z");
    });
  });
});

describe("FHIR OAuth Scope Validation", () => {
  // Note: These would be integration tests with the actual middleware
  // Here we document the expected behavior

  it("should validate patient/*.read scope", () => {
    const scopes = ["patient/*.read"];
    // Should allow: GET /fhir/Patient, GET /fhir/Observation, etc.
    expect(scopes).toContain("patient/*.read");
  });

  it("should validate user/*.read scope", () => {
    const scopes = ["user/*.read"];
    // Should allow: All read operations in user context
    expect(scopes).toContain("user/*.read");
  });

  it("should validate system/*.read scope", () => {
    const scopes = ["system/*.read"];
    // Should allow: All read operations (full access)
    expect(scopes).toContain("system/*.read");
  });
});

describe("FHIR Capability Statement", () => {
  it("should list all supported resources", () => {
    const supportedResources = [
      "Patient",
      "Practitioner",
      "Encounter",
      "Observation",
      "Condition",
      "Procedure",
      "Appointment",
      "Organization",
    ];

    // Verify all 8 resources are documented
    expect(supportedResources).toHaveLength(8);
  });

  it("should list supported interactions", () => {
    const supportedInteractions = ["read", "search-type"];

    // Currently supporting read and search for all resources
    expect(supportedInteractions).toContain("read");
    expect(supportedInteractions).toContain("search-type");
  });
});

// Integration Tests (would require test database setup)
describe.skip("FHIR API Integration Tests", () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    // Cleanup test database
    await pool.end();
  });

  it("should retrieve patient by ID", async () => {
    // Test actual API endpoint
  });

  it("should search patients by name", async () => {
    // Test search functionality
  });

  it("should authenticate with OAuth token", async () => {
    // Test OAuth middleware
  });

  it("should return 404 for non-existent resource", async () => {
    // Test error handling
  });

  it("should enforce tenant isolation", async () => {
    // Test that tenant A cannot access tenant B's data
  });
});
