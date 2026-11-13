  /* =========================================================
     1.4.7: journey times between stops, skipped stops folded away, booking wallet
     ========================================================= */

  /* ---------- Skipped or missed stops ---------- */
  const SKIP_RE = /\s*\((missed|skipped)\)\s*$/i;
  function isSkipped(s) { return !!s && (s.skipped === true || SKIP_RE.test(s.title || '')); }
  function setSkipped(item, on) {
    if (on) item.skipped = true;
    else {
      delete item.skipped;
      if (SKIP_RE.test(item.title || '')) item.title = item.title.replace(SKIP_RE, '');
      if (SKIP_RE.test(item.cleanTitle || '')) item.cleanTitle = item.cleanTitle.replace(SKIP_RE, '');
    }
  }
  function unskipStop(id) {
    const s = rawData.find(x => x.id === id);
    if (!s) return;
    setSkipped(s, false);
    renderItinerary();
    showToast(t('stopBack', { name: s.cleanTitle || s.title }), { ms: 3000, actionLabel: t('undoBtn'), onAction: undo });
  }
  function skipStop(id) {
    const s = rawData.find(x => x.id === id);
    if (!s) return;
    setSkipped(s, true);
    renderItinerary();
    showToast(t('stopSkipped', { name: s.cleanTitle || s.title }), { ms: 4000, actionLabel: t('undoBtn'), onAction: undo });
  }
  const openSkipped = new Set();
  function makeSkippedBlock(day, items) {
    const box = document.createElement('details');
    box.className = 'skipped-block';
    if (openSkipped.has(day)) box.open = true;
    box.addEventListener('toggle', () => { if (box.open) openSkipped.add(day); else openSkipped.delete(day); });
    box.innerHTML = `<summary><i class="fa-solid fa-forward"></i> ${escapeHtml(t('skippedN', { n: items.length }))} <i class="fa-solid fa-chevron-down sk-chev"></i></summary>
      ${items.map(s => `<div class="skipped-row">
        <i class="fa-solid ${categoryIcon(s.category)}"></i>
        <span class="sk-name" onclick="openSingleStopModal(${s.id})">${escapeHtml((s.cleanTitle || s.title).replace(SKIP_RE, ''))}</span>
        <button class="btn btn-ghost sk-back" onclick="unskipStop(${s.id})"><i class="fa-solid fa-rotate-left"></i> ${escapeHtml(t('bringBack'))}</button>
      </div>`).join('')}`;
    return box;
  }

  /* ---------- Journey estimate between two stops (straight-line routes) ---------- */
  function estimateLegHtml(a, b) {
    const tr = travelMinutes(a, b);
    if (!tr) return null;
    const dist = distMeters([a.lat, a.lng], [b.lat, b.lng]);
    if (dist > 150000 || tr.mins > 240) return { html: `<i class="fa-solid fa-plane-departure"></i> ${escapeHtml(t('longHop', { km: formatDistance(dist) }))}` };
    const icon = tr.mode === 'walking' ? 'fa-person-walking' : tr.mode === 'driving' ? 'fa-car' : 'fa-train-subway';
    let label = t(tr.mode === 'walking' ? 'byWalk' : tr.mode === 'driving' ? 'byCar' : 'byTransit', { m: tr.mins });
    if (tr.real) label = label.replace(/^~\s?/, '');
    // Tight: not enough time between the two planned times for the journey (after the planned stay)
    let tight = false;
    const t1 = toMin(a.time), t2 = toMin(b.time);
    if (!isNaN(t1) && !isNaN(t2) && t2 >= t1) tight = t2 - t1 - (Number(a.stay) || 0) < tr.mins;
    return { tight, html: `<i class="fa-solid ${icon}"></i> ${escapeHtml(label)} · ${escapeHtml(formatDistance(dist))}${tight ? ` · <b>${escapeHtml(t('legTight'))}</b>` : ''}` };
  }

  /* ---------- Booking wallet: every booking reference and link in one place ---------- */
  function openBookings() {
    closeMenus(); closeAppMenu();
    renderBookings();
    $('bookings-modal').style.display = 'flex';
  }
  function closeBookings() { $('bookings-modal').style.display = 'none'; }
  function copyBookingRef(id) {
    const s = rawData.find(x => x.id === id);
    if (!s || !s.bookingRef) return;
    Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(s.bookingRef))
      .then(() => showToast(t('refCopied', { ref: s.bookingRef }), { ms: 2200 })).catch(() => prompt('', s.bookingRef));
  }
  function renderBookings() {
    const body = $('bookings-body');
    if (!body) return;
    const list = rawData.filter(s => (s.bookingRef || s.bookingUrl) && !isSkipped(s));
    if (!list.length) { body.innerHTML = keyEventsButtonHtml() + `<p class="settings-note ex-empty">${escapeHtml(t('bookingsEmpty'))}</p>`; return; }
    const today = todayDayNumber();
    const days = [...new Set(list.map(s => s.day))].sort((a, b) => a - b);
    body.innerHTML = keyEventsButtonHtml() + days.map(d => {
      const iso = typeof dayDateIso === 'function' ? dayDateIso(d) : null;
      const items = dayDisplayOrder(d).filter(s => list.includes(s));
      return `<div class="bk-day ${d === today ? 'is-today' : ''} ${today !== null && d < today ? 'is-past' : ''}">
        <div class="bk-day-title">${escapeHtml(getDayTitle(d))}${iso ? ` <span>${escapeHtml(formatDateShort(iso))}</span>` : ''}</div>
        ${items.map(s => `<div class="bk-row">
          <i class="fa-solid ${categoryIcon(s.category)} bk-icon"></i>
          <div class="bk-main" onclick="closeBookings(); revealStop(${s.id}, true)">
            <div class="bk-name">${escapeHtml(s.cleanTitle || s.title)}</div>
            <div class="bk-time">${s.time ? `<i class="fa-regular fa-clock"></i> ${escapeHtml(s.time)}` : ''}${bookingDetails(s) ? `${s.time ? ' · ' : ''}${escapeHtml(bookingDetails(s))}` : ''}</div>
          </div>
          ${s.bookingRef ? `<button class="bk-ref" onclick="copyBookingRef(${s.id})" title="${escapeHtml(t('copyRef'))}"><span>${escapeHtml(s.bookingRef)}</span> <i class="fa-regular fa-copy"></i></button>` : ''}
          ${s.bookingUrl ? `<a class="bk-link" href="${escapeHtml(s.bookingUrl)}" target="_blank" rel="noopener" aria-label="${escapeHtml(t('openBooking'))}"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
        </div>`).join('')}
      </div>`;
    }).join('');
  }

  /* ---------- Flights and hotel check-ins to the phone's calendar (with reminders) ---------- */
  const HOTEL_CAT = /hotel|accommodation|lodging|hostel|ryokan|guesthouse/i;
  const FLIGHT_RE = /\b(flight|airport|airlines?|peach|jetstar|qantas|jal|ana|zipair|terminal)\b|✈/i;
  const CHECK_RE = /check[\s-]?(in|out)/i;
  function keyEventKind(s) {
    if (isSkipped(s) || !effectiveDate(s)) return null;
    const text = `${s.title || ''} ${s.desc || ''}`;
    if (FLIGHT_RE.test(text) && /^\d{1,2}:\d{2}$/.test(s.time || '') && (s.bookingRef || /\b[A-Z0-9]{2}\s?\d{2,4}\b/.test(text))) return 'flight';
    if (HOTEL_CAT.test(s.category || '') && CHECK_RE.test(text)) return 'hotel';
    if (s.bookingRef) return 'booking';
    return null;
  }
  function keyEvents() {
    const today = typeof isoFromDate === 'function' ? isoFromDate(new Date()) : '';
    return rawData.filter(s => keyEventKind(s) && effectiveDate(s) >= today)
      .sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b)) || String(a.time || '').localeCompare(String(b.time || '')));
  }
  function keyEventsIcs(list) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MapPin//Trip planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    list.forEach(s => {
      const kind = keyEventKind(s), tm = stopTimes(s, effectiveDate(s)), desc = stopDescription(s);
      lines.push('BEGIN:VEVENT', `UID:mappin-key-${s.id}-${tm.start}@mappin`, `DTSTAMP:${stamp}`);
      if (tm.allDay) lines.push(`DTSTART;VALUE=DATE:${tm.start}`, `DTEND;VALUE=DATE:${tm.end}`);
      else lines.push(`DTSTART:${tm.start}`, `DTEND:${tm.end}`);
      lines.push(icsFold(`SUMMARY:${icsEscape(`${kind === 'flight' ? '✈ ' : kind === 'hotel' ? '🏨 ' : ''}${s.cleanTitle || s.title}`)}`));
      if (s.address || hasCoords(s)) lines.push(icsFold(`LOCATION:${icsEscape(s.address || `${s.lat},${s.lng}`)}`));
      if (desc) lines.push(icsFold(`DESCRIPTION:${icsEscape(desc)}`));
      // Reminders: flights 3 hours and 1 hour before, everything else 30 minutes before
      (kind === 'flight' ? ['-PT3H', '-PT1H'] : ['-PT30M']).forEach(tr => {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', icsFold(`DESCRIPTION:${icsEscape(s.cleanTitle || s.title)}`), `TRIGGER:${tr}`, 'END:VALARM');
      });
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  function addKeyEventsToCalendar() {
    const list = keyEvents();
    if (!list.length) { showToast(t('keyEventsNone'), { ms: 4000 }); return; }
    downloadIcs(`MapPin_${(TRIP.title || 'Trip').replace(/[^\p{L}\p{N}]+/gu, '_')}_flights_and_hotels.ics`, keyEventsIcs(list));
  }
  function keyEventsButtonHtml() {
    const n = keyEvents().length;
    if (!n) return '';
    return `<button class="btn btn-primary bk-cal" onclick="addKeyEventsToCalendar()"><i class="fa-regular fa-calendar-plus"></i> ${escapeHtml(t('keyEventsAdd', { n }))}</button>
      <p class="settings-note bk-cal-note">${escapeHtml(t('keyEventsNote'))}</p>`;
  }

  /* ---------- 1.4.9: save the next two days for offline (each town on its own, so travel days stay small) ---------- */
  function placeClusters(stops, km = 12) {
    const groups = [];
    stops.filter(hasCoords).forEach(s => {
      const g = groups.find(g => g.some(o => distMeters([o.lat, o.lng], [s.lat, s.lng]) < km * 1000));
      if (g) g.push(s); else groups.push([s]);
    });
    return groups;
  }
  async function saveNextDaysOffline(fromDay) {
    closeMenus(); closeAppMenu();
    const days = getAllDays();
    const start = fromDay !== undefined ? fromDay : (todayDayNumber() !== null ? todayDayNumber() : (activeDay !== 'all' ? activeDay : days[0]));
    const pick = days.slice(Math.max(0, days.indexOf(start)), Math.max(0, days.indexOf(start)) + 2);
    const stops = rawData.filter(s => pick.includes(s.day) && !isSkipped(s));
    // Airports and long journeys are left out of the map areas; towns are what you walk around
    const areas = placeClusters(stops).filter(g => g.length > 1 || !FLIGHT_RE.test(g[0].title || ''));
    if (!areas.length) { showToast(t('offlineNoStops'), { ms: 3500 }); return; }
    showToast(t('offlineNextDays', { n: areas.length, days: pick.map(getDayTitle).join(' + ') }), { ms: 4000 });
    for (const g of areas) {
      const pts = g.map(s => [s.lat, s.lng]);
      let b = L.latLngBounds(pts);
      if (pts.length === 1) b = L.latLngBounds([pts[0][0] - 0.01, pts[0][1] - 0.012], [pts[0][0] + 0.01, pts[0][1] + 0.012]);
      await saveOfflineArea(b.pad(0.25));
    }
  }

  /* ---------- Not booked yet ---------- */
  const NOT_BOOKED_RE = /\b(not booked|unbooked|to book|need to book|book (ahead|now|soon))\b/i;
  function notBookedStops(day) {
    return dayDisplayOrder(day).filter(s => !isSkipped(s) && NOT_BOOKED_RE.test(`${s.title || ''} ${s.desc || ''}`));
  }
  function notBookedHtml(day) {
    const list = notBookedStops(day);
    if (!list.length) return '';
    return list.map(s => `<div class="tp-notbooked"><i class="fa-solid fa-triangle-exclamation"></i> <div><span>${escapeHtml(t('notBookedYet'))}: <a onclick="closeMenus(); revealStop(${s.id}, true)">${escapeHtml(s.cleanTitle || s.title)}</a></span>${bookStayLinksHtml(s)}</div></div>`).join('');
  }

  /* ---------- Booking details read from the notes: where it was booked and for how many nights ---------- */
  const BOOKED_VIA_RE = /\b(Agoda|Booking\.com|Expedia|Hotels\.com|Airbnb|Trip\.com|Rakuten(?: Travel)?|Jalan|JTB|Klook|KKday|Peach|Jetstar|ANA|JAL|Qantas|Zipair|Skyscanner)\b/i;
  function bookingDetails(s) {
    const text = `${s.title || ''} ${s.desc || ''}`;
    const via = (text.match(BOOKED_VIA_RE) || [])[1];
    const n = text.match(/\b(\d+)\s*(?:more\s+)?nights?\b/i);
    const bits = [];
    if (via) bits.push(via);
    if (n) bits.push(t('nNights', { n: Number(n[1]) }));
    return bits.join(' · ');
  }

  /* ---------- 1.4.10: optional stops ---------- */
  function isOptional(s) { return !!s && (s.optional === true || /^\s*optional\b/i.test(s.desc || '') || /\(optional\)/i.test(s.title || '')); }

  /* ---------- Book a place to stay for a night that isn't booked ---------- */
  function stayNightFor(s) {
    const iso = effectiveDate(s);
    if (!iso) return null;
    const out = isoFromDate(new Date(isoToDate(iso).getTime() + 864e5));
    return { iso, out };
  }
  function bookStayLinksHtml(s) {
    const n = stayNightFor(s);
    const place = (s.city || (s.cleanTitle || s.title).replace(/\s*(station|stn|airport).*$/i, '')).trim();
    const maps = hasCoords(s) ? `https://www.google.com/maps/search/hotels/@${s.lat},${s.lng},15z?hl=${LANG}` : `https://www.google.com/maps/search/${encodeURIComponent('hotels ' + place)}`;
    const q = new URLSearchParams({ ss: place });
    if (n) { q.set('checkin', n.iso); q.set('checkout', n.out); }
    if (hasCoords(s)) { q.set('latitude', s.lat); q.set('longitude', s.lng); }
    return `<span class="nb-links"><a href="${escapeHtml(maps)}" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot"></i> ${escapeHtml(t('hotelsMaps'))}</a>
      <a href="https://www.booking.com/searchresults.html?${escapeHtml(q.toString())}" target="_blank" rel="noopener"><i class="fa-solid fa-bed"></i> Booking.com</a></span>`;
  }

  /* ---------- End of the day: what you did ---------- */
  function dayWrapUpHtml(day) {
    const list = dayDisplayOrder(day).filter(s => !isSkipped(s));
    if (!list.length) return '';
    const done = list.filter(s => s.done);
    let m = 0;
    const pts = list.filter(hasCoords);
    for (let i = 1; i < pts.length; i++) { const d = distMeters([pts[i - 1].lat, pts[i - 1].lng], [pts[i].lat, pts[i].lng]); if (d < 30000) m += d; }
    const spent = typeof daySpent === 'function' ? daySpent(day) : 0, planned = typeof dayCost === 'function' ? dayCost(day) : 0;
    const skipped = dayDisplayOrder(day).filter(isSkipped).length;
    const bits = [
      `<span><b>${done.length}/${list.length}</b> ${escapeHtml(t('wrapStops'))}</span>`,
      m ? `<span><b>${escapeHtml(formatDistance(m))}</b> ${escapeHtml(t('wrapAround'))}</span>` : '',
      spent || planned ? `<span><b>${escapeHtml(fmtMoney(spent))}</b> ${escapeHtml(planned ? t('wrapSpentOf', { b: fmtMoney(planned) }) : t('wrapSpent'))}</span>` : '',
      skipped ? `<span><b>${skipped}</b> ${escapeHtml(t('wrapSkipped'))}</span>` : ''
    ].filter(Boolean).join('');
    return `<div class="tp-wrap"><div class="tpt-label">${escapeHtml(t('wrapTitle'))}</div><div class="tpw-bits">${bits}</div>
      <button class="btn btn-ghost tpw-copy" onclick="copyDayWrapUp(${day})"><i class="fa-regular fa-copy"></i> ${escapeHtml(t('wrapCopy'))}</button></div>`;
  }
  function copyDayWrapUp(day) {
    const list = dayDisplayOrder(day).filter(s => !isSkipped(s));
    const iso = typeof dayDateIso === 'function' ? dayDateIso(day) : null;
    const text = [`${getDayTitle(day)}${iso ? ` (${formatDateShort(iso)})` : ''}`]
      .concat(list.map(s => `${s.done ? '✓' : '·'} ${s.time ? s.time + ' ' : ''}${s.cleanTitle || s.title}`)).join('\n');
    Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(text)).then(() => showToast(t('wrapCopied'), { ms: 2200 })).catch(() => prompt('', text));
  }

  /* ---------- From 6 pm, tomorrow shows under the current stop too ---------- */
  function eveningTomorrowHtml() {
    if (!effectiveDayIsToday() || new Date().getHours() < 18) return '';
    return tomorrowPreviewHtml();
  }
