import { describe, expect, it } from 'vitest'
import { codeFromInput, inviteLink, isValidInviteCode, normalizeInviteCode } from './invite.ts'

describe('códigos de invitación', () => {
  it('normaliza minúsculas, espacios y guiones', () => {
    expect(normalizeInviteCode(' ab3-k7 m ')).toBe('AB3K7M')
  })
  it('descarta caracteres que no existen en el alfabeto y corta a 6', () => {
    expect(normalizeInviteCode('O0I1LAB3K7MX')).toBe('AB3K7M')
  })
  it('valida largo y alfabeto', () => {
    expect(isValidInviteCode('AB3K7M')).toBe(true)
    expect(isValidInviteCode('AB3K7')).toBe(false)
    expect(isValidInviteCode('AB3K7O')).toBe(false)
  })
  it('arma el enlace y lo vuelve a leer', () => {
    const link = inviteLink('https://ejemplo.cl/app', 'AB3K7M')
    expect(link).toBe('https://ejemplo.cl/app/#/unirse/AB3K7M')
    expect(codeFromInput(link)).toBe('AB3K7M')
    expect(codeFromInput('ab3k7m')).toBe('AB3K7M')
  })
})
