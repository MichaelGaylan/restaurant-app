// Shared app settings: version, timings and file locations.
// Bump VERSION and BUILD on every release, and add one line to WHATS_NEW.

// Restaurant names, pictures, data names and keys come from that restaurant's
// brand.js (r/<id>/brand.js), loaded before the app.
export const BRAND = globalThis.BRAND;
export const APP_NAME = BRAND.appName;
export const VERSION = '0.7.1';
export const BUILD = '2026.11.22-2';

export const WHATS_NEW = [
  {
    version: '0.7.1', build: '2026.11.22-2', date: '2026-11-22',
    lines: [
      'Payroll (More → Payroll), with My pay & tips for everyone in the Lounge. No payroll service is connected yet, so runs are practice runs.',
      'Point of sale (More → Orders): checks by table or tab, kitchen and bar screen, 86 list, split checks, practice card payments, and Today\'s sales for managers.',
      'Event reminders for the Admin, managers and chefs, set per event or in Settings → App → Event reminders.',
      'Shorter pages: lists open one section at a time.',
    ],
  },
  {
    version: '0.6.0', build: '2026.11.22-1', date: '2026-11-22',
    lines: [
      'One shared app for every restaurant: each one has its own name, logo, colors and its own separate data.',
    ],
  },
];

// Public keys (base64url, raw P-256) of the Admin device(s): the app's administrator. Only invites that
// trace back to one of these keys can open the app. Empty = the app offers
// "Admin setup" so the first Admin key can be created on the Admin's phone.
export const ROOT_KEYS = BRAND.adminKeys || [];

// Access ends after this many days without opening the app (RRA-019).
export const INACTIVITY_DAYS = 21;

// An invite must be used within this many hours.
export const INVITE_HOURS = 72;

// Report a problem (Web3Forms). The key is public by design: it can only post
// to the inbox it is registered to. Never put the inbox address here.
export const WEB3FORMS_KEY = BRAND.reportKey || '';
export const REPORT_PREFIX = BRAND.reportPrefix;

// Shared team data (RRA-031): the web config from the Firebase console
// (Project settings → Your apps → Web). Public by design; the data itself is
// encrypted with the team key before it is sent. Set to null to keep data on each phone only.
export const FIREBASE = BRAND.firebase || null;

// Global messages to everyone (RRA-015) and revoked invites (RRA-019).
// Both are plain files published with the app.
export const NOTIFICATIONS_URL = 'data/notifications.json';
export const ACCESS_URL = 'data/access.json';
