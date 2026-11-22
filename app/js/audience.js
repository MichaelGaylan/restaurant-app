// Who a message is for (RRA-075). A post goes to Everyone, to a group (the
// kitchen team, chefs or managers) or to one person. Everyone sees Everyone
// posts; a private post is seen only by its sender and the people it is for,
// and in the shared data it is sealed to their phones, so no other phone can
// open it.

import { session } from './ui.js';
import { myStaff, isHost } from './perms.js';

export const GROUPS = {
  kitchen: { name: 'Kitchen team', roles: ['staff', 'chef'] },
  chefs: { name: 'Chefs', roles: ['chef'] },
  managers: { name: 'Managers', roles: ['manager', 'owner'] },
};

// This phone's person: a staff record id, or 'admin' on an Admin device.
export const myId = () => (isHost() ? 'admin' : myStaff()?.id || null);

// Older posts used channels: Kitchen and Managers become those groups.
export function audience(p) {
  if (p.to) return p.to;
  if (p.channel === 'managers') return { kind: 'group', group: 'managers' };
  if (p.channel === 'kitchen') return { kind: 'group', group: 'kitchen' };
  return { kind: 'all' };
}
export const isPrivate = (p) => audience(p).kind !== 'all';

export function sentByMe(p) {
  const me = myId();
  return (p.byId && p.byId === me) || (!p.byId && p.by === session.profile?.name);
}

export function canSeePost(p) {
  const a = audience(p);
  if (a.kind === 'all' || sentByMe(p)) return true;
  const role = session.profile?.role;
  if (a.kind === 'group') return !!GROUPS[a.group]?.roles.includes(role);
  if (a.kind === 'person') return a.person === myId();
  return false;
}

export function audienceLabel(p, staff = session.staff || []) {
  const a = audience(p);
  if (a.kind === 'all') return 'Everyone';
  if (a.kind === 'group') return GROUPS[a.group]?.name || 'Group';
  if (a.person === 'admin') return 'Admin';
  return staff.find((s) => s.id === a.person)?.name || 'One person';
}

// The phones a private post is sealed to: the people it is for, the sender,
// and the Admin devices when the Admin is one of them.
export function recipientKeys(p, staff, settings) {
  const a = audience(p);
  const admins = Object.values(settings?.adminEks || {});
  const keys = new Set();
  if (a.kind === 'group') {
    const roles = GROUPS[a.group]?.roles || [];
    for (const s of staff) if (roles.includes(s.role) && s.ek) keys.add(s.ek);
    if (roles.includes('owner')) admins.forEach((k) => keys.add(k));
  } else if (a.kind === 'person') {
    if (a.person === 'admin') admins.forEach((k) => keys.add(k));
    else { const s = staff.find((x) => x.id === a.person); if (s?.ek) keys.add(s.ek); }
  }
  if (p.byId === 'admin') admins.forEach((k) => keys.add(k));
  else { const s = staff.find((x) => x.id === p.byId); if (s?.ek) keys.add(s.ek); }
  // Everyone who replied keeps seeing the thread.
  for (const r of p.replies || []) {
    if (r.byId === 'admin') admins.forEach((k) => keys.add(k));
    else { const s = staff.find((x) => x.id === r.byId); if (s?.ek) keys.add(s.ek); }
  }
  return [...keys];
}
