import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AppStateProvider } from './state/AppState'
import { applyThemePref, loadThemePref } from './ui/theme'
import './ui/styles.css'

applyThemePref(loadThemePref())
// Registra el service worker (modo sin conexión + notificaciones) y se actualiza solo
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </StrictMode>,
)
