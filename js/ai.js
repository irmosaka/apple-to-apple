/** On-page free AI analysis via Puter.js (no API key for the site owner) */
function formatPriceAi(price) {
  if (typeof formatPrice === 'function') return formatPrice(price);
  if (!price && price !== 0) return '—';
  return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
}

function buildLocalReport(all, allKeys) {
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
  lines.push('مقایسه ' + all.length + ' محصول:');
  all.forEach(function (p, i) {
    lines.push((i + 1) + ') ' + p.name + (p.brand ? ' (' + p.brand + ')' : '') +
      ' — قیمت: ' + formatPriceAi(p.price));
  });
  if (cheapest && expensive && cheapest.id !== expensive.id) {
    lines.push('ارزان‌ترین: ' + cheapest.name + ' (' + formatPriceAi(cheapest.price) + ')');
    lines.push('گران‌ترین: ' + expensive.name + ' (' + formatPriceAi(expensive.price) + ')');
  }
  lines.push('تفاوت مشخصات:');
  diffs.slice(0, 15).forEach(function (d) {
    lines.push('- ' + d.key + ': ' + d.vals.join(' | '));
  });
  lines.push('برتری عددی: ' + all.map(function (p, i) {
    return p.name.substring(0, 25) + '=' + winCounts[i];
  }).join('، '));
  lines.push('پیشنهاد ارزش: ' + valueBest.name);
  lines.push('پیشنهاد برتری مشخصات: ' + all[bestIdx].name);
  return lines.join('\n');
}

function extractAiText(resp) {
  if (resp == null) return '';
  if (typeof resp === 'string') return resp;
  if (resp.message) {
    if (typeof resp.message === 'string') return resp.message;
    if (resp.message.content) {
      if (typeof resp.message.content === 'string') return resp.message.content;
      if (Array.isArray(resp.message.content)) {
        return resp.message.content.map(function (c) {
          return typeof c === 'string' ? c : (c.text || c.content || '');
        }).join('');
      }
    }
  }
  if (resp.text) return resp.text;
  if (resp.content) return typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
  return String(resp);
}

async function runOnPageAiAnalysis(all, allKeys) {
  const box = document.getElementById('aiAnalysisBox');
  if (!box) return;

  const localReport = buildLocalReport(all, allKeys);
  const prompt =
    'تو مشاور خرید فارسی‌زبان هستی. بر اساس داده‌های زیر، یک تحلیل کوتاه و کاربردی بنویس.\n' +
    'ساختار پاسخ:\n' +
    '1) خلاصه مقایسه در ۲–۳ جمله\n' +
    '2) نقاط قوت و ضعف هر محصول (کوتاه)\n' +
    '3) برای چه کسی کدام بهتر است\n' +
    '4) یک توصیه نهایی واضح\n' +
    'فقط فارسی بنویس. اغراق نکن.\n\n' +
    'داده‌ها:\n' + localReport;

  box.classList.remove('hidden');
  box.innerHTML =
    '<div class="ai-box-header"><strong>✨ تحلیل هوشمند</strong></div>' +
    '<div id="aiLiveStatus" style="color:var(--text-muted);margin-bottom:10px">در حال تحلیل روی همین صفحه...</div>' +
    '<div id="aiLiveResult" class="ai-text" style="min-height:80px;white-space:pre-wrap"></div>' +
    '<div id="aiLocalFallback" class="hidden" style="margin-top:12px"></div>' +
    '<p class="ai-hint">تحلیل روی همین صفحه انجام می‌شود. ممکن است یک‌بار ورود رایگان Puter لازم باشد (هزینه برای صاحب سایت نیست).</p>';

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const statusEl = document.getElementById('aiLiveStatus');
  const resultEl = document.getElementById('aiLiveResult');
  const fallbackEl = document.getElementById('aiLocalFallback');

  if (typeof puter !== 'undefined' && puter.ai && puter.ai.chat) {
    try {
      statusEl.textContent = 'در حال دریافت پاسخ از مدل رایگان...';
      let resp;
      try {
        resp = await puter.ai.chat(prompt, { model: 'gpt-5-nano' });
      } catch (e1) {
        try {
          resp = await puter.ai.chat(prompt, { model: 'gemini-2.5-flash-lite' });
        } catch (e2) {
          resp = await puter.ai.chat(prompt);
        }
      }
      const text = extractAiText(resp).trim();
      if (text) {
        statusEl.textContent = 'تحلیل آماده است';
        resultEl.textContent = text;
        fallbackEl.classList.remove('hidden');
        fallbackEl.innerHTML =
          '<details><summary style="cursor:pointer;color:var(--text-muted);font-size:0.85rem">نمایش خلاصه محلی</summary>' +
          '<pre class="ai-text" style="margin-top:8px"></pre></details>';
        const pre = fallbackEl.querySelector('pre');
        if (pre) pre.textContent = localReport;
        return;
      }
    } catch (err) {
      console.warn('Puter AI failed', err);
      statusEl.textContent = 'مدل آنلاین در دسترس نبود — خلاصه محلی نمایش داده شد.';
    }
  } else {
    statusEl.textContent = 'کتابخانه AI بارگذاری نشد — خلاصه محلی نمایش داده شد.';
  }

  resultEl.textContent = localReport;
  fallbackEl.classList.add('hidden');
}

window.showAiAnalysis = function (all, allKeys) {
  return runOnPageAiAnalysis(all, allKeys);
};
