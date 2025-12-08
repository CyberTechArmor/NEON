import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuthStore } from './auth';
import { useChatStore } from './chat';

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

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  lastConnectedAt: number | null;
  lastActivityAt: number | null;
  presence: Record<string, PresenceUser>;
  notifications: Notification[];
  unreadNotificationCount: number;
  activeTestAlert: TestAlert | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
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
  lastConnectedAt: null,
  lastActivityAt: null,
  presence: {},
  notifications: [],
  unreadNotificationCount: 0,
  activeTestAlert: null,

  connect: () => {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken || get().socket) return;

    const socket = io(getWsUrl(), {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected');
      const now = Date.now();
      set({ isConnected: true, lastConnectedAt: now, lastActivityAt: now });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      set({ isConnected: false });
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      set({ isConnected: false });
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
      const isCurrentConversation = message.conversationId === currentConversationId;

      if (!isOwnMessage && !isCurrentConversation) {
        const senderName = message.sender?.displayName || message.sender?.name || 'Someone';
        const messagePreview = message.content?.substring(0, 50) || '[Attachment]';
        toast(
          `${senderName}: ${messagePreview}${message.content?.length > 50 ? '...' : ''}`,
          {
            icon: '💬',
            duration: 4000,
            position: 'top-right',
          }
        );
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
    });

    // Test alert acknowledged on another device
    socket.on('test:alert:acknowledged', () => {
      console.log('[Socket] Test alert acknowledged on another device');
      set({ activeTestAlert: null });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  sendMessage: (conversationId, content, replyToId) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:send', { conversationId, content, replyToId });
  },

  editMessage: (messageId, content) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:edit', { messageId, content });
  },

  deleteMessage: (messageId) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:delete', { messageId });
  },

  addReaction: (messageId, emoji) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:react', { messageId, emoji });
  },

  removeReaction: (messageId, emoji) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('message:unreact', { messageId, emoji });
  },

  sendTyping: (conversationId) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('typing:start', { conversationId });
  },

  stopTyping: (conversationId) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('typing:stop', { conversationId });
  },

  joinConversation: (conversationId) => {
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

  leaveConversation: (conversationId) => {
    const { socket, isConnected } = get();
    if (!socket || !isConnected) return;
    console.log('[Socket] Leaving conversation room:', conversationId);
    socket.emit('conversation:leave', conversationId);
  },

  updatePresence: (status, statusMessage) => {
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

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadNotificationCount: notification.read
        ? state.unreadNotificationCount
        : state.unreadNotificationCount + 1,
    }));
  },

  markNotificationRead: (id) => {
    const { socket } = get();
    if (socket) {
      socket.emit('notification:read', id);
    }
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadNotificationCount: Math.max(0, state.unreadNotificationCount - 1),
    }));
  },

  markAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadNotificationCount: 0,
    }));
  },

  setNotifications: (notifications) => {
    set({
      notifications,
      unreadNotificationCount: notifications.filter((n) => !n.read).length,
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
