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
    title.textContent = 'قیمت و روند · ' + (name || '');
    body.innerHTML = '<p style="color:var(--text-muted)">در حال دریافت از دیجی‌کالا...</p>';
    modal.classList.add('open');
    try {
      const id = extractDkpId(dkUrl);
      if (!id) throw new Error('آیدی محصول پیدا نشد');

      let chart = null;
      try {
        chart = await mcpCall('product_price_chart', { id: id });
      } catch (e) {
        console.warn('price_chart failed', e);
      }

      const hasSeries = chart && Array.isArray(chart.series) && chart.series.length > 0 &&
        chart.series.some(function (s) { return (s.points || []).length > 0; });
      const hasItems = chart && Array.isArray(chart.items) && chart.items.length > 0;
      const historyOk = hasSeries || hasItems || (chart && chart.history_available === true);

      let html = '';

      if (historyOk && hasSeries) {
        if (chart.current_price_toman) {
          html += '<p><strong>قیمت فعلی:</strong> ' + formatPrice(chart.current_price_toman) + '</p>';
        }
        chart.series.forEach(function (s) {
          html += '<h4 style="margin:12px 0 6px">' + (s.color || s.title || 'سری') +
            (s.cheapest_in_window_toman ? ' · کمینه: ' + formatPrice(s.cheapest_in_window_toman) : '') + '</h4>';
          html += '<ul class="price-history-list">';
          (s.points || []).slice(-20).reverse().forEach(function (pt) {
            html += '<li><span>' + (pt.day || pt.date || '') + '</span><strong>' +
              formatPrice(pt.price_toman || pt.price) + '</strong></li>';
          });
          html += '</ul>';
        });
      } else {
        const details = await mcpCall('product_details', {
          id: id, include_specs: false, include_comments: 0
        });
        html += '<div class="price-summary">';
        if (details.price_toman) {
          html += '<p><strong>قیمت فعلی:</strong> ' + formatPrice(details.price_toman) + '</p>';
        }
        if (details.price_before_toman) {
          html += '<p><strong>قبل از تخفیف:</strong> <span style="text-decoration:line-through;color:#888">' +
            formatPrice(details.price_before_toman) + '</span>';
          if (details.discount_percent) {
            html += ' <span style="color:#16a34a;font-weight:600">(' + details.discount_percent + '% تخفیف)</span>';
          }
          html += '</p>';
        }
        if (details.lowest_price_30d_toman) {
          html += '<p><strong>کمترین قیمت ۳۰ روز اخیر:</strong> ' +
            formatPrice(details.lowest_price_30d_toman) + '</p>';
          if (details.price_toman && details.lowest_price_30d_toman < details.price_toman) {
            const diff = details.price_toman - details.lowest_price_30d_toman;
            html += '<p style="color:#b45309;font-size:0.9rem">الان حدود ' +
              formatPrice(diff) + ' گران‌تر از کف ۳۰ روزه است.</p>';
          } else if (details.price_toman && details.lowest_price_30d_toman >= details.price_toman) {
            html += '<p style="color:#16a34a;font-size:0.9rem">قیمت نزدیک به کف ۳۰ روز اخیر است.</p>';
          }
        }
        if (details.cheaper_offer && details.cheaper_offer.price_toman) {
          html += '<p><strong>پیشنهاد ارزان‌تر:</strong> ' +
            formatPrice(details.cheaper_offer.price_toman) +
            (details.cheaper_offer.seller ? ' · ' + details.cheaper_offer.seller : '') +
            (details.cheaper_offer.saves_toman ? ' (صرفه‌جویی ' + formatPrice(details.cheaper_offer.saves_toman) + ')' : '') +
            '</p>';
        }
        html += '</div>';
        html += '<p style="margin-top:14px;font-size:0.85rem;color:var(--text-muted)">' +
          'نمودار روزبه‌روز تاریخچه موقتاً از سمت API دیجی‌کالا در دسترس نیست؛ ' +
          'خلاصه قیمت و کف ۳۰ روز از مشخصات محصول نمایش داده شد. ' +
          'نمودار کامل را در <a href="' + (details.url || dkUrl) + '" target="_blank" rel="noopener">صفحه دیجی‌کالا</a> ببین.</p>';
        if (chart && chart.message) {
          html += '<p style="font-size:0.75rem;color:#94a3b8">' + chart.message + '</p>';
        }
      }
      body.innerHTML = html;
    } catch (err) {
      body.innerHTML = '<p style="color:#c00">' + (err.message || 'خطا') + '</p>';
    }
  }

  function showAiAnalysis(all, allKeys) {
    const box = document.getElementById('aiAnalysisBox');
    if (!box) return;

    function numFrom(val) {
      if (val == null || val === '—') return NaN;
      const n = parseFloat(String(val).replace(/[^\d.]/g, ''));
      return isNaN(n) ? NaN : n;
    }

    const diffs = [];
    allKeys.forEach(function (key) {
      const vals = all.map(function (p) { return (p.features && p.features[key]) || '—'; });
      const uniq = {};
      vals.forEach(function (v) { uniq[v] = true; });
      if (Object.keys(uniq).length > 1) diffs.push({ key: key, vals: vals });
    });

    const byPrice = all.slice().filter(function (p) { return p.price > 0; })
      .sort(function (a, b) { return a.price - b.price; });
    const cheapest = byPrice[0];
    const expensive = byPrice[byPrice.length - 1];

    const winCounts = all.map(function () { return 0; });
    const weightKeys = /وزن|weight/i;
    diffs.forEach(function (d) {
      const nums = d.vals.map(numFrom);
      if (nums.every(function (n) { return !isNaN(n); })) {
        const isW = weightKeys.test(d.key);
        let best = 0;
        for (let i = 1; i < nums.length; i++) {
          if (isW ? nums[i] < nums[best] : nums[i] > nums[best]) best = i;
        }
        const sorted = nums.slice().sort(function (a, b) { return isW ? a - b : b - a; });
        if (sorted[0] !== sorted[1]) winCounts[best]++;
      }
    });

    let bestIdx = 0;
    for (let i = 1; i < winCounts.length; i++) {
      if (winCounts[i] > winCounts[bestIdx]) bestIdx = i;
    }

    let valueBest = all[0];
    let valueScore = -1;
    all.forEach(function (p) {
      const fc = Object.keys(p.features || {}).length;
      const pr = p.price || 1e15;
      const sc = fc * 1e6 / Math.max(pr, 1);
      if (sc > valueScore) { valueScore = sc; valueBest = p; }
    });

    let lines = [];
    lines.push('📊 تحلیل مقایسه (' + all.length + ' محصول)');
    lines.push('');
    lines.push('۱) معرفی کوتاه');
    all.forEach(function (p) {
      lines.push('  • ' + p.name + (p.brand ? ' | برند: ' + p.brand : '') +
        ' | قیمت: ' + formatPrice(p.price) +
        (p.category ? ' | دسته: ' + p.category : ''));
    });

    lines.push('');
    lines.push('۲) قیمت');
    if (cheapest && expensive && cheapest.id !== expensive.id) {
      lines.push('  • ارزان‌ترین: «' + cheapest.name + '» با ' + formatPrice(cheapest.price));
      lines.push('  • گران‌ترین: «' + expensive.name + '» با ' + formatPrice(expensive.price));
      const gap = expensive.price - cheapest.price;
      const pct = Math.round(gap * 100 / Math.max(cheapest.price, 1));
      lines.push('  • اختلاف قیمت: حدود ' + formatPrice(gap) + ' (حدود ' + pct + '٪)');
    } else {
      lines.push('  • قیمت‌ها نزدیک به هم هستند یا فقط یک محصول قیمت دارد.');
    }

    lines.push('');
    lines.push('۳) تفاوت‌های مهم مشخصات (' + diffs.length + ' مورد)');
    if (diffs.length === 0) {
      lines.push('  • مشخصات ثبت‌شده تقریباً یکسان است.');
    } else {
      diffs.slice(0, 12).forEach(function (d) {
        lines.push('  • ' + d.key + ':');
        d.vals.forEach(function (v, i) {
          lines.push('      – ' + (all[i].brand || all[i].name.substring(0, 20)) + ': ' + v);
        });
      });
      if (diffs.length > 12) lines.push('  • … و ' + (diffs.length - 12) + ' تفاوت دیگر');
    }

    lines.push('');
    lines.push('۴) امتیاز نسبی (بر اساس عددهای قابل‌مقایسه در مشخصات)');
    all.forEach(function (p, i) {
      lines.push('  • «' + p.name + '»: ' + winCounts[i] + ' برتری عددی');
    });

    lines.push('');
    lines.push('۵) جمع‌بندی و پیشنهاد');
    lines.push('  • از نظر ارزش (تعداد مشخصات نسبت به قیمت): «' + valueBest.name + '»');
    lines.push('  • از نظر برتری عددی مشخصات: «' + all[bestIdx].name + '»');
    if (cheapest) lines.push('  • اگر بودجه محدود است: «' + cheapest.name + '»');
    lines.push('  • نکته: گارانتی، خدمات پس از فروش، موجودی و نظرات واقعی خریداران را هم چک کنید.');
    lines.push('');
    lines.push('— تحلیل رایگان محلی (بدون کلید API) · اپل‌تو‌اپل');

    const report = lines.join('\n');

    const extPrompt = 'تو یک مشاور خرید هستی. این مقایسه محصولات را به فارسی، کوتاه و کاربردی تحلیل کن. ' +
      'نقاط قوت/ضعف هر کدام، برای چه کاربری مناسب‌تر است، و یک توصیه نهایی بده:\n\n' + report;

    const grokUrl = 'https://grok.com/?q=' + encodeURIComponent(extPrompt.substring(0, 1800));
    const chatgptUrl = 'https://chatgpt.com/?q=' + encodeURIComponent(extPrompt.substring(0, 1800));

    box.classList.remove('hidden');
    box.innerHTML =
      '<div class="ai-box-header">' +
        '<strong>✨ تحلیل هوشمند (رایگان)</strong>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button type="button" class="btn btn-outline btn-sm" id="btnCopyAi">کپی متن</button>' +
          '<a class="btn btn-primary btn-sm" href="' + grokUrl + '" target="_blank" rel="noopener">تحلیل در Grok</a>' +
          '<a class="btn btn-outline btn-sm" href="' + chatgptUrl + '" target="_blank" rel="noopener">تحلیل در ChatGPT</a>' +
        '</div>' +
      '</div>' +
      '<pre class="ai-text" id="aiReportText"></pre>' +
      '<p class="ai-hint">تحلیل بالا کاملاً رایگان و روی مرورگر ساخته شده. برای تحلیل عمیق‌تر با مدل‌های قوی، دکمه‌های Grok یا ChatGPT را بزن.</p>';

    const pre = document.getElementById('aiReportText');
    if (pre) pre.textContent = report;

    const copyBtn = document.getElementById('btnCopyAi');
    if (copyBtn) {
      copyBtn.onclick = function () {
        navigator.clipboard.writeText(report).then(function () {
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
