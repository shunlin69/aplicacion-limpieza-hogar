import { describe, expect, it } from 'vitest'
import { WEEKDAY_NAMES } from './dates'
import { describeRecurrence, nextOccurrence, occurrencesBetween, occursOn, type Recurrence } from './recurrence'

const lmv: Recurrence = { kind: 'weekly', weekdays: [1, 3, 5] }

describe('frecuencia semanal', () => {
  it('lunes, miércoles y viernes de una semana', () => {
    expect(occurrencesBetween(lmv, '2026-11-16', '2026-11-22')).toEqual(['2026-11-16', '2026-11-18', '2026-11-20'])
  })
  it('un turno solo de lunes ocurre una vez por semana', () => {
    const lunes: Recurrence = { kind: 'weekly', weekdays: [1] }
    expect(occurrencesBetween(lunes, '2026-11-16', '2026-12-13')).toEqual(['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07'])
  })
  it('próxima ocurrencia desde un jueves es el viernes', () => {
    expect(nextOccurrence(lmv, '2026-11-19')).toBe('2026-11-20')
    expect(nextOccurrence(lmv, '2026-11-21')).toBe('2026-11-23')
  })
  it('rango vacío o invertido', () => {
    expect(occurrencesBetween(lmv, '2026-11-22', '2026-11-16')).toEqual([])
    expect(occursOn({ kind: 'weekly', weekdays: [] }, '2026-11-16')).toBe(false)
  })
})

describe('cada X días', () => {
  const cada3: Recurrence = { kind: 'every_n_days', intervalDays: 3, anchor: '2026-11-16' }
  it('cuenta desde la fecha de inicio', () => {
    expect(occurrencesBetween(cada3, '2026-11-16', '2026-11-28')).toEqual(['2026-11-16', '2026-11-19', '2026-11-22', '2026-11-25', '2026-11-28'])
  })
  it('empezando a mitad de ciclo encuentra la siguiente', () => {
    expect(occurrencesBetween(cada3, '2026-11-17', '2026-11-23')).toEqual(['2026-11-19', '2026-11-22'])
  })
  it('no hay ocurrencias antes de la fecha de inicio', () => {
    expect(occurrencesBetween(cada3, '2026-11-10', '2026-11-17')).toEqual(['2026-11-16'])
    expect(occursOn(cada3, '2026-11-13')).toBe(false)
  })
  it('cruza el cambio de horario sin correrse', () => {
    const cada7: Recurrence = { kind: 'every_n_days', intervalDays: 7, anchor: '2026-08-31' }
    expect(occurrencesBetween(cada7, '2026-08-31', '2026-09-14')).toEqual(['2026-08-31', '2026-09-07', '2026-09-14'])
  })
})

describe('texto amigable', () => {
  it('describe frecuencias', () => {
    expect(describeRecurrence(lmv, WEEKDAY_NAMES)).toBe('Lunes, miércoles y viernes')
    expect(describeRecurrence({ kind: 'weekly', weekdays: [3] }, WEEKDAY_NAMES)).toBe('Miércoles')
    expect(describeRecurrence({ kind: 'every_n_days', intervalDays: 3, anchor: '2026-11-16' }, WEEKDAY_NAMES)).toBe('Cada 3 días')
  })
})
