#!/usr/bin/env python3
"""
SearchAPI TLB (Token Leaky Bucket) 压力测试脚本
专门测试令牌桶限流机制在高并发下的表现
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
import threading
from collections import defaultdict

@dataclass
class TLBTestResult:
    """TLB测试结果"""
    timestamp: float
    success: bool
    response_time: float
    status_code: int
    engine_used: Optional[str] = None
    error_message: Optional[str] = None
    is_rate_limited: bool = False

@dataclass
class TLBTestConfig:
    """TLB测试配置"""
    base_url: str = "http://localhost:8787"
    username: str = "testuser"
    password: str = "testpass123"
    
    # 压力测试参数
    burst_users: int = 50  # 突发用户数
    sustained_users: int = 20  # 持续用户数
    burst_duration: int = 30  # 突发持续时间(秒)
    sustained_duration: int = 120  # 持续测试时间(秒)
    request_interval: float = 0.1  # 请求间隔(秒)
    timeout: int = 15  # 请求超时(秒)
    
    # TLB配置验证
    expected_rps: int = 20  # 期望的RPS
    expected_max_tokens: int = 10  # 期望的最大令牌数

class TLBStressTester:
    def __init__(self, config: TLBTestConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.token: Optional[str] = None
        self.results: List[TLBTestResult] = []
        self.results_lock = threading.Lock()
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.test_phase = "idle"  # idle, burst, sustained
        
        # 测试查询
        self.test_query = "TLB压力测试查询"
    
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
            # 注册用户
            register_data = {
                "username": self.config.username,
                "password": self.config.password
            }
            
            async with self.session.post(f"{self.config.base_url}/v1/auth/signup", json=register_data) as response:
                if response.status not in [201, 409]:
                    self.log(f"用户注册失败: {response.status}", "WARN")
            
            # 登录
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
    
    async def single_search_request(self) -> TLBTestResult:
        """执行单次搜索请求"""
        start_time = time.time()
        
        try:
            data = {
                "query": self.test_query,
                "limit": 3
            }
            
            async with self.session.post(f"{self.config.base_url}/v1/search", json=data) as response:
                end_time = time.time()
                response_time = end_time - start_time
                
                is_rate_limited = response.status == 429
                
                if response.status == 200:
                    result = await response.json()
                    engine_used = result.get('provider', 'unknown')
                    
                    return TLBTestResult(
                        timestamp=start_time,
                        success=True,
                        response_time=response_time,
                        status_code=response.status,
                        engine_used=engine_used,
                        is_rate_limited=False
                    )
                else:
                    error_text = await response.text()
                    return TLBTestResult(
                        timestamp=start_time,
                        success=False,
                        response_time=response_time,
                        status_code=response.status,
                        error_message=error_text,
                        is_rate_limited=is_rate_limited
                    )
        except asyncio.TimeoutError:
            end_time = time.time()
            return TLBTestResult(
                timestamp=start_time,
                success=False,
                response_time=end_time - start_time,
                status_code=408,
                error_message="Request timeout",
                is_rate_limited=False
            )
        except Exception as e:
            end_time = time.time()
            return TLBTestResult(
                timestamp=start_time,
                success=False,
                response_time=end_time - start_time,
                status_code=500,
                error_message=str(e),
                is_rate_limited=False
            )
    
    def add_result(self, result: TLBTestResult):
        """线程安全地添加测试结果"""
        with self.results_lock:
            self.results.append(result)
    
    async def burst_test_worker(self, worker_id: int):
        """突发测试工作线程"""
        self.log(f"🚀 突发测试工作线程 {worker_id} 启动")
        
        end_time = time.time() + self.config.burst_duration
        request_count = 0
        
        while time.time() < end_time:
            result = await self.single_search_request()
            self.add_result(result)
            request_count += 1
            
            # 记录关键结果
            if result.is_rate_limited:
                self.log(f"⚠️  工作线程{worker_id} 触发限流: {result.status_code}", "WARN")
            elif result.success:
                self.log(f"✅ 工作线程{worker_id} 请求成功: {result.response_time:.2f}s, 引擎: {result.engine_used}")
            else:
                self.log(f"❌ 工作线程{worker_id} 请求失败: {result.status_code}", "ERROR")
            
            # 短暂间隔
            await asyncio.sleep(self.config.request_interval)
        
        self.log(f"🏁 突发测试工作线程 {worker_id} 完成，共发送 {request_count} 个请求")
    
    async def sustained_test_worker(self, worker_id: int):
        """持续测试工作线程"""
        self.log(f"🔄 持续测试工作线程 {worker_id} 启动")
        
        end_time = time.time() + self.config.sustained_duration
        request_count = 0
        
        while time.time() < end_time:
            result = await self.single_search_request()
            self.add_result(result)
            request_count += 1
            
            # 记录关键结果
            if result.is_rate_limited:
                self.log(f"⚠️  工作线程{worker_id} 触发限流: {result.status_code}", "WARN")
            elif result.success:
                self.log(f"✅ 工作线程{worker_id} 请求成功: {result.response_time:.2f}s, 引擎: {result.engine_used}")
            
            # 请求间隔
            await asyncio.sleep(self.config.request_interval)
        
        self.log(f"🏁 持续测试工作线程 {worker_id} 完成，共发送 {request_count} 个请求")
    
    async def run_tlb_stress_test(self):
        """运行TLB压力测试"""
        self.log("🎯 开始TLB (Token Leaky Bucket) 压力测试")
        self.log("=" * 70)
        self.log(f"测试配置:")
        self.log(f"  突发用户数: {self.config.burst_users}")
        self.log(f"  持续用户数: {self.config.sustained_users}")
        self.log(f"  突发持续时间: {self.config.burst_duration}秒")
        self.log(f"  持续测试时间: {self.config.sustained_duration}秒")
        self.log(f"  请求间隔: {self.config.request_interval}秒")
        self.log(f"  期望RPS: {self.config.expected_rps}")
        self.log(f"  期望最大令牌数: {self.config.expected_max_tokens}")
        self.log("=" * 70)
        
        # 创建会话
        await self.create_session()
        
        try:
            # 认证
            if not await self.authenticate():
                self.log("❌ 认证失败，测试终止", "ERROR")
                return False
            
            # 记录开始时间
            self.start_time = time.time()
            
            # 阶段1: 突发测试
            self.log("\n🚀 阶段1: 突发压力测试")
            self.log("-" * 50)
            self.test_phase = "burst"
            
            burst_tasks = []
            for worker_id in range(self.config.burst_users):
                task = asyncio.create_task(self.burst_test_worker(worker_id))
                burst_tasks.append(task)
            
            await asyncio.gather(*burst_tasks)
            
            # 等待令牌桶恢复
            self.log("\n⏳ 等待令牌桶恢复...")
            await asyncio.sleep(5)
            
            # 阶段2: 持续测试
            self.log("\n🔄 阶段2: 持续压力测试")
            self.log("-" * 50)
            self.test_phase = "sustained"
            
            sustained_tasks = []
            for worker_id in range(self.config.sustained_users):
                task = asyncio.create_task(self.sustained_test_worker(worker_id))
                sustained_tasks.append(task)
            
            await asyncio.gather(*sustained_tasks)
            
            # 记录结束时间
            self.end_time = time.time()
            
            # 生成TLB测试报告
            self.generate_tlb_report()
            
            return True
            
        finally:
            await self.close_session()
    
    def generate_tlb_report(self):
        """生成TLB测试报告"""
        if not self.results:
            self.log("❌ 没有测试结果", "ERROR")
            return
        
        total_requests = len(self.results)
        successful_requests = sum(1 for r in self.results if r.success)
        failed_requests = total_requests - successful_requests
        rate_limited_requests = sum(1 for r in self.results if r.is_rate_limited)
        
        # 按时间窗口分析
        time_windows = self.analyze_time_windows()
        
        # 引擎使用统计
        engine_usage = defaultdict(int)
        for result in self.results:
            if result.success and result.engine_used:
                engine_usage[result.engine_used] += 1
        
        # 响应时间统计
        response_times = [r.response_time for r in self.results if r.success]
        if response_times:
            avg_response_time = statistics.mean(response_times)
            p95_response_time = statistics.quantiles(response_times, n=20)[18] if len(response_times) > 20 else max(response_times)
        else:
            avg_response_time = p95_response_time = 0
        
        # 吞吐量分析
        total_duration = self.end_time - self.start_time if self.end_time and self.start_time else 0
        actual_rps = successful_requests / total_duration if total_duration > 0 else 0
        
        # 打印报告
        self.log("\n" + "=" * 70)
        self.log("📊 TLB压力测试报告")
        self.log("=" * 70)
        
        self.log(f"📈 总体统计:")
        self.log(f"  总请求数: {total_requests}")
        self.log(f"  成功请求数: {successful_requests}")
        self.log(f"  失败请求数: {failed_requests}")
        self.log(f"  限流请求数: {rate_limited_requests}")
        self.log(f"  限流率: {(rate_limited_requests/total_requests)*100:.2f}%")
        self.log(f"  测试总时长: {total_duration:.2f}秒")
        self.log(f"  实际RPS: {actual_rps:.2f}")
        self.log(f"  期望RPS: {self.config.expected_rps}")
        
        self.log(f"\n⏱️  响应时间:")
        self.log(f"  平均响应时间: {avg_response_time:.3f}秒")
        self.log(f"  P95响应时间: {p95_response_time:.3f}秒")
        
        if engine_usage:
            self.log(f"\n🔧 引擎使用统计:")
            for engine, count in sorted(engine_usage.items(), key=lambda x: x[1], reverse=True):
                percentage = (count / successful_requests) * 100
                self.log(f"  {engine}: {count}次 ({percentage:.1f}%)")
        
        # TLB性能分析
        self.log(f"\n🎯 TLB性能分析:")
        
        # 检查RPS限制
        if actual_rps <= self.config.expected_rps * 1.1:  # 允许10%误差
            self.log(f"  ✅ RPS限制正常: {actual_rps:.2f} <= {self.config.expected_rps}")
        else:
            self.log(f"  ⚠️  RPS可能超出限制: {actual_rps:.2f} > {self.config.expected_rps}")
        
        # 检查限流效果
        if rate_limited_requests > 0:
            self.log(f"  ✅ 限流机制工作正常，触发 {rate_limited_requests} 次")
        else:
            self.log(f"  ⚠️  未触发限流，可能压力不够或配置问题")
        
        # 时间窗口分析
        self.log(f"\n📊 时间窗口分析:")
        for window_start, window_data in time_windows.items():
            window_rps = window_data['successful'] / 10  # 10秒窗口
            self.log(f"  {window_start}-{window_start+10}s: {window_data['successful']}成功, {window_data['rate_limited']}限流, RPS={window_rps:.1f}")
        
        # 负载均衡分析
        if len(engine_usage) > 1:
            engine_counts = list(engine_usage.values())
            balance_ratio = min(engine_counts) / max(engine_counts)
            self.log(f"\n⚖️  负载均衡:")
            self.log(f"  均衡比例: {balance_ratio:.2f}")
            if balance_ratio > 0.8:
                self.log("  ✅ 负载均衡效果良好")
            elif balance_ratio > 0.5:
                self.log("  ⚠️  负载均衡效果一般")
            else:
                self.log("  ❌ 负载均衡效果较差")
        
        self.log("=" * 70)
        self.log("🎉 TLB压力测试完成!")
    
    def analyze_time_windows(self) -> Dict[int, Dict[str, int]]:
        """分析时间窗口内的请求分布"""
        windows = defaultdict(lambda: {'successful': 0, 'rate_limited': 0, 'failed': 0})
        
        for result in self.results:
            window_start = int((result.timestamp - self.start_time) // 10) * 10
            if result.success:
                windows[window_start]['successful'] += 1
            elif result.is_rate_limited:
                windows[window_start]['rate_limited'] += 1
            else:
                windows[window_start]['failed'] += 1
        
        return dict(windows)

async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="SearchAPI TLB压力测试工具")
    parser.add_argument("--url", default="http://localhost:8787", help="API基础URL")
    parser.add_argument("--burst-users", type=int, default=50, help="突发用户数")
    parser.add_argument("--sustained-users", type=int, default=20, help="持续用户数")
    parser.add_argument("--burst-duration", type=int, default=30, help="突发持续时间(秒)")
    parser.add_argument("--sustained-duration", type=int, default=120, help="持续测试时间(秒)")
    parser.add_argument("--interval", type=float, default=0.1, help="请求间隔(秒)")
    parser.add_argument("--timeout", type=int, default=15, help="请求超时(秒)")
    parser.add_argument("--expected-rps", type=int, default=20, help="期望RPS")
    parser.add_argument("--expected-tokens", type=int, default=10, help="期望最大令牌数")
    parser.add_argument("--username", default="testuser", help="测试用户名")
    parser.add_argument("--password", default="testpass123", help="测试密码")
    
    args = parser.parse_args()
    
    config = TLBTestConfig(
        base_url=args.url,
        username=args.username,
        password=args.password,
        burst_users=args.burst_users,
        sustained_users=args.sustained_users,
        burst_duration=args.burst_duration,
        sustained_duration=args.sustained_duration,
        request_interval=args.interval,
        timeout=args.timeout,
        expected_rps=args.expected_rps,
        expected_max_tokens=args.expected_tokens
    )
    
    tester = TLBStressTester(config)
    
    try:
        success = await tester.run_tlb_stress_test()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  测试被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 测试异常: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
