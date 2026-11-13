  /* =========================================================
     1.4.6: on the trip. Tomorrow at a glance once today is done, and
     "you're here, mark it done?" when you've stayed at a stop for a few minutes.
     ========================================================= */

  /* ---------- Tomorrow at a glance ---------- */
  function tomorrowPreviewHtml() {
    const days = getAllDays();
    const next = days[days.indexOf(todayDay) + 1];
    if (next === undefined) return `<div class="tp-tomorrow"><div class="tpt-label">${escapeHtml(t('tripLastDay'))}</div></div>`;
    const list = dayDisplayOrder(next).filter(s => !isSkipped(s));
    if (!list.length) return '';
    const first = list[0];
    const iso = typeof dayDateIso === 'function' ? dayDateIso(next) : null;
    const todayHotel = todayStops().filter(s => HOTEL_CAT.test(s.category || '')).map(s => normKey(s.cleanTitle || s.title));
    // Things worth knowing tonight: journeys, a new hotel and anything at a fixed time
    const key = list.filter(s => s !== first && (s.fixedTime || /transport|flight/i.test(s.category || '') ||
      (HOTEL_CAT.test(s.category || '') && !todayHotel.includes(normKey(s.cleanTitle || s.title))))).slice(0, 3);
    const line = s => `<div class="tpt-row"><i class="fa-solid ${categoryIcon(s.category)}"></i>${s.time ? `<b>${escapeHtml(s.time)}</b>` : ''}<span>${escapeHtml(s.cleanTitle || s.title)}</span></div>`;
    return `<div class="tp-tomorrow">
      <div class="tpt-label">${escapeHtml(t('tomorrowLabel'))} · ${escapeHtml(getDayTitle(next))}${iso ? ` · ${escapeHtml(formatDateShort(iso))}` : ''}</div>
      <div class="tpt-first">${escapeHtml(t('tomorrowStarts'))}</div>${line(first)}
      ${key.length ? `<div class="tpt-first">${escapeHtml(t('tomorrowAlso'))}</div>${key.map(line).join('')}` : ''}
      <button class="btn btn-secondary tpt-open" onclick="todaySwitchDay(1)">${escapeHtml(t('tomorrowOpen'))} <i class="fa-solid fa-chevron-right"></i></button>
    </div>`;
  }

  /* ---------- Arrived at a stop? (only while MapPin is open, in Today mode, on today's date) ---------- */
  const ARRIVE_MS = 3 * 60 * 1000;
  let arriveWatch = null, arriveNative = false, nearSince = {}, arrivalAsk = null;
  const arrivalDismissed = new Set();
  const arrivalsOn = () => loadPref('mappin_arrivals', '1') === '1';

  async function startArrivalWatch() {
    if (arriveWatch !== null || !todayMode || !arrivalsOn() || !effectiveDayIsToday() || document.hidden) return;
    const Geo = IS_NATIVE ? capPlugin('Geolocation') : null;
    try {
      if (Geo) {
        const p = await Geo.checkPermissions();
        if (!p || (p.location !== 'granted' && p.coarseLocation !== 'granted')) return; // never asks by itself
        arriveNative = true;
        arriveWatch = await Geo.watchPosition({ enableHighAccuracy: true, maximumAge: 20000 }, (pos) => { if (pos) onArrivePos(pos); });
      } else if (navigator.geolocation && navigator.permissions && navigator.permissions.query) {
        const p = await navigator.permissions.query({ name: 'geolocation' });
        if (p.state !== 'granted' || !todayMode) return;
        arriveNative = false;
        arriveWatch = navigator.geolocation.watchPosition(onArrivePos, () => {}, { enableHighAccuracy: true, maximumAge: 20000, timeout: 60000 });
      }
    } catch (e) { arriveWatch = null; }
  }
  function stopArrivalWatch() {
    if (arriveWatch === null) return;
    try {
      if (arriveNative) { const Geo = capPlugin('Geolocation'); if (Geo) Geo.clearWatch({ id: arriveWatch }); }
      else navigator.geolocation.clearWatch(arriveWatch);
    } catch (e) {}
    arriveWatch = null; nearSince = {};
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopArrivalWatch(); else setTimeout(startArrivalWatch, 500); });

  function onArrivePos(pos) {
    const c = pos.coords || {};
    if (typeof c.latitude !== 'number') return;
    placeMe(c.latitude, c.longitude, c.accuracy);
    const acc = c.accuracy || 50;
    if (acc > 150 || !todayMode || !effectiveDayIsToday()) return; // too vague to tell
    const R = Math.max(80, acc), now = Date.now();
    let ask = null;
    todayStops().forEach(s => {
      if (s.done || !hasCoords(s) || arrivalDismissed.has(s.id) || HOTEL_CAT.test(s.category || '')) { delete nearSince[s.id]; return; }
      const d = distMeters([c.latitude, c.longitude], [s.lat, s.lng]);
      if (d <= R) {
        nearSince[s.id] = nearSince[s.id] || now;
        if (now - nearSince[s.id] >= ARRIVE_MS && !ask) ask = s.id;
      } else if (d > R * 1.5) delete nearSince[s.id];
    });
    if (ask !== null && arrivalAsk !== ask) {
      arrivalAsk = ask;
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {}
      renderTodayPanel();
    }
  }

  function arrivalBannerHtml() {
    const s = arrivalAsk !== null && rawData.find(x => x.id === arrivalAsk);
    if (!s || s.done) { arrivalAsk = null; return ''; }
    return `<div class="tp-arrive"><i class="fa-solid fa-location-dot"></i>
      <span>${escapeHtml(t('arrivedAsk', { name: s.cleanTitle || s.title }))}</span>
      <button class="btn btn-success" onclick="arrivalYes()"><i class="fa-solid fa-check"></i> ${escapeHtml(t('markDone'))}</button>
      <button class="btn btn-ghost" onclick="arrivalNo()">${escapeHtml(t('arriveNotNow'))}</button>
      <button class="tp-arrive-off" onclick="arrivalOff()">${escapeHtml(t('arriveStopAsking'))}</button></div>`;
  }
  function arrivalYes() {
    const id = arrivalAsk; arrivalAsk = null;
    arrivalDismissed.add(id);
    const i = todayStops().findIndex(s => s.id === id);
    if (i === -1) { renderTodayPanel(); return; }
    todayIdx = i;
    todayMarkDone();
  }
  function arrivalNo() { if (arrivalAsk !== null) arrivalDismissed.add(arrivalAsk); arrivalAsk = null; renderTodayPanel(); }
  function arrivalOff() {
    savePref('mappin_arrivals', '0'); arrivalAsk = null; stopArrivalWatch(); renderTodayPanel();
    showToast(t('arriveTurnedOff'), { ms: 4000 });
  }
  function setArrivals(on) { savePref('mappin_arrivals', on ? '1' : '0'); if (on) startArrivalWatch(); else stopArrivalWatch(); }
  function toggleArrivals() { setArrivals(!arrivalsOn()); renderSettings(); }
  function arrivalsSettingHtml() {
    return `<div class="settings-row"><span>${escapeHtml(t('arrivalsSetting'))}</span>${switchHtml(arrivalsOn(), 'toggleArrivals()', t('arrivalsSetting'))}</div>`;
  }
