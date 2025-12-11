import { useState, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, Loader2, Trash2, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { usersApi, getErrorMessage } from '../lib/api';
import { useAuthStore } from '../stores/auth';

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onAvatarChange?: (newAvatarUrl: string | null) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const OUTPUT_SIZE = 512; // 512x512 max output size

export function AvatarUpload({
  currentAvatarUrl,
  onAvatarChange,
  size = 'lg',
  className = '',
}: AvatarUploadProps) {
  const { user, setUser } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-32 h-32',
  };

  const displayUrl = currentAvatarUrl || user?.avatarUrl;

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: Blob) => {
      // Get presigned URL
      const presignRes = await usersApi.getAvatarPresignedUrl('image/jpeg', 'avatar.jpg');
      const { uploadUrl, key } = presignRes.data.data;

      // Upload to S3
      await fetch(uploadUrl.url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });

      // Confirm upload
      const confirmRes = await usersApi.confirmAvatarUpload(key);
      return confirmRes.data.data;
    },
    onSuccess: (data) => {
      toast.success('Avatar updated successfully');
      // Update auth store with new avatar URL
      if (user) {
        setUser({ ...user, avatarUrl: data.avatarUrl });
      }
      onAvatarChange?.(data.avatarUrl);
      handleCloseModal();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await usersApi.deleteAvatar();
    },
    onSuccess: () => {
      toast.success('Avatar removed');
      if (user) {
        setUser({ ...user, avatarUrl: undefined });
      }
      onAvatarChange?.(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Please use JPG, PNG, WebP, or GIF.');
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }

    setSelectedFile(file);
    setZoom(1);
    setPosition({ x: 0, y: 0 });

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!previewUrl) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(3, Math.max(0.5, prev + delta)));
  };

  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const cropAndUpload = async () => {
    if (!previewUrl || !canvasRef.current) return;

    setIsUploading(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Load image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = previewUrl;
      });

      // Set canvas to output size
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;

      // Calculate scaled dimensions
      const cropBoxSize = 256; // Crop box visual size
      const scale = OUTPUT_SIZE / cropBoxSize;

      // Clear canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      // Calculate source position considering zoom and pan
      const imgAspect = img.width / img.height;
      let drawWidth: number, drawHeight: number;

      if (imgAspect > 1) {
        drawHeight = cropBoxSize * zoom;
        drawWidth = drawHeight * imgAspect;
      } else {
        drawWidth = cropBoxSize * zoom;
        drawHeight = drawWidth / imgAspect;
      }

      const offsetX = (cropBoxSize - drawWidth) / 2 + position.x;
      const offsetY = (cropBoxSize - drawHeight) / 2 + position.y;

      // Draw image scaled to output size
      ctx.drawImage(
        img,
        offsetX * scale,
        offsetY * scale,
        drawWidth * scale,
        drawHeight * scale
      );

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          },
          'image/jpeg',
          0.9
        );
      });

      // Upload
      await uploadMutation.mutateAsync(blob);
    } catch (error) {
      toast.error('Failed to process image');
      console.error('Crop error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteAvatar = () => {
    if (confirm('Are you sure you want to remove your avatar?')) {
      deleteMutation.mutate();
    }
  };

  return (
    <>
      <div className={`relative group ${className}`}>
        <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-neon-surface-hover border-2 border-neon-border`}>
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Avatar"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Handle broken image by showing initials
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-neon-text-muted">
              {user?.name?.charAt(0).toUpperCase() || '?'}
            </div>
          )}
        </div>

        {/* Hover overlay */}
        <div
          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center"
          onClick={() => setIsModalOpen(true)}
        >
          <Camera className="w-6 h-6 text-white" />
        </div>

        {/* Delete button */}
        {displayUrl && (
          <button
            onClick={handleDeleteAvatar}
            disabled={deleteMutation.isPending}
            className="absolute -top-1 -right-1 p-1 bg-neon-error rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-neon-error/80"
            title="Remove avatar"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-3 h-3 text-white animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3 text-white" />
            )}
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70" onClick={handleCloseModal} />
          <div className="relative bg-neon-surface rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-neon-border">
              <h3 className="text-lg font-medium">Update Avatar</h3>
              <button
                onClick={handleCloseModal}
                className="p-1 hover:bg-neon-surface-hover rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {!previewUrl ? (
                <div className="space-y-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-48 border-2 border-dashed border-neon-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-neon-accent hover:bg-neon-surface-hover transition-colors"
                  >
                    <Camera className="w-8 h-8 text-neon-text-muted" />
                    <p className="text-sm text-neon-text-muted">Click to select an image</p>
                    <p className="text-xs text-neon-text-muted">JPG, PNG, WebP, GIF (max 5MB)</p>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Crop area */}
                  <div
                    className="relative w-64 h-64 mx-auto overflow-hidden rounded-full border-2 border-neon-accent bg-black cursor-move"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <img
                      ref={imageRef}
                      src={previewUrl}
                      alt="Preview"
                      className="absolute max-w-none"
                      style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                        left: '50%',
                        top: '50%',
                        marginLeft: '-50%',
                        marginTop: '-50%',
                      }}
                      draggable={false}
                    />
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => handleZoom(-0.1)}
                      className="p-2 hover:bg-neon-surface-hover rounded"
                      title="Zoom out"
                    >
                      <ZoomOut className="w-5 h-5" />
                    </button>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-32"
                    />
                    <button
                      onClick={() => handleZoom(0.1)}
                      className="p-2 hover:bg-neon-surface-hover rounded"
                      title="Zoom in"
                    >
                      <ZoomIn className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleReset}
                      className="p-2 hover:bg-neon-surface-hover rounded"
                      title="Reset"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-xs text-center text-neon-text-muted">
                    Drag to reposition, use slider to zoom
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-neon-border">
              {previewUrl && (
                <button
                  onClick={() => {
                    setPreviewUrl(null);
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="btn btn-ghost"
                >
                  Choose Different
                </button>
              )}
              <button onClick={handleCloseModal} className="btn btn-ghost">
                Cancel
              </button>
              {previewUrl && (
                <button
                  onClick={cropAndUpload}
                  disabled={isUploading || uploadMutation.isPending}
                  className="btn btn-primary"
                >
                  {isUploading || uploadMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <span>Save Avatar</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}

export default AvatarUpload;
