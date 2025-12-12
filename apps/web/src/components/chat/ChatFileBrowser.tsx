/**
 * Chat File Browser Component
 *
 * Displays files shared in a conversation with filtering and search.
 */

import { useState, useEffect, useCallback } from 'react';
import { conversationsApi, filesApi } from '../../lib/api';
import { formatDistanceToNow } from 'date-fns';

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
  const [sharing, setSharing] = useState<string | null>(null);

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
      const params: Record<string, string | number> = {
        limit: 20,
      };

      if (!reset && cursor) {
        params.cursor = cursor;
      }

      if (activeType !== 'all') {
        params.type = activeType;
      }

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }

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
      // Try to get a fresh URL
      try {
        const response = await filesApi.getPresignedUrl(file.id);
        window.open(response.data.data.url, '_blank');
      } catch {
        setError('Failed to download file');
      }
      return;
    }
    window.open(file.url, '_blank');
  };

  const handleShare = async (file: ChatFile) => {
    setSharing(file.id);
    try {
      const response = await filesApi.createShare(file.id, {});
      const shareUrl = `${window.location.origin}/s/${response.data.data.token}`;
      await navigator.clipboard.writeText(shareUrl);
      // Show success toast (you can integrate with your toast system)
      alert(`Share link copied: ${shareUrl}`);
    } catch (err) {
      setError('Failed to create share link');
    } finally {
      setSharing(null);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchFiles(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Shared Files
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="px-6 py-3 border-b dark:border-gray-700 space-y-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
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
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {label}
                {count !== undefined && count > 0 && (
                  <span className="ml-1.5 opacity-75">({count})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {files.length === 0 && !loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
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
                  className="group border dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow"
                >
                  {/* Preview */}
                  <div
                    className="h-32 bg-gray-100 dark:bg-gray-700 flex items-center justify-center cursor-pointer"
                    onClick={() => setSelectedFile(file)}
                  >
                    {file.mimeType.startsWith('image/') && file.url ? (
                      <img
                        src={file.thumbnailUrl || file.url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-4xl">${getFileIcon(file.mimeType)}</span>`;
                        }}
                      />
                    ) : (
                      <span className="text-4xl">{getFileIcon(file.mimeType)}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="font-medium text-gray-900 dark:text-white truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {formatFileSize(file.size)}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {file.message.sender.avatarUrl ? (
                        <img
                          src={file.message.sender.avatarUrl}
                          alt=""
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs">
                          {file.message.sender.displayName[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="truncate">{file.message.sender.displayName}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(file.message.sentAt), { addSuffix: true })}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDownload(file)}
                        className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => handleShare(file)}
                        disabled={sharing === file.id}
                        className="px-3 py-1.5 text-sm border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {sharing === file.id ? '...' : 'Share'}
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
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}

          {loading && files.length === 0 && (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-500 dark:text-gray-400 mt-3">Loading files...</p>
            </div>
          )}
        </div>

        {/* File Preview Modal */}
        {selectedFile && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/80"
            onClick={() => setSelectedFile(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedFile(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {selectedFile.mimeType.startsWith('image/') && selectedFile.url ? (
                <img
                  src={selectedFile.url}
                  alt={selectedFile.name}
                  className="max-w-full max-h-[80vh] object-contain"
                />
              ) : selectedFile.mimeType.startsWith('video/') && selectedFile.url ? (
                <video
                  src={selectedFile.url}
                  controls
                  className="max-w-full max-h-[80vh]"
                />
              ) : selectedFile.mimeType.startsWith('audio/') && selectedFile.url ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
                  <div className="text-6xl text-center mb-4">{getFileIcon(selectedFile.mimeType)}</div>
                  <p className="text-center font-medium mb-4">{selectedFile.name}</p>
                  <audio src={selectedFile.url} controls className="w-full" />
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
                  <div className="text-6xl mb-4">{getFileIcon(selectedFile.mimeType)}</div>
                  <p className="font-medium mb-2">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500 mb-4">{formatFileSize(selectedFile.size)}</p>
                  <button
                    onClick={() => handleDownload(selectedFile)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatFileBrowser;
