// Clear test data (RRA-106), Admin only: erase practice records for the whole
// team before going live. Never touches dishes, house recipes, stock, vendors,
// prep lists, staff, pay rates, roles or settings.

import * as data from './data.js';
import * as sync from './sync.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome } from './ui.js';
import { isHost } from './perms.js';
import { APP_NAME, BRAND } from './config.js';

export const CLEAR_GROUPS = [
  { k: 'clock', label: 'Clock-ins and time sheets', colls: ['punch'] },
  { k: 'payroll', label: 'Payroll', sub: 'Pay runs, paystubs, early pay, tip shares, tip pool and sales uploads', colls: ['payrun', 'paystub', 'advance', 'tipshare', 'tippool', 'possales', 'payperiod'] },
  { k: 'pos', label: 'Point of sale', sub: "Checks, kitchen and bar tickets, today's sales", colls: ['check', 'ticket', 'pickup'] },
  { k: 'posts', label: 'Messages and problem reports', colls: ['post'] },
  { k: 'swaps', label: 'Swap requests', colls: ['swap'] },
  { k: 'events', label: 'Events (BEOs)', colls: ['event'] },
  { k: 'waste', label: 'Waste log', colls: ['waste'] },
  { k: 'weeks', label: 'Schedules', colls: ['week'] },
];

// Local ids plus ids only the shared data has (sealed to other phones).
async function idsOf(coll) {
  const local = (await data.list(coll)).map((d) => d.id);
  return [...new Set([...local, ...sync.remoteIds(coll)])];
}
async function countGroup(g) { let n = 0; for (const c of g.colls) n += (await idsOf(c)).length; return n; }

async function backupFile(groups) {
  const out = { app: APP_NAME, kind: 'test-data-backup', at: new Date().toISOString(), data: {} };
  for (const g of groups) for (const c of g.colls) out.data[c] = await data.list(c);
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
  const total = () => CLEAR_GROUPS.filter((g) => pick.has(g.k)).reduce((n, g) => n + counts[g.k], 0);
  view.innerHTML = `
    <p class="small">Erase practice records for the whole team, on every phone. Pick what goes:</p>
    <div class="group cd-list">${CLEAR_GROUPS.map((g) => `<label class="row"><input type="checkbox" data-k="${g.k}"${pick.has(g.k) ? ' checked' : ''}${counts[g.k] ? '' : ' disabled'}>
      <span class="grow"><span class="title">${esc(g.label)}</span>${g.sub ? `<span class="sub" style="white-space:normal">${esc(g.sub)}</span>` : ''}</span><span class="meta">${counts[g.k] ? `${counts[g.k]} to erase` : 'None'}</span></label>`).join('')}</div>
    <div class="hint small">Never touched: dishes, house recipes, stock, vendors, prep lists, staff, pay rates, roles and settings.</div>
    <button class="btn tonal block" id="cd-backup" type="button" disabled>Save a backup file first</button>
    <button class="btn block" id="cd-go" type="button" style="margin-top:8px;background:var(--danger)" disabled>Clear</button>
    <p class="muted small">The backup file holds what this phone can read of the picked records, including pay. Keep it private.</p>`;
  const upd = () => {
    const n = total();
    $('#cd-go').disabled = !n; $('#cd-backup').disabled = !n;
    $('#cd-go').textContent = n ? `Clear ${n} record${n === 1 ? '' : 's'}` : 'Clear';
  };
  $$('[data-k]').forEach((b) => b.onchange = () => { if (b.checked) pick.add(b.dataset.k); else pick.delete(b.dataset.k); clearDataView.pick = [...pick]; upd(); });
  upd();
  const chosen = () => CLEAR_GROUPS.filter((g) => pick.has(g.k));
  $('#cd-backup').onclick = async () => { if (await backupFile(chosen())) { clearDataView.backedUp = true; toast('Backup file ready'); } };
  $('#cd-go').onclick = async () => {
    const gs = chosen(), n = total();
    const ok = await sheet({
      title: 'Clear test data?', right: 'Clear',
      body: `<p>This erases <b>${n}</b> record${n === 1 ? '' : 's'} for everyone, on every phone:</p>
        <ul class="small">${gs.map((g) => `<li>${esc(g.label)}: ${counts[g.k]}</li>`).join('')}</ul>
        <p class="small">It can't be undone${clearDataView.backedUp ? '' : ', and no backup file was saved yet'}.</p>
        <label class="field"><span>Type CLEAR to confirm</span><input type="text" id="cd-type" autocomplete="off" autocapitalize="characters"></label>
        <p id="cd-err" class="small" style="color:var(--danger)"></p>`,
      onMount: (api) => { api.onRight = () => { if ($('#cd-type', api.el).value.trim() !== 'CLEAR') { $('#cd-err', api.el).textContent = 'Type CLEAR in capitals.'; return; } api.close(true); }; },
    });
    if (!ok) return;
    let done = 0;
    for (const g of gs) for (const c of g.colls) for (const id of await idsOf(c)) { await data.remove(c, id); done++; }
    clearDataView.pick = []; clearDataView.backedUp = false;
    toast(`Cleared ${done} record${done === 1 ? '' : 's'} for the whole team`);
    clearDataView();
  };
}
