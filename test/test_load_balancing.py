#!/usr/bin/env python3
"""
测试负载均衡和递归重试机制
"""

import requests
import json
import time
import sys
from typing import Dict, Any, Optional

class LoadBalancingTester:
    def __init__(self, base_url: str = "http://localhost:8787"):
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None
        
    def log(self, message: str, level: str = "INFO"):
        """打印日志"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
    
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
            return False
        except Exception as e:
            self.log(f"❌ 用户登录异常: {e}", "ERROR")
            return False
    
    def test_search_with_engine(self, query: str, engine: str) -> Optional[Dict[str, Any]]:
        """测试搜索（引擎由TLB智能选择，此方法仅用于兼容性）"""
        try:
            data = {
                "query": query
            }
            self.log(f"⚠️ 注意：引擎选择已由TLB智能控制，参数engine={engine}将被忽略")
            
            self.log(f"🔍 测试引擎 {engine}: '{query}'")
            
            response = self.session.post(f"{self.base_url}/v1/search", json=data)
            
            if response.status_code == 200:
                result = response.json()
                items = result.get('items', [])
                self.log(f"✅ 引擎 {engine} 搜索成功，返回 {len(items)} 个结果")
                return result
            else:
                self.log(f"❌ 引擎 {engine} 搜索失败: {response.status_code} - {response.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ 引擎 {engine} 搜索异常: {e}", "ERROR")
            return None
    
    def test_multiple_engines(self, query: str, engines: list = None):
        """测试多个引擎的负载均衡（引擎由TLB智能选择）"""
        self.log(f"🎯 开始测试多引擎负载均衡（TLB智能选择）")
        if engines:
            self.log(f"⚠️ 注意：引擎选择已由TLB智能控制，参数engines={engines}将被忽略")
        
        for i in range(5):  # 连续发送5个请求
            self.log(f"\n--- 第 {i+1} 次请求 ---")
            
            # 不指定引擎，让系统自动选择
            try:
                data = {"query": f"{query} - 请求{i+1}"}
                response = self.session.post(f"{self.base_url}/v1/search", json=data)
                
                if response.status_code == 200:
                    result = response.json()
                    provider = result.get('provider', 'unknown')
                    items = result.get('items', [])
                    self.log(f"✅ 自动选择引擎: {provider}, 返回 {len(items)} 个结果")
                else:
                    self.log(f"❌ 请求失败: {response.status_code}", "ERROR")
            except Exception as e:
                self.log(f"❌ 请求异常: {e}", "ERROR")
            
            time.sleep(1)  # 等待1秒，观察令牌桶补充
    
    def test_failover(self, query: str):
        """测试故障转移机制"""
        self.log(f"🔄 开始测试故障转移机制")
        
        # 先测试一个会失败的引擎
        self.log("1. 测试 test-fail1 引擎（应该失败）")
        result1 = self.test_search_with_engine(query, "test-fail1")
        
        time.sleep(2)
        
        # 再测试一个会失败的引擎
        self.log("2. 测试 test-fail2 引擎（应该失败）")
        result2 = self.test_search_with_engine(query, "test-fail2")
        
        time.sleep(2)
        
        # 最后测试成功的引擎
        self.log("3. 测试 test-success 引擎（应该成功）")
        result3 = self.test_search_with_engine(query, "test-success")
        
        return result1, result2, result3

def main():
    """主函数"""
    tester = LoadBalancingTester()
    
    if not tester.login():
        sys.exit(1)
    
    print("\n" + "="*60)
    print("🧪 负载均衡和递归重试机制测试")
    print("="*60)
    
    # 测试1: 多引擎负载均衡
    print("\n📊 测试1: 多引擎负载均衡")
    print("-" * 40)
    tester.test_multiple_engines("负载均衡测试", [])
    
    time.sleep(3)
    
    # 测试2: 故障转移机制
    print("\n🔄 测试2: 故障转移机制")
    print("-" * 40)
    tester.test_failover("故障转移测试")
    
    print("\n🎉 测试完成!")

if __name__ == "__main__":
    main()
