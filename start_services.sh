#!/bin/bash

# SearchAPI 服务启动脚本

set -e

echo "🚀 启动 SearchAPI 服务"
echo "================================"

# 检查Node.js版本
echo "📋 检查环境..."
node_version=$(node --version 2>/dev/null || echo "未安装")
echo "Node.js版本: $node_version"

if [[ ! "$node_version" =~ ^v2[2-9] ]]; then
    echo "⚠️  警告: 建议使用Node.js 22+版本"
fi

# 检查Yarn
yarn_version=$(yarn --version 2>/dev/null || echo "未安装")
echo "Yarn版本: $yarn_version"

# 检查环境文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到.env文件，创建默认配置..."
    cat > .env << 'EOF'
# 基础配置
PORT=8787
HOST=0.0.0.0

# 搜索引擎配置
SEARCH_ENGINES=serper,brave,bing

# 翻译引擎配置
TRANSLATE_ENGINES=squady,google,deepl

# API 密钥配置 (请替换为你的实际API密钥)
SERPER_API_KEYS=your_serper_key_here
BRAVE_API_KEYS=your_brave_key_here
BING_API_KEYS=your_bing_key_here
SQUADY_API_KEYS=your_squady_key_here
GOOGLE_API_KEYS=your_google_key_here
DEEPL_API_KEYS=your_deepl_key_here

# 认证配置
AUTH_JWT_SECRET=your-secret-key-change-this-in-production
AUTH_ALLOW_SIGNUP=true
AUTH_REQUIRE_LOGIN=true

# 其他配置
MAX_ITEMS=10
REQUEST_TIMEOUT_MS=12000
EOF
    echo "✅ 已创建默认.env文件，请根据需要修改API密钥"
fi

# 安装依赖
echo "📦 安装依赖..."
yarn install

# 生成Prisma客户端
echo "🗄️  生成Prisma客户端..."
yarn prisma:generate

# 构建项目
echo "🔨 构建项目..."
yarn build

# 启动服务
echo "🎯 启动服务..."
echo "前端地址: http://localhost:5173"
echo "后端地址: http://localhost:8787"
echo "健康检查: http://localhost:8787/healthz"
echo ""
echo "按 Ctrl+C 停止服务"
echo "================================"

# 启动开发服务
yarn dev
