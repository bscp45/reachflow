// ─────────────────────────────────────────────────────────────────────────────
// mock-data.ts
// All hardcoded data lives here.
// When the backend is ready, delete this file and replace
// each import with a real API call from lib/api.ts
// ─────────────────────────────────────────────────────────────────────────────

import type { Lead, Client, CampaignStats } from '@/types';

export const MOCK_STATS: CampaignStats = {
  total: 284,
  called: 198,
  agreed: 47,
  declined: 88,
  noAnswer: 63,
  pending: 86,
  calling: 0,
};

export const MOCK_CLIENTS: Client[] = [
  { id: 'c1', name: 'Finedge Capital',  totalLeads: 284, successRate: 17, activeCallsSince: new Date('2024-11-01') },
  { id: 'c2', name: 'BlueStar Realty',  totalLeads: 142, successRate: 23, activeCallsSince: new Date('2024-10-15') },
  { id: 'c3', name: 'Zenith Ventures',  totalLeads: 509, successRate: 11, activeCallsSince: new Date('2024-12-01') },
  { id: 'c4', name: 'Apex Investments', totalLeads: 376, successRate: 31, activeCallsSince: new Date('2024-09-20') },
];

const NAMES = [
  'Arjun Mehta','Priya Sharma','Rohit Verma','Sneha Pillai','Karan Bose',
  'Divya Nair','Vikram Rao','Ananya Singh','Sanjay Gupta','Pooja Iyer',
  'Rahul Das','Meera Krishnan','Aditya Joshi','Kavya Reddy','Nikhil Patel',
  'Sunita Sharma','Rajesh Kumar','Preethi Nair','Deepak Mishra','Lakshmi Venkat',
];

const STATUSES: Lead['status'][] = [
  'agreed','agreed','declined','no_answer','no_answer',
  'pending','pending','pending','calling','declined',
];

export function generateMockLeads(count = 284): Lead[] {
  return Array.from({ length: count }, (_, i) => {
    const status = STATUSES[i % STATUSES.length];
    const attempts =
      status === 'pending' ? 0 :
      status === 'agreed' || status === 'declined' ? Math.floor(Math.random() * 3) + 1 :
      Math.floor(Math.random() * 4) + 1;

    const daysAgo = Math.floor(Math.random() * 14);
    const hoursAgo = Math.floor(Math.random() * 24);
    const lastCalled =
      status === 'pending'
        ? null
        : new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);

    let nextRetry: Date | null = null;
    if (status === 'no_answer' && lastCalled)
      nextRetry = new Date(lastCalled.getTime() + 2 * 3600000);
    if (status === 'declined' && lastCalled)
      nextRetry = new Date(lastCalled.getTime() + 30 * 86400000);

    return {
      id: i + 1,
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
      phone: `+91 ${String(98000 + i * 317 % 1999).padStart(5,'0')} ${String(10000 + i * 179 % 89999).padStart(5,'0')}`,
      status,
      attempts,
      lastCalled,
      nextRetry,
      score:
        status === 'agreed'   ? 70 + Math.floor(Math.random() * 30) :
        status === 'declined' ? Math.floor(Math.random() * 30) :
        30 + Math.floor(Math.random() * 40),
      clientId: 'c1',
      sentiment:
        status === 'agreed'   ? 70 + Math.floor(Math.random() * 28) :
        status === 'declined' ? 10 + Math.floor(Math.random() * 25) :
        35 + Math.floor(Math.random() * 35),
    };
  });
}

export const MOCK_LEADS = generateMockLeads(284);
