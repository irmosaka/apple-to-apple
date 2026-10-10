// ===================== Data Management =====================
const STORAGE_KEY = 'appleToApple_data_v2';

async function loadData() {
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {
      console.warn('localStorage corrupt, loading from file');
    }
  }

  try {
    const res = await fetch('data/products.json');
    const data = await res.json();
    return {
      categories: data.categories || [],
      products: data.products || []
    };
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

// ===================== Digikala Integration (via digikala-mcp) =====================
const DIGIKALA_MCP = 'https://digikala-mcp.mmdju.workers.dev/mcp';

function extractDkpId(url) {
  if (!url) return null;
  const m = String(url).match(/dkp-(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const n = String(url).trim().match(/^\d+$/);
  if (n) return parseInt(n[0], 10);
  return null;
}

async function mcpCall(toolName, args, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(DIGIKALA_MCP, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      })
    });

    const text = await res.text();
    let payload = null;
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        try { payload = JSON.parse(line.slice(6)); } catch (_) {}
      }
    }
    if (!payload) {
      try { payload = JSON.parse(text); } catch (_) {}
    }

    if (!payload) throw new Error('پاسخ نامعتبر از سرویس دیجی‌کالا');

    if (payload.error) {
      throw new Error(payload.error.message || 'خطای MCP');
    }

    const content = payload.result?.content?.[0]?.text;
    if (payload.result?.isError) {
      const msg = content || 'خطا در دریافت داده';
      if (/rate-limit|15-30|temporarily/i.test(msg) && attempt < retries) {
        await new Promise(r => setTimeout(r, 20000));
        continue;
      }
      throw new Error(msg);
    }

    if (!content) throw new Error('داده خالی برگشت');
    return JSON.parse(content);
  }
}

function mapDigikalaToProduct(d, type = 'competitor') {
  const features = {};

  if (Array.isArray(d.specs)) {
    d.specs.forEach(group => {
      (group.attributes || []).forEach(attr => {
        if (attr.title && attr.value) {
          features[attr.title] = attr.value;
        }
      });
    });
  }

  if (d.warranty) features['گارانتی'] = d.warranty;
  if (d.rating_stars) {
    features['امتیاز'] = d.rating_count
      ? `${d.rating_stars} از ۵ (${d.rating_count} نظر)`
      : String(d.rating_stars);
  }
  if (d.seller?.name) features['فروشنده'] = d.seller.name;

  const aliases = [
    ['رم', ['حافظه RAM', 'حافظه رم', 'RAM']],
    ['حافظه داخلی', ['حافظه داخلی', 'ظرفیت حافظه داخلی']],
    ['باتری', ['ظرفیت باتری', 'باتری']],
    ['شارژ سریع', ['توان شارژ', 'شارژ سریع']],
    ['صفحه نمایش', ['اندازه صفحه نمایش', 'صفحه نمایش', 'نوع صفحه نمایش']],
    ['دوربین اصلی', ['رزولوشن دوربین اصلی', 'دوربین اصلی']],
    ['پردازنده', ['تراشه', 'پردازنده', 'چیپست']]
  ];
  aliases.forEach(([canonical, keys]) => {
    if (features[canonical]) return;
    for (const k of keys) {
      if (features[k]) {
        features[canonical] = features[k];
        break;
      }
    }
  });

  return {
    id: 'dkp-' + d.id,
    name: d.title || '',
    brand: d.brand || '',
    category: d.category || (d.category_path && d.category_path[d.category_path.length - 1]) || '',
    price: d.price_toman || 0,
    image: d.image || '',
    type: type,
    digikalaUrl: d.url || ('https://www.digikala.com/product/dkp-' + d.id + '/'),
    competitors: [],
    features
  };
}

async function fetchDigikalaProduct(urlOrId) {
  const id = typeof urlOrId === 'number' ? urlOrId : extractDkpId(urlOrId);
  if (!id) throw new Error('آیدی محصول (dkp-...) در لینک پیدا نشد');
  const details = await mcpCall('product_details', {
    id,
    include_specs: true,
    include_comments: 0
  });
  return { raw: details, product: mapDigikalaToProduct(details) };
}

// ===================== Comparison Page =====================
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
    categorySelect.innerHTML += `<option value="${cat}">${cat}</option>`;
  });

  function getFilteredOwnProducts() {
    const cat = categorySelect.value;
    return products.filter(p => {
      if (p.type !== 'own') return false;
      if (cat && p.category !== cat) return false;
      return true;
    });
  }

  function getAvailableCompetitors(ownId) {
    const own = products.find(p => p.id === ownId);
    if (!own) return [];

    const cat = categorySelect.value || own.category;
    const linked = (own.competitors || [])
      .map(id => products.find(p => p.id === id))
      .filter(Boolean);

    const others = products.filter(p =>
      p.id !== ownId &&
      p.type === 'competitor' &&
      (!cat || p.category === cat) &&
      !(own.competitors || []).includes(p.id)
    );

    return [...linked, ...others];
  }

  function populateOwnProducts() {
    const ownList = getFilteredOwnProducts();
    selectA.innerHTML = '<option value="">انتخاب کنید...</option>';
    ownList.forEach(p => {
      selectA.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
    competitorsBox.innerHTML = '<span class="hint">اول محصول خودت رو انتخاب کن</span>';
    resultEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }

  function populateCompetitors() {
    const ownId = selectA.value;
    if (!ownId) {
      competitorsBox.innerHTML = '<span class="hint">اول محصول خودت رو انتخاب کن</span>';
      return;
    }

    const comps = getAvailableCompetitors(ownId);
    if (comps.length === 0) {
      competitorsBox.innerHTML = '<span class="hint">رقیبی در این دسته یافت نشد</span>';
      return;
    }

    const own = products.find(p => p.id === ownId);
    const defaultSelected = new Set(own.competitors || []);

    competitorsBox.innerHTML = comps.map(p => {
      const checked = defaultSelected.has(p.id) ? 'selected' : '';
      return `
        <label class="competitor-chip ${checked}" data-id="${p.id}">
          <input type="checkbox" value="${p.id}" ${checked ? 'checked' : ''}>
          ${p.brand ? p.brand + ' · ' : ''}${p.name.length > 30 ? p.name.substring(0, 30) + '…' : p.name}
        </label>
      `;
    }).join('');

    competitorsBox.querySelectorAll('.competitor-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
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
    return Array.from(competitorsBox.querySelectorAll('input:checked')).map(cb => cb.value);
  }

  function renderComparison() {
    const ownId = selectA.value;
    const compIds = getSelectedCompetitors();

    if (!ownId || compIds.length === 0) {
      resultEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    const own = products.find(p => p.id === ownId);
    const comps = compIds.map(id => products.find(p => p.id === id)).filter(Boolean);

    if (!own || comps.length === 0) return;

    emptyEl.classList.add('hidden');
    resultEl.classList.remove('hidden');

    const all = [own, ...comps];
    const colClass = `cols-${Math.min(all.length, 4)}`;

    const cardsHtml = all.map((p, i) => `
      <div class="product-card">
        <div class="card-header">
          <span class="${i === 0 ? 'badge-own' : 'badge-competitor'}">${i === 0 ? 'محصول من' : 'رقیب'}</span>
          <img src="${p.image || 'https://via.placeholder.com/140?text=No+Image'}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/140?text=No+Image'">
          <h3>${p.name}</h3>
          <div class="brand">${p.brand || ''}</div>
          <div class="price">${formatPrice(p.price)}</div>
          ${p.category ? `<div class="category-badge">${p.category}</div>` : ''}
          ${p.digikalaUrl ? `<a class="digikala-link" href="${p.digikalaUrl}" target="_blank">مشاهده در دیجی‌کالا ←</a>` : ''}
        </div>
      </div>
    `).join('');

    const allKeys = new Set();
    all.forEach(p => Object.keys(p.features || {}).forEach(k => allKeys.add(k)));

    let featuresHtml = '';
    allKeys.forEach(key => {
      const values = all.map(p => p.features?.[key] || '—');
      const ownVal = values[0];
      const numOwn = parseFloat(String(ownVal).replace(/[^\d.]/g, ''));
      const isWeight = key.includes('وزن') || key.toLowerCase().includes('weight');

      const classes = values.map((val, i) => {
        if (i === 0) return 'equal';
        const num = parseFloat(String(val).replace(/[^\d.]/g, ''));
        if (isNaN(numOwn) || isNaN(num) || numOwn === num) return 'equal';
        if (isWeight) return num < numOwn ? 'better' : 'worse';
        return num > numOwn ? 'better' : 'worse';
      });

      featuresHtml += `
        <tr>
          <td>${key}</td>
          ${values.map((v, i) => `<td class="${classes[i]}">${v}</td>`).join('')}
        </tr>
      `;
    });

    const headers = all.map(p => {
      const short = p.name.length > 20 ? p.name.substring(0, 20) + '…' : p.name;
      return `<th>${short}</th>`;
    }).join('');

    resultEl.innerHTML = `
      <div class="product-cards multi ${colClass}">
        ${cardsHtml}
      </div>
      <div class="features-table">
        <table>
          <thead>
            <tr>
              <th>ویژگی</th>
              ${headers}
            </tr>
          </thead>
          <tbody>
            ${featuresHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  categorySelect.addEventListener('change', () => populateOwnProducts());
  selectA.addEventListener('change', () => populateCompetitors());
  populateOwnProducts();
}

// ===================== Admin Page =====================
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
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h3>هنوز محصولی اضافه نشده</h3>
          <p>روی دکمه «افزودن محصول جدید» کلیک کن</p>
        </div>
      `;
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
      html += `<h3 style="margin:20px 0 12px; font-size:1.1rem; color:var(--text-muted);">${cat} (${items.length})</h3>`;
      html += items.map(p => {
        const compCount = (p.competitors || []).length;
        return `
          <div class="product-item">
            <img src="${p.image || 'https://via.placeholder.com/80?text=No+Image'}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
            <div class="info">
              <h3>${p.name}</h3>
              <div class="meta">
                ${p.brand || 'بدون برند'} · ${formatPrice(p.price)} ·
                <strong>${p.type === 'own' ? 'محصول من' : 'رقیب'}</strong>
                ${p.type === 'own' && compCount > 0 ? ` · ${compCount} رقیب` : ''}
                · ${Object.keys(p.features || {}).length} ویژگی
              </div>
            </div>
            <div class="actions">
              <button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')">ویرایش</button>
              <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">حذف</button>
            </div>
          </div>
        `;
      }).join('');
    });

    listEl.innerHTML = html;
  }

  function fillCategorySelect(selected = '') {
    const sel = form.category;
    sel.innerHTML = '<option value="">انتخاب یا تایپ کنید...</option>';
    categories.forEach(c => {
      sel.innerHTML += `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`;
    });
  }

  function fillCompetitorsSelect(ownId, selectedIds = []) {
    const container = document.getElementById('competitorsSelectContainer');
    if (!container) return;

    const currentCat = form.category.value;
    const available = products.filter(p =>
      p.type === 'competitor' &&
      p.id !== ownId &&
      (!currentCat || p.category === currentCat || !p.category)
    );

    if (available.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:0.9rem;">هنوز رقیبی در این دسته تعریف نشده</span>';
      return;
    }

    container.innerHTML = available.map(p => {
      const checked = selectedIds.includes(p.id) ? 'checked' : '';
      return `
        <label class="competitor-chip ${checked ? 'selected' : ''}" style="margin:4px;">
          <input type="checkbox" name="compIds" value="${p.id}" ${checked}>
          ${p.brand ? p.brand + ' · ' : ''}${p.name.length > 28 ? p.name.substring(0, 28) + '…' : p.name}
        </label>
      `;
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
    addFeatureRow();
    addFeatureRow();
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
    if (!confirm('آیا مطمئنی می‌خوای این محصول رو حذف کنی؟')) return;
    products = products.filter(p => p.id !== id);
    products.forEach(p => {
      if (p.competitors) p.competitors = p.competitors.filter(c => c !== id);
    });
    persist();
    renderList();
    showToast('محصول حذف شد');
  };

  window.closeModal = function () {
    modal.classList.remove('open');
  };

  window.addFeatureRow = function (key = '', value = '') {
    const container = document.getElementById('featuresContainer');
    const div = document.createElement('div');
    div.className = 'feature-row';
    div.innerHTML = `
      <input type="text" placeholder="نام ویژگی (مثلاً رم)" value="${key}" class="feat-key">
      <input type="text" placeholder="مقدار (مثلاً ۸ گیگابایت)" value="${value}" class="feat-val">
      <button type="button" class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(div);
  };

  form.type.addEventListener('change', () => {
    document.getElementById('competitorsSection').style.display =
      form.type.value === 'own' ? 'block' : 'none';
  });

  form.category.addEventListener('change', () => {
    fillCompetitorsSelect(editingId, []);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const features = {};
    document.querySelectorAll('#featuresContainer .feature-row').forEach(row => {
      const k = row.querySelector('.feat-key').value.trim();
      const v = row.querySelector('.feat-val').value.trim();
      if (k) features[k] = v;
    });

    let cat = form.category.value.trim();
    if (cat && !categories.includes(cat)) {
      categories.push(cat);
    }

    const selectedComps = Array.from(document.querySelectorAll('input[name="compIds"]:checked'))
      .map(cb => cb.value);

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
      showToast('محصول با موفقیت ویرایش شد');
    } else {
      products.push(product);
      showToast('محصول جدید اضافه شد');
    }

    persist();
    renderList();
    closeModal();
  });

  window.exportJSON = function () {
    const exportData = { categories, products };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('فایل products.json دانلود شد — این فایل رو جایگزین data/products.json در ریپو کن');
  };

  window.importJSON = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          categories = parsed.categories || [];
          products = parsed.products || parsed;
          persist();
          renderList();
          showToast('داده‌ها با موفقیت وارد شدند');
        } catch (err) {
          showToast('فایل معتبر نیست', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  window.tryFetchDigikala = async function () {
    const url = form.digikalaUrl.value.trim();
    if (!url) {
      showToast('لینک یا آیدی دیجی‌کالا را وارد کن', 'error');
      return;
    }
    if (!extractDkpId(url) && !url.includes('digikala.com')) {
      showToast('لینک معتبر دیجی‌کالا یا آیدی dkp وارد کن', 'error');
      return;
    }

    const btn = document.querySelector('button[onclick="tryFetchDigikala()"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'در حال دریافت...';
    }
    showToast('در حال دریافت مشخصات از دیجی‌کالا...');

    try {
      const { product } = await fetchDigikalaProduct(url);

      form.name.value = product.name || '';
      form.brand.value = product.brand || '';
      form.price.value = product.price || '';
      form.image.value = product.image || '';
      form.digikalaUrl.value = product.digikalaUrl || url;

      if (product.category) {
        if (!categories.includes(product.category)) {
          categories.push(product.category);
        }
        fillCategorySelect(product.category);
      }

      const container = document.getElementById('featuresContainer');
      container.innerHTML = '';
      const feats = product.features || {};
      const entries = Object.entries(feats);
      if (entries.length === 0) {
        addFeatureRow();
      } else {
        const priority = ['صفحه نمایش', 'رزولوشن', 'پردازنده', 'رم', 'حافظه داخلی', 'دوربین اصلی', 'باتری', 'شارژ سریع', 'سیستم عامل', 'وزن', 'گارانتی', 'امتیاز'];
        const ordered = [];
        priority.forEach(k => { if (feats[k]) ordered.push([k, feats[k]]); });
        entries.forEach(([k, v]) => {
          if (!priority.includes(k)) ordered.push([k, v]);
        });
        ordered.slice(0, 25).forEach(([k, v]) => addFeatureRow(k, v));
      }

      showToast(`✅ مشخصات دریافت شد (${Object.keys(feats).length} ویژگی)`);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'خطا در دریافت از دیجی‌کالا', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'دریافت از دیجی‌کالا';
      }
    }
  };

  window.addNewCategory = function () {
    const name = prompt('نام دسته جدید را وارد کنید:');
    if (name && name.trim() && !categories.includes(name.trim())) {
      categories.push(name.trim());
      fillCategorySelect(name.trim());
      persist();
      showToast('دسته جدید اضافه شد');
    }
  };

  renderList();
}

// ===================== Init =====================
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('productA')) {
    initComparisonPage();
  }
  if (document.getElementById('productList')) {
    initAdminPage();
  }
});
