/**
 * Real-time Event Types
 *
 * Socket.io event definitions for client-server communication
 */

import type { Message, PresenceUpdate, TypingIndicator, ReadReceipt, Conversation } from './chat';
import type { Call, Meeting } from './meeting';

// =============================================================================
// Event Names
// =============================================================================

export const SocketEvents = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  RECONNECT: 'reconnect',

  // Authentication
  AUTH: 'auth',
  AUTH_SUCCESS: 'auth:success',
  AUTH_ERROR: 'auth:error',

  // Presence
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_SUBSCRIBE: 'presence:subscribe',
  PRESENCE_UNSUBSCRIBE: 'presence:unsubscribe',

  // Conversations
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_DELETED: 'conversation:deleted',

  // Messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_SENT: 'message:sent',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_REACTION_ADDED: 'message:reaction:added',
  MESSAGE_REACTION_REMOVED: 'message:reaction:removed',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  TYPING_INDICATOR: 'typing:indicator',

  // Read receipts
  MESSAGE_READ: 'message:read',
  READ_RECEIPT: 'read:receipt',

  // Calls
  CALL_INITIATE: 'call:initiate',
  CALL_INCOMING: 'call:incoming',
  CALL_ANSWER: 'call:answer',
  CALL_DECLINE: 'call:decline',
  CALL_CANCEL: 'call:cancel',
  CALL_END: 'call:end',
  CALL_ENDED: 'call:ended',
  CALL_PARTICIPANT_JOINED: 'call:participant:joined',
  CALL_PARTICIPANT_LEFT: 'call:participant:left',

  // Meetings
  MEETING_STARTING: 'meeting:starting',
  MEETING_STARTED: 'meeting:started',
  MEETING_ENDED: 'meeting:ended',
  MEETING_REMINDER: 'meeting:reminder',
  MEETING_INVITE: 'meeting:invite',

  // Notifications
  NOTIFICATION: 'notification',
  NOTIFICATION_READ: 'notification:read',

  // Freeze
  CONVERSATION_FROZEN: 'conversation:frozen',
  CONVERSATION_UNFROZEN: 'conversation:unfrozen',

  // Test Alerts
  TEST_ALERT_SEND: 'test:alert:send',
  TEST_ALERT: 'test:alert',
  TEST_ALERT_ACKNOWLEDGE: 'test:alert:acknowledge',
  TEST_ALERT_ACKNOWLEDGED: 'test:alert:acknowledged',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

// =============================================================================
// Client-to-Server Events
// =============================================================================

export interface ClientToServerEvents {
  // Auth
  [SocketEvents.AUTH]: (token: string, callback: (response: AuthResponse) => void) => void;

  // Presence
  [SocketEvents.PRESENCE_UPDATE]: (data: PresenceUpdatePayload) => void;
  [SocketEvents.PRESENCE_SUBSCRIBE]: (userIds: string[]) => void;
  [SocketEvents.PRESENCE_UNSUBSCRIBE]: (userIds: string[]) => void;

  // Conversations
  [SocketEvents.CONVERSATION_JOIN]: (conversationId: string) => void;
  [SocketEvents.CONVERSATION_LEAVE]: (conversationId: string) => void;

  // Messages
  [SocketEvents.MESSAGE_SEND]: (
    data: SendMessagePayload,
    callback: (response: MessageSentResponse) => void
  ) => void;

  // Typing
  [SocketEvents.TYPING_START]: (conversationId: string) => void;
  [SocketEvents.TYPING_STOP]: (conversationId: string) => void;

  // Read receipts
  [SocketEvents.MESSAGE_READ]: (data: MessageReadPayload) => void;

  // Calls
  [SocketEvents.CALL_INITIATE]: (
    data: CallInitiatePayload,
    callback: (response: CallInitiatedResponse) => void
  ) => void;
  [SocketEvents.CALL_ANSWER]: (
    callId: string,
    callback: (response: CallAnsweredResponse) => void
  ) => void;
  [SocketEvents.CALL_DECLINE]: (callId: string) => void;
  [SocketEvents.CALL_CANCEL]: (callId: string) => void;
  [SocketEvents.CALL_END]: (callId: string) => void;

  // Notifications
  [SocketEvents.NOTIFICATION_READ]: (notificationId: string) => void;

  // Test Alerts
  [SocketEvents.TEST_ALERT_SEND]: (data: TestAlertSendPayload) => void;
  [SocketEvents.TEST_ALERT_ACKNOWLEDGE]: (data: TestAlertAcknowledgePayload) => void;
}

// =============================================================================
// Server-to-Client Events
// =============================================================================

export interface ServerToClientEvents {
  // Connection
  [SocketEvents.ERROR]: (error: SocketError) => void;

  // Auth
  [SocketEvents.AUTH_SUCCESS]: (data: AuthSuccessPayload) => void;
  [SocketEvents.AUTH_ERROR]: (error: SocketError) => void;

  // Presence
  [SocketEvents.PRESENCE_UPDATE]: (data: PresenceUpdate) => void;

  // Conversations
  [SocketEvents.CONVERSATION_CREATED]: (conversation: Conversation) => void;
  [SocketEvents.CONVERSATION_UPDATED]: (data: ConversationUpdatedPayload) => void;
  [SocketEvents.CONVERSATION_DELETED]: (conversationId: string) => void;
  [SocketEvents.CONVERSATION_FROZEN]: (data: ConversationFrozenPayload) => void;
  [SocketEvents.CONVERSATION_UNFROZEN]: (conversationId: string) => void;

  // Messages
  [SocketEvents.MESSAGE_RECEIVED]: (message: Message) => void;
  [SocketEvents.MESSAGE_EDITED]: (data: MessageEditedPayload) => void;
  [SocketEvents.MESSAGE_DELETED]: (data: MessageDeletedPayload) => void;
  [SocketEvents.MESSAGE_REACTION_ADDED]: (data: ReactionPayload) => void;
  [SocketEvents.MESSAGE_REACTION_REMOVED]: (data: ReactionPayload) => void;

  // Typing
  [SocketEvents.TYPING_INDICATOR]: (data: TypingIndicator) => void;

  // Read receipts
  [SocketEvents.READ_RECEIPT]: (data: ReadReceipt) => void;

  // Calls
  [SocketEvents.CALL_INCOMING]: (call: Call) => void;
  [SocketEvents.CALL_ENDED]: (data: CallEndedPayload) => void;
  [SocketEvents.CALL_PARTICIPANT_JOINED]: (data: CallParticipantPayload) => void;
  [SocketEvents.CALL_PARTICIPANT_LEFT]: (data: CallParticipantPayload) => void;

  // Meetings
  [SocketEvents.MEETING_STARTING]: (meeting: Meeting) => void;
  [SocketEvents.MEETING_STARTED]: (meetingId: string) => void;
  [SocketEvents.MEETING_ENDED]: (meetingId: string) => void;
  [SocketEvents.MEETING_REMINDER]: (data: MeetingReminderPayload) => void;
  [SocketEvents.MEETING_INVITE]: (meeting: Meeting) => void;

  // Notifications
  [SocketEvents.NOTIFICATION]: (notification: NotificationPayload) => void;

  // Test Alerts
  [SocketEvents.TEST_ALERT]: (alert: TestAlertPayload) => void;
  [SocketEvents.TEST_ALERT_ACKNOWLEDGED]: (data: TestAlertAcknowledgePayload) => void;
}

// =============================================================================
// Payload Types
// =============================================================================

export interface AuthResponse {
  success: boolean;
  error?: string;
}

export interface AuthSuccessPayload {
  userId: string;
  orgId: string;
}

export interface PresenceUpdatePayload {
  status: 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE';
  message?: string;
}

export interface SendMessagePayload {
  conversationId: string;
  content?: string;
  fileIds?: string[];
  replyToId?: string;
  tempId: string; // Client-generated ID for optimistic updates
}

export interface MessageSentResponse {
  success: boolean;
  message?: Message;
  tempId: string;
  error?: string;
}

export interface MessageReadPayload {
  conversationId: string;
  messageId: string;
}

export interface ConversationUpdatedPayload {
  conversationId: string;
  changes: Partial<Conversation>;
}

export interface ConversationFrozenPayload {
  conversationId: string;
  frozenBy: {
    id: string;
    displayName: string;
  };
}

export interface MessageEditedPayload {
  messageId: string;
  conversationId: string;
  content: string;
  editedAt: string;
}

export interface MessageDeletedPayload {
  messageId: string;
  conversationId: string;
  deletedBy: string;
}

export interface ReactionPayload {
  messageId: string;
  conversationId: string;
  userId: string;
  userDisplayName: string;
  emoji: string;
}

export interface CallInitiatePayload {
  participantIds: string[];
  conversationId?: string;
  isVideo?: boolean;
}

export interface CallInitiatedResponse {
  success: boolean;
  call?: Call;
  livekitUrl?: string;
  token?: string;
  roomName?: string;
  error?: string;
}

export interface CallAnsweredResponse {
  success: boolean;
  livekitUrl?: string;
  token?: string;
  roomName?: string;
  error?: string;
}

export interface CallEndedPayload {
  callId: string;
  reason: 'completed' | 'missed' | 'declined' | 'failed' | 'busy';
}

export interface CallParticipantPayload {
  callId: string;
  participant: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface MeetingReminderPayload {
  meeting: Meeting;
  minutesUntilStart: number;
}

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface SocketError {
  code: string;
  message: string;
}

// Test Alert Types
export interface TestAlertSendPayload {
  title: string;
  body: string;
}

export interface TestAlertPayload {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface TestAlertAcknowledgePayload {
  id: string;
}
