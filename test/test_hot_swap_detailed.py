#!/usr/bin/env python3
"""
详细的热插拔功能测试
验证动态添加、编译、删除引擎的功能
"""

import sys
import json
import time
import requests
import argparse
from typing import Dict, List, Optional, Any
from datetime import datetime


class HotSwapTester:
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

    def get_engine_status(self) -> Optional[Dict[str, Any]]:
        """获取引擎状态"""
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
        """获取TLB状态"""
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

    def create_engine(self, name: str, engine_type: str = "search") -> bool:
        """创建新引擎"""
        self.log(f"🔥 创建新引擎: {name} (类型: {engine_type})")
        
        try:
            response = self.session.post(f"{self.base_url}/v1/engines/create", json={
                "name": name,
                "type": engine_type,
                "config": {
                    "maxTokens": 5,
                    "refillRate": 10
                }
            })
            
            if response.status_code == 200:
                result = response.json()
                self.log(f"✅ 引擎创建成功: {json.dumps(result, indent=2, ensure_ascii=False)}")
                return True
            else:
                self.log(f"❌ 引擎创建失败: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ 引擎创建异常: {e}", "ERROR")
            return False

    def compile_engine(self, name: str, engine_type: str = "search") -> bool:
        """编译引擎"""
        self.log(f"🔥 编译引擎: {name} (类型: {engine_type})")
        
        # 根据类型生成不同的引擎代码
        if engine_type == "search":
            engine_code = f'''
export const engine = {{
  name: "{name}",
  async search(args) {{
    const timestamp = new Date().toISOString();
    return {{
      provider: "{name}",
      query: args.query,
      timestamp: timestamp,
      items: [
        {{
          title: "热编译搜索引擎测试结果",
          url: "https://example.com/hot-compile-search",
          snippet: `这是通过热编译创建的搜索引擎 {name} 在 ${{timestamp}} 返回的结果`
        }}
      ],
      raw: {{
        engineName: "{name}",
        compiledAt: timestamp,
        type: "search"
      }}
    }};
  }}
}};
'''
        else:  # translate
            engine_code = f'''
export const engine = {{
  name: "{name}",
  async translate(args) {{
    const timestamp = new Date().toISOString();
    return {{
      provider: "{name}",
      query: args.query,
      target: args.target,
      timestamp: timestamp,
      result: `[{name}编译翻译] ${{args.query}}`,
      raw: {{
        engineName: "{name}",
        compiledAt: timestamp,
        type: "translate"
      }}
    }};
  }}
}};
'''
        
        try:
            response = self.session.put(f"{self.base_url}/v1/engines/compile/{name}", json={
                "type": engine_type,
                "code": engine_code
            })
            
            if response.status_code == 200:
                result = response.json()
                self.log(f"✅ 引擎编译成功: {json.dumps(result, indent=2, ensure_ascii=False)}")
                return True
            else:
                self.log(f"❌ 引擎编译失败: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ 引擎编译异常: {e}", "ERROR")
            return False

    def delete_engine(self, name: str) -> bool:
        """删除引擎"""
        self.log(f"🔥 删除引擎: {name}")
        
        try:
            response = self.session.delete(f"{self.base_url}/v1/engines/{name}")
            
            if response.status_code == 200:
                result = response.json()
                self.log(f"✅ 引擎删除成功: {json.dumps(result, indent=2, ensure_ascii=False)}")
                return True
            else:
                self.log(f"❌ 引擎删除失败: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ 引擎删除异常: {e}", "ERROR")
            return False

    def toggle_engine(self, name: str) -> bool:
        """切换引擎状态"""
        self.log(f"🔥 切换引擎状态: {name}")
        
        try:
            response = self.session.post(f"{self.base_url}/v1/engines/{name}/toggle")
            
            if response.status_code == 200:
                result = response.json()
                self.log(f"✅ 引擎状态切换成功: {json.dumps(result, indent=2, ensure_ascii=False)}")
                return True
            else:
                self.log(f"❌ 引擎状态切换失败: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ 引擎状态切换异常: {e}", "ERROR")
            return False

    def test_search_with_engine(self, query: str, expected_engine: str = None) -> Optional[str]:
        """测试搜索并检查是否使用了预期的引擎"""
        try:
            response = self.session.post(f"{self.base_url}/v1/search", json={
                "query": query
            })
            
            if response.status_code == 200:
                result = response.json()
                provider = result.get('provider', 'unknown')
                items_count = len(result.get('items', []))
                
                if expected_engine:
                    if provider == expected_engine:
                        self.log(f"✅ 搜索成功，使用预期引擎: {provider}, 返回 {items_count} 个结果")
                    else:
                        self.log(f"⚠️ 搜索成功，但使用了不同引擎: {provider} (预期: {expected_engine})", "WARN")
                else:
                    self.log(f"✅ 搜索成功，使用引擎: {provider}, 返回 {items_count} 个结果")
                
                return provider
            else:
                self.log(f"❌ 搜索失败: {response.status_code} - {response.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ 搜索异常: {e}", "ERROR")
            return None

    def verify_engine_in_status(self, engine_name: str, engine_type: str = "search", should_exist: bool = True) -> bool:
        """验证引擎是否在状态列表中"""
        status = self.get_engine_status()
        if not status:
            return False
        
        engines = status.get('engines', {}).get(engine_type, [])
        exists = engine_name in engines
        
        if should_exist:
            if exists:
                self.log(f"✅ 引擎 {engine_name} 已在 {engine_type} 引擎列表中")
                return True
            else:
                self.log(f"❌ 引擎 {engine_name} 不在 {engine_type} 引擎列表中", "ERROR")
                return False
        else:
            if not exists:
                self.log(f"✅ 引擎 {engine_name} 已从 {engine_type} 引擎列表中移除")
                return True
            else:
                self.log(f"❌ 引擎 {engine_name} 仍在 {engine_type} 引擎列表中", "ERROR")
                return False

    def verify_engine_in_tlb(self, engine_name: str, should_exist: bool = True) -> bool:
        """验证引擎是否在TLB中"""
        tlb_status = self.get_tlb_status()
        if not tlb_status:
            return False
        
        search_engines = tlb_status.get('search', {}).get('engines', [])
        exists = engine_name in search_engines
        
        if should_exist:
            if exists:
                self.log(f"✅ 引擎 {engine_name} 已在TLB搜索引擎列表中")
                return True
            else:
                self.log(f"❌ 引擎 {engine_name} 不在TLB搜索引擎列表中", "ERROR")
                return False
        else:
            if not exists:
                self.log(f"✅ 引擎 {engine_name} 已从TLB搜索引擎列表中移除")
                return True
            else:
                self.log(f"❌ 引擎 {engine_name} 仍在TLB搜索引擎列表中", "ERROR")
                return False

    def test_complete_hot_swap_workflow(self) -> bool:
        """测试完整的热插拔工作流程"""
        engine_name = "hot-swap-test-engine"
        
        self.log(f"\n🔥 开始完整热插拔工作流程测试: {engine_name}")
        self.log("=" * 60)
        
        results = []
        
        # 1. 确保引擎不存在
        self.log("\n📋 步骤1: 确认引擎初始状态")
        self.log("-" * 30)
        initial_not_exists = self.verify_engine_in_status(engine_name, should_exist=False)
        results.append(("初始状态检查", initial_not_exists))
        
        # 2. 创建引擎
        self.log("\n📋 步骤2: 创建引擎")
        self.log("-" * 30)
        create_success = self.create_engine(engine_name)
        results.append(("创建引擎", create_success))
        
        if create_success:
            time.sleep(2)  # 等待系统同步
            
            # 3. 验证引擎出现在状态中
            self.log("\n📋 步骤3: 验证引擎出现在状态中")
            self.log("-" * 30)
            status_exists = self.verify_engine_in_status(engine_name, should_exist=True)
            results.append(("状态列表验证", status_exists))
            
            # 4. 验证引擎出现在TLB中
            self.log("\n📋 步骤4: 验证引擎出现在TLB中")
            self.log("-" * 30)
            tlb_exists = self.verify_engine_in_tlb(engine_name, should_exist=True)
            results.append(("TLB列表验证", tlb_exists))
        
        # 5. 编译引擎
        self.log("\n📋 步骤5: 编译引擎")
        self.log("-" * 30)
        compile_success = self.compile_engine(engine_name)
        results.append(("编译引擎", compile_success))
        
        if compile_success:
            time.sleep(2)  # 等待编译完成
            
            # 6. 测试使用编译的引擎
            self.log("\n📋 步骤6: 测试编译后的引擎")
            self.log("-" * 30)
            test_query = f"测试热编译引擎 {engine_name}"
            used_engine = self.test_search_with_engine(test_query)
            engine_used_correctly = used_engine == engine_name if used_engine else False
            results.append(("编译引擎测试", engine_used_correctly))
        
        # 7. 切换引擎状态
        self.log("\n📋 步骤7: 切换引擎状态")
        self.log("-" * 30)
        toggle_success = self.toggle_engine(engine_name)
        results.append(("切换引擎状态", toggle_success))
        
        # 8. 删除引擎
        self.log("\n📋 步骤8: 删除引擎")
        self.log("-" * 30)
        delete_success = self.delete_engine(engine_name)
        results.append(("删除引擎", delete_success))
        
        if delete_success:
            time.sleep(2)  # 等待删除生效
            
            # 9. 验证引擎从状态中消失
            self.log("\n📋 步骤9: 验证引擎从状态中消失")
            self.log("-" * 30)
            status_not_exists = self.verify_engine_in_status(engine_name, should_exist=False)
            results.append(("状态清理验证", status_not_exists))
            
            # 10. 验证引擎从TLB中消失
            self.log("\n📋 步骤10: 验证引擎从TLB中消失")
            self.log("-" * 30)
            tlb_not_exists = self.verify_engine_in_tlb(engine_name, should_exist=False)
            results.append(("TLB清理验证", tlb_not_exists))
        
        # 总结结果
        self.log("\n" + "=" * 60)
        self.log("📊 热插拔工作流程测试结果")
        self.log("=" * 60)
        
        passed_steps = 0
        for step_name, result in results:
            status = "✅ 通过" if result else "❌ 失败"
            self.log(f"{step_name}: {status}")
            if result:
                passed_steps += 1
        
        total_steps = len(results)
        self.log(f"\n总体结果: {passed_steps}/{total_steps} 步骤通过")
        
        if passed_steps == total_steps:
            self.log("🎉 热插拔工作流程完全正常！")
            return True
        elif passed_steps >= total_steps * 0.8:
            self.log("⚠️ 热插拔工作流程基本正常")
            return True
        else:
            self.log("❌ 热插拔工作流程存在问题", "ERROR")
            return False

    def run_detailed_hot_swap_test(self) -> bool:
        """运行详细的热插拔测试"""
        self.log("\n" + "="*60)
        self.log("🔥 详细热插拔功能测试")
        self.log("="*60)
        
        # 显示初始状态
        self.log("\n📋 初始系统状态")
        self.log("-" * 30)
        
        initial_status = self.get_engine_status()
        if initial_status:
            search_engines = initial_status.get('engines', {}).get('search', [])
            self.log(f"当前搜索引擎: {search_engines}")
        
        initial_tlb = self.get_tlb_status()
        if initial_tlb:
            tlb_search_engines = initial_tlb.get('search', {}).get('engines', [])
            self.log(f"TLB搜索引擎: {tlb_search_engines}")
        
        # 执行完整工作流程测试
        workflow_success = self.test_complete_hot_swap_workflow()
        
        return workflow_success


def main():
    parser = argparse.ArgumentParser(description="详细热插拔测试工具")
    parser.add_argument("--url", default="http://localhost:8787", help="API基础URL")
    parser.add_argument("--username", default="testuser", help="测试用户名")
    parser.add_argument("--password", default="testpass123", help="测试密码")
    args = parser.parse_args()
    
    tester = HotSwapTester(args.url)
    
    # 用户登录
    if not tester.login(args.username, args.password):
        sys.exit(1)
    
    # 执行详细测试
    success = tester.run_detailed_hot_swap_test()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()


