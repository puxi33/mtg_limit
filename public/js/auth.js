// ============================================================
// auth.js — Login, register, logout
// ============================================================

function renderLogin(el) {
  el.innerHTML = `
    <div class="auth-page">
      <div class="auth-box">
        <h1>MTG 限制赛</h1>
        <p class="subtitle">万智牌轮抓 / 现开 / 对战平台</p>
        <div class="auth-tabs">
          <button class="active" onclick="switchAuthTab('login')">登录</button>
          <button onclick="switchAuthTab('register')">注册</button>
        </div>
        <form id="auth-form" onsubmit="handleAuth(event)">
          <div class="form-group">
            <label>用户名</label>
            <input type="text" id="auth-username" required minlength="2" placeholder="输入用户名">
          </div>
          <div class="form-group">
            <label>密码</label>
            <input type="password" id="auth-password" required minlength="4" placeholder="输入密码">
          </div>
          <button type="submit" class="btn btn-primary btn-block">登录</button>
        </form>
      </div>
    </div>
  `;
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tabs button').forEach(function(btn, i) {
    btn.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
  var submitBtn = document.querySelector('#auth-form button[type="submit"]');
  submitBtn.textContent = tab === 'login' ? '登录' : '注册';
  submitBtn.setAttribute('data-tab', tab);
}

async function handleAuth(e) {
  e.preventDefault();
  var username = document.getElementById('auth-username').value.trim();
  var password = document.getElementById('auth-password').value;
  var isRegister = document.querySelector('#auth-form button[type="submit"]').getAttribute('data-tab') === 'register';
  var endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

  try {
    var data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username: username, password: password })
    });
    state.token = data.token;
    state.user = data.user;
    if (typeof API !== 'undefined' && API.setToken) API.setToken(data.token);
    if (typeof WS !== 'undefined' && WS.connect) WS.connect();
    var navEl = document.getElementById('nav-username');
    if (navEl) navEl.textContent = data.user.username;
    showToast('欢迎, ' + data.user.username + '!');
    var intended = consumeIntendedRoute();
    if (intended) {
      navigate(intended.page, intended.params, { replace: true });
    } else {
      navigate('dashboard', {}, { replace: true });
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function logout() {
  state.token = null;
  state.user = null;
  fetch('/api/auth/logout', { method: 'POST' }).catch(function() {});
  navigate('login');
}

// ============================================================
// dashboard.js — Dashboard rendering
// ============================================================

async function renderDashboard(el) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    var results = await Promise.all([
      api('/api/stats'),
      api('/api/events'),
      api('/api/battles')
    ]);
    var stats = results[0], events = results[1], battles = results[2];

    el.innerHTML =
      '<h2 style="margin-bottom:24px;color:var(--text-bright)">欢迎回来, ' + escapeHtml(state.user.username) + '</h2>' +
      '<div class="dashboard-stats">' +
        '<div class="stat-card"><div class="stat-value">' + stats.cubes + '</div><div class="stat-label">Cube数量</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + stats.events + '</div><div class="stat-label">参与赛事</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + stats.decks + '</div><div class="stat-label">牌组数量</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + stats.battles + '</div><div class="stat-label">对战次数</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + stats.wins + '</div><div class="stat-label">胜场数</div></div>' +
      '</div>' +
      '<h3 style="margin-bottom:12px;color:var(--text-bright)">快速操作</h3>' +
      '<div class="quick-actions">' +
        '<button class="btn btn-primary" onclick="navigate(\'cubes\')">管理Cube</button>' +
        '<button class="btn btn-success" onclick="navigate(\'events\')">创建限制赛</button>' +
        '<button class="btn btn-warning" onclick="navigate(\'battles\')">寻找对战</button>' +
      '</div>' +
      '<h3 style="margin-bottom:12px;color:var(--text-bright)">最近赛事</h3>' +
      '<div class="card-grid">' +
        events.slice(0, 6).map(function(ev) {
          return '<div class="card-item" onclick="navigate(\'event-detail\', {id:' + ev.id + '})" style="position:relative">' +
            (String(ev.user_id) === String(state.user && state.user.id) ? '<button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();deleteEvent(' + ev.id + ')" title="删除赛事">&times;</button>' : '') +
            '<h3>' + escapeHtml(ev.name) + '</h3>' +
            '<span class="badge badge-' + ev.type + '">' + (ev.type === 'draft' ? '轮抓' : '现开') + '</span>' +
            '<span class="badge" style="background:' + ((ev.settings && ev.settings.format || 'bo3') === 'bo1' ? '#e74c3c' : '#3498db') + ';font-size:0.7rem">' + ((ev.settings && ev.settings.format || 'bo3') === 'bo1' ? 'BO1' : 'BO3') + '</span>' +
            '<span class="badge badge-' + (ev.status === 'waiting' ? 'waiting' : ev.status === 'in_progress' ? 'progress' : 'completed') + '">' +
              (ev.status === 'waiting' ? '等待中' : ev.status === 'in_progress' ? '进行中' : '已完成') +
            '</span>' +
            '<div class="card-meta"><span>' + ev.participant_count + '人参与</span><span>' + escapeHtml(ev.creator_name || '') + '</span></div>' +
          '</div>';
        }).join('') || '<div class="empty-state"><p>暂无赛事</p></div>' +
      '</div>' +
      '<h3 style="margin:24px 0 12px;color:var(--text-bright)">最近对战</h3>' +
      '<div class="card-grid">' +
        battles.slice(0, 6).map(function(b) {
          return '<div class="card-item" onclick="navigate(\'battle-detail\', {id:' + b.id + '})">' +
            '<h3>' + escapeHtml(b.name || '对战 #' + b.id) + '</h3>' +
            '<span class="badge badge-' + (b.status === 'waiting' ? 'waiting' : b.status === 'in_progress' ? 'progress' : 'completed') + '">' +
              (b.status === 'waiting' ? '等待中' : b.status === 'in_progress' ? '进行中' : '已完成') +
            '</span>' +
            '<div class="card-meta">' +
              '<span>' + escapeHtml(b.player1_name || '等待中') + '</span>' +
              '<span>vs</span>' +
              '<span>' + escapeHtml(b.player2_name || '等待中') + '</span>' +
            '</div>' +
          '</div>';
        }).join('') || '<div class="empty-state"><p>暂无对战</p></div>' +
      '</div>';
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + escapeHtml(err.message) + '</p></div>';
  }
}
