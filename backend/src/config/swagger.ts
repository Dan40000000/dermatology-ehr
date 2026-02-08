import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';
import { loadEnv } from './validate';

const envVars = loadEnv();

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dermatology EHR API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for the Dermatology EHR system',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: envVars.API_URL,
        description: 'API Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authorization token',
        },
        tenantHeader: {
          type: 'apiKey',
          in: 'header',
          name: env.tenantHeader,
          description: 'Tenant ID header for multi-tenancy',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              description: 'Validation error details from Zod',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            fullName: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'provider', 'ma', 'front_desk', 'billing'] },
            tenantId: { type: 'string' },
          },
        },
        Tokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', description: 'JWT access token' },
            refreshToken: { type: 'string', description: 'JWT refresh token' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            tokens: { $ref: '#/components/schemas/Tokens' },
            tenantId: { type: 'string' },
          },
        },
        RefreshTokenRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string', minLength: 10 },
          },
        },
        Patient: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            dob: { type: 'string', format: 'date', nullable: true },
            phone: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            address: { type: 'string', nullable: true },
            city: { type: 'string', nullable: true },
            state: { type: 'string', maxLength: 2, nullable: true },
            zip: { type: 'string', nullable: true },
            insurance: { type: 'string', nullable: true },
            allergies: { type: 'string', nullable: true },
            medications: { type: 'string', nullable: true },
            sex: { type: 'string', enum: ['M', 'F', 'O'], nullable: true },
            ssn: { type: 'string', maxLength: 4, nullable: true, description: 'Last 4 digits only' },
            emergencyContactName: { type: 'string', nullable: true },
            emergencyContactRelationship: { type: 'string', nullable: true },
            emergencyContactPhone: { type: 'string', nullable: true },
            pharmacyName: { type: 'string', nullable: true },
            pharmacyPhone: { type: 'string', nullable: true },
            pharmacyAddress: { type: 'string', nullable: true },
            primaryCarePhysician: { type: 'string', nullable: true },
            referralSource: { type: 'string', nullable: true },
            insuranceId: { type: 'string', nullable: true },
            insuranceGroupNumber: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreatePatientRequest: {
          type: 'object',
          required: ['firstName', 'lastName'],
          properties: {
            firstName: { type: 'string', minLength: 1, maxLength: 100 },
            lastName: { type: 'string', minLength: 1, maxLength: 100 },
            dob: { type: 'string', format: 'date' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string', maxLength: 2 },
            zip: { type: 'string' },
            insurance: { type: 'string' },
            allergies: { type: 'string' },
            medications: { type: 'string' },
            sex: { type: 'string', enum: ['M', 'F', 'O'] },
            ssn: { type: 'string', maxLength: 4, description: 'Last 4 digits only' },
            emergencyContactName: { type: 'string' },
            emergencyContactRelationship: { type: 'string' },
            emergencyContactPhone: { type: 'string' },
            pharmacyName: { type: 'string' },
            pharmacyPhone: { type: 'string' },
            pharmacyAddress: { type: 'string' },
            primaryCarePhysician: { type: 'string' },
            referralSource: { type: 'string' },
            insuranceId: { type: 'string' },
            insuranceGroupNumber: { type: 'string' },
          },
        },
        UpdatePatientRequest: {
          type: 'object',
          properties: {
            firstName: { type: 'string', minLength: 1, maxLength: 100 },
            lastName: { type: 'string', minLength: 1, maxLength: 100 },
            dob: { type: 'string', format: 'date' },
            sex: { type: 'string', enum: ['M', 'F', 'O'] },
            ssn: { type: 'string', maxLength: 4, description: 'Last 4 digits only' },
            phone: { type: 'string' },
            email: { type: 'string', format: 'email' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string', maxLength: 2 },
            zip: { type: 'string' },
            emergencyContactName: { type: 'string' },
            emergencyContactRelationship: { type: 'string' },
            emergencyContactPhone: { type: 'string' },
            pharmacyName: { type: 'string' },
            pharmacyPhone: { type: 'string' },
            pharmacyAddress: { type: 'string' },
            insurance: { type: 'string' },
            allergies: { type: 'string' },
            medications: { type: 'string' },
          },
        },
        Appointment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            scheduledStart: { type: 'string', format: 'date-time' },
            scheduledEnd: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['scheduled', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'] },
            patientId: { type: 'string', format: 'uuid' },
            providerId: { type: 'string', format: 'uuid' },
            locationId: { type: 'string', format: 'uuid' },
            appointmentTypeId: { type: 'string', format: 'uuid' },
            patientName: { type: 'string' },
            providerName: { type: 'string' },
            locationName: { type: 'string' },
            appointmentTypeName: { type: 'string' },
            durationMinutes: { type: 'integer' },
          },
        },
        CreateAppointmentRequest: {
          type: 'object',
          required: ['patientId', 'providerId', 'locationId', 'appointmentTypeId', 'scheduledStart', 'scheduledEnd'],
          properties: {
            patientId: { type: 'string', minLength: 1 },
            providerId: { type: 'string', minLength: 1 },
            locationId: { type: 'string', minLength: 1 },
            appointmentTypeId: { type: 'string', minLength: 1 },
            scheduledStart: { type: 'string', format: 'date-time' },
            scheduledEnd: { type: 'string', format: 'date-time' },
            status: { type: 'string' },
          },
        },
        RescheduleAppointmentRequest: {
          type: 'object',
          required: ['scheduledStart', 'scheduledEnd'],
          properties: {
            scheduledStart: { type: 'string', format: 'date-time' },
            scheduledEnd: { type: 'string', format: 'date-time' },
            providerId: { type: 'string', description: 'Optional: change provider during reschedule' },
          },
        },
        UpdateAppointmentStatusRequest: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['scheduled', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'] },
          },
        },
        Provider: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fullName: { type: 'string' },
            specialty: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
        tenantHeader: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);
