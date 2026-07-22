// ============================================================
// router.js — Routing and navigation
// ============================================================

var Routes = {
  '/':                  { page: 'dashboard' },
  '/dashboard':         { page: 'dashboard' },
  '/login':             { page: 'login' },
  '/cubes':             { page: 'cubes' },
  '/cubes/:id':         { page: 'cube-detail', id: ':id' },
  '/events':            { page: 'events' },
  '/events/:id':        { page: 'event-detail', id: ':id' },
  '/events/:id/build':  { page: 'deck-builder', eventId: ':id' },
  '/decks':             { page: 'decks' },
  '/decks/:id/build':   { page: 'deck-builder', deckId: ':id' },
  '/decks/:id/detail':  { page: 'deck-detail', id: ':id' },
  '/battles':           { page: 'battles' },
  '/battles/:id':       { page: 'battle-detail', id: ':id' },
  '/profile':           { page: 'profile' }
};

function pathToRoute(path) {
  var clean = (path || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  var target = clean === '' ? '/' : clean;
  for (var pattern in Routes) {
    var paramNames = (pattern.match(/:[^/]+/g) || []).map(function(s) { return s.slice(1); });
    var regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '([^/]+)') + '$');
    var m = target.match(regex);
    if (m) {
      var tmpl = Routes[pattern];
      var params = {};
      for (var k in tmpl) {
        var v = tmpl[k];
        if (typeof v === 'string' && v.startsWith(':')) {
          var ph = v.slice(1);
          var idx = paramNames.indexOf(ph);
          if (idx >= 0) params[k] = decodeURIComponent(m[idx + 1] || '');
        } else {
          params[k] = v;
        }
      }
      var page = params.page;
      delete params.page;
      return { page: page, params: params };
    }
  }
  return null;
}

function routeToPath(page, params) {
  params = params || {};
  switch (page) {
    case 'dashboard': return '/dashboard';
    case 'login':     return '/login';
    case 'cubes':     return '/cubes';
    case 'cube-detail':
      return '/cubes/' + encodeURIComponent(params.id || '');
    case 'events':    return '/events';
    case 'event-detail':
      return '/events/' + encodeURIComponent(params.id || '');
    case 'deck-builder':
      if (params.eventId) return '/events/' + encodeURIComponent(params.eventId) + '/build';
      if (params.deckId) return '/decks/' + encodeURIComponent(params.deckId) + '/build';
      return '/decks';
    case 'deck-detail':
      return '/decks/' + encodeURIComponent(params.id || '') + '/detail';
    case 'decks':     return '/decks';
    case 'battles':   return '/battles';
    case 'battle-detail':
      return '/battles/' + encodeURIComponent(params.id || '');
    case 'profile':   return '/profile';
    default:          return '/dashboard';
  }
}

function consumeIntendedRoute() {
  try {
    var s = sessionStorage.getItem('mtg_intended_route');
    if (!s) return null;
    sessionStorage.removeItem('mtg_intended_route');
    return JSON.parse(s);
  } catch (e) { return null; }
}

function saveIntendedRoute(page, params) {
  try {
    sessionStorage.setItem('mtg_intended_route', JSON.stringify({ page: page, params: params }));
  } catch (e) {}
}

function navigate(page, params, opts) {
  params = params || {};
  opts = opts || {};
  state.currentPage = page;
  state.pageData = params;
  closeNavMenu();
  document.body.classList.remove('draft-fullscreen');

  if (!opts.skipUrl) {
    var path = routeToPath(page, params);
    var cur = window.location.pathname;
    if (cur !== path) {
      if (opts.replace) {
        window.history.replaceState({ page: page, params: params }, '', path);
      } else {
        window.history.pushState({ page: page, params: params }, '', path);
      }
    }
  }

  document.querySelectorAll('.nav-links a').forEach(function(a) {
    a.classList.toggle('active', a.getAttribute('data-page') === page);
  });

  var content = document.getElementById('content');
  var navbar = document.getElementById('navbar');

  if (page === 'login') {
    navbar.classList.add('hidden');
    renderLogin(content);
  } else {
    navbar.classList.remove('hidden');
    switch (page) {
      case 'dashboard': renderDashboard(content); break;
      case 'cubes': renderCubes(content); break;
      case 'cube-detail': renderCubeDetail(content, params.id); break;
      case 'events': renderEvents(content); break;
      case 'event-detail': renderEventDetail(content, params.id); break;
      case 'decks': renderDecks(content); break;
      case 'deck-builder': renderDeckBuilder(content, params); break;
      case 'deck-detail': renderDeckDetail(content, params.id); break;
      case 'battles': renderBattles(content); break;
      case 'battle-detail': renderBattleDetail(content, params.id); break;
      case 'profile': renderProfile(content); break;
      default: renderDashboard(content);
    }
  }
}

window.addEventListener('popstate', function(e) {
  var route = pathToRoute(window.location.pathname);
  if (route) {
    navigate(route.page, route.params, { skipUrl: true });
  } else {
    navigate('dashboard', {}, { skipUrl: true, replace: true });
  }
});
