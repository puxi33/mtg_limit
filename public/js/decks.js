// ============================================================
// decks.js — Deck management, detail, builder
// ============================================================
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
          '<button class="btn btn-secondary" onclick="quickImportDeck()">快速导入</button>' +
        '</div>' +
      '</div>' +
      '<div class="card-grid">' +
        customDecks.map(function(deck) {
          var mainCount = Array.isArray(deck.main_deck) ? deck.main_deck.length : 0;
          var sbCount = Array.isArray(deck.sideboard) ? deck.sideboard.length : 0;
          var isCommander = deck.type === 'commander';
          var tag = isCommander ? '<span class="deck-tag commander-tag">指挥官</span>' : '';
          var metaSpans = '<span>主牌: ' + mainCount + '张</span>' +
            (isCommander ? '' : '<span>备牌: ' + sbCount + '/15张</span>');
          return '<div class="card-item" onclick="navigate(\'deck-detail\', {id:' + deck.id + '})" style="position:relative">' +
            '<button class="btn btn-sm card-delete-btn" onclick="event.stopPropagation();deleteCustomDeck(' + deck.id + ')" title="删除牌组">&times;</button>' +
            '<h3>' + escapeHtml(deck.name) + ' ' + tag + '</h3>' +
            '<div class="card-meta">' + metaSpans + '</div>' +
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
    '<div class="form-group"><label>导入牌组内容 (可选)</label>' +
    '<textarea id="new-deck-content" rows="10" style="width:100%;font-family:monospace;font-size:0.85rem" placeholder="粘贴牌组内容，支持以下格式:\n\nAbout\nName 我的牌组\n\nDeck\n4 Lightning Bolt\n2 Counterspell\n\nSideboard\n1 Black Lotus\n\nCommander\n1 Atraxa, Praetors\' Voice\n\n--- 或直接粘贴卡牌列表 ---\n4 Lightning Bolt\n2 Counterspell"></textarea></div>' +
    '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px">提示: 使用 Deck / Sideboard / Commander 分区标记，卡牌会自动分配到对应区域。不带分区标记则全部放入主牌组。</div>' +
    '<button type="submit" class="btn btn-primary btn-block">创建</button>' +
    '</form>'
  );
}

async function handleCreateDeck(e) {
  e.preventDefault();
  var name = document.getElementById('new-deck-name').value.trim();
  var contentEl = document.getElementById('new-deck-content');
  var content = contentEl ? contentEl.value.trim() : '';
  if (!name) { showToast('请输入牌组名称', 'error'); return; }

  var parsed = parseDeckText(content);
  // If About section has a name and user didn't change the name field, use parsed name
  if (parsed.name && name === '我的牌组') {
    name = parsed.name;
  }

  var totalEntries = parsed.deck.length + parsed.sideboard.length + parsed.commander.length;

  try {
    // Create the deck first
    var deck = await api('/api/decks', { method: 'POST', body: JSON.stringify({ name: name, main_deck: [], sideboard: [], outside_game: [] }) });

    if (totalEntries === 0) {
      closeModal();
      showToast('牌组已创建');
      navigate('deck-detail', { id: deck.id });
      return;
    }

    // Show progress in modal
    document.getElementById('modal-title').textContent = '创建牌组 - 导入中';
    document.getElementById('modal-body').innerHTML =
      '<div style="padding:20px">' +
        '<div style="margin-bottom:12px;font-size:0.9rem">正在从Scryfall获取卡牌数据...</div>' +
        '<div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px">' +
          '<div id="import-bar" style="background:var(--accent);height:100%;width:0%;transition:width 0.2s"></div>' +
        '</div>' +
        '<div id="import-text" style="font-size:0.8rem;text-align:center;color:var(--text-muted)">准备中...</div>' +
      '</div>';

    var mainDeck = [];
    var sideboard = [];
    var outsideGame = [];
    var allFailed = [];

    // Collect all entries with zone info
    var allEntries = [];
    parsed.deck.forEach(function(e) { allEntries.push({ name: e.name, count: e.count, zone: 'main' }); });
    parsed.sideboard.forEach(function(e) { allEntries.push({ name: e.name, count: e.count, zone: 'sideboard' }); });
    parsed.commander.forEach(function(e) { allEntries.push({ name: e.name, count: e.count, zone: 'commander' }); });

    // Build name->entries[] map (same card can appear in multiple zones)
    var entryMap = {};
    allEntries.forEach(function(e) {
      var key = e.name.toLowerCase();
      if (!entryMap[key]) entryMap[key] = [];
      entryMap[key].push(e);
    });

    // Validate: no card name should exceed 4 copies total (except commanders and basic lands)
    var basicLands = ['plains', 'island', 'swamp', 'mountain', 'forest'];
    var overLimit = [];
    Object.keys(entryMap).forEach(function(key) {
      if (basicLands.indexOf(key) !== -1) return; // Skip basic lands
      var entries = entryMap[key];
      var totalCount = 0;
      entries.forEach(function(e) {
        if (e.zone !== 'commander') totalCount += e.count;
      });
      if (totalCount > 4) {
        overLimit.push({ name: entries[0].name, count: totalCount });
      }
    });
    if (overLimit.length > 0) {
      closeModal();
      var msg = '以下卡牌超过4张限制:\n' + overLimit.map(function(o) { return o.name + ' (' + o.count + '张)'; }).join('\n');
      showToast(msg, 'error');
      return;
    }

    // Deduplicate all names
    var uniqueNames = [];
    allEntries.forEach(function(e) {
      if (uniqueNames.indexOf(e.name) === -1) uniqueNames.push(e.name);
    });

    // Process in batches of 10
    var BATCH_SIZE = 10;
    var totalAdded = 0;

    for (var i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
      var chunk = uniqueNames.slice(i, i + BATCH_SIZE);
      var pct = Math.round(((i + chunk.length) / uniqueNames.length) * 100);
      var bar = document.getElementById('import-bar');
      var txt = document.getElementById('import-text');
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = '获取卡牌... ' + Math.min(i + chunk.length, uniqueNames.length) + '/' + uniqueNames.length + ' (' + pct + '%)';

      try {
        var res = await api('/api/cards/batch-search', {
          method: 'POST',
          body: JSON.stringify({ names: chunk })
        });
        // Route found cards to correct zones (handle same card in multiple zones)
        if (res.cards && res.cards.length > 0) {
          res.cards.forEach(function(card) {
            var matchKey = (card.matchedName || card.name).toLowerCase();
            var entries = entryMap[matchKey];
            if (entries) {
              entries.forEach(function(entry) {
                var target = entry.zone === 'sideboard' ? sideboard : entry.zone === 'commander' ? outsideGame : mainDeck;
                for (var j = 0; j < entry.count; j++) { target.push(card); }
              });
            }
          });
          totalAdded += res.cards.length;
        }
        // Collect failed names
        if (res.failed && res.failed.length > 0) {
          res.failed.forEach(function(failedName) {
            var entries = entryMap[failedName.toLowerCase()];
            if (entries) {
              var total = 0;
              entries.forEach(function(e) { total += e.count; });
              allFailed.push(total + 'x ' + failedName);
            } else {
              allFailed.push(failedName);
            }
          });
        }
      } catch (err) {
        chunk.forEach(function(n) {
          var entries = entryMap[n.toLowerCase()];
          if (entries) {
            var total = 0;
            entries.forEach(function(e) { total += e.count; });
            allFailed.push(total + 'x ' + n);
          } else {
            allFailed.push(n);
          }
        });
      }
    }

    // Update the deck with all cards
    await api('/api/decks/' + deck.id, {
      method: 'PUT',
      body: JSON.stringify({ main_deck: mainDeck, sideboard: sideboard, outside_game: outsideGame })
    });

    if (allFailed.length > 0) {
      document.getElementById('modal-title').textContent = '导入完成 - 部分卡牌未找到';
      document.getElementById('modal-body').innerHTML =
        '<div style="padding:12px">' +
          '<div style="margin-bottom:12px;font-size:0.9rem">牌组已创建，成功导入 ' + totalAdded + '/' + uniqueNames.length + ' 种卡牌，以下 <strong>' + allFailed.length + '</strong> 种卡牌未找到：</div>' +
          '<div style="max-height:200px;overflow-y:auto;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;margin-bottom:16px;font-family:monospace;font-size:0.85rem;line-height:1.6">' +
            allFailed.map(function(n) { return '<div style="color:var(--danger)">' + escapeHtml(n) + '</div>'; }).join('') +
          '</div>' +
          '<button class="btn btn-primary btn-block" onclick="closeModal();navigate(\'deck-detail\',{id:' + deck.id + '})">确认</button>' +
        '</div>';
    } else {
      closeModal();
      showToast('牌组已创建，导入 ' + totalAdded + '/' + uniqueNames.length + ' 种卡牌');
      navigate('deck-detail', { id: deck.id });
    }
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

async function quickImportDeck() {
  try {
    var text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('剪贴板为空或无法读取', 'error');
      return;
    }

    var parsed = parseDeckText(text);
    var totalEntries = parsed.deck.length + parsed.sideboard.length + parsed.commander.length;
    if (totalEntries === 0) {
      showToast('剪贴板中没有解析到卡牌', 'error');
      return;
    }

    // Determine deck name
    var name = parsed.name || '快速导入牌组';

    // Show modal with progress
    showModal('快速导入',
      '<div style="padding:20px">' +
        '<div style="margin-bottom:12px;font-size:0.9rem">牌组名称: <strong>' + escapeHtml(name) + '</strong></div>' +
        '<div style="margin-bottom:12px;font-size:0.85rem;color:var(--text-muted)">' +
          '主牌: ' + parsed.deck.length + ' 种 | 备牌: ' + parsed.sideboard.length + ' 种 | 指挥官: ' + parsed.commander.length + ' 种' +
        '</div>' +
        '<div style="margin-bottom:12px;font-size:0.9rem">正在从Scryfall获取卡牌数据...</div>' +
        '<div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px">' +
          '<div id="import-bar" style="background:var(--accent);height:100%;width:0%;transition:width 0.2s"></div>' +
        '</div>' +
        '<div id="import-text" style="font-size:0.8rem;text-align:center;color:var(--text-muted)">准备中...</div>' +
      '</div>'
    );

    // Create the deck
    var deck = await api('/api/decks', { method: 'POST', body: JSON.stringify({ name: name, main_deck: [], sideboard: [], outside_game: [] }) });

    var mainDeck = [];
    var sideboard = [];
    var outsideGame = [];
    var allFailed = [];

    // Collect all entries with zone info
    var allEntries = [];
    parsed.deck.forEach(function(e) { allEntries.push({ name: e.name, count: e.count, zone: 'main' }); });
    parsed.sideboard.forEach(function(e) { allEntries.push({ name: e.name, count: e.count, zone: 'sideboard' }); });
    parsed.commander.forEach(function(e) { allEntries.push({ name: e.name, count: e.count, zone: 'commander' }); });

    // Build name->entries[] map (same card can appear in multiple zones)
    var entryMap = {};
    allEntries.forEach(function(e) {
      var key = e.name.toLowerCase();
      if (!entryMap[key]) entryMap[key] = [];
      entryMap[key].push(e);
    });

    // Validate: no card name should exceed 4 copies total (except commanders and basic lands)
    var basicLands = ['plains', 'island', 'swamp', 'mountain', 'forest'];
    var overLimit = [];
    Object.keys(entryMap).forEach(function(key) {
      if (basicLands.indexOf(key) !== -1) return; // Skip basic lands
      var entries = entryMap[key];
      var totalCount = 0;
      entries.forEach(function(e) {
        if (e.zone !== 'commander') totalCount += e.count;
      });
      if (totalCount > 4) {
        overLimit.push({ name: entries[0].name, count: totalCount });
      }
    });
    if (overLimit.length > 0) {
      closeModal();
      var msg = '以下卡牌超过4张限制:\n' + overLimit.map(function(o) { return o.name + ' (' + o.count + '张)'; }).join('\n');
      showToast(msg, 'error');
      return;
    }

    // Deduplicate all names
    var uniqueNames = [];
    allEntries.forEach(function(e) {
      if (uniqueNames.indexOf(e.name) === -1) uniqueNames.push(e.name);
    });

    // Process in batches of 10
    var BATCH_SIZE = 10;
    var totalAdded = 0;

    for (var i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
      var chunk = uniqueNames.slice(i, i + BATCH_SIZE);
      var pct = Math.round(((i + chunk.length) / uniqueNames.length) * 100);
      var bar = document.getElementById('import-bar');
      var txt = document.getElementById('import-text');
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = '获取卡牌... ' + Math.min(i + chunk.length, uniqueNames.length) + '/' + uniqueNames.length + ' (' + pct + '%)';

      try {
        var res = await api('/api/cards/batch-search', {
          method: 'POST',
          body: JSON.stringify({ names: chunk })
        });
        // Route found cards to correct zones (handle same card in multiple zones)
        if (res.cards && res.cards.length > 0) {
          res.cards.forEach(function(card) {
            var matchKey = (card.matchedName || card.name).toLowerCase();
            var entries = entryMap[matchKey];
            if (entries) {
              entries.forEach(function(entry) {
                var target = entry.zone === 'sideboard' ? sideboard : entry.zone === 'commander' ? outsideGame : mainDeck;
                for (var j = 0; j < entry.count; j++) { target.push(card); }
              });
            }
          });
          totalAdded += res.cards.length;
        }
        // Collect failed names
        if (res.failed && res.failed.length > 0) {
          res.failed.forEach(function(failedName) {
            var entries = entryMap[failedName.toLowerCase()];
            if (entries) {
              var total = 0;
              entries.forEach(function(e) { total += e.count; });
              allFailed.push(total + 'x ' + failedName);
            } else {
              allFailed.push(failedName);
            }
          });
        }
      } catch (err) {
        chunk.forEach(function(n) {
          var entries = entryMap[n.toLowerCase()];
          if (entries) {
            var total = 0;
            entries.forEach(function(e) { total += e.count; });
            allFailed.push(total + 'x ' + n);
          } else {
            allFailed.push(n);
          }
        });
      }
    }

    // Update the deck with all cards
    await api('/api/decks/' + deck.id, {
      method: 'PUT',
      body: JSON.stringify({ main_deck: mainDeck, sideboard: sideboard, outside_game: outsideGame })
    });

    if (allFailed.length > 0) {
      document.getElementById('modal-title').textContent = '导入完成 - 部分卡牌未找到';
      document.getElementById('modal-body').innerHTML =
        '<div style="padding:12px">' +
          '<div style="margin-bottom:12px;font-size:0.9rem">牌组「' + escapeHtml(name) + '」已创建，成功导入 ' + totalAdded + '/' + uniqueNames.length + ' 种卡牌，以下 <strong>' + allFailed.length + '</strong> 种卡牌未找到：</div>' +
          '<div style="max-height:200px;overflow-y:auto;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;margin-bottom:16px;font-family:monospace;font-size:0.85rem;line-height:1.6">' +
            allFailed.map(function(n) { return '<div style="color:var(--danger)">' + escapeHtml(n) + '</div>'; }).join('') +
          '</div>' +
          '<button class="btn btn-primary btn-block" onclick="closeModal();navigate(\'deck-detail\',{id:' + deck.id + '})">确认</button>' +
        '</div>';
    } else {
      closeModal();
      showToast('牌组「' + name + '」已创建，导入 ' + totalAdded + '/' + uniqueNames.length + ' 种卡牌');
      navigate('deck-detail', { id: deck.id });
    }
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showToast('无法读取剪贴板，请授权访问', 'error');
    } else {
      showToast(err.message || '导入失败', 'error');
    }
  }
}

async function showBatchImportDeckModal() {
  showModal('批量导入卡牌',
    '<form onsubmit="handleBatchImportToDeck(event)">' +
    '<div class="form-group"><label>牌组</label>' +
    '<select id="batch-import-deck-select" required></select></div>' +
    '<div class="form-group"><label>卡牌列表 (支持分区导入)</label>' +
    '<textarea id="batch-import-text" rows="14" style="width:100%;font-family:monospace;font-size:0.85rem" placeholder="支持以下格式:\n\nAbout\nName 我的牌组\n\nDeck\n4 Lightning Bolt\n2 Counterspell\n\nSideboard\n1 Black Lotus\n\nCommander\n1 Atraxa, Praetors\' Voice\n\n--- 或直接粘贴卡牌列表 ---\n4 Lightning Bolt\n2 Counterspell"></textarea></div>' +
    '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px">提示: 使用 Deck / Sideboard / Commander 分区标记，卡牌会自动导入到对应区域。不带分区标记则全部导入主牌组。</div>' +
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

  // Parse structured text with sections
  var parsed = parseDeckText(text);
  var totalEntries = parsed.deck.length + parsed.sideboard.length + parsed.commander.length;
  if (totalEntries === 0) { showToast('没有解析到任何卡牌', 'error'); return; }

  try {
    closeModal();
    showToast('正在导入 ' + totalEntries + ' 种卡牌...');
    var deck = await api('/api/decks/' + deckId);
    var mainDeck = Array.isArray(deck.main_deck) ? deck.main_deck : [];
    var sideboard = Array.isArray(deck.sideboard) ? deck.sideboard : [];
    var outsideGame = Array.isArray(deck.outside_game) ? deck.outside_game : [];

    var added = 0, failed = 0;

    // Helper: search and add cards to a target array
    async function importEntries(entries, targetArr) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        try {
          var res = await api('/api/cards/search?q=' + encodeURIComponent(entry.name));
          if (res.cards && res.cards.length > 0) {
            for (var j = 0; j < entry.count; j++) {
              targetArr.push(res.cards[0]);
            }
            added += entry.count;
          } else {
            failed++;
          }
        } catch (err) {
          failed++;
        }
      }
    }

    // Import each section
    await importEntries(parsed.deck, mainDeck);
    await importEntries(parsed.sideboard, sideboard);
    await importEntries(parsed.commander, outsideGame);

    // Save the updated deck
    await api('/api/decks/' + deckId, {
      method: 'PUT',
      body: JSON.stringify({ main_deck: mainDeck, sideboard: sideboard, outside_game: outsideGame })
    });

    var msg = '导入完成: 成功 ' + added + ' 张';
    if (parsed.deck.length > 0) msg += ', 主牌 ' + parsed.deck.length + ' 种';
    if (parsed.sideboard.length > 0) msg += ', 备牌 ' + parsed.sideboard.length + ' 种';
    if (parsed.commander.length > 0) msg += ', 指挥官 ' + parsed.commander.length + ' 种';
    if (failed > 0) msg += ', 失败 ' + failed + ' 种';
    showToast(msg);
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

    // Switch to deck column mode and initialize
    _columnMode = 'deck';
    state.pageData._deckId = deck.id;
    if (!_loadDeckColumns()) {
      initDeckColumns([], _currentDeckDetail.main_deck, _currentDeckDetail.outside_game, _currentDeckDetail.sideboard);
    }

    renderDeckDetailUI(el);
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

var _deckDetailActiveTab = 'main'; // kept for compatibility
var _deckDetailSearchResults = null; // persist search results across re-renders

function renderDeckDetailUI(el) {
  var d = _currentDeckDetail;
  if (!d) return;

  var totalCards = 0;
  _draftColumnKeys.forEach(function(k) { totalCards += (window._deckColumns ? (window._deckColumns[k] || []).length : 0); });

  el.innerHTML =
    '<div class="page-header">' +
      '<button class="btn btn-secondary btn-sm" onclick="saveAndCloseDeckDetail()">\u2190 返回</button>' +
      '<h2 style="display:inline;margin-left:12px">' + escapeHtml(d.name) + '</h2>' +
      '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="saveDeckDetail()">保存</button>' +
    '</div>' +
    '<div class="draft-redesign" id="deck-redesign">' +
      '<!-- Basic Lands -->' +
      '<div class="draft-pick-strip" style="flex-direction:row;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<span style="font-weight:600;color:var(--text-bright);font-size:0.9rem">添加基本地</span>' +
        '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck(\'Plains\')" style="min-width:70px">平原 +1</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck(\'Island\')" style="min-width:70px">海岛 +1</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck(\'Swamp\')" style="min-width:70px">沼泽 +1</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck(\'Mountain\')" style="min-width:70px">山脉 +1</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck(\'Forest\')" style="min-width:70px">树林 +1</button>' +
        '<span id="basic-land-counts" class="text-muted" style="font-size:0.8rem;margin-left:auto"></span>' +
      '</div>' +
      '<!-- Card Search -->' +
      '<div class="draft-pick-strip" id="deck-search-strip" style="gap:6px">' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<input type="text" id="deck-search-input" placeholder="搜索卡牌名称... 点击添加到主牌组，或拖拽到下方列" style="flex:1;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-bright);font-size:0.9rem" onkeydown="if(event.key===\'Enter\')searchDeckBuilderCards()">' +
          '<button class="btn btn-secondary btn-sm" onclick="searchDeckBuilderCards()">搜索</button>' +
        '</div>' +
        '<div id="deck-search-results" class="draft-pick-scroll" style="min-height:0;max-height:140px;padding:4px 0"></div>' +
      '</div>' +
      '<!-- Column layout -->' +
      '<div class="draft-columns-area" id="deck-columns-area">' +
        '<div class="draft-columns-header">' +
          '<span style="color:var(--text-bright);font-size:0.85rem;font-weight:600">卡牌分组 <span class="text-muted" id="deck-pool-count" style="font-weight:400">' + totalCards + '张</span></span>' +
          '<button class="btn btn-sm btn-secondary" style="margin-left:auto" onclick="toggleDeckBatchImport()">批量导入</button>' +
        '</div>' +
        '<div id="deck-batch-import-area" style="display:none;padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px">' +
          '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">支持 Deck / Sideboard / Commander 分区格式，也可粘贴纯卡牌列表</div>' +
          '<textarea id="deck-batch-import-text" rows="8" style="width:100%;font-family:monospace;font-size:0.8rem;background:var(--bg-dark);border:1px solid var(--border);border-radius:4px;color:var(--text-bright);padding:8px;resize:vertical" placeholder="Deck\n4 Lightning Bolt\n2 Counterspell\n\nSideboard\n1 Black Lotus\n\nCommander\n1 Atraxa, Praetors\' Voice"></textarea>' +
          '<div style="display:flex;gap:8px;margin-top:8px">' +
            '<button class="btn btn-primary btn-sm" onclick="batchImportToCurrentDeck()">导入</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="toggleDeckBatchImport()">收起</button>' +
          '</div>' +
        '</div>' +
        '<div class="draft-columns-scroll" id="deck-columns-scroll"></div>' +
      '</div>' +
    '</div>';

  // Apply fullscreen styling
  document.body.classList.add('draft-fullscreen');

  // Render columns
  renderDraftColumns();
  updateDeckBasicLandCounts();
}

function saveAndCloseDeckDetail() {
  saveDeckDetail();
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

// Parse structured deck text with sections: About/Name, Deck, Sideboard, Commander
// Returns { name: string|null, deck: [{count,name,set}], sideboard: [...], commander: [...] }
function parseDeckText(text) {
  var result = { name: null, deck: [], sideboard: [], commander: [] };
  if (!text || !text.trim()) return result;

  var lines = text.split('\n');
  var currentSection = null; // 'deck', 'sideboard', 'commander', 'about'
  var hasSectionMarkers = false;

  // First pass: detect if there are section markers
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (/^(Deck|Sideboard|Commander|About)\s*$/i.test(line)) {
      hasSectionMarkers = true;
      break;
    }
  }

  if (!hasSectionMarkers) {
    // No section markers — treat all lines as main deck (backward compatible)
    for (var i = 0; i < lines.length; i++) {
      var parsed = parseDeckLine(lines[i]);
      if (parsed) result.deck.push(parsed);
    }
    return result;
  }

  // Second pass: parse sections
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    // Check for section headers
    if (/^Deck\s*$/i.test(line)) { currentSection = 'deck'; continue; }
    if (/^Sideboard\s*$/i.test(line)) { currentSection = 'sideboard'; continue; }
    if (/^Commander\s*$/i.test(line)) { currentSection = 'commander'; continue; }
    if (/^About\s*$/i.test(line)) { currentSection = 'about'; continue; }

    // Parse based on current section
    if (currentSection === 'about') {
      // Look for "Name <deck name>"
      var nameMatch = line.match(/^Name\s+(.+)$/i);
      if (nameMatch) {
        result.name = nameMatch[1].trim();
      }
    } else if (currentSection === 'sideboard') {
      var parsed = parseDeckLine(line);
      if (parsed) result.sideboard.push(parsed);
    } else if (currentSection === 'commander') {
      var parsed = parseDeckLine(line);
      if (parsed) result.commander.push(parsed);
    } else {
      // Default to deck (including lines before any section header)
      var parsed = parseDeckLine(line);
      if (parsed) result.deck.push(parsed);
    }
  }

  return result;
}

function toggleDeckBatchImport() {
  var area = document.getElementById('deck-batch-import-area');
  if (area) {
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
    if (area.style.display === 'block') {
      var ta = document.getElementById('deck-batch-import-text');
      if (ta) ta.focus();
    }
  }
}

async function batchImportToCurrentDeck() {
  if (!_currentDeckDetail) return;
  var text = document.getElementById('deck-batch-import-text').value.trim();
  if (!text) { showToast('请输入卡牌列表', 'error'); return; }

  // Parse structured text with sections
  var parsed = parseDeckText(text);
  var totalEntries = parsed.deck.length + parsed.sideboard.length + parsed.commander.length;
  if (totalEntries === 0) { showToast('没有解析到任何卡牌', 'error'); return; }

  // Update deck name if parsed
  if (parsed.name) {
    _currentDeckDetail.name = parsed.name;
  }

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

  // Combine all entries with zone tags for batch processing
  var allEntries = [];
  parsed.deck.forEach(function(e) { allEntries.push({ entry: e, zone: 'main' }); });
  parsed.sideboard.forEach(function(e) { allEntries.push({ entry: e, zone: 'sideboard' }); });
  parsed.commander.forEach(function(e) { allEntries.push({ entry: e, zone: 'commander' }); });

  for (var i = 0; i < allEntries.length; i += BATCH_SIZE) {
    var chunk = allEntries.slice(i, i + BATCH_SIZE);
    var pct = Math.round(((i + chunk.length) / allEntries.length) * 100);
    var bar = document.getElementById('deck-progress-bar');
    var txt = document.getElementById('deck-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = '导入中... ' + Math.min(i + chunk.length, allEntries.length) + '/' + allEntries.length + ' (' + pct + '%)';

    // Build unique names for this chunk
    var names = [];
    for (var j = 0; j < chunk.length; j++) {
      if (names.indexOf(chunk[j].entry.name) === -1) names.push(chunk[j].entry.name);
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
        var item = chunk[j];
        var entry = item.entry;
        var zone = item.zone;
        var card = cardMap[entry.name.toLowerCase()];
        if (!card) continue;

        // Determine target array
        var targetArr;
        if (zone === 'sideboard') {
          targetArr = _currentDeckDetail.sideboard;
        } else if (zone === 'commander') {
          if (!_currentDeckDetail.outside_game) _currentDeckDetail.outside_game = [];
          targetArr = _currentDeckDetail.outside_game;
        } else {
          targetArr = _currentDeckDetail.main_deck;
        }

        for (var n = 0; n < entry.count; n++) {
          // 4-copy limit only applies to main deck (not basic lands)
          if (zone === 'main' && !isBasicLand(card)) {
            var curCount = countCardCopies(_currentDeckDetail.main_deck, card.name);
            if (curCount >= 4) { skipped4++; continue; }
          }
          var newCard = Object.assign({}, card);
          newCard.id = newCard.id + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4) + '_' + n;
          targetArr.push(newCard);
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
  if (parsed.deck.length > 0) msg += ', 主牌 ' + parsed.deck.length + ' 种';
  if (parsed.sideboard.length > 0) msg += ', 备牌 ' + parsed.sideboard.length + ' 种';
  if (parsed.commander.length > 0) msg += ', 指挥官 ' + parsed.commander.length + ' 种';
  if (skipped4 > 0) msg += ', 跳过 ' + skipped4 + ' 张(超过4张上限)';
  if (allFailed.length > 0) msg += ', 失败 ' + allFailed.length + ' 种';
  if (parsed.name) msg += ', 牌组名: ' + parsed.name;
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
    var deckData;
    if (_columnMode === 'deck' && window._deckColumns) {
      deckData = getDeckDataFromColumns();
      _clearDeckColumns();
    } else {
      deckData = { main_deck: _currentDeckDetail.main_deck, sideboard: _currentDeckDetail.sideboard, outside_game: _currentDeckDetail.outside_game || [] };
    }
    await api('/api/decks/' + _currentDeckDetail.id, {
      method: 'PUT',
      body: JSON.stringify({
        name: _currentDeckDetail.name,
        ...deckData
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

    // When editing an existing deck with event pool, remove cards already in mainDeck, outsideGame, and sideboard
    if (existingDeck && params.eventId) {
      const sideboard = existingDeck.sideboard || [];
      var usedIds = new Set([...mainDeck.map(c => c.id), ...outsideGame.map(c => c.id), ...sideboard.map(c => c.id)]);
      pool = pool.filter(c => !usedIds.has(c.id));
    }

    // Store state for compatibility
    state.pageData._deckState = { pool: [...pool], mainDeck: [...mainDeck], outsideGame: [...outsideGame] };
    state.pageData._deckId = existingDeck ? existingDeck.id : (eventId || 'new');

    // Switch to deck column mode
    _columnMode = 'deck';
    if (existingDeck && existingDeck.column_keys && existingDeck.column_keys.length > 0) {
      _draftColumnKeys = existingDeck.column_keys.slice();
      existingDeck.column_keys.forEach(function(k) {
        if (k.indexOf('custom_') === 0 && !_draftColumnNames[k]) {
          var num = parseInt(k.replace('custom_', ''));
          _draftColumnNames[k] = '分组 ' + num;
          if (num > _customColumnCounter) _customColumnCounter = num;
        }
      });
    } else if (!existingDeck) {
      _resetColumnKeysToBase();
    }
    if (existingDeck) {
      // Editing existing deck: always load from server data, never use stale _draftColumns
      if (!_loadDeckColumns()) {
        if (eventId) {
          initDeckColumns(pool, mainDeck, outsideGame, existingDeck.sideboard || []);
        } else {
          initDeckColumns([], mainDeck, outsideGame, pool);
        }
      }
    } else if (_draftColumns && Object.keys(_draftColumns).length > 0) {
      // Fresh deck from just-completed draft
      window._deckColumns = JSON.parse(JSON.stringify(_draftColumns));
      window._deckManualPlacements = JSON.parse(JSON.stringify(_manualPlacements || {}));
      _saveDeckColumns();
    } else if (!_loadDeckColumns()) {
      initDeckColumns(pool, [], [], []);
    }

    // Determine back button target and save button
    var backTarget = betweenGames ? 'battle' : (eventId ? 'event-detail' : 'decks');
    var backOnclick = betweenGames
      ? `window.open('/battle.html?id=${battleId}', '_self')`
      : `navigate('${backTarget}', ${eventId ? `{id:${eventId}}` : '{}'})`;
    var saveOnclick = betweenGames
      ? `saveDeckBetweenGames(${battleId})`
      : `saveDeck(${existingDeck ? existingDeck.id : 'null'}, ${eventId || 'null'})`;
    var title = betweenGames ? '调整牌组 (局间)' : (existingDeck ? '编辑牌组' : '构建牌组');

    // Total card count (main deck + outside game, excluding sideboard)
    var totalCards = 0;
    _draftColumnKeys.forEach(function(k) { if (k !== 'Sideboard') totalCards += (window._deckColumns[k] || []).length; });

    el.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-16" onclick="${backOnclick}">← 返回</button>
          <h2>${title}</h2>
        </div>
        <div class="flex gap-8" style="align-items:center">
          <input type="text" id="deck-name" value="${escapeHtml(deckName)}" placeholder="牌组名称" style="width:180px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-bright)">
          <button class="btn btn-primary" onclick="${saveOnclick}">${betweenGames ? '保存并开始下一局' : '保存'}</button>
        </div>
      </div>

      <div class="draft-redesign" id="deck-redesign">
        <!-- Basic Lands + Search (combined top bar) -->
        <div class="draft-pick-strip" style="flex-direction:row;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-weight:600;color:var(--text-bright);font-size:0.9rem">添加基本地</span>
          <button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck('Plains')" style="min-width:70px">平原 +1</button>
          <button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck('Island')" style="min-width:70px">海岛 +1</button>
          <button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck('Swamp')" style="min-width:70px">沼泽 +1</button>
          <button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck('Mountain')" style="min-width:70px">山脉 +1</button>
          <button class="btn btn-secondary btn-sm" onclick="addBasicLandToDeck('Forest')" style="min-width:70px">树林 +1</button>
          <span id="basic-land-counts" class="text-muted" style="font-size:0.8rem;margin-left:auto"></span>
        </div>

        ${!eventId ? `
        <!-- Card Search (custom deck only) -->
        <div class="draft-pick-strip" id="deck-search-strip" style="gap:6px">
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="deck-search-input" placeholder="搜索卡牌名称... 点击添加到主牌组" style="flex:1;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-bright);font-size:0.9rem" onkeydown="if(event.key==='Enter')searchDeckBuilderCards()">
            <button class="btn btn-secondary btn-sm" onclick="searchDeckBuilderCards()">搜索</button>
          </div>
          <div id="deck-search-results" class="draft-pick-scroll" style="min-height:0;max-height:140px;padding:4px 0"></div>
        </div>
        ` : ''}

        <!-- Column layout (same as draft) -->
        <div class="draft-columns-area" id="deck-columns-area">
          <div class="draft-columns-header">
            <span style="color:var(--text-bright);font-size:0.85rem;font-weight:600">卡牌分组 <span class="text-muted" id="deck-pool-count" style="font-weight:400">${totalCards}张</span></span>
          </div>
          <div class="draft-columns-scroll" id="deck-columns-scroll"></div>
        </div>
      </div>
    `;

    // Apply fullscreen-like styling for deck builder
    document.body.classList.add('draft-fullscreen');

    // Render columns
    renderDraftColumns();

    // Update basic land counts display
    updateDeckBasicLandCounts();

  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载失败</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// Search cards for the column-based deck builder (custom deck mode)
async function searchDeckBuilderCards() {
  var input = document.getElementById('deck-search-input');
  var resultsEl = document.getElementById('deck-search-results');
  if (!input || !resultsEl) return;
  var q = input.value.trim();
  if (!q) { resultsEl.innerHTML = ''; return; }
  try {
    var results = await api('/api/cards/search?q=' + encodeURIComponent(q));
    var cards = results.cards || [];
    if (cards.length === 0) {
      resultsEl.innerHTML = '<span class="text-muted" style="padding:8px">未找到卡牌</span>';
      return;
    }
    resultsEl.innerHTML = '';
    cards.forEach(function(card) {
      var el = createCardElement(card, function() {
        // Click to add to main deck column (CMC-based)
        var cols = _getColumns();
        if (!cols) return;
        var col = getDraftCardColumn(card);
        var cardCopy = Object.assign({}, card, {
          id: card.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
        });
        if (!cols[col]) cols[col] = [];
        cols[col].push(cardCopy);
        if (_columnMode === 'deck') { _saveDeckColumns(); } else { _saveDraftColumns(); }
        renderDraftColumns();
        showToast(card.name + ' 已添加');
      });
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', function(e) {
        var cardCopy = Object.assign({}, card, {
          id: card.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
        });
        e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'deck-search', card: cardCopy }));
        e.dataTransfer.effectAllowed = 'copy';
        el.style.opacity = '0.5';
      });
      el.addEventListener('dragend', function() {
        el.style.opacity = '';
        document.querySelectorAll('.draft-column.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
      });
      resultsEl.appendChild(el);
    });
  } catch (err) {
    resultsEl.innerHTML = '<span class="text-muted" style="padding:8px">搜索失败: ' + escapeHtml(err.message) + '</span>';
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
  if (!ds.outsideGame) ds.outsideGame = [];
  var fromZone = data.fromZone;
  var cardId = data.cardId;
  if (fromZone === toZoneId) return;

  // Map container IDs to state arrays
  var zoneMap = {
    'deck-pool': ds.pool,
    'deck-main': ds.mainDeck,
    'deck-outside': ds.outsideGame,
    'deck-sideboard': ds.sideboard || []
  };
  var sourceArr = zoneMap[fromZone];
  var targetArr = zoneMap[toZoneId];
  if (!sourceArr || !targetArr) return;

  var idx = sourceArr.findIndex(function(c) { return c.id === cardId; });
  if (idx === -1) return;
  var card = sourceArr.splice(idx, 1)[0];
  // Basic lands dragged back to pool are discarded, not returned to pool
  if (toZoneId === 'deck-pool' && card.type && card.type.indexOf('Basic Land') === 0) {
    // discard basic land
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

// Add basic land to deck columns (column-based deck builder)
function addBasicLandToDeck(landType) {
  var cols = _getColumns();
  if (!cols) return;
  var land = Object.assign({}, BASIC_LANDS[landType], {
    id: 'basic_' + landType.toLowerCase() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
  });
  if (!cols['Land']) cols['Land'] = [];
  cols['Land'].push(land);
  if (_columnMode === 'deck') { _saveDeckColumns(); } else { _saveDraftColumns(); }
  renderDraftColumns();
  updateDeckBasicLandCounts();
}

function updateDeckBasicLandCounts() {
  var el = document.getElementById('basic-land-counts');
  if (!el) return;
  var cols = _getColumns();
  if (!cols) return;
  var landCards = cols['Land'] || [];
  var counts = {};
  landCards.forEach(function(c) {
    var n = c.name || '';
    counts[n] = (counts[n] || 0) + 1;
  });
  var landNames = { Plains: '平原', Island: '海岛', Swamp: '沼泽', Mountain: '山脉', Forest: '树林' };
  var parts = [];
  ['Plains','Island','Swamp','Mountain','Forest'].forEach(function(k) {
    if (counts[k]) parts.push((landNames[k] || k) + ':' + counts[k]);
  });
  el.textContent = parts.join('  ');
}

// Extract deck data from columns for saving
function getDeckDataFromColumns() {
  var cols = _getColumns();
  if (!cols) return { main_deck: [], sideboard: [], outside_game: [] };
  var mainDeck = [];
  var sideboard = [];
  var outsideGame = [];
  _draftColumnKeys.forEach(function(k) {
    var cards = (cols[k] || []).map(function(c) {
      var tagged = Object.assign({}, c);
      tagged._column = k;
      return tagged;
    });
    if (k === 'Sideboard') {
      sideboard = sideboard.concat(cards);
    } else if (k === 'Outside') {
      outsideGame = outsideGame.concat(cards);
    } else {
      mainDeck = mainDeck.concat(cards);
    }
  });
  var customKeys = _draftColumnKeys.filter(function(k) { return k.indexOf('custom_') === 0; });
  return { main_deck: mainDeck, sideboard: sideboard, outside_game: outsideGame, column_keys: customKeys.length > 0 ? _draftColumnKeys.slice() : [] };
}

async function saveDeck(deckId, eventId) {
  const name = document.getElementById('deck-name')?.value.trim() || '未命名牌组';
  var deckData;
  if (_columnMode === 'deck' && window._deckColumns) {
    deckData = getDeckDataFromColumns();
    _clearDeckColumns();
  } else {
    const ds = state.pageData._deckState;
    if (!ds) return;
    deckData = { main_deck: ds.mainDeck, sideboard: ds.pool, outside_game: ds.outsideGame || [] };
  }
  const body = { name, ...deckData };

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
  const name = document.getElementById('deck-name')?.value.trim() || '未命名牌组';
  var deckData;
  if (_columnMode === 'deck' && window._deckColumns) {
    deckData = getDeckDataFromColumns();
    _clearDeckColumns();
  } else {
    const ds = state.pageData._deckState;
    if (!ds) return;
    deckData = { main_deck: ds.mainDeck, sideboard: ds.pool, outside_game: ds.outsideGame || [] };
  }
  const updatedDeck = { name: name, ...deckData };
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
