import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

import { getBackendUrl } from '../utils/api'

function useBackendBaseUrl() {
    return getBackendUrl();
}

export function UserHistoryPage() {
  const base = useBackendBaseUrl()
  const [rows, setRows] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'history' | 'tokens'>('history')
  const { user, loading: authLoading, authHeaders } = useAuth()
  
  // API Token管理状态
  const [apiTokens, setApiTokens] = useState<any[]>([])
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenPermissions, setNewTokenPermissions] = useState<'read' | 'write' | 'admin' | ''>('')
  const [newTokenExpiresAt, setNewTokenExpiresAt] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [loadingTokens, setLoadingTokens] = useState(false)

  // 加载搜索历史
  useEffect(() => {
    if (user && activeTab === 'history') {
      fetch(`${base}/v1/user/logs/recent?limit=50`, { headers: authHeaders() })
        .then(r => r.json()).then(j => setRows(j.rows || [])).catch(() => setRows([]))
    }
  }, [user, base, activeTab])

  // 加载API Tokens
  useEffect(() => {
    if (user && activeTab === 'tokens') {
      loadApiTokens()
    }
  }, [user, activeTab])

  // 加载API Tokens函数
  const loadApiTokens = async () => {
    setLoadingTokens(true)
    try {
      const response = await fetch(`${base}/v1/admin/api-tokens/list`, { 
        headers: authHeaders() 
      })
      if (response.ok) {
        const data = await response.json()
        setApiTokens(data.data || [])
      }
    } catch (error) {
      console.error('加载API Tokens失败:', error)
    } finally {
      setLoadingTokens(false)
    }
  }

  // 创建API Token
  const createApiToken = async () => {
    if (!newTokenName.trim() || !newTokenPermissions) {
      alert('请填写Token名称和选择权限')
      return
    }
    
    try {
      const response = await fetch(`${base}/v1/admin/api-tokens/create`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: newTokenName,
          permissions: newTokenPermissions,
          expiresAt: newTokenExpiresAt || null
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        const tokenToCopy = data.data.token
        
        // 显示Token复制弹窗
        const copyMessage = `API Token创建成功！

Token: ${tokenToCopy}

⚠️ 重要提示：此Token只会显示一次，请立即复制保存！

点击确定后，Token将无法再次查看。`

        if (confirm(copyMessage)) {
          // 尝试复制到剪贴板
          try {
            await navigator.clipboard.writeText(tokenToCopy)
            alert('✅ Token已成功复制到剪贴板！\n\n现在可以关闭此页面，Token已保存。')
          } catch (copyError) {
            // 如果复制失败，显示手动复制提示
            alert(`📋 Token复制失败，请手动复制：

${tokenToCopy}

请将此Token保存到安全的地方！`)
          }
        }
        
        setNewTokenName('')
        setNewTokenPermissions('')
        setNewTokenExpiresAt('')
        setShowCreateForm(false)
        loadApiTokens()
      } else {
        const error = await response.json()
        alert(`创建失败: ${error.error}`)
      }
    } catch (error) {
      console.error('创建API Token失败:', error)
      alert('创建失败，请重试')
    }
  }

  // 删除API Token
  const deleteApiToken = async (tokenId: string) => {
    if (!confirm('确定要删除这个API Token吗？删除后无法恢复。')) return
    
    console.log('尝试删除Token:', tokenId)
    
    try {
      const response = await fetch(`${base}/v1/admin/api-tokens/delete`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ tokenId })
      })
      
      console.log('删除响应状态:', response.status)
      
      if (response.ok) {
        alert('API Token删除成功')
        loadApiTokens()
      } else {
        const error = await response.json()
        console.error('删除失败响应:', error)
        alert(`删除失败: ${error.error}`)
      }
    } catch (error) {
      console.error('删除API Token失败:', error)
      alert('删除失败，请重试')
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
        <h2 style={{ color: '#000000', marginBottom: '24px' }}>My Search History</h2>
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: '8px', 
          color: '#856404',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '12px' }}>
            🔒 请先登录以查看搜索历史
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            登录后可以查看您的搜索记录
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 16, backgroundColor: '#ffffff', color: '#000000' }}>
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
          onClick={() => {
            localStorage.removeItem('rt_token')
            localStorage.removeItem('rt_user')
            window.dispatchEvent(new Event('authStateChanged'))
            window.location.reload()
          }}
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
      
      <h2 style={{ color: '#000000' }}>用户中心</h2>
      
      {/* 标签页 */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '1px solid #e9ecef',
        marginBottom: '24px'
      }}>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '12px 24px',
            border: 'none',
            backgroundColor: activeTab === 'history' ? '#007bff' : 'transparent',
            color: activeTab === 'history' ? 'white' : '#666',
            cursor: 'pointer',
            borderBottom: activeTab === 'history' ? '2px solid #007bff' : 'none'
          }}
        >
          搜索历史
        </button>
        <button
          onClick={() => setActiveTab('tokens')}
          style={{
            padding: '12px 24px',
            border: 'none',
            backgroundColor: activeTab === 'tokens' ? '#007bff' : 'transparent',
            color: activeTab === 'tokens' ? 'white' : '#666',
            cursor: 'pointer',
            borderBottom: activeTab === 'tokens' ? '2px solid #007bff' : 'none'
          }}
        >
          API Tokens
        </button>
      </div>

      {/* 搜索历史标签页 */}
      {activeTab === 'history' && (
        <div>
          <h3 style={{ color: '#000000', marginBottom: '16px' }}>搜索历史</h3>
          <ul style={{ color: '#000000' }}>
            {rows.map((row, i) => (
              <li key={i} style={{ color: '#000000' }}>
                <span>{row.timestamp}</span> · <b>{row.usedEngine || '—'}</b> · {row.query}
                {typeof row.latencyMs === 'number' ? <span> · {row.latencyMs} ms</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* API Tokens标签页 */}
      {activeTab === 'tokens' && (
        <div>
          <h3 style={{ color: '#000000', marginBottom: '16px' }}>API Token管理</h3>
          
          {/* 创建新Token按钮 */}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '16px'
            }}
          >
            {showCreateForm ? '取消' : '创建新Token'}
          </button>

          {/* 创建Token表单 */}
          {showCreateForm && (
            <div style={{
              padding: '16px',
              border: '1px solid #e9ecef',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa',
              marginBottom: '24px'
            }}>
              <h4 style={{ marginBottom: '16px' }}>创建新的API Token</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                    Token名称 *
                  </label>
                  <input
                    type="text"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    placeholder="例如：开发环境、生产环境、第三方集成"
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                    权限级别 *
                  </label>
                  <select
                    value={newTokenPermissions}
                    onChange={(e) => setNewTokenPermissions(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                    required
                  >
                    <option value="">请选择权限</option>
                    <option value="read">只读 (read)</option>
                    <option value="write">读写 (write)</option>
                    <option value="admin">管理员 (admin)</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                    过期时间（可选）
                  </label>
                  <input
                    type="datetime-local"
                    value={newTokenExpiresAt}
                    onChange={(e) => setNewTokenExpiresAt(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                  <small style={{ color: '#666' }}>
                    留空表示永不过期
                  </small>
                </div>
                
                <button
                  onClick={createApiToken}
                  disabled={!newTokenName.trim()}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    alignSelf: 'flex-start'
                  }}
                >
                  创建Token
                </button>
              </div>
            </div>
          )}

          {/* Token列表 */}
          <div>
            <h4 style={{ marginBottom: '16px' }}>我的API Tokens</h4>
            {loadingTokens ? (
              <div>加载中...</div>
            ) : apiTokens.length === 0 ? (
              <div style={{ color: '#666', fontStyle: 'italic' }}>
                还没有创建任何API Token
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {apiTokens.map((token) => (
                  <div
                    key={token.id}
                    style={{
                      padding: '16px',
                      border: '1px solid #e9ecef',
                      borderRadius: '8px',
                      backgroundColor: 'white'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          {token.name}
                        </div>
                        <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                          权限: {token.permissions} | 
                          创建时间: {new Date(token.createdAt).toLocaleString('zh-CN')}
                          {token.expiresAt && ` | 过期时间: ${new Date(token.expiresAt).toLocaleString('zh-CN')}`}
                          {token.lastUsedAt && ` | 最后使用: ${new Date(token.lastUsedAt).toLocaleString('zh-CN')}`}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteApiToken(token.id)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


