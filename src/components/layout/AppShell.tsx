'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/layout/Sidebar';

const PUBLIC_ROUTES = ['/login'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // Redirect to login if not authenticated on a protected route
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicRoute) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, isPublicRoute, router]);

  // Wait for auth state to load from localStorage before rendering
  if (isLoading) {
    return null;
  }

  // Login page — full screen, no sidebar
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Not authenticated on a protected route — render nothing while redirecting
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — full app shell with sidebar
  return (
    <div className="layout-root">
      <Sidebar />
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: '100vh',
      }}>
        {children}
      </main>
    </div>
  );
}