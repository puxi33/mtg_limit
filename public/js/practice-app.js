// ============================================================
// practice-app.js — 刷题练习系统前端逻辑
// ============================================================

// ========== STATE ==========
const state = {
  token: null,
  user: null,
  currentPage: 'banks',
  pageData: {},
  banks: [],
  currentBank: null,
  session: null,   // { mode, title, bankId, questions, index, results }
  selected: [],    // letters selected for current question
};

// ========== UTILITY ==========
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (res.status === 401 && state.token) {
    state.token = null; state.user = null; navigate('login');
    throw new Error('认证已过期');
  }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showModal(title, bodyHtml, footerHtml, wide) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '';
  document.getElementById('modal-content').classList.toggle('wide', !!wide);
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function setActiveTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-tab') === tab);
  });
}

// ========== ROUTING ==========
function navigate(page, params = {}) {
  state.currentPage = page;
  state.pageData = params;
  const content = document.getElementById('content');
  window.scrollTo(0, 0);
  switch (page) {
    case 'banks': setActiveTab('banks'); renderBanks(content); break;
    case 'bank-detail': setActiveTab('banks'); renderBankDetail(content, params.id); break;
    case 'browse': setActiveTab('banks'); renderBrowse(content, params); break;
    case 'practice': setActiveTab(''); renderPractice(content); break;
    case 'wrong-book': setActiveTab('wrong'); renderWrongBook(content); break;
    case 'favorites': setActiveTab('favorites'); renderFavorites(content); break;
    case 'stats': setActiveTab('stats'); renderStats(content); break;
    case 'login': setActiveTab(''); renderLogin(content); break;
    default: setActiveTab('banks'); renderBanks(content);
  }
}

// ========== AUTH ==========
function renderLogin(el) {
  el.innerHTML = `
    <div style="max-width:380px;margin:60px auto;background:#fff;padding:32px;border-radius:20px;box-shadow:0 4px 24px rgba(124,140,248,0.14)">
      <div style="text-align:center;margin-bottom:16px;font-size:2.6rem">&#x1F4DA;</div>
      <h2 style="text-align:center;margin-bottom:20px;color:var(--text-bright);font-weight:700;font-size:1.3rem">登录刷题练习</h2>
      <form onsubmit="handleAuth(event)">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="auth-username" required placeholder="输入用户名" autocomplete="username">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="auth-password" required placeholder="输入密码" autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-primary btn-block">登录</button>
      </form>
    </div>`;
}

async function handleAuth(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    state.token = data.token; state.user = data.user;
    setUserBadge(data.user);
    showToast(`欢迎回来, ${data.user.username}!`);
    navigate('banks');
  } catch (err) { showToast(err.message, 'error'); }
}

function setUserBadge(user) {
  document.getElementById('nav-username').textContent = user.nickname || user.username;
  const avatar = document.getElementById('nav-avatar');
  if (avatar) avatar.textContent = (user.nickname || user.username).charAt(0).toUpperCase();
}

function logout() {
  state.token = null; state.user = null;
  fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  navigate('login');
}

// ========== BANKS LIST ==========
async function renderBanks(el) {
  el.innerHTML = `<div class="empty-state"><div class="emoji">&#x23F3;</div><p>加载中...</p></div>`;
  try {
    const banks = await api('/api/practice/banks');
    state.banks = banks;
  } catch (err) { el.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`; return; }

  const cards = state.banks.map(b => {
    const pct = b.question_count ? Math.round((b.answered_count / b.question_count) * 100) : 0;
    return `
      <div class="bank-card" onclick="navigate('bank-detail',{id:${b.id}})">
        <div class="card-actions">
          <button class="icon-btn" title="编辑" onclick="event.stopPropagation();openEditBank(${b.id})">&#x270E;</button>
          <button class="icon-btn danger" title="删除" onclick="event.stopPropagation();deleteBank(${b.id})">&#x1F5D1;</button>
        </div>
        <h3>${escapeHtml(b.name)}</h3>
        <div class="desc">${escapeHtml(b.description || '暂无描述')}</div>
        <div class="bank-meta">
          <span>章节 <b>${b.chapter_count}</b></span>
          <span>题目 <b>${b.question_count}</b></span>
          <span>错题 <b style="color:var(--danger)">${b.wrong_count}</b></span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div style="font-size:0.76rem;color:var(--text-muted);margin-top:6px">已练 ${b.answered_count}/${b.question_count} (${pct}%)</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="pq-header">
      <div>
        <h2>&#x1F4DA; 题库</h2>
        <div class="sub">选择题库开始练习，或导入 JSON 创建新题库</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="openImport()">&#x2B06; 导入 JSON</button>
        <button class="btn btn-primary" onclick="openCreateBank()">+ 新建题库</button>
      </div>
    </div>
    ${state.banks.length
      ? `<div class="bank-grid">${cards}</div>`
      : `<div class="empty-state">
           <div class="emoji">&#x1F4DA;</div>
           <p>还没有题库。导入 JSON 或手动创建一个吧。</p>
           <button class="btn btn-primary" onclick="openImport()">导入 JSON 题库</button>
         </div>`}`;
}

function openCreateBank() {
  showModal('新建题库', `
    <div class="form-group"><label>题库名称</label><input id="bank-name" placeholder="例如：2026 浙江专技考试"></div>
    <div class="form-group"><label>描述（可选）</label><textarea id="bank-desc" placeholder="题库用途、范围等"></textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitCreateBank()">创建</button>`);
}

async function submitCreateBank() {
  const name = document.getElementById('bank-name').value.trim();
  const description = document.getElementById('bank-desc').value.trim();
  if (!name) return showToast('请输入题库名称', 'error');
  try {
    const bank = await api('/api/practice/banks', { method: 'POST', body: JSON.stringify({ name, description }) });
    closeModal(); showToast('题库已创建');
    navigate('bank-detail', { id: bank.id });
  } catch (err) { showToast(err.message, 'error'); }
}

function openEditBank(id) {
  const b = state.banks.find(x => x.id === id);
  if (!b) return;
  showModal('编辑题库', `
    <div class="form-group"><label>题库名称</label><input id="bank-name" value="${escapeHtml(b.name)}"></div>
    <div class="form-group"><label>描述</label><textarea id="bank-desc">${escapeHtml(b.description || '')}</textarea></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitEditBank(${id})">保存</button>`);
}

async function submitEditBank(id) {
  const name = document.getElementById('bank-name').value.trim();
  const description = document.getElementById('bank-desc').value.trim();
  if (!name) return showToast('请输入题库名称', 'error');
  try {
    await api(`/api/practice/banks/${id}`, { method: 'PUT', body: JSON.stringify({ name, description }) });
    closeModal(); showToast('已保存'); navigate('banks');
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteBank(id) {
  const b = state.banks.find(x => x.id === id);
  if (!confirm(`确定删除题库「${b ? b.name : ''}」及其所有题目、章节吗？此操作不可撤销。`)) return;
  try { await api(`/api/practice/banks/${id}`, { method: 'DELETE' }); showToast('题库已删除'); navigate('banks'); }
  catch (err) { showToast(err.message, 'error'); }
}

// ========== BANK DETAIL ==========
async function renderBankDetail(el, id) {
  el.innerHTML = `<div class="empty-state"><div class="emoji">&#x23F3;</div><p>加载中...</p></div>`;
  let bank;
  try { bank = await api(`/api/practice/banks/${id}`); }
  catch (err) { el.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`; return; }
  state.currentBank = bank;

  const chapterRows = bank.chapters.map(c => `
    <div class="chapter-row" onclick="startChapter(${bank.id}, ${c.id})">
      <div>
        <div class="ch-name">${escapeHtml(c.name)}</div>
        <div class="ch-count">${c.question_count} 题</div>
      </div>
      <div class="ch-actions">
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();navigate('browse',{bankId:${bank.id},chapterId:${c.id}})">管理</button>
        <button class="icon-btn" title="重命名" onclick="event.stopPropagation();openEditChapter(${c.id})">&#x270E;</button>
        <button class="icon-btn danger" title="删除章节" onclick="event.stopPropagation();deleteChapter(${bank.id},${c.id})">&#x1F5D1;</button>
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div class="back-link" onclick="navigate('banks')">&larr; 返回题库列表</div>
    <div class="pq-header">
      <div>
        <h2>${escapeHtml(bank.name)}</h2>
        <div class="sub">${escapeHtml(bank.description || '')} · 共 ${bank.question_count} 题 / ${bank.chapters.length} 章节</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="openImport(${bank.id})">&#x2B06; 导入到本题库</button>
        <button class="btn btn-accent" onclick="startSequential(${bank.id})">&#x25B6; 顺序练习全部</button>
      </div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px">
      <button class="btn btn-secondary" onclick="startWrongBank(${bank.id})">&#x274C; 本题库错题重做</button>
      <button class="btn btn-secondary" onclick="startFavBank(${bank.id})">&#x2B50; 本题库收藏练习</button>
      <button class="btn btn-secondary" onclick="navigate('browse',{bankId:${bank.id}})">&#x1F5C2; 管理全部题目</button>
      <button class="btn btn-secondary" onclick="openCreateChapter(${bank.id})">+ 新建章节</button>
    </div>

    ${bank.chapters.length
      ? `<div class="chapter-list">${chapterRows}</div>`
      : `<div class="empty-state"><div class="emoji">&#x1F5C2;</div><p>还没有章节，可导入 JSON 或手动新建。</p></div>`}

    ${bank.unfiled_count ? `
      <div class="chapter-row" style="margin-top:14px" onclick="startUnfiled(${bank.id})">
        <div><div class="ch-name">未分组题目</div><div class="ch-count">${bank.unfiled_count} 题</div></div>
        <div class="ch-actions"><button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();navigate('browse',{bankId:${bank.id},unfiled:1})">管理</button></div>
      </div>` : ''}`;
}

function openCreateChapter(bankId) {
  showModal('新建章节', `<div class="form-group"><label>章节名称</label><input id="ch-name" placeholder="例如：第一章 电子技术基础"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="submitCreateChapter(${bankId})">创建</button>`);
}
async function submitCreateChapter(bankId) {
  const name = document.getElementById('ch-name').value.trim();
  if (!name) return showToast('请输入章节名称', 'error');
  try { await api(`/api/practice/banks/${bankId}/chapters`, { method: 'POST', body: JSON.stringify({ name }) }); closeModal(); showToast('章节已创建'); navigate('bank-detail', { id: bankId }); }
  catch (err) { showToast(err.message, 'error'); }
}
function openEditChapter(id) {
  const ch = state.currentBank && state.currentBank.chapters.find(c => c.id === id);
  const name = ch ? ch.name : '';
  showModal('重命名章节', `<div class="form-group"><label>章节名称</label><input id="ch-name" value="${escapeHtml(name)}"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="submitEditChapter(${id})">保存</button>`);
}
async function submitEditChapter(id) {
  const name = document.getElementById('ch-name').value.trim();
  if (!name) return showToast('请输入章节名称', 'error');
  const bankId = state.currentBank ? state.currentBank.id : null;
  try { await api(`/api/practice/chapters/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }); closeModal(); showToast('已保存'); if (bankId) navigate('bank-detail', { id: bankId }); }
  catch (err) { showToast(err.message, 'error'); }
}
async function deleteChapter(bankId, id) {
  if (!confirm('删除该章节？章节内题目会移到「未分组」，不会被删除。')) return;
  try { await api(`/api/practice/chapters/${id}`, { method: 'DELETE' }); showToast('章节已删除'); navigate('bank-detail', { id: bankId }); }
  catch (err) { showToast(err.message, 'error'); }
}

// ========== IMPORT ==========
function openImport(bankId) {
  showModal('导入 JSON 题库', `
    <div class="form-group">
      <label>选择 JSON 文件</label>
      <input type="file" id="import-file" accept=".json,application/json" onchange="readImportFile(event)">
    </div>
    <div class="form-group">
      <label>或直接粘贴 JSON</label>
      <textarea id="import-text" class="mono" style="min-height:200px" placeholder='{ "banks": [ ... ] }'></textarea>
      <div class="form-hint">
        支持多题库 + 章节分组。顶层可为 <span class="mono">{"banks":[...]}</span> 或单个题库对象。
        <details style="margin-top:8px"><summary style="cursor:pointer;color:var(--primary)">查看格式示例</summary>
        <pre class="mono" style="background:var(--bg-input);padding:12px;border-radius:8px;margin-top:8px;overflow:auto;font-size:0.74rem;line-height:1.5">{
  "banks": [{
    "name": "电子技术基础",
    "description": "2026 浙江专技考试",
    "chapters": [{
      "name": "第一章 半导体",
      "questions": [
        {
          "type": "single",
          "stem": "P型半导体掺入的是()元素",
          "options": {"A":"三价","B":"四价","C":"五价","D":"六价"},
          "answer": "A",
          "analysis": "解析可选"
        },
        {
          "type": "multi",
          "stem": "下列属于...的有()",
          "options": ["选项1","选项2","选项3"],
          "answer": ["A","C"]
        }
      ]
    }]
  }]
}</pre></details>
      </div>
    </div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitImport()">开始导入</button>`, true);
}

function readImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { document.getElementById('import-text').value = ev.target.result; };
  reader.readAsText(file);
}

async function submitImport() {
  const text = document.getElementById('import-text').value.trim();
  if (!text) return showToast('请粘贴或选择 JSON', 'error');
  let payload;
  try { payload = JSON.parse(text); }
  catch (e) { return showToast('JSON 解析失败: ' + e.message, 'error'); }
  try {
    const res = await api('/api/practice/import', { method: 'POST', body: JSON.stringify(payload) });
    closeModal();
    const s = res.summary;
    let msg = `导入成功：${s.banks} 题库 / ${s.chapters} 章节 / ${s.questions} 题`;
    if (s.skipped) msg += `，跳过 ${s.skipped}`;
    showToast(msg, s.skipped ? 'info' : 'success');
    if (res.errors && res.errors.length) {
      showModal('导入完成（有跳过项）', `<div class="form-hint" style="color:var(--text)">共跳过 ${res.error_count} 项，前 ${res.errors.length} 条：</div>
        <ul style="margin:10px 0 0 18px;font-size:0.82rem;color:var(--text-muted);line-height:1.8">${res.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`,
        `<button class="btn btn-primary" onclick="closeModal();navigate('banks')">知道了</button>`, true);
    } else {
      navigate('banks');
    }
  } catch (err) { showToast(err.message, 'error'); }
}

// ========== PRACTICE SESSION ==========
async function startChapter(bankId, chapterId) {
  try {
    const data = await api(`/api/practice/banks/${bankId}/questions?chapter_id=${chapterId}`);
    if (!data.questions.length) return showToast('该章节暂无题目', 'info');
    const ch = (state.currentBank && state.currentBank.chapters.find(c => c.id === chapterId));
    beginSession({ mode: 'chapter', title: ch ? ch.name : '章节练习', bankId, questions: data.questions });
  } catch (err) { showToast(err.message, 'error'); }
}
async function startSequential(bankId) {
  try {
    const data = await api(`/api/practice/banks/${bankId}/questions`);
    if (!data.questions.length) return showToast('题库暂无题目', 'info');
    beginSession({ mode: 'sequential', title: '顺序练习', bankId, questions: data.questions });
  } catch (err) { showToast(err.message, 'error'); }
}
async function startUnfiled(bankId) {
  try {
    const data = await api(`/api/practice/banks/${bankId}/questions?unfiled=1`);
    if (!data.questions.length) return showToast('暂无未分组题目', 'info');
    beginSession({ mode: 'unfiled', title: '未分组题目', bankId, questions: data.questions });
  } catch (err) { showToast(err.message, 'error'); }
}
async function startWrongBank(bankId) {
  try {
    const data = await api(`/api/practice/wrong-book?bank_id=${bankId}`);
    if (!data.questions.length) return showToast('本题库暂无错题，太棒了！', 'info');
    beginSession({ mode: 'wrong', title: '错题重做', bankId, questions: data.questions });
  } catch (err) { showToast(err.message, 'error'); }
}
async function startFavBank(bankId) {
  try {
    const data = await api(`/api/practice/favorites?bank_id=${bankId}`);
    if (!data.questions.length) return showToast('本题库暂无收藏', 'info');
    beginSession({ mode: 'favorite', title: '收藏练习', bankId, questions: data.questions });
  } catch (err) { showToast(err.message, 'error'); }
}
async function startAllWrong() {
  try {
    const data = await api('/api/practice/wrong-book');
    if (!data.questions.length) return showToast('暂无错题，太棒了！', 'info');
    beginSession({ mode: 'wrong', title: '全部错题重做', bankId: null, questions: data.questions });
  } catch (err) { showToast(err.message, 'error'); }
}
async function startAllFav() {
  try {
    const data = await api('/api/practice/favorites');
    if (!data.questions.length) return showToast('暂无收藏', 'info');
    beginSession({ mode: 'favorite', title: '全部收藏练习', bankId: null, questions: data.questions });
  } catch (err) { showToast(err.message, 'error'); }
}

function beginSession({ mode, title, bankId, questions }) {
  state.session = { mode, title, bankId, questions, index: 0, results: {} };
  state.selected = [];
  navigate('practice');
}

function renderPractice(el) {
  const s = state.session;
  if (!s || !s.questions.length) { el.innerHTML = `<div class="empty-state"><p>没有练习会话</p><button class="btn btn-primary" onclick="navigate('banks')">返回题库</button></div>`; return; }
  const i = s.index;
  const q = s.questions[i];
  const result = s.results[i];
  const total = s.questions.length;
  const doneCount = Object.keys(s.results).length;
  const correctCount = Object.values(s.results).filter(r => r.correct).length;

  const optionsHtml = q.options.map(o => {
    let cls = 'option' + (q.type === 'multi' ? ' multi' : '');
    if (result) {
      cls += ' disabled';
      const isAns = result.correctAnswer.includes(o.key);
      const isPicked = result.given.includes(o.key);
      if (isAns) cls += ' correct';
      else if (isPicked) cls += ' wrong';
    } else if (state.selected.includes(o.key)) {
      cls += ' selected';
    }
    return `<div class="${cls}" onclick="selectOption('${o.key}')">
      <span class="option-key">${o.key}</span>
      <span class="option-text">${escapeHtml(o.text)}</span>
    </div>`;
  }).join('');

  const dotsHtml = s.questions.map((_, di) => {
    const r = s.results[di];
    let cls = 'q-dot';
    if (di === i) cls += ' current';
    else if (r) cls += r.correct ? ' answered-correct' : ' answered-wrong';
    return `<button class="${cls}" onclick="gotoQuestion(${di})">${di + 1}</button>`;
  }).join('');

  let banner = '';
  if (result) {
    banner = `<div class="result-banner show ${result.correct ? 'correct' : 'wrong'}">
      <div class="ans-line">${result.correct ? '&#x2705; 回答正确！' : '&#x274C; 回答错误'}　正确答案：${result.correctAnswer.join('、')}　你的答案：${result.given.length ? result.given.join('、') : '未作答'}</div>
      ${result.analysis ? `<div class="analysis">&#x1F4D6; 解析：${escapeHtml(result.analysis)}</div>` : ''}
    </div>`;
  }

  el.innerHTML = `
    <div class="session-topbar">
      <span class="session-mode">${escapeHtml(s.title)}</span>
      <div style="display:flex;gap:12px;align-items:center">
        <span class="session-progress-text">已答 <b>${doneCount}</b>/${total} · 对 <b style="color:var(--success)">${correctCount}</b></span>
        <button class="btn btn-sm btn-secondary" onclick="exitSession()">结束</button>
      </div>
    </div>
    <div class="session-progress-bar"><div class="session-progress-fill" style="width:${(doneCount / total) * 100}%"></div></div>

    <div class="q-card">
      <div class="q-head">
        <div class="q-badges">
          <span class="badge badge-num">第 ${i + 1}/${total} 题</span>
          <span class="badge ${q.type === 'multi' ? 'badge-multi' : 'badge-single'}">${q.type === 'multi' ? '多选题' : '单选题'}</span>
          ${q.in_wrong_book ? '<span class="badge" style="background:var(--danger-light);color:#c44a6a">错题</span>' : ''}
        </div>
        <button class="fav-btn ${q.is_favorite ? 'active' : ''}" title="收藏" onclick="toggleFavorite(${q.id}, ${i})">${q.is_favorite ? '&#x2B50;' : '&#x2606;'}</button>
      </div>
      ${q.image ? `<img class="q-image" src="${escapeHtml(q.image)}" alt="题目配图">` : ''}
      <div class="q-stem">${escapeHtml(q.stem)}</div>
      <div class="options">${optionsHtml}</div>
      ${banner}
      <div class="session-nav">
        <button class="btn btn-secondary" onclick="prevQuestion()" ${i === 0 ? 'disabled' : ''}>&larr; 上一题</button>
        ${result
          ? `<button class="btn btn-primary" onclick="nextQuestion()">${i === total - 1 ? '完成 &rarr;' : '下一题 &rarr;'}</button>`
          : `<button class="btn btn-primary" onclick="submitAnswer()" ${state.selected.length === 0 ? 'disabled' : ''}>提交答案</button>`}
      </div>
    </div>
    <div class="q-dots">${dotsHtml}</div>`;
}

function selectOption(key) {
  const s = state.session;
  if (!s) return;
  const q = s.questions[s.index];
  if (s.results[s.index]) return; // already submitted
  if (q.type === 'multi') {
    const idx = state.selected.indexOf(key);
    if (idx >= 0) state.selected.splice(idx, 1); else state.selected.push(key);
    state.selected.sort();
  } else {
    state.selected = [key];
  }
  renderPractice(document.getElementById('content'));
}

async function submitAnswer() {
  const s = state.session;
  if (!s || state.selected.length === 0) return;
  const q = s.questions[s.index];
  try {
    const res = await api('/api/practice/answer', { method: 'POST', body: JSON.stringify({ question_id: q.id, answer: state.selected }) });
    s.results[s.index] = { correct: res.correct, given: res.your_answer, correctAnswer: res.correct_answer, analysis: res.analysis };
    q.in_wrong_book = !res.correct;
    state.selected = [];
    renderPractice(document.getElementById('content'));
    if (!res.correct) showToast('已加入错题本', 'info');
  } catch (err) { showToast(err.message, 'error'); }
}

function gotoQuestion(idx) {
  const s = state.session;
  if (!s || idx < 0 || idx >= s.questions.length) return;
  s.index = idx; state.selected = [];
  renderPractice(document.getElementById('content'));
}
function nextQuestion() {
  const s = state.session;
  if (!s) return;
  if (s.index >= s.questions.length - 1) return finishSession();
  gotoQuestion(s.index + 1);
}
function prevQuestion() { const s = state.session; if (s && s.index > 0) gotoQuestion(s.index - 1); }

function finishSession() {
  const s = state.session;
  const total = s.questions.length;
  const done = Object.keys(s.results).length;
  const correct = Object.values(s.results).filter(r => r.correct).length;
  const acc = done ? Math.round((correct / done) * 100) : 0;
  showModal('练习完成 &#x1F389;'.replace('&#x1F389;', '🎉'), `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:3rem;margin-bottom:10px">&#x1F389;</div>
      <div style="font-size:1rem;color:var(--text);margin-bottom:16px">本次「${escapeHtml(s.title)}」共 ${total} 题，作答 ${done} 题</div>
      <div style="display:flex;justify-content:center;gap:28px">
        <div><div class="stat-value accent">${correct}</div><div class="stat-label">答对</div></div>
        <div><div class="stat-value danger">${done - correct}</div><div class="stat-label">答错</div></div>
        <div><div class="stat-value">${acc}%</div><div class="stat-label">正确率</div></div>
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal();navigate('banks')">返回题库</button>
     <button class="btn btn-primary" onclick="closeModal();restartSession()">再练一次</button>`);
}
function restartSession() {
  const s = state.session;
  if (!s) return navigate('banks');
  beginSession({ mode: s.mode, title: s.title, bankId: s.bankId, questions: s.questions });
}
function exitSession() {
  const s = state.session;
  const done = s ? Object.keys(s.results).length : 0;
  if (done > 0 && !confirm('结束本次练习？已作答记录会保留。')) return;
  state.session = null;
  if (s && s.bankId) navigate('bank-detail', { id: s.bankId }); else navigate('banks');
}

async function toggleFavorite(qid, idx) {
  try {
    const res = await api('/api/practice/favorites', { method: 'POST', body: JSON.stringify({ question_id: qid }) });
    if (state.session && state.session.questions[idx]) state.session.questions[idx].is_favorite = res.is_favorite;
    showToast(res.is_favorite ? '已收藏' : '已取消收藏', 'info');
    if (state.currentPage === 'practice') renderPractice(document.getElementById('content'));
  } catch (err) { showToast(err.message, 'error'); }
}

// ========== BROWSE / MANAGE QUESTIONS ==========
async function renderBrowse(el, params) {
  const bankId = params.bankId;
  el.innerHTML = `<div class="empty-state"><div class="emoji">&#x23F3;</div><p>加载中...</p></div>`;
  let data;
  try {
    let url = `/api/practice/banks/${bankId}/questions?with_answer=1`;
    if (params.chapterId) url += `&chapter_id=${params.chapterId}`;
    if (params.unfiled) url += `&unfiled=1`;
    data = await api(url);
  } catch (err) { el.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`; return; }

  state.browseQuestions = data.questions;
  state.browseParams = params;
  const items = data.questions.map(q => {
    const optsText = q.options.map(o => `${o.key}. ${escapeHtml(o.text)}`).join('　');
    return `<div class="review-item">
      <div class="ri-head">
        <div class="q-badges">
          <span class="badge ${q.type === 'multi' ? 'badge-multi' : 'badge-single'}">${q.type === 'multi' ? '多选' : '单选'}</span>
          ${q.is_favorite ? '<span class="badge" style="background:var(--gold-light);color:#b8862a">已收藏</span>' : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-secondary" onclick="openEditQuestion(${q.id})">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${q.id},${bankId})">删除</button>
        </div>
      </div>
      <div class="ri-stem">${escapeHtml(q.stem)}</div>
      <div class="ri-opts">${optsText}</div>
      <div class="ri-answer">答案：<span class="correct">${(q.answer || []).join('、')}</span>${q.analysis ? '　解析：' + escapeHtml(q.analysis) : ''}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="back-link" onclick="navigate('bank-detail',{id:${bankId}})">&larr; 返回题库</div>
    <div class="pq-header">
      <div><h2>&#x1F5C2; 题目管理</h2><div class="sub">共 ${data.count} 题</div></div>
      <div class="header-actions"><button class="btn btn-primary" onclick="openAddQuestion(${bankId}, ${params.chapterId || 'null'})">+ 手动添加题目</button></div>
    </div>
    ${data.count ? items : `<div class="empty-state"><div class="emoji">&#x1F4DD;</div><p>暂无题目</p></div>`}`;
}

function openAddQuestion(bankId, chapterId) {
  showModal('添加题目', questionFormHtml({}), `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitAddQuestion(${bankId}, ${chapterId || 'null'})">保存</button>`, true);
}
function openEditQuestion(id) {
  const q = (state.browseQuestions || []).find(x => x.id === id);
  if (!q) return showToast('题目未找到', 'error');
  showModal('编辑题目', questionFormHtml(q), `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitEditQuestion(${q.id}, ${q.bank_id})">保存</button>`, true);
}
function questionFormHtml(q) {
  const opts = q.options && q.options.length ? q.options : [{key:'A',text:''},{key:'B',text:''},{key:'C',text:''},{key:'D',text:''}];
  const optInputs = ['A','B','C','D','E','F'].map((k, idx) => {
    const found = opts.find(o => o.key === k);
    return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <span style="width:22px;font-weight:700;color:var(--text-muted)">${k}</span>
      <input id="opt-${k}" value="${escapeHtml(found ? found.text : '')}" placeholder="选项 ${k}（留空则忽略）">
    </div>`;
  }).join('');
  return `
    <div class="form-group"><label>题型</label>
      <select id="q-type"><option value="single" ${q.type !== 'multi' ? 'selected' : ''}>单选</option><option value="multi" ${q.type === 'multi' ? 'selected' : ''}>多选</option></select>
    </div>
    <div class="form-group"><label>题干</label><textarea id="q-stem" style="min-height:70px">${escapeHtml(q.stem || '')}</textarea></div>
    <div class="form-group"><label>选项</label>${optInputs}</div>
    <div class="form-group"><label>正确答案</label><input id="q-answer" value="${escapeHtml((q.answer || []).join(''))}" placeholder="单选填一个字母如 A；多选填多个如 ABC"></div>
    <div class="form-group"><label>解析（可选）</label><textarea id="q-analysis" style="min-height:60px">${escapeHtml(q.analysis || '')}</textarea></div>`;
}
function collectQuestionForm() {
  const stem = document.getElementById('q-stem').value.trim();
  const type = document.getElementById('q-type').value;
  const answer = document.getElementById('q-answer').value.trim();
  const analysis = document.getElementById('q-analysis').value.trim();
  const options = {};
  ['A','B','C','D','E','F'].forEach(k => {
    const v = document.getElementById('opt-' + k).value.trim();
    if (v) options[k] = v;
  });
  return { stem, type, answer, analysis, options };
}
async function submitAddQuestion(bankId, chapterId) {
  const body = collectQuestionForm();
  if (!body.stem) return showToast('请输入题干', 'error');
  try {
    await api('/api/practice/questions', { method: 'POST', body: JSON.stringify({ ...body, bank_id: bankId, chapter_id: chapterId }) });
    closeModal(); showToast('题目已添加'); navigate('browse', { bankId, chapterId: chapterId || undefined });
  } catch (err) { showToast(err.message, 'error'); }
}
async function submitEditQuestion(qid, bankId) {
  const body = collectQuestionForm();
  if (!body.stem) return showToast('请输入题干', 'error');
  try {
    await api(`/api/practice/questions/${qid}`, { method: 'PUT', body: JSON.stringify(body) });
    closeModal(); showToast('已保存'); navigate('browse', { bankId });
  } catch (err) { showToast(err.message, 'error'); }
}
async function deleteQuestion(qid, bankId) {
  if (!confirm('确定删除这道题吗？')) return;
  try { await api(`/api/practice/questions/${qid}`, { method: 'DELETE' }); showToast('已删除'); navigate('browse', { bankId }); }
  catch (err) { showToast(err.message, 'error'); }
}

// ========== WRONG BOOK ==========
async function renderWrongBook(el) {
  el.innerHTML = `<div class="empty-state"><div class="emoji">&#x23F3;</div><p>加载中...</p></div>`;
  let data;
  try { data = await api('/api/practice/wrong-book'); }
  catch (err) { el.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`; return; }

  const items = data.questions.map(q => {
    const optsText = q.options.map(o => `${o.key}. ${escapeHtml(o.text)}`).join('　');
    return `<div class="review-item">
      <div class="ri-head">
        <div class="q-badges">
          <span class="badge ${q.type === 'multi' ? 'badge-multi' : 'badge-single'}">${q.type === 'multi' ? '多选' : '单选'}</span>
          <span class="ri-tag">错 ${q.wrong_count} 次</span>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-secondary" onclick="removeFromWrongBook(${q.id})">移出错题本</button>
        </div>
      </div>
      <div class="ri-stem">${escapeHtml(q.stem)}</div>
      <div class="ri-opts">${optsText}</div>
      <div class="ri-answer">正确答案：<span class="correct">${(q.answer || []).join('、')}</span>${q.analysis ? '　解析：' + escapeHtml(q.analysis) : ''}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="pq-header">
      <div><h2>&#x274C; 错题本</h2><div class="sub">共 ${data.count} 道错题，答对后自动移出</div></div>
      <div class="header-actions">${data.count ? `<button class="btn btn-primary" onclick="startAllWrong()">&#x25B6; 错题重做</button>` : ''}</div>
    </div>
    ${data.count ? items : `<div class="empty-state"><div class="emoji">&#x1F389;</div><p>错题本是空的，继续保持！</p></div>`}`;
}
async function removeFromWrongBook(qid) {
  try { await api(`/api/practice/wrong-book/${qid}`, { method: 'DELETE' }); showToast('已移出错题本'); renderWrongBook(document.getElementById('content')); }
  catch (err) { showToast(err.message, 'error'); }
}

// ========== FAVORITES ==========
async function renderFavorites(el) {
  el.innerHTML = `<div class="empty-state"><div class="emoji">&#x23F3;</div><p>加载中...</p></div>`;
  let data;
  try { data = await api('/api/practice/favorites'); }
  catch (err) { el.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`; return; }

  const items = data.questions.map(q => {
    const optsText = q.options.map(o => `${o.key}. ${escapeHtml(o.text)}`).join('　');
    return `<div class="review-item">
      <div class="ri-head">
        <div class="q-badges"><span class="badge ${q.type === 'multi' ? 'badge-multi' : 'badge-single'}">${q.type === 'multi' ? '多选' : '单选'}</span></div>
        <button class="btn btn-sm btn-secondary" onclick="unfavorite(${q.id})">取消收藏</button>
      </div>
      <div class="ri-stem">${escapeHtml(q.stem)}</div>
      <div class="ri-opts">${optsText}</div>
      <div class="ri-answer">正确答案：<span class="correct">${(q.answer || []).join('、')}</span></div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="pq-header">
      <div><h2>&#x2B50; 收藏题目</h2><div class="sub">共 ${data.count} 道收藏</div></div>
      <div class="header-actions">${data.count ? `<button class="btn btn-primary" onclick="startAllFav()">&#x25B6; 收藏练习</button>` : ''}</div>
    </div>
    ${data.count ? items : `<div class="empty-state"><div class="emoji">&#x2B50;</div><p>还没有收藏题目。练习时点右上角星标即可收藏。</p></div>`}`;
}
async function unfavorite(qid) {
  try { await api(`/api/practice/favorites/${qid}`, { method: 'DELETE' }); showToast('已取消收藏'); renderFavorites(document.getElementById('content')); }
  catch (err) { showToast(err.message, 'error'); }
}

// ========== STATS ==========
async function renderStats(el) {
  el.innerHTML = `<div class="empty-state"><div class="emoji">&#x23F3;</div><p>加载中...</p></div>`;
  let s;
  try { s = await api('/api/practice/stats'); }
  catch (err) { el.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`; return; }
  el.innerHTML = `
    <div class="pq-header"><div><h2>&#x1F4CA; 学习统计</h2><div class="sub">全部题库汇总</div></div></div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${s.total_questions}</div><div class="stat-label">题目总数</div></div>
      <div class="stat-card"><div class="stat-value accent">${s.answered_distinct}</div><div class="stat-label">已练题目</div></div>
      <div class="stat-card"><div class="stat-value">${s.coverage}%</div><div class="stat-label">覆盖率</div></div>
      <div class="stat-card"><div class="stat-value accent">${s.accuracy}%</div><div class="stat-label">正确率</div></div>
      <div class="stat-card"><div class="stat-value danger">${s.wrong_count}</div><div class="stat-label">错题数</div></div>
      <div class="stat-card"><div class="stat-value gold">${s.favorite_count}</div><div class="stat-label">收藏数</div></div>
    </div>
    <div class="stat-card">
      <div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:10px">总答题次数 ${s.answered_total}，其中答对 ${s.correct_total}</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${s.coverage}%"></div></div>
    </div>`;
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await api('/api/auth/me');
    state.token = data.token; state.user = data.user;
    setUserBadge(data.user);
    navigate('banks');
  } catch (err) {
    navigate('login');
  }
});
