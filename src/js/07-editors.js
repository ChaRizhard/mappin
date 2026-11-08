  /* =========================================================
     SINGLE-ITEM MODALS (day, group, day group, stop) with Preview
     ========================================================= */
  function dateFieldHtml(id, iso, placeholderIso) {
    const show = iso || placeholderIso || '';
    return `<button type="button" class="date-field ${iso ? '' : 'empty'}" id="${id}" data-value="${iso || ''}" onclick="openDateField(this)">
        <i class="fa-regular fa-calendar cal-icon"></i><span>${show ? escapeHtml(formatDateShort(show)) : escapeHtml(t('addDate'))}</span></button>`;
  }

  function openDateField(btn) {
    openDatePopover(btn, btn.querySelector('.cal-icon') || btn, btn.dataset.value, v => setDateField(btn, v));
  }

  function setDateField(btn, v) {
    btn.dataset.value = v || '';
    btn.classList.toggle('empty', !v);
    btn.querySelector('span').textContent = v ? formatDateShort(v) : t('addDate');
    if (typeof scheduleLiveEdit === 'function') scheduleLiveEdit();
  }

  function openSingleModal(title, bodyHtml) {
    singlePreviewBackup = null;
    $('single-item-modal').classList.remove('previewing');
    $('single-modal-header-title').innerText = title;
    $('single-modal-body').innerHTML = bodyHtml;
    $('single-item-modal').style.display = 'flex';
  }

  function titleRowHtml(titleValue, dateHtml) {
    return `
      <div class="title-date-row">
        <div class="grow">
          <label class="field-label">${escapeHtml(t('titleLabel'))}</label>
          <input type="text" id="single-title-input" class="edit-form-input big-title-input" value="${escapeHtml(titleValue)}">
        </div>
        ${dateHtml ? `<div class="small"><label class="field-label">${escapeHtml(t('dateLabel'))}</label>${dateHtml}</div>` : ''}
      </div>`;
  }

  function opacityRowHtml(op) {
    return `
      <div style="margin-bottom: 14px;">
        <label class="field-label">${escapeHtml(t('opacityLabel'))} <span class="opacity-value" id="single-opacity-value">${Math.round(op * 100)}%</span></label>
        <input type="range" min="0" max="1" step="0.05" value="${op}" style="width:100%;" oninput="previewGroupOpacity(this.value)">
      </div>`;
  }

  function openSingleDayModal(dayNum) {
    if (daySelectMode) { toggleDaySelected(dayNum); return; }
    singleEditTarget = { type: 'day', id: dayNum };
    const currentColor = getDayColour(dayNum);
    singleStagedData = { colour: currentColor };
    openSingleModal(getDayTitle(dayNum), `
      ${titleRowHtml(getDayTitle(dayNum), dateFieldHtml('single-date-field', DAY_DATES[dayNum] || ''))}
      <label class="field-label">${escapeHtml(t('coloursLabel'))}</label>
      ${buildColourPickerHtml('single', currentColor)}`);
  }

  function openSingleGroupModal(groupId) {
    const g = GROUPS[groupId];
    if (!g) return;
    singleEditTarget = { type: 'group', id: groupId };
    singleStagedData = { colour: g.colour, opacity: g.opacity !== undefined ? g.opacity : 0.15 };
    openSingleModal(g.name, `
      ${titleRowHtml(g.name, '')}
      ${opacityRowHtml(singleStagedData.opacity)}
      <label class="field-label">${escapeHtml(t('coloursLabel'))}</label>
      ${buildColourPickerHtml('single', g.colour)}`);
  }

  function openSingleDayGroupModal(id) {
    const g = DAY_GROUPS[id];
    if (!g) return;
    singleEditTarget = { type: 'daygroup', id };
    singleStagedData = { colour: g.colour, opacity: g.opacity !== undefined ? g.opacity : 0.08 };
    openSingleModal(g.name, `
      ${titleRowHtml(g.name, '')}
      ${opacityRowHtml(singleStagedData.opacity)}
      <label class="field-label">${escapeHtml(t('coloursLabel'))}</label>
      ${buildColourPickerHtml('single', g.colour)}`);
  }

  function openSingleStopModal(stopId) {
    const item = rawData.find(d => d.id === stopId);
    if (!item) return;
    singleEditTarget = { type: 'stop', id: stopId };
    const currentColor = getStopColour(item);
    singleStagedData = { colour: currentColor };
    const timeVal = /^\d{1,2}:\d{2}$/.test(item.time || '') ? item.time.padStart(5, '0') : '';
    openSingleModal(item.cleanTitle || item.title, `
      ${titleRowHtml(item.title, dateFieldHtml('single-date-field', item.date || '', DAY_DATES[item.day] || ''))}
      <div class="field-grid">
        <div><label class="field-label">${escapeHtml(t('timeLabel'))}</label>
          <input type="time" id="single-time-input" class="edit-form-input" value="${timeVal}"></div>
        <div><label class="field-label">${escapeHtml(t('stayLabel'))}</label>
          <input type="number" min="0" step="5" inputmode="numeric" id="single-stay-input" class="edit-form-input" value="${typeof item.stay === 'number' ? item.stay : ''}" placeholder="${stayMinutes(item)}"></div>
        <div><label class="field-label cost-label">${escapeHtml(t('costLabel'))} <select id="single-cur-input" class="cur-select" aria-label="${escapeHtml(t('currency'))}">${currencyOptions(itemCurrency(item))}</select></label>
          <input type="number" min="0" step="any" inputmode="decimal" id="single-cost-input" class="edit-form-input" value="${typeof item.cost === 'number' ? item.cost : ''}" placeholder="0"></div>
      </div>
      <div class="field-grid two">
        <div><label class="field-label">${escapeHtml(t('spentLabel'))}</label>
          <input type="number" min="0" step="any" inputmode="decimal" id="single-spent-input" class="edit-form-input" value="${typeof item.spent === 'number' ? item.spent : ''}" placeholder="${escapeHtml(t('spentPh'))}"></div>
        <div><label class="field-label">${escapeHtml(t('bookingRef'))}</label>
          <input type="text" id="single-bref-input" class="edit-form-input" autocomplete="off" value="${escapeHtml(item.bookingRef || '')}" placeholder="${escapeHtml(t('bookingRefPh'))}"></div>
      </div>
      <label class="field-label">${escapeHtml(t('bookingLink'))}</label>
      <input type="url" id="single-burl-input" class="edit-form-input booking-url-input" autocomplete="off" inputmode="url" value="${escapeHtml(item.bookingUrl || '')}" placeholder="https://…">
      <label class="check-row"><input type="checkbox" id="single-fixed-input" ${item.fixedTime ? 'checked' : ''}> ${escapeHtml(t('fixedTime'))} <small>${escapeHtml(t('fixedTimeHint'))}</small></label>
      <label class="field-label">${escapeHtml(t('coloursLabel'))}</label>
      ${buildColourPickerHtml('single', currentColor)}`);
  }

  function clearGroupMemberColours(gId) {
    Object.keys(stopToGroup).forEach(sid => {
      if (stopToGroup[sid] === gId) {
        const stop = rawData.find(d => d.id === parseInt(sid));
        if (stop) stop.customColour = null;
      }
    });
  }

  function applyStagedSingle() {
    const T = singleEditTarget;
    if (!T) return;
    const titleInput = $('single-title-input');
    const titleVal = titleInput ? titleInput.value.trim() : '';
    const dateBtn = $('single-date-field');
    const dateVal = dateBtn ? dateBtn.dataset.value : '';
    const S = singleStagedData;

    if (T.type === 'day') {
      if (S.colourChanged) DAY_COLOR_MAP[T.id] = S.colour;
      if (titleVal && titleVal !== defaultDayTitle(T.id)) DAY_TITLES[T.id] = titleVal; else delete DAY_TITLES[T.id];
      if (dateVal) DAY_DATES[T.id] = dateVal; else delete DAY_DATES[T.id];
    } else if (T.type === 'group' && GROUPS[T.id]) {
      if (S.colourChanged) { GROUPS[T.id].colour = S.colour; clearGroupMemberColours(T.id); }
      GROUPS[T.id].opacity = S.opacity;
      if (titleVal) GROUPS[T.id].name = titleVal;
    } else if (T.type === 'daygroup' && DAY_GROUPS[T.id]) {
      if (S.colourChanged) {
        DAY_GROUPS[T.id].colour = S.colour;
        Object.keys(dayToGroup).forEach(d => { if (dayToGroup[d] === T.id) delete DAY_COLOR_MAP[d]; });
      }
      DAY_GROUPS[T.id].opacity = S.opacity;
      if (titleVal) DAY_GROUPS[T.id].name = titleVal;
    } else if (T.type === 'stop') {
      const item = rawData.find(d => d.id === T.id);
      if (item) {
        if (titleVal) { item.title = titleVal; item.cleanTitle = stripTitle(titleVal); }
        item.date = dateVal && dateVal !== DAY_DATES[item.day] ? dateVal : '';
        if (S.colourChanged) item.customColour = S.colour;
        const tIn = $('single-time-input'), sIn = $('single-stay-input'), cIn = $('single-cost-input'), fIn = $('single-fixed-input');
        if (tIn) { if (tIn.value) item.time = tIn.value; else if (/^\d{1,2}:\d{2}$/.test(item.time || '')) item.time = ''; }
        if (sIn) { const v = parseInt(sIn.value); item.stay = isNaN(v) ? null : Math.max(0, v); }
        if (cIn) { const v = parseFloat(cIn.value); item.cost = isNaN(v) ? null : v; }
        const curIn = $('single-cur-input');
        if (curIn) item.currency = curIn.value && curIn.value !== tripCurrency() ? curIn.value : undefined;
        if (fIn) item.fixedTime = fIn.checked;
        const spIn = $('single-spent-input'), brIn = $('single-bref-input'), buIn = $('single-burl-input');
        if (spIn) { const v = parseFloat(spIn.value); item.spent = isNaN(v) ? null : v; }
        if (brIn) item.bookingRef = brIn.value.trim();
        if (buIn) { const u = buIn.value.trim(); item.bookingUrl = u && !/^https?:\/\//i.test(u) ? 'https://' + u : u; }
      }
    }
  }

  // Preview: apply the edits for real (map + list), keep the modal open, and remember how to undo them
  // Changes show live while the window is open; Save keeps them, Cancel puts everything back
  function previewSingleItemModal(silent) {
    if (!singleEditTarget) return;
    if (!singlePreviewBackup) singlePreviewBackup = cloneState();
    else applyState(JSON.parse(JSON.stringify(singlePreviewBackup)));
    histSuspend = true;
    applyStagedSingle();
    populateFilters();
    renderItinerary();
    histSuspend = false;
    if (silent) return;
    $('single-item-modal').classList.add('previewing');
    showToast(t('previewing'), { ms: 3000 });
  }

  function saveSingleItemModal() {
    if (!singleEditTarget) return;
    const wasDay = singleEditTarget.type === 'day';
    if (singlePreviewBackup) applyState(singlePreviewBackup);
    singlePreviewBackup = null;
    applyStagedSingle();
    finishSingleModal();
    populateFilters();
    renderItinerary();
    if (wasDay) maybeOfferSortDays();
  }

  function closeSingleItemModal() {
    const hadPreview = !!singlePreviewBackup;
    if (hadPreview) { applyState(singlePreviewBackup); singlePreviewBackup = null; }
    finishSingleModal();
    populateFilters();
    renderItinerary(); // also reverts any live opacity preview
  }

  function finishSingleModal() {
    $('single-item-modal').style.display = 'none';
    $('single-item-modal').classList.remove('previewing');
    singleEditTarget = null;
    closeDatePopover();
  }

  /* =========================================================
     MASTER EDITOR (paint brush): titles, dates, colours, drag to reorder
     ========================================================= */
  let masterSortables = [];

  function openMasterColorModal() {
    const days = getAllDays();
    const list = $('color-picker-list');
    stagedDayColors = {}; stagedGroupColors = {}; stagedDgColors = {}; stagedChanged = new Set();
    masterPreviewBackup = null;
    $('color-modal').classList.remove('previewing');

    if (days.length === 0 && Object.keys(GROUPS).length === 0) {
      list.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center; padding:20px;">${escapeHtml(t('importFirst'))}</p>`;
      $('color-modal').style.display = 'flex';
      return;
    }

    let html = `
      <div class="master-trip-row">
        <i class="fa-regular fa-calendar"></i> ${escapeHtml(t('tripStart'))}
        ${dateFieldHtml('master-start-date', DAY_DATES[days[0]] || '')}
        <button class="btn btn-secondary" onclick="fillDatesFromStart()">${escapeHtml(t('fillAll'))}</button>
      </div>
      <div class="master-section-title"><i class="fa-regular fa-calendar-days"></i> ${escapeHtml(t('sectionDays'))} <span style="font-weight:500; text-transform:none;">· ${escapeHtml(t('dragToReorder'))}</span></div>
      <div class="master-list" id="master-days">`;
    days.forEach(d => {
      const c = getDayColour(d);
      stagedDayColors[d] = c;
      html += `
        <div class="cfg-row" data-day="${d}">
          <div class="cfg-head">
            <i class="fa-solid fa-grip-vertical drag-handle" title="${escapeHtml(t('dragToReorder'))}"></i>
            <input type="text" class="edit-form-input big-title-input cfg-title" value="${escapeHtml(getDayTitle(d))}" placeholder="${escapeHtml(defaultDayTitle(d))}">
            ${dateFieldHtml(`master-date-${d}`, DAY_DATES[d] || '')}
          </div>
          ${buildColourPickerHtml(`day-${d}`, c)}
        </div>`;
    });
    html += `</div>`;

    const dgs = Object.values(DAY_GROUPS);
    if (dgs.length) {
      html += `<div class="master-section-title"><i class="fa-solid fa-layer-group"></i> ${escapeHtml(t('sectionDayGroups'))}</div><div class="master-list" id="master-dgs">`;
      dgs.forEach(g => {
        stagedDgColors[g.id] = g.colour;
        html += `
          <div class="cfg-row daygroup-row" data-dg="${g.id}">
            <div class="cfg-head">
              <i class="fa-solid fa-grip-vertical drag-handle"></i>
              <input type="text" class="edit-form-input big-title-input cfg-title" value="${escapeHtml(g.name)}">
            </div>
            ${buildColourPickerHtml(`dg-${g.id}`, g.colour)}
          </div>`;
      });
      html += `</div>`;
    }

    const gs = Object.values(GROUPS);
    if (gs.length) {
      html += `<div class="master-section-title"><i class="fa-solid fa-object-group"></i> ${escapeHtml(t('sectionGroups'))}</div><div class="master-list" id="master-groups">`;
      gs.forEach(g => {
        stagedGroupColors[g.id] = g.colour;
        html += `
          <div class="cfg-row group-row" data-g="${g.id}">
            <div class="cfg-head">
              <i class="fa-solid fa-grip-vertical drag-handle"></i>
              <input type="text" class="edit-form-input big-title-input cfg-title" value="${escapeHtml(g.name)}">
            </div>
            ${buildColourPickerHtml(`group-${g.id}`, g.colour)}
          </div>`;
      });
      html += `</div>`;
    }

    list.innerHTML = html;
    masterSortables.forEach(s => { try { s.destroy(); } catch (e) {} });
    masterSortables = ['master-days', 'master-dgs', 'master-groups'].filter(id => $(id)).map(id =>
      new Sortable($(id), { handle: '.drag-handle', animation: 150, ghostClass: 'sortable-ghost', delay: 150, delayOnTouchOnly: true }));
    $('color-modal').style.display = 'flex';
  }

  // Day 1 = start date, Day 2 = next day... in the order shown in the editor
  function fillDatesFromStart() {
    const start = $('master-start-date').dataset.value;
    if (!start) { alert(t('pickStart')); return; }
    document.querySelectorAll('#master-days .cfg-row').forEach((row, i) => {
      setDateField(row.querySelector('.date-field'), addDaysIso(start, i));
    });
  }

  function applyStagedMaster() {
    // 1. Days: titles, dates, colours, then order
    const dayRows = [...document.querySelectorAll('#master-days .cfg-row')];
    dayRows.forEach(r => {
      const d = parseInt(r.dataset.day);
      const tv = r.querySelector('.cfg-title').value.trim();
      if (tv && tv !== defaultDayTitle(d)) DAY_TITLES[d] = tv; else delete DAY_TITLES[d];
      const dv = r.querySelector('.date-field').dataset.value;
      if (dv) DAY_DATES[d] = dv; else delete DAY_DATES[d];
      if (stagedChanged.has(`day-${d}`)) DAY_COLOR_MAP[d] = stagedDayColors[d];
    });
    const order = dayRows.map(r => parseInt(r.dataset.day));
    if (order.length && order.join() !== getAllDays().join()) reorderDays(order);

    // 2. Day groups: names, colours, order of their blocks
    const dgRows = [...document.querySelectorAll('#master-dgs .cfg-row')];
    dgRows.forEach(r => {
      const g = DAY_GROUPS[r.dataset.dg];
      if (!g) return;
      const tv = r.querySelector('.cfg-title').value.trim();
      if (tv) g.name = tv;
      if (stagedChanged.has(`dg-${g.id}`)) {
        g.colour = stagedDgColors[g.id];
        Object.keys(dayToGroup).forEach(d => { if (dayToGroup[d] === g.id) delete DAY_COLOR_MAP[d]; });
      }
    });
    if (dgRows.length > 1) {
      const days = getAllDays();
      const newDays = reorderSegments(days, d => dayToGroup[d] || null, dgRows.map(r => r.dataset.dg));
      if (newDays.join() !== days.join()) reorderDays(newDays);
    }

    // 3. Card groups: names, colours, order of their blocks within a day
    const gRows = [...document.querySelectorAll('#master-groups .cfg-row')];
    gRows.forEach(r => {
      const g = GROUPS[r.dataset.g];
      if (!g) return;
      const tv = r.querySelector('.cfg-title').value.trim();
      if (tv) g.name = tv;
      if (stagedChanged.has(`group-${g.id}`)) { g.colour = stagedGroupColors[g.id]; clearGroupMemberColours(g.id); }
    });
    if (gRows.length > 1) {
      const gOrder = gRows.map(r => r.dataset.g);
      getAllDays().forEach(d => {
        const list = reorderSegments(dayDisplayOrder(d), s => stopToGroup[s.id] || null, gOrder);
        renumberDay(d, list);
      });
    }
  }

  function previewMasterChanges(silent) {
    if (!masterPreviewBackup) masterPreviewBackup = cloneState();
    else applyState(JSON.parse(JSON.stringify(masterPreviewBackup)));
    histSuspend = true;
    applyStagedMaster();
    populateFilters();
    renderItinerary();
    histSuspend = false;
    if (silent) return;
    $('color-modal').classList.add('previewing');
    showToast(t('previewing'), { ms: 3000 });
  }

  function saveMasterColorModalChanges() {
    if (masterPreviewBackup) applyState(masterPreviewBackup);
    masterPreviewBackup = null;
    applyStagedMaster();
    finishMasterModal();
    populateFilters();
    renderItinerary();
  }

  function closeMasterColorModal() {
    if (masterPreviewBackup) { applyState(masterPreviewBackup); masterPreviewBackup = null; populateFilters(); renderItinerary(); }
    finishMasterModal();
  }

  function finishMasterModal() {
    $('color-modal').style.display = 'none';
    $('color-modal').classList.remove('previewing');
    closeDatePopover();
  }

  /* =========================================================
     INLINE EDITING (single click edits; double click flies to the pin)
     ========================================================= */
  let inlineEditTimer = null;
  function queueInlineEdit(kind, id, e) {
    e.stopPropagation();
    if (selectMode) return;
    const target = e.currentTarget || e.target;
    clearTimeout(inlineEditTimer);
    if (e.detail > 1) return;
    // Touch screens: edit straight away. iPhone only opens the keyboard when the box is focused during the tap itself
    // (double tap on the rest of the card still flies to the pin).
    if (window.matchMedia('(pointer: coarse)').matches) {
      if (kind === 'title') inlineEditTitle(id, e); else inlineEditDesc(id, e);
      return;
    }
    inlineEditTimer = setTimeout(() => {
      if (!target.isConnected) return;
      const fakeEvent = { stopPropagation() {}, currentTarget: target, target };
      if (kind === 'title') inlineEditTitle(id, fakeEvent); else inlineEditDesc(id, fakeEvent);
    }, 260);
  }

  let flyToken = 0; // a newer map move cancels a stop's popup that is still waiting to open
  function cancelPendingFly() { flyToken++; }
  function flyToStop(id) {
    const item = rawData.find(d => d.id === id);
    if (!item) return;
    if (!hasCoords(item)) { if (item.notFound) startRelocate(id); return; }
    map.stop(); map.closePopup();
    const token = ++flyToken;
    let opened = false;
    const openIt = () => {
      if (opened || token !== flyToken) return; opened = true; // something else moved the map since (e.g. All days)
      map.off('moveend', openIt);
      const m = markers.find(mk => mk.id === id);
      if (m) {
        m.openPopup();
        const pin = $(`pin-wrapper-${id}`);
        if (pin) { pin.classList.remove('pulse'); void pin.offsetWidth; pin.classList.add('pulse'); setTimeout(() => pin.classList.remove('pulse'), 1900); }
      }
    };
    map.flyTo([item.lat, item.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
    map.once('moveend', openIt);
    setTimeout(openIt, 1100);
  }

  function inlineEditTitle(id, e) {
    e.stopPropagation();
    if (selectMode) return;
    const item = rawData.find(d => d.id === id);
    if (!item) return;
    const target = e.currentTarget || e.target;
    if (target.tagName === 'INPUT') return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-form-input';
    input.value = item.title;
    input.style.marginBottom = '0';
    input.style.fontSize = '13px';
    input.style.fontWeight = '600';

    let saved = false;
    const finish = () => {
      if (saved) return;
      saved = true;
      const newVal = input.value.trim();
      if (newVal) { item.title = newVal; item.cleanTitle = stripTitle(newVal); }
      const newSpan = document.createElement('span');
      newSpan.className = 'card-title-editable';
      newSpan.innerText = item.title;
      newSpan.onclick = (ev) => queueInlineEdit('title', id, ev);
      input.replaceWith(newSpan);
      scheduleAutosave();
    };
    input.onblur = finish;
    input.onkeydown = (ev) => { if (ev.key === 'Enter') finish(); };
    input.onmousedown = (ev) => ev.stopPropagation();
    target.replaceWith(input);
    input.focus();
    input.select();
  }

  function inlineEditDesc(id, e) {
    e.stopPropagation();
    if (selectMode) return;
    const item = rawData.find(d => d.id === id);
    if (!item) return;
    const target = e.currentTarget || e.target;
    if (target.tagName === 'TEXTAREA') return;

    const textarea = document.createElement('textarea');
    textarea.className = 'edit-form-input';
    textarea.value = item.desc || item.address || '';
    textarea.style.height = '60px';
    textarea.style.marginBottom = '0';
    textarea.style.fontSize = '12px';

    let saved = false;
    const finish = () => {
      if (saved) return;
      saved = true;
      item.desc = textarea.value.trim();
      const newDiv = document.createElement('div');
      newDiv.className = 'card-desc-editable';
      newDiv.innerText = item.desc || t('clickNotes');
      newDiv.onclick = (ev) => queueInlineEdit('desc', id, ev);
      textarea.replaceWith(newDiv);
      scheduleAutosave();
    };
    textarea.onblur = finish;
    textarea.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(); } };
    textarea.onmousedown = (ev) => ev.stopPropagation();
    target.replaceWith(textarea);
    textarea.focus();
  }

  /* =========================================================
     DATES + CALENDAR POP-OVER
     ========================================================= */
  function isoFromDate(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  function isoToDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function toIsoDate(str) {
    const tm = parseSortableDate(str);
    return isNaN(tm) ? '' : isoFromDate(new Date(tm));
  }
  function addDaysIso(iso, n) {
    const d = isoToDate(iso);
    if (!d) return '';
    d.setDate(d.getDate() + n);
    return isoFromDate(d);
  }
  function formatDateShort(iso) {
    const d = isoToDate(iso);
    return d ? d.toLocaleDateString(LANG, { weekday: 'short', day: 'numeric', month: 'short' }) : (iso || '');
  }
  function displayDate(str) { return /^\d{4}-\d{2}-\d{2}$/.test(str) ? formatDateShort(str) : str; }
  function effectiveDate(item) { return item.date || DAY_DATES[item.day] || ''; }

  function editCardDate(id, e) {
    e.stopPropagation();
    if (selectMode) return;
    const item = rawData.find(d => d.id === id);
    const chip = e.currentTarget;
    if (!item || !chip) return;
    openDatePopover(chip, chip.querySelector('.cal-icon') || chip, toIsoDate(effectiveDate(item)), v => {
      item.date = v && v !== DAY_DATES[item.day] ? v : '';
      // A date that belongs to another day moves the stop to that day
      const target = v && getAllDays().find(d => d !== item.day && DAY_DATES[d] === v);
      if (target) { moveStopToDay(item, target); populateFilters(); showToast(t('movedToDay', { name: getDayTitle(target) }), { ms: 4000, actionLabel: t('undoBtn'), onAction: undo }); }
      renderItinerary();
    });
  }

  let dpState = null; // { opener, anchor, sel, view, onPick }

  function openDatePopover(opener, anchor, iso, onPick) {
    const sel = isoToDate(iso);
    const base = sel || new Date();
    dpState = { opener, anchor, sel: iso || '', view: new Date(base.getFullYear(), base.getMonth(), 1), onPick };
    renderDatePopover();
    const pop = $('date-popover');
    pop.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = Math.min(Math.max(8, r.left - 10), window.innerWidth - w - 8);
    let top = r.bottom + 6, originY = '0px';
    if (top + h > window.innerHeight - 8) { top = r.top - h - 6; originY = `${h}px`; }
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;
    pop.style.setProperty('--origin-x', `${r.left + r.width / 2 - left}px`);
    pop.style.setProperty('--origin-y', originY);
    pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
  }

  function renderDatePopover() {
    if (!dpState) return;
    const v = dpState.view;
    if (dpState.mode === 'months') {
      // Month and year picker (tap the month name to get here)
      const selD = isoToDate(dpState.sel);
      const months = [];
      for (let m = 0; m < 12; m++) {
        const isSel = selD && selD.getFullYear() === v.getFullYear() && selD.getMonth() === m;
        const isNow = new Date().getFullYear() === v.getFullYear() && new Date().getMonth() === m;
        months.push(`<button class="dp-month ${isSel ? 'sel' : ''} ${isNow ? 'today' : ''}" onclick="dpSetMonth(${m})">${escapeHtml(new Date(2024, m, 1).toLocaleDateString(LANG, { month: 'short' }))}</button>`);
      }
      $('date-popover').innerHTML = `
        <div class="dp-head">
          <button class="dp-nav" onclick="dpNavYear(-1)" aria-label="${escapeHtml(t('prevYear'))}"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="dp-title" onclick="dpToggleMonths()">${v.getFullYear()} <i class="fa-solid fa-chevron-up"></i></button>
          <button class="dp-nav" onclick="dpNavYear(1)" aria-label="${escapeHtml(t('nextYear'))}"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <div class="dp-months">${months.join('')}</div>`;
      return;
    }
    const todayIso = isoFromDate(new Date());
    const first = new Date(v.getFullYear(), v.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first weeks
    const start = new Date(first); start.setDate(1 - offset);
    const wd = [];
    for (let i = 0; i < 7; i++) { const d = new Date(2024, 0, 1 + i); wd.push(d.toLocaleDateString(LANG, { weekday: 'narrow' })); }
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = isoFromDate(d);
      cells += `<button class="dp-day ${d.getMonth() !== v.getMonth() ? 'other' : ''} ${iso === todayIso ? 'today' : ''} ${iso === dpState.sel ? 'sel' : ''}" onclick="dpPick('${iso}')">${d.getDate()}</button>`;
    }
    $('date-popover').innerHTML = `
      <div class="dp-head">
        <button class="dp-nav" onclick="dpNav(-1)"><i class="fa-solid fa-chevron-left"></i></button>
        <button class="dp-title" onclick="dpToggleMonths()">${escapeHtml(v.toLocaleDateString(LANG, { month: 'long', year: 'numeric' }))} <i class="fa-solid fa-chevron-down"></i></button>
        <button class="dp-nav" onclick="dpNav(1)"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div class="dp-grid">${wd.map(x => `<div class="dp-wd">${escapeHtml(x)}</div>`).join('')}${cells}</div>
      <div class="dp-foot">
        <button onclick="dpPick('${todayIso}')">${escapeHtml(t('today'))}</button>
        <button onclick="dpPick('')">${escapeHtml(t('clear'))}</button>
      </div>`;
  }

  function dpToggleMonths() { if (!dpState) return; dpState.mode = dpState.mode === 'months' ? 'days' : 'months'; renderDatePopover(); }
  function dpNavYear(n) { if (!dpState) return; dpState.view = new Date(dpState.view.getFullYear() + n, dpState.view.getMonth(), 1); renderDatePopover(); }
  function dpSetMonth(m) { if (!dpState) return; dpState.view = new Date(dpState.view.getFullYear(), m, 1); dpState.mode = 'days'; renderDatePopover(); }

  function dpNav(n) {
    if (!dpState) return;
    dpState.view = new Date(dpState.view.getFullYear(), dpState.view.getMonth() + n, 1);
    renderDatePopover();
  }

  function dpPick(iso) {
    const cb = dpState && dpState.onPick;
    closeDatePopover();
    if (cb) cb(iso);
  }

  function closeDatePopover() {
    if (!dpState) return;
    dpState = null;
    const pop = $('date-popover');
    pop.classList.remove('show');
    pop.style.display = 'none';
  }
