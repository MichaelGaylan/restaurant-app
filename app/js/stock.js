// Stock counts with par levels (RRA-006), the needed-stock list (RRA-007)
// and order guides by vendor (RRA-008). Starts from the starter list (RRA-024).

import * as data from './data.js';
import { $, $$, esc, view, LS, sheet, toast, setTitle, setChrome, copy, fmtDate, session, isWide, chip, searchBox } from './ui.js';
import { canChange, canSee } from './perms.js';
import { STOCK_STATUS, STOCK_TABS, isFood } from './starter-stock.js';
import { printButtons, wirePrint } from './pdf.js';

const items = async () => (await data.list('stock')).sort((a, b) => (a.group || '').localeCompare(b.group || '') || data.byName(a, b));
const vendors = async () => (await data.list('vendor')).sort(data.byName);
const isLow = (s) => +s.par > 0 && +s.onHand < +s.par;
const need = (s) => Math.max(0, +s.par - +s.onHand);
// Status chip (RRA-051): In stock green, Low stock orange.
const status = (s) => (+s.par ? (isLow(s) ? chip('Low stock', 'orange') : chip('In stock', 'green')) : chip('No par', 'gray'));

function tabs(on) {
  return `<div class="segmented">
    <button type="button" data-go="#/stock" class="${on === 'count' ? 'on' : ''}">Count</button>
    <button type="button" data-go="#/needed" class="${on === 'needed' ? 'on' : ''}">Needed</button>
    ${canSee('orders') ? `<button type="button" data-go="#/orders" class="${on === 'orders' ? 'on' : ''}">Order guides</button>` : ''}
  </div>`;
}
function wireTabs() { $$('[data-go]', view).forEach((b) => { b.onclick = () => { location.hash = b.dataset.go; }; }); }

let editing = false;
let dirty = {};

export async function stockView(forceEdit) {
  if (forceEdit !== undefined) editing = forceEdit;
  setChrome({ tab: 'stock' });
  const change = canChange('stock');
  // Counting is for anyone who can change stock; changing the list itself
  // (add, remove, par, vendor) is for people who manage orders or Settings.
  const manage = canChange('orders') || canChange('settings');
  if (!manage) editing = false;
  const list = (await items()).map((s) => dirty[s.id] || s);
  const vs = await vendors();
  const q = (stockView.q || '').toLowerCase();
  // Tabs for food and each kind of supply (RRA-058). A search looks through all of them.
  const cat = LS.get('stockCat', 'all');
  const inCat = (s, c) => c === 'all' || (c === 'food' ? isFood(s.group) : s.group === c);
  const shown = list.filter((s) => (q ? `${s.name} ${s.group} ${s.vendor}`.toLowerCase().includes(q) : inCat(s, cat)));
  const groups = {};
  for (const s of shown) (groups[s.group || 'Other'] ||= []).push(s);
  const last = list.reduce((m, s) => (s.countedAt > (m?.countedAt || 0) ? s : m), null);
  const wide = isWide();
  const costs = canSee('costs');
  const vName = (id) => vs.find((v) => v.id === id)?.name || '';
  // Tablet and computer (RRA-051): one wide table, every group open.
  const wideTable = () => (shown.length ? `<p class="muted small">Showing ${shown.length} of ${list.length} items</p>
    <div class="wtable-wrap"><table class="wtable">
      <thead><tr><th>Item</th><th>Type</th><th>Unit</th><th class="num">On hand</th><th class="num">Par</th><th>Status</th><th>Vendor</th>${costs ? '<th class="num">Value</th>' : ''}</tr></thead>
      ${Object.entries(groups).map(([g, its]) => `<tbody><tr class="band"><td colspan="${costs ? 8 : 7}">${esc(g)} <span class="muted">· ${its.length}${its.filter(isLow).length ? ` · ${its.filter(isLow).length} low` : ''}</span></td></tr>
        ${its.map((s) => `<tr data-id="${s.id}">
          <td>${editing ? `<button class="rm" type="button" data-rm="${s.id}" aria-label="Remove ${esc(s.name)}">−</button> <span class="link" data-edit="${s.id}">${esc(s.name)}</span>` : esc(s.name)}</td>
          <td>${isFood(s.group) ? chip('Ingredient', 'blue') : chip('Supply', 'gray')}</td>
          <td>${esc(s.unit)}</td>
          <td class="num">${!editing && change ? `<span class="stepper"><button type="button" data-d="-1">−</button><b>${esc(s.onHand)}</b><button type="button" data-d="1">+</button></span>` : esc(s.onHand)}</td>
          <td class="num">${+s.par ? esc(s.par) : '—'}</td>
          <td>${status(s)}</td>
          <td>${esc(vName(s.vendor)) || '<span class="muted">—</span>'}</td>
          ${costs ? `<td class="num">${s.price ? data.money(+s.price * +s.onHand) : '—'}</td>` : ''}
        </tr>`).join('')}</tbody>`).join('')}
    </table></div>` : '<div class="empty">No stock items match.</div>');
  setTitle(editing ? 'Stock items' : 'Stock count', manage ? `<button class="btn plain small" id="edit" type="button">${editing ? 'Done' : 'Edit list'}</button>` : '');
  view.innerHTML = `
    ${editing ? '' : tabs('count')}
    ${list.some((s) => s.group && !s.par) && !editing ? `<div class="hint small">${esc(STOCK_STATUS)} Set a par for each item in Edit list.</div>` : ''}
    <div class="stock-tools">
      ${!editing && change ? `<div class="fab-row"><button class="btn fab" id="save" type="button">Save count<span id="save-n"></span></button></div>` : ''}
      ${searchBox('q', 'Search stock', stockView.q)}
    </div>
    <div class="cat-tabs" role="tablist">${STOCK_TABS.map(([k, l]) => { const n = list.filter((s) => inCat(s, k) && isLow(s)).length; return `<button type="button" data-cat="${esc(k)}" class="${!q && cat === k ? 'on' : ''}">${esc(l)}${n ? ` <i>${n}</i>` : ''}</button>`; }).join('')}</div>
    ${wide ? wideTable() : Object.entries(groups).map(([g, its]) => `
      <button class="acc-head${q || stockView.open === g ? ' open' : ''}" type="button" data-g="${esc(g)}"><span class="grow">${esc(g)}</span>
        <span class="meta">${its.filter(isLow).length ? `${chip(`${its.filter(isLow).length} low`, 'orange')} ` : ''}${its.length}</span></button>
      <div class="group acc-body"${q || stockView.open === g ? '' : ' hidden'}>${its.map((s) => `<div class="row" data-id="${s.id}">
        ${editing ? `<button class="rm" type="button" data-rm="${s.id}" aria-label="Remove ${esc(s.name)}">−</button>` : ''}
        <span class="grow"${editing ? ` data-edit="${s.id}" style="cursor:pointer"` : ''}><span class="title">${esc(s.name)}</span>
          <span class="sub">${+s.par ? `Par ${esc(s.par)} ${esc(s.unit)}` : 'No par set'}${s.vendor ? ` · ${esc(vs.find((v) => v.id === s.vendor)?.name || '')}` : ''}
          ${+s.par ? ` ${status(s)}` : ''}</span></span>
        ${editing ? '' : change
          ? `<span class="stepper"><button type="button" data-d="-1">−</button><b>${esc(s.onHand)}</b><button type="button" data-d="1">+</button></span>`
          : `<span class="meta">${esc(s.onHand)} ${esc(s.unit)}</span>`}
      </div>`).join('')}</div>`).join('') || '<div class="empty">No stock items match.</div>'}
    ${editing ? '<button class="btn tonal block" id="add" type="button">+ Add item</button>' : ''}
    <p class="muted small center">${editing ? 'Tap an item to change its par, unit or vendor. Tap the red button to remove one you no longer stock.'
      : last?.countedAt ? `Last counted by ${esc(last.countedBy)}, ${fmtDate(last.countedAt)}` : 'Not counted yet.'}</p>`;
  wireTabs();
  $$('[data-cat]', view).forEach((b) => { b.onclick = () => { LS.set('stockCat', b.dataset.cat); stockView.q = ''; stockView(); }; });
  // One section open at a time (RRA-041); a search opens every match.
  $$('.acc-head', view).forEach((h) => {
    h.onclick = () => {
      const opening = !h.classList.contains('open');
      $$('.acc-head', view).forEach((x) => { x.classList.toggle('open', false); x.nextElementSibling.hidden = true; });
      if (opening) { h.classList.add('open'); h.nextElementSibling.hidden = false; }
      stockView.open = opening ? h.dataset.g : null;
    };
  });
  const showDirty = () => { const n = Object.keys(dirty).length; const el = $('#save-n'); if (el) el.textContent = n ? ` (${n})` : ''; };
  showDirty();
  // RRA-049: the mode lives in the address, so a redraw stays on the edit page.
  $('#edit')?.addEventListener('click', () => { location.hash = editing ? '#/stock' : '#/stock-items'; });
  $('#add')?.addEventListener('click', () => itemDialog());
  $$('[data-edit]', view).forEach((el) => { el.onclick = async () => itemDialog(await data.get('stock', el.dataset.edit)); });
  $$('[data-rm]', view).forEach((b) => {
    b.onclick = async () => {
      const s = list.find((x) => x.id === b.dataset.rm);
      const ok = await sheet({ title: 'Remove item?', right: 'Remove', body: `<p>Remove <b>${esc(s.name)}</b> from the stock list?</p>` });
      if (ok) { await data.remove('stock', s.id); toast('Removed'); stockView(); }
    };
  });
  $$('.stepper button', view).forEach((b) => {
    b.onclick = () => {
      const row = b.closest('[data-id]');
      const s = dirty[row.dataset.id] || list.find((x) => x.id === row.dataset.id);
      s.onHand = Math.max(0, +s.onHand + +b.dataset.d);
      dirty[s.id] = s;
      $('b', row).textContent = s.onHand;
      showDirty();
    };
  });
  $('#save')?.addEventListener('click', async () => {
    const now = Date.now();
    for (const s of Object.values(dirty)) { s.countedAt = now; s.countedBy = session.profile.name; await data.put('stock', s); }
    const n = Object.keys(dirty).length;
    dirty = {};
    toast(n ? `Count saved (${n} item${n > 1 ? 's' : ''})` : 'No changes to save');
    stockView.q = ''; // RRA-050: back to the full list
    stockView();
  });
  const qi = $('#q');
  $('#q-x').onclick = () => { stockView.q = ''; stockView(); };
  qi.oninput = () => { stockView.q = qi.value; clearTimeout(qi.t); qi.t = setTimeout(async () => { await stockView(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
}

async function itemDialog(existing) {
  const s = existing ? { ...existing } : { name: '', unit: 'case', par: '', onHand: 0, vendor: '', group: 'Other', price: '' };
  const vs = await vendors();
  const groups = [...new Set((await items()).map((x) => x.group).filter(Boolean))];
  const ok = await sheet({
    title: existing ? 'Stock item' : 'Add stock item', right: existing ? 'Save' : 'Add',
    body: `
      <label class="field"><span>Item</span><input type="text" id="s-name" value="${esc(s.name)}" placeholder="e.g. Pickle spears"></label>
      <div class="facts" style="background:none">
        <label class="field" style="margin:0"><span>Unit</span><input type="text" id="s-unit" value="${esc(s.unit)}"></label>
        <label class="field" style="margin:0"><span>Par</span><input type="text" inputmode="decimal" id="s-par" value="${esc(s.par)}"></label>
      </div>
      <label class="field"><span>Group</span><input type="text" id="s-group" value="${esc(s.group)}" list="s-groups"><datalist id="s-groups">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist></label>
      <label class="field"><span>Vendor</span><select id="s-vendor"><option value="">None yet</option>${vs.map((v) => `<option value="${v.id}" ${v.id === s.vendor ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      ${canSee('costs') ? `<label class="field"><span>Price per ${esc(s.unit || 'unit')} (for costing)</span><input type="text" inputmode="decimal" id="s-price" value="${esc(s.price)}" placeholder="$"></label>` : ''}
      ${vs.length ? '' : '<p class="muted small">Add vendors in More → Settings → Vendors.</p>'}
      <p id="s-err" class="small" style="color:var(--danger)"></p>`,
    onMount: (api) => {
      api.onRight = () => {
        const el = api.el;
        const name = $('#s-name', el).value.trim();
        if (!name) { $('#s-err', el).textContent = 'Name the item.'; return; }
        Object.assign(s, {
          name, unit: $('#s-unit', el).value.trim() || 'each', par: $('#s-par', el).value.trim(),
          group: $('#s-group', el).value.trim() || 'Other', vendor: $('#s-vendor', el).value,
          price: $('#s-price', el) ? $('#s-price', el).value.trim().replace('$', '') : s.price,
        });
        api.close(true);
      };
    },
  });
  if (!ok) return;
  await data.put('stock', s);
  toast(existing ? 'Saved' : 'Item added');
  stockView();
}

// ------------------------------------------------------------ needed (RRA-007)

export async function neededView() {
  setChrome({ tab: 'stock' });
  setTitle('Needed stock');
  const low = (await items()).filter(isLow);
  const vs = await vendors();
  view.innerHTML = `${tabs('needed')}
    <p class="muted small">Fills itself from the latest stock count: everything below par.</p>
    <div class="group">${low.map((s) => `<div class="row"><span class="grow"><span class="title">${esc(s.name)}</span>
      <span class="sub">On hand ${esc(s.onHand)} · par ${esc(s.par)}${s.vendor ? ` · ${esc(vs.find((v) => v.id === s.vendor)?.name || '')}` : ''}</span></span>
      <span class="meta"><b>Need ${need(s)} ${esc(s.unit)}</b></span></div>`).join('') || '<div class="row muted">Nothing below par.</div>'}</div>
    ${low.length && canSee('orders') ? '<a class="btn block" href="#/orders">Build order guides</a>' : ''}`;
  wireTabs();
}

// ------------------------------------------------------------ order guides (RRA-008)

export async function ordersView() {
  setChrome({ tab: 'stock' });
  setTitle('Order guides');
  const low = (await items()).filter(isLow);
  const vs = await vendors();
  const groups = [...vs.map((v) => ({ v, its: low.filter((s) => s.vendor === v.id) })), { v: { name: 'No vendor set' }, its: low.filter((s) => !vs.some((v) => v.id === s.vendor)) }].filter((g) => g.its.length);
  const text = groups.map((g) => `${g.v.name}${g.v.deadline ? ` (order by ${g.v.deadline})` : ''}\n${g.its.map((s) => `- ${s.name}: ${need(s)} ${s.unit}`).join('\n')}`).join('\n\n');
  view.innerHTML = `${tabs('orders')}
    ${groups.map((g) => `<div class="section-label">${esc(g.v.name)}${g.v.deadline ? ` · order by ${esc(g.v.deadline)}` : ''}</div>
      <div class="group">${g.its.map((s) => `<div class="row"><span class="grow">${esc(s.name)}</span><span class="meta">${need(s)} ${esc(s.unit)}</span></div>`).join('')}</div>`).join('')
      || '<div class="empty">Nothing to order. Everything is at or above par.</div>'}
    ${groups.length ? `<div class="paper print-only"><h3>Order guides · ${new Date().toLocaleDateString()}</h3><pre style="white-space:pre-wrap;font:inherit">${esc(text)}</pre></div>
      ${printButtons()}
      <button class="btn plain block no-print" id="copy" type="button">Copy to send</button>` : ''}
    ${canChange('orders') ? '<div class="group no-print" style="margin-top:14px"><a class="row" href="#/vendors"><span class="grow">Add or remove vendors</span><span class="meta">Settings</span></a></div>' : ''}`;
  wireTabs();
  wirePrint({
    $, title: `Order guides - ${new Date().toLocaleDateString()}`,
    getLines: () => groups.flatMap((g) => [`# ${g.v.name}${g.v.deadline ? ` (order by ${g.v.deadline})` : ''}`, ...g.its.map((s) => `   ${s.name}: ${need(s)} ${s.unit}`), '']),
  });
  $('#copy')?.addEventListener('click', () => copy(text, 'Order copied'));
}

// ------------------------------------------------------------ vendors (Settings)

export async function vendorsView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Vendors');
  const vs = await vendors();
  const change = canChange('orders');
  view.innerHTML = `
    <div class="group">${vs.map((v) => `<div class="row">${change ? `<button class="rm" type="button" data-rm="${v.id}" aria-label="Remove ${esc(v.name)}">−</button>` : ''}
      <span class="grow"${change ? ` data-edit="${v.id}" style="cursor:pointer"` : ''}><span class="title">${esc(v.name)}</span><span class="sub">${esc([v.carries, v.deadline && `Order by ${v.deadline}`, v.contact].filter(Boolean).join(' · '))}</span></span></div>`).join('') || '<div class="row muted">No vendors yet.</div>'}</div>
    ${change ? '<button class="btn tonal block" id="add" type="button">+ Add vendor</button>' : ''}
    <p class="muted small">Each stock item picks one of these vendors. Order guides group what's needed by vendor.</p>`;
  $('#add')?.addEventListener('click', () => vendorDialog());
  $$('[data-edit]', view).forEach((el) => { el.onclick = () => vendorDialog(vs.find((v) => v.id === el.dataset.edit)); });
  $$('[data-rm]', view).forEach((b) => {
    b.onclick = async () => {
      const v = vs.find((x) => x.id === b.dataset.rm);
      const ok = await sheet({ title: 'Remove vendor?', right: 'Remove', body: `<p>Remove <b>${esc(v.name)}</b>? Stock items from this vendor will show under "No vendor set".</p>` });
      if (ok) { await data.remove('vendor', v.id); vendorsView(); }
    };
  });
}

async function vendorDialog(existing) {
  const v = existing ? { ...existing } : { name: '', deadline: '', contact: '' };
  const ok = await sheet({
    title: existing ? 'Vendor' : 'Add vendor', right: 'Save',
    body: `<label class="field"><span>Name</span><input type="text" id="v-name" value="${esc(v.name)}" placeholder="e.g. Sysco"></label>
      <label class="field"><span>Order deadline</span><input type="text" id="v-dl" value="${esc(v.deadline)}" placeholder="e.g. Wed 2 PM"></label>
      <label class="field"><span>Rep or phone (optional)</span><input type="text" id="v-contact" value="${esc(v.contact)}"></label>
      <label class="field"><span>What they carry (optional)</span><input type="text" id="v-carries" value="${esc(v.carries || '')}"></label>`,
    onMount: (api) => { api.onRight = () => { const n = $('#v-name', api.el).value.trim(); if (!n) return; Object.assign(v, { name: n, deadline: $('#v-dl', api.el).value.trim(), contact: $('#v-contact', api.el).value.trim(), carries: $('#v-carries', api.el).value.trim() }); api.close(true); }; },
  });
  if (!ok) return;
  await data.put('vendor', v);
  vendorsView();
}

