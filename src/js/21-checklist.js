  /* =========================================================
     TRIP CHECKLIST: packing, bookings and tickets
     ========================================================= */
  /* ---------- Trip checklist: packing, bookings and tickets, for the whole trip or a day ---------- */
  var CHECKLIST = [];
  const CHECK_KINDS = { pack: 'fa-suitcase', book: 'fa-calendar-check', ticket: 'fa-ticket', todo: 'fa-square-check' };
  let checklistDay = 'all'; // filter in the checklist window

  function checklistFor(day) { return CHECKLIST.filter(c => day === 'all' ? true : day === 'trip' ? !c.day : c.day === day); }
  function openChecklistCount(day) { return CHECKLIST.filter(c => !c.done && (c.day === day || (!c.day && day === undefined))).length; }

  function openChecklist(day) {
    closeMenus(); closeAppMenu();
    checklistDay = day === undefined ? 'all' : day;
    renderChecklist();
    $('checklist-modal').style.display = 'flex';
    setTimeout(() => { const i = $('cl-text'); if (i && !isPhoneWidth()) i.focus(); }, 60);
  }
  function closeChecklist() { $('checklist-modal').style.display = 'none'; renderTodayPanel(); }

  function checklistChanged() {
    scheduleAutosave();
    recordHistory();
    renderChecklist();
    updateChecklistPill();
    renderTripSummary();
  }

  function addChecklistItem() {
    const input = $('cl-text');
    const text = (input.value || '').trim();
    if (!text) { input.focus(); return; }
    const dayVal = $('cl-day').value;
    CHECKLIST.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, kind: $('cl-kind').value, day: dayVal === 'trip' ? null : Number(dayVal), done: false });
    input.value = '';
    checklistChanged();
    setTimeout(() => { const i = $('cl-text'); if (i) i.focus(); }, 30);
  }
  function toggleChecklistItem(id) { const c = CHECKLIST.find(x => x.id === id); if (c) { c.done = !c.done; checklistChanged(); } }
  function deleteChecklistItem(id) {
    const item = CHECKLIST.find(x => x.id === id);
    CHECKLIST = CHECKLIST.filter(x => x.id !== id);
    checklistChanged();
    if (item) showToast(t('itemDeleted', { name: item.text }), { ms: 4000, actionLabel: t('undoBtn'), onAction: () => { undo(); renderChecklist(); renderTripSummary(); } });
  }

  // A few common things to start from (all editable / deletable)
  const STARTER_ITEMS = [['starterPassport', 'pack'], ['starterInsurance', 'todo'], ['starterFlights', 'book'], ['starterStay', 'book'],
    ['starterCharger', 'pack'], ['starterMoney', 'pack'], ['starterMeds', 'pack'], ['starterOffline', 'todo']];
  function addStarterItems() {
    STARTER_ITEMS.forEach(([key, kind], i) => CHECKLIST.push({ id: 'st' + Date.now().toString(36) + i, text: t(key), kind, day: null, done: false }));
    checklistChanged();
  }
  function setChecklistFilter(v) { checklistDay = v === 'all' || v === 'trip' ? v : Number(v); renderChecklist(); }

  function renderChecklist() {
    const body = $('checklist-body');
    if (!body) return;
    const days = getAllDays();
    const dayOpts = sel => `<option value="trip" ${sel === 'trip' ? 'selected' : ''}>${escapeHtml(t('wholeTrip'))}</option>` +
      days.map(d => `<option value="${d}" ${sel === d ? 'selected' : ''}>${escapeHtml(getDayTitle(d))}</option>`).join('');
    const kindOpts = Object.keys(CHECK_KINDS).map(k => `<option value="${k}">${escapeHtml(t('ck_' + k))}</option>`).join('');
    const sections = [{ key: 'trip', title: t('wholeTrip') }].concat(days.map(d => ({ key: d, title: getDayTitle(d) })))
      .filter(sec => checklistDay === 'all' || checklistDay === sec.key);
    const total = CHECKLIST.length, done = CHECKLIST.filter(c => c.done).length;
    let list = '';
    sections.forEach(sec => {
      const items = checklistFor(sec.key);
      if (!items.length && checklistDay === 'all') return;
      list += `<div class="cl-section"><div class="cl-section-title">${escapeHtml(sec.title)}<span>${items.filter(c => c.done).length}/${items.length}</span></div>`;
      list += items.length ? items.map(c => `
        <div class="cl-item ${c.done ? 'done' : ''}" role="checkbox" aria-checked="${c.done}" tabindex="0" onclick="toggleChecklistItem('${c.id}')" onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();toggleChecklistItem('${c.id}');}">
          <button class="cl-check" tabindex="-1" aria-label="${escapeHtml(c.done ? t('notDone') : t('markDone'))}"><i class="fa-${c.done ? 'solid' : 'regular'} fa-${c.done ? 'circle-check' : 'circle'}"></i></button>
          <i class="fa-solid ${CHECK_KINDS[c.kind] || CHECK_KINDS.todo} cl-kind" title="${escapeHtml(t('ck_' + (c.kind || 'todo')))}"></i>
          <span class="cl-text">${escapeHtml(c.text)}</span>
          <button class="cl-del" onclick="event.stopPropagation(); deleteChecklistItem('${c.id}')" aria-label="${escapeHtml(t('deleteT'))}"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('') : `<p class="settings-note">${escapeHtml(t('checklistEmptyDay'))}</p>`;
      list += `</div>`;
    });
    if (!list) list = `<p class="settings-note cl-empty">${escapeHtml(t('checklistEmpty'))}</p>`;
    if (!CHECKLIST.length) list += `<button class="btn btn-secondary cl-starter" onclick="addStarterItems()"><i class="fa-solid fa-wand-magic-sparkles"></i> ${escapeHtml(t('addStarterItems'))}</button>`;
    const defDay = checklistDay === 'all' ? 'trip' : checklistDay;
    body.innerHTML = `
      <div class="cl-top">
        <select class="lang-select" onchange="setChecklistFilter(this.value)">
          <option value="all" ${checklistDay === 'all' ? 'selected' : ''}>${escapeHtml(t('allChecklist'))}</option>${dayOpts(checklistDay)}</select>
        <span class="cl-progress">${escapeHtml(t('progressN', { n: done, m: total }))}</span>
      </div>
      ${total ? `<div class="cl-bar"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div>` : ''}
      <div class="cl-add">
        <input class="edit-form-input" id="cl-text" placeholder="${escapeHtml(t('checklistPlaceholder'))}" onkeydown="if(event.key==='Enter'){event.preventDefault();addChecklistItem();}">
        <div class="row-inline">
          <select class="lang-select" id="cl-kind">${kindOpts}</select>
          <select class="lang-select" id="cl-day">${dayOpts(defDay)}</select>
          <button class="btn btn-primary" onclick="addChecklistItem()"><i class="fa-solid fa-plus"></i> ${escapeHtml(t('add'))}</button>
        </div>
      </div>
      <div class="cl-list">${list}</div>`;
  }

  function updateChecklistPill() {
    const b = $('checklist-pill');
    if (!b) return;
    const open = CHECKLIST.filter(c => !c.done).length;
    b.style.display = CHECKLIST.length ? 'inline-flex' : 'none';
    b.innerHTML = `<i class="fa-solid fa-list-check"></i> ${open}`;
    b.title = t('checklistOpenN', { n: open });
  }
