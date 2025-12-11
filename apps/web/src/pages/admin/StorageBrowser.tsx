/**
 * Storage Browser Admin Page
 *
 * Browse, view, and manage files in S3-compatible storage.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  Folder,
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  FileArchive,
  Download,
  Trash2,
  RefreshCw,
  ChevronRight,
  Home,
  Loader2,
  HardDrive,
  Search,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { adminApi, getErrorMessage } from '../../lib/api';

interface StorageObject {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  storageClass?: string;
}

interface StorageFolder {
  prefix: string;
  name: string;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get file extension from key
 */
function getFileExtension(key: string): string {
  const parts = key.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}

/**
 * Get file icon based on extension/type
 */
function getFileIcon(key: string) {
  const ext = getFileExtension(key);

  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) {
    return FileImage;
  }

  // Videos
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'].includes(ext)) {
    return FileVideo;
  }

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
    return FileAudio;
  }

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return FileArchive;
  }

  // Code/Text
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'md', 'sql'].includes(ext)) {
    return FileCode;
  }

  // Documents
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
    return FileText;
  }

  return File;
}

/**
 * Get file name from key (last part of path)
 */
function getFileName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || key;
}

export function StorageBrowser() {
  const queryClient = useQueryClient();
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedObject, setSelectedObject] = useState<StorageObject | null>(null);
  const [objectToDelete, setObjectToDelete] = useState<StorageObject | null>(null);

  // Fetch storage stats
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['admin', 'storage', 'stats'],
    queryFn: async () => {
      const response = await adminApi.storage.getStats();
      return response.data.data;
    },
  });

  // Fetch objects for current prefix
  const { data: browseData, isLoading: isLoadingBrowse, refetch } = useQuery({
    queryKey: ['admin', 'storage', 'browse', currentPrefix],
    queryFn: async () => {
      const response = await adminApi.storage.browse({ prefix: currentPrefix, limit: 100 });
      return response.data.data;
    },
  });

  // Fetch object details
  const { data: objectDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['admin', 'storage', 'object', selectedObject?.key],
    queryFn: async () => {
      if (!selectedObject) return null;
      const response = await adminApi.storage.getObject(selectedObject.key);
      return response.data.data;
    },
    enabled: !!selectedObject,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await adminApi.storage.deleteObject(key);
      return response.data.data;
    },
    onSuccess: () => {
      toast.success('Object deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'storage'] });
      setObjectToDelete(null);
      setSelectedObject(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Build breadcrumb path
  const breadcrumbs = useMemo(() => {
    const parts = currentPrefix.split('/').filter(Boolean);
    const crumbs = [{ name: 'Root', prefix: '' }];
    let accumulated = '';
    for (const part of parts) {
      accumulated += part + '/';
      crumbs.push({ name: part, prefix: accumulated });
    }
    return crumbs;
  }, [currentPrefix]);

  // Filter objects by search query
  const filteredObjects = useMemo(() => {
    if (!browseData?.objects || !searchQuery) return browseData?.objects || [];
    return browseData.objects.filter((obj) =>
      getFileName(obj.key).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [browseData?.objects, searchQuery]);

  const filteredFolders = useMemo(() => {
    if (!browseData?.folders || !searchQuery) return browseData?.folders || [];
    return browseData.folders.filter((folder) =>
      folder.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [browseData?.folders, searchQuery]);

  const handleNavigateToFolder = (prefix: string) => {
    setCurrentPrefix(prefix);
    setSelectedObject(null);
  };

  const handleDownload = () => {
    if (objectDetails?.downloadUrl) {
      window.open(objectDetails.downloadUrl, '_blank');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Storage Browser</h2>
          <p className="text-sm text-neon-text-muted mt-1">
            Browse and manage files in your organization's storage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => refetch()}
            disabled={isLoadingBrowse}
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingBrowse ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neon-accent/20 rounded-lg flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-neon-accent" />
            </div>
            <div>
              <p className="text-sm text-neon-text-muted">Storage Used</p>
              <p className="text-lg font-semibold">
                {isLoadingStats ? '...' : formatFileSize(statsData?.storageUsed || 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neon-info/20 rounded-lg flex items-center justify-center">
              <File className="w-5 h-5 text-neon-info" />
            </div>
            <div>
              <p className="text-sm text-neon-text-muted">Objects</p>
              <p className="text-lg font-semibold">
                {isLoadingStats ? '...' : (
                  <>
                    {statsData?.objectCount || 0}
                    {statsData?.hasMoreObjects && '+'}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neon-warning/20 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-neon-warning" />
            </div>
            <div>
              <p className="text-sm text-neon-text-muted">Storage Limit</p>
              <p className="text-lg font-semibold">
                {isLoadingStats ? '...' : statsData?.storageLimit ? formatFileSize(statsData.storageLimit) : 'Unlimited'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Breadcrumbs and Search */}
      <div className="flex items-center justify-between gap-4 mb-4">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm overflow-x-auto">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.prefix} className="flex items-center">
              {index > 0 && <ChevronRight className="w-4 h-4 text-neon-text-muted mx-1" />}
              <button
                onClick={() => handleNavigateToFolder(crumb.prefix)}
                className={`px-2 py-1 rounded hover:bg-neon-surface-hover transition-colors whitespace-nowrap ${
                  index === breadcrumbs.length - 1 ? 'text-white font-medium' : 'text-neon-text-muted'
                }`}
              >
                {index === 0 ? <Home className="w-4 h-4" /> : crumb.name}
              </button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neon-text-muted" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9 py-1.5 text-sm w-full"
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* File list */}
        <div className="flex-1 card overflow-hidden flex flex-col">
          {isLoadingBrowse ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-neon-text-muted" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Folders */}
              {filteredFolders.map((folder) => (
                <button
                  key={folder.prefix}
                  onClick={() => handleNavigateToFolder(folder.prefix || '')}
                  className="w-full flex items-center gap-3 p-3 hover:bg-neon-surface-hover transition-colors text-left border-b border-neon-border"
                >
                  <Folder className="w-5 h-5 text-neon-warning flex-shrink-0" />
                  <span className="flex-1 truncate">{folder.name}</span>
                  <ChevronRight className="w-4 h-4 text-neon-text-muted" />
                </button>
              ))}

              {/* Files */}
              {filteredObjects.map((obj) => {
                const FileIcon = getFileIcon(obj.key);
                const isSelected = selectedObject?.key === obj.key;

                return (
                  <button
                    key={obj.key}
                    onClick={() => setSelectedObject(obj)}
                    className={`w-full flex items-center gap-3 p-3 transition-colors text-left border-b border-neon-border ${
                      isSelected ? 'bg-neon-accent/10' : 'hover:bg-neon-surface-hover'
                    }`}
                  >
                    <FileIcon className="w-5 h-5 text-neon-text-muted flex-shrink-0" />
                    <span className="flex-1 truncate">{getFileName(obj.key)}</span>
                    <span className="text-xs text-neon-text-muted">{formatFileSize(obj.size)}</span>
                  </button>
                );
              })}

              {/* Empty state */}
              {filteredFolders.length === 0 && filteredObjects.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-neon-text-muted">
                  <File className="w-12 h-12 mb-4 opacity-50" />
                  <p>No files found</p>
                  {searchQuery && (
                    <p className="text-sm mt-1">Try a different search term</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Details panel */}
        {selectedObject && (
          <div className="w-80 card p-4 flex flex-col">
            <h3 className="font-medium mb-4 truncate" title={getFileName(selectedObject.key)}>
              {getFileName(selectedObject.key)}
            </h3>

            {isLoadingDetails ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
              </div>
            ) : objectDetails ? (
              <>
                {/* Preview for images */}
                {objectDetails.contentType?.startsWith('image/') && (
                  <div className="mb-4 rounded-lg overflow-hidden bg-neon-surface-hover">
                    <img
                      src={objectDetails.downloadUrl}
                      alt={getFileName(selectedObject.key)}
                      className="max-w-full max-h-48 object-contain mx-auto"
                    />
                  </div>
                )}

                {/* Details */}
                <div className="space-y-3 text-sm mb-4">
                  <div>
                    <p className="text-neon-text-muted">Size</p>
                    <p className="font-medium">{formatFileSize(objectDetails.size)}</p>
                  </div>
                  <div>
                    <p className="text-neon-text-muted">Type</p>
                    <p className="font-medium">{objectDetails.contentType || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-neon-text-muted">Last Modified</p>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(objectDetails.lastModified), { addSuffix: true })}
                    </p>
                  </div>
                  <div>
                    <p className="text-neon-text-muted">Full Path</p>
                    <p className="font-mono text-xs break-all">{objectDetails.key}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 mt-auto">
                  <button
                    onClick={handleDownload}
                    className="btn btn-primary w-full"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                  <button
                    onClick={() => setObjectToDelete(selectedObject)}
                    className="btn btn-secondary text-neon-error w-full"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-neon-text-muted">
                <p>Failed to load details</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {objectToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Object?</h3>
            <p className="text-neon-text-muted mb-4">
              Are you sure you want to delete{' '}
              <span className="font-medium text-white">{getFileName(objectToDelete.key)}</span>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => setObjectToDelete(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary bg-neon-error hover:bg-neon-error/80"
                onClick={() => deleteMutation.mutate(objectToDelete.key)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StorageBrowser;
