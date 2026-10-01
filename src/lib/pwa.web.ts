/**
 * Registers the service worker built by `npm run build:web` (Workbox). Only in production
 * builds: during development a cached app would hide code changes.
 */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Without a service worker the site still works; it just isn't available offline.
    });
  };
  // Route code loads in chunks, often after the page's load event has already fired.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
