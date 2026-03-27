# SearchAPI 测试文件

本文件夹包含 SearchAPI 项目的所有测试脚本和工具。

## 📁 文件结构

```
test/
├── README.md                    # 本说明文件
├── auth_utils.py               # 认证工具模块
├── test_auth_utils.py          # 认证工具测试
├── test_load_balancing.py      # 负载均衡测试
├── test_search.py              # 搜索功能测试
└── test_translate_stream.py    # 流式翻译测试
```

## 🧪 测试文件说明

### 核心测试文件

#### `test_search.py` - 搜索功能测试
**主要功能**：测试搜索API的各种功能
- ✅ 服务健康检查
- ✅ 用户认证（登录/注册）
- ✅ 引擎状态检查
- ✅ 基本搜索功能
- ✅ 指定引擎搜索
- ✅ 错误处理测试

**使用方法**：
```bash
# 基本搜索测试
python3 test_search.py --query "test" --username testuser --password testpass123

# 指定引擎搜索
python3 test_search.py --query "test" --engines serper --username testuser --password testpass123

# 查看帮助
python3 test_search.py --help
```

#### `test_load_balancing.py` - 负载均衡测试
**主要功能**：测试TLB令牌桶负载均衡和递归重试机制
- ✅ 多引擎负载均衡测试
- ✅ 故障转移测试
- ✅ 递归重试机制验证
- ✅ 令牌桶状态监控

**使用方法**：
```bash
# 负载均衡测试
python3 test_load_balancing.py --username testuser --password testpass123

# 故障转移测试
python3 test_load_balancing.py --test-failover --username testuser --password testpass123
```

#### `test_translate_stream.py` - 流式翻译测试
**主要功能**：测试流式翻译功能
- ✅ 流式翻译接口测试
- ✅ 翻译质量验证
- ✅ 错误处理测试

**使用方法**：
```bash
python3 test_translate_stream.py
```

### 工具文件

#### `auth_utils.py` - 认证工具模块
**主要功能**：提供认证相关的工具函数
- 🔑 从.env文件读取认证token
- 🔑 生成HTTP认证头
- 🔑 认证状态检查

#### `test_auth_utils.py` - 认证工具测试
**主要功能**：验证认证工具模块是否正常工作
- ✅ 认证工具功能测试
- ✅ 错误处理测试

**使用方法**：
```bash
python3 test_auth_utils.py
```

## 🚀 快速开始

### 1. 环境准备
确保后端服务正在运行：
```bash
# 启动后端服务
cd /path/to/RealtimeSearch
./start_services.sh
```

### 2. 配置认证
在项目根目录创建 `.env` 文件：
```bash
# 可选：设置测试token（用于某些测试）
TEST_TOKEN=your_test_token_here
```

### 3. 运行测试
```bash
# 进入测试目录
cd test

# 运行主要搜索测试
python3 test_search.py --query "test" --username testuser --password testpass123

# 运行负载均衡测试
python3 test_load_balancing.py --username testuser --password testpass123
```

## 🔍 测试覆盖范围

### 功能测试
- [x] 搜索API基本功能
- [x] 用户认证系统
- [x] 引擎状态管理
- [x] 负载均衡算法
- [x] 故障转移机制
- [x] 递归重试逻辑
- [x] 流式翻译功能

### 性能测试
- [x] TLB令牌桶负载均衡
- [x] 多引擎并发测试
- [x] 故障恢复时间测试

### 错误处理测试
- [x] 网络错误处理
- [x] 认证失败处理
- [x] 引擎故障处理
- [x] 限流处理

## 📊 测试结果示例

### 负载均衡测试结果
```
🧠 TLB引擎状态分析: bing(10.00令牌), brave(10.00令牌), serper(10.00令牌)
🔢 TLB负载均衡计算: 总令牌=30.00, 时间戳模值=15.00
🎲 TLB负载均衡结果: 选择 brave (累积=20.00, 令牌=10.00)
🎯 TLB负载均衡选择: brave (10.00令牌)
```

### 故障转移测试结果
```
🔍 搜索引擎故障转移: 第2次重试, 选择引擎 test-success, 已失败引擎 [test-fail2]
✅ 搜索引擎故障转移成功: 最终使用引擎 test-success, 失败引擎 [test-fail2], 总耗时 2316ms
```

## 🛠️ 开发说明

### 添加新测试
1. 在 `test/` 目录下创建新的测试文件
2. 使用 `auth_utils.py` 进行认证
3. 遵循现有的测试模式
4. 更新本README文件

### 测试最佳实践
- 使用描述性的测试名称
- 包含详细的日志输出
- 测试正常情况和异常情况
- 验证返回数据的完整性

## 📝 注意事项

1. **认证要求**：大部分测试需要有效的用户认证
2. **服务依赖**：测试需要后端服务正在运行
3. **环境变量**：某些测试可能需要 `.env` 文件中的配置
4. **网络连接**：测试需要网络连接来访问外部API

## 🔧 故障排除

### 常见问题

**Q: 测试失败，显示401认证错误**
A: 确保使用正确的用户名和密码，或者检查 `.env` 文件中的token配置

**Q: 连接被拒绝**
A: 确保后端服务正在运行，检查端口8787是否可用

**Q: 测试超时**
A: 检查网络连接，某些测试引擎可能需要更长的响应时间

### 调试技巧
- 查看后端控制台日志获取详细信息
- 使用 `--verbose` 参数获取更多输出
- 检查 `test_search.py` 中的详细日志输出

---

**最后更新**：2025-09-19
**版本**：v1.0.0
