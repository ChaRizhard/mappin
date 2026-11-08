  /* =========================================================
     1.4.1: Expenses: planned vs spent for the whole trip, by day and by category,
     with an optional trip budget. Everything is shown in your home currency.
     ========================================================= */
  let expensesTab = 'days';

  function openExpenses() {
    closeMenus(); closeAppMenu();
    if (needsConversion()) refreshRates();
    renderExpenses();
    $('expenses-modal').style.display = 'flex';
  }
  function closeExpenses() { $('expenses-modal').style.display = 'none'; }
  function setExpensesTab(tab) { expensesTab = tab; renderExpenses(); }

  function setTripBudget(v) {
    const n = parseCost(v);
    if (typeof n === 'number' && n > 0) TRIP.budget = n; else delete TRIP.budget;
    scheduleAutosave(); recordHistory();
    renderExpenses();
  }

  function expenseRows(list) {
    return {
      planned: sumHome(list.filter(s => typeof s.cost === 'number'), 'cost'),
      spent: sumHome(list.filter(s => typeof s.spent === 'number'), 'spent'),
      n: list.length
    };
  }

  // A thin bar: the planned amount as the track, what's spent filled in (red past the plan)
  function expenseBar(spent, planned, max) {
    const scale = Math.max(max, 1);
    const pw = Math.round(Math.min(planned, scale) / scale * 100), sw = Math.round(Math.min(spent, scale) / scale * 100);
    return `<div class="ex-bar"><span class="ex-plan" style="width:${pw}%"></span><span class="ex-spent ${planned && spent > planned ? 'over' : ''}" style="width:${sw}%"></span></div>`;
  }

  function expenseLine(label, icon, r, max, onclick) {
    const left = r.planned - r.spent;
    return `<div class="ex-row" ${onclick ? `role="button" tabindex="0" onclick="${onclick}"` : ''}>
      <div class="ex-row-top">
        <span class="ex-name">${icon ? `<i class="fa-solid ${icon}"></i> ` : ''}${escapeHtml(label)}</span>
        <span class="ex-nums"><b>${escapeHtml(fmtMoney(r.spent))}</b> <span>/ ${escapeHtml(fmtMoney(r.planned))}</span></span>
      </div>
      ${expenseBar(r.spent, r.planned, max)}
      ${r.planned && r.spent > r.planned ? `<div class="ex-note over">${escapeHtml(t('exOverBy', { a: fmtMoney(r.spent - r.planned) }))}</div>`
        : r.planned && r.spent ? `<div class="ex-note">${escapeHtml(t('exLeft', { a: fmtMoney(left) }))}</div>` : ''}
    </div>`;
  }

  function renderExpenses() {
    const body = $('expenses-body');
    if (!body) return;
    const all = expenseRows(rawData);
    const budget = typeof TRIP.budget === 'number' ? TRIP.budget : 0;
    const costed = rawData.filter(s => typeof s.cost === 'number' || typeof s.spent === 'number');
    let head = `
      <div class="ex-totals">
        <div><span>${escapeHtml(t('exPlanned'))}</span><b>${escapeHtml(fmtMoney(all.planned))}</b></div>
        <div><span>${escapeHtml(t('spentLabel'))}</span><b class="${all.planned && all.spent > all.planned ? 'over' : ''}">${escapeHtml(fmtMoney(all.spent))}</b></div>
        <div><span>${escapeHtml(budget ? t('exBudgetLeft') : t('exStillToSpend'))}</span><b class="${budget && all.spent > budget ? 'over' : ''}">${escapeHtml(fmtMoney(Math.max(0, (budget || all.planned) - all.spent)))}</b></div>
      </div>`;
    if (budget) {
      const pct = Math.round(all.spent / budget * 100);
      head += `<div class="ex-budget">${expenseBar(all.spent, budget, Math.max(budget, all.spent))}
        <div class="ex-note ${all.spent > budget ? 'over' : ''}">${escapeHtml(t('exBudgetUsed', { n: pct, b: fmtMoney(budget) }))}${all.planned > budget ? ' · ' + escapeHtml(t('exPlanOverBudget', { a: fmtMoney(all.planned - budget) })) : ''}</div></div>`;
    }
    head += `<label class="ex-budget-input"><span>${escapeHtml(t('exTripBudget'))} (${escapeHtml(CURRENCY)})</span>
      <input class="edit-form-input" inputmode="decimal" placeholder="${escapeHtml(t('exBudgetPh'))}" value="${budget ? escapeHtml(String(budget)) : ''}" onchange="setTripBudget(this.value)"></label>`;

    const tabs = [['days', t('sectionDays')], ['cats', t('category')], ['stops', t('exStops')]];
    let list = '';
    if (!costed.length) {
      list = `<p class="settings-note ex-empty">${escapeHtml(t('exEmpty'))}</p>`;
    } else if (expensesTab === 'days') {
      const days = getAllDays().map(d => ({ d, r: expenseRows(rawData.filter(s => s.day === d)) })).filter(x => x.r.planned || x.r.spent);
      const max = Math.max(...days.map(x => Math.max(x.r.planned, x.r.spent)));
      list = days.map(x => expenseLine(getDayTitle(x.d), null, x.r, max, `closeExpenses(); setDayChip(${x.d})`)).join('');
    } else if (expensesTab === 'cats') {
      const cats = {};
      costed.forEach(s => { const c = s.category || t('category'); (cats[c] = cats[c] || []).push(s); });
      const rows = Object.keys(cats).map(c => ({ c, r: expenseRows(cats[c]) })).sort((a, b) => Math.max(b.r.planned, b.r.spent) - Math.max(a.r.planned, a.r.spent));
      const max = Math.max(...rows.map(x => Math.max(x.r.planned, x.r.spent)));
      list = rows.map(x => expenseLine(x.c, categoryIcon(x.c), x.r, max)).join('');
    } else {
      const rows = costed.slice().sort((a, b) => (toHome(b.spent ?? b.cost, itemCurrency(b)) || 0) - (toHome(a.spent ?? a.cost, itemCurrency(a)) || 0));
      list = rows.map(s => {
        const other = itemCurrency(s) !== CURRENCY;
        const plannedTxt = typeof s.cost === 'number' ? fmtItem(s.cost, s) : '–';
        const spentTxt = typeof s.spent === 'number' ? fmtItem(s.spent, s) : '–';
        const over = typeof s.cost === 'number' && typeof s.spent === 'number' && s.spent > s.cost;
        return `<div class="ex-stop" role="button" tabindex="0" onclick="closeExpenses(); openSingleStopModal(${s.id})">
          <i class="fa-solid ${categoryIcon(s.category)}"></i>
          <div class="ex-stop-main"><div class="ex-stop-name">${escapeHtml(s.cleanTitle || s.title)}</div><div class="ex-stop-day">${escapeHtml(getDayTitle(s.day))}${other ? ` · ${escapeHtml(itemCurrency(s))}` : ''}</div></div>
          <div class="ex-stop-nums"><b class="${over ? 'over' : ''}">${escapeHtml(spentTxt)}</b><span>${escapeHtml(plannedTxt)}</span></div>
        </div>`;
      }).join('');
    }
    const ratesNote = needsConversion() ? `<p class="settings-note ex-rates">${escapeHtml(t('exConverted', { c: CURRENCY }))}</p>` : '';
    body.innerHTML = `${head}
      <div class="ex-tabs">${tabs.map(([k, l]) => `<button class="ex-tab ${expensesTab === k ? 'on' : ''}" onclick="setExpensesTab('${k}')">${escapeHtml(l)}</button>`).join('')}</div>
      <div class="ex-legend"><span><i class="ex-dot spent"></i>${escapeHtml(t('spentLabel'))}</span><span><i class="ex-dot plan"></i>${escapeHtml(t('exPlanned'))}</span></div>
      <div class="ex-list">${list}</div>${ratesNote}`;
  }
