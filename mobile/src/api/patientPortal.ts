import apiClient from './client';

export interface PortalMessage {
  id: string;
  subject: string;
  body: string;
  fromProvider: boolean;
  read: boolean;
  createdAt: string;
}

export interface Bill {
  id: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  dueDate: string;
  status: string;
  description: string;
}

export const patientPortalApi = {
  // Appointments
  getAppointments: async (params?: { limit?: number }) => {
    const queryParams = params?.limit ? `?limit=${params.limit}` : '';
    const response = await apiClient.get(`/api/patient-portal/appointments${queryParams}`);
    return response.data;
  },

  requestAppointment: async (data: {
    appointmentTypeId: string;
    preferredDate: string;
    preferredTime: string;
    reason: string;
  }) => {
    const response = await apiClient.post('/api/patient-portal/appointment-requests', data);
    return response.data;
  },

  // Messages
  getMessages: async (params?: { unread?: boolean; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.unread) queryParams.append('unread', 'true');
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const response = await apiClient.get(`/api/patient-portal/messages?${queryParams.toString()}`);
    return response.data;
  },

  sendMessage: async (data: { subject: string; body: string }) => {
    const response = await apiClient.post('/api/patient-portal/messages', data);
    return response.data;
  },

  markMessageRead: async (messageId: string) => {
    const response = await apiClient.put(`/api/patient-portal/messages/${messageId}/read`);
    return response.data;
  },

  // Bills
  getBills: async () => {
    const response = await apiClient.get('/api/patient-portal/bills');
    return response.data;
  },

  payBill: async (billId: string, amount: number, paymentMethod: string) => {
    const response = await apiClient.post(`/api/patient-portal/bills/${billId}/payment`, {
      amount,
      paymentMethod,
    });
    return response.data;
  },

  // Visit Summaries
  getVisitSummaries: async () => {
    const response = await apiClient.get('/api/patient-portal/visit-summaries');
    return response.data;
  },

  getVisitSummary: async (id: string) => {
    const response = await apiClient.get(`/api/patient-portal/visit-summaries/${id}`);
    return response.data;
  },

  // Lab Results
  getLabResults: async () => {
    const response = await apiClient.get('/api/patient-portal/lab-results');
    return response.data;
  },

  // Medications
  getMedications: async () => {
    const response = await apiClient.get('/api/patient-portal/medications');
    return response.data;
  },
};
