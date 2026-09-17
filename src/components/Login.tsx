'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { loginStep1, verifyOtp } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const { dark, toggleTheme } = useTheme();
  const { login } = useAuth();

  const [step, setStep]         = useState<'credentials' | 'otp'>('credentials');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp]           = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const t = {
    bg:    dark ? '#0A0D14' : '#F0F3FA',
    surf:  dark ? '#111622' : '#FFFFFF',
    surf2: dark ? '#181E2E' : '#F4F6FB',
    bord:  dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)',
    text:  dark ? '#E8EAF0' : '#111827',
    muted: dark ? '#6B7280' : '#6B7280',
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginStep1(email, password);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const authToken = await verifyOtp(email, otp);
      await login(authToken);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: t.surf2,
    border: `1px solid ${t.bord}`,
    borderRadius: 9,
    color: t.text,
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
    marginBottom: 14,
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    background: loading ? '#4F46E5' : '#6366F1',
    border: 'none',
    borderRadius: 9,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: loading ? 0.7 : 1,
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: t.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
    }}>
      {/* Theme toggle */}
      <button onClick={toggleTheme} style={{
        position: 'absolute', top: 20, right: 20,
        width: 44, height: 24, borderRadius: 12, border: 'none',
        cursor: 'pointer', background: dark ? '#6366F1' : '#D1D5DB',
        transition: 'background .2s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: dark ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          transition: 'left .2s', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 11,
        }}>{dark ? '🌙' : '☀️'}</span>
      </button>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg,#6366F1,#10B981)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 15.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" fill="white"/>
            </svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-.5px' }}>
            ReachFlow
          </div>
          <div style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>
            AI-powered voice outreach platform
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: t.surf,
          border: `1px solid ${t.bord}`,
          borderRadius: 16,
          padding: 28,
        }}>
          {step === 'credentials' ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 4 }}>
                Sign in
              </div>
              <div style={{ fontSize: 13, color: t.muted, marginBottom: 22 }}>
                Enter your credentials to continue
              </div>

              <form onSubmit={handleCredentials}>
                <label style={{ fontSize: 12, fontWeight: 600, color: t.text, display: 'block', marginBottom: 6 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  style={inputStyle}
                />

                <label style={{ fontSize: 12, fontWeight: 600, color: t.text, display: 'block', marginBottom: 6 }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={inputStyle}
                />

                {error && (
                  <div style={{
                    background: 'rgba(239,68,68,.1)',
                    border: '1px solid rgba(239,68,68,.25)',
                    borderRadius: 8, padding: '9px 12px',
                    fontSize: 12, color: '#EF4444', marginBottom: 14,
                  }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={buttonStyle}>
                  {loading ? 'Signing in…' : 'Continue'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 4 }}>
                Two-factor authentication
              </div>
              <div style={{ fontSize: 13, color: t.muted, marginBottom: 22 }}>
                Enter the 6-digit code sent to your registered mobile
              </div>

              <form onSubmit={handleOtp}>
                <label style={{ fontSize: 12, fontWeight: 600, color: t.text, display: 'block', marginBottom: 6 }}>
                  Verification code
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  maxLength={6}
                  style={{
                    ...inputStyle,
                    letterSpacing: '8px',
                    textAlign: 'center',
                    fontSize: 20,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}
                />

                {error && (
                  <div style={{
                    background: 'rgba(239,68,68,.1)',
                    border: '1px solid rgba(239,68,68,.25)',
                    borderRadius: 8, padding: '9px 12px',
                    fontSize: 12, color: '#EF4444', marginBottom: 14,
                  }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || otp.length !== 6} style={{
                  ...buttonStyle,
                  opacity: (loading || otp.length !== 6) ? 0.5 : 1,
                  cursor: (loading || otp.length !== 6) ? 'not-allowed' : 'pointer',
                }}>
                  {loading ? 'Verifying…' : 'Verify & sign in'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('credentials'); setOtp(''); setError(''); }}
                  style={{
                    width: '100%', marginTop: 10, padding: '10px',
                    background: 'transparent', border: 'none',
                    color: t.muted, fontSize: 12, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ← Back to login
                </button>
              </form>
            </>
          )}
        </div>

        {/* Compliance note */}
        <div style={{
          textAlign: 'center', marginTop: 18,
          fontSize: 11, color: t.muted, lineHeight: 1.6,
        }}>
          Protected by two-factor authentication<br />
          All data stored in AWS Mumbai · TRAI compliant
        </div>
      </div>
    </div>
  );
}