# FHIR R4 API Documentation

## Overview

The Dermatology EHR system implements a comprehensive FHIR R4 (Fast Healthcare Interoperability Resources) API for healthcare data exchange and interoperability. This API enables external systems to securely access and integrate with patient data, clinical records, and scheduling information.

### Key Features

- **FHIR R4 Compliant**: Implements FHIR Release 4 specifications
- **OAuth 2.0 Security**: Secure authentication using Bearer tokens with SMART on FHIR scopes
- **Multi-tenant Isolation**: Complete data isolation per tenant organization
- **Comprehensive Audit Logging**: All FHIR access is logged for HIPAA compliance
- **RESTful API**: Standard HTTP methods and FHIR search parameters
- **8 Core Resources**: Patient, Practitioner, Encounter, Observation, Condition, Procedure, Appointment, Organization

### Architecture

```
Client Application
       ↓
   OAuth Token
       ↓
FHIR API Endpoint (/api/fhir)
       ↓
   FHIR Auth Middleware (scope validation)
       ↓
   FHIR Mapper Service (DB → FHIR)
       ↓
   PostgreSQL Database
```

## Base URL

```
https://your-domain.com/api/fhir
```

## Authentication

### OAuth 2.0 Bearer Token

All FHIR endpoints (except `/metadata`) require OAuth 2.0 authentication using Bearer tokens.

#### Request Headers

```http
Authorization: Bearer <access_token>
Content-Type: application/fhir+json
```

#### Example

```bash
curl -X GET "https://your-domain.com/api/fhir/Patient/p-demo" \
  -H "Authorization: Bearer demo-fhir-access-token-abcdef123456" \
  -H "Content-Type: application/fhir+json"
```

### SMART on FHIR Scopes

The API supports SMART on FHIR scope syntax:

| Scope Pattern | Description | Example |
|---------------|-------------|---------|
| `patient/*.read` | Read access to all patient-compartment resources | Access patient's own data |
| `user/*.read` | Read access to all resources in user context | Clinician accessing any data |
| `system/*.read` | Read access to all resources (system-level) | Backend integration |
| `patient/Patient.read` | Read access to specific resource type | Access only Patient resources |

#### Scope Examples

```
patient/*.read                    # Patient portal access
user/*.read user/*.write         # Clinician full access
system/Patient.read system/Observation.read  # Specific resources only
```

### Token Management

Tokens are stored in the `fhir_oauth_tokens` table with the following fields:

- `access_token`: Bearer token for API requests
- `refresh_token`: Token for obtaining new access tokens
- `scope`: Space-separated list of SMART scopes
- `expires_at`: Token expiration timestamp
- `client_id`: OAuth client identifier
- `tenant_id`: Associated tenant organization

### Demo Token

For testing purposes, a demo token is available:

```
Token: demo-fhir-access-token-abcdef123456
Tenant: tenant-demo
Scopes: patient/*.read user/*.read
```

## Supported FHIR Resources

### 1. Patient

Maps from `patients` table. Represents individual receiving healthcare services.

**Endpoints:**
- `GET /fhir/Patient/:id` - Retrieve single patient
- `GET /fhir/Patient?[params]` - Search patients

**Search Parameters:**

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `name` | string | Patient name (first or last) | `?name=Smith` |
| `identifier` | token | Patient ID | `?identifier=p-demo` |
| `birthdate` | date | Date of birth | `?birthdate=1990-01-01` |
| `gender` | token | Gender (male/female/other/unknown) | `?gender=male` |
| `_count` | number | Results per page (default: 50) | `?_count=20` |
| `_offset` | number | Results offset (default: 0) | `?_offset=40` |

**Example Request:**

```bash
GET /fhir/Patient?name=Smith&gender=female&_count=10
```

**Example Response:**

```json
{
  "resourceType": "Patient",
  "id": "p-demo",
  "meta": {
    "lastUpdated": "2024-01-01T10:00:00Z"
  },
  "identifier": [
    {
      "system": "urn:derm-app:patient",
      "value": "p-demo"
    }
  ],
  "active": true,
  "name": [
    {
      "use": "official",
      "family": "Patient",
      "given": ["Jamie"]
    }
  ],
  "telecom": [
    {
      "system": "phone",
      "value": "555-0101",
      "use": "home"
    },
    {
      "system": "email",
      "value": "jamie.patient@example.com"
    }
  ],
  "gender": "unknown",
  "birthDate": "1990-01-01",
  "address": [
    {
      "use": "home",
      "type": "physical",
      "line": ["100 Skin Way"],
      "city": "Dermaville",
      "state": "CO",
      "postalCode": "80000",
      "country": "US"
    }
  ]
}
```

### 2. Practitioner

Maps from `providers` table. Represents healthcare providers.

**Endpoints:**
- `GET /fhir/Practitioner/:id`
- `GET /fhir/Practitioner?[params]`

**Search Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Practitioner name |
| `identifier` | token | Practitioner ID |

**Example Response:**

```json
{
  "resourceType": "Practitioner",
  "id": "prov-demo",
  "identifier": [
    {
      "system": "urn:derm-app:practitioner",
      "value": "prov-demo"
    }
  ],
  "active": true,
  "name": [
    {
      "use": "official",
      "text": "Dr. Skin"
    }
  ],
  "qualification": [
    {
      "code": {
        "coding": [
          {
            "system": "http://snomed.info/sct",
            "code": "394582007",
            "display": "Dermatology"
          }
        ],
        "text": "Dermatology"
      }
    }
  ]
}
```

### 3. Encounter

Maps from `encounters` table. Represents patient visits.

**Endpoints:**
- `GET /fhir/Encounter/:id`
- `GET /fhir/Encounter?[params]`

**Search Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `patient` | reference | Patient ID |
| `date` | date | Encounter date |
| `status` | token | Encounter status |

**Example Response:**

```json
{
  "resourceType": "Encounter",
  "id": "enc-demo",
  "status": "in-progress",
  "class": {
    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
    "code": "AMB",
    "display": "ambulatory"
  },
  "subject": {
    "reference": "Patient/p-demo"
  },
  "participant": [
    {
      "type": [
        {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
              "code": "PPRF",
              "display": "primary performer"
            }
          ]
        }
      ],
      "individual": {
        "reference": "Practitioner/prov-demo"
      }
    }
  ],
  "period": {
    "start": "2024-01-01T10:00:00Z"
  },
  "reasonCode": [
    {
      "text": "Skin rash"
    }
  ]
}
```

### 4. Observation

Maps from `vitals` table. Represents vital signs and measurements.

**Note:** Each vital record generates multiple Observation resources (one per vital sign type).

**Observation Types:**
- Blood Pressure (systolic/diastolic)
- Heart Rate (pulse)
- Body Temperature
- Height
- Weight

**Endpoints:**
- `GET /fhir/Observation/:id`
- `GET /fhir/Observation?[params]`

**Search Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `patient` | reference | Patient ID |
| `date` | date | Observation date |
| `encounter` | reference | Encounter ID |

**Example Response (Blood Pressure):**

```json
{
  "resourceType": "Observation",
  "id": "vitals-demo-bp",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "vital-signs",
          "display": "Vital Signs"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "85354-9",
        "display": "Blood pressure panel"
      }
    ],
    "text": "Blood Pressure"
  },
  "subject": {
    "reference": "Patient/p-demo"
  },
  "encounter": {
    "reference": "Encounter/enc-demo"
  },
  "effectiveDateTime": "2024-01-01T10:00:00Z",
  "component": [
    {
      "code": {
        "coding": [
          {
            "system": "http://loinc.org",
            "code": "8480-6",
            "display": "Systolic blood pressure"
          }
        ]
      },
      "valueQuantity": {
        "value": 120,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]"
      }
    },
    {
      "code": {
        "coding": [
          {
            "system": "http://loinc.org",
            "code": "8462-4",
            "display": "Diastolic blood pressure"
          }
        ]
      },
      "valueQuantity": {
        "value": 80,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]"
      }
    }
  ]
}
```

### 5. Condition

Maps from `encounter_diagnoses` table. Represents clinical diagnoses.

**Endpoints:**
- `GET /fhir/Condition/:id`
- `GET /fhir/Condition?[params]`

**Search Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `patient` | reference | Patient ID |
| `code` | token | ICD-10 code |
| `encounter` | reference | Encounter ID |

**Example Response:**

```json
{
  "resourceType": "Condition",
  "id": "diag-demo",
  "identifier": [
    {
      "system": "urn:derm-app:diagnosis",
      "value": "diag-demo"
    }
  ],
  "clinicalStatus": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
        "code": "active",
        "display": "Active"
      }
    ]
  },
  "verificationStatus": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
        "code": "confirmed",
        "display": "Confirmed"
      }
    ]
  },
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/condition-category",
          "code": "encounter-diagnosis",
          "display": "Encounter Diagnosis"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://hl7.org/fhir/sid/icd-10",
        "code": "L30.9",
        "display": "Dermatitis, unspecified"
      }
    ],
    "text": "Dermatitis, unspecified"
  },
  "subject": {
    "reference": "Patient/p-demo"
  },
  "encounter": {
    "reference": "Encounter/enc-demo"
  },
  "recordedDate": "2024-01-01T10:00:00Z"
}
```

### 6. Procedure

Maps from `charges` table (CPT codes). Represents procedures performed.

**Endpoints:**
- `GET /fhir/Procedure/:id`
- `GET /fhir/Procedure?[params]`

**Search Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `patient` | reference | Patient ID |
| `date` | date | Procedure date |
| `code` | token | CPT code |
| `encounter` | reference | Encounter ID |

**Example Response:**

```json
{
  "resourceType": "Procedure",
  "id": "charge-demo",
  "identifier": [
    {
      "system": "urn:derm-app:charge",
      "value": "charge-demo"
    }
  ],
  "status": "preparation",
  "code": {
    "coding": [
      {
        "system": "http://www.ama-assn.org/go/cpt",
        "code": "99213",
        "display": "Office visit, established patient, level 3"
      }
    ],
    "text": "Office visit, established patient, level 3"
  },
  "subject": {
    "reference": "Patient/p-demo"
  },
  "encounter": {
    "reference": "Encounter/enc-demo"
  },
  "performedDateTime": "2024-01-01T10:00:00Z"
}
```

### 7. Appointment

Maps from `appointments` table. Represents scheduled appointments.

**Endpoints:**
- `GET /fhir/Appointment/:id`
- `GET /fhir/Appointment?[params]`

**Search Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `patient` | reference | Patient ID |
| `date` | date | Appointment date |
| `status` | token | Appointment status |
| `practitioner` | reference | Practitioner ID |

**Example Response:**

```json
{
  "resourceType": "Appointment",
  "id": "appt-demo",
  "identifier": [
    {
      "system": "urn:derm-app:appointment",
      "value": "appt-demo"
    }
  ],
  "status": "booked",
  "serviceType": [
    {
      "coding": [
        {
          "system": "urn:derm-app:appointment-type",
          "code": "appttype-demo",
          "display": "Derm Consult"
        }
      ],
      "text": "Derm Consult"
    }
  ],
  "start": "2024-02-01T10:00:00Z",
  "end": "2024-02-01T10:30:00Z",
  "participant": [
    {
      "actor": {
        "reference": "Patient/p-demo"
      },
      "status": "accepted"
    },
    {
      "actor": {
        "reference": "Practitioner/prov-demo"
      },
      "status": "accepted"
    }
  ]
}
```

### 8. Organization

Maps from `locations` and `tenants` tables. Represents healthcare organizations.

**Endpoints:**
- `GET /fhir/Organization/:id`
- `GET /fhir/Organization?[params]`

**Search Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Organization name |

**Example Response:**

```json
{
  "resourceType": "Organization",
  "id": "loc-demo",
  "identifier": [
    {
      "system": "urn:derm-app:organization",
      "value": "loc-demo"
    }
  ],
  "active": true,
  "type": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/organization-type",
          "code": "prov",
          "display": "Healthcare Provider"
        }
      ]
    }
  ],
  "name": "Main Clinic",
  "address": [
    {
      "use": "work",
      "type": "physical",
      "line": ["123 Skin St"],
      "country": "US"
    }
  ]
}
```

## FHIR Bundles

Search operations return FHIR Bundle resources containing search results.

**Bundle Structure:**

```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 42,
  "entry": [
    {
      "fullUrl": "Patient/p-demo",
      "resource": {
        "resourceType": "Patient",
        "id": "p-demo",
        ...
      }
    },
    ...
  ]
}
```

**Bundle Types:**
- `searchset`: Results from a search operation
- `collection`: Arbitrary collection of resources

## Error Handling

All errors return FHIR OperationOutcome resources.

### Error Response Structure

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "not-found",
      "diagnostics": "Patient with id xyz not found"
    }
  ]
}
```

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET request |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Insufficient scope/permissions |
| 404 | Not Found | Resource doesn't exist |
| 500 | Internal Server Error | Server error |

### Common Error Scenarios

#### Missing Authorization

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/fhir+json

{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "login",
      "diagnostics": "Missing or invalid Authorization header"
    }
  ]
}
```

#### Insufficient Scope

```http
HTTP/1.1 403 Forbidden
Content-Type: application/fhir+json

{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "forbidden",
      "diagnostics": "Insufficient scope. Required: Patient.read"
    }
  ]
}
```

#### Resource Not Found

```http
HTTP/1.1 404 Not Found
Content-Type: application/fhir+json

{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "not-found",
      "diagnostics": "Patient with id xyz not found"
    }
  ]
}
```

## Capability Statement

The FHIR server publishes its capabilities at `/fhir/metadata` (no authentication required).

**Endpoint:**
```
GET /fhir/metadata
```

**Response:** CapabilityStatement resource describing:
- Supported FHIR version (4.0.1)
- Supported resources
- Supported interactions (read, search-type)
- Supported search parameters
- Security mechanisms (OAuth 2.0)

## Complete Examples

### Example 1: Get Patient Demographics

```bash
curl -X GET "https://api.example.com/api/fhir/Patient/p-demo" \
  -H "Authorization: Bearer demo-fhir-access-token-abcdef123456" \
  -H "Accept: application/fhir+json"
```

### Example 2: Search Patients by Name

```bash
curl -X GET "https://api.example.com/api/fhir/Patient?name=Smith&_count=20" \
  -H "Authorization: Bearer demo-fhir-access-token-abcdef123456" \
  -H "Accept: application/fhir+json"
```

### Example 3: Get Patient's Encounters

```bash
curl -X GET "https://api.example.com/api/fhir/Encounter?patient=p-demo" \
  -H "Authorization: Bearer demo-fhir-access-token-abcdef123456" \
  -H "Accept: application/fhir+json"
```

### Example 4: Get Patient's Conditions

```bash
curl -X GET "https://api.example.com/api/fhir/Condition?patient=p-demo" \
  -H "Authorization: Bearer demo-fhir-access-token-abcdef123456" \
  -H "Accept: application/fhir+json"
```

### Example 5: Get Patient's Vital Signs

```bash
curl -X GET "https://api.example.com/api/fhir/Observation?patient=p-demo&category=vital-signs" \
  -H "Authorization: Bearer demo-fhir-access-token-abcdef123456" \
  -H "Accept: application/fhir+json"
```

### Example 6: Get Upcoming Appointments

```bash
curl -X GET "https://api.example.com/api/fhir/Appointment?date=ge2024-12-08&status=booked" \
  -H "Authorization: Bearer demo-fhir-access-token-abcdef123456" \
  -H "Accept: application/fhir+json"
```

## Security & Compliance

### HIPAA Compliance

1. **Encryption**: All data transmitted over HTTPS/TLS
2. **Authentication**: OAuth 2.0 Bearer tokens required
3. **Authorization**: Scope-based access control
4. **Audit Logging**: All FHIR access logged to `audit_log` table
5. **Tenant Isolation**: Complete data segregation per tenant

### Audit Log Fields

Every FHIR request logs:
- `tenant_id`: Organization accessing data
- `client_id`: OAuth client identifier
- `action`: Operation performed (e.g., "fhir_read", "fhir_search")
- `resource_type`: FHIR resource type accessed
- `resource_id`: Specific resource ID (if applicable)
- `ip_address`: Client IP address
- `user_agent`: Client user agent
- `timestamp`: When access occurred
- `scope`: OAuth scopes used
- `status`: Success or failure

### Best Practices

1. **Token Security**
   - Store tokens securely
   - Use HTTPS only
   - Implement token refresh
   - Set appropriate expiration times

2. **Scope Limitation**
   - Request minimum necessary scopes
   - Use resource-specific scopes when possible
   - Avoid system/* scopes unless required

3. **Error Handling**
   - Check HTTP status codes
   - Parse OperationOutcome for details
   - Implement retry logic with backoff

4. **Data Privacy**
   - Filter sensitive data client-side if needed
   - Respect patient consent directives
   - Log all data access

## Known Limitations

### Current Implementation

1. **Read-Only**: Write operations (POST, PUT, DELETE) not yet implemented
2. **Search Operators**: Limited to exact match and basic wildcards
3. **Pagination**: Offset-based only (no cursor-based pagination)
4. **Includes**: `_include` and `_revinclude` not supported
5. **Bundle Operations**: No transaction or batch bundles
6. **Versioning**: Resource versioning not implemented
7. **History**: `_history` operations not supported

### Future Enhancements

- [ ] POST/PUT/DELETE operations for write access
- [ ] Advanced search operators (ge, le, ne, etc.)
- [ ] `_include` and `_revinclude` support
- [ ] Cursor-based pagination
- [ ] Transaction bundles
- [ ] Resource versioning
- [ ] Subscription support for real-time updates
- [ ] Bulk data export ($export operation)
- [ ] GraphQL endpoint

## Database Schema Mapping

| FHIR Resource | Database Table | Key Fields |
|---------------|----------------|------------|
| Patient | patients | id, first_name, last_name, dob, sex, phone, email |
| Practitioner | providers | id, full_name, specialty |
| Encounter | encounters | id, patient_id, provider_id, status, chief_complaint |
| Observation | vitals | id, encounter_id, bp_systolic, bp_diastolic, pulse, temp_c, height_cm, weight_kg |
| Condition | encounter_diagnoses | id, encounter_id, icd10_code, description |
| Procedure | charges | id, encounter_id, cpt_code, description, status |
| Appointment | appointments | id, patient_id, provider_id, scheduled_start, scheduled_end, status |
| Organization | locations, tenants | id, name, address, phone, email |

## Development & Testing

### Running Database Migrations

```bash
npm run migrate
```

This will create the `fhir_oauth_tokens` table and seed a demo token.

### Testing with curl

```bash
# Get capability statement (no auth required)
curl http://localhost:4000/api/fhir/metadata

# Test with demo token
TOKEN="demo-fhir-access-token-abcdef123456"

# Get all patients
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/fhir/Patient

# Get specific patient
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/fhir/Patient/p-demo

# Search patients by name
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/fhir/Patient?name=Jamie
```

### Running Tests

```bash
npm test -- fhir.test.ts
```

## Support & Resources

### FHIR Specifications
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [SMART on FHIR](https://docs.smarthealthit.org/)
- [OAuth 2.0](https://oauth.net/2/)

### FHIR Resource Definitions
- [Patient](https://hl7.org/fhir/R4/patient.html)
- [Practitioner](https://hl7.org/fhir/R4/practitioner.html)
- [Encounter](https://hl7.org/fhir/R4/encounter.html)
- [Observation](https://hl7.org/fhir/R4/observation.html)
- [Condition](https://hl7.org/fhir/R4/condition.html)
- [Procedure](https://hl7.org/fhir/R4/procedure.html)
- [Appointment](https://hl7.org/fhir/R4/appointment.html)
- [Organization](https://hl7.org/fhir/R4/organization.html)

### Code Systems Used
- **LOINC**: Laboratory and vital signs codes
- **SNOMED CT**: Clinical terminology
- **ICD-10**: Diagnosis codes
- **CPT**: Procedure codes
- **UCUM**: Units of measure

## Changelog

### Version 1.0.0 (2024-12-08)

**Initial FHIR R4 Implementation**

- Implemented 8 core FHIR resources
- OAuth 2.0 authentication with SMART scopes
- Search parameter support for all resources
- FHIR Bundle responses
- OperationOutcome error handling
- Comprehensive audit logging
- Multi-tenant isolation
- Capability Statement endpoint

**Files Created:**
- `/backend/src/services/fhirMapper.ts` (714 lines)
- `/backend/src/middleware/fhirAuth.ts` (214 lines)
- `/backend/src/routes/fhir.ts` (893 lines)
- `/backend/migrations/019_fhir_oauth_tokens.sql` (58 lines)
- `/backend/src/routes/__tests__/fhir.test.ts` (574 lines)
- `/backend/docs/FHIR_API.md` (this document)

## Contact

For questions or issues with the FHIR API, please contact your system administrator or development team.

---

**Last Updated**: December 8, 2024
**FHIR Version**: R4 (4.0.1)
**API Version**: 1.0.0
