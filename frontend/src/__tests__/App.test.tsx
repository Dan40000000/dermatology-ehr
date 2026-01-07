import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchAppointmentTypes: vi.fn(),
  fetchAppointments: vi.fn(),
  fetchAvailability: vi.fn(),
  fetchCharges: vi.fn(),
  fetchDocuments: vi.fn(),
  fetchEncounters: vi.fn(),
  fetchLocations: vi.fn(),
  fetchMe: vi.fn(),
  fetchMessages: vi.fn(),
  fetchPatients: vi.fn(),
  fetchPhotos: vi.fn(),
  fetchProviders: vi.fn(),
  fetchTasks: vi.fn(),
  fetchAnalytics: vi.fn(),
  fetchVitals: vi.fn(),
  fetchAudit: vi.fn(),
  fetchAppointmentsByDay: vi.fn(),
  fetchAppointmentsByProvider: vi.fn(),
  fetchRevenueByDay: vi.fn(),
  fetchNoteTemplates: vi.fn(),
  fetchOrders: vi.fn(),
  fetchInteropCapability: vi.fn(),
  fetchStatusCounts: vi.fn(),
  fetchReportAppointmentsCsv: vi.fn(),
  fetchFhirExamples: vi.fn(),
  sendErx: vi.fn(),
  completePresign: vi.fn(),
  getPresignedAccess: vi.fn(),
  API_BASE_URL: 'https://api.example.com',
  TENANT_HEADER_NAME: 'x-tenant-id',
  presignS3: vi.fn(),
  updateOrderStatus: vi.fn(),
  login: vi.fn(),
  createPatient: vi.fn(),
  createAppointment: vi.fn(),
  createTask: vi.fn(),
  createEncounter: vi.fn(),
  createMessage: vi.fn(),
  createCharge: vi.fn(),
  createDocument: vi.fn(),
  createPhoto: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  updateEncounterStatus: vi.fn(),
  rescheduleAppointment: vi.fn(),
  uploadDocumentFile: vi.fn(),
  uploadPhotoFile: vi.fn(),
  updateVitals: vi.fn(),
  updateEncounterFields: vi.fn(),
  createOrder: vi.fn(),
}));

vi.mock('../api', () => apiMocks);

import App from '../App';

const sessionResponse = {
  tenantId: 'tenant-demo',
  tokens: {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  },
  user: {
    email: 'admin@demo.practice',
    role: 'admin',
    fullName: 'Demo Admin',
  },
};

const fixtures = {
  patient: {
    id: 'patient-1',
    firstName: 'Ana',
    lastName: 'Derm',
    email: 'ana@example.com',
    phone: '555-0101',
    address: '123 Main',
    city: 'Austin',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  provider: {
    id: 'provider-1',
    fullName: 'Dr. Skin',
  },
  location: {
    id: 'location-1',
    name: 'Clinic A',
  },
  appointmentType: {
    id: 'type-1',
    name: 'Consult',
    durationMinutes: 30,
  },
  appointments: [
    {
      id: 'appt-1',
      appointmentTypeName: 'Consult',
      appointmentTypeId: 'type-1',
      scheduledStart: '2025-01-02T09:00:00.000Z',
      scheduledEnd: '2025-01-02T09:30:00.000Z',
      patientName: 'Ana Derm',
      providerName: 'Dr. Skin',
      providerId: 'provider-1',
      locationName: 'Clinic A',
      status: 'scheduled',
    },
    {
      id: 'appt-2',
      appointmentTypeName: 'Follow-up',
      appointmentTypeId: 'type-1',
      scheduledStart: '2025-01-02T09:15:00.000Z',
      scheduledEnd: '2025-01-02T09:45:00.000Z',
      patientName: 'Ben Derm',
      providerName: 'Dr. Skin',
      providerId: 'provider-1',
      locationName: 'Clinic A',
      status: 'scheduled',
    },
  ],
  encounter: {
    id: 'enc-1',
    chiefComplaint: 'Rash',
    status: 'draft',
    assessmentPlan: 'Plan A',
  },
  task: {
    id: 'task-1',
    title: 'Call patient',
    status: 'open',
    dueAt: '2025-01-03T10:00:00.000Z',
  },
  message: {
    id: 'msg-1',
    subject: 'Follow-up',
    body: 'Please call the office.',
    sender: 'Front Desk',
  },
  charge: {
    id: 'charge-1',
    cptCode: '99213',
    icdCodes: ['L30.9'],
    amountCents: 15000,
  },
  document: {
    id: 'doc-1',
    title: 'Lab Report',
    type: 'PDF',
    storage: 'local',
    url: '/uploads/doc-1.pdf',
    objectKey: 'doc-1.pdf',
  },
  photo: {
    id: 'photo-1',
    bodyLocation: 'Arm',
    storage: 's3',
    url: 'https://cdn.example.com/photo.jpg',
    objectKey: 'photo-1.jpg',
  },
  availability: {
    id: 'avail-1',
    providerId: 'provider-1',
    dayOfWeek: 4,
    startTime: '08:00',
    endTime: '16:00',
  },
  analytics: {
    patients: 1,
    appointments: 2,
    encounters: 1,
    charges: 1,
    providers: 1,
    revenueCents: 12345,
  },
  appointmentsByDay: [{ day: '2025-01-01', count: 3 }],
  appointmentsByProvider: [{ provider: 'Dr. Skin', count: 2 }],
  statusCounts: [{ status: 'scheduled', count: 2 }],
  revenueByDay: [{ day: '2025-01-01', amount: 20000 }],
  noteTemplate: {
    id: 'tpl-1',
    name: 'Derm Note',
    chiefComplaint: 'Itch',
    hpi: 'HPI text',
    ros: 'ROS text',
    exam: 'Exam text',
    assessmentPlan: 'Plan text',
  },
  order: {
    id: 'ord-1',
    type: 'Amoxicillin',
    details: '500mg',
    status: 'draft',
  },
  interop: {
    fhirVersion: '4.0.1',
    resources: ['Patient', 'Appointment'],
  },
  fhirExamples: {
    appointment: { id: 'fhir-appt-1' },
    observation: { id: 'fhir-obs-1' },
  },
  vitals: {
    id: 'vital-1',
    bpSystolic: 120,
    bpDiastolic: 80,
    pulse: 70,
    tempC: 36.5,
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  audit: {
    id: 'audit-1',
    action: 'Created appointment',
    entity: 'appointment',
    entityId: 'appt-1',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
};

const setupLoadMocks = () => {
  apiMocks.fetchPatients.mockResolvedValue({ patients: [fixtures.patient] });
  apiMocks.fetchAppointments.mockResolvedValue({ appointments: fixtures.appointments });
  apiMocks.fetchEncounters.mockResolvedValue({ encounters: [fixtures.encounter] });
  apiMocks.fetchTasks.mockResolvedValue({ tasks: [fixtures.task] });
  apiMocks.fetchMessages.mockResolvedValue({ messages: [fixtures.message] });
  apiMocks.fetchProviders.mockResolvedValue({ providers: [fixtures.provider] });
  apiMocks.fetchLocations.mockResolvedValue({ locations: [fixtures.location] });
  apiMocks.fetchAppointmentTypes.mockResolvedValue({ appointmentTypes: [fixtures.appointmentType] });
  apiMocks.fetchAvailability.mockResolvedValue({ availability: [fixtures.availability] });
  apiMocks.fetchCharges.mockResolvedValue({ charges: [fixtures.charge] });
  apiMocks.fetchDocuments.mockResolvedValue({ documents: [fixtures.document] });
  apiMocks.fetchPhotos.mockResolvedValue({ photos: [fixtures.photo] });
  apiMocks.fetchAnalytics.mockResolvedValue({ counts: fixtures.analytics });
  apiMocks.fetchVitals.mockResolvedValue({ vitals: [fixtures.vitals] });
  apiMocks.fetchAudit.mockResolvedValue({ audit: [fixtures.audit] });
  apiMocks.fetchAppointmentsByDay.mockResolvedValue({ points: fixtures.appointmentsByDay });
  apiMocks.fetchAppointmentsByProvider.mockResolvedValue({ points: fixtures.appointmentsByProvider });
  apiMocks.fetchRevenueByDay.mockResolvedValue({ points: fixtures.revenueByDay });
  apiMocks.fetchNoteTemplates.mockResolvedValue({ templates: [fixtures.noteTemplate] });
  apiMocks.fetchOrders.mockResolvedValue({ orders: [fixtures.order] });
  apiMocks.fetchInteropCapability.mockResolvedValue(fixtures.interop);
  apiMocks.fetchStatusCounts.mockResolvedValue({ points: fixtures.statusCounts });
  apiMocks.fetchReportAppointmentsCsv.mockResolvedValue('id\n1');
  apiMocks.fetchFhirExamples.mockResolvedValue(fixtures.fhirExamples);
  apiMocks.getPresignedAccess.mockResolvedValue({ url: 'https://cdn.example.com/signed-photo.jpg' });
  apiMocks.sendErx.mockResolvedValue({ ok: true });
  apiMocks.createPatient.mockResolvedValue({ ok: true });
  apiMocks.createAppointment.mockResolvedValue({ ok: true });
  apiMocks.createTask.mockResolvedValue({ ok: true });
  apiMocks.createEncounter.mockResolvedValue({ ok: true });
  apiMocks.createMessage.mockResolvedValue({ ok: true });
  apiMocks.createCharge.mockResolvedValue({ ok: true });
  apiMocks.createDocument.mockResolvedValue({ ok: true });
  apiMocks.createPhoto.mockResolvedValue({ ok: true });
  apiMocks.updateAppointmentStatus.mockResolvedValue({ ok: true });
  apiMocks.updateEncounterStatus.mockResolvedValue({ ok: true });
  apiMocks.updateOrderStatus.mockResolvedValue({ ok: true });
  apiMocks.rescheduleAppointment.mockResolvedValue({ ok: true });
  apiMocks.uploadDocumentFile.mockResolvedValue({ url: '/uploads/doc-1.pdf', storage: 'local', objectKey: 'doc-1.pdf' });
  apiMocks.uploadPhotoFile.mockResolvedValue({ url: 'https://cdn.example.com/photo.jpg', storage: 's3', objectKey: 'photo-1.jpg' });
  apiMocks.updateVitals.mockResolvedValue({ ok: true });
  apiMocks.updateEncounterFields.mockResolvedValue({ ok: true });
  apiMocks.createOrder.mockResolvedValue({ ok: true });
};

describe('App', () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let originalOpen: typeof window.open | undefined;
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;
  let anchorClickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    setupLoadMocks();
    apiMocks.login.mockResolvedValue(sessionResponse);
    apiMocks.fetchMe.mockResolvedValue({ user: sessionResponse.user });
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: '/signed-url' }),
    } as any);
    originalOpen = window.open;
    window.open = vi.fn();
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
    }
    if (originalOpen) {
      window.open = originalOpen;
    }
    if (originalCreateObjectURL) {
      URL.createObjectURL = originalCreateObjectURL;
    }
    if (originalRevokeObjectURL) {
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
    anchorClickSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('shows login and handles auth failure', async () => {
    apiMocks.login.mockRejectedValueOnce(new Error('Invalid credentials'));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(apiMocks.login).toHaveBeenCalledWith('tenant-demo', 'admin@demo.practice', 'Password123!');
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('loads data and supports common actions', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await screen.findByText("Today's Overview");

    await waitFor(() => expect(apiMocks.fetchPatients).toHaveBeenCalled());

    fireEvent.click(screen.getByText(/Help/));
    await screen.findByText('Current user (/me)');

    fireEvent.click(screen.getByRole('button', { name: /Reload/ }));
    await waitFor(() => expect(apiMocks.fetchPatients.mock.calls.length).toBeGreaterThan(1));

    const newPatientSummary = screen.getByText('+ New Patient');
    fireEvent.click(newPatientSummary);
    const newPatientDetails = newPatientSummary.closest('details');
    const patientScope = within(newPatientDetails as HTMLElement);
    fireEvent.change(patientScope.getByLabelText('First'), { target: { value: 'Jamie' } });
    fireEvent.change(patientScope.getByLabelText('Last'), { target: { value: 'Doe' } });
    fireEvent.change(patientScope.getByLabelText('Email'), { target: { value: 'jamie@example.com' } });
    fireEvent.change(patientScope.getByLabelText('Phone'), { target: { value: '555-0101' } });
    fireEvent.click(patientScope.getByRole('button', { name: 'Save patient' }));
    await waitFor(() => expect(apiMocks.createPatient).toHaveBeenCalled());

    const scheduleSummary = screen.getByText('+ Schedule');
    fireEvent.click(scheduleSummary);
    const scheduleDetails = scheduleSummary.closest('details');
    const scheduleScope = within(scheduleDetails as HTMLElement);
    fireEvent.change(scheduleScope.getByLabelText('Patient'), { target: { value: 'patient-1' } });
    fireEvent.change(scheduleScope.getByLabelText('Provider'), { target: { value: 'provider-1' } });
    fireEvent.change(scheduleScope.getByLabelText('Location'), { target: { value: 'location-1' } });
    fireEvent.change(scheduleScope.getByLabelText('Type'), { target: { value: 'type-1' } });
    fireEvent.change(scheduleScope.getByLabelText('Start'), { target: { value: '2025-01-02T10:00' } });
    fireEvent.change(scheduleScope.getByLabelText('End'), { target: { value: '2025-01-02T10:30' } });
    fireEvent.click(scheduleScope.getByRole('button', { name: 'Save appointment' }));
    await waitFor(() => expect(apiMocks.createAppointment).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Open securely' }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(apiMocks.getPresignedAccess).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Export Appointments CSV' }));
    await waitFor(() => expect(apiMocks.fetchReportAppointmentsCsv).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(anchorClickSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send eRx stub' }));
    await waitFor(() => expect(apiMocks.sendErx).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Revenue' }));
    expect(screen.getByText('$200')).toBeInTheDocument();
  }, 30000);
});
