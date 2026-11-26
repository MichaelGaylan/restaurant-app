// The restaurant's starter menu (its brand.js menu, RSW-020).
// applyMenu() adds each item to the Recipe archive once, under its menu
// section with its menu price, and brings the stock list in line with it.

import * as data from './data.js';
import * as store from './store.js';
import { STARTER_STOCK, NON_FOOD } from './starter-stock.js';

export const MENU_VERSION = globalThis.BRAND.menuVersion || '1';

// The menu itself (names, sections, prices) lives in the restaurant's
// brand.js (RRA-108, RSW-020). Without one the restaurant starts with no
// dishes and adds them in Recipes.
export const MENU = globalThis.BRAND.menu || [];

// The dish's picture: a Recipes photo wins, then js/brand.js menuPhotos.
export function dishPhoto(d) {
  if (!d) return '';
  if (d.photo) return d.photo;
  const B = globalThis.BRAND || {};
  const f = (B.menuPhotos || {})[d.name];
  return f ? (/[/:]/.test(f) ? f : (B.menuPhotoDir || '') + f) : '';
}

export const MENU_SECTIONS = MENU.map((m) => m.section);
const OLD_DEFAULT_SECTIONS = ['Wings', 'Burgers', 'Sandwiches', 'Baskets', 'Salads', 'Appetizers', 'Sides', 'Desserts'];
const key = (s) => String(s || '').trim().toLowerCase();

// Runs once per menu version, on the Admin phone (or on a phone-only setup).
export async function applyMenu({ shared = false, host = false } = {}) {
  if (shared && !host) return;
  // RRA-142: what the team's data actually got is kept in the shared settings
  // (menuApplied), not only on this device, so an update that never reached
  // the shared data runs again instead of being counted as done.
  const settings = await data.settings();
  if (settings.menuApplied?.version === MENU_VERSION) return;

  // RRA-136: what the last menu update gave each dish, so a price or section
  // the Admin changed in Recipes is kept. Only a dish still exactly as the
  // last update left it follows the new menu. Dishes are never removed.
  const applied = settings.menuApplied || null;
  const last = applied || (await store.get('menu'));
  const prev = applied?.items || null;          // { name: [price, section] }
  const prevSecs = applied?.sections || null;
  const recipes = await data.list('recipe');

  // Menu sections: keep the team's list as it is (order, removed and custom
  // sections) and only add sections this menu update brings in.
  // A phone that never had a menu update starts with the menu's order and
  // drops the old starter sections nobody uses.
  const used = new Set(recipes.filter((r) => r.kind === 'dish').map((r) => r.section));
  const sections = last ? [...(settings.sections || [])]
    : [...MENU_SECTIONS, ...(settings.sections || []).filter((s) => !MENU_SECTIONS.includes(s) && (used.has(s) || !OLD_DEFAULT_SECTIONS.includes(s)))];
  MENU_SECTIONS.forEach((s, i) => {
    if (sections.includes(s) || (prevSecs || []).includes(s)) return;
    const before = MENU_SECTIONS.slice(0, i).reverse().find((x) => sections.includes(x));
    sections.splice(before ? sections.indexOf(before) + 1 : sections.length, 0, s);
  });
  const newSections = !MENU.length ? 0 : sections.filter((x) => !(settings.sections || []).includes(x)).length;
  if (MENU.length) await data.saveSettings({ ...(await data.settings()), sections }); // no starter menu: keep the default sections
  let newDishes = 0;

  // Dishes: add what's missing; a dish still as the last menu left it gets the
  // new price and section; one the Admin changed keeps its own.
  const byName = new Map(recipes.filter((r) => r.kind === 'dish').map((r) => [key(r.name), r]));
  const items = {};
  let order = 0;
  for (const m of MENU) {
    for (const [name, price, extra = {}] of m.items) {
      order += 1;
      items[key(name)] = [price, m.section];
      const r = byName.get(key(name));
      const ings = (extra.ingredients || []).map(([qty, item]) => ({ qty, item }));
      // A starter dish the Admin took out after the last update stays out.
      if (!r && prev?.[key(name)]) continue;
      if (!r) {
        await data.put('recipe', { kind: 'dish', name, section: m.section, price, menuOrder: order, ...(extra.drink ? { drink: extra.drink } : {}), ...(extra.desc ? { desc: extra.desc } : {}), ingredients: ings, steps: extra.steps || [], uses: [], comments: [] });
        newDishes += 1;
        continue;
      }
      const p = prev?.[key(name)];
      // Before 0.11.0 nothing was remembered, so those dishes keep what they have.
      const untouched = (f, i) => (p ? r[f] === p[i] : false);
      const patch = {};
      if (r.menuOrder !== order) patch.menuOrder = order;
      if (r.price !== price && untouched('price', 0)) patch.price = price;
      if (r.section !== m.section && untouched('section', 1)) patch.section = m.section;
      if (Object.keys(patch).length) await data.put('recipe', { ...r, ...patch });
    }
  }

  // Stock: add items the menu needs. Stock items are never taken out
  // (Gaylan, 2026-11-26: re-entering them is a long job).
  const stock = await data.list('stock');
  const have = new Set(stock.map((s) => key(s.name)));
  for (const g of STARTER_STOCK) {
    for (const [name, unit] of g.items) {
      if (!have.has(key(name))) await data.put('stock', { name, unit: unit || 'each', group: g.group, par: 0, onHand: 0, vendor: '', price: '' });
    }
  }
  await store.put('menu', { version: MENU_VERSION, at: Date.now() });
  await data.saveSettings({ ...(await data.settings()), menuApplied: { version: MENU_VERSION, at: Date.now(), items, sections: MENU_SECTIONS } });
  return { dishes: newDishes, sections: newSections };
}

// Preset vendors (RRA-044): common food-service suppliers for what the
// restaurant stocks (its brand.js presetVendors). Added once on the Admin
// phone; edit or take out any you don't use. Without its own list a
// restaurant gets these common US ones.
export const DEFAULT_VENDORS = [
  ['Sysco', 'Broadline: proteins, frozen, dairy, produce, dry goods, paper'],
  ['US Foods', 'Broadline: proteins, frozen, dairy, produce, dry goods, paper'],
  ['Performance Foodservice (PFG)', 'Broadline: proteins, frozen, fryer items, paper'],
  ['Gordon Food Service', 'Broadline and Gordon stores: frozen, dairy, dry goods'],
  ['Restaurant Depot', 'Cash and carry: anything short between deliveries'],
  ["Sam's Club", 'Cash and carry: drinks, snacks, paper, cleaning'],
  ['Ecolab', 'Dish machine chemicals, sanitizer, cleaning'],
  ['Cintas', 'Linens, towels, aprons, mats, first aid'],
];
export const PRESET_VENDORS = globalThis.BRAND.presetVendors || DEFAULT_VENDORS;
const VENDOR_PRESET_VERSION = 1;

export async function applyVendors({ shared = false, host = false } = {}) {
  if (shared && !host) return;
  if (((await store.get('vendor-presets'))?.version || 0) >= VENDOR_PRESET_VERSION) return;
  const have = new Set((await data.list('vendor')).map((v) => key(v.name)));
  for (const [name, carries] of PRESET_VENDORS) {
    if (!have.has(key(name))) await data.put('vendor', { name, carries, deadline: '', contact: '', preset: true });
  }
  await store.put('vendor-presets', { version: VENDOR_PRESET_VERSION, at: Date.now() });
}

// Non-food supplies (RRA-058): adds the starter supplies to a list made
// before they existed. Runs once, on the Admin phone when data is shared.
const SUPPLIES_VERSION = 1;
export async function applySupplies({ shared = false, host = false } = {}) {
  if (shared && !host) return;
  if (((await store.get('supplies'))?.version || 0) >= SUPPLIES_VERSION) return;
  const have = new Set((await data.list('stock')).map((s) => key(s.name)));
  for (const g of STARTER_STOCK.filter((x) => NON_FOOD.includes(x.group))) {
    for (const [name, unit] of g.items) {
      if (!have.has(key(name))) await data.put('stock', { name, unit: unit || 'each', group: g.group, par: 0, onHand: 0, vendor: '', price: '' });
    }
  }
  await store.put('supplies', { version: SUPPLIES_VERSION, at: Date.now() });
}
