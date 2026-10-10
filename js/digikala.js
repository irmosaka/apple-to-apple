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
