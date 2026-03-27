#!/usr/bin/env python3
"""
SearchAPI 负载性能测试脚本
用于测试搜索API在高并发情况下的性能表现
"""

import asyncio
import aiohttp
import time
import json
import statistics
import argparse
import sys
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import threading

@dataclass
class TestResult:
    """测试结果数据类"""
    success: bool
    response_time: float
    status_code: int
    error_message: Optional[str] = None
    engine_used: Optional[str] = None
    result_count: int = 0

@dataclass
class LoadTestConfig:
    """负载测试配置"""
    base_url: str = "http://localhost:8787"
    username: str = "testuser"
    password: str = "testpass123"
    concurrent_users: int = 10
    requests_per_user: int = 10
    ramp_up_time: int = 5  # 秒
    test_duration: int = 60  # 秒
    request_interval: float = 1.0  # 秒
    timeout: int = 30  # 秒

class SearchAPILoadTester:
    def __init__(self, config: LoadTestConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.token: Optional[str] = None
        self.results: List[TestResult] = []
        self.results_lock = threading.Lock()
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        
        # 测试查询列表
        self.test_queries = [
            "人工智能发展趋势",
            "机器学习算法",
            "深度学习框架",
            "Python编程语言",
            "JavaScript前端开发",
            "React框架使用",
            "Node.js后端开发",
            "数据库设计原理",
            "微服务架构",
            "云计算技术",
            "区块链应用",
            "物联网技术",
            "大数据分析",
            "网络安全防护",
            "移动应用开发"
        ]
    
    def log(self, message: str, level: str = "INFO"):
        """打印日志"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
    
    async def create_session(self):
        """创建HTTP会话"""
        timeout = aiohttp.ClientTimeout(total=self.config.timeout)
        self.session = aiohttp.ClientSession(timeout=timeout)
    
    async def close_session(self):
        """关闭HTTP会话"""
        if self.session:
            await self.session.close()
    
    async def authenticate(self) -> bool:
        """用户认证"""
        try:
            # 先尝试注册用户
            register_data = {
                "username": self.config.username,
                "password": self.config.password
            }
            
            async with self.session.post(f"{self.config.base_url}/v1/auth/signup", json=register_data) as response:
                if response.status not in [201, 409]:  # 201=创建成功, 409=已存在
                    self.log(f"用户注册失败: {response.status}", "WARN")
            
            # 登录获取token
            login_data = {
                "username": self.config.username,
                "password": self.config.password
            }
            
            async with self.session.post(f"{self.config.base_url}/v1/auth/login", json=login_data) as response:
                if response.status == 200:
                    result = await response.json()
                    self.token = result.get("token")
                    if self.token:
                        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                        self.log("✅ 用户认证成功")
                        return True
                    else:
                        self.log("❌ 登录响应中未找到token", "ERROR")
                        return False
                else:
                    self.log(f"❌ 用户登录失败: {response.status}", "ERROR")
                    return False
        except Exception as e:
            self.log(f"❌ 认证异常: {e}", "ERROR")
            return False
    
    async def single_search_request(self, query: str) -> TestResult:
        """执行单次搜索请求"""
        start_time = time.time()
        
        try:
            data = {
                "query": query,
                "limit": 5,
                "locale": "zh"
            }
            
            async with self.session.post(f"{self.config.base_url}/v1/search", json=data) as response:
                end_time = time.time()
                response_time = end_time - start_time
                
                if response.status == 200:
                    result = await response.json()
                    items = result.get('items', []) or result.get('data', {}).get('results', [])
                    engine_used = result.get('provider', 'unknown')
                    
                    return TestResult(
                        success=True,
                        response_time=response_time,
                        status_code=response.status,
                        engine_used=engine_used,
                        result_count=len(items)
                    )
                else:
                    error_text = await response.text()
                    return TestResult(
                        success=False,
                        response_time=response_time,
                        status_code=response.status,
                        error_message=error_text
                    )
        except asyncio.TimeoutError:
            end_time = time.time()
            return TestResult(
                success=False,
                response_time=end_time - start_time,
                status_code=408,
                error_message="Request timeout"
            )
        except Exception as e:
            end_time = time.time()
            return TestResult(
                success=False,
                response_time=end_time - start_time,
                status_code=500,
                error_message=str(e)
            )
    
    def add_result(self, result: TestResult):
        """线程安全地添加测试结果"""
        with self.results_lock:
            self.results.append(result)
    
    async def user_simulation(self, user_id: int):
        """模拟单个用户的行为"""
        self.log(f"👤 用户 {user_id} 开始测试")
        
        for request_id in range(self.config.requests_per_user):
            # 选择查询
            query = self.test_queries[request_id % len(self.test_queries)]
            
            # 执行搜索请求
            result = await self.single_search_request(query)
            self.add_result(result)
            
            # 记录结果
            if result.success:
                self.log(f"✅ 用户{user_id} 请求{request_id+1}: {result.response_time:.2f}s, 引擎: {result.engine_used}")
            else:
                self.log(f"❌ 用户{user_id} 请求{request_id+1}: {result.status_code} - {result.error_message}", "ERROR")
            
            # 请求间隔
            if request_id < self.config.requests_per_user - 1:
                await asyncio.sleep(self.config.request_interval)
        
        self.log(f"👤 用户 {user_id} 完成测试")
    
    async def run_load_test(self):
        """运行负载测试"""
        self.log("🚀 开始负载性能测试")
        self.log("=" * 60)
        self.log(f"配置信息:")
        self.log(f"  并发用户数: {self.config.concurrent_users}")
        self.log(f"  每用户请求数: {self.config.requests_per_user}")
        self.log(f"  总请求数: {self.config.concurrent_users * self.config.requests_per_user}")
        self.log(f"  请求间隔: {self.config.request_interval}秒")
        self.log(f"  超时时间: {self.config.timeout}秒")
        self.log("=" * 60)
        
        # 创建会话
        await self.create_session()
        
        try:
            # 认证
            if not await self.authenticate():
                self.log("❌ 认证失败，测试终止", "ERROR")
                return False
            
            # 记录开始时间
            self.start_time = time.time()
            
            # 创建并发用户任务
            tasks = []
            for user_id in range(self.config.concurrent_users):
                # 错开用户启动时间，实现ramp-up
                delay = (user_id * self.config.ramp_up_time) / self.config.concurrent_users
                task = asyncio.create_task(self.delayed_user_simulation(user_id, delay))
                tasks.append(task)
            
            # 等待所有任务完成
            await asyncio.gather(*tasks)
            
            # 记录结束时间
            self.end_time = time.time()
            
            # 生成测试报告
            self.generate_report()
            
            return True
            
        finally:
            await self.close_session()
    
    async def delayed_user_simulation(self, user_id: int, delay: float):
        """延迟启动用户模拟"""
        if delay > 0:
            await asyncio.sleep(delay)
        await self.user_simulation(user_id)
    
    def generate_report(self):
        """生成测试报告"""
        if not self.results:
            self.log("❌ 没有测试结果", "ERROR")
            return
        
        total_requests = len(self.results)
        successful_requests = sum(1 for r in self.results if r.success)
        failed_requests = total_requests - successful_requests
        success_rate = (successful_requests / total_requests) * 100
        
        # 响应时间统计
        response_times = [r.response_time for r in self.results if r.success]
        if response_times:
            avg_response_time = statistics.mean(response_times)
            median_response_time = statistics.median(response_times)
            min_response_time = min(response_times)
            max_response_time = max(response_times)
            p95_response_time = statistics.quantiles(response_times, n=20)[18] if len(response_times) > 20 else max_response_time
            p99_response_time = statistics.quantiles(response_times, n=100)[98] if len(response_times) > 100 else max_response_time
        else:
            avg_response_time = median_response_time = min_response_time = max_response_time = p95_response_time = p99_response_time = 0
        
        # 吞吐量计算
        total_duration = self.end_time - self.start_time if self.end_time and self.start_time else 0
        throughput = successful_requests / total_duration if total_duration > 0 else 0
        
        # 引擎使用统计
        engine_usage = {}
        for result in self.results:
            if result.success and result.engine_used:
                engine_usage[result.engine_used] = engine_usage.get(result.engine_used, 0) + 1
        
        # 错误统计
        error_stats = {}
        for result in self.results:
            if not result.success:
                error_key = f"{result.status_code}: {result.error_message}"
                error_stats[error_key] = error_stats.get(error_key, 0) + 1
        
        # 打印报告
        self.log("\n" + "=" * 60)
        self.log("📊 负载测试报告")
        self.log("=" * 60)
        
        self.log(f"📈 总体统计:")
        self.log(f"  总请求数: {total_requests}")
        self.log(f"  成功请求数: {successful_requests}")
        self.log(f"  失败请求数: {failed_requests}")
        self.log(f"  成功率: {success_rate:.2f}%")
        self.log(f"  测试总时长: {total_duration:.2f}秒")
        self.log(f"  吞吐量: {throughput:.2f} 请求/秒")
        
        self.log(f"\n⏱️  响应时间统计:")
        self.log(f"  平均响应时间: {avg_response_time:.3f}秒")
        self.log(f"  中位数响应时间: {median_response_time:.3f}秒")
        self.log(f"  最小响应时间: {min_response_time:.3f}秒")
        self.log(f"  最大响应时间: {max_response_time:.3f}秒")
        self.log(f"  P95响应时间: {p95_response_time:.3f}秒")
        self.log(f"  P99响应时间: {p99_response_time:.3f}秒")
        
        if engine_usage:
            self.log(f"\n🔧 引擎使用统计:")
            for engine, count in sorted(engine_usage.items(), key=lambda x: x[1], reverse=True):
                percentage = (count / successful_requests) * 100
                self.log(f"  {engine}: {count}次 ({percentage:.1f}%)")
        
        if error_stats:
            self.log(f"\n❌ 错误统计:")
            for error, count in sorted(error_stats.items(), key=lambda x: x[1], reverse=True):
                percentage = (count / total_requests) * 100
                self.log(f"  {error}: {count}次 ({percentage:.1f}%)")
        
        # TLB性能分析
        self.log(f"\n🎯 TLB性能分析:")
        if engine_usage:
            # 检查负载均衡效果
            engine_counts = list(engine_usage.values())
            if len(engine_counts) > 1:
                balance_ratio = min(engine_counts) / max(engine_counts)
                self.log(f"  负载均衡比例: {balance_ratio:.2f} (1.0为完全均衡)")
                if balance_ratio > 0.8:
                    self.log("  ✅ 负载均衡效果良好")
                elif balance_ratio > 0.5:
                    self.log("  ⚠️  负载均衡效果一般")
                else:
                    self.log("  ❌ 负载均衡效果较差")
        
        # 限流分析
        if failed_requests > 0:
            rate_limit_errors = sum(1 for r in self.results if not r.success and "429" in str(r.status_code))
            if rate_limit_errors > 0:
                self.log(f"  限流触发次数: {rate_limit_errors}")
                self.log(f"  限流触发率: {(rate_limit_errors/total_requests)*100:.2f}%")
        
        self.log("=" * 60)
        self.log("🎉 测试完成!")

async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="SearchAPI负载性能测试工具")
    parser.add_argument("--url", default="http://localhost:8787", help="API基础URL")
    parser.add_argument("--users", type=int, default=10, help="并发用户数")
    parser.add_argument("--requests", type=int, default=10, help="每用户请求数")
    parser.add_argument("--interval", type=float, default=1.0, help="请求间隔(秒)")
    parser.add_argument("--timeout", type=int, default=30, help="请求超时(秒)")
    parser.add_argument("--ramp-up", type=int, default=5, help="用户启动间隔(秒)")
    parser.add_argument("--username", default="testuser", help="测试用户名")
    parser.add_argument("--password", default="testpass123", help="测试密码")
    
    args = parser.parse_args()
    
    config = LoadTestConfig(
        base_url=args.url,
        username=args.username,
        password=args.password,
        concurrent_users=args.users,
        requests_per_user=args.requests,
        request_interval=args.interval,
        timeout=args.timeout,
        ramp_up_time=args.ramp_up
    )
    
    tester = SearchAPILoadTester(config)
    
    try:
        success = await tester.run_load_test()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  测试被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 测试异常: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
