// ─── Lead & Call Types ────────────────────────────────────────────────────────

export type LeadStatus =
  | 'agreed'
  | 'declined'
  | 'no_answer'
  | 'calling'
  | 'pending'
  | 'pending_approval';

/**
 * Where a lead sits in the sales process.
 *
 * Separate from LeadStatus: status is set by the AI when a call finishes,
 * stage is set by the client's staff as they work the lead.
 */
export type PipelineStage =
  // Active — these six are the board columns, in order
  | 'not_contacted'
  | 'contacted'
  | 'responded'
  | 'advisor_assigned'
  | 'documents_sent'
  | 'invested'
  // Terminal — shown as counts beneath the board
  | 'retrying'
  | 'unreachable'
  | 'declined'
  | 'do_not_call';

export type Language = 'english' | 'hindi' | 'telugu';

export interface Lead {
  id: number;
  name: string;
  phone: string;
  status: LeadStatus;
  pipelineStage: PipelineStage;
  attempts: number;
  lastCalled: Date | null;
  nextRetry: Date | null;
  score: number;
  sentiment?: number;
  language: Language;
  clientId: number;
  assignedTo?: number;
  uploadedBy?: number;
  createdAt: Date;
}

export interface CallLog {
  id: number;
  leadId: number;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  status: LeadStatus;
  transcript?: string;
  summary?: string;
  sentiment?: number;
  vapiCallId?: string;
  language: Language;
}

// UI-only. The backend stores transcripts as plain text; this is the
// parsed shape used for display in the drawer.
export interface TranscriptLine {
  speaker: 'AI' | 'Lead';
  text: string;
  timestamp?: number;
}

// ─── Pipeline board ───────────────────────────────────────────────────────────

export interface PipelineColumn {
  stage: PipelineStage;
  count: number;
  leads: Lead[];
}

export interface TerminalCount {
  stage: PipelineStage;
  count: number;
}

export interface PipelineBoard {
  columns: PipelineColumn[];
  terminal: TerminalCount[];
  total: number;
}

// ─── User & Auth Types ────────────────────────────────────────────────────────

export type UserRole =
  | 'super_admin'
  | 'reachflow_manager'
  | 'client_owner'
  | 'client_manager'
  | 'client_analyst';

export interface UserPermissions {
  canUploadLeads: boolean;
  canStartCampaign: boolean;
  canViewTranscripts: boolean;
  canManageAnalysts: boolean;
  canExportData: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  clientId: number | null;
  isActive: boolean;
  permissions: UserPermissions;
}

export interface AuthToken {
  accessToken: string;
  tokenType: string;
  userId: number;
  name: string;
  role: UserRole;
  clientId: number | null;
}

// ─── Client Types ─────────────────────────────────────────────────────────────

export interface Client {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  // Computed elsewhere — not part of the client record itself
  totalLeads?: number;
  successRate?: number;
}

// ─── Permission Types ─────────────────────────────────────────────────────────

export interface ClientPermission {
  userId: number;
  clientId: number;
  canUploadLeads: boolean;
  canStartCampaign: boolean;
  canViewTranscripts: boolean;
  canManageAnalysts: boolean;
  canExportData: boolean;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface CampaignStats {
  total: number;
  called: number;
  agreed: number;
  declined: number;
  noAnswer: number;
  pending: number;
  calling: number;
}

// ─── Role metadata ────────────────────────────────────────────────────────────

export const ROLE_META: Record<UserRole, { label: string; color: string; desc: string }> = {
  super_admin:       { label: 'Super Admin',       color: '#6366F1', desc: 'Full platform access' },
  reachflow_manager: { label: 'ReachFlow Manager', color: '#3B82F6', desc: 'Assigned clients only' },
  client_owner:      { label: 'Client Owner',      color: '#10B981', desc: 'Full access to own company' },
  client_manager:    { label: 'Client Manager',    color: '#F59E0B', desc: 'Manages assigned leads' },
  client_analyst:    { label: 'Client Analyst',    color: '#8B5CF6', desc: 'Read-only access' },
};

// ─── Stage metadata ───────────────────────────────────────────────────────────

export const STAGE_META: Record<
  PipelineStage,
  { label: string; color: string; desc: string; terminal: boolean }
> = {
  not_contacted:    { label: 'Not contacted',    color: '#64748B', desc: 'Uploaded, no call made yet',      terminal: false },
  contacted:        { label: 'Contacted',        color: '#6366F1', desc: 'AI reached them',                 terminal: false },
  responded:        { label: 'Responded',        color: '#3B82F6', desc: 'Showed interest',                 terminal: false },
  advisor_assigned: { label: 'Advisor assigned', color: '#8B5CF6', desc: 'A human advisor took over',       terminal: false },
  documents_sent:   { label: 'Documents sent',   color: '#F59E0B', desc: 'Paperwork with the lead',         terminal: false },
  invested:         { label: 'Invested',         color: '#10B981', desc: 'Deal closed',                     terminal: false },
  retrying:         { label: 'Retrying',         color: '#EAB308', desc: 'No answer, retry scheduled',      terminal: true  },
  unreachable:      { label: 'Unreachable',      color: '#94A3B8', desc: 'Retries exhausted',               terminal: true  },
  declined:         { label: 'Declined',         color: '#EF4444', desc: 'Said no',                         terminal: true  },
  do_not_call:      { label: 'Do not call',      color: '#DC2626', desc: 'On the NDNC register or opted out', terminal: true },
};

/** Board columns, in the order they appear. */
export const ACTIVE_STAGES: PipelineStage[] = [
  'not_contacted',
  'contacted',
  'responded',
  'advisor_assigned',
  'documents_sent',
  'invested',
];

/** Stages a person can set. not_contacted is system-owned. */
export const SELECTABLE_STAGES: PipelineStage[] = [
  'contacted',
  'responded',
  'advisor_assigned',
  'documents_sent',
  'invested',
  'retrying',
  'unreachable',
  'declined',
  'do_not_call',
];

/** Stages that require the lead to have been called at least once. */
export const REQUIRES_CONTACT: PipelineStage[] = [
  'responded',
  'advisor_assigned',
  'documents_sent',
  'invested',
];

// ─── Role helpers ─────────────────────────────────────────────────────────────

export const isReachFlowStaff = (role: UserRole): boolean =>
  role === 'super_admin' || role === 'reachflow_manager';

export const isClientRole = (role: UserRole): boolean =>
  role === 'client_owner' || role === 'client_manager' || role === 'client_analyst';

export const canUploadLeads = (role: UserRole): boolean =>
  role === 'super_admin' || role === 'reachflow_manager' || role === 'client_owner';

/** Analysts are read-only; everyone else can move leads through the pipeline. */
export const canMoveStage = (role: UserRole): boolean =>
  role !== 'client_analyst';
