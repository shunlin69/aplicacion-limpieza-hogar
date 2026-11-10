// Turno de hoy (o atrasado) de quien usa la app: lista de "limpio" para ir
// marcando con un toque y botón para terminar, con sonido y confeti.
import { useEffect, useMemo, useState } from 'react'
import { halfPoints, pointsForStatus, shiftPhase } from '../../core/completion'
import { isoWeekday, localDateOf, WEEKDAY_NAMES, type LocalDate } from '../../core/dates'
import { inPeriod, monthPeriod, rewardsCrossed, type Reward } from '../../core/ranking'
import type { WeekShift } from '../../hooks/useWeek'
import { playPoints, playTick } from '../../lib/celebrate'
import { mensajeError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../state/AppState'
import { Celebracion } from '../../ui/Celebracion'
import { Escena, escenaDeTurno } from '../../ui/Escena'

/** Premios del mes que se alcanzaron justo con estos puntos */
async function premiosRecienGanados(householdId: string, memberId: string, date: LocalDate, tz: string, gained: number): Promise<Reward[]> {
  const [l, r] = await Promise.all([
    supabase.from('points_ledger').select('delta, created_at, shift:shifts(date)').eq('member_id', memberId),
    supabase.from('rewards').select('id, name, icon, points_needed').eq('household_id', householdId).eq('active', true),
  ])
  const month = monthPeriod(date)
  type L = { delta: number; created_at: string; shift: { date: string } | null }
  const after = ((l.data ?? []) as unknown as L[])
    .filter((x) => inPeriod(x.shift?.date ?? localDateOf(new Date(x.created_at), tz), month))
    .reduce((n, x) => n + x.delta, 0)
  const rewards = ((r.data ?? []) as { id: string; name: string; icon: string; points_needed: number }[]).map((x) => ({ id: x.id, name: x.name, icon: x.icon, pointsNeeded: x.points_needed }))
  return rewardsCrossed(after - gained, after, rewards)
}

const espacios = (shift: WeekShift) => {
  const n = shift.spaces.map((s) => s.name)
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}` : (n[0] ?? '')
}

const UNDO_MINUTES = 10

interface Props {
  shift: WeekShift
  checked: string[] // ítems marcados según el servidor
  today: LocalDate
  cutoff: LocalDate
  onChanged: () => Promise<void> | void
}

export function TurnoActivo({ shift, checked, today, cutoff, onChanged }: Props) {
  // Cambios del usuario aún no confirmados por el servidor (respuesta instantánea)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { household } = useApp()
  // Celebración abierta tras terminar: puntos ganados, si fue tarde y premios desbloqueados
  const [fiesta, setFiesta] = useState<{ points: number; late: boolean; rewards: Reward[] } | null>(null)
  const [, setTick] = useState(0)

  const items = useMemo(() => shift.spaces.flatMap((s) => s.items ?? []), [shift.spaces])
  const isOn = (id: string) => overrides[id] ?? checked.includes(id)
  const done = items.filter((i) => isOn(i.id)).length
  const total = items.length
  const allDone = done === total
  const phase = shiftPhase(today, shift.date, cutoff)
  const worth = phase === 'late' ? halfPoints(shift.points) : shift.points
  const closed = shift.status !== 'pending'

  // Refresca cada 30 s para esconder "Deshacer" cuando pasan los 10 minutos
  useEffect(() => {
    if (!closed) return
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [closed])

  const toggle = async (id: string) => {
    if (!shift.id || closed) return
    const next = !isOn(id)
    setError('')
    if (next) playTick()
    setOverrides((o) => ({ ...o, [id]: next }))
    const { error: e } = await supabase.rpc('toggle_shift_item', { p_shift: shift.id, p_item: id, p_checked: next })
    if (e) setError(mensajeError(e))
    await onChanged()
    // Se quita el cambio local cuando el servidor ya lo tiene (o falló)
    setOverrides((o) => {
      const { [id]: _, ...rest } = o
      return rest
    })
  }

  const complete = async () => {
    if (!shift.id) return
    setBusy(true)
    setError('')
    const { data, error: e } = await supabase.rpc('complete_shift', { p_shift: shift.id })
    setBusy(false)
    if (e) {
      setError(mensajeError(e))
      return
    }
    const res = data as { points: number; status: string }
    playPoints()
    const rewards = household && shift.memberId
      ? await premiosRecienGanados(household.id, shift.memberId, shift.date, household.timezone, res.points).catch(() => [])
      : []
    setFiesta({ points: res.points, late: res.status === 'late_done', rewards })
    onChanged()
  }

  const undo = async () => {
    if (!shift.id) return
    setBusy(true)
    const { error: e } = await supabase.rpc('undo_complete_shift', { p_shift: shift.id })
    setBusy(false)
    if (e) setError(mensajeError(e))
    onChanged()
  }

  const escena = escenaDeTurno(shift.spaces)
  const banner = (
    <div className="scene-banner">
      <Escena tipo={escena} />
      <span className="scene-chip">
        {WEEKDAY_NAMES[isoWeekday(shift.date)]} · {espacios(shift)}
      </span>
    </div>
  )
  const celebracion = fiesta && (
    <Celebracion
      variant="turno"
      title={fiesta.late ? '¡Bien, terminado!' : '¡Turno terminado!'}
      subtitle={fiesta.late ? 'Llegó tarde, pero suma la mitad. ¡La próxima a tiempo!' : 'La casa brilla gracias a ti ✨'}
      points={fiesta.points}
      rewards={fiesta.rewards}
      onClose={() => setFiesta(null)}
    />
  )

  const canUndo = closed && shift.status !== 'missed' && !!shift.completedAt && Date.now() - new Date(shift.completedAt).getTime() < UNDO_MINUTES * 60_000

  if (closed) {
    const pts = pointsForStatus(shift.status, shift.points)
    return (
      <div className={`card stack done-card${shift.status === 'missed' ? ' done-missed' : ''}`}>
        {celebracion}
        {banner}
        <div className="done-hero stack">
          {shift.status === 'missed' ? (
            <>
              <span className="big">😕</span>
              <h2 style={{ margin: 0 }}>Turno no hecho</h2>
              <p className="muted">Se restaron {Math.abs(pts)} puntos. ¡La próxima sale!</p>
            </>
          ) : (
            <>
              <span className="big">🏆</span>
              <h2 style={{ margin: 0 }}>{shift.status === 'done' ? '¡Turno terminado!' : 'Terminado (tarde)'}</h2>
              <p>
                <span className="points-pill">+{pts} pts</span>
              </p>
            </>
          )}
          {canUndo && (
            <button className="btn btn-ghost btn-small" onClick={undo} disabled={busy}>
              Me equivoqué, deshacer
            </button>
          )}
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="card card-hero stack">
      {celebracion}
      {banner}
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{phase === 'late' ? '⏰ Turno atrasado' : '🧽 ¡Hoy te toca!'}</h2>
        <span className="points-pill">{worth} pts</span>
      </div>

      {phase === 'late' && (
        <div className="alert late-note small">
          Era del {WEEKDAY_NAMES[isoWeekday(shift.date)].toLowerCase()}. Termínalo antes del {WEEKDAY_NAMES[isoWeekday(cutoff)].toLowerCase()} y ganas
          la mitad ({halfPoints(shift.points)} pts). Si no, se restan {halfPoints(shift.points)}.
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <div className="row-between small">
          <b>
            {done} de {total} listas
          </b>
          <span>{Math.round((done / Math.max(total, 1)) * 100)}%</span>
        </div>
        <div className="progress">
          <span style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
        </div>
      </div>

      {shift.spaces.map((sp) => (
        <div key={sp.id} className="space-block">
          <h3>
            {sp.icon} {sp.name}
          </h3>
          {(sp.items ?? []).map((it) => {
            const on = isOn(it.id)
            return (
              <button key={it.id} className={`check-item${on ? ' on' : ''}`} onClick={() => void toggle(it.id)} aria-pressed={on}>
                <span className="tick">{on ? '✓' : ''}</span>
                <span className="label">{it.label}</span>
              </button>
            )
          })}
        </div>
      ))}

      {error && <div className="alert alert-error">{error}</div>}

      <button className={`btn btn-done btn-block${allDone && !busy ? ' ready' : ''}`} onClick={complete} disabled={!allDone || busy || !shift.id}>
        {busy ? 'Guardando…' : allDone ? `¡Listo! Ganar ${worth} pts` : `Faltan ${total - done} por marcar`}
      </button>
    </div>
  )
}
