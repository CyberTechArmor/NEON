import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: {
    id: string;
    name: string;
  };
  department?: {
    id: string;
    name: string;
  };
  permissions: string[];
  settings: Record<string, unknown>;
}

interface InitStatus {
  initialized: boolean;
  hasUsers: boolean;
  hasOrganization: boolean;
  error?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaPending: boolean;
  mfaUserId: string | null;

  // System initialization status
  initStatus: InitStatus | null;
  isCheckingInit: boolean;

  // Actions
  login: (email: string, password: string) => Promise<{ requiresMfa: boolean }>;
  verifyMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setUser: (user: User) => void;
  hasPermission: (permission: string) => boolean;
  initialize: () => Promise<void>;
  checkInitialization: () => Promise<InitStatus>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,
      mfaPending: false,
      mfaUserId: null,
      initStatus: null,
      isCheckingInit: true,

      login: async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password });

        if (response.data.requiresMfa) {
          set({
            mfaPending: true,
            mfaUserId: response.data.userId,
          });
          return { requiresMfa: true };
        }

        const { user, accessToken, refreshToken } = response.data;
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          mfaPending: false,
          mfaUserId: null,
        });

        return { requiresMfa: false };
      },

      verifyMfa: async (code: string) => {
        const { mfaUserId } = get();
        if (!mfaUserId) throw new Error('No MFA session');

        const response = await api.post('/auth/mfa/verify', {
          userId: mfaUserId,
          code,
        });

        const { user, accessToken, refreshToken } = response.data;
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          mfaPending: false,
          mfaUserId: null,
        });
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // Ignore errors during logout
        }

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          mfaPending: false,
          mfaUserId: null,
        });
      },

      refreshSession: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          set({ isLoading: false });
          return;
        }

        try {
          const response = await api.post('/auth/refresh', { refreshToken });
          const { accessToken, refreshToken: newRefreshToken, user } = response.data;

          set({
            accessToken,
            refreshToken: newRefreshToken,
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setUser: (user: User) => {
        set({ user });
      },

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;

        // Super admin has all permissions
        if (user.permissions.includes('super_admin')) return true;

        // Check for wildcard permissions
        const parts = permission.split(':');
        if (parts.length === 2) {
          const [resource] = parts;
          if (user.permissions.includes(`${resource}:*`)) return true;
        }

        return user.permissions.includes(permission);
      },

      initialize: async () => {
        // First check if the system is initialized
        await get().checkInitialization();

        const { refreshToken } = get();
        if (refreshToken) {
          await get().refreshSession();
        } else {
          set({ isLoading: false });
        }
      },

      checkInitialization: async () => {
        set({ isCheckingInit: true });
        try {
          const response = await api.get('/status/init');
          const initStatus = response.data.data as InitStatus;
          set({ initStatus, isCheckingInit: false });
          return initStatus;
        } catch {
          // API not ready yet, assume not initialized
          const initStatus: InitStatus = {
            initialized: false,
            hasUsers: false,
            hasOrganization: false,
            error: 'API not available',
          };
          set({ initStatus, isCheckingInit: false });
          return initStatus;
        }
      },
    }),
    {
      name: 'neon-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// Initialize auth on load
useAuthStore.getState().initialize();
