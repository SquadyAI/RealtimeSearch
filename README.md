<h1 align="center">RealtimeSearch</h1>

<p align="center">
  <img src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <a href="https://github.com/SquadyAI/RealtimeSearch/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge" alt="PRs Welcome"></a>
</p>

<p align="center">
  <strong>One API. Every search engine. Zero downtime.</strong><br>
  Stop writing glue code for Serper, Brave, and Bing.<br>
  Add your API keys, hit one endpoint, and let failover happen automatically.
</p>

<p align="center">
  <a href="#get-started-in-60-seconds">Get Started</a> &ensp;|&ensp;
  <a href="#how-it-works">How It Works</a> &ensp;|&ensp;
  <a href="#add-your-own-engine">Extend</a> &ensp;|&ensp;
  <a href="README_CN.md">中文文档</a>
</p>

<p align="center">
  <sub>Search backbone of <a href="https://github.com/SquadyAI/RealtimeAPI"><strong>SquadyAI RealtimeAPI</strong></a> — the open-source voice AI platform with sub-450ms latency.</sub>
</p>

<!-- TODO: replace with actual screenshot
<p align="center">
  <img src="docs/dashboard.png" alt="RealtimeSearch Dashboard" width="720">
</p>
-->

---

## The Problem

You're building an AI agent. It needs web search. Here's what happens next:

```
Monday:     "Serper works great!" → ship it
Tuesday:    Serper rate-limited → add Brave as fallback → rewrite half the code
Wednesday:  Need Bing too → three API formats, three error handlers, three retry loops
Thursday:   Key rotation? Load balancing? Monitoring? → spaghetti
Friday:     Production goes down at 3am because one provider changed their API → pain
```

**RealtimeSearch exists so you never have this week.**

| | Without RealtimeSearch | With RealtimeSearch |
|---|---|---|
| **Provider goes down** | Your app breaks | Auto-failover in ~0ms |
| **Rate limited** | 429 errors, lost requests | Routes to engine with available quota |
| **Multiple API keys** | Manual rotation logic | Built-in key pool with round-robin |
| **Switch providers** | Rewrite integration code | Change one env var, zero code change |
| **Visibility** | Scattered across dashboards | Single Prometheus endpoint + web UI |

---

## Get Started in 60 Seconds

```bash
git clone https://github.com/SquadyAI/RealtimeSearch.git && cd RealtimeSearch
cp .env.example .env        # add at least one API key
docker compose up -d         # PostgreSQL included
```

Open **http://localhost:5173** → create your admin account → search.

### Get Your API Keys (free)

You need **at least one**. Add all three for ~5,500 free queries/month with automatic failover:

| Engine | Free Tier | Get Key |
|--------|-----------|---------|
| **Serper** | 2,500 queries/mo | [serper.dev](https://serper.dev) |
| **Brave** | 2,000 queries/mo | [brave.com/search/api](https://brave.com/search/api) |
| **Bing** | 1,000 queries/mo | [microsoft.com](https://www.microsoft.com/en-us/bing/apis/bing-web-search-api) |

---

## API Example

```bash
curl -X POST http://localhost:8787/v1/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "latest AI research", "limit": 10}'
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

Same response schema no matter which engine served it. Your code never changes.

---

## How It Works

```
                    Your app
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
              │  Serper  ●●●○○  │ ← 3/5 tokens, good to go
              │  Brave   ●●●●○  │ ← 4/5 tokens, preferred
              │  Bing    ○○○○○  │ ← 0/5 tokens, skip
              └────────┬────────┘
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
         Serper     Brave       Bing
                       │
                 on failure?
                 retry next ↻
```

**TLB (Token Leaky Bucket)** tracks available capacity per engine in real time. Each request is routed to the engine with the most headroom. If it fails, the next engine picks up instantly — your client sees one fast response, not a retry storm.

---

## Features

<table>
<tr>
<td width="50%">

**Search Gateway**
- Serper (Google), Brave, Bing — out of the box
- Unified response format across all engines
- Pluggable: drop a `.ts` file to add any provider

</td>
<td width="50%">

**Reliability**
- TLB: token-based rate limiting with auto-failover
- Round-robin load balancing with key rotation
- Hot-swap engines at runtime — zero restart

</td>
</tr>
<tr>
<td>

**Observability**
- Prometheus metrics endpoint
- Optional ClickHouse analytics
- Web dashboard for engine monitoring

</td>
<td>

**Security**
- JWT + API token auth with RBAC
- First-run setup wizard (no hardcoded creds)
- Per-user API key management

</td>
</tr>
</table>

---

## Add Your Own Engine

Drop a file in `engines/search/`. That's it.

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

Add `MYENGINE_API_KEYS=...` to `.env`, add `myengine` to `SEARCH_ENGINES` — hot-reload picks it up automatically.

---

## The SquadyAI Ecosystem

RealtimeSearch is the **search backbone** of the [SquadyAI RealtimeAPI](https://github.com/SquadyAI/RealtimeAPI) voice AI platform:

| Project | What it does | Link |
|---------|-------------|------|
| **RealtimeAPI** | Core voice AI engine — ASR→LLM→TTS pipeline orchestration in Rust, &lt;450 ms E2E | [SquadyAI/RealtimeAPI](https://github.com/SquadyAI/RealtimeAPI) |
| **RealtimeIntent** | Intent classification — vector search + neural reranking, &lt;100 ms | [SquadyAI/RealtimeIntent](https://github.com/SquadyAI/RealtimeIntent) |
| **RealtimeSearch** | Multi-engine search gateway with automatic failover | *you are here* |

```
┌─────────────────────────────────── RealtimeAPI ───────────────────────────────────┐
│                                                                                   │
│   Audio ──▶ VAD ──▶ ASR ──▶ RealtimeIntent ──▶ LLM ──▶ TTS ──▶ Audio            │
│                                                  │                                │
│                                           ┌──────▼──────────────┐                 │
│                                           │ ★ RealtimeSearch    │                 │
│                                           │   web search tool   │                 │
│                                           └─────────────────────┘                 │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**RealtimeSearch works great standalone**, but if you're building voice agents, conversational AI, or anything that needs real-time web grounding — [check out RealtimeAPI](https://github.com/SquadyAI/RealtimeAPI).

---

<details>
<summary><strong>Manual Setup (without Docker)</strong></summary>

```bash
# Prerequisites: Node.js 22+, Yarn, PostgreSQL
yarn install
cp .env.example .env
# Edit .env: add API keys + set DATABASE_URL

yarn prisma:generate
yarn build && yarn dev
```

</details>

<details>
<summary><strong>Configuration Reference</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Backend server port |
| `DATABASE_URL` | — | PostgreSQL connection string (auto-set in Docker) |
| `SEARCH_ENGINES` | `serper,brave,bing` | Enabled search engines (comma-separated) |
| `{ENGINE}_API_KEYS` | — | API keys (comma-separated for key pools) |
| `AUTH_JWT_SECRET` | — | JWT signing secret (**change in production**) |
| `TLB_ENABLED` | `true` | Enable Token Leaky Bucket |
| `TLB_DEFAULT_RPS` | `20` | Requests-per-second limit per engine |
| `TLB_MAX_RETRIES` | `3` | Max failover attempts across engines |
| `REDIS_URL` | — | Optional: Redis for result caching |
| `CLICKHOUSE_URL` | — | Optional: ClickHouse for analytics |

See [.env.example](.env.example) for the full list.

</details>

<details>
<summary><strong>API Reference</strong></summary>

All endpoints require auth (JWT or API token) unless noted.

```bash
# Search
POST /v1/search            { "query": "...", "limit": 10, "locale": "en-US" }

# Auth
POST /v1/auth/register     { "username": "...", "password": "..." }
POST /v1/auth/login        { "username": "...", "password": "..." }

# Monitoring (public)
GET  /healthz
GET  /metrics

# Engine management
GET  /v1/engines/list
GET  /v1/tlb/status
```

See [API_TOKEN_README.md](API_TOKEN_README.md) for programmatic token management.

</details>

<details>
<summary><strong>Project Structure</strong></summary>

```
RealtimeSearch/
├── apps/
│   ├── backend/              # Fastify API server
│   │   ├── engines/
│   │   │   └── search/       # Engine plugins (serper, brave, bing, ...)
│   │   ├── src/
│   │   │   ├── server.ts     # Server setup, auth, engine loading
│   │   │   ├── engines/      # TLB, routing, failover logic
│   │   │   ├── http/routes/  # API route handlers
│   │   │   └── metrics/      # Prometheus metrics
│   │   └── prisma/           # Database schema & migrations
│   └── web/                  # React dashboard (Vite)
├── docker-compose.yml        # One-command deploy (incl. PostgreSQL)
├── Dockerfile.backend
└── Dockerfile.frontend
```

</details>

---

## Contributing

PRs welcome. If you find a bug or want to add a new engine, [open an issue](https://github.com/SquadyAI/RealtimeSearch/issues) or submit a pull request.

## License

[Apache License 2.0](LICENSE) — free for commercial use.
