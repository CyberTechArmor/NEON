import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth';
import { useChatStore } from './chat';

interface PresenceUser {
  odId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
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

    const socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3000', {
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

    // Message events
    socket.on('message:new', (data) => {
      useChatStore.getState().addMessage(data.conversationId, data.message);
    });

    socket.on('message:updated', (data) => {
      useChatStore.getState().updateMessage(
        data.conversationId,
        data.messageId,
        data.updates
      );
    });

    socket.on('message:deleted', (data) => {
      useChatStore.getState().removeMessage(data.conversationId, data.messageId);
    });

    socket.on('message:reaction', (data) => {
      const messages = useChatStore.getState().messages[data.conversationId];
      const message = messages?.find((m) => m.id === data.messageId);
      if (message) {
        const reactions = data.action === 'add'
          ? [...message.reactions, data.reaction]
          : message.reactions.filter(
              (r) => !(r.emoji === data.reaction.emoji && r.userId === data.reaction.userId)
            );
        useChatStore.getState().updateMessage(data.conversationId, data.messageId, {
          reactions,
        });
      }
    });

    // Typing events
    socket.on('user:typing', (data) => {
      useChatStore.getState().setTypingUser(data.conversationId, {
        odId: data.userId,
        name: data.userName,
        startedAt: Date.now(),
      });
    });

    socket.on('user:stopped_typing', (data) => {
      useChatStore.getState().removeTypingUser(data.conversationId, data.userId);
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

    // Conversation events
    socket.on('conversation:created', (data) => {
      useChatStore.getState().addConversation(data.conversation);
    });

    socket.on('conversation:updated', (data) => {
      useChatStore.getState().updateConversation(data.conversationId, data.updates);
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
    socket.emit('presence:update', { status, statusMessage });
  },
}));
