/** Local brand supervisor — focuses on اسنوا / دوو vs competitors. No online API. */
const OUR_BRANDS = ['اسنوا', 'اسنو', 'snowa', 'snow', 'دوو', 'daewoo', 'dae woo'];

function formatPriceAi(price) {
  if (typeof formatPrice === 'function') return formatPrice(price);
  if (!price && price !== 0) return '—';
  return new Intl.NumberFormat('fa-IR').format(price) + ' تومان';
}

function isOurBrand(p) {
  const b = String(p.brand || '').toLowerCase().trim();
  const n = String(p.name || '').toLowerCase();
  if (!b && !n) return false;
  return OUR_BRANDS.some(function (x) {
    const k = x.toLowerCase();
    return b.indexOf(k) >= 0 || n.indexOf(k) >= 0;
  });
}

function numFrom(val) {
  if (val == null || val === '—') return NaN;
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''));
  return isNaN(n) ? NaN : n;
}

function buildSupervisorReport(all, allKeys) {
  const ours = all.filter(isOurBrand);
  const rivals = all.filter(function (p) { return !isOurBrand(p); });

  const diffs = [];
  allKeys.forEach(function (key) {
    const vals = all.map(function (p) { return (p.features && p.features[key]) || '—'; });
    const uniq = {};
    vals.forEach(function (v) { uniq[v] = true; });
    if (Object.keys(uniq).length > 1) diffs.push({ key: key, vals: vals });
  });

  const weightKeys = /وزن|weight/i;
  const score = all.map(function () { return 0; });
  diffs.forEach(function (d) {
    const nums = d.vals.map(numFrom);
    if (!nums.every(function (n) { return !isNaN(n); })) return;
    const isW = weightKeys.test(d.key);
    let best = 0;
    for (let i = 1; i < nums.length; i++) {
      if (isW ? nums[i] < nums[best] : nums[i] > nums[best]) best = i;
    }
    const sorted = nums.slice().sort(function (a, b) { return isW ? a - b : b - a; });
    if (sorted[0] !== sorted[1]) score[best]++;
  });

  const byPrice = all.filter(function (p) { return p.price > 0; })
    .slice().sort(function (a, b) { return a.price - b.price; });

  let lines = [];
  lines.push('🧭 گزارش ناظر برند (اسنوا / دوو)');
  lines.push('────────────────────────');
  lines.push('');

  lines.push('۱) ترکیب مقایسه');
  if (ours.length) {
    lines.push('  محصولات برند خودمان:');
    ours.forEach(function (p) {
      lines.push('    • ' + p.name + (p.brand ? ' (' + p.brand + ')' : '') + ' — ' + formatPriceAi(p.price));
    });
  } else {
    lines.push('  ⚠ در این مقایسه محصولی با برند اسنوا یا دوو پیدا نشد.');
    lines.push('  پیشنهاد: محصول اصلی را از برند اسنوا/دوو انتخاب کن تا تحلیل ناظر معنا پیدا کند.');
  }
  if (rivals.length) {
    lines.push('  رقبا:');
    rivals.forEach(function (p) {
      lines.push('    • ' + p.name + (p.brand ? ' (' + p.brand + ')' : '') + ' — ' + formatPriceAi(p.price));
    });
  } else {
    lines.push('  رقیبی در مقایسه نیست.');
  }

  lines.push('');
  lines.push('۲) موقعیت قیمتی');
  if (byPrice.length >= 2) {
    lines.push('  ارزان‌ترین: «' + byPrice[0].name + '» (' + formatPriceAi(byPrice[0].price) + ')');
    lines.push('  گران‌ترین: «' + byPrice[byPrice.length - 1].name + '» (' + formatPriceAi(byPrice[byPrice.length - 1].price) + ')');
    ours.forEach(function (p) {
      if (!p.price) return;
      const cheaperRivals = rivals.filter(function (r) { return r.price > 0 && r.price < p.price; });
      const pricierRivals = rivals.filter(function (r) { return r.price > 0 && r.price > p.price; });
      if (cheaperRivals.length) {
        lines.push('  «' + p.name + '» از ' + cheaperRivals.length + ' رقیب گران‌تر است → روی ارزش‌افزوده (گارانتی، خدمات، کیفیت ساخت) تاکید کن.');
      }
      if (pricierRivals.length && !cheaperRivals.length) {
        lines.push('  «' + p.name + '» نسبت به رقبا قیمت رقابتی/بهتری دارد → فرصت فروش روی قیمت.');
      }
    });
  } else {
    lines.push('  داده قیمت کافی برای جمع‌بندی نیست.');
  }

  lines.push('');
  lines.push('۳) برتری مشخصات (عددی)');
  all.forEach(function (p, i) {
    const tag = isOurBrand(p) ? '[برند ما]' : '[رقیب]';
    lines.push('  ' + tag + ' «' + p.name + '»: ' + score[i] + ' برتری عددی');
  });

  lines.push('');
  lines.push('۴) شکاف‌های مهم نسبت به رقبا');
  let gapCount = 0;
  if (ours.length && rivals.length) {
    diffs.forEach(function (d) {
      const nums = d.vals.map(numFrom);
      if (!nums.every(function (n) { return !isNaN(n); })) return;
      const isW = weightKeys.test(d.key);
      ours.forEach(function (op) {
        const oi = all.indexOf(op);
        rivals.forEach(function (rp) {
          const ri = all.indexOf(rp);
          if (isNaN(nums[oi]) || isNaN(nums[ri])) return;
          const weLose = isW ? nums[oi] > nums[ri] : nums[oi] < nums[ri];
          if (weLose) {
            gapCount++;
            if (gapCount <= 8) {
              lines.push('  • ' + d.key + ': ما=' + d.vals[oi] + ' | رقیب (' + (rp.brand || rp.name.substring(0, 18)) + ')=' + d.vals[ri]);
            }
          }
        });
      });
    });
  }
  if (gapCount === 0) {
    lines.push('  شکاف عددی واضحی ثبت نشد (یا داده عددی مشترک کم است).');
  } else if (gapCount > 8) {
    lines.push('  … و ' + (gapCount - 8) + ' مورد دیگر');
  }

  lines.push('');
  lines.push('۵) توصیه ناظر');
  if (!ours.length) {
    lines.push('  اول یک محصول اسنوا یا دوو را به‌عنوان محور مقایسه بگذار.');
  } else if (!rivals.length) {
    lines.push('  حداقل یک رقیب اضافه کن تا گزارش رقابتی کامل شود.');
  } else {
    let bestOurs = ours[0];
    let bestS = -1;
    ours.forEach(function (p) {
      const i = all.indexOf(p);
      const s = score[i] * 1000000 + (1e12 / Math.max(p.price || 1e12, 1));
      if (s > bestS) { bestS = s; bestOurs = p; }
    });
    lines.push('  محور پیشنهادی فروش: «' + bestOurs.name + '»');
    lines.push('  در ارائه به مشتری: تفاوت قیمت را شفاف بگو، روی خدمات پس از فروش و گارانتی برند خودت تاکید کن،');
    lines.push('  و فقط روی مشخصاتی مانور بده که واقعاً برتری عددی یا کیفی داری.');
  }

  lines.push('');
  lines.push('— تحلیل محلی ناظر برند · بدون اتصال آنلاین');
  return lines.join('\n');
}

async function runOnPageAiAnalysis(all, allKeys) {
  const box = document.getElementById('aiAnalysisBox');
  if (!box) return;

  const report = buildSupervisorReport(all, allKeys);

  box.classList.remove('hidden');
  box.innerHTML =
    '<div class="ai-box-header">' +
      '<div><strong>🧭 ناظر برند (اسنوا / دوو)</strong> ' +
      '<span class="ai-badge">فقط محلی</span></div>' +
      '<button type="button" class="btn btn-outline btn-sm" id="btnCopyAi">کپی متن</button>' +
    '</div>' +
    '<pre class="ai-text" id="aiReportText"></pre>' +
    '<p class="ai-hint">این گزارش بدون اینترنت و فقط از روی مشخصات ذخیره‌شده ساخته می‌شود. تمرکز روی جایگاه برندهای اسنوا و دوو در برابر رقباست.</p>';

  const pre = document.getElementById('aiReportText');
  if (pre) pre.textContent = report;

  const copyBtn = document.getElementById('btnCopyAi');
  if (copyBtn) {
    copyBtn.onclick = function () {
      navigator.clipboard.writeText(report).then(function () {
        copyBtn.textContent = 'کپی شد ✓';
        setTimeout(function () { copyBtn.textContent = 'کپی متن'; }, 2000);
      });
    };
  }
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.showAiAnalysis = function (all, allKeys) {
  return runOnPageAiAnalysis(all, allKeys);
};
window.runOnPageAiAnalysis = runOnPageAiAnalysis;
