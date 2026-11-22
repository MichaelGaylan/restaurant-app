// Events / BEOs (RRA-010): one sheet per party with menu, timeline and notes.

import * as data from './data.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome, session, LS, chip } from './ui.js';
import { canChange, canSee } from './perms.js';

// RRA-105: reminders before an event. Each event can say how many days ahead
// (or Off); otherwise the team's usual choice in Settings (3 days) is used.
// From that day until the event, the Admin, managers and chefs get a pop-up
// when the app opens (once a day each), a badge on Events and a lounge card.
export const REMIND_DAYS = [0, 1, 2, 3, 5, 7, 14];
export const DEFAULT_REMIND = 3;
const REMIND_ROLES = ['owner', 'manager', 'chef'];
export const remindLabel = (d) => (!d ? 'Off' : `${d} day${d > 1 ? 's' : ''} before`);
const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(new Date(y, m - 1, d).getTime() / 86400000); };
export const daysUntil = (e) => dayNum(e.date) - dayNum(data.today());
export const whenText = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`);
export const remindOf = (e, set) => (e.remind === 0 || e.remind ? +e.remind : set.eventRemind === 0 || set.eventRemind ? +set.eventRemind : DEFAULT_REMIND);
export const getsReminders = () => REMIND_ROLES.includes(session.profile?.role) && canSee('events');

// Events in their reminder window, soonest first.
export async function dueEvents() {
  if (!getsReminders()) return [];
  const set = await data.settings();
  return (await data.list('event'))
    .filter((e) => e.date && daysUntil(e) >= 0 && remindOf(e, set) > 0 && daysUntil(e) <= remindOf(e, set))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// On opening the app: one pop-up a day for each event coming up.
export async function eventPopups() {
  const seen = LS.get('evSeen', {});
  const today = data.today();
  const e = (await dueEvents()).find((x) => seen[x.id] !== today);
  if (!e) return false;
  const n = daysUntil(e);
  const go = await sheet({
    title: `Event ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}`, left: 'Later', right: 'Open',
    body: `<p style="margin-top:0"><b>${esc(e.name)}</b></p>
      <p class="small">${esc([fmt(e.date), e.time, e.guests && `${e.guests} guests`, e.room].filter(Boolean).join(' · '))}</p>
      ${(e.timeline || []).length ? `<p class="small muted">${(e.timeline || []).filter((t) => !t.done).length} of ${e.timeline.length} timeline steps left</p>` : ''}
      <p class="muted small">You'll see this once a day until the event.</p>`,
  });
  seen[e.id] = today;
  for (const k of Object.keys(seen)) if (seen[k] < today) delete seen[k];
  LS.set('evSeen', seen);
  if (go) location.hash = `#/event/${e.id}`;
  return true;
}

const fmt = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); };

export async function eventsView() {
  setChrome({ tab: 'more', back: true });
  const change = canChange('events');
  setTitle('Events (BEOs)', change ? '<button class="btn btn-new" id="new" type="button">NEW EVENT</button>' : '');
  const evs = (await data.list('event')).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const today = data.today();
  const up = evs.filter((e) => (e.date || '') >= today);
  const past = evs.filter((e) => (e.date || '') < today).reverse();
  const due = new Set((await dueEvents()).map((e) => e.id));
  const row = (e) => `<a class="row" href="#/event/${e.id}"><span class="grow"><span class="title">${esc(e.name)}${due.has(e.id) ? ` ${chip(whenText(daysUntil(e)), 'orange')}` : ''}</span><span class="sub">${esc([fmt(e.date), e.time, e.guests && `${e.guests} guests`, e.room].filter(Boolean).join(' · '))}</span></span></a>`;
  view.innerHTML = `
    ${up.length ? `<div class="section-label">Coming up</div><div class="group">${up.map(row).join('')}</div>` : '<div class="empty">No upcoming events.</div>'}
    ${past.length ? `<div class="section-label">Past</div><div class="group">${past.slice(0, 10).map(row).join('')}</div>` : ''}`;
  $('#new')?.addEventListener('click', () => eventDialog());
}

export async function eventView(id) {
  setChrome({ tab: 'more', back: true });
  const e = await data.get('event', id);
  if (!e) { location.hash = '#/events'; return; }
  const change = canChange('events');
  const set = await data.settings();
  setTitle(e.name, change ? '<button class="btn plain small" id="edit" type="button">Edit</button>' : '');
  view.innerHTML = `
    <div class="paper-like">
      <div class="facts"><div><b>When</b>${esc(fmt(e.date))}${e.time ? ', ' + esc(e.time) : ''}</div><div><b>Guests</b>${esc(e.guests || '—')}${e.room ? ' · ' + esc(e.room) : ''}</div></div>
      ${e.contact ? `<p class="small muted">Contact: ${esc(e.contact)}</p>` : ''}
      <p class="small muted no-print">Reminder: ${esc(remindLabel(remindOf(e, set)))}${e.remind === 0 || e.remind ? '' : ' (the usual)'}${e.date && daysUntil(e) >= 0 ? ` · ${esc(whenText(daysUntil(e)).toLowerCase())}` : ''}</p>
      <div class="recipe"><h2>Menu</h2></div>
      <div class="card"><ul class="ing">${(e.menu || []).map((m) => `<li><span class="qty">${esc(m.qty)}</span><span>${esc(m.item)}</span></li>`).join('') || '<li class="muted">No menu yet.</li>'}</ul></div>
      <div class="recipe"><h2>Timeline</h2></div>
      <div class="group">${(e.timeline || []).map((t, i) => `<div class="row ${t.done ? 'done' : ''}" data-i="${i}"><span class="chk"></span><span class="grow"><span class="title">${esc(t.text)}</span></span><span class="meta">${esc(t.when || '')}</span></div>`).join('') || '<div class="row muted">No steps yet.</div>'}</div>
      ${e.notes ? `<div class="recipe"><h2>Notes</h2></div><div class="card">${esc(e.notes).replace(/\n/g, '<br>')}</div>` : ''}
    </div>
    <button class="btn tonal block no-print" id="print" type="button">Print event sheet</button>
    ${change ? '<button class="btn danger block no-print" id="del" type="button">Delete event</button>' : ''}`;
  $('#edit')?.addEventListener('click', () => eventDialog(e));
  $('#print').onclick = () => window.print();
  $$('[data-i]', view).forEach((row) => {
    row.onclick = async () => { const t = e.timeline[+row.dataset.i]; t.done = !t.done; await data.put('event', e); eventView(id); };
  });
  $('#del')?.addEventListener('click', async () => {
    const ok = await sheet({ title: 'Delete event?', right: 'Delete', body: `<p>Delete <b>${esc(e.name)}</b>?</p>` });
    if (ok) { await data.remove('event', id); location.hash = '#/events'; }
  });
}

const lines = (arr, f) => (arr || []).map(f).join('\n');
const parse = (text, f) => text.split('\n').map((l) => l.trim()).filter(Boolean).map(f);

async function eventDialog(existing) {
  const e = existing ? structuredClone(existing) : { name: '', date: data.today(), time: '', guests: '', room: '', contact: '', menu: [], timeline: [], notes: '', remind: null };
  const usual = remindOf({}, await data.settings());
  const hasOwn = e.remind === 0 || (e.remind !== null && e.remind !== undefined && e.remind !== '');
  const ok = await sheet({
    title: existing ? 'Edit event' : 'New event', right: 'Save',
    body: `
      <label class="field"><span>Event</span><input type="text" id="e-name" value="${esc(e.name)}" placeholder="e.g. Thompson birthday party"></label>
      <div class="facts" style="background:none">
        <label class="field" style="margin:0"><span>Date</span><input type="date" id="e-date" value="${esc(e.date)}"></label>
        <label class="field" style="margin:0"><span>Time</span><input type="text" id="e-time" value="${esc(e.time)}" placeholder="6–9 PM"></label>
        <label class="field" style="margin:0"><span>Guests</span><input type="text" inputmode="numeric" id="e-guests" value="${esc(e.guests)}"></label>
        <label class="field" style="margin:0"><span>Room</span><input type="text" id="e-room" value="${esc(e.room)}" placeholder="Back room"></label>
      </div>
      <label class="field"><span>Remind the Admin, managers and chefs</span><select id="e-remind">
        <option value=""${hasOwn ? '' : ' selected'}>The usual (${esc(remindLabel(usual))})</option>
        ${REMIND_DAYS.map((d) => `<option value="${d}"${hasOwn && +e.remind === d ? ' selected' : ''}>${esc(remindLabel(d))}</option>`).join('')}</select></label>
      <label class="field"><span>Contact (name only, optional)</span><input type="text" id="e-contact" value="${esc(e.contact)}"></label>
      <label class="field"><span>Menu (one per line: amount, then item)</span><textarea id="e-menu" placeholder="150 Jumbo wings, 3 sauces&#10;2 pans Chicken fingers">${esc(lines(e.menu, (m) => `${m.qty} ${m.item}`.trim()))}</textarea></label>
      <label class="field"><span>Timeline (one per line: time, dash, task)</span><textarea id="e-time-l" placeholder="2 PM - Prep sauces&#10;5 PM - Set back room">${esc(lines(e.timeline, (t) => (t.when ? `${t.when} - ` : '') + t.text))}</textarea></label>
      <label class="field"><span>Notes</span><textarea id="e-notes" style="min-height:64px" placeholder="Allergies, deposit, setup">${esc(e.notes)}</textarea></label>
      <p id="e-err" class="small" style="color:var(--danger)"></p>`,
    onMount: (api) => {
      api.onRight = () => {
        const el = api.el;
        const name = $('#e-name', el).value.trim();
        if (!name) { $('#e-err', el).textContent = 'Name the event.'; return; }
        const old = new Map((e.timeline || []).map((t) => [t.text, t.done]));
        Object.assign(e, {
          name, date: $('#e-date', el).value, time: $('#e-time', el).value.trim(), guests: $('#e-guests', el).value.trim(),
          remind: $('#e-remind', el).value === '' ? null : +$('#e-remind', el).value,
          room: $('#e-room', el).value.trim(), contact: $('#e-contact', el).value.trim(), notes: $('#e-notes', el).value.trim(),
          menu: parse($('#e-menu', el).value, (l) => { const m = l.match(/^(\S+(?:\s+(?:pans?|bowls?|trays?|lb|oz|qt|gal|dozen|each))?)\s+(.*)$/i); return m ? { qty: m[1], item: m[2] } : { qty: '', item: l }; }),
          timeline: parse($('#e-time-l', el).value, (l) => { const m = l.match(/^(.+?)\s+-\s+(.*)$/); const t = m ? { when: m[1], text: m[2] } : { when: '', text: l }; t.done = !!old.get(t.text); return t; }),
        });
        api.close(true);
      };
    },
  });
  if (!ok) return;
  await data.put('event', e);
  toast('Saved');
  if (location.hash === `#/event/${e.id}`) eventView(e.id); else location.hash = `#/event/${e.id}`;
}
