import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBackendUrl } from '../utils/api'

function useBackendBaseUrl() {
  return getBackendUrl();
}

interface BootstrapGuardProps {
  children: React.ReactNode
}

export default function BootstrapGuard({ children }: BootstrapGuardProps) {
  const [isChecking, setIsChecking] = useState(true)
  const navigate = useNavigate()
  const baseUrl = useBackendBaseUrl()

  useEffect(() => {
    async function checkBootstrapStatus() {
      try {
        // 检查后端根路径，获取系统状态和用户登录状态
        const response = await fetch(`${baseUrl}/`)
        
        if (response.ok) {
          const data = await response.json()
          
          if (data.bootstrap && data.bootstrap.bootstrapRequired) {
            // 系统需要初始化，跳转到设置页面
            navigate('/setup')
            return
          }
          
          // 如果系统已初始化但用户未登录，跳转到登录页面
          if (data.systemInitialized && !data.userLoggedIn) {
            navigate('/login')
            return
          }
        }
      } catch (error) {
        console.error('Failed to check bootstrap status:', error)
        // 如果检查失败，假设不需要引导
      } finally {
        setIsChecking(false)
      }
    }

    checkBootstrapStatus()
  }, [baseUrl, navigate])

  // 如果正在检查，显示加载状态
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
          <div>正在检查系统状态...</div>
        </div>
      </div>
    )
  }

  // 如果不需要引导，渲染子组件
  return <>{children}</>
}
