const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function generateUserId() {
  // 6 位数字字符串（首位非 0）
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

function generateLoginKey() {
  // 32 字符随机十六进制串
  return crypto.randomBytes(16).toString('hex');
}

function generateFileId() {
  return uuidv4();
}

function generateTokenId() {
  return uuidv4();
}

module.exports = {
  generateUserId,
  generateLoginKey,
  generateFileId,
  generateTokenId
};
