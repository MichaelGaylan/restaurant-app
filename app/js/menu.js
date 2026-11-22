// Starter menu, vendors and supplies, added once on the Admin phone.
// applyMenu() adds each item to the Recipe archive once, under its menu
// section with its menu price, and brings the stock list in line with it.

import * as data from './data.js';
import * as store from './store.js';
import { STARTER_STOCK, REPLACED_STOCK, NON_FOOD } from './starter-stock.js';

export const MENU_VERSION = 'shared-1';

// Each restaurant's menu is added in the app (Recipe archive) or later from
// its own content file (RSW Build list). The shared app ships none.
export const MENU = [];

export const MENU_SECTIONS = MENU.map((m) => m.section);
const OLD_DEFAULT_SECTIONS = ['Wings', 'Burgers', 'Sandwiches', 'Baskets', 'Salads', 'Appetizers', 'Sides', 'Desserts'];
const key = (s) => String(s || '').trim().toLowerCase();

// Runs once per menu version, on the Admin phone (or on a phone-only setup).
export async function applyMenu({ shared = false, host = false } = {}) {
  if (shared && !host) return;
  if ((await store.get('menu'))?.version === MENU_VERSION) return;

  // Menu sections: the menu's own, plus any custom section still in use.
  const recipes = await data.list('recipe');
  const settings = await data.settings();
  const used = new Set(recipes.filter((r) => r.kind === 'dish').map((r) => r.section));
  const keep = (settings.sections || []).filter((s) => !MENU_SECTIONS.includes(s) && (used.has(s) || !OLD_DEFAULT_SECTIONS.includes(s)));
  if (MENU.length) await data.saveSettings({ ...settings, sections: [...MENU_SECTIONS, ...keep] }); // no starter menu: keep the default sections

  // Dishes: add what's missing, update the price and section of what's there.
  const byName = new Map(recipes.filter((r) => r.kind === 'dish').map((r) => [key(r.name), r]));
  let order = 0;
  for (const m of MENU) {
    for (const [name, price] of m.items) {
      order += 1;
      const r = byName.get(key(name));
      if (!r) {
        await data.put('recipe', { kind: 'dish', name, section: m.section, price, menuOrder: order, ingredients: [], steps: [], uses: [], comments: [] });
      } else if (r.price !== price || r.section !== m.section || r.menuOrder !== order) {
        await data.put('recipe', { ...r, price, section: m.section, menuOrder: order });
      }
    }
  }

  // Stock: add items the menu needs, and drop starter items it replaced
  // (only while they are still untouched: no count, par, vendor or price).
  const stock = await data.list('stock');
  const have = new Set(stock.map((s) => key(s.name)));
  for (const g of STARTER_STOCK) {
    for (const [name, unit] of g.items) {
      if (!have.has(key(name))) await data.put('stock', { name, unit: unit || 'each', group: g.group, par: 0, onHand: 0, vendor: '', price: '' });
    }
  }
  for (const s of stock) {
    if (REPLACED_STOCK.includes(s.name) && !s.par && !s.onHand && !s.vendor && !s.price) await data.remove('stock', s.id);
  }
  await store.put('menu', { version: MENU_VERSION, at: Date.now() });
}

// Preset vendors (RRA-044): common US food-service suppliers.
// Added once on the Admin phone; edit or take out any you don't use.
export const PRESET_VENDORS = [
  ['Sysco', 'Broadline: proteins, frozen, dairy, produce, dry goods, paper'],
  ['US Foods', 'Broadline: proteins, frozen, dairy, produce, dry goods, paper'],
  ['Performance Foodservice (PFG)', 'Broadline: wings, burgers, fryer items, paper'],
  ['Gordon Food Service', 'Broadline and Gordon stores: frozen, dairy, dry goods'],
  ["Restaurant Depot", 'Cash and carry: anything short between deliveries'],
  ["Sam's Club", 'Cash and carry: drinks, snacks, paper, cleaning'],
  ['Coca-Cola bottler', 'Coca-Cola, Diet Coke, Sprite, Ginger Ale, juices'],
  ['Red Bull distributor', 'Red Bull, Red Bull Sugar Free'],
  ['Ecolab', 'Dish machine chemicals, sanitizer, cleaning'],
  ['Cintas', 'Linens, towels, aprons, mats, first aid'],
];
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
