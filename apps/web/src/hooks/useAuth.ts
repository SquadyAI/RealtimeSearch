import { useState, useEffect } from 'react'
import { getBackendUrl as getBackendUrlFromUtils } from '../utils/api'

interface User {
  id: string
  username: string
  role: string
  token?: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 获取后端URL
  const getBackendUrl = () => {
    return getBackendUrlFromUtils();
  }

  useEffect(() => {
    // 从localStorage获取token，然后通过后端验证
    const checkAuth = async () => {
      console.log('🔍 useAuth: 开始认证检查')
      try {
        const storedToken = localStorage.getItem('rt_token')
        const storedUser = localStorage.getItem('rt_user')
        
        console.log('🔍 useAuth: 检查localStorage - token:', storedToken ? '存在' : '不存在', 'user:', storedUser ? '存在' : '不存在')
        
        if (storedToken && storedUser) {
          // 先设置本地状态，避免闪烁
          setToken(storedToken)
          try {
            const userData = JSON.parse(storedUser)
            setUser(userData)
          } catch {
            setUser(null)
          }
          
          // 通过后端验证token有效性
          const response = await fetch(getBackendUrl() + '/?t=' + Date.now(), {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${storedToken}`
            }
          })
          
          if (response.ok) {
            const data = await response.json()
            console.log('useAuth: 后端验证成功:', data)
            
            if (data.userLoggedIn && data.currentUser) {
              // 后端验证成功，更新用户信息
              setUser(data.currentUser)
              setToken(data.currentUser.token || storedToken)
              // 更新localStorage中的用户信息
              localStorage.setItem('rt_user', JSON.stringify(data.currentUser))
            } else {
              // 后端验证失败，清除本地状态
              console.log('useAuth: 后端验证失败，清除本地状态')
              localStorage.removeItem('rt_token')
              localStorage.removeItem('rt_user')
              setUser(null)
              setToken(null)
            }
          } else {
            // 后端验证失败，清除本地状态
            console.log('useAuth: 后端验证失败，状态码:', response.status)
            localStorage.removeItem('rt_token')
            localStorage.removeItem('rt_user')
            setUser(null)
            setToken(null)
          }
        } else {
          setUser(null)
          setToken(null)
        }
      } catch (error) {
        console.error('认证检查失败:', error)
        // 出错时清除本地状态
        localStorage.removeItem('rt_token')
        localStorage.removeItem('rt_user')
        setUser(null)
        setToken(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
    
    // 监听认证状态变化事件
    const handleAuthChange = () => {
      console.log('🔔 useAuth: 收到认证状态变化事件')
      checkAuth()
    }
    
    console.log('🔔 useAuth: 注册事件监听器')
    window.addEventListener('authStateChanged', handleAuthChange)
    window.addEventListener('storage', handleAuthChange)
    
    // 定期检查认证状态
    const interval = setInterval(checkAuth, 30000) // 30秒检查一次
    
    return () => {
      window.removeEventListener('authStateChanged', handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
      clearInterval(interval)
    }
  }, [])

  const authHeaders = () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token) {
      headers['authorization'] = `Bearer ${token}`
    }
    return headers
  }

  // 手动刷新认证状态
  const refreshAuth = async () => {
    console.log('useAuth: 手动刷新认证状态')
    setLoading(true)
    try {
      const storedToken = localStorage.getItem('rt_token')
      
      if (storedToken) {
        const response = await fetch(getBackendUrl() + '/?t=' + Date.now(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${storedToken}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log('useAuth: 手动刷新返回数据:', data)
          
          if (data.userLoggedIn && data.currentUser) {
            setUser(data.currentUser)
            setToken(data.currentUser.token || storedToken)
            localStorage.setItem('rt_user', JSON.stringify(data.currentUser))
          } else {
            // 验证失败，清除本地状态
            localStorage.removeItem('rt_token')
            localStorage.removeItem('rt_user')
            setUser(null)
            setToken(null)
          }
        } else {
          // 验证失败，清除本地状态
          localStorage.removeItem('rt_token')
          localStorage.removeItem('rt_user')
          setUser(null)
          setToken(null)
        }
      } else {
        setUser(null)
        setToken(null)
      }
    } catch (error) {
      console.error('useAuth: 手动刷新失败:', error)
      // 出错时清除本地状态
      localStorage.removeItem('rt_token')
      localStorage.removeItem('rt_user')
      setUser(null)
      setToken(null)
    } finally {
      setLoading(false)
    }
  }

  // 登出函数
  const logout = () => {
    console.log('useAuth: 执行登出')
    localStorage.removeItem('rt_token')
    localStorage.removeItem('rt_user')
    setUser(null)
    setToken(null)
    // 触发认证状态变化事件
    window.dispatchEvent(new Event('authStateChanged'))
  }

  return {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    authHeaders,
    refreshAuth,
    logout
  }
}
