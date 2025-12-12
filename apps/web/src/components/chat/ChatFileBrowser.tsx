/**
 * Chat File Browser Component
 *
 * Displays files shared in a conversation with filtering and search.
 * Uses NEON design system styling.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Download, Share2, ExternalLink, Link2, Copy, Check, Loader2 } from 'lucide-react';
import { conversationsApi, filesApi } from '../../lib/api';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface ChatFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string | null;
  thumbnailUrl: string | null;
  uploadedAt: string;
  message: {
    id: string;
    sentAt: string;
    sender: { id: string; displayName: string; avatarUrl: string | null };
  };
}

interface FileCounts {
  total: number;
  images: number;
  videos: number;
  audio: number;
  documents: number;
}

interface ChatFileBrowserProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ShareDialogProps {
  file: ChatFile;
  onClose: () => void;
}

type FileType = 'all' | 'image' | 'video' | 'audio' | 'document';

const FILE_TYPE_ICONS: Record<string, string> = {
  'image/': '🖼️',
  'video/': '🎬',
  'audio/': '🎵',
  'application/pdf': '📄',
  'application/': '📎',
  'text/': '📝',
  default: '📁',
};

function getFileIcon(mimeType: string): string {
  for (const [prefix, icon] of Object.entries(FILE_TYPE_ICONS)) {
    if (mimeType.startsWith(prefix)) return icon;
  }
  return FILE_TYPE_ICONS.default;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Share Dialog Component
function ShareDialog({ file, onClose }: ShareDialogProps) {
  const [shareType, setShareType] = useState<'internal' | 'external'>('internal');
  const [isCreating, setIsCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>('never');

  const createShare = async () => {
    setIsCreating(true);
    try {
      if (shareType === 'internal') {
        // For internal sharing, just get a fresh presigned URL
        const response = await filesApi.getPresignedUrl(file.id);
        setShareUrl(response.data.data.url);
      } else {
        // For external sharing, create a share link
        const expiresAt = expiresIn === 'never' ? undefined :
          expiresIn === '1h' ? new Date(Date.now() + 60 * 60 * 1000).toISOString() :
          expiresIn === '24h' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() :
          expiresIn === '7d' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() :
          undefined;

        const response = await filesApi.createShare(file.id, {
          password: usePassword && password ? password : undefined,
          expiresAt,
        });
        setShareUrl(`${window.location.origin}/s/${response.data.data.token}`);
      }
    } catch (err) {
      toast.error('Failed to create share link');
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-neon-surface border border-neon-border rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neon-border">
          <h3 className="text-lg font-semibold">Share File</h3>
          <button
            onClick={onClose}
            className="btn btn-icon btn-ghost btn-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 p-3 bg-neon-surface-hover rounded-lg">
            <span className="text-2xl">{getFileIcon(file.mimeType)}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-neon-text-muted">{formatFileSize(file.size)}</p>
            </div>
          </div>

          {/* Share type selector */}
          <div className="flex gap-2">
            <button
              onClick={() => { setShareType('internal'); setShareUrl(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                shareType === 'internal'
                  ? 'bg-neon-accent text-white'
                  : 'bg-neon-surface-hover text-neon-text-muted hover:text-white'
              }`}
            >
              <Link2 className="w-4 h-4" />
              Internal
            </button>
            <button
              onClick={() => { setShareType('external'); setShareUrl(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                shareType === 'external'
                  ? 'bg-neon-accent text-white'
                  : 'bg-neon-surface-hover text-neon-text-muted hover:text-white'
              }`}
            >
              <ExternalLink className="w-4 h-4" />
              External
            </button>
          </div>

          {/* Share type description */}
          <p className="text-sm text-neon-text-muted">
            {shareType === 'internal'
              ? 'Generate a direct download link (expires in 1 hour, requires login)'
              : 'Create a public share link that anyone can access'}
          </p>

          {/* External share options */}
          {shareType === 'external' && !shareUrl && (
            <div className="space-y-3">
              {/* Password protection */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="usePassword"
                  checked={usePassword}
                  onChange={(e) => setUsePassword(e.target.checked)}
                  className="w-4 h-4 rounded border-neon-border bg-neon-surface text-neon-accent focus:ring-neon-accent"
                />
                <label htmlFor="usePassword" className="text-sm">Password protect</label>
              </div>
              {usePassword && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="input w-full"
                />
              )}

              {/* Expiration */}
              <div>
                <label className="text-sm text-neon-text-muted mb-1 block">Expires</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  className="input w-full"
                >
                  <option value="never">Never</option>
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                </select>
              </div>
            </div>
          )}

          {/* Generated URL */}
          {shareUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-neon-surface-hover rounded-lg">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <button
                  onClick={copyToClipboard}
                  className="btn btn-icon btn-ghost btn-sm"
                  title="Copy link"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {shareType === 'external' && usePassword && password && (
                <p className="text-xs text-neon-text-muted">
                  Password: {password}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-neon-border">
          <button onClick={onClose} className="btn btn-ghost">
            Close
          </button>
          {!shareUrl && (
            <button
              onClick={createShare}
              disabled={isCreating}
              className="btn btn-primary"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Generate Link'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatFileBrowser({ conversationId, isOpen, onClose }: ChatFileBrowserProps) {
  const [files, setFiles] = useState<ChatFile[]>([]);
  const [counts, setCounts] = useState<FileCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<FileType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<ChatFile | null>(null);
  const [sharingFile, setSharingFile] = useState<ChatFile | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchFiles = useCallback(async (reset = false) => {
    if (!conversationId || !isOpen) return;

    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = { limit: 20 };
      if (!reset && cursor) params.cursor = cursor;
      if (activeType !== 'all') params.type = activeType;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const response = await conversationsApi.listFiles(conversationId, params as any);
      const data = response.data;

      if (reset) {
        setFiles(data.data);
      } else {
        setFiles((prev) => [...prev, ...data.data]);
      }

      setCounts((data.meta as any).counts || null);
      setHasMore((data.meta as any).pagination?.hasMore || false);
      setCursor((data.meta as any).pagination?.cursor || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [conversationId, isOpen, cursor, activeType, debouncedSearch]);

  // Reset and fetch when filters change
  useEffect(() => {
    setCursor(null);
    setFiles([]);
    fetchFiles(true);
  }, [activeType, debouncedSearch, conversationId, isOpen]);

  const handleDownload = async (file: ChatFile) => {
    if (!file.url) {
      try {
        const response = await filesApi.getPresignedUrl(file.id);
        window.open(response.data.data.url, '_blank');
      } catch {
        toast.error('Failed to download file');
      }
      return;
    }
    window.open(file.url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-neon-surface border border-neon-border rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neon-border">
          <h2 className="text-xl font-semibold">Shared Files</h2>
          <button onClick={onClose} className="btn btn-icon btn-ghost">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="px-6 py-4 border-b border-neon-border space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neon-text-muted" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-10"
            />
          </div>

          {/* Type Filters */}
          <div className="flex gap-2 flex-wrap">
            {[
              { type: 'all' as FileType, label: 'All', count: counts?.total },
              { type: 'image' as FileType, label: 'Images', count: counts?.images },
              { type: 'video' as FileType, label: 'Videos', count: counts?.videos },
              { type: 'audio' as FileType, label: 'Audio', count: counts?.audio },
              { type: 'document' as FileType, label: 'Documents', count: counts?.documents },
            ].map(({ type, label, count }) => (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  activeType === type
                    ? 'bg-neon-accent border-neon-accent text-white shadow-md'
                    : 'bg-neon-bg border-neon-border text-neon-text-muted hover:bg-neon-surface-hover hover:text-neon-text'
                }`}
              >
                {label}
                {count !== undefined && count > 0 && (
                  <span className={`ml-1.5 ${activeType === type ? 'text-white/80' : 'text-neon-text-muted'}`}>({count})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-neon-error/10 border border-neon-error/30 rounded-lg text-neon-error">
              {error}
            </div>
          )}

          {files.length === 0 && !loading ? (
            <div className="text-center py-12 text-neon-text-muted">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neon-surface-hover flex items-center justify-center">
                <Search className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-lg">No files found</p>
              <p className="text-sm mt-1">
                {debouncedSearch ? 'Try a different search term' : 'Files shared in this chat will appear here'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="group border border-neon-border rounded-lg overflow-hidden bg-neon-surface hover:border-neon-accent/50 transition-colors"
                >
                  {/* Preview */}
                  <div
                    className="h-32 bg-neon-surface-hover flex items-center justify-center cursor-pointer"
                    onClick={() => setSelectedFile(file)}
                  >
                    {file.mimeType.startsWith('image/') && file.url ? (
                      <img
                        src={file.thumbnailUrl || file.url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-4xl">{getFileIcon(file.mimeType)}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="font-medium truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-sm text-neon-text-muted mt-1">
                      {formatFileSize(file.size)}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-neon-text-muted">
                      <div className="avatar avatar-xs">
                        {file.message.sender.avatarUrl ? (
                          <img src={file.message.sender.avatarUrl} alt="" />
                        ) : (
                          <span>{file.message.sender.displayName[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <span className="truncate">{file.message.sender.displayName}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(file.message.sentAt), { addSuffix: true })}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleDownload(file)}
                        className="btn btn-sm btn-primary flex-1"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </button>
                      <button
                        onClick={() => setSharingFile(file)}
                        className="btn btn-sm btn-ghost"
                        title="Share"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="text-center mt-6">
              <button
                onClick={() => fetchFiles(false)}
                disabled={loading}
                className="btn btn-ghost"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}

          {loading && files.length === 0 && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-neon-accent" />
              <p className="text-neon-text-muted mt-3">Loading files...</p>
            </div>
          )}
        </div>

        {/* File Preview Modal */}
        {selectedFile && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
            onClick={() => setSelectedFile(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedFile(null)}
                className="absolute top-4 right-4 z-10 btn btn-icon btn-ghost bg-black/50 hover:bg-black/70"
              >
                <X className="w-5 h-5" />
              </button>

              {selectedFile.mimeType.startsWith('image/') && selectedFile.url ? (
                <img
                  src={selectedFile.url}
                  alt={selectedFile.name}
                  className="max-w-full max-h-[80vh] object-contain rounded-lg"
                />
              ) : selectedFile.mimeType.startsWith('video/') && selectedFile.url ? (
                <video
                  src={selectedFile.url}
                  controls
                  className="max-w-full max-h-[80vh] rounded-lg"
                />
              ) : selectedFile.mimeType.startsWith('audio/') && selectedFile.url ? (
                <div className="bg-neon-surface rounded-lg p-8">
                  <div className="text-6xl text-center mb-4">{getFileIcon(selectedFile.mimeType)}</div>
                  <p className="text-center font-medium mb-4">{selectedFile.name}</p>
                  <audio src={selectedFile.url} controls className="w-full" />
                </div>
              ) : (
                <div className="bg-neon-surface rounded-lg p-8 text-center">
                  <div className="text-6xl mb-4">{getFileIcon(selectedFile.mimeType)}</div>
                  <p className="font-medium mb-2">{selectedFile.name}</p>
                  <p className="text-sm text-neon-text-muted mb-4">{formatFileSize(selectedFile.size)}</p>
                  <button
                    onClick={() => handleDownload(selectedFile)}
                    className="btn btn-primary"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Share Dialog */}
        {sharingFile && (
          <ShareDialog
            file={sharingFile}
            onClose={() => setSharingFile(null)}
          />
        )}
      </div>
    </div>
  );
}

export default ChatFileBrowser;
