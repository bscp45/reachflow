// ─────────────────────────────────────────────────────────────────────────────
// api.ts — All API calls to the FastAPI backend
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Lead,
  Client,
  CampaignStats,
  User,
  AuthToken,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Helper — get auth headers ─────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('rf-token')
    : null;

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Helper — handle API errors ────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    // Token expired or invalid — force logout
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rf-token');
      localStorage.removeItem('rf-user');
      window.location.href = '/login';
    }
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `Error ${res.status}`);
  }

  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function loginStep1(
  email: string,
  password: string
): Promise<{ message: string; requires_otp: boolean; email: string }> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

export async function verifyOtp(
  email: string,
  otp: string
): Promise<AuthToken> {
  const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });

  const data = await handleResponse<{
    access_token: string;
    token_type: string;
    user_id: number;
    name: string;
    role: string;
    client_id: number | null;
  }>(res);

  return {
    accessToken: data.access_token,
    tokenType:   data.token_type,
    userId:      data.user_id,
    name:        data.name,
    role:        data.role as AuthToken['role'],
    clientId:    data.client_id,
  };
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<{
    id: number;
    name: string;
    email: string;
    role: string;
    client_id: number | null;
    is_active: boolean;
  }>(res);

  return {
    id:       data.id,
    name:     data.name,
    email:    data.email,
    role:     data.role as User['role'],
    clientId: data.client_id,
    isActive: data.is_active,
  };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      current_password: currentPassword,
      new_password:     newPassword,
    }),
  });
  return handleResponse(res);
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export async function getLeads(params?: {
  skip?: number;
  limit?: number;
  status?: string;
  clientId?: number;
}): Promise<Lead[]> {
  const query = new URLSearchParams();
  if (params?.skip)     query.set('skip', String(params.skip));
  if (params?.limit)    query.set('limit', String(params.limit));
  if (params?.status)   query.set('status', params.status);
  if (params?.clientId) query.set('client_id', String(params.clientId));

  const res = await fetch(`${API_URL}/api/leads/?${query}`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Array<{
    id: number;
    name: string;
    phone: string;
    status: string;
    attempts: number;
    score: number;
    sentiment: number | null;
    language: string;
    last_called: string | null;
    next_retry: string | null;
    client_id: number;
    created_at: string;
  }>>(res);

  return data.map(l => ({
    id:         l.id,
    name:       l.name,
    phone:      l.phone,
    status:     l.status as Lead['status'],
    attempts:   l.attempts,
    score:      l.score,
    sentiment:  l.sentiment ?? undefined,
    language:   l.language as Lead['language'],
    lastCalled: l.last_called ? new Date(l.last_called) : null,
    nextRetry:  l.next_retry  ? new Date(l.next_retry)  : null,
    clientId:   l.client_id,
    createdAt:  new Date(l.created_at),
  }));
}

export async function getLead(leadId: number): Promise<Lead> {
  const res = await fetch(`${API_URL}/api/leads/${leadId}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function createLead(lead: {
  name: string;
  phone: string;
  language: string;
  clientId: number;
}): Promise<Lead> {
  const res = await fetch(`${API_URL}/api/leads/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name:      lead.name,
      phone:     lead.phone,
      language:  lead.language,
      client_id: lead.clientId,
    }),
  });
  return handleResponse(res);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getCampaignStats(clientId?: number): Promise<CampaignStats> {
  const query = clientId ? `?client_id=${clientId}` : '';
  const res = await fetch(`${API_URL}/api/leads/stats/campaign${query}`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<{
    total: number;
    called: number;
    agreed: number;
    declined: number;
    no_answer: number;
    pending: number;
    calling: number;
  }>(res);

  return {
    total:     data.total,
    called:    data.called,
    agreed:    data.agreed,
    declined:  data.declined,
    noAnswer:  data.no_answer,
    pending:   data.pending,
    calling:   data.calling,
  };
}

// ── Clients ───────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  const res = await fetch(`${API_URL}/api/clients/`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Array<{
    id: number;
    name: string;
    email: string;
    is_active: boolean;
    created_at: string;
  }>>(res);

  return data.map(c => ({
    id:        c.id,
    name:      c.name,
    email:     c.email,
    isActive:  c.is_active,
    createdAt: new Date(c.created_at),
  }));
}

export async function createClient(client: {
  name: string;
  email: string;
}): Promise<Client> {
  const res = await fetch(`${API_URL}/api/clients/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(client),
  });
  return handleResponse(res);
}

export async function deleteClient(clientId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}