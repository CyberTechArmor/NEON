import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Search,
  Plus,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  Info,
  Reply,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  MessageSquare,
  Users,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useChatStore } from '../stores/chat';
import { useSocketStore } from '../stores/socket';
import { useAuthStore } from '../stores/auth';
import { conversationsApi, messagesApi, usersApi, getErrorMessage } from '../lib/api';

interface UserForChat {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

// New chat modal component
function NewChatModal({
  isOpen,
  onClose,
  onCreateConversation,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreateConversation: (conversationId: string) => void;
}) {
  const [chatType, setChatType] = useState<'direct' | 'group'>('direct');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<UserForChat[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { user: currentUser } = useAuthStore();

  // Fetch users for selection
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users-search', searchQuery],
    queryFn: async () => {
      const response = await usersApi.list({ search: searchQuery, limit: 20 });
      const userList = (response.data.data || []) as UserForChat[];
      return userList.filter((u) => u.id !== currentUser?.id);
    },
    enabled: isOpen,
  });

  const handleCreateConversation = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Please select at least one user');
      return;
    }

    if (chatType === 'group' && !groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }

    setIsCreating(true);
    try {
      const response = await conversationsApi.create({
        type: chatType === 'direct' ? 'DIRECT' : 'GROUP',
        participantIds: selectedUsers.map((u) => u.id),
        name: chatType === 'group' ? groupName.trim() : undefined,
      });

      const conversationId = (response.data.data as { id: string } | undefined)?.id;
      if (conversationId) {
        onCreateConversation(conversationId);
      }
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const toggleUserSelection = (user: UserForChat) => {
    if (chatType === 'direct') {
      // Direct message - only one user allowed
      setSelectedUsers([user]);
    } else {
      // Group chat - multiple users allowed
      if (selectedUsers.find((u) => u.id === user.id)) {
        setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
      } else {
        setSelectedUsers([...selectedUsers, user]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-neon-surface border border-neon-border rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <h2 className="text-lg font-semibold">New Conversation</h2>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Chat type toggle */}
          <div className="flex gap-2 mb-4">
            <button
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                chatType === 'direct'
                  ? 'bg-neon-accent text-white'
                  : 'bg-neon-surface-hover text-neon-text-muted hover:text-white'
              }`}
              onClick={() => {
                setChatType('direct');
                setSelectedUsers(selectedUsers.slice(0, 1));
              }}
            >
              Direct Message
            </button>
            <button
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                chatType === 'group'
                  ? 'bg-neon-accent text-white'
                  : 'bg-neon-surface-hover text-neon-text-muted hover:text-white'
              }`}
              onClick={() => setChatType('group')}
            >
              Group Chat
            </button>
          </div>

          {/* Group name input (for group chat) */}
          {chatType === 'group' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Group Name</label>
              <input
                type="text"
                className="input"
                placeholder="Enter group name..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
          )}

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Selected</label>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((user) => (
                  <span
                    key={user.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-neon-surface-hover rounded-full text-sm"
                  >
                    {user.displayName}
                    <button
                      className="hover:text-neon-error"
                      onClick={() => toggleUserSelection(user)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* User search */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              {chatType === 'direct' ? 'Select User' : 'Add Participants'}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon-text-muted" />
              <input
                type="text"
                className="input pl-10"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* User list */}
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
              </div>
            ) : !users?.length ? (
              <p className="text-center text-neon-text-muted py-4">
                {searchQuery ? 'No users found' : 'Start typing to search'}
              </p>
            ) : (
              users.map((user) => {
                const isSelected = selectedUsers.some((u) => u.id === user.id);
                return (
                  <button
                    key={user.id}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                      isSelected
                        ? 'bg-neon-accent/20 border border-neon-accent'
                        : 'hover:bg-neon-surface-hover'
                    }`}
                    onClick={() => toggleUserSelection(user)}
                  >
                    <div className="avatar avatar-sm">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{user.displayName?.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.displayName}</p>
                      <p className="text-xs text-neon-text-muted truncate">
                        {user.email}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="w-5 h-5 text-neon-accent flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-neon-border">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreateConversation}
            disabled={selectedUsers.length === 0 || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <span>
                {chatType === 'direct' ? 'Start Chat' : 'Create Group'}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Conversation list item component
function ConversationItem({
  conversation,
  isActive,
  onClick,
}: {
  conversation: any;
  isActive: boolean;
  onClick: () => void;
}) {
  const { presence } = useSocketStore();
  const { user } = useAuthStore();

  // For direct messages, get the other participant
  const otherParticipant =
    conversation.type === 'DIRECT'
      ? conversation.participants.find((p: any) => p.userId !== user?.id)?.user
      : null;

  const displayName =
    conversation.type === 'DIRECT'
      ? otherParticipant?.displayName || otherParticipant?.name || 'Unknown'
      : conversation.name || 'Group Chat';

  const avatar =
    conversation.type === 'DIRECT'
      ? otherParticipant?.avatarUrl
      : conversation.avatarUrl;

  const userPresence =
    otherParticipant && presence[otherParticipant.id]?.status;

  return (
    <button
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors
        ${isActive ? 'bg-neon-surface-hover' : 'hover:bg-neon-surface-hover/50'}`}
      onClick={onClick}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="avatar avatar-md">
          {avatar ? (
            <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span>{displayName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        {userPresence && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 status-dot status-${userPresence}`}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium truncate">{displayName}</span>
          {conversation.lastMessage && (
            <span className="text-xs text-neon-text-muted flex-shrink-0">
              {formatDistanceToNow(new Date(conversation.lastMessage.createdAt), {
                addSuffix: false,
              })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-neon-text-secondary truncate">
            {conversation.lastMessage?.content || 'No messages yet'}
          </span>
          {conversation.unreadCount > 0 && (
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs font-medium bg-white text-neon-bg rounded-full">
              {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// Message component
function MessageBubble({
  message,
  isOwn,
  onReply,
  onEdit,
  onDelete,
}: {
  message: any;
  isOwn: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`group flex items-start gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar (only for others) */}
      {!isOwn && (
        <div className="avatar avatar-sm flex-shrink-0">
          {message.sender.avatarUrl ? (
            <img
              src={message.sender.avatarUrl}
              alt={message.sender.displayName || message.sender.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{(message.sender.displayName || message.sender.name)?.charAt(0).toUpperCase()}</span>
          )}
        </div>
      )}

      {/* Message content */}
      <div className={`flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender name (only for group chats) */}
        {!isOwn && (
          <span className="text-xs text-neon-text-muted">{message.sender.displayName || message.sender.name}</span>
        )}

        {/* Reply preview */}
        {message.replyTo && (
          <div className="text-xs text-neon-text-muted bg-neon-surface px-2 py-1 rounded border-l-2 border-neon-border max-w-[200px]">
            <span className="font-medium">{message.replyTo.senderName}</span>
            <p className="truncate">{message.replyTo.content}</p>
          </div>
        )}

        {/* Message bubble */}
        <div className="relative">
          <div className={`message-bubble ${isOwn ? 'message-bubble-own' : 'message-bubble-other'}`}>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>

          {/* Actions menu */}
          <div
            className={`absolute top-0 ${isOwn ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'}
              opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1`}
          >
            <button
              className="p-1 hover:bg-neon-surface-hover rounded text-neon-text-muted hover:text-white"
              onClick={onReply}
              title="Reply"
            >
              <Reply className="w-4 h-4" />
            </button>
            {isOwn && (
              <>
                <button
                  className="p-1 hover:bg-neon-surface-hover rounded text-neon-text-muted hover:text-white"
                  onClick={onEdit}
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  className="p-1 hover:bg-neon-surface-hover rounded text-neon-text-muted hover:text-neon-error"
                  onClick={onDelete}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(
              message.reactions.reduce((acc: any, r: any) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
              }, {})
            ).map(([emoji, count]) => (
              <span
                key={emoji}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-neon-surface rounded-full"
              >
                {emoji} {count as number}
              </span>
            ))}
          </div>
        )}

        {/* Time and edited status */}
        <span className="text-xs text-neon-text-muted">
          {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          {message.editedAt && ' (edited)'}
        </span>
      </div>
    </div>
  );
}

// Main ChatPage component
export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { user } = useAuthStore();
  const {
    conversations,
    messages,
    currentConversationId,
    typingUsers,
    setConversations,
    setCurrentConversation,
    setMessages,
    addMessage,
    setLoadingConversations,
    setLoadingMessages,
    hasMoreMessages,
    setHasMoreMessages,
  } = useChatStore();
  const { joinConversation, leaveConversation, sendTyping, stopTyping } = useSocketStore();

  const [messageInput, setMessageInput] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);

  // Fetch conversations
  const { isLoading: isLoadingConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await conversationsApi.list({ limit: 50 });
      setConversations(response.data.data as any);
      return response.data.data;
    },
  });

  // Fetch messages for current conversation
  const { isLoading: isLoadingMessages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await messagesApi.list(conversationId, { limit: 50 });
      setMessages(conversationId, (response.data.data as any[]).reverse());
      setHasMoreMessages(conversationId, response.data.meta?.pagination?.hasNext || false);
      return response.data.data;
    },
    enabled: !!conversationId,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, replyToId }: { content: string; replyToId?: string }) => {
      if (!conversationId) throw new Error('No conversation selected');
      const response = await messagesApi.send(conversationId, { content, replyToId });
      return response.data.data;
    },
    onSuccess: (message) => {
      if (conversationId) {
        addMessage(conversationId, message as any);
      }
      setReplyTo(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Update conversation when ID changes
  useEffect(() => {
    if (conversationId && conversationId !== currentConversationId) {
      // Leave old conversation room
      if (currentConversationId) {
        leaveConversation(currentConversationId);
      }
      // Join new conversation room
      joinConversation(conversationId);
      setCurrentConversation(conversationId);
    }
  }, [conversationId, currentConversationId, joinConversation, leaveConversation, setCurrentConversation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages[conversationId || '']?.length]);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (conversationId) {
      sendTyping(conversationId);
    }
  }, [conversationId, sendTyping]);

  const handleStopTyping = useCallback(() => {
    if (conversationId) {
      stopTyping(conversationId);
    }
  }, [conversationId, stopTyping]);

  // Send message
  const handleSendMessage = async () => {
    const content = messageInput.trim();
    if (!content || sendMessageMutation.isPending) return;

    if (editingMessage) {
      // Handle edit
      // TODO: Implement edit mutation
      setEditingMessage(null);
    } else {
      sendMessageMutation.mutate({
        content,
        replyToId: replyTo?.id,
      });
    }

    setMessageInput('');
    handleStopTyping();
    inputRef.current?.focus();
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Filter conversations by search
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (c.name?.toLowerCase().includes(query)) return true;
    return c.participants.some((p: any) =>
      p.user.name.toLowerCase().includes(query)
    );
  });

  // Current conversation data
  const currentConversation = conversations.find((c) => c.id === conversationId);
  const currentMessages = messages[conversationId || ''] || [];
  const currentTypingUsers = typingUsers[conversationId || ''] || [];

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-80 flex-shrink-0 border-r border-neon-border flex flex-col bg-neon-surface/50">
        {/* Header */}
        <div className="p-4 border-b border-neon-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Messages</h2>
            <button
              className="btn btn-icon btn-ghost"
              onClick={() => setShowNewChat(true)}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon-text-muted" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="input pl-10 py-2 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-neon-text-muted">
              <p>No conversations yet</p>
              <button
                className="mt-2 text-sm text-white hover:underline"
                onClick={() => setShowNewChat(true)}
              >
                Start a new chat
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === conversationId}
                  onClick={() => navigate(`/chat/${conversation.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {conversationId && currentConversation ? (
          <>
            {/* Chat header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-neon-border bg-neon-surface/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="avatar avatar-md">
                  {currentConversation.avatarUrl ? (
                    <img
                      src={currentConversation.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>
                      {(currentConversation.type === 'DIRECT'
                        ? (() => {
                            const other = currentConversation.participants.find(
                              (p: any) => p.userId !== user?.id
                            )?.user;
                            return other?.displayName || other?.name;
                          })()
                        : currentConversation.name || 'Group'
                      )?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium truncate">
                    {currentConversation.type === 'DIRECT'
                      ? (() => {
                          const other = currentConversation.participants.find(
                            (p: any) => p.userId !== user?.id
                          )?.user;
                          return other?.displayName || other?.name || 'Unknown';
                        })()
                      : currentConversation.name || 'Group Chat'}
                  </h3>
                  <p className="text-sm text-neon-text-muted">
                    {currentConversation.type === 'DIRECT'
                      ? 'Direct message'
                      : `${currentConversation.participants.length} members`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="btn btn-icon btn-ghost">
                  <Phone className="w-5 h-5" />
                </button>
                <button className="btn btn-icon btn-ghost">
                  <Video className="w-5 h-5" />
                </button>
                <button className="btn btn-icon btn-ghost">
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
                </div>
              ) : currentMessages.length === 0 ? (
                <div className="text-center py-8 text-neon-text-muted">
                  <p>No messages yet</p>
                  <p className="text-sm">Send a message to start the conversation</p>
                </div>
              ) : (
                currentMessages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isOwn={message.senderId === user?.id}
                    onReply={() => setReplyTo(message)}
                    onEdit={() => {
                      setEditingMessage(message);
                      setMessageInput(message.content);
                    }}
                    onDelete={() => {
                      // TODO: Implement delete
                    }}
                  />
                ))
              )}

              {/* Typing indicator */}
              {currentTypingUsers.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-neon-text-muted">
                  <div className="typing-indicator">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span>
                    {currentTypingUsers.map((u) => u.name).join(', ')}{' '}
                    {currentTypingUsers.length === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Reply/Edit indicator */}
            {(replyTo || editingMessage) && (
              <div className="px-4 py-2 bg-neon-surface border-t border-neon-border flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {replyTo ? (
                    <>
                      <Reply className="w-4 h-4 text-neon-text-muted" />
                      <span className="text-neon-text-muted">Replying to</span>
                      <span className="font-medium">{replyTo.sender.name}</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="w-4 h-4 text-neon-text-muted" />
                      <span className="text-neon-text-muted">Editing message</span>
                    </>
                  )}
                </div>
                <button
                  className="p-1 hover:bg-neon-surface-hover rounded"
                  onClick={() => {
                    setReplyTo(null);
                    setEditingMessage(null);
                    setMessageInput('');
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Message input */}
            <div className="p-4 border-t border-neon-border bg-neon-surface/50">
              <div className="flex items-end gap-3">
                <button className="btn btn-icon btn-ghost mb-1">
                  <Paperclip className="w-5 h-5" />
                </button>

                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={messageInput}
                    onChange={(e) => {
                      setMessageInput(e.target.value);
                      handleTyping();
                    }}
                    onKeyDown={handleKeyPress}
                    onBlur={handleStopTyping}
                    placeholder="Type a message..."
                    className="input py-3 pr-12 resize-none min-h-[48px] max-h-[200px]"
                    rows={1}
                  />
                  <button className="absolute right-3 bottom-3 text-neon-text-muted hover:text-white">
                    <Smile className="w-5 h-5" />
                  </button>
                </div>

                <button
                  className={`btn btn-icon mb-1 ${
                    messageInput.trim() ? 'btn-primary' : 'btn-ghost'
                  }`}
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sendMessageMutation.isPending}
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : editingMessage ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          // Empty state
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neon-surface flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-neon-text-muted" />
              </div>
              <h3 className="text-lg font-medium mb-1">Select a conversation</h3>
              <p className="text-neon-text-muted">
                Choose a conversation from the list or start a new one
              </p>
            </div>
          </div>
        )}
      </div>

      {/* New chat modal */}
      <NewChatModal
        isOpen={showNewChat}
        onClose={() => setShowNewChat(false)}
        onCreateConversation={(conversationId) => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          navigate(`/chat/${conversationId}`);
        }}
      />
    </div>
  );
}
