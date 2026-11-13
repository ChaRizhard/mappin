  /* =========================================================
     CSV IMPORT (works with any column naming / any country)
     ========================================================= */
  // Files: CSV (any columns, incl. Google Takeout saved lists), KML (Google My Maps export: each layer
  // becomes a day) and GeoJSON (Google Takeout "Saved Places.json").
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    let rows, title = file.name.replace(/\.(csv|txt|kml|geojson|json)$/i, '').replace(/[_-]+/g, ' ').trim();
    try {
      const text = await file.text();
      const parsed = parseTripFileText(text, file.name);
      rows = parsed.rows;
      if (parsed.title) title = parsed.title;
    } catch (err) { showToast(t('importFileBad'), { ms: 5000 }); return; }
    if (!rows || !rows.length) { showToast(t('importLinkEmptySheet'), { ms: 4000 }); return; }
    let mode = 'new';
    if (rawData.length) {
      mode = await askChoice(t('importFileTitle'), t('importFileAsk'), [
        { value: 'update', label: t('importUpdateTrip'), note: t('importUpdateNote'), primary: true },
        { value: 'new', label: t('importNewTrip'), note: t('importNewNote') }]);
      if (!mode) return;
    }
    clearToasts();
    if (mode === 'update') {
      const st = processParsedData(rows, { refresh: true });
      showToast(t('refreshedFromLink', { a: st.added, u: st.updated, r: st.removed }), { ms: 6000, actionLabel: t('undoBtn'), onAction: undo });
    } else {
      processParsedData(rows, { title });
      if (rawData.length) showToast(t('importedFromLink', { n: rows.length }), { ms: 3500 });
    }
  }

  function parseTripFileText(text, name = '') {
    const head = text.slice(0, 600).trim();
    if (/\.kml$/i.test(name) || /^<\?xml[\s\S]*<kml|^<kml/i.test(head)) return parseKmlText(text);
    if (/\.(geo)?json$/i.test(name) || /^[{[]/.test(head)) return parseGeoJsonText(text);
    const res = Papa.parse(text, { header: true, skipEmptyLines: true });
    return { rows: (res.data || []).filter(r => r && Object.values(r).some(v => String(v || '').trim())) };
  }

  const stripHtml = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

  function parseKmlText(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('bad kml');
    const kid = (el, tag) => { for (const c of el.children) if (c.localName === tag) return c; return null; };
    const txt = (el, tag) => { const c = el && kid(el, tag); return c ? c.textContent.trim() : ''; };
    const docEl = doc.getElementsByTagNameNS('*', 'Document')[0];
    const rows = [];
    const folders = Array.from(doc.getElementsByTagNameNS('*', 'Folder'));
    const addPlacemark = (pm, day, dayTitle) => {
      const pt = pm.getElementsByTagNameNS('*', 'Point')[0];
      const coords = pt ? (pt.getElementsByTagNameNS('*', 'coordinates')[0] || {}).textContent : '';
      const addr = txt(pm, 'address');
      if (!coords && !addr) return; // lines and shapes aren't stops
      const [lng, lat] = String(coords || '').trim().split(/[\s,]+/).map(Number);
      rows.push({ Day: day, 'Day title': dayTitle || '', Name: txt(pm, 'name') || '', Notes: stripHtml(txt(pm, 'description')),
        Address: addr, Latitude: isFinite(lat) && (lat || lng) ? lat : '', Longitude: isFinite(lng) && (lat || lng) ? lng : '' });
    };
    if (folders.length) {
      folders.forEach((f, i) => Array.from(f.getElementsByTagNameNS('*', 'Placemark')).filter(pm => pm.parentElement === f)
        .forEach(pm => addPlacemark(pm, i + 1, txt(f, 'name'))));
    }
    Array.from(doc.getElementsByTagNameNS('*', 'Placemark')).filter(pm => !pm.parentElement || pm.parentElement.localName !== 'Folder')
      .forEach(pm => addPlacemark(pm, folders.length ? folders.length + 1 : 1, ''));
    return { rows, title: docEl ? txt(docEl, 'name') : '' };
  }

  function parseGeoJsonText(text) {
    const j = JSON.parse(text);
    const feats = Array.isArray(j) ? j : j.type === 'Feature' ? [j] : (j.features || []);
    const rows = feats.map(f => {
      const p = f.properties || {}, loc = p.location || {};
      const c = f.geometry && f.geometry.type === 'Point' ? f.geometry.coordinates || [] : [];
      const lng = Number(c[0]), lat = Number(c[1]);
      const has = isFinite(lat) && isFinite(lng) && (lat || lng); // Takeout writes 0,0 when it doesn't know
      return { Day: p.day || p.Day || 1, Name: p.Title || p.title || p.name || p.Name || loc.name || '',
        Address: loc.address || p.address || p.Address || '', Notes: p.Comment || p.comment || p.description || p.notes || p.Note || '',
        Link: p.google_maps_url || p.url || p.URL || '', Latitude: has ? lat : '', Longitude: has ? lng : '' };
    }).filter(r => r.Name || r.Address || r.Latitude !== '');
    return { rows, title: (j.name || (j.properties && j.properties.name) || '') };
  }

  // A small sheet with a few choices; resolves to the chosen value, or null when dismissed
  function askChoice(title, message, choices) {
    return new Promise(resolve => {
      let ov = $('choice-modal');
      if (!ov) { ov = document.createElement('div'); ov.id = 'choice-modal'; ov.className = 'modal-overlay'; document.body.appendChild(ov); }
      const done = v => { ov.style.display = 'none'; ov.onclick = null; resolve(v); };
      ov.innerHTML = `<div class="modal-box" style="width:420px">
        <div class="modal-title"><span>${escapeHtml(title)}</span><i class="fa-solid fa-xmark modal-close-x" data-v=""></i></div>
        ${message ? `<p class="settings-note" style="margin-top:0">${escapeHtml(message)}</p>` : ''}
        <div class="choice-list">${choices.map(c => `<button class="choice-btn ${c.primary ? 'primary' : ''}" data-v="${escapeHtml(c.value)}">
          <b>${escapeHtml(c.label)}</b>${c.note ? `<span>${escapeHtml(c.note)}</span>` : ''}</button>`).join('')}
          <button class="btn btn-ghost choice-cancel" data-v="">${escapeHtml(t('cancel'))}</button></div></div>`;
      ov.onclick = ev => {
        if (ev.target === ov) return done(null);
        const b = ev.target.closest('[data-v]');
        if (b) done(b.getAttribute('data-v') || null);
      };
      ov.style.display = 'flex';
    });
  }
  function clearToasts() { document.querySelectorAll('#toast-host .toast').forEach(el => el.remove()); }

  const COLUMN_ALIASES = {
    name: ['name', 'activityname', 'activity', 'title', 'stopname', 'placename', 'place', 'stop', 'poi', 'attraction', 'venue', 'location'],
    address: ['address', 'fulladdress', 'streetaddress', 'addr', 'location'],
    day: ['day', 'daynumber', 'dayno', 'daynum', 'itineraryday', 'tripday'],
    date: ['date', 'visitdate', 'daydate'],
    time: ['time', 'arrivaltime', 'starttime', 'hours'],
    category: ['category', 'type', 'kind'],
    notes: ['notes', 'note', 'description', 'navigation', 'details', 'comments', 'comment'],
    lat: ['latitude', 'lat', 'y'],
    lng: ['longitude', 'lng', 'lon', 'long', 'x'],
    coords: ['coordinates', 'coords', 'latlng', 'latlong', 'gps'],
    city: ['city', 'region', 'area', 'town', 'suburb', 'state'],
    country: ['country'],
    link: ['googlemapslink', 'googlemapsurl', 'googlemaps', 'mapslink', 'mapsurl', 'maplink', 'link', 'url', 'gmaps'],
    order: ['order', 'sequence', 'seq', 'stopnumber', 'stopno'],
    colour: ['customcolour', 'customcolor', 'colour', 'color'],
    cost: ['cost', 'price', 'budget', 'amount', 'fee', 'costs', 'plannedcost'],
    currency: ['currency', 'curr', 'ccy'],
    spent: ['spent', 'actualcost', 'actual', 'actualspend', 'spend'],
    bookingref: ['bookingref', 'booking', 'bookingnumber', 'confirmation', 'confirmationnumber', 'reference', 'ref'],
    bookinglink: ['bookinglink', 'bookingurl', 'ticketlink', 'ticketurl'],
    stay: ['staymin', 'stay', 'duration', 'durationmin', 'stayminutes', 'minutes', 'length'],
    fixed: ['fixedtime', 'fixed', 'booked', 'reservation', 'reserved'],
    openinghours: ['openinghours', 'openinghour', 'openhours'],
    daytitle: ['daytitle', 'dayname', 'daylabel', 'daytheme'],
    skipped: ['skipped', 'skip', 'missed'],
    done: ['done', 'completed', 'visited', 'ticked']
  };

  function normKey(k) { return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function makeFieldGetter(rows) {
    const keys = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
    const normMap = {};
    keys.forEach(k => { const n = normKey(k); if (!(n in normMap)) normMap[n] = k; });
    const used = {};
    const resolve = field => {
      for (const alias of COLUMN_ALIASES[field]) if (alias in normMap) return normMap[alias];
      return null;
    };
    ['name', 'address', 'day', 'date', 'time', 'category', 'notes', 'lat', 'lng', 'coords', 'city', 'country', 'link', 'order', 'colour', 'cost', 'stay', 'fixed', 'openinghours', 'daytitle', 'skipped', 'done', 'spent', 'currency', 'bookingref', 'bookinglink'].forEach(f => {
      let col = resolve(f);
      if (col && f === 'address' && used.name === col) {
        col = COLUMN_ALIASES.address.filter(a => a !== 'location').map(a => normMap[a]).find(Boolean) || null;
      }
      used[f] = col;
    });
    return (row, field) => {
      const col = used[field];
      if (!col) return '';
      const v = row[col];
      return v === undefined || v === null ? '' : String(v).trim();
    };
  }

  function parseDayFromText(str) {
    if (!str) return null;
    const s = String(str).trim();
    const m = s.match(/\b(?:Day|D)\s*0*(\d+)\b/i);
    if (m) return parseInt(m[1]);
    const plain = s.match(/^0*(\d+)$/);
    if (plain) return parseInt(plain[1]);
    return null;
  }

  function parseGoogleLink(link) {
    const out = { lat: NaN, lng: NaN, query: '' };
    if (!link) return out;
    let decoded = link;
    try { decoded = decodeURIComponent(link); } catch (e) {}
    const m = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
         || decoded.match(/[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (m) { out.lat = parseFloat(m[1]); out.lng = parseFloat(m[2]); }
    const q = decoded.match(/[?&](?:query|q|destination)=([^&]+)/);
    if (q && !/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(q[1])) out.query = q[1].replace(/\+/g, ' ').trim();
    if (!out.query) {
      const p = decoded.match(/\/(?:place|search)\/([^/@?]+)/);
      if (p) out.query = p[1].replace(/\+/g, ' ').trim();
    }
    return out;
  }

  function stripTitle(rawTitle) {
    return rawTitle.replace(/^(?:Day\s*\d+|D\d+)\s*[-:]*\s*(?:\d{1,2}:\d{2})?\s*[-:]*\s*/i, '').trim() || rawTitle;
  }

  // opts.title: name for the new trip. opts.refresh: update the current trip from its link instead
  // (stops that match by name keep their id, place, notes and costs entered in MapPin; title, checklist,
  // budget, groups and day names stay). opts.sourceUrl: remembered so the trip can be refreshed later.
  function processParsedData(data, opts = {}) {
    importGeneration++;
    geoQueue = [];
    cityAnchors = {};
    if (!data || !data.length) { rawData = []; populateFilters(); renderItinerary(); return; }

    const get = makeFieldGetter(data);
    const firstCol = Object.keys(data[0])[0];

    const rows = data.map((item, index) => {
      const rawTitle = get(item, 'name') || (item[firstCol] ? String(item[firstCol]).trim() : '') || `Stop ${index + 1}`;
      const date = get(item, 'date');
      let day = parseDayFromText(get(item, 'day'));
      if (day === null) day = parseDayFromText(rawTitle.match(/^\s*(?:Day\s*\d+|D\d+)\b/i)?.[0]);
      const city = get(item, 'city');
      const country = get(item, 'country');
      const link = get(item, 'link');
      const linkInfo = parseGoogleLink(link);

      let lat = parseFloat(get(item, 'lat'));
      let lng = parseFloat(get(item, 'lng'));
      if (isNaN(lat) || isNaN(lng)) {
        const c = get(item, 'coords').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
        if (c) { lat = parseFloat(c[1]); lng = parseFloat(c[2]); }
      }
      if ((isNaN(lat) || isNaN(lng)) && !isNaN(linkInfo.lat)) { lat = linkInfo.lat; lng = linkInfo.lng; }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { lat = NaN; lng = NaN; }

      const address = get(item, 'address') || linkInfo.query || '';
      const cleanTitle = stripTitle(rawTitle);
      const pending = isNaN(lat) || isNaN(lng);

      const catRaw = get(item, 'category');
      const dayTitle = get(item, 'daytitle');
      const category = catRaw || (cleanTitle.toLowerCase().includes('hotel') ? 'Hotel' : 'Activity');
      let time = get(item, 'time');
      if (!time) { const tm = rawTitle.match(/\b(\d{1,2}:\d{2})\b/); if (tm) time = tm[1]; }
      const orderVal = parseInt(get(item, 'order'));

      return {
        id: index, title: rawTitle, cleanTitle, day, date: toIsoDate(date) || date, lat, lng, address, category, time,
        desc: get(item, 'notes'), order: isNaN(orderVal) ? index + 1 : orderVal,
        city, country, link, cityKey: cityKeyOf(city), pending, approx: false, notFound: false,
        customColour: get(item, 'colour') || null,
        cost: parseCost(get(item, 'cost')),
        spent: parseCost(get(item, 'spent')),
        currency: (/^[A-Za-z]{3}$/.test(get(item, 'currency') || '') ? get(item, 'currency').toUpperCase() : undefined),
        bookingRef: get(item, 'bookingref') || '', bookingUrl: get(item, 'bookinglink') || '',
        stay: (() => { const v = parseInt(get(item, 'stay')); return isNaN(v) ? null : v; })(),
        fixedTime: /^(y|yes|true|1|x|✓|✔|booked|fixed)$/i.test(get(item, 'fixed')),
        skipped: /^(y|yes|true|1|x|✓|✔|skipped|missed)$/i.test(get(item, 'skipped')) || undefined,
        done: /^(y|yes|true|1|x|✓|✔|done|visited)$/i.test(get(item, 'done')) || undefined,
        hours: get(item, 'openinghours') || undefined,
        hoursChecked: !!get(item, 'openinghours'),
        _dayTitle: dayTitle, _catGiven: !!catRaw
      };
    });

    // No day column/prefix? Derive days from distinct dates, else Day 1.
    if (rows.every(r => r.day === null)) {
      const dates = [...new Set(rows.map(r => r.date).filter(Boolean))];
      dates.sort((a, b) => {
        const da = parseSortableDate(a), db = parseSortableDate(b);
        if (isNaN(da) || isNaN(db)) return 0;
        return da - db;
      });
      rows.forEach(r => { r.day = r.date ? dates.indexOf(r.date) + 1 : 1; });
    } else {
      rows.forEach(r => { if (r.day === null) r.day = 1; });
    }

    // A day whose stops all share one date gets it as the day's date
    const perDay = {};
    rows.forEach(r => { if (/^\d{4}-\d{2}-\d{2}$/.test(r.date)) (perDay[r.day] = perDay[r.day] || new Set()).add(r.date); });
    const newDayDates = {};
    Object.keys(perDay).forEach(d => { if (perDay[d].size === 1) newDayDates[d] = [...perDay[d]][0]; });
    rows.forEach(r => { if (newDayDates[r.day] && r.date === newDayDates[r.day]) r.date = ''; });

    const sheetDayTitles = {};
    rows.forEach(r => { if (r._dayTitle && !sheetDayTitles[r.day]) sheetDayTitles[r.day] = r._dayTitle; });

    if (opts.refresh) {
      const stats = mergeIntoCurrentTrip(rows, sheetDayTitles, newDayDates);
      rows.forEach(r => { delete r._dayTitle; delete r._catGiven; });
      clearPreviewPin(); clearAreaResults(); lastRemovedPin = null;
      if (opts.sourceUrl) { TRIP.sourceUrl = opts.sourceUrl; TRIP.sourceAt = Date.now(); }
      rawData.filter(r => r.pending).forEach(r => enqueueGeocode(r));
      updateGeoStatus();
      populateFilters();
      renderItinerary();
      return stats;
    }
    rows.forEach(r => { delete r._dayTitle; delete r._catGiven; });

    rawData = rows;
    DAY_TITLES = sheetDayTitles; DAY_COLOR_MAP = {}; DAY_DATES = newDayDates; EXTRA_DAYS = new Set(); collapsedDays = new Set();
    GROUPS = {}; stopToGroup = {}; DAY_GROUPS = {}; dayToGroup = {}; collapsedDayGroups = new Set();
    // A new file is a new trip: it gets its own name, checklist and budget, and never overwrites the
    // previous trip's cloud copy (Undo brings the previous trip back)
    TRIP = { cloudId: null, title: opts.title || '' };
    if (opts.sourceUrl) { TRIP.sourceUrl = opts.sourceUrl; TRIP.sourceAt = Date.now(); }
    CHECKLIST = [];
    if (typeof updateChecklistPill === 'function') updateChecklistPill();
    selectedStopIds.clear(); selectedDays.clear();
    clearPreviewPin(); clearAreaResults(); lastRemovedPin = null;
    activeDay = 'all';
    pendingFitAll = true; userMovedMap = false;

    rawData.filter(r => r.pending).forEach(r => enqueueGeocode(r));
    updateGeoStatus();

    populateFilters();
    renderItinerary();
    return { added: rows.length, removed: 0, updated: 0 };
  }

  /* ---------- Refreshing a trip from its link: keep what was added in MapPin where the sheet is blank ---------- */
  const KEEP_IF_BLANK = ['desc', 'time', 'cost', 'spent', 'currency', 'bookingRef', 'bookingUrl', 'stay', 'hours', 'hoursChecked', 'customColour', 'link', 'city', 'country', 'address'];
  function mergeIntoCurrentTrip(rows, sheetDayTitles, sheetDayDates) {
    const keyOf = r => normKey(r.cleanTitle || r.title);
    const pool = {};
    rawData.forEach(o => { (pool[keyOf(o)] = pool[keyOf(o)] || []).push(o); });
    let nextId = rawData.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0) + 1;
    let updated = 0, added = 0;
    const kept = new Set();
    // Match by name first; a stop that was renamed is still found by being at the same spot on the same day
    const matchOf = new Map();
    rows.forEach(r => {
      const list = pool[keyOf(r)];
      const old = list && (list.find(o => o.day === r.day) || list[0]);
      if (old) { list.splice(list.indexOf(old), 1); matchOf.set(r, old); }
    });
    const leftovers = Object.values(pool).flat();
    rows.forEach(r => {
      if (matchOf.has(r) || !hasCoords(r)) return;
      let best = null, bestD = 120;
      leftovers.forEach(o => {
        if (o.day !== r.day || !hasCoords(o)) return;
        const d = distMeters([r.lat, r.lng], [o.lat, o.lng]) + (o.time && o.time === r.time ? 0 : 40); // same time breaks ties
        if (d < bestD) { best = o; bestD = d; }
      });
      if (best) { leftovers.splice(leftovers.indexOf(best), 1); matchOf.set(r, best); }
    });
    rows.forEach(r => {
      const old = matchOf.get(r);
      if (!old) { r.id = nextId++; added++; return; }
      kept.add(old.id);
      updated++;
      r.id = old.id;
      KEEP_IF_BLANK.forEach(k => {
        const v = r[k];
        if ((v === undefined || v === null || v === '' || v === false) && old[k] !== undefined && old[k] !== null && old[k] !== '') r[k] = old[k];
      });
      if (!r._catGiven && old.category) r.category = old.category;
      // Same place as before: keep its pin (and any fine-tuning) instead of looking it up again
      const sameAddress = !r.address || !old.address || normKey(r.address) === normKey(old.address);
      if (r.pending && hasCoords(old) && sameAddress) {
        r.lat = old.lat; r.lng = old.lng; r.pending = false; r.approx = old.approx; r.notFound = false; r.cityKey = old.cityKey;
      }
      ['done', 'locked', 'osmTags', 'osmRef', 'photo', 'fixedTime', 'skipped'].forEach(k => { if (old[k] !== undefined && r[k] === undefined) r[k] = old[k]; });
      if (old.done) r.done = true;
    });
    const removed = rawData.filter(o => !kept.has(o.id)).length;
    rawData = rows;
    Object.keys(sheetDayTitles).forEach(d => { DAY_TITLES[d] = sheetDayTitles[d]; });
    Object.keys(sheetDayDates).forEach(d => { DAY_DATES[d] = sheetDayDates[d]; });
    // Groups only keep stops that are still there
    const ids = new Set(rawData.map(r => r.id));
    Object.keys(stopToGroup).forEach(id => { if (!ids.has(Number(id))) delete stopToGroup[id]; });
    if (typeof pruneEmptyGroups === 'function') pruneEmptyGroups();
    selectedStopIds.clear(); selectedDays.clear();
    return { added, removed, updated };
  }
