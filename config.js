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
