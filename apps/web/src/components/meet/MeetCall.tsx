import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Minimize2,
  Maximize2,
  MessageSquare,
  Phone,
  PhoneOff,
  PictureInPicture,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Users,
  Move,
} from 'lucide-react';
import { useMeetStore, MeetViewMode } from '../../stores/meet';
import { formatDistanceToNow } from 'date-fns';

interface MeetCallProps {
  className?: string;
}

export function MeetCall({ className = '' }: MeetCallProps) {
  const navigate = useNavigate();
  const {
    activeCall,
    showChatSidebar,
    endCall,
    setViewMode,
    toggleChatSidebar,
  } = useMeetStore();

  const [isDragging, setIsDragging] = useState(false);
  const [pipPosition, setPipPosition] = useState({ x: 20, y: 20 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const pipRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

      const maxX = window.innerWidth - (pipRef.current?.offsetWidth || 320);
      const maxY = window.innerHeight - (pipRef.current?.offsetHeight || 240);

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

  // Render minimized view (just a small bar)
  if (activeCall.viewMode === 'minimized') {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] bg-neon-surface border border-neon-border rounded-lg shadow-xl px-4 py-3 flex items-center gap-4">
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
            onClick={() => setViewMode('embedded')}
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

  // Render PIP view (draggable small window)
  if (activeCall.viewMode === 'pip') {
    return (
      <div
        ref={pipRef}
        className={`fixed z-[100] bg-neon-bg rounded-lg shadow-2xl overflow-hidden border border-neon-border ${
          isDragging ? 'cursor-grabbing' : ''
        }`}
        style={{
          left: pipPosition.x,
          top: pipPosition.y,
          width: '320px',
          height: '240px',
        }}
      >
        {/* PIP Header (Draggable) */}
        <div
          className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 py-2 flex items-center justify-between cursor-grab"
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
              onClick={() => setViewMode('embedded')}
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

        {/* PIP Iframe */}
        <iframe
          ref={iframeRef}
          src={activeCall.joinUrl}
          allow="camera *; microphone *; display-capture *; autoplay *; fullscreen *; speaker-selection *; encrypted-media *; picture-in-picture *; clipboard-write *; clipboard-read *"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>
    );
  }

  // Render fullscreen view
  if (activeCall.viewMode === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-[100] bg-neon-bg flex flex-col">
        {/* Fullscreen Header */}
        <div className="flex-shrink-0 h-14 px-4 flex items-center justify-between bg-neon-surface border-b border-neon-border">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-neon-success rounded-full animate-pulse" />
            <span className="font-medium">{activeCall.displayName}</span>
            <span className="text-sm text-neon-text-muted">{callDuration}</span>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Fullscreen Iframe */}
        <iframe
          ref={iframeRef}
          src={activeCall.joinUrl}
          allow="camera *; microphone *; display-capture *; autoplay *; fullscreen *; speaker-selection *; encrypted-media *; picture-in-picture *; clipboard-write *; clipboard-read *"
          allowFullScreen
          className="flex-1 w-full border-0"
        />
      </div>
    );
  }

  // Render embedded view (default)
  return null; // Embedded view is rendered in ChatPage
}

// Embedded call view component for use inside chat
export function EmbeddedMeetCall({ className = '' }: { className?: string }) {
  const {
    activeCall,
    showChatSidebar,
    endCall,
    setViewMode,
    toggleChatSidebar,
  } = useMeetStore();

  if (!activeCall || activeCall.viewMode !== 'embedded') return null;

  const callDuration = formatDistanceToNow(activeCall.startedAt, { addSuffix: false });

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Embedded Header */}
      <div className="flex-shrink-0 h-12 px-4 flex items-center justify-between bg-neon-surface border-b border-neon-border">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-neon-success rounded-full animate-pulse" />
          <span className="font-medium text-sm">{activeCall.displayName}</span>
          <span className="text-xs text-neon-text-muted">{callDuration}</span>
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

      {/* Embedded Iframe */}
      <iframe
        src={activeCall.joinUrl}
        allow="camera *; microphone *; display-capture *; autoplay *; fullscreen *; speaker-selection *; encrypted-media *; picture-in-picture *; clipboard-write *; clipboard-read *"
        allowFullScreen
        className="flex-1 w-full border-0"
      />
    </div>
  );
}

// Mobile-specific PIP component
export function MobileMeetPip() {
  const { activeCall, setViewMode, endCall } = useMeetStore();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!activeCall || (activeCall.viewMode !== 'pip' && activeCall.viewMode !== 'minimized')) {
    return null;
  }

  const callDuration = formatDistanceToNow(activeCall.startedAt, { addSuffix: false });

  if (!isExpanded) {
    return (
      <button
        className="fixed bottom-20 right-4 z-[100] w-14 h-14 bg-neon-success rounded-full shadow-lg flex items-center justify-center animate-pulse"
        onClick={() => setIsExpanded(true)}
      >
        <Phone className="w-6 h-6 text-white" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-[100] w-[200px] bg-neon-surface rounded-lg shadow-2xl border border-neon-border overflow-hidden">
      {/* Mini Header */}
      <div className="px-3 py-2 flex items-center justify-between bg-neon-surface-hover">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-neon-success rounded-full animate-pulse" />
          <span className="text-xs">{callDuration}</span>
        </div>
        <button
          className="p-1 hover:bg-neon-surface rounded"
          onClick={() => setIsExpanded(false)}
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Mini Video */}
      <div className="aspect-video bg-black relative">
        <iframe
          src={activeCall.joinUrl}
          allow="camera *; microphone *; display-capture *; autoplay *; fullscreen *; speaker-selection *; encrypted-media *; picture-in-picture *; clipboard-write *; clipboard-read *"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>

      {/* Mini Controls */}
      <div className="px-2 py-2 flex items-center justify-center gap-2">
        <button
          className="btn btn-icon btn-ghost btn-sm"
          onClick={() => setViewMode('embedded')}
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
