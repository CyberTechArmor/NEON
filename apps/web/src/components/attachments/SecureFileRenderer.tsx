/**
 * Secure File Renderer Component
 *
 * Wraps attachment rendering with automatic presigned URL resolution.
 * Ensures files always have fresh, non-expired URLs.
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Attachment, MessageFile, getAttachmentType } from './types';
import { ImageAttachment } from './ImageAttachment';
import { AudioAttachment } from './AudioAttachment';
import { VideoAttachment } from './VideoAttachment';
import { DocumentAttachment } from './DocumentAttachment';
import { Lightbox } from './Lightbox';
import { getSecureFileUrl } from '../../hooks/useSecureFileUrl';

interface SecureFileRendererProps {
  /**
   * Files from message with full metadata (preferred)
   */
  files?: MessageFile[];
  /**
   * Legacy attachments with URLs (backwards compatibility)
   */
  attachments?: Attachment[];
  className?: string;
}

/**
 * Convert MessageFile to Attachment with resolved URL
 */
async function messageFileToAttachment(mf: MessageFile): Promise<Attachment> {
  // Try to get a fresh presigned URL
  let url = await getSecureFileUrl(mf.file.id);

  // Fallback to empty string if URL resolution fails
  // The component will handle the error state
  if (!url) {
    url = '';
  }

  return {
    id: mf.file.id,
    filename: mf.file.name,
    url,
    size: mf.file.size,
    mimeType: mf.file.mimeType,
    objectKey: mf.file.key,
    fileId: mf.file.id,
  };
}

/**
 * Secure File Renderer
 *
 * Handles both new-style MessageFile arrays and legacy Attachment arrays.
 * For MessageFile inputs, automatically fetches fresh presigned URLs.
 */
export function SecureFileRenderer({
  files,
  attachments: legacyAttachments,
  className = '',
}: SecureFileRendererProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);

  // Resolve files to attachments with fresh URLs
  useEffect(() => {
    const resolveFiles = async () => {
      // Use legacy attachments if provided (backwards compatibility)
      if (legacyAttachments && legacyAttachments.length > 0) {
        setAttachments(legacyAttachments);
        return;
      }

      // No files to resolve
      if (!files || files.length === 0) {
        setAttachments([]);
        return;
      }

      setLoading(true);
      try {
        const resolved = await Promise.all(files.map(messageFileToAttachment));
        setAttachments(resolved);
      } catch (error) {
        console.error('[SecureFileRenderer] Failed to resolve file URLs:', error);
        setAttachments([]);
      } finally {
        setLoading(false);
      }
    };

    resolveFiles();
  }, [files, legacyAttachments]);

  const handleOpenLightbox = useCallback((attachment: Attachment) => {
    setLightboxAttachment(attachment);
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightboxAttachment(null);
  }, []);

  const handleNavigateLightbox = useCallback((attachment: Attachment) => {
    setLightboxAttachment(attachment);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-neon-text-muted ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading files...</span>
      </div>
    );
  }

  // No attachments
  if (attachments.length === 0) {
    return null;
  }

  // Filter images for lightbox navigation
  const imageAttachments = attachments.filter(
    (a) => getAttachmentType(a.mimeType) === 'image'
  );

  return (
    <>
      <div className={`flex flex-col gap-2 ${className}`}>
        {attachments.map((attachment) => {
          const type = getAttachmentType(attachment.mimeType);

          // Handle missing URL (error state)
          if (!attachment.url) {
            return (
              <div
                key={attachment.id}
                className="p-3 rounded-lg bg-neon-error/10 border border-neon-error/20 text-neon-error text-sm"
              >
                Failed to load: {attachment.filename}
              </div>
            );
          }

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

export default SecureFileRenderer;
