// Gift cards (RRA-111): the restaurant's own online gift card shop. The shop
// address and names live in js/brand.js (BRAND.giftCards).
//
// The shop is a Shift4 Shop page. Selling or redeeming cards inside our Point
// of sale would need Shift4 developer (API) access, so for now staff open the
// shop for a guest, or send them the link.

import { $, esc, view, setTitle, setChrome, copy, share } from './ui.js';
import { BRAND } from './config.js';

export function giftCardsView() {
  setChrome({ tab: 'more', back: true });
  setTitle('Gift cards');
  const G = BRAND.giftCards || {};
  if (!G.url) { view.innerHTML = '<div class="empty">No gift card shop is set up for this restaurant.</div>'; return; }
  view.innerHTML = `
    <div class="card gc-card">
      <div class="gc-badge" aria-hidden="true">🎁</div>
      <h2 style="margin:6px 0 4px">${esc(G.label || 'Gift cards')}</h2>
      <p class="muted">${esc(G.note || '')}</p>
      <a class="btn block" href="${esc(G.url)}" target="_blank" rel="noopener">Open the gift card shop</a>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn tonal" id="gc-share" type="button">Send the link</button>
        <button class="btn tonal" id="gc-copy" type="button">Copy link</button>
      </div>
      <p class="mono small muted" style="word-break:break-all;margin-bottom:0">${esc(G.url)}</p>
    </div>
    <div class="section-label">For staff</div>
    <div class="group">
      <div class="row"><span class="grow"><span class="title">A guest wants a gift card</span><span class="sub" style="white-space:normal">Open the shop on this screen and let them fill it in, or tap Send the link so they can buy one on their own phone.</span></span></div>
      <div class="row"><span class="grow"><span class="title">Paying with a gift card</span><span class="sub" style="white-space:normal">Take gift cards on the ${esc(G.provider || 'card')} terminal for now. Selling and redeeming them in this app's Point of sale needs ${esc(G.provider || 'the card company')} developer access, which isn't set up yet.</span></span></div>
    </div>`;
  const text = `${G.label || 'Gift cards'}: ${G.url}`;
  $('#gc-share').onclick = () => share(G.label || 'Gift cards', text);
  $('#gc-copy').onclick = () => copy(G.url, 'Gift card link copied');
}
