  /* =========================================================
     PLANNING: stay length, auto-filled times, budget
     ========================================================= */
  const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'NZD', 'CAD', 'CNY', 'KRW', 'SGD', 'HKD', 'TWD', 'THB', 'INR', 'CHF', 'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'ZAR', 'IDR', 'MYR', 'PHP', 'VND', 'AED'];

  function defaultCurrency() {
    const byRegion = { AU: 'AUD', US: 'USD', GB: 'GBP', NZ: 'NZD', CA: 'CAD', JP: 'JPY', KR: 'KRW', CN: 'CNY', SG: 'SGD', HK: 'HKD', TW: 'TWD', TH: 'THB', IN: 'INR', CH: 'CHF',
      DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', AT: 'EUR', BE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR' };
    const region = ((navigator.language || 'en-AU').split('-')[1] || '').toUpperCase();
    return byRegion[region] || 'AUD';
  }

  let CURRENCY = loadPref('mappin_currency', defaultCurrency());

  /* ---------- Money: each stop can be priced in any currency; totals show in your home currency ----------
     CURRENCY = your home currency (Settings). TRIP.currency = what prices on this trip are usually in.
     A stop can override it (item.currency). Exchange rates come from open.er-api.com, refreshed twice a day. */
  function fmtCur(n, cur) {
    try { return new Intl.NumberFormat(LANG, { style: 'currency', currency: cur, maximumFractionDigits: ['JPY', 'KRW', 'VND', 'IDR', 'TWD'].includes(cur) ? 0 : 2 }).format(n); }
    catch (e) { return `${cur} ${Math.round(n * 100) / 100}`; }
  }
  function fmtMoney(n) { return fmtCur(n, CURRENCY); }
  function tripCurrency() { return (TRIP && TRIP.currency) || CURRENCY; }
  function itemCurrency(item) { return (item && item.currency) || tripCurrency(); }

  let FX = null;
  try { FX = JSON.parse(localStorage.getItem('mappin_fx_v1') || 'null'); } catch (e) { FX = null; }
  let fxLoading = false;
  function refreshRates(force) {
    const fresh = FX && FX.base === CURRENCY && Date.now() - FX.at < 12 * 3600e3;
    if ((fresh && !force) || fxLoading || !navigator.onLine) return;
    fxLoading = true;
    fetchJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(CURRENCY)}`, 8000).then(d => {
      if (d && d.result === 'success' && d.rates) {
        FX = { base: CURRENCY, at: Date.now(), rates: d.rates };
        try { localStorage.setItem('mappin_fx_v1', JSON.stringify(FX)); } catch (e) {}
        renderItinerary();
      }
    }).catch(() => {}).finally(() => { fxLoading = false; });
  }
  // Amount in your home currency, or null if there's no rate yet
  function toHome(n, cur) {
    if (typeof n !== 'number') return null;
    if (!cur || cur === CURRENCY) return n;
    const r = FX && FX.base === CURRENCY && FX.rates && FX.rates[cur];
    if (!r) { refreshRates(); return null; }
    return n / r;
  }
  function needsConversion() { return rawData.some(s => (typeof s.cost === 'number' || typeof s.spent === 'number') && itemCurrency(s) !== CURRENCY); }
  // "¥3,000 (≈ A$30)" for a stop priced in another currency
  function fmtItem(n, item) {
    const cur = itemCurrency(item);
    if (cur === CURRENCY) return fmtMoney(n);
    const h = toHome(n, cur);
    return h === null ? fmtCur(n, cur) : `${fmtCur(n, cur)} (≈ ${fmtMoney(h)})`;
  }
  function sumHome(list, field) { return list.reduce((a, s) => { const v = toHome(s[field], itemCurrency(s)); return v === null ? a : a + v; }, 0); }

  // "¥1,200", "$25.50", "12,50 €" -> number
  function parseCost(v) {
    if (v === null || v === undefined) return null;
    let x = String(v).replace(/[^\d.,-]/g, '');
    if (!x) return null;
    if (/,\d{1,2}$/.test(x) && !/\./.test(x)) x = x.replace(',', '.');
    x = x.replace(/,/g, '');
    const n = parseFloat(x);
    return isNaN(n) ? null : n;
  }

  function dayCost(day) { return sumHome(rawData.filter(s => s.day === day && typeof s.cost === 'number'), 'cost'); }
  function tripCost() { return sumHome(rawData.filter(s => typeof s.cost === 'number'), 'cost'); }
  function daySpent(day) { return sumHome(rawData.filter(s => s.day === day && typeof s.spent === 'number'), 'spent'); }
  function tripSpent() { return sumHome(rawData.filter(s => typeof s.spent === 'number'), 'spent'); }

  function updateBudgetPill() {
    const el = $('budget-pill');
    if (!el) return;
    const total = tripCost();
    el.style.display = total > 0 ? 'inline-block' : 'none';
    el.textContent = total > 0 ? fmtMoney(total) : '';
    el.title = t('tripTotal');
  }

  const STAY_BY_ICON = { 'fa-utensils': 60, 'fa-bed': 30, 'fa-plane': 90, 'fa-train-subway': 15, 'fa-bag-shopping': 60, 'fa-landmark': 60, 'fa-tree': 90, 'fa-music': 120, 'fa-star': 90, 'fa-tag': 45 };
  function stayMinutes(item) {
    return typeof item.stay === 'number' && item.stay >= 0 ? item.stay : (STAY_BY_ICON[categoryIcon(item.category)] || 45);
  }

  function toMin(hhmm) { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  function fromMin(min) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  // Minutes from one stop to the next: real route if one is loaded, otherwise a sensible estimate
  function travelMinutesBetween(a, b) {
    if (!hasCoords(a) || !hasCoords(b)) return 0;
    if (routeMode === 'foot' || routeMode === 'car') {
      const c = routeCache[routeKey(routeMode, a, b)];
      if (c && c.d) return c.d / 60;
    }
    const km = distMeters([a.lat, a.lng], [b.lat, b.lng]) / 1000;
    if (routeMode === 'car') return km * 1.3 / 35 * 60 + 5;
    if (routeMode === 'foot' || km <= 1.2) return km * 1.3 / 4.8 * 60;
    return km * 1.35 / 28 * 60 + 10; // public transport, including waiting
  }

  function autoFillTimes(day) {
    closeMenus();
    const list = dayDisplayOrder(day);
    if (!list.length) return;
    if (!confirm(t('autoTimesConfirm', { name: getDayTitle(day) }))) return;
    let clock = toMin(list[0].time);
    if (isNaN(clock)) { clock = 9 * 60; showToast(t('autoTimesNeedStart', { name: getDayTitle(day) })); }
    list.forEach((s, i) => {
      const fixed = s.fixedTime && !isNaN(toMin(s.time));
      let arrive;
      if (fixed) arrive = toMin(s.time);
      else { arrive = i === 0 ? clock : Math.ceil(clock / 5) * 5; s.time = fromMin(arrive); }
      const next = list[i + 1];
      clock = arrive + stayMinutes(s) + (next ? travelMinutesBetween(s, next) : 0);
    });
    renderItinerary();
    showToast(t('autoTimesDone', { name: getDayTitle(day) }));
  }

  /* =========================================================
     OPENING HOURS: parse OpenStreetMap "opening_hours" and warn when a planned visit looks closed
     ========================================================= */
  const OH_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  let checkHoursOn = loadPref('mappin_check_hours', 'true') === 'true';

  function ohDaySel(sel) {
    const out = new Set();
    let any = false;
    for (const tok of sel.split(',')) {
      const m = tok.match(/^(Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
      if (!m) return null;
      if (m[1] === 'PH') continue;
      any = true;
      const a = OH_DAYS.indexOf(m[1]), b = m[2] ? OH_DAYS.indexOf(m[2]) : a;
      for (let i = a, n = 0; n < 7; i = (i + 1) % 7, n++) { out.add(i); if (i === b) break; }
    }
    return any ? [...out] : [];
  }

  function ohTimes(str) {
    const ranges = [];
    for (const tok of str.split(/\s*,\s*/)) {
      const m = tok.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/);
      if (m) {
        const a = (+m[1]) * 60 + (+m[2]);
        let b = (+m[3]) * 60 + (+m[4]);
        if (b <= a) b += 1440; // past midnight
        ranges.push([a, b]);
        continue;
      }
      const p = tok.match(/^(\d{1,2}):(\d{2})\+$/);
      if (p) { ranges.push([(+p[1]) * 60 + (+p[2]), 1440]); continue; }
      return null;
    }
    return ranges;
  }

  // Split rules on ";" and on ", Mo…" that follows a time (e.g. "Mo-Fr 10:00-20:00, Sa 10:00-18:00")
  function ohRules(s) {
    const out = [];
    s.split(';').forEach(part => {
      let cur = '';
      const re = /,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/g;
      let last = 0, m;
      while ((m = re.exec(part))) {
        const before = part.slice(last, m.index);
        if (/(\d|off|closed)\s*$/i.test(before)) { out.push(cur + before); cur = ''; last = m.index + m[0].length; }
      }
      out.push(cur + part.slice(last));
    });
    return out.map(r => r.trim()).filter(Boolean);
  }

  function parseOpeningHours(oh) {
    const s = String(oh || '').trim();
    if (!s) return null;
    if (/^24\/7$/.test(s)) return { week: Array.from({ length: 7 }, () => [[0, 1440]]), partial: false, always: true };
    const week = Array(7).fill(null);
    let partial = false, used = false;
    for (const rule of ohRules(s)) {
      if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|SH|week|sunrise|sunset|dawn|dusk|easter)\b|\[|"|\|\|/.test(rule)) { partial = true; continue; }
      const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*[-,]\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*)(?:\s*:?\s+|\s*:\s*|$)(.*)$/);
      let days = [0, 1, 2, 3, 4, 5, 6], rest = rule;
      if (m) {
        days = ohDaySel(m[1].replace(/\s+/g, ''));
        rest = m[2];
        if (days === null) { partial = true; continue; }
        if (!days.length) continue; // public holidays only
      }
      rest = rest.trim();
      let ranges;
      if (!rest || /^open$/i.test(rest)) ranges = [[0, 1440]];
      else if (/^(off|closed)$/i.test(rest)) ranges = [];
      else {
        ranges = ohTimes(rest.replace(/\s+open$/i, ''));
        if (!ranges) { partial = true; continue; }
      }
      days.forEach(d => { week[d] = ranges; });
      used = true;
    }
    return used ? { week, partial } : null;
  }

  function hoursStatusAt(oh, iso, hhmm) {
    const p = parseOpeningHours(oh), d = isoToDate(iso);
    if (!p || !d) return null;
    const wd = (d.getDay() + 6) % 7;
    const today = p.week[wd], prev = p.week[(wd + 6) % 7];
    if (today === null && p.partial) return null;
    const ranges = today || []; // days not mentioned are closed
    const spill = (prev || []).filter(r => r[1] > 1440);
    const tm = toMin(hhmm);
    if (isNaN(tm)) return ranges.length || spill.length ? { open: null } : { open: false, allDay: true, wd };
    for (const [a, b] of ranges) if (tm >= a && tm < b) return { open: true, closesAt: b, minsLeft: b - tm, always: !!p.always };
    for (const [, b] of spill) if (tm < b - 1440) return { open: true, closesAt: b - 1440, minsLeft: b - 1440 - tm };
    if (!ranges.length) return { open: false, allDay: true, wd };
    const later = ranges.filter(r => r[0] > tm).sort((x, y) => x[0] - y[0])[0];
    if (later) return { open: false, opensAt: later[0] };
    return { open: false, closedAt: Math.max(...ranges.map(r => r[1])) };
  }

  function hoursWarning(item) {
    if (!checkHoursOn || !item.hours) return null;
    const date = effectiveDate(item);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const st = hoursStatusAt(item.hours, date, item.time);
    if (!st || st.open === null) return null;
    if (st.allDay) {
      const dayName = isoToDate(date).toLocaleDateString(LANG, { weekday: 'long' });
      return { bad: true, text: t('hoursClosedDay', { day: dayName }) };
    }
    if (st.opensAt !== undefined) return { bad: false, text: t('hoursOpensAt', { time: fromMin(st.opensAt) }) };
    if (st.closedAt !== undefined) return { bad: true, text: t('hoursClosedAt', { time: fromMin(st.closedAt) }) };
    if (st.open && !st.always && st.closesAt % 1440 !== 0 && st.minsLeft < Math.min(stayMinutes(item), 120)) {
      return { bad: false, text: t('hoursClosesSoon', { time: fromMin(st.closesAt) }) };
    }
    return null;
  }

  function hoursWarningHtml(item) {
    const w = hoursWarning(item);
    return w ? `<span class="hours-warn ${w.bad ? 'bad' : ''}" title="${escapeHtml(t('hoursTitle'))}"><i class="fa-regular fa-clock"></i> ${escapeHtml(w.text)}</span>` : '';
  }

  /* ---------- Background lookup of opening hours (dated stops only, gently rate-limited) ---------- */
  let hoursTimer = null, hoursBusy = false, hoursFails = 0;

  function scheduleHoursCheck(delay = 2500) {
    if (!checkHoursOn) return;
    clearTimeout(hoursTimer);
    hoursTimer = setTimeout(runHoursCheck, delay);
  }

  async function runHoursCheck() {
    if (hoursBusy || !checkHoursOn || !navigator.onLine) return;
    if (geoWorkers.size) { scheduleHoursCheck(5000); return; } // let location lookups finish first
    hoursBusy = true;
    const gen = importGeneration;
    let changed = false;
    try {
      const todo = rawData.filter(s => hasCoords(s) && !s.hoursChecked && !s.pending && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate(s)));
      // 1. Stops whose map record we know: up to 40 per request
      const withRef = todo.filter(s => s.osmRef);
      for (let i = 0; i < withRef.length; i += 40) {
        const batch = withRef.slice(i, i + 40);
        const d = await fetchJson(`https://nominatim.openstreetmap.org/lookup?format=json&extratags=1&osm_ids=${batch.map(s => s.osmRef).join(',')}`, 9000);
        if (gen !== importGeneration) return;
        const byRef = {};
        (d || []).forEach(x => { const r = osmRefOf(x.osm_type, x.osm_id); if (r) byRef[r] = x; });
        batch.forEach(s => {
          const x = byRef[s.osmRef];
          const oh = x && x.extratags && x.extratags.opening_hours;
          if (oh) { s.hours = oh; s.hoursChecked = true; changed = true; }
        });
        await sleep(1100);
      }
      // 2. The rest: search by name around the pin, one per second
      for (const s of todo.filter(x => !x.hoursChecked)) {
        if (gen !== importGeneration || !checkHoursOn) return;
        const q = (s.cleanTitle || s.title).replace(/\([^)]*\)/g, '').trim();
        const r = await lookupTagsNearby(q, s.lat, s.lng);
        s.hours = r && r.tags && r.tags.opening_hours ? r.tags.opening_hours : null;
        if (r && r.ref && !s.osmRef) s.osmRef = r.ref;
        s.hoursChecked = true;
        changed = true;
        await sleep(1100);
        if (changed && Math.random() < 0.15) { rebaseHistory(); scheduleRender(); } // show progress now and then
      }
      hoursFails = 0;
    } catch (e) {
      hoursFails++;
      scheduleHoursCheck(Math.min(300000, 30000 * hoursFails)); // try again later
    } finally {
      hoursBusy = false;
      if (changed && gen === importGeneration) { rebaseHistory(); scheduleRender(); }
    }
  }

  function currencyOptions(sel) {
    return [...new Set([sel, CURRENCY, tripCurrency(), ...CURRENCIES])].filter(Boolean)
      .map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c}</option>`).join('');
  }
  function setTripCurrency(c) {
    TRIP.currency = c === CURRENCY ? '' : c;
    scheduleAutosave(); recordHistory();
    refreshRates();
    renderItinerary();
    renderSettings();
  }
