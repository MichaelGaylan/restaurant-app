// Events / BEOs (RRA-010): one sheet per party with menu, timeline and notes.

import * as data from './data.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome } from './ui.js';
import { canChange } from './perms.js';

const fmt = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); };

export async function eventsView() {
  setChrome({ tab: 'more', back: true });
  const change = canChange('events');
  setTitle('Events (BEOs)', change ? '<button class="btn btn-new" id="new" type="button">NEW EVENT</button>' : '');
  const evs = (await data.list('event')).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const today = data.today();
  const up = evs.filter((e) => (e.date || '') >= today);
  const past = evs.filter((e) => (e.date || '') < today).reverse();
  const row = (e) => `<a class="row" href="#/event/${e.id}"><span class="grow"><span class="title">${esc(e.name)}</span><span class="sub">${esc([fmt(e.date), e.time, e.guests && `${e.guests} guests`, e.room].filter(Boolean).join(' · '))}</span></span></a>`;
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
  setTitle(e.name, change ? '<button class="btn plain small" id="edit" type="button">Edit</button>' : '');
  view.innerHTML = `
    <div class="paper-like">
      <div class="facts"><div><b>When</b>${esc(fmt(e.date))}${e.time ? ', ' + esc(e.time) : ''}</div><div><b>Guests</b>${esc(e.guests || '—')}${e.room ? ' · ' + esc(e.room) : ''}</div></div>
      ${e.contact ? `<p class="small muted">Contact: ${esc(e.contact)}</p>` : ''}
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
  const e = existing ? structuredClone(existing) : { name: '', date: data.today(), time: '', guests: '', room: '', contact: '', menu: [], timeline: [], notes: '' };
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
