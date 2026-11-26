// Restaurant kitchen app: screens and navigation. Names come from js/brand.js.

import {
  BRAND, APP_NAME, VERSION, BUILD, WHATS_NEW, ROOT_KEYS, CODE_OWNER_LINE, INACTIVITY_DAYS, INVITE_HOURS,
  WEB3FORMS_KEY, REPORT_PREFIX, NOTIFICATIONS_URL, brandText,
} from './config.js';
import * as access from './access.js';
import * as store from './store.js';
import * as data from './data.js';
import * as sync from './sync.js';
import { canSee, canChange, isHost, myStaff, setJobViews, jobAreas, jobAllows } from './perms.js';
import { findDuplicates, countDuplicates } from './dedupe.js';
import { reportsView, reportPopups, sendReportInApp, openReports } from './reports.js';
import { recipesView, recipeView, printView } from './recipes.js';
import { stockView, neededView, ordersView, vendorsView } from './stock.js';
import { boardView, unreadPosts } from './board.js';
import { prepView } from './prep.js';
import { scheduleView, staffView, ensureStaffFor, staffList, schedulePrintView, swapPopups, shiftTimesView, jobTitlesView, positionList } from './schedule.js';
import { eventsView, eventView, dueEvents, eventPopups } from './events.js';
import { costsView } from './costs.js';
import { loungeView, timesheetView, timesheetsView, canTime } from './lounge.js';
import { settingsView, listView, rolesView, personView, dedupeView } from './settings.js';
import { applyMenu, applyVendors, applySupplies } from './menu.js';
import { payrollView, payRunView, payRunDoneView, payHistoryView, myPayView, tipRulesView, paySettingsView } from './payroll.js';
import { payrollSettings, hasPayroll } from './paycalc.js';
import { posView, posCheckView, posPayView, ticketsView, posSalesView, posSettingsView, canOrder, canKitchen, canSales, posMenu, seatingView, startPickups, showPickups, tablesView, canSeat, canClear } from './pos.js';
import { giftCardsView } from './giftcards.js';
import { startAlerts, setLoungeExtra, alertsView, badge } from './alerts.js'; // RRA-137
import { timeOffPopups } from './timeoff.js'; // RRA-139
import { couponsView, couponView } from './coupons.js';
import { musicView } from './music.js';
import { clearDataView } from './cleardata.js';

import { $, $$, esc, view, dlg, LS, isIOS, standalone, toast, copy, share, pasteInto, sheet, setTitle, setChrome, fmtDate, session, wideMQ, THEMES, getTheme } from './ui.js';

// Header logo from the brand settings (BPAY-017).
document.getElementById('brand-logo')?.setAttribute('src', BRAND.logo);

const NOTICE_VERSION = 1;

let profile = null;
boardView.after = () => updateBadge();
// Requests from new phones waiting for this phone's approval (RRA-043).
const waiting = new Map();
let notices = [];


// ------------------------------------------------- startup screen (RRA-014)

function startupScreen() {
  const seen = LS.get('seenVersion', null);
  if (seen === VERSION) return Promise.resolve();
  const updated = !!seen;
  return new Promise((resolve) => {
    const splash = $('#splash');
    const video = $('#splash-video');
    const card = $('#splash-card');
    const skip = $('#splash-skip');
    if (BRAND.introVideo) video.src = BRAND.introVideo;
    splash.hidden = false;
    // Whoosh with the opening clip (RRA-048), first launch and updates only.
    // iPhone blocks sound until a tap: then it plays on the first tap instead.
    const whoosh = new Audio(new URL('../assets/whoosh.mp3', import.meta.url));
    whoosh.preload = 'auto';
    let whooshed = false;
    const playWhoosh = () => {
      if (whooshed) return;
      whoosh.play().then(() => { whooshed = true; }).catch(() => {});
    };
    splash.addEventListener('pointerdown', playWhoosh, { once: true });
    video.addEventListener('playing', playWhoosh, { once: true });
    let shown = false;
    const showCard = () => {
      if (shown) return;
      shown = true;
      video.pause();
      skip.hidden = true;
      video.style.transition = 'opacity .6s'; video.style.opacity = '0';
      // Every release since the one this phone last saw (newest first).
      const upto = WHATS_NEW.findIndex((w) => w.version === seen);
      const news = WHATS_NEW.slice(0, upto < 0 ? 1 : Math.max(upto, 1));
      card.innerHTML = `
        <img src="${esc(BRAND.icon512)}" alt="">
        <h2>${esc(APP_NAME)}</h2>
        <div class="ver">Version ${VERSION} · build ${BUILD}</div>
        ${updated
          ? `<p class="splash-h">What's new</p><div class="splash-notes" tabindex="0">${news.map((w) => `${news.length > 1 ? `<div class="splash-v">${esc(w.version)}</div>` : ''}<ul>${w.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}</div>`
          : `<p style="margin:16px 0 22px;color:rgba(255,255,255,.8)">${esc(BRAND.tagline)}</p>`}
        <button class="btn" type="button">${updated ? 'Continue' : 'Get started'}</button>`;
      card.hidden = false;
      $('button', card).onclick = () => {
        playWhoosh();
        LS.set('seenVersion', VERSION);
        splash.style.transition = 'opacity .35s'; splash.style.opacity = '0';
        setTimeout(() => { splash.hidden = true; splash.style.opacity = ''; resolve(); }, 350);
      };
    };
    video.onended = showCard;
    video.onerror = showCard;
    skip.onclick = showCard;
    setTimeout(showCard, 9000); // never get stuck if the clip stalls
    if (BRAND.introVideo) video.play().catch(showCard); // e.g. iPhone Low Power Mode blocks autoplay
    else showCard(); // no intro clip for this restaurant
  });
}

// ------------------------------------------- notices popup (RRA-020)

const NOTICE_HTML = `
  <ul class="notice-list">
    <li><b>Proprietary software.</b> ${esc(APP_NAME)} and the recipes in it belong to ${esc(BRAND.restaurant)}. They are for your work here only.</li>
    <li><b>Do not share it.</b> Don't forward invites, codes or screenshots of recipes, and don't let anyone else use the app on your phone.</li>
    <li><b>About email.</b> Messages sent by email, such as a problem report, could possibly (but unlikely) become public. Don't put private information in them.</li>
  </ul>`;

async function noticeGate() {
  if (LS.get('noticeAck', 0) >= NOTICE_VERSION) return;
  await sheet({
    title: 'Before you start', left: null, dismissable: false,
    body: `${NOTICE_HTML}<button class="btn block" id="ack" type="button" style="margin-top:12px">I understand</button>`,
    onMount: ({ close, el }) => { $('#ack', el).onclick = () => close(true); },
  });
  LS.set('noticeAck', NOTICE_VERSION);
}

async function emailNotice() {
  if (LS.get('emailAck', false)) return true;
  const ok = await sheet({
    title: 'About email', left: 'Cancel',
    body: `<p>Your report goes to the Admin and managers in the app, and out by email. Email could possibly (but unlikely) become public, so leave out private details like passwords or personal information.</p>
      <button class="btn block" id="ack" type="button" style="margin-top:16px">Send report</button>`,
    onMount: ({ close, el }) => { $('#ack', el).onclick = () => close(true); },
  });
  if (ok) LS.set('emailAck', true);
  return !!ok;
}

// ---------------------------------------- global notices (RRA-015)

async function loadNotices() {
  try {
    const r = await fetch(NOTIFICATIONS_URL, { cache: 'no-store' });
    if (r.ok) { notices = (await r.json()).messages || []; LS.set('noticesCache', notices); }
  } catch { notices = LS.get('noticesCache', []); }
  // RRA-123: {name} and friends in a notice become this restaurant's names.
  notices = notices.map((n) => ({ ...n, title: brandText(n.title), body: brandText(n.body), from: brandText(n.from) }));
  // RRA-089: notices someone removed stay hidden on their phone.
  const hidden = new Set(LS.get('hiddenNotices', []));
  session.notices = notices.filter((x) => !hidden.has(x.id));
  updateBadge();
  const popped = new Set(LS.get('popped', []));
  const fresh = notices.find((n) => !popped.has(n.id));
  if (fresh && profile && !dlg.open && (await data.settings()).popups !== false) {
    popped.add(fresh.id); LS.set('popped', [...popped]);
    await sheet({
      title: 'Notice', left: null, right: 'OK',
      body: `<p class="muted small">${esc(fresh.from || 'Management')} · ${esc(fresh.date || '')}</p><h2 style="margin-top:4px">${esc(fresh.title)}</h2><p>${esc(fresh.body)}</p>`,
    });
  }
}

function unreadCount() {
  const read = new Set(LS.get('read', []));
  const hidden = new Set(LS.get('hiddenNotices', []));
  return notices.filter((n) => !read.has(n.id) && !hidden.has(n.id)).length;
}

async function onRequest(iid, box) {
  if (waiting.has(iid)) return;
  const text = await access.openRequest(box);
  const req = await access.readRequest(text); // throws if used, expired or not ours
  waiting.set(iid, { iid, text, name: req.invite.name, at: Date.now(), restore: !!req.restore });
  updateBadge();
  if (location.hash.startsWith('#/team') && !dlg.open) teamView();
  else toast(req.restore ? `${req.invite.name} is asking to get back in. See More → Invite and approve phones.` : `${req.invite.name}'s phone is waiting for your approval`);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((r) => r.showNotification(APP_NAME, {
      body: `${req.invite.name}'s phone is waiting for your approval.`, tag: `req-${iid}`, icon: BRAND.icon192,
    })).catch(() => {});
  }
}

// RRA-134: a request someone else already handled leaves this list too.
function requestGone(iid) {
  if (!waiting.delete(iid)) return;
  updateBadge();
  if (location.hash.startsWith('#/team') && !dlg.open) teamView();
}
// RRA-134: manager and Admin phones leave their public sealing key where a
// locked-out phone can find it, so "Ask to get back in" reaches all of them.
const doorId = (ek) => profile?.iid || `a-${ek.slice(-20)}`;
async function openDoor() {
  if (!sync.enabled() || !profile) return;
  const ek = await access.myEcdhPublic();
  const flag = BRAND.dataPrefix + 'door';
  if (access.can(profile, 'invite')) { if (await sync.publishDoor(doorId(ek), ek).catch(() => false)) localStorage.setItem(flag, '1'); }
  else if (localStorage.getItem(flag)) { await sync.dropDoor(doorId(ek)); localStorage.removeItem(flag); }
}

async function updateBadge() {
  const n = unreadCount() + (profile ? await unreadPosts() : 0) + waiting.size;
  $('#bell-dot').hidden = !n;
  // RRA-137: the Lounge badges come from alerts.js (messages, report replies,
  // swaps); notices and phones waiting for approval are added here.
  setLoungeExtra(unreadCount() + waiting.size);
  // RRA-105: events coming up, on the sidebar and More.
  const ev = profile ? (await dueEvents().catch(() => [])).length : 0;
  for (const b of $$('#ev-badge, #more-ev-badge')) { b.hidden = !ev; b.textContent = ev; }
}

// Sidebar for tablets and computers (RRA-051): every section, no More tab.
// Payroll menu entries (RRA-095): known once settings are read.
async function payFlags() { const ok = hasPayroll(await payrollSettings()); renderSide.pay = ok; moreView.pay = ok; return ok; }
function renderSide() {
  const link = (r, label, extra = '') => `<a href="#/${r}" data-r="${r}"><span class="grow">${label}</span>${extra}</a>`;
  const items = [
    canSee('recipes') ? link('recipes', 'Recipes') : '',
    jobAreas() && canClear() ? link('tables', 'Tables', badge('tables')) : '',
    canSee('prep') ? link('prep', 'Prep') : '',
    canSee('stock') ? link('stock', 'Stock count') : '',
    canSee('stock') ? link('needed', 'Needed', badge('stock')) : '',
    canSee('orders') ? link('orders', 'Order guides') : '',
    link('lounge', 'Employee lounge', badge('lounge')),
    canSee('board') ? link('board', '<span class="sub-l">Bulletin board</span>') : '',
    canSee('schedule') ? link('schedule', '<span class="sub-l">Schedule</span>') : '',
    canTime() ? link('timesheets', '<span class="sub-l">Time sheets</span>') : link('timesheet', '<span class="sub-l">My time sheet</span>'),
    myStaff() ? link('mypay', '<span class="sub-l">My pay &amp; tips</span>') : '',
    renderSide.pay ? link('payroll', 'Payroll') : '',
    canOrder() ? link('pos', 'Orders (POS)', badge('pos')).replace('<a ', '<a data-pospop ') : '',
    canKitchen() ? link('tickets', '<span class="sub-l">Kitchen and bar screen</span>', badge('tickets')) : '',
    canSee('coupons') ? link('coupons', 'Coupons') : '',
    BRAND.giftCards?.url ? link('giftcards', 'Gift cards') : '',
    jobAllows('music') ? link('music', 'Music') : '',
    canSee('events') ? link('events', 'Events (BEOs)', '<i id="ev-badge" class="sbadge" hidden></i>') : '',
    canSee('costs') ? link('costs', 'Costs and waste') : '',
    '<hr>',
    link('settings', 'Settings'),
    access.can(profile, 'invite') ? link('team', 'Invite and approve', waiting.size ? `<span class="chip warn">${waiting.size}</span>` : '') : '',
    isHost() ? link('backup', 'Admin backup') : '',
    '<hr>',
    link('about', 'About and how-to'),
    link('whatsnew', "What's new"),
    link('more', 'More'),
  ];
  $('#side').innerHTML = `<div class="side-who"><b>${esc(profile.name)}</b><span>${esc(access.ROLES[profile.role] || profile.role)}</span></div>${items.join('')}`;
  updateBadge();
}


// ------------------------------------------------------------- More

function moreView() {
  setChrome({ tab: 'more' });
  setTitle('More');
  const daysLeft = INACTIVITY_DAYS;
  view.innerHTML = `
    <div class="card">
      <b>${esc(profile.name)}</b> <span class="chip">${esc(access.ROLES[profile.role] || profile.role)}</span>
      <p class="muted small">${profile.role === 'owner' ? 'Admin phone. Access does not expire.' : `Access stays on while you use it. It ends after ${daysLeft} days without opening the app.`}</p>
    </div>
    <div class="group">
      ${canOrder() ? '<a class="row" href="#/pos" data-pospop><span class="grow">Orders (POS)</span>' + badge('pos') + '</a>' : ''}
      ${canKitchen() ? '<a class="row" href="#/tickets"><span class="grow">Kitchen and bar screen</span>' + badge('tickets') + '</a>' : ''}
      ${canSales() ? '<a class="row" href="#/possales"><span class="grow">Today\'s sales</span></a>' : ''}
      ${canSee('coupons') ? '<a class="row" href="#/coupons"><span class="grow">Coupons</span></a>' : ''}
      ${BRAND.giftCards?.url ? '<a class="row" href="#/giftcards"><span class="grow">Gift cards</span></a>' : ''}
      ${canClear() ? '<a class="row" href="#/tables"><span class="grow">Tables to clear</span>' + badge('tables') + '</a>' : ''}
      ${jobAllows('music') ? '<a class="row" href="#/music"><span class="grow">Music</span></a>' : ''}
      ${moreView.pay ? '<a class="row" href="#/payroll"><span class="grow">Payroll</span></a>' : ''}
      ${myStaff() ? '<a class="row" href="#/mypay"><span class="grow">My pay &amp; tips</span></a>' : ''}
      ${canSee('schedule') ? '<a class="row" href="#/schedule"><span class="grow">Schedule</span></a>' : ''}
      ${canSee('events') ? '<a class="row" href="#/events"><span class="grow">Events (BEOs)</span><i id="more-ev-badge" class="sbadge" hidden></i></a>' : ''}
      ${canSee('costs') ? '<a class="row" href="#/costs"><span class="grow">Costs and waste</span></a>' : ''}
    </div>
    <div class="group">
      <a class="row" href="#/alerts"><span class="grow">Alerts</span><span class="meta">Badges, chime, notifications</span></a>
      <a class="row" href="#/settings"><span class="grow">Settings</span><span class="meta">${esc(THEMES[getTheme()])}</span></a>
      ${access.can(profile, 'invite') ? `<a class="row" href="#/team"><span class="grow">Invite and approve phones</span>${waiting.size ? `<span class="chip warn">${waiting.size} waiting</span>` : ''}</a>` : ''}
      ${isHost() ? `<a class="row" href="#/backup"><span class="grow">Admin backup</span>${LS.get('backupAt', 0) ? '' : '<span class="chip warn">Not made yet</span>'}</a>` : ''}
    </div>
    <div class="group">
      <a class="row" href="#/about"><span class="grow">About and how-to</span></a>
      <a class="row" href="#/whatsnew"><span class="grow">What's new</span><span class="meta">${VERSION}</span></a>
      <a class="row" href="#/report"><span class="grow">Report a problem</span></a>
      <button class="row nav" id="show-notice" type="button"><span class="grow">Notices of use</span></button>
    </div>
    <div class="group">
      <button class="row" id="leave" type="button" style="color:var(--danger)"><span class="grow">Remove access from this phone</span></button>
    </div>
    <p class="muted small center">${esc(APP_NAME)} ${VERSION} · build ${BUILD}</p>`;
  updateBadge();
  $('#show-notice').onclick = () => sheet({ title: 'Notices of use', left: null, right: 'Done', body: NOTICE_HTML });
  $('#leave').onclick = async () => {
    const ok = await sheet({ title: 'Remove access?', right: 'Remove', body: `<p>This deletes the app's data from this phone, including recipes saved here. You'll need a new invite to use it again.</p>${profile.role === 'owner' ? '<p class="hint">This is the Admin phone. Removing access deletes the Admin key. You can get back in only with an Admin backup, or by adding a new key to the app.</p>' : ''}` });
    if (!ok) return;
    await access.wipeAccess();
    localStorage.removeItem(BRAND.dataPrefix + 'expiredNotice');
    location.hash = ''; location.reload();
  };
}

// ------------------------------------------- keep access (RRA-037)

const KEEP_TIP = `always open ${esc(BRAND.shortName)} from its icon on your home screen${isIOS ? ', not from Safari' : ''}. Your access is saved inside that app on this phone. Removing the icon${isIOS ? ' or opening the site in Safari' : ''} starts with no access.`;

async function homeTip() {
  if (LS.get('homeTip', 0)) return;
  const host = isHost();
  const go = await sheet({
    title: 'Keep your access', left: null, right: host ? 'Later' : 'Got it',
    body: `<p>Please ${KEEP_TIP}</p>
      ${isIOS && !standalone ? '<p class="hint small">You are in Safari now. Tap Share, then <b>Add to Home Screen</b>, and use that icon from now on.</p>' : ''}
      ${host ? `<p><b>Admin:</b> make an Admin backup now. If this phone loses the app, the backup gets you back in without a new key.</p>
        <button class="btn block" id="mk" type="button">Make an Admin backup</button>` : ''}`,
    onMount: ({ close, el }) => { $('#mk', el)?.addEventListener('click', () => close('backup')); },
  });
  LS.set('homeTip', 1);
  if (go === 'backup') location.hash = '#/backup';
}

// ------------------------------------------------ Admin backup (RRA-035)

async function backupView() {
  if (!isHost()) { location.hash = '#/more'; return; }
  setChrome({ tab: 'more', back: true });
  setTitle('Admin backup');
  const list = (await access.hostBackups()).sort((a, b) => b.at - a.at);
  view.innerHTML = `
    <p class="small">An Admin backup lets you get back in as Admin on a new phone, or after the app was removed, without adding a new key to the app.</p>
    <div class="card">
      <label class="field" style="margin-top:0"><span>Backup password</span><input type="password" id="b-pw" autocomplete="new-password"></label>
      <label class="field"><span>Password again</span><input type="password" id="b-pw2" autocomplete="new-password"></label>
      <p class="muted small">At least 10 characters. Write it down somewhere safe. Without it the backup can't be opened, and nobody can reset it.</p>
      <button class="btn block" id="b-make" type="button">Make backup</button>
      <p id="b-err" class="small" style="color:var(--danger)"></p>
    </div>
    <div class="hint small">Keep the backup somewhere only you can reach, such as Notes, your password app or an email to yourself. Anyone with the backup <b>and</b> the password can act as Admin.</div>
    <div class="section-label">Backups made on this phone</div>
    <div class="group">${list.length ? list.map((b) => `<div class="row"><span class="grow"><span class="title">${fmtDate(b.at)}</span><span class="sub">id ${esc(b.bid)}</span></span></div>`).join('') : '<div class="row muted">None yet.</div>'}</div>
    <p class="muted small">If a backup is lost or shared by mistake, send its id to the app's developer so it can be added to the revoked list.</p>`;
  $('#b-make').onclick = async () => {
    const pw = $('#b-pw').value;
    if (pw.length < 10) { $('#b-err').textContent = 'Use at least 10 characters.'; return; }
    if (pw !== $('#b-pw2').value) { $('#b-err').textContent = "The two passwords don't match."; return; }
    const btn = $('#b-make'); btn.disabled = true; btn.textContent = 'Making backup…';
    let res;
    try { res = await access.createHostBackup(profile, pw); }
    catch (e) { $('#b-err').textContent = e.message; btn.disabled = false; btn.textContent = 'Make backup'; return; }
    LS.set('backupAt', Date.now());
    const text = `${APP_NAME} Admin backup (${res.bid}, ${new Date().toLocaleDateString()}). To restore: open the app from the home screen, tap "Restore from an Admin backup", paste this and enter the password.\n${res.text}`;
    await sheet({
      title: 'Backup ready', left: null, right: 'Done',
      body: `<p>Save this backup now. It is not kept anywhere else.</p>
        <button class="btn block" id="s" type="button">Save or send backup</button>
        <button class="btn plain block" id="c" type="button" style="margin-top:6px">Copy backup</button>`,
      onMount: ({ el }) => {
        $('#s', el).onclick = () => share(`${APP_NAME} Admin backup`, text);
        $('#c', el).onclick = () => copy(text, 'Backup copied');
      },
    });
    backupView();
  };
}

async function restoreSheet(prefill) {
  return sheet({
    title: 'Restore Admin', right: 'Restore',
    body: `<p class="small">Paste your Admin backup and enter its password.</p>
      <textarea id="r-text" placeholder="Paste the Admin backup" style="min-height:70px">${esc(prefill || '')}</textarea>
      <button class="btn tonal small" id="r-paste" type="button" style="margin-top:6px">Paste</button>
      <label class="field"><span>Backup password</span><input type="password" id="r-pw" autocomplete="current-password"></label>
      <p id="r-err" class="small" style="color:var(--danger)"></p>`,
    onMount: (api) => {
      $('#r-paste', api.el).onclick = () => pasteInto($('#r-text', api.el));
      api.onRight = async () => {
        $('#r-err', api.el).textContent = 'Checking…';
        try {
          const p = await access.restoreHostBackup($('#r-text', api.el).value, $('#r-pw', api.el).value);
          api.close(p);
        } catch (e) { $('#r-err', api.el).textContent = e.message; }
      };
    },
  });
}

// ---------------------------------------------------- About (RRA-012)

function aboutView() {
  setChrome({ tab: 'more', back: true });
  setTitle('About');
  view.innerHTML = `
    <div class="card center">
      <img src="${esc(BRAND.icon192)}" alt="" width="84" height="84" style="border-radius:20px">
      <h2 style="margin:10px 0 0">${esc(APP_NAME)}</h2>
      <p class="muted">Version ${VERSION} · build ${BUILD}</p>
      <p class="small muted">${esc(BRAND.restaurant)} · ${esc(BRAND.location)}</p>${BRAND.credit ? `<p class="small muted">${esc(BRAND.credit)}</p>` : ''}${CODE_OWNER_LINE ? `<p class="small muted">${esc(CODE_OWNER_LINE)}</p>` : ''}
    </div>
    <div class="section-label">How to use it</div>
    <div class="card small">
      <p><b>Recipes:</b> the dish archive and the house recipes (rubs, sauces, dressings). Tap <b>UPLOAD</b> or <b>NEW RECIPE</b> to add one. A dish can link to the house recipes it uses. Any recipe can be printed, at ×2 or ×4 batch.</p>
      <p><b>Prep:</b> today's prep list by station. Tap an item when it's done.</p>
      <p><b>Stock:</b> count with + and −, then Save count. Needed shows what's below par, and Order guides splits it by vendor.</p>
      <p><b>Board:</b> messages for everyone, the kitchen or managers, plus notices from management. A red dot means something new.</p>
      <p><b>Coupons:</b> managers make a coupon under More → Coupons and send it as a picture (QR code or barcode, with the offer printed under it) to text, email, print or post. At the table, tap <b>Add a coupon</b> on the check and scan it with the camera, or type the code. The discount comes off before tax. Military / veteran, first responder and senior discounts need no coupon: tap <b>Discounts</b> on the check and confirm you saw the guest's ID.</p>
      <p><b>More:</b> schedule, events, costs and waste, Settings, and this page.</p>
      <p><b>Access:</b> the app opens only on the phone a manager approved. It locks itself after ${INACTIVITY_DAYS} days without use.</p>
      <p><b>Install it:</b> on iPhone, tap Share, then Add to Home Screen. On Android, tap the menu, then Install app.</p>
      <p><b>Keep your access:</b> ${KEEP_TIP}</p>
      <p><b>Lost access?</b> On the Invite only screen, tap <b>Ask to get back in</b> and send the request to a manager. The Admin can restore from an Admin backup instead.</p>
    </div>
    <div class="group">
      <a class="row" href="#/whatsnew"><span class="grow">What's new</span></a>
      <a class="row" href="#/report"><span class="grow">Report a problem</span></a>
    </div>`;
}

function whatsNewView() {
  setChrome({ tab: 'more', back: true });
  setTitle("What's new");
  view.innerHTML = WHATS_NEW.map((w) => `
    <div class="card"><b>${esc(w.version)}</b> <span class="muted small">· build ${esc(w.build)} · ${esc(w.date)}</span>
    <ul>${w.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('');
}

// Report a problem → email via Web3Forms (no server).
async function sendReport({ subject, body }) {
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: `${REPORT_PREFIX} ${subject}`,
        from_name: APP_NAME,
        botcheck: '',
        message: `${subject}\n\n${body}`,
      }),
    });
    const j = await res.json();
    if (j && j.success) return 'sent';
    throw new Error('not sent');
  } catch {
    return 'failed';
  }
}

function reportView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Report a problem');
  view.innerHTML = `
    <p class="muted small">Tell us what went wrong. Your report goes to the Admin and managers in the app, where they can reply to you, and to the app's inbox by email, so leave out anything private.</p>
    <a class="row nav" href="#/reports" style="border-radius:12px;margin-bottom:8px"><span class="grow">My problem reports and replies</span></a>
    <label class="field"><span>What kind of problem?</span><select id="p-type">
      <option>Something isn't working</option><option>A recipe is wrong</option><option>Access or invite</option><option>Idea or request</option><option>Other</option></select></label>
    <label class="field"><span>Where in the app?</span><select id="p-where">
      <option>Recipes</option><option>Stock</option><option>Notices</option><option>Access / invites</option><option>Startup</option><option>Other</option></select></label>
    <label class="field"><span>What happened?</span><textarea id="p-body" placeholder="What you did, what you expected, what happened instead"></textarea></label>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" id="p-send" type="button">Send report</button>
    </div>
    <button class="btn plain block" id="p-copy" type="button" style="margin-top:8px">Copy report text</button>
    <p id="p-status" class="small center"></p>`;
  const compose = () => {
    const subject = `${$('#p-where').value} · ${$('#p-type').value}`;
    const body = `${$('#p-body').value.trim()}\n\n— ${profile.name} (${access.ROLES[profile.role] || profile.role})\nApp ${VERSION} · build ${BUILD}\n${navigator.userAgent}`;
    return { subject, body };
  };
  $('#p-copy').onclick = () => { const r = compose(); copy(`${REPORT_PREFIX} ${r.subject}\n\n${r.body}`, 'Report copied'); };
  $('#p-send').onclick = async () => {
    if (!$('#p-body').value.trim()) { $('#p-status').textContent = 'Please describe the problem first.'; return; }
    if (!(await emailNotice())) return;
    const btn = $('#p-send');
    btn.disabled = true; btn.textContent = 'Sending…';
    const r = compose();
    // RRA-088: the report also goes to the Admin and managers in the app.
    let inApp = false;
    try { await sendReportInApp({ type: $('#p-type').value, where: $('#p-where').value, text: $('#p-body').value.trim() }); inApp = true; } catch { /* email still goes */ }
    const result = await sendReport(r);
    btn.disabled = false; btn.textContent = 'Send report';
    if (result === 'sent' || inApp) {
      $('#p-body').value = '';
      $('#p-status').innerHTML = '<span style="color:var(--ok)">Sent. Thank you. You\'ll get a pop-up when someone replies.</span>';
    } else {
      copy(`${REPORT_PREFIX} ${r.subject}\n\n${r.body}`, 'Not sent, so the report was copied');
      $('#p-status').innerHTML = '<span style="color:var(--danger)">It couldn\'t be sent (maybe no signal). The report text was copied so you can paste it in a message to a manager.</span>';
    }
  };
}

// ------------------------------------------------ Team (RRA-018)

// RRA-133: the job they do, asked whenever someone is let in, so nobody ends
// up on the Line cook screens by mistake.
const jobOptions = (list, pick = '') => `<option value="">Choose their job…</option>${list.map((p) => `<option${p === pick ? ' selected' : ''}>${esc(p)}</option>`).join('')}`;
const autoJob = (role) => (role === 'manager' ? 'Manager' : role === 'chef' ? 'Chef' : '');

async function teamView(incoming) {
  if (!access.can(profile, 'invite')) { location.hash = '#/more'; return; }
  setChrome({ tab: 'more', back: true });
  setTitle('Team access');
  const invites = (await access.issuedInvites()).sort((a, b) => b.iat - a.iat);
  const jobs = await positionList();
  view.innerHTML = `
    <div class="section-label">1. Send an invite</div>
    <div class="card">
      <label class="field" style="margin-top:0"><span>Their name</span><input type="text" id="i-name" placeholder="e.g. Sam" autocomplete="off"></label>
      <label class="field"><span>Role</span><select id="i-role"><option value="staff">Staff</option><option value="chef">Chef</option>${access.can(profile, 'invite.manager') ? '<option value="manager">Manager (can invite and approve phones)</option>' : ''}</select></label>
      <label class="field" id="i-job-f"><span>Job</span><select id="i-job">${jobOptions(jobs)}</select></label>
      <button class="btn block" id="i-make" type="button">Create invite</button>
      <p class="muted small">Each invite works once, on one phone, within ${INVITE_HOURS} hours.</p>
    </div>
    ${waiting.size ? `<div class="section-label">Waiting for you</div>
    <div class="group">${[...waiting.values()].map((w) => `<button class="row nav" type="button" data-wait="${esc(w.iid)}"><span class="grow"><span class="title">${esc(w.name)}</span><span class="sub">${w.restore ? 'Asking to get back in' : 'Their phone sent a request'}</span></span><span class="chip warn">Check</span></button>`).join('')}</div>` : ''}
    <div class="section-label">2. Approve their phone</div>
    <div class="card">
      <p class="small muted" style="margin-top:0">When they open the invite, their request shows up above by itself${sync.enabled() ? '' : ' (with shared data on)'}. If it doesn't, they can send it by text: paste it here.</p>
      <textarea id="a-code" placeholder="Paste the request" style="min-height:70px">${esc(incoming || '')}</textarea>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn tonal" id="a-paste" type="button">Paste</button>
        <button class="btn" id="a-go" type="button">Check request</button>
      </div>
    </div>
    <div class="section-label">Invites from this phone</div>
    <div class="group">${invites.length ? invites.map((i) => `
      <div class="row"><span class="grow"><span class="title">${esc(i.name)} <span class="chip">${esc(access.ROLES[i.role])}</span></span>
      <span class="sub">${i.pos ? `${esc(i.pos)} · ` : ''}Sent ${fmtDate(i.iat)} · id ${esc(i.iid)}</span></span>
      ${i.status === 'approved' ? '<span class="chip ok">Approved</span>' : Date.now() > i.exp ? '<span class="chip">Expired</span>' : '<span class="chip warn">Waiting</span>'}</div>`).join('')
      : '<div class="row muted">None yet.</div>'}</div>
    <p class="muted small">To take access away right now, send the invite id to the app's developer so it can be added to the revoked list. Otherwise access ends by itself after ${INACTIVITY_DAYS} days without use.</p>`;

  // Chefs and managers get their job title from their role.
  const jobShown = () => { $('#i-job-f').hidden = ($('#i-role')?.value || 'staff') !== 'staff'; };
  $('#i-role').onchange = jobShown; jobShown();
  $('#i-make').onclick = async () => {
    const name = $('#i-name').value.trim();
    if (!name) { $('#i-name').focus(); return; }
    const role = $('#i-role')?.value || 'staff';
    const pos = autoJob(role) || $('#i-job').value;
    if (!pos) { toast('Choose their job'); $('#i-job').focus(); return; }
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    let code;
    try { code = await access.createInvite(profile, name, role, pos); }
    catch (e) { toast(e.message); return; }
    const link = `${location.origin}${location.pathname}#t=${code}`;
    const text = `${APP_NAME} invite for ${name}. Open this on your own phone (works once, for ${INVITE_HOURS} hours):\n${link}`;
    await sheet({
      title: 'Invite ready', left: null, right: 'Done',
      body: `<p>Send this to <b>${esc(name)}</b> by text message. It works once, only on the first phone that's approved.</p>
        <button class="btn block" id="s" type="button">Send invite</button>
        <button class="btn plain block" id="c" type="button" style="margin-top:6px">Copy whole message</button>
        ${codeBox(code, 'Invite')}
        <p class="muted small">The code alone works too: they paste it on the Invite only screen. Next: when they open it, their request shows up under “Waiting for you” and you get a note. Keep using the app meanwhile.</p>`,
      onMount: ({ el }) => {
        $('#s', el).onclick = () => share(`${APP_NAME} invite`, text);
        $('#c', el).onclick = () => copy(text, 'Invite copied');
        wireCodeBox(el, code, 'Invite');
      },
    });
    teamView();
  };
  $$('[data-wait]', view).forEach((b) => { b.onclick = () => { $('#a-code').value = waiting.get(b.dataset.wait)?.text || ''; $('#a-go').click(); }; });
  $('#a-paste').onclick = () => pasteInto($('#a-code'));
  $('#a-go').onclick = async () => {
    let req;
    try { req = await access.readRequest($('#a-code').value); }
    catch (e) { toast(e.message); return; }
    const known = req.restore ? (await staffList()).find((x) => x.name.trim().toLowerCase() === req.invite.name.trim().toLowerCase()) : null;
    const roles = ['staff', 'chef', ...(access.can(profile, 'invite.manager') ? ['manager'] : [])];
    const def = roles.includes(known?.role) ? known.role : 'staff';
    const jobs = await positionList(known?.position);
    // Older invites carry no job title: ask for it now (RRA-133).
    const askJob = req.restore || (!req.invite.pos && (req.invite.role || 'staff') === 'staff');
    const ok = await sheet({
      title: req.restore ? 'Let them back in' : 'Approve phone', right: 'Approve',
      body: `${req.restore
        ? `<p><b>${esc(req.invite.name)}</b> lost access on their phone and is asking to get back in.</p>
          <label class="field"><span>Role</span><select id="r-role">${roles.map((r) => `<option value="${r}"${r === def ? ' selected' : ''}>${esc(access.ROLES[r])}</option>`).join('')}</select></label>
          ${known ? '' : '<p class="hint small">No one with this name is on the staff list. Make sure you know who this is.</p>'}`
        : `<p><b>${esc(req.invite.name)}</b> · ${esc(access.ROLES[req.invite.role])}${req.invite.pos ? ` · ${esc(req.invite.pos)}` : ''}</p>`}
        ${askJob ? `<label class="field" id="r-job-f"><span>Job</span><select id="r-job">${jobOptions(jobs, known && !known.noJob ? known.position : '')}</select></label>` : ''}
        <p>Ask them to read the code on their phone. It must match:</p>
        <div class="code-big">${esc(req.deviceCode)}</div>
        <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="match" style="width:22px;height:22px"> The code on their phone matches</label>`,
      onMount: (api) => {
        const jobShown = () => { const f = $('#r-job-f', api.el); if (f) f.hidden = !!autoJob($('#r-role', api.el)?.value || req.invite.role); };
        $('#r-role', api.el)?.addEventListener('change', jobShown); jobShown();
        api.onRight = () => {
          if (!$('#match', api.el).checked) { toast('Check the code with them first'); return; }
          const role = $('#r-role', api.el)?.value || req.invite.role;
          const pos = askJob ? (autoJob(role) || $('#r-job', api.el)?.value || '') : '';
          if (askJob && !pos) { toast('Choose their job'); return; }
          api.close({ role, pos });
        };
      },
    });
    if (!ok) return;
    let code;
    try { code = await access.approve(profile, req, req.restore ? ok.role : undefined, ok.pos); }
    catch (e) { toast(e.message); return; }
    // RRA-134: the activation goes straight back to their phone, and the
    // request leaves every other manager's list.
    let sentBack = false;
    if (sync.enabled()) {
      try { const box = await access.sealReply(req, code); if (box) sentBack = await sync.postReply(req.invite.iid, box); } catch { /* they can paste it */ }
    }
    waiting.delete(req.invite.iid); sync.clearRequest(req.invite.iid); updateBadge();
    const text = `${APP_NAME} activation for ${req.invite.name}. Copy this whole message, then open the app and tap Paste:\n${code}`;
    await sheet({
      title: 'Approved', left: null, right: 'Done',
      body: `${sentBack ? `<p><b>Sent to ${esc(req.invite.name)}'s phone.</b> It opens by itself in a moment. If it doesn't, send this activation by text.</p>` : `<p>Send this activation back to <b>${esc(req.invite.name)}</b>. It only works on their phone.</p>`}
        <button class="btn block" id="s" type="button">Send activation</button>
        <button class="btn plain block" id="c" type="button" style="margin-top:6px">Copy whole message</button>
        ${codeBox(code, 'Activation')}`,
      onMount: ({ el }) => {
        $('#s', el).onclick = () => share(`${APP_NAME} activation`, text);
        $('#c', el).onclick = () => copy(text, 'Activation copied');
        wireCodeBox(el, code, 'Activation');
      },
    });
    teamView();
  };
}

// The code by itself (RRA-068): shown in a box with its own copy button, so it
// pastes cleanly without the message text or link around it.
const codeBox = (code, what) => `<div class="code-box">
    <div class="code-label">${esc(what)} code</div>
    <div class="code-text mono" id="code-only">${esc(code)}</div>
    <button class="btn tonal block" id="copy-code" type="button">Copy code only</button>
  </div>`;
const wireCodeBox = (el, code, what) => { const b = $('#copy-code', el); if (b) b.onclick = () => copy(code, `${what} code copied`); };

// --------------------------------------------- locked screens (RRA-018)

function installHint(code) {
  if (!isIOS || standalone) return '';
  return `<div class="hint small"><b>iPhone: install first.</b> Tap the Share button, then <b>Add to Home Screen</b>. Open ${esc(BRAND.shortName)} from your home screen and paste your code there.
    ${code ? `<button class="btn tonal small" id="copy-in" type="button" style="margin-top:8px">Copy my code</button>` : ''}</div>`;
}

async function lockedView(incoming) {
  setChrome({ locked: true });
  setTitle('');
  const pending = await access.pendingInvite();
  const ownerInfo = await access.ownerSetupInfo();
  const expired = localStorage.getItem(BRAND.dataPrefix + 'expiredNotice');

  if (ownerInfo && !ROOT_KEYS.includes(ownerInfo.pub)) {
    // RRA-064: never a dead end. A second device (an iPad, say) gets in with
    // an Admin backup or an invite; going back keeps this device's key.
    view.innerHTML = `
      <h2>Admin setup</h2>
      ${ROOT_KEYS.length ? `<div class="hint"><b>Already have an Admin phone?</b> This screen is only for replacing a lost Admin key. To use the app on another phone, iPad or computer, restore an Admin backup here, or get an invite from the Admin phone.</div>
      <button class="btn block" id="restore" type="button">Restore from an Admin backup</button>
      <button class="btn tonal block" id="back" type="button" style="margin-top:8px">Use an invite instead</button>
      <div class="section-label" style="margin-top:24px">New Admin key</div>` : ''}
      <p>This device made the Admin key below. The app opens for you once this key is added to the app and published.</p>
      <div class="card mono small">${esc(ownerInfo.pub)}</div>
      <button class="btn ${ROOT_KEYS.length ? 'plain' : ''} block" id="copy" type="button">Copy Admin key</button>
      <p class="muted small">The key is public: it lets other devices check that invites really come from you. The secret half never leaves this device.</p>
      ${ROOT_KEYS.length ? '' : '<button class="btn plain block" id="back" type="button">Go back</button>'}`;
    $('#copy').onclick = () => copy(ownerInfo.pub, 'Admin key copied');
    $('#back').onclick = async () => { await store.del('owner-setup'); lockedView(incoming); };
    $('#restore')?.addEventListener('click', async () => {
      const p = await restoreSheet();
      if (!p) return;
      profile = p; localStorage.removeItem(BRAND.dataPrefix + 'expiredNotice'); toast('Welcome back, Admin'); boot();
    });
    return;
  }

  if (pending) {
    view.innerHTML = `
      <h2>Almost there, ${esc(pending.name)}</h2>
      ${pending.posted
        ? `<p><b>Step 1.</b> Done: your request went to ${pending.restore ? 'every manager and the Admin. Any one of them can let you back in' : 'the manager who invited you'}. They get a note in the app. If they don't see it, send it by text too.</p>
          <button class="btn tonal block" id="send" type="button">Send request by text</button>`
        : `<p><b>Step 1.</b> Send your request to ${pending.restore ? 'a manager or the Admin' : 'the manager who invited you'}.</p>
          <p id="auto" class="small muted"></p>
          <button class="btn block" id="send" type="button">Send request</button>`}
      <details class="code-more"><summary>Request code only</summary>${codeBox(pending.request, 'Request')}</details>
      <p style="margin-top:18px"><b>Step 2.</b> Your manager will ask for this code. Read it to them:</p>
      <div class="code-big">${esc(pending.deviceCode)}</div>
      <p style="margin-top:18px"><b>Step 3.</b> ${pending.posted ? 'Keep this screen open: the app opens by itself once they approve. Or paste' : 'Paste'} the activation your manager sends back.</p>
      <textarea id="code" placeholder="Paste the activation" style="min-height:70px">${esc(incoming || '')}</textarea>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn tonal" id="paste" type="button">Paste</button>
        <button class="btn" id="go" type="button">Open the app</button>
      </div>
      <p id="err" class="small" style="color:var(--danger)"></p>
      <button class="btn plain block" id="restart" type="button">${pending.restore ? 'Start again' : 'Use a different invite'}</button>`;
    const req = `${APP_NAME} request from ${pending.name}. Paste this in the app under More → Invite and approve staff:\n${pending.request}`;
    $('#send').onclick = () => share(`${APP_NAME} request`, req);
    wireCodeBox(view, pending.request, 'Request');
    // RRA-134: "let me back in" goes to every manager and Admin phone.
    const sealed = pending.restore
      ? () => sync.doorKeys().then((keys) => access.sealToAll(pending, keys))
      : () => access.sealRequest(pending);
    if ((pending.rk || pending.restore) && !pending.posted && sync.enabled()) {
      $('#auto').textContent = pending.restore ? 'Sending your request to the managers and the Admin…' : 'Sending your request to your manager’s phone…';
      sealed()
        .then((box) => (box ? sync.postRequest(pending.iid, box) : false))
        .then(async (sent) => {
          if (!sent) { const a = $('#auto'); if (a && pending.restore) a.textContent = 'No manager phone could get it yet. Send it by text instead.'; return; }
          await store.put('pending', { ...pending, posted: Date.now() });
          if (!dlg.open && !$('#code').value) lockedView();
        })
        .catch(() => { const a = $('#auto'); if (a) a.textContent = 'Couldn’t send it automatically (no signal?). Send it by text instead.'; });
    }
    // RRA-134: the approval comes straight back; open the app when it does.
    if (pending.posted && sync.enabled() && lockedView.watching !== pending.iid) {
      lockedView.watching = pending.iid;
      sync.watchReply(pending.iid, async (box) => {
        try {
          const code = await access.openReply(box);
          profile = await access.activate(code);
          sync.clearReply(pending.iid);
          localStorage.removeItem(BRAND.dataPrefix + 'expiredNotice');
          toast(`Welcome${pending.restore ? ' back' : ''}, ${profile.name}`); boot();
        } catch { /* an old or wrong reply: they can still paste */ }
      }).catch(() => { lockedView.watching = null; });
    }
    $('#paste').onclick = () => pasteInto($('#code'));
    $('#go').onclick = async () => {
      try { profile = await access.activate($('#code').value); localStorage.removeItem(BRAND.dataPrefix + 'expiredNotice'); toast(`Welcome, ${profile.name}`); boot(); }
      catch (e) { $('#err').textContent = e.message; }
    };
    $('#restart').onclick = async () => { await store.del('pending'); lockedView(); };
    if (incoming) $('#go').click();
    return;
  }

  view.innerHTML = `
    ${expired ? `<div class="hint"><b>Your access ended</b> after ${INACTIVITY_DAYS} days without use, or a manager removed it. Tap <b>Ask to get back in</b> below: any manager or the Admin can let you back in.</div>` : ''}
    <h2>Invite only</h2>
    <p>${esc(APP_NAME)} is for the ${esc(BRAND.shortName)} team. A manager sends you an invite, and it opens on your phone only.</p>
    ${installHint(incoming)}
    <textarea id="code" placeholder="Paste your invite" style="min-height:70px">${esc(incoming || '')}</textarea>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn tonal" id="paste" type="button">Paste</button>
      <button class="btn" id="go" type="button">Continue</button>
    </div>
    <p id="err" class="small" style="color:var(--danger)"></p>
    ${ROOT_KEYS.length ? `<div class="card" style="margin-top:28px"><b>Had the app before?</b><p class="small muted">If this phone lost its access (for example, the app was removed), ask to get back in. A manager or the Admin approves it, with no new invite.</p>
      <label class="field"><span>Your name</span><input type="text" id="rs-name" placeholder="As the team knows you" autocomplete="name"></label>
      <button class="btn tonal block" id="rs-go" type="button">Ask to get back in</button></div>` : ''}
    <div class="card" style="margin-top:16px"><b>Admin setup</b><p class="small muted">${ROOT_KEYS.length
      ? `For the Admin only. If the Admin phone lost its key (for example, the app was removed and added again), make a new Admin key here and send it in. It does nothing until it is added to the app.`
      : `No Admin key is set yet. If you are the Admin (the app's administrator), set it up on your own phone${isIOS ? ', from the home screen app' : ''}.`}</p>
      ${ROOT_KEYS.length ? '<button class="btn block" id="restore" type="button">Restore from an Admin backup</button>' : ''}
      <button class="btn tonal block" id="owner" type="button" style="margin-top:8px">I'm the Admin: set up this phone</button></div>`;
  $('#rs-go')?.addEventListener('click', async () => {
    const n = $('#rs-name').value.trim();
    if (!n) { $('#rs-name').focus(); return; }
    await access.requestRestore(n);
    lockedView();
  });
  const doRestore = async (prefill) => {
    const p = await restoreSheet(prefill);
    if (!p) return;
    profile = p; localStorage.removeItem(BRAND.dataPrefix + 'expiredNotice'); toast('Welcome back, Admin'); boot();
  };
  $('#restore')?.addEventListener('click', () => doRestore());
  $('#copy-in')?.addEventListener('click', () => copy(incoming, 'Code copied'));
  $('#paste').onclick = () => pasteInto($('#code'));
  $('#go').onclick = async () => {
    const raw = $('#code').value;
    if (access.isBackupText(raw)) { doRestore(raw); return; }
    const t = access.parse(raw);
    try {
      if (t?.kind === 'act') throw new Error('This is an activation. Open your invite first.');
      await access.acceptInvite(raw);
      lockedView();
    } catch (e) { $('#err').textContent = e.message; }
  };
  // Opening an invite link goes straight on, except in iPhone Safari where
  // the person should install the app first (Safari and the home screen app
  // keep separate storage).
  if (incoming && !(isIOS && !standalone)) $('#go').click();
  $('#owner')?.addEventListener('click', async () => {
    const name = await sheet({
      title: 'Admin setup', right: 'Create key',
      body: `${ROOT_KEYS.length ? `<p class="hint"><b>The app already has an Admin.</b> To use it on another phone, iPad or computer, tap Cancel and use <b>Restore from an Admin backup</b> instead. Only make a new key if the Admin phone lost its key and there is no backup.</p>` : ''}<p>This makes the Admin key on this phone. Only do this once, on the Admin's own phone${isIOS ? ' (open the app from the home screen first)' : ''}.</p>
        <label class="field"><span>Your name</span><input type="text" id="o-name" value="Admin"></label>`,
      onMount: (api) => { api.onRight = () => api.close($('#o-name', api.el).value.trim() || 'Admin'); },
    });
    if (!name) return;
    await access.ownerSetup(name);
    lockedView();
  });
}

// ------------------------------------------------------------ routing

const routes = {
  recipes: () => recipesView(),
  recipe: (id) => recipeView(id),
  print: (id) => printView(id),
  prep: (arg) => prepView(arg),
  stock: () => stockView(false),
  'stock-items': () => stockView(true),
  needed: () => neededView(),
  orders: () => ordersView(),
  vendors: () => vendorsView(),
  board: () => boardView(),
  lounge: () => loungeView(),
  timesheet: () => timesheetView(),
  timesheets: () => timesheetsView(),
  // Payroll (RRA-095)
  payroll: (arg) => payrollView(arg),
  payrun: (arg) => payRunView(arg),
  'payrun-done': (id) => payRunDoneView(id),
  payhistory: () => payHistoryView(),
  mypay: () => myPayView(),
  tiprules: () => tipRulesView(),
  paysettings: () => paySettingsView(),
  // Point of sale (RRA-101)
  pos: () => posView(),
  poscheck: (id) => posCheckView(id),
  pospay: (id) => posPayView(id),
  tickets: () => ticketsView(),
  possales: () => posSalesView(),
  posset: () => posSettingsView(),
  seating: () => seatingView(), // RRA-114
  giftcards: () => giftCardsView(), // RRA-111
  coupons: () => couponsView(), // RRA-122
  coupon: (id) => couponView(id),
  music: () => musicView(), // RRA-109
  cleardata: () => clearDataView(), // RRA-106
  notices: () => boardView(),
  schedule: (arg) => scheduleView(arg),
  'schedule-print': (arg) => schedulePrintView(arg),
  staff: () => staffView(),
  tables: () => tablesView(), // RRA-132
  alerts: () => alertsView(), // RRA-137
  jobtitles: () => jobTitlesView(), // RRA-131
  shifts: () => shiftTimesView(),
  events: () => eventsView(),
  event: (id) => eventView(id),
  costs: () => costsView(),
  settings: () => settingsView(),
  list: (k) => listView(k),
  roles: () => rolesView(),
  person: (id) => personView(id),
  dedupe: () => dedupeView(),
  more: () => moreView(),
  about: () => aboutView(),
  whatsnew: () => whatsNewView(),
  report: () => reportView(),
  reports: () => reportsView(),
  team: (arg) => teamView(arg),
  backup: () => backupView(),
};

// Redraw the current screen when shared data arrives from another phone,
// unless a sheet is open or someone is typing.
let rt = null;
function debounceRoute() {
  clearTimeout(rt);
  rt = setTimeout(() => {
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!dlg.open && !typing) route();
  }, 400);
}

// Change role (RRA-066): the Admin or a manager left a new role for this phone
// in its staff record. Check it, switch, and say so.
async function checkRoleGrant() {
  const me = myStaff();
  if (!me?.grant || !profile || profile.role === 'owner') return;
  const next = await access.applyRoleChange(profile, me.grant);
  if (!next) return;
  const from = profile.role;
  profile = next; session.profile = next;
  await data.put('staff', { ...me, grantSeen: Date.now(), role: next.role });
  if (access.can(profile, 'invite')) sync.onInbox(onRequest); else if (from === 'manager') sync.onInbox(null);
  if (from !== next.role) openDoor(); // RRA-134
  if (next.role === 'manager') await sync.reopenPrivate();
  if (from === 'manager' && next.role !== 'manager') {
    // Others' hours and every pay rate leave this phone (only here, not for the team).
    for (const r of await data.list('payrate')) await data.applyRemote('payrate', r.id, null);
    for (const p of await data.list('punch')) if (p.staffId !== me.id) await data.applyRemote('punch', p.id, null);
    // Payroll (RRA-095): everyone else's pay leaves too; their own stays.
    for (const c of ['payrun', 'possales']) for (const d of await data.list(c)) await data.applyRemote(c, d.id, null);
    for (const c of ['paystub', 'advance', 'tipshare']) for (const d of await data.list(c)) if (d.staffId !== me.id) await data.applyRemote(c, d.id, null);
  }
  if (from !== next.role) {
    sheet({ title: 'Your role changed', left: null, right: 'OK', body: `<p>You're now <b>${esc(access.ROLES[next.role])}</b>. The app has updated what you can see and change.</p>` });
  }
}

// Admin devices check in so a new pay key can reach all of them (RRA-066).
async function adminPayKeyCheck() {
  if (profile?.role !== 'owner') return;
  const s = await data.settings(); const ek = await access.myEcdhPublic(); const dev = await access.myPublicKey();
  let pk = await access.payKeyInfo();
  if (s.payBox && s.payPub && pk?.pub !== s.payPub && s.payBox.pub === s.payPub) { if (await access.adoptPayKey(s.payBox)) pk = await access.payKeyInfo(); }
  const next = { ...s };
  let dirty = false;
  if ((s.adminEks || {})[dev] !== ek) { next.adminEks = { ...(s.adminEks || {}), [dev]: ek }; dirty = true; }
  if (pk && !s.payPub) { next.payPub = pk.pub; dirty = true; }
  if (dirty) await data.saveSettings(next);
}

// RRA-087: offer the one-tap duplicate clean-up when there is something to merge.
async function offerDedupe() {
  if (dlg.open || !$('#splash').hidden) return setTimeout(offerDedupe, 4000);
  const n = countDuplicates(await findDuplicates());
  if (!n || LS.get('dedupeAsked', 0) === n) return;
  LS.set('dedupeAsked', n);
  const go = await sheet({ title: 'Duplicates found', right: 'Review', left: 'Later',
    body: `<p>There are <b>${n}</b> duplicate entries in stock, recipes, vendors or saved prep. You can merge them in one tap and keep the counts, pars, vendors and prices.</p>` });
  if (go) location.hash = '#/dedupe';
}

// Job views (RRA-132): the bottom tabs, the first screen and which screens open
// follow the person's job title. Chefs, managers and the Admin as before.
const ROUTE_JOB = { recipes: 'recipes', recipe: 'recipes', print: 'recipes', prep: 'prep', stock: 'stock', 'stock-items': 'stock', needed: 'stock', orders: 'stock', vendors: 'stock', board: 'board', schedule: 'schedule', 'schedule-print': 'schedule', events: 'events', event: 'events', music: 'music' };
function homeRoute() {
  if (!jobAreas()) return 'recipes';
  return canSeat() ? 'pos' : canClear() ? 'tables' : canKitchen() ? 'tickets' : canSee('prep') ? 'prep' : canSee('recipes') ? 'recipes' : 'lounge';
}
function applyTabs() {
  const limited = !!jobAreas();
  const show = (t, on) => { const a = $(`#tabs a[data-tab="${t}"]`); if (a) a.hidden = !on; };
  show('pos', limited && canSeat());
  show('tables', limited && canClear() && !canSeat());
  show('tickets', limited && canKitchen());
  show('recipes', !limited || canSee('recipes'));
  show('prep', !limited || canSee('prep'));
  show('stock', !limited || canSee('stock'));
}
async function route() {
  if (!profile) return;
  let [, name = '', arg] = location.hash.match(/^#\/([^/]+)\/?(.*)$/) || [];
  session.staff = await staffList(); // permissions (RRA-002) read this
  setJobViews((await data.settings()).jobViews);
  if (!name) name = homeRoute();
  // RRA-090: this phone's person was removed from the team. Lock it.
  if (profile.role !== 'owner' && profile.iid && (await data.settings()).removed?.[profile.iid]) {
    await access.wipeAccess(); profile = null; session.profile = null; location.hash = ''; location.reload(); return;
  }
  await checkRoleGrant();
  if (isHost()) await adminPayKeyCheck();
  await payFlags();
  renderSide();
  applyTabs();
  const at = location.hash;
  if (jobAreas() && ROUTE_JOB[name] && !jobAllows(ROUTE_JOB[name])) {
    setChrome({ tab: '', back: true }); setTitle('Not part of your job');
    view.innerHTML = `<div class="empty">🔒 This part of the app isn't used by your job (${esc(myStaff()?.position || 'Staff')}).<br><span class="small">The Admin sets what each job sees in Settings → People → Job titles.</span></div><a class="btn block" href="#/${homeRoute()}">Go to my start screen</a>`;
    return;
  }
  await (routes[name] || routes[homeRoute()] || routes.recipes)(arg ? decodeURIComponent(arg) : undefined);
  // RRA-078: swap conflicts for managers, and a manager's question for the requester.
  if (location.hash === at && !dlg.open && $('#splash').hidden && (await swapPopups().catch(() => false) || await timeOffPopups().catch(() => false) || await reportPopups().catch(() => false) || await eventPopups().catch(() => false)) && location.hash === at) (routes[name] || routes.recipes)(arg ? decodeURIComponent(arg) : undefined);
  // A slow screen can finish after a quicker tap: show what the address says.
  if (location.hash !== at && !dlg.open) route();
}

$('#btn-back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/' + homeRoute()));
$('#btn-bell').onclick = () => { location.hash = '#/board'; };
// RRA-114: Orders (POS) in the menu opens the Orders popup (Seating and the current orders).
document.addEventListener('click', (e) => { const a = e.target.closest('a[data-pospop]'); if (!a || !profile) return; e.preventDefault(); posMenu(); });
window.addEventListener('hashchange', route);
// Turning a tablet or resizing a window switches between the two layouts.
wideMQ.addEventListener('change', () => { if (!dlg.open) route(); });

// A code can arrive in the link (#t=...). Take it out of the address bar.
function takeIncoming() {
  const m = location.hash.match(/^#t=(.+)$/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return decodeURIComponent(m[1]);
}

async function boot() {
  const incoming = takeIncoming();
  await access.loadRevocations();
  profile = await access.currentProfile();
  if (access.isExpired() && profile?.role !== 'owner') {
    await access.wipeAccess();
    profile = null;
  }
  session.profile = profile;
  await startupScreen();
  if (!profile) {
    // Revoked activation on this phone: clear it so the phone can be invited again.
    if (await store.get('profile')) { await access.wipeAccess(); }
    return lockedView(incoming);
  }
  access.touch();
  await ensureStaffFor(profile);
  await access.ensureTeamKey(profile);
  // The Admin phone makes the pay key and shares its public half (RRA-055).
  if (profile.role === 'owner' && await access.ensurePayKey(profile)) {
    const s = await data.settings(); const pk = await access.payKeyInfo();
    // A newer pay key made on another Admin device wins (RRA-066).
    if (s.payPub !== pk.pub && !(s.payBox && s.payBox.pub === s.payPub)) await data.saveSettings({ ...s, payPub: pk.pub });
  }
  if (!boot.wired) {
    boot.wired = true;
    if (access.can(profile, 'invite')) sync.onInbox(onRequest);
    sync.onInboxGone(requestGone);
    openDoor();
    sync.start(profile, () => { if (location.hash.startsWith('#/settings')) route(); });
    data.onChange((coll, remote) => { if (remote) debounceRoute(); });
    data.onChange(() => updateBadge());
    startPickups(); // RRA-124: order-up alerts
    startAlerts(); // RRA-137: badges for new work
  }
  // RRA-087: add starter data only after the shared data has arrived, so a
  // second Admin device (an iPad) never adds it all a second time.
  // RRA-142: if the shared data takes longer than 8 seconds to load (a big
  // team, a slow connection), the starter data and menu updates still run as
  // soon as it has loaded, instead of waiting for the next full restart.
  const starters = async () => {
    const opt = { shared: sync.enabled(), host: profile.role === 'owner' };
    await data.seed(opt);
    const added = await applyMenu(opt);
    await applyVendors(opt);
    await applySupplies(opt);
    if (added?.dishes || added?.sections) toast(`Menu update: ${[added.sections ? `${added.sections} new section${added.sections > 1 ? 's' : ''}` : '', added.dishes ? `${added.dishes} new item${added.dishes > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')} added to Recipes`);
    if (canChange('settings')) setTimeout(() => offerDedupe(), 1500);
  };
  if (!sync.enabled() || await sync.whenSynced()) await starters();
  else sync.whenSynced(36e5).then((ok) => { if (ok) starters().then(() => { if (/^#\/(recipes?|pos|poscheck|list)/.test(location.hash)) route(); }); });
  await noticeGate();
  await homeTip();
  if (incoming && access.parse(incoming)?.kind === 'req') { location.hash = '#/team'; return teamView(incoming); }
  if (!location.hash || location.hash === '#') location.hash = '#/recipes'; else route();
  loadNotices();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && profile) { access.touch(); loadNotices(); }
});

// Offline support and update prompt.
if ('serviceWorker' in navigator && BRAND.teamId !== 'preview') { // the setup wizard's preview runs without one
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // An update left waiting by an older version: let it take over now.
    if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage('skipWaiting');
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) nw.postMessage('skipWaiting');
      });
    });
    // Look for a new version whenever the app comes back to the front.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // Reload only when an update takes over, not on the very first install.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
}

boot();
