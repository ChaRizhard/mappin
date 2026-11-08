  /* =========================================================
     SEARCH: suggestions while typing; Enter = find places in this area
     ========================================================= */
  let searchTimeout = null;

  function nominatimSearchUrl(query, bounded) {
    const b = map.getBounds();
    const viewbox = `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
    return `https://nominatim.openstreetmap.org/search?format=json&accept-language=${LANG}&extratags=1&namedetails=1&limit=${bounded ? 40 : 6}&viewbox=${viewbox}&bounded=${bounded ? 1 : 0}&q=${encodeURIComponent(query)}`;
  }

  // Name in the chosen language when OpenStreetMap has one
  function localName(tags) {
    if (!tags) return '';
    if (LANG === 'zh') return tags['name:zh'] || tags['name:zh-Hans'] || tags['name:zh-CN'] || tags.name || '';
    return tags[`name:${LANG}`] || tags.name || tags['name:en'] || '';
  }

  function placeFromNominatim(p) {
    const nd = p.namedetails || {};
    const tags = Object.assign({}, p.extratags || {}, nd);
    if (p.class && p.type && !tags[p.class]) tags[p.class] = p.type;
    const name = localName(nd) || p.name || p.display_name.split(',')[0];
    return {
      name, lat: parseFloat(p.lat), lng: parseFloat(p.lon), address: p.display_name,
      category: prettyType(p.class, p.type), tags, osmRef: osmRefOf(p.osm_type, p.osm_id)
    };
  }

  function placeFromOsm(el) {
    const kind = elementKind(el.tags);
    const name = localName(el.tags);
    return {
      name, lat: el.lat, lng: el.lng,
      address: addressFromTags(el.tags) || (el.tags.name && el.tags.name !== name ? el.tags.name : ''),
      category: kind ? prettyType(kind.key, kind.value) : 'Place', tags: el.tags, osmRef: osmRefOf(el.type, el.id)
    };
  }

  // Photon ranks results by distance from the map centre, so "KFC" finds the nearby ones first
  function placeFromPhoton(f) {
    const pr = f.properties || {};
    const lat = f.geometry.coordinates[1], lng = f.geometry.coordinates[0];
    const addr = [[pr.housenumber, pr.street].filter(Boolean).join(' '), pr.district || pr.locality, pr.city, pr.state, pr.country].filter(Boolean);
    const tags = { name: pr.name };
    if (pr.osm_key) tags[pr.osm_key] = pr.osm_value;
    return {
      name: pr.name || addr[0] || '', lat, lng, address: addr.join(', '),
      category: prettyType(pr.osm_key, pr.osm_value), tags, osmRef: osmRefOf(pr.osm_type, pr.osm_id)
    };
  }

  async function fetchSuggestions(query) {
    const c = map.getCenter();
    const lang = ['en', 'de', 'fr'].includes(LANG) ? `&lang=${LANG}` : '';
    try {
      const d = await fetchJson(`https://photon.komoot.io/api/?limit=10&q=${encodeURIComponent(query)}&lat=${c.lat}&lon=${c.lng}&location_bias_scale=0.6&zoom=${Math.round(map.getZoom())}${lang}`, 6000);
      const list = (d.features || []).map(placeFromPhoton).filter(p => p.name);
      if (list.length) return list.sort((a, b) => distMeters([c.lat, c.lng], [a.lat, a.lng]) - distMeters([c.lat, c.lng], [b.lat, b.lng]));
    } catch (e) {}
    const d = await fetchJson(nominatimSearchUrl(query, false), 8000);
    return (d || []).map(placeFromNominatim);
  }

  function showSuggestions(list) {
    const box = $('search-results');
    if (!list.length) { box.style.display = 'none'; return; }
    const c = map.getCenter();
    box.innerHTML = `<div class="search-results-head"><span>${escapeHtml(t('suggestions'))}</span></div>`;
    list.slice(0, 7).forEach(p => {
      const row = document.createElement('div');
      row.className = 'search-result-item';
      const dist = formatDistance(distMeters([c.lat, c.lng], [p.lat, p.lng]));
      row.innerHTML = `<span>${escapeHtml(p.name)}<small>${escapeHtml([p.address, dist].filter(Boolean).join(' · '))}</small></span> <i class="fa-solid fa-location-crosshairs"></i>`;
      row.onclick = () => previewPlaceObj(p);
      box.appendChild(row);
    });
    box.style.display = 'block';
  }

  function handleSearchInput(e) {
    const query = e.target.value.trim();
    if (query.length < 2) { if (!query) showRecentSearches(); else $('search-results').style.display = 'none'; return; }
    lastAreaResults = [];
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      fetchSuggestions(query)
        .then(list => { lastSearchResults = list || []; if ($('search-input').value.trim() === query) showSuggestions(lastSearchResults); })
        .catch(() => {});
    }, 280);
  }

  // Clicking back into the search bar brings the suggestions (or area results) back
  function handleSearchFocus() {
    const q = $('search-input').value.trim();
    if (q.length < 2) { showRecentSearches(); return; }
    if (lastAreaResults.length) showAreaList(lastAreaResults);
    else if (lastSearchResults.length) showSuggestions(lastSearchResults);
    else handleSearchInput({ target: $('search-input') });
  }

  function handleSearchKey(e) {
    if (e.key === 'Enter') executeSearch();
    if (e.key === 'Escape') $('search-results').style.display = 'none';
  }

  function escapeOverpassRegex(s) { return s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&'); }

  function overpassArea(q, b) {
    const re = escapeOverpassRegex(q.trim());
    const cat = escapeOverpassRegex(q.trim().toLowerCase().replace(/\s+/g, '_').replace(/e?s$/, ''));
    const bb = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
    const qy = `[out:json][timeout:10];(
      nwr["name"~"${re}",i](${bb}); nwr["name:en"~"${re}",i](${bb}); nwr["name:${LANG}"~"${re}",i](${bb});
      nwr["brand"~"${re}",i](${bb}); nwr["brand:en"~"${re}",i](${bb}); nwr["operator"~"${re}",i][name](${bb}); nwr["cuisine"~"${cat}",i][name](${bb});
      nwr["amenity"~"^${cat}",i][name](${bb}); nwr["shop"~"^${cat}",i][name](${bb}); nwr["tourism"~"^${cat}",i][name](${bb});
    );out tags center 80;`;
    return overpassRaw(qy, 9000).then(els => els.filter(e => e.tags.name).map(placeFromOsm));
  }

  // Bounds helper: [south, west, north, east] -> object with the getters overpassArea expects
  function boxBounds(s, w, n, e) {
    return { getSouth: () => s, getWest: () => w, getNorth: () => n, getEast: () => e };
  }
  function viewBox() { const b = map.getBounds(); return boxBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast()); }
  function growBox(b, factor) {
    const cy = (b.getSouth() + b.getNorth()) / 2, cx = (b.getWest() + b.getEast()) / 2;
    const hy = (b.getNorth() - b.getSouth()) / 2 * factor, hx = (b.getEast() - b.getWest()) / 2 * factor;
    return boxBounds(cy - hy, cx - hx, cy + hy, cx + hx);
  }

  // "ramen in Shibuya", "kfc shibuya": find the place part so we can search all of that area
  async function resolveArea(query) {
    const words = query.trim().split(/\s+/);
    const tries = [];
    const m = query.match(/^(.+?)\s+(?:in|near|at|around|nearby)\s+(.+)$/i);
    if (m) tries.push([m[1], m[2]]);
    for (let k = words.length - 1; k >= 1 && tries.length < 3; k--) tries.push([words.slice(0, k).join(' '), words.slice(k).join(' ')]);
    const c = map.getCenter();
    for (const [what, where] of tries) {
      try {
        const d = await fetchJson(`https://photon.komoot.io/api/?limit=3&q=${encodeURIComponent(where)}&lat=${c.lat}&lon=${c.lng}&layer=city&layer=district&layer=locality&layer=county&layer=state&layer=country`, 6000);
        const f = (d.features || [])[0];
        if (!f) continue;
        const ex = f.properties.extent; // [west, north, east, south]
        let box = ex ? boxBounds(ex[3], ex[0], ex[1], ex[2]) : boxBounds(f.geometry.coordinates[1] - 0.02, f.geometry.coordinates[0] - 0.025, f.geometry.coordinates[1] + 0.02, f.geometry.coordinates[0] + 0.025);
        if (box.getNorth() - box.getSouth() < 0.02) box = growBox(box, 2.5); // tiny neighbourhoods: widen a little
        return { what, where: f.properties.name || where, box };
      } catch (e) {}
    }
    return null;
  }

  async function searchInBox(query, box) {
    const viewbox = `${box.getWest()},${box.getNorth()},${box.getEast()},${box.getSouth()}`;
    const nomi = fetchJson(`https://nominatim.openstreetmap.org/search?format=json&accept-language=${LANG}&extratags=1&namedetails=1&limit=50&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(query)}`, 8000)
      .then(d => (d || []).map(placeFromNominatim)).catch(() => []);
    const span = Math.max(box.getNorth() - box.getSouth(), box.getEast() - box.getWest());
    const ovp = span < 1.2 ? overpassArea(query, box).catch(() => []) : Promise.resolve([]);
    const merged = [];
    (await Promise.all([ovp, nomi])).flat().forEach(p => {
      if (!p || isNaN(p.lat) || !p.name) return;
      if (p.lat < box.getSouth() || p.lat > box.getNorth() || p.lng < box.getWest() || p.lng > box.getEast()) return;
      const n = normName(p.name);
      if (merged.some(m => normName(m.name) === n && distMeters([m.lat, m.lng], [p.lat, p.lng]) < 40)) return;
      merged.push(p);
    });
    return merged;
  }

  // Enter / magnifier: show every matching place in the area (like Google Maps) and move the map there
  async function executeSearch() {
    const query = $('search-input').value.trim();
    $('search-input').blur();
    if (!query) return;
    clearTimeout(searchTimeout);
    const box = $('search-results');
    const setStatus = msg => {
      box.innerHTML = `<div class="search-results-head"><span><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(msg)}</span></div>`;
      box.style.display = 'block';
    };
    setStatus(t('searchingArea'));

    // 1. The whole query in the current view
    let results = await searchInBox(query, viewBox());
    let areaBox = null;
    // 2. Few hits? Maybe the query names a place ("kfc shibuya")
    if (results.length < 3) {
      const area = await resolveArea(query);
      if (area) {
        setStatus(t('searchingIn', { place: area.where }));
        const inArea = await searchInBox(area.what, area.box);
        if (inArea.length >= results.length) { results = inArea; areaBox = area.box; }
      }
    }
    // 3. Still nothing: look a bit further around the view
    if (!results.length) { areaBox = growBox(viewBox(), 3); results = await searchInBox(query, areaBox); }
    // 4. Nothing nearby at all: show the closest match anywhere
    if (!results.length) {
      try {
        const list = await fetchSuggestions(query);
        if (list.length) { showToast(t('closestMatch')); previewPlaceObj(list[0]); }
        else { box.style.display = 'none'; showToast(t('noResults'), { ms: 3500 }); }
      } catch (e) { box.style.display = 'none'; showToast(t('searchUnavailable'), { ms: 3500 }); }
      return;
    }
    showAreaResults(results.slice(0, 80));
    // The places are on the map now, so close the list (tap the search bar to see it again)
    box.style.display = 'none';
    showToast(t('areaResultsN', { n: Math.min(results.length, 80) }), { ms: 2500 });
    // Move the map to what was found
    const b = L.latLngBounds(results.slice(0, 80).map(p => [p.lat, p.lng]));
    if (results.length === 1) map.flyTo([results[0].lat, results[0].lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
    else map.flyToBounds(b, { padding: [60, 60], maxZoom: 16, duration: 0.8 });
  }

  function showAreaResults(list) {
    clearAreaResults();
    clearPreviewPin();
    lastAreaResults = list;
    const mode = relocateTargetId !== null ? 'relocate' : 'add';
    list.forEach(place => {
      const key = regPlace(place);
      place.key = key;
      const icon = L.divIcon({ className: 'custom-map-pin', html: '<div class="area-pin-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -6] });
      const marker = L.marker([place.lat, place.lng], { icon, zIndexOffset: 4000 }).addTo(map);
      marker.bindPopup(previewPopupHtml(place, mode, key), { maxWidth: 300, minWidth: 250 });
      marker.on('popupopen', () => renderPreviewDetails(place, key, marker));
      areaMarkers.push({ marker, key });
    });
    showAreaList(list);
    updateSearchClear();
  }

  function showAreaList(list) {
    const box = $('search-results');
    box.innerHTML = `<div class="search-results-head"><span>${escapeHtml(t('areaResultsN', { n: list.length }))}</span><button onclick="clearAreaResults(); $('search-results').style.display='none';">${escapeHtml(t('clearResults'))}</button></div>`;
    list.forEach(place => {
      const row = document.createElement('div');
      row.className = 'search-result-item';
      row.innerHTML = `<span>${escapeHtml(place.name)}<small>${escapeHtml([place.category, place.address].filter(Boolean).join(' · '))}</small></span> <i class="fa-solid fa-location-dot"></i>`;
      row.onclick = () => {
        const am = areaMarkers.find(a => a.key === place.key);
        if (am) { map.panTo([place.lat, place.lng]); am.marker.openPopup(); }
      };
      box.appendChild(row);
    });
    box.style.display = 'block';
  }

  function clearAreaResults() {
    areaMarkers.forEach(a => map.removeLayer(a.marker));
    areaMarkers = [];
    lastAreaResults = [];
    if (typeof updateSearchClear === 'function') updateSearchClear();
  }

  function previewPlaceObj(p) {
    rememberSearch(p);
    $('search-results').style.display = 'none';
    $('search-input').blur();
    showPreviewPin(p, relocateTargetId !== null ? 'relocate' : 'add', { fly: true });
  }

  /* ---------- Click places on the map (like Google Maps) ---------- */
  function metersPerPixel(lat, zoom) { return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom); }

  function distMeters(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  const POI_KEYS = ['amenity', 'shop', 'tourism', 'leisure', 'historic', 'railway', 'public_transport', 'aeroway', 'office', 'craft', 'man_made', 'natural', 'healthcare', 'sport', 'attraction'];

  function elementKind(tags) {
    if (!tags) return null;
    for (const k of POI_KEYS) if (tags[k]) return { key: k, value: tags[k] };
    if (tags.building) return { key: 'building', value: tags.building };
    if (tags.place) return { key: 'place', value: tags.place };
    if (tags.highway) return { key: 'highway', value: tags.highway };
    return null;
  }

  function prettyType(key, value) {
    if (!value) return 'Place';
    const v = String(value).replace(/_/g, ' ');
    if (value === 'yes') return String(key || 'Place').replace(/_/g, ' ');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  function addressFromTags(tg) {
    return [
      [tg['addr:housenumber'], tg['addr:street']].filter(Boolean).join(' '),
      tg['addr:suburb'] || tg['addr:quarter'], tg['addr:city'], tg['addr:postcode']
    ].filter(Boolean).join(', ');
  }

  async function reverseLookup(lat, lng) {
    try {
      // Always ask for street-address detail, so the answer is about this spot rather than the whole suburb
      const d = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=${LANG}&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1&namedetails=1`, 6000);
      if (!d || d.error) return null;
      const nd = d.namedetails || {};
      const a = d.address || {};
      const isPoi = !!(d.name && POI_KEYS.includes(d.class));
      const street = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' ');
      const name = (isPoi && (localName(nd) || d.name)) || street || d.name || (d.display_name || '').split(',')[0] || t('droppedPin');
      return {
        name, lat: parseFloat(d.lat), lng: parseFloat(d.lon),
        address: d.display_name || '', category: isPoi ? prettyType(d.class, d.type) : t('droppedPin'),
        tags: isPoi ? Object.assign({}, d.extratags || {}, nd) : {}, named: !!d.name, isPoi, osmRef: isPoi ? osmRefOf(d.osm_type, d.osm_id) : null
      };
    } catch (e) { return null; }
  }

  function bestPoiFrom(els, lat, lng) {
    let best = null, bestScore = Infinity;
    els.forEach(el => {
      const kind = elementKind(el.tags);
      if (!kind) return;
      const w = POI_KEYS.includes(kind.key) ? 1 : kind.key === 'building' ? 2.2 : kind.key === 'place' ? 3 : 6;
      const score = distMeters([lat, lng], [el.lat, el.lng]) * w;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return best ? placeFromOsm(best) : null;
  }

  async function handleMapPlaceClick(latlng) {
    const lat = latlng.lat, lng = latlng.lng;
    const mode = relocateTargetId !== null ? 'relocate' : 'add';
    showPreviewPin({ name: t('lookingUp'), lat, lng, address: '', loading: true }, mode);
    const token = previewToken;

    // A fingertip's worth of map around the tap (at least 12 m, at most 60 m)
    const zoom = map.getZoom();
    const tapRadius = Math.min(60, Math.max(12, metersPerPixel(lat, zoom) * 22));
    const reverseP = reverseLookup(lat, lng);
    let place = null;
    if (zoom >= 14) {
      try {
        const poi = bestPoiFrom(await overpassNear(lat, lng, tapRadius, 1800), lat, lng);
        if (poi && distMeters([lat, lng], [poi.lat, poi.lng]) <= tapRadius) place = poi;
      } catch (e) { /* slow: use the address lookup */ }
    }
    if (!place) {
      const rev = await reverseP;
      if (rev) {
        // Only move the pin to the place found if it's a real place right where you tapped; otherwise keep your spot
        const onTarget = rev.isPoi && distMeters([lat, lng], [rev.lat, rev.lng]) <= tapRadius;
        place = onTarget ? rev : Object.assign({}, rev, { lat, lng, name: rev.isPoi ? rev.address.split(',')[0] : rev.name, category: rev.isPoi ? t('droppedPin') : rev.category });
      }
    }
    if (!place) place = { name: t('droppedPin'), lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, category: t('droppedPin'), tags: {} };

    if (token !== previewToken) return; // clicked somewhere else meanwhile
    showPreviewPin(place, mode);
  }

  /* ---------- Preview pin (search result, map click, removed stop) ---------- */
  function regPlace(p) { const k = 'p' + (++placeSeq); PLACE_REG[k] = p; return k; }

  function showPreviewPin(place, mode, opts = {}) {
    clearPreviewPin();
    previewToken++;
    previewMode = mode;
    const key = regPlace(place);
    previewKey = key;

    const isRestore = mode === 'restore';
    const icon = L.divIcon({
      className: `custom-map-pin ${isRestore ? 'ghost-pin' : 'preview-pin'}`,
      html: `<div class="teardrop-pin-container">${isRestore
        ? `<svg class="teardrop-svg" viewBox="0 0 36 46"><path d="M18 0 C27.94 0 36 8.06 36 18 C36 29 18 46 18 46 C18 46 0 29 0 18 C0 8.06 8.06 0 18 0 Z" fill="#64748b" stroke="#ffffff" stroke-width="2" stroke-dasharray="4,3"/></svg>`
        : teardropSvg('#ea4335', '', '#fff').replace('</svg>', '<circle cx="18" cy="17" r="6" fill="#7f1d1d" opacity="0.85"/></svg>')}</div>`,
      iconSize: [PIN_W, PIN_H], iconAnchor: [PIN_W / 2, PIN_H], popupAnchor: [0, -PIN_H + 4]
    });

    previewMarker = L.marker([place.lat, place.lng], { icon, zIndexOffset: 6000 }).addTo(map);
    previewMarker.bindPopup(previewPopupHtml(place, mode, key), { maxWidth: 300, minWidth: 250 });
    const thisPreview = previewMarker;
    previewMarker.on('popupclose', () => {
      if (previewClosingByCode) return;
      setTimeout(() => { if (previewMarker === thisPreview) clearPreviewPin(); }, 0);
    });

    const open = () => {
      if (previewMarker !== thisPreview) return;
      previewMarker.openPopup();
      if (!place.loading) renderPreviewDetails(place, key, previewMarker);
    };
    if (opts.fly) {
      map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
      map.once('moveend', open);
    } else {
      open();
    }
  }

  function previewPopupHtml(place, mode, key) {
    const days = getAllDays();
    const defaultDay = activeDay !== 'all' ? activeDay : (days[0] || 1);
    const dayOptions = (days.length ? days : [1]).map(d => `<option value="${d}" ${d == defaultDay ? 'selected' : ''}>${escapeHtml(getDayTitle(d))}</option>`).join('');
    let eyebrow = t('previewLabel'), button = '';
    if (mode === 'restore') {
      eyebrow = t('removedLabel');
      button = `<button class="pin-toggle-btn add" data-tooltip="${escapeHtml(t('addPin'))}" onclick="restoreRemovedPin()">${ADD_PIN_SVG}</button>`;
    } else if (mode === 'relocate') {
      const target = rawData.find(d => d.id === relocateTargetId);
      eyebrow = t('setLocFor', { name: target ? target.cleanTitle || target.title : '' });
      button = `<button class="pin-toggle-btn add" data-tooltip="${escapeHtml(t('setLocation'))}" onclick="applyRelocate('${key}')">${ADD_PIN_SVG}</button>`;
    } else {
      button = `<select class="mp-day-select" id="day-${key}" title="${escapeHtml(t('addToDay'))}">${dayOptions}</select>
                <button class="pin-toggle-btn add" data-tooltip="${escapeHtml(t('addPin'))}" onclick="addPlace('${key}')">${ADD_PIN_SVG}</button>`;
    }
    return `
      <div class="mp-popup">
        <div class="mp-eyebrow" style="color:${mode === 'restore' ? 'var(--text-muted)' : '#ea4335'}">${escapeHtml(eyebrow)}</div>
        <div class="mp-title">${escapeHtml(place.name)}</div>
        ${place.address ? `<div class="mp-sub">${escapeHtml(place.address)}</div>` : ''}
        <div class="place-details" id="pd-${key}">${place.loading ? `<div class="pd-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(t('findingNearest'))}</div>` : ''}</div>
        ${place.loading ? '' : `<div class="popup-actions-footer">${button}</div>`}
      </div>`;
  }

  function clearPreviewPin() {
    if (!previewMarker) return;
    previewToken++;
    previewClosingByCode = true;
    previewMarker.closePopup();
    map.removeLayer(previewMarker);
    previewMarker = null;
    previewClosingByCode = false;
    previewKey = null;
  }

  function nextStopId() { return rawData.length ? Math.max(...rawData.map(d => d.id)) + 1 : 0; }

  function addPlace(key) {
    const p = PLACE_REG[key];
    if (!p) return;
    const sel = $(`day-${key}`);
    const day = sel ? parseInt(sel.value) : (activeDay === 'all' ? 1 : activeDay);
    const newStop = {
      id: nextStopId(), title: p.name, cleanTitle: p.name, day, date: '', lat: p.lat, lng: p.lng,
      category: p.category || 'Added Place', time: '', desc: p.address || '', address: p.address || '',
      order: rawData.filter(d => d.day === day).length + 1, osmTags: p.tags || null, osmRef: p.osmRef || null,
      city: '', country: '', cityKey: '',
      hours: (p.tags && p.tags.opening_hours) || undefined, hoursChecked: !!(p.tags && p.tags.opening_hours)
    };
    rawData.push(newStop);
    if (previewKey === key) clearPreviewPin();
    const am = areaMarkers.findIndex(a => a.key === key);
    if (am !== -1) { map.removeLayer(areaMarkers[am].marker); areaMarkers.splice(am, 1); lastAreaResults = lastAreaResults.filter(r => r.key !== key); }
    if (!areaMarkers.length) $('search-input').value = '';
    populateFilters();
    renderItinerary();
    const marker = markers.find(m => m.id === newStop.id);
    if (marker) marker.openPopup();
  }

  // Remove Pin: removes the stop but leaves a faded pin with an "Add Pin" icon so it can be re-added
  function removePinFromPopup(id) {
    const item = rawData.find(d => d.id === id);
    if (!item) return;
    lastRemovedPin = { item: { ...item }, groupId: stopToGroup[id], index: rawData.indexOf(item) };
    map.closePopup();
    deleteCard(id);
    showPreviewPin({ name: item.title, lat: item.lat, lng: item.lng, address: item.address || item.desc || '', tags: item.osmTags || null, link: item.link, osmRef: item.osmRef }, 'restore');
  }

  function restoreRemovedPin() {
    const s = lastRemovedPin;
    if (!s) return;
    const stop = { ...s.item };
    if (rawData.some(d => d.id === stop.id)) stop.id = nextStopId();
    rawData.splice(Math.min(s.index, rawData.length), 0, stop);
    if (s.groupId && GROUPS[s.groupId]) stopToGroup[stop.id] = s.groupId;
    lastRemovedPin = null;
    clearPreviewPin();
    populateFilters();
    renderItinerary();
    const marker = markers.find(m => m.id === stop.id);
    if (marker) marker.openPopup();
  }

  /* ---------- Relocate a stop that couldn't be found ---------- */
  function startRelocate(id, e) {
    if (e) e.stopPropagation();
    const item = rawData.find(d => d.id === id);
    if (!item) return;
    relocateTargetId = id;
    $('relocate-banner').style.display = 'flex';
    $('relocate-text').innerText = t('relocating', { name: item.cleanTitle || item.title });
    const input = $('search-input');
    input.value = [item.cleanTitle || item.title, cityParts(item).clean].filter(Boolean).join(', ');
    input.focus();
    handleSearchInput({ target: input });
  }

  function cancelRelocate() {
    relocateTargetId = null;
    $('relocate-banner').style.display = 'none';
    if (previewMode === 'relocate') clearPreviewPin();
  }

  function applyRelocate(key) {
    const item = rawData.find(d => d.id === relocateTargetId);
    const p = PLACE_REG[key];
    if (item && p) {
      item.lat = p.lat; item.lng = p.lng;
      item.pending = false; item.approx = false; item.notFound = false;
      item.hoursChecked = false; item.hours = undefined;
      if (p.tags) item.osmTags = p.tags;
      if (p.tags && p.tags.opening_hours) { item.hours = p.tags.opening_hours; item.hoursChecked = true; }
      if (p.osmRef) item.osmRef = p.osmRef;
    }
    clearPreviewPin();
    clearAreaResults();
    cancelRelocate();
    $('search-input').value = '';
    $('search-results').style.display = 'none';
    populateFilters();
    renderItinerary();
    if (item) { const m = markers.find(mk => mk.id === item.id); if (m) m.openPopup(); }
  }

  /* =========================================================
     PLACE DETAILS: opening hours, contact, photo, Google link
     Sources (free): Nominatim lookup by OSM id, then a name search
     around the pin, then Overpass. Cached in this browser.
     ========================================================= */
  let detailsCache = {};
  try { detailsCache = JSON.parse(localStorage.getItem('mappin_place_cache_v2') || '{}'); } catch (e) { detailsCache = {}; }
  function saveDetailsCache() {
    try {
      const keys = Object.keys(detailsCache);
      if (keys.length > 1500) keys.slice(0, keys.length - 1500).forEach(k => delete detailsCache[k]);
      localStorage.setItem('mappin_place_cache_v2', JSON.stringify(detailsCache));
    } catch (e) {}
  }

  function googleSearchUrl(place) {
    if (place.link && /google\.[a-z.]+\/maps/.test(place.link)) return place.link;
    const q = [place.name, place.address].filter(Boolean).join(', ') || `${place.lat},${place.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}&hl=${LANG}`;
  }

  function normName(s) { return String(s || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ''); }

  async function lookupTagsByRef(ref) {
    const d = await fetchJson(`https://nominatim.openstreetmap.org/lookup?format=json&extratags=1&namedetails=1&accept-language=${LANG}&osm_ids=${ref}`, 7000);
    if (!d || !d[0]) return null;
    const x = d[0];
    const tags = Object.assign({}, x.extratags || {}, x.namedetails || {});
    if (x.class && x.type && !tags[x.class]) tags[x.class] = x.type;
    return tags;
  }

  async function lookupTagsNearby(name, lat, lng) {
    const dl = 0.012;
    const url = `https://nominatim.openstreetmap.org/search?format=json&extratags=1&namedetails=1&limit=5&bounded=1&accept-language=${LANG}` +
      `&viewbox=${lng - dl},${lat + dl},${lng + dl},${lat - dl}&q=${encodeURIComponent(name)}`;
    const d = await fetchJson(url, 7000);
    let best = null, bestD = Infinity;
    (d || []).forEach(x => {
      const dist = distMeters([lat, lng], [parseFloat(x.lat), parseFloat(x.lon)]);
      if (dist < 900 && dist < bestD) { bestD = dist; best = x; }
    });
    if (!best) return null;
    const tags = Object.assign({}, best.extratags || {}, best.namedetails || {});
    if (best.class && best.type && !tags[best.class]) tags[best.class] = best.type;
    return { tags, ref: osmRefOf(best.osm_type, best.osm_id) };
  }

  async function overpassNameMatch(item) {
    const els = await overpassNear(item.lat, item.lng, 150, 6000);
    const target = normName(item.cleanTitle || item.title);
    let best = null, bestD = Infinity;
    els.forEach(el => {
      const names = [el.tags.name, el.tags['name:en'], el.tags['name:ja'], el.tags[`name:${LANG}`], el.tags.brand].map(normName).filter(Boolean);
      const d = distMeters([item.lat, item.lng], [el.lat, el.lng]);
      const nameMatch = target.length > 2 && names.some(n => n.length > 2 && (n.includes(target) || target.includes(n)));
      const kind = elementKind(el.tags);
      if (!(nameMatch || (d < 25 && kind && POI_KEYS.includes(kind.key)))) return;
      const score = nameMatch ? d : d + 1000;
      if (score < bestD) { bestD = score; best = el; }
    });
    return best ? { tags: best.tags, ref: osmRefOf(best.type, best.id) } : null;
  }

  // Returns tags, null (nothing found) or undefined (every source failed / timed out)
  async function findTagsForStop(item) {
    const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}|${normName(item.cleanTitle || item.title)}|${LANG}`;
    if (key in detailsCache) return detailsCache[key];
    let tags = null, anyOk = false;
    if (item.osmRef) {
      try { tags = await lookupTagsByRef(item.osmRef); anyOk = true; } catch (e) {}
    }
    if (!tags) {
      const q = (item.cleanTitle || item.title).replace(/\([^)]*\)/g, '').trim();
      try { const r = await lookupTagsNearby(q, item.lat, item.lng); anyOk = true; if (r) { tags = r.tags; if (r.ref) item.osmRef = r.ref; } } catch (e) {}
    }
    if (!tags) {
      try { const r = await overpassNameMatch(item); anyOk = true; if (r) { tags = r.tags; if (r.ref) item.osmRef = r.ref; } } catch (e) {}
    }
    if (!anyOk) return undefined;
    detailsCache[key] = tags;
    saveDetailsCache();
    return tags;
  }

  async function loadStopDetails(item, marker) {
    const base = { name: item.cleanTitle || item.title, address: item.address, lat: item.lat, lng: item.lng, link: item.link };
    if (item.osmTags && item.osmTags.opening_hours) { renderPlaceDetails($(`pd-stop-${item.id}`), { ...base, tags: item.osmTags }, marker); return; }
    renderPlaceDetails($(`pd-stop-${item.id}`), { ...base, tags: item.osmTags || null }, marker, { loading: true });
    let tags = await findTagsForStop(item);
    if (tags) { item.hours = tags.opening_hours || item.hours || null; item.hoursChecked = true; }
    if (!marker.isPopupOpen || !marker.isPopupOpen()) return;
    if (!tags && item.osmTags) tags = item.osmTags;
    renderPlaceDetails($(`pd-stop-${item.id}`), { ...base, tags }, marker, { failed: tags === undefined });
  }

  async function renderPreviewDetails(place, key, marker) {
    const box = () => $(`pd-${key}`);
    if (place.tags && place.tags.opening_hours) { renderPlaceDetails(box(), place, marker); return; }
    renderPlaceDetails(box(), place, marker, { loading: true });
    let tags = place.tags || null;
    try {
      if (place.osmRef) { const t2 = await lookupTagsByRef(place.osmRef); if (t2) tags = Object.assign({}, tags || {}, t2); }
    } catch (e) {}
    if (!marker.isPopupOpen || !marker.isPopupOpen()) return;
    place.tags = tags;
    renderPlaceDetails(box(), place, marker);
  }

  // Opening hours, e.g. "Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off", shown as a weekly table in the chosen language
  function formatHoursHtml(oh) {
    if (!oh) return '';
    const s = oh.trim();
    if (s === '24/7') return `<div class="full">${escapeHtml(t('open24'))}</div>`;
    const codes = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const names = {};
    codes.forEach((c, i) => { names[c] = new Date(2024, 0, 1 + i).toLocaleDateString(LANG, { weekday: 'short' }); });
    names.PH = t('publicHolidays');
    const tr = str => escapeHtml(str).replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, m => escapeHtml(names[m]));
    const closedWord = txt => txt.replace(/\b(off|closed)\b/gi, t('closed'));
    return s.split(/\s*;\s*/).filter(Boolean).map(rule => {
      const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*[,\-]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*)\s+(.+)$/);
      if (m) return `<span class="d">${tr(m[1])}</span><span>${escapeHtml(closedWord(m[2]))}</span>`;
      return `<div class="full">${tr(closedWord(rule))}</div>`;
    }).join('');
  }

  function renderPlaceDetails(box, place, marker, state = {}) {
    if (!box) return;
    const tg = place.tags || {};
    const kind = elementKind(tg);
    const typeBits = [];
    if (kind && kind.key !== 'highway') typeBits.push(prettyType(kind.key, kind.value));
    if (tg.cuisine) typeBits.push(tg.cuisine.split(';').map(c => c.replace(/_/g, ' ')).join(', '));
    const website = tg.website || tg['contact:website'] || tg.url;
    const phone = tg.phone || tg['contact:phone'];
    const hours = formatHoursHtml(tg.opening_hours);
    const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&hl=${LANG}`;

    box.innerHTML = `
      <div class="pd-photo" id="${box.id}-photo" style="display:none"></div>
      <div class="pd-extract" id="${box.id}-extract" style="display:none"></div>
      ${typeBits.length ? `<div class="pd-type">${escapeHtml(typeBits.join(' · '))}</div>` : ''}
      ${hours ? `<div class="pd-row"><i class="fa-regular fa-clock"></i><div class="pd-hours">${hours}</div></div>` : ''}
      ${phone ? `<div class="pd-row"><i class="fa-solid fa-phone"></i><a href="tel:${escapeHtml(phone.replace(/\s+/g, ''))}">${escapeHtml(phone)}</a></div>` : ''}
      ${website ? `<div class="pd-row"><i class="fa-solid fa-globe"></i><a href="${escapeHtml(/^https?:/i.test(website) ? website : 'https://' + website)}" target="_blank" rel="noopener">${escapeHtml(website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</a></div>` : ''}
      ${state.loading ? `<div class="pd-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(t('loadingDetails'))}</div>`
        : !hours ? `<div class="pd-note"><i class="fa-regular fa-clock"></i> ${escapeHtml(state.failed ? t('searchUnavailable') : t('hoursNotListed'))}</div>` : ''}
      <div class="pd-actions">
        <a class="pd-btn" href="${escapeHtml(googleSearchUrl(place))}" target="_blank" rel="noopener"><i class="fa-solid fa-star"></i> ${escapeHtml(t('reviewsPhotos'))}</a>
        <a class="pd-btn" href="${dirUrl}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right"></i> ${escapeHtml(t('directions'))}</a>
      </div>`;
    if (marker && marker.getPopup()) marker.getPopup().update();
    if (!state.loading) loadPlacePhoto(box.id, tg, marker);
  }

  async function loadPlacePhoto(boxId, tg, marker) {
    const photoBox = $(`${boxId}-photo`);
    const extractBox = $(`${boxId}-extract`);
    if (!photoBox) return;
    let url = null, extract = '';
    try {
      ({ url, extract } = await photoUrlForTags(tg));
    } catch (e) {}
    if (!$(`${boxId}-photo`)) return; // popup closed meanwhile
    if (url) {
      photoBox.style.display = '';
      photoBox.innerHTML = `<img src="${escapeHtml(url)}" alt="" loading="lazy" onload="refreshOpenPopup()" onerror="this.parentElement.style.display='none'; refreshOpenPopup()">`;
    }
    if (extract && extractBox) { extractBox.style.display = ''; extractBox.innerText = extract; }
    if (marker && marker.getPopup()) marker.getPopup().update();
  }

  function refreshOpenPopup() {
    map.eachLayer(l => { if (l.getPopup && l.getPopup() && l.isPopupOpen && l.isPopupOpen()) l.getPopup().update(); });
  }

  /* =========================================================
     OVERLAPPING PINS: tight ring with a 450ms grace period
     ========================================================= */
  function fanOutCluster(key) {
    if (collapseTimers[key]) { clearTimeout(collapseTimers[key]); delete collapseTimers[key]; }
    if (fannedClusters[key] || isDragging) return;
    const clusterMarkers = markers.filter(m => m.clusterKey === key);
    if (clusterMarkers.length <= 1) return;
    const n = clusterMarkers.length;
    const radius = Math.max(24, (n * (PIN_W - 2)) / (2 * Math.PI));
    const center = map.latLngToContainerPoint([clusterMarkers[0].lat, clusterMarkers[0].lng]);
    clusterMarkers.forEach((m, idx) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * idx) / n;
      const ll = map.containerPointToLatLng(L.point(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius));
      m.setLatLng(ll);
      m.setZIndexOffset(5000);
      const leg = L.polyline([[m.lat, m.lng], ll], { color: '#ffffff', weight: 1.5, opacity: 0.8, dashArray: '2,3', interactive: false, className: 'spider-leg' }).addTo(map);
      leg.clusterKey = key;
      spiderLines.push(leg);
    });
    fannedClusters[key] = true;
  }

  function scheduleCollapse(key) {
    if (collapseTimers[key]) clearTimeout(collapseTimers[key]);
    collapseTimers[key] = setTimeout(() => { delete collapseTimers[key]; collapseCluster(key); }, FAN_GRACE_MS);
  }

  function collapseCluster(key) {
    markers.filter(m => m.clusterKey === key).forEach(m => { m.setLatLng([m.lat, m.lng]); m.setZIndexOffset(0); });
    spiderLines = spiderLines.filter(s => {
      if (s.clusterKey === key) { map.removeLayer(s); return false; }
      return true;
    });
    delete fannedClusters[key];
  }

  /* ---------- Clear the search: empties the bar and removes the found places from the map ---------- */
  function updateSearchClear() {
    const b = $('search-clear');
    if (b) b.classList.toggle('show', !!$('search-input').value || lastAreaResults.length > 0);
  }
  function clearSearch() {
    const input = $('search-input');
    input.value = '';
    clearTimeout(searchTimeout);
    lastSearchResults = [];
    clearAreaResults();
    clearPreviewPin();
    $('search-results').style.display = 'none';
    updateSearchClear();
    input.blur();
  }
