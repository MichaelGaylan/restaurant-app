// Shared team data through Firebase (RRA-031).
//
// Every record is encrypted on the phone with the team key before it goes to
// Firestore, so Google (and anyone who gets hold of the public Firebase
// config) only ever sees scrambled data. Phones sign in anonymously; the
// Firestore rules in firestore.rules only let signed-in phones read and write.
//
// Layout: teams/<BRAND.teamId>/docs/{collection}~{id} = { c, i, u, d, iv, ct }
//   c collection, i id, u updated (ms), d deleted flag, iv + ct the sealed record.

import { FIREBASE, BRAND } from './config.js';
const TEAM = BRAND.teamId; // each restaurant's own shared data folder
import * as data from './data.js';
import * as store from './store.js';
import { b64uEnc, b64uDec, importTeamKey, sealTo, openFrom } from './crypto.js';
import { teamKeyBytes, ensureTeamKey, payPrivate } from './access.js';
import { level, myStaff } from './perms.js';
import { isPrivate, recipientKeys } from './audience.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const COLLS = ['recipe', 'stock', 'vendor', 'staff', 'prepitem', 'prepday', 'post', 'week', 'swap', 'event', 'waste', 'punch', 'payrate', 'prepsaved', 'settings'];
const te = new TextEncoder();
const td = new TextDecoder();

let state = FIREBASE ? 'starting' : 'off';
let detail = '';
export const status = () => ({ state, detail });
export const enabled = () => !!FIREBASE;
// Resolves once this phone has the shared data (RRA-087), or false after ms.
let syncedNow; const syncedOnce = new Promise((r) => { syncedNow = r; });
export const whenSynced = (ms = 8000) => Promise.race([syncedOnce, new Promise((r) => setTimeout(() => r(false), ms))]);

let fs = null;
let db = null;
let key = null;
let connecting = null;
let inboxFn = null;
let lastSnap = null;
// This phone just got a pay key (RRA-066): open the hours and rates it
// skipped before, from what the shared data already holds.
export async function reopenPrivate() {
  if (!lastSnap) return;
  for (const d of lastSnap.docs) {
    const r = d.data();
    if (!PRIVATE.includes(r.c) || r.d) continue;
    const mine = await localDoc(r.c, r.i);
    if (mine && (mine.updated || 0) >= r.u) continue;
    try { const doc = await openPrivate(r); if (doc) await data.applyRemote(r.c, r.i, doc); } catch { /* not ours */ }
  }
}
export const onInbox = (fn) => { inboxFn = fn; };

// One Firebase connection per page, used by sync and by the request inbox.
function connect() {
  if (!connecting) {
    connecting = (async () => {
      const [{ initializeApp }, auth, firestore] = await Promise.all([
        import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
      ]);
      fs = firestore;
      const app = initializeApp(FIREBASE);
      await auth.signInAnonymously(auth.getAuth(app));
      db = fs.getFirestore(app);
    })();
    connecting.catch(() => { connecting = null; });
  }
  return connecting;
}

const inboxRef = (iid) => fs.doc(db, 'teams', TEAM, 'docs', docPath('inbox', iid));

// New phone: leave a sealed request for the inviter (RRA-043).
export async function postRequest(iid, box) {
  if (!FIREBASE) return false;
  await connect();
  await fs.setDoc(inboxRef(iid), { c: 'inbox', i: iid, u: Date.now(), d: false, iv: '', ct: JSON.stringify(box) });
  return true;
}

// Inviter: clear a request once it has been handled.
export async function clearRequest(iid) {
  if (!FIREBASE || !db) return;
  await fs.setDoc(inboxRef(iid), { c: 'inbox', i: iid, u: Date.now(), d: true, iv: '', ct: '' }).catch(() => {});
}
const docPath = (c, i) => `${c}~${i}`;

async function seal(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { iv: b64uEnc(iv), ct: b64uEnc(ct) };
}
async function open(rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uDec(rec.iv) }, key, b64uDec(rec.ct));
  return JSON.parse(td.decode(pt));
}

// Hours and pay rates (RRA-055) are sealed to the pay key, not the team key:
// only managers and the Admin can open them. A punch is also sealed to the
// employee's own phone so a manager's fix reaches them.
const PRIVATE = ['punch', 'payrate'];
async function sealPrivate(coll, doc) {
  const pub = (await data.settings()).payPub;
  if (!pub) return null; // waits until the Admin phone has made the pay key
  const bytes = te.encode(JSON.stringify(doc));
  const box = { m: await sealTo(pub, bytes) };
  if (coll === 'punch') { const st = await data.get('staff', doc.staffId); if (st?.ek) box.s = await sealTo(st.ek, bytes); }
  return { iv: 'pk1', ct: JSON.stringify(box) };
}
async function openPrivate(r) {
  let box;
  try { box = JSON.parse(r.ct); } catch { return null; }
  const priv = await payPrivate();
  if (priv && box.m) {
    try {
      const doc = JSON.parse(td.decode(await openFrom(priv, box.m)));
      // A manager the Admin set to No for this keeps none of it on the phone.
      if (r.c === 'payrate' && level('payrates') === 'none') return null;
      if (r.c === 'punch' && level('timesheets') === 'none' && doc.staffId !== myStaff()?.id) return null;
      return doc;
    } catch { /* not ours */ }
  }
  if (box.s) { try { return JSON.parse(td.decode(await openFrom((await store.ecdhKey()).privateKey, box.s))); } catch { /* not ours */ } }
  return null;
}

// Private messages (RRA-075): sealed to each recipient's phone, not the team key.
async function sealMessage(doc) {
  const bytes = te.encode(JSON.stringify(doc));
  const keys = recipientKeys(doc, await data.list('staff'), await data.settings());
  const mine = await exportMyEk();
  if (mine && !keys.includes(mine)) keys.push(mine);
  const k = {};
  for (const ek of keys) { try { k[ek] = await sealTo(ek, bytes); } catch { /* old key */ } }
  return { iv: 'mk1', ct: JSON.stringify({ k }) };
}
let myEk = null;
async function exportMyEk() {
  if (!myEk) { try { const { myEcdhPublic } = await import('./access.js'); myEk = await myEcdhPublic(); } catch { return null; } }
  return myEk;
}
async function openMessage(r) {
  let box;
  try { box = JSON.parse(r.ct); } catch { return null; }
  const ek = await exportMyEk();
  const mine = box.k?.[ek];
  if (!mine) return null; // not for this phone
  try { return JSON.parse(td.decode(await openFrom((await store.ecdhKey()).privateKey, mine))); } catch { return null; }
}

async function push(coll, doc) {
  if (!db) return;
  if (coll === 'post' && isPrivate(doc)) {
    await fs.setDoc(fs.doc(db, 'teams', TEAM, 'docs', docPath(coll, doc.id)), { c: coll, i: doc.id, u: doc.updated || Date.now(), d: false, ...(await sealMessage(doc)) });
    return;
  }
  if (PRIVATE.includes(coll)) {
    const pbox = await sealPrivate(coll, doc);
    if (pbox) await fs.setDoc(fs.doc(db, 'teams', TEAM, 'docs', docPath(coll, doc.id)), { c: coll, i: doc.id, u: doc.updated || Date.now(), d: false, ...pbox });
    return;
  }
  const box = await seal(doc);
  await fs.setDoc(fs.doc(db, 'teams', TEAM, 'docs', docPath(coll, doc.id)), { c: coll, i: doc.id, u: doc.updated || Date.now(), d: false, ...box });
}
async function drop(coll, id) {
  if (!db) return;
  await fs.setDoc(fs.doc(db, 'teams', TEAM, 'docs', docPath(coll, id)), { c: coll, i: id, u: Date.now(), d: true, iv: '', ct: '' });
}

async function localDoc(coll, id) {
  return coll === 'settings' ? data.settings() : data.get(coll, id);
}

export async function start(profile, onStatus = () => {}) {
  if (!FIREBASE) return;
  const set = (s, d = '') => { state = s; detail = d; onStatus(status()); };
  try {
    if (!(await ensureTeamKey(profile))) { set('nokey', 'This phone has no team key yet. Ask a manager to invite it again.'); return; }
    key = await importTeamKey(await teamKeyBytes());
    await connect();
    data.useSync({
      push: (c, d) => push(c, d).catch((e) => set('error', e.message)),
      drop: (c, i) => drop(c, i).catch((e) => set('error', e.message)),
    });
    let first = true;
    fs.onSnapshot(fs.collection(db, 'teams', TEAM, 'docs'), async (snap) => {
      lastSnap = snap;
      const seen = new Set();
      for (const ch of snap.docChanges()) {
        const r = ch.doc.data();
        seen.add(docPath(r.c, r.i));
        if (r.c === 'inbox') { if (!r.d && inboxFn) { try { await inboxFn(r.i, JSON.parse(r.ct)); } catch { /* not for this phone */ } } continue; }
        if (!COLLS.includes(r.c)) continue;
        const mine = await localDoc(r.c, r.i);
        if (mine && (mine.updated || 0) >= r.u) continue; // ours is as new or newer
        try {
          if (r.c === 'settings') { if (!r.d) await data.applyRemoteSettings(await open(r)); }
          else if (r.iv === 'mk1') {
            // A private message: opens only on the phones it was sealed to.
            const doc = r.d ? null : await openMessage(r);
            if (r.d || doc) await data.applyRemote(r.c, r.i, doc);
          }
          else if (PRIVATE.includes(r.c)) {
            // Someone else's hours and pay never open on a staff phone.
            const doc = r.d ? null : await openPrivate(r);
            if (r.d || doc) await data.applyRemote(r.c, r.i, doc);
          } else await data.applyRemote(r.c, r.i, r.d ? null : await open(r));
        } catch { set('error', 'Some shared data could not be opened with this phone\'s team key.'); }
      }
      if (first) {
        first = false;
        // Send up anything this phone has that the team doesn't have yet.
        for (const c of COLLS) {
          if (c === 'settings') {
            const s = await data.settings();
            const remote = snap.docs.find((d) => d.id === docPath('settings', 'settings'))?.data();
            if (Object.keys(s).length && (!remote || (s.updated || 0) > remote.u)) await push('settings', { id: 'settings', ...s });
            continue;
          }
          for (const d of await data.list(c)) {
            const remote = snap.docs.find((x) => x.id === docPath(c, d.id))?.data();
            if (!remote || (d.updated || 0) > remote.u) await push(c, d);
          }
        }
        await store.put('synced', { at: Date.now() });
        syncedNow(true);
      }
      set('on');
    }, (err) => set('error', err.message));
  } catch (e) {
    set('error', e.message || String(e));
  }
}
