-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "federation";

-- CreateEnum
CREATE TYPE "public"."ComplianceMode" AS ENUM ('HIPAA', 'GDPR');

-- CreateEnum
CREATE TYPE "public"."MfaMethod" AS ENUM ('TOTP', 'EMAIL');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "public"."PresenceStatus" AS ENUM ('ONLINE', 'AWAY', 'DND', 'OFFLINE');

-- CreateEnum
CREATE TYPE "public"."PermissionDirection" AS ENUM ('HIGHER_TO_LOWER', 'LOWER_TO_HIGHER', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "public"."ConversationType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "public"."MessageType" AS ENUM ('TEXT', 'FILE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MeetingRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('MESSAGE', 'MENTION', 'CALL', 'MEETING_REMINDER', 'MEETING_INVITE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."SsoProvider" AS ENUM ('LDAP', 'OAUTH2', 'OIDC', 'SAML');

-- CreateEnum
CREATE TYPE "public"."BackupType" AS ENUM ('FULL', 'DIFFERENTIAL', 'DATABASE_ONLY', 'STORAGE_ONLY');

-- CreateEnum
CREATE TYPE "public"."BackupStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "complianceMode" "public"."ComplianceMode" NOT NULL DEFAULT 'HIPAA',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "storageLimit" BIGINT,
    "storageUsed" BIGINT NOT NULL DEFAULT 0,
    "maxFileSize" BIGINT NOT NULL DEFAULT 1073741824,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "smtpFromName" TEXT,
    "smtpFromEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Department" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
    "mfaMethods" "public"."MfaMethod"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Role" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settings" JSONB NOT NULL DEFAULT '{}',
    "mfaRequired" BOOLEAN,
    "mfaMethods" "public"."MfaMethod"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tag" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DepartmentPermission" (
    "id" UUID NOT NULL,
    "sourceDeptId" UUID NOT NULL,
    "targetDeptId" UUID NOT NULL,
    "direction" "public"."PermissionDirection" NOT NULL,
    "canChat" BOOLEAN NOT NULL DEFAULT true,
    "canCall" BOOLEAN NOT NULL DEFAULT true,
    "canViewPresence" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RolePermission" (
    "id" UUID NOT NULL,
    "sourceRoleId" UUID NOT NULL,
    "targetRoleId" UUID NOT NULL,
    "direction" "public"."PermissionDirection" NOT NULL,
    "canChat" BOOLEAN NOT NULL DEFAULT true,
    "canCall" BOOLEAN NOT NULL DEFAULT true,
    "canViewPresence" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserPermission" (
    "id" UUID NOT NULL,
    "sourceUserId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "direction" "public"."PermissionDirection" NOT NULL,
    "canChat" BOOLEAN NOT NULL DEFAULT true,
    "canCall" BOOLEAN NOT NULL DEFAULT true,
    "canViewPresence" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserRolePermission" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "userIsSource" BOOLEAN NOT NULL,
    "direction" "public"."PermissionDirection" NOT NULL,
    "canChat" BOOLEAN NOT NULL DEFAULT true,
    "canCall" BOOLEAN NOT NULL DEFAULT true,
    "canViewPresence" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "departmentId" UUID,
    "roleId" UUID,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "passwordHash" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "public"."UserStatus" NOT NULL DEFAULT 'PENDING',
    "presenceStatus" "public"."PresenceStatus" NOT NULL DEFAULT 'OFFLINE',
    "presenceMessage" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "storageLimit" BIGINT,
    "storageUsed" BIGINT NOT NULL DEFAULT 0,
    "ssoProviderId" UUID,
    "ssoExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedBy" UUID,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserTag" (
    "userId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" UUID NOT NULL,

    CONSTRAINT "UserTag_pkey" PRIMARY KEY ("userId","tagId")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "deviceId" UUID,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "name" TEXT,
    "type" TEXT,
    "platform" TEXT,
    "browser" TEXT,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "trustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SsoConfig" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "provider" "public"."SsoProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "attributeMapping" JSONB NOT NULL DEFAULT '{}',
    "jitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultDepartmentId" UUID,
    "defaultRoleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Conversation" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "type" "public"."ConversationType" NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "avatarUrl" TEXT,
    "createdBy" UUID,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationParticipant" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "canSendMessages" BOOLEAN NOT NULL DEFAULT true,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "frozenBy" UUID,
    "frozenAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "lastReadMessageId" UUID,
    "notificationsMuted" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedBy" UUID,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationRequest" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "message" TEXT,
    "approved" BOOLEAN,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ConversationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "type" "public"."MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "metadata" JSONB,
    "replyToId" UUID,
    "editedAt" TIMESTAMP(3),
    "originalContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageRead" (
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRead_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "public"."MessageReaction" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageFile" (
    "messageId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MessageFile_pkey" PRIMARY KEY ("messageId","fileId")
);

-- CreateTable
CREATE TABLE "public"."File" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Meeting" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "recurrence" "public"."MeetingRecurrence" NOT NULL DEFAULT 'NONE',
    "recurrenceRule" TEXT,
    "status" "public"."MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "waitingRoomEnabled" BOOLEAN NOT NULL DEFAULT false,
    "joinBeforeHost" BOOLEAN NOT NULL DEFAULT false,
    "livekitRoom" TEXT,
    "conversationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" UUID,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MeetingParticipant" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "invited" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseStatus" TEXT,
    "respondedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "canPresent" BOOLEAN NOT NULL DEFAULT true,
    "canUnmute" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MeetingReminder" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "overrideDnd" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeetingReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Recording" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "transcriptionStatus" TEXT,
    "transcriptionUrl" TEXT,
    "shareLink" TEXT,
    "shareLinkPublic" BOOLEAN NOT NULL DEFAULT false,
    "shareLinkExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Call" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "initiatorId" UUID NOT NULL,
    "isGroupCall" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" UUID,
    "livekitRoom" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CallParticipant" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'invited',

    CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "resourceType" TEXT,
    "resourceId" UUID,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "pushSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApiKey" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rateLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" UUID,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GuestOrganization" (
    "id" UUID NOT NULL,
    "hostOrgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mappedDepartmentId" UUID,
    "mappedRoleId" UUID,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "GuestOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GuestMember" (
    "id" UUID NOT NULL,
    "guestOrgId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "inviteToken" TEXT,
    "inviteExpires" TIMESTAMP(3),
    "status" "public"."UserStatus" NOT NULL DEFAULT 'PENDING',
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "federation"."FederationBridge" (
    "id" UUID NOT NULL,
    "sourceOrgId" UUID NOT NULL,
    "targetOrgId" UUID,
    "targetInstanceUrl" TEXT,
    "targetInstanceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "localPublicKey" TEXT NOT NULL,
    "remotePublicKey" TEXT,
    "accessConfig" JSONB NOT NULL DEFAULT '{}',
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initiatedBy" UUID NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" UUID,
    "severedAt" TIMESTAMP(3),
    "severedBy" UUID,
    "severedReason" TEXT,

    CONSTRAINT "FederationBridge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Backup" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "type" "public"."BackupType" NOT NULL,
    "status" "public"."BackupStatus" NOT NULL DEFAULT 'PENDING',
    "bucket" TEXT,
    "key" TEXT,
    "size" BIGINT,
    "scope" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,
    "completedAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DataRetentionPolicy" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "resourceType" TEXT NOT NULL,
    "retentionDays" INTEGER,
    "purgeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "purgeGraceDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PurgeRequest" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "scope" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "processedBy" UUID,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurgeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "public"."Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "public"."Organization"("slug");

-- CreateIndex
CREATE INDEX "Department_orgId_idx" ON "public"."Department"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_orgId_name_key" ON "public"."Department"("orgId", "name");

-- CreateIndex
CREATE INDEX "Role_orgId_idx" ON "public"."Role"("orgId");

-- CreateIndex
CREATE INDEX "Role_departmentId_idx" ON "public"."Role"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_departmentId_name_key" ON "public"."Role"("departmentId", "name");

-- CreateIndex
CREATE INDEX "Tag_orgId_idx" ON "public"."Tag"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_orgId_name_key" ON "public"."Tag"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentPermission_sourceDeptId_targetDeptId_key" ON "public"."DepartmentPermission"("sourceDeptId", "targetDeptId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_sourceRoleId_targetRoleId_key" ON "public"."RolePermission"("sourceRoleId", "targetRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_sourceUserId_targetUserId_key" ON "public"."UserPermission"("sourceUserId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRolePermission_userId_roleId_userIsSource_key" ON "public"."UserRolePermission"("userId", "roleId", "userIsSource");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "public"."User"("orgId");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "public"."User"("departmentId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "public"."User"("roleId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "public"."User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_email_key" ON "public"."User"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_username_key" ON "public"."User"("orgId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "User_ssoProviderId_ssoExternalId_key" ON "public"."User"("ssoProviderId", "ssoExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "public"."Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "public"."Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "public"."Session"("token");

-- CreateIndex
CREATE INDEX "Session_refreshToken_idx" ON "public"."Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "public"."Device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_fingerprint_key" ON "public"."Device"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "SsoConfig_orgId_idx" ON "public"."SsoConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "SsoConfig_orgId_name_key" ON "public"."SsoConfig"("orgId", "name");

-- CreateIndex
CREATE INDEX "Conversation_orgId_idx" ON "public"."Conversation"("orgId");

-- CreateIndex
CREATE INDEX "Conversation_type_idx" ON "public"."Conversation"("type");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "public"."Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "public"."ConversationParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "public"."ConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "ConversationRequest_recipientId_approved_idx" ON "public"."ConversationRequest"("recipientId", "approved");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "public"."Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "public"."Message"("senderId");

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_idx" ON "public"."MessageReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "public"."MessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "File_orgId_idx" ON "public"."File"("orgId");

-- CreateIndex
CREATE INDEX "File_uploadedBy_idx" ON "public"."File"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_livekitRoom_key" ON "public"."Meeting"("livekitRoom");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_conversationId_key" ON "public"."Meeting"("conversationId");

-- CreateIndex
CREATE INDEX "Meeting_orgId_idx" ON "public"."Meeting"("orgId");

-- CreateIndex
CREATE INDEX "Meeting_scheduledStart_idx" ON "public"."Meeting"("scheduledStart");

-- CreateIndex
CREATE INDEX "Meeting_status_idx" ON "public"."Meeting"("status");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "public"."MeetingParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "public"."MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingReminder_meetingId_minutesBefore_key" ON "public"."MeetingReminder"("meetingId", "minutesBefore");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_shareLink_key" ON "public"."Recording"("shareLink");

-- CreateIndex
CREATE INDEX "Recording_meetingId_idx" ON "public"."Recording"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_livekitRoom_key" ON "public"."Call"("livekitRoom");

-- CreateIndex
CREATE INDEX "Call_orgId_idx" ON "public"."Call"("orgId");

-- CreateIndex
CREATE INDEX "Call_startedAt_idx" ON "public"."Call"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallParticipant_callId_userId_key" ON "public"."CallParticipant"("callId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "public"."Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "public"."Notification"("createdAt");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "public"."PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "public"."PushSubscription"("userId", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "public"."ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_orgId_idx" ON "public"."ApiKey"("orgId");

-- CreateIndex
CREATE INDEX "GuestOrganization_hostOrgId_idx" ON "public"."GuestOrganization"("hostOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestMember_inviteToken_key" ON "public"."GuestMember"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "GuestMember_guestOrgId_email_key" ON "public"."GuestMember"("guestOrgId", "email");

-- CreateIndex
CREATE INDEX "FederationBridge_sourceOrgId_idx" ON "federation"."FederationBridge"("sourceOrgId");

-- CreateIndex
CREATE INDEX "FederationBridge_targetOrgId_idx" ON "federation"."FederationBridge"("targetOrgId");

-- CreateIndex
CREATE INDEX "Backup_orgId_idx" ON "public"."Backup"("orgId");

-- CreateIndex
CREATE INDEX "Backup_status_idx" ON "public"."Backup"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DataRetentionPolicy_orgId_resourceType_key" ON "public"."DataRetentionPolicy"("orgId", "resourceType");

-- CreateIndex
CREATE INDEX "PurgeRequest_orgId_status_idx" ON "public"."PurgeRequest"("orgId", "status");

-- AddForeignKey
ALTER TABLE "public"."Department" ADD CONSTRAINT "Department_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Role" ADD CONSTRAINT "Role_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Role" ADD CONSTRAINT "Role_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tag" ADD CONSTRAINT "Tag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DepartmentPermission" ADD CONSTRAINT "DepartmentPermission_sourceDeptId_fkey" FOREIGN KEY ("sourceDeptId") REFERENCES "public"."Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DepartmentPermission" ADD CONSTRAINT "DepartmentPermission_targetDeptId_fkey" FOREIGN KEY ("targetDeptId") REFERENCES "public"."Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_sourceRoleId_fkey" FOREIGN KEY ("sourceRoleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_targetRoleId_fkey" FOREIGN KEY ("targetRoleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPermission" ADD CONSTRAINT "UserPermission_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserPermission" ADD CONSTRAINT "UserPermission_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRolePermission" ADD CONSTRAINT "UserRolePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRolePermission" ADD CONSTRAINT "UserRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_ssoProviderId_fkey" FOREIGN KEY ("ssoProviderId") REFERENCES "public"."SsoConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserTag" ADD CONSTRAINT "UserTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserTag" ADD CONSTRAINT "UserTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SsoConfig" ADD CONSTRAINT "SsoConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationRequest" ADD CONSTRAINT "ConversationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationRequest" ADD CONSTRAINT "ConversationRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageRead" ADD CONSTRAINT "MessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageRead" ADD CONSTRAINT "MessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageFile" ADD CONSTRAINT "MessageFile_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageFile" ADD CONSTRAINT "MessageFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Meeting" ADD CONSTRAINT "Meeting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Meeting" ADD CONSTRAINT "Meeting_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeetingReminder" ADD CONSTRAINT "MeetingReminder_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recording" ADD CONSTRAINT "Recording_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "public"."Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recording" ADD CONSTRAINT "Recording_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Call" ADD CONSTRAINT "Call_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CallParticipant" ADD CONSTRAINT "CallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "public"."Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CallParticipant" ADD CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GuestOrganization" ADD CONSTRAINT "GuestOrganization_hostOrgId_fkey" FOREIGN KEY ("hostOrgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GuestMember" ADD CONSTRAINT "GuestMember_guestOrgId_fkey" FOREIGN KEY ("guestOrgId") REFERENCES "public"."GuestOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "federation"."FederationBridge" ADD CONSTRAINT "FederationBridge_sourceOrgId_fkey" FOREIGN KEY ("sourceOrgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "federation"."FederationBridge" ADD CONSTRAINT "FederationBridge_targetOrgId_fkey" FOREIGN KEY ("targetOrgId") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Backup" ADD CONSTRAINT "Backup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
