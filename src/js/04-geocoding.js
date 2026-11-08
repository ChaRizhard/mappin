  /* =========================================================
     NETWORK HELPERS
     ========================================================= */
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Fetch JSON with a hard timeout so nothing can hang forever
  async function fetchJson(url, ms = 8000, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort());
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) { const err = new Error('HTTP ' + res.status); err.status = res.status; throw err; }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const OVERPASS_MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

  // Ask both public Overpass mirrors and use whichever answers first
  async function overpassRaw(query, ms = 6000) {
    const stop = new AbortController();
    try {
      const data = await Promise.any(OVERPASS_MIRRORS.map(m => fetchJson(`${m}?data=${encodeURIComponent(query)}`, ms, { signal: stop.signal })));
      return (data.elements || []).map(el => {
        const elat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
        const elng = el.lon !== undefined ? el.lon : el.center && el.center.lon;
        return { tags: el.tags || {}, lat: elat, lng: elng, type: el.type, id: el.id };
      }).filter(e => e.lat !== undefined && e.lng !== undefined);
    } finally {
      stop.abort();
    }
  }

  function overpassNear(lat, lng, radius, ms = 6000) {
    return overpassRaw(`[out:json][timeout:6];nwr(around:${Math.round(radius)},${lat},${lng})[name];out tags center 40;`, ms);
  }

  function osmRefOf(type, id) {
    const t0 = String(type || '').charAt(0).toUpperCase();
    return ['N', 'W', 'R'].includes(t0) && id ? `${t0}${id}` : null;
  }

  /* =========================================================
     GEOCODING (works anywhere; no hard-coded place tables)
     - Each stop's city is located once and used as an "anchor":
       results more than 80 km away are rejected as wrong matches.
     - Photon (fast, typo-tolerant, biased towards the city) and
       Nominatim work through the queue side by side.
     - Everything is cached in this browser, so re-imports are instant.
     ========================================================= */
  let geoQueue = [];
  let geoCache = {};
  try { geoCache = JSON.parse(localStorage.getItem('mappin_geocode_cache_v1') || '{}'); } catch (e) { geoCache = {}; }

  function saveGeoCache() {
    try {
      const keys = Object.keys(geoCache);
      if (keys.length > 4000) keys.slice(0, keys.length - 4000).forEach(k => delete geoCache[k]);
      localStorage.setItem('mappin_geocode_cache_v1', JSON.stringify(geoCache));
    } catch (e) {}
  }

  function cityParts(item) {
    const raw = (item.city || '').trim();
    return { clean: raw.replace(/_/g, ' ').trim(), first: raw.split(/[_\/|,]+/)[0].trim() };
  }

  function geoQueriesFor(item) {
    const title = (item.cleanTitle || item.title).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    const { clean: cityClean, first: cityFirst } = cityParts(item);
    const qs = [];
    if (item.address) {
      const low = item.address.toLowerCase();
      const extra = [cityFirst, item.country].filter(x => x && !low.includes(x.toLowerCase()));
      qs.push([item.address, ...extra].join(', '));
      const trimmed = item.address.replace(/\s+\S+$/, '').trim(); // "…1-17-13 Temple Name" → without the trailing name
      if (trimmed && trimmed !== item.address && trimmed.length > 6) qs.push(trimmed);
    }
    const linkQ = parseGoogleLink(item.link).query;
    if (linkQ && linkQ !== item.address) qs.push(linkQ);
    const tail = [cityFirst || cityClean, item.country].filter(Boolean).join(', ');
    if (tail) qs.push(`${title}, ${tail}`);
    if (cityClean && cityClean !== cityFirst) qs.push(`${title}, ${cityClean}`);
    if (!item.address && !tail) qs.push(title);
    return [...new Set(qs.filter(Boolean))];
  }

  function enqueueGeocode(item) {
    if (geoQueue.some(j => j.stopId === item.id && j.gen === importGeneration)) return;
    geoQueue.push({ stopId: item.id, gen: importGeneration, queries: geoQueriesFor(item), tried: new Set() });
    runGeoQueue();
  }

  function requeuePending() {
    rawData.forEach(r => {
      if (r.pending || (!hasCoords(r) && !r.notFound)) { r.pending = true; enqueueGeocode(r); }
    });
  }

  const GEO_PROVIDERS = {
    nominatim: {
      interval: 1100,
      url: (q) => `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      parse: d => (d && d.length ? [parseFloat(d[0].lat), parseFloat(d[0].lon), osmRefOf(d[0].osm_type, d[0].osm_id)] : null)
    },
    photon: {
      interval: 400,
      url: (q, bias) => `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(q)}${bias ? `&lat=${bias[0]}&lon=${bias[1]}` : ''}`,
      parse: d => {
        const f = d && d.features && d.features[0];
        return f ? [f.geometry.coordinates[1], f.geometry.coordinates[0], osmRefOf(f.properties && f.properties.osm_type, f.properties && f.properties.osm_id)] : null;
      }
    }
  };
  const geoWorkers = new Set();

  async function geocodeOne(q, provider, bias) {
    const key = q.toLowerCase() + (provider === 'photon' && bias ? `|${bias[0].toFixed(1)},${bias[1].toFixed(1)}` : '');
    if (Array.isArray(geoCache[key])) return { result: geoCache[key], cached: true };
    const missKey = `!${provider}|${key}`;
    if (geoCache[missKey]) return { result: null, cached: true };
    const P = GEO_PROVIDERS[provider];
    try {
      const result = P.parse(await fetchJson(P.url(q, bias), 8000));
      if (result) geoCache[key] = result; else geoCache[missKey] = true;
      saveGeoCache();
      return { result, cached: false };
    } catch (e) {
      return { result: null, cached: false, error: true, status: e.status };
    }
  }

  async function anchorFor(item, provider) {
    if (!item.cityKey) return null;
    if (cityAnchors[item.cityKey] !== undefined) return cityAnchors[item.cityKey];
    const { clean, first } = cityParts(item);
    const P = GEO_PROVIDERS[provider];
    for (const q of [...new Set([[clean, item.country].filter(Boolean).join(', '), [first, item.country].filter(Boolean).join(', ')])].filter(Boolean)) {
      const r = await geocodeOne(q, provider, null);
      if (!r.cached) await sleep(P.interval);
      if (r.result) { cityAnchors[item.cityKey] = [r.result[0], r.result[1]]; return cityAnchors[item.cityKey]; }
    }
    if (cityAnchors[item.cityKey] === undefined) cityAnchors[item.cityKey] = null;
    return cityAnchors[item.cityKey];
  }

  function withinAnchor(result, anchor) {
    return !anchor || distMeters([result[0], result[1]], anchor) < 80000;
  }

  function takeGeoJob(provider) {
    const i = geoQueue.findIndex(j => j.gen === importGeneration && !j.tried.has(provider));
    return i === -1 ? null : geoQueue.splice(i, 1)[0];
  }

  function runGeoQueue() {
    Object.keys(GEO_PROVIDERS).forEach(p => { if (!geoWorkers.has(p)) geoWorker(p); });
  }

  async function geoWorker(provider) {
    geoWorkers.add(provider);
    const P = GEO_PROVIDERS[provider];
    try {
      let job;
      while ((job = takeGeoJob(provider))) {
        let item = rawData.find(d => d.id === job.stopId);
        if (!item || !item.pending) continue;
        const anchor = await anchorFor(item, provider);

        let found = null;
        for (const q of job.queries) {
          const r = await geocodeOne(q, provider, anchor);
          if (!r.cached) await sleep(r.status === 429 ? 4000 : P.interval);
          if (job.gen !== importGeneration) break;
          if (r.result && withinAnchor(r.result, anchor)) { found = r.result; break; }
        }
        item = rawData.find(d => d.id === job.stopId); // state may have been restored meanwhile
        if (job.gen !== importGeneration || !item || !item.pending) continue;
        job.tried.add(provider);

        if (found) {
          item.lat = found[0]; item.lng = found[1]; item.pending = false;
          if (found[2]) item.osmRef = found[2];
        } else if (Object.keys(GEO_PROVIDERS).some(p => !job.tried.has(p))) {
          geoQueue.push(job); // let the other geocoder have a go
          runGeoQueue();
          continue;
        } else {
          item.pending = false;
          const cityCoords = anchor || cityAnchors[item.cityKey];
          if (cityCoords) {
            item.lat = cityCoords[0] + (Math.random() - 0.5) * 0.01;
            item.lng = cityCoords[1] + (Math.random() - 0.5) * 0.01;
            item.approx = true;
          } else {
            item.notFound = true;
          }
        }
        rebaseHistory();
        const locatedNow = rawData.filter(hasCoords).length;
        if (!userMovedMap && (locatedNow === 1 || locatedNow === 8)) pendingFitAll = true;
        updateGeoStatus();
        scheduleRender();
      }
    } finally {
      geoWorkers.delete(provider);
    }
    if (geoWorkers.size === 0) {
      scheduleHoursCheck(2000);
      updateGeoStatus();
      if (!userMovedMap) pendingFitAll = true;
      scheduleRender();
    }
  }

  function updateGeoStatus() {
    const pill = $('geo-status');
    const remaining = rawData.filter(d => d.pending).length;
    if (remaining > 0) {
      pill.style.display = 'inline-flex';
      pill.querySelector('span').innerText = t('locatingN', { n: remaining });
    } else {
      pill.style.display = 'none';
    }
  }

  function isUserBusy() {
    if (isDragging || openStopPopupId !== null || dpState) return true;
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#timeline') && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return true;
    return ['single-item-modal', 'color-modal'].some(id => $(id).style.display === 'flex');
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (isUserBusy()) { scheduleRender(); return; }
      populateFilters();
      renderItinerary();
    }, 1200);
  }
