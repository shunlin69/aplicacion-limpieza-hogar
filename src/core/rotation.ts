// =============================================================
// Algoritmo de rotación justa (lógica pura, sin base de datos).
//
// Regla base: en la semana número k, la persona con orden i recibe la
// posición (i + k) módulo P, donde P = max(personas, turnos). Las
// posiciones 0..m-1 son los turnos de la semana en orden de fecha; las
// demás son descanso. Con 4 personas y 3 turnos (lun, mié, vie):
// cada uno hace cada turno una vez y descansa una vez cada 4 semanas.
//
// Excepciones (en este orden):
//   1. Pago de deudas: quien debe un turno y le toca descansar, hace el
//      turno de su acreedor, y el acreedor descansa.
//   2. No disponible: si alguien marcado como no disponible tiene turno,
//      lo cubre quien descansa (y nace una deuda a su favor).
// La rotación base nunca cambia por intercambios ni deudas: siempre se
// calcula desde la fórmula, así es predecible semanas antes.
// =============================================================
import { addDays, daysBetween, type LocalDate } from './dates.ts'
import { occurrencesBetween, type Recurrence } from './recurrence.ts'

export interface Participant {
  memberId: string
  order: number // posición en la rotación (sorteo)
}

export interface TemplateForWeek {
  templateId: string
  rule: Recurrence
  weight: number // dificultad × minutos de sus espacios
  sortOrder: number
}

/** Un turno concreto de la semana (un molde puede generar varios si se repite) */
export interface Slot {
  templateId: string
  date: LocalDate
  weight: number
}

export interface OpenDebt {
  id: string
  debtorId: string // quien debe el turno
  creditorId: string // quien lo cubrió
}

export type AssignmentReason = 'rotacion' | 'pago_deuda' | 'cubre_ausencia' | 'sin_cubrir' | 'carga_menor'

export interface Assignment extends Slot {
  memberId: string | null
  reason: AssignmentReason
  /** Si la persona original no pudo, a quién le tocaba por rotación */
  originalMemberId: string | null
}

export interface WeekPlan {
  weekStart: LocalDate
  weekIndex: number
  assignments: Assignment[]
  resting: string[]
  newDebts: { debtorId: string; creditorId: string; templateId: string; date: LocalDate }[]
  settledDebts: { debtId: string; templateId: string; date: LocalDate }[]
}

export interface PlanInput {
  weekStart: LocalDate // lunes de la semana
  rotationStart: LocalDate // lunes en que partió la rotación (semana 0)
  participants: Participant[]
  templates: TemplateForWeek[]
  unavailable?: Set<string> // memberIds no disponibles esta semana
  openDebts?: OpenDebt[] // deudas pendientes, de la más antigua a la más nueva
  /** Carga acumulada histórica por persona; solo desempata cuando hay más turnos que personas */
  loadHistory?: Record<string, number>
}

/** Número de semana desde el inicio de la rotación (puede ser negativo) */
export function weekIndexOf(weekStart: LocalDate, rotationStart: LocalDate): number {
  return Math.floor(daysBetween(rotationStart, weekStart) / 7)
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/** Turnos de la semana ordenados por fecha y luego por orden del molde */
export function slotsForWeek(weekStart: LocalDate, templates: TemplateForWeek[]): Slot[] {
  const end = addDays(weekStart, 6)
  const slots: (Slot & { sortOrder: number })[] = []
  for (const t of templates) {
    for (const date of occurrencesBetween(t.rule, weekStart, end)) {
      slots.push({ templateId: t.templateId, date, weight: t.weight, sortOrder: t.sortOrder })
    }
  }
  slots.sort((a, b) => (a.date === b.date ? a.sortOrder - b.sortOrder : a.date < b.date ? -1 : 1))
  return slots.map(({ templateId, date, weight }) => ({ templateId, date, weight }))
}

/** Reparto base de la fórmula, sin excepciones */
export function baseAssignment(slots: Slot[], participants: Participant[], weekIndex: number, loadHistory: Record<string, number> = {}): (string | null)[] {
  const people = [...participants].sort((a, b) => a.order - b.order)
  const n = people.length
  const m = slots.length
  const result: (string | null)[] = Array(m).fill(null)
  if (n === 0 || m === 0) return result

  const P = Math.max(n, m)
  people.forEach((p, i) => {
    const pos = mod(i + weekIndex, P)
    if (pos < m) result[pos] = p.memberId
  })

  // Más turnos que personas: los turnos sobrantes van a quien acumula menos carga
  if (n < m) {
    const load: Record<string, number> = {}
    for (const p of people) load[p.memberId] = loadHistory[p.memberId] ?? 0
    result.forEach((id, idx) => {
      if (id) load[id] += slots[idx].weight
    })
    result.forEach((id, idx) => {
      if (id) return
      const pick = [...people].sort((a, b) => load[a.memberId] - load[b.memberId] || mod(a.order - weekIndex, n) - mod(b.order - weekIndex, n))[0]
      result[idx] = pick.memberId
      load[pick.memberId] += slots[idx].weight
    })
  }
  return result
}

/** Plan completo de una semana, aplicando deudas y ausencias */
export function planWeek(input: PlanInput): WeekPlan {
  const { weekStart, rotationStart, participants, templates } = input
  const unavailable = input.unavailable ?? new Set<string>()
  const loadHistory = input.loadHistory ?? {}
  const weekIndex = weekIndexOf(weekStart, rotationStart)
  const slots = slotsForWeek(weekStart, templates)
  const base = baseAssignment(slots, participants, weekIndex, loadHistory)

  const assignments: Assignment[] = slots.map((s, i) => ({ ...s, memberId: base[i], reason: base[i] ? 'rotacion' : 'sin_cubrir', originalMemberId: null }))
  const newDebts: WeekPlan['newDebts'] = []
  const settledDebts: WeekPlan['settledDebts'] = []
  const orderOf = new Map(participants.map((p) => [p.memberId, p.order]))
  const hasShift = (id: string) => assignments.some((a) => a.memberId === id)
  const touched = new Set<string>() // personas ya movidas esta semana: una excepción por persona

  // 1. Pago de deudas (la más antigua primero)
  for (const debt of input.openDebts ?? []) {
    const { debtorId, creditorId } = debt
    if (!orderOf.has(debtorId) || !orderOf.has(creditorId)) continue
    if (touched.has(debtorId) || touched.has(creditorId)) continue
    if (unavailable.has(debtorId) || hasShift(debtorId)) continue
    const target = assignments.find((a) => a.memberId === creditorId)
    if (!target) continue
    target.originalMemberId = creditorId
    target.memberId = debtorId
    target.reason = 'pago_deuda'
    touched.add(debtorId).add(creditorId)
    settledDebts.push({ debtId: debt.id, templateId: target.templateId, date: target.date })
  }

  // 2. Personas no disponibles con turno: las cubre alguien que descansa
  for (const a of assignments) {
    const absent = a.memberId
    if (!absent || !unavailable.has(absent)) continue
    const candidates = participants
      .filter((p) => !unavailable.has(p.memberId) && p.memberId !== absent)
      .map((p) => ({
        id: p.memberId,
        shifts: assignments.filter((x) => x.memberId === p.memberId).length,
        touched: touched.has(p.memberId) ? 1 : 0,
        load: loadHistory[p.memberId] ?? 0,
        order: p.order,
      }))
      // Primero quien descansa, luego quien no ha sido movido, luego menor carga histórica
      .sort((x, y) => x.shifts - y.shifts || x.touched - y.touched || x.load - y.load || x.order - y.order)
    const cover = candidates[0]
    a.originalMemberId = absent
    if (!cover) {
      a.memberId = null
      a.reason = 'sin_cubrir'
      continue
    }
    a.memberId = cover.id
    a.reason = 'cubre_ausencia'
    touched.add(cover.id)
    newDebts.push({ debtorId: absent, creditorId: cover.id, templateId: a.templateId, date: a.date })
  }

  const resting = participants.map((p) => p.memberId).filter((id) => !hasShift(id))
  return { weekStart, weekIndex, assignments, resting, newDebts, settledDebts }
}

/** Mezcla Fisher-Yates con una fuente de azar inyectable (para poder probarla) */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
