  /* =========================================================
     WEATHER on dated days (Open-Meteo, free, no key)
     ========================================================= */
  /* ---------- Weather forecast for dated days (Open-Meteo, free, no key) ---------- */
  let TEMP_UNIT = loadPref('mappin_temp_unit', /-(US|LR|MM)$/i.test(navigator.language || '') ? 'F' : 'C');
  let WX = {};
  try { WX = JSON.parse(localStorage.getItem('mappin_wx_v1') || '{}') || {}; } catch (e) { WX = {}; }
  const WX_TTL = 3 * 3600e3;
  const wxPending = new Set();
  let wxTimer = null;

  function dayDateIso(d) {
    return DAY_DATES[d] || ((rawData.filter(s => s.day === d && s.date).sort((a, b) => a.order - b.order)[0] || {}).date) || null;
  }
  function dayCentre(d) {
    const pts = rawData.filter(s => s.day === d && hasCoords(s));
    if (!pts.length) return null;
    return { lat: pts.reduce((a, s) => a + s.lat, 0) / pts.length, lng: pts.reduce((a, s) => a + s.lng, 0) / pts.length };
  }
  function wxKey(d) {
    const iso = dayDateIso(d), c = dayCentre(d);
    if (!iso || !c) return null;
    const days = Math.round((isoToDate(iso) - isoToDate(isoFromDate(new Date()))) / 864e5);
    if (days < 0 || days > 15) return null; // forecasts reach about two weeks ahead
    return `${c.lat.toFixed(1)},${c.lng.toFixed(1)},${iso},${TEMP_UNIT}`;
  }

  const WX_ICONS = [[0, 'fa-sun'], [2, 'fa-cloud-sun'], [3, 'fa-cloud'], [48, 'fa-smog'], [67, 'fa-cloud-rain'], [77, 'fa-snowflake'], [82, 'fa-cloud-showers-heavy'], [86, 'fa-snowflake'], [99, 'fa-cloud-bolt']];
  const wxIcon = code => (WX_ICONS.find(([max]) => code <= max) || WX_ICONS[0])[1];

  function wxText(w) {
    return `<i class="fa-solid ${wxIcon(w.code)}"></i> ${Math.round(w.max)}°<span class="wx-min">/${Math.round(w.min)}°</span>${w.pop >= 20 ? ` <span class="wx-rain"><i class="fa-solid fa-droplet"></i>${w.pop}%</span>` : ''}`;
  }

  // Placeholder in the day heading; filled in as soon as the forecast arrives
  function weatherHtml(d) {
    const k = wxKey(d);
    if (!k) return '';
    const w = WX[k];
    if (w && Date.now() - w.at < WX_TTL) return `<span class="day-wx" title="${escapeHtml(t('wxTitle'))}">${wxText(w)}</span>`;
    wxPending.add(d);
    clearTimeout(wxTimer);
    wxTimer = setTimeout(fetchPendingWeather, 500);
    return w ? `<span class="day-wx" data-wx-day="${d}" title="${escapeHtml(t('wxTitle'))}">${wxText(w)}</span>` : `<span class="day-wx" data-wx-day="${d}"></span>`;
  }

  async function fetchPendingWeather() {
    if (!navigator.onLine) return;
    const days = [...wxPending]; wxPending.clear();
    for (const d of days) {
      const k = wxKey(d);
      if (!k) continue;
      const [lat, lng, iso] = k.split(',');
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${iso}&end_date=${iso}${TEMP_UNIT === 'F' ? '&temperature_unit=fahrenheit' : ''}`;
        const j = await fetchJson(url, 6000);
        const dl = j && j.daily;
        if (!dl || !dl.time || !dl.time.length) continue;
        WX[k] = { code: dl.weather_code[0] || 0, max: dl.temperature_2m_max[0], min: dl.temperature_2m_min[0], pop: dl.precipitation_probability_max ? (dl.precipitation_probability_max[0] || 0) : 0, at: Date.now() };
        document.querySelectorAll(`[data-wx-day="${d}"]`).forEach(el => { el.innerHTML = wxText(WX[k]); el.title = t('wxTitle'); });
        if (todayMode && todayDay === d) renderTodayPanel();
      } catch (e) {}
    }
    // keep the saved forecasts small
    const keys = Object.keys(WX).filter(k => Date.now() - WX[k].at < 48 * 3600e3);
    const keep = {}; keys.slice(-60).forEach(k => { keep[k] = WX[k]; }); WX = keep;
    try { localStorage.setItem('mappin_wx_v1', JSON.stringify(WX)); } catch (e) {}
  }

  function todayWeatherHtml() {
    const k = todayDay !== null ? wxKey(todayDay) : null;
    return k && WX[k] ? `<span class="tp-wx">${wxText(WX[k])}</span>` : '';
  }

  function setTempUnit(u) {
    TEMP_UNIT = u;
    savePref('mappin_temp_unit', u);
    renderItinerary();
    if ($('settings-modal').style.display === 'flex') renderSettings();
  }
  function tempUnitSettingHtml() {
    return `<div class="settings-row"><span>${escapeHtml(t('tempUnit'))}</span>
        <div class="segmented">
          <button class="${TEMP_UNIT === 'C' ? 'active' : ''}" onclick="setTempUnit('C')">°C</button>
          <button class="${TEMP_UNIT === 'F' ? 'active' : ''}" onclick="setTempUnit('F')">°F</button>
        </div></div>`;
  }
