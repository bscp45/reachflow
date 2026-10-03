'use client';

import { useState } from 'react';
import { useTheme } from '@/lib/theme-context';
import { startCall } from '@/lib/api';
import type { Lead } from '@/types';

/**
 * Why this lead cannot be called, or null if it can.
 *
 * Mirrors lead_not_callable() in backend/app/api/calls.py. The backend is
 * still the authority — this only avoids offering a button that would be
 * refused, and lets the UI say why without a round trip.
 */
export function uncallableReason(lead: Lead): string | null {
  if (lead.status === 'calling') {
    return 'A call to this lead is already in progress';
  }
  if (lead.pipelineStage === 'do_not_call') {
    return 'This lead is on the do-not-call register';
  }
  if (lead.pipelineStage === 'unreachable') {
    return 'No answer after the maximum number of attempts';
  }
  if (lead.status === 'pending_approval') {
    return 'Waiting for approval before calling can start';
  }
  if (!lead.phone || lead.phone.replace(/\D/g, '').length < 10) {
    return 'No usable phone number';
  }
  return null;
}

export default function CallButton({
  lead,
  canCall,
  windowReason,
  onCallStarted,
}: {
  lead: Lead;
  canCall: boolean;          // does this user have permission
  windowReason?: string;     // set when outside the calling window
  onCallStarted: () => void;
}) {
  const { dark } = useTheme();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  const t = {
    surf:  dark ? '#111622' : '#FFFFFF',
    bord:  dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.13)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  if (!canCall) return null;

  // Lead-specific reasons take priority over the window — "already calling"
  // is more useful than "outside calling hours" for a lead mid-call.
  const blocked = uncallableReason(lead) ?? windowReason ?? null;

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await startCall(lead.id);
      onCallStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the call');
    } finally {
      setBusy(false);
    }
  };

  // ── Blocked — muted marker with the reason on hover ─────────────────────────
  if (blocked) {
    return (
      <span
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%',
          border: `1px solid ${t.bord}`, color: t.muted,
          fontSize: 11, cursor: 'help', userSelect: 'none',
        }}>
          ⊘
        </span>

        {hover && (
          <span style={{
            position: 'absolute', bottom: '125%', right: 0, zIndex: 20,
            background: t.surf, border: `1px solid ${t.bord}`,
            borderRadius: 7, padding: '7px 10px',
            fontSize: 11, color: t.text, lineHeight: 1.45,
            width: 190, textAlign: 'left',
            boxShadow: '0 6px 18px rgba(0,0,0,.18)',
            pointerEvents: 'none',
          }}>
            {blocked}
          </span>
        )}
      </span>
    );
  }

  // ── Callable ────────────────────────────────────────────────────────────────
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          padding: '4px 10px', borderRadius: 6,
          border: '1px solid rgba(16,185,129,.35)',
          background: busy ? 'transparent' : 'rgba(16,185,129,.1)',
          color: '#10B981', fontSize: 11, fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap', opacity: busy ? .6 : 1,
        }}
      >
        {busy ? 'Calling…' : '📞 Call'}
      </button>

      {/* The backend runs the real checks, so a click can still be refused —
          an NDNC hit or the window closing between load and click. */}
      {error && (
        <span
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => setError(null)}
          style={{
            marginLeft: 6, fontSize: 11, color: '#EF4444',
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          ⚠
          {hover && (
            <span style={{
              position: 'absolute', bottom: '125%', right: 0, zIndex: 20,
              background: t.surf, border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 7, padding: '7px 10px',
              fontSize: 11, color: '#EF4444', lineHeight: 1.45,
              width: 200, textAlign: 'left',
              boxShadow: '0 6px 18px rgba(0,0,0,.18)',
              pointerEvents: 'none',
            }}>
              {error}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
