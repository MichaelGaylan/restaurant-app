// Encrypted on-device storage (RRA-021).
// IndexedDB (named by BRAND.dbName, one per restaurant) holds two stores:
//   keys:  the device signing key pair and the AES data key (non-extractable)
//   vault: app records, each sealed with AES-GCM before it is written
// Wiping access deletes the whole database, which destroys the keys too.

import { newDataKey, newDeviceKey, newEcdhKey, seal, unseal } from './crypto.js';

const DB_NAME = globalThis.BRAND.dbName;
let dbp = null;
let dataKey = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('keys');
        req.result.createObjectStore('vault');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const rawGet = (store, k) => tx(store, 'readonly', (s) => s.get(k));
const rawPut = (store, k, v) => tx(store, 'readwrite', (s) => s.put(v, k));

async function key(name, make) {
  let k = await rawGet('keys', name);
  if (!k) {
    k = await make();
    await rawPut('keys', name, k);
  }
  return k;
}

export const deviceKey = () => key('device', newDeviceKey);
// Restoring an Admin backup (RRA-035) replaces this phone's device key.
export const setDeviceKey = (pair) => rawPut('keys', 'device', pair);
export const ecdhKey = () => key('ecdh', newEcdhKey);

async function getDataKey() {
  if (!dataKey) dataKey = await key('data', newDataKey);
  return dataKey;
}

export async function get(id) {
  const rec = await rawGet('vault', id);
  return rec ? unseal(await getDataKey(), rec) : undefined;
}

export async function put(id, value) {
  await rawPut('vault', id, await seal(await getDataKey(), value));
}

export async function del(id) {
  await tx('vault', 'readwrite', (s) => s.delete(id));
}

// All records whose id starts with prefix, e.g. "recipe:".
export async function all(prefix) {
  const k = await getDataKey();
  const d = await db();
  const rows = await new Promise((resolve, reject) => {
    const out = [];
    const range = IDBKeyRange.bound(prefix, prefix + '￿');
    const req = d.transaction('vault').objectStore('vault').openCursor(range);
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out.push(c.value); c.continue(); } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
  return Promise.all(rows.map((r) => unseal(k, r)));
}

export async function wipe() {
  if (dbp) (await dbp).close();
  dbp = null;
  dataKey = null;
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
