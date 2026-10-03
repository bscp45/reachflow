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

/**
 * The backend stores naive UTC datetimes and serializes them without a
 * timezone marker, so `new Date(s)` would parse them as local time. Append
 * 'Z' when the string has no zone info so it's interpreted as UTC.
 */
function parseUtc(s: string): Date {
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(s);
  return new Date(hasTimezone ? s : `${s}Z`);
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
    lastCalled:    raw.last_called ? parseUtc(raw.last_called) : null,
    nextRetry:     raw.next_retry  ? parseUtc(raw.next_retry)  : null,
    clientId:      raw.client_id,
    assignedTo:    raw.assigned_to ?? undefined,
    createdAt:     parseUtc(raw.created_at),
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
    startedAt:  parseUtc(c.started_at),
    endedAt:    c.ended_at ? parseUtc(c.ended_at) : undefined,
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
    createdAt: parseUtc(c.created_at),
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

// ─────────────────────────────────────────────────────────────────────────────
// Add these to src/lib/api.ts
//
// Place the types near the other shared types at the top, and the functions
// in a new "Uploads" section — above the Clients section reads naturally.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types (add near PaginatedLeads) ───────────────────────────────────────────

export interface SkippedRow {
  row: number;
  reason: string;
  detail: string;
}

export interface UploadResult {
  imported: number;
  skipped: SkippedRow[];
  totalRows: number;
  needsApproval: boolean;
  message: string;
}

// ── Uploads ───────────────────────────────────────────────────────────────────

/**
 * Upload a CSV or Excel file of leads.
 *
 * clientId is only used by ReachFlow staff — for client users the backend
 * takes the client from their token and ignores anything sent here.
 */
export async function uploadLeads(
  file: File,
  clientId?: number,
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);

  const query = clientId !== undefined ? `?client_id=${clientId}` : '';

  const token = typeof window !== 'undefined'
    ? localStorage.getItem('rf-token')
    : null;

  // Content-Type is deliberately omitted — the browser sets it along with
  // the multipart boundary, and setting it by hand breaks the upload.
  const res = await fetch(`${API_URL}/api/uploads/leads${query}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const data = await handleResponse<{
    imported: number;
    skipped: Array<{ row: number; reason: string; detail: string }>;
    total_rows: number;
    needs_approval: boolean;
    message: string;
  }>(res);

  return {
    imported: data.imported,
    skipped: data.skipped,
    totalRows: data.total_rows,
    needsApproval: data.needs_approval,
    message: data.message,
  };
}

/**
 * Download the CSV template.
 *
 * Fetched rather than linked because the endpoint requires authentication —
 * a plain <a href> would arrive without the token and get a 401.
 */
export async function downloadTemplate(): Promise<void> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('rf-token')
    : null;

  const res = await fetch(`${API_URL}/api/uploads/template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error('Could not download the template');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reachflow-leads-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** Release leads sitting in pending_approval. Client Owner and above. */
export async function approvePendingLeads(
  clientId?: number,
): Promise<{ approved: number; message: string }> {
  const query = clientId !== undefined ? `?client_id=${clientId}` : '';
  const res = await fetch(`${API_URL}/api/uploads/approve${query}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// Add these to src/lib/api.ts
//
// Types near the other shared types, functions in a "Calling" section —
// above Call history reads naturally.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CallingStatus {
  canCall: boolean;
  reason?: string;
  windowOpensAt?: Date;
  windowStartHour: number;
  windowEndHour: number;
  serverTimeIst: Date;
}

export interface StartCallResult {
  started: boolean;
  leadId: number;
  vapiCallId?: string;
  message: string;
}

export interface RejectedLead {
  leadId: number;
  name?: string;
  reason: string;
}

export interface StartBatchResult {
  queued: number;
  rejected: RejectedLead[];
  message: string;
}

// ── Calling ───────────────────────────────────────────────────────────────────

/**
 * Whether calls can be placed right now.
 *
 * The calling window is a server-side rule the browser has no way to know.
 * Without checking, at 10pm every row looks callable and every click fails.
 */
export async function getCallingStatus(): Promise<CallingStatus> {
  const res = await fetch(`${API_URL}/api/calls/status`, {
    headers: getAuthHeaders(),
  });

  const data = await handleResponse<{
    can_call: boolean;
    reason: string | null;
    window_opens_at: string | null;
    window_start_hour: number;
    window_end_hour: number;
    server_time_ist: string;
  }>(res);

  return {
    canCall: data.can_call,
    reason: data.reason ?? undefined,
    windowOpensAt: data.window_opens_at ? new Date(data.window_opens_at) : undefined,
    windowStartHour: data.window_start_hour,
    windowEndHour: data.window_end_hour,
    serverTimeIst: new Date(data.server_time_ist),
  };
}

/** Place a call to one lead, now. */
export async function startCall(leadId: number): Promise<StartCallResult> {
  const res = await fetch(`${API_URL}/api/calls/start`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ lead_id: leadId }),
  });

  const data = await handleResponse<{
    started: boolean;
    lead_id: number;
    vapi_call_id: string | null;
    message: string;
  }>(res);

  return {
    started: data.started,
    leadId: data.lead_id,
    vapiCallId: data.vapi_call_id ?? undefined,
    message: data.message,
  };
}

/**
 * Queue calls for several leads.
 *
 * Every lead is validated server-side before anything is queued, so the
 * result lists exactly which were accepted and which were skipped and why.
 */
export async function startBatchCalls(leadIds: number[]): Promise<StartBatchResult> {
  const res = await fetch(`${API_URL}/api/calls/start-batch`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ lead_ids: leadIds }),
  });

  const data = await handleResponse<{
    queued: number;
    rejected: Array<{ lead_id: number; name: string | null; reason: string }>;
    message: string;
  }>(res);

  return {
    queued: data.queued,
    rejected: data.rejected.map(r => ({
      leadId: r.lead_id,
      name: r.name ?? undefined,
      reason: r.reason,
    })),
    message: data.message,
  };
}
