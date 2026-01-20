import apiClient from './client';

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  email?: string;
  phone?: string;
  mrn: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export const patientsApi = {
  search: async (query: string) => {
    const response = await apiClient.get(`/api/patients/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get(`/api/patients/${id}`);
    return response.data;
  },

  create: async (patient: Partial<Patient>) => {
    const response = await apiClient.post('/api/patients', patient);
    return response.data;
  },

  update: async (id: string, patient: Partial<Patient>) => {
    const response = await apiClient.put(`/api/patients/${id}`, patient);
    return response.data;
  },

  getEncounters: async (patientId: string) => {
    const response = await apiClient.get(`/api/patients/${patientId}/encounters`);
    return response.data;
  },

  getMedications: async (patientId: string) => {
    const response = await apiClient.get(`/api/patients/${patientId}/medications`);
    return response.data;
  },

  getAllergies: async (patientId: string) => {
    const response = await apiClient.get(`/api/patients/${patientId}/allergies`);
    return response.data;
  },
};
