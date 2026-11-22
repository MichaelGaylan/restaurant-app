// Staff scheduling (RRA-009) and the staff list (Settings → Staff).

import * as data from './data.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome, session, isWide, LS } from './ui.js';
const chipHtml = (t, k) => `<span class="chip${k ? ' ' + k : ''}">${esc(t)}</span>`;
import { canChange, myStaff, isHost, canTime, level } from './perms.js';
import { ROLES, myEcdhPublic, myPublicKey } from './access.js';
import { printButtons, wirePrint } from './pdf.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const POSITIONS = ['Chef', 'Line cook', 'Prep cook', 'Dishwasher', 'Server', 'Bartender', 'Host stand', 'Manager'];
export const staffList = async () => (await data.list('staff')).sort(data.byName);

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return data.isoDate(new Date(y, m - 1, d + n));
}
// Role groups and colors for the schedule (RRA-052), from each person's position.
export const ROLE_GROUPS = [
  { k: 'Kitchen', l: 'K', c: 'teal', pos: ['Chef', 'Line cook', 'Prep cook', 'Dishwasher'] },
  { k: 'Bartender', l: 'B', c: 'orange', pos: ['Bartender'] },
  { k: 'Host', l: 'H', c: 'green', pos: ['Host stand'] },
  { k: 'Manager', l: 'M', c: 'purple', pos: ['Manager'] },
  { k: 'Server', l: 'S', c: 'blue', pos: ['Server'] },
  { k: 'Team', l: 'T', c: 'gray', pos: [] },
];
export const roleOf = (st) => ROLE_GROUPS.find((g) => g.pos.includes(st?.position)) || ROLE_GROUPS[ROLE_GROUPS.length - 1];
const roleByKey = (k) => ROLE_GROUPS.find((g) => g.k === k) || ROLE_GROUPS[ROLE_GROUPS.length - 1];
const isOff = (v) => /^(off|time ?off|pto|vac)/i.test(String(v || '').trim());
// A shift pill: role letter badge and times, or TIME OFF.
export const pill = (v, g) => (isOff(v) ? '<span class="spill off">TIME OFF</span>'
  : `<span class="spill c-${g.c}"><i>${g.l}</i><span>${esc(v)}</span></span>`);
const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// RRA-091: the team's own quick shift buttons and close time (Settings →
// Shift times). One list for everyone, kept in the team settings.
export const DEFAULT_SHIFTS = ['8-2', '10-6', '11-7', '4-cl'].map((t) => ({ t, role: '' }));
let CLOSE = 23;
export async function shiftTimes() {
  const s = await data.settings();
  CLOSE = +s.closeAt || 23;
  return { list: Array.isArray(s.shiftTimes) && s.shiftTimes.length ? s.shiftTimes : DEFAULT_SHIFTS, closeAt: CLOSE };
}
const hourName = (h) => { const x = h % 24; return `${x % 12 || 12} ${x < 12 ? 'AM' : 'PM'}`; };

// Hours in a shift like 10-6, 8-2, 4-cl or 10:30-4. Close (cl) is the close
// time in Shift times (11 PM unless changed); a start before 7 is in the
// afternoon (4-cl is 4 PM to close).
export function shiftHours(v) {
  if (!v || isOff(v)) return 0;
  const m = String(v).toLowerCase().match(/(\d{1,2})(?::(\d\d))?\s*(?:am?|pm?)?\s*[-–to ]+\s*(cl\w*|\d{1,2})(?::(\d\d))?/);
  if (!m) return 0;
  let a = +m[1] + (+m[2] || 0) / 60;
  if (a < 7) a += 12;
  let b = m[3].startsWith('cl') ? CLOSE : +m[3] + (+m[4] || 0) / 60;
  while (b <= a) b += 12;
  const h = b - a;
  return h > 0 && h <= 16 ? h : 0;
}

// RRA-078: why a swap can't simply go through. The person covering already
// works that day, has time off, or would go over 40 hours that week.
export function swapConflicts(r, week) {
  if (!r?.to || !week) return [];
  const out = [];
  const theirs = week.shifts?.[r.to] || [];
  const v = theirs[r.dayIndex];
  if (isOff(v)) out.push(`${r.toName || 'They'} has time off that day`);
  else if (v) out.push(`${r.toName || 'They'} already works that day (${v})`);
  const shift = week.shifts?.[r.from]?.[r.dayIndex] || '';
  const total = theirs.reduce((t, x, i) => t + (i === r.dayIndex ? 0 : shiftHours(x)), 0) + shiftHours(shift);
  if (total > 40) out.push(`${r.toName || 'They'} would work ${Math.round(total * 10) / 10} hours that week (over 40)`);
  return out;
}

async function approveSwap(r) {
  const cur = await data.get('swap', r.id);
  if (cur && cur.status !== 'asked') { toast(cur.status === 'withdrawn' ? `${r.fromName} removed this request.` : 'Already decided.'); return; }
  const w = (await data.get('week', r.week)) || { id: r.week, shifts: {} };
  w.shifts ||= {};
  if (r.to) {
    w.shifts[r.to] ||= Array(7).fill('');
    w.shifts[r.to][r.dayIndex] = w.shifts[r.from]?.[r.dayIndex] || '';
    if (w.shifts[r.from]) w.shifts[r.from][r.dayIndex] = '';
    await data.put('week', w);
  }
  r.status = 'approved'; r.decidedBy = session.profile?.name; await data.put('swap', r);
  toast(r.to ? 'Swap approved and the schedule updated' : 'Approved. Assign the cover on the schedule.');
}
async function declineSwap(r) { r.status = 'declined'; r.decidedBy = session.profile?.name; await data.put('swap', r); toast('Swap declined'); }

// Ask the requester a private question about their swap (uses RRA-075).
async function askAboutSwap(r) {
  const q = await sheet({
    title: `Ask ${r.fromName}`, right: 'Send',
    body: `<p class="muted small" style="margin-top:0">Only ${esc(r.fromName)} and you see this. It goes to their message board as a private message.</p>
      <textarea id="sq" style="min-height:80px" placeholder="e.g. Can you cover Thursday instead?"></textarea>`,
    onMount: (api) => { api.onRight = () => { const t = $('#sq', api.el).value.trim(); if (t) api.close(t); }; },
  });
  if (!q) return false;
  const { sendPost } = await import('./board.js');
  await sendPost({ text: `About your swap request (${r.day}): ${q}`, to: { kind: 'person', person: r.from }, about: { swap: r.id } });
  r.question = { at: Date.now(), by: session.profile?.name }; await data.put('swap', r);
  toast(`Question sent to ${r.fromName}`);
  return true;
}

// RRA-081: the requester's answer to a manager's question, kept on the swap
// request so every approver sees it (flag), not only the one who asked.
export async function recordSwapAnswer(swapId, text) {
  const r = await data.get('swap', swapId);
  if (!r || r.status !== 'asked') return;
  r.answer = { text, at: Date.now(), by: session.profile?.name };
  await data.put('swap', r);
}
const when = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const answerHtml = (r) => (r.answer ? `<div class="swap-flag">🚩 <b>Reply received</b> from ${esc(r.answer.by || r.fromName)} · ${esc(when(r.answer.at))}<br>"${esc(r.answer.text)}"</div>` : '');

// The pop-up an approver sees when they open the app: a swap request that
// conflicts, or one whose requester answered a question. Approve, Deny or Ask.
export async function swapConflictPopup(r, conflicts) {
  const act = await sheet({
    title: r.answer && !conflicts.length ? 'Swap request: reply received' : 'Swap request conflict', left: 'Later', right: null,
    body: `<p style="margin-top:0"><b>${esc(r.fromName)}</b> asks <b>${esc(r.toName || 'anyone')}</b> to cover <b>${esc(r.day)}</b>.${r.note ? `<br><span class="muted">"${esc(r.note)}"</span>` : ''}</p>
      ${conflicts.length ? `<div class="hint small" style="color:var(--danger)">${conflicts.map((c) => esc(c)).join('<br>')}</div>` : ''}
      ${r.question ? `<p class="muted small">${esc(r.question.by || 'A manager')} asked a question ${esc(when(r.question.at))}.</p>` : ''}
      ${answerHtml(r)}
      <div class="btn-row" style="margin-top:12px;flex-wrap:wrap">
        <button class="btn" type="button" data-a="ok">Approve</button>
        <button class="btn danger" type="button" data-a="no">Deny</button>
        <button class="btn tonal" type="button" data-a="ask">Ask a question</button>
      </div>
      <a class="small" href="#/schedule/${r.id}" data-a="go">Open the request ›</a>`,
    onMount: (api) => { $$('[data-a]', api.el).forEach((b) => { b.onclick = (e) => { e.preventDefault(); api.close(b.dataset.a); }; }); },
  });
  if (act === 'ok') await approveSwap(r);
  else if (act === 'no') await declineSwap(r);
  else if (act === 'ask') await askAboutSwap(r);
  else if (act === 'go') location.hash = `#/schedule/${r.id}`;
  return act;
}

// Who can approve swaps, and the swaps that need this phone's attention (RRA-080).
const canApprove = () => canChange('schedule');
const mySwapSeen = () => new Set(LS.get('swapSeen', []));
export async function swapBadge() {
  const all = await data.list('swap');
  const me = myStaff();
  const seen = mySwapSeen();
  let n = 0;
  if (canApprove()) n += all.filter((s) => s.status === 'asked').length;
  if (me) n += all.filter((s) => s.from === me.id && (s.status === 'asked' ? !canApprove() : (s.status === 'approved' || s.status === 'declined') && !seen.has(`d:${s.id}:${s.status}`))).length;
  return n;
}

// On opening the app: approvers get conflicting swap requests and answers
// to questions; the requester gets a manager's question, and the decision.
const laterThisVisit = new Set();
export async function swapPopups() {
  const seen = mySwapSeen();
  const mark = (k) => { seen.add(k); LS.set('swapSeen', [...seen].slice(-300)); };
  await shiftTimes();
  const swaps = (await data.list('swap')).sort((a, b) => a.at - b.at);
  if (canApprove()) {
    for (const r of swaps.filter((s) => s.status === 'asked')) {
      // Later: ask again next time the app opens. Asked a question: wait for the answer.
      const key = r.answer ? `a:${r.id}:${r.answer.at}` : `c:${r.id}`;
      if (seen.has(key) || seen.has(`c:${r.id}`) && !r.answer || laterThisVisit.has(key)) continue;
      const c = r.to ? swapConflicts(r, await data.get('week', r.week)) : [];
      if (!c.length && !r.answer) continue;
      laterThisVisit.add(key);
      const act = await swapConflictPopup(r, c);
      if (act === 'ask' || act === 'go' || r.answer) mark(key);
      if (act === 'ask') mark(`c:${r.id}`);
      return true;
    }
  }
  const me = myStaff();
  // RRA-079: the decision on my swap request.
  for (const r of swaps.filter((s) => me && s.from === me.id && (s.status === 'approved' || s.status === 'declined'))) {
    const key = `d:${r.id}:${r.status}`;
    if (seen.has(key)) continue;
    const ok = r.status === 'approved';
    const go = await sheet({
      title: ok ? 'Swap approved' : 'Swap declined', left: 'OK', right: 'Open',
      body: `<p style="margin-top:0;font-size:1.05rem">${ok ? '✅' : '⛔'} Your swap request for <b>${esc(r.day)}</b>${r.toName ? ` with ${esc(r.toName)}` : ''} was <b>${ok ? 'approved' : 'declined'}</b>${r.decidedBy ? ` by ${esc(r.decidedBy)}` : ''}.</p>
        <p class="muted small">${ok ? (r.to ? 'The schedule has been updated.' : 'A manager will put the cover on the schedule.') : 'Your shift stays on the schedule. Talk to a manager if you still need the day.'}</p>`,
    });
    mark(key); // only once they've seen and closed it
    if (go) location.hash = `#/schedule/${r.id}`;
    return true;
  }
  const { canSeePost, sentByMe, myId } = await import('./audience.js');
  const mid = myId();
  for (const p of (await data.list('post')).filter((x) => x.about?.swap && x.to?.person === mid && !sentByMe(x) && canSeePost(x))) {
    const key = `q:${p.id}`;
    if (seen.has(key)) continue;
    const reply = await sheet({
      title: 'Question about your swap', left: 'Later', right: 'Reply',
      body: `<p style="margin-top:0"><b>${esc(p.by)}</b> asks:</p><div class="msg private" style="margin:0">${esc(p.text)}</div>
        <textarea id="sr" style="min-height:70px;margin-top:10px" placeholder="Your answer (the managers deciding on your swap see it)"></textarea>`,
      onMount: (api) => { api.onRight = () => { const t = $('#sr', api.el).value.trim(); if (t) api.close(t); }; },
    });
    mark(key);
    if (reply) {
      p.replies = [...(p.replies || []), { by: session.profile.name, byId: mid, at: Date.now(), text: reply }];
      await data.put('post', p);
      await recordSwapAnswer(p.about.swap, reply);
      toast('Reply sent');
    }
    return true;
  }
  return false;
}

const label = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' }); };

export async function scheduleView(focus) {
  setChrome({ tab: 'lounge', back: true });
  // RRA-082: #/schedule/<swap id> opens the week of that request and scrolls to it.
  const focusSwap = focus ? await data.get('swap', focus) : null;
  if (focusSwap?.week) scheduleView.week = focusSwap.week;
  const change = canChange('schedule');
  const { list: quick } = await shiftTimes();
  const quickFor = (role) => quick.filter((x) => !x.role || x.role === role).map((x) => x.t);
  const wk = scheduleView.week || data.weekStart();
  const staff = await staffList();
  const week = (await data.get('week', wk)) || { id: wk, shifts: {}, published: false };
  const me = myStaff();
  // Waiting requests, plus my own decided ones from this week on (RRA-079), and the one asked for.
  const swaps = (await data.list('swap')).filter((s) => s.status === 'asked' || (me && s.from === me.id && s.status !== 'withdrawn' && s.week >= data.weekStart()) || s.id === focus).sort((a, b) => a.at - b.at);
  const conflictsOf = {};
  for (const r of swaps) conflictsOf[r.id] = r.status === 'asked' ? swapConflicts(r, r.week === wk ? week : await data.get('week', r.week)) : [];
  const STATUS = { approved: chipHtml('Approved', 'ok'), declined: chipHtml('Declined', 'danger'), withdrawn: chipHtml('Removed', '') };
  setTitle('Schedule', change ? `<button class="btn plain small" id="pub" type="button">${week.published ? 'Unpublish' : 'Publish'}</button>` : '');
  const visible = change || week.published;
  week.open ||= Array.from({ length: 7 }, () => []);
  const today = DAYS.findIndex((_, i) => addDays(wk, i) === data.isoDate(new Date()));
  if (scheduleView.day === undefined || scheduleView.dayWeek !== wk) { scheduleView.day = Math.max(0, today); scheduleView.dayWeek = wk; }
  const day = scheduleView.day;
  // Staff grouped under their role band, in the order of ROLE_GROUPS.
  const bands = ROLE_GROUPS.map((g) => ({ g, people: staff.filter((st) => roleOf(st) === g) })).filter((b) => b.people.length);
  const cell = (st, i) => {
    const v = week.shifts?.[st.id]?.[i] || '';
    return v ? pill(v, roleOf(st)) : change ? '<span class="add">+</span>' : '';
  };
  const openCell = (i) => `${(week.open[i] || []).map((o, j) => `<button type="button" class="spill-btn" data-open="${i}:${j}">${pill(o.t, roleByKey(o.role))}</button>`).join('')}${change ? `<button type="button" class="add" data-addopen="${i}">+</button>` : ''}`;
  const who = (st) => `<span class="who"><span class="av c-${roleOf(st).c}">${esc(initials(st.name))}</span><span><b>${esc(st.name)}</b><small>${esc(st.position || 'No position set')}</small></span></span>`;
  // Tablet and computer: the week across the top (RRA-052).
  const weekGrid = () => `<div class="wtable-wrap"><table class="wsched">
    <thead><tr><th class="who-h">${staff.length} staff</th>${DAYS.map((d, i) => `<th${i === today ? ' class="today"' : ''}><b>${d}</b><span>${label(addDays(wk, i))}</span></th>`).join('')}</tr></thead>
    <tbody><tr class="open-row"><td><b>Open shifts</b></td>${DAYS.map((_, i) => `<td>${openCell(i)}</td>`).join('')}</tr></tbody>
    ${bands.map(({ g, people }) => `<tbody><tr class="band c-${g.c}"><td colspan="8">${g.k}</td></tr>
      ${people.map((st) => `<tr${me && me.id === st.id ? ' class="me"' : ''}><td>${who(st)}</td>${DAYS.map((_, i) => `<td${change ? ` data-s="${st.id}" data-d="${i}"` : ''}>${cell(st, i)}</td>`).join('')}</tr>`).join('')}</tbody>`).join('')}
  </table></div>`;
  // Phone: one day at a time with a day picker, same colors and badges.
  const dayList = () => `<div class="daypick">${DAYS.map((d, i) => `<button type="button" data-day="${i}" class="${i === day ? 'on' : ''}${i === today ? ' today' : ''}"><b>${d}</b><span>${addDays(wk, i).slice(8).replace(/^0/, '')}</span></button>`).join('')}</div>
    <div class="section-label">Open shifts</div>
    <div class="group"><div class="row open-day">${(week.open[day] || []).length || change ? openCell(day) : '<span class="muted small">None</span>'}</div></div>
    ${bands.map(({ g, people }) => `<div class="band-label c-${g.c}">${g.k}</div>
      <div class="group">${people.map((st) => `<div class="row${me && me.id === st.id ? ' me' : ''}"${change ? ` data-s="${st.id}" data-d="${day}"` : ''}>${who(st)}<span class="grow"></span>${cell(st, day) || '<span class="muted small">Off</span>'}</div>`).join('')}</div>`).join('')}`;
  view.innerHTML = `
    <div class="segmented"><button type="button" data-w="-7">‹ Last</button><button type="button" class="on">${label(wk)}–${label(addDays(wk, 6))}</button><button type="button" data-w="7">Next ›</button></div>
    ${change && !week.published ? '<div class="hint small">Draft: staff can\'t see this week until you tap Publish.</div>' : ''}
    ${visible && staff.length ? (isWide() ? weekGrid() : dayList()) : visible ? '' : '<div class="empty">This week isn\'t published yet.</div>'}
    ${!staff.length ? `<div class="empty">No staff yet.${change ? ' Add people below.' : ''}</div>` : ''}
    ${swaps.length ? `<div class="section-label">Swap requests</div><div class="group">${swaps.map((r) => `
      <div class="row swap-row${r.id === focus ? ' focus' : ''}" id="swap-${r.id}" data-swap="${r.id}"><span class="grow"><span class="title">${esc(r.fromName)} asks ${esc(r.toName || 'anyone')} to cover${conflictsOf[r.id].length ? ' <span class="chip warn">Conflict</span>' : ''}${r.answer && r.status === 'asked' && (change || (me && r.from === me.id)) ? ' <span class="chip flag">🚩 Reply</span>' : ''}</span><span class="sub">${esc(r.day)}${r.note ? ' · ' + esc(r.note) : ''}${conflictsOf[r.id].map((c) => `<br><span style="color:var(--danger)">${esc(c)}</span>`).join('')}</span>
        ${(change || (me && r.from === me.id)) && r.status === 'asked' ? answerHtml(r) : ''}</span>
      <span class="swap-acts">${r.status !== 'asked' ? STATUS[r.status] || ''
        : `${change ? `<button class="btn tonal small" data-q type="button">Ask</button><button class="btn small" data-ok type="button">OK</button><button class="btn danger small" data-no type="button">No</button>` : '<span class="chip warn">Waiting</span>'}${me && r.from === me.id ? '<button class="btn plain small danger-text" data-rmswap type="button">Remove</button>' : ''}`}</span></div>`).join('')}</div>` : ''}
    <div class="group" style="margin-top:14px">
      ${me && week.published ? '<button class="row nav" id="ask" type="button"><span class="grow">Ask for a shift swap</span></button>' : ''}
      ${change ? `<a class="row" href="#/staff"><span class="grow">Add or remove staff</span><span class="meta">${staff.length}</span></a>` : ''}
      ${change ? '<a class="row" href="#/shifts"><span class="grow">Shift times</span><span class="meta">Quick buttons</span></a>' : ''}
      ${staff.length ? '<button class="row nav" id="print-weeks" type="button"><span class="grow">Print schedule</span></button>' : ''}
    </div>
    <p class="muted small center">${change ? 'Tap a day to set a shift, like 10-6 or 4-cl (close), or time off. Colors follow each person\'s position in Staff.' : 'Ask a manager about changes.'}</p>`;
  $$('[data-day]', view).forEach((b) => { b.onclick = () => { scheduleView.day = +b.dataset.day; scheduleView(); }; });
  const saveWeek = async () => { await data.put('week', week); scheduleView(); };
  $$('[data-addopen]', view).forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const d = +b.dataset.addopen;
      const r = await sheet({
        title: `Open shift · ${DAYS[d]} ${label(addDays(wk, d))}`, right: 'Add',
        body: `<label class="field"><span>Shift</span><input type="text" id="os-t" placeholder="e.g. 4-cl"></label>
          <div class="btn-row">${quick.map((x) => `<button class="btn tonal small" type="button" data-oq="${esc(x.t)}" data-or="${esc(x.role || '')}">${esc(x.t)}${x.role ? ` · ${esc(x.role)}` : ''}</button>`).join('')}</div>
          <label class="field"><span>Role</span><select id="os-r">${ROLE_GROUPS.map((g) => `<option value="${g.k}">${g.k}</option>`).join('')}</select></label>`,
        onMount: (api) => {
          $$('[data-oq]', api.el).forEach((q) => { q.onclick = () => { $('#os-t', api.el).value = q.dataset.oq; if (q.dataset.or) $('#os-r', api.el).value = q.dataset.or; }; });
          api.onRight = () => { const t = $('#os-t', api.el).value.trim(); if (t) api.close({ t, role: $('#os-r', api.el).value }); }; },
      });
      if (!r) return;
      (week.open[d] ||= []).push(r);
      saveWeek();
    };
  });
  $$('[data-open]', view).forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      if (!change) { toast('Ask a manager to take this shift'); return; }
      const [d, j] = b.dataset.open.split(':').map(Number);
      const o = week.open[d][j];
      const fit = staff.filter((st) => roleOf(st).k === o.role);
      const r = await sheet({
        title: `Open shift · ${DAYS[d]} ${o.t}`, right: 'Assign',
        body: `<label class="field"><span>Give it to</span><select id="os-who">${[...fit, ...staff.filter((st) => !fit.includes(st))].map((st) => `<option value="${st.id}">${esc(st.name)} (${roleOf(st).k})</option>`).join('')}</select></label>
          <button class="btn plain block" type="button" id="os-del" style="color:var(--danger)">Remove open shift</button>`,
        onMount: (api) => {
          $('#os-del', api.el).onclick = () => api.close({ del: true });
          api.onRight = () => api.close({ id: $('#os-who', api.el).value });
        },
      });
      if (!r) return;
      week.open[d].splice(j, 1);
      if (r.id) { week.shifts ||= {}; week.shifts[r.id] ||= Array(7).fill(''); week.shifts[r.id][d] = o.t; }
      saveWeek();
    };
  });
  $$('[data-w]', view).forEach((b) => { b.onclick = () => { scheduleView.week = addDays(wk, +b.dataset.w); scheduleView(); }; });
  $('#print-weeks')?.addEventListener('click', async () => {
    const n = await sheet({
      title: 'Print schedule', right: 'Next',
      body: `<p class="small">Starts with the week of ${label(wk)}.</p>
        <label class="field"><span>How many weeks?</span><select id="pw-n">${[1, 2, 3, 4, 6, 8].map((x) => `<option value="${x}"${x === 2 ? ' selected' : ''}>${x} week${x > 1 ? 's' : ''}</option>`).join('')}</select></label>`,
      onMount: (api) => { api.onRight = () => api.close(+$('#pw-n', api.el).value); },
    });
    if (n) location.hash = `#/schedule-print/${wk}~${n}`;
  });
  $('#pub')?.addEventListener('click', async () => { week.published = !week.published; await data.put('week', week); toast(week.published ? 'Published' : 'Back to draft'); scheduleView(); });
  $$('[data-s]', view).forEach((td) => {
    td.onclick = async () => {
      const s = staff.find((x) => x.id === td.dataset.s); const d = +td.dataset.d;
      const cur = week.shifts?.[s.id]?.[d] || '';
      const v = await sheet({
        title: `${s.name} · ${DAYS[d]} ${label(addDays(wk, d))}`, right: 'Save',
        body: `<label class="field"><span>Shift</span><input type="text" id="sh" value="${esc(cur)}" placeholder="e.g. 10-6, 4-cl, off"></label>
          <div class="btn-row">${[...quickFor(roleOf(s).k), 'Time off'].map((x) => `<button class="btn tonal small" type="button" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
          <button class="btn plain block" type="button" data-q="">Clear</button>`,
        onMount: (api) => {
          $$('[data-q]', api.el).forEach((b) => { b.onclick = () => api.close({ v: b.dataset.q }); });
          api.onRight = () => api.close({ v: $('#sh', api.el).value.trim() });
        },
      });
      if (!v) return;
      week.shifts ||= {}; week.shifts[s.id] ||= Array(7).fill('');
      week.shifts[s.id][d] = v.v;
      await data.put('week', week);
      scheduleView();
    };
  });
  $('#ask')?.addEventListener('click', async () => {
    const mine = DAYS.map((d, i) => ({ d, i, v: week.shifts?.[me.id]?.[i] })).filter((x) => x.v);
    const r = await sheet({
      title: 'Ask for a swap', right: 'Send',
      body: `<label class="field"><span>Which shift?</span><select id="sw-d">${mine.map((x) => `<option value="${x.i}">${x.d} ${label(addDays(wk, x.i))} · ${esc(x.v)}</option>`).join('') || '<option>No shifts this week</option>'}</select></label>
        <label class="field"><span>Who could cover?</span><select id="sw-to"><option value="">Anyone</option>${staff.filter((s) => s.id !== me.id).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Note</span><input type="text" id="sw-n"></label>`,
      onMount: (api) => { api.onRight = () => { const i = +$('#sw-d', api.el).value; if (!mine.length) return; const to = $('#sw-to', api.el).value; api.close({ i, to, note: $('#sw-n', api.el).value.trim() }); }; },
    });
    if (!r) return;
    const x = mine.find((m) => m.i === r.i);
    await data.put('swap', { week: wk, dayIndex: r.i, day: `${x.d} ${label(addDays(wk, r.i))} · ${x.v}`, from: me.id, fromName: me.name, to: r.to, toName: staff.find((s) => s.id === r.to)?.name || '', note: r.note, status: 'asked', at: Date.now() });
    toast('Swap request sent');
    scheduleView();
  });
  $$('[data-swap]', view).forEach((row) => {
    const r = swaps.find((x) => x.id === row.dataset.swap);
    $('[data-ok]', row)?.addEventListener('click', async () => { await approveSwap(r); scheduleView(); });
    $('[data-no]', row)?.addEventListener('click', async () => { await declineSwap(r); scheduleView(); });
    $('[data-q]', row)?.addEventListener('click', async () => { await askAboutSwap(r); scheduleView(); });
    // RRA-083: the requester can take back a request until it is approved.
    $('[data-rmswap]', row)?.addEventListener('click', async () => {
      const ok = await sheet({ title: 'Remove swap request?', right: 'Remove', body: `<p>Take back your request for <b>${esc(r.day)}</b>? Your shift stays on the schedule.</p>` });
      if (!ok) return;
      const cur = await data.get('swap', r.id);
      if (cur?.status === 'approved') { toast('Already approved, so it can\'t be removed. Talk to a manager.'); scheduleView(); return; }
      await data.put('swap', { ...cur, status: 'withdrawn', withdrawnAt: Date.now() });
      toast('Swap request removed');
      scheduleView();
    });
  });
  if (focus) {
    const el = document.getElementById(`swap-${focus}`);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.classList.remove('focus'), 3500); }
  }
}

// ------------------------------------------------------------ staff (Settings)

// RRA-091: Settings → Shift times. Anyone who can change the schedule edits
// the quick buttons (optionally for one role) and what "cl" means.
export async function shiftTimesView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Shift times');
  const change = canChange('schedule');
  const cur = await shiftTimes();
  let rows = cur.list.map((x) => ({ t: x.t, role: x.role || '' }));
  let closeAt = cur.closeAt;
  const dis = change ? '' : ' disabled';
  const collect = () => {
    $$('.st-row', view).forEach((el, i) => { rows[i] = { t: $('[data-t]', el).value.trim(), role: $('[data-r]', el).value }; });
    const c = $('#st-close', view); if (c) closeAt = +c.value;
  };
  const hrs = (t) => { const h = shiftHours(t); return h ? `${Math.round(h * 10) / 10} h` : ''; };
  const draw = () => {
    view.innerHTML = `
      <p class="muted small">These are the quick buttons when you set someone's shift or add an open shift. Pick a position to show a button only for that position. Typing any other time still works. One list for the whole team.</p>
      <div class="group">${rows.map((r, i) => `<div class="row st-row">
        <input type="text" data-t value="${esc(r.t)}" placeholder="e.g. 10-6"${dis} aria-label="Shift time">
        <select data-r${dis} aria-label="For"><option value="">Everyone</option>${ROLE_GROUPS.map((g) => `<option value="${esc(g.k)}"${g.k === r.role ? ' selected' : ''}>${esc(g.k)}</option>`).join('')}</select>
        <span class="meta" data-h>${hrs(r.t)}</span>
        ${change ? `<span class="st-acts"><button class="btn plain small" type="button" data-up="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button class="btn plain small" type="button" data-dn="${i}" aria-label="Move down"${i < rows.length - 1 ? '' : ' disabled'}>↓</button><button class="btn plain small danger-text" type="button" data-x="${i}" aria-label="Remove">✕</button></span>` : ''}
      </div>`).join('') || '<div class="row"><span class="muted small">No quick buttons. Add one below.</span></div>'}</div>
      ${change ? '<button class="btn tonal block" type="button" id="st-add">+ Add a shift time</button>' : ''}
      <label class="field" style="margin-top:14px"><span>"cl" (close) means</span><select id="st-close"${dis}>${[20, 21, 22, 23, 24, 25, 26].map((h) => `<option value="${h}"${h === closeAt ? ' selected' : ''}>${hourName(h)}</option>`).join('')}</select></label>
      <p class="muted small">Hours for swap checks and the 40-hour check count a shift that ends at close as ending at this time.</p>
      ${change ? `<button class="btn block" type="button" id="st-save">Save</button>
        <button class="btn plain block" type="button" id="st-reset">Back to the standard times</button>` : '<p class="muted small center">Ask a manager to change these.</p>'}`;
    if (!change) return;
    $$('.st-row [data-t]', view).forEach((inp) => { inp.oninput = () => { inp.closest('.st-row').querySelector('[data-h]').textContent = hrs(inp.value); }; });
    $('#st-add').onclick = () => { collect(); rows.push({ t: '', role: '' }); draw(); $$('.st-row [data-t]', view).pop()?.focus(); };
    $$('[data-up]', view).forEach((b) => { b.onclick = () => { collect(); const i = +b.dataset.up; [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); }; });
    $$('[data-dn]', view).forEach((b) => { b.onclick = () => { collect(); const i = +b.dataset.dn; [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); }; });
    $$('[data-x]', view).forEach((b) => { b.onclick = () => { collect(); rows.splice(+b.dataset.x, 1); draw(); }; });
    $('#st-close').onchange = () => { collect(); CLOSE = closeAt; $$('.st-row', view).forEach((el) => { $('[data-h]', el).textContent = hrs($('[data-t]', el).value); }); };
    $('#st-save').onclick = async () => {
      collect();
      const list = rows.filter((r) => r.t);
      await data.saveSettings({ ...(await data.settings()), shiftTimes: list, closeAt });
      CLOSE = closeAt; toast('Shift times saved for everyone'); shiftTimesView();
    };
    $('#st-reset').onclick = () => { rows = DEFAULT_SHIFTS.map((x) => ({ ...x })); closeAt = 23; CLOSE = 23; draw(); toast('Tap Save to keep the standard times'); };
  };
  draw();
}

// RRA-092: hours (and the pay rate and shifts) left behind by someone who was
// removed from Staff, and moving them onto a current staff member.
const normName = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
export async function orphanHistory() {
  if (!canTime()) return [];
  const ids = new Set((await staffList()).map((s) => s.id));
  const out = {};
  for (const p of await data.list('punch')) {
    if (!p.staffId || ids.has(p.staffId)) continue;
    const g = (out[p.staffId] ||= { id: p.staffId, name: p.name || 'Someone', n: 0, hours: 0 });
    g.n++; if (p.out) g.hours += (p.out - p.in) / 3600000;
  }
  return Object.values(out);
}
export const sameName = (a, b) => normName(a) === normName(b);
export async function moveHistory(fromId, to) {
  const ps = (await data.list('punch')).filter((p) => p.staffId === fromId);
  for (const p of ps) await data.put('punch', { ...p, staffId: to.id, name: to.name });
  const old = await data.get('payrate', fromId);
  if (old && +old.rate > 0) {
    const cur = await data.get('payrate', to.id);
    if (!(+cur?.rate > 0)) await data.put('payrate', { id: to.id, staffId: to.id, rate: old.rate });
  }
  for (const w of await data.list('week')) {
    const from = w.shifts?.[fromId];
    if (!from) continue;
    const mine = w.shifts[to.id] || Array(7).fill('');
    w.shifts[to.id] = mine.map((v, i) => v || from[i] || '');
    delete w.shifts[fromId];
    await data.put('week', w);
  }
  for (const r of await data.list('swap')) {
    if (r.from !== fromId && r.to !== fromId) continue;
    await data.put('swap', { ...r, ...(r.from === fromId ? { from: to.id, fromName: to.name } : {}), ...(r.to === fromId ? { to: to.id, toName: to.name } : {}) });
  }
  return ps.length;
}
const hoursText = (h) => `${Math.round(h * 10) / 10} hour${Math.round(h * 10) / 10 === 1 ? '' : 's'}`;
export async function offerMerge(g, to) {
  const ok = await sheet({ title: 'Same person?', left: 'No', right: 'Move hours',
    body: `<p>An earlier <b>${esc(g.name)}</b> was removed from Staff and still has <b>${g.n} punch${g.n === 1 ? '' : 'es'}</b> (${hoursText(g.hours)}).</p>
      <p>If this is the same person, move their hours, pay rate and shifts to <b>${esc(to.name)}</b>, so payroll shows one person.</p>` });
  if (!ok) return false;
  const n = await moveHistory(g.id, to);
  toast(`Moved ${n} punch${n === 1 ? '' : 'es'} to ${to.name}`);
  return true;
}

export async function staffView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Staff');
  const staff = await staffList();
  const change = canChange('schedule') || canChange('settings');
  // RRA-092: a removed person's hours that match someone on the list by name.
  const orphans = change ? await orphanHistory() : [];
  const matches = orphans.map((g) => ({ g, to: staff.find((s) => sameName(s.name, g.name)) })).filter((x) => x.to);
  view.innerHTML = `
    ${matches.map((x, i) => `<div class="hint small"><b>${esc(x.to.name)}</b> may have hours from an earlier record (${x.g.n} punch${x.g.n === 1 ? '' : 'es'}, ${hoursText(x.g.hours)}). <button class="btn tonal small" type="button" data-merge="${i}">Same person? Move them</button></div>`).join('')}
    <div class="group">${staff.map((s) => `<div class="row">${change ? `<button class="rm" type="button" data-rm="${s.id}" aria-label="Remove ${esc(s.name)}">−</button>` : ''}
      <span class="grow"${change ? ` data-edit="${s.id}" style="cursor:pointer"` : ''}><span class="title">${esc(s.name)}</span><span class="sub">${esc(s.position || '')} · ${esc(ROLES[s.role] || 'Staff')}${s.dev ? '' : ` ${chipHtml('Not linked', 'warn')}`}</span></span></div>`).join('') || '<div class="row muted">No staff yet.</div>'}</div>
    ${change ? '<button class="btn tonal block" id="add" type="button">+ Add staff</button>' : ''}
    <p class="muted small">Not linked: this person hasn't opened the app on their phone yet, so Change role isn't available for them.</p>
    <p class="muted small">Staff appear on the schedule. To give someone the app on their phone, send an invite from Settings → Invite and approve phones. Removing someone takes them off the schedule and ends their app access. Their hours stay in Time sheets.</p>`;
  $$('[data-merge]', view).forEach((b) => { b.onclick = async () => { const x = matches[+b.dataset.merge]; if (await offerMerge(x.g, x.to)) staffView(); }; });
  $('#add')?.addEventListener('click', () => staffDialog());
  $$('[data-edit]', view).forEach((el) => { el.onclick = () => staffDialog(staff.find((s) => s.id === el.dataset.edit)); });
  $$('[data-rm]', view).forEach((b) => {
    b.onclick = async () => {
      const s = staff.find((x) => x.id === b.dataset.rm);
      const ok = await sheet({ title: 'Remove staff?', right: 'Remove', body: `<p>Remove <b>${esc(s.name)}</b> from the staff list and the schedule?</p>
        ${s.iid ? `<div class="hint small"><b>This also ends ${esc(s.name)}'s app access.</b> Their phone locks the next time it opens or connects, and they'll need a new invite to come back. Their hours stay in Time sheets.</div>` : ''}` });
      if (!ok) return;
      // RRA-090: the team settings list removed phones; that phone locks itself.
      if (s.iid) { const set = await data.settings(); await data.saveSettings({ ...set, removed: { ...(set.removed || {}), [s.iid]: { name: s.name, at: Date.now(), by: session.profile?.name } } }); }
      await data.remove('staff', s.id); toast(s.iid ? 'Removed, and their app access ended' : 'Removed'); staffView();
    };
  });
}

async function staffDialog(existing) {
  const s = existing ? { ...existing } : { name: '', position: 'Line cook', role: 'staff' };
  // Pay rates (RRA-055): managers and the Admin only, kept apart from the staff list.
  const seeRate = canTime() && level('payrates') !== 'none';
  const pay = seeRate && existing ? await data.get('payrate', existing.id) : null;
  let rate = pay?.rate ?? '';
  const ok = await sheet({
    title: existing ? 'Staff member' : 'Add staff', right: 'Save',
    body: `<label class="field"><span>Name</span><input type="text" id="st-n" value="${esc(s.name)}" placeholder="Name as it appears on their invite"></label>
      <label class="field"><span>Position</span><select id="st-p">${POSITIONS.map((p) => `<option ${p === s.position ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      ${!existing ? '<p class="muted small">Their app role comes from the invite you send them (Settings → Invite and approve phones).</p>'
        : s.dev ? `<div class="field"><span>App role</span><div style="padding:10px 0"><b>${esc(ROLES[s.role] || 'Staff')}</b> <button class="btn plain small" id="st-role" type="button">Change role ›</button></div></div>`
        : `<div class="field"><span>App role</span><div style="padding:10px 0"><b>${esc(ROLES[s.role] || 'Staff')}</b> ${chipHtml('Not linked', 'warn')}</div>
          <p class="muted small" style="margin:0">Change role unlocks once ${esc(s.name)} opens the app on their phone (after an invite). Until then their role comes from their invite.</p></div>`}
      ${seeRate ? `<label class="field"><span>Hourly rate (only managers the Admin allows see this)</span><input type="text" inputmode="decimal" id="st-rate" value="${esc(rate)}" placeholder="$ per hour"${canChange('payrates') ? '' : ' readonly'}></label>` : ''}`,
    onMount: (api) => { $('#st-role', api.el)?.addEventListener('click', () => api.close('role')); api.onRight = () => { const n = $('#st-n', api.el).value.trim(); if (!n) return; Object.assign(s, { name: n, position: $('#st-p', api.el).value }); if ($('#st-rate', api.el)) rate = $('#st-rate', api.el).value.trim().replace('$', ''); api.close(true); }; },
  });
  if (!ok) return;
  if (ok === 'role') { location.hash = `#/person/${s.id}`; return; }
  await data.put('staff', s);
  if (seeRate && canChange('payrates') && String(rate) !== String(pay?.rate ?? '')) await data.put('payrate', { id: s.id, staffId: s.id, rate: rate === '' ? '' : +rate || 0 });
  // RRA-092: added back with the same name as a removed person who has hours.
  if (!existing) for (const g of (await orphanHistory()).filter((x) => sameName(x.name, s.name))) await offerMerge(g, s);
  staffView();
}

export async function ensureStaffFor(profile) {
  // The person using this phone is on the staff list once they have access.
  if (!profile || profile.role === 'owner') return;
  if ((await data.settings()).removed?.[profile.iid]) return; // RRA-090: removed, don't add back
  const staff = await staffList();
  const ek = await myEcdhPublic(); // so a manager's fix to my hours reaches this phone
  const dev = await myPublicKey(); // so the Admin can change my role (RRA-066)
  const mine = staff.find((s) => (s.iid && s.iid === profile.iid)) || staff.find((s) => s.name === profile.name);
  if (mine) { if (mine.ek !== ek || mine.dev !== dev || mine.iid !== profile.iid) await data.put('staff', { ...mine, ek, dev, iid: profile.iid }); return; }
  await data.put('staff', { name: profile.name, position: profile.role === 'manager' ? 'Manager' : profile.role === 'chef' ? 'Chef' : 'Line cook', role: profile.role, iid: profile.iid, ek, dev });
}

// ------------------------------------------------- print several weeks (RRA-042)

export async function schedulePrintView(arg = '') {
  setChrome({ tab: 'more', back: true });
  setTitle('Print schedule');
  const [start = data.weekStart(), n = '2'] = arg.split('~');
  const count = Math.min(8, Math.max(1, +n || 1));
  const change = canChange('schedule');
  const staff = await staffList();
  const weeks = [];
  for (let i = 0; i < count; i++) {
    const id = addDays(start, i * 7);
    weeks.push((await data.get('week', id)) || { id, shifts: {}, published: false });
  }
  view.innerHTML = `
    <div class="paper">
      <h3>${esc(globalThis.BRAND.shortName)} schedule</h3>
      <div class="paper-meta">${label(start)} to ${label(addDays(start, count * 7 - 1))} · printed ${new Date().toLocaleDateString()}</div>
      ${weeks.map((w) => `<div class="week">
        <p style="margin:12px 0 0"><b>Week of ${label(w.id)}</b>${w.published ? '' : ' <i>(draft, not published)</i>'}</p>
        ${w.published || change ? `<table class="sched-print"><tr><th></th>${DAYS.map((d, i) => `<th>${d} ${addDays(w.id, i).slice(8)}</th>`).join('')}</tr>
          ${staff.map((s) => `<tr><td>${esc(s.name)}</td>${DAYS.map((_, i) => `<td>${esc(w.shifts?.[s.id]?.[i] || '')}</td>`).join('')}</tr>`).join('')}</table>`
          : '<p class="small">Not published yet.</p>'}
      </div>`).join('')}
      <div class="paper-foot">${esc(globalThis.BRAND.restaurant)}</div>
    </div>
    ${printButtons()}`;
  const pad = (v, n) => String(v || '').slice(0, n).padEnd(n);
  wirePrint({
    $, mono: true, title: `${globalThis.BRAND.shortName} schedule ${label(start)} to ${label(addDays(start, count * 7 - 1))}`,
    getLines: () => weeks.flatMap((w) => [
      `# Week of ${label(w.id)}${w.published ? '' : ' (draft)'}`,
      ...(w.published || change ? [
        pad('', 14) + DAYS.map((d, i) => pad(`${d} ${addDays(w.id, i).slice(8)}`, 9)).join(''),
        ...staff.map((s) => pad(s.name, 14) + DAYS.map((_, i) => pad(w.shifts?.[s.id]?.[i], 9)).join('')),
      ] : ['Not published yet.']),
      '',
    ]),
  });
}
