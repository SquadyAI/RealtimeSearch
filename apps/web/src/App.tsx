import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { EngineStatusPage } from './pages/EngineStatusPage'
import { ApiTokenPage } from './pages/ApiTokenPage'
import { getBackendUrl } from './utils/api'

type SummaryRow = { engine: string; success: number; failure: number; avgLatencyMs: number | null }

function useBackendBaseUrl() {
  return getBackendUrl();
}

function App() {
  const base = useBackendBaseUrl()
  const [query, setQuery] = useState('hello world')
  const [result, setResult] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{ totalRequests: number; byEngine?: SummaryRow[] } | any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [userLogs, setUserLogs] = useState<any[]>([])
  const [codeName, setCodeName] = useState('serper')
  const [code, setCode] = useState('')
  const [codeStatus, setCodeStatus] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; username: string; role: string } | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [currentPage, setCurrentPage] = useState<'main' | 'tlb' | 'engines' | 'api-tokens'>('main')
  const [tlbStatus, setTlbStatus] = useState<any>(null)
  const [tlbLoading, setTlbLoading] = useState(false)

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

  function authHeaders() {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    // 从当前状态获取Token，不依赖localStorage
    if (token) {
      h['authorization'] = `Bearer ${token}`
    }
    return h
  }

  async function runSearch() {
    setLoading(true)
    try {
      const res = await fetch(`${base}/v1/search`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      setResult(json)
    } finally {
      setLoading(false)
      refresh()
    }
  }

  async function refresh() {
    try {
      // 首先检查根路径状态，包括用户登录状态
      const rootRes = await fetch(`${base}/`)
      if (rootRes.ok) {
        const rootData = await rootRes.json()
        
        // 如果后端返回用户已登录状态，更新前端状态
        if (rootData.userLoggedIn && rootData.currentUser) {
          setUser(rootData.currentUser)
          // 从后端获取Token（如果有的话）
          if (rootData.currentUser.token) {
            setToken(rootData.currentUser.token)
          }
        } else {
          // 如果后端显示用户未登录，清除前端状态
          setUser(null)
          setToken(null)
        }
      }
      
      // 然后获取其他数据
      if (user && user.role === 'admin') {
        const [s, l] = await Promise.all([
          fetch(`${base}/v1/admin/stats/summary`, { headers: authHeaders() }).then(r => r.json()),
          fetch(`${base}/v1/admin/logs/recent?limit=20`, { headers: authHeaders() }).then(r => r.json()),
        ])
        setSummary(s)
        setLogs(l.rows || [])
      } else if (user) {
        const ul = await fetch(`${base}/v1/user/logs/recent?limit=20`, { headers: authHeaders() }).then(r => r.json())
        setUserLogs(ul.rows || [])
      }
    } catch (error) {
      console.error('刷新状态失败:', error)
    }
  }

  async function fetchTLBStatus() {
    setTlbLoading(true)
    try {
      const response = await fetch(`${base}/v1/tlb/status`, { headers: authHeaders() })
      if (response.ok) {
        const data = await response.json()
        setTlbStatus(data)
      } else {
        console.error('Failed to fetch TLB status:', response.status)
      }
    } catch (error) {
      console.error('Error fetching TLB status:', error)
    } finally {
      setTlbLoading(false)
    }
  }

  useEffect(() => {
    // 不存储任何数据，每次从后端获取状态
    refresh()
    fetchTLBStatus()
    const t = setInterval(refresh, 5000)
    const tlbT = setInterval(fetchTLBStatus, 5000)
    return () => {
      clearInterval(t)
      clearInterval(tlbT)
    }
  }, [])

  async function loadCode() {
    setCodeStatus('loading...')
    try {
              const res = await fetch(`${base}/v1/admin/search/engines/${encodeURIComponent(codeName)}/code`, { headers: authHeaders() })
      const json = await res.json()
      if (json.code) setCode(json.code)
      setCodeStatus('loaded')
    } catch (e) {
      setCodeStatus('failed to load')
    }
  }

  async function saveCode() {
    setCodeStatus('saving...')
    try {
              await fetch(`${base}/v1/admin/search/engines/${encodeURIComponent(codeName)}/code`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ code }),
      })
      setCodeStatus('saved and reloaded')
    } catch (e) {
      setCodeStatus('save failed')
    }
  }

  async function testEngineOnce() {
    setCodeStatus('testing...')
    try {
              const res = await fetch(`${base}/v1/admin/search/engines/${encodeURIComponent(codeName)}/test`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      setResult(json)
      setCodeStatus('test done')
    } catch (e) {
      setCodeStatus('test failed')
    }
  }

  async function login() {
    try {
      const res = await fetch(`${base}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const j = await res.json()
      if (j.token) {
        // 不存储到localStorage，只设置状态
        setToken(j.token)
        setUser(j.user)
        setPassword('')
        refresh()
      } else {
        alert('Login failed')
      }
    } catch {
      alert('Login error')
    }
  }

  function logout() {
    // 不操作localStorage，只清除状态
    setToken(null)
    setUser(null)
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <h2>RTSearch Console</h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {user ? (
          <>
            <span>Signed in as <b>{user.username}</b> ({user.role})</span>
            <button onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <input style={{ padding: 8 }} placeholder="username" value={username} onChange={e => setUsername(e.target.value)} />
            <input style={{ padding: 8 }} placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <button onClick={login}>Login</button>
          </>
        )}
      </div>

      {/* 导航菜单 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button 
          onClick={() => setCurrentPage('main')}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: currentPage === 'main' ? '#007bff' : '#f8f9fa',
            color: currentPage === 'main' ? 'white' : '#333',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          主页
        </button>
        <button 
          onClick={() => setCurrentPage('tlb')}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: currentPage === 'tlb' ? '#007bff' : '#f8f9fa',
            color: currentPage === 'tlb' ? 'white' : '#333',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          TLB状态
        </button>
        <button 
          onClick={() => setCurrentPage('engines')}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: currentPage === 'engines' ? '#007bff' : '#f8f9fa',
            color: currentPage === 'engines' ? 'white' : '#333',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          引擎状态
        </button>
        <button 
          onClick={() => setCurrentPage('api-tokens')}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: currentPage === 'api-tokens' ? '#007bff' : '#f8f9fa',
            color: currentPage === 'api-tokens' ? 'white' : '#333',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          API Tokens
        </button>
      </div>

      {currentPage === 'main' && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, padding: 8 }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Enter search query"
            />
            <button onClick={runSearch} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </>
      )}

      {currentPage === 'main' && result && (
        <div style={{ marginTop: 16 }}>
          <h3>Result - {result.provider}</h3>
          <ul>
            {(result.items || []).slice(0, 10).map((it: any, i: number) => (
              <li key={i}>
                <a href={it.url} target="_blank">{it.title}</a>
                <div style={{ color: '#666', fontSize: 12 }}>{it.snippet}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentPage === 'main' && user && user.role !== 'admin' && (
        <div style={{ marginTop: 24 }}>
          <h3>My Search History</h3>
          <ul>
            {userLogs.map((row: any, i: number) => (
              <li key={i}>
                <span>{row.timestamp}</span> · <b>{row.usedEngine || '—'}</b> · {row.query}
                {typeof row.latencyMs === 'number' ? <span> · {row.latencyMs} ms</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentPage === 'main' && user && user.role === 'admin' && (
        <>
          <div style={{ marginTop: 24 }}>
            <h3>Summary</h3>
            {summaryRows.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Engine</th>
                    <th>Success</th>
                    <th>Failure</th>
                    <th>Avg Latency (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r: SummaryRow) => (
                    <tr key={r.engine}>
                      <td>{r.engine}</td>
                      <td>{r.success}</td>
                      <td>{r.failure}</td>
                      <td>{r.avgLatencyMs ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre>{JSON.stringify(summary, null, 2)}</pre>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <h3>Recent Logs</h3>
            <ul>
              {logs.map((row, i) => (
                <li key={i}>
                  <span>{row.timestamp}</span> · <b>{row.usedEngine || '—'}</b> · {row.query}
                  {row.username ? <span> · {row.username}</span> : null}
                  {row.error ? <span style={{ color: 'crimson' }}> · {row.error}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {currentPage === 'main' && (
        <div style={{ marginTop: 24 }}>
          <h3>Recent Logs</h3>
          <ul>
            {logs.map((row, i) => (
              <li key={i}>
                <span>{row.timestamp}</span> · <b>{row.usedEngine || '—'}</b> · {row.query}
                {row.error ? <span style={{ color: 'crimson' }}> · {row.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentPage === 'main' && user && user.role === 'admin' && (
        <div style={{ marginTop: 24 }}>
          <h3>Engine Editor</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input style={{ width: 240, padding: 8 }} value={codeName} onChange={e => setCodeName(e.target.value)} />
            <button onClick={loadCode}>Load</button>
            <button onClick={saveCode}>Save & Reload</button>
            <button onClick={testEngineOnce}>Test Engine</button>
            <span style={{ color: '#666' }}>{codeStatus}</span>
          </div>
          <textarea
            style={{ width: '100%', height: 320, marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={`// paste or edit your engine TS here\nexport const engine = {\n  name: '${codeName}',\n  async search(args) {\n    return { provider: '${codeName}', query: args.query, items: [] }\n  }\n}`}
          />
        </div>
      )}

      {/* TLB状态页面 */}
      {currentPage === 'tlb' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2>TLB状态监控</h2>
            <button 
              onClick={fetchTLBStatus} 
              disabled={tlbLoading}
              style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              {tlbLoading ? '刷新中...' : '刷新'}
            </button>
          </div>

          {tlbLoading && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div>加载TLB状态中...</div>
            </div>
          )}

          {!tlbLoading && tlbStatus && (
            <>
              {/* 调试信息 */}
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px', fontSize: '12px' }}>
                <strong>调试信息:</strong>
                <pre>{JSON.stringify(tlbStatus, null, 2)}</pre>
              </div>

              {/* 搜索服务状态 */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>搜索服务</h3>
                {tlbStatus.search?.enabled ? (
                  <div>
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ 
                        padding: '4px 8px', 
                        backgroundColor: '#28a745', 
                        color: 'white', 
                        borderRadius: '4px', 
                        fontSize: '12px' 
                      }}>
                        已启用
                      </span>
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ margin: '0 0 8px 0' }}>引擎状态</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        {Object.entries(tlbStatus.search.engines || {}).map(([engineName, stats]: [string, any]) => {
                          // 安全检查：确保 stats 是对象
                          if (!stats || typeof stats !== 'object') {
                            console.warn('Invalid stats for engine:', engineName, stats)
                            return null
                          }
                          
                          return (
                            <div key={engineName} style={{ 
                              padding: '12px', 
                              border: '1px solid #dee2e6', 
                              borderRadius: '6px', 
                              backgroundColor: 'white',
                              borderColor: tlbStatus.search.available.includes(engineName) ? '#28a745' : '#dc3545'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong>{String(engineName)}</strong>
                                <span style={{ 
                                  padding: '2px 6px', 
                                  backgroundColor: tlbStatus.search.available.includes(engineName) ? '#28a745' : '#dc3545', 
                                  color: 'white', 
                                  borderRadius: '4px', 
                                  fontSize: '10px' 
                                }}>
                                  {tlbStatus.search.available.includes(engineName) ? '可用' : '不可用'}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                <div>RPS限制: {String(stats?.rps || 0)}/s</div>
                                <div>可用令牌: {String(stats?.availableTokens || 0)}</div>
                              </div>
                            </div>
                          )
                        }).filter(Boolean)}
                      </div>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 8px 0' }}>可用引擎</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {tlbStatus.search.available.length > 0 ? (
                          tlbStatus.search.available.map((engine: string) => (
                            <span key={engine} style={{ 
                              padding: '4px 8px', 
                              backgroundColor: '#28a745', 
                              color: 'white', 
                              borderRadius: '4px', 
                              fontSize: '12px' 
                            }}>
                              {String(engine)}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#666' }}>暂无可用引擎</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#666' }}>TLB未启用</div>
                )}
              </div>

              {/* 翻译服务状态 */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px', backgroundColor: '#f8f9fa' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>翻译服务</h3>
                {tlbStatus.translate?.enabled ? (
                  <div>
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ 
                        padding: '4px 8px', 
                        backgroundColor: '#28a745', 
                        color: 'white', 
                        borderRadius: '4px', 
                        fontSize: '12px' 
                      }}>
                        已启用
                      </span>
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ margin: '0 0 8px 0' }}>引擎状态</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        {Object.entries(tlbStatus.translate.engines || {}).map(([engineName, stats]: [string, any]) => {
                          // 安全检查：确保 stats 是对象
                          if (!stats || typeof stats !== 'object') {
                            console.warn('Invalid stats for translate engine:', engineName, stats)
                            return null
                          }
                          
                          return (
                            <div key={engineName} style={{ 
                              padding: '12px', 
                              border: '1px solid #dee2e6', 
                              borderRadius: '6px', 
                              backgroundColor: 'white',
                              borderColor: tlbStatus.translate.available.includes(engineName) ? '#28a745' : '#dc3545'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong>{String(engineName)}</strong>
                                <span style={{ 
                                  padding: '2px 6px', 
                                  backgroundColor: tlbStatus.translate.available.includes(engineName) ? '#28a745' : '#dc3545', 
                                  color: 'white', 
                                  borderRadius: '4px', 
                                  fontSize: '10px' 
                                }}>
                                  {tlbStatus.translate.available.includes(engineName) ? '可用' : '不可用'}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                <div>RPS限制: {String(stats?.rps || 0)}/s</div>
                                <div>可用令牌: {String(stats?.availableTokens || 0)}</div>
                              </div>
                            </div>
                          )
                        }).filter(Boolean)}
                      </div>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 8px 0' }}>可用引擎</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {tlbStatus.translate.available.length > 0 ? (
                          tlbStatus.translate.available.map((engine: string) => (
                            <span key={engine} style={{ 
                              padding: '4px 8px', 
                              backgroundColor: '#28a745', 
                              color: 'white', 
                              borderRadius: '4px', 
                              fontSize: '12px' 
                            }}>
                              {String(engine)}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#666' }}>暂无可用引擎</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#666' }}>TLB未启用</div>
                )}
              </div>

              {/* TLB特性说明 */}
              <div style={{ border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px', backgroundColor: '#f8f9fa' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>TLB特性说明</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', color: '#333' }}>🔥 热插拔引擎</h4>
                    <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>支持动态添加和移除引擎，无需重启服务</p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', color: '#333' }}>🎯 随机令牌桶</h4>
                    <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>根据RPS限制为每个引擎维护令牌桶，确保负载均衡</p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', color: '#333' }}>🔄 智能重试</h4>
                    <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>失败时延迟归还令牌，支持自动重试机制</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {!tlbLoading && !tlbStatus && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              <div>暂无TLB状态信息</div>
              <button 
                onClick={fetchTLBStatus}
                style={{ 
                  marginTop: '16px', 
                  padding: '8px 16px', 
                  backgroundColor: '#007bff', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer' 
                }}
              >
                获取状态
              </button>
            </div>
          )}
        </div>
      )}

      {/* API Token管理页面 */}
      {currentPage === 'api-tokens' && (
        <ApiTokenPage />
      )}

      {/* 引擎状态页面 */}
      {currentPage === 'engines' && (
        <EngineStatusPage />
      )}
    </div>
  )
}

export default App
