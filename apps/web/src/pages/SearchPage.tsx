import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

import { getBackendUrl } from '../utils/api'

function useBackendBaseUrl() {
    return getBackendUrl();
}

export function SearchPage() {
  const base = useBackendBaseUrl()
  const { user, loading: authLoading, authHeaders, refreshAuth, logout } = useAuth()
  const [query, setQuery] = useState('hello world')
  const [result, setResult] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)

  async function runSearch() {
    if (!user) {
      alert('请先登录')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${base}/v1/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ query }),
      })
      
      if (res.status === 401) {
        alert('认证失败，请重新登录')
        return
      }
      
      setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  // 如果正在检查认证状态，显示加载中
  if (authLoading) {
    return (
      <div style={{ 
        maxWidth: 960, 
        margin: '0 auto', 
        padding: 16,
        backgroundColor: '#ffffff',
        color: '#000000',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>正在检查认证状态...</div>
      </div>
    )
  }

  // 如果未认证，显示登录提示
  if (!user) {
    return (
      <div style={{ 
        maxWidth: 960, 
        margin: '0 auto', 
        padding: 16,
        backgroundColor: '#ffffff',
        color: '#000000',
        minHeight: '100vh'
      }}>
        <h2 style={{ color: '#000000', marginBottom: '24px' }}>Search</h2>
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: '8px', 
          color: '#856404',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '12px' }}>
            🔒 请先登录以使用搜索功能
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            登录后可以访问完整的搜索功能和结果
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#666' }}>
            调试信息: authLoading={authLoading.toString()}, user={user ? '已设置' : '未设置'}
          </div>
          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button 
              onClick={refreshAuth}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              刷新认证状态
            </button>
            <button 
              onClick={logout}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              清除认证状态
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      maxWidth: 960, 
      margin: '0 auto', 
      padding: 16,
      backgroundColor: '#ffffff',
      color: '#000000',
      minHeight: '100vh'
    }}>
      {/* 用户信息栏 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            backgroundColor: '#007bff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '16px',
            fontWeight: 'bold'
          }}>
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 'bold', color: '#000000' }}>
              {user.username}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              角色: {user.role === 'admin' ? '管理员' : '普通用户'}
            </div>
          </div>
        </div>
        <button 
          onClick={logout}
          style={{
            padding: '8px 16px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          🚪 登出
        </button>
      </div>
      
      <h2 style={{ color: '#000000', marginBottom: '24px' }}>Search</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: '24px' }}>
        <input 
          style={{ 
            flex: 1, 
            padding: '12px 16px', 
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '16px',
            color: '#000000',
            backgroundColor: '#ffffff'
          }} 
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
        />
        <button 
          onClick={runSearch} 
          disabled={loading}
          style={{
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      {result && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ color: '#000000', marginBottom: '16px' }}>Result - {result.provider}</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {(result.items || []).slice(0, 10).map((it: any, i: number) => (
              <li key={i} style={{ 
                marginBottom: '16px', 
                padding: '16px', 
                border: '1px solid #eee',
                borderRadius: '8px',
                backgroundColor: '#fafafa'
              }}>
                <a 
                  href={it.url} 
                  target="_blank" 
                  style={{ 
                    color: '#007bff', 
                    textDecoration: 'none',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    display: 'block',
                    marginBottom: '8px'
                  }}
                >
                  {it.title}
                </a>
                <div style={{ color: '#333333', fontSize: '14px', lineHeight: '1.5' }}>
                  {it.snippet}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}


