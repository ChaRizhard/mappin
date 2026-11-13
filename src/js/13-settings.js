  /* =========================================================
     SETTINGS
     ========================================================= */
  let autoSyncOn = loadPref('mappin_autosync', 'true') === 'true';

  function switchHtml(on, onclick, label) {
    return `<div class="ui-switch ${on ? 'is-dark' : ''}" role="switch" tabindex="0" aria-checked="${on}" aria-label="${escapeHtml(label)}" onclick="${onclick}"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${onclick}}">
        <span class="switch-label" style="display:inline">${escapeHtml(on ? t('on') : t('off'))}</span>
        <div class="ui-switch-track"><div class="ui-switch-knob"></div></div></div>`;
  }

  function openSettings() {
    renderSettings();
    $('settings-modal').style.display = 'flex';
  }

  function closeSettings() { $('settings-modal').style.display = 'none'; }

  function renderSettings() {
    const body = $('settings-body');
    if (!body) return;
    const dark = document.documentElement.getAttribute('data-ui') !== 'light';
    const cfg = cloudConfig();
    const langOptions = LANGUAGES.map(l => `<option value="${l.code}" ${l.code === LANG ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('');
    const curOptions = [...new Set([CURRENCY, ...CURRENCIES])].map(c => `<option value="${c}" ${c === CURRENCY ? 'selected' : ''}>${c}</option>`).join('');

    let cloud = '';
    if (!cloudReady()) {
      cloud = `
        <p class="settings-note">${escapeHtml(t('cloudNotSetUp'))}</p>
        <label class="field-label">${escapeHtml(t('supabaseUrl'))}</label>
        <input class="edit-form-input" id="set-sb-url" placeholder="https://xxxx.supabase.co" value="${escapeHtml(cfg.url)}">
        <label class="field-label">${escapeHtml(t('supabaseKey'))}</label>
        <input class="edit-form-input" id="set-sb-key" placeholder="eyJhbGciOi…" value="${escapeHtml(cfg.key)}">
        <button class="btn btn-primary" onclick="saveCloudSettings()">${escapeHtml(t('saveSettings'))}</button>`;
    } else if (!CLOUD.session) {
      cloud = `
        <div class="row-inline" style="margin-bottom:8px">
          <input class="edit-form-input" id="set-email" type="email" autocomplete="email" placeholder="${escapeHtml(t('email'))}" value="${escapeHtml(CLOUD.pendingEmail || '')}">
          <button class="btn btn-primary" onclick="cloudSendCode()">${escapeHtml(t('sendCode'))}</button>
        </div>
        ${CLOUD.pendingEmail ? `
          <p class="settings-note">${escapeHtml(t('codeSent', { email: CLOUD.pendingEmail }))}</p>
          <div class="row-inline">
            <input class="edit-form-input" id="set-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="${escapeHtml(t('enterCode'))}">
            <button class="btn btn-success" onclick="cloudVerifyCode()">${escapeHtml(t('verify'))}</button>
          </div>` : ''}
        <p class="settings-note" style="margin-top:10px"><a href="#" onclick="resetCloudSettings(); return false;">${escapeHtml(t('supabaseUrl'))} / ${escapeHtml(t('supabaseKey'))}…</a></p>`;
    } else {
      const trips = CLOUD.trips || [];
      cloud = `
        <div class="settings-row"><span>${escapeHtml(t('signedInAs', { email: CLOUD.session.email || '' }))}</span>
          <button class="btn btn-secondary" style="padding:5px 10px;font-size:11px" onclick="cloudSignOut()">${escapeHtml(t('signOut'))}</button></div>
        <label class="field-label">${escapeHtml(t('tripName'))}</label>
        <div class="row-inline" style="margin-bottom:10px">
          <input class="edit-form-input" id="set-trip-name" value="${escapeHtml(TRIP.title || '')}" placeholder="${escapeHtml(t('currentTrip'))}">
          <button class="btn btn-success" onclick="cloudSaveFromSettings()"><i class="fa-solid fa-cloud-arrow-up"></i> ${escapeHtml(TRIP.cloudId ? t('updateCloud') : t('saveToCloud'))}</button>
        </div>
        <div class="settings-row"><span>${escapeHtml(t('autoSync'))}</span>${switchHtml(autoSyncOn, 'toggleAutoSync()', t('autoSync'))}</div>
        <label class="field-label">${escapeHtml(t('cloudTrips'))}</label>
        <div id="cloud-trip-list">${CLOUD.tripsLoading ? `<div class="pd-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>` :
          trips.length ? trips.map(tr => `
            <div class="cloud-trip ${tr.id === TRIP.cloudId ? 'current' : ''}">
              <span class="ct-title">${escapeHtml(tr.title)}</span>
              <span class="ct-date">${escapeHtml(new Date(tr.updated_at).toLocaleDateString(LANG))}</span>
              <button class="btn btn-primary" onclick="cloudOpenTrip('${escapeHtml(tr.id)}')">${escapeHtml(t('openCloud'))}</button>
              <button class="btn btn-secondary" onclick="cloudDeleteTrip('${escapeHtml(tr.id)}')"><i class="fa-solid fa-trash"></i></button>
            </div>`).join('') : `<p class="settings-note">${escapeHtml(t('noCloudTrips'))}</p>`}</div>`;
    }

    body.innerHTML = `
      <div class="settings-section">
        <h3><i class="fa-solid fa-palette"></i> ${escapeHtml(t('appearance'))}</h3>
        <div class="settings-row"><span>${escapeHtml(t('language'))}</span><select class="lang-select" onchange="setLanguage(this.value)">${langOptions}</select></div>
        <div class="settings-row"><span>${escapeHtml(t('theme'))}</span>
          <div class="ui-switch ${dark ? 'is-dark' : ''}" role="switch" tabindex="0" aria-checked="${dark}" onclick="toggleUiTheme()">
            <i class="fa-solid fa-sun"></i><div class="ui-switch-track"><div class="ui-switch-knob"></div></div><i class="fa-solid fa-moon"></i></div></div>
        <div class="settings-row"><span>${escapeHtml(t('autosave'))}</span>${switchHtml(autosaveOn, 'toggleAutosave(); renderSettings();', t('autosave'))}</div>
        <div class="settings-row"><span>${escapeHtml(t('listSide'))}</span>
          <div class="segmented">
            <button class="${loadPref('mappin_side', 'right') !== 'right' ? 'active' : ''}" onclick="setSide('left')"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(t('sideLeft'))}</button>
            <button class="${loadPref('mappin_side', 'right') === 'right' ? 'active' : ''}" onclick="setSide('right')">${escapeHtml(t('sideRight'))} <i class="fa-solid fa-arrow-right"></i></button>
          </div></div>
        <p class="settings-note">${escapeHtml(t('listSideHint'))}</p>
        ${tipsSettingHtml()}
        <div class="settings-row"><span>${escapeHtml(t('startAtLocation'))}</span>${switchHtml(loadPref('mappin_start_at_location', 'true') === 'true', 'toggleStartAtLocation()', t('startAtLocation'))}</div>
      </div>
      <div class="settings-section">
        <h3><i class="fa-solid fa-list-check"></i> ${escapeHtml(t('planning'))}</h3>
        <div class="settings-row"><span>${escapeHtml(t('homeCurrency'))}</span><select class="lang-select" onchange="setCurrency(this.value)">${curOptions}</select></div>
        <div class="settings-row"><span>${escapeHtml(t('tripCurrency'))}</span><select class="lang-select" onchange="setTripCurrency(this.value)">${currencyOptions(tripCurrency())}</select></div>
        <p class="settings-note">${escapeHtml(t('currencyHint'))}${FX && FX.at ? ' ' + escapeHtml(t('ratesAsOf', { d: new Date(FX.at).toLocaleDateString(LANG) })) : ''} <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates by Exchange Rate API</a></p>
        ${tempUnitSettingHtml()}
        ${autoTodaySettingHtml()}
        ${arrivalsSettingHtml()}
        <div class="settings-row"><span>${escapeHtml(t('checkHours'))}</span>${switchHtml(checkHoursOn, 'toggleCheckHours()', t('checkHours'))}</div>
        <p class="settings-note">${escapeHtml(t('checkHoursHint'))}</p>
      </div>
      ${offlineSettingsHtml()}
      <div class="settings-section">
        <h3><i class="fa-solid fa-cloud"></i> ${escapeHtml(t('cloudSync'))}</h3>
        ${cloud}
      </div>
      <div class="settings-section">
        <h3><i class="fa-solid fa-link"></i> ${escapeHtml(t('publicUrl'))}</h3>
        <div class="row-inline">
          <input class="edit-form-input" id="set-public-url" placeholder="https://…" value="${escapeHtml(cfg.publicUrl)}">
          <button class="btn btn-secondary" onclick="savePublicUrl()">${escapeHtml(t('saveSettings'))}</button>
        </div>
        <p class="settings-note" style="margin-top:6px">${escapeHtml(t('publicUrlHint'))}</p>
      </div>
      <div class="settings-section">
        <h3><i class="fa-solid fa-circle-info"></i> ${escapeHtml(t('about'))}</h3>
        <p class="settings-note">MapPin · ${escapeHtml(t('version', { v: APP_VERSION }))}${IS_NATIVE ? ' · app' : ''}<br>
          Map data © OpenStreetMap contributors · Geocoding: Nominatim, Photon · Routes: FOSSGIS OSRM${GMP.key ? ' · Map: Google Maps Platform' : ''}<br>
          <a href="${escapeHtml((publicBase() || './').replace(/index\.html$/, '') + 'privacy.html')}" target="_blank" rel="noopener">${escapeHtml(t('privacy'))}</a></p>
        ${(!IS_NATIVE && !isStandalone() && (deferredInstall || isIos())) ? `<button class="btn btn-primary" onclick="installApp()"><i class="fa-solid fa-mobile-screen-button"></i> ${escapeHtml(t('installApp'))}</button>` : ''}
      </div>`;
  }

  function toggleStartAtLocation() {
    const on = loadPref('mappin_start_at_location', 'true') === 'true';
    savePref('mappin_start_at_location', String(!on));
    renderSettings();
  }

  function setCurrency(c) {
    CURRENCY = c;
    savePref('mappin_currency', c);
    refreshRates(true);
    renderItinerary();
  }

  function toggleCheckHours() {
    checkHoursOn = !checkHoursOn;
    savePref('mappin_check_hours', String(checkHoursOn));
    if (checkHoursOn) scheduleHoursCheck(500);
    renderSettings();
    renderItinerary();
  }

  function toggleAutoSync() {
    autoSyncOn = !autoSyncOn;
    savePref('mappin_autosync', String(autoSyncOn));
    if (autoSyncOn) flushCloudSync();
    renderSettings();
  }

  function savePublicUrl() {
    const v = $('set-public-url').value.trim();
    savePref('mappin_public_url', v);
    showToast(t('settingsSaved'), { ms: 1800 });
  }
