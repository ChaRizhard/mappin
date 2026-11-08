  /* =========================================================
     STATE
     ========================================================= */
  let map, currentTileLayer, currentTileType = 'light', rawData = [], markers = [], polylineSegments = [], dotMarkers = [], spiderLines = [], activeDay = 'all';

  let DAY_TITLES = {};        // day -> custom title
  let DAY_COLOR_MAP = {};     // day -> custom colour
  let DAY_DATES = {};         // day -> 'YYYY-MM-DD'
  let EXTRA_DAYS = new Set(); // days with no stops (added by the user)
  let collapsedDays = new Set();
  let GROUPS = {};            // card groups: id -> { id, name, colour, opacity }
  let stopToGroup = {};       // stopId -> groupId
  let groupCounter = 1;
  let DAY_GROUPS = {};        // day groups: id -> { id, name, colour, opacity }
  let dayToGroup = {};        // day -> dayGroupId
  let dayGroupCounter = 1;
  let collapsedDayGroups = new Set();

  let selectedStopIds = new Set();
  let selectMode = false;
  let selectedDays = new Set();
  let daySelectMode = false;

  const DEFAULT_PALETTE = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];
  // Ten clearly different day colours (no near-duplicates such as amber/yellow or green/teal)
  const DAY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#a16207', '#d946ef'];

  let singleEditTarget = null;  // { type: 'day'|'group'|'daygroup'|'stop', id }
  let singleStagedData = {};
  let singlePreviewBackup = null;

  let stagedDayColors = {}, stagedGroupColors = {}, stagedDgColors = {};
  let stagedChanged = new Set();
  let masterPreviewBackup = null;

  // Fan-out grace period state
  const FAN_GRACE_MS = 450;
  let fannedClusters = {};
  let collapseTimers = {};

  // Preview pins (search result, clicked map place, removed stop) and area search results
  let PLACE_REG = {};
  let placeSeq = 0;
  let previewMarker = null;
  let previewKey = null;
  let previewMode = 'add';   // 'add' | 'restore' | 'relocate'
  let previewToken = 0;
  let previewClosingByCode = false;
  let lastRemovedPin = null;
  let relocateTargetId = null;
  let areaMarkers = [];      // [{ marker, key }]
  let lastSearchResults = [];
  let lastAreaResults = [];

  // Rendering / geocoding state
  let openStopPopupId = null;
  let isDragging = false;
  let renderTimer = null;
  let pendingFitAll = false;
  let userMovedMap = false;
  let importGeneration = 0;
  let lastPopupCloseAt = 0;
  let mapClickTimer = null;
  let cityAnchors = {};

  // Preferences
  let routeMode = loadPref('mappin_route_mode', 'straight');
  let autosaveOn = loadPref('mappin_autosave_on', 'true') === 'true';

  // Undo / redo history (snapshots of the map, newest last)
  let histUndo = [], histRedo = [], histCurrent = null, histSuspend = false;

  const PIN_W = 32, PIN_H = 41; // pins 10% smaller than the original
  const PIN_FONT = 17.8;        // viewBox units, keeps digits the original on-screen size

  const ADD_PIN_SVG = `<svg viewBox="0 0 24 24" width="18" height="18">
      <ellipse class="pin-shadow" cx="12" cy="22" rx="4" ry="1.3" fill="currentColor" opacity="0.35"/>
      <g class="pin-body">
        <path d="M12 1.5C8.13 1.5 5 4.63 5 8.5c0 4.9 7 11.5 7 11.5s7-6.6 7-11.5c0-3.87-3.13-7-7-7z" fill="currentColor"/>
        <path class="pin-hole" d="M12 5.5v6M9 8.5h6" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>`;

  const TRASH_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <g class="trash-lid"><path d="M3 6h18"/><path d="M9 6V4h6v2"/></g>
      <path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>`;

  // Map image resolution: 2x on sharp screens; 4x on very sharp phones (iPhone Pro Max etc.) if the tile server supports it
  let TILE_SCALE = (window.devicePixelRatio || 1) > 1.3 ? 2 : 1;
  if ((window.devicePixelRatio || 1) >= 2.5) { const s = parseInt(loadPref('mappin_tile_scale', '')); if (s) TILE_SCALE = s; }

  function probeTileScale() {
    if ((window.devicePixelRatio || 1) < 2.5 || loadPref('mappin_tile_scale', '')) return;
    const img = new Image();
    img.onload = () => {
      const s = img.naturalWidth >= 1000 ? 4 : img.naturalWidth >= 700 ? 3 : 2;
      savePref('mappin_tile_scale', String(s));
      if (s !== TILE_SCALE) { TILE_SCALE = s; if (map) switchTileLayer(currentTileType); }
    };
    img.src = 'https://mt1.google.com/vt/lyrs=m&scale=4&x=3638&y=1612&z=12';
  }

  function tileUrl(type) {
    if (typeof gmpTileUrl === 'function') { const official = gmpTileUrl(type); if (official) return official; }
    const hl = (LANGUAGES.find(l => l.code === LANG) || LANGUAGES[0]).tiles;
    const lyrs = type === 'sat' ? 'y' : 'm';
    // High-resolution tiles on sharp screens (phones, Retina), so the map isn't blurry
    const scale = TILE_SCALE > 1 ? `&scale=${TILE_SCALE}` : '';
    return `https://mt1.google.com/vt/lyrs=${lyrs}&hl=${hl}${scale}&x={x}&y={y}&z={z}`;
  }

  const $ = id => document.getElementById(id);

  function loadPref(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function savePref(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

  /* =========================================================
     INIT
     ========================================================= */
  function initMap() {
    applyI18n();
    applyUiTheme(loadUiTheme());
    applySide();
    placeHeader();
    if (phoneLayoutMQ.addEventListener) phoneLayoutMQ.addEventListener('change', placeHeader);

    map = L.map('map', { zoomControl: false }).setView([35.6762, 139.6503], 12);
    initDeferredFit();
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    switchTileLayer('light');

    map.on('click', e => {
      clearTimeout(mapClickTimer);
      if (Date.now() - lastPopupCloseAt < 350) return; // that click just closed a popup
      if (mapTapSuppressed()) return; // that tap just closed a menu, the keyboard or a panel
      mapClickTimer = setTimeout(() => handleMapPlaceClick(e.latlng), 230);
    });
    map.on('dblclick', () => clearTimeout(mapClickTimer));
    map.on('popupclose', () => { lastPopupCloseAt = Date.now(); });
    map.on('dragstart', () => { userMovedMap = true; });
    map.on('zoomstart', () => Object.keys(fannedClusters).forEach(collapseCluster));
    map.getContainer().addEventListener('wheel', () => { userMovedMap = true; }, { passive: true });
    window.addEventListener('resize', () => map.invalidateSize());
    initSheetDrag();
    probeTileScale();

    updateRouteButtons();
    updateAutosaveSwitch();

    // Autosave: bring back whatever was on screen last time
    let restored = false;
    if (autosaveOn) {
      try {
        const s = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
        if (s && ((s.rawData && s.rawData.length) || (s.EXTRA_DAYS && s.EXTRA_DAYS.length))) {
          applyState(s);
          pendingFitAll = true;
          restored = true;
        }
      } catch (e) {}
    }

    populateFilters();
    renderItinerary();
    if (restored) { requeuePending(); updateGeoStatus(); showToast(t('restored')); }
    initAppShell();
    openSharedTripFromUrl();

    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeMenus(); closeDatePopover(); closeAppMenu();
        if (selectMode) exitSelectMode();
        if (daySelectMode) exitDaySelectMode();
      }
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName);
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    });
  }

  /* ---------- Header menu ---------- */
  function toggleAppMenu(e) {
    e.stopPropagation();
    const m = $('app-menu');
    const show = !m.classList.contains('show');
    m.classList.toggle('show', show);
    if (!show) { menuBackdrop(false); return; }
    if (asSheet(m)) return;
    const r = $('app-menu-btn').getBoundingClientRect();
    m.style.position = 'fixed';
    m.style.left = 'auto';
    m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    const h = m.offsetHeight;
    const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
    let top = h + 6 > below && above > below ? Math.max(8, r.top - 6 - h) : r.bottom + 6;
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8)); // never past the bottom of the screen
    m.style.top = top + 'px';
  }

  // Phones: keep the menu bar inside the list panel, just above "Itinerary"
  const phoneLayoutMQ = window.matchMedia('(max-width: 820px) and (min-height: 521px), (max-height: 520px)');
  function placeHeader() {
    const header = document.querySelector('header'), sb = $('sidebar'), app = $('app-container');
    if (!header || !sb || !app) return;
    closeAppMenu();
    if (phoneLayoutMQ.matches) {
      const handle = $('sheet-handle');
      if (header.parentElement !== sb) { if (handle) handle.after(header); else sb.prepend(header); }
      document.documentElement.classList.add('header-in-sheet');
    } else {
      if (header.parentElement !== app) app.insertBefore(header, app.firstChild);
      document.documentElement.classList.remove('header-in-sheet');
    }
    updateTopColour();
    placeTodayPanel();
    if (typeof placeFilters === 'function') { placeFilters(); applySidebarWidth(); updateStickyOffsets(); }
    setTimeout(() => map && map.invalidateSize(), 60);
  }
  function closeAppMenu() { const m = $('app-menu'); if (m) m.classList.remove('show'); if (typeof menuBackdrop === 'function' && !($('day-menu') && $('day-menu').style.display === 'block')) menuBackdrop(false); }

  /* ---------- Autosave switch ---------- */
  function toggleAutosave() {
    autosaveOn = !autosaveOn;
    savePref('mappin_autosave_on', String(autosaveOn));
    updateAutosaveSwitch();
    if (autosaveOn) { scheduleAutosave(); showToast(t('autosaveOn')); }
    else { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {} showToast(t('autosaveOff')); }
  }
  function updateAutosaveSwitch() {
    const sw = $('autosave-switch');
    if (!sw) return;
    sw.classList.toggle('is-on', autosaveOn);
    sw.setAttribute('aria-checked', String(autosaveOn));
  }

  /* ---------- Undo / redo ---------- */
  // History ignores looked-up place data and collapse state, so only real edits are undoable
  function histSnapshot() {
    const s = serializeState();
    s.rawData = s.rawData.map(r => { const c = Object.assign({}, r); delete c.osmTags; delete c.osmRef; return c; });
    delete s.collapsedDays; delete s.collapsedDayGroups;
    return JSON.stringify(s);
  }

  function recordHistory() {
    if (histSuspend || singlePreviewBackup || masterPreviewBackup) return;
    const snap = histSnapshot();
    if (snap === histCurrent) return;
    if (histCurrent !== null) {
      histUndo.push(histCurrent);
      if (histUndo.length > 80) histUndo.shift();
      histRedo = [];
    }
    histCurrent = snap;
    updateUndoButtons();
  }

  // Background updates (geocoding) become part of the current snapshot instead of an undo step
  function rebaseHistory() { if (histCurrent !== null) histCurrent = histSnapshot(); }

  function restoreFromHistory(snapStr) {
    const s = JSON.parse(snapStr);
    // Keep locations found in the background since that snapshot was taken
    const now = {}; rawData.forEach(r => { now[r.id] = r; });
    (s.rawData || []).forEach(r => {
      const cur = now[r.id];
      if (cur) {
        if (cur.osmTags) r.osmTags = cur.osmTags;
        if (cur.osmRef) r.osmRef = cur.osmRef;
        if ((r.pending || r.lat === null) && hasCoords(cur)) { r.lat = cur.lat; r.lng = cur.lng; r.pending = false; r.approx = cur.approx; r.notFound = cur.notFound; }
      }
    });
    s.collapsedDays = [...collapsedDays];
    s.collapsedDayGroups = [...collapsedDayGroups];
    applyState(s);
    histSuspend = true;
    populateFilters();
    renderItinerary();
    histSuspend = false;
    histCurrent = histSnapshot();
    requeuePending();
    updateUndoButtons();
  }

  function undo() {
    if (!histUndo.length) return;
    histRedo.push(histCurrent);
    restoreFromHistory(histUndo.pop());
    showToast(t('undone'), { ms: 1500 });
  }

  function redo() {
    if (!histRedo.length) return;
    histUndo.push(histCurrent);
    restoreFromHistory(histRedo.pop());
    showToast(t('redone'), { ms: 1500 });
  }

  function updateUndoButtons() {
    const u = $('undo-btn'), r = $('redo-btn');
    if (u) u.disabled = !histUndo.length;
    if (r) r.disabled = !histRedo.length;
  }

  /* ---------- UI light/dark theme ---------- */
  function loadUiTheme() { return loadPref('mappin_ui_theme', 'dark'); }
  function applyUiTheme(theme) {
    document.documentElement.setAttribute('data-ui', theme);
    const sw = $('ui-theme-switch');
    if (sw) {
      sw.classList.toggle('is-dark', theme !== 'light');
      sw.setAttribute('aria-checked', theme !== 'light' ? 'true' : 'false');
    }
  }
  function toggleUiTheme() {
    const next = document.documentElement.getAttribute('data-ui') === 'light' ? 'dark' : 'light';
    applyUiTheme(next);
    savePref('mappin_ui_theme', next);
    if (typeof applyNativeTheme === 'function') applyNativeTheme();
    if ($('settings-modal') && $('settings-modal').style.display === 'flex') renderSettings();
  }

  /* ---------- Language ---------- */
  function setLanguage(code) {
    if (!I18N[code]) return;
    LANG = code;
    savePref('mappin_lang', code);
    applyI18n();
    switchTileLayer(currentTileType);
    updateGeoStatus();
    updateSelectBar();
    populateFilters();
    renderItinerary();
    if ($('settings-modal').style.display === 'flex') renderSettings();
  }

  /* ---------- Toasts ---------- */
  function showToast(msg, opts = {}) {
    const host = $('toast-host');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    if (opts.actionLabel) {
      const b = document.createElement('button');
      b.textContent = opts.actionLabel;
      b.onclick = () => { el.remove(); opts.onAction && opts.onAction(); };
      el.appendChild(b);
    }
    host.appendChild(el);
    setTimeout(() => el.remove(), opts.ms || 5000);
  }

  /* ---------- State snapshot (autosave, preview, saved maps) ---------- */
  const AUTOSAVE_KEY = 'mappin_autosave_v1';
  let autosaveTimer = null;

  function serializeState() {
    return {
      rawData, DAY_TITLES, DAY_COLOR_MAP, DAY_DATES,
      EXTRA_DAYS: [...EXTRA_DAYS], collapsedDays: [...collapsedDays],
      GROUPS, stopToGroup, groupCounter,
      DAY_GROUPS, dayToGroup, dayGroupCounter, collapsedDayGroups: [...collapsedDayGroups],
      trip: TRIP, CHECKLIST
    };
  }
  function cloneState() { return JSON.parse(JSON.stringify(serializeState())); }

  function cityKeyOf(city) { return String(city || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_'); }

  function applyState(s) {
    rawData = (s.rawData || []).map(r => {
      if (r.lat === null || r.lat === undefined) r.lat = NaN;
      if (r.lng === null || r.lng === undefined) r.lng = NaN;
      if (r.cityKey === undefined) r.cityKey = cityKeyOf(r.city);
      return r;
    });
    DAY_TITLES = s.DAY_TITLES || {};
    DAY_DATES = s.DAY_DATES || {};
    if (s.DAY_COLOR_MAP) DAY_COLOR_MAP = s.DAY_COLOR_MAP;
    else {
      DAY_COLOR_MAP = {};
      if (Array.isArray(s.DAY_COLORS)) [...new Set(rawData.map(d => d.day))].forEach(d => { DAY_COLOR_MAP[d] = s.DAY_COLORS[(d - 1) % s.DAY_COLORS.length]; });
    }
    EXTRA_DAYS = new Set(s.EXTRA_DAYS || []);
    collapsedDays = new Set(s.collapsedDays || []);
    GROUPS = s.GROUPS || {};
    stopToGroup = s.stopToGroup || {};
    groupCounter = s.groupCounter || Object.keys(GROUPS).length + 1;
    DAY_GROUPS = s.DAY_GROUPS || {};
    dayToGroup = s.dayToGroup || {};
    dayGroupCounter = s.dayGroupCounter || Object.keys(DAY_GROUPS).length + 1;
    collapsedDayGroups = new Set(s.collapsedDayGroups || []);
    TRIP = Object.assign({ cloudId: null, title: '' }, s.trip || {});
    CHECKLIST = Array.isArray(s.CHECKLIST) ? s.CHECKLIST : [];
  }

  function scheduleAutosave() {
    if (VIEW_ONLY) return; // a view-only shared trip is never saved on this device
    scheduleCloudSync();
    if (!autosaveOn || singlePreviewBackup || masterPreviewBackup) return; // never persist an unsaved preview
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeState())); } catch (e) {}
    }, 700);
  }

  function handleGlobalClick(e) {
    const menu = $('context-menu');
    if (menu && !menu.contains(e.target)) menu.style.display = 'none';
    const dayMenu = $('day-menu');
    if (dayMenu && !dayMenu.contains(e.target) && !e.target.closest('.day-menu-btn')) dayMenu.style.display = 'none';
    if (dpState && e.target.isConnected && !$('date-popover').contains(e.target) && !(dpState.opener && dpState.opener.contains(e.target))) closeDatePopover();
    if (!e.target.closest('.search-container')) $('search-results').style.display = 'none';
    if (!e.target.closest('.menu-wrap')) closeAppMenu();

    if (selectMode) {
      if (!e.target.closest('.activity-card, #select-bar, #day-menu, .day-menu-btn, #context-menu, .modal-box')) exitSelectMode();
      return;
    }
    if (daySelectMode) {
      if (!e.target.closest('.day-section-title, .daygroup-banner, #select-bar, #day-menu, .day-menu-btn, .modal-box')) exitDaySelectMode();
      return;
    }
    if (!e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (!e.target.closest('.activity-card, #context-menu, .modal-box, #select-bar, #day-menu, .day-menu-btn')) {
        if (selectedStopIds.size > 0) clearSelection();
      }
    }
  }

  function closeMenus() {
    $('context-menu').style.display = 'none';
    $('day-menu').style.display = 'none';
    if (!$('app-menu').classList.contains('show')) menuBackdrop(false);
  }

  /* ---------- Map images (Google) ---------- */
  let mapSwitchToken = 0;

  function switchTileLayer(type) {
    currentTileType = type;
    ++mapSwitchToken;
    document.querySelectorAll('[id^="btn-"]').forEach(btn => btn.classList.remove('active'));
    const b = $(`btn-${type}`); if (b) b.classList.add('active');
    if (currentTileLayer) { map.removeLayer(currentTileLayer); currentTileLayer = null; }
    currentTileLayer = L.tileLayer(tileUrl(type), {
      maxZoom: 20, maxNativeZoom: 20, tileSize: 256, detectRetina: false, attribution: '&copy; Google Maps',
      className: type === 'dark' ? 'dark-mode-tiles' : ''
    }).addTo(map);
    updateTopColour();
  }

  /* ---------- Phone list sheet: drag the bar to resize, tap it to switch between half and full ---------- */
  const isPortraitPhone = () => window.matchMedia('(max-width: 820px) and (min-height: 521px)').matches;
  let sheetState = 'mid';
  let sheetCustomRatio = 0.46; // height chosen by dragging, as a share of the screen

  function sheetHeights() {
    const total = document.querySelector('.main-content').getBoundingClientRect().height;
    // Smallest size still shows the drag bar, the menu bar and the "Itinerary" title
    const hh = el => (el ? el.getBoundingClientRect().height : 0);
    const header = document.querySelector('header');
    const tp = $('today-panel');
    if (todayMode && tp && tp.parentElement === $('sidebar') && tp.style.display !== 'none') {
      // Today mode: the smallest size shows the drag bar and the Today card
      const needT = hh($('sheet-handle')) + hh(tp) + 10 + 28; // card margins + room above the home bar
      return { min: Math.round(Math.min(Math.max(needT, 120), total * 0.62)), mid: Math.round(Math.max(total * 0.46, needT)), max: Math.round(total * 0.9), total };
    }
    const need = hh($('sheet-handle')) + (header && header.parentElement === $('sidebar') ? hh(header) : 0) + hh(document.querySelector('.sidebar-title-row')) + 14;
    return { min: Math.round(Math.min(Math.max(need, 96), total * 0.4)), mid: Math.round(total * 0.46), max: Math.round(total * 0.9), total };
  }

  function setSheet(state) {
    const sb = $('sidebar');
    if (!isPortraitPhone()) { sb.style.height = ''; return; }
    sheetState = state;
    const h = sheetHeights();
    sb.style.height = (state === 'custom' ? Math.round(Math.max(h.min, Math.min(h.max, h.total * sheetCustomRatio))) : h[state]) + 'px';
    sb.classList.toggle('expanded', state === 'max');
    setTimeout(() => map && map.invalidateSize(), 280);
  }

  function toggleSheet() { setSheet(sheetState === 'max' ? 'mid' : 'max'); }

  function initSheetDrag() {
    const sb = $('sidebar');
    const grips = [$('sheet-handle'), document.querySelector('.sidebar-title-row')].filter(Boolean);
    let startY = 0, startH = 0, active = false, moved = false;
    grips.forEach(el => {
      el.addEventListener('pointerdown', e => {
        if (!isPortraitPhone() || e.target.closest('button, a, input, select')) return;
        active = true; moved = false; startY = e.clientY; startH = sb.getBoundingClientRect().height;
        sb.classList.add('dragging');
        try { el.setPointerCapture(e.pointerId); } catch (x) {}
      });
      el.addEventListener('pointermove', e => {
        if (!active) return;
        const dy = startY - e.clientY;
        if (Math.abs(dy) > 5) moved = true;
        if (!moved) return;
        const h = sheetHeights();
        sb.style.height = Math.max(h.min, Math.min(h.max, startH + dy)) + 'px';
      });
      const end = () => {
        if (!active) return;
        active = false;
        sb.classList.remove('dragging');
        if (!moved) { if (el.id === 'sheet-handle') toggleSheet(); return; }
        // Stays exactly where you let go (it only clicks into place when very close to small, half or full)
        const cur = sb.getBoundingClientRect().height, h = sheetHeights();
        const nearest = ['min', 'mid', 'max'].sort((a, b) => Math.abs(h[a] - cur) - Math.abs(h[b] - cur))[0];
        if (Math.abs(h[nearest] - cur) < 20) setSheet(nearest);
        else { sheetCustomRatio = cur / h.total; setSheet('custom'); }
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
    let lastPortrait = isPortraitPhone();
    window.addEventListener('resize', () => {
      const now = isPortraitPhone();
      if (now) setSheet(sheetState); else sb.style.height = '';
      if (now !== lastPortrait) { lastPortrait = now; setTimeout(() => map && map.invalidateSize(), 300); }
    });
    if (isPortraitPhone()) setSheet('mid');
  }

  /* ---------- List position (left / right) ---------- */
  function applySide() {
    document.documentElement.setAttribute('data-side', loadPref('mappin_side', 'right') === 'right' ? 'right' : 'left');
    setTimeout(() => map && map.invalidateSize(), 60);
  }
  function setSide(side) {
    savePref('mappin_side', side);
    applySide();
    if ($('settings-modal').style.display === 'flex') renderSettings();
  }
