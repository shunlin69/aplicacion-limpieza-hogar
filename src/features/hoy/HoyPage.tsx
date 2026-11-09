import { useApp } from '../../state/AppState'
import { Avatar } from '../../ui/Avatar'

const saludo = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

export function HoyPage() {
  const { profile, household, members } = useApp()
  const raw = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: household?.timezone }).format(new Date())
  const fecha = raw.charAt(0).toUpperCase() + raw.slice(1)
  return (
    <div className="page">
      <div className="row-between">
        <div>
          <p className="page-sub">{fecha}</p>
          <h1 className="page-title">
            {saludo()}, {profile?.display_name || 'tú'}
          </h1>
        </div>
        {profile && <Avatar profile={profile} large />}
      </div>

      <div className="card card-hero stack">
        <h2 style={{ marginBottom: 0 }}>🏠 {household?.name}</h2>
        <p>
          {members.length} {members.length === 1 ? 'integrante' : 'integrantes'}. Los turnos de limpieza aparecerán aquí cuando activemos el reparto automático.
        </p>
      </div>

      <div className="card empty">
        <span className="big">✨</span>
        <p className="muted">Hoy no tienes tareas todavía.</p>
      </div>
    </div>
  )
}
