'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, AuthToken, UserRole, UserPermissions } from '@/types';
import { getMe } from '@/lib/api';

const NO_PERMISSIONS: UserPermissions = {
  canUploadLeads:     false,
  canStartCampaign:   false,
  canViewTranscripts: false,
  canManageAnalysts:  false,
  canExportData:      false,
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: AuthToken) => Promise<void>;
  logout: () => void;
  hasRole: (role: UserRole) => boolean;
  isReachFlowStaff: boolean;
  isClientRole: boolean;
  isSuperAdmin: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
  hasRole: () => false,
  isReachFlowStaff: false,
  isClientRole: false,
  isSuperAdmin: false,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved auth from localStorage on app start
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('rf-token');
      const savedUser  = localStorage.getItem('rf-user');

      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch {
      // Invalid data in localStorage — clear it
      localStorage.removeItem('rf-token');
      localStorage.removeItem('rf-user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (authToken: AuthToken): Promise<void> => {
    // Persist the token first — getMe() reads it straight out of localStorage
    setToken(authToken.accessToken);
    localStorage.setItem('rf-token', authToken.accessToken);

    let userData: User;
    try {
      userData = await getMe();
    } catch {
      // /me failed — fall back to the token's claims with permissions
      // denied by default until the next successful /me call.
      userData = {
        id:          authToken.userId,
        name:        authToken.name,
        email:       '',
        role:        authToken.role,
        clientId:    authToken.clientId,
        isActive:    true,
        permissions: NO_PERMISSIONS,
      };
    }

    setUser(userData);
    localStorage.setItem('rf-user', JSON.stringify(userData));
  };

  const logout = () => {
    localStorage.removeItem('rf-token');
    localStorage.removeItem('rf-user');
    setToken(null);
    setUser(null);
  };

  const hasRole = (role: UserRole): boolean => user?.role === role;

  const isSuperAdmin     = user?.role === 'super_admin';
  const isReachFlowStaff = user?.role === 'super_admin' || user?.role === 'reachflow_manager';
  const isClientRole     = user?.role === 'client_owner' || user?.role === 'client_manager' || user?.role === 'client_analyst';

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isAuthenticated: !!token && !!user,
      login,
      logout,
      hasRole,
      isReachFlowStaff,
      isClientRole,
      isSuperAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useAuth = () => useContext(AuthContext);