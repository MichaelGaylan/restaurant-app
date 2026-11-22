// Problem reports in the app (RRA-088). A report still goes by email, and it
// is also a private message to the managers group (the Admin and managers),
// sealed to their phones (RRA-075). They reply in the app; the person who
// reported it gets a pop-up and can answer back. Reports can be marked Fixed
// or Closed. Reports stay off the message board.

import * as data from './data.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome, session, LS, chip } from './ui.js';
import { GROUPS, myId, canSeePost, sentByMe } from './audience.js';

export const isReport = (p) => !!p?.about?.report;
export const inReportTeam = () => GROUPS.managers.roles.includes(session.profile?.role);
const STATUS = { open: ['Open', 'orange'], fixed: ['Fixed', 'green'], closed: ['Closed', 'gray'] };
const when = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const notMine = (r) => (r.byId ? r.byId !== myId() : r.by !== session.profile?.name);

export async function sendReportInApp({ type, where, text }) {
  const { sendPost } = await import('./board.js');
  return sendPost({ text, to: { kind: 'group', group: 'managers' }, about: { report: { type, where, status: 'open' } } });
}

export async function myReports() {
  return (await data.list('post')).filter((p) => isReport(p) && canSeePost(p)).sort((a, b) => b.at - a.at);
}

// Open reports for the badge on Settings → Problem reports.
export async function openReports() {
  if (!inReportTeam()) return 0;
  return (await myReports()).filter((p) => (p.about.report.status || 'open') === 'open').length;
}

const card = (p, team) => {
  const st = STATUS[p.about.report.status || 'open'];
  return `<div class="msg private report" data-id="${p.id}">
    <div class="who">${esc(p.by)} · ${when(p.at)} · ${esc(p.about.report.where || '')} · ${esc(p.about.report.type || '')} ${chip(st[0], st[1])}</div>${esc(p.text).replace(/\n/g, '<br>')}
    ${(p.replies || []).map((r) => `<div class="reply"><span class="who">${esc(r.by)} · ${when(r.at)}</span>${esc(r.text)}</div>`).join('')}
    <div class="btn-row" style="margin-top:6px;flex-wrap:wrap"><button class="btn plain small" data-reply type="button">Reply</button>
      ${team && st[0] === 'Open' ? '<button class="btn plain small" data-st="fixed" type="button">Mark fixed</button><button class="btn plain small" data-st="closed" type="button">Close</button>' : ''}
      ${team && st[0] !== 'Open' ? '<button class="btn plain small" data-st="open" type="button">Reopen</button>' : ''}</div></div>`;
};

export async function reportReply(p, text) {
  p.replies = [...(p.replies || []), { by: session.profile.name, byId: myId(), at: Date.now(), text }];
  await data.put('post', p);
}

// The list for the Admin and managers; the reporter sees their own.
export async function reportsView() {
  setChrome({ tab: 'more', back: true });
  const team = inReportTeam();
  setTitle(team ? 'Problem reports' : 'My problem reports');
  const f = LS.get('repFilter', 'open');
  const all = await myReports();
  const list = team ? all.filter((p) => (f === 'all' ? true : (p.about.report.status || 'open') === 'open')) : all.filter(sentByMe);
  view.innerHTML = `
    ${team ? `<div class="segmented"><button type="button" data-f="open" class="${f === 'open' ? 'on' : ''}">Open</button><button type="button" data-f="all" class="${f === 'all' ? 'on' : ''}">All</button></div>` : ''}
    ${list.map((p) => card(p, team)).join('') || `<div class="empty">${team ? 'No open problem reports.' : 'You haven\'t sent a problem report from this phone yet.'}</div>`}
    <p class="muted small center">Reports are private: only the person who sent one, the Admin and managers see it. They also go to the app's inbox by email.</p>
    <a class="btn tonal block" href="#/report">Report a problem</a>`;
  $$('[data-f]', view).forEach((b) => { b.onclick = () => { LS.set('repFilter', b.dataset.f); reportsView(); }; });
  $$('.report', view).forEach((el) => {
    const p = list.find((x) => x.id === el.dataset.id);
    $('[data-reply]', el).onclick = async () => {
      const text = await sheet({ title: 'Reply', right: 'Send', body: `<p class="muted small">${esc(p.by)}: ${esc(p.text.slice(0, 120))}</p><textarea id="rr" style="min-height:80px"></textarea>`,
        onMount: (api) => { api.onRight = () => { const t = $('#rr', api.el).value.trim(); if (t) api.close(t); }; } });
      if (!text) return;
      await reportReply(p, text); toast('Reply sent'); reportsView();
    };
    $$('[data-st]', el).forEach((b) => { b.onclick = async () => { p.about = { ...p.about, report: { ...p.about.report, status: b.dataset.st, by: session.profile.name } }; await data.put('post', p); toast(STATUS[b.dataset.st][0]); reportsView(); }; });
  });
  // Seeing the list counts as seeing these, so no pop-up for them after.
  const seen = LS.get('repSeen', {}); for (const p of all) seen[p.id] = Date.now(); LS.set('repSeen', seen);
}

// On opening the app: a reply to my report, or (for the Admin and managers)
// a new report or an answer from the person who reported it.
export async function reportPopups() {
  if (location.hash.startsWith('#/reports')) return false;
  const seen = LS.get('repSeen', {});
  for (const p of await myReports()) {
    const mine = sentByMe(p);
    if (!mine && !inReportTeam()) continue;
    const last = Math.max(mine ? 0 : p.at, ...(p.replies || []).filter(notMine).map((r) => r.at));
    if (!last || (seen[p.id] || 0) >= last) continue;
    const latest = (p.replies || []).filter(notMine).sort((a, b) => b.at - a.at)[0];
    const fresh = !mine && (!latest || latest.at < p.at || !(p.replies || []).length);
    const reply = await sheet({
      title: mine ? 'Reply to your problem report' : fresh ? 'New problem report' : 'Problem report: reply received', left: 'Later', right: 'Reply',
      body: `<p class="muted small" style="margin-top:0">${esc(p.about.report.where || '')} · ${esc(p.about.report.type || '')}</p>
        <div class="msg private" style="margin:0"><div class="who">${esc(p.by)} · ${when(p.at)}</div>${esc(p.text.slice(0, 400))}</div>
        ${latest && !fresh ? `<div class="msg" style="margin:8px 0 0"><div class="who">${esc(latest.by)} · ${when(latest.at)}</div>${esc(latest.text)}</div>` : ''}
        <textarea id="rp" style="min-height:70px;margin-top:10px" placeholder="Your answer"></textarea>
        <a class="small" href="#/reports" data-open>See all reports ›</a>`,
      onMount: (api) => { api.onRight = () => { const t = $('#rp', api.el).value.trim(); if (t) api.close(t); }; $('[data-open]', api.el).onclick = (e) => { e.preventDefault(); api.close('__open'); }; },
    });
    seen[p.id] = Date.now(); LS.set('repSeen', seen);
    if (reply === '__open') location.hash = '#/reports';
    else if (reply) { await reportReply(p, reply); toast('Reply sent'); }
    return true;
  }
  return false;
}
