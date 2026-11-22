// Recipe costing and the waste log (RRA-011).

import * as data from './data.js';
import { $, $$, esc, view, LS, sheet, toast, setTitle, setChrome, fmtDate, session } from './ui.js';
import { canChange } from './perms.js';
import { plateCost } from './recipes.js';

export async function costsView() {
  setChrome({ tab: 'more', back: true });
  const tab = LS.get('costTab', 'cost');
  setTitle('Costs and waste', tab === 'waste' && canChange('costs') ? '<button class="btn btn-new" id="log" type="button">LOG WASTE</button>' : '');
  const seg = `<div class="segmented"><button type="button" data-t="cost" class="${tab === 'cost' ? 'on' : ''}">Recipe cost</button><button type="button" data-t="waste" class="${tab === 'waste' ? 'on' : ''}">Waste log</button></div>`;
  if (tab === 'cost') {
    const dishes = (await data.list('recipe')).filter((r) => r.kind === 'dish').sort(data.byName);
    const target = (await data.settings()).foodCostTarget || 30;
    view.innerHTML = `${seg}
      <div class="group">${dishes.map((r) => {
        const c = plateCost(r);
        const pct = c !== null && +r.price ? Math.round((c / r.price) * 100) : null;
        return `<a class="row" href="#/recipe/${r.id}"><span class="grow"><span class="title">${esc(r.name)}</span>
          <span class="sub">${c === null ? 'Add ingredient costs in the recipe' : `Plate ${data.money(c)}${+r.price ? ` · menu ${data.money(r.price)}` : ''}`}</span>
          ${pct !== null ? `<div class="bar"><i style="width:${Math.min(100, pct)}%;background:${pct > target ? 'var(--danger)' : 'var(--ok)'}"></i></div>` : ''}</span>
          <span class="meta">${pct !== null ? `<b>${pct}%</b>` : ''}</span></a>`;
      }).join('') || '<div class="row muted">No dishes in the archive yet.</div>'}</div>
      <p class="muted small">Food cost target: ${target}%. Red bars are over target. Set costs per ingredient when editing a dish.</p>`;
  } else {
    const since = Date.now() - 7 * 86400000;
    const all = (await data.list('waste')).sort((a, b) => b.at - a.at);
    const week = all.filter((w) => w.at >= since);
    const total = week.reduce((s, w) => s + (+w.cost || 0), 0);
    const reasons = {};
    for (const w of week) reasons[w.reason] = (reasons[w.reason] || 0) + (+w.cost || 0);
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    view.innerHTML = `${seg}
      <div class="card"><b>Last 7 days: ${data.money(total)}</b>${top ? `<p class="muted small">Biggest cause: ${esc(top[0].toLowerCase())}</p>` : ''}</div>
      <div class="group">${all.slice(0, 60).map((w) => `<div class="row"><span class="grow"><span class="title">${esc(w.item)}${w.qty ? ', ' + esc(w.qty) : ''}</span>
        <span class="sub">${esc(w.reason)} · ${esc(w.by)} · ${fmtDate(w.at)}</span></span><span class="meta">${data.money(w.cost)}</span></div>`).join('') || '<div class="row muted">Nothing logged yet.</div>'}</div>`;
    $('#log')?.addEventListener('click', logWaste);
  }
  $$('[data-t]', view).forEach((b) => { b.onclick = () => { LS.set('costTab', b.dataset.t); costsView(); }; });
}

async function logWaste() {
  const stock = (await data.list('stock')).sort(data.byName);
  const w = await sheet({
    title: 'Log waste', right: 'Save',
    body: `<label class="field"><span>What</span><input type="text" id="w-item" list="w-items" placeholder="e.g. Romaine"><datalist id="w-items">${stock.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist></label>
      <div class="facts" style="background:none">
        <label class="field" style="margin:0"><span>How much</span><input type="text" id="w-qty" placeholder="1/2 case"></label>
        <label class="field" style="margin:0"><span>Cost</span><input type="text" inputmode="decimal" id="w-cost" placeholder="$"></label>
      </div>
      <label class="field"><span>Why</span><select id="w-why"><option>Spoiled</option><option>Past date</option><option>Dropped</option><option>Overcooked</option><option>Returned by guest</option><option>Other</option></select></label>`,
    onMount: (api) => { api.onRight = () => { const item = $('#w-item', api.el).value.trim(); if (!item) return; api.close({ item, qty: $('#w-qty', api.el).value.trim(), cost: $('#w-cost', api.el).value.trim().replace('$', ''), reason: $('#w-why', api.el).value }); }; },
  });
  if (!w) return;
  await data.put('waste', { ...w, by: session.profile.name, at: Date.now() });
  toast('Logged');
  costsView();
}
