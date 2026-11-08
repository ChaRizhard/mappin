  /* =========================================================
     WELCOME TOUR
     ========================================================= */
  /* ---------- Welcome tour: shown once, the first time someone opens MapPin ---------- */
  const TOUR = [
    { icon: 'fa-map-location-dot', title: 'tour1Title', body: 'tour1Body' },
    { icon: 'fa-location-arrow', title: 'tour2Title', body: 'tour2Body' },
    { icon: 'fa-layer-group', title: 'tour3Title', body: 'tour3Body' },
    { icon: 'fa-list-check', title: 'tour4Title', body: 'tour4Body' }
  ];
  let tourStep = 0;
  function openTour() {
    tourStep = 0;
    renderTour();
    $('tour-modal').style.display = 'flex';
  }
  function closeTour() {
    $('tour-modal').style.display = 'none';
    savePref('mappin_tour_done', '1');
  }
  function tourNext(d) {
    tourStep = Math.max(0, Math.min(TOUR.length - 1, tourStep + d));
    renderTour();
  }
  function renderTour() {
    const st = TOUR[tourStep], last = tourStep === TOUR.length - 1;
    $('tour-body').innerHTML = `
      <div class="tour-icon"><i class="fa-solid ${st.icon}"></i></div>
      <h3 class="tour-title">${escapeHtml(t(st.title))}</h3>
      <p class="tour-text">${escapeHtml(t(st.body))}</p>
      <div class="tour-dots">${TOUR.map((_, i) => `<button class="${i === tourStep ? 'on' : ''}" onclick="tourGo(${i})" aria-label="${i + 1} / ${TOUR.length}"></button>`).join('')}</div>
      <div class="tour-actions">
        ${tourStep ? `<button class="btn btn-secondary" onclick="tourNext(-1)">${escapeHtml(t('tourBack'))}</button>` : `<button class="btn btn-ghost" onclick="closeTour()">${escapeHtml(t('tourSkip'))}</button>`}
        ${last ? `<button class="btn btn-primary" onclick="closeTour()">${escapeHtml(t('tourDone'))}</button>`
               : `<button class="btn btn-primary" onclick="tourNext(1)">${escapeHtml(t('tourNextB'))}</button>`}
      </div>`;
  }
  function initTourAutoOpen() {
    setTimeout(() => {
    if (loadPref('mappin_tour_done', '') === '1' || VIEW_ONLY || todayMode) return;
    if (document.querySelector('.modal-overlay[style*="flex"]')) return;
    openTour();
    }, 900);
  }

  // Swipe left / right through the tour; the card follows your finger
  function initTourSwipe() {
    const box = $('tour-body');
    if (!box) return;
    let sw = null;
    box.addEventListener('touchstart', e => { const p = e.touches[0]; sw = { x0: p.clientX, y0: p.clientY, dx: 0, on: false }; }, { passive: true });
    box.addEventListener('touchmove', e => {
      if (!sw) return;
      const p = e.touches[0], dx = p.clientX - sw.x0, dy = p.clientY - sw.y0;
      if (!sw.on) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
        if (Math.abs(dx) < 10) return;
        sw.on = true;
      }
      // resist at the first and last screens
      const atEdge = (dx > 0 && tourStep === 0) || (dx < 0 && tourStep === TOUR.length - 1);
      sw.dx = atEdge ? dx / 3 : dx;
      box.style.transition = 'none';
      box.style.transform = `translateX(${sw.dx}px)`;
      box.style.opacity = String(Math.max(0.4, 1 - Math.abs(sw.dx) / 500));
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!sw) return;
      const { dx, on } = sw; sw = null;
      if (!on) return;
      const dir = dx < -60 ? 1 : dx > 60 ? -1 : 0;
      const can = (dir === 1 && tourStep < TOUR.length - 1) || (dir === -1 && tourStep > 0);
      box.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
      if (!can) { box.style.transform = ''; box.style.opacity = ''; return; }
      box.style.transform = `translateX(${dir * -60}%)`;
      box.style.opacity = '0';
      setTimeout(() => {
        tourNext(dir);
        box.style.transition = 'none';
        box.style.transform = `translateX(${dir * 40}%)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          box.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
          box.style.transform = ''; box.style.opacity = '';
        }));
      }, 170);
    };
    box.addEventListener('touchend', end, { passive: true });
    box.addEventListener('touchcancel', end, { passive: true });
  }

  function tourGo(i) { tourNext(i - tourStep); }
