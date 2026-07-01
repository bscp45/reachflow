'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTheme } from '@/lib/theme-context';

const NAV = [
  { href: '/',           icon: '⊞', label: 'Dashboard' },
  { href: '/call-data',  icon: '◫', label: 'Call Data'  },
  { href: '/progress',   icon: '◈', label: 'Progress'   },
  { href: '/settings',   icon: '◉', label: 'Settings'   },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { dark } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const t = {
    surf:   dark ? '#111622' : '#FFFFFF',
    bord:   dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    text:   dark ? '#E8EAF0' : '#111827',
    muted:  dark ? '#6B7280' : '#6B7280',
    surf2:  dark ? '#181E2E' : '#F0F3FA',
  };

  return (
    <aside style={{
      width: collapsed ? 64 : 220,
      background: t.surf,
      borderRight: `1px solid ${t.bord}`,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width .25s cubic-bezier(.4,0,.2,1)',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#6366F1,#10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" fill="white"/>
          </svg>
        </div>
        {!collapsed && <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.3px', whiteSpace: 'nowrap', color: t.text }}>ReachFlow</span>}
      </div>

      {/* Nav */}
      {NAV.map(item => {
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', textDecoration: 'none',
            borderLeft: `2px solid ${active ? '#6366F1' : 'transparent'}`,
            background: active ? 'rgba(99,102,241,.12)' : 'transparent',
            color: active ? '#6366F1' : t.muted,
            fontSize: 13, fontWeight: active ? 600 : 400,
            transition: 'all .15s',
          }}>
            <span style={{ fontSize: 15, flexShrink: 0, width: 20, textAlign: 'center' }}>{item.icon}</span>
            {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* User card */}
      {!collapsed && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${t.bord}` }}>
          <div style={{ fontSize: 10, color: t.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Signed in as</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>SA</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>Super Admin</div>
              <div style={{ fontSize: 10, color: t.muted }}>All clients visible</div>
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(p => !p)} style={{
        padding: '12px 16px', background: 'transparent', border: 'none',
        borderTop: `1px solid ${t.bord}`, color: t.muted, cursor: 'pointer',
        fontSize: 14, textAlign: collapsed ? 'center' : 'right',
      }}>
        {collapsed ? '▶' : '◀'}
      </button>
    </aside>
  );
}
