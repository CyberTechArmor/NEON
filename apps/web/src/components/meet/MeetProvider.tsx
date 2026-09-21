import { useEffect, ReactNode } from 'react';
import { useMeetStore, INCOMING_CALL_TIMEOUT_MS } from '../../stores/meet';
import { MeetCall, MobileMeetPip } from './MeetCall';
import { MeetFrame } from './MeetFrame';
import { IncomingCallToast } from './IncomingCallToast';
import { useAuthStore } from '../../stores/auth';

interface MeetProviderProps {
  children: ReactNode;
}

/**
 * MeetProvider wraps the application and renders the persistent video call UI.
 *
 * Two layers, for the whole life of a call:
 *  - MeetFrame — the single MEET iframe, mounted here so it survives view-mode
 *    changes and page navigation. It draws itself over whichever chrome slot
 *    is on screen.
 *  - the chrome — PiP / minimized / fullscreen here; the embedded pane lives
 *    in ChatPage. When the call is "embedded" but ChatPage is not showing it
 *    (the user went to another page), the minimized bar stands in so the
 *    call is never both invisible and unreachable.
 */
export function MeetProvider({ children }: MeetProviderProps) {
  const { activeCall, embeddedMounted, incomingCall, dismissIncomingCall, fetchConfig, clearConfig } =
    useMeetStore();
  const { isAuthenticated } = useAuthStore();

  // A ring that nobody answers stops on its own.
  useEffect(() => {
    if (!incomingCall) return;
    const remaining = Math.max(0, incomingCall.receivedAt + INCOMING_CALL_TIMEOUT_MS - Date.now());
    const timer = setTimeout(dismissIncomingCall, remaining);
    return () => clearTimeout(timer);
  }, [incomingCall, dismissIncomingCall]);

  // Fetch MEET config when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchConfig();
    } else {
      clearConfig();
    }
  }, [isAuthenticated, fetchConfig, clearConfig]);

  // Detect if we're on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const mode = activeCall?.viewMode;
  const embeddedElsewhere = mode === 'embedded' && !embeddedMounted;

  return (
    <>
      {children}

      {incomingCall && <IncomingCallToast />}

      {activeCall && (
        <>
          <MeetFrame />

          {/* Desktop chrome */}
          {!isMobile && (mode === 'pip' || mode === 'minimized' || mode === 'fullscreen' || embeddedElsewhere) && (
            <MeetCall />
          )}

          {/* Mobile chrome */}
          {isMobile && (mode === 'pip' || mode === 'minimized' || embeddedElsewhere) && <MobileMeetPip />}
          {isMobile && mode === 'fullscreen' && <MeetCall />}
        </>
      )}
    </>
  );
}

export default MeetProvider;
