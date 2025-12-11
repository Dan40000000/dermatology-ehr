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

export const rescheduleAppointment = (tenantId: string, accessToken: string, id: string, scheduledStart: string, scheduledEnd: string) =>
  authedPost(tenantId, accessToken, `/api/appointments/${id}/reschedule`, { scheduledStart, scheduledEnd });

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

// Generic API wrapper object for use in components
export const api = {
  get: authedGet,
  post: authedPost,
  put: authedPut,
  delete: authedDelete,
  getPatients: fetchPatients,
};
