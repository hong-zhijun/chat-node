const path = require('path');
const fs   = require('fs');
const http = require('http');
const express = require('express');

const config = require('../config');
const { initDb } = require('./db');
const { attachWebSocketServer } = require('./ws');

const authRoutes         = require('./routes/auth');
const userRoutes         = require('./routes/users');
const conversationRoutes = require('./routes/conversations');
const messageRoutes      = require('./routes/messages');
const fileRoutes         = require('./routes/files');
const shareRoutes        = require('./routes/share');
const adminRoutes        = require('./routes/admin');
const fillerRoutes       = require('./routes/fillers');

function ensureDirs() {
  const dirs = [
    path.dirname(path.resolve(config.db.path)),
    path.resolve(config.upload.chatDir),
    path.resolve(config.upload.shareDir)
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ── API routes ────────────────────────────────────────────────────────
  app.use('/api/auth',          authRoutes);
  app.use('/api/admin',         adminRoutes);
  app.use('/api/users',         userRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/messages',      messageRoutes);
  app.use('/api/files',         fileRoutes);
  app.use('/api/share',         shareRoutes);
  app.use('/api/fillers',       fillerRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, data: { uptime: process.uptime() } });
  });

  // ── SPA static + fallback ─────────────────────────────────────────────
  const distDir  = path.resolve(__dirname, '..', 'client', 'chat', 'dist');
  const indexHtml = path.join(distDir, 'index.html');

  if (fs.existsSync(distDir)) {
    // Serve built assets
    app.use(express.static(distDir));
    // SPA fallback: all non-API GET requests → index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) return next();
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        next();
      }
    });
  } else {
    app.get('/', (req, res) => {
      res.send('<p>Frontend not built yet. Run <code>npm run build</code> in <code>client/chat/</code>.</p>');
    });
  }

  // ── Error handler ─────────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error('[http error]', err);
    res.status(err.status || 500).json({
      ok: false,
      error: { code: err.code || 'internal', message: err.message || 'Internal Error' }
    });
  });

  return app;
}

function start() {
  ensureDirs();
  initDb();

  const app    = createApp();
  const server = http.createServer(app);

  attachWebSocketServer(server);

  server.listen(config.port, () => {
    console.log(`[chat-node] listening on http://localhost:${config.port}`);
    if (config.adminKey.startsWith('CHANGE_ME') || config.jwtSecret.startsWith('CHANGE_ME')) {
      console.warn('[chat-node] WARNING: 请在 config.js 中修改 adminKey 和 jwtSecret');
    }
  });
}

if (require.main === module) {
  start();
}

module.exports = { createApp, start };
