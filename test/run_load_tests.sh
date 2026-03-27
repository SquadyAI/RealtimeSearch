#!/bin/bash
# SearchAPI 压测运行脚本
# 提供多种压测场景的快速启动

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认配置
BASE_URL="http://localhost:8787"
USERNAME="testuser"
PASSWORD="testpass123"

# 打印帮助信息
print_help() {
    echo -e "${BLUE}SearchAPI 压测工具${NC}"
    echo ""
    echo "用法: $0 [选项] [测试类型]"
    echo ""
    echo "测试类型:"
    echo "  basic       基础负载测试 (10用户, 10请求/用户)"
    echo "  medium      中等负载测试 (20用户, 20请求/用户)"
    echo "  heavy       高负载测试 (50用户, 30请求/用户)"
    echo "  tlb-burst   TLB突发压力测试 (50用户, 30秒)"
    echo "  tlb-sustained TLB持续压力测试 (20用户, 120秒)"
    echo "  custom      自定义测试参数"
    echo ""
    echo "选项:"
    echo "  --url URL           API基础URL (默认: $BASE_URL)"
    echo "  --username USER     测试用户名 (默认: $USERNAME)"
    echo "  --password PASS     测试密码 (默认: $PASSWORD)"
    echo "  --help              显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 basic"
    echo "  $0 tlb-burst --url http://localhost:8787"
    echo "  $0 custom --users 30 --requests 50"
}

# 检查依赖
check_dependencies() {
    echo -e "${BLUE}检查依赖...${NC}"
    
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ Python3 未安装${NC}"
        exit 1
    fi
    
    # 检查Python包
    python3 -c "import aiohttp, asyncio" 2>/dev/null || {
        echo -e "${YELLOW}⚠️  安装Python依赖包...${NC}"
        pip3 install aiohttp
    }
    
    echo -e "${GREEN}✅ 依赖检查完成${NC}"
}

# 检查服务状态
check_service() {
    echo -e "${BLUE}检查服务状态...${NC}"
    
    if curl -s "$BASE_URL/healthz" > /dev/null; then
        echo -e "${GREEN}✅ 服务运行正常${NC}"
    else
        echo -e "${RED}❌ 服务不可用，请确保服务已启动${NC}"
        echo "启动命令: cd apps/backend && npm start"
        exit 1
    fi
}

# 基础负载测试
run_basic_test() {
    echo -e "${BLUE}🚀 运行基础负载测试${NC}"
    echo "配置: 10用户, 10请求/用户, 1秒间隔"
    
    python3 test_load_performance.py \
        --url "$BASE_URL" \
        --username "$USERNAME" \
        --password "$PASSWORD" \
        --users 10 \
        --requests 10 \
        --interval 1.0
}

# 中等负载测试
run_medium_test() {
    echo -e "${BLUE}🚀 运行中等负载测试${NC}"
    echo "配置: 20用户, 20请求/用户, 0.5秒间隔"
    
    python3 test_load_performance.py \
        --url "$BASE_URL" \
        --username "$USERNAME" \
        --password "$PASSWORD" \
        --users 20 \
        --requests 20 \
        --interval 0.5
}

# 高负载测试
run_heavy_test() {
    echo -e "${BLUE}🚀 运行高负载测试${NC}"
    echo "配置: 50用户, 30请求/用户, 0.2秒间隔"
    
    python3 test_load_performance.py \
        --url "$BASE_URL" \
        --username "$USERNAME" \
        --password "$PASSWORD" \
        --users 50 \
        --requests 30 \
        --interval 0.2
}

# TLB突发压力测试
run_tlb_burst_test() {
    echo -e "${BLUE}🎯 运行TLB突发压力测试${NC}"
    echo "配置: 50用户, 30秒突发, 0.1秒间隔"
    
    python3 test_tlb_stress.py \
        --url "$BASE_URL" \
        --username "$USERNAME" \
        --password "$PASSWORD" \
        --burst-users 50 \
        --sustained-users 0 \
        --burst-duration 30 \
        --sustained-duration 0 \
        --interval 0.1
}

# TLB持续压力测试
run_tlb_sustained_test() {
    echo -e "${BLUE}🎯 运行TLB持续压力测试${NC}"
    echo "配置: 20用户, 120秒持续, 0.5秒间隔"
    
    python3 test_tlb_stress.py \
        --url "$BASE_URL" \
        --username "$USERNAME" \
        --password "$PASSWORD" \
        --burst-users 0 \
        --sustained-users 20 \
        --burst-duration 0 \
        --sustained-duration 120 \
        --interval 0.5
}

# 自定义测试
run_custom_test() {
    echo -e "${BLUE}🔧 运行自定义测试${NC}"
    
    # 默认参数
    USERS=20
    REQUESTS=20
    INTERVAL=1.0
    
    # 解析自定义参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --users)
                USERS="$2"
                shift 2
                ;;
            --requests)
                REQUESTS="$2"
                shift 2
                ;;
            --interval)
                INTERVAL="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    echo "配置: $USERS用户, $REQUESTS请求/用户, ${INTERVAL}秒间隔"
    
    python3 test_load_performance.py \
        --url "$BASE_URL" \
        --username "$USERNAME" \
        --password "$PASSWORD" \
        --users "$USERS" \
        --requests "$REQUESTS" \
        --interval "$INTERVAL"
}

# 主函数
main() {
    # 解析全局选项
    while [[ $# -gt 0 ]]; do
        case $1 in
            --url)
                BASE_URL="$2"
                shift 2
                ;;
            --username)
                USERNAME="$2"
                shift 2
                ;;
            --password)
                PASSWORD="$2"
                shift 2
                ;;
            --help)
                print_help
                exit 0
                ;;
            *)
                break
                ;;
        esac
    done
    
    # 检查参数
    if [[ $# -eq 0 ]]; then
        echo -e "${RED}❌ 请指定测试类型${NC}"
        print_help
        exit 1
    fi
    
    TEST_TYPE="$1"
    shift
    
    echo -e "${GREEN}🎯 SearchAPI 压测工具${NC}"
    echo -e "目标URL: ${BLUE}$BASE_URL${NC}"
    echo -e "测试用户: ${BLUE}$USERNAME${NC}"
    echo ""
    
    # 检查依赖和服务
    check_dependencies
    check_service
    
    echo ""
    
    # 运行对应测试
    case $TEST_TYPE in
        basic)
            run_basic_test
            ;;
        medium)
            run_medium_test
            ;;
        heavy)
            run_heavy_test
            ;;
        tlb-burst)
            run_tlb_burst_test
            ;;
        tlb-sustained)
            run_tlb_sustained_test
            ;;
        custom)
            run_custom_test "$@"
            ;;
        *)
            echo -e "${RED}❌ 未知的测试类型: $TEST_TYPE${NC}"
            print_help
            exit 1
            ;;
    esac
    
    echo ""
    echo -e "${GREEN}🎉 测试完成!${NC}"
}

# 运行主函数
main "$@"
