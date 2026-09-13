'use client';

import { useState, useEffect, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { getPipelineBoard, updateLeadStage } from '@/lib/api';
import {
  STAGE_META,
  SELECTABLE_STAGES,
  canMoveStage,
  type Lead,
  type PipelineBoard,
  type PipelineStage,
} from '@/types';

const AVATAR_COLORS = [
  '#4F46E5', '#0891B2', '#059669', '#D97706',
  '#DC2626', '#7C3AED', '#0284C7', '#16A34A',
];

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function timeAgo(d: Date | null): string {
  if (!d) return 'never';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function scoreColor(s: number): string {
  return s >= 70 ? '#10B981' : s >= 40 ? '#F59E0B' : '#EF4444';
}

// ── Move dialog ───────────────────────────────────────────────────────────────

function MoveDialog({
  lead, onClose, onMoved, dark,
}: {
  lead: Lead;
  onClose: () => void;
  onMoved: () => void;
  dark: boolean;
}) {
  const [stage, setStage]     = useState<PipelineStage>(lead.pipelineStage);
  const [note, setNote]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const t = {
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  const submit = async () => {
    if (stage === lead.pipelineStage) { onClose(); return; }

    setSaving(true);
    setError(null);
    try {
      await updateLeadStage(lead.id, stage, note.trim() || undefined);
      onMoved();
      onClose();
    } catch (err) {
      // The backend guards return useful messages — show them verbatim
      setError(err instanceof Error ? err.message : 'Could not move this lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 200,
      }} />

      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)', zIndex: 201,
        width: 'min(420px, calc(100vw - 32px))',
        background: t.surf, border: `1px solid ${t.bord}`,
        borderRadius: 14, padding: 22,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
          Move {lead.name}
        </div>
        <div style={{ fontSize: 12, color: t.muted, marginTop: 3, marginBottom: 18 }}>
          Currently in {STAGE_META[lead.pipelineStage].label}
          {lead.attempts === 0 && ' · never been called'}
        </div>

        <label style={{
          fontSize: 11, fontWeight: 600, color: t.text,
          display: 'block', marginBottom: 6,
        }}>
          Move to
        </label>
        <select
          value={stage}
          onChange={e => setStage(e.target.value as PipelineStage)}
          style={{
            width: '100%', padding: '10px 12px', marginBottom: 14,
            background: t.surf2, border: `1px solid ${t.bord}`,
            borderRadius: 8, color: t.text, fontSize: 13,
            outline: 'none', fontFamily: 'inherit',
          }}
        >
          {SELECTABLE_STAGES.map(s => (
            <option key={s} value={s}>
              {STAGE_META[s].label}{STAGE_META[s].terminal ? '  (ends pipeline)' : ''}
            </option>
          ))}
        </select>

        <label style={{
          fontSize: 11, fontWeight: 600, color: t.text,
          display: 'block', marginBottom: 6,
        }}>
          Note <span style={{ fontWeight: 400, color: t.muted }}>— optional, kept in the audit log</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Why is this lead moving?"
          style={{
            width: '100%', padding: '10px 12px', marginBottom: 14,
            background: t.surf2, border: `1px solid ${t.bord}`,
            borderRadius: 8, color: t.text, fontSize: 12,
            outline: 'none', fontFamily: 'inherit', resize: 'vertical',
          }}
        />

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.1)',
            border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 8, padding: '10px 12px', marginBottom: 14,
            fontSize: 12, color: '#EF4444', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{
            padding: '9px 16px', background: 'transparent',
            border: `1px solid ${t.bord}`, borderRadius: 8,
            color: t.text, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{
            padding: '9px 18px', background: '#6366F1', border: 'none',
            borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? .6 : 1, fontFamily: 'inherit',
          }}>
            {saving ? 'Moving…' : 'Move lead'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Lead card ─────────────────────────────────────────────────────────────────

function LeadCard({
  lead, onMove, canMove, dark,
}: {
  lead: Lead;
  onMove: (l: Lead) => void;
  canMove: boolean;
  dark: boolean;
}) {
  const t = {
    surf:  dark ? '#181E2E' : '#FFFFFF',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  const sc = scoreColor(lead.score);

  return (
    <div style={{
      background: t.surf, border: `1px solid ${t.bord}`,
      borderRadius: 10, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: AVATAR_COLORS[lead.id % AVATAR_COLORS.length],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: '#fff',
        }}>
          {initials(lead.name)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: t.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {lead.name}
          </div>
          <div style={{
            fontSize: 10, color: t.muted,
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            {lead.phone}
          </div>
        </div>

        <div style={{
          fontSize: 11, fontWeight: 700, color: sc,
          background: `${sc}1F`, borderRadius: 20,
          padding: '2px 7px', flexShrink: 0,
        }}>
          {Math.round(lead.score)}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 9, paddingTop: 9, borderTop: `1px solid ${t.bord}`,
      }}>
        <span style={{ fontSize: 10, color: t.muted }}>
          {lead.attempts} call{lead.attempts !== 1 ? 's' : ''} · {timeAgo(lead.lastCalled)}
        </span>

        {canMove && (
          <button onClick={() => onMove(lead)} style={{
            padding: '3px 9px', background: 'transparent',
            border: `1px solid ${t.bord}`, borderRadius: 6,
            color: '#6366F1', fontSize: 10, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Move →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Progress() {
  const { dark } = useTheme();
  const { user } = useAuth();

  const [board, setBoard]     = useState<PipelineBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [moving, setMoving]   = useState<Lead | null>(null);

  const canMove = user ? canMoveStage(user.role) : false;

  const t = {
    bg:    dark ? '#0A0D14' : '#F0F3FA',
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setBoard(await getPipelineBoard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <>
        <Topbar title="Progress" />
        <div style={{
          flex: 1, background: t.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: t.muted,
        }}>
          Loading pipeline…
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Topbar title="Progress" />
        <div style={{
          flex: 1, background: t.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 340 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 6 }}>
              Couldn&apos;t load the pipeline
            </div>
            <div style={{ fontSize: 12, color: t.muted, marginBottom: 16 }}>{error}</div>
            <button onClick={load} style={{
              padding: '8px 18px', background: '#6366F1', border: 'none',
              borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!board) return null;

  const activeTotal = board.columns.reduce((sum, c) => sum + c.count, 0);
  const invested = board.columns.find(c => c.stage === 'invested')?.count ?? 0;
  const conversion = activeTotal > 0 ? Math.round((invested / board.total) * 100) : 0;

  return (
    <>
      <Topbar title="Progress" badge={`${board.total} leads`} />

      {/* Summary strip */}
      <div style={{
        padding: '12px 24px', background: t.surf,
        borderBottom: `1px solid ${t.bord}`,
        display: 'flex', alignItems: 'center', gap: 20,
        flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: t.muted }}>
          {activeTotal} in pipeline
        </span>
        <div style={{
          flex: 1, minWidth: 120, height: 6, borderRadius: 3,
          background: t.surf2, overflow: 'hidden', display: 'flex',
        }}>
          {board.columns.map(c => (
            <div key={c.stage} style={{
              width: `${board.total ? (c.count / board.total) * 100 : 0}%`,
              background: STAGE_META[c.stage].color,
              height: '100%',
            }} />
          ))}
        </div>
        <span style={{
          padding: '4px 11px', borderRadius: 20,
          background: 'rgba(16,185,129,.12)',
          fontSize: 12, color: '#10B981', fontWeight: 700,
        }}>
          {conversion}% invested
        </span>
      </div>

      {/* Board */}
      <div style={{ flex: 1, overflow: 'auto', background: t.bg, padding: 20, minHeight: 0 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(190px, 1fr))',
          gap: 14,
          alignItems: 'start',
          minWidth: 1180,
        }}>
          {board.columns.map(col => {
            const meta = STAGE_META[col.stage];
            return (
              <div key={col.stage}>
                {/* Column header */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: 3,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 9, height: 9, borderRadius: '50%',
                        background: meta.color, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
                        {meta.label}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: meta.color,
                      background: `${meta.color}1F`,
                      borderRadius: 20, padding: '1px 8px',
                    }}>
                      {col.count}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: t.muted }}>{meta.desc}</div>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {col.leads.length === 0 ? (
                    <div style={{
                      padding: '18px 10px', textAlign: 'center',
                      border: `1px dashed ${t.bord}`, borderRadius: 10,
                      fontSize: 11, color: t.muted,
                    }}>
                      Empty
                    </div>
                  ) : (
                    <>
                      {col.leads.map(lead => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          onMove={setMoving}
                          canMove={canMove}
                          dark={dark}
                        />
                      ))}
                      {col.count > col.leads.length && (
                        <div style={{
                          fontSize: 10, color: t.muted,
                          textAlign: 'center', padding: '6px 0',
                        }}>
                          + {col.count - col.leads.length} more
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal stages */}
      <div style={{
        padding: '12px 24px', borderTop: `1px solid ${t.bord}`,
        background: t.surf, display: 'flex', alignItems: 'center',
        gap: 18, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: t.muted,
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>
          Not progressing
        </span>
        {board.terminal.map(term => {
          const meta = STAGE_META[term.stage];
          return (
            <div key={term.stage} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: 2,
                background: meta.color, flexShrink: 0,
              }} />
              <span style={{ fontSize: 11, color: t.muted }}>{meta.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>
                {term.count}
              </span>
            </div>
          );
        })}
      </div>

      {moving && (
        <MoveDialog
          lead={moving}
          onClose={() => setMoving(null)}
          onMoved={load}
          dark={dark}
        />
      )}
    </>
  );
}
