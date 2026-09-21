import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { adminApi, messagesApi } from '../lib/api';
import { useAuthStore } from './auth';

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

/**
 * Where the one MEET iframe should be on screen right now, in viewport
 * pixels. Set by whichever piece of call chrome is mounted (embedded pane,
 * PiP window, fullscreen, mobile mini view); null means "no chrome is showing
 * the video" and the frame stays mounted but hidden, so the call and any
 * screen share survive a minimize or a page change.
 */
export interface MeetSlotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Someone in a conversation has started a call and this user has not
 * answered or dismissed it yet. Set from the socket when a call-announcement
 * message arrives; drives the ringing popup and the conversation card.
 */
export interface IncomingCall {
  conversationId: string;
  /** The MEET room the caller is in — answering joins this exact room. */
  room: string;
  kind: 'video' | 'voice';
  callerId: string;
  callerName: string;
  callerAvatarUrl?: string;
  messageId: string;
  receivedAt: number;
}

/**
 * How every call announcement starts, by kind. The socket handler rings on
 * these prefixes even when the message carries no call metadata, so a caller
 * on an older client still rings everyone. Phone and camera buttons both
 * announce this way; only the wording differs.
 */
export const CALL_ANNOUNCEMENT_PREFIXES: Record<'video' | 'voice', string> = {
  video: '📹 Started a video call',
  voice: '📞 Started a voice call',
};

/** The kind a message announces, or null when it is not a call announcement. */
export function announcedCallKind(message: {
  content?: string | null;
  metadata?: { call?: { room?: string; kind?: string } } | null;
}): 'video' | 'voice' | null {
  const metadataKind = message.metadata?.call?.kind;
  if (message.metadata?.call?.room) return metadataKind === 'voice' ? 'voice' : 'video';
  const content = message.content ?? '';
  if (content.startsWith(CALL_ANNOUNCEMENT_PREFIXES.voice)) return 'voice';
  if (content.startsWith(CALL_ANNOUNCEMENT_PREFIXES.video)) return 'video';
  return null;
}

/** How long a call keeps ringing before the popup gives up on its own. */
export const INCOMING_CALL_TIMEOUT_MS = 60 * 1000;

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

  // Where the persistent iframe is drawn (see MeetSlotRect); null = hidden.
  slot: MeetSlotRect | null;
  // True while ChatPage has the embedded call pane mounted for this call.
  embeddedMounted: boolean;

  // A call ringing for this user (see IncomingCall); null when none.
  incomingCall: IncomingCall | null;

  // Actions
  fetchConfig: () => Promise<void>;
  clearConfig: () => void;

  startCall: (options: {
    conversationId: string;
    participants: MeetParticipant[];
    displayName: string;
    /** Phone button = voice, camera button = video. Same room, same ring; only the wording differs. */
    kind?: 'video' | 'voice';
  }) => Promise<void>;

  /** Join a call someone announced in a conversation (the Join button on the announcement). */
  joinAnnouncedCall: (options: { conversationId: string; room: string; callerName: string }) => Promise<void>;

  joinCall: (options: {
    roomName: string;
    displayName: string;
    conversationId?: string;
    /** What the call chrome calls this call; defaults to displayName. */
    title?: string;
  }) => Promise<void>;

  setIncomingCall: (call: IncomingCall | null) => void;
  /** Join the ringing call's room. The caller navigates to the conversation itself. */
  answerIncomingCall: () => Promise<void>;
  dismissIncomingCall: () => void;

  endCall: () => void;

  setViewMode: (mode: MeetViewMode) => void;
  toggleChatSidebar: () => void;
  setSlot: (slot: MeetSlotRect | null) => void;
  setEmbeddedMounted: (mounted: boolean) => void;

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
      slot: null,
      embeddedMounted: false,
      incomingCall: null,

      fetchConfig: async () => {
        const state = get();

        // Use cached config if still valid
        if (
          state.config &&
          state.lastConfigFetch &&
          Date.now() - state.lastConfigFetch < CONFIG_CACHE_DURATION
        ) {
          console.log('[MeetStore] Using cached config');
          return;
        }

        set({ configLoading: true, configError: null });

        try {
          console.log('[MeetStore] Fetching MEET config...');
          const response = await adminApi.meet.get();
          const data = response.data.data;

          console.log('[MeetStore] MEET config received:', data);

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
          console.error('[MeetStore] Failed to fetch MEET config:', error);
          // Set a default unconfigured state so buttons show with proper message
          set({
            config: {
              configured: false,
              enabled: false,
              baseUrl: '',
              autoJoin: true,
              defaultQuality: 'auto',
            },
            configLoading: false,
            configError: error.response?.data?.error?.message || error.message || 'Failed to fetch MEET configuration',
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

      startCall: async ({ conversationId, participants, displayName, kind = 'video' }) => {
        const state = get();

        // Ensure config is loaded
        if (!state.config) {
          await state.fetchConfig();
        }

        const config = get().config;
        if (!config || !config.configured || !config.enabled) {
          const errorMsg = 'MEET integration is not configured or disabled';
          set({ joinError: errorMsg });
          throw new Error(errorMsg);
        }

        set({ isJoining: true, joinError: null });

        try {
          // Create room name from conversation ID
          // Remove any special characters and limit length
          const roomName = `neon-${conversationId.replace(/-/g, '').slice(0, 16)}`;

          // Create or get existing room on MEET server
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

          // Tell the other participants. Starting a call creates a MEET room
          // named after the conversation and nothing else — no ring, no
          // notification — so without this the other side only finds out by
          // accident. The message reaches everyone in the conversation over
          // the socket right away and stays in the history; its `call`
          // metadata is what makes their client ring and lets "Answer" join
          // this exact room. Best-effort: the call is up whether or not this
          // posts.
          try {
            await messagesApi.send(conversationId, {
              content: `${CALL_ANNOUNCEMENT_PREFIXES[kind]} — answer the ring, or press Join on this message.`,
              metadata: { call: { room: roomName, kind } },
            });
          } catch (notifyError) {
            console.warn('[MeetStore] Could not post the call-started message:', notifyError);
          }

          // Pressing the camera button in a conversation that is ringing IS
          // answering it.
          if (get().incomingCall?.conversationId === conversationId) {
            set({ incomingCall: null });
          }
        } catch (error: any) {
          const errorMsg = error.response?.data?.error?.message || error.message || 'Failed to start call';
          set({
            isJoining: false,
            joinError: errorMsg,
          });
          throw new Error(errorMsg);
        }
      },

      joinCall: async ({ roomName, displayName, conversationId, title }) => {
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
              displayName: title || displayName,
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

      joinAnnouncedCall: async ({ conversationId, room, callerName }) => {
        if (get().activeCall) return;
        if (get().incomingCall?.conversationId === conversationId) set({ incomingCall: null });
        const me = useAuthStore.getState().user;
        await get().joinCall({
          roomName: room,
          displayName: me?.name || 'Guest',
          conversationId,
          title: callerName,
        });
        const error = get().joinError;
        if (error) throw new Error(error);
      },

      setIncomingCall: (call) => {
        // Already in a call in that conversation: nothing to ring about.
        if (call && get().activeCall?.conversationId === call.conversationId) return;
        set({ incomingCall: call });
      },

      answerIncomingCall: async () => {
        const call = get().incomingCall;
        if (!call) return;
        set({ incomingCall: null });

        const me = useAuthStore.getState().user;
        await get().joinCall({
          roomName: call.room,
          displayName: me?.name || 'Guest',
          conversationId: call.conversationId,
          title: call.callerName,
        });

        const error = get().joinError;
        if (error) throw new Error(error);
      },

      dismissIncomingCall: () => {
        set({ incomingCall: null });
      },

      endCall: () => {
        set({
          activeCall: null,
          isJoining: false,
          joinError: null,
          showChatSidebar: false,
          slot: null,
          embeddedMounted: false,
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

      setSlot: (slot) => {
        const current = get().slot;
        // Slots are re-measured on every render of the chrome; only a real
        // move should reach the frame.
        if (
          (current === null && slot === null) ||
          (current &&
            slot &&
            current.top === slot.top &&
            current.left === slot.left &&
            current.width === slot.width &&
            current.height === slot.height)
        ) {
          return;
        }
        set({ slot });
      },

      setEmbeddedMounted: (embeddedMounted) => {
        if (get().embeddedMounted !== embeddedMounted) set({ embeddedMounted });
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
