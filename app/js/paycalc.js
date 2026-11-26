// Payroll math (RRA-095). Reads the app's own data: Staff, punches (Lounge
// clock), pay rates (Time sheets) and Settings → Pay rules. Pay periods,
// overtime (same split as Time sheets), tip pool shares and pay ESTIMATES.
// Real taxes come from the payroll service once one is connected.

import { discounts } from './coupons-core.js';
import * as data from './data.js';
import { payRules, splitHours } from './lounge.js';
import { session } from './ui.js';
import { level, isHost, myStaff } from './perms.js';

export const RATES = { empFica: 0.0765, empIncomeEst: 0.12, erFica: 0.0765, erUnemp: 0.012, advanceMax: 0.5 };

export const PAYROLL_DEFAULTS = {
  freq: 'biweekly', anchor: '2026-01-05', paydayDays: 3,
  provider: 'test', providerLog: [], pos: 'none', conn: {},
  tipRules: { pts: { Bartender: 1, Server: 1, Busser: 0.5, Host: 0.5 }, kitchen: false, kitchenPts: 0.3 },
  chefHours: {},
};
export async function payrollSettings() {
  const s = await data.settings();
  const P = { ...PAYROLL_DEFAULTS, ...(s.payroll || {}) };
  P.tipRules = { ...PAYROLL_DEFAULTS.tipRules, ...(s.payroll?.tipRules || {}) };
  return P;
}
export async function savePayrollSettings(patch) {
  const s = await data.settings();
  await data.saveSettings({ ...s, payroll: { ...(s.payroll || {}), ...patch } });
}

// ---------- dates ----------
const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return data.isoDate(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const dateOf = (ms) => data.isoDate(new Date(ms));
export const label = (iso, o = { month: 'short', day: 'numeric' }) => parse(iso).toLocaleDateString([], o);

export function periodFor(iso, P) {
  const len = P.freq === 'weekly' ? 7 : 14;
  const k = Math.floor(diffDays(P.anchor, iso) / len);
  const start = addDays(P.anchor, k * len), end = addDays(start, len - 1);
  const payday = addDays(end, +P.paydayDays || 3);
  return { start, end, payday, debit: addDays(payday, -1), len };
}
export const currentPeriod = (P) => periodFor(data.today(), P);
export const previousPeriod = (P) => periodFor(addDays(currentPeriod(P).start, -1), P);

// ---------- people ----------
export const guessDept = (pos = '') => /bar/i.test(pos) ? 'Bar' : /server|host|bus|wait|front|cashier|manager|gm/i.test(pos) ? 'Front' : 'Kitchen';
export const deptOf = (st) => st.dept || guessDept(st.position);
export function ptsOf(st, pr, P) {
  if ((st.role || 'staff') !== 'staff' || (pr?.type || 'hourly') !== 'hourly') return 0; // managers, chefs, salaried: no tips
  const R = P.tipRules;
  if (deptOf(st) === 'Kitchen') return R.kitchen ? +R.kitchenPts || 0 : 0;
  const pos = String(st.position || '').toLowerCase().trim();
  const key = Object.keys(R.pts).find((k) => k.toLowerCase() === pos) || Object.keys(R.pts).find((k) => pos.startsWith(k.toLowerCase() + ' ')); // "Host" covers "Host stand"
  return key ? +R.pts[key] : 0;
}

// Everything payroll needs for one period, from this phone's data.
export async function load(per) {
  const [staff, punches, rates, pools, sales, advances, settings, checks] = await Promise.all([
    data.list('staff'), data.list('punch'), data.list('payrate'), data.list('tippool'), data.list('possales'), data.list('advance'), data.settings(), data.list('check'),
  ]);
  const inPer = (iso) => iso >= per.start && iso <= per.end;
  // Point of sale (RRA-101): closed checks give each night's tips and net
  // sales. A night that has an uploaded POS report uses the report instead.
  const pool = Object.fromEntries(pools.filter((p) => inPer(p.id)).map((p) => [p.id, +p.amount || 0]));
  const sold = Object.fromEntries(sales.filter((x) => inPer(x.id)).map((x) => [x.id, +x.sales || 0]));
  const posTips = {}, posSales = {};
  for (const c of checks) {
    if (!c.closed) continue;
    const d = c.closedDate || dateOf(c.closed);
    if (!inPer(d)) continue;
    posTips[d] = (posTips[d] || 0) + (c.payments || []).reduce((t, p) => t + (+p.tip || 0), 0);
    posSales[d] = (posSales[d] || 0) + (c.items || []).reduce((t, x) => t + (x.voided ? 0 : (+x.price || 0) * (x.qty || 1)), 0)
      - ((c.coupons || []).length ? discounts(c).total : 0); // RRA-122: coupons come off net sales
  }
  for (const [d, v] of Object.entries(posTips)) if (!(d in pool) && v > 0) pool[d] = Math.round(v * 100) / 100;
  for (const [d, v] of Object.entries(posSales)) if (!(d in sold)) sold[d] = v;
  return {
    staff: staff.filter((s) => !s.removed).sort(data.byName),
    punches: punches.filter((p) => inPer(dateOf(p.in))).sort((a, b) => a.in - b.in),
    rates: Object.fromEntries(rates.map((r) => [r.staffId || r.id, r])),
    pools: pool,
    sales: Object.values(sold).reduce((t, v) => t + v, 0),
    advances: advances.filter((a) => a.period === per.start),
    rules: payRules(settings),
  };
}

const PH = (p) => (p.out - p.in) / 36e5;
export function hoursOf(ps, rules) {
  const closed = ps.filter((p) => p.out);
  const weeks = {};
  for (const p of closed) (weeks[data.weekStart(new Date(p.in))] ||= []).push(p);
  let reg = 0, ot = 0, dbl = 0;
  for (const w of Object.values(weeks)) { const s = splitHours(w, rules); reg += s.reg; ot += s.ot; dbl += s.dbl; }
  const r2 = (n) => Math.round(n * 100) / 100;
  return { reg: r2(reg), ot: r2(ot), dbl: r2(dbl), total: r2(reg + ot + dbl), open: ps.filter((p) => !p.out) };
}

// Tip pool for one night: hours × job points among tipped hourly staff
export function poolSplit(date, D, P) {
  const amount = D.pools[date] || 0;
  const rows = D.staff.map((st) => {
    const pts = ptsOf(st, D.rates[st.id], P);
    const h = D.punches.filter((p) => p.staffId === st.id && p.out && dateOf(p.in) === date).reduce((t, p) => t + PH(p), 0);
    return { st, h, pts, w: h * pts };
  }).filter((r) => r.w > 0);
  const W = rows.reduce((t, r) => t + r.w, 0) || 1;
  rows.forEach((r) => { r.share = Math.round((amount * r.w / W) * 100) / 100; });
  return { amount, rows };
}

const r2 = (n) => Math.round(n * 100) / 100;
export function compute(D, P) {
  const tips = {};
  for (const d of Object.keys(D.pools)) for (const r of poolSplit(d, D, P).rows) tips[r.st.id] = (tips[r.st.id] || 0) + r.share;
  const rows = D.staff.map((st) => {
    const pr = D.rates[st.id] || {};
    const type = pr.type || 'hourly', rate = +pr.rate || 0;
    const ps = D.punches.filter((p) => p.staffId === st.id);
    const h = hoursOf(ps, D.rules);
    const otPay = type === 'salary' ? 0 : r2(h.ot * rate * D.rules.otX + h.dbl * rate * D.rules.doubleX);
    const wages = type === 'salary' ? r2(+pr.salary || 0) : r2(h.reg * rate + otPay);
    const t = r2(tips[st.id] || 0);
    const gross = r2(wages + t);
    const fica = r2(gross * RATES.empFica), income = r2(gross * RATES.empIncomeEst);
    const adv = r2(D.advances.filter((a) => a.staffId === st.id && a.status === 'approved').reduce((s, a) => s + (+a.amount || 0), 0));
    return { st, pr, type, rate, ps, h, otPay, wages, tips: t, gross, fica, income, adv, net: r2(gross - fica - income - adv), erTax: r2(gross * (RATES.erFica + RATES.erUnemp)),
      noRate: type === 'hourly' && !(rate > 0) && h.total > 0, salaryMissing: type === 'salary' && !(+pr.salary > 0) };
  }).filter((x) => x.ps.length || x.type === 'salary' && x.wages > 0);
  const sum = (k) => r2(rows.reduce((t, x) => t + x[k], 0));
  const wages = sum('wages'), tipsT = sum('tips'), erTax = sum('erTax');
  return { rows, wages, tips: tipsT, erTax, net: sum('net'), gross: r2(wages + tipsT), cost: r2(wages + tipsT + erTax),
    hours: r2(rows.reduce((t, x) => t + x.h.total, 0)), labor: D.sales ? wages / D.sales : null,
    open: D.punches.filter((p) => !p.out) };
}

// Who gets the Payroll screens
export const PAY_KEYS = ['timesheets', 'payrates', 'payrun', 'advances'];
export const isChefApprover = (P) => session.profile?.role === 'chef' && !!P.chefHours?.[myStaff()?.id];
export const hasPayroll = (P) => isHost() || (session.profile?.role === 'manager' && PAY_KEYS.some((k) => level(k) !== 'none')) || isChefApprover(P);
