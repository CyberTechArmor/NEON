/**
 * Audio Attachment Component
 *
 * Renders audio attachments with a custom audio player.
 */

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2, Music } from 'lucide-react';
import { Attachment, formatFileSize } from './types';

interface AudioAttachmentProps {
  attachment: Attachment;
}

export function AudioAttachment({ attachment }: AudioAttachmentProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setHasError(true);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (hasError) {
    return (
      <div className="flex items-center gap-3 p-3 bg-neon-surface rounded-lg border border-neon-border max-w-xs">
        <div className="w-10 h-10 bg-neon-accent/20 rounded-lg flex items-center justify-center">
          <Music className="w-5 h-5 text-neon-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.filename}</p>
          <p className="text-xs text-neon-text-muted">Failed to load audio</p>
        </div>
        <button
          onClick={handleDownload}
          className="p-1.5 hover:bg-neon-surface-hover rounded text-neon-text-muted hover:text-white transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-neon-surface rounded-lg border border-neon-border max-w-sm">
      <audio ref={audioRef} src={attachment.url} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className="w-10 h-10 bg-neon-accent rounded-full flex items-center justify-center hover:bg-neon-accent/80 transition-colors flex-shrink-0"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-white" />
        ) : (
          <Play className="w-5 h-5 text-white ml-0.5" />
        )}
      </button>

      {/* Waveform / progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Volume2 className="w-3 h-3 text-neon-text-muted" />
          <p className="text-sm font-medium truncate flex-1">{attachment.filename}</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 bg-neon-border rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-neon-accent [&::-webkit-slider-thumb]:rounded-full"
          />
          <span className="text-xs text-neon-text-muted whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <p className="text-xs text-neon-text-muted mt-1">{formatFileSize(attachment.size)}</p>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        className="p-1.5 hover:bg-neon-surface-hover rounded text-neon-text-muted hover:text-white transition-colors flex-shrink-0"
        title="Download"
      >
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
}

export default AudioAttachment;
