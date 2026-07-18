// ========== STATE ==========
const state = {
  token: null,
  user: null,
  currentPage: 'projects',
  pageData: {}
};

// ========== UTILITY ==========
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    <div style="max-width:400px;margin:60px auto">
      <h2 style="text-align:center;margin-bottom:24px">登录</h2>
      <form onsubmit="handleAuth(event)">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="auth-username" required>
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="auth-password" required>
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
    showToast(`欢迎, ${data.user.username}!`);
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

// ========== PROJECTS LIST ==========
async function renderProjects(el) {
  el.innerHTML = '<div style="text-align:center;padding:40px">加载中...</div>';
  try {
    const projects = await api('/api/projects');
    el.innerHTML = `
      <div class="project-header">
        <h2>我的项目</h2>
        <button class="btn btn-primary" onclick="showCreateProjectModal()">新建项目</button>
      </div>
      <div class="project-grid">
        ${projects.map(project => {
          const percent = project.total_steps > 0 ? Math.round((project.completed_steps / project.total_steps) * 100) : 0;
          const statusText = project.total_steps === 0 ? '未开始' : (percent === 100 ? '已完成' : '进行中');
          const statusClass = project.total_steps === 0 ? 'waiting' : (percent === 100 ? 'completed' : 'progress');
          return `
          <div class="project-card" onclick="navigate('project-detail', {id:${project.id}})">
            <div class="project-card-header">
              <h3>${escapeHtml(project.name)}</h3>
              <span class="badge badge-${statusClass}">${statusText}</span>
            </div>
            ${project.remark ? `<p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:12px">${escapeHtml(project.remark)}</p>` : ''}
            <div class="progress-bar">
              <div class="progress-fill ${percent === 100 ? 'complete' : ''}" style="width:${percent}%"></div>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">
              ${project.completed_steps}/${project.total_steps} 步骤已完成 (${percent}%)
            </div>
            ${project.steps && project.steps.length > 0 ? `
              <div class="step-preview">
                ${project.steps.slice(0, 3).map(step => `
                  <div class="step-item">
                    <span class="step-icon ${step.completed ? 'completed' : 'pending'}">${step.completed ? '✓' : '○'}</span>
                    <span style="color:var(--text-muted)">${escapeHtml(step.name)}</span>
                  </div>
                `).join('')}
                ${project.steps.length > 3 ? `<div style="font-size:0.75rem;color:var(--text-muted)">...还有 ${project.steps.length - 3} 个步骤</div>` : ''}
              </div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
              <span style="font-size:0.75rem;color:var(--text-muted)">${new Date(project.created_at).toLocaleDateString()}</span>
              <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteProject(${project.id})" style="padding:4px 12px;font-size:0.75rem">删除</button>
            </div>
          </div>`;
        }).join('') || '<div style="text-align:center;padding:60px;color:var(--text-muted)"><h3>暂无项目</h3><p>点击"新建项目"开始</p></div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div style="text-align:center;padding:60px"><h3>加载失败</h3><p style="color:var(--text-muted)">${err.message}</p></div>`;
  }
}

function showCreateProjectModal() {
  showModal('新建项目', `
    <form onsubmit="handleCreateProject(event)">
      <div class="form-group"><label>项目名称</label><input type="text" id="project-name" required placeholder="输入项目名称"></div>
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
    await api('/api/projects', { method: 'POST', body: JSON.stringify({ name, remark }) });
    closeModal();
    showToast('项目创建成功');
    navigate('projects');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProject(id) {
  if (!confirm('确定要删除这个项目吗？')) return;
  try {
    await api(`/api/projects/${id}`, { method: 'DELETE' });
    showToast('项目已删除');
    navigate('projects');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========== PROJECT DETAIL ==========
async function renderProjectDetail(el, projectId) {
  el.innerHTML = '<div style="text-align:center;padding:40px">加载中...</div>';
  try {
    const project = await api(`/api/projects/${projectId}`);
    const percent = project.total_steps > 0 ? Math.round((project.completed_steps / project.total_steps) * 100) : 0;
    
    el.innerHTML = `
      <div class="project-header">
        <div>
          <button class="btn btn-secondary btn-sm" onclick="navigate('projects')" style="margin-bottom:8px">← 返回列表</button>
          <h2 style="margin:8px 0">${escapeHtml(project.name)}</h2>
          ${project.remark ? `<p style="color:var(--text-muted);margin:0">${escapeHtml(project.remark)}</p>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary" onclick="showEditProjectModal(${project.id}, '${escapeHtml(project.name)}', '${escapeHtml(project.remark || '')}')">编辑项目</button>
          <button class="btn btn-primary" onclick="showAddStepModal(${project.id})">添加步骤</button>
        </div>
      </div>
      
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:0.9rem;color:var(--text-muted)">完成进度</div>
            <div style="font-size:2rem;font-weight:600;color:var(--text-bright)">${percent}%</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:0.9rem;color:var(--text-muted)">步骤统计</div>
            <div style="font-size:1.5rem;font-weight:600;color:var(--text-bright)">${project.completed_steps}/${project.total_steps}</div>
          </div>
        </div>
        <div class="progress-bar" style="height:12px">
          <div class="progress-fill ${percent === 100 ? 'complete' : ''}" style="width:${percent}%"></div>
        </div>
      </div>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
          <h3 style="margin:0;color:var(--text-bright)">步骤详情</h3>
        </div>
        <div style="padding:20px">
          ${project.steps.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-muted)"><p>暂无步骤，点击"添加步骤"开始</p></div>' : `
            <div class="timeline">
              ${project.steps.map((step, index) => `
                <div class="timeline-item">
                  <div class="timeline-marker ${step.completed ? 'completed' : 'pending'}">
                    ${step.completed ? '✓' : index + 1}
                  </div>
                  <div class="timeline-line"></div>
                  <div class="timeline-content">
                    <div class="timeline-header">
                      <div style="flex:1">
                        <h4 class="timeline-title">${escapeHtml(step.name)}</h4>
                        <span class="badge badge-${step.completed ? 'completed' : 'progress'}" style="font-size:0.75rem">
                          ${step.completed ? '已完成' : '执行中'}
                        </span>
                      </div>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="complete-btn ${step.completed ? 'mark-incomplete' : 'mark-complete'}" onclick="toggleStepComplete(${project.id}, ${step.id}, ${!step.completed})">
                          ${step.completed ? '标记未完成' : '✓ 标记完成'}
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="showEditStepModal(${project.id}, ${step.id}, '${escapeHtml(step.name)}', '${escapeHtml(step.remark || '')}')" style="padding:6px 12px">编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteStep(${project.id}, ${step.id})" style="padding:6px 12px">删除</button>
                      </div>
                    </div>
                    ${step.remark ? `<p style="color:var(--text-muted);font-size:0.9rem;margin:12px 0">${escapeHtml(step.remark)}</p>` : ''}
                    
                    ${step.attachments && step.attachments.length > 0 ? `
                      <div class="attachment-list">
                        <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px">附件 (${step.attachments.length})</div>
                        ${step.attachments.map(att => `
                          <div class="attachment-item">
                            <span class="attachment-name">${escapeHtml(att.original_name)}</span>
                            <span class="attachment-size">${(att.size / 1024).toFixed(1)} KB</span>
                            <a href="/api/projects/${project.id}/steps/attachments/${att.id}/download" class="btn btn-sm btn-secondary" style="padding:4px 10px;font-size:0.75rem">下载</a>
                            <button class="btn btn-sm btn-danger" onclick="deleteAttachment(${project.id}, ${step.id}, ${att.id})" style="padding:4px 10px;font-size:0.75rem">删除</button>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                    
                    <div style="margin-top:16px">
                      <input type="file" id="file-input-${step.id}" multiple style="display:none" onchange="handleFileUpload(${project.id}, ${step.id}, this)">
                      <button class="btn btn-sm btn-secondary" onclick="document.getElementById('file-input-${step.id}').click()" style="padding:8px 16px">
                        上传附件
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div style="text-align:center;padding:60px"><h3>加载失败</h3><p style="color:var(--text-muted)">${err.message}</p></div>`;
  }
}

function showEditProjectModal(id, name, remark) {
  showModal('编辑项目', `
    <form onsubmit="handleEditProject(event, ${id})">
      <div class="form-group"><label>项目名称</label><input type="text" id="project-name" value="${name}" required></div>
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
    await api(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name, remark }) });
    closeModal();
    showToast('项目已更新');
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
      <button type="submit" class="btn btn-primary btn-block">添加</button>
    </form>
  `);
}

async function handleAddStep(e, projectId) {
  e.preventDefault();
  const name = document.getElementById('step-name').value.trim();
  const remark = document.getElementById('step-remark').value.trim();
  try {
    await api(`/api/projects/${projectId}/steps`, { method: 'POST', body: JSON.stringify({ name, remark }) });
    closeModal();
    showToast('步骤已添加');
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
    await api(`/api/projects/${projectId}/steps/${stepId}`, { method: 'PUT', body: JSON.stringify({ name, remark }) });
    closeModal();
    showToast('步骤已更新');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleStepComplete(projectId, stepId, completed) {
  try {
    await api(`/api/projects/${projectId}/steps/${stepId}`, { method: 'PUT', body: JSON.stringify({ completed }) });
    showToast(completed ? '已标记为完成' : '已标记为未完成');
    renderProjectDetail(document.getElementById('content'), projectId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteStep(projectId, stepId) {
  if (!confirm('确定要删除这个步骤吗？')) return;
  try {
    await api(`/api/projects/${projectId}/steps/${stepId}`, { method: 'DELETE' });
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
    const res = await fetch(`/api/projects/${projectId}/steps/${stepId}/attachments`, {
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
    await api(`/api/projects/${projectId}/steps/${stepId}/attachments/${attachmentId}`, { method: 'DELETE' });
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
    navigate('projects');
  } catch (err) {
    navigate('login');
  }
});
