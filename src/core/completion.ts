// =============================================================
// Reglas para marcar un turno como hecho (lógica pura).
// La base de datos aplica exactamente estas mismas reglas en
// complete_shift() y mark_missed_shifts(); estas funciones las
// documentan, se prueban y la app las usa para mostrar el estado.
//
//   - El turno se puede marcar desde su día (no antes).
//   - Hecho el mismo día            -> puntos completos.
//   - Hecho después, pero antes del  -> la mitad (redondeada).
//     siguiente turno de la casa
//   - Llega el siguiente turno de    -> "no hecho": resta la mitad.
//     la casa y sigue pendiente
// =============================================================
import { addDays, type LocalDate } from './dates.ts'
import { nextOccurrence, type Recurrence } from './recurrence.ts'

export type ShiftStatus = 'pending' | 'done' | 'late_done' | 'missed'

/** Fase de un turno pendiente según la fecha de hoy */
export type ShiftPhase = 'upcoming' | 'today' | 'late' | 'expired'

/** Mitad de los puntos, redondeando hacia arriba en el .5 (igual que round() en SQL) */
export function halfPoints(points: number): number {
  return Math.round(points / 2)
}

/**
 * Día en que el turno pasa a "no hecho": el siguiente día con turno en la casa.
 * Si la casa no tiene más turnos, una semana después.
 */
export function missedCutoff(date: LocalDate, rules: Recurrence[]): LocalDate {
  const next = rules
    .map((r) => nextOccurrence(r, addDays(date, 1), 60))
    .filter((d): d is LocalDate => d !== null)
    .sort()[0]
  return next ?? addDays(date, 7)
}

export function shiftPhase(today: LocalDate, date: LocalDate, cutoff: LocalDate): ShiftPhase {
  if (today < date) return 'upcoming'
  if (today === date) return 'today'
  if (today < cutoff) return 'late'
  return 'expired'
}

/** Resultado de marcar como hecho hoy, o el motivo por el que no se puede */
export function completionOutcome(
  today: LocalDate,
  date: LocalDate,
  cutoff: LocalDate,
  points: number,
): { ok: true; status: 'done' | 'late_done'; delta: number } | { ok: false; error: string } {
  const phase = shiftPhase(today, date, cutoff)
  if (phase === 'upcoming') return { ok: false, error: 'Este turno aún no llega' }
  if (phase === 'expired') return { ok: false, error: 'El plazo de este turno terminó' }
  if (phase === 'today') return { ok: true, status: 'done', delta: points }
  return { ok: true, status: 'late_done', delta: halfPoints(points) }
}

/** Puntos que se restan si el turno no se hace */
export function missedPenalty(points: number): number {
  return -halfPoints(points)
}

/** Puntos que suma o resta un turno ya cerrado (para mostrar en la app) */
export function pointsForStatus(status: ShiftStatus, points: number): number {
  if (status === 'done') return points
  if (status === 'late_done') return halfPoints(points)
  if (status === 'missed') return missedPenalty(points)
  return 0
}
