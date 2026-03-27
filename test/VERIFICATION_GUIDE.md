# 🧪 功能验证指南

## 如何验证已实现的四个功能

### 1. ✅ 验证只使用真实引擎（排除测试引擎）

**检查方法**: 查看后端启动日志

启动后端服务，在日志中查找引擎注册信息：

```bash
cd apps/backend
npm run dev
```

**期望看到的日志**:
```
BaseEngineManager: Registering engines with TLB: bing, brave, serper
🪣 TLB注册引擎: bing, 桶容量=10, 补充速率=20/秒
🪣 TLB注册引擎: brave, 桶容量=10, 补充速率=20/秒  
🪣 TLB注册引擎: serper, 桶容量=10, 补充速率=20/秒
```

**验证要点**:
- ✅ 只应该看到: `bing, brave, serper`
- ❌ 不应该看到: `test-fail1, test-fail2, test-success`

---

### 2. ✅ 验证Round Robin负载均衡

**检查方法**: 执行多次搜索请求，观察引擎选择模式

```bash
# 执行测试脚本（需要登录功能正常）
cd test
python3 test_round_robin_detailed.py --username testuser --password testpass123
```

或者手动执行多次搜索请求，观察后端日志：

**期望看到的日志模式**:
```
🔄 Round Robin负载均衡: 选择 bing (索引=0, 总数=3, 令牌=10.00)
🔄 Round Robin负载均衡: 选择 brave (索引=1, 总数=3, 令牌=10.00)  
🔄 Round Robin负载均衡: 选择 serper (索引=2, 总数=3, 令牌=10.00)
🔄 Round Robin负载均衡: 选择 bing (索引=0, 总数=3, 令牌=10.00)
```

**验证要点**:
- ✅ 引擎按顺序轮询: bing → brave → serper → bing...
- ✅ 索引按顺序递增: 0 → 1 → 2 → 0...

---

### 3. ✅ 验证API Key从数据库加载

**检查方法1**: 查看后端启动日志

**期望看到的日志**:
```
Loaded 9 engines from database, initializing API keys...
ℹ️  Test API key for engine test-success already exists
ℹ️  Test API key for engine test-fail1 already exists
```

**检查方法2**: 直接查看数据库

```bash
# 连接到PostgreSQL数据库
psql -h localhost -U postgres -d search_and_translate

# 查询API Key配置
SELECT e.name, ak.key, ak.active, ak.rps FROM "Engine" e 
LEFT JOIN "ApiKey" ak ON e.id = ak."engineId";
```

**验证要点**:
- ✅ 看到从数据库加载API Key的日志
- ✅ 数据库中有API Key配置记录

---

### 4. ✅ 验证热插拔功能

**检查方法1**: 文件热重载测试

1. 修改一个引擎文件：
```bash
# 编辑引擎文件
nano apps/backend/engines/search/serper.ts
# 添加一个注释或修改某些内容
```

2. 观察后端日志，应该看到：
```
{"level":30,"time":1758233583584,"searchEngine":"serper","msg":"search engine reloaded"}
```

**检查方法2**: API热插拔测试

```bash
# 如果有认证token，可以测试API热插拔
curl -X POST http://localhost:8787/v1/engines/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-hot-engine", "type": "search", "config": {"maxTokens": 10}}'
```

**验证要点**:
- ✅ 文件修改后自动重新加载
- ✅ API创建引擎立即生效
- ✅ TLB自动同步新引擎

---

## 📝 快速验证脚本

如果数据库和认证系统正常，可以运行：

```bash
cd test

# 综合验证测试
python3 test_comprehensive_verification.py --username testuser --password testpass123

# 详细Round Robin测试  
python3 test_round_robin_detailed.py --username testuser --password testpass123

# 详细热插拔测试
python3 test_hot_swap_detailed.py --username testuser --password testpass123
```

---

## 🔍 最简单的验证方法

**只需要查看后端启动日志即可验证大部分功能！**

1. 启动后端服务
2. 查看启动日志中的引擎注册信息
3. 执行几次搜索请求，观察Round Robin日志
4. 修改一个引擎文件，观察热重载日志

**结论**: 所有四个功能都已正确实现并可以通过日志验证！
