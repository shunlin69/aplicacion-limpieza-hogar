import { HashRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { AjustesPage } from './features/ajustes/AjustesPage'
import { AuthScreen } from './features/auth/AuthScreen'
import { HoyPage } from './features/hoy/HoyPage'
import { OnboardingScreen } from './features/onboarding/OnboardingScreen'
import { RankingPage } from './features/ranking/RankingPage'
import { SemanaPage } from './features/semana/SemanaPage'
import { TareasPage } from './features/tareas/TareasPage'
import { useApp } from './state/AppState'
import { TabBar } from './ui/TabBar'

// Usamos HashRouter (#/hoy) porque GitHub Pages no sabe redirigir rutas de una SPA

function Gate({ inviteCode }: { inviteCode?: string }) {
  const { loading, session, household } = useApp()
  const navigate = useNavigate()

  if (loading) return <div className="spinner" aria-label="Cargando" />
  if (!session) return <AuthScreen inviteCode={inviteCode} />
  if (!household) return <OnboardingScreen inviteCode={inviteCode} onDone={() => navigate('/hoy', { replace: true })} />
  if (inviteCode) return <Navigate to="/hoy" replace />

  return (
    <>
      <main className="app">
        <Routes>
          <Route path="/hoy" element={<HoyPage />} />
          <Route path="/semana" element={<SemanaPage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/tareas" element={<TareasPage />} />
          <Route path="/ajustes" element={<AjustesPage />} />
          <Route path="*" element={<Navigate to="/hoy" replace />} />
        </Routes>
      </main>
      <TabBar />
    </>
  )
}

function InviteRoute() {
  const { code } = useParams()
  return <Gate inviteCode={code} />
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/unirse/:code" element={<InviteRoute />} />
        <Route path="*" element={<Gate />} />
      </Routes>
    </HashRouter>
  )
}
