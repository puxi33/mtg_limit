const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 3001;
const SERVER_SCRIPT = path.join(__dirname, 'server.js');
const RESTART_DELAY = 2000; // ms to wait before restart
const MAX_RESTARTS = 20;

let serverProcess = null;
let restartCount = 0;
let isShuttingDown = false;

// Kill any process on port 3001
function killPortProcess() {
  try {
    if (process.platform === 'win32') {
      const ps = `Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`;
      try {
        execSync(`powershell.exe -Command "${ps}"`, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
        console.log(`[launcher] Killed processes on port ${PORT}`);
      } catch {}
    }
  } catch {}
}

// Health check: verify the server is responding
function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/`, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

// Start the server
function startServer() {
  if (isShuttingDown) return;

  restartCount++;
  if (restartCount > MAX_RESTARTS) {
    console.error(`[launcher] Max restarts (${MAX_RESTARTS}) exceeded. Giving up.`);
    process.exit(1);
  }

  console.log(`[launcher] Starting server (attempt ${restartCount})...`);

  const nodeExe = process.env.NODE_EXE || process.execPath;
  serverProcess = spawn(nodeExe, [SERVER_SCRIPT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT) }
  });

  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[server] ${msg}`);
  });

  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[server] ${msg}`);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`[launcher] Server exited with code ${code}, signal ${signal}`);
    if (!isShuttingDown) {
      console.log(`[launcher] Restarting in ${RESTART_DELAY / 1000}s...`);
      setTimeout(startServer, RESTART_DELAY);
    }
  });

  serverProcess.on('error', (err) => {
    console.error(`[launcher] Failed to start server:`, err.message);
    if (!isShuttingDown) {
      setTimeout(startServer, RESTART_DELAY);
    }
  });

  // Reset restart count after 30 seconds of stable operation
  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) {
      restartCount = 0;
    }
  }, 30000);
}

// Graceful shutdown
function shutdown() {
  isShuttingDown = true;
  console.log('\n[launcher] Shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Main
console.log(`[launcher] MTG Limited Site Launcher`);
console.log(`[launcher] Port: ${PORT}`);
console.log(`[launcher] Auto-restart: enabled`);
console.log(`[launcher] Max restarts: ${MAX_RESTARTS}`);
console.log('');

// Kill any existing process on the port
killPortProcess();

// Wait for port to be fully released, then start
setTimeout(startServer, 5000);

// Periodic health check every 60 seconds
setInterval(async () => {
  if (serverProcess && !serverProcess.killed && !isShuttingDown) {
    const healthy = await healthCheck();
    if (!healthy) {
      console.log('[launcher] Health check failed, restarting...');
      serverProcess.kill('SIGTERM');
    }
  }
}, 60000);
