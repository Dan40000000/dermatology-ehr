import apiClient from './client';

export interface Appointment {
  id: string;
  patientId?: string;
  patientName?: string;
  providerId: string;
  providerName?: string;
  appointmentDate: string;
  appointmentTime: string;
  appointmentType: string;
  duration: number;
  status: string;
  notes?: string;
}

export const appointmentsApi = {
  getAll: async (params?: { date?: string; status?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.date) queryParams.append('date', params.date);
    if (params?.status) queryParams.append('status', params.status);

    const response = await apiClient.get(`/api/appointments?${queryParams.toString()}`);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await apiClient.get(`/api/appointments/${id}`);
    return response.data;
  },

  create: async (appointment: Partial<Appointment>) => {
    const response = await apiClient.post('/api/appointments', appointment);
    return response.data;
  },

  update: async (id: string, appointment: Partial<Appointment>) => {
    const response = await apiClient.put(`/api/appointments/${id}`, appointment);
    return response.data;
  },

  cancel: async (id: string, reason: string) => {
    const response = await apiClient.post(`/api/appointments/${id}/cancel`, { reason });
    return response.data;
  },

  getStats: async (date: string) => {
    const response = await apiClient.get(`/api/appointments/stats?date=${date}`);
    return response.data;
  },
};
