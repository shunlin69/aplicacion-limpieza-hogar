import { describe, expect, it } from 'vitest'
import { canRespond, complaintBlocker, complaintPenalty, complaintWindowOpen, previousShifts, type ComplaintEntry } from './quejas.ts'
import { complaintsAgainst, ranking, weekPeriod } from './ranking.ts'

const ahora = new Date('2026-11-20T15:00:00Z')
const haceMin = (m: number) => new Date(ahora.getTime() - m * 60_000).toISOString()

describe('puntos de una queja', () => {
  it('resta la mitad del turno reclamado', () => {
    expect(complaintPenalty(14)).toBe(7)
    expect(complaintPenalty(19)).toBe(10) // redondea hacia arriba, igual que en SQL
  })
})

describe('turno anterior', () => {
  const turnos = [
    { id: 'lun', date: '2026-11-16' },
    { id: 'mie', date: '2026-11-18' },
    { id: 'vie', date: '2026-11-20' },
  ]
  it('es el último día con turno antes del mío', () => {
    expect(previousShifts(turnos, '2026-11-20').map((t) => t.id)).toEqual(['mie'])
    expect(previousShifts(turnos, '2026-11-18').map((t) => t.id)).toEqual(['lun'])
  })
  it('incluye todos los turnos de ese día', () => {
    expect(previousShifts([...turnos, { id: 'mie2', date: '2026-11-18' }], '2026-11-19').map((t) => t.id)).toEqual(['mie', 'mie2'])
  })
  it('si no hay turnos antes, no hay nada que reclamar', () => {
    expect(previousShifts(turnos, '2026-11-16')).toEqual([])
  })
})

describe('plazo para reclamar', () => {
  it('mientras mi turno está abierto (hoy o atrasado)', () => {
    expect(complaintWindowOpen('pending', 'today', null, ahora)).toBe(true)
    expect(complaintWindowOpen('pending', 'late', null, ahora)).toBe(true)
    expect(complaintWindowOpen('pending', 'upcoming', null, ahora)).toBe(false)
  })
  it('hasta 24 horas después de terminarlo', () => {
    expect(complaintWindowOpen('done', 'today', haceMin(60 * 23), ahora)).toBe(true)
    expect(complaintWindowOpen('late_done', 'expired', haceMin(60 * 25), ahora)).toBe(false)
  })
  it('nunca si mi turno quedó sin hacer', () => {
    expect(complaintWindowOpen('missed', 'expired', null, ahora)).toBe(false)
  })
})

describe('qué turnos se pueden reclamar', () => {
  it('uno terminado de otra persona', () => {
    expect(complaintBlocker({ memberId: 'ana', status: 'done', completedAt: haceMin(600) }, 'beto', ahora)).toBeNull()
    expect(complaintBlocker({ memberId: 'ana', status: 'late_done', completedAt: haceMin(600) }, 'beto', ahora)).toBeNull()
  })
  it('no el propio', () => {
    expect(complaintBlocker({ memberId: 'beto', status: 'done', completedAt: haceMin(600) }, 'beto', ahora)).toMatch(/propio/)
  })
  it('no uno sin hacer (ya restó puntos) ni uno pendiente', () => {
    expect(complaintBlocker({ memberId: 'ana', status: 'missed', completedAt: null }, 'beto', ahora)).toMatch(/sin hacer/)
    expect(complaintBlocker({ memberId: 'ana', status: 'pending', completedAt: null }, 'beto', ahora)).toMatch(/todavía/)
  })
  it('espera los 10 minutos en que se puede deshacer', () => {
    expect(complaintBlocker({ memberId: 'ana', status: 'done', completedAt: haceMin(5) }, 'beto', ahora)).toMatch(/acaba de terminar/)
  })
})

describe('responder una queja', () => {
  it('se puede aceptar o pedir revisión durante 3 días', () => {
    expect(canRespond('vigente', haceMin(60 * 24 * 2), ahora)).toBe(true)
    expect(canRespond('vigente', haceMin(60 * 24 * 3 + 1), ahora)).toBe(false)
  })
  it('solo una vez', () => {
    expect(canRespond('en_revision', haceMin(10), ahora)).toBe(false)
  })
})

describe('quejas en el ranking', () => {
  const quejas: ComplaintEntry[] = [
    { memberId: 'ana', date: '2026-11-18', status: 'vigente' },
    { memberId: 'ana', date: '2026-11-19', status: 'confirmada' },
    { memberId: 'ana', date: '2026-11-20', status: 'anulada' }, // devolvió los puntos: no cuenta
    { memberId: 'ana', date: '2026-11-11', status: 'confirmada' }, // otra semana
    { memberId: 'beto', date: '2026-11-18', status: 'en_revision' },
  ]
  it('cuenta las que siguen en pie, en la semana del turno', () => {
    expect(complaintsAgainst('ana', quejas, weekPeriod('2026-11-16'))).toBe(2)
    expect(complaintsAgainst('beto', quejas, weekPeriod('2026-11-16'))).toBe(1)
  })
  it('la tabla muestra cuántas recibió cada uno', () => {
    const rows = ranking(['ana', 'beto'], [], [], weekPeriod('2026-11-16'), quejas)
    expect(rows.find((r) => r.memberId === 'ana')?.complaints).toBe(2)
    expect(ranking(['ana'], [], [], weekPeriod('2026-11-16'))[0].complaints).toBe(0)
  })
})
