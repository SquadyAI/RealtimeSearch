#!/usr/bin/env python3
"""
快速验证测试脚本（无需登录）
直接验证核心功能
"""

import sys
import json
import time
import requests
import argparse
from typing import Dict, List, Optional, Any
from datetime import datetime
from collections import Counter


class QuickVerificationTester:
    def __init__(self, base_url: str = "http://localhost:8787"):
        self.base_url = base_url
        self.session = requests.Session()

    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")

    def check_health(self) -> bool:
        """健康检查"""
        try:
            response = self.session.get(f"{self.base_url}/healthz")
            if response.status_code == 200:
                self.log("✅ 服务健康检查通过")
                return True
            else:
                self.log(f"❌ 服务不健康: {response.status_code}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ 无法连接到服务: {e}", "ERROR")
            return False

    def get_engine_status(self) -> Optional[Dict[str, Any]]:
        """获取引擎状态（无需认证）"""
        try:
            response = self.session.get(f"{self.base_url}/v1/engines/status")
            if response.status_code == 200:
                return response.json()
            else:
                self.log(f"❌ 获取引擎状态失败: {response.status_code}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ 获取引擎状态异常: {e}", "ERROR")
            return None

    def get_tlb_status(self) -> Optional[Dict[str, Any]]:
        """获取TLB状态（无需认证）"""
        try:
            response = self.session.get(f"{self.base_url}/v1/tlb/status")
            if response.status_code == 200:
                return response.json()
            else:
                self.log(f"❌ 获取TLB状态失败: {response.status_code}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ 获取TLB状态异常: {e}", "ERROR")
            return None

    def verify_real_engines_only(self) -> bool:
        """验证只使用真实引擎"""
        self.log("🔍 验证只使用真实引擎（排除测试引擎）")
        
        status = self.get_engine_status()
        if not status:
            return False
            
        # 检查搜索引擎列表
        search_engines = status.get('engines', {}).get('search', [])
        test_engines = [engine for engine in search_engines if engine.startswith('test-')]
        
        self.log(f"📋 当前搜索引擎列表: {search_engines}")
        
        if test_engines:
            self.log(f"❌ 发现测试引擎: {test_engines}", "ERROR")
            return False
        
        real_engines = [engine for engine in search_engines if engine in ['bing', 'brave', 'serper']]
        self.log(f"✅ 确认只使用真实搜索引擎: {real_engines}")
        
        return len(real_engines) > 0

    def verify_tlb_configuration(self) -> bool:
        """验证TLB配置"""
        self.log("🔍 验证TLB配置")
        
        tlb_status = self.get_tlb_status()
        if not tlb_status:
            return False
        
        search_info = tlb_status.get('search', {})
        engines = search_info.get('engines', [])
        config = search_info.get('config', {})
        
        self.log(f"📋 TLB搜索引擎: {engines}")
        self.log(f"📋 TLB配置: {json.dumps(config, indent=2, ensure_ascii=False)}")
        
        # 检查是否有测试引擎
        test_engines_in_tlb = [engine for engine in engines if engine.startswith('test-')]
        if test_engines_in_tlb:
            self.log(f"❌ TLB中发现测试引擎: {test_engines_in_tlb}", "ERROR")
            return False
        
        # 检查热插拔是否启用
        hot_swap_enabled = config.get('enableHotSwap', False)
        if hot_swap_enabled:
            self.log("✅ TLB热插拔已启用")
        else:
            self.log("⚠️ TLB热插拔未启用", "WARN")
        
        return True

    def analyze_system_architecture(self) -> bool:
        """分析系统架构"""
        self.log("🏗️ 分析系统架构")
        
        # 获取系统状态
        engine_status = self.get_engine_status()
        tlb_status = self.get_tlb_status()
        
        if not engine_status or not tlb_status:
            return False
        
        # 分析引擎配置
        search_engines = engine_status.get('engines', {}).get('search', [])
        translate_engines = engine_status.get('engines', {}).get('translate', [])
        
        self.log(f"📊 搜索引擎数量: {len(search_engines)}")
        self.log(f"📊 翻译引擎数量: {len(translate_engines)}")
        
        # 分析TLB配置
        tlb_search_engines = tlb_status.get('search', {}).get('engines', [])
        tlb_translate_engines = tlb_status.get('translate', {}).get('engines', [])
        
        self.log(f"📊 TLB搜索引擎数量: {len(tlb_search_engines)}")
        self.log(f"📊 TLB翻译引擎数量: {len(tlb_translate_engines)}")
        
        # 检查同步性
        search_sync = set(search_engines) == set(tlb_search_engines)
        translate_sync = set(translate_engines) == set(tlb_translate_engines)
        
        if search_sync:
            self.log("✅ 搜索引擎与TLB同步")
        else:
            self.log("⚠️ 搜索引擎与TLB不同步", "WARN")
            self.log(f"   引擎状态: {search_engines}")
            self.log(f"   TLB状态: {tlb_search_engines}")
        
        if translate_sync:
            self.log("✅ 翻译引擎与TLB同步")
        else:
            self.log("⚠️ 翻译引擎与TLB不同步", "WARN")
            self.log(f"   引擎状态: {translate_engines}")
            self.log(f"   TLB状态: {tlb_translate_engines}")
        
        return search_sync and translate_sync

    def test_basic_search_without_auth(self) -> Optional[str]:
        """测试基础搜索功能（无需认证）"""
        self.log("🔍 测试基础搜索功能")
        
        try:
            response = self.session.post(f"{self.base_url}/v1/search", json={
                "query": "快速验证测试"
            })
            
            if response.status_code == 200:
                result = response.json()
                provider = result.get('provider', 'unknown')
                items_count = len(result.get('items', []))
                self.log(f"✅ 搜索成功，使用引擎: {provider}, 返回 {items_count} 个结果")
                return provider
            elif response.status_code == 401:
                self.log("⚠️ 搜索需要认证，跳过搜索测试", "WARN")
                return None
            else:
                self.log(f"❌ 搜索失败: {response.status_code} - {response.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ 搜索异常: {e}", "ERROR")
            return None

    def run_quick_verification(self) -> bool:
        """运行快速验证测试"""
        self.log("\n" + "="*60)
        self.log("🚀 快速验证测试（无需登录）")
        self.log("="*60)
        
        results = []
        
        # 1. 验证只使用真实引擎
        self.log("\n📋 测试1: 验证只使用真实引擎")
        self.log("-" * 40)
        real_engines_ok = self.verify_real_engines_only()
        results.append(("真实引擎验证", real_engines_ok))
        
        # 2. 验证TLB配置
        self.log("\n📋 测试2: 验证TLB配置")
        self.log("-" * 40)
        tlb_config_ok = self.verify_tlb_configuration()
        results.append(("TLB配置验证", tlb_config_ok))
        
        # 3. 分析系统架构
        self.log("\n📋 测试3: 系统架构分析")
        self.log("-" * 40)
        architecture_ok = self.analyze_system_architecture()
        results.append(("系统架构验证", architecture_ok))
        
        # 4. 测试基础搜索
        self.log("\n📋 测试4: 基础搜索功能")
        self.log("-" * 40)
        search_provider = self.test_basic_search_without_auth()
        search_ok = search_provider is not None
        results.append(("基础搜索功能", search_ok))
        
        # 显示测试结果
        self.log("\n" + "="*60)
        self.log("📊 快速验证测试结果")
        self.log("="*60)
        
        all_passed = True
        for test_name, result in results:
            status = "✅ 通过" if result else "❌ 失败"
            self.log(f"{test_name}: {status}")
            if not result:
                all_passed = False
        
        # 总结
        self.log("\n" + "="*60)
        if all_passed:
            self.log("🎉 快速验证测试全部通过！")
            self.log("系统基本功能正常，满足以下要求：")
            self.log("  ✅ 只使用真实引擎（排除测试引擎）")
            self.log("  ✅ TLB配置正确")
            self.log("  ✅ 系统架构同步")
            if search_ok:
                self.log("  ✅ 基础搜索功能正常")
        else:
            self.log("⚠️ 部分验证测试失败，但核心功能基本正常")
        self.log("="*60)
        
        return all_passed


def main():
    parser = argparse.ArgumentParser(description="快速验证测试工具（无需登录）")
    parser.add_argument("--url", default="http://localhost:8787", help="API基础URL")
    args = parser.parse_args()
    
    tester = QuickVerificationTester(args.url)
    
    # 健康检查
    if not tester.check_health():
        sys.exit(1)
    
    # 执行快速验证
    success = tester.run_quick_verification()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
