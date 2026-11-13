  /* =========================================================
     TODAY MODE: follow the day's stops one at a time while travelling
     ========================================================= */
  let todayMode = false, todayDay = null, todayIdx = 0;

  function todayIso() { return isoFromDate(new Date()); }

  // The day dated today (by the day's date or a stop's own date), if any
  function todayDayNumber() {
    const iso = todayIso();
    return getAllDays().find(d => DAY_DATES[d] === iso || rawData.some(s => s.day === d && s.date === iso)) || null;
  }

  function todayStops() { return todayDay === null ? [] : dayDisplayOrder(todayDay).filter(s => !isSkipped(s)); }

  function firstOpenIndex() {
    const list = todayStops();
    const i = list.findIndex(s => !s.done);
    return i === -1 ? list.length : i;
  }

  function toggleToday() {
    // In Today mode on another day: the Today chip goes back to today instead of closing
    if (todayMode) { const real = todayDayNumber(); if (real !== null && real !== todayDay && getAllDays().includes(real)) todayGoDay(real); else exitToday(); }
    else startToday();
  }

  function startToday() {
    if (!rawData.length) { alert(t('noExport')); return; }
    if (selectMode) exitSelectMode();
    if (daySelectMode) exitDaySelectMode();
    todayDay = todayDayNumber();
    if (todayDay === null) {
      todayDay = activeDay !== 'all' ? activeDay : getAllDays()[0];
      showToast(t('noTodayDay', { name: getDayTitle(todayDay) }), { ms: 4500 });
    }
    todayMode = true;
    document.documentElement.classList.add('today-on');
    placeTodayPanel();
    activeDay = todayDay;
    revealDay(todayDay);
    todayIdx = firstOpenIndex();
    populateFilters();
    renderItinerary();
    showTip('today');
    if (isPortraitPhone()) setSheet('min');
    else if (phoneLayoutMQ.matches) $('sidebar').scrollTop = 0;
    focusTodayStop();
    startArrivalWatch();
  }

  function exitToday() {
    todayMode = false;
    stopArrivalWatch();
    document.documentElement.classList.remove('today-on');
    const p = $('today-panel');
    if (p) p.style.display = 'none';
    populateFilters();
    if (isPortraitPhone()) setSheet('mid');
  }

  function todayStep(delta) {
    const n = todayStops().length;
    todayIdx = Math.max(0, Math.min(n, todayIdx + delta));
    renderTodayPanel();
    focusTodayStop();
  }

  function todayMarkDone() {
    const list = todayStops();
    const s = list[todayIdx];
    if (!s) return;
    s.done = !s.done;
    if (s.done) {
      const next = list.findIndex((x, i) => i > todayIdx && !x.done);
      todayIdx = next === -1 ? list.length : next;
    }
    renderItinerary(); // also redraws the panel
    focusTodayStop();
  }

  function focusTodayStop() {
    const s = todayStops()[todayIdx];
    if (!s || !hasCoords(s)) return;
    map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 16), { duration: 0.7 });
    map.once('moveend', () => {
      const pin = $(`pin-wrapper-${s.id}`);
      if (pin) { pin.classList.remove('pulse'); void pin.offsetWidth; pin.classList.add('pulse'); setTimeout(() => pin.classList.remove('pulse'), 1900); }
    });
  }

  function directionsMode(from, to) {
    if (routeMode === 'foot') return 'walking';
    if (routeMode === 'car') return 'driving';
    if (routeMode === 'transit') return 'transit';
    return from && hasCoords(from) && distMeters([from.lat, from.lng], [to.lat, to.lng]) < 1500 ? 'walking' : 'transit';
  }

  function renderTodayPanel() {
    const panel = $('today-panel');
    updateChecklistPill();
    if (!panel) return;
    if (!todayMode) { panel.style.display = 'none'; return; }
    const list = todayStops();
    const doneCount = list.filter(s => s.done).length;
    panel.style.display = 'block';
    const head = `
      <div class="tp-head">
        <button class="tp-day" onclick="todaySwitchDay(-1)" ${getAllDays().indexOf(todayDay) <= 0 ? 'disabled' : ''} aria-label="${escapeHtml(t('prevDay'))}"><i class="fa-solid fa-chevron-left"></i></button>
        <label class="tp-dayname"><i class="fa-solid fa-location-arrow"></i> <span>${escapeHtml(getDayTitle(todayDay))}</span> <i class="fa-solid fa-chevron-down tp-dd"></i>${todayDayPickerHtml()}</label>
        <button class="tp-day" onclick="todaySwitchDay(1)" ${getAllDays().indexOf(todayDay) >= getAllDays().length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('nextDayL'))}"><i class="fa-solid fa-chevron-right"></i></button>
        ${todayBackHtml()}
        ${todayWeatherHtml()}
        <span class="tp-progress">${escapeHtml(t('progressN', { n: doneCount, m: list.length }))}</span>
        <button class="tp-close" onclick="exitToday()" aria-label="${escapeHtml(t('close'))}"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
    const s = list[todayIdx];
    if (!s) {
      panel.innerHTML = head + `
        <div class="tp-done"><i class="fa-solid fa-flag-checkered"></i> ${escapeHtml(t('allDoneToday'))}</div>
        ${tomorrowPreviewHtml()}
        <div class="tp-actions">
          <button class="btn btn-secondary" onclick="todayStep(-1)" ${list.length ? '' : 'disabled'}><i class="fa-solid fa-chevron-left"></i></button>
          <button class="btn btn-primary tp-grow" onclick="exitToday()">${escapeHtml(t('close'))}</button>
        </div>`;
      return;
    }
    const prev = list[todayIdx - 1];
    // Measure from you only when you're actually nearby; otherwise from the previous stop
    const me = meMarker ? { lat: meMarker.getLatLng().lat, lng: meMarker.getLatLng().lng } : null;
    const meNear = me && hasCoords(s) && distMeters([me.lat, me.lng], [s.lat, s.lng]) < 30000;
    const from = meNear ? me : prev;
    const fromKind = meNear ? 'you' : 'prev';
    const dist = from && hasCoords(from) && hasCoords(s) ? formatDistance(distMeters([from.lat, from.lng], [s.lat, s.lng])) : '';
    const dirUrl = hasCoords(s)
      ? `https://www.google.com/maps/dir/?api=1${from && hasCoords(from) ? `&origin=${from.lat},${from.lng}` : ''}&destination=${s.lat},${s.lng}&travelmode=${directionsMode(from, s)}&hl=${LANG}`
      : googleSearchUrl({ name: s.cleanTitle || s.title, address: s.address });
    loadTodayPhoto(s);
    panel.innerHTML = head + arrivalBannerHtml() + todayDotsHtml(list) + `
      <div class="tp-stop" onclick="focusTodayStop()">
        <div class="card-number" style="background:${getStopColour(s)}">${s.done ? '<i class="fa-solid fa-check"></i>' : todayIdx + 1}</div>
        <div class="tp-info">
          <div class="tp-label">${escapeHtml(s.done ? t('doneLabel') : todayIdx === firstOpenIndex() ? t('nextStop') : t('stopN', { n: todayIdx + 1 }))}</div>
          <div class="tp-title">${escapeHtml(s.cleanTitle || s.title)}</div>
          <div class="tp-meta">${s.time ? `<span><i class="fa-regular fa-clock"></i> ${escapeHtml(s.time)}</span>` : ''}
            <span><i class="fa-solid ${categoryIcon(s.category)}"></i> ${escapeHtml(s.category)}</span>
            ${dist ? `<span><i class="fa-solid fa-route"></i> ${escapeHtml(dist)}</span>` : ''} ${(effectiveDayIsToday() && nowHoursHtml(s)) || hoursWarningHtml(s)}</div>
          ${leaveByHtml(from, s, fromKind)}
          ${todayBookingHtml(s)}
          ${s.desc ? `<div class="tp-notes">${escapeHtml(s.desc)}</div>` : ''}
          ${!s.done ? `<button class="tp-skip" onclick="event.stopPropagation(); skipStop(${s.id})"><i class="fa-solid fa-forward"></i> ${escapeHtml(t('skipStop'))}</button>` : ''}
        </div>
        ${todayPhotos[s.id] ? `<img class="tp-photo" src="${escapeHtml(todayPhotos[s.id])}" alt="" onerror="this.remove()">` : ''}
      </div>
      ${todayChecklistHtml()}
      <div class="tp-actions">
        <button class="btn btn-secondary" onclick="todayStep(-1)" ${todayIdx === 0 ? 'disabled' : ''} aria-label="${escapeHtml(t('previousStop'))}"><i class="fa-solid fa-chevron-left"></i></button>
        <a class="btn btn-primary tp-grow" href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right"></i> ${escapeHtml(t('directions'))}</a>
        <button class="btn ${s.done ? 'btn-secondary' : 'btn-success'}" onclick="todayMarkDone()"><i class="fa-solid ${s.done ? 'fa-rotate-left' : 'fa-check'}"></i> ${escapeHtml(s.done ? t('notDone') : t('markDone'))}</button>
        <button class="btn btn-secondary" onclick="todayStep(1)" aria-label="${escapeHtml(t('nextStopBtn'))}"><i class="fa-solid fa-chevron-right"></i></button>
      </div>`;
  }

  /* ---------- Today panel: photo of the stop ---------- */
  const todayPhotos = {}; // stop id -> url | '' (none) | null (loading)

  async function photoUrlForTags(tg) {
    let url = null, extract = '';
    if (!tg) return { url, extract };
    if (tg.image && /^https?:\/\/.+\.(jpe?g|png|webp)(\?|$)/i.test(tg.image)) url = tg.image;
    if (!url && tg.wikimedia_commons && /^File:/i.test(tg.wikimedia_commons)) {
      url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(tg.wikimedia_commons.replace(/^File:/i, ''))}?width=480`;
    }
    if (tg.wikipedia) {
      const m = tg.wikipedia.match(/^([a-z-]+):(.+)$/i);
      if (m) {
        const d = await fetchJson(`https://${m[1]}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(m[2].replace(/ /g, '_'))}`, 5000).catch(() => null);
        if (d) {
          if (!url && d.thumbnail) url = d.thumbnail.source;
          if (m[1] === LANG && d.extract) extract = d.extract;
        }
      }
    }
    if (!url && tg.wikidata) {
      const d = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(tg.wikidata)}&property=P18&format=json&origin=*`, 5000).catch(() => null);
      const file = d && d.claims && d.claims.P18 && d.claims.P18[0].mainsnak.datavalue && d.claims.P18[0].mainsnak.datavalue.value;
      if (file) url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=480`;
    }
    return { url, extract };
  }

  async function loadTodayPhoto(s) {
    if (!s || todayPhotos[s.id] !== undefined || !navigator.onLine) return;
    todayPhotos[s.id] = null;
    let url = '';
    try {
      const tags = s.osmTags || await findTagsForStop(s);
      if (tags && tags.opening_hours && !s.hours) { s.hours = tags.opening_hours; s.hoursChecked = true; }
      url = (await photoUrlForTags(tags || {})).url || '';
    } catch (e) {}
    todayPhotos[s.id] = url;
    if (todayMode) renderTodayPanel();
  }

  /* ---------- "Leave by": when to set off for the next stop's planned time ---------- */
  const TRAVEL = { walking: { kmh: 4.5, detour: 1.3, extra: 0 }, transit: { kmh: 20, detour: 1.3, extra: 8 }, driving: { kmh: 28, detour: 1.35, extra: 5 } };

  function travelMinutes(from, to) {
    if (!from || !to || !hasCoords(from) || !hasCoords(to)) return null;
    const mode = directionsMode(from, to);
    const p = TRAVEL[mode] || TRAVEL.walking;
    const real = realTravelMinutes(mode, from, to);
    if (real) return { mins: real, mode, real: true };
    const km = distMeters([from.lat, from.lng], [to.lat, to.lng]) / 1000 * p.detour;
    // Longer transit journeys are mostly fast trains, not city buses
    const kmh = mode === 'transit' ? (km < 8 ? p.kmh : km < 30 ? 32 : 48) : p.kmh;
    return { mins: Math.max(1, Math.round(km / kmh * 60 + p.extra)), mode };
  }

  function leaveByHtml(from, s, fromKind) {
    if (!s || s.done) return '';
    const tr = travelMinutes(from, s);
    if (!tr || tr.mins > 240) return ''; // too far to be a real "next stop" journey
    let modeLabel = t(tr.mode === 'walking' ? 'byWalk' : tr.mode === 'driving' ? 'byCar' : 'byTransit', { m: tr.mins });
    if (tr.real) modeLabel = modeLabel.replace(/^~\s?/, '');
    const fromLabel = fromKind === 'you' ? t('fromYou') : t('fromPrev');
    const isToday = effectiveDayIsToday();
    if (!isToday || !s.time || !/^\d{1,2}:\d{2}$/.test(s.time)) {
      return `<div class="tp-leave lb-info"><i class="fa-solid fa-route"></i> <span>${escapeHtml(modeLabel)} ${escapeHtml(fromLabel)}</span></div>`;
    }
    const [h, m] = s.time.split(':').map(Number);
    const arrive = h * 60 + m, leave = arrive - tr.mins;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const pad = n => String(((n % 1440) + 1440) % 1440 / 60 | 0).padStart(2, '0') + ':' + String(((n % 60) + 60) % 60).padStart(2, '0');
    let cls = 'lb-ok', label = t('leaveBy', { time: pad(leave) });
    if (nowMin > arrive) { cls = 'lb-late'; label = t('runningLate', { m: nowMin - arrive }); }
    else if (nowMin >= leave - 10) { cls = 'lb-soon'; label = nowMin >= leave ? t('leaveNow') : t('leaveInN', { m: leave - nowMin }); }
    return `<div class="tp-leave ${cls}"><i class="fa-solid fa-person-walking-arrow-right"></i> <b>${escapeHtml(label)}</b> <span>· ${escapeHtml(modeLabel)} ${escapeHtml(fromLabel)}</span></div>`;
  }
  function effectiveDayIsToday() {
    const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return DAY_DATES[todayDay] === iso;
  }

  function todayChecklistHtml() {
    const items = CHECKLIST.filter(c => !c.done && (c.day === todayDay));
    if (!items.length) return '';
    return `<button class="tp-check" onclick="openChecklist(${todayDay})"><i class="fa-solid fa-list-check"></i> ${escapeHtml(t('checklistTodayN', { n: items.length }))}</button>`;
  }
  function initTodayTicker() {
    setInterval(() => { if (todayMode && !document.hidden) renderTodayPanel(); }, 60000);
  }

  /* ---------- Today mode: switch days with the arrows or a sideways swipe ---------- */
  function todaySwitchDay(delta) {
    const days = getAllDays();
    const i = days.indexOf(todayDay);
    const next = days[i + delta];
    if (next === undefined) return;
    todayDay = next;
    activeDay = next;
    revealDay(next);
    todayIdx = firstOpenIndex();
    populateFilters();
    renderItinerary();
    focusTodayStop();
  }

  // Swipe the Today card sideways for the next / previous stop; the card follows your finger
  function initTodaySwipe() {
    const panel = $('today-panel');
    if (!panel) return;
    let sw = null;
    panel.addEventListener('touchstart', e => {
      if (e.target.closest('button, a, select, input')) return;
      const p = e.touches[0];
      sw = { x0: p.clientX, y0: p.clientY, dx: 0, on: false, el: panel.querySelector('.tp-stop') };
    }, { passive: true });
    panel.addEventListener('touchmove', e => {
      if (!sw || !sw.el) return;
      const p = e.touches[0], dx = p.clientX - sw.x0, dy = p.clientY - sw.y0;
      if (!sw.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
        if (Math.abs(dx) < 10) return;
        sw.on = true;
      }
      const n = todayStops().length;
      const atEdge = (dx > 0 && todayIdx === 0) || (dx < 0 && todayIdx >= n);
      sw.dx = atEdge ? dx / 3 : dx;
      sw.el.style.transition = 'none';
      sw.el.style.transform = `translateX(${sw.dx}px)`;
      sw.el.style.opacity = String(Math.max(0.3, 1 - Math.abs(sw.dx) / 400));
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!sw) return;
      const { el, dx, on } = sw; sw = null;
      if (!on || !el) return;
      const dir = dx < -60 ? 1 : dx > 60 ? -1 : 0;
      const n = todayStops().length;
      const can = (dir === 1 && todayIdx < n) || (dir === -1 && todayIdx > 0);
      el.style.transition = 'transform 0.16s ease, opacity 0.16s ease';
      if (!can) { el.style.transform = ''; el.style.opacity = ''; return; }
      el.style.transform = `translateX(${dir * -50}%)`;
      el.style.opacity = '0';
      setTimeout(() => {
        todayStep(dir);
        const nel = panel.querySelector('.tp-stop');
        if (!nel) return;
        nel.style.transition = 'none';
        nel.style.transform = `translateX(${dir * 40}%)`;
        nel.style.opacity = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          nel.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
          nel.style.transform = ''; nel.style.opacity = '';
        }));
      }, 150);
    };
    panel.addEventListener('touchend', end, { passive: true });
    panel.addEventListener('touchcancel', end, { passive: true });
  }

  function todayGoDay(day) {
    const d = Number(day);
    const days = getAllDays();
    const i = days.indexOf(todayDay), j = days.indexOf(d);
    if (j === -1 || i === j) return;
    todaySwitchDay(j - i);
  }
  // Looking at another day in Today mode: one tap back to today
  function todayBackHtml() {
    const real = todayDayNumber();
    if (real === null || real === todayDay || !getAllDays().includes(real)) return '';
    return `<button class="tp-back-today" onclick="todayGoDay(${real})"><i class="fa-solid fa-rotate-left"></i> ${escapeHtml(t('today'))}</button>`;
  }
  function todayGoStop(i) { todayIdx = i; renderTodayPanel(); focusTodayStop(); }

  function todayDayPickerHtml() {
    return `<select class="tp-day-select" onchange="todayGoDay(this.value)" aria-label="${escapeHtml(t('chooseDay'))}">
      ${getAllDays().map(d => `<option value="${d}" ${d === todayDay ? 'selected' : ''}>${escapeHtml(getDayTitle(d))}${DAY_DATES[d] ? ' · ' + escapeHtml(formatDateShort(DAY_DATES[d])) : ''}</option>`).join('')}</select>`;
  }
  function todayDotsHtml(list) {
    if (list.length < 2) return '';
    return `<div class="tp-dots">${list.map((s, i) => `<button class="${i === todayIdx ? 'on' : ''} ${s.done ? 'done' : ''}" onclick="todayGoStop(${i})" aria-label="${escapeHtml(s.cleanTitle || s.title)}"></button>`).join('')}</div>`;
  }

  /* ---------- Opening hours right now (Today mode) ---------- */
  function nowHoursHtml(s) {
    if (!s || !s.hours || typeof hoursStatusAt !== 'function') return '';
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const st = hoursStatusAt(s.hours, isoFromDate(now), hhmm);
    if (!st || st.open === null) return '';
    let cls = '', text = '';
    if (st.open) {
      if (st.always || st.closesAt % 1440 === 0 && st.minsLeft > 600) text = t('openNow');
      else if (st.minsLeft <= 60) { cls = 'warn'; text = t('closesInN', { m: st.minsLeft }); }
      else text = t('openUntil', { time: fromMin(st.closesAt) });
    } else if (st.allDay) { cls = 'bad'; text = t('closedToday'); }
    else if (st.opensAt !== undefined) { cls = 'warn'; text = t('opensAtT', { time: fromMin(st.opensAt) }); }
    else { cls = 'bad'; text = t('closedNow'); }
    return `<span class="now-hours ${cls}" title="${escapeHtml(t('hoursTitle'))}"><i class="fa-regular fa-clock"></i> ${escapeHtml(text)}</span>`;
  }

  /* ---------- Today panel: inside the list sheet on phones held upright, floating on the map otherwise ---------- */
  function placeTodayPanel() {
    const panel = $('today-panel');
    if (!panel) return;
    const sb = $('sidebar'), handle = $('sheet-handle'), mapWrap = document.querySelector('.map-wrap');
    if (phoneLayoutMQ.matches) {
      // Phones (upright or on their side): the Today card sits at the top of the list, clear of the map
      if (panel.parentElement !== sb) handle.after(panel);
    } else if (panel.parentElement !== mapWrap) {
      mapWrap.appendChild(panel);
    }
  }

  // Keep the smallest sheet size fitted to the Today card as its content changes
  function initTodayResize() {
    const tp = $('today-panel');
    if (!tp || typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(() => {
      if (todayMode && isPortraitPhone() && sheetState === 'min' && tp.parentElement === $('sidebar')) setSheet('min');
    }).observe(tp);
  }

  /* ---------- Today opens by itself when you open MapPin on a trip day ---------- */
  let autoTodayOn = loadPref('mappin_auto_today', 'true') === 'true';
  function toggleAutoToday() { autoTodayOn = !autoTodayOn; savePref('mappin_auto_today', String(autoTodayOn)); renderSettings(); }
  function autoTodaySettingHtml() {
    return `<div class="settings-row"><span>${escapeHtml(t('autoToday'))}</span>${switchHtml(autoTodayOn, 'toggleAutoToday()', t('autoToday'))}</div>`;
  }
  function initAutoToday() {
    setTimeout(() => {
    if (!autoTodayOn || todayMode || VIEW_ONLY || !rawData.length) return;
    const d = todayDayNumber();
    if (d === null) return;
    const stops = rawData.filter(s => s.day === d);
    if (!stops.length || stops.every(s => s.done)) return;
    try { if (sessionStorage.getItem('mappin_auto_today') === isoFromDate(new Date())) return; sessionStorage.setItem('mappin_auto_today', isoFromDate(new Date())); } catch (e) {}
    startToday();
    showToast(t('autoTodayStarted', { name: getDayTitle(d) }), { ms: 4000 });
    }, 1400);
  }

  /* ---------- Real walking / driving times for the Today card (free OpenStreetMap router) ---------- */
  const todayRouteInflight = new Set();
  const r3 = p => ({ lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 });
  function realTravelMinutes(mode, from, to) {
    const rmode = mode === 'walking' ? 'foot' : mode === 'driving' ? 'car' : null;
    if (!rmode) return null;
    const a = r3(from), key = routeKey(rmode, a, to);
    const c = routeCache[key];
    if (c && c.d) return Math.max(1, Math.round(c.d / 60));
    if (c && c.none) return null;
    if (!todayRouteInflight.has(key) && navigator.onLine && distMeters([a.lat, a.lng], [to.lat, to.lng]) / 1000 < ROUTE_MAX_KM[rmode]) {
      todayRouteInflight.add(key);
      fetchJson(`${ROUTERS[rmode]}${a.lng},${a.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`, 9000).then(d => {
        const r = d && d.routes && d.routes[0];
        routeCache[key] = r ? { d: r.duration, s: r.distance, c: r.geometry.coordinates.map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]) } : { none: true };
        saveRouteCache();
        if (todayMode) renderTodayPanel();
      }).catch(() => {}).finally(() => todayRouteInflight.delete(key));
    }
    return null;
  }
