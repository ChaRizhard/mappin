  /* =========================================================
     SAMPLE TRIP: lets new testers see everything without a CSV
     ========================================================= */
  function nextSaturdayIso(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + offset);
    return isoFromDate(d);
  }

  function loadSampleTrip() {
    if (rawData.length && !confirm(t('importReplaceConfirm'))) return;
    const d1 = nextSaturdayIso(0), d2 = nextSaturdayIso(1);
    const row = (day, date, time, name, cat, lat, lng, address, notes, cost, stay, fixed) =>
      ({ Name: name, Day: `Day ${day}`, Date: date, Time: time, Category: cat, Latitude: lat, Longitude: lng, Address: address, Notes: notes, Cost: cost, 'Stay (min)': stay, 'Fixed time': fixed ? 'yes' : '' });
    const rows = [
      row(1, d1, '09:00', 'Senso-ji Temple', 'Sight', 35.7148, 139.7967, '2-3-1 Asakusa, Taito City, Tokyo', "Tokyo's oldest temple. Go early to beat the crowds.", '', 60),
      row(1, d1, '10:15', 'Nakamise Shopping Street', 'Shopping', 35.7118, 139.7963, 'Asakusa, Taito City, Tokyo', 'Snacks and souvenirs on the way to the temple.', 20, 45),
      row(1, d1, '12:00', 'Tokyo Skytree', 'Sight', 35.7101, 139.8107, '1-1-2 Oshiage, Sumida City, Tokyo', 'Booked observation deck slot.', 35, 90, true),
      row(1, d1, '14:30', 'Ueno Park', 'Nature', 35.7148, 139.7731, 'Uenokoen, Taito City, Tokyo', 'Walk around Shinobazu Pond.', '', 75),
      row(1, d1, '18:00', 'Ameya-Yokocho', 'Food', 35.7105, 139.7745, 'Ueno 4-chome, Taito City, Tokyo', 'Street food for dinner.', 25, 60),
      row(2, d2, '09:30', 'Meiji Jingu', 'Sight', 35.6764, 139.6993, '1-1 Yoyogikamizonocho, Shibuya City, Tokyo', 'Forest shrine next to Harajuku.', '', 60),
      row(2, d2, '11:00', 'Takeshita Street', 'Shopping', 35.6716, 139.7029, 'Jingumae, Shibuya City, Tokyo', 'Crepes and fashion.', 30, 60),
      row(2, d2, '13:00', 'Shibuya Crossing', 'Sight', 35.6595, 139.7005, 'Shibuya City, Tokyo', "The world's busiest crossing.", '', 30),
      row(2, d2, '16:30', 'Shibuya Sky', 'Sight', 35.6584, 139.7023, '2-24-12 Shibuya, Shibuya City, Tokyo', 'Sunset slot booked.', 30, 60, true),
      row(2, d2, '19:00', 'Omoide Yokocho', 'Food', 35.6933, 139.6996, '1-2 Nishishinjuku, Shinjuku City, Tokyo', 'Tiny yakitori bars.', 30, 75)
    ];
    processParsedData(rows);
    DAY_TITLES = { 1: t('sampleDay1'), 2: t('sampleDay2') };
    TRIP = { cloudId: null, title: t('sampleTitle') };
    if (!CHECKLIST.length) CHECKLIST = [
      { id: 'cs1', text: t('sampleCk1'), kind: 'pack', day: null, done: false },
      { id: 'cs2', text: t('sampleCk2'), kind: 'ticket', day: null, done: false },
      { id: 'cs3', text: t('sampleCk3'), kind: 'ticket', day: 1, done: true },
      { id: 'cs4', text: t('sampleCk4'), kind: 'book', day: 2, done: false }];
    populateFilters();
    renderItinerary();
    showToast(t('sampleLoaded'), { ms: 6000 });
  }

  function startPlanning() {
    if (!getAllDays().length) addDayAtEnd();
    const input = $('search-input');
    if (isPortraitPhone()) setSheet('mid');
    setTimeout(() => input.focus(), 250);
  }

  /* =========================================================
     CATEGORY CHIPS (replace the category dropdown)
     ========================================================= */
  function renderCategoryChips() {
    const box = $('cat-chips');
    if (!box) return;
    const sel = $('category-select');
    const counts = {};
    rawData.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1; });
    const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, LANG));
    const cur = sel.value;
    box.innerHTML = `<button class="cat-chip ${cur === 'all' ? 'active' : ''}" onclick="setCategory('all')">${escapeHtml(t('allCats'))}</button>` +
      cats.map(c => `<button class="cat-chip ${cur === c ? 'active' : ''}" data-cat="${escapeHtml(c)}" onclick="setCategory(this.dataset.cat)"><i class="fa-solid ${categoryIcon(c)}"></i> ${escapeHtml(c)} <small>${counts[c]}</small></button>`).join('');
    box.parentElement.style.display = cats.length ? '' : 'none';
  }

  function setCategory(c) {
    const sel = $('category-select');
    sel.value = [...sel.options].some(o => o.value === c) ? c : 'all';
    renderCategoryChips();
    renderItinerary();
    if (typeof updateFilterBadge === 'function') updateFilterBadge();
  }
