// Time-off requests (RRA-139). Anyone on the staff list asks for a day or a
// few days off, with a note. Managers and the Admin (anyone who can change the
// schedule) approve or decline; an approved request puts Time off on those days
// of the schedule. The person who asked gets an alert badge and a pop-up with
// the answer, like swap answers (RRA-079, RRA-137).

import * as data from './data.js';
import { $, $$, esc, sheet, toast, LS, session } from './ui.js';
import { canChange, myStaff } from './perms.js';

const MAX_DAYS = 31;
const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const nice = (iso) => parse(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
export const rangeText = (r) => (r.from === r.to ? nice(r.from) : `${nice(r.from)} – ${nice(r.to)}`);
export function datesOf(r) {
  const out = [];
  for (let d = parse(r.from); data.isoDate(d) <= r.to && out.length < MAX_DAYS; d.setDate(d.getDate() + 1)) out.push(data.isoDate(d));
  return out;
}
const isOff = (v) => /^(off|time ?off|pto|vac)/i.test(String(v || '').trim());
const canApprove = () => canChange('schedule');
const seenSet = () => new Set(LS.get('toSeen', []));
const markSeen = (k) => { const s = seenSet(); s.add(k); LS.set('toSeen', [...s].slice(-300)); };
const ansKey = (r) => `${r.id}:${r.status}`;

// Requests to show: waiting ones for approvers, and my own from today on.
export async function timeOffList() {
  const me = myStaff(), today = data.today();
  return (await data.list('timeoff'))
    .filter((r) => (r.status === 'asked' && canApprove()) || (me && r.staffId === me.id && r.status !== 'withdrawn' && r.to >= today))
    .sort((a, b) => a.from.localeCompare(b.from));
}

// For the alert badge (RRA-137): waiting requests for approvers, and answers I haven't seen.
export async function timeOffBadge() {
  const me = myStaff(), seen = seenSet();
  const all = await data.list('timeoff');
  let n = canApprove() ? all.filter((r) => r.status === 'asked').length : 0;
  if (me) n += all.filter((r) => r.staffId === me.id && (r.status === 'approved' || r.status === 'declined') && !seen.has(ansKey(r))).length;
  return n;
}

// The shifts already on the schedule on the days asked for.
async function scheduled(r) {
  const out = [];
  for (const iso of datesOf(r)) {
    const wk = data.weekStart(parse(iso)), i = (parse(iso).getDay() + 6) % 7;
    const v = (await data.get('week', wk))?.shifts?.[r.staffId]?.[i];
    if (v && !isOff(v)) out.push(`${nice(iso)} · ${v}`);
  }
  return out;
}

export async function askTimeOff() {
  const me = myStaff();
  if (!me) { toast('Ask a manager to add you to Staff first'); return false; }
  const tomorrow = data.isoDate(new Date(Date.now() + 86400000));
  const r = await sheet({
    title: 'Ask for time off', right: 'Send',
    body: `<div class="btn-row"><label class="field" style="flex:1"><span>First day</span><input type="date" id="to-a" value="${tomorrow}" min="${data.today()}"></label>
      <label class="field" style="flex:1"><span>Last day</span><input type="date" id="to-b" value="${tomorrow}" min="${data.today()}"></label></div>
      <label class="field"><span>Note (optional)</span><input type="text" id="to-n" placeholder="Like: family trip, doctor"></label>
      <p class="muted small">A manager approves it. Once approved, those days show Time off on the schedule.</p>`,
    onMount: (api) => {
      const a = $('#to-a', api.el), b = $('#to-b', api.el);
      a.onchange = () => { b.min = a.value; if (b.value < a.value) b.value = a.value; };
      api.onRight = () => {
        if (!a.value || !b.value) { toast('Pick the days'); return; }
        if (b.value < a.value) { toast('The last day is before the first day'); return; }
        if (datesOf({ from: a.value, to: b.value }).length >= MAX_DAYS) { toast(`Ask for up to ${MAX_DAYS - 1} days at a time`); return; }
        api.close({ from: a.value, to: b.value, note: $('#to-n', api.el).value.trim() });
      };
    },
  });
  if (!r) return false;
  await data.put('timeoff', { staffId: me.id, name: me.name, from: r.from, to: r.to, note: r.note, status: 'asked', at: Date.now() });
  toast('Time-off request sent');
  return true;
}

async function approve(r) {
  const cur = await data.get('timeoff', r.id);
  if (!cur || cur.status !== 'asked') { toast('Already answered'); return false; }
  const busy = await scheduled(cur);
  const ok = await sheet({
    title: 'Approve time off?', right: 'Approve',
    body: `<p style="margin-top:0"><b>${esc(cur.name)}</b> · ${esc(rangeText(cur))}</p>${cur.note ? `<div class="msg" style="margin:0 0 8px">${esc(cur.note)}</div>` : ''}
      ${busy.length ? `<div class="hint small">Already on the schedule: ${busy.map(esc).join(', ')}. Approving takes these shifts off and puts Time off instead, so check you have cover.</div>` : '<p class="muted small">Those days show Time off on the schedule.</p>'}`,
  });
  if (!ok) return false;
  for (const iso of datesOf(cur)) {
    const wk = data.weekStart(parse(iso)), i = (parse(iso).getDay() + 6) % 7;
    const week = (await data.get('week', wk)) || { id: wk, shifts: {}, published: false };
    const row = [...(week.shifts?.[cur.staffId] || Array(7).fill(''))];
    row[i] = 'Time off';
    await data.put('week', { ...week, shifts: { ...(week.shifts || {}), [cur.staffId]: row } });
  }
  await data.put('timeoff', { ...cur, status: 'approved', decidedBy: session.profile?.name || '', decidedAt: Date.now() });
  toast(`Time off approved for ${cur.name.split(' ')[0]}`);
  return true;
}
async function decline(r) {
  const cur = await data.get('timeoff', r.id);
  if (!cur || cur.status !== 'asked') { toast('Already answered'); return false; }
  const why = await sheet({
    title: 'Decline time off?', right: 'Decline',
    body: `<p style="margin-top:0"><b>${esc(cur.name)}</b> · ${esc(rangeText(cur))}</p><label class="field"><span>Reason (optional, they see it)</span><input type="text" id="to-why"></label>`,
    onMount: (api) => { api.onRight = () => api.close({ why: $('#to-why', api.el).value.trim() }); },
  });
  if (!why) return false;
  await data.put('timeoff', { ...cur, status: 'declined', reason: why.why, decidedBy: session.profile?.name || '', decidedAt: Date.now() });
  toast('Time off declined');
  return true;
}
async function withdraw(r) {
  const ok = await sheet({ title: 'Remove request?', right: 'Remove', body: `<p>Take back your time-off request for <b>${esc(rangeText(r))}</b>?</p>` });
  if (!ok) return false;
  const cur = await data.get('timeoff', r.id);
  if (cur?.status !== 'asked') { toast('Already answered. Talk to a manager.'); return true; }
  await data.put('timeoff', { ...cur, status: 'withdrawn', withdrawnAt: Date.now() });
  toast('Request removed');
  return true;
}

// The list on the Schedule screen. done() redraws the screen after a change.
export async function timeOffSection(done) {
  const list = await timeOffList(), me = myStaff();
  if (!list.length) return { html: '', wire: () => {} };
  const ST = { approved: '<span class="chip ok">Approved</span>', declined: '<span class="chip danger">Declined</span>' };
  const html = `<div class="section-label">Time-off requests</div><div class="group">${list.map((r) => `
    <div class="row" data-toff="${r.id}"><span class="grow"><span class="title">${me && r.staffId === me.id ? 'You' : esc(r.name)} · ${esc(rangeText(r))}</span>
      <span class="sub" style="white-space:normal">${r.note ? esc(r.note) : 'No note'}${r.status === 'declined' && r.reason ? ` · ${esc(r.reason)}` : ''}${r.decidedBy ? ` · ${esc(r.decidedBy)}` : ''}</span></span>
      <span class="swap-acts">${r.status !== 'asked' ? ST[r.status] || ''
        : canApprove() ? '<button class="btn small" data-tok type="button">OK</button><button class="btn danger small" data-tno type="button">No</button>'
        : '<span class="chip warn">Waiting</span><button class="btn plain small" data-trm type="button">Remove</button>'}</span></div>`).join('')}</div>`;
  const wire = (root) => {
    $$('[data-toff]', root).forEach((row) => {
      const r = list.find((x) => x.id === row.dataset.toff);
      if (me && r.staffId === me.id && r.status !== 'asked') markSeen(ansKey(r)); // seen the answer here
      $('[data-tok]', row)?.addEventListener('click', async () => { if (await approve(r)) done(); });
      $('[data-tno]', row)?.addEventListener('click', async () => { if (await decline(r)) done(); });
      $('[data-trm]', row)?.addEventListener('click', async () => { if (await withdraw(r)) done(); });
    });
  };
  return { html, wire };
}

// On opening the app: the answer to my request, once (like swap answers).
export async function timeOffPopups() {
  const me = myStaff();
  if (!me) return false;
  const seen = seenSet();
  for (const r of (await data.list('timeoff')).filter((x) => x.staffId === me.id && (x.status === 'approved' || x.status === 'declined'))) {
    if (seen.has(ansKey(r))) continue;
    const ok = r.status === 'approved';
    const go = await sheet({
      title: ok ? 'Time off approved' : 'Time off declined', left: 'OK', right: 'Schedule',
      body: `<p style="margin-top:0;font-size:1.05rem">${ok ? '✅' : '⛔'} Your time off for <b>${esc(rangeText(r))}</b> was <b>${ok ? 'approved' : 'declined'}</b>${r.decidedBy ? ` by ${esc(r.decidedBy)}` : ''}.</p>
        ${r.reason ? `<div class="msg" style="margin:0">${esc(r.reason)}</div>` : ''}
        <p class="muted small">${ok ? 'Those days show Time off on the schedule.' : 'Talk to a manager if you still need the time.'}</p>`,
    });
    markSeen(ansKey(r));
    if (go) location.hash = '#/schedule';
    return true;
  }
  return false;
}

