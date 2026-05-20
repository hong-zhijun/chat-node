module.exports = {
  port: 8881,

  // 管理员登录 key（直接预设，不在数据库里）
  adminKey: '123456',

  // JWT
  jwtSecret: 'a51cd5d741a4c596a225a71549fadf2c921fd2ecebddfea714185453f3a03fdb',
  jwtExpiresIn: '30d',

  db: {
    path: './data/chat.db'
  },

  upload: {
    chatDir: './data/uploads/chat',
    shareDir: './data/uploads/share'
  },

  ws: {
    heartbeatIntervalMs: 25000,
    heartbeatTimeoutMs: 30000,
    clientMsgIdDedupWindowMs: 5 * 60 * 1000
  },

  recallWindowMs: 2 * 60 * 1000,

  thumbnail: {
    maxEdge: 400,
    quality: 70
  }
};
