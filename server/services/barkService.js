/**
 * Bark 推送服务
 *
 * Bark 是一个 iOS 实时推送工具。文档：https://bark.day.app/
 *
 * 用户配置 bark_key 格式：
 *   - 官方服务器：https://api.day.app/YOUR_DEVICE_KEY
 *   - 自建服务器：http://your-host:8080/YOUR_DEVICE_KEY
 *
 * GET 推送格式：
 *   {barkUrl}/{title}/{body}?group=xxx&sound=xxx[&icon=xxx][&url=xxx]
 */

const https = require('https');
const http = require('http');

/**
 * 发送 Bark 推送
 * @param {string} barkUrl   - 用户配置的推送地址（含 device key）
 * @param {object} opts
 * @param {string}  opts.title          - 通知标题
 * @param {string}  opts.body           - 通知正文
 * @param {string} [opts.group]         - 分组（默认 'Nodex'）
 * @param {string} [opts.sound]         - 提示音（默认 'default'）
 * @param {string} [opts.icon]          - 图标 URL（可选，Bark 1.2.9+）
 * @param {string} [opts.clickUrl]      - 点击跳转链接（可选）
 */
async function sendBarkPush(barkUrl, {
  title,
  body,
  group   = 'Nodex',
  sound   = 'default',
  icon    = null,
  clickUrl = null
}) {
  if (!barkUrl || typeof barkUrl !== 'string') return;

  try {
    const base = barkUrl.replace(/\/+$/, '');

    const qs = [
      `group=${encodeURIComponent(group)}`,
      `sound=${encodeURIComponent(sound)}`,
      'autoCopy=1'
    ];
    if (icon)     qs.push(`icon=${encodeURIComponent(icon)}`);
    if (clickUrl) qs.push(`url=${encodeURIComponent(clickUrl)}`);

    const pushUrl = [
      base,
      encodeURIComponent(title),
      encodeURIComponent(body)
    ].join('/') + '?' + qs.join('&');

    const parsed = new URL(pushUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve, reject) => {
      const req = lib.get(pushUrl, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
    });
  } catch (e) {
    console.warn('[bark] push failed:', e.message);
  }
}

module.exports = { sendBarkPush };
