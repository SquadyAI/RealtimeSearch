import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getBackendUrl } from '../utils/api'

function useBackendBaseUrl() {
    return getBackendUrl();
}

export function TranslatePage() {
    const base = useBackendBaseUrl()
    const { user, loading: authLoading, authHeaders } = useAuth()
    const [sourceText, setSourceText] = useState('Hello world')
    const [targetLang, setTargetLang] = useState('zh')
    const [sourceLang, setSourceLang] = useState('auto')
    const [translatedText, setTranslatedText] = useState('')
    const [loading, setLoading] = useState(false)
    const [selectedEngine, setSelectedEngine] = useState('') // 改为空字符串，动态设置
    const [engines, setEngines] = useState<string[]>([])
    const [error, setError] = useState('')
    const [result, setResult] = useState<any>(null)

    // 语言选项
    const languages = [
        { code: 'en', name: 'English' },
        { code: 'zh', name: '中文' },
        { code: 'ja', name: '日本語' },
        { code: 'ko', name: '한국어' },
        { code: 'fr', name: 'Français' },
        { code: 'de', name: 'Deutsch' },
        { code: 'es', name: 'Español' },
        { code: 'ru', name: 'Русский' },
        { code: 'ar', name: 'العربية' },
        { code: 'hi', name: 'हिन्दी' },
    ]

    // 源语言选项（包含自动检测）
    const sourceLanguages = [
        { code: 'auto', name: '自动检测' },
        ...languages
    ]

    // 加载可用翻译引擎的函数
    const loadTranslateEngines = async () => {
        try {
            // 使用认证头调用引擎列表API
            const res = await fetch(`${base}/v1/engines/list`, { headers: authHeaders() })
            if (res.ok) {
                const data = await res.json()
                console.log('API返回的引擎数据:', data)
                if (data.translate && Array.isArray(data.translate)) {
                    // 从引擎状态对象中提取引擎名称，只显示可用的引擎
                    const engineNames = data.translate
                        .filter((engine: any) => engine.available && engine.enabled)
                        .map((engine: any) => engine.name)
                        .filter(Boolean)
                    console.log('提取的可用翻译引擎名称:', engineNames)
                    setEngines(engineNames)
                    
                    // 自动选择第一个可用的引擎作为默认选择
                    if (engineNames.length > 0 && !selectedEngine) {
                        setSelectedEngine(engineNames[0])
                        console.log('自动选择默认引擎:', engineNames[0])
                    }
                    
                    setError('') // 清除之前的错误
                } else {
                    console.warn('API返回的translate数据格式不正确:', data.translate)
                    // 不设置默认引擎，让系统自动处理
                    setEngines([])
                }
            } else if (res.status === 401) {
                // 认证失败，提示用户登录
                console.log('认证失败，请先登录')
                setError('请先登录以获取翻译引擎列表')
                // 不设置默认引擎，让系统自动处理
                setEngines([])
            } else {
                // 其他错误，不设置默认引擎
                console.log('API调用失败，不设置默认引擎')
                setEngines([])
            }
        } catch (err) {
            console.error('Failed to load translate engines:', err)
            // 网络错误时不设置默认引擎，让系统自动处理
            setEngines([])
            console.log('网络错误，不设置默认引擎')
        }
    }

    // 初始加载引擎列表
    useEffect(() => {
        if (user && !authLoading) {
            loadTranslateEngines()
        }
    }, [user, authLoading, base]) // 当用户认证状态变化时重新加载

    // 监听认证状态变化，重新加载引擎列表
    useEffect(() => {
        if (user && !authLoading) {
            loadTranslateEngines()
        }
    }, [user, authLoading, base])

    async function runTranslate() {
        setLoading(true)
        setError('')
        setTranslatedText('')
        setResult(null)

        try {
            const response = await fetch(`${base}/v1/translate`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    q: sourceText,
                    target: targetLang,
                    source: sourceLang === 'auto' ? undefined : sourceLang, // 自动检测时不传source参数
                    format: 'text',
                    model: selectedEngine,
                    // 不指定引擎，让后端自动选择所有可用引擎
                }),
            })

            if (response.status === 401) {
                throw new Error('认证失败，请重新登录')
            }

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || `翻译请求失败: ${response.status}`)
            }

            // 检查响应类型
            const contentType = response.headers.get('content-type')
            let fullText = ''
            
            if (contentType && contentType.includes('text/event-stream')) {
                // 处理流式响应
                const reader = response.body?.getReader()
                if (!reader) {
                    throw new Error('无法获取响应流')
                }

                const decoder = new TextDecoder()

                try {
                    while (true) {
                        const { done, value } = await reader.read()
                        if (done) break

                        const chunk = decoder.decode(value, { stream: true })
                        const lines = chunk.split('\n')

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6))
                                    
                                    if (data.status === 'connected') {
                                        console.log('流式连接已建立')
                                    } else if (data.status === 'completed') {
                                        console.log('翻译完成')
                                    } else if (data.error) {
                                        throw new Error(data.error)
                                    } else if (data.content) {
                                        // 累积翻译内容
                                        fullText += data.content
                                        setTranslatedText(fullText)
                                    } else if (data.translatedText) {
                                        // 直接翻译结果
                                        fullText = data.translatedText
                                        setTranslatedText(fullText)
                                        setResult({
                                            provider: data.provider || selectedEngine,
                                            query: sourceText,
                                            target: targetLang,
                                            source: sourceLang,
                                            translatedText: data.translatedText,
                                            latencyMs: data.latencyMs || 0
                                        })
                                    }
                                } catch (parseError) {
                                    // 忽略解析错误，继续处理下一行
                                    console.log('解析行数据时出错:', line, parseError)
                                }
                            }
                        }
                    }
                } catch (streamError: any) {
                    // 流式处理中的错误
                    if (streamError.message) {
                        setError(`流式翻译错误: ${streamError.message}`)
                    } else {
                        setError('流式翻译处理失败')
                    }
                    console.error('流式翻译错误:', streamError)
                } finally {
                    reader.releaseLock()
                }
            } else {
                // 处理普通JSON响应
                const data = await response.json()
                console.log('收到普通JSON响应:', data)
                
                if (data.translatedText) {
                    setTranslatedText(data.translatedText)
                    setResult({
                        provider: data.provider || selectedEngine,
                        query: sourceText,
                        target: targetLang,
                        source: sourceLang,
                        translatedText: data.translatedText,
                        latencyMs: data.latencyMs || 0
                    })
                } else if (data.error) {
                    throw new Error(data.error)
                } else {
                    // 如果没有明确的翻译结果，尝试从其他字段获取
                    const fallbackText = data.content || data.result || JSON.stringify(data)
                    setTranslatedText(fallbackText)
                    setResult({
                        provider: data.provider || selectedEngine,
                        query: sourceText,
                        target: targetLang,
                        source: sourceLang,
                        translatedText: fallbackText,
                        latencyMs: data.latencyMs || 0
                    })
                }
            }

            // 如果没有获取到翻译结果，设置默认结果
            if (!fullText && !result) {
                setResult({
                    provider: selectedEngine,
                    query: sourceText,
                    target: targetLang,
                    source: sourceLang,
                    translatedText: '翻译完成',
                    latencyMs: 0
                })
            }

        } catch (err: any) {
            setError(err.message || '翻译失败')
        } finally {
            setLoading(false)
        }
    }

    async function testTranslateEngine() {
        setLoading(true)
        setError('')
        setTranslatedText('')
        setResult(null)

        try {
            const response = await fetch(`${base}/v1/translate/health`, { headers: authHeaders() })
            const data = await response.json()

            if (response.ok) {
                // 确保数据格式正确，特别是 availableEngines
                const sanitizedData = {
                    ...data,
                    availableEngines: Array.isArray(data.availableEngines) 
                        ? data.availableEngines 
                        : (data.availableEngines ? [String(data.availableEngines)] : [])
                }
                setResult(sanitizedData)
                setTranslatedText(`健康检查通过: ${sanitizedData.testResult || '服务正常'}`)
            } else {
                setError(`健康检查失败: ${data.error || '未知错误'}`)
            }
        } catch (err: any) {
            console.error('健康检查错误:', err)
            setError(err.message || '健康检查失败')
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
                <h2 style={{ color: '#000000', marginBottom: '24px' }}>翻译</h2>
                <div style={{ 
                    padding: '16px', 
                    backgroundColor: '#fff3cd', 
                    border: '1px solid #ffeaa7', 
                    borderRadius: '8px', 
                    color: '#856404',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '18px', marginBottom: '12px' }}>
                        🔒 请先登录以使用翻译功能
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                        登录后可以访问完整的翻译功能和结果
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20, backgroundColor: 'white', color: 'black' }}>
            <style>
                {`
                    @keyframes blink {
                        0%, 50% { opacity: 1; }
                        51%, 100% { opacity: 0; }
                    }
                `}
            </style>
            
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
                        // 这里需要导入logout函数
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
            
            <h1 style={{ color: 'black' }}>翻译测试</h1>

            <div style={{ marginBottom: 20 }}>
                <h3 style={{ color: 'black' }}>翻译引擎</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ color: 'black' }}>选择翻译引擎:</label>
                    <select
                        value={selectedEngine}
                        onChange={(e) => setSelectedEngine(e.target.value)}
                        style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4, backgroundColor: 'white', color: 'black' }}
                    >
                        {Array.isArray(engines) && engines.map(engine => (
                            <option key={engine} value={engine}>{String(engine)}</option>
                        ))}
                    </select>
                    <small style={{ color: '#666', fontSize: 12 }}>
                        (翻译引擎自动故障转移)
                    </small>
                    <button 
                        onClick={testTranslateEngine} 
                        disabled={loading}
                        style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', backgroundColor: 'white', color: 'black' }}
                    >
                        {loading ? '检查中...' : '健康检查'}
                    </button>
                </div>
                {error && error.includes('请先登录') && (
                    <div style={{ 
                        padding: '8px 12px', 
                        backgroundColor: '#fff3cd', 
                        border: '1px solid #ffeaa7', 
                        borderRadius: '4px', 
                        color: '#856404',
                        fontSize: '14px',
                        marginTop: '8px'
                    }}>
                        💡 提示：登录后可以获取完整的翻译引擎列表和状态信息
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                <div>
                    <h3 style={{ color: 'black' }}>源语言</h3>
                    <select
                        value={sourceLang}
                        onChange={(e) => setSourceLang(e.target.value)}
                        style={{ width: '100%', padding: 8, marginBottom: 10, border: '1px solid #ccc', borderRadius: 4, backgroundColor: 'white', color: 'black' }}
                    >
                        {Array.isArray(sourceLanguages) && sourceLanguages.map(lang => (
                            <option key={lang.code} value={lang.code}>{String(lang.name)}</option>
                        ))}
                    </select>
                    <textarea
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        placeholder="输入要翻译的文本"
                        style={{
                            width: '100%',
                            height: 200,
                            padding: 12,
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            resize: 'vertical',
                            fontSize: 14,
                            backgroundColor: 'white',
                            color: 'black'
                        }}
                    />
                </div>

                <div>
                    <h3 style={{ color: 'black' }}>目标语言</h3>
                    <select
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        style={{ width: '100%', padding: 8, marginBottom: 10, border: '1px solid #ccc', borderRadius: 4, backgroundColor: 'white', color: 'black' }}
                    >
                        {Array.isArray(languages) && languages.map(lang => (
                            <option key={lang.code} value={lang.code}>{String(lang.name)}</option>
                        ))}
                    </select>
                    <div
                        style={{
                            width: '100%',
                            height: 200,
                            padding: 12,
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            backgroundColor: 'white',
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: 14,
                            color: 'black',
                            position: 'relative'
                        }}
                    >
                        {loading && translatedText === '' && (
                            <div style={{ color: '#666', fontStyle: 'italic' }}>
                                正在翻译中...
                            </div>
                        )}
                        {String(translatedText || '翻译结果将显示在这里')}
                        {loading && translatedText && (
                            <span style={{ color: '#007bff', animation: 'blink 1s infinite' }}>|</span>
                        )}
                    </div>
                    {loading && (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                            流式翻译进行中...
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
                <button
                    onClick={runTranslate}
                    disabled={loading || !sourceText.trim()}
                    style={{ 
                        padding: '12px 24px', 
                        fontSize: 16, 
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                    }}
                >
                    {loading ? '翻译中...' : '开始翻译'}
                </button>

                {error && (
                    <div style={{ color: 'red', fontSize: 14 }}>
                        错误: {String(error)}
                    </div>
                )}
            </div>

            {result && (
                <div style={{ marginTop: 20, padding: 16, border: '1px solid #ddd', borderRadius: 4, backgroundColor: 'white' }}>
                    <h3 style={{ color: 'black' }}>响应详情</h3>
                    <div style={{ fontSize: 14, color: 'black' }}>
                        {(() => {
                            try {
                                return (
                                    <>
                                        {result.provider && (
                                            <>
                                                <div><strong>引擎:</strong> {String(result.provider)}</div>
                                                <div><strong>延迟:</strong> {String(result.latencyMs || 0)}ms</div>
                                                <div><strong>源语言:</strong> {String(result.source || '自动检测')}</div>
                                                <div><strong>目标语言:</strong> {String(result.target)}</div>
                                            </>
                                        )}
                                        {result.status && (
                                            <>
                                                <div><strong>状态:</strong> {String(result.status)}</div>
                                                <div><strong>服务:</strong> {String(result.service)}</div>
                                                <div><strong>测试结果:</strong> {String(result.testResult)}</div>
                                                {result.availableEngines && Array.isArray(result.availableEngines) && (
                                                    <div><strong>可用引擎:</strong> {result.availableEngines.join(', ')}</div>
                                                )}
                                                {result.availableEngines && !Array.isArray(result.availableEngines) && (
                                                    <div><strong>可用引擎:</strong> {String(result.availableEngines)}</div>
                                                )}
                                                <div><strong>时间:</strong> {String(result.timestamp)}</div>
                                            </>
                                        )}
                                    </>
                                )
                            } catch (renderError) {
                                console.error('渲染结果时出错:', renderError)
                                return (
                                    <div style={{ color: 'red' }}>
                                        渲染结果时出错: {String(renderError)}
                                    </div>
                                )
                            }
                        })()}
                    </div>
                </div>
            )}

            <div style={{ marginTop: 30 }}>
                <h3 style={{ color: 'black' }}>功能说明</h3>
                <ul style={{ lineHeight: 1.6, color: 'black' }}>
                    <li>支持多种翻译引擎（Squady、Google、DeepL），自动故障转移</li>
                    <li>支持多种语言之间的互译，源语言支持自动检测</li>
                    <li>可以测试翻译引擎的健康状态</li>
                    <li>支持负载均衡和API密钥轮换</li>
                </ul>
            </div>
        </div>
    )
}
