'use client';

import { useState, useRef, useCallback } from 'react';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { uploadLeads, downloadTemplate } from '@/lib/api';
import type { UploadResult } from '@/lib/api';
import type { Client } from '@/types';

const ACCEPTED = ['.csv', '.xlsx', '.xlsm'];
const MAX_MB = 5;

export default function LeadUpload({
  clients,
  onUploaded,
}: {
  clients: Client[];          // only populated for ReachFlow staff
  onUploaded: () => void;     // refresh the dashboard stats
}) {
  const { dark } = useTheme();
  const { user, isReachFlowStaff } = useAuth();

  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]       = useState<UploadResult | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [clientId, setClientId]   = useState<number | ''>('');

  const fileRef = useRef<HTMLInputElement>(null);

  const t = {
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    bord2: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.13)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  // Client users upload into their own account and never choose.
  // Staff aren't tied to one client, so they must say which.
  const needsClientPicker = isReachFlowStaff;
  const canUpload = user?.permissions?.canUploadLeads ?? false;

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);

    const name = file.name.toLowerCase();
    if (!ACCEPTED.some(ext => name.endsWith(ext))) {
      setError(`Only ${ACCEPTED.join(', ')} files are accepted`);
      return;
    }

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is larger than ${MAX_MB} MB`);
      return;
    }

    if (needsClientPicker && clientId === '') {
      setError('Choose which client these leads belong to');
      return;
    }

    setUploading(true);
    try {
      const res = await uploadLeads(
        file,
        needsClientPicker ? Number(clientId) : undefined,
      );
      setResult(res);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [clientId, needsClientPicker, onUploaded]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  if (!canUpload) {
    return (
      <div style={{
        background: t.surf, border: `1px solid ${t.bord}`,
        borderRadius: 14, padding: 20,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>
          Upload leads
        </div>
        <div style={{ fontSize: 12, color: t.muted }}>
          You don&apos;t have permission to upload leads. Ask your account owner
          if you need it.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: t.surf, border: `1px solid ${t.bord}`,
      borderRadius: 14, padding: 20,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
            Upload leads
          </div>
          <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>
            CSV or Excel, using the template columns
          </div>
        </div>
        <button
          onClick={() => downloadTemplate().catch(() => setError('Could not download the template'))}
          style={{
            padding: '6px 12px', background: 'transparent',
            border: `1px solid ${t.bord2}`, borderRadius: 7,
            color: t.text, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          ↓ Template
        </button>
      </div>

      {/* Staff pick a client; client users never see this */}
      {needsClientPicker && (
        <div>
          <label style={{
            fontSize: 11, fontWeight: 600, color: t.text,
            display: 'block', marginBottom: 5,
          }}>
            Upload into
          </label>
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value === '' ? '' : Number(e.target.value))}
            style={{
              width: '100%', padding: '8px 10px',
              background: t.surf2, border: `1px solid ${t.bord}`,
              borderRadius: 8, color: t.text, fontSize: 12,
              outline: 'none', fontFamily: 'inherit',
            }}
          >
            <option value="">Choose a client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#6366F1' : t.bord2}`,
          borderRadius: 12, padding: '26px 16px',
          textAlign: 'center', cursor: uploading ? 'wait' : 'pointer',
          background: dragging
            ? (dark ? 'rgba(99,102,241,.08)' : 'rgba(99,102,241,.04)')
            : t.surf2,
          transition: 'all .15s',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(',')}
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {uploading ? (
          <div style={{ fontSize: 13, color: t.muted }}>
            Reading the file…
          </div>
        ) : (
          <>
            <div style={{ fontSize: 24, opacity: .45 }}>⬆</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginTop: 6 }}>
              Drop a file here
            </div>
            <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>
              or click to browse · csv, xlsx
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,.1)',
          border: '1px solid rgba(239,68,68,.25)',
          borderRadius: 8, padding: '10px 12px',
          fontSize: 12, color: '#EF4444', lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          background: result.imported > 0
            ? 'rgba(16,185,129,.08)'
            : 'rgba(245,158,11,.08)',
          border: `1px solid ${result.imported > 0
            ? 'rgba(16,185,129,.25)'
            : 'rgba(245,158,11,.25)'}`,
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: result.imported > 0 ? '#10B981' : '#D97706',
          }}>
            {result.message}
          </div>

          {result.needsApproval && result.imported > 0 && (
            <div style={{ fontSize: 11, color: t.muted, marginTop: 6, lineHeight: 1.5 }}>
              These leads can&apos;t be called until your account owner approves them.
            </div>
          )}

          {/* Which rows didn't make it, and why. A bare "3 skipped" with no
              explanation leaves the user with nothing to fix. */}
          {result.skipped.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{
                fontSize: 11, color: t.muted, cursor: 'pointer',
                userSelect: 'none',
              }}>
                {result.skipped.length} row{result.skipped.length !== 1 ? 's' : ''} skipped — see why
              </summary>
              <div style={{
                marginTop: 8, maxHeight: 180, overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                {result.skipped.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, fontSize: 11,
                    padding: '5px 8px', borderRadius: 6,
                    background: dark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)',
                  }}>
                    <span style={{
                      color: t.muted, minWidth: 46, flexShrink: 0,
                      fontFamily: 'var(--font-mono, monospace)',
                    }}>
                      row {s.row}
                    </span>
                    <span style={{ color: t.text, flex: 1 }}>
                      {s.reason}
                      {s.detail && (
                        <span style={{ color: t.muted }}> — {s.detail}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
