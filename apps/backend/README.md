# SearchAPI 后端服务

## 🔌 API 接口

**基础URL**: `http://localhost:8787` 或 `http://your-domain:8787`

### 🔐 认证说明

> **重要**: 除健康检查接口外，所有API接口都需要JWT认证。请在请求头中添加 `Authorization: Bearer <token>`。

### 🔑 API密钥管理

> **重要**: 所有搜索引擎和翻译引擎的API密钥都存储在数据库中，通过管理界面进行配置。环境变量中的API密钥仅用于初始化时自动创建数据库记录，实际运行时不会使用环境变量中的密钥。

#### 用户登录
```markdown
POST http://localhost:8787/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "123456"
}
```

#### 用户注册
```markdown
POST http://localhost:8787/v1/auth/signup
Content-Type: application/json

{
  "username": "newuser",
  "password": "password"
}
```

#### 认证状态检查
```markdown
GET http://localhost:8787/v1/auth/bootstrap-status
```

### 🔍 搜索 API

#### 基础搜索
```markdown
POST http://localhost:8787/v1/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "搜索关键词"
}
```

**请求参数说明**

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `query` | string | ✅ **必需** | - | 搜索关键词，不能为空 |
| `limit` | number | ❌ 可选 | 配置最大值 | 结果数量限制 |
| `locale` | string | ❌ 可选 | - | 搜索语言，如 "zh", "en", "ja" |
| `safesearch` | string | ❌ 可选 | "moderate" | 安全搜索模式 |
| `freshness` | string | ❌ 可选 | - | 结果新鲜度 |
| `routingKey` | string | ❌ 可选 | - | 路由键，用于引擎选择策略 |
| `httpProxy` | string | ❌ 可选 | - | HTTP代理地址 |

**注意**: 搜索引擎由TLB（Token Leaky Bucket）系统智能选择，不支持在请求中指定特定引擎。

**响应格式**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "title": "搜索结果标题",
        "url": "https://example.com",
        "snippet": "搜索结果摘要...",
        "engine": "serper"
      }
    ],
    "total": 1,
    "engines_used": ["serper"]
  },
  "_framework": {
    "requestId": "req_123",
    "endpoint": "/v1/search",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### 🌐 翻译 API

#### 同步翻译
```markdown
POST http://localhost:8787/v1/translate/sync
Authorization: Bearer <token>
Content-Type: application/json

{
  "q": "Hello World",
  "target": "zh"
}
```

**请求参数说明**

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `q` | string | ✅ **必需** | - | 待翻译文本，不能为空 |
| `target` | string | ✅ **必需** | - | 目标语言代码 |
| `source` | string | ❌ 可选 | 自动检测 | 源语言代码 |
| `format` | string | ❌ 可选 | "text" | 文本格式，"html" \| "text" |
| `model` | string | ❌ 可选 | "nmt" | 翻译模型 |
| `engines` | string[] | ❌ 可选 | 配置默认引擎 | 指定翻译引擎 |
| `routingKey` | string | ❌ 可选 | - | 路由键，用于引擎选择策略 |
| `httpProxy` | string | ❌ 可选 | - | HTTP代理地址 |

#### 流式翻译
```markdown
POST http://localhost:8787/v1/translate
Authorization: Bearer <token>
Content-Type: application/json

{
  "q": "Hello World",
  "target": "zh"
}
```

**请求参数说明**

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `q` | string | ✅ **必需** | - | 待翻译文本，不能为空 |
| `target` | string | ✅ **必需** | - | 目标语言代码 |
| `source` | string | ❌ 可选 | 自动检测 | 源语言代码 |
| `format` | string | ❌ 可选 | "text" | 文本格式，"html" \| "text" |
| `model` | string | ❌ 可选 | "squady" | 翻译模型 |
| `engines` | string[] | ❌ 可选 | 配置默认引擎 | 指定翻译引擎 |
| `routingKey` | string | ❌ 可选 | - | 路由键，用于引擎选择策略 |
| `httpProxy` | string | ❌ 可选 | - | HTTP代理地址 |

### 🛠️ 管理 API

#### 引擎状态
```markdown
GET http://localhost:8787/v1/engines/status
Authorization: Bearer <token>
```

**请求参数**: 无

**响应格式**
```json
{
  "search": {
    "serper": { 
      "name": "serper", 
      "type": "search", 
      "available": true, 
      "enabled": true, 
      "default": true, 
      "tlbSynced": true 
    }
  },
  "translate": {
    "google": { 
      "name": "google", 
      "type": "translate", 
      "available": true, 
      "enabled": true, 
      "default": true, 
      "tlbSynced": true 
    }
  }
}
```

#### TLB状态
```markdown
GET http://localhost:8787/v1/tlb/status
Authorization: Bearer <token>
```

**请求参数**: 无

**响应格式**
```json
{
  "search": {
    "enabled": true,
    "engines": {
      "serper": { "tokens": 20, "rps": 20, "lastRefill": "2024-01-01T00:00:00Z" }
    },
    "available": ["serper"]
  },
  "translate": {
    "enabled": true,
    "engines": {
      "google": { "tokens": 20, "rps": 20, "lastRefill": "2024-01-01T00:00:00Z" }
    },
    "available": ["google"]
  }
}
```

#### 健康检查
```markdown
GET http://localhost:8787/healthz
GET http://localhost:8787/readyz
```

**请求参数**: 无

**响应格式**
```json
{
  "ok": true
}
```

```json
{
  "ok": true,
  "checks": {
    "postgres": true,
    "clickhouse": false
  }
}
```
