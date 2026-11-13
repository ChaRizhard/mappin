  /* =========================================================
     SAVED MAPS / EXPORT / RESET
     ========================================================= */
  function openSaveModal() {
    if (rawData.length === 0 && EXTRA_DAYS.size === 0) { alert(t('nothingToSave')); return; }
    $('save-map-title-input').value = TRIP.title || `MapPin ${new Date().toLocaleDateString(LANG)}`;
    $('save-modal').style.display = 'flex';
  }

  function closeSaveModal() { $('save-modal').style.display = 'none'; }

  function readSavedMaps() {
    try { return JSON.parse(localStorage.getItem('pathnavigator_maps_db') || '{}'); } catch (e) { return {}; }
  }

  function confirmSaveMap() {
    const title = $('save-map-title-input').value.trim() || 'Untitled map';
    TRIP.title = title;
    const savedMaps = readSavedMaps();
    const id = 'map_' + Date.now();
    savedMaps[id] = Object.assign({ id, title, date: new Date().toLocaleString(LANG) }, serializeState());
    try {
      localStorage.setItem('pathnavigator_maps_db', JSON.stringify(savedMaps));
      closeSaveModal();
      showToast(t('savedOk', { t: title }));
    } catch (e) {
      alert(t('storageFull'));
    }
  }

  function openLoadModal() {
    const savedMaps = readSavedMaps();
    const container = $('saved-maps-container');
    container.innerHTML = '';
    const keys = Object.keys(savedMaps);
    if (keys.length === 0) {
      container.innerHTML = `<p style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px;">${escapeHtml(t('noSaved'))}</p>`;
    } else {
      keys.forEach(key => {
        const m = savedMaps[key];
        container.innerHTML += `
          <div class="saved-map-card">
            <div class="saved-map-info">
              <input type="checkbox" class="saved-map-checkbox" value="${m.id}">
              <div>
                <h4 onclick="renameSavedMap('${m.id}')" title="${escapeHtml(t('clickToRename'))}">${escapeHtml(m.title)} <i class="fa-solid fa-pen" style="font-size:10px; color:var(--text-muted);"></i></h4>
                <p>${escapeHtml(t('savedInfo', { n: (m.rawData || []).length, date: m.date }))}</p>
              </div>
            </div>
            <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="loadSpecificMap('${m.id}')">${escapeHtml(t('loadBtn'))}</button>
          </div>`;
      });
    }
    $('load-modal').style.display = 'flex';
  }

  function closeLoadModal() { $('load-modal').style.display = 'none'; }

  function renameSavedMap(id) {
    const savedMaps = readSavedMaps();
    if (!savedMaps[id]) return;
    const newName = prompt(t('renamePrompt'), savedMaps[id].title);
    if (newName) {
      savedMaps[id].title = newName.trim();
      localStorage.setItem('pathnavigator_maps_db', JSON.stringify(savedMaps));
      openLoadModal();
    }
  }

  function deleteSelectedSavedMaps() {
    const checkboxes = document.querySelectorAll('.saved-map-checkbox:checked');
    if (checkboxes.length === 0) { alert(t('selectMapsToDelete')); return; }
    if (confirm(t('deleteMapsConfirm', { n: checkboxes.length }))) {
      const savedMaps = readSavedMaps();
      checkboxes.forEach(cb => delete savedMaps[cb.value]);
      localStorage.setItem('pathnavigator_maps_db', JSON.stringify(savedMaps));
      openLoadModal();
    }
  }

  function loadSpecificMap(id) {
    const m = readSavedMaps()[id];
    if (!m) return;
    importGeneration++;
    geoQueue = [];
    cityAnchors = {};
    clearPreviewPin(); clearAreaResults();
    lastRemovedPin = null;
    applyState(JSON.parse(JSON.stringify(m)));
    selectedStopIds.clear();
    activeDay = 'all';
    pendingFitAll = true; userMovedMap = false;
    requeuePending();
    updateGeoStatus();
    populateFilters();
    renderItinerary();
    closeLoadModal();
  }

  function resetToBlankMap() {
    if ((rawData.length || EXTRA_DAYS.size) && !confirm(t('confirmBlank'))) return;
    importGeneration++;
    geoQueue = [];
    cityAnchors = {};
    clearPreviewPin(); clearAreaResults();
    lastRemovedPin = null;
    applyState({});
    lastSyncedSnap = null;
    updateSyncPill();
    selectedStopIds.clear();
    activeDay = 'all';
    if (selectMode) exitSelectMode();
    if (daySelectMode) exitDaySelectMode();
    updateGeoStatus();
    populateFilters();
    renderItinerary();
  }

  function exportMapCSV() {
    if (rawData.length === 0) { alert(t('noExport')); return; }
    const exportData = rawData.map(item => ({
      'Name': item.title, 'Day': `Day ${item.day}`, 'Day Title': DAY_TITLES[item.day] || '', 'Date': effectiveDate(item), 'Time': item.time,
      'Category': item.category, 'Notes': item.desc, 'Latitude': hasCoords(item) ? item.lat : '', 'Longitude': hasCoords(item) ? item.lng : '',
      'Address': item.address, 'City': item.city || '', 'Country': item.country || '', 'Google Maps link': item.link || '',
      'Group': stopToGroup[item.id] && GROUPS[stopToGroup[item.id]] ? GROUPS[stopToGroup[item.id]].name : '',
      'Cost': typeof item.cost === 'number' ? item.cost : '', 'Stay (min)': typeof item.stay === 'number' ? item.stay : '',
      'Fixed time': item.fixedTime ? 'yes' : '', 'Opening hours': item.hours || '',
      'Spent': typeof item.spent === 'number' ? item.spent : '', 'Currency': item.currency || (TRIP.currency && TRIP.currency !== CURRENCY ? TRIP.currency : ''), 'Booking ref': item.bookingRef || '', 'Booking link': item.bookingUrl || '', 'Skipped': item.skipped ? 'yes' : '', 'Done': item.done ? 'yes' : '', 'Optional': item.optional ? 'yes' : ''
    }));
    const csv = Papa.unparse(exportData);
    shareFile('MapPin_Itinerary.csv', '﻿' + csv, 'text/csv;charset=utf-8').then(r => { if (r === 'shared' && IS_NATIVE) showToast(t('fileReady'), { ms: 2000 }); }).catch(() => {});
  }

  /* =========================================================
     SHARE LINK (no server: the trip is compressed into the link itself)
     ========================================================= */
  function b64urlEncode(bytes) {
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }

  function publicBase() {
    if (IS_NATIVE || location.protocol === 'capacitor:') {
      const u = cloudConfig().publicUrl;
      return u ? u.replace(/#.*$/, '') : null;
    }
    return location.origin === 'null' || location.protocol === 'file:' ? location.href.split('#')[0] : location.origin + location.pathname;
  }

  async function shareTripLink(viewOnly) {
    if (!rawData.length) { alert(t('nothingToSave')); return; }
    const v = viewOnly ? '&v=1' : '';
    const base = publicBase();
    if (!base) { showToast(t('needPublicUrl'), { ms: 6000 }); exportMapCSV(); return; }
    let url = null, short = false;
    if (cloudReady() && CLOUD.session && navigator.onLine) {
      try { url = `${base}#s=${encodeURIComponent(await cloudCreateShare(shareState()))}${v}`; short = true; }
      catch (e) { showToast(t('cloudError', { msg: e.message }), { ms: 5000 }); }
    }
    if (!url) {
      if (typeof CompressionStream === 'undefined') { alert(t('shareUnsupported')); return; }
      const json = new TextEncoder().encode(JSON.stringify(shareState()));
      const compressed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      url = `${base}#trip=${b64urlEncode(compressed)}${v}`;
      if (url.length > 60000) { alert(t('shareTooLarge')); return; }
    }
    try {
      const how = await shareUrl(url);
      if (how === 'copied') showToast(short ? t('shortLinkCopied') : t('shareCopied'), { ms: 6000 });
    } catch (e) {
      prompt(t('shareLink'), url);
    }
  }

  async function openSharedTripFromUrl() {
    const shortId = (location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/) || [])[1];
    const m = location.hash.match(/trip=([A-Za-z0-9_-]+)/);
    if (!shortId && !m) return;
    const viewOnly = /[#&]v=1(&|$)/.test(location.hash);
    try {
      let s;
      if (shortId) {
        if (!cloudReady()) return;
        s = await cloudGetShare(shortId);
      } else {
        if (typeof DecompressionStream === 'undefined') return;
        const bytes = b64urlDecode(m[1]);
        s = JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
      }
      history.replaceState(null, '', location.href.split('#')[0]);
      if (!s) return;
      if (viewOnly) enterViewOnly();
      else if (rawData.length && !confirm(t('sharedTripOpen'))) return;
      openTripState(s, { cloudId: null, title: (s.trip && s.trip.title) || '' });
    } catch (e) { /* not a valid link */ }
  }

  /* =========================================================
     PRINT / PDF: a clean, printable itinerary
     ========================================================= */
  function printItinerary() {
    if (!rawData.length) { alert(t('noExport')); return; }
    if (IS_NATIVE) { shareItineraryText(); return; } // printing isn't available inside the phone app
    const days = getAllDays();
    let html = `<h1>${escapeHtml(TRIP.title || 'MapPin')}</h1><div class="pv-sub">${escapeHtml(t('printSubtitle', { n: rawData.length, d: days.length }))}${tripCost() ? ' · ' + escapeHtml(t('tripTotal')) + ' ' + escapeHtml(fmtMoney(tripCost())) : ''}</div>`;
    let lastDg = null;
    days.forEach(d => {
      const dg = dayToGroup[d] && DAY_GROUPS[dayToGroup[d]];
      if (dg && dg.id !== lastDg) html += `<div class="pv-group">${escapeHtml(dg.name)}</div>`;
      lastDg = dg ? dg.id : null;
      html += `<h2>${escapeHtml(getDayTitle(d))}${DAY_DATES[d] ? `<small>${escapeHtml(formatDateShort(DAY_DATES[d]))}</small>` : ''}${dayCost(d) ? `<small>${escapeHtml(fmtMoney(dayCost(d)))}</small>` : ''}</h2>`;
      let n = 0;
      gatherGroups(rawData.filter(s => s.day === d).sort((a, b) => a.order - b.order)).forEach(seg => {
        if (seg.g && GROUPS[seg.g]) html += `<div class="pv-group">${escapeHtml(GROUPS[seg.g].name)}</div>`;
        seg.items.forEach(s => {
          n++;
          html += `<div class="pv-stop">
              <div class="pv-num" style="background:${getStopColour(s)}">${n}</div>
              <div class="pv-time">${escapeHtml(s.time || '')}</div>
              <div><div class="pv-title">${escapeHtml(s.cleanTitle || s.title)}</div>
                <div class="pv-meta">${escapeHtml([s.category, s.date && s.date !== DAY_DATES[d] ? formatDateShort(s.date) : '', typeof s.cost === 'number' ? fmtItem(s.cost, s) : '', s.address].filter(Boolean).join(' · '))}</div>
                ${hoursWarning(s) ? `<div class="pv-meta" style="color:#b45309">⚠ ${escapeHtml(hoursWarning(s).text)}</div>` : ''}
                ${s.desc ? `<div class="pv-notes">${escapeHtml(s.desc)}</div>` : ''}</div>
            </div>`;
        });
      });
    });
    $('print-view').innerHTML = html;
    window.print();
  }

  function handleOutsideModalClick(e, modalId) {
    if (e.target.id !== modalId) return;
    if (modalId === 'single-item-modal') closeSingleItemModal();
    else if (modalId === 'color-modal') closeMasterColorModal();
    else if (modalId === 'settings-modal') closeSettings();
    else $(modalId).style.display = 'none';
  }

