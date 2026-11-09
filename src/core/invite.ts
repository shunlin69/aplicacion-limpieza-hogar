// Lógica pura de los códigos de invitación (probada en invite.test.ts)

/** Alfabeto sin caracteres confusos: sin 0/O, 1/I/L. Debe coincidir con la base de datos. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const INVITE_LENGTH = 6

/**
 * Limpia lo que la persona escribió: mayúsculas, sin espacios ni guiones
 * y sin caracteres que no existen en los códigos.
 */
export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .split('')
    .filter((c) => INVITE_ALPHABET.includes(c))
    .join('')
    .slice(0, INVITE_LENGTH)
}

export const isValidInviteCode = (code: string) =>
  code.length === INVITE_LENGTH && [...code].every((c) => INVITE_ALPHABET.includes(c))

/** Enlace de invitación que abre directo la pantalla para unirse */
export const inviteLink = (baseUrl: string, code: string) => `${baseUrl.replace(/\/?$/, '/')}#/unirse/${code}`

/** Extrae el código si la persona pegó el enlace completo en vez del código */
export function codeFromInput(input: string): string {
  const m = input.match(/unirse\/([A-Za-z0-9-]+)/)
  return normalizeInviteCode(m ? m[1] : input)
}
