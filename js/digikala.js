// ===================== Digikala Integration (via digikala-mcp) =====================
// Cache-bust note: bump ?v= on script tags in HTML when this file changes.
const DIGIKALA_MCP = 'https://digikala-mcp.mmdju.workers.dev/mcp';

function extractDkpId(url) {
  if (!url) return null;
  const m = String(url).match(/dkp-(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const n = String(url).trim().match(/^\d+$/);
  if (n) return parseInt(n[0], 10);
  return null;
}

function isUpstreamBlock(msg) {
  const s = String(msg || '');
  return /HTTP\s*403|rejected the request|CDN keeps asking|temporarily not serving|bot|forbidden|۴۰۳|مسدود/i.test(s);
}

function isRetryable(msg) {
  return isUpstreamBlock(msg) || /rate-limit|15-30|temporarily|429/i.test(String(msg || ''));
}

function friendlyDigikalaError(msg) {
  const s = String(msg || '');
  if (isUpstreamBlock(s)) {
    return 'دیجی‌کالا موقتاً دسترسی را مسدود کرده (۴۰۳). چند دقیقه صبر کنید؛ اگر ادامه داشت از «جستجو» یا قیمت دستی استفاده کنید.';
  }
  if (/429|rate/i.test(s)) {
    return 'محدودیت تعداد درخواست. ۲۰–۳۰ ثانیه صبر کنید و دوباره بزنید.';
  }
  if (/Digikala rejected|Rephrase or narrow/i.test(s)) {
    return 'دیجی‌کالا درخواست را رد کرد (۴۰۳). لطفاً چند دقیقه بعد دوباره تلاش کنید.';
  }
  return s || 'خطا در ارتباط با دیجی‌کالا';
}

async function mcpCall(toolName, args, retries) {
  if (retries == null) retries = 1;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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

      if (res.status === 429) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 20000));
          continue;
        }
        throw new Error(friendlyDigikalaError('429'));
      }

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
      if (payload.error) throw new Error(friendlyDigikalaError(payload.error.message || 'خطای MCP'));

      const content = payload.result && payload.result.content && payload.result.content[0]
        ? payload.result.content[0].text
        : null;

      if (payload.result && payload.result.isError) {
        const msg = content || 'خطا در دریافت داده';
        lastErr = new Error(friendlyDigikalaError(msg));
        if (isRetryable(msg) && attempt < retries) {
          await new Promise(r => setTimeout(r, isUpstreamBlock(msg) ? 5000 : 15000));
          continue;
        }
        throw lastErr;
      }

      if (!content) throw new Error('داده خالی برگشت');
      return JSON.parse(content);
    } catch (e) {
      lastErr = e;
      const m = e && e.message ? e.message : String(e);
      if (attempt < retries && isRetryable(m)) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      if (e && e.message && /Digikala rejected|HTTP 403|Rephrase/i.test(e.message)) {
        throw new Error(friendlyDigikalaError(e.message));
      }
      throw e;
    }
  }
  throw lastErr || new Error('خطای ناشناخته MCP');
}

function priceFromChart(chart) {
  if (!chart) return null;
  if (chart.current_price_toman) return chart.current_price_toman;
  const variants = chart.variants || chart.series || [];
  let best = null;
  let bestDay = '';
  variants.forEach(function (v) {
    (v.points || []).forEach(function (pt) {
      const day = String(pt.day || pt.date || '');
      const price = pt.price_toman || pt.price;
      if (price && day >= bestDay) {
        bestDay = day;
        best = price;
      }
    });
    if (!(v.points || []).length && v.cheapest_in_window_toman && best == null) {
      best = v.cheapest_in_window_toman;
    }
  });
  return best;
}

async function priceFromSearch(id, hintName) {
  const queries = [];
  if (hintName && String(hintName).trim()) queries.push(String(hintName).trim().slice(0, 80));
  queries.push('dkp-' + id);
  queries.push(String(id));

  for (let q = 0; q < queries.length; q++) {
    try {
      const data = await mcpCall('search_digikala', { query: queries[q], limit: 20 }, 0);
      const items = (data && data.items) || [];
      const hit = items.find(function (it) { return Number(it.id) === Number(id); });
      if (hit && hit.price_toman) {
        return {
          id: id,
          price_toman: hit.price_toman,
          title: hit.title,
          url: hit.url || ('https://www.digikala.com/product/dkp-' + id + '/'),
          image: hit.image || '',
          brand: hit.brand || '',
          source: 'search_digikala'
        };
      }
    } catch (e) {
      console.warn('search fallback failed', queries[q], e);
    }
  }
  return null;
}

function mapDigikalaToProduct(d, type) {
  type = type || 'competitor';
  const features = {};
  if (Array.isArray(d.specs)) {
    d.specs.forEach(function (group) {
      (group.attributes || []).forEach(function (attr) {
        if (attr.title && attr.value) features[attr.title] = attr.value;
      });
    });
  }
  if (d.warranty) features['گارانتی'] = d.warranty;
  if (d.rating_stars) {
    features['امتیاز'] = d.rating_count
      ? (d.rating_stars + ' از ۵ (' + d.rating_count + ' نظر)')
      : String(d.rating_stars);
  }
  if (d.seller && d.seller.name) features['فروشنده'] = d.seller.name;

  return {
    id: 'dkp-' + d.id,
    name: d.title || d.name || '',
    brand: d.brand || '',
    category: d.category || '',
    price: d.price_toman || 0,
    image: d.image || '',
    type: type,
    digikalaUrl: d.url || ('https://www.digikala.com/product/dkp-' + d.id + '/'),
    competitors: [],
    features: features
  };
}

async function fetchDigikalaPriceOnly(urlOrId, hintName) {
  const id = typeof urlOrId === 'number' ? urlOrId : extractDkpId(urlOrId);
  if (!id) throw new Error('آیدی محصول (dkp-...) در لینک پیدا نشد');

  try {
    const chart = await mcpCall('product_price_chart', { id: id }, 0);
    const price = priceFromChart(chart);
    if (price != null) {
      return {
        id: id,
        price_toman: price,
        url: 'https://www.digikala.com/product/dkp-' + id + '/',
        source: 'product_price_chart'
      };
    }
  } catch (e) {
    console.warn('price_chart failed', e && e.message);
  }

  try {
    const details = await mcpCall('product_details', {
      id: id, include_specs: false, include_comments: 0
    }, 0);
    if (details && details.price_toman) {
      return {
        id: id,
        price_toman: details.price_toman,
        url: details.url || ('https://www.digikala.com/product/dkp-' + id + '/'),
        source: 'product_details'
      };
    }
  } catch (e) {
    console.warn('product_details failed', e && e.message);
  }

  const fromSearch = await priceFromSearch(id, hintName);
  if (fromSearch) return fromSearch;

  throw new Error(friendlyDigikalaError('HTTP 403'));
}

async function fetchDigikalaProduct(urlOrId, hintName) {
  const id = typeof urlOrId === 'number' ? urlOrId : extractDkpId(urlOrId);
  if (!id) throw new Error('آیدی محصول (dkp-...) در لینک پیدا نشد');

  try {
    const details = await mcpCall('product_details', {
      id: id, include_specs: true, include_comments: 0
    }, 0);
    return { raw: details, product: mapDigikalaToProduct(details), source: 'product_details' };
  } catch (err) {
    const priceInfo = await fetchDigikalaPriceOnly(id, hintName);
    const raw = {
      id: id,
      price_toman: priceInfo.price_toman,
      title: priceInfo.title || '',
      image: priceInfo.image || '',
      url: priceInfo.url,
      _source: priceInfo.source
    };
    return { raw: raw, product: mapDigikalaToProduct(raw), source: priceInfo.source };
  }
}
