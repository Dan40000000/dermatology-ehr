/**
 * Enhanced API Functions
 * Example implementation showing how to use the new error handling utilities
 *
 * USAGE: Gradually migrate functions from api.ts to use this pattern
 */

import { createApiClient, buildQueryString } from './utils/apiClient';
import type { ApiClientConfig } from './utils/apiClient';

// Types (these should match your existing types)
export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  mrn?: string;
  // ... other fields
}

export interface Appointment {
  id: string;
  patientId: string;
  providerId: string;
  startTime: string;
  endTime: string;
  status: string;
  // ... other fields
}

export interface CreatePatientData {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  // ... other fields
}

/**
 * Enhanced API service class
 * This shows the recommended pattern for API integration
 */
export class EnhancedApiService {
  private client: ReturnType<typeof createApiClient>;

  constructor(config: ApiClientConfig) {
    this.client = createApiClient(config);
  }

  /**
   * Update configuration (e.g., after token refresh)
   */
  updateConfig(config: Partial<ApiClientConfig>) {
    this.client.updateConfig(config);
  }

  // ==================== Patient APIs ====================

  /**
   * Fetch all patients
   */
  async getPatients(filters?: {
    search?: string;
    status?: string;
    providerId?: string;
  }): Promise<Patient[]> {
    const queryString = filters ? buildQueryString(filters) : '';
    return this.client.get<Patient[]>(`/api/patients${queryString}`, {
      retry: true, // Enable retry for GET requests
    });
  }

  /**
   * Fetch single patient by ID
   */
  async getPatient(patientId: string): Promise<Patient> {
    return this.client.get<Patient>(`/api/patients/${patientId}`, {
      retry: true,
    });
  }

  /**
   * Create new patient
   */
  async createPatient(data: CreatePatientData): Promise<Patient> {
    return this.client.post<Patient>('/api/patients', data);
  }

  /**
   * Update patient
   */
  async updatePatient(patientId: string, data: Partial<Patient>): Promise<Patient> {
    return this.client.put<Patient>(`/api/patients/${patientId}`, data);
  }

  /**
   * Delete patient
   */
  async deletePatient(patientId: string): Promise<void> {
    return this.client.delete<void>(`/api/patients/${patientId}`);
  }

  // ==================== Appointment APIs ====================

  /**
   * Fetch appointments
   */
  async getAppointments(filters?: {
    date?: string;
    providerId?: string;
    patientId?: string;
    status?: string;
  }): Promise<Appointment[]> {
    const queryString = filters ? buildQueryString(filters) : '';
    return this.client.get<Appointment[]>(`/api/appointments${queryString}`, {
      retry: true,
    });
  }

  /**
   * Create appointment
   */
  async createAppointment(data: Partial<Appointment>): Promise<Appointment> {
    return this.client.post<Appointment>('/api/appointments', data);
  }

  /**
   * Update appointment
   */
  async updateAppointment(appointmentId: string, data: Partial<Appointment>): Promise<Appointment> {
    return this.client.put<Appointment>(`/api/appointments/${appointmentId}`, data);
  }

  /**
   * Cancel appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    return this.client.post<void>(`/api/appointments/${appointmentId}/cancel`, { reason });
  }

  // ==================== File Upload ====================

  /**
   * Upload patient photo
   */
  async uploadPatientPhoto(patientId: string, file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('patientId', patientId);

    return this.client.upload<{ url: string }>('/api/patients/photos', formData, {
      timeout: 60000, // 60 second timeout for uploads
    });
  }

  /**
   * Upload document
   */
  async uploadDocument(file: File, metadata: {
    patientId: string;
    type: string;
    description?: string;
  }): Promise<{ url: string; documentId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));

    return this.client.upload<{ url: string; documentId: string }>('/api/documents', formData, {
      timeout: 120000, // 2 minute timeout for large files
    });
  }
}

/**
 * Singleton instance pattern (optional)
 * You can create a singleton or pass the service through context/props
 */
let apiServiceInstance: EnhancedApiService | null = null;

export function initializeApiService(config: ApiClientConfig): EnhancedApiService {
  apiServiceInstance = new EnhancedApiService(config);
  return apiServiceInstance;
}

export function getApiService(): EnhancedApiService {
  if (!apiServiceInstance) {
    throw new Error('API Service not initialized. Call initializeApiService first.');
  }
  return apiServiceInstance;
}

/**
 * React hook for API service (optional pattern)
 * This can be used in components for easy access
 */
export function useApiService() {
  return getApiService();
}
