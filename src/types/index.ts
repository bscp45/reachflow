// ─── Lead & Call Types ────────────────────────────────────────────────────────

export type LeadStatus =
  | 'agreed'
  | 'declined'
  | 'no_answer'
  | 'calling'
  | 'pending'
  | 'pending_approval';

export interface Lead {
  id: number;
  name: string;
  phone: string;
  status: LeadStatus;
  attempts: number;
  lastCalled: Date | null;
  nextRetry: Date | null;
  score: number;
  sentiment?: number;
  language: 'english' | 'hindi' | 'telugu';
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
  transcript?: string;       // stored as plain text in DB
  summary?: string;
  sentiment?: number;
  vapiCallId?: string;
  language: 'english' | 'hindi' | 'telugu';
}

// UI-only — used when displaying transcript in the drawer
// The raw transcript string gets parsed into these lines for display
export interface TranscriptLine {
  speaker: 'AI' | 'Lead';
  text: string;
  timestamp?: number;
}

// ─── User & Auth Types ────────────────────────────────────────────────────────

export type UserRole =
  | 'super_admin'
  | 'reachflow_manager'
  | 'client_owner'
  | 'client_manager'
  | 'client_analyst';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  clientId: number | null;
  isActive: boolean;
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
  // Computed fields — come from stats endpoint, not client object
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

// ─── Role helpers ─────────────────────────────────────────────────────────────

export const ROLE_META: Record<UserRole, { label: string; color: string; desc: string }> = {
  super_admin:       { label: 'Super Admin',       color: '#6366F1', desc: 'Full platform access' },
  reachflow_manager: { label: 'ReachFlow Manager', color: '#3B82F6', desc: 'Assigned clients only' },
  client_owner:      { label: 'Client Owner',      color: '#10B981', desc: 'Full access to own company' },
  client_manager:    { label: 'Client Manager',    color: '#F59E0B', desc: 'Manages assigned leads' },
  client_analyst:    { label: 'Client Analyst',    color: '#8B5CF6', desc: 'Read-only access' },
};

export const isReachFlowStaff = (role: UserRole): boolean =>
  role === 'super_admin' || role === 'reachflow_manager';

export const isClientRole = (role: UserRole): boolean =>
  role === 'client_owner' || role === 'client_manager' || role === 'client_analyst';

export const canUploadLeads = (role: UserRole): boolean =>
  role === 'super_admin' || role === 'reachflow_manager' || role === 'client_owner';