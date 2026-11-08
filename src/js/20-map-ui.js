  /* =========================================================
     MAP UI: status bar colour, layers button, taps that close things
     ========================================================= */
  /* ---------- Status bar colour follows the app theme (standard iOS / Android behaviour) ---------- */
  function updateTopColour() {
    const c = document.documentElement.getAttribute('data-ui') === 'light' ? '#ffffff' : '#0f172a';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c);
    const SB = IS_NATIVE ? capPlugin('StatusBar') : null;
    if (!SB) return;
    try {
      Promise.resolve(SB.setStyle({ style: c === '#ffffff' ? 'LIGHT' : 'DARK' })).catch(() => {});
      if (SB.setBackgroundColor) Promise.resolve(SB.setBackgroundColor({ color: c })).catch(() => {});
    } catch (e) {}
  }

  /* ---------- Map layers button (phones): map type and route style in one place ---------- */
  function toggleLayers(e) {
    if (e) e.stopPropagation();
    const p = $('layers-panel');
    p.classList.toggle('open');
    $('layers-btn').classList.toggle('active', p.classList.contains('open'));
  }
  function closeLayers() {
    const p = $('layers-panel');
    if (p && p.classList.contains('open')) { p.classList.remove('open'); $('layers-btn').classList.remove('active'); }
  }
  function initLayersAutoClose() {
    document.addEventListener('click', e => {
      const o = document.querySelector('.map-controls-overlay');
      if (o && !o.contains(e.target)) closeLayers();
    }, true);
  }

  /* ---------- Tapping the map to close something shouldn't drop a pin ---------- */
  let suppressMapTapUntil = 0;
  function somethingOpen() {
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return true;
    if (document.querySelector('.dropdown-menu.show, .layers-panel.open, .modal-overlay[style*="flex"]')) return true;
    const vis = id => { const el = $(id); return el && el.style.display && el.style.display !== 'none'; };
    return vis('search-results') || vis('day-menu') || vis('context-menu') || vis('date-popover') || vis('area-results');
  }
  function initMapTapGuard() {
    document.addEventListener('pointerdown', e => {
      const mapEl = $('map');
      if (!mapEl || !mapEl.contains(e.target)) return;
      if (somethingOpen()) suppressMapTapUntil = Date.now() + 700;
    }, true);
  }
  function mapTapSuppressed() { return Date.now() < suppressMapTapUntil; }
