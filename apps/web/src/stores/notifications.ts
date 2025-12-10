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
 * Extended notification options for mobile and service worker support
 */
interface ExtendedNotificationOptions extends NotificationOptions {
  conversationId?: string;
  vibrate?: number | number[];
  renotify?: boolean;
  data?: Record<string, any>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
}

/**
 * Show a browser notification with optional navigation on click
 * Works with both regular Notification API and Service Worker notifications
 * for better mobile support (shows in notification bar)
 */
export async function showBrowserNotification(
  title: string,
  options?: ExtendedNotificationOptions
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

  const { conversationId, ...notificationOptions } = options || {};

  // Notification options optimized for mobile OS notification bar
  const fullOptions: ExtendedNotificationOptions = {
    icon: '/neon-icon.svg',
    badge: '/neon-icon.svg',
    vibrate: [200, 100, 200], // Vibration pattern for mobile
    silent: false, // Allow system sound on mobile
    requireInteraction: false, // Don't require interaction on mobile
    data: { conversationId, url: conversationId ? `/chat/${conversationId}` : '/' },
    ...notificationOptions,
  };

  try {
    // Try to use Service Worker for better mobile support (shows in notification bar)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const registration = await navigator.serviceWorker.ready;
      if (registration.showNotification) {
        // Service worker notification - shows in mobile notification bar
        await registration.showNotification(title, fullOptions as NotificationOptions);
        return null; // SW notification doesn't return a Notification object
      }
    }

    // Fall back to regular Notification API
    const notification = new Notification(title, fullOptions as NotificationOptions);

    // Auto-close after 5 seconds (desktop only, mobile handles this)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    if (!isMobile) {
      setTimeout(() => notification.close(), 5000);
    }

    // Handle click - navigate to conversation if provided
    notification.onclick = () => {
      window.focus();
      notification.close();

      // Navigate to conversation if conversationId is provided
      // This works for both PWA and regular browser
      if (conversationId) {
        // Use the current origin to build the URL
        const chatUrl = `${window.location.origin}/chat/${conversationId}`;

        // If we're in a standalone PWA, use the existing window
        if (window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone) {
          window.location.href = chatUrl;
        } else {
          // For regular browser, also navigate in the current window
          window.location.href = chatUrl;
        }
      }
    };

    return notification;
  } catch (error) {
    console.warn('[Notification] Failed to show browser notification:', error);
    return null;
  }
}

/**
 * Show a notification for a new message
 * Works in both foreground and background (via service worker)
 * Shows in mobile notification bar like native OS notifications
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
  // This will show in mobile notification bar with vibration
  if (browserNotificationsEnabled && Notification.permission === 'granted') {
    showBrowserNotification(senderName, {
      body: messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : ''),
      tag: conversationId || 'message', // Group notifications by conversation
      renotify: true, // Show new notification even if same tag
      conversationId, // Pass conversationId for navigation on click
      vibrate: [200, 100, 200], // Vibration for mobile
      // Actions for notification (shown on mobile when expanded)
      actions: conversationId ? [
        { action: 'view', title: 'View', icon: '/icons/view.png' },
        { action: 'dismiss', title: 'Dismiss', icon: '/icons/dismiss.png' },
      ] : undefined,
    });
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
