// ============================================================
// init.js — App initialization
// ============================================================

// renderProfile placeholder (not yet implemented)
function renderProfile(el) {
  el.innerHTML = '<div class="empty-state"><h3>个人资料</h3><p>功能开发中...</p><button class="btn btn-secondary" onclick="navigate(\'dashboard\')">返回首页</button></div>';
}

document.addEventListener('DOMContentLoaded', async function() {
  // Battle-only mode: skip main app initialization
  if (document.getElementById('battle-root')) {
    return; // battle.html handles its own init via initBattle()
  }

  // Set up navigation click handlers
  document.querySelectorAll('.nav-links a').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var page = link.getAttribute('data-page');
      if (page) navigate(page);
    });
  });

  // Set up logout button
  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      logout();
    });
  }

  // Parse URL to determine initial page (keep current page on refresh)
  var initialRoute = pathToRoute(window.location.pathname);

  // Check cookie-based authentication via GET /api/auth/me
  try {
    var data = await api('/api/auth/me');
    state.token = data.token;
    state.user = data.user;
    if (typeof API !== 'undefined' && API.setToken) API.setToken(data.token);
    if (typeof WS !== 'undefined' && WS.connect) WS.connect();
    var navEl = document.getElementById('nav-username');
    if (navEl) navEl.textContent = data.user.username;
    if (initialRoute) {
      navigate(initialRoute.page, initialRoute.params, { replace: true });
    } else {
      navigate('dashboard', {}, { replace: true });
    }
  } catch (err) {
    // Not logged in - save intended page for after login
    if (initialRoute && initialRoute.page !== 'login') {
      saveIntendedRoute(initialRoute.page, initialRoute.params);
    }
    navigate('login', {}, { replace: true });
  }
});
