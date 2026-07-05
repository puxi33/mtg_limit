// ============================================================
// Page renderers — MTGA-style
// ============================================================
const Pages = { state: {} };

// =========================================================================
// Helpers (small set, full utilities live in ui.js)
// =========================================================================
Pages.escapeHtml = function(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};
Pages.formatDate = function(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit' });
};

// =========================================================================
// Auth
// =========================================================================
Pages.renderLogin = function(el) {
  el.innerHTML = `
    <div class="auth-page">
      <div class="auth-box">
        <h1>MTG 限制赛</h1>
        <p class="subtitle">万智牌轮抓 / 现开 / 对战平台</p>
        <div class="auth-tabs">
          <button class="active" data-tab="login" onclick="Pages.switchAuthTab('login')">登录</button>
          <button data-tab="register" onclick="Pages.switchAuthTab('register')">注册</button>
        </div>
        <form id="auth-form" onsubmit="Pages.handleAuth(event)">
          <div class="form-group">
            <label>用户名</label>
            <input type="text" id="auth-username" required minlength="2" placeholder="输入用户名" autocomplete="username">
          </div>
          <div class="form-group">
            <label>密码</label>
            <input type="password" id="auth-password" required minlength="4" placeholder="输入密码" autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary btn-block">登录</button>
        </form>
        <p style="text-align:center;color:var(--text-muted);font-size:0.8rem;margin-top:16px">
          默认账号: <code>demo</code> / <code>demo123</code>
        </p>
      </div>
    </div>
  `;
};

Pages.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tabs button').forEach((btn, i) => {
    btn.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
  const submitBtn = document.querySelector('#auth-form button[type="submit"]');
  if (submitBtn) submitBtn.textContent = tab === 'login' ? '登录' : '注册';
};

Pages.handleAuth = async function(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const tab = document.querySelector('.auth-tabs button.active')?.getAttribute('data-tab') || 'login';
  const endpoint = tab === 'register' ? '/api/auth/register' : '/api/auth/login';
  try {
    const data = await API.post(endpoint, { username, password });
    API.setToken(data.token);
    App.state.token = data.token;
    App.state.user = data.user;
    document.getElementById('nav-username').textContent = data.user.username;
    UI.toast('欢迎, ' + data.user.username + '!');
    WS.connect();
    App.navigate('dashboard');
  } catch (err) { UI.toast(err.message, 'error'); }
};

// =========================================================================
// Dashboard
// =========================================================================
Pages.renderDashboard = async function(el) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  try {
    const [stats, events, battles] = await Promise.all([
      API.get('/api/stats'),
      API.get('/api/events'),
      API.get('/api/battles')
    ]);
    el.innerHTML = `
      <h2 style="margin-bottom:24px;color:var(--text-bright);font-size:1.8rem">
        欢迎回来, <span style="color:var(--accent)">${Pages.escapeHtml(App.state.user.username)}</span>
      </h2>
      <div class="dashboard-stats">
        <div class="stat-card"><div class="stat-value">${stats.cubes}</div><div class="stat-label">Cube</div></div>
        <div class="stat-card"><div class="stat-value">${stats.events}</div><div class="stat-label">参与赛事</div></div>
        <div class="stat-card"><div class="stat-value">${stats.decks}</div><div class="stat-label">牌组</div></div>
        <div class="stat-card"><div class="stat-value">${stats.battles}</div><div class="stat-label">对战</div></div>
        <div class="stat-card"><div class="stat-value">${stats.wins}</div><div class="stat-label">胜场</div></div>
      </div>
      <h3 style="margin-bottom:12px;color:var(--text-bright)">快速操作</h3>
      <div class="quick-actions">
        <button class="btn btn-primary" onclick="App.navigate('cubes')">管理 Cube</button>
        <button class="btn btn-success" onclick="App.navigate('events')">创建赛事</button>
        <button class="btn btn-secondary" onclick="App.navigate('decks')">构建牌组</button>
        <button class="btn btn-warning" onclick="App.navigate('battles')">寻找对战</button>
      </div>
      <h3 style="margin:32px 0 12px;color:var(--text-bright)">最近赛事</h3>
      <div class="card-grid">
        ${events.slice(0, 6).map(ev => `
          <div class="card-item" onclick="App.navigate('event-detail', {id:${ev.id}})" style="position:relative">
            ${ev.user_id === App.state.user.id ? `<button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();Pages.deleteEvent(${ev.id})">×</button>` : ''}
            <h3>${Pages.escapeHtml(ev.name)}</h3>
            <div style="display:flex;gap:6px;margin:8px 0">
              ${UI.typeBadge(ev.type)} ${UI.statusBadge(ev.status)}
            </div>
            <div class="card-meta">
              <span>${ev.participant_count}人</span>
              <span>${Pages.escapeHtml(ev.creator_name || '')}</span>
            </div>
          </div>
        `).join('') || '<div class="empty-state"><p>暂无赛事</p></div>'}
      </div>
      <h3 style="margin:32px 0 12px;color:var(--text-bright)">最近对战</h3>
      <div class="card-grid">
        ${battles.slice(0, 6).map(b => `
          <div class="card-item" onclick="App.navigate('battle-detail', {id:${b.id}})">
            <h3>${Pages.escapeHtml(b.name || ('对战 #' + b.id))}</h3>
            ${UI.statusBadge(b.status)}
            <div class="card-meta">
              <span>${Pages.escapeHtml(b.player1_name || '等待中')}</span>
              <span style="color:var(--accent)">vs</span>
              <span>${Pages.escapeHtml(b.player2_name || '等待加入')}</span>
            </div>
          </div>
        `).join('') || '<div class="empty-state"><p>暂无对战</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + Pages.escapeHtml(err.message) + '</p></div>';
  }
};

// =========================================================================
// Cubes
// =========================================================================
Pages.renderCubes = async function(el) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  try {
    const cubes = await API.get('/api/cubes');
    el.innerHTML = `
      <div class="page-header">
        <h2>我的 Cube</h2>
        <div class="flex gap-8">
          <button class="btn btn-secondary" onclick="Pages.showImportModal()">快速导入</button>
          <button class="btn btn-primary" onclick="Pages.showCreateCubeModal()">新建 Cube</button>
        </div>
      </div>
      <div class="card-grid">
        ${cubes.map(cube => `
          <div class="card-item" onclick="App.navigate('cube-detail', {id:${cube.id}})" style="position:relative">
            <button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();Pages.deleteCube(${cube.id})">×</button>
            <h3>${Pages.escapeHtml(cube.name)}</h3>
            <p class="text-muted" style="font-size:0.85rem;margin-bottom:8px">${Pages.escapeHtml(cube.description || '无描述')}</p>
            <div class="card-meta">
              <span>${cube.card_count} 张牌</span>
              <span>${Pages.formatDate(cube.created_at)}</span>
            </div>
          </div>
        `).join('') || '<div class="empty-state"><h3>还没有 Cube</h3><p>点击新建 Cube 或快速导入开始</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + Pages.escapeHtml(err.message) + '</p></div>';
  }
};

Pages.showCreateCubeModal = function() {
  UI.showModal('新建 Cube', `
    <form onsubmit="Pages.handleCreateCube(event)">
      <div class="form-group"><label>Cube 名称</label><input type="text" id="cube-name" required></div>
      <div class="form-group"><label>描述</label><input type="text" id="cube-desc"></div>
      <div class="form-group">
        <label>卡牌列表（每行一张，自动获取卡图）</label>
        <textarea id="cube-cards" rows="10" placeholder="4 Lightning Bolt&#10;4 Counterspell"></textarea>
      </div>
      <div id="cube-create-progress" class="hidden text-center" style="padding:8px;color:var(--text-muted)">正在获取卡牌数据...</div>
      <button type="submit" id="cube-create-submit" class="btn btn-primary btn-block">创建</button>
    </form>
  `);
};

Pages.handleCreateCube = async function(e) {
  e.preventDefault();
  const name = document.getElementById('cube-name').value.trim();
  const description = document.getElementById('cube-desc').value.trim();
  const cardsText = document.getElementById('cube-cards').value.trim();
  const submitBtn = document.getElementById('cube-create-submit');
  if (!cardsText) {
    try {
      await API.post('/api/cubes', { name, description, cards: [] });
      UI.closeModal();
      UI.toast('Cube 创建成功（空牌池）');
      App.navigate('cubes');
    } catch (err) { UI.toast(err.message, 'error'); }
    return;
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '获取中...'; }
  try {
    const result = await API.post('/api/cubes/import', { data: cardsText, name, description });
    UI.closeModal();
    const stats = result.import_stats;
    if (stats) {
      let msg = 'Cube 创建成功: ' + stats.fetched + '/' + stats.total + ' 张获取了卡图';
      if (stats.failed > 0) msg += '（' + stats.failed + ' 张未找到）';
      UI.toast(msg, stats.failed > 0 ? 'info' : 'success');
    } else UI.toast('Cube 创建成功');
    App.navigate('cubes');
  } catch (err) {
    UI.toast(err.message, 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '创建'; }
  }
};

Pages.showImportModal = function() {
  UI.showModal('导入 Cube', `
    <form onsubmit="Pages.handleImportCube(event)">
      <div class="form-group"><label>Cube 名称（可选）</label><input type="text" id="import-name"></div>
      <div class="form-group"><label>描述（可选）</label><input type="text" id="import-desc"></div>
      <div class="form-group">
        <label>卡牌列表</label>
        <textarea id="import-data" rows="12" required></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-block">导入</button>
    </form>
  `);
};

Pages.handleImportCube = async function(e) {
  e.preventDefault();
  const name = document.getElementById('import-name').value.trim();
  const description = document.getElementById('import-desc')?.value.trim() || '';
  const data = document.getElementById('import-data').value.trim();
  if (!data) { UI.toast('请输入卡牌列表', 'error'); return; }
  try {
    const result = await API.post('/api/cubes/import', { data, name: name || undefined, description });
    UI.closeModal();
    const stats = result.import_stats;
    if (stats) {
      let msg = '导入成功: ' + stats.fetched + '/' + stats.total + ' 张';
      if (stats.failed > 0) msg += '（' + stats.failed + ' 张未找到）';
      UI.toast(msg, stats.failed > 0 ? 'info' : 'success');
    } else UI.toast('Cube 导入成功');
    App.navigate('cubes');
  } catch (err) { UI.toast(err.message, 'error'); }
};

Pages.renderCubeDetail = async function(el, id) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  try {
    const cube = await API.get('/api/cubes/' + id);
    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="App.navigate('cubes')">← 返回</button>
          <h2>${Pages.escapeHtml(cube.name)}</h2>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-danger" onclick="Pages.deleteCube(${id})">删除</button>
        </div>
      </div>
      <p class="mb-16 text-muted">共 <strong style="color:var(--accent)">${cube.cards.length}</strong> 张牌</p>
      <div id="cube-cards-container"></div>
    `;
    setTimeout(() => {
      const container = document.getElementById('cube-cards-container');
      if (!container) return;
      const groups = UI.groupCardsByColor(cube.cards || []);
      container.innerHTML = Object.entries(groups).filter(([, cards]) => cards.length > 0).map(([color, cards]) => `
        <div class="color-group">
          <h4>${UI.COLOR_NAMES[color] || color} (${cards.length})</h4>
          <div class="mtg-cards-grid cube-${color}"></div>
        </div>
      `).join('');
      Object.entries(groups).filter(([, cards]) => cards.length > 0).forEach(([color, cards]) => {
        const grid = container.querySelector('.cube-' + color);
        if (grid) cards.forEach(card => grid.appendChild(UI.createCardElement(card)));
      });
    }, 0);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + Pages.escapeHtml(err.message) + '</p></div>';
  }
};

Pages.deleteCube = async function(id) {
  if (!confirm('确定要删除这个 Cube 吗？')) return;
  try {
    await API.delete('/api/cubes/' + id);
    UI.toast('Cube 已删除');
    App.navigate('cubes');
  } catch (err) { UI.toast(err.message, 'error'); }
};

// =========================================================================
// Events
// =========================================================================
Pages.renderEvents = async function(el) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  try {
    const events = await API.get('/api/events');
    el.innerHTML = `
      <div class="page-header">
        <h2>限制赛</h2>
        <button class="btn btn-primary" onclick="Pages.showCreateEventModal()">创建赛事</button>
      </div>
      <div class="card-grid">
        ${events.map(ev => `
          <div class="card-item" onclick="App.navigate('event-detail', {id:${ev.id}})" style="position:relative">
            ${ev.user_id === App.state.user.id ? `<button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();Pages.deleteEvent(${ev.id})">×</button>` : ''}
            <h3>${Pages.escapeHtml(ev.name)}</h3>
            <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">
              ${UI.typeBadge(ev.type)} ${UI.statusBadge(ev.status)}
            </div>
            <div class="card-meta">
              <span>Cube: ${Pages.escapeHtml(ev.cube_name || '无')}</span>
              <span>${ev.participant_count}/${ev.settings?.max_players || '?'}人</span>
            </div>
          </div>
        `).join('') || '<div class="empty-state"><p>暂无赛事</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + Pages.escapeHtml(err.message) + '</p></div>';
  }
};

Pages.showCreateEventModal = async function() {
  let cubes = [];
  try { cubes = await API.get('/api/cubes'); } catch {}
  UI.showModal('创建限制赛', `
    <form onsubmit="Pages.handleCreateEvent(event)">
      <div class="form-group"><label>赛事名称</label><input type="text" id="event-name" required></div>
      <div class="form-group">
        <label>赛事类型</label>
        <select id="event-type">
          <option value="draft">轮抓</option>
          <option value="sealed">现开</option>
        </select>
      </div>
      <div class="form-group">
        <label>选择 Cube</label>
        <select id="event-cube" required>
          <option value="">请选择</option>
          ${cubes.map(c => '<option value="' + c.id + '">' + Pages.escapeHtml(c.name) + ' (' + c.card_count + ' 张)</option>').join('')}
        </select>
      </div>
      <div class="form-group"><label>最大人数</label><input type="number" id="event-max-players" value="8" min="2" max="24"></div>
      <div class="form-group"><label>每人卡包数</label><input type="number" id="event-packs" value="3" min="1" max="10"></div>
      <div class="form-group"><label>每包卡牌数</label><input type="number" id="event-cards-per-pack" value="15" min="5" max="20"></div>
      <div class="form-group"><label>每次选牌数</label><input type="number" id="event-cards-per-pick" value="1" min="1" max="3"></div>
      <button type="submit" class="btn btn-primary btn-block">创建</button>
    </form>
  `);
};

Pages.handleCreateEvent = async function(e) {
  e.preventDefault();
  try {
    await API.post('/api/events', {
      name: document.getElementById('event-name').value.trim(),
      type: document.getElementById('event-type').value,
      cube_id: parseInt(document.getElementById('event-cube').value),
      settings: {
        max_players: parseInt(document.getElementById('event-max-players').value),
        packs_per_player: parseInt(document.getElementById('event-packs').value),
        cards_per_pack: parseInt(document.getElementById('event-cards-per-pack').value),
        cards_per_pick: parseInt(document.getElementById('event-cards-per-pick').value)
      }
    });
    UI.closeModal();
    UI.toast('赛事创建成功');
    App.navigate('events');
  } catch (err) { UI.toast(err.message, 'error'); }
};

Pages.deleteEvent = async function(id) {
  if (!confirm('确定要删除这个赛事吗？')) return;
  try {
    await API.delete('/api/events/' + id);
    UI.toast('赛事已删除');
    App.navigate(App.state.currentPage, App.state.pageData);
  } catch (err) { UI.toast(err.message, 'error'); }
};

Pages.joinEvent = async function(id) {
  try {
    await API.post('/api/events/' + id + '/join', {});
    UI.toast('已加入赛事');
    App.navigate('event-detail', { id });
  } catch (err) { UI.toast(err.message, 'error'); }
};

Pages.botFillEvent = async function(id) {
  try {
    const result = await API.post('/api/events/' + id + '/bot-fill', {});
    UI.toast('已填充 ' + result.added + ' 个 Bot');
    App.navigate('event-detail', { id });
  } catch (err) { UI.toast(err.message, 'error'); }
};

Pages.startEvent = async function(id) {
  if (!confirm('确定要开始赛事吗？')) return;
  try {
    await API.post('/api/events/' + id + '/start', {});
    UI.toast('赛事已开始');
    App.navigate('event-detail', { id });
  } catch (err) { UI.toast(err.message, 'error'); }
};

// =========================================================================
// Event Detail (with DRAFT page - sidebars + top progress bar + CMC pool)
// =========================================================================
Pages.renderEventDetail = async function(el, id) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  try {
    const event = await API.get('/api/events/' + id);
    const isOwner = event.user_id === App.state.user.id;
    const isParticipant = event.my_participation !== null;

    // For draft in_progress: render the new layout
    if (event.status === 'in_progress' && event.type === 'draft' && isParticipant) {
      Pages.renderDraftLayout(el, event, id);
      return;
    }

    // For other states: show simple info page
    let actionsHtml = '';
    if (event.status === 'waiting') {
      if (!isParticipant && !isOwner) {
        actionsHtml += '<button class="btn btn-success" onclick="Pages.joinEvent(' + id + ')">加入赛事</button>';
      }
      if (isOwner) {
        actionsHtml += '<button class="btn btn-warning" onclick="Pages.botFillEvent(' + id + ')">填充 Bot</button>';
        actionsHtml += '<button class="btn btn-primary" onclick="Pages.startEvent(' + id + ')">开始赛事</button>';
        actionsHtml += '<button class="btn btn-danger" onclick="Pages.deleteEvent(' + id + ')">删除</button>';
      }
    } else if (event.status === 'in_progress' && event.type === 'sealed' && isParticipant) {
      actionsHtml += '<button class="btn btn-primary" onclick="App.navigate(\'deck-builder\', {pool:true, eventId:' + id + '})">构建牌组</button>';
    } else if (event.status === 'completed' && isParticipant) {
      actionsHtml += '<button class="btn btn-primary" onclick="App.navigate(\'deck-builder\', {pool:true, eventId:' + id + '})">构建牌组</button>';
    }

    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="App.navigate('events')">← 返回</button>
          <h2>${Pages.escapeHtml(event.name)}</h2>
        </div>
        <div class="flex gap-8 flex-wrap">${actionsHtml}</div>
      </div>
      <div class="event-info">
        <div class="info-row">类型: <span>${UI.typeBadge(event.type)}</span></div>
        <div class="info-row">状态: <span>${UI.statusBadge(event.status)}</span></div>
        <div class="info-row">Cube: <span>${Pages.escapeHtml(event.cube_name || '无')}</span></div>
        <div class="info-row">创建者: <span>${Pages.escapeHtml(event.creator_name)}</span></div>
        <div class="info-row">参与人数: <span>${event.participants.length}/${event.settings?.max_players || '?'}</span></div>
      </div>
      <h3 style="color:var(--text-bright);margin-bottom:12px">参与者</h3>
      <div class="participants-list">
        ${event.participants.map(p => `
          <div class="participant-card ${p.user_id === App.state.user.id ? 'is-me' : ''}">
            <div>
              <span class="seat">#${p.seat_number}</span>
              <span class="name">${Pages.escapeHtml(p.username)}</span>
              ${p.status === 'bot' ? '<span class="badge badge-bot">Bot</span>' : ''}
            </div>
            ${event.status !== 'waiting' ? '<span class="text-muted">' + (p.pool_size || 0) + ' 张</span>' : ''}
          </div>
        `).join('')}
      </div>
      ${event.status === 'completed' && isParticipant ? `
        <div class="mt-24 text-center">
          <h3>🎉 轮抓完成！</h3>
          <button class="btn btn-primary btn-lg mt-16" onclick="App.navigate('deck-builder', {pool:true, eventId:${id}})">构建牌组</button>
        </div>
      ` : ''}
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + Pages.escapeHtml(err.message) + '</p></div>';
  }
};

// -------------------------------------------------------------------------
// Draft layout (sidebars + top progress bar + CMC pool)
// -------------------------------------------------------------------------
Pages.draftState = {
  eventId: null,
  currentPack: [],
  thisPick: [],
  pool: [],
  manualAssignments: {},
  pending: [],
  cardsPerPick: 1,
  packNumber: 1,
  remainingPacks: 0,
  direction: 'left',
  alreadyPicked: false
};

Pages._sidebarStates = { left: false, right: false };

Pages.toggleSidebar = function(side) {
  Pages._sidebarStates[side] = !Pages._sidebarStates[side];
  const sidebar = document.getElementById('sidebar-' + side);
  if (sidebar) sidebar.classList.toggle('collapsed', Pages._sidebarStates[side]);
  Pages.applySidebarStates();
};

Pages.applySidebarStates = function() {
  const layout = document.getElementById('draft-layout');
  if (!layout) return;
  layout.classList.toggle('left-collapsed', !!Pages._sidebarStates.left);
  layout.classList.toggle('right-collapsed', !!Pages._sidebarStates.right);
};

Pages.renderDraftLayout = function(el, event, id) {
  const mp = event.my_participation;
  const packData = mp.current_packs || {};
  const currentPack = packData.current || (Array.isArray(packData) ? packData[0] : null) || [];
  const remainingQueue = packData.queue || [];
  const packNum = (event.settings?.packs_per_player || 3) - remainingQueue.length;
  const direction = packNum % 2 === 1 ? '左传' : '右传';
  const cardsPerPick = event.settings?.cards_per_pick || 1;

  // Hydrate draft state
  if (Pages.draftState.eventId !== id) {
    Pages.draftState.eventId = id;
    Pages.draftState.thisPick = [];
    Pages.draftState.pool = Array.isArray(mp.pool) ? [...mp.pool] : [];
    Pages.draftState.manualAssignments = {};
  } else {
    Pages.draftState.pool = Array.isArray(mp.pool) ? [...mp.pool] : Pages.draftState.pool;
  }
  Pages.draftState.cardsPerPick = cardsPerPick;
  Pages.draftState.currentPack = currentPack;
  Pages.draftState.packNumber = packNum;
  Pages.draftState.remainingPacks = remainingQueue.length + 1;
  Pages.draftState.direction = direction;
  Pages.draftState.pending = Array.isArray(packData.pending) ? packData.pending : [];

  const myParticipant = event.participants.find(p => p.user_id === App.state.user.id);
  const myParticipantId = myParticipant ? myParticipant.id : null;
  const alreadyPicked = myParticipantId && event.picks_this_round && event.picks_this_round.includes(myParticipantId);
  Pages.draftState.alreadyPicked = !!alreadyPicked;

  const isOwner = event.user_id === App.state.user.id;
  const isDraftComplete = currentPack.length === 0 && Pages.draftState.pending.length === 0;

  // Left sidebar: event info
  const leftSidebarHtml = `
    <aside class="draft-sidebar" id="sidebar-left">
      <button class="draft-sidebar-toggle" onclick="Pages.toggleSidebar('left')">📋 收起</button>
      <div class="sidebar-content">
        <h4>📋 赛事信息</h4>
        <div class="info-row"><span class="label">类型</span><span class="value">${event.type === 'draft' ? '轮抓' : '现开'}</span></div>
        <div class="info-row"><span class="label">状态</span><span class="value">${UI.statusBadge(event.status)}</span></div>
        <div class="info-row"><span class="label">Cube</span><span class="value">${Pages.escapeHtml(event.cube_name || '无')}</span></div>
        <div class="info-row"><span class="label">创建者</span><span class="value">${Pages.escapeHtml(event.creator_name)}</span></div>
        <div class="info-row"><span class="label">人数</span><span class="value">${event.participants.length}/${event.settings?.max_players || '?'}</span></div>
        <div class="info-row"><span class="label">包数</span><span class="value">${event.settings?.packs_per_player || 3} 包 × ${event.settings?.cards_per_pack || 15} 张</span></div>
        <div class="info-row"><span class="label">选牌</span><span class="value">${cardsPerPick} 张/轮</span></div>
        ${isOwner && event.status === 'waiting' ? `
          <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-warning btn-sm" onclick="Pages.botFillEvent(${id})">填充 Bot</button>
            <button class="btn btn-danger btn-sm" onclick="Pages.deleteEvent(${id})">删除</button>
          </div>
        ` : ''}
      </div>
    </aside>
  `;

  // Right sidebar: participants + round status
  const rightSidebarHtml = `
    <aside class="draft-sidebar" id="sidebar-right">
      <button class="draft-sidebar-toggle" onclick="Pages.toggleSidebar('right')">👥 收起</button>
      <div class="sidebar-content">
        <h4>👥 参与者 (${event.participants.length})</h4>
        ${event.participants.map(p => `
          <div class="participant-row ${p.user_id === App.state.user.id ? 'is-me' : ''}">
            <span class="seat">#${p.seat_number}</span>
            <span class="name">${Pages.escapeHtml(p.username)}</span>
            ${p.status === 'bot' ? '<span class="badge badge-bot">Bot</span>' : ''}
            ${event.status !== 'waiting' ? '<span class="text-muted" style="font-size:0.75rem">' + (p.pool_size || 0) + '</span>' : ''}
          </div>
        `).join('')}
        ${alreadyPicked ? `
          <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border)">
            <div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:4px;text-transform:uppercase">本轮已选</div>
            ${(event.picks_this_round || []).map(pid => {
              const p = event.participants.find(x => x.id === pid);
              return p ? '<div class="participant-row"><span class="seat">#' + p.seat_number + '</span><span class="name">' + Pages.escapeHtml(p.username) + '</span><span class="badge badge-progress">✓</span></div>' : '';
            }).join('')}
            <div style="color:var(--text-muted);font-size:0.75rem;margin-top:8px;text-transform:uppercase">等待</div>
            ${(event.round_status?.waiting_for || []).map(w => `
              <div class="participant-row"><span class="seat">#${w.seat}</span><span class="name">${Pages.escapeHtml(w.username)}</span><span>⏳</span></div>
            `).join('') || '<div style="color:var(--text-dim);font-size:0.75rem;font-style:italic">无</div>'}
          </div>
        ` : ''}
      </div>
    </aside>
  `;

  // Main area
  let mainHtml;
  if (isDraftComplete) {
    mainHtml = `
      <main class="draft-main">
        <div class="waiting-banner" style="background:linear-gradient(135deg,rgba(76,185,100,0.2),rgba(76,185,100,0.05));border-color:var(--success);color:var(--success)">
          🎉 轮抓完成！所有牌已选完，可以构建牌组了。
        </div>
        ${Pages._buildPoolHtml(id)}
        <div class="text-center" style="margin-top:16px">
          <button class="btn btn-primary btn-lg" onclick="App.navigate('deck-builder', {pool:true, eventId:${id}})">构建牌组</button>
        </div>
      </main>
    `;
  } else {
    const waitingBanner = alreadyPicked ? `
      <div class="waiting-banner" id="dp-waiting-banner">
        ⏳ 本轮你已选牌，等待其他玩家选完后传牌给你
      </div>
    ` : '';
    mainHtml = `
      <main class="draft-main">
        ${waitingBanner}
        <!-- Top sticky progress bar with confirm button -->
        <div class="draft-progress-sticky">
          <div class="draft-progress-info">
            <div class="item highlight">
              <span class="label">本轮选牌</span>
              <span class="value"><span id="dp-pick-count">${Pages.draftState.thisPick.length}</span> / ${cardsPerPick}</span>
            </div>
            <div class="item">
              <span class="label">第 ${packNum} 包</span>
              <span class="value">${direction}</span>
            </div>
            <div class="item">
              <span class="label">当前包</span>
              <span class="value">${currentPack.length} 张</span>
            </div>
            <div class="item">
              <span class="label">排队</span>
              <span class="value">${Pages.draftState.pending.length}</span>
            </div>
            <div class="item">
              <span class="label">总已选</span>
              <span class="value" id="dp-pool-count">${(mp.pool || []).length} 张</span>
            </div>
          </div>
          <div class="draft-progress-confirm">
            <button class="btn btn-primary" id="confirm-pick-btn" ${alreadyPicked || Pages.draftState.thisPick.length !== cardsPerPick ? 'disabled' : ''}>
              ${alreadyPicked ? '⏳ 已选，等待传牌' : '✓ 确认选牌'}
            </button>
          </div>
        </div>

        <!-- Current pack (compact thumbnails) -->
        <div class="draft-pack">
          <div class="draft-pack-header">
            <h3>📥 当前卡包（点击选牌）</h3>
            <span>${alreadyPicked ? '本轮已选，等待传牌' : '点击 ' + cardsPerPick + ' 张牌'}</span>
          </div>
          <div class="draft-pack-cards" id="pack-cards"></div>
        </div>

        <!-- Pool (CMC columns, stacked cards, free drag) -->
        ${Pages._buildPoolHtml(id)}
      </main>
    `;
  }

  el.innerHTML = `
    <div class="draft-view" id="draft-view">
      <div class="draft-back">
        <button class="btn btn-secondary btn-sm" onclick="App.navigate('events')">← 返回</button>
        <h2>${Pages.escapeHtml(event.name)}</h2>
      </div>
      <div class="draft-layout" id="draft-layout">
        ${leftSidebarHtml}
        ${mainHtml}
        ${rightSidebarHtml}
      </div>
    </div>
  `;

  // Wire up confirm button
  const confirmBtn = document.getElementById('confirm-pick-btn');
  if (confirmBtn) {
    confirmBtn.onclick = () => Pages.confirmDraftPick(id, cardsPerPick);
  }

  // Render pack + pool if not in waiting state
  if (!isDraftComplete) {
    if (currentPack.length > 0 && !alreadyPicked) {
      Pages.renderPackArea(currentPack, id);
    } else if (alreadyPicked) {
      // Clear pack area
      const grid = document.getElementById('pack-cards');
      if (grid) grid.innerHTML = '';
    }
  }
  Pages.renderPoolArea(id);
  Pages.applySidebarStates();
  // 切换到新 event 时,先取消旧订阅
  if (Pages._draftEventId && Pages._draftEventId !== id) {
    WS.unsubscribe('event:' + Pages._draftEventId);
  }
  Pages._draftEventId = id;
  WS.subscribe('event:' + id);

  // 监听服务端推送的 draft_updated —— 任何人选牌后都会触发,完整重渲染
  if (!Pages._draftWsHandler) {
    Pages._draftWsHandler = function(data) {
      const evId = data && data.eventId;
      if (!evId) return;
      // 只在当前正在该赛事的草稿页时才重渲染,避免其他页面被频繁打回
      if (App.state.currentPage === 'draft' && App.state.pageData && App.state.pageData.id === evId) {
        API.get('/api/events/' + evId).then(ev => {
          const el = document.getElementById('main-content');
          if (el) Pages.renderDraftLayout(el, ev, evId);
        }).catch(() => {});
      }
    };
    WS.on('draft_updated', Pages._draftWsHandler);
  }
};

// -------------------------------------------------------------------------
// Pool: CMC columns, stacked cards, free drag
// -------------------------------------------------------------------------
const POOL_BUCKETS = ['0','1','2','3','4','5','6+','L'];
const POOL_LABELS = { '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6+':'6+','L':'地' };

Pages._poolBucket = function(card) {
  if (card.type && card.type.includes('Land')) return 'L';
  const c = parseInt(card.cmc) || 0;
  if (c <= 5) return String(c);
  return '6+';
};

Pages._buildPoolHtml = function(eventId) {
  return `
    <div class="draft-pool">
      <div class="draft-pool-header">
        <h3>📚 已选牌池 (${Pages.draftState.pool.length} 张)</h3>
        <span class="hint">拖动卡牌到任意列 · 卡牌堆叠放置</span>
      </div>
      <div class="draft-pool-columns" id="pool-columns">
        ${POOL_BUCKETS.map(b => `
          <div class="pool-column" data-cmc="${b}" data-bucket="${b}">
            <div class="pool-column-header">
              ${POOL_LABELS[b]} <span class="pool-column-count" data-bucket="${b}">0</span>
            </div>
            <div class="pool-column-body" data-bucket="${b}"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
};

Pages.renderPackArea = function(currentPack, eventId) {
  const grid = document.getElementById('pack-cards');
  if (!grid) return;
  grid.innerHTML = '';
  const selectedIds = new Set(Pages.draftState.thisPick.map(c => c.id));
  currentPack.forEach(card => {
    const cardEl = UI.createCardElement(card, {
      selected: selectedIds.has(card.id),
      onClick: () => Pages.toggleDraftSelection(card.id, eventId)
    });
    cardEl.setAttribute('data-card-id', card.id);
    cardEl.style.position = 'relative';
    grid.appendChild(cardEl);
  });
  Pages.updateConfirmButton();
};

Pages.renderPoolArea = function(eventId) {
  const colsEl = document.getElementById('pool-columns');
  if (!colsEl) return;
  const pool = Pages.draftState.pool;
  const assignments = Pages.draftState.manualAssignments || {};

  const buckets = {};
  POOL_BUCKETS.forEach(b => buckets[b] = []);
  for (const card of pool) {
    let b = assignments[card.id];
    if (!b || !POOL_BUCKETS.includes(b)) b = Pages._poolBucket(card);
    buckets[b].push(card);
  }

  POOL_BUCKETS.forEach(b => {
    const body = colsEl.querySelector('.pool-column-body[data-bucket="' + b + '"]');
    if (!body) return;
    body.innerHTML = '';
    buckets[b].forEach(card => body.appendChild(Pages._makePoolCardRow(card)));
    const countEl = colsEl.querySelector('.pool-column-count[data-bucket="' + b + '"]');
    if (countEl) countEl.textContent = String(buckets[b].length);
  });

  POOL_BUCKETS.forEach(b => {
    const col = colsEl.querySelector('.pool-column[data-bucket="' + b + '"]');
    if (col) Pages._setupPoolColumnDrop(col, b);
  });

  const pc = document.getElementById('dp-pool-count');
  if (pc) pc.textContent = pool.length + ' 张';
};

Pages._makePoolCardRow = function(card) {
  const row = document.createElement('div');
  row.className = 'pool-card-row';
  row.setAttribute('draggable', 'true');
  row.setAttribute('data-card-id', card.id);

  const isLand = card.type && card.type.includes('Land');
  const cmc = parseInt(card.cmc) || 0;
  const cost = isLand ? 'L' : String(cmc);
  const costClass = isLand ? 'cmc-land' : ('cmc-' + Math.min(cmc, 6));

  const safeName = Pages.escapeHtml(card.name || '');
  row.innerHTML = '<span class="cost ' + costClass + '">' + cost + '</span><span class="name">' + safeName + '</span>';

  row.addEventListener('mouseenter', (e) => UI.showCardPreview(card, e));
  row.addEventListener('mousemove', (e) => UI.moveCardPreview(e));
  row.addEventListener('mouseleave', () => UI.hideCardPreview());

  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    row.style.opacity = '0.5';
  });
  row.addEventListener('dragend', () => { row.style.opacity = '1'; });

  return row;
};

Pages._setupPoolColumnDrop = function(colEl, bucket) {
  colEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    colEl.classList.add('is-drop-target');
  });
  colEl.addEventListener('dragleave', (e) => {
    if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('is-drop-target');
  });
  colEl.addEventListener('drop', (e) => {
    e.preventDefault();
    colEl.classList.remove('is-drop-target');
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId) return;
    const card = Pages.draftState.pool.find(c => c.id === cardId);
    if (!card) return;
    const currentBucket = Pages.draftState.manualAssignments[cardId] || Pages._poolBucket(card);
    if (currentBucket === bucket) return;
    Pages.draftState.manualAssignments[cardId] = bucket;
    Pages.renderPoolArea(Pages.draftState.eventId);
  });
};

Pages.updateConfirmButton = function() {
  const btn = document.getElementById('confirm-pick-btn');
  if (!btn) return;
  if (Pages.draftState.alreadyPicked) {
    btn.disabled = true;
    btn.textContent = '⏳ 已选，等待传牌';
    return;
  }
  const need = Pages.draftState.cardsPerPick;
  const have = Pages.draftState.thisPick.length;
  const countEl = document.getElementById('dp-pick-count');
  if (countEl) countEl.textContent = String(have);
  btn.disabled = have !== need;
  btn.textContent = have === need ? '✓ 确认选牌' : ('还需选 ' + (need - have) + ' 张');
};

Pages.toggleDraftSelection = function(cardId, eventId) {
  if (Pages.draftState.alreadyPicked) {
    UI.toast('本轮已选，等待其他玩家', 'info');
    return;
  }
  const cardsPerPick = Pages.draftState.cardsPerPick;
  const pick = Pages.draftState.thisPick;
  const idx = pick.findIndex(c => c.id === cardId);
  if (idx > -1) {
    pick.splice(idx, 1);
  } else {
    const inPack = Pages.draftState.currentPack.find(c => c.id === cardId);
    if (!inPack) return;
    if (pick.length >= cardsPerPick) pick.shift();
    pick.push(inPack);
  }
  Pages.renderPackArea(Pages.draftState.currentPack, eventId);
};

Pages.confirmDraftPick = async function(eventId, cardsPerPick) {
  if (Pages.draftState.alreadyPicked) return;
  if (Pages.draftState.thisPick.length !== cardsPerPick) {
    UI.toast('请选择 ' + cardsPerPick + ' 张卡牌', 'error');
    return;
  }
  const btn = document.getElementById('confirm-pick-btn');
  if (btn) { btn.disabled = true; btn.textContent = '传牌中...'; }
  try {
    const cardIds = Pages.draftState.thisPick.map(c => c.id);
    const result = await API.post('/api/events/' + eventId + '/pick', { card_ids: cardIds });
    const names = (result.picked_cards || []).map(c => c.name).join(', ');
    UI.toast('✓ 选择了: ' + names);
    Pages.draftState.pool = [...Pages.draftState.pool, ...(result.picked_cards || [])];
    Pages.draftState.thisPick = [];
    Pages.draftState.manualAssignments = {};

    if (result.draft_complete) {
      App.navigate('event-detail', { id: eventId });
      return;
    }

    // 选完后立即清空卡包区 + 显示等待横幅
    // 不再立即渲染新包 —— 等 WS draft_updated 触发完整重渲染
    Pages.draftState.alreadyPicked = true;
    Pages.draftState.currentPack = [];
    Pages.draftState.pending = [];
    const grid = document.getElementById('pack-cards');
    if (grid) grid.innerHTML = '';
    const banner = document.getElementById('dp-waiting-banner');
    if (banner) {
      if (!result.round_complete && result.waiting_for && result.waiting_for.length > 0) {
        const names2 = result.waiting_for.map(w => '座位' + w.seat + ' ' + w.username).join('、');
        banner.innerHTML = '⏳ 等待 ' + names2 + ' 选牌后传牌给你';
      } else {
        banner.innerHTML = '⏳ 等待新卡包...';
      }
      banner.style.display = '';
    }
    Pages.renderPoolArea(eventId);
    Pages.updateConfirmButton();
    // 不调用 renderPackArea / updateProgressSticky —— WS draft_updated 会触发 renderDraftLayout
  } catch (err) {
    UI.toast(err.message, 'error');
    if (btn) Pages.updateConfirmButton();
  }
};

Pages.updateProgressSticky = function(eventId, cardsPerPick) {
  API.get('/api/events/' + eventId).then(event => {
    const packData = event.my_participation?.current_packs || {};
    const cur = packData.current || (Array.isArray(packData) ? packData[0] : null) || [];
    const queue = packData.queue || [];
    const total = event.settings?.packs_per_player || 3;
    const packNum = total - queue.length;
    const dir = packNum % 2 === 1 ? '左传' : '右传';
    Pages.draftState.packNumber = packNum;
    Pages.draftState.direction = dir;
    Pages.draftState.remainingPacks = queue.length + 1;
    Pages.draftState.currentPack = cur;
    const items = document.querySelectorAll('.draft-progress-info .item .value');
    if (items.length >= 5) {
      items[0].innerHTML = '<span id="dp-pick-count">' + Pages.draftState.thisPick.length + '</span> / ' + cardsPerPick;
      items[1].innerHTML = '第 ' + packNum + ' 包 ' + dir;
      items[2].textContent = cur.length + ' 张';
      items[3].textContent = String(Pages.draftState.pending.length);
      items[4].textContent = ((event.my_participation?.pool || []).length) + ' 张';
    }
    if (cur.length > 0 && !Pages.draftState.alreadyPicked) Pages.renderPackArea(cur, eventId);
  }).catch(() => {});
};

// =========================================================================
// Decks
// =========================================================================
Pages.renderDecks = async function(el) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  try {
    const decks = await API.get('/api/decks');
    el.innerHTML = `
      <div class="page-header">
        <h2>我的牌组</h2>
        <button class="btn btn-primary" onclick="App.navigate('deck-builder', {})">新建牌组</button>
      </div>
      <div class="card-grid">
        ${decks.map(deck => `
          <div class="card-item" onclick="App.navigate('deck-builder', {id:${deck.id}})" style="position:relative">
            <button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();Pages.deleteDeck(${deck.id})">×</button>
            <h3>${Pages.escapeHtml(deck.name)}</h3>
            <div class="card-meta">
              <span>主牌 ${(deck.main_deck || []).length}</span>
              <span>备牌 ${(deck.sideboard || []).length}</span>
              ${deck.event_name ? '<span>赛事: ' + Pages.escapeHtml(deck.event_name) + '</span>' : ''}
            </div>
          </div>
        `).join('') || '<div class="empty-state"><p>还没有牌组</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + Pages.escapeHtml(err.message) + '</p></div>';
  }
};

Pages.deleteDeck = async function(id) {
  if (!confirm('确定要删除这个牌组吗？')) return;
  try {
    await API.delete('/api/decks/' + id);
    UI.toast('牌组已删除');
    App.navigate('decks');
  } catch (err) { UI.toast(err.message, 'error'); }
};

// =========================================================================
// Deck Builder
// =========================================================================
Pages.renderDeckBuilder = async function(el, params) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  params = params || {};
  let pool = [], deckName = '新牌组', mainDeck = [], sideboard = [];
  let deckId = params.id, eventId = params.eventId;
  try {
    if (deckId) {
      const deck = await API.get('/api/decks/' + deckId);
      deckName = deck.name;
      mainDeck = deck.main_deck || [];
      sideboard = deck.sideboard || [];
      pool = [...mainDeck, ...sideboard];
    }
    if (params.pool && eventId) {
      const poolData = await API.get('/api/events/' + eventId + '/pool');
      pool = poolData.pool || [];
      deckName = '赛事牌组 #' + eventId;
    }
  } catch (err) { UI.toast(err.message, 'error'); }

  el.innerHTML = `
    <div class="page-header">
      <div>
        <button class="btn btn-secondary btn-sm mb-16" onclick="App.navigate('decks')">← 返回</button>
        <h2>牌组构建器</h2>
      </div>
      <div class="flex gap-8">
        <input type="text" id="deck-name-input" value="${Pages.escapeHtml(deckName)}" style="width:200px">
        <button class="btn btn-primary" onclick="Pages.saveDeck(${deckId || 'null'}, ${eventId || 'null'})">保存</button>
        ${deckId ? '<button class="btn btn-danger" onclick="Pages.deleteDeck(' + deckId + ')">删除</button>' : ''}
      </div>
    </div>
    <div class="deck-builder">
      <div class="deck-builder-section">
        <h3>卡池 <span class="deck-count" id="pool-count">0张</span></h3>
        <div id="pool-cards"></div>
      </div>
      <div class="deck-builder-section">
        <h3>主牌 <span class="deck-count" id="main-count">0张</span> <span style="font-size:0.75rem;color:var(--text-muted)">(目标40)</span></h3>
        <div id="main-cards"></div>
        <h3 style="margin-top:20px">备牌 <span class="deck-count" id="sb-count">0张</span></h3>
        <div id="sb-cards"></div>
      </div>
    </div>
  `;
  window._deckBuilderState = { pool, mainDeck, sideboard, deckId, eventId };
  Pages._renderDeckBuilderCards(pool, mainDeck, sideboard);
};

Pages._renderDeckBuilderCards = function(pool, mainDeck, sideboard) {
  const availablePool = pool.filter(c => !mainDeck.find(m => m.id === c.id) && !sideboard.find(s => s.id === c.id));
  const poolGroups = UI.groupCardsByColor(availablePool);
  const mainGroups = UI.groupCardsByColor(mainDeck);
  const sbGroups = UI.groupCardsByColor(sideboard);

  const poolEl = document.getElementById('pool-cards');
  const mainEl = document.getElementById('main-cards');
  const sbEl = document.getElementById('sb-cards');
  if (!poolEl) return;

  poolEl.innerHTML = Object.entries(poolGroups).filter(([, cards]) => cards.length > 0).map(([color, cards]) => '<div class="color-group"><h4>' + (UI.COLOR_NAMES[color] || color) + ' (' + cards.length + ')</h4><div class="mtg-cards-grid pool-' + color + '"></div></div>').join('');
  mainEl.innerHTML = Object.entries(mainGroups).filter(([, cards]) => cards.length > 0).map(([color, cards]) => '<div class="color-group"><h4>' + (UI.COLOR_NAMES[color] || color) + ' (' + cards.length + ')</h4><div class="mtg-cards-grid main-' + color + '"></div></div>').join('');
  sbEl.innerHTML = Object.entries(sbGroups).filter(([, cards]) => cards.length > 0).map(([color, cards]) => '<div class="color-group"><h4>' + (UI.COLOR_NAMES[color] || color) + ' (' + cards.length + ')</h4><div class="mtg-cards-grid sb-' + color + '"></div></div>').join('');

  setTimeout(() => {
    Object.entries(poolGroups).filter(([, cards]) => cards.length > 0).forEach(([color, cards]) => {
      const grid = poolEl.querySelector('.pool-' + color);
      if (grid) cards.forEach(card => grid.appendChild(UI.createCardElement(card, () => {
        const state = window._deckBuilderState;
        state.mainDeck.push(card);
        Pages._renderDeckBuilderCards(state.pool, state.mainDeck, state.sideboard);
        Pages._updateDeckCounts(state.pool, state.mainDeck, state.sideboard);
      })));
    });
    Object.entries(mainGroups).filter(([, cards]) => cards.length > 0).forEach(([color, cards]) => {
      const grid = mainEl.querySelector('.main-' + color);
      if (grid) cards.forEach(card => grid.appendChild(UI.createCardElement(card, () => {
        const state = window._deckBuilderState;
        const idx = state.mainDeck.findIndex(m => m.id === card.id);
        if (idx > -1) state.mainDeck.splice(idx, 1);
        state.sideboard.push(card);
        Pages._renderDeckBuilderCards(state.pool, state.mainDeck, state.sideboard);
        Pages._updateDeckCounts(state.pool, state.mainDeck, state.sideboard);
      })));
    });
    Object.entries(sbGroups).filter(([, cards]) => cards.length > 0).forEach(([color, cards]) => {
      const grid = sbEl.querySelector('.sb-' + color);
      if (grid) cards.forEach(card => grid.appendChild(UI.createCardElement(card, () => {
        const state = window._deckBuilderState;
        const idx = state.sideboard.findIndex(s => s.id === card.id);
        if (idx > -1) state.sideboard.splice(idx, 1);
        Pages._renderDeckBuilderCards(state.pool, state.mainDeck, state.sideboard);
        Pages._updateDeckCounts(state.pool, state.mainDeck, state.sideboard);
      })));
    });
  }, 0);

  Pages._updateDeckCounts(pool, mainDeck, sideboard);
};

Pages._updateDeckCounts = function(pool, mainDeck, sideboard) {
  const availablePool = pool.filter(c => !mainDeck.find(m => m.id === c.id) && !sideboard.find(s => s.id === c.id));
  const pcEl = document.getElementById('pool-count');
  const mcEl = document.getElementById('main-count');
  const scEl = document.getElementById('sb-count');
  if (pcEl) pcEl.textContent = availablePool.length + ' 张';
  if (mcEl) {
    mcEl.textContent = mainDeck.length + ' 张';
    mcEl.className = 'deck-count ' + (mainDeck.length === 40 ? 'target-met' : mainDeck.length > 40 ? 'target-over' : '');
  }
  if (scEl) scEl.textContent = sideboard.length + ' 张';
};

Pages.saveDeck = async function(existingId, eventId) {
  const name = document.getElementById('deck-name-input').value.trim();
  if (!name) { UI.toast('请输入牌组名称', 'error'); return; }
  const state = window._deckBuilderState || { mainDeck: [], sideboard: [] };
  try {
    if (existingId) {
      await API.put('/api/decks/' + existingId, { name, main_deck: state.mainDeck, sideboard: state.sideboard });
    } else {
      await API.post('/api/decks', { name, main_deck: state.mainDeck, sideboard: state.sideboard, event_id: eventId || null });
    }
    UI.toast('牌组已保存');
    App.navigate('decks');
  } catch (err) { UI.toast(err.message, 'error'); }
};

// =========================================================================
// Profile
// =========================================================================
Pages.renderProfile = async function(el) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  try {
    const [user, stats] = await Promise.all([API.get('/api/me'), API.get('/api/stats')]);
    el.innerHTML = `
      <h2 style="margin-bottom:24px;color:var(--text-bright);font-size:1.8rem">个人资料</h2>
      <div class="event-info">
        <div class="info-row">用户名: <span>${Pages.escapeHtml(user.username)}</span></div>
        <div class="info-row">注册时间: <span>${Pages.formatDate(user.created_at)}</span></div>
        <div class="info-row">Cube: <span>${stats.cubes}</span></div>
        <div class="info-row">参与赛事: <span>${stats.events}</span></div>
        <div class="info-row">牌组: <span>${stats.decks}</span></div>
        <div class="info-row">对战: <span>${stats.battles}</span></div>
        <div class="info-row">胜场: <span>${stats.wins}</span></div>
      </div>
      <div class="mt-24">
        <h3 style="color:var(--text-bright);margin-bottom:12px">修改用户名</h3>
        <form onsubmit="Pages.handleUpdateProfile(event)" class="flex gap-8" style="max-width:400px">
          <input type="text" id="new-username" value="${Pages.escapeHtml(user.username)}" minlength="2">
          <button type="submit" class="btn btn-primary">更新</button>
        </form>
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + Pages.escapeHtml(err.message) + '</p></div>';
  }
};

Pages.handleUpdateProfile = async function(e) {
  e.preventDefault();
  const username = document.getElementById('new-username').value.trim();
  try {
    await API.put('/api/me', { username });
    App.state.user.username = username;
    document.getElementById('nav-username').textContent = username;
    UI.toast('用户名已更新');
  } catch (err) { UI.toast(err.message, 'error'); }
};

// =========================================================================
// Battles list
// =========================================================================
Pages.renderBattles = async function(el) {
  el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
  try {
    const battles = await API.get('/api/battles');
    el.innerHTML = `
      <div class="page-header">
        <h2>对战大厅</h2>
        <button class="btn btn-primary" onclick="Pages.showCreateBattleModal()">创建对战</button>
      </div>
      <div class="card-grid">
        ${battles.map(b => `
          <div class="card-item" onclick="App.navigate('battle-detail', {id:${b.id}})">
            <h3>${Pages.escapeHtml(b.name || ('对战 #' + b.id))}</h3>
            ${UI.statusBadge(b.status)}
            <div class="card-meta">
              <span>${Pages.escapeHtml(b.player1_name || '等待中')}</span>
              <span style="color:var(--accent)">vs</span>
              <span>${Pages.escapeHtml(b.player2_name || '等待加入')}</span>
            </div>
          </div>
        `).join('') || '<div class="empty-state"><p>暂无对战</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + Pages.escapeHtml(err.message) + '</p></div>';
  }
};

Pages.showCreateBattleModal = async function() {
  let decks = [];
  try { decks = await API.get('/api/decks'); } catch {}
  if (decks.length === 0) {
    UI.toast('请先创建一个牌组', 'error');
    App.navigate('decks');
    return;
  }
  UI.showModal('创建对战', `
    <form onsubmit="Pages.handleCreateBattle(event)">
      <div class="form-group"><label>对战名称（可选）</label><input type="text" id="battle-name"></div>
      <div class="form-group">
        <label>选择牌组</label>
        <select id="battle-deck" required>
          ${decks.map(d => '<option value="' + d.id + '">' + Pages.escapeHtml(d.name) + ' (' + (d.main_deck || []).length + ' 张)</option>').join('')}
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-block">创建</button>
    </form>
  `);
};

Pages.handleCreateBattle = async function(e) {
  e.preventDefault();
  try {
    const result = await API.post('/api/battles', {
      name: document.getElementById('battle-name').value.trim() || undefined,
      deck_id: parseInt(document.getElementById('battle-deck').value)
    });
    UI.closeModal();
    UI.toast('对战创建成功');
    App.navigate('battle-detail', { id: result.id });
  } catch (err) { UI.toast(err.message, 'error'); }
};