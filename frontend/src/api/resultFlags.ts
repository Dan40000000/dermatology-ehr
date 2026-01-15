import type { ResultFlagType } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const TENANT_HEADER = 'x-tenant-id';

export interface UpdateResultFlagRequest {
  resultFlag: ResultFlagType;
  changeReason?: string;
}

export interface UpdateResultFlagResponse {
  id: string;
  resultFlag: ResultFlagType;
  resultFlagUpdatedAt: string;
}

export interface ResultFlagAuditEntry {
  id: string;
  tenantId: string;
  orderId?: string;
  labOrderId?: string;
  dermPathReportId?: string;
  oldFlag: ResultFlagType;
  newFlag: ResultFlagType;
  changedBy: string;
  changedByName?: string;
  changeReason?: string;
  createdAt: string;
}

export interface ResultFlagStats {
  orders: Array<{ result_flag: ResultFlagType; count: number }>;
  labOrders: Array<{ result_flag: ResultFlagType; count: number }>;
}

/**
 * Update result flag for a general order (imaging/radiology)
 */
export async function updateOrderResultFlag(
  tenantId: string,
  accessToken: string,
  orderId: string,
  data: UpdateResultFlagRequest
): Promise<UpdateResultFlagResponse> {
  const response = await fetch(`${API_BASE}/api/result-flags/orders/${orderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update result flag');
  }

  return response.json();
}

/**
 * Update result flag for a lab order
 */
export async function updateLabOrderResultFlag(
  tenantId: string,
  accessToken: string,
  labOrderId: string,
  data: UpdateResultFlagRequest
): Promise<UpdateResultFlagResponse> {
  const response = await fetch(`${API_BASE}/api/result-flags/lab-orders/${labOrderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update result flag');
  }

  return response.json();
}

/**
 * Get audit trail for result flag changes
 */
export async function getResultFlagAudit(
  tenantId: string,
  accessToken: string,
  params?: {
    order_id?: string;
    lab_order_id?: string;
    limit?: number;
  }
): Promise<ResultFlagAuditEntry[]> {
  const queryParams = new URLSearchParams();
  if (params?.order_id) queryParams.append('order_id', params.order_id);
  if (params?.lab_order_id) queryParams.append('lab_order_id', params.lab_order_id);
  if (params?.limit) queryParams.append('limit', params.limit.toString());

  const url = `${API_BASE}/api/result-flags/audit${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch audit trail');
  }

  return response.json();
}

/**
 * Get statistics about result flags
 */
export async function getResultFlagStats(
  tenantId: string,
  accessToken: string
): Promise<ResultFlagStats> {
  const response = await fetch(`${API_BASE}/api/result-flags/stats`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch statistics');
  }

  return response.json();
}
