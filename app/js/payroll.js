// Payroll (RRA-095): merged from the stand-alone Payroll test app
// (BPAY-001…024). Hours come from the Lounge clock and Time sheets, rates from
// Time sheets, overtime from Settings → Pay rules, people from Staff.
// Flow: Review hours (fix in place) → Review pay → Submit.
//
// Who sees what (perms.js): the Admin sees everything. Managers get the pay
// areas the Admin sets (time sheets, pay rates, submit payroll, approve early
// pay). A chef the Admin allows approves kitchen hours (never dollars).
// Staff see only their own pay, tips and paystubs (My pay).
// Pay runs, paystubs, early pay and sales are sealed with the pay key, and a
// person's own paystub, rate and early pay are also sealed to their phone.

import * as data from './data.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome, session, LS, copy } from './ui.js';
import { canSee, canChange, isHost, myStaff } from './perms.js';
import { BRAND } from './config.js';
import {
  RATES, payrollSettings, savePayrollSettings, PAYROLL_DEFAULTS, periodFor, currentPeriod, previousPeriod, addDays, dateOf, label,
  deptOf, ptsOf, load, compute, poolSplit, hoursOf, isChefApprover, hasPayroll,
} from './paycalc.js';
import * as provider from './provider.js';

const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (n) => `${(Math.round((+n || 0) * 100) / 100).toFixed(2)} h`;
const tm = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dl = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const COLORS = ['#ff9500', '#5856d6', '#34c759', '#ff2d55', '#007aff', '#af52de', '#a2845e', '#30b0c7', '#ff6482', '#64d2ff'];
const avatar = (st) => { const n = st.name || '?'; const c = COLORS[[...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length]; return `<span class="pr-av" style="background:${c}">${esc(n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>`; };
const lock = (msg) => `<div class="empty">🔒 ${esc(msg)}<br><span class="small">The Admin sets this in Settings → Roles and permissions.</span></div>`;
const perLabel = (per) => `${label(per.start)} – ${label(per.end)}`;
const changed = () => window.dispatchEvent(new Event('pay-changed'));

// A person's own rate is also sealed to their phone (for My pay). Rates saved
// before this release get re-saved once by a phone that can change rates.
let shared = false;
async function shareOwnRates() {
  if (shared || !canChange('payrates')) return;
  shared = true;
  for (const r of await data.list('payrate')) if (!r.own) await data.put('payrate', { ...r, own: 1 });
}

// ------------------------------------------------------------ attention
function attention(D, T, P, pst, run) {
  const out = [];
  const pend = D.advances.filter((a) => a.status === 'pending');
  if (pend.length && canChange('advances')) out.push({ k: 'adv', pill: 'info', l: 'Early', title: `${pend.length} early pay request${pend.length > 1 ? 's' : ''}`, sub: pend.map((a) => `${(D.staff.find((s) => s.id === a.staffId) || {}).name || '?'} ${money(a.amount)}`).join(' · ') });
  if (run) return out;
  if (pst.readyBy && canChange('payrun')) out.unshift({ k: 'run', pill: 'okp', l: 'Ready', title: 'Pay run ready to submit', sub: `Sent by ${pst.readyBy.name}` });
  if (T.open.length && canSee('timesheets')) out.push({ k: 'run', pill: 'lo', l: '!', title: `${T.open.length} punch${T.open.length > 1 ? 'es' : ''} without a clock-out`, sub: [...new Set(T.open.map((p) => p.name))].join(', ') });
  const nr = T.rows.filter((x) => x.noRate || x.salaryMissing);
  if (nr.length && canSee('payrates')) out.push({ k: 'run', pill: 'lo', l: '$', title: `${nr.length} without a pay rate`, sub: nr.map((x) => x.st.name.split(' ')[0]).join(', ') });
  const ot = T.rows.filter((x) => x.type === 'hourly' && x.h.ot + x.h.dbl > 0);
  if (ot.length && canSee('timesheets')) out.push({ k: 'run', pill: 'pr-ot', l: 'OT', title: 'Overtime this period', sub: ot.map((x) => `${x.st.name.split(' ')[0]} ${x.h.ot + x.h.dbl} h`).join(' · ') });
  if (Object.values(P.chefHours || {}).some(Boolean) && !pst.kitchenOK) out.push({ k: 'run', pill: 'pr-ot', l: 'Chef', title: 'Kitchen hours not approved yet', sub: 'Waiting on the chef' });
  if (!Object.keys(D.pools).length && canChange('payrun')) out.push({ k: 'tips', pill: 'info', l: 'Tips', title: 'No tips for this period yet', sub: 'Upload the POS tip report in Payroll settings' });
  return out;
}

// ------------------------------------------------------------ home
export async function payrollView(arg) {
  setChrome({ tab: 'more', back: true });
  setTitle('Payroll');
  const P = await payrollSettings();
  if (!hasPayroll(P)) { view.innerHTML = lock('Payroll is for the Admin and the managers the Admin allows.'); return; }
  if (isChefApprover(P) && !isHost() && session.profile.role !== 'manager') return kitchenView(P);
  shareOwnRates();
  const cur = currentPeriod(P), prev = previousPeriod(P);
  const runs = await data.list('payrun');
  const runFor = (per) => runs.find((r) => r.period === per.start);
  const per = arg ? periodFor(arg, P) : (!runFor(prev) ? prev : cur);
  const D = await load(per), T = compute(D, P), run = runFor(per);
  const pst = (await data.get('payperiod', per.start)) || {};
  const att = attention(D, T, P, pst, run);
  const m$ = canSee('payrates');
  setTitle('Payroll', m$ ? '<a class="btn plain small" href="#/payhistory">History</a>' : '');
  view.innerHTML = `
    <div class="segmented">${[[prev, 'Last period'], [cur, 'This period']].map(([p, l]) => `<button type="button" data-per="${p.start}" class="${p.start === per.start ? 'on' : ''}">${l}${runFor(p) ? ' ✓' : ''}</button>`).join('')}</div>
    <div class="card">
      <div class="pr-lab">${perLabel(per)} · ${run ? 'submitted · pays' : 'payday'} ${label(per.payday, { weekday: 'short', month: 'short', day: 'numeric' })}${per.end >= data.today() ? ' · <b>still running</b>' : ''}</div>
      <div class="pr-big">${m$ ? money(run ? run.cost : T.gross) : hrs(T.hours)}</div>
      <div class="pr-lab">${m$ ? (run ? 'Total company cost' : 'Estimated gross pay') : 'Hours (pay totals hidden for your role)'} · ${T.rows.length} people</div>
      <div style="height:12px"></div>
      ${run ? (m$ ? `<a class="btn block tonal" href="#/payrun-done/${run.id}">View submitted run</a>` : '<p class="muted small center">Submitted.</p>')
        : canSee('timesheets') ? `<a class="btn block" href="#/payrun/${per.start}">${LS.get('payStep.' + per.start, 1) > 1 ? 'Continue pay run' : 'Start pay run'}</a>` : ''}
    </div>
    <div class="section-label">Needs attention · ${att.length}</div>
    ${att.length ? `<div class="group">${att.map((a, i) => `<button class="row nav" type="button" data-att="${i}"><span class="pill ${a.pill}">${a.l}</span><span class="grow"><span class="title">${esc(a.title)}</span><span class="sub">${esc(a.sub)}</span></span></button>`).join('')}</div>` : '<div class="card muted center small">Nothing needs you right now.</div>'}
    <div class="pr-kpis">
      <div class="card"><div class="pr-v">${T.hours.toFixed(1)}</div><div class="pr-lab">Hours</div></div>
      <div class="card"><div class="pr-v">${m$ && T.labor !== null ? (T.labor * 100).toFixed(1) + '%' : '—'}</div><div class="pr-lab">Labor % of sales${T.labor === null ? ' (needs POS sales)' : ''}</div></div>
    </div>
    <div class="group">
      <a class="row nav" href="#/mypay"><span class="grow">My pay &amp; tips</span></a>
      ${isHost() ? '<a class="row nav" href="#/paysettings"><span class="grow"><span class="title">Payroll settings</span><span class="sub">Pay period, tip rules, chef approval, payroll service, POS and tip upload</span></span></a>' : ''}
    </div>
    <p class="muted small center">Payroll service: ${esc(provider.providerOf(P).name)}. Amounts are estimates until a payroll service is connected.</p>`;
  $$('[data-per]').forEach((b) => b.onclick = () => { location.hash = '#/payroll/' + b.dataset.per; });
  $$('[data-att]').forEach((b) => b.onclick = async () => {
    const a = att[+b.dataset.att];
    if (a.k === 'adv') { await advancesSheet(per); payrollView(per.start); }
    else if (a.k === 'tips') location.hash = isHost() ? '#/paysettings' : '#/payroll';
    else location.hash = '#/payrun/' + per.start;
  });
}

// ------------------------------------------------------------ chef: kitchen hours only
async function kitchenView(P) {
  setTitle('Kitchen hours');
  const per = previousPeriod(P).end < data.today() && !(await data.get('payperiod', previousPeriod(P).start))?.kitchenOK ? previousPeriod(P) : currentPeriod(P);
  const D = await load(per);
  const pst = (await data.get('payperiod', per.start)) || { id: per.start };
  const cooks = D.staff.filter((s) => deptOf(s) === 'Kitchen' && (s.role || 'staff') === 'staff');
  const open = D.punches.filter((p) => !p.out && cooks.some((c) => c.id === p.staffId));
  view.innerHTML = `
    <div class="card"><div class="pr-lab">${perLabel(per)}</div>
      <div class="pr-mid">${pst.kitchenOK ? `Approved by ${esc(pst.kitchenOK.name)}` : 'Waiting for your approval'}</div>
      <div class="pr-lab">Fix and approve the cooks' hours. Pay rates and dollars stay hidden.</div></div>
    ${open.length ? `<div class="hint"><b>${open.length} punch${open.length > 1 ? 'es' : ''} without a clock-out.</b> Tap the cook to fix.</div>` : ''}
    <div class="group">${cooks.map((c) => { const ps = D.punches.filter((p) => p.staffId === c.id); const h = hoursOf(ps, D.rules); const m = ps.some((p) => !p.out); return `
      <button class="row nav" type="button" data-p="${c.id}">${avatar(c)}<span class="grow"><span class="title">${esc(c.name)}</span><span class="sub">${esc(c.position || '')}</span></span>
        <span class="pr-num">${hrs(h.total)}${m ? '<small><span class="pill lo">Fix</span></small>' : h.ot ? `<small><span class="pill pr-ot">OT ${h.ot}</span></small>` : ''}</span></button>`; }).join('') || '<div class="row muted">No kitchen punches yet. Punches made before the Admin turned on chef approval show up once the Admin\'s phone opens Payroll.</div>'}</div>
    <button class="btn block" id="ok" type="button" ${open.length || pst.kitchenOK ? 'disabled' : ''}>${pst.kitchenOK ? 'Kitchen hours approved' : open.length ? 'Fix clock-outs to approve' : 'Approve kitchen hours'}</button>`;
  $$('[data-p]').forEach((b) => b.onclick = () => personSheet(D.staff.find((s) => s.id === b.dataset.p), D, per, { hoursOnly: true }).then(() => kitchenView(P)));
  $('#ok').onclick = async () => { await data.put('payperiod', { ...pst, id: per.start, kitchenOK: { name: session.profile.name, at: Date.now() } }); toast('Kitchen hours approved'); kitchenView(P); };
}

// ------------------------------------------------------------ pay run
const stepBar = (n) => `<div class="pr-steps">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
const DEPTS = ['All', 'Kitchen', 'Front', 'Bar'];

export async function payRunView(start) {
  setChrome({ tab: 'more', back: true });
  const P = await payrollSettings();
  if (!canSee('timesheets')) { setTitle('Pay run'); view.innerHTML = lock("You can't see time sheets."); return; }
  const per = periodFor(start || previousPeriod(P).start, P);
  if ((await data.list('payrun')).some((r) => r.period === per.start)) { location.hash = '#/payroll/' + per.start; return; }
  const step = LS.get('payStep.' + per.start, 1);
  const setStep = (n) => { LS.set('payStep.' + per.start, n); payRunView(per.start); };
  const D = await load(per), T = compute(D, P);
  const pst = (await data.get('payperiod', per.start)) || { id: per.start };
  const dept = payRunView.dept || 'All';
  const inDept = (st) => dept === 'All' || deptOf(st) === dept;
  const seg = `<div class="segmented">${DEPTS.map((d) => `<button type="button" data-d="${d}" class="${d === dept ? 'on' : ''}">${d}</button>`).join('')}</div>`;
  const bindSeg = () => $$('[data-d]').forEach((b) => b.onclick = () => { payRunView.dept = b.dataset.d; payRunView(per.start); });
  const chefOn = Object.values(P.chefHours || {}).some(Boolean);

  if (step === 1 || !canSee('payrates')) {
    setTitle('Review hours');
    const seeR = canSee('payrates'), tap = canChange('timesheets') || canChange('payrates');
    const flag = (x) => x.h.open.length || (seeR && (x.noRate || x.salaryMissing));
    const rows = T.rows.filter((x) => inDept(x.st)).sort((a, b) => flag(b) - flag(a) || a.st.name.localeCompare(b.st.name));
    const nOpen = T.open.length, nRate = seeR ? T.rows.filter((x) => x.noRate || x.salaryMissing).length : 0;
    const blocked = nOpen || nRate;
    view.innerHTML = `${stepBar(1)}<div class="pr-lab" style="margin:-4px 0 10px">${perLabel(per)}</div>${seg}
      ${chefOn ? `<div class="hint">${pst.kitchenOK ? `✓ Kitchen hours approved by ${esc(pst.kitchenOK.name)}` : 'Kitchen hours are waiting on the chef.'}</div>` : ''}
      ${blocked ? `<div class="hint"><b>${[nOpen ? `${nOpen} without a clock-out` : '', nRate ? `${nRate} without a pay rate` : ''].filter(Boolean).join(' · ')}.</b> ${tap ? 'Tap anyone marked Fix.' : 'Ask the Admin or a manager to fix these.'}</div>` : ''}
      <div class="group">${rows.map((x) => `
        <button class="row ${tap ? 'nav' : ''}" type="button" data-p="${x.st.id}" ${tap ? '' : 'disabled'}>${avatar(x.st)}
          <span class="grow"><span class="title">${esc(x.st.name)}</span><span class="sub">${esc(x.st.position || '')} · ${deptOf(x.st)}${seeR ? ' · ' + (x.type === 'salary' ? 'salary' : x.rate > 0 ? money(x.rate) + '/h' : '<span style="color:var(--danger)">no rate</span>') : ''}</span></span>
          <span class="pr-num">${x.type === 'salary' ? '—' : hrs(x.h.total)}${flag(x) ? '<small><span class="pill lo">Fix</span></small>' : x.h.ot + x.h.dbl ? `<small><span class="pill pr-ot">OT ${x.h.ot + x.h.dbl}</span></small>` : ''}</span></button>`).join('') || '<div class="row muted">No hours in this period yet.</div>'}</div>
      ${seeR ? `<button class="btn block" id="next" type="button" ${blocked || !T.rows.length ? 'disabled' : ''}>${blocked ? 'Fix the items above to continue' : `Continue · ${T.hours.toFixed(1)} hrs`}</button>` : '<p class="muted small center">Pay amounts are hidden for your role.</p>'}`;
    bindSeg();
    if (tap) $$('[data-p]').forEach((b) => b.onclick = () => personSheet(D.staff.find((s) => s.id === b.dataset.p), D, per, {}).then(() => payRunView(per.start)));
    $('#next')?.addEventListener('click', () => setStep(2));
    return;
  }

  if (step === 2) {
    setTitle('Review pay');
    view.innerHTML = `${stepBar(2)}${seg}
      ${!Object.keys(D.pools).length ? `<div class="hint">No tips for this period yet. ${isHost() ? '<a href="#/paysettings">Upload the POS tip report</a>' : 'The Admin uploads the POS tip report.'}</div>` : ''}
      <div class="group">${T.rows.filter((x) => inDept(x.st)).map((x) => `
        <button class="row nav" type="button" data-p="${x.st.id}">${avatar(x.st)}<span class="grow"><span class="title">${esc(x.st.name)}</span><span class="sub">Wages ${money(x.wages)}${x.tips ? ' · Tips ' + money(x.tips) : ''}${x.adv ? ' · Early pay −' + money(x.adv) : ''}</span></span>
          <span class="pr-num"><b>${money(x.net)}</b><small class="pr-est">est. take-home</small></span></button>`).join('')}</div>
      <div class="btn-row"><button class="btn tonal" id="back" type="button">Back</button><button class="btn" id="next" type="button">Continue</button></div>`;
    bindSeg();
    $$('[data-p]').forEach((b) => b.onclick = () => stubSheet(T.rows.find((x) => x.st.id === b.dataset.p), per));
    $('#back').onclick = () => setStep(1);
    $('#next').onclick = () => setStep(3);
    return;
  }

  // step 3: submit
  setTitle('Submit payroll');
  const pv = provider.providerOf(P), conn = pv.kind === 'connected', go = canChange('payrun');
  view.innerHTML = `${stepBar(3)}
    <div class="card center"><div class="pr-lab">Total company cost</div><div class="pr-big">${money(T.cost)}</div>
      <div class="pr-lab">${perLabel(per)} · pays ${label(per.payday, { weekday: 'short', month: 'short', day: 'numeric' })}</div></div>
    <div class="group">
      <div class="row"><span class="grow">Wages</span><span class="meta">${money(T.wages)}</span></div>
      <div class="row"><span class="grow">Tips</span><span class="meta">${money(T.tips)}</span></div>
      <div class="row"><span class="grow"><span class="title">Employer taxes</span><span class="sub">estimate</span></span><span class="meta">${money(T.erTax)}</span></div>
      <div class="row"><span class="grow">Employee take-home</span><span class="meta">${money(T.net)}</span></div>
      <div class="row"><span class="grow"><span class="title">Labor % of sales</span><span class="sub">${D.sales ? 'POS sales ' + money(D.sales) : 'Needs sales from the POS report'}</span></span><span class="meta">${T.labor !== null ? (T.labor * 100).toFixed(1) + '%' : '—'}</span></div>
      <a class="row ${isHost() ? 'nav' : ''}" ${isHost() ? 'href="#/paysettings"' : ''}><span class="grow"><span class="title">Payroll service</span><span class="sub">${esc(pv.name)} · ${esc(provider.KIND_LABEL[pv.kind])}</span></span></a>
    </div>
    ${chefOn && !pst.kitchenOK ? '<div class="hint">Kitchen hours haven\'t been approved by the chef yet.</div>' : ''}
    <div class="stack">
      ${go ? `<button class="btn block" id="go" type="button">${conn ? `Send hours &amp; tips to ${esc(pv.name)}` : pv.kind === 'test' ? 'Submit payroll (practice)' : 'Submit payroll'}</button>
        <button class="btn block tonal" id="csv" type="button">Copy hours &amp; tips file (CSV)</button>`
      : pst.readyBy ? `<button class="btn block" type="button" disabled>Sent to Admin by ${esc(pst.readyBy.name)}</button>`
      : '<button class="btn block" id="ready" type="button">Send to Admin to submit</button><p class="muted small center">You can review payroll; the Admin (or a manager the Admin allows) submits it.</p>'}
      <button class="btn block tonal" id="back" type="button">Back to review</button>
    </div>
    ${pv.kind === 'test' ? '<p class="muted small center">No payroll service is connected, so nothing is paid or filed. The run, paystubs and tip shares are saved.</p>' : ''}`;
  $('#back').onclick = () => setStep(2);
  $('#csv')?.addEventListener('click', () => copy(provider.exportCsv(T.rows.map((x) => ({ name: x.st.name, position: x.st.position || '', reg: x.h.reg, ot: x.h.ot, dbl: x.h.dbl, tips: x.tips, adv: x.adv }))), 'CSV copied. Paste it into a file or an email.'));
  $('#ready')?.addEventListener('click', async () => { await data.put('payperiod', { ...pst, id: per.start, readyBy: { name: session.profile.name, at: Date.now() } }); toast('Sent to the Admin'); payRunView(per.start); });
  $('#go')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Submitting…';
    const res = await provider.submitPayroll(P);
    const people = T.rows.map((x) => ({ staffId: x.st.id, name: x.st.name, position: x.st.position || '', type: x.type, rate: x.rate, reg: x.h.reg, ot: x.h.ot, dbl: x.h.dbl, hours: x.h.total, otPay: x.otPay, wages: x.wages, tips: x.tips, gross: x.gross, fica: x.fica, income: x.income, adv: x.adv, net: x.net }));
    const run = { id: res.id, period: per.start, end: per.end, payday: per.payday, via: res.via, by: session.profile.name, at: Date.now(), cost: T.cost, gross: T.gross, wages: T.wages, tips: T.tips, net: T.net, erTax: T.erTax, people };
    await data.put('payrun', run);
    for (const x of people) await data.put('paystub', { id: `${run.id}~${x.staffId}`, runId: run.id, period: per.start, end: per.end, payday: per.payday, via: res.via, ...x });
    await writeTipShares(D, P);
    for (const a of D.advances.filter((a) => a.status === 'approved')) await data.put('advance', { ...a, status: 'repaid', runId: run.id });
    if (pst.readyBy) await data.put('payperiod', { ...pst, id: per.start, readyBy: null, submitted: run.id });
    LS.set('payStep.' + per.start, 1);
    toast(conn ? `Sent to ${pv.name}` : 'Payroll submitted');
    location.hash = '#/payrun-done/' + run.id;
  });
}

// One sheet per person: clock-outs + pay setup (rate, hourly/salary, department)
async function personSheet(st, D, per, { hoursOnly = false } = {}) {
  const ps = D.punches.filter((p) => p.staffId === st.id);
  const pr = D.rates[st.id] || {};
  const editT = canChange('timesheets') || hoursOnly, editR = !hoursOnly && canChange('payrates');
  const segH = (name, opts, cur) => `<div class="segmented" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const type = pr.type || 'hourly';
  const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  await sheet({
    title: st.name, right: 'Save',
    body: `<p class="muted small">${esc(st.position || '')} · ${perLabel(per)}</p>
      ${editR ? `<div class="section-label pr-flush">Pay</div>${segH('type', [['hourly', 'Hourly'], ['salary', 'Salary']], type)}
        <label class="field"><span>Hourly rate ($ an hour)</span><input type="text" inputmode="decimal" id="pr-rate" value="${+pr.rate || ''}" placeholder="e.g. 15.50"></label>
        <label class="field"><span>Salary ($ per pay period, if salaried)</span><input type="text" inputmode="decimal" id="pr-sal" value="${+pr.salary || ''}" placeholder="e.g. 2000"></label>
        <div class="section-label pr-flush">Department</div>${segH('dept', [['Kitchen', 'Kitchen'], ['Front', 'Front'], ['Bar', 'Bar']], deptOf(st))}` : ''}
      <div class="section-label pr-flush">Punches${editT ? ' · set any missing clock-out' : ''}</div>
      <div class="group">${ps.map((p) => `<div class="row"><span class="grow"><span class="title">${dl(p.in)}</span><span class="sub">In ${tm(p.in)}${p.out ? '' : ' · <span style="color:var(--danger)">no clock-out</span>'}${p.editedBy ? ` · fixed by ${esc(p.editedBy)}` : ''}</span></span>
        <input type="time" data-pu="${p.id}" value="${p.out ? hm(p.out) : ''}" style="width:120px" aria-label="Clock out" ${editT ? '' : 'disabled'}></div>`).join('') || '<div class="row muted">No punches this period</div>'}</div>
      <p class="muted small">A clock-out earlier than the clock-in counts as the next morning.</p>`,
    onMount(api) {
      $$('[data-seg]', api.el).forEach((g) => $$('button', g).forEach((b) => b.onclick = () => { $$('button', g).forEach((y) => y.classList.remove('on')); b.classList.add('on'); }));
      api.onRight = async () => {
        let kitchenChanged = false;
        if (editT) for (const inp of $$('[data-pu]', api.el)) {
          const p = ps.find((x) => x.id === inp.dataset.pu);
          if (!inp.value) continue;
          const [h, m] = inp.value.split(':').map(Number);
          const d = new Date(p.in); d.setHours(h, m, 0, 0);
          let out = d.getTime(); if (out <= p.in) out += 864e5;
          if (out !== p.out) { await data.put('punch', { ...p, out, editedBy: session.profile.name }); if (deptOf(st) === 'Kitchen') kitchenChanged = true; }
        }
        if (editR) {
          const v = (n) => $(`[data-seg=${n}] .on`, api.el)?.dataset.v;
          const num = (id) => parseFloat(($(id, api.el).value || '').replace(/[$,]/g, '')) || 0;
          await data.put('payrate', { ...pr, id: st.id, staffId: st.id, rate: num('#pr-rate') || '', salary: num('#pr-sal') || '', type: v('type'), own: 1 });
          if (v('dept') !== deptOf(st)) await data.put('staff', { ...st, dept: v('dept') });
        }
        if (kitchenChanged && !hoursOnly) { const pst = await data.get('payperiod', per.start); if (pst?.kitchenOK) await data.put('payperiod', { ...pst, kitchenOK: null }); }
        toast('Saved'); api.close(true); changed();
      };
    },
  });
}

export function stubSheet(x, per) {
  const h = x.h || { total: x.hours, ot: x.ot, dbl: x.dbl };
  return sheet({
    title: x.st?.name || x.name, left: 'Close',
    body: `<p class="muted small">${esc(x.st?.position || x.position || '')} · ${perLabel(per)}</p>
      <div class="card">
        <div class="pr-line"><span>Hours</span><span>${x.type === 'salary' ? 'Salary' : hrs(h.total)}</span></div>
        <div class="pr-line"><span>Wages${h.ot + (h.dbl || 0) && x.type !== 'salary' ? ` (incl. overtime ${money(x.otPay)})` : ''}</span><span>${money(x.wages)}</span></div>
        <div class="pr-line"><span>Tips</span><span>${money(x.tips)}</span></div>
        <div class="pr-line pr-total"><span>Gross</span><span>${money(x.gross)}</span></div>
        <div class="pr-line"><span>Social Security + Medicare</span><span>−${money(x.fica)}</span></div>
        <div class="pr-line"><span>Income tax <span class="pr-est">est.</span></span><span>−${money(x.income)}</span></div>
        ${x.adv ? `<div class="pr-line"><span>Early pay repaid</span><span>−${money(x.adv)}</span></div>` : ''}
        <div class="pr-line pr-total"><span>Take-home</span><span>${money(x.net)}</span></div>
      </div>
      <p class="pr-est">Estimates. The payroll service calculates the real withholding.</p>`,
  });
}

// Each person's tip shares, sealed to them (My pay → Tips)
async function writeTipShares(D, P) {
  for (const d of Object.keys(D.pools)) for (const r of poolSplit(d, D, P).rows) {
    await data.put('tipshare', { id: `${d}~${r.st.id}`, staffId: r.st.id, date: d, amount: r.share, pool: D.pools[d], hours: Math.round(r.h * 100) / 100, pts: r.pts });
  }
}

export async function payRunDoneView(id) {
  setChrome({ tab: 'more', back: true });
  setTitle('Pay run');
  const r = await data.get('payrun', id);
  if (!r || !canSee('payrates')) { location.hash = '#/payroll'; return; }
  const P = await payrollSettings();
  const pv = provider.PROVIDERS.find((p) => p.id === r.via) || provider.providerOf(P);
  const per = { start: r.period, end: r.end };
  view.innerHTML = `<div class="pr-done">✓</div>
    <div class="center"><div class="pr-mid">${pv.kind === 'connected' ? 'Sent' : 'Submitted'}${pv.kind === 'test' ? ' (practice)' : ''}</div>
      <div class="muted small">${esc(r.id)} · ${perLabel(per)} · pays ${label(r.payday, { weekday: 'short', month: 'short', day: 'numeric' })} · by ${esc(r.by)} · via ${esc(pv.name)}</div></div>
    <div class="card" style="margin-top:14px">
      <div class="pr-line pr-total"><span>Total company cost</span><span>${money(r.cost)}</span></div>
      <div class="pr-line"><span>Gross pay</span><span>${money(r.gross)}</span></div>
      <div class="pr-line"><span>Take-home</span><span>${money(r.net)}</span></div>
    </div>
    <a class="btn block tonal" href="#/payroll">Back to Payroll</a>
    <div class="section-label">Paystubs</div>
    <div class="group">${r.people.map((x, i) => `<button class="row nav" type="button" data-i="${i}">${avatar(x)}<span class="grow"><span class="title">${esc(x.name)}</span><span class="sub">${esc(x.position)}</span></span><span class="meta">${money(x.net)}</span></button>`).join('')}</div>`;
  $$('[data-i]').forEach((b) => b.onclick = () => stubSheet(r.people[+b.dataset.i], per));
}

export async function payHistoryView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Pay run history');
  if (!canSee('payrates')) { view.innerHTML = lock('Pay history is for the Admin and managers allowed to see pay.'); return; }
  const runs = (await data.list('payrun')).sort((a, b) => b.period.localeCompare(a.period));
  view.innerHTML = runs.length ? `<div class="group">${runs.map((r) => `<a class="row" href="#/payrun-done/${r.id}"><span class="grow"><span class="title">${label(r.period)} – ${label(r.end)}</span><span class="sub">${esc(r.id)} · paid ${label(r.payday)} · by ${esc(r.by)}</span></span><span class="meta">${money(r.cost)}</span></a>`).join('')}</div>`
    : '<div class="empty">No pay runs yet.</div>';
}

// Approve or decline early pay requests
async function advancesSheet(per) {
  if (!canChange('advances')) { toast('Your role can\'t approve early pay'); return; }
  const staff = await data.list('staff');
  const pend = (await data.list('advance')).filter((a) => a.status === 'pending' && a.period === per.start);
  await sheet({
    title: 'Early pay requests', left: 'Close',
    body: pend.length ? `<div class="group">${pend.map((a) => { const st = staff.find((s) => s.id === a.staffId) || { name: '?' }; return `
      <div class="row">${avatar(st)}<span class="grow"><span class="title">${esc(st.name)}</span><span class="sub">${money(a.amount)} · ${new Date(a.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></span>
        <button class="btn small danger" type="button" data-no="${a.id}">Decline</button><button class="btn small" type="button" data-ok="${a.id}">Approve</button></div>`; }).join('')}</div>
      <p class="muted small">Approved amounts come off this period's check. With no payroll service connected, no money is sent.</p>` : '<div class="empty">No requests waiting.</div>',
    onMount(api) {
      const set = (id, status) => async () => { const a = pend.find((x) => x.id === id); await data.put('advance', { ...a, status, by: session.profile.name, decided: Date.now() }); toast(status === 'approved' ? 'Approved' : 'Declined'); api.close(); };
      $$('[data-ok]', api.el).forEach((b) => b.onclick = set(b.dataset.ok, 'approved'));
      $$('[data-no]', api.el).forEach((b) => b.onclick = set(b.dataset.no, 'declined'));
    },
  });
}

// ------------------------------------------------------------ My pay (everyone)
export async function myPayView() {
  setChrome({ tab: 'lounge', back: true });
  setTitle('My pay & tips');
  const me = myStaff();
  if (!me) { view.innerHTML = `<div class="empty">${isHost() ? 'The Admin isn\'t on payroll. To get paid through the app, add your name in Settings → Staff.' : 'Ask a manager to add you in Settings → Staff with the same name as this phone.'}</div>`; return; }
  const P = await payrollSettings();
  const per = currentPeriod(P);
  const D = await load(per);
  const mine = D.punches.filter((p) => p.staffId === me.id);
  const pr = D.rates[me.id] || {};
  const h = hoursOf(mine, D.rules);
  const rate = +pr.rate || 0, type = pr.type || 'hourly';
  const wages = type === 'salary' ? +pr.salary || 0 : h.reg * rate + h.ot * rate * D.rules.otX + h.dbl * rate * D.rules.doubleX;
  const shares = (await data.list('tipshare')).filter((t) => t.staffId === me.id).sort((a, b) => b.date.localeCompare(a.date));
  const tipsNow = shares.filter((t) => t.date >= per.start && t.date <= per.end).reduce((s, t) => s + t.amount, 0);
  const stubs = (await data.list('paystub')).filter((s) => s.staffId === me.id).sort((a, b) => b.payday.localeCompare(a.payday));
  const adv = (await data.list('advance')).filter((a) => a.staffId === me.id).sort((a, b) => b.at - a.at);
  const pv = provider.providerOf(P);
  const used = adv.filter((a) => a.period === per.start && a.status !== 'declined').reduce((s, a) => s + (+a.amount || 0), 0);
  const avail = Math.max(0, Math.floor(wages * (1 - RATES.empFica - RATES.empIncomeEst) * RATES.advanceMax - used));
  const pts = ptsOf(me, pr, P);
  view.innerHTML = `
    <div class="card">
      <div class="pr-lab">${perLabel(per)} so far · payday ${label(per.payday, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div class="pr-big">${rate || type === 'salary' ? money(wages + tipsNow) : hrs(h.total)}</div>
      <div class="pr-lab">${rate || type === 'salary' ? `Wages ${money(wages)}${pts ? ` · Tips ${money(tipsNow)}` : ''} · estimate before taxes` : 'Hours worked. Your rate shows here once a manager has saved it.'}</div>
      ${type === 'hourly' && rate ? `<div style="height:12px"></div>${pv.ewa ? `<button class="btn block" id="early" type="button" ${avail < 10 ? 'disabled' : ''}>Get paid early${avail >= 10 ? ` · up to ${money(avail)}` : ''}</button>` : `<p class="muted small" style="margin:0">Early pay isn't offered with ${esc(pv.name)}.</p>`}` : ''}
    </div>
    ${adv.length ? `<div class="section-label">Early pay</div><div class="group">${adv.slice(0, 5).map((a) => `<div class="row"><span class="grow"><span class="title">${money(a.amount)}</span><span class="sub">${new Date(a.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></span><span class="pill ${a.status === 'approved' || a.status === 'repaid' ? 'okp' : a.status === 'declined' ? 'lo' : 'info'}">${a.status}</span></div>`).join('')}</div>` : ''}
    <div class="section-label">Hours this period</div>
    <div class="group">${mine.slice().reverse().map((p) => `<div class="row"><span class="grow"><span class="title">${dl(p.in)}</span><span class="sub">${tm(p.in)} – ${p.out ? tm(p.out) : 'on the clock'}</span></span><span class="meta">${p.out ? hrs((p.out - p.in) / 36e5) : ''}</span></div>`).join('') || '<div class="row muted">No punches yet this period.</div>'}
      <div class="row"><span class="grow"><b>Total</b>${h.ot + h.dbl ? ` <span class="pill pr-ot">OT ${h.ot + h.dbl} h</span>` : ''}</span><span class="meta"><b>${hrs(h.total)}</b></span></div></div>
    ${pts ? `<div class="section-label">My tips</div><div class="group">${shares.slice(0, 10).map((t) => `<div class="row"><span class="grow"><span class="title">${label(t.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span class="sub">${hrs(t.hours)} × ${t.pts} pt · pool ${money(t.pool)}</span></span><span class="meta">${money(t.amount)}</span></div>`).join('') || '<div class="row muted">Tip shares show here after the POS tip report is in and payroll is run.</div>'}</div>` : ''}
    <a class="btn block tonal" href="#/tiprules" style="margin-bottom:16px">How tips are shared</a>
    <div class="section-label">Paystubs</div>
    <div class="group">${stubs.map((s, i) => `<button class="row nav" type="button" data-s="${i}"><span class="grow"><span class="title">Paid ${label(s.payday, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span class="sub">${label(s.period)} – ${label(s.end)}</span></span><span class="meta">${money(s.net)}</span></button>`).join('') || '<div class="row muted">No paystubs yet.</div>'}</div>
    <p class="muted small">Only you, the Admin and managers allowed to see pay can see this page's amounts.</p>`;
  $$('[data-s]').forEach((b) => b.onclick = () => { const s = stubs[+b.dataset.s]; stubSheet({ ...s, st: { name: me.name, position: s.position } }, { start: s.period, end: s.end }); });
  $('#early')?.addEventListener('click', async () => {
    let amt = Math.min(200, avail);
    const ok = await sheet({
      title: 'Get paid early', right: 'Request',
      body: `<p class="muted">Up to ${RATES.advanceMax * 100}% of what you've earned after taxes. It comes off this period's check.</p>
        <div class="card center"><div class="pr-lab">Request</div><div class="pr-big" id="amt">${money(amt)}</div><input type="range" id="rng" min="10" max="${avail}" step="5" value="${amt}" style="width:100%;margin-top:10px"></div>
        <p class="muted small">A manager approves it.${pv.kind === 'test' ? ' No payroll service is connected yet, so no money is sent.' : ''}</p>`,
      onMount(api) { $('#rng', api.el).oninput = (e) => { amt = +e.target.value; $('#amt', api.el).textContent = money(amt); }; },
    });
    if (!ok) return;
    await data.put('advance', { staffId: me.id, name: me.name, amount: amt, status: 'pending', at: Date.now(), period: per.start });
    toast('Requested. A manager will approve it.');
    myPayView();
  });
}

// ------------------------------------------------------------ tip rules (everyone sees; Admin changes)
export async function tipRulesView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Tip rules');
  const P = await payrollSettings();
  const edit = isHost();
  const R = tipRulesView.draft && edit ? tipRulesView.draft : JSON.parse(JSON.stringify(P.tipRules));
  if (edit) tipRulesView.draft = R;
  const step = (k, v) => edit ? `<span class="stepper"><button type="button" data-k="${esc(k)}" data-d="-0.1">−</button><b>${(+v).toFixed(1)}</b><button type="button" data-k="${esc(k)}" data-d="0.1">+</button></span>` : `<b>${(+v).toFixed(1)} pt</b>`;
  setTitle('Tip rules', edit ? '<button class="btn plain small" id="save" type="button" style="font-weight:700">Save</button>' : '');
  view.innerHTML = `
    ${edit ? '' : '<div class="hint">View only. The Admin sets the tip rules.</div>'}
    <div class="card small"><b>How the pool splits</b><p class="muted">Each night's tips are shared by hours worked × the points for your job. Managers, chefs, the Admin and salaried staff don't share tips.</p></div>
    <div class="section-label">Points per job</div>
    <div class="group">${Object.entries(R.pts).map(([job, v]) => `<div class="row"><span class="grow">${esc(job)}</span>${step(job, v)}</div>`).join('')}
      ${edit ? '<button class="row" id="addjob" type="button"><span class="grow" style="color:var(--accent)">+ Add a job</span></button>' : ''}</div>
    <div class="section-label">Kitchen</div>
    <div class="group">
      <div class="row"><span class="grow"><span class="title">Include hourly kitchen staff</span><span class="sub">Only allowed if no tip credit is taken. Check with your attorney first.</span></span>
        <button class="toggle ${R.kitchen ? 'on' : ''}" id="kit" type="button" ${edit ? '' : 'disabled'} aria-label="Include kitchen"></button></div>
      ${R.kitchen ? `<div class="row"><span class="grow">Kitchen points</span>${step('__kitchen', R.kitchenPts)}</div>` : ''}
    </div>
    <p class="muted small">Job names match each person's position on the Staff list.</p>
    ${edit ? '<button class="btn block tonal" id="def" type="button">Reset to the default rules</button>' : ''}`;
  if (!edit) return;
  $$('[data-k]').forEach((b) => b.onclick = () => {
    const k = b.dataset.k, cl = (v) => Math.max(0, Math.min(2, Math.round((+v + +b.dataset.d) * 10) / 10));
    if (k === '__kitchen') R.kitchenPts = cl(R.kitchenPts); else R.pts[k] = cl(R.pts[k]);
    b.parentElement.querySelector('b').textContent = (k === '__kitchen' ? R.kitchenPts : R.pts[k]).toFixed(1);
  });
  $('#kit').onclick = () => { R.kitchen = !R.kitchen; tipRulesView(); };
  $('#def').onclick = () => { tipRulesView.draft = JSON.parse(JSON.stringify(PAYROLL_DEFAULTS.tipRules)); tipRulesView(); };
  $('#addjob').onclick = async () => {
    const job = await sheet({ title: 'Add a job', right: 'Add', body: '<label class="field"><span>Job (same as the position on the Staff list)</span><input type="text" id="jb" placeholder="e.g. Barback"></label>', onMount: (api) => { api.onRight = () => api.close($('#jb', api.el).value.trim()); } });
    if (job) { R.pts[job] = 0.5; tipRulesView(); }
  };
  $('#save').onclick = async () => { await savePayrollSettings({ tipRules: R }); tipRulesView.draft = null; toast('Tip rules saved'); history.back(); };
}

// ------------------------------------------------------------ Payroll settings (Admin)
export async function paySettingsView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Payroll settings');
  if (!isHost()) { view.innerHTML = lock('Only the Admin changes payroll settings.'); return; }
  const P = await payrollSettings();
  const per = currentPeriod(P);
  const staff = (await data.list('staff')).filter((s) => !s.removed);
  const chefs = staff.filter((s) => s.role === 'chef');
  const pv = provider.providerOf(P), pos = provider.POS.find((p) => p.id === P.pos) || provider.POS[0];
  const conn = (k) => P.conn?.[k];
  const status = (c) => !c ? '<span class="pill lo">No keys</span>' : c.tested ? '<span class="pill okp">Ready</span>' : '<span class="pill pr-ot">Not tested</span>';
  const pools = (await data.list('tippool')).sort((a, b) => b.id.localeCompare(a.id));
  view.innerHTML = `
    <div class="section-label">Pay period</div>
    <div class="group">
      <div class="row" style="display:block"><div class="segmented" style="margin:0">${[['weekly', 'Weekly'], ['biweekly', 'Every two weeks']].map(([v, l]) => `<button type="button" data-freq="${v}" class="${P.freq === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <button class="row nav" id="anchor" type="button"><span class="grow"><span class="title">This period</span><span class="sub">${perLabel(per)} · tap to set when a period starts</span></span></button>
      <div class="row"><span class="grow"><span class="title">Payday</span><span class="sub">Days after the period ends</span></span><span class="stepper"><button type="button" data-pd="-1">−</button><b>${P.paydayDays}</b><button type="button" data-pd="1">+</button></span></div>
    </div>
    <p class="muted small">Periods start on a Monday, like the schedule and time sheets. Overtime follows Settings → Pay rules.</p>

    <div class="section-label">Tips</div>
    <div class="group"><a class="row nav" href="#/tiprules"><span class="grow"><span class="title">Tip rules</span><span class="sub">${Object.entries(P.tipRules.pts).map(([k, v]) => `${k} ${v}`).join(' · ')}${P.tipRules.kitchen ? ' · Kitchen ' + P.tipRules.kitchenPts : ''}</span></span></a></div>

    ${chefs.length ? `<div class="section-label">Chef approval of kitchen hours</div>
    <div class="group">${chefs.map((c) => `<div class="row"><span class="grow"><span class="title">${esc(c.name)}</span><span class="sub">Fixes and approves cooks' hours. Never sees rates or dollars.</span></span><button class="toggle ${P.chefHours?.[c.id] ? 'on' : ''}" type="button" data-chef="${c.id}" aria-label="Chef approval"></button></div>`).join('')}</div>` : ''}

    <div class="section-label">Payroll service</div>
    <div class="group">
      <button class="row nav" id="svc" type="button"><span class="grow"><span class="title">${esc(pv.name)}</span><span class="sub">${esc(provider.KIND_LABEL[pv.kind])}</span></span>${pv.kind === 'test' ? '' : status(conn('pay:' + pv.id))}</button>
      ${pv.kind === 'test' ? '' : `<button class="row nav" id="paykeys" type="button"><span class="grow"><span class="title">Keys</span><span class="sub">${conn('pay:' + pv.id) ? 'Ends in ' + esc(conn('pay:' + pv.id).hint) : 'Add keys from the payroll account'}</span></span></button>`}
    </div>

    <div class="section-label">POS</div>
    <div class="group">
      <button class="row nav" id="pos" type="button"><span class="grow"><span class="title">${esc(pos.name)}</span><span class="sub">${esc(pos.note)}</span></span>${pos.fields ? status(conn('pos:' + pos.id)) : ''}</button>
      ${pos.fields ? `<button class="row nav" id="poskeys" type="button"><span class="grow"><span class="title">Keys</span><span class="sub">${conn('pos:' + pos.id) ? 'Ends in ' + esc(conn('pos:' + pos.id).hint) : 'Add keys from the POS back office'}</span></span></button>` : ''}
    </div>

    <div class="section-label">Tip and sales report (any POS)</div>
    <div class="card">
      <p style="margin-top:0">Upload the POS's daily tips or sales report as a CSV file. Tips fill each night's pool; sales give labor %.</p>
      <input type="file" id="file" accept=".csv,text/csv" hidden>
      <button class="btn block" id="pick" type="button">Choose CSV file</button>
      ${pools.length ? `<p class="muted small">Tips on file for ${pools.length} night${pools.length > 1 ? 's' : ''}, latest ${label(pools[0].id)}.</p>` : ''}
    </div>
    <p class="muted small">Keys go to the restaurant's server once it's set up; this phone keeps only the last 4 characters. Until a service is connected, payroll runs are practice runs.</p>`;

  $$('[data-freq]').forEach((b) => b.onclick = async () => { await savePayrollSettings({ freq: b.dataset.freq }); paySettingsView(); });
  $$('[data-pd]').forEach((b) => b.onclick = async () => { await savePayrollSettings({ paydayDays: Math.max(0, Math.min(10, P.paydayDays + +b.dataset.pd)) }); paySettingsView(); });
  $('#anchor').onclick = async () => {
    const v = await sheet({ title: 'When does a period start?', right: 'Save', body: `<label class="field"><span>Any Monday a pay period starts on</span><input type="date" id="an" value="${per.start}"></label><p class="muted small">Every period after it follows on ${P.freq === 'weekly' ? 'each week' : 'every two weeks'}.</p>`, onMount: (api) => { api.onRight = () => api.close($('#an', api.el).value); } });
    if (!v) return;
    await savePayrollSettings({ anchor: data.weekStart(new Date(v + 'T12:00:00')) }); toast('Pay period saved'); paySettingsView();
  };
  $$('[data-chef]').forEach((b) => b.onclick = async () => {
    const on = !P.chefHours?.[b.dataset.chef];
    await savePayrollSettings({ chefHours: { ...(P.chefHours || {}), [b.dataset.chef]: on } });
    if (on) {
      // Re-seal recent kitchen punches so the chef's phone can open them.
      const from = previousPeriod(P).start;
      for (const p of await data.list('punch')) { const st = staff.find((s) => s.id === p.staffId); if (st && deptOf(st) === 'Kitchen' && dateOf(p.in) >= from) await data.put('punch', { ...p }); }
    }
    toast(on ? 'Chef can approve kitchen hours' : 'Chef approval off'); paySettingsView();
  });
  $('#svc').onclick = async () => {
    const id = await pickSheet('Payroll service', ['test', 'embedded', 'connected'].map((k) => [provider.KIND_LABEL[k], provider.PROVIDERS.filter((p) => p.kind === k)]), pv.id, 'Common, established payroll companies. Prices and features change; confirm with each before choosing. Switch at a quarter or year start when you can.');
    if (!id || id === pv.id) return;
    await savePayrollSettings({ provider: id, providerLog: [{ from: pv.id, to: id, by: session.profile.name, at: Date.now() }, ...(P.providerLog || [])].slice(0, 10) });
    toast('Payroll service: ' + provider.PROVIDERS.find((p) => p.id === id).name); paySettingsView();
  };
  $('#pos').onclick = async () => {
    const id = await pickSheet('POS', [['', provider.POS]], pos.id, 'API access and prices vary by POS and plan. Confirm with the POS company before going live.');
    if (!id || id === pos.id) return;
    await savePayrollSettings({ pos: id }); paySettingsView();
  };
  $('#paykeys')?.addEventListener('click', () => keysSheet('pay:' + pv.id, pv.name, provider.PAYROLL_FIELDS[pv.kind], P));
  $('#poskeys')?.addEventListener('click', () => keysSheet('pos:' + pos.id, pos.name, pos.fields, P));
  $('#pick').onclick = () => $('#file').click();
  $('#file').onchange = async (e) => { const f = e.target.files[0]; if (f) csvSheet(await f.text(), f.name); e.target.value = ''; };
}

async function pickSheet(title, groups, cur, note) {
  return sheet({
    title, left: 'Close',
    body: groups.map(([g, list]) => `${g ? `<div class="section-label pr-flush">${esc(g)}</div>` : ''}<div class="group">${list.map((p) => `<button class="row" type="button" data-id="${p.id}"><span class="grow"><span class="title">${esc(p.name)}${p.ewa && p.kind !== 'test' ? ' <span class="pill okp">Early pay</span>' : ''}${p.csvOnly ? ' <span class="pill info">CSV</span>' : ''}</span><span class="sub" style="white-space:normal">${esc(p.note)}</span></span>${p.id === cur ? '<b style="color:var(--accent)">✓</b>' : ''}</button>`).join('')}</div>`).join('') + `<p class="muted small">${esc(note)}</p>`,
    onMount(api) { $$('[data-id]', api.el).forEach((b) => b.onclick = () => api.close(b.dataset.id)); },
  });
}

async function keysSheet(key, name, fields, P) {
  await sheet({
    title: name + ' keys', right: 'Save',
    body: `<p class="muted small">Copy these from ${esc(name)}'s back office. They go to the restaurant's server and are never stored in this app.</p>
      ${fields.map((f, i) => `<label class="field"><span>${esc(f)}</span><input type="password" data-f="${i}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>`).join('')}
      <button class="btn block tonal" id="test" type="button">Test connection</button><p id="res" class="small"></p>`,
    onMount(api) {
      const vals = () => $$('[data-f]', api.el).map((i) => i.value.trim());
      $('#test', api.el).onclick = async () => {
        if (vals().some((x) => !x)) { $('#res', api.el).innerHTML = '<span style="color:var(--danger)">Fill in every field first.</span>'; return; }
        $('#res', api.el).textContent = 'Testing…'; await new Promise((r) => setTimeout(r, 700));
        $('#res', api.el).innerHTML = '<span style="color:var(--ok)">✓ Format looks right.</span> <span class="muted">The real check happens once the restaurant\'s server is set up.</span>';
        api.tested = true;
      };
      api.onRight = async () => {
        const v = vals(); if (v.some((x) => !x)) { toast('Fill in every field'); return; }
        await savePayrollSettings({ conn: { ...(P.conn || {}), [key]: { hint: '••' + v[v.length - 1].slice(-4), tested: !!api.tested, at: Date.now() } } });
        api.close(true); toast('Saved (only the last 4 characters are kept)'); paySettingsView();
      };
    },
  });
}

// ---------- CSV (tips and sales from any POS) ----------
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const num = (s) => parseFloat(String(s || '').replace(/[$,\s]/g, '')) || 0;
function toIso(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}
const FIELDS = { date: ['date', 'business date', 'day'], card: ['card tips', 'credit tips', 'non-cash tips', 'tips', 'tip'], cash: ['cash tips', 'declared cash tips', 'declared tips'], sales: ['net sales', 'sales', 'gross sales', 'total sales'] };
function csvSheet(text, name) {
  const rows = parseCsv(text);
  if (rows.length < 2) { toast('That file has no rows'); return; }
  const head = rows[0], body = rows.slice(1), h = head.map((x) => x.trim().toLowerCase());
  const map = Object.fromEntries(Object.entries(FIELDS).map(([k, n]) => [k, n.map((x) => h.indexOf(x)).find((i) => i >= 0) ?? -1]));
  const opt = (k) => `<select data-k="${k}"><option value="-1">— not in file —</option>${head.map((x, i) => `<option value="${i}" ${map[k] === i ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  sheet({
    title: 'Import POS report', right: 'Import',
    body: `<p class="muted small">${esc(name)} · ${body.length} rows. Check which column is which.</p>
      ${[['date', 'Date'], ['card', 'Card tips'], ['cash', 'Cash tips (optional)'], ['sales', 'Sales (optional)']].map(([k, l]) => `<label class="field"><span>${l}</span>${opt(k)}</label>`).join('')}
      <p class="muted small">Rows for the same night are added up. A night already on file is replaced.</p>`,
    onMount(api) {
      api.onRight = async () => {
        const m = Object.fromEntries($$('[data-k]', api.el).map((s) => [s.dataset.k, +s.value]));
        if (m.date < 0 || (m.card < 0 && m.cash < 0 && m.sales < 0)) { toast('Pick a Date column and a tips or sales column'); return; }
        const tips = {}, sales = {};
        for (const r of body) {
          const d = toIso(r[m.date]); if (!d) continue;
          tips[d] = (tips[d] || 0) + (m.card >= 0 ? num(r[m.card]) : 0) + (m.cash >= 0 ? num(r[m.cash]) : 0);
          if (m.sales >= 0) sales[d] = (sales[d] || 0) + num(r[m.sales]);
        }
        for (const [d, v] of Object.entries(tips)) if (v > 0) await data.put('tippool', { id: d, amount: Math.round(v * 100) / 100, from: name });
        for (const [d, v] of Object.entries(sales)) if (v > 0) await data.put('possales', { id: d, sales: Math.round(v * 100) / 100, from: name });
        api.close(true);
        toast(`Imported ${Object.keys(tips).length} nights`);
        paySettingsView(); changed();
      };
    },
  });
}
