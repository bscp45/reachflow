// ─────────────────────────────────────────────────────────────────────────────
// api.ts
// All API calls go here.
// Right now they return mock data.
// When backend is ready: replace each function body with a real fetch() call.
// ─────────────────────────────────────────────────────────────────────────────

import type { Lead, CampaignStats, Client } from '@/types';
import { MOCK_STATS, MOCK_LEADS, MOCK_CLIENTS } from './mock-data';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Leads ─────────────────────────────────────────────────────────────────────

export async function getLeads(): Promise<Lead[]> {
  // TODO: replace with → return fetch(`${API_URL}/api/leads`).then(r => r.json())
  return Promise.resolve(MOCK_LEADS);
}

export async function uploadLeads(file: File): Promise<{ inserted: number }> {
  // TODO: replace with real multipart upload
  // const form = new FormData();
  // form.append('file', file);
  // return fetch(`${API_URL}/api/leads/upload`, { method: 'POST', body: form }).then(r => r.json());
  console.log('Uploading file:', file.name);
  return Promise.resolve({ inserted: 42 });
}

export async function addLeadManually(phone: string, name: string): Promise<Lead> {
  // TODO: return fetch(`${API_URL}/api/leads`, { method: 'POST', body: JSON.stringify({ phone, name }) }).then(r => r.json())
  console.log('Adding lead:', phone, name);
  return Promise.resolve(MOCK_LEADS[0]);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getCampaignStats(): Promise<CampaignStats> {
  // TODO: return fetch(`${API_URL}/api/stats`).then(r => r.json())
  return Promise.resolve(MOCK_STATS);
}

// ── Clients (Super Admin only) ────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  // TODO: return fetch(`${API_URL}/api/clients`).then(r => r.json())
  return Promise.resolve(MOCK_CLIENTS);
}
