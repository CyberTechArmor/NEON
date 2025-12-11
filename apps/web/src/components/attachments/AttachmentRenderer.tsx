/**
 * Attachment Renderer Component
 *
 * Routes to the appropriate attachment component based on file type.
 * Provides a unified interface for rendering message attachments.
 */

import { useState } from 'react';
import { Attachment, getAttachmentType } from './types';
import { ImageAttachment } from './ImageAttachment';
import { AudioAttachment } from './AudioAttachment';
import { VideoAttachment } from './VideoAttachment';
import { DocumentAttachment } from './DocumentAttachment';
import { Lightbox } from './Lightbox';

interface AttachmentRendererProps {
  attachments: Attachment[];
  className?: string;
}

/**
 * Renders a list of attachments with appropriate components for each type
 */
export function AttachmentRenderer({ attachments, className = '' }: AttachmentRendererProps) {
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  // Separate attachments by type for lightbox navigation
  const imageAttachments = attachments.filter(
    (a) => getAttachmentType(a.mimeType) === 'image'
  );

  const handleOpenLightbox = (attachment: Attachment) => {
    setLightboxAttachment(attachment);
  };

  const handleCloseLightbox = () => {
    setLightboxAttachment(null);
  };

  const handleNavigateLightbox = (attachment: Attachment) => {
    setLightboxAttachment(attachment);
  };

  return (
    <>
      <div className={`flex flex-col gap-2 ${className}`}>
        {attachments.map((attachment) => {
          const type = getAttachmentType(attachment.mimeType);

          switch (type) {
            case 'image':
              return (
                <ImageAttachment
                  key={attachment.id}
                  attachment={attachment}
                  onOpenLightbox={handleOpenLightbox}
                />
              );
            case 'audio':
              return <AudioAttachment key={attachment.id} attachment={attachment} />;
            case 'video':
              return (
                <VideoAttachment
                  key={attachment.id}
                  attachment={attachment}
                  onOpenLightbox={handleOpenLightbox}
                />
              );
            default:
              return <DocumentAttachment key={attachment.id} attachment={attachment} />;
          }
        })}
      </div>

      {/* Lightbox for images and videos */}
      {lightboxAttachment && (
        <Lightbox
          attachment={lightboxAttachment}
          attachments={imageAttachments}
          onClose={handleCloseLightbox}
          onNavigate={handleNavigateLightbox}
        />
      )}
    </>
  );
}

/**
 * Single attachment renderer for simpler use cases
 */
export function SingleAttachmentRenderer({
  attachment,
  onOpenLightbox,
}: {
  attachment: Attachment;
  onOpenLightbox?: (attachment: Attachment) => void;
}) {
  const type = getAttachmentType(attachment.mimeType);

  switch (type) {
    case 'image':
      return <ImageAttachment attachment={attachment} onOpenLightbox={onOpenLightbox} />;
    case 'audio':
      return <AudioAttachment attachment={attachment} />;
    case 'video':
      return <VideoAttachment attachment={attachment} onOpenLightbox={onOpenLightbox} />;
    default:
      return <DocumentAttachment attachment={attachment} />;
  }
}

export default AttachmentRenderer;
