// Peso (carga) de un espacio o turno: dificultad × minutos.
// Los puntos de un turno = peso / 10 redondeado (Fase 5 usa esto mismo).

export interface SpaceEffort {
  difficulty: number // 1 a 3
  minutes: number
}

export const spaceWeight = (s: SpaceEffort) => s.difficulty * s.minutes

export const shiftWeight = (spaces: SpaceEffort[]) => spaces.reduce((sum, s) => sum + spaceWeight(s), 0)

export const shiftPoints = (spaces: SpaceEffort[]) => Math.round(shiftWeight(spaces) / 10)

export const shiftMinutes = (spaces: SpaceEffort[]) => spaces.reduce((sum, s) => sum + s.minutes, 0)
