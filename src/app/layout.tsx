import type { Metadata } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import { ThemeProvider } from '@/lib/theme-context';
import { AuthProvider } from '@/lib/auth-context';
import AppShell from '@/components/layout/AppShell';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700', '800'],
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'ReachFlow — AI Voice Outreach',
  description: 'AI-powered outbound call management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
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