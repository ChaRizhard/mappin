  /* =========================================================
     DAYS: list, colours, add / remove / reorder
     ========================================================= */
  function getAllDays() {
    return [...new Set([...rawData.map(d => d.day), ...EXTRA_DAYS])].sort((a, b) => a - b);
  }

  function getDayColour(day) {
    if (DAY_COLOR_MAP[day]) return DAY_COLOR_MAP[day];
    const dg = dayToGroup[day];
    if (dg && DAY_GROUPS[dg]) return DAY_GROUPS[dg].colour;
    return autoDayColour(day - 1);
  }

  // Default colours: the 10-colour palette first, then generated colours that are each clearly
  // different from every earlier one, so no two days look alike
  const AUTO_COLOURS = [...DAY_COLORS];
  let autoColourSeed = 0;
  function autoDayColour(i) {
    let threshold = 70, misses = 0;
    while (AUTO_COLOURS.length <= i) {
      autoColourSeed++;
      const k = autoColourSeed;
      const c = hslToHex((k * 137.508 + 200) % 360, 55 + (k % 4) * 12, 38 + (k % 5) * 7);
      if (AUTO_COLOURS.every(u => colourDistance(u, c) > threshold)) { AUTO_COLOURS.push(c); misses = 0; }
      else if (++misses > 150) { threshold -= 8; misses = 0; }
    }
    return AUTO_COLOURS[i];
  }

  function colourDistance(a, b) {
    const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
    const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255), dg = ((pa >> 8) & 255) - ((pb >> 8) & 255), db = (pa & 255) - (pb & 255);
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // A colour not used (or nearly used) by any existing day
  function uniqueNewDayColour() {
    const used = getAllDays().map(getDayColour).filter(Boolean);
    for (let i = 0; i < 120; i++) {
      const c = autoDayColour(i);
      if (used.every(u => colourDistance(u, c) > 60)) return c;
    }
    return randomHexColour();
  }

  // Pin each day's current colour so inserting or removing days never shifts other days' colours
  function freezeDayColours() {
    getAllDays().forEach(d => { if (!DAY_COLOR_MAP[d] && !dayToGroup[d]) DAY_COLOR_MAP[d] = getDayColour(d); });
  }

  function defaultDayTitle(day) { return t('dayN', { n: day }); }
  function getDayTitle(day) { return DAY_TITLES[day] || defaultDayTitle(day); }

  function remapDayKeys(obj, fn) {
    const out = {};
    Object.keys(obj).forEach(k => { const nk = fn(parseInt(k)); if (nk !== null) out[nk] = obj[k]; });
    return out;
  }
  function remapDaySet(set, fn) {
    const out = new Set();
    set.forEach(d => { const nd = fn(parseInt(d)); if (nd !== null) out.add(nd); });
    return out;
  }

  function remapAllDays(fn) {
    rawData.forEach(s => { s.day = fn(s.day); });
    DAY_TITLES = remapDayKeys(DAY_TITLES, fn);
    DAY_COLOR_MAP = remapDayKeys(DAY_COLOR_MAP, fn);
    DAY_DATES = remapDayKeys(DAY_DATES, fn);
    dayToGroup = remapDayKeys(dayToGroup, fn);
    EXTRA_DAYS = remapDaySet(EXTRA_DAYS, fn);
    collapsedDays = remapDaySet(collapsedDays, fn);
    selectedDays = remapDaySet(selectedDays, fn);
    if (activeDay !== 'all') { const a = fn(activeDay); activeDay = a === null ? 'all' : a; }
  }

  // Put days in a new order (array of current day numbers). Titles, colours, dates and groups move with each day.
  function reorderDays(order) {
    freezeDayColours(); // colours travel with their day
    const mapping = {};
    order.forEach((d, i) => { mapping[d] = i + 1; });
    remapAllDays(d => (mapping[d] !== undefined ? mapping[d] : d));
    return mapping;
  }

  // Insert an empty day at position n (days n and later move down by one)
  function insertDayAt(n) {
    freezeDayColours();
    remapAllDays(d => (d >= n ? d + 1 : d));
    EXTRA_DAYS.add(n);
    // Inserted between two days of the same day group: join it; otherwise give it a colour of its own
    if (dayToGroup[n - 1] && dayToGroup[n - 1] === dayToGroup[n + 1]) dayToGroup[n] = dayToGroup[n - 1];
    else DAY_COLOR_MAP[n] = uniqueNewDayColour();
    if (DAY_DATES[n - 1] && !DAY_DATES[n]) DAY_DATES[n] = addDaysIso(DAY_DATES[n - 1], 1);
    populateFilters();
    renderItinerary();
  }

  function addDayAtEnd() {
    const days = getAllDays();
    const n = days.length ? days[days.length - 1] + 1 : 1;
    freezeDayColours();
    DAY_COLOR_MAP[n] = uniqueNewDayColour();
    EXTRA_DAYS.add(n);
    if (DAY_DATES[n - 1]) DAY_DATES[n] = addDaysIso(DAY_DATES[n - 1], 1);
    populateFilters();
    renderItinerary();
    setTimeout(() => {
      const el = document.querySelector(`.day-section[data-day="${n}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  function removeDay(n) {
    const stops = rawData.filter(s => s.day === n);
    if (stops.length && !confirm(t('removeDayConfirm', { name: getDayTitle(n), n: stops.length }))) return;
    const removedIds = new Set(stops.map(s => s.id));
    rawData = rawData.filter(s => s.day !== n);
    removedIds.forEach(id => { delete stopToGroup[id]; selectedStopIds.delete(id); });
    pruneEmptyGroups();
    freezeDayColours();
    remapAllDays(d => (d === n ? null : d > n ? d - 1 : d));
    pruneEmptyDayGroups();
    populateFilters();
    renderItinerary();
  }

  function pruneEmptyGroups() {
    const used = new Set(Object.values(stopToGroup));
    Object.keys(GROUPS).forEach(g => { if (!used.has(g)) delete GROUPS[g]; });
  }

  function pruneEmptyDayGroups() {
    const days = new Set(getAllDays());
    Object.keys(dayToGroup).forEach(d => { if (!days.has(parseInt(d)) || !DAY_GROUPS[dayToGroup[d]]) delete dayToGroup[d]; });
    const used = new Set(Object.values(dayToGroup));
    Object.keys(DAY_GROUPS).forEach(g => { if (!used.has(g)) { delete DAY_GROUPS[g]; collapsedDayGroups.delete(g); } });
  }

  function toggleDayCollapse(day, forceOpen) {
    if (forceOpen) collapsedDays.delete(day);
    else if (collapsedDays.has(day)) collapsedDays.delete(day); else collapsedDays.add(day);
    const sec = document.querySelector(`.day-section[data-day="${day}"]`);
    if (sec) {
      sec.classList.toggle('collapsed', collapsedDays.has(day));
      const count = sec.querySelector('.day-count');
      if (count) count.style.display = '';
    }
    scheduleAutosave();
  }

  function toggleDayGroupCollapse(id, forceOpen) {
    if (forceOpen) collapsedDayGroups.delete(id);
    else if (collapsedDayGroups.has(id)) collapsedDayGroups.delete(id); else collapsedDayGroups.add(id);
    document.querySelectorAll(`[data-daygroup-wrapper="${id}"]`).forEach(w => w.classList.toggle('collapsed', collapsedDayGroups.has(id)));
    scheduleAutosave();
  }

  // Generic "move whole blocks" helper used for reordering groups and day groups
  function reorderSegments(seq, keyOf, keyOrder) {
    const segs = [];
    seq.forEach(x => {
      const k = keyOf(x);
      const last = segs[segs.length - 1];
      if (k && last && last.k === k) last.items.push(x); else segs.push({ k, items: [x] });
    });
    const keyed = segs.filter(s => s.k).sort((a, b) => keyOrder.indexOf(a.k) - keyOrder.indexOf(b.k));
    let i = 0;
    return segs.map(s => (s.k ? keyed[i++] : s)).flatMap(s => s.items);
  }

  /* =========================================================
     DAY GROUPS
     ========================================================= */
  function groupSelectedDays() {
    closeMenus();
    let days = [...selectedDays].sort((a, b) => a - b);
    if (days.length < 2) { alert(t('selectAtLeast2Days')); return; }

    const all = getAllDays();
    const idx = days.map(d => all.indexOf(d));
    const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    if (!contiguous && confirm(t('moveDaysTogether', { name: getDayTitle(days[0]) }))) {
      const rest = all.filter(d => !days.includes(d) || d === days[0]);
      const at = rest.indexOf(days[0]);
      const order = [...rest.slice(0, at), ...days, ...rest.slice(at + 1)];
      const mapping = reorderDays(order);
      days = days.map(d => mapping[d]);
    }

    const id = 'dg_' + Date.now();
    const cities = [...new Set(rawData.filter(s => days.includes(s.day)).map(s => cityParts(s).clean).filter(Boolean))];
    DAY_GROUPS[id] = {
      id,
      name: cities.length === 1 ? cities[0] : t('dayGroupN', { n: dayGroupCounter }),
      colour: getDayColour(days[0]),
      opacity: 0.08
    };
    dayGroupCounter++;
    days.forEach(d => { dayToGroup[d] = id; delete DAY_COLOR_MAP[d]; });
    pruneEmptyDayGroups();
    exitDaySelectMode();
    populateFilters();
    renderItinerary();
  }

  function ungroupSelectedDays() {
    closeMenus();
    selectedDays.forEach(d => delete dayToGroup[d]);
    pruneEmptyDayGroups();
    exitDaySelectMode();
    renderItinerary();
  }

  function removeDayFromDayGroup(day) {
    closeMenus();
    delete dayToGroup[day];
    pruneEmptyDayGroups();
    renderItinerary();
  }

  function ungroupDayGroup(id) {
    Object.keys(dayToGroup).forEach(d => { if (dayToGroup[d] === id) delete dayToGroup[d]; });
    delete DAY_GROUPS[id];
    collapsedDayGroups.delete(id);
    renderItinerary();
  }

  /* ---------- Day burger menu ---------- */
  function openDayMenu(e, day) {
    e.stopPropagation();
    $('context-menu').style.display = 'none';
    const menu = $('day-menu');
    const nSel = selectedStopIds.size;
    const inDayGroup = dayToGroup[day] && DAY_GROUPS[dayToGroup[day]];
    menu.innerHTML = `
      <div class="context-menu-item" onclick="enterSelectMode(${day})"><i class="fa-solid fa-list-check"></i> ${selectMode ? t('selectingCards') : t('selectCards')}</div>
      <div class="context-menu-item ${nSel < 2 ? 'disabled' : ''}" onclick="groupSelectedStops()"><i class="fa-solid fa-object-group"></i> ${t('groupSelected')}${nSel ? ` (${nSel})` : ''}</div>
      <div class="context-menu-item ${nSel < 1 ? 'disabled' : ''}" onclick="ungroupSelectedStops()"><i class="fa-solid fa-object-ungroup"></i> ${t('ungroupSelected')}</div>
      <div class="menu-divider"></div>
      <div class="context-menu-item" onclick="enterDaySelectMode(${day})"><i class="fa-solid fa-layer-group"></i> ${t('selectDays')}</div>
      ${inDayGroup ? `<div class="context-menu-item" onclick="removeDayFromDayGroup(${day})"><i class="fa-solid fa-arrow-right-from-bracket"></i> ${t('removeFromDayGroup')}</div>` : ''}
      <div class="menu-divider"></div>
      <div class="context-menu-item" onclick="autoFillTimes(${day})"><i class="fa-solid fa-wand-magic-sparkles"></i> ${t('autoTimes')}</div>
      <div class="context-menu-item" onclick="exportDayCalendar(${day})"><i class="fa-regular fa-calendar-plus"></i> ${t('addToCalendar')}</div>
      <div class="context-menu-item" onclick="openChecklist(${day})"><i class="fa-solid fa-list-check"></i> ${t('dayChecklist')}</div>
      <div class="context-menu-item" onclick="saveDayOffline(${day})"><i class="fa-solid fa-download"></i> ${t('saveOffline')}</div>
      <div class="menu-divider"></div>
      <div class="context-menu-item" onclick="closeMenus(); insertDayAt(${day})"><i class="fa-solid fa-arrow-up"></i> ${t('addDayAbove')}</div>
      <div class="context-menu-item" onclick="closeMenus(); insertDayAt(${day + 1})"><i class="fa-solid fa-arrow-down"></i> ${t('addDayBelow')}</div>
      <div class="context-menu-item danger" onclick="closeMenus(); removeDay(${day})"><i class="fa-solid fa-trash"></i> ${escapeHtml(t('removeX', { name: getDayTitle(day) }))}</div>`;
    menu.style.display = 'block';
    if (asSheet(menu)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = r.right - mw, top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = r.top - mh - 4;
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }

  /* ---------- Selection modes (cards / days) ---------- */
  function enterSelectMode(day) {
    closeMenus();
    if (daySelectMode) exitDaySelectMode();
    selectMode = true;
    $('timeline').classList.add('select-mode');
    syncSortables();
    updateSelectBar();
    if (day !== undefined) revealDay(day);
  }

  function exitSelectMode() {
    selectMode = false;
    $('timeline').classList.remove('select-mode');
    syncSortables();
    clearSelection();
    updateSelectBar();
  }

  function enterDaySelectMode(day) {
    closeMenus();
    if (selectMode) exitSelectMode();
    daySelectMode = true;
    selectedDays = new Set(day !== undefined ? [day] : []);
    $('timeline').classList.add('day-select-mode');
    foldDaysForSelect();
    document.querySelectorAll('.day-section').forEach(s => s.classList.toggle('day-selected', selectedDays.has(parseInt(s.dataset.day))));
    updateSelectBar();
  }

  function exitDaySelectMode() {
    daySelectMode = false;
    selectedDays.clear();
    $('timeline').classList.remove('day-select-mode');
    unfoldDaysAfterSelect();
    document.querySelectorAll('.day-section.day-selected').forEach(s => s.classList.remove('day-selected'));
    updateSelectBar();
  }

  function toggleDaySelected(day) {
    if (selectedDays.has(day)) selectedDays.delete(day); else selectedDays.add(day);
    const sec = document.querySelector(`.day-section[data-day="${day}"]`);
    if (sec) sec.classList.toggle('day-selected', selectedDays.has(day));
    updateSelectBar();
  }

  function updateSelectBar() {
    const bar = $('select-bar');
    bar.classList.toggle('show', selectMode || daySelectMode);
    const actions = $('select-bar-actions');
    if (selectMode) {
      $('select-count').innerText = t('selectedN', { n: selectedStopIds.size });
      actions.innerHTML = `
        <button class="btn btn-info" onclick="groupSelectedStops()"><i class="fa-solid fa-object-group"></i> ${t('group')}</button>
        <button class="btn btn-secondary" onclick="ungroupSelectedStops()"><i class="fa-solid fa-object-ungroup"></i> ${t('ungroup')}</button>
        <button class="btn btn-secondary" onclick="exitSelectMode()">${t('cancel')}</button>`;
      $('select-hint').innerText = t('selectCardsHint');
    } else if (daySelectMode) {
      $('select-count').innerText = t('daysSelectedN', { n: selectedDays.size });
      actions.innerHTML = `
        <button class="btn btn-info" onclick="groupSelectedDays()"><i class="fa-solid fa-layer-group"></i> ${t('groupDays')}</button>
        <button class="btn btn-secondary" onclick="ungroupSelectedDays()"><i class="fa-solid fa-object-ungroup"></i> ${t('ungroupDays')}</button>
        <button class="btn btn-secondary" onclick="exitDaySelectMode()">${t('cancel')}</button>`;
      $('select-hint').innerText = t('selectDaysHint');
    }
  }

  function clearSelection() {
    selectedStopIds.clear();
    document.querySelectorAll('.activity-card.selected-multi').forEach(c => c.classList.remove('selected-multi'));
    updateSelectBar();
  }

  // Cards can't be dragged while you're picking them (so a press-and-hold doesn't pick one up by mistake)
  function syncSortables() {
    document.querySelectorAll('#timeline *').forEach(el => {
      const s = window.Sortable && Sortable.get ? Sortable.get(el) : null;
      if (s && s.options && s.options.group && s.options.group.name === 'shared-days') s.option('disabled', VIEW_ONLY || selectMode);
    });
  }

  function toggleCardSelected(id) {
    if (selectedStopIds.has(id)) selectedStopIds.delete(id); else selectedStopIds.add(id);
    const card = $(`card-${id}`);
    if (card) card.classList.toggle('selected-multi', selectedStopIds.has(id));
    updateSelectBar();
  }
