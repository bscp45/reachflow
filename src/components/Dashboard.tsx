'use client';
// Full Dashboard component — move your dashboard-preview.html logic here
// For now this re-exports the JSX version you already have

// TODO: paste your Dashboard.jsx content here,
// add 'use client' at the top, and update imports to use:
//   import { useTheme } from '@/lib/theme-context'
//   import Topbar from '@/components/layout/Topbar'
//   import { getCampaignStats, getLeads, getClients } from '@/lib/api'

import Topbar from '@/components/layout/Topbar';
import { useTheme } from '@/lib/theme-context';
import { MOCK_STATS, MOCK_CLIENTS, MOCK_LEADS } from '@/lib/mock-data';

export default function Dashboard() {
  const { dark } = useTheme();
  const t = {
    bg:    dark ? '#0A0D14' : '#F0F3FA',
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  const pct = (n: number, total: number) => total ? Math.round((n / total) * 100) : 0;

  return (
    <>
      <Topbar title="Dashboard" />
      <div style={{ flex: 1, overflow: 'auto', background: t.bg, padding: 28, display: 'flex', flexDirection: 'column', gap: 24, minHeight: 0 }}>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
          {[
            { label: 'Total Leads', value: MOCK_STATS.total,    color: '#6366F1', sub: 'uploaded' },
            { label: 'Calls Made',  value: MOCK_STATS.called,   color: '#3B82F6', sub: `${pct(MOCK_STATS.called, MOCK_STATS.total)}% of total` },
            { label: 'Agreed',      value: MOCK_STATS.agreed,   color: '#10B981', sub: `${pct(MOCK_STATS.agreed, MOCK_STATS.called)}% success` },
            { label: 'No Answer',   value: MOCK_STATS.noAnswer, color: '#F59E0B', sub: 'retry in 2 hrs' },
            { label: 'Declined',    value: MOCK_STATS.declined, color: '#EF4444', sub: 'retry in 30 days' },
            { label: 'Pending',     value: MOCK_STATS.pending,  color: '#8B5CF6', sub: 'not yet called' },
          ].map(card => (
            <div key={card.label} style={{ background: t.surf, border: `1px solid ${t.bord}`, borderRadius: 14, padding: '16px 18px', borderTop: `3px solid ${card.color}` }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: t.text }}>{card.label}</div>
              <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ background: t.surf, border: `1px solid ${t.bord}`, borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13, fontWeight: 600, color: t.text }}>
            <span>Campaign progress</span>
            <span style={{ color: t.muted }}>{pct(MOCK_STATS.called, MOCK_STATS.total)}% called</span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: t.surf2, overflow: 'hidden', display: 'flex' }}>
            {[
              { val: MOCK_STATS.agreed,   color: '#10B981' },
              { val: MOCK_STATS.declined, color: '#EF4444' },
              { val: MOCK_STATS.noAnswer, color: '#F59E0B' },
            ].map((seg, i) => (
              <div key={i} style={{ width: `${pct(seg.val, MOCK_STATS.total)}%`, background: seg.color, height: '100%' }} />
            ))}
          </div>
        </div>

        {/* Client overview */}
        <div style={{ background: t.surf, border: `1px solid ${t.bord}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: t.text }}>Client overview — all accounts</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            {MOCK_CLIENTS.map((c, i) => {
              const colors = ['#6366F1','#10B981','#F59E0B','#3B82F6'];
              const color = colors[i % colors.length];
              return (
                <div key={c.id} style={{ padding: '12px 14px', borderRadius: 10, background: t.surf2, border: `1px solid ${t.bord}`, borderLeft: `3px solid ${color}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: t.text }}>{c.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.muted }}>
                    <span>{c.totalLeads} leads</span>
                    <span style={{ color, fontWeight: 700 }}>{c.successRate}% success</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: t.bord, marginTop: 8 }}>
                    <div style={{ height: '100%', width: `${c.successRate}%`, background: color, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
}
