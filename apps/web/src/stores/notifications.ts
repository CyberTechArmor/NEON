/**
 * Notification Settings Store
 *
 * Manages notification preferences including:
 * - Sound notifications (on/off)
 * - Browser push notifications (permission status)
 * - Test alert sound preference
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type NotificationPermission = 'default' | 'granted' | 'denied';

interface NotificationSettings {
  // Sound settings
  soundEnabled: boolean;
  testAlertSoundEnabled: boolean;
  soundVolume: number; // 0-1

  // Browser notification settings
  browserNotificationsEnabled: boolean;
  browserPermission: NotificationPermission;

  // Actions
  setSoundEnabled: (enabled: boolean) => void;
  setTestAlertSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  updateBrowserPermission: () => void;
  requestBrowserPermission: () => Promise<NotificationPermission>;
}

// Create a simple notification sound using Web Audio API
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a notification sound
 * Uses Web Audio API to generate a pleasant notification tone
 */
export function playNotificationSound(volume: number = 0.5): void {
  try {
    const ctx = getAudioContext();

    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Pleasant two-tone notification sound
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6

    oscillator.type = 'sine';

    // Envelope: quick attack, short sustain, smooth decay
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * 0.3, ctx.currentTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(volume * 0.2, ctx.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (error) {
    console.warn('[Notification] Failed to play sound:', error);
  }
}

/**
 * Play a test alert sound (more prominent)
 */
export function playTestAlertSound(volume: number = 0.7): void {
  try {
    const ctx = getAudioContext();

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Play a more attention-grabbing sound for test alerts
    const playTone = (freq: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(freq, startTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume * 0.4, startTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    // Three ascending tones
    playTone(523.25, ctx.currentTime, 0.15); // C5
    playTone(659.25, ctx.currentTime + 0.15, 0.15); // E5
    playTone(783.99, ctx.currentTime + 0.3, 0.2); // G5
  } catch (error) {
    console.warn('[Notification] Failed to play test alert sound:', error);
  }
}

/**
 * Show a browser notification
 */
export async function showBrowserNotification(
  title: string,
  options?: NotificationOptions
): Promise<Notification | null> {
  // Check if notifications are supported
  if (!('Notification' in window)) {
    console.warn('[Notification] Browser notifications not supported');
    return null;
  }

  // Check permission
  if (Notification.permission !== 'granted') {
    console.warn('[Notification] Browser notification permission not granted');
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: '/neon-icon.svg',
      badge: '/neon-icon.svg',
      ...options,
    });

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    // Focus window when clicked
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return notification;
  } catch (error) {
    console.warn('[Notification] Failed to show browser notification:', error);
    return null;
  }
}

/**
 * Show a notification for a new message
 */
export function showMessageNotification(
  senderName: string,
  messageContent: string,
  conversationId?: string
): void {
  const { soundEnabled, soundVolume, browserNotificationsEnabled } =
    useNotificationStore.getState();

  // Play sound if enabled
  if (soundEnabled) {
    playNotificationSound(soundVolume);
  }

  // Show browser notification if enabled and permitted
  if (browserNotificationsEnabled && Notification.permission === 'granted') {
    // Note: 'renotify' is a valid Web Notifications API property but not in TypeScript's
    // NotificationOptions type. Use type assertion for extended notification options.
    showBrowserNotification(senderName, {
      body: messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : ''),
      tag: conversationId || 'message', // Group notifications by conversation
      renotify: true,
    } as NotificationOptions);
  }
}

/**
 * Show a test alert notification
 */
export function showTestAlertNotification(title: string, body: string): void {
  const { testAlertSoundEnabled, soundVolume, browserNotificationsEnabled } =
    useNotificationStore.getState();

  // Play sound if enabled (default on for test alerts)
  if (testAlertSoundEnabled) {
    playTestAlertSound(soundVolume);
  }

  // Show browser notification if enabled
  if (browserNotificationsEnabled && Notification.permission === 'granted') {
    showBrowserNotification(title, {
      body,
      tag: 'test-alert',
      requireInteraction: true, // Keep visible until user interacts
    });
  }
}

export const useNotificationStore = create<NotificationSettings>()(
  persist(
    (set, get) => ({
      // Default settings
      soundEnabled: false, // Off by default for regular messages
      testAlertSoundEnabled: true, // On by default for test alerts
      soundVolume: 0.5,
      browserNotificationsEnabled: false,
      browserPermission: 'default',

      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

      setTestAlertSoundEnabled: (enabled) => set({ testAlertSoundEnabled: enabled }),

      setSoundVolume: (volume) => set({ soundVolume: Math.max(0, Math.min(1, volume)) }),

      setBrowserNotificationsEnabled: (enabled) => {
        if (enabled && Notification.permission !== 'granted') {
          // Request permission first
          get().requestBrowserPermission().then((permission) => {
            set({
              browserNotificationsEnabled: permission === 'granted',
              browserPermission: permission,
            });
          });
        } else {
          set({ browserNotificationsEnabled: enabled });
        }
      },

      updateBrowserPermission: () => {
        if ('Notification' in window) {
          set({ browserPermission: Notification.permission as NotificationPermission });
        }
      },

      requestBrowserPermission: async () => {
        if (!('Notification' in window)) {
          console.warn('[Notification] Browser notifications not supported');
          return 'denied';
        }

        try {
          const permission = await Notification.requestPermission();
          set({
            browserPermission: permission as NotificationPermission,
            browserNotificationsEnabled: permission === 'granted',
          });
          return permission as NotificationPermission;
        } catch (error) {
          console.error('[Notification] Failed to request permission:', error);
          return 'denied';
        }
      },
    }),
    {
      name: 'neon-notification-settings',
      partialize: (state) => ({
        soundEnabled: state.soundEnabled,
        testAlertSoundEnabled: state.testAlertSoundEnabled,
        soundVolume: state.soundVolume,
        browserNotificationsEnabled: state.browserNotificationsEnabled,
      }),
    }
  )
);

// Initialize browser permission on load
if (typeof window !== 'undefined' && 'Notification' in window) {
  useNotificationStore.getState().updateBrowserPermission();
}
