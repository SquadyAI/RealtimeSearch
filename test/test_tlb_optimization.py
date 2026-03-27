#!/usr/bin/env python3
"""
SearchAPI TLB优化测试脚本
专门测试不同TLB配置下的性能表现
"""

import asyncio
import aiohttp
import time
import json
import statistics
import argparse
import sys
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import threading

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

class TLBOptimizationTester:
    def __init__(self, base_url: str = "http://localhost:8787", username: str = "testuser", password: str = "testpass123"):
        self.base_url = base_url
        self.username = username
        self.password = password
        self.session: Optional[aiohttp.ClientSession] = None
        self.token: Optional[str] = None
        self.results: List[TLBTestResult] = []
        self.results_lock = threading.Lock()
        
        # 测试查询
        self.test_query = "TLB优化测试查询"
    
    def log(self, message: str, level: str = "INFO"):
        """打印日志"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
    
    async def create_session(self):
        """创建HTTP会话"""
        timeout = aiohttp.ClientTimeout(total=15)
        self.session = aiohttp.ClientSession(timeout=timeout)
    
    async def close_session(self):
        """关闭HTTP会话"""
        if self.session:
            await self.session.close()
    
    async def authenticate(self) -> bool:
        """用户认证"""
        try:
            login_data = {
                "username": self.username,
                "password": self.password
            }
            
            async with self.session.post(f"{self.base_url}/v1/auth/login", json=login_data) as response:
                if response.status == 200:
                    result = await response.json()
                    self.token = result.get("token")
                    if self.token:
                        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
                        return True
                return False
        except Exception:
            return False
    
    async def single_search_request(self) -> TLBTestResult:
        """执行单次搜索请求"""
        start_time = time.time()
        
        try:
            data = {
                "query": self.test_query,
                "limit": 3
            }
            
            async with self.session.post(f"{self.base_url}/v1/search", json=data) as response:
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
    
    async def test_scenario(self, scenario_name: str, concurrent_users: int, requests_per_user: int, interval: float):
        """测试特定场景"""
        self.log(f"\n🎯 测试场景: {scenario_name}")
        self.log(f"配置: {concurrent_users}用户 × {requests_per_user}请求, 间隔{interval}秒")
        
        # 清空之前的结果
        self.results.clear()
        
        start_time = time.time()
        
        # 创建并发用户任务
        tasks = []
        for user_id in range(concurrent_users):
            task = asyncio.create_task(self.user_simulation(user_id, requests_per_user, interval))
            tasks.append(task)
        
        # 等待所有任务完成
        await asyncio.gather(*tasks)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # 分析结果
        self.analyze_scenario_results(scenario_name, duration)
    
    async def user_simulation(self, user_id: int, requests_per_user: int, interval: float):
        """模拟单个用户的行为"""
        for request_id in range(requests_per_user):
            result = await self.single_search_request()
            self.add_result(result)
            
            # 记录关键结果
            if result.is_rate_limited:
                self.log(f"⚠️  用户{user_id} 触发限流: {result.status_code}", "WARN")
            elif result.success:
                self.log(f"✅ 用户{user_id} 请求{request_id+1}: {result.response_time:.2f}s, 引擎: {result.engine_used}")
            else:
                self.log(f"❌ 用户{user_id} 请求{request_id+1}: {result.status_code}", "ERROR")
            
            # 请求间隔
            if request_id < requests_per_user - 1:
                await asyncio.sleep(interval)
    
    def analyze_scenario_results(self, scenario_name: str, duration: float):
        """分析场景测试结果"""
        if not self.results:
            self.log(f"❌ {scenario_name}: 没有测试结果", "ERROR")
            return
        
        total_requests = len(self.results)
        successful_requests = sum(1 for r in self.results if r.success)
        failed_requests = total_requests - successful_requests
        rate_limited_requests = sum(1 for r in self.results if r.is_rate_limited)
        
        success_rate = (successful_requests / total_requests) * 100
        actual_rps = successful_requests / duration if duration > 0 else 0
        
        # 响应时间统计
        response_times = [r.response_time for r in self.results if r.success]
        if response_times:
            avg_response_time = statistics.mean(response_times)
            p95_response_time = statistics.quantiles(response_times, n=20)[18] if len(response_times) > 20 else max(response_times)
            p99_response_time = statistics.quantiles(response_times, n=100)[98] if len(response_times) > 100 else max(response_times)
        else:
            avg_response_time = p95_response_time = p99_response_time = 0
        
        # 引擎使用统计
        engine_usage = {}
        for result in self.results:
            if result.success and result.engine_used:
                engine_usage[result.engine_used] = engine_usage.get(result.engine_used, 0) + 1
        
        # 打印结果
        self.log(f"\n📊 {scenario_name} 结果:")
        self.log(f"  总请求数: {total_requests}")
        self.log(f"  成功请求数: {successful_requests}")
        self.log(f"  失败请求数: {failed_requests}")
        self.log(f"  限流请求数: {rate_limited_requests}")
        self.log(f"  成功率: {success_rate:.2f}%")
        self.log(f"  实际RPS: {actual_rps:.2f}")
        self.log(f"  平均响应时间: {avg_response_time:.3f}秒")
        self.log(f"  P95响应时间: {p95_response_time:.3f}秒")
        self.log(f"  P99响应时间: {p99_response_time:.3f}秒")
        
        if engine_usage:
            self.log(f"  引擎使用:")
            for engine, count in sorted(engine_usage.items(), key=lambda x: x[1], reverse=True):
                percentage = (count / successful_requests) * 100
                self.log(f"    {engine}: {count}次 ({percentage:.1f}%)")
        
        # 性能评估
        if success_rate >= 95:
            self.log(f"  ✅ 性能优秀")
        elif success_rate >= 90:
            self.log(f"  ⚠️  性能良好")
        elif success_rate >= 80:
            self.log(f"  ⚠️  性能一般")
        else:
            self.log(f"  ❌ 性能较差")
    
    async def run_optimization_tests(self):
        """运行TLB优化测试"""
        self.log("🚀 开始TLB优化测试")
        self.log("=" * 60)
        
        # 创建会话
        await self.create_session()
        
        try:
            # 认证
            if not await self.authenticate():
                self.log("❌ 认证失败，测试终止", "ERROR")
                return False
            
            # 测试场景1: 低并发测试
            await self.test_scenario(
                "低并发测试",
                concurrent_users=5,
                requests_per_user=10,
                interval=1.0
            )
            
            # 等待令牌恢复
            self.log("\n⏳ 等待令牌桶恢复...")
            await asyncio.sleep(5)
            
            # 测试场景2: 中等并发测试
            await self.test_scenario(
                "中等并发测试",
                concurrent_users=10,
                requests_per_user=15,
                interval=0.5
            )
            
            # 等待令牌恢复
            self.log("\n⏳ 等待令牌桶恢复...")
            await asyncio.sleep(5)
            
            # 测试场景3: 高并发测试
            await self.test_scenario(
                "高并发测试",
                concurrent_users=15,
                requests_per_user=20,
                interval=0.3
            )
            
            # 等待令牌恢复
            self.log("\n⏳ 等待令牌桶恢复...")
            await asyncio.sleep(5)
            
            # 测试场景4: 极限并发测试
            await self.test_scenario(
                "极限并发测试",
                concurrent_users=20,
                requests_per_user=25,
                interval=0.2
            )
            
            # 生成总结报告
            self.generate_summary_report()
            
            return True
            
        finally:
            await self.close_session()
    
    def generate_summary_report(self):
        """生成总结报告"""
        self.log("\n" + "=" * 60)
        self.log("📈 TLB优化测试总结")
        self.log("=" * 60)
        
        self.log("🎯 测试建议:")
        self.log("1. 低并发场景 (5用户): 应该表现良好，成功率>95%")
        self.log("2. 中等并发场景 (10用户): 成功率应该在90-95%之间")
        self.log("3. 高并发场景 (15用户): 可能出现限流，成功率80-90%")
        self.log("4. 极限并发场景 (20用户): 大量限流，成功率<80%")
        
        self.log("\n🔧 优化建议:")
        self.log("1. 增加令牌桶容量: 从10个增加到20-30个")
        self.log("2. 提高RPS限制: 从20增加到30-50")
        self.log("3. 优化负载均衡: 确保各引擎使用均衡")
        self.log("4. 添加缓存机制: 减少重复请求")
        self.log("5. 实现请求队列: 平滑处理突发流量")
        
        self.log("\n📊 当前TLB配置:")
        self.log("- 每个引擎最大令牌数: 10")
        self.log("- 每个引擎RPS: 20")
        self.log("- 总理论RPS: 60 (3个引擎 × 20)")
        self.log("- 令牌补充速率: 20/秒")
        
        self.log("=" * 60)
        self.log("🎉 TLB优化测试完成!")

async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="SearchAPI TLB优化测试工具")
    parser.add_argument("--url", default="http://localhost:8787", help="API基础URL")
    parser.add_argument("--username", default="testuser", help="测试用户名")
    parser.add_argument("--password", default="testpass123", help="测试密码")
    
    args = parser.parse_args()
    
    tester = TLBOptimizationTester(
        base_url=args.url,
        username=args.username,
        password=args.password
    )
    
    try:
        success = await tester.run_optimization_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  测试被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 测试异常: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
