'use client';

import { useState, useEffect, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useTheme } from '@/lib/theme-context';
import { getLeads, getCallsForLead } from '@/lib/api';
import type { LeadSortField, SortDirection } from '@/lib/api';
import type { Lead, LeadStatus, CallLog } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  agreed:           { label: 'Agreed',         color: '#10B981', bg: 'rgba(16,185,129,.12)'  },
  declined:         { label: 'Declined',       color: '#EF4444', bg: 'rgba(239,68,68,.12)'   },
  no_answer:        { label: 'No answer',      color: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
  calling:          { label: 'Calling…',       color: '#3B82F6', bg: 'rgba(59,130,246,.12)'  },
  pending:          { label: 'Pending',        color: '#8B5CF6', bg: 'rgba(139,92,246,.12)'  },
  pending_approval: { label: 'Needs approval', color: '#EC4899', bg: 'rgba(236,72,153,.12)'  },
};

const FILTER_TABS: Array<{ value: LeadStatus | 'all'; label: string; color: string }> = [
  { value: 'all',              label: 'All',       color: '#6366F1' },
  { value: 'agreed',           label: 'Agreed',    color: '#10B981' },
  { value: 'declined',         label: 'Declined',  color: '#EF4444' },
  { value: 'no_answer',        label: 'No answer', color: '#F59E0B' },
  { value: 'calling',          label: 'Calling',   color: '#3B82F6' },
  { value: 'pending',          label: 'Pending',   color: '#8B5CF6' },
  { value: 'pending_approval', label: 'Approval',  color: '#EC4899' },
];

const AVATAR_COLORS = [
  '#4F46E5', '#0891B2', '#059669', '#D97706',
  '#DC2626', '#7C3AED', '#0284C7', '#16A34A',
];

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

// Maps a table column to the backend's sort field name
const SORT_COLUMNS: Array<{ key: LeadSortField; label: string; width: number }> = [
  { key: 'name',        label: 'Lead',        width: 220 },
  { key: 'attempts',    label: 'Attempts',    width: 110 },
  { key: 'last_called', label: 'Last called', width: 140 },
  { key: 'score',       label: 'Score',       width: 130 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d: Date | null): string {
  if (!d) return '—';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1)    return 'Just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeUntil(d: Date | null): { text: string; tone: string } | null {
  if (!d) return null;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return { text: 'Due now', tone: '#EF4444' };

  const hrs  = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  if (hrs === 0) return { text: `${mins}m`,        tone: '#EF4444' };
  if (hrs < 6)   return { text: `${hrs}h ${mins}m`, tone: '#F59E0B' };

  const days = Math.floor(hrs / 24);
  if (days > 0)  return { text: `${days}d`,        tone: '#10B981' };
  return { text: `${hrs}h`, tone: '#10B981' };
}

function scoreColor(s: number): string {
  return s >= 70 ? '#10B981' : s >= 40 ? '#F59E0B' : '#EF4444';
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * The backend stores transcripts as plain text, one line per turn,
 * formatted "Speaker: text". Split it back out for display.
 */
function parseTranscript(raw?: string): Array<{ speaker: string; text: string }> {
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return { speaker: '', text: line };
    return {
      speaker: line.slice(0, idx).trim(),
      text:    line.slice(idx + 1).trim(),
    };
  });
}

function exportCSV(leads: Lead[]): void {
  const rows = [['Name', 'Phone', 'Status', 'Attempts', 'Last Called', 'Score', 'Language']];
  leads.forEach(l => rows.push([
    l.name,
    l.phone,
    l.status,
    String(l.attempts),
    l.lastCalled ? l.lastCalled.toLocaleDateString('en-IN') : '—',
    String(l.score),
    l.language,
  ]));

  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `reachflow-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── Transcript drawer ─────────────────────────────────────────────────────────

function TranscriptDrawer({
  lead, onClose, dark,
}: { lead: Lead; onClose: () => void; dark: boolean }) {
  const [calls, setCalls]     = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const t = {
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  useEffect(() => {
    let cancelled = false;

    getCallsForLead(lead.id)
      .then(data => { if (!cancelled) setCalls(data); })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load call history');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [lead.id]);

  const meta  = STATUS_META[lead.status];
  const retry = timeUntil(lead.nextRetry);

  const sectionTitle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '.08em', color: t.muted, marginBottom: 8,
  };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        zIndex: 100, cursor: 'pointer',
      }} />

      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 460,
        background: t.surf, borderLeft: `1px solid ${t.bord}`,
        zIndex: 101, display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: `1px solid ${t.bord}`,
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{lead.name}</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
              {lead.phone} · {meta.label}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6,
            border: `1px solid ${t.bord}`, background: 'transparent',
            color: t.muted, cursor: 'pointer', fontSize: 13,
          }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Lead details */}
          <div>
            <div style={sectionTitle}>Lead details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Status',     value: meta.label,                        color: meta.color },
                { label: 'Score',      value: `${lead.score}/100`,               color: scoreColor(lead.score) },
                { label: 'Attempts',   value: String(lead.attempts) },
                { label: 'Last called', value: timeAgo(lead.lastCalled) },
                { label: 'Next retry', value: retry?.text ?? (lead.status === 'agreed' ? 'Complete' : 'Not scheduled') },
                { label: 'Language',   value: lead.language.charAt(0).toUpperCase() + lead.language.slice(1) },
              ].map(item => (
                <div key={item.label} style={{
                  background: t.surf2, borderRadius: 8,
                  padding: '10px 12px', border: `1px solid ${t.bord}`,
                }}>
                  <div style={{
                    fontSize: 10, color: t.muted, marginBottom: 3,
                    textTransform: 'uppercase', letterSpacing: '.06em',
                  }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: item.color ?? t.text }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Call history */}
          <div>
            <div style={sectionTitle}>
              Call history {calls.length > 0 && `(${calls.length})`}
            </div>

            {loading && (
              <div style={{ fontSize: 12, color: t.muted, padding: '12px 0' }}>
                Loading call history…
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(239,68,68,.1)',
                border: '1px solid rgba(239,68,68,.25)',
                borderRadius: 8, padding: '10px 12px',
                fontSize: 12, color: '#EF4444',
              }}>
                {error}
              </div>
            )}

            {!loading && !error && calls.length === 0 && (
              <div style={{
                background: t.surf2, border: `1px solid ${t.bord}`,
                borderRadius: 10, padding: '14px 16px',
                fontSize: 12, color: t.muted, fontStyle: 'italic',
              }}>
                No calls have been made to this lead yet.
              </div>
            )}

            {/* Newest first, as returned by the API */}
            {calls.map((call, idx) => {
              const lines = parseTranscript(call.transcript);
              const sentColor =
                call.sentiment === undefined ? t.muted :
                call.sentiment >= 60 ? '#10B981' :
                call.sentiment >= 35 ? '#F59E0B' : '#EF4444';

              return (
                <div key={call.id} style={{
                  background: t.surf2, border: `1px solid ${t.bord}`,
                  borderRadius: 10, padding: '14px 16px', marginBottom: 10,
                }}>
                  {/* Call header */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 10,
                    paddingBottom: 10, borderBottom: `1px solid ${t.bord}`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.text }}>
                      {idx === 0 ? 'Most recent' : `Attempt ${calls.length - idx}`}
                    </div>
                    <div style={{ fontSize: 10, color: t.muted }}>
                      {call.startedAt.toLocaleString('en-IN', {
                        day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })} · {formatDuration(call.duration)}
                    </div>
                  </div>

                  {/* Sentiment */}
                  {call.sentiment !== undefined && (
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      gap: 8, marginBottom: 10,
                    }}>
                      <span style={{ fontSize: 10, color: t.muted, minWidth: 54 }}>
                        Sentiment
                      </span>
                      <div style={{
                        flex: 1, height: 5, borderRadius: 3,
                        background: dark ? '#1E2438' : '#E5E9F0',
                      }}>
                        <div style={{
                          width: `${call.sentiment}%`, height: '100%',
                          borderRadius: 3, background: sentColor,
                        }} />
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: sentColor, minWidth: 30, textAlign: 'right',
                      }}>
                        {Math.round(call.sentiment)}%
                      </span>
                    </div>
                  )}

                  {/* AI summary */}
                  {call.summary && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{
                        fontSize: 10, color: t.muted, marginBottom: 4,
                        textTransform: 'uppercase', letterSpacing: '.06em',
                      }}>AI summary</div>
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: t.text }}>
                        {call.summary}
                      </div>
                    </div>
                  )}

                  {/* Transcript */}
                  {lines.length > 0 && (
                    <div>
                      <div style={{
                        fontSize: 10, color: t.muted, marginBottom: 6,
                        textTransform: 'uppercase', letterSpacing: '.06em',
                      }}>Transcript</div>
                      {lines.map((line, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, minWidth: 34,
                            paddingTop: 1, flexShrink: 0,
                            color: line.speaker === 'AI' ? '#6366F1' : '#10B981',
                          }}>
                            {line.speaker}
                          </span>
                          <span style={{ fontSize: 12, lineHeight: 1.55, color: t.text }}>
                            {line.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CallData() {
  const { dark } = useTheme();

  // Query state — every change here triggers a refetch
  const [page, setPage]           = useState(1);
  const [filter, setFilter]       = useState<LeadStatus | 'all'>('all');
  const [sortBy, setSortBy]       = useState<LeadSortField>('created_at');
  const [sortDir, setSortDir]     = useState<SortDirection>('desc');

  // Search is held twice: what the user typed, and the debounced value
  // that actually goes to the API. Without this, every keystroke fires
  // a request.
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm]   = useState('');

  // Data state
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

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

  // ── Debounce the search box ─────────────────────────────────────────────────
  // Wait for a pause in typing before committing the term. Typing "Menon"
  // fires one request instead of five.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);          // a new search always starts at page one
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await getLeads({
        skip:    (page - 1) * PAGE_SIZE,
        limit:   PAGE_SIZE,
        status:  filter === 'all' ? undefined : filter,
        search:  searchTerm || undefined,
        sortBy,
        sortDir,
      });

      setLeads(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load leads');
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, filter, searchTerm, sortBy, sortDir]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSort = (key: LeadSortField) => {
    if (sortBy === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleFilter = (value: LeadStatus | 'all') => {
    setFilter(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd   = Math.min(page * PAGE_SIZE, total);

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '.08em', color: t.muted,
    borderBottom: `1px solid ${t.bord}`, whiteSpace: 'nowrap',
    background: t.surf, userSelect: 'none',
  };

  const td: React.CSSProperties = {
    padding: '11px 12px', borderBottom: `1px solid ${t.bord}`, verticalAlign: 'middle',
  };

  const SortArrow = ({ column }: { column: LeadSortField }) => (
    <span style={{
      marginLeft: 4, fontSize: 10,
      opacity: sortBy === column ? 1 : 0.3,
      color: sortBy === column ? '#6366F1' : 'inherit',
    }}>
      {sortBy === column ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <>
      <Topbar title="Call Data" badge={`${total} leads`} />

      {/* Toolbar */}
      <div style={{
        padding: '14px 24px', display: 'flex', alignItems: 'center',
        gap: 10, flexWrap: 'wrap', borderBottom: `1px solid ${t.bord}`,
        background: t.surf, flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 300 }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', fontSize: 13,
            opacity: .5, pointerEvents: 'none',
          }}>⌕</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search name or phone…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px',
              background: t.surf2, border: `1px solid ${t.bord}`,
              borderRadius: 8, color: t.text, fontSize: 12,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          {searchInput !== searchTerm && (
            <span style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)', fontSize: 10, color: t.muted,
            }}>…</span>
          )}
        </div>

        {/* Status filter */}
        <div style={{
          display: 'flex', gap: 3, background: t.surf2,
          borderRadius: 8, padding: 3, flexWrap: 'wrap',
        }}>
          {FILTER_TABS.map(tab => {
            const active = filter === tab.value;
            return (
              <button key={tab.value} onClick={() => handleFilter(tab.value)} style={{
                padding: '5px 11px', borderRadius: 6, border: 'none',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? tab.color : 'transparent',
                color: active ? '#fff' : t.muted,
                transition: 'all .15s',
              }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => exportCSV(leads)}
          disabled={leads.length === 0}
          style={{
            padding: '7px 14px', background: 'transparent',
            border: `1px solid ${t.bord2}`, borderRadius: 8,
            color: t.text, fontSize: 12, fontWeight: 600,
            cursor: leads.length === 0 ? 'not-allowed' : 'pointer',
            opacity: leads.length === 0 ? .4 : 1,
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          ↓ Export page
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', background: t.bg, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 2, background: '#6366F1', opacity: .7, zIndex: 5,
          }} />
        )}

        {error ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 6 }}>
              Couldn&apos;t load leads
            </div>
            <div style={{ fontSize: 12, color: t.muted, marginBottom: 16 }}>{error}</div>
            <button onClick={fetchLeads} style={{
              padding: '8px 18px', background: '#6366F1', border: 'none',
              borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Try again
            </button>
          </div>
        ) : leads.length === 0 && !loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: t.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: .4 }}>◫</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>
              No leads match your filters
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Try a different status or search term
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {SORT_COLUMNS.slice(0, 1).map(col => (
                  <th key={col.key}
                      style={{ ...th, width: col.width, cursor: 'pointer' }}
                      onClick={() => handleSort(col.key)}>
                    {col.label}<SortArrow column={col.key} />
                  </th>
                ))}
                <th style={{ ...th, width: 130 }}>Status</th>
                {SORT_COLUMNS.slice(1).map(col => (
                  <th key={col.key}
                      style={{ ...th, width: col.width, cursor: 'pointer' }}
                      onClick={() => handleSort(col.key)}>
                    {col.label}<SortArrow column={col.key} />
                  </th>
                ))}
                <th style={{ ...th, width: 120 }}>Next retry</th>
                <th style={{ ...th, width: 110 }}>Transcript</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => {
                const meta  = STATUS_META[lead.status];
                const retry = timeUntil(lead.nextRetry);
                const sc    = scoreColor(lead.score);
                const hasBeenCalled = lead.attempts > 0;

                return (
                  <tr key={lead.id} style={{ background: i % 2 === 0 ? t.surf : t.surf2 }}>
                    {/* Lead */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: AVATAR_COLORS[lead.id % AVATAR_COLORS.length],
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                        }}>
                          {initials(lead.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
                            {lead.name}
                          </div>
                          <div style={{
                            fontSize: 11, color: t.muted,
                            fontFamily: 'var(--font-mono, monospace)', marginTop: 1,
                          }}>
                            {lead.phone}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={td}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 20,
                        fontSize: 11, fontWeight: 600,
                        background: meta.bg, color: meta.color,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: meta.color, flexShrink: 0,
                        }} />
                        {meta.label}
                      </span>
                    </td>

                    {/* Attempts */}
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {Array.from({ length: 5 }, (_, d) => (
                          <span key={d} style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: d < lead.attempts ? meta.color : t.surf3,
                          }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: t.muted, marginTop: 3 }}>
                        {lead.attempts} call{lead.attempts !== 1 ? 's' : ''}
                      </div>
                    </td>

                    {/* Last called */}
                    <td style={{ ...td, fontSize: 12, color: t.muted }}>
                      {timeAgo(lead.lastCalled)}
                    </td>

                    {/* Score */}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          flex: 1, height: 4, borderRadius: 2,
                          background: t.surf3, minWidth: 40,
                        }}>
                          <div style={{
                            width: `${lead.score}%`, height: '100%',
                            borderRadius: 2, background: sc,
                          }} />
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: sc,
                          minWidth: 24, textAlign: 'right',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}>
                          {Math.round(lead.score)}
                        </span>
                      </div>
                    </td>

                    {/* Next retry */}
                    <td style={td}>
                      {retry ? (
                        <span style={{
                          fontSize: 11, fontWeight: 500, color: retry.tone,
                          fontFamily: 'var(--font-mono, monospace)',
                        }}>
                          {retry.text}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: t.muted }}>
                          {lead.status === 'agreed' ? 'Complete' :
                           lead.attempts === 0 ? 'Not called' : '—'}
                        </span>
                      )}
                    </td>

                    {/* Transcript */}
                    <td style={td}>
                      {hasBeenCalled ? (
                        <button onClick={() => setDrawerLead(lead)} style={{
                          padding: '4px 10px', borderRadius: 6,
                          border: `1px solid ${t.bord2}`, background: 'transparent',
                          color: t.text, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          View →
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: t.muted, fontStyle: 'italic' }}>
                          No call yet
                        </span>
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
      <div style={{
        padding: '12px 24px', borderTop: `1px solid ${t.bord}`,
        background: t.surf, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: t.muted }}>
          {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
        </span>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            style={{
              width: 30, height: 30, borderRadius: 6,
              border: `1px solid ${t.bord}`, background: 'transparent',
              color: t.text, fontSize: 13,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? .3 : 1,
            }}
          >‹</button>

          <span style={{ fontSize: 12, color: t.muted, padding: '0 8px' }}>
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={{
              width: 30, height: 30, borderRadius: 6,
              border: `1px solid ${t.bord}`, background: 'transparent',
              color: t.text, fontSize: 13,
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? .3 : 1,
            }}
          >›</button>
        </div>
      </div>

      {drawerLead && (
        <TranscriptDrawer
          lead={drawerLead}
          onClose={() => setDrawerLead(null)}
          dark={dark}
        />
      )}
    </>
  );
}
