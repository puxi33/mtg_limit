// ============================================================
// init.js — App initialization
// ============================================================

async function renderProfile(el) {
  el.innerHTML = '<div style="text-align:center;padding:40px">加载中...</div>';
  try {
    const me = await api('/api/me');
    const avatar = me.avatar || '';
    const nickname = me.nickname || me.username;
    el.innerHTML = `
      <div class="page-header">
        <button class="btn btn-secondary btn-sm" onclick="navigate('dashboard')">← 返回</button>
        <h2>个人资料</h2>
      </div>
      <div style="max-width:480px;margin:0 auto;display:flex;flex-direction:column;gap:24px">
        <!-- Avatar -->
        <div style="text-align:center">
          <div id="profile-avatar-wrap" style="width:96px;height:96px;border-radius:50%;margin:0 auto 12px;overflow:hidden;border:3px solid var(--border-bright);cursor:pointer;position:relative;background:var(--surface)" onclick="document.getElementById('avatar-upload').click()">
            ${avatar ? '<img src="' + avatar + '" style="width:100%;height:100%;object-fit:cover">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.2rem;color:var(--text-muted)">' + (nickname[0] || '?').toUpperCase() + '</div>'}
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:0.65rem;padding:2px 0;text-align:center">更换头像</div>
          </div>
          <input type="file" id="avatar-upload" accept="image/*" style="display:none" onchange="handleAvatarUpload(this)">
        </div>
        <!-- Nickname -->
        <div class="form-group">
          <label style="font-size:0.85rem;color:var(--text-muted);display:block;margin-bottom:6px">昵称</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="profile-nickname" value="${escapeHtml(nickname)}" maxlength="30" style="flex:1;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-bright);font-size:0.9rem">
            <button class="btn btn-primary btn-sm" onclick="saveNickname()">保存</button>
          </div>
        </div>
        <!-- Username (read-only) -->
        <div class="form-group">
          <label style="font-size:0.85rem;color:var(--text-muted);display:block;margin-bottom:6px">用户名（不可修改）</label>
          <input type="text" value="${escapeHtml(me.username)}" disabled style="width:100%;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:0.9rem">
        </div>
        <!-- Password -->
        <div style="border-top:1px solid var(--border);padding-top:20px">
          <h3 style="font-size:1rem;color:var(--text-bright);margin-bottom:12px">修改密码</h3>
          <div class="form-group" style="margin-bottom:10px">
            <input type="password" id="profile-old-pw" placeholder="当前密码" style="width:100%;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-bright);font-size:0.9rem">
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <input type="password" id="profile-new-pw" placeholder="新密码（至少4位）" style="width:100%;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-bright);font-size:0.9rem">
          </div>
          <button class="btn btn-primary btn-sm" onclick="changePassword()">修改密码</button>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

async function handleAvatarUpload(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) { showToast('头像文件过大（最大500KB）', 'error'); return; }
  var reader = new FileReader();
  reader.onload = async function(e) {
    var dataUrl = e.target.result;
    try {
      var updated = await api('/api/me', { method: 'PUT', body: JSON.stringify({ avatar: dataUrl }) });
      if (state.user) state.user.avatar = dataUrl;
      showToast('头像已更新');
      renderProfile(document.getElementById('content'));
    } catch (err) { showToast(err.message, 'error'); }
  };
  reader.readAsDataURL(file);
}

async function saveNickname() {
  var val = document.getElementById('profile-nickname').value.trim();
  if (!val) { showToast('昵称不能为空', 'error'); return; }
  try {
    await api('/api/me', { method: 'PUT', body: JSON.stringify({ nickname: val }) });
    if (state.user) state.user.nickname = val;
    showToast('昵称已保存');
    var navEl = document.getElementById('nav-username');
    if (navEl) navEl.textContent = val;
  } catch (err) { showToast(err.message, 'error'); }
}

async function changePassword() {
  var oldPw = document.getElementById('profile-old-pw').value;
  var newPw = document.getElementById('profile-new-pw').value;
  if (!oldPw || !newPw) { showToast('请填写完整', 'error'); return; }
  try {
    await api('/api/me/password', { method: 'POST', body: JSON.stringify({ old_password: oldPw, new_password: newPw }) });
    showToast('密码已修改');
    document.getElementById('profile-old-pw').value = '';
    document.getElementById('profile-new-pw').value = '';
  } catch (err) { showToast(err.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', async function() {
  // Battle-only mode: skip main app initialization
  if (document.getElementById('battle-root')) {
    return; // battle.html handles its own init via initBattle()
  }

  // Set up navigation click handlers
  document.querySelectorAll('.nav-links a').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var page = link.getAttribute('data-page');
      if (page) navigate(page);
    });
  });

  // Set up logout button
  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      logout();
    });
  }

  // Parse URL to determine initial page (keep current page on refresh)
  var initialRoute = pathToRoute(window.location.pathname);

  // Check cookie-based authentication via GET /api/auth/me
  try {
    var data = await api('/api/auth/me');
    state.token = data.token;
    state.user = data.user;
    if (typeof API !== 'undefined' && API.setToken) API.setToken(data.token);
    if (typeof WS !== 'undefined' && WS.connect) WS.connect();
    var navEl = document.getElementById('nav-username');
    if (navEl) navEl.textContent = data.user.nickname || data.user.username;
    if (initialRoute) {
      navigate(initialRoute.page, initialRoute.params, { replace: true });
    } else {
      navigate('dashboard', {}, { replace: true });
    }
  } catch (err) {
    // Not logged in - save intended page for after login
    if (initialRoute && initialRoute.page !== 'login') {
      saveIntendedRoute(initialRoute.page, initialRoute.params);
    }
    navigate('login', {}, { replace: true });
  }
});
