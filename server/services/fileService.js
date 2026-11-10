const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
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

// ── Browser-to-Kodo direct upload of shared files ──────────────────────────
//
// 1. init:     the server picks the object key and signs an upload token pinned to
//              that key, plus a ticket (JWT) that records who is uploading what.
// 2. browser:  uploads the bytes straight to Kodo (form upload or multipart v2).
// 3. complete: the server verifies the ticket, checks the object on Kodo, and only
//              then inserts the files row.
//
// No bytes pass through this server, so Nginx/multer body limits do not apply.

const DIRECT_UPLOAD_TICKET_TYPE = 'share_direct_upload';
// Kodo keeps an unfinished multipart uploadId for 7 days.
const DIRECT_UPLOAD_TICKET_TTL_SECONDS = 7 * 24 * 3600;
// Kodo image processing (imageView2) only handles reasonably sized images.
const QINIU_FOP_THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024;
// has_thumbnail values: 0 none, 1 stored "<key>.thumb.jpg", 2 Kodo imageView2.
const THUMBNAIL_STORED = 1;
const THUMBNAIL_QINIU_FOP = 2;

function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function directUploadMaxBytes() {
  const n = Number(config.qiniu.directUploadMaxBytes);
  return Number.isFinite(n) && n > 0 ? n : 10 * 1024 * 1024 * 1024;
}

function isDirectUploadEnabled() {
  return storageProviderFor('share') === 'qiniu';
}

function normalizeDeclaredName(name) {
  const s = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (s || 'file').slice(0, 255);
}

function normalizeDeclaredMime(mime) {
  const s = String(mime || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(s) && s.length <= 127
    ? s
    : 'application/octet-stream';
}

function signDirectUploadTicket(payload) {
  return jwt.sign({ ...payload, type: DIRECT_UPLOAD_TICKET_TYPE }, config.jwtSecret, {
    expiresIn: DIRECT_UPLOAD_TICKET_TTL_SECONDS
  });
}

function verifyDirectUploadTicket(ticket, userId) {
  let payload;
  try {
    payload = jwt.verify(String(ticket || ''), config.jwtSecret);
  } catch {
    throw httpError(400, 'invalid_upload_ticket', 'Upload ticket is invalid or expired');
  }
  if (payload.type !== DIRECT_UPLOAD_TICKET_TYPE) {
    throw httpError(400, 'invalid_upload_ticket', 'Upload ticket is invalid');
  }
  if (payload.ownerUserId !== userId) {
    throw httpError(403, 'forbidden', 'Upload ticket belongs to another user');
  }
  return payload;
}

function directUploadCredentials(key) {
  return qiniuStorage.createDirectUploadToken({
    key,
    maxBytes: directUploadMaxBytes(),
    expiresSeconds: config.qiniu.directUploadTokenExpiresSeconds
  });
}

async function initShareDirectUpload({ ownerUserId, filename, size, mime }) {
  if (!isDirectUploadEnabled()) {
    throw httpError(409, 'direct_upload_unavailable', 'Shared files are not stored in Qiniu');
  }
  const declaredSize = Number(size);
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) {
    throw httpError(400, 'invalid_size', 'size must be a non-negative integer');
  }
  const maxBytes = directUploadMaxBytes();
  if (declaredSize > maxBytes) {
    throw httpError(400, 'file_too_large', `File exceeds the ${maxBytes}-byte limit`);
  }

  const originalName = normalizeDeclaredName(filename);
  const declaredMime = normalizeDeclaredMime(mime);
  const fileId = generateFileId();
  const key = shareObjectKey(monthBucket(), fileId, extFromName(originalName));

  const uploadHost = await qiniuStorage.resolveUploadHost();
  const { token, tokenExpiresAt } = directUploadCredentials(key);
  const ticket = signDirectUploadTicket({
    fileId, key, ownerUserId, filename: originalName, size: declaredSize, mime: declaredMime
  });

  return {
    ticket,
    fileId,
    key,
    encodedKey: qiniuStorage.encodeObjectKey(key),
    bucket: config.qiniu.bucket,
    uploadHost,
    token,
    tokenExpiresAt,
    maxBytes
  };
}

function refreshShareDirectUploadToken({ ticket, userId }) {
  const payload = verifyDirectUploadTicket(ticket, userId);
  return directUploadCredentials(payload.key);
}

async function completeShareDirectUpload({ ticket, userId }) {
  const payload = verifyDirectUploadTicket(ticket, userId);
  const { fileId, key, filename, mime } = payload;

  const existing = findByFileId(fileId);
  if (existing) {
    if (existing.owner_user_id !== userId || existing.path !== key) {
      throw httpError(409, 'conflict', 'File id already registered');
    }
    return savedFileData({
      fileId, originalName: existing.filename, size: existing.size, mime: existing.mime,
      width: existing.width, height: existing.height, hasThumbnail: existing.has_thumbnail,
      scope: existing.scope, now: existing.created_at
    });
  }

  const stat = await qiniuStorage.statFile(key);
  if (!stat) {
    throw httpError(409, 'upload_incomplete', 'The file has not finished uploading to Qiniu');
  }
  const actualSize = Number(stat.fsize);
  if (!Number.isSafeInteger(actualSize) || actualSize !== Number(payload.size) || actualSize > directUploadMaxBytes()) {
    // Never register an object whose size differs from what was authorised.
    try { await qiniuStorage.deleteFile(key); } catch {}
    throw httpError(400, 'size_mismatch', 'Uploaded file size does not match the declared size');
  }

  const actualMime = normalizeDeclaredMime(stat.mimeType || mime);
  const hasThumbnail = isImage(actualMime) && actualSize <= QINIU_FOP_THUMBNAIL_MAX_BYTES
    ? THUMBNAIL_QINIU_FOP
    : 0;
  const now = Date.now();
  try {
    insertFileRecord({
      fileId,
      ownerUserId: userId,
      originalName: filename,
      size: actualSize,
      mime: actualMime,
      location: key,
      storageProvider: 'qiniu',
      scope: 'share',
      width: null,
      height: null,
      hasThumbnail,
      now
    });
  } catch (e) {
    // A concurrent completion of the same ticket already inserted the row.
    if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return completeShareDirectUpload({ ticket, userId });
    }
    throw e;
  }
  return savedFileData({
    fileId, originalName: filename, size: actualSize, mime: actualMime,
    width: null, height: null, hasThumbnail, scope: 'share', now
  });
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
  if (attachment) {
    return qiniuStorage.getPrivateDownloadUrl({ key: file.path, filename: file.filename });
  }
  if (Number(file.has_thumbnail) === THUMBNAIL_QINIU_FOP) {
    const edge = Math.max(1, parseInt(config.thumbnail.maxEdge, 10) || 400);
    const quality = Math.min(100, Math.max(1, parseInt(config.thumbnail.quality, 10) || 70));
    return qiniuStorage.getPrivateDownloadUrl({
      key: `${file.path}?imageView2/2/w/${edge}/h/${edge}/format/jpg/q/${quality}`
    });
  }
  return qiniuStorage.getPrivateDownloadUrl({ key: file.path + '.thumb.jpg' });
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
    if (Number(file.has_thumbnail) === THUMBNAIL_STORED) {
      await qiniuStorage.deleteFile(file.path + '.thumb.jpg');
    }
  } else {
    try { fs.unlinkSync(absPath(file.path)); } catch {}
    try { fs.unlinkSync(thumbPath(absPath(file.path))); } catch {}
  }
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  return true;
}

module.exports = {
  saveUpload,
  isDirectUploadEnabled,
  initShareDirectUpload,
  refreshShareDirectUploadToken,
  completeShareDirectUpload,
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
