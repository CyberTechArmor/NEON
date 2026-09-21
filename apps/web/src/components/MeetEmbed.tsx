import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

/**
 * MeetEmbed — NEON's calls and meetings, hosted by MEET.
 *
 * NEON does not run an SFU. A call is a MEET room in an iframe, driven over
 * MEET's postMessage bridge, which is what lets NEON keep its own chrome
 * (header, timer, roster, leave button) while MEET owns the media.
 *
 * Two things the bridge gives us that a hand-rolled LiveKit client did not:
 * MEET reconnects by itself after a drop (backoff to 15s, up to 12 tries) and
 * reports `willRejoin` so NEON doesn't tear the call down over a blip; and
 * every window gets its own participant identity, so the same person on a
 * laptop and a phone is two participants rather than one evicting the other.
 *
 * Security: every inbound message is checked against the MEET origin the
 * server gave us, and every outbound command is posted to that exact origin
 * rather than '*'.
 */

export type MeetLeaveReason = 'left' | 'ended' | 'removed' | 'duplicate' | 'connection-lost';

export interface MeetParticipant {
  identity: string;
  name: string;
}

export interface MeetEmbedHandle {
  leave: () => void;
  end: () => void;
  setMuted: (state: { audio?: boolean; video?: boolean }) => void;
  stopScreenShare: () => void;
  setCompact: (mode: 'auto' | 'on' | 'off') => void;
  togglePip: (open?: boolean) => void;
  requestState: () => void;
}

export interface MeetEmbedProps {
  /** Full join URL from the API (already carries room, embed=1 and the viewer's name). */
  url: string;
  /** MEET's origin, from the API. Used for both postMessage directions. */
  origin: string;
  className?: string;
  title?: string;
  onReady?: () => void;
  onJoined?: (info: { room: string; identity: string; name: string; isHost: boolean; joinedAt: number }) => void;
  /** Fired only for a final departure — a reconnect in progress does not call this. */
  onLeft?: (info: { room: string; reason: MeetLeaveReason }) => void;
  onReconnecting?: () => void;
  onParticipants?: (info: { count: number; participants: MeetParticipant[] }) => void;
  onScreenShare?: (info: { active: boolean; by?: string; local?: boolean }) => void;
  onMedia?: (info: { audio: boolean; video: boolean }) => void;
  onError?: (info: { command?: string; message: string }) => void;
}

export const MeetEmbed = forwardRef<MeetEmbedHandle, MeetEmbedProps>(function MeetEmbed(
  {
    url,
    origin,
    className,
    title = 'Meeting',
    onReady,
    onJoined,
    onLeft,
    onReconnecting,
    onParticipants,
    onScreenShare,
    onMedia,
    onError,
  },
  ref
) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // Callbacks live in a ref so a parent re-render doesn't detach and reattach
  // the message listener mid-call.
  const handlers = useRef({
    onReady,
    onJoined,
    onLeft,
    onReconnecting,
    onParticipants,
    onScreenShare,
    onMedia,
    onError,
  });
  handlers.current = {
    onReady,
    onJoined,
    onLeft,
    onReconnecting,
    onParticipants,
    onScreenShare,
    onMedia,
    onError,
  };

  const send = useCallback(
    (message: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage(message, origin);
    },
    [origin]
  );

  useImperativeHandle(
    ref,
    (): MeetEmbedHandle => ({
      leave: () => send({ type: 'meet:leave' }),
      end: () => send({ type: 'meet:end' }),
      setMuted: (state) => send({ type: 'meet:mute', ...state }),
      stopScreenShare: () => send({ type: 'meet:screenshare', enabled: false }),
      setCompact: (mode) => send({ type: 'meet:compact', mode }),
      togglePip: (open) => send({ type: 'meet:pip', ...(open === undefined ? {} : { open }) }),
      requestState: () => send({ type: 'meet:get-state' }),
    }),
    [send]
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;

      const data = event.data as { source?: string; type?: string; [key: string]: unknown };
      if (data?.source !== 'meet' || typeof data.type !== 'string') return;

      const h = handlers.current;

      switch (data.type) {
        case 'meet:ready':
          setReady(true);
          h.onReady?.();
          break;

        case 'meet:joined':
          h.onJoined?.({
            room: data.room as string,
            identity: data.identity as string,
            name: data.name as string,
            isHost: Boolean(data.isHost),
            joinedAt: (data.joinedAt as number) ?? Date.now(),
          });
          break;

        case 'meet:reconnecting':
          h.onReconnecting?.();
          break;

        case 'meet:left':
          // MEET recovers from an unchosen drop on its own; only a departure
          // it isn't going to undo should close NEON's call.
          if (!data.willRejoin) {
            h.onLeft?.({
              room: data.room as string,
              reason: (data.reason as MeetLeaveReason) ?? 'left',
            });
          }
          break;

        case 'meet:participants':
          h.onParticipants?.({
            count: (data.count as number) ?? 0,
            participants: (data.participants as MeetParticipant[]) ?? [],
          });
          break;

        case 'meet:screenshare':
          h.onScreenShare?.({
            active: Boolean(data.active),
            by: data.by as string | undefined,
            local: Boolean(data.local),
          });
          break;

        case 'meet:media':
          h.onMedia?.({ audio: Boolean(data.audio), video: Boolean(data.video) });
          break;

        case 'meet:error':
          h.onError?.({
            command: data.command as string | undefined,
            message: (data.message as string) ?? 'MEET reported an error',
          });
          break;

        default:
          break;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]);

  return (
    <div className={className ?? 'relative h-full w-full'}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-neon-bg">
          <p className="text-neon-text-secondary text-sm">Connecting to the room…</p>
        </div>
      )}
      <iframe
        ref={frameRef}
        src={url}
        title={title}
        className="h-full w-full border-0"
        // Media and display capture must be delegated explicitly, or the
        // camera, microphone and screen share are blocked inside the frame.
        allow="camera; microphone; display-capture; autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
});

export default MeetEmbed;
