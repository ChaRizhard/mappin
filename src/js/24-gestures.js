  /* =========================================================
     PHONE GESTURES AND NAVIGATION: menu sheets, swipe to close, back, card swipes
     ========================================================= */
  /* ---------- Menus: bottom sheets on phones, so every option fits and nothing floats away ---------- */
  function menuBackdrop(show) {
    let b = $('menu-backdrop');
    if (!b) {
      b = document.createElement('div');
      b.id = 'menu-backdrop';
      b.addEventListener('click', () => { closeAppMenu(); closeMenus(); });
      document.body.appendChild(b);
    }
    b.classList.toggle('show', !!show);
  }
  function asSheet(menu) {
    // Upright phones: menus slide up from the bottom. On its side (and on bigger screens) they drop down from the button.
    const phone = isPortraitPhone();
    menu.classList.toggle('as-sheet', phone);
    if (phone) { keepPageAtTop(); menu.style.left = ''; menu.style.top = ''; menu.style.right = ''; menuBackdrop(true); }
    return phone;
  }
  // Keep the app menu at the top level so it can sit above everything
  function initMenuHost() { const m = $('app-menu'); if (m && m.parentElement !== document.body) document.body.appendChild(m); }

  // A desktop drop-down closes when the list scrolls or the window changes, instead of being left behind
  function initMenuAutoClose() {
    const close = () => { if (!isPhoneWidth()) { closeAppMenu(); closeMenus(); } };
    const sb = $('sidebar'), tl = document.querySelector('.timeline-container');
    [sb, tl].forEach(el => el && el.addEventListener('scroll', close, { passive: true }));
    window.addEventListener('resize', () => { closeAppMenu(); closeMenus(); });
  }

  /* ---------- Swipe a window down to close it (phones) ---------- */
  function closeModalById(id) {
    if (id === 'settings-modal') closeSettings();
    else if (id === 'checklist-modal') closeChecklist();
    else if (id === 'expenses-modal') closeExpenses();
    else if (id === 'import-link-modal') closeImportLink();
    else if (id === 'single-item-modal') closeSingleItemModal();
    else if (id === 'color-modal') closeMasterColorModal();
    else if (id === 'tour-modal') closeTour();
    else { const el = $(id); if (el) el.style.display = 'none'; }
  }
  function initSheetSwipe() {
    // Works for windows (.modal-box) and for menus shown as bottom sheets (.as-sheet)
    let sw = null;
    document.addEventListener('touchstart', e => {
      if (!isPhoneWidth() || e.touches.length !== 1 || !e.target.closest) return;
      if (edgeSwipeHere() && e.touches[0].clientX < EDGE) return; // that's a back swipe
      const menu = e.target.closest('.as-sheet');
      const box = menu || e.target.closest('.modal-box');
      if (!box) return;
      let ov = null;
      if (!menu) {
        ov = box.closest('.modal-overlay');
        if (!ov || ov.classList.contains('previewing') || !ov.id || ov.id === 'tour-modal') return;
        if (e.target.closest('input, textarea, select, .color-swatch, [contenteditable="true"]')) return;
      }
      if (box.scrollTop > 0) return;
      sw = { box, ov, menu: !!menu, y0: e.touches[0].clientY, t0: Date.now(), dy: 0 };
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!sw) return;
      const dy = e.touches[0].clientY - sw.y0;
      if ((dy <= 0 || sw.box.scrollTop > 0) && !sw.dy) { sw = null; return; }
      sw.dy = Math.max(0, dy);
      if (sw.dy < 6) return; // a tap, not a swipe
      sw.box.style.animation = 'none';
      sw.box.style.transition = 'none';
      sw.box.style.transform = `translateY(${sw.dy}px)`;
      const fade = Math.max(0.1, 0.55 - sw.dy / 600);
      if (sw.ov) sw.ov.style.background = `rgba(2,6,23,${fade})`;
      else { const b = $('menu-backdrop'); if (b) b.style.background = `rgba(2,6,23,${fade * 0.8})`; }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!sw) return;
      const { box, ov, menu, dy, t0 } = sw; sw = null;
      if (dy < 6) return;
      const fast = dy > 50 && dy / Math.max(1, Date.now() - t0) > 0.55;
      const reset = () => { box.style.transform = ''; box.style.transition = ''; box.style.animation = ''; if (ov) ov.style.background = ''; const b = $('menu-backdrop'); if (b) b.style.background = ''; };
      box.style.transition = 'transform 0.2s ease';
      if (dy > (menu ? 90 : 130) || fast) {
        box.style.transform = 'translateY(110%)';
        setTimeout(() => { if (menu) { closeAppMenu(); closeMenus(); } else closeModalById(ov.id); reset(); }, 190);
      } else {
        box.style.transform = '';
        if (ov) ov.style.background = '';
        const b = $('menu-backdrop'); if (b) b.style.background = '';
        setTimeout(reset, 220);
      }
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
  }

  /* ---------- iPhone: after the keyboard or a rotation, iOS can leave the whole page scrolled by a few
     dozen pixels even though it can't scroll. Things then draw in one place but react to taps in another
     (e.g. tapping "Copy share link" hits the item below). Put the page back where it belongs. ---------- */
  function keepPageAtTop() {
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return; // the keyboard may need it while typing
    if (window.scrollX || window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }
  function initPageAtTop() {
    ['resize', 'orientationchange', 'scroll'].forEach(ev => window.addEventListener(ev, () => setTimeout(keepPageAtTop, 60), { passive: true }));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => setTimeout(keepPageAtTop, 120));
    document.addEventListener('focusout', () => setTimeout(keepPageAtTop, 250));
    window.addEventListener('orientationchange', () => setTimeout(keepPageAtTop, 350));
  }

  /* ---------- Swipe a card: left to delete (with undo), right to mark it done ---------- */
  function initCardSwipe() {
    const tl = $('timeline');
    if (!tl) return;
    let sw = null;
    const THRESH = 96;
    tl.addEventListener('touchstart', e => {
      if (VIEW_ONLY || selectMode || daySelectMode || e.touches.length !== 1) return;
      const card = e.target.closest('.activity-card');
      if (!card || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const p = e.touches[0];
      sw = { card, x0: p.clientX, y0: p.clientY, t0: Date.now(), dx: 0, active: false, dead: false };
    }, { passive: true });
    tl.addEventListener('touchmove', e => {
      if (!sw || sw.dead) return;
      const p = e.touches[0], dx = p.clientX - sw.x0, dy = p.clientY - sw.y0;
      if (!sw.active) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw.dead = true; return; } // scrolling the list
        if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        if (document.querySelector('.sortable-chosen, .sortable-drag')) { sw.dead = true; return; } // a drag has started
        sw.active = true;
        sw.card.classList.add('swiping');
      }
      sw.dx = dx;
      sw.card.style.transform = `translateX(${dx}px)`;
      sw.card.dataset.swipe = dx < -THRESH ? 'delete' : dx > THRESH ? 'done' : dx < 0 ? 'left' : 'right';
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    let lastTap = { id: null, at: 0 };
    const end = e => {
      if (!sw) return;
      const { card, dx, active, dead, x0, y0, t0 } = sw; sw = null;
      if (!active) {
        // Double tap a card to fly to its pin (iOS doesn't send double-clicks once swiping is enabled)
        const p = e && e.changedTouches && e.changedTouches[0];
        const still = p && Math.abs(p.clientX - x0) < 10 && Math.abs(p.clientY - y0) < 10 && Date.now() - t0 < 350;
        if (!dead && still) {
          const id = Number(card.getAttribute('data-id')), now = Date.now();
          if (lastTap.id === id && now - lastTap.at < 350) {
            lastTap = { id: null, at: 0 };
            clearTimeout(inlineEditTimer);
            lastCardFlyAt = Date.now();
            flyToStop(id);
          } else lastTap = { id, at: now };
        }
        return;
      }
      const id = Number(card.getAttribute('data-id'));
      card.classList.remove('swiping');
      card.style.transition = 'transform 0.18s ease';
      if (dx < -THRESH) {
        card.style.transform = 'translateX(-110%)';
        setTimeout(() => {
          const item = rawData.find(s => s.id === id);
          deleteCard(id);
          showToast(t('stopDeleted', { name: item ? (item.cleanTitle || item.title) : '' }), { ms: 5000, actionLabel: t('undoBtn'), onAction: undo });
        }, 170);
        return;
      }
      if (dx > THRESH) {
        const item = rawData.find(s => s.id === id);
        if (item) { item.done = !item.done; renderItinerary(); showToast(item.done ? t('markedDone') : t('markedNotDone'), { ms: 3500, actionLabel: t('undoBtn'), onAction: undo }); }
        return;
      }
      card.style.transform = '';
      delete card.dataset.swipe;
      setTimeout(() => { card.style.transition = ''; }, 200);
    };
    tl.addEventListener('touchend', end, { passive: true });
    tl.addEventListener('touchcancel', end, { passive: true });
  }

  /* ---------- Back closes the window or menu on top ----------
     Browsers: the Back button / back swipe (each window adds a history step).
     Home Screen app and phone apps: swipe in from the left edge; the window follows your finger. */
  const EDGE = 24;
  const edgeSwipeHere = () => IS_NATIVE || isStandalone();
  function openLayers() {
    const ids = [];
    document.querySelectorAll('.modal-overlay').forEach(o => { if (o.id && o.id !== 'tour-modal' && o.style.display === 'flex') ids.push('#' + o.id); });
    if ($('app-menu') && $('app-menu').classList.contains('show')) ids.push('app-menu');
    if ($('day-menu') && $('day-menu').style.display === 'block') ids.push('day-menu');
    return ids;
  }
  function closeLayer(id) {
    if (id === 'app-menu') closeAppMenu();
    else if (id === 'day-menu') closeMenus();
    else closeModalById(id.slice(1));
  }
  function layerBox(id) {
    if (id === 'app-menu' || id === 'day-menu') return $(id);
    const ov = $(id.slice(1));
    return ov && ov.querySelector('.modal-box');
  }

  function initBackLayers() {
    let stack = [], ignorePop = 0, timer = null;
    const useHistory = !edgeSwipeHere(); // no browser Back in the Home Screen app or phone apps
    function sync() {
      timer = null;
      const now = openLayers();
      const removed = stack.filter(id => !now.includes(id));
      const added = now.filter(id => !stack.includes(id));
      if (!removed.length && !added.length) return;
      stack = stack.filter(id => now.includes(id)).concat(added);
      if (!useHistory) return;
      const net = added.length - removed.length;
      try {
        if (removed.length && added.length) history.replaceState({ mpLayer: stack[stack.length - 1] }, '');
        if (net > 0) for (let i = 0; i < net; i++) history.pushState({ mpLayer: stack[stack.length - net + i] }, '');
        else if (net < 0 && history.state && history.state.mpLayer) { ignorePop++; history.go(net); }
      } catch (e) {}
    }
    const schedule = () => { if (!timer) timer = setTimeout(sync, 0); };
    const mo = new MutationObserver(schedule);
    [...document.querySelectorAll('.modal-overlay'), $('app-menu'), $('day-menu')].forEach(el => el && mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }));
    window.addEventListener('popstate', () => {
      if (ignorePop) { ignorePop--; return; }
      const top = stack.pop();
      if (top) closeLayer(top);
    });

    // Edge swipe: the top window slides right with your finger and closes if you go far enough
    let edge = null;
    document.addEventListener('touchstart', e => {
      if (!edgeSwipeHere() || e.touches.length !== 1) return;
      const p = e.touches[0];
      const top = openLayers().pop();
      edge = top && p.clientX < EDGE ? { id: top, box: layerBox(top), x: p.clientX, y: p.clientY, t0: Date.now(), dx: 0, on: false } : null;
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!edge || !edge.box) return;
      const p = e.touches[0], dx = p.clientX - edge.x, dy = p.clientY - edge.y;
      if (!edge.on) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > dx) { edge = null; return; }
        if (dx < 8) return;
        edge.on = true;
      }
      edge.dx = Math.max(0, dx);
      edge.box.style.animation = 'none';
      edge.box.style.transition = 'none';
      edge.box.style.transform = `translateX(${edge.dx}px)`;
      edge.box.style.opacity = String(Math.max(0.35, 1 - edge.dx / 700));
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!edge) return;
      const { id, box, dx, on, t0 } = edge; edge = null;
      if (!on || !box) return;
      const reset = () => { box.style.transform = ''; box.style.transition = ''; box.style.animation = ''; box.style.opacity = ''; };
      box.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      if (dx > 100 || (dx > 40 && dx / Math.max(1, Date.now() - t0) > 0.5)) {
        box.style.transform = 'translateX(105%)';
        box.style.opacity = '0.3';
        setTimeout(() => { closeLayer(id); reset(); }, 190);
      } else {
        box.style.transform = ''; box.style.opacity = '';
        setTimeout(reset, 220);
      }
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
  }

  /* ---------- No rubber-band bounce: on iPhone, dragging somewhere that can't scroll would pull the whole
     app around (and can leave it shifted). Only real scrolling areas move; the map handles its own gestures. ---------- */
  function initScrollLock() {
    let last = null, elastic = null;
    const scrollerFor = (el, vertical) => {
      for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (vertical ? (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)
                     : (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)) return el;
      }
      return null;
    };
    const release = () => {
      if (!elastic) return;
      const el = elastic.el; elastic = null;
      el.style.transition = 'transform 0.35s cubic-bezier(.2,.9,.3,1.2)';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 380);
    };
    document.addEventListener('touchstart', e => { const p = e.touches[0]; last = p ? { x: p.clientX, y: p.clientY } : null; }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!last || !e.cancelable || e.defaultPrevented) return;
      const tgt = e.target;
      if (tgt.closest && tgt.closest('#map, input[type="range"], textarea, input')) return;
      if (e.touches.length > 1) { e.preventDefault(); return; } // no page pinch-zoom
      const p = e.touches[0], dx = p.clientX - last.x, dy = p.clientY - last.y;
      last = { x: p.clientX, y: p.clientY };
      if (!dx && !dy) return;
      const vertical = Math.abs(dy) >= Math.abs(dx);
      // A real scrolling area: let iPhone scroll it and bounce at the ends as usual
      if (scrollerFor(tgt, vertical)) return;
      e.preventDefault(); // nothing to scroll here, so don't drag the whole app around
      // …but give windows and menus a little stretch so it doesn't feel stuck
      const box = vertical && tgt.closest && tgt.closest('.modal-box, .as-sheet, .dropdown-menu.show, #day-menu');
      if (!box) return;
      if (!elastic || elastic.el !== box) elastic = { el: box, off: 0 };
      // Rubber band like iOS: follows your finger, getting gradually stiffer, with no hard stop
      elastic.off += dy;
      const lim = window.innerHeight * 0.55, a = Math.abs(elastic.off);
      const shown = Math.sign(elastic.off) * lim * (1 - 1 / (a * 0.55 / lim + 1));
      box.style.transition = 'none';
      box.style.transform = `translateY(${shown}px)`;
    }, { passive: false });
    document.addEventListener('touchend', release, { passive: true });
    document.addEventListener('touchcancel', release, { passive: true });
  }

  // If a press-and-hold ends without a drag, never leave a card stuck in its "picked up" look
  function initDragCleanup() {
    const tidy = () => setTimeout(() => {
      if (document.querySelector('.sortable-fallback, .sortable-drag')) return;
      document.querySelectorAll('.sortable-chosen').forEach(el => el.classList.remove('sortable-chosen'));
    }, 120);
    document.addEventListener('touchend', tidy, { passive: true });
    document.addEventListener('touchcancel', tidy, { passive: true });
  }

  /* ---------- "Close first, then act": a tap outside an open calendar only closes it ---------- */
  let swallowUntil = 0;
  function swallowNextClick() { swallowUntil = Date.now() + 650; }
  // Only the click that may follow the finger lifting (a new touch still works straight away)
  let clickSwallowUntil = 0;
  function swallowClickOnly() { clickSwallowUntil = Date.now() + 500; }
  function initDismissFirst() {
    // A tap that only closes something mustn't focus a text box either (touch browsers focus on the touch itself)
    document.addEventListener('touchstart', e => { if (Date.now() < swallowUntil && e.cancelable) { e.preventDefault(); swallowUntil = 0; } }, { capture: true, passive: false }); // no click follows a cancelled touch
    document.addEventListener('click', e => {
      if (Date.now() < swallowUntil) { swallowUntil = 0; e.stopPropagation(); e.preventDefault(); return; }
      if (Date.now() < clickSwallowUntil) { clickSwallowUntil = 0; e.stopPropagation(); e.preventDefault(); }
    }, true);
    // Picking cards or days: a tap anywhere else just stops picking (and does nothing else)
    document.addEventListener('pointerdown', e => {
      const t = e.target;
      if (!t.closest) return;
      if (selectMode && !t.closest('.activity-card, #select-bar, #day-menu, .day-menu-btn, #context-menu, .modal-overlay, #menu-backdrop, .toast')) {
        exitSelectMode(); e.preventDefault(); swallowNextClick(); return;
      }
      if (daySelectMode && !t.closest('.day-section-title, .daygroup-banner, #select-bar, #day-menu, .day-menu-btn, .modal-overlay, #menu-backdrop, .toast')) {
        exitDaySelectMode(); e.preventDefault(); swallowNextClick(); return;
      }
    }, true);
    document.addEventListener('pointerdown', e => {
      if (!dpState) return;
      const pop = $('date-popover');
      if (pop.contains(e.target) || (dpState.opener && dpState.opener.contains(e.target))) return;
      closeDatePopover();
      e.preventDefault(); // don't focus a text box or start anything else with this tap
      swallowNextClick();
    }, true);
  }

  let lastCardFlyAt = 0;
