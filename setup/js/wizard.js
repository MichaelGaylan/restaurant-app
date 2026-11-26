// Restaurant Setup wizard (RSW): makes one restaurant's version of the shared
// app. Details → Pictures → Color → Menu → Preview → Produce. Drafts are kept on this
// device only, so a half-done setup is still there next time.

import { $, $$, esc, view, LS, toast, copy, sheet, THEMES, getTheme, setTheme } from '../../app/js/ui.js';
import { RESERVED, slug, brandOf, brandJs, restaurantFiles } from './generate.js';
import { zip } from './zip.js';
import { TEMPLATES, BLANK, KINDS, fromTemplate, parseMenu, guessKind } from './menus.js';
import { CODE_OWNER_LINE } from '../../app/js/owner.js';

export const VERSION = '0.2.0';
export const BUILD = '2026.11.26-1';
const WHATS_NEW = [
  { version: '0.2.0', build: '2026.11.26-1', date: '2026-11-26', lines: [
    'New Menu step: start from a Bar & grill, Pizza & Italian, Café & breakfast or Mexican menu (or empty), change any section, dish or price, or paste a menu from the restaurant\'s website. The food and bar stock list comes with it.',
    'The preview shows the menu in Recipes and Orders.',
    'Restaurants made here now run on the shared app 0.15.0, the same as Bootleggers Kitchen 0.14.1.',
  ] },
  { version: '0.1.0', build: '2026.11.22-1', date: '2026-11-22', lines: [
    'First prototype: enter the restaurant details, upload a logo and app icon (the 180px icon and 32px favicon are made for you), pick an accent color, preview it on an iPhone-sized screen, then download that restaurant\'s folder.',
  ] },
];
const SITE = new URL('../', location.href).href; // where the restaurants live (…/restaurant-app/)
const STEPS = ['Details', 'Pictures', 'Color', 'Menu', 'Preview', 'Produce'];
const PREVIEW = STEPS.indexOf('Preview');
const ACCENTS = [['#c8102e', 'Red'], ['#e35205', 'Orange'], ['#b8860b', 'Gold'], ['#1f7a3a', 'Green'], ['#00778b', 'Teal'], ['#0057b8', 'Blue'], ['#5b2a86', 'Purple'], ['#3a3a3c', 'Graphite']];

// ------------------------------------------------------------ drafts (IndexedDB)

const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('rsw-setup', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'key' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const d = await dbp; return new Promise((res, rej) => { const t = d.transaction('drafts', mode); const q = fn(t.objectStore('drafts')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
const drafts = { all: () => tx('readonly', (s) => s.getAll()), put: (d) => tx('readwrite', (s) => s.put(d)), del: (k) => tx('readwrite', (s) => s.delete(k)) };

const blank = () => ({ key: 'd' + Date.now().toString(36), step: 0, restaurant: '', shortName: '', appName: '', location: '', credit: LS.get('credit', ''), id: '', idTouched: false, accent: null, iconMode: 'letter', iconBg: '#ffffff', logo: null, icon: null, video: null, menuKey: '', menu: [], stock: [], posChoices: {}, dishExample: '', updated: Date.now() });
let cur = blank();
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { cur.updated = Date.now(); drafts.put(cur).catch(() => {}); }, 300); };

// ------------------------------------------------------------ pictures

const loadImg = (blob) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
const bytes = async (b) => new Uint8Array(await b.arrayBuffer());

const iconMode = () => (cur.icon && (cur.iconMode === 'fill' || cur.iconMode === 'fit')) ? cur.iconMode : (cur.iconMode === 'logo' && cur.logo ? 'logo' : 'letter');

// Square icon at `size`: from the icon picture (fill = crop the middle, fit = whole
// picture on a background), or from the logo on the accent color.
async function makeIcon(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  const mode = cur.icon && (cur.iconMode === 'fill' || cur.iconMode === 'fit') ? cur.iconMode : (cur.iconMode === 'logo' && cur.logo ? 'logo' : 'letter');
  const src = mode === 'logo' ? cur.logo : cur.icon;
  g.fillStyle = mode === 'logo' || mode === 'letter' ? (cur.accent || '#1c1c1e') : cur.iconBg; g.fillRect(0, 0, size, size);
  if (mode === 'letter') {
    // The short name's first letter, white on the accent color.
    const t = (cur.shortName.trim() || cur.restaurant.trim() || '?')[0].toUpperCase();
    g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(size * 0.58)}px -apple-system, system-ui, Helvetica, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, size / 2, size * 0.54);
    return toBlob(c);
  }
  const im = await loadImg(src);
  const w = im.naturalWidth, h = im.naturalHeight;
  if (mode === 'fill') { const s = Math.min(w, h); g.drawImage(im, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size); }
  else { const pad = mode === 'logo' ? 0.14 : 0.06, box = size * (1 - 2 * pad), k = Math.min(box / w, box / h); g.drawImage(im, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k); }
  return toBlob(c);
}
// The header logo, as a PNG no wider than 1200px.
async function makeLogo() {
  const im = await loadImg(cur.logo);
  const k = Math.min(1, 1200 / im.naturalWidth, 400 / im.naturalHeight);
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
  return toBlob(c);
}
let urls = [];
const url = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
const freeUrls = () => { urls.forEach(URL.revokeObjectURL); urls = []; };

// ------------------------------------------------------------ checks

const shortOk = () => cur.shortName.trim().length > 0 && cur.shortName.trim().length <= 12;
function problems() {
  const p = [];
  if (!cur.restaurant.trim()) p.push(['Details', 'Restaurant name is missing']);
  if (!cur.shortName.trim()) p.push(['Details', 'Short name is missing']);
  else if (!shortOk()) p.push(['Details', 'Short name is longer than 12 letters, so iPhone will cut it off under the icon']);
  if (!cur.id) p.push(['Details', 'Restaurant ID is missing']);
  else if (RESERVED.includes(cur.id)) p.push(['Details', `"${cur.id}" is taken, pick another ID`]);
  if (!cur.logo) p.push(['Pictures', 'Logo is missing']);
  return p;
}
const brand = () => brandOf({ ...cur, restaurant: cur.restaurant.trim(), shortName: cur.shortName.trim(), appName: cur.appName.trim(), location: cur.location.trim(), credit: cur.credit.trim(), hasVideo: !!cur.video });

// ------------------------------------------------------------ chrome

function chrome(tab, title, back = false) {
  $$('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  $('#btn-back').hidden = !back;
  $('#title').textContent = title;
  $('#title-action').innerHTML = '';
  window.scrollTo(0, 0);
}
$('#btn-back').onclick = () => history.back();

const stepper = () => `<div class="rsw-steps">${STEPS.map((s, i) => `<button type="button" data-step="${i}" class="${i === cur.step ? 'on' : ''}${i < cur.step ? ' done' : ''}"><b>${i + 1}</b><span>${s}</span></button>`).join('')}</div>`;
const navBtns = () => `<div class="btn-row rsw-nav">${cur.step > 0 ? '<button class="btn tonal" id="prev" type="button">Back</button>' : '<span></span>'}${cur.step < STEPS.length - 1 ? '<button class="btn" id="next" type="button">Next</button>' : ''}</div>`;
function wireSteps() {
  $$('.rsw-steps button').forEach((b) => { b.onclick = () => { cur.step = +b.dataset.step; save(); setupView(); }; });
  $('#prev') && ($('#prev').onclick = () => { cur.step--; save(); setupView(); });
  $('#next') && ($('#next').onclick = () => { cur.step++; save(); setupView(); });
}

// ------------------------------------------------------------ Setup tab

async function setupView() {
  chrome(cur.step === PREVIEW ? 'preview' : 'setup', cur.restaurant.trim() || 'New restaurant');
  freeUrls();
  const body = [detailsStep, picturesStep, colorStep, menuStep, previewStep, produceStep][cur.step] || detailsStep;
  view.innerHTML = stepper() + '<div id="step"></div>' + navBtns();
  await body($('#step'));
  wireSteps();
}

function detailsStep(el) {
  const link = cur.id ? `${SITE}r/${cur.id}/` : '';
  el.innerHTML = `
    <div class="card">
      <label class="field"><span>Restaurant name</span><input type="text" id="f-restaurant" value="${esc(cur.restaurant)}" placeholder="e.g. Harbor Street Grill" autocomplete="off"></label>
      <label class="field"><span>Short name (under the home-screen icon, 12 letters at most)</span><input type="text" id="f-short" value="${esc(cur.shortName)}" placeholder="e.g. Harbor" autocomplete="off"><small id="short-n" class="small muted"></small></label>
      <label class="field"><span>App name (page title and About)</span><input type="text" id="f-app" value="${esc(cur.appName)}" placeholder="${esc((cur.shortName.trim() || 'Harbor') + ' Kitchen')}" autocomplete="off"></label>
      <label class="field"><span>Location</span><input type="text" id="f-location" value="${esc(cur.location)}" placeholder="e.g. Savannah, GA" autocomplete="off"></label>
      <label class="field"><span>© credit line (shown in About, leave empty to hide)</span><input type="text" id="f-credit" value="${esc(cur.credit)}" placeholder="e.g. © 2026 Your Brand" autocomplete="off"></label>
    </div>
    <div class="section-label">Restaurant ID</div>
    <div class="card">
      <label class="field" style="margin-top:0"><span>Used for its link and its own data space. Can't be changed once it's live.</span><input type="text" id="f-id" value="${esc(cur.id)}" placeholder="harbor" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <p class="small muted" id="id-link">${link ? `Its link will be <b>${esc(link)}</b>` : 'Fills in from the short name.'}</p>
    </div>`;
  const upd = () => {
    const n = cur.shortName.trim().length;
    $('#short-n', el).textContent = n ? `${n} of 12${n > 12 ? ': too long, iPhone will cut it off' : ''}` : '';
    $('#short-n', el).classList.toggle('danger-text', n > 12);
    $('#f-app', el).placeholder = (cur.shortName.trim() || 'Harbor') + ' Kitchen';
    $('#f-id', el).value = cur.id;
    const bad = RESERVED.includes(cur.id);
    $('#id-link', el).innerHTML = bad ? `<span class="danger-text">"${esc(cur.id)}" is taken, pick another ID.</span>` : cur.id ? `Its link will be <b>${esc(SITE + 'r/' + cur.id + '/')}</b>` : 'Fills in from the short name.';
  };
  const bind = (id, k, after) => { $(id, el).oninput = (e) => { cur[k] = e.target.value; after?.(); upd(); save(); }; };
  bind('#f-restaurant', 'restaurant', () => { $('#title').textContent = cur.restaurant.trim() || 'New restaurant'; if (!cur.idTouched && !cur.shortName) cur.id = slug(cur.restaurant); });
  bind('#f-short', 'shortName', () => { if (!cur.idTouched) cur.id = slug(cur.shortName || cur.restaurant); });
  bind('#f-app', 'appName'); bind('#f-location', 'location');
  bind('#f-credit', 'credit', () => LS.set('credit', cur.credit));
  $('#f-id', el).oninput = (e) => { cur.idTouched = true; cur.id = slug(e.target.value); upd(); save(); };
  $('#f-id', el).onblur = () => { $('#f-id', el).value = cur.id; };
  upd();
}

async function picturesStep(el) {
  const icons = await Promise.all([makeIcon(180), makeIcon(32)]);
  el.innerHTML = `
    <div class="section-label">Logo (pinned at the top of every screen)</div>
    <div class="card">
      <div class="rsw-logo-box">${cur.logo ? `<img src="${url(cur.logo)}" alt="Logo">` : '<span class="muted small">No logo yet</span>'}</div>
      <p class="small muted">A wide PNG with a see-through background works best. It is shown about 64 points tall.</p>
      <label class="btn tonal block rsw-file">${cur.logo ? 'Change logo' : 'Upload logo'}<input type="file" id="u-logo" accept="image/*"></label>
    </div>
    <div class="section-label">App icon</div>
    <div class="card">
      <div class="segmented" id="icon-mode">
        ${[['letter', 'Letter'], ['logo', 'Logo'], ['fill', 'Fill'], ['fit', 'Fit']].map(([k, v]) => `<button type="button" data-k="${k}" class="${iconMode() === k ? 'on' : ''}"${(k === 'fill' || k === 'fit') && !cur.icon ? ' disabled' : ''}${k === 'logo' && !cur.logo ? ' disabled' : ''}>${v}</button>`).join('')}
      </div>
      ${`<div class="rsw-icons">
        <figure><img src="${url(icons[0])}" width="90" height="90" class="rsw-ios-icon" alt=""><figcaption>Home screen 180px</figcaption></figure>
        <figure><img src="${url(icons[1])}" width="32" height="32" alt=""><figcaption>Favicon 32px</figcaption></figure>
      </div>`}
      <p class="small muted">${{ letter: 'The first letter of the short name on the accent color.', logo: 'The whole logo on the accent color. Best for a square or round logo.', fill: 'Your icon picture, cropped to a square.', fit: 'Your whole icon picture on a background color.' }[iconMode()]} A square picture (at least 512 × 512) gives the best icon.</p>
      ${iconMode() === 'fit' ? `<label class="field"><span>Background</span><input type="color" id="icon-bg" value="${esc(cur.iconBg)}"></label>` : ''}
      <div class="btn-row">
        <label class="btn tonal rsw-file">${cur.icon ? 'Change icon picture' : 'Upload icon picture'}<input type="file" id="u-icon" accept="image/*"></label>
        ${cur.icon ? '<button class="btn plain" id="rm-icon" type="button">Remove</button>' : ''}
      </div>
    </div>
    <div class="section-label">Startup video (optional)</div>
    <div class="card">
      <p class="small">${cur.video ? `Video added: ${(cur.video.size / 1048576).toFixed(1)} MB.${cur.video.size > 8 * 1048576 ? ' <span class="danger-text">That\'s large: phones will be slow to open the app the first time. Under 5 MB is best.</span>' : ''}` : 'Plays once when the app opens the first time and after updates. Without one, the app opens straight to its welcome card.'}</p>
      <div class="btn-row">
        <label class="btn tonal rsw-file">${cur.video ? 'Change video' : 'Add an MP4 video'}<input type="file" id="u-video" accept="video/mp4"></label>
        ${cur.video ? '<button class="btn plain" id="rm-video" type="button">Remove</button>' : ''}
      </div>
    </div>`;
  const pick = (id, k, after) => { $(id, el).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (k !== 'video') { try { await loadImg(f); } catch { toast("That picture can't be opened. Try a PNG or JPEG."); return; } }
    cur[k] = f; after?.(); save(); picturesStep(el).then(wireSteps);
  }; };
  pick('#u-logo', 'logo'); pick('#u-icon', 'icon', () => { cur.iconMode = 'fill'; }); pick('#u-video', 'video');
  $$('#icon-mode button', el).forEach((b) => { b.onclick = () => { cur.iconMode = b.dataset.k; save(); picturesStep(el); }; });
  $('#icon-bg', el) && ($('#icon-bg', el).onchange = (e) => { cur.iconBg = e.target.value; save(); picturesStep(el); });
  $('#rm-icon', el) && ($('#rm-icon', el).onclick = () => { cur.icon = null; cur.iconMode = 'letter'; save(); picturesStep(el); });
  $('#rm-video', el) && ($('#rm-video', el).onclick = () => { cur.video = null; save(); picturesStep(el); });
}

function colorStep(el) {
  const on = cur.accent;
  el.innerHTML = `
    <div class="card">
      <p class="small muted" style="margin-top:0">The accent color is used for buttons, links and the selected tab.</p>
      <div class="segmented" id="acc-mode"><button type="button" data-k="sys" class="${on ? '' : 'on'}">System blue</button><button type="button" data-k="own" class="${on ? 'on' : ''}">Restaurant color</button></div>
      ${on ? `<div class="rsw-swatches">${ACCENTS.map(([c, n]) => `<button type="button" class="rsw-sw${c === on ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="${n}"></button>`).join('')}
        <label class="rsw-sw rsw-sw-own" aria-label="Pick any color" style="background:${esc(on)}"><input type="color" id="acc-any" value="${esc(on)}"></label></div>
        <label class="field"><span>Color code</span><input type="text" id="acc-hex" value="${esc(on)}" autocapitalize="off" spellcheck="false"></label>` : '<p class="small muted">Uses Apple\'s and Android\'s own blue, the same as Bootleggers.</p>'}
    </div>
    <div class="section-label">Sample</div>
    <div class="card rsw-sample" style="${on ? `--accent:${esc(on)}` : ''}">
      <div class="btn-row"><button class="btn" type="button">Continue</button><button class="btn tonal" type="button">Paste</button></div>
      <p style="margin-bottom:0"><a href="#/setup" onclick="return false">A link looks like this</a></p>
    </div>`;
  const set = (c) => { cur.accent = c; save(); colorStep(el); };
  $$('#acc-mode button', el).forEach((b) => { b.onclick = () => set(b.dataset.k === 'own' ? (cur.lastAccent || ACCENTS[0][0]) : null); });
  $$('.rsw-sw[data-c]', el).forEach((b) => { b.onclick = () => { cur.lastAccent = b.dataset.c; set(b.dataset.c); }; });
  $('#acc-any', el) && ($('#acc-any', el).onchange = (e) => { cur.lastAccent = e.target.value; set(e.target.value); });
  $('#acc-hex', el) && ($('#acc-hex', el).onchange = (e) => { const v = e.target.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(v)) { const c = v.startsWith('#') ? v : '#' + v; cur.lastAccent = c; set(c.toLowerCase()); } else toast('Use a 6-digit color code like #c8102e'); });
}

// ------------------------------------------------------------ menu (RSW-020)

const dishCount = () => (cur.menu || []).reduce((n, m) => n + m.items.length, 0);
async function useTemplate(t, el) {
  if (cur.menuEdited && dishCount()) {
    const ok = await sheet({ title: t.name, left: 'Cancel', right: 'Replace', body: `<p>Replace the menu you have now (${dishCount()} dishes) with the ${esc(t.name)} menu? Your changes to it are lost.</p>` });
    if (!ok) return;
  }
  Object.assign(cur, fromTemplate(t), { menuEdited: false });
  save(); menuStep(el);
}
function menuStep(el) {
  cur.menu = cur.menu || []; cur.stock = cur.stock || [];
  const kindSel = (k) => KINDS.map(([v, t]) => `<option value="${v}"${v === (k || '') ? ' selected' : ''}>${t}</option>`).join('');
  el.innerHTML = `
    <div class="section-label">Start from</div>
    <div class="group">${[...TEMPLATES, BLANK].map((t) => `<button class="row nav" type="button" data-tpl="${t.key}"><span class="grow"><span class="title">${esc(t.name)}${cur.menuKey === t.key ? ' <span class="rsw-on">✓</span>' : ''}</span><span class="sub">${esc(t.blurb)}</span></span></button>`).join('')}</div>
    <button class="btn tonal block" id="m-paste" type="button" style="margin-top:10px">Paste a menu</button>
    <p class="small muted">Typical prices to start from: check them with the restaurant. A dish with no price stays in Recipes but doesn't show in Orders.</p>
    <div class="section-label">Menu${cur.menu.length ? ` · ${dishCount()} dishes` : ''}</div>
    ${cur.menu.length ? '' : '<p class="small muted">No starter menu: the restaurant adds its dishes in Recipes.</p>'}
    ${cur.menu.map((m, si) => `
      <div class="card rsw-sec" data-si="${si}">
        <div class="rsw-sec-head">
          <input type="text" class="rsw-sec-name" value="${esc(m.section)}" placeholder="Section name" aria-label="Section name">
          <select class="rsw-kind" aria-label="What this section holds">${kindSel(m.kind)}</select>
          <button class="icon-btn rsw-x" type="button" data-rm-sec aria-label="Remove section">×</button>
        </div>
        ${m.items.map(([n, p], ii) => `<div class="rsw-item" data-ii="${ii}">
          <input type="text" class="rsw-name" value="${esc(n)}" placeholder="Dish name" aria-label="Dish name">
          <input type="text" class="rsw-price" value="${esc(p)}" placeholder="0.00" inputmode="decimal" aria-label="Price">
          <button class="icon-btn rsw-x" type="button" data-rm-item aria-label="Remove dish">×</button></div>`).join('')}
        <button class="btn plain small" type="button" data-add-item>+ Add dish</button>
      </div>`).join('')}
    <button class="btn tonal block" id="m-add-sec" type="button">+ Add section</button>
    <div class="section-label">Starter stock (food and bar)</div>
    ${cur.stock.length ? cur.stock.map((g, gi) => `
      <details class="card rsw-stock" data-gi="${gi}"><summary><b>${esc(g.group)}</b> <span class="muted small">${g.items.length} items</span></summary>
        <label class="field"><span>One item per line: name, unit</span><textarea rows="${Math.min(12, g.items.length + 1)}" class="rsw-stock-t">${esc(g.items.map(([n, u]) => (u ? `${n}, ${u}` : n)).join('\n'))}</textarea></label>
      </details>`).join('') : '<p class="small muted">None: the restaurant adds its food and bar items in Stock.</p>'}
    <p class="small muted">Cleaning, paper and to-go, smallwares, linens and common vendors are added for every restaurant.</p>`;

  const touched = () => { cur.menuEdited = true; save(); };
  $$('[data-tpl]', el).forEach((b) => { b.onclick = () => useTemplate([...TEMPLATES, BLANK].find((t) => t.key === b.dataset.tpl), el); });
  $$('.rsw-sec', el).forEach((c) => {
    const m = cur.menu[+c.dataset.si];
    $('.rsw-sec-name', c).oninput = (e) => { m.section = e.target.value; touched(); };
    $('.rsw-sec-name', c).onchange = (e) => { if (!m.kind && guessKind(e.target.value)) { m.kind = guessKind(e.target.value); $('.rsw-kind', c).value = m.kind; touched(); } };
    $('.rsw-kind', c).onchange = (e) => { m.kind = e.target.value; touched(); };
    $('[data-rm-sec]', c).onclick = () => { cur.menu.splice(+c.dataset.si, 1); touched(); menuStep(el); };
    $$('.rsw-item', c).forEach((r) => {
      const it = m.items[+r.dataset.ii];
      $('.rsw-name', r).oninput = (e) => { it[0] = e.target.value; touched(); };
      $('.rsw-price', r).oninput = (e) => { it[1] = e.target.value; touched(); };
      $('.rsw-price', r).onchange = (e) => { const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '')); it[1] = Number.isFinite(n) ? n.toFixed(2) : ''; e.target.value = it[1]; touched(); };
      $('[data-rm-item]', r).onclick = () => { m.items.splice(+r.dataset.ii, 1); touched(); menuStep(el); };
    });
    $('[data-add-item]', c).onclick = () => { m.items.push(['', '']); touched(); menuStep(el); const rows = $$(`.rsw-sec[data-si="${c.dataset.si}"] .rsw-name`, el); rows[rows.length - 1]?.focus(); };
  });
  $('#m-add-sec', el).onclick = () => { cur.menu.push({ section: '', kind: '', items: [['', '']] }); if (!cur.menuKey) cur.menuKey = 'own'; touched(); menuStep(el); const n = $$('.rsw-sec-name', el); n[n.length - 1]?.focus(); };
  $$('.rsw-stock', el).forEach((d) => {
    $('.rsw-stock-t', d).onchange = (e) => {
      cur.stock[+d.dataset.gi].items = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.lastIndexOf(','); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; });
      touched(); $('summary .small', d).textContent = cur.stock[+d.dataset.gi].items.length + ' items';
    };
  });
  $('#m-paste', el).onclick = async () => {
    let text = '';
    const how = await sheet({ title: 'Paste a menu', left: 'Cancel', body: `
      <p class="small">Copy the menu from the restaurant's website or a PDF and paste it here. One dish per line with its price at the end. A line without a price starts a new section.</p>
      <textarea id="pm" rows="10" placeholder="Burgers&#10;Classic Burger 12.99&#10;Bacon Cheeseburger $14.49&#10;Sides&#10;Fries 3.99"></textarea>
      <div class="btn-row" style="margin-top:10px"><button class="btn" id="pm-rep" type="button">Replace the menu</button>${cur.menu.length ? '<button class="btn tonal" id="pm-add" type="button">Add to it</button>' : ''}</div>`,
      onMount: ({ close, el: d }) => { const t = $('#pm', d); $('#pm-rep', d).onclick = () => { text = t.value; close('rep'); }; $('#pm-add', d) && ($('#pm-add', d).onclick = () => { text = t.value; close('add'); }); } });
    if (!how) return;
    const got = parseMenu(text).map((x) => ({ ...x, kind: guessKind(x.section) }));
    const n = got.reduce((k, m) => k + m.items.length, 0);
    if (!n) { toast('No dishes with prices found'); return; }
    if (how === 'rep') { cur.menu = got; cur.menuKey = 'own'; } else cur.menu.push(...got);
    touched(); menuStep(el); toast(`${n} dishes in ${got.length} section${got.length > 1 ? 's' : ''}`);
  };
}

// ------------------------------------------------------------ preview (iPhone-sized)

let pv = { theme: 'light', look: 'ios', screen: 'app' };
async function previewBrand() {
  const B = brand();
  const [logo, i180, i512] = await Promise.all([cur.logo ? cur.logo : null, makeIcon(180), makeIcon(512)]);
  return { ...B, logo: logo ? url(logo) : '', icon180: url(i180), icon192: url(i512), icon512: url(i512), favicon: url(await makeIcon(32)), introVideo: cur.video ? url(cur.video) : '', forceLook: pv.look };
}
async function previewStep(el) {
  const P = await previewBrand();
  window.RSW_PREVIEW = P;
  // The preview frame keeps its own Light/Dark choice; start it fresh each time.
  localStorage.setItem('rsw.preview.theme', JSON.stringify(pv.theme));
  localStorage.removeItem('rsw.preview.seenVersion');
  // A different menu: start the preview's sample data fresh, so it shows only this menu.
  if (LS.get('pvMenu', '') !== P.menuVersion) {
    await new Promise((res) => { const q = indexedDB.deleteDatabase('rsw-preview'); q.onsuccess = q.onerror = q.onblocked = () => res(); });
    Object.keys(localStorage).filter((k) => k.startsWith('rsw.preview.') && k !== 'rsw.preview.theme').forEach((k) => localStorage.removeItem(k));
    LS.set('pvMenu', P.menuVersion);
  }
  const seg = (id, opts, v) => `<div class="segmented" id="${id}">${opts.map(([k, t]) => `<button type="button" data-k="${k}" class="${v === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const name = P.shortName || 'Name';
  el.innerHTML = `
    ${seg('pv-screen', [['app', 'App'], ['home', 'Home screen']], pv.screen)}
    <div class="rsw-phone-wrap"><div class="rsw-phone ${pv.theme === 'dark' ? 'dark' : ''}">
      ${pv.screen === 'app'
        ? '<iframe id="pv-frame" title="iPhone preview" src="../r/preview/"></iframe>'
        : `<div class="rsw-home">${['', '', '', ''].map(() => '<div class="rsw-app ghost"><i></i><span>&nbsp;</span></div>').join('')}
            <div class="rsw-app"><img src="${P.icon180}" alt=""><span>${esc(name.length > 12 ? name.slice(0, 11) + '…' : name)}</span></div></div>`}
    </div></div>
    ${seg('pv-theme', [['light', 'Light'], ['dark', 'Dark']], pv.theme)}
    ${seg('pv-look', [['ios', 'iPhone look'], ['android', 'Android look']], pv.look)}
    ${pv.screen === 'app' ? '<button class="btn tonal block" id="pv-replay" type="button">Replay startup</button>' : ''}
    <p class="small muted center">This is the real shared app with this restaurant's settings. It keeps its own sample data, separate from every restaurant.</p>`;
  const fr = $('#pv-frame', el);
  if (fr) { const fit = () => { fr.style.transform = `scale(${(fr.parentElement.clientWidth - 20) / 390})`; }; fit(); addEventListener('resize', fit); }
  const segOn = (id, k) => $$(`#${id} button`, el).forEach((b) => { b.onclick = () => { pv[k] = b.dataset.k; previewStep(el).then(wireSteps); }; });
  segOn('pv-screen', 'screen'); segOn('pv-theme', 'theme'); segOn('pv-look', 'look');
  $('#pv-replay', el) && ($('#pv-replay', el).onclick = () => { localStorage.removeItem('rsw.preview.seenVersion'); $('#pv-frame').contentWindow.location.reload(); });
}

// ------------------------------------------------------------ produce

async function buildFiles() {
  const B = brand();
  const [logo, i180, i192, i512, fav] = await Promise.all([makeLogo(), makeIcon(180), makeIcon(192), makeIcon(512), makeIcon(32)]);
  const images = { logo: await bytes(logo), icon180: await bytes(i180), icon192: await bytes(i192), icon512: await bytes(i512), favicon: await bytes(fav) };
  const video = cur.video ? await bytes(cur.video) : null;
  return { B, files: restaurantFiles(B, images, video, { wizard: VERSION, date: new Date().toISOString().slice(0, 10) }) };
}

function produceStep(el) {
  const p = problems();
  const B = brand();
  const link = `${SITE}r/${cur.id}/`;
  el.innerHTML = p.length ? `
    <div class="hint"><b>Almost there.</b> Fix these first:</div>
    <div class="group">${p.map(([s, t]) => `<button class="row nav" type="button" data-go="${STEPS.indexOf(s)}"><span class="grow"><span class="title">${esc(t)}</span><span class="sub">${s}</span></span></button>`).join('')}</div>` : `
    <div class="card">
      <h3>${esc(B.restaurant)}</h3>
      <div class="rsw-facts small">
        <div><span class="muted">App name</span> ${esc(B.appName)}</div>
        <div><span class="muted">Home screen</span> ${esc(B.shortName)}</div>
        <div><span class="muted">Location</span> ${esc(B.location || '—')}</div>
        <div><span class="muted">Credit line</span> ${esc(B.credit || 'hidden')}</div>
        <div><span class="muted">Menu</span> ${B.menu.length ? `${B.menu.reduce((n, m) => n + m.items.length, 0)} dishes in ${B.menu.length} sections` : 'None (added in Recipes)'}</div>
        <div><span class="muted">Stock</span> ${B.starterStock.length ? `${B.starterStock.reduce((n, g) => n + g.items.length, 0)} food and bar items, plus supplies` : 'Supplies only'}</div>
        <div><span class="muted">Accent</span> ${B.accent ? `<i class="rsw-dot" style="background:${esc(B.accent)}"></i> ${esc(B.accent)}` : 'System blue'}</div>
        <div><span class="muted">Data space</span> ${esc(B.dbName)}</div>
        <div><span class="muted">Link</span> ${esc(link)}</div>
      </div>
    </div>
    <button class="btn block" id="dl" type="button">Download ${esc(cur.id)}.zip</button>
    ${navigator.canShare ? '<button class="btn tonal block" id="sh" type="button" style="margin-top:10px">Share or save to Files</button>' : ''}
    <button class="btn plain block" id="cp" type="button" style="margin-top:6px">Copy brand.js</button>
    <div class="section-label">Put it online (GitHub)</div>
    <div class="card small">
      <ol class="rsw-ol">
        <li>Unzip it. You get a folder <b>r</b> with <b>${esc(cur.id)}</b> inside.</li>
        <li>On GitHub open <b>restaurant-app</b>, tap <b>Add file → Upload files</b>, and drag the <b>r</b> folder in. Commit.</li>
        <li>About a minute later it opens at <b>${esc(link)}</b></li>
        <li>Open that link on the restaurant Admin's iPhone, <b>Add to Home Screen</b>, and run <b>Admin setup</b>.</li>
      </ol>
      <p class="muted">Or send me the zip in the project and I'll add it for you.</p>
    </div>`;
  $$('[data-go]', el).forEach((b) => { b.onclick = () => { cur.step = +b.dataset.go; save(); setupView(); }; });
  if (p.length) return;
  const zipBlob = async () => { const { files } = await buildFiles(); return new Blob([zip(files)], { type: 'application/zip' }); };
  $('#dl', el).onclick = async () => {
    const b = await zipBlob(); const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `${cur.id}.zip`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    cur.produced = Date.now(); save(); toast('Downloaded');
  };
  $('#sh', el) && ($('#sh', el).onclick = async () => {
    const f = new File([await zipBlob()], `${cur.id}.zip`, { type: 'application/zip' });
    if (!navigator.canShare({ files: [f] })) { toast("This browser can't share files. Use Download."); return; }
    try { await navigator.share({ files: [f], title: `${B.restaurant} app files` }); cur.produced = Date.now(); save(); } catch { /* cancelled */ }
  });
  $('#cp', el).onclick = () => copy(brandJs(B, { wizard: VERSION, date: new Date().toISOString().slice(0, 10) }), 'brand.js copied');
}

// ------------------------------------------------------------ Restaurants tab

async function restaurantsView() {
  chrome('restaurants', 'Restaurants');
  const list = (await drafts.all()).sort((a, b) => b.updated - a.updated);
  view.innerHTML = `
    <button class="btn block" id="new" type="button">New restaurant</button>
    <div class="section-label">On this device</div>
    ${list.length ? `<div class="group">${list.map((d) => `<button class="row nav" type="button" data-k="${d.key}"><span class="grow"><span class="title">${esc(d.restaurant || 'Untitled')}</span><span class="sub">${d.produced ? 'Produced ' + new Date(d.produced).toLocaleDateString() : 'Draft, step ' + (d.step + 1) + ' of ' + STEPS.length}${d.id ? ' · ' + esc(d.id) : ''}</span></span></button>`).join('')}</div>` : '<p class="muted small">Nothing yet. Tap New restaurant to start.</p>'}
    <p class="small muted">Drafts stay on this device. Live restaurants are the folders under <b>r/</b> in the restaurant-app repo.</p>`;
  $('#new').onclick = () => { cur = blank(); save(); location.hash = '#/setup'; };
  $$('[data-k]').forEach((b) => { b.onclick = async () => {
    const d = list.find((x) => x.key === b.dataset.k);
    const act = await sheet({ title: d.restaurant || 'Untitled', left: 'Close', body: `<button class="btn block" id="o" type="button">Open</button><button class="btn plain block danger-text" id="x" type="button" style="margin-top:8px">Delete draft</button>`, onMount: ({ close, el }) => { $('#o', el).onclick = () => close('open'); $('#x', el).onclick = () => close('del'); } });
    if (act === 'open') { cur = d; location.hash = '#/setup'; }
    if (act === 'del') { await drafts.del(d.key); if (cur.key === d.key) cur = blank(); toast('Draft deleted'); restaurantsView(); }
  }; });
}

// ------------------------------------------------------------ More: About, Info, What's new, Appearance

function moreView() {
  chrome('more', 'More');
  const theme = getTheme();
  view.innerHTML = `
    <div class="section-label">Appearance</div>
    <div class="segmented" id="theme">${Object.entries(THEMES).map(([k, v]) => `<button type="button" data-theme="${k}" class="${k === theme ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="group">
      <a class="row" href="#/info"><span class="grow">Info: how it works</span></a>
      <a class="row" href="#/about"><span class="grow">About</span><span class="meta">${VERSION}</span></a>
    </div>`;
  $$('#theme button').forEach((b) => { b.onclick = () => { setTheme(b.dataset.theme); moreView(); }; });
}

function aboutView() {
  chrome('more', 'About', true);
  view.innerHTML = `
    <div class="card center">
      <img src="assets/app-icon-180.png" alt="" width="84" height="84" style="border-radius:20px">
      <h2 style="margin:10px 0 0">Restaurant Setup</h2>
      <p class="muted">Version ${VERSION} · build ${BUILD}</p>
      <p class="small muted">Project RSW · makes each restaurant's version of the shared restaurant app</p>
      ${LS.get('credit', '') ? `<p class="small muted">${esc(LS.get('credit', ''))}</p>` : ''}
      ${CODE_OWNER_LINE ? `<p class="small muted">${esc(CODE_OWNER_LINE)}</p>` : ''}
    </div>
    <div class="section-label">What's new</div>
    ${WHATS_NEW.map((w) => `<div class="card small"><b>${w.version}</b> <span class="muted">· build ${w.build} · ${w.date}</span><ul>${w.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}`;
}

function infoView() {
  chrome('more', 'Info', true);
  view.innerHTML = `
    <div class="card small">
      <p><b>One app, many restaurants.</b> The app itself lives once, in the <b>app</b> folder. Each restaurant is a small folder under <b>r/</b> with only its name, pictures, colors and settings. Fix the app once and every restaurant gets it the next time their phones open it.</p>
      <p><b>Separate data.</b> Each restaurant has its own data space on the phone and its own shared-data folder, named by its Restaurant ID. Two restaurants never see each other's recipes, staff or schedules, even on the same phone.</p>
      <p><b>The steps.</b> 1 Details, 2 Pictures (the 180px home-screen icon, 192/512 Android icons and 32px favicon are made for you), 3 Color, 4 Menu, 5 Preview on an iPhone-sized screen, 6 Produce: download the restaurant's folder.</p>
      <p><b>Starter menu.</b> Pick the menu closest to the restaurant, then change sections, dishes and prices, or paste the restaurant's own menu (one dish per line with its price at the end; a line without a price starts a section). The menu fills Recipes and the Point of sale on the Admin's phone the first time it opens. Drink sections go to the bar ticket, and alcohol asks for a 21+ ID check. The food and bar stock list comes with the menu; cleaning, paper, smallwares and linens and the common vendors are added for every restaurant. Prices are typical starting prices: check them with the restaurant.</p>
      <p><b>After it's online.</b> The restaurant's Admin opens its link on their iPhone, adds it to the Home Screen and runs Admin setup. Shared team data (Firebase) and Report a problem emails are set up per restaurant afterward.</p>
      <p><b>Drafts.</b> Everything you type and upload here is saved on this device only, under Restaurants.</p>
    </div>`;
}

// ------------------------------------------------------------ routes

async function route() {
  const r = (location.hash.match(/^#\/([^/]+)/) || [])[1] || 'setup';
  if (r === 'preview') { cur.step = PREVIEW; save(); location.hash = '#/setup'; return; }
  ({ setup: setupView, restaurants: restaurantsView, more: moreView, about: aboutView, info: infoView }[r] || setupView)();
}
window.addEventListener('hashchange', route);

// Pick up the latest draft on this device, if any.
drafts.all().then((l) => { const last = l.sort((a, b) => b.updated - a.updated)[0]; if (last) cur = last; }).catch(() => {}).finally(route);
