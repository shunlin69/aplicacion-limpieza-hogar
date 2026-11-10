// Calendario semanal de toda la casa: quién limpia qué día, quién descansa,
// ausencias y turnos que se deben. Todo visible para todos.
import { useState } from 'react'
import { addDays, localDateOf, WEEKDAY_NAMES, weekDays, weekStart as weekStartOf, isoWeekday } from '../../core/dates'
import { useWeek } from '../../hooks/useWeek'
import { shiftPhase } from '../../core/completion'
import { useApp } from '../../state/AppState'
import { Avatar } from '../../ui/Avatar'
import { ShiftCard } from '../../ui/ShiftCard'

const fmtDay = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

export function SemanaPage() {
  const { household, members, me } = useApp()
  const tz = household?.timezone ?? 'America/Santiago'
  const today = localDateOf(new Date(), tz)
  const [week, setWeek] = useState(() => weekStartOf(today))
  const { shifts, checks, cutoffOf, isProjection, debts, absences, loading } = useWeek(household, members, week)

  const name = (id: string) => members.find((m) => m.id === id)?.profile.display_name ?? 'alguien'
  const participants = members.filter((m) => m.participates)
  const resting = participants.filter((m) => !shifts.some((s) => s.memberId === m.id))
  const weekAbsences = absences.filter((a) => a.weekStart === week)
  const openDebts = debts.filter((d) => !d.settledWeek)
  const isCurrent = week === weekStartOf(today)

  return (
    <div className="page">
      <h1 className="page-title">Semana</h1>

      <div className="week-nav">
        <button className="btn btn-soft btn-small" onClick={() => setWeek(addDays(week, -7))} aria-label="Semana anterior">‹</button>
        <div style={{ textAlign: 'center' }}>
          <div className="member-name">{isCurrent ? 'Esta semana' : week === addDays(weekStartOf(today), 7) ? 'Próxima semana' : `Semana del ${fmtDay(week)}`}</div>
          <div className="small muted">{fmtDay(week)} al {fmtDay(addDays(week, 6))}</div>
        </div>
        <button className="btn btn-soft btn-small" onClick={() => setWeek(addDays(week, 7))} aria-label="Semana siguiente">›</button>
      </div>

      {!household?.rotation_start ? (
        <div className="card empty">
          <span className="big">🎲</span>
          <p className="muted">La rotación aún no empieza. Un admin debe hacer el sorteo del orden en Ajustes.</p>
        </div>
      ) : week < household.rotation_start ? (
        <div className="card empty">
          <span className="big">⏳</span>
          <p className="muted">La rotación parte el lunes {fmtDay(household.rotation_start)}.</p>
          <button className="btn btn-soft btn-small" style={{ marginTop: 12 }} onClick={() => setWeek(household.rotation_start!)}>Ver la primera semana</button>
        </div>
      ) : loading ? (
        <div className="spinner" style={{ marginTop: 40 }} />
      ) : (
        <>
          {isProjection && <div className="alert alert-info small">🔮 Proyección: así quedaría según la rotación. Se confirma el domingo anterior a las 18:00.</div>}

          {weekDays(week).map((d) => {
            const dayShifts = shifts.filter((s) => s.date === d)
            const isToday = d === today
            return (
              <section key={d} className={`day${isToday ? ' day-today' : ''}${dayShifts.length ? '' : ' day-free'}`}>
                <div className="day-label">
                  <b>{WEEKDAY_NAMES[isoWeekday(d)]}</b> <span className="muted small">{fmtDay(d)}</span>
                  {isToday && <span className="badge badge-me">Hoy</span>}
                </div>
                {dayShifts.length ? dayShifts.map((s) => <ShiftCard key={s.templateId + s.date} shift={s} members={members} meId={me?.id} compact checked={(s.id && checks[s.id]) || []} late={s.status === 'pending' && shiftPhase(today, s.date, cutoffOf(s.date)) === 'late'} />) : <span className="small muted">Sin turno</span>}
              </section>
            )
          })}

          {resting.length > 0 && (
            <div className="card row" style={{ flexWrap: 'wrap' }}>
              <span>😴 Descansa{resting.length > 1 ? 'n' : ''}:</span>
              {resting.map((m) => (
                <span key={m.id} className="row" style={{ gap: 6 }}>
                  <Avatar profile={m.profile} /> <b>{m.profile.display_name}</b>
                </span>
              ))}
            </div>
          )}

          {weekAbsences.length > 0 && (
            <div className="card stack">
              <h2>📚 No disponibles esta semana</h2>
              {weekAbsences.map((a) => (
                <p key={a.id}>
                  <b>{name(a.memberId)}</b>
                  {a.reason ? ` · ${a.reason}` : ''}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {openDebts.length > 0 && (
        <div className="card stack">
          <h2>🤝 Turnos por devolver</h2>
          {openDebts.map((d) => (
            <p key={d.id}>
              <b>{name(d.debtorId)}</b> le debe un turno a <b>{name(d.creditorId)}</b>
            </p>
          ))}
          <p className="small muted">Se devuelven solos en la próxima semana de descanso de quien debe.</p>
        </div>
      )}
    </div>
  )
}
