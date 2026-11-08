  /* =========================================================
     RECENT SEARCHES, ADD A DAY TO YOUR CALENDAR, SEND FEEDBACK
     ========================================================= */

  /* ---------- Recent searches: tap the empty search bar to see them again ---------- */
  const RECENT_KEY = 'mappin_recent_searches_v1';
  function recentSearches() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || []; } catch (e) { return []; } }
  function rememberSearch(p) {
    if (!p || !isFinite(p.lat) || !isFinite(p.lng) || !p.name) return;
    const keep = { name: p.name, address: p.address || '', lat: +p.lat, lng: +p.lng, osmRef: p.osmRef || null, category: p.category || '' };
    const list = recentSearches().filter(r => !(r.name === keep.name && Math.abs(r.lat - keep.lat) < 1e-4 && Math.abs(r.lng - keep.lng) < 1e-4));
    list.unshift(keep);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) {}
  }
  function clearRecentSearches() {
    try { localStorage.removeItem(RECENT_KEY); } catch (e) {}
    $('search-results').style.display = 'none';
  }
  function showRecentSearches() {
    const list = recentSearches(), box = $('search-results');
    if (!list.length) { box.style.display = 'none'; return; }
    box.innerHTML = `<div class="search-results-head"><span><i class="fa-solid fa-clock-rotate-left"></i> ${escapeHtml(t('recentSearches'))}</span><button onclick="clearRecentSearches()">${escapeHtml(t('clearResults'))}</button></div>`;
    list.forEach(p => {
      const row = document.createElement('div');
      row.className = 'search-result-item';
      row.innerHTML = `<span>${escapeHtml(p.name)}<small>${escapeHtml(p.address || '')}</small></span> <i class="fa-solid fa-clock-rotate-left"></i>`;
      row.onclick = () => previewPlaceObj(Object.assign({}, p));
      box.appendChild(row);
    });
    box.style.display = 'block';
  }

  /* ---------- Add a day to the calendar ----------
     A window with two ways: every stop at once (a calendar file your phone opens in Calendar),
     or one stop at a time in Google Calendar (works everywhere). */
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function icsFold(line) { const out = []; while (line.length > 72) { out.push(line.slice(0, 72)); line = ' ' + line.slice(72); } out.push(line); return out.join('\r\n'); }
  const hhmmss = n => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}${String(n % 60).padStart(2, '0')}00`;

  function stopTimes(s, iso) {
    const date = (effectiveDate(s) || iso).replace(/-/g, '');
    if (!/^\d{1,2}:\d{2}$/.test(s.time || '')) {
      const next = isoFromDate(new Date(isoToDate(date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).getTime() + 864e5)).replace(/-/g, '');
      return { allDay: true, start: date, end: next };
    }
    const [h, m] = s.time.split(':').map(Number);
    const a = h * 60 + m, e = Math.min(a + Math.max(15, stayMinutes(s)), 23 * 60 + 59);
    return { allDay: false, start: `${date}T${hhmmss(a)}`, end: `${date}T${hhmmss(e)}` };
  }
  function stopDescription(s) {
    return [s.desc, s.bookingRef ? `${t('booking')}: ${s.bookingRef}` : '', safeUrl(s.bookingUrl),
      hasCoords(s) ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}` : ''].filter(Boolean).join('\n');
  }
  function dayIcs(day) {
    const iso = dayDateIso(day), ymd = iso.replace(/-/g, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MapPin//Trip planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    dayDisplayOrder(day).forEach((s, i) => {
      const tm = stopTimes(s, iso), desc = stopDescription(s);
      lines.push('BEGIN:VEVENT', `UID:mappin-${day}-${s.id}-${ymd}@mappin`, `DTSTAMP:${stamp}`);
      if (tm.allDay) lines.push(`DTSTART;VALUE=DATE:${tm.start}`, `DTEND;VALUE=DATE:${tm.end}`);
      else lines.push(`DTSTART:${tm.start}`, `DTEND:${tm.end}`);
      lines.push(icsFold(`SUMMARY:${icsEscape(`${i + 1}. ${s.cleanTitle || s.title}`)}`));
      if (s.address || hasCoords(s)) lines.push(icsFold(`LOCATION:${icsEscape(s.address || `${s.lat},${s.lng}`)}`));
      if (hasCoords(s)) lines.push(`GEO:${s.lat};${s.lng}`);
      if (desc) lines.push(icsFold(`DESCRIPTION:${icsEscape(desc)}`));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  function googleCalUrl(s, iso) {
    const tm = stopTimes(s, iso);
    const q = new URLSearchParams({ action: 'TEMPLATE', text: s.cleanTitle || s.title, dates: `${tm.start}/${tm.end}`, details: stopDescription(s) });
    if (s.address || hasCoords(s)) q.set('location', s.address || `${s.lat},${s.lng}`);
    return `https://calendar.google.com/calendar/render?${q.toString()}`;
  }

  function exportDayCalendar(day) {
    closeMenus();
    const iso = dayDateIso(day);
    if (!iso) {
      showToast(t('calNeedDate'), { ms: 6000, actionLabel: t('setDate'), onAction: () => openSingleDayModal(day) });
      return;
    }
    const stops = dayDisplayOrder(day);
    if (!stops.length) { showToast(t('offlineNoStops'), { ms: 3000 }); return; }
    $('calendar-title').textContent = `${t('addToCalendar')} · ${getDayTitle(day)}`;
    $('calendar-body').innerHTML = `
      <p class="settings-note">${escapeHtml(t('calIntro', { date: formatDateShort(iso) }))}</p>
      <button class="btn btn-primary cal-all" onclick="downloadDayCalendar(${day})"><i class="fa-regular fa-calendar-plus"></i> ${escapeHtml(t('calAddAll', { n: stops.length }))}</button>
      <p class="settings-note cal-or">${escapeHtml(t('calOneByOne'))}</p>
      <div class="cal-list">${stops.map(s => `
        <a class="cal-row" href="${escapeHtml(googleCalUrl(s, iso))}" target="_blank" rel="noopener">
          <span class="cal-time">${escapeHtml(/^\d{1,2}:\d{2}$/.test(s.time || '') ? s.time : t('allDay'))}</span>
          <span class="cal-name">${escapeHtml(s.cleanTitle || s.title)}</span>
          <span class="cal-add"><i class="fa-brands fa-google"></i> ${escapeHtml(t('add'))}</span>
        </a>`).join('')}</div>`;
    $('calendar-modal').style.display = 'flex';
  }

  function downloadDayCalendar(day) {
    const ics = dayIcs(day);
    const name = `MapPin_${(getDayTitle(day) || 'Day').replace(/[^\p{L}\p{N}]+/gu, '_')}.ics`;
    if (isIos() && !IS_NATIVE) {
      // iPhone: opening the calendar file shows Apple's "Add All" screen
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      showToast(t('calIosHint'), { ms: 6000 });
      return;
    }
    shareFile(name, ics, 'text/calendar;charset=utf-8')
      .then(r => { if (r !== 'cancelled') showToast(t(r === 'shared' ? 'calShared' : 'calSaved'), { ms: 5000 }); })
      .catch(() => showToast(t('calFailed'), { ms: 5000 }));
  }

  /* ---------- Send feedback (email with the app version and device filled in) ---------- */
  function feedbackEmail() { return ((window.MAPPIN_CONFIG || {}).feedbackEmail || '').trim(); }
  function sendFeedback() {
    closeAppMenu();
    const device = [
      `MapPin ${APP_VERSION}${IS_NATIVE ? ' (app)' : isStandalone() ? ' (Home Screen app)' : ' (browser)'}`,
      navigator.userAgent,
      `Screen ${screen.width}×${screen.height} @${window.devicePixelRatio || 1}x, window ${window.innerWidth}×${window.innerHeight}`,
      `Language ${LANG}, ${rawData.length} stops`
    ].join('\n');
    const body = `${t('feedbackPrompt')}\n\n\n\n— ${t('feedbackDevice')} —\n${device}`;
    location.href = `mailto:${encodeURIComponent(feedbackEmail())}?subject=${encodeURIComponent(`MapPin feedback (${APP_VERSION})`)}&body=${encodeURIComponent(body)}`;
  }

  /* ---------- Messages: one at a time, so they never stack up and cover the screen ---------- */
  function initSingleToast() {
    const host = $('toast-host');
    if (!host) return;
    new MutationObserver(() => {
      const items = host.querySelectorAll('.toast');
      for (let i = 0; i < items.length - 1; i++) items[i].remove();
    }).observe(host, { childList: true });
  }

  /* ---------- Screen readers: icon-only buttons get their tooltip as a label ---------- */
  function labelIconButtons() {
    document.querySelectorAll('button, [role="button"], .icon-btn, .map-control-btn').forEach(el => {
      if (el.getAttribute('aria-label') && !el.dataset.autoLabel) return;
      const text = (el.textContent || '').trim();
      const label = el.title || el.getAttribute('data-tooltip');
      if (!text && label) { el.setAttribute('aria-label', label); el.dataset.autoLabel = '1'; }
    });
  }
