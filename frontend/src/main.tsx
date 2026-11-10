import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { I18nProvider, useI18n } from './lib/i18n'
import { AuthProvider, useAuth, useProfile } from './lib/auth'
import { configMissing } from './lib/supabase'
import { Alert, Spinner } from './components/ui'
import { NotifyProvider } from './components/notify'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import WorkerOnboarding from './pages/WorkerOnboarding'
import WorkerHome from './pages/WorkerHome'
import CustomerHome from './pages/CustomerHome'
import WorkerList from './pages/WorkerList'
import RequestWorker from './pages/RequestWorker'
import JobPage from './pages/JobPage'

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } })

/** UX routing only — real authorization is enforced by RLS and the SQL functions. */
function Guard({ role, children }: { role?: 'worker' | 'customer'; children: ReactNode }) {
  const { session, ready } = useAuth()
  const profile = useProfile()
  if (!ready || (session && profile.isLoading)) return <Spinner />
  if (!session) return <Navigate to="/" replace />
  if (!profile.data?.role) return <Navigate to="/auth" replace />
  if (role && profile.data.role !== role) return <Navigate to={profile.data.role === 'worker' ? '/w' : '/c'} replace />
  return <>{children}</>
}

function Home() {
  const { session, ready } = useAuth()
  const profile = useProfile()
  if (!ready || (session && profile.isLoading)) return <Spinner />
  if (session && profile.data?.role) return <Navigate to={profile.data.role === 'worker' ? '/w' : '/c'} replace />
  return <Landing />
}

function App() {
  const { t } = useI18n()
  if (configMissing) return <div className="p-6 max-w-xl mx-auto"><Alert>{t('configMissing')}</Alert></div>
  return (
    <AuthProvider>
      <BrowserRouter>
        <NotifyProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/w" element={<Guard role="worker"><WorkerHome /></Guard>} />
          <Route path="/w/onboarding" element={<Guard role="worker"><WorkerOnboarding /></Guard>} />
          <Route path="/c" element={<Guard role="customer"><CustomerHome /></Guard>} />
          <Route path="/c/workers" element={<Guard role="customer"><WorkerList /></Guard>} />
          <Route path="/c/worker/:id" element={<Guard role="customer"><RequestWorker /></Guard>} />
          <Route path="/job/:id" element={<Guard><JobPage /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </NotifyProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <I18nProvider><App /></I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
)
