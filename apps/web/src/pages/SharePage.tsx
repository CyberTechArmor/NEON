/**
 * SharePage - External file share viewer
 *
 * Displays shared files via public share links (/s/:token)
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText,
  Image,
  Video,
  Music,
  Download,
  Lock,
  AlertCircle,
  Loader2,
  Eye,
  File,
  Clock,
  Shield,
} from 'lucide-react';

interface ShareData {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiresIn: number;
  requiresPassword?: boolean;
}

interface ShareError {
  code: string;
  message: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return FileText;
  return File;
}

function getFileType(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ShareError | null>(null);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fetchShare = useCallback(async (sharePassword?: string) => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (sharePassword) {
        headers['X-Share-Password'] = sharePassword;
      }

      const response = await fetch(`/api/s/${token}`, { headers });
      const data = await response.json();

      if (!response.ok) {
        if (data.error?.code === 'PASSWORD_REQUIRED') {
          setShareData({
            url: '',
            fileName: data.data?.fileName || 'Protected File',
            fileSize: data.data?.fileSize || 0,
            mimeType: data.data?.mimeType || 'application/octet-stream',
            expiresIn: 0,
            requiresPassword: true,
          });
        } else {
          setError(data.error || { code: 'UNKNOWN', message: 'Failed to load share' });
        }
        return;
      }

      setShareData(data.data);
      setShowPreview(true);
    } catch (err) {
      setError({ code: 'NETWORK', message: 'Failed to connect to server' });
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  }, [token]);

  useEffect(() => {
    fetchShare();
  }, [fetchShare]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setPasswordError('Password is required');
      return;
    }
    setPasswordError('');
    setSubmitting(true);
    await fetchShare(password);
    if (!shareData?.url) {
      setPasswordError('Incorrect password');
    }
  };

  const handleDownload = () => {
    if (shareData?.url) {
      const link = document.createElement('a');
      link.href = shareData.url;
      link.download = shareData.fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Loading state
  if (loading && !shareData) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-neon-accent animate-spin mx-auto mb-4" />
          <p className="text-neon-text-muted">Loading shared file...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    const errorMessages: Record<string, { title: string; description: string; icon: typeof AlertCircle }> = {
      SHARE_NOT_FOUND: {
        title: 'Share Not Found',
        description: 'This share link is invalid or has been removed.',
        icon: AlertCircle,
      },
      SHARE_EXPIRED: {
        title: 'Share Expired',
        description: 'This share link has expired and is no longer accessible.',
        icon: Clock,
      },
      SHARE_EXHAUSTED: {
        title: 'Share Limit Reached',
        description: 'This share link has reached its maximum number of views.',
        icon: Eye,
      },
      NETWORK: {
        title: 'Connection Error',
        description: 'Unable to connect to the server. Please check your internet connection.',
        icon: AlertCircle,
      },
    };

    const errorInfo = errorMessages[error.code] || {
      title: 'Error',
      description: error.message,
      icon: AlertCircle,
    };
    const ErrorIcon = errorInfo.icon;

    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center p-4">
        <div className="bg-neon-surface border border-neon-border rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <ErrorIcon className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-neon-text mb-2">{errorInfo.title}</h1>
          <p className="text-neon-text-muted">{errorInfo.description}</p>
        </div>
      </div>
    );
  }

  // Password required state
  if (shareData?.requiresPassword && !shareData.url) {
    const FileIcon = getFileIcon(shareData.mimeType);

    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center p-4">
        <div className="bg-neon-surface border border-neon-border rounded-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-neon-accent/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-neon-accent" />
            </div>
            <h1 className="text-xl font-semibold text-neon-text mb-2">Password Protected</h1>
            <p className="text-neon-text-muted">This file is protected. Enter the password to access it.</p>
          </div>

          <div className="bg-neon-bg border border-neon-border rounded-lg p-4 mb-6 flex items-center gap-3">
            <FileIcon className="w-8 h-8 text-neon-text-muted flex-shrink-0" />
            <div className="overflow-hidden">
              <p className="font-medium text-neon-text truncate">{shareData.fileName}</p>
              {shareData.fileSize > 0 && (
                <p className="text-sm text-neon-text-muted">{formatFileSize(shareData.fileSize)}</p>
              )}
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="input w-full"
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-red-500 mt-1">{passwordError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary w-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Access File
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // File preview state
  if (shareData && shareData.url) {
    const FileIcon = getFileIcon(shareData.mimeType);
    const fileType = getFileType(shareData.mimeType);

    return (
      <div className="min-h-screen bg-neon-bg flex flex-col">
        {/* Header */}
        <header className="bg-neon-surface border-b border-neon-border px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 overflow-hidden">
              <FileIcon className="w-6 h-6 text-neon-accent flex-shrink-0" />
              <div className="overflow-hidden">
                <h1 className="font-medium text-neon-text truncate">{shareData.fileName}</h1>
                <p className="text-sm text-neon-text-muted">{formatFileSize(shareData.fileSize)}</p>
              </div>
            </div>
            <button onClick={handleDownload} className="btn btn-primary flex-shrink-0">
              <Download className="w-4 h-4 mr-2" />
              Download
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 overflow-auto">
          <div className="max-w-4xl mx-auto">
            {fileType === 'image' && showPreview && (
              <div className="bg-neon-surface border border-neon-border rounded-xl p-4">
                <img
                  src={shareData.url}
                  alt={shareData.fileName}
                  className="max-w-full h-auto mx-auto rounded-lg"
                />
              </div>
            )}

            {fileType === 'video' && showPreview && (
              <div className="bg-neon-surface border border-neon-border rounded-xl p-4">
                <video
                  src={shareData.url}
                  controls
                  className="max-w-full mx-auto rounded-lg"
                >
                  Your browser does not support video playback.
                </video>
              </div>
            )}

            {fileType === 'audio' && showPreview && (
              <div className="bg-neon-surface border border-neon-border rounded-xl p-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-neon-accent/10 flex items-center justify-center">
                    <Music className="w-12 h-12 text-neon-accent" />
                  </div>
                  <audio src={shareData.url} controls className="w-full max-w-md">
                    Your browser does not support audio playback.
                  </audio>
                </div>
              </div>
            )}

            {fileType === 'document' && (
              <div className="bg-neon-surface border border-neon-border rounded-xl p-8 text-center">
                <div className="w-24 h-24 rounded-full bg-neon-accent/10 flex items-center justify-center mx-auto mb-4">
                  <FileIcon className="w-12 h-12 text-neon-accent" />
                </div>
                <h2 className="text-xl font-semibold text-neon-text mb-2">{shareData.fileName}</h2>
                <p className="text-neon-text-muted mb-6">{formatFileSize(shareData.fileSize)}</p>
                <button onClick={handleDownload} className="btn btn-primary">
                  <Download className="w-4 h-4 mr-2" />
                  Download File
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-neon-surface border-t border-neon-border px-4 py-3 text-center">
          <p className="text-sm text-neon-text-muted">
            Shared via <span className="font-semibold text-neon-accent">NEON</span>
          </p>
        </footer>
      </div>
    );
  }

  return null;
}
