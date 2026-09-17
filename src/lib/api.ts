// ─────────────────────────────────────────────────────────────────────────────
// api.ts — All API calls to the FastAPI backend
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Lead,
  Client,
  CallLog,
  CampaignStats,
  PipelineBoard,
  PipelineStage,
  User,
  AuthToken,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Shared types ──────────────────────────────────────────────────────────────

export interface PaginatedLeads {
  items: Lead[];
  total: number;
  skip:  number;
  limit: number;
}

export type LeadSortField =
  | 'name'
  | 'score'
  | 'attempts'
  | 'last_called'
  | 'created_at';

export type SortDirection = 'asc' | 'desc';

export interface LeadQuery {
  skip?:     number;
  limit?:    number;
  status?:   string;
  stage?:    PipelineStage;
  clientId?: number;
  search?:   string;
  sortBy?:   LeadSortField;
  sortDir?:  SortDirection;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('rf-token')
    : null;

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Auth endpoints that issue a session (login, OTP verification) return 401 for
 * bad credentials, not an expired session — there's no session yet to expire.
 * Their 401s should fall through to the normal error path so the backend's
 * actual message (e.g. "Invalid email or password") reaches the caller.
 */
function isSessionlessAuthEndpoint(url: string): boolean {
  return url.includes('/api/auth/login') || url.includes('/api/auth/verify-otp');
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401 && !isSessionlessAuthEndpoint(res.url)) {
    // Token expired or invalid — clear it and bounce to login
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rf-token');
      localStorage.removeItem('rf-user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(body.detail || `Error ${res.status}`);
  }

  return res.json();
}

/** Shape the backend sends for a lead. */
interface RawLead {
  id: number;
  name: string;
  phone: string;
  status: string;
  pipeline_stage: string;
  attempts: number;
  score: number;
  sentiment: number | null;
  language: string;
  last_called: string | null;
  next_retry: string | null;
  client_id: number;
  assigned_to: number | null;
  created_at: string;
}

/** Backend speaks snake_case; the UI works in camelCase. */
function toLead(raw: RawLead): Lead {
  return {
    id:            raw.id,
    name:          raw.name,
    phone:         raw.phone,
    status:        raw.status as Lead['status'],
    pipelineStage: raw.pipeline_stage as PipelineStage,
    attempts:      raw.attempts,
    score:         raw.score,
    sentiment:     raw.sentiment ?? undefined,
    language:      raw.language as Lead['language'],
    lastCalled:    raw.last_called ? new Date(raw.last_called) : null,
    nextRetry:     raw.next_retry  ? new Date(raw.next_retry)  : null,
    clientId:      raw.client_id,
    assignedTo:    raw.assigned_to ?? undefined,
    createdAt:     new Date(raw.created_at),
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function loginStep1(
  email: string,
  password: string,
): Promise<{ message: string; requires_otp: boolean; email: string }> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

export async function verifyOtp(email: string, otp: string): Promise<AuthToken> {
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
  const res = await fetch(`${API_URL}/api/auth/me`, { headers: getAuthHeaders() });

  const data = await handleResponse<{
    id: number;
    name: string;
    email: string;
    role: string;
    client_id: number | null;
    is_active: boolean;
    permissions: {
      can_upload_leads: boolean;
      can_start_campaign: boolean;
      can_view_transcripts: boolean;
      can_manage_analysts: boolean;
      can_export_data: boolean;
    };
  }>(res);

  return {
    id:       data.id,
    name:     data.name,
    email:    data.email,
    role:     data.role as User['role'],
    clientId: data.client_id,
    isActive: data.is_active,
    permissions: {
      canUploadLeads:     data.permissions.can_upload_leads,
      canStartCampaign:   data.permissions.can_start_campaign,
      canViewTranscripts: data.permissions.can_view_transcripts,
      canManageAnalysts:  data.permissions.can_manage_analysts,
      canExportData:      data.permissions.can_export_data,
    },
  };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
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

export async function getLeads(params: LeadQuery = {}): Promise<PaginatedLeads> {
  const q = new URLSearchParams();

  // skip can legitimately be 0, so test for undefined rather than falsiness
  if (params.skip     !== undefined) q.set('skip',      String(params.skip));
  if (params.limit    !== undefined) q.set('limit',     String(params.limit));
  if (params.status)                 q.set('status',    params.status);
  if (params.stage)                  q.set('stage',     params.stage);
  if (params.clientId !== undefined) q.set('client_id', String(params.clientId));
  if (params.search)                 q.set('search',    params.search);
  if (params.sortBy)                 q.set('sort_by',   params.sortBy);
  if (params.sortDir)                q.set('sort_dir',  params.sortDir);

  const res = await fetch(`${API_URL}/api/leads/?${q}`, { headers: getAuthHeaders() });

  const data = await handleResponse<{
    items: RawLead[];
    total: number;
    skip:  number;
    limit: number;
  }>(res);

  return {
    items: data.items.map(toLead),
    total: data.total,
    skip:  data.skip,
    limit: data.limit,
  };
}

export async function getLead(leadId: number): Promise<Lead> {
  const res = await fetch(`${API_URL}/api/leads/${leadId}`, { headers: getAuthHeaders() });
  return toLead(await handleResponse<RawLead>(res));
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
  return toLead(await handleResponse<RawLead>(res));
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function getPipelineBoard(clientId?: number): Promise<PipelineBoard> {
  const q = clientId !== undefined ? `?client_id=${clientId}` : '';
  const res = await fetch(`${API_URL}/api/leads/pipeline/board${q}`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<{
    columns: Array<{ stage: string; count: number; leads: RawLead[] }>;
    terminal: Array<{ stage: string; count: number }>;
    total: number;
  }>(res);

  return {
    columns: data.columns.map(c => ({
      stage: c.stage as PipelineStage,
      count: c.count,
      leads: c.leads.map(toLead),
    })),
    terminal: data.terminal.map(t => ({
      stage: t.stage as PipelineStage,
      count: t.count,
    })),
    total: data.total,
  };
}

export async function updateLeadStage(
  leadId: number,
  stage: PipelineStage,
  note?: string,
): Promise<Lead> {
  const res = await fetch(`${API_URL}/api/leads/${leadId}/stage`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ stage, note: note || null }),
  });
  return toLead(await handleResponse<RawLead>(res));
}

// ── Call history ──────────────────────────────────────────────────────────────

export async function getCallsForLead(leadId: number): Promise<CallLog[]> {
  const res = await fetch(`${API_URL}/api/calls/lead/${leadId}`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<Array<{
    id: number;
    lead_id: number;
    started_at: string;
    ended_at: string | null;
    duration: number | null;
    status: string;
    transcript: string | null;
    summary: string | null;
    sentiment: number | null;
    language: string;
    vapi_call_id: string | null;
  }>>(res);

  return data.map(c => ({
    id:         c.id,
    leadId:     c.lead_id,
    startedAt:  new Date(c.started_at),
    endedAt:    c.ended_at ? new Date(c.ended_at) : undefined,
    duration:   c.duration ?? undefined,
    status:     c.status as CallLog['status'],
    transcript: c.transcript ?? undefined,
    summary:    c.summary ?? undefined,
    sentiment:  c.sentiment ?? undefined,
    language:   c.language as CallLog['language'],
    vapiCallId: c.vapi_call_id ?? undefined,
  }));
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getCampaignStats(clientId?: number): Promise<CampaignStats> {
  const q = clientId !== undefined ? `?client_id=${clientId}` : '';
  const res = await fetch(`${API_URL}/api/leads/stats/campaign${q}`, {
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
    total:    data.total,
    called:   data.called,
    agreed:   data.agreed,
    declined: data.declined,
    noAnswer: data.no_answer,
    pending:  data.pending,
    calling:  data.calling,
  };
}

// ── Clients ───────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  const res = await fetch(`${API_URL}/api/clients/`, { headers: getAuthHeaders() });

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
