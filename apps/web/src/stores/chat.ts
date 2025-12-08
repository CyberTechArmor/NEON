import { create } from 'zustand';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'file' | 'image' | 'video' | 'audio' | 'system';
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
  sender: {
    id: string;
    name: string;
    displayName?: string;
    avatarUrl?: string;
  };
  reactions: Array<{
    emoji: string;
    userId: string;
    userName: string;
  }>;
  attachments: Array<{
    id: string;
    filename: string;
    url: string;
    size: number;
    mimeType: string;
  }>;
  replyTo?: {
    id: string;
    content: string;
    senderName: string;
  };
}

interface Conversation {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name?: string;
  description?: string;
  avatarUrl?: string;
  participants: Array<{
    userId: string;
    user: {
      id: string;
      name: string;
      displayName?: string;
      avatarUrl?: string;
      presence: string;
    };
    role: string;
  }>;
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TypingUser {
  odId: string;
  name: string;
  startedAt: number;
}

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, TypingUser[]>;
  hasMoreMessages: Record<string, boolean>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setCurrentConversation: (id: string | null) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  prependMessages: (conversationId: string, messages: Message[]) => void;
  setHasMoreMessages: (conversationId: string, hasMore: boolean) => void;
  setTypingUser: (conversationId: string, user: TypingUser) => void;
  removeTypingUser: (conversationId: string, odId: string) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  setLoadingConversations: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: {},
  typingUsers: {},
  hasMoreMessages: {},
  isLoadingConversations: false,
  isLoadingMessages: false,

  setConversations: (conversations) => {
    // Sort conversations by most recent message/activity
    const sortedConversations = [...conversations].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.updatedAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.updatedAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    set({ conversations: sortedConversations });
  },

  addConversation: (conversation) => {
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    }));
  },

  updateConversation: (id, updates) => {
    set((state) => {
      const updatedConversations = state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      );
      // Sort conversations by updatedAt (newest first) to show most recent at top
      updatedConversations.sort((a, b) => {
        const aTime = a.lastMessage?.createdAt || a.updatedAt || a.createdAt;
        const bTime = b.lastMessage?.createdAt || b.updatedAt || b.createdAt;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
      return { conversations: updatedConversations };
    });
  },

  removeConversation: (id) => {
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      currentConversationId:
        state.currentConversationId === id ? null : state.currentConversationId,
    }));
  },

  setCurrentConversation: (id) => {
    set({ currentConversationId: id });
    if (id) {
      get().clearUnread(id);
    }
  },

  setMessages: (conversationId, messages) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: messages,
      },
    }));
  },

  addMessage: (conversationId, message) => {
    set((state) => {
      const existingMessages = state.messages[conversationId] || [];
      // Avoid duplicates
      if (existingMessages.some((m) => m.id === message.id)) {
        return state;
      }
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existingMessages, message],
        },
      };
    });

    // Update last message in conversation
    get().updateConversation(conversationId, {
      lastMessage: message,
      updatedAt: message.createdAt,
    });

    // Increment unread if not current conversation
    if (get().currentConversationId !== conversationId) {
      get().incrementUnread(conversationId);
    }
  },

  updateMessage: (conversationId, messageId, updates) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    }));
  },

  removeMessage: (conversationId, messageId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).filter(
          (m) => m.id !== messageId
        ),
      },
    }));
  },

  prependMessages: (conversationId, messages) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [
          ...messages,
          ...(state.messages[conversationId] || []),
        ],
      },
    }));
  },

  setHasMoreMessages: (conversationId, hasMore) => {
    set((state) => ({
      hasMoreMessages: {
        ...state.hasMoreMessages,
        [conversationId]: hasMore,
      },
    }));
  },

  setTypingUser: (conversationId, user) => {
    set((state) => {
      const existing = state.typingUsers[conversationId] || [];
      const filtered = existing.filter((u) => u.odId !== user.odId);
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: [...filtered, user],
        },
      };
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      get().removeTypingUser(conversationId, user.odId);
    }, 5000);
  },

  removeTypingUser: (conversationId, odId) => {
    set((state) => ({
      typingUsers: {
        ...state.typingUsers,
        [conversationId]: (state.typingUsers[conversationId] || []).filter(
          (u) => u.odId !== odId
        ),
      },
    }));
  },

  incrementUnread: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: c.unreadCount + 1 } : c
      ),
    }));
  },

  clearUnread: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    }));
  },

  setLoadingConversations: (loading) => {
    set({ isLoadingConversations: loading });
  },

  setLoadingMessages: (loading) => {
    set({ isLoadingMessages: loading });
  },
}));
