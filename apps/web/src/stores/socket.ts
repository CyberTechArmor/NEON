import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
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

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  presence: Record<string, PresenceUser>;

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
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  presence: {},

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
      set({ isConnected: true });
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
      // Handle message received event from backend
      useChatStore.getState().addMessage(message.conversationId, {
        ...message,
        sender: {
          id: message.sender?.id,
          name: message.sender?.displayName || message.sender?.name,
          displayName: message.sender?.displayName,
          avatarUrl: message.sender?.avatarUrl,
        },
      });
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
    const { socket } = get();
    if (!socket) return;
    socket.emit('conversation:join', { conversationId });
  },

  leaveConversation: (conversationId) => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('conversation:leave', { conversationId });
  },

  updatePresence: (status, statusMessage) => {
    const { socket } = get();
    if (!socket) return;
    // Send uppercase status for backend compatibility
    const normalizedStatus = status.toUpperCase() === 'BUSY' ? 'DND' : status.toUpperCase();
    socket.emit('presence:update', { status: normalizedStatus, statusMessage });
  },
}));
