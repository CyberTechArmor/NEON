import { useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2,
  PhoneOff,
  Video,
  Users,
  Copy,
  Check,
  X,
  PictureInPicture2,
} from 'lucide-react';
import { meetingsApi, getErrorMessage } from '../lib/api';
import {
  MeetEmbed,
  MeetEmbedHandle,
  MeetLeaveReason,
  MeetParticipant,
} from '../components/MeetEmbed';

/**
 * A meeting is a MEET room. NEON owns the surrounding page — title, roster,
 * leave — and MEET owns the media and its own in-frame controls.
 *
 * The roster here is fed by MEET's `meet:participants` bridge event rather
 * than by NEON's own database, so it reflects who is actually in the room
 * right now, including people who joined from a plain MEET link.
 */

interface Meeting {
  id: string;
  title: string;
  scheduledStart?: string;
  isRecording?: boolean;
}

interface MeetSession {
  url: string;
  room: string;
  origin: string;
}

function ParticipantList({
  participants,
  onClose,
}: {
  participants: MeetParticipant[];
  onClose: () => void;
}) {
  return (
    <div className="w-full sm:w-80 shrink-0 bg-neon-surface border-t sm:border-t-0 sm:border-l border-neon-border flex flex-col">
      <div className="h-12 px-4 flex items-center justify-between border-b border-neon-border">
        <h2 className="text-sm font-medium">In this meeting ({participants.length})</h2>
        <button
          onClick={onClose}
          className="p-2 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-neon-text-muted hover:text-neon-text"
          aria-label="Close participant list"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto p-2">
        {participants.length === 0 && (
          <li className="px-2 py-3 text-sm text-neon-text-muted">Nobody has joined yet.</li>
        )}
        {participants.map((participant) => (
          <li
            key={participant.identity}
            className="px-2 py-2 text-sm text-neon-text-secondary truncate"
          >
            {participant.name || participant.identity}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreJoinScreen({
  meeting,
  onJoin,
  isJoining,
}: {
  meeting: Meeting;
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
    <div className="min-h-screen bg-neon-bg flex items-center justify-center p-4 sm:p-6">
      <div className="card p-6 sm:p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">{meeting.title}</h1>
        {meeting.scheduledStart && (
          <p className="text-neon-text-secondary mb-6">
            {new Date(meeting.scheduledStart).toLocaleString()}
          </p>
        )}

        <div className="aspect-video bg-neon-surface-hover rounded-lg mb-6 flex items-center justify-center">
          <Video className="w-12 h-12 text-neon-text-muted" />
        </div>

        <button
          onClick={onJoin}
          disabled={isJoining}
          className="btn btn-primary w-full mb-4 min-h-[44px]"
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

        <button onClick={copyLink} className="btn btn-ghost w-full min-h-[44px]">
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

export default function MeetingPage() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const meetRef = useRef<MeetEmbedHandle>(null);

  const [session, setSession] = useState<MeetSession | null>(null);
  const [participants, setParticipants] = useState<MeetParticipant[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const leaving = useRef(false);

  const { data: meeting, isLoading: isLoadingMeeting } = useQuery<Meeting>({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      if (!meetingId) throw new Error('No meeting ID');
      const response = await meetingsApi.get(meetingId);
      return response.data.data as Meeting;
    },
    enabled: !!meetingId,
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!meetingId) throw new Error('No meeting ID');
      const response = await meetingsApi.join(meetingId);
      return response.data.data as { meet: MeetSession };
    },
    onSuccess: (data) => {
      if (!data?.meet) {
        toast.error('The server did not return a room to join');
        return;
      }
      setSession(data.meet);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const finishLeaving = useCallback(
    async (reason: MeetLeaveReason) => {
      if (leaving.current) return;
      leaving.current = true;

      // 'duplicate' means another of your own windows took the room; you are
      // still in the meeting, just not here.
      if (meetingId && reason !== 'duplicate') {
        try {
          await meetingsApi.leave(meetingId);
        } catch {
          // Leaving locally is what matters to the person clicking the button.
        }
      }
      navigate('/');
    },
    [meetingId, navigate]
  );

  const handleLeft = useCallback(
    ({ reason }: { room: string; reason: MeetLeaveReason }) => {
      if (reason === 'ended') toast('The host ended this meeting');
      if (reason === 'removed') toast('You were removed from this meeting');
      if (reason === 'connection-lost') toast.error('Lost connection to the meeting');

      void finishLeaving(reason);
    },
    [finishLeaving]
  );

  if (isLoadingMeeting) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-neon-error mb-4">Meeting not found</p>
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Go home
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
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
      <div className="h-14 shrink-0 bg-neon-surface border-b border-neon-border px-3 sm:px-4 flex items-center justify-between gap-2">
        <h1 className="font-medium truncate min-w-0">{meeting.title}</h1>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {reconnecting && (
            <span className="text-xs text-neon-text-muted hidden sm:inline">Reconnecting…</span>
          )}

          <button
            onClick={() => meetRef.current?.togglePip()}
            className="p-2 min-w-[44px] min-h-[44px] hidden sm:flex items-center justify-center text-neon-text-muted hover:text-neon-text"
            title="Picture in picture"
            aria-label="Picture in picture"
          >
            <PictureInPicture2 className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowParticipants((open) => !open)}
            className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center ${
              showParticipants ? 'text-neon-text' : 'text-neon-text-muted hover:text-neon-text'
            }`}
            title="Participants"
            aria-label={`Participants (${participants.length})`}
          >
            <Users className="w-5 h-5" />
          </button>

          <button
            onClick={() => meetRef.current?.leave()}
            className="call-control call-control-danger min-w-[44px] min-h-[44px]"
            title="Leave meeting"
            aria-label="Leave meeting"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <MeetEmbed
            ref={meetRef}
            url={session.url}
            origin={session.origin}
            title={meeting.title}
            onJoined={() => setReconnecting(false)}
            onReconnecting={() => setReconnecting(true)}
            onParticipants={({ participants: list }) => setParticipants(list)}
            onLeft={handleLeft}
            onError={({ message }) => toast.error(message)}
          />
        </div>

        {showParticipants && (
          <ParticipantList
            participants={participants}
            onClose={() => setShowParticipants(false)}
          />
        )}
      </div>
    </div>
  );
}
