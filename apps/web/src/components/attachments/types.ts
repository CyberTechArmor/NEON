/**
 * Attachment Types and Utilities
 */

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  // Optional: S3 object key for generating fresh presigned URLs
  objectKey?: string;
  // Optional: File ID for looking up file details
  fileId?: string;
}

/**
 * File metadata as stored in the database (from MessageFile join)
 */
export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  bucket: string;
  key: string; // S3 object key
  thumbnailKey?: string;
  createdAt: string;
}

/**
 * Message file from API (includes file details via join)
 */
export interface MessageFile {
  messageId: string;
  fileId: string;
  order: number;
  file: FileMetadata;
}

export type AttachmentType = 'image' | 'video' | 'audio' | 'document';

/**
 * Determine the type of attachment based on MIME type
 */
export function getAttachmentType(mimeType: string): AttachmentType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toUpperCase() || '' : '';
}

/**
 * Check if the attachment is previewable
 */
export function isPreviewable(mimeType: string): boolean {
  const type = getAttachmentType(mimeType);
  return type === 'image' || type === 'video' || type === 'audio';
}
