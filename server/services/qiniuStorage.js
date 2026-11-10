const qiniu = require('qiniu');
const config = require('../../config');

const ZONE_NAMES = {
  z0: 'Zone_z0',
  z1: 'Zone_z1',
  z2: 'Zone_z2',
  na0: 'Zone_na0',
  as0: 'Zone_as0',
  'cn-east-2': 'Zone_cn_east_2'
};

function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  error.code = 'qiniu_not_configured';
  return error;
}

function getSettings() {
  const settings = config.qiniu;
  const missing = ['accessKey', 'secretKey', 'bucket', 'domain']
    .filter((key) => !settings[key]);
  if (missing.length) {
    throw configurationError(`Missing Qiniu configuration: ${missing.join(', ')}`);
  }
  return settings;
}

function createClient() {
  const settings = getSettings();
  const zoneName = ZONE_NAMES[settings.zone];
  if (settings.zone && !zoneName) {
    throw configurationError(`Unsupported QINIU_ZONE: ${settings.zone}`);
  }

  const qiniuConfig = new qiniu.conf.Config({
    useHttpsDomain: true,
    zone: zoneName ? qiniu.zone[zoneName] : null
  });
  const mac = new qiniu.auth.digest.Mac(settings.accessKey, settings.secretKey);
  return { settings, mac, qiniuConfig };
}

function createUploadToken(mac, bucket) {
  return new qiniu.rs.PutPolicy({ scope: bucket }).uploadToken(mac);
}

/**
 * Upload token for one browser-to-Kodo upload. The scope is pinned to a single
 * object key, existing objects cannot be overwritten, and Kodo rejects files
 * larger than maxBytes.
 */
function createDirectUploadToken({ key, maxBytes, expiresSeconds }) {
  const { settings, mac } = createClient();
  const expires = Math.max(60, Number(expiresSeconds) || 7200);
  const token = new qiniu.rs.PutPolicy({
    scope: `${settings.bucket}:${key}`,
    insertOnly: 1,
    fsizeLimit: maxBytes,
    expires
  }).uploadToken(mac);
  return { token, tokenExpiresAt: Date.now() + expires * 1000 };
}

function encodeObjectKey(key) {
  return qiniu.util.urlsafeBase64Encode(key);
}

function normalizeUploadHost(host) {
  const trimmed = String(host).trim().replace(/\/+$/, '');
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:/i, 'https:');
  return /^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

let discoveredUploadHost = null;

/** HTTPS upload endpoint the browser should use for this bucket. */
async function resolveUploadHost() {
  const settings = getSettings();
  if (settings.uploadHost) return normalizeUploadHost(settings.uploadHost);

  const zoneName = ZONE_NAMES[settings.zone];
  if (settings.zone && !zoneName) {
    throw configurationError(`Unsupported QINIU_ZONE: ${settings.zone}`);
  }
  if (zoneName) {
    const zone = qiniu.zone[zoneName];
    return normalizeUploadHost(zone.cdnUpHosts[0] || zone.srcUpHosts[0]);
  }

  if (discoveredUploadHost && discoveredUploadHost.expiresAt > Date.now()) {
    return discoveredUploadHost.host;
  }
  const host = await new Promise((resolve, reject) => {
    qiniu.zone.getZoneInfo(settings.accessKey, settings.bucket, (err, zoneInfo, ttlSeconds) => {
      if (err) return reject(err);
      const candidate = (zoneInfo.cdnUpHosts && zoneInfo.cdnUpHosts[0]) ||
        (zoneInfo.srcUpHosts && zoneInfo.srcUpHosts[0]);
      if (!candidate) return reject(new Error('Qiniu region query returned no upload host'));
      const ttlMs = Math.min(Math.max(Number(ttlSeconds) || 3600, 60), 86400) * 1000;
      discoveredUploadHost = { host: normalizeUploadHost(candidate), expiresAt: Date.now() + ttlMs };
      resolve(discoveredUploadHost.host);
    });
  });
  return host;
}

/** Object metadata ({ fsize, mimeType, hash, ... }), or null when the key does not exist. */
async function statFile(key) {
  const { settings, mac, qiniuConfig } = createClient();
  const bucketManager = new qiniu.rs.BucketManager(mac, qiniuConfig);
  let result;
  try {
    result = await bucketManager.stat(settings.bucket, key);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
  const status = result && result.resp ? result.resp.statusCode : 0;
  if (status === 404 || status === 612) return null;
  if (status !== 200) {
    const error = new Error(`Qiniu stat failed with HTTP ${status}`);
    error.status = 502;
    error.code = 'qiniu_stat_failed';
    throw error;
  }
  return result.data;
}

async function uploadFile({ key, filePath, mime }) {
  const { settings, mac, qiniuConfig } = createClient();
  const uploader = new qiniu.form_up.FormUploader(qiniuConfig);
  const putExtra = new qiniu.form_up.PutExtra();
  putExtra.mimeType = mime || 'application/octet-stream';
  const result = await uploader.putFile(
    createUploadToken(mac, settings.bucket),
    key,
    filePath,
    putExtra
  );
  return result;
}

function normalizeDomain(domain) {
  const normalized = domain.replace(/\/+$/, '');
  return /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
}

function getPrivateDownloadUrl({ key, filename, expiresSeconds }) {
  const { settings, mac, qiniuConfig } = createClient();
  const bucketManager = new qiniu.rs.BucketManager(mac, qiniuConfig);
  const attachment = filename ? `?attname=${encodeURIComponent(filename)}` : '';
  const requestedTtl = Number(expiresSeconds ?? settings.downloadExpiresSeconds);
  const ttl = Number.isFinite(requestedTtl) ? Math.max(1, requestedTtl) : 300;
  const deadline = Math.floor(Date.now() / 1000) + ttl;
  return bucketManager.privateDownloadUrl(normalizeDomain(settings.domain), `${key}${attachment}`, deadline);
}

function isNotFoundError(error) {
  const status = Number(error?.code || error?.statusCode || error?.response?.statusCode);
  return status === 404 || status === 612;
}

async function deleteFile(key) {
  const { settings, mac, qiniuConfig } = createClient();
  const bucketManager = new qiniu.rs.BucketManager(mac, qiniuConfig);
  try {
    await bucketManager.delete(settings.bucket, key);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

module.exports = {
  uploadFile,
  getPrivateDownloadUrl,
  deleteFile,
  createDirectUploadToken,
  encodeObjectKey,
  resolveUploadHost,
  statFile
};
