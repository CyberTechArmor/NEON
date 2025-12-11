import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuthStore } from './auth';
import { useChatStore } from './chat';
import { showMessageNotification, showTestAlertNotification } from './notifications';

// Get WebSocket URL from runtime config (docker), build-time env, or fallback
const getWsUrl = (): string => {
  // Runtime config from docker-entrypoint.sh
  if (typeof window !== 'undefined' && (window as any).__NEON_CONFIG__?.wsUrl) {
    return (window as any).__NEON_CONFIG__.wsUrl;
  }
  // Build-time environment variable
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  // Fallback for local development
  return 'http://localhost:3001';
};

// Reconnection configuration
const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
const BASE_RECONNECT_DELAY = 1000; // 1 second initial delay

/**
 * Calculate exponential backoff delay with jitter
 */
function getReconnectDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, attempt),
    MAX_RECONNECT_DELAY
  );
  // Add jitter (0-1000ms) to prevent thundering herd
  const jitter = Math.random() * 1000;
  return exponentialDelay + jitter;
}

// Pending message queue for offline sends
interface PendingMessage {
  event: string;
  data: any;
  timestamp: number;
}

let pendingMessages: PendingMessage[] = [];
let reconnectAttempts = 0;
let manualReconnectTimer: ReturnType<typeof setTimeout> | null = null;

interface PresenceUser {
  odId: string;
  status: 'ONLINE' | 'AWAY' | 'DND' | 'OFFLINE' | 'online' | 'away' | 'busy' | 'offline';
  statusMessage?: string;
  lastSeen?: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown> | null;
}

interface TestAlert {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  acknowledged: boolean;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connectionState: ConnectionState;
  lastConnectedAt: number | null;
  lastActivityAt: number | null;
  reconnectAttempt: number;
  presence: Record<string, PresenceUser>;
  notifications: Notification[];
  unreadNotificationCount: number;
  activeTestAlert: TestAlert | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  sendMessage: (conversationId: string, content: string, replyToId?: string) => void;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  removeReaction: (messageId: string, emoji: string) => void;
  sendTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  updatePresence: (status: string, statusMessage?: string) => void;
  updateActivity: () => void;
  isUserActive: (userId: string) => boolean;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  setNotifications: (notifications: Notification[]) => void;
  sendTestAlert: () => void;
  acknowledgeTestAlert: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  connectionState: 'disconnected',
  lastConnectedAt: null,
  lastActivityAt: null,
  reconnectAttempt: 0,
  presence: {},
  notifications: [],
  unreadNotificationCount: 0,
  activeTestAlert: null,

  connect: () => {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return;

    // Don't create duplicate connections
    const existingSocket = get().socket;
    if (existingSocket && (existingSocket.connected || get().connectionState === 'connecting')) {
      return;
    }

    // Clear any pending manual reconnect timer
    if (manualReconnectTimer) {
      clearTimeout(manualReconnectTimer);
      manualReconnectTimer = null;
    }

    set({ connectionState: 'connecting' });

    const socket = io(getWsUrl(), {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: false, // We'll handle reconnection manually with exponential backoff
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected');
      const now = Date.now();
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection

      // Flush pending messages
      if (pendingMessages.length > 0) {
        console.log(`[Socket] Flushing ${pendingMessages.length} pending messages`);
        const messagesToSend = [...pendingMessages];
        pendingMessages = [];
        for (const msg of messagesToSend) {
          // Only send messages that are less than 5 minutes old
          if (Date.now() - msg.timestamp < 5 * 60 * 1000) {
            socket.emit(msg.event, msg.data);
          }
        }
      }

      set({
        isConnected: true,
        connectionState: 'connected',
        lastConnectedAt: now,
        lastActivityAt: now,
        reconnectAttempt: 0,
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      set({ isConnected: false, connectionState: 'disconnected' });

      // Handle reconnection based on disconnect reason
      if (reason === 'io server disconnect') {
        // Server disconnected us, probably auth issue - don't auto reconnect
        console.log('[Socket] Server disconnected, not auto-reconnecting');
      } else if (reason !== 'io client disconnect') {
        // Client didn't disconnect intentionally, schedule reconnect
        get().reconnect();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      set({ isConnected: false, connectionState: 'disconnected' });
      get().reconnect();
    });

    // Message events - use correct event names matching backend SocketEvents
    socket.on('message:received', (message: any) => {
      console.log('[Socket] Message received via WebSocket:', message);
      // Handle message received event from backend
      const formattedMessage = {
        ...message,
        sender: {
          id: message.sender?.id,
          name: message.sender?.displayName || message.sender?.name,
          displayName: message.sender?.displayName,
          avatarUrl: message.sender?.avatarUrl,
        },
      };
      useChatStore.getState().addMessage(message.conversationId, formattedMessage);

      // Update conversation's lastMessage for real-time updates
      useChatStore.getState().updateConversation(message.conversationId, {
        lastMessage: formattedMessage,
        updatedAt: message.createdAt,
      });

      // Show toast notification if message is not for current conversation
      // and not sent by the current user
      const currentConversationId = useChatStore.getState().currentConversationId;
      const currentUserId = useAuthStore.getState().user?.id;
      const isOwnMessage = message.senderId === currentUserId;

      // Check both the store state AND the current URL path for extra reliability
      // This handles cases where the store might not be in sync
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const isViewingConversationUrl = currentPath === `/chat/${message.conversationId}`;
      const isCurrentConversation = message.conversationId === currentConversationId || isViewingConversationUrl;

      // Also check if the user is even on the chat page
      const isOnChatPage = currentPath.startsWith('/chat');

      // Show notifications for messages not sent by current user
      if (!isOwnMessage) {
        const senderName = message.sender?.displayName || message.sender?.name || 'Someone';
        const messageContent = message.content || '[Attachment]';

        // Show in-app toast and browser notification if:
        // 1. User is NOT on the chat page at all, OR
        // 2. User is on the chat page but viewing a different conversation
        if (!isOnChatPage || !isCurrentConversation) {
          const messagePreview = messageContent.substring(0, 50);
          toast(
            `${senderName}: ${messagePreview}${messageContent.length > 50 ? '...' : ''}`,
            {
              icon: '💬',
              duration: 4000,
              position: 'top-right',
            }
          );

          // Show sound + browser notification (handled by notification store settings)
          // Only show when user is NOT active on this chat
          showMessageNotification(senderName, messageContent, message.conversationId);
        }
      }

      // Update activity timestamp
      set({ lastActivityAt: Date.now() });
    });

    socket.on('message:edited', (data: any) => {
      useChatStore.getState().updateMessage(
        data.conversationId,
        data.messageId,
        { content: data.content, editedAt: data.editedAt }
      );
    });

    socket.on('message:deleted', (data: any) => {
      useChatStore.getState().removeMessage(data.conversationId, data.messageId);
    });

    socket.on('message:reaction:added', (data: any) => {
      const messages = useChatStore.getState().messages[data.conversationId];
      const message = messages?.find((m) => m.id === data.messageId);
      if (message) {
        const reactions = [...message.reactions, { emoji: data.emoji, userId: data.userId, userName: data.userDisplayName }];
        useChatStore.getState().updateMessage(data.conversationId, data.messageId, {
          reactions,
        });
      }
    });

    socket.on('message:reaction:removed', (data: any) => {
      const messages = useChatStore.getState().messages[data.conversationId];
      const message = messages?.find((m) => m.id === data.messageId);
      if (message) {
        const reactions = message.reactions.filter(
          (r) => !(r.emoji === data.emoji && r.userId === data.userId)
        );
        useChatStore.getState().updateMessage(data.conversationId, data.messageId, {
          reactions,
        });
      }
    });

    // Typing events - use correct event names matching backend SocketEvents
    socket.on('typing:indicator', (data: any) => {
      if (data.isTyping) {
        useChatStore.getState().setTypingUser(data.conversationId, {
          odId: data.userId,
          name: data.displayName,
          startedAt: Date.now(),
        });
      } else {
        useChatStore.getState().removeTypingUser(data.conversationId, data.userId);
      }
    });

    // Presence events
    socket.on('presence:update', (data) => {
      set((state) => ({
        presence: {
          ...state.presence,
          [data.userId]: {
            odId: data.userId,
            status: data.status,
            statusMessage: data.statusMessage,
            lastSeen: data.lastSeen,
          },
        },
      }));
    });

    socket.on('presence:batch', (users) => {
      const presence: Record<string, PresenceUser> = {};
      for (const user of users) {
        presence[user.userId] = {
          odId: user.userId,
          status: user.status,
          statusMessage: user.statusMessage,
          lastSeen: user.lastSeen,
        };
      }
      set((state) => ({
        presence: { ...state.presence, ...presence },
      }));
    });

    // Conversation events - use correct event names matching backend SocketEvents
    socket.on('conversation:created', (conversation: any) => {
      // The event sends the conversation directly, not wrapped in data
      useChatStore.getState().addConversation(conversation);
    });

    socket.on('conversation:updated', (data: any) => {
      useChatStore.getState().updateConversation(data.conversationId, data.changes);
    });

    // Call events
    socket.on('call:incoming', (data) => {
      // Handle incoming call notification
      console.log('[Socket] Incoming call:', data);
      // This will be handled by a call notification component
    });

    // Notification events - real-time notifications via WebSocket
    socket.on('notification', (notification: any) => {
      console.log('[Socket] Notification received:', notification);
      set((state) => ({
        notifications: [{ ...notification, read: false }, ...state.notifications],
        unreadNotificationCount: state.unreadNotificationCount + 1,
        lastActivityAt: Date.now(),
      }));
    });

    // Test alert events - alerts that show on all logged-in devices
    socket.on('test:alert', (alert: any) => {
      console.log('[Socket] Test alert received:', alert);
      set({
        activeTestAlert: {
          id: alert.id,
          title: alert.title,
          body: alert.body,
          createdAt: alert.createdAt,
          acknowledged: false,
        },
        lastActivityAt: Date.now(),
      });

      // Play sound and show browser notification for test alerts
      showTestAlertNotification(alert.title, alert.body);
    });

    // Test alert acknowledged on another device
    socket.on('test:alert:acknowledged', () => {
      console.log('[Socket] Test alert acknowledged on another device');
      set({ activeTestAlert: null });
    });

    set({ socket });
  },

  disconnect: () => {
    // Clear any pending reconnect timer
    if (manualReconnectTimer) {
      clearTimeout(manualReconnectTimer);
      manualReconnectTimer = null;
    }

    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({
        socket: null,
        isConnected: false,
        connectionState: 'disconnected',
        reconnectAttempt: 0,
      });
    }

    // Clear pending messages on intentional disconnect
    pendingMessages = [];
    reconnectAttempts = 0;
  },

  reconnect: () => {
    const state = get();
    const { accessToken } = useAuthStore.getState();

    // Don't reconnect if no access token or already connecting
    if (!accessToken || state.connectionState === 'connecting') {
      return;
    }

    // Don't reconnect if we've exceeded max attempts (20)
    if (reconnectAttempts >= 20) {
      console.log('[Socket] Max reconnect attempts reached, giving up');
      toast.error('Unable to connect. Please refresh the page.');
      return;
    }

    // Clean up existing socket
    if (state.socket) {
      state.socket.disconnect();
      set({ socket: null });
    }

    reconnectAttempts++;
    const delay = getReconnectDelay(reconnectAttempts);

    console.log(`[Socket] Scheduling reconnect attempt ${reconnectAttempts} in ${Math.round(delay)}ms`);
    set({ connectionState: 'reconnecting', reconnectAttempt: reconnectAttempts });

    manualReconnectTimer = setTimeout(() => {
      console.log(`[Socket] Attempting reconnect #${reconnectAttempts}`);
      get().connect();
    }, delay);
  },

  sendMessage: (conversationId: string, content: string, replyToId?: string) => {
    const { socket, isConnected } = get();
    const data = { conversationId, content, replyToId };

    if (socket && isConnected) {
      socket.emit('message:send', data);
    } else {
      // Queue message for later
      pendingMessages.push({
        event: 'message:send',
        data,
        timestamp: Date.now(),
      });
      console.log('[Socket] Message queued for later delivery');
    }
  },

  editMessage: (messageId: string, content: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:edit', { messageId, content });
  },

  deleteMessage: (messageId: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:delete', { messageId });
  },

  addReaction: (messageId: string, emoji: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:react', { messageId, emoji });
  },

  removeReaction: (messageId: string, emoji: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:unreact', { messageId, emoji });
  },

  sendTyping: (conversationId: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('typing:start', { conversationId });
  },

  stopTyping: (conversationId: string) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('typing:stop', { conversationId });
  },

  joinConversation: (conversationId: string) => {
    const { socket, isConnected } = get();
    if (!socket) {
      console.warn('[Socket] joinConversation called but socket is null');
      return;
    }
    if (!isConnected) {
      console.warn('[Socket] joinConversation called but not connected');
      return;
    }
    console.log('[Socket] Joining conversation room:', conversationId);
    socket.emit('conversation:join', conversationId);
  },

  leaveConversation: (conversationId: string) => {
    const { socket, isConnected } = get();
    if (!socket || !isConnected) return;
    console.log('[Socket] Leaving conversation room:', conversationId);
    socket.emit('conversation:leave', conversationId);
  },

  updatePresence: (status: string, statusMessage?: string) => {
    const { socket } = get();
    if (!socket) return;
    // Send uppercase status for backend compatibility
    const normalizedStatus = status.toUpperCase() === 'BUSY' ? 'DND' : status.toUpperCase();
    socket.emit('presence:update', { status: normalizedStatus, statusMessage });
  },

  updateActivity: () => {
    set({ lastActivityAt: Date.now() });
  },

  isUserActive: (userId: string) => {
    const { presence, lastActivityAt } = get();
    const userPresence = presence[userId];
    if (!userPresence) return false;

    // User is active if they have ONLINE status and were active within last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const lastSeen = userPresence.lastSeen ? new Date(userPresence.lastSeen).getTime() : 0;
    return userPresence.status === 'ONLINE' && lastSeen > fiveMinutesAgo;
  },

  addNotification: (notification: Notification) => {
    set((state: SocketState) => ({
      notifications: [notification, ...state.notifications],
      unreadNotificationCount: notification.read
        ? state.unreadNotificationCount
        : state.unreadNotificationCount + 1,
    }));
  },

  markNotificationRead: (id: string) => {
    const { socket } = get();
    if (socket) {
      socket.emit('notification:read', id);
    }
    set((state: SocketState) => ({
      notifications: state.notifications.map((n: Notification) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadNotificationCount: Math.max(0, state.unreadNotificationCount - 1),
    }));
  },

  markAllNotificationsRead: () => {
    set((state: SocketState) => ({
      notifications: state.notifications.map((n: Notification) => ({ ...n, read: true })),
      unreadNotificationCount: 0,
    }));
  },

  setNotifications: (notifications: Notification[]) => {
    set({
      notifications,
      unreadNotificationCount: notifications.filter((n: Notification) => !n.read).length,
    });
  },

  sendTestAlert: () => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('test:alert:send', {
      title: 'Test Alert',
      body: 'This is a test alert sent to all your logged-in devices.',
    });
  },

  acknowledgeTestAlert: () => {
    const { socket, activeTestAlert } = get();
    if (!socket || !activeTestAlert) return;
    socket.emit('test:alert:acknowledge', { id: activeTestAlert.id });
    set({ activeTestAlert: null });
  },
}));

// Setup visibility change handler for reconnection on tab focus
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const state = useSocketStore.getState();
      const { accessToken } = useAuthStore.getState();

      // Only attempt reconnect if:
      // 1. We have an access token
      // 2. We're not connected
      // 3. We're not already connecting/reconnecting
      if (
        accessToken &&
        !state.isConnected &&
        state.connectionState === 'disconnected'
      ) {
        console.log('[Socket] Tab became visible, attempting reconnect');
        // Reset reconnect attempts when user returns to tab
        reconnectAttempts = 0;
        state.connect();
      }
    }
  });

  // Also handle online/offline events
  window.addEventListener('online', () => {
    const state = useSocketStore.getState();
    const { accessToken } = useAuthStore.getState();

    if (accessToken && !state.isConnected) {
      console.log('[Socket] Network came online, attempting reconnect');
      reconnectAttempts = 0;
      state.connect();
    }
  });

  window.addEventListener('offline', () => {
    console.log('[Socket] Network went offline');
    // Clear reconnect timer since we can't connect anyway
    if (manualReconnectTimer) {
      clearTimeout(manualReconnectTimer);
      manualReconnectTimer = null;
    }
  });
}
