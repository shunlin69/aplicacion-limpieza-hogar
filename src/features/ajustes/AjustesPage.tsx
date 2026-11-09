import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'
import { applyThemePref, loadThemePref, type ThemePref } from '../../ui/theme'
import { HogarCard } from './HogarCard'
import { InvitarCard } from './InvitarCard'
import { NotificacionesCard } from './NotificacionesCard'
import { PerfilCard } from './PerfilCard'

export function AjustesPage() {
  const { isAdmin, session } = useApp()
  const [theme, setTheme] = useState<ThemePref>(loadThemePref())

  const changeTheme = (t: ThemePref) => {
    setTheme(t)
    applyThemePref(t)
  }

  return (
    <div className="page">
      <h1 className="page-title">Ajustes</h1>
      <PerfilCard />
      <NotificacionesCard />
      <HogarCard />
      {isAdmin && <InvitarCard />}
      <section className="card stack">
        <h2>🎨 Apariencia</h2>
        <div className="segmented">
          <button className={theme === 'system' ? 'on' : ''} onClick={() => changeTheme('system')}>Automático</button>
          <button className={theme === 'light' ? 'on' : ''} onClick={() => changeTheme('light')}>Claro</button>
          <button className={theme === 'dark' ? 'on' : ''} onClick={() => changeTheme('dark')}>Oscuro</button>
        </div>
      </section>
      <section className="card stack">
        <p className="small muted">Sesión iniciada como {session?.user.email}</p>
        <button className="btn btn-danger btn-block" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </section>
    </div>
  )
}
