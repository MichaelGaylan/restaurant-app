// Duplicate clean-up (RRA-087). A second Admin device (an iPad restored from
// a backup) used to add the starter stock, menu and vendors again before the
// shared data reached it, so lists showed everything twice. This finds
// entries with the same name (stock and saved prep: in the same group or
// station), keeps the one with the most filled in, copies over anything only
// a copy had, points links at the one kept, and takes the copies out.

import * as data from './data.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const filled = (v) => v !== undefined && v !== null && v !== '' && v !== 0 && v !== '0' && !(Array.isArray(v) && !v.length);
const AREAS = {
  stock: { label: 'Stock and supplies', key: (s) => `${norm(s.name)}|${norm(s.group)}`, rank: (s) => [s.countedAt || 0, +!!filled(s.onHand), +!!filled(s.par), +!!s.vendor, +!!filled(s.price)] },
  recipe: { label: 'Recipes and menu items', key: (r) => `${r.kind}|${norm(r.name)}`, rank: (r) => [(r.ingredients || []).length, (r.steps || []).length, +!!r.photo, (r.comments || []).length] },
  vendor: { label: 'Vendors', key: (v) => norm(v.name), rank: (v) => [+!!v.contact, +!!v.deadline, +!v.preset] },
  prepsaved: { label: 'Saved prep items', key: (p) => `${norm(p.name)}|${norm(p.station)}`, rank: (p) => [+!!p.amount] },
};
const better = (a, b, rank) => { const x = rank(a); const y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return (a.updated || 0) >= (b.updated || 0); };

// What would be merged: per area, groups of [keeper, ...copies].
export async function findDuplicates() {
  const out = {};
  for (const [coll, a] of Object.entries(AREAS)) {
    const groups = new Map();
    for (const it of await data.list(coll)) {
      if (!norm(it.name)) continue;
      const k = a.key(it);
      groups.set(k, [...(groups.get(k) || []), it]);
    }
    out[coll] = [...groups.values()].filter((g) => g.length > 1).map((g) => {
      const keep = g.reduce((best, x) => (better(x, best, a.rank) ? x : best));
      return [keep, ...g.filter((x) => x !== keep)];
    });
  }
  return out;
}

export const countDuplicates = (found) => Object.values(found).reduce((n, gs) => n + gs.reduce((m, g) => m + g.length - 1, 0), 0);
export const AREA_LABELS = Object.fromEntries(Object.entries(AREAS).map(([k, a]) => [k, a.label]));

export async function mergeDuplicates(found = null) {
  found ||= await findDuplicates();
  const moved = { vendor: new Map(), recipe: new Map() };
  for (const [coll, groups] of Object.entries(found)) {
    for (const [keep, ...copies] of groups) {
      const merged = { ...keep };
      for (const c of copies) {
        for (const [f, v] of Object.entries(c)) if (!['id', 'updated'].includes(f) && !filled(merged[f]) && filled(v)) merged[f] = v;
        if (coll === 'recipe') merged.comments = [...(merged.comments || []), ...(c.comments || []).filter((x) => !(merged.comments || []).some((y) => y.at === x.at && y.text === x.text))];
        if (moved[coll]) moved[coll].set(c.id, keep.id);
      }
      await data.put(coll, merged);
      for (const c of copies) await data.remove(coll, c.id);
    }
  }
  // Links: stock to its vendor, dishes to the house recipes they use.
  if (moved.vendor.size) for (const s of await data.list('stock')) if (moved.vendor.has(s.vendor)) await data.put('stock', { ...s, vendor: moved.vendor.get(s.vendor) });
  if (moved.recipe.size) {
    for (const r of await data.list('recipe')) {
      if (!(r.uses || []).some((u) => moved.recipe.has(u))) continue;
      await data.put('recipe', { ...r, uses: [...new Set(r.uses.map((u) => moved.recipe.get(u) || u))] });
    }
  }
  return countDuplicates(found);
}
