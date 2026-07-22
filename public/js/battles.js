// ============================================================
// battles.js — Battle management, lobby, create/join
// ============================================================
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
      var gs = battle.game_state;
      var myKey = state.myKey;
      if (!myKey) {
        for (var k of Object.keys(gs.players)) {
          if (String(gs.players[k].userId) === String(state.user?.id)) { myKey = k; break; }
        }
      }
      if (!myKey) myKey = String(battle.player1_id) === String(state.user?.id) ? 'p1' : 'p2';
      var oppKey = state.oppKey || (Object.keys(gs.players).find(function(k) { return k !== myKey; }) || 'p2');
      state.myKey = myKey;
      state.oppKey = oppKey;
      state.allPlayerKeys = Object.keys(gs.players);
      state.isMultiplayer = gs.isMultiplayer || battle.battle_type === 'multiplayer';
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
        ${battles.map(b => {
          var battleTypeLabel = b.battle_type === 'multiplayer' ? '多人' : '1v1';
          var deckTypeLabel = b.deck_type === 'commander' ? '指挥官' : '普通';
          var formatTypeLabel = b.format_type === 'limited' ? '限制赛' : '普通';
          var playerCountLabel = b.battle_type === 'multiplayer' && b.player_count ? ' · ' + b.player_count + '人' : '';
          return `
          <div class="card-item" onclick="navigate('battle-detail', {id:${b.id}})" style="position:relative">
            <button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();deleteBattle(${b.id})" title="删除对战">&times;</button>
            <h3>${b.name || '对战 #' + b.id}</h3>
            <span class="badge badge-${b.status === 'waiting' ? 'waiting' : b.status === 'in_progress' ? 'progress' : 'completed'}">
              ${b.status === 'waiting' ? '等待中' : b.status === 'in_progress' ? '进行中' : '已完成'}
            </span>
            <div class="card-meta" style="margin-top:6px;flex-wrap:wrap;gap:4px">
              <span class="deck-tag" style="background:rgba(78,168,222,0.15);color:#4ea8de;border:1px solid rgba(78,168,222,0.3)">${battleTypeLabel}${playerCountLabel}</span>
              <span class="deck-tag" style="background:rgba(212,175,55,0.15);color:#d4af37;border:1px solid rgba(212,175,55,0.3)">${deckTypeLabel}</span>
              <span class="deck-tag" style="background:rgba(122,130,153,0.15);color:#8a8a9a;border:1px solid rgba(122,130,153,0.3)">${formatTypeLabel}</span>
            </div>
            <div class="card-meta" style="margin-top:6px">
              <span>${b.player1_name || '等待中'}</span>
              <span>vs</span>
              <span>${b.player2_name || '等待中'}</span>
            </div>
            ${b.winner_id ? `<div class="text-muted" style="font-size:0.8rem;margin-top:4px">胜者: ${b.winner_id === b.player1_id ? b.player1_name : b.player2_name}</div>` : ''}
          </div>`;
        }).join('') || '<div class="empty-state"><h3>暂无对战</h3><p>点击"创建对战"开始</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${err.message}</p></div>`;
  }
}

async function deleteBattle(id) {
  if (!confirm('确定要删除这场对战吗？')) return;
  try {
    await api('/api/battles/' + id, { method: 'DELETE' });
    showToast('对战已删除');
    navigate('battles');
  } catch (err) { showToast(err.message, 'error'); }
}

async function showCreateBattleModal() {
  try {
    const allDecks = await api('/api/decks');
    if (allDecks.length === 0) { showToast('请先创建一个牌组', 'error'); return; }

    var modalState = { battleType: '1v1', deckType: 'normal', formatType: 'normal' };

    function filterDecks() {
      return allDecks.filter(function(d) {
        var isLimited = !!d.event_id;
        var isCommander = d.type === 'commander';
        if (modalState.deckType === 'commander' && !isCommander) return false;
        if (modalState.deckType === 'normal' && isCommander) return false;
        if (modalState.formatType === 'limited' && !isLimited) return false;
        if (modalState.formatType === 'normal' && isLimited) return false;
        return true;
      });
    }

    function renderModal() {
      var bt = modalState.battleType;
      var dt = modalState.deckType;
      var ft = modalState.formatType;
      var filtered = filterDecks();
      var deckOptions = filtered.map(function(d) {
        var count = Array.isArray(d.main_deck) ? d.main_deck.length : 0;
        return '<option value="' + d.id + '">' + escapeHtml(d.name) + ' (' + count + '张)</option>';
      }).join('');
      if (filtered.length === 0) {
        deckOptions = '<option value="" disabled selected>无符合条件的牌组</option>';
      }
      var playerCountHtml = bt === 'multiplayer'
        ? '<div class="form-group"><label>对战人数</label><input type="number" id="battle-player-count" min="3" max="8" value="3" style="width:100%"></div>'
        : '';

      showModal('创建对战',
        '<form onsubmit="handleCreateBattle(event)">' +
        '<div class="form-group"><label>对战名称</label><input type="text" id="battle-name" placeholder="我的对战" value="' + escapeHtml(state.user?.username || '') + '的对战"></div>' +
        '<div class="form-group"><label>对战模式</label>' +
          '<div class="tab-switcher">' +
            '<button type="button" class="tab-option' + (bt === '1v1' ? ' active' : '') + '" onclick="window._setBattleTab(\'battleType\',\'1v1\')">1v1 对战</button>' +
            '<button type="button" class="tab-option' + (bt === 'multiplayer' ? ' active' : '') + '" onclick="window._setBattleTab(\'battleType\',\'multiplayer\')">多人对战</button>' +
          '</div>' +
        '</div>' +
        playerCountHtml +
        '<div class="form-group"><label>牌组类型</label>' +
          '<div class="tab-switcher">' +
            '<button type="button" class="tab-option' + (dt === 'normal' ? ' active' : '') + '" onclick="window._setBattleTab(\'deckType\',\'normal\')">普通牌组</button>' +
            '<button type="button" class="tab-option' + (dt === 'commander' ? ' active' : '') + '" onclick="window._setBattleTab(\'deckType\',\'commander\')">指挥官牌组</button>' +
          '</div>' +
        '</div>' +
        '<div class="form-group"><label>对战格式</label>' +
          '<div class="tab-switcher">' +
            '<button type="button" class="tab-option' + (ft === 'normal' ? ' active' : '') + '" onclick="window._setBattleTab(\'formatType\',\'normal\')">普通对战</button>' +
            '<button type="button" class="tab-option' + (ft === 'limited' ? ' active' : '') + '" onclick="window._setBattleTab(\'formatType\',\'limited\')">限制赛对战</button>' +
          '</div>' +
        '</div>' +
        '<div class="form-group"><label>选择牌组</label>' +
          '<select id="battle-deck" required>' + deckOptions + '</select>' +
          (filtered.length === 0 ? '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">当前没有符合条件的牌组，请先创建对应类型的牌组</div>' : '') +
        '</div>' +
        '<input type="hidden" id="battle-type" value="' + bt + '">' +
        '<input type="hidden" id="battle-deck-type" value="' + dt + '">' +
        '<input type="hidden" id="battle-format-type" value="' + ft + '">' +
        '<button type="submit" class="btn btn-primary btn-block"' + (filtered.length === 0 ? ' disabled' : '') + '>创建</button>' +
        '</form>'
      );
    }

    window._setBattleTab = function(key, val) {
      modalState[key] = val;
      renderModal();
    };

    renderModal();
  } catch (err) { showToast(err.message, 'error'); }
}

async function handleCreateBattle(e) {
  e.preventDefault();
  const name = document.getElementById('battle-name').value.trim();
  const deck_id = parseInt(document.getElementById('battle-deck').value);
  if (!deck_id) { showToast('请选择一个牌组', 'error'); return; }
  const battle_type = document.getElementById('battle-type').value;
  const deck_type = document.getElementById('battle-deck-type').value;
  const format_type = document.getElementById('battle-format-type').value;
  const playerCountEl = document.getElementById('battle-player-count');
  const player_count = playerCountEl ? parseInt(playerCountEl.value) : 2;
  try {
    const battle = await api('/api/battles', { method: 'POST', body: JSON.stringify({ deck_id, name, battle_type, deck_type, format_type, player_count }) });
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
  const isBye = !battle.player2_id;
  const winnerName = battle.winner_id === battle.player1_id ? battle.player1_name : battle.player2_name;
  el.innerHTML = `
    <div class="page-header">
      <button class="btn btn-secondary btn-sm" onclick="navigate('battles')">← 返回</button>
      <h2 style="display:inline;margin-left:12px">${escapeHtml(battle.name || ('对战 #' + id))}</h2>
    </div>
    ${isBye
      ? `<div class="mtga-win-banner">轮空晋级 — ${escapeHtml(battle.player1_name || '玩家')} 自动获胜</div>`
      : `<div class="mtga-win-banner">🏆 ${escapeHtml(winnerName || '玩家')} 获胜</div>`}
    <div style="text-align:center;margin-top:16px">
      <button class="btn btn-primary" onclick="navigate('battles')">返回对战列表</button>
    </div>
  `;
}

async function joinBattle(battleId) {
  try {
    const battle = await api('/api/battles/' + battleId);
    const allDecks = await api('/api/decks');
    var filtered = allDecks.filter(function(d) {
      var isLimited = !!d.event_id;
      var isCommander = d.type === 'commander';
      var bDeckType = battle.deck_type || 'normal';
      var bFormatType = battle.format_type || 'normal';
      if (bDeckType === 'commander' && !isCommander) return false;
      if (bDeckType === 'normal' && isCommander) return false;
      if (bFormatType === 'limited' && !isLimited) return false;
      if (bFormatType === 'normal' && isLimited) return false;
      return true;
    });
    if (filtered.length === 0) { showToast('没有符合该对战要求的牌组', 'error'); return; }
    showModal('加入对战',
      '<form onsubmit="handleJoinBattle(event,' + battleId + ')">' +
      '<div class="form-group"><label>选择牌组</label>' +
      '<select id="join-battle-deck" required>' +
      filtered.map(function(d) { return '<option value="' + d.id + '">' + escapeHtml(d.name) + ' (' + (Array.isArray(d.main_deck) ? d.main_deck.length : 0) + '张)</option>'; }).join('') +
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
  const isMultiplayer = battle.battle_type === 'multiplayer';
  const players = battle.players || [];
  const myUserId = String(state.user?.id);
  const isOwner = String(battle.player1_id) === String(state.user?.id);
  const hasJoined = players.some(function(p) { return String(p.user_id) === myUserId; });
  const requiredCount = isMultiplayer ? (battle.player_count || 3) : 2;
  const currentCount = players.length;
  const isFull = currentCount >= requiredCount;
  const canJoin = !hasJoined && !isFull && state.user?.id != null && battle.status === 'waiting';
  const canStart = isOwner && isFull && battle.status === 'waiting';

  var battleTypeLabel = isMultiplayer ? '多人对战' : '1v1 对战';
  var deckTypeLabel = battle.deck_type === 'commander' ? '指挥官牌组' : '普通牌组';
  var formatTypeLabel = battle.format_type === 'limited' ? '限制赛' : '普通';
  var playerCountInfo = isMultiplayer ? ' · ' + currentCount + '/' + requiredCount + '人' : '';

  var playersHtml = '';
  if (isMultiplayer) {
    playersHtml = players.map(function(p, i) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(255,255,255,0.05);border-radius:8px">' +
        '<span style="font-weight:600;color:var(--accent)">P' + (i + 1) + '</span>' +
        '<span>' + escapeHtml(p.username || '玩家' + (i + 1)) + '</span>' +
        (i === 0 ? '<span style="font-size:0.7rem;color:var(--text-muted)">(创建者)</span>' : '') +
      '</div>';
    }).join('');
    for (var i = currentCount; i < requiredCount; i++) {
      playersHtml += '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px dashed rgba(255,255,255,0.15);border-radius:8px;color:var(--text-muted)">' +
        '<span style="font-weight:600">P' + (i + 1) + '</span>' +
        '<span>等待加入...</span>' +
      '</div>';
    }
  }

  var statusText = isMultiplayer
    ? (isFull ? '所有玩家已就位' : '等待玩家加入 (' + currentCount + '/' + requiredCount + ')')
    : (battle.player2_id ? '双方已就位' : '等待对手加入');
  var vsText = isMultiplayer
    ? players.map(function(p) { return escapeHtml(p.username || '玩家'); }).join(' vs ') || '---'
    : (escapeHtml(battle.player1_name || '玩家1') + ' vs ' + (battle.player2_id ? escapeHtml(battle.player2_name || '玩家2') : '???'));

  el.innerHTML = `
    <div class="page-header">
      <button class="btn btn-secondary btn-sm" onclick="navigate('battles')">← 返回</button>
      <h2 style="display:inline;margin-left:12px">${escapeHtml(battle.name || ('对战 #' + id))}</h2>
    </div>
    <div class="empty-state">
      <h3>${statusText}</h3>
      <p>${vsText}</p>
      <div style="margin-top:12px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
        <span class="deck-tag" style="background:rgba(78,168,222,0.15);color:#4ea8de;border:1px solid rgba(78,168,222,0.3)">${battleTypeLabel}${playerCountInfo}</span>
        <span class="deck-tag" style="background:rgba(212,175,55,0.15);color:#d4af37;border:1px solid rgba(212,175,55,0.3)">${deckTypeLabel}</span>
        <span class="deck-tag" style="background:rgba(122,130,153,0.15);color:#8a8a9a;border:1px solid rgba(122,130,153,0.3)">${formatTypeLabel}</span>
      </div>
      ${isMultiplayer ? '<div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;align-items:center">' + playersHtml + '</div>' : ''}
      ${canJoin ? `<button class="btn btn-success" style="margin-top:16px" onclick="joinBattle(${id})">加入对战</button>` : ''}
      ${canStart ? `<button class="btn btn-warning" style="margin-top:16px" onclick="startBattle(${id})">开始对战</button>` : ''}
      ${isOwner && !isFull && isMultiplayer ? '<p class="text-muted" style="margin-top:12px">需要 ' + requiredCount + ' 人才能开始，当前 ' + currentCount + ' 人</p>' : ''}
      ${!canJoin && !canStart && !isMultiplayer ? '<p class="text-muted" style="margin-top:12px">等待其他玩家操作...</p>' : ''}
      ${!isOwner && !canJoin && battle.status === 'waiting' && isMultiplayer ? '<p class="text-muted" style="margin-top:12px">等待房主开始对战...</p>' : ''}
    </div>
  `;
}
