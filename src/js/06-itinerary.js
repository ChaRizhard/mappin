  /* =========================================================
     FILTERS / RENDER
     ========================================================= */
  function populateFilters() {
    const days = getAllDays();
    const categories = [...new Set(rawData.map(d => d.category))];

    const catSelect = $('category-select');
    const prevCat = catSelect.value;
    catSelect.innerHTML = `<option value="all">${escapeHtml(t('allCategories'))}</option>`;
    categories.forEach(c => catSelect.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
    if (categories.includes(prevCat)) catSelect.value = prevCat;

    if (activeDay !== 'all' && !days.includes(activeDay)) activeDay = 'all';

    const chips = $('day-chips-container');
    const hasToday = rawData.length && todayDayNumber() !== null;
    chips.innerHTML = (rawData.length ? `<div class="day-chip today-chip ${todayMode ? 'active' : ''}" onclick="toggleToday()" title="${escapeHtml(t('todayTitle'))}">${hasToday && !todayMode ? '<span class="today-dot"></span>' : '<i class="fa-solid fa-location-arrow"></i>'} ${escapeHtml(t('today'))}</div>` : '') +
      `<div class="day-chip ${activeDay === 'all' && !todayMode ? 'active' : ''}" onclick="setDayChip('all')">${escapeHtml(t('allDays'))}</div>`;
    days.forEach(d => {
      chips.innerHTML += `<div class="day-chip ${activeDay == d && !todayMode ? 'active' : ''}" onclick="setDayChip(${d})">${escapeHtml(getDayTitle(d))}</div>`;
    });
    renderCategoryChips();
  }

  function setDayChip(day) {
    const wasToday = todayMode;
    if (map) { cancelPendingFly(); map.stop(); map.closePopup(); }
    if (todayMode) exitToday();
    activeDay = day;
    populateFilters();
    renderItinerary();
    // Leaving Today resizes the list first; wait for that before moving the map so it doesn't jump
    if (day === 'all') setTimeout(() => { if (map) map.invalidateSize(); fitAllPins(); }, wasToday ? 320 : 0);
  }

  function sortItinerary() { renderItinerary(); }

  function hasCoords(item) {
    return typeof item.lat === 'number' && typeof item.lng === 'number' && !isNaN(item.lat) && !isNaN(item.lng);
  }

  function clearMapLayers() {
    markers.forEach(m => map.removeLayer(m));
    polylineSegments.forEach(p => { map.removeLayer(p.layer); if (p.glow) map.removeLayer(p.glow); });
    dotMarkers.forEach(d => map.removeLayer(d));
    spiderLines.forEach(s => map.removeLayer(s));
    markers = []; polylineSegments = []; dotMarkers = []; spiderLines = [];
    Object.values(collapseTimers).forEach(tm => clearTimeout(tm));
    collapseTimers = {}; fannedClusters = {};
    openStopPopupId = null;
  }

  function teardropSvg(fill, label, textColor) {
    return `
      <svg class="teardrop-svg" viewBox="0 0 36 46">
        <path d="M18 0 C27.94 0 36 8.06 36 18 C36 29 18 46 18 46 C18 46 0 29 0 18 C0 8.06 8.06 0 18 0 Z"
              fill="none" stroke="#ffffff" stroke-width="4" stroke-opacity="0.95" stroke-linejoin="round"/>
        <path d="M18 0 C27.94 0 36 8.06 36 18 C36 29 18 46 18 46 C18 46 0 29 0 18 C0 8.06 8.06 0 18 0 Z" fill="${fill}" stroke="none"/>
        ${label !== '' ? `<text x="18" y="17" fill="${textColor}" font-size="${PIN_FONT}" font-weight="800" text-anchor="middle" dominant-baseline="central">${label}</text>` : ''}
      </svg>`;
  }

  function sortItems(items, sortVal) {
    return items.sort((a, b) => {
      if (sortVal === 'name') return (a.cleanTitle || a.title).localeCompare(b.cleanTitle || b.title, LANG);
      if (sortVal === 'address') return (a.address || '').localeCompare(b.address || '', LANG);
      if (sortVal === 'time') return (a.time || '').localeCompare(b.time || '');
      if (sortVal === 'date') {
        const da = parseSortableDate(effectiveDate(a)), db = parseSortableDate(effectiveDate(b));
        const aN = isNaN(da), bN = isNaN(db);
        if (aN && bN) return a.day - b.day || a.order - b.order;
        if (aN) return 1;
        if (bN) return -1;
        return da - db || (a.time || '').localeCompare(b.time || '') || a.day - b.day || a.order - b.order;
      }
      return a.day - b.day || a.order - b.order;
    });
  }

  // Group members always sit together, at the position of the group's first card
  function gatherGroups(items) {
    const out = [];
    const used = new Set();
    items.forEach(it => {
      if (used.has(it.id)) return;
      const g = stopToGroup[it.id];
      if (g && GROUPS[g]) {
        const members = items.filter(x => stopToGroup[x.id] === g);
        members.forEach(m => used.add(m.id));
        out.push({ g, items: members });
      } else {
        used.add(it.id);
        out.push({ g: null, items: [it] });
      }
    });
    return out;
  }

  function renderItinerary() {
    if (!map) return;
    clearMapLayers();

    const sortVal = $('sort-select').value;
    const catVal = $('category-select').value;
    const filtered = sortItems(rawData.filter(item => (activeDay === 'all' || item.day == activeDay) && (catVal === 'all' || item.category === catVal)), sortVal);

    $('activity-count').innerText = t('stopsCount', { n: filtered.length });
    updateBudgetPill();
    updateSyncPill(cloudSyncing ? 'syncing' : undefined);

    const timeline = $('timeline');
    timeline.innerHTML = '';
    timeline.classList.toggle('select-mode', selectMode);
    timeline.classList.toggle('day-select-mode', daySelectMode);

    const daysToShow = new Set(filtered.map(d => d.day));
    if (catVal === 'all') EXTRA_DAYS.forEach(d => { if (activeDay === 'all' || d == activeDay) daysToShow.add(d); });

    if (daysToShow.size === 0) {
      timeline.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-map-location-dot"></i>
          <h3>${escapeHtml(t('noItinerary'))}</h3>
          <p>${escapeHtml(t('emptyHint'))}</p>
          <div class="empty-actions">
            ${[['primary', 'startPlanning()', 'fa-magnifying-glass-location', 'startPlanning', 'startPlanningSub'],
               ['', "document.getElementById('file-input').click()", 'fa-file-import', 'importCsvTitle', 'importCsvSub'],
               ['', 'loadSampleTrip()', 'fa-wand-magic-sparkles', 'sampleTrip', 'sampleTripSub']].map(([cls, fn, icon, title, sub]) => `
            <button class="start-option ${cls}" onclick="${fn}">
              <span class="so-icon"><i class="fa-solid ${icon}"></i></span>
              <span class="so-text"><b>${escapeHtml(t(title))}</b><small>${escapeHtml(t(sub))}</small></span>
              <i class="fa-solid fa-chevron-right so-chev"></i>
            </button>`).join('')}
          </div>
        </div>`;
      renderTodayPanel();
      timeline.appendChild(makeAddDayButton());
      scheduleAutosave();
      recordHistory();
      return;
    }

    const byDay = {};
    filtered.forEach(item => { (byDay[item.day] = byDay[item.day] || []).push(item); });

    const located = filtered.filter(hasCoords);
    const bounds = L.latLngBounds();
    const clusters = {};
    located.forEach(item => {
      const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
      (clusters[key] = clusters[key] || []).push(item);
    });

    let dgWrapper = null, dgId = null;

    [...daysToShow].sort((a, b) => a - b).forEach(dayNum => {
      const dayColour = getDayColour(dayNum);
      const displayDayTitle = getDayTitle(dayNum);
      const segments = gatherGroups(byDay[dayNum] || []);
      const dayItems = segments.flatMap(s => s.items); // display order (used for numbering & routes)
      const isCollapsed = collapsedDays.has(dayNum);

      // Day group wrapper
      const thisDg = dayToGroup[dayNum] && DAY_GROUPS[dayToGroup[dayNum]] ? dayToGroup[dayNum] : null;
      let parent = timeline;
      if (thisDg) {
        if (thisDg !== dgId) {
          dgId = thisDg;
          dgWrapper = makeDayGroupWrapper(DAY_GROUPS[thisDg]);
          timeline.appendChild(dgWrapper);
        }
        parent = dgWrapper.querySelector('.daygroup-days');
      } else {
        dgId = null; dgWrapper = null;
      }

      const daySection = document.createElement('div');
      daySection.className = `day-section ${isCollapsed ? 'collapsed' : ''} ${selectedDays.has(dayNum) ? 'day-selected' : ''}`;
      daySection.setAttribute('data-day', dayNum);

      daySection.innerHTML = `
        <div class="day-section-title">
          <span class="day-check"><i class="fa-solid fa-check"></i></span>
          <div class="color-dot-picker" style="background:${dayColour}" title="${escapeHtml(t('changeColour'))}" onclick="openSingleDayModal(${dayNum})"></div>
          <div class="day-head-main">
          <span class="day-title-text" onclick="openSingleDayModal(${dayNum})">${escapeHtml(displayDayTitle)}</span>
          <div class="day-sub">
          ${DAY_DATES[dayNum] ? `<span class="day-date">${escapeHtml(formatDateShort(DAY_DATES[dayNum]))}</span>` : ''}
          ${weatherHtml(dayNum)}
          ${daySpent(dayNum) > 0 ? `<span class="day-cost ${dayCost(dayNum) && daySpent(dayNum) > dayCost(dayNum) ? 'over' : ''}" title="${escapeHtml(t('spentHint'))}">${escapeHtml(dayCost(dayNum) ? t('spentOf', { a: fmtMoney(daySpent(dayNum)), b: fmtMoney(dayCost(dayNum)) }) : t('spentX', { a: fmtMoney(daySpent(dayNum)) }))}</span>`
            : dayCost(dayNum) > 0 ? `<span class="day-cost">${escapeHtml(fmtMoney(dayCost(dayNum)))}</span>` : ''}
          <span class="day-count">${escapeHtml(t('stopsCount', { n: dayItems.length }))}</span>
          </div>
          </div>
          <div class="day-line" onclick="toggleDayCollapse(${dayNum})"><i class="fa-solid fa-chevron-down day-chevron"></i></div>
          <button class="day-menu-btn" onclick="openDayMenu(event, ${dayNum})"><i class="fa-solid fa-bars"></i></button>
        </div>`;
      // In "select days" mode a click anywhere on the header toggles the day instead
      daySection.querySelector('.day-section-title').addEventListener('click', e => {
        // Tapping an empty part of the day header folds the day away or opens it again
        if (!daySelectMode) {
          if (!e.target.closest('.day-menu-btn, .day-line, .color-dot-picker, .day-title-text, .day-check')) toggleDayCollapse(dayNum);
          return;
        }
        if (e.target.closest('.day-menu-btn, .day-line')) return; // the collapse bar still works
        e.stopPropagation(); e.preventDefault();
        toggleDaySelected(dayNum);
      }, true);

      const dayCardContainer = document.createElement('div');
      dayCardContainer.className = `day-card-container ${dayItems.length === 0 ? 'is-empty' : ''}`;
      dayCardContainer.setAttribute('data-day', dayNum);
      dayCardContainer.setAttribute('data-empty', t('emptyDay'));

      let seq = 0;
      const locatedDayItems = dayItems.filter(hasCoords);
      const nextLocated = {};
      for (let i = 0; i < locatedDayItems.length - 1; i++) nextLocated[locatedDayItems[i].id] = locatedDayItems[i + 1];

      segments.forEach(seg => {
        let targetContainer = dayCardContainer;
        if (seg.g) {
          const groupData = GROUPS[seg.g];
          const wrapper = document.createElement('div');
          wrapper.className = 'group-wrapper';
          wrapper.setAttribute('data-group-wrapper', seg.g);
          wrapper.style.backgroundColor = hexToRgba(groupData.colour, groupData.opacity !== undefined ? groupData.opacity : 0.15);
          wrapper.innerHTML = `
            <div class="group-banner">
              <div class="group-banner-left">
                <div class="color-dot-picker" style="background:${groupData.colour}" onclick="openSingleGroupModal('${seg.g}')" title="${escapeHtml(t('changeColour'))}"></div>
                <span class="group-title-editable" onclick="openSingleGroupModal('${seg.g}')">${escapeHtml(groupData.name)}</span>
              </div>
              <button class="ungroup-btn" title="${escapeHtml(t('ungroupAllTitle'))}" onclick="ungroupGroup('${seg.g}')">
                <i class="fa-solid fa-object-ungroup"></i> ${escapeHtml(t('ungroup'))}
              </button>
            </div>
            <div class="group-cards-container" data-day="${dayNum}" data-group="${seg.g}"></div>`;
          dayCardContainer.appendChild(wrapper);
          targetContainer = wrapper.querySelector('.group-cards-container');
          new Sortable(targetContainer, sortableOptions());
        }

        seg.items.forEach(item => {
          seq++;
          const seqNumber = seq;
          const isStart = seqNumber === 1;
          const stopColour = getStopColour(item);
          const gId = seg.g;

          const card = document.createElement('div');
          card.className = `activity-card ${selectedStopIds.has(item.id) ? 'selected-multi' : ''} ${item.done ? 'done' : ''}`;
          card.id = `card-${item.id}`;
          card.setAttribute('data-id', item.id);
          card.onmousedown = (e) => handleCardClick(e, item.id);
          card.oncontextmenu = (e) => handleCardContextMenu(e, item.id);
          // Mouse only: taps fire pretend mouse events that never "leave", which left cards highlighted on phones
          card.onpointerenter = ev => { if (ev.pointerType === 'mouse') highlightSinglePin(item.id, true); };
          card.onpointerleave = ev => { if (ev.pointerType === 'mouse') highlightSinglePin(item.id, false); };
          card.ondblclick = (e) => {
            if (Date.now() - lastCardFlyAt < 700) return; // already handled by the double-tap on a phone
            if (selectMode || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            clearTimeout(inlineEditTimer);
            flyToStop(item.id);
          };

          let locTag = '';
          if (item.pending) locTag = `<span class="loc-tag pending"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(t('locatingTag'))}</span>`;
          else if (item.notFound) locTag = `<span class="loc-tag missing" onclick="startRelocate(${item.id}, event)"><i class="fa-solid fa-location-crosshairs"></i> ${escapeHtml(t('notFoundTag'))}</span>`;
          else if (item.approx) locTag = `<span class="loc-tag approx" onclick="startRelocate(${item.id}, event)"><i class="fa-solid fa-location-crosshairs"></i> ${escapeHtml(t('approxTag'))}</span>`;

          const effDate = effectiveDate(item);
          const dateChip = `<span class="date-chip ${!effDate ? 'empty' : item.date ? '' : 'inherited'}" onclick="editCardDate(${item.id}, event)" title="${escapeHtml(item.date ? t('changeDate') : effDate ? t('dateFromDay') : t('addDate'))}"><i class="fa-regular fa-calendar cal-icon"></i> ${effDate ? escapeHtml(displayDate(effDate)) : escapeHtml(t('addDate'))}</span>`;

          card.innerHTML = `
            <div class="card-number" style="background:${stopColour}" onclick="if(!selectMode){event.stopPropagation(); flyToStop(${item.id});}" title="${escapeHtml(t('showOnMap'))}">${seqNumber}<span class="select-check"><i class="fa-solid fa-check"></i></span></div>
            <div class="card-content">
              <div class="card-header">
                <span class="card-title-editable" onclick="queueInlineEdit('title', ${item.id}, event)">${escapeHtml(item.title)}</span>
                <span class="card-time ${item.fixedTime ? 'fixed' : ''}" title="${escapeHtml(t('editTime'))}" onclick="event.stopPropagation(); openSingleStopModal(${item.id})">${item.time ? `${item.fixedTime ? '<i class="fa-solid fa-thumbtack" style="font-size:9px"></i> ' : ''}${escapeHtml(item.time)}` : '<i class="fa-regular fa-clock"></i>'}</span>
                <div class="card-actions">
                  ${gId ? `<button class="card-action-btn leave-group" title="${escapeHtml(t('leaveGroup'))}" onclick="leaveGroup(${item.id}, event)"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>` : ''}
                  <div class="color-dot-picker" style="background:${stopColour}" title="${escapeHtml(t('changeColour'))}" onclick="openSingleStopModal(${item.id})"></div>
                  <button class="card-action-btn" title="${escapeHtml(t('deleteT'))}" onclick="deleteCard(${item.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
              </div>
              <div class="card-meta"><span class="cat-tag" title="${escapeHtml(t('changeCategory'))}" onclick="editCategory(${item.id}, event)"><i class="fa-solid ${categoryIcon(item.category)}"></i> ${escapeHtml(item.category)}</span> ${dateChip} ${costChipHtml(item)} ${bookingChipHtml(item)} ${hoursWarningHtml(item)} ${isStart ? `<b style="color:#10b981">• ${escapeHtml(t('start'))}</b>` : ''} ${locTag}</div>
              <div class="card-desc-editable" onclick="queueInlineEdit('desc', ${item.id}, event)">${escapeHtml(item.desc || item.address || t('clickNotes'))}</div>
            </div>`;
          targetContainer.appendChild(card);

          // Travel time to the next stop
          const nextItem = hasCoords(item) ? nextLocated[item.id] : null;
          if (nextItem && routeMode !== 'straight') {
            const pill = document.createElement('div');
            pill.className = 'travel-pill';
            pill.setAttribute('data-route', routeKey(routeMode, item, nextItem));
            pill.innerHTML = travelPillHtml(routeMode, item, nextItem);
            targetContainer.appendChild(pill);
          }

          if (!hasCoords(item)) return;
          bounds.extend([item.lat, item.lng]);
          addStopMarker(item, seqNumber, stopColour, displayDayTitle, clusters);
        });
      });

      // Route lines (glow underlay + animated dashes) between consecutive located stops
      for (let i = 0; i < locatedDayItems.length - 1; i++) {
        drawSegment(locatedDayItems[i], locatedDayItems[i + 1], dayNum);
      }

      daySection.appendChild(dayCardContainer);
      parent.appendChild(daySection);
      new Sortable(dayCardContainer, sortableOptions());
    });

    timeline.appendChild(makeAddDayButton());

    if (located.length > 0) {
      if (pendingFitAll) { fitSafe(bounds); pendingFitAll = false; }
      else if (activeDay !== 'all') fitSafe(bounds, { maxZoom: 18 });
    }
    renderTripSummary();
    scheduleAutosave();
    recordHistory();
    if (todayMode) renderTodayPanel();
    if ($('expenses-modal') && $('expenses-modal').style.display === 'flex') renderExpenses();
  }

  /* ---------- Categories: an icon per kind of stop, editable inline ---------- */
  const CATEGORY_ICONS = [
    [/food|restaurant|eat|cafe|coffee|ramen|sushi|bakery|lunch|dinner|breakfast|bar|izakaya|dessert|meal|食|レストラン|カフェ/i, 'fa-utensils'],
    [/hotel|stay|accommodation|hostel|ryokan|apartment|airbnb|lodging|check.?in|宿|ホテル/i, 'fa-bed'],
    [/flight|airport|plane|fly/i, 'fa-plane'],
    [/transport|train|station|bus|ferry|metro|subway|shinkansen|transfer|drive|car|taxi|移動|駅/i, 'fa-train-subway'],
    [/shop|shopping|mall|market|store|souvenir|買/i, 'fa-bag-shopping'],
    [/sight|attraction|temple|shrine|museum|landmark|view|tower|castle|観光|寺|神社/i, 'fa-landmark'],
    [/nature|park|hike|garden|beach|mountain|lake|onsen|hot spring|公園|温泉/i, 'fa-tree'],
    [/night|club|show|concert|theatre|theater|karaoke/i, 'fa-music'],
    [/activity|tour|experience|event|class|game|kart/i, 'fa-star']
  ];
  function categoryIcon(cat) {
    const hit = CATEGORY_ICONS.find(([re]) => re.test(cat || ''));
    return hit ? hit[1] : 'fa-tag';
  }

  function editCategory(id, e) {
    e.stopPropagation();
    if (selectMode) return;
    const item = rawData.find(d => d.id === id);
    const tag = e.currentTarget;
    if (!item || !tag) return;
    const listId = 'cat-options';
    let dl = $(listId);
    if (!dl) { dl = document.createElement('datalist'); dl.id = listId; document.body.appendChild(dl); }
    dl.innerHTML = [...new Set(rawData.map(d => d.category).filter(Boolean))].map(c => `<option value="${escapeHtml(c)}">`).join('');
    const input = document.createElement('input');
    input.className = 'cat-input';
    input.setAttribute('list', listId);
    input.value = item.category || '';
    input.onmousedown = ev => ev.stopPropagation();
    input.onclick = ev => ev.stopPropagation();
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      if (save && input.value.trim()) item.category = input.value.trim();
      populateFilters();
      renderItinerary();
    };
    input.onkeydown = ev => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); };
    input.onblur = () => finish(true);
    tag.replaceWith(input);
    input.focus(); input.select();
  }

  function makeDayGroupWrapper(dg) {
    const n = Object.values(dayToGroup).filter(v => v === dg.id).length;
    const w = document.createElement('div');
    w.className = `daygroup-wrapper ${collapsedDayGroups.has(dg.id) ? 'collapsed' : ''}`;
    w.setAttribute('data-daygroup-wrapper', dg.id);
    w.style.backgroundColor = hexToRgba(dg.colour, dg.opacity !== undefined ? dg.opacity : 0.08);
    w.style.borderColor = hexToRgba(dg.colour, 0.45);
    w.innerHTML = `
      <div class="daygroup-banner">
        <div class="color-dot-picker" style="background:${dg.colour}" title="${escapeHtml(t('changeColour'))}" onclick="openSingleDayGroupModal('${dg.id}')"></div>
        <span class="group-title-editable" onclick="openSingleDayGroupModal('${dg.id}')"><i class="fa-solid fa-layer-group" style="opacity:.7"></i> ${escapeHtml(dg.name)}</span>
        <span class="day-count">${escapeHtml(t('daysN', { n }))}</span>
        <div class="day-line" onclick="toggleDayGroupCollapse('${dg.id}')"><i class="fa-solid fa-chevron-down day-chevron dg"></i></div>
        <button class="ungroup-btn" onclick="ungroupDayGroup('${dg.id}')"><i class="fa-solid fa-object-ungroup"></i> ${escapeHtml(t('ungroupDays'))}</button>
      </div>
      <div class="daygroup-days"></div>`;
    return w;
  }

  function addStopMarker(item, seqNumber, stopColour, displayDayTitle, clusters) {
    const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
    const isClustered = clusters[key].length > 1;

    if (isClustered && !dotMarkers.some(d => d.clusterKey === key)) {
      const dot = L.circleMarker([item.lat, item.lng], { radius: 5, fillColor: stopColour, color: '#ffffff', weight: 2, fillOpacity: 0.95 }).addTo(map);
      dot.clusterKey = key;
      dot.on('mouseover', () => fanOutCluster(key));
      dot.on('mouseout', () => scheduleCollapse(key));
      dotMarkers.push(dot);
    }

    const textColor = stopColour.toLowerCase() === '#ffffff' || stopColour.toLowerCase() === '#eab308' ? '#000000' : '#ffffff';
    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div class="teardrop-pin-container" id="pin-wrapper-${item.id}">${teardropSvg(stopColour, seqNumber, textColor)}</div>`,
      iconSize: [PIN_W, PIN_H], iconAnchor: [PIN_W / 2, PIN_H], popupAnchor: [0, -PIN_H + 4]
    });

    const marker = L.marker([item.lat, item.lng], { icon: customIcon, draggable: !item.locked, autoPan: true }).addTo(map);
    marker.id = item.id;
    marker.day = item.day;
    marker.lat = item.lat;
    marker.lng = item.lng;
    marker.clusterKey = key;

    marker.on('mouseover', () => { if (!lastPointerTouch) highlightSinglePin(item.id, true); if (isClustered) fanOutCluster(key); });
    marker.on('mouseout', () => { if (!lastPointerTouch) highlightSinglePin(item.id, false); if (isClustered) scheduleCollapse(key); });
    // Tapping a pin opens its day (and day group) if collapsed; a second tap straight after takes the list
    // to its card (see initPinDoubleTap: the popup can slide the map between the two taps)
    marker.on('click', e => {
      const oe = e.originalEvent;
      lastPinTap = { id: item.id, at: Date.now(), x: oe ? oe.clientX : 0, y: oe ? oe.clientY : 0 };
      revealStop(item.id, false);
    });
    marker.on('dblclick', e => { if (e.originalEvent) L.DomEvent.stop(e.originalEvent); });

    marker.on('dragstart', () => { isDragging = true; collapseCluster(key); map.closePopup(); });
    marker.on('dragend', e => {
      isDragging = false;
      const ll = e.target.getLatLng();
      const prev = { lat: item.lat, lng: item.lng, approx: item.approx, notFound: item.notFound };
      item.lat = ll.lat; item.lng = ll.lng; item.approx = false; item.notFound = false;
      renderItinerary();
      showToast(t('pinMoved', { name: item.cleanTitle || item.title }), {
        actionLabel: t('undo'),
        onAction: () => { Object.assign(item, prev); renderItinerary(); }
      });
    });

    marker.bindPopup(`
      <div class="mp-popup">
        <div class="mp-eyebrow" style="color:${stopColour}">${escapeHtml(displayDayTitle)} • ${escapeHtml(t('stopN', { n: seqNumber }))}</div>
        <div class="mp-title">${escapeHtml(item.title)}</div>
        <div class="mp-sub">${escapeHtml(item.address || item.desc || '')}</div>
        ${hoursWarning(item) ? `<div style="margin:-2px 0 8px">${hoursWarningHtml(item)}</div>` : ''}
        <div class="place-details" id="pd-stop-${item.id}"><div class="pd-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(t('loadingDetails'))}</div></div>
        <div class="popup-actions-footer">
          <button class="pin-toggle-btn show-in-list wide" aria-label="${escapeHtml(t('showInList'))}" onclick="map.closePopup(); revealStop(${item.id}, true)"><i class="fa-solid fa-list-ol"></i><span>${escapeHtml(t('showInList'))}</span></button>
          <button class="pin-toggle-btn lock" data-tooltip="${escapeHtml(item.locked ? t('unlockPin') : t('lockPin'))}" aria-label="${escapeHtml(item.locked ? t('unlockPin') : t('lockPin'))}" onclick="togglePinLockFor(${item.id})"><i class="fa-solid ${item.locked ? 'fa-lock' : 'fa-lock-open'}"></i></button>
          <button class="pin-toggle-btn remove" data-tooltip="${escapeHtml(t('removePin'))}" aria-label="${escapeHtml(t('removePin'))}" onclick="removePinFromPopup(${item.id})">${TRASH_SVG}</button>
        </div>
      </div>`, { maxWidth: 300, minWidth: 250 });

    marker.on('popupopen', () => { openStopPopupId = item.id; loadStopDetails(item, marker); });
    marker.on('popupclose', () => { if (openStopPopupId === item.id) openStopPopupId = null; });

    markers.push(marker);
  }

  function drawSegment(fromItem, toItem, dayNum) {
    const lineColor = getStopColour(fromItem);
    let pts = [[fromItem.lat, fromItem.lng], [toItem.lat, toItem.lng]];
    let rk = null;
    if (routeMode === 'foot' || routeMode === 'car') {
      rk = routeKey(routeMode, fromItem, toItem);
      const km = distMeters(pts[0], pts[1]) / 1000;
      const cached = routeCache[rk];
      if (cached && cached.c) pts = cached.c;
      else if (!cached && km <= ROUTE_MAX_KM[routeMode]) requestRoute(routeMode, fromItem, toItem);
    }
    const glow = L.polyline(pts, { color: '#ffffff', weight: 9, opacity: 0.4, className: 'route-glow', interactive: false }).addTo(map);
    const lineLayer = L.polyline(pts, { color: lineColor, weight: 4, opacity: 0.9, className: 'animated-route-line' }).addTo(map);
    polylineSegments.push({ layer: lineLayer, glow, day: dayNum, fromId: fromItem.id, toId: toItem.id, routeKey: rk });
  }

  function sortableOptions() {
    return {
      group: 'shared-days',
      animation: 150,
      disabled: VIEW_ONLY || selectMode,
      // On touch screens a press-and-hold picks a card up, so normal swipes scroll the list.
      // The card copy follows your finger (instead of iPhone's own drag preview), and the list scrolls near the edges.
      delay: 280,
      delayOnTouchOnly: true,
      touchStartThreshold: 6,
      forceFallback: true,
      fallbackOnBody: true, // the copy sits above the whole page (the list sheet would clip it)
      fallbackClass: 'sortable-fallback',
      fallbackTolerance: 8, // a slightly shaky hold still counts as holding (for selecting)
      scroll: true,
      scrollSensitivity: 90,
      scrollSpeed: 14,
      bubbleScroll: true,
      chosenClass: 'sortable-chosen',
      swapThreshold: 0.65,
      onChoose: function(evt) {
        holdInfo = { id: Number(evt.item.getAttribute('data-id')), started: false, touch: lastPointerTouch };
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
        if (lastPointerTouch) startDragAssist(); // a second finger can scroll the list as soon as a card is picked up
      },
      onUnchoose: function() { holdInfo = null; if (!isDragging) stopDragAssist(); },
      draggable: '.activity-card',
      ghostClass: 'sortable-ghost',
      filter: 'input, textarea, select',
      preventOnFilter: false,
      onStart: function(evt) { isDragging = true; if (holdInfo) holdInfo.started = true; holdBecameDrag(Number(evt.item.getAttribute('data-id'))); if (!dragAssist) startDragAssist(); },
      onEnd: function() { isDragging = false; stopDragAssist(); reorderAllStops(); }
    };
  }

  function makeAddDayButton() {
    const btn = document.createElement('button');
    btn.className = 'add-day-btn';
    btn.innerHTML = `<i class="fa-solid fa-plus"></i> ${escapeHtml(t('addDay'))}`;
    btn.onclick = addDayAtEnd;
    return btn;
  }

  function escapeHtml(str) {
    if (str === undefined || str === null || str === '') return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getStopColour(item) {
    if (item.customColour) return item.customColour;
    const gId = stopToGroup[item.id];
    if (gId && GROUPS[gId]) return GROUPS[gId].colour;
    return getDayColour(item.day);
  }

  function parseSortableDate(str) {
    if (!str) return NaN;
    let s = String(str).trim();
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime();
    const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (dmy) {
      let y = parseInt(dmy[3]); if (y < 100) y += 2000;
      return new Date(y, parseInt(dmy[2]) - 1, parseInt(dmy[1])).getTime();
    }
    let tm = Date.parse(s);
    if (!isNaN(tm) && /\d{4}/.test(s)) return tm;
    // e.g. "Fri 6 Nov" (no year): drop the weekday and assume the next time that date comes round
    s = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s*/i, '');
    if (!/\d{4}/.test(s)) {
      const year = new Date().getFullYear();
      tm = Date.parse(`${s} ${year}`);
      if (!isNaN(tm) && tm < Date.now() - 60 * 86400000) tm = Date.parse(`${s} ${year + 1}`);
    }
    return tm;
  }

  /* =========================================================
     COLOUR PICKER (swatches + 2 customisable boxes)
     ========================================================= */
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  function randomHexColour() {
    return hslToHex(Math.floor(Math.random() * 360), 60 + Math.random() * 30, 45 + Math.random() * 15);
  }

  function buildColourPickerHtml(ctx, currentColor) {
    const cur = (currentColor || '').toLowerCase();
    const swatches = DEFAULT_PALETTE.map(c => `
      <div class="color-swatch ${c === cur ? 'selected' : ''}" style="background:${c}; ${c === '#ffffff' ? 'border:1px solid #94a3b8;' : ''}"
           onclick="pickColour('${ctx}', '${c}', this)"></div>`).join('');
    const slot = (n, hex) => `
      <div class="custom-slot" data-slot="${n}" onclick="pickCustomSlot('${ctx}', ${n})">
        <input type="color" value="${hex}" onclick="event.stopPropagation()" oninput="customSlotChanged('${ctx}', ${n}, this.value)">
        <span class="custom-slot-label">${hex.toUpperCase()}</span>
      </div>`;
    return `
      <div id="picker-${ctx}">
        <div class="palette-swatches">${swatches}</div>
        <div class="custom-color-slots">
          ${slot(1, randomHexColour())}
          ${slot(2, randomHexColour())}
          <div class="selected-colour-readout">
            <span class="selected-colour-dot" style="background:${currentColor}"></span>
            <span class="custom-slot-label picker-hex">${(currentColor || '').toUpperCase()}</span>
          </div>
        </div>
      </div>`;
  }

  function setStagedColour(ctx, hex) {
    if (ctx === 'single') { singleStagedData.colour = hex; singleStagedData.colourChanged = true; }
    else if (ctx.startsWith('day-')) stagedDayColors[parseInt(ctx.slice(4))] = hex;
    else if (ctx.startsWith('group-')) stagedGroupColors[ctx.slice(6)] = hex;
    else if (ctx.startsWith('dg-')) stagedDgColors[ctx.slice(3)] = hex;
    stagedChanged.add(ctx);
  }

  function markPickerSelection(ctx, hex, selectedEl) {
    const picker = $(`picker-${ctx}`);
    if (!picker) return;
    picker.querySelectorAll('.color-swatch, .custom-slot').forEach(el => el.classList.remove('selected'));
    if (selectedEl) selectedEl.classList.add('selected');
    const dot = picker.querySelector('.selected-colour-dot');
    const label = picker.querySelector('.picker-hex');
    if (dot) dot.style.background = hex;
    if (label) label.innerText = hex.toUpperCase();
  }

  function pickColour(ctx, hex, el) { setStagedColour(ctx, hex); markPickerSelection(ctx, hex, el); }

  function pickCustomSlot(ctx, n) {
    const picker = $(`picker-${ctx}`);
    const slotEl = picker && picker.querySelector(`.custom-slot[data-slot="${n}"]`);
    if (slotEl) pickColour(ctx, slotEl.querySelector('input').value, slotEl);
  }

  function customSlotChanged(ctx, n, hex) {
    const picker = $(`picker-${ctx}`);
    const slotEl = picker && picker.querySelector(`.custom-slot[data-slot="${n}"]`);
    if (!slotEl) return;
    slotEl.querySelector('.custom-slot-label').innerText = hex.toUpperCase();
    pickColour(ctx, hex, slotEl);
  }

  // Live preview of a box's translucency while the slider moves
  function previewGroupOpacity(val) {
    singleStagedData.opacity = parseFloat(val);
    const label = $('single-opacity-value');
    if (label) label.innerText = `${Math.round(singleStagedData.opacity * 100)}%`;
    if (!singleEditTarget) return;
    const colour = singleStagedData.colour;
    if (singleEditTarget.type === 'group') {
      const w = document.querySelector(`[data-group-wrapper="${singleEditTarget.id}"]`);
      if (w) w.style.backgroundColor = hexToRgba(colour, singleStagedData.opacity);
    } else if (singleEditTarget.type === 'daygroup') {
      document.querySelectorAll(`[data-daygroup-wrapper="${singleEditTarget.id}"]`).forEach(w => { w.style.backgroundColor = hexToRgba(colour, singleStagedData.opacity); });
    }
  }

  function hexToRgba(hex, opacity) {
    let c = String(hex || '#3b82f6').replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${opacity})`;
  }

  function lightenColor(color, percent) {
    let num = parseInt(color.replace('#', ''), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) + amt,
        G = (num >> 8 & 0x00FF) + amt,
        B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  /* =========================================================
     HIGHLIGHT / REVEAL / REORDER
     ========================================================= */
  // Hovering highlights the pin, card and that day's lines (the list no longer scrolls on hover)
  function highlightSinglePin(id, isHighlight) {
    const item = rawData.find(d => d.id === id);
    if (!item) return;
    const pin = $(`pin-wrapper-${id}`);
    const marker = markers.find(m => m.id === id);
    if (pin && marker) {
      pin.style.transform = isHighlight ? 'scale(1.5)' : 'scale(1)';
      pin.style.zIndex = isHighlight ? '9999' : '1';
      marker.setZIndexOffset(isHighlight ? 10000 : fannedClusters[marker.clusterKey] ? 5000 : 0);
    }
    const card = $(`card-${id}`);
    if (card) card.classList.toggle('highlighted', isHighlight);
    polylineSegments.forEach(p => {
      if (p.day === item.day) {
        p.layer.setStyle({ weight: isHighlight ? 7 : 4, opacity: isHighlight ? 1.0 : 0.9 });
        if (p.glow) p.glow.setStyle({ weight: isHighlight ? 13 : 9, opacity: isHighlight ? 0.55 : 0.4 });
      }
    });
  }

  function revealDay(day) {
    const dg = dayToGroup[day];
    if (dg && collapsedDayGroups.has(dg)) toggleDayGroupCollapse(dg, true);
    if (collapsedDays.has(day)) toggleDayCollapse(day, true);
  }

  // Pin click: open its day if collapsed. Pin double-click: also scroll the list to its card.
  let lastPinTap = { id: null, at: 0, x: 0, y: 0 };
  // Double tap (or double-click) a pin: the list goes to its card. The second tap is caught by where it lands,
  // because the pin's popup may already be sliding the map (the tap would otherwise hit another pin or the map).
  function initPinDoubleTap() {
    document.addEventListener('pointerdown', e => {
      if (lastPinTap.id === null || Date.now() - lastPinTap.at > 420) return;
      const mapEl = $('map');
      if (!mapEl || !mapEl.contains(e.target) || e.target.closest('.leaflet-popup')) return;
      if (Math.hypot(e.clientX - lastPinTap.x, e.clientY - lastPinTap.y) > 44) return;
      const id = lastPinTap.id;
      lastPinTap = { id: null, at: 0, x: 0, y: 0 };
      e.stopPropagation(); if (e.cancelable) e.preventDefault();
      swallowClickOnly();
      if (map.doubleClickZoom) { map.doubleClickZoom.disable(); setTimeout(() => map.doubleClickZoom.enable(), 500); }
      revealStop(id, true);
      // Open (again) once the list sheet has settled, so the popup fits in the smaller map
      setTimeout(() => { const m = markers.find(mm => mm.id === id); if (m) { if (m.isPopupOpen()) m.closePopup(); m.openPopup(); } }, 380);
    }, true);
  }
  function revealStop(id, scroll) {
    const item = rawData.find(d => d.id === id);
    if (!item) return;
    if (scroll) {
      if (todayMode) exitToday();
      // The card may be hidden by a day chip or a filter: show its day
      if (activeDay !== 'all' && activeDay !== item.day) setDayChip(item.day);
      else if (!$(`card-${id}`) && typeof resetFilters === 'function') resetFilters();
    }
    revealDay(item.day);
    const card = $(`card-${id}`);
    if (!card) return;
    if (scroll) {
      // Half-open sheet on phones held upright, so the pin stays in view above the card
      const wait = isPortraitPhone() && sheetState !== 'mid' && sheetState !== 'max' ? (setSheet('mid'), 340) : 0;
      setTimeout(() => {
        const c = $(`card-${id}`);
        if (!c) return;
        c.scrollIntoView({ behavior: 'smooth', block: 'center' });
        c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
        setTimeout(() => c.classList.remove('flash'), 1900);
      }, wait);
    }
  }

  // Drag and drop card reordering (also joins/leaves groups depending on where the card lands)
  function reorderAllStops() {
    const updatedData = [];
    const seen = new Set();
    document.querySelectorAll('.day-section').forEach(daySec => {
      const container = daySec.querySelector('.day-card-container');
      if (!container) return;
      const targetDay = parseInt(container.getAttribute('data-day'));
      container.querySelectorAll('.activity-card').forEach((card, index) => {
        const id = parseInt(card.getAttribute('data-id'));
        const stopItem = rawData.find(d => d.id === id);
        if (!stopItem) return;
        stopItem.day = targetDay;
        stopItem.order = index + 1;
        const box = card.closest('.group-cards-container');
        if (box && GROUPS[box.dataset.group]) {
          if (stopToGroup[id] !== box.dataset.group) stopItem.customColour = null;
          stopToGroup[id] = box.dataset.group;
        } else {
          delete stopToGroup[id];
        }
        updatedData.push(stopItem);
        seen.add(id);
      });
    });
    rawData.forEach(d => { if (!seen.has(d.id)) updatedData.push(d); }); // keep stops hidden by filters
    rawData = updatedData;
    pruneEmptyGroups();
    populateFilters();
    renderItinerary();
  }

  function handleCardClick(e, id) {
    if (Date.now() < ignoreCardTapUntil) return; // the tap that ended a press-and-hold
    if (selectMode || e.ctrlKey || e.metaKey || e.shiftKey) {
      if (e.button === 2) return;
      toggleCardSelected(id);
      e.stopPropagation();
    } else if (selectedStopIds.size > 0 && !selectedStopIds.has(id)) {
      clearSelection();
    }
  }

  function handleCardContextMenu(e, id) {
    e.preventDefault();
    if (lastPointerTouch) return; // phones: press-and-hold is handled by drag / select
    if (!selectedStopIds.has(id)) {
      if (!selectMode) clearSelection();
      toggleCardSelected(id);
    }
    const menu = $('context-menu');
    menu.style.display = 'block';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
  }

  // Stops of a day in on-screen order (groups gathered together)
  function dayDisplayOrder(day) {
    const items = rawData.filter(s => s.day === day).sort((a, b) => a.order - b.order);
    return gatherGroups(items).flatMap(s => s.items);
  }

  function renumberDay(day, list) { list.forEach((s, i) => { s.day = day; s.order = i + 1; }); }

  function groupSelectedStops() {
    closeMenus();
    if (selectedStopIds.size < 2) { showToast(t('selectAtLeast2'), { ms: 3000 }); return; }
    const members = rawData.filter(s => selectedStopIds.has(s.id)).sort((a, b) => a.day - b.day || a.order - b.order);
    const firstDay = members[0].day;
    const gId = 'group_' + Date.now();
    GROUPS[gId] = { id: gId, name: t('groupN', { n: groupCounter++ }), colour: lightenColor(getDayColour(firstDay), 35), opacity: 0.15 };

    // Pull every member into the first member's day, right where the first one sits, so the box stays together
    const dayList = dayDisplayOrder(firstDay);
    const firstIdx = dayList.findIndex(s => s.id === members[0].id);
    const before = dayList.slice(0, firstIdx).filter(s => !selectedStopIds.has(s.id));
    const after = dayList.slice(firstIdx).filter(s => !selectedStopIds.has(s.id));
    members.forEach(m => { stopToGroup[m.id] = gId; m.customColour = null; });
    renumberDay(firstDay, [...before, ...members, ...after]);
    new Set(members.map(m => m.day)).forEach(d => { if (d !== firstDay) renumberDay(d, dayDisplayOrder(d)); });

    pruneEmptyGroups();
    selectedStopIds.clear();
    if (selectMode) exitSelectMode();
    populateFilters();
    renderItinerary();
  }

  function ungroupSelectedStops() {
    closeMenus();
    selectedStopIds.forEach(id => delete stopToGroup[id]);
    pruneEmptyGroups();
    selectedStopIds.clear();
    if (selectMode) exitSelectMode();
    renderItinerary();
  }

  // Take one card out of its group; it lands just below the box
  function leaveGroup(id, e) {
    if (e) e.stopPropagation();
    const item = rawData.find(s => s.id === id);
    const gId = stopToGroup[id];
    if (!item || !gId) return;
    const list = dayDisplayOrder(item.day).filter(s => s.id !== id);
    let lastIdx = -1;
    list.forEach((s, i) => { if (stopToGroup[s.id] === gId) lastIdx = i; });
    list.splice(lastIdx + 1, 0, item);
    delete stopToGroup[id];
    renumberDay(item.day, list);
    pruneEmptyGroups();
    renderItinerary();
  }

  function ungroupGroup(gId) {
    Object.keys(stopToGroup).forEach(id => { if (stopToGroup[id] === gId) delete stopToGroup[id]; });
    delete GROUPS[gId];
    renderItinerary();
  }
