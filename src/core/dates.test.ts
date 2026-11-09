import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, endOfLocalDay, isoWeekday, localDateOf, localTimeOnDay, startOfLocalDay, weekDays, weekStart } from './dates.ts'

const TZ = 'America/Santiago'
const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000

describe('aritmética de fechas', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // bisiesto
  })
  it('cuenta días entre fechas', () => {
    expect(daysBetween('2026-11-16', '2026-11-23')).toBe(7)
    expect(daysBetween('2026-11-23', '2026-11-16')).toBe(-7)
  })
  it('día de la semana ISO (lunes = 1, domingo = 7)', () => {
    expect(isoWeekday('2026-11-16')).toBe(1)
    expect(isoWeekday('2026-11-18')).toBe(3)
    expect(isoWeekday('2026-11-22')).toBe(7)
  })
  it('la semana empieza el lunes', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16')
    expect(weekStart('2026-11-22')).toBe('2026-11-16') // domingo pertenece a la semana anterior
    expect(weekStart('2027-01-01')).toBe('2026-12-28')
    expect(weekDays('2026-11-16')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
  })
})

describe('zona horaria de Chile', () => {
  it('"hoy" depende de la hora de Chile, no de UTC', () => {
    // 02:00 UTC del 17 = 23:00 del 16 en Chile (verano, UTC-3)
    expect(localDateOf(new Date('2026-11-17T02:00:00Z'), TZ)).toBe('2026-11-16')
    expect(localDateOf(new Date('2026-11-17T03:00:00Z'), TZ)).toBe('2026-11-17')
    // invierno (UTC-4)
    expect(localDateOf(new Date('2026-07-01T03:30:00Z'), TZ)).toBe('2026-06-30')
  })

  it('un día normal dura 24 horas', () => {
    expect(hours(startOfLocalDay('2026-11-16', TZ), endOfLocalDay('2026-11-16', TZ))).toBe(24)
    expect(startOfLocalDay('2026-11-16', TZ).toISOString()).toBe('2026-11-16T03:00:00.000Z')
  })

  it('septiembre: se adelanta la hora y esa semana dura 167 horas', () => {
    // Chile adelanta el reloj el primer domingo de septiembre (6/9/2026): 00:00 pasa a 01:00
    expect(hours(startOfLocalDay('2026-09-06', TZ), endOfLocalDay('2026-09-06', TZ))).toBe(23)
    expect(hours(startOfLocalDay('2026-08-31', TZ), startOfLocalDay('2026-09-07', TZ))).toBe(167)
    // el día del cambio empieza a la 01:00 local, que sigue siendo ese día
    expect(localDateOf(startOfLocalDay('2026-09-06', TZ), TZ)).toBe('2026-09-06')
  })

  it('abril: se atrasa la hora y esa semana dura 169 horas', () => {
    // El primer domingo de abril (5/4/2026) el reloj vuelve de 00:00 a 23:00 del sábado
    expect(hours(startOfLocalDay('2026-03-30', TZ), startOfLocalDay('2026-04-06', TZ))).toBe(169)
    expect(hours(startOfLocalDay('2026-04-04', TZ), endOfLocalDay('2026-04-04', TZ))).toBe(25)
  })

  it('hora local de un recordatorio', () => {
    expect(localTimeOnDay('2026-11-16', '10:00', TZ).toISOString()).toBe('2026-11-16T13:00:00.000Z')
    expect(localTimeOnDay('2026-06-15', '21:00', TZ).toISOString()).toBe('2026-06-16T01:00:00.000Z')
    // el domingo del cambio de septiembre a las 20:00 ya es UTC-3
    expect(localTimeOnDay('2026-09-06', '20:00', TZ).toISOString()).toBe('2026-09-06T23:00:00.000Z')
  })
})
