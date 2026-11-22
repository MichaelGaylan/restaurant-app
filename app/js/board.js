// Message board (RRA-004): posts with replies. Store-and-forward: posts wait
// until people open the app. Notices from management (RRA-015) are pinned on
// top. RRA-075: a post goes to Everyone, a group or one person; private posts
// are seen only by the sender and the people they are for.

import * as data from './data.js';
import { $, $$, esc, view, LS, sheet, toast, setTitle, setChrome, session } from './ui.js';
import { canChange, isHost, myStaff } from './perms.js';
import { GROUPS, myId, audience, isPrivate, canSeePost, sentByMe, audienceLabel } from './audience.js';
import { staffList } from './schedule.js';

const FILTERS = { all: 'All', private: 'Private', mine: 'Sent' };
const lock = '<svg class="lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor"/></svg>';

const when = (t) => {
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export async function unreadPosts() {
  const seen = LS.get('boardSeen', 0);
  // A new reply from someone else counts too (RRA-081).
  const me = myId();
  const last = (p) => Math.max(sentByMe(p) ? 0 : p.at, ...(p.replies || []).filter((r) => (r.byId ? r.byId !== me : r.by !== session.profile?.name)).map((r) => r.at));
  return (await data.list('post')).filter((p) => canSeePost(p) && !p.about?.report && last(p) > seen).length;
}

export async function boardView() {
  setChrome({ tab: 'lounge', back: true });
  setTitle('Message board');
  const f = FILTERS[LS.get('boardFilter', 'all')] ? LS.get('boardFilter', 'all') : 'all';
  const staff = (await staffList()).sort(data.byName);
  const me = myId();
  const posts = (await data.list('post')).filter((p) => canSeePost(p) && !p.about?.report)
    .filter((p) => (f === 'private' ? isPrivate(p) : f === 'mine' ? sentByMe(p) : true))
    .sort((a, b) => b.at - a.at);
  const read = new Set(LS.get('read', []));
  const notices = session.notices || [];
  const to = LS.get('boardTo', 'all');
  const people = staff.filter((s) => s.id !== me && s.id !== myStaff()?.id && !(isHost() && s.name === session.profile?.name));
  view.innerHTML = `
    <div class="segmented">${Object.entries(FILTERS).map(([k, n]) => `<button type="button" data-f="${k}" class="${f === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${f === 'all' && notices.length ? `<div class="section-label">From management</div>${notices.slice(0, 3).map((n) => `
      <div class="msg notice"><div class="who">${esc(n.from || 'Management')} · ${esc(n.date || '')} ${read.has(n.id) ? '' : '<span class="chip warn">New</span>'}</div><b>${esc(n.title)}</b><br>${esc(n.body)}
        <div class="btn-row" style="margin-top:6px"><button class="btn plain small" type="button" data-hide-notice="${esc(n.id)}">Remove</button></div></div>`).join('')}` : ''}
    ${canChange('board') ? `<div class="card" style="padding:12px">
      <label class="field" style="margin-top:0"><span>To</span><select id="p-to">
        <option value="all"${to === 'all' ? ' selected' : ''}>Everyone</option>
        <optgroup label="Private to a group">${Object.entries(GROUPS).map(([k, g]) => `<option value="g:${k}"${to === `g:${k}` ? ' selected' : ''}>${g.name}</option>`).join('')}</optgroup>
        <optgroup label="Private to one person">${me !== 'admin' ? '<option value="p:admin">Admin</option>' : ''}${people.map((s) => `<option value="p:${s.id}">${esc(s.name)}</option>`).join('')}</optgroup>
      </select></label>
      <textarea id="p-text" style="min-height:56px" placeholder="Write a message"></textarea>
      <p class="muted small" id="p-hint" style="margin:6px 0 0"></p>
      <button class="btn block" id="p-send" type="button" style="margin-top:8px">Send</button></div>` : ''}
    ${posts.map((p) => `
      <div class="msg${isPrivate(p) ? ' private' : ''}" data-id="${p.id}"><div class="who">${esc(p.by)} · ${when(p.at)} · ${isPrivate(p) ? `${lock} to ${esc(audienceLabel(p, staff))}` : 'Everyone'}</div>${esc(p.text).replace(/\n/g, '<br>')}
        ${(p.replies || []).map((r) => `<div class="reply"><span class="who">${esc(r.by)} · ${when(r.at)}</span><br>${esc(r.text)}</div>`).join('')}
        <div class="btn-row" style="margin-top:6px">${canChange('board') ? '<button class="btn plain small" data-reply type="button">Reply</button>' : ''}
        ${sentByMe(p) || isHost() ? '<button class="btn danger small" data-del type="button">Delete</button>' : ''}</div>
      </div>`).join('') || `<div class="empty">${f === 'private' ? 'No private messages.' : f === 'mine' ? "You haven't sent anything yet." : 'No posts yet.'}</div>`}
    <p class="muted small center">Everyone posts are seen by the whole team. Private messages are seen only by the people they're sent to and you, and no other phone can open them.</p>`;
  const hint = () => {
    const v = $('#p-to')?.value || 'all';
    const h = $('#p-hint'); if (!h) return;
    h.textContent = v === 'all' ? 'The whole team sees this.' : v.startsWith('g:') ? `Only ${GROUPS[v.slice(2)].name.toLowerCase()} and you see this.` : 'Only that person and you see this.';
  };
  hint();
  $('#p-to')?.addEventListener('change', () => { LS.set('boardTo', $('#p-to').value); hint(); });
  LS.set('boardSeen', Date.now());
  LS.set('read', notices.map((n) => n.id));
  boardView.after?.();
  // RRA-089: remove a notice from this phone's board.
  $$('[data-hide-notice]', view).forEach((b) => { b.onclick = () => {
    LS.set('hiddenNotices', [...new Set([...LS.get('hiddenNotices', []), b.dataset.hideNotice])]);
    session.notices = (session.notices || []).filter((x) => x.id !== b.dataset.hideNotice);
    toast('Notice removed from your board'); boardView();
  }; });
  $$('[data-f]', view).forEach((b) => { b.onclick = () => { LS.set('boardFilter', b.dataset.f); boardView(); }; });
  $('#p-send')?.addEventListener('click', async () => {
    const text = $('#p-text').value.trim();
    if (!text) return;
    const v = $('#p-to').value;
    const dest = v === 'all' ? { kind: 'all' } : v.startsWith('g:') ? { kind: 'group', group: v.slice(2) } : { kind: 'person', person: v.slice(2) };
    await sendPost({ text, to: dest });
    toast(dest.kind === 'all' ? 'Posted' : 'Sent privately');
    boardView();
  });
  $$('[data-reply]', view).forEach((b) => {
    b.onclick = async () => {
      const p = posts.find((x) => x.id === b.closest('[data-id]').dataset.id);
      const text = await sheet({
        title: 'Reply', right: 'Send',
        body: `<p class="muted small">${esc(p.by)}: ${esc(p.text.slice(0, 120))}</p><textarea id="r-text" style="min-height:80px"></textarea>`,
        onMount: (api) => { api.onRight = () => { const t = $('#r-text', api.el).value.trim(); if (t) api.close(t); }; },
      });
      if (!text) return;
      p.replies = [...(p.replies || []), { by: session.profile.name, byId: myId(), at: Date.now(), text }];
      await data.put('post', p);
      if (p.about?.swap && p.to?.person === myId()) { const { recordSwapAnswer } = await import('./schedule.js'); await recordSwapAnswer(p.about.swap, text); }
      boardView();
    };
  });
  $$('[data-del]', view).forEach((b) => {
    b.onclick = async () => {
      const id = b.closest('[data-id]').dataset.id;
      const ok = await sheet({ title: 'Delete post?', right: 'Delete', body: '<p>Delete this post and its replies?</p>' });
      if (ok) { await data.remove('post', id); boardView(); }
    };
  });
}

// Send a post (also used by the lounge quick post and swap questions).
export async function sendPost({ text, to = { kind: 'all' }, about = null }) {
  const p = { text, by: session.profile.name, byId: myId(), at: Date.now(), to, channel: to.kind === 'all' ? 'all' : 'private', replies: [] };
  if (about) p.about = about;
  return data.put('post', p);
}
