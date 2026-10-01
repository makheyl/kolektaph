/**
 * Service worker for the web build (`npm run build:web`). Precaches the app shell (the sample
 * schedule is in the bundle, so it works offline) and keeps recently seen map tiles for weak
 * signal. New versions activate on the next visit (skipWaiting + clientsClaim), so an old
 * cached app never sticks (see docs.expo.dev/guides/progressive-web-apps).
 */
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{js,mjs,html,css,ttf,otf,woff2,ico,png,json}'],
  // Expo exports package assets under assets/node_modules/, which Workbox skips by default.
  globIgnores: ['sw.js', 'workbox-*.js'],
  swDest: 'dist/sw.js',
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  navigateFallback: '/index.html',
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'map-tiles',
        expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
};
