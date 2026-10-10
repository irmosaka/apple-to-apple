/** On-page AI — Worker proxy (secure) or direct free API keys */
const AI_CFG_KEY = 'appleToApple_aiCfg';

/** After deploy, put your worker URL here (public is OK — key is NOT here) */
const DEFAULT_WORKER_URL = '';

function formatPriceAi(price) {
  if (typeof formatPrice === 'function') return formatPrice(price);
  if (!price && price !== 0) return '—';
  return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
}

function loadAiCfg() {
  try {
    return JSON.parse(localStorage.getItem(AI_CFG_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

function saveAiCfg(cfg) {
  localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg));
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

async function callGemini(apiKey, prompt) {
  const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-flash-latest'];
  let lastErr = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        model + ':generateContent?key=' + encodeURIComponent(apiKey);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = (data.error && data.error.message) || ('Gemini HTTP ' + res.status);
        lastErr = new Error(msg);
        continue;
      }
      const parts = data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts;
      if (!parts || !parts.length) {
        lastErr = new Error('پاسخ خالی از Gemini');
        continue;
      }
      return parts.map(function (p) { return p.text || ''; }).join('');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('هیچ مدل Gemini در دسترس نبود');
}

async function callGroq(apiKey, prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'تو مشاور خرید فارسی‌زبان هستی. پاسخ را فقط فارسی و کوتاه بنویس.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1024
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data.error && data.error.message) || ('Groq HTTP ' + res.status);
    throw new Error(msg);
  }
  return (data.choices && data.choices[0] && data.choices[0].message &&
    data.choices[0].message.content) || '';
}

async function callDeepSeek(apiKey, prompt) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'تو مشاور خرید فارسی‌زبان هستی. پاسخ را فقط فارسی و کوتاه بنویس.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1024
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data.error && data.error.message) || ('DeepSeek HTTP ' + res.status);
    throw new Error(msg);
  }
  return (data.choices && data.choices[0] && data.choices[0].message &&
    data.choices[0].message.content) || '';
}

async function callWorker(workerUrl, prompt) {
  const res = await fetch(workerUrl.replace(/\/$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt })
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    throw new Error((data && data.error) || ('Worker HTTP ' + res.status));
  }
  if (!data.text) throw new Error('پاسخ خالی از Worker');
  return data.text;
}

async function callFreeAi(prompt) {
  const cfg = loadAiCfg();
  const workerUrl = (cfg.workerUrl || DEFAULT_WORKER_URL || '').trim();

  if (workerUrl) {
    return callWorker(workerUrl, prompt);
  }

  const provider = cfg.provider || 'gemini';
  const key = (cfg.apiKey || '').trim();
  if (!key) throw new Error('NO_KEY');

  if (provider === 'groq') return callGroq(key, prompt);
  if (provider === 'deepseek') return callDeepSeek(key, prompt);
  return callGemini(key, prompt);
}

function renderAiSettings(container) {
  const cfg = loadAiCfg();
  const wurl = cfg.workerUrl || DEFAULT_WORKER_URL || '';
  container.innerHTML =
    '<div class="ai-settings" style="margin-bottom:12px;padding:12px;border:1px solid var(--border,#e2e8f0);border-radius:10px;background:#f8fafc">' +
      '<div style="font-weight:600;margin-bottom:8px">اتصال امن (Cloudflare Worker)</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
        '<input id="aiWorkerUrl" type="url" placeholder="https://apple-to-apple-ai.xxx.workers.dev" value="' +
          String(wurl).replace(/"/g, '"') + '" ' +
          'style="flex:1;min-width:220px;padding:8px;border-radius:8px;border:1px solid #e2e8f0;font-family:inherit">' +
        '<button type="button" class="btn btn-primary btn-sm" id="aiSaveKey">ذخیره</button>' +
      '</div>' +
      '<div style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;margin-bottom:10px">' +
        'کلید Gemini روی Worker به‌صورت Secret می‌ماند (نه در گیت‌هاب، نه در مرورگر). ' +
        'راهنما: پوشه <code>worker/</code> در ریپو.' +
      '</div>' +
      '<details><summary style="cursor:pointer;font-size:0.85rem">روش مستقیم (فقط خودت — کلید در مرورگر)</summary>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">' +
          '<select id="aiProvider" style="padding:8px;border-radius:8px;border:1px solid #e2e8f0;font-family:inherit">' +
            '<option value="gemini"' + ((cfg.provider || 'gemini') === 'gemini' ? ' selected' : '') + '>Gemini</option>' +
            '<option value="groq"' + (cfg.provider === 'groq' ? ' selected' : '') + '>Groq</option>' +
            '<option value="deepseek"' + (cfg.provider === 'deepseek' ? ' selected' : '') + '>DeepSeek</option>' +
          '</select>' +
          '<input id="aiApiKey" type="password" placeholder="API Key (اختیاری)" value="' +
            (cfg.apiKey || '').replace(/"/g, '"') + '" style="flex:1;min-width:160px;padding:8px;border-radius:8px;border:1px solid #e2e8f0;font-family:inherit">' +
        '</div>' +
      '</details>' +
    '</div>';

  const saveBtn = document.getElementById('aiSaveKey');
  if (saveBtn) {
    saveBtn.onclick = function () {
      const workerUrl = (document.getElementById('aiWorkerUrl').value || '').trim();
      const providerEl = document.getElementById('aiProvider');
      const keyEl = document.getElementById('aiApiKey');
      saveAiCfg({
        workerUrl: workerUrl,
        provider: providerEl ? providerEl.value : 'gemini',
        apiKey: keyEl ? keyEl.value.trim() : (cfg.apiKey || '')
      });
      saveBtn.textContent = 'ذخیره شد ✓';
      setTimeout(function () { saveBtn.textContent = 'ذخیره'; }, 1500);
    };
  }
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
    '<div class="ai-box-header"><strong>✨ تحلیل هوشمند</strong>' +
      '<button type="button" class="btn btn-outline btn-sm" id="aiToggleSettings">تنظیم API</button>' +
    '</div>' +
    '<div id="aiSettingsWrap"></div>' +
    '<div id="aiLiveStatus" style="color:var(--text-muted);margin-bottom:10px"></div>' +
    '<div id="aiLiveResult" class="ai-text" style="min-height:80px;white-space:pre-wrap"></div>' +
    '<div id="aiLocalFallback" style="margin-top:12px"></div>';

  const settingsWrap = document.getElementById('aiSettingsWrap');
  const cfg = loadAiCfg();
  const needKey = !((cfg.workerUrl || DEFAULT_WORKER_URL || '').trim() || (cfg.apiKey && cfg.apiKey.trim()));
  if (needKey) renderAiSettings(settingsWrap);
  else settingsWrap.innerHTML = '';

  const toggle = document.getElementById('aiToggleSettings');
  if (toggle) {
    toggle.onclick = function () {
      if (settingsWrap.innerHTML) settingsWrap.innerHTML = '';
      else renderAiSettings(settingsWrap);
    };
  }

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const statusEl = document.getElementById('aiLiveStatus');
  const resultEl = document.getElementById('aiLiveResult');
  const fallbackEl = document.getElementById('aiLocalFallback');

  fallbackEl.innerHTML =
    '<details open><summary style="cursor:pointer;color:var(--text-muted);font-size:0.85rem">خلاصه محلی (بدون API)</summary>' +
    '<pre class="ai-text" style="margin-top:8px"></pre></details>';
  const pre = fallbackEl.querySelector('pre');
  if (pre) pre.textContent = localReport;

  if (needKey) {
    statusEl.textContent = 'آدرس Worker یا API Key را در تنظیمات ذخیره کن.';
    return;
  }

  statusEl.textContent = 'در حال تحلیل...';
  try {
    const text = (await callFreeAi(prompt)).trim();
    if (!text) throw new Error('پاسخ خالی');
    statusEl.textContent = 'تحلیل AI آماده است';
    resultEl.textContent = text;
    const det = fallbackEl.querySelector('details');
    if (det) det.open = false;
  } catch (err) {
    console.warn(err);
    let msg = err.message || String(err);
    if (msg === 'NO_KEY') {
      statusEl.textContent = 'API Key / Worker تنظیم نشده.';
      renderAiSettings(settingsWrap);
    } else if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      statusEl.textContent = 'اتصال برقرار نشد (شبکه/فیلتر). خلاصه محلی بالاست.';
    } else {
      statusEl.textContent = 'خطا: ' + msg + ' — خلاصه محلی نمایش داده شد.';
    }
  }
}

window.showAiAnalysis = function (all, allKeys) {
  return runOnPageAiAnalysis(all, allKeys);
};
window.runOnPageAiAnalysis = runOnPageAiAnalysis;
