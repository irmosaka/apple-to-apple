// ===================== Data Management =====================
const STORAGE_KEY = 'appleToApple_products';

async function loadProducts() {
  // اول از localStorage بخون (برای تغییرات ادمین)
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {
      console.warn('localStorage corrupt, loading from file');
    }
  }

  // اگر نبود، از فایل JSON لود کن
  try {
    const res = await fetch('data/products.json');
    const data = await res.json();
    return data.products || [];
  } catch (e) {
    console.error('Failed to load products.json', e);
    return [];
  }
}

function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

function formatPrice(price) {
  if (!price && price !== 0) return '—';
  return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
}

// ===================== Comparison Page =====================
async function initComparisonPage() {
  const products = await loadProducts();
  const selectA = document.getElementById('productA');
  const selectB = document.getElementById('productB');
  const resultEl = document.getElementById('comparisonResult');
  const emptyEl = document.getElementById('emptyState');

  if (!selectA || !selectB) return;

  // پر کردن سلکت‌ها
  products.forEach(p => {
    const label = `${p.name} (${p.type === 'own' ? 'محصول من' : 'رقیب'})`;
    selectA.innerHTML += `<option value="${p.id}">${label}</option>`;
    selectB.innerHTML += `<option value="${p.id}">${label}</option>`;
  });

  function renderComparison() {
    const idA = selectA.value;
    const idB = selectB.value;

    if (!idA || !idB || idA === idB) {
      resultEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    const prodA = products.find(p => p.id === idA);
    const prodB = products.find(p => p.id === idB);

    if (!prodA || !prodB) return;

    emptyEl.classList.add('hidden');
    resultEl.classList.remove('hidden');

    // جمع‌آوری همه ویژگی‌ها
    const allKeys = new Set([
      ...Object.keys(prodA.features || {}),
      ...Object.keys(prodB.features || {})
    ]);

    let featuresHtml = '';
    allKeys.forEach(key => {
      const valA = prodA.features?.[key] || '—';
      const valB = prodB.features?.[key] || '—';

      // تشخیص ساده برتری (اگر عدد باشه)
      let classA = 'equal';
      let classB = 'equal';

      const numA = parseFloat(String(valA).replace(/[^\d.]/g, ''));
      const numB = parseFloat(String(valB).replace(/[^\d.]/g, ''));

      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        // برای وزن کمتر بهتره، بقیه بیشتر بهتر
        const isWeight = key.includes('وزن') || key.toLowerCase().includes('weight');
        if (isWeight) {
          if (numA < numB) { classA = 'better'; classB = 'worse'; }
          else { classA = 'worse'; classB = 'better'; }
        } else {
          if (numA > numB) { classA = 'better'; classB = 'worse'; }
          else { classA = 'worse'; classB = 'better'; }
        }
      }

      featuresHtml += `
        <tr>
          <td>${key}</td>
          <td class="${classA}">${valA}</td>
          <td class="${classB}">${valB}</td>
        </tr>
      `;
    });

    resultEl.innerHTML = `
      <div class="product-cards">
        <div class="product-card">
          <div class="card-header">
            <span class="badge-own">محصول من</span>
            <img src="${prodA.image || 'https://via.placeholder.com/140?text=No+Image'}" alt="${prodA.name}" onerror="this.src='https://via.placeholder.com/140?text=No+Image'">
            <h3>${prodA.name}</h3>
            <div class="brand">${prodA.brand || ''}</div>
            <div class="price">${formatPrice(prodA.price)}</div>
            ${prodA.digikalaUrl ? `<a class="digikala-link" href="${prodA.digikalaUrl}" target="_blank">مشاهده در دیجی‌کالا ←</a>` : ''}
          </div>
        </div>
        <div class="product-card">
          <div class="card-header">
            <span class="badge-competitor">رقیب</span>
            <img src="${prodB.image || 'https://via.placeholder.com/140?text=No+Image'}" alt="${prodB.name}" onerror="this.src='https://via.placeholder.com/140?text=No+Image'">
            <h3>${prodB.name}</h3>
            <div class="brand">${prodB.brand || ''}</div>
            <div class="price">${formatPrice(prodB.price)}</div>
            ${prodB.digikalaUrl ? `<a class="digikala-link" href="${prodB.digikalaUrl}" target="_blank">مشاهده در دیجی‌کالا ←</a>` : ''}
          </div>
        </div>
      </div>

      <div class="features-table">
        <table>
          <thead>
            <tr>
              <th>ویژگی</th>
              <th>${prodA.name.length > 25 ? prodA.name.substring(0, 25) + '…' : prodA.name}</th>
              <th>${prodB.name.length > 25 ? prodB.name.substring(0, 25) + '…' : prodB.name}</th>
            </tr>
          </thead>
          <tbody>
            ${featuresHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  selectA.addEventListener('change', renderComparison);
  selectB.addEventListener('change', renderComparison);
}

// ===================== Admin Page =====================
async function initAdminPage() {
  let products = await loadProducts();
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

    listEl.innerHTML = products.map(p => `
      <div class="product-item">
        <img src="${p.image || 'https://via.placeholder.com/80?text=No+Image'}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
        <div class="info">
          <h3>${p.name}</h3>
          <div class="meta">
            ${p.brand || 'بدون برند'} · ${formatPrice(p.price)} · 
            <strong>${p.type === 'own' ? 'محصول من' : 'رقیب'}</strong>
            · ${Object.keys(p.features || {}).length} ویژگی
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')">ویرایش</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">حذف</button>
        </div>
      </div>
    `).join('');
  }

  window.openAddModal = function () {
    editingId = null;
    modalTitle.textContent = 'افزودن محصول جدید';
    form.reset();
    document.getElementById('featuresContainer').innerHTML = '';
    addFeatureRow();
    addFeatureRow();
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

    const container = document.getElementById('featuresContainer');
    container.innerHTML = '';
    const feats = p.features || {};
    Object.entries(feats).forEach(([k, v]) => addFeatureRow(k, v));
    if (Object.keys(feats).length === 0) addFeatureRow();

    modal.classList.add('open');
  };

  window.deleteProduct = function (id) {
    if (!confirm('آیا مطمئنی می‌خوای این محصول رو حذف کنی؟')) return;
    products = products.filter(p => p.id !== id);
    saveProducts(products);
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const features = {};
    document.querySelectorAll('#featuresContainer .feature-row').forEach(row => {
      const k = row.querySelector('.feat-key').value.trim();
      const v = row.querySelector('.feat-val').value.trim();
      if (k) features[k] = v;
    });

    const product = {
      id: editingId || 'p' + Date.now(),
      name: form.name.value.trim(),
      brand: form.brand.value.trim(),
      price: parseInt(form.price.value) || 0,
      image: form.image.value.trim(),
      type: form.type.value,
      digikalaUrl: form.digikalaUrl.value.trim(),
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

    saveProducts(products);
    renderList();
    closeModal();
  });

  // Export / Import
  window.exportJSON = function () {
    const data = { products };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
          const data = JSON.parse(ev.target.result);
          products = data.products || data;
          saveProducts(products);
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

  // تلاش برای پر کردن از لینک دیجی‌کالا (ترکیبی)
  window.tryFetchDigikala = async function () {
    const url = form.digikalaUrl.value.trim();
    if (!url || !url.includes('digikala.com')) {
      showToast('لینک معتبر دیجی‌کالا وارد کن', 'error');
      return;
    }

    showToast('در حال تلاش برای دریافت اطلاعات... (به خاطر CORS ممکنه موفق نشه)');
    
    // چون CORS اجازه نمی‌ده، فقط پیام می‌دیم و کاربر باید دستی پر کنه
    // در نسخه واقعی می‌تونی از یه پروکسی یا Cloudflare Worker استفاده کنی
    setTimeout(() => {
      showToast('به خاطر محدودیت مرورگر (CORS) اسکرپ مستقیم ممکن نیست. مشخصات رو دستی وارد کن یا از افزونه مرورگر استفاده کن.', 'error');
    }, 1500);
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
