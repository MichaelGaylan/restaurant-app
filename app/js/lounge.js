// Employee lounge (RRA-053): the staff's home for the board, the schedule,
// today's tasks and the time clock. One tap from the landing page (RRA-054).
// Time clock and time sheets (RRA-055): staff clock in and out here; managers
// and the Admin see everyone's hours compiled by week, can fix a missed punch,
// and print or send the time sheet for payroll.

import * as data from './data.js';
import { $, $$, esc, view, LS, sheet, toast, setTitle, setChrome, session, copy, isWide, chip } from './ui.js';
import { canChange, canSee, myStaff, isHost, canTime } from './perms.js';
import { payKeyInfo } from './access.js';
import { unreadPosts, sendPost } from './board.js';
import { canSeePost, isPrivate } from './audience.js';
import { staffList, roleOf, pill, swapBadge, moveHistory, sameName } from './schedule.js';
import { printButtons, wirePrint } from './pdf.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const H = 3600000;
const DAY = 24 * H;
const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const d = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const hrs = (n) => `${(Math.round(n * 100) / 100).toFixed(2)} h`;
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const weekMs = (iso) => { const [y, m, dd] = iso.split('-').map(Number); return new Date(y, m - 1, dd).getTime(); };
const addDays = (iso, n) => { const [y, m, dd] = iso.split('-').map(Number); return data.isoDate(new Date(y, m - 1, dd + n)); };
const label = (iso) => { const [y, m, dd] = iso.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const punchHours = (p) => ((p.out || Date.now()) - p.in) / H;
export { canTime };

const punches = async () => (await data.list('punch')).sort((a, b) => a.in - b.in);
const openPunch = (all, staffId) => all.find((p) => p.staffId === staffId && !p.out);
const inWeek = (p, wk) => p.in >= weekMs(wk) && p.in < weekMs(addDays(wk, 7));

async function clock(me, all) {
  const open = openPunch(all, me.id);
  if (open) {
    open.out = Date.now();
    await data.put('punch', open);
    toast(`Clocked out · ${dur(open.out - open.in)}`);
  } else {
    await data.put('punch', { staffId: me.id, name: me.name, in: Date.now(), out: null });
    toast(`Clocked in at ${t(Date.now())}`);
  }
}

// The landing-page button (RRA-054).
export async function loungeButton() {
  const me = myStaff();
  const open = me ? openPunch(await punches(), me.id) : null;
  const unread = await unreadPosts();
  const swaps = canSee('schedule') ? await swapBadge() : 0; // RRA-080
  return `<a class="lounge-btn" href="#/lounge">
    <span class="lounge-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 10h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    <span class="grow"><b>Employee lounge</b><small>${open ? `On the clock since ${t(open.in)}` : 'Clock in · board · schedule · time sheet'}</small></span>
    ${swaps ? `<span class="swap-badge" title="Swap requests">⇄ ${swaps}</span>` : ''}${unread ? `<i class="sbadge">${unread}</i>` : ''}<span class="chev">›</span></a>`;
}

// ------------------------------------------------------------ lounge

export async function loungeView() {
  setChrome({ tab: 'lounge' });
  const me = myStaff();
  // RRA-076: this person's job position, in their role color.
  setTitle('Employee lounge', isHost() ? `<span class="pos-chip">${chip('Admin', 'purple')}</span>`
    : me?.position ? `<span class="pos-chip">${chip(me.position, roleOf(me).c)}</span>` : '');
  const all = await punches();
  const wk = data.weekStart();
  const open = me ? openPunch(all, me.id) : null;
  const mine = me ? all.filter((p) => p.staffId === me.id && inWeek(p, wk)) : [];
  const week = (await data.get('week', wk)) || { shifts: {} };
  const todayIdx = (new Date().getDay() + 6) % 7;
  const myShifts = me && (week.published || canChange('schedule')) ? week.shifts?.[me.id] || [] : [];
  const unread = await unreadPosts();
  const posts = canSee('board') ? (await data.list('post')).filter((p) => canSeePost(p) && !p.about?.report).sort((a, b) => b.at - a.at).slice(0, 3) : [];
  const notices = (session.notices || []).slice(0, 1);
  const items = await data.list('prepitem');
  const done = (await data.get('prepday', data.today()))?.done || {};
  const nDone = items.filter((i) => done[i.id]).length;
  const swaps = canSee('schedule') ? await swapBadge() : 0;
  const allSwaps = swaps ? (await data.list('swap')).filter((s) => s.status === 'asked' || (me && s.from === me.id)).sort((a, b) => b.at - a.at) : [];
  const firstSwap = (canChange('schedule') ? allSwaps.find((s) => s.status === 'asked') : null) || allSwaps.find((s) => me && s.from === me.id && s.status !== 'withdrawn') || allSwaps[0];
  const onClock = canTime() ? all.filter((p) => !p.out) : [];
  view.innerHTML = `<div class="lounge">
    <div class="card clock-card${open ? ' on' : ''}">
      ${me ? `<div class="clock-top"><div><div class="clock-state">${open ? 'On the clock' : 'Off the clock'}</div>
        <div class="muted small">${open ? `Since ${t(open.in)} · <span id="clock-run">${dur(Date.now() - open.in)}</span>` : `This week ${hrs(mine.reduce((s, p) => s + punchHours(p), 0))}`}</div></div>
        <button class="btn clock-btn${open ? ' out' : ''}" id="clock" type="button">${open ? 'Clock out' : 'Clock in'}</button></div>
        <a class="row nav" href="#/timesheet"><span class="grow">My time sheet</span><span class="meta">${hrs(mine.reduce((s, p) => s + punchHours(p), 0))} this week</span></a>`
    : `<p class="muted small" style="margin:0">${isHost() ? 'To use the time clock yourself, add your name in Settings → Staff (the same name as this phone).' : 'To use the time clock, ask a manager to add you in Settings → Staff with the same name as this phone.'}</p>`}
    </div>

    ${canSee('schedule') ? `<div class="card l-card"><div class="l-head"><b>My week</b><a href="#/schedule">Full schedule <span class="chev-i">›</span></a></div>
      ${me ? `<div class="myweek">${DAYS.map((dn, i) => `<div class="${i === todayIdx ? 'today' : ''}"><span>${dn}</span>${myShifts[i] ? pill(myShifts[i], roleOf(me)) : '<em>Off</em>'}</div>`).join('')}</div>`
      : '<p class="muted small">Your shifts show here once you are on the staff list.</p>'}
      ${me && !week.published && !canChange('schedule') ? '<p class="muted small">This week isn\'t published yet.</p>' : ''}
      ${swaps ? `<a class="row nav" href="#/schedule${firstSwap ? '/' + firstSwap.id : ''}"><span class="grow">Swap requests</span>${chip(`${swaps} ${canChange('schedule') ? 'waiting' : 'update' + (swaps > 1 ? 's' : '')}`, 'orange')}</a>` : ''}</div>` : ''}

    ${canSee('prep') ? `<a class="card l-card l-link" href="#/prep/lounge"><div class="l-head"><b>Today's tasks</b><span class="chev">›</span></div>
      <div class="bar${items.length ? ' todo' : ''}"><i style="width:${items.length ? Math.round((nDone / items.length) * 100) : 0}%"></i></div>
      <span class="muted small">${items.length ? `${nDone} of ${items.length} prep tasks done` : 'No prep tasks yet'}</span></a>` : ''}

    ${canSee('board') ? `<div class="card l-card"><div class="l-head"><b>Bulletin board</b><a href="#/board">${unread ? `${chip(`${unread} new`, 'orange')} ` : ''}Open <span class="chev-i">›</span></a></div>
      ${notices.map((n) => `<div class="l-post notice"><span class="who">${esc(n.from || 'Management')} · notice</span><b>${esc(n.title)}</b></div>`).join('')}
      ${posts.map((p) => `<a class="l-post" href="#/board"><span class="who">${esc(p.by)} · ${new Date(p.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}${isPrivate(p) ? ' · 🔒 Private' : ''}</span>${esc(p.text.slice(0, 140))}</a>`).join('') || (notices.length ? '' : '<p class="muted small">No posts yet.</p>')}
      ${canChange('board') ? `<div class="l-quick"><input type="text" id="l-post" placeholder="Write to everyone"><button class="btn small" id="l-send" type="button">Post</button></div>` : ''}</div>` : ''}

    ${canTime() ? `<div class="card l-card"><div class="l-head"><b>Time sheets</b><a href="#/timesheets">Everyone's hours <span class="chev-i">›</span></a></div>
      <span class="muted small">${onClock.length ? `On the clock now: ${onClock.map((p) => esc(p.name)).join(', ')}` : 'Nobody is on the clock right now.'}</span></div>` : ''}
  </div>`;
  $('#clock')?.addEventListener('click', async () => { await clock(me, all); loungeView(); });
  if (open) { clearInterval(loungeView.tick); loungeView.tick = setInterval(() => { const el = $('#clock-run'); if (el) el.textContent = dur(Date.now() - open.in); else clearInterval(loungeView.tick); }, 30000); }
  $('#l-send')?.addEventListener('click', async () => {
    const text = $('#l-post').value.trim();
    if (!text) return;
    await sendPost({ text, to: { kind: 'all' } });
    toast('Posted to everyone');
    loungeView();
  });
}

// ------------------------------------------------------------ time sheets

// Pay (RRA-055, RRA-085): overtime follows the pay rules in Settings. The
// default is hours over 40 in the week at 1.5 times the rate. Some states add
// daily overtime and double time.
export const PAY_PRESETS = {
  federal: { name: 'Federal (Georgia and most states)', weeklyAfter: 40, otX: 1.5, dailyAfter: 0, doubleAfter: 0, doubleX: 2 },
  california: { name: 'California', weeklyAfter: 40, otX: 1.5, dailyAfter: 8, doubleAfter: 12, doubleX: 2 },
  alaska: { name: 'Alaska', weeklyAfter: 40, otX: 1.5, dailyAfter: 8, doubleAfter: 0, doubleX: 2 },
  colorado: { name: 'Colorado', weeklyAfter: 40, otX: 1.5, dailyAfter: 12, doubleAfter: 0, doubleX: 2 },
};
export function payRules(settings) {
  const r = { preset: 'federal', ...PAY_PRESETS.federal, ...(settings?.payRules || {}) };
  return { ...r, weeklyAfter: +r.weeklyAfter || 40, otX: +r.otX || 1.5, dailyAfter: +r.dailyAfter || 0, doubleAfter: +r.doubleAfter || 0, doubleX: +r.doubleX || 2 };
}
const times = (n) => `${+(+n).toFixed(2)}×`;
export function rulesText(r) {
  return [`overtime after ${r.weeklyAfter} h a week`, r.dailyAfter ? `or ${r.dailyAfter} h a day` : '', `at ${times(r.otX)}`, r.doubleAfter ? `· double time after ${r.doubleAfter} h a day at ${times(r.doubleX)}` : ''].filter(Boolean).join(' ');
}
let RULES = payRules(null);
const loadRules = async () => { RULES = payRules(await data.settings()); return RULES; };
const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
// Split a week of punches into regular, overtime and double time hours.
export function splitHours(ps, r = RULES) {
  const byDay = {};
  for (const p of ps) { const k = data.isoDate(new Date(p.in)); byDay[k] = (byDay[k] || 0) + punchHours(p); }
  let reg = 0; let ot = 0; let dbl = 0;
  for (const h of Object.values(byDay)) {
    const d2 = r.doubleAfter ? Math.max(0, h - r.doubleAfter) : 0;
    const d1 = r.dailyAfter ? Math.max(0, h - d2 - r.dailyAfter) : 0;
    reg += h - d1 - d2; ot += d1; dbl += d2;
  }
  if (reg > r.weeklyAfter) { ot += reg - r.weeklyAfter; reg = r.weeklyAfter; }
  return { reg, ot, dbl };
}
function pay(ps, rate) {
  const { reg, ot, dbl } = splitHours(ps);
  return { reg, ot: ot + dbl, otOnly: ot, dbl, pay: rate ? reg * rate + ot * rate * RULES.otX + dbl * rate * RULES.doubleX : null };
}

function personBlock(st, ps, wk, can, rate) {
  const edit = !!can?.time;
  const total = ps.reduce((s, p) => s + punchHours(p), 0);
  const pp = pay(ps, rate);
  return { total, ...pp, html: `<div class="group acc-body ts-body">${can?.rates ? `<button class="row nav" type="button" data-rate="${st.id}"><span class="grow"><span class="title">Hourly rate</span>
      <span class="sub">${rate ? `${money(rate)} an hour · ${hrs(pp.reg)} regular${pp.otOnly ? ` + ${hrs(pp.otOnly)} overtime` : ''}${pp.dbl ? ` + ${hrs(pp.dbl)} double time` : ''}` : 'Not set. Tap to add it.'}</span></span>
      <span class="meta">${pp.pay !== null ? `<b>${money(pp.pay)}</b>` : ''}</span></button>` : ''}${ps.map((p) => `<div class="row"${edit ? ` data-punch="${p.id}"` : ''}>
      <span class="grow"><span class="title">${d(p.in)}</span><span class="sub">${t(p.in)} – ${p.out ? t(p.out) : 'on the clock'}${p.editedBy ? ` · fixed by ${esc(p.editedBy)}` : ''}</span></span>
      <span class="meta">${p.out ? hrs(punchHours(p)) : chip('Open', 'green')}</span></div>`).join('') || '<div class="row muted">No punches this week.</div>'}
      ${edit ? `<button class="row nav" type="button" data-addpunch="${st.id}"><span class="grow" style="color:var(--accent)">+ Add a missed shift</span></button>` : ''}</div>` };
}

function lines(people, wk, rates, withPay) {
  const out = [`Week of ${label(wk)} - ${label(addDays(wk, 6))}`, ...(withPay ? [`Pay rules: ${rulesText(RULES)}`] : []), ''];
  let grand = 0; let grandPay = 0;
  for (const { st, ps } of people) {
    const total = ps.reduce((s, p) => s + punchHours(p), 0);
    const rate = rates[st.id]; const pp = pay(ps, rate);
    grand += total; grandPay += pp.pay || 0;
    out.push(`# ${st.name}${st.position ? ` (${st.position})` : ''}: ${hrs(total)}${pp.ot ? ` (${hrs(pp.reg)} reg + ${hrs(pp.otOnly)} OT${pp.dbl ? ` + ${hrs(pp.dbl)} DT` : ''})` : ''}${withPay ? (rate ? ` x ${money(rate)}/h = ${money(pp.pay)}` : ' (no rate set)') : ''}`);
    for (const p of ps) out.push(`   ${d(p.in).padEnd(16)} ${t(p.in).padStart(8)} - ${(p.out ? t(p.out) : 'open').padStart(8)}   ${hrs(punchHours(p))}`);
    out.push('');
  }
  out.push(`Total, all staff: ${hrs(grand)}${withPay ? ` · pay ${money(grandPay)}` : ''}`);
  return out;
}

// One person's own hours.
export async function timesheetView() {
  await loadRules();
  setChrome({ tab: 'lounge', back: true });
  setTitle('My time sheet');
  const me = myStaff();
  if (!me) { view.innerHTML = '<div class="empty">Ask a manager to add you to the staff list to use the time clock.</div>'; return; }
  const wk = timesheetView.week || data.weekStart();
  const ps = (await punches()).filter((p) => p.staffId === me.id && inWeek(p, wk));
  const { total, html } = personBlock(me, ps, wk, null, 0);
  view.innerHTML = `${weekNav(wk)}
    <div class="ts-total card"><span class="muted small">Total this week</span><b>${hrs(total)}</b></div>
    ${html.replace('acc-body ', '')}
    <p class="muted small center">If a time is wrong, ask a manager to fix it.</p>`;
  wireWeek(wk, (w) => { timesheetView.week = w; timesheetView(); });
}

const weekNav = (wk) => `<div class="segmented"><button type="button" data-w="-7">‹ Last</button><button type="button" class="on">${label(wk)}–${label(addDays(wk, 6))}</button><button type="button" data-w="7">Next ›</button></div>`;
const wireWeek = (wk, go) => $$('[data-w]', view).forEach((b) => { b.onclick = () => go(addDays(wk, +b.dataset.w)); });

// Everyone's hours, compiled for managers and the Admin.
export async function timesheetsView() {
  await loadRules();
  setChrome({ tab: 'lounge', back: true });
  setTitle('Time sheets');
  if (!canTime()) { location.hash = '#/lounge'; return; }
  const wk = timesheetsView.week || data.weekStart();
  const staff = await staffList();
  const all = (await punches()).filter((p) => inWeek(p, wk));
  const people = staff.map((st) => ({ st, ps: all.filter((p) => p.staffId === st.id) }));
  // Punches from someone no longer on the staff list still count.
  for (const p of all) if (!staff.some((s) => s.id === p.staffId)) {
    let g = people.find((x) => x.st.id === p.staffId);
    if (!g) { g = { st: { id: p.staffId, name: `${p.name} (removed)`, was: p.name, removed: true }, ps: [] }; people.push(g); }
    g.ps.push(p);
  }
  const withHours = people.filter((x) => x.ps.length);
  const grand = all.reduce((s, p) => s + punchHours(p), 0);
  // Pay rates live in their own records, locked with the pay key.
  const seeRates = canSee('payrates');
  const editRates = canChange('payrates');
  const editTime = canChange('timesheets');
  const rates = seeRates ? Object.fromEntries((await data.list('payrate')).filter((r) => +r.rate > 0).map((r) => [r.staffId || r.id, +r.rate])) : {};
  const hasKey = !!(await payKeyInfo());
  const blocks = people.map(({ st, ps }) => ({ st, ps, b: personBlock(st, ps, wk, { time: editTime, rates: seeRates }, rates[st.id]) }));
  const grandPay = blocks.reduce((s, x) => s + (x.b.pay || 0), 0);
  const noRate = blocks.filter((x) => x.ps.length && !rates[x.st.id]).length;
  const dayHours = (ps, i) => ps.filter((p) => p.in >= weekMs(addDays(wk, i)) && p.in < weekMs(addDays(wk, i)) + DAY).reduce((s, p) => s + punchHours(p), 0);
  const open = LS.get('tsOpen', null);
  view.innerHTML = `${weekNav(wk)}
    ${hasKey ? '' : '<div class="hint small">This phone doesn\'t have the pay key yet, so it shows only hours made on this phone. A phone approved as Manager by the Admin gets it.</div>'}
    <div class="ts-total card"><div class="ts-row"><div><span class="muted small">Hours this week</span><b>${hrs(grand)}</b></div>${seeRates ? `<div><span class="muted small">Payroll this week</span><b>${money(grandPay)}</b></div>` : ''}</div>
      <span class="muted small">${withHours.length} of ${staff.length} people clocked in${seeRates && noRate ? ` · ${noRate} without an hourly rate` : ''}${seeRates ? ` · ${esc(rulesText(RULES))}${canChange('payrates') ? ' · <a href="#/settings">Pay rules</a>' : ''}` : ''}</span></div>
    ${isWide() ? `<div class="wtable-wrap"><table class="wtable"><thead><tr><th>Employee</th>${DAYS.map((dn, i) => `<th class="num">${dn} ${addDays(wk, i).slice(8)}</th>`).join('')}<th class="num">Hours</th><th class="num">OT</th>${seeRates ? '<th class="num">Rate</th><th class="num">Pay</th>' : ''}</tr></thead>
      <tbody>${blocks.map(({ st, ps, b }) => `<tr><td>${esc(st.name)}</td>${DAYS.map((_, i) => { const h = dayHours(ps, i); return `<td class="num">${h ? h.toFixed(2) : '<span class="muted">—</span>'}</td>`; }).join('')}<td class="num"><b>${b.total.toFixed(2)}</b></td><td class="num">${b.ot ? b.ot.toFixed(2) : '—'}</td>${seeRates ? `<td class="num">${rates[st.id] ? money(rates[st.id]) : '<span class="muted">—</span>'}</td><td class="num"><b>${b.pay !== null ? money(b.pay) : '—'}</b></td>` : ''}</tr>`).join('')}</tbody></table></div>
      <div class="section-label">Punches</div>` : ''}
    ${blocks.map(({ st, b }) => `
      <button class="acc-head${open === st.id ? ' open' : ''}" type="button" data-g="${st.id}"><span class="grow">${esc(st.name)}</span><span class="meta">${hrs(b.total)}${b.pay !== null ? ` · ${money(b.pay)}` : ''}</span></button>
      ${b.html.replace('<div class="group acc-body ts-body">', `<div class="group acc-body ts-body"${open === st.id ? '' : ' hidden'}>${st.removed && editTime ? `<div class="row no-print"><span class="grow muted small">No longer on the Staff list. Same person as someone who is?</span><button class="btn tonal small" type="button" data-merge="${st.id}">Merge…</button></div>` : ''}`)}`).join('') || '<div class="empty">No staff yet.</div>'}
    ${printButtons()}
    <button class="btn plain block no-print" id="copy" type="button">Copy to send</button>
    <p class="muted small center">${editTime ? 'Tap a punch to fix a time. ' : ''}${editRates ? 'Tap the hourly rate to change it. ' : ''}Totals count open punches up to now. Only managers the Admin allows can see this page.</p>`;
  wireWeek(wk, (w) => { timesheetsView.week = w; timesheetsView(); });
  $$('.acc-head', view).forEach((h) => {
    h.onclick = () => {
      const opening = !h.classList.contains('open');
      $$('.acc-head', view).forEach((x) => { x.classList.remove('open'); x.nextElementSibling.hidden = true; });
      if (opening) { h.classList.add('open'); h.nextElementSibling.hidden = false; }
      LS.set('tsOpen', opening ? h.dataset.g : null);
    };
  });
  const title = `Time sheets - week of ${label(wk)}`;
  wirePrint({ $, title, mono: true, getLines: () => lines(withHours, wk, rates, seeRates) });
  $('#copy').onclick = () => copy(lines(withHours, wk, rates, seeRates).join('\n'), 'Time sheet copied');
  $$('[data-rate]', view).forEach((b) => {
    b.onclick = async () => {
      if (!editRates) { toast('Only the Admin can let you change rates'); return; }
      const st = people.find((x) => x.st.id === b.dataset.rate).st;
      const v = await sheet({
        title: `${st.name} · hourly rate`, right: 'Save',
        body: `<label class="field"><span>Dollars an hour</span><input type="text" inputmode="decimal" id="rt" value="${rates[st.id] ?? ''}" placeholder="e.g. 15.50"></label>
          <p class="muted small">Only managers and the Admin can see rates. They are locked in the shared data so staff phones can't open them.</p>`,
        onMount: (api) => { api.onRight = () => api.close({ v: $('#rt', api.el).value.trim().replace('$', '') }); },
      });
      if (!v) return;
      await data.put('payrate', { id: st.id, staffId: st.id, rate: v.v === '' ? '' : +v.v || 0 });
      toast('Rate saved');
      timesheetsView();
    };
  });
  // RRA-092: move a removed person's punches onto someone on the Staff list.
  $$('[data-merge]', view).forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const g = people.find((x) => x.st.id === b.dataset.merge).st;
      const list = [...staff].sort((a, c) => (sameName(c.name, g.was) - sameName(a.name, g.was)) || a.name.localeCompare(c.name));
      const to = await sheet({ title: `Merge ${g.was}'s hours`, right: 'Merge',
        body: `<p class="small">Move all of ${esc(g.was)}'s punches (every week), pay rate and shifts to:</p>
          <label class="field"><span>Staff member</span><select id="mg-to">${list.map((s) => `<option value="${s.id}">${esc(s.name)}${sameName(s.name, g.was) ? ' (same name)' : ''}</option>`).join('')}</select></label>
          <p class="muted small">Use this when it's the same person, for example someone removed and then added back.</p>`,
        onMount: (api) => { api.onRight = () => api.close($('#mg-to', api.el).value); } });
      if (!to) return;
      const st = staff.find((s) => s.id === to);
      const n = await moveHistory(g.id, st);
      toast(`Moved ${n} punch${n === 1 ? '' : 'es'} to ${st.name}`);
      timesheetsView();
    };
  });
  $$('[data-punch]', view).forEach((row) => { row.onclick = () => punchDialog(all.find((p) => p.id === row.dataset.punch)); });
  $$('[data-addpunch]', view).forEach((b) => {
    b.onclick = () => { const st = people.find((x) => x.st.id === b.dataset.addpunch).st; punchDialog(null, st, wk); };
  });
}

const timeVal = (ms) => { const x = new Date(ms); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
const at = (iso, hm) => { const [y, m, dd] = iso.split('-').map(Number); const [hh, mm] = hm.split(':').map(Number); return new Date(y, m - 1, dd, hh, mm).getTime(); };

async function punchDialog(p, st, wk) {
  const day = p ? data.isoDate(new Date(p.in)) : (data.today() >= wk && data.today() <= addDays(wk, 6) ? data.today() : wk);
  const r = await sheet({
    title: p ? `${p.name} · fix time` : `${st.name} · add shift`, right: 'Save',
    body: `<label class="field"><span>Day</span><input type="date" id="pu-d" value="${day}"></label>
      <div class="facts" style="background:none">
        <label class="field" style="margin:0"><span>Clock in</span><input type="time" id="pu-in" value="${p ? timeVal(p.in) : '10:00'}"></label>
        <label class="field" style="margin:0"><span>Clock out</span><input type="time" id="pu-out" value="${p?.out ? timeVal(p.out) : p ? '' : '18:00'}"></label>
      </div>
      <p class="muted small">Leave Clock out empty if they are still on the clock. A clock-out earlier than the clock-in counts as after midnight.</p>
      ${p ? '<button class="btn plain block" type="button" id="pu-del" style="color:var(--danger)">Delete this punch</button>' : ''}
      <p id="pu-err" class="small" style="color:var(--danger)"></p>`,
    onMount: (api) => {
      $('#pu-del', api.el)?.addEventListener('click', () => api.close({ del: true }));
      api.onRight = () => {
        const dd = $('#pu-d', api.el).value; const i = $('#pu-in', api.el).value; const o = $('#pu-out', api.el).value;
        if (!dd || !i) { $('#pu-err', api.el).textContent = 'Pick a day and a clock-in time.'; return; }
        const tin = at(dd, i);
        let tout = o ? at(dd, o) : null;
        if (tout !== null && tout <= tin) tout += DAY;
        api.close({ tin, tout });
      };
    },
  });
  if (!r) return;
  if (r.del) { await data.remove('punch', p.id); toast('Punch deleted'); return timesheetsView(); }
  const doc = p ? { ...p } : { staffId: st.id, name: st.name };
  Object.assign(doc, { in: r.tin, out: r.tout, editedBy: session.profile.name });
  await data.put('punch', doc);
  toast('Saved');
  timesheetsView();
}
