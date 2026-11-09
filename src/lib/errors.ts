// Traduce errores técnicos a mensajes simples en español
export function mensajeError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos'
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa tu internet e intenta de nuevo'
  if (/JWT|session/i.test(msg)) return 'Tu sesión expiró. Vuelve a entrar'
  return msg || 'Algo salió mal'
}
