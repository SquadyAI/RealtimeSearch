import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

function useIsAuthed() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  // 前端不存储任何认证状态，每次都需要重新登录
  useEffect(() => {
    setIsAuthed(false)
    setIsChecking(false)
  }, [])

  return { isAuthed, isChecking }
}

export default function Layout() {
  const { isAuthed, isChecking } = useIsAuthed()
  const navigate = useNavigate()

  function logout() {
    // 不操作localStorage，只清除状态
    navigate('/login')
  }

  // 如果正在检查认证状态，显示加载
  if (isChecking) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        background: '#ffffff',
        color: '#000000'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div>正在验证登录状态...</div>
        </div>
      </div>
    )
  }

  const linkStyle: React.CSSProperties = {
    display: 'block',
    padding: '8px 12px',
    borderRadius: 6,
    color: '#000000',
    textDecoration: 'none',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#ffffff' }}>
      <aside style={{ width: 220, padding: 12, borderRight: '1px solid #e0e0e0', background: '#ffffff' }}>
        <div style={{ fontWeight: 700, marginBottom: 12, color: '#000000' }}>RTSearch</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <NavLink to="/" end style={({ isActive }) => ({ ...linkStyle, background: isActive ? '#f0f0f0' : undefined, color: '#000000' })}>搜索</NavLink>
          <NavLink to="/translate" style={({ isActive }) => ({ ...linkStyle, background: isActive ? '#f0f0f0' : undefined, color: '#000000' })}>翻译</NavLink>
          <NavLink to="/tlb" style={({ isActive }) => ({ ...linkStyle, background: isActive ? '#f0f0f0' : undefined, color: '#000000' })}>TLB状态</NavLink>
          <NavLink to="/engines" style={({ isActive }) => ({ ...linkStyle, background: isActive ? '#f0f0f0' : undefined, color: '#000000' })}>引擎状态</NavLink>
          <NavLink to="/history" style={({ isActive }) => ({ ...linkStyle, background: isActive ? '#f0f0f0' : undefined, color: '#000000' })}>我的历史</NavLink>
          <NavLink to="/admin" style={({ isActive }) => ({ ...linkStyle, background: isActive ? '#f0f0f0' : undefined, color: '#000000' })}>管理面板</NavLink>
          {!isAuthed ? (
            <>
              <NavLink to="/login" style={({ isActive }) => ({ ...linkStyle, background: isActive ? '#f0f0f0' : undefined, color: '#000000' })}>登录</NavLink>
              <NavLink to="/register" style={({ isActive }) => ({ ...linkStyle, background: isActive ? '#f0f0f0' : undefined, color: '#000000' })}>注册</NavLink>
            </>
          ) : (
            <button onClick={logout} style={{ ...linkStyle, textAlign: 'left', background: '#ffffff', border: '1px solid #e0e0e0', cursor: 'pointer', color: '#000000' }}>退出登录</button>
          )}
        </nav>
        <div style={{ marginTop: 16, fontSize: 12, color: '#666666' }}>
          <div>版本：前端</div>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 16, background: '#ffffff' }}>
        <Outlet />
      </main>
    </div>
  )
}


