import { useState } from 'react'

export function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState('')

  async function register() {
    if (password !== confirmPassword) {
      setStatus('密码不匹配')
      return
    }

    if (password.length < 6) {
      setStatus('密码长度至少6位')
      return
    }

    setStatus('注册中...')
    try {
      const res = await fetch(`/v1/auth/signup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const j = await res.json()
      if (j.ok) {
        setStatus('注册成功！请登录')
        // 清空表单
        setUsername('')
        setPassword('')
        setConfirmPassword('')
        // 延迟切换到登录页面
        setTimeout(() => {
          onSwitchToLogin()
        }, 2000)
      } else {
        setStatus(j.error || '注册失败')
      }
    } catch {
      setStatus('注册错误')
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 16, backgroundColor: '#ffffff', color: '#000000' }}>
      <h2 style={{ color: '#000000', textAlign: 'center', marginBottom: '24px' }}>用户注册</h2>
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
        <input 
          placeholder="确认密码" 
          type="password" 
          value={confirmPassword} 
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{ padding: '12px', border: '1px solid #e0e0e0', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', fontSize: '14px' }}
        />
        <button 
          onClick={register}
          style={{ 
            padding: '12px', 
            backgroundColor: '#28a745', 
            color: '#ffffff', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '500'
          }}
        >
          注册
        </button>
        <div style={{ color: '#666666', textAlign: 'center', fontSize: '14px' }}>{status}</div>
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button 
            onClick={onSwitchToLogin}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#007bff', 
              cursor: 'pointer', 
              textDecoration: 'underline',
              fontSize: '14px'
            }}
          >
            已有账号？点击登录
          </button>
        </div>
      </div>
    </div>
  )
}
