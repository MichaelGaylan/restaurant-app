// Interactive prep lists (RRA-005): a standing list per station; each day
// starts unticked, and cooks tick items off as they finish them.

import * as data from './data.js';
import { $, $$, esc, view, LS, sheet, toast, setTitle, setChrome, session, oneOpen, chip } from './ui.js';
import { canChange } from './perms.js';

let editing = false;

// Saved items (RRA-057): every item ever added is kept here, so it can go
// back on the list with one tap. Keyed by name, so it holds one of each.
const savedKey = (name) => name.trim().toLowerCase();
async function remember(it) {
  const saved = await data.list('prepsaved');
  const ex = saved.find((x) => savedKey(x.name) === savedKey(it.name));
  await data.put('prepsaved', { ...(ex || {}), name: it.name, amount: it.amount || '', station: it.station || '' });
}

// From the lounge (RRA-070): #/prep/lounge shows a back button to the lounge.
let fromLounge = false;
export function prepView(from) {
  fromLounge = from === 'lounge';
  return render();
}

async function render() {
  setChrome({ tab: 'prep', back: fromLounge });
  const change = canChange('prep');
  const settings = await data.settings();
  const stations = settings.stations || [];
  const items = (await data.list('prepitem')).sort((a, b) => (a.order || 0) - (b.order || 0) || data.byName(a, b));
  const day = data.today();
  const done = (await data.get('prepday', day)) || { id: day, done: {} };
  setTitle(editing ? 'Edit prep list' : "Today's prep", change ? `<button class="btn plain small" id="edit" type="button">${editing ? 'Done' : 'Edit'}</button>` : '');
  const byStation = {};
  for (const it of items) (byStation[it.station || 'Other'] ||= []).push(it);
  // RRA-110: only tabs with work left show. A tab whose last task is done
  // goes away (Edit still shows every tab).
  const left = (s) => byStation[s].some((i) => !done.done[i.id]);
  const order = [...stations, ...Object.keys(byStation).filter((s) => !stations.includes(s))].filter((s) => byStation[s] && (editing || left(s)));
  const total = items.length;
  const finished = items.filter((i) => done.done[i.id]).length;
  let saved = (await data.list('prepsaved')).sort(data.byName);
  if (!saved.length && items.length && change && !LS.get('prepSavedSeeded', 0)) {
    for (const it of items) await remember(it); // first run: start from today's list
    LS.set('prepSavedSeeded', 1);
    saved = (await data.list('prepsaved')).sort(data.byName);
  }
  const onList = new Set(items.map((i) => savedKey(i.name)));
  const savedOpen = LS.get('prepSavedOpen', false) || !items.length;
  view.innerHTML = `
    <p class="muted small">${new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}${total ? ` · ${finished} of ${total} done` : ''}</p>
    ${order.map((s) => { const n = byStation[s].length, dn = byStation[s].filter((i) => done.done[i.id]).length, o = LS.get('prepOpen', null) === s; return `
      <button class="acc-head${o ? ' open' : ''}" type="button" data-g="${esc(s)}"><span class="grow">${esc(s)}</span><span class="meta">${dn === n ? chip('All done', 'green') : `${dn} of ${n} done`}</span></button>
      <div class="group acc-body"${o ? '' : ' hidden'}>${byStation[s].map((i) => {
        const d = done.done[i.id];
        return `<div class="row ${d && !editing ? 'done' : ''}" data-id="${i.id}">
          ${editing ? `<button class="rm" type="button" data-rm="${i.id}" aria-label="Remove">−</button>` : '<span class="chk"></span>'}
          <span class="grow"><span class="title">${esc(i.name)}</span>${d && !editing ? `<span class="sub">${esc(d.by)} · ${new Date(d.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>` : ''}</span>
          <span class="meta">${esc(i.amount || '')}</span>${editing ? '<span class="chev">›</span>' : ''}</div>`;
      }).join('')}</div>`; }).join('') || `<div class="empty">${done.clearedAt ? `All prep done${done.clearedBy ? ` (finished by ${esc(done.clearedBy)})` : ''}. The list is ready for the next shift.` : 'No prep items yet.'}${change ? `<br>${saved.length ? 'Tap items in <b>Saved items</b> below to fill it, or tap <b>Edit</b> to add new ones.' : 'Tap <b>Edit</b> to add what gets prepped.'}` : ''}</div>`}
    ${editing ? '<button class="btn tonal block" id="add" type="button">+ Add prep item</button><p class="muted small">Tap an item to change it. Stations are set in Settings → Prep stations.</p>' : total ? `<p class="muted small center">Tap an item when it's done. The list starts fresh each day.${change ? ' To change an item, tap Edit, then tap the item.' : ''}</p>` : ''}
    ${change && saved.length ? `<details class="saved" id="saved"${savedOpen ? ' open' : ''}>
      <summary><span class="grow">Saved items</span><span class="meta">${saved.length}</span></summary>
      <p class="muted small">Tap an item to put it back on today's list.</p>
      <div class="group">${saved.map((x) => `<div class="row${onList.has(savedKey(x.name)) ? ' on-list' : ''}" data-saved="${x.id}">
        ${editing ? `<button class="rm" type="button" data-unsave="${x.id}" aria-label="Forget ${esc(x.name)}">−</button>` : ''}
        <span class="grow"><span class="title">${esc(x.name)}</span><span class="sub">${esc([x.amount, x.station].filter(Boolean).join(' · '))}</span></span>
        <span class="meta">${onList.has(savedKey(x.name)) ? 'On the list' : '<span class="plus">+ Add</span>'}</span></div>`).join('')}</div>
    </details>` : ''}`;
  oneOpen(view, (g) => LS.set('prepOpen', g));
  $('#edit')?.addEventListener('click', () => { editing = !editing; render(); });
  $('#add')?.addEventListener('click', () => itemDialog(stations));
  $('#saved')?.addEventListener('toggle', (e) => LS.set('prepSavedOpen', e.target.open));
  $$('[data-saved]', view).forEach((row) => {
    row.onclick = async () => {
      const x = saved.find((y) => y.id === row.dataset.saved);
      if (onList.has(savedKey(x.name))) { toast('Already on the list'); return; }
      await data.put('prepitem', { name: x.name, amount: x.amount, station: x.station || stations[0] || 'Other', order: Date.now() });
      toast(`Added ${x.name}`);
      render();
    };
  });
  $$('[data-unsave]', view).forEach((b) => {
    b.onclick = async (e) => { e.stopPropagation(); await data.remove('prepsaved', b.dataset.unsave); render(); };
  });
  // RRA-056: in Edit, tap an item to change it.
  if (editing) $$('.group .row[data-id]', view).forEach((row) => { row.onclick = () => itemDialog(stations, items.find((i) => i.id === row.dataset.id)); });
  if (!editing) {
    $$('.row[data-id]', view).forEach((row) => {
      row.onclick = async () => {
        const id = row.dataset.id;
        if (done.done[id]) delete done.done[id]; else done.done[id] = { by: session.profile.name, at: Date.now() };
        await data.put('prepday', done);
        // RRA-110: the last task in a tab is done. The tab goes away; its items
        // stay in Saved items, so refilling is one tap each.
        const st = items.find((i) => i.id === id)?.station || 'Other';
        const inTab = items.filter((i) => (i.station || 'Other') === st);
        const allDone = items.length && items.every((i) => done.done[i.id]);
        if (done.done[id] && !allDone && inTab.every((i) => done.done[i.id])) {
          const cleared = inTab.map((i) => ({ ...i })), marks = {};
          for (const i of cleared) { marks[i.id] = done.done[i.id]; await remember(i); await data.remove('prepitem', i.id); delete done.done[i.id]; }
          await data.put('prepday', done);
          if (LS.get('prepOpen', null) === st) LS.set('prepOpen', order.find((x) => x !== st && left(x)) || null); // open the next tab with work
          toast(`${st} prep done. That tab is cleared.`, {
            label: 'Undo',
            run: async () => { for (const i of cleared) await data.put('prepitem', i); const d = (await data.get('prepday', day)) || { id: day, done: {} }; Object.assign(d.done, marks); await data.put('prepday', d); render(); },
          }, 4000);
        }
        // Everything done: the list clears itself for the next shift. Items
        // stay in Saved items, so refilling is one tap each.
        if (allDone) {
          const cleared = items.map((i) => ({ ...i }));
          for (const i of cleared) { await remember(i); await data.remove('prepitem', i.id); }
          done.done = {}; done.clearedAt = Date.now(); done.clearedBy = session.profile.name;
          await data.put('prepday', done);
          toast('All prep done! The list is cleared for the next shift.', {
            label: 'Undo',
            run: async () => { for (const i of cleared) await data.put('prepitem', i); render(); },
          }, 4000); // RRA-077: up for 4 seconds
        }
        render();
      };
    });
  }
  $$('[data-rm]', view).forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      await data.remove('prepitem', b.dataset.rm);
      toast('Removed. It stays in Saved items.');
      render();
    };
  });
}

async function itemDialog(stations, existing) {
  const sts = [...new Set([...(stations.length ? stations : ['Other']), ...(existing?.station ? [existing.station] : [])])];
  const it = await sheet({
    title: existing ? 'Change prep item' : 'Add prep item', right: existing ? 'Save' : 'Add',
    body: `<label class="field"><span>What to prep</span><input type="text" id="i-name" placeholder="e.g. Slice tomatoes" value="${esc(existing?.name || '')}"></label>
      <label class="field"><span>Amount</span><input type="text" id="i-amt" placeholder="e.g. 2 qt" value="${esc(existing?.amount || '')}"></label>
      <label class="field"><span>Station</span><select id="i-st">${sts.map((s) => `<option${s === existing?.station ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`,
    onMount: (api) => { api.onRight = () => { const n = $('#i-name', api.el).value.trim(); if (n) api.close({ ...(existing || { order: Date.now() }), name: n, amount: $('#i-amt', api.el).value.trim(), station: $('#i-st', api.el).value }); }; },
  });
  if (!it) return;
  await data.put('prepitem', it);
  LS.set('prepOpen', it.station); // RRA-094: show the station it went into
  await remember(it);
  toast(existing ? 'Saved' : 'Added');
  render();
}
