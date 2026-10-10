# Cloudflare Worker — پروکسی امن Gemini

کلید API فقط روی Cloudflare به‌صورت Secret ذخیره می‌شود و در گیت‌هاب یا مرورگر کاربر دیده نمی‌شود.

## ۱. نصب Wrangler

```bash
npm install -g wrangler
wrangler login
```

## ۲. دیپلوی

از پوشه `worker`:

```bash
cd worker
npx wrangler deploy
```

آدرس خروجی چیزی شبیه این است:

`https://apple-to-apple-ai.<account>.workers.dev`

## ۳. تنظیم کلید (مهم)

```bash
npx wrangler secret put GEMINI_API_KEY
```

وقتی پرسید، کلید Gemini را بچسبان (Enter).
کلید در گیت‌هاب commit نمی‌شود.

## ۴. اتصال به سایت

در صفحه مقایسه → تحلیل هوشمند → تنظیم API:
آدرس Worker را وارد و ذخیره کن.

## امنیت

- کلید فقط در env ورکر است
- سایت فقط `POST { prompt }` می‌فرستد
- اگر سایت عمومی است، هر کسی می‌تواند از سهمیه استفاده کند؛ در صورت نیاز بعداً محدودیت اضافه کن
