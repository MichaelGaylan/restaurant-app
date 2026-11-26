// Shared app settings: version, timings and file locations.
// Bump VERSION and BUILD on every release, and add one line to WHATS_NEW.

// Restaurant names, pictures, data names and keys come from that restaurant's
// brand.js (r/<id>/brand.js), loaded before the app. Who owns the app's code
// comes from owner.js (one place, easy to change).
export const BRAND = globalThis.BRAND;
export const APP_NAME = BRAND.appName;
export const VERSION = '0.15.0';
export const BUILD = '2026.11.26-1';
export { CODE_OWNER, CODE_OWNER_LINE } from './owner.js';

// Text that names the restaurant uses tokens, so it reads right after a
// changeout (RRA-123): {name} = short name, {restaurant} = full name,
// {app} = app name.
export const brandText = (s) => String(s ?? '')
  .replace(/\{name\}/g, BRAND.shortName).replace(/\{restaurant\}/g, BRAND.restaurant).replace(/\{app\}/g, BRAND.appName);

const WHATS_NEW_RAW = [
  {
    version: '0.15.0', build: '2026.11.26-1', date: '2026-11-26',
    lines: [
      'Behind the scenes: {app} now runs on one shared app for every restaurant, so each fix reaches all of them at once. Your data stays your own.',
      'Each restaurant can start with its own menu, stock list and vendors.',
      'About shows who makes the app.',
    ],
  },
  {
    version: '0.14.1', build: '2026.11.26-28', date: '2026-11-26',
    lines: [
      'Orders: tapping a dish no longer jumps the screen back to the top. After your first pick, the seat bar sits at the top of the screen and stays there while you add more; pull down to see the check.',
    ],
  },
  {
    version: '0.14.0', build: '2026.11.26-27', date: '2026-11-26',
    lines: [
      'The bar menu now arrives: the Draft Beer, Bottles & Cans, Wine, Liquor and Cocktails sections are added as soon as the team\'s data has loaded, even on a slow connection. The Admin sees a short "Menu update" note when new items are added.',
      'Ten beers in Bottles & Cans and ten wines in Wine (by the glass and by the bottle), with prices. Each one counts down its own case or bottle in Stock.',
      'Six classic cocktails with recipes and steps: Old Fashioned, Moscow Mule, Mojito, Whiskey Sour, Cosmopolitan and Paloma. Every cocktail has a drawn picture until you add a photo of your own.',
      'Orders shows every menu section as a tab. Anything without a price yet shows grayed out; a manager or the Admin can tap it and type the price right there.',
      'Dishes and drinks can have a short description in Recipes.',
    ],
  },
  {
    version: '0.13.0', build: '2026.11.26-26', date: '2026-11-26',
    lines: [
      'Time-off requests: ask for a day or a few days off from the Employee lounge (My week) or the Schedule, with a note. Managers and the Admin get an alert badge and tap OK or No; they see any shifts already scheduled on those days first.',
      'An approved request puts Time off on those days of the schedule. The person who asked gets a badge and a pop-up with the answer, and can take a request back until it is answered.',
    ],
  },
  {
    version: '0.12.0', build: '2026.11.26-25', date: '2026-11-26',
    lines: [
      'Alert badges: a red number on the tab, the left menu, More and the app icon when something new needs you, with a chime and buzz, and a phone notification when the app is in the background. Each person gets only the alerts for their job: new kitchen tickets (cooks and chefs), new bar tickets (bartenders and barbacks), tables to clear (bussers, servers, hosts), order up, new guests seated in your section, a check or ticket waiting too long, new messages and problem-report replies, swap requests and answers, and 86 or low stock.',
      'Settings for alerts are in More → Alerts: turn each kind, the chime, and phone notifications on or off for this phone. Managers and the Admin can also ask for alerts other jobs get. The Admin sets how long a check can stay open in Settings → Point of sale.',
      'Fixed: "Picked up" on the order-up banner did nothing while a pop-up was open (like Staff member in Team access). The banner now shows on top of the pop-up and the tap works.',
    ],
  },
  {
    version: '0.11.0', build: '2026.11.26-24', date: '2026-11-26',
    lines: [
      'Bar menu: new Draft Beer, Bottles & Cans, Wine, Liquor and Cocktails sections. Add each drink in Recipes with its price and photo, and it shows in Orders. Six starter cocktails (Margarita, Long Island, Rum & Coke and more) already have their pours; add a price to put them on.',
      'Every beer, wine, liquor and mixed drink goes to the bar ticket, never the kitchen. Settings → Menu sections now shows where each section is sent, and you can switch food sections between Bar and Kitchen.',
      '21+ ID check: the first alcoholic drink on a seat asks the server to check ID and shows the birth date to look for. Seats that were checked show 🪪 on the check.',
      'Liquor and cocktails ask Rocks, Neat, Up, Shot or Double. A double pours twice and costs twice the price.',
      'Pours count down Stock: when a drink is sent, its pours (like 1.5 oz Well vodka) come off that bottle in Stock. A voided drink puts them back. Bottles show part counts, like 2.96.',
      'Happy hour: set the days and times in Settings → Point of sale, with dollars off every alcoholic drink or a happy hour price on any dish in Recipes. Orders shows the happy hour price while it is on.',
      'Your menu changes are kept: a price, section or dish you changed or took out stays that way when a menu update comes out. Every menu section shows in Recipes with "+ Add to", even before it has a dish.',
    ],
  },
  {
    version: '0.10.0', build: '2026.11.26-23', date: '2026-11-26',
    lines: [
      'Invites ask for the person\'s job (Server, Bartender, Host, Line cook…), so they get the right screens from the start. Approving an older invite or letting someone back in asks too.',
      'Anyone who joined without a job title shows "Pick a job" on the Staff list, so nobody is left on the Line cook screens by mistake.',
      '"Ask to get back in" now goes to every manager and the Admin in the app, not only the person who first invited them. Any one of them can let the person back in, and the app opens on that phone by itself once approved.',
    ],
  },
  {
    version: '0.9.0', build: '2026.11.26-22', date: '2026-11-26',
    lines: [
      'The app now fits each job. A busser sees Tables and the Employee lounge; servers see Seating, their orders and tables; bartenders see Seating, orders and the bar tickets; hosts seat guests for a server; cooks see the kitchen tickets, prep, recipes and stock. The bottom tabs change to match, and other parts of the app stay closed.',
      'Tables to clear: when a check is paid, its table turns orange ("Clear") on the seating layout. A busser, server, host or manager taps it, or the Cleared button on Tables, once it\'s reset, and it shows as free again.',
      'Hosts seat guests and pick the server; the table then shows on that server\'s layout. People who don\'t take orders don\'t see check amounts.',
      'The Admin chooses what each job sees in Settings → People → Job titles (tap a job, then switch screens on or off). Chefs, managers and the Admin see what their role allows, as before.',
    ],
  },
  {
    version: '0.8.6', build: '2026.11.26-21', date: '2026-11-26',
    lines: [
      'You can add your own job titles. When adding or editing staff, pick "+ Add a job title…" in Position, or manage the list in Settings → People → Job titles. Busser is now on the list next to Bartender.',
      'Tip pool points for "Host" now also count for "Host stand".',
    ],
  },
  {
    version: '0.8.5', build: '2026.11.26-20', date: '2026-11-26',
    lines: [
      'Clear test data (Admin, in Settings) has a "Pick sales and time logs" button, and can now restart check numbers at 1, empty the 86 list, clear daily prep check-offs and clear past schedules only. Used one-time coupons are paused when checks go. Stock is never touched.',
    ],
  },
  {
    version: '0.8.4', build: '2026.11.24-3', date: '2026-11-24',
    lines: [
      'Seating areas can be sized to fit the room: in Seating layout, tap Size and pick how many squares wide and deep the area is (a small nook can be 2 by 1). Tap an empty square to add a table, tap one to remove it.',
    ],
  },
  {
    version: '0.8.3', build: '2026.11.24-3', date: '2026-11-24',
    lines: [
      'Coupons (More → Coupons, managers and the Admin): make a coupon for percent off, dollars off, a free dish, or buy one get one, with dates, days, hours, a minimum, food only, a use limit and one-time codes. Send it as a framed {name} coupon picture with a QR code or barcode and the offer printed under it.',
      'At the table, tap Add a coupon on the check and scan the coupon with the camera (works on iPhone) or type the code. The app checks the rules, takes the discount off before tax, and shows coupons in Today\'s sales. Net sales in Payroll count the discount.',
      'Military / veteran discount (also first responder and senior): set it up once under More → Coupons. On a check, tap Discounts, pick it, and confirm you saw the guest\'s ID. It works every visit with no coupon, and Today\'s sales shows these discounts on their own line. Its QR card can also be printed for regulars.',
    ],
  },
  {
    version: '0.8.2', build: '2026.11.24-3', date: '2026-11-24',
    lines: [
      'Behind the scenes: everything that belongs to this restaurant (names, pictures, menu, starter stock, vendors, shared data settings) now lives in one place, so the app can be set up for another restaurant with nothing of {name} left in it. Nothing changes on your screen.',
    ],
  },
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
export const WHATS_NEW = WHATS_NEW_RAW.map((w) => ({ ...w, lines: w.lines.map(brandText) }));

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

// Shared team data (RRA-031): the restaurant's Firebase web config lives in
// its brand.js (firebase). Public by design; the data itself is encrypted with
// the team key before it is sent. null keeps data on each phone only.
export const FIREBASE = BRAND.firebase || null;

// Global messages to everyone (RRA-015) and revoked invites (RRA-019).
// Both are plain files published with the app.
export const NOTIFICATIONS_URL = 'data/notifications.json';
export const ACCESS_URL = 'data/access.json';
