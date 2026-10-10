// Client-side admin gate (not server-grade security)
const ADMIN_HASH_KEY = 'appleToApple_adminHash';
const ADMIN_SESSION_KEY = 'appleToApple_adminSession';

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
}

function showAdminApp() {
  const gate = document.getElementById('loginGate');
  const main = document.getElementById('adminMain');
  if (gate) gate.style.display = 'none';
  if (main) main.style.display = 'block';
}

function showLoginGate() {
  const gate = document.getElementById('loginGate');
  const main = document.getElementById('adminMain');
  if (gate) gate.style.display = 'block';
  if (main) main.style.display = 'none';
}

window.tryAdminLogin = async function () {
  const input = document.getElementById('adminPassword');
  const err = document.getElementById('loginError');
  const pwd = (input && input.value) || '';
  if (!pwd) {
    if (err) { err.style.display = 'block'; err.textContent = 'رمز را وارد کنید'; }
    return;
  }
  const hash = await sha256(pwd);
  const stored = localStorage.getItem(ADMIN_HASH_KEY);
  if (!stored) {
    localStorage.setItem(ADMIN_HASH_KEY, hash);
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    showAdminApp();
    if (typeof bootApp === 'function') bootApp();
    return;
  }
  if (hash === stored) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    showAdminApp();
    if (typeof bootApp === 'function') bootApp();
  } else {
    if (err) { err.style.display = 'block'; err.textContent = 'رمز اشتباه است'; }
  }
};

window.adminLogout = function () {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  showLoginGate();
  const input = document.getElementById('adminPassword');
  if (input) input.value = '';
};

window.changeAdminPassword = async function () {
  const next = prompt('رمز جدید را وارد کنید:');
  if (!next || !next.trim()) return;
  const hash = await sha256(next.trim());
  localStorage.setItem(ADMIN_HASH_KEY, hash);
  alert('رمز به‌روز شد');
};

document.addEventListener('DOMContentLoaded', function () {
  if (!document.getElementById('loginGate')) return;
  if (isAdminLoggedIn()) {
    showAdminApp();
  } else {
    showLoginGate();
  }
  const input = document.getElementById('adminPassword');
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryAdminLogin();
    });
  }
});
