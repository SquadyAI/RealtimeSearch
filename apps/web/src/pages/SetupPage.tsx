import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getBackendUrl } from '../utils/api'

function useBackendBaseUrl() {
  return getBackendUrl();
}

export default function SetupPage() {
  const base = useBackendBaseUrl()
  const nav = useNavigate()
  const [status, setStatus] = useState<'loading' | 'need' | 'done' | 'error'>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // 使用后端的统一状态检查
    fetch(`${base}/`).then(r => r.json())
      .then(j => {
        if (j.bootstrap && j.bootstrap.bootstrapRequired) {
          setStatus('need')
        } else if (j.userLoggedIn && j.currentUser) {
          // 如果用户已登录，跳转到主页
          nav('/')
        } else {
          setStatus('done')
        }
      })
      .catch((error) => {
        console.error('SetupPage error:', error)
        setStatus('error')
      })
  }, [])

  async function submit() {
    setMessage('初始化中...')
    try {
      const res = await fetch(`${base}/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, role: 'admin' }),
      })
      const j = await res.json()
      if (j?.ok) {
        setMessage('管理员已创建，正在跳转登录...')
        setTimeout(() => nav('/login'), 800)
      } else {
        setMessage(j?.error || '初始化失败')
      }
    } catch (error) {
      console.error('Setup error:', error)
      setMessage('初始化失败，请检查网络连接')
    }
  }

  if (status === 'loading') return <div style={{ padding: 24, backgroundColor: '#ffffff', color: '#000000' }}>检测系统状态...</div>
  if (status === 'done') return <div style={{ padding: 24, backgroundColor: '#ffffff', color: '#000000' }}>系统已完成初始化，<a href="/login" style={{ color: '#007bff' }}>前往登录</a></div>
  if (status === 'error') return <div style={{ padding: 24, backgroundColor: '#ffffff', color: '#000000' }}>状态检查失败，请稍后重试</div>

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: 16, backgroundColor: '#ffffff', color: '#000000' }}>
      <h2 style={{ color: '#000000', textAlign: 'center', marginBottom: '16px' }}>🎉 欢迎使用 Search API</h2>
      <div style={{ 
        backgroundColor: '#f8f9fa', 
        border: '1px solid #e9ecef', 
        borderRadius: '8px', 
        padding: '16px', 
        marginBottom: '24px',
        color: '#495057'
      }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#000000', fontSize: '16px' }}>🔐 系统初始化</h3>
        <p style={{ margin: '0 0 8px 0', lineHeight: '1.5' }}>
          这是您首次使用系统，需要创建第一个用户账号。
        </p>
        <p style={{ margin: '0', lineHeight: '1.5', fontWeight: 'bold', color: '#dc3545' }}>
          ⚠️ 重要：第一个创建的账号将自动获得管理员权限！
        </p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', color: '#000000' }}>
            用户名 *
          </label>
          <input 
            placeholder="请输入用户名" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={{ 
              width: '100%',
              padding: '12px', 
              border: '1px solid #e0e0e0', 
              borderRadius: '6px', 
              backgroundColor: '#ffffff', 
              color: '#000000',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', color: '#000000' }}>
            密码 *
          </label>
          <input 
            placeholder="请输入密码" 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            style={{ 
              width: '100%',
              padding: '12px', 
              border: '1px solid #e0e0e0', 
              borderRadius: '6px', 
              backgroundColor: '#ffffff', 
              color: '#000000',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>
        
        <button 
          onClick={submit} 
          disabled={!username || !password}
          style={{ 
            padding: '12px', 
            backgroundColor: '#007bff', 
            color: '#ffffff', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            opacity: (!username || !password) ? 0.6 : 1
          }}
        >
          创建管理员账号
        </button>
        
        {message && (
          <div style={{ 
            padding: '12px', 
            borderRadius: '6px', 
            backgroundColor: message.includes('成功') ? '#d4edda' : '#f8d7da',
            color: message.includes('成功') ? '#155724' : '#721c24',
            border: `1px solid ${message.includes('成功') ? '#c3e6cb' : '#f5c6cb'}`,
            textAlign: 'center'
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}


