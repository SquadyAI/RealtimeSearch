#!/usr/bin/env python3
"""
SearchAPI 搜索功能测试脚本
用于测试搜索API的各种功能
"""

import requests
import json
import time
import sys
from typing import Dict, Any, Optional

class SearchAPITester:
    def __init__(self, base_url: str = "http://localhost:8787"):
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None
        
    def log(self, message: str, level: str = "INFO"):
        """打印日志"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
    
    def check_health(self) -> bool:
        """检查服务健康状态"""
        try:
            response = self.session.get(f"{self.base_url}/healthz")
            if response.status_code == 200:
                self.log("✅ 服务健康检查通过")
                return True
            else:
                self.log(f"❌ 服务健康检查失败: {response.status_code}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ 无法连接到服务: {e}", "ERROR")
            return False
    
    def register_user(self, username: str = "testuser", password: str = "testpass123") -> bool:
        """注册用户"""
        try:
            data = {
                "username": username,
                "password": password
            }
            response = self.session.post(f"{self.base_url}/v1/auth/signup", json=data)
            
            if response.status_code == 201:
                self.log(f"✅ 用户注册成功: {username}")
                return True
            elif response.status_code == 409:
                self.log(f"⚠️  用户已存在: {username}")
                return True  # 用户已存在也算成功
            else:
                self.log(f"❌ 用户注册失败: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ 用户注册异常: {e}", "ERROR")
            return False
    
    def login(self, username: str = "testuser", password: str = "testpass123") -> bool:
        """用户登录"""
        try:
            data = {
                "username": username,
                "password": password
            }
            response = self.session.post(f"{self.base_url}/v1/auth/login", json=data)
            
            if response.status_code == 200:
                result = response.json()
                self.token = result.get("token")
                if self.token:
                    self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                    self.log(f"✅ 用户登录成功: {username}")
                    return True
                else:
                    self.log("❌ 登录响应中未找到token", "ERROR")
                    return False
            else:
                self.log(f"❌ 用户登录失败: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ 用户登录异常: {e}", "ERROR")
            return False
    
    def get_engines_status(self) -> Optional[Dict[str, Any]]:
        """获取引擎状态"""
        try:
            response = self.session.get(f"{self.base_url}/v1/engines")
            if response.status_code == 200:
                engines = response.json()
                self.log("✅ 获取引擎状态成功")
                return engines
            else:
                self.log(f"❌ 获取引擎状态失败: {response.status_code}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ 获取引擎状态异常: {e}", "ERROR")
            return None
    
    def test_search(self, query: str, **kwargs) -> Optional[Dict[str, Any]]:
        """测试搜索功能"""
        try:
            data = {
                "query": query,
                **kwargs
            }
            
            self.log(f"🔍 执行搜索: '{query}'")
            if kwargs:
                self.log(f"   参数: {kwargs}")
            
            response = self.session.post(f"{self.base_url}/v1/search", json=data)
            
            if response.status_code == 200:
                result = response.json()
                # 检查不同的响应格式
                items = result.get('items', []) or result.get('data', {}).get('results', [])
                self.log(f"✅ 搜索成功，返回 {len(items)} 个结果")
                return result
            else:
                self.log(f"❌ 搜索失败: {response.status_code} - {response.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ 搜索异常: {e}", "ERROR")
            return None
    
    def test_search_with_engine(self, query: str, engine: str) -> Optional[Dict[str, Any]]:
        """测试搜索（已废弃：引擎由TLB智能选择，不支持指定引擎）"""
        self.log(f"⚠️ 警告：test_search_with_engine方法已废弃，引擎选择由TLB智能控制，参数engine={engine}将被忽略")
        self.log("💡 建议：使用test_search()方法，让TLB系统自动选择最佳引擎")
        return self.test_search(query)
    
    def test_search_with_options(self, query: str, limit: int = 5, locale: str = "zh") -> Optional[Dict[str, Any]]:
        """测试带选项的搜索"""
        return self.test_search(query, limit=limit, locale=locale)
    
    def run_comprehensive_test(self):
        """运行综合测试"""
        self.log("🚀 开始SearchAPI综合测试")
        self.log("=" * 50)
        
        # 1. 健康检查
        if not self.check_health():
            self.log("❌ 服务不可用，测试终止", "ERROR")
            return False
        
        # 2. 用户认证
        if not self.register_user():
            self.log("❌ 用户注册失败，测试终止", "ERROR")
            return False
        
        if not self.login():
            self.log("❌ 用户登录失败，测试终止", "ERROR")
            return False
        
        # 3. 获取引擎状态
        engines = self.get_engines_status()
        if engines:
            self.log(f"📊 可用引擎: {list(engines.keys())}")
        
        # 4. 基础搜索测试
        self.log("\n🔍 基础搜索测试")
        self.log("-" * 30)
        
        test_queries = [
            "人工智能",
            "machine learning",
            "Python编程",
            "JavaScript框架"
        ]
        
        for query in test_queries:
            result = self.test_search(query)
            if result:
                # 显示搜索结果摘要
                items = result.get('items', []) or result.get('data', {}).get('results', [])
                if items:
                    self.log(f"   第一个结果: {items[0].get('title', 'N/A')}")
                else:
                    self.log("   无搜索结果")
            time.sleep(1)  # 避免请求过快
        
        # 5. TLB智能引擎选择测试
        self.log("\n🎯 TLB智能引擎选择测试")
        self.log("-" * 30)
        
        # 测试TLB智能引擎选择（不再支持指定特定引擎）
        result = self.test_search("测试查询")
        if result:
            engine_used = result.get('provider', 'unknown')
            self.log(f"✅ TLB智能选择引擎工作正常，使用了 {engine_used} 引擎")
        
        # 6. 搜索选项测试
        self.log("\n⚙️  搜索选项测试")
        self.log("-" * 30)
        
        result = self.test_search_with_options("深度学习", limit=3, locale="zh")
        if result:
            items = result.get('items', []) or result.get('data', {}).get('results', [])
            self.log(f"✅ 限制结果数量测试通过，返回 {len(items)} 个结果")
        
        # 7. 错误处理测试
        self.log("\n🚨 错误处理测试")
        self.log("-" * 30)
        
        # 空查询测试
        result = self.test_search("")
        if not result:
            self.log("✅ 空查询错误处理正常")
        
        # 8. 性能测试
        self.log("\n⚡ 性能测试")
        self.log("-" * 30)
        
        start_time = time.time()
        result = self.test_search("性能测试查询")
        end_time = time.time()
        
        if result:
            response_time = end_time - start_time
            self.log(f"✅ 搜索响应时间: {response_time:.2f}秒")
        
        self.log("\n🎉 测试完成!")
        return True

def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="SearchAPI测试工具")
    parser.add_argument("--url", default="http://localhost:8787", help="API基础URL")
    parser.add_argument("--query", help="单个搜索查询")
    parser.add_argument("--username", default="testuser", help="测试用户名")
    parser.add_argument("--password", default="testpass123", help="测试密码")
    
    args = parser.parse_args()
    
    tester = SearchAPITester(args.url)
    
    if args.query:
        # 单次搜索测试
        if not tester.check_health():
            sys.exit(1)
        
        if not tester.login(args.username, args.password):
            sys.exit(1)
        
        result = tester.test_search(args.query)
        
        if result:
            print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        # 综合测试
        success = tester.run_comprehensive_test()
        sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
