  /* =========================================================
     BOOKINGS AND SPENDING: a confirmation number / link per stop, and what you actually spent
     ========================================================= */
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }

  function costChipHtml(item) {
    const planned = typeof item.cost === 'number', spent = typeof item.spent === 'number';
    if (!planned && !spent) return '';
    const over = planned && spent && item.spent > item.cost;
    const text = spent ? (planned ? t('spentOf', { a: fmtItem(item.spent, item), b: fmtItem(item.cost, item) }) : t('spentX', { a: fmtItem(item.spent, item) })) : fmtItem(item.cost, item);
    return `<span class="cost-chip ${spent ? 'spent' : ''} ${over ? 'over' : ''}" title="${escapeHtml(t('spentHint'))}"><i class="fa-solid ${spent ? 'fa-receipt' : 'fa-wallet'}"></i> ${escapeHtml(text)}</span>`;
  }

  function bookingChipHtml(item) {
    if (!item.bookingRef && !item.bookingUrl) return '';
    const url = safeUrl(item.bookingUrl);
    const label = item.bookingRef || t('booking');
    return url
      ? `<a class="booking-chip" href="${escapeHtml(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${escapeHtml(t('openBooking'))}"><i class="fa-solid fa-ticket"></i> ${escapeHtml(label)}</a>`
      : `<span class="booking-chip" onclick="event.stopPropagation(); copyBookingRef(${item.id})" title="${escapeHtml(t('copyRef'))}"><i class="fa-solid fa-ticket"></i> ${escapeHtml(label)}</span>`;
  }

  function copyBookingRef(id) {
    const item = rawData.find(s => s.id === id);
    if (!item || !item.bookingRef) return;
    try { navigator.clipboard.writeText(item.bookingRef).then(() => showToast(t('refCopied'), { ms: 1800 })).catch(() => {}); } catch (e) {}
  }

  // Shown on the Today card
  function todayBookingHtml(s) {
    if (!s || (!s.bookingRef && !s.bookingUrl)) return '';
    const url = safeUrl(s.bookingUrl);
    return `<div class="tp-booking"><i class="fa-solid fa-ticket"></i> <span>${escapeHtml(t('booking'))}${s.bookingRef ? `: <b>${escapeHtml(s.bookingRef)}</b>` : ''}</span>
      ${s.bookingRef ? `<button class="tp-mini" onclick="event.stopPropagation(); copyBookingRef(${s.id})">${escapeHtml(t('copy'))}</button>` : ''}
      ${url ? `<a class="tp-mini" href="${escapeHtml(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(t('open'))} ↗</a>` : ''}</div>`;
  }

  function spendSummaryHtml() {
    const spent = tripSpent(), planned = tripCost();
    if (!spent) return '';
    return `<span class="${planned && spent > planned ? 'ts-over' : ''}"><i class="fa-solid fa-receipt"></i> ${escapeHtml(planned ? t('spentOf', { a: fmtMoney(spent), b: fmtMoney(planned) }) : t('spentX', { a: fmtMoney(spent) }))}</span>`;
  }
