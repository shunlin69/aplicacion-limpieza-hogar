import { shiftPhase } from '../../core/completion'
import { addDays, isoWeekday, localDateOf, WEEKDAY_NAMES, weekStart } from '../../core/dates'
import { useWeek } from '../../hooks/useWeek'
import { useApp } from '../../state/AppState'
import { Avatar } from '../../ui/Avatar'
import { ShiftCard } from '../../ui/ShiftCard'
import { Escena, escenaDeTurno } from '../../ui/Escena'
import { TurnoActivo } from './TurnoActivo'
import { useSwaps } from '../../hooks/useSwaps'
import { BotonCambio } from '../cambios/BotonCambio'
import { SolicitudesCard } from '../cambios/SolicitudesCard'

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
  // Mis turnos para hoy, más los atrasados que aún están en plazo
  const mineToday = thisWeek.shifts.filter(
    (s) => s.memberId === me?.id && (s.date === today || (s.status === 'pending' && shiftPhase(today, s.date, thisWeek.cutoffOf(s.date)) === 'late')),
  )
  const myNext = all.find((s) => s.memberId === me?.id && s.date > today)
  const loading = thisWeek.loading || nextWeek.loading
  const { swaps, reload: reloadSwaps } = useSwaps(household)
  const refreshAll = () => {
    void reloadSwaps()
    void thisWeek.reload()
    void nextWeek.reload()
  }

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

      {me && <SolicitudesCard swaps={swaps} members={members} me={me} onChanged={refreshAll} />}

      {!household?.rotation_start ? (
        <div className="card card-hero stack">
          <div className="scene-banner">
            <Escena tipo="casa" />
          </div>
          <h2 style={{ marginBottom: 0 }}>🏠 {household?.name}</h2>
          <p>Los turnos aparecerán aquí cuando un admin haga el sorteo de la rotación (en Ajustes).</p>
        </div>
      ) : loading ? (
        <div className="spinner" style={{ marginTop: 40 }} />
      ) : (
        <>
          {mineToday.length > 0 ? (
            mineToday.map((s) => (
              <TurnoActivo
                key={s.id ?? s.templateId + s.date}
                shift={s}
                checked={(s.id && thisWeek.checks[s.id]) || []}
                today={today}
                cutoff={thisWeek.cutoffOf(s.date)}
                onChanged={thisWeek.reload}
              />
            ))
          ) : me?.participates ? (
            <div className="card stack">
              <div className="scene-banner">
                <Escena tipo="living" />
                <span className="scene-chip">Día libre</span>
              </div>
              <h2 style={{ marginBottom: 0 }}>✨ Hoy no tienes turno</h2>
              <p className="muted">¡Disfruta! Te avisamos cuando te toque.</p>
            </div>
          ) : null}

          {myNext && (
            <div className="card stack">
              <div className="scene-banner scene-banner-sm">
                <Escena tipo={escenaDeTurno(myNext.spaces)} />
              </div>
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
              {myNext.id && (
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <BotonCambio shift={myNext} swaps={swaps} today={today} />
                </div>
              )}
            </div>
          )}

          {todayShifts.some((s) => s.memberId !== me?.id) && (
            <div className="card stack">
              <h2 style={{ marginBottom: 0 }}>🏠 Hoy limpia</h2>
              {todayShifts.filter((s) => s.memberId !== me?.id).map((s) => (
                <ShiftCard key={s.templateId} shift={s} members={members} compact checked={(s.id && thisWeek.checks[s.id]) || []} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
