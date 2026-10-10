# Optional Digikala Proxy (Cloudflare Worker)

پروژه اپل‌تو‌اپل به‌صورت پیش‌فرض مستقیم به `digikala-mcp` وصل می‌شود (CORS باز است).

اگر خواستی پروکسی خودت داشته باشی:

1. حساب رایگان Cloudflare بساز
2. Workers & Pages → Create Worker
3. محتوای `digikala-proxy.js` را paste کن و Deploy کن
4. در `js/app.js` مقدار `DIGIKALA_MCP` را به آدرس Worker خودت تغییر بده
