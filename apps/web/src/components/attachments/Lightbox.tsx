/**
 * Lightbox Component
 *
 * Modal for viewing images and videos in full screen.
 */

import { useEffect, useCallback, useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Attachment, getAttachmentType } from './types';

interface LightboxProps {
  attachment: Attachment;
  attachments?: Attachment[]; // For navigation between multiple images
  onClose: () => void;
  onNavigate?: (attachment: Attachment) => void;
}

export function Lightbox({ attachment, attachments = [], onClose, onNavigate }: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const type = getAttachmentType(attachment.mimeType);

  // Find current index for navigation
  const currentIndex = attachments.findIndex((a) => a.id === attachment.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < attachments.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev && onNavigate) {
      onNavigate(attachments[currentIndex - 1]);
      setZoom(1);
      setRotation(0);
    }
  }, [hasPrev, onNavigate, attachments, currentIndex]);

  const handleNext = useCallback(() => {
    if (hasNext && onNavigate) {
      onNavigate(attachments[currentIndex + 1]);
      setZoom(1);
      setRotation(0);
    }
  }, [hasNext, onNavigate, attachments, currentIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case '+':
        case '=':
          setZoom((z) => Math.min(z + 0.25, 3));
          break;
        case '-':
          setZoom((z) => Math.max(z - 0.25, 0.5));
          break;
        case 'r':
          setRotation((r) => (r + 90) % 360);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrev, handleNext]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors z-10"
        title="Close (Esc)"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 rounded-lg p-2 z-10">
        {type === 'image' && (
          <>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-5 h-5 text-white" />
            </button>
            <span className="text-white text-sm px-2 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-5 h-5 text-white" />
            </button>
            <div className="w-px h-6 bg-white/30" />
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title="Rotate (R)"
            >
              <RotateCw className="w-5 h-5 text-white" />
            </button>
          </>
        )}
        <button
          onClick={handleDownload}
          className="p-2 hover:bg-white/10 rounded transition-colors"
          title="Download"
        >
          <Download className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Navigation arrows */}
      {attachments.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 rounded-full transition-all z-10 ${
              hasPrev ? 'hover:bg-black/70 text-white' : 'text-white/30 cursor-not-allowed'
            }`}
            title="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 rounded-full transition-all z-10 ${
              hasNext ? 'hover:bg-black/70 text-white' : 'text-white/30 cursor-not-allowed'
            }`}
            title="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="max-w-[90vw] max-h-[85vh] overflow-auto">
        {type === 'image' ? (
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="max-w-full max-h-[85vh] object-contain transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
            draggable={false}
          />
        ) : type === 'video' ? (
          <video
            src={attachment.url}
            controls
            autoPlay
            className="max-w-full max-h-[85vh]"
          />
        ) : null}
      </div>

      {/* File info */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center z-10">
        <p className="text-white text-sm font-medium">{attachment.filename}</p>
        {attachments.length > 1 && (
          <p className="text-white/60 text-xs mt-1">
            {currentIndex + 1} of {attachments.length}
          </p>
        )}
      </div>
    </div>
  );
}

export default Lightbox;
