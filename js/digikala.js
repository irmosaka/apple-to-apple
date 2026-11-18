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

function isUpstreamBlock(msg) {
  return /HTTP 403|rejected the request|CDN keeps asking|temporarily not serving|bot|forbidden/i.test(String(msg || ''));
}

function isRetryable(msg) {
  return isUpstreamBlock(msg) || /rate-limit|15-30|temporarily|429/i.test(String(msg || ''));
}

async function mcpCall(toolName, args, retries = 2) {
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
        const wait = parseInt(res.headers.get('retry-after') || '20', 10) * 1000;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, Math.min(wait, 30000)));
          continue;
        }
        throw new Error('محدودیت نرخ سرویس (۴۲۹). کمی صبر کنید و دوباره بزنید.');
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

      if (payload.error) {
        throw new Error(payload.error.message || 'خطای MCP');
      }

      const content = payload.result && payload.result.content && payload.result.content[0]
        ? payload.result.content[0].text
        : null;

      if (payload.result && payload.result.isError) {
        const msg = content || 'خطا در دریافت داده';
        lastErr = new Error(msg);
        if (isRetryable(msg) && attempt < retries) {
          await new Promise(r => setTimeout(r, isUpstreamBlock(msg) ? 8000 : 20000));
          continue;
        }
        if (isUpstreamBlock(msg)) {
          throw new Error('دیجی‌کالا درخواست را با خطای ۴۰۳ رد کرد (مسدودسازی موقت CDN). چند دقیقه صبر کنید یا از مسیر جایگزین قیمت استفاده می‌شود.');
        }
        throw lastErr;
      }

      if (!content) throw new Error('داده خالی برگشت');
      return JSON.parse(content);
    } catch (e) {
      lastErr = e;
      if (attempt < retries && isRetryable(e.message)) {
        await new Promise(r => setTimeout(r, 8000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('خطای ناشناخته MCP');
}

/** Extract latest price from product_price_chart response */
function priceFromChart(chart) {
  if (!chart) return null;
  if (chart.current_price_toman) return chart.current_price_toman;
  const variants = chart.variants || chart.series || [];
  let best = null;
  let bestDay = '';
  variants.forEach(function (v) {
    const points = v.points || [];
    points.forEach(function (pt) {
      const day = String(pt.day || pt.date || '');
      const price = pt.price_toman || pt.price;
      if (price && day >= bestDay) {
        bestDay = day;
        best = price;
      }
    });
    if (!points.length && v.cheapest_in_window_toman) {
      if (best == null) best = v.cheapest_in_window_toman;
    }
  });
  return best;
}

function mapDigikalaToProduct(d, type) {
  type = type || 'competitor';
  const features = {};

  if (Array.isArray(d.specs)) {
    d.specs.forEach(function (group) {
      (group.attributes || []).forEach(function (attr) {
        if (attr.title && attr.value) {
          features[attr.title] = attr.value;
        }
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

  const aliases = [
    ['رم', ['حافظه RAM', 'حافظه رم', 'RAM']],
    ['حافظه داخلی', ['حافظه داخلی', 'ظرفیت حافظه داخلی']],
    ['باتری', ['ظرفیت باتری', 'باتری']],
    ['شارژ سریع', ['توان شارژ', 'شارژ سریع']],
    ['صفحه نمایش', ['اندازه صفحه نمایش', 'صفحه نمایش', 'نوع صفحه نمایش']],
    ['دوربین اصلی', ['رزولوشن دوربین اصلی', 'دوربین اصلی']],
    ['پردازنده', ['تراشه', 'پردازنده', 'چیپست']]
  ];
  aliases.forEach(function (pair) {
    const canonical = pair[0];
    const keys = pair[1];
    if (features[canonical]) return;
    for (let i = 0; i < keys.length; i++) {
      if (features[keys[i]]) {
        features[canonical] = features[keys[i]];
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
    features: features
  };
}

/**
 * Fetch product. If product_details is blocked (403), fall back to
 * product_price_chart for price-only refresh.
 */
async function fetchDigikalaProduct(urlOrId) {
  const id = typeof urlOrId === 'number' ? urlOrId : extractDkpId(urlOrId);
  if (!id) throw new Error('آیدی محصول (dkp-...) در لینک پیدا نشد');

  try {
    const details = await mcpCall('product_details', {
      id: id,
      include_specs: true,
      include_comments: 0
    }, 1);
    return { raw: details, product: mapDigikalaToProduct(details), source: 'product_details' };
  } catch (err) {
    if (!isUpstreamBlock(err.message) && !/۴۰۳|403/.test(err.message)) {
      throw err;
    }
    // Fallback: price chart still works when product_details is blocked
    const chart = await mcpCall('product_price_chart', { id: id }, 1);
    const price = priceFromChart(chart);
    if (price == null) {
      throw new Error('دیجی‌کالا جزئیات محصول را مسدود کرده و از نمودار هم قیمت استخراج نشد. چند دقیقه بعد دوباره تلاش کنید.');
    }
    const raw = {
      id: id,
      price_toman: price,
      url: 'https://www.digikala.com/product/dkp-' + id + '/',
      _source: 'product_price_chart',
      _note: 'قیمت از آخرین نقطه نمودار (product_details موقتاً ۴۰۳ می‌دهد)'
    };
    return {
      raw: raw,
      product: mapDigikalaToProduct(raw),
      source: 'product_price_chart'
    };
  }
}

/** Price-only refresh — prefers chart first when details are flaky */
async function fetchDigikalaPriceOnly(urlOrId) {
  const id = typeof urlOrId === 'number' ? urlOrId : extractDkpId(urlOrId);
  if (!id) throw new Error('آیدی محصول (dkp-...) در لینک پیدا نشد');

  // Chart is currently more reliable against Digikala 403
  try {
    const chart = await mcpCall('product_price_chart', { id: id }, 1);
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
    console.warn('price_chart failed, trying product_details', e);
  }

  const details = await mcpCall('product_details', {
    id: id,
    include_specs: false,
    include_comments: 0
  }, 1);
  if (!details.price_toman) throw new Error('قیمت در پاسخ دیجی‌کالا نبود');
  return {
    id: id,
    price_toman: details.price_toman,
    url: details.url || ('https://www.digikala.com/product/dkp-' + id + '/'),
    source: 'product_details'
  };
}
