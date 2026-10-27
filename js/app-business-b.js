async function initComparisonPage() {
  const data = await loadData();
  let { categories, products, disabledCategories, meta } = data;
  disabledCategories = disabledCategories || [];
  meta = meta || {};

  const categorySelect = document.getElementById('categorySelect');
  const selectA = document.getElementById('productA');
  const competitorsBox = document.getElementById('competitorsCheckboxes');
  const resultEl = document.getElementById('comparisonResult');
  const emptyEl = document.getElementById('emptyState');
  let viewMode = 'battle';

  if (!selectA) return;

  const freshIso = computeGlobalPriceUpdate(products, meta);
  const freshBar = document.getElementById('freshnessBar');
  const freshText = document.getElementById('freshnessText');
  if (freshBar && freshText) {
    if (freshIso) {
      freshBar.hidden = false;
      const h = hoursSince(freshIso);
      let cls = 'fresh-ok';
      let extra = '';
      if (h != null && h > 72) { cls = 'fresh-stale'; extra = ' · توصیه: امروز از داشبورد به‌روز کنید'; }
      else if (h != null && h > 24) { cls = 'fresh-warn'; extra = ' · بیش از یک روز از به‌روزرسانی گذشته'; }
      freshBar.className = 'freshness-bar ' + cls;
      freshText.textContent = 'آخرین به‌روزرسانی قیمت: ' + formatLastUpdate(freshIso) + extra;
    } else {
      freshBar.hidden = false;
      freshBar.className = 'freshness-bar fresh-stale';
      freshText.textContent = 'هنوز به‌روزرسانی قیمت ثبت نشده · از داشبورد «به‌روزرسانی همه قیمت‌ها» را بزنید';
    }
  }

  categories.forEach(function (cat) {
    if ((disabledCategories || []).indexOf(cat) >= 0) return;
    categorySelect.innerHTML += '<option value="' + cat + '">' + cat + '</option>';
  });

  function getOwnProducts() {
    const cat = categorySelect.value;
    return products.filter(function (p) {
      if (!isOurBrand(p)) return false;
      if (cat && p.category !== cat) return false;
      return true;
    });
  }

  function getAvailableCompetitors(mainId) {
    const main = products.find(function (p) { return p.id === mainId; });
    if (!main) return [];
    const cat = categorySelect.value || main.category || '';
    const linkedIds = main.competitors || [];
    const linked = linkedIds.map(function (id) {
      return products.find(function (p) { return p.id === id; });
    }).filter(Boolean);
    const others = products.filter(function (p) {
      if (p.id === mainId) return false;
      if (isOurBrand(p)) return false;
      if (linkedIds.indexOf(p.id) >= 0) return false;
      if (cat && p.category && p.category !== cat) return false;
      return true;
    });
    const linkedRivals = linked.filter(function (p) { return !isOurBrand(p); });
    return linkedRivals.concat(others);
  }

  function populateMainProducts() {
    const list = getOwnProducts();
    selectA.innerHTML = '<option value="">انتخاب محصول اسنوا / دوو...</option>';
    list.forEach(function (p) {
      selectA.innerHTML += '<option value="' + p.id + '">' +
        (p.brand ? p.brand + ' · ' : '') + p.name + '</option>';
    });
    competitorsBox.innerHTML = '<span class="hint">اول محصول برند ما را انتخاب کن</span>';
    const badge = document.getElementById('compCountBadge');
    if (badge) badge.hidden = true;
    resultEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }

  function updateCompCount() {
    const n = getSelectedCompetitors().length;
    const badge = document.getElementById('compCountBadge');
    if (!badge) return;
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = n + ' انتخاب‌شده';
    } else badge.hidden = true;
  }

  function populateCompetitors() {
    const mainId = selectA.value;
    if (!mainId) {
      competitorsBox.innerHTML = '<span class="hint">اول محصول برند ما را انتخاب کن</span>';
      return;
    }
    const comps = getAvailableCompetitors(mainId);
    if (comps.length === 0) {
      competitorsBox.innerHTML = '<span class="hint">رقیبی در این دسته ثبت نشده · از داشبورد رقیب اضافه کنید</span>';
      resultEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }
    const main = products.find(function (p) { return p.id === mainId; });
    const linked = new Set((main.competitors || []).filter(function (id) {
      const p = products.find(function (x) { return x.id === id; });
      return p && !isOurBrand(p);
    }));
    const defaultSelected = linked.size > 0 ? linked : new Set(comps.slice(0, 3).map(function (p) { return p.id; }));

    competitorsBox.innerHTML = comps.map(function (p) {
      const checked = defaultSelected.has(p.id) ? 'selected' : '';
      const label = (p.brand ? p.brand + ' · ' : '') + (p.name.length > 32 ? p.name.substring(0, 32) + '…' : p.name);
      return '<label class="competitor-chip ' + checked + '" data-id="' + p.id + '">' +
        '<input type="checkbox" value="' + p.id + '"' + (checked ? ' checked' : '') + '> ' + label +
        '</label>';
    }).join('');

    competitorsBox.querySelectorAll('.competitor-chip').forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        const cb = chip.querySelector('input');
        cb.checked = !cb.checked;
        chip.classList.toggle('selected', cb.checked);
        updateCompCount();
        renderComparison();
      });
    });
    updateCompCount();
    renderComparison();
  }

  function getSelectedCompetitors() {
    return Array.prototype.map.call(
      competitorsBox.querySelectorAll('input:checked'),
      function (cb) { return cb.value; }
    );
  }

  function renderBattleCard(main, comps, allKeys) {
    const points = buildBattlePoints(main, comps, allKeys);
    const script = buildSalesScript(main, comps, points);
    let rivalsHtml = comps.map(function (c) {
      return '<div class="battle-rival">' +
        '<img src="' + (c.image || 'https://via.placeholder.com/64?text=') + '" alt="" onerror="this.style.display=\'none\'">' +
        '<div><strong>' + (c.brand || '') + '</strong><div class="muted">' + c.name + '</div>' +
        '<div class="battle-price">' + formatPrice(c.price) + '</div></div></div>';
    }).join('');

    return '<div class="battle-card" id="battleCard">' +
      '<div class="battle-head">' +
        '<div class="battle-ours">' +
          '<span class="battle-tag">برند ما</span>' +
          '<img src="' + (main.image || 'https://via.placeholder.com/100?text=') + '" alt="" onerror="this.style.display=\'none\'">' +
          '<h3>' + main.name + '</h3>' +
          '<div class="battle-brand">' + (main.brand || '') + '</div>' +
          '<div class="battle-price main">' + formatPrice(main.price) + '</div>' +
        '</div>' +
        '<div class="battle-vs">در برابر</div>' +
        '<div class="battle-rivals">' + rivalsHtml + '</div>' +
      '</div>' +
      '<h4 class="battle-section-title">نقاط تمایز برای فروش</h4>' +
      '<ol class="battle-points">' +
        points.map(function (pt) {
          return '<li><strong>' + pt.title + '</strong><span>' + pt.detail + '</span></li>';
        }).join('') +
      '</ol>' +
      '<div class="battle-script">' +
        '<div class="battle-script-label">پیشنهاد جمله فروش</div>' +
        '<p>' + script + '</p>' +
      '</div>' +
    '</div>';
  }

  function renderComparison() {
    const mainId = selectA.value;
    const compIds = getSelectedCompetitors();
    if (!mainId || compIds.length === 0) {
      resultEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }
    const main = products.find(function (p) { return p.id === mainId; });
    const comps = compIds.map(function (id) {
      return products.find(function (p) { return p.id === id; });
    }).filter(Boolean);
    if (!main || comps.length === 0) return;

    emptyEl.classList.add('hidden');
    resultEl.classList.remove('hidden');

    const all = [main].concat(comps);
    const colCount = all.length;

    const allKeys = [];
    const keySet = {};
    all.forEach(function (p) {
      Object.keys(p.features || {}).forEach(function (k) {
        if (!keySet[k]) { keySet[k] = true; allKeys.push(k); }
      });
    });

    let headCells = '<th class="feat-col">ویژگی</th>';
    all.forEach(function (p, idx) {
      const last = formatLastUpdate(p.lastPriceUpdate);
      const hasDk = !!(p.digikalaUrl && typeof extractDkpId === 'function' && extractDkpId(p.digikalaUrl));
      const ours = isOurBrand(p);
      const removeAttr = idx === 0
        ? 'data-remove="main"'
        : 'data-remove="comp" data-id="' + p.id + '"';
      headCells +=
        '<th class="product-col">' +
          '<div class="cmp-head">' +
            '<button type="button" class="cmp-remove" ' + removeAttr + ' title="حذف از مقایسه">×</button>' +
            '<div class="cmp-img-wrap">' +
              '<img class="cmp-img" src="' + (p.image || 'https://via.placeholder.com/120?text=No+Image') + '" alt="" onerror="this.src=\'https://via.placeholder.com/120?text=No+Image\'">' +
            '</div>' +
            '<div class="cmp-name">' + p.name + '</div>' +
            (p.brand ? '<div class="cmp-brand' + (ours ? ' ours' : '') + '">' + p.brand + (ours ? ' · برند ما' : ' · رقیب') + '</div>' : '') +
            '<div class="cmp-price">' + formatPrice(p.price) + '</div>' +
            (last ? '<div class="cmp-updated">به‌روز: ' + last + '</div>' : '') +
            (hasDk
              ? '<button type="button" class="btn-history" data-dk="' + p.digikalaUrl + '" data-name="' + String(p.name).replace(/"/g, '"') + '" title="تاریخچه قیمت">📈 تاریخچه</button>'
              : '') +
            (p.digikalaUrl ? '<a class="cmp-link" href="' + p.digikalaUrl + '" target="_blank" rel="noopener">دیجی‌کالا ↗</a>' : '') +
          '</div>' +
        '</th>';
    });

    let bodyRows = '';
    allKeys.forEach(function (key) {
      const values = all.map(function (p) { return (p.features && p.features[key]) || '—'; });
      const numOwn = parseFloat(String(values[0]).replace(/[^\d.]/g, ''));
      const isWeight = key.indexOf('وزن') >= 0 || key.toLowerCase().indexOf('weight') >= 0;
      bodyRows += '<tr><td class="feat-col">' + key + '</td>';
      values.forEach(function (val, i) {
        let cls = 'equal';
        if (i > 0) {
          const num = parseFloat(String(val).replace(/[^\d.]/g, ''));
          if (!isNaN(numOwn) && !isNaN(num) && numOwn !== num) {
            if (isWeight) cls = num < numOwn ? 'better' : 'worse';
            else cls = num > numOwn ? 'better' : 'worse';
          }
        }
        bodyRows += '<td class="' + cls + '">' + val + '</td>';
      });
      bodyRows += '</tr>';
    });

    const battleHtml = renderBattleCard(main, comps, allKeys);

    resultEl.innerHTML =
      '<div class="compare-toolbar">' +
        '<div class="left">' +
          '<span class="compare-meta">' + colCount + ' محصول · ' +
            (viewMode === 'battle' ? 'نمای فروش' : 'جدول کامل') + '</span>' +
          '<span class="legend-inline"><i class="lg better"></i> بهتر از ما برای رقیب &nbsp;<i class="lg worse"></i> ضعیف‌تر</span>' +
        '</div>' +
        '<div class="right">' +
          '<div class="view-toggle" role="group" aria-label="حالت نمایش">' +
            '<button type="button" class="btn btn-sm ' + (viewMode === 'battle' ? 'btn-primary' : 'btn-outline') + '" data-view="battle">نمای فروش</button>' +
            '<button type="button" class="btn btn-sm ' + (viewMode === 'full' ? 'btn-primary' : 'btn-outline') + '" data-view="full">جدول کامل</button>' +
          '</div>' +
          '<button type="button" class="btn btn-outline btn-sm" id="btnExportPdf">📄 PDF فروش</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="btnAiAnalysis">🧭 ناظر برند</button>' +
        '</div>' +
      '</div>' +
      '<div id="battleWrap" class="' + (viewMode === 'battle' ? '' : 'hidden') + '">' + battleHtml + '</div>' +
      '<div id="fullWrap" class="compare-table-wrap ' + (viewMode === 'full' ? '' : 'hidden') + '">' +
        '<table class="compare-table" id="compareTable" style="--product-cols:' + colCount + '">' +
          '<thead><tr>' + headCells + '</tr></thead>' +
          '<tbody>' + bodyRows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div id="aiAnalysisBox" class="ai-box hidden"></div>' +
      '<div id="priceHistoryModal" class="modal-overlay">' +
        '<div class="modal" style="max-width:520px">' +
          '<div class="modal-header"><h3 id="phTitle">تاریخچه قیمت</h3><button class="modal-close" id="phClose">×</button></div>' +
          '<div class="modal-body" id="phBody">در حال بارگذاری...</div>' +
        '</div>' +
      '</div>';

    resultEl.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        viewMode = btn.getAttribute('data-view');
        renderComparison();
      });
    });

    resultEl.querySelectorAll('.cmp-remove').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const kind = btn.getAttribute('data-remove');
        if (kind === 'main') {
          selectA.value = '';
          competitorsBox.innerHTML = '<span class="hint">اول محصول برند ما را انتخاب کن</span>';
          resultEl.classList.add('hidden');
          emptyEl.classList.remove('hidden');
          return;
        }
        const id = btn.getAttribute('data-id');
        const chip = competitorsBox.querySelector('input[value="' + id + '"]');
        if (chip) {
          chip.checked = false;
          const label = chip.closest('.competitor-chip');
          if (label) label.classList.remove('selected');
        }
        updateCompCount();
        renderComparison();
      });
    });

    resultEl.querySelectorAll('.btn-history').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openPriceHistory(btn.getAttribute('data-dk'), btn.getAttribute('data-name'));
      });
    });

    const phClose = document.getElementById('phClose');
    if (phClose) {
      phClose.onclick = function () {
        document.getElementById('priceHistoryModal').classList.remove('open');
      };
    }

    const pdfBtn = document.getElementById('btnExportPdf');
    if (pdfBtn) {
      pdfBtn.onclick = function () {
        const prev = viewMode;
        viewMode = 'battle';
        renderComparison();
        setTimeout(function () { window.print(); viewMode = prev; renderComparison(); }, 200);
      };
    }

    const aiBtn = document.getElementById('btnAiAnalysis');
    if (aiBtn) {
      aiBtn.onclick = function () {
        if (typeof runOnPageAiAnalysis === 'function') runOnPageAiAnalysis(all, allKeys);
        else if (typeof window.showAiAnalysis === 'function') window.showAiAnalysis(all, allKeys);
      };
    }
  }

  async function openPriceHistory(dkUrl, name) {
    const modal = document.getElementById('priceHistoryModal');
    const body = document.getElementById('phBody');
    const title = document.getElementById('phTitle');
    if (!modal || !body) return;
    title.textContent = 'قیمت و روند · ' + (name || '');
    body.innerHTML = '<p style="color:var(--text-muted)">در حال دریافت از دیجی‌کالا...</p>';
    modal.classList.add('open');
    try {
      const id = extractDkpId(dkUrl);
      if (!id) throw new Error('آیدی محصول پیدا نشد');
      let chart = null;
      try { chart = await mcpCall('product_price_chart', { id: id }); } catch (e) { console.warn(e); }
      const hasSeries = chart && Array.isArray(chart.series) && chart.series.length > 0 &&
        chart.series.some(function (s) { return (s.points || []).length > 0; });
      let html = '';
      if (hasSeries) {
        if (chart.current_price_toman) html += '<p><strong>قیمت فعلی:</strong> ' + formatPrice(chart.current_price_toman) + '</p>';
        chart.series.forEach(function (s) {
          html += '<h4 style="margin:12px 0 6px">' + (s.color || s.title || 'سری') + '</h4><ul class="price-history-list">';
          (s.points || []).slice(-20).reverse().forEach(function (pt) {
            html += '<li><span>' + (pt.day || pt.date || '') + '</span><strong>' + formatPrice(pt.price_toman || pt.price) + '</strong></li>';
          });
          html += '</ul>';
        });
      } else {
        const details = await mcpCall('product_details', { id: id, include_specs: false, include_comments: 0 });
        html += '<div class="price-summary">';
        if (details.price_toman) html += '<p><strong>قیمت فعلی:</strong> ' + formatPrice(details.price_toman) + '</p>';
        if (details.lowest_price_30d_toman) html += '<p><strong>کمترین ۳۰ روز:</strong> ' + formatPrice(details.lowest_price_30d_toman) + '</p>';
        html += '</div>';
        html += '<p style="margin-top:14px;font-size:0.85rem;color:var(--text-muted)">نمودار در <a href="' + (details.url || dkUrl) + '" target="_blank" rel="noopener">دیجی‌کالا</a>.</p>';
      }
      body.innerHTML = html;
    } catch (err) {
      body.innerHTML = '<p style="color:#c00">' + (err.message || 'خطا') + '</p>';
    }
  }

  categorySelect.addEventListener('change', populateMainProducts);
  selectA.addEventListener('change', populateCompetitors);
  populateMainProducts();
}
