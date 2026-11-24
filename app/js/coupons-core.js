// Coupons (RRA-122): the rules, with no screens, so the POS, Payroll and the
// Coupons screen all count a discount the same way.
//
// A coupon is a shared record ('coupon'): a typed code (WINGS20), an offer
// (percent off, dollar off, a free dish, or buy one get one), and its rules.
// The QR code or barcode on a printed or texted coupon holds only
// "<tag>:<code>", e.g. BLG:WINGS20 or BLG:WINGS20-7F3K9Q for a one-time code.
// The offer itself is looked up here, so a home-made QR code can't name its
// own discount, and another restaurant's app turns it away (different tag).
//
// When a coupon goes on a check, its offer is copied onto the check, so
// editing the coupon later doesn't change checks already rung up. Uses are
// counted from the checks themselves (open and closed), so there is no second
// list to fall out of step.

const BRAND = globalThis.BRAND || {};
const r2 = (n) => Math.round(n * 100) / 100;

export const TYPES = {
  pct: 'Percent off',
  off: 'Dollars off',
  free: 'Free dish',
  bogo: 'Buy one, get one free',
};
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Standing discounts (RRA-128): a coupon with a tag is a discount a guest gets
// every visit by showing ID, with no code to scan. The server picks it from
// Discounts on the check and confirms they saw the ID. The tag is saved on the
// check, so sales can show e.g. military/veteran discounts on their own line.
export const TAGS = {
  military: { label: 'Military / veteran', icon: '🎖', id: 'military or veteran ID', code: 'MILITARY' },
  responder: { label: 'First responder', icon: '🚒', id: 'first responder ID', code: 'RESPONDER' },
  senior: { label: 'Senior', icon: '🧓', id: 'ID showing their age', code: 'SENIOR' },
};
export const tagOf = (k) => TAGS[k?.tag] || null;

export const tag = () => String((BRAND.coupon && BRAND.coupon.tag) || (BRAND.dataPrefix || 'CPN').replace(/\W+/g, '')).toUpperCase();

// Codes: letters and numbers only, upper case. One-time codes add -XXXXXX.
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, easier to type
export function newSuffix(n = 6) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => ALPHA[x % ALPHA.length]).join('');
}

// What goes inside the QR code or barcode.
export const payload = (code) => `${tag()}:${cleanCode(code)}`;

// Whatever was scanned or typed → { code } or { error }.
export function readScan(text) {
  const t = String(text || '').trim();
  const m = t.match(/^([A-Za-z0-9]+):([A-Za-z0-9-]+)$/);
  if (m) {
    if (m[1].toUpperCase() !== tag()) return { error: 'This coupon is for a different restaurant.' };
    return { code: cleanCode(m[2]) };
  }
  if (/^[A-Za-z0-9-]{3,}$/.test(t)) return { code: cleanCode(t) };
  return { error: "That isn't one of our coupon codes." };
}

// Find the coupon for a code. "WINGS20-7F3K9Q" is a one-time code of WINGS20.
export function findCoupon(coupons, code) {
  code = cleanCode(code);
  const exact = coupons.find((c) => cleanCode(c.code) === code);
  if (exact) return { coupon: exact, code, suffix: '' };
  const i = code.lastIndexOf('-');
  if (i > 0) {
    const base = code.slice(0, i), suffix = code.slice(i + 1);
    const c = coupons.find((x) => cleanCode(x.code) === base);
    if (c) return { coupon: c, code, suffix };
  }
  return null;
}

const isFoodLine = (x) => x.station !== 'Bar';
const liveLines = (c) => (c.items || []).filter((x) => !x.voided);

// The offer as a short line for the check and the coupon picture.
export function headline(k) {
  const t = tagOf(k);
  if (t) return `${t.label}: ${offerText(k)}`;
  return offerText(k);
}
function offerText(k) {
  const what = k.food ? 'food' : 'your check';
  if (k.type === 'pct') return `${+k.value || 0}% OFF ${k.food ? 'any food order' : 'your check'}`;
  if (k.type === 'off') return `$${(+k.value || 0).toFixed(2).replace(/\.00$/, '')} OFF ${what}`;
  if (k.type === 'free') return `FREE ${k.itemName || 'dish'}`;
  if (k.type === 'bogo') return `Buy one ${k.itemName || 'dish'}, get one FREE`;
  return 'Special offer';
}

const fmtDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtHour = (hm) => { const [h, m] = String(hm).split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; const hh = h % 12 || 12; return m ? `${hh}:${String(m).padStart(2, '0')}${ap}` : `${hh}${ap}`; };
function dayRange(days) {
  if (!days || !days.length || days.length === 7) return '';
  const s = [...days].sort((a, b) => a - b);
  const runs = [];
  for (const d of s) { const r = runs[runs.length - 1]; if (r && d === r[1] + 1) r[1] = d; else runs.push([d, d]); }
  return runs.map(([a, b]) => (a === b ? DAYS[a] : b === a + 1 ? `${DAYS[a]}, ${DAYS[b]}` : `${DAYS[a]}–${DAYS[b]}`)).join(', ');
}

// The fine print, one short line each, for the coupon picture.
export function finePrint(k) {
  const out = [];
  if (+k.min > 0) out.push(`Minimum $${(+k.min).toFixed(2).replace(/\.00$/, '')}${k.food ? ' food' : ''} purchase`);
  if (k.food && (k.type === 'pct' || k.type === 'off')) out.push('Food only · not valid on drinks');
  const when = [dayRange(k.days), k.from && k.to ? `${fmtHour(k.from)}–${fmtHour(k.to)}` : ''].filter(Boolean).join(' · ');
  if (when) out.push(`Valid ${when}`);
  if (tagOf(k)) out.push(`Show ${tagOf(k).id} · every visit`);
  out.push(k.stack ? 'One per check' : 'One per check · not valid with other offers');
  if (k.start && k.start > new Date().toISOString().slice(0, 10)) out.push(`Starts ${fmtDay(k.start)}`);
  if (k.end) out.push(`Expires ${fmtDay(k.end)}`);
  if (k.fine) out.push(String(k.fine).trim());
  return out;
}

// The part of the coupon copied onto a check.
export const snapshot = (cp, code) => ({
  couponId: cp.id, code, type: cp.type, value: +cp.value || 0, food: !!cp.food,
  menuId: cp.menuId || '', itemName: cp.itemName || '', min: +cp.min || 0, stack: !!cp.stack, tag: cp.tag || '',
});

// Discount for one coupon on a check right now (items can change after it's added).
export function discountOf(c, k) {
  const lines = liveLines(c);
  const sub = lines.reduce((t, x) => t + x.price * (x.qty || 1), 0);
  const base = lines.filter((x) => !k.food || isFoodLine(x)).reduce((t, x) => t + x.price * (x.qty || 1), 0);
  if (k.min > 0 && (k.food ? base : sub) + 0.004 < k.min) return { amount: 0, note: `needs $${k.min.toFixed(2)}${k.food ? ' of food' : ''}` };
  if (k.type === 'pct') return { amount: r2(base * Math.min(100, Math.max(0, k.value)) / 100) };
  if (k.type === 'off') return { amount: r2(Math.min(base, Math.max(0, k.value))) };
  const mine = lines.filter((x) => (k.menuId && x.menuId === k.menuId) || (!k.menuId && k.itemName && x.name === k.itemName));
  const qty = mine.reduce((t, x) => t + (x.qty || 1), 0);
  const price = mine.length ? Math.min(...mine.map((x) => x.price)) : 0;
  if (k.type === 'free') return qty ? { amount: r2(price) } : { amount: 0, note: `add ${k.itemName || 'the dish'}` };
  if (k.type === 'bogo') return qty >= 2 ? { amount: r2(Math.floor(qty / 2) * price) } : { amount: 0, note: `needs 2 × ${k.itemName || 'the dish'}` };
  return { amount: 0 };
}

// Every coupon on a check, never more than the items add up to.
export function discounts(c) {
  const sub = r2(liveLines(c).reduce((t, x) => t + x.price * (x.qty || 1), 0));
  let left = sub;
  const list = (c.coupons || []).map((k) => {
    const d = discountOf(c, k);
    const amount = r2(Math.min(left, d.amount));
    left = r2(left - amount);
    return { ...k, amount, note: d.note || '' };
  });
  return { list, total: r2(sub - left) };
}

const nowParts = (now) => ({ iso: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, day: now.getDay(), hm: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` });

// Can this code go on this check? → { ok: true, line } or { error }.
// checks = every check (open and closed), to count uses.
export function canApply({ coupons, checks, check, text, now = new Date() }) {
  const scan = readScan(text);
  if (scan.error) return { error: scan.error };
  const hit = findCoupon(coupons, scan.code);
  if (!hit) return { error: `No coupon with the code ${scan.code}.` };
  return rules({ ...hit, checks, check, now });
}

// A standing discount (RRA-128) picked from the list: same rules, no code read.
export const canApplyStanding = ({ coupon, checks, check, now = new Date() }) => rules({ coupon, code: coupon.code, suffix: '', checks, check, now });

function rules({ coupon: cp, code, suffix, checks, check, now }) {
  if (cp.paused) return { error: `${cp.code} is paused.` };
  if (cp.unique && !suffix) return { error: `${cp.code} only works with its one-time code (e.g. ${cp.code}-XXXXXX).` };
  if (suffix && !(cp.codes || []).includes(suffix)) return { error: `${code} isn't one of the one-time codes made for ${cp.code}.` };
  const t = nowParts(now);
  if (cp.start && t.iso < cp.start) return { error: `${cp.code} starts ${fmtDay(cp.start)}.` };
  if (cp.end && t.iso > cp.end) return { error: `${cp.code} expired ${fmtDay(cp.end)}.` };
  if (cp.days && cp.days.length && cp.days.length < 7 && !cp.days.includes(t.day)) return { error: `${cp.code} is only good ${dayRange(cp.days)}.` };
  if (cp.from && cp.to && (t.hm < cp.from || t.hm > cp.to)) return { error: `${cp.code} is only good ${fmtHour(cp.from)}–${fmtHour(cp.to)}.` };
  const on = check.coupons || [];
  if (on.some((k) => k.couponId === cp.id)) return { error: `${tagOf(cp) ? tagOf(cp).label + ' discount' : cp.code} is already on this check (one per check).` };
  if (on.length && (!cp.stack || on.some((k) => !k.stack))) return { error: 'This check already has a coupon or discount, and these can\'t be combined.' };
  const used = (checks || []).filter((k) => k.id !== check.id).flatMap((k) => k.coupons || []);
  if (suffix && used.some((k) => k.code === code)) return { error: `${code} has already been used.` };
  const uses = used.filter((k) => k.couponId === cp.id).length;
  if (+cp.maxUses > 0 && uses >= +cp.maxUses) return { error: `${cp.code} is used up (${cp.maxUses} of ${cp.maxUses}).` };
  return { ok: true, line: snapshot(cp, code), coupon: cp };
}

// How many times a coupon has been used (on any check, open or closed).
export const usesOf = (cp, checks) => (checks || []).reduce((n, k) => n + (k.coupons || []).filter((x) => x.couponId === cp.id).length, 0);
