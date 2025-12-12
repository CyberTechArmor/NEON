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

// Export API URL for use in components (e.g., API documentation links)
export const API_BASE_URL = getApiUrl();

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

  setupMfa: (method?: 'TOTP' | 'EMAIL') => api.post<ApiResponse<{ secret: string; qrCode: string }>>('/auth/mfa/setup', { method: method || 'TOTP' }),

  verifyMfa: (code: string, method?: 'TOTP' | 'EMAIL', userId?: string) =>
    api.post<ApiResponse<{ user: unknown; accessToken: string; refreshToken: string; backupCodes?: string[] }>>('/auth/mfa/verify', { code, method: method || 'TOTP', userId }),

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
  /**
   * Get a pre-signed URL for direct browser-to-S3 upload
   */
  presign: (filename: string, contentType: string, size?: number) =>
    api.post<ApiResponse<{ url: string; key: string; bucket: string; expiresIn: number }>>('/files/presign', {
      filename,
      contentType,
      size,
      operation: 'put',
    }),

  /**
   * Confirm a direct upload after browser uploads to S3
   */
  confirm: (data: { key: string; bucket: string; filename: string; contentType: string; size: number }) =>
    api.post<ApiResponse<{ id: string; name: string; mimeType: string; size: number; url: string }>>('/files/confirm', data),

  /**
   * Upload a file using pre-signed URL (recommended method)
   * 1. Get pre-signed URL from backend
   * 2. Upload directly to S3
   * 3. Confirm upload with backend
   */
  uploadWithPresign: async (file: File, onProgress?: (percent: number) => void): Promise<{ id: string; url: string; name: string }> => {
    // Step 1: Get pre-signed URL
    const presignResponse = await filesApi.presign(file.name, file.type, file.size);
    const { url: uploadUrl, key, bucket } = presignResponse.data.data;

    // Step 2: Upload directly to S3/MinIO
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`S3 upload failed with status ${xhr.status}: ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during S3 upload'));
      xhr.send(file);
    });

    // Step 3: Confirm upload with backend
    const confirmResponse = await filesApi.confirm({
      key,
      bucket,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    });

    return {
      id: confirmResponse.data.data.id,
      url: confirmResponse.data.data.url,
      name: confirmResponse.data.data.name,
    };
  },

  /**
   * Get file info with fresh presigned URL
   */
  getFile: (fileId: string) =>
    api.get<ApiResponse<{ id: string; name: string; mimeType: string; size: number; url: string; thumbnailUrl: string | null; createdAt: string }>>(`/files/${fileId}`),

  /**
   * Get just the download URL for a file (wraps getFile for convenience)
   */
  getDownloadUrl: async (fileId: string): Promise<{ data: { data: { downloadUrl: string } } }> => {
    const response = await api.get<ApiResponse<{ id: string; name: string; mimeType: string; size: number; url: string; thumbnailUrl: string | null; createdAt: string }>>(`/files/${fileId}`);
    return { data: { data: { downloadUrl: response.data.data.url } } };
  },

  delete: (fileId: string) => api.delete(`/files/${fileId}`),

  // Legacy upload method (server-side upload) - kept for backwards compatibility
  upload: (formData: FormData) =>
    api.post<ApiResponse<{ url: string; fileId: string }>>('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  /**
   * Get a fresh presigned URL for internal file access
   */
  getPresignedUrl: (fileId: string) =>
    api.get<ApiResponse<{ url: string; expiresIn: number }>>(`/files/${fileId}/url`),

  /**
   * Create a share for a file
   */
  createShare: (fileId: string, data: { password?: string; expiresAt?: string; maxOpens?: number; label?: string }) =>
    api.post<ApiResponse<{ id: string; token: string; shareUrl: string; hasPassword: boolean; expiresAt: string | null; maxOpens: number | null; openCount: number; isActive: boolean; label: string | null; createdAt: string }>>(`/files/${fileId}/shares`, data),

  /**
   * List shares for a file
   */
  listShares: (fileId: string) =>
    api.get<ApiResponse<Array<{ id: string; token: string; shareUrl: string; hasPassword: boolean; expiresAt: string | null; maxOpens: number | null; openCount: number; isActive: boolean; label: string | null; createdAt: string }>>>(`/files/${fileId}/shares`),
};

// File Share Management API
export const sharesApi = {
  /**
   * Update a share
   */
  update: (shareId: string, data: { isActive?: boolean; expiresAt?: string | null; maxOpens?: number | null; label?: string | null }) =>
    api.patch<ApiResponse<{ id: string; token: string; shareUrl: string; expiresAt: string | null; maxOpens: number | null; openCount: number; isActive: boolean; label: string | null; createdAt: string }>>(`/shares/${shareId}`, data),

  /**
   * Delete a share
   */
  delete: (shareId: string) => api.delete<ApiResponse<{ message: string }>>(`/shares/${shareId}`),

  /**
   * Get analytics for a share
   */
  getAnalytics: (shareId: string) =>
    api.get<ApiResponse<{
      share: { id: string; label: string | null; fileName: string; openCount: number; maxOpens: number | null; isActive: boolean; expiresAt: string | null; createdAt: string };
      stats: { totalViews: number; totalDownloads: number; failedAttempts: number; uniqueCountries: number };
      recentAccess: Array<{ id: string; accessedAt: string; ipAddress: string | null; actionType: string; geoCountry: string | null; geoCity: string | null }>;
    }>>(`/shares/${shareId}/analytics`),

  /**
   * Access a shared file (public, no auth required)
   */
  access: (token: string, password?: string) => {
    const headers: Record<string, string> = {};
    if (password) {
      headers['X-Share-Password'] = password;
    }
    return api.get<ApiResponse<{ url: string; fileName: string; fileSize: number; mimeType: string; expiresIn: number }> | { success: false; error: { code: string; message: string }; data?: { requiresPassword: boolean } }>(`/s/${token}`, { headers });
  },

  /**
   * Verify password for a protected share
   */
  verifyPassword: (token: string, password: string) =>
    api.post<ApiResponse<{ valid: boolean; fileName: string; fileSize: number; mimeType: string }>>(`/s/${token}/verify-password`, { password }),
};

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<unknown[]>>('/notifications', { params }),

  markRead: (id: string) => api.post(`/notifications/${id}/read`),

  markAllRead: () => api.post('/notifications/read-all'),

  subscribePush: (subscription: { endpoint: string; p256dh: string; auth: string }) =>
    api.post('/notifications/push-subscription', subscription),
};

export const featuresApi = {
  get: () => api.get<ApiResponse<{ flags: Record<string, boolean> }>>('/features'),
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
      api.post<ApiResponse<unknown>>('/admin/users', {
        email: data.email,
        displayName: data.name,
        password: data.password,
        roleId: data.roleId,
        departmentId: data.departmentId,
      }),

    update: (id: string, data: { name?: string; email?: string; roleId?: string; departmentId?: string; isActive?: boolean }) =>
      api.patch<ApiResponse<unknown>>(`/admin/users/${id}`, data),

    delete: (id: string) => api.delete(`/admin/users/${id}`),

    resetPassword: (id: string) =>
      api.post<ApiResponse<{ temporaryPassword: string }>>(`/admin/users/${id}/reset-password`),

    disableMfa: (id: string) => api.post(`/admin/users/${id}/disable-mfa`),

    getPermissions: (id: string) =>
      api.get<ApiResponse<unknown[]>>(`/admin/users/${id}/permissions`),

    setPermissions: (id: string, permissions: { permission: string; granted: boolean }[]) =>
      api.put(`/admin/users/${id}/permissions`, { permissions }),

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
      api.patch<ApiResponse<unknown>>('/admin/organization/settings', settings),

    testStorageConnection: (config: Record<string, unknown>) =>
      api.post<ApiResponse<{ success: boolean; message?: string }>>('/admin/organization/test-storage', config),

    testAndSaveStorage: (config: Record<string, unknown>) =>
      api.post<ApiResponse<{ testSuccess: boolean; saved: boolean; message: string; suggestion?: string; config?: Record<string, unknown> }>>('/admin/organization/test-and-save-storage', config),
  },

  // Top-level convenience methods for settings
  getSettings: () => api.get<ApiResponse<unknown>>('/admin/organization/settings'),

  updateSettings: (settings: Record<string, unknown>) =>
    api.patch<ApiResponse<unknown>>('/admin/organization/settings', settings),

  testStorageConnection: (config: Record<string, unknown>) =>
    api.post<ApiResponse<{ success: boolean; message?: string }>>('/admin/organization/test-storage', config),

  testAndSaveStorage: (config: Record<string, unknown>) =>
    api.post<ApiResponse<{ testSuccess: boolean; saved: boolean; message: string; suggestion?: string; config?: Record<string, unknown> }>>('/admin/organization/test-and-save-storage', config),

  // Demo user management
  demoUser: {
    get: () => api.get<ApiResponse<{ enabled: boolean; email?: string; password?: string; userId?: string }>>('/admin/demo-user'),

    enable: () => api.post<ApiResponse<{ enabled: boolean; email: string; password: string; userId: string }>>('/admin/demo-user/enable'),

    disable: () => api.post<ApiResponse<{ enabled: boolean }>>('/admin/demo-user/disable'),

    regenerate: () => api.post<ApiResponse<{ enabled: boolean; email: string; password: string; userId: string }>>('/admin/demo-user/regenerate'),
  },

  // Feature flags management
  features: {
    get: () => api.get<ApiResponse<{
      flags: Record<string, boolean>;
      availableFeatures: Array<{ key: string; name: string; description: string }>;
    }>>('/admin/features'),

    update: (flags: Record<string, boolean>) =>
      api.post<ApiResponse<{ flags: Record<string, boolean> }>>('/admin/features', { flags }),
  },

  // Developer tools
  developers: {
    // Events and scopes
    getEvents: () => api.get<ApiResponse<{ id: string; name: string; description: string }[]>>('/admin/developers/events'),
    getScopes: () => api.get<ApiResponse<{ id: string; name: string; description: string }[]>>('/admin/developers/scopes'),

    // API Keys
    apiKeys: {
      list: (params?: { page?: number; limit?: number }) =>
        api.get<ApiResponse<unknown[]>>('/admin/developers/api-keys', { params }),

      create: (data: { name: string; scopes?: string[]; rateLimit?: number; expiresAt?: string }) =>
        api.post<ApiResponse<{ id: string; name: string; key: string; keyPrefix: string; scopes: string[]; createdAt: string }>>('/admin/developers/api-keys', data),

      revoke: (id: string) => api.delete(`/admin/developers/api-keys/${id}`),
    },

    // Webhooks
    webhooks: {
      list: (params?: { page?: number; limit?: number }) =>
        api.get<ApiResponse<unknown[]>>('/admin/developers/webhooks', { params }),

      get: (id: string) => api.get<ApiResponse<unknown>>(`/admin/developers/webhooks/${id}`),

      create: (data: { name: string; url: string; events: string[]; enabled?: boolean }) =>
        api.post<ApiResponse<{ id: string; name: string; url: string; secret: string; events: string[] }>>('/admin/developers/webhooks', data),

      update: (id: string, data: { name?: string; url?: string; events?: string[]; enabled?: boolean }) =>
        api.patch<ApiResponse<unknown>>(`/admin/developers/webhooks/${id}`, data),

      delete: (id: string) => api.delete(`/admin/developers/webhooks/${id}`),

      test: (id: string) =>
        api.post<ApiResponse<{ success: boolean; statusCode?: number; latency: number; message: string }>>(`/admin/developers/webhooks/${id}/test`),

      regenerateSecret: (id: string) =>
        api.post<ApiResponse<{ secret: string }>>(`/admin/developers/webhooks/${id}/regenerate-secret`),
    },
  },

  // Storage browser
  storage: {
    browse: (params?: { prefix?: string; limit?: number; cursor?: string; flat?: boolean }) =>
      api.get<ApiResponse<{
        objects: Array<{
          key: string;
          size: number;
          lastModified: string;
          etag: string;
          storageClass?: string;
        }>;
        folders: Array<{
          prefix: string;
          name: string;
        }>;
        prefix: string;
        isTruncated: boolean;
        nextCursor?: string;
        keyCount: number;
      }>>('/admin/storage/browse', { params }),

    getObject: (key: string) =>
      api.get<ApiResponse<{
        key: string;
        size: number;
        contentType: string;
        lastModified: string;
        etag: string;
        metadata?: Record<string, string>;
        downloadUrl: string;
        expiresIn: number;
      }>>('/admin/storage/object', { params: { key } }),

    deleteObject: (key: string) =>
      api.delete<ApiResponse<{ message: string; key: string }>>('/admin/storage/object', { params: { key } }),

    getStats: () =>
      api.get<ApiResponse<{
        storageUsed: number;
        storageLimit: number | null;
        objectCount: number;
        hasMoreObjects: boolean;
      }>>('/admin/storage/stats'),
  },
};
