// Shared app settings: version, timings and file locations.
// Bump VERSION and BUILD on every release, and add one line to WHATS_NEW.

// Restaurant names, pictures, data names and keys come from that restaurant's
// brand.js (r/<id>/brand.js), loaded before the app.
export const BRAND = globalThis.BRAND;
export const APP_NAME = BRAND.appName;
export const VERSION = '0.8.1';
export const BUILD = '2026.11.24-2';

export const WHATS_NEW = [
  {
    version: '0.8.1', build: '2026.11.24-2', date: '2026-11-24',
    lines: [
      'Music: a Test sound button checks the speaker and volume, the player says when a station is connecting or why something isn\'t playing, and the built-in stations try backup servers on their own.',
      'Order-up alert: bumping a ticket on the kitchen or bar screen tells the server who took the order "Pick up" with a chime and a count on Orders (POS). If nobody taps Picked up in time, every server on the clock gets it in red. The Admin sets the time in POS settings (2 minutes to start).',
      'Radio dial: tune like a real radio with an AM/FM switch, a tuning knob, seek buttons and preset buttons. The Admin and managers program presets by frequency (for example 104.3 FM), linked to that station\'s online stream, and every phone gets them.',
    ],
  },
  {
    version: '0.8.0', build: '2026.11.24-1', date: '2026-11-24',
    lines: [
      'Orders (POS) opens a popup: Seating, the kitchen screen, sales and your current orders. Seating shows each area (Dining room, Bar, Outside) laid out with its tables, booths, high tops, bar seats and patio tables: tap a free table, tap the number of guests, and the menu opens. Tap a seated table to bring its order back up. Managers and the Admin add areas and arrange the tables under Change the seating layout. On a check, your open tables show as tabs across the top. No typing needed.',
      'Point of sale picture menu: dishes are photo tiles with their name and price using each restaurant’s dish photos (also shown in Recipes), the menu sections are tabs across the top, and the open check sits on the left with − and + for each item. A photo added to a dish in Recipes takes the place of the standard one. Send turns orange (✓ Sent) once the order is in, and Pay opens a popup over the check for splitting and taking card or cash.',
      'On an iPad or computer, work screens use the whole screen: Point of sale, a check and its Pay screen, the Kitchen and bar screen, Schedule, Time sheets, a Payroll run, Stock count and an open recipe. The back arrow at the top left brings the left menu back.',
      'Stock count: the All tab is gone. It opens on the first group with its first section open, and opening another section closes the one before.',
      "Today's prep: when the last task in a tab is done, that tab goes away (with Undo), so only tabs with work left show.",
      'Music (More → Music): play MP3s from a USB drive or this computer with play, pause, skip, shuffle and volume, or internet radio. Find a station adds local AM/FM stations that stream online. Music keeps playing while you use the app.',
      'Gift cards (More → Gift cards): open the restaurant’s gift card shop for a guest, or send them the link.',
      'Admin: Settings → App → Clear test data erases practice clock-ins, payroll, checks, messages, swaps, events, waste and schedules for the whole team, with a backup file first. Dishes, recipes, stock, staff, pay rates and settings are never touched.',
    ],
  },
  {
    version: '0.7.1', build: '2026.11.22-6', date: '2026-11-22',    lines: [
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
