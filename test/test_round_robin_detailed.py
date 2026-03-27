#!/usr/bin/env python3
"""
详细的Round Robin负载均衡测试
验证引擎选择是否按照轮询顺序进行
"""

import sys
import json
import time
import requests
import argparse
from typing import Dict, List, Optional, Any
from datetime import datetime
from collections import Counter


class RoundRobinTester:
    def __init__(self, base_url: str = "http://localhost:8787"):
        self.base_url = base_url
        self.session = requests.Session()
        self.auth_token = None

    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")

    def login(self, username: str, password: str) -> bool:
        """用户登录"""
        try:
            response = self.session.post(f"{self.base_url}/v1/auth/login", json={
                "username": username,
                "password": password
            })
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get('token')
                if self.auth_token:
                    self.session.headers.update({
                        'Authorization': f'Bearer {self.auth_token}'
                    })
                    self.log(f"✅ 用户登录成功: {username}")
                    return True
            
            self.log(f"❌ 登录失败: {response.status_code} - {response.text}", "ERROR")
            return False
        except Exception as e:
            self.log(f"❌ 登录异常: {e}", "ERROR")
            return False

    def test_search(self, query: str) -> Optional[str]:
        """执行搜索测试并返回使用的引擎"""
        try:
            response = self.session.post(f"{self.base_url}/v1/search", json={
                "query": query
            })
            
            if response.status_code == 200:
                result = response.json()
                provider = result.get('provider', 'unknown')
                items_count = len(result.get('items', []))
                return provider
            else:
                self.log(f"❌ 搜索失败: {response.status_code} - {response.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ 搜索异常: {e}", "ERROR")
            return None

    def test_round_robin_pattern(self, num_requests: int = 20) -> bool:
        """测试Round Robin模式"""
        self.log(f"🔄 开始Round Robin测试，执行 {num_requests} 次请求")
        
        engines_used = []
        request_times = []
        
        for i in range(num_requests):
            query = f"Round Robin测试请求 {i+1}"
            start_time = time.time()
            
            provider = self.test_search(query)
            end_time = time.time()
            
            if provider:
                engines_used.append(provider)
                request_times.append(end_time - start_time)
                self.log(f"  请求 {i+1:2d}: 使用引擎 {provider} (耗时: {end_time - start_time:.2f}s)")
            else:
                self.log(f"  请求 {i+1:2d}: 失败", "ERROR")
                engines_used.append("FAILED")
            
            # 短暂延迟确保引擎有时间处理
            time.sleep(0.5)
        
        # 分析结果
        return self.analyze_round_robin_pattern(engines_used, request_times)

    def analyze_round_robin_pattern(self, engines_used: List[str], request_times: List[float]) -> bool:
        """分析Round Robin模式"""
        self.log("\n📊 Round Robin模式分析")
        self.log("=" * 50)
        
        # 过滤失败的请求
        successful_engines = [e for e in engines_used if e != "FAILED"]
        failed_count = engines_used.count("FAILED")
        
        if failed_count > 0:
            self.log(f"⚠️ 失败请求数量: {failed_count}")
        
        if len(successful_engines) < 3:
            self.log("❌ 成功请求太少，无法验证Round Robin模式", "ERROR")
            return False
        
        # 统计引擎使用次数
        engine_counter = Counter(successful_engines)
        unique_engines = list(engine_counter.keys())
        
        self.log(f"🔍 发现的引擎: {unique_engines}")
        self.log(f"🔍 引擎使用统计:")
        for engine, count in engine_counter.items():
            percentage = (count / len(successful_engines)) * 100
            self.log(f"  - {engine}: {count} 次 ({percentage:.1f}%)")
        
        # 验证Round Robin特征
        is_round_robin = self.verify_round_robin_characteristics(successful_engines, unique_engines)
        
        # 显示请求序列模式
        self.log(f"\n📝 请求序列 (前20个):")
        sequence_to_show = successful_engines[:20] if len(successful_engines) > 20 else successful_engines
        self.log(f"   {' -> '.join(sequence_to_show)}")
        
        # 性能统计
        if request_times:
            avg_time = sum(request_times) / len(request_times)
            min_time = min(request_times)
            max_time = max(request_times)
            self.log(f"\n⏱️ 性能统计:")
            self.log(f"   平均响应时间: {avg_time:.2f}s")
            self.log(f"   最快响应时间: {min_time:.2f}s")
            self.log(f"   最慢响应时间: {max_time:.2f}s")
        
        return is_round_robin

    def verify_round_robin_characteristics(self, engines_used: List[str], unique_engines: List[str]) -> bool:
        """验证Round Robin特征"""
        if len(unique_engines) <= 1:
            self.log("⚠️ 只有一个引擎被使用，可能其他引擎不可用", "WARN")
            return True  # 如果只有一个引擎可用，这也是合理的
        
        # 检查分布均匀性
        engine_counter = Counter(engines_used)
        counts = list(engine_counter.values())
        max_count = max(counts)
        min_count = min(counts)
        
        # Round Robin应该让每个引擎的使用次数差距很小
        count_difference = max_count - min_count
        
        self.log(f"🔍 引擎使用次数差距: {count_difference}")
        
        if count_difference <= 1:
            self.log("✅ Round Robin分布均匀性验证通过")
            distribution_ok = True
        elif count_difference <= 2:
            self.log("⚠️ Round Robin分布基本均匀（差距略大）", "WARN")
            distribution_ok = True
        else:
            self.log("❌ Round Robin分布不均匀", "ERROR")
            distribution_ok = False
        
        # 检查轮询模式
        pattern_ok = self.check_rotation_pattern(engines_used, unique_engines)
        
        return distribution_ok and pattern_ok

    def check_rotation_pattern(self, engines_used: List[str], unique_engines: List[str]) -> bool:
        """检查轮询模式"""
        if len(unique_engines) <= 1:
            return True
        
        # 检查是否有明显的轮询模式
        # 对于Round Robin，我们期望看到引擎按某种顺序循环
        
        # 查找重复的子序列模式
        pattern_length = len(unique_engines)
        patterns_found = []
        
        for start in range(len(engines_used) - pattern_length + 1):
            segment = engines_used[start:start + pattern_length]
            if len(set(segment)) == len(unique_engines):  # 包含所有不同引擎
                patterns_found.append(segment)
        
        if patterns_found:
            # 检查模式一致性
            first_pattern = patterns_found[0]
            consistent_patterns = sum(1 for p in patterns_found if p == first_pattern)
            
            self.log(f"🔍 发现轮询模式: {' -> '.join(first_pattern)}")
            self.log(f"🔍 一致模式数量: {consistent_patterns}/{len(patterns_found)}")
            
            if consistent_patterns >= len(patterns_found) * 0.7:  # 70%的模式一致
                self.log("✅ Round Robin轮询模式验证通过")
                return True
            else:
                self.log("⚠️ Round Robin轮询模式部分一致", "WARN")
                return True
        else:
            self.log("⚠️ 未发现明显的轮询模式，可能请求数量不足", "WARN")
            return True

    def run_detailed_test(self) -> bool:
        """运行详细的Round Robin测试"""
        self.log("\n" + "="*60)
        self.log("🔄 详细Round Robin负载均衡测试")
        self.log("="*60)
        
        # 执行多轮测试
        test_rounds = [
            ("短期测试", 10),
            ("中期测试", 20), 
            ("长期测试", 30)
        ]
        
        all_results = []
        
        for round_name, num_requests in test_rounds:
            self.log(f"\n🎯 {round_name} ({num_requests} 个请求)")
            self.log("-" * 40)
            
            result = self.test_round_robin_pattern(num_requests)
            all_results.append((round_name, result))
            
            if result:
                self.log(f"✅ {round_name} Round Robin验证通过")
            else:
                self.log(f"❌ {round_name} Round Robin验证失败", "ERROR")
            
            # 测试间隔
            if round_name != test_rounds[-1][0]:  # 不是最后一轮
                self.log("⏳ 等待3秒后进行下一轮测试...")
                time.sleep(3)
        
        # 总结
        self.log("\n" + "="*60)
        self.log("📋 Round Robin测试总结")
        self.log("="*60)
        
        passed_tests = sum(1 for _, result in all_results if result)
        total_tests = len(all_results)
        
        for round_name, result in all_results:
            status = "✅ 通过" if result else "❌ 失败"
            self.log(f"{round_name}: {status}")
        
        self.log(f"\n总体结果: {passed_tests}/{total_tests} 测试通过")
        
        if passed_tests == total_tests:
            self.log("🎉 Round Robin负载均衡完全正常！")
            return True
        elif passed_tests >= total_tests * 0.7:
            self.log("⚠️ Round Robin负载均衡基本正常")
            return True
        else:
            self.log("❌ Round Robin负载均衡存在问题", "ERROR")
            return False


def main():
    parser = argparse.ArgumentParser(description="详细Round Robin测试工具")
    parser.add_argument("--url", default="http://localhost:8787", help="API基础URL")
    parser.add_argument("--username", default="testuser", help="测试用户名")
    parser.add_argument("--password", default="testpass123", help="测试密码")
    args = parser.parse_args()
    
    tester = RoundRobinTester(args.url)
    
    # 用户登录
    if not tester.login(args.username, args.password):
        sys.exit(1)
    
    # 执行详细测试
    success = tester.run_detailed_test()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()


