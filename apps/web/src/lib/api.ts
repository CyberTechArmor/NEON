import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth';

// Get API URL from runtime config (docker), build-time env, or fallback
const getApiUrl = (): string => {
  // Runtime config from docker-entrypoint.sh
  if (typeof window !== 'undefined' && (window as any).__NEON_CONFIG__?.apiUrl) {
    return (window as any).__NEON_CONFIG__.apiUrl;
  }
  // Build-time environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Fallback for local development
  return 'http://localhost:3001/api';
};

export const api = axios.create({
  baseURL: getApiUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response: import('axios').AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        await useAuthStore.getState().refreshSession();
        const { accessToken } = useAuthStore.getState();

        if (accessToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch {
        // Refresh failed, logout user
        await useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
    pagination?: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Helper to extract error message
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiError | undefined;
    return apiError?.error?.message || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

// Typed API methods
export const authApi = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<{ user: unknown; accessToken: string; refreshToken: string; requiresMfa?: boolean; userId?: string }>>('/auth/login', { email, password }),

  logout: () => api.post('/auth/logout'),

  refresh: (refreshToken: string) =>
    api.post<ApiResponse<{ accessToken: string; refreshToken: string; user: unknown }>>('/auth/refresh', { refreshToken }),

  me: () => api.get<ApiResponse<unknown>>('/auth/me'),

  setupMfa: () => api.post<ApiResponse<{ secret: string; qrCode: string }>>('/auth/mfa/setup'),

  verifyMfa: (userId: string, code: string) =>
    api.post<ApiResponse<{ user: unknown; accessToken: string; refreshToken: string }>>('/auth/mfa/verify', { userId, code }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/password', { currentPassword, newPassword }),
};

export const conversationsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<unknown[]>>('/conversations', { params }),

  get: (id: string) => api.get<ApiResponse<unknown>>(`/conversations/${id}`),

  create: (data: { type: string; participantIds?: string[]; name?: string }) =>
    api.post<ApiResponse<unknown>>('/conversations', data),

  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch<ApiResponse<unknown>>(`/conversations/${id}`, data),

  addParticipants: (id: string, userIds: string[]) =>
    api.post(`/conversations/${id}/participants`, { userIds }),

  removeParticipant: (id: string, userId: string) =>
    api.delete(`/conversations/${id}/participants/${userId}`),
};

export const messagesApi = {
  list: (conversationId: string, params?: { before?: string; limit?: number }) =>
    api.get<ApiResponse<unknown[]>>(`/conversations/${conversationId}/messages`, { params }),

  send: (conversationId: string, data: { content: string; replyToId?: string }) =>
    api.post<ApiResponse<unknown>>(`/conversations/${conversationId}/messages`, data),

  update: (id: string, content: string) =>
    api.patch<ApiResponse<unknown>>(`/messages/${id}`, { content }),

  delete: (id: string) => api.delete(`/messages/${id}`),

  react: (id: string, emoji: string) =>
    api.post(`/messages/${id}/reactions`, { emoji }),

  unreact: (id: string, emoji: string) =>
    api.delete(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`),
};

export const usersApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiResponse<unknown[]>>('/users', { params }),

  get: (id: string) => api.get<ApiResponse<unknown>>(`/users/${id}`),

  updateProfile: (data: { name?: string; avatarUrl?: string }) =>
    api.patch<ApiResponse<unknown>>('/users/me', data),

  updateSettings: (settings: Record<string, unknown>) =>
    api.patch('/users/me/settings', { settings }),
};

export const meetingsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<ApiResponse<unknown[]>>('/meetings', { params }),

  get: (id: string) => api.get<ApiResponse<unknown>>(`/meetings/${id}`),

  create: (data: { title: string; scheduledStart: string; scheduledEnd?: string; participantIds?: string[] }) =>
    api.post<ApiResponse<unknown>>('/meetings', data),

  update: (id: string, data: Partial<{ title: string; scheduledStart: string; scheduledEnd: string }>) =>
    api.patch<ApiResponse<unknown>>(`/meetings/${id}`, data),

  delete: (id: string) => api.delete(`/meetings/${id}`),

  join: (id: string) =>
    api.post<ApiResponse<{ token: string; url: string }>>(`/meetings/${id}/join`),

  leave: (id: string) => api.post(`/meetings/${id}/leave`),
};

export const callsApi = {
  initiate: (participantIds: string[], type: 'audio' | 'video') =>
    api.post<ApiResponse<{ callId: string; token: string; roomName: string }>>('/calls', { participantIds, type }),

  join: (id: string) =>
    api.post<ApiResponse<{ token: string; roomName: string }>>(`/calls/${id}/join`),

  end: (id: string) => api.post(`/calls/${id}/end`),
};

export const filesApi = {
  getUploadUrl: (filename: string, contentType: string, conversationId?: string) =>
    api.post<ApiResponse<{ uploadUrl: string; fileId: string; key: string }>>('/files/upload-url', {
      filename,
      contentType,
      conversationId,
    }),

  getDownloadUrl: (fileId: string) =>
    api.get<ApiResponse<{ downloadUrl: string }>>(`/files/${fileId}/download-url`),

  delete: (fileId: string) => api.delete(`/files/${fileId}`),
};

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<unknown[]>>('/notifications', { params }),

  markRead: (id: string) => api.post(`/notifications/${id}/read`),

  markAllRead: () => api.post('/notifications/read-all'),

  subscribePush: (subscription: { endpoint: string; p256dh: string; auth: string }) =>
    api.post('/notifications/push-subscription', subscription),
};

export const adminApi = {
  getHealth: () => api.get<ApiResponse<unknown>>('/admin/health'),

  getStats: () => api.get<ApiResponse<unknown>>('/admin/stats'),

  getAuditLog: (params?: { page?: number; limit?: number; action?: string; resourceType?: string; userId?: string; startDate?: string; endDate?: string }) =>
    api.get<ApiResponse<unknown[]>>('/admin/audit', { params }),

  exportAuditLog: (startDate: string, endDate: string, format: 'json' | 'csv') =>
    api.post('/admin/audit/export', { startDate, endDate, format }, { responseType: 'blob' }),

  verifyAuditIntegrity: () =>
    api.post<ApiResponse<{ valid: boolean; issues?: string[] }>>('/admin/audit/verify'),

  triggerJob: (jobName: string) =>
    api.post<ApiResponse<{ triggered: boolean }>>(`/admin/jobs/${jobName}/trigger`),

  // User management
  users: {
    list: (params?: { page?: number; limit?: number; search?: string; roleId?: string; departmentId?: string; status?: string }) =>
      api.get<ApiResponse<unknown[]>>('/admin/users', { params }),

    get: (id: string) => api.get<ApiResponse<unknown>>(`/admin/users/${id}`),

    create: (data: { email: string; name: string; password: string; roleId: string; departmentId?: string }) =>
      api.post<ApiResponse<unknown>>('/admin/users', data),

    update: (id: string, data: { name?: string; email?: string; roleId?: string; departmentId?: string; isActive?: boolean }) =>
      api.patch<ApiResponse<unknown>>(`/admin/users/${id}`, data),

    delete: (id: string) => api.delete(`/admin/users/${id}`),

    resetPassword: (id: string) =>
      api.post<ApiResponse<{ temporaryPassword: string }>>(`/admin/users/${id}/reset-password`),

    disableMfa: (id: string) => api.post(`/admin/users/${id}/disable-mfa`),

    bulkImport: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post<ApiResponse<{ imported: number; failed: number; errors: string[] }>>('/admin/users/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },

    exportUsers: (format: 'csv' | 'json') =>
      api.get('/admin/users/export', { params: { format }, responseType: 'blob' }),
  },

  // Department management
  departments: {
    list: (params?: { page?: number; limit?: number }) =>
      api.get<ApiResponse<unknown[]>>('/admin/departments', { params }),

    get: (id: string) => api.get<ApiResponse<unknown>>(`/admin/departments/${id}`),

    create: (data: { name: string; description?: string; parentId?: string }) =>
      api.post<ApiResponse<unknown>>('/admin/departments', data),

    update: (id: string, data: { name?: string; description?: string; parentId?: string }) =>
      api.patch<ApiResponse<unknown>>(`/admin/departments/${id}`, data),

    delete: (id: string) => api.delete(`/admin/departments/${id}`),

    getPermissions: (id: string) =>
      api.get<ApiResponse<unknown[]>>(`/admin/departments/${id}/permissions`),

    setPermissions: (id: string, permissions: { permission: string; granted: boolean }[]) =>
      api.put(`/admin/departments/${id}/permissions`, { permissions }),
  },

  // Role management
  roles: {
    list: (params?: { page?: number; limit?: number }) =>
      api.get<ApiResponse<unknown[]>>('/admin/roles', { params }),

    get: (id: string) => api.get<ApiResponse<unknown>>(`/admin/roles/${id}`),

    create: (data: { name: string; description?: string; departmentId?: string }) =>
      api.post<ApiResponse<unknown>>('/admin/roles', data),

    update: (id: string, data: { name?: string; description?: string }) =>
      api.patch<ApiResponse<unknown>>(`/admin/roles/${id}`, data),

    delete: (id: string) => api.delete(`/admin/roles/${id}`),

    getPermissions: (id: string) =>
      api.get<ApiResponse<unknown[]>>(`/admin/roles/${id}/permissions`),

    setPermissions: (id: string, permissions: { permission: string; granted: boolean }[]) =>
      api.put(`/admin/roles/${id}/permissions`, { permissions }),
  },

  // SSO configuration
  sso: {
    getProviders: () => api.get<ApiResponse<unknown[]>>('/admin/sso/providers'),

    getProvider: (id: string) => api.get<ApiResponse<unknown>>(`/admin/sso/providers/${id}`),

    createProvider: (data: {
      type: 'ldap' | 'oauth2' | 'saml' | 'oidc';
      name: string;
      config: Record<string, unknown>;
      isEnabled: boolean;
    }) => api.post<ApiResponse<unknown>>('/admin/sso/providers', data),

    updateProvider: (id: string, data: {
      name?: string;
      config?: Record<string, unknown>;
      isEnabled?: boolean;
    }) => api.patch<ApiResponse<unknown>>(`/admin/sso/providers/${id}`, data),

    deleteProvider: (id: string) => api.delete(`/admin/sso/providers/${id}`),

    testProvider: (id: string) =>
      api.post<ApiResponse<{ success: boolean; message: string }>>(`/admin/sso/providers/${id}/test`),
  },

  // Federation bridges
  federation: {
    getBridges: () => api.get<ApiResponse<unknown[]>>('/admin/federation/bridges'),

    getBridge: (id: string) => api.get<ApiResponse<unknown>>(`/admin/federation/bridges/${id}`),

    createBridge: (data: {
      name: string;
      remoteUrl: string;
      sharedSecret: string;
      isEnabled: boolean;
    }) => api.post<ApiResponse<unknown>>('/admin/federation/bridges', data),

    updateBridge: (id: string, data: {
      name?: string;
      remoteUrl?: string;
      sharedSecret?: string;
      isEnabled?: boolean;
    }) => api.patch<ApiResponse<unknown>>(`/admin/federation/bridges/${id}`, data),

    deleteBridge: (id: string) => api.delete(`/admin/federation/bridges/${id}`),

    testBridge: (id: string) =>
      api.post<ApiResponse<{ success: boolean; latency: number; message: string }>>(`/admin/federation/bridges/${id}/test`),

    syncBridge: (id: string) =>
      api.post<ApiResponse<{ synced: number }>>(`/admin/federation/bridges/${id}/sync`),
  },

  // Organization settings
  organization: {
    get: () => api.get<ApiResponse<unknown>>('/admin/organization'),

    update: (data: {
      name?: string;
      domain?: string;
      settings?: Record<string, unknown>;
    }) => api.patch<ApiResponse<unknown>>('/admin/organization', data),

    getSettings: () => api.get<ApiResponse<unknown>>('/admin/organization/settings'),

    updateSettings: (settings: Record<string, unknown>) =>
      api.patch('/admin/organization/settings', settings),
  },
};
