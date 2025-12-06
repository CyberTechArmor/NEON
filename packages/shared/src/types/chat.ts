/**
 * Chat Types
 *
 * Types for conversations, messages, and real-time chat
 */

// =============================================================================
// Conversations
// =============================================================================

export type ConversationType = 'DIRECT' | 'GROUP';

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  participants: ConversationParticipant[];
  lastMessage: MessagePreview | null;
  unreadCount: number;
  isMuted: boolean;
  isFrozen: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationParticipant {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  presenceStatus: PresenceStatus;
  isOwner: boolean;
  isAdmin: boolean;
  isMuted: boolean;
  isFrozen: boolean;
  joinedAt: string;
}

export interface MessagePreview {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: MessageType;
  createdAt: string;
}

// =============================================================================
// Messages
// =============================================================================

export type MessageType = 'TEXT' | 'FILE' | 'SYSTEM';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender: MessageSender;
  type: MessageType;
  content: string | null;
  files: MessageFile[];
  replyTo: MessageReply | null;
  reactions: MessageReactionGroup[];
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
}

export interface MessageSender {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MessageFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
}

export interface MessageReply {
  id: string;
  senderId: string;
  senderName: string;
  content: string | null;
}

export interface MessageReactionGroup {
  emoji: string;
  count: number;
  users: { id: string; displayName: string }[];
  hasReacted: boolean; // Current user has reacted
}

// =============================================================================
// Create/Update DTOs
// =============================================================================

export interface CreateConversationRequest {
  type: ConversationType;
  participantIds: string[];
  name?: string; // Required for groups
  description?: string;
}

export interface UpdateConversationRequest {
  name?: string;
  description?: string;
}

export interface SendMessageRequest {
  conversationId: string;
  content?: string;
  fileIds?: string[];
  replyToId?: string;
}

export interface EditMessageRequest {
  content: string;
}

export interface AddReactionRequest {
  emoji: string;
}

// =============================================================================
// Group Management
// =============================================================================

export interface AddParticipantsRequest {
  userIds: string[];
}

export interface UpdateParticipantRequest {
  isAdmin?: boolean;
  isMuted?: boolean;
}

export interface TransferOwnershipRequest {
  newOwnerId: string;
}

// =============================================================================
// Conversation Requests (Permission System)
// =============================================================================

export interface ConversationRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterAvatar: string | null;
  message: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreateConversationRequestPayload {
  recipientId: string;
  message?: string;
}

export interface RespondToConversationRequestPayload {
  approved: boolean;
}

// =============================================================================
// Presence
// =============================================================================

import type { PresenceStatus } from './auth';
export type { PresenceStatus };

export interface PresenceUpdate {
  userId: string;
  status: PresenceStatus;
  message?: string | null;
  lastActiveAt?: string;
}

export interface UpdatePresenceRequest {
  status: PresenceStatus;
  message?: string;
}

// =============================================================================
// Typing Indicators
// =============================================================================

export interface TypingIndicator {
  userId: string;
  displayName: string;
  conversationId: string;
  isTyping: boolean;
}

// =============================================================================
// Read Receipts
// =============================================================================

export interface ReadReceipt {
  userId: string;
  messageId: string;
  readAt: string;
}

export interface MarkAsReadRequest {
  messageId: string;
}
