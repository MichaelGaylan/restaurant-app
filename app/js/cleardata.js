// Clear test data (RRA-106, RRA-130), Admin only: erase practice records for
// the whole team before going live. Never deletes dishes, house recipes, the
// menu, stock (inventory), vendors, prep items, staff, pay rates, roles,
// coupons or settings. Two picks change a setting instead of erasing records:
// restart check numbers at 1, and empty the 86 list (only turns dishes back on).

import * as data from './data.js';
import * as sync from './sync.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome } from './ui.js';
import { isHost } from './perms.js';
import { APP_NAME, BRAND } from './config.js';

const thisWeek = () => data.weekStart();

export const CLEAR_GROUPS = [
  { k: 'clock', label: 'Clock-ins and time sheets', colls: ['punch'] },
  { k: 'payroll', label: 'Payroll', sub: 'Pay runs, paystubs, early pay, tip shares, tip pool and sales uploads', colls: ['payrun', 'paystub', 'advance', 'tipshare', 'tippool', 'possales', 'payperiod'] },
  { k: 'pos', label: 'Point of sale', sub: "Checks, kitchen and bar tickets, today's sales. One-time coupons that were used get paused, so their codes can't work again.", colls: ['check', 'ticket', 'pickup'] },
  { k: 'checkno', label: 'Restart check numbers at 1', sub: 'The next check rung up is #1', setting: true },
  { k: 'e86', label: 'Empty the 86 list', sub: 'Turns every dish back on so it can be ordered. No dish, menu item or stock is deleted.', setting: true },
  { k: 'prep', label: 'Daily prep check-offs', sub: 'Which prep was marked done each day. The prep list itself stays.', colls: ['prepday'] },
  { k: 'posts', label: 'Messages and problem reports', colls: ['post'] },
  { k: 'swaps', label: 'Swap and time-off requests', sub: 'Approved time off stays on the schedule.', colls: ['swap', 'timeoff'] },
  { k: 'events', label: 'Events (BEOs)', colls: ['event'] },
  { k: 'waste', label: 'Waste log', colls: ['waste'] },
  { k: 'weeks', label: 'Past schedules', sub: 'Weeks before this one. This week and later stay.', colls: ['week'], keep: (id) => id >= thisWeek() },
];

// One tap for the first ask: sales and time logs.
export const PRESET_SALES = ['clock', 'payroll', 'pos', 'checkno'];

// Inventory-type records. This screen may never erase any of these.
export const PROTECTED = ['recipe', 'stock', 'vendor', 'prepitem', 'prepsaved', 'staff', 'payrate', 'coupon', 'settings'];
for (const g of CLEAR_GROUPS) for (const c of g.colls || []) if (PROTECTED.includes(c)) throw new Error(`Clear records: ${c} is protected`);

// Local ids plus ids only the shared data has (sealed to other phones).
async function idsOf(coll) {
  const local = (await data.list(coll)).map((d) => d.id);
  return [...new Set([...local, ...sync.remoteIds(coll)])];
}
async function idsToClear(g, c) { const ids = await idsOf(c); return g.keep ? ids.filter((id) => !g.keep(id)) : ids; }

const posOf = async () => (await data.settings()).pos || {};
async function countGroup(g) {
  if (g.k === 'checkno') return ((await posOf()).seq ?? 100) === 0 ? 0 : 1;
  if (g.k === 'e86') return Object.keys((await posOf()).eightySix || {}).length;
  let n = 0;
  for (const c of g.colls) n += (await idsToClear(g, c)).length;
  return n;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : (w.endsWith('sh') ? 'es' : 's')}`;
function metaOf(g, n) {
  if (g.k === 'checkno') return n ? 'Restart' : 'Already at 1';
  if (!n) return 'None';
  return g.k === 'e86' ? `${plural(n, 'dish')} out` : `${n} to erase`;
}

// One-time coupons used on the checks about to go: pause them, so a used code
// can't work again once its check is gone. The coupon itself stays.
async function usedOneTimeCoupons() {
  const used = new Set();
  for (const k of await data.list('check')) for (const x of k.coupons || []) if (x.couponId) used.add(x.couponId);
  return (await data.list('coupon')).filter((cp) => cp.unique && !cp.paused && used.has(cp.id));
}

async function backupFile(groups) {
  const out = { app: APP_NAME, kind: 'test-data-backup', at: new Date().toISOString(), data: {} };
  for (const g of groups) for (const c of g.colls || []) {
    const drop = new Set(await idsToClear(g, c));
    out.data[c] = (await data.list(c)).filter((d) => drop.has(d.id));
  }
  if (groups.some((g) => g.setting || g.k === 'pos')) {
    out.data.pos = await posOf();
    out.data.coupon = await data.list('coupon');
  }
  const name = `${BRAND.teamId}-test-data-${data.today()}.json`;
  const file = new File([JSON.stringify(out, null, 1)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e?.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

export async function clearDataView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Clear test data');
  if (!isHost()) { view.innerHTML = '<div class="empty">🔒 Only the Admin can clear test data.</div>'; return; }
  const counts = {};
  for (const g of CLEAR_GROUPS) counts[g.k] = await countGroup(g);
  const pick = new Set(clearDataView.pick || []);
  const chosen = () => CLEAR_GROUPS.filter((g) => pick.has(g.k) && counts[g.k]);
  const total = () => chosen().filter((g) => !g.setting).reduce((n, g) => n + counts[g.k], 0);
  view.innerHTML = `
    <p class="small">Erase practice records for the whole team, on every phone. Pick what goes:</p>
    <button class="btn tonal block" id="cd-sales" type="button" style="margin-bottom:8px">Pick sales and time logs</button>
    <div class="group cd-list">${CLEAR_GROUPS.map((g) => `<label class="row"><input type="checkbox" data-k="${g.k}"${pick.has(g.k) ? ' checked' : ''}${counts[g.k] ? '' : ' disabled'}>
      <span class="grow"><span class="title">${esc(g.label)}</span>${g.sub ? `<span class="sub" style="white-space:normal">${esc(g.sub)}</span>` : ''}</span><span class="meta">${esc(metaOf(g, counts[g.k]))}</span></label>`).join('')}</div>
    <div class="hint small">Never erased: stock (inventory) and its counts, dishes, house recipes, the menu, vendors, prep items, staff, pay rates, roles, coupons, seating and settings.</div>
    <button class="btn tonal block" id="cd-backup" type="button" disabled>Save a backup file first</button>
    <button class="btn block" id="cd-go" type="button" style="margin-top:8px;background:var(--danger)" disabled>Clear</button>
    <p class="muted small">The backup file holds what this phone can read of the picked records, including pay. Keep it private.</p>`;
  const upd = () => {
    const n = total(), any = chosen().length > 0;
    $('#cd-go').disabled = !any; $('#cd-backup').disabled = !any;
    $('#cd-go').textContent = n ? `Clear ${n} record${n === 1 ? '' : 's'}` : 'Clear';
  };
  $$('[data-k]').forEach((b) => b.onchange = () => { if (b.checked) pick.add(b.dataset.k); else pick.delete(b.dataset.k); clearDataView.pick = [...pick]; upd(); });
  $('#cd-sales').onclick = () => {
    for (const k of PRESET_SALES) if (counts[k]) pick.add(k);
    clearDataView.pick = [...pick];
    $$('[data-k]').forEach((b) => { b.checked = pick.has(b.dataset.k); });
    upd();
  };
  upd();
  $('#cd-backup').onclick = async () => { if (await backupFile(chosen())) { clearDataView.backedUp = true; toast('Backup file ready'); } };
  $('#cd-go').onclick = async () => {
    const gs = chosen(), n = total();
    const coupons = gs.some((g) => g.k === 'pos') ? await usedOneTimeCoupons() : [];
    const line = (g) => g.k === 'checkno' ? 'Check numbers restart at 1'
      : g.k === 'e86' ? `86 list emptied: ${plural(counts[g.k], 'dish')} back on`
      : `${esc(g.label)}: ${counts[g.k]}`;
    const ok = await sheet({
      title: 'Clear test data?', right: 'Clear',
      body: `<p>${n ? `This erases <b>${n}</b> record${n === 1 ? '' : 's'} for everyone, on every phone:` : 'This changes, for everyone, on every phone:'}</p>
        <ul class="small">${gs.map((g) => `<li>${line(g)}</li>`).join('')}${coupons.length ? `<li>One-time coupons paused: ${coupons.map((c) => esc(c.code)).join(', ')}</li>` : ''}</ul>
        <p class="small">Stock (inventory), dishes, recipes and the menu are not touched.</p>
        <p class="small">It can't be undone${clearDataView.backedUp ? '' : ', and no backup file was saved yet'}.</p>
        <label class="field"><span>Type CLEAR to confirm</span><input type="text" id="cd-type" autocomplete="off" autocapitalize="characters"></label>
        <p id="cd-err" class="small" style="color:var(--danger)"></p>`,
      onMount: (api) => { api.onRight = () => { if ($('#cd-type', api.el).value.trim() !== 'CLEAR') { $('#cd-err', api.el).textContent = 'Type CLEAR in capitals.'; return; } api.close(true); }; },
    });
    if (!ok) return;
    // Pause coupons first: their use count comes from the checks about to go.
    for (const cp of coupons) await data.put('coupon', { ...cp, paused: true });
    const posPatch = {};
    if (gs.some((g) => g.k === 'checkno')) posPatch.seq = 0; // next check is #1
    if (gs.some((g) => g.k === 'e86')) posPatch.eightySix = {}; // only the "out" marks
    if (Object.keys(posPatch).length) { const s = await data.settings(); await data.saveSettings({ ...s, pos: { ...(s.pos || {}), ...posPatch } }); }
    let done = 0;
    for (const g of gs) for (const c of g.colls || []) {
      if (PROTECTED.includes(c)) continue; // belt and braces: inventory-type records never go
      for (const id of await idsToClear(g, c)) { await data.remove(c, id); done++; }
    }
    clearDataView.pick = []; clearDataView.backedUp = false;
    toast(done ? `Cleared ${done} record${done === 1 ? '' : 's'} for the whole team` : 'Done for the whole team');
    clearDataView();
  };
}
