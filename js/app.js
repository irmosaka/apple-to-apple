// Loader
(async function () {
  const p1 = await fetch('js/app-part1.js').then(r => r.text());
  const p2b64 = await fetch('js/app-part2.b64').then(r => r.text());
  const p2 = decodeURIComponent(escape(atob(p2b64.trim())));
  const s = document.createElement('script');
  s.textContent = p1 + '\n' + p2;
  document.head.appendChild(s);
})();
