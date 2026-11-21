// =============================================================
// Quejas por la limpieza anterior (lógica pura).
// La base de datos aplica estas mismas reglas en file_complaint(),
// respond_complaint(), decide_complaint() y withdraw_complaint();
// la app las usa para mostrar u ocultar botones.
//
//   - Se reclama por el turno ANTERIOR de la casa, mientras haces tu
//     turno o hasta 24 horas después de terminarlo.
//   - Solo por turnos terminados (a tiempo o tarde) de otra persona.
//   - Resta la mitad de los puntos del turno reclamado.
//   - Quien la recibe puede aceptarla o pedir revisión durante 3 días;
//     la revisión la decide un admin (mantener o anular).
// =============================================================
import { halfPoints, type ShiftPhase, type ShiftStatus } from './completion.ts'
import type { LocalDate } from './dates.ts'

export const QUEJA_MAX_FOTOS = 6
export const QUEJA_HORAS_PLAZO = 24 // para reclamar después de terminar mi turno
export const QUEJA_DIAS_RESPUESTA = 3 // para aceptar o pedir revisión
const DESHACER_MINUTOS = 10 // quien hizo el turno puede deshacerlo en este plazo

export type ComplaintStatus = 'vigente' | 'en_revision' | 'confirmada' | 'anulada' | 'retirada'

/** Puntos que resta una queja: la mitad del turno reclamado (lo mismo que vale hacerlo tarde) */
export function complaintPenalty(points: number): number {
  return halfPoints(points)
}

/** ¿La queja sigue restando puntos? Las anuladas y retiradas los devolvieron. */
export const complaintCounts = (s: ComplaintStatus) => s === 'vigente' || s === 'en_revision' || s === 'confirmada'

/** ¿Todavía se puede cambiar algo? (responder, decidir o retirar) */
export const complaintOpen = (s: ComplaintStatus) => s === 'vigente' || s === 'en_revision'

/** Turnos del último día con turno antes de `date` (el "turno anterior" de la casa) */
export function previousShifts<T extends { date: LocalDate }>(shifts: T[], date: LocalDate): T[] {
  const before = shifts.filter((s) => s.date < date)
  if (!before.length) return []
  const last = before.reduce((d, s) => (s.date > d ? s.date : d), before[0].date)
  return before.filter((s) => s.date === last)
}

/** ¿Mi turno está en plazo para reclamar? Abierto, o terminado hace menos de 24 horas. */
export function complaintWindowOpen(status: ShiftStatus, phase: ShiftPhase, completedAt: string | null | undefined, now: Date): boolean {
  if (status === 'pending') return phase === 'today' || phase === 'late'
  if (status === 'missed' || !completedAt) return false
  return now.getTime() - new Date(completedAt).getTime() < QUEJA_HORAS_PLAZO * 3600_000
}

export interface ComplaintTarget {
  memberId: string | null
  status: ShiftStatus
  completedAt: string | null | undefined
}

/** Por qué no se puede reclamar por este turno; null si sí se puede */
export function complaintBlocker(t: ComplaintTarget, meId: string, now: Date): string | null {
  if (!t.memberId) return 'Ese turno no tenía a nadie asignado'
  if (t.memberId === meId) return 'No puedes reclamar por tu propio turno'
  if (t.status === 'missed') return 'Ese turno quedó sin hacer y ya se le restaron puntos'
  if (t.status === 'pending') return 'Ese turno todavía no se termina'
  if (t.completedAt && now.getTime() - new Date(t.completedAt).getTime() < DESHACER_MINUTOS * 60_000) {
    return 'Ese turno se acaba de terminar. Espera unos minutos para reclamar'
  }
  return null
}

/** ¿Quien recibió la queja todavía puede aceptarla o pedir revisión? */
export function canRespond(status: ComplaintStatus, createdAt: string, now: Date): boolean {
  return status === 'vigente' && now.getTime() - new Date(createdAt).getTime() < QUEJA_DIAS_RESPUESTA * 86_400_000
}

export interface ComplaintEntry {
  memberId: string // quien recibió la queja
  date: LocalDate // fecha del turno reclamado
  status: ComplaintStatus
}
