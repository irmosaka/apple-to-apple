const STORAGE_KEY = 'appleToApple_data_v2';

const OUR_BRANDS = ['اسنوا', 'اسنو', 'snowa', 'snow', 'دوو', 'daewoo'];

function isOurBrand(p) {
  if (!p) return false;
  const b = String(p.brand || '').toLowerCase();
  const n = String(p.name || '').toLowerCase();
  return OUR_BRANDS.some(function (x) {
    const k = x.toLowerCase();
    return b.indexOf(k) >= 0 || n.indexOf(k) >= 0;
  });
}

function classifyProductType(p) {
  return isOurBrand(p) ? 'own' : 'competitor';
}

function migrateProductTypes(products) {
  let changed = false;
  products.forEach(function (p) {
    const t = classifyProductType(p);
    if (p.type !== t) {
      p.type = t;
      changed = true;
    }
  });
  return changed;
}

async function loadData() {
  const local = localStorage.getItem(STORAGE_KEY);
  let data = null;
  if (local) {
    try { data = JSON.parse(local); } catch (e) {
      console.warn('localStorage corrupt, loading from file');
    }
  }
  if (!data) {
    try {
      const res = await fetch('data/products.json');
      data = await res.json();
    } catch (e) {
      console.error('Failed to load products.json', e);
      data = { categories: [], products: [], disabledCategories: [], meta: {} };
    }
  }
  data.categories = data.categories || [];
  data.products = data.products || [];
  data.disabledCategories = data.disabledCategories || [];
  data.meta = data.meta || {};
  if (migrateProductTypes(data.products)) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }
  return data;
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

function computeGlobalPriceUpdate(products, meta) {
  if (meta && meta.lastPriceUpdateGlobal) return meta.lastPriceUpdateGlobal;
  let max = '';
  (products || []).forEach(function (p) {
    if (p.lastPriceUpdate && p.lastPriceUpdate > max) max = p.lastPriceUpdate;
  });
  return max || '';
}

function hoursSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return (Date.now() - t) / 3600000;
}

function featureNum(val) {
  const n = parseFloat(String(val == null ? '' : val).replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

function buildBattlePoints(main, comps, allKeys) {
  const points = [];
  const priceComps = comps.map(function (c) { return c.price || 0; }).filter(Boolean);
  if (main.price && priceComps.length) {
    const minC = Math.min.apply(null, priceComps);
    const maxC = Math.max.apply(null, priceComps);
    if (main.price <= minC) {
      points.push({
        title: 'قیمت رقابتی',
        detail: 'قیمت محصول ما (' + formatPrice(main.price) + ') در سطح یا پایین‌تر از ارزان‌ترین رقیب انتخاب‌شده است.'
      });
    } else if (main.price > maxC) {
      points.push({
        title: 'قیمت بالاتر از رقبا',
        detail: 'باید با ویژگی یا گارانتی توجیه شود · ما ' + formatPrice(main.price) + ' در برابر رقیب از ' + formatPrice(minC)
      });
    } else {
      points.push({
        title: 'قیمت در میانه بازار',
        detail: 'ما ' + formatPrice(main.price) + ' · بازه رقبا ' + formatPrice(minC) + ' تا ' + formatPrice(maxC)
      });
    }
  }

  const priority = ['توان خروجی', 'توان', 'وات', 'قدرت', 'باتری', 'ظرفیت', 'صفحه نمایش', 'سایز', 'اینچ',
    'بلوتوث', 'وزن', 'گارانتی', 'امتیاز', 'رم', 'حافظه', 'ضد آب'];
  const scored = [];

  allKeys.forEach(function (key) {
    const mv = (main.features && main.features[key]) || '';
    if (!mv || mv === '—') return;
    const mNum = featureNum(mv);
    let better = 0, worse = 0, notes = [];
    const isWeight = key.indexOf('وزن') >= 0 || key.toLowerCase().indexOf('weight') >= 0;
    comps.forEach(function (c) {
      const cv = (c.features && c.features[key]) || '';
      const cNum = featureNum(cv);
      if (mNum != null && cNum != null) {
        if (isWeight) {
          if (mNum < cNum) better++;
          else if (mNum > cNum) worse++;
        } else {
          if (mNum > cNum) better++;
          else if (mNum < cNum) worse++;
        }
      } else if (mv && cv && String(mv) !== String(cv)) {
        notes.push(String(c.brand || c.name).slice(0, 12) + ': ' + cv);
      }
    });
    let pr = 0;
    priority.forEach(function (p, i) {
      if (key.indexOf(p) >= 0) pr = Math.max(pr, priority.length - i);
    });
    if (better > 0 || worse > 0 || notes.length) {
      scored.push({
        key: key,
        better: better,
        worse: worse,
        score: better * 2 - worse + pr,
        mainVal: mv,
        notes: notes
      });
    }
  });

  scored.sort(function (a, b) { return b.score - a.score; });
  scored.slice(0, 4).forEach(function (s) {
    let detail = 'ما: ' + s.mainVal;
    if (s.better && !s.worse) detail += ' · در این مشخصه نسبت به رقبا جلوتریم';
    else if (s.worse && !s.better) detail += ' · رقبا در این مورد قوی‌ترند؛ با مزیت دیگر جبران کن';
    else if (s.better && s.worse) detail += ' · نتیجه ترکیبی در برابر رقبا';
    points.push({ title: s.key, detail: detail });
  });

  return points.slice(0, 5);
}

function buildSalesScript(main, comps, points) {
  const brand = main.brand || 'برند ما';
  const name = main.name || 'این محصول';
  const rival = comps.length === 1
    ? (comps[0].brand || comps[0].name)
    : (comps.length + ' رقیب بازار');
  let hook = points[0] ? points[0].title : 'ارزش خرید';
  return 'اگر مشتری ' + rival + ' را مطرح کرد: «' + name + ' از ' + brand +
    ' را از نظر «' + hook + '» با رقبا مقایسه کنید؛ ' +
    (points[0] ? points[0].detail : 'مشخصات و قیمت را شفاف نشان دهید.') + '»';
}
