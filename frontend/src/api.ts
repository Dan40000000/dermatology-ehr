const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const TENANT_HEADER = "x-tenant-id";

export type StoredFileResponse = { url: string; storage: "local" | "s3"; objectKey?: string };
export const API_BASE_URL = API_BASE;
export const TENANT_HEADER_NAME = TENANT_HEADER;

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    role: string;
    fullName: string;
    tenantId: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  tenantId: string;
}

export async function login(tenantId: string, email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Login failed");
  }
  return res.json();
}

export async function fetchMe(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch user");
  }
  return res.json();
}

export async function fetchPatients(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/patients`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    throw new Error("Failed to load patients");
  }
  return res.json();
}

export async function fetchPatient(tenantId: string, accessToken: string, patientId: string) {
  const res = await fetch(`${API_BASE}/api/patients/${patientId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Patient not found");
    }
    throw new Error("Failed to load patient");
  }
  return res.json();
}

export async function fetchAppointments(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/appointments`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    throw new Error("Failed to load appointments");
  }
  return res.json();
}

export async function fetchEncounters(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/encounters`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to load encounters");
  return res.json();
}

export async function fetchTasks(
  tenantId: string,
  accessToken: string,
  filters?: {
    status?: string;
    category?: string;
    assignedTo?: string;
    priority?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.category) params.append('category', filters.category);
  if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);
  if (filters?.priority) params.append('priority', filters.priority);
  if (filters?.search) params.append('search', filters.search);
  if (filters?.sortBy) params.append('sortBy', filters.sortBy);
  if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);

  const url = `${API_BASE}/api/tasks${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load tasks");
  return res.json();
}

export async function fetchMessages(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/messages`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load messages");
  return res.json();
}

// Messaging Thread APIs
export async function fetchMessageThreads(tenantId: string, accessToken: string, filter?: string) {
  const url = filter ? `${API_BASE}/api/messaging/threads?filter=${filter}` : `${API_BASE}/api/messaging/threads`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load threads");
  return res.json();
}

export async function fetchMessageThread(tenantId: string, accessToken: string, threadId: string) {
  const res = await fetch(`${API_BASE}/api/messaging/threads/${threadId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load thread");
  return res.json();
}

export async function createMessageThread(tenantId: string, accessToken: string, data: any) {
  const res = await fetch(`${API_BASE}/api/messaging/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create thread");
  }
  return res.json();
}

export async function sendThreadMessage(tenantId: string, accessToken: string, threadId: string, body: string) {
  const res = await fetch(`${API_BASE}/api/messaging/threads/${threadId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to send message");
  }
  return res.json();
}

export async function markThreadAsRead(tenantId: string, accessToken: string, threadId: string) {
  const res = await fetch(`${API_BASE}/api/messaging/threads/${threadId}/read`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to mark thread as read");
  return res.json();
}

export async function archiveThread(tenantId: string, accessToken: string, threadId: string, archive: boolean) {
  const res = await fetch(`${API_BASE}/api/messaging/threads/${threadId}/archive`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify({ archive }),
  });
  if (!res.ok) throw new Error("Failed to archive thread");
  return res.json();
}

export async function fetchUnreadCount(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/messaging/unread-count`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to fetch unread count");
  return res.json();
}

export async function fetchProviders(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/providers`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load providers");
  return res.json();
}

export async function fetchLocations(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/locations`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load locations");
  return res.json();
}

export async function fetchAppointmentTypes(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/appointment-types`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load appointment types");
  return res.json();
}

export async function fetchAvailability(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/availability`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load availability");
  return res.json();
}

export async function fetchCharges(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/charges`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load charges");
  return res.json();
}

export async function fetchDocuments(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/documents`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load documents");
  return res.json();
}

export async function fetchPhotos(
  tenantId: string,
  accessToken: string,
  params?: { patientId?: string; photoType?: string; bodyLocation?: string }
) {
  const queryParams = new URLSearchParams();
  if (params?.patientId) queryParams.append("patientId", params.patientId);
  if (params?.photoType) queryParams.append("photoType", params.photoType);
  if (params?.bodyLocation) queryParams.append("bodyLocation", params.bodyLocation);
  const query = queryParams.toString();
  const url = `${API_BASE}/api/photos${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load photos");
  return res.json();
}

export async function fetchPhotoTimeline(tenantId: string, accessToken: string, patientId: string) {
  const res = await fetch(`${API_BASE}/api/photos/patient/${patientId}/timeline`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load photo timeline");
  return res.json();
}

export async function updatePhotoAnnotations(
  tenantId: string,
  accessToken: string,
  photoId: string,
  annotations: any
) {
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/annotate`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(annotations),
  });
  if (!res.ok) throw new Error("Failed to update annotations");
  return res.json();
}

export async function updatePhotoBodyLocation(
  tenantId: string,
  accessToken: string,
  photoId: string,
  bodyLocation: string
) {
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/body-location`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bodyLocation }),
  });
  if (!res.ok) throw new Error("Failed to update body location");
  return res.json();
}

export async function createComparisonGroup(
  tenantId: string,
  accessToken: string,
  data: { patientId: string; name: string; description?: string }
) {
  const res = await fetch(`${API_BASE}/api/photos/comparison-group`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create comparison group");
  return res.json();
}

export async function fetchComparisonGroup(tenantId: string, accessToken: string, groupId: string) {
  const res = await fetch(`${API_BASE}/api/photos/comparison-group/${groupId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load comparison group");
  return res.json();
}

export async function fetchAnalytics(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/analytics/summary`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load analytics");
  return res.json();
}

export async function fetchVitals(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/vitals`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load vitals");
  return res.json();
}

export async function fetchAudit(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/audit/log`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load audit");
  return res.json();
}

type AnalyticsFilter = { startDate?: string; endDate?: string; providerId?: string };

const buildQuery = (filter?: AnalyticsFilter) => {
  const params = new URLSearchParams();
  if (filter?.startDate) params.append("startDate", filter.startDate);
  if (filter?.endDate) params.append("endDate", filter.endDate);
  if (filter?.providerId && filter.providerId !== "all") params.append("providerId", filter.providerId);
  const query = params.toString();
  return query ? `?${query}` : "";
};

export async function fetchAppointmentsByDay(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/appointments-by-day${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load analytics by day");
  return res.json();
}

export async function fetchAppointmentsByProvider(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/appointments-by-provider${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load provider analytics");
  return res.json();
}

export async function fetchRevenueByDay(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/revenue-by-day${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load revenue");
  return res.json();
}

export const uploadDocumentFile = async (tenantId: string, accessToken: string, file: File): Promise<StoredFileResponse> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload/document`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
};

export const uploadPhotoFile = async (tenantId: string, accessToken: string, file: File): Promise<StoredFileResponse> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload/photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
};

export const updateVitals = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/vitals/write", data);

export const updateEncounterFields = (tenantId: string, accessToken: string, id: string, data: any) =>
  authedPost(tenantId, accessToken, `/api/encounters/${id}`, data);

export async function fetchOrders(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/orders`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load orders");
  return res.json();
}

export const createOrder = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/orders", data);

export async function fetchInteropCapability(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/interop/capability`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load capability");
  return res.json();
}

export async function fetchStatusCounts(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/status-counts${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load status counts");
  return res.json();
}

export async function fetchDashboardKPIs(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/dashboard${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load dashboard KPIs");
  return res.json();
}

export async function fetchAppointmentsTrend(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/appointments/trend${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load appointments trend");
  return res.json();
}

export async function fetchRevenueTrend(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/revenue/trend${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load revenue trend");
  return res.json();
}

export async function fetchTopDiagnoses(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/top-diagnoses${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load top diagnoses");
  return res.json();
}

export async function fetchTopProcedures(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/top-procedures${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load top procedures");
  return res.json();
}

export async function fetchProviderProductivity(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/provider-productivity${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load provider productivity");
  return res.json();
}

export async function fetchPatientDemographics(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/analytics/patient-demographics`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load patient demographics");
  return res.json();
}

export async function fetchAppointmentTypesAnalytics(tenantId: string, accessToken: string, filter?: AnalyticsFilter) {
  const res = await fetch(`${API_BASE}/api/analytics/appointment-types${buildQuery(filter)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load appointment types analytics");
  return res.json();
}

export const updateOrderStatus = (tenantId: string, accessToken: string, id: string, status: string) =>
  authedPost(tenantId, accessToken, `/api/orders/${id}/status`, { status });
export const sendErx = (tenantId: string, accessToken: string, payload: any) =>
  authedPost(tenantId, accessToken, "/api/orders/erx/send", payload);

export async function fetchReportAppointmentsCsv(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/reports/appointments/export`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to export report");
  return res.text();
}

export async function fetchFhirExamples(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/interop/fhir-payloads/appointment-example`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load FHIR example");
  const appointment = await res.json();
  const obsRes = await fetch(`${API_BASE}/api/interop/fhir-payloads/observation-example`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!obsRes.ok) throw new Error("Failed to load FHIR observation example");
  const observation = await obsRes.json();
  return { appointment, observation };
}

export async function presignS3(tenantId: string, accessToken: string, filename: string, contentType: string) {
  const res = await fetch(`${API_BASE}/api/presign/s3`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify({ filename, contentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to presign");
  }
  return res.json();
}

export async function completePresign(tenantId: string, accessToken: string, key: string) {
  const res = await fetch(`${API_BASE}/api/presign/s3/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to finalize upload");
  }
  return res.json() as Promise<StoredFileResponse>;
}

export async function getPresignedAccess(tenantId: string, accessToken: string, key: string) {
  const res = await fetch(`${API_BASE}/api/presign/s3/access/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to get download URL");
  }
  return res.json() as Promise<{ url: string }>;
}

const authedGet = async (tenantId: string, accessToken: string, path: string) => {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${path}`);
  }
  return res.json();
};

const authedPost = async (tenantId: string, accessToken: string, path: string, body: any) => {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${path}`);
  }
  return res.json();
};

export const createPatient = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/patients", data);

const authedPut = async (tenantId: string, accessToken: string, path: string, body: any) => {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${path}`);
  }
  return res.json();
};

export const updatePatient = (tenantId: string, accessToken: string, id: string, data: any) =>
  authedPut(tenantId, accessToken, `/api/patients/${id}`, data);

export const createAppointment = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/appointments", data);

export const updateAppointmentStatus = (tenantId: string, accessToken: string, id: string, status: string) =>
  authedPost(tenantId, accessToken, `/api/appointments/${id}/status`, { status });

export const createEncounter = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/encounters", data);

export const updateEncounterStatus = (tenantId: string, accessToken: string, id: string, status: string) =>
  authedPost(tenantId, accessToken, `/api/encounters/${id}/status`, { status });

export const createTask = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/tasks", data);

export const updateTask = (tenantId: string, accessToken: string, id: string, data: any) =>
  fetch(`${API_BASE}/api/tasks/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  }).then((res) => {
    if (!res.ok) throw new Error("Failed to update task");
    return res.json();
  });

export const updateTaskStatus = (tenantId: string, accessToken: string, id: string, status: string) =>
  fetch(`${API_BASE}/api/tasks/${id}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify({ status }),
  }).then((res) => {
    if (!res.ok) throw new Error("Failed to update task status");
    return res.json();
  });

export const deleteTask = (tenantId: string, accessToken: string, id: string) =>
  fetch(`${API_BASE}/api/tasks/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  }).then((res) => {
    if (!res.ok) throw new Error("Failed to delete task");
    return res.json();
  });

export const fetchTaskComments = (tenantId: string, accessToken: string, taskId: string) =>
  fetch(`${API_BASE}/api/tasks/${taskId}/comments`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  }).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch comments");
    return res.json();
  });

export const addTaskComment = (tenantId: string, accessToken: string, taskId: string, comment: string) =>
  authedPost(tenantId, accessToken, `/api/tasks/${taskId}/comments`, { comment });

export const createMessage = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/messages", data);

export const createCharge = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/charges", data);

export const createDocument = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/documents", data);

export const createPhoto = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/photos", data);

export const rescheduleAppointment = (tenantId: string, accessToken: string, id: string, scheduledStart: string, scheduledEnd: string, providerId?: string) =>
  authedPost(tenantId, accessToken, `/api/appointments/${id}/reschedule`, { scheduledStart, scheduledEnd, providerId });

export const updateEncounter = (tenantId: string, accessToken: string, id: string, data: any) =>
  authedPost(tenantId, accessToken, `/api/encounters/${id}`, data);

export const createVitals = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/vitals/write", data);

// Fee Schedules
export const fetchFeeSchedules = (tenantId: string, accessToken: string) =>
  authedGet(tenantId, accessToken, "/api/fee-schedules");

export const fetchFeeSchedule = (tenantId: string, accessToken: string, id: string) =>
  authedGet(tenantId, accessToken, `/api/fee-schedules/${id}`);

export const createFeeSchedule = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/fee-schedules", data);

export const updateFeeSchedule = (tenantId: string, accessToken: string, id: string, data: any) =>
  authedPut(tenantId, accessToken, `/api/fee-schedules/${id}`, data);

export const deleteFeeSchedule = async (tenantId: string, accessToken: string, id: string) => {
  const res = await fetch(`${API_BASE}/api/fee-schedules/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete fee schedule");
  }
  return;
};

export const fetchFeeScheduleItems = (tenantId: string, accessToken: string, scheduleId: string) =>
  authedGet(tenantId, accessToken, `/api/fee-schedules/${scheduleId}/items`);

export const updateFeeScheduleItem = (tenantId: string, accessToken: string, scheduleId: string, cptCode: string, data: any) =>
  authedPut(tenantId, accessToken, `/api/fee-schedules/${scheduleId}/items/${cptCode}`, data);

export const deleteFeeScheduleItem = async (tenantId: string, accessToken: string, scheduleId: string, cptCode: string) => {
  const res = await fetch(`${API_BASE}/api/fee-schedules/${scheduleId}/items/${cptCode}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete fee schedule item");
  }
  return;
};

export const importFeeScheduleItems = (tenantId: string, accessToken: string, scheduleId: string, items: any[]) =>
  authedPost(tenantId, accessToken, `/api/fee-schedules/${scheduleId}/items/import`, { items });

export const exportFeeSchedule = async (tenantId: string, accessToken: string, scheduleId: string) => {
  const res = await fetch(`${API_BASE}/api/fee-schedules/${scheduleId}/export`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    throw new Error("Failed to export fee schedule");
  }
  const blob = await res.blob();
  return blob;
};

export const fetchDefaultFeeSchedule = (tenantId: string, accessToken: string) =>
  authedGet(tenantId, accessToken, "/api/fee-schedules/default/schedule");

export const fetchFeeForCPT = (tenantId: string, accessToken: string, cptCode: string) =>
  authedGet(tenantId, accessToken, `/api/fee-schedules/default/fee/${cptCode}`);

// Diagnoses API
export async function fetchDiagnosesByEncounter(tenantId: string, accessToken: string, encounterId: string) {
  const res = await fetch(`${API_BASE}/api/diagnoses/encounter/${encounterId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load diagnoses");
  return res.json();
}

export const createDiagnosis = (tenantId: string, accessToken: string, data: any) =>
  authedPost(tenantId, accessToken, "/api/diagnoses", data);

export const updateDiagnosis = (tenantId: string, accessToken: string, id: string, data: any) =>
  authedPut(tenantId, accessToken, `/api/diagnoses/${id}`, data);

export const deleteDiagnosis = async (tenantId: string, accessToken: string, id: string) => {
  const res = await fetch(`${API_BASE}/api/diagnoses/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete diagnosis");
  }
  return res.json();
};

export async function searchICD10Codes(tenantId: string, accessToken: string, query: string) {
  const res = await fetch(`${API_BASE}/api/diagnoses/search/icd10?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to search ICD-10 codes");
  return res.json();
}

// Enhanced Charges API
export async function fetchChargesByEncounter(tenantId: string, accessToken: string, encounterId: string) {
  const res = await fetch(`${API_BASE}/api/charges/encounter/${encounterId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to load charges");
  return res.json();
}

export const updateCharge = (tenantId: string, accessToken: string, id: string, data: any) =>
  authedPut(tenantId, accessToken, `/api/charges/${id}`, data);

export const deleteCharge = async (tenantId: string, accessToken: string, id: string) => {
  const res = await fetch(`${API_BASE}/api/charges/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete charge");
  }
  return res.json();
};

export async function searchCPTCodes(tenantId: string, accessToken: string, query: string) {
  const res = await fetch(`${API_BASE}/api/charges/search/cpt?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to search CPT codes");
  return res.json();
}

// CPT Codes - Full library access
export async function fetchCptCodes(tenantId: string, accessToken: string, params?: { search?: string; category?: string; common_only?: boolean }) {
  const queryParams = new URLSearchParams();
  if (params?.search) queryParams.append("search", params.search);
  if (params?.category) queryParams.append("category", params.category);
  if (params?.common_only) queryParams.append("common_only", "true");
  const query = queryParams.toString();
  return authedGet(tenantId, accessToken, `/api/cpt-codes${query ? `?${query}` : ""}`);
}

export async function fetchCptCode(tenantId: string, accessToken: string, code: string) {
  return authedGet(tenantId, accessToken, `/api/cpt-codes/${encodeURIComponent(code)}`);
}

// ICD-10 Codes - Full library access
export async function fetchIcd10Codes(tenantId: string, accessToken: string, params?: { search?: string; category?: string; common_only?: boolean }) {
  const queryParams = new URLSearchParams();
  if (params?.search) queryParams.append("search", params.search);
  if (params?.category) queryParams.append("category", params.category);
  if (params?.common_only) queryParams.append("common_only", "true");
  const query = queryParams.toString();
  return authedGet(tenantId, accessToken, `/api/icd10-codes${query ? `?${query}` : ""}`);
}

export async function fetchIcd10Code(tenantId: string, accessToken: string, code: string) {
  return authedGet(tenantId, accessToken, `/api/icd10-codes/${encodeURIComponent(code)}`);
}

// Claims Management
export async function fetchClaims(
  tenantId: string,
  accessToken: string,
  params?: { status?: string; patientId?: string; startDate?: string; endDate?: string }
) {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.append("status", params.status);
  if (params?.patientId) queryParams.append("patientId", params.patientId);
  if (params?.startDate) queryParams.append("startDate", params.startDate);
  if (params?.endDate) queryParams.append("endDate", params.endDate);
  const query = queryParams.toString();
  return authedGet(tenantId, accessToken, `/api/claims${query ? `?${query}` : ""}`);
}

export async function fetchClaimDetail(tenantId: string, accessToken: string, claimId: string) {
  return authedGet(tenantId, accessToken, `/api/claims/${claimId}`);
}

export async function createClaim(tenantId: string, accessToken: string, data: any) {
  return authedPost(tenantId, accessToken, "/api/claims", data);
}

export async function updateClaimStatus(tenantId: string, accessToken: string, claimId: string, data: any) {
  const res = await fetch(`${API_BASE}/api/claims/${claimId}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update claim status");
  return res.json();
}

export async function postClaimPayment(tenantId: string, accessToken: string, claimId: string, data: any) {
  return authedPost(tenantId, accessToken, `/api/claims/${claimId}/payments`, data);
}

export function getSuperbillUrl(tenantId: string, accessToken: string, encounterId: string): string {
  return `${API_BASE}/api/encounters/${encounterId}/superbill?token=${accessToken}&tenant=${tenantId}`;
}

// Adaptive Learning API
export interface AdaptiveDiagnosisSuggestion {
  icd10Code: string;
  description: string;
  category?: string;
  frequencyCount: number;
  lastUsed: string;
  adaptiveScore: number;
}

export interface AdaptiveProcedureSuggestion {
  cptCode: string;
  description: string;
  category?: string;
  defaultFeeCents?: number;
  frequencyCount?: number;
  pairCount?: number;
  lastUsed: string;
  adaptiveScore: number;
}

export async function fetchSuggestedDiagnoses(
  tenantId: string,
  accessToken: string,
  providerId: string,
  limit: number = 10
): Promise<{ suggestions: AdaptiveDiagnosisSuggestion[] }> {
  const res = await fetch(`${API_BASE}/api/adaptive/diagnoses/suggested?providerId=${providerId}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to fetch suggested diagnoses");
  return res.json();
}

export async function fetchSuggestedProcedures(
  tenantId: string,
  accessToken: string,
  providerId: string,
  limit: number = 10
): Promise<{ suggestions: AdaptiveProcedureSuggestion[] }> {
  const res = await fetch(`${API_BASE}/api/adaptive/procedures/suggested?providerId=${providerId}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to fetch suggested procedures");
  return res.json();
}

export async function fetchProceduresForDiagnosis(
  tenantId: string,
  accessToken: string,
  providerId: string,
  icd10Code: string,
  limit: number = 10
): Promise<{ suggestions: AdaptiveProcedureSuggestion[] }> {
  const res = await fetch(
    `${API_BASE}/api/adaptive/procedures/for-diagnosis/${icd10Code}?providerId=${providerId}&limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
    }
  );
  if (!res.ok) throw new Error("Failed to fetch paired procedures");
  return res.json();
}

export async function fetchProviderStats(tenantId: string, accessToken: string, providerId: string) {
  const res = await fetch(`${API_BASE}/api/adaptive/stats/${providerId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to fetch provider stats");
  return res.json();
}

// AI Notes API
export interface AINoteDraftRequest {
  templateId?: string;
  chiefComplaint?: string;
  briefNotes?: string;
  patientId: string;
  encounterId?: string;
  priorEncounterIds?: string[];
}

export interface AINoteDraft {
  chiefComplaint: string;
  hpi: string;
  ros: string;
  exam: string;
  assessmentPlan: string;
  confidenceScore: number;
  suggestions: Array<{
    section: string;
    suggestion: string;
    confidence: number;
  }>;
}

export async function generateAiNoteDraft(
  tenantId: string,
  accessToken: string,
  data: AINoteDraftRequest
): Promise<{ draft: AINoteDraft; message?: string }> {
  return authedPost(tenantId, accessToken, "/api/ai-notes/draft", data);
}

// Note Templates API
export interface NoteTemplate {
  id: string;
  tenantId: string;
  providerId: string;
  name: string;
  category: string;
  description?: string;
  isShared: boolean;
  templateContent: {
    chiefComplaint?: string;
    hpi?: string;
    ros?: string;
    exam?: string;
    assessmentPlan?: string;
  };
  usageCount: number;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchNoteTemplates(
  tenantId: string,
  accessToken: string,
  filters?: { category?: string; providerId?: string }
): Promise<{ templates: NoteTemplate[] }> {
  let url = `${API_BASE}/api/note-templates`;
  const params = new URLSearchParams();
  if (filters?.category) params.append('category', filters.category);
  if (filters?.providerId) params.append('providerId', filters.providerId);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to fetch note templates");
  return res.json();
}

export async function fetchNoteTemplate(
  tenantId: string,
  accessToken: string,
  templateId: string
): Promise<{ template: NoteTemplate }> {
  const res = await fetch(`${API_BASE}/api/note-templates/${templateId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error("Failed to fetch note template");
  return res.json();
}

export async function createNoteTemplate(
  tenantId: string,
  accessToken: string,
  data: {
    name: string;
    category: string;
    description?: string;
    isShared?: boolean;
    templateContent: {
      chiefComplaint?: string;
      hpi?: string;
      ros?: string;
      exam?: string;
      assessmentPlan?: string;
    };
  }
): Promise<{ id: string; template: NoteTemplate }> {
  return authedPost(tenantId, accessToken, "/api/note-templates", data);
}

export async function updateNoteTemplate(
  tenantId: string,
  accessToken: string,
  templateId: string,
  data: Partial<{
    name: string;
    category: string;
    description: string;
    isShared: boolean;
    templateContent: {
      chiefComplaint?: string;
      hpi?: string;
      ros?: string;
      exam?: string;
      assessmentPlan?: string;
    };
  }>
): Promise<{ ok: boolean }> {
  return authedPut(tenantId, accessToken, `/api/note-templates/${templateId}`, data);
}

export async function deleteNoteTemplate(
  tenantId: string,
  accessToken: string,
  templateId: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/note-templates/${templateId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete note template");
  }
}

export async function applyNoteTemplate(
  tenantId: string,
  accessToken: string,
  templateId: string
): Promise<{ templateContent: NoteTemplate['templateContent'] }> {
  return authedPost(tenantId, accessToken, `/api/note-templates/${templateId}/apply`, {});
}

export async function toggleNoteTemplateFavorite(
  tenantId: string,
  accessToken: string,
  templateId: string
): Promise<{ isFavorite: boolean }> {
  return authedPost(tenantId, accessToken, `/api/note-templates/${templateId}/favorite`, {});
}

// ========================================
// Recalls & Reminders API
// ========================================

export interface RecallCampaign {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  recallType: string;
  intervalMonths: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRecall {
  id: string;
  tenantId: string;
  patientId: string;
  campaignId?: string;
  dueDate: string;
  status: 'pending' | 'contacted' | 'scheduled' | 'completed' | 'dismissed';
  lastContactDate?: string;
  contactMethod?: string;
  notes?: string;
  appointmentId?: string;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  campaignName?: string;
  recallType?: string;
  contactAttempts?: number;
}

export interface ReminderLogEntry {
  id: string;
  tenantId: string;
  patientId: string;
  recallId?: string;
  reminderType: 'email' | 'sms' | 'phone' | 'mail' | 'portal';
  sentAt: string;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'opted_out';
  messageContent?: string;
  sentBy?: string;
  errorMessage?: string;
  // Joined fields
  firstName?: string;
  lastName?: string;
  campaignName?: string;
}

export interface RecallStats {
  overall: {
    total_pending: number;
    total_contacted: number;
    total_scheduled: number;
    total_completed: number;
    total_dismissed: number;
    total_recalls: number;
    contactRate: number;
    conversionRate: number;
  };
  byCampaign: Array<{
    id: string;
    name: string;
    recallType: string;
    total_recalls: number;
    pending: number;
    contacted: number;
    scheduled: number;
    completed: number;
  }>;
}

export async function fetchRecallCampaigns(
  tenantId: string,
  accessToken: string
): Promise<{ campaigns: RecallCampaign[] }> {
  const res = await fetch(`${API_BASE}/api/recalls/campaigns`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to load recall campaigns");
  return res.json();
}

export async function createRecallCampaign(
  tenantId: string,
  accessToken: string,
  data: {
    name: string;
    description?: string;
    recallType: string;
    intervalMonths: number;
    isActive?: boolean;
  }
): Promise<RecallCampaign> {
  return authedPost(tenantId, accessToken, `/api/recalls/campaigns`, data);
}

export async function updateRecallCampaign(
  tenantId: string,
  accessToken: string,
  campaignId: string,
  data: Partial<{
    name: string;
    description: string;
    recallType: string;
    intervalMonths: number;
    isActive: boolean;
  }>
): Promise<RecallCampaign> {
  const res = await fetch(`${API_BASE}/api/recalls/campaigns/${campaignId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update campaign");
  return res.json();
}

export async function deleteRecallCampaign(
  tenantId: string,
  accessToken: string,
  campaignId: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recalls/campaigns/${campaignId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to delete campaign");
}

export async function generateRecalls(
  tenantId: string,
  accessToken: string,
  campaignId: string
): Promise<{ created: number; skipped: number; errors: string[] }> {
  return authedPost(tenantId, accessToken, `/api/recalls/campaigns/${campaignId}/generate`, {});
}

export async function generateAllRecalls(
  tenantId: string,
  accessToken: string
): Promise<{ campaigns: number; totalCreated: number; totalSkipped: number; errors: string[] }> {
  return authedPost(tenantId, accessToken, `/api/recalls/generate-all`, {});
}

export async function fetchDueRecalls(
  tenantId: string,
  accessToken: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    campaignId?: string;
    status?: string;
  }
): Promise<{ recalls: PatientRecall[] }> {
  let url = `${API_BASE}/api/recalls/due`;
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.campaignId) params.append('campaignId', filters.campaignId);
  if (filters?.status) params.append('status', filters.status);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to load due recalls");
  return res.json();
}

export async function createPatientRecall(
  tenantId: string,
  accessToken: string,
  data: {
    patientId: string;
    campaignId?: string;
    dueDate: string;
    notes?: string;
  }
): Promise<PatientRecall> {
  return authedPost(tenantId, accessToken, `/api/recalls/patient`, data);
}

export async function updateRecallStatus(
  tenantId: string,
  accessToken: string,
  recallId: string,
  data: {
    status: string;
    appointmentId?: string;
    notes?: string;
  }
): Promise<PatientRecall> {
  const res = await fetch(`${API_BASE}/api/recalls/${recallId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update recall status");
  return res.json();
}

export async function recordRecallContact(
  tenantId: string,
  accessToken: string,
  recallId: string,
  data: {
    contactMethod: string;
    notes?: string;
    messageContent?: string;
  }
): Promise<{ message: string }> {
  return authedPost(tenantId, accessToken, `/api/recalls/${recallId}/contact`, data);
}

export async function fetchRecallHistory(
  tenantId: string,
  accessToken: string,
  filters?: {
    patientId?: string;
    campaignId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<{ history: ReminderLogEntry[] }> {
  let url = `${API_BASE}/api/recalls/history`;
  const params = new URLSearchParams();
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.campaignId) params.append('campaignId', filters.campaignId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to load recall history");
  return res.json();
}

export async function fetchRecallStats(
  tenantId: string,
  accessToken: string,
  filters?: {
    campaignId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<RecallStats> {
  let url = `${API_BASE}/api/recalls/stats`;
  const params = new URLSearchParams();
  if (filters?.campaignId) params.append('campaignId', filters.campaignId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to load recall stats");
  return res.json();
}

export async function exportRecalls(
  tenantId: string,
  accessToken: string,
  filters?: {
    campaignId?: string;
    status?: string;
  }
): Promise<Blob> {
  let url = `${API_BASE}/api/recalls/export`;
  const params = new URLSearchParams();
  if (filters?.campaignId) params.append('campaignId', filters.campaignId);
  if (filters?.status) params.append('status', filters.status);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to export recalls");
  return res.blob();
}

const authedDelete = async (tenantId: string, accessToken: string, path: string) => {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${path}`);
  }
  return res.json();
};

// Export Patient type for use in RemindersPage
export type { Patient } from './types';

// ========================================
// Prior Authorization (ePA) API
// ========================================

export async function submitPriorAuth(tenantId: string, accessToken: string, id: string) {
  const res = await fetch(`${API_BASE}/api/prior-auth/${id}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to submit prior authorization");
  }
  return res.json();
}

export async function uploadPriorAuthDocument(
  tenantId: string,
  accessToken: string,
  id: string,
  file: File,
  documentType?: string,
  notes?: string
) {
  // First upload the file
  const uploadedFile = await uploadDocumentFile(tenantId, accessToken, file);

  // Then attach it to the prior auth
  const res = await fetch(`${API_BASE}/api/prior-auth/${id}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
    body: JSON.stringify({
      documentUrl: uploadedFile.url,
      documentName: file.name,
      documentType: documentType || "prior_auth_support",
      notes,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to upload document");
  }
  return res.json();
}

export async function checkPriorAuthStatus(tenantId: string, accessToken: string, id: string) {
  const res = await fetch(`${API_BASE}/api/prior-auth/${id}/status`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to check status");
  }
  return res.json();
}

export async function fetchPriorAuths(
  tenantId: string,
  accessToken: string,
  filters?: { status?: string; patientId?: string }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.patientId) params.append("patientId", filters.patientId);
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/prior-auth${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load prior authorizations");
  return res.json();
}

export async function fetchPriorAuth(tenantId: string, accessToken: string, id: string) {
  const res = await fetch(`${API_BASE}/api/prior-auth/${id}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load prior authorization");
  return res.json();
}

export async function createPriorAuth(tenantId: string, accessToken: string, data: any) {
  return authedPost(tenantId, accessToken, "/api/prior-auth", data);
}

export async function updatePriorAuth(tenantId: string, accessToken: string, id: string, data: any) {
  const res = await fetch(`${API_BASE}/api/prior-auth/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update prior authorization");
  }
  return res.json();
}

// PA Request API (using /api/prior-auth-requests endpoint)
export async function createPARequest(tenantId: string, accessToken: string, data: {
  patientId: string;
  prescriptionId?: string;
  medicationName?: string;
  medicationStrength?: string;
  medicationQuantity?: number;
  sig?: string;
  payer: string;
  memberId: string;
  prescriberId?: string;
  prescriberNpi?: string;
  prescriberName?: string;
}) {
  return authedPost(tenantId, accessToken, "/api/prior-auth-requests", data);
}

export async function fetchPARequests(
  tenantId: string,
  accessToken: string,
  filters?: { status?: string; patientId?: string; payer?: string }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.patientId) params.append("patientId", filters.patientId);
  if (filters?.payer) params.append("payer", filters.payer);
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/prior-auth-requests${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load PA requests");
  const result = await res.json();
  return result.data || [];
}

export async function fetchPARequest(tenantId: string, accessToken: string, id: string) {
  const res = await fetch(`${API_BASE}/api/prior-auth-requests/${id}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load PA request");
  const result = await res.json();
  return result.data;
}

export async function submitPARequest(tenantId: string, accessToken: string, id: string) {
  const res = await fetch(`${API_BASE}/api/prior-auth-requests/${id}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to submit PA request");
  }
  return res.json();
}

export async function checkPARequestStatus(tenantId: string, accessToken: string, id: string) {
  const res = await fetch(`${API_BASE}/api/prior-auth-requests/${id}/status`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to check PA status");
  }
  return res.json();
}

export async function updatePARequest(tenantId: string, accessToken: string, id: string, data: {
  status?: "pending" | "submitted" | "approved" | "denied" | "needs_info" | "error";
  statusReason?: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileType: string;
    uploadedAt: string;
  }>;
}) {
  const res = await fetch(`${API_BASE}/api/prior-auth-requests/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update PA request");
  }
  return res.json();
}

// Generic API wrapper object for use in components
export const api = {
  get: authedGet,
  post: authedPost,
  put: authedPut,
  delete: authedDelete,
  getPatients: fetchPatients,
};

// ========================================
// Waitlist API
// ========================================

export async function triggerWaitlistAutoFill(
  tenantId: string,
  accessToken: string,
  filters: {
    appointmentId: string;
    providerId: string;
    appointmentDate: string;
    appointmentTime: string;
  }
): Promise<{ message: string; appointmentId: string; eligibleCount: number; notifications: any[] }> {
  const res = await fetch(`${API_BASE}/api/waitlist/auto-fill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(filters),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to trigger waitlist auto-fill');
  }
  return res.json();
}

export async function notifyWaitlistPatient(
  tenantId: string,
  accessToken: string,
  waitlistId: string,
  data: {
    method: 'sms' | 'email' | 'portal' | 'phone';
    appointmentDate: string;
    appointmentTime: string;
    providerName: string;
  }
): Promise<{ message: string; waitlistId: string; method: string; notifiedAt: string; notificationId?: string }> {
  const res = await fetch(`${API_BASE}/api/waitlist/${waitlistId}/notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to notify waitlist patient');
  }
  return res.json();
}

export async function getWaitlistNotifications(
  tenantId: string,
  accessToken: string,
  waitlistId: string
): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/waitlist/${waitlistId}/notifications`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get notification history');
  }
  return res.json();
}

export async function fillWaitlistEntry(
  tenantId: string,
  accessToken: string,
  waitlistId: string,
  appointmentId: string
): Promise<{ message: string; waitlist: any }> {
  const res = await fetch(`${API_BASE}/api/waitlist/${waitlistId}/fill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ appointmentId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fill waitlist entry');
  }
  return res.json();
}

// ============================================================================
// Fax Management APIs
// ============================================================================

export async function fetchFaxInbox(
  tenantId: string,
  accessToken: string,
  filters?: {
    status?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ faxes: any[] }> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.unreadOnly) params.append('unreadOnly', 'true');
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());

  const url = `${API_BASE}/api/fax/inbox${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch fax inbox');
  return res.json();
}

export async function fetchFaxOutbox(
  tenantId: string,
  accessToken: string,
  filters?: {
    status?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ faxes: any[] }> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());

  const url = `${API_BASE}/api/fax/outbox${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch fax outbox');
  return res.json();
}

export async function sendFax(
  tenantId: string,
  accessToken: string,
  data: {
    recipientNumber: string;
    recipientName?: string;
    subject: string;
    coverPageMessage?: string;
    patientId?: string;
    encounterId?: string;
    documentIds?: string[];
    pages?: number;
  }
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/fax/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send fax');
  }
  return res.json();
}

export async function updateFax(
  tenantId: string,
  accessToken: string,
  id: string,
  data: {
    read?: boolean;
    patientId?: string;
    notes?: string;
    assignedTo?: string;
  }
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/fax/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update fax');
  }
  return res.json();
}

export async function deleteFax(
  tenantId: string,
  accessToken: string,
  id: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/fax/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete fax');
  }
  return res.json();
}

export async function fetchFaxPdf(
  tenantId: string,
  accessToken: string,
  id: string
): Promise<{ pdfUrl: string; storage: string; objectKey?: string }> {
  const res = await fetch(`${API_BASE}/api/fax/${id}/pdf`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch fax PDF');
  return res.json();
}

export async function fetchFaxStats(
  tenantId: string,
  accessToken: string
): Promise<{
  inboundTotal: number;
  unreadTotal: number;
  outboundTotal: number;
  sendingTotal: number;
  sentTotal: number;
  failedTotal: number;
}> {
  const res = await fetch(`${API_BASE}/api/fax/meta/stats`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch fax stats');
  return res.json();
}

export async function simulateIncomingFax(
  tenantId: string,
  accessToken: string
): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/fax/simulate-incoming`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to simulate incoming fax');
  }
  return res.json();
}

// ========================================
// Time Blocks API
// ========================================

export interface TimeBlock {
  id: string;
  tenantId: string;
  providerId: string;
  locationId?: string;
  title: string;
  blockType: 'blocked' | 'lunch' | 'meeting' | 'admin' | 'continuing_education' | 'out_of_office';
  description?: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceEndDate?: string;
  status: 'active' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export async function fetchTimeBlocks(
  tenantId: string,
  accessToken: string,
  filters?: {
    providerId?: string;
    locationId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<TimeBlock[]> {
  let url = `${API_BASE}/api/time-blocks`;
  const params = new URLSearchParams();
  if (filters?.providerId) params.append('providerId', filters.providerId);
  if (filters?.locationId) params.append('locationId', filters.locationId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (params.toString()) url += `?${params.toString()}`;

  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to load time blocks");
  return res.json();
}

export async function createTimeBlock(
  tenantId: string,
  accessToken: string,
  data: {
    providerId: string;
    locationId?: string;
    title: string;
    blockType: TimeBlock['blockType'];
    description?: string;
    startTime: string;
    endTime: string;
    isRecurring?: boolean;
    recurrencePattern?: TimeBlock['recurrencePattern'];
    recurrenceEndDate?: string;
  }
): Promise<TimeBlock> {
  const res = await fetch(`${API_BASE}/api/time-blocks`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create time block");
  }
  return res.json();
}

export async function updateTimeBlock(
  tenantId: string,
  accessToken: string,
  id: string,
  data: Partial<{
    title: string;
    blockType: TimeBlock['blockType'];
    description: string;
    startTime: string;
    endTime: string;
    isRecurring: boolean;
    recurrencePattern: TimeBlock['recurrencePattern'];
    recurrenceEndDate: string;
    locationId: string;
  }>
): Promise<TimeBlock> {
  const res = await fetch(`${API_BASE}/api/time-blocks/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update time block");
  }
  return res.json();
}

export async function deleteTimeBlock(
  tenantId: string,
  accessToken: string,
  id: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/time-blocks/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete time block");
  }
}

// ========================================
// Prescriptions / Refill Management API
// ========================================

export async function fetchRefillRequests(
  tenantId: string,
  accessToken: string,
  filters?: { status?: string; patientId?: string }
): Promise<{ refillRequests: any[] }> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.patientId) params.append('patientId', filters.patientId);
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/prescriptions/refill-requests${query ? `?${query}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch refill requests');
  return res.json();
}

export async function denyRefill(
  tenantId: string,
  accessToken: string,
  prescriptionId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/prescriptions/${prescriptionId}/refill-deny`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to deny refill');
  }
  return res.json();
}

export async function requestMedicationChange(
  tenantId: string,
  accessToken: string,
  prescriptionId: string,
  data: { changeType: string; details: string }
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/prescriptions/${prescriptionId}/change-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to request medication change');
  }
  return res.json();
}

export async function confirmAudit(
  tenantId: string,
  accessToken: string,
  prescriptionId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/prescriptions/${prescriptionId}/audit-confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to confirm audit');
  }
  return res.json();
}

// ========================================
// Advanced Note Management API
// ========================================

export interface Note {
  id: string;
  patientId: string;
  providerId: string;
  appointmentId?: string;
  status: 'draft' | 'preliminary' | 'final' | 'signed';
  chiefComplaint?: string;
  hpi?: string;
  ros?: string;
  exam?: string;
  assessmentPlan?: string;
  visitCode?: string;
  signedAt?: string;
  signedBy?: string;
  createdAt: string;
  updatedAt: string;
  patientFirstName?: string;
  patientLastName?: string;
  providerName?: string;
}

export async function fetchNotes(
  tenantId: string,
  accessToken: string,
  filters?: {
    status?: 'draft' | 'preliminary' | 'final' | 'signed';
    providerId?: string;
    startDate?: string;
    endDate?: string;
    patientId?: string;
  }
): Promise<{ notes: Note[] }> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.providerId) params.append('providerId', filters.providerId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.patientId) params.append('patientId', filters.patientId);

  const url = `${API_BASE}/api/notes${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json();
}

export async function bulkFinalizeNotes(
  tenantId: string,
  accessToken: string,
  noteIds: string[]
): Promise<{ success: boolean; finalizedCount: number; message: string }> {
  const res = await fetch(`${API_BASE}/api/notes/bulk/finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ noteIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to finalize notes');
  }
  return res.json();
}

export async function bulkAssignNotes(
  tenantId: string,
  accessToken: string,
  noteIds: string[],
  providerId: string
): Promise<{ success: boolean; assignedCount: number; message: string }> {
  const res = await fetch(`${API_BASE}/api/notes/bulk/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ noteIds, providerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to assign notes');
  }
  return res.json();
}

export async function signNote(
  tenantId: string,
  accessToken: string,
  noteId: string
): Promise<{ success: boolean; message: string; signedAt: string; signedBy: string }> {
  const res = await fetch(`${API_BASE}/api/notes/${noteId}/sign`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to sign note');
  }
  return res.json();
}

export async function addNoteAddendum(
  tenantId: string,
  accessToken: string,
  noteId: string,
  addendum: string
): Promise<{ success: boolean; message: string; addendumId: string; addedAt: string }> {
  const res = await fetch(`${API_BASE}/api/notes/${noteId}/addendum`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ addendum }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add addendum');
  }
  return res.json();
}

export async function fetchNoteAddendums(
  tenantId: string,
  accessToken: string,
  noteId: string
): Promise<{ addendums: Array<{ id: string; addendumText: string; addedBy: string; createdAt: string; addedByName?: string }> }> {
  const res = await fetch(`${API_BASE}/api/notes/${noteId}/addendums`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch addendums');
  return res.json();
}

// ========================================
// Clearinghouse / ERA / EFT APIs
// ========================================

export async function submitClaimToClearinghouse(
  tenantId: string,
  accessToken: string,
  claimId: string,
  batchId?: string
) {
  const res = await fetch(`${API_BASE}/api/clearinghouse/submit-claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ claimId, batchId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to submit claim to clearinghouse');
  }
  return res.json();
}

export async function fetchClaimStatus(
  tenantId: string,
  accessToken: string,
  claimId: string
) {
  const res = await fetch(`${API_BASE}/api/clearinghouse/claim-status/${claimId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch claim status');
  return res.json();
}

export async function fetchRemittanceAdvice(
  tenantId: string,
  accessToken: string,
  filters?: { status?: string; payer?: string; startDate?: string; endDate?: string }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.payer) params.append('payer', filters.payer);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/clearinghouse/era${query ? `?${query}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch remittance advice');
  return res.json();
}

export async function postERA(
  tenantId: string,
  accessToken: string,
  eraId: string
) {
  const res = await fetch(`${API_BASE}/api/clearinghouse/era/${eraId}/post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to post ERA');
  }
  return res.json();
}

export async function fetchEFTTransactions(
  tenantId: string,
  accessToken: string,
  filters?: { reconciled?: boolean; payer?: string; startDate?: string; endDate?: string }
) {
  const params = new URLSearchParams();
  if (filters?.reconciled !== undefined) params.append('reconciled', String(filters.reconciled));
  if (filters?.payer) params.append('payer', filters.payer);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/clearinghouse/eft${query ? `?${query}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch EFT transactions');
  return res.json();
}

export async function reconcilePayments(
  tenantId: string,
  accessToken: string,
  data: { eraId: string; eftId?: string; varianceReason?: string; notes?: string }
) {
  const res = await fetch(`${API_BASE}/api/clearinghouse/reconcile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to reconcile payments');
  }
  return res.json();
}

export async function fetchClosingReport(
  tenantId: string,
  accessToken: string,
  dateRange: { startDate: string; endDate: string; reportType?: string }
) {
  const params = new URLSearchParams();
  params.append('startDate', dateRange.startDate);
  params.append('endDate', dateRange.endDate);
  if (dateRange.reportType) params.append('reportType', dateRange.reportType);
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/clearinghouse/reports/closing?${query}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch closing report');
  return res.json();
}

export async function fetchERADetails(
  tenantId: string,
  accessToken: string,
  eraId: string
) {
  const res = await fetch(`${API_BASE}/api/clearinghouse/era/${eraId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch ERA details');
  return res.json();
}

// ========================================
// Quality Measures / MIPS / CQM APIs
// ========================================

export interface QualityMeasure {
  id: string;
  measure_code: string;
  measure_name: string;
  category: string;
  description: string;
  numerator_criteria: any;
  denominator_criteria: any;
  exclusion_criteria: any;
  specialty: string;
  is_active: boolean;
  reporting_year: number;
  created_at: string;
  updated_at: string;
}

export interface MeasurePerformance {
  id: string;
  tenant_id: string;
  provider_id?: string;
  provider_name?: string;
  measure_id: string;
  measure_code: string;
  measure_name: string;
  category: string;
  description: string;
  reporting_period_start: string;
  reporting_period_end: string;
  numerator_count: number;
  denominator_count: number;
  exclusion_count: number;
  performance_rate: string;
  meets_benchmark: boolean;
  benchmark_rate?: number;
  last_calculated_at?: string;
}

export interface MIPSSubmission {
  id: string;
  tenant_id: string;
  provider_id?: string;
  provider_name?: string;
  submission_year: number;
  submission_quarter: number;
  submission_type: string;
  submission_date?: string;
  status: string;
  confirmation_number?: string;
  score?: number;
  feedback?: string;
  created_at: string;
  updated_at: string;
}

export interface QualityGap {
  id: string;
  tenant_id: string;
  patient_id: string;
  patient_name: string;
  provider_id?: string;
  provider_name?: string;
  measure_id: string;
  measure_name: string;
  measure_code: string;
  category: string;
  gap_type: string;
  gap_description: string;
  priority: string;
  due_date?: string;
  status: string;
  dob?: string;
  phone?: string;
  email?: string;
  intervention_notes?: string;
  closed_date?: string;
  created_at: string;
  updated_at: string;
}

export async function fetchQualityMeasures(
  tenantId: string,
  accessToken: string,
  filters?: { category?: string; specialty?: string; active?: boolean }
): Promise<QualityMeasure[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.append('category', filters.category);
  if (filters?.specialty) params.append('specialty', filters.specialty);
  if (filters?.active !== undefined) params.append('active', String(filters.active));

  const url = `${API_BASE}/api/quality/measures${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch quality measures');
  return res.json();
}

export async function fetchMeasurePerformance(
  tenantId: string,
  accessToken: string,
  filters?: {
    providerId?: string;
    measureId?: string;
    startDate?: string;
    endDate?: string;
    year?: number;
    quarter?: number;
  }
): Promise<MeasurePerformance[]> {
  const params = new URLSearchParams();
  if (filters?.providerId) params.append('providerId', filters.providerId);
  if (filters?.measureId) params.append('measureId', filters.measureId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.year) params.append('year', String(filters.year));
  if (filters?.quarter) params.append('quarter', String(filters.quarter));

  const url = `${API_BASE}/api/quality/performance${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch measure performance');
  return res.json();
}

export async function submitMIPSData(
  tenantId: string,
  accessToken: string,
  data: {
    providerId?: string;
    year: number;
    quarter: number;
    measures: any[];
    submissionType?: string;
  }
): Promise<MIPSSubmission> {
  const res = await fetch(`${API_BASE}/api/quality/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to submit MIPS data');
  }
  return res.json();
}

export async function fetchMIPSReport(
  tenantId: string,
  accessToken: string,
  year: number,
  quarter?: number,
  providerId?: string
): Promise<{
  year: number;
  quarter: string | number;
  total_submissions: number;
  submissions: MIPSSubmission[];
  average_score: number;
}> {
  const params = new URLSearchParams();
  params.append('year', String(year));
  if (quarter) params.append('quarter', String(quarter));
  if (providerId) params.append('providerId', providerId);

  const url = `${API_BASE}/api/quality/reports/mips?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch MIPS report');
  return res.json();
}

export async function fetchPQRSReport(
  tenantId: string,
  accessToken: string,
  year?: number,
  providerId?: string
): Promise<{
  year: number;
  provider_id: string;
  generated_at: string;
  performance_by_category: Record<string, any[]>;
  total_measures: number;
  average_performance: number;
}> {
  const params = new URLSearchParams();
  if (year) params.append('year', String(year));
  if (providerId) params.append('providerId', providerId);

  const url = `${API_BASE}/api/quality/reports/pqrs${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch PQRS report');
  return res.json();
}

export async function fetchGapClosureList(
  tenantId: string,
  accessToken: string,
  filters?: {
    measureId?: string;
    providerId?: string;
    status?: string;
    priority?: string;
  }
): Promise<QualityGap[]> {
  const params = new URLSearchParams();
  if (filters?.measureId) params.append('measureId', filters.measureId);
  if (filters?.providerId) params.append('providerId', filters.providerId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.priority) params.append('priority', filters.priority);

  const url = `${API_BASE}/api/quality/gap-closure${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch gap closure list');
  return res.json();
}

export async function closeQualityGap(
  tenantId: string,
  accessToken: string,
  gapId: string,
  interventionNotes?: string
): Promise<QualityGap> {
  const res = await fetch(`${API_BASE}/api/quality/gap-closure/${gapId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ interventionNotes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to close quality gap');
  }
  return res.json();
}

export async function recalculateQualityMeasures(
  tenantId: string,
  accessToken: string,
  data: {
    providerId?: string;
    measureId?: string;
    startDate: string;
    endDate: string;
  }
): Promise<{ recalculated: number; results: any[] }> {
  const res = await fetch(`${API_BASE}/api/quality/recalculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to recalculate quality measures');
  }
  return res.json();
}

// ============================================================================
// SMS / TEXT MESSAGING API
// ============================================================================

export interface SMSTemplate {
  id: string;
  name: string;
  description?: string;
  messageBody: string;
  category?: string;
  isSystemTemplate: boolean;
  isActive: boolean;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
}

export interface ScheduledMessage {
  id: string;
  patientId?: string;
  patientIds?: string[];
  patientName?: string;
  messageBody: string;
  templateId?: string;
  templateName?: string;
  scheduledSendTime: string;
  isRecurring: boolean;
  recurrencePattern?: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  createdAt: string;
  sentAt?: string;
}

/**
 * Fetch SMS message templates
 */
export async function fetchSMSTemplates(
  tenantId: string,
  accessToken: string,
  filters?: {
    category?: string;
    activeOnly?: boolean;
  }
): Promise<{ templates: SMSTemplate[] }> {
  const params = new URLSearchParams();
  if (filters?.category) params.append('category', filters.category);
  if (filters?.activeOnly) params.append('activeOnly', 'true');

  const url = `${API_BASE}/api/sms/templates${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch SMS templates');
  return res.json();
}

/**
 * Create SMS template
 */
export async function createSMSTemplate(
  tenantId: string,
  accessToken: string,
  data: {
    name: string;
    description?: string;
    messageBody: string;
    category?: string;
  }
): Promise<{ success: boolean; templateId: string }> {
  const res = await fetch(`${API_BASE}/api/sms/templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create SMS template');
  }
  return res.json();
}

/**
 * Update SMS template
 */
export async function updateSMSTemplate(
  tenantId: string,
  accessToken: string,
  templateId: string,
  data: {
    name?: string;
    description?: string;
    messageBody?: string;
    category?: string;
    isActive?: boolean;
  }
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/sms/templates/${templateId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update SMS template');
  }
  return res.json();
}

/**
 * Delete SMS template
 */
export async function deleteSMSTemplate(
  tenantId: string,
  accessToken: string,
  templateId: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/sms/templates/${templateId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete SMS template');
  }
  return res.json();
}

/**
 * Send bulk SMS
 */
export async function sendBulkSMS(
  tenantId: string,
  accessToken: string,
  data: {
    patientIds: string[];
    messageBody: string;
    templateId?: string;
    scheduleTime?: string;
  }
): Promise<{
  success: boolean;
  scheduledId?: string;
  scheduled?: boolean;
  results?: {
    total: number;
    sent: number;
    failed: number;
    messageIds: string[];
  };
}> {
  const res = await fetch(`${API_BASE}/api/sms/send-bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send bulk SMS');
  }
  return res.json();
}

/**
 * Fetch scheduled messages
 */
export async function fetchScheduledMessages(
  tenantId: string,
  accessToken: string,
  status?: string
): Promise<{ scheduled: ScheduledMessage[] }> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);

  const url = `${API_BASE}/api/sms/scheduled${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch scheduled messages');
  return res.json();
}

/**
 * Create scheduled message
 */
export async function createScheduledMessage(
  tenantId: string,
  accessToken: string,
  data: {
    patientId?: string;
    patientIds?: string[];
    messageBody: string;
    templateId?: string;
    scheduledSendTime: string;
    isRecurring?: boolean;
    recurrencePattern?: string;
    recurrenceEndDate?: string;
  }
): Promise<{ success: boolean; scheduledId: string }> {
  const res = await fetch(`${API_BASE}/api/sms/scheduled`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create scheduled message');
  }
  return res.json();
}

/**
 * Cancel scheduled message
 */
export async function cancelScheduledMessage(
  tenantId: string,
  accessToken: string,
  scheduledId: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/sms/scheduled/${scheduledId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to cancel scheduled message');
  }
  return res.json();
}

// ============================================================================
// SMS CONVERSATIONS API (for chat-style messaging UI)
// ============================================================================

export interface SMSConversation {
  patientId: string;
  firstName: string;
  lastName: string;
  phone: string;
  smsOptIn: boolean;
  optedOutAt?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

export interface SMSMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  messageBody: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface SMSConversationDetail {
  patientId: string;
  patientName: string;
  patientPhone: string;
  messages: SMSMessage[];
}

/**
 * Fetch all SMS conversations
 */
export async function fetchSMSConversations(
  tenantId: string,
  accessToken: string
): Promise<{ conversations: SMSConversation[] }> {
  const res = await fetch(`${API_BASE}/api/sms/conversations`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch SMS conversations');
  return res.json();
}

/**
 * Fetch a specific SMS conversation with a patient
 */
export async function fetchSMSConversation(
  tenantId: string,
  accessToken: string,
  patientId: string
): Promise<SMSConversationDetail> {
  const res = await fetch(`${API_BASE}/api/sms/conversations/${patientId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch SMS conversation');
  return res.json();
}

/**
 * Send a message in an SMS conversation
 */
export async function sendSMSConversationMessage(
  tenantId: string,
  accessToken: string,
  patientId: string,
  message: string
): Promise<{ success: boolean; messageId: string; twilioSid: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/sms/conversations/${patientId}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send message');
  }
  return res.json();
}

/**
 * Mark SMS conversation as read
 */
export async function markSMSConversationRead(
  tenantId: string,
  accessToken: string,
  patientId: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/sms/conversations/${patientId}/mark-read`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to mark conversation as read');
  return res.json();
}

export async function getNearbyPharmacies(
  tenantId: string,
  accessToken: string,
  location: {
    latitude?: number;
    longitude?: number;
    radius?: number;
    city?: string;
    state?: string;
    zip?: string;
  }
): Promise<{ pharmacies: any[]; total: number }> {
  const queryParams = new URLSearchParams();
  if (location.latitude) queryParams.append('latitude', location.latitude.toString());
  if (location.longitude) queryParams.append('longitude', location.longitude.toString());
  if (location.radius) queryParams.append('radius', location.radius.toString());
  if (location.city) queryParams.append('city', location.city);
  if (location.state) queryParams.append('state', location.state);
  if (location.zip) queryParams.append('zip', location.zip);

  const res = await fetch(`${API_BASE}/api/pharmacies/nearby?${queryParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to find nearby pharmacies');
  }
  return res.json();
}

export async function getPharmacyByNcpdp(
  tenantId: string,
  accessToken: string,
  ncpdpId: string
): Promise<{ pharmacy: any }> {
  const res = await fetch(`${API_BASE}/api/pharmacies/ncpdp/${ncpdpId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch pharmacy');
  }
  return res.json();
}

export async function getPatientRxHistory(
  tenantId: string,
  accessToken: string,
  patientId: string,
  params?: {
    startDate?: string;
    endDate?: string;
    pharmacyId?: string;
    source?: string;
  }
): Promise<{ rxHistory: any[]; totalRecords: number; surescriptsMessageId?: string }> {
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.append('startDate', params.startDate);
  if (params?.endDate) queryParams.append('endDate', params.endDate);
  if (params?.pharmacyId) queryParams.append('pharmacyId', params.pharmacyId);
  if (params?.source) queryParams.append('source', params.source);

  const res = await fetch(`${API_BASE}/api/rx-history/${patientId}?${queryParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch Rx history');
  }
  return res.json();
}

export async function importSurescriptsRxHistory(
  tenantId: string,
  accessToken: string,
  patientId: string
): Promise<{ success: boolean; importedCount: number; messageId: string }> {
  const res = await fetch(`${API_BASE}/api/rx-history/import-surescripts/${patientId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to import Rx history');
  }
  return res.json();
}

export async function sendElectronicRx(
  tenantId: string,
  accessToken: string,
  data: {
    prescriptionId: string;
    pharmacyNcpdp: string;
  }
): Promise<{ success: boolean; messageId: string; pharmacyName: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/prescriptions/send-erx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send electronic prescription');
  }
  return res.json();
}

export async function checkFormulary(
  tenantId: string,
  accessToken: string,
  data: {
    medicationName: string;
    ndc?: string;
    payerId?: string;
  }
): Promise<{
  messageId: string;
  medicationName: string;
  formularyStatus: string;
  tier: number;
  copayAmount?: number;
  requiresPriorAuth: boolean;
  requiresStepTherapy: boolean;
  quantityLimit?: number;
  alternatives: any[];
}> {
  const res = await fetch(`${API_BASE}/api/prescriptions/check-formulary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to check formulary');
  }
  return res.json();
}

export async function getPatientBenefits(
  tenantId: string,
  accessToken: string,
  patientId: string
): Promise<{
  messageId: string;
  patientId: string;
  coverage: any;
  benefits: any;
} | null> {
  const res = await fetch(`${API_BASE}/api/prescriptions/patient-benefits/${patientId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch patient benefits');
  }
  return res.json();
}

// ========================================
// Telehealth Video Consultation APIs
// ========================================

export interface TelehealthSession {
  id: number;
  tenant_id: string;
  appointment_id?: number;
  patient_id: number;
  provider_id: number;
  session_token: string;
  room_name: string;
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'error';
  started_at?: string;
  ended_at?: string;
  duration_minutes?: number;
  recording_consent: boolean;
  recording_consent_timestamp?: string;
  patient_state: string;
  provider_licensed_states?: string[];
  state_licensing_verified: boolean;
  virtual_background_enabled: boolean;
  beauty_filter_enabled: boolean;
  screen_sharing_enabled: boolean;
  connection_quality?: string;
  reconnection_count: number;
  created_at: string;
  updated_at: string;
  patient_first_name?: string;
  patient_last_name?: string;
  provider_name?: string;
}

export interface WaitingRoomEntry {
  id: number;
  tenant_id: string;
  session_id: number;
  patient_id: number;
  joined_at: string;
  queue_position: number;
  estimated_wait_minutes: number;
  camera_working?: boolean;
  microphone_working?: boolean;
  speaker_working?: boolean;
  bandwidth_adequate?: boolean;
  browser_compatible?: boolean;
  equipment_check_completed: boolean;
  chat_messages: any[];
  front_desk_notified: boolean;
  status: 'waiting' | 'ready' | 'called' | 'left';
  called_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionNotes {
  id: number;
  tenant_id: string;
  session_id: number;
  encounter_id?: number;
  chief_complaint?: string;
  hpi?: string;
  examination_findings?: string;
  assessment?: string;
  plan?: string;
  photos_captured?: any[];
  annotations?: any[];
  ai_suggestions?: any;
  ai_generated_summary?: string;
  suggested_cpt_codes?: string[];
  suggested_icd10_codes?: string[];
  complexity_level?: string;
  finalized: boolean;
  finalized_at?: string;
  finalized_by?: number;
  created_at: string;
  updated_at: string;
}

export interface QualityMetric {
  id: number;
  tenant_id: string;
  session_id: number;
  recorded_at: string;
  participant_type: 'patient' | 'provider';
  bitrate_kbps?: number;
  packet_loss_percent?: number;
  jitter_ms?: number;
  latency_ms?: number;
  video_resolution?: string;
  video_fps?: number;
  audio_quality?: string;
  connection_type?: string;
  bandwidth_up_mbps?: number;
  bandwidth_down_mbps?: number;
  freezes_count: number;
  audio_drops_count: number;
  created_at: string;
}

export interface SessionRecording {
  id: number;
  tenant_id: string;
  session_id: number;
  storage_type: 's3' | 'local' | 'azure';
  file_path: string;
  encrypted: boolean;
  encryption_key_id?: string;
  file_size_bytes?: number;
  duration_seconds?: number;
  format: string;
  resolution?: string;
  consent_verified: boolean;
  auto_delete_date?: string;
  access_log: any[];
  status: 'processing' | 'available' | 'deleted' | 'error';
  created_at: string;
  updated_at: string;
}

export interface SessionPhoto {
  id: number;
  tenant_id: string;
  session_id: number;
  patient_id: number;
  file_path: string;
  storage_type: string;
  file_size_bytes?: number;
  captured_at: string;
  body_site?: string;
  view_type?: string;
  has_annotations: boolean;
  annotation_data?: any;
  linked_to_note: boolean;
  linked_to_encounter: boolean;
  created_at: string;
}

export interface ProviderLicense {
  id: number;
  tenant_id: string;
  provider_id: number;
  state_code: string;
  license_number: string;
  license_type?: string;
  issue_date?: string;
  expiration_date?: string;
  status: 'active' | 'expired' | 'suspended' | 'revoked';
  verified: boolean;
  verified_date?: string;
  verification_source?: string;
  created_at: string;
  updated_at: string;
}

export interface EducationalContent {
  id: number;
  tenant_id: string;
  title: string;
  content_type: 'video' | 'article' | 'infographic' | 'faq';
  content_url?: string;
  description?: string;
  thumbnail_url?: string;
  categories?: string[];
  duration_seconds?: number;
  active: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

// Session Management
export async function createTelehealthSession(
  tenantId: string,
  accessToken: string,
  data: {
    patientId: number;
    providerId: number;
    patientState: string;
    appointmentId?: number;
    recordingConsent?: boolean;
  }
): Promise<TelehealthSession> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create telehealth session');
  }
  return res.json();
}

export async function fetchTelehealthSession(
  tenantId: string,
  accessToken: string,
  sessionId: number
): Promise<TelehealthSession> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch telehealth session');
  return res.json();
}

export async function fetchTelehealthSessions(
  tenantId: string,
  accessToken: string,
  params?: {
    status?: string;
    providerId?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<TelehealthSession[]> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.append('status', params.status);
  if (params?.providerId) queryParams.append('providerId', params.providerId);
  if (params?.patientId) queryParams.append('patientId', params.patientId);
  if (params?.startDate) queryParams.append('startDate', params.startDate);
  if (params?.endDate) queryParams.append('endDate', params.endDate);
  const query = queryParams.toString();

  const res = await fetch(`${API_BASE}/api/telehealth/sessions${query ? `?${query}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch telehealth sessions');
  return res.json();
}

export async function updateSessionStatus(
  tenantId: string,
  accessToken: string,
  sessionId: number,
  status: string
): Promise<TelehealthSession> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update session status');
  return res.json();
}

// Waiting Room
export async function joinWaitingRoom(
  tenantId: string,
  accessToken: string,
  data: { sessionId: number; patientId: number }
): Promise<WaitingRoomEntry> {
  const res = await fetch(`${API_BASE}/api/telehealth/waiting-room/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to join waiting room');
  return res.json();
}

export async function updateEquipmentCheck(
  tenantId: string,
  accessToken: string,
  waitingRoomId: number,
  data: {
    camera: boolean;
    microphone: boolean;
    speaker: boolean;
    bandwidth: boolean;
    browser: boolean;
  }
): Promise<WaitingRoomEntry> {
  const res = await fetch(`${API_BASE}/api/telehealth/waiting-room/${waitingRoomId}/equipment-check`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update equipment check');
  return res.json();
}

export async function sendWaitingRoomChat(
  tenantId: string,
  accessToken: string,
  waitingRoomId: number,
  data: { message: string; sender: string }
): Promise<WaitingRoomEntry> {
  const res = await fetch(`${API_BASE}/api/telehealth/waiting-room/${waitingRoomId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to send chat message');
  return res.json();
}

export async function fetchWaitingRoom(
  tenantId: string,
  accessToken: string
): Promise<WaitingRoomEntry[]> {
  const res = await fetch(`${API_BASE}/api/telehealth/waiting-room`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch waiting room');
  return res.json();
}

export async function callPatientFromWaitingRoom(
  tenantId: string,
  accessToken: string,
  waitingRoomId: number
): Promise<WaitingRoomEntry> {
  const res = await fetch(`${API_BASE}/api/telehealth/waiting-room/${waitingRoomId}/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to call patient');
  return res.json();
}

// Session Notes
export async function saveSessionNotes(
  tenantId: string,
  accessToken: string,
  sessionId: number,
  data: {
    chiefComplaint?: string;
    hpi?: string;
    examinationFindings?: string;
    assessment?: string;
    plan?: string;
    suggestedCptCodes?: string[];
    suggestedIcd10Codes?: string[];
    complexityLevel?: string;
  }
): Promise<SessionNotes> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save session notes');
  return res.json();
}

export async function fetchSessionNotes(
  tenantId: string,
  accessToken: string,
  sessionId: number
): Promise<SessionNotes> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/notes`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch session notes');
  return res.json();
}

export async function finalizeSessionNotes(
  tenantId: string,
  accessToken: string,
  sessionId: number
): Promise<SessionNotes> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/notes/finalize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to finalize session notes');
  return res.json();
}

// Quality Metrics
export async function reportQualityMetrics(
  tenantId: string,
  accessToken: string,
  sessionId: number,
  data: {
    participantType: 'patient' | 'provider';
    bitrateKbps?: number;
    packetLossPercent?: number;
    jitterMs?: number;
    latencyMs?: number;
    videoResolution?: string;
    videoFps?: number;
    audioQuality?: string;
    connectionType?: string;
    bandwidthUpMbps?: number;
    bandwidthDownMbps?: number;
    freezesCount?: number;
    audioDropsCount?: number;
  }
): Promise<QualityMetric> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/metrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to report quality metrics');
  return res.json();
}

export async function fetchSessionMetrics(
  tenantId: string,
  accessToken: string,
  sessionId: number
): Promise<QualityMetric[]> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/metrics`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch session metrics');
  return res.json();
}

// Recordings
export async function startSessionRecording(
  tenantId: string,
  accessToken: string,
  sessionId: number
): Promise<SessionRecording> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/recordings/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to start recording');
  }
  return res.json();
}

export async function stopSessionRecording(
  tenantId: string,
  accessToken: string,
  recordingId: number,
  data: {
    durationSeconds: number;
    fileSizeBytes: number;
    resolution: string;
  }
): Promise<SessionRecording> {
  const res = await fetch(`${API_BASE}/api/telehealth/recordings/${recordingId}/stop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to stop recording');
  return res.json();
}

export async function fetchSessionRecordings(
  tenantId: string,
  accessToken: string,
  sessionId: number
): Promise<SessionRecording[]> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/recordings`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch session recordings');
  return res.json();
}

// Session Photos
export async function captureSessionPhoto(
  tenantId: string,
  accessToken: string,
  sessionId: number,
  data: {
    filePath: string;
    bodySite?: string;
    viewType?: string;
    annotationData?: any;
  }
): Promise<SessionPhoto> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/photos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to capture photo');
  return res.json();
}

export async function fetchSessionPhotos(
  tenantId: string,
  accessToken: string,
  sessionId: number
): Promise<SessionPhoto[]> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/photos`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch session photos');
  return res.json();
}

// Provider Licensing
export async function addProviderLicense(
  tenantId: string,
  accessToken: string,
  data: {
    providerId: number;
    stateCode: string;
    licenseNumber: string;
    licenseType?: string;
    issueDate?: string;
    expirationDate?: string;
  }
): Promise<ProviderLicense> {
  const res = await fetch(`${API_BASE}/api/telehealth/provider-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add provider license');
  return res.json();
}

export async function fetchProviderLicenses(
  tenantId: string,
  accessToken: string,
  providerId: number
): Promise<ProviderLicense[]> {
  const res = await fetch(`${API_BASE}/api/telehealth/providers/${providerId}/licenses`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch provider licenses');
  return res.json();
}

// Educational Content
export async function fetchEducationalContent(
  tenantId: string,
  accessToken: string,
  category?: string
): Promise<EducationalContent[]> {
  const queryParams = new URLSearchParams();
  if (category) queryParams.append('category', category);
  const query = queryParams.toString();

  const res = await fetch(`${API_BASE}/api/telehealth/educational-content${query ? `?${query}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch educational content');
  return res.json();
}

export async function trackContentView(
  tenantId: string,
  accessToken: string,
  contentId: number
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/telehealth/educational-content/${contentId}/view`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to track content view');
  return res.json();
}

// Session Events
export async function fetchSessionEvents(
  tenantId: string,
  accessToken: string,
  sessionId: number
): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/events`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch session events');
  return res.json();
}

export async function logSessionEvent(
  tenantId: string,
  accessToken: string,
  sessionId: number,
  data: {
    eventType: string;
    eventData?: any;
  }
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/telehealth/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to log session event');
  return res.json();
}

// ============================================================================
// AMBIENT AI MEDICAL SCRIBE API
// ============================================================================

export interface AmbientRecording {
  id: string;
  encounterId?: string;
  patientId: string;
  providerId: string;
  status: 'recording' | 'completed' | 'failed' | 'stopped';
  durationSeconds: number;
  consentObtained: boolean;
  consentMethod?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  patientName?: string;
  providerName?: string;
}

export interface AmbientTranscript {
  id: string;
  recordingId: string;
  encounterId?: string;
  transcriptText: string;
  transcriptSegments: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  language: string;
  speakers: any;
  speakerCount: number;
  confidenceScore: number;
  wordCount: number;
  phiMasked: boolean;
  transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

export interface AmbientGeneratedNote {
  id: string;
  transcriptId: string;
  encounterId?: string;
  chiefComplaint: string;
  hpi: string;
  ros: string;
  physicalExam: string;
  assessment: string;
  plan: string;
  suggestedIcd10Codes: Array<{ code: string; description: string; confidence: number }>;
  suggestedCptCodes: Array<{ code: string; description: string; confidence: number }>;
  mentionedMedications: Array<{ name: string; dosage: string; frequency: string; confidence: number }>;
  mentionedAllergies: Array<{ allergen: string; reaction: string; confidence: number }>;
  followUpTasks: Array<{ task: string; priority: string; dueDate?: string; confidence: number }>;
  overallConfidence: number;
  sectionConfidence: any;
  reviewStatus: 'pending' | 'in_review' | 'approved' | 'rejected' | 'regenerating';
  generationStatus: 'pending' | 'processing' | 'completed' | 'failed';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AmbientNoteEdit {
  id: string;
  generatedNoteId: string;
  editedBy: string;
  editorName?: string;
  section: string;
  previousValue: string;
  newValue: string;
  changeType: 'create' | 'update' | 'delete' | 'approve' | 'reject';
  editReason?: string;
  isSignificant: boolean;
  createdAt: string;
}

/**
 * Start a new recording session
 */
export async function startAmbientRecording(
  tenantId: string,
  accessToken: string,
  data: {
    encounterId?: string;
    patientId: string;
    providerId: string;
    consentObtained: boolean;
    consentMethod?: 'verbal' | 'written' | 'electronic';
  }
): Promise<{ recordingId: string; status: string; startedAt: string }> {
  const res = await fetch(`${API_BASE}/api/ambient/recordings/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to start recording');
  }
  return res.json();
}

/**
 * Upload audio file for a recording
 */
export async function uploadAmbientRecording(
  tenantId: string,
  accessToken: string,
  recordingId: string,
  audioFile: File,
  durationSeconds: number
): Promise<any> {
  const formData = new FormData();
  formData.append('audio', audioFile);
  formData.append('durationSeconds', durationSeconds.toString());

  const res = await fetch(`${API_BASE}/api/ambient/recordings/${recordingId}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload recording');
  }
  return res.json();
}

/**
 * List recordings
 */
export async function fetchAmbientRecordings(
  tenantId: string,
  accessToken: string,
  filters?: {
    encounterId?: string;
    patientId?: string;
    status?: string;
    limit?: number;
  }
): Promise<{ recordings: AmbientRecording[] }> {
  const params = new URLSearchParams();
  if (filters?.encounterId) params.append('encounterId', filters.encounterId);
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.limit) params.append('limit', filters.limit.toString());

  const url = `${API_BASE}/api/ambient/recordings${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch recordings');
  return res.json();
}

/**
 * Get recording details
 */
export async function fetchAmbientRecording(
  tenantId: string,
  accessToken: string,
  recordingId: string
): Promise<{ recording: AmbientRecording }> {
  const res = await fetch(`${API_BASE}/api/ambient/recordings/${recordingId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch recording');
  return res.json();
}

/**
 * Manually trigger transcription
 */
export async function transcribeAmbientRecording(
  tenantId: string,
  accessToken: string,
  recordingId: string
): Promise<{ transcriptId: string; status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/ambient/recordings/${recordingId}/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to start transcription');
  }
  return res.json();
}

/**
 * Get transcript details
 */
export async function fetchAmbientTranscript(
  tenantId: string,
  accessToken: string,
  transcriptId: string
): Promise<{ transcript: AmbientTranscript }> {
  const res = await fetch(`${API_BASE}/api/ambient/transcripts/${transcriptId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch transcript');
  return res.json();
}

/**
 * Get transcript for a recording
 */
export async function fetchRecordingTranscript(
  tenantId: string,
  accessToken: string,
  recordingId: string
): Promise<{ transcript: AmbientTranscript }> {
  const res = await fetch(`${API_BASE}/api/ambient/recordings/${recordingId}/transcript`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch transcript');
  return res.json();
}

/**
 * Generate clinical note from transcript
 */
export async function generateAmbientNote(
  tenantId: string,
  accessToken: string,
  transcriptId: string
): Promise<{ noteId: string; status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/ambient/transcripts/${transcriptId}/generate-note`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to generate note');
  }
  return res.json();
}

/**
 * Get generated note details
 */
export async function fetchAmbientNote(
  tenantId: string,
  accessToken: string,
  noteId: string
): Promise<{ note: AmbientGeneratedNote }> {
  const res = await fetch(`${API_BASE}/api/ambient/notes/${noteId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch note');
  return res.json();
}

/**
 * Get all notes for an encounter
 */
export async function fetchEncounterAmbientNotes(
  tenantId: string,
  accessToken: string,
  encounterId: string
): Promise<{ notes: AmbientGeneratedNote[] }> {
  const res = await fetch(`${API_BASE}/api/ambient/encounters/${encounterId}/notes`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch encounter notes');
  return res.json();
}

/**
 * Update a generated note
 */
export async function updateAmbientNote(
  tenantId: string,
  accessToken: string,
  noteId: string,
  updates: {
    chiefComplaint?: string;
    hpi?: string;
    ros?: string;
    physicalExam?: string;
    assessment?: string;
    plan?: string;
    editReason?: string;
  }
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/ambient/notes/${noteId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update note');
  }
  return res.json();
}

/**
 * Submit review decision
 */
export async function reviewAmbientNote(
  tenantId: string,
  accessToken: string,
  noteId: string,
  action: 'approve' | 'reject' | 'request_regeneration',
  reason?: string
): Promise<{ success: boolean; status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/ambient/notes/${noteId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ action, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to review note');
  }
  return res.json();
}

/**
 * Apply approved note to encounter
 */
export async function applyAmbientNoteToEncounter(
  tenantId: string,
  accessToken: string,
  noteId: string
): Promise<{ success: boolean; encounterId: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/ambient/notes/${noteId}/apply-to-encounter`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to apply note to encounter');
  }
  return res.json();
}

/**
 * Get edit history for a note
 */
export async function fetchAmbientNoteEdits(
  tenantId: string,
  accessToken: string,
  noteId: string
): Promise<{ edits: AmbientNoteEdit[] }> {
  const res = await fetch(`${API_BASE}/api/ambient/notes/${noteId}/edits`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch edit history');
  return res.json();
}

/**
 * Delete a recording
 */
export async function deleteAmbientRecording(
  tenantId: string,
  accessToken: string,
  recordingId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/ambient/recordings/${recordingId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete recording');
  }
  return res.json();
}

// =====================================================
// AI Agent Configuration APIs
// =====================================================

export interface AIAgentConfiguration {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  appointmentTypeId?: string;
  specialtyFocus?: 'medical_derm' | 'cosmetic' | 'mohs' | 'pediatric_derm' | 'general';
  aiModel: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  promptTemplate: string;
  noteSections: string[];
  sectionPrompts?: Record<string, string>;
  outputFormat: 'soap' | 'narrative' | 'procedure_note';
  verbosityLevel: 'concise' | 'standard' | 'detailed';
  includeCodes: boolean;
  terminologySet?: Record<string, string[]>;
  focusAreas?: string[];
  defaultCptCodes?: Array<{ code: string; description: string }>;
  defaultIcd10Codes?: Array<{ code: string; description: string }>;
  defaultFollowUpInterval?: string;
  taskTemplates?: Array<{ task: string; priority: 'high' | 'medium' | 'low'; daysFromVisit: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAIAgentConfigInput {
  name: string;
  description?: string;
  isDefault?: boolean;
  appointmentTypeId?: string;
  specialtyFocus?: 'medical_derm' | 'cosmetic' | 'mohs' | 'pediatric_derm' | 'general';
  aiModel?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
  promptTemplate: string;
  noteSections: string[];
  sectionPrompts?: Record<string, string>;
  outputFormat?: 'soap' | 'narrative' | 'procedure_note';
  verbosityLevel?: 'concise' | 'standard' | 'detailed';
  includeCodes?: boolean;
  terminologySet?: Record<string, string[]>;
  focusAreas?: string[];
  defaultCptCodes?: Array<{ code: string; description: string }>;
  defaultIcd10Codes?: Array<{ code: string; description: string }>;
  defaultFollowUpInterval?: string;
  taskTemplates?: Array<{ task: string; priority: 'high' | 'medium' | 'low'; daysFromVisit: number }>;
}

export interface AIAgentConfigVersion {
  id: string;
  configId: string;
  versionNumber: number;
  configSnapshot: AIAgentConfiguration;
  changedBy?: string;
  changeReason?: string;
  createdAt: string;
}

export interface AIAgentAnalytics {
  configId: string;
  configName: string;
  notesGenerated: number;
  notesApproved: number;
  notesRejected: number;
  avgConfidenceScore: number;
  avgEditCount: number;
  avgGenerationTimeMs: number;
  avgReviewTimeSeconds: number;
}

/**
 * Fetch all AI agent configurations
 */
export async function fetchAIAgentConfigs(
  tenantId: string,
  accessToken: string,
  filters?: {
    activeOnly?: boolean;
    specialtyFocus?: string;
    appointmentTypeId?: string;
  }
): Promise<{ configurations: AIAgentConfiguration[] }> {
  const params = new URLSearchParams();
  if (filters?.activeOnly !== undefined) params.append('activeOnly', String(filters.activeOnly));
  if (filters?.specialtyFocus) params.append('specialtyFocus', filters.specialtyFocus);
  if (filters?.appointmentTypeId) params.append('appointmentTypeId', filters.appointmentTypeId);

  const url = `${API_BASE}/api/ai-agent-configs${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch AI agent configurations');
  return res.json();
}

/**
 * Fetch a single AI agent configuration
 */
export async function fetchAIAgentConfig(
  tenantId: string,
  accessToken: string,
  configId: string
): Promise<{ configuration: AIAgentConfiguration }> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs/${configId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Configuration not found');
    throw new Error('Failed to fetch AI agent configuration');
  }
  return res.json();
}

/**
 * Fetch the default AI agent configuration
 */
export async function fetchDefaultAIAgentConfig(
  tenantId: string,
  accessToken: string
): Promise<{ configuration: AIAgentConfiguration }> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs/default`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('No default configuration found');
    throw new Error('Failed to fetch default configuration');
  }
  return res.json();
}

/**
 * Fetch configuration for a specific appointment type
 */
export async function fetchAIAgentConfigForAppointmentType(
  tenantId: string,
  accessToken: string,
  appointmentTypeId: string
): Promise<{ configuration: AIAgentConfiguration }> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs/for-appointment/${appointmentTypeId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('No configuration found for this appointment type');
    throw new Error('Failed to fetch configuration for appointment type');
  }
  return res.json();
}

/**
 * Create a new AI agent configuration
 */
export async function createAIAgentConfig(
  tenantId: string,
  accessToken: string,
  data: CreateAIAgentConfigInput
): Promise<{ configuration: AIAgentConfiguration }> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 409) throw new Error('A configuration with this name already exists');
    throw new Error(err.error || 'Failed to create AI agent configuration');
  }
  return res.json();
}

/**
 * Update an AI agent configuration
 */
export async function updateAIAgentConfig(
  tenantId: string,
  accessToken: string,
  configId: string,
  data: Partial<CreateAIAgentConfigInput> & { isActive?: boolean }
): Promise<{ configuration: AIAgentConfiguration }> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs/${configId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error('Configuration not found');
    throw new Error(err.error || 'Failed to update AI agent configuration');
  }
  return res.json();
}

/**
 * Delete an AI agent configuration
 */
export async function deleteAIAgentConfig(
  tenantId: string,
  accessToken: string,
  configId: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs/${configId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error('Configuration not found');
    throw new Error(err.error || 'Failed to delete AI agent configuration');
  }
  return res.json();
}

/**
 * Clone an AI agent configuration
 */
export async function cloneAIAgentConfig(
  tenantId: string,
  accessToken: string,
  configId: string,
  newName: string
): Promise<{ configuration: AIAgentConfiguration }> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs/${configId}/clone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 409) throw new Error('A configuration with this name already exists');
    throw new Error(err.error || 'Failed to clone AI agent configuration');
  }
  return res.json();
}

/**
 * Get version history for an AI agent configuration
 */
export async function fetchAIAgentConfigVersions(
  tenantId: string,
  accessToken: string,
  configId: string
): Promise<{ versions: AIAgentConfigVersion[] }> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs/${configId}/versions`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch configuration version history');
  return res.json();
}

/**
 * Get analytics for AI agent configurations
 */
export async function fetchAIAgentConfigAnalytics(
  tenantId: string,
  accessToken: string,
  filters?: {
    configId?: string;
    providerId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ analytics: AIAgentAnalytics[] }> {
  const params = new URLSearchParams();
  if (filters?.configId) params.append('configId', filters.configId);
  if (filters?.providerId) params.append('providerId', filters.providerId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const url = `${API_BASE}/api/ai-agent-configs/analytics/summary${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch AI agent analytics');
  return res.json();
}

/**
 * Test an AI agent configuration with sample transcript
 */
export async function testAIAgentConfig(
  tenantId: string,
  accessToken: string,
  configId: string,
  sampleTranscript: string
): Promise<{
  configName: string;
  noteSections: string[];
  previewPrompt: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/api/ai-agent-configs/${configId}/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify({ sampleTranscript }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to test AI agent configuration');
  }
  return res.json();
}

// ==================== INVENTORY API ====================

export interface InventoryItem {
  id: string;
  name: string;
  category: 'medication' | 'supply' | 'cosmetic' | 'equipment';
  sku?: string;
  description?: string;
  quantity: number;
  reorderLevel: number;
  unitCostCents: number;
  supplier?: string;
  location?: string;
  expirationDate?: string;
  lotNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryUsage {
  id: string;
  itemId: string;
  itemName?: string;
  itemCategory?: string;
  encounterId?: string;
  appointmentId?: string;
  patientId: string;
  patientFirstName?: string;
  patientLastName?: string;
  providerId: string;
  providerName?: string;
  quantityUsed: number;
  unitCostCents: number;
  notes?: string;
  usedAt: string;
}

export interface InventoryAdjustment {
  id: string;
  adjustmentQuantity: number;
  reason: 'received' | 'expired' | 'damaged' | 'adjustment' | 'correction';
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export async function fetchInventoryItems(
  tenantId: string,
  accessToken: string,
  filters?: { category?: string; lowStock?: boolean }
): Promise<{ items: InventoryItem[] }> {
  const params = new URLSearchParams();
  if (filters?.category) params.append('category', filters.category);
  if (filters?.lowStock) params.append('lowStock', 'true');

  const url = `${API_BASE}/api/inventory${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch inventory items');
  return res.json();
}

export async function fetchInventoryItem(
  tenantId: string,
  accessToken: string,
  itemId: string
): Promise<{ item: InventoryItem }> {
  const res = await fetch(`${API_BASE}/api/inventory/${itemId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Item not found');
    throw new Error('Failed to fetch inventory item');
  }
  return res.json();
}

export async function createInventoryItem(
  tenantId: string,
  accessToken: string,
  data: Partial<InventoryItem>
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/api/inventory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create inventory item');
  }
  return res.json();
}

export async function updateInventoryItem(
  tenantId: string,
  accessToken: string,
  itemId: string,
  data: Partial<InventoryItem>
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/inventory/${itemId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update inventory item');
  }
  return res.json();
}

export async function deleteInventoryItem(
  tenantId: string,
  accessToken: string,
  itemId: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/inventory/${itemId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete inventory item');
  }
  return res.json();
}

export async function adjustInventory(
  tenantId: string,
  accessToken: string,
  data: {
    itemId: string;
    adjustmentQuantity: number;
    reason: 'received' | 'expired' | 'damaged' | 'adjustment' | 'correction';
    notes?: string;
  }
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/api/inventory/adjust`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to adjust inventory');
  }
  return res.json();
}

export async function fetchInventoryAdjustments(
  tenantId: string,
  accessToken: string,
  itemId: string
): Promise<{ adjustments: InventoryAdjustment[] }> {
  const res = await fetch(`${API_BASE}/api/inventory/${itemId}/adjustments`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch adjustments');
  return res.json();
}

export async function fetchInventoryUsage(
  tenantId: string,
  accessToken: string,
  itemId: string
): Promise<{ usage: InventoryUsage[] }> {
  const res = await fetch(`${API_BASE}/api/inventory/${itemId}/usage`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch usage history');
  return res.json();
}

export async function fetchInventoryStats(
  tenantId: string,
  accessToken: string
): Promise<{
  totalItems: number;
  totalValueCents: number;
  lowStockCount: number;
  expiringCount: number;
}> {
  const res = await fetch(`${API_BASE}/api/inventory/stats/summary`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch inventory stats');
  return res.json();
}

// ==================== INVENTORY USAGE API ====================

export async function recordInventoryUsage(
  tenantId: string,
  accessToken: string,
  data: {
    itemId: string;
    encounterId?: string;
    appointmentId?: string;
    patientId: string;
    providerId: string;
    quantityUsed: number;
    notes?: string;
  }
): Promise<{ id: string; usedAt: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/inventory/usage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to record inventory usage');
  }
  return res.json();
}

export async function fetchAllInventoryUsage(
  tenantId: string,
  accessToken: string,
  filters?: {
    patientId?: string;
    encounterId?: string;
    appointmentId?: string;
    limit?: number;
  }
): Promise<{ usage: InventoryUsage[] }> {
  const params = new URLSearchParams();
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.encounterId) params.append('encounterId', filters.encounterId);
  if (filters?.appointmentId) params.append('appointmentId', filters.appointmentId);
  if (filters?.limit) params.append('limit', filters.limit.toString());

  const url = `${API_BASE}/api/inventory/usage${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch inventory usage');
  return res.json();
}

export async function deleteInventoryUsage(
  tenantId: string,
  accessToken: string,
  usageId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/inventory/usage/${usageId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete inventory usage');
  }
  return res.json();
}

// Registry APIs
export async function fetchRegistryCohorts(tenantId: string, accessToken: string, status?: string) {
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${API_BASE}/api/registry/cohorts${params}`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error('Failed to load registry cohorts');
  return res.json();
}

export async function createRegistryCohort(tenantId: string, accessToken: string, data: any) {
  const res = await fetch(`${API_BASE}/api/registry/cohorts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create registry cohort');
  }
  return res.json();
}

export async function updateRegistryCohort(tenantId: string, accessToken: string, cohortId: string, data: any) {
  const res = await fetch(`${API_BASE}/api/registry/cohorts/${cohortId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update registry cohort');
  }
  return res.json();
}

export async function deleteRegistryCohort(tenantId: string, accessToken: string, cohortId: string) {
  const res = await fetch(`${API_BASE}/api/registry/cohorts/${cohortId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete registry cohort');
  }
  return res.json();
}

export async function fetchRegistryMembers(tenantId: string, accessToken: string, cohortId: string) {
  const res = await fetch(`${API_BASE}/api/registry/cohorts/${cohortId}/members`, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error('Failed to load registry members');
  return res.json();
}

export async function addRegistryMember(tenantId: string, accessToken: string, cohortId: string, data: any) {
  const res = await fetch(`${API_BASE}/api/registry/cohorts/${cohortId}/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add registry member');
  }
  return res.json();
}

export async function removeRegistryMember(
  tenantId: string,
  accessToken: string,
  cohortId: string,
  memberId: string
) {
  const res = await fetch(`${API_BASE}/api/registry/cohorts/${cohortId}/members/${memberId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to remove registry member');
  }
  return res.json();
}

// Referral APIs
export async function fetchReferrals(
  tenantId: string,
  accessToken: string,
  filters?: { status?: string; direction?: string; patientId?: string; priority?: string }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.direction) params.append('direction', filters.direction);
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.priority) params.append('priority', filters.priority);

  const url = `${API_BASE}/api/referrals${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, [TENANT_HEADER]: tenantId },
  });
  if (!res.ok) throw new Error('Failed to load referrals');
  return res.json();
}

export async function createReferral(tenantId: string, accessToken: string, data: any) {
  const res = await fetch(`${API_BASE}/api/referrals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create referral');
  }
  return res.json();
}

export async function updateReferral(tenantId: string, accessToken: string, referralId: string, data: any) {
  const res = await fetch(`${API_BASE}/api/referrals/${referralId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update referral');
  }
  return res.json();
}
