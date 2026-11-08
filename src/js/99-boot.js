  /* =========================================================
     START-UP: wire up gestures and helpers, then build the map once the page has loaded
     ========================================================= */
  initMenuHost();
  initMenuAutoClose();
  initSheetSwipe();
  initPageAtTop();
  initCardSwipe();
  initBackLayers();
  initLayersAutoClose();
  initMapTapGuard();
  initTodaySwipe();
  initTodayResize();
  initTodayTicker();
  initTourSwipe();
  initSingleToast();
  initScrollLock();
  initDragCleanup();
  initDismissFirst();
  initLiveEdits();
  initColumnResize();
  initHandleGuard();
  placeFilters();
  initDayHold();
  initHoldSelect();
  initPinDoubleTap();

  window.addEventListener('load', () => {
    initMap();
    initAutoToday();
    initTourAutoOpen();
    labelIconButtons();
    updateStickyOffsets();
    setTimeout(maybeShowTips, 5000);
    if (needsConversion()) refreshRates();
    if (!feedbackEmail()) { const f = $('feedback-menu-item'); if (f) f.style.display = 'none'; }
  });
