  /* =========================================================
     TRIP SUMMARY at the top of the itinerary
     ========================================================= */
  /* ---------- Trip summary at the top of the itinerary ---------- */
  function tripSummaryHtml() {
    if (!rawData.length) return '';
    const days = getAllDays();
    const dates = days.map(d => dayDateIso(d)).filter(Boolean).sort();
    let meters = 0;
    days.forEach(d => {
      const pts = dayDisplayOrder(d).filter(hasCoords);
      for (let i = 1; i < pts.length; i++) {
        const m = distMeters([pts[i - 1].lat, pts[i - 1].lng], [pts[i].lat, pts[i].lng]);
        if (m < 300000) meters += m; // ignore flights between cities
      }
    });
    const bits = [];
    if (dates.length) bits.push(`<span><i class="fa-regular fa-calendar"></i> ${escapeHtml(dates[0] === dates[dates.length - 1] ? formatDateShort(dates[0]) : `${formatDateShort(dates[0])} – ${formatDateShort(dates[dates.length - 1])}`)}</span>`);
    bits.push(`<span><i class="fa-solid fa-sun"></i> ${escapeHtml(t('nDays', { n: days.length }))}</span>`);
    bits.push(`<span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(t('stopsCount', { n: rawData.length }))}</span>`);
    if (meters > 0) bits.push(`<span><i class="fa-solid fa-route"></i> ${escapeHtml(formatDistance(meters))}</span>`);
    if (tripCost() && !tripSpent()) bits.push(`<span><i class="fa-solid fa-wallet"></i> ${escapeHtml(fmtMoney(tripCost()))}</span>`);
    const sp = spendSummaryHtml(); if (sp) bits.push(sp);
    const open = CHECKLIST.filter(c => !c.done).length;
    const clLabel = !CHECKLIST.length ? t('checklist') : open ? t('checklistOpenN', { n: open }) : t('checklistAllDone');
    return `<div class="trip-summary" onclick="if(!event.target.closest('.ts-title, .ts-title-input')) openChecklist()">
      <div class="ts-head">
        <button class="ts-title" onclick="renameTrip(this)" title="${escapeHtml(t('renameTrip'))}">${escapeHtml(TRIP.title || t('myTrip'))} <i class="fa-solid fa-pen"></i></button>
        <button class="ts-open ${CHECKLIST.length && !open ? 'done' : ''}"><i class="fa-solid ${CHECKLIST.length && !open ? 'fa-circle-check' : 'fa-list-check'}"></i> ${escapeHtml(clLabel)} <i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div class="ts-bits">${bits.join('')}</div></div>`;
  }
  function renderTripSummary() {
    const tl = $('timeline');
    if (!tl) return;
    let el = $('trip-summary');
    const html = tripSummaryHtml();
    if (!html) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'trip-summary'; }
    el.innerHTML = html;
    if (tl.firstChild !== el) tl.prepend(el);
  }

  // Tap the trip name to rename it (also used as the name in cloud sync and when sharing)
  function renameTrip(btn) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-form-input ts-title-input';
    input.value = TRIP.title || '';
    input.placeholder = t('myTrip');
    input.maxLength = 80;
    let done = false;
    const before = TRIP.title || '';
    const finish = save => {
      if (done) return; done = true;
      if (save && input.value.trim() !== before) {
        TRIP.title = input.value.trim(); scheduleAutosave(); recordHistory();
        showToast(t('tripRenamed'), { ms: 3500, actionLabel: t('undoBtn'), onAction: undo });
      }
      renderTripSummary();
    };
    input.onblur = () => finish(true);
    input.onclick = e => e.stopPropagation();
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') finish(false); };
    btn.replaceWith(input);
    input.focus();
    input.select();
  }
