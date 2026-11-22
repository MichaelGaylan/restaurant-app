// Team data: recipes, stock, vendors, staff, prep, board, schedule, events, waste.
//
// Every record lives in a collection and is saved encrypted on this phone
// (store.js). The sync adapter below is the hook for sharing the same data
// between phones (RRA-031): once a service is chosen, put() and remove() also
// send the change there, and changes from other phones come back through
// applyRemote(). Screens never talk to the service directly.

import * as store from './store.js';
import { randomId } from './crypto.js';
import { STARTER_STOCK } from './starter-stock.js';

let adapter = null; // { push(coll, doc), drop(coll, id) }
const listeners = new Set();

export function useSync(a) { adapter = a; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = (coll, remote = false) => listeners.forEach((fn) => fn(coll, remote));

export const list = (coll) => store.all(`${coll}:`);
export const get = (coll, id) => store.get(`${coll}:${id}`);

export async function put(coll, doc) {
  if (!doc.id) { doc.id = randomId(8); doc.created = Date.now(); }
  doc.updated = Date.now();
  await store.put(`${coll}:${doc.id}`, doc);
  adapter?.push(coll, doc);
  changed(coll);
  return doc;
}

export async function remove(coll, id) {
  await store.del(`${coll}:${id}`);
  adapter?.drop(coll, id);
  changed(coll);
}

// A change that arrived from another phone.
export async function applyRemote(coll, id, doc) {
  if (doc) await store.put(`${coll}:${id}`, doc); else await store.del(`${coll}:${id}`);
  changed(coll, true);
}

// Single settings record.
export async function settings() {
  return (await store.get('settings')) || {};
}
export async function saveSettings(s) {
  s.updated = Date.now();
  await store.put('settings', s);
  adapter?.push('settings', { id: 'settings', ...s });
  changed('settings');
}
export async function applyRemoteSettings(s) {
  delete s.id;
  await store.put('settings', s);
  changed('settings', true);
}

export const byName = (a, b) => (a.name || '').localeCompare(b.name || '');

// First run: load the starter stock list and sensible defaults. With shared
// data on, only the Admin phone seeds; other phones receive the team's data.
export async function seed({ shared = false, host = false } = {}) {
  if (await store.get('seeded')) return;
  if (shared && !host) { await store.put('seeded', { at: Date.now(), skipped: true }); return; }
  if ((await list('stock')).length) { await store.put('seeded', { at: Date.now(), had: true }); return; }
  for (const g of STARTER_STOCK) {
    for (const [name, unit] of g.items) {
      await put('stock', { name, unit: unit || 'each', group: g.group, par: 0, onHand: 0, vendor: '', price: '' });
    }
  }
  await saveSettings({
    stations: ['Grill', 'Fry', 'Sauces', 'Salads', 'Bar'],
    sections: ['Wings', 'Burgers', 'Sandwiches', 'Baskets', 'Salads', 'Appetizers', 'Sides', 'Desserts'],
    popups: true,
  });
  await store.put('seeded', { at: Date.now() });
}

// Monday of the week that contains date d, as YYYY-MM-DD.
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return isoDate(x);
}
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const today = () => isoDate(new Date());
export const money = (n) => (Number.isFinite(+n) && n !== '' ? `$${(+n).toFixed(2)}` : '—');
