/**
 * 系统配置服务
 *
 * 所有配置存在 system_configs(key, value) 表中。
 * 进程内维护一份内存缓存，管理员写入时立即失效，下次读取时重新从 DB 加载。
 *
 * 当前支持的配置项：
 *   bark_icon      - Bark 推送时显示的图标 URL（可选）
 *   bark_click_url - Bark 推送被点击后跳转的链接（可选）
 */

const { getDb } = require('../db');

// 所有合法配置 key（白名单）
const CONFIG_KEYS = ['bark_icon', 'bark_click_url'];

// 内存缓存，null 表示尚未加载或已失效
let _cache = null;

/** 从数据库加载全量配置到内存缓存 */
function _load() {
  const rows = getDb().prepare('SELECT key, value FROM system_configs').all();
  _cache = {};
  for (const r of rows) _cache[r.key] = r.value ?? null;
}

/** 读取全部配置（优先走缓存） */
function getAll() {
  if (!_cache) _load();
  return { ..._cache };
}

/** 读取单个配置，不存在时返回 null */
function get(key) {
  if (!_cache) _load();
  return _cache[key] ?? null;
}

/**
 * 批量写入配置
 * @param {Record<string, string|null>} pairs - key: value，value 传 null/'' 表示清空
 */
function setMany(pairs) {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO system_configs (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(pairs)) {
      if (!CONFIG_KEYS.includes(key)) continue; // 只允许白名单
      stmt.run(key, value && String(value).trim() ? String(value).trim() : null, now);
    }
  });
  tx();
  _cache = null; // 失效缓存，下次读取重新加载
}

/** 使缓存立即失效（供外部主动触发，通常不需要） */
function invalidate() {
  _cache = null;
}

module.exports = { CONFIG_KEYS, get, getAll, setMany, invalidate };
