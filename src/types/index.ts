// ─── Lead & Call Types ────────────────────────────────────────────────────────

export type LeadStatus =
  | 'agreed'
  | 'declined'
  | 'no_answer'
  | 'calling'
  | 'pending';

export interface Lead {
  id: number;
  name: string;
  phone: string;
  status: LeadStatus;
  attempts: number;
  lastCalled: Date | null;
  nextRetry: Date | null;
  score: number;
  clientId: string;
  transcriptId?: string;
  sentiment?: number;
  summary?: string;
}

export interface CallLog {
  id: number;
  leadId: number;
  startedAt: Date;
  duration: number; // seconds
  status: LeadStatus;
  transcript: TranscriptLine[];
  sentiment: number;
  summary: string;
}

export interface TranscriptLine {
  speaker: 'AI' | 'Lead';
  text: string;
  timestamp?: number;
}

// ─── User & Auth Types ────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'client_admin' | 'client_viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  clientId?: string; // null for super_admin
}

// ─── Client Types ─────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  totalLeads: number;
  successRate: number;
  activeCallsSince: Date;
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
