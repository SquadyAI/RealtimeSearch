import { useState, useEffect } from 'react'
// import { useNavigate } from 'react-router-dom' // 暂时注释掉未使用的导入
import { useAuth } from '../hooks/useAuth'

import { getBackendUrl } from '../utils/api'

function useBackendBaseUrl() {
    return getBackendUrl();
}

interface ApiToken {
  id: string
  name: string
  permissions: 'read' | 'write' | 'admin'
  expiresAt?: string
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

export function ApiTokenPage() {
  const base = useBackendBaseUrl()
  // const navigate = useNavigate() // 暂时注释掉未使用的变量
  const { user, loading: authLoading, authHeaders } = useAuth()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  
  // 创建新token的表单状态
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenPermissions, setNewTokenPermissions] = useState<'read' | 'write' | 'admin'>('read')
  const [newTokenExpiresAt, setNewTokenExpiresAt] = useState('')
  const [newTokenExpiresAtEnabled, setNewTokenExpiresAtEnabled] = useState(false)
  
  // 新创建的token（只显示一次）
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<{
    id: string
    name: string
    token: string
    permissions: string
    expiresAt?: string
  } | null>(null)

  useEffect(() => {
    if (user) {
      loadTokens()
    }
  }, [user])

  // 如果正在检查认证状态，显示加载中
  if (authLoading) {
    return (
      <div style={{ 
        maxWidth: 1200, 
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
        maxWidth: 1200, 
        margin: '0 auto', 
        padding: 16,
        backgroundColor: '#ffffff',
        color: '#000000',
        minHeight: '100vh'
      }}>
        <h2 style={{ color: '#000000', marginBottom: '24px' }}>API Token 管理</h2>
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: '8px', 
          color: '#856404',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '12px' }}>
            🔒 请先登录以管理API Token
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            登录后可以创建和管理您的API Token
          </div>
        </div>
      </div>
    )
  }

  async function loadTokens() {
    setLoading(true)
    try {
      const response = await fetch(`${base}/v1/admin/api-tokens/list`, { 
        headers: authHeaders() 
      })
      if (response.ok) {
        const data = await response.json()
        setTokens(data.data || [])
      } else {
        setStatus('加载失败')
      }
    } catch (error) {
      setStatus('加载错误')
    } finally {
      setLoading(false)
    }
  }

  async function createToken() {
    if (!newTokenName.trim()) {
      setStatus('请输入token名称')
      return
    }

    setStatus('创建中...')
    try {
      const requestBody: any = {
        name: newTokenName.trim(),
        permissions: newTokenPermissions
      }

      if (newTokenExpiresAtEnabled && newTokenExpiresAt) {
        requestBody.expiresAt = newTokenExpiresAt
      }

      const response = await fetch(`${base}/v1/admin/api-tokens/create`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (response.ok) {
        const data = await response.json()
        setNewlyCreatedToken(data.data)
        setStatus('创建成功')
        
        // 重置表单
        setNewTokenName('')
        setNewTokenPermissions('read')
        setNewTokenExpiresAt('')
        setNewTokenExpiresAtEnabled(false)
        setShowCreateForm(false)
        
        // 重新加载token列表
        await loadTokens()
      } else {
        const errorData = await response.json()
        setStatus(`创建失败: ${errorData.error || '未知错误'}`)
      }
    } catch (error) {
      setStatus('创建错误')
    }
  }

  async function deleteToken(tokenId: string) {
    if (!confirm('确定要删除这个API Token吗？删除后无法恢复。')) {
      return
    }

    setStatus('删除中...')
    try {
      const response = await fetch(`${base}/v1/admin/api-tokens/${tokenId}`, {
        method: 'DELETE',
        headers: authHeaders()
      })

      if (response.ok) {
        setStatus('删除成功')
        await loadTokens()
      } else {
        const errorData = await response.json()
        setStatus(`删除失败: ${errorData.error || '未知错误'}`)
      }
    } catch (error) {
      setStatus('删除错误')
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setStatus('已复制到剪贴板')
    }).catch(() => {
      setStatus('复制失败')
    })
  }

  function formatDate(dateString: string) {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString('zh-CN')
  }

  function getPermissionLabel(permission: string) {
    const labels = {
      read: '只读',
      write: '读写',
      admin: '管理'
    }
    return labels[permission as keyof typeof labels] || permission
  }

  function getPermissionColor(permission: string) {
    const colors = {
      read: '#28a745',
      write: '#ffc107',
      admin: '#dc3545'
    }
    return colors[permission as keyof typeof colors] || '#6c757d'
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16, backgroundColor: '#ffffff', color: '#000000' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ color: '#000000', margin: 0 }}>API Token 管理</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          {showCreateForm ? '取消' : '创建新Token'}
        </button>
      </div>

      {status && (
        <div style={{
          padding: '12px',
          marginBottom: '16px',
          borderRadius: '6px',
          backgroundColor: status.includes('成功') ? '#d4edda' : '#f8d7da',
          color: status.includes('成功') ? '#155724' : '#721c24',
          border: `1px solid ${status.includes('成功') ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {status}
        </div>
      )}

      {/* 新创建的token显示区域 */}
      {newlyCreatedToken && (
        <div style={{
          padding: '16px',
          marginBottom: '24px',
          borderRadius: '8px',
          backgroundColor: '#e7f3ff',
          border: '1px solid #b3d9ff'
        }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#0056b3' }}>新Token创建成功！</h3>
          <div style={{ marginBottom: '12px' }}>
            <strong>名称:</strong> {newlyCreatedToken.name}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>权限:</strong> {getPermissionLabel(newlyCreatedToken.permissions)}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <strong>Token:</strong> 
            <div style={{
              padding: '8px',
              backgroundColor: '#f8f9fa',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              wordBreak: 'break-all',
              marginTop: '4px'
            }}>
              {newlyCreatedToken.token}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => copyToClipboard(newlyCreatedToken.token)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              复制Token
            </button>
            <button
              onClick={() => setNewlyCreatedToken(null)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              关闭
            </button>
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#6c757d' }}>
            ⚠️ 请保存好这个Token，它只会显示一次！
          </div>
        </div>
      )}

      {/* 创建新token的表单 */}
      {showCreateForm && (
        <div style={{
          padding: '20px',
          marginBottom: '24px',
          borderRadius: '8px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ margin: '0 0 16px 0' }}>创建新的API Token</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Token名称 *
              </label>
              <input
                type="text"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="例如：我的搜索API"
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px'
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
                  padding: '10px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="read">只读 - 只能查看数据</option>
                <option value="write">读写 - 可以查看和修改数据</option>
                <option value="admin">管理 - 完全访问权限</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={newTokenExpiresAtEnabled}
                  onChange={(e) => setNewTokenExpiresAtEnabled(e.target.checked)}
                />
                设置过期时间
              </label>
              {newTokenExpiresAtEnabled && (
                <input
                  type="datetime-local"
                  value={newTokenExpiresAt}
                  onChange={(e) => setNewTokenExpiresAt(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    marginTop: '8px'
                  }}
                />
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={createToken}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                创建Token
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Token列表 */}
      <div>
        <h3 style={{ margin: '0 0 16px 0' }}>我的API Tokens</h3>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
            加载中...
          </div>
        ) : tokens.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
            还没有API Token，点击上方按钮创建一个吧！
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tokens.map((token) => (
              <div
                key={token.id}
                style={{
                  padding: '16px',
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 8px 0' }}>{token.name}</h4>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#6c757d' }}>
                      <span>
                        权限: 
                        <span style={{ 
                          color: getPermissionColor(token.permissions),
                          fontWeight: 'bold',
                          marginLeft: '4px'
                        }}>
                          {getPermissionLabel(token.permissions)}
                        </span>
                      </span>
                      <span>创建时间: {formatDate(token.createdAt)}</span>
                      {token.lastUsedAt && (
                        <span>最后使用: {formatDate(token.lastUsedAt)}</span>
                      )}
                    </div>
                    {token.expiresAt && (
                      <div style={{ marginTop: '8px', fontSize: '14px', color: '#dc3545' }}>
                        过期时间: {formatDate(token.expiresAt)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteToken(token.id)}
                    style={{
                      padding: '6px 12px',
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

      {/* 使用说明 */}
      <div style={{
        marginTop: '32px',
        padding: '20px',
        borderRadius: '8px',
        backgroundColor: '#fff3cd',
        border: '1px solid #ffeaa7'
      }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#856404' }}>使用说明</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404' }}>
          <li>API Token用于程序化访问API，无需用户名密码</li>
          <li>创建Token后请妥善保存，系统只显示一次</li>
          <li>不同权限级别提供不同的访问范围</li>
          <li>建议为不同用途创建不同的Token</li>
          <li>可以设置过期时间增加安全性</li>
        </ul>
      </div>
    </div>
  )
}
