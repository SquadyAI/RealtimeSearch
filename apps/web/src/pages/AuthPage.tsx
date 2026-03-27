import { useState } from 'react'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)

  const switchToLogin = () => setIsLogin(true)
  const switchToRegister = () => setIsLogin(false)

  return (
    <div>
      {isLogin ? (
        <LoginPage onSwitchToRegister={switchToRegister} />
      ) : (
        <RegisterPage onSwitchToLogin={switchToLogin} />
      )}
    </div>
  )
}
