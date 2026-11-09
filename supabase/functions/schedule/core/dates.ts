// COPIA AUTOMÁTICA de src/core/dates.ts (scripts/sync-core.sh). No editar aquí.
// =============================================================
// Fechas del hogar. Regla de oro: los días se manejan como texto
// 'YYYY-MM-DD' (fecha local del hogar, sin hora), y solo se pasa a
// un instante real (UTC) cuando hace falta comparar con "ahora".
// Así los cambios de horario de Chile no corren los días.
// =============================================================

export type LocalDate = string // 'YYYY-MM-DD'

/** Día ISO de la semana: 1 = lunes ... 7 = domingo */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAY_NAMES: Record<IsoWeekday, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
}

// Para aritmética de fechas sin zona usamos UTC a mediodía: nunca hay cambio de hora en UTC
const toUtcNoon = (d: LocalDate) => {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day, 12)
}
const fromUtc = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10)
const DAY_MS = 86_400_000

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromUtc(toUtcNoon(d) + n * DAY_MS)
}

/** Diferencia en días calendario (b - a) */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcNoon(b) - toUtcNoon(a)) / DAY_MS)
}

export function isoWeekday(d: LocalDate): IsoWeekday {
  const js = new Date(toUtcNoon(d)).getUTCDay() // 0 = domingo
  return (js === 0 ? 7 : js) as IsoWeekday
}

/** Lunes de la semana que contiene la fecha */
export function weekStart(d: LocalDate): LocalDate {
  return addDays(d, 1 - isoWeekday(d))
}

/** Los 7 días (lunes a domingo) de la semana que empieza en `monday` */
export function weekDays(monday: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Fecha local del hogar para un instante dado (ej: "hoy" en Chile) */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

/** Diferencia (en minutos) entre la hora local de la zona y UTC en ese instante */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - instant.getTime()) / 60_000)
}

/**
 * Instante en que COMIENZA un día local en la zona del hogar.
 * Ojo: en Chile el cambio de horario ocurre a medianoche, así que el día
 * del cambio puede empezar a la 01:00 (septiembre). Se maneja buscando el
 * primer instante cuya fecha local ya es ese día.
 */
export function startOfLocalDay(d: LocalDate, timeZone: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, day, 0, 0, 0)
  // Primera aproximación con el desfase de ese momento, y luego corrección
  let guess = naive - offsetMinutes(new Date(naive), timeZone) * 60_000
  guess = naive - offsetMinutes(new Date(guess), timeZone) * 60_000
  // Si la medianoche no existe (salto adelante), retrocede hasta el día anterior y avanza
  if (localDateOf(new Date(guess), timeZone) !== d) {
    while (localDateOf(new Date(guess), timeZone) !== d) guess += 60 * 60_000
  } else {
    // Si una hora antes ya era el mismo día (medianoche repetida), quedarse con la primera
    while (localDateOf(new Date(guess - 60 * 60_000), timeZone) === d) guess -= 60 * 60_000
  }
  return new Date(guess)
}

/** Instante en que TERMINA un día local (= comienzo del día siguiente) */
export function endOfLocalDay(d: LocalDate, timeZone: string): Date {
  return startOfLocalDay(addDays(d, 1), timeZone)
}

/**
 * Instante para una hora local ('HH:MM') de un día local, ej. el recordatorio
 * de las 10:00. Si esa hora no existe por el cambio de horario, usa la siguiente.
 */
export function localTimeOnDay(d: LocalDate, hhmm: string, timeZone: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, day, h, min)
  let guess = naive - offsetMinutes(new Date(naive), timeZone) * 60_000
  guess = naive - offsetMinutes(new Date(guess), timeZone) * 60_000
  return new Date(guess)
}
