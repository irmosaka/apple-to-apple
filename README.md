# اپل‌تو‌اپل (Apple to Apple)

مقایسه محصول به محصول — نسخه ساده برای GitHub Pages + دریافت خودکار از دیجی‌کالا

## ویژگی‌ها

- مقایسه چندرقیبی کنار هم
- دسته‌بندی محصولات
- داشبورد مدیریت (افزودن / ویرایش / حذف / ویژگی‌ها)
- **دریافت خودکار مشخصات از لینک دیجی‌کالا** (با digikala-mcp)
- Export / Import فایل JSON
- کاملاً فارسی و راست‌چین

## دیپلوی روی GitHub Pages

1. Settings → Pages → Source: branch `main`
2. آدرس: `https://irmosaka.github.io/apple-to-apple/`

## دریافت از دیجی‌کالا

در داشبورد مدیریت:

1. لینک محصول دیجی‌کالا را بچسبان (مثلاً `https://www.digikala.com/product/dkp-14851833/...`)
2. روی **دریافت از دیجی‌کالا** بزن
3. نام، برند، قیمت، عکس، دسته و ویژگی‌ها خودکار پر می‌شوند

منبع داده: سرویس عمومی [digikala-mcp](https://github.com/mmdju/digikala-mcp)  
اگر rate-limit شد، ۲۰–۳۰ ثانیه صبر کن و دوباره بزن.

## ساختار داده

```json
{
  "categories": ["گوشی موبایل"],
  "products": [
    {
      "id": "dkp-14851833",
      "name": "...",
      "brand": "سامسونگ",
      "category": "گوشی موبایل",
      "price": 121000000,
      "image": "https://...",
      "type": "own",
      "competitors": ["p2"],
      "digikalaUrl": "https://www.digikala.com/product/dkp-14851833/",
      "features": { "رم": "۸ گیگابایت", "باتری": "۵۰۰۰ میلی‌آمپرساعت" }
    }
  ]
}
```

بعد از ویرایش در داشبورد → **Export JSON** → جایگزین `data/products.json` و push.

## Worker اختیاری

پوشه `worker/` یک Cloudflare Worker آماده دارد اگر بخواهی پروکسی خودت را داشته باشی.

## لایسنس

MIT
