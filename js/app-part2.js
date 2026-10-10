
async function initAdminPage() {
  let data = await loadData();
  let { categories, products } = data;

  const listEl = document.getElementById('productList');
  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const modalTitle = document.getElementById('modalTitle');
  let editingId = null;

  if (!listEl) return;

  function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function persist() {
    saveData({ categories, products });
  }

  function renderList() {
    if (products.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><h3>هنوز محصولی اضافه نشده</h3></div>`;
      return;
    }
    const byCat = {};
    products.forEach(p => {
      const cat = p.category || 'بدون دسته';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(p);
    });
    let html = '';
    Object.entries(byCat).forEach(([cat, items]) => {
      html += `<h3 style="margin:20px 0 12px;font-size:1.1rem;color:var(--text-muted)">${cat} (${items.length})</h3>`;
      html += items.map(p => {
        const compCount = (p.competitors || []).length;
        return `<div class="product-item"><img src="${p.image || 'https://via.placeholder.com/80?text=No+Image'}" alt="" onerror="this.src='https://via.placeholder.com/80?text=No+Image'"><div class="info"><h3>${p.name}</h3><div class="meta">${p.brand || ''} · ${formatPrice(p.price)} · <strong>${p.type === 'own' ? 'محصول من' : 'رقیب'}</strong>${p.type === 'own' && compCount > 0 ? ' · ' + compCount + ' رقیب' : ''} · ${Object.keys(p.features || {}).length} ویژگی</div></div><div class="actions"><button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')">ویرایش</button><button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">حذف</button></div></div>`;
      }).join('');
    });
    listEl.innerHTML = html;
  }

  function fillCategorySelect(selected = '') {
    const sel = form.category;
    sel.innerHTML = '<option value="">انتخاب...</option>';
    categories.forEach(c => { sel.innerHTML += `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`; });
  }

  function fillCompetitorsSelect(ownId, selectedIds = []) {
    const container = document.getElementById('competitorsSelectContainer');
    if (!container) return;
    const currentCat = form.category.value;
    const available = products.filter(p => p.id !== ownId && (!currentCat || p.category === currentCat || !p.category));
    if (available.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:0.9rem">محصول دیگری نیست</span>';
      return;
    }
    container.innerHTML = available.map(p => {
      const checked = selectedIds.includes(p.id) ? 'checked' : '';
      return `<label class="competitor-chip ${checked ? 'selected' : ''}" style="margin:4px"><input type="checkbox" name="compIds" value="${p.id}" ${checked}>${p.name.length > 28 ? p.name.substring(0, 28) + '…' : p.name}</label>`;
    }).join('');
    container.querySelectorAll('.competitor-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        e.preventDefault();
        const cb = chip.querySelector('input');
        cb.checked = !cb.checked;
        chip.classList.toggle('selected', cb.checked);
      });
    });
  }

  window.openAddModal = function () {
    editingId = null;
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
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingId = id;
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
    Object.entries(feats).forEach(([k, v]) => addFeatureRow(k, v));
    if (Object.keys(feats).length === 0) addFeatureRow();
    document.getElementById('competitorsSection').style.display = p.type === 'own' ? 'block' : 'none';
    fillCompetitorsSelect(id, p.competitors || []);
    modal.classList.add('open');
  };

  window.deleteProduct = function (id) {
    if (!confirm('حذف شود؟')) return;
    products = products.filter(p => p.id !== id);
    products.forEach(p => { if (p.competitors) p.competitors = p.competitors.filter(c => c !== id); });
    persist(); renderList(); showToast('حذف شد');
  };

  window.closeModal = function () { modal.classList.remove('open'); };

  window.addFeatureRow = function (key = '', value = '') {
    const container = document.getElementById('featuresContainer');
    const div = document.createElement('div');
    div.className = 'feature-row';
    div.innerHTML = `<input type="text" placeholder="ویژگی" value="${key}" class="feat-key"><input type="text" placeholder="مقدار" value="${value}" class="feat-val"><button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(div);
  };

  form.type.addEventListener('change', () => {
    document.getElementById('competitorsSection').style.display = form.type.value === 'own' ? 'block' : 'none';
  });
  form.category.addEventListener('change', () => fillCompetitorsSelect(editingId, []));

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const features = {};
    document.querySelectorAll('#featuresContainer .feature-row').forEach(row => {
      const k = row.querySelector('.feat-key').value.trim();
      const v = row.querySelector('.feat-val').value.trim();
      if (k) features[k] = v;
    });
    let cat = form.category.value.trim();
    if (cat && !categories.includes(cat)) categories.push(cat);
    const selectedComps = Array.from(document.querySelectorAll('input[name="compIds"]:checked')).map(cb => cb.value);
    const product = {
      id: editingId || 'p' + Date.now(),
      name: form.name.value.trim(),
      brand: form.brand.value.trim(),
      category: cat,
      price: parseInt(form.price.value) || 0,
      image: form.image.value.trim(),
      type: form.type.value,
      digikalaUrl: form.digikalaUrl.value.trim(),
      competitors: form.type.value === 'own' ? selectedComps : [],
      features
    };
    if (editingId) {
      const idx = products.findIndex(p => p.id === editingId);
      if (idx !== -1) products[idx] = product;
      showToast('ویرایش شد');
    } else {
      products.push(product);
      showToast('اضافه شد');
    }
    persist(); renderList(); closeModal();
  });

  window.exportJSON = function () {
    const blob = new Blob([JSON.stringify({ categories, products }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'products.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('دانلود شد');
  };

  window.importJSON = function () {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
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
    if (!extractDkpId(url) && !url.includes('digikala.com')) { showToast('لینک نامعتبر', 'error'); return; }
    const btn = document.querySelector('button[onclick="tryFetchDigikala()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'در حال دریافت...'; }
    showToast('در حال دریافت...');
    try {
      const { product } = await fetchDigikalaProduct(url);
      form.name.value = product.name || '';
      form.brand.value = product.brand || '';
      form.price.value = product.price || '';
      form.image.value = product.image || '';
      form.digikalaUrl.value = product.digikalaUrl || url;
      if (product.category) {
        if (!categories.includes(product.category)) categories.push(product.category);
        fillCategorySelect(product.category);
      }
      const container = document.getElementById('featuresContainer');
      container.innerHTML = '';
      const feats = product.features || {};
      const entries = Object.entries(feats);
      if (entries.length === 0) addFeatureRow();
      else {
        const priority = ['صفحه نمایش','پردازنده','رم','حافظه داخلی','دوربین اصلی','باتری','شارژ سریع','وزن','گارانتی','امتیاز'];
        const ordered = [];
        priority.forEach(k => { if (feats[k]) ordered.push([k, feats[k]]); });
        entries.forEach(([k, v]) => { if (!priority.includes(k)) ordered.push([k, v]); });
        ordered.slice(0, 25).forEach(([k, v]) => addFeatureRow(k, v));
      }
      showToast('دریافت شد (' + Object.keys(feats).length + ' ویژگی)');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'خطا', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'دریافت از دیجی‌کالا'; }
    }
  };

  window.addNewCategory = function () {
    const name = prompt('نام دسته جدید:');
    if (name && name.trim() && !categories.includes(name.trim())) {
      categories.push(name.trim());
      fillCategorySelect(name.trim());
      persist();
      showToast('دسته اضافه شد');
    }
  };

  renderList();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('productA')) initComparisonPage();
  if (document.getElementById('productList')) initAdminPage();
});
