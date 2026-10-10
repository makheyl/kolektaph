/**
 * On the web the launch screen is plain HTML in public/index.html (`#kph-splash`), so the logo
 * shows on a slow connection before any JavaScript has arrived. The first screen that draws
 * fades it out. Safe to call again.
 */
export function hideAppSplash(): void {
  const splash = document.getElementById('kph-splash');
  if (!splash || splash.dataset.hiding) return;
  splash.dataset.hiding = 'true';
  splash.style.opacity = '0';
  // Remove it after the fade (the page's CSS skips the fade for people who ask for less motion).
  setTimeout(() => splash.remove(), 260);
}
