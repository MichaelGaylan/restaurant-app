// Recipes: the dish archive (RRA-001), house recipes (RRA-025),
// print-friendly view with batch scaling (RRA-003) and plate cost (RRA-011).

import * as data from './data.js';
import { $, $$, esc, view, LS, sheet, toast, setTitle, setChrome, fmtDate, session, isWide, chip, searchBox, oneOpen } from './ui.js';
import { canChange, canSee } from './perms.js';
import { printButtons, wirePrint } from './pdf.js';
import { loungeButton } from './lounge.js';
import { dishPhoto } from './menu.js';
import { KINDS, sectionKind, drinkKind, isAlcohol, pours } from './drinks.js';

const CATEGORIES = ['Rub', 'Sauce', 'Dressing', 'Marinade', 'Other'];
const all = async () => (await data.list('recipe')).sort(data.byName);

// ------------------------------------------------------------ list

export async function recipesView() {
  setChrome({ tab: 'recipes' });
  const kind = LS.get('recipeKind', 'dish');
  const edit = canChange('recipes');
  setTitle(kind === 'dish' ? 'Recipe archive' : 'House recipes', edit ? `<button class="btn btn-new" id="new-recipe" type="button">${kind === 'dish' ? 'UPLOAD' : 'NEW RECIPE'}</button>` : '');
  $('#new-recipe')?.addEventListener('click', () => recipeDialog(null, kind));

  const list = await all();
  STOCK_CACHE = await data.list('stock');
  const settings = await data.settings();
  const q = (recipesView.q || '').toLowerCase();
  const match = (r) => !q || [r.name, r.category, r.section, ...(r.ingredients || []).map((i) => i.item)].join(' ').toLowerCase().includes(q);
  const shown = list.filter((r) => r.kind === kind && match(r));
  const order = kind === 'dish' ? [...(settings.sections || []), 'Other'] : CATEGORIES;
  const groups = {};
  for (const r of shown) (groups[(kind === 'dish' ? r.section : r.category) || 'Other'] ||= []).push(r);
  // RRA-135: every menu section shows, even before it has a dish, so "+ Add to"
  // works for a new section like Draft Beer.
  if (kind === 'dish' && !q && edit) for (const g of settings.sections || []) groups[g] ||= [];
  // Dishes from the menu keep the menu's order; others follow by name.
  for (const g of Object.values(groups)) g.sort((a, b) => (a.menuOrder ?? 1e6) - (b.menuOrder ?? 1e6) || data.byName(a, b));
  const keys = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
  // One section open at a time, like Stock count (RRA-047). Kept per tab.
  const openKey = (recipesView.open || {})[kind];
  const lounge = await loungeButton(); // RRA-054: one tap to the lounge
  const costs = canSee('costs');
  const nameOf = (id) => list.find((x) => x.id === id)?.name;
  // Tablet and computer (RRA-051): wide tables, one section open at a time (RRA-094).
  const isOpen = (g) => !!q || openKey === g;
  const band = (g, cols, extra = '') => `<tbody><tr class="band acc-band${isOpen(g) ? ' open' : ''}" data-g="${esc(g)}"><td colspan="${cols}">${esc(g)} <span class="muted">· ${groups[g].length}</span>${extra}</td></tr></tbody><tbody${isOpen(g) ? '' : ' hidden'}>`;
  const wideTable = () => `<p class="muted small">Showing ${shown.length} of ${list.filter((r) => r.kind === kind).length} ${kind === 'dish' ? 'dishes' : 'house recipes'}</p>
    <div class="wtable-wrap"><table class="wtable">${kind === 'dish'
    ? `<thead><tr><th>Dish</th><th>Type</th><th>Uses</th><th class="num">Price</th>${costs ? '<th class="num">Plate cost</th>' : ''}</tr></thead>
      ${keys.map((g) => `${band(g, costs ? 5 : 4, edit ? ` <button class="btn plain small" type="button" data-addto="${esc(g)}">+ Add</button>` : '')}
        ${groups[g].map((r) => `<tr data-href="#/recipe/${r.id}"><td><span class="link">${esc(r.name)}</span></td><td>${chip('Dish', 'gray')}</td>
          <td>${(r.uses || []).map(nameOf).filter(Boolean).map((n) => chip(n, 'purple')).join(' ') || `<span class="muted small">${esc((r.ingredients || []).slice(0, 3).map((i) => i.item).join(', '))}</span>`}</td>
          <td class="num">${r.price ? data.money(r.price) : '—'}</td>${costs ? `<td class="num">${plateCost(r) !== null ? data.money(plateCost(r)) : '—'}</td>` : ''}</tr>`).join('')}</tbody>`).join('')}`
    : `<thead><tr><th>Recipe</th><th>Type</th><th>Yield</th><th>Storage</th><th>Used in</th></tr></thead>
      ${keys.map((g) => `${band(g, 5)}
        ${groups[g].map((r) => `<tr data-href="#/recipe/${r.id}"><td><span class="link">${esc(r.name)}</span></td><td>${chip('Sub recipe', 'purple')}</td>
          <td>${esc(r.yield || '—')}</td><td>${esc(r.storage || '—')}</td><td class="num">${list.filter((x) => (x.uses || []).includes(r.id)).length || '—'}</td></tr>`).join('')}</tbody>`).join('')}`}
    </table></div>`;
  view.innerHTML = `${lounge}
    <div class="segmented" role="tablist">
      <button data-k="dish" class="${kind === 'dish' ? 'on' : ''}" type="button">Dishes</button>
      <button data-k="house" class="${kind === 'house' ? 'on' : ''}" type="button">House recipes</button>
    </div>
    ${searchBox('q', 'Search names and ingredients', recipesView.q)}
    ${keys.length && isWide() ? wideTable() : keys.length ? keys.map((g) => `
      <button class="acc-head${q || openKey === g ? ' open' : ''}" type="button" data-g="${esc(g)}"><span class="grow">${esc(g)}</span><span class="meta">${groups[g].length}</span></button>
      <div class="group acc-body"${q || openKey === g ? '' : ' hidden'}>${groups[g].map((r) => `
        <a class="row" href="#/recipe/${r.id}">${dishPhoto(r) ? `<img src="${esc(dishPhoto(r))}" loading="lazy" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex:none">` : ''}
        <span class="grow"><span class="title">${esc(r.name)}${r.kind === 'house' ? ` ${chip('Sub recipe', 'purple')}` : ''}</span><span class="sub">${esc(subline(r, list))}</span></span>${r.kind === 'dish' && r.price ? `<span class="meta">${data.money(r.price)}</span>` : ''}</a>`).join('')}${edit && kind === 'dish' ? `<button class="row nav add-to" type="button" data-addto="${esc(g)}"><span class="grow" style="color:var(--accent)">+ Add to ${esc(g)}</span></button>` : ''}</div>`).join('')
    : `<div class="empty">${q ? 'Nothing matches that search.' : kind === 'dish'
      ? `No dishes yet.${edit ? '<br>Tap <b>UPLOAD</b> to add the first one.' : ''}`
      : `No house recipes yet.${edit ? '<br>Tap <b>NEW RECIPE</b> to add a rub, sauce or dressing.' : ''}`}</div>`}`;
  $$('.segmented button', view).forEach((b) => { b.onclick = () => { LS.set('recipeKind', b.dataset.k); recipesView(); }; });
  oneOpen(view, (g) => { recipesView.open = { ...(recipesView.open || {}), [kind]: g }; });
  $$('tr[data-href]', view).forEach((tr) => { tr.onclick = () => { location.hash = tr.dataset.href; }; });
  // RRA-086: add a menu item (a sauce, a drink) straight into its section.
  $$('[data-addto]', view).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); recipeDialog(null, 'dish', b.dataset.addto); }; });
  const qi = $('#q');
  $('#q-x').onclick = () => { recipesView.q = ''; recipesView(); };
  qi.oninput = () => { recipesView.q = qi.value; clearTimeout(qi.t); qi.t = setTimeout(async () => { await recipesView(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
}

function subline(r, list) {
  if (r.kind === 'house') return [r.yield && `Yield ${r.yield}`, r.storage].filter(Boolean).join(' · ');
  const names = (r.uses || []).map((id) => list.find((x) => x.id === id)?.name).filter(Boolean);
  return names.length ? 'Uses ' + names.join(', ') : (r.ingredients || []).slice(0, 3).map((i) => i.item).join(', ');
}

export function plateCost(r) {
  const parts = (r.ingredients || []).map((i) => parseFloat(i.cost)).filter((n) => Number.isFinite(n));
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

// ------------------------------------------------------------ detail

export async function recipeView(id) {
  setChrome({ tab: 'recipes', back: true });
  const r = await data.get('recipe', id);
  if (!r) { location.hash = '#/recipes'; return; }
  const list = await all();
  STOCK_CACHE = await data.list('stock');
  const uses = (r.uses || []).map((u) => list.find((x) => x.id === u)).filter(Boolean);
  const usedIn = list.filter((x) => (x.uses || []).includes(r.id));
  const edit = canChange('recipes');
  setTitle(r.name, edit ? '<button class="btn plain small" id="edit" type="button">Edit</button>' : '');
  $('#edit')?.addEventListener('click', () => recipeDialog(r));
  // An ingredient line that names a house recipe gets a purple chip (RRA-051).
  const house = list.filter((x) => x.kind === 'house' && x.id !== r.id && x.name.length > 3);
  const subOf = (item) => house.find((h) => String(item || '').toLowerCase().includes(h.name.toLowerCase()));
  const cost = plateCost(r);
  const showCost = canSee('costs') && cost !== null;
  view.innerHTML = `
    <div class="recipe">
      ${dishPhoto(r) ? `<img src="${esc(dishPhoto(r))}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:var(--radius);margin-bottom:8px">` : ''}
      <p><span class="chip">${r.kind === 'house' ? esc(r.category || 'House recipe') : esc(r.section || 'Dish')}</span>${r.kind === 'house' ? ` ${chip('Sub recipe', 'purple')}` : ''}</p>
      ${r.kind === 'dish' && r.desc ? `<p class="muted">${esc(r.desc)}</p>` : ''}
      ${r.kind === 'house' && (r.yield || r.storage) ? `<div class="facts">
        <div><b>Yield</b>${esc(r.yield || '—')}</div><div><b>Storage</b>${esc(r.storage || '—')}</div></div>` : ''}
      ${uses.length ? `<h2>Uses house recipes</h2><div class="group">${uses.map((u) => `<a class="row" href="#/recipe/${u.id}"><span class="grow">${esc(u.name)}</span>${chip('Sub recipe', 'purple')}</a>`).join('')}</div>` : ''}
      <h2>${r.kind === 'dish' ? 'Build' : 'Ingredients'}</h2>
      ${drinkView(r)}
      <div class="card"><ul class="ing">${(r.ingredients || []).map((i) => `<li><span class="qty">${esc(i.qty)}</span><span style="flex:1">${esc(i.item)}${subOf(i.item) ? ` <a href="#/recipe/${subOf(i.item).id}">${chip('Sub recipe', 'purple')}</a>` : ''}</span>${canSee('costs') && i.cost ? `<span class="muted small">${data.money(i.cost)}</span>` : ''}</li>`).join('')}</ul></div>
      ${showCost ? `<div class="card small"><b>Plate cost ${data.money(cost)}</b>${r.price ? ` · menu price ${data.money(r.price)} · <b>food cost ${Math.round((cost / r.price) * 100)}%</b>` : ''}</div>` : ''}
      <h2>Step by step</h2>
      <div class="card"><ol class="steps">${(r.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
      ${usedIn.length ? `<h2>Used in</h2><div class="group">${usedIn.map((u) => `<a class="row" href="#/recipe/${u.id}"><span class="grow">${esc(u.name)}</span></a>`).join('')}</div>` : ''}
      <a class="btn tonal block" href="#/print/${r.id}" style="margin-top:8px">Print recipe</a>
      <details class="comments" id="comments">
        <summary>Comments (${(r.comments || []).length})</summary>
        ${(r.comments || []).map((c) => `<div class="comment"><div class="who">${esc(c.by)} · ${fmtDate(c.at)}</div>${esc(c.text)}</div>`).join('')}
        <label class="field"><span>Add a comment</span><textarea id="c-text" style="min-height:64px"></textarea></label>
        <button class="btn tonal small" id="c-add" type="button">Add comment</button>
      </details>
      <p class="muted small" style="margin-top:24px">Added by ${esc(r.by || '—')} · updated ${fmtDate(r.updated || r.created)}</p>
      ${edit ? '<button class="btn danger block" id="del" type="button">Delete recipe</button>' : ''}
    </div>`;
  $('#c-add').onclick = async () => {
    const text = $('#c-text').value.trim();
    if (!text) return;
    r.comments = [...(r.comments || []), { by: session.profile.name, at: Date.now(), text }];
    await data.put('recipe', r);
    await recipeView(id);
    $('#comments').open = true;
  };
  $('#del')?.addEventListener('click', async () => {
    const ok = await sheet({
      title: 'Delete recipe?', right: 'Delete',
      body: `<p>Delete <b>${esc(r.name)}</b>?${usedIn.length ? ` It is used in ${usedIn.length} dish${usedIn.length > 1 ? 'es' : ''}; those links will be removed.` : ''}</p>`,
    });
    if (!ok) return;
    for (const d of usedIn) { d.uses = d.uses.filter((u) => u !== r.id); await data.put('recipe', d); }
    await data.remove('recipe', r.id);
    toast('Recipe deleted');
    location.hash = '#/recipes';
  });
}

// ------------------------------------------------------------ print (RRA-003)

const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
export function scaleQty(qty, k) {
  if (k === 1 || !qty) return qty || '';
  const m = String(qty).trim().match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+|[½¼¾⅓⅔⅛])\s*(.*)$/);
  if (!m) return `${qty} ×${k}`;
  let n = m[1];
  if (FRAC[n]) n = FRAC[n];
  else if (n.includes('/')) { const [w, f] = n.includes(' ') ? n.split(/\s+/) : ['0', n]; const [a, b] = f.split('/'); n = +w + a / b; }
  const v = +n * k;
  const pretty = Number.isInteger(v) ? String(v) : String(+v.toFixed(2));
  return `${pretty}${m[2] ? ' ' + m[2] : ''}`;
}

export async function printView(id) {
  setChrome({ tab: 'recipes', back: true });
  const r = await data.get('recipe', id);
  if (!r) { location.hash = '#/recipes'; return; }
  const k = printView.k || 1;
  setTitle('Print recipe');
  view.innerHTML = `
    <div class="segmented no-print">${[1, 2, 3, 4].map((s) => `<button type="button" data-k="${s}" class="${s === k ? 'on' : ''}">×${s} batch</button>`).join('')}</div>
    <div class="paper">
      <h3>${esc(r.name)}${k > 1 ? ` <small>(×${k})</small>` : ''}</h3>
      <div class="paper-meta">${esc(r.kind === 'house' ? r.category || 'House recipe' : r.section || 'Dish')}${r.yield ? ` · yield ${esc(scaleQty(r.yield, k))}` : ''}${r.storage ? ` · ${esc(r.storage)}` : ''} · printed ${new Date().toLocaleDateString()}</div>
      <table>${(r.ingredients || []).map((i) => `<tr><td><b>${esc(scaleQty(i.qty, k))}</b></td><td>${esc(i.item)}</td></tr>`).join('')}</table>
      <ol>${(r.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="paper-foot">${esc(globalThis.BRAND.restaurant)} · Proprietary, do not share</div>
    </div>
    ${printButtons()}`;
  $$('.segmented button', view).forEach((b) => { b.onclick = () => { printView.k = +b.dataset.k; printView(id); }; });
  wirePrint({
    $, title: `${r.name}${k > 1 ? ` (x${k} batch)` : ''}`,
    getLines: () => [
      `${r.kind === 'house' ? r.category || 'House recipe' : r.section || 'Dish'}${r.yield ? ` - yield ${scaleQty(r.yield, k)}` : ''}${r.storage ? ` - ${r.storage}` : ''}`,
      '',
      ...((r.ingredients || []).length ? ['# Ingredients', ...(r.ingredients || []).filter((i) => i.item || i.qty).map((i) => `   ${scaleQty(i.qty, k) || ''}  ${i.item || ''}`), ''] : []),
      ...((r.steps || []).length ? ['# Steps', ...(r.steps || []).map((s, i) => `${i + 1}. ${s}`), ''] : []),
      'Proprietary, do not share.',
    ],
  });
}

// ------------------------------------------------------------ editor

// RRA-135: what kind of drink it is, and which bottles each one counts down.
let STOCK_CACHE = [];
function drinkView(r) {
  if (r.kind !== 'dish') return '';
  const k = drinkKind(r);
  if (!k) return '';
  const ps = pours(r, STOCK_CACHE);
  return `<p>${chip(KINDS()[k] || 'Drink', isAlcohol(k) ? 'orange' : 'blue')} ${isAlcohol(k) ? chip('21+ · bar ticket', 'gray') : ''}${r.hhPrice ? ` ${chip('Happy hour ' + data.money(r.hhPrice), 'green')}` : ''}</p>
    ${ps.length ? `<p class="muted small">Each one sold counts down: ${ps.map((p) => `${esc(p.name)} ${p.used < 0.1 ? (p.used * 100).toFixed(1) + '%' : Math.round(p.used * 100) + '%'} of a ${esc(STOCK_CACHE.find((s) => s.id === p.id)?.unit || 'unit')}`).join(', ')}</p>` : isAlcohol(k) ? '<p class="muted small">No pours linked to Stock yet. Write them as ingredients (like 1.5 oz Well vodka) to count bottles down.</p>' : ''}`;
}

async function photoFrom(file) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i); i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const max = 900;
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', 0.72);
}

export async function recipeDialog(existing, kind = 'house', section = null) {
  const settings = await data.settings();
  const r = existing ? structuredClone(existing) : { kind, category: 'Sauce', section: section || (settings.sections || [])[0], ingredients: [{}, {}], steps: [], uses: [], comments: [] };
  const house = (await all()).filter((x) => x.kind === 'house' && x.id !== r.id);
  const costs = canSee('costs');
  const stock = (await data.list('stock')).sort(data.byName);
  const ingRow = (i = {}) => `
    <div class="ing-edit${costs ? ' with-cost' : ''}"><input type="text" placeholder="Qty" value="${esc(i.qty || '')}" aria-label="Quantity">
    <input type="text" placeholder="Ingredient" value="${esc(i.item || '')}" aria-label="Ingredient" list="r-stock">
    ${costs ? `<input type="text" inputmode="decimal" placeholder="$" value="${esc(i.cost || '')}" aria-label="Cost">` : ''}
    <button type="button" aria-label="Remove">×</button></div>`;
  const saved = await sheet({
    title: existing ? 'Edit recipe' : r.kind === 'dish' ? 'New dish' : 'New recipe', right: 'Save',
    body: `
      <label class="field"><span>Name</span><input type="text" id="r-name" value="${esc(r.name || '')}" placeholder="${r.kind === 'dish' ? ('e.g. ' + (globalThis.BRAND.dishExample || 'Classic Burger')) : 'e.g. Honey Sriracha wing sauce'}" autocomplete="off"></label>
      <div class="segmented" id="r-kind">
        <button type="button" data-k="dish">Dish</button><button type="button" data-k="house">House recipe</button>
      </div>
      <div id="house-only">
        <label class="field"><span>Type</span><select id="r-cat">${CATEGORIES.map((c) => `<option ${c === r.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <div id="dish-only-1">
        <label class="field"><span>Menu section</span><select id="r-sec">${[...(settings.sections || []), 'Other'].map((c) => `<option ${c === r.section ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>${dishPhoto(r) ? 'Replace photo' : 'Photo'}</span><input type="file" id="r-photo" accept="image/*"></label>
        ${dishPhoto(r) ? `<div id="r-photo-prev"><img src="${esc(dishPhoto(r))}" alt="" style="width:120px;border-radius:8px">${r.photo ? ' <button type="button" class="btn plain small" id="r-photo-del">Remove photo</button>' : ' <span class="muted small">Standard picture</span>'}</div>` : ''}
        <label class="field"><span>Description (optional)</span><input type="text" id="r-desc" value="${esc(r.desc || '')}" placeholder="e.g. Low-carb light lager"></label>
        <label class="field"><span>Drink</span><select id="r-drink">
          <option value="">${esc(sectionKind(r.section) ? `Same as the section (${KINDS()[sectionKind(r.section)]})` : 'Same as the section (food)')}</option>
          <option value="food" ${r.drink === 'food' ? 'selected' : ''}>Not a drink (food)</option>
          ${Object.entries(KINDS()).map(([k, n]) => `<option value="${k}" ${r.drink === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <p class="muted small drink-hint" style="margin:-4px 4px 8px">Beer, wine, liquor and mixed drinks go to the bar and ask for a 21+ ID check. For pours, write the amount (like 1.5 oz) and pick the bottle from Stock, so each drink sold counts it down.</p>
      </div>
      <div class="field"><span class="muted small" style="margin-left:4px">Ingredients and quantities${costs ? ' (cost per plate is optional)' : ''}<span class="dish-opt"> · optional for menu items like sauces and drinks</span></span>
        <datalist id="r-stock">${stock.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>
        <div id="r-ings" style="margin-top:6px">${(r.ingredients.length ? r.ingredients : [{}]).map(ingRow).join('')}</div>
        <button class="btn plain small" id="r-add-ing" type="button">+ Add ingredient</button>
      </div>
      <label class="field"><span>Instructions (one step per line)</span><textarea id="r-steps" placeholder="One step per line">${esc((r.steps || []).join('\n'))}</textarea></label>
      <div id="house-only-2" class="facts" style="background:none">
        <label class="field" style="margin:0"><span>Yield</span><input type="text" id="r-yield" value="${esc(r.yield || '')}" placeholder="e.g. 2 qt"></label>
        <label class="field" style="margin:0"><span>Storage</span><input type="text" id="r-storage" value="${esc(r.storage || '')}" placeholder="e.g. Walk-in, 7 days"></label>
      </div>
      <div id="dish-only">
        ${costs ? `<div class="facts" style="background:none">
          <label class="field" style="margin:0"><span>Menu price</span><input type="text" inputmode="decimal" id="r-price" value="${esc(r.price || '')}" placeholder="e.g. 13.99"></label>
          <label class="field" style="margin:0"><span>Happy hour price</span><input type="text" inputmode="decimal" id="r-hh" value="${esc(r.hhPrice || '')}" placeholder="optional"></label>
        </div>` : ''}
        <div class="section-label" style="margin-left:4px">Uses house recipes</div>
        <div class="checks">${house.length ? house.map((h) => `<label><input type="checkbox" value="${h.id}" ${(r.uses || []).includes(h.id) ? 'checked' : ''}>${esc(h.name)}</label>`).join('') : '<p class="muted small">No house recipes yet.</p>'}</div>
      </div>
      <details class="comments" style="margin-top:12px">
        <summary>Comments</summary>
        <textarea id="r-comment" placeholder="Optional note for the team" style="min-height:64px"></textarea>
      </details>
      <p id="r-err" class="small" style="color:var(--danger)"></p>`,
    onMount: (api) => {
      const el = api.el;
      const setKind = (k) => {
        r.kind = k;
        $$('#r-kind button', el).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
        $('#house-only', el).hidden = k !== 'house';
        $('#house-only-2', el).hidden = k !== 'house';
        $('#dish-only', el).hidden = k !== 'dish';
        $('#dish-only-1', el).hidden = k !== 'dish';
        $$('.dish-opt', el).forEach((x) => { x.hidden = k !== 'dish'; });
      };
      setKind(r.kind);
      $$('#r-kind button', el).forEach((b) => { b.onclick = () => setKind(b.dataset.k); });
      const wireRemove = () => $$('.ing-edit button', el).forEach((b) => { b.onclick = () => { if ($$('.ing-edit', el).length > 1) b.parentElement.remove(); }; });
      wireRemove();
      $('#r-add-ing', el).onclick = () => { $('#r-ings', el).insertAdjacentHTML('beforeend', ingRow()); wireRemove(); $('#r-ings .ing-edit:last-child input', el).focus(); };
      $('#r-photo', el).onchange = async (e) => { const f = e.target.files[0]; if (f) { r.photo = await photoFrom(f); toast('Photo added'); } };
      $('#r-photo-del', el)?.addEventListener('click', () => { r.photo = ''; $('#r-photo-prev', el).remove(); toast('Photo removed. The standard picture shows, if there is one.'); });
      api.onRight = () => {
        const name = $('#r-name', el).value.trim();
        const ingredients = $$('.ing-edit', el).map((row) => { const [q, i, c] = $$('input', row); return { qty: q.value.trim(), item: i.value.trim(), cost: c ? c.value.trim().replace('$', '') : undefined }; }).filter((i) => i.item);
        const steps = $('#r-steps', el).value.split('\n').map((s) => s.trim()).filter(Boolean);
        // RRA-086: a dish (a menu item like a sauce or a drink) only needs a name;
        // ingredients and instructions are optional. House recipes need both.
        const isDish = r.kind === 'dish';
        const err = !name ? 'Give it a name.' : !isDish && !ingredients.length ? 'Add at least one ingredient.' : !isDish && !steps.length ? 'Add the instructions.' : '';
        if (err) { $('#r-err', el).textContent = err; return; }
        const comment = $('#r-comment', el).value.trim();
        const house = r.kind === 'house';
        Object.assign(r, {
          name, ingredients, steps,
          category: house ? $('#r-cat', el).value : undefined,
          section: house ? undefined : $('#r-sec', el).value,
          yield: house ? $('#r-yield', el).value.trim() : undefined,
          storage: house ? $('#r-storage', el).value.trim() : undefined,
          price: !house && $('#r-price', el) ? $('#r-price', el).value.trim().replace('$', '') : r.price,
          hhPrice: !house && $('#r-hh', el) ? $('#r-hh', el).value.trim().replace('$', '') || undefined : r.hhPrice,
          drink: house ? undefined : $('#r-drink', el).value || undefined,
          desc: house ? undefined : $('#r-desc', el).value.trim() || undefined,
          photo: house ? '' : r.photo || '',
          uses: house ? [] : $$('#dish-only input:checked', el).map((c) => c.value),
          comments: comment ? [...(r.comments || []), { by: session.profile.name, at: Date.now(), text: comment }] : r.comments || [],
        });
        api.close(true);
      };
    },
  });
  if (!saved) return;
  if (!r.by) r.by = session.profile.name;
  await data.put('recipe', r);
  LS.set('recipeKind', r.kind);
  toast(existing ? 'Saved' : 'Recipe added');
  if (location.hash === `#/recipe/${r.id}`) recipeView(r.id); else location.hash = `#/recipe/${r.id}`;
}
