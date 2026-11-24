// Roles and permissions (RRA-002).
// The Admin is the app's administrator: full control, above every role, and
// nobody can lower it. Everyone else starts from their role's defaults, and
// the Admin (or anyone allowed to change Settings) can switch each area to
// none / see / change for that person in Settings → Roles and permissions.

import { session } from './ui.js';

export const AREAS = {
  recipes: 'Recipes',
  prep: 'Prep lists',
  stock: 'Stock counts',
  orders: 'Order guides and vendors',
  schedule: 'Schedule',
  board: 'Message board',
  events: 'Events (BEOs)',
  costs: 'Costs and waste',
  settings: 'Settings',
  pos: 'Point of sale (orders, kitchen screen)', // RRA-101
  coupons: 'Coupons (make and send)', // RRA-122. Putting one on a check only needs the POS.
};

// Pay and hours (RRA-055): for managers only, and only the Admin sets them.
export const PAY_AREAS = {
  timesheets: "Time sheets (everyone's hours)",
  payrates: 'Pay rates and pay totals',
  payrun: 'Submit payroll (RRA-095)',
  advances: 'Approve early pay (RRA-095)',
};

const ALL = (v) => Object.fromEntries(Object.keys(AREAS).map((k) => [k, v]));
const PAY_NONE = { timesheets: 'none', payrates: 'none', payrun: 'none', advances: 'none' };

export const ROLE_DEFAULTS = {
  // Managers review payroll by default; the Admin submits unless they allow it (RRA-095).
  manager: { ...ALL('change'), settings: 'change', timesheets: 'change', payrates: 'change', payrun: 'see', advances: 'change' },
  chef: { ...ALL('change'), schedule: 'see', settings: 'see', coupons: 'none', ...PAY_NONE },
  staff: { ...ALL('see'), prep: 'change', stock: 'change', board: 'change', costs: 'none', settings: 'none', pos: 'change', coupons: 'none', ...PAY_NONE },
};

export const isHost = () => session.profile?.role === 'owner';
// Time sheets with everyone's hours (RRA-055): managers and the Admin only,
// by access role. Staff and chefs see only their own time sheet.
// The Admin sets each manager's access to hours and pay in Roles and permissions.
export const canTime = () => isHost() || (session.profile?.role === 'manager' && level('timesheets') !== 'none');

// The staff record that belongs to this phone's person, if any.
export function myStaff() {
  const p = session.profile;
  if (!p) return null;
  return (session.staff || []).find((s) => s.iid && s.iid === p.iid) || (session.staff || []).find((s) => s.name === p.name) || null;
}

export function level(area, who = null) {
  const role = who ? who.role : session.profile?.role;
  if (role === 'owner') return 'change';
  if (area in PAY_AREAS && role !== 'manager') return 'none'; // never for staff or chefs
  const perms = who ? who.perms : myStaff()?.perms;
  return perms?.[area] || ROLE_DEFAULTS[role]?.[area] || ROLE_DEFAULTS.staff[area] || 'none';
}

export const canSee = (area) => level(area) !== 'none';
export const canChange = (area) => level(area) === 'change';
