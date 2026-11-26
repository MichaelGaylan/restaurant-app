// Invite-only access (RRA-018) and expiry (RRA-019). No server is needed.
//
// Every code is "BLG1.<kind>.<payload>.<signature>":
//   inv  invite      signed by a Manager or Admin device, valid for INVITE_HOURS
//   req  request     signed by the new phone's own device key
//   act  activation  signed by the Manager, names the new phone's device key
//
// Flow: the Manager sends an invite. The new phone turns it into a request
// tied to its own device key and shows a short device code. The Manager
// checks that code with the person and approves. Each invite can be approved
// once, and an activation only works on the phone whose key it names, so a
// forwarded invite or activation does not open the app anywhere else.
//
// Trust: an Admin key is listed in config ROOT_KEYS. A Manager's activation
// (signed by the Admin) travels with every code that Manager signs ("chain").

import { ROOT_KEYS, INVITE_HOURS, INACTIVITY_DAYS, ACCESS_URL } from './config.js';
import { sign, verify, exportPublic, shortCode, randomId, textToB64u, b64uToText, sealTo, openFrom, b64uEnc, b64uDec, newTeamKeyBytes, newBackupKey, exportPrivate, importKeyPair, passwordSeal, passwordOpen , newPayKey, importDhPrivate } from './crypto.js';
import * as store from './store.js';

const P = globalThis.BRAND.dataPrefix;
const LAST_USED = P + 'lastUsed';
const DAY = 86400000;

// The internal key stays 'owner' so existing codes keep working; people see "Admin".
export const ROLES = { owner: 'Admin', manager: 'Manager', chef: 'Chef', staff: 'Staff' };
const CAN_INVITE = ['owner', 'manager'];

// Hook for RRA-002 (roles and permissions). Everyone can do everything that
// is built today, except handing out invites.
export function can(profile, action) {
  if (!profile) return false;
  if (action === 'invite') return CAN_INVITE.includes(profile.role);
  if (action === 'invite.manager') return profile.role === 'owner';
  return true;
}

export async function myPublicKey() {
  const k = await store.deviceKey();
  return exportPublic(k.publicKey);
}

export const deviceCode = (pub) => shortCode(pub);

async function signToken(kind, payload) {
  const k = await store.deviceKey();
  const head = `BLG1.${kind}.${textToB64u(JSON.stringify(payload))}`;
  return `${head}.${await sign(k.privateKey, head)}`;
}

export function parse(code) {
  const m = String(code || '').match(/BLG1\.(inv|req|act)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    return { kind: m[1], head: `BLG1.${m[1]}.${m[2]}`, sig: m[3], payload: JSON.parse(b64uToText(m[2])), raw: m[0] };
  } catch {
    return null;
  }
}

let revoked = new Set();
export async function loadRevocations() {
  try {
    const r = await fetch(ACCESS_URL, { cache: 'no-store' });
    if (r.ok) revoked = new Set((await r.json()).revoked || []);
  } catch { /* offline: keep what we had */ }
  return revoked;
}

// Checks the signature and that the signer traces back to an Admin key.
// Returns the payload or throws an Error with a plain-language message.
export async function check(code, kind) {
  const t = typeof code === 'string' ? parse(code) : code;
  if (!t) throw new Error(`That doesn't look like a ${globalThis.BRAND.shortName} code.`);
  if (t.kind !== kind) throw new Error(`This is ${kindName(t.kind)}, not ${kindName(kind)}.`);
  const p = t.payload;
  if (!(await verify(p.by, t.head, t.sig))) throw new Error('This code has been changed or damaged.');
  if (kind === 'req') return p; // self-signed by the new phone; trust comes from the Manager's approval
  await checkSigner(p);
  if (p.iid && revoked.has(p.iid)) throw new Error('This access has been withdrawn.');
  return p;
}

async function checkSigner(p) {
  if (ROOT_KEYS.includes(p.by)) return;
  if (!p.chain) throw new Error(`This code was not signed by a ${globalThis.BRAND.shortName} manager.`);
  const c = await check(p.chain, 'act');
  if (c.dev !== p.by || !CAN_INVITE.includes(c.role)) throw new Error(`This code was not signed by a ${globalThis.BRAND.shortName} manager.`);
}

function kindName(k) {
  return { inv: 'an invite', req: 'an approval request', act: 'an activation code' }[k] || 'a code';
}

// ----- Manager side -----

export async function createInvite(profile, name, role, pos = '') {
  if (!['staff', 'chef', ...(can(profile, 'invite.manager') ? ['manager'] : [])].includes(role)) throw new Error('You can\'t invite that role.');
  const pub = await myPublicKey();
  const iid = randomId(9);
  const now = Date.now();
  // rk: this phone's sealing key, so the new phone can drop its request in
  // the shared inbox for this phone only (RRA-043).
  const rk = await exportPublic((await store.ecdhKey()).publicKey);
  const payload = { iid, name, role, iat: now, exp: now + INVITE_HOURS * 3600000, by: pub, rk };
  if (pos) payload.pos = pos; // RRA-133: their job title, picked by the manager
  if (profile.activation) payload.chain = profile.activation;
  const code = await signToken('inv', payload);
  await store.put(`invite:${iid}`, { iid, name, role, pos, iat: now, exp: payload.exp, status: 'sent' });
  return code;
}

export const issuedInvites = () => store.all('invite:');

// Reads a request; returns what the Manager must confirm before approving.
export async function readRequest(code) {
  const p = await check(code, 'req');
  if (p.restore) return readRestore(p);
  const inv = await store.get(`invite:${p.iid}`);
  if (!inv) throw new Error('This request is for an invite sent from another phone. Only the manager who sent the invite can approve it.');
  if (inv.status === 'approved') throw new Error(`The invite for ${inv.name} was already used. Each invite works once.`);
  if (Date.now() > inv.exp) throw new Error(`The invite for ${inv.name} has expired. Send a new one.`);
  return { invite: inv, dev: p.dev, ek: p.ek, deviceCode: await deviceCode(p.dev) };
}

export async function approve(profile, request, role, pos = '') {
  const { invite, dev } = request;
  if (request.restore) {
    if (!ROLES[role] || role === 'owner') throw new Error('Choose a role.');
    if (role === 'manager' && !can(profile, 'invite.manager')) throw new Error('Only the Admin can approve a manager.');
  }
  const payload = { iid: invite.iid, name: invite.name, role: request.restore ? role : invite.role, dev, iat: Date.now(), by: await myPublicKey() };
  const job = pos || (request.restore ? '' : invite.pos);
  if (job) payload.pos = job; // RRA-133
  if (profile.activation) payload.chain = profile.activation;
  // Hand over the team key for shared data, sealed so only the new phone can open it.
  const tk = await teamKeyBytes();
  if (tk && request.ek) payload.tk = await sealTo(request.ek, tk);
  // Managers also get the pay key, which opens everyone's hours and pay rates.
  const pk = await store.get('paykey');
  if (pk && request.ek && payload.role === 'manager') payload.pk = await sealTo(request.ek, new TextEncoder().encode(JSON.stringify(pk)));
  const code = await signToken('act', payload);
  await store.put(`invite:${invite.iid}`, { ...invite, role: payload.role, pos: job || invite.pos, status: 'approved', approved: Date.now(), deviceCode: request.deviceCode });
  return code;
}

// ----- Request inbox (RRA-043) -----
// The new phone seals its request to the inviter's phone and drops it in the
// shared data. Only that phone can open it; it still checks the device code.

export async function sealRequest(pending) {
  return sealTo(pending.rk, new TextEncoder().encode(pending.request));
}

export async function openRequest(box) {
  // RRA-134: a "let me back in" request is sealed to every manager and Admin phone.
  if (box && box.k) {
    const mine = box.k[await myEcdhPublic()];
    if (!mine) throw new Error('Not for this phone');
    box = mine;
  }
  const bytes = await openFrom((await store.ecdhKey()).privateKey, box);
  return new TextDecoder().decode(bytes);
}

// RRA-134: seal a "let me back in" request to each manager and Admin phone.
export async function sealToAll(pending, keys) {
  const k = {};
  for (const ek of keys) { try { k[ek] = await sealTo(ek, new TextEncoder().encode(pending.request)); } catch { /* old key */ } }
  return Object.keys(k).length ? { k } : null;
}
// The approval goes back sealed to the asking phone only.
export async function sealReply(request, code) {
  if (!request.ek) return null;
  return sealTo(request.ek, new TextEncoder().encode(code));
}
export async function openReply(box) {
  return new TextDecoder().decode(await openFrom((await store.ecdhKey()).privateKey, box));
}

// ----- Staff restore (RRA-036) -----
// A phone that lost its access asks again without an invite. Any manager or
// the Admin checks the device code with the person and approves it once.

async function readRestore(p) {
  const done = await store.get(`invite:${p.iid}`);
  if (done?.status === 'approved') throw new Error(`The request from ${p.name} was already approved. Each request works once.`);
  const exp = p.iat + INVITE_HOURS * 3600000;
  if (Date.now() > exp) throw new Error(`The request from ${p.name} has expired. Ask them to send a new one.`);
  const invite = { iid: p.iid, name: p.name, role: null, iat: p.iat, exp, restore: true };
  return { invite, dev: p.dev, ek: p.ek, restore: true, deviceCode: await deviceCode(p.dev) };
}

export async function requestRestore(name) {
  const dev = await myPublicKey();
  const ek = await exportPublic((await store.ecdhKey()).publicKey);
  const iid = `r-${randomId(9)}`;
  const req = await signToken('req', { iid, name, dev, ek, restore: true, iat: Date.now(), by: dev });
  const pending = { iid, name, role: null, restore: true, request: req, deviceCode: await deviceCode(dev) };
  await store.put('pending', pending);
  return pending;
}

// ----- Admin backup (RRA-035) -----
// The Admin's own key never leaves the phone. A backup holds a second Admin
// key instead: made for the backup, signed by this Admin phone, and sealed
// with a password. Restoring it on any phone makes that phone an Admin again,
// with no new app release. Each backup has an id that can be revoked like an invite.

const BACKUP_RE = /BLGBAK1\.([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;

export async function createHostBackup(profile, password) {
  if (profile?.role !== 'owner') throw new Error('Only the Admin can make an Admin backup.');
  const pair = await newBackupKey();
  const pub = await exportPublic(pair.publicKey);
  const bid = `host-${randomId(6)}`;
  const payload = { iid: bid, name: profile.name, role: 'owner', dev: pub, iat: Date.now(), by: await myPublicKey(), backup: true };
  if (profile.activation) payload.chain = profile.activation;
  const act = await signToken('act', payload);
  const tk = await store.get('teamkey');
  const sealed = await passwordSeal(password, { v: 1, act, priv: await exportPrivate(pair.privateKey), pub, tk: tk || null, pk: (await store.get('paykey')) || null, name: profile.name });
  await store.put(`backup:${bid}`, { bid, at: Date.now() });
  return { bid, text: `BLGBAK1.${sealed}` };
}

export const hostBackups = () => store.all('backup:');

export const isBackupText = (text) => BACKUP_RE.test(String(text || ''));

export async function restoreHostBackup(text, password) {
  const m = String(text || '').match(BACKUP_RE);
  if (!m) throw new Error("That doesn't look like an Admin backup.");
  let b;
  try { b = await passwordOpen(password, m[1]); }
  catch { throw new Error('Wrong password, or the backup is damaged.'); }
  const p = await check(b.act, 'act');
  if (p.role !== 'owner' || p.dev !== b.pub) throw new Error('This backup is not an Admin backup.');
  await store.setDeviceKey(await importKeyPair(b.priv, b.pub));
  if (b.tk) await store.put('teamkey', b.tk);
  if (b.pk) await store.put('paykey', b.pk);
  await store.del('pending');
  await store.del('owner-setup');
  const profile = { name: p.name, role: 'owner', iid: p.iid, activation: parse(b.act).raw, since: Date.now(), restored: true };
  await store.put('profile', profile);
  touch();
  return profile;
}

// ----- Team key (shared data, RRA-031) -----
// One AES key for the whole team encrypts everything stored online. The Admin
// phone makes it; each approval passes it on, sealed to the new phone.

export async function teamKeyBytes() {
  const b = await store.get('teamkey');
  return b ? b64uDec(b) : null;
}

export async function ensureTeamKey(profile) {
  if (await store.get('teamkey')) return true;
  if (profile?.role !== 'owner') return false;
  await store.put('teamkey', b64uEnc(newTeamKeyBytes()));
  return true;
}

// ----- Pay key (RRA-055) -----
// Everyone's hours and pay rates are sealed to this key in the shared data.
// The Admin phone makes it; only managers get the private half, at approval.
// Staff phones seal their own punches to its public half (settings.payPub).

export async function ensurePayKey(profile) {
  if (await store.get('paykey')) return true;
  if (profile?.role !== 'owner') return false;
  await store.put('paykey', await newPayKey());
  return true;
}
export const payKeyInfo = () => store.get('paykey');
let payPriv = null;
export async function payPrivate() {
  const k = await store.get('paykey');
  if (!k) return null;
  if (!payPriv || payPriv.pub !== k.pub) payPriv = { pub: k.pub, key: await importDhPrivate(k.priv) };
  return payPriv.key;
}
// This phone's sealing key, so a manager's fix to your hours can reach you.
export const myEcdhPublic = async () => exportPublic((await store.ecdhKey()).publicKey);

// ----- New phone side -----

export async function acceptInvite(code) {
  const p = await check(code, 'inv');
  if (Date.now() > p.exp) throw new Error('This invite has expired. Ask your manager for a new one.');
  const dev = await myPublicKey();
  const ek = await exportPublic((await store.ecdhKey()).publicKey);
  const req = await signToken('req', { iid: p.iid, name: p.name, dev, ek, iat: Date.now(), by: dev });
  const pending = { iid: p.iid, name: p.name, role: p.role, from: p.by, rk: p.rk || null, request: req, deviceCode: await deviceCode(dev) };
  await store.put('pending', pending);
  return pending;
}

export const pendingInvite = () => store.get('pending');

export async function activate(code) {
  const p = await check(code, 'act');
  const dev = await myPublicKey();
  if (p.dev !== dev) throw new Error('This activation code belongs to a different phone. Activation codes only work on the phone that asked for them.');
  if (p.tk) {
    try { await store.put('teamkey', b64uEnc(await openFrom((await store.ecdhKey()).privateKey, p.tk))); }
    catch { throw new Error('This activation was made for a different request. Ask your manager to approve your latest request.'); }
  }
  if (p.pk) {
    try { await store.put('paykey', JSON.parse(new TextDecoder().decode(await openFrom((await store.ecdhKey()).privateKey, p.pk)))); } catch { /* no pay key: time sheets show a note */ }
  }
  const profile = { name: p.name, role: p.role, iid: p.iid, activation: parse(code).raw, since: Date.now() };
  if (p.pos) profile.pos = p.pos; // RRA-133: job title from the invite or approval
  await store.put('profile', profile);
  await store.del('pending');
  touch();
  return profile;
}

// ----- Change role (RRA-066) -----
// A role change is a new activation for the same phone (same iid and device
// key) with the new role, signed by the Admin, or by a manager for Staff and
// Chef. It travels in the person's staff record; their phone checks it and
// switches role on its next sync. Making or unmaking a Manager is Admin only,
// and a new Manager gets the pay key sealed to their phone.

const signedByAdmin = (p) => ROOT_KEYS.includes(p.by) || (!!p.chain && parse(p.chain)?.payload?.role === 'owner' && parse(p.chain).payload.dev === p.by);

export function canChangeRole(profile, staff, to, mgrMayChange = true) {
  if (!profile || !staff?.dev || !staff?.iid || !ROLES[to] || to === 'owner') return false;
  if (profile.role === 'owner') return true;
  if (profile.role !== 'manager' || !mgrMayChange) return false;
  return staff.role !== 'manager' && to !== 'manager';
}

export async function makeRoleChange(profile, staff, to, mgrMayChange = true) {
  if (!canChangeRole(profile, staff, to, mgrMayChange)) throw new Error('You can\'t make that change.');
  const payload = { iid: staff.iid, name: staff.name, role: to, dev: staff.dev, iat: Date.now(), by: await myPublicKey(), change: true };
  if (profile.activation) payload.chain = profile.activation;
  const pk = await store.get('paykey');
  if (to === 'manager' && pk && staff.ek) payload.pk = await sealTo(staff.ek, new TextEncoder().encode(JSON.stringify(pk)));
  return signToken('act', payload);
}

// On the person's own phone. Returns the new profile, or null if the grant
// is not for this phone, is older than what it has, or isn't allowed.
export async function applyRoleChange(profile, code) {
  if (!profile || profile.role === 'owner' || !code) return null;
  let p;
  try { p = await check(code, 'act'); } catch { return null; }
  if (!p.change || p.dev !== await myPublicKey() || p.iid !== profile.iid) return null;
  const cur = parse(profile.activation)?.payload || {};
  if ((p.iat || 0) <= (cur.iat || 0)) return null;
  if ((p.role === 'manager' || profile.role === 'manager') && !signedByAdmin(p)) return null;
  if (p.pk) {
    try { await store.put('paykey', JSON.parse(new TextDecoder().decode(await openFrom((await store.ecdhKey()).privateKey, p.pk)))); } catch { /* no pay key: time sheets show a note */ }
  }
  if (p.role !== 'manager') await store.del('paykey'); // hours and pay leave this phone
  const next = { ...profile, name: p.name || profile.name, role: p.role, activation: parse(code).raw };
  await store.put('profile', next);
  return next;
}

// New pay key after a manager is moved down (RRA-066). The Admin phone makes
// it, seals it to each Admin device that has checked in and to each remaining
// manager (through a role grant), then seals all hours and rates again.
export async function rotatePayKey(settings) {
  const pk = await newPayKey();
  const boxes = {};
  for (const ek of Object.values(settings.adminEks || {})) {
    try { boxes[ek] = await sealTo(ek, new TextEncoder().encode(JSON.stringify(pk))); } catch { /* old entry */ }
  }
  await store.put('paykey', pk);
  return { pk, payBox: { pub: pk.pub, at: Date.now(), boxes } };
}

// Another Admin device made a new pay key: take it if it was sealed to us.
export async function adoptPayKey(payBox) {
  const ek = await myEcdhPublic();
  const box = payBox?.boxes?.[ek];
  if (!box) return false;
  try { await store.put('paykey', JSON.parse(new TextDecoder().decode(await openFrom((await store.ecdhKey()).privateKey, box)))); return true; } catch { return false; }
}

// Admin bootstrap: the first Admin key is created on the Admin's phone, then
// added to ROOT_KEYS in config.js and published.
export async function ownerSetup(name) {
  const pub = await myPublicKey();
  await store.put('owner-setup', { name, pub, at: Date.now() });
  return pub;
}

export const ownerSetupInfo = () => store.get('owner-setup');

// Who is this phone? Returns a profile, or null when it has no access.
export async function currentProfile() {
  const pub = await myPublicKey();
  if (ROOT_KEYS.includes(pub)) {
    const setup = await store.get('owner-setup');
    return { name: setup?.name || 'Admin', role: 'owner', since: setup?.at || Date.now() };
  }
  const profile = await store.get('profile');
  if (!profile) return null;
  try {
    await check(profile.activation, 'act');
  } catch {
    return null; // revoked, or the Admin key that signed it was replaced
  }
  return profile;
}

// ----- Expiry (RRA-019) -----

export function touch() {
  localStorage.setItem(LAST_USED, String(Date.now()));
}

export function isExpired() {
  const last = Number(localStorage.getItem(LAST_USED) || 0);
  return last > 0 && Date.now() - last > INACTIVITY_DAYS * DAY;
}

export async function wipeAccess() {
  await store.wipe();
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(P) && k !== P + 'seenVersion') localStorage.removeItem(k);
  }
  localStorage.setItem(P + 'expiredNotice', '1');
}
