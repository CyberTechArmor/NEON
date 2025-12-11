/**
 * Image Attachment Component
 *
 * Renders image attachments with thumbnail preview and click-to-open lightbox.
 */

import { useState } from 'react';
import { Download, ZoomIn, Loader2 } from 'lucide-react';
import { Attachment, formatFileSize } from './types';

interface ImageAttachmentProps {
  attachment: Attachment;
  onOpenLightbox?: (attachment: Attachment) => void;
}

export function ImageAttachment({ attachment, onOpenLightbox }: ImageAttachmentProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

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

  if (hasError) {
    return (
      <div className="flex items-center gap-3 p-3 bg-neon-surface rounded-lg border border-neon-border max-w-xs">
        <div className="w-10 h-10 bg-neon-surface-hover rounded flex items-center justify-center text-neon-text-muted">
          <ZoomIn className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.filename}</p>
          <p className="text-xs text-neon-text-muted">Failed to load image</p>
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
      className="relative group cursor-pointer max-w-xs rounded-lg overflow-hidden"
      onClick={() => onOpenLightbox?.(attachment)}
    >
      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neon-surface">
          <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
        </div>
      )}

      {/* Image */}
      <img
        src={attachment.url}
        alt={attachment.filename}
        className={`max-w-full max-h-64 object-contain rounded-lg transition-opacity ${
          isLoading ? 'opacity-0' : 'opacity-100'
        }`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button
          className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
          title="View full size"
        >
          <ZoomIn className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={handleDownload}
          className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
          title="Download"
        >
          <Download className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* File info badge */}
      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
        {formatFileSize(attachment.size)}
      </div>
    </div>
  );
}

export default ImageAttachment;
