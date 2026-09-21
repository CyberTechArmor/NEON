import { useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, PhoneOff, Users } from 'lucide-react';
import { callsApi, getErrorMessage } from '../lib/api';
import { MeetEmbed, MeetEmbedHandle, MeetLeaveReason } from '../components/MeetEmbed';

/**
 * A call is a MEET room. NEON keeps the frame around it — who's in, how long
 * it's been running, and the button that hangs up — while MEET owns the media
 * and its own mic/camera/share controls inside the iframe.
 */
export default function CallPage() {
  const { callId } = useParams();
  const navigate = useNavigate();
  const meetRef = useRef<MeetEmbedHandle>(null);

  const [participantCount, setParticipantCount] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  // Guards the close path: MEET can report a departure while NEON is already
  // tearing down, and ending a call twice is a wasted round trip at best.
  const closing = useRef(false);

  const { data: callData, isLoading, error } = useQuery({
    queryKey: ['call', callId],
    queryFn: async () => {
      if (!callId) throw new Error('No call ID');
      const response = await callsApi.join(callId);
      return response.data.data;
    },
    enabled: !!callId,
    retry: false,
    // The join response carries a room code, not a short-lived token, so it
    // does not need refetching while the call is up.
    staleTime: Infinity,
  });

  const closeCall = useCallback(
    async (endForEveryone: boolean) => {
      if (closing.current) return;
      closing.current = true;

      if (endForEveryone && callId) {
        try {
          await callsApi.end(callId);
        } catch {
          // The call is over for this participant either way.
        }
      }
      navigate(-1);
    },
    [callId, navigate]
  );

  // NEON's hang-up button: ask MEET to leave, and let the bridge's `meet:left`
  // drive the teardown, so the two paths can't disagree about what happened.
  const handleLeaveClick = useCallback(() => {
    meetRef.current?.leave();
  }, []);

  const handleLeft = useCallback(
    ({ reason }: { room: string; reason: MeetLeaveReason }) => {
      if (reason === 'ended') toast('Call ended');
      if (reason === 'removed') toast('You were removed from the call');
      if (reason === 'connection-lost') toast.error('Lost connection to the call');
      if (reason === 'duplicate') toast('You joined this call from another window');

      // 'duplicate' means this window lost the room to another one of yours —
      // the call itself is still going, so don't end it for everyone.
      void closeCall(reason !== 'duplicate');
    },
    [closeCall]
  );

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

  if (error || !callData?.meet) {
    return (
      <div className="min-h-screen bg-neon-bg flex items-center justify-center p-4">
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
    <div className="h-full bg-neon-bg flex flex-col">
      <div className="h-14 shrink-0 bg-neon-surface border-b border-neon-border px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-neon-text-muted shrink-0" />
          <span className="text-sm text-neon-text-secondary truncate">
            {participantCount === 1
              ? 'Waiting for others to join'
              : `${participantCount} in this call`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {reconnecting && (
            <span className="text-xs text-neon-text-muted hidden sm:inline">Reconnecting…</span>
          )}
          <button
            onClick={handleLeaveClick}
            className="call-control call-control-danger min-w-[44px] min-h-[44px]"
            title="Leave call"
            aria-label="Leave call"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <MeetEmbed
          ref={meetRef}
          url={callData.meet.url}
          origin={callData.meet.origin}
          title="Call"
          onJoined={() => setReconnecting(false)}
          onReconnecting={() => setReconnecting(true)}
          onParticipants={({ count }) => setParticipantCount(count)}
          onLeft={handleLeft}
          onError={({ message }) => toast.error(message)}
        />
      </div>
    </div>
  );
}
