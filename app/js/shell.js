// Shared page body for every restaurant (RSW). A restaurant's index.html is
// only its head (name, icons) plus this script, so a fix here reaches every
// restaurant at once. Inserted while the page loads, then the app starts.
(function () {
  var me = document.currentScript;
  me.insertAdjacentHTML('beforebegin', `
  <!-- Startup screen (RRA-014) with the intro clip (RRA-022) -->
  <div id="splash" hidden>
    <video id="splash-video" muted playsinline preload="auto"></video>
    <button id="splash-skip" class="splash-skip" type="button">Skip</button>
    <div id="splash-card" class="splash-card" hidden></div>
  </div>

  <!-- Pinned logo behind the control bar (RRA-023) -->
  <header id="top" class="top">
    <div class="top-logo" aria-hidden="true"><img id="brand-logo" alt=""></div>
    <div class="top-bar">
      <button id="btn-back" class="icon-btn" type="button" aria-label="Back" hidden>
        <svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="spacer"></span>
      <!-- Night mode in one tap (RRA-067) -->
      <button id="btn-night" class="icon-btn" type="button" aria-label="Night mode">
        <svg class="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        <svg class="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button id="btn-bell" class="icon-btn" type="button" aria-label="Board and notices" hidden>
        <svg viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>
        <span id="bell-dot" class="dot" hidden></span>
      </button>
    </div>
    <div class="top-title">
      <h1 id="title"></h1>
      <div id="title-action"></div>
    </div>
  </header>

  <!-- Sidebar on tablets and computers (RRA-051). Filled by app.js. -->
  <nav id="side" class="side" hidden></nav>

  <main id="view" class="view"></main>

  <nav id="tabs" class="tabs" hidden>
    <a href="#/recipes" data-tab="recipes">
      <svg viewBox="0 0 24 24"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>
      <span>Recipes</span></a>
    <a href="#/prep" data-tab="prep">
      <svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>Prep</span></a>
    <a href="#/stock" data-tab="stock">
      <svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>
      <span>Stock</span></a>
    <a href="#/lounge" data-tab="lounge">
      <svg viewBox="0 0 24 24"><path d="M4 10h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>Lounge</span><i id="tab-badge" class="badge" hidden></i></a>
    <a href="#/more" data-tab="more">
      <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>
      <span>More</span></a>
  </nav>

  <dialog id="dlg" class="sheet"></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`);
  var s = document.createElement('script');
  s.type = 'module';
  s.src = new URL('app.js', me.src).href;
  document.body.appendChild(s);
})();
