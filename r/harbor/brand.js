// Brand settings for Harbor Street Grill (made with the setup wizard 0.1.0 on 2026-11-22).
// Names, pictures, colors and this restaurant's own data space. The app
// itself is shared: /app. Keep index.html and manifest.webmanifest in step
// with the names and icons (iPhone reads them from the page).

self.BRAND = {
  // Names
  appName: "Harbor Kitchen", // page title, About, startup screen, messages
  shortName: "Harbor", // name under the home-screen icon
  restaurant: "Harbor Street Grill", // printed footers, notices
  location: "Savannah, GA",
  tagline: "Recipes and kitchen notes for Harbor Street Grill, Savannah, GA.",
  credit: "© 2026 Demo Brand", // © line in About. Empty = hidden.

  // Pictures and video
  logo: "assets/logo.png",
  icon180: "assets/app-icon-180.png",
  icon192: "assets/app-icon-192.png",
  icon512: "assets/app-icon-512.png",
  favicon: "assets/favicon-32.png",
  introVideo: "", // '' = no startup clip

  // Look. null keeps the Apple / Android system colors.
  accent: "#00778b",

  // Data space: this restaurant's own. Never reuse or change on a live app.
  dataPrefix: "rsw.harbor.",
  dbName: "rsw-harbor",
  teamId: "harbor", // shared data: teams/<teamId> in Firebase
  reportPrefix: "Harbor —",

  // Set up later (Needs you): Admin phone key, shared data, Report a problem.
  adminKeys: [], // empty = the app offers Admin setup
  firebase: null, // null = data stays on each phone
  reportKey: "", // Web3Forms key; empty = reports are copied instead
  brandVersion: 1795368460527, // change when names or pictures change, so phones update
};
