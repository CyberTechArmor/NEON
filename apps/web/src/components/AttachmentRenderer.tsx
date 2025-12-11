import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  FileText,
  File,
  Music,
  Video,
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { filesApi } from '../lib/api';

// Type definitions
interface MessageFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

interface AttachmentRendererProps {
  files: MessageFile[];
  className?: string;
  maxPreviewWidth?: number;
}

// Helper to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper to get file icon based on MIME type
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.includes('pdf')) return FileText;
  if (mimeType.includes('document') || mimeType.includes('word')) return FileText;
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return FileText;
  return File;
}

// Helper to check if file is an image
function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

// Helper to check if file is audio
function isAudio(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

// Helper to check if file is video
function isVideo(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

// Helper to check if file is viewable document (PDF)
function isViewableDocument(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

// Image Lightbox Component
interface LightboxProps {
  images: MessageFile[];
  initialIndex: number;
  onClose: () => void;
}

function ImageLightbox({ images, initialIndex, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const currentImage = images[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
          break;
        case 'ArrowRight':
          if (currentIndex < images.length - 1) setCurrentIndex(currentIndex + 1);
          break;
        case '+':
        case '=':
          setZoom((z) => Math.min(3, z + 0.25));
          break;
        case '-':
          setZoom((z) => Math.max(0.5, z - 0.25));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length, onClose]);

  useEffect(() => {
    // Reset state when image changes
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
    setError(false);
  }, [currentIndex]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = () => setIsDragging(false);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentImage.url;
    link.download = currentImage.name;
    link.target = '_blank';
    link.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/70">
            {currentIndex + 1} / {images.length}
          </span>
          <span className="truncate max-w-[200px]">{currentImage.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-2 hover:bg-white/10 rounded"
            title="Zoom out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="p-2 hover:bg-white/10 rounded"
            title="Zoom in"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}
            className="p-2 hover:bg-white/10 rounded"
            title="Reset"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 hover:bg-white/10 rounded"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {isLoading && (
          <div className="absolute">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        )}
        {error ? (
          <div className="flex flex-col items-center gap-2 text-white/70">
            <AlertCircle className="w-12 h-12" />
            <p>Failed to load image</p>
            <button
              onClick={() => { setError(false); setIsLoading(true); }}
              className="btn btn-secondary btn-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <img
            src={currentImage.url}
            alt={currentImage.name}
            className={`max-h-full max-w-full object-contain transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            }}
            draggable={false}
            onLoad={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setError(true); }}
          />
        )}
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={() => currentIndex > 0 && setCurrentIndex(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <button
            onClick={() => currentIndex < images.length - 1 && setCurrentIndex(currentIndex + 1)}
            disabled={currentIndex === images.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </>
      )}

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-2 p-4 overflow-x-auto">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setCurrentIndex(idx)}
              className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 ${
                idx === currentIndex ? 'border-white' : 'border-transparent opacity-50'
              }`}
            >
              <img
                src={img.thumbnailUrl || img.url}
                alt={img.name}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Audio Player Component
interface AudioPlayerProps {
  file: MessageFile;
}

function AudioPlayer({ file }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handleCanPlay = () => setIsLoading(false);
    const handleError = () => { setIsLoading(false); setError(true); };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.target = '_blank';
    link.click();
  };

  if (error) {
    return (
      <div className="flex items-center gap-3 p-3 bg-neon-surface-hover rounded-lg">
        <AlertCircle className="w-5 h-5 text-neon-error" />
        <span className="text-sm">Failed to load audio</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-neon-surface-hover rounded-lg min-w-[280px]">
      <audio ref={audioRef} src={file.url} preload="metadata" />

      <button
        onClick={togglePlay}
        disabled={isLoading}
        className="p-2 bg-neon-accent rounded-full hover:bg-neon-accent/80 disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 bg-neon-surface rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-neon-text-muted">
          <span>{formatTime(currentTime)}</span>
          <span className="truncate mx-2 max-w-[150px]">{file.name}</span>
          <span>{duration ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>

      <button onClick={toggleMute} className="p-1 hover:bg-neon-surface rounded">
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

      <button onClick={handleDownload} className="p-1 hover:bg-neon-surface rounded" title="Download">
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
}

// Video Player Component
interface VideoPlayerProps {
  file: MessageFile;
}

function VideoPlayer({ file }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.target = '_blank';
    link.click();
  };

  if (error) {
    return (
      <div className="flex items-center gap-3 p-3 bg-neon-surface-hover rounded-lg">
        <AlertCircle className="w-5 h-5 text-neon-error" />
        <span className="text-sm">Failed to load video</span>
        <button onClick={handleDownload} className="btn btn-secondary btn-sm ml-auto">
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden bg-black max-w-[400px]">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neon-surface-hover">
          <Loader2 className="w-8 h-8 animate-spin text-neon-text-muted" />
        </div>
      )}
      <video
        ref={videoRef}
        src={file.url}
        controls
        preload="metadata"
        className="w-full"
        onCanPlay={() => setIsLoading(false)}
        onError={() => { setIsLoading(false); setError(true); }}
      />
      <div className="absolute bottom-2 right-2">
        <button
          onClick={handleDownload}
          className="p-1.5 bg-black/50 hover:bg-black/70 rounded text-white"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Document Card Component
interface DocumentCardProps {
  file: MessageFile;
}

function DocumentCard({ file }: DocumentCardProps) {
  const Icon = getFileIcon(file.mimeType);
  const isPdf = file.mimeType === 'application/pdf';

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.target = '_blank';
    link.click();
  };

  const handleOpen = () => {
    window.open(file.url, '_blank');
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-neon-surface-hover rounded-lg min-w-[240px] max-w-[320px]">
      <div className="p-2 bg-neon-surface rounded-lg">
        <Icon className="w-6 h-6 text-neon-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-neon-text-muted">{formatFileSize(file.size)}</p>
      </div>
      <div className="flex items-center gap-1">
        {isPdf && (
          <button
            onClick={handleOpen}
            className="p-1.5 hover:bg-neon-surface rounded"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={handleDownload}
          className="p-1.5 hover:bg-neon-surface rounded"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Image Preview Component
interface ImagePreviewProps {
  file: MessageFile;
  onClick: () => void;
}

function ImagePreview({ file, onClick }: ImagePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className="flex items-center justify-center gap-2 p-4 bg-neon-surface-hover rounded-lg cursor-pointer hover:bg-neon-surface"
        onClick={onClick}
      >
        <AlertCircle className="w-5 h-5 text-neon-error" />
        <span className="text-sm">Failed to load image</span>
      </div>
    );
  }

  return (
    <div
      className="relative cursor-pointer group rounded-lg overflow-hidden"
      onClick={onClick}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neon-surface-hover">
          <Loader2 className="w-6 h-6 animate-spin text-neon-text-muted" />
        </div>
      )}
      <img
        src={file.thumbnailUrl || file.url}
        alt={file.name}
        className={`max-w-[300px] max-h-[200px] object-cover rounded-lg transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => { setIsLoading(false); setError(true); }}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

// Main AttachmentRenderer Component
export function AttachmentRenderer({ files, className = '', maxPreviewWidth = 400 }: AttachmentRendererProps) {
  const [lightboxImages, setLightboxImages] = useState<MessageFile[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!files || files.length === 0) return null;

  const images = files.filter((f) => isImage(f.mimeType));
  const audioFiles = files.filter((f) => isAudio(f.mimeType));
  const videoFiles = files.filter((f) => isVideo(f.mimeType));
  const documents = files.filter((f) => !isImage(f.mimeType) && !isAudio(f.mimeType) && !isVideo(f.mimeType));

  const handleImageClick = (index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Images grid */}
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {images.map((file, idx) => (
            <ImagePreview
              key={file.id}
              file={file}
              onClick={() => handleImageClick(idx)}
            />
          ))}
        </div>
      )}

      {/* Video players */}
      {videoFiles.map((file) => (
        <VideoPlayer key={file.id} file={file} />
      ))}

      {/* Audio players */}
      {audioFiles.map((file) => (
        <AudioPlayer key={file.id} file={file} />
      ))}

      {/* Document cards */}
      {documents.map((file) => (
        <DocumentCard key={file.id} file={file} />
      ))}

      {/* Lightbox */}
      {lightboxImages && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxImages(null)}
        />
      )}
    </div>
  );
}

export default AttachmentRenderer;
