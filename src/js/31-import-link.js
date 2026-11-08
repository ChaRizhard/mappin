  /* =========================================================
     1.4.2: Import from a link, and refresh a trip from that link later.
     Works with a Google Sheet ("Anyone with the link can view"), a published Google Sheet,
     any CSV link the site allows apps to read (GitHub, Dropbox, your own site) and MapPin share links.
     ========================================================= */

  // Turn what people paste into something MapPin can read
  function importLinkTarget(raw) {
    let s = String(raw || '').trim();
    if (!s) return { error: 'importLinkEmpty' };
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (e) { return { error: 'importLinkBad' }; }
    const host = u.hostname.replace(/^www\./, '');
    // MapPin share links carry the trip itself
    if (/(^|[#&])(trip|s)=/.test(u.hash.slice(1))) return { kind: 'share', url: u.href };
    if (host === 'docs.google.com' && /\/spreadsheets\//.test(u.pathname)) {
      const gid = (u.hash.match(/gid=(\d+)/) || u.search.match(/gid=(\d+)/) || [])[1];
      const pub = u.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
      if (pub) return { kind: 'csv', url: `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`, sheet: true };
      const id = (u.pathname.match(/\/spreadsheets\/d\/([^/]+)/) || [])[1];
      if (id) return { kind: 'csv', url: `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`, sheet: true };
    }
    if (host === 'drive.google.com') return { error: 'importLinkDrive' };
    if (/(^|\.)google\.[a-z.]+$/.test(host) && /\/maps/.test(u.pathname) || host === 'maps.app.goo.gl' || host === 'goo.gl') return { error: 'importLinkMaps' };
    if (host === 'dropbox.com') { u.hostname = 'dl.dropboxusercontent.com'; u.searchParams.delete('dl'); return { kind: 'csv', url: u.href }; }
    if (host === 'github.com' && /\/blob\//.test(u.pathname)) return { kind: 'csv', url: `https://raw.githubusercontent.com${u.pathname.replace('/blob/', '/')}` };
    return { kind: 'csv', url: u.href };
  }

  async function fetchCsvText(url) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 15000);
    let res;
    try { res = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined }); }
    catch (e) { throw new Error(navigator.onLine ? 'importLinkBlocked' : 'offlineNeedsNet'); }
    finally { clearTimeout(timer); }
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'importLinkPrivate' : 'importLinkBlocked');
    const text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('importLinkPrivate'); // a sign-in page, not a table
    return text;
  }

  function openImportLink() {
    closeMenus(); closeAppMenu();
    renderImportLink();
    $('import-link-modal').style.display = 'flex';
    setTimeout(() => { const i = $('il-url'); if (i && !isPhoneWidth()) i.focus(); }, 60);
  }
  function closeImportLink() { $('import-link-modal').style.display = 'none'; }

  function renderImportLink(msg) {
    const body = $('import-link-body');
    if (!body) return;
    const src = TRIP.sourceUrl;
    body.innerHTML = `
      ${src ? `<div class="il-current">
        <div class="il-cur-label">${escapeHtml(t('importLinkCurrent'))}</div>
        <div class="il-cur-url">${escapeHtml(src)}</div>
        ${TRIP.sourceAt ? `<div class="il-cur-when">${escapeHtml(t('importLinkLast', { d: new Date(TRIP.sourceAt).toLocaleString(LANG, { dateStyle: 'medium', timeStyle: 'short' }) }))}</div>` : ''}
        <div class="row-inline" style="margin-top:8px">
          <button class="btn btn-primary" onclick="refreshFromLink()"><i class="fa-solid fa-rotate"></i> ${escapeHtml(t('refreshFromLink'))}</button>
          <button class="btn btn-ghost" onclick="forgetSourceLink()">${escapeHtml(t('importLinkForget'))}</button>
        </div>
        <p class="settings-note">${escapeHtml(t('refreshHint'))}</p>
      </div>` : ''}
      <label class="edit-form-label" for="il-url">${escapeHtml(src ? t('importLinkOther') : t('importLinkLabel'))}</label>
      <input class="edit-form-input" id="il-url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="https://docs.google.com/spreadsheets/d/…" onkeydown="if(event.key==='Enter'){event.preventDefault();importFromLinkInput();}">
      ${msg ? `<p class="il-msg">${escapeHtml(msg)}</p>` : ''}
      <div class="row-inline" style="margin-top:10px">
        <button class="btn btn-primary" id="il-go" onclick="importFromLinkInput()"><i class="fa-solid fa-link"></i> ${escapeHtml(t('importLinkGo'))}</button>
      </div>
      <ul class="il-help">
        <li>${escapeHtml(t('importLinkHelpSheet'))}</li>
        <li>${escapeHtml(t('importLinkHelpCsv'))}</li>
        <li>${escapeHtml(t('importLinkHelpShare'))}</li>
      </ul>`;
  }

  function importFromLinkInput() {
    const i = $('il-url');
    importFromLink(i ? i.value : '');
  }

  async function importFromLink(raw, opts = {}) {
    const target = importLinkTarget(raw);
    if (target.error) { renderImportLink(t(target.error)); const i = $('il-url'); if (i) i.value = raw || ''; return; }
    if (target.kind === 'share') {
      closeImportLink();
      const u = new URL(target.url);
      history.replaceState(null, '', location.href.split('#')[0] + u.hash);
      openSharedTripFromUrl();
      return;
    }
    if (!opts.refresh && rawData.length && !confirm(t('importReplaceConfirm'))) return;
    const btn = $('il-go');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(t('importLinkLoading'))}`; }
    try {
      const text = await fetchCsvText(target.url);
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const rows = (parsed.data || []).filter(r => r && Object.values(r).some(v => String(v || '').trim()));
      if (!rows.length) throw new Error('importLinkEmptySheet');
      const source = String(raw).trim();
      if (opts.refresh) {
        clearToasts();
        const st = processParsedData(rows, { refresh: true, sourceUrl: source });
        closeImportLink();
        showToast(t('refreshedFromLink', { a: st.added, u: st.updated, r: st.removed }), { ms: 6000, actionLabel: t('undoBtn'), onAction: undo });
      } else {
        clearToasts();
        processParsedData(rows, { title: opts.title || '', sourceUrl: source });
        closeImportLink();
        showToast(t('importedFromLink', { n: rows.length }), { ms: 4000 });
      }
    } catch (e) {
      const key = e && e.message && I18N.en[e.message] ? e.message : 'importLinkBlocked';
      if ($('import-link-modal').style.display !== 'flex') { renderImportLink(); $('import-link-modal').style.display = 'flex'; }
      renderImportLink(t(key) + (target.sheet && key !== 'offlineNeedsNet' ? ' ' + t('importLinkSheetShare') : ''));
      const i = $('il-url'); if (i && !opts.refresh) i.value = raw || '';
    }
  }

  function refreshFromLink() {
    if (!TRIP.sourceUrl) { openImportLink(); return; }
    if (!confirm(t('refreshConfirm'))) return;
    importFromLink(TRIP.sourceUrl, { refresh: true });
  }
  function forgetSourceLink() {
    delete TRIP.sourceUrl; delete TRIP.sourceAt;
    scheduleAutosave();
    renderImportLink();
  }
