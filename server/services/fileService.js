const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { getDb } = require('../db');
const { generateFileId } = require('../utils/id');
const { getImageMeta, makeThumbnail } = require('../utils/image');

const IMAGE_MIME_RE = /^image\/(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/i;

function isImage(mime) {
  return IMAGE_MIME_RE.test(mime || '');
}

function rootDirFor(scope) {
  if (scope === 'chat') return path.resolve(config.upload.chatDir);
  if (scope === 'share') return path.resolve(config.upload.shareDir);
  throw new Error('invalid scope');
}

function monthBucket(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function extFromName(filename) {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(filename || '');
  return m ? m[0].toLowerCase() : '';
}

function absPath(relPath) {
  return path.resolve(relPath);
}

function thumbPath(absoluteOriginalPath) {
  return absoluteOriginalPath + '.thumb.jpg';
}

async function saveUpload({ ownerUserId, scope, originalName, mime, tmpPath, size }) {
  if (!['chat', 'share'].includes(scope)) {
    const e = new Error('invalid scope'); e.status = 400; e.code = 'invalid_scope'; throw e;
  }
  const fileId = generateFileId();
  const bucket = monthBucket();
  const dir = path.join(rootDirFor(scope), bucket);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = extFromName(originalName);
  const diskName = fileId + ext;
  const absDest = path.join(dir, diskName);

  // 从临时位置移到目标位置（跨盘符场景 rename 会 EXDEV，回落到 copy + unlink）
  try {
    await fs.promises.rename(tmpPath, absDest);
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      await fs.promises.copyFile(tmpPath, absDest);
      try { await fs.promises.unlink(tmpPath); } catch {}
    } else {
      throw e;
    }
  }

  let width = null, height = null, hasThumbnail = 0;
  if (isImage(mime)) {
    try {
      const meta = await getImageMeta(absDest);
      width = meta.width || null;
      height = meta.height || null;
      await makeThumbnail(absDest, thumbPath(absDest));
      hasThumbnail = 1;
    } catch (e) {
      console.error('[fileService] thumbnail failed', e.message);
    }
  }

  // 保存为相对项目根的路径
  const relPath = path.relative(path.resolve('.'), absDest).replace(/\\/g, '/');
  const now = Date.now();
  getDb().prepare(
    `INSERT INTO files (file_id, owner_user_id, filename, size, mime, path, scope, width, height, has_thumbnail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(fileId, ownerUserId, originalName, size, mime, relPath, scope, width, height, hasThumbnail, now);

  return {
    fileId,
    filename: originalName,
    size,
    mime,
    width,
    height,
    hasThumbnail: !!hasThumbnail,
    scope,
    createdAt: now
  };
}

function findByFileId(fileId) {
  return getDb().prepare('SELECT * FROM files WHERE file_id = ?').get(fileId);
}

// 当前用户能否访问该文件
function canAccess(file, userId) {
  if (!file) return false;
  if (file.scope === 'share') return true; // 所有登录用户
  if (file.scope === 'chat') {
    if (file.owner_user_id === userId) return true;
    // 是否作为某条消息的发送方/接收方涉及该 file_id
    const row = getDb().prepare(
      `SELECT 1 FROM messages
       WHERE (type = 'image' OR type = 'file')
         AND (from_user_id = ? OR to_user_id = ?)
         AND content LIKE ?
       LIMIT 1`
    ).get(userId, userId, `%"${file.file_id}"%`);
    return !!row;
  }
  return false;
}

function listShare({ before, limit, q }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const beforeId = parseInt(before, 10);
  const params = [];
  let where = `scope = 'share'`;
  if (beforeId) { where += ' AND id < ?'; params.push(beforeId); }
  if (q && typeof q === 'string' && q.trim()) {
    where += ' AND filename LIKE ?';
    params.push('%' + q.trim() + '%');
  }
  const sql =
    `SELECT f.id, f.file_id, f.owner_user_id, f.filename, f.size, f.mime, f.width, f.height,
            f.has_thumbnail, f.created_at, u.name AS owner_name
     FROM files f
     LEFT JOIN users u ON u.user_id = f.owner_user_id
     WHERE ${where}
     ORDER BY f.id DESC LIMIT ?`;
  params.push(lim);
  return getDb().prepare(sql).all(...params).map((r) => ({
    id: r.id,
    fileId: r.file_id,
    owner: { userId: r.owner_user_id, name: r.owner_name || null },
    filename: r.filename,
    size: r.size,
    mime: r.mime,
    width: r.width,
    height: r.height,
    hasThumbnail: !!r.has_thumbnail,
    createdAt: r.created_at
  }));
}

function deleteShareFile({ fileId, requesterUserId, isAdmin }) {
  const db = getDb();
  const file = db.prepare('SELECT * FROM files WHERE file_id = ? AND scope = ?').get(fileId, 'share');
  if (!file) { const e = new Error('not found'); e.status = 404; e.code = 'not_found'; throw e; }
  if (!isAdmin && file.owner_user_id !== requesterUserId) {
    const e = new Error('not allowed'); e.status = 403; e.code = 'forbidden'; throw e;
  }
  try { fs.unlinkSync(absPath(file.path)); } catch {}
  try { fs.unlinkSync(thumbPath(absPath(file.path))); } catch {}
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  return true;
}

module.exports = {
  saveUpload,
  findByFileId,
  canAccess,
  listShare,
  deleteShareFile,
  absPath,
  thumbPath,
  isImage
};
