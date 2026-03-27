#!/usr/bin/env python3
"""
SearchAPI 性能监控脚本
实时监控压测过程中的系统状态和TLB状态
"""

import asyncio
import aiohttp
import time
import json
import argparse
import sys
from typing import Dict, Any, Optional
from dataclasses import dataclass
import threading
from datetime import datetime

@dataclass
class SystemMetrics:
    """系统指标"""
    timestamp: float
    tlb_status: Optional[Dict[str, Any]] = None
    engine_status: Optional[Dict[str, Any]] = None
    health_status: Optional[Dict[str, Any]] = None
    error_count: int = 0

class PerformanceMonitor:
    def __init__(self, base_url: str = "http://localhost:8787", username: str = "testuser", password: str = "testpass123"):
        self.base_url = base_url
        self.username = username
        self.password = password
        self.session: Optional[aiohttp.ClientSession] = None
        self.token: Optional[str] = None
        self.metrics_history: list[SystemMetrics] = []
        self.monitoring = False
        self.monitor_thread: Optional[threading.Thread] = None
        
    def log(self, message: str, level: str = "INFO"):
        """打印日志"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
    
    async def create_session(self):
        """创建HTTP会话"""
        timeout = aiohttp.ClientTimeout(total=10)
        self.session = aiohttp.ClientSession(timeout=timeout)
    
    async def close_session(self):
        """关闭HTTP会话"""
        if self.session:
            await self.session.close()
    
    async def authenticate(self) -> bool:
        """用户认证"""
        try:
            # 登录获取token
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
    
    async def get_tlb_status(self) -> Optional[Dict[str, Any]]:
        """获取TLB状态"""
        try:
            async with self.session.get(f"{self.base_url}/v1/tlb/status") as response:
                if response.status == 200:
                    return await response.json()
        except Exception:
            pass
        return None
    
    async def get_engine_status(self) -> Optional[Dict[str, Any]]:
        """获取引擎状态"""
        try:
            async with self.session.get(f"{self.base_url}/v1/engines") as response:
                if response.status == 200:
                    return await response.json()
        except Exception:
            pass
        return None
    
    async def get_health_status(self) -> Optional[Dict[str, Any]]:
        """获取健康状态"""
        try:
            async with self.session.get(f"{self.base_url}/healthz") as response:
                if response.status == 200:
                    return await response.json()
        except Exception:
            pass
        return None
    
    async def collect_metrics(self) -> SystemMetrics:
        """收集系统指标"""
        metrics = SystemMetrics(timestamp=time.time())
        
        try:
            # 并行收集各种指标
            tlb_task = asyncio.create_task(self.get_tlb_status())
            engine_task = asyncio.create_task(self.get_engine_status())
            health_task = asyncio.create_task(self.get_health_status())
            
            metrics.tlb_status = await tlb_task
            metrics.engine_status = await engine_task
            metrics.health_status = await health_task
            
        except Exception as e:
            metrics.error_count += 1
            self.log(f"收集指标时出错: {e}", "ERROR")
        
        return metrics
    
    def display_metrics(self, metrics: SystemMetrics):
        """显示指标"""
        timestamp = datetime.fromtimestamp(metrics.timestamp).strftime("%H:%M:%S")
        
        print(f"\n{'='*80}")
        print(f"📊 系统监控 - {timestamp}")
        print(f"{'='*80}")
        
        # TLB状态
        if metrics.tlb_status:
            print(f"🎯 TLB状态:")
            if 'search' in metrics.tlb_status:
                search_tlb = metrics.tlb_status['search']
                print(f"  搜索引擎TLB:")
                print(f"    启用: {search_tlb.get('enabled', 'N/A')}")
                print(f"    注册引擎: {search_tlb.get('registeredEngines', [])}")
                
                if 'engineTokenStates' in search_tlb:
                    print(f"    引擎令牌状态:")
                    for engine, state in search_tlb['engineTokenStates'].items():
                        available = state.get('availableTokens', 0)
                        max_tokens = state.get('maxTokens', 0)
                        refill_rate = state.get('refillRate', 0)
                        print(f"      {engine}: {available:.1f}/{max_tokens} (补充率: {refill_rate}/s)")
        
        # 引擎状态
        if metrics.engine_status:
            print(f"\n🔧 引擎状态:")
            if 'search' in metrics.engine_status:
                search_engines = metrics.engine_status['search']
                print(f"  搜索引擎:")
                print(f"    总数: {search_engines.get('total', 0)}")
                print(f"    默认: {search_engines.get('default', [])}")
                
                if 'engines' in search_engines:
                    print(f"    引擎详情:")
                    for engine in search_engines['engines']:
                        name = engine.get('name', 'unknown')
                        available = engine.get('available', False)
                        enabled = engine.get('enabled', False)
                        tlb_synced = engine.get('tlbSynced', False)
                        status = "✅" if available and enabled else "❌"
                        print(f"      {status} {name}: 可用={available}, 启用={enabled}, TLB同步={tlb_synced}")
        
        # 健康状态
        if metrics.health_status:
            print(f"\n💚 健康状态:")
            print(f"  状态: {metrics.health_status.get('status', 'unknown')}")
            if 'uptime' in metrics.health_status:
                print(f"  运行时间: {metrics.health_status['uptime']}")
        
        # 错误计数
        if metrics.error_count > 0:
            print(f"\n⚠️  错误计数: {metrics.error_count}")
    
    def display_summary(self):
        """显示监控摘要"""
        if not self.metrics_history:
            return
        
        print(f"\n{'='*80}")
        print(f"📈 监控摘要")
        print(f"{'='*80}")
        
        total_samples = len(self.metrics_history)
        error_samples = sum(1 for m in self.metrics_history if m.error_count > 0)
        
        print(f"总采样数: {total_samples}")
        print(f"错误采样数: {error_samples}")
        print(f"成功率: {((total_samples - error_samples) / total_samples * 100):.1f}%")
        
        # TLB状态变化分析
        tlb_samples = [m for m in self.metrics_history if m.tlb_status]
        if tlb_samples:
            print(f"\n🎯 TLB状态分析:")
            print(f"TLB数据可用样本: {len(tlb_samples)}")
            
            # 分析引擎令牌使用情况
            engine_usage = {}
            for sample in tlb_samples:
                if 'search' in sample.tlb_status and 'engineTokenStates' in sample.tlb_status['search']:
                    for engine, state in sample.tlb_status['search']['engineTokenStates'].items():
                        if engine not in engine_usage:
                            engine_usage[engine] = []
                        engine_usage[engine].append(state.get('availableTokens', 0))
            
            if engine_usage:
                print(f"引擎令牌使用统计:")
                for engine, tokens in engine_usage.items():
                    avg_tokens = sum(tokens) / len(tokens)
                    min_tokens = min(tokens)
                    max_tokens = max(tokens)
                    print(f"  {engine}: 平均={avg_tokens:.1f}, 最小={min_tokens:.1f}, 最大={max_tokens:.1f}")
    
    async def monitor_loop(self, interval: float = 5.0):
        """监控循环"""
        self.log(f"开始监控，间隔: {interval}秒")
        
        while self.monitoring:
            try:
                metrics = await self.collect_metrics()
                self.metrics_history.append(metrics)
                
                # 只保留最近100个样本
                if len(self.metrics_history) > 100:
                    self.metrics_history = self.metrics_history[-100:]
                
                self.display_metrics(metrics)
                
                await asyncio.sleep(interval)
                
            except Exception as e:
                self.log(f"监控循环出错: {e}", "ERROR")
                await asyncio.sleep(interval)
    
    async def start_monitoring(self, interval: float = 5.0, duration: int = 300):
        """开始监控"""
        self.log("🚀 启动性能监控")
        
        # 创建会话
        await self.create_session()
        
        try:
            # 认证
            if not await self.authenticate():
                self.log("❌ 认证失败，监控终止", "ERROR")
                return False
            
            # 开始监控
            self.monitoring = True
            self.log(f"监控将持续 {duration} 秒")
            
            # 设置监控超时
            monitor_task = asyncio.create_task(self.monitor_loop(interval))
            timeout_task = asyncio.create_task(asyncio.sleep(duration))
            
            # 等待监控完成或超时
            done, pending = await asyncio.wait(
                [monitor_task, timeout_task],
                return_when=asyncio.FIRST_COMPLETED
            )
            
            # 停止监控
            self.monitoring = False
            
            # 取消未完成的任务
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            # 显示摘要
            self.display_summary()
            
            return True
            
        finally:
            await self.close_session()
    
    def stop_monitoring(self):
        """停止监控"""
        self.monitoring = False

async def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="SearchAPI性能监控工具")
    parser.add_argument("--url", default="http://localhost:8787", help="API基础URL")
    parser.add_argument("--username", default="testuser", help="测试用户名")
    parser.add_argument("--password", default="testpass123", help="测试密码")
    parser.add_argument("--interval", type=float, default=5.0, help="监控间隔(秒)")
    parser.add_argument("--duration", type=int, default=300, help="监控持续时间(秒)")
    
    args = parser.parse_args()
    
    monitor = PerformanceMonitor(
        base_url=args.url,
        username=args.username,
        password=args.password
    )
    
    try:
        success = await monitor.start_monitoring(
            interval=args.interval,
            duration=args.duration
        )
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  监控被用户中断")
        monitor.stop_monitoring()
        sys.exit(1)
    except Exception as e:
        print(f"❌ 监控异常: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
