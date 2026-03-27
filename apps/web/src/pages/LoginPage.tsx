import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBackendUrl as getBackendUrlFromUtils } from '../utils/api'

export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const navigate = useNavigate()

  // 检查是否已经登录
  useEffect(() => {
    const checkLoginStatus = async () => {
      try {

        // 获取后端URL
        const getBackendUrl = () => {
          return getBackendUrlFromUtils();
        }
        
        const response = await fetch(getBackendUrl() + '/')
        if (response.ok) {
          const data = await response.json()
          if (data.userLoggedIn && data.currentUser) {
            // 用户已登录，跳转到主页
            navigate('/')
          }
        }
      } catch (error) {
        console.error('检查登录状态失败:', error)
      }
    }
    
    checkLoginStatus()
  }, [navigate])

  async function login() {
    setStatus('登录中...')
    try {
      const res = await fetch(`${getBackendUrlFromUtils()}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const j = await res.json()
      if (j.token) {
        setStatus('登录成功')
        // 登录成功后，将token和用户信息存储到localStorage
        localStorage.setItem('rt_token', j.token)
        if (j.user) {
          localStorage.setItem('rt_user', JSON.stringify(j.user))
        }
        // 触发认证状态变化事件
        window.dispatchEvent(new Event('authStateChanged'))
        // 跳转到主页
        navigate('/')
      } else {
        setStatus('登录失败')
      }
    } catch (error) {
      console.error('登录错误:', error)
      setStatus('登录错误')
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 16, backgroundColor: '#ffffff', color: '#000000' }}>
      <h2 style={{ color: '#000000', textAlign: 'center', marginBottom: '24px' }}>用户登录</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input 
          placeholder="用户名" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)}
          style={{ padding: '12px', border: '1px solid #e0e0e0', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', fontSize: '14px' }}
        />
        <input 
          placeholder="密码" 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '12px', border: '1px solid #e0e0e0', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', fontSize: '14px' }}
        />
        <button 
          onClick={login}
          style={{ 
            padding: '12px', 
            backgroundColor: '#007bff', 
            color: '#ffffff', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '500'
          }}
        >
          登录
        </button>
        <div style={{ color: '#666666', textAlign: 'center', fontSize: '14px' }}>{status}</div>
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button 
            onClick={onSwitchToRegister}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#007bff', 
              cursor: 'pointer', 
              textDecoration: 'underline',
              fontSize: '14px'
            }}
          >
            没有账号？点击注册
          </button>
        </div>
      </div>
    </div>
  )
}


