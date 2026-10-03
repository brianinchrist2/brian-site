/**
 * reader-auth.js — 共享认证模块（阅读器 + 课件页共用）。
 * 经典脚本，暴露全局 ReaderAuth。自注入登录/注册弹窗。
 * 复用现有认证体系：/api/auth/signin|signup，JWT 存 localStorage.auth_token。
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'auth_token';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function isLoggedIn() { return !!getToken(); }

  async function getProfile() {
    var token = getToken();
    if (!token) return null;
    try {
      var res = await fetch('/api/user/profile', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) { clearToken(); return null; }
      return await res.json();
    } catch (e) { return null; }
  }

  async function signIn(email, password) {
    var res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    var data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.error || '登录失败');
    setToken(data.token);
    _emitLogin(data);
    return data;
  }

  async function signUp(nickname, email, password) {
    var res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, email: email.trim().toLowerCase(), password }),
    });
    var data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.error || '注册失败');
    if (data.token) { setToken(data.token); _emitLogin(data); }
    return data;
  }

  function logout() {
    clearToken();
    if (window.ReaderAuth && typeof window.ReaderAuth._emitLogout === 'function') {
      window.ReaderAuth._emitLogout();
    }
  }

  var _logoutCallbacks = [];
  function _emitLogout() { _logoutCallbacks.forEach(function (cb) { try { cb(); } catch (e) {} }); }

  var _loginCallbacks = [];
  function _emitLogin(data) { _loginCallbacks.forEach(function (cb) { try { cb(data); } catch (e) {} }); }

  // ---------- 登录/注册弹窗（自注入） ----------
  var _modalEl = null;

  function buildModal() {
    var style = document.createElement('style');
    style.textContent =
      '#ra-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(20,16,10,.5)}' +
      '#ra-modal[hidden]{display:none}' +
      '.ra-box{background:#fff;border-radius:12px;padding:28px;width:min(360px,90vw);box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}' +
      '.ra-box h2{margin:0 0 4px;font-size:20px}.ra-sub{color:#666;margin:0 0 18px;font-size:13px}' +
      '.ra-field{margin-bottom:12px}.ra-field label{display:block;font-size:13px;margin-bottom:4px;color:#333}' +
      '.ra-field input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ccc;border-radius:8px;font-size:14px}' +
      '.ra-err{color:#c0392b;font-size:13px;min-height:18px;margin:0 0 8px}' +
      '.ra-btn{width:100%;padding:10px;border:0;border-radius:8px;background:#8A3517;color:#fff;font-size:15px;cursor:pointer}' +
      '.ra-btn:disabled{opacity:.5}' +
      '.ra-toggle{margin-top:12px;text-align:center;font-size:13px;color:#555}.ra-toggle a{color:#8A3517;cursor:pointer;text-decoration:underline}' +
      '.ra-close{float:right;border:0;background:none;font-size:20px;cursor:pointer;color:#888}';
    document.head.appendChild(style);

    var modal = document.createElement('div');
    modal.id = 'ra-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '登录');
    modal.hidden = true;
    modal.innerHTML =
      '<div class="ra-box">' +
      '<button type="button" class="ra-close" aria-label="关闭">×</button>' +
      '<h2>登录</h2><p class="ra-sub">登录后可查看互动课件并保存笔记</p>' +
      '<div id="ra-nickname-field" class="ra-field" hidden><label for="ra-nickname">昵称</label><input id="ra-nickname" autocomplete="nickname"></div>' +
      '<div class="ra-field"><label for="ra-email">邮箱</label><input id="ra-email" type="email" autocomplete="email"></div>' +
      '<div class="ra-field"><label for="ra-password">密码</label><input id="ra-password" type="password" autocomplete="current-password"></div>' +
      '<p class="ra-err" id="ra-err"></p>' +
      '<button type="button" class="ra-btn" id="ra-submit">登录</button>' +
      '<p class="ra-toggle"><span id="ra-toggle-text">还没有账号？</span><a id="ra-toggle-link">注册</a></p>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  function openLoginModal(onSuccess) {
    if (!_modalEl) _modalEl = buildModal();
    var modal = _modalEl;
    var register = false;
    var nickField = modal.querySelector('#ra-nickname-field');
    var submit = modal.querySelector('#ra-submit');
    var err = modal.querySelector('#ra-err');
    var toggleLink = modal.querySelector('#ra-toggle-link');
    var toggleText = modal.querySelector('#ra-toggle-text');
    var emailInput = modal.querySelector('#ra-email');
    var passInput = modal.querySelector('#ra-password');
    var nickInput = modal.querySelector('#ra-nickname');

    function reset() { register = false; nickField.hidden = true; submit.textContent = '登录'; toggleText.textContent = '还没有账号？'; toggleLink.textContent = '注册'; err.textContent = ''; emailInput.value = ''; passInput.value = ''; }

    toggleLink.onclick = function () {
      register = !register;
      nickField.hidden = !register;
      submit.textContent = register ? '注册' : '登录';
      toggleText.textContent = register ? '已有账号？' : '还没有账号？';
      toggleLink.textContent = register ? '登录' : '注册';
      err.textContent = '';
    };

    modal.querySelector('.ra-close').onclick = function () { modal.hidden = true; };
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });

    submit.onclick = async function () {
      err.textContent = '';
      submit.disabled = true;
      try {
        var email = emailInput.value.trim();
        var password = passInput.value;
        if (!email || !password) throw new Error('请填写邮箱和密码');
        var data = register
          ? await signUp(nickInput.value.trim(), email, password)
          : await signIn(email, password);
        modal.hidden = true;
        if (typeof onSuccess === 'function') onSuccess(data);
      } catch (e) {
        err.textContent = e && e.message ? e.message : '操作失败';
      } finally {
        submit.disabled = false;
      }
    };

    reset();
    modal.hidden = false;
    emailInput.focus();
    return modal;
  }

  /** 返回 Promise<user|null>：已登录直接 resolve；否则弹窗，成功后 resolve user。 */
  function ensureLogin() {
    return getProfile().then(function (user) {
      if (user) return user;
      return new Promise(function (resolve) {
        openLoginModal(function (data) {
          resolve(data && data.user ? data.user : null);
        });
      });
    });
  }

  window.ReaderAuth = {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    isLoggedIn: isLoggedIn,
    getProfile: getProfile,
    signIn: signIn,
    signUp: signUp,
    logout: logout,
    openLoginModal: openLoginModal,
    ensureLogin: ensureLogin,
    onLogout: function (cb) { _logoutCallbacks.push(cb); },
    onLogin: function (cb) { _loginCallbacks.push(cb); },
    _emitLogout: _emitLogout,
    _emitLogin: _emitLogin,
  };
})();
