// Coupons (RRA-122): the Coupons screen (make and send coupons), the coupon
// picture (Gaylan's framed design, 2026-11-24), and the scanner the POS opens
// to put a coupon on a check. The rules live in coupons-core.js.
//
// The picture: double black border, the restaurant's name letter-spaced on
// top, the QR code (or a Code 128 barcode) in the middle, the offer printed
// underneath in plain words, and the tagline at the bottom. The code itself
// holds only "<tag>:<code>", so it stays small and easy to scan; the offer is
// looked up when it's scanned. Names come from js/brand.js (coupon).
//
// Scanning: the phone's own reader (BarcodeDetector) when it has one, and
// ZXing (vendor/zxing, loaded only when needed) otherwise, which is the
// iPhone case. Typing the code always works too.

import * as data from './data.js';
import { $, $$, esc, view, sheet, toast, setTitle, setChrome } from './ui.js';
import { canSee, canChange } from './perms.js';
import { BRAND } from './config.js';
import { TYPES, DAYS, TAGS, tagOf, cleanCode, newSuffix, payload, headline, finePrint, canApply, canApplyStanding, usesOf } from './coupons-core.js';

const C = () => ({ title: BRAND.shortName, tagline: '', ...(BRAND.coupon || {}) });
const lock = (m) => `<div class="empty">🔒 ${esc(m)}<br><span class="small">The Admin sets this in Settings → Roles and permissions.</span></div>`;
const money = (n) => '$' + (+n || 0).toFixed(2);
const todayIso = () => data.today();

// ------------------------------------------------------------------ ZXing

let zx = null;
export function loadZXing() {
  if (globalThis.ZXing) return Promise.resolve(globalThis.ZXing);
  zx ||= new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/zxing/zxing.min.js', import.meta.url).href; // shared app: next to app/js
    s.onload = () => (globalThis.ZXing ? ok(globalThis.ZXing) : no(new Error('ZXing did not load')));
    s.onerror = () => { zx = null; no(new Error("Couldn't load the code reader")); };
    document.head.append(s);
  });
  return zx;
}

// QR code as rows of dark/light modules.
async function qrModules(text) {
  const Z = await loadZXing();
  const hints = new Map([[Z.EncodeHintType.ERROR_CORRECTION, 'M'], [Z.EncodeHintType.MARGIN, 0]]);
  const m = new Z.QRCodeWriter().encode(text, Z.BarcodeFormat.QR_CODE, 0, 0, hints);
  const n = m.getWidth();
  return { n, get: (x, y) => m.get(x, y) };
}

// Code 128 (set B) as a list of bar widths, from ZXing's own bar table.
async function code128Bars(text) {
  const Z = await loadZXing();
  const P = Z.Code128Reader.CODE_PATTERNS;
  const chars = [...text].map((ch) => ch.charCodeAt(0) - 32);
  if (chars.some((v) => v < 0 || v > 95)) throw new Error('Barcode can only hold plain letters and numbers');
  const vals = [104, ...chars]; // 104 = start in set B
  const check = vals.reduce((t, v, i) => t + v * (i || 1), 0) % 103;
  return [...vals, check, 106].flatMap((v) => Array.from(P[v]));
}

// ------------------------------------------------------------------ the picture

const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, Menlo, "Courier New", monospace';

function spaced(ctx, text, cx, y, gap) {
  const chars = [...text];
  const w = chars.reduce((t, ch) => t + ctx.measureText(ch).width, 0) + gap * (chars.length - 1);
  let x = cx - w / 2;
  for (const ch of chars) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + gap; }
  return w;
}
function fit(ctx, text, font, size, max, weight = '') {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${font}`; } while (ctx.measureText(text).width > max && --s > 12);
  return s;
}
function wrap(ctx, text, max) {
  const words = String(text).split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}

// → <canvas> with the finished coupon. kind: 'qr' or 'bar'.
export async function drawCoupon(cp, code, kind = 'qr') {
  const W = 620, inner = W - 100, brand = C();
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  // Lay out first (fonts must be set to measure), then draw.
  ctx.font = `600 34px ${FONT}`;
  const head = headline(cp);
  const fine = [];
  ctx.font = `22px ${FONT}`;
  for (const line of finePrint(cp)) fine.push(...wrap(ctx, line, inner));
  const codeBox = kind === 'bar' ? 170 : 380;
  const H = 30 + 74 + codeBox + 26 + 48 + fine.length * 32 + 44 + 26 + (brand.tagline ? 74 : 10) + 30;
  cv.width = W; cv.height = H;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
  ctx.lineWidth = 8; ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.lineWidth = 3; ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.textBaseline = 'alphabetic';
  // Name across the top, letter-spaced.
  let y = 30 + 62;
  const title = String(brand.title || '');
  let ts = 52;
  do { ctx.font = `${ts}px ${FONT}`; } while (spacedWidth(ctx, title, ts * 0.32) > inner && --ts > 18);
  spaced(ctx, title, W / 2, y, ts * 0.32);
  y += 12;
  // The code, with its white margin kept inside the border.
  const text = payload(code);
  if (kind === 'bar') {
    const bars = await code128Bars(text);
    const modules = bars.reduce((t, b) => t + +b, 0);
    const mw = Math.max(1, Math.floor(inner / modules));
    let x = (W - modules * mw) / 2;
    bars.forEach((b, i) => { if (i % 2 === 0) ctx.fillRect(x, y + 20, +b * mw, codeBox - 40); x += +b * mw; });
  } else {
    const q = await qrModules(text);
    const size = codeBox - 30, cell = Math.floor(size / q.n), x0 = (W - cell * q.n) / 2, y0 = y + (codeBox - cell * q.n) / 2;
    for (let yy = 0; yy < q.n; yy++) for (let xx = 0; xx < q.n; xx++) if (q.get(xx, yy)) ctx.fillRect(x0 + xx * cell, y0 + yy * cell, cell, cell);
  }
  y += codeBox + 26;
  // The offer in plain words.
  ctx.textAlign = 'center';
  fit(ctx, head, FONT, 36, inner, '700');
  ctx.fillText(head, W / 2, y + 12); y += 48;
  ctx.font = `22px ${FONT}`;
  for (const line of fine) { ctx.fillText(line, W / 2, y + 6); y += 32; }
  fit(ctx, `Code ${code}`, MONO, 24, inner);
  ctx.fillText(`Code ${code}`, W / 2, y + 10); y += 44;
  if (brand.tagline) {
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke();
    fit(ctx, brand.tagline, FONT, 44, inner);
    ctx.fillText(brand.tagline, W / 2, y + 56);
  }
  ctx.textAlign = 'start';
  return cv;
}
function spacedWidth(ctx, text, gap) { const c = [...text]; return c.reduce((t, ch) => t + ctx.measureText(ch).width, 0) + gap * (c.length - 1); }

const toFile = (cv, name) => new Promise((ok) => cv.toBlob((b) => ok(new File([b], name, { type: 'image/png' })), 'image/png'));

// Send, save or print: the share sheet on iPhone has Messages, Mail, Print and
// Save Image. Where sharing files isn't possible, the pictures download.
async function sendPictures(files, title) {
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  toast(files.length > 1 ? `${files.length} coupon pictures saved` : 'Coupon picture saved');
}

// ------------------------------------------------------------------ Coupons screen

const status = (cp, checks) => {
  const t = todayIso(), used = usesOf(cp, checks);
  if (cp.paused) return ['Paused', 'gray'];
  if (cp.end && t > cp.end) return ['Expired', 'gray'];
  if (cp.start && t < cp.start) return ['Starts later', 'blue'];
  if (+cp.maxUses > 0 && used >= +cp.maxUses) return ['All used', 'gray'];
  return ['Active', 'green'];
};

export async function couponsView() {
  setChrome({ tab: 'more', back: true });
  if (!canSee('coupons')) { setTitle('Coupons'); view.innerHTML = lock('Coupons are for managers and the Admin.'); return; }
  setTitle('Coupons', canChange('coupons') ? '<a class="btn plain small" href="#/coupon/new">+ New</a>' : '');
  const [list, checks] = await Promise.all([data.list('coupon'), data.list('check')]);
  list.sort((a, b) => (a.paused - b.paused) || String(a.code).localeCompare(b.code));
  view.innerHTML = `
    ${list.length ? `<div class="group">${list.map((cp) => { const [s, col] = status(cp, checks); const used = usesOf(cp, checks); return `
      <a class="row nav" href="#/coupon/${cp.id}"><span class="grow"><span class="title">${tagOf(cp) ? tagOf(cp).icon : '🎟'} ${esc(cp.code)} <span class="chip c-${col}">${s}</span></span>
      <span class="sub">${esc(headline(cp))} · used ${used}${+cp.maxUses > 0 ? ` of ${cp.maxUses}` : ''}${cp.end ? ` · ends ${esc(cp.end)}` : ''}</span></span></a>`; }).join('')}</div>`
    : `<div class="empty">No coupons yet.${canChange('coupons') ? '<br><a class="btn" href="#/coupon/new" style="margin-top:10px">Make a coupon</a>' : ''}</div>`}
    ${canChange('coupons') ? `<div class="section-label">Standing discounts</div><div class="group">${Object.entries(TAGS).map(([k, t]) => {
      const have = list.find((cp) => cp.tag === k);
      return have ? '' : `<a class="row nav" href="#/coupon/new-${k}"><span class="grow"><span class="title">${t.icon} Add a ${esc(t.label.toLowerCase())} discount</span><span class="sub">Every visit with ${esc(t.id)}, no coupon needed</span></span></a>`; }).join('') || '<div class="row muted small">All set up. Edit them above.</div>'}</div>` : ''}
    <div class="section-label">How coupons work</div>
    <div class="group"><div class="row"><span class="grow"><span class="sub" style="white-space:normal">
      Make a coupon here, then send it as a picture: a QR code or a barcode with the offer printed under it, ready to text, email, print or post.
      At the table, the server taps <b>Add a coupon</b> on the check and scans it with the phone camera, or types the code.
      The app checks the dates, days, hours, minimum and how many times it's been used, then takes the discount off before tax.
      Standing discounts (military / veteran, first responder, senior) need no coupon: the server taps <b>Discounts</b> on the check and confirms they saw the guest's ID.
      The code only holds a number; the offer is looked up here, so a home-made code can't give itself a bigger discount, and another restaurant's app won't take ours.
    </span></span></div></div>`;
}

const BLANK = { code: '', type: 'pct', value: 10, food: true, min: '', start: '', end: '', days: [0, 1, 2, 3, 4, 5, 6], from: '', to: '', stack: false, maxUses: '', unique: false, fine: '', menuId: '', itemName: '', codes: [], paused: false };

async function dishes() {
  return (await data.list('recipe')).filter((r) => r.kind === 'dish' && +r.price > 0).sort((a, b) => a.name.localeCompare(b.name));
}

export async function couponView(id) {
  setChrome({ tab: 'more', back: true });
  if (!canSee('coupons')) { setTitle('Coupon'); view.innerHTML = lock('Coupons are for managers and the Admin.'); return; }
  const edit = canChange('coupons');
  const preTag = /^new-(\w+)$/.exec(id || '')?.[1];
  const isNew = id === 'new' || !!TAGS[preTag];
  const saved = isNew ? null : await data.get('coupon', id);
  if (!isNew && !saved) { location.replace('#/coupons'); return; }
  if (isNew && !edit) { location.replace('#/coupons'); return; }
  const cp = { ...BLANK, ...(saved || {}) };
  if (isNew && TAGS[preTag]) Object.assign(cp, { tag: preTag, code: TAGS[preTag].code, value: 10 });
  const [menu, checks, all] = await Promise.all([dishes(), data.list('check'), data.list('coupon')]);
  setTitle(isNew ? 'New coupon' : cp.code);
  let kind = couponView.kind || 'qr';
  const used = saved ? usesOf(saved, checks) : 0;
  const usedCodes = new Set(checks.flatMap((k) => k.coupons || []).filter((k) => k.couponId === cp.id && k.code.includes('-')).map((k) => k.code));
  const dis = edit ? '' : 'disabled';
  view.innerHTML = `
    ${saved ? `<div class="card cpn-preview"><div class="segmented" id="kind"><button type="button" data-k="qr" class="${kind === 'qr' ? 'on' : ''}">QR code</button><button type="button" data-k="bar" class="${kind === 'bar' ? 'on' : ''}">Barcode</button></div>
      <div id="pic" class="cpn-pic"><p class="muted small center">Drawing the coupon…</p></div>
      <div class="btn-row" style="margin-top:10px">
        ${cp.unique ? '' : '<button class="btn" id="send" type="button">Send, save or print</button>'}
        ${cp.unique && edit ? '<button class="btn" id="make" type="button">Make one-time coupons</button>' : ''}
      </div>
      <p class="muted small" style="margin-bottom:0">Used ${used}${+cp.maxUses > 0 ? ` of ${cp.maxUses}` : ''} time${used === 1 ? '' : 's'}${cp.unique ? ` · ${(cp.codes || []).length} one-time code${(cp.codes || []).length === 1 ? '' : 's'} made, ${usedCodes.size} used` : ''}.</p></div>` : ''}
    <div class="section-label">The offer</div>
    <div class="group pad">
      <label class="field"><span>Kind</span><select id="c-tag" ${dis}><option value="">Coupon (scan or type a code)</option>${Object.entries(TAGS).map(([k, t]) => `<option value="${k}" ${cp.tag === k ? 'selected' : ''}>${t.icon} ${esc(t.label)} discount (every visit, show ID)</option>`).join('')}</select></label>
      <label class="field"><span>Code (what's typed at the register)</span><input type="text" id="c-code" value="${esc(cp.code)}" placeholder="e.g. WINGS20" autocapitalize="characters" autocomplete="off" maxlength="16" ${dis}></label>
      <div class="segmented" id="c-type">${Object.entries(TYPES).map(([k, v]) => `<button type="button" data-t="${k}" class="${cp.type === k ? 'on' : ''}" ${dis}>${esc(v.replace('Buy one, get one free', 'BOGO'))}</button>`).join('')}</div>
      <label class="field" id="f-val"><span id="l-val">${cp.type === 'off' ? 'Dollars off' : 'Percent off'}</span><input type="number" inputmode="decimal" id="c-val" value="${esc(cp.value)}" min="0" step="0.01" ${dis}></label>
      <label class="field" id="f-dish"><span>Which dish</span><select id="c-dish" ${dis}><option value="">Pick a dish…</option>${menu.map((d) => `<option value="${d.id}" ${d.id === cp.menuId ? 'selected' : ''}>${esc(d.name)} (${money(d.price)})</option>`).join('')}</select></label>
      <div class="row" id="f-food"><span class="grow"><span class="title">Food only</span><span class="sub">Leave drinks off the discount (alcohol rules)</span></span><button class="toggle ${cp.food ? 'on' : ''}" id="c-food" type="button" aria-label="Food only" ${dis}></button></div>
      <label class="field"><span>Minimum purchase ($, optional)</span><input type="number" inputmode="decimal" id="c-min" value="${esc(cp.min)}" min="0" step="0.01" placeholder="None" ${dis}></label>
    </div>
    <div class="section-label">When it works</div>
    <div class="group pad">
      <div class="btn-row"><label class="field" style="margin:0"><span>Starts</span><input type="date" id="c-start" value="${esc(cp.start)}" ${dis}></label>
      <label class="field" style="margin:0"><span>Expires</span><input type="date" id="c-end" value="${esc(cp.end)}" ${dis}></label></div>
      <div class="pr-lab" style="margin-top:12px">Days</div>
      <div class="segmented" id="c-days">${DAYS.map((d, i) => `<button type="button" data-d="${i}" class="${cp.days.includes(i) ? 'on' : ''}" ${dis}>${d}</button>`).join('')}</div>
      <div class="btn-row"><label class="field" style="margin:0"><span>From (optional)</span><input type="time" id="c-from" value="${esc(cp.from)}" ${dis}></label>
      <label class="field" style="margin:0"><span>Until</span><input type="time" id="c-to" value="${esc(cp.to)}" ${dis}></label></div>
    </div>
    <div class="section-label">Limits</div>
    <div class="group pad">
      <label class="field"><span>Total uses allowed (blank = no limit)</span><input type="number" inputmode="numeric" id="c-max" value="${esc(cp.maxUses)}" min="0" step="1" placeholder="No limit" ${dis}></label>
      <div class="row" id="f-unique"><span class="grow"><span class="title">One-time codes</span><span class="sub" style="white-space:normal">Each guest gets their own code (${esc(cp.code || 'CODE')}-XXXXXX) that works once, so a screenshot can't be passed around</span></span><button class="toggle ${cp.unique ? 'on' : ''}" id="c-unique" type="button" aria-label="One-time codes" ${dis}></button></div>
      <div class="row"><span class="grow"><span class="title">Can be combined</span><span class="sub">With another coupon that can also be combined</span></span><button class="toggle ${cp.stack ? 'on' : ''}" id="c-stack" type="button" aria-label="Can be combined" ${dis}></button></div>
      <label class="field"><span>Extra fine print (optional)</span><input type="text" id="c-fine" value="${esc(cp.fine)}" placeholder="e.g. Dine-in only" maxlength="60" ${dis}></label>
      ${saved ? `<div class="row"><span class="grow"><span class="title">Paused</span><span class="sub">Turn it off for now without deleting it</span></span><button class="toggle ${cp.paused ? 'on' : ''}" id="c-paused" type="button" aria-label="Paused" ${dis}></button></div>` : ''}
    </div>
    ${edit ? `<button class="btn block" id="save" type="button">${isNew ? 'Save coupon' : 'Save changes'}</button>
    ${saved ? '<button class="btn plain block danger" id="del" type="button" style="margin-top:8px">Delete coupon</button>' : ''}` : ''}
    <p class="muted small">Changes apply to coupons scanned from now on. Checks that already have this coupon keep the offer they were rung up with.</p>`;

  const show = () => {
    const t = $('#c-type .on')?.dataset.t || cp.type;
    $('#f-val').hidden = !(t === 'pct' || t === 'off');
    $('#l-val').textContent = t === 'off' ? 'Dollars off' : 'Percent off';
    $('#f-dish').hidden = !(t === 'free' || t === 'bogo');
    $('#f-food').hidden = !(t === 'pct' || t === 'off');
    $('#f-unique').hidden = !!$('#c-tag').value; // a standing discount works every visit
  };
  show();
  $$('#c-type [data-t]').forEach((b) => b.onclick = () => { $$('#c-type button').forEach((x) => x.classList.toggle('on', x === b)); show(); });
  $$('#c-days [data-d]').forEach((b) => b.onclick = () => b.classList.toggle('on'));
  $$('.toggle').forEach((b) => b.onclick = () => b.classList.toggle('on'));
  $('#c-tag').onchange = () => {
    const t = TAGS[$('#c-tag').value];
    if (t && !$('#c-code').value) $('#c-code').value = t.code;
    if (t) $('#c-unique').classList.remove('on');
    show();
  };
  $('#c-code').oninput = (e) => { const v = cleanCode(e.target.value).replace(/-/g, ''); if (v !== e.target.value) e.target.value = v; };

  const read = () => {
    const t = $('#c-type .on').dataset.t;
    const dish = menu.find((d) => d.id === $('#c-dish').value);
    return {
      ...cp, code: cleanCode($('#c-code').value).replace(/-/g, ''), type: t, tag: $('#c-tag').value,
      value: t === 'pct' || t === 'off' ? +$('#c-val').value || 0 : 0,
      menuId: t === 'free' || t === 'bogo' ? dish?.id || '' : '', itemName: t === 'free' || t === 'bogo' ? dish?.name || '' : '',
      food: t === 'pct' || t === 'off' ? $('#c-food').classList.contains('on') : true,
      min: $('#c-min').value === '' ? '' : +$('#c-min').value,
      start: $('#c-start').value, end: $('#c-end').value,
      days: $$('#c-days .on').map((b) => +b.dataset.d),
      from: $('#c-from').value, to: $('#c-to').value,
      maxUses: $('#c-max').value === '' ? '' : Math.max(0, Math.round(+$('#c-max').value)),
      unique: !$('#c-tag').value && $('#c-unique').classList.contains('on'), stack: $('#c-stack').classList.contains('on'),
      fine: $('#c-fine').value.trim(), paused: $('#c-paused')?.classList.contains('on') || false,
    };
  };
  const problem = (x) => {
    if (x.code.length < 3) return 'Give it a code of at least 3 letters or numbers, e.g. WINGS20.';
    if (all.some((o) => o.id !== x.id && cleanCode(o.code) === x.code)) return `There's already a coupon called ${x.code}.`;
    if ((x.type === 'pct' || x.type === 'off') && !(x.value > 0)) return 'How much off?';
    if (x.type === 'pct' && x.value > 100) return 'Percent off can be 100 at most.';
    if ((x.type === 'free' || x.type === 'bogo') && !x.menuId) return 'Pick the dish.';
    if (!x.days.length) return 'Pick at least one day.';
    if (x.tag && all.some((o) => o.id !== x.id && o.tag === x.tag && !o.paused)) return `There's already a ${TAGS[x.tag].label.toLowerCase()} discount. Edit that one, or pause it first.`;
    if ((x.from && !x.to) || (!x.from && x.to)) return 'Set both From and Until, or neither.';
    if (x.start && x.end && x.end < x.start) return 'It expires before it starts.';
    return '';
  };
  $('#save')?.addEventListener('click', async () => {
    const x = read(), p = problem(x);
    if (p) { toast(p); return; }
    const doc = await data.put('coupon', x);
    toast(isNew ? 'Coupon saved. Now send it.' : 'Saved');
    location.replace('#/coupon/' + doc.id);
    if (!isNew) couponView(doc.id);
  });
  $('#del')?.addEventListener('click', async () => {
    const ok = await sheet({ title: 'Delete coupon?', right: 'Delete', body: `<p>Delete <b>${esc(cp.code)}</b>? Coupons already sent out will stop working. Checks it was used on keep their discount.</p>` });
    if (!ok) return;
    await data.remove('coupon', cp.id); toast('Coupon deleted'); location.replace('#/coupons');
  });

  if (!saved) return;
  // The picture: a sample one-time code when the coupon uses them.
  const sampleCode = cp.unique ? `${cp.code}-${(cp.codes || [])[0] || 'SAMPLE'}` : cp.code;
  const draw = async () => {
    try {
      const cv = await drawCoupon(saved, sampleCode, kind);
      const img = new Image(); img.src = cv.toDataURL('image/png'); img.alt = `Coupon ${sampleCode}`;
      $('#pic').replaceChildren(img);
      if (cp.unique) $('#pic').insertAdjacentHTML('beforeend', '<p class="muted small center" style="margin:6px 0 0">Sample. Each one-time coupon gets its own code.</p>');
    } catch (e) { $('#pic').innerHTML = `<p class="muted small">Couldn't draw the coupon: ${esc(e.message)}</p>`; }
  };
  draw();
  $$('#kind [data-k]').forEach((b) => b.onclick = () => { kind = couponView.kind = b.dataset.k; $$('#kind button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  $('#send')?.addEventListener('click', async () => {
    const cv = await drawCoupon(saved, cp.code, kind);
    await sendPictures([await toFile(cv, `${cp.code}-${kind === 'bar' ? 'barcode' : 'qr'}.png`)], `${C().title} coupon`);
  });
  $('#make')?.addEventListener('click', async () => {
    const n = await sheet({
      title: 'One-time coupons', left: 'Cancel',
      body: `<p class="muted small">Each picture gets its own code that works once. Send them one per guest.</p><div class="num-pick" data-pick="n">${[1, 5, 10, 20, 25].map((v) => `<button type="button" data-v="${v}">${v}</button>`).join('')}</div>`,
      onMount(api) { $$('[data-pick="n"] button', api.el).forEach((b) => b.onclick = () => api.close(+b.dataset.v)); },
    });
    if (!n) return;
    const fresh = await data.get('coupon', cp.id);
    const have = new Set(fresh.codes || []), made = [];
    while (made.length < n) { const s = newSuffix(); if (!have.has(s)) { have.add(s); made.push(s); } }
    await data.put('coupon', { ...fresh, codes: [...(fresh.codes || []), ...made] });
    toast(`Drawing ${n} coupon${n > 1 ? 's' : ''}…`);
    const files = [];
    for (const s of made) files.push(await toFile(await drawCoupon(fresh, `${fresh.code}-${s}`, kind), `${fresh.code}-${s}.png`));
    await sendPictures(files, `${C().title} coupons`);
    couponView(cp.id);
  });
}

// ------------------------------------------------------------------ scanning at the POS

// Opens over a check: camera + "type the code". Resolves true when a coupon went on.
export async function couponSheet(checkId) {
  let stop = () => {};
  const result = await sheet({
    title: 'Add a coupon', left: 'Cancel',
    body: `<div class="cpn-cam"><video id="cv" playsinline muted autoplay></video><div class="cpn-aim" aria-hidden="true"></div><p id="cmsg" class="cpn-msg">Starting the camera…</p></div>
      <label class="field" style="margin-top:12px"><span>Or type the code</span><input type="text" id="ctyped" placeholder="e.g. WINGS20" autocapitalize="characters" autocomplete="off" inputmode="text"></label>
      <button class="btn block" id="capply" type="button">Apply</button>
      <p id="cerr" class="cpn-err" role="alert"></p>`,
    onMount(api) {
      const el = api.el, msg = (t) => { const m = $('#cmsg', el); if (m) m.textContent = t; };
      let busy = false;
      const tryCode = async (text, scanned) => {
        if (busy) return; busy = true;
        const [coupons, checks, check] = await Promise.all([data.list('coupon'), data.list('check'), data.get('check', checkId)]);
        const r = canApply({ coupons, checks, check, text });
        if (r.error) {
          $('#cerr', el).textContent = r.error;
          if (navigator.vibrate) navigator.vibrate(120);
          setTimeout(() => { busy = false; }, scanned ? 1800 : 0); // don't re-read the same bad code at once
          return;
        }
        if (tagOf(r.line)) { api.close({ needId: r.line }); return; } // a veteran card etc.: confirm the ID first
        await applyLine(checkId, r.line);
        api.close(true);
      };
      $('#capply', el).onclick = () => { const v = $('#ctyped', el).value.trim(); if (v) tryCode(v, false); else $('#ctyped', el).focus(); };
      $('#ctyped', el).onkeydown = (e) => { if (e.key === 'Enter') $('#capply', el).click(); };
      startScanner($('#cv', el), (text) => tryCode(text, true), msg).then((s) => { stop = s; });
    },
  });
  stop();
  if (result?.needId) return (await sawId(result.needId)) && applyLine(checkId, result.needId);
  return !!result;
}

async function applyLine(checkId, line) {
  const check = await data.get('check', checkId);
  await data.put('check', { ...check, coupons: [...(check.coupons || []), line] });
  toast(`${tagOf(line) ? tagOf(line).icon : '🎟'} ${headline(line)}`);
  return true;
}

// The server confirms they saw the guest's ID (RRA-128).
function sawId(line) {
  const t = tagOf(line);
  return sheet({ title: `${t.label} discount`, left: 'Cancel', right: 'Yes, add it', body: `<p style="font-size:1.1rem"><b>Did you see the guest's ${esc(t.id)}?</b></p><p class="muted">${esc(headline(line))}. The check will show it as a ${esc(t.label.toLowerCase())} discount.</p>` });
}

// Discounts on a check (RRA-128): the standing discounts, no code needed.
export async function discountsSheet(checkId) {
  const [coupons, checks, check] = await Promise.all([data.list('coupon'), data.list('check'), data.get('check', checkId)]);
  const list = coupons.filter((cp) => tagOf(cp));
  const rows = list.map((cp) => ({ cp, r: canApplyStanding({ coupon: cp, checks, check }) }));
  const pick = await sheet({
    title: 'Discounts', left: 'Cancel',
    body: `${rows.map(({ cp, r }, i) => `<button type="button" class="row nav cpn-disc" data-i="${i}" ${r.ok ? '' : 'disabled'}><span class="grow"><span class="title">${tagOf(cp).icon} ${esc(tagOf(cp).label)}</span><span class="sub" style="white-space:normal">${esc(r.ok ? headline(cp).split(': ')[1] : r.error)}</span></span></button>`).join('') || '<p class="muted">No standing discounts yet. A manager adds them under More → Coupons.</p>'}`,
    onMount(api) { $$('[data-i]', api.el).forEach((b) => b.onclick = () => api.close(rows[+b.dataset.i])); },
  });
  if (!pick?.r.ok) return false;
  if (!(await sawId(pick.r.line))) return false;
  return applyLine(checkId, pick.r.line);
}

// Reads one picture (a video frame or a canvas). The area inside the aiming
// box is tried first: it holds just the code, so the coupon's frame lines
// can't confuse the barcode reader, and it's quicker. Then the whole picture.
export async function readFrame(src, w, h) {
  const Z = await loadZXing();
  const reader = readFrame.r ||= new Z.MultiFormatReader();
  readFrame.hints ||= new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.CODE_128]]]);
  const cv = readFrame.cv ||= document.createElement('canvas');
  const scale = Math.min(1, 900 / w);
  const tries = [[0.2, 0.15, 0.6, 0.7], [0, 0, 1, 1]]; // x, y, width, height as parts of the picture
  for (const [x, y, ww, hh] of tries) {
    cv.width = Math.round(w * ww * scale); cv.height = Math.round(h * hh * scale);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, w * x, h * y, w * ww, h * hh, 0, 0, cv.width, cv.height);
    try {
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)));
      return reader.decode(bmp, readFrame.hints).getText();
    } catch {}
  }
  return null;
}

// Camera → onCode(text). Returns a stop function.
async function startScanner(video, onCode, msg) {
  let stream = null, timer = 0, stopped = false, busy = false;
  const stop = () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  if (!navigator.mediaDevices?.getUserMedia) { msg('No camera here. Type the code below.'); return stop; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    if (stopped) { stop(); return stop; }
    video.srcObject = stream;
    await video.play().catch(() => {});
  } catch (e) {
    msg(e?.name === 'NotAllowedError' ? 'Camera is blocked. Allow it in Settings, or type the code below.' : 'Camera not available. Type the code below.');
    return stop;
  }
  // The phone's own reader when it has one (Android, some computers); ZXing
  // otherwise, which is the iPhone case. Both read QR codes and barcodes.
  let native = null;
  if ('BarcodeDetector' in globalThis) {
    try { const f = await BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) native = new BarcodeDetector({ formats: ['qr_code', 'code_128'].filter((x) => f.includes(x)) }); } catch {}
  }
  if (!native) { try { await loadZXing(); } catch { msg("The code reader didn't load. Type the code below."); return stop; } }
  msg('Fill the box with the QR code or barcode');
  timer = setInterval(async () => {
    if (stopped || busy || video.readyState < 2 || !video.videoWidth) return;
    busy = true;
    try {
      let text = null;
      if (native) { const hits = await native.detect(video); text = hits[0]?.rawValue || null; }
      if (!text && !native) text = await readFrame(video, video.videoWidth, video.videoHeight);
      if (text && !stopped) onCode(text);
    } catch {} finally { busy = false; }
  }, 250);
  return stop;
}
