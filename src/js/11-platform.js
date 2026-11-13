  /* =========================================================
     APP / PLATFORM
     ========================================================= */
  const APP_VERSION = '1.4.8';
  const IS_NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());

  // Native plugins (installed in the phone app project); null in a normal browser
  function capPlugin(name) {
    try {
      const C = window.Capacitor;
      if (!C) return null;
      return (C.Plugins && C.Plugins[name]) || (typeof C.registerPlugin === 'function' ? C.registerPlugin(name) : null);
    } catch (e) { return null; }
  }

  let deferredInstall = null;

  function initAppShell() {
    // Offline support for the website version (the phone apps carry their files with them)
    if (!IS_NATIVE && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; updateInstallItem(); });
    window.addEventListener('appinstalled', () => { deferredInstall = null; updateInstallItem(); showToast(t('installed')); });
    updateInstallItem();

    const setOnline = () => {
      $('offline-banner').classList.toggle('show', !navigator.onLine);
      setTimeout(() => map && map.invalidateSize(), 60);
    };
    window.addEventListener('online', () => {
      setOnline();
      showToast(t('backOnline'), { ms: 2000 });
      requeuePending();
      scheduleHoursCheck(1500);
      flushCloudSync();
    });
    window.addEventListener('offline', setOnline);
    setOnline();

    if (IS_NATIVE) initNative();
    initZoomReset();
    cloudInit();
    scheduleHoursCheck(4000);
    // Start at your location when there's no trip yet (or it's a trip day); otherwise show the whole trip
    const startHere = !rawData.length || todayDayNumber() !== null;
    if (startHere && loadPref('mappin_start_at_location', 'true') === 'true') locateMe({ silent: true, startup: true });
    else if (rawData.length) setTimeout(() => fitAllPins({ instant: true }), 300);
  }

  /* ---------- Typing on phones ----------
     Text boxes use 16px text on iPhone, so iOS never zooms in (see the CSS); the page itself can't be pinch-zoomed
     (only the map can). iPhone also doesn't close the keyboard when you tap elsewhere, so close it ourselves. */
  function initZoomReset() {
    if (isIos()) document.documentElement.classList.add('ios');
    document.addEventListener('pointerdown', e => {
      const a = document.activeElement;
      if (!a || a === document.body) return;
      const editing = a.matches && a.matches('input, textarea, select, [contenteditable="true"]');
      if (!editing) return;
      if (e.target === a || a.contains(e.target)) return;
      // Buttons next to a text box (Add, Save…) work on the first tap and keep the keyboard where it makes sense
      if (e.target.closest('input, textarea, select, [contenteditable="true"], label, button, a, [role="button"], [role="checkbox"], .search-container, #date-popover, .context-menu-item')) return;
      // Tapping the dimmed area around a window while typing only closes the keyboard (the window stays)
      if (e.target.classList && (e.target.classList.contains('modal-overlay') || e.target.id === 'menu-backdrop')) swallowNextClick();
      a.blur();
    }, true);
    // No page zoom outside the map (iPhone pinch and double-tap zoom)
    ['gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => {
      if (!(e.target.closest && e.target.closest('#map'))) e.preventDefault();
    }, { passive: false }));
  }

  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  function updateInstallItem() {
    const el = $('install-menu-item');
    if (el) el.style.display = (!IS_NATIVE && !isStandalone() && (deferredInstall || isIos())) ? '' : 'none';
  }

  async function installApp() {
    if (deferredInstall) {
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch (e) {}
      deferredInstall = null;
      updateInstallItem();
    } else if (isIos()) {
      alert(t('installIos'));
    }
  }

  function initNative() {
    document.documentElement.classList.add('native');
    const App = capPlugin('App');
    if (App && App.addListener) {
      App.addListener('backButton', () => {
        if (handleBack()) return;
        if (App.minimizeApp) App.minimizeApp(); else if (App.exitApp) App.exitApp();
      });
    }
    applyNativeTheme();
    const Splash = capPlugin('SplashScreen');
    if (Splash && Splash.hide) Promise.resolve(Splash.hide()).catch(() => {});
  }

  // Android back button: close whatever is on top. Returns true if something closed.
  function handleBack() {
    if (dpState) { closeDatePopover(); return true; }
    if ($('app-menu').classList.contains('show')) { closeAppMenu(); return true; }
    const openModal = [...document.querySelectorAll('.modal-overlay')].reverse().find(o => o.id && o.id !== 'tour-modal' && o.style.display === 'flex');
    if (openModal) { closeModalById(openModal.id); return true; }
    if ($('day-menu').style.display === 'block' || $('context-menu').style.display === 'block') { closeMenus(); return true; }
    if (selectMode) { exitSelectMode(); return true; }
    if (daySelectMode) { exitDaySelectMode(); return true; }
    if (document.querySelector('.leaflet-popup')) { map.closePopup(); return true; }
    if ($('search-results').style.display === 'block') { $('search-results').style.display = 'none'; return true; }
    if (isPortraitPhone() && sheetState === 'max') { setSheet('mid'); return true; }
    return false;
  }

  function applyNativeTheme() { updateTopColour(); }

  /* ---------- Sharing files and links (phone share sheet, or download/copy on a computer) ---------- */
  const isPhoneWidth = () => window.matchMedia('(max-width: 820px), (max-height: 520px)').matches;

  async function shareFile(name, text, mime) {
    const FS = IS_NATIVE ? capPlugin('Filesystem') : null, Share = IS_NATIVE ? capPlugin('Share') : null;
    if (FS && Share) {
      const r = await FS.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: 'MapPin', files: [r.uri] });
      return 'shared';
    }
    try {
      const file = new File([text], name, { type: mime });
      if (isPhoneWidth() && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'MapPin' });
        return 'shared';
      }
    } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    return 'downloaded';
  }

  async function shareUrl(url) {
    const Share = IS_NATIVE ? capPlugin('Share') : null;
    if (Share) { await Share.share({ title: 'MapPin', url }); return 'shared'; }
    if (navigator.share && isPhoneWidth()) {
      try { await navigator.share({ title: 'MapPin', url }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  }

  // Plain-text itinerary (used by "Share itinerary" in the phone app, where printing isn't available)
  function itineraryText() {
    const lines = [`MapPin${TRIP.title ? ' · ' + TRIP.title : ''}`, ''];
    getAllDays().forEach(d => {
      lines.push(`${getDayTitle(d)}${DAY_DATES[d] ? ' · ' + formatDateShort(DAY_DATES[d]) : ''}${dayCost(d) ? ' · ' + fmtMoney(dayCost(d)) : ''}`);
      dayDisplayOrder(d).forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s.time ? s.time + '  ' : ''}${s.cleanTitle || s.title}${typeof s.cost === 'number' ? ' · ' + fmtItem(s.cost, s) : ''}`);
        if (s.address) lines.push(`     ${s.address}`);
        if (s.desc && s.desc !== s.address) lines.push(`     ${s.desc.replace(/\n+/g, ' ')}`);
      });
      lines.push('');
    });
    if (tripCost()) lines.push(`${t('tripTotal')}: ${fmtMoney(tripCost())}`);
    return lines.join('\n');
  }

  async function shareItineraryText() {
    if (!rawData.length) { alert(t('noExport')); return; }
    const Share = IS_NATIVE ? capPlugin('Share') : null;
    try {
      if (Share) await Share.share({ title: 'MapPin', text: itineraryText() });
      else await shareFile('MapPin_Itinerary.txt', itineraryText(), 'text/plain');
    } catch (e) {}
  }

  /* ---------- My location ---------- */
  let meMarker = null, meCircle = null;

  // Your blue dot: moved in place when it already exists (so a live position doesn't flicker)
  function placeMe(lat, lng, accuracy) {
    if (!map) return;
    const r = Math.min(accuracy || 30, 500);
    if (meMarker && meCircle) { meMarker.setLatLng([lat, lng]); meCircle.setLatLng([lat, lng]); meCircle.setRadius(r); return; }
    meCircle = L.circle([lat, lng], { radius: r, color: '#2563eb', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
    meMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 7000
    }).addTo(map);
    if (meMarker.bindTooltip) meMarker.bindTooltip(t('youAreHere'));
    meMarker.on('click', () => { const ll = meMarker.getLatLng(); handleMapPlaceClick({ lat: ll.lat, lng: ll.lng }); });
  }

  async function locateMe(opts = {}) {
    const btn = $('locate-btn');
    btn.classList.add('busy');
    try {
      let pos;
      const Geo = IS_NATIVE ? capPlugin('Geolocation') : null;
      if (Geo) {
        try { await Geo.requestPermissions(); } catch (e) {}
        pos = await Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      } else {
        pos = await new Promise((res, rej) => navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 })
          : rej(new Error('unavailable')));
      }
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      placeMe(lat, lng, accuracy);
      if (opts.startup) { map.setView([lat, lng], 15); userMovedMap = true; pendingFitAll = false; }
      else map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
    } catch (e) {
      if (!opts.silent) alert(t('locationDenied'));
    } finally {
      btn.classList.remove('busy');
    }
  }
