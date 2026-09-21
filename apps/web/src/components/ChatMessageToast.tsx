import toast from 'react-hot-toast';
import { MessageSquare } from 'lucide-react';
import { navigateTo } from '../lib/navigation';

/**
 * The in-app toast for a chat message that arrived while the user was
 * looking elsewhere. Clicking it opens that thread; anything about a chat
 * should take you to the chat.
 */
export function showChatMessageToast({
  senderName,
  preview,
  conversationId,
}: {
  senderName: string;
  preview: string;
  conversationId: string;
}): void {
  toast.custom(
    (t) => (
      <button
        type="button"
        onClick={() => {
          toast.dismiss(t.id);
          navigateTo(`/chat/${conversationId}`);
        }}
        className={`toast pointer-events-auto flex items-start gap-3 max-w-sm w-full text-left rounded-lg border border-neon-border bg-[#161616] text-white px-4 py-3 shadow-lg transition-opacity ${
          t.visible ? 'opacity-100' : 'opacity-0'
        }`}
        title="Open conversation"
      >
        <MessageSquare className="w-5 h-5 mt-0.5 flex-shrink-0 text-neon-accent" />
        <span className="min-w-0">
          <span className="font-medium">{senderName}</span>
          <span className="block text-sm text-neon-text-secondary truncate">{preview}</span>
        </span>
      </button>
    ),
    { duration: 5000, position: 'top-right' }
  );
}
