// Drinks (RRA-135): what kind of drink a dish is, where its ticket goes,
// happy hour prices and pours that count the bottles down in Stock.
// The restaurant's lists (sections, pour sizes, choices) live in js/brand.js.

const D = () => globalThis.BRAND.drinks || {};
export const ALCOHOL = ['beer', 'wine', 'liquor', 'cocktail'];
export const KINDS = () => D().kinds || { na: 'Non-alcoholic', beer: 'Beer', wine: 'Wine', liquor: 'Liquor / shot', cocktail: 'Cocktail / mixed drink' };
export const isAlcohol = (k) => ALCOHOL.includes(k);
export const legalAge = () => D().legalAge || 21;

// The kind of drink a menu section holds, from js/brand.js or its name.
export function sectionKind(section) {
  const s = String(section || '');
  const set = D().sections || {};
  if (set[s]) return set[s];
  if (/n\/?a\b|non.?alc|soft drink|soda|mocktail|coffee|juice/i.test(s)) return 'na';
  if (/beer|draft|draught|\bale\b|lager|ipa|seltzer|cider/i.test(s)) return 'beer';
  if (/wine|sangria/i.test(s)) return 'wine';
  if (/liquor|spirit|shot|whisk|bourbon|vodka|tequila|\brum\b|\bgin\b|scotch|cordial/i.test(s)) return 'liquor';
  if (/cocktail|mixed|martini|margarita|bar drink|drinks?\b/i.test(s)) return 'cocktail';
  if (/beverage/i.test(s)) return 'na';
  return '';
}
// A dish's own setting wins ('food' = not a drink), then its section.
export function drinkKind(dish) {
  if (!dish) return '';
  if (dish.drink === 'food') return '';
  return dish.drink || sectionKind(dish.section);
}

// Where a dish's ticket goes. Alcohol always goes to the Bar (Gaylan,
// 2026-11-26); anything else follows its section's "Send to" setting in
// Settings → Menu sections, then Bar for drinks and Kitchen for food.
export function stationOf(dish, settings = {}) {
  const k = drinkKind(dish);
  if (isAlcohol(k)) return 'Bar';
  const set = (settings.sectionStation || {})[dish?.section];
  if (set === 'Bar' || set === 'Kitchen') return set;
  return k || /\bbar\b/i.test(dish?.section || '') ? 'Bar' : 'Kitchen';
}
export function sectionStation(section, settings = {}) {
  const k = sectionKind(section);
  if (isAlcohol(k)) return { station: 'Bar', fixed: true };
  const set = (settings.sectionStation || {})[section];
  return { station: set || (k || /\bbar\b/i.test(section) ? 'Bar' : 'Kitchen'), fixed: false };
}

// ---------- happy hour
// P.happyHour = { on, days: [0..6] (0 = Sunday), start: '16:00', end: '19:00', off: '1.00' }
export const HH_DEFAULT = { on: false, days: [1, 2, 3, 4, 5], start: '16:00', end: '19:00', off: '' };
const minsOf = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export function happyNow(hh, now = new Date()) {
  if (!hh?.on) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const a = minsOf(hh.start), b = minsOf(hh.end);
  // A happy hour past midnight (e.g. 22:00 to 1:00) counts on the day it started.
  if (a <= b) return (hh.days || []).includes(now.getDay()) && t >= a && t < b;
  const yday = (now.getDay() + 6) % 7;
  return ((hh.days || []).includes(now.getDay()) && t >= a) || ((hh.days || []).includes(yday) && t < b);
}
// The price right now: the dish's own happy hour price, or the "$ off every
// alcoholic drink" amount, while happy hour is on.
export function priceNow(dish, hh, now = new Date()) {
  const base = +dish.price || 0;
  if (!happyNow(hh, now)) return { price: base, hh: false };
  if (+dish.hhPrice > 0 && +dish.hhPrice < base) return { price: +dish.hhPrice, hh: true };
  const off = +hh.off || 0;
  if (off > 0 && isAlcohol(drinkKind(dish))) return { price: Math.max(0, Math.round((base - off) * 100) / 100), hh: true };
  return { price: base, hh: false };
}
export function hhLabel(hh) {
  if (!hh?.on) return 'Off';
  const D7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = (hh.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => D7[d]).join(', ') || 'No days';
  const t = (x) => { const m = minsOf(x), h = Math.floor(m / 60) % 24; return `${h % 12 || 12}${m % 60 ? ':' + String(m % 60).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`; };
  return `${days} · ${t(hh.start)} to ${t(hh.end)}`;
}

// ---------- pours that count down Stock
// The size of one stock unit, from its unit text: "bottle (1 L)", "750 ml",
// "keg (15.5 gal)", "case (24)". Returns { oz } for liquids, { count } for packs.
export function unitSize(unit) {
  const u = String(unit || '').toLowerCase();
  const v = u.match(/(\d+(?:\.\d+)?)\s*(ml|l|liter|litre|oz|gal|gallon)s?\b/);
  if (v) {
    const n = +v[1], k = v[2];
    return { oz: k === 'ml' ? n / 29.5735 : k.startsWith('l') ? n * 33.814 : k.startsWith('gal') ? n * 128 : n };
  }
  const c = u.match(/\((\d+)\)|(\d+)\s*(?:pk|pack|ct|count)\b/);
  if (c) return { count: +(c[1] || c[2]) };
  return { count: 1 };
}
// One ingredient line's amount: "1.5 oz", "0.5oz", "2 shots", "1", "1 bottle".
export function amountOf(qty) {
  const q = String(qty || '').trim().toLowerCase().replace(/(\d)\s*\/\s*(\d)/, (m, a, b) => String(+a / +b));
  const n = parseFloat(q.replace(/^(\d*\.?\d+).*/, '$1'));
  if (!Number.isFinite(n)) return null;
  if (/\boz\b|ounce|oz$/.test(q)) return { oz: n };
  if (/\bml\b/.test(q)) return { oz: n / 29.5735 };
  if (/\bshots?\b/.test(q)) return { oz: n * (D().pourOz?.liquor || 1.5) };
  if (/^\d*\.?\d+\s*(each|bottles?|cans?|ea)?$/.test(q)) return { count: n };
  return null; // "1 wedge", "1 splash": not counted
}
const nkey = (s) => String(s || '').trim().toLowerCase();
// How much of each stock item one of this drink uses, in that item's units.
// Pours come from the dish's ingredients that match a Stock item by name. A
// liquor, wine or beer with no ingredients uses its own Stock item, if one has
// the same name, at the standard pour from js/brand.js.
export function pours(dish, stock) {
  const kind = drinkKind(dish);
  if (!kind) return [];
  const by = new Map(stock.map((s) => [nkey(s.name), s]));
  let lines = (dish.ingredients || []).map((i) => ({ s: by.get(nkey(i.item)), a: amountOf(i.qty) })).filter((x) => x.s && x.a);
  if (!lines.length && !(dish.ingredients || []).length && by.get(nkey(dish.name))) {
    const s = by.get(nkey(dish.name)), size = unitSize(s.unit);
    const oz = (D().pourOz || {})[kind];
    lines = [{ s, a: size.oz && oz ? { oz } : { count: 1 } }];
  }
  const out = [];
  for (const { s, a } of lines) {
    const size = unitSize(s.unit);
    // A count ("1 bottle") on a stock item sold by volume counts whole units.
    const used = a.oz != null ? (size.oz ? a.oz / size.oz : null) : a.count / (size.count || 1);
    if (used) out.push({ id: s.id, name: s.name, used });
  }
  return out;
}
// The stock changes for a set of check lines: { stockId: units used }.
export function stockUse(lines, dishes, stock) {
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const use = {};
  for (const x of lines) {
    const d = byId.get(x.menuId);
    if (!d) continue;
    for (const p of pours(d, stock)) use[p.id] = (use[p.id] || 0) + p.used * (x.qty || 1) * (x.pourX || 1);
  }
  return use;
}
export const round2 = (n) => Math.round(n * 100) / 100;
