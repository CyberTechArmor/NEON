/**
 * Document Attachment Component
 *
 * Renders document/file attachments with download option.
 */

import { Download, FileText, FileSpreadsheet, FileCode, File, FileArchive } from 'lucide-react';
import { Attachment, formatFileSize, getFileExtension } from './types';

interface DocumentAttachmentProps {
  attachment: Attachment;
}

/**
 * Get appropriate icon based on file extension
 */
function getFileIcon(filename: string, mimeType: string) {
  const ext = getFileExtension(filename).toLowerCase();

  // Spreadsheets
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext) || mimeType.includes('spreadsheet')) {
    return FileSpreadsheet;
  }

  // Code files
  if (
    ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'md', 'sql'].includes(ext) ||
    mimeType.includes('javascript') ||
    mimeType.includes('typescript')
  ) {
    return FileCode;
  }

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mimeType.includes('zip') || mimeType.includes('archive')) {
    return FileArchive;
  }

  // Documents (PDF, Word, etc.)
  if (
    ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext) ||
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('text')
  ) {
    return FileText;
  }

  // Default
  return File;
}

/**
 * Get color class based on file type
 */
function getFileColor(filename: string, mimeType: string): string {
  const ext = getFileExtension(filename).toLowerCase();

  if (['pdf'].includes(ext) || mimeType.includes('pdf')) {
    return 'bg-red-500/20 text-red-400';
  }

  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || mimeType.includes('document')) {
    return 'bg-blue-500/20 text-blue-400';
  }

  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext) || mimeType.includes('spreadsheet')) {
    return 'bg-green-500/20 text-green-400';
  }

  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType.includes('archive')) {
    return 'bg-yellow-500/20 text-yellow-400';
  }

  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'html', 'css', 'json'].includes(ext)) {
    return 'bg-purple-500/20 text-purple-400';
  }

  return 'bg-neon-accent/20 text-neon-accent';
}

export function DocumentAttachment({ attachment }: DocumentAttachmentProps) {
  const Icon = getFileIcon(attachment.filename, attachment.mimeType);
  const colorClass = getFileColor(attachment.filename, attachment.mimeType);
  const extension = getFileExtension(attachment.filename);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-neon-surface rounded-lg border border-neon-border max-w-xs hover:border-neon-border/80 transition-colors">
      {/* File icon */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={attachment.filename}>
          {attachment.filename}
        </p>
        <div className="flex items-center gap-2 text-xs text-neon-text-muted">
          {extension && <span className="uppercase">{extension}</span>}
          <span>{formatFileSize(attachment.size)}</span>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        className="p-2 hover:bg-neon-surface-hover rounded-lg text-neon-text-muted hover:text-white transition-colors flex-shrink-0"
        title="Download"
      >
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
}

export default DocumentAttachment;
