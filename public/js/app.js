// ========== STATE ==========
const state = {
  token: null,
  user: null,
  currentPage: 'dashboard',
  pageData: {}
};

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

// ========== NAVIGATION ==========
function navigate(page, params = {}, opts = {}) {
  state.currentPage = page;
  state.pageData = params;

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
      case 'decks': renderEvents(content); break;
      case 'deck-builder': renderDeckBuilder(content, params); break;
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
    el.innerHTML = `
      <div class="page-header">
        <h2>我的Cube</h2>
        <div class="flex gap-8">
          <button class="btn btn-secondary" onclick="showImportModal()">快速导入</button>
          <button class="btn btn-primary" onclick="showCreateCubeModal()">新建Cube</button>
        </div>
      </div>
      <div class="card-grid" id="cubes-grid">
        ${cubes.map(cube => `
          <div class="card-item" onclick="navigate('cube-detail', {id:${cube.id}})">
            <h3>${cube.name}</h3>
            <p class="text-muted" style="font-size:0.85rem;margin-bottom:8px">${cube.description || '无描述'}</p>
            <div class="card-meta">
              <span>${cube.card_count} 张牌</span>
              <span>${new Date(cube.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        `).join('') || '<div class="empty-state"><h3>还没有Cube</h3><p>点击"新建Cube"或"快速导入"开始</p></div>'}
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

  if (progressEl) progressEl.classList.remove('hidden');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '获取中...'; }

  try {
    const result = await api('/api/cubes/import', {
      method: 'POST',
      body: JSON.stringify({ data: cardsText, name, description })
    });
    closeModal();
    const stats = result.import_stats;
    if (stats) {
      let msg = `Cube创建成功: ${stats.fetched}/${stats.total}张获取了卡图`;
      if (stats.failed > 0) msg += `\n未找到: ${stats.failed_names.join(', ')}`;
      showToast(msg, stats.failed > 0 ? 'info' : 'success');
    } else {
      showToast('Cube创建成功');
    }
    navigate('cubes');
  } catch (err) {
    showToast(err.message, 'error');
    if (progressEl) progressEl.classList.add('hidden');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; }
  }
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
  if (progressEl) progressEl.classList.remove('hidden');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '获取中...'; }

  try {
    const result = await api('/api/cubes/import', {
      method: 'POST',
      body: JSON.stringify({ data, name: name || undefined, description })
    });
    closeModal();
    const stats = result.import_stats;
    if (stats) {
      let msg = `导入成功: ${stats.fetched}/${stats.total}张牌获取了卡图`;
      if (stats.failed > 0) msg += `\n${stats.failed}张未找到: ${stats.failed_names.join(', ')}`;
      showToast(msg, stats.failed > 0 ? 'info' : 'success');
    } else {
      showToast('Cube导入成功');
    }
    navigate('cubes');
  } catch (err) {
    showToast(err.message, 'error');
    if (progressEl) progressEl.classList.add('hidden');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '导入并获取卡图'; }
  }
}

async function renderCubeDetail(el, id) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    const cube = await api(`/api/cubes/${id}`);
    const groups = groupCardsByColor(cube.cards || []);

    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="navigate('cubes')">← 返回</button>
          <h2>${cube.name}</h2>
          <p class="text-muted">${cube.description || ''}</p>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-secondary" onclick="exportCube(${id})">导出JSON</button>
          <button class="btn btn-danger" onclick="deleteCube(${id})">删除</button>
        </div>
      </div>
      <p class="mb-16 text-muted">共 ${cube.cards.length} 张牌</p>
      <div id="cube-cards-container">
        ${Object.entries(groups).filter(([, cards]) => cards.length > 0).map(([color, cards]) => `
          <div class="color-group">
            <h4>${COLOR_NAMES[color] || color} (${cards.length})</h4>
            <div class="mtg-cards-grid cube-${color}"></div>
          </div>
        `).join('')}
      </div>
      <h3 style="margin:24px 0 12px;color:var(--text-bright)">添加卡牌 (自动从Scryfall获取卡图)</h3>
      <div class="form-group">
        <textarea id="add-cards-text" rows="4" placeholder='每行一张牌名，支持数量前缀:&#10;4 Lightning Bolt&#10;Savannah Lions'></textarea>
      </div>
      <button class="btn btn-primary" onclick="addCardsToCube(${id})">添加到Cube</button>
    `;

    // Render card elements
    setTimeout(() => {
      Object.entries(groups).filter(([, cards]) => cards.length > 0).forEach(([color, cards]) => {
        const gridEl = el.querySelector(`.cube-${color}`);
        if (gridEl) cards.forEach(card => gridEl.appendChild(createCardElement(card)));
      });
    }, 0);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

async function addCardsToCube(cubeId) {
  const text = document.getElementById('add-cards-text').value.trim();
  if (!text) return;

  const btn = event.target;
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '从Scryfall获取中...';

  try {
    const result = await api(`/api/cubes/${cubeId}/add-cards`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    let msg = `已添加 ${result.added} 张牌 (${result.fetched}张获取了卡图)`;
    if (result.failed > 0) msg += `\n${result.failed}张未找到: ${result.failed_names.join(', ')}`;
    showToast(msg, result.failed > 0 ? 'info' : 'success');
    navigate('cube-detail', { id: cubeId });
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = origText;
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
            <span class="badge badge-${ev.status === 'waiting' ? 'waiting' : ev.status === 'in_progress' ? 'progress' : 'completed'}">
              ${ev.status === 'waiting' ? '等待中' : ev.status === 'in_progress' ? '进行中' : '已完成'}
            </span>
            <div class="card-meta">
              <span>${ev.participant_count}/${ev.settings.max_players || '?'}人</span>
              <span>${ev.creator_name}</span>
            </div>
            ${ev.cube_name ? `<div class="text-muted" style="font-size:0.8rem;margin-top:4px">Cube: ${ev.cube_name}</div>` : ''}
          </div>
        `).join('') || '<div class="empty-state"><h3>暂无赛事</h3><p>点击"创建赛事"开始</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

async function showCreateEventModal() {
  try {
    const cubes = await api('/api/cubes');
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
          <label>关联Cube</label>
          <select id="event-cube">
            <option value="">选择Cube</option>
            ${cubes.map(c => `<option value="${c.id}">${c.name} (${c.card_count}张)</option>`).join('')}
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
        <div class="form-group">
          <label>每包卡牌数</label>
          <input type="number" id="event-cards-per-pack" value="15" min="5" max="20">
        </div>
        <div class="form-group" id="cpp-group">
          <label>每次选牌数 (cards_per_pick)</label>
          <input type="number" id="event-cards-per-pick" value="1" min="1" max="5">
          <small class="text-muted" style="display:block;margin-top:4px">轮抓时每次从包中选取的卡牌数量，1为经典模式</small>
        </div>
        <button type="submit" class="btn btn-primary btn-block">创建赛事</button>
      </form>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleCreateEvent(e) {
  e.preventDefault();
  const name = document.getElementById('event-name').value.trim();
  const type = document.getElementById('event-type').value;
  const cube_id = parseInt(document.getElementById('event-cube').value) || null;
  const settings = {
    max_players: parseInt(document.getElementById('event-max-players').value) || 8,
    packs_per_player: parseInt(document.getElementById('event-packs').value) || 3,
    cards_per_pack: parseInt(document.getElementById('event-cards-per-pack').value) || 15,
    cards_per_pick: type === 'draft' ? (parseInt(document.getElementById('event-cards-per-pick').value) || 1) : 1
  };
  if (!cube_id) { showToast('请选择一个Cube', 'error'); return; }
  try {
    const event = await api('/api/events', {
      method: 'POST',
      body: JSON.stringify({ name, type, cube_id, settings })
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
      </div>

      ${event.round_status ? `
        <div style="margin-bottom:16px;padding:12px;background:var(--surface);border-radius:8px">
          <strong style="color:var(--text-bright)">轮次状态:</strong>
          ${event.round_status.picked.length > 0 ? `<span class="text-muted"> 已选: ${event.round_status.picked.map(p => p.username || `座位${p.seat}`).join(', ')}</span>` : ''}
          ${event.round_status.waiting_for.length > 0 ? `<span style="color:var(--warning)"> | 等待: ${event.round_status.waiting_for.map(p => p.username || `座位${p.seat}`).join(', ')}</span>` : ''}
        </div>
      ` : ''}

      ${isParticipant && event.status === 'in_progress' ? `
        <div class="draft-section" style="margin-bottom:24px">
          <h3 style="color:var(--text-bright);margin-bottom:8px">
            ${event.type === 'draft' ? '轮抓选牌' : '牌池'}
            ${myParticipation.pool ? `<span class="text-muted" style="font-size:0.85rem;margin-left:8px">(已收集: ${myParticipation.pool.length}张)</span>` : ''}
          </h3>
          ${isMyTurnToPick ? `
            <div id="draft-pick-area">
              <div id="draft-confirm-bar" class="hidden" style="margin-bottom:12px;padding:12px;background:var(--surface);border-radius:8px;display:flex;align-items:center;gap:12px">
                <span id="draft-selected-count">已选: 0 / ${cardsPerPick}</span>
                <button class="btn btn-primary btn-sm" id="draft-confirm-btn" onclick="confirmDraftPick(${id})" disabled>确认选择</button>
              </div>
              <div id="draft-cards-container" class="mtg-cards-grid"></div>
            </div>
          ` : `
            <div class="empty-state" style="padding:24px">
              <p>${event.status === 'completed' ? '轮抓已结束' : '等待其他玩家选牌...'}</p>
              ${event.status === 'in_progress' ? '<div class="text-muted" style="font-size:0.85rem;margin-top:8px">页面会自动刷新</div>' : ''}
            </div>
          `}
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

    // Render pool cards
    if (isParticipant && myParticipation.pool && myParticipation.pool.length > 0) {
      const poolContainer = el.querySelector('#event-pool-container');
      if (poolContainer) {
        const groups = groupCardsByColor(myParticipation.pool);
        poolContainer.innerHTML = Object.entries(groups).filter(([, cards]) => cards.length > 0).map(([color, cards]) => `
          <div class="color-group">
            <h4>${COLOR_NAMES[color] || color} (${cards.length})</h4>
            <div class="mtg-cards-grid pool-${color}"></div>
          </div>
        `).join('');
        setTimeout(() => {
          Object.entries(groups).filter(([, cards]) => cards.length > 0).forEach(([color, cards]) => {
            const gridEl = poolContainer.querySelector(`.pool-${color}`);
            if (gridEl) cards.forEach(card => gridEl.appendChild(createCardElement(card)));
          });
        }, 0);
      }
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
        // Single pick: auto-confirm immediately on click
        confirmDraftPickSingle(state.pageData.id || state.pageData, [card.id]);
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
    const result = await api(`/api/events/${eventId}/pick`, {
      method: 'POST',
      body: JSON.stringify({ card_ids: cardIds })
    });
    if (result.draft_complete) {
      showToast('轮抓完成！请构建你的牌组');
      navigate('event-detail', { id: eventId });
    } else {
      // 不立即重渲染 —— 显示等待状态,等轮询把新包带回来
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
    const result = await api(`/api/events/${eventId}/pick`, {
      method: 'POST',
      body: JSON.stringify({ card_ids: cardIds })
    });
    if (result.draft_complete) {
      showToast('轮抓完成！请构建你的牌组');
      navigate('event-detail', { id: eventId });
    } else {
      // 不立即重渲染 —— 显示等待状态,等轮询把新包带回来
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
      return;
    }

    // Compare rendered card IDs with API response - only update DOM when changed
    const renderedIds = Array.from(container.querySelectorAll('[data-card-id]'))
      .map(el => el.getAttribute('data-card-id'));
    const newIds = currentPack.map(c => String(c.id));

    const same = renderedIds.length === newIds.length &&
      renderedIds.every((id, i) => id === newIds[i]);

    if (!same) {
      const cardsPerPick = (event.settings && event.settings.cards_per_pick) || 1;
      draftSelectedCards = [];
      renderDraftCards(currentPack, cardsPerPick);
    }
  } catch (err) {
    // Silently ignore poll errors to avoid UI disruption
  }
}

// ============================================================
// DECK BUILDER
// ============================================================
async function renderDecks(el) {
  el.innerHTML = '<div class="text-center text-muted">加载中...</div>';
  try {
    const decks = await api('/api/decks');
    el.innerHTML = `
      <div class="page-header">
        <h2>我的牌组</h2>
      </div>
      <div class="card-grid">
        ${decks.map(deck => `
          <div class="card-item" onclick="navigate('deck-builder', {deckId:${deck.id}})" style="position:relative">
            <button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();deleteDeck(${deck.id})" title="删除牌组">&times;</button>
            <h3>${deck.name}</h3>
            <div class="card-meta">
              <span>主牌: ${Array.isArray(deck.main_deck) ? deck.main_deck.length : 0}张</span>
              <span>备牌: ${Array.isArray(deck.sideboard) ? deck.sideboard.length : 0}张</span>
            </div>
            ${deck.event_name ? `<div class="text-muted" style="font-size:0.8rem;margin-top:4px">赛事: ${deck.event_name}</div>` : ''}
            <div class="text-muted" style="font-size:0.75rem;margin-top:4px">${new Date(deck.created_at).toLocaleDateString()}</div>
          </div>
        `).join('') || '<div class="empty-state"><h3>暂无牌组</h3><p>从赛事中构建牌组</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
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

    // Store state for click handlers (no sideboard in limited format)
    state.pageData._deckState = { pool: [...pool], mainDeck: [...mainDeck] };

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
    `;

    renderDeckBuilderCards();
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

function renderDeckBuilderCards() {
  const ds = state.pageData._deckState;
  if (!ds) return;

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

  // Update counts
  const poolCount = document.getElementById('pool-count');
  const mainCount = document.getElementById('main-count');
  if (poolCount) poolCount.textContent = `(${ds.pool.length})`;
  if (mainCount) mainCount.textContent = `(${ds.mainDeck.length})`;

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

async function saveDeck(deckId, eventId) {
  const ds = state.pageData._deckState;
  if (!ds) return;

  const name = document.getElementById('deck-name')?.value.trim() || '未命名牌组';
  const body = { name, main_deck: ds.mainDeck, sideboard: ds.pool };

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
  const updatedDeck = { name: name, main_deck: ds.mainDeck, sideboard: ds.pool };
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
function renderCardInnerHtml(card) {
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

function renderLoyaltyBadge(card) {
  var type = (card.type || '').toLowerCase();
  if (!type.includes('planeswalker')) return '';
  var loyalty = card.loyalty;
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
    return '<div class="mtga-action-bar">' + parts.join('') + '</div>';
  }
  if (gs.winner && !gs.matchOver) {
    // Game over, waiting for next game
    parts.push('<span style="margin-left:8px;font-weight:600;color:var(--accent)">' + escapeHtml(battle?.name || '') + '</span>');
    parts.push('<span style="margin-left:8px;font-size:0.85rem;color:var(--text-muted)">' + scoreLabel + '</span>');
    return '<div class="mtga-action-bar">' + parts.join('') + '</div>';
  }
  parts.push('<span style="margin-left:8px;font-weight:600;color:var(--accent);font-size:0.9rem">' + escapeHtml(battle?.name || '') + '</span>');
  parts.push('<span style="margin-left:4px;font-size:0.8rem;color:var(--text-muted)">' + scoreLabel + '</span>');
  parts.push('<span style="margin-left:8px;font-size:0.85rem;color:' + (isMyTurn ? '#2ecc71' : 'var(--text-muted)') + ';font-weight:600">' + turnLabel + '</span>');
  parts.push('<span style="font-size:0.8rem;color:var(--text-muted);margin-left:4px">Turn ' + gs.turn + '</span>');
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
// Card Hover Preview
// ============================================================
function showCardPreview(card) {
  hideCardPreview();
  if (!card) return;
  var div = document.createElement('div');
  div.id = 'card-preview-popup';
  div.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;transition:opacity 0.15s;opacity:0;';
  if (card.image || card.image_small) {
    div.innerHTML = '<img src="' + (card.image || card.image_small) + '" style="width:280px;height:auto;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.7)">';
  } else {
    div.innerHTML = '<div style="width:280px;background:linear-gradient(180deg,#1a2240,#141c35);border-radius:8px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.7)">' +
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
  var previewW = 280;
  var previewH = div.offsetHeight || 400;
  var x = e.clientX - previewW / 2;
  var y = e.clientY - previewH - 16;
  var maxX = window.innerWidth - previewW - 10;
  if (x < 10) x = 10;
  if (x > maxX) x = maxX;
  if (y < 10) y = e.clientY + 20;
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
function categorizeBattlefieldCards(cards) {
  cards = cards || [];
  var creatures = [];
  var lands = [];
  var others = [];
  cards.forEach(function(card) {
    var type = (card.type || '').toLowerCase();
    if (type.includes('creature')) creatures.push(card);
    else if (type.includes('land')) lands.push(card);
    else others.push(card);
  });
  return { creatures: creatures, lands: lands, others: others };
}

function renderBattlefieldOrganized(cards, playerKey, isMy, flipped) {
  var groups = categorizeBattlefieldCards(cards);

  function creaturesRow() {
    var h = '<div class="bf-row bf-creatures">';
    if (groups.creatures.length) {
      h += groups.creatures.map(function(card) {
        var tapped = card.tapped ? ' tapped' : '';
        var tokenCls = card.is_token ? ' mtg-token' : '';
        var dmg = card.damage_marked ? '<div class="mtga-card-damage">-' + card.damage_marked + '</div>' : '';
        return '<div class="mtg-card' + tapped + tokenCls + '" data-card-id="' + card.id + '" data-zone="battlefield" data-player="' + playerKey + '" data-color="' + getCardColorClass(card) + '" style="width:110px;border:none;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4)" draggable="' + isMy + '">' +
          renderCardInnerHtml(card) + dmg + renderCounterBadges(card) + renderLoyaltyBadge(card) + '</div>';
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
        var tapped = card.tapped ? ' tapped' : '';
        var tokenCls = card.is_token ? ' mtg-token' : '';
        return '<div class="mtg-card' + tapped + tokenCls + '" data-card-id="' + card.id + '" data-zone="battlefield" data-player="' + playerKey + '" data-color="' + getCardColorClass(card) + '" style="width:90px;border:none;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4)" draggable="' + isMy + '">' +
          renderCardInnerHtml(card) + renderCounterBadges(card) + renderLoyaltyBadge(card) + '</div>';
      }).join('');
    } else {
      h += '<div class="bf-empty">lands</div>';
    }
    h += '</div>';
    h += '<div class="bf-row bf-others">';
    if (groups.others.length) {
      h += groups.others.map(function(card) {
        var tapped = card.tapped ? ' tapped' : '';
        var tokenCls = card.is_token ? ' mtg-token' : '';
        var dmg = card.damage_marked ? '<div class="mtga-card-damage">-' + card.damage_marked + '</div>' : '';
        return '<div class="mtg-card' + tapped + tokenCls + '" data-card-id="' + card.id + '" data-zone="battlefield" data-player="' + playerKey + '" data-color="' + getCardColorClass(card) + '" style="width:100px;border:none;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4)" draggable="' + isMy + '">' +
          renderCardInnerHtml(card) + dmg + renderCounterBadges(card) + renderLoyaltyBadge(card) + '</div>';
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

  var cardHtml = '';
  if (topCard) {
    cardHtml = '<div class="mtg-card" data-card-id="' + topCard.id + '" data-zone="' + zone + '" data-player="' + playerKey + '" data-color="' + getCardColorClass(topCard) + '" style="width:56px;border:none;border-radius:3px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.5);cursor:' + (isMy ? 'grab' : 'pointer') + '" draggable="' + isMy + '">' +
      renderCardInnerHtml(topCard) + '</div>';
  }

  return '<div class="zone-overlay" id="' + zoneId + '" onclick="openZoneModal(\'' + zone + '\', \'' + playerKey + '\', ' + battleId + ')">' +
    '<div class="zone-overlay-count">' + count + '</div>' +
    '<div class="zone-overlay-label">' + (zone === 'graveyard' ? 'GY' : 'EX') + '</div>' +
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
  var title = (isMy ? 'My ' : 'Opp ') + (zone === 'graveyard' ? 'Graveyard' : 'Exile') + ' (' + cards.length + ')';

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
// Main Board Renderer
// ============================================================
function renderBattleBoard(el, battle, battleId, myKey, oppKey) {
  var gs = battle.game_state;
  var me = gs.players[myKey];
  var opp = gs.players[oppKey];
  var isMyTurn = gs.activePlayer === myKey;

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
        '</div>';
    } else {
      var p1w = gs.player1_wins || battle.player1_wins || 0;
      var p2w = gs.player2_wins || battle.player2_wins || 0;
      var gameNum = battle.current_game || 1;
      winBanner = '<div class="mtga-win-banner">' +
        (gs.winner === myKey ? '\ud83c\udf89 Game Win!' : '\ud83d\udc80 Game Loss') +
        '<div style="font-size:0.9rem;margin-top:8px;opacity:0.8">Score: ' + p1w + ' - ' + p2w + ' (Game ' + gameNum + ')</div>' +
        '<button class="btn btn-primary" style="margin-top:12px" onclick="goToDeckEditBetweenGames(' + battleId + ')">调整牌组</button>' +
        '</div>';
    }
  }

  el.innerHTML =
    '<div class="mtga-board" id="mtga-board">' +
      '<!-- Opponent info -->' +
      '<div class="mtga-info-bar">' +
        '<div class="mtga-player-name">' + escapeHtml(opp?.name || 'Opponent') + '</div>' +
        '<div class="mtga-life ' + ((opp?.life || 20) <= 5 ? 'low' : '') + '" style="cursor:pointer" onclick="mtgaAdjustLife(' + battleId + ', \'opponent\', ' + (opp?.life ?? 20) + ')" title="Click to adjust">' + (opp?.life ?? 20) + '</div>' +
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
          '</div>' +
        '</div>' +
      '</div>' +
      '<!-- My info -->' +
      '<div class="mtga-info-bar">' +
        '<div class="mtga-player-name">' + escapeHtml(me?.name || state.user?.username || 'Me') + '</div>' +
        '<div class="mtga-life ' + ((me?.life || 20) <= 5 ? 'low' : '') + '" style="cursor:pointer" onclick="mtgaAdjustLife(' + battleId + ', \'self\', ' + (me?.life ?? 20) + ')" title="Click to adjust">' + (me?.life ?? 20) + '</div>' +
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

  setupBoardHandlers(el, battleId, myKey, oppKey, gs, me, opp);
}

// ============================================================
// Board Interaction Handlers
// ============================================================
function setupBoardHandlers(el, battleId, myKey, oppKey, gs, me, opp) {
  var allCards = (me?.battlefield || []).concat(opp?.battlefield || []).concat(me?.hand || []).concat(me?.graveyard || []).concat(me?.exile || []).concat(opp?.graveyard || []).concat(opp?.exile || []);

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

  // Universal card drag
  el.querySelectorAll('.mtg-card[draggable="true"]').forEach(function(cardEl) {
    var cardId = cardEl.getAttribute('data-card-id');
    var fromZone = cardEl.getAttribute('data-zone');
    var fromPlayer = cardEl.getAttribute('data-player');
    if (!cardId || !fromZone) return;

    cardEl.addEventListener('dragstart', function(e) {
      window._isDragging = true;
      hideCardPreview();
      e.dataTransfer.setData('text/plain', JSON.stringify({ source: fromZone, cardId: cardId, playerKey: fromPlayer || myKey }));
      e.dataTransfer.effectAllowed = 'move';
      cardEl.classList.add('dragging');
    });
    cardEl.addEventListener('dragend', function() {
      window._isDragging = false;
      cardEl.classList.remove('dragging');
      el.querySelectorAll('.drop-target').forEach(function(z) { z.classList.remove('drop-target'); });
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
      if (!data || !data.cardId || !data.source) return;
      if (data.source !== zone && data.playerKey === myKey) {
        mtgaAction(battleId, { type: 'move_card', card_id: data.cardId, from_zone: data.source, to_zone: zone });
      }
    });
  });

  // Graveyard & Exile overlays as drop targets
  var overlayZones = [
    { el: el.querySelector('#' + myKey + '-graveyard'), zone: 'graveyard' },
    { el: el.querySelector('#' + myKey + '-exile'), zone: 'exile' }
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
      if (!data || !data.cardId || !data.source) return;
      if (data.source !== zone && data.playerKey === myKey) {
        mtgaAction(battleId, { type: 'move_card', card_id: data.cardId, from_zone: data.source, to_zone: zone });
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

  // Right-click context menu for counters on all battlefield cards
  el.querySelectorAll('.mtg-card[data-zone="battlefield"][data-card-id]').forEach(function(cardEl) {
    var cardId = cardEl.getAttribute('data-card-id');
    var playerKey = cardEl.getAttribute('data-player');
    var player = gs.players[playerKey];
    if (!player) return;
    var card = (player.battlefield || []).find(function(c) { return c.id == cardId; });
    if (!card) return;
    cardEl.addEventListener('contextmenu', function(e) {
      showContextMenu(e, cardId, card, playerKey, battleId);
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
}

// ============================================================
// MTGA Actions - with immediate local re-render (fixes real-time bug)
// ============================================================
var _battleRefreshing = false;

async function mtgaAction(battleId, action) {
  console.log('[mtgaAction]', action.type, 'refreshing:', _battleRefreshing, 'battleId:', battleId);
  if (_battleRefreshing) return;
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
