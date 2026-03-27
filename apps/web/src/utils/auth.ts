// 简化的认证工具函数 - 只负责本地存储管理

// 获取存储的token
export function getStoredToken(): string | null {
  return localStorage.getItem('rt_token')
}

// 存储token
export function storeToken(token: string): void {
  localStorage.setItem('rt_token', token)
}

// 清除token
export function clearToken(): void {
  localStorage.removeItem('rt_token')
}

// 检查是否有token（不验证有效性）
export function hasToken(): boolean {
  return !!getStoredToken()
}

// 清理无效的token（简化版本）
export function cleanupInvalidToken(): boolean {
  const token = getStoredToken()
  if (!token) return false
  
  // 不在这里检查过期，让后端处理
  // 只检查token是否存在
  return true
}
