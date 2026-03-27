import React, { useState, useEffect } from 'react';

// 添加CSS动画
const spinAnimation = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// 注入CSS
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = spinAnimation;
  document.head.appendChild(style);
}

interface TLBEngineStats {
  rps: number;
  availableTokens: number;
}

interface TLBStatus {
  search: {
    enabled: boolean;
    engines: Record<string, TLBEngineStats>;
    available: string[];
  };
  translate: {
    enabled: boolean;
    engines: Record<string, TLBEngineStats>;
    available: string[];
  };
}

export const TLBStatusPage: React.FC = () => {
  const [tlbStatus, setTlbStatus] = useState<TLBStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  function authHeaders() {
    const h: Record<string, string> = {}
    const token = localStorage.getItem('rt_token')
    if (token) h['authorization'] = `Bearer ${token}`
    return h
  }

  const fetchTLBStatus = async () => {
    try {
      const response = await fetch('/v1/tlb/status', { headers: authHeaders() });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setTlbStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTLBStatus();
    
    if (autoRefresh) {
      const interval = setInterval(fetchTLBStatus, 5000); // 每5秒刷新一次
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const renderEngineCard = (engineName: string, stats: TLBEngineStats, isAvailable: boolean) => (
    <div
      key={engineName}
      style={{
        padding: '16px',
        borderRadius: '8px',
        border: `1px solid ${isAvailable ? '#22c55e' : '#ef4444'}`,
        backgroundColor: '#ffffff',
        marginBottom: '12px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontWeight: 600, color: '#000000' }}>{engineName}</h3>
        <span
          style={{
            padding: '4px 8px',
            borderRadius: '16px',
            fontSize: '12px',
            fontWeight: 500,
            backgroundColor: isAvailable ? '#dcfce7' : '#fee2e2',
            color: isAvailable ? '#166534' : '#991b1b'
          }}
        >
          {isAvailable ? '可用' : '不可用'}
        </span>
      </div>
      <div style={{ fontSize: '14px', color: '#666666' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>RPS限制:</span>
          <span style={{ fontWeight: 500 }}>{stats.rps}/s</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>可用令牌:</span>
          <span style={{ 
            fontWeight: 500,
            color: stats.availableTokens > 0 ? '#059669' : '#dc2626'
          }}>
            {stats.availableTokens}
          </span>
        </div>
      </div>
    </div>
  );

  const renderServiceSection = (
    title: string,
    service: TLBStatus['search'] | TLBStatus['translate']
  ) => (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937' }}>{title}</h2>
        <span
          style={{
            padding: '4px 12px',
            borderRadius: '16px',
            fontSize: '14px',
            fontWeight: 500,
            backgroundColor: service.enabled ? '#dcfce7' : '#fee2e2',
            color: service.enabled ? '#166534' : '#991b1b'
          }}
        >
          {service.enabled ? '已启用' : '未启用'}
        </span>
      </div>
      
      {service.enabled ? (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: '#374151' }}>引擎状态</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {Object.entries(service.engines || {}).map(([engineName, stats]) => 
                renderEngineCard(engineName, stats, service.available.includes(engineName))
              )}
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: '#374151' }}>可用引擎</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {service.available.length > 0 ? (
                service.available.map((engine) => (
                  <span
                    key={engine}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#22c55e',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  >
                    {engine}
                  </span>
                ))
              ) : (
                <span style={{ color: '#6b7280' }}>暂无可用引擎</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p style={{ color: '#6b7280' }}>TLB未启用</p>
      )}
    </div>
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '2px solid #e5e7eb',
            borderTop: '2px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: '#6b7280' }}>正在连接TLB服务...</p>
          <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '8px' }}>正在获取引擎状态信息</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <div style={{ 
          backgroundColor: '#fef2f2', 
          border: '1px solid #fecaca', 
          borderRadius: '8px', 
          padding: '16px' 
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            fontWeight: 600, 
            color: '#991b1b', 
            margin: '0 0 8px 0' 
          }}>
            加载失败
          </h2>
          <p style={{ 
            color: '#dc2626', 
            margin: '0 0 12px 0' 
          }}>
            {error}
          </p>
          <button
            onClick={fetchTLBStatus}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px', backgroundColor: '#ffffff', color: '#000000' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#000000', margin: '0 0 8px 0' }}>TLB状态监控</h1>
        <p style={{ color: '#666666', margin: 0 }}>
          实时监控Token-based Load Balancer的运行状态和引擎统计信息
        </p>
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={fetchTLBStatus}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            刷新
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ borderRadius: '4px' }}
            />
            <span style={{ fontSize: '14px', color: '#666666' }}>自动刷新</span>
          </label>
        </div>
        
        <div style={{ fontSize: '14px', color: '#666666' }}>
          最后更新: {new Date().toLocaleTimeString()}
        </div>
      </div>

      <div style={{ marginBottom: '32px' }}>
        {tlbStatus && (
          <>
            {renderServiceSection('搜索服务', tlbStatus.search)}
            {renderServiceSection('翻译服务', tlbStatus.translate)}
          </>
        )}
      </div>

      <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '24px', border: '1px solid #e0e0e0' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#000000', margin: '0 0 12px 0' }}>TLB特性说明</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', fontSize: '14px', color: '#666666' }}>
          <div>
            <h3 style={{ fontWeight: 500, color: '#000000', margin: '0 0 8px 0' }}>🔥 热插拔引擎</h3>
            <p style={{ margin: 0 }}>支持动态添加和移除引擎，无需重启服务</p>
          </div>
          <div>
            <h3 style={{ fontWeight: 500, color: '#000000', margin: '0 0 8px 0' }}>🎯 随机令牌桶</h3>
            <p style={{ margin: 0 }}>根据RPS限制为每个引擎维护令牌桶，确保负载均衡</p>
          </div>
          <div>
            <h3 style={{ fontWeight: 500, color: '#000000', margin: '0 0 8px 0' }}>🔄 智能重试</h3>
            <p style={{ margin: 0 }}>失败时延迟归还令牌，支持自动重试机制</p>
          </div>
        </div>
      </div>
    </div>
  );
};
