import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import AppShell from '@/components/layout/AppShell';
import './globals.css';

// Fonts are self-hosted rather than fetched from Google at build time.
// next/font/google made every build depend on Google being reachable, and
// it failed repeatedly on CI and on Vercel — a clean runner has no cached
// copy, so a rate limit or hiccup broke the whole build. These files live
// in the repo, so the build has no network dependency at all.
const dmSans = localFont({
  src: [
    { path: './fonts/dm-sans-v17-latin-regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/dm-sans-v17-latin-500.woff2',     weight: '500', style: 'normal' },
    { path: './fonts/dm-sans-v17-latin-600.woff2',     weight: '600', style: 'normal' },
    { path: './fonts/dm-sans-v17-latin-700.woff2',     weight: '700', style: 'normal' },
    { path: './fonts/dm-sans-v17-latin-800.woff2',     weight: '800', style: 'normal' },
  ],
  variable: '--font-dm-sans',
  display: 'swap',
});

const dmMono = localFont({
  src: [
    { path: './fonts/dm-mono-v16-latin-regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/dm-mono-v16-latin-500.woff2',     weight: '500', style: 'normal' },
  ],
  variable: '--font-dm-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ReachFlow — AI Voice Outreach',
  description: 'AI-powered outbound call management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Font variables go on <html> rather than <body> so that :root in
    // globals.css can resolve them — CSS variables cascade down, not up
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
