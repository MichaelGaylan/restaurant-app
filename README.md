# restaurant-app

One shared restaurant app for many restaurants, plus a setup wizard that makes each restaurant's version. Built from Bootleggers Kitchen. Project code `RSW`.

No build step: plain HTML, CSS and JavaScript modules, served as static files with GitHub Pages.

## Layout
- `app/`: the shared app, used by every restaurant. A fix here reaches all of them.
  - `css/app.css`, `js/ui.js` and the screens, the same as Bootleggers Kitchen
  - `js/head.js`, `js/shell.js`: the page head and body every restaurant shares
  - `sw-core.js`: shared offline support (bump `APP_BUILD` with every release)
  - `firestore.rules`: shared-data rules, one folder per restaurant (`teams/<id>`)
  - `js/owner.js`: who owns the app's code (VYBEON for now). One line, shown in About everywhere
- `r/<id>/`: one restaurant. It holds only `index.html` (name and icons for iPhone), `brand.js` (names, pictures, color, data space and keys; starter `menu`/`menuVersion`, `starterStock`, `drinks`, `posChoices`, `presetVendors`; optional `menuPhotoDir`/`menuPhotos` for dish pictures in `assets/menu/`, `posTrim`, `giftCards`, `radio`), `sw.js`, `manifest.webmanifest`, `assets/` and `data/` (notices, revoked invites).
  - `r/bootleggers/`: Bootleggers Bar & Grill (moved from the Bootleggers repo; same data names, so it shares the old app's team data)
  - `r/harbor/`: a demo restaurant made with the wizard
  - `r/preview/`: what the wizard's iPhone preview shows
- `setup/`: the Restaurant Setup wizard
- `TODO.md`: the build lists

## Add a restaurant
Open `setup/`, fill in the six steps (Details, Pictures, Color, Menu, Preview, Produce), download the zip, then upload its `r` folder here (Add file → Upload files). It opens at `…/restaurant-app/r/<id>/`.

## Releasing the shared app
Bump `VERSION` and `BUILD` in `app/js/config.js`, add a line to `WHATS_NEW`, and bump `APP_BUILD` in `app/sw-core.js` (add any new file to its list). Every restaurant's phones then update.

## Run locally
`python3 -m http.server` in this folder, then open http://localhost:8000/setup/
