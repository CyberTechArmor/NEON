/**
 * Custom Service Worker for NEON
 *
 * Handles push notifications and background sync
 * This file is imported by the main service worker
 */

// Handle notification clicks - navigate to the correct page
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag, event.action);
  event.notification.close();

  // Get the URL to navigate to from notification data
  const notificationData = event.notification.data || {};
  let targetUrl = notificationData.url || '/';

  // Handle notification actions
  if (event.action === 'view' && notificationData.conversationId) {
    targetUrl = `/chat/${notificationData.conversationId}`;
  } else if (event.action === 'dismiss') {
    // Just close the notification, don't navigate
    return;
  } else if (notificationData.conversationId) {
    // Default click - navigate to conversation
    targetUrl = `/chat/${notificationData.conversationId}`;
  }

  // Focus existing window and navigate, or open new window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a NEON window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Navigate the existing window to the target URL
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: targetUrl,
            conversationId: notificationData.conversationId,
          });
          return client.focus();
        }
      }
      // Otherwise, open a new window with the target URL
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Handle push messages (for future server-sent push notifications)
self.addEventListener('push', (event) => {
  console.log('[SW] Push message received:', event);

  let data = {
    title: 'NEON',
    body: 'You have a new message',
    icon: '/neon-icon.svg',
    badge: '/neon-icon.svg',
    tag: 'neon-notification',
  };

  // Try to parse the push data
  if (event.data) {
    try {
      const pushData = event.data.json();
      data = {
        ...data,
        ...pushData,
      };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data || {},
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || [],
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});

console.log('[SW] Custom service worker loaded');
