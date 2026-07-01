'use client';

import { useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { useTheme } from '@/lib/theme-context';
import type { UserRole } from '@/types';

// ── Mock data — replace with real API calls later ─────────────────────────────
const MOCK_PROFILE = {
  name: 'Super Admin',
  email: 'admin@reachflow.in',
  phone: '+91 98765 43210',
  company: 'ReachFlow',
};

const MOCK_TEAM = [
  { id: 1, name: 'Super Admin',  email: 'admin@reachflow.in',       role: 'super_admin'   as UserRole, lastActive: 'Active now' },
  { id: 2, name: 'Rahul Mehta',  email: 'rahul@finedge.in',         role: 'client_admin'  as UserRole, lastActive: '2h ago' },
  { id: 3, name: 'Anita Desai',  email: 'anita@finedge.in',         role: 'client_viewer'  as UserRole, lastActive: '1d ago' },
  { id: 4, name: 'Vikram Shah',  email: 'vikram@bluestar.in',       role: 'client_admin'  as UserRole, lastActive: '4h ago' },
];

const ROLE_META: Record<UserRole, { label: string; color: string; desc: string }> = {
  super_admin:    { label: 'Super Admin',    color: '#6366F1', desc: 'Sees all clients, full access' },
  client_admin:   { label: 'Client Admin',   color: '#10B981', desc: 'Manages their own leads & team' },
  client_viewer:  { label: 'Client Viewer',  color: '#F59E0B', desc: 'Read-only access to their data' },
};

// ── Toggle switch component ────────────────────────────────────────────────────
function Toggle({ on, onChange, dark }: { on: boolean; onChange: () => void; dark: boolean }) {
  return (
    <button onClick={onChange} style={{
      width: 40, height: 22, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: on ? '#6366F1' : (dark ? '#2A3142' : '#D1D5DB'),
      position: 'relative', transition: 'background .2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18,
        borderRadius: '50%', background: '#fff', transition: 'left .2s',
      }} />
    </button>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, desc, children, t }: { title: string; desc?: string; children: React.ReactNode; t: any }) {
  return (
    <div style={{ background: t.surf, border: `1px solid ${t.bord}`, borderRadius: 14, padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children, t }: { label: string; children: React.ReactNode; t: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${t.bord}` }}>
      <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Settings() {
  const { dark, toggleTheme } = useTheme();

  // Local state — wire to real API later
  const [callStart, setCallStart]       = useState(9);
  const [callEnd, setCallEnd]           = useState(21);
  const [noAnswerRetry, setNoAnswerRetry] = useState(2);
  const [declinedRetry, setDeclinedRetry] = useState(30);
  const [ndncEnabled, setNdncEnabled]   = useState(true);
  const [vapiConnected, setVapiConnected] = useState(true);
  const [openaiConnected, setOpenaiConnected] = useState(true);
  const [twoFactor, setTwoFactor]       = useState(false);
  const [activeTab, setActiveTab]       = useState<'profile'|'compliance'|'team'|'integrations'|'security'>('profile');

  const t = {
    bg:    dark ? '#0A0D14' : '#F0F3FA',
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)',
    bord2: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.13)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', background: t.surf2, border: `1px solid ${t.bord}`,
    borderRadius: 7, color: t.text, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: 80,
  };

  const TABS = [
    { id: 'profile',      label: 'Profile' },
    { id: 'compliance',   label: 'Compliance' },
    { id: 'team',         label: 'Team & Access' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'security',     label: 'Security' },
  ] as const;

  return (
    <>
      <Topbar title="Settings" />

      {/* Sub-nav tabs */}
      <div style={{ padding: '14px 24px 0', background: t.surf, borderBottom: `1px solid ${t.bord}`, display: 'flex', gap: 4, flexShrink: 0 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '8px 14px', background: 'transparent', border: 'none',
            borderBottom: `2px solid ${activeTab === tab.id ? '#6366F1' : 'transparent'}`,
            color: activeTab === tab.id ? '#6366F1' : t.muted,
            fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: t.bg, padding: 24, minHeight: 0 }}>
        <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── PROFILE TAB ── */}
          {activeTab === 'profile' && (
            <>
              <Section title="Account profile" desc="Your personal account information" t={t}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>SA</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{MOCK_PROFILE.name}</div>
                    <div style={{ fontSize: 12, color: t.muted }}>{MOCK_PROFILE.email}</div>
                  </div>
                  <button style={{ marginLeft: 'auto', padding: '7px 14px', background: 'transparent', border: `1px solid ${t.bord2}`, borderRadius: 8, color: t.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Change photo
                  </button>
                </div>
                <Row label="Full name" t={t}><span style={{ fontSize: 12, color: t.muted }}>{MOCK_PROFILE.name}</span></Row>
                <Row label="Email" t={t}><span style={{ fontSize: 12, color: t.muted }}>{MOCK_PROFILE.email}</span></Row>
                <Row label="Phone" t={t}><span style={{ fontSize: 12, color: t.muted }}>{MOCK_PROFILE.phone}</span></Row>
                <Row label="Company" t={t}><span style={{ fontSize: 12, color: t.muted }}>{MOCK_PROFILE.company}</span></Row>
              </Section>

              <Section title="Appearance" desc="Customize how ReachFlow looks" t={t}>
                <Row label="Theme" t={t}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: t.muted }}>{dark ? 'Dark' : 'Light'}</span>
                    <Toggle on={dark} onChange={toggleTheme} dark={dark} />
                  </div>
                </Row>
              </Section>

              <Section title="Session" t={t}>
                <button style={{
                  padding: '9px 18px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
                  borderRadius: 8, color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Log out
                </button>
              </Section>
            </>
          )}

          {/* ── COMPLIANCE TAB ── */}
          {activeTab === 'compliance' && (
            <>
              <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#D97706', lineHeight: 1.6 }}>
                ⏰ These settings control when and how often the AI calls leads. Changes apply to all future calls immediately.
              </div>

              <Section title="Call window (TRAI compliance)" desc="Outbound calls are only made within this time range, IST" t={t}>
                <Row label="Call window start" t={t}>
                  <select value={callStart} onChange={e => setCallStart(Number(e.target.value))} style={inputStyle}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                  </select>
                </Row>
                <Row label="Call window end" t={t}>
                  <select value={callEnd} onChange={e => setCallEnd(Number(e.target.value))} style={inputStyle}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
                  </select>
                </Row>
                <Row label="NDNC registry check" t={t}>
                  <Toggle on={ndncEnabled} onChange={() => setNdncEnabled(p => !p)} dark={dark} />
                </Row>
              </Section>

              <Section title="Retry scheduling" desc="How often the AI re-attempts uncontacted or declined leads" t={t}>
                <Row label="Retry on no-answer (hours)" t={t}>
                  <input type="number" value={noAnswerRetry} onChange={e => setNoAnswerRetry(Number(e.target.value))} style={inputStyle} min={1} max={24} />
                </Row>
                <Row label="Retry on decline (days)" t={t}>
                  <input type="number" value={declinedRetry} onChange={e => setDeclinedRetry(Number(e.target.value))} style={inputStyle} min={1} max={90} />
                </Row>
              </Section>
            </>
          )}

          {/* ── TEAM TAB ── */}
          {activeTab === 'team' && (
            <>
              <Section title="Team members" desc="Manage who has access and what they can see" t={t}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {MOCK_TEAM.map(member => {
                    const rm = ROLE_META[member.role];
                    return (
                      <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: t.surf2, borderRadius: 10, border: `1px solid ${t.bord}` }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: rm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {member.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{member.name}</div>
                          <div style={{ fontSize: 11, color: t.muted }}>{member.email}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: rm.color + '20', color: rm.color }}>
                            {rm.label}
                          </span>
                          <div style={{ fontSize: 10, color: t.muted, marginTop: 3 }}>{member.lastActive}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button style={{ marginTop: 14, padding: '8px 16px', background: '#6366F1', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Invite team member
                </button>
              </Section>

              <Section title="Role definitions" desc="What each access level can see and do" t={t}>
                {Object.entries(ROLE_META).map(([key, rm]) => (
                  <Row key={key} label={rm.label} t={t}>
                    <span style={{ fontSize: 11, color: t.muted, textAlign: 'right' }}>{rm.desc}</span>
                  </Row>
                ))}
              </Section>
            </>
          )}

          {/* ── INTEGRATIONS TAB ── */}
          {activeTab === 'integrations' && (
            <Section title="Connected services" desc="API integrations powering your AI calling pipeline" t={t}>
              <Row label="Vapi.ai — Voice calling" t={t}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: vapiConnected ? '#10B981' : t.muted, fontWeight: 600 }}>
                    {vapiConnected ? '● Connected' : '○ Not connected'}
                  </span>
                  <Toggle on={vapiConnected} onChange={() => setVapiConnected(p => !p)} dark={dark} />
                </div>
              </Row>
              <Row label="OpenAI — Summaries & scoring" t={t}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: openaiConnected ? '#10B981' : t.muted, fontWeight: 600 }}>
                    {openaiConnected ? '● Connected' : '○ Not connected'}
                  </span>
                  <Toggle on={openaiConnected} onChange={() => setOpenaiConnected(p => !p)} dark={dark} />
                </div>
              </Row>
              <Row label="AWS S3 — Call recordings" t={t}>
                <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>● Connected</span>
              </Row>
            </Section>
          )}

          {/* ── SECURITY TAB ── */}
          {activeTab === 'security' && (
            <>
              <Section title="Privacy & security" desc="Protect your account and your leads' data" t={t}>
                <Row label="Two-factor authentication" t={t}>
                  <Toggle on={twoFactor} onChange={() => setTwoFactor(p => !p)} dark={dark} />
                </Row>
                <Row label="Phone numbers encrypted at rest" t={t}>
                  <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>● AES-256 active</span>
                </Row>
                <Row label="Data residency" t={t}>
                  <span style={{ fontSize: 11, color: t.muted }}>AWS Mumbai (ap-south-1)</span>
                </Row>
              </Section>

              <Section title="Data controls" t={t}>
                <Row label="Export all my data" t={t}>
                  <button style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${t.bord2}`, borderRadius: 7, color: t.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Request export
                  </button>
                </Row>
                <Row label="Delete account & all data" t={t}>
                  <button style={{ padding: '6px 12px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 7, color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Delete
                  </button>
                </Row>
              </Section>
            </>
          )}

        </div>
      </div>
    </>
  );
}
