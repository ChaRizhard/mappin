  /* =========================================================
     CLOUD SYNC (optional; free Supabase project; plain REST, no extra library)
     ========================================================= */
  const CLOUD = { session: null, trips: null, tripsLoading: false, pendingEmail: '' };
  let TRIP = { cloudId: null, title: '' };

  function cloudConfig() {
    const c = window.MAPPIN_CONFIG || {};
    return {
      url: (loadPref('mappin_sb_url', '') || c.supabaseUrl || '').trim().replace(/\/+$/, ''),
      key: (loadPref('mappin_sb_key', '') || c.supabaseAnonKey || '').trim(),
      publicUrl: (loadPref('mappin_public_url', '') || c.publicUrl || '').trim()
    };
  }
  function cloudReady() { const c = cloudConfig(); return !!(c.url && c.key); }

  function saveCloudSettings() {
    savePref('mappin_sb_url', $('set-sb-url').value.trim());
    savePref('mappin_sb_key', $('set-sb-key').value.trim());
    showToast(t('settingsSaved'), { ms: 1800 });
    renderSettings();
  }

  function resetCloudSettings() {
    savePref('mappin_sb_url', '');
    savePref('mappin_sb_key', '');
    CLOUD.pendingEmail = '';
    renderSettings();
  }

  function cloudInit() {
    try { CLOUD.session = JSON.parse(localStorage.getItem('mappin_sb_session') || 'null'); } catch (e) { CLOUD.session = null; }
    updateSyncPill();
  }

  function storeSession(d) {
    if (!d || !d.access_token) throw new Error('No session');
    CLOUD.session = {
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      email: (d.user && d.user.email) || (CLOUD.session && CLOUD.session.email) || CLOUD.pendingEmail
    };
    try { localStorage.setItem('mappin_sb_session', JSON.stringify(CLOUD.session)); } catch (e) {}
  }

  async function sbFetch(path, { method = 'GET', body, auth = true, prefer } = {}) {
    const c = cloudConfig();
    const headers = { apikey: c.key, 'Content-Type': 'application/json' };
    if (auth) {
      const tok = await cloudToken();
      if (!tok) throw new Error(t('signInFirst'));
      headers.Authorization = `Bearer ${tok}`;
    }
    if (prefer) headers.Prefer = prefer;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(c.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      if (!res.ok) {
        const msg = data && (data.msg || data.message || data.error_description || data.error) || `HTTP ${res.status}`;
        const err = new Error(msg); err.status = res.status; throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function cloudToken() {
    const s = CLOUD.session;
    if (!s) return null;
    if (Date.now() / 1000 < (s.expires_at || 0) - 60) return s.access_token;
    try {
      const d = await sbFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false });
      storeSession(d);
      return CLOUD.session.access_token;
    } catch (e) {
      if (e.status === 400 || e.status === 401) { CLOUD.session = null; try { localStorage.removeItem('mappin_sb_session'); } catch (x) {} updateSyncPill(); }
      throw e;
    }
  }

  async function cloudSendCode() {
    const email = ($('set-email').value || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { $('set-email').focus(); return; }
    try {
      await sbFetch('/auth/v1/otp', { method: 'POST', body: { email, create_user: true }, auth: false });
      CLOUD.pendingEmail = email;
      renderSettings();
      const code = $('set-code'); if (code) code.focus();
    } catch (e) { showToast(t('cloudError', { msg: e.message }), { ms: 6000 }); }
  }

  async function cloudVerifyCode() {
    const token = ($('set-code').value || '').replace(/\s+/g, '');
    if (!token) return;
    try {
      const d = await sbFetch('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: CLOUD.pendingEmail, token }, auth: false });
      storeSession(d);
      CLOUD.pendingEmail = '';
      updateSyncPill();
      await cloudLoadTrips();
    } catch (e) { showToast(t('cloudError', { msg: e.message }), { ms: 6000 }); }
  }

  async function cloudSignOut() {
    try { await sbFetch('/auth/v1/logout', { method: 'POST' }); } catch (e) {}
    CLOUD.session = null; CLOUD.trips = null;
    try { localStorage.removeItem('mappin_sb_session'); } catch (e) {}
    updateSyncPill();
    renderSettings();
  }

  async function cloudLoadTrips() {
    CLOUD.tripsLoading = true; renderSettings();
    try { CLOUD.trips = await sbFetch('/rest/v1/trips?select=id,title,updated_at&order=updated_at.desc'); }
    catch (e) { CLOUD.trips = []; showToast(t('cloudError', { msg: e.message }), { ms: 6000 }); }
    finally { CLOUD.tripsLoading = false; if ($('settings-modal').style.display === 'flex') renderSettings(); }
  }

  // What gets stored or shared: the trip without bulky looked-up place data
  function shareState() {
    const s = serializeState();
    s.rawData = s.rawData.map(r => { const c = Object.assign({}, r); delete c.osmTags; return c; });
    s.trip = { title: TRIP.title || '' };
    return JSON.parse(JSON.stringify(s));
  }

  async function cloudSaveTrip({ silent } = {}) {
    const title = TRIP.title || t('currentTrip');
    const data = shareState();
    if (TRIP.cloudId) {
      const rows = await sbFetch(`/rest/v1/trips?id=eq.${encodeURIComponent(TRIP.cloudId)}`, {
        method: 'PATCH', body: { title, data, updated_at: new Date().toISOString() }, prefer: 'return=representation'
      });
      if (Array.isArray(rows) && rows.length) { if (!silent) showToast(t('cloudSaved'), { ms: 2000 }); return; }
      TRIP.cloudId = null; // deleted elsewhere: save as new
    }
    const rows = await sbFetch('/rest/v1/trips', { method: 'POST', body: { title, data }, prefer: 'return=representation' });
    TRIP.cloudId = rows && rows[0] && rows[0].id;
    scheduleAutosave();
    if (!silent) showToast(t('cloudSaved'), { ms: 2000 });
  }

  async function cloudSaveFromSettings() {
    const name = $('set-trip-name').value.trim();
    if (name) TRIP.title = name;
    try {
      await cloudSaveTrip();
      lastSyncedSnap = histSnapshot();
      updateSyncPill('synced');
      await cloudLoadTrips();
    } catch (e) { showToast(t('cloudError', { msg: e.message }), { ms: 6000 }); }
  }

  async function cloudOpenTrip(id) {
    try {
      const rows = await sbFetch(`/rest/v1/trips?id=eq.${encodeURIComponent(id)}&select=id,title,data`);
      const row = rows && rows[0];
      if (!row) return;
      if (rawData.length && TRIP.cloudId !== id && !confirm(t('importReplaceConfirm'))) return;
      openTripState(row.data, { cloudId: row.id, title: row.title });
      lastSyncedSnap = histSnapshot();
      updateSyncPill('synced');
      closeSettings();
      showToast(t('cloudOpened', { t: row.title }));
    } catch (e) { showToast(t('cloudError', { msg: e.message }), { ms: 6000 }); }
  }

  async function cloudDeleteTrip(id) {
    const tr = (CLOUD.trips || []).find(x => x.id === id);
    if (!confirm(t('deleteCloudConfirm', { t: tr ? tr.title : '' }))) return;
    try {
      await sbFetch(`/rest/v1/trips?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (TRIP.cloudId === id) { TRIP.cloudId = null; updateSyncPill(); scheduleAutosave(); }
      await cloudLoadTrips();
    } catch (e) { showToast(t('cloudError', { msg: e.message }), { ms: 6000 }); }
  }

  async function cloudCreateShare(data) {
    const rows = await sbFetch('/rest/v1/shares', { method: 'POST', body: { data }, prefer: 'return=representation' });
    if (!rows || !rows[0] || !rows[0].id) throw new Error('No share id');
    return rows[0].id;
  }

  async function cloudGetShare(id) {
    return sbFetch('/rest/v1/rpc/get_share', { method: 'POST', body: { share_id: id }, auth: false });
  }

  /* ---------- Automatic sync of the open trip ---------- */
  let cloudSyncTimer = null, lastSyncedSnap = null, cloudSyncing = false;

  function scheduleCloudSync() {
    if (!autoSyncOn || !TRIP.cloudId || !CLOUD.session || !cloudReady()) return;
    if (singlePreviewBackup || masterPreviewBackup) return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(flushCloudSync, 4000);
  }

  async function flushCloudSync() {
    if (!autoSyncOn || !TRIP.cloudId || !CLOUD.session || !cloudReady() || cloudSyncing || !navigator.onLine) return;
    const snap = histSnapshot();
    if (snap === lastSyncedSnap) { updateSyncPill('synced'); return; }
    cloudSyncing = true;
    updateSyncPill('syncing');
    try {
      await cloudSaveTrip({ silent: true });
      lastSyncedSnap = snap;
      updateSyncPill('synced');
    } catch (e) {
      updateSyncPill('failed');
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(flushCloudSync, 30000);
    } finally {
      cloudSyncing = false;
    }
  }

  function updateSyncPill(state) {
    const el = $('sync-pill');
    if (!el) return;
    if (!TRIP.cloudId || !CLOUD.session || !cloudReady()) { el.style.display = 'none'; return; }
    el.style.display = 'inline-flex';
    if (state === 'syncing') el.innerHTML = `<i class="fa-solid fa-rotate fa-spin"></i> ${escapeHtml(t('syncing'))}`;
    else if (state === 'failed') el.innerHTML = `<i class="fa-solid fa-cloud-exclamation" style="color:#f59e0b"></i> ${escapeHtml(t('syncFailed'))}`;
    else el.innerHTML = `<i class="fa-solid fa-cloud" style="color:#10b981"></i> ${escapeHtml(t('synced'))}`;
  }

  // Replace the open trip with another (cloud trip or shared link)
  function openTripState(s, trip) {
    importGeneration++; geoQueue = []; cityAnchors = {};
    clearPreviewPin(); clearAreaResults();
    applyState(s);
    TRIP = Object.assign({ cloudId: null, title: '' }, trip || {});
    activeDay = 'all';
    pendingFitAll = true; userMovedMap = false;
    requeuePending();
    updateGeoStatus();
    populateFilters();
    renderItinerary();
    scheduleHoursCheck(3000);
  }
