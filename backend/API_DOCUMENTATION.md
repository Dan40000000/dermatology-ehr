# Dermatology EHR API Documentation

This document provides comprehensive information about the Dermatology EHR API, including endpoints, authentication, and usage examples.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Base URL](#base-url)
- [Interactive Documentation](#interactive-documentation)
- [Common Headers](#common-headers)
- [API Endpoints](#api-endpoints)
  - [Authentication](#authentication-endpoints)
  - [Patients](#patients)
  - [Appointments](#appointments)
  - [Providers](#providers)
  - [Encounters](#encounters)
  - [Vitals](#vitals)
  - [Medications](#medications)
  - [Locations](#locations)
  - [Health Checks](#health-checks)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Security](#security)

## Overview

The Dermatology EHR API is a RESTful API built with Express.js and TypeScript. It provides comprehensive endpoints for managing dermatology practice operations including patient records, appointments, clinical encounters, billing, and more.

**Version:** 1.0.0

## Authentication

The API uses JWT (JSON Web Token) bearer authentication. Most endpoints require authentication.

### Getting Started

1. **Login** to obtain access and refresh tokens:
   ```bash
   POST /api/auth/login
   ```

2. **Include the access token** in subsequent requests:
   ```
   Authorization: Bearer <your-access-token>
   ```

3. **Refresh tokens** when the access token expires:
   ```bash
   POST /api/auth/refresh
   ```

### Token Lifecycle

- **Access tokens** expire after a configured duration (typically 1 hour)
- **Refresh tokens** can be used to obtain new access tokens
- Tokens are tenant-scoped for multi-tenancy support

## Base URL

**Local Development:** `http://localhost:3000`
**Production:** Set via `API_URL` environment variable

## Interactive Documentation

The API provides interactive Swagger UI documentation at:

**Endpoint:** `GET /api/docs`

Features:
- Browse all endpoints organized by category
- View detailed request/response schemas
- Test endpoints directly from the browser
- Download OpenAPI specification

### OpenAPI Specification

Download the raw OpenAPI 3.0 specification:

**Endpoint:** `GET /api/openapi.json`

The specification file is also available at `/Users/danperry/Desktop/Dermatology program/derm-app/backend/openapi.json`

## Common Headers

All API requests should include:

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes* | Bearer token for authentication (`Bearer <token>`) |
| `X-Tenant-ID` | Yes* | Tenant identifier for multi-tenancy |
| `Content-Type` | Yes** | `application/json` for POST/PUT requests |

\* Not required for public endpoints (login, health checks)
\*\* Required for requests with body

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/login
Authenticate a user with email and password.

**Headers:**
- `X-Tenant-ID`: Required

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "role": "provider",
    "tenantId": "tenant-id"
  },
  "tokens": {
    "accessToken": "jwt-token",
    "refreshToken": "jwt-refresh-token"
  },
  "tenantId": "tenant-id"
}
```

#### POST /api/auth/refresh
Refresh an expired access token.

**Request Body:**
```json
{
  "refreshToken": "your-refresh-token"
}
```

#### GET /api/auth/me
Get current authenticated user information.

**Headers:**
- `Authorization`: Bearer token required

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "role": "provider",
    "tenantId": "tenant-id"
  }
}
```

#### GET /api/auth/users
List all users in the current tenant.

**Headers:**
- `Authorization`: Bearer token required
- `X-Tenant-ID`: Required

---

### Patients

#### GET /api/patients
List all patients (limited to 50, most recent first).

**Query Parameters:**
None

**Response (200):**
```json
{
  "patients": [
    {
      "id": "uuid",
      "firstName": "Jane",
      "lastName": "Doe",
      "dob": "1990-01-01",
      "phone": "555-0100",
      "email": "jane@example.com",
      "address": "123 Main St",
      "city": "Boston",
      "state": "MA",
      "zip": "02101",
      "insurance": "Blue Cross",
      "allergies": "Penicillin",
      "medications": "Aspirin",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/patients
Create a new patient.

**Required Roles:** admin, ma, front_desk, provider

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "dob": "1990-01-01",
  "phone": "555-0100",
  "email": "jane@example.com",
  "address": "123 Main St",
  "city": "Boston",
  "state": "MA",
  "zip": "02101",
  "sex": "F",
  "insurance": "Blue Cross",
  "allergies": "Penicillin",
  "medications": "Aspirin"
}
```

**Response (201):**
```json
{
  "id": "uuid"
}
```

#### GET /api/patients/:id
Get detailed patient information by ID.

**Path Parameters:**
- `id`: Patient UUID

**Response (200):**
Returns full patient object with all fields.

#### PUT /api/patients/:id
Update a patient's information.

**Required Roles:** admin, ma, front_desk, provider

**Path Parameters:**
- `id`: Patient UUID

**Request Body:** (all fields optional)
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "id": "uuid"
}
```

#### DELETE /api/patients/:id
Delete a patient and all associated records.

**Required Roles:** admin only

**Path Parameters:**
- `id`: Patient UUID

**Response (200):**
```json
{
  "success": true,
  "message": "Patient Jane Doe has been deleted"
}
```

---

### Appointments

#### GET /api/appointments
List appointments with optional filtering.

**Query Parameters:**
- `patientId` (optional): Filter by patient UUID
- `date` (optional): Filter by date (YYYY-MM-DD)
- `startDate` (optional): Start of date range (YYYY-MM-DD)
- `endDate` (optional): End of date range (YYYY-MM-DD)

**Response (200):**
```json
{
  "appointments": [
    {
      "id": "uuid",
      "scheduledStart": "2024-01-15T10:00:00Z",
      "scheduledEnd": "2024-01-15T10:30:00Z",
      "status": "scheduled",
      "patientId": "uuid",
      "providerId": "uuid",
      "locationId": "uuid",
      "appointmentTypeId": "uuid",
      "patientName": "Jane Doe",
      "providerName": "Dr. Smith",
      "locationName": "Main Office",
      "appointmentTypeName": "Follow-up",
      "durationMinutes": 30
    }
  ]
}
```

#### POST /api/appointments
Create a new appointment.

**Required Roles:** admin, front_desk, ma, provider

**Request Body:**
```json
{
  "patientId": "uuid",
  "providerId": "uuid",
  "locationId": "uuid",
  "appointmentTypeId": "uuid",
  "scheduledStart": "2024-01-15T10:00:00Z",
  "scheduledEnd": "2024-01-15T10:30:00Z",
  "status": "scheduled"
}
```

**Response (201):**
```json
{
  "id": "uuid"
}
```

**Error (409):** Time conflict for provider

#### POST /api/appointments/:id/reschedule
Reschedule an existing appointment.

**Required Roles:** admin, front_desk, ma

**Path Parameters:**
- `id`: Appointment UUID

**Request Body:**
```json
{
  "scheduledStart": "2024-01-16T14:00:00Z",
  "scheduledEnd": "2024-01-16T14:30:00Z",
  "providerId": "uuid"
}
```

#### POST /api/appointments/:id/status
Update appointment status.

**Required Roles:** admin, front_desk, ma, provider

**Path Parameters:**
- `id`: Appointment UUID

**Request Body:**
```json
{
  "status": "completed"
}
```

**Status Values:**
- `scheduled`
- `confirmed`
- `checked-in`
- `in-progress`
- `completed`
- `cancelled`
- `no-show`

**Note:** Setting status to `cancelled` triggers waitlist auto-fill.

---

### Providers

#### GET /api/providers
List all providers for the current tenant.

**Response (200):**
```json
{
  "providers": [
    {
      "id": "uuid",
      "fullName": "Dr. John Smith",
      "specialty": "Dermatology",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Encounters

#### GET /api/encounters
List clinical encounters (limited to 50, most recent first).

**Response (200):**
```json
{
  "encounters": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "providerId": "uuid",
      "appointmentId": "uuid",
      "status": "draft",
      "chiefComplaint": "Skin rash",
      "hpi": "Patient reports...",
      "ros": "Review of systems...",
      "exam": "Physical examination...",
      "assessmentPlan": "Assessment and plan...",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### POST /api/encounters
Create a new clinical encounter.

**Required Roles:** provider, ma, admin

**Request Body:**
```json
{
  "patientId": "uuid",
  "providerId": "uuid",
  "appointmentId": "uuid",
  "chiefComplaint": "Skin rash on arms",
  "hpi": "Patient presents with...",
  "ros": "Denies fever, chills...",
  "exam": "Bilateral erythematous rash...",
  "assessmentPlan": "1. Contact dermatitis..."
}
```

**Response (201):**
```json
{
  "id": "uuid"
}
```

---

### Vitals

#### GET /api/vitals
Retrieve vital signs records.

**Query Parameters:**
- `patientId` (optional): Filter by patient UUID

**Response (200):**
```json
{
  "vitals": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "encounterId": "uuid",
      "heightCm": 170,
      "weightKg": 70,
      "bpSystolic": 120,
      "bpDiastolic": 80,
      "pulse": 72,
      "tempC": 37.0,
      "respiratoryRate": 16,
      "o2Saturation": 98,
      "recordedById": "uuid",
      "recordedAt": "2024-01-15T10:00:00Z",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

### Medications

#### GET /api/medications
Search medications.

**Query Parameters:**
- `search` (optional): Search by name, generic name, or brand name
- `category` (optional): Filter by category
- `controlled` (optional): Filter by controlled status (true/false)
- `limit` (optional): Max results (default: 50)

**Response (200):**
```json
{
  "medications": [
    {
      "id": "uuid",
      "name": "Tretinoin Cream",
      "genericName": "Tretinoin",
      "brandName": "Retin-A",
      "category": "Topical Retinoids",
      "isControlled": false
    }
  ]
}
```

#### GET /api/medications/list/categories
Get all medication categories.

**Response (200):**
```json
{
  "categories": [
    "Topical Retinoids",
    "Antibiotics",
    "Antifungals"
  ]
}
```

#### GET /api/medications/:id
Get medication details by ID.

**Path Parameters:**
- `id`: Medication UUID

---

### Locations

#### GET /api/locations
List all practice locations.

**Response (200):**
```json
{
  "locations": [
    {
      "id": "uuid",
      "name": "Main Office",
      "address": "123 Medical Plaza, Boston, MA 02101",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### Health Checks

#### GET /health
Basic health check.

**Security:** None (public endpoint)

**Response (200):**
```json
{
  "status": "ok"
}
```

#### GET /health/detailed
Detailed health status including database, memory, CPU checks.

**Security:** None (public endpoint)

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 5
    },
    "memory": {
      "status": "healthy",
      "heapUsed": "150MB",
      "heapTotal": "200MB"
    },
    "cpu": {
      "status": "healthy",
      "loadAverage1m": "0.50",
      "cores": 8
    }
  },
  "responseTime": 10
}
```

#### GET /health/live
Kubernetes liveness probe.

#### GET /health/ready
Kubernetes readiness probe (checks database connectivity).

#### GET /health/metrics
Prometheus metrics endpoint.

---

## Error Handling

The API uses standard HTTP status codes:

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (e.g., time conflict for appointments) |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Error Response Format

**Validation Error:**
```json
{
  "error": {
    "email": {
      "_errors": ["Invalid email"]
    }
  }
}
```

**Simple Error:**
```json
{
  "error": "Patient not found"
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Login endpoint:** 5 requests per 15 minutes per IP
- **Patient portal endpoints:** Rate limited
- **Upload endpoints:** Rate limited
- **General API:** Rate limited based on configuration

Rate limit exceeded responses return HTTP 429 (Too Many Requests).

## Security

### Security Features

1. **Multi-tenancy:** All data is scoped by tenant ID
2. **Role-based access control (RBAC):** Endpoints require specific roles
3. **Input sanitization:** Protection against XSS and injection attacks
4. **SQL injection protection:** Parameterized queries
5. **CSRF protection:** Available for web applications
6. **Helmet.js:** Security headers
7. **CORS:** Configurable cross-origin resource sharing

### Roles

Available roles in the system:
- `admin`: Full system access
- `provider`: Healthcare provider access
- `ma`: Medical assistant access
- `front_desk`: Front desk/reception access
- `billing`: Billing department access

### Best Practices

1. **Store tokens securely:** Never store tokens in localStorage (use httpOnly cookies for web apps)
2. **Use HTTPS:** Always use HTTPS in production
3. **Rotate tokens:** Implement token rotation for long-running sessions
4. **Monitor access:** Review audit logs regularly
5. **Limit permissions:** Grant minimum required role permissions

## Additional Resources

- **Swagger UI:** `/api/docs`
- **OpenAPI Spec:** `/api/openapi.json`
- **Source Code:** Backend route files in `/src/routes/`

## Support

For API support, please contact:
- Email: support@example.com

## Changelog

### Version 1.0.0 (Initial Release)
- Complete OpenAPI/Swagger documentation
- Authentication endpoints
- Patient management (CRUD)
- Appointment scheduling and management
- Clinical encounters
- Vitals tracking
- Medication database
- 90+ additional routes for comprehensive EHR functionality
