import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useAuth } from '../../hooks/useAuth'

type SummaryRow = { engine: string; success: number; failure: number; avgLatencyMs: number | null }

import { getBackendUrl } from '../../utils/api'

function useBackendBaseUrl() {
    return getBackendUrl();
}

export function AdminDashboard() {
  const base = useBackendBaseUrl()
  const { user, authHeaders } = useAuth()
  const [summary, setSummary] = useState<{ totalRequests: number; byEngine?: SummaryRow[] } | any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [engines, setEngines] = useState<string[]>([])
  
  // 安全的引擎设置函数
  const setEnginesSafe = (newEngines: any[]) => {
    const safeEngines = newEngines
      .map(engine => {
        if (typeof engine === 'string') return engine
        if (engine && typeof engine === 'object' && typeof engine.name === 'string') return engine.name
        return null
      })
      .filter((name): name is string => name !== null && typeof name === 'string')
    
    console.log('Setting engines safely:', safeEngines)
    setEngines(safeEngines)
  }
  const [engineName, setEngineName] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const [codeStatus, setCodeStatus] = useState<string>('')
  const [testQuery, setTestQuery] = useState<string>('hello world')
  const [testResult, setTestResult] = useState<any>(null)
  const [keys, setKeys] = useState<Array<{ key: string; rps?: number; monthlyQuota?: number; httpProxy?: string }>>([])
  const [keysStatus, setKeysStatus] = useState<string>('')
  const [engineHttpProxy, setEngineHttpProxy] = useState<string>('')

  // API Token 管理状态
  const [apiTokens, setApiTokens] = useState<Array<{
    id: string;
    name: string;
    permissions: 'read' | 'write' | 'admin';
    expiresAt?: string;
    lastUsedAt?: string;
    createdAt: string;
  }>>([])
  const [apiTokensStatus, setApiTokensStatus] = useState<string>('')
  const [showCreateTokenForm, setShowCreateTokenForm] = useState<boolean>(false)
  const [newTokenName, setNewTokenName] = useState<string>('')
  const [newTokenPermissions, setNewTokenPermissions] = useState<'read' | 'write' | 'admin'>('read')
  const [newTokenExpiresAt, setNewTokenExpiresAt] = useState<string>('')
  const [createdToken, setCreatedToken] = useState<{ name: string; token: string } | null>(null)

  const summaryRows: SummaryRow[] = useMemo(() => {
    if (!summary || !summary.byEngine) return []
    
    const be: any = summary.byEngine
    
    // 如果是数组，确保每个元素都是有效的 SummaryRow
    if (Array.isArray(be)) {
      return be.map((item: any) => {
        // 如果 item 已经是 SummaryRow 格式
        if (item && typeof item === 'object' && typeof item.engine === 'string') {
          return {
            engine: String(item.engine),
            success: Number(item?.success || 0),
            failure: Number(item?.failure || 0),
            avgLatencyMs: typeof item?.avgLatencyMs === 'number' 
              ? item.avgLatencyMs 
              : (typeof item?.totalLatencyMs === 'number' && (Number(item?.success || 0) + Number(item?.failure || 0)) > 0)
                ? Math.round(item.totalLatencyMs / (Number(item?.success || 0) + Number(item?.failure || 0)))
                : null,
          }
        }
        
        // 如果 item 是引擎对象，跳过它
        if (item && typeof item === 'object' && (item.name || item.type || item.addedToConfig || item.tlbSynced || item.note)) {
          console.warn('Skipping engine object in summary:', item)
          return null
        }
        
        // 如果数据无效，返回默认值
        console.warn('Invalid summary item:', item)
        return null
      }).filter((row: SummaryRow | null): row is SummaryRow => row !== null)
    }
    
    // 如果是对象，转换为数组
    return Object.entries(be || {}).map(([engine, v]: [string, any]) => {
      const success = Number(v?.success || 0)
      const failure = Number(v?.failure || 0)
      const hasAvg = typeof v?.avgLatencyMs === 'number'
      const totalLatencyMs = typeof v?.totalLatencyMs === 'number' ? v.totalLatencyMs : undefined
      const denom = success + failure
      const avg = hasAvg
        ? v.avgLatencyMs
        : typeof totalLatencyMs === 'number' && denom > 0
        ? Math.round(totalLatencyMs / denom)
        : null
      return { engine: String(engine), success, failure, avgLatencyMs: avg }
    })
  }, [summary])

  async function refresh() {
    try {
      const [s, l] = await Promise.all([
        fetch(`${base}/v1/admin/stats/summary`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${base}/v1/admin/logs/recent?limit=50`, { headers: authHeaders() }).then(r => r.json()),
      ])
      setSummary(s)
      setLogs(l.rows || [])
    } catch {}
  }

  async function loadEngines() {
    try {
      const res = await fetch(`${base}/v1/admin/search/engines`, { headers: authHeaders() })
      const j = await res.json()
      
      console.log('Raw engines data from backend:', j?.engines)
      
      // 使用安全的引擎设置函数
      if (j?.engines && Array.isArray(j.engines)) {
        setEnginesSafe(j.engines)
      } else {
        console.warn('No engines data or invalid format:', j?.engines)
        setEnginesSafe([])
      }
      
      // 设置默认引擎名称
      if (!engineName && engines.length > 0) {
        setEngineName(engines[0])
      }
    } catch (error) {
      console.error('Failed to load engines:', error)
      setEnginesSafe([])
    }
  }

  async function loadCode() {
    if (!engineName) { setCodeStatus('请选择引擎'); return }
    setCodeStatus('加载中...')
    setTestResult(null)
    try {
              const res = await fetch(`${base}/v1/admin/search/engines/${encodeURIComponent(engineName)}/code`, { headers: authHeaders() })
      const j = await res.json()
      if (j?.code) {
        setCode(j.code)
        setCodeStatus('已加载')
      } else {
        setCode('')
        setCodeStatus('未找到代码')
      }
    } catch {
      setCodeStatus('加载失败')
    }
  }

  async function saveCode() {
    if (!engineName) { setCodeStatus('请选择引擎'); return }
    setCodeStatus('保存中...')
    try {
      const res = await fetch(`${base}/v1/admin/search/engines/${encodeURIComponent(engineName)}/code`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ code })
      })
      const j = await res.json()
      if (j?.ok) setCodeStatus('已保存并热重载')
      else setCodeStatus('保存失败')
    } catch {
      setCodeStatus('保存失败')
    }
  }

  async function testEngine() {
    if (!engineName) { setCodeStatus('请选择引擎'); return }
    setCodeStatus('测试中...')
    setTestResult(null)
    try {
              const res = await fetch(`${base}/v1/admin/search/engines/${encodeURIComponent(engineName)}/test`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ query: testQuery })
      })
      const j = await res.json()
      setTestResult(j)
      setCodeStatus(res.ok ? '测试完成' : '测试失败')
    } catch {
      setCodeStatus('测试失败')
    }
  }

  async function loadKeys() {
    if (!engineName) { setKeysStatus('请选择引擎'); return }
    setKeysStatus('加载中...')
    try {
      const res = await fetch(`${base}/v1/admin/keys/list?engine=${encodeURIComponent(engineName)}`, { headers: authHeaders() })
      const j = await res.json()
      const row = Array.isArray(j?.engines) && j.engines.length > 0 ? j.engines[0] : null
      const list = Array.isArray(row?.keys) ? row.keys : []
      setKeys(list.map((k: any) => ({ key: String(k.key || ''), rps: k.rps ?? undefined, monthlyQuota: k.monthlyQuota ?? undefined, httpProxy: k.httpProxy ?? undefined })))
      setEngineHttpProxy(String(row?.httpProxy || ''))
      setKeysStatus('已加载')
    } catch {
      setKeysStatus('加载失败')
    }
  }

  function updateKey(idx: number, field: 'key' | 'rps' | 'monthlyQuota' | 'httpProxy', value: string) {
    setKeys(prev => {
      const next = [...prev]
      const row = { ...next[idx] }
      if (field === 'rps' || field === 'monthlyQuota') {
        const n = value.trim() === '' ? undefined : Number(value)
        row[field] = Number.isFinite(n) ? (n as number) : undefined
      } else {
        ;(row as any)[field] = value
      }
      next[idx] = row
      return next
    })
  }

  function addKeyRow() {
    setKeys(prev => [...prev, { key: '', rps: undefined, monthlyQuota: undefined, httpProxy: undefined }])
  }

  function removeKeyRow(idx: number) {
    setKeys(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveKeys() {
    if (!engineName) { setKeysStatus('请选择引擎'); return }
    setKeysStatus('保存中...')
    try {
      const res = await fetch(`${base}/v1/admin/keys/set`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ engine: engineName, keys })
      })
      const j = await res.json()
      setKeysStatus(j?.ok ? '已保存' : '保存失败')
    } catch {
      setKeysStatus('保存失败')
    }
  }

  async function saveEngineProxy() {
    if (!engineName) { setKeysStatus('请选择引擎'); return }
    setKeysStatus('保存代理中...')
    try {
              const res = await fetch(`${base}/v1/admin/search/engines/proxy/set`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ engine: engineName, proxy: engineHttpProxy || null })
      })
      const j = await res.json()
      setKeysStatus(j?.ok ? '代理已保存' : '保存代理失败')
    } catch {
      setKeysStatus('保存代理失败')
    }
  }

  // API Token 管理函数
  async function loadApiTokens() {
    setApiTokensStatus('加载中...')
    try {
      const res = await fetch(`${base}/v1/admin/api-tokens/list`, { headers: authHeaders() })
      const j = await res.json()
      if (j?.success) {
        setApiTokens(j.data || [])
        setApiTokensStatus('已加载')
      } else {
        setApiTokensStatus('加载失败')
      }
    } catch {
      setApiTokensStatus('加载失败')
    }
  }

  async function createApiToken() {
    if (!newTokenName.trim()) {
      setApiTokensStatus('请输入Token名称')
      return
    }

    setApiTokensStatus('创建中...')
    try {
      const requestBody: any = {
        name: newTokenName.trim(),
        permissions: newTokenPermissions
      }

      if (newTokenExpiresAt) {
        requestBody.expiresAt = newTokenExpiresAt
      }

      const res = await fetch(`${base}/v1/admin/api-tokens/create`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      const j = await res.json()

      if (j?.success) {
        setApiTokensStatus('Token创建成功')
        // 保存创建的token信息用于显示
        setCreatedToken({ name: j.data.name, token: j.data.token })
        // 重新加载列表
        await loadApiTokens()
        // 重置表单
        setNewTokenName('')
        setNewTokenPermissions('read')
        setNewTokenExpiresAt('')
        setShowCreateTokenForm(false)
      } else {
        setApiTokensStatus(j?.error || '创建失败')
      }
    } catch {
      setApiTokensStatus('创建失败')
    }
  }

  async function deleteApiToken(tokenId: string) {
    if (!confirm('确定要删除这个API Token吗？删除后无法恢复。')) {
      return
    }

    setApiTokensStatus('删除中...')
    try {
      const res = await fetch(`${base}/v1/admin/api-tokens/${tokenId}`, {
        method: 'DELETE',
        headers: authHeaders()
      })
      const j = await res.json()

      if (j?.success) {
        setApiTokensStatus('Token删除成功')
        // 重新加载列表
        await loadApiTokens()
      } else {
        setApiTokensStatus('删除失败')
      }
    } catch {
      setApiTokensStatus('删除失败')
    }
  }

  function copyTokenToClipboard(token: string, tokenName?: string) {
    navigator.clipboard.writeText(token).then(() => {
      setApiTokensStatus(`${tokenName || 'Token'}已复制到剪贴板`)
    }).catch(() => {
      setApiTokensStatus('复制失败')
    })
  }

  useEffect(() => {
    // 用户状态由useAuth Hook管理，这里只需要加载其他数据
    loadEngines()
    loadApiTokens()
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [])

  // 额外的安全检查：确保 engines 数组始终是安全的
  useEffect(() => {
    if (engines.length > 0) {
      const hasInvalidEngines = engines.some(engine => typeof engine !== 'string')
      if (hasInvalidEngines) {
        console.warn('Detected invalid engines in state, filtering out:', engines)
        const safeEngines = engines.filter(engine => typeof engine === 'string')
        setEngines(safeEngines)
      }
    }
  }, [engines])

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16, backgroundColor: '#ffffff', color: '#000000' }}>
        <h2 style={{ color: '#000000' }}>需要管理员权限</h2>
        <p style={{ color: '#000000' }}>请先登录管理员账户后再访问此页面。</p>
        <p style={{ color: '#000000' }}><a href="/login" style={{ color: '#007bff' }}>前往登录</a></p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1024, margin: '0 auto', padding: 16, backgroundColor: '#ffffff', color: '#000000' }}>
      <h2 style={{ color: '#000000' }}>Admin Dashboard</h2>

      <div style={{ marginTop: 24, padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: '#ffffff' }}>
        <h3 style={{ color: '#000000' }}>引擎代码在线编辑</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label>Engine:</label>
          <select value={engineName} onChange={(e) => setEngineName(e.target.value)}>
            {engines.map((engineName) => {
              // 确保引擎名称是字符串
              const safeEngineName = String(engineName || '')
              return (
                <option key={safeEngineName} value={safeEngineName}>
                  {safeEngineName}
                </option>
              )
            })}
          </select>
          <button onClick={loadCode}>加载代码</button>
          <button onClick={saveCode} disabled={!code}>保存并热重载</button>
          <span style={{ color: '#666' }}>{codeStatus}</span>
        </div>
        <div style={{ border: '1px solid #eee' }}>
          <Editor
            height={360}
            defaultLanguage="typescript"
            value={code}
            onChange={(v: string | undefined) => setCode(v || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>测试查询:</label>
          <input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} style={{ flex: 1, padding: 6 }} />
          <button onClick={testEngine} disabled={!engineName}>测试引擎</button>
        </div>
        {testResult && (
          <pre style={{ maxHeight: 200, overflow: 'auto', background: '#fafafa', padding: 8, marginTop: 8 }}>
            {typeof testResult === 'string' ? testResult : JSON.stringify(testResult, null, 2)}
          </pre>
        )}
      </div>

      <div style={{ marginTop: 24, padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: '#ffffff' }}>
        <h3 style={{ color: '#000000' }}>API Key 管理</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label>Engine:</label>
          <select value={engineName} onChange={(e) => setEngineName(e.target.value)}>
            {engines.map((engineName) => {
              // 确保引擎名称是字符串
              const safeEngineName = String(engineName || '')
              return (
                <option key={safeEngineName} value={safeEngineName}>
                  {safeEngineName}
                </option>
              )
            })}
          </select>
          <button onClick={loadKeys} disabled={!engineName}>加载 Keys</button>
          <button onClick={addKeyRow} disabled={!engineName}>新增 Key</button>
          <button onClick={saveKeys} disabled={!engineName}>保存 Keys</button>
          <span style={{ color: '#666' }}>{keysStatus}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label>Engine 代理:</label>
          <input style={{ flex: 1, padding: 6 }} value={engineHttpProxy} onChange={(e) => setEngineHttpProxy(e.target.value)} placeholder="http(s)://proxy:port 或留空" />
          <button onClick={saveEngineProxy} disabled={!engineName}>保存代理</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Key</th>
                <th style={{ textAlign: 'left' }}>RPS</th>
                <th style={{ textAlign: 'left' }}>Monthly Quota</th>
                <th style={{ textAlign: 'left' }}>Per-key Proxy</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((row, i) => (
                <tr key={i}>
                  <td><input value={row.key} onChange={(e) => updateKey(i, 'key', e.target.value)} /></td>
                  <td><input value={row.rps ?? ''} onChange={(e) => updateKey(i, 'rps', e.target.value)} placeholder="数字或留空" /></td>
                  <td><input value={row.monthlyQuota ?? ''} onChange={(e) => updateKey(i, 'monthlyQuota', e.target.value)} placeholder="数字或留空" /></td>
                  <td><input value={row.httpProxy ?? ''} onChange={(e) => updateKey(i, 'httpProxy', e.target.value)} placeholder="可覆盖 Engine 代理" /></td>
                  <td><button onClick={() => removeKeyRow(i)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 24, padding: 12, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: '#ffffff' }}>
        <h3 style={{ color: '#000000' }}>API Token 管理</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button onClick={loadApiTokens}>刷新列表</button>
          <button onClick={() => setShowCreateTokenForm(!showCreateTokenForm)}>
            {showCreateTokenForm ? '取消创建' : '创建新Token'}
          </button>
          <span style={{ color: '#666' }}>{apiTokensStatus}</span>
        </div>

        {createdToken && (
          <div style={{ marginBottom: 16, padding: 12, border: '1px solid #4CAF50', borderRadius: 4, backgroundColor: '#e8f5e8' }}>
            <h4 style={{ marginTop: 0, color: '#2e7d32' }}>✅ Token创建成功</h4>
            <div style={{ marginBottom: 8 }}>
              <strong>名称:</strong> {createdToken.name}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Token:</strong>
              <code style={{
                backgroundColor: '#f5f5f5',
                padding: '4px 8px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                display: 'block',
                marginTop: '4px'
              }}>
                {createdToken.token}
              </code>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => copyTokenToClipboard(createdToken.token, createdToken.name)}>
                复制Token
              </button>
              <button onClick={() => setCreatedToken(null)}>
                关闭
              </button>
            </div>
          </div>
        )}

        {showCreateTokenForm && (
          <div style={{ marginBottom: 16, padding: 12, border: '1px solid #ddd', borderRadius: 4, backgroundColor: '#f9f9f9' }}>
            <h4 style={{ marginTop: 0, color: '#000000' }}>创建新API Token</h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label>名称:</label>
              <input
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="Token名称"
                style={{ flex: 1, padding: 6 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label>权限:</label>
              <select
                value={newTokenPermissions}
                onChange={(e) => setNewTokenPermissions(e.target.value as 'read' | 'write' | 'admin')}
                style={{ padding: 6 }}
              >
                <option value="read">只读权限</option>
                <option value="write">读写权限</option>
                <option value="admin">管理权限</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label>过期时间:</label>
              <input
                type="datetime-local"
                value={newTokenExpiresAt}
                onChange={(e) => setNewTokenExpiresAt(e.target.value)}
                style={{ padding: 6 }}
              />
              <span style={{ fontSize: '12px', color: '#666' }}>留空表示永不过期</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={createApiToken}>创建Token</button>
              <button onClick={() => setShowCreateTokenForm(false)}>取消</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>名称</th>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>权限</th>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>创建时间</th>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>过期时间</th>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>最后使用</th>
                <th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {apiTokens.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#666', border: '1px solid #ddd' }}>
                    暂无API Token，请点击"创建新Token"按钮添加
                  </td>
                </tr>
              ) : (
                apiTokens.map((token) => (
                  <tr key={token.id} style={{ border: '1px solid #ddd' }}>
                    <td style={{ padding: 8, border: '1px solid #ddd' }}>{token.name}</td>
                    <td style={{ padding: 8, border: '1px solid #ddd' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor:
                          token.permissions === 'admin' ? '#ff4444' :
                          token.permissions === 'write' ? '#ffaa00' : '#44aa44',
                        color: 'white'
                      }}>
                        {token.permissions === 'admin' ? '管理' :
                         token.permissions === 'write' ? '读写' : '只读'}
                      </span>
                    </td>
                    <td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
                      {new Date(token.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
                      {token.expiresAt ? new Date(token.expiresAt).toLocaleString() : '永不过期'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
                      {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : '从未使用'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #ddd' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => copyTokenToClipboard(`rt_${token.id}`, token.name)}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                          title="复制Token前缀（完整token只能在创建时看到）"
                        >
                          复制前缀
                        </button>
                        <button
                          onClick={() => deleteApiToken(token.id)}
                          style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#ff4444', color: 'white' }}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {apiTokens.length > 0 && (
          <div style={{ marginTop: 12, padding: 8, backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: 4 }}>
            <strong>重要提示：</strong>
            <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
              <li>API Token的完整值只在创建时显示一次，请务必立即复制保存</li>
              <li>列表中只显示Token的前缀（rt_ + ID），用于识别不同Token</li>
              <li>使用API Token时，请在HTTP请求的Authorization头部添加：Bearer + 完整token值</li>
              <li>不同权限的Token有不同的访问级别，请根据需要选择合适的权限</li>
            </ul>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ color: '#000000' }}>Summary</h3>
        {summaryRows.length > 0 ? (
          <table style={{ color: '#000000' }}>
            <thead>
              <tr>
                <th style={{ color: '#000000' }}>Engine</th>
                <th style={{ color: '#000000' }}>Success</th>
                <th style={{ color: '#000000' }}>Failure</th>
                <th style={{ color: '#000000' }}>Avg Latency (ms)</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((r: SummaryRow) => (
                <tr key={r.engine} style={{ color: '#000000' }}>
                  <td>{r.engine}</td>
                  <td>{r.success}</td>
                  <td>{r.failure}</td>
                  <td>{r.avgLatencyMs ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre style={{ color: '#000000' }}>{JSON.stringify(summary, null, 2)}</pre>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ color: '#000000' }}>Recent Logs</h3>
        <ul style={{ color: '#000000' }}>
          {logs.map((row, i) => (
            <li key={i} style={{ color: '#000000' }}>
              <span>{String(row.timestamp || '')}</span> · <b>{String(row.usedEngine || '—')}</b> · {String(row.query || '')}
              {row.username ? <span> · {String(row.username)}</span> : null}
              {row.error ? <span style={{ color: 'crimson' }}> · {String(row.error)}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}


