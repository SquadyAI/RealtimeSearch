import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { getBackendUrl } from '../utils/api'

type EngineStatus = {
  name: string
  type: 'search' | 'translate'
  available: boolean
  enabled: boolean
  default: boolean
  tlbSynced?: boolean
}

type EngineList = {
  search: Array<{ name: string; description: string; type: string }>
  translate: Array<{ name: string; description: string; type: string }>
  total: { search: number; translate: number }
}

type EngineStatusResponse = {
  timestamp: string
  search: {
    engines: EngineStatus[]
    default: string[]
    total: number
  }
  translate: {
    engines: EngineStatus[]
    default: string[]
    total: number
  }
}

type TestResult = {
  success: boolean
  engine: string
  type: string
  query: string
  result: any
  timestamp: string
  error?: string
  details?: string
}

function useBackendBaseUrl() {
    return getBackendUrl();
}

export function EngineStatusPage() {
  const base = useBackendBaseUrl()
  const [engineStatus, setEngineStatus] = useState<EngineStatusResponse | null>(null)
  const [engineList, setEngineList] = useState<EngineList | null>(null)
  const [loading, setLoading] = useState(true)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  function authHeaders() {
    const h: Record<string, string> = {}
    const token = localStorage.getItem('rt_token')
    if (token) h['authorization'] = `Bearer ${token}`
    return h
  }
  
  // 测试表单状态
  const [testForm, setTestForm] = useState({
    engine: '',
    type: 'search' as 'search' | 'translate',
    query: '',
    apiKey: '',
    limit: 5,
    from: 'auto',
    to: 'en'
  })

  // 创建引擎表单状态
  const [createForm, setCreateForm] = useState({
    name: '',
    type: 'search' as 'search' | 'translate',
    config: '',
    httpProxy: ''
  })
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createResult, setCreateResult] = useState<any>(null)

  // 删除引擎状态
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)

  async function loadEngineStatus() {
    try {
      const [statusRes, listRes] = await Promise.all([
        fetch(`${base}/v1/engines/status`, { headers: authHeaders() }),
        fetch(`${base}/v1/engines/list`, { headers: authHeaders() })
      ])
      
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setEngineStatus(statusData)
      }
      
      if (listRes.ok) {
        const listData = await listRes.json()
        setEngineList(listData)
        
        // 设置默认测试引擎
        if (listData.search.length > 0 && !testForm.engine) {
          setTestForm(prev => ({ ...prev, engine: listData.search[0].name }))
        }
      }
    } catch (error) {
      console.error('Failed to load engine status:', error)
    } finally {
      setLoading(false)
    }
  }

  async function testEngine() {
    if (!testForm.engine || !testForm.query) {
      alert('请选择引擎并输入查询内容')
      return
    }

    setTestLoading(true)
    setTestResult(null)
    
    try {
      const response = await fetch(`${base}/v1/engines/test`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(testForm)
      })
      
      const result = await response.json()
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        engine: testForm.engine,
        type: testForm.type,
        query: testForm.query,
        result: null,
        timestamp: new Date().toISOString(),
        error: 'Network error',
        details: String(error)
      })
    } finally {
      setTestLoading(false)
    }
  }

  async function createEngine() {
    if (!createForm.name || !createForm.type) {
      alert('请填写引擎名称和类型')
      return
    }

    setCreateLoading(true)
    setCreateResult(null)
    
    try {
      const config = createForm.config ? JSON.parse(createForm.config) : {}
      
      const response = await fetch(`${base}/v1/engines/create`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          type: createForm.type,
          config,
          httpProxy: createForm.httpProxy || null
        })
      })
      
      const result = await response.json()
      setCreateResult(result)
      
      if (result.success) {
        // 清空表单
        setCreateForm({
          name: '',
          type: 'search',
          config: '',
          httpProxy: ''
        })
        setShowCreateForm(false)
        // 重新加载引擎状态
        loadEngineStatus()
      }
    } catch (error) {
      setCreateResult({
        success: false,
        error: 'Network error',
        details: String(error)
      })
    } finally {
      setCreateLoading(false)
    }
  }

  async function deleteEngine(engineName: string) {
    if (!confirm(`确定要删除引擎 "${engineName}" 吗？此操作不可撤销。`)) {
      return
    }

    setDeleteLoading(engineName)
    
    try {
      console.log(`正在删除引擎: ${engineName}`)
      
      // 首先尝试 DELETE 方法
      try {
        console.log(`尝试 DELETE 方法: ${base}/v1/engines/${engineName}`)
        const response = await fetch(`${base}/v1/engines/${engineName}`, {
          method: 'DELETE',
          headers: authHeaders(),
          mode: 'cors'
        })
        
        console.log(`DELETE 响应状态: ${response.status}`)
        const result = await response.json()
        console.log(`DELETE 响应结果:`, result)
        
        if (result.success) {
          // 立即从本地状态中移除引擎
          if (engineStatus) {
            const updatedStatus = { ...engineStatus }
            updatedStatus.search.engines = updatedStatus.search.engines.filter(e => e.name !== engineName)
            updatedStatus.search.total = updatedStatus.search.engines.length
            updatedStatus.translate.engines = updatedStatus.translate.engines.filter(e => e.name !== engineName)
            updatedStatus.translate.total = updatedStatus.translate.engines.length
            setEngineStatus(updatedStatus)
          }
          
          // 重新加载引擎状态以确保同步
          await loadEngineStatus()
          alert('引擎删除成功！')
          return
        } else {
          throw new Error(result.error || 'DELETE 方法失败')
        }
      } catch (deleteError) {
        console.log('DELETE 方法失败，尝试 POST 方法:', deleteError)
        
        // 如果 DELETE 失败，尝试 POST 方法
        console.log(`尝试 POST 方法: ${base}/v1/engines/${engineName}/delete`)
        const postResponse = await fetch(`${base}/v1/engines/${engineName}/delete`, {
          method: 'POST',
          headers: authHeaders(),
          mode: 'cors'
        })
        
        console.log(`POST 响应状态: ${postResponse.status}`)
        const postResult = await postResponse.json()
        console.log(`POST 响应结果:`, postResult)
        
        if (postResult.success) {
          // 立即从本地状态中移除引擎
          if (engineStatus) {
            const updatedStatus = { ...engineStatus }
            updatedStatus.search.engines = updatedStatus.search.engines.filter(e => e.name !== engineName)
            updatedStatus.search.total = updatedStatus.search.engines.length
            updatedStatus.translate.engines = updatedStatus.translate.engines.filter(e => e.name !== engineName)
            updatedStatus.translate.total = updatedStatus.translate.engines.length
            setEngineStatus(updatedStatus)
          }
          
          // 重新加载引擎状态以确保同步
          await loadEngineStatus()
          alert('引擎删除成功！')
        } else {
          alert(`删除失败: ${postResult.error}`)
        }
      }
    } catch (error) {
      console.error('删除引擎时发生错误:', error)
      alert(`删除失败: ${String(error)}`)
    } finally {
      setDeleteLoading(null)
    }
  }

  // 新增：引擎启用/禁用函数
  async function toggleEngineStatus(engineName: string, type: 'search' | 'translate', currentEnabled: boolean) {
    try {
      const response = await fetch(`${base}/v1/engines/${engineName}/toggle`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: !currentEnabled,
          type
        })
      })
      
      const result = await response.json()
      
      if (result.ok) {
        // 更新本地状态
        if (engineStatus) {
          const updatedStatus = { ...engineStatus }
          const targetEngines = type === 'search' ? updatedStatus.search.engines : updatedStatus.translate.engines
          const engine = targetEngines.find(e => e.name === engineName)
          if (engine) {
            engine.enabled = !currentEnabled
          }
          setEngineStatus(updatedStatus)
        }
        
        alert(`引擎 ${engineName} 已${!currentEnabled ? '启用' : '禁用'}`)
      } else {
        alert(`操作失败: ${result.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('切换引擎状态失败:', error)
      alert(`操作失败: ${String(error)}`)
    }
  }


  useEffect(() => {
    loadEngineStatus()
    const interval = setInterval(loadEngineStatus, 30000) // 每30秒刷新一次
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20, textAlign: 'center' }}>
        <div>加载引擎状态中...</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20, background: '#ffffff', color: '#000000' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 30, color: '#000000' }}>
        🔧 引擎状态监控
      </h1>
      
      {/* 调试信息 */}
      <div style={{ 
        marginBottom: 20, 
        padding: 10, 
        backgroundColor: '#f8f9fa', 
        border: '1px solid #dee2e6', 
        borderRadius: 6,
        fontSize: '12px',
        color: '#6c757d'
      }}>
        <strong>调试信息:</strong> 后端URL: {base}
      </div>

      {/* 引擎状态概览 */}
      {engineStatus && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ color: '#000000' }}>📊 引擎状态概览</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {/* 搜索引擎状态 */}
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, backgroundColor: '#ffffff' }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#000000' }}>
                🔍 搜索引擎 ({engineStatus.search.total})
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {engineStatus.search.engines.map((engine) => (
                  <div
                    key={engine.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      backgroundColor: '#ffffff',
                      border: `2px solid ${engine.available ? '#28a745' : '#dc3545'}`,
                      borderRadius: 8,
                      borderLeft: `6px solid ${engine.available ? '#28a745' : '#dc3545'}`,
                      color: '#000000'
                    }}
                  >
                    <div>
                      <strong style={{ color: '#000000' }}>{engine.name}</strong>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {engine.default && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: '10px'
                          }}>
                            默认
                          </span>
                        )}
                        {engine.tlbSynced && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: '10px'
                          }}>
                            TLB已同步
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* 启用/禁用状态指示器 */}
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: engine.enabled ? '#28a745' : '#dc3545',
                        color: 'white',
                        borderRadius: 4,
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        {engine.enabled ? '已启用' : '已禁用'}
                      </span>
                      
                      {/* 可用性状态指示器 */}
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: engine.available ? '#28a745' : '#dc3545',
                        color: 'white',
                        borderRadius: 4,
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        {engine.available ? '可用' : '不可用'}
                      </span>
                      
                      {/* 启用/禁用切换按钮 */}
                      <button
                        onClick={() => toggleEngineStatus(engine.name, 'search', engine.enabled)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: engine.enabled ? '#ffc107' : '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: '10px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                        title={engine.enabled ? '禁用引擎' : '启用引擎'}
                      >
                        {engine.enabled ? '🔒' : '🔓'}
                      </button>
                      
                      {/* 删除按钮 - 允许删除所有引擎 */}
                      <button
                        onClick={() => deleteEngine(engine.name)}
                        disabled={deleteLoading === engine.name}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: deleteLoading === engine.name ? '#6c757d' : '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: '10px',
                          cursor: deleteLoading === engine.name ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold'
                        }}
                        title="删除引擎"
                      >
                        {deleteLoading === engine.name ? '删除中...' : '🗑️'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 翻译引擎状态 */}
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, backgroundColor: '#ffffff' }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#000000' }}>
                🌐 翻译引擎 ({engineStatus.translate.total})
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {engineStatus.translate.engines.map((engine) => (
                  <div
                    key={engine.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      backgroundColor: '#ffffff',
                      border: `2px solid ${engine.available ? '#28a745' : '#dc3545'}`,
                      borderRadius: 8,
                      borderLeft: `6px solid ${engine.available ? '#28a745' : '#dc3545'}`,
                      color: '#000000'
                    }}
                  >
                    <div>
                      <strong style={{ color: '#000000' }}>{engine.name}</strong>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {engine.default && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: '10px'
                          }}>
                            默认
                          </span>
                        )}
                        {engine.tlbSynced && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: '10px'
                          }}>
                            TLB已同步
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* 启用/禁用状态指示器 */}
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: engine.enabled ? '#28a745' : '#dc3545',
                        color: 'white',
                        borderRadius: 4,
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        {engine.enabled ? '已启用' : '已禁用'}
                      </span>
                      
                      {/* 可用性状态指示器 */}
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: engine.available ? '#28a745' : '#dc3545',
                        color: 'white',
                        borderRadius: 4,
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        {engine.available ? '可用' : '不可用'}
                      </span>
                      
                      {/* 启用/禁用切换按钮 */}
                      <button
                        onClick={() => toggleEngineStatus(engine.name, 'translate', engine.enabled)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: engine.enabled ? '#ffc107' : '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: '10px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                        title={engine.enabled ? '禁用引擎' : '启用引擎'}
                      >
                        {engine.enabled ? '🔒' : '🔓'}
                      </button>
                      
                      {/* 删除按钮 - 允许删除所有引擎 */}
                      <button
                        onClick={() => deleteEngine(engine.name)}
                        disabled={deleteLoading === engine.name}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: deleteLoading === engine.name ? '#6c757d' : '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: '10px',
                          cursor: deleteLoading === engine.name ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold'
                        }}
                        title="删除引擎"
                      >
                        {deleteLoading === engine.name ? '删除中...' : '🗑️'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: 16, textAlign: 'center', color: '#666666', fontSize: '14px' }}>
            最后更新: {new Date(engineStatus.timestamp).toLocaleString('zh-CN')}
          </div>
        </div>
      )}

      {/* 创建引擎工具 */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ color: '#000000' }}>🚀 创建新引擎</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: '8px 16px',
              backgroundColor: showCreateForm ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {showCreateForm ? '隐藏' : '创建引擎'}
          </button>
        </div>

        {showCreateForm && (
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, backgroundColor: '#ffffff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
              {/* 引擎名称 */}
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#000000' }}>引擎名称:</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="输入引擎名称"
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da', backgroundColor: '#ffffff', color: '#000000' }}
                />
              </div>

              {/* 引擎类型 */}
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#000000' }}>引擎类型:</label>
                <select
                  value={createForm.type}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, type: e.target.value as 'search' | 'translate' }))}
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da', backgroundColor: '#ffffff', color: '#000000' }}
                >
                  <option value="search">搜索引擎</option>
                  <option value="translate">翻译引擎</option>
                </select>
              </div>

              {/* HTTP代理 */}
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#000000' }}>HTTP代理 (可选):</label>
                <input
                  type="text"
                  value={createForm.httpProxy}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, httpProxy: e.target.value }))}
                  placeholder="http(s)://proxy:port"
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da', backgroundColor: '#ffffff', color: '#000000' }}
                />
              </div>
            </div>

            {/* 配置JSON */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', color: '#000000' }}>配置JSON (可选):</label>
              <textarea
                value={createForm.config}
                onChange={(e) => setCreateForm(prev => ({ ...prev, config: e.target.value }))}
                placeholder='{"rateLimit": 10, "timeout": 5000}'
                style={{
                  width: '100%',
                  height: 80,
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #ced4da',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              />
            </div>

            {/* 创建按钮 */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={createEngine}
                disabled={createLoading || !createForm.name || !createForm.type}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  backgroundColor: createLoading ? '#6c757d' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: createLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {createLoading ? '创建中...' : '创建引擎'}
              </button>
            </div>

            {/* 创建结果 */}
            {createResult && (
              <div style={{ marginTop: 20, padding: 16, borderRadius: 8, backgroundColor: createResult.success ? '#d4edda' : '#f8d7da', border: `1px solid ${createResult.success ? '#c3e6cb' : '#f5c6cb'}` }}>
                <div style={{ color: createResult.success ? '#155724' : '#721c24', fontWeight: 'bold', marginBottom: 8 }}>
                  {createResult.success ? '✅ 创建成功' : '❌ 创建失败'}
                </div>
                <div style={{ color: createResult.success ? '#155724' : '#721c24' }}>
                  {createResult.message || createResult.error}
                </div>
                {createResult.success && createResult.tlbSynced && (
                  <div style={{ marginTop: 8, fontSize: '14px', color: '#155724' }}>
                    🚀 TLB系统已自动同步，新引擎可以立即参与令牌分配
                  </div>
                )}
                {createResult.details && (
                  <div style={{ marginTop: 8, fontSize: '14px', color: '#721c24' }}>
                    详细信息: {createResult.details}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 引擎测试工具 */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ color: '#000000' }}>🧪 引擎测试工具</h2>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, backgroundColor: '#ffffff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* 引擎类型选择 */}
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>引擎类型:</label>
              <select
                value={testForm.type}
                onChange={(e) => {
                  const newType = e.target.value as 'search' | 'translate'
                  setTestForm(prev => ({ 
                    ...prev, 
                    type: newType,
                    engine: '' // 重置引擎选择
                  }))
                }}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              >
                <option value="search">搜索引擎</option>
                <option value="translate">翻译引擎</option>
              </select>
            </div>

            {/* 引擎选择 */}
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>选择引擎:</label>
              <select
                value={testForm.engine}
                onChange={(e) => setTestForm(prev => ({ ...prev, engine: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              >
                <option value="">请选择引擎</option>
                {testForm.type === 'search' && engineList?.search.map(engine => (
                  <option key={engine.name} value={engine.name}>{engine.name}</option>
                ))}
                {testForm.type === 'translate' && engineList?.translate.map(engine => (
                  <option key={engine.name} value={engine.name}>{engine.name}</option>
                ))}
              </select>
            </div>

            {/* 查询内容 */}
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                {testForm.type === 'search' ? '搜索查询:' : '翻译文本:'}
              </label>
              <input
                type="text"
                value={testForm.query}
                onChange={(e) => setTestForm(prev => ({ ...prev, query: e.target.value }))}
                placeholder={testForm.type === 'search' ? '输入搜索关键词' : '输入要翻译的文本'}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              />
            </div>

            {/* API Key */}
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>API Key (可选):</label>
              <input
                type="password"
                value={testForm.apiKey}
                onChange={(e) => setTestForm(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="输入API密钥"
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              />
            </div>
          </div>

          {/* 翻译引擎特有选项 */}
          {testForm.type === 'translate' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>源语言:</label>
                <select
                  value={testForm.from}
                  onChange={(e) => setTestForm(prev => ({ ...prev, from: e.target.value }))}
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
                >
                  <option value="auto">自动检测</option>
                  <option value="zh">中文</option>
                  <option value="en">英语</option>
                  <option value="ja">日语</option>
                  <option value="ko">韩语</option>
                  <option value="fr">法语</option>
                  <option value="de">德语</option>
                  <option value="es">西班牙语</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>目标语言:</label>
                <select
                  value={testForm.to}
                  onChange={(e) => setTestForm(prev => ({ ...prev, to: e.target.value }))}
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
                >
                  <option value="en">英语</option>
                  <option value="zh">中文</option>
                  <option value="ja">日语</option>
                  <option value="ko">韩语</option>
                  <option value="fr">法语</option>
                  <option value="de">德语</option>
                  <option value="es">西班牙语</option>
                </select>
              </div>
            </div>
          )}

          {/* 搜索引擎特有选项 */}
          {testForm.type === 'search' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>结果数量限制:</label>
              <input
                type="number"
                min="1"
                max="10"
                value={testForm.limit}
                onChange={(e) => setTestForm(prev => ({ ...prev, limit: parseInt(e.target.value) || 5 }))}
                style={{ width: '100px', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              />
            </div>
          )}

          {/* 测试按钮 */}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={testEngine}
              disabled={testLoading || !testForm.engine || !testForm.query}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: testLoading ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: testLoading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {testLoading ? '测试中...' : '开始测试'}
            </button>
          </div>
        </div>
      </div>

      {/* 测试结果展示 */}
      {testResult && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ color: '#000000' }}>📋 测试结果</h2>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, backgroundColor: '#ffffff' }}>
            {/* 测试信息 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <strong>引擎:</strong> {testResult.engine}
                </div>
                <div>
                  <strong>类型:</strong> {testResult.type === 'search' ? '搜索' : '翻译'}
                </div>
                <div>
                  <strong>查询:</strong> {testResult.query}
                </div>
                <div>
                  <strong>时间:</strong> {new Date(testResult.timestamp).toLocaleString('zh-CN')}
                </div>
              </div>
            </div>

            {/* 错误信息 */}
            {testResult.error && (
              <div style={{ 
                padding: 16, 
                backgroundColor: '#f8d7da', 
                border: '1px solid #f5c6cb', 
                borderRadius: 8, 
                color: '#721c24',
                marginBottom: 20
              }}>
                <strong>❌ 测试失败:</strong> {testResult.error}
                {testResult.details && (
                  <div style={{ marginTop: 8, fontSize: '14px' }}>
                    详细信息: {testResult.details}
                  </div>
                )}
              </div>
            )}

            {/* 成功结果 */}
            {testResult.success && testResult.result && (
              <div>
                <h4 style={{ marginBottom: 16 }}>✅ 测试成功</h4>
                
                {testResult.type === 'search' && testResult.result.items && (
                  <div>
                    <h5>搜索结果:</h5>
                    <div style={{ maxHeight: 400, overflow: 'auto' }}>
                      {testResult.result.items.map((item: any, index: number) => (
                        <div key={index} style={{ 
                          padding: 12, 
                          border: '1px solid #e1e5e9', 
                          borderRadius: 6, 
                          marginBottom: 8,
                          backgroundColor: 'white'
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>
                              {item.title}
                            </a>
                          </div>
                          <div style={{ color: '#6c757d', fontSize: '14px' }}>{item.snippet}</div>
                          {item.url && (
                            <div style={{ color: '#28a745', fontSize: '12px', marginTop: 4 }}>
                              {item.url}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {testResult.type === 'translate' && testResult.result && (
                  <div>
                    <h5>翻译结果:</h5>
                    <div style={{ 
                      padding: 16, 
                      backgroundColor: 'white', 
                      border: '1px solid #e1e5e9', 
                      borderRadius: 8 
                    }}>
                      <div style={{ marginBottom: 12 }}>
                        <strong>原文:</strong> {testResult.query}
                      </div>
                      <div style={{ 
                        padding: 12, 
                        backgroundColor: '#e7f3ff', 
                        borderRadius: 6,
                        fontSize: '16px',
                        fontWeight: 'bold'
                      }}>
                        {testResult.result.translatedText || testResult.result.text || '翻译结果'}
                      </div>
                    </div>
                  </div>
                )}

                {/* 原始结果数据 */}
                <details style={{ marginTop: 20 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#6c757d' }}>
                    查看原始响应数据
                  </summary>
                  <div style={{ marginTop: 12 }}>
                    <Editor
                      height="300"
                      defaultLanguage="json"
                      value={JSON.stringify(testResult.result, null, 2)}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 12,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true
                      }}
                    />
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 页面说明 */}
      <div style={{ 
        border: '1px solid #e0e0e0', 
        borderRadius: 12, 
        padding: 20, 
        backgroundColor: '#ffffff',
        textAlign: 'center'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#000000' }}>ℹ️ 使用说明</h3>
        <div style={{ color: '#666666', lineHeight: 1.6 }}>
          <p>此页面提供引擎状态监控和测试功能，无需登录即可使用。</p>
          <p>• 引擎状态每30秒自动刷新</p>
          <p>• 可以测试搜索和翻译引擎的功能</p>
          <p>• 支持自定义API Key和代理设置</p>
          <p>• 测试结果包含详细的响应信息</p>
        </div>
      </div>
    </div>
  )
}
