import { describe, expect, it } from 'vitest'
import { shiftMinutes, shiftPoints, shiftWeight } from './effort'

const cocina = { difficulty: 3, minutes: 40 }
const bano = { difficulty: 3, minutes: 30 }
const living = { difficulty: 2, minutes: 25 }
const comedor = { difficulty: 1, minutes: 20 }

describe('peso de los turnos (valores propuestos)', () => {
  it('lunes y viernes: baño + living = 140 → 14 puntos', () => {
    expect(shiftWeight([bano, living])).toBe(140)
    expect(shiftPoints([bano, living])).toBe(14)
  })
  it('miércoles: living + comedor + cocina = 190 → 19 puntos', () => {
    expect(shiftWeight([living, comedor, cocina])).toBe(190)
    expect(shiftPoints([living, comedor, cocina])).toBe(19)
  })
  it('minutos estimados del turno', () => {
    expect(shiftMinutes([living, comedor, cocina])).toBe(85)
  })
  it('turno sin espacios no vale nada', () => {
    expect(shiftPoints([])).toBe(0)
  })
})
