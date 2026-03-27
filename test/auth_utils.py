#!/usr/bin/env python3
"""
认证工具模块
用于读取.env文件中的token并在HTTP请求中添加认证头
"""

import os
import re
from typing import Optional, Dict, Any
from pathlib import Path

class AuthUtils:
    """认证工具类"""
    
    def __init__(self, env_file_path: str = ".env"):
        """
        初始化认证工具
        
        Args:
            env_file_path: .env文件路径，默认为当前目录下的.env
        """
        self.env_file_path = env_file_path
        self.token = self._load_token()
    
    def _load_token(self) -> Optional[str]:
        """
        从.env文件中加载token
        
        Returns:
            token字符串，如果未找到则返回None
        """
        try:
            # 尝试从当前目录开始查找.env文件
            current_dir = Path.cwd()
            env_path = current_dir / self.env_file_path
            
            # 如果当前目录没有.env文件，尝试向上查找
            while not env_path.exists() and current_dir.parent != current_dir:
                current_dir = current_dir.parent
                env_path = current_dir / self.env_file_path
            
            if not env_path.exists():
                print(f"⚠️  警告: 未找到.env文件，路径: {env_path}")
                return None
            
            print(f"📁 找到.env文件: {env_path}")
            
            with open(env_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 使用正则表达式查找TEST_TOKEN
            token_match = re.search(r'TEST_TOKEN\s*=\s*(.+)', content)
            if token_match:
                token = token_match.group(1).strip()
                if token and token != "your_test_token_here":
                    print(f"✅ 成功加载TEST_TOKEN: {token[:10]}...")
                    return token
                else:
                    print("⚠️  警告: TEST_TOKEN未设置或使用默认值")
                    return None
            else:
                print("⚠️  警告: 在.env文件中未找到TEST_TOKEN")
                return None
                
        except Exception as e:
            print(f"❌ 加载.env文件失败: {e}")
            return None
    
    def get_auth_headers(self) -> Dict[str, str]:
        """
        获取认证头
        
        Returns:
            包含Authorization头的字典
        """
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        else:
            print("⚠️  警告: 未设置token，请求将不包含认证信息")
            return {}
    
    def is_authenticated(self) -> bool:
        """
        检查是否已认证
        
        Returns:
            如果已设置token则返回True，否则返回False
        """
        return self.token is not None
    
    def get_token_info(self) -> Dict[str, Any]:
        """
        获取token信息
        
        Returns:
            包含token信息的字典
        """
        if self.token:
            return {
                "token": self.token[:10] + "..." if len(self.token) > 10 else self.token,
                "full_token": self.token,
                "authenticated": True
            }
        else:
            return {
                "token": None,
                "full_token": None,
                "authenticated": False
            }

# 全局认证工具实例
auth_utils = AuthUtils()

def get_auth_headers() -> Dict[str, str]:
    """
    获取认证头的便捷函数
    
    Returns:
        包含Authorization头的字典
    """
    return auth_utils.get_auth_headers()

def is_authenticated() -> bool:
    """
    检查是否已认证的便捷函数
    
    Returns:
        如果已设置token则返回True，否则返回False
    """
    return auth_utils.is_authenticated()

def print_auth_status():
    """打印认证状态"""
    token_info = auth_utils.get_token_info()
    if token_info["authenticated"]:
        print(f"🔐 认证状态: 已认证 (Token: {token_info['token']})")
    else:
        print("🔓 认证状态: 未认证")
        print("💡 提示: 请在.env文件中设置TEST_TOKEN")
