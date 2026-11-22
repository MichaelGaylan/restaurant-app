// Live preview for the setup wizard (RSW). The wizard page holds the brand
// it is editing in window.RSW_PREVIEW; this frame shows the real app with it.
// Opened on its own, it shows a plain sample. Its data stays in its own space.
self.BRAND = Object.assign({
  appName: 'Sample Kitchen', shortName: 'Sample', restaurant: 'Sample Bar & Grill', location: 'Your town',
  tagline: 'Recipes and kitchen notes for Sample Bar & Grill.', credit: '',
  logo: '', icon180: '', icon192: '', icon512: '', favicon: '', introVideo: '', accent: null,
  adminKeys: [], firebase: null, reportKey: '', reportPrefix: 'Preview —',
}, (function () { try { return parent !== self && parent.RSW_PREVIEW || {}; } catch (e) { return {}; } })(), {
  // Always the preview's own data space, never a real restaurant's.
  dataPrefix: 'rsw.preview.', dbName: 'rsw-preview', teamId: 'preview', firebase: null, adminKeys: [],
});
