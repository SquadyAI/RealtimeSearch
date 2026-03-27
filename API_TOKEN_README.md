# API Token 管理功能

## 概述

系统现在支持API Token认证机制，允许用户创建具有不同权限级别的API Token，用于程序化访问系统API。

## 功能特性

### 🔐 权限分级
- **read**: 只读权限 - 可以访问GET请求和只读操作
- **write**: 读写权限 - 可以访问GET、POST、PUT、DELETE等大部分操作
- **admin**: 管理权限 - 可以访问所有管理功能和敏感操作

### 🕒 Token 管理
- 支持设置过期时间
- 自动跟踪最后使用时间
- 安全的随机Token生成
- Token唯一性保证

### 🔒 安全特性
- Token只在创建时显示一次
- 支持Token过期机制
- 自动更新最后使用时间
- 用户级别的Token隔离

## 使用方法

### 1. 创建API Token

1. 登录到Admin Dashboard
2. 找到"API Token 管理"部分
3. 点击"创建新Token"按钮
4. 填写Token信息：
   - **名称**: Token的描述性名称
   - **权限**: 选择合适的权限级别
   - **过期时间**: 可选，留空表示永不过期
5. 点击"创建Token"按钮
6. **重要**: 立即复制显示的完整Token值，关闭后将无法再次查看

### 2. 使用API Token

在HTTP请求中使用API Token：

```bash
# 在Authorization头部添加Token
curl -H "Authorization: Bearer rt_xxx" \
     https://your-api-domain.com/v1/engines/list
```

### 3. 管理API Token

- **查看Token列表**: 显示所有已创建的Token信息
- **复制Token前缀**: 复制Token的前缀用于识别
- **删除Token**: 永久删除不再使用的Token

## 权限说明

### Read 权限
- ✅ 查看引擎列表
- ✅ 获取引擎状态
- ✅ 查看统计信息
- ❌ 创建/修改引擎
- ❌ 管理API Keys
- ❌ 访问管理接口

### Write 权限
- ✅ 所有Read权限的功能
- ✅ 测试引擎
- ✅ 编译引擎代码
- ❌ 管理API Keys
- ❌ 访问敏感管理接口

### Admin 权限
- ✅ 所有Write权限的功能
- ✅ 管理API Keys
- ✅ 访问所有管理接口
- ✅ 系统配置管理

## 安全注意事项

1. **Token保管**: API Token等同于用户凭据，请妥善保管
2. **定期轮换**: 定期更换API Token，特别是在权限升级时
3. **最小权限原则**: 始终使用最低必要的权限级别
4. **过期设置**: 为临时使用的Token设置合理的过期时间
5. **监控使用**: 定期检查Token的使用情况，及时发现异常

## API 端点

### 创建API Token
```
POST /v1/admin/api-tokens/create
Content-Type: application/json
Authorization: Bearer <admin_jwt_token>

{
  "name": "My API Token",
  "permissions": "read|write|admin",
  "expiresAt": "2025-12-31T23:59:59Z" // 可选
}
```

### 列出API Tokens
```
GET /v1/admin/api-tokens/list
Authorization: Bearer <admin_jwt_token>
```

### 删除API Token
```
DELETE /v1/admin/api-tokens/:id
Authorization: Bearer <admin_jwt_token>
```

### 验证API Token
```
POST /v1/admin/api-tokens/verify
Content-Type: application/json

{
  "token": "rt_xxx"
}
```

## 数据库结构

```sql
-- API Tokens 表结构
CREATE TABLE ApiToken (
  id           TEXT PRIMARY KEY DEFAULT cuid(),
  userId       TEXT NOT NULL,
  name         TEXT NOT NULL,
  token        TEXT NOT NULL UNIQUE,
  permissions  TEXT NOT NULL, -- 'read' | 'write' | 'admin'
  expiresAt    DATETIME,
  lastUsedAt   DATETIME,
  createdAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    DATETIME NOT NULL,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);
```

## 故障排除

### Token无效
- 检查Token是否过期
- 确认Token前缀是否正确(rt_)
- 验证Token是否已被删除

### 权限不足
- 检查Token的权限级别
- 确认请求的端点是否需要更高权限
- 联系管理员升级Token权限

### 创建失败
- 确保Token名称不为空
- 检查数据库连接状态
- 确认用户具有创建Token的权限
