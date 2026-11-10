// =============================================================
// Ranking, cumplimiento, rachas y premios (lógica pura).
//
// Los puntos salen del libro de puntos (points_ledger). Cada
// movimiento cuenta en la fecha DEL TURNO (no del momento en que se
// registró): así un turno del viernes que queda "no hecho" el lunes
// resta en la semana del viernes, que es cuando correspondía.
// =============================================================
import { addDays, type LocalDate } from './dates.ts'
import type { ShiftStatus } from './completion.ts'

export interface LedgerEntry {
  memberId: string
  delta: number
  date: LocalDate // fecha del turno (o del registro si no viene de un turno)
}

export interface ShiftResult {
  memberId: string | null
  date: LocalDate
  status: ShiftStatus
}

export interface Period {
  from: LocalDate // incluido
  to: LocalDate // incluido
}

export interface RankRow {
  memberId: string
  points: number
  position: number // 1 = primero; empates comparten posición
  done: number // a tiempo
  late: number // tarde
  missed: number // no hechos
  /** % de cumplimiento: a tiempo = 100 %, tarde = 50 %, no hecho = 0 %. null si no tuvo turnos cerrados */
  compliance: number | null
  streak: number // turnos seguidos a tiempo (hasta hoy)
}

export const inPeriod = (d: LocalDate, p: Period) => d >= p.from && d <= p.to

export function monthPeriod(today: LocalDate): Period {
  const from = `${today.slice(0, 8)}01`
  const [y, m] = today.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { from, to: addDays(next, -1) }
}

export function weekPeriod(monday: LocalDate): Period {
  return { from: monday, to: addDays(monday, 6) }
}

/** Puntaje de cumplimiento de una lista de turnos cerrados */
export function compliance(results: ShiftStatus[]): number | null {
  const closed = results.filter((s) => s !== 'pending')
  if (!closed.length) return null
  const score = closed.reduce((n, s) => n + (s === 'done' ? 1 : s === 'late_done' ? 0.5 : 0), 0)
  return Math.round((score / closed.length) * 100)
}

/** Turnos seguidos hechos a tiempo, contando hacia atrás desde el más reciente cerrado */
export function streak(results: ShiftResult[], memberId: string): number {
  const mine = results
    .filter((r) => r.memberId === memberId && r.status !== 'pending')
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  let n = 0
  for (const r of mine) {
    if (r.status !== 'done') break
    n++
  }
  return n
}

/**
 * Tabla de posiciones del período. Orden: más puntos; si empatan, mejor
 * cumplimiento; si siguen empatados comparten el puesto.
 */
export function ranking(memberIds: string[], ledger: LedgerEntry[], shifts: ShiftResult[], period: Period): RankRow[] {
  const rows = memberIds.map((id) => {
    const statuses = shifts.filter((s) => s.memberId === id && inPeriod(s.date, period)).map((s) => s.status)
    return {
      memberId: id,
      points: ledger.filter((e) => e.memberId === id && inPeriod(e.date, period)).reduce((n, e) => n + e.delta, 0),
      position: 0,
      done: statuses.filter((s) => s === 'done').length,
      late: statuses.filter((s) => s === 'late_done').length,
      missed: statuses.filter((s) => s === 'missed').length,
      compliance: compliance(statuses),
      streak: streak(shifts, id),
    }
  })
  const key = (r: RankRow) => [r.points, r.compliance ?? -1] as const
  rows.sort((a, b) => key(b)[0] - key(a)[0] || key(b)[1] - key(a)[1])
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    r.position = prev && key(prev)[0] === key(r)[0] && key(prev)[1] === key(r)[1] ? prev.position : i + 1
  })
  return rows
}

export interface Reward {
  id: string
  name: string
  icon: string
  pointsNeeded: number
}

/** Avance hacia un premio con los puntos del mes (0 a 1) y si ya se ganó */
export function rewardProgress(points: number, reward: Reward): { ratio: number; earned: boolean; missing: number } {
  const need = Math.max(reward.pointsNeeded, 1)
  return { ratio: Math.min(Math.max(points, 0) / need, 1), earned: points >= need, missing: Math.max(need - points, 0) }
}
