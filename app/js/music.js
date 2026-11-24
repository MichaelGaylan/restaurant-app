// Music (RRA-109): background music for the restaurant, built into the app.
//   My music: MP3s from a USB drive or this computer (pick a folder or songs),
//             with play, pause, skip, shuffle and volume.
//   Radio:    a radio dial with an AM/FM switch and presets (RRA-126), and
//             internet streams of AM/FM and online stations. The built-in list
//             lives in js/brand.js (BRAND.radio); Find a station searches the
//             free Radio Browser directory (radio-browser.info).
// Music keeps playing while you move around the app; a small player shows at
// the bottom. Nothing is uploaded: the songs stay on this device.

import { $, $$, esc, view, LS, setTitle, setChrome, toast, isIOS, sheet, session } from './ui.js';
import { BRAND } from './config.js';
import * as data from './data.js';
import { isHost } from './perms.js';

const audio = new Audio();
audio.preload = 'auto';
let tracks = [];          // { name, url }
let order = [];           // play order (indexes into tracks)
let pos = -1;             // place in order
let station = null;       // { name, url } while the radio plays
let shuffle = LS.get('musicShuffle', false);
let status = '';          // what the player is doing, shown under the title
let tries = [];           // backup addresses left to try for this station
audio.volume = LS.get('musicVol', 0.8);

const isAudio = (f) => /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name) || /^audio\//.test(f.type);
const nice = (n) => n.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
const current = () => (station ? station : tracks[order[pos]] || null);

function makeOrder(start = 0) {
  order = tracks.map((_, i) => i);
  if (shuffle) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const k = order.indexOf(start); if (k > 0) [order[0], order[k]] = [order[k], order[0]];
    pos = 0;
  } else pos = start;
}

// Plays what's loaded. A station that won't play tries its backup addresses
// (BRAND.radio alts) before giving up; the reason shows on the player.
async function play() {
  status = station ? 'Connecting…' : '';
  refresh();
  try { await audio.play(); status = ''; } catch (e) {
    // A file or stream that can't load also fires the error event, which
    // handles it (and tries a station's backups); only a blocked start lands here.
    if (e.name === 'NotAllowedError') { audio.pause(); status = 'The browser blocked the sound. Tap ▶ to start it.'; }
  }
  refresh();
}
let lastFail = '';
function failed(why) {
  if (audio.src && audio.src === lastFail) return; // the error event and play() both report the same failure
  lastFail = audio.src;
  if (station && tries.length) { audio.src = tries.shift(); play(); return; }
  audio.pause();
  status = why || (station ? 'This station isn’t playing right now. Try another one.' : 'This file won’t play. MP3 and M4A files work best.');
  toast(status);
  refresh();
}
function playTrack(i) {
  station = null; tries = []; lastFail = '';
  if (!order.length || order[pos] !== i) makeOrder(i);
  if (order[pos] !== i) pos = order.indexOf(i);
  audio.src = tracks[i].url;
  play();
}
function playStation(s) {
  station = s;
  tries = [...(s.alts || [])]; lastFail = '';
  audio.src = s.url;
  play();
}
function next(d = 1) {
  if (station || !tracks.length) return;
  pos = (pos + d + order.length) % order.length;
  audio.src = tracks[order[pos]].url;
  play();
}
function toggle() {
  if (!audio.src) { if (tracks.length) playTrack(0); return; }
  if (audio.paused) play(); else { audio.pause(); refresh(); }
}
audio.addEventListener('ended', () => next(1));
audio.addEventListener('play', () => refresh());
audio.addEventListener('pause', () => refresh());
audio.addEventListener('playing', () => { if (status) { status = ''; refresh(); } });
audio.addEventListener('error', () => { if (audio.getAttribute('src')) failed(); });

// Test sound: a short beep straight from this device, to check the speaker
// and volume apart from any song or station.
function testSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 660; g.gain.value = 0.25;
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.6);
    o.onended = () => ctx.close();
    toast(isIOS ? 'Beep! No beep? Turn off Silent mode and turn the volume up.' : 'Beep! No beep? Check the volume and that speakers are connected.');
  } catch { toast('This browser can’t play a test sound.'); }
}

function addFiles(list) {
  const files = [...list].filter(isAudio).sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
  if (!files.length) { toast('No MP3 files found there'); return; }
  const had = new Set(tracks.map((t) => t.key));
  for (const f of files) {
    const key = (f.webkitRelativePath || f.name) + f.size;
    if (had.has(key)) continue;
    tracks.push({ key, name: nice(f.name), folder: (f.webkitRelativePath || '').split('/').slice(0, -1).join(' / '), url: URL.createObjectURL(f) });
  }
  makeOrder(order[pos] ?? 0);
  toast(`${files.length} song${files.length === 1 ? '' : 's'} added`);
  musicView();
}
function clearSongs() {
  if (!station) { audio.pause(); audio.removeAttribute('src'); }
  for (const t of tracks) URL.revokeObjectURL(t.url);
  tracks = []; order = []; pos = -1;
  musicView();
}

// ---------------------------------------------------------- the screen
const myStations = () => LS.get('radioMine', []);
const saveStations = (l) => LS.set('radioMine', l);

export function musicView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Music');
  const tab = LS.get('musicTab', 'files');
  // The shared presets load in the background; redraw once if they changed.
  const had = JSON.stringify(presets);
  if (tab === 'radio') loadPresets().then(() => { if (JSON.stringify(presets) !== had && location.hash.startsWith('#/music') && $('#radio')) musicView(); });
  const now = current();
  const playing = !audio.paused && !!audio.src;
  const stations = [...(BRAND.radio || []), ...myStations().map((s) => ({ ...s, mine: true }))];
  view.innerHTML = `
    <div class="card mu-now">
      <div class="mu-title">${now ? esc(now.name) : 'Nothing playing'}</div>
      ${status ? `<div class="mu-status">${esc(status)}</div>` : ''}
      <div class="muted small">${now ? (station ? `Radio${station.genre ? ' · ' + esc(station.genre) : ''}` : `Song ${pos + 1} of ${tracks.length}${now.folder ? ' · ' + esc(now.folder) : ''}`) : 'Pick songs or a radio station below.'}</div>
      <div class="mu-ctrl">
        <button type="button" id="mu-prev" aria-label="Previous" ${station || tracks.length < 2 ? 'disabled' : ''}>⏮</button>
        <button type="button" id="mu-play" class="big" aria-label="${playing ? 'Pause' : 'Play'}" ${now || tracks.length ? '' : 'disabled'}>${playing ? '⏸' : '▶'}</button>
        <button type="button" id="mu-next" aria-label="Next" ${station || tracks.length < 2 ? 'disabled' : ''}>⏭</button>
        <button type="button" id="mu-shuf" class="${shuffle ? 'on' : ''}" aria-label="Shuffle" ${station ? 'disabled' : ''}>🔀</button>
      </div>
      <button class="btn plain small" id="mu-test" type="button">🔊 Test sound</button>
      ${isIOS ? '<p class="muted small center" style="margin:6px 0 0">Use the iPad or iPhone volume buttons.</p>' : `<label class="mu-vol"><span aria-hidden="true">🔈</span><input type="range" id="mu-vol" min="0" max="1" step="0.05" value="${audio.volume}" aria-label="Volume"><span aria-hidden="true">🔊</span></label>`}
    </div>
    <div class="segmented"><button type="button" data-mt="files" class="${tab === 'files' ? 'on' : ''}">My music</button><button type="button" data-mt="radio" class="${tab === 'radio' ? 'on' : ''}">Radio</button></div>
    ${tab === 'files' ? `
      <div class="btn-row">
        ${isIOS ? '' : '<label class="btn tonal"><input type="file" id="mu-dir" webkitdirectory multiple hidden>Pick a folder</label>'}
        <label class="btn tonal"><input type="file" id="mu-files" accept="audio/*,.mp3,.m4a" multiple hidden>Pick songs</label>
      </div>
      <p class="muted small">Plug in the USB drive first, then pick its music folder${isIOS ? ' (in Files, tap Select, then choose the songs)' : ''}. The songs stay on this device; pick them again after the app is closed.</p>
      ${tracks.length ? `<div class="group mu-list">${tracks.map((t, i) => `<button class="row${!station && order[pos] === i ? ' on' : ''}" type="button" data-tr="${i}"><span class="mu-n">${!station && order[pos] === i && playing ? '♪' : i + 1}</span><span class="grow"><span class="title">${esc(t.name)}</span>${t.folder ? `<span class="sub">${esc(t.folder)}</span>` : ''}</span></button>`).join('')}</div>
        <button class="btn plain block" id="mu-clear" type="button">Clear the song list</button>` : '<div class="empty">No songs yet.</div>'}`
    : `${dialHtml()}
      <div class="section-label">Online stations</div>
      <div class="group">${stations.map((s, i) => `<div class="row${station?.url === s.url ? ' on' : ''}"><button class="grow mu-st" type="button" data-st="${i}"><span class="title">${station?.url === s.url && playing ? '♪ ' : ''}${esc(s.name)}</span><span class="sub">${esc([s.freq ? BANDS[s.band].fmt(s.freq) + ' ' + s.band : '', s.genre || ''].filter(Boolean).join(' · '))}</span></button>${s.mine ? `<button class="btn plain small" type="button" data-rmst="${esc(s.url)}" aria-label="Remove ${esc(s.name)}">Remove</button>` : ''}</div>`).join('')}</div>
      <div class="btn-row"><button class="btn tonal" id="mu-find" type="button">Find a station</button><button class="btn tonal" id="mu-url" type="button">Add by web address</button></div>
      <div id="mu-found"></div>
      <p class="muted small">Local AM and FM stations can be added when they stream on the internet. Find a station searches the free Radio Browser list. If a station isn't there, ask it for its stream address (starting with https) and use Add by web address. Some stations only play inside their own app or site.</p>`}
    <p class="muted small">Playing music for guests usually needs a business music license (for example ASCAP, BMI, SESAC and GMR), whichever source you use. Personal Spotify, Apple Music and Pandora accounts don't allow business use.</p>`;
  $$('[data-mt]').forEach((b) => b.onclick = () => { LS.set('musicTab', b.dataset.mt); musicView(); });
  $('#mu-play').onclick = toggle;
  $('#mu-test').onclick = testSound;
  $('#mu-prev').onclick = () => next(-1);
  $('#mu-next').onclick = () => next(1);
  $('#mu-shuf').onclick = () => { shuffle = !shuffle; LS.set('musicShuffle', shuffle); makeOrder(order[pos] ?? 0); musicView(); };
  $('#mu-vol')?.addEventListener('input', (e) => { audio.volume = +e.target.value; LS.set('musicVol', audio.volume); });
  $('#mu-dir')?.addEventListener('change', (e) => addFiles(e.target.files));
  $('#mu-files')?.addEventListener('change', (e) => addFiles(e.target.files));
  $('#mu-clear')?.addEventListener('click', clearSongs);
  $$('[data-tr]').forEach((b) => b.onclick = () => playTrack(+b.dataset.tr));
  $$('[data-st]').forEach((b) => b.onclick = () => playStation(stations[+b.dataset.st]));
  $$('[data-rmst]').forEach((b) => b.onclick = () => { saveStations(myStations().filter((s) => s.url !== b.dataset.rmst)); musicView(); });
  $('#mu-find')?.addEventListener('click', findStation);
  if ($('#radio')) wireDial();
  $('#mu-url')?.addEventListener('click', async () => {
    const v = await sheet({ title: 'Add a station', right: 'Add',
      body: `<label class="field"><span>Name</span><input type="text" id="su-n" placeholder="e.g. WGAC 580 AM"></label>
        <label class="field"><span>Stream address</span><input type="text" inputmode="url" id="su-u" placeholder="https://…" autocapitalize="off"></label>
        <p class="muted small">The address of the audio stream itself, not the station's web page.</p>`,
      onMount: (api) => { api.onRight = () => { const n = $('#su-n', api.el).value.trim(), u = $('#su-u', api.el).value.trim(); if (!n || !/^https:\/\//.test(u)) { toast('Enter a name and an https address'); return; } api.close({ name: n, url: u, genre: 'Added by hand', ...(parseFreq(n) || {}) }); }; } });
    if (!v) return;
    saveStations([...myStations().filter((x) => x.url !== v.url), v]); toast('Added ' + v.name); musicView();
  });
}

async function findStation() {
  const box = $('#mu-found');
  box.innerHTML = `<div class="search" style="margin-top:10px"><input type="search" id="mu-q" placeholder="Station name or call letters" value="${esc(LS.get('radioQ', BRAND.radioSearchArea || ''))}"></div>
    <button class="btn block" id="mu-go" type="button">Search</button><div id="mu-res"></div>`;
  const go = async () => {
    const q = $('#mu-q').value.trim(); LS.set('radioQ', q);
    const res = $('#mu-res'); res.innerHTML = '<p class="muted small">Searching…</p>';
    try {
      const base = 'https://all.api.radio-browser.info/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=40&countrycode=US&';
      const urls = [base + 'name=' + encodeURIComponent(q)];
      // The home town also lists the home state's stations (few stations list their city).
      if (q && q === BRAND.radioSearchArea && BRAND.radioSearchState) urls.push(base + 'state=' + encodeURIComponent(BRAND.radioSearchState));
      const seen = new Set(), found = [];
      for (const u of urls) {
        const r = await fetch(u); if (!r.ok) throw new Error(r.status);
        for (const s of await r.json()) {
          const url = s.url_resolved || s.url;
          if (!/^https:/.test(url) || seen.has(url)) continue; // http streams can't play inside a secure app
          seen.add(url); found.push({ name: s.name.trim(), url, ...(parseFreq(s.name) || {}), genre: [s.state, (s.tags || '').split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · ') });
        }
      }
      res.innerHTML = found.length ? `<div class="group">${found.slice(0, 30).map((s, i) => `<div class="row"><button class="grow mu-st" type="button" data-try="${i}"><span class="title">${esc(s.name)}</span><span class="sub">${esc(s.genre)}</span></button><button class="btn plain small" type="button" data-add="${i}">+ Add</button></div>`).join('')}</div>`
        : '<p class="muted small">No stations found that can play here. Try the call letters (e.g. WGAC) or a city.</p>';
      $$('[data-try]', res).forEach((b) => b.onclick = () => playStation(found[+b.dataset.try]));
      $$('[data-add]', res).forEach((b) => b.onclick = () => { const s = found[+b.dataset.add]; if (!myStations().some((x) => x.url === s.url)) saveStations([...myStations(), s]); toast('Added ' + s.name); musicView(); });
    } catch { res.innerHTML = '<p class="muted small">Couldn\'t reach the station list. Check the internet connection.</p>'; }
  };
  $('#mu-go').onclick = go;
  $('#mu-q').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

// ---------------------------------------------------------- radio dial (RRA-126)
// A radio faceplate: AM/FM switch, a tuning scale with a needle, a knob to
// turn, seek buttons, and presets. Turning to a frequency that has a station
// plays it. Stations are the presets the Admin or a manager programs (shared by
// every phone), plus your own stations that have a frequency. Only stations
// that stream on the internet can be tuned: the phone has no radio receiver.
const BANDS = {
  FM: { min: 87.9, max: 107.9, step: 0.2, fine: 0.1, tol: 0.05, fmt: (f) => f.toFixed(1), ticks: [88, 92, 96, 100, 104, 108] },
  AM: { min: 530, max: 1700, step: 10, fine: 10, tol: 5, fmt: (f) => String(Math.round(f)), ticks: [540, 700, 900, 1100, 1300, 1500, 1700] },
};
let presets = [];        // shared presets: { band, freq, name, url }
const canProgram = () => isHost() || session.profile?.role === 'manager';
const band = () => (LS.get('radioBand', 'FM') === 'AM' ? 'AM' : 'FM');
const clampF = (b, f) => Math.min(BANDS[b].max, Math.max(BANDS[b].min, Math.round(f / BANDS[b].fine) * BANDS[b].fine));
const freqOf = (b) => clampF(b, +LS.get('radioFreq' + b, b === 'FM' ? 104.3 : 580));
// "104.3", "WGAC 580 AM", "Kiss 96.3 FM" → { band, freq } (or null)
export function parseFreq(text) {
  const t = String(text || '');
  let m = t.match(/\b(8[89]|9\d|10[0-7])\.(\d)\b/);
  if (m) return { band: 'FM', freq: +(m[1] + '.' + m[2]) };
  m = t.match(/\b(5[3-9]\d|[6-9]\d\d|1[0-6]\d\d|1700)\s*(?:AM|kHz)\b/i);
  if (m) return { band: 'AM', freq: +m[1] };
  return null;
}
const dialStations = (b) => [...presets.map((p) => ({ ...p, preset: true })), ...myStations().filter((s) => s.band && s.freq)]
  .filter((s) => s.band === b).sort((x, y) => x.freq - y.freq);
const at = (b, f) => dialStations(b).find((s) => Math.abs(s.freq - f) <= BANDS[b].tol);
const pct = (b, f) => 4 + ((f - BANDS[b].min) / (BANDS[b].max - BANDS[b].min)) * 92; // 4% margin so end labels show

async function loadPresets() { presets = ((await data.settings()).radioPresets || []).filter((p) => p && p.url && BANDS[p.band]); }

function dialHtml() {
  const b = band(), f = freqOf(b), B = BANDS[b], here = at(b, f), list = dialStations(b);
  const ticks = [];
  for (let v = B.ticks[0]; v <= B.max + 1e-9; v += b === 'FM' ? 1 : 50) ticks.push(v);
  return `<div class="radio" id="radio">
    <div class="rd-top">
      <div class="rd-lcd" aria-live="polite"><span class="rd-f" id="rd-f">${B.fmt(f)}</span><span class="rd-b">${b === 'FM' ? 'MHz FM' : 'kHz AM'}</span><span class="rd-n" id="rd-n">${here ? esc(here.name) : 'No station here'}</span></div>
      <div class="rd-band" role="group" aria-label="Band">${['AM', 'FM'].map((x) => `<button type="button" data-band="${x}" class="${x === b ? 'on' : ''}" aria-pressed="${x === b}">${x}</button>`).join('')}</div>
    </div>
    <div class="rd-dial" id="rd-dial" role="slider" tabindex="0" aria-label="Tuning" aria-valuemin="${B.min}" aria-valuemax="${B.max}" aria-valuenow="${B.fmt(f)}">
      ${ticks.map((v) => `<i class="${B.ticks.includes(v) ? 'big' : ''}" style="left:${pct(b, v)}%"></i>`).join('')}
      ${B.ticks.map((v) => `<span class="rd-lab" style="left:${pct(b, v)}%">${b === 'AM' ? v / 10 : v}</span>`).join('')}
      ${list.map((s) => `<b class="rd-dot" style="left:${pct(b, s.freq)}%" title="${esc(B.fmt(s.freq) + ' ' + s.name)}"></b>`).join('')}
      <em class="rd-needle" id="rd-needle" style="left:${pct(b, f)}%"></em>
    </div>
    <div class="rd-ctl">
      <button type="button" id="rd-seekd" aria-label="Previous station">⏮</button>
      <button type="button" id="rd-dn" aria-label="Tune down">‹</button>
      <div class="rd-knob" id="rd-knob" role="presentation"><span></span></div>
      <button type="button" id="rd-up" aria-label="Tune up">›</button>
      <button type="button" id="rd-seeku" aria-label="Next station">⏭</button>
    </div>
    <div class="rd-presets">${list.length ? list.map((s) => `<button type="button" data-pf="${s.freq}" class="${here && here.url === s.url ? 'on' : ''}"><b>${esc(B.fmt(s.freq))}</b><small>${esc(s.name)}</small></button>`).join('') : `<p class="muted small">No ${b} stations on the dial yet.${canProgram() ? ' Tap Program presets to add one, for example 104.3 FM.' : ' The Admin or a manager can add them.'}</p>`}</div>
    ${canProgram() ? '<button class="btn tonal block" id="rd-prog" type="button">Program presets</button>' : ''}
  </div>`;
}

// Moves the needle without redrawing; after the dial rests, plays what's there.
let settle = null;
function tuneTo(f, now = false) {
  const b = band(), B = BANDS[b];
  f = clampF(b, f);
  LS.set('radioFreq' + b, f);
  const here = at(b, f);
  const n = $('#rd-needle'); if (n) n.style.left = pct(b, f) + '%';
  const ft = $('#rd-f'); if (ft) ft.textContent = B.fmt(f);
  const nt = $('#rd-n'); if (nt) nt.textContent = here ? here.name : 'No station here';
  $('#rd-dial')?.setAttribute('aria-valuenow', B.fmt(f));
  $$('[data-pf]').forEach((x) => x.classList.toggle('on', !!here && Math.abs(+x.dataset.pf - here.freq) < 1e-6));
  clearTimeout(settle);
  settle = setTimeout(() => {
    if (here) { if (station?.url !== here.url || audio.paused) playStation({ ...here, name: `${B.fmt(here.freq)} ${b} · ${here.name}`, genre: here.genre || '' }); }
    else if (station?.band && !audio.paused) { audio.pause(); station = null; status = ''; refresh(); }
  }, now ? 0 : 450);
}
function seek(d) {
  const b = band(), f = freqOf(b), list = dialStations(b);
  if (!list.length) { toast(`No ${b} stations on the dial yet`); return; }
  const next = d > 0 ? list.find((s) => s.freq > f + 1e-6) || list[0] : [...list].reverse().find((s) => s.freq < f - 1e-6) || list[list.length - 1];
  tuneTo(next.freq, true);
}

function wireDial() {
  const b = band(), B = BANDS[b];
  $$('[data-band]').forEach((x) => x.onclick = () => { LS.set('radioBand', x.dataset.band); musicView(); tuneTo(freqOf(x.dataset.band)); });
  $('#rd-dn').onclick = () => tuneTo(freqOf(b) - B.fine);
  $('#rd-up').onclick = () => tuneTo(freqOf(b) + B.fine);
  $('#rd-seekd').onclick = () => seek(-1);
  $('#rd-seeku').onclick = () => seek(1);
  $$('[data-pf]').forEach((x) => x.onclick = () => tuneTo(+x.dataset.pf, true));
  $('#rd-prog')?.addEventListener('click', programPresets);
  // Drag along the scale to tune.
  const dial = $('#rd-dial');
  const fromX = (e) => { const r = dial.getBoundingClientRect(); return B.min + Math.min(1, Math.max(0, ((e.clientX - r.left) / r.width - 0.04) / 0.92)) * (B.max - B.min); };
  // Dragging snaps onto a station within one step, so a finger can land on it.
  const snap = (f) => { const s = dialStations(b).find((x) => Math.abs(x.freq - f) <= B.fine * 1.5); return s ? s.freq : f; };
  dial.onpointerdown = (e) => { dial.setPointerCapture(e.pointerId); tuneTo(snap(fromX(e))); dial.onpointermove = (m) => tuneTo(snap(fromX(m))); };
  dial.onpointerup = dial.onpointercancel = () => { dial.onpointermove = null; };
  dial.onkeydown = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); tuneTo(freqOf(b) + B.fine); } if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); tuneTo(freqOf(b) - B.fine); } };
  // Turn the knob: every 12 degrees is one step.
  const knob = $('#rd-knob');
  let last = null, turned = +LS.get('radioKnob', 0), acc = 0;
  const ang = (e) => { const r = knob.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
  knob.style.transform = `rotate(${turned}deg)`;
  knob.onpointerdown = (e) => { knob.setPointerCapture(e.pointerId); last = ang(e); acc = 0; };
  knob.onpointermove = (e) => {
    if (last === null) return;
    const a = ang(e); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; last = a;
    turned += d; acc += d; knob.style.transform = `rotate(${turned}deg)`;
    while (Math.abs(acc) >= 12) { const s = Math.sign(acc); acc -= s * 12; tuneTo(freqOf(band()) + s * B.fine); }
  };
  knob.onpointerup = knob.onpointercancel = () => { last = null; LS.set('radioKnob', Math.round(turned) % 360); };
}

// Admin and managers: program presets by frequency (shared by every phone).
async function programPresets() {
  await loadPresets();
  const draw = (el) => {
    const rows = [...presets].sort((x, y) => (x.band === y.band ? x.freq - y.freq : x.band.localeCompare(y.band)));
    $('#pp-list', el).innerHTML = rows.length ? `<div class="group">${rows.map((p) => `<div class="row"><span class="grow"><span class="title">${esc(BANDS[p.band].fmt(p.freq))} ${p.band} · ${esc(p.name)}</span><span class="sub">${esc(p.url)}</span></span><button class="btn plain small" type="button" data-pdel="${esc(p.band + p.freq)}" style="color:var(--danger)">Remove</button></div>`).join('')}</div>` : '<p class="muted small">No presets yet.</p>';
    $$('[data-pdel]', el).forEach((x) => x.onclick = async () => { presets = presets.filter((p) => p.band + p.freq !== x.dataset.pdel); await savePresets(); draw(el); });
  };
  await sheet({
    title: 'Radio presets', left: 'Done',
    body: `<div id="pp-list"></div>
      <div class="section-label">Add a preset</div>
      <div class="rd-band" id="pp-band">${['FM', 'AM'].map((x, i) => `<button type="button" data-b="${x}" class="${i ? '' : 'on'}">${x}</button>`).join('')}</div>
      <label class="field"><span>Frequency</span><input type="text" inputmode="decimal" id="pp-f" placeholder="e.g. 104.3"></label>
      <button class="btn tonal block" type="button" id="pp-find">Find its online stream</button>
      <div id="pp-res"></div>
      <label class="field"><span>Station name</span><input type="text" id="pp-n" placeholder="e.g. WBBQ"></label>
      <label class="field"><span>Stream address</span><input type="text" inputmode="url" id="pp-u" placeholder="https://…" autocapitalize="off"></label>
      <button class="btn block" type="button" id="pp-add">Add preset</button>
      <p class="muted small">The phone has no radio receiver, so a preset plays the station's internet stream. Find its online stream searches the free Radio Browser list for that frequency${BRAND.radioSearchState ? ' in ' + esc(BRAND.radioSearchState) : ''}; if it isn't there, ask the station for its stream address (starting with https).</p>`,
    onMount(api) {
      const el = api.el; let pb = 'FM';
      draw(el);
      $$('#pp-band [data-b]', el).forEach((x) => x.onclick = () => { pb = x.dataset.b; $$('#pp-band [data-b]', el).forEach((y) => y.classList.toggle('on', y === x)); $('#pp-f', el).placeholder = pb === 'FM' ? 'e.g. 104.3' : 'e.g. 580'; });
      $('#pp-find', el).onclick = async () => {
        const f = parseFloat($('#pp-f', el).value);
        if (!f) { toast('Enter the frequency first'); return; }
        const res = $('#pp-res', el); res.innerHTML = '<p class="muted small">Searching…</p>';
        try {
          const q = pb === 'FM' ? f.toFixed(1) : String(Math.round(f));
          const base = 'https://all.api.radio-browser.info/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=60&countrycode=US&name=' + encodeURIComponent(q);
          const urls = BRAND.radioSearchState ? [base + '&state=' + encodeURIComponent(BRAND.radioSearchState), base] : [base];
          const seen = new Set(), found = [];
          for (const u of urls) {
            const r = await fetch(u); if (!r.ok) throw new Error(r.status);
            for (const s of await r.json()) { const url = s.url_resolved || s.url; if (!/^https:/.test(url) || seen.has(url)) continue; seen.add(url); found.push({ name: s.name.trim(), url, where: [s.state, (s.tags || '').split(',')[0]].filter(Boolean).join(' · ') }); }
            if (found.length) break;
          }
          res.innerHTML = found.length ? `<div class="group">${found.slice(0, 12).map((s, i) => `<button class="row nav" type="button" data-pick="${i}"><span class="grow"><span class="title">${esc(s.name)}</span><span class="sub">${esc(s.where)}</span></span></button>`).join('')}</div>` : '<p class="muted small">No stream found for that frequency. Ask the station for its stream address.</p>';
          $$('[data-pick]', res).forEach((x) => x.onclick = () => { const s = found[+x.dataset.pick]; $('#pp-n', el).value = s.name; $('#pp-u', el).value = s.url; res.innerHTML = ''; });
        } catch { res.innerHTML = '<p class="muted small">Couldn\'t reach the station list. Check the internet connection.</p>'; }
      };
      $('#pp-add', el).onclick = async () => {
        const f = parseFloat($('#pp-f', el).value), n = $('#pp-n', el).value.trim(), u = $('#pp-u', el).value.trim();
        const B = BANDS[pb];
        if (!f || f < B.min - B.fine || f > B.max + B.fine) { toast(pb === 'FM' ? 'FM is 88.1 to 107.9' : 'AM is 530 to 1700'); return; }
        if (!n || !/^https:\/\//.test(u)) { toast('Enter a name and an https stream address'); return; }
        const freq = clampF(pb, f);
        presets = [...presets.filter((p) => !(p.band === pb && Math.abs(p.freq - freq) < 1e-6)), { band: pb, freq, name: n, url: u }];
        await savePresets();
        ['#pp-f', '#pp-n', '#pp-u'].forEach((s) => { $(s, el).value = ''; });
        toast(`Added ${B.fmt(freq)} ${pb}`); draw(el);
      };
    },
  });
  musicView();
}
async function savePresets() { const s = await data.settings(); await data.saveSettings({ ...s, radioPresets: presets }); }

// ---------------------------------------------------------- mini player
// Shows at the bottom while something is loaded and you're on another screen.
function refresh() {
  if (location.hash.startsWith('#/music') && $('#mu-play')) {
    // Keep search results on screen; otherwise redraw the player.
    if ($('#mu-res')) {
      const b = $('#mu-play'); b.textContent = audio.paused ? '▶' : '⏸'; b.disabled = false; $('.mu-title').textContent = current()?.name || 'Nothing playing';
      let st = $('.mu-status'); if (!st && status) { st = document.createElement('div'); st.className = 'mu-status'; $('.mu-title').after(st); }
      if (st) { st.textContent = status; st.hidden = !status; }
    } else musicView();
  }
  let m = $('#mu-mini');
  const now = current();
  const show = !!now && !!audio.src && !location.hash.startsWith('#/music') && !document.body.classList.contains('locked');
  if (!show) { if (m) m.hidden = true; return; }
  if (!m) {
    m = document.createElement('div'); m.id = 'mu-mini'; m.className = 'mu-mini';
    document.body.append(m);
  }
  m.hidden = false;
  m.innerHTML = `<a href="#/music" class="mu-mini-t"><span aria-hidden="true">♪</span> ${esc(now.name)}</a><button type="button" aria-label="${audio.paused ? 'Play' : 'Pause'}">${audio.paused ? '▶' : '⏸'}</button>`;
  m.querySelector('button').onclick = toggle;
}
window.addEventListener('hashchange', refresh);
