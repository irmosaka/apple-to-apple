
async function initAdminPage() {
  let data = await loadData();
  let { categories, products } = data;
  const listEl = document.getElementById('productList');
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const modalTitle = document.getElementById('modalTitle');
  let editingId = null;
  let pendingLastUpdate = null;
  if (!listEl) return;
  if (listEl.dataset.ready === '1') return;
  listEl.dataset.ready = '1';

  function showToast(msg, type) {
    type = type || 'success';
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast ' + type + ' show';
    setTimeout(function () { toast.classList.remove('show'); }, 3500);
  }
  function persist() { saveData({ categories: categories, products: products }); }

  function formatLastUpdate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(iso));
    } catch (e) { return ''; }
  }

  function renderList() {
    if (products.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><h3>هنوز محصولی اضافه نشده</h3></div>';
      return;
    }
    const byCat = {};
    products.forEach(function (p) {
      const cat = p.category || 'بدون دسته';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(p);
    });
    let html = '';
    Object.keys(byCat).forEach(function (cat) {
      const items = byCat[cat];
      html += '<h3 style="margin:20px 0 12px;font-size:1.1rem;color:var(--text-muted)">' + cat + ' (' + items.length + ')</h3>';
      html += items.map(function (p) {
        const compCount = (p.competitors || []).length;
        const last = formatLastUpdate(p.lastPriceUpdate);
        const hasDk = !!(p.digikalaUrl && typeof extractDkpId === 'function' && extractDkpId(p.digikalaUrl));
        return '<div class="product-item">' +
          '<img src="' + (p.image || 'https://via.placeholder.com/80?text=No+Image') + '" alt="" onerror="this.src=\'https://via.placeholder.com/80?text=No+Image\'">' +
          '<div class="info"><h3>' + p.name + '</h3>' +
          '<div class="meta">' + (p.brand || '') + ' · <strong>' + formatPrice(p.price) + '</strong> · ' +
          (p.type === 'own' ? 'محصول من' : 'رقیب') +
          (p.type === 'own' && compCount > 0 ? ' · ' + compCount + ' رقیب' : '') +
          ' · ' + Object.keys(p.features || {}).length + ' ویژگی</div>' +
          (last ? '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">آخرین به‌روزرسانی قیمت: ' + last + '</div>' : '') +
          '</div><div class="actions" style="flex-wrap:wrap;gap:6px">' +
          (hasDk ? '<button class="btn btn-outline btn-sm" onclick="refreshPrice(\'' + p.id + '\')">🔄 قیمت</button>' : '') +
          '<button class="btn btn-outline btn-sm" onclick="editProduct(\'' + p.id + '\')">ویرایش</button>' +
          '<button class="btn btn-danger btn-sm" onclick="deleteProduct(\'' + p.id + '\')">حذف</button>' +
          '</div></div>';
      }).join('');
    });
    listEl.innerHTML = html;
  }

  function fillCategorySelect(selected) {
    selected = selected || '';
    const sel = form.category;
    sel.innerHTML = '<option value="">انتخاب...</option>';
    categories.forEach(function (c) {
      sel.innerHTML += '<option value="' + c + '"' + (c === selected ? ' selected' : '') + '>' + c + '</option>';
    });
  }

  function fillCompetitorsSelect(ownId, selectedIds) {
    selectedIds = selectedIds || [];
    const container = document.getElementById('competitorsSelectContainer');
    if (!container) return;
    const currentCat = form.category.value;
    const available = products.filter(function (p) {
      return p.id !== ownId && (!currentCat || p.category === currentCat || !p.category);
    });
    if (available.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:0.9rem">محصول دیگری نیست</span>';
      return;
    }
    container.innerHTML = available.map(function (p) {
      const checked = selectedIds.indexOf(p.id) >= 0 ? 'checked' : '';
      const name = p.name.length > 28 ? p.name.substring(0, 28) + '…' : p.name;
      return '<label class="competitor-chip ' + (checked ? 'selected' : '') + '" style="margin:4px">' +
        '<input type="checkbox" name="compIds" value="' + p.id + '" ' + checked + '>' + name + '</label>';
    }).join('');
    container.querySelectorAll('.competitor-chip').forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        if (e.target.tagName === 'INPUT') return;
        e.preventDefault();
        const cb = chip.querySelector('input');
        cb.checked = !cb.checked;
        chip.classList.toggle('selected', cb.checked);
      });
    });
  }

  async function refreshOnePrice(product) {
    if (!product.digikalaUrl) throw new Error('لینک دیجی‌کالا ندارد');
    const result = await fetchDigikalaProduct(product.digikalaUrl);
    const raw = result.raw;
    const oldPrice = product.price;
    product.price = raw.price_toman || product.price;
    product.lastPriceUpdate = new Date().toISOString();
    if (raw.url) product.digikalaUrl = raw.url;
    return { oldPrice: oldPrice, newPrice: product.price, changed: oldPrice !== product.price };
  }

  window.refreshPrice = async function (id) {
    const p = products.find(function (x) { return x.id === id; });
    if (!p) return;
    showToast('در حال به‌روزرسانی قیمت...');
    try {
      const r = await refreshOnePrice(p);
      persist(); renderList();
      if (r.changed) showToast('قیمت به‌روز شد: ' + formatPrice(r.oldPrice) + ' ← ' + formatPrice(r.newPrice));
      else showToast('قیمت تغییری نکرد · زمان به‌روزرسانی ثبت شد');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'خطا در به‌روزرسانی', 'error');
    }
  };

  window.refreshAllPrices = async function () {
    const list = products.filter(function (p) {
      return p.digikalaUrl && extractDkpId(p.digikalaUrl);
    });
    if (list.length === 0) { showToast('هیچ محصولی با لینک دیجی‌کالا نیست', 'error'); return; }
    if (!confirm(list.length + ' محصول پیدا شد. فقط قیمت‌ها به‌روز شوند؟')) return;
    const btn = document.getElementById('btnRefreshAllPrices');
    if (btn) { btn.disabled = true; btn.textContent = 'در حال به‌روزرسانی...'; }
    let ok = 0, fail = 0, changed = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      showToast('به‌روزرسانی ' + (i + 1) + ' از ' + list.length + '...');
      try {
        const r = await refreshOnePrice(p);
        ok++; if (r.changed) changed++;
        persist(); renderList();
        if (i < list.length - 1) await new Promise(function (r) { setTimeout(r, 1500); });
      } catch (err) {
        console.error(p.id, err); fail++;
        if (/rate|15-30|temporarily/i.test(String(err.message || ''))) {
          showToast('محدودیت نرخ — ۲۰ ثانیه صبر...');
          await new Promise(function (r) { setTimeout(r, 20000); });
          try {
            const r = await refreshOnePrice(p);
            ok++; fail--; if (r.changed) changed++;
            persist(); renderList();
          } catch (e2) { console.error(e2); }
        }
      }
    }
    if (btn) { btn.disabled = false; btn.textContent = '🔄 به‌روزرسانی همه قیمت‌ها'; }
    showToast('تمام: ' + ok + ' موفق، ' + changed + ' تغییر قیمت، ' + fail + ' ناموفق');
  };

  window.openAddModal = function () {
    editingId = null; pendingLastUpdate = null;
    modalTitle.textContent = 'افزودن محصول جدید';
    form.reset();
    document.getElementById('featuresContainer').innerHTML = '';
    addFeatureRow(); addFeatureRow();
    fillCategorySelect();
    fillCompetitorsSelect(null, []);
    document.getElementById('competitorsSection').style.display = 'block';
    modal.classList.add('open');
  };

  window.editProduct = function (id) {
    const p = products.find(function (x) { return x.id === id; });
    if (!p) return;
    editingId = id;
    pendingLastUpdate = p.lastPriceUpdate || null;
    modalTitle.textContent = 'ویرایش محصول';
    form.name.value = p.name || '';
    form.brand.value = p.brand || '';
    form.price.value = p.price || '';
    form.image.value = p.image || '';
    form.type.value = p.type || 'own';
    form.digikalaUrl.value = p.digikalaUrl || '';
    fillCategorySelect(p.category || '');
    const container = document.getElementById('featuresContainer');
    container.innerHTML = '';
    const feats = p.features || {};
    Object.keys(feats).forEach(function (k) { addFeatureRow(k, feats[k]); });
    if (Object.keys(feats).length === 0) addFeatureRow();
    document.getElementById('competitorsSection').style.display = p.type === 'own' ? 'block' : 'none';
    fillCompetitorsSelect(id, p.competitors || []);
    modal.classList.add('open');
  };

  window.deleteProduct = function (id) {
    if (!confirm('حذف شود؟')) return;
    products = products.filter(function (p) { return p.id !== id; });
    products.forEach(function (p) {
      if (p.competitors) p.competitors = p.competitors.filter(function (c) { return c !== id; });
    });
    persist(); renderList(); showToast('حذف شد');
  };

  window.closeModal = function () { modal.classList.remove('open'); };

  window.addFeatureRow = function (key, value) {
    key = key || ''; value = value || '';
    const container = document.getElementById('featuresContainer');
    const div = document.createElement('div');
    div.className = 'feature-row';
    div.innerHTML = '<input type="text" placeholder="ویژگی" value="' + key + '" class="feat-key">' +
      '<input type="text" placeholder="مقدار" value="' + value + '" class="feat-val">' +
      '<button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>';
    container.appendChild(div);
  };

  form.type.addEventListener('change', function () {
    document.getElementById('competitorsSection').style.display = form.type.value === 'own' ? 'block' : 'none';
  });
  form.category.addEventListener('change', function () { fillCompetitorsSelect(editingId, []); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const features = {};
    document.querySelectorAll('#featuresContainer .feature-row').forEach(function (row) {
      const k = row.querySelector('.feat-key').value.trim();
      const v = row.querySelector('.feat-val').value.trim();
      if (k) features[k] = v;
    });
    let cat = form.category.value.trim();
    if (cat && categories.indexOf(cat) < 0) categories.push(cat);
    const selectedComps = Array.prototype.map.call(
      document.querySelectorAll('input[name="compIds"]:checked'),
      function (cb) { return cb.value; }
    );
    const product = {
      id: editingId || ('p' + Date.now()),
      name: form.name.value.trim(),
      brand: form.brand.value.trim(),
      category: cat,
      price: parseInt(form.price.value, 10) || 0,
      image: form.image.value.trim(),
      type: form.type.value,
      digikalaUrl: form.digikalaUrl.value.trim(),
      competitors: form.type.value === 'own' ? selectedComps : [],
      features: features,
      lastPriceUpdate: pendingLastUpdate || null
    };
    if (editingId) {
      const idx = products.findIndex(function (p) { return p.id === editingId; });
      if (idx !== -1) products[idx] = product;
      showToast('ویرایش شد');
    } else {
      products.push(product);
      showToast('اضافه شد');
    }
    pendingLastUpdate = null;
    persist(); renderList(); closeModal();
  });

  window.exportJSON = function () {
    const blob = new Blob([JSON.stringify({ categories: categories, products: products }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'products.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('دانلود شد');
  };

  window.importJSON = function () {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = function (e) {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        try {
          const parsed = JSON.parse(ev.target.result);
          categories = parsed.categories || [];
          products = parsed.products || parsed;
          persist(); renderList(); showToast('وارد شد');
        } catch (err) { showToast('فایل نامعتبر', 'error'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  window.tryFetchDigikala = async function () {
    const url = form.digikalaUrl.value.trim();
    if (!url) { showToast('لینک را وارد کن', 'error'); return; }
    if (!extractDkpId(url) && url.indexOf('digikala.com') < 0) {
      showToast('لینک نامعتبر', 'error'); return;
    }
    const btn = document.querySelector('button[onclick="tryFetchDigikala()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'در حال دریافت...'; }
    showToast('در حال دریافت...');
    try {
      const result = await fetchDigikalaProduct(url);
      const product = result.product;
      form.name.value = product.name || '';
      form.brand.value = product.brand || '';
      form.price.value = product.price || '';
      form.image.value = product.image || '';
      form.digikalaUrl.value = product.digikalaUrl || url;
      pendingLastUpdate = new Date().toISOString();
      if (product.category) {
        if (categories.indexOf(product.category) < 0) categories.push(product.category);
        fillCategorySelect(product.category);
      }
      const container = document.getElementById('featuresContainer');
      container.innerHTML = '';
      const feats = product.features || {};
      const keys = Object.keys(feats);
      if (keys.length === 0) addFeatureRow();
      else {
        const priority = ['صفحه نمایش','پردازنده','رم','حافظه داخلی','دوربین اصلی','باتری','شارژ سریع','وزن','گارانتی','امتیاز'];
        const ordered = [];
        priority.forEach(function (k) { if (feats[k]) ordered.push(k); });
        keys.forEach(function (k) { if (priority.indexOf(k) < 0) ordered.push(k); });
        ordered.slice(0, 25).forEach(function (k) { addFeatureRow(k, feats[k]); });
      }
      showToast('دریافت شد (' + keys.length + ' ویژگی)');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'خطا', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'دریافت از دیجی‌کالا'; }
    }
  };

  window.addNewCategory = function () {
    const name = prompt('نام دسته جدید:');
    if (name && name.trim() && categories.indexOf(name.trim()) < 0) {
      categories.push(name.trim());
      fillCategorySelect(name.trim());
      persist();
      showToast('دسته اضافه شد');
    }
  };

  renderList();
}

function bootApp() {
  if (document.getElementById('productA')) initComparisonPage();
  if (document.getElementById('productList')) {
    if (!document.getElementById('loginGate') || (typeof isAdminLoggedIn === 'function' && isAdminLoggedIn())) {
      initAdminPage();
    }
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
