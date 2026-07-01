'use client';

import { useState, useMemo } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useTheme } from '@/lib/theme-context';
import { MOCK_LEADS } from '@/lib/mock-data';
import type { Lead } from '@/types';

// ── Pipeline stages ───────────────────────────────────────────────────────────
const STAGES = [
  { id: 'contacted',   label: 'Agreed to talk',   color: '#6366F1', desc: 'Lead picked up and expressed interest' },
  { id: 'interested',  label: 'High interest',     color: '#3B82F6', desc: 'Score above 70 — strong conversion signal' },
  { id: 'follow_up',   label: 'Follow-up due',     color: '#F59E0B', desc: 'Awaiting advisor callback' },
  { id: 'converted',   label: 'Converted',         color: '#10B981', desc: 'Committed to invest' },
];

// Assign a pipeline stage based on lead score
function getStage(lead: Lead): string {
  if (lead.score >= 88) return 'converted';
  if (lead.score >= 78) return 'follow_up';
  if (lead.score >= 70) return 'interested';
  return 'contacted';
}

function timeAgo(d: Date | null): string {
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#4F46E5','#0891B2','#059669','#D97706','#DC2626','#7C3AED','#0284C7','#16A34A'];

// ── Lead card ─────────────────────────────────────────────────────────────────
function LeadCard({ lead, dark }: { lead: Lead; dark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const t = {
    surf:  dark ? '#181E2E' : '#FFFFFF',
    surf2: dark ? '#1E2438' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };
  const sc = lead.score >= 70 ? '#10B981' : lead.score >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{ background: t.surf, border: `1px solid ${t.bord}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'border .15s' }}
      onClick={() => setExpanded(p => !p)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: AVATAR_COLORS[lead.id % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {initials(lead.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name}</div>
          <div style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{lead.phone}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: sc, background: sc + '20', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>{lead.score}</div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.bord}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: t.muted }}>Last called</span>
            <span style={{ color: t.text, fontWeight: 500 }}>{timeAgo(lead.lastCalled)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: t.muted }}>Call attempts</span>
            <span style={{ color: t.text, fontWeight: 500 }}>{lead.attempts}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: t.muted }}>Sentiment</span>
            <span style={{ color: sc, fontWeight: 600 }}>{lead.sentiment ?? 50}%</span>
          </div>
          <button style={{ marginTop: 4, padding: '6px 0', background: '#6366F1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Mark as converted →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Progress() {
  const { dark } = useTheme();
  const [search, setSearch] = useState('');

  const t = {
    bg:    dark ? '#0A0D14' : '#F0F3FA',
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  // Only agreed leads go into the pipeline
  const agreedLeads = useMemo(() => {
    const q = search.toLowerCase();
    return MOCK_LEADS
      .filter(l => l.status === 'agreed')
      .filter(l => !q || l.name.toLowerCase().includes(q) || l.phone.includes(q));
  }, [search]);

  // Group by stage
  const grouped = useMemo(() => {
    const map: Record<string, Lead[]> = { contacted: [], interested: [], follow_up: [], converted: [] };
    agreedLeads.forEach(l => map[getStage(l)].push(l));
    return map;
  }, [agreedLeads]);

  const total = agreedLeads.length;
  const converted = grouped['converted'].length;
  const conversionRate = total ? Math.round((converted / total) * 100) : 0;

  return (
    <>
      <Topbar title="Progress" badge={`${total} agreed leads`} />

      {/* Summary bar */}
      <div style={{ padding: '14px 24px', background: t.surf, borderBottom: `1px solid ${t.bord}`, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', flexShrink: 0 }}>
        {STAGES.map(stage => (
          <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: t.muted }}>{stage.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>{grouped[stage.id].length}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, opacity: .5 }}>⌕</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search leads…"
              style={{ padding: '6px 10px 6px 26px', background: t.surf2, border: `1px solid ${t.bord}`, borderRadius: 7, color: t.text, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 180 }}
            />
          </div>
          {/* Conversion rate badge */}
          <div style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(16,185,129,.12)', fontSize: 12, color: '#10B981', fontWeight: 700 }}>
            {conversionRate}% converted
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24, background: t.bg, minHeight: 0 }}>
        {total === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: t.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: .4 }}>◈</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>No agreed leads yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Leads that agree during a call will appear here</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'start' }}>
            {STAGES.map(stage => (
              <div key={stage.id}>
                {/* Column header */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{stage.label}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, background: stage.color + '18', borderRadius: 20, padding: '1px 8px' }}>
                      {grouped[stage.id].length}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: t.muted }}>{stage.desc}</div>
                  {/* Progress bar showing proportion */}
                  <div style={{ height: 3, borderRadius: 2, background: t.surf2, marginTop: 8 }}>
                    <div style={{ height: '100%', width: total ? `${(grouped[stage.id].length / total) * 100}%` : '0%', background: stage.color, borderRadius: 2, transition: 'width .4s' }} />
                  </div>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {grouped[stage.id].length === 0 ? (
                    <div style={{ padding: '20px 12px', textAlign: 'center', border: `1px dashed ${t.bord}`, borderRadius: 10, fontSize: 11, color: t.muted }}>
                      No leads here
                    </div>
                  ) : (
                    grouped[stage.id].map(lead => (
                      <LeadCard key={lead.id} lead={lead} dark={dark} />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom stats bar */}
      <div style={{ padding: '12px 24px', borderTop: `1px solid ${t.bord}`, background: t.surf, display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: t.muted }}>Pipeline summary</span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: t.surf2, overflow: 'hidden', display: 'flex' }}>
          {STAGES.map(stage => (
            <div key={stage.id} style={{
              width: total ? `${(grouped[stage.id].length / total) * 100}%` : '0%',
              background: stage.color, height: '100%', transition: 'width .4s',
            }} />
          ))}
        </div>
        <span style={{ fontSize: 12, color: t.muted }}>{total} total agreed</span>
      </div>
    </>
  );
}
