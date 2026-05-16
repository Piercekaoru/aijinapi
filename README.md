# OpenAchieve

面向中国开发者的 OpenAI 兼容 API 中继服务，对接 [OpenCode](https://opencode.ai) Zen / Go 上游，提供免费和付费双套餐。

## 架构

```
浏览器 / API Client
  │
  ▼
Next.js 15 (:3000)  ──rewrites──→  Rust actix-web (:8080)  ──→  OpenCode Zen / Go
                                        │
                                        ▼
                                  PostgreSQL 16
```

Next.js 通过 `rewrites()` 将 `/api/backend/:path*` 和 `/v1/:path*` 代理到本地 Rust 后端。Rust 后端负责认证、鉴权、用量统计和上游请求转发。

## 技术栈

| 层 | 技术 |
|---|---|
| **前端** | Next.js 15.5 + React 19 + Tailwind CSS v4 + shadcn/ui (base-nova / neutral) |
| **后端** | Rust (edition 2024) + actix-web 4.12 + sqlx 0.8 |
| **数据库** | PostgreSQL 16 |
| **容器化** | Docker + docker-compose (multi-stage build) |
| **包管理** | pnpm 9.x（前端）、Cargo（后端） |

## 功能特性

- **OpenAI 兼容 API** — 完全兼容 `/v1/chat/completions`（支持流式与非流式）和 `/v1/models`
- **双套餐体系** — Free（500 次/月，5 个 Zen 免费模型）和 Plus（1500 次/月，额外 10 个 Go 付费模型）
- **用户系统** — 邮箱注册、密码登录、邮箱验证、30 天会话管理
- **API Key 管理** — 创建/查看 API Key，SHA-256 哈希存储，明文仅初次创建时返回
- **用量 Dashboard** — 实时查看套餐状态、API Key 列表、近期请求用量
- **上游容错** — 多 Key 轮转、故障冷却、自动重试（最多 4 次）
- **管理后台** — Admin 可查看/创建/删除用户、调整套餐、审计日志
- **SMTP 邮件** — 注册邮箱验证（支持 StartTLS / Implicit / None 三种 TLS 模式）

## 快速开始（本地开发）

### 前置条件

- **pnpm** 9.x（`packageManager: "pnpm@9.15.9"`，lockfile 为 pnpm-lock.yaml）
- **Rust** 工具链（edition 2024，Docker 中使用 1.95+）
- **PostgreSQL** 16（本地安装或 Docker 运行）

### 1. 配置后端

```bash
cd backend
cp .env.example .env
```

编辑 `backend/.env`，至少填入：

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/openachieve
OPENCODE_ZEN_API_KEYS=你的_OpenCode_Zen_Key_1,你的_OpenCode_Zen_Key_2
OPENCODE_GO_API_KEYS=你的_OpenCode_Go_Key_1,你的_OpenCode_Go_Key_2
```

> Zen 和 Go key 建议分开配置；后端启动时要求 Zen key 存在，避免 Free 流量静默复用 Go 余额。

### 2. 运行数据库迁移

```bash
cargo run --bin migrate
```

### 3. 创建管理员用户（可选）

```bash
cargo run --bin create_key -- --email "your@email.com"
```

### 4. 启动后端

```bash
cargo run
```

后端将在 `http://127.0.0.1:8080` 启动。

### 5. 启动前端

```bash
# 回到项目根目录
pnpm dev
```

前端将在 `http://localhost:3000` 启动。

> **顺序重要**：必须先执行 `migrate`，再启动后端和前端。

## 快速开始（Docker）

```bash
cp .env.docker.example .env.docker
# 编辑 .env.docker，填入 POSTGRES_PASSWORD、DATABASE_URL、OPENCODE_GO_API_KEY 等
docker compose --env-file .env.docker up --build
```

部署后访问 `http://localhost:3000`（或配置的 `APP_PORT`）。

## 环境变量

### 必需变量

| 变量 | 说明 | 示例 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgres://user:pass@host:5432/openachieve` |
| `OPENCODE_ZEN_API_KEYS` | OpenCode Zen 上游 API Key 列表 | `zen_key_1,zen_key_2` |
| `OPENCODE_GO_API_KEYS` | OpenCode Go 上游 API Key 列表 | `go_key_1,go_key_2` |

> Zen key 是必需的，不再默认复用 Go key；这样 Free 流量可以独立设置 OpenCode 支出上限。

### 可选变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `OPENCODE_ZEN_API_KEY` | Zen 单 Key 兼容变量 | 无 |
| `OPENCODE_GO_API_KEY` | Go 单 Key 兼容变量 | 无 |
| `SERVER_HOST` | Rust 后端监听地址 | `127.0.0.1` |
| `SERVER_PORT` | Rust 后端监听端口 | `8080` |
| `APP_PORT` | Docker 对外端口 | `3000` |
| `APP_BASE_URL` | 前端完整 URL（邮件链接用） | `http://localhost:3000` |
| `CORS_ALLOWED_ORIGINS` | 允许的跨域来源（逗号分隔） | `http://localhost:3000,http://localhost:3001,http://localhost:3002` |
| `DEFAULT_MONTHLY_REQUEST_LIMIT` | 默认 API Key 月配额 | `500` |
| `ADMIN_EMAILS` | 管理员邮箱（逗号分隔） | `xiaolinyihai@gmail.com` |
| `UPSTREAM_MAX_ATTEMPTS` | 上游请求最大重试次数 | `4` |
| `UPSTREAM_RETRY_BASE_MS` | 重试基础间隔（毫秒） | `300` |
| `UPSTREAM_KEY_COOLDOWN_MS` | Key 故障冷却时间（毫秒） | `60000` |

### 上游 URL 变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `ZEN_CHAT_COMPLETIONS_URL` | Zen Chat Completions 地址 | `https://opencode.ai/zen/v1/chat/completions` |
| `ZEN_GO_CHAT_COMPLETIONS_URL` | Go Chat Completions 地址 | `https://opencode.ai/zen/go/v1/chat/completions` |
| `ZEN_MODELS_URL` | Zen Models 地址 | `https://opencode.ai/zen/v1/models` |
| `ZEN_GO_MODELS_URL` | Go Models 地址 | `https://opencode.ai/zen/go/v1/models` |

### SMTP 邮件变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `SMTP_HOST` | SMTP 服务器地址 | — |
| `SMTP_PORT` | SMTP 端口 | `587` |
| `SMTP_USERNAME` | SMTP 用户名 | — |
| `SMTP_PASSWORD` | SMTP 密码 | — |
| `SMTP_FROM_EMAIL` | 发件人邮箱 | — |
| `SMTP_FROM_NAME` | 发件人名称 | `OpenAchieve` |
| `SMTP_TLS_MODE` | TLS 模式：`starttls` / `implicit` / `none` | `starttls` |

> SMTP 变量仅在 `SMTP_HOST`、`SMTP_USERNAME`（需同步设置 `SMTP_PASSWORD`）、`SMTP_FROM_EMAIL` 中任一存在时生效。未配置 SMTP 时系统不发送验证邮件，新用户注册后将无法验证邮箱。

### PostgreSQL 变量（仅 Docker）

| 变量 | 说明 | 默认值 |
|---|---|---|
| `POSTGRES_DB` | 数据库名 | `openachieve` |
| `POSTGRES_USER` | 数据库用户 | `openachieve` |
| `POSTGRES_PASSWORD` | 数据库密码 | **必需** |

## API 端点

### 公开端点

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| `GET` | `/api/backend/health` | 无 | 健康检查 |
| `POST` | `/api/backend/auth/register` | 无 | 邮箱注册（返回验证提示） |
| `POST` | `/api/backend/auth/login` | 无 | 邮箱+密码登录（返回 session token） |
| `GET` | `/api/backend/auth/verify-email` | 无 | 邮箱验证（从邮件链接点击） |
| `POST` | `/api/backend/auth/resend-verification` | 无 | 重新发送验证邮件 |

### Session 认证端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/backend/auth/me` | 当前用户信息 |
| `GET` | `/api/backend/dashboard` | 用量统计 + API Key 列表 + 套餐信息 |
| `POST` | `/api/backend/dashboard/api-keys` | 创建新的 API Key |

### API Key 认证端点（OpenAI 兼容）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/v1/models` | 列出当前套餐可用模型 |
| `POST` | `/v1/chat/completions` | Chat Completions（支持 stream） |

> 前端 Next.js 通过 rewrite 将 `/v1/:path*` 和 `/api/backend/:path*` 代理到后端，因此外部可直接访问 `https://你的域名/v1/chat/completions`。

### Admin 端点（需 Admin 邮箱登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/backend/admin/users` | 查看所有用户（含统计） |
| `POST` | `/api/backend/admin/users` | 管理员创建用户（邮箱已预验证） |
| `PATCH` | `/api/backend/admin/users/:id/plan` | 调整用户套餐 |
| `DELETE` | `/api/backend/admin/users/:id` | 删除用户 |

## 模型路由

### Free 套餐（5 个 Zen 免费模型）

路由至 **OpenCode Zen** 上游：

| 模型 ID | 来源 |
|---|---|
| `big-pickle` | Zen |
| `deepseek-v4-flash-free` | Zen |
| `minimax-m2.5-free` | Zen |
| `ring-2.6-1t-free` | Zen |
| `nemotron-3-super-free` | Zen |

### Plus 套餐（以上 5 个 + 额外 10 个 Go 付费模型）

Free 模型继续路由至 **Zen**，Plus 专属模型路由至 **Go**：

| 模型 ID | 来源 |
|---|---|
| `glm-5.1` | Go |
| `glm-5` | Go |
| `kimi-k2.5` | Go |
| `kimi-k2.6` | Go |
| `deepseek-v4-pro` | Go |
| `deepseek-v4-flash` | Go |
| `mimo-v2.5` | Go |
| `mimo-v2.5-pro` | Go |
| `qwen3.6-plus` | Go |
| `qwen3.5-plus` | Go |

### 月配额

| 套餐 | 月请求上限 |
|---|---|
| Free | 500 次 |
| Plus | 1500 次 |

## 部署

### 使用 deploy.sh

生产环境一键部署脚本：

```bash
# 可选环境变量
# DEPLOY_BRANCH    — git 分支（默认 main）
# DEPLOY_ENV_FILE  — 环境变量文件路径（默认 .env.docker 或 .env）
# HEALTHCHECK_URL  — 健康检查地址（默认 http://127.0.0.1:3000/api/backend/health）
# PRUNE_OLD_IMAGES — 设为 true 自动清理旧镜像

./deploy.sh
```

脚本流程：`git pull` → `docker compose build` → `docker compose up -d` → 健康检查轮询。失败时自动打印容器日志。

### 使用 Docker Compose

```bash
# 准备环境文件
cp .env.docker.example .env.docker
# 编辑 .env.docker 填入所需变量

# 构建并启动
docker compose --env-file .env.docker up --build -d
```

### 生产环境注意

- 将 `CORS_ALLOWED_ORIGINS` 设置为你的域名（如 `https://openachieve.asia`）
- 将 `APP_BASE_URL` 设置为前端公网访问地址
- 在 Docker 环境中，`SERVER_HOST` 和 `SERVER_PORT` 保持默认值（后端仅在容器内监听）
- PostgreSQL 数据通过 Docker volume `openachieve-postgres` 持久化

## 项目目录结构

```
openachieve-next/
├── app/                          # Next.js App Router 页面
│   ├── components/               # 页面级组件（SiteHeader, SiteFooter, StaticHtmlPage）
│   ├── dashboard/                # Dashboard 页面（React）
│   ├── login/                    # 登录页面
│   ├── account/                  # 账户设置页面
│   ├── playground/               # API 调试 Playground
│   ├── models/                   # 模型列表页面
│   ├── docs/                     # 文档页面
│   ├── admin/                    # 管理后台页面
│   └── terms/                    # 服务条款
├── components/                   # shadcn/ui 组件库
│   └── ui/                       # UI 基础组件
├── lib/                          # 工具函数（cn, html-page 等）
├── public/                       # 静态资源
├── backend/                      # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── routes.rs             # 路由定义与 Handler
│   │   ├── auth.rs               # 认证逻辑
│   │   ├── config.rs             # 环境变量配置
│   │   ├── db.rs                 # 数据库操作
│   │   ├── models.rs             # 数据模型
│   │   ├── upstream.rs           # 上游请求转发、模型定义、路由逻辑
│   │   ├── keys.rs               # API Key 管理
│   │   ├── plans.rs              # 套餐定义
│   │   ├── email.rs              # 邮件发送
│   │   ├── errors.rs             # 错误类型
│   │   ├── state.rs              # AppState
│   │   └── bin/
│   │       ├── migrate.rs        # 数据库迁移 CLI
│   │       ├── create_key.rs     # API Key 创建 CLI
│   │       └── set_plan.rs       # 设置套餐 CLI
│   ├── migrations/               # SQL 迁移文件
│   └── tests/                    # 集成测试
├── .env.docker.example           # Docker 环境变量模板
├── docker-compose.yml            # Docker Compose 配置
├── Dockerfile                    # 多阶段构建（Node → Rust → runner）
├── docker-entrypoint.sh          # Docker 启动入口（migrate + 启动后端+前端）
├── deploy.sh                     # 生产部署脚本
├── next.config.ts                # Next.js 配置（rewrites + standalone）
├── tailwind.config.ts           # Tailwind v4 配置
├── components.json               # shadcn/ui 配置（base-nova / neutral）
├── package.json                  # 前端依赖（pnpm workspace）
├── pnpm-lock.yaml               # pnpm 锁定文件
└── openachieve-*.html            # 静态 landing / login / models 页面
```
