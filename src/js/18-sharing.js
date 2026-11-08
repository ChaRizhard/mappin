  /* =========================================================
     SHARING: editable copy or view only
     ========================================================= */
  var VIEW_ONLY = false;

  /* ---------- Sharing: editable copy or view only ---------- */
  function shareTrip() {
    if (!rawData.length) { alert(t('nothingToSave')); return; }
    closeAppMenu();
    $('share-modal').style.display = 'flex';
  }
  function chooseShare(viewOnly) {
    $('share-modal').style.display = 'none';
    shareTripLink(viewOnly);
  }

  function enterViewOnly() {
    VIEW_ONLY = true;
    clearTimeout(autosaveTimer);
    document.documentElement.classList.add('view-only');
    const b = $('view-banner');
    if (b) b.style.display = 'flex';
  }
  function keepSharedCopy() {
    if (!confirm(t('keepCopyConfirm'))) return;
    VIEW_ONLY = false;
    document.documentElement.classList.remove('view-only');
    $('view-banner').style.display = 'none';
    TRIP.cloudId = null;
    renderItinerary();
    scheduleAutosave();
    showToast(t('copyKept'), { ms: 2500 });
  }
  function backToMyTrip() { location.reload(); }
