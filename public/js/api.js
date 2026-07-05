// ============================================================
// API helper + WebSocket client
// ============================================================
const API = {
  token: null,
  setToken(t) { this.token = t; if (t) localStorage.setItem('mtg_token', t); else localStorage.removeItem('mtg_token'); },
  loadToken() { return localStorage.getItem('mtg_token'); },

  async request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (res.status === 401 && this.token) {
      this.setToken(null);
      App.state.user = null;
      App.navigate('login');
      throw new Error('认证已过期，请重新登录');
    }
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  },

  // Convenience methods
  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }); },
  put(path, body) { return this.request(path, { method: 'PUT', body: JSON.stringify(body) }); },
  delete(path) { return this.request(path, { method: 'DELETE' }); }
};

// ============================================================
// WebSocket Client
// ============================================================
const WS = {
  socket: null,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  subscriptions: new Set(),
  listeners: new Map(),  // eventName -> [callback]
  status: 'disconnected',  // 'connecting' | 'connected' | 'disconnected'

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const token = API.token || API.loadToken();
    if (!token) return;
    this.setStatus('connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`;
    try {
      this.socket = new WebSocket(url);
    } catch (e) {
      console.error('WS create failed:', e);
      this.scheduleReconnect();
      return;
    }
    this.socket.onopen = () => {
      this.reconnectDelay = 1000;
      this.setStatus('connected');
      // Re-subscribe to all targets
      for (const target of this.subscriptions) {
        this.send({ type: 'subscribe', target });
      }
    };
    this.socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.handleMessage(msg);
      } catch (e) {
        console.warn('WS parse error:', e);
      }
    };
    this.socket.onclose = () => {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };
    this.socket.onerror = (e) => {
      console.warn('WS error:', e);
    };
  },

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('disconnected');
  },

  scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (API.token) this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
  },

  send(msg) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  },

  subscribe(target) {
    this.subscriptions.add(target);
    this.send({ type: 'subscribe', target });
  },

  unsubscribe(target) {
    this.subscriptions.delete(target);
    this.send({ type: 'unsubscribe', target });
  },

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, []);
    this.listeners.get(eventName).push(callback);
  },

  off(eventName, callback) {
    const arr = this.listeners.get(eventName);
    if (!arr) return;
    const idx = arr.indexOf(callback);
    if (idx >= 0) arr.splice(idx, 1);
  },

  handleMessage(msg) {
    if (msg.type === 'event') {
      // Route to listeners based on event name
      const handlers = this.listeners.get(msg.event) || [];
      for (const h of handlers) {
        try { h(msg.data); } catch (e) { console.error('WS handler error:', e); }
      }
    }
  },

  setStatus(s) {
    this.status = s;
    const el = document.getElementById('ws-status');
    if (el) {
      el.className = `ws-status ${s}`;
      el.title = `WebSocket: ${s === 'connected' ? '已连接' : s === 'connecting' ? '连接中' : '已断开'}`;
    }
  }
};