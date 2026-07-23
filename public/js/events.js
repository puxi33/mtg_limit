// ============================================================
// events.js — Events, drafting, draft columns
// ============================================================

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
            <span class="badge" style="background:${(ev.settings && ev.settings.format || 'bo3') === 'bo1' ? '#e74c3c' : (ev.settings && ev.settings.format) === 'multiplayer' ? '#9b59b6' : '#3498db'};font-size:0.7rem">${(ev.settings && ev.settings.format || 'bo3') === 'bo1' ? 'BO1' : (ev.settings && ev.settings.format) === 'multiplayer' ? '多人' : 'BO3'}</span>
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
            <option value="multiplayer">多人对战</option>
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
  // Stop any existing draft polling and reset state
  if (draftPollInterval) { clearInterval(draftPollInterval); draftPollInterval = null; }
  window._draftWaiting = false;
  window._lastPackIds = null;
  window._lastPoolSize = null;
  window._autoDeckInProgress = false;
  _columnMode = 'draft';
  _resetColumnKeysToBase();
  // Note: preserve _draftColumns, _manualPlacements, and localStorage data
  // so the deck builder can use draft grouping info after draft completion

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

    // Helper: check if current user is in a battle (1v1 or multiplayer)
    function isUserInBattle(b, uid) {
      if (b.battle_type === 'multiplayer') return (b.players || []).some(function(p) { return p.user_id === uid; });
      return b.player1_id === uid || b.player2_id === uid;
    }

    // My active battle (if any)
    const myActiveBattle = (eventBattles || []).find(b =>
      b.status === 'in_progress' && isUserInBattle(b, state.user?.id)
    );
    const myWaitingBattle = (eventBattles || []).find(b =>
      b.status === 'waiting' && isUserInBattle(b, state.user?.id)
    );

    // Tournament state
    const currentMaxRound = (eventBattles || []).reduce((max, b) => Math.max(max, b.round || 1), 0);
    const allBattlesDone = (eventBattles || []).length > 0 && (eventBattles || []).every(b => b.status === 'completed');
    const currentRoundBattles = (eventBattles || []).filter(b => (b.round || 1) === currentMaxRound);
    const allBattlesCompleted = (eventBattles || []).length > 0 && (eventBattles || []).every(b => b.status === 'completed');
    // Double elimination: eliminated only if lost a losers-bracket or finals match and no active battles
    const myEliminated = (() => {
      const uid = state.user?.id;
      if (!uid) return false;
      const hasActiveBattle = (eventBattles || []).some(b =>
        (b.status === 'in_progress' || b.status === 'waiting') &&
        (b.player1_id === uid || b.player2_id === uid)
      );
      if (hasActiveBattle) return false;
      const lostEliminatingBattle = (eventBattles || []).some(b =>
        b.status === 'completed' && b.winner_id && b.winner_id !== uid &&
        (b.player1_id === uid || b.player2_id === uid) &&
        (b.bracket === 'losers' || b.bracket === 'finals')
      );
      if (!lostEliminatingBattle) {
        // Only check "not in any remaining round" if battles actually exist
        if ((eventBattles || []).length === 0) return false; // no battles yet, tournament hasn't started
        const anyIncompleteBattle = (eventBattles || []).some(b => b.status !== 'completed');
        if (anyIncompleteBattle) {
          // Tournament in progress but I have no active battle and didn't lose an eliminating one
          // Could be between rounds - not eliminated
          return false;
        }
        // All battles done - check if I'm the tournament champion
        const wonFinals = (eventBattles || []).some(b =>
          b.status === 'completed' && b.winner_id === uid && b.bracket === 'finals'
        );
        if (wonFinals) return false; // tournament champion
        // All battles done and I'm not the champion and didn't lose eliminating match
        // This means tournament is over and I was eliminated earlier
        return (eventBattles || []).some(b =>
          b.status === 'completed' && b.winner_id && b.winner_id !== uid &&
          (b.player1_id === uid || b.player2_id === uid)
        );
      }
      return lostEliminatingBattle;
    })();

    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="navigate('events')">← 返回</button>
          <h2>${event.name}</h2>
          <div style="margin-top:4px">
            <span class="badge badge-${event.type}">${event.type === 'draft' ? '轮抓' : '现开'}</span>
            <span class="badge" style="background:${(settings.format || 'bo3') === 'bo1' ? '#e74c3c' : settings.format === 'multiplayer' ? '#9b59b6' : '#3498db'}">${(settings.format || 'bo3') === 'bo1' ? 'BO1' : settings.format === 'multiplayer' ? '多人对战' : 'BO3'}</span>
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
                  ${myActiveBattle.battle_type === 'multiplayer'
                    ? '多人对战 (' + (myActiveBattle.players || []).length + '人)'
                    : '第' + (myActiveBattle.round || 1) + '轮: ' + myActiveBattle.player1_name + ' vs ' + myActiveBattle.player2_name}
                </strong>
                ${myActiveBattle.battle_type === 'multiplayer'
                  ? '<div class="text-muted" style="font-size:0.85rem;margin-top:4px">' + (myActiveBattle.players || []).map(function(p) { return p.username; }).join(', ') + '</div>'
                  : '<span class="text-muted" style="font-size:0.85rem;margin-left:8px">第' + (myActiveBattle.current_game || 1) + '局 | ' + (myActiveBattle.player1_wins || 0) + '-' + (myActiveBattle.player2_wins || 0) + '</span>'}
              </div>
              <button class="btn btn-primary btn-sm" onclick="openBattle(${myActiveBattle.id})">进入对战</button>
            ` : myWaitingBattle ? `
              <div style="margin-bottom:8px">
                <strong style="color:var(--text-bright)">
                  ${myWaitingBattle.battle_type === 'multiplayer'
                    ? '多人对战 (' + (myWaitingBattle.players || []).length + '人)'
                    : '第' + (myWaitingBattle.round || 1) + '轮: ' + myWaitingBattle.player1_name + ' vs ' + myWaitingBattle.player2_name}
                </strong>
                ${myWaitingBattle.battle_type === 'multiplayer'
                  ? '<div class="text-muted" style="font-size:0.85rem;margin-top:4px">' + (myWaitingBattle.players || []).map(function(p) { return p.username; }).join(', ') + '</div>'
                  : ''}
              </div>
              <div class="text-muted" style="font-size:0.85rem">${myWaitingBattle.battle_type === 'multiplayer' ? '等待所有玩家就绪，由创建者开始对战' : '等待双方就绪，由创建者开始对战'}</div>
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
            ${settings.format === 'multiplayer' ? `
              <h3 style="color:var(--text-bright);margin-bottom:8px">多人对战</h3>
              <p class="text-muted" style="margin-bottom:12px">所有玩家构建完牌组后，点击创建多人对战（所有玩家自动加入同一场对战）</p>
              <button class="btn btn-primary" onclick="startMultiplayerBattle(${id})">开始多人对战</button>
            ` : `
              <h3 style="color:var(--text-bright);margin-bottom:8px">双败淘汰配对</h3>
              <p class="text-muted" style="margin-bottom:12px">所有玩家构建完牌组后，点击自动配对开始第一轮（胜者组+败者组双败淘汰制）</p>
              <button class="btn btn-primary" onclick="autoPairEvent(${id})">自动配对</button>
            `}
          </div>
        ` : isOwner && allBattlesCompleted && settings.format !== 'multiplayer' ? `
          <div style="margin-bottom:24px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);text-align:center">
            <h3 style="color:var(--text-bright);margin-bottom:8px">所有对战已结束</h3>
            <p class="text-muted" style="margin-bottom:12px">点击配对下一轮（胜者组/败者组/总决赛自动推进）</p>
            <button class="btn btn-primary" onclick="nextRoundEvent(${id})">配对下一轮</button>
          </div>
        ` : ''}
      ` : ''}

      <!-- Deck Display (read-only column style, same layout as draft columns) -->
      ${myDeck && myDeck.main_deck && myDeck.main_deck.length > 0 ? `
        <div class="draft-redesign" id="deck-overview-redesign">
          <div class="draft-columns-area" id="deck-overview-area">
            <div class="draft-columns-header">
              <span style="color:var(--text-bright);font-size:0.85rem;font-weight:600">
                牌组 <span class="text-muted" style="font-weight:400">(${myDeck.main_deck.length}张)</span>
                ${myDeck.sideboard && myDeck.sideboard.length > 0 ? `<span class="text-muted" style="font-weight:400;margin-left:8px">| 备牌 ${myDeck.sideboard.length}张</span>` : ''}
              </span>
            </div>
            <div class="draft-columns-scroll" id="deck-overview-columns"></div>
          </div>
        </div>
      ` : ''}

      <!-- Event Battles -->
      ${(eventBattles || []).length > 0 ? `
        <div style="margin-bottom:24px">
          ${(() => {
            const mpBattle = (eventBattles || []).find(b => b.battle_type === 'multiplayer');
            if (!mpBattle) return '';
            const players = mpBattle.players || [];
            const statusLabel = mpBattle.status === 'completed' ? '已结束' : mpBattle.status === 'in_progress' ? '进行中' : '等待中';
            const statusClass = mpBattle.status === 'completed' ? 'completed' : mpBattle.status === 'in_progress' ? 'progress' : 'waiting';
            const isPlayer = players.some(function(p) { return p.user_id === state.user?.id; });
            return '<h3 style="color:var(--text-bright);margin-bottom:12px">多人对战</h3>' +
              '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
                  '<div style="display:flex;align-items:center;gap:8px">' +
                    '<span class="badge" style="background:#9b59b6;color:#fff;font-size:0.7rem">多人</span>' +
                    '<strong style="color:var(--text-bright)">' + players.length + '人对战</strong>' +
                    '<span class="badge badge-' + statusClass + '">' + statusLabel + '</span>' +
                  '</div>' +
                  (isPlayer ? '<button class="btn btn-secondary btn-sm" onclick="openBattle(' + mpBattle.id + ')">' + (mpBattle.status === 'completed' ? '查看' : '进入') + '</button>' : '') +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
                  players.map(function(p) {
                    var isMe = p.user_id === state.user?.id;
                    return '<span style="padding:4px 10px;background:' + (isMe ? 'var(--primary)' : 'var(--surface)') + ';color:' + (isMe ? '#fff' : 'var(--text-bright)') + ';border-radius:12px;font-size:0.85rem">' + (p.username || '?') + '</span>';
                  }).join('') +
                '</div>' +
              '</div>';
          })()}
          ${(eventBattles || []).some(function(b) { return b.battle_type !== 'multiplayer'; }) ? `
          <h3 style="color:var(--text-bright);margin-bottom:12px">双败淘汰赛</h3>
          ${[...new Set((eventBattles || []).filter(function(b) { return b.battle_type !== 'multiplayer'; }).map(b => b.round || 1))].sort((a, b) => a - b).map(round => {
            const roundBattles = (eventBattles || []).filter(function(b) { return b.battle_type !== 'multiplayer' && (b.round || 1) === round; });
            const roundDone = roundBattles.every(b => b.status === 'completed');
            const hasWinners = roundBattles.some(b => b.bracket === 'winners');
            const hasLosers = roundBattles.some(b => b.bracket === 'losers');
            const hasFinals = roundBattles.some(b => b.bracket === 'finals');
            const bracketLabel = hasFinals ? '🏆 总决赛' : (hasWinners && hasLosers ? '胜者组 + 败者组' : hasLosers ? '败者组' : '胜者组');
            const bracketBadgeColor = hasFinals ? '#d4a043' : (hasLosers ? '#e74c3c' : '#3498db');
            return `
              <div style="margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span style="color:var(--text-bright);font-weight:600;font-size:0.95rem">第${round}轮</span>
                  <span class="badge" style="background:${bracketBadgeColor};color:#fff;font-size:0.7rem">${bracketLabel}</span>
                  <span class="badge badge-${roundDone ? 'completed' : 'progress'}">${roundDone ? '已结束' : '进行中'}</span>
                </div>
                <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
                  ${roundBattles.map(b => {
                    const bBracket = b.bracket || 'winners';
                    const bBracketLabel = bBracket === 'finals' ? '🏆' : (bBracket === 'losers' ? 'LB' : 'WB');
                    const bBracketColor = bBracket === 'finals' ? '#d4a043' : (bBracket === 'losers' ? '#e74c3c' : '#3498db');
                    const isBye = !b.player2_id;
                    return `
                    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                      <div style="display:flex;align-items:center;gap:6px">
                        <span class="badge" style="background:${bBracketColor};color:#fff;font-size:0.6rem;padding:2px 6px">${bBracketLabel}</span>
                        <strong style="color:var(--success)">${b.player1_name || '?'}</strong>
                        ${isBye
                          ? '<span class="text-muted" style="margin:0 6px">轮空晋级</span>'
                          : `<span class="text-muted" style="margin:0 6px">vs</span>
                             <strong style="color:${b.status === 'completed' && b.winner_id === b.player2_id ? 'var(--success)' : 'var(--text-bright)'}">${b.player2_name || '?'}</strong>`}
                        <span class="badge badge-${b.status === 'completed' ? 'completed' : b.status === 'in_progress' ? 'progress' : 'waiting'}" style="margin-left:8px">
                          ${b.status === 'completed' ? '已结束' : b.status === 'in_progress' ? '进行中' : '等待中'}
                        </span>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px">
                        ${isBye
                          ? '<span style="font-weight:600;color:var(--success);font-size:0.9rem">轮空胜</span>'
                          : `<span style="font-weight:600;color:var(--text-bright);font-size:0.9rem">${b.player1_wins || 0} - ${b.player2_wins || 0}</span>
                             ${(b.player1_id === state.user?.id || b.player2_id === state.user?.id) ? '<button class="btn btn-secondary btn-sm" onclick="openBattle(' + b.id + ')">' + (b.status === 'completed' ? '查看' : '进入') + '</button>' : ''}`}
                      </div>
                    </div>`;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
          ` : ''}
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

      <!-- Event Info (bottom section) -->
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
        <div class="event-info-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px">
          <div class="stat-card"><div class="stat-value">${participants.length}/${settings.max_players || '?'}</div><div class="stat-label">参与者</div></div>
          <div class="stat-card"><div class="stat-value">${settings.packs_per_player || '?'}</div><div class="stat-label">包数/人</div></div>
          <div class="stat-card"><div class="stat-value">${settings.cards_per_pack || '?'}</div><div class="stat-label">卡牌/包</div></div>
          ${event.type === 'draft' ? `<div class="stat-card"><div class="stat-value">${cardsPerPick}</div><div class="stat-label">每次选牌数</div></div>` : ''}
          ${event.set_name ? `<div class="stat-card"><div class="stat-value" style="font-size:0.85rem">${escapeHtml(event.set_name)}</div><div class="stat-label">系列 (${event.set_code})</div></div>` : ''}
          ${event.cube_name ? `<div class="stat-card"><div class="stat-value" style="font-size:0.85rem">${escapeHtml(event.cube_name)}</div><div class="stat-label">Cube</div></div>` : ''}
        </div>
      </div>

      ${event.round_status ? `
        <div style="margin-bottom:16px;padding:12px;background:var(--surface);border-radius:8px">
          <strong style="color:var(--text-bright)">轮次状态:</strong>
          ${event.round_status.picked.length > 0 ? `<span class="text-muted"> 已选: ${event.round_status.picked.map(p => p.username || `座位${p.seat}`).join(', ')}</span>` : ''}
          ${event.round_status.waiting_for.length > 0 ? `<span style="color:var(--warning)"> | 等待: ${event.round_status.waiting_for.map(p => p.username || `座位${p.seat}`).join(', ')}</span>` : ''}
        </div>
      ` : ''}
    `;

    // Full-screen mode for deck overview redesign
    if (el.querySelector('#deck-overview-redesign')) {
      document.body.classList.add('draft-fullscreen');
    }

    // Render draft cards for picking (upper panel)
    if (isMyTurnToPick) {
      const container = el.querySelector('#draft-cards-container');
      if (container) {
        renderDraftCards(currentPack, cardsPerPick);
      }
    }

    // Auto create deck when draft is completed and no deck exists yet

    if (event.status === 'completed' && isParticipant && myParticipation.pool && myParticipation.pool.length > 0 && !myDeck && !window._autoDeckInProgress) {
      window._autoDeckInProgress = true;
      autoCreateDeckFromDraft(id, myParticipation.pool).then(function() {
        window._autoDeckInProgress = false;
      });
    }

    // Render read-only deck columns
    if (myDeck && myDeck.main_deck && myDeck.main_deck.length > 0) {
      renderReadOnlyDeckColumns('deck-overview-columns', myDeck);
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
    if (result.bye_player) msg += '，' + result.bye_player.name + ' 轮空晋级';
    showToast(msg);
    navigate('event-detail', { id: eventId });
  } catch (err) { showToast(err.message, 'error'); }
}

async function startMultiplayerBattle(eventId) {
  try {
    if (!confirm('确定要使用所有已构建牌组的玩家创建多人对战吗？')) return;
    const result = await api(`/api/events/${eventId}/multiplayer-battle`, { method: 'POST' });
    showToast('已创建多人对战，共 ' + result.player_count + ' 名玩家');
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
      const bracketLabel = result.bracket === 'finals' ? '总决赛' : result.bracket === 'both' ? '胜者组+败者组' : result.bracket === 'losers' ? '败者组' : result.bracket === 'winners' ? '胜者组' : '';
      var msg = '第' + result.round + '轮';
      if (bracketLabel) msg += '(' + bracketLabel + ')';
      msg += ': 已创建 ' + result.battles.length + ' 场对战';
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
var _draftStagedPicks = []; // Cards dragged from pick strip (multi-pick staging)
var _manualPlacements = {}; // { cardId: columnKey } — tracks user drag placements

function renderDraftCards(cards, cardsPerPick) {
  window._draftWaiting = false;
  window._lastPackIds = cards.map(c => String(c.id));
  window._currentDraftPack = cards; // Store for drag-drop access
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
  // Reset confirm button text
  var confirmBtnReset = document.getElementById('draft-confirm-btn');
  if (confirmBtnReset) { confirmBtnReset.disabled = true; confirmBtnReset.textContent = '确认选择'; }

  draftSelectedCards = [];
  container.innerHTML = '';

  cards.forEach(card => {
    const isStaged = _draftStagedPicks.some(s => String(s.id) === String(card.id));
    const el = createCardElement(card, () => {
      if (isStaged) return; // staged cards don't respond to clicks
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

    // Enable drag from pick strip (not for already-staged cards)
    if (!isStaged) {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'pick', cardId: card.id }));
        e.dataTransfer.effectAllowed = 'move';
        el.style.opacity = '0.5';
      });
      el.addEventListener('dragend', function() {
        el.style.opacity = '';
        document.querySelectorAll('.draft-column.drag-over').forEach(function(col) { col.classList.remove('drag-over'); });
      });
    }

    if (isStaged) {
      el.classList.add('staged');
    }

    container.appendChild(el);
  });

  // Use staged confirm UI if cards are staged via drag, otherwise use click-based UI
  if (_draftStagedPicks.length > 0) {
    updateStagedConfirmUI();
  } else {
    updateDraftConfirmUI(cardsPerPick);
  }
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

async function confirmDraftPickSingle(eventId, cardIds, cardData, targetColumn) {
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
      // If dragged to a specific column, record manual placement after API success
      // (before poll returns, so initDraftColumns respects user's column choice)
      if (cardData && targetColumn) {
        _manualPlacements[String(cardData.id)] = targetColumn;
        if (_draftColumns) {
          if (!_draftColumns[targetColumn]) _draftColumns[targetColumn] = [];
          _draftColumns[targetColumn].push(cardData);
          renderDraftColumns();
        }
      }
      // 不立即重渲染 —— 显示等待状态,等轮询把新包带回来
      window._draftWaiting = true;
      window._lastPackIds = remainingIds; // so poll knows the "old" remaining pack
      showDraftWaiting(eventId);
    }
  } catch (err) { showToast(err.message, 'error'); }
}

async function confirmDraftPick(eventId) {
  // If cards were staged via drag-drop, use staged picks
  if (_draftStagedPicks.length > 0) {
    return confirmStagedDraftPick(eventId);
  }
  // Otherwise use click-based selection
  const cardsPerPick = (state.pageData && state.pageData._cardsPerPick) || 1;
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
  _draftStagedPicks = [];
  // Keep pick strip visible but show waiting message inside
  var pickStrip = document.getElementById('draft-pick-strip');
  if (pickStrip) {
    var cardsContainer = document.getElementById('draft-cards-container');
    var confirmBar = document.getElementById('draft-confirm-bar');
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (confirmBar) confirmBar.style.display = 'none';
    var existingMsg = pickStrip.querySelector('.draft-waiting-msg');
    if (!existingMsg) {
      var msg = document.createElement('div');
      msg.className = 'draft-waiting-msg';
      msg.style.cssText = 'text-align:center;padding:2px 12px 6px;color:var(--warning);font-weight:600;font-size:0.9rem;min-height:168px;display:flex;flex-direction:column;align-items:center;justify-content:center';
      msg.innerHTML = '等待其他玩家选牌...<div class="text-muted" style="font-weight:400;font-size:0.8rem;margin-top:4px">新卡包到达后会自动显示</div>';
      pickStrip.appendChild(msg);
    }
  }
}

function showDraftPicking() {
  var pickStrip = document.getElementById('draft-pick-strip');
  if (pickStrip) {
    var cardsContainer = document.getElementById('draft-cards-container');
    var confirmBar = document.getElementById('draft-confirm-bar');
    if (cardsContainer) cardsContainer.style.display = '';
    if (confirmBar) confirmBar.style.display = '';
    var msg = pickStrip.querySelector('.draft-waiting-msg');
    if (msg) msg.remove();
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
      // Only update columns if pool changed
      var poolSize = (myParticipation.pool || []).length;
      if (window._lastPoolSize == null || window._lastPoolSize !== poolSize) {
        window._lastPoolSize = poolSize;
        initDraftColumns(myParticipation.pool || []);
        renderDraftColumns();
      }
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
        var poolSize2 = (myParticipation.pool || []).length;
        if (window._lastPoolSize == null || window._lastPoolSize !== poolSize2) {
          window._lastPoolSize = poolSize2;
          initDraftColumns(myParticipation.pool || []);
          renderDraftColumns();
        }
        return;
      }
      // New pack arrived, clear waiting and render
      window._draftWaiting = false;
      showDraftPicking();
    }

    // Normal polling: compare with last known pack IDs
    const lastIds = window._lastPackIds || [];
    const same = lastIds.length === newIds.length &&
      lastIds.every((id, i) => id === newIds[i]);

    if (!same) {
      window._lastPackIds = newIds;
      const cardsPerPick = (event.settings && event.settings.cards_per_pick) || 1;
      draftSelectedCards = [];
      _draftStagedPicks = [];
      renderDraftCards(currentPack, cardsPerPick);
    }

    // Only update columns if pool changed
    var poolSize3 = (myParticipation.pool || []).length;
    if (window._lastPoolSize == null || window._lastPoolSize !== poolSize3) {
      window._lastPoolSize = poolSize3;
      initDraftColumns(myParticipation.pool || []);
      renderDraftColumns();
    }
  } catch (err) {
    // Silently ignore poll errors to avoid UI disruption
  }
}

// ============================================================
// DRAFT COLUMNS SYSTEM (Two-panel redesign)
// ============================================================
var _draftColumns = null; // { '0': [], '1': [], ..., '6+': [], Land: [], Sideboard: [], Outside: [] }
var _baseColumnKeys = ['Outside', '0', '1', '2', '3', '4', '5', '6+', 'Land', 'Sideboard'];
var _draftColumnKeys = _baseColumnKeys.slice();
var _draftColumnNames = { '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6+': '6+', 'Land': '地', 'Sideboard': '备牌', 'Outside': '游戏外' };
var _customColumnCounter = 0;
var _draftColumnsEventId = null; // Tracks which event the draft columns belong to

// Column mode: 'draft' | 'deck' — makes the column system reusable for deck building
var _columnMode = 'draft';

// Context-aware column accessors
function _getColumns() { return _columnMode === 'deck' ? window._deckColumns : _draftColumns; }
function _setColumns(v) { if (_columnMode === 'deck') { window._deckColumns = v; } else { _draftColumns = v; } }
function _getManualPlacements() { return _columnMode === 'deck' ? (window._deckManualPlacements || {}) : _manualPlacements; }
function _setManualPlacement(cardId, col) {
  if (_columnMode === 'deck') {
    if (!window._deckManualPlacements) window._deckManualPlacements = {};
    window._deckManualPlacements[String(cardId)] = col;
  } else {
    _manualPlacements[String(cardId)] = col;
  }
}
function _getScrollEl() { return document.getElementById(_columnMode === 'deck' ? 'deck-columns-scroll' : 'draft-columns-scroll'); }
function _getPoolCountEl() { return document.getElementById(_columnMode === 'deck' ? 'deck-pool-count' : 'draft-pool-count'); }
function _clearManualPlacements() {
  if (_columnMode === 'deck') { window._deckManualPlacements = {}; } else { _manualPlacements = {}; }
}

function _createCustomColumnKey() {
  _customColumnCounter++;
  var key = 'custom_' + _customColumnCounter;
  _draftColumnNames[key] = '分组 ' + _customColumnCounter;
  return key;
}

function _insertColumnKeyAt(newKey, insertBeforeKey) {
  var idx = _draftColumnKeys.indexOf(insertBeforeKey);
  if (idx === -1) { _draftColumnKeys.push(newKey); return; }
  _draftColumnKeys.splice(idx, 0, newKey);
}

function _resetColumnKeysToBase() {
  _draftColumnKeys = _baseColumnKeys.slice();
}

function _removeEmptyCustomColumns() {
  var cols = _getColumns();
  if (!cols) return;
  var removed = false;
  for (var i = _draftColumnKeys.length - 1; i >= 0; i--) {
    var k = _draftColumnKeys[i];
    if (k.indexOf('custom_') === 0 && (!cols[k] || cols[k].length === 0)) {
      _draftColumnKeys.splice(i, 1);
      delete cols[k];
      delete _draftColumnNames[k];
      removed = true;
    }
  }
  return removed;
}

// Deck-mode storage key
function _deckStorageKey() {
  var deckId = (state.pageData && state.pageData._deckId) || 'unknown';
  return 'deck_cols_' + deckId;
}
function _saveDeckColumns() {
  if (!window._deckColumns) return;
  try {
    var data = { columns: window._deckColumns, keys: _draftColumnKeys, names: {} };
    _draftColumnKeys.forEach(function(k) {
      if (k.indexOf('custom_') === 0) data.names[k] = _draftColumnNames[k];
    });
    localStorage.setItem(_deckStorageKey(), JSON.stringify(data));
  } catch(e) {}
}
function _loadDeckColumns() {
  try {
    var saved = localStorage.getItem(_deckStorageKey());
    if (saved) {
      var data = JSON.parse(saved);
      if (data.columns) {
        window._deckColumns = data.columns;
        if (data.keys) _draftColumnKeys = data.keys;
        if (data.names) {
          Object.keys(data.names).forEach(function(k) { _draftColumnNames[k] = data.names[k]; });
          var maxCustom = 0;
          Object.keys(data.names).forEach(function(k) {
            var num = parseInt(k.replace('custom_', ''));
            if (num > maxCustom) maxCustom = num;
          });
          if (maxCustom > _customColumnCounter) _customColumnCounter = maxCustom;
        }
        return true;
      } else {
        window._deckColumns = data;
        return true;
      }
    }
  } catch(e) {}
  return false;
}
function _clearDeckColumns() {
  try { localStorage.removeItem(_deckStorageKey()); } catch(e) {}
  window._deckColumns = null;
  window._deckManualPlacements = {};
  _resetColumnKeysToBase();
}

// Initialize deck columns from pool + main_deck + outside_game
function initDeckColumns(pool, mainDeck, outsideGame, sideboard) {
  window._deckColumns = {};
  _draftColumnKeys.forEach(function(k) { window._deckColumns[k] = []; });
  var keySet = {};
  _draftColumnKeys.forEach(function(k) { keySet[k] = true; });
  // Place main deck cards — use _column tag if available
  (mainDeck || []).forEach(function(card) {
    var col = (card._column && keySet[card._column]) ? card._column : getDraftCardColumn(card);
    if (!window._deckColumns[col]) window._deckColumns[col] = [];
    window._deckColumns[col].push(card);
  });
  // Place outside game cards into Outside column
  (outsideGame || []).forEach(function(card) {
    window._deckColumns['Outside'].push(card);
  });
  // Place sideboard cards into Sideboard column
  (sideboard || []).forEach(function(card) {
    window._deckColumns['Sideboard'].push(card);
  });
  // Place pool (remaining cards not in any zone) into CMC columns
  (pool || []).forEach(function(card) {
    var col = getDraftCardColumn(card);
    if (!window._deckColumns[col]) window._deckColumns[col] = [];
    window._deckColumns[col].push(card);
  });
  _saveDeckColumns();
}

// Reset deck columns on navigation
function resetDeckColumns() {
  window._deckColumns = null;
  window._deckManualPlacements = {};
}

function _draftStorageKey() {
  var eid = (state.pageData && state.pageData.id) || 'unknown';
  return 'draft_cols_' + eid;
}

function _saveDraftColumns() {
  if (!_draftColumns) return;
  try {
    localStorage.setItem(_draftStorageKey(), JSON.stringify(_draftColumns));
    localStorage.setItem(_draftStorageKey() + '_placements', JSON.stringify(_manualPlacements));
  } catch(e) { /* ignore quota errors */ }
}

function _loadDraftColumns() {
  try {
    var saved = localStorage.getItem(_draftStorageKey());
    var savedPlacements = localStorage.getItem(_draftStorageKey() + '_placements');
    if (saved) {
      _draftColumns = JSON.parse(saved);
      // Ensure all keys exist
      _draftColumnKeys.forEach(function(k) {
        if (!_draftColumns[k]) _draftColumns[k] = [];
      });
    }
    if (savedPlacements) {
      _manualPlacements = JSON.parse(savedPlacements);
    }
  } catch(e) { /* ignore parse errors */ }
}

function _clearDraftColumns() {
  try {
    localStorage.removeItem(_draftStorageKey());
    localStorage.removeItem(_draftStorageKey() + '_placements');
  } catch(e) {}
  _draftColumns = null;
  _manualPlacements = {};
  _draftColumnsEventId = null;
}

function getDraftCardColumn(card) {
  if (card.type && card.type.indexOf('Land') >= 0) return 'Land';
  var cmc = getCardCMC(card);
  if (cmc >= 6) return '6+';
  return String(cmc);
}

function initDraftColumns(pool) {
  // Detect event switch — reset columns if navigating to a different event
  var currentEventId = (state.pageData && state.pageData.id) || null;
  if (currentEventId && _draftColumnsEventId && String(_draftColumnsEventId) !== String(currentEventId)) {
    // Different event — reset everything
    _draftColumns = null;
    _manualPlacements = {};
  }
  if (currentEventId) {
    _draftColumnsEventId = currentEventId;
  }

  // Try loading from localStorage on first init
  if (!_draftColumns) {
    _loadDraftColumns();
  }
  // If we already have columns with cards, merge new pool cards into them
  if (_draftColumns) {
    var existingIds = {};
    _draftColumnKeys.forEach(function(k) {
      (_draftColumns[k] || []).forEach(function(c) { existingIds[c.id] = true; });
    });
    pool.forEach(function(card) {
      if (!existingIds[card.id]) {
        // Check if user manually placed this card in a specific column
        var col = _manualPlacements[String(card.id)] || getDraftCardColumn(card);
        if (!_draftColumns[col]) _draftColumns[col] = [];
        _draftColumns[col].push(card);
      }
    });
    _saveDraftColumns();
    return;
  }
  // Fresh init
  _draftColumns = {};
  _draftColumnKeys.forEach(function(k) { _draftColumns[k] = []; });
  (pool || []).forEach(function(card) {
    // Check if user manually placed this card in a specific column
    var col = _manualPlacements[String(card.id)] || getDraftCardColumn(card);
    _draftColumns[col].push(card);
  });
  _saveDraftColumns();
}

function renderDraftColumns() {
  var scrollEl = _getScrollEl();
  var cols = _getColumns();
  if (!scrollEl || !cols) return;

  // Pre-compute name groups per column — rendering stacks one element per group,
  // so overlap must be based on group count, not raw card count
  var columnGroups = {};
  var maxGroups = 0;
  _draftColumnKeys.forEach(function(k) {
    var cards = cols[k] || [];
    var groups = [];
    var groupMap = {};
    cards.forEach(function(card) {
      var nameKey = card.name || String(card.id);
      if (!groupMap[nameKey]) {
        groupMap[nameKey] = [];
        groups.push({ name: nameKey, cards: groupMap[nameKey] });
      }
      groupMap[nameKey].push(card);
    });
    columnGroups[k] = groups;
    if (groups.length > maxGroups) maxGroups = groups.length;
  });

  // Calculate dimensions — actual card width excludes column body padding (8px each side)
  var colCount = _draftColumnKeys.length || 9;
  var colWidth = Math.max(110, scrollEl.clientWidth / colCount);
  var cardH = Math.max(60, (colWidth - 16) * 7 / 5);

  // Calculate overlap based on viewport constraint
  var rect = scrollEl.getBoundingClientRect();
  var viewportAvail = Math.max(200, window.innerHeight - (rect.top || 0) - 20);
  var headerH = 36;
  var bodyH = viewportAvail - headerH;
  var cardOverlap = 0;
  if (maxGroups > 1) {
    var fitOverlap = (cardH * maxGroups - bodyH) / (maxGroups - 1);
    cardOverlap = Math.max(0, fitOverlap);
    // Keep at least 20% of each card visible
    cardOverlap = Math.min(cardOverlap, cardH * 0.8);
  }

  scrollEl.innerHTML = '';

  _draftColumnKeys.forEach(function(key, keyIdx) {
    var cards = cols[key] || [];
    var colEl = document.createElement('div');
    colEl.className = 'draft-column' + (key === 'Sideboard' ? ' sideboard' : '');
    colEl.setAttribute('data-column', key);

    // Header
    var header = document.createElement('div');
    header.className = 'draft-column-header';
    header.innerHTML = '<span>' + (_draftColumnNames[key] || key) + '</span><span class="draft-column-count">' + cards.length + '</span>';
    colEl.appendChild(header);

    // Body (cards)
    var body = document.createElement('div');
    body.className = 'draft-column-body';
    body.setAttribute('data-column', key);

    if (cards.length === 0) {
      body.innerHTML = '<div class="draft-column-empty">拖拽卡牌到此列</div>';
    } else {
      var groups = columnGroups[key] || [];

      groups.forEach(function(group, groupIdx) {
        var card = group.cards[0]; // representative card for display
        var count = group.cards.length;

        var cardEl = createCardElement(card, null);
        cardEl.className = 'mtg-card draft-column-card';
        cardEl.style.width = '100%';
        cardEl.setAttribute('draggable', 'true');
        cardEl.setAttribute('data-card-id', card.id);
        cardEl.setAttribute('data-column', key);
        cardEl.style.zIndex = groupIdx + 1;
        if (groupIdx < groups.length - 1) {
          cardEl.style.marginBottom = -cardOverlap + 'px';
        }

        // Count badge for stacked identical cards
        if (count > 1) {
          var badge = document.createElement('div');
          badge.className = 'draft-col-card-count';
          badge.textContent = 'x' + count;
          cardEl.appendChild(badge);
        }

        // Drag start — only drags one card from the stack
        cardEl.addEventListener('dragstart', function(e) {
          e.dataTransfer.setData('text/plain', JSON.stringify({ cardId: card.id, fromColumn: key }));
          e.dataTransfer.effectAllowed = 'move';
          cardEl.classList.add('dragging');
          setTimeout(function() { cardEl.style.opacity = '0.4'; }, 0);
        });
        cardEl.addEventListener('dragend', function() {
          cardEl.classList.remove('dragging');
          cardEl.style.opacity = '';
          document.querySelectorAll('.draft-column.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
        });

        body.appendChild(cardEl);
      });
    }

    // Drop target
    body.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      colEl.classList.add('drag-over');
    });
    body.addEventListener('dragleave', function(e) {
      if (!body.contains(e.relatedTarget)) {
        colEl.classList.remove('drag-over');
      }
    });
    body.addEventListener('drop', function(e) {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      try {
        var data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.source === 'pick') {
          // Card dragged from pick strip
          var pickContainer = document.getElementById('draft-cards-container');
          var allCards = pickContainer ? Array.from(pickContainer.querySelectorAll('[data-card-id]')) : [];
          var cardData = null;
          allCards.forEach(function(cEl) {
            if (String(cEl.getAttribute('data-card-id')) === String(data.cardId)) {
              // Find the card object from window._lastPackIds or current pack
            }
          });
          // Get card object from the current pack (stored in a global for convenience)
          cardData = window._currentDraftPack ? window._currentDraftPack.find(function(c) {
            return String(c.id) === String(data.cardId);
          }) : null;
          if (cardData) {
            var cardsPerPick = (state.pageData && state.pageData._cardsPerPick) || 1;
            if (cardsPerPick <= 1) {
              // Single pick: immediately confirm, pass card data + target column for manual placement
              confirmDraftPickSingle(state.pageData.id || state.pageData, [data.cardId], cardData, key);
            } else {
              // Multi-pick: stage the card
              stageDraftPick(cardData, key);
            }
          }
        } else if (data.fromColumn) {
          // Column-to-column move
          handleDraftColumnDrop(data.cardId, data.fromColumn, key);
        } else if (data.source === 'deck-search' && data.card) {
          // Card dragged from search results into a column
          var cols = _getColumns();
          if (cols) {
            if (!cols[key]) cols[key] = [];
            cols[key].push(data.card);
            _setManualPlacement(data.card.id, key);
            if (_columnMode === 'deck') { _saveDeckColumns(); } else { _saveDraftColumns(); }
            renderDraftColumns();
          }
        }
      } catch (err) { /* ignore bad drops */ }
    });

    colEl.appendChild(body);
    scrollEl.appendChild(colEl);

    // Drop zone between columns (deck mode only)
    if (_columnMode === 'deck' && keyIdx < _draftColumnKeys.length - 1) {
      (function(nextKey) {
        var zone = document.createElement('div');
        zone.className = 'draft-column-dropzone';
        zone.addEventListener('dragover', function(e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          zone.classList.add('active');
        });
        zone.addEventListener('dragleave', function() {
          zone.classList.remove('active');
        });
        zone.addEventListener('drop', function(e) {
          e.preventDefault();
          zone.classList.remove('active');
          try {
            var data = JSON.parse(e.dataTransfer.getData('text/plain'));
            var newKey = _createCustomColumnKey();
            _insertColumnKeyAt(newKey, nextKey);
            var cols = _getColumns();
            if (cols) {
              cols[newKey] = [];
              if (data.fromColumn) {
                var fromArr = cols[data.fromColumn] || [];
                var cardIdx = -1;
                for (var i = 0; i < fromArr.length; i++) {
                  if (String(fromArr[i].id) === String(data.cardId)) { cardIdx = i; break; }
                }
                if (cardIdx >= 0) {
                  var card = fromArr.splice(cardIdx, 1)[0];
                  cols[newKey].push(card);
                }
              } else if (data.source === 'deck-search' && data.card) {
                cols[newKey].push(data.card);
              }
              _removeEmptyCustomColumns();
              _saveDeckColumns();
              renderDraftColumns();
            }
          } catch (err) { /* ignore bad drops */ }
        });
        scrollEl.appendChild(zone);
      })(_draftColumnKeys[keyIdx + 1]);
    }
  });

  // Update pool count
  var countEl = _getPoolCountEl();
  if (countEl) {
    var total = 0;
    _draftColumnKeys.forEach(function(k) {
      if (_columnMode === 'deck' && k === 'Sideboard') return;
      total += (cols[k] || []).length;
    });
    countEl.textContent = total + '张';
  }
}

function handleDraftColumnDrop(cardId, fromColumn, toColumn) {
  if (fromColumn === toColumn) return;
  var cols = _getColumns();
  if (!cols) return;
  var fromArr = cols[fromColumn] || [];
  var cardIdx = -1;
  for (var i = 0; i < fromArr.length; i++) {
    if (String(fromArr[i].id) === String(cardId)) { cardIdx = i; break; }
  }
  if (cardIdx < 0) return;
  var card = fromArr.splice(cardIdx, 1)[0];
  if (!cols[toColumn]) cols[toColumn] = [];
  cols[toColumn].push(card);
  _setManualPlacement(card.id, toColumn);
  _removeEmptyCustomColumns();
  if (_columnMode === 'deck') { _saveDeckColumns(); } else { _saveDraftColumns(); }
  renderDraftColumns();
}

function renderReadOnlyDeckColumns(containerId, deck) {
  var scrollEl = document.getElementById(containerId);
  if (!scrollEl || !deck) return;

  var hasCustomLayout = deck.column_keys && deck.column_keys.length > 0;
  var keys = hasCustomLayout ? deck.column_keys : _baseColumnKeys;
  var cols = {};
  keys.forEach(function(k) { cols[k] = []; });

  (deck.main_deck || []).forEach(function(card) {
    var col = (hasCustomLayout && card._column) ? card._column : getDraftCardColumn(card);
    if (!cols[col]) {
      if (hasCustomLayout) { col = getDraftCardColumn(card); }
      if (!cols[col]) cols[col] = [];
    }
    cols[col].push(card);
  });
  (deck.sideboard || []).forEach(function(card) {
    if (!cols['Sideboard']) cols['Sideboard'] = [];
    cols['Sideboard'].push(card);
  });
  (deck.outside_game || []).forEach(function(card) {
    if (!cols['Outside']) cols['Outside'] = [];
    cols['Outside'].push(card);
  });

  var maxCards = 0;
  keys.forEach(function(k) {
    var len = (cols[k] || []).length;
    if (len > maxCards) maxCards = len;
  });
  var colCount = keys.length || 9;
  var colWidth = Math.max(110, scrollEl.clientWidth / colCount);
  var cardH = colWidth * 7 / 5;

  // Calculate overlap based on viewport constraint
  var rect = scrollEl.getBoundingClientRect();
  var viewportAvail = Math.max(200, window.innerHeight - (rect.top || 0) - 20);
  var headerH = 36;
  var bodyH = viewportAvail - headerH;
  var cardOverlap = 0;
  if (maxCards > 1) {
    var fitOverlap = (cardH * maxCards - bodyH) / (maxCards - 1);
    cardOverlap = Math.max(0, fitOverlap);
    cardOverlap = Math.min(cardOverlap, cardH * 0.9);
  }

  scrollEl.innerHTML = '';

  keys.forEach(function(key) {
    var cards = cols[key] || [];
    if (cards.length === 0) return;

    var colEl = document.createElement('div');
    colEl.className = 'draft-column' + (key === 'Sideboard' ? ' sideboard' : '');
    colEl.setAttribute('data-column', key);

    var header = document.createElement('div');
    header.className = 'draft-column-header';
    header.innerHTML = '<span>' + (_draftColumnNames[key] || key) + '</span><span class="draft-column-count">' + cards.length + '</span>';
    colEl.appendChild(header);

    var body = document.createElement('div');
    body.className = 'draft-column-body';

    var groups = [];
    var groupMap = {};
    cards.forEach(function(card) {
      var nameKey = card.name || String(card.id);
      if (!groupMap[nameKey]) {
        groupMap[nameKey] = [];
        groups.push({ name: nameKey, cards: groupMap[nameKey] });
      }
      groupMap[nameKey].push(card);
    });

    groups.forEach(function(group, groupIdx) {
      var card = group.cards[0];
      var count = group.cards.length;

      var cardEl = createCardElement(card, null);
      cardEl.className = 'mtg-card draft-column-card';
      cardEl.style.width = '100%';
      cardEl.style.zIndex = groupIdx + 1;
      if (groupIdx < groups.length - 1) {
        cardEl.style.marginBottom = -cardOverlap + 'px';
      }

      if (count > 1) {
        var badge = document.createElement('div');
        badge.className = 'draft-col-card-count';
        badge.textContent = 'x' + count;
        cardEl.appendChild(badge);
      }

      body.appendChild(cardEl);
    });

    colEl.appendChild(body);
    scrollEl.appendChild(colEl);
  });
}

function stageDraftPick(card, targetColumn) {
  // Don't stage if already staged
  if (_draftStagedPicks.some(function(s) { return String(s.id) === String(card.id); })) return;
  var cardsPerPick = (state.pageData && state.pageData._cardsPerPick) || 1;
  if (_draftStagedPicks.length >= cardsPerPick) return; // already at max

  _draftStagedPicks.push({ card: card, column: targetColumn });

  // Add card to target column visually
  if (_draftColumns) {
    if (!_draftColumns[targetColumn]) _draftColumns[targetColumn] = [];
    _draftColumns[targetColumn].push(card);
    _saveDraftColumns();
    renderDraftColumns();
  }

  // Re-render pick strip to show staged state
  var currentPack = window._currentDraftPack || [];
  renderDraftCards(currentPack, cardsPerPick);

  // Update confirm UI
  updateStagedConfirmUI();

  // If we've staged enough cards, auto-confirm
  if (_draftStagedPicks.length >= cardsPerPick) {
    var confirmBtn = document.getElementById('draft-confirm-btn');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确认选择 (' + _draftStagedPicks.length + '/' + cardsPerPick + ')';
    }
  }
}

function updateStagedConfirmUI() {
  var cardsPerPick = (state.pageData && state.pageData._cardsPerPick) || 1;
  var container = document.getElementById('draft-cards-container');
  var currentPackLen = container ? container.querySelectorAll('[data-card-id]').length : 0;
  var maxPickable = Math.min(cardsPerPick, Math.max(1, currentPackLen));
  var countEl = document.getElementById('draft-selected-count');
  var btn = document.getElementById('draft-confirm-btn');
  if (countEl) countEl.textContent = '已选: ' + _draftStagedPicks.length + ' / ' + maxPickable;
  if (btn) {
    btn.disabled = _draftStagedPicks.length < 1 || _draftStagedPicks.length > maxPickable;
    if (_draftStagedPicks.length > 0) {
      btn.textContent = '确认选择 (' + _draftStagedPicks.length + '/' + maxPickable + ')';
    }
  }
}

async function confirmStagedDraftPick(eventId) {
  if (_draftStagedPicks.length < 1) {
    showToast('请先将卡牌拖到下方列中', 'error');
    return;
  }
  var cardsPerPick = (state.pageData && state.pageData._cardsPerPick) || 1;
  if (_draftStagedPicks.length > cardsPerPick) {
    showToast('已选卡牌过多', 'error');
    return;
  }
  var cardIds = _draftStagedPicks.map(function(s) { return s.card.id; });
  var confirmBtn = document.getElementById('draft-confirm-btn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '确认中...'; }

  try {
    var remainingIds = (window._lastPackIds || []).filter(function(id) {
      return cardIds.indexOf(id) === -1 && cardIds.indexOf(Number(id)) === -1 && cardIds.indexOf(String(id)) === -1;
    });
    var result = await api('/api/events/' + eventId + '/pick', {
      method: 'POST',
      body: JSON.stringify({ card_ids: cardIds })
    });

    // Remove staged cards from columns (they'll be re-added via pool update)
    _draftStagedPicks.forEach(function(s) {
      // Record manual placement so initDraftColumns respects user's column choice
      _manualPlacements[String(s.card.id)] = s.column;
      var col = _draftColumns[s.column];
      if (col) {
        for (var i = col.length - 1; i >= 0; i--) {
          if (String(col[i].id) === String(s.card.id)) { col.splice(i, 1); break; }
        }
      }
    });
    _draftStagedPicks = [];

    if (result.draft_complete) {
      showToast('轮抓完成！请构建你的牌组');
      navigate('event-detail', { id: eventId });
    } else {
      window._draftWaiting = true;
      window._lastPackIds = remainingIds;
      showDraftWaiting(eventId);
    }
  } catch (err) {
    showToast(err.message, 'error');
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '确认选择'; }
  }
}

async function autoCreateDeckFromDraft(eventId, pool) {
  // Gather cards from columns: CMC columns + Land → main deck; Sideboard → sideboard; Outside → outside_game
  var mainDeck = [];
  var sideboard = [];
  var outsideGame = [];
  if (_draftColumns) {
    _draftColumnKeys.forEach(function(k) {
      if (k === 'Sideboard') {
        sideboard = sideboard.concat(_draftColumns[k] || []);
      } else if (k === 'Outside') {
        outsideGame = outsideGame.concat(_draftColumns[k] || []);
      } else {
        mainDeck = mainDeck.concat(_draftColumns[k] || []);
      }
    });
  } else {
    // Fallback: all pool goes to main deck
    mainDeck = pool.slice();
  }

  if (mainDeck.length === 0 && sideboard.length === 0) return;

  try {
    var deckName = '轮抓牌组 #' + eventId;
    var body = {
      name: deckName,
      main_deck: mainDeck,
      sideboard: sideboard,
      outside_game: outsideGame,
      event_id: eventId
    };
    var deck = await api('/api/decks', { method: 'POST', body: JSON.stringify(body) });
    showToast('牌组已自动创建: ' + deckName);
    // Update the banner
    var banner = document.getElementById('draft-complete-banner');
    if (banner) {
      banner.innerHTML = '轮抓已结束 — <a href="#/decks/' + deck.id + '/build" style="color:var(--success);text-decoration:underline">编辑牌组</a>';
    }
    // Refresh the page to show deck section
    setTimeout(function() { navigate('event-detail', { id: eventId }); }, 1500);
  } catch (err) {
    showToast('自动创建牌组失败: ' + err.message, 'error');
    var banner = document.getElementById('draft-complete-banner');
    if (banner) banner.textContent = '轮抓已结束 — 自动创建牌组失败，请手动构建';
  }
}
