// Client-side admin gate (not server-grade security)
const ADMIN_HASH_KEY = 'appleToApple_adminHash_v2';
const ADMIN_SESSION_KEY = 'appleToApple_adminSession';
const DEFAULT_ADMIN_PASSWORD = '1751366';

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
}

function setLoginError(msg) {
  const err = document.getElementById('loginError');
  if (!err) return;
  if (msg) {
    err.hidden = false;
    err.textContent = msg;
  } else {
    err.hidden = true;
    err.textContent = '';
  }
}

function setLoginLoading(on) {
  const btn = document.getElementById('loginSubmit');
  if (!btn) return;
  btn.disabled = !!on;
  const label = btn.querySelector('.btn-label');
  const loading = btn.querySelector('.btn-loading');
  if (label) label.hidden = !!on;
  if (loading) loading.hidden = !on;
}

function showAdminApp() {
  const gate = document.getElementById('loginGate');
  const main = document.getElementById('adminMain');
  document.body.classList.remove('admin-locked');
  document.body.classList.add('admin-authed');
  if (gate) {
    gate.hidden = true;
    gate.style.display = 'none';
  }
  if (main) {
    main.hidden = false;
    main.style.display = 'block';
  }
}

function showLoginGate() {
  const gate = document.getElementById('loginGate');
  const main = document.getElementById('adminMain');
  document.body.classList.add('admin-locked');
  document.body.classList.remove('admin-authed');
  if (gate) {
    gate.hidden = false;
    gate.style.display = '';
  }
  if (main) {
    main.hidden = true;
    main.style.display = 'none';
  }
  setLoginError('');
  setLoginLoading(false);
}

async function ensureDefaultPassword() {
  if (!localStorage.getItem(ADMIN_HASH_KEY)) {
    const hash = await sha256(DEFAULT_ADMIN_PASSWORD);
    localStorage.setItem(ADMIN_HASH_KEY, hash);
  }
}

window.tryAdminLogin = async function () {
  const input = document.getElementById('adminPassword');
  const pwd = (input && input.value) || '';
  if (!pwd) {
    setLoginError('رمز عبور را وارد کنید.');
    if (input) input.focus();
    return;
  }
  setLoginError('');
  setLoginLoading(true);
  try {
    await ensureDefaultPassword();
    const hash = await sha256(pwd);
    const stored = localStorage.getItem(ADMIN_HASH_KEY);
    if (hash === stored) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      showAdminApp();
      if (typeof bootApp === 'function') bootApp();
    } else {
      setLoginError('رمز عبور اشتباه است.');
      if (input) {
        input.select();
        input.focus();
      }
    }
  } catch (e) {
    console.error(e);
    setLoginError('خطا در ورود. دوباره تلاش کنید.');
  } finally {
    setLoginLoading(false);
  }
};

window.adminLogout = function () {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  showLoginGate();
  const input = document.getElementById('adminPassword');
  if (input) {
    input.value = '';
    setTimeout(function () { input.focus(); }, 50);
  }
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

  const toggle = document.getElementById('togglePwd');
  const input = document.getElementById('adminPassword');
  if (toggle && input) {
    toggle.addEventListener('click', function () {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-label', show ? 'مخفی کردن رمز' : 'نمایش رمز');
      toggle.textContent = show ? '🙈' : '👁';
    });
  }

  ensureDefaultPassword().then(function () {
    if (isAdminLoggedIn()) {
      showAdminApp();
    } else {
      showLoginGate();
      if (input) input.focus();
    }
  });
});
