  /* =========================================================
     OFFLINE MAPS: save the map pieces for a day or the current view
     ========================================================= */
  const TILE_CACHE = 'mappin-tiles';
  const MAX_OFFLINE_TILES = 900;
  let offlineSaving = false;

  function tileKey(url) { return url.replace(/([?&])(session|key)=[^&]*/g, '$1').replace(/[?&]+$/, '').replace(/&&+/g, '&').replace(/\?&/, '?'); }
  const lng2x = (lng, z) => Math.floor((lng + 180) / 360 * Math.pow(2, z));
  const lat2y = (lat, z) => { const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); };

  function tilesForBounds(b, zmin, zmax) {
    const out = [];
    for (let z = zmin; z <= zmax; z++) {
      const x0 = lng2x(b.getWest(), z), x1 = lng2x(b.getEast(), z), y0 = lat2y(b.getNorth(), z), y1 = lat2y(b.getSouth(), z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ x, y, z });
    }
    return out;
  }

  function progressToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span></span>`;
    el.firstChild.textContent = msg;
    $('toast-host').appendChild(el);
    return { set: m => { el.firstChild.textContent = m; }, done: (m, ms = 4000) => { el.firstChild.textContent = m; setTimeout(() => el.remove(), ms); } };
  }

  function saveDayOffline(day) {
    closeMenus();
    const pts = rawData.filter(s => s.day === day && hasCoords(s)).map(s => [s.lat, s.lng]);
    if (!pts.length) { showToast(t('offlineNoStops'), { ms: 3500 }); return; }
    let b = L.latLngBounds(pts);
    if (pts.length === 1) b = L.latLngBounds([pts[0][0] - 0.01, pts[0][1] - 0.012], [pts[0][0] + 0.01, pts[0][1] + 0.012]);
    saveOfflineArea(b.pad(0.25));
  }
  function saveViewOffline() { saveOfflineArea(map.getBounds()); }

  async function saveOfflineArea(bounds) {
    if (offlineSaving) return;
    if (!('caches' in window)) { showToast(t('offlineFailed'), { ms: 4000 }); return; }
    if (!navigator.onLine) { showToast(t('offlineNeedsNet'), { ms: 4000 }); return; }
    const zFit = Math.max(3, Math.min(16, map.getBoundsZoom(bounds)));
    let zmin = Math.max(3, zFit - 2), zmax = 17;
    let tiles = tilesForBounds(bounds, zmin, zmax);
    while (tiles.length > MAX_OFFLINE_TILES && zmax > zFit) { zmax--; tiles = tilesForBounds(bounds, zmin, zmax); }
    if (tiles.length > MAX_OFFLINE_TILES) { showToast(t('offlineTooBig'), { ms: 5000 }); return; }
    const type = currentTileType === 'sat' ? 'sat' : 'light';
    const tmpl = tileUrl(type);
    offlineSaving = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
    const pt = progressToast(t('offlineSaving', { n: 0 }));
    let cache;
    try { cache = await caches.open(TILE_CACHE); } catch (e) { offlineSaving = false; pt.done(t('offlineFailed')); return; }
    let done = 0, ok = 0, i = 0;
    const worker = async () => {
      while (i < tiles.length) {
        const tl = tiles[i++];
        const url = tmpl.replace('{x}', tl.x).replace('{y}', tl.y).replace('{z}', tl.z);
        try {
          let res = null;
          try { res = await fetch(url, { mode: 'cors', credentials: 'omit' }); if (!res.ok) res = null; } catch (e) { res = null; }
          if (!res) res = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
          if (res && (res.ok || res.type === 'opaque')) { await cache.put(tileKey(url), res); ok++; }
        } catch (e) {}
        done++;
        if (done % 20 === 0) pt.set(t('offlineSaving', { n: Math.round(done / tiles.length * 100) }));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    offlineSaving = false;
    pt.done(ok ? t('offlineSaved', { n: ok }) : t('offlineFailed'), ok ? 4500 : 5000);
    if ($('settings-modal').style.display === 'flex') refreshOfflineCount();
  }

  async function refreshOfflineCount() {
    const el = $('offline-count');
    if (!el) return;
    try { const c = await caches.open(TILE_CACHE); el.textContent = t('offlineCount', { n: (await c.keys()).length }); }
    catch (e) { el.textContent = ''; }
  }
  async function clearOfflineMaps() {
    try { await caches.delete(TILE_CACHE); } catch (e) {}
    showToast(t('offlineCleared'), { ms: 2500 });
    refreshOfflineCount();
  }
  function offlineSettingsHtml() {
    if (!('caches' in window)) return '';
    setTimeout(refreshOfflineCount, 0);
    return `<div class="settings-section">
        <h3><i class="fa-solid fa-download"></i> ${escapeHtml(t('offlineSection'))}</h3>
        <p class="settings-note">${escapeHtml(t('offlineHint'))}</p>
        <div class="row-inline" style="margin-top:8px">
          <button class="btn btn-primary" onclick="closeSettings(); saveViewOffline()"><i class="fa-solid fa-download"></i> ${escapeHtml(t('saveOfflineArea'))}</button>
          <button class="btn btn-secondary" onclick="clearOfflineMaps()"><i class="fa-solid fa-trash"></i> ${escapeHtml(t('offlineClear'))}</button>
        </div>
        <p class="settings-note" id="offline-count" style="margin-top:6px"></p>
      </div>`;
  }
