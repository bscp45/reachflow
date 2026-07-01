'use client';

import { useState, useMemo } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useTheme } from '@/lib/theme-context';
import { MOCK_LEADS } from '@/lib/mock-data';
import type { Lead, LeadStatus } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  agreed:    { label: 'Agreed',    color: '#10B981', bg: 'rgba(16,185,129,.12)'  },
  declined:  { label: 'Declined',  color: '#EF4444', bg: 'rgba(239,68,68,.12)'   },
  no_answer: { label: 'No answer', color: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
  calling:   { label: 'Calling…',  color: '#3B82F6', bg: 'rgba(59,130,246,.12)'  },
  pending:   { label: 'Pending',   color: '#8B5CF6', bg: 'rgba(139,92,246,.12)'  },
};

const FILTER_COLORS: Partial<Record<LeadStatus, string>> = {
  agreed: '#10B981', declined: '#EF4444',
  no_answer: '#F59E0B', calling: '#3B82F6', pending: '#8B5CF6',
};

const AVATAR_COLORS = [
  '#4F46E5','#0891B2','#059669','#D97706',
  '#DC2626','#7C3AED','#0284C7','#16A34A',
];

const MOCK_TRANSCRIPTS = [
  [
    { s: 'AI',   t: 'Hello, am I speaking with the lead?' },
    { s: 'Lead', t: 'Yes, speaking.' },
    { s: 'AI',   t: 'I\'m calling from ReachFlow regarding an investment opportunity. Do you have 2 minutes?' },
    { s: 'Lead', t: 'Sure, go ahead.' },
    { s: 'AI',   t: 'Our SIP plans start at ₹5,000/month with 18% projected annual returns. Interested?' },
    { s: 'Lead', t: 'Yes, sounds interesting. Please connect me with an advisor.' },
  ],
  [
    { s: 'AI',   t: 'Hello, calling from ReachFlow regarding an investment opportunity.' },
    { s: 'Lead', t: 'I\'m not interested. Please remove my number.' },
  ],
  [{ s: 'AI', t: 'Hello, may I speak with the lead?' }, { s: 'Lead', t: '[No answer — voicemail]' }],
];

const MOCK_SUMMARIES = [
  'Lead showed strong interest. Requested advisor callback. High conversion probability — follow up within 24 hours.',
  'Lead explicitly declined and requested DNC. Mark as do-not-call and remove from active campaigns.',
  'No answer on all attempts. Retry scheduled per 2-hour window policy.',
];

const PAGE_SIZE = 20;

type SortKey = 'name' | 'score' | 'attempts' | 'date';
type SortDir = 'asc' | 'desc';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(d: Date | null): string {
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function timeUntil(d: Date | null): { text: string; cls: string } | null {
  if (!d) return null;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return { text: 'Due now', cls: 'urgent' };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h === 0)  return { text: `${m}m`,       cls: 'urgent' };
  if (h < 6)   return { text: `${h}h ${m}m`, cls: 'soon'   };
  const days = Math.floor(h / 24);
  if (days > 0) return { text: `${days}d`,   cls: 'ok'     };
  return { text: `${h}h`, cls: 'ok' };
}

function scoreColor(s: number) {
  return s >= 70 ? '#10B981' : s >= 40 ? '#F59E0B' : '#EF4444';
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function exportCSV(leads: Lead[]) {
  const rows = [['Name','Phone','Status','Attempts','Last Called','Score']];
  leads.forEach(l => rows.push([
    l.name, l.phone, l.status, String(l.attempts),
    l.lastCalled ? l.lastCalled.toLocaleDateString('en-IN') : '—',
    String(l.score),
  ]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'reachflow-leads.csv';
  a.click();
}

// ── Drawer Component ─────────────────────────────────────────────────────────

function TranscriptDrawer({
  lead, onClose, dark,
}: { lead: Lead | null; onClose: () => void; dark: boolean }) {
  const t = {
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  if (!lead) return null;
  const m = STATUS_META[lead.status];
  const retry = lead.nextRetry ? timeUntil(lead.nextRetry) : null;
  const sc = lead.score ?? 0;
  const sentiment = lead.sentiment ?? 50;
  const sColor = sentiment >= 60 ? '#10B981' : sentiment >= 35 ? '#F59E0B' : '#EF4444';
  const sLabel = sentiment >= 60 ? 'Positive' : sentiment >= 35 ? 'Neutral' : 'Negative';
  const transcript = MOCK_TRANSCRIPTS[lead.id % MOCK_TRANSCRIPTS.length];
  const summary = lead.status === 'pending'
    ? 'No call has been made yet. This lead is queued for outreach.'
    : MOCK_SUMMARIES[lead.id % MOCK_SUMMARIES.length];

  const metaItems = [
    { label: 'Status',       val: m.label,                              color: m.color },
    { label: 'Lead score',   val: `${sc}/100`,                          color: scoreColor(sc) },
    { label: 'Call attempts',val: String(lead.attempts),                color: undefined },
    { label: 'Last called',  val: timeAgo(lead.lastCalled),             color: undefined },
    { label: 'Next retry',   val: retry?.text ?? (lead.status === 'agreed' ? 'Complete' : 'Not yet called'), color: undefined },
    { label: 'Client',       val: 'Finedge Capital',                    color: undefined },
  ];

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        zIndex: 100, cursor: 'pointer',
      }} />
      {/* Drawer */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 460,
        background: t.surf, borderLeft: `1px solid ${t.bord}`,
        zIndex: 101, display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.bord}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{lead.name}</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{lead.phone} · {m.label}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${t.bord}`, background: 'transparent', color: t.muted, cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Meta grid */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: t.muted, marginBottom: 8 }}>Call details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {metaItems.map(item => (
                <div key={item.label} style={{ background: t.surf2, borderRadius: 8, padding: '10px 12px', border: `1px solid ${t.bord}` }}>
                  <div style={{ fontSize: 10, color: t.muted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.06em' }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: item.color ?? t.text }}>{item.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sentiment */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: t.muted, marginBottom: 8 }}>Sentiment</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: sColor, minWidth: 60 }}>{sLabel}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: t.surf2 }}>
                <div style={{ width: `${sentiment}%`, height: '100%', borderRadius: 3, background: sColor }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: sColor, minWidth: 36, textAlign: 'right' }}>{sentiment}%</span>
            </div>
          </div>

          {/* AI summary */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: t.muted, marginBottom: 8 }}>AI call summary</div>
            <div style={{ background: t.surf2, border: `1px solid ${t.bord}`, borderRadius: 10, padding: '12px 14px', fontSize: 12, lineHeight: 1.7, color: t.text }}>{summary}</div>
          </div>

          {/* Transcript */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: t.muted, marginBottom: 8 }}>Transcript</div>
            <div style={{ background: t.surf2, border: `1px solid ${t.bord}`, borderRadius: 10, padding: '12px 14px' }}>
              {lead.status === 'pending' ? (
                <span style={{ fontSize: 12, color: t.muted, fontStyle: 'italic' }}>No transcript — call not yet made.</span>
              ) : transcript.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', minWidth: 32, paddingTop: 2, flexShrink: 0, color: line.s === 'AI' ? '#6366F1' : '#10B981' }}>{line.s}</span>
                  <span style={{ fontSize: 12, lineHeight: 1.6, color: t.text }}>{line.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CallData() {
  const { dark } = useTheme();
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<LeadStatus | 'all'>('all');
  const [sortKey, setSortKey]       = useState<SortKey>('name');
  const [sortDir, setSortDir]       = useState<SortDir>('asc');
  const [page, setPage]             = useState(1);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);

  const t = {
    bg:    dark ? '#0A0D14' : '#F0F3FA',
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    surf3: dark ? '#1E2438' : '#EDF0F8',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    bord2: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.13)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  // Sort handler
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  // Filter + sort + search
  const filtered = useMemo(() => {
    let data = [...MOCK_LEADS];
    if (filter !== 'all') data = data.filter(l => l.status === filter);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(l => l.name.toLowerCase().includes(q) || l.phone.includes(q));
    }
    data.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name')     return dir * a.name.localeCompare(b.name);
      if (sortKey === 'score')    return dir * (a.score - b.score);
      if (sortKey === 'attempts') return dir * (a.attempts - b.attempts);
      if (sortKey === 'date') {
        const av = a.lastCalled?.getTime() ?? 0;
        const bv = b.lastCalled?.getTime() ?? 0;
        return dir * (av - bv);
      }
      return 0;
    });
    return data;
  }, [filter, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === k ? 1 : 0.35, color: sortKey === k ? '#6366F1' : 'inherit', fontSize: 10 }}>
      {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '.08em', color: t.muted,
    borderBottom: `1px solid ${t.bord}`, whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none', background: t.surf,
  };

  const td: React.CSSProperties = {
    padding: '11px 12px', borderBottom: `1px solid ${t.bord}`, verticalAlign: 'middle',
  };

  return (
    <>
      <Topbar title="Call Data" badge={`${filtered.length} leads`} />

      {/* Toolbar */}
      <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: `1px solid ${t.bord}`, background: t.surf, flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 300 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: .5, pointerEvents: 'none' }}>⌕</span>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name or phone…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', background: t.surf2, border: `1px solid ${t.bord}`, borderRadius: 8, color: t.text, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 3, background: t.surf2, borderRadius: 8, padding: 3 }}>
          {(['all', 'agreed', 'declined', 'no_answer', 'calling', 'pending'] as const).map(s => {
            const active = filter === s;
            const color = s === 'all' ? '#6366F1' : (FILTER_COLORS[s] ?? '#6366F1');
            return (
              <button key={s} onClick={() => { setFilter(s); setPage(1); }} style={{
                padding: '5px 11px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? color : 'transparent',
                color: active ? '#fff' : t.muted,
                transition: 'all .15s',
              }}>
                {s === 'all' ? 'All' : s === 'no_answer' ? 'No answer' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            );
          })}
        </div>

        {/* Export */}
        <button onClick={() => exportCSV(filtered)} style={{
          padding: '7px 14px', background: 'transparent', border: `1px solid ${t.bord2}`,
          borderRadius: 8, color: t.text, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>
          ↓ Export CSV
        </button>
      </div>

      {/* Table area */}
      <div style={{ flex: 1, overflow: 'auto', background: t.bg }}>
        {pageData.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: t.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: .4 }}>◫</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>No leads match your filters</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Try a different status or search term</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 220 }} onClick={() => handleSort('name')}>Lead <SortIcon k="name" /></th>
                <th style={{ ...th, width: 130 }}>Status</th>
                <th style={{ ...th, width: 110 }} onClick={() => handleSort('attempts')}>Attempts <SortIcon k="attempts" /></th>
                <th style={{ ...th, width: 140 }} onClick={() => handleSort('date')}>Last called <SortIcon k="date" /></th>
                <th style={{ ...th, width: 120 }}>Next retry</th>
                <th style={{ ...th, width: 130 }} onClick={() => handleSort('score')}>Score <SortIcon k="score" /></th>
                <th style={{ ...th, width: 110 }}>Transcript</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map((lead, i) => {
                const m = STATUS_META[lead.status];
                const retry = lead.nextRetry ? timeUntil(lead.nextRetry) : null;
                const sc = scoreColor(lead.score);
                const retryColors: Record<string, string> = { urgent: '#EF4444', soon: '#F59E0B', ok: '#10B981' };

                return (
                  <tr key={lead.id} style={{ background: i % 2 === 0 ? t.surf : t.surf2 }}>
                    {/* Lead */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: AVATAR_COLORS[lead.id % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {initials(lead.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{lead.name}</div>
                          <div style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace', marginTop: 1 }}>{lead.phone}</div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: m.bg, color: m.color }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                        {m.label}
                      </span>
                    </td>

                    {/* Attempts */}
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {Array.from({ length: 5 }, (_, di) => (
                          <span key={di} style={{ width: 7, height: 7, borderRadius: '50%', background: di < lead.attempts ? m.color : t.surf3 }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: t.muted, marginTop: 3 }}>{lead.attempts} call{lead.attempts !== 1 ? 's' : ''}</div>
                    </td>

                    {/* Last called */}
                    <td style={{ ...td, fontSize: 12, color: t.muted }}>{timeAgo(lead.lastCalled)}</td>

                    {/* Next retry */}
                    <td style={td}>
                      {retry ? (
                        <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 500, color: retryColors[retry.cls] ?? t.muted }}>{retry.text}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: t.muted }}>
                          {lead.status === 'agreed' ? 'Complete' : lead.status === 'pending' ? 'Not called' : '—'}
                        </span>
                      )}
                    </td>

                    {/* Score */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: t.surf3, minWidth: 40 }}>
                          <div style={{ width: `${lead.score}%`, height: '100%', borderRadius: 2, background: sc }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: sc, minWidth: 24, textAlign: 'right', fontFamily: 'monospace' }}>{lead.score}</span>
                      </div>
                    </td>

                    {/* Transcript */}
                    <td style={td}>
                      {lead.status !== 'pending' ? (
                        <button onClick={() => setDrawerLead(lead)} style={{
                          padding: '4px 10px', borderRadius: 6, border: `1px solid ${t.bord2}`,
                          background: 'transparent', color: t.text, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          View →
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: t.muted, fontStyle: 'italic' }}>No call yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div style={{ padding: '12px 24px', borderTop: `1px solid ${t.bord}`, background: t.surf, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: t.muted }}>
          {filtered.length === 0 ? 'No results' : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${t.bord}`, background: 'transparent', color: t.text, fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? .3 : 1 }}>‹</button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = i + 1;
            return (
              <button key={p} onClick={() => setPage(p)} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${page === p ? '#6366F1' : t.bord}`, background: page === p ? '#6366F1' : 'transparent', color: page === p ? '#fff' : t.text, fontSize: 12, cursor: 'pointer' }}>{p}</button>
            );
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${t.bord}`, background: 'transparent', color: t.text, fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages || totalPages === 0 ? .3 : 1 }}>›</button>
        </div>
      </div>

      {/* Transcript Drawer */}
      {drawerLead && (
        <TranscriptDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} dark={dark} />
      )}
    </>
  );
}
