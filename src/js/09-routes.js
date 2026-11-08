  /* =========================================================
     ROUTES: real walking / driving paths with travel times
     (free OpenStreetMap router; public transport would need Google later)
     ========================================================= */
  const ROUTERS = {
    foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/',
    car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/'
  };
  const ROUTE_MAX_KM = { foot: 40, car: 900 };
  let routeCache = {};
  try { routeCache = JSON.parse(localStorage.getItem('mappin_route_cache_v1') || '{}'); } catch (e) { routeCache = {}; }
  let routeQueue = [], routeActive = 0;
  const routeInflight = new Set();

  function saveRouteCache() {
    try {
      const keys = Object.keys(routeCache);
      if (keys.length > 700) keys.slice(0, keys.length - 700).forEach(k => delete routeCache[k]);
      localStorage.setItem('mappin_route_cache_v1', JSON.stringify(routeCache));
    } catch (e) {}
  }

  function routeKey(mode, a, b) { return `${mode}|${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`; }

  function formatDuration(sec) {
    const m = Math.max(1, Math.round(sec / 60));
    if (m < 60) return `${m} ${t('minShort')}`;
    const h = Math.floor(m / 60), rm = m % 60;
    return rm ? `${h} ${t('hourShort')} ${rm} ${t('minShort')}` : `${h} ${t('hourShort')}`;
  }

  function formatDistance(mtr) {
    if (mtr < 1000) return `${Math.round(mtr / 10) * 10} m`;
    return `${(mtr / 1000).toLocaleString(LANG, { maximumFractionDigits: mtr < 20000 ? 1 : 0 })} km`;
  }

  function travelPillHtml(mode, a, b) {
    const straight = distMeters([a.lat, a.lng], [b.lat, b.lng]);
    if (mode === 'transit') {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=transit&hl=${LANG}`;
      return `<i class="fa-solid fa-train-subway"></i> <a href="${url}" target="_blank" rel="noopener">${escapeHtml(t('transitLeg'))} ↗</a> · ${formatDistance(straight)}`;
    }
    const icon = mode === 'car' ? 'fa-car' : 'fa-person-walking';
    if (straight / 1000 > ROUTE_MAX_KM[mode]) return `<i class="fa-solid fa-train"></i> ${escapeHtml(t('longHop', { km: formatDistance(straight) }))}`;
    const c = routeCache[routeKey(mode, a, b)];
    if (!c) return `<i class="fa-solid ${icon}"></i> ${escapeHtml(t('calculating'))}`;
    if (c.none) return `<i class="fa-solid ${icon}"></i> ${escapeHtml(t('noRoute'))} · ${formatDistance(straight)}`;
    return `<i class="fa-solid ${icon}"></i> ${escapeHtml(formatDuration(c.d))} · ${formatDistance(c.s)}`;
  }

  function requestRoute(mode, a, b) {
    const key = routeKey(mode, a, b);
    if (routeCache[key] || routeInflight.has(key)) return;
    routeInflight.add(key);
    routeQueue.push({ key, mode, a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng } });
    pumpRoutes();
  }

  function pumpRoutes() {
    while (routeActive < 2 && routeQueue.length) {
      const job = routeQueue.shift();
      routeActive++;
      fetchRoute(job).finally(() => { routeActive--; routeInflight.delete(job.key); setTimeout(pumpRoutes, 150); });
    }
  }

  async function fetchRoute(job) {
    if (job.mode !== routeMode) return; // user switched mode meanwhile
    try {
      const d = await fetchJson(`${ROUTERS[job.mode]}${job.a.lng},${job.a.lat};${job.b.lng},${job.b.lat}?overview=simplified&geometries=geojson`, 9000);
      const r = d && d.routes && d.routes[0];
      routeCache[job.key] = r
        ? { d: r.duration, s: r.distance, c: r.geometry.coordinates.map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]) }
        : { none: true };
      saveRouteCache();
      applyRoute(job.key);
    } catch (e) { /* keep the straight line; try again next render */ }
  }

  function applyRoute(key) {
    const c = routeCache[key];
    polylineSegments.filter(p => p.routeKey === key).forEach(p => {
      if (c && c.c) { p.layer.setLatLngs(c.c); if (p.glow) p.glow.setLatLngs(c.c); }
    });
    document.querySelectorAll(`.travel-pill[data-route="${key}"]`).forEach(el => {
      const [mode, a, b] = key.split('|');
      const [alat, alng] = a.split(',').map(Number), [blat, blng] = b.split(',').map(Number);
      el.innerHTML = travelPillHtml(mode, { lat: alat, lng: alng }, { lat: blat, lng: blng });
    });
  }

  function setRouteMode(mode) {
    routeMode = mode;
    savePref('mappin_route_mode', mode);
    routeQueue = [];
    updateRouteButtons();
    renderItinerary();
  }

  function updateRouteButtons() {
    ['straight', 'foot', 'car', 'transit'].forEach(m => { const b = $(`route-${m}`); if (b) b.classList.toggle('active', routeMode === m); });
  }

  /* ---------- Per-pin lock (in each pin's pop-up) ---------- */
  function togglePinLockFor(id) {
    const item = rawData.find(d => d.id === id);
    if (!item) return;
    item.locked = !item.locked;
    map.closePopup();
    renderItinerary();
    const m = markers.find(mk => mk.id === id);
    if (m) m.openPopup();
    showToast(item.locked ? t('pinLocked') : t('pinUnlocked'), { ms: 2000 });
  }

  function deleteCard(id) {
    rawData = rawData.filter(item => item.id !== id);
    delete stopToGroup[id];
    selectedStopIds.delete(id);
    pruneEmptyGroups();
    populateFilters();
    renderItinerary();
  }
