import { describe, expect, it } from 'vitest'
import { champions, compliance, monthPeriod, previousMonth, ranking, rewardProgress, rewardsCrossed, streak, weekPeriod, type LedgerEntry, type ShiftResult } from './ranking.ts'

const semana = weekPeriod('2026-11-16')

describe('períodos', () => {
  it('semana de lunes a domingo', () => expect(semana).toEqual({ from: '2026-11-16', to: '2026-11-22' }))
  it('mes completo, incluido diciembre', () => {
    expect(monthPeriod('2026-11-10')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthPeriod('2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthPeriod('2028-02-15')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('cumplimiento', () => {
  it('a tiempo 100 %, tarde 50 %, no hecho 0 %', () => {
    expect(compliance(['done', 'late_done', 'missed', 'done'])).toBe(63) // 2.5 / 4
  })
  it('los pendientes no cuentan', () => expect(compliance(['done', 'pending'])).toBe(100))
  it('sin turnos cerrados no hay porcentaje', () => expect(compliance([])).toBeNull())
})

describe('racha', () => {
  const r: ShiftResult[] = [
    { memberId: 'a', date: '2026-11-02', status: 'missed' },
    { memberId: 'a', date: '2026-11-09', status: 'done' },
    { memberId: 'a', date: '2026-11-16', status: 'done' },
    { memberId: 'a', date: '2026-11-23', status: 'pending' },
    { memberId: 'b', date: '2026-11-18', status: 'late_done' },
  ]
  it('cuenta los a tiempo seguidos hasta el último cerrado', () => expect(streak(r, 'a')).toBe(2))
  it('un turno tarde corta la racha', () => expect(streak(r, 'b')).toBe(0))
})

describe('ranking', () => {
  const ledger: LedgerEntry[] = [
    { memberId: 'martin', delta: 14, date: '2026-11-16' },
    { memberId: 'sofia', delta: 19, date: '2026-11-18' },
    { memberId: 'diego', delta: 7, date: '2026-11-20' }, // tarde
    { memberId: 'diego', delta: 7, date: '2026-11-13' }, // otra semana: no cuenta
    { memberId: 'alexandra', delta: -7, date: '2026-11-20' }, // no hecho
    { memberId: 'martin', delta: 5, date: '2026-11-23' }, // fuera de la semana
  ]
  const shifts: ShiftResult[] = [
    { memberId: 'martin', date: '2026-11-16', status: 'done' },
    { memberId: 'sofia', date: '2026-11-18', status: 'done' },
    { memberId: 'diego', date: '2026-11-20', status: 'late_done' },
    { memberId: 'alexandra', date: '2026-11-20', status: 'missed' },
  ]
  const rows = ranking(['martin', 'sofia', 'diego', 'alexandra'], ledger, shifts, semana)

  it('ordena por puntos del período', () => {
    expect(rows.map((r) => [r.memberId, r.points, r.position])).toEqual([
      ['sofia', 19, 1],
      ['martin', 14, 2],
      ['diego', 7, 3],
      ['alexandra', -7, 4],
    ])
  })
  it('cuenta hechos, tarde y no hechos', () => {
    const d = rows.find((r) => r.memberId === 'diego')!
    expect([d.done, d.late, d.missed, d.compliance]).toEqual([0, 1, 0, 50])
  })
  it('empate en puntos: desempata el cumplimiento; si sigue igual, comparten puesto', () => {
    const l: LedgerEntry[] = [
      { memberId: 'a', delta: 14, date: '2026-11-16' },
      { memberId: 'b', delta: 14, date: '2026-11-16' },
      { memberId: 'c', delta: 14, date: '2026-11-16' },
    ]
    const s: ShiftResult[] = [
      { memberId: 'a', date: '2026-11-16', status: 'done' },
      { memberId: 'b', date: '2026-11-16', status: 'done' },
      { memberId: 'c', date: '2026-11-16', status: 'done' },
      { memberId: 'c', date: '2026-11-18', status: 'missed' },
    ]
    const r = ranking(['c', 'a', 'b'], l, s, semana)
    expect(r.map((x) => [x.memberId, x.position])).toEqual([['a', 1], ['b', 1], ['c', 3]])
  })
  it('deshacer suma cero', () => {
    const l: LedgerEntry[] = [
      { memberId: 'a', delta: 14, date: '2026-11-16' },
      { memberId: 'a', delta: -14, date: '2026-11-16' },
    ]
    expect(ranking(['a'], l, [], semana)[0].points).toBe(0)
  })
})

describe('premios', () => {
  const premio = { id: 'p', name: 'Elegir la película', icon: '🎬', pointsNeeded: 40 }
  it('avance parcial', () => expect(rewardProgress(30, premio)).toEqual({ ratio: 0.75, earned: false, missing: 10 }))
  it('ganado', () => expect(rewardProgress(45, premio)).toEqual({ ratio: 1, earned: true, missing: 0 }))
  it('puntos negativos no dan avance negativo', () => expect(rewardProgress(-5, premio).ratio).toBe(0))
})

describe('campeones y premios alcanzados', () => {
  const row = (memberId: string, points: number, position: number) => ({ memberId, points, position, done: 0, late: 0, missed: 0, compliance: null, streak: 0 })
  it('primer lugar con puntos; empate da dos campeones', () => {
    expect(champions([row('a', 40, 1), row('b', 40, 1), row('c', 20, 3)]).map((r) => r.memberId)).toEqual(['a', 'b'])
  })
  it('nadie gana con 0 puntos', () => expect(champions([row('a', 0, 1), row('b', 0, 1)])).toEqual([]))
  const premios = [
    { id: 'p1', name: 'Helado', icon: '🍦', pointsNeeded: 20 },
    { id: 'p2', name: 'Película', icon: '🎬', pointsNeeded: 40 },
  ]
  it('detecta el premio que se cruzó con este turno', () => {
    expect(rewardsCrossed(14, 33, premios).map((p) => p.id)).toEqual(['p1'])
    expect(rewardsCrossed(33, 47, premios).map((p) => p.id)).toEqual(['p2'])
    expect(rewardsCrossed(0, 47, premios).map((p) => p.id)).toEqual(['p1', 'p2'])
  })
  it('si ya lo tenía, no se celebra de nuevo', () => expect(rewardsCrossed(45, 59, premios)).toEqual([]))
  it('mes anterior, incluido enero', () => {
    expect(previousMonth('2026-12-03')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(previousMonth('2027-01-02')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})
