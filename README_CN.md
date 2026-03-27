<h1 align="center">RealtimeSearch</h1>

<p align="center">
  <img src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <a href="https://github.com/SquadyAI/RealtimeSearch/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge" alt="PRs Welcome"></a>
</p>

<p align="center">
  <strong>一个接口，所有搜索引擎，零停机。</strong><br>
  别再为 Serper、Brave、Bing 写胶水代码了。<br>
  填上 API Key，调一个端点，故障转移自动搞定。
</p>

<p align="center">
  <a href="#60-秒启动">快速开始</a> &ensp;|&ensp;
  <a href="#工作原理">工作原理</a> &ensp;|&ensp;
  <a href="#添加自定义引擎">扩展引擎</a> &ensp;|&ensp;
  <a href="README.md">English</a>
</p>

<p align="center">
  <sub><a href="https://github.com/SquadyAI/RealtimeAPI"><strong>SquadyAI RealtimeAPI</strong></a> 的搜索基座 — 开源实时语音 AI 平台，端到端延迟 &lt;450ms。</sub>
</p>

<!-- TODO: 截图就绪后替换
<p align="center">
  <img src="docs/dashboard.png" alt="RealtimeSearch Dashboard" width="720">
</p>
-->

---

## 问题

你在做一个 AI Agent，它需要联网搜索。接下来会发生什么：

```
周一:  "Serper 真好用！" → 上线
周二:  Serper 被限流 → 加 Brave 做兜底 → 改一半代码
周三:  还要加 Bing → 三套 API 格式、三套错误处理、三套重试逻辑
周四:  Key 轮换？负载均衡？监控？→ 一团乱麻
周五:  凌晨 3 点某个搜索引擎改了接口，生产环境挂了 → 痛苦
```

**RealtimeSearch 的存在，就是让你不再经历这样的一周。**

| | 没有 RealtimeSearch | 有 RealtimeSearch |
|---|---|---|
| **引擎挂了** | 你的应用跟着挂 | 自动切换，~0ms |
| **被限流** | 429 错误，请求丢失 | 路由到有余量的引擎 |
| **多个 API Key** | 手写轮换逻辑 | 内置 Key 池 + 轮询 |
| **换供应商** | 重写对接代码 | 改一个环境变量，代码不动 |
| **可观测性** | 散落在各家后台 | 统一 Prometheus + Web 面板 |

---

## 60 秒启动

```bash
git clone https://github.com/SquadyAI/RealtimeSearch.git && cd RealtimeSearch
cp .env.example .env        # 填入至少一个搜索引擎 API Key
docker compose up -d         # 内置 PostgreSQL，开箱即用
```

打开 **http://localhost:5173** → 创建管理员账号 → 开始搜索。

### 获取 API Key（免费）

至少需要 **一个**。三个都加上可以白嫖每月 ~5,500 次搜索，并自动故障转移：

| 引擎 | 免费额度 | 申请地址 |
|------|---------|---------|
| **Serper** | 2,500 次/月 | [serper.dev](https://serper.dev) |
| **Brave** | 2,000 次/月 | [brave.com/search/api](https://brave.com/search/api) |
| **Bing** | 1,000 次/月 | [microsoft.com](https://www.microsoft.com/en-us/bing/apis/bing-web-search-api) |

---

## API 示例

```bash
curl -X POST http://localhost:8787/v1/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "最新 AI 研究", "limit": 10}'
```

```json
{
  "results": [
    { "title": "...", "url": "...", "snippet": "..." }
  ],
  "engine": "serper",
  "elapsed": 423
}
```

无论哪个引擎响应，返回格式完全一致。你的代码永远不用改。

---

## 工作原理

```
                    你的应用
                       │
                       ▼
              ┌─────────────────┐
              │  RealtimeSearch  │
              │    :8787         │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │   Token Leaky   │
              │   Bucket (TLB)  │
              │                 │
              │  Serper  ●●●○○  │ ← 3/5 令牌，可用
              │  Brave   ●●●●○  │ ← 4/5 令牌，优先
              │  Bing    ○○○○○  │ ← 0/5 令牌，跳过
              └────────┬────────┘
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
         Serper     Brave       Bing
                       │
                  失败了？
                  自动重试下一个 ↻
```

**TLB（令牌漏桶）** 实时追踪每个引擎的可用容量。每个请求被路由到余量最大的引擎。如果失败，下一个引擎立刻接管 — 你的客户端只会收到一个快速响应，而不是重试风暴。

---

## 功能特性

<table>
<tr>
<td width="50%">

**搜索网关**
- Serper (Google)、Brave、Bing 开箱即用
- 跨引擎统一返回格式
- 可插拔：放一个 `.ts` 文件即可添加新引擎

</td>
<td width="50%">

**高可用**
- TLB：基于令牌的限流 + 自动故障转移
- 轮询负载均衡 + Key 轮换
- 运行时热切换引擎，无需重启

</td>
</tr>
<tr>
<td>

**可观测**
- Prometheus 指标端点
- 可选 ClickHouse 数据分析
- Web 面板实时监控引擎状态

</td>
<td>

**安全**
- JWT + API Token 认证，支持 RBAC
- 首次启动引导向导（无硬编码凭证）
- 按用户管理 API Key

</td>
</tr>
</table>

---

## 添加自定义引擎

在 `engines/search/` 下放一个文件，搞定：

```typescript
// engines/search/myengine.ts
export const engine: Engine = {
  name: 'myengine',
  async search({ query, apiKey, limit }) {
    const res = await fetch('https://api.example.com/search', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit }),
      method: 'POST',
    });
    const data = await res.json();
    return {
      engine: 'myengine',
      results: data.items.map(r => ({ title: r.title, url: r.link, snippet: r.desc })),
    };
  },
};
```

在 `.env` 中添加 `MYENGINE_API_KEYS=...`，在 `SEARCH_ENGINES` 中加上 `myengine` — 热加载自动生效。

---

## SquadyAI 生态

RealtimeSearch 是 [SquadyAI RealtimeAPI](https://github.com/SquadyAI/RealtimeAPI) 语音 AI 平台的**搜索基座**：

| 项目 | 功能 | 链接 |
|------|------|------|
| **RealtimeAPI** | 核心语音 AI 引擎 — Rust 实现的 ASR→LLM→TTS 管线编排，端到端 &lt;450 ms | [SquadyAI/RealtimeAPI](https://github.com/SquadyAI/RealtimeAPI) |
| **RealtimeIntent** | 意图分类 — 向量搜索 + 神经重排序，&lt;100 ms | [SquadyAI/RealtimeIntent](https://github.com/SquadyAI/RealtimeIntent) |
| **RealtimeSearch** | 多引擎搜索网关，自动故障转移 | *当前项目* |

```
┌─────────────────────────────────── RealtimeAPI ───────────────────────────────────┐
│                                                                                   │
│   音频 ──▶ VAD ──▶ ASR ──▶ RealtimeIntent ──▶ LLM ──▶ TTS ──▶ 音频              │
│                                                  │                                │
│                                           ┌──────▼──────────────┐                 │
│                                           │ ★ RealtimeSearch    │                 │
│                                           │   联网搜索工具       │                 │
│                                           └─────────────────────┘                 │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**RealtimeSearch 完全可以独立使用**，但如果你在做语音 Agent、对话式 AI，或者任何需要实时联网的系统 — [看看 RealtimeAPI](https://github.com/SquadyAI/RealtimeAPI)。

---

<details>
<summary><strong>手动部署（不用 Docker）</strong></summary>

```bash
# 前置条件：Node.js 22+、Yarn、PostgreSQL
yarn install
cp .env.example .env
# 编辑 .env：填入 API Key + 设置 DATABASE_URL

yarn prisma:generate
yarn build && yarn dev
```

</details>

<details>
<summary><strong>配置参考</strong></summary>

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8787` | 后端服务端口 |
| `DATABASE_URL` | — | PostgreSQL 连接字符串（Docker 下自动配置） |
| `SEARCH_ENGINES` | `serper,brave,bing` | 启用的搜索引擎（逗号分隔） |
| `{ENGINE}_API_KEYS` | — | API Key（逗号分隔可配置 Key 池） |
| `AUTH_JWT_SECRET` | — | JWT 签名密钥（**生产环境务必修改**） |
| `TLB_ENABLED` | `true` | 启用令牌漏桶 |
| `TLB_DEFAULT_RPS` | `20` | 每个引擎每秒请求数限制 |
| `TLB_MAX_RETRIES` | `3` | 跨引擎最大重试次数 |
| `REDIS_URL` | — | 可选：Redis 结果缓存 |
| `CLICKHOUSE_URL` | — | 可选：ClickHouse 数据分析 |

完整配置见 [.env.example](.env.example)。

</details>

<details>
<summary><strong>API 文档</strong></summary>

除特别标注外，所有接口需要认证（JWT 或 API Token）。

```bash
# 搜索
POST /v1/search            { "query": "...", "limit": 10, "locale": "zh-CN" }

# 认证
POST /v1/auth/register     { "username": "...", "password": "..." }
POST /v1/auth/login        { "username": "...", "password": "..." }

# 监控（公开）
GET  /healthz
GET  /metrics

# 引擎管理
GET  /v1/engines/list
GET  /v1/tlb/status
```

API Token 管理详见 [API_TOKEN_README.md](API_TOKEN_README.md)。

</details>

<details>
<summary><strong>项目结构</strong></summary>

```
RealtimeSearch/
├── apps/
│   ├── backend/              # Fastify API 服务
│   │   ├── engines/
│   │   │   └── search/       # 引擎插件（serper、brave、bing……）
│   │   ├── src/
│   │   │   ├── server.ts     # 服务启动、认证、引擎加载
│   │   │   ├── engines/      # TLB、路由、故障转移逻辑
│   │   │   ├── http/routes/  # API 路由处理
│   │   │   └── metrics/      # Prometheus 指标
│   │   └── prisma/           # 数据库 Schema & 迁移
│   └── web/                  # React 管理面板（Vite）
├── docker-compose.yml        # 一键部署（含 PostgreSQL）
├── Dockerfile.backend
└── Dockerfile.frontend
```

</details>

---

## 参与贡献

欢迎 PR。发现 Bug 或想添加新引擎，请 [提 Issue](https://github.com/SquadyAI/RealtimeSearch/issues) 或直接提交 Pull Request。

## 许可证

[Apache License 2.0](LICENSE) — 可商用。
