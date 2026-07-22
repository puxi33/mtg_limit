// ============================================================
// cubes.js — Cube management
// ============================================================

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
