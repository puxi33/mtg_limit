// ============================================================
// Game UI - MTG Battle Board (MTGA-style)
// ============================================================
const Game = {
  pollInterval: null,
  wsHandler: null,

  PHASE_NAMES: {
    untap: '重置', upkeep: '维持', draw: '抽牌',
    main1: '主要1', combat: '战斗', main2: '主要2', end: '结束'
  },

  // Track local state for combat
  state: {
    mode: 'normal',  // 'normal' | 'attacking' | 'blocking'
    selectedAttackers: new Set(),
    selectedBlocker: null,
    pendingBlocks: []  // [{blocker_id, attacker_id}]
  },

  render: async function(el, id) {
    el.innerHTML = '<div class="text-center text-muted"><div class="loading"></div><span>加载中...</span></div>';
    this.cleanup();
    try {
      const battle = await API.get(`/api/battles/${id}`);
      this.renderBoard(el, battle, id);
      WS.subscribe(`battle:${id}`);
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${UI.escapeHtml(err.message)}</p></div>`;
    }
  },

  renderBoard: function(el, battle, id) {
    if (battle.status === 'waiting') {
      this.renderWaiting(el, battle, id);
      return;
    }

    if (!battle.game_state || !battle.game_state.players) {
      el.innerHTML = `
        <div class="page-header">
          <div>
            <button class="btn btn-secondary btn-sm mb-16" onclick="App.navigate('battles')">← 返回</button>
            <h2>${UI.escapeHtml(battle.name || '对战 #' + id)}</h2>
          </div>
          ${battle.player1_id === App.state.user.id ? `<button class="btn btn-primary" onclick="Game.startBattle(${id})">开始对战</button>` : ''}
        </div>
        <div class="event-info text-center">
          <h3>双方已就位</h3>
          <p class="text-muted mt-16">玩家1: ${UI.escapeHtml(battle.player1_name)} vs 玩家2: ${UI.escapeHtml(battle.player2_name || '等待中')}</p>
        </div>
      `;
      return;
    }

    const gs = battle.game_state;
    const isP1 = battle.player1_id === App.state.user.id;
    const isP2 = battle.player2_id === App.state.user.id;
    if (!isP1 && !isP2) {
      el.innerHTML = `<div class="empty-state"><h3>你不是此对战的玩家</h3></div>`;
      return;
    }
    const myKey = isP1 ? 'p1' : 'p2';
    const oppKey = isP1 ? 'p2' : 'p1';
    const me = gs.players[myKey];
    const opp = gs.players[oppKey];
    const myName = isP1 ? battle.player1_name : battle.player2_name;
    const oppName = isP1 ? battle.player2_name : battle.player1_name;
    const isActive = gs.activePlayer === myKey;
    const phase = gs.phase || 'main1';

    let actionsHtml = '';
    if (gs.mulliganPhase) {
      if (!gs.mulligansDone || !gs.mulligansDone.includes(App.state.user.id)) {
        actionsHtml = `
          <button class="btn btn-primary btn-lg" onclick="Game.mulligan(${id})">🔄 调度 (到 ${7 - (gs.mulligansDone?.length || 0) - 1})</button>
          <button class="btn btn-success btn-lg" onclick="Game.keepHand(${id})">✓ 保留手牌</button>
        `;
      } else {
        actionsHtml = `<span class="text-muted">等待对手调度...</span>`;
      }
    } else if (gs.winner) {
      const won = gs.winner === myKey;
      actionsHtml = `<span style="font-size:1.3rem;font-weight:700;color:${won ? 'var(--success)' : 'var(--danger)'}">
        ${won ? '🏆 你赢了！' : '💀 你输了'}
      </span>`;
    } else if (isActive) {
      if (phase === 'main1' || phase === 'main2') {
        actionsHtml = `
          <button class="btn btn-secondary" onclick="Game.nextPhase(${id})">下一阶段</button>
          <button class="btn btn-primary" onclick="Game.endTurn(${id})">结束回合</button>
        `;
      } else if (phase === 'combat') {
        if (gs.step === 'declare_attackers') {
          actionsHtml = `
            <button class="btn btn-danger" onclick="Game.commitAttack(${id})">⚔ 确认攻击 (${Game.state.selectedAttackers.size})</button>
            <button class="btn btn-secondary" onclick="Game.passCombat(${id})">跳过攻击</button>
          `;
        } else {
          actionsHtml = `<span class="text-muted">等待对手...</span>`;
        }
      } else {
        actionsHtml = `
          <button class="btn btn-secondary" onclick="Game.nextPhase(${id})">下一阶段</button>
          <button class="btn btn-primary" onclick="Game.endTurn(${id})">结束回合</button>
        `;
      }
      actionsHtml += ` <button class="btn btn-danger btn-sm" onclick="Game.concede(${id})">认输</button>`;
    } else {
      // Opponent's turn
      if (phase === 'combat' && gs.step === 'declare_blockers' && gs.combat && gs.combat.attackers && gs.combat.attackers.length > 0) {
        const unassigned = Game.getUnassignedAttackers(gs);
        if (unassigned.length > 0 && Game.state.pendingBlocks.length < unassigned.length) {
          actionsHtml = `
            <button class="btn btn-info" onclick="Game.commitBlock(${id})">🛡 确认阻挡 (${Game.state.pendingBlocks.length})</button>
            <button class="btn btn-secondary" onclick="Game.noBlock(${id})">不阻挡</button>
          `;
        } else {
          actionsHtml = `
            <button class="btn btn-info" onclick="Game.commitBlock(${id})">🛡 确认阻挡</button>
            <button class="btn btn-secondary" onclick="Game.noBlock(${id})">不阻挡</button>
          `;
        }
      } else {
        actionsHtml = `<span class="text-muted">⏳ 等待 ${UI.escapeHtml(oppName)} 操作...</span>`;
      }
    }

    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="App.navigate('battles')">← 返回</button>
          <h2>${UI.escapeHtml(battle.name || '对战 #' + id)}</h2>
        </div>
      </div>
      <div class="battle-container">
        <div class="battle-header">
          <div class="battle-turn-info">
            <span>回合 <span class="turn-number">${gs.turn}</span></span>
            <span class="${isActive ? 'active-indicator' : 'inactive-indicator'}">
              ${isActive ? '✓ 你的回合' : UI.escapeHtml(oppName) + ' 的回合'}
            </span>
          </div>
          <div class="phase-track">
            ${['untap', 'upkeep', 'draw', 'main1', 'combat', 'main2', 'end'].map(p =>
              `<span class="phase ${phase === p ? 'active' : ''}">${this.PHASE_NAMES[p]}</span>`
            ).join('')}
          </div>
        </div>

        <div class="battle-field">
          <div class="player-zone ${gs.activePlayer === oppKey ? 'is-active' : ''}">
            <div class="player-zone-header">
              <div class="player-info">
                <span class="player-name">${UI.escapeHtml(oppName)}</span>
                <span class="player-stats">
                  <span>手牌: ${(opp.hand || []).length}</span>
                  <span>牌库: ${(opp.library || []).length}</span>
                  <span>坟场: ${(opp.graveyard || []).length}</span>
                </span>
              </div>
              <div class="life-total ${opp.life <= 5 ? 'low' : 'normal'}">${opp.life}</div>
            </div>
            <h4>⚔ 战场 (${(opp.battlefield || []).length})</h4>
            <div class="mtg-cards-grid" id="opp-battlefield"></div>
          </div>

          <div class="player-zone ${gs.activePlayer === myKey ? 'is-active' : ''}">
            <div class="player-zone-header">
              <div class="player-info">
                <span class="player-name">${UI.escapeHtml(myName)} (你)</span>
                <span class="player-stats">
                  <span>牌库: ${(me.library || []).length}</span>
                  <span>坟场: ${(me.graveyard || []).length}</span>
                  <span class="mana-pool">${this.renderManaPool(me.manaPool)}</span>
                </span>
              </div>
              <div class="life-total ${me.life <= 5 ? 'low' : 'normal'}">${me.life}</div>
            </div>
            <h4>⚔ 战场 (${(me.battlefield || []).length})</h4>
            <div class="mtg-cards-grid" id="my-battlefield"></div>
            <h4 style="margin:16px 0 8px">✋ 手牌 (${(me.hand || []).length})</h4>
            <div class="mtg-cards-grid" id="my-hand"></div>
          </div>
        </div>

        <div class="battle-actions">${actionsHtml}</div>

        <div class="game-log">
          ${(gs.log || []).slice(-15).map(l => `<div class="log-entry">${UI.escapeHtml(l)}</div>`).join('')}
        </div>
      </div>
    `;

    // Reset combat state for new render
    Game.state.mode = 'normal';
    Game.state.selectedAttackers.clear();
    Game.state.selectedBlocker = null;
    Game.state.pendingBlocks = [];

    // Render cards
    setTimeout(() => {
      this.renderBattlefieldCards(el, gs, myKey, oppKey, id, isActive);
    }, 0);
  },

  renderManaPool: function(pool) {
    if (!pool) return '';
    const colors = ['W', 'U', 'B', 'R', 'G', 'C'];
    let html = '法术力: ';
    for (const c of colors) {
      if (pool[c] > 0) {
        html += `<span class="mana-pool-icon ${c}">${pool[c]}</span>`;
      }
    }
    return html || '法术力: -';
  },

  renderBattlefieldCards: function(el, gs, myKey, oppKey, battleId, isActive) {
    const me = gs.players[myKey];
    const opp = gs.players[oppKey];
    const isMyTurn = gs.activePlayer === myKey;
    const isMain = gs.phase === 'main1' || gs.phase === 'main2';
    const isCombatAttack = isMyTurn && gs.phase === 'combat' && gs.step === 'declare_attackers';
    const isCombatBlock = !isMyTurn && gs.phase === 'combat' && gs.step === 'declare_blockers';

    // Opponent battlefield (read-only)
    const oppBf = document.getElementById('opp-battlefield');
    if (oppBf) {
      oppBf.innerHTML = '';
      (opp.battlefield || []).forEach(c => {
        const opts = {};
        if (isCombatBlock) {
          opts.onClick = () => this.handleBlockerClick(c, gs, battleId);
          opts.selected = this.state.pendingBlocks.some(b => b.blocker_id === c.id);
        }
        oppBf.appendChild(UI.createCardElement(c, opts));
      });
    }

    // My battlefield
    const myBf = document.getElementById('my-battlefield');
    if (myBf) {
      myBf.innerHTML = '';
      (me.battlefield || []).forEach(c => {
        const opts = {};
        if (isMain && isMyTurn && this.isLand(c)) {
          opts.onClick = () => this.handleLandClick(c, battleId);
          opts.tapped = c.tapped;
        } else if (isCombatAttack) {
          opts.onClick = () => this.handleAttackerClick(c, battleId);
          opts.attacking = this.state.selectedAttackers.has(c.id);
        }
        opts.tapped = c.tapped;
        myBf.appendChild(UI.createCardElement(c, opts));
      });
    }

    // My hand
    const myHand = document.getElementById('my-hand');
    if (myHand) {
      myHand.innerHTML = '';
      (me.hand || []).forEach(c => {
        const opts = {};
        if (isMain && isMyTurn) {
          opts.onClick = () => this.handleHandClick(c, battleId);
        }
        myHand.appendChild(UI.createCardElement(c, opts));
      });
    }
  },

  isLand: function(card) {
    return card && card.type && card.type.includes('Land');
  },

  handleLandClick: async function(card, battleId) {
    try {
      await API.post(`/api/battles/${battleId}/action`, { type: 'tap_for_mana', card_id: card.id });
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  handleHandClick: async function(card, battleId) {
    if (this.isLand(card)) {
      // Play land
      try {
        await API.post(`/api/battles/${battleId}/action`, { type: 'play_land', card_id: card.id });
        await this.refresh(battleId);
      } catch (err) { UI.toast(err.message, 'error'); }
    } else {
      // Cast spell (target player if it's a damage spell, otherwise resolve automatically)
      const target = this.inferTarget(card);
      try {
        await API.post(`/api/battles/${battleId}/action`, {
          type: 'cast_spell', card_id: card.id, target, target_id: null
        });
        await this.refresh(battleId);
      } catch (err) { UI.toast(err.message, 'error'); }
    }
  },

  inferTarget: function(card) {
    const text = (card.text || '').toLowerCase();
    if (/target player|opponent|any target/i.test(text)) return 'player';
    return null;
  },

  handleAttackerClick: function(card, battleId) {
    if (!card || card.tapped) return;
    if (this.state.selectedAttackers.has(card.id)) {
      this.state.selectedAttackers.delete(card.id);
    } else {
      this.state.selectedAttackers.add(card.id);
    }
    // Update visual
    const grid = document.getElementById('my-battlefield');
    if (grid) {
      grid.querySelectorAll('.mtg-card').forEach(el => {
        const id = el.getAttribute('data-card-id');
        el.classList.toggle('attacking', this.state.selectedAttackers.has(id));
      });
    }
    // Update button text via re-render of action area only
    const actionsEl = document.querySelector('.battle-actions');
    if (actionsEl) {
      const btn = actionsEl.querySelector('.btn-danger');
      if (btn) btn.textContent = `⚔ 确认攻击 (${this.state.selectedAttackers.size})`;
    }
  },

  handleBlockerClick: function(blocker, gs, battleId) {
    // Cycle: assign blocker to next unblocked attacker
    const unassigned = this.getUnassignedAttackers(gs);
    const assignedToThisBlocker = this.state.pendingBlocks.filter(b => b.blocker_id === blocker.id);
    if (assignedToThisBlocker.length > 0) {
      // Remove all assignments for this blocker
      this.state.pendingBlocks = this.state.pendingBlocks.filter(b => b.blocker_id !== blocker.id);
    } else if (unassigned.length > 0) {
      // Assign to first unblocked attacker
      this.state.pendingBlocks.push({ blocker_id: blocker.id, attacker_id: unassigned[0].id });
    }
    this.refresh(battleId);
  },

  getUnassignedAttackers: function(gs) {
    const assigned = new Set(this.state.pendingBlocks.map(b => b.attacker_id));
    return (gs.combat?.attackers || []).filter(a => !assigned.has(a.id));
  },

  commitAttack: async function(battleId) {
    if (this.state.selectedAttackers.size === 0) {
      UI.toast('请至少选择一个攻击者', 'error');
      return;
    }
    try {
      await API.post(`/api/battles/${battleId}/action`, {
        type: 'declare_attackers',
        attacker_ids: [...this.state.selectedAttackers]
      });
      this.state.selectedAttackers.clear();
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  passCombat: async function(battleId) {
    try {
      await API.post(`/api/battles/${battleId}/action`, { type: 'declare_attackers', attacker_ids: [] });
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  commitBlock: async function(battleId) {
    try {
      await API.post(`/api/battles/${battleId}/action`, {
        type: 'declare_blockers',
        blockers: this.state.pendingBlocks
      });
      this.state.pendingBlocks = [];
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  noBlock: async function(battleId) {
    try {
      await API.post(`/api/battles/${battleId}/action`, { type: 'no_block' });
      this.state.pendingBlocks = [];
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  nextPhase: async function(battleId) {
    try {
      await API.post(`/api/battles/${battleId}/action`, { type: 'next_phase' });
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  endTurn: async function(battleId) {
    try {
      await API.post(`/api/battles/${battleId}/action`, { type: 'end_turn' });
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  mulligan: async function(battleId) {
    try {
      await API.post(`/api/battles/${battleId}/action`, { type: 'mulligan' });
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  keepHand: async function(battleId) {
    try {
      await API.post(`/api/battles/${battleId}/action`, { type: 'keep' });
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  concede: async function(battleId) {
    if (!confirm('确定认输吗？')) return;
    try {
      await API.post(`/api/battles/${battleId}/action`, { type: 'concede' });
      await this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  refresh: async function(battleId) {
    try {
      const battle = await API.get(`/api/battles/${battleId}`);
      const el = document.getElementById('content');
      this.renderBoard(el, battle, battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  startBattle: async function(id) {
    try {
      await API.post(`/api/battles/${id}/start`, {});
      UI.toast('对战开始！');
      this.refresh(id);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  renderWaiting: function(el, battle, id) {
    const isP1 = battle.player1_id === App.state.user.id;
    const myKey = isP1 ? 'p1' : 'p2';
    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="App.navigate('battles')">← 返回</button>
          <h2>${UI.escapeHtml(battle.name || '对战 #' + id)}</h2>
        </div>
      </div>
      <div class="event-info">
        <div class="info-row">创建者: <span>${UI.escapeHtml(battle.player1_name)}</span></div>
        <div class="info-row">状态: ${UI.statusBadge(battle.status)}</div>
        <div class="info-row">牌组: <span>${UI.escapeHtml(battle.player1_deck.name || '已选择')}</span></div>
        ${!isP1 ? `
          <div class="mt-24">
            <h3 style="color:var(--text-bright);margin-bottom:12px">加入对战</h3>
            <div id="join-deck-select"></div>
          </div>
        ` : '<p class="mt-24 text-muted">⏳ 等待对手加入...</p>'}
      </div>
    `;
    if (!isP1) {
      this.renderJoinSelect(id);
    }
  },

  renderJoinSelect: async function(battleId) {
    try {
      const decks = await API.get('/api/decks');
      const container = document.getElementById('join-deck-select');
      if (!container) return;
      if (decks.length === 0) {
        container.innerHTML = '<p class="text-muted">请先 <a onclick="App.navigate(\'decks\')">创建牌组</a></p>';
        return;
      }
      container.innerHTML = `
        <div class="flex gap-8">
          <select id="join-battle-deck" style="max-width:300px">
            ${decks.map(d => `<option value="${d.id}">${UI.escapeHtml(d.name)} (${(d.main_deck || []).length} 张)</option>`).join('')}
          </select>
          <button class="btn btn-success" onclick="Game.joinBattle(${battleId})">加入对战</button>
        </div>
      `;
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  joinBattle: async function(battleId) {
    const deckId = document.getElementById('join-battle-deck').value;
    try {
      await API.post(`/api/battles/${battleId}/join`, { deck_id: parseInt(deckId) });
      UI.toast('已加入对战');
      this.refresh(battleId);
    } catch (err) { UI.toast(err.message, 'error'); }
  },

  cleanup: function() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
};