  /* =========================================================
     TRIP TOOLS: fit all pins, moving stops by date, sorting days by date, press-and-hold to select,
     live edits, filter sheet, tips
     ========================================================= */

  /* ---------- Show every pin ----------
     The map area shrinks while the list sheet is pulled up. Fitting pins into a sliver of map used to jump
     to street level somewhere in the middle (e.g. right after importing a CSV with the sheet open), so the
     padding scales with the map, and a fit that can't be done yet waits until the map has room. */
  let deferredFit = null;
  function fitSafe(bounds, opts = {}) {
    if (!map || !bounds || !bounds.isValid()) return;
    const sz = map.getSize();
    if (sz.x < 140 || sz.y < 140) { deferredFit = { bounds, maxZoom: opts.maxZoom || 15 }; return; }
    deferredFit = null;
    const pad = Math.round(Math.max(16, Math.min(50, Math.min(sz.x, sz.y) * 0.12)));
    const o = { padding: [pad, pad], maxZoom: opts.maxZoom || 15 };
    const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
    if (sw.equals(ne)) { map.setView(sw, Math.min(15, o.maxZoom), { animate: !!opts.animate }); return; }
    if (opts.animate && map.flyToBounds) map.flyToBounds(bounds, Object.assign(o, { duration: 0.7 }));
    else map.fitBounds(bounds, o);
  }
  function initDeferredFit() {
    if (!map) return;
    map.on('resize', () => {
      if (!deferredFit) return;
      const sz = map.getSize();
      if (sz.x >= 140 && sz.y >= 140) { const f = deferredFit; deferredFit = null; fitSafe(f.bounds, { maxZoom: f.maxZoom }); }
    });
  }
  function fitAllPins(opts = {}) {
    if (!map) return;
    const pts = rawData.filter(hasCoords).map(s => [s.lat, s.lng]);
    if (!pts.length) { if (!opts.instant) showToast(t('noPinsYet'), { ms: 2500 }); return; }
    cancelPendingFly(); map.stop(); map.closePopup(); // stop any fly to a stop that's still going
    userMovedMap = true;
    fitSafe(L.latLngBounds(pts), { animate: !opts.instant });
  }

  /* ---------- Dates move things where they belong ---------- */
  function moveStopToDay(item, target) {
    const from = item.day;
    delete stopToGroup[item.id];
    const list = dayDisplayOrder(target);
    item.day = target; item.date = '';
    // Put it in time order if it has a time, otherwise at the end of the day
    let at = list.length;
    if (/^\d{1,2}:\d{2}$/.test(item.time || '')) {
      const i = list.findIndex(s => /^\d{1,2}:\d{2}$/.test(s.time || '') && toMin(s.time) > toMin(item.time));
      if (i !== -1) at = i;
    }
    list.splice(at, 0, item);
    renumberDay(target, list);
    renumberDay(from, dayDisplayOrder(from));
    pruneEmptyGroups();
  }
  function daysOutOfDateOrder() {
    const dated = getAllDays().filter(d => DAY_DATES[d]);
    return dated.some((d, i) => i && DAY_DATES[d] < DAY_DATES[dated[i - 1]]);
  }
  function maybeOfferSortDays() {
    if (daysOutOfDateOrder()) showToast(t('sortDaysOffer'), { ms: 8000, actionLabel: t('sortDays'), onAction: sortDaysByDate });
  }
  function sortDaysByDate() {
    const days = getAllDays();
    // Dated days go in date order; undated days keep their place relative to the day before them
    const order = [...days].sort((a, b) => {
      const da = DAY_DATES[a], db = DAY_DATES[b];
      if (da && db) return da < db ? -1 : da > db ? 1 : a - b;
      return days.indexOf(a) - days.indexOf(b);
    });
    reorderDays(order);
    populateFilters();
    renderItinerary();
    showToast(t('daysSorted'), { ms: 3500, actionLabel: t('undoBtn'), onAction: undo });
  }

  /* ---------- Press and hold a card, then let go: start selecting cards (for grouping) ---------- */
  let holdInfo = null, lastPointerTouch = false, ignoreCardTapUntil = 0, pressStart = null;
  document.addEventListener('pointerdown', e => {
    lastPointerTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    pressStart = { at: Date.now(), x: e.clientX, y: e.clientY };
  }, true);
  document.addEventListener('pointermove', e => {
    if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) pressStart.moved = true;
  }, true);
  /* Press and hold a card (touch): selecting starts while the finger is still down, with a little buzz.
     Keep moving after that and it turns into moving the card instead. */
  const HOLD_SELECT_MS = 560;
  let holdTimer = 0, holdSelected = null;
  function cancelHoldTimer() { clearTimeout(holdTimer); holdTimer = 0; }
  function selectByHold(id) {
    if (VIEW_ONLY || isDragging || !rawData.find(s => s.id === id)) return;
    holdSelected = { id, wasSelecting: selectMode };
    try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
    if (!selectMode) enterSelectMode();
    if (!selectedStopIds.has(id)) toggleCardSelected(id);
    const card = $(`card-${id}`);
    if (card) { card.classList.remove('hold-pop'); void card.offsetWidth; card.classList.add('hold-pop'); }
    showTip('select', true);
  }
  // The hold became a drag: undo the selecting it started
  function holdBecameDrag(id) {
    const h = holdSelected; holdSelected = null;
    cancelHoldTimer();
    if (h && h.id === id && !h.wasSelecting && selectMode) exitSelectMode();
  }
  function initHoldSelect() {
    const tl = $('timeline');
    if (!tl) return;
    tl.addEventListener('pointerdown', e => {
      cancelHoldTimer();
      holdSelected = null;
      if (VIEW_ONLY || daySelectMode || e.pointerType === 'mouse' || !e.isPrimary) return;
      const card = e.target.closest('.activity-card');
      if (!card || e.target.closest('input, textarea, select, button, [contenteditable="true"], .card-number')) return;
      if (selectMode && selectedStopIds.has(Number(card.dataset.id))) return;
      const id = Number(card.getAttribute('data-id'));
      holdTimer = setTimeout(() => {
        holdTimer = 0;
        if (isDragging || !pressStart || pressStart.moved) return;
        selectByHold(id);
      }, HOLD_SELECT_MS);
    });
    document.addEventListener('pointermove', e => { if (holdTimer && e.isPrimary && pressStart && pressStart.moved) cancelHoldTimer(); }, true);
    const up = e => {
      if (!e.isPrimary) return;
      cancelHoldTimer();
      if (holdSelected) {
        holdSelected = null;
        ignoreCardTapUntil = Date.now() + 500; // lifting the finger doesn't also toggle the card or open it for editing
        swallowClickOnly();
      }
    };
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', e => { if (e.isPrimary) cancelHoldTimer(); }, true);
  }

  /* ---------- Edits show live while the window is open ---------- */
  let liveTimer = null;
  function scheduleLiveEdit() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if ($('single-item-modal').style.display === 'flex' && singleEditTarget) previewSingleItemModal(true);
      else if ($('color-modal').style.display === 'flex') previewMasterChanges(true);
    }, 220);
  }
  function initLiveEdits() {
    ['single-item-modal', 'color-modal'].forEach(id => {
      const box = $(id) && $(id).querySelector('.modal-box');
      if (!box) return;
      box.addEventListener('input', scheduleLiveEdit);
      box.addEventListener('change', scheduleLiveEdit);
      box.addEventListener('click', e => {
        if (e.target.closest('.modal-actions-footer, .modal-close-x')) return; // Save / Cancel / close
        scheduleLiveEdit();
      });
    });
    ['single-preview-btn', 'master-preview-btn'].forEach(id => { const b = $(id); if (b) b.remove(); });
  }

  /* ---------- Phones held upright: sort and categories live behind one Filter button ---------- */
  function placeFilters() {
    const row = document.querySelector('.filters-row'), body = $('filter-body'), btn = $('filter-btn');
    if (!row || !body || !btn) return;
    const home = document.querySelector('.search-container');
    if (phoneLayoutMQ.matches) { if (row.parentElement !== body) body.appendChild(row); btn.style.display = ''; }
    else { if (row.previousElementSibling !== home && home) home.after(row); btn.style.display = 'none'; closeModalById('filter-modal'); }
    updateFilterBadge();
  }
  function updateFilterBadge() {
    const btn = $('filter-btn');
    if (!btn) return;
    const n = ($('sort-select').value !== 'day' ? 1 : 0) + ($('category-select').value !== 'all' ? 1 : 0);
    btn.classList.toggle('active', n > 0);
    btn.querySelector('.fb-count').textContent = n ? n : '';
  }
  function openFilters() { $('filter-modal').style.display = 'flex'; }
  function resetFilters() {
    $('sort-select').value = 'day';
    if (typeof setCategory === 'function') setCategory('all'); else $('category-select').value = 'all';
    renderItinerary();
    updateFilterBadge();
  }

  /* ---------- Tips: one at a time, each shown once; Settings → Show tips turns them off ---------- */
  const TIPS = { cards: 'tipCards', today: 'tipToday', map: 'tipMap', select: 'tipSelect', selectDays: 'tipSelectDays' };
  let tipShownThisSession = false;
  function tipsOn() { return loadPref('mappin_tips', 'true') === 'true'; }
  function toggleTips() { savePref('mappin_tips', String(!tipsOn())); renderSettings(); }
  function tipsSettingHtml() {
    return `<div class="settings-row"><span>${escapeHtml(t('showTips'))}</span>${switchHtml(tipsOn(), 'toggleTips()', t('showTips'))}</div>`;
  }
  function showTip(key, force) {
    if (!tipsOn() || !TIPS[key] || loadPref('mappin_tip_' + key, '') === '1') return;
    if (tipShownThisSession && !force) return;
    tipShownThisSession = true;
    savePref('mappin_tip_' + key, '1');
    setTimeout(() => showToast('💡 ' + t(TIPS[key]), { ms: 9000, actionLabel: t('gotIt'), onAction: () => {} }), force ? 400 : 1500);
  }
  function maybeShowTips() {
    if (VIEW_ONLY || !rawData.length) return;
    if (todayMode) showTip('today');
    else if (rawData.length >= 2) showTip('cards');
    else showTip('map');
  }
