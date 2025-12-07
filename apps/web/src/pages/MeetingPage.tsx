import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  ParticipantTile,
  useParticipants,
  useLocalParticipant,
  useRoomContext,
  Chat,
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
  Hand,
  Circle,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { meetingsApi, getErrorMessage } from '../lib/api';
import '@livekit/components-styles';

// Meeting type
interface Meeting {
  id: string;
  title: string;
  scheduledStart?: string;
  isRecording?: boolean;
}

// Participant list panel
function ParticipantList({ onClose }: { onClose: () => void }) {
  const participants = useParticipants();

  return (
    <div className="w-80 bg-neon-surface border-l border-neon-border flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-neon-border">
        <h3 className="font-medium">Participants ({participants.length})</h3>
        <button className="btn btn-icon btn-ghost" onClick={onClose}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {participants.map((participant) => (
          <div
            key={participant.identity}
            className="flex items-center gap-3 p-2 rounded hover:bg-neon-surface-hover"
          >
            <div className="avatar avatar-sm">
              <span>{participant.name?.charAt(0).toUpperCase() || 'U'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {participant.name || participant.identity}
                {participant.isLocal && ' (You)'}
              </p>
            </div>
            <div className="flex items-center gap-1 text-neon-text-muted">
              {participant.isMicrophoneEnabled ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
              {participant.isCameraEnabled ? (
                <Video className="w-4 h-4" />
              ) : (
                <VideoOff className="w-4 h-4" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Meeting video grid
function MeetingVideoGrid() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const participants = useParticipants();

  // Find screen share track
  const screenShareTrack = tracks.find((t) => t.source === Track.Source.ScreenShare);
  const videoTracks = tracks.filter((t) => t.source === Track.Source.Camera);

  if (screenShareTrack) {
    // Screen share focused layout
    return (
      <div className="flex h-full gap-4 p-4">
        {/* Main screen share */}
        <div className="flex-1">
          <ParticipantTile
            trackRef={screenShareTrack}
            className="rounded-xl overflow-hidden bg-neon-surface h-full"
          />
        </div>

        {/* Sidebar with participants */}
        <div className="w-48 flex flex-col gap-2 overflow-y-auto">
          {videoTracks.map((track) => (
            <ParticipantTile
              key={track.participant.identity}
              trackRef={track}
              className="rounded-lg overflow-hidden bg-neon-surface aspect-video"
            />
          ))}
        </div>
      </div>
    );
  }

  if (videoTracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neon-text-muted">
        <div className="text-center">
          <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Waiting for participants to enable video...</p>
        </div>
      </div>
    );
  }

  // Grid layout
  const gridCols =
    videoTracks.length === 1
      ? 'grid-cols-1'
      : videoTracks.length === 2
      ? 'grid-cols-2'
      : videoTracks.length <= 4
      ? 'grid-cols-2'
      : videoTracks.length <= 9
      ? 'grid-cols-3'
      : 'grid-cols-4';

  return (
    <div className={`grid ${gridCols} gap-4 h-full p-4 auto-rows-fr`}>
      {videoTracks.map((track) => (
        <ParticipantTile
          key={track.participant.identity + track.source}
          trackRef={track}
          className="rounded-xl overflow-hidden bg-neon-surface"
        />
      ))}
    </div>
  );
}

// Meeting controls
function MeetingControls({
  onLeave,
  onToggleParticipants,
  onToggleChat,
  showParticipants,
  showChat,
  isRecording,
}: {
  onLeave: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  showParticipants: boolean;
  showChat: boolean;
  isRecording: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

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

  const toggleHand = useCallback(() => {
    setHandRaised(!handRaised);
    // In a real implementation, this would send a data message to all participants
  }, [handRaised]);

  return (
    <div className="h-20 bg-neon-surface border-t border-neon-border px-6 flex items-center justify-between">
      {/* Left: Meeting info */}
      <div className="flex items-center gap-4">
        {isRecording && (
          <div className="flex items-center gap-2 text-neon-error">
            <Circle className="w-3 h-3 fill-current animate-pulse" />
            <span className="text-sm font-medium">Recording</span>
          </div>
        )}
      </div>

      {/* Center: Main controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMute}
          className={`call-control ${isMuted ? 'bg-neon-error text-white' : 'call-control-default'}`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`call-control ${isVideoOff ? 'bg-neon-error text-white' : 'call-control-default'}`}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`call-control ${isScreenSharing ? 'call-control-active' : 'call-control-default'}`}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          {isScreenSharing ? (
            <ScreenShareOff className="w-5 h-5" />
          ) : (
            <ScreenShare className="w-5 h-5" />
          )}
        </button>

        <button
          onClick={toggleHand}
          className={`call-control ${handRaised ? 'call-control-active' : 'call-control-default'}`}
          title={handRaised ? 'Lower hand' : 'Raise hand'}
        >
          <Hand className="w-5 h-5" />
        </button>

        <div className="w-px h-8 bg-neon-border mx-2" />

        <button
          onClick={onLeave}
          className="call-control call-control-danger"
          title="Leave meeting"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>

      {/* Right: Side panel toggles */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleParticipants}
          className={`btn btn-icon ${showParticipants ? 'btn-secondary' : 'btn-ghost'}`}
          title="Participants"
        >
          <Users className="w-5 h-5" />
        </button>

        <button
          onClick={onToggleChat}
          className={`btn btn-icon ${showChat ? 'btn-secondary' : 'btn-ghost'}`}
          title="Chat"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// Pre-join screen
function PreJoinScreen({
  meeting,
  onJoin,
  isJoining,
}: {
  meeting: any;
  onJoin: () => void;
  isJoining: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-neon-bg flex items-center justify-center p-6">
      <div className="card p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">{meeting.title}</h1>
        <p className="text-neon-text-secondary mb-6">
          {new Date(meeting.scheduledStart).toLocaleString()}
        </p>

        {/* Video preview would go here */}
        <div className="aspect-video bg-neon-surface-hover rounded-lg mb-6 flex items-center justify-center">
          <Video className="w-12 h-12 text-neon-text-muted" />
        </div>

        {/* Join button */}
        <button
          onClick={onJoin}
          disabled={isJoining}
          className="btn btn-primary w-full mb-4"
        >
          {isJoining ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Joining...</span>
            </>
          ) : (
            <span>Join Meeting</span>
          )}
        </button>

        {/* Copy link */}
        <button
          onClick={copyLink}
          className="btn btn-ghost w-full"
        >
          {copied ? (
            <>
              <Check className="w-5 h-5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              <span>Copy meeting link</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Main meeting page
export default function MeetingPage() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const [hasJoined, setHasJoined] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);

  // Fetch meeting details
  const { data: meeting, isLoading: isLoadingMeeting } = useQuery<Meeting>({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      if (!meetingId) throw new Error('No meeting ID');
      const response = await meetingsApi.get(meetingId);
      return response.data.data as Meeting;
    },
    enabled: !!meetingId,
  });

  // Join meeting mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!meetingId) throw new Error('No meeting ID');
      const response = await meetingsApi.join(meetingId);
      return response.data.data;
    },
    onSuccess: () => {
      setHasJoined(true);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Leave meeting
  const handleLeave = useCallback(async () => {
    if (meetingId) {
      try {
        await meetingsApi.leave(meetingId);
      } catch {
        // Ignore errors when leaving
      }
    }
    navigate('/');
  }, [meetingId, navigate]);

  if (isLoadingMeeting) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-neon-error mb-4">Meeting not found</p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Go home
          </button>
        </div>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <PreJoinScreen
        meeting={meeting}
        onJoin={() => joinMutation.mutate()}
        isJoining={joinMutation.isPending}
      />
    );
  }

  return (
    <div className="h-screen bg-neon-bg flex flex-col">
      {/* Meeting header */}
      <div className="h-14 bg-neon-surface border-b border-neon-border px-4 flex items-center justify-between">
        <h1 className="font-medium truncate">{meeting.title}</h1>
        <div className="text-sm text-neon-text-muted">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <LiveKitRoom
          serverUrl={import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880'}
          token={joinMutation.data?.token}
          connectOptions={{ autoSubscribe: true }}
          className="flex-1 flex flex-col"
        >
          <div className="flex-1 overflow-hidden">
            <MeetingVideoGrid />
          </div>
          <RoomAudioRenderer />
          <MeetingControls
            onLeave={handleLeave}
            onToggleParticipants={() => setShowParticipants(!showParticipants)}
            onToggleChat={() => setShowChat(!showChat)}
            showParticipants={showParticipants}
            showChat={showChat}
            isRecording={meeting.isRecording}
          />

          {/* Side panels */}
          {showParticipants && (
            <ParticipantList onClose={() => setShowParticipants(false)} />
          )}

          {showChat && (
            <div className="w-80 bg-neon-surface border-l border-neon-border">
              <Chat className="h-full" />
            </div>
          )}
        </LiveKitRoom>
      </div>
    </div>
  );
}
