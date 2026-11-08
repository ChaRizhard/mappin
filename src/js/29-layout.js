  /* =========================================================
     LAYOUT HELPERS: resizable list column, landscape scrolling, card dragging help,
     drag-bar guard, folding days while picking days
     ========================================================= */

  /* ---------- Drag the edge of the list to make it wider or narrower (landscape and bigger screens) ---------- */
  const landscapeMQ = window.matchMedia('(max-height: 520px)');
  function sidebarMode() { return isPortraitPhone() ? null : landscapeMQ.matches ? 'land' : 'desk'; }
  function applySidebarWidth() {
    const mode = sidebarMode(), root = document.documentElement.style;
    if (!mode) { root.removeProperty('--sidebar-w'); return; }
    const w = parseInt(loadPref('mappin_sbw_' + mode, ''));
    if (w) root.setProperty('--sidebar-w', Math.round(clampSidebar(w)) + 'px'); else root.removeProperty('--sidebar-w');
  }
  function clampSidebar(w) { return Math.max(260, Math.min(w, window.innerWidth * 0.62)); }
  function initColumnResize() {
    const sb = $('sidebar');
    if (!sb) return;
    const grip = document.createElement('div');
    grip.id = 'col-resizer';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.title = t('resizeList');
    (document.querySelector('.main-content') || sb.parentElement).appendChild(grip);
    let start = null;
    grip.addEventListener('pointerdown', e => {
      if (!sidebarMode()) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      start = { x: e.clientX, w: sb.getBoundingClientRect().width, right: document.documentElement.getAttribute('data-side') === 'right' };
      grip.classList.add('active');
    });
    grip.addEventListener('pointermove', e => {
      if (!start) return;
      const dx = (e.clientX - start.x) * (start.right ? -1 : 1);
      document.documentElement.style.setProperty('--sidebar-w', Math.round(clampSidebar(start.w + dx)) + 'px');
      if (map) map.invalidateSize();
    });
    const end = () => {
      if (!start) return;
      start = null; grip.classList.remove('active');
      const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'));
      if (v && sidebarMode()) savePref('mappin_sbw_' + sidebarMode(), String(v));
      if (map) setTimeout(() => map.invalidateSize(), 50);
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('dblclick', () => { savePref('mappin_sbw_' + sidebarMode(), ''); applySidebarWidth(); if (map) map.invalidateSize(); });
    applySidebarWidth();
    window.addEventListener('resize', () => { applySidebarWidth(); updateStickyOffsets(); });
    // First time in landscape: give the grip a little wiggle so people notice it can be dragged
    if (loadPref('mappin_grip_hinted', '') !== '1') {
      const hint = () => { if (!sidebarMode()) return; savePref('mappin_grip_hinted', '1'); grip.classList.add('hint'); setTimeout(() => grip.classList.remove('hint'), 3400); landscapeMQ.removeEventListener && landscapeMQ.removeEventListener('change', hint); };
      setTimeout(hint, 2500);
      if (landscapeMQ.addEventListener) landscapeMQ.addEventListener('change', hint);
    }
  }

  /* ---------- Landscape: the menu bar and search stay put while the itinerary scrolls ---------- */
  function updateStickyOffsets() {
    const h = document.querySelector('header');
    if (!h) return;
    document.documentElement.style.setProperty('--hdr-stick', Math.round(h.getBoundingClientRect().height - 1) + 'px');
  }

  /* ---------- Moving a card: it only moves up and down, and a second finger can scroll the list ---------- */
  let dragAssist = null;
  function dragScroller() {
    const tl = document.querySelector('.timeline-container'), sb = $('sidebar');
    const scrolls = el => el && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1;
    return scrolls(tl) ? tl : scrolls(sb) ? sb : tl;
  }
  // The finger that is holding the card. Every other finger only scrolls the list: it must never move the card
  // copy or drop the card when it lifts (Sortable listens on the whole page, so other fingers are stopped first).
  let primaryTouchId = null, primaryPointerId = null;
  window.addEventListener('touchstart', e => { if (!dragAssist && e.touches.length === 1) primaryTouchId = e.touches[0].identifier; }, { capture: true, passive: true });
  window.addEventListener('pointerdown', e => { if (!dragAssist && e.isPrimary) primaryPointerId = e.pointerId; }, true);
  function startDragAssist() {
    stopDragAssist();
    const st = { raf: 0, fingers: {} };
    document.documentElement.classList.add('card-dragging'); // the browser leaves all touches to us while a card is held
    const lockAxis = () => {
      const g = document.querySelector('.sortable-fallback');
      if (g) {
        const tr = g.style.transform || '';
        let m = tr.match(/^matrix\(([^)]+)\)/);
        if (m) {
          const v = m[1].split(',').map(x => x.trim());
          if (v.length === 6 && parseFloat(v[4]) !== 0) { v[4] = '0'; g.style.transform = `matrix(${v.join(', ')})`; }
        } else if ((m = tr.match(/^translate3d\(([-\d.]+)px,\s*([-\d.]+)px/)) && parseFloat(m[1]) !== 0) {
          g.style.transform = `translate3d(0px, ${m[2]}px, 0px)`;
        }
      }
      st.raf = requestAnimationFrame(lockAxis);
    };
    st.raf = requestAnimationFrame(lockAxis);
    const isPrimaryTouch = tch => primaryTouchId === null ? false : tch.identifier === primaryTouchId;
    const holding = e => primaryTouchId !== null && Array.from(e.touches).some(isPrimaryTouch);
    st.move = e => {
      if (e.cancelable) e.preventDefault();
      const sc = dragScroller();
      for (const tch of Array.from(e.touches)) {
        if (isPrimaryTouch(tch) || (primaryTouchId === null && tch === e.touches[0])) continue;
        const prev = st.fingers[tch.identifier];
        if (prev !== undefined && sc) sc.scrollTop -= (tch.clientY - prev);
        st.fingers[tch.identifier] = tch.clientY;
      }
    };
    st.down = e => { Array.from(e.touches).forEach(tch => { if (!isPrimaryTouch(tch)) st.fingers[tch.identifier] = tch.clientY; }); };
    // Another finger lifting is not "letting go of the card"
    st.end = e => {
      Array.from(e.changedTouches).forEach(tch => { delete st.fingers[tch.identifier]; });
      if (holding(e)) e.stopImmediatePropagation();
    };
    // Pointer events (Android): ignore every pointer except the one holding the card
    st.ptr = e => {
      if (e.pointerType === 'mouse' || primaryPointerId === null || e.pointerId === primaryPointerId) return;
      e.stopImmediatePropagation();
    };
    window.addEventListener('touchstart', st.down, { passive: true, capture: true });
    window.addEventListener('touchmove', st.move, { passive: false, capture: true });
    window.addEventListener('touchend', st.end, { capture: true });
    window.addEventListener('touchcancel', st.end, { capture: true });
    ['pointermove', 'pointerup', 'pointercancel'].forEach(n => window.addEventListener(n, st.ptr, true));
    dragAssist = st;
  }
  function stopDragAssist() {
    if (!dragAssist) return;
    const st = dragAssist;
    cancelAnimationFrame(st.raf);
    window.removeEventListener('touchstart', st.down, { capture: true });
    window.removeEventListener('touchmove', st.move, { capture: true });
    window.removeEventListener('touchend', st.end, { capture: true });
    window.removeEventListener('touchcancel', st.end, { capture: true });
    ['pointermove', 'pointerup', 'pointercancel'].forEach(n => window.removeEventListener(n, st.ptr, true));
    document.documentElement.classList.remove('card-dragging');
    dragAssist = null;
  }

  /* ---------- The list's drag bar: taps just above it don't reach the map ---------- */
  function initHandleGuard() {
    document.addEventListener('pointerdown', e => {
      if (!isPortraitPhone()) return;
      const mapEl = $('map'), sb = $('sidebar');
      if (!mapEl || !sb || !mapEl.contains(e.target)) return;
      const top = sb.getBoundingClientRect().top;
      if (e.clientY > top - 26) suppressMapTapUntil = Date.now() + 700;
    }, true);
  }

  /* ---------- Picking days to group: fold every day so they're easy to tap, then unfold as they were ---------- */
  let daySelectFoldBackup = null;
  function foldDaysForSelect() {
    daySelectFoldBackup = new Set(collapsedDays);
    getAllDays().forEach(d => collapsedDays.add(d));
    document.querySelectorAll('.day-section').forEach(s => s.classList.add('collapsed'));
    document.querySelectorAll('.day-section .day-count').forEach(c => { c.style.display = ''; });
  }
  function unfoldDaysAfterSelect() {
    if (!daySelectFoldBackup) return;
    collapsedDays = daySelectFoldBackup;
    daySelectFoldBackup = null;
    document.querySelectorAll('.day-section').forEach(s => {
      const d = parseInt(s.dataset.day), c = collapsedDays.has(d);
      s.classList.toggle('collapsed', c);

    });
  }

  /* ---------- Press and hold a day's name to start picking days to group ---------- */
  function initDayHold() {
    const tl = $('timeline');
    if (!tl) return;
    let hold = null;
    const cancel = () => { if (hold) { clearTimeout(hold.timer); hold = null; } };
    tl.addEventListener('pointerdown', e => {
      const head = e.target.closest && e.target.closest('.day-section-title');
      if (!head || daySelectMode || selectMode || VIEW_ONLY || e.target.closest('.day-menu-btn, .day-line')) return;
      const sec = head.closest('.day-section');
      const day = sec ? parseInt(sec.dataset.day) : NaN;
      if (isNaN(day)) return;
      hold = { x: e.clientX, y: e.clientY, timer: setTimeout(() => {
        hold = null;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (er) {}
        swallowNextClick(); // the finger lifting shouldn't also open the day or fold it
        enterDaySelectMode(day);
        showTip('selectDays', true);
      }, 500) };
    });
    tl.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) cancel(); });
    ['pointerup', 'pointercancel', 'scroll'].forEach(ev => tl.addEventListener(ev, cancel, { passive: true }));
    tl.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.day-section-title')) e.preventDefault(); });
  }
