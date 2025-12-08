/**
 * Extended Types for Database Models
 *
 * Type definitions that extend Prisma-generated types with additional
 * utility types for the application layer.
 */

import type { Prisma } from '@prisma/client';

// =============================================================================
// Re-export Prisma generated types
// =============================================================================

export type {
  Organization,
  Department,
  Role,
  Tag,
  User,
  UserTag,
  Session,
  Device,
  SsoConfig,
  Conversation,
  ConversationParticipant,
  ConversationRequest,
  Message,
  MessageRead,
  MessageReaction,
  MessageFile,
  File,
  Meeting,
  MeetingParticipant,
  MeetingReminder,
  Recording,
  Call,
  CallParticipant,
  Notification,
  PushSubscription,
  ApiKey,
  GuestOrganization,
  GuestMember,
  FederationBridge,
  Backup,
  DataRetentionPolicy,
  PurgeRequest,
  DepartmentPermission,
  RolePermission,
  UserPermission,
  UserRolePermission,
} from '@prisma/client';

export type {
  ComplianceMode,
  MfaMethod,
  UserStatus,
  PresenceStatus,
  PermissionDirection,
  ConversationType,
  MessageType,
  MeetingStatus,
  MeetingRecurrence,
  NotificationType,
  SsoProvider,
  BackupType,
  BackupStatus,
} from '@prisma/client';

// =============================================================================
// User Types
// =============================================================================

/** User with common relations */
export type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    organization: true;
    department: true;
    role: true;
    tags: { include: { tag: true } };
  };
}>;

/** User for session/auth context */
export type SessionUser = Prisma.UserGetPayload<{
  select: {
    id: true;
    orgId: true;
    email: true;
    username: true;
    displayName: true;
    avatarUrl: true;
    status: true;
    departmentId: true;
    roleId: true;
    mfaEnabled: true;
    timezone: true;
    locale: true;
  };
}>;

/** User for directory/search results */
export type UserSummary = Prisma.UserGetPayload<{
  select: {
    id: true;
    displayName: true;
    avatarUrl: true;
    presenceStatus: true;
    presenceMessage: true;
    department: { select: { id: true; name: true } };
    role: { select: { id: true; name: true } };
  };
}>;

// =============================================================================
// Organization Types
// =============================================================================

/** Organization with settings */
export type OrganizationWithSettings = Prisma.OrganizationGetPayload<{
  include: {
    departments: true;
    ssoConfigs: true;
  };
}>;

// =============================================================================
// Conversation Types
// =============================================================================

/** Conversation with participants and last message */
export type ConversationWithDetails = Prisma.ConversationGetPayload<{
  include: {
    participants: {
      include: {
        user: {
          select: {
            id: true;
            displayName: true;
            avatarUrl: true;
            presenceStatus: true;
          };
        };
      };
    };
  };
}>;

/** Message with sender and reactions */
export type MessageWithDetails = Prisma.MessageGetPayload<{
  include: {
    sender: {
      select: {
        id: true;
        displayName: true;
        avatarUrl: true;
      };
    };
    reactions: {
      include: {
        user: {
          select: {
            id: true;
            displayName: true;
          };
        };
      };
    };
    files: {
      include: {
        file: true;
      };
    };
    replyTo: {
      include: {
        sender: {
          select: {
            id: true;
            displayName: true;
          };
        };
      };
    };
  };
}>;

// =============================================================================
// Meeting Types
// =============================================================================

/** Meeting with participants */
export type MeetingWithParticipants = Prisma.MeetingGetPayload<{
  include: {
    creator: {
      select: {
        id: true;
        displayName: true;
        avatarUrl: true;
      };
    };
    participants: {
      include: {
        user: {
          select: {
            id: true;
            displayName: true;
            avatarUrl: true;
          };
        };
      };
    };
  };
}>;

// =============================================================================
// Permission Types
// =============================================================================

/** Resolved permission result */
export interface ResolvedPermission {
  canChat: boolean;
  canCall: boolean;
  canViewPresence: boolean;
  requiresApproval: boolean;
  source: 'user' | 'user_role' | 'role' | 'department' | 'default' | 'super_admin' | 'org_policy';
  sourceId?: string;
}

/** Permission check context */
export interface PermissionContext {
  sourceUserId: string;
  targetUserId: string;
  orgId: string;
}

// =============================================================================
// Audit Types
// =============================================================================

/** Audit log entry (from raw SQL table) */
export interface AuditLogEntry {
  id: bigint;
  createdAt: Date;
  orgId: string | null;
  actorId: string | null;
  actorType: 'user' | 'system' | 'federation' | 'api_key';
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  previousHash: string | null;
  entryHash: string;
  partitionKey: Date;
}

/** Audit log filter options */
export interface AuditLogFilter {
  orgId?: string;
  actorId?: string;
  action?: string | string[];
  resourceType?: string | string[];
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Federation Types
// =============================================================================

/** Federated user representation */
export interface FederatedUser {
  id: string;
  instanceId: string;
  instanceUrl: string;
  displayName: string;
  avatarUrl: string | null;
  organizationName: string;
}

// =============================================================================
// Pagination Types
// =============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface CursorPaginatedResult<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
  };
}
