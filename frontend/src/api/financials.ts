// Financial API client functions
import { API_BASE_URL } from "../utils/apiBase";

const API_BASE = API_BASE_URL;
const TENANT_HEADER = "x-tenant-id";

interface FetchOptions {
  tenantId: string;
  accessToken: string;
}

// Bills
export async function fetchBills(options: FetchOptions, filters?: {
  patientId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const res = await fetch(`${API_BASE}/api/bills?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch bills");
  return res.json();
}

// Payer Payments
export async function fetchPayerPayments(options: FetchOptions, filters?: {
  status?: string;
  payerName?: string;
  startDate?: string;
  endDate?: string;
  batchId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.payerName) params.append('payerName', filters.payerName);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.batchId) params.append('batchId', filters.batchId);

  const res = await fetch(`${API_BASE}/api/payer-payments?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch payer payments");
  return res.json();
}

// Patient Payments
export async function fetchPatientPayments(options: FetchOptions, filters?: {
  patientId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  batchId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.paymentMethod) params.append('paymentMethod', filters.paymentMethod);
  if (filters?.batchId) params.append('batchId', filters.batchId);

  const res = await fetch(`${API_BASE}/api/patient-payments?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch patient payments");
  return res.json();
}

export async function createPatientPayment(options: FetchOptions, data: {
  patientId: string;
  paymentDate: string;
  amountCents: number;
  paymentMethod: 'cash' | 'credit' | 'debit' | 'check' | 'ach' | 'other';
  cardLastFour?: string;
  checkNumber?: string;
  referenceNumber?: string;
  appliedToClaimId?: string;
  appliedToInvoiceId?: string;
  notes?: string;
}) {
  const res = await fetch(`${API_BASE}/api/patient-payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create patient payment");
  }
  return res.json();
}

// Statements
export async function fetchStatements(options: FetchOptions, filters?: {
  patientId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const res = await fetch(`${API_BASE}/api/statements?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch statements");
  return res.json();
}

export async function sendStatement(options: FetchOptions, statementId: string, via: string) {
  const res = await fetch(`${API_BASE}/api/statements/${statementId}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
    body: JSON.stringify({ via }),
  });
  if (!res.ok) throw new Error("Failed to send statement");
  return res.json();
}

// Batches
export async function fetchBatches(options: FetchOptions, filters?: {
  batchType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.batchType) params.append('batchType', filters.batchType);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const res = await fetch(`${API_BASE}/api/batches?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch batches");
  return res.json();
}

// Financial Metrics
export async function fetchFinancialMetrics(options: FetchOptions, date?: string) {
  const params = new URLSearchParams();
  if (date) params.append('date', date);

  const res = await fetch(`${API_BASE}/api/financial-metrics/dashboard?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch financial metrics");
  return res.json();
}

export async function fetchCollectionsTrend(
  options: FetchOptions,
  filters?: {
    startDate?: string;
    endDate?: string;
    granularity?: 'day' | 'week' | 'month';
  }
) {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.granularity) params.append('granularity', filters.granularity);

  const res = await fetch(`${API_BASE}/api/financial-metrics/collections-trend?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch collections trend");
  return res.json();
}

export async function fetchPaymentsSummary(
  options: FetchOptions,
  filters: {
    startDate: string;
    endDate: string;
  }
) {
  const params = new URLSearchParams();
  params.append('startDate', filters.startDate);
  params.append('endDate', filters.endDate);

  const res = await fetch(`${API_BASE}/api/financial-metrics/payments-summary?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch payments summary");
  return res.json();
}

export async function fetchARAging(
  options: FetchOptions,
  filters?: {
    asOfDate?: string;
  }
) {
  const params = new URLSearchParams();
  if (filters?.asOfDate) params.append('asOfDate', filters.asOfDate);

  const res = await fetch(`${API_BASE}/api/financial-metrics/ar-aging?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch A/R aging");
  return res.json();
}

export async function fetchBillsSummary(
  options: FetchOptions,
  filters: {
    startDate: string;
    endDate: string;
  }
) {
  const params = new URLSearchParams();
  params.append('startDate', filters.startDate);
  params.append('endDate', filters.endDate);

  const res = await fetch(`${API_BASE}/api/financial-metrics/bills-summary?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch bills summary");
  return res.json();
}

// Claims (existing)
export async function fetchClaims(options: FetchOptions, filters?: {
  status?: string;
  patientId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.patientId) params.append('patientId', filters.patientId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const res = await fetch(`${API_BASE}/api/claims?${params}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      [TENANT_HEADER]: options.tenantId,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch claims");
  return res.json();
}
