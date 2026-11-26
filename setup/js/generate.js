// Builds one restaurant's folder (r/<id>/) from the wizard's answers (RSW).
// Every file here is small: the app itself lives once in /app and is shared.
// Works in the browser (wizard) and in Node (tests).

export const RESERVED = ['app', 'setup', 'r', 'preview', 'bootleggers', 'blg', 'assets', 'data', 'js', 'css'];

export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

import { menuHash } from './menus.js';

const js = (v) => JSON.stringify(v);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The brand settings a restaurant needs. `b` is what the wizard collected.
export function brandOf(b) {
  const id = b.id;
  return {
    appName: b.appName || `${b.shortName} Kitchen`,
    shortName: b.shortName,
    restaurant: b.restaurant,
    location: b.location || '',
    tagline: b.tagline || `Recipes and kitchen notes for ${b.restaurant}${b.location ? ', ' + b.location : ''}.`,
    credit: b.credit || '',
    logo: 'assets/logo.png',
    icon180: 'assets/app-icon-180.png',
    icon192: 'assets/app-icon-192.png',
    icon512: 'assets/app-icon-512.png',
    favicon: 'assets/favicon-32.png',
    introVideo: b.hasVideo ? 'assets/intro.mp4' : '',
    accent: b.accent || null,
    dataPrefix: `rsw.${id}.`,
    dbName: `rsw-${id}`,
    teamId: id,
    reportPrefix: `${b.shortName} —`,
    adminKeys: [],
    firebase: null,
    reportKey: '',
    brandVersion: b.brandVersion || Date.now(),
    ...menuOf(b),
  };
}

// The starter menu, drinks and stock (RSW-020), in the shape the shared app
// reads (menu.js, drinks.js, starter-stock.js). Empty rows are left out.
export function menuOf(b) {
  const menu = (b.menu || []).map((s) => ({ section: String(s.section || '').trim(), kind: s.kind || '',
    items: (s.items || []).map(([n, p]) => [String(n || '').trim(), price(p)]).filter(([n]) => n) }))
    .filter((s) => s.section && s.items.length);
  const stock = (b.stock || []).map((g) => ({ group: String(g.group || '').trim(),
    items: (g.items || []).map(([n, u]) => [String(n || '').trim(), String(u || '').trim()]).filter(([n]) => n) }))
    .filter((g) => g.group && g.items.length);
  const drinkSections = Object.fromEntries(menu.filter((s) => s.kind).map((s) => [s.section, s.kind]));
  const out = {
    menuVersion: menu.length || stock.length ? 'w-' + menuHash(menu, stock) : '1',
    menu: menu.map(({ section, items }) => ({ section, items })),
    starterStock: stock,
    stockStatus: stock.length ? 'Starter list from the setup wizard: check it and set a par for each item.' : '',
  };
  if (Object.keys(drinkSections).length) out.drinks = { sections: drinkSections, legalAge: 21, pourOz: { liquor: 1.5, wine: 5, beer: 16 },
    choices: { liquor: { title: 'How', options: [['Rocks'], ['Neat'], ['Up'], ['Shot'], ['Double', 2, 2]] }, cocktail: { title: 'How', options: [['Rocks'], ['Up'], ['Double', 2, 2]] } } };
  if (b.posChoices && Object.keys(b.posChoices).length) out.posChoices = b.posChoices;
  if (b.dishExample) out.dishExample = b.dishExample;
  return out;
}
const price = (p) => { const n = parseFloat(String(p ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n.toFixed(2) : ''; };

export function brandJs(B, meta = {}) {
  const line = (k, v, note = '') => `  ${k}: ${js(v)},${note ? ' // ' + note : ''}`;
  return `// Brand settings for ${B.restaurant} (made with the setup wizard ${meta.wizard || ''} on ${meta.date || new Date().toISOString().slice(0, 10)}).
// Names, pictures, colors and this restaurant's own data space. The app
// itself is shared: /app. Keep index.html and manifest.webmanifest in step
// with the names and icons (iPhone reads them from the page).

self.BRAND = {
  // Names
${line('appName', B.appName, 'page title, About, startup screen, messages')}
${line('shortName', B.shortName, 'name under the home-screen icon')}
${line('restaurant', B.restaurant, 'printed footers, notices')}
${line('location', B.location)}
${line('tagline', B.tagline)}
${line('credit', B.credit, '© line in About. Empty = hidden.')}

  // Pictures and video
${line('logo', B.logo)}
${line('icon180', B.icon180)}
${line('icon192', B.icon192)}
${line('icon512', B.icon512)}
${line('favicon', B.favicon)}
${line('introVideo', B.introVideo, "'' = no startup clip")}

  // Look. null keeps the Apple / Android system colors.
${line('accent', B.accent)}

  // Data space: this restaurant's own. Never reuse or change on a live app.
${line('dataPrefix', B.dataPrefix)}
${line('dbName', B.dbName)}
${line('teamId', B.teamId, 'shared data: teams/<teamId> in Firebase')}
${line('reportPrefix', B.reportPrefix)}

  // Set up later (Needs you): Admin phone key, shared data, Report a problem.
${line('adminKeys', B.adminKeys, 'empty = the app offers Admin setup')}
${line('firebase', B.firebase, 'null = data stays on each phone')}
${line('reportKey', B.reportKey, 'Web3Forms key; empty = reports are copied instead')}
${line('brandVersion', B.brandVersion, 'change when names or pictures change, so phones update')}

  // Starter menu (RSW-020): sections, dishes and prices, added once to Recipes
  // and the Point of sale on the Admin phone. Change menuVersion after editing
  // so phones pick it up. [name, price]; an empty price hides it from Orders.
${line('menuVersion', B.menuVersion)}
  menu: [${B.menu.map((m) => `\n    { section: ${js(m.section)}, items: [${m.items.map((i) => `\n      ${js(i)},`).join('')}\n    ] },`).join('')}${B.menu.length ? '\n  ' : ''}],${B.drinks ? `
  // Drink sections go to the bar ticket; alcohol asks for a 21+ ID check.
${line('drinks', B.drinks)}` : ''}${B.posChoices ? `
  // Choices asked for when a dish is added (wings sauce, burger temperature, salad dressing).
${line('posChoices', B.posChoices)}` : ''}${B.dishExample ? `
${line('dishExample', B.dishExample, 'example in the Recipes Name box')}` : ''}

  // Starter stock (RSW-020): food and bar groups. Cleaning, paper, smallwares
  // and linens come from the shared app for every restaurant. [name, unit].
${line('stockStatus', B.stockStatus)}
  starterStock: [${B.starterStock.map((g) => `\n    { group: ${js(g.group)}, items: [${g.items.map((i) => js(i)).join(', ')}] },`).join('')}${B.starterStock.length ? '\n  ' : ''}],
};
`;
}

export function indexHtml(B) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(B.appName)}</title>
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="${esc(B.shortName)}">
  <link rel="icon" href="${B.favicon}" sizes="32x32">
  <link rel="apple-touch-icon" href="${B.icon180}">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="../../app/css/app.css">
  <!-- This restaurant's names, pictures, colors and data space -->
  <script src="brand.js"></script>
  <!-- Shared by every restaurant -->
  <script src="../../app/js/head.js"></script>
</head>
<body>
  <script src="../../app/js/shell.js"></script>
  <noscript><p style="padding:2rem">${esc(B.appName)} needs JavaScript turned on.</p></noscript>
</body>
</html>
`;
}

export function manifest(B) {
  return JSON.stringify({
    name: B.appName, short_name: B.shortName, description: B.tagline,
    start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
    background_color: '#000000', theme_color: B.accent || '#000000',
    icons: [
      { src: B.icon192, sizes: '192x192', type: 'image/png' },
      { src: B.icon512, sizes: '512x512', type: 'image/png' },
      { src: B.icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n';
}

export function notices(B, date = new Date().toISOString().slice(0, 10)) {
  return JSON.stringify({
    _how: 'Messages to everyone. Add a new entry at the top with a new id. The app shows it once as a popup and keeps it in Notices.',
    messages: [{ id: `${date}-welcome`, date, title: `Welcome to ${B.shortName} Message Board`, body: 'This is where your messages and notices from management will show up.', from: 'Management' }],
  }, null, 2) + '\n';
}

const ACCESS = JSON.stringify({ _how: "Invite ids listed under revoked lose access the next time that phone opens the app. The Manager's Team screen shows each invite id.", revoked: [] }, null, 2) + '\n';
const SW = "// This restaurant's offline support: its brand, then the shared service worker.\nimportScripts('brand.js', '../../app/sw-core.js');\n";

// All files for r/<id>/. images: { logo, icon180, icon192, icon512, favicon } as Uint8Array PNGs; video optional.
export function restaurantFiles(B, images, video, meta) {
  const p = `r/${B.teamId}/`;
  const enc = new TextEncoder();
  const files = [
    [p + 'index.html', indexHtml(B)],
    [p + 'brand.js', brandJs(B, meta)],
    [p + 'sw.js', SW],
    [p + 'manifest.webmanifest', manifest(B)],
    [p + 'data/notifications.json', notices(B, meta?.date)],
    [p + 'data/access.json', ACCESS],
    [p + B.logo, images.logo],
    [p + B.icon180, images.icon180],
    [p + B.icon192, images.icon192],
    [p + B.icon512, images.icon512],
    [p + B.favicon, images.favicon],
  ];
  if (video && B.introVideo) files.push([p + B.introVideo, video]);
  return files.map(([path, data]) => ({ path, data: typeof data === 'string' ? enc.encode(data) : data }));
}
