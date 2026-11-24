// Point of sale (RRA-101): merged from the stand-alone Bootleggers POS test app
// (BPAY-025). Menu = the Recipe archive's dishes (section and price), people and
// roles = Staff and perms.js, 86 list and card settings = team settings.
// Checks and tickets are shared team data, so the kitchen and bar screens
// update on every phone. Closed checks feed Payroll (tips into the nightly
// pool, net sales into labor %) with no upload.
//
// Card payments go through the restaurant's own service (Square Terminal,
// Clover Flex/Mini, or Toast's handheld). Nothing is connected yet: card
// payments are practice runs and nothing is charged.

import * as data from './data.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome, session, LS } from './ui.js';
import { canSee, canChange, isHost, myStaff } from './perms.js';
import { BRAND } from './config.js';
import { dishPhoto } from './menu.js';

const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const mins = (ms) => Math.max(0, Math.round((Date.now() - ms) / 6e4));
const tm = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const COLORS = ['#ff9500', '#5856d6', '#34c759', '#ff2d55', '#007aff', '#af52de', '#a2845e', '#30b0c7', '#ff6482', '#64d2ff'];
const avatar = (name = '?') => `<span class="pr-av" style="background:${COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]}">${esc(name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>`;
const lock = (m) => `<div class="empty">🔒 ${esc(m)}<br><span class="small">The Admin sets this in Settings → Roles and permissions.</span></div>`;

export const PAYMENT_SERVICES = [
  { id: 'practice', name: 'Practice (not connected)', how: 'terminal', note: 'Pretend card reader. Nothing is charged.' },
  { id: 'square', name: 'Square', how: 'terminal', device: 'Square Terminal', note: 'The order total goes to the Square Terminal; the guest taps or inserts there. Money lands in your Square account. Split checks are separate checkouts.' },
  { id: 'clover', name: 'Clover', how: 'terminal', device: 'Clover Flex', note: 'Payments on a Clover Flex or Mini through Clover\'s REST Pay Display. Money lands in your Clover account.' },
  { id: 'toast', name: 'Toast', how: 'handoff', device: 'Toast handheld', note: 'The order is sent into Toast; staff take the card on Toast\'s own handheld, then mark the check paid here.' },
];
const POS_DEFAULTS = { payment: 'practice', device: 'Counter 1', tax: 0.08, eightySix: {}, seq: 100, pickupDelay: 2 };
async function posSettings() { const s = await data.settings(); return { ...POS_DEFAULTS, ...(s.pos || {}) }; }
async function savePos(patch) { const s = await data.settings(); await data.saveSettings({ ...s, pos: { ...(s.pos || {}), ...patch } }); }
const payService = (P) => PAYMENT_SERVICES.find((p) => p.id === P.payment) || PAYMENT_SERVICES[0];

// ---------- who can do what (roles from perms.js, job from the Staff position) ----------
const role = () => session.profile?.role;
const job = () => { const p = myStaff()?.position || ''; return /bar/i.test(p) ? 'bar' : /server|host|bus|wait|front|cashier/i.test(p) ? 'front' : 'kitchen'; };
const boss = () => isHost() || role() === 'manager';
export const canOrder = () => boss() || (canChange('pos') && role() === 'staff' && job() !== 'kitchen');
export const canKitchen = () => boss() || (canSee('pos') && (role() === 'chef' || job() !== 'front'));
const can86 = () => boss() || (canChange('pos') && (role() === 'chef' || job() === 'kitchen'));
export const canSales = () => boss();
const meId = () => myStaff()?.id || (isHost() ? 'admin' : session.profile?.iid || 'me');
const meName = () => session.profile?.name || 'Me';

// ---------- menu from the Recipe archive ----------
const STATION = (section) => /bar|beverage|drink|beer|wine|cocktail/i.test(section) ? 'Bar' : 'Kitchen';
// Choices asked for when a dish is added; the lists live in js/brand.js.
export function modsFor(name, section) {
  const C = BRAND.posChoices || {};
  if (/wing/i.test(name) || /wings/i.test(section)) return C.wings || null;
  if (/burger/i.test(section) && !/veggie/i.test(name)) return C.burger || null;
  if (/salad/i.test(section)) return C.salad || null;
  return null;
}
// Shorter names on tiles and tickets (e.g. without "with Fries").
const short = (n) => (BRAND.posTrim || []).reduce((t, w) => t.replace(w, ''), String(n || ''));
// RRA-108: the dish's picture. A Recipes photo wins, then js/brand.js menuPhotos.
const photoOf = dishPhoto;
const tint = (s) => COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
async function menu() {
  const s = await data.settings();
  const order = s.sections || [];
  const dishes = (await data.list('recipe')).filter((r) => r.kind === 'dish' && r.section && +r.price > 0);
  const secs = [...new Set(dishes.map((d) => d.section))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return secs.map((section) => ({ section, items: dishes.filter((d) => d.section === section).sort((a, b) => (a.menuOrder ?? 999) - (b.menuOrder ?? 999) || a.name.localeCompare(b.name)).map((d) => ({ id: d.id, name: d.name, price: +d.price, section, station: STATION(section), photo: photoOf(d) })) }));
}

// ---------- checks ----------
const lineTotal = (x) => (x.voided ? 0 : r2(x.price * (x.qty || 1)));
export function totals(c, tax) {
  const sub = r2(c.items.reduce((t, x) => t + lineTotal(x), 0));
  const tx = r2(sub * (c.tax ?? tax ?? 0));
  const total = r2(sub + tx);
  const paid = r2((c.payments || []).reduce((t, p) => t + p.amount, 0));
  const tips = r2((c.payments || []).reduce((t, p) => t + (p.tip || 0), 0));
  return { sub, tax: tx, total, paid, tips, due: r2(Math.max(0, total - paid)) };
}
const openChecks = async () => (await data.list('check')).filter((c) => !c.closed);
const staffName = (id, staff) => (id === 'admin' ? 'Admin' : staff.find((s) => s.id === id)?.name || 'Staff');

// ------------------------------------------------------------ seating (RRA-114)
// The restaurant as areas (Dining room, Bar, Outside…), each a grid of tables
// the Admin or a manager lays out under Seating. Tapping a free table asks for
// the number of guests (tap a number), then opens the menu; tapping a table
// with an open check brings that check up.
export const FLOOR = { cols: 10, rows: 7 };
const KINDS = { table: 'Table', booth: 'Booth', high: 'High top', bar: 'Bar', patio: 'Patio' };
const SHORT = { table: '', booth: 'Bo', high: 'H', bar: 'B', patio: 'P' };
const tableName = (t) => `${KINDS[t.kind] || 'Table'} ${t.no}`;
const STARTER_AREAS = [{ id: 'dining', name: 'Dining room' }, { id: 'bar', name: 'Bar' }, { id: 'patio', name: 'Outside' }];
function starterTables() {
  const t = [];
  let no = 1;
  for (const y of [0, 2, 4]) for (const x of [0, 2, 4, 6]) t.push({ id: 't' + no, area: 'dining', kind: 'table', no: no++, seats: 4, x, y });
  for (let i = 0; i < 3; i++) t.push({ id: 'b' + (i + 1), area: 'dining', kind: 'booth', no: i + 1, seats: 6, x: 9, y: i * 2 });
  for (let i = 0; i < 10; i++) t.push({ id: 'r' + (i + 1), area: 'bar', kind: 'bar', no: i + 1, seats: 1, x: i, y: 0 });
  for (let i = 0; i < 4; i++) t.push({ id: 'h' + (i + 1), area: 'bar', kind: 'high', no: i + 1, seats: 4, x: 1 + i * 2, y: 3 });
  for (let i = 0; i < 8; i++) t.push({ id: 'p' + (i + 1), area: 'patio', kind: 'patio', no: i + 1, seats: 4, x: (i % 4) * 2 + 1, y: i < 4 ? 1 : 4 });
  return t;
}
const areasOf = (P) => (Array.isArray(P.areas) && P.areas.length ? P.areas : STARTER_AREAS);
// Older layouts had no areas: bar seats go to the Bar, the rest to the first area.
const tablesOf = (P) => {
  const areas = areasOf(P);
  const list = Array.isArray(P.tables) && P.tables.length ? P.tables : starterTables();
  return list.map((t) => (areas.some((a) => a.id === t.area) ? t : { ...t, area: t.kind === 'bar' && areas.some((a) => a.id === 'bar') ? 'bar' : areas[0].id }));
};
const areaTabs = (areas, cur, tables, checks, extra = '') => `<div class="pos-secs fl-areas" role="tablist">${areas.map((a) => {
  const n = checks.filter((c) => tables.some((t) => t.area === a.id && (c.tableId === t.id || (!c.tableId && c.name === tableName(t))))).length;
  return `<button type="button" role="tab" data-area="${esc(a.id)}" class="${a.id === cur ? 'on' : ''}">${esc(a.name)}${n ? ` <i>${n}</i>` : ''}</button>`;
}).join('')}${extra}</div>`;
const curArea = (areas) => { const a = LS.get('posArea', areas[0].id); return areas.some((x) => x.id === a) ? a : areas[0].id; };
const numPick = (name, n, on, taken = []) => `<div class="num-pick" data-pick="${name}">${Array.from({ length: n }, (_, i) => i + 1).map((v) => `<button type="button" data-v="${v}" class="${v === on ? 'on' : ''}" ${taken.includes(v) && v !== on ? 'disabled' : ''}>${v}</button>`).join('')}</div>`;
const wirePick = (el, name, set) => $$(`[data-pick="${name}"] button`, el).forEach((b) => b.onclick = () => { $$(`[data-pick="${name}"] button`, el).forEach((x) => x.classList.toggle('on', x === b)); set(+b.dataset.v); });

function floorHtml(tables, checks, P, edit) {
  const cell = (x, y) => tables.find((t) => t.x === x && t.y === y);
  let h = '';
  for (let y = 0; y < FLOOR.rows; y++) for (let x = 0; x < FLOOR.cols; x++) {
    const t = cell(x, y);
    if (!t) { h += edit ? `<button type="button" class="fl-cell fl-empty" data-cell="${x},${y}" style="grid-column:${x + 1};grid-row:${y + 1}" aria-label="Add a table here">+</button>` : ''; continue; }
    const c = checks.find((k) => k.tableId === t.id || (!k.tableId && k.name === tableName(t)));
    const tot = c ? totals(c, P.tax).total : 0;
    h += `<button type="button" class="fl-t k-${t.kind}${c ? ' busy' : ''}" data-t="${t.id}" style="grid-column:${x + 1};grid-row:${y + 1}">
      <b>${esc((SHORT[t.kind] || '') + t.no)}</b>
      <small>${c ? `${c.guests} · ${mins(c.opened)}m` : `${t.seats} seat${t.seats > 1 ? 's' : ''}`}</small>${c ? `<small class="fl-amt">${money(tot)}</small>` : ''}</button>`;
  }
  return `<div class="floor${edit ? ' edit' : ''}" style="--cols:${FLOOR.cols};--rows:${FLOOR.rows}">${h}</div>`;
}

// Orders (POS): the seating layout.
export async function posView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Seating');
  if (!canOrder()) { view.innerHTML = lock('Orders are for servers, bartenders, managers and the Admin.'); return; }
  const P = await posSettings(), staff = await data.list('staff');
  const all = tablesOf(P), areas = areasOf(P), area = curArea(areas);
  const tables = all.filter((t) => t.area === area);
  const open = await openChecks();
  const mine = open.filter((c) => boss() || c.server === meId());
  setTitle('Seating', `<button class="btn small" id="pos-cur" type="button">Current orders${mine.length ? ` (${mine.length})` : ''}</button>`);
  const today = new Date().toDateString();
  const closedToday = (await data.list('check')).filter((c) => c.closed && new Date(c.closed).toDateString() === today).length;
  view.innerHTML = `
    ${areaTabs(areas, area, all, open)}
    ${floorHtml(tables, open, P, false)}
    <p class="muted small center" style="margin:0 0 6px">Tap a free table to seat guests. Tap a seated table to bring up its order.</p>
    <div class="fl-key small muted"><span><i class="fl-dot"></i> Free</span><span><i class="fl-dot busy"></i> Seated</span></div>
    <div class="group">
      ${boss() ? '<a class="row nav" href="#/seating"><span class="grow"><span class="title">Change the seating layout</span><span class="sub">Areas (dining room, bar, outside) and their tables, booths and seats</span></span></a>' : ''}
      ${canKitchen() ? '<a class="row nav" href="#/tickets"><span class="grow">Kitchen and bar screen</span></a>' : ''}
      ${canSales() ? '<a class="row nav" href="#/possales"><span class="grow">Today\'s sales</span></a>' : ''}
      ${BRAND.giftCards?.url ? '<a class="row nav" href="#/giftcards"><span class="grow">Gift cards</span></a>' : ''}
    </div>
    <p class="muted small center">${closedToday} check${closedToday === 1 ? '' : 's'} closed today · cards through ${esc(payService(P).name)}</p>`;
  $('#pos-cur').onclick = () => currentOrders(staff, P);
  $$('[data-area]').forEach((b) => b.onclick = () => { LS.set('posArea', b.dataset.area); posView(); });
  $$('[data-t]').forEach((b) => b.onclick = async () => {
    const t = tables.find((x) => x.id === b.dataset.t);
    const c = open.find((k) => k.tableId === t.id || (!k.tableId && k.name === tableName(t)));
    if (c) { location.hash = '#/poscheck/' + c.id; return; }
    seatTable(t);
  });
}

// Tap a free table: pick the number of guests, then the menu opens.
async function seatTable(t) {
  let guests = Math.min(t.seats || 2, 2) || 1;
  const max = Math.max(12, t.seats || 0);
  const ok = await sheet({
    title: `Seat ${tableName(t)}`, right: 'Open',
    body: `<div class="pr-lab">How many guests?</div>${numPick('g', max, guests)}<p class="muted small">${t.seats} seat${t.seats > 1 ? 's' : ''} at this ${(KINDS[t.kind] || 'table').toLowerCase()}.</p>`,
    onMount(api) { wirePick(api.el, 'g', (v) => { guests = v; api.close(true); }); }, // one tap opens the table
  });
  if (!ok) return;
  const P = await posSettings();
  const no = (P.seq || 100) + 1;
  await savePos({ seq: no });
  const c = await data.put('check', { no, name: tableName(t), tableId: t.id, kind: t.kind === 'bar' ? 'tab' : 'table', guests, server: meId(), serverName: meName(), opened: Date.now(), items: [], payments: [], tax: P.tax });
  posCheckView.seat = 1;
  location.hash = '#/poscheck/' + c.id;
}

// The current orders, as a popup.
async function currentOrders(staff, P) {
  const showAll = boss() && LS.get('posAll', true);
  const list = (await openChecks()).filter((c) => showAll || c.server === meId()).sort((a, b) => a.opened - b.opened);
  const go = await sheet({
    title: 'Current orders', left: 'Close',
    body: `${boss() ? `<div class="segmented" id="cur-all"><button type="button" data-all="1" class="${showAll ? 'on' : ''}">All checks</button><button type="button" data-all="0" class="${showAll ? '' : 'on'}">Mine</button></div>` : ''}
      ${list.length ? `<div class="group">${list.map((c) => { const t = totals(c, P.tax); const n = c.items.filter((x) => !x.sent && !x.voided).length; const nm = staffName(c.server, staff); return `
      <button class="row nav" type="button" data-go="${c.id}">${avatar(nm)}<span class="grow"><span class="title">${esc(c.name)} <span class="muted small">#${c.no}</span></span>
        <span class="sub">${esc(nm.split(' ')[0])} · ${c.guests} guest${c.guests > 1 ? 's' : ''} · ${mins(c.opened)} min${n ? ` · <span style="color:var(--warn)">${n} not sent</span>` : ''}</span></span>
        <span class="pr-num"><b>${money(t.total)}</b></span></button>`; }).join('')}</div>` : '<div class="empty">No open orders. Tap a table on the seating layout to start one.</div>'}`,
    onMount(api) {
      $$('[data-go]', api.el).forEach((b) => b.onclick = () => api.close(b.dataset.go));
      $$('#cur-all [data-all]', api.el).forEach((b) => b.onclick = () => { LS.set('posAll', b.dataset.all === '1'); api.close('again'); });
    },
  });
  if (go === 'again') return currentOrders(staff, P);
  if (go) location.hash = '#/poscheck/' + go;
}

// The Orders popup (RRA-114): opened from the menu, it offers Seating and
// brings the current orders straight up.
export async function posMenu() {
  if (!canOrder() && !canKitchen()) { location.hash = '#/pos'; return; }
  const P = await posSettings(), staff = await data.list('staff');
  const list = canOrder() ? (await openChecks()).filter((c) => boss() || c.server === meId()).sort((a, b) => a.opened - b.opened) : [];
  const go = await sheet({
    title: 'Orders', left: 'Close',
    body: `<div class="group">
        ${canOrder() ? '<button class="row nav" type="button" data-go="#/pos"><span class="grow"><span class="title">Seating</span><span class="sub">Seat a table and take its order</span></span></button>' : ''}
        ${canKitchen() ? '<button class="row nav" type="button" data-go="#/tickets"><span class="grow">Kitchen and bar screen</span></button>' : ''}
        ${canSales() ? '<button class="row nav" type="button" data-go="#/possales"><span class="grow">Today\'s sales</span></button>' : ''}
        ${boss() ? '<button class="row nav" type="button" data-go="#/seating"><span class="grow">Change the seating layout</span></button>' : ''}
      </div>
      ${canOrder() ? `<div class="section-label">Current orders</div>${list.length ? `<div class="group">${list.map((c) => { const nm = staffName(c.server, staff); return `<button class="row nav" type="button" data-go="#/poscheck/${c.id}">${avatar(nm)}<span class="grow"><span class="title">${esc(c.name)}</span><span class="sub">${c.guests} guest${c.guests > 1 ? 's' : ''} · ${mins(c.opened)} min</span></span><span class="pr-num"><b>${money(totals(c, P.tax).total)}</b></span></button>`; }).join('')}</div>` : '<p class="muted small">No open orders.</p>'}` : ''}`,
    onMount(api) { $$('[data-go]', api.el).forEach((b) => b.onclick = () => api.close(b.dataset.go)); },
  });
  if (go) location.hash = go;
}

// Seating layout editor (managers and the Admin): areas and their tables.
export async function seatingView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Seating layout');
  if (!boss()) { view.innerHTML = lock('Managers and the Admin set up the seating.'); return; }
  const P = await posSettings();
  const areas = areasOf(P).map((a) => ({ ...a })), area = curArea(areas);
  const all = tablesOf(P).map((t) => ({ ...t }));
  const tables = all.filter((t) => t.area === area);
  const here = areas.find((a) => a.id === area);
  const moving = seatingView.moving && all.find((t) => t.id === seatingView.moving);
  view.innerHTML = `
    ${areaTabs(areas, area, all, [], '<button type="button" id="ar-add" class="add">+ Area</button>')}
    <p class="muted small" style="margin-top:0">${moving ? `<b>Moving ${esc(tableName(moving))}:</b> tap an empty square${moving.area !== area ? ` (it moves to ${esc(here.name)})` : ''}, or pick another area above.` : `Tap an empty square (+) to add a table, booth, high top, bar seat or patio table to <b>${esc(here.name)}</b>. Tap one to change, move or remove it.`}</p>
    ${floorHtml(tables, [], P, true)}
    ${moving ? '<button class="btn tonal block" id="mv-x" type="button">Cancel move</button>' : ''}
    <div class="btn-row"><button class="btn tonal" id="ar-ren" type="button">Rename ${esc(here.name)}</button><button class="btn tonal" id="ar-rm" type="button" style="color:var(--danger)" ${areas.length < 2 ? 'disabled' : ''}>Remove area</button></div>
    <p class="muted small">${areas.length} area${areas.length > 1 ? 's' : ''}, ${all.length} places in all. ${esc(here.name)}: ${Object.entries(KINDS).map(([k, l]) => [tables.filter((t) => t.kind === k).length, l]).filter(([n]) => n).map(([n, l]) => `${n} ${l.toLowerCase()}${l === 'Bar' ? ' seat' : ''}${n > 1 ? 's' : ''}`).join(', ') || 'empty'}. The layout is shared by every phone.</p>
    <button class="btn plain block" id="fl-reset" type="button">Start over with the starter layout</button>`;
  const save = async (list, ars = areas) => { await savePos({ tables: list, areas: ars }); seatingView(); };
  $$('[data-area]').forEach((b) => b.onclick = () => { LS.set('posArea', b.dataset.area); seatingView(); });
  $('#mv-x')?.addEventListener('click', () => { seatingView.moving = null; seatingView(); });
  $('#fl-reset').onclick = async () => { if (await sheet({ title: 'Starter layout?', right: 'Start over', body: '<p>Put back the starter areas and tables (Dining room: 12 tables and 3 booths; Bar: 10 bar seats and 4 high tops; Outside: 8 patio tables)? Open checks stay open.</p>' })) { LS.set('posArea', 'dining'); save(starterTables(), STARTER_AREAS); } };
  $('#ar-add').onclick = async () => {
    const name = await areaName('', areas);
    if (!name) return;
    const id = Math.random().toString(36).slice(2, 8);
    LS.set('posArea', id); save(all, [...areas, { id, name }]);
  };
  $('#ar-ren').onclick = async () => { const name = await areaName(here.name, areas.filter((a) => a.id !== area)); if (name) save(all, areas.map((a) => (a.id === area ? { ...a, name } : a))); };
  $('#ar-rm').onclick = async () => {
    if (areas.length < 2) return;
    const ok = await sheet({ title: `Remove ${here.name}?`, right: 'Remove', body: `<p>This removes the area and its ${tables.length} place${tables.length === 1 ? '' : 's'} from the layout. Open checks stay open.</p>` });
    if (ok) { LS.set('posArea', areas.find((a) => a.id !== area).id); save(all.filter((t) => t.area !== area), areas.filter((a) => a.id !== area)); }
  };
  $$('[data-cell]').forEach((b) => b.onclick = async () => {
    const [x, y] = b.dataset.cell.split(',').map(Number);
    if (moving) { seatingView.moving = null; return save(all.map((t) => (t.id === moving.id ? { ...t, x, y, area } : t))); }
    const kind = /bar/i.test(here.name) ? 'bar' : /out|patio|deck|porch|garden/i.test(here.name) ? 'patio' : 'table';
    const t = await tableSheet({ kind, seats: kind === 'bar' ? 1 : 4, x, y, area }, all);
    if (t) save([...all, { ...t, id: Math.random().toString(36).slice(2, 9) }]);
  });
  $$('[data-t]').forEach((b) => b.onclick = async () => {
    const t = all.find((x) => x.id === b.dataset.t);
    if (moving) { toast('Pick an empty square'); return; }
    const r = await tableSheet(t, all);
    if (!r) return;
    if (r === 'move') { seatingView.moving = t.id; seatingView(); return; }
    if (r === 'remove') return save(all.filter((x) => x.id !== t.id));
    save(all.map((x) => (x.id === t.id ? r : x)));
  });
}

// Name an area: tap a common name, or type one.
function areaName(cur, others) {
  const COMMON = ['Dining room', 'Bar', 'Outside', 'Patio', 'Deck', 'Upstairs', 'Private room', 'Front porch'].filter((n) => !others.some((a) => a.name === n));
  return sheet({
    title: cur ? 'Rename area' : 'New area', right: 'Save',
    body: `<div class="pos-choices">${COMMON.map((n) => `<button type="button" class="btn tonal" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <label class="field"><span>Or type a name</span><input type="text" id="an" value="${esc(cur)}" placeholder="e.g. Side patio"></label>`,
    onMount(api) {
      $$('[data-n]', api.el).forEach((b) => b.onclick = () => api.close(b.dataset.n));
      api.onRight = () => { const v = $('#an', api.el).value.trim(); if (!v) { toast('Pick or type a name'); return; } if (others.some((a) => a.name.toLowerCase() === v.toLowerCase())) { toast('There is already an area with that name'); return; } api.close(v); };
    },
  });
}

function tableSheet(t, tables) {
  const isNew = !t.id;
  let kind = t.kind || 'table', no = t.no, seats = t.seats || 4;
  const taken = (k) => tables.filter((x) => x.kind === k && x.id !== t.id).map((x) => x.no);
  const firstFree = (k) => { let n = 1; while (taken(k).includes(n)) n++; return n; };
  if (!no) no = firstFree(kind);
  return sheet({
    title: isNew ? 'Add a place' : tableName(t), right: 'Save',
    body: `<div class="pos-secs" id="tk" style="flex-wrap:wrap">${Object.entries(KINDS).map(([k, l]) => `<button type="button" data-k="${k}" class="${k === kind ? 'on' : ''}">${l}${k === 'bar' ? ' seat' : ''}</button>`).join('')}</div>
      <div class="pr-lab">Number</div><div id="tn">${numPick('n', 40, no, taken(kind))}</div>
      <div class="pr-lab">Seats</div>${numPick('s', 12, seats)}
      ${isNew ? '' : `<div class="btn-row" style="margin-top:12px"><button class="btn tonal" type="button" id="t-mv">Move</button><button class="btn tonal" type="button" id="t-rm" style="color:var(--danger)">Remove</button></div>`}`,
    onMount(api) {
      const wireN = () => wirePick(api.el, 'n', (v) => { no = v; });
      $$('#tk button', api.el).forEach((b) => b.onclick = () => {
        kind = b.dataset.k; $$('#tk button', api.el).forEach((x) => x.classList.toggle('on', x === b));
        if (taken(kind).includes(no)) no = firstFree(kind);
        if (kind === 'bar' && seats > 2) { seats = 1; $$('[data-pick="s"] button', api.el).forEach((x) => x.classList.toggle('on', +x.dataset.v === 1)); }
        $('#tn', api.el).innerHTML = numPick('n', 40, no, taken(kind)); wireN();
      });
      wireN(); wirePick(api.el, 's', (v) => { seats = v; });
      $('#t-mv', api.el)?.addEventListener('click', () => api.close('move'));
      $('#t-rm', api.el)?.addEventListener('click', () => api.close('remove'));
      api.onRight = () => api.close({ ...t, kind, no, seats });
    },
  });
}

// ------------------------------------------------------------ one check
export async function posCheckView(id) {
  setChrome({ tab: 'more', back: true });
  const c = await data.get('check', id);
  if (!c || c.closed) { location.hash = '#/pos'; return; }
  if (!canOrder()) { setTitle(c.name); view.innerHTML = lock('Orders are for servers, bartenders and managers.'); return; }
  const P = await posSettings(), M = await menu();
  setTitle(c.name, `<span class="muted small">#${c.no} · ${esc((c.serverName || '').split(' ')[0])}</span>`);
  let section = LS.get('posSec', M[0]?.section);
  if (!M.some((m) => m.section === section)) section = M[0]?.section;
  let seat = Math.min(posCheckView.seat || 1, c.guests);
  const t = totals(c, P.tax), unsent = c.items.filter((x) => !x.sent && !x.voided);
  const seats = [...new Set(c.items.map((x) => x.seat))].sort((a, b) => a - b);
  const items = M.find((m) => m.section === section)?.items || [];
  const nUnsent = unsent.reduce((n, x) => n + (x.qty || 1), 0);
  // RRA-108: the open check on the left (item, qty with − and +, amount),
  // picture tiles on the right with the menu sections as tabs above them (RRA-116).
  // RRA-118: the open tables as tabs at the top; tap one to jump to its order.
  const openTabs = (await openChecks()).filter((k) => boss() || k.server === meId() || k.id === c.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  view.innerHTML = `<div class="pos-ttabs" role="tablist">${openTabs.map((k) => `<a role="tab" href="#/poscheck/${k.id}" class="${k.id === c.id ? 'on' : ''}" aria-selected="${k.id === c.id}"><b>${esc(k.name)}</b><small>${k.guests} · ${money(totals(k, P.tax).total)}</small></a>`).join('')}<a href="#/pos" class="add" aria-label="Seat another table">+ Seat</a></div>
  <div class="pos-wrap">
    <div class="pos-left">
    <div class="card pos-check${LS.get('posFold', true) && c.items.length ? ' folded' : ''}">
      ${c.items.length ? `<button type="button" class="pos-fold" id="fold">${c.items.reduce((n, x) => n + (x.voided ? 0 : x.qty || 1), 0)} item${c.items.length === 1 && (c.items[0].qty || 1) === 1 ? '' : 's'} on this check <span>${LS.get('posFold', true) ? 'Show ▾' : 'Hide ▴'}</span></button>` : ''}
      <div class="pos-head"><span>Item</span><span>Qty</span><span>Amount</span></div>
      ${c.items.length ? seats.map((s) => `<div class="pos-seat">${c.guests > 1 ? `<div class="pr-lab">Seat ${s}</div>` : ''}${c.items.filter((x) => x.seat === s).map((x) => `
        <div class="pos-line${x.voided ? ' void' : ''}">
          <button class="pos-name" type="button" data-line="${x.id}"><span>${esc(short(x.name))}</span>${x.mods?.length ? `<span class="pos-mod">${esc(x.mods.join(', '))}</span>` : ''}${x.note ? `<span class="pos-mod">“${esc(x.note)}”</span>` : ''}<span class="pos-st">${x.voided ? 'void' : x.sent ? '✓ sent' : '<b style="color:var(--warn)">new</b>'}</span></button>
          <span class="pos-qty">${x.voided ? `<b>${x.qty || 1}</b>` : `<button type="button" data-minus="${x.id}" aria-label="One less">−</button><b>${x.qty || 1}</b><button type="button" data-plus="${x.id}" aria-label="One more">+</button>`}</span>
          <span class="pos-price">${money(lineTotal(x))}</span></div>`).join('')}</div>`).join('')
      : `<p class="muted center" style="margin:6px 0">No items yet. Tap a dish to add it.</p>${(c.payments || []).length ? '' : '<button class="btn plain block small" id="free" type="button">Seated by mistake? Free the table</button>'}`}
      <div class="pos-tot"><span>Subtotal</span><span>${money(t.sub)}</span></div>
      <div class="pos-tot"><span>Tax ${((c.tax ?? P.tax) * 100).toFixed(1)}%</span><span>${money(t.tax)}</span></div>
      <div class="pos-tot big"><span>Total</span><span>${money(t.total)}</span></div>
      ${t.paid ? `<div class="pos-tot"><span>Paid</span><span>−${money(t.paid)}</span></div><div class="pos-tot big"><span>Due</span><span>${money(t.due)}</span></div>` : ''}
      <div class="btn-row pos-actions">
        ${unsent.length || !c.items.length ? `<button class="btn tonal" id="send" type="button" ${unsent.length ? '' : 'disabled'}>Send${nUnsent ? ` (${nUnsent})` : ''}</button>` : '<button class="btn pos-sent" id="send" type="button" disabled>✓ Sent</button>'}
        <button class="btn" id="pay" type="button" ${c.items.some((x) => !x.voided) ? '' : 'disabled'}>Pay ${money(t.due)}</button>
      </div>
    </div>
    ${c.guests > 1 ? `<div class="pr-lab" style="margin:12px 0 4px">Adding to</div><div class="segmented">${Array.from({ length: c.guests }, (_, i) => `<button type="button" data-seat="${i + 1}" class="${seat === i + 1 ? 'on' : ''}">Seat ${i + 1}</button>`).join('')}</div>` : ''}
    </div>
    <div class="pos-right">
    <div class="pos-secs pos-tabs">${M.map((m) => `<button type="button" data-sec="${esc(m.section)}" class="${m.section === section ? 'on' : ''}">${esc(m.section)}</button>`).join('')}</div>
    <div class="pos-grid">${items.map((x) => { const out = P.eightySix[x.id]; return `<button type="button" class="pos-tile${out ? ' out' : ''}${x.photo ? '' : ' nopic'}" data-item="${x.id}" ${out ? 'disabled' : ''} style="--tile:${tint(x.section + x.name)}">
      <span class="pos-pic">${x.photo ? `<img src="${esc(x.photo)}" alt="" loading="lazy">` : `<span>${esc(short(x.name))}</span>`}</span>
      <span class="pos-cap"><span class="pos-tn">${esc(short(x.name))}</span><small>${out ? '86’d' : money(x.price)}</small></span></button>`; }).join('') || '<p class="muted small">No dishes with a price in this section. Add prices in Recipes.</p>'}</div>
    </div></div>`;
  $$('[data-sec]').forEach((b) => b.onclick = () => { LS.set('posSec', b.dataset.sec); posCheckView(id); });
  $$('[data-seat]').forEach((b) => b.onclick = () => { posCheckView.seat = +b.dataset.seat; posCheckView(id); });
  $$('[data-item]').forEach((b) => b.onclick = () => addItem(c, items.find((x) => x.id === b.dataset.item), seat));
  $$('[data-line]').forEach((b) => b.onclick = () => lineSheet(c, c.items.find((x) => x.id === b.dataset.line)));
  $$('[data-plus]').forEach((b) => b.onclick = () => bump(c, b.dataset.plus, +1));
  $$('[data-minus]').forEach((b) => b.onclick = () => bump(c, b.dataset.minus, -1));
  $('#send').onclick = async () => { await send(c); toast('Sent to the kitchen and bar'); posCheckView(id); };
  // Pay opens a popup over the check (Gaylan, 2026-11-24), not a separate page.
  // Once paid, go to the next open table's order; Seating only when none are open.
  $('#pay').onclick = async () => {
    if (!(await payPopup(c.id))) return posCheckView(id);
    const next = (await openChecks()).filter((k) => k.id !== c.id && (boss() || k.server === meId()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
    location.replace(next ? '#/poscheck/' + next.id : '#/pos');
  };
  if (posCheckView.pay === c.id) { posCheckView.pay = null; $('#pay').click(); }
  // Switching tables replaces this screen, so Back still goes to Seating.
  $$('.pos-ttabs a[role=tab]').forEach((a) => a.onclick = (e) => { e.preventDefault(); if (!a.classList.contains('on')) location.replace(a.getAttribute('href')); });
  $('#fold')?.addEventListener('click', () => { LS.set('posFold', !LS.get('posFold', true)); posCheckView(id); });
  $('#free')?.addEventListener('click', async () => { await data.remove('check', c.id); toast(c.name + ' is free again'); location.hash = '#/pos'; });
}

// RRA-108: − and + on a line. Lines not sent yet change their quantity; a sent
// line gets a new "one more" line, and taking one off a sent line is a void.
async function bump(c, lineId, d) {
  const cur = await data.get('check', c.id);
  const x = cur.items.find((y) => y.id === lineId);
  if (!x) return;
  let items = cur.items;
  if (!x.sent) {
    const q = (x.qty || 1) + d;
    items = q > 0 ? items.map((y) => (y.id === x.id ? { ...y, qty: q } : y)) : items.filter((y) => y.id !== x.id);
  } else if (d > 0) {
    const same = items.find((y) => !y.sent && !y.voided && y.menuId === x.menuId && y.seat === x.seat && (y.mods || []).join() === (x.mods || []).join() && (y.note || '') === (x.note || ''));
    items = same ? items.map((y) => (y === same ? { ...y, qty: (y.qty || 1) + 1 } : y)) : [...items, { ...x, id: lid(), qty: 1, sent: false, voided: false }];
  } else { lineSheet(c, x); return; }
  await data.put('check', { ...cur, items });
  posCheckView(c.id);
}

const lid = () => Math.random().toString(36).slice(2, 9);
async function addItem(c, x, seat) {
  const m = modsFor(x.name, x.section);
  let line = { id: lid(), menuId: x.id, name: x.name, price: x.price, station: x.station, mods: [], note: '', seat, qty: 1, sent: false };
  if (m) {
    const pick = await sheet({
      title: short(x.name), left: 'Cancel',
      body: `<div class="pr-lab">${esc(m.title)}</div><div class="pos-choices">${m.options.map((o) => `<button type="button" class="btn tonal" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        <label class="field"><span>Note for the kitchen (optional)</span><input type="text" id="nt" placeholder="e.g. no onions"></label>`,
      onMount(api) { $$('[data-o]', api.el).forEach((b) => b.onclick = () => api.close({ mod: b.dataset.o, note: $('#nt', api.el).value.trim() })); },
    });
    if (!pick) return;
    line = { ...line, mods: [pick.mod], note: pick.note };
  }
  const cur = await data.get('check', c.id);
  // The same dish again on the same seat, not sent yet: one more of it.
  const same = !line.mods.length && !line.note && cur.items.find((y) => !y.sent && !y.voided && y.menuId === x.id && y.seat === seat && !(y.mods || []).length && !y.note);
  await data.put('check', { ...cur, items: same ? cur.items.map((y) => (y === same ? { ...y, qty: (y.qty || 1) + 1 } : y)) : [...cur.items, line] });
  posCheckView(c.id);
}

async function lineSheet(c, x) {
  const act = await sheet({
    title: x.name, left: 'Close',
    body: `<p class="muted small">${(x.qty || 1) > 1 ? `${x.qty} × ` : ''}${money(x.price)} · seat ${x.seat}${x.mods?.length ? ' · ' + esc(x.mods.join(', ')) : ''} · ${x.sent ? 'sent to the ' + x.station.toLowerCase() : 'not sent yet'}</p>
      <div class="stack">
        ${c.guests > 1 ? `<div class="pr-lab">Move to seat</div><div class="segmented">${Array.from({ length: c.guests }, (_, i) => `<button type="button" data-mv="${i + 1}" class="${x.seat === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>` : ''}
        ${!x.sent ? '<button class="btn block tonal" type="button" data-a="remove" style="color:var(--danger)">Remove (not sent yet)</button>' : ''}
        ${x.sent && !x.voided ? (boss() ? '<button class="btn block tonal" type="button" data-a="void" style="color:var(--danger)">Void (manager)</button>' : '<p class="muted small">Sent items can only be voided by a manager.</p>') : ''}
      </div>`,
    onMount(api) {
      $$('[data-mv]', api.el).forEach((b) => b.onclick = () => api.close({ move: +b.dataset.mv }));
      $$('[data-a]', api.el).forEach((b) => b.onclick = () => api.close({ a: b.dataset.a }));
    },
  });
  if (!act) return;
  const cur = await data.get('check', c.id);
  let items = cur.items.map((y) => (y.id !== x.id ? y : act.move ? { ...y, seat: act.move } : act.a === 'void' ? { ...y, voided: true, voidBy: meName() } : y));
  if (act.a === 'remove') items = items.filter((y) => y.id !== x.id);
  await data.put('check', { ...cur, items });
  if (act.a === 'void') toast('Voided');
  posCheckView(c.id);
}

async function send(c) {
  const cur = await data.get('check', c.id);
  const unsent = cur.items.filter((x) => !x.sent && !x.voided);
  for (const st of ['Kitchen', 'Bar']) {
    const its = unsent.filter((x) => x.station === st);
    if (its.length) await data.put('ticket', { checkId: cur.id, checkName: cur.name, server: cur.serverName || '', serverId: cur.server || '', station: st, at: Date.now(), items: its.map((x) => ({ name: x.name, qty: x.qty || 1, mods: x.mods || [], note: x.note || '', seat: x.seat, done: false })) });
  }
  await data.put('check', { ...cur, items: cur.items.map((x) => (unsent.includes(x) ? { ...x, sent: true } : x)) });
}

// ------------------------------------------------------------ pay
function parts(c, tax) {
  const t = totals(c, tax), mode = c.split?.mode || 'whole';
  const paidFor = (key) => r2((c.payments || []).filter((p) => p.part === key).reduce((s, p) => s + p.amount, 0));
  let ps;
  if (mode === 'even') {
    const n = c.split.n, each = r2(t.total / n);
    ps = Array.from({ length: n }, (_, i) => ({ key: 'e' + i, label: `Part ${i + 1} of ${n}`, amount: i === n - 1 ? r2(t.total - each * (n - 1)) : each }));
  } else if (mode === 'seat') {
    const rate = c.tax ?? tax;
    const seats = [...new Set(c.items.filter((x) => !x.voided).map((x) => x.seat))].sort((a, b) => a - b);
    ps = seats.map((s) => { const sub = r2(c.items.filter((x) => x.seat === s).reduce((a, x) => a + lineTotal(x), 0)); return { key: 's' + s, label: `Seat ${s}`, amount: r2(sub + r2(sub * rate)) }; });
    const diff = r2(t.total - ps.reduce((s, p) => s + p.amount, 0)); if (ps.length && diff) ps[ps.length - 1].amount = r2(ps[ps.length - 1].amount + diff);
  } else ps = [{ key: 'w', label: 'Whole check', amount: t.total }];
  return ps.map((p) => ({ ...p, paid: paidFor(p.key), due: r2(Math.max(0, p.amount - paidFor(p.key))) }));
}

// Old links to the Pay page open the check with the Pay popup.
export function posPayView(id) { posCheckView.pay = id; location.replace('#/poscheck/' + id); }

// The Pay popup: split, pick a part, take card or cash. Returns true once
// the check is paid and closed.
async function payPopup(id) {
  for (;;) {
    const c = await data.get('check', id);
    if (!c || c.closed) return true;
    if (!canOrder()) { toast('Taking payment is for servers, bartenders and managers'); return false; }
    const P = await posSettings();
    const t = totals(c, P.tax), ps = parts(c, P.tax), mode = c.split?.mode || 'whole', locked = (c.payments || []).length > 0, svc = payService(P);
    const r = await sheet({
      title: 'Pay · ' + c.name, left: 'Close',
      body: `
    <div class="card center"><div class="pr-lab">Total with tax</div><div class="pr-big">${money(t.total)}</div><div class="pr-lab">${t.paid ? `${money(t.paid)} paid · <b>${money(t.due)} due</b>` : `${c.items.filter((x) => !x.voided).length} items · ${c.guests} guest${c.guests > 1 ? 's' : ''}`}</div></div>
    <div class="pr-lab" style="margin-bottom:4px">Split</div>
    <div class="segmented">${[['whole', 'One check'], ['even', 'Evenly'], ['seat', 'By seat']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${mode === k ? 'on' : ''}" ${locked && mode !== k ? 'disabled' : ''}>${l}</button>`).join('')}</div>
    ${mode === 'even' ? `<div class="row" style="padding:0 0 10px"><span class="grow">Ways</span><span class="stepper"><button type="button" id="nm" ${locked ? 'disabled' : ''}>−</button><b>${c.split.n}</b><button type="button" id="np" ${locked ? 'disabled' : ''}>+</button></span></div>` : ''}
    <div class="group">${ps.map((p) => `<button class="row ${p.due ? 'nav' : ''}" type="button" data-part="${p.key}" ${p.due ? '' : 'disabled'}><span class="grow"><span class="title">${esc(p.label)}</span><span class="sub">${p.due ? `${money(p.due)} due` : 'Paid'}</span></span><span class="meta">${p.due ? money(p.amount) : '<span class="pill okp">Paid</span>'}</span></button>`).join('')}</div>
    ${(c.payments || []).length ? `<div class="section-label">Payments</div><div class="group">${c.payments.map((p) => `<div class="row"><span class="grow"><span class="title">${p.method === 'cash' ? 'Cash' : esc((PAYMENT_SERVICES.find((s) => s.id === p.provider) || {}).name || 'Card')}${p.tip ? ` · tip ${money(p.tip)}` : ''}</span><span class="sub">${tm(p.at)} · ${esc(p.ref || '')}</span></span><span class="meta">${money(p.amount)}</span></div>`).join('')}</div>` : ''}
    <p class="muted small center">Cards go through ${esc(svc.name)}${svc.device ? ' on the ' + esc(svc.device) : ''}. ${svc.id === 'practice' ? 'Practice: nothing is charged.' : 'Not connected yet: simulated, nothing is charged.'}</p>`,
      onMount(api) {
        $$('[data-mode]', api.el).forEach((b) => b.onclick = () => { if (!locked) api.close({ split: b.dataset.mode === 'whole' ? null : { mode: b.dataset.mode, n: c.split?.n || 2 } }); });
        $('#nm', api.el)?.addEventListener('click', () => api.close({ split: { ...c.split, n: Math.max(2, c.split.n - 1) } }));
        $('#np', api.el)?.addEventListener('click', () => api.close({ split: { ...c.split, n: Math.min(10, c.split.n + 1) } }));
        $$('[data-part]', api.el).forEach((b) => b.onclick = () => api.close({ part: b.dataset.part }));
      },
    });
    if (!r) return false;
    if ('split' in r) { await data.put('check', { ...c, split: r.split }); continue; }
    if (await payPart(c, ps.find((p) => p.key === r.part), P)) return true;
  }
}

async function payPart(c, part, P) {
  const svc = payService(P);
  const how = await sheet({
    title: `${part.label} · ${money(part.due)}`, left: 'Cancel',
    body: `<div class="stack"><button class="btn block" type="button" data-h="card">Card · ${esc(svc.name)}</button><button class="btn block tonal" type="button" data-h="cash">Cash</button></div>`,
    onMount(api) { $$('[data-h]', api.el).forEach((b) => b.onclick = () => api.close(b.dataset.h)); },
  });
  if (!how) return false;
  const pay = how === 'cash' ? await cashSheet(part) : svc.how === 'handoff' ? await toastSheet(c, part) : await terminalSheet(part, P);
  if (!pay) return false;
  const cur = await data.get('check', c.id);
  const payments = [...(cur.payments || []), { id: lid(), part: part.key, amount: part.due, at: Date.now(), by: meId(), byName: meName(), ...pay }];
  const next = { ...cur, payments };
  if (totals(next, P.tax).due <= 0.004) {
    await data.put('check', { ...next, closed: Date.now(), closedDate: data.today() });
    toast(`${c.name} paid and closed`); return true;
  }
  await data.put('check', next); toast('Payment recorded'); return false;
}

function terminalSheet(part, P) {
  const svc = payService(P), dev = svc.device || 'Card reader';
  return sheet({
    title: dev, left: 'Cancel',
    body: `<p class="muted small center">${svc.id === 'practice' ? 'Practice reader' : `Sent to ${esc(dev)} “${esc(P.device)}”`} · what the guest sees:</p>
      <div class="pos-term"><div class="pr-lab" style="color:#aaa">Amount</div><div class="pr-big" style="color:#fff">${money(part.due)}</div>
        <div class="pr-lab" style="color:#aaa;margin-top:10px">Add a tip</div>
        <div class="pos-tips">${[18, 20, 22].map((p) => `<button type="button" data-tip="${r2(part.due * p / 100)}">${p}%<small>${money(part.due * p / 100)}</small></button>`).join('')}<button type="button" data-tip="0">No tip</button></div>
        <div id="tap" class="pos-tap" hidden>Tap, insert or swipe<button class="btn block" type="button" id="ok" style="margin-top:12px">Approve (simulate)</button></div></div>`,
    onMount(api) {
      let tip = null;
      $$('[data-tip]', api.el).forEach((b) => b.onclick = () => { tip = +b.dataset.tip; $$('[data-tip]', api.el).forEach((x) => x.classList.toggle('on', x === b)); $('#tap', api.el).hidden = false; });
      $('#ok', api.el).onclick = () => api.close({ method: 'card', provider: svc.id, tip, ref: (svc.id === 'practice' ? 'PR-' : svc.id.slice(0, 2).toUpperCase() + '-') + Math.random().toString(36).slice(2, 8).toUpperCase() });
    },
  });
}
function toastSheet(c, part) {
  return sheet({
    title: 'Pay on Toast', left: 'Cancel', right: 'Mark paid',
    body: `<p>Order <b>#${c.no}</b> (${esc(c.name)}) for <b>${money(part.due)}</b>.</p>
      <p class="muted small">Take the card on the Toast handheld, then enter the tip it shows and tap Mark paid. (Not connected yet: nothing is sent to Toast.)</p>
      <label class="field"><span>Tip on the Toast receipt</span><input type="text" inputmode="decimal" id="tp" placeholder="0.00"></label>`,
    onMount(api) { api.onRight = () => api.close({ method: 'card', provider: 'toast', tip: r2(parseFloat($('#tp', api.el).value) || 0), ref: 'TOAST-' + c.no }); },
  });
}
function cashSheet(part) {
  const quick = [...new Set([part.due, Math.ceil(part.due / 5) * 5, Math.ceil(part.due / 20) * 20, 50, 100].filter((v) => v >= part.due))].slice(0, 4);
  return sheet({
    title: `Cash · ${money(part.due)}`, left: 'Cancel', right: 'Done',
    body: `<div class="pos-choices">${quick.map((v) => `<button type="button" class="btn tonal" data-v="${v}">${money(v)}</button>`).join('')}</div>
      <label class="field"><span>Cash received</span><input type="text" inputmode="decimal" id="rc" value="${part.due.toFixed(2)}"></label>
      <div class="card center"><div class="pr-lab">Change</div><div class="pr-big" id="chg">${money(0)}</div></div>
      <label class="field"><span>Cash tip left (optional)</span><input type="text" inputmode="decimal" id="ct" placeholder="0.00"></label>`,
    onMount(api) {
      const upd = () => { $('#chg', api.el).textContent = money(Math.max(0, (parseFloat($('#rc', api.el).value) || 0) - part.due)); };
      $$('[data-v]', api.el).forEach((b) => b.onclick = () => { $('#rc', api.el).value = (+b.dataset.v).toFixed(2); upd(); });
      $('#rc', api.el).oninput = upd;
      api.onRight = () => { const v = parseFloat($('#rc', api.el).value) || 0; if (v + 0.001 < part.due) { toast('Not enough cash'); return; } api.close({ method: 'cash', provider: null, tip: r2(parseFloat($('#ct', api.el).value) || 0), ref: 'CASH', change: r2(v - part.due) }); };
    },
  });
}

// ------------------------------------------------------------ order-up alerts (RRA-124)
// Bumping a ticket on the kitchen or bar screen sends "Pick up Table #" to the
// server who took the order. If nobody taps Picked up within the Admin's delay
// (POS settings, 2 minutes to start), it goes to every server on the clock,
// with a red border. Each phone shows its alerts at the top of the screen and a
// count on Orders (POS).
const PICKUP_MAX = 2 * 3600e3; // older alerts are dropped
let pickupSeen = new Set();
async function onTheClock() {
  const me = myStaff();
  if (!me) return isHost(); // the Admin without a staff card still sees them
  return (await data.list('punch')).some((p) => p.staffId === me.id && !p.out);
}
export async function myPickups() {
  if (!session.profile || !canOrder()) return [];
  const P = await posSettings(), delay = (P.pickupDelay || 2) * 60e3, now = Date.now();
  const open = (await data.list('pickup')).filter((p) => !p.picked && now - p.at < PICKUP_MAX).sort((a, b) => a.at - b.at);
  if (!open.length) return [];
  const clocked = await onTheClock();
  return open.filter((p) => isMine(p) || (now - p.at >= delay && clocked)).map((p) => ({ ...p, late: now - p.at >= delay }));
}
// The Admin's checks may carry 'admin' from before they had a staff card.
const isMine = (p) => p.serverId === meId() || (isHost() && p.serverId === 'admin');
function chime() {
  try {
    navigator.vibrate?.([120, 60, 120]);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g = ctx.createGain(); g.gain.value = 0.18; g.connect(ctx.destination);
    [880, 1175].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.16); });
    setTimeout(() => ctx.close(), 800);
  } catch {}
}
export async function showPickups() {
  const list = await myPickups();
  for (const b of $$('.pos-badge')) { b.hidden = !list.length; b.textContent = list.length; }
  let box = $('#pickups');
  if (!list.length) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'pickups'; box.className = 'pickups'; box.setAttribute('role', 'status'); document.body.append(box); }
  const fresh = list.filter((p) => !pickupSeen.has(p.id + (p.late ? 'L' : '')));
  if (fresh.length) {
    chime();
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then((r) => r.showNotification('Pick up ' + fresh[0].checkName, { body: `${fresh[0].station} order is up`, tag: 'pickup-' + fresh[0].id, icon: BRAND.icon192 })).catch(() => {});
    }
  }
  list.forEach((p) => pickupSeen.add(p.id + (p.late ? 'L' : '')));
  box.innerHTML = list.slice(0, 4).map((p) => `<div class="pickup${p.late ? ' late' : ''}">
      <span class="pk-i" aria-hidden="true">🔔</span>
      <span class="grow"><b>Pick up ${esc(p.checkName)}</b><small>${esc(p.station)} · ${mins(p.at)} min${p.late && !isMine(p) ? ` · ${esc((p.serverName || 'server').split(' ')[0])}'s table` : ''}</small></span>
      <button type="button" class="btn small" data-picked="${p.id}">Picked up</button></div>`).join('') + (list.length > 4 ? `<div class="pickup more">+${list.length - 4} more</div>` : '');
  $$('[data-picked]', box).forEach((b) => b.onclick = async () => {
    const p = await data.get('pickup', b.dataset.picked);
    if (p && !p.picked) await data.put('pickup', { ...p, picked: Date.now(), pickedBy: meName() });
    showPickups();
  });
}
export function startPickups() {
  if (startPickups.on) return; startPickups.on = true;
  data.onChange((coll) => { if (coll === 'pickup' || coll === 'punch' || coll === 'settings') showPickups(); });
  setInterval(showPickups, 15000);
  showPickups();
}

// ------------------------------------------------------------ kitchen and bar screen
export async function ticketsView() {
  setChrome({ tab: 'more', back: true });
  if (!canKitchen()) { setTitle('Kitchen screen'); view.innerHTML = lock('The kitchen and bar screen is for the kitchen, the bar, managers and the Admin.'); return; }
  let station = LS.get('posStation', job() === 'bar' ? 'Bar' : 'Kitchen');
  setTitle(station === 'Bar' ? 'Bar tickets' : 'Kitchen tickets', can86() ? '<button class="btn plain small" id="e86" type="button">86 list</button>' : '');
  const all = (await data.list('ticket')).filter((t) => !t.bumped);
  const live = all.filter((t) => t.station === station).sort((a, b) => a.at - b.at);
  view.innerHTML = `
    <div class="segmented">${['Kitchen', 'Bar'].map((s) => `<button type="button" data-st="${s}" class="${s === station ? 'on' : ''}">${s} (${all.filter((t) => t.station === s).length})</button>`).join('')}</div>
    <div class="pos-tix">${live.map((t) => { const m = mins(t.at); return `
      <div class="card pos-ticket ${m >= 15 ? 'late' : m >= 8 ? 'warm' : ''}">
        <div class="pos-th"><b>${esc(t.checkName)}</b><span>${m} min</span></div>
        <div class="pr-lab">${esc((t.server || '').split(' ')[0])} · ${tm(t.at)}</div>
        ${t.items.map((it, i) => `<button type="button" class="pos-ti${it.done ? ' done' : ''}" data-t="${t.id}" data-i="${i}"><span>${(it.qty || 1) > 1 ? `<b class="pos-x">${it.qty}×</b> ` : ''}${esc(short(it.name))}${it.mods?.length ? `<em>${esc(it.mods.join(', '))}</em>` : ''}${it.note ? `<em>“${esc(it.note)}”</em>` : ''}</span><small>S${it.seat}</small></button>`).join('')}
        <button class="btn block small" type="button" data-bump="${t.id}">Bump</button>
      </div>`; }).join('') || `<div class="empty">No ${station.toLowerCase()} tickets right now.</div>`}</div>
    <p class="muted small center">Tap an item when it's up. Bump clears the ticket. Tickets turn orange at 8 minutes and red at 15.</p>`;
  $$('[data-st]').forEach((b) => b.onclick = () => { LS.set('posStation', b.dataset.st); ticketsView(); });
  $$('[data-t]').forEach((b) => b.onclick = async () => { const t = await data.get('ticket', b.dataset.t); t.items[+b.dataset.i].done = !t.items[+b.dataset.i].done; await data.put('ticket', t); ticketsView(); });
  $$('[data-bump]').forEach((b) => b.onclick = async () => {
    const t = await data.get('ticket', b.dataset.bump);
    await data.put('ticket', { ...t, bumped: Date.now() });
    // RRA-124: tell the server the order is up.
    let serverId = t.serverId;
    if (!serverId) serverId = (await data.get('check', t.checkId))?.server || '';
    await data.put('pickup', { ticketId: t.id, checkId: t.checkId, checkName: t.checkName, station: t.station, serverId, serverName: t.server || '', at: Date.now(), picked: null });
    toast('Bumped · ' + t.checkName + ' · server alerted'); ticketsView();
  });
  $('#e86')?.addEventListener('click', eightySix);
  clearInterval(ticketsView.tick);
  ticketsView.tick = setInterval(() => { if (location.hash.startsWith('#/tickets') && !$('#dlg').open) ticketsView(); else clearInterval(ticketsView.tick); }, 60000);
}

async function eightySix() {
  const M = await menu(), P = await posSettings();
  const off = { ...P.eightySix };
  await sheet({
    title: '86 list', left: 'Done',
    body: `<p class="muted small">Items switched off can't be ordered on any phone until they're back on.</p>${M.filter((m) => !/sauce/i.test(m.section)).map((m) => `<div class="section-label pr-flush">${esc(m.section)}</div><div class="group">${m.items.map((x) => `<div class="row"><span class="grow">${esc(x.name)}</span><button type="button" class="toggle ${off[x.id] ? '' : 'on'}" data-86="${x.id}" aria-label="Available"></button></div>`).join('')}</div>`).join('')}`,
    onMount(api) { $$('[data-86]', api.el).forEach((b) => b.onclick = async () => { const k = b.dataset['86']; if (off[k]) delete off[k]; else off[k] = true; b.classList.toggle('on', !off[k]); await savePos({ eightySix: off }); }); },
  });
  ticketsView();
}

// ------------------------------------------------------------ today's sales (managers)
export async function posSalesView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Today\'s sales');
  if (!canSales()) { view.innerHTML = lock('Sales are for managers and the Admin.'); return; }
  const P = await posSettings();
  const today = data.today();
  const checks = await data.list('check');
  const closed = checks.filter((c) => c.closed && (c.closedDate || data.isoDate(new Date(c.closed))) === today);
  const by = {}, items = {};
  let net = 0, tax = 0, card = 0, cash = 0, cardTips = 0, cashTips = 0;
  for (const c of closed) {
    const t = totals(c, P.tax); net += t.sub; tax += t.tax;
    const s = (by[c.serverName || 'Staff'] ||= { net: 0, card: 0, cash: 0, checks: 0 }); s.net += t.sub; s.checks++;
    for (const p of c.payments || []) { if (p.method === 'cash') { cash += p.amount; cashTips += p.tip || 0; s.cash += p.tip || 0; } else { card += p.amount; cardTips += p.tip || 0; s.card += p.tip || 0; } }
    for (const x of c.items) if (!x.voided) items[x.name] = (items[x.name] || 0) + (x.qty || 1);
  }
  const top = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const open = checks.filter((c) => !c.closed);
  view.innerHTML = `
    <div class="pr-kpis">
      <div class="card"><div class="pr-v">${money(net)}</div><div class="pr-lab">Net sales · ${closed.length} checks</div></div>
      <div class="card"><div class="pr-v">${money(cardTips + cashTips)}</div><div class="pr-lab">Tips</div></div>
    </div>
    <div class="group">
      <div class="row"><span class="grow">Card payments</span><span class="meta">${money(card)}</span></div>
      <div class="row"><span class="grow">Cash payments</span><span class="meta">${money(cash)}</span></div>
      <div class="row"><span class="grow">Sales tax collected</span><span class="meta">${money(tax)}</span></div>
      <div class="row"><span class="grow">Average check</span><span class="meta">${money(closed.length ? net / closed.length : 0)}</span></div>
      <div class="row"><span class="grow"><span class="title">Still open</span><span class="sub">${open.length} checks</span></span><span class="meta">${money(open.reduce((t, c) => t + totals(c, P.tax).sub, 0))}</span></div>
    </div>
    <div class="section-label">By server</div>
    <div class="group">${Object.entries(by).map(([n, s]) => `<div class="row">${avatar(n)}<span class="grow"><span class="title">${esc(n)}</span><span class="sub">${s.checks} checks · card tips ${money(s.card)} · cash tips ${money(s.cash)}</span></span><span class="meta">${money(s.net)}</span></div>`).join('') || '<div class="row muted">No closed checks yet today.</div>'}</div>
    ${top.length ? `<div class="section-label">Top items</div><div class="group">${top.map(([n, q]) => `<div class="row"><span class="grow">${esc(n)}</span><span class="meta">${q}</span></div>`).join('')}</div>` : ''}
    <p class="muted small">Tips go into each night's tip pool and net sales into labor % in Payroll on their own.</p>`;
}

// ------------------------------------------------------------ POS settings (Admin)
export async function posSettingsView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Point of sale');
  if (!isHost()) { view.innerHTML = lock('Only the Admin changes point-of-sale settings.'); return; }
  const P = await posSettings(), svc = payService(P);
  view.innerHTML = `
    <div class="section-label">Card payments</div>
    <div class="group">${PAYMENT_SERVICES.map((x) => `<button class="row" type="button" data-pv="${x.id}"><span class="grow"><span class="title">${esc(x.name)}</span><span class="sub" style="white-space:normal">${esc(x.note)}</span></span>${x.id === svc.id ? '<b style="color:var(--accent)">✓</b>' : ''}</button>`).join('')}</div>
    <div class="group">
      ${svc.how === 'terminal' ? `<div class="row"><span class="grow"><span class="title">Card reader name</span><span class="sub">The ${esc(svc.device || 'reader')} payments go to</span></span><span class="meta">${esc(P.device)}</span><button class="btn plain small" id="dev" type="button">Change</button></div>` : ''}
      <div class="row"><span class="grow"><span class="title">Order-up alert</span><span class="sub" style="white-space:normal">When a ticket is bumped, its server gets "Pick up". If nobody picks it up in this time, every server on the clock gets it in red.</span></span><span class="meta">${P.pickupDelay || 2} min</span><button class="btn plain small" id="pkd" type="button">Change</button></div>
      <div class="row"><span class="grow"><span class="title">Sales tax</span><span class="sub">Check the rate for your address</span></span><span class="meta">${(P.tax * 100).toFixed(2)}%</span><button class="btn plain small" id="tax" type="button">Change</button></div>
    </div>
    <p class="muted small">Nothing is connected yet, so card payments are practice runs. Going live needs the restaurant's server for the payment keys and a developer account with ${esc(svc.id === 'practice' ? 'the payment company' : svc.name)}.</p>`;
  $$('[data-pv]').forEach((b) => b.onclick = async () => { await savePos({ payment: b.dataset.pv }); toast('Card payments: ' + PAYMENT_SERVICES.find((p) => p.id === b.dataset.pv).name); posSettingsView(); });
  $('#dev')?.addEventListener('click', async () => { const v = await sheet({ title: 'Card reader name', right: 'Save', body: `<label class="field"><span>Name</span><input type="text" id="dv" value="${esc(P.device)}"></label>`, onMount: (api) => { api.onRight = () => api.close($('#dv', api.el).value.trim()); } }); if (v) { await savePos({ device: v }); posSettingsView(); } });
  $('#pkd').onclick = async () => {
    let v = P.pickupDelay || 2;
    const ok = await sheet({ title: 'Order-up alert', right: 'Save',
      body: `<p class="muted small" style="margin-top:0">Minutes before an order nobody picked up goes to every server on the clock:</p>${numPick('pk', 10, v)}`,
      onMount: (api) => wirePick(api.el, 'pk', (n) => { v = n; }) });
    if (ok) { await savePos({ pickupDelay: v }); toast(`Order-up alert: ${v} min`); posSettingsView(); }
  };
  $('#tax').onclick = async () => { const v = await sheet({ title: 'Sales tax', right: 'Save', body: `<label class="field"><span>Percent</span><input type="text" inputmode="decimal" id="tx" value="${(P.tax * 100).toFixed(2)}"></label><p class="muted small">New checks use the new rate; open checks keep theirs.</p>`, onMount: (api) => { api.onRight = () => api.close(parseFloat($('#tx', api.el).value)); } }); if (v >= 0 && v < 20) { await savePos({ tax: v / 100 }); posSettingsView(); } };
}
