// Edge Function: quitar fotos de respaldo.
// Acciones:
//   { action: 'remove', id }    -> quita una foto registrada (quien la subió en plazo, o un admin)
//   { action: 'discard', path } -> borra un archivo mío que quedó sin registrar (subida a medias)
// Los permisos los decide la base de datos (photo_removal_path / photo_discard_allowed),
// llamadas con la sesión de quien pide; el borrado lo hace el servidor.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const BUCKET = 'fotos-turnos'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const url = Deno.env.get('SUPABASE_URL')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: userData } = await admin.auth.getUser(token)
  if (!userData?.user) return json({ error: 'Debes iniciar sesión' }, 401)

  // Cliente con la sesión del usuario: así auth.uid() es quien pide
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const body = await req.json().catch(() => ({}))
  try {
    if (body.action === 'remove' && typeof body.id === 'string') {
      const { data: path, error } = await asUser.rpc('photo_removal_path', { p_id: body.id })
      if (error) return json({ error: error.message }, 400)
      const del = await admin.from('shift_photos').delete().eq('id', body.id)
      if (del.error) throw del.error
      await admin.storage.from(BUCKET).remove([path as string])
      return json({ ok: true })
    }

    if (body.action === 'discard' && typeof body.path === 'string') {
      const { data: ok, error } = await asUser.rpc('photo_discard_allowed', { p_path: body.path })
      if (error) return json({ error: error.message }, 400)
      if (ok) await admin.storage.from(BUCKET).remove([body.path])
      return json({ ok: !!ok })
    }

    return json({ error: 'Acción desconocida' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: 'Error interno' }, 500)
  }
})
