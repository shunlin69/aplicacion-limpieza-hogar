// Edge Function: crear cuenta.
// Crea el usuario ya confirmado (sin correo de verificación). Así evitamos
// el límite de correos del plan gratuito de Supabase y que la familia
// quede esperando un email. Antes del lanzamiento público conviene volver
// a exigir verificación de correo con un proveedor SMTP propio.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let body: { email?: string; password?: string; displayName?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud inválida' }, 400)
  }
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const displayName = (body.displayName ?? '').trim()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'El correo no es válido' }, 400)
  if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
  if (displayName.length < 1 || displayName.length > 40) return json({ error: 'Escribe tu nombre (máximo 40 letras)' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (error) {
    const already = /already|registered|exists/i.test(error.message)
    return json({ error: already ? 'Ya existe una cuenta con ese correo' : 'No se pudo crear la cuenta' }, 400)
  }
  return json({ ok: true })
})
