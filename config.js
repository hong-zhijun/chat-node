/**
 * 运行配置
 *
 * Docker 部署时所有配置均通过环境变量注入（见 .env / docker-compose.yml）。
 * 本地直接运行时在项目根目录创建 .env 文件（参考 .env.example）即可。
 */
require('dotenv').config()

module.exports = {
  port: parseInt(process.env.PORT || '8881'),

  // 管理员登录 key（直接预设，不在数据库里）
  adminKey: process.env.ADMIN_KEY || 'CHANGE_ME_TO_A_LONG_RANDOM_STRING',

  // JWT
  jwtSecret:    process.env.JWT_SECRET    || 'CHANGE_ME_JWT_SECRET',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  db: {
    path: process.env.DB_PATH || './data/chat.db'
  },

  upload: {
    chatDir:  process.env.UPLOAD_CHAT_DIR  || './data/uploads/chat',
    shareDir: process.env.UPLOAD_SHARE_DIR || './data/uploads/share'
  },

  storage: {
    // local: all shared files remain on the application disk.
    // qiniu: newly uploaded shared files are stored in Qiniu Kodo.
    shareDriver: process.env.SHARE_STORAGE_DRIVER || 'local'
  },

  qiniu: {
    accessKey: process.env.QINIU_ACCESS_KEY || '',
    secretKey: process.env.QINIU_SECRET_KEY || '',
    bucket: process.env.QINIU_BUCKET || '',
    // An HTTPS-enabled domain bound to the bucket, without a trailing slash.
    domain: process.env.QINIU_DOMAIN || '',
    // Optional. Leave empty to let the SDK discover the bucket region.
    zone: process.env.QINIU_ZONE || '',
    // Optional. Upload endpoint used by browsers, e.g. https://upload-z2.qiniup.com.
    // Leave empty to derive it from QINIU_ZONE or the bucket's region.
    uploadHost: process.env.QINIU_UPLOAD_HOST || '',
    downloadExpiresSeconds: parseInt(process.env.QINIU_DOWNLOAD_EXPIRES_SECONDS || '300', 10),
    // Browser-to-Kodo multipart upload of shared files.
    // Maximum accepted file size in bytes (default 10 GiB).
    directUploadMaxBytes: parseInt(process.env.QINIU_DIRECT_UPLOAD_MAX_BYTES || String(10 * 1024 * 1024 * 1024), 10),
    // Lifetime of each upload token; the browser refreshes it during long uploads.
    directUploadTokenExpiresSeconds: parseInt(process.env.QINIU_DIRECT_UPLOAD_TOKEN_EXPIRES_SECONDS || '7200', 10)
  },

  ws: {
    heartbeatIntervalMs:      parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '25000'),
    heartbeatTimeoutMs:       parseInt(process.env.WS_HEARTBEAT_TIMEOUT_MS  || '30000'),
    clientMsgIdDedupWindowMs: 5 * 60 * 1000
  },

  recallWindowMs: 2 * 60 * 1000,

  thumbnail: {
    maxEdge: parseInt(process.env.THUMB_MAX_EDGE || '400'),
    quality:  parseInt(process.env.THUMB_QUALITY  || '70')
  }
};
