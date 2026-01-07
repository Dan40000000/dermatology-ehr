// Direct Secure Messaging API Functions
// HIPAA-compliant provider-to-provider communication

import { API_BASE_URL, TENANT_HEADER_NAME } from './api';

const API_BASE = API_BASE_URL;
const TENANT_HEADER = TENANT_HEADER_NAME;

export interface DirectMessage {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body?: string;
  attachments?: Array<{
    filename: string;
    url: string;
    size?: number;
    mimeType?: string;
  }>;
  status: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  transmissionId?: string;
  errorMessage?: string;
  sentBy?: string;
  sentByEmail?: string;
  sentByName?: string;
  replyToMessageId?: string;
  createdAt: string;
}

export interface DirectContact {
  id: string;
  providerName: string;
  specialty?: string;
  organization?: string;
  directAddress: string;
  phone?: string;
  fax?: string;
  address?: string;
  notes?: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchDirectMessages(
  tenantId: string,
  accessToken: string,
  folder?: string
): Promise<{ messages: DirectMessage[] }> {
  const params = new URLSearchParams();
  if (folder) params.append('folder', folder);
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/direct/messages${query ? `?${query}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch Direct messages');
  return res.json();
}

export async function sendDirectMessage(
  tenantId: string,
  accessToken: string,
  data: {
    toAddress: string;
    subject: string;
    body?: string;
    attachments?: Array<{
      filename: string;
      url: string;
      size?: number;
      mimeType?: string;
    }>;
  }
): Promise<{ id: string; status: string; transmissionId?: string; message: string; errorMessage?: string }> {
  const res = await fetch(`${API_BASE}/api/direct/send`, {
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
    throw new Error(err.error || 'Failed to send Direct message');
  }
  return res.json();
}

export async function fetchDirectContacts(
  tenantId: string,
  accessToken: string,
  filters?: {
    search?: string;
    specialty?: string;
    favoritesOnly?: boolean;
  }
): Promise<{ contacts: DirectContact[] }> {
  const params = new URLSearchParams();
  if (filters?.search) params.append('search', filters.search);
  if (filters?.specialty) params.append('specialty', filters.specialty);
  if (filters?.favoritesOnly) params.append('favoritesOnly', 'true');
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/direct/contacts${query ? `?${query}` : ''}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch Direct contacts');
  return res.json();
}

export async function createDirectContact(
  tenantId: string,
  accessToken: string,
  data: {
    providerName: string;
    specialty?: string;
    organization?: string;
    directAddress: string;
    phone?: string;
    fax?: string;
    address?: string;
    notes?: string;
    isFavorite?: boolean;
  }
): Promise<{ contact: DirectContact }> {
  const res = await fetch(`${API_BASE}/api/direct/contacts`, {
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
    throw new Error(err.error || 'Failed to create Direct contact');
  }
  return res.json();
}

export async function markDirectMessageRead(
  tenantId: string,
  accessToken: string,
  messageId: string,
  read: boolean = true
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/direct/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ read }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update message');
  }
  return res.json();
}

export async function fetchDirectMessageAttachments(
  tenantId: string,
  accessToken: string,
  messageId: string
): Promise<{ attachments: Array<{ filename: string; url: string; size?: number; mimeType?: string }> }> {
  const res = await fetch(`${API_BASE}/api/direct/messages/${messageId}/attachments`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch message attachments');
  return res.json();
}

export async function fetchDirectStats(
  tenantId: string,
  accessToken: string
): Promise<{
  inboxTotal: number;
  unreadTotal: number;
  sentTotal: number;
  deliveredTotal: number;
  failedTotal: number;
}> {
  const res = await fetch(`${API_BASE}/api/direct/stats`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch Direct messaging stats');
  return res.json();
}
