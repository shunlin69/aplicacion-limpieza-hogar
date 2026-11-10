// Ranking: puntos por semana y por mes, premios e historial de la casa
import { useMemo, useState } from 'react'
import { addDays, localDateOf, weekStart } from '../../core/dates'
import { monthPeriod, ranking, weekPeriod } from '../../core/ranking'
import { useScores } from '../../hooks/useScores'
import { useApp } from '../../state/AppState'
import { Historial } from './Historial'
import { PremiosCard } from './PremiosCard'
import { Podio } from './Podio'
import { TablaPosiciones } from './TablaPosiciones'

type Vista = 'semana' | 'mes' | 'historial'
const fmtDay = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
const fmtMonth = (d: string) => {
  const s = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function RankingPage() {
  const { household, members, me, isAdmin } = useApp()
  const tz = household?.timezone ?? 'America/Santiago'
  const today = localDateOf(new Date(), tz)
  const thisMonday = weekStart(today)
  const [vista, setVista] = useState<Vista>('semana')
  const [week, setWeek] = useState(thisMonday)
  const [monthRef, setMonthRef] = useState(today) // cualquier día del mes que se mira
  const { ledger, results, rewards, activity, loading, reload } = useScores(household)

  // En el ranking aparecen quienes hacen turnos y quien tenga puntos (ej: dejó de participar)
  const ids = useMemo(() => {
    const set = new Set(members.filter((m) => m.participates).map((m) => m.id))
    for (const e of ledger) if (members.some((m) => m.id === e.memberId)) set.add(e.memberId)
    return [...set]
  }, [members, ledger])

  const wPeriod = weekPeriod(week)
  const mPeriod = monthPeriod(monthRef)
  const weekRows = ranking(ids, ledger, results, wPeriod)
  const monthRows = ranking(ids, ledger, results, mPeriod)
  const prevMonth = (d: string) => addDays(monthPeriod(d).from, -1)
  const nextMonth = (d: string) => addDays(monthPeriod(d).to, 1)

  return (
    <div className="page">
      <h1 className="page-title">Ranking</h1>
      <div className="segmented">
        {(['semana', 'mes', 'historial'] as Vista[]).map((v) => (
          <button key={v} className={vista === v ? 'on' : ''} onClick={() => setVista(v)}>
            {v === 'semana' ? 'Semana' : v === 'mes' ? 'Mes' : 'Historial'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner" style={{ marginTop: 40 }} />
      ) : vista === 'semana' ? (
        <>
          <div className="week-nav">
            <button className="btn btn-soft btn-small" onClick={() => setWeek(addDays(week, -7))} aria-label="Semana anterior">‹</button>
            <div style={{ textAlign: 'center' }}>
              <div className="member-name">{week === thisMonday ? 'Esta semana' : week === addDays(thisMonday, -7) ? 'Semana pasada' : `Semana del ${fmtDay(week)}`}</div>
              <div className="small muted">{fmtDay(wPeriod.from)} al {fmtDay(wPeriod.to)}</div>
            </div>
            <button className="btn btn-soft btn-small" onClick={() => setWeek(addDays(week, 7))} disabled={week >= thisMonday} aria-label="Semana siguiente">›</button>
          </div>
          <div className="card">
            <Podio rows={weekRows} members={members} />
            <TablaPosiciones rows={weekRows} members={members} meId={me?.id} />
          </div>
          <p className="small muted" style={{ textAlign: 'center' }}>✓ a tiempo · ⏰ tarde · ✗ sin hacer · % cumplimiento · 🔥 racha</p>
        </>
      ) : vista === 'mes' ? (
        <>
          <div className="week-nav">
            <button className="btn btn-soft btn-small" onClick={() => setMonthRef(prevMonth(monthRef))} aria-label="Mes anterior">‹</button>
            <div style={{ textAlign: 'center' }} className="member-name">{fmtMonth(mPeriod.from)}</div>
            <button className="btn btn-soft btn-small" onClick={() => setMonthRef(nextMonth(monthRef))} disabled={mPeriod.to >= today} aria-label="Mes siguiente">›</button>
          </div>
          <div className="card">
            <Podio rows={monthRows} members={members} />
            <TablaPosiciones rows={monthRows} members={members} meId={me?.id} />
          </div>
          {household && <PremiosCard householdId={household.id} rewards={rewards} rows={monthRows} members={members} isAdmin={isAdmin} onChanged={() => void reload()} />}
        </>
      ) : (
        <Historial members={members} ledger={ledger} results={results} activity={activity} thisMonday={thisMonday} timeZone={tz} />
      )}
    </div>
  )
}
