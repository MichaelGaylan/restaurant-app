// Alert badges for new work (RRA-137).
// Nine kinds of alert, each sent only to the people who handle it (their role
// and job title, RRA-132). Each shows as a number badge on the tab, the left
// menu and More, adds to the number on the home-screen app icon (where the
// phone allows it), plays a chime and buzz for something new, and shows a
// phone notification when the app is open in the background.
//
// There is no server, so alerts reach a phone only while the app is open or
// running in the background. Push to a closed app would need a push service.

import * as data from './data.js';
import { $$, esc, dlg, LS, session } from './ui.js';
import { BRAND } from './config.js';
import { isHost, myStaff, jobAllows, canSee } from './perms.js';
import { myPickups, canTake, posSettings } from './pos.js';
import { unreadPosts } from './board.js';
import { swapBadge } from './schedule.js';
import { timeOffBadge } from './timeoff.js';
import { unseenReports } from './reports.js';

const role = () => session.profile?.role;
const boss = () => isHost() || role() === 'manager';
const staffJob = (k) => role() === 'staff' && canSee('pos') && jobAllows(k);
const meId = () => myStaff()?.id || (isHost() ? 'admin' : session.profile?.iid || 'me');
const meName = () => session.profile?.name || 'Me';

export const TICKET_LATE = 15; // minutes: tickets turn red on the kitchen and bar screen
export const CHECK_LATE = 90;  // minutes, until the Admin changes it in POS settings

// The nine kinds. who() = handles it by job; others can switch it on in Settings → Alerts.
export const KINDS = {
  kitchen: { label: 'New kitchen ticket', sub: 'Cooks and chefs', who: () => role() === 'chef' || staffJob('kitchen'), open: '#/tickets' },
  bar: { label: 'New bar ticket', sub: 'Bartenders and barbacks', who: () => staffJob('bar'), open: '#/tickets' },
  clear: { label: 'Table needs clearing', sub: 'Bussers, servers and hosts', who: () => staffJob('tables'), open: '#/tables' },
  pickup: { label: 'Order up (pick up)', sub: 'The server who took the order', who: () => true, fixed: true, open: '#/pos' },
  seated: { label: 'New guests in my section', sub: 'The server the host picked', who: () => canTake(), open: '#/pos' },
  late: { label: 'Check or ticket waiting too long', sub: 'Managers, plus the server or station', who: () => boss() || canTake() || role() === 'chef' || staffJob('kitchen') || staffJob('bar'), open: '#/pos' },
  message: { label: 'New message or problem-report reply', sub: 'Whoever it is for', who: () => true, open: '#/lounge' },
  schedule: { label: 'Swap or time-off request or answer', sub: 'Managers, and the person who asked', who: () => canSee('schedule'), open: '#/schedule' },
  stock: { label: '86 or low stock', sub: 'Chefs and managers (low stock), servers (86)', who: () => boss() || role() === 'chef' || canTake(), open: '#/stock' },
};

// This phone's choices (Settings → Alerts). Kinds that fit the person's job are on.
export const prefs = () => LS.get('alerts', {});
export const kindOn = (k) => { const p = prefs()[k]; return p === undefined ? KINDS[k].who() : !!p; };
export const soundOn = () => prefs().sound !== false;
export function setPref(k, v) { LS.set('alerts', { ...prefs(), [k]: v }); refreshAlerts(); }

// Acknowledged: guests seated for me (opened the check) and 86'd items (seen on Orders).
const acks = () => ({ seated: [], e86: {}, low: {}, ...LS.get('alertAck', {}) });
export function ackSeated(checkId) {
  const a = acks(); if (a.seated.includes(checkId)) return;
  a.seated = [...a.seated, checkId].slice(-200); LS.set('alertAck', a); refreshAlerts();
}
export async function ack86() {
  const P = await posSettings(); const a = acks();
  a.e86 = Object.fromEntries(Object.keys(P.eightySix || {}).map((k) => [k, 1])); LS.set('alertAck', a); refreshAlerts();
}

// Everything waiting for this person, as { key, kind, where, title, body }.
// where = the badge it adds to: pos, tickets, tables, stock or lounge.
export async function collect() {
  if (!session.profile) return [];
  const out = [], now = Date.now(), add = (x) => out.push(x);
  const P = await posSettings();
  const tickets = (await data.list('ticket')).filter((t) => !t.bumped);
  const lateT = (t) => now - t.at >= TICKET_LATE * 6e4;
  const station = (t) => (t.station === 'Bar' ? 'bar' : 'kitchen');
  // 1, 2: new kitchen and bar tickets for the people who make them.
  for (const t of tickets) if (kindOn(station(t))) add({ key: 't:' + t.id, kind: station(t), where: 'tickets', title: `New ${t.station.toLowerCase()} ticket`, body: `${t.checkName} · ${t.items.length} item${t.items.length > 1 ? 's' : ''}` });
  // 3: tables to clear.
  if (kindOn('clear')) for (const d of (await data.list('tablestate')).filter((x) => x.dirty)) add({ key: 'c:' + d.id + ':' + (d.at || ''), kind: 'clear', where: 'tables', title: 'Table needs clearing', body: d.name || 'A table was paid' });
  // 4: order up. Its banner and chime live in pos.js; here it only counts.
  for (const p of await myPickups()) add({ key: 'p:' + p.id, kind: 'pickup', where: 'pos', quiet: true });
  const checks = (await data.list('check')).filter((c) => !c.closed);
  // 5: guests seated in my section by the host, until I open the check.
  if (kindOn('seated')) {
    const seen = new Set(acks().seated);
    for (const c of checks) if (c.server === meId() && c.seatedBy && c.seatedBy !== meName() && !(c.items || []).length && !seen.has(c.id) && now - c.opened < 3 * 3600e3)
      add({ key: 's:' + c.id, kind: 'seated', where: 'pos', title: `${c.name} seated for you`, body: `${c.guests} guest${c.guests > 1 ? 's' : ''} · seated by ${c.seatedBy}` });
  }
  // 6: a check open too long (its server, and managers) or a ticket waiting too long.
  if (kindOn('late')) {
    const lim = (+P.checkLate || CHECK_LATE) * 6e4;
    for (const c of checks) if (now - c.opened >= lim && (boss() || c.server === meId()))
      add({ key: 'lc:' + c.id, kind: 'late', where: 'pos', title: `${c.name} open ${Math.round((now - c.opened) / 6e4)} min`, body: `${c.serverName || 'Server'}'s check` });
    for (const t of tickets.filter(lateT)) if (boss() || kindOn(station(t)))
      add({ key: 'lt:' + t.id, kind: 'late', where: 'tickets', title: `${t.station} ticket waiting ${Math.round((now - t.at) / 6e4)} min`, body: t.checkName });
  }
  // 7: new messages and problem-report replies (notices and phone approvals are added by app.js).
  if (kindOn('message')) {
    const n = (await unreadPosts()) + (await unseenReports());
    for (let i = 0; i < n; i++) add({ key: 'm:' + i, kind: 'message', where: 'lounge', quiet: true });
  }
  // 8: swap requests (managers) and answers (the person who asked).
  if (kindOn('schedule')) { const n = (await swapBadge()) + (await timeOffBadge()); /* RRA-139 */ for (let i = 0; i < n; i++) add({ key: 'w:' + i, kind: 'schedule', where: 'lounge', quiet: true }); }
  // 9: low stock (chefs, managers, the Admin) and newly 86'd items (servers).
  if (kindOn('stock')) {
    // An item counts until someone here opens Stock or Needed; it comes back if it goes low again.
    if (boss() || role() === 'chef' || prefs().stock) {
      const low = (await data.list('stock')).filter((x) => +x.par > 0 && +x.onHand < +x.par);
      const a = acks(), was = a.low || {};
      if (/^#\/(stock|needed)/.test(location.hash)) a.low = Object.fromEntries(low.map((x) => [x.id, 1]));
      else a.low = Object.fromEntries(low.filter((x) => was[x.id]).map((x) => [x.id, 1])); // forget items back above par
      if (JSON.stringify(a.low) !== JSON.stringify(was)) LS.set('alertAck', a);
      for (const s of low.filter((x) => !a.low[x.id])) add({ key: 'l:' + s.id, kind: 'stock', where: 'stock', title: 'Low stock', body: `${s.name}: ${+(+s.onHand).toFixed(2)} of ${s.par} ${s.unit || ''}`.trim() });
    }
    if (canTake()) {
      const a = acks().e86;
      for (const [id, v] of Object.entries(P.eightySix || {})) if (!a[id] && v?.by !== meName()) {
        const r = await data.get('recipe', id);
        add({ key: '86:' + id, kind: 'stock', where: 'pos', title: "86'd", body: `${r?.name || 'An item'} is out` });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------ showing them
let seen = null; // keys already chimed for, this visit
let extra = 0;   // notices and phone approvals, counted by app.js
let busy = null, again = false;
export function setLoungeExtra(n) { extra = n; refreshAlerts(); }

export function refreshAlerts() {
  if (busy) { again = true; return busy; }
  busy = render().catch(() => {}).finally(() => { busy = null; if (again) { again = false; refreshAlerts(); } });
  return busy;
}

async function render() {
  const list = await collect();
  const n = { pos: 0, tickets: 0, tables: 0, stock: 0, lounge: extra };
  const tix = new Set();
  for (const x of list) {
    if (x.where === 'tickets') { const id = x.key.split(':')[1]; if (tix.has(id)) continue; tix.add(id); } // a late ticket counts once
    n[x.where]++;
  }
  // Tabs that aren't shown add to the tab that is (a server's Tables are on Seating).
  const shown = (t) => { const a = document.querySelector(`#tabs a[data-tab="${t}"]`); return a && !a.hidden; };
  const tab = { ...n };
  if (!shown('tables') && shown('pos')) tab.pos += n.tables;
  let more = 0;
  for (const k of ['pos', 'tickets', 'tables']) if (!shown(k)) more += n[k];
  if (!shown('stock')) more += n.stock;
  tab.more = more;
  for (const b of $$('[data-alert]')) {
    const k = b.dataset.alert, v = b.closest('#tabs') ? tab[k] : n[k];
    b.hidden = !v; b.textContent = v > 99 ? '99+' : v || '';
  }
  // The number on the home-screen icon (iPhone 16.4+ home-screen apps, Android Chrome).
  const total = n.pos + n.tickets + n.tables + n.stock + n.lounge;
  try { if (total) navigator.setAppBadge?.(total)?.catch?.(() => {}); else navigator.clearAppBadge?.()?.catch?.(() => {}); } catch {}
  // Chime, buzz and phone notification for something new. Nothing on the first look.
  const keys = list.filter((x) => !x.quiet);
  if (!seen) { seen = new Set(keys.map((x) => x.key)); return; }
  const fresh = keys.filter((x) => !seen.has(x.key));
  keys.forEach((x) => seen.add(x.key));
  if (!fresh.length) return;
  if (soundOn()) chime();
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const f = fresh[0];
    navigator.serviceWorker?.ready.then((r) => r.showNotification(f.title + (fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ''), {
      body: f.body || '', tag: 'alert-' + f.kind, icon: BRAND.icon192, data: { url: KINDS[f.kind]?.open || '#/' },
    })).catch(() => {});
  }
}

export function chime() {
  try {
    navigator.vibrate?.([120, 60, 120]);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g = ctx.createGain(); g.gain.value = 0.18; g.connect(ctx.destination);
    [880, 1175].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.16); });
    setTimeout(() => ctx.close(), 800);
  } catch {}
}

export function startAlerts() {
  if (startAlerts.on) return; startAlerts.on = true;
  data.onChange(() => refreshAlerts());
  window.addEventListener('hashchange', () => refreshAlerts()); // opening Stock clears its badge
  setInterval(refreshAlerts, 30000); // waiting-too-long alerts come with time
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAlerts(); });
  refreshAlerts();
}

// A badge element for a menu row or tab.
export const badge = (k, cls = 'sbadge') => `<i class="${cls}" data-alert="${k}" hidden></i>`;

// ------------------------------------------------------------ Settings → Alerts
export async function alertsView() {
  const { setChrome, setTitle, view, $, toast } = await import('./ui.js');
  setChrome({ tab: 'more', back: true });
  setTitle('Alerts');
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const mine = Object.entries(KINDS).filter(([, k]) => k.who());
  const others = boss() ? Object.entries(KINDS).filter(([, k]) => !k.who()) : [];
  const row = ([id, k]) => `<div class="row"><span class="grow"><span class="title">${esc(k.label)}</span><span class="sub" style="white-space:normal">${esc(k.sub)}</span></span>${k.fixed ? '<span class="meta">Always on</span>' : `<button class="toggle ${kindOn(id) ? 'on' : ''}" type="button" data-k="${id}" aria-label="${esc(k.label)}"></button>`}</div>`;
  view.innerHTML = `
    <p class="muted small">A number shows on the tab, the menu and the app icon when something new needs you. These choices are saved on this phone only.</p>
    <div class="section-label">For your job</div>
    <div class="group">${mine.map(row).join('')}</div>
    ${others.length ? `<div class="section-label">Also send me</div><div class="group">${others.map(row).join('')}</div>` : ''}
    <div class="section-label">How</div>
    <div class="group">
      <div class="row"><span class="grow"><span class="title">Chime and buzz</span><span class="sub" style="white-space:normal">For something new while the app is open</span></span><button class="toggle ${soundOn() ? 'on' : ''}" type="button" id="al-sound" aria-label="Chime and buzz"></button></div>
      <div class="row"><span class="grow"><span class="title">Phone notifications</span><span class="sub" style="white-space:normal">${perm === 'granted' ? 'On. They show while the app is open in the background.' : perm === 'denied' ? 'Turned off for this app in your phone\'s settings.' : perm === 'unsupported' ? 'On iPhone, add the app to your Home Screen first.' : 'Show alerts while the app is in the background.'}</span></span>${perm === 'default' ? '<button class="btn small" type="button" id="al-perm">Turn on</button>' : ''}</div>
    </div>
    <p class="muted small">Alerts reach a phone while the app is open or in the background. A phone with the app fully closed gets them the next time it opens.</p>`;
  $$('[data-k]', view).forEach((b) => b.onclick = () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); setPref(b.dataset.k, on); });
  $('#al-sound').onclick = (e) => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); setPref('sound', on); if (on) chime(); };
  $('#al-perm')?.addEventListener('click', async () => { try { await Notification.requestPermission(); } catch {} toast(Notification.permission === 'granted' ? 'Phone notifications on' : 'Phone notifications are off'); alertsView(); });
}
