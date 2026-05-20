const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');

let db = null;

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

function initDb() {
  const dbPath = path.resolve(config.db.path);
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  runMigrations();
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      login_key TEXT UNIQUE NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      client_msg_id TEXT,
      created_at INTEGER NOT NULL,
      recalled INTEGER NOT NULL DEFAULT 0,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_messages_pair_time
      ON messages(from_user_id, to_user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_to_time
      ON messages(to_user_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_msg_id
      ON messages(client_msg_id) WHERE client_msg_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a_id TEXT NOT NULL,
      user_b_id TEXT NOT NULL,
      last_message_id INTEGER,
      last_message_at INTEGER NOT NULL,
      UNIQUE(user_a_id, user_b_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_hidden (
      user_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      hidden_at INTEGER NOT NULL,
      UNIQUE(user_id, peer_id)
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT UNIQUE NOT NULL,
      owner_user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime TEXT NOT NULL,
      path TEXT NOT NULL,
      scope TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      has_thumbnail INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_files_scope_time
      ON files(scope, created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      token_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_label TEXT,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS system_configs (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
}

// 增量迁移：字段/索引不存在时才执行
function runMigrations() {
  const cols = db.pragma('table_info(users)').map((c) => c.name);
  if (!cols.includes('bark_key')) {
    db.exec('ALTER TABLE users ADD COLUMN bark_key TEXT');
  }
}

module.exports = { initDb, getDb };
