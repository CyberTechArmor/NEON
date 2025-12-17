import { useEffect, ReactNode } from 'react';
import { useMeetStore } from '../../stores/meet';
import { MeetCall, MobileMeetPip } from './MeetCall';
import { useAuthStore } from '../../stores/auth';

interface MeetProviderProps {
  children: ReactNode;
}

/**
 * MeetProvider wraps the application and renders the persistent video call UI.
 * It ensures that video calls continue across page navigation.
 */
export function MeetProvider({ children }: MeetProviderProps) {
  const { activeCall, fetchConfig, clearConfig } = useMeetStore();
  const { isAuthenticated } = useAuthStore();

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

  return (
    <>
      {children}

      {/* Render global call UI based on view mode */}
      {activeCall && (
        <>
          {/* Desktop PIP and minimized views */}
          {!isMobile && (activeCall.viewMode === 'pip' || activeCall.viewMode === 'minimized' || activeCall.viewMode === 'fullscreen') && (
            <MeetCall />
          )}

          {/* Mobile PIP */}
          {isMobile && (activeCall.viewMode === 'pip' || activeCall.viewMode === 'minimized') && (
            <MobileMeetPip />
          )}
        </>
      )}
    </>
  );
}

export default MeetProvider;
