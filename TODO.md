# Restaurant Setup (RSW): Build list

Project code: `RSW`. One shared restaurant app (from Bootleggers Kitchen) and a setup wizard that makes each restaurant's version. A fix made once in `app/` reaches every restaurant.

## 🔴 Needs you
- [ ] RSW-012 · Your © credit line: once your brand name is cleared, enter it once in the wizard (Details → © credit line). It's remembered for every new restaurant · Content · S
- [ ] RSW-013 · Try the wizard on your iPhone once Pages is on: make a test restaurant, check the preview, download the zip · Docs · S

## 🔵 Build list
- [ ] RSW-021 · Shared data (Firebase) per restaurant: one Firebase project for all restaurants, each under `teams/<id>` (rules in `app/firestore.rules` already allow that), and the wizard fills in the config · Infra · M · added 2026-11-22
- [ ] RSW-022 · Report a problem per restaurant: Web3Forms key field in the wizard · Infra · S · added 2026-11-22
- [ ] RSW-027 · Copy each Bootleggers release into `app/` (same batch as the Bootleggers release), with Bootleggers' names, menu and pictures left out, so new restaurants get the same features · Infra · S · added 2026-11-22
- [ ] RSW-024 · Merge the Payroll module into the shared app (after BPAY merge checklist) · Infra · L · added 2026-11-22
- [ ] RSW-025 · Wizard "Publish" button that uploads the restaurant folder to GitHub directly, instead of download + upload · Infra · M · added 2026-11-22

## 🟡 Hold

## 🟣 Done
### Shared app 0.15.0 · wizard 0.2.0 · build 2026.11.26-1
- [x] RSW-031 · Shared app caught up with Bootleggers 0.8.5 to 0.14.1: clear records round 2, job titles and job views (Seating, Tables, Tickets tabs), let-me-back-in to every manager, bar drinks with the 21+ ID check and pours from Stock, happy hour, alert badges by job, time-off requests, order screen fixes, slow-sync menu fix (RRA-130..145). Nothing of Bootleggers is carried over (names, menu, photos, intro video, keys stay in the Bootleggers app). Shared differences kept: per-restaurant Admin keys, file paths next to `app/`, no service worker in the wizard preview · Infra · M · added 2026-11-26
- [x] RSW-020 · Starter menus: new Menu step in the wizard. Start from Bar & grill, Pizza & Italian, Café & breakfast, Mexican or empty; change sections, dishes, prices and which sections are drinks; or paste a menu (one dish per line, price at the end). The food and bar stock list comes with it; cleaning, paper, smallwares, linens and common vendors are added for every restaurant. Harbor demo now has the Bar & grill menu · Data · M · added 2026-11-22
- [x] RSW-011 · Code ownership: **VYBEON** for now (Gaylan, 2026-11-26; may change later for legal reasons). It lives in one place, `app/js/owner.js`, and shows in About as "App software by VYBEON" in every restaurant and in the wizard. Change that one line to rename it. Each restaurant's © credit line is separate (brand.js `credit`, wizard Details) · Safety · S · added 2026-11-22
- [x] RSW-010 · GitHub Pages is on: https://michaelgaylan.github.io/restaurant-app/setup/ · Infra · S · added 2026-11-22
### Shared app 0.8.0 · build 2026.11.24-1
- [x] RSW-030 · Shared app caught up with Bootleggers 0.8.2 to 0.8.4: coupons and the military/veteran discount with the QR scanner (app/vendor/zxing), {name} tokens in notices and What's new, and seating areas sized to the room (RRA-122, 123, 128, 129). Menu, starter stock and vendors keep the shared per-restaurant approach · Infra · S · added 2026-11-24
- [x] RSW-029 · Shared app caught up with Bootleggers 0.8.1: Music Test sound and status line, radio dial with AM/FM switch and presets, order-up alert with Admin-set delay (RRA-124..126) · Infra · S · added 2026-11-24
- [x] RSW-028 · Shared app caught up with Bootleggers 0.8.0: POS seating with areas, table tabs, Orders popup, picture menu, orange Sent button, Pay popup, full-screen work screens, Music, Gift cards, prep tabs, Stock count tabs, Clear test data (RRA-106..121). Menu, menu photos, POS choices, gift card shop and radio stations are optional keys in each restaurant's brand.js; without them the menu starts empty, tiles are colored and Gift cards is hidden · Infra · M · added 2026-11-24
### Shared app 0.7.1 · build 2026.11.22-2
- [x] RSW-026 · Shared app caught up with Bootleggers 0.7.1: Payroll, Point of sale, event reminders, one-section-at-a-time lists (RRA-094..105). Keeps the shared-app differences (per-restaurant keys, no Bootleggers menu) · Infra · M · added 2026-11-22
### Wizard 0.1.0 · shared app 0.6.0 · build 2026.11.22-1
- [x] RSW-001 · Brand settings file in Bootleggers (BPAY-017, Bootleggers PR #19) · Infra · M
- [x] RSW-002 · Shared app in `app/`: one copy of the code; each restaurant is a small folder `r/<id>/` (name, icons, brand.js, sw.js, notices). Admin keys, Firebase and Report key are per restaurant; Bootleggers' menu and food stock list taken out · Infra · L
- [x] RSW-003 · Separate data per restaurant: own saved-settings prefix, on-phone database and shared-data folder, named from the Restaurant ID · Safety · M
- [x] RSW-004 · Setup wizard: Details (name, short name with 12-letter check, app name, location, © credit line, Restaurant ID) · UI · M
- [x] RSW-005 · Pictures: logo upload, app icon from letter, logo or your own picture (fill or fit); 180px icon, 192/512 Android icons and 32px favicon made automatically; optional startup video · UI · M
- [x] RSW-006 · Accent color: system blue or a restaurant color (presets, color picker or code) · UI · S
- [x] RSW-007 · iPhone-sized preview of the real app (Light/Dark, iPhone/Android look, replay startup) and a home-screen icon preview · UI · M
- [x] RSW-008 · Produce: download or share the restaurant's folder as a zip, copy brand.js, upload steps · UI · M
- [x] RSW-009 · Restaurants list (drafts on this device), About, Info, What's new, Appearance · Docs · S
- [x] RSW-014 · Demo restaurant `r/harbor/` (Harbor Street Grill) made with the wizard · Docs · S

## ⚪ Dropped
- RSW-023 · Move Bootleggers onto the shared app — Bootleggers stays its own standalone app (Gaylan, 2026-11-26)
