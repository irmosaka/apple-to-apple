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

// Digikala helpers loaded from digikala.js
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
    let list = products.filter(p => {
      if (cat && p.category !== cat) return false;
      return true;
    });
    list = list.slice().sort((a, b) => {
      if (a.type === 'own' && b.type !== 'own') return -1;
      if (b.type === 'own' && a.type !== 'own') return 1;
      return 0;
    });
    return list;
  }

  function getAvailableCompetitors(ownId) {
    const own = products.find(p => p.id === ownId);
    if (!own) return [];
    const cat = categorySelect.value || own.category || '';
    const linkedIds = own.competitors || [];
    const linked = linkedIds.map(id => products.find(p => p.id === id)).filter(Boolean);
    const others = products.filter(p => {
      if (p.id === ownId) return false;
      if (linkedIds.includes(p.id)) return false;
      if (cat && p.category && p.category !== cat) return false;
      if (cat && !p.category) return false;
      return true;
    });
    return [...linked, ...others];
  }

  function populateOwnProducts() {
    const ownList = getFilteredOwnProducts();
    selectA.innerHTML = '<option value="">انتخاب کنید...</option>';
    ownList.forEach(p => {
      const tag = p.type === 'own' ? 'من' : 'رقیب';
      selectA.innerHTML += `<option value="${p.id}">[${tag}] ${p.name}</option>`;
    });
    competitorsBox.innerHTML = '<span class="hint">اول محصول اصلی را انتخاب کن</span>';
    resultEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }

  function populateCompetitors() {
    const ownId = selectA.value;
    if (!ownId) {
      competitorsBox.innerHTML = '<span class="hint">اول محصول اصلی را انتخاب کن</span>';
      return;
    }
    const comps = getAvailableCompetitors(ownId);
    if (comps.length === 0) {
      competitorsBox.innerHTML = '<span class="hint">محصول دیگری برای مقایسه نیست</span>';
      return;
    }
    const own = products.find(p => p.id === ownId);
    const linked = new Set(own.competitors || []);
    const defaultSelected = linked.size > 0 ? linked : new Set(comps.slice(0, 4).map(p => p.id));
    competitorsBox.innerHTML = comps.map(p => {
      const checked = defaultSelected.has(p.id) ? 'selected' : '';
      const tag = p.type === 'own' ? 'من' : 'رقیب';
      return `
        <label class="competitor-chip ${checked}" data-id="${p.id}">
          <input type="checkbox" value="${p.id}" ${checked ? 'checked' : ''}>
          [${tag}] ${p.brand ? p.brand + ' · ' : ''}${p.name.length > 28 ? p.name.substring(0, 28) + '…' : p.name}
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
          ${p.lastPriceUpdate ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">به‌روز: ${new Intl.DateTimeFormat('fa-IR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(p.lastPriceUpdate))}</div>` : ''}
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
