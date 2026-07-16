const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { getDb } = require('../db');
const { generateFileId } = require('../utils/id');
const { getImageMeta, makeThumbnail } = require('../utils/image');
const qiniuStorage = require('./qiniuStorage');

const IMAGE_MIME_RE = /^image\/(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/i;

function isImage(mime) {
  return IMAGE_MIME_RE.test(mime || '');
}

function rootDirFor(scope) {
  if (scope === 'chat') return path.resolve(config.upload.chatDir);
  if (scope === 'share') return path.resolve(config.upload.shareDir);
  if (scope === 'sticker') return path.resolve(config.upload.chatDir);
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

function storageProviderFor(scope) {
  if (scope !== 'share') return 'local';
  const driver = String(config.storage.shareDriver || 'local').toLowerCase();
  if (driver !== 'local' && driver !== 'qiniu') {
    const e = new Error(`unsupported shared-file storage driver: ${driver}`);
    e.status = 500;
    e.code = 'invalid_storage_driver';
    throw e;
  }
  return driver;
}

function isQiniuFile(file) {
  return file && file.storage_provider === 'qiniu';
}

function shareObjectKey(bucket, fileId, ext) {
  return `share/${bucket}/${fileId}${ext}`;
}

function insertFileRecord({
  fileId, ownerUserId, originalName, size, mime, location, storageProvider,
  scope, width, height, hasThumbnail, now
}) {
  getDb().prepare(
    `INSERT INTO files (file_id, owner_user_id, filename, size, mime, path, storage_provider, scope, width, height, has_thumbnail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    fileId, ownerUserId, originalName, size, mime, location, storageProvider,
    scope, width, height, hasThumbnail, now
  );
}

function savedFileData({ fileId, originalName, size, mime, width, height, hasThumbnail, scope, now }) {
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

async function removeTemporaryFile(filePath) {
  if (!filePath) return;
  try { await fs.promises.unlink(filePath); } catch {}
}

async function saveQiniuShareUpload({ ownerUserId, originalName, mime, tmpPath, size, fileId, bucket, ext }) {
  const objectKey = shareObjectKey(bucket, fileId, ext);
  const thumbnailKey = objectKey + '.thumb.jpg';
  const temporaryThumbnailPath = thumbPath(tmpPath);
  let width = null;
  let height = null;
  let hasThumbnail = 0;
  let originalUploaded = false;
  let thumbnailUploaded = false;

  try {
    if (isImage(mime)) {
      try {
        const meta = await getImageMeta(tmpPath);
        width = meta.width || null;
        height = meta.height || null;
        await makeThumbnail(tmpPath, temporaryThumbnailPath);
        hasThumbnail = 1;
      } catch (e) {
        console.error('[fileService] thumbnail failed', e.message);
      }
    }

    await qiniuStorage.uploadFile({ key: objectKey, filePath: tmpPath, mime });
    originalUploaded = true;

    if (hasThumbnail) {
      try {
        await qiniuStorage.uploadFile({
          key: thumbnailKey,
          filePath: temporaryThumbnailPath,
          mime: 'image/jpeg'
        });
        thumbnailUploaded = true;
      } catch (e) {
        // A usable original file is retained even when thumbnail generation fails.
        hasThumbnail = 0;
        console.error('[fileService] Qiniu thumbnail upload failed', e.message);
        try { await qiniuStorage.deleteFile(thumbnailKey); } catch {}
      }
    }

    const now = Date.now();
    insertFileRecord({
      fileId,
      ownerUserId,
      originalName,
      size,
      mime,
      location: objectKey,
      storageProvider: 'qiniu',
      scope: 'share',
      width,
      height,
      hasThumbnail,
      now
    });
    return savedFileData({ fileId, originalName, size, mime, width, height, hasThumbnail, scope: 'share', now });
  } catch (e) {
    if (thumbnailUploaded) {
      try { await qiniuStorage.deleteFile(thumbnailKey); } catch {}
    }
    if (originalUploaded) {
      try { await qiniuStorage.deleteFile(objectKey); } catch {}
    }
    throw e;
  } finally {
    await Promise.all([removeTemporaryFile(tmpPath), removeTemporaryFile(temporaryThumbnailPath)]);
  }
}

async function saveUpload({ ownerUserId, scope, originalName, mime, tmpPath, size }) {
  if (!['chat', 'share', 'sticker'].includes(scope)) {
    const e = new Error('invalid scope');
    e.status = 400;
    e.code = 'invalid_scope';
    throw e;
  }

  const fileId = generateFileId();
  const bucket = monthBucket();
  const ext = extFromName(originalName);
  const storageProvider = storageProviderFor(scope);

  if (storageProvider === 'qiniu') {
    return saveQiniuShareUpload({
      ownerUserId, originalName, mime, tmpPath, size, fileId, bucket, ext
    });
  }

  const dir = path.join(rootDirFor(scope), bucket);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const absDest = path.join(dir, fileId + ext);

  try {
    await fs.promises.rename(tmpPath, absDest);
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      await fs.promises.copyFile(tmpPath, absDest);
      await removeTemporaryFile(tmpPath);
    } else {
      throw e;
    }
  }

  let width = null;
  let height = null;
  let hasThumbnail = 0;
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

  const relPath = path.relative(path.resolve('.'), absDest).replace(/\\/g, '/');
  const now = Date.now();
  insertFileRecord({
    fileId,
    ownerUserId,
    originalName,
    size,
    mime,
    location: relPath,
    storageProvider: 'local',
    scope,
    width,
    height,
    hasThumbnail,
    now
  });
  return savedFileData({ fileId, originalName, size, mime, width, height, hasThumbnail, scope, now });
}

function findByFileId(fileId) {
  return getDb().prepare('SELECT * FROM files WHERE file_id = ?').get(fileId);
}

function canAccess(file, userId) {
  if (!file) return false;
  if (file.scope === 'share' || file.scope === 'sticker') return true;
  if (file.scope === 'chat') {
    if (file.owner_user_id === userId) return true;
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

function getQiniuDownloadUrl(file, { attachment = false } = {}) {
  if (!isQiniuFile(file)) return null;
  return qiniuStorage.getPrivateDownloadUrl({
    key: attachment ? file.path : file.path + '.thumb.jpg',
    filename: attachment ? file.filename : null
  });
}

async function deleteShareFile({ fileId, requesterUserId, isAdmin }) {
  const db = getDb();
  const file = db.prepare('SELECT * FROM files WHERE file_id = ? AND scope = ?').get(fileId, 'share');
  if (!file) {
    const e = new Error('not found');
    e.status = 404;
    e.code = 'not_found';
    throw e;
  }
  if (!isAdmin && file.owner_user_id !== requesterUserId) {
    const e = new Error('not allowed');
    e.status = 403;
    e.code = 'forbidden';
    throw e;
  }

  if (isQiniuFile(file)) {
    await qiniuStorage.deleteFile(file.path);
    if (file.has_thumbnail) await qiniuStorage.deleteFile(file.path + '.thumb.jpg');
  } else {
    try { fs.unlinkSync(absPath(file.path)); } catch {}
    try { fs.unlinkSync(thumbPath(absPath(file.path))); } catch {}
  }
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  return true;
}

module.exports = {
  saveUpload,
  findByFileId,
  canAccess,
  listShare,
  deleteShareFile,
  isQiniuFile,
  getQiniuDownloadUrl,
  absPath,
  thumbPath,
  isImage
};
