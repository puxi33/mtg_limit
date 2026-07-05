// ============================================================
// UI helpers: toast, modal, card rendering, hover preview
// ============================================================
const UI = {};

// Mana symbol map (used by renderManaCost and card preview)
const MANA_SYMBOLS = {
  W: { class: 'mana-W', label: 'W', color: '#f9faf4', textColor: '#1a1a1a' },
  U: { class: 'mana-U', label: 'U', color: '#0e68ab', textColor: '#fff' },
  B: { class: 'mana-B', label: 'B', color: '#2d2820', textColor: '#fff' },
  R: { class: 'mana-R', label: 'R', color: '#d3202a', textColor: '#fff' },
  G: { class: 'mana-G', label: 'G', color: '#00733e', textColor: '#fff' },
  C: { class: 'mana-C', label: 'C', color: '#9a9a9a', textColor: '#fff' }
};

// Render mana cost string like "{2}{W}{U}" to HTML
UI.renderManaCost = function(costStr) {
  if (!costStr) return '';
  return costStr.replace(/\{([^}]+)\}/g, (m, sym) => {
    if (MANA_SYMBOLS[sym]) {
      const s = MANA_SYMBOLS[sym];
      return `<span class="mana-symbol ${s.class}">${s.label}</span>`;
    }
    if (/^\d+$/.test(sym) || sym === 'X') {
      return `<span class="mana-symbol mana-${sym}">${sym}</span>`;
    }
    // Hybrid (e.g. W/U)
    if (sym.includes('/')) {
      const parts = sym.split('/');
      const a = MANA_SYMBOLS[parts[0]];
      if (a) return `<span class="mana-symbol ${a.class}" style="position:relative;background:linear-gradient(135deg, ${a.color} 50%, ${MANA_SYMBOLS[parts[1]]?.color || '#666'} 50%);">${parts[0]}</span>`;
    }
    return `<span class="mana-symbol mana-C">${sym}</span>`;
  });
};

UI.getCardColorClass = function(card) {
  if (!card.colors || card.colors.length === 0) {
    if (card.type && card.type.includes('Land')) return 'land';
    return 'artifact';
  }
  if (card.colors.length > 1) return 'multi';
  return card.colors[0];
};

// Create a card DOM element with image (preferred) or text fallback
UI.createCardElement = function(card, options = {}) {
  const { onClick, onContextMenu, selected, attacking, blocking, tapped } = options;
  const div = document.createElement('div');
  div.className = 'mtg-card';
  div.setAttribute('data-color', UI.getCardColorClass(card));
  div.setAttribute('data-id', card.id);
  if (selected) div.classList.add('selected');
  if (attacking) div.classList.add('attacking');
  if (blocking) div.classList.add('blocking');
  if (tapped) div.classList.add('tapped');

  if (card.image || card.image_small) {
    const imgSrc = card.image_small || card.image;
    const safeName = (card.name || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    div.innerHTML = `
      <img class="mtg-card-image" src="${imgSrc}" alt="${safeName}" loading="lazy"
        onerror="this.style.display='none';this.parentElement.classList.add('mtg-card-no-img');">
    `;
  } else {
    // Fallback text card
    const pt = (card.power != null && card.toughness != null) ? `${card.power} / ${card.toughness}` : '';
    const safeName = (card.name || '').replace(/</g, '&lt;');
    const safeType = (card.type || '').replace(/</g, '&lt;');
    const safeText = (card.text || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    div.innerHTML = `
      <div class="mtg-card-text">
        <div class="mtg-card-header">
          <span class="mtg-card-name">${safeName}</span>
          <span class="mtg-card-cost">${UI.renderManaCost(card.manaCost)}</span>
        </div>
        <div class="mtg-card-type">${safeType}</div>
        <div class="mtg-card-text-content">${safeText}</div>
        ${pt ? `<div class="mtg-card-pt">${pt}</div>` : ''}
      </div>
    `;
  }

  // Hover preview (attach to the inner image if present, else the div)
  const hoverTarget = div.querySelector('img') || div;
  hoverTarget.addEventListener('mouseenter', (e) => UI.showCardPreview(card, e));
  hoverTarget.addEventListener('mousemove', (e) => UI.moveCardPreview(e));
  hoverTarget.addEventListener('mouseleave', () => UI.hideCardPreview());

  if (onClick) div.addEventListener('click', (e) => { e.stopPropagation(); onClick(card, e); });
  if (onContextMenu) div.addEventListener('contextmenu', (e) => { e.preventDefault(); onContextMenu(card, e); });
  return div;
};

UI.showCardPreview = function(card, event) {
  const preview = document.getElementById('card-preview');
  if (!preview) return;
  if (card.image || card.image_large) {
    preview.innerHTML = `<img src="${card.image_large || card.image}" alt="${card.name}">`;
  } else {
    const pt = (card.power != null && card.toughness != null) ? `${card.power} / ${card.toughness}` : '';
    const safeName = (card.name || '').replace(/</g, '&lt;');
    const safeType = (card.type || '').replace(/</g, '&lt;');
    const safeText = (card.text || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    preview.innerHTML = `
      <div class="card-preview-fallback">
        <div class="card-preview-cost">${UI.renderManaCost(card.manaCost)}</div>
        <div class="card-preview-name">${safeName}</div>
        <div class="card-preview-type">${safeType}</div>
        <div class="card-preview-text">${safeText}</div>
        ${pt ? `<div class="card-preview-pt">${pt}</div>` : ''}
      </div>
    `;
  }
  preview.classList.remove('hidden');
  UI.moveCardPreview(event);
};

UI.moveCardPreview = function(event) {
  const preview = document.getElementById('card-preview');
  if (!preview || preview.classList.contains('hidden')) return;
  const padding = 16;
  const previewW = 280;
  let x = event.clientX + padding;
  let y = event.clientY + padding;
  if (x + previewW > window.innerWidth) x = event.clientX - previewW - padding;
  if (y + 380 > window.innerHeight) y = event.clientY - 380;
  preview.style.left = `${Math.max(8, x)}px`;
  preview.style.top = `${Math.max(8, y)}px`;
};

UI.hideCardPreview = function() {
  const preview = document.getElementById('card-preview');
  if (preview) preview.classList.add('hidden');
};

// ============================================================
// Group cards by color (for cube / pool / deck views)
// ============================================================
UI.groupCardsByColor = function(cards) {
  const groups = { W: [], U: [], B: [], R: [], G: [], Multi: [], Artifact: [], Land: [] };
  for (const card of cards) {
    const colorClass = UI.getCardColorClass(card);
    if (card.type && card.type.includes('Land')) groups.Land.push(card);
    else if (colorClass === 'multi') groups.Multi.push(card);
    else if (colorClass === 'artifact') groups.Artifact.push(card);
    else if (groups[colorClass]) groups[colorClass].push(card);
    else groups.Artifact.push(card);
  }
  return groups;
};

UI.COLOR_NAMES = {
  W: '白色', U: '蓝色', B: '黑色', R: '红色', G: '绿色',
  Multi: '多色', Artifact: '神器', Land: '地'
};

// ============================================================
// Toast notifications
// ============================================================
UI.toast = function(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// ============================================================
// Modal
// ============================================================
UI.showModal = function(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
};

UI.closeModal = function() {
  document.getElementById('modal-overlay').classList.add('hidden');
};

// ============================================================
// Utility functions
// ============================================================
UI.escapeHtml = function(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
};

UI.formatDate = function(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

UI.formatDateTime = function(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Status badge helper
UI.statusBadge = function(status) {
  const map = {
    waiting: ['badge-waiting', '等待中'],
    in_progress: ['badge-progress', '进行中'],
    completed: ['badge-completed', '已完成']
  };
  const [cls, label] = map[status] || ['badge-completed', status];
  return `<span class="badge ${cls}">${label}</span>`;
};

UI.typeBadge = function(type) {
  return `<span class="badge badge-${type}">${type === 'draft' ? '轮抓' : '现开'}</span>`;
};