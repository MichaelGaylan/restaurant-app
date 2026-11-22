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
const POS_DEFAULTS = { payment: 'practice', device: 'Counter 1', tax: 0.08, eightySix: {}, seq: 100 };
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
export function modsFor(name, section) {
  if (/wing/i.test(name) || /wings/i.test(section)) return { title: 'Sauce', options: ['Mild Buffalo', 'Med Buffalo', 'Hot Buffalo', 'BBQ', 'Honey Sriracha', 'Honey Mustard', 'Plain'] };
  if (/burger/i.test(section) && !/veggie/i.test(name)) return { title: 'Temperature', options: ['Medium rare', 'Medium', 'Medium well', 'Well done'] };
  if (/salad/i.test(section)) return { title: 'Dressing', options: ['Ranch', 'Blue Cheese', 'Honey Mustard', 'Italian', 'None'] };
  return null;
}
async function menu() {
  const s = await data.settings();
  const order = s.sections || [];
  const dishes = (await data.list('recipe')).filter((r) => r.kind === 'dish' && r.section && +r.price > 0);
  const secs = [...new Set(dishes.map((d) => d.section))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return secs.map((section) => ({ section, items: dishes.filter((d) => d.section === section).sort((a, b) => (a.menuOrder ?? 999) - (b.menuOrder ?? 999) || a.name.localeCompare(b.name)).map((d) => ({ id: d.id, name: d.name, price: +d.price, section, station: STATION(section) })) }));
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

// ------------------------------------------------------------ Orders
export async function posView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Orders');
  if (!canOrder()) { view.innerHTML = lock('Orders are for servers, bartenders, managers and the Admin.'); return; }
  setTitle('Orders', '<button class="btn small" id="pos-new" type="button">+ New check</button>');
  const P = await posSettings(), staff = await data.list('staff');
  const showAll = boss() && LS.get('posAll', true);
  const list = (await openChecks()).filter((c) => showAll || c.server === meId()).sort((a, b) => a.opened - b.opened);
  const today = new Date().toDateString();
  const closedToday = (await data.list('check')).filter((c) => c.closed && new Date(c.closed).toDateString() === today).length;
  view.innerHTML = `
    ${boss() ? `<div class="segmented"><button type="button" data-all="1" class="${showAll ? 'on' : ''}">All checks</button><button type="button" data-all="0" class="${showAll ? '' : 'on'}">Mine</button></div>` : ''}
    ${list.length ? `<div class="group">${list.map((c) => { const t = totals(c, P.tax); const n = c.items.filter((x) => !x.sent && !x.voided).length; const nm = staffName(c.server, staff); return `
      <a class="row" href="#/poscheck/${c.id}">${avatar(nm)}<span class="grow"><span class="title">${esc(c.name)} <span class="muted small">#${c.no}</span></span>
        <span class="sub">${esc(nm.split(' ')[0])} · ${c.guests} guest${c.guests > 1 ? 's' : ''} · open ${mins(c.opened)} min${n ? ` · <span style="color:var(--warn)">${n} not sent</span>` : ''}</span></span>
        <span class="pr-num"><b>${money(t.total)}</b>${t.paid ? `<small class="muted">${money(t.due)} due</small>` : ''}</span></a>`; }).join('')}</div>`
    : '<div class="empty">No open checks. Tap <b>+ New check</b> to start one.</div>'}
    <div class="group">
      ${canKitchen() ? '<a class="row nav" href="#/tickets"><span class="grow">Kitchen and bar screen</span></a>' : ''}
      ${canSales() ? '<a class="row nav" href="#/possales"><span class="grow">Today\'s sales</span></a>' : ''}
    </div>
    <p class="muted small center">${closedToday} check${closedToday === 1 ? '' : 's'} closed today · cards through ${esc(payService(P).name)}</p>`;
  $$('[data-all]').forEach((b) => b.onclick = () => { LS.set('posAll', b.dataset.all === '1'); posView(); });
  $('#pos-new').onclick = newCheck;
}

async function newCheck() {
  let kind = 'table', guests = 2;
  const res = await sheet({
    title: 'New check', right: 'Open',
    body: `<div class="segmented" id="kind"><button type="button" data-k="table" class="on">Table</button><button type="button" data-k="tab">Bar tab</button></div>
      <label class="field"><span id="nl">Table number</span><input type="text" id="nm" placeholder="e.g. 12"></label>
      <div class="row" style="padding:0"><span class="grow">Guests</span><span class="stepper"><button type="button" id="gm">−</button><b id="gv">2</b><button type="button" id="gp">+</button></span></div>`,
    onMount(api) {
      $$('#kind button', api.el).forEach((b) => b.onclick = () => { kind = b.dataset.k; $$('#kind button', api.el).forEach((x) => x.classList.toggle('on', x === b)); $('#nl', api.el).textContent = kind === 'table' ? 'Table number' : 'Name on the tab'; if (kind === 'tab') { guests = 1; $('#gv', api.el).textContent = 1; } });
      $('#gm', api.el).onclick = () => { guests = Math.max(1, guests - 1); $('#gv', api.el).textContent = guests; };
      $('#gp', api.el).onclick = () => { guests = Math.min(20, guests + 1); $('#gv', api.el).textContent = guests; };
      api.onRight = () => { const v = $('#nm', api.el).value.trim(); if (!v) { toast(kind === 'table' ? 'Enter a table number' : 'Enter a name'); return; } api.close({ name: kind === 'table' ? `Table ${v.replace(/^table\s*/i, '')}` : `Bar · ${v}`, kind, guests }); };
    },
  });
  if (!res) return;
  const P = await posSettings();
  const no = (P.seq || 100) + 1;
  await savePos({ seq: no });
  const c = await data.put('check', { no, ...res, server: meId(), serverName: meName(), opened: Date.now(), items: [], payments: [], tax: P.tax });
  location.hash = '#/poscheck/' + c.id;
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
  view.innerHTML = `
    <div class="card pos-check">
      ${c.items.length ? seats.map((s) => `<div class="pos-seat">${c.guests > 1 ? `<div class="pr-lab">Seat ${s}</div>` : ''}${c.items.filter((x) => x.seat === s).map((x) => `
        <button class="pos-line${x.voided ? ' void' : ''}" type="button" data-line="${x.id}"><span class="grow">${esc(x.name)}${x.mods?.length ? `<span class="pos-mod">${esc(x.mods.join(', '))}</span>` : ''}${x.note ? `<span class="pos-mod">“${esc(x.note)}”</span>` : ''}</span>
          <span class="pos-st">${x.voided ? 'void' : x.sent ? '✓ sent' : '<b style="color:var(--warn)">new</b>'}</span><span class="pos-price">${money(lineTotal(x))}</span></button>`).join('')}</div>`).join('')
      : '<p class="muted center" style="margin:6px 0">No items yet. Pick from the menu below.</p>'}
      <div class="pos-tot"><span>Subtotal</span><span>${money(t.sub)}</span></div>
      <div class="pos-tot"><span>Tax ${((c.tax ?? P.tax) * 100).toFixed(1)}%</span><span>${money(t.tax)}</span></div>
      <div class="pos-tot big"><span>Total</span><span>${money(t.total)}</span></div>
      ${t.paid ? `<div class="pos-tot"><span>Paid</span><span>−${money(t.paid)}</span></div><div class="pos-tot big"><span>Due</span><span>${money(t.due)}</span></div>` : ''}
    </div>
    <div class="btn-row pos-actions">
      <button class="btn tonal" id="send" type="button" ${unsent.length ? '' : 'disabled'}>Send${unsent.length ? ` (${unsent.length})` : ''}</button>
      <button class="btn" id="pay" type="button" ${c.items.some((x) => !x.voided) ? '' : 'disabled'}>Pay ${money(t.due)}</button>
    </div>
    ${c.guests > 1 ? `<div class="pr-lab" style="margin:12px 0 4px">Adding to</div><div class="segmented">${Array.from({ length: c.guests }, (_, i) => `<button type="button" data-seat="${i + 1}" class="${seat === i + 1 ? 'on' : ''}">Seat ${i + 1}</button>`).join('')}</div>` : ''}
    <div class="pos-secs">${M.map((m) => `<button type="button" data-sec="${esc(m.section)}" class="${m.section === section ? 'on' : ''}">${esc(m.section)}</button>`).join('')}</div>
    <div class="pos-grid">${items.map((x) => { const out = P.eightySix[x.id]; return `<button type="button" class="pos-item${out ? ' out' : ''}" data-item="${x.id}" ${out ? 'disabled' : ''}><span>${esc(x.name.replace(' with Fries', ''))}</span><small>${out ? '86’d' : money(x.price)}</small></button>`; }).join('') || '<p class="muted small">No dishes with a price in this section. Add prices in Recipes.</p>'}</div>`;
  $$('[data-sec]').forEach((b) => b.onclick = () => { LS.set('posSec', b.dataset.sec); posCheckView(id); });
  $$('[data-seat]').forEach((b) => b.onclick = () => { posCheckView.seat = +b.dataset.seat; posCheckView(id); });
  $$('[data-item]').forEach((b) => b.onclick = () => addItem(c, items.find((x) => x.id === b.dataset.item), seat));
  $$('[data-line]').forEach((b) => b.onclick = () => lineSheet(c, c.items.find((x) => x.id === b.dataset.line)));
  $('#send').onclick = async () => { await send(c); toast('Sent to the kitchen and bar'); posCheckView(id); };
  $('#pay').onclick = () => { location.hash = '#/pospay/' + c.id; };
}

const lid = () => Math.random().toString(36).slice(2, 9);
async function addItem(c, x, seat) {
  const m = modsFor(x.name, x.section);
  let line = { id: lid(), menuId: x.id, name: x.name, price: x.price, station: x.station, mods: [], note: '', seat, sent: false };
  if (m) {
    const pick = await sheet({
      title: x.name.replace(' with Fries', ''), left: 'Cancel',
      body: `<div class="pr-lab">${esc(m.title)}</div><div class="pos-choices">${m.options.map((o) => `<button type="button" class="btn tonal" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        <label class="field"><span>Note for the kitchen (optional)</span><input type="text" id="nt" placeholder="e.g. no onions"></label>`,
      onMount(api) { $$('[data-o]', api.el).forEach((b) => b.onclick = () => api.close({ mod: b.dataset.o, note: $('#nt', api.el).value.trim() })); },
    });
    if (!pick) return;
    line = { ...line, mods: [pick.mod], note: pick.note };
  }
  const cur = await data.get('check', c.id);
  await data.put('check', { ...cur, items: [...cur.items, line] });
  posCheckView(c.id);
}

async function lineSheet(c, x) {
  const act = await sheet({
    title: x.name, left: 'Close',
    body: `<p class="muted small">${money(x.price)} · seat ${x.seat}${x.mods?.length ? ' · ' + esc(x.mods.join(', ')) : ''} · ${x.sent ? 'sent to the ' + x.station.toLowerCase() : 'not sent yet'}</p>
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
    if (its.length) await data.put('ticket', { checkId: cur.id, checkName: cur.name, server: cur.serverName || '', station: st, at: Date.now(), items: its.map((x) => ({ name: x.name, mods: x.mods || [], note: x.note || '', seat: x.seat, done: false })) });
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

export async function posPayView(id) {
  setChrome({ tab: 'more', back: true });
  const c = await data.get('check', id);
  if (!c || c.closed) { location.hash = '#/pos'; return; }
  if (!canOrder()) { setTitle('Pay'); view.innerHTML = lock('Taking payment is for servers, bartenders and managers.'); return; }
  const P = await posSettings();
  setTitle('Pay · ' + c.name);
  const t = totals(c, P.tax), ps = parts(c, P.tax), mode = c.split?.mode || 'whole', locked = (c.payments || []).length > 0, svc = payService(P);
  view.innerHTML = `
    <div class="card center"><div class="pr-lab">Total with tax</div><div class="pr-big">${money(t.total)}</div><div class="pr-lab">${t.paid ? `${money(t.paid)} paid · <b>${money(t.due)} due</b>` : `${c.items.filter((x) => !x.voided).length} items · ${c.guests} guest${c.guests > 1 ? 's' : ''}`}</div></div>
    <div class="pr-lab" style="margin-bottom:4px">Split</div>
    <div class="segmented">${[['whole', 'One check'], ['even', 'Evenly'], ['seat', 'By seat']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${mode === k ? 'on' : ''}" ${locked && mode !== k ? 'disabled' : ''}>${l}</button>`).join('')}</div>
    ${mode === 'even' ? `<div class="row" style="padding:0 0 10px"><span class="grow">Ways</span><span class="stepper"><button type="button" id="nm" ${locked ? 'disabled' : ''}>−</button><b>${c.split.n}</b><button type="button" id="np" ${locked ? 'disabled' : ''}>+</button></span></div>` : ''}
    <div class="group">${ps.map((p) => `<button class="row ${p.due ? 'nav' : ''}" type="button" data-part="${p.key}" ${p.due ? '' : 'disabled'}><span class="grow"><span class="title">${esc(p.label)}</span><span class="sub">${p.due ? `${money(p.due)} due` : 'Paid'}</span></span><span class="meta">${p.due ? money(p.amount) : '<span class="pill okp">Paid</span>'}</span></button>`).join('')}</div>
    ${(c.payments || []).length ? `<div class="section-label">Payments</div><div class="group">${c.payments.map((p) => `<div class="row"><span class="grow"><span class="title">${p.method === 'cash' ? 'Cash' : esc((PAYMENT_SERVICES.find((s) => s.id === p.provider) || {}).name || 'Card')}${p.tip ? ` · tip ${money(p.tip)}` : ''}</span><span class="sub">${tm(p.at)} · ${esc(p.ref || '')}</span></span><span class="meta">${money(p.amount)}</span></div>`).join('')}</div>` : ''}
    <p class="muted small center">Cards go through ${esc(svc.name)}${svc.device ? ' on the ' + esc(svc.device) : ''}. ${svc.id === 'practice' ? 'Practice: nothing is charged.' : 'Not connected yet: simulated, nothing is charged.'}</p>`;
  const save = (patch) => data.put('check', { ...c, ...patch }).then(() => posPayView(id));
  $$('[data-mode]').forEach((b) => b.onclick = () => { if (!locked) save({ split: b.dataset.mode === 'whole' ? null : { mode: b.dataset.mode, n: c.split?.n || 2 } }); });
  $('#nm')?.addEventListener('click', () => save({ split: { ...c.split, n: Math.max(2, c.split.n - 1) } }));
  $('#np')?.addEventListener('click', () => save({ split: { ...c.split, n: Math.min(10, c.split.n + 1) } }));
  $$('[data-part]').forEach((b) => b.onclick = () => payPart(c, ps.find((p) => p.key === b.dataset.part), P));
}

async function payPart(c, part, P) {
  const svc = payService(P);
  const how = await sheet({
    title: `${part.label} · ${money(part.due)}`, left: 'Cancel',
    body: `<div class="stack"><button class="btn block" type="button" data-h="card">Card · ${esc(svc.name)}</button><button class="btn block tonal" type="button" data-h="cash">Cash</button></div>`,
    onMount(api) { $$('[data-h]', api.el).forEach((b) => b.onclick = () => api.close(b.dataset.h)); },
  });
  if (!how) return;
  const pay = how === 'cash' ? await cashSheet(part) : svc.how === 'handoff' ? await toastSheet(c, part) : await terminalSheet(part, P);
  if (!pay) return;
  const cur = await data.get('check', c.id);
  const payments = [...(cur.payments || []), { id: lid(), part: part.key, amount: part.due, at: Date.now(), by: meId(), byName: meName(), ...pay }];
  const next = { ...cur, payments };
  if (totals(next, P.tax).due <= 0.004) {
    await data.put('check', { ...next, closed: Date.now(), closedDate: data.today() });
    toast(`${c.name} paid and closed`); location.hash = '#/pos';
  } else { await data.put('check', next); toast('Payment recorded'); posPayView(c.id); }
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
        ${t.items.map((it, i) => `<button type="button" class="pos-ti${it.done ? ' done' : ''}" data-t="${t.id}" data-i="${i}"><span>${esc(it.name.replace(' with Fries', ''))}${it.mods?.length ? `<em>${esc(it.mods.join(', '))}</em>` : ''}${it.note ? `<em>“${esc(it.note)}”</em>` : ''}</span><small>S${it.seat}</small></button>`).join('')}
        <button class="btn block small" type="button" data-bump="${t.id}">Bump</button>
      </div>`; }).join('') || `<div class="empty">No ${station.toLowerCase()} tickets right now.</div>`}</div>
    <p class="muted small center">Tap an item when it's up. Bump clears the ticket. Tickets turn orange at 8 minutes and red at 15.</p>`;
  $$('[data-st]').forEach((b) => b.onclick = () => { LS.set('posStation', b.dataset.st); ticketsView(); });
  $$('[data-t]').forEach((b) => b.onclick = async () => { const t = await data.get('ticket', b.dataset.t); t.items[+b.dataset.i].done = !t.items[+b.dataset.i].done; await data.put('ticket', t); ticketsView(); });
  $$('[data-bump]').forEach((b) => b.onclick = async () => { const t = await data.get('ticket', b.dataset.bump); await data.put('ticket', { ...t, bumped: Date.now() }); toast('Bumped · ' + t.checkName); ticketsView(); });
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
    for (const x of c.items) if (!x.voided) items[x.name] = (items[x.name] || 0) + 1;
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
      <div class="row"><span class="grow"><span class="title">Sales tax</span><span class="sub">Check the rate for your address</span></span><span class="meta">${(P.tax * 100).toFixed(2)}%</span><button class="btn plain small" id="tax" type="button">Change</button></div>
    </div>
    <p class="muted small">Nothing is connected yet, so card payments are practice runs. Going live needs the restaurant's server for the payment keys and a developer account with ${esc(svc.id === 'practice' ? 'the payment company' : svc.name)}.</p>`;
  $$('[data-pv]').forEach((b) => b.onclick = async () => { await savePos({ payment: b.dataset.pv }); toast('Card payments: ' + PAYMENT_SERVICES.find((p) => p.id === b.dataset.pv).name); posSettingsView(); });
  $('#dev')?.addEventListener('click', async () => { const v = await sheet({ title: 'Card reader name', right: 'Save', body: `<label class="field"><span>Name</span><input type="text" id="dv" value="${esc(P.device)}"></label>`, onMount: (api) => { api.onRight = () => api.close($('#dv', api.el).value.trim()); } }); if (v) { await savePos({ device: v }); posSettingsView(); } });
  $('#tax').onclick = async () => { const v = await sheet({ title: 'Sales tax', right: 'Save', body: `<label class="field"><span>Percent</span><input type="text" inputmode="decimal" id="tx" value="${(P.tax * 100).toFixed(2)}"></label><p class="muted small">New checks use the new rate; open checks keep theirs.</p>`, onMount: (api) => { api.onRight = () => api.close(parseFloat($('#tx', api.el).value)); } }); if (v >= 0 && v < 20) { await savePos({ tax: v / 100 }); posSettingsView(); } };
}
