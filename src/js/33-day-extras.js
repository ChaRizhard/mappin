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
    if (!list.length) { body.innerHTML = `<p class="settings-note ex-empty">${escapeHtml(t('bookingsEmpty'))}</p>`; return; }
    const today = todayDayNumber();
    const days = [...new Set(list.map(s => s.day))].sort((a, b) => a - b);
    body.innerHTML = days.map(d => {
      const iso = typeof dayDateIso === 'function' ? dayDateIso(d) : null;
      const items = dayDisplayOrder(d).filter(s => list.includes(s));
      return `<div class="bk-day ${d === today ? 'is-today' : ''} ${today !== null && d < today ? 'is-past' : ''}">
        <div class="bk-day-title">${escapeHtml(getDayTitle(d))}${iso ? ` <span>${escapeHtml(formatDateShort(iso))}</span>` : ''}</div>
        ${items.map(s => `<div class="bk-row">
          <i class="fa-solid ${categoryIcon(s.category)} bk-icon"></i>
          <div class="bk-main" onclick="closeBookings(); revealStop(${s.id}, true)">
            <div class="bk-name">${escapeHtml(s.cleanTitle || s.title)}</div>
            ${s.time ? `<div class="bk-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(s.time)}</div>` : ''}
          </div>
          ${s.bookingRef ? `<button class="bk-ref" onclick="copyBookingRef(${s.id})" title="${escapeHtml(t('copyRef'))}"><span>${escapeHtml(s.bookingRef)}</span> <i class="fa-regular fa-copy"></i></button>` : ''}
          ${s.bookingUrl ? `<a class="bk-link" href="${escapeHtml(s.bookingUrl)}" target="_blank" rel="noopener" aria-label="${escapeHtml(t('openBooking'))}"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
        </div>`).join('')}
      </div>`;
    }).join('');
  }
