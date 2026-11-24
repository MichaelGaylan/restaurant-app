// Music (RRA-109): background music for the restaurant, built into the app.
//   My music: MP3s from a USB drive or this computer (pick a folder or songs),
//             with play, pause, skip, shuffle and volume.
//   Radio:    internet streams of AM/FM and online stations. The built-in list
//             lives in js/brand.js (BRAND.radio); Find a station searches the
//             free Radio Browser directory (radio-browser.info).
// Music keeps playing while you move around the app; a small player shows at
// the bottom. Nothing is uploaded: the songs stay on this device.

import { $, $$, esc, view, LS, setTitle, setChrome, toast, isIOS, sheet } from './ui.js';
import { BRAND } from './config.js';

const audio = new Audio();
audio.preload = 'auto';
let tracks = [];          // { name, url }
let order = [];           // play order (indexes into tracks)
let pos = -1;             // place in order
let station = null;       // { name, url } while the radio plays
let shuffle = LS.get('musicShuffle', false);
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

async function play() {
  try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') toast(station ? 'This station would not play. Try another one.' : 'This file would not play.'); }
  refresh();
}
function playTrack(i) {
  station = null;
  if (!order.length || order[pos] !== i) makeOrder(i);
  if (order[pos] !== i) pos = order.indexOf(i);
  audio.src = tracks[i].url;
  play();
}
function playStation(s) {
  station = s;
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
  const now = current();
  const playing = !audio.paused && !!audio.src;
  const stations = [...(BRAND.radio || []), ...myStations().map((s) => ({ ...s, mine: true }))];
  view.innerHTML = `
    <div class="card mu-now">
      <div class="mu-title">${now ? esc(now.name) : 'Nothing playing'}</div>
      <div class="muted small">${now ? (station ? `Radio${station.genre ? ' · ' + esc(station.genre) : ''}` : `Song ${pos + 1} of ${tracks.length}${now.folder ? ' · ' + esc(now.folder) : ''}`) : 'Pick songs or a radio station below.'}</div>
      <div class="mu-ctrl">
        <button type="button" id="mu-prev" aria-label="Previous" ${station || tracks.length < 2 ? 'disabled' : ''}>⏮</button>
        <button type="button" id="mu-play" class="big" aria-label="${playing ? 'Pause' : 'Play'}" ${now || tracks.length ? '' : 'disabled'}>${playing ? '⏸' : '▶'}</button>
        <button type="button" id="mu-next" aria-label="Next" ${station || tracks.length < 2 ? 'disabled' : ''}>⏭</button>
        <button type="button" id="mu-shuf" class="${shuffle ? 'on' : ''}" aria-label="Shuffle" ${station ? 'disabled' : ''}>🔀</button>
      </div>
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
    : `
      <div class="group">${stations.map((s, i) => `<div class="row${station?.url === s.url ? ' on' : ''}"><button class="grow mu-st" type="button" data-st="${i}"><span class="title">${station?.url === s.url && playing ? '♪ ' : ''}${esc(s.name)}</span><span class="sub">${esc(s.genre || '')}</span></button>${s.mine ? `<button class="btn plain small" type="button" data-rmst="${esc(s.url)}" aria-label="Remove ${esc(s.name)}">Remove</button>` : ''}</div>`).join('')}</div>
      <div class="btn-row"><button class="btn tonal" id="mu-find" type="button">Find a station</button><button class="btn tonal" id="mu-url" type="button">Add by web address</button></div>
      <div id="mu-found"></div>
      <p class="muted small">Local AM and FM stations can be added when they stream on the internet. Find a station searches the free Radio Browser list. If a station isn't there, ask it for its stream address (starting with https) and use Add by web address. Some stations only play inside their own app or site.</p>`}
    <p class="muted small">Playing music for guests usually needs a business music license (for example ASCAP, BMI, SESAC and GMR), whichever source you use. Personal Spotify, Apple Music and Pandora accounts don't allow business use.</p>`;
  $$('[data-mt]').forEach((b) => b.onclick = () => { LS.set('musicTab', b.dataset.mt); musicView(); });
  $('#mu-play').onclick = toggle;
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
  $('#mu-url')?.addEventListener('click', async () => {
    const v = await sheet({ title: 'Add a station', right: 'Add',
      body: `<label class="field"><span>Name</span><input type="text" id="su-n" placeholder="e.g. WGAC 580 AM"></label>
        <label class="field"><span>Stream address</span><input type="url" id="su-u" placeholder="https://…" autocapitalize="off"></label>
        <p class="muted small">The address of the audio stream itself, not the station's web page.</p>`,
      onMount: (api) => { api.onRight = () => { const n = $('#su-n', api.el).value.trim(), u = $('#su-u', api.el).value.trim(); if (!n || !/^https:\/\//.test(u)) { toast('Enter a name and an https address'); return; } api.close({ name: n, url: u, genre: 'Added by hand' }); }; } });
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
          seen.add(url); found.push({ name: s.name.trim(), url, genre: [s.state, (s.tags || '').split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · ') });
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

// ---------------------------------------------------------- mini player
// Shows at the bottom while something is loaded and you're on another screen.
function refresh() {
  if (location.hash.startsWith('#/music') && $('#mu-play')) {
    // Keep search results on screen; otherwise redraw the player.
    if ($('#mu-res')) { const b = $('#mu-play'); b.textContent = audio.paused ? '▶' : '⏸'; b.disabled = false; $('.mu-title').textContent = current()?.name || 'Nothing playing'; } else musicView();
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
