// ============================================================
// battle-board.js — Battle board rendering, interaction, actions
// ============================================================

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

  var html = '<div class="bf-layout' + (flipped ? ' opp-layout' : '') + '">';
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

// ============================================================
// Dice / Coin Toolbox
// ============================================================
function renderToolboxHtml(battleId, isOpp) {
  var side = isOpp ? 'opp' : 'my';
  return '<div class="toolbox-wrapper">' +
    '<button class="toolbox-btn" onclick="toggleToolbox(\'' + side + '\')" title="随机工具">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' +
    '</button>' +
    '<div class="toolbox-popup" id="toolbox-' + side + '">' +
      '<div class="toolbox-option" onclick="doRandomRoll(\'' + battleId + '\',\'coin\')" title="抛硬币">' +
        '<span class="toolbox-icon">\ud83e\ude99</span><span>\u629b\u786c\u5e01</span>' +
      '</div>' +
      '<div class="toolbox-option" onclick="doRandomRoll(\'' + battleId + '\',\'d6\')" title="D6">' +
        '<span class="toolbox-icon">\ud83c\udfb2</span><span>D6</span>' +
      '</div>' +
      '<div class="toolbox-option" onclick="doRandomRoll(\'' + battleId + '\',\'d20\')" title="D20">' +
        '<span class="toolbox-icon">\ud83d\udfe2</span><span>D20</span>' +
      '</div>' +
      '<div class="toolbox-option" onclick="doCustomRoll(\'' + battleId + '\')" title="D?">' +
        '<span class="toolbox-icon">\u2753</span><span>D?</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderRollResultHtml(gs) {
  var lastRolls = gs.last_rolls || [];
  if (!lastRolls.length) return '';
  var roll = lastRolls[lastRolls.length - 1];
  var icon = roll.type === 'coin' ? '\ud83e\ude99' : roll.type === 'd6' ? '\ud83c\udfb2' : roll.type === 'd20' ? '\ud83d\udfe2' : '\ud83c\udfaf';
  var typeLabel = roll.type === 'coin' ? '\u629b\u786c\u5e01' : roll.type === 'd6' ? 'D6' : roll.type === 'd20' ? 'D20' : 'D' + roll.value;
  return '<div class="roll-result-badge">' +
    icon + ' <span class="roll-value">' + escapeHtml(roll.label) + '</span>' +
    '<span class="roll-type">' + typeLabel + '</span>' +
    '<span class="roll-by">' + escapeHtml(roll.player_name || '') + '</span>' +
  '</div>';
}

async function toggleToolbox(side) {
  var popup = document.getElementById('toolbox-' + side);
  if (!popup) return;
  var isOpen = popup.classList.contains('open');
  document.querySelectorAll('.toolbox-popup.open').forEach(function(p) { p.classList.remove('open'); });
  if (!isOpen) popup.classList.add('open');
}

async function doRandomRoll(battleId, rollType) {
  document.querySelectorAll('.toolbox-popup.open').forEach(function(p) { p.classList.remove('open'); });
  try {
    var result = await mtgaAction(battleId, { type: 'random_roll', roll_type: rollType });
    if (result && result.roll) showRollAnimation(result.roll);
  } catch (err) { showToast(err.message, 'error'); }
}

async function doCustomRoll(battleId) {
  document.querySelectorAll('.toolbox-popup.open').forEach(function(p) { p.classList.remove('open'); });
  var num = prompt('\u8bf7\u8f93\u5165\u968f\u673a\u6570\u8303\u56f4 (2-1000)\uff1a');
  if (!num) return;
  var max = parseInt(num);
  if (!max || max < 2) { showToast('\u8bf7\u8f93\u5165\u5927\u4e8e1\u7684\u6570\u5b57', 'error'); return; }
  try {
    var result = await mtgaAction(battleId, { type: 'random_roll', roll_type: 'custom', custom_max: max });
    if (result && result.roll) showRollAnimation(result.roll);
  } catch (err) { showToast(err.message, 'error'); }
}

function showRollAnimation(roll) {
  var old = document.getElementById('roll-anim-overlay');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'roll-anim-overlay';
  var isCoin = roll.type === 'coin';
  var icon = isCoin ? '\ud83e\ude99' : roll.type === 'd6' ? '\ud83c\udfb2' : roll.type === 'd20' ? '\ud83d\udfe2' : '\ud83c\udfaf';
  var typeLabel = isCoin ? '\u629b\u786c\u5e01' : roll.type.toUpperCase();
  var maxVal = isCoin ? 2 : roll.type === 'd6' ? 6 : roll.type === 'd20' ? 20 : roll.value;
  var frames = [];
  for (var i = 0; i < 14; i++) {
    frames.push(isCoin ? (Math.random() < 0.5 ? '\u6b63\u9762' : '\u53cd\u9762') : String(Math.floor(Math.random() * maxVal) + 1));
  }
  frames.push(roll.label);
  overlay.innerHTML =
    '<div class="roll-anim-box">' +
      '<div class="roll-anim-icon">' + icon + '</div>' +
      '<div class="roll-anim-label">' + typeLabel + '</div>' +
      '<div class="roll-anim-number" id="roll-anim-num">' + frames[0] + '</div>' +
      '<div class="roll-anim-player">' + escapeHtml(roll.player_name || '') + '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var numEl = document.getElementById('roll-anim-num');
  var frameIdx = 0;
  var interval = setInterval(function() {
    frameIdx++;
    if (frameIdx >= frames.length) {
      clearInterval(interval);
      if (numEl) numEl.classList.add('roll-final');
      setTimeout(function() {
        if (overlay.parentNode) overlay.classList.add('roll-fadeout');
        setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 600);
      }, 2200);
      return;
    }
    if (numEl) numEl.textContent = frames[frameIdx];
  }, 70);
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.toolbox-wrapper')) {
    document.querySelectorAll('.toolbox-popup.open').forEach(function(p) { p.classList.remove('open'); });
  }
});

function switchBattleOpponent(battleId, newOppKey) {
  state.oppKey = newOppKey;
  battleLocalUI.oppKey = newOppKey;
  // Re-render the board with the new opponent
  var contentEl = document.getElementById('content');
  if (contentEl && battleLocalUI.gs) {
    var battle = { game_state: battleLocalUI.gs };
    renderBattleBoard(contentEl, battle, battleId, state.myKey, newOppKey);
  }
}

function renderBattleBoard(el, battle, battleId, myKey, oppKey) {
  var gs = battle.game_state;
  var me = gs.players[myKey];
  var opp = gs.players[oppKey];
  var isMyTurn = gs.activePlayer === myKey;
  var isMultiplayer = gs.isMultiplayer || state.isMultiplayer;
  var allPlayerKeys = state.allPlayerKeys || Object.keys(gs.players);

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
      winBanner = '<div class="mtga-win-banner">' +
        (gs.matchWinner === myKey ? '\ud83c\udfc6 Match Win!' : '\ud83d\udc80 ' + (isMultiplayer ? 'You were eliminated' : 'Match Loss')) +
        '<button class="btn btn-primary" style="margin-top:12px" onclick="mtgaReturnToEvent(' + battleId + ')">\u2190 返回比赛</button>' +
        '</div>';
    } else {
      var p1w = gs.player1_wins || battle.player1_wins || 0;
      var p2w = gs.player2_wins || battle.player2_wins || 0;
      var gameNum = battle.current_game || 1;
      winBanner = '<div class="mtga-win-banner">' +
        (gs.winner === myKey ? '\ud83c\udf89 Game Win!' : '\ud83d\udc80 Game Loss') +
        '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px">' +
        '<button class="btn btn-primary" onclick="mtgaNextGame(' + battleId + ')">下一局 \u25b6</button>' +
        '<button class="btn btn-secondary" onclick="mtgaReturnToEvent(' + battleId + ')">\u2190 返回比赛</button>' +
        '</div></div>';
    }
  }

  // Build multiplayer sidebar
  var sidebarHtml = '';
  if (isMultiplayer) {
    var otherPlayers = allPlayerKeys.filter(function(k) { return k !== myKey; });
    sidebarHtml = '<div class="mp-sidebar" id="mp-sidebar">' +
      '<div class="mp-sidebar-title">玩家列表</div>';
    otherPlayers.forEach(function(pk) {
      var p = gs.players[pk];
      if (!p) return;
      var isActive = pk === oppKey;
      var isEliminated = p.isEliminated || (p.life <= 0);
      var isTurn = gs.activePlayer === pk;
      sidebarHtml += '<div class="mp-player-tab' + (isActive ? ' active' : '') + (isEliminated ? ' eliminated' : '') + '"' +
        ' onclick="switchBattleOpponent(\'' + battleId + '\',\'' + pk + '\')"' +
        ' style="' + (isTurn ? 'border-left:3px solid var(--accent);' : '') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-weight:600;font-size:0.85rem' + (isEliminated ? ';opacity:0.4;text-decoration:line-through' : '') + '">' + escapeHtml(p.name || pk) + '</span>' +
          (isTurn ? '<span style="font-size:0.65rem;color:var(--accent)">回合中</span>' : '') +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:4px;font-size:0.75rem;color:var(--text-muted)">' +
          '<span style="color:' + ((p.life || 0) <= 5 ? '#e74c3c' : 'inherit') + '">\u2764 ' + (p.life || 0) + '</span>' +
          '<span>\u270b ' + (p.hand || []).length + '</span>' +
          '<span>\ud83d\udcda ' + (p.library || []).length + '</span>' +
        '</div>' +
      '</div>';
    });
    sidebarHtml += '</div>';
  }

  var boardHtml =
    '<div class="mtga-board" id="mtga-board">' +
      '<!-- Opponent info -->' +
      '<div class="mtga-info-bar">' +
        '<div class="mtga-player-name">' + escapeHtml(opp?.name || 'Opponent') + (isMultiplayer ? ' <span style="font-size:0.7rem;color:var(--text-muted)">(查看中)</span>' : '') + '</div>' +
        '<div class="mtga-life-group">' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',-5)" title="-5">-5</button>' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',-2)" title="-2">-2</button>' +
          '<button class="life-btn life-btn-minus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',-1)" title="-1">-1</button>' +
          '<div class="mtga-life ' + ((opp?.life || 20) <= 5 ? 'low' : '') + '">' + (opp?.life ?? 20) + '</div>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',1)" title="+1">+1</button>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',2)" title="+2">+2</button>' +
          '<button class="life-btn life-btn-plus" onclick="mtgaQuickLife(' + battleId + ',\'opponent\',5)" title="+5">+5</button>' +
        '</div>' +
        renderRollResultHtml(gs) +
        renderToolboxHtml(battleId, true) +
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
        renderRollResultHtml(gs) +
        renderToolboxHtml(battleId, false) +
        '<div class="mtga-stat" style="margin-left:auto">Library ' + (me?.library || []).length + '</div>' +
        renderLibraryStack((me?.library || []).length, 'my-library') +
      '</div>' +
      '<!-- My hand -->' +
      '<div class="mtga-hand" data-zone="hand" data-player="' + myKey + '" id="my-hand">' +
        '<div class="mtga-zone-label" style="top:6px;left:14px">My Hand \xb7 ' + (me?.hand || []).length + '</div>' +
        '<div class="mtga-hand-inner">' + renderHandCards(me?.hand || []) + '</div>' +
      '</div>' +
    '</div>';

  if (isMultiplayer) {
    el.innerHTML = '<div class="mp-board-wrapper">' + boardHtml + sidebarHtml + '</div>' + winBanner + renderActionBar(battleId, gs, myKey, battle);
  } else {
    el.innerHTML = boardHtml + winBanner + renderActionBar(battleId, gs, myKey, battle);
  }

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
  var action = { type: 'adjust_life', amount: amount, target: target };
  if (target === 'opponent' && state.isMultiplayer && state.oppKey) {
    action.target_player = state.oppKey;
  }
  mtgaAction(battleId, action);
}

function mtgaAdjustLife(battleId, target, currentLife) {
  var amount = prompt('Adjust life (e.g. +5 or -3):', '0');
  if (amount === null) return;
  var n = parseInt(amount);
  if (isNaN(n) || n === 0) return;
  var action = { type: 'adjust_life', amount: n, target: target };
  if (target === 'opponent' && state.isMultiplayer && state.oppKey) {
    action.target_player = state.oppKey;
  }
  mtgaAction(battleId, action);
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
    var myKey = state.myKey || (String(battle.player1_id) === String(state.user?.id) ? 'p1' : 'p2');
    var oppKey = state.oppKey || (myKey === 'p1' ? 'p2' : 'p1');
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
