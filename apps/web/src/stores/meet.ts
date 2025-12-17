import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { adminApi } from '../lib/api';

export type MeetViewMode = 'fullscreen' | 'embedded' | 'pip' | 'minimized';

export interface MeetParticipant {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface ActiveMeetCall {
  roomName: string;
  displayName: string;
  joinUrl: string;
  baseUrl: string;
  conversationId?: string;
  participants: MeetParticipant[];
  startedAt: number;
  viewMode: MeetViewMode;
  isHost: boolean;
}

export interface MeetIntegrationConfig {
  configured: boolean;
  enabled: boolean;
  baseUrl: string;
  autoJoin: boolean;
  defaultQuality: string;
}

interface MeetState {
  // Integration config (cached from backend)
  config: MeetIntegrationConfig | null;
  configLoading: boolean;
  configError: string | null;
  lastConfigFetch: number | null;

  // Active call state
  activeCall: ActiveMeetCall | null;
  isJoining: boolean;
  joinError: string | null;

  // Chat sidebar visibility during call
  showChatSidebar: boolean;

  // Actions
  fetchConfig: () => Promise<void>;
  clearConfig: () => void;

  startCall: (options: {
    conversationId: string;
    participants: MeetParticipant[];
    displayName: string;
  }) => Promise<void>;

  joinCall: (options: {
    roomName: string;
    displayName: string;
    conversationId?: string;
  }) => Promise<void>;

  endCall: () => void;

  setViewMode: (mode: MeetViewMode) => void;
  toggleChatSidebar: () => void;

  updateParticipants: (participants: MeetParticipant[]) => void;
}

// Cache duration for config (5 minutes)
const CONFIG_CACHE_DURATION = 5 * 60 * 1000;

export const useMeetStore = create<MeetState>()(
  persist(
    (set, get) => ({
      config: null,
      configLoading: false,
      configError: null,
      lastConfigFetch: null,

      activeCall: null,
      isJoining: false,
      joinError: null,

      showChatSidebar: false,

      fetchConfig: async () => {
        const state = get();

        // Use cached config if still valid
        if (
          state.config &&
          state.lastConfigFetch &&
          Date.now() - state.lastConfigFetch < CONFIG_CACHE_DURATION
        ) {
          return;
        }

        set({ configLoading: true, configError: null });

        try {
          const response = await adminApi.meet.get();
          const data = response.data.data;

          set({
            config: {
              configured: data.configured,
              enabled: data.enabled,
              baseUrl: data.baseUrl,
              autoJoin: data.autoJoin ?? true,
              defaultQuality: data.defaultQuality || 'auto',
            },
            configLoading: false,
            lastConfigFetch: Date.now(),
          });
        } catch (error: any) {
          set({
            configLoading: false,
            configError: error.message || 'Failed to fetch MEET configuration',
          });
        }
      },

      clearConfig: () => {
        set({
          config: null,
          configError: null,
          lastConfigFetch: null,
        });
      },

      startCall: async ({ conversationId, participants, displayName }) => {
        const state = get();

        // Ensure config is loaded
        if (!state.config) {
          await state.fetchConfig();
        }

        const config = get().config;
        if (!config || !config.configured || !config.enabled) {
          set({ joinError: 'MEET integration is not configured or disabled' });
          return;
        }

        set({ isJoining: true, joinError: null });

        try {
          // Create room name from conversation ID
          // Remove any special characters and limit length
          const roomName = `neon-${conversationId.replace(/-/g, '').slice(0, 16)}`;

          // Create room on MEET server
          const response = await adminApi.meet.createRoom({
            roomName,
            displayName: `NEON Call - ${displayName}`,
            maxParticipants: 100,
          });

          const { joinUrl } = response.data.data;

          // Build join URL with participant name
          const url = new URL(joinUrl);
          url.searchParams.set('name', displayName);
          if (config.autoJoin) {
            url.searchParams.set('autojoin', 'true');
          }
          if (config.defaultQuality && config.defaultQuality !== 'auto') {
            url.searchParams.set('quality', config.defaultQuality);
          }

          set({
            activeCall: {
              roomName,
              displayName,
              joinUrl: url.toString(),
              baseUrl: config.baseUrl,
              conversationId,
              participants,
              startedAt: Date.now(),
              viewMode: 'embedded',
              isHost: true,
            },
            isJoining: false,
            showChatSidebar: false,
          });
        } catch (error: any) {
          set({
            isJoining: false,
            joinError: error.response?.data?.error?.message || error.message || 'Failed to start call',
          });
        }
      },

      joinCall: async ({ roomName, displayName, conversationId }) => {
        const state = get();

        // Ensure config is loaded
        if (!state.config) {
          await state.fetchConfig();
        }

        const config = get().config;
        if (!config || !config.configured || !config.enabled) {
          set({ joinError: 'MEET integration is not configured or disabled' });
          return;
        }

        set({ isJoining: true, joinError: null });

        try {
          const response = await adminApi.meet.getJoinUrl(roomName, displayName, config.defaultQuality);
          const { joinUrl, baseUrl } = response.data.data;

          // Build join URL with auto-join if enabled
          const url = new URL(joinUrl);
          if (config.autoJoin) {
            url.searchParams.set('autojoin', 'true');
          }

          set({
            activeCall: {
              roomName,
              displayName,
              joinUrl: url.toString(),
              baseUrl,
              conversationId,
              participants: [],
              startedAt: Date.now(),
              viewMode: 'embedded',
              isHost: false,
            },
            isJoining: false,
            showChatSidebar: false,
          });
        } catch (error: any) {
          set({
            isJoining: false,
            joinError: error.response?.data?.error?.message || error.message || 'Failed to join call',
          });
        }
      },

      endCall: () => {
        set({
          activeCall: null,
          isJoining: false,
          joinError: null,
          showChatSidebar: false,
        });
      },

      setViewMode: (mode: MeetViewMode) => {
        const { activeCall } = get();
        if (activeCall) {
          set({
            activeCall: { ...activeCall, viewMode: mode },
          });
        }
      },

      toggleChatSidebar: () => {
        set((state) => ({ showChatSidebar: !state.showChatSidebar }));
      },

      updateParticipants: (participants: MeetParticipant[]) => {
        const { activeCall } = get();
        if (activeCall) {
          set({
            activeCall: { ...activeCall, participants },
          });
        }
      },
    }),
    {
      name: 'neon-meet-storage',
      partialize: (state) => ({
        // Only persist active call for session continuity
        activeCall: state.activeCall,
      }),
    }
  )
);

// Helper to generate room name from conversation
export function generateRoomName(conversationId: string): string {
  return `neon-${conversationId.replace(/-/g, '').slice(0, 16)}`;
}

// Helper to generate display name for 1-on-1 conversations
export function generateDisplayName(participants: MeetParticipant[]): string {
  if (participants.length === 0) return 'Video Call';
  if (participants.length === 1) return participants[0].displayName;
  if (participants.length === 2) {
    return `${participants[0].displayName} & ${participants[1].displayName}`;
  }
  return `${participants[0].displayName} + ${participants.length - 1} others`;
}
