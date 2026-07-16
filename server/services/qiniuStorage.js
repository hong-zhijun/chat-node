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
  deleteFile
};
