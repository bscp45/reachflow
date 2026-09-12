'use client';

import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { getCampaignStats, getClients } from '@/lib/api';
import type { CampaignStats, Client } from '@/types';

export default function Dashboard() {
  const { dark } = useTheme();
  const { isReachFlowStaff } = useAuth();

  const [stats, setStats]     = useState<CampaignStats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const t = {
    bg:    dark ? '#0A0D14' : '#F0F3FA',
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Fire both requests together rather than one after the other
        const [statsData, clientsData] = await Promise.all([
          getCampaignStats(),
          getClients(),
        ]);

        // Guard against setting state after the component unmounted
        if (cancelled) return;

        setStats(statsData);
        setClients(clientsData);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const pct = (n: number, total: number) =>
    total ? Math.round((n / total) * 100) : 0;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <Topbar title="Dashboard" />
        <div style={{
          flex: 1, background: t.bg, padding: 28,
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
            gap: 14,
          }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                background: t.surf,
                border: `1px solid ${t.bord}`,
                borderRadius: 14,
                padding: '16px 18px',
                height: 92,
                opacity: 0.5,
              }}>
                <div style={{
                  width: 48, height: 26, borderRadius: 6,
                  background: t.surf2, marginBottom: 8,
                }} />
                <div style={{
                  width: 80, height: 10, borderRadius: 4,
                  background: t.surf2,
                }} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: t.muted }}>Loading dashboard…</div>
        </div>
      </>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <>
        <Topbar title="Dashboard" />
        <div style={{
          flex: 1, background: t.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 6 }}>
              Couldn&apos;t load the dashboard
            </div>
            <div style={{ fontSize: 12, color: t.muted, marginBottom: 16, lineHeight: 1.6 }}>
              {error}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 18px', background: '#6366F1', border: 'none',
                borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!stats) return null;

  // ── Loaded ──────────────────────────────────────────────────────────────────
  const cards = [
    { label: 'Total Leads', value: stats.total,    color: '#6366F1', sub: 'uploaded' },
    { label: 'Calls Made',  value: stats.called,   color: '#3B82F6', sub: `${pct(stats.called, stats.total)}% of total` },
    { label: 'Agreed',      value: stats.agreed,   color: '#10B981', sub: `${pct(stats.agreed, stats.called)}% success` },
    { label: 'No Answer',   value: stats.noAnswer, color: '#F59E0B', sub: 'retry in 2 hrs' },
    { label: 'Declined',    value: stats.declined, color: '#EF4444', sub: 'retry in 30 days' },
    { label: 'Pending',     value: stats.pending,  color: '#8B5CF6', sub: 'not yet called' },
  ];

  return (
    <>
      <Topbar title="Dashboard" badge={`${stats.total} leads`} />

      <div style={{
        flex: 1, overflow: 'auto', background: t.bg, padding: 28,
        display: 'flex', flexDirection: 'column', gap: 24, minHeight: 0,
      }}>

        {/* Stat cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
          gap: 14,
        }}>
          {cards.map(card => (
            <div key={card.label} style={{
              background: t.surf,
              borderLeft: `1px solid ${t.bord}`,
              borderRight: `1px solid ${t.bord}`,
              borderBottom: `1px solid ${t.bord}`,
              borderTop: `3px solid ${card.color}`,
              borderRadius: 14,
              padding: '16px 18px',
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: card.color, lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: t.text }}>
                {card.label}
              </div>
              <div style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Campaign progress */}
        <div style={{
          background: t.surf, border: `1px solid ${t.bord}`,
          borderRadius: 14, padding: '18px 20px',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginBottom: 10,
            fontSize: 13, fontWeight: 600, color: t.text,
          }}>
            <span>Campaign progress</span>
            <span style={{ color: t.muted }}>
              {pct(stats.called, stats.total)}% called
            </span>
          </div>

          <div style={{
            height: 10, borderRadius: 6, background: t.surf2,
            overflow: 'hidden', display: 'flex',
          }}>
            {[
              { val: stats.agreed,   color: '#10B981' },
              { val: stats.declined, color: '#EF4444' },
              { val: stats.noAnswer, color: '#F59E0B' },
            ].map((seg, i) => (
              <div key={i} style={{
                width: `${pct(seg.val, stats.total)}%`,
                background: seg.color,
                height: '100%',
              }} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {[
              { label: 'Agreed',    color: '#10B981' },
              { label: 'Declined',  color: '#EF4444' },
              { label: 'No answer', color: '#F59E0B' },
              { label: 'Pending',   color: dark ? '#334155' : '#CBD5E1' },
            ].map(leg => (
              <div key={leg.label} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: t.muted,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: leg.color, display: 'inline-block',
                }} />
                {leg.label}
              </div>
            ))}
          </div>
        </div>

        {/* Client overview — ReachFlow staff only */}
        {isReachFlowStaff && (
          <div style={{
            background: t.surf, border: `1px solid ${t.bord}`,
            borderRadius: 14, padding: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: t.text }}>
              Client overview
            </div>

            {clients.length === 0 ? (
              <div style={{ fontSize: 12, color: t.muted, padding: '8px 0' }}>
                No clients assigned to you yet.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                gap: 12,
              }}>
                {clients.map((c, i) => {
                  const colors = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6'];
                  const color = colors[i % colors.length];
                  return (
                    <div key={c.id} style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: t.surf2,
                      borderTop: `1px solid ${t.bord}`,
                      borderRight: `1px solid ${t.bord}`,
                      borderBottom: `1px solid ${t.bord}`,
                      borderLeft: `3px solid ${color}`,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: t.text }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 11, color: t.muted }}>
                        {c.email}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}