#!/usr/bin/env python3
"""
认证工具测试脚本
验证认证工具模块是否正常工作
"""

import sys
import os

# 添加当前目录到Python路径，以便导入auth_utils模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from auth_utils import get_auth_headers, is_authenticated, print_auth_status, auth_utils

def test_auth_utils():
    """测试认证工具模块"""
    print("认证工具模块测试")
    print("=" * 50)
    
    # 测试认证状态
    print("1. 测试认证状态")
    print("-" * 30)
    print_auth_status()
    
    # 测试获取认证头
    print("\n2. 测试获取认证头")
    print("-" * 30)
    headers = get_auth_headers()
    if headers:
        print("✅ 成功获取认证头:")
        for key, value in headers.items():
            print(f"  {key}: {value}")
    else:
        print("⚠️  未获取到认证头")
    
    # 测试认证检查
    print("\n3. 测试认证检查")
    print("-" * 30)
    if is_authenticated():
        print("✅ 已认证")
    else:
        print("⚠️  未认证")
    
    # 测试token信息
    print("\n4. 测试token信息")
    print("-" * 30)
    token_info = auth_utils.get_token_info()
    print(f"认证状态: {token_info['authenticated']}")
    print(f"Token预览: {token_info['token']}")
    
    print("\n5. 测试结果总结")
    print("-" * 30)
    if is_authenticated():
        print("✅ 认证工具模块工作正常")
        print("✅ 可以正常读取.env文件")
        print("✅ 可以正常获取认证头")
    else:
        print("⚠️  认证工具模块工作正常，但未设置token")
        print("💡 请在.env文件中设置TEST_TOKEN")

if __name__ == "__main__":
    test_auth_utils()
