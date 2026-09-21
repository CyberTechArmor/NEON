import { useState, useEffect } from 'react';
import {
  X,
  Minimize2,
  Maximize2,
  MessageSquare,
  Phone,
  PhoneOff,
  PictureInPicture,
  ChevronDown,
  Move,
} from 'lucide-react';
import { useMeetStore } from '../../stores/meet';
import { formatDistanceToNow } from 'date-fns';
import { useMeetSlot } from './useMeetSlot';

/**
 * Call chrome for the chat-page call.
 *
 * None of these components render the video. There is exactly one MEET
 * iframe (MeetFrame, mounted by MeetProvider) and it is positioned over the
 * `useMeetSlot` element of whichever chrome is on screen. Each chrome is
 * therefore a transparent window with controls around it: the container is
 * `pointer-events-none` so clicks fall through to the iframe below, and only
 * the header and buttons opt back in. That is what lets minimize, PiP and
 * fullscreen switch freely without the participant ever leaving the room.
 */

interface MeetCallProps {
  className?: string;
}

export function MeetCall({ className = '' }: MeetCallProps) {
  const { activeCall, endCall, setViewMode } = useMeetStore();

  const [isDragging, setIsDragging] = useState(false);
  const [pipPosition, setPipPosition] = useState({ x: 20, y: 20 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const slotRef = useMeetSlot();

  // Handle PIP dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeCall?.viewMode !== 'pip') return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - pipPosition.x,
      y: e.clientY - pipPosition.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const maxX = window.innerWidth - 320;
      const maxY = window.innerHeight - 240;

      setPipPosition({
        x: Math.max(0, Math.min(maxX, e.clientX - dragStart.x)),
        y: Math.max(0, Math.min(maxY, e.clientY - dragStart.y)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Don't render if no active call
  if (!activeCall) return null;

  const callDuration = formatDistanceToNow(activeCall.startedAt, { addSuffix: false });

  // Minimized: just a small bar. No slot, so the frame hides itself — the
  // call keeps running, it simply is not drawn.
  if (activeCall.viewMode === 'minimized' || activeCall.viewMode === 'embedded') {
    // `embedded` reaches here only when ChatPage is not showing the call
    // (the user navigated away); the bar is the way back to it.
    return (
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] bg-neon-surface border border-neon-border rounded-lg shadow-xl px-4 py-3 flex items-center gap-4 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-neon-success rounded-full animate-pulse" />
          <span className="text-sm font-medium">Call in progress</span>
          <span className="text-xs text-neon-text-muted">{callDuration}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-icon btn-ghost btn-sm"
            onClick={() => setViewMode('pip')}
            title="Picture in Picture"
          >
            <PictureInPicture className="w-4 h-4" />
          </button>
          <button
            className="btn btn-icon btn-ghost btn-sm"
            onClick={() => setViewMode('fullscreen')}
            title="Expand"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            className="btn btn-icon btn-sm bg-neon-error hover:bg-neon-error/80 text-white"
            onClick={endCall}
            title="End Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // PIP: a draggable small window. The slot is the whole box; the header is
  // an overlay on top of the video, as before.
  if (activeCall.viewMode === 'pip') {
    return (
      <div
        ref={slotRef}
        className={`fixed z-[100] rounded-lg shadow-2xl overflow-hidden border border-neon-border pointer-events-none ${
          isDragging ? 'cursor-grabbing' : ''
        } ${className}`}
        style={{
          left: pipPosition.x,
          top: pipPosition.y,
          width: '320px',
          height: '240px',
        }}
      >
        {/* PIP Header (Draggable) */}
        <div
          className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 py-2 flex items-center justify-between cursor-grab pointer-events-auto"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2 text-white text-xs">
            <Move className="w-3 h-3" />
            <span>{callDuration}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="p-1 hover:bg-white/20 rounded text-white"
              onClick={() => setViewMode('minimized')}
              title="Minimize"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            <button
              className="p-1 hover:bg-white/20 rounded text-white"
              onClick={() => setViewMode('fullscreen')}
              title="Expand"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              className="p-1 hover:bg-red-500 rounded text-white"
              onClick={endCall}
              title="End Call"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fullscreen: header bar, and the rest of the viewport is the slot.
  return (
    <div className={`fixed inset-0 z-[100] flex flex-col pointer-events-none ${className}`}>
      <div className="flex-shrink-0 h-14 px-4 flex items-center justify-between bg-neon-surface border-b border-neon-border pointer-events-auto">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-2 bg-neon-success rounded-full animate-pulse flex-shrink-0" />
          <span className="font-medium truncate">{activeCall.displayName}</span>
          <span className="text-sm text-neon-text-muted flex-shrink-0">{callDuration}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setViewMode('pip')}
            title="Picture in Picture"
          >
            <PictureInPicture className="w-4 h-4" />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setViewMode('embedded')}
            title="Exit Fullscreen"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            className="btn btn-sm bg-neon-error hover:bg-neon-error/80 text-white"
            onClick={endCall}
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Call</span>
          </button>
        </div>
      </div>

      <div ref={slotRef} className="flex-1 w-full" />
    </div>
  );
}

/**
 * The call as shown inside the chat page, in place of the message list.
 * Header with controls, then a slot the frame is drawn over. Its presence
 * tells MeetProvider that the embedded view is on screen, so the "call in
 * progress" bar is not shown as well.
 */
export function EmbeddedMeetCall({ className = '' }: { className?: string }) {
  const { activeCall, showChatSidebar, endCall, setViewMode, toggleChatSidebar, setEmbeddedMounted } =
    useMeetStore();
  const slotRef = useMeetSlot();

  useEffect(() => {
    setEmbeddedMounted(true);
    return () => setEmbeddedMounted(false);
  }, [setEmbeddedMounted]);

  if (!activeCall || activeCall.viewMode !== 'embedded') return null;

  const callDuration = formatDistanceToNow(activeCall.startedAt, { addSuffix: false });

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Embedded Header */}
      <div className="flex-shrink-0 h-12 px-4 flex items-center justify-between bg-neon-surface border-b border-neon-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-2 bg-neon-success rounded-full animate-pulse flex-shrink-0" />
          <span className="font-medium text-sm truncate">{activeCall.displayName}</span>
          <span className="text-xs text-neon-text-muted flex-shrink-0">{callDuration}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="btn btn-icon btn-ghost btn-sm"
            onClick={toggleChatSidebar}
            title={showChatSidebar ? 'Hide Chat' : 'Show Chat'}
          >
            <MessageSquare className={`w-4 h-4 ${showChatSidebar ? 'text-neon-accent' : ''}`} />
          </button>
          <button
            className="btn btn-icon btn-ghost btn-sm"
            onClick={() => setViewMode('pip')}
            title="Picture in Picture"
          >
            <PictureInPicture className="w-4 h-4" />
          </button>
          <button
            className="btn btn-icon btn-ghost btn-sm"
            onClick={() => setViewMode('minimized')}
            title="Minimize"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            className="btn btn-icon btn-ghost btn-sm"
            onClick={() => setViewMode('fullscreen')}
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            className="btn btn-icon btn-sm bg-neon-error hover:bg-neon-error/80 text-white"
            onClick={endCall}
            title="End Call"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* The frame is drawn here */}
      <div ref={slotRef} className="flex-1 w-full min-h-0" />
    </div>
  );
}

/**
 * Mobile: a floating button while collapsed (frame hidden, call alive), a
 * small card with the video when expanded.
 */
export function MobileMeetPip() {
  const { activeCall, setViewMode, endCall } = useMeetStore();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!activeCall || (activeCall.viewMode !== 'pip' && activeCall.viewMode !== 'minimized')) {
    return null;
  }

  if (!isExpanded) {
    return (
      <button
        className="fixed bottom-20 right-4 z-[100] w-14 h-14 bg-neon-success rounded-full shadow-lg flex items-center justify-center animate-pulse"
        onClick={() => setIsExpanded(true)}
        title="Show call"
      >
        <Phone className="w-6 h-6 text-white" />
      </button>
    );
  }

  return <MobileMeetPipExpanded onCollapse={() => setIsExpanded(false)} onExpand={() => setViewMode('embedded')} onEnd={endCall} />;
}

function MobileMeetPipExpanded({
  onCollapse,
  onExpand,
  onEnd,
}: {
  onCollapse: () => void;
  onExpand: () => void;
  onEnd: () => void;
}) {
  const activeCall = useMeetStore((state) => state.activeCall);
  const slotRef = useMeetSlot();

  if (!activeCall) return null;

  const callDuration = formatDistanceToNow(activeCall.startedAt, { addSuffix: false });

  return (
    <div className="fixed bottom-20 right-4 z-[100] w-[200px] bg-neon-surface rounded-lg shadow-2xl border border-neon-border overflow-hidden">
      {/* Mini Header */}
      <div className="px-3 py-2 flex items-center justify-between bg-neon-surface-hover">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-neon-success rounded-full animate-pulse" />
          <span className="text-xs">{callDuration}</span>
        </div>
        <button className="p-2 -m-1 hover:bg-neon-surface rounded" onClick={onCollapse} title="Hide">
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Mini Video — the frame is drawn here */}
      <div ref={slotRef} className="aspect-video bg-black relative" />

      {/* Mini Controls */}
      <div className="px-2 py-2 flex items-center justify-center gap-2">
        <button className="btn btn-icon btn-ghost btn-sm" onClick={onExpand} title="Expand">
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          className="btn btn-icon btn-sm bg-neon-error hover:bg-neon-error/80 text-white"
          onClick={onEnd}
          title="End Call"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
