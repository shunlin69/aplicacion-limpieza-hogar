import { describe, expect, it } from 'vitest'
import { completionOutcome, halfPoints, missedCutoff, missedPenalty, pointsForStatus, shiftPhase } from './completion.ts'
import type { Recurrence } from './recurrence.ts'

// Turnos de la casa: lunes, miércoles y viernes
const casa: Recurrence[] = [
  { kind: 'weekly', weekdays: [1] },
  { kind: 'weekly', weekdays: [3] },
  { kind: 'weekly', weekdays: [5] },
]
const LUN = '2026-11-16'
const MAR = '2026-11-17'
const MIE = '2026-11-18'
const VIE = '2026-11-20'
const SAB = '2026-11-21'
const DOM = '2026-11-22'
const LUN2 = '2026-11-23'

describe('mitad de puntos', () => {
  it('14 → 7 y 19 → 10 (el .5 sube)', () => {
    expect(halfPoints(14)).toBe(7)
    expect(halfPoints(19)).toBe(10)
  })
  it('no hecho resta la mitad', () => {
    expect(missedPenalty(14)).toBe(-7)
    expect(missedPenalty(19)).toBe(-10)
  })
})

describe('plazo: el siguiente turno de la casa', () => {
  it('lunes → miércoles', () => expect(missedCutoff(LUN, casa)).toBe(MIE))
  it('miércoles → viernes', () => expect(missedCutoff(MIE, casa)).toBe(VIE))
  it('viernes → lunes siguiente (cruza el fin de semana)', () => expect(missedCutoff(VIE, casa)).toBe(LUN2))
  it('un solo turno semanal → la semana siguiente', () => expect(missedCutoff(LUN, [{ kind: 'weekly', weekdays: [1] }])).toBe(LUN2))
  it('cada 2 días', () => expect(missedCutoff(LUN, [{ kind: 'every_n_days', intervalDays: 2, anchor: LUN }])).toBe(MIE))
  it('sin turnos → una semana', () => expect(missedCutoff(LUN, [])).toBe(LUN2))
})

describe('fase del turno', () => {
  it('antes, el día, atrasado y vencido', () => {
    expect(shiftPhase('2026-11-15', LUN, MIE)).toBe('upcoming')
    expect(shiftPhase(LUN, LUN, MIE)).toBe('today')
    expect(shiftPhase(MAR, LUN, MIE)).toBe('late')
    expect(shiftPhase(MIE, LUN, MIE)).toBe('expired')
  })
  it('viernes atrasado durante todo el fin de semana', () => {
    expect(shiftPhase(SAB, VIE, LUN2)).toBe('late')
    expect(shiftPhase(DOM, VIE, LUN2)).toBe('late')
    expect(shiftPhase(LUN2, VIE, LUN2)).toBe('expired')
  })
})

describe('marcar como hecho', () => {
  it('el mismo día: puntos completos', () => {
    expect(completionOutcome(LUN, LUN, MIE, 14)).toEqual({ ok: true, status: 'done', delta: 14 })
  })
  it('al día siguiente: la mitad', () => {
    expect(completionOutcome(MAR, LUN, MIE, 14)).toEqual({ ok: true, status: 'late_done', delta: 7 })
  })
  it('no se puede antes del día', () => {
    expect(completionOutcome('2026-11-15', LUN, MIE, 14).ok).toBe(false)
  })
  it('no se puede cuando ya llegó el siguiente turno', () => {
    expect(completionOutcome(MIE, LUN, MIE, 14).ok).toBe(false)
  })
})

describe('puntos por estado', () => {
  it('hecho, tarde, no hecho y pendiente', () => {
    expect(pointsForStatus('done', 19)).toBe(19)
    expect(pointsForStatus('late_done', 19)).toBe(10)
    expect(pointsForStatus('missed', 19)).toBe(-10)
    expect(pointsForStatus('pending', 19)).toBe(0)
  })
})
