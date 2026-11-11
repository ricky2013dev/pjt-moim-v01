import { registerSW } from 'virtual:pwa-register';

// Installed PWAs on phones are usually resumed from the background rather than
// reloaded, so the browser rarely re-checks the service worker on its own. We ask
// the server for a newer build at sign-in, whenever the app comes back to the
// foreground, and hourly. With registerType 'autoUpdate', a newer build activates
// right away and the page reloads itself onto it.
let registration;
let lastCheck = 0;

export function checkForUpdate({ force = false } = {}) {
  if (!registration || !navigator.onLine) return;
  const now = Date.now();
  if (!force && now - lastCheck < 60_000) return; // don't hammer on rapid app switches
  lastCheck = now;
  registration.update().catch(() => {});
}

export function initUpdates() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (!reg) return;
      setInterval(() => checkForUpdate(), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
  });
}
