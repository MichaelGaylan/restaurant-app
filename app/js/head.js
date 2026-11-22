// Shared page head for every restaurant (RSW). Runs right after the
// restaurant's brand.js and before the page draws: platform look, saved
// Light/Dark choice, the brand's name and icons, and its accent color.
(function (B) {
  var d = document, html = d.documentElement, ua = navigator.userAgent;
  // Platform look (RRA-013): set before first paint to avoid a flash.
  var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var look = B.forceLook || (/Android/.test(ua) ? 'android' : 'ios'); // forceLook: the setup wizard's preview
  html.classList.add(look);
  if (ios) html.classList.add('is-ios');
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) html.classList.add('standalone');
  // Appearance (RRA-065): Light, Dark or Match device, saved on this device.
  try { var t = JSON.parse(localStorage.getItem(B.dataPrefix + 'theme')); if (t === 'light' || t === 'dark') html.dataset.theme = t; } catch (e) {}

  // Brand: index.html already carries these for iPhone; this keeps them in step.
  d.title = B.appName;
  var set = function (sel, attr, v) { var el = d.querySelector(sel); if (el && v) el.setAttribute(attr, v); };
  set('meta[name="apple-mobile-web-app-title"]', 'content', B.shortName);
  set('link[rel="apple-touch-icon"]', 'href', B.icon180);
  set('link[rel="icon"]', 'href', B.favicon);
  if (B.accent) {
    // Pick white or black text on the accent, whichever reads better.
    var h = B.accent.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16), lum = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
    var s = d.createElement('style');
    s.textContent = ':root{--accent:' + B.accent + ' !important;--on-accent:' + (lum > 0.6 ? '#000' : '#fff') + ' !important}';
    d.head.appendChild(s);
  }
})(self.BRAND);
