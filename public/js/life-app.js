// ========== STATE ==========
const state = {
  token: null,
  user: null,
  currentPage: 'projects',
  pageData: {},
  projectFilter: 'incomplete',
  allProjects: []
};

// ========== UTILITY ==========
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isImageFile(att) {
  if (att.mime_type && att.mime_type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|svg|bmp|ico)$/i.test(att.original_name || '');
}

function showImagePreview(url, title) {
  showModal(title || '图片预览', `
    <div style="text-align:center">
      <img src="${url}" style="max-width:100%;max-height:75vh;object-fit:contain;border-radius:8px" alt="${escapeHtml(title || '')}">
    </div>
  `);
}

// ========== API HELPER ==========
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  let data;
  try { data = await res.json(); } catch { data = {}; }
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
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
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

// ========== ROUTING ==========
function navigate(page, params = {}) {
  state.currentPage = page;
  state.pageData = params;
  const content = document.getElementById('content');
  if (page === 'projects') {
    renderProjects(content);
  } else if (page === 'project-detail') {
    renderProjectDetail(content, params.id);
  } else if (page === 'login') {
    renderLogin(content);
  }
}

// ========== AUTH ==========
function renderLogin(el) {
  el.innerHTML = `
    <div style="max-width:380px;margin:60px auto;background:white;padding:32px;border-radius:20px;box-shadow:0 4px 24px rgba(255,133,162,0.12)">
      <div style="text-align:center;margin-bottom:20px;font-size:2.5rem">&#x1F338;</div>
      <h2 style="text-align:center;margin-bottom:20px;color:var(--text-bright);font-weight:700">登录生活待办</h2>
      <form onsubmit="handleAuth(event)">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="auth-username" required placeholder="输入用户名">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="auth-password" required placeholder="输入密码">
        </div>
        <button type="submit" class="btn btn-primary btn-block">登录</button>
      </form>
    </div>
  `;
}

async function handleAuth(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    state.token = data.token;
    state.user = data.user;
    document.getElementById('nav-username').textContent = data.user.username;
    const avatar = document.getElementById('nav-avatar');
    if (avatar) avatar.textContent = data.user.username.charAt(0).toUpperCase();
    showToast(`欢迎回来, ${data.user.username}!`);
    navigate('projects');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function logout() {
  state.token = null;
  state.user = null;
  navigate('login');
}

// ========== TREE HELPERS ==========
function buildStepTree(steps) {
  const map = {};
  steps.forEach(s => { map[s.id] = { ...s, children: [] }; });
  const roots = [];
  steps.forEach(s => {
    if (s.parent_id && map[s.parent_id]) {
      map[s.parent_id].children.push(map[s.id]);
    } else {
      roots.push(map[s.id]);
    }
  });
  return roots;
}

function countLeaves(nodes) {
  let total = 0, done = 0;
  for (const n of nodes) {
    if (n.children.length === 0) {
      total++;
      if (n.completed) done++;
    } else {
      const sub = countLeaves(n.children);
      total += sub.total;
      done += sub.done;
    }
  }
  return { total, done };
}

function getNodeStatus(node) {
  if (node.children.length === 0) {
    return node.completed ? 'completed' : 'pending';
  }
  const { total, done } = countLeaves(node.children);
  if (done === 0) return 'pending';
  if (done === total) return 'completed';
  return 'partial';
}

// ========== DETAIL TREE ==========
function renderStepTreeNode(node, projectId, depth) {
  const hasChildren = node.children.length > 0;
  const isLeaf = !hasChildren;
  const status = getNodeStatus(node);

  const checkClass = status === 'completed' ? 'done' : (status === 'partial' ? 'partial' : '');
  const checkContent = status === 'completed' ? '&#10003;' : (status === 'partial' ? '&#9679;' : '');

  const toggleBtn = hasChildren
    ? `<button class="icon-btn" onclick="event.stopPropagation();toggleStepCollapse(${node.id})" title="展开/折叠"><span id="step-arrow-${node.id}">&#9660;</span></button>`
    : `<span style="width:28px;display:inline-block"></span>`;

  const actionBtns = `
    <div class="step-tree-actions">
      ${isLeaf ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();toggleStepComplete(${projectId},${node.id},${!node.completed})" style="padding:3px 8px;font-size:0.7rem">${node.completed ? '撤销完成' : '完成'}</button>` : ''}
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();showAddSubStepModal(${projectId},${node.id})" style="padding:3px 8px;font-size:0.7rem">+子项</button>
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();showEditStepModal(${projectId},${node.id},'${escapeHtml(node.name)}','${escapeHtml(node.remark || '')}')" style="padding:3px 8px;font-size:0.7rem">编辑</button>
      <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteStep(${projectId},${node.id})" style="padding:3px 8px;font-size:0.7rem">删除</button>
    </div>
  `;

  const attachmentsHtml = (node.attachments && node.attachments.length > 0) ? `
    <div class="attachment-section">
      <div class="attachment-list">
        ${node.attachments.map(att => {
          const isImg = isImageFile(att);
          const viewUrl = `/api/life/projects/${projectId}/steps/attachments/${att.id}/view`;
          const dlUrl = `/api/life/projects/${projectId}/steps/attachments/${att.id}/download`;
          if (isImg) {
            return `
              <div class="attachment-item attachment-image">
                <img class="attachment-thumb" src="${viewUrl}" alt="${escapeHtml(att.original_name)}" onclick="event.stopPropagation();showImagePreview('${viewUrl}','${escapeHtml(att.original_name)}')" loading="lazy">
                <div class="attachment-info">
                  <span class="attachment-name">${escapeHtml(att.original_name)}</span>
                  <span style="font-size:0.7rem;color:var(--text-muted)">${(att.size / 1024).toFixed(1)} KB</span>
                  <div class="attachment-actions">
                    <a href="${dlUrl}">下载</a>
                    <button onclick="event.stopPropagation();deleteAttachment(${projectId},${node.id},${att.id})">删除</button>
                  </div>
                </div>
              </div>`;
          }
          return `
            <div class="attachment-item">
              <div class="attachment-info">
                <span class="attachment-name">${escapeHtml(att.original_name)}</span>
                <span style="font-size:0.7rem;color:var(--text-muted)">${(att.size / 1024).toFixed(1)} KB</span>
                <div class="attachment-actions">
                  <a href="${dlUrl}">下载</a>
                  <button onclick="event.stopPropagation();deleteAttachment(${projectId},${node.id},${att.id})">删除</button>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  ` : '';

  const uploadHtml = `
    <div style="margin-top:6px">
      <input type="file" id="file-input-${node.id}" multiple style="display:none" onchange="handleFileUpload(${projectId},${node.id},this)">
      <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();document.getElementById('file-input-${node.id}').click()" style="padding:2px 8px;font-size:0.7rem">&#x1F4CE; 附件</button>
    </div>
  `;

  const childrenHtml = hasChildren ? `
    <div class="step-tree-children" id="step-children-${node.id}">
      ${node.children.map(child => renderStepTreeNode(child, projectId, depth + 1)).join('')}
    </div>
  ` : '';

  return `
    <div class="step-tree-node">
      <div class="step-tree-row">
        <button class="complete-btn ${checkClass}" onclick="event.stopPropagation();${isLeaf ? `toggleStepComplete(${projectId},${node.id},${!node.completed})` : `toggleStepCollapse(${node.id})`}">${checkContent}</button>
        <div class="step-tree-content">
          <div class="step-tree-name ${node.completed && isLeaf ? 'completed' : ''}">${escapeHtml(node.name)}</div>
          ${node.remark ? `<div class="step-tree-remark">${escapeHtml(node.remark)}</div>` : ''}
          ${attachmentsHtml}
          ${uploadHtml}
        </div>
        ${actionBtns}
      </div>
      ${childrenHtml}
    </div>
  `;
}

function toggleStepCollapse(stepId) {
  const el = document.getElementById('step-children-' + stepId);
  const arrow = document.getElementById('step-arrow-' + stepId);
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    arrow.innerHTML = '&#9660;';
  } else {
    el.style.display = 'none';
    arrow.innerHTML = '&#9654;';
  }
}

// ========== TREE MODAL ==========
function renderModalTreeNode(node, depth) {
  const hasChildren = node.children.length > 0;
  const status = getNodeStatus(node);
  const icon = status === 'completed' ? '&#x2714;' : (status === 'partial' ? '&#x25D0;' : '&#x25CB;');
  const isLeaf = !hasChildren;

  const toggleBtn = hasChildren
    ? `<button class="icon-btn" onclick="event.stopPropagation();toggleStepCollapse(${node.id})"><span id="step-arrow-${node.id}">&#9660;</span></button>`
    : `<span style="width:28px;display:inline-block"></span>`;

  const childrenHtml = hasChildren ? `
    <div class="step-tree-children" id="step-children-${node.id}">
      ${node.children.map(child => renderModalTreeNode(child, depth + 1)).join('')}
    </div>
  ` : '';

  return `
    <div class="step-tree-node">
      <div class="step-tree-row">
        <span class="step-icon ${status}" style="font-size:1rem;flex-shrink:0">${icon}</span>
        <div class="step-tree-content">
          <span class="step-tree-name ${status === 'completed' && isLeaf ? 'completed' : ''}">${escapeHtml(node.name)}</span>
          ${node.remark ? `<div class="step-tree-remark">${escapeHtml(node.remark)}</div>` : ''}
        </div>
      </div>
      ${childrenHtml}
    </div>
  `;
}

async function showProjectTreeModal(projectId, projectName) {
  const body = `<div style="text-align:center;padding:40px">加载中...</div>`;
  showModal(`${projectName} — 待办树`, body);
  try {
    const project = await api(`/api/life/projects/${projectId}`);
    const tree = buildStepTree(project.steps || []);
    const percent = project.total_steps > 0 ? Math.round((project.completed_steps / project.total_steps) * 100) : 0;

    const treeHtml = tree.length > 0
      ? tree.map(node => renderModalTreeNode(node, 0)).join('')
      : '<div style="text-align:center;padding:40px;color:var(--text-muted)">暂无步骤</div>';

    document.getElementById('modal-body').innerHTML = `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:0.85rem;color:var(--text-muted)">总进度</span>
          <span style="font-size:1.1rem;font-weight:600;color:var(--primary)">${percent}% (${project.completed_steps}/${project.total_steps})</span>
        </div>
        <div class="progress-bar" style="height:10px">
          <div class="progress-fill ${percent === 100 ? 'complete' : ''}" style="width:${percent}%"></div>
        </div>
      </div>
      <div style="max-height:60vh;overflow-y:auto">
        ${treeHtml}
      </div>
    `;
  } catch (err) {
    document.getElementById('modal-body').innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">加载失败: ${err.message}</div>`;
  }
}

// ========== PROJECTS LIST ==========
async function renderProjects(el) {
  el.innerHTML = '<div style="text-align:center;padding:40px">加载中...</div>';
  try {
    const projects = await api('/api/life/projects');
    state.allProjects = projects;
    renderProjectList(el);
  } catch (err) {
    el.innerHTML = `<div style="text-align:center;padding:60px"><h3>加载失败</h3><p style="color:var(--text-muted)">${err.message}</p></div>`;
  }
}

function getFilteredProjects() {
  return state.allProjects.filter(p => {
    if (state.projectFilter === 'all') return true;
    const percent = p.total_steps > 0 ? Math.round((p.completed_steps / p.total_steps) * 100) : 0;
    if (state.projectFilter === 'completed') return p.total_steps > 0 && percent === 100;
    if (state.projectFilter === 'incomplete') return p.total_steps === 0 || percent < 100;
    return true;
  });
}

function setFilter(filter) {
  state.projectFilter = filter;
  renderProjectList(document.getElementById('content'));
}

function renderProjectList(el) {
  const filtered = getFilteredProjects();
  el.innerHTML = `
    <div class="life-header">
      <h2>&#x1F338; 我的待办</h2>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div class="filter-bar">
          <button class="filter-btn ${state.projectFilter === 'all' ? 'active' : ''}" onclick="setFilter('all')">全部</button>
          <button class="filter-btn ${state.projectFilter === 'incomplete' ? 'active' : ''}" onclick="setFilter('incomplete')">未完成</button>
          <button class="filter-btn ${state.projectFilter === 'completed' ? 'active' : ''}" onclick="setFilter('completed')">已完成</button>
        </div>
        <button class="btn btn-primary" onclick="showCreateProjectModal()">&#x2795; 新建待办</button>
      </div>
    </div>
    <div class="project-grid" id="project-grid">
      ${filtered.map(project => {
        const percent = project.total_steps > 0 ? Math.round((project.completed_steps / project.total_steps) * 100) : 0;
        const statusText = project.total_steps === 0 ? '未开始' : (percent === 100 ? '已完成' : '进行中');
        const statusClass = project.total_steps === 0 ? 'waiting' : (percent === 100 ? 'completed' : 'progress');
        const tree = buildStepTree(project.steps || []);
        return `
        <div class="project-card" draggable="true" data-project-id="${project.id}"
          onclick="navigate('project-detail', {id:${project.id}})"
          ondragstart="onDragStart(event)" ondragend="onDragEnd(event)"
          ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event)">
          <div class="project-card-header">
            <h3>${escapeHtml(project.name)}</h3>
            <span class="badge badge-${statusClass}">${statusText}</span>
          </div>
          ${project.remark ? `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px">${escapeHtml(project.remark)}</p>` : ''}
          <div class="progress-bar">
            <div class="progress-fill ${percent === 100 ? 'complete' : ''}" style="width:${percent}%"></div>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">
            ${project.completed_steps}/${project.total_steps} 项已完成 (${percent}%)
          </div>
          ${tree.length > 0 ? `
            <div class="step-preview">
              ${tree.slice(0, 3).map(step => {
                const status = getNodeStatus(step);
                const icon = status === 'completed' ? '&#x2714;' : (status === 'partial' ? '&#x25D0;' : '&#x25CB;');
                const leafInfo = step.children.length > 0
                  ? (() => { const l = countLeaves(step.children); return `<span style="font-size:0.7rem;color:var(--text-muted)">(${l.done}/${l.total})</span>`; })()
                  : '';
                return `
                <div class="step-item">
                  <span class="step-icon ${status}">${icon}</span>
                  <span style="color:var(--text-muted)">${escapeHtml(step.name)}</span>
                  ${leafInfo}
                </div>`;
              }).join('')}
              ${tree.length > 3 ? `<div style="font-size:0.75rem;color:var(--text-muted)">...还有 ${tree.length - 3} 个顶层项</div>` : ''}
            </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light)">
            <span style="font-size:0.75rem;color:var(--text-muted)">${new Date(project.created_at).toLocaleDateString()}</span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();showProjectTreeModal(${project.id},'${escapeHtml(project.name)}')" style="padding:4px 12px;font-size:0.75rem">待办树</button>
              <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteProject(${project.id})" style="padding:4px 12px;font-size:0.75rem">删除</button>
            </div>
          </div>
        </div>`;
      }).join('') || '<div style="text-align:center;padding:60px;color:var(--text-muted)"><h3>&#x1F33C; 暂无待办</h3><p>点击"新建待办"开始规划你的生活吧</p></div>'}
    </div>
  `;
}

// ========== DRAG AND DROP ==========
let dragSrcId = null;

function onDragStart(e) {
  const card = e.target.closest('.project-card');
  if (!card) return;
  dragSrcId = card.dataset.projectId;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}

function onDragEnd(e) {
  const card = e.target.closest('.project-card');
  if (card) card.classList.remove('dragging');
  document.querySelectorAll('.project-card').forEach(c => c.classList.remove('drag-over'));
  dragSrcId = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.target.closest('.project-card');
  if (card && card.dataset.projectId !== dragSrcId) {
    card.classList.add('drag-over');
  }
}

function onDragLeave(e) {
  const card = e.target.closest('.project-card');
  if (card) card.classList.remove('drag-over');
}

async function onDrop(e) {
  e.preventDefault();
  const targetCard = e.target.closest('.project-card');
  if (!targetCard || !dragSrcId) return;
  targetCard.classList.remove('drag-over');

  const targetId = targetCard.dataset.projectId;
  if (targetId === dragSrcId) return;

  const srcIdx = state.allProjects.findIndex(p => String(p.id) === String(dragSrcId));
  const tgtIdx = state.allProjects.findIndex(p => String(p.id) === String(targetId));
  if (srcIdx === -1 || tgtIdx === -1) return;

  const [moved] = state.allProjects.splice(srcIdx, 1);
  state.allProjects.splice(tgtIdx, 0, moved);

  const orderedIds = state.allProjects.map(p => p.id);
  renderProjectList(document.getElementById('content'));

  try {
    await api('/api/life/projects/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds })
    });
  } catch (err) {
    showToast('排序保存失败: ' + err.message, 'error');
  }
}

function showCreateProjectModal() {
  showModal('新建待办', `
    <form onsubmit="handleCreateProject(event)">
      <div class="form-group"><label>待办名称</label><input type="text" id="project-name" required placeholder="例如: 周末大扫除"></div>
      <div class="form-group"><label>备注</label><textarea id="project-remark" rows="3" placeholder="可选备注信息"></textarea></div>
      <button type="submit" class="btn btn-primary btn-block">创建</button>
    </form>
  `);
}

async function handleCreateProject(e) {
  e.preventDefault();
  const name = document.getElementById('project-name').value.trim();
  const remark = document.getElementById('project-remark').value.trim();
  try {
    await api('/api/life/projects', { method: 'POST', body: JSON.stringify({ name, remark }) });
    closeModal();
    showToast('待办创建成功');
    navigate('projects');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProject(id) {
  if (!confirm('确定要删除这个待办吗？')) return;
  try {
    await api(`/api/life/projects/${id}`, { method: 'DELETE' });
    showToast('待办已删除');
    navigate('projects');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========== PROJECT DETAIL ==========
async function renderProjectDetail(el, projectId) {
  el.innerHTML = '<div style="text-align:center;padding:40px">加载中...</div>';
  try {
    const project = await api(`/api/life/projects/${projectId}`);
    const percent = project.total_steps > 0 ? Math.round((project.completed_steps / project.total_steps) * 100) : 0;
    const tree = buildStepTree(project.steps || []);

    el.innerHTML = `
      <div class="detail-header">
        <div>
          <button class="btn btn-secondary btn-sm" onclick="navigate('projects')" style="margin-bottom:8px">&larr; 返回列表</button>
          <h2 style="margin:8px 0">&#x1F338; ${escapeHtml(project.name)}</h2>
          ${project.remark ? `<p style="color:var(--text-muted);margin:0">${escapeHtml(project.remark)}</p>` : ''}
        </div>
        <div class="detail-actions">
          <button class="btn btn-secondary" onclick="showEditProjectModal(${project.id}, '${escapeHtml(project.name)}', '${escapeHtml(project.remark || '')}')">编辑</button>
          <button class="btn btn-mint" onclick="showAddStepModal(${project.id})">&#x2795; 添加步骤</button>
        </div>
      </div>

      <div class="detail-progress-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px">完成进度</div>
            <div class="detail-progress-value">${percent}%</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px">完成/总计</div>
            <div class="detail-progress-count" style="font-size:1.2rem;font-weight:600;color:var(--text-bright)">${project.completed_steps} / ${project.total_steps}</div>
          </div>
        </div>
        <div class="progress-bar" style="height:10px">
          <div class="progress-fill ${percent === 100 ? 'complete' : ''}" style="width:${percent}%"></div>
        </div>
      </div>

      <div class="step-tree">
        <div class="step-tree-header">
          <h3>&#x1F4CB; 步骤清单</h3>
          <span style="font-size:0.8rem;color:var(--text-muted)">${project.steps.length} 个步骤</span>
        </div>
        ${tree.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-muted)"><p>&#x1F33C; 暂无步骤，点击"添加步骤"开始</p></div>' : `
          ${tree.map(node => renderStepTreeNode(node, project.id, 0)).join('')}
        `}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div style="text-align:center;padding:60px"><h3>加载失败</h3><p style="color:var(--text-muted)">${err.message}</p></div>`;
  }
}

function showEditProjectModal(id, name, remark) {
  showModal('编辑待办', `
    <form onsubmit="handleEditProject(event, ${id})">
      <div class="form-group"><label>待办名称</label><input type="text" id="project-name" value="${name}" required></div>
      <div class="form-group"><label>备注</label><textarea id="project-remark" rows="3">${remark}</textarea></div>
      <button type="submit" class="btn btn-primary btn-block">保存</button>
    </form>
  `);
}

async function handleEditProject(e, id) {
  e.preventDefault();
  const name = document.getElementById('project-name').value.trim();
  const remark = document.getElementById('project-remark').value.trim();
  try {
    await api(`/api/life/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name, remark }) });
    closeModal();
    showToast('待办已更新');
    renderProjectDetail(document.getElementById('content'), id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showAddStepModal(projectId) {
  showModal('添加步骤', `
    <form onsubmit="handleAddStep(event, ${projectId})">
      <div class="form-group"><label>步骤名称</label><input type="text" id="step-name" required placeholder="输入步骤名称"></div>
      <div class="form-group"><label>备注</label><textarea id="step-remark" rows="3" placeholder="可选备注信息"></textarea></div>
      <button type="submit" class="btn btn-mint btn-block">添加</button>
    </form>
  `);
}

function showAddSubStepModal(projectId, parentStepId) {
  showModal('添加子步骤', `
    <form onsubmit="handleAddStepWithParent(event, ${projectId}, ${parentStepId})">
      <div class="form-group"><label>步骤名称</label><input type="text" id="step-name" required placeholder="输入子步骤名称"></div>
      <div class="form-group"><label>备注</label><textarea id="step-remark" rows="3" placeholder="可选备注信息"></textarea></div>
      <button type="submit" class="btn btn-mint btn-block">添加</button>
    </form>
  `);
}

async function handleAddStep(e, projectId) {
  e.preventDefault();
  const name = document.getElementById('step-name').value.trim();
  const remark = document.getElementById('step-remark').value.trim();
  try {
    await api(`/api/life/projects/${projectId}/steps`, { method: 'POST', body: JSON.stringify({ name, remark, parent_id: null }) });
    closeModal();
    showToast('步骤已添加');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAddStepWithParent(e, projectId, parentId) {
  e.preventDefault();
  const name = document.getElementById('step-name').value.trim();
  const remark = document.getElementById('step-remark').value.trim();
  try {
    await api(`/api/life/projects/${projectId}/steps`, { method: 'POST', body: JSON.stringify({ name, remark, parent_id: parentId }) });
    closeModal();
    showToast('子步骤已添加');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showEditStepModal(projectId, stepId, name, remark) {
  showModal('编辑步骤', `
    <form onsubmit="handleEditStep(event, ${projectId}, ${stepId})">
      <div class="form-group"><label>步骤名称</label><input type="text" id="step-name" value="${name}" required></div>
      <div class="form-group"><label>备注</label><textarea id="step-remark" rows="3">${remark}</textarea></div>
      <button type="submit" class="btn btn-primary btn-block">保存</button>
    </form>
  `);
}

async function handleEditStep(e, projectId, stepId) {
  e.preventDefault();
  const name = document.getElementById('step-name').value.trim();
  const remark = document.getElementById('step-remark').value.trim();
  try {
    await api(`/api/life/projects/${projectId}/steps/${stepId}`, { method: 'PUT', body: JSON.stringify({ name, remark }) });
    closeModal();
    showToast('步骤已更新');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleStepComplete(projectId, stepId, completed) {
  try {
    await api(`/api/life/projects/${projectId}/steps/${stepId}`, { method: 'PUT', body: JSON.stringify({ completed }) });
    showToast(completed ? '已完成!' : '已撤销完成');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteStep(projectId, stepId) {
  if (!confirm('确定要删除这个步骤及其所有子步骤吗？')) return;
  try {
    await api(`/api/life/projects/${projectId}/steps/${stepId}`, { method: 'DELETE' });
    showToast('步骤已删除');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleFileUpload(projectId, stepId, input) {
  const files = input.files;
  if (!files || files.length === 0) return;
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  try {
    const res = await fetch(`/api/life/projects/${projectId}/steps/${stepId}/attachments`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData
    });
    if (!res.ok) throw new Error('上传失败');
    showToast('附件上传成功');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    input.value = '';
  }
}

async function deleteAttachment(projectId, stepId, attachmentId) {
  if (!confirm('确定要删除这个附件吗？')) return;
  try {
    await api(`/api/life/projects/${projectId}/steps/${stepId}/attachments/${attachmentId}`, { method: 'DELETE' });
    showToast('附件已删除');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await api('/api/auth/me');
    state.token = data.token;
    state.user = data.user;
    document.getElementById('nav-username').textContent = data.user.username;
    const avatar = document.getElementById('nav-avatar');
    if (avatar) avatar.textContent = data.user.username.charAt(0).toUpperCase();
    navigate('projects');
  } catch (err) {
    navigate('login');
  }
});
