# Restaurant Setup (RSW): Build list

Project code: `RSW`. One shared restaurant app (from Bootleggers Kitchen) and a setup wizard that makes each restaurant's version. A fix made once in `app/` reaches every restaurant.

## 🔴 Needs you
- [ ] RSW-010 · Turn on GitHub Pages: repo Settings → Pages → Deploy from a branch → `main` / `(root)` → Save. The prototype link is then https://michaelgaylan.github.io/restaurant-app/setup/ · Infra · S
- [ ] RSW-011 · Code ownership: if Bootleggers paid for their app, get written confirmation (email is fine) that you can reuse the code for other restaurants before selling it. Ask who owns the code, whether you can license it to other restaurants, and that Bootleggers' recipes, menu and logo stay theirs · Safety · S
- [ ] RSW-012 · Your © credit line: once your brand name is cleared, enter it once in the wizard (Details → © credit line). It's remembered for every new restaurant · Content · S
- [ ] RSW-013 · Try the wizard on your iPhone once Pages is on: make a test restaurant, check the preview, download the zip · Docs · S

## 🔵 Build list
- [ ] RSW-020 · Each restaurant's own starter menu and stock list (content file per restaurant; the shared app now starts with an empty menu and only non-food supplies) · Data · M · added 2026-11-22
- [ ] RSW-021 · Shared data (Firebase) per restaurant: one Firebase project for all restaurants, each under `teams/<id>` (rules in `app/firestore.rules` already allow that), and the wizard fills in the config · Infra · M · added 2026-11-22
- [ ] RSW-022 · Report a problem per restaurant: Web3Forms key field in the wizard · Infra · S · added 2026-11-22
- [ ] RSW-023 · Move Bootleggers onto the shared app as `r/bootleggers/`, keeping its data names (`blg.`, `bootleggers`), as a planned switch (staff re-add the app to their home screen) · Infra · L · added 2026-11-22
- [ ] RSW-024 · Merge the Payroll module into the shared app (after BPAY merge checklist) · Infra · L · added 2026-11-22
- [ ] RSW-025 · Wizard "Publish" button that uploads the restaurant folder to GitHub directly, instead of download + upload · Infra · M · added 2026-11-22

## 🟡 Hold

## 🟣 Done
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
