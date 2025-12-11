/**
 * Video Attachment Component
 *
 * Renders video attachments with a native video player.
 */

import { useState, useRef } from 'react';
import { Play, Download, Film, Maximize2 } from 'lucide-react';
import { Attachment, formatFileSize } from './types';

interface VideoAttachmentProps {
  attachment: Attachment;
  onOpenLightbox?: (attachment: Attachment) => void;
}

export function VideoAttachment({ attachment, onOpenLightbox }: VideoAttachmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenLightbox?.(attachment);
  };

  if (hasError) {
    return (
      <div className="flex items-center gap-3 p-3 bg-neon-surface rounded-lg border border-neon-border max-w-xs">
        <div className="w-10 h-10 bg-neon-accent/20 rounded-lg flex items-center justify-center">
          <Film className="w-5 h-5 text-neon-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.filename}</p>
          <p className="text-xs text-neon-text-muted">Failed to load video</p>
        </div>
        <button
          onClick={handleDownload}
          className="p-1.5 hover:bg-neon-surface-hover rounded text-neon-text-muted hover:text-white transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative group max-w-sm rounded-lg overflow-hidden bg-black"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={attachment.url}
        className="max-w-full max-h-64 object-contain"
        preload="metadata"
        controls={isPlaying}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setHasError(true)}
      />

      {/* Play overlay (when not playing) */}
      {!isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={handlePlay}
        >
          <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
            <Play className="w-6 h-6 text-white ml-1" />
          </div>
        </div>
      )}

      {/* Toolbar (on hover) */}
      {showControls && !isPlaying && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            onClick={handleFullscreen}
            className="p-1.5 bg-black/50 rounded hover:bg-black/70 transition-colors"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 bg-black/50 rounded hover:bg-black/70 transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      {/* File info */}
      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white">
        <span className="truncate max-w-[150px] inline-block align-bottom">
          {attachment.filename}
        </span>
        <span className="ml-2 text-white/70">{formatFileSize(attachment.size)}</span>
      </div>
    </div>
  );
}

export default VideoAttachment;
