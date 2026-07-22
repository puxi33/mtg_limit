// ============================================================
// utils.js — State, API helper, UI helpers, card helpers
// ============================================================

// ========== STATE ==========
var state = {
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
async function api(path, options) {
  options = options || {};
  var headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  var res = await fetch(path, Object.assign({}, options, { headers: Object.assign({}, headers, options.headers || {}) }));
  var data;
  try { data = await res.json(); } catch (e) { data = {}; }
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
function showToast(message, type) {
  type = type || 'success';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
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
  return cost.replace(/\{([^}]+)\}/g, function(match, sym) {
    var colors = { W: 'white-mana', U: 'blue-mana', B: '#666', R: 'red-mana', G: 'green-mana' };
    var color = colors[sym] || '#888';
    return '<span style="background:' + color + ';color:white;padding:1px 5px;border-radius:50%;font-size:0.7rem;font-weight:700;display:inline-block;min-width:18px;text-align:center;">' + sym + '</span>';
  });
}

function createCardElement(card, onClick) {
  var div = document.createElement('div');
  div.className = 'mtg-card';
  div.setAttribute('data-color', getCardColorClass(card));
  div.setAttribute('data-id', card.id);
  if (card.tapped) div.classList.add('tapped');

  if (card.image || card.image_small) {
    var imgSrc = card.image_small || card.image;
    div.innerHTML = '<img src="' + imgSrc + '" alt="' + escapeHtml(card.name) + '" class="mtg-card-image" loading="lazy"' +
      ' onerror="this.parentElement.innerHTML=\'<div class=\\\'mtg-card-header\\\'><span class=\\\'mtg-card-name\\\'>' + card.name.replace(/'/g, "\\'") + '</span></div><div class=\\\'mtg-card-type\\\'>' + (card.type || '').replace(/'/g, "\\'") + '</div>\'">';
    div.style.width = '200px';
  } else {
    var pt = (card.power != null && card.toughness != null) ? card.power + ' / ' + card.toughness : '';
    div.innerHTML = '<div class="mtg-card-header"><span class="mtg-card-name">' + escapeHtml(card.name) + '</span>' +
      '<span class="mtg-card-cost">' + renderManaCost(card.manaCost) + '</span></div>' +
      '<div class="mtg-card-type">' + escapeHtml(card.type || '') + '</div>' +
      '<div class="mtg-card-text">' + escapeHtml(card.text || '') + '</div>' +
      (pt ? '<div class="mtg-card-footer">' + pt + '</div>' : '');
  }

  if (card.image || card.image_small || card.image_back || card.image_small_back) {
    div.addEventListener('mouseenter', function(e) { showCardPreview(card, e); });
    div.addEventListener('mousemove', function(e) { moveCardPreview(e); });
    div.addEventListener('mouseleave', function() { hideCardPreview(); });
  }

  if (onClick) div.addEventListener('click', function() { onClick(card); });
  return div;
}

function groupCardsByColor(cards) {
  var groups = { W: [], U: [], B: [], R: [], G: [], Multi: [], Artifact: [], Land: [] };
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var colorClass = getCardColorClass(card);
    if (card.type && card.type.includes('Land')) groups.Land.push(card);
    else if (colorClass === 'multi') groups.Multi.push(card);
    else if (colorClass === 'artifact') groups.Artifact.push(card);
    else if (groups[colorClass]) groups[colorClass].push(card);
    else groups.Artifact.push(card);
  }
  return groups;
}

var COLOR_NAMES = { W: '白色', U: '蓝色', B: '黑色', R: '红色', G: '绿色', Multi: '多色', Artifact: '神器', Land: '地' };

// ========== MOBILE NAV TOGGLE ==========
function toggleNavMenu() {
  var links = document.querySelector('.nav-links');
  var toggle = document.querySelector('.nav-toggle');
  if (!links || !toggle) return;
  var isOpen = links.classList.toggle('open');
  toggle.classList.toggle('active', isOpen);
}

function closeNavMenu() {
  var links = document.querySelector('.nav-links');
  var toggle = document.querySelector('.nav-toggle');
  if (links) links.classList.remove('open');
  if (toggle) toggle.classList.remove('active');
}
