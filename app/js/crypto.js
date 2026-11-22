// Small wrappers around the browser's Web Crypto API.
// Device keys (ECDSA P-256) and the data key (AES-GCM 256) are created
// non-extractable: the browser can use them but never hands out the secret.

const EC = { name: 'ECDSA', namedCurve: 'P-256' };
const SIG = { name: 'ECDSA', hash: 'SHA-256' };
const te = new TextEncoder();
const td = new TextDecoder();

export function b64uEnc(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDec(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const textToB64u = (t) => b64uEnc(te.encode(t));
export const b64uToText = (b) => td.decode(b64uDec(b));

export function newDeviceKey() {
  return crypto.subtle.generateKey(EC, false, ['sign', 'verify']);
}

export async function exportPublic(pub) {
  return b64uEnc(await crypto.subtle.exportKey('raw', pub));
}

export async function sign(privateKey, text) {
  return b64uEnc(await crypto.subtle.sign(SIG, privateKey, te.encode(text)));
}

export async function verify(publicB64, text, sigB64) {
  try {
    const pub = await crypto.subtle.importKey('raw', b64uDec(publicB64), EC, false, ['verify']);
    return await crypto.subtle.verify(SIG, pub, b64uDec(sigB64), te.encode(text));
  } catch {
    return false;
  }
}

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

// Short code people can read aloud to compare two phones, e.g. "K7QM-2HXA".
export async function shortCode(text) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(text)));
  let out = '';
  for (let i = 0; i < 8; i++) out += B32[h[i] % 32];
  return out.slice(0, 4) + '-' + out.slice(4);
}

export function randomId(n = 12) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return b64uEnc(b);
}

export function newDataKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(value)));
  return { iv, ct };
}

export async function unseal(key, rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.ct);
  return JSON.parse(td.decode(pt));
}

// ----- Team key hand-over (shared data, RRA-031) -----
// Each phone has an ECDH key. A manager seals the team's data key to the new
// phone's ECDH public key, so only that phone can open it, even if the
// activation text is forwarded or intercepted.

const DH = { name: 'ECDH', namedCurve: 'P-256' };

// Pay key (RRA-055): an ECDH pair whose private half is passed to managers.
export async function newPayKey() {
  const pair = await crypto.subtle.generateKey(DH, true, ['deriveKey']);
  return { priv: b64uEnc(await crypto.subtle.exportKey('pkcs8', pair.privateKey)), pub: await exportPublic(pair.publicKey) };
}
export const importDhPrivate = (b64) => crypto.subtle.importKey('pkcs8', b64uDec(b64), DH, false, ['deriveKey']);

export function newEcdhKey() {
  return crypto.subtle.generateKey(DH, false, ['deriveKey']);
}

async function sharedKey(privateKey, publicB64) {
  const pub = await crypto.subtle.importKey('raw', b64uDec(publicB64), DH, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// Returns { epk, iv, ct } that only the holder of recipientB64's private key can open.
export async function sealTo(recipientB64, bytes) {
  const eph = await crypto.subtle.generateKey(DH, true, ['deriveKey']);
  const k = await sharedKey(eph.privateKey, recipientB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, bytes);
  return { epk: await exportPublic(eph.publicKey), iv: b64uEnc(iv), ct: b64uEnc(ct) };
}

export async function openFrom(privateKey, box) {
  const k = await sharedKey(privateKey, box.epk);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uDec(box.iv) }, k, b64uDec(box.ct)));
}

export const newTeamKeyBytes = () => crypto.getRandomValues(new Uint8Array(32));
export const importTeamKey = (bytes) => crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

// ----- Admin backup (RRA-035) -----
// A backup key is made extractable once, so it can be written into a
// password-protected backup. On restore it is imported non-extractable again.

export function newBackupKey() {
  return crypto.subtle.generateKey(EC, true, ['sign', 'verify']);
}

export async function exportPrivate(priv) {
  return b64uEnc(await crypto.subtle.exportKey('pkcs8', priv));
}

export async function importKeyPair(privB64, pubB64) {
  const privateKey = await crypto.subtle.importKey('pkcs8', b64uDec(privB64), EC, false, ['sign']);
  const publicKey = await crypto.subtle.importKey('raw', b64uDec(pubB64), EC, true, ['verify']);
  return { privateKey, publicKey };
}

const PBKDF2_ROUNDS = 310000;

async function passwordKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ROUNDS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function passwordSeal(password, value) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await passwordKey(password, salt), te.encode(JSON.stringify(value)));
  return `${b64uEnc(salt)}.${b64uEnc(iv)}.${b64uEnc(ct)}`;
}

export async function passwordOpen(password, text) {
  const [salt, iv, ct] = text.split('.').map(b64uDec);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await passwordKey(password, salt), ct);
  return JSON.parse(td.decode(pt));
}
