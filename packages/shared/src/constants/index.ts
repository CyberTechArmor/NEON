/**
 * Shared Constants
 *
 * Constants used across the NEON platform
 */

// =============================================================================
// Rate Limits
// =============================================================================

export const RATE_LIMITS = {
  // Messages per minute
  MESSAGES_PER_MINUTE: 120,

  // API requests per minute (per user)
  API_REQUESTS_PER_MINUTE: 100,

  // Login attempts before lockout
  LOGIN_ATTEMPTS_MAX: 5,

  // Lockout duration in milliseconds (15 minutes)
  LOGIN_LOCKOUT_DURATION_MS: 15 * 60 * 1000,
} as const;

// =============================================================================
// File Limits
// =============================================================================

export const FILE_LIMITS = {
  // Default max file size (1GB)
  MAX_FILE_SIZE_BYTES: 1024 * 1024 * 1024,

  // Max files per message
  MAX_FILES_PER_MESSAGE: 10,

  // Thumbnail dimensions
  THUMBNAIL_WIDTH: 200,
  THUMBNAIL_HEIGHT: 200,

  // Image preview dimensions
  PREVIEW_MAX_WIDTH: 1200,
  PREVIEW_MAX_HEIGHT: 1200,
} as const;

// =============================================================================
// Chat Limits
// =============================================================================

export const CHAT_LIMITS = {
  // Max participants in a group
  MAX_GROUP_PARTICIPANTS: 50,

  // Max message length
  MAX_MESSAGE_LENGTH: 10000,

  // Max conversation name length
  MAX_CONVERSATION_NAME_LENGTH: 100,

  // Messages to fetch per page
  MESSAGES_PER_PAGE: 50,

  // Messages to cache offline
  OFFLINE_CACHE_MESSAGES: 50,

  // Messages threshold to trigger load more
  LOAD_MORE_THRESHOLD: 10,
} as const;

// =============================================================================
// Meeting Limits
// =============================================================================

export const MEETING_LIMITS = {
  // Max participants in a meeting
  MAX_MEETING_PARTICIPANTS: 100,

  // Max title length
  MAX_TITLE_LENGTH: 200,

  // Max description length
  MAX_DESCRIPTION_LENGTH: 2000,

  // Max reminders per meeting
  MAX_REMINDERS: 5,

  // Max meeting duration (8 hours)
  MAX_DURATION_HOURS: 8,

  // Min meeting duration (5 minutes)
  MIN_DURATION_MINUTES: 5,
} as const;

// =============================================================================
// Compliance
// =============================================================================

export const COMPLIANCE = {
  // HIPAA audit log retention (6 years)
  HIPAA_AUDIT_RETENTION_DAYS: 2190,

  // Default GDPR purge grace period
  GDPR_PURGE_GRACE_DAYS: 30,

  // Emergency access justification min length
  EMERGENCY_ACCESS_JUSTIFICATION_MIN_LENGTH: 20,
} as const;

// =============================================================================
// Session & Auth
// =============================================================================

export const AUTH = {
  // Access token expiry (15 minutes)
  ACCESS_TOKEN_EXPIRY: '15m',
  ACCESS_TOKEN_EXPIRY_MS: 15 * 60 * 1000,

  // Refresh token expiry (7 days)
  REFRESH_TOKEN_EXPIRY: '7d',
  REFRESH_TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,

  // MFA code length
  MFA_CODE_LENGTH: 6,

  // MFA code validity (5 minutes)
  MFA_CODE_VALIDITY_MS: 5 * 60 * 1000,

  // Password reset token validity (1 hour)
  PASSWORD_RESET_TOKEN_VALIDITY_MS: 60 * 60 * 1000,

  // Backup codes count
  MFA_BACKUP_CODES_COUNT: 10,

  // Session cookie name
  SESSION_COOKIE_NAME: 'neon.sid',
} as const;

// =============================================================================
// Presence
// =============================================================================

export const PRESENCE = {
  // Idle timeout (5 minutes)
  IDLE_TIMEOUT_MS: 5 * 60 * 1000,

  // Offline timeout (2 minutes without heartbeat)
  OFFLINE_TIMEOUT_MS: 2 * 60 * 1000,

  // Heartbeat interval (30 seconds)
  HEARTBEAT_INTERVAL_MS: 30 * 1000,

  // Typing indicator timeout (3 seconds)
  TYPING_TIMEOUT_MS: 3 * 1000,
} as const;

// =============================================================================
// Federation
// =============================================================================

export const FEDERATION = {
  // Bridge request timeout (30 days)
  BRIDGE_REQUEST_TIMEOUT_DAYS: 30,

  // Max bridges per organization
  MAX_BRIDGES_PER_ORG: 100,
} as const;

// =============================================================================
// System Permissions
// =============================================================================

export const SYSTEM_PERMISSIONS = {
  // Super admin
  SUPER_ADMIN: 'super_admin',

  // Organization management
  ORG_MANAGE: 'org:manage',
  ORG_VIEW_SETTINGS: 'org:view_settings',
  ORG_EDIT_SETTINGS: 'org:edit_settings',

  // User management
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_EDIT: 'users:edit',
  USERS_DEACTIVATE: 'users:deactivate',
  USERS_BULK_IMPORT: 'users:bulk_import',

  // Department & Role management
  DEPARTMENTS_MANAGE: 'departments:manage',
  ROLES_MANAGE: 'roles:manage',

  // Permission management
  PERMISSIONS_VIEW: 'permissions:view',
  PERMISSIONS_MANAGE: 'permissions:manage',

  // Moderation
  MESSAGES_DELETE_ANY: 'messages:delete_any',
  CONVERSATIONS_FREEZE: 'conversations:freeze',
  CONVERSATIONS_VIEW_ANY: 'conversations:view_any',

  // Meetings
  MEETINGS_RECORD: 'meetings:record',
  RECORDINGS_VIEW_ANY: 'recordings:view_any',

  // Audit
  AUDIT_VIEW: 'audit:view',
  AUDIT_EXPORT: 'audit:export',
  EMERGENCY_ACCESS: 'emergency_access',

  // Federation
  FEDERATION_MANAGE: 'federation:manage',

  // Backup
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',

  // API
  API_KEYS_MANAGE: 'api_keys:manage',

  // Guest organizations
  GUEST_ORGS_MANAGE: 'guest_orgs:manage',
} as const;

export type SystemPermission = (typeof SYSTEM_PERMISSIONS)[keyof typeof SYSTEM_PERMISSIONS];

// =============================================================================
// Feature Flags (for guest orgs and modules)
// =============================================================================

export const FEATURES = {
  CHAT: 'chat',
  CALLS: 'calls',
  MEETINGS: 'meetings',
  RECORDINGS: 'recordings',
  FILE_SHARING: 'file_sharing',
  PRESENCE: 'presence',
  REACTIONS: 'reactions',
  THREADS: 'threads',
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

// =============================================================================
// Supported MIME Types
// =============================================================================

export const MIME_TYPES = {
  // Images
  IMAGES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
  ],

  // Documents
  DOCUMENTS: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/markdown',
  ],

  // Audio
  AUDIO: [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
  ],

  // Video
  VIDEO: [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
  ],

  // Archives
  ARCHIVES: [
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip',
    'application/x-tar',
  ],
} as const;

export const ALL_ALLOWED_MIME_TYPES = [
  ...MIME_TYPES.IMAGES,
  ...MIME_TYPES.DOCUMENTS,
  ...MIME_TYPES.AUDIO,
  ...MIME_TYPES.VIDEO,
  ...MIME_TYPES.ARCHIVES,
];
