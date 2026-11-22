// Shared helpers for every screen.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const view = $('#view');
export const dlg = $('#dlg');
export const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(globalThis.BRAND.dataPrefix + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(globalThis.BRAND.dataPrefix + k, JSON.stringify(v)),
};
export const isIOS = document.documentElement.classList.contains('is-ios');

// Appearance (RRA-065): 'auto' (match device), 'light' or 'dark', per device.
export const THEMES = { light: 'Light', dark: 'Dark', auto: 'Match device' };
export function getTheme() { const t = LS.get('theme', 'auto'); return t in THEMES ? t : 'auto'; }
export function applyTheme(t = getTheme()) {
  const d = document.documentElement;
  if (t === 'auto') d.removeAttribute('data-theme'); else d.dataset.theme = t;
  // The status bar color follows the choice too.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const dark = t === 'auto' ? m.media.includes('dark') : t === 'dark';
    m.content = dark ? '#000000' : '#f2f2f7';
  });
}
export function setTheme(t) { LS.set('theme', t); applyTheme(t); syncNight(); }
// Is the app showing dark right now (by choice, or by matching the device)?
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
export const isDark = () => { const t = getTheme(); return t === 'dark' || (t === 'auto' && darkMQ.matches); };
// The moon button (RRA-067): one tap switches between light and night.
function syncNight() {
  const b = document.getElementById('btn-night');
  if (!b) return;
  const dark = isDark();
  b.classList.toggle('is-dark', dark);
  b.setAttribute('aria-label', dark ? 'Day mode' : 'Night mode');
}
applyTheme();
document.getElementById('btn-night')?.addEventListener('click', () => {
  setTheme(isDark() ? 'light' : 'dark');
  if (location.hash.startsWith('#/settings')) window.dispatchEvent(new HashChangeEvent('hashchange'));
});
darkMQ.addEventListener?.('change', syncNight);
syncNight();
export const standalone = document.documentElement.classList.contains('standalone');
// Tablet and computer layout (RRA-051): a sidebar and wide tables from 768px (iPad upright and up).
export const wideMQ = matchMedia('(min-width: 768px)');
export const isWide = () => wideMQ.matches;

// Colored chips (RRA-051), the same on phones and wide screens.
export const chip = (text, color) => `<span class="chip c-${color}">${esc(text)}</span>`;

// Search box with an X that clears it (RRA-050).
export const searchBox = (id, placeholder, value) => `<div class="search"><input type="search" id="${id}" placeholder="${esc(placeholder)}" value="${esc(value || '')}">
  <button class="search-x" type="button" id="${id}-x" aria-label="Clear search"${value ? '' : ' hidden'}>×</button></div>`;

// ---------------------------------------------------------------- helpers

export function toast(msg, action, ms) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { t.hidden = true; action.run(); };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms || (action ? 12000 : 3000));
}

export async function copy(text, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    // Older browsers: select a hidden field instead.
    const ta = document.createElement('textarea');
    ta.value = text; document.body.append(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast(done);
  }
}

export async function share(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copy(text, 'Copied. Paste it into a text message.');
}

export async function pasteInto(ta) {
  try { ta.value = await navigator.clipboard.readText(); ta.dispatchEvent(new Event('input')); }
  catch { ta.focus(); toast('Long-press the box and tap Paste'); }
}

// Opens the bottom sheet. Resolves with whatever close(value) gets.
export function sheet({ title, body, left = 'Cancel', right, onMount, dismissable = true }) {
  return new Promise((resolve) => {
    dlg.innerHTML = `
      <div class="sheet-head">
        ${left ? `<button class="btn plain small" data-act="left" type="button">${esc(left)}</button>` : '<span style="width:70px"></span>'}
        <h3>${esc(title)}</h3>
        ${right ? `<button class="btn plain small" data-act="right" type="button" style="font-weight:700">${esc(right)}</button>` : '<span style="width:70px"></span>'}
      </div>
      <div class="sheet-body">${body}</div>`;
    let result;
    const close = (v) => { result = v; dlg.close(); };
    dlg.onclose = () => resolve(result);
    dlg.oncancel = (e) => { if (!dismissable) e.preventDefault(); };
    const api = { close, el: dlg };
    $('[data-act=left]', dlg)?.addEventListener('click', () => close(undefined));
    const r = $('[data-act=right]', dlg);
    if (r) r.addEventListener('click', () => api.onRight ? api.onRight() : close(true));
    onMount?.(api);
    dlg.showModal();
    $('.sheet-body', dlg).scrollTop = 0;
  });
}

export function setTitle(text, actionHtml = '') {
  $('#title').textContent = text;
  $('#title-action').innerHTML = actionHtml;
}

export function setChrome({ locked = false, tab = null, back = false }) {
  document.body.classList.toggle('locked', locked);
  $('#tabs').hidden = locked;
  $('#side').hidden = locked;
  const name = (location.hash.match(/^#\/([^/]+)/) || [])[1] || 'recipes';
  const SIDE = { recipe: 'recipes', print: 'recipes', 'stock-items': 'stock', 'schedule-print': 'schedule', notices: 'board', event: 'events', vendors: 'settings', staff: 'settings', list: 'settings', roles: 'settings', person: 'settings' };
  $$('#side a').forEach((a) => a.classList.toggle('on', a.dataset.r === (SIDE[name] || name)));
  $('#btn-bell').hidden = locked;
  $('#btn-back').hidden = !back;
  $$('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, 0);
}

export const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// Who is using this phone, and the latest notices. Set by app.js.
export const session = { profile: null, notices: [] };
