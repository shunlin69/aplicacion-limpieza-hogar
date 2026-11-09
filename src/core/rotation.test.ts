import { describe, expect, it } from 'vitest'
import { addDays, daysBetween } from './dates.ts'
import { planWeek, shuffle, slotsForWeek, weekIndexOf, type OpenDebt, type Participant, type TemplateForWeek } from './rotation.ts'

// Turnos reales: lunes 140, miércoles 190, viernes 140
const TEMPLATES: TemplateForWeek[] = [
  { templateId: 'lun', rule: { kind: 'weekly', weekdays: [1] }, weight: 140, sortOrder: 1 },
  { templateId: 'mie', rule: { kind: 'weekly', weekdays: [3] }, weight: 190, sortOrder: 2 },
  { templateId: 'vie', rule: { kind: 'weekly', weekdays: [5] }, weight: 140, sortOrder: 3 },
]
const START = '2026-11-16' // lunes
const people = (...ids: string[]): Participant[] => ids.map((memberId, order) => ({ memberId, order }))
const FAMILIA = people('martin', 'sofia', 'diego', 'alexandra')
const week = (k: number) => addDays(START, 7 * k)

/** Qué turno tiene cada persona en una semana ('descansa' si ninguno) */
function whoDoesWhat(plan: ReturnType<typeof planWeek>) {
  const out: Record<string, string> = {}
  for (const p of FAMILIA) out[p.memberId] = 'descansa'
  for (const a of plan.assignments) if (a.memberId) out[a.memberId] = a.templateId
  return out
}

describe('fórmula base con 4 personas y 3 turnos', () => {
  it('semana 1 coincide con la tabla del documento', () => {
    const plan = planWeek({ weekStart: START, rotationStart: START, participants: FAMILIA, templates: TEMPLATES })
    expect(whoDoesWhat(plan)).toEqual({ martin: 'lun', sofia: 'mie', diego: 'vie', alexandra: 'descansa' })
    expect(plan.resting).toEqual(['alexandra'])
  })

  it('en 4 semanas cada uno hace cada turno una vez y descansa una vez', () => {
    const counts: Record<string, Record<string, number>> = {}
    for (let k = 0; k < 4; k++) {
      const plan = planWeek({ weekStart: week(k), rotationStart: START, participants: FAMILIA, templates: TEMPLATES })
      for (const [who, what] of Object.entries(whoDoesWhat(plan))) {
        counts[who] ??= {}
        counts[who][what] = (counts[who][what] ?? 0) + 1
      }
    }
    for (const p of FAMILIA) expect(counts[p.memberId]).toEqual({ lun: 1, mie: 1, vie: 1, descansa: 1 })
  })

  it('en 4 semanas todos cargan exactamente lo mismo (470)', () => {
    const load: Record<string, number> = {}
    for (let k = 0; k < 4; k++) {
      for (const a of planWeek({ weekStart: week(k), rotationStart: START, participants: FAMILIA, templates: TEMPLATES }).assignments) {
        load[a.memberId!] = (load[a.memberId!] ?? 0) + a.weight
      }
    }
    expect(Object.values(load)).toEqual([470, 470, 470, 470])
  })

  it('nadie tiene dos turnos seguidos: hay al menos 9 días entre turnos', () => {
    const dates: Record<string, string[]> = {}
    for (let k = 0; k < 12; k++) {
      for (const a of planWeek({ weekStart: week(k), rotationStart: START, participants: FAMILIA, templates: TEMPLATES }).assignments) {
        ;(dates[a.memberId!] ??= []).push(a.date)
      }
    }
    for (const ds of Object.values(dates)) {
      for (let i = 1; i < ds.length; i++) expect(daysBetween(ds[i - 1], ds[i])).toBeGreaterThanOrEqual(9)
    }
  })

  it('el ciclo se repite cada 4 semanas', () => {
    const a = planWeek({ weekStart: week(1), rotationStart: START, participants: FAMILIA, templates: TEMPLATES })
    const b = planWeek({ weekStart: week(5), rotationStart: START, participants: FAMILIA, templates: TEMPLATES })
    expect(whoDoesWhat(a)).toEqual(whoDoesWhat(b))
  })

  it('número de semana desde el inicio', () => {
    expect(weekIndexOf(START, START)).toBe(0)
    expect(weekIndexOf('2026-11-23', START)).toBe(1)
    expect(weekIndexOf('2026-11-09', START)).toBe(-1)
  })
})

describe('semana no disponible (exámenes) y deudas', () => {
  it('lo cubre quien descansa y nace una deuda', () => {
    // Semana 1: Diego tiene viernes, Alexandra descansa
    const plan = planWeek({ weekStart: START, rotationStart: START, participants: FAMILIA, templates: TEMPLATES, unavailable: new Set(['diego']) })
    expect(whoDoesWhat(plan)).toEqual({ martin: 'lun', sofia: 'mie', diego: 'descansa', alexandra: 'vie' })
    const vie = plan.assignments.find((a) => a.templateId === 'vie')!
    expect(vie.reason).toBe('cubre_ausencia')
    expect(vie.originalMemberId).toBe('diego')
    expect(plan.newDebts).toEqual([{ debtorId: 'diego', creditorId: 'alexandra', templateId: 'vie', date: '2026-11-20' }])
  })

  it('la deuda se paga en la próxima semana de descanso del deudor', () => {
    const debt: OpenDebt = { id: 'd1', debtorId: 'diego', creditorId: 'alexandra' }
    // Semana 2 (k=1): Diego descansa por fórmula; Alexandra tiene lunes
    const plan = planWeek({ weekStart: week(1), rotationStart: START, participants: FAMILIA, templates: TEMPLATES, openDebts: [debt] })
    expect(whoDoesWhat(plan)).toEqual({ martin: 'mie', sofia: 'vie', diego: 'lun', alexandra: 'descansa' })
    expect(plan.settledDebts).toEqual([{ debtId: 'd1', templateId: 'lun', date: '2026-11-23' }])
    expect(plan.assignments.find((a) => a.templateId === 'lun')!.reason).toBe('pago_deuda')
  })

  it('la deuda espera si el deudor no descansa esa semana', () => {
    const debt: OpenDebt = { id: 'd1', debtorId: 'diego', creditorId: 'alexandra' }
    const plan = planWeek({ weekStart: START, rotationStart: START, participants: FAMILIA, templates: TEMPLATES, openDebts: [debt] })
    expect(plan.settledDebts).toEqual([])
    expect(whoDoesWhat(plan).diego).toBe('vie')
  })

  it('la deuda espera si el deudor tampoco está disponible', () => {
    const debt: OpenDebt = { id: 'd1', debtorId: 'diego', creditorId: 'alexandra' }
    const plan = planWeek({ weekStart: week(1), rotationStart: START, participants: FAMILIA, templates: TEMPLATES, openDebts: [debt], unavailable: new Set(['diego']) })
    expect(plan.settledDebts).toEqual([])
    expect(whoDoesWhat(plan)).toEqual({ martin: 'mie', sofia: 'vie', diego: 'descansa', alexandra: 'lun' })
  })

  it('con deuda pagada, el resto de la rotación no cambia', () => {
    const debt: OpenDebt = { id: 'd1', debtorId: 'diego', creditorId: 'alexandra' }
    const normal = whoDoesWhat(planWeek({ weekStart: week(1), rotationStart: START, participants: FAMILIA, templates: TEMPLATES }))
    const conDeuda = whoDoesWhat(planWeek({ weekStart: week(1), rotationStart: START, participants: FAMILIA, templates: TEMPLATES, openDebts: [debt] }))
    expect(conDeuda.martin).toBe(normal.martin)
    expect(conDeuda.sofia).toBe(normal.sofia)
    // y la semana siguiente vuelve a la fórmula normal
    const siguiente = planWeek({ weekStart: week(2), rotationStart: START, participants: FAMILIA, templates: TEMPLATES })
    expect(whoDoesWhat(siguiente)).toEqual({ martin: 'vie', sofia: 'descansa', diego: 'lun', alexandra: 'mie' })
  })

  it('dos personas no disponibles: una la cubre quien descansa, la otra quien tenga menos turnos', () => {
    const plan = planWeek({ weekStart: START, rotationStart: START, participants: FAMILIA, templates: TEMPLATES, unavailable: new Set(['martin', 'sofia']) })
    const ids = plan.assignments.map((a) => a.memberId)
    expect(ids).not.toContain('martin')
    expect(ids).not.toContain('sofia')
    expect(ids.every((id) => id !== null)).toBe(true)
    expect(plan.newDebts).toHaveLength(2)
    expect(plan.newDebts.map((d) => d.debtorId).sort()).toEqual(['martin', 'sofia'])
  })

  it('si nadie puede, el turno queda sin cubrir para que lo asigne un admin', () => {
    const plan = planWeek({ weekStart: START, rotationStart: START, participants: people('a'), templates: TEMPLATES.slice(0, 1), unavailable: new Set(['a']) })
    expect(plan.assignments[0].memberId).toBeNull()
    expect(plan.assignments[0].reason).toBe('sin_cubrir')
  })
})

describe('otras cantidades de personas', () => {
  it('5 personas: 2 descansan cada semana y en 5 semanas todos hacen cada turno una vez', () => {
    const five = people('a', 'b', 'c', 'd', 'e')
    const counts: Record<string, number> = {}
    for (let k = 0; k < 5; k++) {
      const plan = planWeek({ weekStart: week(k), rotationStart: START, participants: five, templates: TEMPLATES })
      expect(plan.resting).toHaveLength(2)
      for (const a of plan.assignments) counts[`${a.memberId}-${a.templateId}`] = (counts[`${a.memberId}-${a.templateId}`] ?? 0) + 1
    }
    expect(Object.values(counts).every((c) => c === 1)).toBe(true)
    expect(Object.keys(counts)).toHaveLength(15)
  })

  it('3 personas: nadie descansa y todos rotan', () => {
    const three = people('a', 'b', 'c')
    const plan = planWeek({ weekStart: START, rotationStart: START, participants: three, templates: TEMPLATES })
    expect(plan.resting).toEqual([])
    expect(new Set(plan.assignments.map((a) => a.memberId)).size).toBe(3)
  })

  it('2 personas y 3 turnos: el turno extra se alterna y la carga se equilibra', () => {
    const two = people('a', 'b')
    const load: Record<string, number> = { a: 0, b: 0 }
    for (let k = 0; k < 8; k++) {
      const plan = planWeek({ weekStart: week(k), rotationStart: START, participants: two, templates: TEMPLATES, loadHistory: { ...load } })
      expect(plan.assignments.every((a) => a.memberId)).toBe(true)
      for (const a of plan.assignments) load[a.memberId!] += a.weight
    }
    expect(Math.abs(load.a - load.b)).toBeLessThanOrEqual(190)
  })

  it('sin participantes no asigna nada', () => {
    const plan = planWeek({ weekStart: START, rotationStart: START, participants: [], templates: TEMPLATES })
    expect(plan.assignments.every((a) => a.memberId === null)).toBe(true)
  })
})

describe('turnos de la semana y sorteo', () => {
  it('ordena los turnos por fecha', () => {
    expect(slotsForWeek(START, [...TEMPLATES].reverse()).map((s) => s.date)).toEqual(['2026-11-16', '2026-11-18', '2026-11-20'])
  })
  it('el sorteo es una permutación de las mismas personas', () => {
    let seed = 42
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const r = shuffle(['a', 'b', 'c', 'd'], rnd)
    expect([...r].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})
