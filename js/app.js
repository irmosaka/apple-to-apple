// Loader: loads app in two parts then runs
(async function () {
  const p1 = await fetch('js/app-part1.js').then(r => r.text());
  const p2 = await fetch('js/app-part2.js').then(r => r.text());
  const s = document.createElement('script');
  s.textContent = p1 + '\n' + p2;
  document.head.appendChild(s);
})();
