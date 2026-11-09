// COPIA AUTOMÁTICA de src/core/recurrence.ts (scripts/sync-core.sh). No editar aquí.
// Cálculo de fechas según la frecuencia de un turno
import { addDays, daysBetween, isoWeekday, type IsoWeekday, type LocalDate } from './dates.ts'

export type Recurrence =
  | { kind: 'weekly'; weekdays: IsoWeekday[] } // ej: lunes, miércoles y viernes
  | { kind: 'every_n_days'; intervalDays: number; anchor: LocalDate } // ej: cada 3 días desde una fecha

/** ¿Este turno ocurre en esta fecha? */
export function occursOn(rule: Recurrence, d: LocalDate): boolean {
  if (rule.kind === 'weekly') return rule.weekdays.includes(isoWeekday(d))
  if (rule.intervalDays < 1) return false
  const diff = daysBetween(rule.anchor, d)
  return diff >= 0 && diff % rule.intervalDays === 0
}

/** Todas las fechas en que ocurre el turno entre `from` y `to` (ambas incluidas) */
export function occurrencesBetween(rule: Recurrence, from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  if (daysBetween(from, to) < 0) return out
  if (rule.kind === 'every_n_days' && rule.intervalDays >= 1) {
    // Salta directo a la primera ocurrencia en vez de revisar día por día
    const diff = daysBetween(rule.anchor, from)
    const first = diff <= 0 ? rule.anchor : addDays(from, (rule.intervalDays - (diff % rule.intervalDays)) % rule.intervalDays)
    for (let d = first; daysBetween(d, to) >= 0; d = addDays(d, rule.intervalDays)) out.push(d)
    return out
  }
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) if (occursOn(rule, d)) out.push(d)
  return out
}

/** Próxima fecha (desde `from`, incluida) en que ocurre el turno */
export function nextOccurrence(rule: Recurrence, from: LocalDate, maxDays = 400): LocalDate | null {
  const found = occurrencesBetween(rule, from, addDays(from, maxDays))
  return found[0] ?? null
}

/** Texto amigable: "Lunes, miércoles y viernes" o "Cada 3 días" */
export function describeRecurrence(rule: Recurrence, names: Record<IsoWeekday, string>): string {
  if (rule.kind === 'every_n_days') return rule.intervalDays === 1 ? 'Todos los días' : `Cada ${rule.intervalDays} días`
  const list = [...rule.weekdays].sort().map((w) => names[w])
  if (list.length === 7) return 'Todos los días'
  if (list.length <= 1) return list[0] ?? 'Sin días'
  const lower = list.map((n, i) => (i === 0 ? n : n.toLowerCase()))
  return `${lower.slice(0, -1).join(', ')} y ${lower[lower.length - 1]}`
}
