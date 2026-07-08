// ========== STATE ==========
const state = {
  token: null,
  user: null,
  currentPage: 'dashboard',
  pageData: {}
};

// ========== UTILITY ==========
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ========== API HELPER ==========
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (res.status === 401 && state.token) {
    state.token = null;
    state.user = null;
    navigate('login');
    throw new Error('认证已过期');
  }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ========== TOAST ==========
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== MODAL ==========
function showModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ========== CARD HELPERS ==========
function getCardColorClass(card) {
  if (!card.colors || card.colors.length === 0) {
    if (card.type && card.type.includes('Land')) return 'land';
    if (card.type && card.type.includes('Artifact')) return 'artifact';
    return 'artifact';
  }
  if (card.colors.length > 1) return 'multi';
  return card.colors[0];
}

function renderManaCost(cost) {
  if (!cost) return '';
  return cost.replace(/\{([^}]+)\}/g, (match, sym) => {
    const colors = { W: 'white-mana', U: 'blue-mana', B: '#666', R: 'red-mana', G: 'green-mana' };
    const color = colors[sym] || '#888';
    return `<span style="background:${color};color:white;padding:1px 5px;border-radius:50%;font-size:0.7rem;font-weight:700;display:inline-block;min-width:18px;text-align:center;">${sym}</span>`;
  });
}

function createCardElement(card, onClick) {
  const div = document.createElement('div');
  div.className = 'mtg-card';
  div.setAttribute('data-color', getCardColorClass(card));
  div.setAttribute('data-id', card.id);
  if (card.tapped) div.classList.add('tapped');

  if (card.image || card.image_small) {
    const imgSrc = card.image_small || card.image;
    div.innerHTML = `
      <img src="${imgSrc}" alt="${card.name}" class="mtg-card-image" loading="lazy"
        onerror="this.parentElement.innerHTML='<div class=\\'mtg-card-header\\'><span class=\\'mtg-card-name\\'>${card.name.replace(/'/g, "\\'")}</span></div><div class=\\'mtg-card-type\\'>${(card.type || '').replace(/'/g, "\\'")}</div>'">
    `;
    div.style.width = '200px';
  } else {
    const pt = (card.power != null && card.toughness != null) ? `${card.power} / ${card.toughness}` : '';
    div.innerHTML = `
      <div class="mtg-card-header">
        <span class="mtg-card-name">${card.name}</span>
        <span class="mtg-card-cost">${renderManaCost(card.manaCost)}</span>
      </div>
      <div class="mtg-card-type">${card.type || ''}</div>
      <div class="mtg-card-text">${card.text || ''}</div>
      ${pt ? `<div class="mtg-card-footer">${pt}</div>` : ''}
    `;
  }

  // Hover preview for cards with images
  if (card.image || card.image_small || card.image_back || card.image_small_back) {
    div.addEventListener('mouseenter', (e) => showCardPreview(card, e));
    div.addEventListener('mousemove', (e) => moveCardPreview(e));
    div.addEventListener('mouseleave', () => hideCardPreview());
  }

  if (onClick) div.addEventListener('click', () => onClick(card));
  return div;
}

function groupCardsByColor(cards) {
  const groups = { W: [], U: [], B: [], R: [], G: [], Multi: [], Artifact: [], Land: [] };
  for (const card of cards) {
    const colorClass = getCardColorClass(card);
    if (card.type && card.type.includes('Land')) groups.Land.push(card);
    else if (colorClass === 'multi') groups.Multi.push(card);
    else if (colorClass === 'artifact') groups.Artifact.push(card);
    else if (groups[colorClass]) groups[colorClass].push(card);
    else groups.Artifact.push(card);
  }
  return groups;
}

const COLOR_NAMES = { W: '白色', U: '蓝色', B: '黑色', R: '红色', G: '绿色', Multi: '多色', Artifact: '神器', Land: '地' };

// ========== ROUTING ==========
// 路径 ↔ page/params 双向转换
// 让刷新能保持当前页,浏览器后退/前进也能正确路由
const Routes = {
  '/':                  { page: 'dashboard' },
  '/dashboard':         { page: 'dashboard' },
  '/login':             { page: 'login' },
  '/cubes':             { page: 'cubes' },
  '/cubes/:id':         { page: 'cube-detail', id: ':id' },
  '/events':            { page: 'events' },
  '/events/:id':        { page: 'event-detail', id: ':id' },
  '/events/:id/build':  { page: 'deck-builder', eventId: ':id' },
  '/decks':             { page: 'decks' },
  '/decks/:id/build':   { page: 'deck-builder', deckId: ':id' },
  '/decks/:id/detail':  { page: 'deck-detail', id: ':id' },
  '/battles':           { page: 'battles' },
  '/battles/:id':       { page: 'battle-detail', id: ':id' },
  '/profile':           { page: 'profile' }
};

function pathToRoute(path) {
  // 去掉尾斜杠、query、hash
  const clean = (path || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const target = clean === '' ? '/' : clean;
  for (const pattern in Routes) {
    const paramNames = (pattern.match(/:[^/]+/g) || []).map(s => s.slice(1));
    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '([^/]+)') + '$');
    const m = target.match(regex);
    if (m) {
      const tmpl = Routes[pattern];
      // 模板里 value 是 ':foo' 的表示该 key 用路径参数 :foo 的值
      const params = {};
      for (const k in tmpl) {
        const v = tmpl[k];
        if (typeof v === 'string' && v.startsWith(':')) {
          const ph = v.slice(1);
          const idx = paramNames.indexOf(ph);
          if (idx >= 0) params[k] = decodeURIComponent(m[idx + 1] || '');
        } else {
          params[k] = v;
        }
      }
      const { page, ...rest } = params;
      return { page, params: rest };
    }
  }
  return null;
}

function routeToPath(page, params) {
  params = params || {};
  switch (page) {
    case 'dashboard': return '/dashboard';
    case 'login':     return '/login';
    case 'cubes':     return '/cubes';
    case 'cube-detail':
      return '/cubes/' + encodeURIComponent(params.id || '');
    case 'events':    return '/events';
    case 'event-detail':
      return '/events/' + encodeURIComponent(params.id || '');
    case 'deck-builder':
      if (params.eventId) return '/events/' + encodeURIComponent(params.eventId) + '/build';
      if (params.deckId) return '/decks/' + encodeURIComponent(params.deckId) + '/build';
      return '/decks';
    case 'deck-detail':
      return '/decks/' + encodeURIComponent(params.id || '') + '/detail';
    case 'decks':     return '/decks';
    case 'battles':   return '/battles';
    case 'battle-detail':
      return '/battles/' + encodeURIComponent(params.id || '');
    case 'profile':   return '/profile';
    default:          return '/dashboard';
  }
}

function consumeIntendedRoute() {
  try {
    const s = sessionStorage.getItem('mtg_intended_route');
    if (!s) return null;
    sessionStorage.removeItem('mtg_intended_route');
    return JSON.parse(s);
  } catch { return null; }
}

function saveIntendedRoute(page, params) {
  try {
    sessionStorage.setItem('mtg_intended_route', JSON.stringify({ page, params }));
  } catch {}
}

// ========== MOBILE NAV TOGGLE ==========
function toggleNavMenu() {
  var links = document.querySelector('.nav-links');
  var toggle = document.querySelector('.nav-toggle');
  if (!links || !toggle) return;
  var isOpen = links.classList.toggle('open');
  toggle.classList.toggle('active', isOpen);
}

// Close mobile nav when navigating
function closeNavMenu() {
  var links = document.querySelector('.nav-links');
  var toggle = document.querySelector('.nav-toggle');
  if (links) links.classList.remove('open');
  if (toggle) toggle.classList.remove('active');
}

// ========== NAVIGATION ==========
function navigate(page, params = {}, opts = {}) {
  state.currentPage = page;
  state.pageData = params;
  closeNavMenu(); // Close mobile nav on navigate

  // 同步 URL (history API)
  if (!opts.skipUrl) {
    const path = routeToPath(page, params);
    const cur = window.location.pathname;
    if (cur !== path) {
      if (opts.replace) {
        window.history.replaceState({ page, params }, '', path);
      } else {
        window.history.pushState({ page, params }, '', path);
      }
    }
  }

  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-page') === page);
  });

  const content = document.getElementById('content');
  const navbar = document.getElementById('navbar');

  if (page === 'login') {
    navbar.classList.add('hidden');
    renderLogin(content);
  } else {
    navbar.classList.remove('hidden');
    switch (page) {
      case 'dashboard': renderDashboard(content); break;
      case 'cubes': renderCubes(content); break;
      case 'cube-detail': renderCubeDetail(content, params.id); break;
      case 'events': renderEvents(content); break;
      case 'event-detail': renderEventDetail(content, params.id); break;
      case 'decks': renderDecks(content); break;
      case 'deck-builder': renderDeckBuilder(content, params); break;
      case 'deck-detail': renderDeckDetail(content, params.id); break;
      case 'battles': renderBattles(content); break;
      case 'battle-detail': renderBattleDetail(content, params.id); break;
      case 'profile': renderProfile(content); break;
      default: renderDashboard(content);
    }
  }
}

// 浏览器后退/前进按钮
window.addEventListener('popstate', (e) => {
  const route = pathToRoute(window.location.pathname);
  if (route) {
    navigate(route.page, route.params, { skipUrl: true });
  } else {
    navigate('dashboard', {}, { skipUrl: true, replace: true });
  }
});

// ========== AUTH PAGES ==========
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
  document.querySelectorAll('.auth-tabs button').forEach((btn, i) => {
    btn.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
  const submitBtn = document.querySelector('#auth-form button[type="submit"]');
  submitBtn.textContent = tab === 'login' ? '登录' : '注册';
  submitBtn.setAttribute('data-tab', tab);
}

async function handleAuth(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const isRegister = document.querySelector('#auth-form button[type="submit"]').getAttribute('data-tab') === 'register';
  const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

  try {
    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    state.token = data.token;
    state.user = data.user;
    if (typeof API !== 'undefined' && API.setToken) API.setToken(data.token);
    if (typeof WS !== 'undefined' && WS.connect) WS.connect();
    document.getElementById('nav-username').textContent = data.user.username;
    showToast(`欢迎, ${data.user.username}!`);
    // 登录成功后回到登录前想去的页面
    const intended = consumeIntendedRoute();
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
  fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  navigate('login');
}

// ========== DASHBOARD ==========
async function renderDashboard(el) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    const [stats, events, battles] = await Promise.all([
      api('/api/stats'),
      api('/api/events'),
      api('/api/battles')
    ]);

    el.innerHTML = `
      <h2 style="margin-bottom:24px;color:var(--text-bright)">欢迎回来, ${state.user.username}</h2>
      <div class="dashboard-stats">
        <div class="stat-card"><div class="stat-value">${stats.cubes}</div><div class="stat-label">Cube数量</div></div>
        <div class="stat-card"><div class="stat-value">${stats.events}</div><div class="stat-label">参与赛事</div></div>
        <div class="stat-card"><div class="stat-value">${stats.decks}</div><div class="stat-label">牌组数量</div></div>
        <div class="stat-card"><div class="stat-value">${stats.battles}</div><div class="stat-label">对战次数</div></div>
        <div class="stat-card"><div class="stat-value">${stats.wins}</div><div class="stat-label">胜场数</div></div>
      </div>
      <h3 style="margin-bottom:12px;color:var(--text-bright)">快速操作</h3>
      <div class="quick-actions">
        <button class="btn btn-primary" onclick="navigate('cubes')">管理Cube</button>
        <button class="btn btn-success" onclick="navigate('events')">创建限制赛</button>
        <button class="btn btn-warning" onclick="navigate('battles')">寻找对战</button>
      </div>
      <h3 style="margin-bottom:12px;color:var(--text-bright)">最近赛事</h3>
      <div class="card-grid">
        ${events.slice(0, 6).map(ev => `
          <div class="card-item" onclick="navigate('event-detail', {id:${ev.id}})" style="position:relative">
            ${String(ev.user_id) === String(state.user?.id) ? `<button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();deleteEvent(${ev.id})" title="删除赛事">&times;</button>` : ''}
            <h3>${ev.name}</h3>
            <span class="badge badge-${ev.type}">${ev.type === 'draft' ? '轮抓' : '现开'}</span>
            <span class="badge" style="background:${(ev.settings && ev.settings.format || 'bo3') === 'bo1' ? '#e74c3c' : '#3498db'};font-size:0.7rem">${(ev.settings && ev.settings.format || 'bo3') === 'bo1' ? 'BO1' : 'BO3'}</span>
            <span class="badge badge-${ev.status === 'waiting' ? 'waiting' : ev.status === 'in_progress' ? 'progress' : 'completed'}">
              ${ev.status === 'waiting' ? '等待中' : ev.status === 'in_progress' ? '进行中' : '已完成'}
            </span>
            <div class="card-meta"><span>${ev.participant_count}人参与</span><span>${ev.creator_name}</span></div>
          </div>
        `).join('') || '<div class="empty-state"><p>暂无赛事</p></div>'}
      </div>
      <h3 style="margin:24px 0 12px;color:var(--text-bright)">最近对战</h3>
      <div class="card-grid">
        ${battles.slice(0, 6).map(b => `
          <div class="card-item" onclick="navigate('battle-detail', {id:${b.id}})">
            <h3>${b.name || '对战 #' + b.id}</h3>
            <span class="badge badge-${b.status === 'waiting' ? 'waiting' : b.status === 'in_progress' ? 'progress' : 'completed'}">
              ${b.status === 'waiting' ? '等待中' : b.status === 'in_progress' ? '进行中' : '已完成'}
            </span>
            <div class="card-meta">
              <span>${b.player1_name || '等待中'}</span>
              <span>vs</span>
              <span>${b.player2_name || '等待中'}</span>
            </div>
          </div>
        `).join('') || '<div class="empty-state"><p>暂无对战</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

// ========== CUBES ==========
async function renderCubes(el) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    const cubes = await api('/api/cubes');
    const myId = state.user ? String(state.user.id) : '';
    el.innerHTML = `
      <div class="page-header">
        <h2>Cube</h2>
        <div class="flex gap-8">
          <button class="btn btn-secondary" onclick="showImportModal()">快速导入</button>
          <button class="btn btn-primary" onclick="showCreateCubeModal()">新建Cube</button>
        </div>
      </div>
      <div class="card-grid" id="cubes-grid">
        ${cubes.map(cube => {
          const isMine = String(cube.user_id) === myId;
          return `
          <div class="card-item" onclick="navigate('cube-detail', {id:${cube.id}})" style="${!isMine ? 'border-color:var(--border);opacity:0.85' : ''}">
            <h3>${escapeHtml(cube.name)}${!isMine ? ' <span style="font-size:0.7rem;color:var(--text-muted);font-weight:400">(' + escapeHtml(cube.creator_name || '其他') + ')</span>' : ''}</h3>
            <p class="text-muted" style="font-size:0.85rem;margin-bottom:8px">${escapeHtml(cube.description || '无描述')}</p>
            <div class="card-meta">
              <span>${cube.card_count} 张牌</span>
              <span>${new Date(cube.created_at).toLocaleDateString()}</span>
            </div>
          </div>`;
        }).join('') || '<div class="empty-state"><h3>还没有Cube</h3><p>点击"新建Cube"或"快速导入"开始</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

function showCreateCubeModal() {
  showModal('新建Cube', `
    <form onsubmit="handleCreateCube(event)">
      <div class="form-group"><label>Cube名称</label><input type="text" id="cube-name" required placeholder="我的Cube"></div>
      <div class="form-group"><label>描述</label><input type="text" id="cube-desc" placeholder="可选描述"></div>
      <div class="form-group">
        <label>卡牌列表 (纯文本，每行一张，自动获取卡图)</label>
        <textarea id="cube-cards" rows="10" placeholder="4 Lightning Bolt&#10;4 Counterspell&#10;2 Swords to Plowshares&#10;Savannah Lions&#10;&#10;留空可稍后添加"></textarea>
      </div>
      <div id="cube-create-progress" class="hidden" style="text-align:center;padding:8px;color:var(--text-muted);font-size:0.85rem">
        正在从Scryfall获取卡牌数据...
      </div>
      <button type="submit" id="cube-create-submit" class="btn btn-primary btn-block">创建</button>
    </form>
  `);
}

async function handleCreateCube(e) {
  e.preventDefault();
  const name = document.getElementById('cube-name').value.trim();
  const description = document.getElementById('cube-desc').value.trim();
  const cardsText = document.getElementById('cube-cards').value.trim();

  const progressEl = document.getElementById('cube-create-progress');
  const submitBtn = document.getElementById('cube-create-submit');

  if (!cardsText) {
    try {
      await api('/api/cubes', { method: 'POST', body: JSON.stringify({ name, description, cards: [] }) });
      closeModal();
      showToast('Cube创建成功（空牌池，可稍后添加）');
      navigate('cubes');
    } catch (err) { showToast(err.message, 'error'); }
    return;
  }

  if (progressEl) {
    progressEl.classList.remove('hidden');
    progressEl.innerHTML = '<div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px"><div id="cube-create-bar" style="background:var(--accent);height:100%;width:0%;transition:width 0.2s"></div></div><div id="cube-create-text" style="font-size:0.8rem;text-align:center;color:var(--text-muted)">准备中...</div>';
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '获取中...'; }

  // Parse lines: "4 Card Name" → name="Card Name"
  var rawLines = cardsText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));
  if (rawLines.length === 0) {
    try {
      await api('/api/cubes', { method: 'POST', body: JSON.stringify({ name, description, cards: [] }) });
      closeModal(); showToast('Cube创建成功（空牌池）'); navigate('cubes');
    } catch (err) { showToast(err.message, 'error'); }
    return;
  }

  var parsedLines = rawLines.map(function(line) {
    var m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    return m ? m[2].trim() : line.trim();
  });

  // Step 1: Create empty cube
  var cube;
  try {
    cube = await api('/api/cubes', { method: 'POST', body: JSON.stringify({ name, description, cards: [] }) });
  } catch (err) {
    showToast(err.message, 'error');
    if (progressEl) progressEl.classList.add('hidden');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; }
    return;
  }

  // Step 2: Batch search and add cards
  var BATCH_SIZE = 10;
  var totalAdded = 0, allFailed = [];

  for (var i = 0; i < parsedLines.length; i += BATCH_SIZE) {
    var chunk = parsedLines.slice(i, i + BATCH_SIZE);
    var pct = Math.round(((i + chunk.length) / parsedLines.length) * 100);
    var bar = document.getElementById('cube-create-bar');
    var txt = document.getElementById('cube-create-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = '获取卡牌... ' + Math.min(i + chunk.length, parsedLines.length) + '/' + parsedLines.length + ' (' + pct + '%)';

    // Deduplicate names in this chunk
    var uniqueNames = [];
    for (var j = 0; j < chunk.length; j++) {
      var n = chunk[j];
      var slashIdx = n.indexOf(' // ');
      if (slashIdx !== -1) n = n.substring(0, slashIdx).trim();
      if (uniqueNames.indexOf(n) === -1) uniqueNames.push(n);
    }

    try {
      var res = await api('/api/cards/batch-search', {
        method: 'POST',
        body: JSON.stringify({ names: uniqueNames })
      });
      if (res.cards && res.cards.length > 0) {
        await api('/api/cubes/' + cube.id + '/add-cards-batch', {
          method: 'POST',
          body: JSON.stringify({ names: res.cards.map(function(c) { return c.name; }) })
        });
        totalAdded += res.cards.length;
      }
      if (res.failed && res.failed.length > 0) {
        allFailed = allFailed.concat(res.failed);
      }
    } catch (err) {
      allFailed = allFailed.concat(uniqueNames);
    }
  }

  closeModal();

  // Build result message
  var msg = 'Cube创建成功: ' + totalAdded + '/' + parsedLines.length + '张获取了卡图';
  if (allFailed.length > 0) msg += '\n未找到: ' + allFailed.join(', ');
  showToast(msg, allFailed.length > 0 ? 'info' : 'success');
  navigate('cubes');
}

function showImportModal() {
  showModal('导入Cube', `
    <form onsubmit="handleImportCube(event)">
      <div class="form-group">
        <label>Cube名称 (可选)</label>
        <input type="text" id="import-name" placeholder="留空使用默认名称">
      </div>
      <div class="form-group">
        <label>描述 (可选)</label>
        <input type="text" id="import-desc" placeholder="简短描述">
      </div>
      <div class="form-group">
        <label>卡牌列表 (纯文本)</label>
        <textarea id="import-data" rows="12" required placeholder="每行一张卡牌名称，支持数量前缀：&#10;&#10;4 Lightning Bolt&#10;4 Counterspell&#10;2 Swords to Plowshares&#10;Savannah Lions&#10;4x Dark Confidant&#10;&#10;系统将通过Scryfall自动获取卡图与详细信息&#10;以 # 或 // 开头的行会被忽略"></textarea>
      </div>
      <div id="import-progress" class="hidden" style="text-align:center;padding:12px;color:var(--text-muted)">
        <div style="margin-bottom:8px">正在从Scryfall获取卡牌数据，请稍候...</div>
        <div style="font-size:0.8rem">每张牌约需0.1秒，100张牌约需10秒</div>
      </div>
      <button type="submit" id="import-submit" class="btn btn-primary btn-block">导入并获取卡图</button>
    </form>
  `);
}

async function handleImportCube(e) {
  e.preventDefault();
  const name = document.getElementById('import-name').value.trim();
  const description = document.getElementById('import-desc')?.value.trim() || '';
  const data = document.getElementById('import-data').value.trim();
  if (!data) { showToast('请输入卡牌列表', 'error'); return; }

  const progressEl = document.getElementById('import-progress');
  const submitBtn = document.getElementById('import-submit');
  if (progressEl) {
    progressEl.classList.remove('hidden');
    progressEl.innerHTML = '<div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px"><div id="import-bar" style="background:var(--accent);height:100%;width:0%;transition:width 0.2s"></div></div><div id="import-text" style="font-size:0.8rem;text-align:center;color:var(--text-muted)">准备中...</div>';
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '获取中...'; }

  // Parse lines
  var rawLines = data.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0 && !l.startsWith('#') && !l.startsWith('//'); });
  if (rawLines.length === 0) { showToast('没有解析到任何卡牌名称', 'error'); return; }

  var parsedNames = rawLines.map(function(line) {
    var m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    var n = m ? m[2].trim() : line.trim();
    var slashIdx = n.indexOf(' // ');
    if (slashIdx !== -1) n = n.substring(0, slashIdx).trim();
    return n;
  });

  // Step 1: Create empty cube
  var cubeName = name || 'Imported Cube';
  var cube;
  try {
    cube = await api('/api/cubes', { method: 'POST', body: JSON.stringify({ name: cubeName, description, cards: [] }) });
  } catch (err) {
    showToast(err.message, 'error');
    if (progressEl) progressEl.classList.add('hidden');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '导入并获取卡图'; }
    return;
  }

  // Step 2: Batch search and add
  var BATCH_SIZE = 10;
  var totalAdded = 0, allFailed = [];

  for (var i = 0; i < parsedNames.length; i += BATCH_SIZE) {
    var chunk = parsedNames.slice(i, i + BATCH_SIZE);
    var pct = Math.round(((i + chunk.length) / parsedNames.length) * 100);
    var bar = document.getElementById('import-bar');
    var txt = document.getElementById('import-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = '获取卡牌... ' + Math.min(i + chunk.length, parsedNames.length) + '/' + parsedNames.length + ' (' + pct + '%)';

    // Deduplicate names in this chunk
    var uniqueNames = [];
    for (var j = 0; j < chunk.length; j++) {
      if (uniqueNames.indexOf(chunk[j]) === -1) uniqueNames.push(chunk[j]);
    }

    try {
      var res = await api('/api/cards/batch-search', {
        method: 'POST',
        body: JSON.stringify({ names: uniqueNames })
      });
      if (res.cards && res.cards.length > 0) {
        await api('/api/cubes/' + cube.id + '/add-cards-batch', {
          method: 'POST',
          body: JSON.stringify({ names: res.cards.map(function(c) { return c.name; }) })
        });
        totalAdded += res.cards.length;
      }
      if (res.failed && res.failed.length > 0) {
        allFailed = allFailed.concat(res.failed);
      }
    } catch (err) {
      allFailed = allFailed.concat(uniqueNames);
    }
  }

  closeModal();

  // Build result message
  var msg = '导入成功: ' + totalAdded + '/' + parsedNames.length + '张获取了卡图';
  if (allFailed.length > 0) msg += '\n' + allFailed.length + '张未找到: ' + allFailed.join(', ');
  showToast(msg, allFailed.length > 0 ? 'info' : 'success');
  navigate('cubes');
}

async function renderCubeDetail(el, id) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    const cube = await api(`/api/cubes/${id}`);
    const isOwner = String(cube.user_id) === String(state.user?.id);
    // Tag each card with its original array index for removal
    (cube.cards || []).forEach((card, i) => { card._origIndex = i; });
    const groups = groupCardsByColor(cube.cards || []);
    const failedCards = (cube.cards || []).filter(c => !c.image && !c.image_small && c.text === '未找到卡牌数据');
    const failedNames = [...new Set(failedCards.map(c => c.name))];

    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="navigate('cubes')">← 返回</button>
          <h2>${escapeHtml(cube.name)}${!isOwner ? ' <span style="font-size:0.8rem;color:var(--text-muted);font-weight:400">(' + escapeHtml(cube.creator_name || '其他用户') + '的Cube)</span>' : ''}</h2>
          <p class="text-muted">${escapeHtml(cube.description || '')}</p>
        </div>
        <div class="flex gap-8">
          ${isOwner && failedNames.length > 0 ? `<button class="btn btn-secondary" onclick="retryFailedCards(${id})" id="retry-failed-btn">重试失败 (${failedNames.length})</button>` : ''}
          <button class="btn btn-secondary" onclick="exportCube(${id})">导出JSON</button>
          ${isOwner ? `<button class="btn btn-danger" onclick="deleteCube(${id})">删除</button>` : ''}
        </div>
      </div>
      <p class="mb-16 text-muted">共 ${cube.cards.length} 张牌${failedNames.length > 0 ? ` (<span style="color:var(--error)">${failedNames.length}张未获取卡图</span>)` : ''}</p>
      <div id="cube-cards-container">
        ${Object.entries(groups).filter(([, cards]) => cards.length > 0).map(([color, cards]) => `
          <div class="color-group">
            <h4>${COLOR_NAMES[color] || color} (${cards.length})</h4>
            <div class="mtg-cards-grid cube-${color}"></div>
          </div>
        `).join('')}
      </div>
      ${isOwner ? `
      <h3 style="margin:24px 0 12px;color:var(--text-bright)">搜索并添加卡牌</h3>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
        <input type="text" id="card-search-input" placeholder="搜索卡牌名称..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)">
        <button class="btn btn-secondary" onclick="searchCardsForCube(${id})">搜索</button>
      </div>
      <div id="card-search-results" style="display:none"></div>
      <h3 style="margin:24px 0 12px;color:var(--text-bright)">批量添加 (自动从Scryfall获取卡图)</h3>
      <div class="form-group">
        <textarea id="add-cards-text" rows="4" placeholder='每行一张牌名，支持数量前缀:&#10;4 Lightning Bolt&#10;Savannah Lions'></textarea>
      </div>
      <button class="btn btn-primary" onclick="addCardsToCube(${id})">添加到Cube</button>
      ` : ''}
    `;

    // Render card elements with remove buttons (owner only)
    setTimeout(() => {
      Object.entries(groups).filter(([, cards]) => cards.length > 0).forEach(([color, cards]) => {
        const gridEl = el.querySelector(`.cube-${color}`);
        if (gridEl) cards.forEach(card => {
          const cardIndex = card._origIndex;
          const wrapper = document.createElement('div');
          wrapper.className = 'cube-card-wrapper';
          wrapper.setAttribute('data-index', cardIndex);
          const cardEl = createCardElement(card);
          wrapper.appendChild(cardEl);
          if (isOwner) {
            const removeBtn = document.createElement('div');
            removeBtn.className = 'cube-card-remove';
            removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            removeBtn.title = '移除卡牌';
            removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeCardFromCube(parseInt(id), cardIndex); });
            wrapper.appendChild(removeBtn);
          }
          gridEl.appendChild(wrapper);
        });
      });
      // Enter key for search
      const searchInput = document.getElementById('card-search-input');
      if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchCardsForCube(parseInt(id)); } });
    }, 0);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

async function addCardsToCube(cubeId) {
  const text = document.getElementById('add-cards-text').value.trim();
  if (!text) return;

  var lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));
  if (lines.length === 0) { showToast('没有解析到任何卡牌名称', 'error'); return; }

  // Show progress bar
  var progressHtml = '<div id="cube-import-progress" style="margin-top:12px">' +
    '<div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px">' +
    '<div id="cube-progress-bar" style="background:var(--accent);height:100%;width:0%;transition:width 0.2s"></div></div>' +
    '<div id="cube-progress-text" class="text-muted" style="font-size:0.8rem;text-align:center">准备中...</div></div>';
  var container = document.getElementById('add-cards-text');
  if (container && container.parentNode) {
    container.parentNode.insertAdjacentHTML('beforeend', progressHtml);
  }

  var BATCH_SIZE = 10;
  var totalAdded = 0, allFailed = [];
  for (var i = 0; i < lines.length; i += BATCH_SIZE) {
    var batch = lines.slice(i, i + BATCH_SIZE);
    var pct = Math.round(((i + batch.length) / lines.length) * 100);
    var bar = document.getElementById('cube-progress-bar');
    var txt = document.getElementById('cube-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = '导入中... ' + Math.min(i + batch.length, lines.length) + '/' + lines.length + ' (' + pct + '%)';

    // Parse "4 Card Name" or "4x Card Name" or just "Card Name"
    var names = [];
    for (var j = 0; j < batch.length; j++) {
      var m = batch[j].match(/^(\d+)\s*[xX]?\s+(.+)$/);
      var cardName = m ? m[2].trim() : batch[j].trim();
      // For DFC "Front // Back", use front only
      var slashIdx = cardName.indexOf(' // ');
      if (slashIdx !== -1) cardName = cardName.substring(0, slashIdx).trim();
      names.push(cardName);
    }

    try {
      var result = await api('/api/cards/batch-search', {
        method: 'POST',
        body: JSON.stringify({ names: names })
      });
      if (result.cards && result.cards.length > 0) {
        // Save found cards to cube
        var saveResult = await api('/api/cubes/' + cubeId + '/add-cards-batch', {
          method: 'POST',
          body: JSON.stringify({ names: result.cards.map(function(c) { return c.name; }) })
        });
        totalAdded += saveResult.added || result.cards.length;
      }
      if (result.failed && result.failed.length > 0) {
        allFailed = allFailed.concat(result.failed);
      }
    } catch (err) {
      allFailed = allFailed.concat(names);
    }
  }

  // Show failed cards in dedicated area
  var oldFailed = document.getElementById('cube-failed-cards');
  if (oldFailed) oldFailed.remove();
  if (allFailed.length > 0) {
    var failedHtml = '<div id="cube-failed-cards" style="margin-top:12px;padding:12px;background:rgba(255,80,80,0.1);border:1px solid rgba(255,80,80,0.3);border-radius:8px">' +
      '<div style="font-weight:600;color:#ff6b6b;margin-bottom:6px">未找到 ' + allFailed.length + ' 张卡牌:</div>' +
      '<div style="font-size:0.85rem;color:var(--text-muted);max-height:120px;overflow-y:auto">';
    for (var i = 0; i < allFailed.length; i++) {
      failedHtml += '<span style="display:inline-block;background:rgba(255,80,80,0.15);padding:2px 8px;border-radius:4px;margin:2px">' + escapeHtml(allFailed[i]) + '</span>';
    }
    failedHtml += '</div></div>';
    var progEl = document.getElementById('cube-import-progress');
    if (progEl && progEl.parentNode) {
      progEl.parentNode.insertAdjacentHTML('afterend', failedHtml);
    }
  }

  var msg = '导入完成: 成功 ' + totalAdded + ' 张';
  if (allFailed.length > 0) msg += ', 失败 ' + allFailed.length + ' 种';
  showToast(msg, allFailed.length > 0 ? 'info' : 'success');
  navigate('cube-detail', { id: cubeId });
}

async function removeCardFromCube(cubeId, index) {
  if (!confirm('确定要移除这张卡牌吗？')) return;
  try {
    const result = await api(`/api/cubes/${cubeId}/remove-card`, {
      method: 'POST',
      body: JSON.stringify({ index })
    });
    showToast(`已移除: ${result.removed}`, 'success');
    navigate('cube-detail', { id: cubeId });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function exportCube(id) {
  try {
    const cube = await api(`/api/cubes/${id}`);
    const data = JSON.stringify({ name: cube.name, description: cube.description, cards: cube.cards }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${cube.name}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Cube已导出');
  } catch (err) { showToast(err.message, 'error'); }
}

async function retryFailedCards(cubeId) {
  const btn = document.getElementById('retry-failed-btn');
  if (btn) { btn.disabled = true; btn.textContent = '重试中...'; }
  try {
    const result = await api(`/api/cubes/${cubeId}/retry-failed`, { method: 'POST' });
    if (result.retried === 0) { showToast('没有需要重试的卡牌'); return; }
    let msg = `重试了 ${result.retried} 张牌，${result.success} 张成功获取了卡图`;
    if (result.still_failed > 0) msg += `，${result.still_failed} 张仍然失败`;
    showToast(msg, result.still_failed > 0 ? 'info' : 'success');
    navigate('cube-detail', { id: cubeId });
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '重试失败'; }
  }
}

let _searchTimeout = null;
async function searchCardsForCube(cubeId) {
  const input = document.getElementById('card-search-input');
  const q = (input.value || '').trim();
  if (!q || q.length < 2) { showToast('请输入至少2个字符', 'error'); return; }

  const container = document.getElementById('card-search-results');
  container.style.display = 'block';
  container.innerHTML = '<div class="search-loading"><div class="search-spinner"></div><span>搜索中...</span></div>';

  try {
    const result = await api(`/api/cards/search?q=${encodeURIComponent(q)}`);
    if (!result.cards || result.cards.length === 0) {
      container.innerHTML = '<div class="search-empty">未找到匹配的卡牌</div>';
      return;
    }

    // Track selected state (default: none selected)
    const selectedSet = new Set();

    container.innerHTML = `
      <div class="search-toolbar">
        <div class="search-toolbar-left">
          <span class="search-result-count">找到 ${result.total} 张牌${result.has_more ? ' (显示前20张)' : ''}</span>
          <span class="search-selected-count" id="selected-count">已选: ${selectedSet.size}</span>
        </div>
        <div class="search-toolbar-right">
          <button class="btn btn-outline btn-xs" id="select-all-btn">全选</button>
          <button class="btn btn-primary btn-sm" onclick="addSelectedCards(${cubeId})" id="add-selected-btn" disabled>添加选中 (<span id="selected-num">0</span>)</button>
        </div>
      </div>
      <div class="search-cards-grid">
        ${result.cards.map((card, i) => `
          <div class="search-card-item" data-name="${card.name.replace(/"/g, '&quot;')}" data-index="${i}" onclick="toggleSearchCard(this)">
            <div class="search-card-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            ${card.image_small || card.image ? `
              <img src="${card.image_small || card.image}" alt="${card.name}" class="search-card-img" loading="lazy">
            ` : `
              <div class="search-card-placeholder">
                <div class="search-card-name">${card.name}</div>
                <div class="search-card-type">${card.type || ''}</div>
                <div class="search-card-text">${card.text ? card.text.slice(0, 80) : ''}</div>
                ${card.manaCost ? `<div class="search-card-cost">${renderManaCost(card.manaCost)}</div>` : ''}
              </div>
            `}
          </div>
        `).join('')}
      </div>
    `;

    // Store cards data for addSelectedCards
    window._searchResults = result.cards;

    // Setup select all / deselect all
    document.getElementById('select-all-btn').addEventListener('click', () => {
      const items = container.querySelectorAll('.search-card-item');
      const allSelected = selectedSet.size === result.cards.length;
      items.forEach(item => {
        const name = item.dataset.name;
        if (allSelected) {
          item.classList.remove('selected');
          selectedSet.delete(name);
        } else {
          item.classList.add('selected');
          selectedSet.add(name);
        }
      });
      updateSelectedCount();
    });

    window._searchSelectedSet = selectedSet;

    // Add hover preview to search card items
    const searchItems = container.querySelectorAll('.search-card-item');
    searchItems.forEach(item => {
      const idx = parseInt(item.dataset.index);
      const card = result.cards[idx];
      if (card && (card.image || card.image_small || card.image_back || card.image_small_back)) {
        item.addEventListener('mouseenter', (e) => showCardPreview(card, e));
        item.addEventListener('mousemove', (e) => moveCardPreview(e));
        item.addEventListener('mouseleave', () => hideCardPreview());
      }
    });

    function updateSelectedCount() {
      const count = selectedSet.size;
      document.getElementById('selected-num').textContent = count;
      document.getElementById('selected-count').textContent = `已选: ${count}`;
      const btn = document.getElementById('select-all-btn');
      btn.textContent = count === result.cards.length ? '取消全选' : '全选';
      const addBtn = document.getElementById('add-selected-btn');
      addBtn.disabled = count === 0;
    }
    window._updateSearchSelectedCount = updateSelectedCount;

  } catch (err) {
    container.innerHTML = `<div class="search-empty" style="color:var(--danger)">搜索失败: ${err.message}</div>`;
  }
}

function toggleSearchCard(el) {
  const name = el.dataset.name;
  const selectedSet = window._searchSelectedSet;
  if (!selectedSet) return;

  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    selectedSet.delete(name);
  } else {
    el.classList.add('selected');
    selectedSet.add(name);
  }
  if (window._updateSearchSelectedCount) window._updateSearchSelectedCount();
}

async function addSelectedCards(cubeId) {
  const selectedSet = window._searchSelectedSet;
  if (!selectedSet || selectedSet.size === 0) { showToast('请至少选择一张卡牌', 'error'); return; }
  const cardNames = Array.from(selectedSet);

  const btn = document.getElementById('add-selected-btn');
  if (btn) { btn.disabled = true; btn.textContent = '添加中...'; }

  try {
    const result = await api(`/api/cubes/${cubeId}/add-searched`, {
      method: 'POST',
      body: JSON.stringify({ cardNames })
    });
    let msg = `已添加 ${result.added} 张牌 (${result.fetched}张获取了卡图)`;
    if (result.failed > 0) msg += `\n${result.failed}张未找到: ${result.failed_names.join(', ')}`;
    showToast(msg, result.failed > 0 ? 'info' : 'success');
    navigate('cube-detail', { id: cubeId });
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '添加选中'; }
  }
}

async function deleteCube(id) {
  if (!confirm('确定要删除这个Cube吗？')) return;
  try {
    await api(`/api/cubes/${id}`, { method: 'DELETE' });
    showToast('Cube已删除');
    navigate('cubes');
  } catch (err) { showToast(err.message, 'error'); }
}

// ============================================================
// EVENTS
// ============================================================
async function renderEvents(el) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    const events = await api('/api/events');
    el.innerHTML = `
      <div class="page-header">
        <h2>限制赛事</h2>
        <button class="btn btn-primary" onclick="showCreateEventModal()">创建赛事</button>
      </div>
      <div class="card-grid">
        ${events.map(ev => `
          <div class="card-item" onclick="navigate('event-detail', {id:${ev.id}})" style="position:relative">
            ${String(ev.user_id) === String(state.user?.id) ? `<button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();deleteEvent(${ev.id})" title="删除赛事">&times;</button>` : ''}
            <h3>${ev.name}</h3>
            <span class="badge badge-${ev.type}">${ev.type === 'draft' ? '轮抓' : '现开'}</span>
            <span class="badge" style="background:${(ev.settings && ev.settings.format || 'bo3') === 'bo1' ? '#e74c3c' : '#3498db'};font-size:0.7rem">${(ev.settings && ev.settings.format || 'bo3') === 'bo1' ? 'BO1' : 'BO3'}</span>
            <span class="badge badge-${ev.status === 'waiting' ? 'waiting' : ev.status === 'in_progress' ? 'progress' : 'completed'}">
              ${ev.status === 'waiting' ? '等待中' : ev.status === 'in_progress' ? '进行中' : '已完成'}
            </span>
            <div class="card-meta">
              <span>${ev.participant_count}/${ev.settings.max_players || '?'}人</span>
              <span>${ev.creator_name}</span>
            </div>
            ${ev.cube_name ? `<div class="text-muted" style="font-size:0.8rem;margin-top:4px">Cube: ${escapeHtml(ev.cube_name)}</div>` : ''}
            ${ev.set_name ? `<div class="text-muted" style="font-size:0.8rem;margin-top:4px">系列: ${escapeHtml(ev.set_name)} (${ev.set_code})</div>` : ''}
          </div>
        `).join('') || '<div class="empty-state"><h3>暂无赛事</h3><p>点击"创建赛事"开始</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

var _eventMode = 'cube'; // 'cube' or 'series'
var _setsCache = null;
var _setsLoading = false;

async function showCreateEventModal() {
  try {
    // Fetch cubes first (local, fast) — show modal immediately
    const cubes = await api('/api/cubes');
    _setsCache = null;
    _setsLoading = true;

    showModal('创建赛事', `
      <form onsubmit="handleCreateEvent(event)">
        <div class="form-group"><label>赛事名称</label><input type="text" id="event-name" required placeholder="我的轮抓赛"></div>
        <div class="form-group">
          <label>赛事类型</label>
          <select id="event-type" onchange="document.getElementById('cpp-group').style.display=this.value==='draft'?'block':'none'">
            <option value="draft">轮抓 (Draft)</option>
            <option value="sealed">现开 (Sealed)</option>
          </select>
        </div>
        <div class="form-group">
          <label>卡牌来源</label>
          <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
            <button type="button" class="btn btn-sm btn-primary" onclick="switchEventMode('cube')" id="mode-cube-btn">Cube模式</button>
            <button type="button" class="btn btn-sm btn-outline" onclick="switchEventMode('series')" id="mode-series-btn" disabled style="opacity:0.6">系列模式</button>
            <span id="series-loading" style="display:inline-flex;align-items:center;gap:6px;color:#999;font-size:0.85rem">
              <span class="spinner-sm"></span> 加载系列...
            </span>
          </div>
        </div>
        <div class="form-group" id="cube-select-group" style="display:block">
          <label>关联Cube</label>
          <select id="event-cube">
            <option value="">选择Cube</option>
            ${cubes.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.card_count}张)${c.creator_name ? ' - ' + escapeHtml(c.creator_name) : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="set-select-group" style="display:none">
          <label>万智牌系列</label>
          <select id="event-set">
            <option value="">加载中...</option>
          </select>
          <small class="text-muted" style="display:block;margin-top:4px">系列模式下，卡包随机14张（含1张地牌位，可为非基本地或基本地）</small>
        </div>
        <div class="form-group">
          <label>赛制</label>
          <select id="event-format">
            <option value="bo1">BO1 (一局定胜负)</option>
            <option value="bo3" selected>BO3 (三局两胜)</option>
          </select>
        </div>
        <div class="form-group">
          <label>最大人数</label>
          <input type="number" id="event-max-players" value="8" min="2" max="24">
        </div>
        <div class="form-group">
          <label>每轮包数</label>
          <input type="number" id="event-packs" value="3" min="1" max="6">
        </div>
        <div class="form-group" id="cards-per-pack-group" style="display:block">
          <label>每包卡牌数 (Cube模式)</label>
          <input type="number" id="event-cards-per-pack" value="15" min="5" max="20">
          <small class="text-muted" style="display:block;margin-top:4px">系列模式固定为14张（含1张地牌位）</small>
        </div>
        <div class="form-group" id="cpp-group">
          <label>每次选牌数 (cards_per_pick)</label>
          <input type="number" id="event-cards-per-pick" value="1" min="1" max="5">
          <small class="text-muted" style="display:block;margin-top:4px">轮抓时每次从包中选取的卡牌数量，1为经典模式</small>
        </div>
        <button type="submit" class="btn btn-primary btn-block">创建赛事</button>
      </form>
    `);

    // Load sets in the background
    api('/api/sets').then(function(setsRes) {
      _setsCache = setsRes.sets || [];
      _setsLoading = false;
      // Update UI: enable series button, hide loading, populate select
      var seriesBtn = document.getElementById('mode-series-btn');
      var loadingEl = document.getElementById('series-loading');
      var setSelect = document.getElementById('event-set');
      if (seriesBtn) {
        seriesBtn.disabled = false;
        seriesBtn.style.opacity = '1';
      }
      if (loadingEl) loadingEl.style.display = 'none';
      if (setSelect) {
        setSelect.innerHTML = '<option value="">选择系列</option>' +
          _setsCache.map(function(s) {
            return '<option value="' + s.code + '">' + escapeHtml(s.name) + ' (' + s.card_count + '张)</option>';
          }).join('');
      }
      // If user already clicked series mode, show the group now
      if (_eventMode === 'series') {
        var setGroup = document.getElementById('set-select-group');
        if (setGroup) setGroup.style.display = 'block';
      }
    }).catch(function(err) {
      _setsLoading = false;
      var loadingEl = document.getElementById('series-loading');
      if (loadingEl) loadingEl.innerHTML = '<span style="color:#e74c3c">加载失败: ' + escapeHtml(err.message) + '</span>';
      var seriesBtn = document.getElementById('mode-series-btn');
      if (seriesBtn) { seriesBtn.disabled = false; seriesBtn.style.opacity = '1'; }
    });

  } catch (err) {
    showToast(err.message, 'error');
  }
}

function switchEventMode(mode) {
  _eventMode = mode;
  var cubeBtn = document.getElementById('mode-cube-btn');
  var seriesBtn = document.getElementById('mode-series-btn');
  var cubeGroup = document.getElementById('cube-select-group');
  var setGroup = document.getElementById('set-select-group');
  var cppGroup = document.getElementById('cards-per-pack-group');
  if (cubeBtn && seriesBtn) {
    cubeBtn.className = 'btn btn-sm ' + (mode === 'cube' ? 'btn-primary' : 'btn-outline');
    seriesBtn.className = 'btn btn-sm ' + (mode === 'series' ? 'btn-primary' : 'btn-outline');
  }
  if (cubeGroup) cubeGroup.style.display = mode === 'cube' ? 'block' : 'none';
  if (setGroup) {
    if (mode === 'series') {
      if (_setsLoading) {
        setGroup.style.display = 'block';
        var setSelect = document.getElementById('event-set');
        if (setSelect) setSelect.innerHTML = '<option value="">加载中...</option>';
      } else {
        setGroup.style.display = 'block';
      }
    } else {
      setGroup.style.display = 'none';
    }
  }
  if (cppGroup) cppGroup.style.display = mode === 'cube' ? 'block' : 'none';
}

async function handleCreateEvent(e) {
  e.preventDefault();
  const name = document.getElementById('event-name').value.trim();
  const type = document.getElementById('event-type').value;
  const settings = {
    max_players: parseInt(document.getElementById('event-max-players').value) || 8,
    packs_per_player: parseInt(document.getElementById('event-packs').value) || 3,
    cards_per_pick: type === 'draft' ? (parseInt(document.getElementById('event-cards-per-pick').value) || 1) : 1,
    format: document.getElementById('event-format').value || 'bo3'
  };

  var body = { name, type, settings };

  if (_eventMode === 'series') {
    var setSelect = document.getElementById('event-set');
    var setCode = setSelect ? setSelect.value : '';
    if (!setCode) { showToast('请选择一个万智牌系列', 'error'); return; }
    var setObj = (_setsCache || []).find(function(s) { return s.code === setCode; });
    body.set_code = setCode;
    body.set_name = setObj ? setObj.name : setCode;
    body.cards_per_pack = 14; // Play Booster standard
  } else {
    var cube_id = parseInt(document.getElementById('event-cube').value) || null;
    if (!cube_id) { showToast('请选择一个Cube', 'error'); return; }
    body.cube_id = cube_id;
    body.cards_per_pack = parseInt(document.getElementById('event-cards-per-pack').value) || 15;
    settings.cards_per_pack = body.cards_per_pack;
  }

  try {
    const event = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    closeModal();
    showToast('赛事创建成功');
    navigate('event-detail', { id: event.id });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function renderEventDetail(el, id) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  // Stop any existing draft polling
  if (draftPollInterval) { clearInterval(draftPollInterval); draftPollInterval = null; }
  window._draftWaiting = false;
  window._lastPackIds = null;

  try {
    const [event, myDeckRaw, eventBattlesRaw] = await Promise.all([
      api(`/api/events/${id}`),
      api(`/api/events/${id}/my-deck`).catch(() => null),
      api(`/api/events/${id}/battles`).catch(() => [])
    ]);
    const eventBattles = Array.isArray(eventBattlesRaw) ? eventBattlesRaw : [];
    const myDeck = (myDeckRaw && myDeckRaw.id) ? myDeckRaw : null;
    const participants = event.participants || [];
    const myParticipation = event.my_participation;
    const settings = event.settings || {};
    const cardsPerPick = settings.cards_per_pick || 1;
    state.pageData._cardsPerPick = cardsPerPick;
    state.pageData._eventId = id;
    const isOwner = String(event.user_id) === String(state.user?.id);
    const isParticipant = !!myParticipation;
    const hasPool = isParticipant && myParticipation.pool && myParticipation.pool.length > 0;
    const canBuildDeck = hasPool && (event.status === 'completed' || event.type === 'sealed');

    // Determine current pack using new format with legacy fallback
    let currentPack = [];
    let packData = myParticipation?.current_packs;
    if (packData) {
      currentPack = packData.current || (Array.isArray(packData) ? packData[0] : []) || [];
    }

    const isMyTurnToPick = currentPack.length > 0 && event.status === 'in_progress' && isParticipant;

    // Calculate standings from battles
    const standings = {};
    participants.forEach(p => {
      const name = p.username || 'Bot';
      standings[p.user_id || p.seat_number] = { name, wins: 0, losses: 0, gameWins: 0, gameLosses: 0 };
    });
    (eventBattles || []).forEach(b => {
      if (b.status === 'completed' && b.winner_id) {
        const p1id = b.player1_id, p2id = b.player2_id;
        const p1w = b.player1_wins || 0, p2w = b.player2_wins || 0;
        if (standings[p1id]) {
          standings[p1id].gameWins += p1w;
          standings[p1id].gameLosses += p2w;
          if (b.winner_id === p1id) standings[p1id].wins++;
          else standings[p1id].losses++;
        }
        if (standings[p2id]) {
          standings[p2id].gameWins += p2w;
          standings[p2id].gameLosses += p1w;
          if (b.winner_id === p2id) standings[p2id].wins++;
          else standings[p2id].losses++;
        }
      }
    });
    const standingsArr = Object.values(standings).sort((a, b) => b.wins - a.wins || a.losses - b.losses);

    // My active battle (if any)
    const myActiveBattle = (eventBattles || []).find(b =>
      b.status === 'in_progress' && (b.player1_id === state.user?.id || b.player2_id === state.user?.id)
    );
    const myWaitingBattle = (eventBattles || []).find(b =>
      b.status === 'waiting' && b.player1_id === state.user?.id
    );

    // Tournament state
    const currentMaxRound = (eventBattles || []).reduce((max, b) => Math.max(max, b.round || 1), 0);
    const currentRoundBattles = (eventBattles || []).filter(b => (b.round || 1) === currentMaxRound);
    const allCurrentRoundDone = currentMaxRound > 0 && currentRoundBattles.length > 0 && currentRoundBattles.every(b => b.status === 'completed');
    const myEliminated = (eventBattles || []).some(b =>
      b.status === 'completed' && b.winner_id && b.winner_id !== state.user?.id &&
      (b.player1_id === state.user?.id || b.player2_id === state.user?.id)
    );

    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="navigate('events')">← 返回</button>
          <h2>${event.name}</h2>
          <div style="margin-top:4px">
            <span class="badge badge-${event.type}">${event.type === 'draft' ? '轮抓' : '现开'}</span>
            <span class="badge" style="background:${(settings.format || 'bo3') === 'bo1' ? '#e74c3c' : '#3498db'}">${(settings.format || 'bo3') === 'bo1' ? 'BO1' : 'BO3'}</span>
            <span class="badge badge-${event.status === 'waiting' ? 'waiting' : event.status === 'in_progress' ? 'progress' : 'completed'}">
              ${event.status === 'waiting' ? '等待中' : event.status === 'in_progress' ? '进行中' : '已完成'}
            </span>
          </div>
        </div>
        <div class="flex gap-8">
          ${!isParticipant && event.status === 'waiting' ? `<button class="btn btn-success" onclick="joinEvent(${id})">加入</button>` : ''}
          ${isOwner && event.status === 'waiting' ? `<button class="btn btn-secondary" onclick="botFillEvent(${id})">机器人补位</button>` : ''}
          ${isOwner && event.status === 'waiting' ? `<button class="btn btn-warning" onclick="startEvent(${id})">开始</button>` : ''}
          ${isOwner ? `<button class="btn btn-danger" onclick="deleteEvent(${id})">删除</button>` : ''}
        </div>
      </div>

      <div class="event-info-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">
        <div class="stat-card"><div class="stat-value">${participants.length}/${settings.max_players || '?'}</div><div class="stat-label">参与者</div></div>
        <div class="stat-card"><div class="stat-value">${settings.packs_per_player || '?'}</div><div class="stat-label">包数/人</div></div>
        <div class="stat-card"><div class="stat-value">${settings.cards_per_pack || '?'}</div><div class="stat-label">卡牌/包</div></div>
        ${event.type === 'draft' ? `<div class="stat-card"><div class="stat-value">${cardsPerPick}</div><div class="stat-label">每次选牌数</div></div>` : ''}
        ${event.set_name ? `<div class="stat-card"><div class="stat-value" style="font-size:0.85rem">${escapeHtml(event.set_name)}</div><div class="stat-label">系列 (${event.set_code})</div></div>` : ''}
        ${event.cube_name ? `<div class="stat-card"><div class="stat-value" style="font-size:0.85rem">${escapeHtml(event.cube_name)}</div><div class="stat-label">Cube</div></div>` : ''}
      </div>

      ${event.round_status ? `
        <div style="margin-bottom:16px;padding:12px;background:var(--surface);border-radius:8px">
          <strong style="color:var(--text-bright)">轮次状态:</strong>
          ${event.round_status.picked.length > 0 ? `<span class="text-muted"> 已选: ${event.round_status.picked.map(p => p.username || `座位${p.seat}`).join(', ')}</span>` : ''}
          ${event.round_status.waiting_for.length > 0 ? `<span style="color:var(--warning)"> | 等待: ${event.round_status.waiting_for.map(p => p.username || `座位${p.seat}`).join(', ')}</span>` : ''}
        </div>
      ` : ''}

      ${isParticipant && isMyTurnToPick ? `
        <div class="draft-layout" style="display:flex;gap:16px;align-items:flex-start;margin-bottom:24px">
          <!-- LEFT: Pick Area -->
          <div class="draft-pick-side" style="flex:1;min-width:0">
            <h3 style="color:var(--text-bright);margin-bottom:8px">
              ${event.type === 'draft' ? '轮抓选牌' : '牌池'}
            </h3>
            <div id="draft-pick-area">
              <div id="draft-confirm-bar" class="hidden" style="margin-bottom:12px;padding:12px;background:var(--surface);border-radius:8px;display:flex;align-items:center;gap:12px">
                <span id="draft-selected-count">已选: 0 / ${cardsPerPick}</span>
                <button class="btn btn-primary btn-sm" id="draft-confirm-btn" onclick="confirmDraftPick(${id})" disabled>确认选择</button>
              </div>
              <div id="draft-cards-container" class="mtg-cards-grid"></div>
            </div>
          </div>
          <!-- RIGHT: Drafted Pool -->
          <div class="draft-pool-side" style="width:320px;flex-shrink:0;position:sticky;top:16px;max-height:calc(100vh - 32px);overflow-y:auto;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
              <h3 style="color:var(--text-bright);margin:0;font-size:0.95rem">已抓到的牌</h3>
              <span class="text-muted" style="font-size:0.85rem">${myParticipation.pool ? myParticipation.pool.length : 0}张</span>
            </div>
            <div id="event-pool-container"></div>
          </div>
        </div>
      ` : isParticipant && event.status === 'in_progress' ? `
        <!-- Full-width pool while waiting for other players -->
        <div style="margin-bottom:24px">
          <div style="text-align:center;padding:16px;margin-bottom:12px;background:linear-gradient(135deg,rgba(243,156,18,0.15),rgba(243,156,18,0.05));border:1px solid var(--warning);border-radius:var(--radius-lg)">
            <p style="color:var(--warning);font-weight:600;font-size:1rem;margin:0">等待其他玩家选牌...</p>
            <p class="text-muted" style="font-size:0.85rem;margin-top:4px">页面会自动刷新</p>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
              <h3 style="color:var(--text-bright);margin:0;font-size:0.95rem">已抓到的牌</h3>
              <span class="text-muted" style="font-size:0.85rem">${myParticipation.pool ? myParticipation.pool.length : 0}张</span>
            </div>
            <div id="event-pool-container"></div>
          </div>
        </div>
      ` : isParticipant && event.status === 'completed' && myParticipation.pool && myParticipation.pool.length > 0 ? `
        <!-- Full-width pool when draft is completed -->
        <div style="margin-bottom:24px">
          <div style="text-align:center;padding:12px;margin-bottom:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg)">
            <p style="color:var(--text-muted);font-weight:600;font-size:1rem;margin:0">轮抓已结束</p>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
              <h3 style="color:var(--text-bright);margin:0;font-size:0.95rem">已抓到的牌</h3>
              <span class="text-muted" style="font-size:0.85rem">${myParticipation.pool.length}张</span>
            </div>
            <div id="event-pool-container"></div>
          </div>
        </div>
      ` : ''}

      <!-- Deck & Battle Section -->
      ${canBuildDeck ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
          <!-- Deck Status -->
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px">
            <h3 style="color:var(--text-bright);margin-bottom:12px">我的牌组</h3>
            ${myDeck ? `
              <div style="margin-bottom:8px">
                <strong style="color:var(--text-bright)">${myDeck.name}</strong>
                <span class="text-muted" style="font-size:0.85rem;margin-left:8px">${myDeck.main_deck.length}张</span>
              </div>
              <div class="flex gap-8">
                <button class="btn btn-secondary btn-sm" onclick="navigate('deck-builder', {eventId:${id}, deckId:${myDeck.id}})">编辑牌组</button>
              </div>
            ` : `
              <p class="text-muted" style="margin-bottom:12px">还没有构建牌组</p>
              <button class="btn btn-primary btn-sm" onclick="navigate('deck-builder', {eventId:${id}})">构建牌组</button>
            `}
          </div>

          <!-- My Battle Status -->
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px">
            <h3 style="color:var(--text-bright);margin-bottom:12px">我的对战</h3>
            ${myActiveBattle ? `
              <div style="margin-bottom:8px">
                <strong style="color:var(--text-bright)">
                  第${myActiveBattle.round || 1}轮: ${myActiveBattle.player1_name} vs ${myActiveBattle.player2_name}
                </strong>
                <span class="text-muted" style="font-size:0.85rem;margin-left:8px">
                  第${myActiveBattle.current_game || 1}局 | ${myActiveBattle.player1_wins || 0}-${myActiveBattle.player2_wins || 0}
                </span>
              </div>
              <button class="btn btn-primary btn-sm" onclick="openBattle(${myActiveBattle.id})">进入对战</button>
            ` : myWaitingBattle ? `
              <div style="margin-bottom:8px">
                <strong style="color:var(--text-bright)">
                  第${myWaitingBattle.round || 1}轮: ${myWaitingBattle.player1_name} vs ${myWaitingBattle.player2_name}
                </strong>
              </div>
              <div class="text-muted" style="font-size:0.85rem">等待双方就绪，由创建者开始对战</div>
              <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="openBattle(${myWaitingBattle.id})">进入对战</button>
            ` : myEliminated ? `
              <p class="text-muted" style="color:var(--danger)">你已被淘汰</p>
            ` : myDeck ? `
              <p class="text-muted">暂无进行中的对战</p>
            ` : `
              <p class="text-muted">请先构建牌组</p>
            `}
          </div>
        </div>

        <!-- Tournament Controls (owner only) -->
        ${isOwner && (eventBattles || []).length === 0 && myDeck ? `
          <div style="margin-bottom:24px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);text-align:center">
            <h3 style="color:var(--text-bright);margin-bottom:8px">淘汰赛配对</h3>
            <p class="text-muted" style="margin-bottom:12px">所有玩家构建完牌组后，点击自动配对开始第一轮</p>
            <button class="btn btn-primary" onclick="autoPairEvent(${id})">自动配对</button>
          </div>
        ` : isOwner && allCurrentRoundDone ? `
          <div style="margin-bottom:24px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);text-align:center">
            <h3 style="color:var(--text-bright);margin-bottom:8px">第${currentMaxRound}轮已全部结束</h3>
            <p class="text-muted" style="margin-bottom:12px">点击配对下一轮对战</p>
            <button class="btn btn-primary" onclick="nextRoundEvent(${id})">配对下一轮</button>
          </div>
        ` : ''}
      ` : ''}

      <!-- Deck Overview -->
      ${myDeck && myDeck.main_deck && myDeck.main_deck.length > 0 ? `
        <div style="margin-bottom:24px">
          <h3 style="color:var(--text-bright);margin-bottom:12px">牌组概览 <span class="text-muted" style="font-size:0.85rem">(${myDeck.main_deck.length}张)</span></h3>
          <div id="deck-overview-container" class="deck-cards-sm" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px"></div>
        </div>
      ` : ''}

      <!-- Event Battles (grouped by round) -->
      ${(eventBattles || []).length > 0 ? `
        <div style="margin-bottom:24px">
          <h3 style="color:var(--text-bright);margin-bottom:12px">淘汰赛</h3>
          ${[...new Set((eventBattles || []).map(b => b.round || 1))].sort((a, b) => a - b).map(round => {
            const roundBattles = (eventBattles || []).filter(b => (b.round || 1) === round);
            const roundDone = roundBattles.every(b => b.status === 'completed');
            return `
              <div style="margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span style="color:var(--text-bright);font-weight:600;font-size:0.95rem">第${round}轮</span>
                  <span class="badge badge-${roundDone ? 'completed' : 'progress'}">${roundDone ? '已结束' : '进行中'}</span>
                </div>
                <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
                  ${roundBattles.map(b => `
                    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                      <div>
                        <strong style="color:${b.status === 'completed' && b.winner_id === b.player1_id ? 'var(--success)' : 'var(--text-bright)'}">${b.player1_name || '?'}</strong>
                        <span class="text-muted" style="margin:0 6px">vs</span>
                        <strong style="color:${b.status === 'completed' && b.winner_id === b.player2_id ? 'var(--success)' : 'var(--text-bright)'}">${b.player2_name || '?'}</strong>
                        <span class="badge badge-${b.status === 'completed' ? 'completed' : b.status === 'in_progress' ? 'progress' : 'waiting'}" style="margin-left:8px">
                          ${b.status === 'completed' ? '已结束' : b.status === 'in_progress' ? '进行中' : '等待中'}
                        </span>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-weight:600;color:var(--text-bright);font-size:0.9rem">
                          ${b.player1_wins || 0} - ${b.player2_wins || 0}
                        </span>
                        ${(b.player1_id === state.user?.id || b.player2_id === state.user?.id) ? `<button class="btn btn-secondary btn-sm" onclick="openBattle(${b.id})">${b.status === 'completed' ? '查看' : '进入'}</button>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      <!-- Standings -->
      ${(eventBattles || []).length > 0 ? `
        <div style="margin-bottom:24px">
          <h3 style="color:var(--text-bright);margin-bottom:12px">积分榜</h3>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
            <div style="padding:8px 16px;background:var(--surface);display:grid;grid-template-columns:40px 1fr 80px 80px 80px;gap:8px;font-size:0.8rem;color:var(--text-muted);font-weight:600">
              <span>#</span><span>玩家</span><span>胜负</span><span>局胜</span><span>局负</span>
            </div>
            ${standingsArr.map((s, i) => `
              <div style="padding:8px 16px;border-top:1px solid var(--border);display:grid;grid-template-columns:40px 1fr 80px 80px 80px;gap:8px;font-size:0.85rem">
                <span style="color:var(--text-muted)">${i + 1}</span>
                <span style="color:var(--text-bright)">${s.name}</span>
                <span>${s.wins}-${s.losses}</span>
                <span>${s.gameWins}</span>
                <span>${s.gameLosses}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <h3 style="color:var(--text-bright);margin-bottom:12px">参与者</h3>
      <div class="participants-list">
        ${participants.map(p => {
          const s = standings[p.user_id];
          return `
          <div class="participant-item">
            <span class="seat-number">#${p.seat_number}</span>
            <span class="participant-name">${p.username || 'Bot'}</span>
            <span class="badge badge-${p.status === 'bot' ? 'secondary' : p.status === 'drafting' ? 'progress' : p.status === 'building' ? 'waiting' : 'completed'}">
              ${p.status === 'bot' ? '机器人' : p.status === 'drafting' ? '轮抓中' : p.status === 'building' ? '构组中' : p.status === 'waiting' ? '等待中' : '已完成'}
            </span>
            ${p.pick_count != null ? `<span class="text-muted" style="font-size:0.8rem">${p.pick_count}选</span>` : ''}
            ${p.pool_size != null ? `<span class="text-muted" style="font-size:0.8rem">| ${p.pool_size}张</span>` : ''}
            ${s ? `<span style="font-size:0.8rem;color:var(--text-bright);margin-left:auto">${s.wins}胜${s.losses}负</span>` : ''}
          </div>
        `}).join('') || '<div class="text-muted">暂无参与者</div>'}
      </div>
    `;

    // Render draft cards for picking
    if (isMyTurnToPick) {
      const container = el.querySelector('#draft-cards-container');
      if (container) {
        renderDraftCards(currentPack, cardsPerPick);
      }
    }

    // Render pool cards (already drafted)
    if (isParticipant && myParticipation.pool && myParticipation.pool.length > 0) {
      updateDraftPool(myParticipation);
    }

    // Render deck overview
    if (myDeck && myDeck.main_deck && myDeck.main_deck.length > 0) {
      const deckContainer = el.querySelector('#deck-overview-container');
      if (deckContainer) {
        const piles = groupCardsByName(myDeck.main_deck);
        const grid = document.createElement('div');
        grid.className = 'mtg-cards-grid';
        grid.style.gap = '12px';
        piles.forEach(function(pile) {
          var pileEl = document.createElement('div');
          pileEl.className = 'deck-card-pile';
          pileEl.style.position = 'relative';
          pileEl.style.width = '120px';
          pileEl.style.height = '183px';
          pile.cards.forEach(function(card, idx) {
            var el2 = createCardElement(card);
            el2.style.width = '120px';
            el2.style.fontSize = '0.7rem';
            el2.style.position = 'absolute';
            el2.style.top = Math.min(idx * 3, 15) + 'px';
            el2.style.left = Math.min(idx * 3, 15) + 'px';
            el2.style.zIndex = idx;
            el2.addEventListener('mouseenter', function(e) { showCardPreview(card); moveCardPreview(e); });
            el2.addEventListener('mousemove', moveCardPreview);
            el2.addEventListener('mouseleave', hideCardPreview);
            pileEl.appendChild(el2);
          });
          if (pile.cards.length > 1) {
            var label = document.createElement('div');
            label.className = 'deck-pile-count';
            label.textContent = 'x' + pile.cards.length;
            pileEl.appendChild(label);
          }
          grid.appendChild(pileEl);
        });
        deckContainer.appendChild(grid);
      }
    }

    // Start polling if event is in progress and I'm a participant
    if (event.status === 'in_progress' && isParticipant) {
      startDraftPolling(id);
    }
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

async function joinEvent(id) {
  try {
    await api(`/api/events/${id}/join`, { method: 'POST' });
    showToast('已加入赛事');
    navigate('event-detail', { id });
  } catch (err) { showToast(err.message, 'error'); }
}

async function botFillEvent(id) {
  try {
    const result = await api(`/api/events/${id}/bot-fill`, { method: 'POST' });
    showToast(`已添加 ${result.added} 个机器人`);
    navigate('event-detail', { id });
  } catch (err) { showToast(err.message, 'error'); }
}

async function autoPairEvent(eventId) {
  try {
    if (!confirm('确定要自动配对所有已构建牌组的玩家吗？')) return;
    const result = await api(`/api/events/${eventId}/auto-pair`, { method: 'POST' });
    var msg = '已创建 ' + result.battles.length + ' 场对战';
    if (result.bye_player) msg += '，' + result.bye_player.name + ' 本轮轮空';
    showToast(msg);
    navigate('event-detail', { id: eventId });
  } catch (err) { showToast(err.message, 'error'); }
}

async function nextRoundEvent(eventId) {
  try {
    if (!confirm('确定要配对下一轮对战吗？')) return;
    const result = await api(`/api/events/${eventId}/next-round`, { method: 'POST' });
    if (result.champion) {
      showToast(result.message);
    } else {
      var msg = '第' + result.round + '轮: 已创建 ' + result.battles.length + ' 场对战';
      if (result.bye_player) msg += '，' + result.bye_player.name + ' 本轮轮空';
      showToast(msg);
    }
    navigate('event-detail', { id: eventId });
  } catch (err) { showToast(err.message, 'error'); }
}

function openBattle(battleId) {
  window.open('/battle.html?id=' + battleId, '_blank');
}

async function startEvent(id) {
  if (!confirm('确定要开始赛事吗？')) return;
  try {
    const result = await api(`/api/events/${id}/start`, { method: 'POST' });
    showToast(result.message || '赛事已开始！');
    navigate('event-detail', { id });
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteEvent(id) {
  if (!confirm('确定要删除这个赛事吗？')) return;
  try {
    await api(`/api/events/${id}`, { method: 'DELETE' });
    showToast('赛事已删除');
    navigate('events');
  } catch (err) { showToast(err.message, 'error'); }
}

// ============================================================
// DRAFT SYSTEM
// ============================================================
let draftPollInterval = null;
let draftSelectedCards = [];

function renderDraftCards(cards, cardsPerPick) {
  window._draftWaiting = false;
  window._lastPackIds = cards.map(c => String(c.id));
  const container = document.getElementById('draft-cards-container');
  if (!container) return;

  // If cardsPerPick > 1, show the confirm bar
  const confirmBar = document.getElementById('draft-confirm-bar');
  if (confirmBar) {
    if (cardsPerPick > 1) {
      confirmBar.classList.remove('hidden');
      confirmBar.style.display = 'flex';
    } else {
      confirmBar.classList.add('hidden');
    }
  }

  draftSelectedCards = [];
  container.innerHTML = '';

  cards.forEach(card => {
    const el = createCardElement(card, () => {
      if (cardsPerPick <= 1) {
        // Single pick: flash highlight then auto-confirm
        el.classList.add('selected', 'single-pick-flash');
        setTimeout(() => {
          confirmDraftPickSingle(state.pageData.id || state.pageData, [card.id]);
        }, 250);
      } else {
        toggleDraftCardSelection(card, el);
      }
    });
    el.setAttribute('data-card-id', card.id);
    container.appendChild(el);
  });

  updateDraftConfirmUI(cardsPerPick);
}

function toggleDraftCardSelection(card, element) {
  const idx = draftSelectedCards.findIndex(c => c.id === card.id);
  if (idx >= 0) {
    draftSelectedCards.splice(idx, 1);
    element.classList.remove('selected');
  } else {
    draftSelectedCards.push(card);
    element.classList.add('selected');
  }
  const cardsPerPick = (state.pageData && state.pageData._cardsPerPick) || 1;
  updateDraftConfirmUI(cardsPerPick);
}

function updateDraftConfirmUI(cardsPerPick) {
  const countEl = document.getElementById('draft-selected-count');
  const btn = document.getElementById('draft-confirm-btn');
  // 包里剩余卡牌数;少于 cardsPerPick 时(如最后一轮只剩1张)允许单独确认
  const container = document.getElementById('draft-cards-container');
  const currentPackLen = container ? container.querySelectorAll('[data-card-id]').length : 0;
  const maxPickable = Math.min(cardsPerPick, Math.max(1, currentPackLen));
  if (countEl) countEl.textContent = `已选: ${draftSelectedCards.length} / ${maxPickable}`;
  if (btn) btn.disabled = draftSelectedCards.length < 1 || draftSelectedCards.length > maxPickable;
}

async function confirmDraftPickSingle(eventId, cardIds) {
  try {
    // Save remaining card IDs (current pack minus picked cards) BEFORE showing waiting
    var remainingIds = (window._lastPackIds || []).filter(function(id) {
      return cardIds.indexOf(id) === -1 && cardIds.indexOf(Number(id)) === -1 && cardIds.indexOf(String(id)) === -1;
    });
    const result = await api(`/api/events/${eventId}/pick`, {
      method: 'POST',
      body: JSON.stringify({ card_ids: cardIds })
    });
    if (result.draft_complete) {
      showToast('轮抓完成！请构建你的牌组');
      navigate('event-detail', { id: eventId });
    } else {
      // 不立即重渲染 —— 显示等待状态,等轮询把新包带回来
      window._draftWaiting = true;
      window._lastPackIds = remainingIds; // so poll knows the "old" remaining pack
      showDraftWaiting(eventId);
    }
  } catch (err) { showToast(err.message, 'error'); }
}

async function confirmDraftPick(eventId) {
  const cardsPerPick = (state.pageData && state.pageData._cardsPerPick) || 1;
  // 允许少于 cardsPerPick —— 包里只剩奇数张时,最后一张可单独抓
  const currentPackLen = (() => {
    const c = document.getElementById('draft-cards-container');
    return c ? c.querySelectorAll('[data-card-id]').length : 0;
  })();
  const maxPickable = Math.min(cardsPerPick, Math.max(1, currentPackLen));
  if (draftSelectedCards.length < 1 || draftSelectedCards.length > maxPickable) {
    showToast(`请选择 1-${maxPickable} 张卡牌`, 'error');
    return;
  }
  const cardIds = draftSelectedCards.map(c => c.id);
  const confirmBtn = document.getElementById('draft-confirm-btn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '确认中...'; }

  try {
    // Save remaining card IDs (current pack minus picked cards) BEFORE showing waiting
    var remainingIds = (window._lastPackIds || []).filter(function(id) {
      return cardIds.indexOf(id) === -1 && cardIds.indexOf(Number(id)) === -1 && cardIds.indexOf(String(id)) === -1;
    });
    const result = await api(`/api/events/${eventId}/pick`, {
      method: 'POST',
      body: JSON.stringify({ card_ids: cardIds })
    });
    if (result.draft_complete) {
      showToast('轮抓完成！请构建你的牌组');
      navigate('event-detail', { id: eventId });
    } else {
      // 不立即重渲染 —— 显示等待状态,等轮询把新包带回来
      window._draftWaiting = true;
      window._lastPackIds = remainingIds; // so poll knows the "old" remaining pack
      showDraftWaiting(eventId);
    }
  } catch (err) {
    showToast(err.message, 'error');
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '确认选择'; }
  }
}

// 选牌后:清空卡牌区 + 显示等待横幅
// 轮询 pollDraftState 会在新包到达时自动重新渲染
function showDraftWaiting(eventId) {
  draftSelectedCards = [];
  const container = document.getElementById('draft-cards-container');
  const confirmBar = document.getElementById('draft-confirm-bar');
  if (confirmBar) confirmBar.style.display = 'none';
  if (container) {
    container.innerHTML = `
      <div class="empty-state" style="padding:40px 24px">
        <div class="loading" style="margin:0 auto 16px"></div>
        <p style="color:var(--warning);font-size:1rem">⏳ 等待其他玩家选牌后传牌...</p>
        <p class="text-muted" style="font-size:0.85rem;margin-top:8px">新卡包到达后会自动显示</p>
      </div>
    `;
  }
}

function startDraftPolling(eventId) {
  if (draftPollInterval) clearInterval(draftPollInterval);
  draftPollInterval = setInterval(() => pollDraftState(eventId), 3000);
}

async function pollDraftState(eventId) {
  // Stop polling if user navigated away from this event
  if (state.currentPage !== 'event-detail' || state.pageData.id !== eventId) {
    clearInterval(draftPollInterval);
    draftPollInterval = null;
    return;
  }

  try {
    const event = await api(`/api/events/${eventId}`);
    const myParticipation = event.my_participation;
    if (!myParticipation) return;

    let currentPack = [];
    const packData = myParticipation.current_packs;
    if (packData) {
      currentPack = packData.current || (Array.isArray(packData) ? packData[0] : []) || [];
    }

    const container = document.getElementById('draft-cards-container');
    if (!container) return;

    // If the pack is empty, event might have ended or we're waiting
    if (currentPack.length === 0) {
      // Check if draft completed
      if (event.status === 'completed') {
        clearInterval(draftPollInterval);
        draftPollInterval = null;
        showToast('轮抓完成！');
        navigate('event-detail', { id: eventId });
      }
      // Keep showing waiting state
      if (!window._draftWaiting) {
        showDraftWaiting(eventId);
        window._draftWaiting = true;
        window._lastPackIds = [];
      }
      // Update pool display
      updateDraftPool(myParticipation);
      return;
    }

    const newIds = currentPack.map(c => String(c.id));

    // If we were waiting, check if it's a genuinely new pack (not just remaining cards)
    if (window._draftWaiting) {
      const lastIds = window._lastPackIds || [];
      const isSameAsOld = lastIds.length === newIds.length &&
        lastIds.every((id, i) => id === newIds[i]);

      if (isSameAsOld) {
        // Still the same old pack (remaining cards from our pick), keep waiting
        updateDraftPool(myParticipation);
        return;
      }
      // New pack arrived, clear waiting and render
      window._draftWaiting = false;
    }

    // Normal polling: compare with last known pack IDs
    const lastIds = window._lastPackIds || [];
    const same = lastIds.length === newIds.length &&
      lastIds.every((id, i) => id === newIds[i]);

    if (!same) {
      window._lastPackIds = newIds;
      const cardsPerPick = (event.settings && event.settings.cards_per_pick) || 1;
      draftSelectedCards = [];
      renderDraftCards(currentPack, cardsPerPick);
    }

    // Update pool display
    updateDraftPool(myParticipation);
  } catch (err) {
    // Silently ignore poll errors to avoid UI disruption
  }
}

function updateDraftPool(myParticipation) {
  const poolContainer = document.getElementById('event-pool-container');
  if (!poolContainer) return;
  const pool = myParticipation.pool || [];
  if (pool.length === 0) {
    poolContainer.innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;font-size:0.85rem">还没有抓到牌</div>';
    return;
  }

  const groups = groupCardsByColor(pool);
  poolContainer.innerHTML = Object.entries(groups).filter(([, cards]) => cards.length > 0).map(([color, cards]) => `
    <div style="margin-bottom:10px">
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;font-weight:600">${COLOR_NAMES[color] || color} (${cards.length})</div>
      <div class="pool-cards-compact pool-${color}" style="display:flex;flex-wrap:wrap;gap:3px"></div>
    </div>
  `).join('');
  setTimeout(() => {
    Object.entries(groups).filter(([, cards]) => cards.length > 0).forEach(([color, cards]) => {
      const gridEl = poolContainer.querySelector(`.pool-${color}`);
      if (gridEl) cards.forEach(card => {
        const imgSrc = card.image_small || card.image;
        if (imgSrc) {
          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = card.name || '';
          img.title = card.name || '';
          img.loading = 'lazy';
          img.style.cssText = 'width:48px;height:67px;object-fit:cover;border-radius:3px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;transition:transform 0.15s,box-shadow 0.15s';
          img.onmouseenter = function(e) {
            this.style.transform='scale(1.1)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.5)'; this.style.zIndex='10'; this.style.position='relative';
            showCardPreview(card, e); moveCardPreview(e);
          };
          img.onmousemove = function(e) { moveCardPreview(e); };
          img.onmouseleave = function() {
            this.style.transform=''; this.style.boxShadow=''; this.style.zIndex=''; this.style.position='';
            hideCardPreview();
          };
          gridEl.appendChild(img);
        } else {
          const el = document.createElement('div');
          el.textContent = card.name || '?';
          el.style.cssText = 'width:48px;height:67px;background:var(--bg-darkest);border-radius:3px;border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:0.5rem;color:var(--text-muted);text-align:center;padding:2px;overflow:hidden;cursor:pointer';
          el.title = card.name || '';
          el.onmouseenter = function(e) { showCardPreview(card, e); moveCardPreview(e); };
          el.onmousemove = function(e) { moveCardPreview(e); };
          el.onmouseleave = function() { hideCardPreview(); };
          gridEl.appendChild(el);
        }
      });
    });
  }, 0);
}

// ============================================================
// DECK BUILDER
// ============================================================
async function renderDecks(el) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    const decks = await api('/api/decks');
    // Filter: show only custom decks (no event_id)
    const customDecks = decks.filter(function(d) { return !d.event_id; });
    el.innerHTML =
      '<div class="page-header">' +
        '<h2>我的牌组</h2>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-primary" onclick="showCreateDeckModal()">创建牌组</button>' +
          '<button class="btn btn-secondary" onclick="showBatchImportDeckModal()">批量导入</button>' +
        '</div>' +
      '</div>' +
      '<div class="card-grid">' +
        customDecks.map(function(deck) {
          var mainCount = Array.isArray(deck.main_deck) ? deck.main_deck.length : 0;
          var sbCount = Array.isArray(deck.sideboard) ? deck.sideboard.length : 0;
          return '<div class="card-item" onclick="navigate(\'deck-detail\', {id:' + deck.id + '})" style="position:relative">' +
            '<button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();deleteCustomDeck(' + deck.id + ')" title="删除牌组">&times;</button>' +
            '<h3>' + escapeHtml(deck.name) + '</h3>' +
            '<div class="card-meta">' +
              '<span>主牌: ' + mainCount + '张</span>' +
              '<span>备牌: ' + sbCount + '/15张</span>' +
            '</div>' +
            '<div class="text-muted" style="font-size:0.75rem;margin-top:4px">' + new Date(deck.created_at).toLocaleDateString() + '</div>' +
          '</div>';
        }).join('') +
        (customDecks.length === 0 ? '<div class="empty-state"><h3>暂无自定义牌组</h3><p>点击"创建牌组"开始构建你的牌组</p></div>' : '') +
      '</div>';
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

async function showCreateDeckModal() {
  showModal('创建自定义牌组',
    '<form onsubmit="handleCreateDeck(event)">' +
    '<div class="form-group"><label>牌组名称</label><input type="text" id="new-deck-name" required placeholder="输入牌组名称"></div>' +
    '<button type="submit" class="btn btn-primary btn-block">创建</button>' +
    '</form>'
  );
}

async function handleCreateDeck(e) {
  e.preventDefault();
  var name = document.getElementById('new-deck-name').value.trim();
  if (!name) { showToast('请输入牌组名称', 'error'); return; }
  try {
    var deck = await api('/api/decks', { method: 'POST', body: JSON.stringify({ name: name, main_deck: [], sideboard: [] }) });
    closeModal();
    showToast('牌组已创建');
    navigate('deck-detail', { id: deck.id });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCustomDeck(id) {
  if (!confirm('确定要删除这个牌组吗？')) return;
  try {
    await api('/api/decks/' + id, { method: 'DELETE' });
    showToast('牌组已删除');
    navigate('decks');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function showBatchImportDeckModal() {
  showModal('批量导入卡牌',
    '<form onsubmit="handleBatchImportToDeck(event)">' +
    '<div class="form-group"><label>牌组</label>' +
    '<select id="batch-import-deck-select" required></select></div>' +
    '<div class="form-group"><label>卡牌列表 (每行一张, 格式: 数量 卡名)</label>' +
    '<textarea id="batch-import-text" rows="10" style="width:100%;font-family:monospace" placeholder="例如:\n4 Lightning Bolt\n2 Counterspell\n1 Black Lotus"></textarea></div>' +
    '<button type="submit" class="btn btn-primary btn-block">导入</button>' +
    '</form>'
  );
  // Populate deck select
  try {
    var decks = await api('/api/decks');
    var customDecks = decks.filter(function(d) { return !d.event_id; });
    var sel = document.getElementById('batch-import-deck-select');
    customDecks.forEach(function(d) {
      var opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      sel.appendChild(opt);
    });
  } catch (err) {}
}

async function handleBatchImportToDeck(e) {
  e.preventDefault();
  var deckId = parseInt(document.getElementById('batch-import-deck-select').value);
  var text = document.getElementById('batch-import-text').value.trim();
  if (!deckId) { showToast('请选择牌组', 'error'); return; }
  if (!text) { showToast('请输入卡牌列表', 'error'); return; }
  // Parse lines: "4 CardName" or "CardName"
  var lines = text.split('\n').filter(function(l) { return l.trim(); });
  var cardEntries = lines.map(function(line) {
    var match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (match) return { name: match[2].trim(), count: parseInt(match[1]) };
    return { name: line.trim(), count: 1 };
  });
  try {
    closeModal();
    showToast('正在导入 ' + cardEntries.length + ' 种卡牌...');
    var deck = await api('/api/decks/' + deckId);
    var mainDeck = Array.isArray(deck.main_deck) ? deck.main_deck : [];
    var added = 0, failed = 0;
    for (var i = 0; i < cardEntries.length; i++) {
      var entry = cardEntries[i];
      try {
        var res = await api('/api/cards/search?q=' + encodeURIComponent(entry.name));
        if (res.cards && res.cards.length > 0) {
          for (var j = 0; j < entry.count; j++) {
            mainDeck.push(res.cards[0]);
          }
          added += entry.count;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }
    // Save the updated deck
    await api('/api/decks/' + deckId, { method: 'PUT', body: JSON.stringify({ main_deck: mainDeck, sideboard: deck.sideboard }) });
    showToast('导入完成: 成功 ' + added + ' 张, 失败 ' + failed + ' 种');
    navigate('deck-detail', { id: deckId });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================================
// CUSTOM DECK DETAIL VIEW
// ============================================================
var _currentDeckDetail = null;

async function renderDeckDetail(el, deckId) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    var deck = await api('/api/decks/' + deckId);
    if (!deck) { el.innerHTML = '<div class="empty-state"><h3>牌组不存在</h3></div>'; return; }
    _currentDeckDetail = { id: deck.id, name: deck.name, main_deck: deck.main_deck || [], sideboard: deck.sideboard || [], outside_game: deck.outside_game || [] };
    renderDeckDetailUI(el);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

var _deckDetailActiveTab = 'main'; // 'main', 'sideboard', 'outside_game'
var _deckDetailSearchResults = null; // persist search results across re-renders

function renderDeckDetailUI(el) {
  var d = _currentDeckDetail;
  if (!d) return;
  var mainCount = d.main_deck.length;
  var sbCount = d.sideboard.length;
  var ogCount = (d.outside_game || []).length;
  // Basic land counts
  var landCounts = {};
  d.main_deck.forEach(function(c) {
    if (c.type && c.type.indexOf('Basic Land') === 0) {
      var name = c.name || '';
      landCounts[name] = (landCounts[name] || 0) + 1;
    }
  });
  var landParts = [];
  var landNames = { Plains: '平原', Island: '海岛', Swamp: '沼泽', Mountain: '山脉', Forest: '树林' };
  ['Plains','Island','Swamp','Mountain','Forest'].forEach(function(k) {
    if (landCounts[k]) landParts.push((landNames[k] || k) + ':' + landCounts[k]);
  });

  var tabs = [
    { key: 'main', label: '主牌', count: mainCount },
    { key: 'sideboard', label: '备牌', count: sbCount },
    { key: 'outside_game', label: '游戏外', count: ogCount }
  ];

  el.innerHTML =
    '<div class="page-header">' +
      '<button class="btn btn-secondary btn-sm" onclick="navigate(\'decks\')">\u2190 返回</button>' +
      '<h2 style="display:inline;margin-left:12px">' + escapeHtml(d.name) + '</h2>' +
      '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="saveDeckDetail()">保存</button>' +
    '</div>' +
    '<!-- BASIC LANDS -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<span style="font-weight:600;color:var(--text-bright);font-size:0.9rem">添加基本地</span>' +
      '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDetail(\'Plains\')" style="min-width:70px">平原 +1</button>' +
      '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDetail(\'Island\')" style="min-width:70px">海岛 +1</button>' +
      '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDetail(\'Swamp\')" style="min-width:70px">沼泽 +1</button>' +
      '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDetail(\'Mountain\')" style="min-width:70px">山脉 +1</button>' +
      '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDetail(\'Forest\')" style="min-width:70px">树林 +1</button>' +
      '<span class="text-muted" style="font-size:0.8rem;margin-left:auto">' + (landParts.length ? landParts.join('  ') : '') + '</span>' +
    '</div>' +
    '<!-- SEARCH SECTION -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:16px">' +
      '<h3 style="color:var(--text-bright);margin-bottom:12px">搜索卡牌</h3>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
        '<input type="text" id="deck-search-input" placeholder="输入卡牌名称搜索... 左键点击加入当前分组" style="flex:1;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-bright);font-size:0.9rem" onkeydown="if(event.key===\'Enter\')searchDeckCards()">' +
        '<button class="btn btn-secondary btn-sm" onclick="searchDeckCards()">搜索</button>' +
      '</div>' +
      '<div id="deck-search-results"></div>' +
    '</div>' +
    '<!-- BATCH IMPORT -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:16px">' +
      '<h3 style="color:var(--text-bright);margin-bottom:12px">批量导入</h3>' +
      '<textarea id="deck-batch-import-text" rows="4" style="width:100%;font-family:monospace;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-bright);padding:8px" placeholder="每行: 数量 卡名 (如: 4 Lightning Bolt)"></textarea>' +
      '<button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="batchImportToCurrentDeck()">导入到主牌</button>' +
    '</div>' +
    '<!-- TABS -->' +
    '<div style="margin-bottom:8px;display:flex;gap:0;border-bottom:2px solid var(--border)">' +
      tabs.map(function(t) {
        var isActive = _deckDetailActiveTab === t.key;
        return '<button class="deck-tab-btn" data-tab="' + t.key + '" ' +
          'style="padding:10px 20px;background:' + (isActive ? 'var(--bg-card)' : 'transparent') + ';' +
          'color:' + (isActive ? 'var(--accent)' : 'var(--text-muted)') + ';' +
          'border:none;border-bottom:2px solid ' + (isActive ? 'var(--accent)' : 'transparent') + ';' +
          'cursor:pointer;font-weight:600;font-size:0.9rem;transition:all 0.15s;margin-bottom:-2px" ' +
          'onclick="switchDeckTab(\'' + t.key + '\')" ' +
          'onmouseenter="this.style.color=\'var(--accent)\'" ' +
          'onmouseleave="if(\'' + t.key + '\'!==\'' + _deckDetailActiveTab + '\')this.style.color=\'var(--text-muted)\'">' +
          t.label + ' <span style="font-weight:400;opacity:0.7">(' + t.count + ')</span></button>';
      }).join('') +
    '</div>' +
    '<!-- TAB CONTENT -->' +
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius-lg) var(--radius-lg);padding:16px;min-height:200px">' +
      '<div id="deck-tab-cards" class="mtg-cards-grid"></div>' +
    '</div>';

  // Render active tab cards
  renderDeckDetailTabCards();
  // Restore search results if persisted
  if (_deckDetailSearchResults) {
    renderSearchResults(_deckDetailSearchResults);
  }
  // Setup tab drag-and-drop handlers
  setupTabDragHandlers();
}

function setupTabDragHandlers() {
  var tabBtns = document.querySelectorAll('.deck-tab-btn');
  tabBtns.forEach(function(btn) {
    var tabKey = btn.getAttribute('data-tab');
    btn.addEventListener('dragover', function(e) {
      e.preventDefault();
      btn.style.borderBottomColor = 'var(--accent)';
      btn.style.color = 'var(--accent)';
    });
    btn.addEventListener('dragleave', function() {
      if (tabKey !== _deckDetailActiveTab) {
        btn.style.borderBottomColor = 'transparent';
        btn.style.color = 'var(--text-muted)';
      }
    });
    btn.addEventListener('drop', function(e) {
      e.preventDefault();
      btn.style.borderBottomColor = tabKey === _deckDetailActiveTab ? 'var(--accent)' : 'transparent';
      btn.style.color = tabKey === _deckDetailActiveTab ? 'var(--accent)' : 'var(--text-muted)';
      var raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      try {
        var data = JSON.parse(raw);
        handleDeckDetailDrop(data, tabKey);
      } catch(err) {}
    });
  });
}

function switchDeckTab(tab) {
  _deckDetailActiveTab = tab;
  renderDeckDetailUI(document.getElementById('content'));
}

function renderDeckDetailTabCards() {
  var container = document.getElementById('deck-tab-cards');
  if (!container) return;
  container.innerHTML = '';
  var zone = _deckDetailActiveTab;
  var cards = zone === 'main' ? _currentDeckDetail.main_deck : zone === 'sideboard' ? _currentDeckDetail.sideboard : (_currentDeckDetail.outside_game || []);

  // Make container a drop target
  container.addEventListener('dragover', function(e) {
    e.preventDefault();
    container.classList.add('drop-active');
  });
  container.addEventListener('dragleave', function(e) {
    if (!container.contains(e.relatedTarget)) container.classList.remove('drop-active');
  });
  container.addEventListener('drop', function(e) {
    e.preventDefault();
    container.classList.remove('drop-active');
    var raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      var data = JSON.parse(raw);
      handleDeckDetailDrop(data, zone);
    } catch(err) {}
  });

  if (cards.length === 0) {
    container.innerHTML = '<div class="text-muted" style="padding:24px;text-align:center">拖拽或点击添加卡牌</div>';
    return;
  }

  // Group by name
  var piles = groupCardsByName(cards);
  var grid = document.createElement('div');
  grid.className = 'mtg-cards-grid';
  grid.style.gap = '12px';

  piles.forEach(function(pile) {
    var pileEl = document.createElement('div');
    pileEl.className = 'deck-card-pile';
    pileEl.style.position = 'relative';
    pileEl.style.width = '120px';
    pileEl.style.height = (168 + Math.min(pile.cards.length - 1, 5) * 3) + 'px';

    pile.cards.forEach(function(card, idx) {
      var origIdx = cards.indexOf(card);
      var el = createCardElement(card, null);
      el.style.width = '120px';
      el.style.fontSize = '0.7rem';
      el.style.position = 'absolute';
      el.style.top = Math.min(idx * 3, 15) + 'px';
      el.style.left = Math.min(idx * 3, 15) + 'px';
      el.style.zIndex = idx;
      el.setAttribute('draggable', 'true');

      el.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'zone', zone: zone, idx: origIdx, card: card }));
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', function() {
        el.classList.remove('dragging');
      });

      // Hover preview
      el.addEventListener('mouseenter', function(e) { showCardPreview(card); moveCardPreview(e); });
      el.addEventListener('mousemove', moveCardPreview);
      el.addEventListener('mouseleave', hideCardPreview);

      // Remove button
      var removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-sm';
      removeBtn.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(231,76,60,0.8);color:white;border:none;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:0.7rem;cursor:pointer;z-index:5;opacity:0;transition:opacity 0.15s';
      removeBtn.textContent = '\u00d7';
      removeBtn.onclick = function(e) { e.stopPropagation(); removeDeckCard(zone, origIdx); };

      el.appendChild(removeBtn);
      el.onmouseenter = function() { removeBtn.style.opacity = '1'; };
      el.onmouseleave = function() { removeBtn.style.opacity = '0'; };
      pileEl.appendChild(el);
    });

    // Pile count label
    if (pile.cards.length > 1) {
      var label = document.createElement('div');
      label.className = 'deck-pile-count';
      label.textContent = 'x' + pile.cards.length;
      pileEl.appendChild(label);
    }

    grid.appendChild(pileEl);
  });

  container.appendChild(grid);
}

// Handle drop between zones in deck detail page
function handleDeckDetailDrop(data, toZone) {
  if (!_currentDeckDetail) return;

  if (data.source === 'search') {
    // 4-copy limit for non-basic-land cards
    if (!isBasicLand(data.card)) {
      var tgtArr = toZone === 'main' ? _currentDeckDetail.main_deck : toZone === 'sideboard' ? _currentDeckDetail.sideboard : (_currentDeckDetail.outside_game || []);
      var curCount = countCardCopies(tgtArr, data.card.name);
      if (curCount >= 4) {
        showToast(data.card.name + ' 已有 ' + curCount + ' 张，最多只能添加 4 张', 'error');
        return;
      }
    }
    var newCard = Object.assign({}, data.card);
    newCard.id = newCard.id + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    if (toZone === 'main') {
      _currentDeckDetail.main_deck.push(newCard);
    } else if (toZone === 'sideboard') {
      if (_currentDeckDetail.sideboard.length >= 15) { showToast('备牌上限为15张', 'error'); return; }
      _currentDeckDetail.sideboard.push(newCard);
    } else if (toZone === 'outside_game') {
      _currentDeckDetail.outside_game.push(newCard);
    }
    showToast('已添加 ' + (data.card.name || '卡牌') + ' 到' + (toZone === 'main' ? '主牌' : toZone === 'sideboard' ? '备牌' : '游戏外'));
    _deckDetailActiveTab = toZone;
    renderDeckDetailUI(document.getElementById('content'));
    return;
  }

  if (data.source === 'zone') {
    var fromZone = data.zone;
    if (fromZone === toZone) return;
    var srcArr = fromZone === 'main' ? _currentDeckDetail.main_deck : fromZone === 'sideboard' ? _currentDeckDetail.sideboard : _currentDeckDetail.outside_game;
    var tgtArr = toZone === 'main' ? _currentDeckDetail.main_deck : toZone === 'sideboard' ? _currentDeckDetail.sideboard : _currentDeckDetail.outside_game;
    if (toZone === 'sideboard' && tgtArr.length >= 15) { showToast('备牌上限为15张', 'error'); return; }
    // 4-copy limit check when moving between zones
    var movedCard = srcArr[data.idx];
    if (movedCard && !isBasicLand(movedCard)) {
      var tgtCount = countCardCopies(tgtArr, movedCard.name);
      if (tgtCount >= 4) {
        showToast(movedCard.name + ' 在目标分组已有 ' + tgtCount + ' 张，最多只能 4 张', 'error');
        return;
      }
    }
    var card = srcArr.splice(data.idx, 1)[0];
    if (card) tgtArr.push(card);
    _deckDetailActiveTab = toZone;
    renderDeckDetailUI(document.getElementById('content'));
  }
}

function removeDeckCard(zone, idx) {
  if (!_currentDeckDetail) return;
  if (zone === 'main') {
    _currentDeckDetail.main_deck.splice(idx, 1);
  } else if (zone === 'sideboard') {
    _currentDeckDetail.sideboard.splice(idx, 1);
  } else if (zone === 'outside_game') {
    if (!_currentDeckDetail.outside_game) _currentDeckDetail.outside_game = [];
    _currentDeckDetail.outside_game.splice(idx, 1);
  }
  renderDeckDetailUI(document.getElementById('content'));
}

function moveDeckCard(fromZone, idx) {
  if (!_currentDeckDetail) return;
  if (fromZone === 'main') {
    if (_currentDeckDetail.sideboard.length >= 15) {
      showToast('备牌上限为15张', 'error');
      return;
    }
    var card = _currentDeckDetail.main_deck.splice(idx, 1)[0];
    _currentDeckDetail.sideboard.push(card);
  } else {
    var card = _currentDeckDetail.sideboard.splice(idx, 1)[0];
    _currentDeckDetail.main_deck.push(card);
  }
  renderDeckDetailUI(document.getElementById('content'));
}

async function searchDeckCards() {
  var input = document.getElementById('deck-search-input');
  var q = input.value.trim();
  if (q.length < 2) { showToast('请输入至少2个字符', 'error'); return; }
  var resultsEl = document.getElementById('deck-search-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '<div class="text-muted" style="padding:16px;text-align:center">搜索中...</div>';
  try {
    var res = await api('/api/cards/search?q=' + encodeURIComponent(q));
    var cards = res.cards || [];
    if (cards.length === 0) {
      _deckDetailSearchResults = null;
      resultsEl.innerHTML = '<div class="text-muted" style="padding:16px;text-align:center">未找到卡牌</div>';
      return;
    }
    _deckDetailSearchResults = cards;
    renderSearchResults(cards);
  } catch (err) {
    _deckDetailSearchResults = null;
    resultsEl.innerHTML = '<div class="text-muted" style="padding:16px;text-align:center">搜索失败: ' + escapeHtml(err.message) + '</div>';
  }
}

function renderSearchResults(cards) {
  var resultsEl = document.getElementById('deck-search-results');
  if (!resultsEl) return;
  var tabLabels = { main: '主牌', sideboard: '备牌', outside_game: '游戏外' };
  resultsEl.innerHTML =
    '<p class="text-muted" style="font-size:0.8rem;margin-bottom:8px">左键点击加入「' + tabLabels[_deckDetailActiveTab] + '」，拖拽到分组标题加入对应分组</p>' +
    '<div class="mtg-cards-grid" id="deck-search-grid"></div>';
  var grid = document.getElementById('deck-search-grid');
  cards.forEach(function(card) {
    var el = createCardElement(card, null);
    el.style.position = 'relative';
    el.style.cursor = 'pointer';
    el.setAttribute('draggable', 'true');

    // Drag from search results
    el.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'search', card: card }));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', function() {
      el.classList.remove('dragging');
    });

    // Hover preview
    el.addEventListener('mouseenter', function(e) { showCardPreview(card); moveCardPreview(e); });
    el.addEventListener('mousemove', moveCardPreview);
    el.addEventListener('mouseleave', hideCardPreview);

    // Left-click to add to active tab
    el.onclick = function(e) {
      e.stopPropagation();
      addCardToDeck(card, _deckDetailActiveTab);
    };

    grid.appendChild(el);
  });
}

// Check if a card is a basic land
function isBasicLand(card) {
  return card.type && card.type.indexOf('Basic Land') !== -1;
}

// Count copies of a card by name in an array (non-basic-land only)
function countCardCopies(arr, cardName) {
  var count = 0;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].name === cardName) count++;
  }
  return count;
}

function addCardToDeck(card, zone) {
  if (!_currentDeckDetail) return;
  // 4-copy limit for non-basic-land cards
  if (!isBasicLand(card)) {
    var targetArr = zone === 'main' ? _currentDeckDetail.main_deck : zone === 'sideboard' ? _currentDeckDetail.sideboard : (_currentDeckDetail.outside_game || []);
    var curCount = countCardCopies(targetArr, card.name);
    if (curCount >= 4) {
      showToast(card.name + ' 已有 ' + curCount + ' 张，最多只能添加 4 张', 'error');
      return;
    }
  }
  var newCard = Object.assign({}, card);
  newCard.id = newCard.id + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  if (zone === 'sideboard') {
    if (_currentDeckDetail.sideboard.length >= 15) {
      showToast('备牌上限为15张', 'error');
      return;
    }
    _currentDeckDetail.sideboard.push(newCard);
  } else if (zone === 'outside_game') {
    if (!_currentDeckDetail.outside_game) _currentDeckDetail.outside_game = [];
    _currentDeckDetail.outside_game.push(newCard);
  } else {
    _currentDeckDetail.main_deck.push(newCard);
  }
  showToast('已添加 ' + card.name + ' 到' + (zone === 'main' ? '主牌' : zone === 'sideboard' ? '备牌' : '游戏外'));
  // Re-render tabs and card area, but preserve search results
  renderDeckDetailUI(document.getElementById('content'));
}

// Parse a deck list line into { count, name, set }
function parseDeckLine(line) {
  line = line.trim();
  if (!line) return null;
  // Match: COUNT CARDNAME (SET) NUMBER  or  COUNT CARDNAME
  // Examples:
  //   "1 Toph, the First Metalbender (TLA) 247"
  //   "14 Forest (KLD) 262"
  //   "1 Brass's Tunnel-Grinder / Tecutlan, the Searing Rift (LCI) 373"
  //   "1 Abrade (PLST) 2XM-114"
  //   "1 Fomori Vault (PBIG) 29p"
  var m = line.match(/^(\d+)\s+(.+?)(?:\s+\(([^)]+)\)\s+\S+)?$/);
  if (!m) {
    // Fallback: treat entire line as card name with count 1
    return { count: 1, name: line, set: null };
  }
  var count = parseInt(m[1]);
  var fullName = m[2].trim();
  var set = m[3] ? m[3].toLowerCase() : null;
  // For DFC cards "Front / Back", use only front face name for search
  var slashIdx = fullName.indexOf(' / ');
  if (slashIdx !== -1) {
    fullName = fullName.substring(0, slashIdx).trim();
  }
  return { count: count, name: fullName, set: set };
}

async function batchImportToCurrentDeck() {
  if (!_currentDeckDetail) return;
  var text = document.getElementById('deck-batch-import-text').value.trim();
  if (!text) { showToast('请输入卡牌列表', 'error'); return; }
  var lines = text.split('\n').filter(function(l) { return l.trim(); });
  var cardEntries = lines.map(parseDeckLine).filter(Boolean);
  if (cardEntries.length === 0) { showToast('没有解析到任何卡牌', 'error'); return; }

  // Show progress bar
  var btn = document.querySelector('[onclick="batchImportToCurrentDeck()"]');
  if (btn) {
    btn.disabled = true;
    btn.insertAdjacentHTML('afterend',
      '<div id="deck-import-progress" style="margin-top:8px">' +
      '<div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden;margin-bottom:4px">' +
      '<div id="deck-progress-bar" style="background:var(--accent);height:100%;width:0%;transition:width 0.2s"></div></div>' +
      '<div id="deck-progress-text" class="text-muted" style="font-size:0.8rem;text-align:center">准备中...</div></div>');
  }

  var added = 0, skipped4 = 0, allFailed = [];
  var BATCH_SIZE = 10;

  for (var i = 0; i < cardEntries.length; i += BATCH_SIZE) {
    var chunk = cardEntries.slice(i, i + BATCH_SIZE);
    var pct = Math.round(((i + chunk.length) / cardEntries.length) * 100);
    var bar = document.getElementById('deck-progress-bar');
    var txt = document.getElementById('deck-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = '导入中... ' + Math.min(i + chunk.length, cardEntries.length) + '/' + cardEntries.length + ' (' + pct + '%)';

    // Build unique names for this chunk
    var names = [];
    for (var j = 0; j < chunk.length; j++) {
      if (names.indexOf(chunk[j].name) === -1) names.push(chunk[j].name);
    }

    try {
      var res = await api('/api/cards/batch-search', {
        method: 'POST',
        body: JSON.stringify({ names: names })
      });
      var cardMap = {};
      for (var k = 0; k < (res.cards || []).length; k++) {
        cardMap[res.cards[k].name.toLowerCase()] = res.cards[k];
      }
      if (res.failed && res.failed.length > 0) {
        allFailed = allFailed.concat(res.failed);
      }
      for (var j = 0; j < chunk.length; j++) {
        var entry = chunk[j];
        var card = cardMap[entry.name.toLowerCase()];
        if (!card) continue;
        for (var n = 0; n < entry.count; n++) {
          if (!isBasicLand(card)) {
            var curCount = countCardCopies(_currentDeckDetail.main_deck, card.name);
            if (curCount >= 4) { skipped4++; continue; }
          }
          var newCard = Object.assign({}, card);
          newCard.id = newCard.id + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4) + '_' + n;
          _currentDeckDetail.main_deck.push(newCard);
          added++;
        }
      }
    } catch (err) {
      allFailed = allFailed.concat(names);
    }
  }

  // Show failed cards in dedicated area
  var oldFailed = document.getElementById('deck-import-failed');
  if (oldFailed) oldFailed.remove();
  if (allFailed.length > 0) {
    var failedHtml = '<div id="deck-import-failed" style="margin-top:12px;padding:12px;background:rgba(255,80,80,0.1);border:1px solid rgba(255,80,80,0.3);border-radius:8px">' +
      '<div style="font-weight:600;color:#ff6b6b;margin-bottom:6px">未找到 ' + allFailed.length + ' 张卡牌:</div>' +
      '<div style="font-size:0.85rem;color:var(--text-muted);max-height:120px;overflow-y:auto">';
    for (var i = 0; i < allFailed.length; i++) {
      failedHtml += '<span style="display:inline-block;background:rgba(255,80,80,0.15);padding:2px 8px;border-radius:4px;margin:2px">' + escapeHtml(allFailed[i]) + '</span>';
    }
    failedHtml += '</div></div>';
    var progParent = document.getElementById('deck-import-progress');
    if (progParent && progParent.parentNode) {
      progParent.parentNode.insertAdjacentHTML('afterend', failedHtml);
    }
  }

  var msg = '导入完成: 成功 ' + added + ' 张';
  if (skipped4 > 0) msg += ', 跳过 ' + skipped4 + ' 张(超过4张上限)';
  if (allFailed.length > 0) msg += ', 失败 ' + allFailed.length + ' 种';
  showToast(msg);
  // Remove progress bar and re-enable button
  var prog = document.getElementById('deck-import-progress');
  if (prog) prog.remove();
  if (btn) btn.disabled = false;
  renderDeckDetailUI(document.getElementById('content'));
}

async function saveDeckDetail() {
  if (!_currentDeckDetail) return;
  try {
    await api('/api/decks/' + _currentDeckDetail.id, {
      method: 'PUT',
      body: JSON.stringify({
        name: _currentDeckDetail.name,
        main_deck: _currentDeckDetail.main_deck,
        sideboard: _currentDeckDetail.sideboard,
        outside_game: _currentDeckDetail.outside_game || []
      })
    });
    showToast('牌组已保存');
    navigate('decks');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function renderDeckBuilder(el, params) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  let pool = [], existingDeck = null, eventId = null;
  let battleId = null, betweenGames = false;

  try {
    // Between-games mode: load deck from battle record
    if (params.battleId && params.betweenGames) {
      battleId = params.battleId;
      betweenGames = true;
      const battleDeck = await api(`/api/battles/${battleId}/my-deck`);
      pool = battleDeck.sideboard || [];
      existingDeck = { main_deck: battleDeck.main_deck || [], name: battleDeck.name || '', sideboard: pool };
    }

    if (params.deckId) {
      existingDeck = await api(`/api/decks/${params.deckId}`);
      pool = existingDeck.sideboard || existingDeck.pool || [];
    }
    if (params.eventId) {
      eventId = params.eventId;
      try {
        const poolRes = await api(`/api/events/${eventId}/pool`);
        pool = poolRes.pool || [];
      } catch (err) {
        // If pool endpoint fails, try from event participation
        const event = await api(`/api/events/${eventId}`);
        if (event.my_participation && event.my_participation.pool) {
          pool = event.my_participation.pool;
        }
      }
    }

    const mainDeck = existingDeck ? (existingDeck.main_deck || []) : [];
    const deckName = existingDeck ? existingDeck.name : '';
    const outsideGame = existingDeck ? (existingDeck.outside_game || []) : [];

    // When editing an existing deck with event pool, remove cards already in mainDeck and outsideGame
    if (existingDeck && params.eventId) {
      var usedIds = new Set([...mainDeck.map(c => c.id), ...outsideGame.map(c => c.id)]);
      pool = pool.filter(c => !usedIds.has(c.id));
    }

    // Store state for click handlers (no sideboard in limited format)
    state.pageData._deckState = { pool: [...pool], mainDeck: [...mainDeck], outsideGame: [...outsideGame] };

    // Determine back button target and save button
    var backTarget = betweenGames ? 'battle' : (eventId ? 'event-detail' : 'decks');
    var backOnclick = betweenGames
      ? `window.open('/battle.html?id=${battleId}', '_self')`
      : `navigate('${backTarget}', ${eventId ? `{id:${eventId}}` : '{}'})`;
    var saveOnclick = betweenGames
      ? `saveDeckBetweenGames(${battleId})`
      : `saveDeck(${existingDeck ? existingDeck.id : 'null'}, ${eventId || 'null'})`;
    var title = betweenGames ? '调整牌组 (局间)' : (existingDeck ? '编辑牌组' : '构建牌组');

    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="${backOnclick}">← 返回</button>
          <h2>${title}</h2>
        </div>
        <div class="flex gap-8" style="align-items:center">
          <input type="text" id="deck-name" value="${deckName}" placeholder="牌组名称" style="width:180px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-bright)">
          <button class="btn btn-primary" onclick="${saveOnclick}">${betweenGames ? '保存并开始下一局' : '保存'}</button>
        </div>
      </div>

      <!-- Basic Lands -->
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="font-weight:600;color:var(--text-bright);font-size:0.9rem">添加基本地</span>
        <button class="btn btn-secondary btn-sm" onclick="addBasicLand('Plains')" style="min-width:70px">平原 +1</button>
        <button class="btn btn-secondary btn-sm" onclick="addBasicLand('Island')" style="min-width:70px">海岛 +1</button>
        <button class="btn btn-secondary btn-sm" onclick="addBasicLand('Swamp')" style="min-width:70px">沼泽 +1</button>
        <button class="btn btn-secondary btn-sm" onclick="addBasicLand('Mountain')" style="min-width:70px">山脉 +1</button>
        <button class="btn btn-secondary btn-sm" onclick="addBasicLand('Forest')" style="min-width:70px">树林 +1</button>
        <span id="basic-land-counts" class="text-muted" style="font-size:0.8rem;margin-left:auto"></span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <h3 style="color:var(--text-bright);margin-bottom:8px">
            牌池 <span id="pool-count" class="text-muted" style="font-size:0.85rem">(${state.pageData._deckState.pool.length})</span>
          </h3>
          <p class="text-muted" style="font-size:0.8rem;margin-bottom:8px">点击或拖动卡牌到主牌组</p>
          <div id="deck-pool" class="deck-builder-zone deck-cards-sm"></div>
        </div>
        <div>
          <h3 style="color:var(--text-bright);margin-bottom:8px">
            主牌组 <span id="main-count" class="text-muted" style="font-size:0.85rem">(${state.pageData._deckState.mainDeck.length})</span>
          </h3>
          <p class="text-muted" style="font-size:0.8rem;margin-bottom:8px">点击基本地移除，其他卡牌返回牌池，拖动可调整位置</p>
          <div id="deck-main" class="deck-builder-zone deck-cards-sm"></div>
        </div>
      </div>
      <!-- OUTSIDE GAME -->
      <div style="margin-top:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px">
        <h3 style="color:var(--text-bright);margin-bottom:8px">
          游戏外 <span id="outside-count" class="text-muted" style="font-size:0.85rem">(${state.pageData._deckState.outsideGame.length})</span>
        </h3>
        <p class="text-muted" style="font-size:0.8rem;margin-bottom:8px">对战开始时正面朝上放置在游戏外区域。从牌池拖动卡牌到此处。</p>
        <div id="deck-outside" class="deck-builder-zone deck-cards-sm"></div>
      </div>
    `;

    renderDeckBuilderCards();
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

function renderDeckBuilderCards() {
  const ds = state.pageData._deckState;
  if (!ds) return;

  // Ensure outsideGame exists
  if (!ds.outsideGame) ds.outsideGame = [];

  renderDeckZone('deck-pool', ds.pool, (card, e) => {
    ds.pool = ds.pool.filter(c => c.id !== card.id);
    ds.mainDeck.push(card);
    renderDeckBuilderCards();
  });

  renderDeckZone('deck-main', ds.mainDeck, function(card, e) {
    ds.mainDeck = ds.mainDeck.filter(function(c) { return c.id !== card.id; });
    if (!(card.type && card.type.indexOf('Basic Land') === 0)) {
      ds.pool.push(card);
    }
    renderDeckBuilderCards();
  });

  // Outside game zone - cards can be dragged from pool or main deck
  renderDeckZone('deck-outside', ds.outsideGame, function(card, e) {
    // Click to remove from outside_game and return to pool
    ds.outsideGame = ds.outsideGame.filter(function(c) { return c.id !== card.id; });
    if (!(card.type && card.type.indexOf('Basic Land') === 0)) {
      ds.pool.push(card);
    }
    renderDeckBuilderCards();
  });

  // Update counts
  const poolCount = document.getElementById('pool-count');
  const mainCount = document.getElementById('main-count');
  const outsideCount = document.getElementById('outside-count');
  if (poolCount) poolCount.textContent = `(${ds.pool.length})`;
  if (mainCount) mainCount.textContent = `(${ds.mainDeck.length})`;
  if (outsideCount) outsideCount.textContent = `(${ds.outsideGame.length})`;

  // Update basic land counts
  const landCountsEl = document.getElementById('basic-land-counts');
  if (landCountsEl) {
    const counts = {};
    ds.mainDeck.forEach(function(c) {
      if (c.type && c.type.indexOf('Basic Land') === 0) {
        var name = c.name || '';
        counts[name] = (counts[name] || 0) + 1;
      }
    });
    const parts = [];
    const landNames = { Plains: '平原', Island: '海岛', Swamp: '沼泽', Mountain: '山脉', Forest: '树林' };
    ['Plains','Island','Swamp','Mountain','Forest'].forEach(function(k) {
      if (counts[k]) parts.push((landNames[k] || k) + ':' + counts[k]);
    });
    landCountsEl.textContent = parts.length ? parts.join('  ') : '';
  }
}

// Calculate CMC from mana cost string like "{2}{W}{U}"
function getCardCMC(card) {
  if (card.cmc != null) return parseInt(card.cmc) || 0;
  if (!card.manaCost) return 0;
  var cost = card.manaCost.toString();
  var cmc = 0;
  var matches = cost.match(/\{[^}]+\}/g);
  if (matches) {
    matches.forEach(function(m) {
      var sym = m.replace(/[{}]/g, '');
      if (sym === 'X' || sym === 'Y' || sym === 'Z') return;
      var n = parseInt(sym);
      if (!isNaN(n)) cmc += n;
      else if (sym === 'W' || sym === 'U' || sym === 'B' || sym === 'R' || sym === 'G' || sym === 'C') cmc += 1;
      else if (sym.indexOf('/') !== -1) cmc += 1; // hybrid
      else cmc += 1;
    });
  }
  return cmc;
}

function isLandCard(card) {
  return card.type && card.type.indexOf('Land') !== -1;
}

// Group cards by name for pile rendering, sorted by CMC with lands at bottom
function groupCardsByName(cards) {
  var groups = {};
  var order = [];
  cards.forEach(function(card) {
    var key = card.name || card.id;
    if (!groups[key]) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(card);
  });
  // Sort piles: non-lands by CMC then name, lands at bottom by name
  var piles = order.map(function(key) { return { name: key, cards: groups[key] }; });
  piles.sort(function(a, b) {
    var aCard = a.cards[0], bCard = b.cards[0];
    var aLand = isLandCard(aCard), bLand = isLandCard(bCard);
    if (aLand !== bLand) return aLand ? 1 : -1;
    if (!aLand && !bLand) {
      var aCMC = getCardCMC(aCard), bCMC = getCardCMC(bCard);
      if (aCMC !== bCMC) return aCMC - bCMC;
    }
    return a.name.localeCompare(b.name);
  });
  return piles;
}

function renderDeckZone(containerId, cards, onClick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  // Make container a drop target
  container.addEventListener('dragover', function(e) {
    e.preventDefault();
    container.classList.add('drop-active');
  });
  container.addEventListener('dragleave', function(e) {
    if (!container.contains(e.relatedTarget)) container.classList.remove('drop-active');
  });
  container.addEventListener('drop', function(e) {
    e.preventDefault();
    container.classList.remove('drop-active');
    var data = null;
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch(err) {}
    if (!data || !data.cardId || !data.fromZone) return;
    handleDeckDrop(data, containerId);
  });

  // Group identical cards into piles
  var piles = groupCardsByName(cards);
  var grid = document.createElement('div');
  grid.className = 'mtg-cards-grid';
  grid.style.gap = '12px';

  piles.forEach(function(pile) {
    var pileEl = document.createElement('div');
    pileEl.className = 'deck-card-pile';
    pileEl.style.position = 'relative';
    pileEl.style.width = '120px';
    pileEl.style.height = '183px'; // 168px card + 15px max offset

    pile.cards.forEach(function(card, idx) {
      var el = createCardElement(card, function(c) { onClick(c, event); });
      el.style.width = '120px';
      el.style.fontSize = '0.7rem';
      el.style.position = 'absolute';
      el.style.top = Math.min(idx * 3, 15) + 'px';
      el.style.left = Math.min(idx * 3, 15) + 'px';
      el.style.zIndex = idx;
      el.setAttribute('draggable', 'true');

      el.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ cardId: card.id, fromZone: containerId }));
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', function() {
        el.classList.remove('dragging');
      });
      // Hover preview
      el.addEventListener('mouseenter', function(e) {
        showCardPreview(card);
        moveCardPreview(e);
      });
      el.addEventListener('mousemove', moveCardPreview);
      el.addEventListener('mouseleave', hideCardPreview);

      pileEl.appendChild(el);
    });

    // Pile count label
    if (pile.cards.length > 1) {
      var label = document.createElement('div');
      label.className = 'deck-pile-count';
      label.textContent = 'x' + pile.cards.length;
      pileEl.appendChild(label);
    }

    grid.appendChild(pileEl);
  });

  container.appendChild(grid);
}

// Handle card drop between deck zones
function handleDeckDrop(data, toZoneId) {
  var ds = state.pageData._deckState;
  if (!ds) return;
  var fromZone = data.fromZone;
  var cardId = data.cardId;
  if (fromZone === toZoneId) return;

  var sourceArr = fromZone === 'deck-pool' ? ds.pool : ds.mainDeck;
  var targetArr = toZoneId === 'deck-pool' ? ds.pool : ds.mainDeck;

  var idx = sourceArr.findIndex(function(c) { return c.id === cardId; });
  if (idx === -1) return;
  var card = sourceArr.splice(idx, 1)[0];
  // Basic lands dragged to pool are discarded, not returned to pool
  if (toZoneId === 'deck-pool' && card.type && card.type.indexOf('Basic Land') === 0) {
    // discard
  } else {
    targetArr.push(card);
  }
  renderDeckBuilderCards();
}

// Add basic land to main deck
var BASIC_LANDS = {
  Plains:  { name: 'Plains',  type: 'Basic Land — Plains',  image_small: '/images/tokens/plains.jpg',  colors: ['W'] },
  Island:  { name: 'Island',  type: 'Basic Land — Island',  image_small: '/images/tokens/island.jpg',  colors: ['U'] },
  Swamp:   { name: 'Swamp',   type: 'Basic Land — Swamp',   image_small: '/images/tokens/swamp.jpg',   colors: ['B'] },
  Mountain:{ name: 'Mountain',type: 'Basic Land — Mountain', image_small: '/images/tokens/mountain.jpg',colors: ['R'] },
  Forest:  { name: 'Forest',  type: 'Basic Land — Forest',  image_small: '/images/tokens/forest.jpg',  colors: ['G'] }
};

function addBasicLand(landType) {
  var ds = state.pageData._deckState;
  if (!ds) return;
  var land = Object.assign({}, BASIC_LANDS[landType], {
    id: 'basic_' + landType.toLowerCase() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  });
  ds.mainDeck.push(land);
  renderDeckBuilderCards();
}

function addBasicLandToDetail(landType) {
  if (!_currentDeckDetail) return;
  var land = Object.assign({}, BASIC_LANDS[landType], {
    id: 'basic_' + landType.toLowerCase() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  });
  _currentDeckDetail.main_deck.push(land);
  renderDeckDetailUI(document.getElementById('content'));
}

async function saveDeck(deckId, eventId) {
  const ds = state.pageData._deckState;
  if (!ds) return;

  const name = document.getElementById('deck-name')?.value.trim() || '未命名牌组';
  const body = { name, main_deck: ds.mainDeck, sideboard: ds.pool, outside_game: ds.outsideGame || [] };

  try {
    if (deckId) {
      await api(`/api/decks/${deckId}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    } else {
      if (eventId) body.event_id = eventId;
      await api('/api/decks', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    }
    showToast('牌组已保存');
    if (eventId) {
      navigate('event-detail', { id: eventId });
    } else {
      navigate('dashboard');
    }
  } catch (err) { showToast(err.message, 'error'); }
}

async function saveDeckBetweenGames(battleId) {
  const ds = state.pageData._deckState;
  if (!ds) return;
  const name = document.getElementById('deck-name')?.value.trim() || '未命名牌组';
  const updatedDeck = { name: name, main_deck: ds.mainDeck, sideboard: ds.pool, outside_game: ds.outsideGame || [] };
  try {
    await api('/api/battles/' + battleId + '/next-game', {
      method: 'POST',
      body: JSON.stringify({ updated_deck: updatedDeck })
    });
    showToast('牌组已更新，下一局开始！');
    window.open('/battle.html?id=' + battleId, '_self');
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteDeck(id) {
  if (!confirm('确定要删除这个牌组吗？')) return;
  try {
    await api(`/api/decks/${id}`, { method: 'DELETE' });
    showToast('牌组已删除');
    navigate('events');
  } catch (err) { showToast(err.message, 'error'); }
}

// ============================================================
// BATTLES (MTGA-style)
// ============================================================
let currentBattleId = null;
let battleLocalUI = {
  battleId: null,
  selectedAttackers: new Set(),
  blockerAssignments: {},
  lastPhaseKey: null,
  gs: null,
  myKey: null,
  oppKey: null,
  autoPass: false
};

// WS handler for real-time updates
if (typeof WS === 'undefined') {
  console.warn('[battle] WS not loaded');
} else if (!window._mtgaBattleWsRegistered) {
  window._mtgaBattleWsRegistered = true;
  WS.on('battle_updated', async (data) => {
    const battleId = data && data.battleId;
    if (!battleId || currentBattleId !== battleId) return;
    if (state.currentPage !== 'battle-detail' || String(state.pageData?.id) !== String(battleId)) {
      WS.unsubscribe('battle:' + battleId);
      currentBattleId = null;
      return;
    }
    const el = document.getElementById('content');
    if (!el) return;
    try {
      const battle = await api('/api/battles/' + battleId);
      if (battle.status === 'completed') { renderBattleCompleted(el, battle, battleId); return; }
      if (!battle.game_state || !battle.game_state.players) { renderBattleLobby(el, battle, battleId); return; }
      const myKey = String(battle.player1_id) === String(state.user?.id) ? 'p1' : 'p2';
      const oppKey = myKey === 'p1' ? 'p2' : 'p1';
      renderBattleBoard(el, battle, battleId, myKey, oppKey);
    } catch (err) { console.error('Battle WS refresh error:', err); }
  });
}

async function renderBattles(el) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    const battles = await api('/api/battles');
    el.innerHTML = `
      <div class="page-header">
        <h2>对战</h2>
        <button class="btn btn-primary" onclick="showCreateBattleModal()">创建对战</button>
      </div>
      <div class="card-grid">
        ${battles.map(b => `
          <div class="card-item" onclick="navigate('battle-detail', {id:${b.id}})">
            <h3>${b.name || '对战 #' + b.id}</h3>
            <span class="badge badge-${b.status === 'waiting' ? 'waiting' : b.status === 'in_progress' ? 'progress' : 'completed'}">
              ${b.status === 'waiting' ? '等待中' : b.status === 'in_progress' ? '进行中' : '已完成'}
            </span>
            <div class="card-meta">
              <span>${b.player1_name || '等待中'}</span>
              <span>vs</span>
              <span>${b.player2_name || '等待中'}</span>
            </div>
            ${b.winner_id ? `<div class="text-muted" style="font-size:0.8rem;margin-top:4px">胜者: ${b.winner_id === b.player1_id ? b.player1_name : b.player2_name}</div>` : ''}
          </div>
        `).join('') || '<div class="empty-state"><h3>暂无对战</h3><p>点击"创建对战"开始</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

async function showCreateBattleModal() {
  try {
    const decks = await api('/api/decks');
    if (decks.length === 0) { showToast('请先创建一个牌组', 'error'); return; }
    showModal('创建对战', `
      <form onsubmit="handleCreateBattle(event)">
        <div class="form-group"><label>对战名称</label><input type="text" id="battle-name" placeholder="我的对战" value="${state.user?.username || ''}的对战"></div>
        <div class="form-group">
          <label>选择牌组</label>
          <select id="battle-deck" required>
            ${decks.map(d => `<option value="${d.id}">${d.name} (${Array.isArray(d.main_deck) ? d.main_deck.length : 0}张)</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-block">创建</button>
      </form>
    `);
  } catch (err) { showToast(err.message, 'error'); }
}

async function handleCreateBattle(e) {
  e.preventDefault();
  const name = document.getElementById('battle-name').value.trim();
  const deck_id = parseInt(document.getElementById('battle-deck').value);
  if (!deck_id) { showToast('请选择一个牌组', 'error'); return; }
  try {
    const battle = await api('/api/battles', { method: 'POST', body: JSON.stringify({ deck_id, name }) });
    closeModal();
    showToast('对战已创建，等待对手加入');
    window.open(`/battle.html?id=${battle.id}`, '_blank');
  } catch (err) { showToast(err.message, 'error'); }
}

async function renderBattleDetail(el, id) {
  el.innerHTML = '<div class="text-center text-muted" style="padding:48px"><div class="loading"></div><div style="margin-top:12px">加载对战...</div></div>';
  if (currentBattleId && currentBattleId !== id) { WS.unsubscribe('battle:' + currentBattleId); }
  currentBattleId = id;
  WS.subscribe('battle:' + id);
  if (!battleLocalUI || battleLocalUI.battleId !== id) {
    battleLocalUI = { battleId: id, selectedAttackers: new Set(), blockerAssignments: {}, lastPhaseKey: null, autoPass: false };
  }
  try {
    const battle = await api(`/api/battles/${id}`);
    if (battle.status === 'completed') { renderBattleCompleted(el, battle, id); return; }
    if (battle.status === 'waiting') { renderBattleLobby(el, battle, id); return; }
    // In-progress battle: open in new window
    const gs = battle.game_state || {};
    if (!gs.players) { el.innerHTML = '<div class="empty-state"><h3>无游戏状态</h3></div>'; return; }
    // Open battle in new window and show info in main page
    window.open(`/battle.html?id=${id}`, '_blank');
    el.innerHTML = `
      <div class="page-header">
        <button class="btn btn-secondary btn-sm" onclick="navigate('battles')">← 返回</button>
        <h2 style="display:inline;margin-left:12px">${escapeHtml(battle.name || ('对战 #' + id))}</h2>
      </div>
      <div class="empty-state">
        <h3>对战已在新的窗口中打开</h3>
        <p>${escapeHtml(battle.player1_name || '玩家1')} vs ${escapeHtml(battle.player2_name || '玩家2')}</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="window.open('/battle.html?id=${id}', '_blank')">重新打开对战</button>
        <button class="btn btn-secondary" style="margin-top:8px" onclick="navigate('battles')">返回对战列表</button>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function renderBattleCompleted(el, battle, id) {
  const winnerName = battle.winner_id === battle.player1_id ? battle.player1_name : battle.player2_name;
  el.innerHTML = `
    <div class="page-header">
      <button class="btn btn-secondary btn-sm" onclick="navigate('battles')">← 返回</button>
      <h2 style="display:inline;margin-left:12px">${escapeHtml(battle.name || ('对战 #' + id))}</h2>
    </div>
    <div class="mtga-win-banner">🏆 ${escapeHtml(winnerName || '玩家')} 获胜</div>
    <div style="text-align:center;margin-top:16px">
      <button class="btn btn-primary" onclick="navigate('battles')">返回对战列表</button>
    </div>
  `;
}

async function joinBattle(battleId) {
  try {
    const decks = await api('/api/decks');
    if (decks.length === 0) { showToast('请先创建一个牌组', 'error'); return; }
    showModal('加入对战',
      '<form onsubmit="handleJoinBattle(event,' + battleId + ')">' +
      '<div class="form-group"><label>选择牌组</label>' +
      '<select id="join-battle-deck" required>' +
      decks.map(function(d) { return '<option value="' + d.id + '">' + escapeHtml(d.name) + ' (' + (Array.isArray(d.main_deck) ? d.main_deck.length : 0) + '张)</option>'; }).join('') +
      '</select></div>' +
      '<button type="submit" class="btn btn-success btn-block">加入</button>' +
      '</form>'
    );
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleJoinBattle(e, battleId) {
  e.preventDefault();
  var deck_id = parseInt(document.getElementById('join-battle-deck').value);
  if (!deck_id) { showToast('请选择一个牌组', 'error'); return; }
  try {
    await api('/api/battles/' + battleId + '/join', { method: 'POST', body: JSON.stringify({ deck_id: deck_id }) });
    closeModal();
    showToast('已加入对战');
    navigate('battle-detail', { id: battleId });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function startBattle(id) {
  try {
    await api('/api/battles/' + id + '/start', { method: 'POST', body: JSON.stringify({}) });
    showToast('对战开始！');
    navigate('battle-detail', { id: id });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderBattleLobby(el, battle, id) {
  const isP1 = String(battle.player1_id) === String(state.user?.id);
  const canJoin = !isP1 && battle.player2_id == null && state.user?.id != null;
  const canStart = isP1 && battle.player2_id != null;
  el.innerHTML = `
    <div class="page-header">
      <button class="btn btn-secondary btn-sm" onclick="navigate('battles')">← 返回</button>
      <h2 style="display:inline;margin-left:12px">${escapeHtml(battle.name || ('对战 #' + id))}</h2>
    </div>
    <div class="empty-state">
      <h3>${battle.player2_id ? '双方已就位' : '等待对手加入'}</h3>
      <p>${escapeHtml(battle.player1_name || '玩家1')} vs ${battle.player2_id ? escapeHtml(battle.player2_name || '玩家2') : '???'}</p>
      ${canJoin ? `<button class="btn btn-success" style="margin-top:16px" onclick="joinBattle(${id})">加入对战</button>` : ''}
      ${canStart ? `<button class="btn btn-warning" style="margin-top:16px" onclick="startBattle(${id})">开始对战</button>` : ''}
      ${!canJoin && !canStart ? '<p class="text-muted" style="margin-top:12px">等待其他玩家操作...</p>' : ''}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================
// MTGA Board Rendering - Tabletop Simulator Style
// ============================================================
function renderCardInnerHtml(card, isFlipped) {
  // If flipped and has back face image, show back face
  if (isFlipped && (card.image_back || card.image_small_back || card.image_large_back)) {
    var backImg = card.image_small_back || card.image_back || card.image_large_back;
    return '<img src="' + backImg + '" alt="' + escapeHtml(card.name + ' (back)') + '" style="width:100%;display:block;border-radius:4px" loading="lazy">';
  }
  if (card.image || card.image_small) {
    return '<img src="' + (card.image_small || card.image) + '" alt="' + escapeHtml(card.name) + '" style="width:100%;display:block;border-radius:4px" loading="lazy">';
  }
  // Token cards - special visual style
  if (card.is_token) {
    var isCreature = (card.type || '').toLowerCase().includes('creature');
    var pt = isCreature ? (card.power || '1') + ' / ' + (card.toughness || '1') : '';
    var bgGrad = isCreature
      ? 'linear-gradient(160deg, #1a3a2a 0%, #0d2818 40%, #162e22 100%)'
      : 'linear-gradient(160deg, #2a2040 0%, #1a1530 40%, #252040 100%)';
    var emblem = isCreature ? '⚔' : '✦';
    return '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:' + bgGrad + ';border-radius:4px;position:relative;overflow:hidden">'
      + '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:radial-gradient(circle at 50% 30%, rgba(255,255,255,0.06) 0%, transparent 60%);pointer-events:none"></div>'
      + '<div style="font-size:1.8rem;opacity:0.25;position:relative">' + emblem + '</div>'
      + '<div style="font-weight:700;font-size:0.72rem;color:rgba(220,230,240,0.85);text-align:center;position:relative;line-height:1.2">' + escapeHtml(card.name) + '</div>'
      + '<div style="font-size:0.55rem;color:rgba(160,180,200,0.5);position:relative">' + escapeHtml(card.type_line || card.type || '') + '</div>'
      + (pt ? '<div style="font-weight:800;font-size:0.9rem;color:rgba(220,235,220,0.9);position:relative">' + pt + '</div>' : '')
      + '</div>';
  }
  var pt = (card.power != null && card.toughness != null) ? card.power + ' / ' + card.toughness : '';
  return '<div style="padding:8px 10px;display:flex;flex-direction:column;gap:4px;min-height:100px;justify-content:space-between;background:linear-gradient(180deg,#1a2240,#141c35)">' +
    '<div><div style="font-weight:700;font-size:0.78rem;color:#e0e4f0;line-height:1.2">' + escapeHtml(card.name) + '</div>' +
    (card.manaCost ? '<div style="font-size:0.65rem;text-align:right;color:rgba(180,190,210,0.5);margin-top:2px">' + renderManaCost(card.manaCost) + '</div>' : '') +
    '</div>' +
    '<div style="font-size:0.62rem;color:rgba(160,170,195,0.45);border-top:1px solid rgba(80,100,140,0.15);border-bottom:1px solid rgba(80,100,140,0.15);padding:3px 0">' + escapeHtml(card.type || '') + '</div>' +
    (pt ? '<div style="font-weight:700;text-align:right;font-size:0.85rem;color:#e0e4f0">' + pt + '</div>' : '') +
    '</div>';
}

function renderManaCost(cost) {
  if (!cost) return '';
  return cost.replace(/\{([^}]+)\}/g, function(match, sym) {
    const colors = { W: 'white-mana', U: 'blue-mana', B: '#666', R: 'red-mana', G: 'green-mana' };
    const color = colors[sym] || '#888';
    return '<span style="background:' + color + ';color:white;padding:1px 5px;border-radius:50%;font-size:0.7rem;font-weight:700;display:inline-block;min-width:18px;text-align:center;">' + sym + '</span>';
  });
}

function renderCounterBadges(card) {
  if (!card.counters || typeof card.counters !== 'object') return '';
  var keys = Object.keys(card.counters);
  if (!keys.length) return '';
  var html = '<div class="card-counters">';
  keys.forEach(function(type) {
    var count = card.counters[type];
    if (count <= 0) return;
    var cls = 'counter-badge';
    if (type === '+1/+1') cls += ' counter-plus';
    else if (type === '-1/-1') cls += ' counter-minus';
    else if (type === 'W') cls += ' counter-W';
    else if (type === 'U') cls += ' counter-U';
    else if (type === 'B') cls += ' counter-B';
    else if (type === 'R') cls += ' counter-R';
    else if (type === 'G') cls += ' counter-G';
    var label = type;
    if (type === '+1/+1') label = '+' + count + '/+' + count;
    else if (type === '-1/-1') label = '-' + count + '/-' + count;
    html += '<div class="' + cls + '">' + label + '</div>';
  });
  html += '</div>';
  return html;
}

function renderLoyaltyBadge(card, isFlipped) {
  // Check if current face (or flipped face) is a Planeswalker
  var type = isFlipped ? (card.type_back || card.type || '') : (card.type || '');
  type = (type || '').toLowerCase();
  if (!type.includes('planeswalker')) return '';
  // Use back face loyalty if flipped, otherwise front face loyalty
  var loyalty = isFlipped ? (card.loyalty_back != null ? card.loyalty_back : card.loyalty) : card.loyalty;
  if (loyalty == null) return '';
  loyalty = parseInt(loyalty) || 0;
  // Shield SVG - a pointed-bottom shape inspired by MTG planeswalker design
  var shieldSvg = '<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">'
    + '<defs><linearGradient id="lg-' + card.id + '" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="rgba(140,90,220,0.7)"/>'
    + '<stop offset="100%" stop-color="rgba(60,30,120,0.8)"/>'
    + '</linearGradient></defs>'
    + '<path d="M15 1 L28 6 L28 17 Q28 24 15 29 Q2 24 2 17 L2 6 Z" fill="url(#lg-' + card.id + ')" stroke="rgba(180,140,255,0.4)" stroke-width="1"/>'
    + '<path d="M15 3 L26 7.5 L26 17 Q26 22.5 15 27 Q4 22.5 4 17 L4 7.5 Z" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>'
    + '</svg>';
  var html = '<div class="loyalty-badge">';
  html += '<button class="loyalty-btn loyalty-btn-minus" onclick="event.stopPropagation();mtgaLoyaltyAdjust(\'' + card.id + '\', -1)">\u2212</button>';
  html += '<div class="loyalty-shield">' + shieldSvg + '<div class="loyalty-value">' + loyalty + '</div></div>';
  html += '<button class="loyalty-btn loyalty-btn-plus" onclick="event.stopPropagation();mtgaLoyaltyAdjust(\'' + card.id + '\', 1)">+</button>';
  html += '</div>';
  return html;
}

function renderZoneCards(cards, zone) {
  cards = cards || [];
  if (!cards.length) return '<div class="mtga-zone-empty">empty</div>';
  var max = 20;
  var visible = cards.slice(-max);
  return visible.map(function(c) {
    return '<div class="mtg-card" data-card-id="' + c.id + '" data-zone="' + zone + '" data-color="' + getCardColorClass(c) + '" draggable="true" style="width:60px;height:auto;cursor:grab;flex-shrink:0;border:none;border-radius:3px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.4)" title="' + escapeHtml(c.name) + '">' +
      renderCardInnerHtml(c) + '</div>';
  }).join('') + (cards.length > max ? '<div style="font-size:0.65rem;color:rgba(160,170,195,0.4);padding:4px">+' + (cards.length - max) + '</div>' : '');
}

function renderLibraryStack(count, id) {
  if (!count) return '<div class="mtga-library-stack" id="' + (id || '') + '"><div class="mtga-lib-card"></div><div class="mtga-lib-count">0</div></div>';
  var layers = Math.min(count, 5);
  var cards = '';
  for (var i = 0; i < layers; i++) cards += '<div class="mtga-lib-card"></div>';
  return '<div class="mtga-library-stack" id="' + (id || '') + '">' + cards + '<div class="mtga-lib-count">' + count + '</div></div>';
}

function renderLogLines(log) {
  log = log || [];
  if (!log.length) return '<div class="text-muted" style="font-size:0.75rem">No logs</div>';
  var lines = log.slice(-30);
  return lines.map(function(msg) {
    var isTurn = /^---/.test(msg);
    return '<div class="mtga-log-line ' + (isTurn ? 'turn-start' : '') + '">' + escapeHtml(msg) + '</div>';
  }).join('');
}

function renderHandCards(cards) {
  cards = cards || [];
  var N = cards.length;
  return cards.map(function(card, idx) {
    var offset = N === 1 ? 0 : (idx - (N - 1) / 2);
    var fanX = offset * 72;
    var fanRot = N === 1 ? 0 : Math.max(-10, Math.min(10, offset * 2));
    return '<div class="mtg-card" data-card-id="' + card.id + '" data-zone="hand" data-color="' + getCardColorClass(card) + '" draggable="true" style="left:calc(50% + ' + fanX + 'px - 55px);transform:rotate(' + fanRot + 'deg);width:110px;cursor:grab;border:none;border-radius:4px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.5)" title="' + escapeHtml(card.name) + '">' +
      renderCardInnerHtml(card) + '</div>';
  }).join('');
}

function renderBattlefieldCards(cards) {
  cards = cards || [];
  if (!cards.length) return '<div class="mtga-zone-empty">empty</div>';
  return cards.map(function(card) {
    var classes = ['mtg-card'];
    if (card.tapped) classes.push('tapped');
    var dmg = card.damage_marked ? '<div class="mtga-card-damage">-' + card.damage_marked + '</div>' : '';
    return '<div class="' + classes.join(' ') + '" data-card-id="' + card.id + '" data-zone="battlefield" data-color="' + getCardColorClass(card) + '" style="width:120px;border:none;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4)" draggable="true">' +
      renderCardInnerHtml(card) + dmg + '</div>';
  }).join('');
}

function renderActionBar(battleId, gs, myKey, battle) {
  var isMyTurn = gs.activePlayer === myKey;
  var turnLabel = isMyTurn ? '\ud83c\udfaf Your Turn' : '\u23f3 Opponent\'s Turn';
  var gameNum = battle.current_game || 1;
  var p1w = gs.player1_wins || battle.player1_wins || 0;
  var p2w = gs.player2_wins || battle.player2_wins || 0;
  var scoreLabel = 'G' + gameNum + ' | ' + p1w + '-' + p2w;
  var parts = [];
  parts.push('<button class="btn btn-secondary btn-sm" onclick="mtgaLeaveBattle(' + battleId + ')">\u2190 Back</button>');
  if (gs.winner && gs.matchOver) {
    parts.push('<span style="margin-left:8px;font-weight:600;color:var(--accent)">' + escapeHtml(battle?.name || 'Battle #' + battleId) + '</span>');
    parts.push('<span style="margin-left:auto;font-size:0.85rem;color:var(--text-muted)">Turn ' + gs.turn + '</span>');
    parts.push('<button class="btn btn-primary btn-sm" onclick="mtgaReturnToEvent(' + battleId + ')">\u2190 返回比赛</button>');
    return '<div class="mtga-action-bar">' + parts.join('') + '</div>';
  }
  if (gs.winner && !gs.matchOver) {
    // Game over, waiting for next game in BO3
    parts.push('<span style="margin-left:8px;font-weight:600;color:var(--accent)">' + escapeHtml(battle?.name || '') + '</span>');
    parts.push('<span style="margin-left:8px;font-size:0.85rem;color:var(--text-muted)">' + scoreLabel + '</span>');
    parts.push('<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="mtgaNextGame(' + battleId + ')">下一局 \u25b6</button>');
    parts.push('<button class="btn btn-secondary btn-sm" onclick="mtgaReturnToEvent(' + battleId + ')">\u2190 返回比赛</button>');
    return '<div class="mtga-action-bar">' + parts.join('') + '</div>';
  }
  parts.push('<span style="margin-left:8px;font-weight:600;color:var(--accent);font-size:0.9rem">' + escapeHtml(battle?.name || '') + '</span>');
  parts.push('<span style="margin-left:4px;font-size:0.8rem;color:var(--text-muted)">' + scoreLabel + '</span>');
  parts.push('<span style="margin-left:8px;font-size:0.85rem;color:' + (isMyTurn ? '#2ecc71' : 'var(--text-muted)') + ';font-weight:600">' + turnLabel + '</span>');
  parts.push('<span style="font-size:0.8rem;color:var(--text-muted);margin-left:4px">Turn ' + gs.turn + '</span>');
  // Mulligan button - always available, unlimited uses, with count display
  var me = gs.players[myKey];
  var oppKeyLocal = myKey === 'p1' ? 'p2' : 'p1';
  var opp = gs.players[oppKeyLocal];
  var myMulliganCount = (gs.mulligan_count && gs.mulligan_count[myKey]) || 0;
  var oppMulliganCount = (gs.mulligan_count && gs.mulligan_count[oppKeyLocal]) || 0;
  if (me) {
    parts.push('<button class="btn btn-warning btn-sm" style="margin-left:8px;background:#e67e22;border-color:#e67e22" onclick="mtgaAction(' + battleId + ', { type: \'mulligan\' })">\u{1f500} 调度 (' + myMulliganCount + ')</button>');
  }
  if (oppMulliganCount > 0) {
    parts.push('<span style="margin-left:6px;font-size:0.75rem;color:var(--text-muted)">对手调度: ' + oppMulliganCount + '次</span>');
  }
  if (isMyTurn) {
    parts.push('<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="mtgaAction(' + battleId + ', { type: \'end_turn\' })">End Turn \u25b6</button>');
  } else {
    parts.push('<span style="margin-left:auto;padding:4px 12px;color:var(--text-muted);font-size:0.85rem">\u23f3 Opponent\'s turn...</span>');
  }
  parts.push('<button class="btn btn-danger btn-sm" onclick="if(confirm(\'Concede this game?\')) mtgaAction(' + battleId + ', { type: \'concede\' })">Concede</button>');
  return '<div class="mtga-action-bar">' + parts.join('') + '</div>';
}

async function mtgaNextGame(battleId, updatedDeck) {
  try {
    var body = updatedDeck ? { updated_deck: updatedDeck } : {};
    await api('/api/battles/' + battleId + '/next-game', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    location.reload();
  } catch (err) { showToast(err.message, 'error'); }
}

function goToDeckEditBetweenGames(battleId) {
  navigate('deck-builder', { battleId: battleId, betweenGames: true });
}

// ============================================================
// Card Hover Preview (supports DFC double-faced cards)
// ============================================================
function showCardPreview(card) {
  hideCardPreview();
  if (!card) return;

  var frontImg = card.image_large || card.image || card.image_small;
  var backImg = card.image_large_back || card.image_back || card.image_small_back;
  var isDFC = !!backImg;

  var div = document.createElement('div');
  div.id = 'card-preview-popup';
  div.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;transition:opacity 0.15s;opacity:0;display:flex;gap:6px;padding:8px;background:rgba(10,14,26,0.95);border:1px solid #d4a043;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.7),0 0 0 1px rgba(212,160,67,0.3);backdrop-filter:blur(8px);';

  if (isDFC) {
    // Double-faced card: show front and back side by side
    var html = '';
    // Front face
    html += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">';
    html += '<div style="font-size:0.65rem;color:#d4a043;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">正面</div>';
    if (frontImg) {
      html += '<img src="' + frontImg + '" style="width:240px;height:auto;border-radius:6px;display:block;box-shadow:0 4px 12px rgba(0,0,0,0.5)">';
    } else {
      html += '<div style="width:240px;text-align:center;font-size:0.75rem;color:#e8ecf4;font-weight:600;padding:8px">' + escapeHtml(card.name) + '</div>';
    }
    html += '</div>';
    // Back face
    html += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">';
    html += '<div style="font-size:0.65rem;color:#d4a043;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">背面</div>';
    html += '<img src="' + backImg + '" style="width:240px;height:auto;border-radius:6px;display:block;box-shadow:0 4px 12px rgba(0,0,0,0.5)">';
    html += '</div>';
    div.innerHTML = html;
  } else if (frontImg) {
    // Normal card with image
    div.innerHTML = '<img src="' + frontImg + '" style="width:280px;height:auto;border-radius:8px;display:block;box-shadow:0 4px 12px rgba(0,0,0,0.5)">';
  } else {
    // Text-only card fallback
    div.innerHTML = '<div style="width:280px;background:linear-gradient(180deg,#1a2240,#141c35);border-radius:8px;padding:16px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">' +
      '<div style="font-weight:700;font-size:1rem;color:#e0e4f0;margin-bottom:4px">' + escapeHtml(card.name) + '</div>' +
      (card.manaCost ? '<div style="margin-bottom:8px">' + renderManaCost(card.manaCost) + '</div>' : '') +
      '<div style="font-size:0.8rem;color:rgba(180,190,210,0.6);border-top:1px solid rgba(80,100,140,0.2);border-bottom:1px solid rgba(80,100,140,0.2);padding:6px 0;margin-bottom:8px">' + escapeHtml(card.type || '') + '</div>' +
      (card.text ? '<div style="font-size:0.78rem;color:rgba(200,210,230,0.8);line-height:1.4;margin-bottom:8px">' + escapeHtml(card.text) + '</div>' : '') +
      ((card.power != null && card.toughness != null) ? '<div style="text-align:right;font-weight:700;font-size:1rem;color:#e0e4f0">' + card.power + ' / ' + card.toughness + '</div>' : '') +
      '</div>';
  }

  document.body.appendChild(div);
  requestAnimationFrame(function() { div.style.opacity = '1'; });
}

function moveCardPreview(e) {
  var div = document.getElementById('card-preview-popup');
  if (!div) return;
  var previewW = div.offsetWidth || 280;
  var previewH = div.offsetHeight || 400;
  // Position to the right of cursor by default
  var x = e.clientX + 16;
  var y = e.clientY - 20;
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  // If would overflow right, show on left side of cursor
  if (x + previewW > vw - 16) {
    x = e.clientX - previewW - 16;
  }
  // If would overflow bottom, shift up
  if (y + previewH > vh - 16) {
    y = vh - previewH - 16;
  }
  if (y < 16) y = 16;
  if (x < 16) x = 16;
  div.style.left = x + 'px';
  div.style.top = y + 'px';
}

function hideCardPreview() {
  var div = document.getElementById('card-preview-popup');
  if (div) div.remove();
}

// ============================================================
// Context Menu for Counters
// ============================================================
function hideContextMenu() {
  var menu = document.getElementById('ctx-menu');
  if (menu) menu.remove();
}

// Global dismiss handler (registered once, not per-render)
document.addEventListener('click', function() { hideContextMenu(); });
document.addEventListener('contextmenu', function(e) {
  // Only dismiss if clicking outside the context menu
  var menu = document.getElementById('ctx-menu');
  if (menu && !menu.contains(e.target)) hideContextMenu();
});

function showContextMenu(e, cardId, card, playerKey, battleId) {
  e.preventDefault();
  e.stopPropagation();
  hideContextMenu();

  var menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';

  function addItem(label, action, counterType, dotClass) {
    var div = document.createElement('div');
    div.className = 'ctx-menu-item';
    if (dotClass) {
      var dot = document.createElement('span');
      dot.className = 'ctx-color-dot ' + (dotClass.startsWith('counter-') ? dotClass : 'counter-' + dotClass);
      div.appendChild(dot);
    }
    var span = document.createElement('span');
    span.textContent = label;
    div.appendChild(span);
    div.addEventListener('click', function(ev) {
      ev.stopPropagation();
      hideContextMenu();
      if (action === 'add') {
        mtgaAction(battleId, { type: 'add_counter', card_id: cardId, counter_type: counterType });
      } else if (action === 'remove') {
        mtgaAction(battleId, { type: 'remove_counter', card_id: cardId, counter_type: counterType });
      } else if (action === 'toggle_token') {
        mtgaAction(battleId, { type: 'toggle_token_type', card_id: cardId });
      } else if (action === 'flip_card') {
        toggleCardFlip(cardId);
      } else if (action === 'remove_token') {
        mtgaAction(battleId, { type: 'move_card', card_id: cardId, from_zone: 'battlefield', to_zone: 'graveyard' });
      }
    });
    menu.appendChild(div);
  }

  function addSeparator() {
    var sep = document.createElement('div');
    sep.className = 'ctx-menu-separator';
    menu.appendChild(sep);
  }

  function addLabel(text) {
    var div = document.createElement('div');
    div.className = 'ctx-menu-label';
    div.textContent = text;
    menu.appendChild(div);
  }

  // Token-specific options
  if (card.is_token) {
    var isCreature = (card.type || '').toLowerCase().includes('creature');
    addItem(isCreature ? '切换为非生物' : '切换为生物', 'toggle_token', null, null);
    addSeparator();
  }

  // DFC flip option (only for double-faced cards)
  var isDFC = !!(card.image_back || card.image_small_back || card.image_large_back);
  if (isDFC) {
    var gs = battleLocalUI && battleLocalUI.gs;
    var flippedArr = (gs && gs.flipped_cards && Array.isArray(gs.flipped_cards[playerKey])) ? gs.flipped_cards[playerKey] : [];
    var isFlipped = flippedArr.indexOf(cardId) !== -1;
    addItem(isFlipped ? '翻回正面' : '翻面', 'flip_card', null, null);
    addSeparator();
  }

  // Power/toughness counters
  addItem('+1/+1', 'add', '+1/+1', null);
  addItem('-1/-1', 'add', '-1/-1', null);
  addSeparator();

  // Color counters
  addItem('White', 'add', 'W', 'W');
  addItem('Blue', 'add', 'U', 'U');
  addItem('Black', 'add', 'B', 'B');
  addItem('Red', 'add', 'R', 'R');
  addItem('Green', 'add', 'G', 'G');

  // Remove section (only if card has counters)
  if (card.counters && typeof card.counters === 'object') {
    var counterKeys = Object.keys(card.counters).filter(function(k) { return card.counters[k] > 0; });
    if (counterKeys.length > 0) {
      addSeparator();
      addLabel('Remove');
      counterKeys.forEach(function(type) {
        var dotCls = null;
        if (type === '+1/+1') dotCls = 'counter-plus';
        else if (type === '-1/-1') dotCls = 'counter-minus';
        else if (['W','U','B','R','G'].indexOf(type) >= 0) dotCls = 'counter-' + type;
        addItem(type + ' (' + card.counters[type] + ')', 'remove', type, dotCls);
      });
    }
  }

  // Remove token option
  if (card.is_token) {
    addSeparator();
    addItem('移除衍生物', 'remove_token', null, null);
  }

  document.body.appendChild(menu);

  // Position menu at cursor, keep within viewport
  var x = e.clientX;
  var y = e.clientY;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  requestAnimationFrame(function() {
    var menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) menu.style.left = (x - menuRect.width) + 'px';
    if (menuRect.bottom > window.innerHeight) menu.style.top = (y - menuRect.height) + 'px';
  });
}

// ============================================================
// Battlefield Empty-Area Context Menu (Create Tokens)
// ============================================================
function showBattlefieldContextMenu(e, playerKey, battleId) {
  console.log('[bf-ctx] showBattlefieldContextMenu called, playerKey:', playerKey, 'myKey:', battleLocalUI.myKey);
  // Only allow on own battlefield
  if (playerKey !== battleLocalUI.myKey) { console.log('[bf-ctx] not own battlefield, skipping'); return; }
  e.preventDefault();
  e.stopPropagation();
  hideContextMenu();

  var menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';

  function addTokenItem(label, power, toughness, isCreature) {
    var div = document.createElement('div');
    div.className = 'ctx-menu-item';
    var span = document.createElement('span');
    span.textContent = label;
    div.appendChild(span);
    div.addEventListener('click', function(ev) {
      ev.stopPropagation();
      hideContextMenu();
      mtgaAction(battleId, { type: 'create_token', name: '衍生物', power: power, toughness: toughness, is_creature: isCreature });
    });
    menu.appendChild(div);
  }

  function addSeparator() {
    var sep = document.createElement('div');
    sep.className = 'ctx-menu-separator';
    menu.appendChild(sep);
  }

  function addLabel(text) {
    var div = document.createElement('div');
    div.className = 'ctx-menu-label';
    div.textContent = text;
    menu.appendChild(div);
  }

  addLabel('创建衍生物');
  addTokenItem('1/1 生物', 1, 1, true);
  addTokenItem('2/2 生物', 2, 2, true);
  addTokenItem('3/3 生物', 3, 3, true);
  addTokenItem('4/4 生物', 4, 4, true);
  addSeparator();
  addTokenItem('非生物衍生物', null, null, false);
  addSeparator();

  // Custom token option
  var customDiv = document.createElement('div');
  customDiv.className = 'ctx-menu-item';
  var customSpan = document.createElement('span');
  customSpan.textContent = '自定义衍生物...';
  customDiv.appendChild(customSpan);
  customDiv.addEventListener('click', function(ev) {
    ev.stopPropagation();
    hideContextMenu();
    showCustomTokenModal(battleId);
  });
  menu.appendChild(customDiv);

  document.body.appendChild(menu);
  var x = e.clientX;
  var y = e.clientY;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  requestAnimationFrame(function() {
    var menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) menu.style.left = (x - menuRect.width) + 'px';
    if (menuRect.bottom > window.innerHeight) menu.style.top = (y - menuRect.height) + 'px';
  });
}

// ============================================================
// Deck Preview
// ============================================================
var _deckPreviewCards = {};
var _deckPreviewBattleId = null;
var _deckPreviewMyKey = null;
var _deckPreviewIsPublic = false;
var _deckPreviewOrder = []; // Current card order in preview (array of card IDs)

function showDeckPreviewMenu(e, gs, myKey, battleId) {
  hideContextMenu();
  var menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';

  var libCount = (gs.players[myKey] && gs.players[myKey].library) ? gs.players[myKey].library.length : 0;

  // Preview full library
  var div = document.createElement('div');
  div.className = 'ctx-menu-item';
  div.innerHTML = '<span>\u{1F4CB} 预览牌组 (' + libCount + ')</span>';
  div.addEventListener('click', function(ev) {
    ev.stopPropagation();
    hideContextMenu();
    showDeckPreviewModal(gs, myKey, battleId, 0);
  });
  menu.appendChild(div);

  // Preview X cards (from top) - private view
  var xDiv = document.createElement('div');
  xDiv.className = 'ctx-menu-item';
  xDiv.innerHTML = '<span>\u{1F50D} 预览X张卡牌...</span>';
  xDiv.addEventListener('click', function(ev) {
    ev.stopPropagation();
    hideContextMenu();
    var n = prompt('请输入要预览的卡牌数量 (1-' + libCount + '):', Math.min(7, libCount));
    if (n === null) return;
    var num = parseInt(n);
    if (isNaN(num) || num < 1 || num > libCount) { showToast('无效数量', 'error'); return; }
    showDeckPreviewModal(gs, myKey, battleId, num, false);
  });
  menu.appendChild(xDiv);

  // Show X cards to opponents - public view
  var showDiv = document.createElement('div');
  showDiv.className = 'ctx-menu-item';
  showDiv.innerHTML = '<span>\u{1F441} 展示X张牌给对手...</span>';
  showDiv.addEventListener('click', function(ev) {
    ev.stopPropagation();
    hideContextMenu();
    var n = prompt('请输入要展示的卡牌数量 (1-' + libCount + '):', Math.min(7, libCount));
    if (n === null) return;
    var num = parseInt(n);
    if (isNaN(num) || num < 1 || num > libCount) { showToast('无效数量', 'error'); return; }
    showDeckPreviewModal(gs, myKey, battleId, num, true);
  });
  menu.appendChild(showDiv);

  // Shuffle
  var shuffleDiv = document.createElement('div');
  shuffleDiv.className = 'ctx-menu-item';
  shuffleDiv.innerHTML = '<span>\u{1F500} 洗牌</span>';
  shuffleDiv.addEventListener('click', function(ev) {
    ev.stopPropagation();
    hideContextMenu();
    mtgaAction(battleId, { type: 'shuffle_library' });
  });
  menu.appendChild(shuffleDiv);

  document.body.appendChild(menu);
  var x = e.clientX;
  var y = e.clientY;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  requestAnimationFrame(function() {
    var menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) menu.style.left = (x - menuRect.width) + 'px';
    if (menuRect.bottom > window.innerHeight) menu.style.top = (y - menuRect.height) + 'px';
  });
}

function showDeckPreviewModal(gs, myKey, battleId, showCount, isPublic) {
  var me = gs.players[myKey];
  var library = (me && Array.isArray(me.library)) ? me.library : [];
  if (library.length === 0) { showToast('牌库为空', 'error'); return; }

  _deckPreviewBattleId = battleId;
  _deckPreviewMyKey = myKey;
  _deckPreviewIsPublic = isPublic || false;

  // If showCount > 0, only show top N cards
  var displayCards = showCount > 0 ? library.slice(0, showCount) : library.slice();
  _deckPreviewOrder = displayCards.map(function(c) { return c.id; });

  var title = showCount > 0 ? (isPublic ? '展示前' + showCount + '张' : '预览前' + showCount + '张') : '牌库 (' + library.length + '张)';

  // If public mode, send show_library_cards action to server
  if (isPublic && showCount > 0) {
    mtgaAction(battleId, { type: 'show_library_cards', count: showCount }).catch(function(err) {
      console.error('show_library_cards failed:', err);
      showToast('展示卡牌失败: ' + (err.message || '未知错误'), 'error');
    });
  }

  // Build panel HTML - no close button, cards only show images, footer with return buttons
  var html = '<div class="deck-preview-panel" id="deck-preview-panel">' +
    '<div class="deck-preview-header"><h3>' + escapeHtml(title) + ' · <span id="deck-preview-count">' + displayCards.length + '</span>张</h3></div>' +
    '<div class="deck-preview-body" id="deck-preview-body">' +
      '<div class="deck-preview-cards" id="deck-preview-cards"></div>' +
    '</div>' +
    '<div class="deck-preview-footer" id="deck-preview-footer">' +
      '<button class="btn btn-secondary" onclick="returnToLibrary(\'top\')">放回牌库顶</button>' +
      '<button class="btn btn-secondary" onclick="returnToLibrary(\'bottom\')">放回牌库底</button>' +
    '</div>' +
  '</div>';

  var panel = document.createElement('div');
  panel.innerHTML = html;
  document.body.appendChild(panel.firstElementChild);

  // Store card data
  _deckPreviewCards = {};
  displayCards.forEach(function(card, idx) {
    _deckPreviewCards['card_' + card.id] = card;
  });

  // Render card elements
  renderPreviewCards();

  // Setup drag for playing cards out
  setupDeckPreviewDrag(battleId, myKey);
}

function renderPreviewCards() {
  var container = document.getElementById('deck-preview-cards');
  if (!container) return;
  container.innerHTML = '';

  _deckPreviewOrder.forEach(function(cardId, idx) {
    var card = _deckPreviewCards['card_' + cardId];
    if (!card) return;

    var cardEl = document.createElement('div');
    cardEl.className = 'deck-preview-card';
    cardEl.setAttribute('data-card-id', cardId);
    cardEl.setAttribute('data-idx', idx);
    cardEl.draggable = true;

    var imgSrc = card.image_small || card.image;
    if (imgSrc) {
      var img = document.createElement('img');
      img.src = imgSrc;
      img.alt = card.name || '';
      img.className = 'deck-preview-img';
      cardEl.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.className = 'deck-preview-placeholder';
      ph.innerHTML = '<span>' + escapeHtml(card.name || 'Unknown') + '</span>';
      cardEl.appendChild(ph);
    }

    // Hover preview
    cardEl.addEventListener('mouseenter', function(e) {
      showCardPreview(card, e);
      moveCardPreview(e);
    });
    cardEl.addEventListener('mousemove', moveCardPreview);
    cardEl.addEventListener('mouseleave', hideCardPreview);

    // Right-click context menu
    cardEl.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showPreviewCardMenu(e, card, cardId);
    });

    container.appendChild(cardEl);
  });

  // Update count
  var countEl = document.getElementById('deck-preview-count');
  if (countEl) countEl.textContent = _deckPreviewOrder.length;

  // Setup drag reordering + drag-out
  setupPreviewCardDragHandlers();
}

function showPreviewCardMenu(e, card, cardId) {
  hideContextMenu();
  var menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';

  var zones = [
    { label: '\u{270B} 加入手牌', zone: 'hand' },
    { label: '\u{2694} 进入战场', zone: 'battlefield' },
    { label: '\u{1FAA6} 进入坟场', zone: 'graveyard' },
    { label: '\u{1F6AB} 进入放逐区', zone: 'exile' }
  ];

  zones.forEach(function(item) {
    var div = document.createElement('div');
    div.className = 'ctx-menu-item';
    div.innerHTML = '<span>' + item.label + '</span>';
    div.addEventListener('click', function(ev) {
      ev.stopPropagation();
      hideContextMenu();
      playCardFromPreview(card, cardId, item.zone);
    });
    menu.appendChild(div);
  });

  document.body.appendChild(menu);
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  requestAnimationFrame(function() {
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (e.clientX - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (e.clientY - rect.height) + 'px';
  });
}

function playCardFromPreview(card, cardId, toZone) {
  if (!_deckPreviewBattleId) return;
  // Send play_from_deck action
  mtgaAction(_deckPreviewBattleId, {
    type: 'play_from_deck',
    card_name: card.name,
    deck_zone: 'library',
    deck_idx: -1,
    to_zone: toZone
  }).then(function() {
    // Remove from preview order
    _deckPreviewOrder = _deckPreviewOrder.filter(function(id) { return id !== cardId; });
    delete _deckPreviewCards['card_' + cardId];
    renderPreviewCards();
    if (_deckPreviewOrder.length === 0) {
      closeDeckPreview();
    }
  }).catch(function(err) {
    console.error('play_from_deck failed:', err);
    showToast('打出卡牌失败: ' + (err.message || '未知错误'), 'error');
  });
}

function returnToLibrary(position) {
  if (!_deckPreviewBattleId || _deckPreviewOrder.length === 0) {
    closeDeckPreview();
    return;
  }
  mtgaAction(_deckPreviewBattleId, {
    type: 'return_to_library',
    card_ids: _deckPreviewOrder,
    position: position
  }).then(function() {
    closeDeckPreview();
  }).catch(function(err) {
    console.error('return_to_library failed:', err);
    showToast('放回牌库失败: ' + (err.message || '未知错误'), 'error');
  });
}

function closeDeckPreview() {
  var panel = document.getElementById('deck-preview-panel');
  if (panel) panel.remove();
  // If public mode was active, hide the revealed cards
  if (_deckPreviewIsPublic && _deckPreviewBattleId) {
    mtgaAction(_deckPreviewBattleId, { type: 'hide_library_cards' }).catch(function(err) {
      console.error('hide_library_cards failed:', err);
    });
  }
  _deckPreviewCards = {};
  _deckPreviewOrder = [];
  _deckPreviewBattleId = null;
  _deckPreviewMyKey = null;
  _deckPreviewIsPublic = false;
}

var _deckPreviewReorderDrag = null; // { cardId, fromIdx, cardEl }

function setupPreviewCardDragHandlers() {
  var cards = document.querySelectorAll('#deck-preview-cards .deck-preview-card');
  cards.forEach(function(cardEl) {
    var cardId = parseInt(cardEl.getAttribute('data-card-id'));

    cardEl.addEventListener('dragstart', function(e) {
      var card = _deckPreviewCards['card_' + cardId];
      if (!card) return;

      // Store reorder drag info
      _deckPreviewReorderDrag = {
        cardId: cardId,
        fromIdx: _deckPreviewOrder.indexOf(cardId),
        cardEl: cardEl
      };

      // Also set drag data for potential drag-out to zones
      e.dataTransfer.setData('text/plain', JSON.stringify({
        source: 'deck_preview',
        card: card,
        deck_zone: 'library',
        deck_idx: -1,
        card_id: cardId,
        battleId: _deckPreviewBattleId,
        playerKey: _deckPreviewMyKey
      }));
      e.dataTransfer.effectAllowed = 'move';

      // Hide panel for drag-out
      var panel = document.getElementById('deck-preview-panel');
      if (panel) panel.classList.add('dragging');
      cardEl.classList.add('dragging');
    });

    cardEl.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Visual feedback for reorder
      if (_deckPreviewReorderDrag && _deckPreviewReorderDrag.cardId !== cardId) {
        cardEl.classList.add('reorder-target');
      }
    });

    cardEl.addEventListener('dragleave', function(e) {
      cardEl.classList.remove('reorder-target');
    });

    cardEl.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      cardEl.classList.remove('reorder-target');

      // Reorder within preview
      if (_deckPreviewReorderDrag) {
        var fromCardId = _deckPreviewReorderDrag.cardId;
        var toCardId = cardId;
        if (fromCardId === toCardId) return;

        var fromIdx = _deckPreviewOrder.indexOf(fromCardId);
        var toIdx = _deckPreviewOrder.indexOf(toCardId);
        if (fromIdx === -1 || toIdx === -1) return;

        // Remove from old position, insert at new
        _deckPreviewOrder.splice(fromIdx, 1);
        // Adjust target index after removal
        if (fromIdx < toIdx) toIdx--;
        _deckPreviewOrder.splice(toIdx + 1, 0, fromCardId);

        renderPreviewCards();
        _deckPreviewReorderDrag = null;
      }
    });

    cardEl.addEventListener('dragend', function(e) {
      // Restore panel
      var panel = document.getElementById('deck-preview-panel');
      if (panel) panel.classList.remove('dragging');
      cardEl.classList.remove('dragging');

      // Clean up reorder drag state
      if (_deckPreviewReorderDrag) {
        _deckPreviewReorderDrag = null;
      }
    });
  });

  // Also allow dropping on the container itself (reorder to end)
  var container = document.getElementById('deck-preview-cards');
  if (container) {
    container.addEventListener('dragover', function(e) {
      if (_deckPreviewReorderDrag) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });
    container.addEventListener('drop', function(e) {
      if (_deckPreviewReorderDrag && e.target === container) {
        e.preventDefault();
        // Move to end
        var fromCardId = _deckPreviewReorderDrag.cardId;
        var fromIdx = _deckPreviewOrder.indexOf(fromCardId);
        if (fromIdx === -1) return;
        _deckPreviewOrder.splice(fromIdx, 1);
        _deckPreviewOrder.push(fromCardId);
        renderPreviewCards();
        _deckPreviewReorderDrag = null;
      }
    });
  }
}

// Legacy function kept for compatibility - now handled by setupPreviewCardDragHandlers
function setupDeckPreviewDrag(battleId, myKey) {
  // Drag is now set up in renderPreviewCards -> setupPreviewCardDragHandlers
}

// ============================================================
// Custom Token Modal
// ============================================================
function showCustomTokenModal(battleId) {
  var html = '<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0">'
    + '<div><label style="font-size:0.8rem;color:rgba(180,190,210,0.7);display:block;margin-bottom:4px">名称</label>'
    + '<input id="token-name" type="text" value="衍生物" style="width:100%;padding:6px 10px;background:rgba(30,40,60,0.6);border:1px solid rgba(100,120,160,0.3);border-radius:4px;color:#e0e4f0;font-size:0.85rem"></div>'
    + '<div style="display:flex;gap:12px">'
    + '<div style="flex:1"><label style="font-size:0.8rem;color:rgba(180,190,210,0.7);display:block;margin-bottom:4px">力量</label>'
    + '<input id="token-power" type="number" value="1" min="0" style="width:100%;padding:6px 10px;background:rgba(30,40,60,0.6);border:1px solid rgba(100,120,160,0.3);border-radius:4px;color:#e0e4f0;font-size:0.85rem"></div>'
    + '<div style="flex:1"><label style="font-size:0.8rem;color:rgba(180,190,210,0.7);display:block;margin-bottom:4px">防御</label>'
    + '<input id="token-toughness" type="number" value="1" min="0" style="width:100%;padding:6px 10px;background:rgba(30,40,60,0.6);border:1px solid rgba(100,120,160,0.3);border-radius:4px;color:#e0e4f0;font-size:0.85rem"></div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<input id="token-is-creature" type="checkbox" checked style="width:16px;height:16px;accent-color:#2ecc71">'
    + '<label for="token-is-creature" style="font-size:0.82rem;color:rgba(200,210,230,0.8);cursor:pointer">生物（取消勾选为非生物）</label>'
    + '</div>'
    + '<button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="submitCustomToken(' + battleId + ')">创建</button>'
    + '</div>';
  showModal('创建自定义衍生物', html);
}

function submitCustomToken(battleId) {
  var name = document.getElementById('token-name').value.trim() || '衍生物';
  var power = parseInt(document.getElementById('token-power').value) || 0;
  var toughness = parseInt(document.getElementById('token-toughness').value) || 0;
  var isCreature = document.getElementById('token-is-creature').checked;
  closeModal();
  mtgaAction(battleId, { type: 'create_token', name: name, power: power, toughness: toughness, is_creature: isCreature, is_custom: true });
}

// ============================================================
// Organize battlefield cards by type
// ============================================================
function categorizeBattlefieldCards(cards, flippedSet) {
  cards = cards || [];
  var creatures = [];
  var lands = [];
  var others = [];
  cards.forEach(function(card) {
    var isCardFlipped = flippedSet && flippedSet.has(card.id);
    // For flipped cards, use the back face type
    var type = isCardFlipped ? ((card.type_back || card.type || '').toLowerCase()) : ((card.type || '').toLowerCase());
    if (type.includes('creature')) {
      creatures.push(card);
    } else if (type.includes('land')) {
      lands.push(card);
    } else {
      // Planeswalkers, artifacts, enchantments, etc. all go into "others"
      others.push(card);
    }
  });
  return { creatures: creatures, lands: lands, others: others };
}

function renderBattlefieldOrganized(cards, playerKey, isMy, flipped) {
  // Get flipped state from server (gs.flipped_cards[playerKey] is an array of card IDs)
  var gs = battleLocalUI && battleLocalUI.gs;
  var flippedArr = (gs && gs.flipped_cards && Array.isArray(gs.flipped_cards[playerKey])) ? gs.flipped_cards[playerKey] : [];
  var flippedSet = { has: function(id) { return flippedArr.indexOf(id) !== -1; } };
  var groups = categorizeBattlefieldCards(cards, flippedSet);

  function renderCardWithStack(card, isCardFlipped, width, extraBadges) {
    var tapped = card.tapped ? ' tapped' : '';
    var tokenCls = card.is_token ? ' mtg-token' : '';
    var dmg = card.damage_marked ? '<div class="mtga-card-damage">-' + card.damage_marked + '</div>' : '';
    var stacked = Array.isArray(card.stacked_cards) ? card.stacked_cards : [];
    var stackCount = stacked.length;

    // Build stacked cards behind (from bottom to top, offset toward bottom-left)
    var stackHtml = '';
    var stackOffset = 6; // 1/3 of original 18px
    if (stackCount > 0) {
      stacked.forEach(function(sc, idx) {
        var scFlipped = flippedSet && flippedSet.has(sc.id);
        var offset = (idx + 1) * stackOffset;
        var scBadges = renderCounterBadges(sc) + renderLoyaltyBadge(sc, scFlipped);
        stackHtml += '<div class="mtg-card-stacked" data-card-id="' + sc.id + '" data-zone="battlefield" data-player="' + playerKey + '" data-stack-card="true" style="position:absolute;top:' + offset + 'px;left:-' + offset + 'px;width:' + width + 'px;opacity:0.7;z-index:' + idx + ';cursor:grab" draggable="' + isMy + '">' +
          renderCardInnerHtml(sc, scFlipped) + scBadges + '</div>';
      });
    }

    var stackBadge = stackCount > 0 ? '<div class="stack-badge">' + stackCount + '</div>' : '';

    return '<div class="mtg-card-container" style="position:relative;display:inline-block;width:' + (width + stackCount * stackOffset + 20) + 'px;height:' + (Math.round(width * 1.4) + stackCount * stackOffset + 10) + 'px;padding-left:' + (stackCount * stackOffset) + 'px">' +
      stackHtml +
      '<div class="mtg-card' + tapped + tokenCls + '" data-card-id="' + card.id + '" data-zone="battlefield" data-player="' + playerKey + '" data-color="' + getCardColorClass(card) + '" data-has-stack="' + (stackCount > 0 ? 'true' : 'false') + '" style="width:' + width + 'px;border:none;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4);position:relative;z-index:' + (stackCount + 1) + '" draggable="' + isMy + '">' +
        renderCardInnerHtml(card, isCardFlipped) + dmg + extraBadges + stackBadge +
      '</div>' +
    '</div>';
  }

  function creaturesRow() {
    var h = '<div class="bf-row bf-creatures">';
    if (groups.creatures.length) {
      h += groups.creatures.map(function(card) {
        var isCardFlipped = flippedSet.has(card.id);
        return renderCardWithStack(card, isCardFlipped, 110, renderCounterBadges(card) + renderLoyaltyBadge(card, isCardFlipped));
      }).join('');
    } else {
      h += '<div class="bf-empty">creatures</div>';
    }
    h += '</div>';
    return h;
  }

  function bottomRow() {
    var h = '<div class="bf-bottom-row">';
    h += '<div class="bf-row bf-lands">';
    if (groups.lands.length) {
      h += groups.lands.map(function(card) {
        var isCardFlipped = flippedSet.has(card.id);
        return renderCardWithStack(card, isCardFlipped, 90, renderCounterBadges(card) + renderLoyaltyBadge(card, isCardFlipped));
      }).join('');
    } else {
      h += '<div class="bf-empty">lands</div>';
    }
    h += '</div>';
    h += '<div class="bf-row bf-others">';
    if (groups.others.length) {
      h += groups.others.map(function(card) {
        var isCardFlipped = flippedSet.has(card.id);
        return renderCardWithStack(card, isCardFlipped, 100, renderCounterBadges(card) + renderLoyaltyBadge(card, isCardFlipped));
      }).join('');
    } else {
      h += '<div class="bf-empty">other</div>';
    }
    h += '</div>';
    h += '</div>';
    return h;
  }

  var html = '<div class="bf-layout">';
  if (flipped) {
    // Opponent side: lands+others on top, creatures on bottom (mirror of my side)
    html += bottomRow();
    html += creaturesRow();
  } else {
    // My side: creatures on top, lands+others on bottom
    html += creaturesRow();
    html += bottomRow();
  }
  html += '</div>';
  return html;
}

// ============================================================
// Graveyard/Exile compact overlay
// ============================================================
function renderZoneOverlay(zone, cards, playerKey, battleId) {
  cards = cards || [];
  var count = cards.length;
  var topCard = count > 0 ? cards[count - 1] : null;
  var zoneId = playerKey + '-' + zone;
  var isMy = playerKey === battleLocalUI.myKey;
  var zoneLabel = zone === 'graveyard' ? 'GY' : zone === 'exile' ? 'EX' : 'OG';

  var cardHtml = '';
  if (topCard) {
    cardHtml = '<div class="mtg-card" data-card-id="' + topCard.id + '" data-zone="' + zone + '" data-player="' + playerKey + '" data-color="' + getCardColorClass(topCard) + '" style="width:56px;border:none;border-radius:3px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:' + (isMy ? 'grab' : 'pointer') + '" draggable="' + isMy + '">' +
      renderCardInnerHtml(topCard) + '</div>';
  }

  return '<div class="zone-overlay" id="' + zoneId + '" onclick="openZoneModal(\'' + zone + '\', \'' + playerKey + '\', ' + battleId + ')">' +
    '<div class="zone-overlay-count">' + count + '</div>' +
    '<div class="zone-overlay-label">' + zoneLabel + '</div>' +
    cardHtml +
    '</div>';
}

// Zone modal for graveyard/exile
function openZoneModal(zone, playerKey, battleId) {
  var gs = battleLocalUI.gs;
  if (!gs) return;
  var player = gs.players[playerKey];
  if (!player) return;
  var cards = player[zone] || [];
  var isMy = playerKey === battleLocalUI.myKey;
  var zoneName = zone === 'graveyard' ? 'Graveyard' : zone === 'exile' ? 'Exile' : 'Outside Game';
  var title = (isMy ? 'My ' : 'Opp ') + zoneName + ' (' + cards.length + ')';

  var cardsHtml = '';
  if (cards.length === 0) {
    cardsHtml = '<div style="text-align:center;padding:24px;color:rgba(160,170,195,0.4)">Empty</div>';
  } else {
    cardsHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;padding:12px">';
    cards.forEach(function(card) {
      cardsHtml += '<div class="mtg-card" data-card-id="' + card.id + '" data-zone="' + zone + '" data-player="' + playerKey + '" data-color="' + getCardColorClass(card) + '" style="width:120px;border:none;border-radius:4px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:' + (isMy ? 'grab' : 'default') + '" draggable="' + isMy + '">' +
        renderCardInnerHtml(card) + '</div>';
    });
    cardsHtml += '</div>';
  }

  showModal(title, cardsHtml);

  // Setup drag handlers for cards in modal
  setTimeout(function() {
    var body = document.getElementById('modal-body');
    var overlay = document.getElementById('modal-overlay');
    if (!body || !overlay) return;

    body.querySelectorAll('.mtg-card[draggable="true"]').forEach(function(cardEl) {
      var cardId = cardEl.getAttribute('data-card-id');
      var fromZone = cardEl.getAttribute('data-zone');
      cardEl.addEventListener('dragstart', function(e) {
        window._isDragging = true;
        hideCardPreview();
        e.dataTransfer.setData('text/plain', JSON.stringify({ source: fromZone, cardId: cardId, playerKey: playerKey }));
        e.dataTransfer.effectAllowed = 'move';
        cardEl.classList.add('dragging');
        // Visual hint: show overlay as drop zone
        if (overlay) overlay.classList.add('modal-drag-active');
      });
      cardEl.addEventListener('dragend', function() {
        window._isDragging = false;
        cardEl.classList.remove('dragging');
        if (overlay) overlay.classList.remove('modal-drag-active');
        closeModal();
      });
    });

    // Drop handler on modal overlay: dropping on the overlay (outside the modal box) moves card to battlefield
    overlay.addEventListener('dragover', function(e) {
      if (!window._isDragging) return;
      // Only handle if dropping on the overlay background, not the modal box
      if (e.target === overlay) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    });
    overlay.addEventListener('drop', function(e) {
      if (!window._isDragging) return;
      if (e.target === overlay) {
        e.preventDefault();
        var data = null;
        try { data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch(err) {}
        if (data && data.cardId && data.source && data.playerKey === battleLocalUI.myKey) {
          mtgaAction(battleId, { type: 'move_card', card_id: data.cardId, from_zone: data.source, to_zone: 'battlefield' });
        }
        closeModal();
      }
    });

    // Hover preview for modal cards
    body.querySelectorAll('.mtg-card').forEach(function(cardEl) {
      var cardId = cardEl.getAttribute('data-card-id');
      var card = cards.find(function(c) { return c.id == cardId; });
      if (card) {
        cardEl.addEventListener('mouseenter', function(e) {
          if (window._isDragging) return;
          showCardPreview(card);
          moveCardPreview(e);
        });
        cardEl.addEventListener('mousemove', function(e) {
          if (window._isDragging) return;
          moveCardPreview(e);
        });
        cardEl.addEventListener('mouseleave', hideCardPreview);
      }
    });
  }, 50);
}

// ============================================================
// DFC Flip (Transform) on Battlefield — server-side tracking
// ============================================================
function toggleCardFlip(cardId) {
  if (!battleLocalUI) return;
  var battleId = battleLocalUI.battleId;
  mtgaAction(battleId, { type: 'flip_card', card_id: cardId }).then(function(res) {
    if (res && res.error) showToast('翻面失败: ' + res.error, 'error');
  });
}

// ============================================================
// Main Board Renderer
// ============================================================
// ============================================================
// Post-render: dynamically calculate card overlap to fit rows
// ============================================================
function adjustBattlefieldSpacing(el) {
  var board = el.querySelector('.mtga-board');
  if (!board) return;
  var zonesRows = board.querySelectorAll('.mtga-zones-row');
  zonesRows.forEach(function(zonesRow) {
    var bfZone = zonesRow.querySelector('.mtga-zone-battlefield');
    if (!bfZone) return;
    var containerWidth = bfZone.offsetWidth;
    var rows = bfZone.querySelectorAll('.bf-row');
    rows.forEach(function(row) {
      var containers = row.querySelectorAll('.mtg-card-container');
      if (containers.length <= 1) {
        row.style.setProperty('--compact-ml', '0px');
        return;
      }
      var isLandsRow = row.classList.contains('bf-lands');
      var isOthersRow = row.classList.contains('bf-others');
      var availWidth = (isLandsRow || isOthersRow) ? containerWidth * 0.5 : containerWidth;
      var maxWidth = 0;
      containers.forEach(function(c) {
        var w = c.offsetWidth;
        if (w > maxWidth) maxWidth = w;
      });
      var totalWidth = maxWidth * containers.length;
      if (totalWidth > availWidth) {
        var neededMargin = -Math.ceil((totalWidth - availWidth) / (containers.length - 1));
        row.style.setProperty('--compact-ml', neededMargin + 'px');
      } else {
        row.style.setProperty('--compact-ml', '0px');
      }
    });
  });
}

// Debounced resize handler for battlefield spacing
var _bfResizeTimer = null;
function onBattlefieldResize() {
  if (_bfResizeTimer) clearTimeout(_bfResizeTimer);
  _bfResizeTimer = setTimeout(function() {
    var board = document.querySelector('.mtga-board');
    if (board) adjustBattlefieldSpacing(board.parentElement);
  }, 150);
}

function renderBattleBoard(el, battle, battleId, myKey, oppKey) {
  var gs = battle.game_state;
  var me = gs.players[myKey];
  var opp = gs.players[oppKey];
  var isMyTurn = gs.activePlayer === myKey;

  // Clean up any existing reveal overlay from previous render
  var oldReveal = document.getElementById('opp-reveal-overlay');
  if (oldReveal) oldReveal.remove();

  battleLocalUI.gs = gs;
  battleLocalUI.myKey = myKey;
  battleLocalUI.oppKey = oppKey;
  battleLocalUI.battleId = battleId;

  var turnLabel = isMyTurn ? '\ud83c\udfaf Your Turn' : '\u23f3 Opponent\'s Turn';

  // Build BO3 win banner
  var winBanner = '';
  if (gs.winner) {
    if (gs.matchOver) {
      var p1w = gs.player1_wins || battle.player1_wins || 0;
      var p2w = gs.player2_wins || battle.player2_wins || 0;
      winBanner = '<div class="mtga-win-banner">' +
        (gs.matchWinner === myKey ? '\ud83c\udfc6 Match Win!' : '\ud83d\udc80 Match Loss') +
        '<div style="font-size:0.9rem;margin-top:8px;opacity:0.8">' + p1w + ' - ' + p2w + '</div>' +
        '<button class="btn btn-primary" style="margin-top:12px" onclick="mtgaReturnToEvent(' + battleId + ')">\u2190 返回比赛</button>' +
        '</div>';
    } else {
      var p1w = gs.player1_wins || battle.player1_wins || 0;
      var p2w = gs.player2_wins || battle.player2_wins || 0;
      var gameNum = battle.current_game || 1;
      winBanner = '<div class="mtga-win-banner">' +
        (gs.winner === myKey ? '\ud83c\udf89 Game Win!' : '\ud83d\udc80 Game Loss') +
        '<div style="font-size:0.9rem;margin-top:8px;opacity:0.8">Score: ' + p1w + ' - ' + p2w + ' (Game ' + gameNum + ')</div>' +
        '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px">' +
        '<button class="btn btn-primary" onclick="mtgaNextGame(' + battleId + ')">下一局 \u25b6</button>' +
        '<button class="btn btn-secondary" onclick="mtgaReturnToEvent(' + battleId + ')">\u2190 返回比赛</button>' +
        '</div></div>';
    }
  }

  el.innerHTML =
    '<div class="mtga-board" id="mtga-board">' +
      '<!-- Opponent info -->' +
      '<div class="mtga-info-bar">' +
        '<div class="mtga-player-name">' + escapeHtml(opp?.name || 'Opponent') + '</div>' +
        '<div class="mtga-life-group">' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',-5)" title="-5">-5</button>' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',-2)" title="-2">-2</button>' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',-1)" title="-1">-1</button>' +
          '<div class="mtga-life ' + ((opp?.life || 20) <= 5 ? 'low' : '') + '">' + (opp?.life ?? 20) + '</div>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',1)" title="+1">+1</button>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',2)" title="+2">+2</button>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',5)" title="+5">+5</button>' +
        '</div>' +
        '<div class="mtga-stat">Hand <span class="num">' + (opp?.hand || []).length + '</span></div>' +
        '<div class="mtga-stat" style="margin-left:auto">Library ' + (opp?.library || []).length + '</div>' +
        renderLibraryStack((opp?.library || []).length, 'opp-library') +
      '</div>' +
      '<!-- Opponent battlefield -->' +
      '<div class="mtga-zones-row">' +
        '<div class="mtga-zone mtga-zone-battlefield" data-zone="battlefield" data-player="' + oppKey + '" id="opp-battlefield" style="position:relative">' +
          renderBattlefieldOrganized(opp?.battlefield, oppKey, false, true) +
          '<div class="zone-overlays-opp">' +
            renderZoneOverlay('graveyard', opp?.graveyard, oppKey, battleId) +
            renderZoneOverlay('exile', opp?.exile, oppKey, battleId) +
            renderZoneOverlay('outside_game', opp?.outside_game, oppKey, battleId) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<!-- My battlefield -->' +
      '<div class="mtga-zones-row">' +
        '<div class="mtga-zone mtga-zone-battlefield" data-zone="battlefield" data-player="' + myKey + '" id="my-battlefield" style="position:relative">' +
          renderBattlefieldOrganized(me?.battlefield, myKey, true, false) +
          '<div class="zone-overlays">' +
            renderZoneOverlay('graveyard', me?.graveyard, myKey, battleId) +
            renderZoneOverlay('exile', me?.exile, myKey, battleId) +
            renderZoneOverlay('outside_game', me?.outside_game, myKey, battleId) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<!-- My info -->' +
      '<div class="mtga-info-bar">' +
        '<div class="mtga-player-name">' + escapeHtml(me?.name || state.user?.username || 'Me') + '</div>' +
        '<div class="mtga-life-group">' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'self\',-5)" title="-5">-5</button>' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'self\',-2)" title="-2">-2</button>' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'self\',-1)" title="-1">-1</button>' +
          '<div class="mtga-life ' + ((me?.life || 20) <= 5 ? 'low' : '') + '">' + (me?.life ?? 20) + '</div>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'self\',1)" title="+1">+1</button>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'self\',2)" title="+2">+2</button>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'self\',5)" title="+5">+5</button>' +
        '</div>' +
        '<div class="mtga-stat" style="margin-left:auto">Library ' + (me?.library || []).length + '</div>' +
        renderLibraryStack((me?.library || []).length, 'my-library') +
      '</div>' +
      '<!-- My hand -->' +
      '<div class="mtga-hand" data-zone="hand" data-player="' + myKey + '" id="my-hand">' +
        '<div class="mtga-zone-label" style="top:6px;left:14px">My Hand \xb7 ' + (me?.hand || []).length + '</div>' +
        '<div class="mtga-hand-inner">' + renderHandCards(me?.hand || []) + '</div>' +
      '</div>' +
    '</div>' +
    winBanner +
    renderActionBar(battleId, gs, myKey, battle);

  // Render revealed cards (if opponent is showing cards to us)
  var revealed = gs.revealed_cards || {};
  var oppRevealed = revealed[oppKey] || [];
  var myRevealed = revealed[myKey] || [];
  if (oppRevealed.length > 0) {
    // Show a prominent centered modal for opponent's revealed cards
    var revealOverlay = document.createElement('div');
    revealOverlay.id = 'opp-reveal-overlay';
    revealOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9995;display:flex;align-items:center;justify-content:center';
    var revealModal = document.createElement('div');
    revealModal.style.cssText = 'background:var(--bg-card);border:2px solid var(--accent);border-radius:12px;padding:20px;max-width:800px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.7)';
    var revealTitle = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">' +
      '<h3 style="margin:0;font-size:1.1rem;color:var(--accent)">对手向你展示了 ' + oppRevealed.length + ' 张牌</h3>' +
      '<span style="font-size:0.8rem;color:var(--text-muted)">' + (opp ? escapeHtml(opp.name) : '对手') + ' 的牌库顶</span></div>';
    var revealCards = '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">';
    oppRevealed.forEach(function(card) {
      var imgSrc = card.image_small || card.image;
      if (imgSrc) {
        revealCards += '<div style="width:100px;flex-shrink:0;cursor:pointer" onmouseenter="showCardPreview(' + JSON.stringify(card).replace(/"/g, '&quot;') + ', event)" onmousemove="moveCardPreview(event)" onmouseleave="hideCardPreview()">' +
          '<img src="' + escapeHtml(imgSrc) + '" style="width:100%;border-radius:4px;border:1px solid rgba(255,255,255,0.15);box-shadow:0 2px 8px rgba(0,0,0,0.4)">' +
          '<div style="font-size:0.65rem;color:var(--text-muted);text-align:center;margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + escapeHtml(card.name || '') + '</div></div>';
      } else {
        revealCards += '<div style="width:100px;height:140px;background:var(--bg-darkest);border-radius:4px;border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:var(--text-muted);text-align:center;padding:4px">' + escapeHtml(card.name || 'Unknown') + '</div>';
      }
    });
    revealCards += '</div>';
    revealModal.innerHTML = revealTitle + revealCards;
    revealOverlay.appendChild(revealModal);
    document.body.appendChild(revealOverlay);
  }
  if (myRevealed.length > 0 && !_deckPreviewIsPublic) {
    // My cards are being revealed (public mode from my side) - show a badge
    var myRevealBadge = document.createElement('div');
    myRevealBadge.style.cssText = 'position:fixed;top:80px;left:16px;background:var(--bg-card);border:2px solid var(--accent);border-radius:8px;padding:8px 12px;z-index:9990;font-size:0.8rem;color:var(--accent)';
    myRevealBadge.innerHTML = '\u{1F441} 正在展示 ' + myRevealed.length + ' 张牌';
    el.appendChild(myRevealBadge);
  }

  setTimeout(function() { adjustBattlefieldSpacing(el); }, 200);
  setTimeout(function() { adjustBattlefieldSpacing(el); }, 800);
  setupBoardHandlers(el, battleId, myKey, oppKey, gs, me, opp, battle);
}

// ============================================================
// Board Interaction Handlers
// ============================================================
function setupBoardHandlers(el, battleId, myKey, oppKey, gs, me, opp, battle) {
  var allCards = (me?.battlefield || []).concat(opp?.battlefield || []).concat(me?.hand || []).concat(me?.graveyard || []).concat(me?.exile || []).concat(me?.outside_game || []).concat(opp?.graveyard || []).concat(opp?.exile || []).concat(opp?.outside_game || []);

  // Right-click on library stack to preview deck
  var myLibraryEl = el.querySelector('#my-library');
  if (myLibraryEl) {
    myLibraryEl.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showDeckPreviewMenu(e, gs, myKey, battleId);
    });
  }

  // Card hover preview for all cards on board
  el.querySelectorAll('.mtg-card').forEach(function(cardEl) {
    var cardId = cardEl.getAttribute('data-card-id');
    var card = allCards.find(function(c) { return c.id == cardId; });
    if (card) {
      cardEl.addEventListener('mouseenter', function(e) {
        if (window._isDragging) return;
        showCardPreview(card);
        moveCardPreview(e);
      });
      cardEl.addEventListener('mousemove', function(e) {
        if (window._isDragging) return;
        moveCardPreview(e);
      });
      cardEl.addEventListener('mouseleave', hideCardPreview);
    }
  });

  // Universal card drag (includes stacked cards)
  el.querySelectorAll('.mtg-card[draggable="true"], .mtg-card-stacked[draggable="true"]').forEach(function(cardEl) {
    var cardId = cardEl.getAttribute('data-card-id');
    var fromZone = cardEl.getAttribute('data-zone');
    var fromPlayer = cardEl.getAttribute('data-player');
    if (!cardId || !fromZone) return;

    cardEl.addEventListener('dragstart', function(e) {
      window._isDragging = true;
      hideCardPreview();
      // Check if this card is in a stack
      var isInStack = cardEl.getAttribute('data-stack-card') === 'true';
      var dragData = { source: fromZone, cardId: cardId, playerKey: fromPlayer || myKey, isStackCard: isInStack };
      e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
      e.dataTransfer.effectAllowed = 'move';
      cardEl.classList.add('dragging');
    });
    cardEl.addEventListener('dragend', function() {
      window._isDragging = false;
      cardEl.classList.remove('dragging');
      el.querySelectorAll('.drop-target').forEach(function(z) { z.classList.remove('drop-target'); });
    });
  });

  // Battlefield cards as drop targets for stacking
  el.querySelectorAll('.mtg-card[data-zone="battlefield"]').forEach(function(cardEl) {
    var targetCardId = cardEl.getAttribute('data-card-id');
    var targetPlayer = cardEl.getAttribute('data-player');
    if (!targetCardId || targetPlayer !== myKey) return;

    cardEl.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      cardEl.classList.add('stack-drop-target');
    });
    cardEl.addEventListener('dragleave', function(e) {
      cardEl.classList.remove('stack-drop-target');
    });
    cardEl.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      cardEl.classList.remove('stack-drop-target');
      var data = null;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch(err) {}
      if (!data || !data.cardId || !data.source) return;
      if (data.cardId === targetCardId) return; // Can't stack on self
      if (data.playerKey !== myKey) return;

      if (data.isStackCard) {
        // Unstack first, then stack on target
        mtgaAction(battleId, { type: 'unstack_card', card_id: data.cardId, target_zone: 'battlefield' })
          .then(function() {
            return mtgaAction(battleId, { type: 'stack_card', card_id: data.cardId, target_card_id: targetCardId });
          });
      } else if (data.source === 'battlefield') {
        // Stack battlefield card onto another battlefield card
        mtgaAction(battleId, { type: 'stack_card', card_id: data.cardId, target_card_id: targetCardId });
      }
    });
  });

  // Drop targets: my zones
  var myZones = [
    { el: el.querySelector('#my-battlefield'), zone: 'battlefield' },
    { el: el.querySelector('#my-hand'), zone: 'hand' },
    { el: el.querySelector('#my-library'), zone: 'library' }
  ];

  myZones.forEach(function(item) {
    var zoneEl = item.el;
    var zone = item.zone;
    if (!zoneEl) return;
    zoneEl.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; zoneEl.classList.add('drop-target'); });
    zoneEl.addEventListener('dragleave', function(e) { if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove('drop-target'); });
    zoneEl.addEventListener('drop', function(e) {
      e.preventDefault();
      zoneEl.classList.remove('drop-target');
      var data = null;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch(err) {}
      if (!data || !data.source) return;
      if (data.source === 'deck_preview' && data.card && data.playerKey === myKey) {
        // Card dragged from deck preview - play it to this zone
        mtgaAction(battleId, { type: 'play_from_deck', card_name: data.card.name, deck_zone: data.deck_zone, deck_idx: data.deck_idx, to_zone: zone })
          .then(function() {
            if (data.card_id) {
              _deckPreviewOrder = _deckPreviewOrder.filter(function(id) { return id !== data.card_id; });
              delete _deckPreviewCards['card_' + data.card_id];
              renderPreviewCards();
              if (_deckPreviewOrder.length === 0) closeDeckPreview();
            }
          });
      } else if (data.isStackCard && data.source === 'battlefield' && data.playerKey === myKey) {
        // Stacked card dropped on a zone - unstack it to that zone
        mtgaAction(battleId, { type: 'unstack_card', card_id: data.cardId, target_zone: zone });
      } else if (data.cardId && data.source !== zone && data.playerKey === myKey) {
        mtgaAction(battleId, { type: 'move_card', card_id: data.cardId, from_zone: data.source, to_zone: zone });
      }
    });
  });

  // Graveyard & Exile & Outside Game overlays as drop targets
  var overlayZones = [
    { el: el.querySelector('#' + myKey + '-graveyard'), zone: 'graveyard' },
    { el: el.querySelector('#' + myKey + '-exile'), zone: 'exile' },
    { el: el.querySelector('#' + myKey + '-outside_game'), zone: 'outside_game' }
  ];

  overlayZones.forEach(function(item) {
    var zoneEl = item.el;
    var zone = item.zone;
    if (!zoneEl) return;
    zoneEl.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      zoneEl.classList.add('drop-target');
    });
    zoneEl.addEventListener('dragleave', function(e) {
      if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove('drop-target');
    });
    zoneEl.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.remove('drop-target');
      var data = null;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch(err) {}
      if (!data || !data.source) return;
      if (data.source === 'deck_preview' && data.card && data.playerKey === myKey) {
        mtgaAction(battleId, { type: 'play_from_deck', card_name: data.card.name, deck_zone: data.deck_zone, deck_idx: data.deck_idx, to_zone: zone })
          .then(function() {
            if (data.card_id) {
              _deckPreviewOrder = _deckPreviewOrder.filter(function(id) { return id !== data.card_id; });
              delete _deckPreviewCards['card_' + data.card_id];
              renderPreviewCards();
              if (_deckPreviewOrder.length === 0) closeDeckPreview();
            }
          });
      } else if (data.isStackCard && data.source === 'battlefield' && data.playerKey === myKey) {
        mtgaAction(battleId, { type: 'unstack_card', card_id: data.cardId, target_zone: zone });
      } else if (data.cardId && data.source !== zone && data.playerKey === myKey) {
        mtgaAction(battleId, { type: 'move_card', card_id: data.cardId, from_zone: data.source, to_zone: zone });
      }
    });
  });

  // Opponent zones as drop targets for control transfer
  var oppDropZones = [
    { el: el.querySelector('#opp-battlefield'), zone: 'battlefield' },
    { el: el.querySelector('#' + oppKey + '-graveyard'), zone: 'graveyard' },
    { el: el.querySelector('#' + oppKey + '-exile'), zone: 'exile' },
    { el: el.querySelector('#' + oppKey + '-outside_game'), zone: 'outside_game' }
  ];

  oppDropZones.forEach(function(item) {
    var zoneEl = item.el;
    var zone = item.zone;
    if (!zoneEl) return;
    zoneEl.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      zoneEl.classList.add('drop-target');
      zoneEl.classList.add('opp-drop-target');
    });
    zoneEl.addEventListener('dragleave', function(e) {
      if (!zoneEl.contains(e.relatedTarget)) {
        zoneEl.classList.remove('drop-target');
        zoneEl.classList.remove('opp-drop-target');
      }
    });
    zoneEl.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.remove('drop-target');
      zoneEl.classList.remove('opp-drop-target');
      var data = null;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch(err) {}
      if (!data || !data.source || !data.cardId) return;
      // Only allow transferring my cards to opponent's zones
      if (data.playerKey !== myKey) return;
      // Stacked cards: unstack first, then transfer
      if (data.isStackCard && data.source === 'battlefield') {
        // Unstack to battlefield first, then transfer
        mtgaAction(battleId, { type: 'unstack_card', card_id: data.cardId, target_zone: 'battlefield' })
          .then(function() {
            return mtgaAction(battleId, { type: 'transfer_control', card_id: data.cardId, from_zone: 'battlefield', to_zone: zone });
          });
      } else {
        mtgaAction(battleId, { type: 'transfer_control', card_id: data.cardId, from_zone: data.source, to_zone: zone });
      }
    });
  });

  // Library click to draw
  var libraryEl = el.querySelector('#my-library');
  if (libraryEl) {
    libraryEl.style.cursor = 'pointer';
    libraryEl.title = 'Click to draw';
    libraryEl.addEventListener('click', function() { mtgaAction(battleId, { type: 'draw_card' }); });
  }

  // Battlefield card click to tap/untap (only my cards)
  el.querySelectorAll('#my-battlefield .mtg-card[data-card-id]').forEach(function(cardEl) {
    var cardId = cardEl.getAttribute('data-card-id');
    var card = (me.battlefield || []).find(function(c) { return c.id == cardId; });
    if (!card) return;
    cardEl.style.cursor = 'pointer';
    cardEl.title = card.tapped ? 'Click to untap' : 'Click to tap';
    cardEl.addEventListener('click', function(e) {
      // Don't toggle if we're dragging
      if (e.defaultPrevented) return;
      if (card.tapped) mtgaAction(battleId, { type: 'untap_card', card_id: cardId });
      else mtgaAction(battleId, { type: 'tap_card', card_id: cardId });
    });
  });

  // Right-click context menu for counters on all battlefield cards (including stacked)
  el.querySelectorAll('.mtg-card[data-zone="battlefield"][data-card-id], .mtg-card-stacked[data-zone="battlefield"][data-card-id]').forEach(function(cardEl) {
    var cardId = cardEl.getAttribute('data-card-id');
    var playerKey = cardEl.getAttribute('data-player');
    var player = gs.players[playerKey];
    if (!player) return;
    // Search in main battlefield first, then in stacked_cards
    var card = (player.battlefield || []).find(function(c) { return c.id == cardId; });
    if (!card) {
      for (var i = 0; i < (player.battlefield || []).length; i++) {
        var host = player.battlefield[i];
        if (!Array.isArray(host.stacked_cards)) continue;
        card = host.stacked_cards.find(function(c) { return c.id == cardId; });
        if (card) break;
      }
    }
    if (!card) return;
    cardEl.addEventListener('contextmenu', function(e) {
      showContextMenu(e, cardId, card, playerKey, battleId);
    });
  });

  // Click to expand stacked cards (local view only)
  el.querySelectorAll('.mtg-card-container').forEach(function(container) {
    var stackedCards = container.querySelectorAll('.mtg-card-stacked');
    if (stackedCards.length === 0) return;
    container.style.cursor = 'pointer';
    container.addEventListener('click', function(e) {
      // Don't toggle if clicking on a specific card for drag or context menu
      if (e.target.closest('.mtg-card-stacked') || e.target.closest('.mtg-card')) {
        // Only expand if not dragging
        if (window._isDragging) return;
      }
      var isExpanded = container.classList.contains('stack-expanded');
      // First, collapse ALL expanded containers on the board
      el.querySelectorAll('.mtg-card-container.stack-expanded').forEach(function(c) {
        c.classList.remove('stack-expanded');
        var stackOffset = 6;
        c.querySelectorAll('.mtg-card-stacked').forEach(function(sc, idx) {
          var offset = (idx + 1) * stackOffset;
          sc.style.position = 'absolute';
          sc.style.top = offset + 'px';
          sc.style.left = '-' + offset + 'px';
          sc.style.opacity = '0.7';
          sc.style.transform = '';
          sc.style.zIndex = String(idx);
          sc.style.boxShadow = '';
        });
      });
      if (!isExpanded) {
        // Expand: spread stacked cards horizontally to the left, same row
        container.classList.add('stack-expanded');
        var cardEl = container.querySelector('.mtg-card');
        var cardW = cardEl ? cardEl.offsetWidth : 110;
        stackedCards.forEach(function(sc, idx) {
          sc.style.position = 'absolute';
          sc.style.top = '0';
          sc.style.left = '-' + ((idx + 1) * cardW + (idx + 1) * 8) + 'px';
          sc.style.opacity = '1';
          sc.style.transform = '';
          sc.style.zIndex = String(100 + idx);
          sc.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
        });
      }
    });
  });

  // Right-click on empty battlefield area to create tokens
  var myBf = el.querySelector('#my-battlefield');
  console.log('[bf-ctx] attaching to #my-battlefield, found:', !!myBf);
  if (myBf) {
    myBf.addEventListener('contextmenu', function(e) {
      console.log('[bf-ctx] right-click, target:', e.target.className || e.target.tagName, 'isCard:', !!e.target.closest('.mtg-card'));
      // Only trigger if clicking on the zone itself, not on a card
      if (e.target.closest('.mtg-card')) return;
      showBattlefieldContextMenu(e, myKey, battleId);
    });
  }

  // ============================================================
  // MOBILE TOUCH INTERACTION SYSTEM
  // ============================================================
  var isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouchDevice) return;

  // State for touch-based card selection
  window._touchSelectedCard = null; // { cardId, fromZone, playerKey, isStackCard, element }
  window._touchLongPressTimer = null;
  window._touchMoved = false;
  window._touchStartPos = { x: 0, y: 0 };

  function getZoneName(zone) {
    var names = { battlefield: '战场', hand: '手牌', library: '牌库', graveyard: '坟场', exile: '放逐区', outside_game: '游戏外' };
    return names[zone] || zone;
  }

  function showTouchSelectionBar(card, fromZone) {
    var existing = document.getElementById('touch-selection-bar');
    if (existing) existing.remove();
    var bar = document.createElement('div');
    bar.id = 'touch-selection-bar';
    bar.innerHTML = '<span class="tsb-card">' + (card.name || '卡牌') + '</span>' +
      '<span class="tsb-from">来源: ' + fromZone + '</span>' +
      '<button class="tsb-cancel" onclick="clearTouchSelection()">取消</button>';
    document.body.appendChild(bar);
  }

  // 1. Touch preview on all cards (tap to preview)
  el.querySelectorAll('.mtg-card').forEach(function(cardEl) {
    var cardId = cardEl.getAttribute('data-card-id');
    var card = allCards.find(function(c) { return c.id == cardId; });
    if (!card) return;

    var tapTimer = null;
    var longPressFired = false;

    cardEl.addEventListener('touchstart', function(e) {
      longPressFired = false;
      window._touchMoved = false;
      var touch = e.touches[0];
      window._touchStartPos = { x: touch.clientX, y: touch.clientY };

      // Long-press timer (500ms) for context menu / selection
      tapTimer = setTimeout(function() {
        if (window._touchMoved) return;
        longPressFired = true;
        e.preventDefault();

        var fromZone = cardEl.getAttribute('data-zone');
        var fromPlayer = cardEl.getAttribute('data-player');
        var isStackCard = cardEl.getAttribute('data-stack-card') === 'true';

        // If it's a battlefield card with counters, show context menu
        if (fromZone === 'battlefield' && fromPlayer === myKey) {
          // Create a synthetic event for positioning
          var synthEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: function(){}, stopPropagation: function(){} };
          showContextMenu(synthEvent, cardId, card, fromPlayer, battleId);
          return;
        }

        // For other cards: select for moving
        window.clearTouchSelection();
        window._touchSelectedCard = { cardId: cardId, fromZone: fromZone, playerKey: fromPlayer || myKey, isStackCard: isStackCard, element: cardEl, card: card };
        cardEl.classList.add('touch-selected');
        showTouchSelectionBar(card, getZoneName(fromZone));
        // Highlight drop zones
        highlightTouchDropZones(el, myKey, oppKey, fromZone);
      }, 500);
    }, { passive: false });

    cardEl.addEventListener('touchmove', function(e) {
      var touch = e.touches[0];
      var dx = Math.abs(touch.clientX - window._touchStartPos.x);
      var dy = Math.abs(touch.clientY - window._touchStartPos.y);
      if (dx > 10 || dy > 10) {
        window._touchMoved = true;
        if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      }
    });

    cardEl.addEventListener('touchend', function(e) {
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      if (longPressFired) { e.preventDefault(); return; }
      if (window._touchMoved) return;

      // Short tap = preview
      e.preventDefault();
      showCardPreviewTouch(card);
    });
  });

  // 2. Touch handlers for zone drop targets (receive selected card on tap)
  var touchZoneTargets = [
    { el: el.querySelector('#my-battlefield'), zone: 'battlefield', type: 'my' },
    { el: el.querySelector('#my-hand'), zone: 'hand', type: 'my' },
    { el: el.querySelector('#my-library'), zone: 'library', type: 'my' },
    { el: el.querySelector('#' + myKey + '-graveyard'), zone: 'graveyard', type: 'my' },
    { el: el.querySelector('#' + myKey + '-exile'), zone: 'exile', type: 'my' },
    { el: el.querySelector('#' + myKey + '-outside_game'), zone: 'outside_game', type: 'my' },
    { el: el.querySelector('#opp-battlefield'), zone: 'battlefield', type: 'opp' },
    { el: el.querySelector('#' + oppKey + '-graveyard'), zone: 'graveyard', type: 'opp' },
    { el: el.querySelector('#' + oppKey + '-exile'), zone: 'exile', type: 'opp' },
    { el: el.querySelector('#' + oppKey + '-outside_game'), zone: 'outside_game', type: 'opp' }
  ];

  touchZoneTargets.forEach(function(item) {
    if (!item.el) return;
    item.el.addEventListener('touchend', function(e) {
      if (!window._touchSelectedCard) return;
      e.preventDefault();
      var sel = window._touchSelectedCard;
      if (item.type === 'opp') {
        // Transfer control to opponent zone
        if (sel.isStackCard && sel.fromZone === 'battlefield') {
          mtgaAction(battleId, { type: 'unstack_card', card_id: sel.cardId, target_zone: 'battlefield' })
            .then(function() {
              return mtgaAction(battleId, { type: 'transfer_control', card_id: sel.cardId, from_zone: 'battlefield', to_zone: item.zone });
            });
        } else {
          mtgaAction(battleId, { type: 'transfer_control', card_id: sel.cardId, from_zone: sel.fromZone, to_zone: item.zone });
        }
      } else if (sel.fromZone !== item.zone) {
        // Move card to my zone
        if (sel.isStackCard && sel.fromZone === 'battlefield') {
          mtgaAction(battleId, { type: 'unstack_card', card_id: sel.cardId, target_zone: item.zone });
        } else {
          mtgaAction(battleId, { type: 'move_card', card_id: sel.cardId, from_zone: sel.fromZone, to_zone: item.zone });
        }
      }
      window.clearTouchSelection();
    });
  });

  // 3. Long-press on library stack for deck preview
  var myLibEl = el.querySelector('#my-library');
  if (myLibEl) {
    var libTimer = null;
    var libLongPress = false;
    myLibEl.addEventListener('touchstart', function(e) {
      libLongPress = false;
      var touch = e.touches[0];
      libTimer = setTimeout(function() {
        libLongPress = true;
        e.preventDefault();
        var synthEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: function(){}, stopPropagation: function(){} };
        showDeckPreviewMenu(synthEvent, gs, myKey, battleId);
      }, 500);
    }, { passive: false });
    myLibEl.addEventListener('touchmove', function() {
      if (libTimer) { clearTimeout(libTimer); libTimer = null; }
    });
    myLibEl.addEventListener('touchend', function(e) {
      if (libTimer) { clearTimeout(libTimer); libTimer = null; }
      if (libLongPress) e.preventDefault();
    });
  }

  // 4. Long-press on empty battlefield area for token creation
  var myBfTouch = el.querySelector('#my-battlefield');
  if (myBfTouch) {
    var bfTimer = null;
    var bfLongPress = false;
    myBfTouch.addEventListener('touchstart', function(e) {
      if (e.target.closest('.mtg-card')) return;
      bfLongPress = false;
      var touch = e.touches[0];
      bfTimer = setTimeout(function() {
        bfLongPress = true;
        e.preventDefault();
        var synthEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: function(){}, stopPropagation: function(){} };
        showBattlefieldContextMenu(synthEvent, myKey, battleId);
      }, 500);
    }, { passive: false });
    myBfTouch.addEventListener('touchmove', function() {
      if (bfTimer) { clearTimeout(bfTimer); bfTimer = null; }
    });
    myBfTouch.addEventListener('touchend', function(e) {
      if (bfTimer) { clearTimeout(bfTimer); bfTimer = null; }
      if (bfLongPress) e.preventDefault();
    });
  }

  // 5. Tap anywhere else to cancel selection
  document.addEventListener('touchend', function(e) {
    if (!window._touchSelectedCard) return;
    if (e.target.closest('.mtg-card') || e.target.closest('#touch-selection-bar') ||
        e.target.closest('[data-zone]') || e.target.closest('.zone-overlay')) return;
    window.clearTouchSelection();
  });

  function highlightTouchDropZones(el, myKey, oppKey, fromZone) {
    // Highlight valid drop zones
    var zones = el.querySelectorAll('[data-zone]');
    zones.forEach(function(z) {
      var zoneName = z.getAttribute('data-zone');
      var zonePlayer = z.getAttribute('data-player');
      // Don't highlight same zone for same player
      if (zonePlayer === myKey && zoneName === fromZone) return;
      z.classList.add('touch-drop-hint');
    });
    // Also highlight overlay zones
    el.querySelectorAll('.zone-overlay').forEach(function(z) {
      z.classList.add('touch-drop-hint');
    });
  }
}

// Touch preview modal (centered, full-size on mobile)
function showCardPreviewTouch(card) {
  hideCardPreview();
  var overlay = document.createElement('div');
  overlay.id = 'card-preview-popup';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  var inner = '';
  if (card.image) {
    inner += '<img src="' + card.image + '" style="max-width:85vw;max-height:80vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.6)">';
    if (card.image_back) {
      inner += '<img src="' + card.image_back + '" style="max-width:85vw;max-height:80vh;border-radius:8px;margin-left:8px;box-shadow:0 4px 20px rgba(0,0,0,0.6)">';
    }
  } else {
    inner = '<div style="background:#1c2440;padding:20px;border-radius:8px;max-width:85vw;color:#ccc;font-size:0.9rem">' +
      '<div style="font-weight:700;color:#d4a043;margin-bottom:8px">' + (card.name || '') + '</div>' +
      '<div style="margin-bottom:4px">' + (card.type || '') + '</div>' +
      '<div style="margin-bottom:4px">' + (card.manaCost || '') + '</div>' +
      '<div>' + (card.text || '') + '</div></div>';
  }
  overlay.innerHTML = inner;
  overlay.addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('touchend', function(e) { e.preventDefault(); overlay.remove(); });
  document.body.appendChild(overlay);
}

// Make clearTouchSelection globally accessible
window.clearTouchSelection = function() {
  window._touchSelectedCard = null;
  document.querySelectorAll('.touch-selected').forEach(function(c) { c.classList.remove('touch-selected'); });
  document.querySelectorAll('.touch-drop-hint').forEach(function(c) { c.classList.remove('touch-drop-hint'); });
  var indicator = document.getElementById('touch-selection-bar');
  if (indicator) indicator.remove();
};

// ============================================================
// MTGA Actions - with immediate local re-render (fixes real-time bug)
// ============================================================
var _battleRefreshing = false;

async function mtgaAction(battleId, action) {
  console.log('[mtgaAction]', action.type, 'refreshing:', _battleRefreshing, 'battleId:', battleId);
  if (_battleRefreshing) return Promise.resolve(null);
  _battleRefreshing = true;
  try {
    var result = await api('/api/battles/' + battleId + '/action', { method: 'POST', body: JSON.stringify(action) });
    // IMMEDIATE RE-RENDER using the response (fixes real-time bug)
    if (result && result.game_state) {
      var battle = { game_state: result.game_state, player1_id: battleLocalUI.p1Id, player2_id: battleLocalUI.p2Id, name: battleLocalUI.battleName };
      mtgaRenderBoard(battleId, battle);
    }
    return result;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  } finally {
    _battleRefreshing = false;
  }
}

function mtgaRenderBoard(battleId, battle) {
  var contentEl = document.getElementById('content');
  if (!contentEl) return;
  var myKey = battleLocalUI.myKey;
  var oppKey = battleLocalUI.oppKey;
  renderBattleBoard(contentEl, battle, battleId, myKey, oppKey);
}

function mtgaQuickLife(battleId, target, amount) {
  mtgaAction(battleId, { type: 'adjust_life', amount: amount, target: target });
}

function mtgaAdjustLife(battleId, target, currentLife) {
  var amount = prompt('Adjust life (e.g. +5 or -3):', '0');
  if (amount === null) return;
  var n = parseInt(amount);
  if (isNaN(n) || n === 0) return;
  mtgaAction(battleId, { type: 'adjust_life', amount: n, target: target });
}

function mtgaLoyaltyAdjust(cardId, amount) {
  console.log('[loyalty] click:', cardId, amount, 'battleId:', currentBattleId);
  if (!currentBattleId) { console.warn('[loyalty] no currentBattleId!'); return; }
  mtgaAction(currentBattleId, { type: 'adjust_loyalty', card_id: cardId, amount: amount });
}

function mtgaRefreshBoard(battleId) {
  var el = document.getElementById('content');
  if (!el) return;
  api('/api/battles/' + battleId).then(function(battle) {
    var myKey = String(battle.player1_id) === String(state.user?.id) ? 'p1' : 'p2';
    var oppKey = myKey === 'p1' ? 'p2' : 'p1';
    battleLocalUI.myKey = myKey;
    battleLocalUI.oppKey = oppKey;
    renderBattleBoard(el, battle, battleId, myKey, oppKey);
  }).catch(function() {});
}

function mtgaLeaveBattle(battleId) {
  WS.unsubscribe('battle:' + battleId);
  currentBattleId = null;
  // On standalone battle.html page, redirect to main page; otherwise use SPA navigation
  if (document.getElementById('battle-root')) {
    window.location.href = '/';
  } else {
    navigate('battles');
  }
}

async function mtgaReturnToEvent(battleId) {
  try {
    var battle = await api('/api/battles/' + battleId);
    var eventId = battle.event_id;
    WS.unsubscribe('battle:' + battleId);
    currentBattleId = null;
    if (eventId) {
      if (document.getElementById('battle-root')) {
        window.location.href = '/events/' + eventId;
      } else {
        navigate('event-detail', { id: eventId });
      }
    } else {
      mtgaLeaveBattle(battleId);
    }
  } catch(err) {
    mtgaLeaveBattle(battleId);
  }
}

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Battle-only mode: skip main app initialization
  if (document.getElementById('battle-root')) {
    return; // battle.html handles its own init via initBattle()
  }

  // Set up navigation click handlers
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.getAttribute('data-page');
      if (page) navigate(page);
    });
  });

  // Set up logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  // 解析 URL 决定初始页面(刷新保持当前页)
  const initialRoute = pathToRoute(window.location.pathname);

  // Check cookie-based authentication via GET /api/auth/me
  try {
    const data = await api('/api/auth/me');
    state.token = data.token;
    state.user = data.user;
    if (typeof API !== 'undefined' && API.setToken) API.setToken(data.token);
    if (typeof WS !== 'undefined' && WS.connect) WS.connect();
    const navEl = document.getElementById('nav-username');
    if (navEl) navEl.textContent = data.user.username;
    if (initialRoute) {
      navigate(initialRoute.page, initialRoute.params, { replace: true });
    } else {
      navigate('dashboard', {}, { replace: true });
    }
  } catch (err) {
    // 未登录 —— 保存目标页,登录后跳转
    if (initialRoute && initialRoute.page !== 'login') {
      saveIntendedRoute(initialRoute.page, initialRoute.params);
    }
    navigate('login', {}, { replace: true });
  }
});
