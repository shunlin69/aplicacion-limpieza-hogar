import { addDays, isoWeekday, localDateOf, WEEKDAY_NAMES, weekStart } from '../../core/dates'
import { useWeek } from '../../hooks/useWeek'
import { useApp } from '../../state/AppState'
import { Avatar } from '../../ui/Avatar'
import { ShiftCard } from '../../ui/ShiftCard'

const saludo = (h: number) => (h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches')
const fmtLong = (d: string) => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

export function HoyPage() {
  const { profile, household, members, me } = useApp()
  const tz = household?.timezone ?? 'America/Santiago'
  const today = localDateOf(new Date(), tz)
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit' }).format(new Date()))
  const thisWeek = useWeek(household, members, weekStart(today))
  const nextWeek = useWeek(household, members, addDays(weekStart(today), 7))

  const raw = fmtLong(today)
  const fecha = raw.charAt(0).toUpperCase() + raw.slice(1)
  const all = [...thisWeek.shifts, ...nextWeek.shifts]
  const todayShifts = all.filter((s) => s.date === today)
  const mineToday = todayShifts.filter((s) => s.memberId === me?.id)
  const myNext = all.find((s) => s.memberId === me?.id && s.date > today)
  const loading = thisWeek.loading || nextWeek.loading

  return (
    <div className="page">
      <div className="row-between">
        <div>
          <p className="page-sub">{fecha}</p>
          <h1 className="page-title">
            {saludo(hour)}, {profile?.display_name || 'tú'}
          </h1>
        </div>
        {profile && <Avatar profile={profile} large />}
      </div>

      {!household?.rotation_start ? (
        <div className="card card-hero stack">
          <h2 style={{ marginBottom: 0 }}>🏠 {household?.name}</h2>
          <p>Los turnos aparecerán aquí cuando un admin haga el sorteo de la rotación (en Ajustes).</p>
        </div>
      ) : loading ? (
        <div className="spinner" style={{ marginTop: 40 }} />
      ) : (
        <>
          {mineToday.length > 0 ? (
            <div className="card card-hero stack">
              <h2 style={{ marginBottom: 0 }}>🧽 ¡Hoy te toca!</h2>
              {mineToday.map((s) => (
                <ShiftCard key={s.templateId} shift={s} members={members} meId={me?.id} />
              ))}
              <p className="small">Pronto podrás marcar cada parte como hecha desde aquí.</p>
            </div>
          ) : me?.participates ? (
            <div className="card empty">
              <span className="big">✨</span>
              <p className="muted">Hoy no tienes turno. ¡Disfruta!</p>
            </div>
          ) : null}

          {myNext && (
            <div className="card stack">
              <h2 style={{ marginBottom: 0 }}>📅 Tu próximo turno</h2>
              <p>
                <b>{WEEKDAY_NAMES[isoWeekday(myNext.date)]}</b> {fmtLong(myNext.date).split(', ')[1]}
              </p>
              <div className="chips">
                {myNext.spaces.map((s) => (
                  <span key={s.id} className="chip">
                    {s.icon} {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {todayShifts.length > 0 && mineToday.length !== todayShifts.length && (
            <div className="card stack">
              <h2 style={{ marginBottom: 0 }}>🏠 Hoy limpia</h2>
              {todayShifts.filter((s) => s.memberId !== me?.id).map((s) => (
                <ShiftCard key={s.templateId} shift={s} members={members} compact />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
