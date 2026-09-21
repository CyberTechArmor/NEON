import { useMeetStore } from '../stores/meet';

/**
 * Keep an open tab on the current build.
 *
 * The service worker (vite-plugin-pwa, autoUpdate: skipWaiting + clientsClaim)
 * only looks for a new version when a page loads, so a dashboard left open
 * through a redeploy kept the old bundle until a hard refresh. This asks the
 * browser to re-check every minute and again whenever the tab becomes
 * visible, and reloads once the new worker has taken over — unless a call is
 * up, in which case the reload waits for the call to end, because a reload
 * is a disconnect.
 */
const CHECK_INTERVAL_MS = 60 * 1000;

export function startPwaUpdates(): void {
  if (!('serviceWorker' in navigator)) return;

  // Only a tab that already had a controller is switching builds; the very
  // first activation must not reload.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  const reloadWhenIdle = () => {
    if (reloading) return;
    const finish = () => {
      reloading = true;
      window.location.reload();
    };
    if (!useMeetStore.getState().activeCall) {
      finish();
      return;
    }
    console.log('[PWA] New version ready; reloading after the call ends');
    const unsubscribe = useMeetStore.subscribe((state) => {
      if (!state.activeCall) {
        unsubscribe();
        finish();
      }
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) reloadWhenIdle();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const check = () => registration.update().catch(() => undefined);
        setInterval(check, CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch((error) => {
        console.log('Service worker registration failed:', error);
      });
  });
}
