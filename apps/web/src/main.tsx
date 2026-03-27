import { createRoot } from 'react-dom/client'
import './index.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { SearchPage } from './pages/SearchPage'
import { TranslatePage } from './pages/TranslatePage'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AuthPage } from './pages/AuthPage'
import { UserHistoryPage } from './pages/UserHistoryPage'
import { TLBStatusPage } from './pages/TLBStatusPage'
import { EngineStatusPage } from './pages/EngineStatusPage'
import Layout from './components/Layout'
import SetupPage from './pages/SetupPage'
import BootstrapGuard from './components/BootstrapGuard'

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <BootstrapGuard>
        <Layout />
      </BootstrapGuard>
    ),
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'translate', element: <TranslatePage /> },
      { path: 'tlb', element: <TLBStatusPage /> },
      { path: 'engines', element: <EngineStatusPage /> },
      { path: 'history', element: <UserHistoryPage /> },
      { path: 'admin', element: <AdminDashboard /> },
    ],
  },
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <AuthPage /> },
  { path: '/register', element: <AuthPage /> },
])

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
);
