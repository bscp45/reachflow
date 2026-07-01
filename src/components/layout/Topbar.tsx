'use client';

import { useTheme } from '@/lib/theme-context';

interface TopbarProps {
  title: string;
  badge?: string;
}

export default function Topbar({ title, badge }: TopbarProps) {
  const { dark, toggleTheme } = useTheme();

  const t = {
    surf:  dark ? '#111622' : '#FFFFFF',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  return (
    <header style={{
      height: 60, display: 'flex', alignItems: 'center',
      padding: '0 28px', borderBottom: `1px solid ${t.bord}`,
      background: t.surf, justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: 'rgba(99,102,241,.12)', color: '#6366F1', fontWeight: 600 }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(16,185,129,.12)', fontSize: 11, color: '#10B981', fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          TRAI Compliant
        </div>
        <button onClick={toggleTheme} style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: dark ? '#6366F1' : '#D1D5DB', position: 'relative', transition: 'background .2s',
        }}>
          <span style={{
            position: 'absolute', top: 2, left: dark ? 22 : 2, width: 20, height: 20,
            borderRadius: '50%', background: '#fff', transition: 'left .2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
          }}>
            {dark ? '🌙' : '☀️'}
          </span>
        </button>
      </div>
    </header>
  );
}
