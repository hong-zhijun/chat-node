# Nodex

一个轻量、可私有部署的一对一聊天系统，支持文字、图片、文件、表情包和消息引用，附带完整的后台管理界面。

## 功能特性

### 聊天
- 一对一实时聊天（文字 / 图片 / 文件 / 表情包）
- 消息引用（长按或右键回复某条消息）
- 消息撤回（2 分钟内）
- 消息已读状态
- 正在输入提示

### 连接稳定性
- WebSocket 长连接 + 心跳检测
- 自动重连（指数退避：1s → 2s → 4s → … → 30s）
- 断线补发（重连后自动拉取漏掉的消息）
- 多设备同步（同一账号多端实时同步）
- 幂等发送（防止网络重试导致重复消息）

### 文件共享
- 独立文件共享区
- 图片自动生成缩略图
- 上传 / 下载权限控制

### 后台管理
- **Overview**：在线人数、消息总量、存储占用、7 日趋势图
- **Users**：创建 / 删除用户、启用 / 禁用、重置登录密钥
- **Stickers**：上传和管理表情包
- **Fillers**：管理自定义占位符
- **Cleanup**：按日期 / 用户清理消息和文件

### 客户端适配
- PC 端宽屏布局 + 移动端抽屉式侧边栏
- 键盘弹起时输入框不被顶走
- ESC 键关闭弹窗 / 进入或退出睡眠模式

## 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | Node.js 20 + Express |
| 实时通信 | `ws`（原生 WebSocket） |
| 数据库 | better-sqlite3 |
| 鉴权 | JWT + sessions 表（支持多设备精细撤销） |
| 文件处理 | multer + sharp |
| 前端框架 | Vue 3 + Vite |
| 样式 | Tailwind CSS |
| 状态管理 | Pinia |

## 快速开始

### 方式一：直接运行

**环境要求**：Node.js 20+

```bash
# 1. 安装依赖
npm install

# 2. 构建前端
npm run build:client

# 3. 修改配置（必须）
#    编辑 config.js，设置 adminKey 和 jwtSecret

# 4. 启动服务
node server/index.js
```

访问 `http://localhost:3000`，管理后台在 `/admin/login`。

### 方式二：Docker Compose（推荐生产部署）

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env，填写密钥
#    ADMIN_KEY=your_admin_key
#    JWT_SECRET=your_jwt_secret

# 3. 启动
docker compose up -d
```

服务默认监听宿主机 `30001` 端口，数据持久化在 `./data` 目录。

### 开发模式

```bash
npm run dev   # 前后端并行启动，前端热更新
```

> 注意：修改前端源码后需重新构建（`npm run build:client`），服务器只托管 `dist/` 目录。

## 配置说明

配置文件为项目根目录的 `config.js`，也支持通过环境变量覆盖（Docker 部署时使用）：

| 配置项 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `port` | `PORT` | `3000` | 监听端口 |
| `adminKey` | `ADMIN_KEY` | — | 管理员登录密钥，**必须修改** |
| `jwtSecret` | `JWT_SECRET` | — | JWT 签名密钥，**必须修改** |
| `jwtExpiresIn` | `JWT_EXPIRES_IN` | `30d` | 用户 token 有效期 |

### 七牛云 Kodo（仅共享文件，可选）

默认所有文件仍保存在本地。若只想将**之后上传的共享文件**存入七牛 Kodo，请在 `.env` 设置：

```env
SHARE_STORAGE_DRIVER=qiniu
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=your_private_bucket
QINIU_DOMAIN=https://files.example.com
# 可选：z0、z1、z2、na0、as0、cn-east-2；留空则由 SDK 自动识别区域
QINIU_ZONE=
```

Bucket 应设为私有。应用会先验证登录状态和文件权限，再重定向到有效期 5 分钟的七牛签名下载链接。既有文件、聊天附件和表情包仍保留在本地；后台文件清理也只处理本地文件。

## 首次使用

1. 启动服务后访问 `/admin/login`，用 `adminKey` 登录后台
2. 在 **Users** 页面创建用户，系统会生成登录密钥
3. 用户访问 `/login`，输入登录密钥进入聊天

> 登录密钥是唯一凭证，请妥善保管。管理员可随时重置。

## 项目结构

```
chat-node/
├── config.js              # 配置文件
├── server/
│   ├── index.js           # 服务入口
│   ├── db.js              # 数据库初始化 + 迁移
│   ├── ws.js              # WebSocket 服务
│   ├── auth.js            # 鉴权中间件
│   ├── routes/            # API 路由
│   └── services/          # 业务逻辑
├── client/chat/
│   └── src/
│       ├── pages/         # 页面组件（含后台管理）
│       ├── components/    # 公共组件
│       ├── stores/        # Pinia 状态
│       └── api/           # API 客户端
├── data/                  # 运行时数据（自动创建）
│   ├── chat.db            # SQLite 数据库
│   └── uploads/           # 上传文件
├── Dockerfile
└── docker-compose.yml
```

## License

MIT
