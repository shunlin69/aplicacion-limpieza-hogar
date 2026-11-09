import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/hoy', label: 'Hoy', icon: '☀️' },
  { to: '/semana', label: 'Semana', icon: '📅' },
  { to: '/ranking', label: 'Ranking', icon: '🏆' },
  { to: '/tareas', label: 'Tareas', icon: '🧹' },
  { to: '/ajustes', label: 'Ajustes', icon: '⚙️' },
]

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Navegación principal">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          <span className="tab-icon" aria-hidden>
            {t.icon}
          </span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
