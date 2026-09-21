import { useRef, type CSSProperties } from 'react';
import { MeetEmbed, MeetEmbedHandle } from '../MeetEmbed';
import { useMeetStore } from '../../stores/meet';

/**
 * The one MEET iframe for a chat call.
 *
 * Rendered by MeetProvider for as long as a call is active, whatever view
 * mode it is in and whatever page is showing. It is a fixed-position layer
 * that follows the slot the current call chrome registered (useMeetSlot);
 * with no slot it shrinks to a hidden 1×1 box on screen — still mounted, so
 * audio, camera and screen share carry on while the call is minimized or the
 * user is on another page.
 *
 * Why this exists: the previous chrome rendered a separate <iframe> per view
 * mode, so every minimize / PiP / fullscreen toggle unmounted one iframe and
 * mounted another, MEET reloaded, and the participant dropped out of the
 * room (and out of their screen share).
 */
export function MeetFrame() {
  const activeCall = useMeetStore((state) => state.activeCall);
  const slot = useMeetStore((state) => state.slot);
  const endCall = useMeetStore((state) => state.endCall);
  const ref = useRef<MeetEmbedHandle>(null);

  if (!activeCall) return null;

  const origin = new URL(activeCall.baseUrl).origin;

  const style: CSSProperties = slot
    ? {
        top: slot.top,
        left: slot.left,
        width: slot.width,
        height: slot.height,
      }
    : {
        // Hidden but alive. Kept inside the viewport and merely transparent:
        // browsers throttle what they consider off-screen or invisible, and
        // a live call should not be either.
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
      };

  return (
    <div
      className={`fixed overflow-hidden bg-neon-bg ${activeCall.viewMode === 'embedded' ? 'z-30' : 'z-[90]'}`}
      style={style}
      data-meet-frame
    >
      <MeetEmbed
        ref={ref}
        url={activeCall.joinUrl}
        origin={origin}
        title={activeCall.displayName}
        onLeft={({ reason }) => {
          // A final departure MEET will not undo — the host ended it, we were
          // removed, or this window lost to a duplicate — closes NEON's call
          // too, so the chrome does not outlive the room.
          if (reason === 'ended' || reason === 'removed' || reason === 'duplicate') {
            endCall();
          }
        }}
      />
    </div>
  );
}

export default MeetFrame;
