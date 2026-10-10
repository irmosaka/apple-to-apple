const STORAGE_KEY = 'appleToApple_data_v2';

async function loadData() {
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) {
    try { return JSON.parse(local); } catch (e) {
      console.warn('localStorage corrupt, loading from file');
    }
  }
  try {
    const res = await fetch('data/products.json');
    const data = await res.json();
    return { categories: data.categories || [], products: data.products || [] };
  } catch (e) {
    console.error('Failed to load products.json', e);
    return { categories: [], products: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function formatPrice(price) {
  if (!price && price !== 0) return '—';
  return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
}

function formatLastUpdate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));
  } catch (e) { return ''; }
}

async function initComparisonPage() {
  const data = await loadData();
  let { categories, products } = data;

  const categorySelect = document.getElementById('categorySelect');
  const selectA = document.getElementById('productA');
  const competitorsBox = document.getElementById('competitorsCheckboxes');
  const resultEl = document.getElementById('comparisonResult');
  const emptyEl = document.getElementById('emptyState');

  if (!selectA) return;

  categories.forEach(cat => {
    categorySelect.innerHTML += '<option value="' + cat + '">' + cat + '</option>';
  });

  function getFilteredProducts() {
    const cat = categorySelect.value;
    return products.filter(p => !cat || p.category === cat);
  }

  function getAvailableOthers(mainId) {
    const main = products.find(p => p.id === mainId);
    if (!main) return [];
    const cat = categorySelect.value || main.category || '';
    const linkedIds = main.competitors || [];
    const linked = linkedIds.map(id => products.find(p => p.id === id)).filter(Boolean);
    const others = products.filter(p => {
      if (p.id === mainId) return false;
      if (linkedIds.indexOf(p.id) >= 0) return false;
      if (cat && p.category && p.category !== cat) return false;
      if (cat && !p.category) return false;
      return true;
    });
    return linked.concat(others);
  }

  function populateMainProducts() {
    const list = getFilteredProducts();
    selectA.innerHTML = '<option value="">انتخاب کنید...</option>';
    list.forEach(p => {
      selectA.innerHTML += '<option value="' + p.id + '">' + p.name + '</option>';
    });
    competitorsBox.innerHTML = '<span class="hint">اول محصول اصلی را انتخاب کن</span>';
    resultEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }

  function populateCompetitors() {
    const mainId = selectA.value;
    if (!mainId) {
      competitorsBox.innerHTML = '<span class="hint">اول محصول اصلی را انتخاب کن</span>';
      return;
    }
    const comps = getAvailableOthers(mainId);
    if (comps.length === 0) {
      competitorsBox.innerHTML = '<span class="hint">محصول دیگری برای مقایسه نیست</span>';
      return;
    }
    const main = products.find(p => p.id === mainId);
    const linked = new Set(main.competitors || []);
    const defaultSelected = linked.size > 0 ? linked : new Set(comps.slice(0, 4).map(p => p.id));

    competitorsBox.innerHTML = comps.map(p => {
      const checked = defaultSelected.has(p.id) ? 'selected' : '';
      const label = (p.brand ? p.brand + ' · ' : '') + (p.name.length > 32 ? p.name.substring(0, 32) + '…' : p.name);
      return '<label class="competitor-chip ' + checked + '" data-id="' + p.id + '">' +
        '<input type="checkbox" value="' + p.id + '"' + (checked ? ' checked' : '') + '> ' + label +
        '</label>';
    }).join('');

    competitorsBox.querySelectorAll('.competitor-chip').forEach(chip => {
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        const cb = chip.querySelector('input');
        cb.checked = !cb.checked;
        chip.classList.toggle('selected', cb.checked);
        renderComparison();
      });
    });
    renderComparison();
  }

  function getSelectedCompetitors() {
    return Array.prototype.map.call(
      competitorsBox.querySelectorAll('input:checked'),
      function (cb) { return cb.value; }
    );
  }

  function renderComparison() {
    const mainId = selectA.value;
    const compIds = getSelectedCompetitors();
    if (!mainId || compIds.length === 0) {
      resultEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }
    const main = products.find(p => p.id === mainId);
    const comps = compIds.map(id => products.find(p => p.id === id)).filter(Boolean);
    if (!main || comps.length === 0) return;

    emptyEl.classList.add('hidden');
    resultEl.classList.remove('hidden');

    const all = [main].concat(comps);
    const colCount = all.length;

    const allKeys = [];
    const keySet = {};
    all.forEach(p => {
      Object.keys(p.features || {}).forEach(k => {
        if (!keySet[k]) { keySet[k] = true; allKeys.push(k); }
      });
    });

    let headCells = '<th class="feat-col">ویژگی</th>';
    all.forEach(function (p) {
      const last = formatLastUpdate(p.lastPriceUpdate);
      const hasDk = !!(p.digikalaUrl && typeof extractDkpId === 'function' && extractDkpId(p.digikalaUrl));
      headCells +=
        '<th class="product-col">' +
          '<div class="cmp-head">' +
            '<img class="cmp-img" src="' + (p.image || 'https://via.placeholder.com/120?text=No+Image') + '" alt="" onerror="this.src=\'https://via.placeholder.com/120?text=No+Image\'">' +
            '<div class="cmp-name">' + p.name + '</div>' +
            (p.brand ? '<div class="cmp-brand">' + p.brand + '</div>' : '') +
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

    resultEl.innerHTML =
      '<div class="compare-toolbar">' +
        '<button type="button" class="btn btn-outline btn-sm" id="btnExportPdf">📄 خروجی PDF</button>' +
        '<button type="button" class="btn btn-primary btn-sm" id="btnAiAnalysis">✨ تحلیل هوشمند</button>' +
      '</div>' +
      '<div class="compare-table-wrap" id="comparePrintArea">' +
        '<table class="compare-table cols-' + Math.min(colCount, 5) + '">' +
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
    if (pdfBtn) pdfBtn.onclick = function () { window.print(); };

    const aiBtn = document.getElementById('btnAiAnalysis');
    if (aiBtn) aiBtn.onclick = function () { showAiAnalysis(all, allKeys); };
  }

  async function openPriceHistory(dkUrl, name) {
    const modal = document.getElementById('priceHistoryModal');
    const body = document.getElementById('phBody');
    const title = document.getElementById('phTitle');
    title.textContent = 'تاریخچه قیمت · ' + (name || '');
    body.innerHTML = '<p style="color:var(--text-muted)">در حال دریافت از دیجی‌کالا...</p>';
    modal.classList.add('open');
    try {
      const id = extractDkpId(dkUrl);
      if (!id) throw new Error('آیدی محصول پیدا نشد');
      const chart = await mcpCall('product_price_chart', { id: id });
      let html = '';
      if (chart.current_price_toman) {
        html += '<p><strong>قیمت فعلی:</strong> ' + formatPrice(chart.current_price_toman) + '</p>';
      }
      if (Array.isArray(chart.series) && chart.series.length) {
        chart.series.forEach(function (s) {
          html += '<h4 style="margin:12px 0 6px">' + (s.color || s.title || 'سری') +
            (s.cheapest_in_window_toman ? ' · کمینه: ' + formatPrice(s.cheapest_in_window_toman) : '') + '</h4>';
          html += '<ul class="price-history-list">';
          (s.points || []).slice(-15).reverse().forEach(function (pt) {
            html += '<li><span>' + (pt.day || pt.date || '') + '</span><strong>' +
              formatPrice(pt.price_toman || pt.price) + '</strong></li>';
          });
          html += '</ul>';
        });
      } else {
        html += '<p>تاریخچه قیمت در دسترس نیست.</p>';
      }
      body.innerHTML = html;
    } catch (err) {
      body.innerHTML = '<p style="color:#c00">' + (err.message || 'خطا') + '</p>';
    }
  }

  function showAiAnalysis(all, allKeys) {
    const box = document.getElementById('aiAnalysisBox');
    if (!box) return;
    let text = 'تحلیل مقایسه محصولات:\n\n';
    all.forEach(function (p, i) {
      text += (i + 1) + ') ' + p.name + (p.brand ? ' (' + p.brand + ')' : '') +
        ' — قیمت: ' + formatPrice(p.price) + '\n';
    });
    text += '\nتفاوت ویژگی‌ها:\n';
    allKeys.forEach(function (key) {
      const vals = all.map(function (p) { return (p.features && p.features[key]) || '—'; });
      const unique = {};
      vals.forEach(function (v) { unique[v] = true; });
      if (Object.keys(unique).length > 1) {
        text += '• ' + key + ': ' + vals.join(' | ') + '\n';
      }
    });
    text += '\nجمع‌بندی پیشنهادی:\n';
    let best = all[0];
    let bestScore = -1;
    all.forEach(function (p) {
      const featCount = Object.keys(p.features || {}).length;
      const price = p.price || 1e15;
      const score = featCount * 1000000 / Math.max(price, 1);
      if (score > bestScore) { bestScore = score; best = p; }
    });
    text += 'از نظر نسبت ویژگی به قیمت، «' + best.name + '» گزینه متوازن‌تری به نظر می‌رسد. ';
    text += 'برای تصمیم نهایی گارانتی، خدمات پس از فروش و نظرات خریداران را هم در نظر بگیرید.\n';

    box.classList.remove('hidden');
    box.innerHTML =
      '<div class="ai-box-header"><strong>✨ تحلیل هوشمند (محلی)</strong>' +
      '<button type="button" class="btn btn-outline btn-sm" id="btnCopyAi">کپی متن</button></div>' +
      '<pre class="ai-text">' + text.replace(/</g, '<') + '</pre>' +
      '<p class="ai-hint">این تحلیل بدون API خارجی ساخته شده. می‌توانی متن را کپی و در ChatGPT/Grok برای تحلیل عمیق‌تر بفرستی.</p>';

    const copyBtn = document.getElementById('btnCopyAi');
    if (copyBtn) {
      copyBtn.onclick = function () {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = 'کپی شد ✓';
          setTimeout(function () { copyBtn.textContent = 'کپی متن'; }, 2000);
        });
      };
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  categorySelect.addEventListener('change', populateMainProducts);
  selectA.addEventListener('change', populateCompetitors);
  populateMainProducts();
}
