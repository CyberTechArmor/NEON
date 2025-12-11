/**
 * Storage Browser - Super Admin Only
 *
 * Hierarchical S3 file browser with preview, download, and delete capabilities
 */

import { useState, useEffect, useCallback } from 'react';
import { adminApi, getErrorMessage } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import {
  Folder,
  File,
  Image,
  Film,
  Music,
  FileText,
  Download,
  Trash2,
  ChevronRight,
  Home,
  RefreshCw,
  AlertTriangle,
  Info,
  X,
  Search,
  Loader2,
} from 'lucide-react';

interface StorageItem {
  key: string;
  size: number;
  lastModified: string;
  isFolder: boolean;
  contentType?: string;
}

interface FileInfo {
  key: string;
  size: number;
  lastModified: string;
  contentType: string;
  metadata: Record<string, string>;
}

interface StorageStats {
  totalObjects: number;
  totalSize: number;
  bucketName: string;
  folders: Array<{ prefix: string; objectCount: number }>;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get icon for file type
function getFileIcon(item: StorageItem) {
  if (item.isFolder) {
    return <Folder className="w-5 h-5 text-yellow-500" />;
  }

  const contentType = item.contentType || '';
  if (contentType.startsWith('image/')) {
    return <Image className="w-5 h-5 text-green-500" />;
  }
  if (contentType.startsWith('video/')) {
    return <Film className="w-5 h-5 text-purple-500" />;
  }
  if (contentType.startsWith('audio/')) {
    return <Music className="w-5 h-5 text-pink-500" />;
  }
  if (contentType.includes('pdf') || contentType.includes('document')) {
    return <FileText className="w-5 h-5 text-red-500" />;
  }
  return <File className="w-5 h-5 text-gray-500" />;
}

// Get file name from key
function getFileName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] + '/';
}

export default function StorageBrowser() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<StorageItem[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [continuationToken, setContinuationToken] = useState<string | undefined>();
  const [isTruncated, setIsTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [selectedItem, setSelectedItem] = useState<StorageItem | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Check if user is Super Admin
  const isSuperAdmin = user?.role?.name === 'Super Administrator';

  // Load storage stats
  const loadStats = useCallback(async () => {
    try {
      const response = await adminApi.storageBrowser.getStats();
      setStats(response.data.data);
    } catch (err) {
      console.error('Failed to load storage stats:', err);
    }
  }, []);

  // Load items for current prefix
  const loadItems = useCallback(async (prefix: string, token?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await adminApi.storageBrowser.list({
        prefix,
        continuationToken: token,
        maxKeys: 100,
      });

      const data = response.data.data;
      if (token) {
        // Appending to existing items
        setItems((prev) => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setContinuationToken(data.continuationToken);
      setIsTruncated(data.isTruncated);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (isSuperAdmin) {
      loadItems('');
      loadStats();
    }
  }, [isSuperAdmin, loadItems, loadStats]);

  // Navigate to folder
  const navigateToFolder = (prefix: string) => {
    setCurrentPrefix(prefix);
    setContinuationToken(undefined);
    setSelectedItem(null);
    setFileInfo(null);
    setPreviewUrl(null);
    loadItems(prefix);
  };

  // Navigate to parent folder
  const navigateUp = () => {
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
    navigateToFolder(newPrefix);
  };

  // Get breadcrumb parts
  const getBreadcrumbs = () => {
    const parts = currentPrefix.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'Root', prefix: '' }];

    let accumulator = '';
    for (const part of parts) {
      accumulator += part + '/';
      breadcrumbs.push({ name: part, prefix: accumulator });
    }

    return breadcrumbs;
  };

  // Select item and load info
  const selectItem = async (item: StorageItem) => {
    setSelectedItem(item);
    setFileInfo(null);
    setPreviewUrl(null);

    if (!item.isFolder) {
      try {
        const [infoResponse, urlResponse] = await Promise.all([
          adminApi.storageBrowser.getFileInfo(item.key),
          adminApi.storageBrowser.getDownloadUrl(item.key),
        ]);
        setFileInfo(infoResponse.data.data);
        setPreviewUrl(urlResponse.data.data.downloadUrl);
      } catch (err) {
        console.error('Failed to load file info:', err);
      }
    }
  };

  // Download file
  const downloadFile = async (item: StorageItem) => {
    try {
      const response = await adminApi.storageBrowser.getDownloadUrl(item.key);
      const url = response.data.data.downloadUrl;

      // Create temporary link and click it
      const link = document.createElement('a');
      link.href = url;
      link.download = getFileName(item.key);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  // Delete file
  const deleteFile = async () => {
    if (!selectedItem || selectedItem.isFolder) return;

    setDeleting(true);
    try {
      await adminApi.storageBrowser.deleteFile(selectedItem.key);
      setShowDeleteConfirm(false);
      setSelectedItem(null);
      setFileInfo(null);
      setPreviewUrl(null);
      // Reload current folder
      loadItems(currentPrefix);
      loadStats();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  // Load more items
  const loadMore = () => {
    if (continuationToken && !loading) {
      loadItems(currentPrefix, continuationToken);
    }
  };

  // Filter items by search query
  const filteredItems = searchQuery
    ? items.filter((item) =>
        getFileName(item.key).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  // Not a Super Admin
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Access Denied
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Only Super Administrators can access the Storage Browser.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with stats */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Storage Browser
          </h1>
          <button
            onClick={() => {
              loadItems(currentPrefix);
              loadStats();
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                Bucket
              </p>
              <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                {stats.bucketName}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
              <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide">
                Total Objects
              </p>
              <p className="text-lg font-semibold text-green-900 dark:text-green-100">
                {stats.totalObjects.toLocaleString()}
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
              <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                Total Size
              </p>
              <p className="text-lg font-semibold text-purple-900 dark:text-purple-100">
                {formatBytes(stats.totalSize)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Breadcrumb navigation */}
      <div className="flex-shrink-0 flex items-center gap-2 mb-4 overflow-x-auto">
        {getBreadcrumbs().map((crumb, index) => (
          <div key={crumb.prefix} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-gray-400 mx-1 flex-shrink-0" />
            )}
            <button
              onClick={() => navigateToFolder(crumb.prefix)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-sm whitespace-nowrap ${
                crumb.prefix === currentPrefix
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {index === 0 && <Home className="w-4 h-4" />}
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex-shrink-0 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search in current folder..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex-shrink-0 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-600 dark:text-red-400 underline mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* File list */}
        <div className="flex-1 flex flex-col min-w-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex-1 overflow-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Folder className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No matching files found' : 'This folder is empty'}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Modified
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.key}
                      onClick={() => selectItem(item)}
                      onDoubleClick={() => {
                        if (item.isFolder) {
                          navigateToFolder(item.key);
                        }
                      }}
                      className={`cursor-pointer transition-colors ${
                        selectedItem?.key === item.key
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {getFileIcon(item)}
                          <span className="text-sm text-gray-900 dark:text-white truncate">
                            {getFileName(item.key)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">
                        {item.isFolder ? '-' : formatBytes(item.size)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">
                        {item.isFolder
                          ? '-'
                          : new Date(item.lastModified).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!item.isFolder && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadFile(item);
                              }}
                              className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem(item);
                                setShowDeleteConfirm(true);
                              }}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Load more button */}
          {isTruncated && (
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-2">
              <button
                onClick={loadMore}
                disabled={loading}
                className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>

        {/* File details panel */}
        {selectedItem && !selectedItem.isFolder && (
          <div className="w-80 flex-shrink-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-white">
                File Details
              </h3>
              <button
                onClick={() => {
                  setSelectedItem(null);
                  setFileInfo(null);
                  setPreviewUrl(null);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {/* Preview */}
              {previewUrl && fileInfo?.contentType?.startsWith('image/') && (
                <div className="mb-4">
                  <img
                    src={previewUrl}
                    alt={getFileName(selectedItem.key)}
                    className="w-full h-40 object-contain bg-gray-100 dark:bg-gray-800 rounded-lg"
                  />
                </div>
              )}

              {/* File info */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Name
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white break-all">
                    {getFileName(selectedItem.key)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Full Path
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white break-all font-mono text-xs">
                    {selectedItem.key}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Size
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {formatBytes(selectedItem.size)}
                  </p>
                </div>

                {fileInfo && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Content Type
                      </p>
                      <p className="text-sm text-gray-900 dark:text-white">
                        {fileInfo.contentType}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Last Modified
                      </p>
                      <p className="text-sm text-gray-900 dark:text-white">
                        {new Date(fileInfo.lastModified).toLocaleString()}
                      </p>
                    </div>

                    {Object.keys(fileInfo.metadata).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                          Metadata
                        </p>
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 space-y-1">
                          {Object.entries(fileInfo.metadata).map(([key, value]) => (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">
                                {key}
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
              <button
                onClick={() => downloadFile(selectedItem)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete File
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Are you sure you want to delete this file? This action cannot be
                  undone.
                </p>
                <p className="mt-2 text-sm font-mono bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 break-all">
                  {selectedItem.key}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteFile}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
