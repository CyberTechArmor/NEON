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

// Connection status enum
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

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

interface QueuedMessage {
  type: 'message' | 'typing' | 'presence' | 'reaction';
  data: any;
  timestamp: number;
}

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  lastConnectedAt: number | null;
  lastActivityAt: number | null;
  presence: Record<string, PresenceUser>;
  notifications: Notification[];
  unreadNotificationCount: number;
  activeTestAlert: TestAlert | null;
  reconnectAttempts: number;
  messageQueue: QueuedMessage[];

  // Actions
  connect: () => void;
  disconnect: () => void;
  forceReconnect: () => void;
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

// Reconnection configuration
const RECONNECT_CONFIG = {
  initialDelay: 1000,      // Start at 1 second
  maxDelay: 30000,         // Max 30 seconds
  jitterFactor: 0.3,       // Add up to 30% random jitter
  maxAttempts: Infinity,   // Keep trying indefinitely
};

// Heartbeat configuration
const HEARTBEAT_CONFIG = {
  interval: 25000,         // Send ping every 25 seconds
  timeout: 60000,          // Consider connection stale after 60 seconds
};

// Rate limiting for reconnection
const RATE_LIMIT = {
  maxReconnectsPerMinute: 10,
  windowMs: 60000,
};

// Track reconnection timestamps for rate limiting
let reconnectTimestamps: number[] = [];
let reconnectTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let staleConnectionTimer: NodeJS.Timeout | null = null;

// Calculate delay with exponential backoff and jitter
function calculateReconnectDelay(attempt: number): number {
  const baseDelay = Math.min(
    RECONNECT_CONFIG.initialDelay * Math.pow(2, attempt),
    RECONNECT_CONFIG.maxDelay
  );
  const jitter = baseDelay * RECONNECT_CONFIG.jitterFactor * Math.random();
  return Math.floor(baseDelay + jitter);
}

// Check if we're within rate limits for reconnection
function canReconnect(): boolean {
  const now = Date.now();
  // Remove old timestamps outside the window
  reconnectTimestamps = reconnectTimestamps.filter(
    ts => now - ts < RATE_LIMIT.windowMs
  );
  return reconnectTimestamps.length < RATE_LIMIT.maxReconnectsPerMinute;
}

// Record a reconnection attempt
function recordReconnectAttempt(): void {
  reconnectTimestamps.push(Date.now());
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  lastConnectedAt: null,
  lastActivityAt: null,
  presence: {},
  notifications: [],
  unreadNotificationCount: 0,
  activeTestAlert: null,
  reconnectAttempts: 0,
  messageQueue: [],

  connect: () => {
    const { accessToken } = useAuthStore.getState();
    const currentSocket = get().socket;

    // Don't connect if no token
    if (!accessToken) {
      console.log('[Socket] No access token, skipping connection');
      return;
    }

    // Don't create new connection if one exists and is connected or connecting
    if (currentSocket?.connected || currentSocket?.io?.engine?.readyState === 'opening') {
      console.log('[Socket] Already connected or connecting');
      return;
    }

    // Disconnect existing socket if any
    if (currentSocket) {
      currentSocket.disconnect();
    }

    // Clear any existing timers
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (staleConnectionTimer) {
      clearTimeout(staleConnectionTimer);
      staleConnectionTimer = null;
    }

    set({ connectionStatus: 'connecting' });
    console.log('[Socket] Connecting to', getWsUrl());

    const socket = io(getWsUrl(), {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: false, // We handle reconnection ourselves
      timeout: 20000,
      forceNew: true,
    });

    // Connection established
    socket.on('connect', () => {
      console.log('[Socket] Connected successfully');
      const now = Date.now();
      set({
        isConnected: true,
        connectionStatus: 'connected',
        lastConnectedAt: now,
        lastActivityAt: now,
        reconnectAttempts: 0,
      });

      // Flush queued messages
      const queue = get().messageQueue;
      if (queue.length > 0) {
        console.log(`[Socket] Flushing ${queue.length} queued messages`);
        queue.forEach((msg) => {
          try {
            switch (msg.type) {
              case 'message':
                socket.emit('message:send', msg.data);
                break;
              case 'typing':
                socket.emit(msg.data.isTyping ? 'typing:start' : 'typing:stop', msg.data);
                break;
              case 'presence':
                socket.emit('presence:update', msg.data);
                break;
              case 'reaction':
                socket.emit(msg.data.add ? 'message:react' : 'message:unreact', msg.data);
                break;
            }
          } catch (e) {
            console.error('[Socket] Failed to flush queued message:', e);
          }
        });
        set({ messageQueue: [] });
      }

      // Start heartbeat
      startHeartbeat(socket);
    });

    // Disconnection handler
    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      set({ isConnected: false, connectionStatus: 'disconnected' });
      stopHeartbeat();

      // Schedule reconnection
      scheduleReconnect();
    });

    // Connection error handler
    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      set({ isConnected: false, connectionStatus: 'disconnected' });
      stopHeartbeat();

      // Check if it's an auth error
      if (error.message.includes('Authentication') || error.message.includes('token')) {
        console.log('[Socket] Auth error, refreshing token before reconnect');
        // Attempt to refresh token before reconnecting
        useAuthStore.getState().refreshSession()
          .then(() => scheduleReconnect())
          .catch(() => {
            console.error('[Socket] Token refresh failed');
            // Still try to reconnect, auth will fail and user will be logged out
            scheduleReconnect();
          });
      } else {
        scheduleReconnect();
      }
    });

    // Pong response for heartbeat
    socket.on('pong', () => {
      set({ lastActivityAt: Date.now() });
      resetStaleConnectionTimer(socket);
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

    // Feature toggle updates - real-time organization setting changes
    socket.on('feature:toggled', (data: any) => {
      console.log('[Socket] Feature toggle updated:', data);
      // Dispatch custom event for components to listen
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('neon:feature-toggle', { detail: data }));
      }
    });

    set({ socket });

    // Set up visibility change listener for reconnection
    setupVisibilityListener();

    // Set up online/offline listeners
    setupNetworkListeners();
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false, connectionStatus: 'disconnected' });
    }
    stopHeartbeat();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // Remove event listeners
    cleanupListeners();
  },

  forceReconnect: () => {
    console.log('[Socket] Force reconnect requested');
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ reconnectAttempts: 0, connectionStatus: 'connecting' });
    get().connect();
  },

  sendMessage: (conversationId: string, content: string, replyToId?: string) => {
    const { socket, isConnected, messageQueue } = get();
    const data = { conversationId, content, replyToId };

    if (!socket || !isConnected) {
      // Queue the message for when we reconnect
      console.log('[Socket] Queuing message for later delivery');
      set({
        messageQueue: [...messageQueue, { type: 'message', data, timestamp: Date.now() }],
      });
      return;
    }
    socket.emit('message:send', data);
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
    const { socket, isConnected, messageQueue } = get();
    const data = { messageId, emoji, add: true };

    if (!socket || !isConnected) {
      set({
        messageQueue: [...messageQueue, { type: 'reaction', data, timestamp: Date.now() }],
      });
      return;
    }
    socket.emit('message:react', { messageId, emoji });
  },

  removeReaction: (messageId: string, emoji: string) => {
    const { socket, isConnected, messageQueue } = get();
    const data = { messageId, emoji, add: false };

    if (!socket || !isConnected) {
      set({
        messageQueue: [...messageQueue, { type: 'reaction', data, timestamp: Date.now() }],
      });
      return;
    }
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
    const { socket, isConnected, messageQueue } = get();
    // Send uppercase status for backend compatibility
    const normalizedStatus = status.toUpperCase() === 'BUSY' ? 'DND' : status.toUpperCase();
    const data = { status: normalizedStatus, statusMessage };

    if (!socket || !isConnected) {
      set({
        messageQueue: [...messageQueue, { type: 'presence', data, timestamp: Date.now() }],
      });
      return;
    }
    socket.emit('presence:update', data);
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

// Helper functions

function startHeartbeat(socket: Socket): void {
  stopHeartbeat();

  heartbeatTimer = setInterval(() => {
    if (socket.connected) {
      socket.emit('ping');
    }
  }, HEARTBEAT_CONFIG.interval);

  // Set up stale connection detection
  resetStaleConnectionTimer(socket);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (staleConnectionTimer) {
    clearTimeout(staleConnectionTimer);
    staleConnectionTimer = null;
  }
}

function resetStaleConnectionTimer(socket: Socket): void {
  if (staleConnectionTimer) {
    clearTimeout(staleConnectionTimer);
  }

  staleConnectionTimer = setTimeout(() => {
    console.log('[Socket] Connection appears stale, reconnecting...');
    if (socket.connected) {
      socket.disconnect();
    }
    scheduleReconnect();
  }, HEARTBEAT_CONFIG.timeout);
}

function scheduleReconnect(): void {
  // Check rate limit
  if (!canReconnect()) {
    console.log('[Socket] Rate limited, waiting before reconnect attempt');
    reconnectTimer = setTimeout(() => {
      scheduleReconnect();
    }, RATE_LIMIT.windowMs / RATE_LIMIT.maxReconnectsPerMinute);
    return;
  }

  // Clear existing timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  const state = useSocketStore.getState();
  const attempts = state.reconnectAttempts;
  const delay = calculateReconnectDelay(attempts);

  console.log(`[Socket] Scheduling reconnect attempt ${attempts + 1} in ${delay}ms`);

  useSocketStore.setState({
    reconnectAttempts: attempts + 1,
    connectionStatus: 'connecting',
  });

  reconnectTimer = setTimeout(() => {
    recordReconnectAttempt();

    // Re-authenticate before reconnecting
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) {
      console.log('[Socket] No access token, skipping reconnect');
      useSocketStore.setState({ connectionStatus: 'disconnected' });
      return;
    }

    console.log('[Socket] Attempting reconnect...');
    useSocketStore.getState().connect();
  }, delay);
}

// Visibility change handler - reconnect when tab becomes visible
let visibilityHandler: (() => void) | null = null;

function setupVisibilityListener(): void {
  if (visibilityHandler) return; // Already set up

  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      console.log('[Socket] Tab became visible, checking connection...');
      const state = useSocketStore.getState();

      if (!state.isConnected && state.connectionStatus !== 'connecting') {
        console.log('[Socket] Not connected, attempting immediate reconnect');
        // Reset reconnect attempts for faster initial reconnect
        useSocketStore.setState({ reconnectAttempts: 0 });
        state.connect();
      } else if (state.socket?.connected) {
        // Send a ping to verify connection is still alive
        state.socket.emit('ping');
      }
    }
  };

  document.addEventListener('visibilitychange', visibilityHandler);
}

// Network status listeners
let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;

function setupNetworkListeners(): void {
  if (onlineHandler) return; // Already set up

  onlineHandler = () => {
    console.log('[Socket] Network came online');
    const state = useSocketStore.getState();
    if (!state.isConnected) {
      // Reset reconnect attempts for faster reconnect
      useSocketStore.setState({ reconnectAttempts: 0 });
      state.connect();
    }
  };

  offlineHandler = () => {
    console.log('[Socket] Network went offline');
    useSocketStore.setState({ connectionStatus: 'disconnected' });
  };

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
}

function cleanupListeners(): void {
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }
  if (offlineHandler) {
    window.removeEventListener('offline', offlineHandler);
    offlineHandler = null;
  }
}
