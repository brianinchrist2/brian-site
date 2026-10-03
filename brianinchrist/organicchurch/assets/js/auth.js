/* ============================================================
 *   有机教会 — Shared Auth Module
 *   Handles sign-in, sign-up, user profile menu, and auth state.
 *   Auto-initializes on DOMContentLoaded.
 *
 *   Pages need:
 *     1. <link rel="stylesheet" href="path/to/auth.css">
 *     2. <div id="auth-nav-container"></div> in site-nav
 *     3. <script src="path/to/auth.js"></script> before </body>
 *   ============================================================ */

(function () {
  'use strict';

  let currentUser = null;
  let modalCreated = false;

  /* ---------- Auth API helpers ---------- */

  function getToken() {
    return localStorage.getItem('auth_token');
  }

  /* ---------- Modal DOM creation (lazy, first-use) ---------- */

  function ensureModal() {
    if (modalCreated) return;
    modalCreated = true;

    const overlay = document.createElement('div');
    overlay.id = 'auth-modal';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('onclick', 'window.closeAuthModal(event)');
    overlay.innerHTML =
      '<div class="modal-card" onclick="event.stopPropagation()">' +
        '<button class="modal-close" onclick="window.toggleAuthModal(false)">&times;</button>' +

        '<div id="signin-form-wrapper">' +
          '<h3 class="modal-title">登录</h3>' +
          '<p class="modal-desc">欢迎回到 有机教会。</p>' +
          '<form id="signin-form" onsubmit="return window.handleSignIn(event)">' +
            '<div class="form-group">' +
              '<label for="signin-email">邮箱</label>' +
              '<input type="email" id="signin-email" required placeholder="example@email.com">' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="signin-password">密码</label>' +
              '<input type="password" id="signin-password" required placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">' +
            '</div>' +
            '<div id="signin-error" class="form-error" style="display: none;"></div>' +
            '<button type="submit" class="btn btn-primary w-100">登录</button>' +
          '</form>' +
          '<div class="modal-footer-text">' +
            '还没有账号？' +
            '<a onclick="window.switchAuthView(\'signup\')">注册</a>' +
          '</div>' +
          '<div class="modal-footer-text"><a href="/reset.html">忘记密码？</a></div>' +
        '</div>' +

        '<div id="signup-form-wrapper" style="display: none;">' +
          '<h3 class="modal-title">注册</h3>' +
          '<p class="modal-desc">创建一个账号加入我们的团契。</p>' +
          '<form id="signup-form" onsubmit="return window.handleSignUp(event)">' +
            '<div class="form-group">' +
              '<label for="signup-nickname">昵称</label>' +
              '<input type="text" id="signup-nickname" required placeholder="Brian">' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="signup-email">邮箱</label>' +
              '<input type="email" id="signup-email" required placeholder="example@email.com">' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="signup-password">密码</label>' +
              '<input type="password" id="signup-password" required placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">' +
            '</div>' +
            '<div id="signup-error" class="form-error" style="display: none;"></div>' +
            '<button type="submit" class="btn btn-primary w-100">注册</button>' +
          '</form>' +
          '<div class="modal-footer-text">' +
            '已有账号？' +
            '<a onclick="window.switchAuthView(\'signin\')">登录</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
  }

  /* ---------- Modal controls ---------- */

  window.toggleAuthModal = function (show, view) {
    if (view === undefined) view = 'signin';
    ensureModal();
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    if (show) {
      modal.style.display = 'flex';
      modal.offsetHeight; // force reflow
      modal.classList.add('show');
      window.switchAuthView(view);
    } else {
      modal.classList.remove('show');
      setTimeout(function () { modal.style.display = 'none'; }, 250);
    }
  };

  window.closeAuthModal = function (event) {
    if (event && event.target && event.target.id === 'auth-modal') {
      window.toggleAuthModal(false);
    }
  };

  window.switchAuthView = function (view) {
    ensureModal();
    var signinWrapper = document.getElementById('signin-form-wrapper');
    var signupWrapper = document.getElementById('signup-form-wrapper');
    var signinErr = document.getElementById('signin-error');
    var signupErr = document.getElementById('signup-error');
    if (signinErr) signinErr.style.display = 'none';
    if (signupErr) signupErr.style.display = 'none';
    if (signinWrapper) signinWrapper.style.display = view === 'signin' ? 'block' : 'none';
    if (signupWrapper) signupWrapper.style.display = view === 'signup' ? 'block' : 'none';
  };

  /* ---------- Sign-in / Sign-up ---------- */

  window.handleSignIn = async function (e) {
    e.preventDefault();
    var email = document.getElementById('signin-email').value;
    var password = document.getElementById('signin-password').value;
    var errorDiv = document.getElementById('signin-error');
    if (errorDiv) errorDiv.style.display = 'none';
    try {
      var response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('auth_token', data.token);
      currentUser = data.user;
      updateUserUI();
      window.toggleAuthModal(false);
    } catch (err) {
      if (errorDiv) {
        errorDiv.innerText = err.message;
        errorDiv.style.display = 'block';
      }
    }
  };

  window.handleSignUp = async function (e) {
    e.preventDefault();
    var nickname = document.getElementById('signup-nickname').value;
    var email = document.getElementById('signup-email').value;
    var password = document.getElementById('signup-password').value;
    var errorDiv = document.getElementById('signup-error');
    if (errorDiv) errorDiv.style.display = 'none';
    try {
      var response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname, email: email, password: password })
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');
      window.switchAuthView('signin');
      document.getElementById('signin-email').value = email;
      alert('注册成功！请登录。');
    } catch (err) {
      if (errorDiv) {
        errorDiv.innerText = err.message;
        errorDiv.style.display = 'block';
      }
    }
  };

  /* ---------- Auth state ---------- */

  async function checkAuth() {
    var token = getToken();
    if (!token) { updateUserUI(); return; }
    try {
      var response = await fetch('/api/user/profile', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (response.ok) {
        var data = await response.json();
        currentUser = data.user;
      } else {
        localStorage.removeItem('auth_token');
        currentUser = null;
      }
    } catch (err) {
      // silent — user stays logged out
    }
    updateUserUI();
  }

  function updateUserUI() {
    var authContainer = document.getElementById('auth-nav-container');
    if (!authContainer) return;
    if (currentUser) {
      authContainer.innerHTML =
        '<div class="user-profile-menu">' +
          '<button class="user-avatar-btn" onclick="window.toggleUserDropdown(); event.stopPropagation()">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">' +
              '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
              '<circle cx="12" cy="7" r="4"/>' +
            '</svg>' +
            '<span>' + escapeHtml(currentUser.nickname) + '</span>' +
          '</button>' +
          '<div id="user-dropdown" class="user-dropdown">' +
            '<div class="user-dropdown-header">' +
              '<div class="user-dropdown-name">' + escapeHtml(currentUser.nickname) + '</div>' +
              '<div class="user-dropdown-email">' + escapeHtml(currentUser.email) + '</div>' +
            '</div>' +
            '<button class="user-dropdown-item" onclick="window.handleEditProfile()">修改资料</button>' +
            '<button class="user-dropdown-item logout" onclick="window.handleLogOut()">退出登录</button>' +
          '</div>' +
        '</div>';
      document.addEventListener('click', closeUserDropdownOutside);
    } else {
      authContainer.innerHTML =
        '<button class="signin-btn" onclick="window.toggleAuthModal(true, \'signin\')">登录</button>';
      document.removeEventListener('click', closeUserDropdownOutside);
    }
  }

  function closeUserDropdownOutside(e) {
    var dropdown = document.getElementById('user-dropdown');
    var btn = document.querySelector('.user-avatar-btn');
    if (dropdown && dropdown.classList.contains('show') && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
      window.toggleUserDropdown(false);
    }
  }

  window.toggleUserDropdown = function (show) {
    var dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;
    if (show === undefined) dropdown.classList.toggle('show');
    else if (show) dropdown.classList.add('show');
    else dropdown.classList.remove('show');
  };

  window.handleLogOut = function () {
    localStorage.removeItem('auth_token');
    currentUser = null;
    updateUserUI();
    window.toggleUserDropdown(false);
  };

  window.handleEditProfile = async function () {
    var newNickname = prompt('请输入新的昵称：', currentUser.nickname);
    if (!newNickname || !newNickname.trim() || newNickname === currentUser.nickname) return;
    var token = getToken();
    try {
      var response = await fetch('/api/user/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ nickname: newNickname })
      });
      var data = await response.json();
      if (response.ok) {
        currentUser = data.user;
        updateUserUI();
        alert('资料修改成功！');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  /* ---------- Util ---------- */

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ---------- Init ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    checkAuth();
  });

})();
