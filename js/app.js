// Loader
(async function () {
  const p1 = await fetch('js/app-part1.js').then(r => r.text());
  const a = await fetch('js/app-part2a.b64').then(r => r.text());
  const b = await fetch('js/app-part2b.b64').then(r => r.text());
  const p2 = decodeURIComponent(escape(atob((a+b).trim())));
  const s = document.createElement('script');
  s.textContent = p1 + '\n' + p2;
  document.head.appendChild(s);
})();
