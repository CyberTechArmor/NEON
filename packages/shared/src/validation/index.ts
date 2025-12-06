/**
 * Validation Schemas
 *
 * Zod schemas for request validation, shared between client and server
 */

import { z } from 'zod';

// =============================================================================
// Common Schemas
// =============================================================================

export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().email().max(255);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const displayNameSchema = z
  .string()
  .min(1, 'Display name is required')
  .max(100, 'Display name must be at most 100 characters')
  .trim();

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  );

export const slugSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens');

export const timezoneSchema = z.string().regex(/^[A-Za-z_]+\/[A-Za-z_]+$/);

export const localeSchema = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// =============================================================================
// Authentication Schemas
// =============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  orgSlug: slugSchema.optional(),
  mfaCode: z.string().length(6).optional(),
  deviceFingerprint: z.string().optional(),
  rememberDevice: z.boolean().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const mfaSetupSchema = z.object({
  method: z.enum(['TOTP', 'EMAIL']),
});

export const mfaVerifySchema = z.object({
  code: z.string().length(6),
  method: z.enum(['TOTP', 'EMAIL']),
});

export const passwordResetSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

// =============================================================================
// User Schemas
// =============================================================================

export const createUserSchema = z.object({
  email: emailSchema,
  username: usernameSchema.optional(),
  displayName: displayNameSchema,
  password: passwordSchema.optional(),
  departmentId: uuidSchema.optional(),
  roleId: uuidSchema.optional(),
  tagIds: z.array(uuidSchema).optional(),
});

export const updateUserSchema = z.object({
  displayName: displayNameSchema.optional(),
  username: usernameSchema.optional(),
  departmentId: uuidSchema.optional().nullable(),
  roleId: uuidSchema.optional().nullable(),
  timezone: timezoneSchema.optional(),
  locale: localeSchema.optional(),
  tagIds: z.array(uuidSchema).optional(),
});

export const updatePresenceSchema = z.object({
  status: z.enum(['ONLINE', 'AWAY', 'DND', 'OFFLINE']),
  message: z.string().max(100).optional(),
});

// =============================================================================
// Organization Schemas
// =============================================================================

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema,
  complianceMode: z.enum(['HIPAA', 'GDPR']).optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  logoUrl: z.string().url().optional().nullable(),
  maxFileSize: z.number().int().positive().optional(),
  storageLimit: z.number().int().positive().optional().nullable(),
});

// =============================================================================
// Department & Role Schemas
// =============================================================================

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  rank: z.number().int().min(0).optional(),
  mfaRequired: z.boolean().optional(),
  mfaMethods: z.array(z.enum(['TOTP', 'EMAIL'])).optional(),
});

export const createRoleSchema = z.object({
  departmentId: uuidSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  rank: z.number().int().min(0).optional(),
  permissions: z.array(z.string()).optional(),
  mfaRequired: z.boolean().optional(),
  mfaMethods: z.array(z.enum(['TOTP', 'EMAIL'])).optional(),
});

// =============================================================================
// Permission Schemas
// =============================================================================

export const permissionDirectionSchema = z.enum([
  'HIGHER_TO_LOWER',
  'LOWER_TO_HIGHER',
  'BIDIRECTIONAL',
]);

export const setDepartmentPermissionSchema = z.object({
  sourceDeptId: uuidSchema,
  targetDeptId: uuidSchema,
  direction: permissionDirectionSchema,
  canChat: z.boolean().optional(),
  canCall: z.boolean().optional(),
  canViewPresence: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
});

export const setUserPermissionSchema = z.object({
  sourceUserId: uuidSchema,
  targetUserId: uuidSchema,
  direction: permissionDirectionSchema,
  canChat: z.boolean().optional(),
  canCall: z.boolean().optional(),
  canViewPresence: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
});

// =============================================================================
// Conversation Schemas
// =============================================================================

export const createConversationSchema = z.object({
  type: z.enum(['DIRECT', 'GROUP']),
  participantIds: z.array(uuidSchema).min(1).max(50),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const updateConversationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const addParticipantsSchema = z.object({
  userIds: z.array(uuidSchema).min(1).max(50),
});

export const updateParticipantSchema = z.object({
  isAdmin: z.boolean().optional(),
  isMuted: z.boolean().optional(),
});

export const conversationRequestSchema = z.object({
  recipientId: uuidSchema,
  message: z.string().max(500).optional(),
});

// =============================================================================
// Message Schemas
// =============================================================================

export const sendMessageSchema = z.object({
  content: z.string().max(10000).optional(),
  fileIds: z.array(uuidSchema).max(10).optional(),
  replyToId: uuidSchema.optional(),
}).refine(
  (data) => data.content || (data.fileIds && data.fileIds.length > 0),
  { message: 'Message must have content or files' }
);

export const editMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

export const addReactionSchema = z.object({
  emoji: z.string().min(1).max(10),
});

// =============================================================================
// Meeting Schemas
// =============================================================================

export const meetingSettingsSchema = z.object({
  waitingRoomEnabled: z.boolean().optional(),
  joinBeforeHost: z.boolean().optional(),
  allowScreenShare: z.boolean().optional(),
  allowRecording: z.boolean().optional(),
  muteOnJoin: z.boolean().optional(),
  videoOffOnJoin: z.boolean().optional(),
});

export const meetingReminderSchema = z.object({
  minutesBefore: z.number().int().min(1).max(10080), // Max 1 week
  overrideDnd: z.boolean().optional(),
});

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  timezone: timezoneSchema.optional(),
  recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  participantIds: z.array(uuidSchema).min(1).max(100),
  settings: meetingSettingsSchema.optional(),
  reminders: z.array(meetingReminderSchema).max(5).optional(),
}).refine(
  (data) => new Date(data.scheduledEnd) > new Date(data.scheduledStart),
  { message: 'End time must be after start time', path: ['scheduledEnd'] }
);

export const updateMeetingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  timezone: timezoneSchema.optional(),
  settings: meetingSettingsSchema.optional(),
});

// =============================================================================
// Call Schemas
// =============================================================================

export const initiateCallSchema = z.object({
  participantIds: z.array(uuidSchema).min(1).max(50),
  conversationId: uuidSchema.optional(),
  isVideo: z.boolean().optional(),
});

// =============================================================================
// File Schemas
// =============================================================================

export const uploadFileSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive(),
});

// =============================================================================
// Export Types
// =============================================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type InitiateCallInput = z.infer<typeof initiateCallSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
