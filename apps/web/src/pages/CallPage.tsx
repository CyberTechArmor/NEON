import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
  ParticipantTile,
  useParticipants,
  useLocalParticipant,
} from '@livekit/components-react';
import { Track, Room, RoomEvent } from 'livekit-client';
import toast from 'react-hot-toast';
import {
  Loader2,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  Users,
  MessageSquare,
  Settings,
} from 'lucide-react';
import { callsApi, getErrorMessage } from '../lib/api';
import '@livekit/components-styles';

// Custom video grid component
function VideoGrid() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const participants = useParticipants();

  if (tracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neon-text-muted">
        <p>Waiting for participants to enable video...</p>
      </div>
    );
  }

  const gridCols =
    tracks.length === 1
      ? 'grid-cols-1'
      : tracks.length === 2
      ? 'grid-cols-2'
      : tracks.length <= 4
      ? 'grid-cols-2'
      : tracks.length <= 6
      ? 'grid-cols-3'
      : 'grid-cols-4';

  return (
    <div className={`grid ${gridCols} gap-4 h-full p-4`}>
      {tracks.map((track) => (
        <ParticipantTile
          key={track.participant.identity + track.source}
          trackRef={track}
          className="rounded-xl overflow-hidden bg-neon-surface"
        />
      ))}
    </div>
  );
}

// Custom control bar
function CallControls({
  onLeave,
}: {
  onLeave: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const toggleMute = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setMicrophoneEnabled(isMuted);
      setIsMuted(!isMuted);
    }
  }, [localParticipant, isMuted]);

  const toggleVideo = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setCameraEnabled(isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  }, [localParticipant, isVideoOff]);

  const toggleScreenShare = useCallback(async () => {
    if (localParticipant) {
      await localParticipant.setScreenShareEnabled(!isScreenSharing);
      setIsScreenSharing(!isScreenSharing);
    }
  }, [localParticipant, isScreenSharing]);

  return (
    <div className="absolute bottom-0 left-0 right-0 p-6">
      <div className="flex items-center justify-center gap-4">
        {/* Mute */}
        <button
          onClick={toggleMute}
          className={`call-control ${isMuted ? 'call-control-active' : 'call-control-default'}`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* Video */}
        <button
          onClick={toggleVideo}
          className={`call-control ${isVideoOff ? 'call-control-active' : 'call-control-default'}`}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
        </button>

        {/* Screen share */}
        <button
          onClick={toggleScreenShare}
          className={`call-control ${isScreenSharing ? 'call-control-active' : 'call-control-default'}`}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          {isScreenSharing ? (
            <ScreenShareOff className="w-6 h-6" />
          ) : (
            <ScreenShare className="w-6 h-6" />
          )}
        </button>

        {/* End call */}
        <button
          onClick={onLeave}
          className="call-control call-control-danger"
          title="Leave call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

// Main call page
export default function CallPage() {
  const { callId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);

  // Fetch call token
  const { data: callData, isLoading, error } = useQuery({
    queryKey: ['call', callId],
    queryFn: async () => {
      if (!callId) throw new Error('No call ID');
      const response = await callsApi.join(callId);
      return response.data.data;
    },
    enabled: !!callId,
    retry: false,
  });

  // Handle leaving the call
  const handleLeave = useCallback(async () => {
    if (room) {
      room.disconnect();
    }
    if (callId) {
      try {
        await callsApi.end(callId);
      } catch {
        // Ignore errors when leaving
      }
    }
    navigate(-1);
  }, [room, callId, navigate]);

  // Handle room connection
  const handleRoomConnected = useCallback((connectedRoom: Room) => {
    setRoom(connectedRoom);

    connectedRoom.on(RoomEvent.Disconnected, () => {
      toast('Call ended');
      navigate(-1);
    });
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-neon-text-secondary">Joining call...</p>
        </div>
      </div>
    );
  }

  if (error || !callData) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-neon-error mb-4">
            {error ? getErrorMessage(error) : 'Failed to join call'}
          </p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-neon-bg relative">
      <LiveKitRoom
        serverUrl={import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880'}
        token={callData.token}
        connectOptions={{ autoSubscribe: true }}
        onConnected={() => handleRoomConnected}
        onDisconnected={() => navigate(-1)}
        className="h-full"
      >
        <VideoGrid />
        <RoomAudioRenderer />
        <CallControls onLeave={handleLeave} />
      </LiveKitRoom>
    </div>
  );
}
