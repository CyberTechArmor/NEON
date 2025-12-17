import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
  ChevronLeft,
  Image,
  FileIcon,
  FolderOpen,
} from 'lucide-react';

// Common emoji categories for the picker
const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷'],
  'Gestures': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️'],
  'Objects': ['💼', '📁', '📂', '📅', '📆', '📍', '📎', '📏', '📐', '✂️', '🔒', '🔓', '🔑', '🔨', '🪓', '⛏️', '🔧', '🔩', '⚙️', '💡', '🔦', '🕯️', '📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️'],
  'Symbols': ['✅', '❌', '❓', '❗', '💯', '🔥', '✨', '⭐', '🌟', '💫', '⚡', '🎯', '🚀', '🎉', '🎊', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '📌', '🔔', '🔕'],
};
import { formatDistanceToNow } from 'date-fns';
import { useChatStore } from '../stores/chat';
import { useSocketStore } from '../stores/socket';
import { useAuthStore } from '../stores/auth';
import { useMeetStore, generateDisplayName } from '../stores/meet';
import { conversationsApi, messagesApi, usersApi, filesApi, getErrorMessage } from '../lib/api';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { AttachmentRenderer } from '../components/attachments';
import { ChatFileBrowser } from '../components/chat';
import { EmbeddedMeetCall } from '../components/meet';

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
                  ? 'bg-neon-accent text-neon-bg'
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
                  ? 'bg-neon-accent text-neon-bg'
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
  const { presence, isConnected, lastActivityAt } = useSocketStore();
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

  // Determine if the other user is active (connected within last 5 minutes)
  const otherUserPresence = otherParticipant ? presence[otherParticipant.id] : null;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const isOtherUserActive = otherUserPresence &&
    otherUserPresence.status === 'ONLINE' &&
    otherUserPresence.lastSeen &&
    new Date(otherUserPresence.lastSeen).getTime() > fiveMinutesAgo;

  // Get the last message preview with sender name for group chats
  const getLastMessagePreview = () => {
    if (!conversation.lastMessage) return 'No messages yet';

    const lastMsg = conversation.lastMessage;
    const content = lastMsg.content || '[Attachment]';

    // For group chats, show who sent the message
    if (conversation.type === 'GROUP' && lastMsg.sender) {
      const senderName = lastMsg.senderId === user?.id
        ? 'You'
        : (lastMsg.sender.displayName || lastMsg.sender.name || 'Someone');
      return `${senderName}: ${content}`;
    }

    // For direct messages
    if (lastMsg.senderId === user?.id) {
      return `You: ${content}`;
    }

    return content;
  };

  // Determine message status indicator color and if message is read
  const getMessageStatus = () => {
    if (!conversation.lastMessage) return { color: null, isRead: false };

    // If there are unread messages, show blue
    if (conversation.unreadCount > 0) return { color: 'bg-neon-info', isRead: false };

    // If the last message was sent by current user
    if (conversation.lastMessage.senderId === user?.id) {
      // Check if the other user is online/active - show green for delivered
      if (isOtherUserActive) return { color: 'bg-neon-success', isRead: false };
      // Show gray for sent but recipient offline
      return { color: 'bg-neon-text-muted', isRead: false };
    }

    // Last message was received and read (unreadCount is 0)
    return { color: 'bg-neon-text-muted', isRead: true };
  };

  const { color: indicatorColor, isRead: isLastMessageRead } = getMessageStatus();

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
            className={`absolute -bottom-0.5 -right-0.5 status-dot ${
              isOtherUserActive ? 'status-online' :
              userPresence.toLowerCase() === 'online' ? 'status-away' :
              userPresence.toLowerCase() === 'away' ? 'status-away' :
              userPresence.toLowerCase() === 'dnd' || userPresence.toLowerCase() === 'busy' ? 'status-busy' :
              'status-offline'
            }`}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate ${
            conversation.unreadCount > 0 ? 'font-bold text-white' : 'font-medium'
          }`}>{displayName}</span>
          {conversation.lastMessage && (
            <span className="text-xs text-neon-text-muted flex-shrink-0">
              {formatDistanceToNow(new Date(conversation.lastMessage.createdAt), {
                addSuffix: false,
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Message indicator dot */}
          {indicatorColor && (
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${indicatorColor}`} />
          )}
          <span className={`text-sm truncate flex-1 ${
            conversation.unreadCount > 0
              ? 'font-semibold text-white'
              : isLastMessageRead
                ? 'text-neon-text-muted italic'
                : 'text-neon-text-secondary'
          }`}>
            {getLastMessagePreview()}
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
  richAttachmentsEnabled,
}: {
  message: any;
  isOwn: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  richAttachmentsEnabled?: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const hasAttachments = message.attachments && message.attachments.length > 0;

  return (
    <div
      className={`group flex items-start gap-3 px-2 ${isOwn ? 'flex-row-reverse' : ''}`}
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
            {message.content && <p>{message.content}</p>}

            {/* Attachments */}
            {hasAttachments && richAttachmentsEnabled && (
              <AttachmentRenderer
                attachments={message.attachments}
                className={message.content ? 'mt-2' : ''}
              />
            )}

            {/* Fallback for attachments when rich attachments disabled */}
            {hasAttachments && !richAttachmentsEnabled && (
              <div className={message.content ? 'mt-2 space-y-1' : 'space-y-1'}>
                {message.attachments.map((att: any) => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-neon-accent hover:underline"
                  >
                    <Paperclip className="w-4 h-4" />
                    <span className="truncate">{att.filename}</span>
                  </a>
                ))}
              </div>
            )}
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
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showConversationList, setShowConversationList] = useState(!conversationId);

  const { user } = useAuthStore();
  const { isFeatureEnabled } = useFeatureFlags();
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
  const { joinConversation, leaveConversation, sendTyping, stopTyping, isConnected } = useSocketStore();
  const {
    config: meetConfig,
    configLoading: meetConfigLoading,
    configError: meetConfigError,
    activeCall,
    isJoining: isJoiningCall,
    showChatSidebar,
    startCall,
    fetchConfig: fetchMeetConfig,
  } = useMeetStore();

  const [messageInput, setMessageInput] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState<keyof typeof EMOJI_CATEGORIES>('Smileys');
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: string) => {
    setMessageInput((prev) => prev + emoji);
    inputRef.current?.focus();
  }, []);

  // File handling functions
  const addFiles = useCallback((files: File[]) => {
    const validFiles = files.filter((file) => {
      // Max 10MB per file
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`File "${file.name}" is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...validFiles]);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle paste events for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            // Create a named file from pasted image
            const namedFile = new File([file], `pasted-image-${Date.now()}.${file.type.split('/')[1]}`, {
              type: file.type,
            });
            files.push(namedFile);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      addFiles(files);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [addFiles]
  );

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles]
  );

  // Upload files helper - uses pre-signed URL for direct browser-to-S3 upload
  // Returns array of { id, url, name } for each uploaded file
  const uploadFiles = async (files: File[]): Promise<{ id: string; url: string; name: string }[]> => {
    const uploadedFiles: { id: string; url: string; name: string }[] = [];

    for (const file of files) {
      try {
        // Use pre-signed URL method for direct upload to S3
        const result = await filesApi.uploadWithPresign(file);
        if (result.id) {
          uploadedFiles.push({ id: result.id, url: result.url, name: result.name });
        }
      } catch (error: any) {
        console.error(`Failed to upload ${file.name}:`, error);
        // Provide more specific error message
        const errorMsg = error?.response?.data?.error?.message || error?.message || 'Upload failed';
        toast.error(`Failed to upload ${file.name}: ${errorMsg}`);
      }
    }

    return uploadedFiles;
  };

  // Get file preview URL
  const getFilePreview = useCallback((file: File): string | null => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return null;
  }, []);

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
  const { isLoading: isLoadingMessages, refetch: refetchMessages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await messagesApi.list(conversationId, { limit: 50 });
      // Messages from API are already in chronological order (oldest first)
      const messagesData = response.data.data as any[];
      setMessages(conversationId, messagesData);
      setHasMoreMessages(conversationId, response.data.meta?.pagination?.hasNext || false);
      return messagesData;
    },
    enabled: !!conversationId,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, replyToId, fileIds }: { content: string; replyToId?: string; fileIds?: string[] }) => {
      if (!conversationId) throw new Error('No conversation selected');
      const response = await messagesApi.send(conversationId, { content, replyToId, fileIds });
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
      console.log('[ChatPage] Conversation changed, joining room:', conversationId);
      // Leave old conversation room
      if (currentConversationId) {
        leaveConversation(currentConversationId);
      }
      // Join new conversation room
      joinConversation(conversationId);
      setCurrentConversation(conversationId);
      // Hide conversation list on mobile when a conversation is selected
      setShowConversationList(false);
    }
  }, [conversationId, currentConversationId, joinConversation, leaveConversation, setCurrentConversation]);

  // Show conversation list when no conversation is selected
  useEffect(() => {
    if (!conversationId) {
      setShowConversationList(true);
    }
  }, [conversationId]);

  // Clear current conversation when leaving the chat page
  useEffect(() => {
    return () => {
      // When component unmounts (user navigates away from chat),
      // clear the current conversation so notifications work properly
      setCurrentConversation(null);
    };
  }, [setCurrentConversation]);

  // Rejoin conversation room when socket reconnects or conversation changes
  useEffect(() => {
    console.log('[ChatPage] Socket/conversation effect:', { isConnected, conversationId });
    if (isConnected && conversationId) {
      console.log('[ChatPage] Joining conversation room on connect:', conversationId);
      joinConversation(conversationId);
    }
  }, [isConnected, conversationId, joinConversation]);

  // Fetch MEET integration config on mount
  useEffect(() => {
    fetchMeetConfig();
  }, [fetchMeetConfig]);

  // Scroll to bottom when messages change or conversation changes
  useEffect(() => {
    // Use a small timeout to ensure DOM has updated
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }, 100);
    return () => clearTimeout(timer);
  }, [conversationId, messages[conversationId || '']?.length]);

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
    const hasFiles = pendingFiles.length > 0;

    if (!content && !hasFiles) return;
    if (sendMessageMutation.isPending || isUploadingFiles) return;

    if (editingMessage) {
      // Handle edit
      // TODO: Implement edit mutation
      setEditingMessage(null);
    } else {
      let fileIds: string[] = [];

      // Upload files first if any
      if (hasFiles) {
        setIsUploadingFiles(true);
        try {
          const uploadedFiles = await uploadFiles(pendingFiles);
          fileIds = uploadedFiles.map(f => f.id);
        } catch (error) {
          toast.error('Failed to upload some files');
        } finally {
          setIsUploadingFiles(false);
          setPendingFiles([]);
        }
      }

      // Send message with file IDs
      if (content || fileIds.length > 0) {
        sendMessageMutation.mutate({
          content: content || (fileIds.length > 0 ? '' : ''),
          replyToId: replyTo?.id,
          fileIds: fileIds.length > 0 ? fileIds : undefined,
        });
      }
    }

    setMessageInput('');
    setPendingFiles([]);
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

  // Handle starting a video/voice call
  const handleStartCall = useCallback(async (voiceOnly: boolean = false) => {
    if (!conversationId || !currentConversation) {
      toast.error('Please select a conversation first');
      return;
    }

    // Build participants list
    const participants = currentConversation.participants
      .filter((p: any) => p.userId !== user?.id)
      .map((p: any) => ({
        id: p.user?.id || p.userId,
        displayName: p.user?.displayName || p.user?.name || 'Unknown',
        avatarUrl: p.user?.avatarUrl,
      }));

    // Generate display name based on conversation type
    let displayName: string;
    if (currentConversation.type === 'DIRECT' && participants.length === 1) {
      // For 1-on-1 chats, use both participant names
      displayName = `${user?.name} & ${participants[0].displayName}`;
    } else if (currentConversation.name) {
      displayName = currentConversation.name;
    } else {
      displayName = generateDisplayName(participants);
    }

    try {
      await startCall({
        conversationId,
        participants,
        displayName,
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to start call');
    }
  }, [conversationId, currentConversation, user, startCall]);

  // Handle back button on mobile
  const handleBackToList = () => {
    setShowConversationList(true);
    navigate('/chat');
  };

  // Handle selecting a conversation (with immediate menu close on mobile)
  const handleSelectConversation = (selectedConversationId: string) => {
    // Hide the conversation list immediately on mobile
    setShowConversationList(false);
    // Navigate to the selected conversation
    navigate(`/chat/${selectedConversationId}`);
  };

  return (
    <div className="flex h-full">
      {/* Conversation list - full width on mobile, fixed width on desktop */}
      <div className={`
        ${showConversationList ? 'flex' : 'hidden'}
        lg:flex
        w-full lg:w-80 flex-shrink-0 border-r border-neon-border flex-col bg-neon-surface/50 h-full overflow-hidden
      `}>
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-neon-border">
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
                  onClick={() => handleSelectConversation(conversation.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat area - hidden on mobile when showing conversation list */}
      <div
        ref={dropZoneRef}
        className={`
          ${!showConversationList ? 'flex' : 'hidden'}
          lg:flex
          flex-1 flex-col min-w-0 relative h-full overflow-hidden
        `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && conversationId && (
          <div className="absolute inset-0 z-50 bg-neon-bg/90 flex items-center justify-center border-2 border-dashed border-neon-accent rounded-lg m-2 pointer-events-none">
            <div className="text-center">
              <Image className="w-12 h-12 mx-auto mb-2 text-neon-accent" />
              <p className="text-lg font-medium">Drop files here</p>
              <p className="text-sm text-neon-text-muted">Images, videos, documents...</p>
            </div>
          </div>
        )}
        {conversationId && currentConversation ? (
          <>
            {/* Chat header - sticky at top */}
            <div className="flex-shrink-0 h-16 px-4 flex items-center justify-between border-b border-neon-border bg-neon-surface/50">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back button - mobile only */}
                <button
                  className="lg:hidden btn btn-icon btn-ghost -ml-2"
                  onClick={handleBackToList}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
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
                {/* Voice Call Button */}
                {isFeatureEnabled('voice_calls') && meetConfig?.configured && meetConfig?.enabled ? (
                  <button
                    className="btn btn-icon btn-ghost hidden sm:flex"
                    onClick={() => handleStartCall(true)}
                    disabled={isJoiningCall || !!activeCall}
                    title={activeCall ? 'Call in progress' : 'Start voice call'}
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    className="btn btn-icon btn-ghost hidden sm:flex opacity-50 cursor-not-allowed"
                    disabled
                    title={
                      meetConfigLoading ? 'Loading MEET configuration...' :
                      meetConfigError ? `MEET error: ${meetConfigError}` :
                      !isFeatureEnabled('voice_calls') ? 'Voice calls disabled by admin' :
                      !meetConfig?.configured ? 'MEET integration not configured' :
                      !meetConfig?.enabled ? 'MEET integration disabled' :
                      'Voice calls unavailable'
                    }
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                )}
                {/* Video Call Button */}
                {isFeatureEnabled('video_calls') && meetConfig?.configured && meetConfig?.enabled ? (
                  <button
                    className={`btn btn-icon btn-ghost ${activeCall?.conversationId === conversationId ? 'text-neon-success' : ''}`}
                    onClick={() => handleStartCall(false)}
                    disabled={isJoiningCall || !!activeCall}
                    title={activeCall ? 'Call in progress' : 'Start video call'}
                  >
                    {isJoiningCall ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Video className="w-5 h-5" />
                    )}
                  </button>
                ) : (
                  <button
                    className="btn btn-icon btn-ghost opacity-50 cursor-not-allowed"
                    disabled
                    title={
                      meetConfigLoading ? 'Loading MEET configuration...' :
                      meetConfigError ? `MEET error: ${meetConfigError}` :
                      !isFeatureEnabled('video_calls') ? 'Video calls disabled by admin' :
                      !meetConfig?.configured ? 'MEET integration not configured' :
                      !meetConfig?.enabled ? 'MEET integration disabled' :
                      'Video calls unavailable'
                    }
                  >
                    <Video className="w-5 h-5" />
                  </button>
                )}
                <button
                  className="btn btn-icon btn-ghost"
                  onClick={() => setShowFileBrowser(true)}
                  title="Browse shared files"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
                <button className="btn btn-icon btn-ghost">
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat File Browser Modal */}
            {conversationId && (
              <ChatFileBrowser
                conversationId={conversationId}
                isOpen={showFileBrowser}
                onClose={() => setShowFileBrowser(false)}
              />
            )}

            {/* Video Call + Chat Area Container */}
            {activeCall?.conversationId === conversationId && activeCall.viewMode === 'embedded' ? (
              /* Active call for this conversation - show embedded video with optional chat sidebar */
              <div className="flex-1 flex overflow-hidden">
                {/* Video Call Area */}
                <div className={`flex-1 min-w-0 ${showChatSidebar ? 'hidden lg:flex' : 'flex'}`}>
                  <EmbeddedMeetCall className="w-full h-full" />
                </div>

                {/* Chat Sidebar during call (desktop: side panel, mobile: full screen) */}
                {showChatSidebar && (
                  <div className="w-full lg:w-80 flex flex-col border-l border-neon-border bg-neon-surface">
                    {/* Chat header */}
                    <div className="flex-shrink-0 h-12 px-4 flex items-center justify-between border-b border-neon-border">
                      <span className="text-sm font-medium">Chat</span>
                    </div>

                    {/* Messages */}
                    <div
                      ref={messagesContainerRef}
                      className="flex-1 overflow-y-auto p-3 flex flex-col min-h-0"
                    >
                      <div className="flex-1 min-h-0" />
                      <div className="space-y-2">
                        {currentMessages.slice(-20).map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[85%] px-3 py-1.5 rounded-lg text-sm ${
                                message.senderId === user?.id
                                  ? 'bg-neon-accent text-white'
                                  : 'bg-neon-surface-hover'
                              }`}
                            >
                              {message.senderId !== user?.id && (
                                <p className="text-xs text-neon-text-muted mb-0.5">
                                  {message.sender?.displayName || message.sender?.name}
                                </p>
                              )}
                              <p>{message.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Compact input */}
                    <div className="flex-shrink-0 p-2 border-t border-neon-border">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="input py-2 text-sm"
                          placeholder="Type a message..."
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                        />
                        <button
                          className="btn btn-icon btn-primary btn-sm"
                          onClick={handleSendMessage}
                          disabled={!messageInput.trim()}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Normal messages view (no active call for this conversation) */
              <>
                {/* Messages - scrollable area (only this section scrolls) */}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 overflow-x-hidden"
                >
                  {isLoadingMessages ? (
                    <div className="flex items-center justify-center py-8 flex-1">
                      <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
                    </div>
                  ) : currentMessages.length === 0 ? (
                    <div className="text-center py-8 text-neon-text-muted flex-1 flex flex-col items-center justify-center">
                      <p>No messages yet</p>
                      <p className="text-sm">Send a message to start the conversation</p>
                    </div>
                  ) : (
                    <>
                      {/* Spacer to push messages to bottom when few messages */}
                      <div className="flex-1 min-h-0" />
                      {/* Messages container with proper spacing */}
                      <div className="space-y-3">
                        {currentMessages.map((message) => (
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
                            richAttachmentsEnabled={isFeatureEnabled('rich_attachments')}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {/* Typing indicator */}
                  {currentTypingUsers.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-neon-text-muted mt-4">
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

                {/* Reply/Edit indicator - sticky above input */}
                {(replyTo || editingMessage) && (
                  <div className="flex-shrink-0 px-4 py-2 bg-neon-surface border-t border-neon-border flex items-center justify-between">
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

            {/* Pending files preview */}
            {pendingFiles.length > 0 && (
              <div className="flex-shrink-0 px-4 py-2 border-t border-neon-border bg-neon-surface/50">
                <div className="flex flex-wrap gap-2">
                  {pendingFiles.map((file, index) => {
                    const preview = getFilePreview(file);
                    const isImage = file.type.startsWith('image/');
                    return (
                      <div
                        key={`${file.name}-${index}`}
                        className="relative group"
                      >
                        {isImage && preview ? (
                          <img
                            src={preview}
                            alt={file.name}
                            className="w-16 h-16 object-cover rounded-lg border border-neon-border"
                          />
                        ) : (
                          <div className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border border-neon-border bg-neon-surface-hover">
                            <FileIcon className="w-6 h-6 text-neon-text-muted" />
                            <span className="text-[10px] text-neon-text-muted mt-1 max-w-[60px] truncate px-1">
                              {file.name.split('.').pop()?.toUpperCase()}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(index)}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-neon-error rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white px-1 py-0.5 truncate rounded-b-lg">
                          {file.name.length > 12 ? `${file.name.slice(0, 10)}...` : file.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Message input - sticky at bottom */}
            <div className="flex-shrink-0 p-4 border-t border-neon-border bg-neon-surface/50">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
              />

              <div className="flex items-end gap-3">
                <button
                  className="btn btn-icon btn-ghost mb-1"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach files"
                >
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
                    onPaste={handlePaste}
                    placeholder={pendingFiles.length > 0 ? "Add a message or send files..." : "Type a message... (paste images with Ctrl+V)"}
                    className="input py-3 pr-12 resize-none min-h-[48px] max-h-[200px]"
                    rows={1}
                  />
                  <button
                    className={`absolute right-3 bottom-3 transition-colors ${
                      showEmojiPicker ? 'text-neon-accent' : 'text-neon-text-muted hover:text-white'
                    }`}
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    type="button"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  {/* Emoji Picker */}
                  {showEmojiPicker && (
                    <div
                      ref={emojiPickerRef}
                      className="absolute bottom-full right-0 mb-2 bg-neon-surface border border-neon-border rounded-lg shadow-xl z-50 w-[320px]"
                    >
                      {/* Category tabs */}
                      <div className="flex border-b border-neon-border p-1 gap-1 overflow-x-auto">
                        {Object.keys(EMOJI_CATEGORIES).map((category) => (
                          <button
                            key={category}
                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                              emojiCategory === category
                                ? 'bg-neon-accent text-white'
                                : 'text-neon-text-muted hover:text-white hover:bg-neon-surface-hover'
                            }`}
                            onClick={() => setEmojiCategory(category as keyof typeof EMOJI_CATEGORIES)}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                      {/* Emoji grid */}
                      <div className="p-2 max-h-[200px] overflow-y-auto">
                        <div className="grid grid-cols-8 gap-1">
                          {EMOJI_CATEGORIES[emojiCategory].map((emoji, index) => (
                            <button
                              key={`${emoji}-${index}`}
                              className="w-8 h-8 flex items-center justify-center text-lg hover:bg-neon-surface-hover rounded transition-colors"
                              onClick={() => {
                                handleEmojiSelect(emoji);
                                setShowEmojiPicker(false);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  className={`btn btn-icon mb-1 ${
                    messageInput.trim() || pendingFiles.length > 0 ? 'btn-primary' : 'btn-ghost'
                  }`}
                  onClick={handleSendMessage}
                  disabled={(!messageInput.trim() && pendingFiles.length === 0) || sendMessageMutation.isPending || isUploadingFiles}
                >
                  {sendMessageMutation.isPending || isUploadingFiles ? (
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
            )}
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
